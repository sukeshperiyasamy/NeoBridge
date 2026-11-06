import { useSyncExternalStore } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { SerialCommand } from '@neobridge/ble-protocol';
import { color, radius } from '@neobridge/tokens';

import { isSerialBand, getSerialBand } from '@/ble/serial-band';
import { useBand } from '@/ble/use-band';
import { Body, Button, Card, H1, H2, Muted, Row, Screen, StatusChip, Strong } from '@/components/ui';
import { useSync } from '@/sync/use-sync';
import { useNow } from '@/use-now';

/**
 * Hardware bring-up for the ESP32 band sketch (Classic Bluetooth serial):
 * pair it, watch its live data, drive its alarm and check that its SD backlog
 * reaches the phone. A technician screen, in English only; reached from
 * Settings. Remove or hide it once the band ships.
 */
export default function BandTestScreen() {
  const [band, controller] = useBand();
  const serial = getSerialBand();
  const info = useSyncExternalStore(serial.subscribe, serial.getInfo);
  const [sync] = useSync();
  const now = useNow(1_000);

  const paired = band.paired;
  const isSerial = paired !== null && isSerialBand(paired.id);
  const connected = isSerial && band.phase === 'connected';
  const send = (command: string) => {
    if (paired) void serial.send(paired.id, command).catch(() => undefined);
  };
  const live = info.live;
  const age = info.liveAt ? Math.round((now - info.liveAt) / 1000) : null;

  return (
    <Screen back>
      <H1>Band test</H1>
      <Muted>ESP32 band over Classic Bluetooth (the &quot;De De Padosan Ko&quot; sketch).</Muted>

      {Platform.OS !== 'android' || !serial.available ? (
        <Card>
          <Strong>Classic Bluetooth isn&apos;t available here.</Strong>
          <Muted>Use the Android development build on a phone. The browser and Expo Go can&apos;t open a serial link.</Muted>
        </Card>
      ) : null}

      <Card>
        <H2>1 · Pair</H2>
        {paired ? (
          <>
            <Row style={styles.between}>
              <Strong>{paired.name}</Strong>
              <Muted>{band.phase}</Muted>
            </Row>
            <Muted>{paired.id}</Muted>
            {band.phase === 'reconnecting' && band.retryAt !== null && (
              <Muted>Retrying in {Math.max(0, Math.ceil((band.retryAt - now) / 1000))} s</Muted>
            )}
            {band.lastError && band.phase !== 'connected' && (
              <Muted style={styles.error}>Last error: {band.lastError}</Muted>
            )}
            {!isSerial && <Muted>This is not the serial band. Forget it to pair the ESP32.</Muted>}
            <Row>
              {band.phase !== 'connected' && (
                <Button kind="secondary" label="Reconnect" onPress={() => controller.reconnectNow()} style={styles.flex} />
              )}
              <Button kind="danger" label="Forget band" onPress={() => void controller.forget()} style={styles.flex} />
            </Row>
          </>
        ) : (
          <>
            <Muted>Switch the band on, then search. Paired bands show at once; new ones take up to 12 s.</Muted>
            <Button
              label={band.scanning ? 'Searching…' : 'Search for bands'}
              onPress={() => void controller.startScan()}
              busy={band.scanning && band.found.length === 0}
            />
            {band.found.map((b) => (
              <Pressable
                key={b.id}
                accessibilityRole="button"
                onPress={() => void controller.pair(b)}
                style={({ pressed }) => [styles.found, pressed && { opacity: 0.8 }]}>
                <Strong>{b.name}</Strong>
                <Muted>
                  {isSerialBand(b.id) ? 'Classic serial' : 'BLE'} · {b.id.replace('serial:', '')}
                  {b.rssi !== null ? ` · ${b.rssi} dBm` : ' · paired'}
                </Muted>
              </Pressable>
            ))}
            {!band.scanning && band.found.length === 0 && (
              <Muted>Nothing found yet. If Android asks to pair, accept it (PIN 1234 or 0000 if asked).</Muted>
            )}
          </>
        )}
      </Card>

      {isSerial && (
        <Card>
          <H2>2 · Live data</H2>
          {!live ? (
            <Muted>{connected ? 'Waiting for the first LIVE line…' : 'Not connected.'}</Muted>
          ) : (
            <>
              <Value
                label="Firmware"
                value={info.firmware ? `v${info.firmware.version} · ${info.firmware.name}` : 'v1 (no HELLO)'}
              />
              <Value label="Skin (NTC 1, GPIO 35)" value={temp(live.ntc1C)} big />
              <Value label="NTC 2 (GPIO 32)" value={temp(live.ntc2C)} />
              <Value
                label="Skin contact"
                value={live.contact === null ? 'not reported (v1)' : live.contact ? 'yes' : 'no'}
              />
              <Value label="Battery" value={live.batteryPct === null ? 'not measured' : `${live.batteryPct} %`} />
              <Value label="Heart rate (simulated)" value={live.heartRate === null ? '–' : `${live.heartRate} bpm`} />
              <Value label="SpO₂ (simulated)" value={live.spo2 === null ? '–' : `${live.spo2} %`} />
              <Value label="Band alarm" value={live.pattern ?? (live.alarm ? 'ALARM' : 'normal')} />
              <Value label="Band clock" value={live.unix === null ? 'not set' : new Date(live.unix * 1000).toLocaleTimeString()} />
              <Value label="Boot · uptime" value={`#${live.bootId} · ${Math.round(live.uptimeMs / 1000)} s`} />
              <Value label="Last line" value={age === null ? '–' : `${age} s ago`} />
            </>
          )}
          <Row style={styles.between}>
            <Muted>Status rules (phone)</Muted>
            <Row gap={8}>
              {band.rules.skinC !== null && <Body>{band.rules.skinC.toFixed(2)} °C</Body>}
              <StatusChip status={band.rules.status} small />
            </Row>
          </Row>
          <Muted>
            Rule {band.rules.rule} · {band.rules.reason}
            {band.demoMode ? ' · demo timings' : ''}
          </Muted>
        </Card>
      )}

      {isSerial && (
        <Card>
          <H2>3 · Commands</H2>
          <Row>
            <Button kind="secondary" label="STATUS" onPress={() => send(SerialCommand.status)} disabled={!connected} style={styles.flex} />
            <Button kind="secondary" label="Test buzz" onPress={() => void controller.testBuzz()} disabled={!connected} style={styles.flex} />
          </Row>
          <Row>
            <Button kind="danger" label="Alarm on" onPress={() => send(SerialCommand.alarmOn)} disabled={!connected} style={styles.flex} />
            <Button kind="secondary" label="Alarm off" onPress={() => send(SerialCommand.alarmOff)} disabled={!connected} style={styles.flex} />
          </Row>
          <Row>
            <Button kind="secondary" label="SIM HR 180" onPress={() => send(SerialCommand.simHeartRate(180))} disabled={!connected} style={styles.flex} />
            <Button kind="secondary" label="SIM RESET" onPress={() => send(SerialCommand.simReset)} disabled={!connected} style={styles.flex} />
          </Row>
          <Muted>The phone also turns the alarm on by itself when the rules go red, and off when it is acknowledged.</Muted>
        </Card>
      )}

      {isSerial && (
        <Card>
          <H2>4 · History</H2>
          <Value label="Live readings saved (1 per minute)" value={String(info.liveSaved)} />
          <Muted>
            While connected the phone keeps its own copy of the readings, so the band&apos;s SD backlog is only needed for
            time it was away from the phone.
          </Muted>
          <Button
            kind={info.historySync ? 'secondary' : 'primary'}
            label={info.historySync ? 'Stop SD history sync' : 'Sync SD history'}
            onPress={() => serial.setHistorySync(!info.historySync)}
            disabled={!connected}
          />
          <Muted>
            {info.firmware && info.firmware.version >= 2
              ? info.historySync
                ? 'Syncing. Firmware v2 clears each SD row instantly, so the band stays quick.'
                : 'Off.'
              : info.historySync
                ? info.historyPaused
                  ? 'Paused: the status is not green, so alarms reach the band first.'
                  : 'Syncing. v1 firmware answers commands slowly (about 7 s) while it clears each SD row.'
                : 'Off. The band answers commands at once.'}
          </Muted>
          <Value label="Rows still on the band" value={info.bandPending === null ? '–' : String(info.bandPending)} />
          <Value label="SD rows saved on the phone" value={String(info.saved)} />
          <Value label="Acknowledged, same minute" value={String(info.thinned)} />
          <Value label="Dropped, no clock for that power-on" value={String(info.noClock)} />
          <Value label="Waiting to upload to the server" value={String(sync.pending)} />
          <Row>
            <Button kind="secondary" label="SYNC_STATUS" onPress={() => send(SerialCommand.syncStatus)} disabled={!connected} style={styles.flex} />
            <Button kind="secondary" label="SYNC" onPress={() => send(SerialCommand.sync)} disabled={!connected} style={styles.flex} />
          </Row>
        </Card>
      )}

      {isSerial && (
        <Card>
          <H2>Raw lines</H2>
          <View style={styles.log}>
            {info.log.length === 0 ? (
              <Text style={styles.logText}>(nothing yet)</Text>
            ) : (
              info.log
                .slice(-30)
                .reverse()
                .map((l, i) => (
                  <Text key={`${l.at}-${i}`} style={[styles.logText, l.dir === 'out' && styles.logOut]} numberOfLines={2}>
                    {l.dir === 'out' ? '→ ' : '← '}
                    {l.text}
                  </Text>
                ))
            )}
          </View>
        </Card>
      )}
    </Screen>
  );
}

function temp(c: number | null) {
  return c === null ? 'no reading (NA)' : `${c.toFixed(2)} °C`;
}

function Value({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <Row style={styles.between}>
      <Muted style={styles.flex}>{label}</Muted>
      <Text style={big ? styles.big : styles.value}>{value}</Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between', alignItems: 'center' },
  flex: { flex: 1 },
  found: { padding: 12, borderRadius: radius.tile, backgroundColor: color.actionSoft, gap: 2 },
  value: { fontSize: 16, color: color.text, fontVariant: ['tabular-nums'] },
  big: { fontSize: 24, fontWeight: '700', color: color.text, fontVariant: ['tabular-nums'] },
  log: { backgroundColor: color.night, borderRadius: radius.tile, padding: 10, gap: 2 },
  logText: { color: '#d8f5d0', fontSize: 12, fontFamily: Platform.select({ android: 'monospace', default: 'Courier' }) },
  logOut: { color: '#ffd28a' },
  error: { color: '#a82820' },
});
