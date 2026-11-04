<p align="center">
  <img src="apps/web/public/neobridge-logo.png" alt="NeoBridge" width="360">
</p>

<p align="center">
  A wrist band that keeps watch over a newborn's warmth at home,<br>
  and tells the family, their ASHA worker and the doctor what to do next.
</p>

---

## About

Newborns, especially small or early babies, can lose heat quickly, and a cold
baby is one of the biggest risks in the first weeks at home. NeoBridge pairs a
soft wrist band with simple apps so that a problem is noticed early and the
right person is called.

- **The band** (ESP32) reads skin temperature, room temperature, heart rate and
  HRV, and decides the baby's status on its own — no phone or internet needed.
- **The mother's app** shows that status as a colour, a shape and a spoken
  sentence, and gives one clear next step. Families never see numbers.
- **The ASHA's app** lists her babies with the ones needing help first, and
  calls the family in one tap.
- **The doctor's view** shows trends, alerts and data quality for a referred baby.

## Four states, one next step each

| | State | What the family is told |
|---|---|---|
| 🟢 | **Green** — no problem found | Keep baby close and feed often |
| 🟡 | **Yellow** — warm and check | Skin to skin, cover the head, feed; the band checks again in an hour |
| 🔴 | **Red** — get help now | Call your ASHA now; if no answer, call 102 for free transport |
| ⚪ | **Grey** — fix the band | Fit it gently or charge it |

## Features

- Pair the band over Bluetooth; the phone stays paired and reconnects by itself
- "Fix the band" step-by-step troubleshooting
- Works offline: readings are saved on the phone and uploaded when internet returns
- Call buttons open the phone's dialer — ASHA, 102 ambulance, nearest hospital
- English and Hindi, switchable on every screen
- Three roles, three dashboards: mother, ASHA worker, doctor

## How it works

```
 Band (ESP32)  ──Bluetooth──▶  Phone app  ──mobile internet──▶  API  ──▶  Database
 senses & decides              saves first,                                Postgres (Neon)
                               uploads when online
```

## Tech stack

| Part | Built with |
|---|---|
| Mobile app (iOS & Android) | Expo · React Native |
| Website & doctor view | Next.js |
| API | Node · Hono |
| Database | Postgres (Neon) |
| Band firmware | ESP32 · ESP-IDF · Bluetooth LE |

## Project structure

```
apps/
  mobile/     iOS & Android app
  web/        website and dashboards
  api/        backend
firmware/     ESP32 band
packages/     shared code: Bluetooth protocol, design tokens, translations
```

## Getting started

Requires Node 20+ and pnpm.

```bash
pnpm install
pnpm dev:web      # website
pnpm dev:api      # API
pnpm dev:mobile   # mobile app
```

The mobile app uses Bluetooth, so it needs a development build rather than
Expo Go:

```bash
cd apps/mobile
npx expo run:android
```

## Demo logins

| Role | User ID | Password |
|---|---|---|
| Mother | `mother.demo` | `Mother@123` |
| ASHA worker | `asha.demo` | `Asha@123` |
| Doctor | `doctor.demo` | `Doctor@123` |

These are sample accounts for trying the app.

## Status

Early prototype. The band's temperature thresholds are placeholders until a
calibration study against a clinical thermometer. NeoBridge supports care
decisions; it does not diagnose.
