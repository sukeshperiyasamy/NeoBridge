#include "ble_gatt.h"

#include <string.h>

#include "summary_log.h"

#include "esp_log.h"
#include "host/ble_hs.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"

static const char *TAG = "ble";

static const ble_uuid128_t uuid_service = BAND_UUID128(BAND_UUID_SERVICE);
static const ble_uuid128_t uuid_status = BAND_UUID128(BAND_UUID_STATUS);
static const ble_uuid128_t uuid_summary = BAND_UUID128(BAND_UUID_SUMMARY);
static const ble_uuid128_t uuid_alert = BAND_UUID128(BAND_UUID_ALERT);
static const ble_uuid128_t uuid_command = BAND_UUID128(BAND_UUID_COMMAND);
static const ble_uuid128_t uuid_reading = BAND_UUID128(BAND_UUID_READING);

static uint16_t conn_handle = BLE_HS_CONN_HANDLE_NONE;
static uint16_t status_handle;
static uint16_t alert_handle;
static uint16_t reading_handle;
static band_status_packet_t current_status = {
    .version = BAND_PROTOCOL_VERSION,
    .status = BAND_STATUS_GREY,
};
static uint32_t summary_cursor;

static int on_access(uint16_t conn, uint16_t attr, struct ble_gatt_access_ctxt *ctxt, void *arg) {
    const ble_uuid_t *uuid = ctxt->chr->uuid;

    if (ble_uuid_cmp(uuid, &uuid_status.u) == 0) {
        return os_mbuf_append(ctxt->om, &current_status, sizeof(current_status)) == 0
                   ? 0
                   : BLE_ATT_ERR_INSUFFICIENT_RES;
    }

    if (ble_uuid_cmp(uuid, &uuid_summary.u) == 0) {
        // One page from the phone's cursor; an empty value means it is up to date.
        band_summary_record_t page[BAND_SUMMARY_PAGE];
        size_t n = summary_log_read(summary_cursor, page, BAND_SUMMARY_PAGE);
        return os_mbuf_append(ctxt->om, page, n * sizeof(page[0])) == 0 ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
    }

    if (ble_uuid_cmp(uuid, &uuid_command.u) == 0) {
        uint8_t buf[8] = {0};
        uint16_t len = 0;
        if (ble_hs_mbuf_to_flat(ctxt->om, buf, sizeof(buf), &len) != 0 || len == 0) {
            return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
        }
        switch (buf[0]) {
        case CMD_SET_SUMMARY_CURSOR:
            if (len < 5) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
            memcpy(&summary_cursor, &buf[1], sizeof(summary_cursor));
            break;
        case CMD_TEST_BUZZ:
            band_on_test_buzz();
            break;
        case CMD_SET_TIME: {
            if (len < 5) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
            uint32_t t;
            memcpy(&t, &buf[1], sizeof(t));
            band_on_set_time(t);
            break;
        }
        case CMD_SET_STATUS:
            if (len < 2 || buf[1] > BAND_STATUS_GREY) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
            band_on_set_status((band_status_t)buf[1]);
            break;
        case CMD_ACK_RED:
            band_on_ack_red();
            break;
        case CMD_RECHECK:
        case CMD_REPORT_DANGER_SIGN:
            // TODO: hand to the band's own rules engine
            ESP_LOGI(TAG, "command 0x%02x", buf[0]);
            break;
        default:
            return BLE_ATT_ERR_UNLIKELY;
        }
        return 0;
    }

    return BLE_ATT_ERR_UNLIKELY;
}

static const struct ble_gatt_svc_def gatt_services[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &uuid_service.u,
        .characteristics =
            (struct ble_gatt_chr_def[]){
                {
                    .uuid = &uuid_status.u,
                    .access_cb = on_access,
                    .val_handle = &status_handle,
                    .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_READ_ENC | BLE_GATT_CHR_F_NOTIFY,
                },
                {
                    .uuid = &uuid_summary.u,
                    .access_cb = on_access,
                    .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_READ_ENC,
                },
                {
                    .uuid = &uuid_alert.u,
                    .access_cb = on_access,
                    .val_handle = &alert_handle,
                    .flags = BLE_GATT_CHR_F_NOTIFY,
                },
                {
                    .uuid = &uuid_reading.u,
                    .access_cb = on_access,
                    .val_handle = &reading_handle,
                    .flags = BLE_GATT_CHR_F_NOTIFY,
                },
                {
                    .uuid = &uuid_command.u,
                    .access_cb = on_access,
                    .flags = BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_WRITE_ENC,
                },
                {0},
            },
    },
    // TODO: Battery (0x180F), Device Information (0x180A), Current Time (0x1805)
    {0},
};

