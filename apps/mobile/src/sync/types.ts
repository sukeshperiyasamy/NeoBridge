import type { SummaryRecord } from '@neobridge/ble-protocol';

/**
 * Readings kept on the phone until the server has them. Everything read from
 * the band lands here first, so nothing is lost without internet.
 */
export interface ReadingStore {
  /** Saves records; ones already stored are ignored. Returns how many were new. */
  add(bandId: string, records: SummaryRecord[]): Promise<number>;
  /** Next seq to ask the band for (one past the newest record read). */
  nextSeq(bandId: string): Promise<number>;
  /** Oldest not-yet-uploaded records for one band, or null when all are uploaded. */
  pendingBatch(limit: number): Promise<{ bandId: string; records: SummaryRecord[] } | null>;
  markUploaded(bandId: string, seqs: number[]): Promise<void>;
  pendingCount(): Promise<number>;
  /** Deletes uploaded records older than this many days, to keep the phone light. */
  prune(days: number): Promise<void>;
}
