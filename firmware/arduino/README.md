# ESP32 band sketches (Classic Bluetooth) and the pairing test

Two versions of the hardware team's Arduino sketch live here. Both speak
**Classic Bluetooth serial** (`BluetoothSerial`) with text lines, not the
NeoBridge BLE service in `firmware/main`. The Android app supports both:
a band found by Classic Bluetooth is driven by
`apps/mobile/src/ble/serial-band.ts`, through the native module in
`apps/mobile/modules/bt-serial`. Android only. iPhones can't open Classic
serial links.

| | `neovital_band/` (v1) | `neovital_band_v2/` (v2) |
|---|---|---|
| Bluetooth name | `De De Padosan Ko` | `NeoBridge-XXXX` (end of the MAC) |
| SD row | every 2 s | once a minute |
| ACK | rewrites the whole pending file: about 7 s with 10 000 rows, the band freezes | moves a pointer in NVS: instant |
| Pending count | reads the whole file | worked out from IDs |
| Boot | reads both files to find the next ID | next ID in NVS |
| Time | none (boot + uptime only) | `TIME,<unix>` from the phone; rows and LIVE carry it |
| Alarm on the band itself | none (only when the phone sends `TEST ON`) | very cold or too warm for 2 min: siren; getting cold: motor pulse. Only when no phone is in charge |
| Status patterns | `TEST ON` / `TEST OFF` | `STATUS,GREEN/YELLOW/RED/GREY`, `SILENCE` (acknowledged red) |
| Skin contact | not reported | NTC 1 ≥ 30 °C, or 1.5 °C warmer than NTC 2 |
| Battery | not reported | when a divider is fitted (`BATTERY_PIN`) |
| NTC beta | one for both | one per sensor (`NTC1_BETA`, `NTC2_BETA`) |
| Commands from USB serial monitor | no | yes, same commands |

The app talks to either. With v2 it sets the band's clock, sends real status
patterns, uses battery and contact, and syncs the SD backlog all the time.
With v1 it keeps SD history sync off by default, because every v1 ACK freezes
the band (the Band test screen has a switch).

## Flashing v2

1. Arduino IDE 2, board package **esp32 by Espressif** (2.x or 3.x).
2. Board: **ESP32 Dev Module** (or your WROOM/WROVER board).
   Partition scheme: **Huge APP (3MB No OTA)**. Classic Bluetooth needs the space.
3. Open `neovital_band_v2/neovital_band_v2.ino` and check the settings at the top:
   - `NTC1_BETA` / `NTC2_BETA`: from the parts' datasheets.
   - `BATTERY_PIN`: an ADC1 pin with a divider from the battery, or `-1`.
   - `SIMULATE_VITALS`: `1` until the MAX30102 is fitted.
4. Upload, then open the serial monitor at 115200. Expect:
   `NEOVITAL ESP32 · v2`, `BLUETOOTH READY: NeoBridge-XXXX`, `SD CARD READY`.

**The first v2 boot migrates the SD card once:** `pending.csv` from v1 is
renamed `v1_pending.csv` and kept, IDs carry on from the highest v1 ID, and a
new `pending.csv` starts. The v1 backlog isn't sent to the phone: almost all
of it is from power-ons with no known time. Copy it off the card if you need it.

**After flashing, re-pair once:** the band's name changes to `NeoBridge-XXXX`.
In the app: Band → Forget band, then search again. In Android's Bluetooth
settings you can also forget "De De Padosan Ko".

To go back to v1, flash `neovital_band/neovital_band.ino`. It reads
`pending.csv` the v1 way again; IDs carry on.

## v2 protocol

New fields are added at the **end** of v1 lines, so the v1 parser still works.

