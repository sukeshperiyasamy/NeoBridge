#include <stdbool.h>
#include <sys/time.h>
#include <time.h>

#include "ble_gatt.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "summary_log.h"

static const char *TAG = "band";

/*
 * The band streams a live reading every 30 s; the phone runs the status rules
 * and tells the band which pattern to play. The band also keeps a minute log
 * so nothing is lost while the phone is away. Still to build:
 *   - sensor drivers (skin + room temperature, contact, PPG heart rate)
 *   - the band's own copy of the red temperature rules, so it buzzes even
 *     when the phone is in another room
 *   - vibration motor and LED patterns (see band_play below)
 * Cold and warm lines come from the calibration study, so keep them configurable.
 */

#define READING_PERIOD_MS (30 * 1000)

static band_status_t current_pattern = BAND_STATUS_GREY;
static bool red_acknowledged;

// TODO: drive the vibration motor / LED. Patterns from the PRD rules table:
// green silent · yellow two buzzes when it starts · red continuous until
// acknowledged · grey two short buzzes.
static void band_play(band_status_t status) {
    ESP_LOGI(TAG, "pattern %d%s", status, red_acknowledged ? " (red acknowledged)" : "");
}

void band_on_test_buzz(void) { ESP_LOGI(TAG, "test buzz"); }

void band_on_set_time(uint32_t unix_seconds) {
    struct timeval tv = {.tv_sec = unix_seconds};
    settimeofday(&tv, NULL);
    ESP_LOGI(TAG, "clock set to %lu", (unsigned long)unix_seconds);
}

void band_on_set_status(band_status_t status) {
    if (status != BAND_STATUS_RED) red_acknowledged = false;
    if (status != current_pattern) {
        current_pattern = status;
        band_play(status);
    }
}

void band_on_ack_red(void) {
    red_acknowledged = true;  // stops the buzzing; the phone keeps the red screen
    band_play(current_pattern);
}

void app_main(void) {
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);

    summary_log_init();
    ble_gatt_start();
    ESP_LOGI(TAG, "neobridge band started");

    for (uint32_t tick = 0;; tick++) {
        uint32_t now = (uint32_t)time(NULL);

        // Placeholder values: "no reading" until the sensors are wired up.
        band_live_reading_t reading = {
            .timestamp = now,
            .skin_centi_c = BAND_NO_TEMP,
            .room_centi_c = BAND_NO_TEMP,
            .contact_pct = 0,
            .heart_rate_bpm = 0,
            .battery_pct = 0,
            .flags = READING_FLAG_NO_CONTACT,
        };
        ble_gatt_send_reading(&reading);

        band_status_packet_t status = {
            .version = BAND_PROTOCOL_VERSION,
            .status = current_pattern,
            .reason = REASON_NO_SKIN_CONTACT,
            .contact_pct = reading.contact_pct,
            .timestamp = now,
        };
        ble_gatt_set_status(&status);

        // One summary per minute (every second reading). TODO: fill from the
        // minute's sensor window, PPG heart rate + RMSSD and the fuel gauge.
        if (tick % 2 == 1) {
            band_summary_record_t minute = {
                .timestamp = now,
                .skin_centi_c = reading.skin_centi_c,
                .room_centi_c = reading.room_centi_c,
                .contact_pct = reading.contact_pct,
                .status = current_pattern,
                .heart_rate_bpm = reading.heart_rate_bpm,
                .flags = reading.flags,
                .hrv_rmssd_ms = 0,
                .hr_quality = 0,
                .battery_pct = reading.battery_pct,
            };
            summary_log_append(minute);
        }

        vTaskDelay(pdMS_TO_TICKS(READING_PERIOD_MS));
    }
}
