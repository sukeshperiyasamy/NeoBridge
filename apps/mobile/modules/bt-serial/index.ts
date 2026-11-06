import { requireOptionalNativeModule, type EventSubscription } from 'expo';

/**
 * Classic Bluetooth serial (SPP), Android only. Moves newline-terminated text
 * lines to and from a device such as an ESP32 running Arduino BluetoothSerial.
 * `BtSerial` is null on iOS, on the web and in Expo Go.
 */
export interface SerialDevice {
  address: string;
  name: string;
  rssi?: number | null;
}

interface BtSerialEvents {
  onDeviceFound(device: SerialDevice): void;
  onDiscoveryFinished(): void;
  onLine(event: { address: string; line: string }): void;
  onDisconnected(event: { address: string }): void;
}

interface BtSerialNative {
  isAvailable(): boolean;
  isEnabled(): boolean;
  bondedDevices(): SerialDevice[];
  startDiscovery(): boolean;
  cancelDiscovery(): void;
  connect(address: string): Promise<void>;
  write(address: string, text: string): Promise<void>;
  isConnected(address: string): boolean;
  disconnect(address: string): void;
  addListener<E extends keyof BtSerialEvents>(event: E, listener: BtSerialEvents[E]): EventSubscription;
}

export const BtSerial = requireOptionalNativeModule<BtSerialNative>('BtSerial');
