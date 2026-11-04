import { PermissionsAndroid, Platform } from 'react-native';
import { BleManager, State } from 'react-native-ble-plx';

import {
  CommandCode,
  UUID,
  decodeReading,
  decodeStatus,
  decodeSummaryPage,
  encodeCommand,
  fromBase64,
  toBase64,
} from '@neobridge/ble-protocol';

import type { BandTransport, BluetoothState } from './types';

/**
 * Real band over react-native-ble-plx. Pairing (bonding) happens the first
 * time an encrypted characteristic is read: Android and iOS then show their
 * own "Pair with NeoBridge Band?" prompt.
 */
export function createBandClient(): BandTransport {
  const manager = new BleManager({ restoreStateIdentifier: 'neobridge-band' });
  const command = async (id: string, bytes: Uint8Array) => {
    await manager.writeCharacteristicWithResponseForDevice(id, UUID.service, UUID.command, toBase64(bytes));
  };

  return {
    async bluetoothState(): Promise<BluetoothState> {
      switch (await manager.state()) {
        case State.PoweredOn:
          return 'on';
        case State.PoweredOff:
          return 'off';
        case State.Unauthorized:
          return 'unauthorized';
        case State.Unsupported:
          return 'unsupported';
        default:
          return 'unknown';
      }
    },

    async requestPermissions() {
      if (Platform.OS !== 'android') return true;
      const P = PermissionsAndroid.PERMISSIONS;
      const wanted =
        Number(Platform.Version) >= 31
          ? [P.BLUETOOTH_SCAN, P.BLUETOOTH_CONNECT]
          : [P.ACCESS_FINE_LOCATION];
      const result = await PermissionsAndroid.requestMultiple(wanted);
      return wanted.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
    },

    scan(onFound, timeoutMs, onDone) {
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        clearTimeout(timer);
        manager.stopDeviceScan();
        onDone();
      };
      const timer = setTimeout(stop, timeoutMs);
      manager.startDeviceScan([UUID.service], { allowDuplicates: false }, (error, device) => {
        if (error) return stop();
        if (device) {
          onFound({
            id: device.id,
            name: device.localName ?? device.name ?? 'NeoBridge Band',
            rssi: device.rssi,
          });
        }
      });
      return stop;
    },

    async connect(id) {
      // autoConnect keeps a pending connection on Android, so the band links
      // back up by itself when it comes into range.
      // MTU 247 lets one read carry a full page of 12 summary records (240 bytes).
      const device = await manager.connectToDevice(id, {
        autoConnect: Platform.OS === 'android',
        requestMTU: 247,
      });
      await device.discoverAllServicesAndCharacteristics();
      // Reading the encrypted status characteristic triggers bonding.
      await manager.readCharacteristicForDevice(id, UUID.service, UUID.status);
    },

    isConnected: (id) => manager.isDeviceConnected(id),

    onDisconnected(id, listener) {
      const sub = manager.onDeviceDisconnected(id, () => listener());
      return () => sub.remove();
    },

    onStatus(id, listener) {
      const sub = manager.monitorCharacteristicForDevice(id, UUID.service, UUID.status, (error, c) => {
        if (!error && c?.value) listener(decodeStatus(fromBase64(c.value)));
      });
      return () => sub.remove();
    },

    async readStatus(id) {
      const c = await manager.readCharacteristicForDevice(id, UUID.service, UUID.status);
      return decodeStatus(fromBase64(c.value ?? ''));
    },

    async readBattery(id) {
      const c = await manager.readCharacteristicForDevice(id, UUID.batteryService, UUID.batteryLevel);
      return fromBase64(c.value ?? '')[0] ?? 0;
    },

    async readSummaries(id, fromSeq) {
      await command(id, encodeCommand(CommandCode.SetSummaryCursor, fromSeq));
      const c = await manager.readCharacteristicForDevice(id, UUID.service, UUID.summary);
      return decodeSummaryPage(fromBase64(c.value ?? ''));
    },

    onReading(id, listener) {
      const sub = manager.monitorCharacteristicForDevice(id, UUID.service, UUID.reading, (error, c) => {
        if (!error && c?.value) listener(decodeReading(fromBase64(c.value)));
      });
      return () => sub.remove();
    },

    testBuzz: (id) => command(id, encodeCommand(CommandCode.TestBuzz)),
    setTime: (id, t) => command(id, encodeCommand(CommandCode.SetTime, t)),
    setStatus: (id, s) => command(id, encodeCommand(CommandCode.SetStatus, s)),
    ackRed: (id) => command(id, encodeCommand(CommandCode.AcknowledgeRed)),

    async disconnect(id) {
      await manager.cancelDeviceConnection(id).catch(() => undefined);
    },
  };
}
