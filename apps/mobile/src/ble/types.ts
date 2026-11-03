import type { StatusPacket, SummaryRecord } from '@neobridge/ble-protocol';

export type BluetoothState = 'on' | 'off' | 'unauthorized' | 'unsupported' | 'unknown';

export interface FoundBand {
  id: string;
  name: string;
  /** signal strength, dBm; closer to 0 is nearer */
  rssi: number | null;
}

/**
 * What the app needs from Bluetooth. band-client.ts talks to the real band
 * through react-native-ble-plx; band-client.web.ts simulates one so the
 * screens can be tried in a browser.
 */
export interface BandTransport {
  bluetoothState(): Promise<BluetoothState>;
  /** Android 12+ runtime permissions. Resolves true when granted. */
  requestPermissions(): Promise<boolean>;
  /** Reports every band seen; returns a stop function. */
  scan(onFound: (band: FoundBand) => void, timeoutMs: number, onDone: () => void): () => void;
  connect(id: string): Promise<void>;
  isConnected(id: string): Promise<boolean>;
  onDisconnected(id: string, listener: () => void): () => void;
  onStatus(id: string, listener: (status: StatusPacket) => void): () => void;
  readStatus(id: string): Promise<StatusPacket>;
  /** 0–100 */
  readBattery(id: string): Promise<number>;
  /** One page of saved minute readings with seq >= fromSeq; empty when up to date. */
  readSummaries(id: string, fromSeq: number): Promise<SummaryRecord[]>;
  disconnect(id: string): Promise<void>;
}
