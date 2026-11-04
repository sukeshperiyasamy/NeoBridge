#pragma once

#include "band_protocol.h"

void ble_gatt_start(void);

/** Update the status value and notify the phone if subscribed. */
void ble_gatt_set_status(const band_status_packet_t *status);

/** Notify the phone of a status change. */
void ble_gatt_send_alert(const band_alert_event_t *alert);

/** Notify the phone of a live reading (every 30 s). */
void ble_gatt_send_reading(const band_live_reading_t *reading);

/* Implemented by the application (main.c), called from the BLE task. */
void band_on_test_buzz(void);
void band_on_set_time(uint32_t unix_seconds);
void band_on_set_status(band_status_t status);
void band_on_ack_red(void);
