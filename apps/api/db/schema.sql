-- Postgres schema v2 (Neon in production, PGlite locally). Every statement is
-- IF NOT EXISTS, so it is safe to run again. db.ts drops the v1 tables once
-- (they had a different shape) before applying this.

create table if not exists meta (
  key   text primary key,
  value text not null
);

create table if not exists facilities (
  id     text primary key,
  name   text not null,
  level  text not null,                 -- SNCU | NICU | DH | CHC | PHC
  phone  text
);

create table if not exists villages (
  id           text primary key,
  name         text not null,
  name_hi      text not null,
  facility_id  text references facilities(id)   -- the PHC it belongs to
);

-- Everyone who logs in. Nobody picks a role: staff are seeded / created by an
-- admin, mothers by their ASHA.
create table if not exists users (
  id              uuid primary key default gen_random_uuid(),
  phone           text not null unique,          -- 10 digits, no +91
  role            text not null,                 -- mother | asha | doctor | admin
  name            text not null,
  language        text not null default 'hi',
  specialisation  text,                          -- doctors: neonatology | paediatrics | obstetrics | general
  facility_id     text references facilities(id),
  created_at      timestamptz not null default now()
);

create table if not exists asha_villages (
  asha_id     uuid not null references users(id),
  village_id  text not null references villages(id),
  primary key (asha_id, village_id)
);

create table if not exists otp_codes (
  phone       text primary key,
  code        text not null,
  expires_at  timestamptz not null,
  attempts    smallint not null default 0,
  sent_at     timestamptz not null default now()
);

create table if not exists sessions (
  token       text primary key,
  user_id     uuid not null references users(id),
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

create table if not exists mothers (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references users(id),
  asha_id               uuid not null references users(id),
  name                  text not null,
  age                   smallint not null,
  village_id            text references villages(id),
  family_phone          text,
  delivery_place        text not null,           -- home | facility
  delivery_facility_id  text references facilities(id),
  delivery_date         date not null,
  mcp_number            text,
  language              text not null default 'hi',
  consent_at            timestamptz,
  consent_witness_id    uuid references users(id),
  created_at            timestamptz not null default now()
);

create table if not exists babies (
  id                  uuid primary key default gen_random_uuid(),
  mother_id           uuid not null references mothers(id),
  name                text not null,
  sex                 text not null,
  born_at             timestamptz not null,
  birth_weight_g      integer not null,
  gestation_weeks     smallint not null,
  sncu_admitted       boolean not null default false,
  discharge_date      date,
  discharge_weight_g  integer,
  facility_id         text references facilities(id),   -- doctors at this facility see the baby
  band_id             text,
  status              text not null default 'grey',
  status_reason       text,
  status_since        timestamptz,
  last_sync_at        timestamptz,
  created_at          timestamptz not null default now()
);

create table if not exists bands (
  id                    text primary key,       -- BLE device id / serial
  serial                text,
  baby_id               uuid references babies(id),
  calibration_offset_c  numeric(4,2) not null default 0,
  firmware              text,
  rules_ver             text,
  paired_at             timestamptz,
  last_upload           timestamptz
);

-- One row per minute from the band (packages/ble-protocol SummaryRecord).
-- (band_id, seq) is the key, so a re-sent batch never duplicates.
create table if not exists band_summaries (
  band_id       text not null references bands(id),
  seq           bigint not null,
  recorded_at   timestamptz not null,
  skin_temp_c   numeric(4,2),
  room_temp_c   numeric(4,2),
  contact_pct   smallint not null,
  heart_rate    smallint,
  hrv_rmssd_ms  smallint,
  hr_quality    smallint not null default 0,
  battery_pct   smallint,
  status        smallint not null,          -- 0 green, 1 yellow, 2 red, 3 grey
  received_at   timestamptz not null default now(),
  primary key (band_id, seq)
);
create index if not exists band_summaries_time on band_summaries (band_id, recorded_at);

-- Every status the mother's phone reported, for the day strip and chart shading.
create table if not exists status_changes (
  baby_id  uuid not null references babies(id),
  at       timestamptz not null,
  status   text not null,
  reason   text,
  primary key (baby_id, at)
);

-- Red (and yellow) episodes. The id comes from the mother's phone (rules
-- engine), so re-sending is idempotent.
create table if not exists episodes (
  id                  text primary key,
  baby_id             uuid not null references babies(id),
  kind                text not null,           -- red | yellow
  trigger             text not null,           -- dangerSign | veryCold | tooWarm | stillCold | gettingCold
  started_at          timestamptz not null,
  family_ack_at       timestamptz,
  staff_ack_at        timestamptz,
  staff_ack_by        uuid references users(id),
  closed_at           timestamptz,
  closed_by           uuid references users(id),
  close_reason        text,
  close_visit_id      uuid,
  created_at          timestamptz not null default now()
);
create index if not exists episodes_open on episodes (baby_id) where closed_at is null;

-- Scheduled HBNC visits and recorded visits in one table: a scheduled row is
-- filled in when the ASHA does it; an unscheduled visit is an 'extra' row.
create table if not exists visits (
  id                  uuid primary key default gen_random_uuid(),
  client_id           text unique,
  baby_id             uuid not null references babies(id),
  day                 smallint,
  due_date            date not null,
  kind                text not null,           -- scheduled | extra
  reason              text,                    -- why an extra visit was added
  done_at             timestamptz,
  asha_id             uuid references users(id),
  axillary_temp_c     numeric(4,2),
  weight_g            integer,
  breastfeeding_well  boolean,
  kmc_hours           numeric(4,1),
  danger_signs        jsonb not null default '{}',
  band_check          jsonb,
  outcome             text,                    -- home_care | refer
  notes               text
);
create index if not exists visits_baby on visits (baby_id, due_date);

create table if not exists referrals (
  id           uuid primary key default gen_random_uuid(),
  client_id    text unique,
  baby_id      uuid not null references babies(id),
  visit_id     uuid references visits(id),
  facility_id  text not null references facilities(id),
  reason       text not null,
  created_by   uuid not null references users(id),
  created_at   timestamptz not null default now()
);

create table if not exists danger_checks (
  id        text primary key,                 -- from the phone
  baby_id   uuid not null references babies(id),
  by_user   uuid not null references users(id),
  at        timestamptz not null,
  answers   jsonb not null,
  any_yes   boolean not null
);

create table if not exists kmc_sessions (
  id          text primary key,               -- from the phone
  baby_id     uuid not null references babies(id),
  holder      text not null,                  -- mother | father | grandmother | other
  started_at  timestamptz not null,
  ended_at    timestamptz
);

-- Weights the family or staff record between visits (the baby tab).
create table if not exists weight_logs (
  id          uuid primary key default gen_random_uuid(),
  baby_id     uuid not null references babies(id),
  grams       integer not null,
  at          timestamptz not null default now(),
  by_user     uuid references users(id)
);
create index if not exists weight_logs_baby on weight_logs (baby_id, at);

create table if not exists advice_notes (
  id              uuid primary key default gen_random_uuid(),
  baby_id         uuid not null references babies(id),
  doctor_id       uuid not null references users(id),
  kind            text not null,               -- family | clinical
  template        text,
  body            text not null,
  follow_up_date  date,
  created_at      timestamptz not null default now()
);

-- Messages the server would send by SMS (P1 gateway). Logged so the demo can show them.
create table if not exists outbound_sms (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);
