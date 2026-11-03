#include <time.h>

#include "ble_gatt.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"

static const char *TAG = "band";

/*
 * The band runs the rules itself and works without the phone: it stores several
 * days of summaries in flash, buzzes and lights up, and the phone syncs when in
 * range. Still to build:
 *   - sensor drivers (skin + room temperature, contact, PPG heart rate)
 *   - rules engine: a reading must persist with good contact before the status
 *     changes; yellow re-checks after one hour; red never silences until acked
 *   - summary log in flash + buzzer / LED patterns per status
 * Cold and warm lines come from the calibration study, so keep them configurable.
 */
void app_main(void) {
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);

    ble_gatt_start();
    ESP_LOGI(TAG, "infant band started");

    for (;;) {
        // Placeholder loop: report grey ("no reading") until sensors are wired up.
        band_status_packet_t status = {
            .version = BAND_PROTOCOL_VERSION,
            .status = BAND_STATUS_GREY,
            .reason = REASON_NO_SKIN_CONTACT,
            .contact_pct = 0,
            .timestamp = (uint32_t)time(NULL),
        };
        ble_gatt_set_status(&status);
        vTaskDelay(pdMS_TO_TICKS(60 * 1000));
    }
}
