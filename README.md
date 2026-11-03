# NeoBridge

A wrist band (ESP32) that watches a newborn's warmth at home, plus apps for the
family, the ASHA and the doctor. Design: Figma "Infant Band App — Key Screens".
Logo: `IMG_2791.PNG` (icons and splash are generated from it).

## Demo logins

Shown on the login page of both the website and the mobile app. Each opens its
own dashboard. These are sample accounts only, with no real authentication behind
them (`packages/demo`).

| Person | ID | Password | Dashboard |
|---|---|---|---|
| Mother / family | `mother.demo` | `Mother@123` | `/mother` |
| ASHA worker | `asha.demo` | `Asha@123` | `/asha` |
| Doctor | `doctor.demo` | `Doctor@123` | `/doctor` |

## Layout

| Path | What | Stack |
|---|---|---|
| `apps/mobile` | Caregiver + ASHA app, iOS and Android | Expo SDK 58, Expo Router, react-native-ble-plx |
| `apps/web` | Website and clinician summary (also opened in a WebView from the ASHA app) | Next.js 16 |
| `apps/api` | Sync, alerts, SMS/push fan-out | Hono on Node, Postgres (`db/schema.sql`) |
| `firmware` | Band firmware | ESP-IDF + NimBLE |
| `packages/ble-protocol` | GATT UUIDs and packet codecs shared by apps and API | TypeScript |
| `packages/tokens` | Colours, type, sizes from Figma | TypeScript |
| `packages/i18n` | 8 languages + voice clip ids | TypeScript |
| `packages/demo` | Demo logins and sample babies/alerts | TypeScript |

`packages/ble-protocol/src/index.ts` and `firmware/main/band_protocol.h` define
the same Bluetooth contract. Change them together.

## Run

```bash
pnpm install
pnpm dev:web        # http://localhost:3000
pnpm dev:api        # http://localhost:8787/health
pnpm dev:mobile     # Expo dev server
pnpm typecheck
pnpm test
```

Bluetooth is a native module, so the mobile app does **not** run in Expo Go.
Build a development client once, then use `pnpm dev:mobile`:

```bash
cd apps/mobile
npx expo run:android            # needs Android Studio, or:
npx eas-cli@latest build --profile development --platform android
```

Firmware (needs ESP-IDF 5.x installed):

```bash
cd firmware
idf.py set-target esp32
idf.py build flash monitor
```

## Ground rules from the design

- The band decides the status (green, yellow, red, grey); the phone mirrors it.
- Caregivers never see numbers. Every status has a shape, colour, sound and spoken line.
- Red can never be silenced and must sound on a locked phone.
- Everything works offline; the phone uploads summaries, not raw sensor streams.
- Heart rate is trend only and never changes the family's status in version 1.
- Cold/warm lines are placeholders until the calibration study.
