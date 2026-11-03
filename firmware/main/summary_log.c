#include "summary_log.h"

#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

// Written by the sensor loop, read by the BLE host task.
static band_summary_record_t ring[SUMMARY_LOG_CAPACITY];
static uint32_t next_seq = 1;  // seq of the next record to be written
static size_t count;           // records currently held
static SemaphoreHandle_t lock;

void summary_log_init(void) { lock = xSemaphoreCreateMutex(); }

uint32_t summary_log_append(band_summary_record_t record) {
    xSemaphoreTake(lock, portMAX_DELAY);
    record.seq = next_seq++;
    ring[record.seq % SUMMARY_LOG_CAPACITY] = record;
    if (count < SUMMARY_LOG_CAPACITY) count++;
    uint32_t seq = record.seq;
    xSemaphoreGive(lock);
    return seq;
}

size_t summary_log_read(uint32_t from_seq, band_summary_record_t *out, size_t max) {
    xSemaphoreTake(lock, portMAX_DELAY);
    uint32_t oldest = next_seq - count;
    if (from_seq < oldest) from_seq = oldest;
    size_t n = 0;
    for (uint32_t seq = from_seq; seq < next_seq && n < max; seq++) {
        out[n++] = ring[seq % SUMMARY_LOG_CAPACITY];
    }
    xSemaphoreGive(lock);
    return n;
}
