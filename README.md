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
| `apps/api` | Stores band uploads, trend data; alerts, SMS/push to come | Hono on Node, Postgres / Neon (`db/schema.sql`) |
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

## How band data reaches the database

```
Band (ESP32)  ─Bluetooth─▶  Phone storage (SQLite)  ─internet─▶  API  ─▶  Postgres (Neon)
keeps 3 days                 "waiting to upload"                  ignores
until read                   survives offline / restarts          duplicates
```

1. **Band → phone.** The band records one 20-byte reading a minute (skin and
   room temperature, contact, HR, HRV, signal quality, battery) and keeps it
   until the phone reads it. While connected, the phone reads every page since
   the last reading it has (`apps/mobile/src/ble/band-controller.ts`).
2. **Phone storage.** Readings are saved on the phone first and marked "not
   uploaded" (`apps/mobile/src/sync/store.ts`).
3. **Phone → server.** When the phone has internet it uploads waiting readings
   in batches of 200 and marks them uploaded once the server confirms. No
   internet or server down: they stay saved and retry after 5 s, 30 s, 2 min,
   then every 5 min, and immediately when the network returns
   (`apps/mobile/src/sync/sync-engine.ts`). The Band tab shows the status.
4. **Server.** `(band, seq)` is the key, so re-sent batches never duplicate.
   Trend data: `GET /v1/bands/:bandId/summaries?since=&until=`.

**Database.** Without `DATABASE_URL` the API runs a built-in local Postgres
(PGlite). For Neon, set `DATABASE_URL` in `apps/api/.env` and run
`pnpm --filter @neobridge/api db:push` once to create the tables.

**API address on the phone.** Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env`
(see `.env.example`). A phone on mobile data needs the API on a public https
address; `localhost` only works in the browser preview.

## Ground rules from the design

- The band decides the status (green, yellow, red, grey); the phone mirrors it.
- Caregivers never see numbers. Every status has a shape, colour, sound and spoken line.
- Red can never be silenced and must sound on a locked phone.
- Everything works offline; the phone uploads summaries, not raw sensor streams.
- Heart rate is trend only and never changes the family's status in version 1.
- Cold/warm lines are placeholders until the calibration study.
