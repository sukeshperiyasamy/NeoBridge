#pragma once

#include <stddef.h>
#include <stdint.h>

#include "band_protocol.h"

/*
 * Minute-by-minute readings, kept until the phone has read them. The phone
 * reads from its last cursor, so nothing is lost while it is away or offline.
 *
 * Holds 3 days in RAM for now. TODO: back it with a flash partition so a
 * reboot or flat battery doesn't lose unread readings.
 */
#define SUMMARY_LOG_CAPACITY (3 * 24 * 60)

void summary_log_init(void);

/** Stores a record, assigning the next sequence number. Returns that seq. */
uint32_t summary_log_append(band_summary_record_t record);

/**
 * Copies up to `max` records with seq >= from_seq, oldest first. If from_seq
 * has already been overwritten, starts at the oldest record still held.
 */
size_t summary_log_read(uint32_t from_seq, band_summary_record_t *out, size_t max);
