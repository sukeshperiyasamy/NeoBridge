import { BleManager, type Device, type Subscription } from 'react-native-ble-plx';

import {
  CommandCode,
  UUID,
  decodeStatus,
  encodeCommand,
  fromBase64,
  toBase64,
  type StatusPacket,
} from '@neobridge/ble-protocol';

/**
 * Thin wrapper over react-native-ble-plx for the infant band.
 *
 * Still to build on top of this: bonding during ASHA setup, reconnect with
 * backoff, summary catch-up after being offline, and writing to local SQLite.
 */
export class BandClient {
  private manager = new BleManager();
  private device: Device | null = null;
  private statusSub: Subscription | null = null;

  /** Finds the first band advertising the Infant Band service. */
  scan(onFound: (device: Device) => void, timeoutMs = 15_000): () => void {
    const timer = setTimeout(() => this.manager.stopDeviceScan(), timeoutMs);
    this.manager.startDeviceScan([UUID.service], null, (error, device) => {
      if (error || !device) return;
      this.manager.stopDeviceScan();
      clearTimeout(timer);
      onFound(device);
    });
    return () => {
      clearTimeout(timer);
      this.manager.stopDeviceScan();
    };
  }

  async connect(deviceId: string): Promise<void> {
    const device = await this.manager.connectToDevice(deviceId, { autoConnect: true });
    await device.discoverAllServicesAndCharacteristics();
    this.device = device;
  }

  async readStatus(): Promise<StatusPacket> {
    const c = await this.requireDevice().readCharacteristicForService(UUID.service, UUID.status);
    return decodeStatus(fromBase64(c.value ?? ''));
  }

  onStatus(listener: (status: StatusPacket) => void): void {
    this.statusSub?.remove();
    this.statusSub = this.requireDevice().monitorCharacteristicForService(
      UUID.service,
      UUID.status,
      (error, c) => {
        if (error || !c?.value) return;
        listener(decodeStatus(fromBase64(c.value)));
      },
    );
  }

  async send(code: CommandCode, arg?: number): Promise<void> {
    await this.requireDevice().writeCharacteristicWithResponseForService(
      UUID.service,
      UUID.command,
      toBase64(encodeCommand(code, arg)),
    );
  }

  async disconnect(): Promise<void> {
    this.statusSub?.remove();
    this.statusSub = null;
    if (this.device) await this.manager.cancelDeviceConnection(this.device.id);
    this.device = null;
  }

  private requireDevice(): Device {
    if (!this.device) throw new Error('Band not connected');
    return this.device;
  }
}