| Band sends | Meaning |
|---|---|
| `HELLO,2,<name>,<simVitals 0/1>` | on connect |
| `LIVE,<boot>,<uptimeMs>,<hr>,<spo2>,<ntc1>,<ntc2>,<ALARM/NORMAL>,<unix/0>,<batt%/NA>,<contact 0/1>,<pattern>` | every 2 s. Pattern: `OFF`, `YELLOW`, `RED`, `SILENCED`, `TEST`, `LOCAL_YELLOW`, `LOCAL_RED` |
| `DATA,<id>,<boot>,<uptimeMs>,<hr>,<spo2>,<ntc1>,<ntc2>,<unix/0>` | one SD row; wait for `ACK,<id>` |
| `ACK_OK,<id>` · `PENDING_COUNT,<n>` · `TIME_OK` · `STATUS_OK,<s>` · `SILENCE_OK` · `PONG` | replies |
| `ALARM_STARTED` / `ALARM_STOPPED` | the siren changed |

| App sends | When |
|---|---|
| `TEST OFF`, `TIME,<unix>`, `STATUS,<s>` | on connect (after HELLO) |
| `STATUS,<GREEN/YELLOW/RED/GREY>` | the phone's rules change |
| `SILENCE` | someone acknowledged the red |
| `TEST ON` … `TEST OFF` | Test buzz (1.5 s); the band then goes back to the phone's pattern |
| `ACK,<id>` | after each SD row is saved on the phone |

**Who is in charge of the alarm:** the phone, from its first `STATUS,<s>`
after connecting until the link drops. Without a phone the band's own rules
decide (same lines as the app: below 34.5 °C or above 37.8 °C for 2 min is
red, below 35.5 °C for 2 min is yellow), and only when it reads skin contact.

## Build the app for the test

The serial module is native code, so Expo Go won't do. Use the development
build (`NeoBridge-dev.apk`, or `eas build --profile development --platform android`),
plug the phone in over USB and open the dev server (`apps/mobile/dev-qr.html`).

## Pairing test (about 15 minutes)

1. **Flash** a sketch and check the serial monitor (see above).
2. **Open the test screen.** Log in (for example `asha.demo` / `Asha@123`),
   go to Settings, then **Band test (ESP32)**. If a band is already paired,
   tap **Forget band**.
3. **Pair.** Tap **Search for bands**. The band shows as *Classic serial*
   (straight away if it's paired in Android's Bluetooth settings, otherwise
   within 12 s). Tap it, and accept Android's pairing prompt if it shows one.
   - Pass: the phase shows `connected`. With v2 the Firmware row shows `v2 · NeoBridge-XXXX`.
4. **Live data.** Within 2 s the Live data card fills in.
   - Pass: NTC 1 follows a finger on the sensor, and "Last line" stays under 3 s.
   - v2: Skin contact turns `yes` on skin; Band clock shows the phone's time.
5. **Alarm.** **Test buzz** sounds at once for 1.5 s.
6. **Red from the rules.** Cool NTC 1 below 34.5 °C (an ice pack in a bag)
   for 2 minutes. The app turns red and the band sirens. Acknowledge on the
   phone: the siren stops (v2 shows pattern `SILENCED`), and stays off after
   a reconnect.
7. **History.** v2: watch *SD rows saved on the phone* rise while connected;
   the band stays quick. v1: turn on *Sync SD history* only when needed.
8. **No phone (v2).** Switch Bluetooth off on the phone. Cool NTC 1 below
   34.5 °C on skin for 2 min: the band sirens by itself (`LOCAL_RED` in the
   serial monitor). Switch Bluetooth back on: the app reconnects and takes charge.
9. **Restart.** Power-cycle the band. The boot number goes up and the app
   reconnects by itself.

## Still open (hardware)

- **Heart rate and SpO2 are simulated** until the MAX30102 is fitted on GPIO
  21/22. The app shows them only on the test screen and never uploads them.
- **No Bluetooth PIN.** Pairing uses Android's "just works" prompt. Setting a
  PIN depends on the esp32 core version's BluetoothSerial; add it once the
  team fixes the core version.
- **Battery** needs a divider wired to an ADC1 pin.
- **Calibrate** each NTC against a reference thermometer (`NTCx_OFFSET_C`).
