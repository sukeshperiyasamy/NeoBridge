#pragma once

#include "band_protocol.h"

void ble_gatt_start(void);

/** Update the status value and notify the phone if subscribed. */
void ble_gatt_set_status(const band_status_packet_t *status);

/** Notify the phone of a status change. */
void ble_gatt_send_alert(const band_alert_event_t *alert);