static void advertise(void);

static int on_gap_event(struct ble_gap_event *event, void *arg) {
    switch (event->type) {
    case BLE_GAP_EVENT_CONNECT:
        if (event->connect.status == 0) {
            conn_handle = event->connect.conn_handle;
        } else {
            advertise();
        }
        break;
    case BLE_GAP_EVENT_DISCONNECT:
        conn_handle = BLE_HS_CONN_HANDLE_NONE;
        advertise();
        break;
    case BLE_GAP_EVENT_ADV_COMPLETE:
        advertise();
        break;
    }
    return 0;
}

static void advertise(void) {
    struct ble_hs_adv_fields fields = {0};
    fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    fields.uuids128 = (ble_uuid128_t *)&uuid_service;
    fields.num_uuids128 = 1;
    fields.uuids128_is_complete = 1;
    ble_gap_adv_set_fields(&fields);

    struct ble_hs_adv_fields rsp = {0};
    const char *name = ble_svc_gap_device_name();
    rsp.name = (uint8_t *)name;
    rsp.name_len = strlen(name);
    rsp.name_is_complete = 1;
    ble_gap_adv_rsp_set_fields(&rsp);

    struct ble_gap_adv_params params = {
        .conn_mode = BLE_GAP_CONN_MODE_UND,
        .disc_mode = BLE_GAP_DISC_MODE_GEN,
    };
    ble_gap_adv_start(BLE_OWN_ADDR_PUBLIC, NULL, BLE_HS_FOREVER, &params, on_gap_event, NULL);
}

static void on_sync(void) { advertise(); }

static void host_task(void *param) {
    nimble_port_run();
    nimble_port_freertos_deinit();
}

void ble_gatt_start(void) {
    ESP_ERROR_CHECK(nimble_port_init());

    // Bonded, encrypted link: LE Secure Connections, no display or keyboard on the band
    ble_hs_cfg.sync_cb = on_sync;
    ble_hs_cfg.sm_bonding = 1;
    ble_hs_cfg.sm_sc = 1;
    ble_hs_cfg.sm_mitm = 0;
    ble_hs_cfg.sm_io_cap = BLE_SM_IO_CAP_NO_IO;
    ble_hs_cfg.sm_our_key_dist = BLE_SM_PAIR_KEY_DIST_ENC | BLE_SM_PAIR_KEY_DIST_ID;
    ble_hs_cfg.sm_their_key_dist = BLE_SM_PAIR_KEY_DIST_ENC | BLE_SM_PAIR_KEY_DIST_ID;

    ble_svc_gap_init();
    ble_svc_gatt_init();
    ESP_ERROR_CHECK(ble_gatts_count_cfg(gatt_services));
    ESP_ERROR_CHECK(ble_gatts_add_svcs(gatt_services));
    ble_svc_gap_device_name_set("NeoBridge Band");

    nimble_port_freertos_init(host_task);
}

void ble_gatt_set_status(const band_status_packet_t *status) {
    current_status = *status;
    if (conn_handle != BLE_HS_CONN_HANDLE_NONE) {
        struct os_mbuf *om = ble_hs_mbuf_from_flat(&current_status, sizeof(current_status));
        ble_gatts_notify_custom(conn_handle, status_handle, om);
    }
}

void ble_gatt_send_alert(const band_alert_event_t *alert) {
    if (conn_handle != BLE_HS_CONN_HANDLE_NONE) {
        struct os_mbuf *om = ble_hs_mbuf_from_flat(alert, sizeof(*alert));
        ble_gatts_notify_custom(conn_handle, alert_handle, om);
    }
}

void ble_gatt_send_reading(const band_live_reading_t *reading) {
    if (conn_handle != BLE_HS_CONN_HANDLE_NONE) {
        struct os_mbuf *om = ble_hs_mbuf_from_flat(reading, sizeof(*reading));
        ble_gatts_notify_custom(conn_handle, reading_handle, om);
    }
}
