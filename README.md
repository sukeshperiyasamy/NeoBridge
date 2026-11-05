<p align="center">
  <img src="assets/brand/neobridge-logo.png" alt="NeoBridge" width="360">
</p>

<p align="center">
  A skin-to-skin baby carrier that keeps watch over a newborn's warmth at home,<br>
  and tells the family, their ASHA worker and the doctor what to do next.
</p>

<p align="center">
  <img src="assets/product/carrier-in-use.jpg" alt="Mother holding her newborn skin to skin in the NeoBridge carrier" width="720">
</p>

---

## About

Newborns, especially small or early babies, can lose heat quickly, and a cold
baby is one of the biggest risks in the first weeks at home. Skin-to-skin
contact keeps them warm. NeoBridge makes it easy and safe: a soft carrier holds
the baby against the mother's chest, and a small sensor on the strap watches
the baby so that a problem is noticed early and the right person is called.

- **The sensor** (ESP32) on the carrier strap reads skin temperature, room
  temperature, heart rate and HRV, and decides the baby's status on its own —
  no phone or internet needed. Its light shows the status at a glance.
- **The mother's app** shows that status as a colour, a shape and a spoken
  sentence, and gives one clear next step. Families never see numbers.
- **The ASHA's app** lists her babies with the ones needing help first, and
  calls the family in one tap.
- **The doctor's view** shows trends, alerts and data quality for a referred baby.

## The product

<table>
  <tr>
    <td align="center" width="50%">
      <a href="assets/video/carrier-in-use.mp4">
        <img src="assets/video/carrier-in-use.gif" alt="NeoBridge carrier in use" width="100%">
      </a>
      <br><sub>In use · <a href="assets/video/carrier-in-use.mp4">watch video</a></sub>
    </td>
    <td align="center" width="50%">
      <a href="assets/video/carrier-360.mp4">
        <img src="assets/video/carrier-360.gif" alt="NeoBridge carrier from every side" width="100%">
      </a>
      <br><sub>All around · <a href="assets/video/carrier-360.mp4">watch video</a></sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="assets/product/carrier-front.jpg" alt="NeoBridge carrier with the sensor on the strap" width="100%">
      <br><sub>Sensor clipped to the strap</sub>
    </td>
    <td align="center">
      <img src="assets/product/carrier-open.jpg" alt="NeoBridge carrier with the side zip open" width="100%">
      <br><sub>Side zip opens to place the baby</sub>
    </td>
  </tr>
</table>

## Four states, one next step each

| | State | What the family is told |
|---|---|---|
| 🟢 | **Green** — no problem found | Keep baby close and feed often |
| 🟡 | **Yellow** — warm and check | Skin to skin, cover the head, feed; the band checks again in an hour |
| 🔴 | **Red** — get help now | Call your ASHA now; if no answer, call 102 for free transport |
| ⚪ | **Grey** — fix the sensor | Fit it gently or charge it |

## Features

- Phone-number login with a one-time code; the role comes from the server
- Pair the sensor over Bluetooth; the phone stays paired and reconnects by itself
- Live status rules on the phone: green, yellow (warm and re-check), red, grey
- Red fills the screen with an alarm, reaches the ASHA within a minute (in-app
  alert, SMS from the mother's phone), and stays open until she closes it
- KMC sessions, a daily danger-sign check, reminders, baby's day and history
- ASHA: register mother and baby, automatic HBNC visit plan, visit form, referral, alerts
- Doctor: dashboards by specialisation, patient list, trends, alert log, advice notes
- Works offline: everything is saved on the phone and uploaded when internet returns
- A demo band runs the whole flow with no hardware nearby
- English and Hindi, switchable on every screen

## How it works

```
 Sensor (ESP32)  ──Bluetooth──▶  Phone app  ──mobile internet──▶  API  ──▶  Database
 senses & decides                saves first,                                Postgres (Neon)
                                 uploads when online
```

## Tech stack

| Part | Built with |
|---|---|
| Mobile app (iOS & Android) | Expo · React Native |
| Website & doctor view | Next.js |
| API | Node · Hono |
| Database | Postgres (Neon) |
| Sensor firmware | ESP32 · ESP-IDF · Bluetooth LE |

## Project structure

```
apps/
  mobile/     iOS & Android app
  web/        website and dashboards
  api/        backend
firmware/     ESP32 sensor
packages/     shared code: Bluetooth protocol, status rules, domain rules
              (visit plan, weight gain), design tokens, translations
assets/       logo, product photos and videos
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

Phones need to reach the API: set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env`
to the computer's LAN address (for example `http://192.168.1.20:8787`). The
API seeds demo data on start and, in demo mode, shows the login code in the app
instead of sending an SMS. `pnpm --filter @neobridge/api seed:reset` starts the
demo again from scratch.

## Demo logins (mobile app)

For the demo the app also accepts a user ID and password (until the full
integration; set `DEMO_LOGIN=0` on the API to turn it off):

| Role | User ID | Password |
|---|---|---|
| Mother | `mother.demo` | `Mother@123` |
| ASHA | `asha.demo` | `Asha@123` |
| Neonatologist | `doctor.demo` | `Doctor@123` |
| Obstetrician | `obstetrician.demo` | `Obs@123` |
| Medical officer | `mo.demo` | `Mo@123` |

Or log in with one of these numbers; the app shows the one-time code.

| Role | Phone |
|---|---|
| Mother (Reena, demo band) | `9000000011` |
| ASHA (Sunita) | `9000000001` |
| Neonatologist | `9000000002` |
| Obstetrician | `9000000003` |
| Medical officer | `9000000004` |

The website keeps its own sample logins (`mother.demo` / `Mother@123`,
`asha.demo` / `Asha@123`, `doctor.demo` / `Doctor@123`).

## Status

Early prototype. The sensor's temperature thresholds are placeholders until a
calibration study against a clinical thermometer. NeoBridge supports care
decisions; it does not diagnose.
