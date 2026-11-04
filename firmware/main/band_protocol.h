// BLE contract with the apps. Keep in step with packages/ble-protocol/src/index.ts:
// UUIDs, enum values and packet layouts must match byte for byte (little-endian).
#pragma once

#include <stdint.h>

#define BAND_PROTOCOL_VERSION 2

// 6e1b00XX-8f3a-4c1e-9b2a-3d5f7a1c0b00, written in NimBLE's little-endian order
#define BAND_UUID128(xx)                                                       \
    BLE_UUID128_INIT(0x00, 0x0b, 0x1c, 0x7a, 0x5f, 0x3d, 0x2a, 0x9b, 0x1e,     \
                     0x4c, 0x3a, 0x8f, (xx), 0x00, 0x1b, 0x6e)

#define BAND_UUID_SERVICE 0x01
#define BAND_UUID_STATUS  0x02  // read + notify: band_status_packet_t
#define BAND_UUID_SUMMARY 0x03  // read: page of band_summary_record_t
#define BAND_UUID_ALERT   0x04  // notify: band_alert_event_t
#define BAND_UUID_COMMAND 0x05  // write: command byte + args
#define BAND_UUID_READING 0x06  // notify: band_live_reading_t every 30 s

typedef enum {
    BAND_STATUS_GREEN = 0,
    BAND_STATUS_YELLOW = 1,
    BAND_STATUS_RED = 2,
    BAND_STATUS_GREY = 3,
} band_status_t;

typedef enum {
    REASON_NONE = 0,
    REASON_COLD = 1,
    REASON_TOO_WARM = 2,
    REASON_STILL_COLD_AT_RECHECK = 3,
    REASON_VERY_COLD = 4,
    REASON_STILL_WARM_AFTER_COOLING = 5,
    REASON_LOOSE_BAND = 10,
    REASON_NO_SKIN_CONTACT = 11,
    REASON_POOR_SIGNAL = 12,
    REASON_LOW_BATTERY = 13,
} band_reason_t;

typedef enum {
    CMD_RECHECK = 0x01,
    CMD_ACK_RED = 0x02,
    CMD_SET_SUMMARY_CURSOR = 0x03,  // + u32 seq
    CMD_REPORT_DANGER_SIGN = 0x04,  // + u8 sign id
    CMD_TEST_BUZZ = 0x05,
    CMD_SET_TIME = 0x06,            // + u32 unix seconds
    CMD_SET_STATUS = 0x07,          // + u8 band_status_t: play that status's pattern
} band_command_t;

// bits in band_live_reading_t.flags and band_summary_record_t.flags
#define READING_FLAG_SENSOR_ERROR (1 << 0)
#define READING_FLAG_NO_CONTACT   (1 << 1)

// "No reading" in i16 centi-degree fields
#define BAND_NO_TEMP INT16_MIN

typedef struct __attribute__((packed)) {
    uint8_t version;
    uint8_t status;       // band_status_t
    uint8_t reason;       // band_reason_t
    uint8_t contact_pct;  // 0-100
    uint32_t timestamp;   // unix seconds
} band_status_packet_t;   // 8 bytes

typedef struct __attribute__((packed)) {
    uint32_t timestamp;
    int16_t skin_centi_c;
    int16_t room_centi_c;
    uint8_t contact_pct;
    uint8_t status;
    uint8_t heart_rate_bpm;  // 0 = no usable signal; trend only
    uint8_t flags;
    uint32_t seq;
    uint16_t hrv_rmssd_ms;   // 0 = no usable signal; trend only
    uint8_t hr_quality;      // 0-100
    uint8_t battery_pct;     // 0-100
} band_summary_record_t;     // 20 bytes, one per minute

// Records per summary read. 12 x 20 = 240 bytes fits one read at MTU 247.
#define BAND_SUMMARY_PAGE 12

// Raw skin temperature, before the calibration offset the phone applies.
typedef struct __attribute__((packed)) {
    uint32_t timestamp;
    int16_t skin_centi_c;
    int16_t room_centi_c;
    uint8_t contact_pct;
    uint8_t heart_rate_bpm;  // 0 = no usable signal
    uint8_t battery_pct;
    uint8_t flags;
} band_live_reading_t;  // 12 bytes

typedef struct __attribute__((packed)) {
    uint32_t seq;
    uint32_t timestamp;
    uint8_t from;
    uint8_t to;
    uint8_t reason;
    uint8_t _reserved;
} band_alert_event_t;  // 12 bytes

_Static_assert(sizeof(band_status_packet_t) == 8, "status packet size");
_Static_assert(sizeof(band_summary_record_t) == 20, "summary record size");
_Static_assert(sizeof(band_alert_event_t) == 12, "alert event size");
_Static_assert(sizeof(band_live_reading_t) == 12, "live reading size");
