-- Postgres schema (Neon in production, PGlite locally). Safe to run again:
-- every statement is IF NOT EXISTS. Apply to Neon with `pnpm --filter @neobridge/api db:push`.

create table if not exists ashas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text not null unique,
  village     text,
  created_at  timestamptz not null default now()
);

create table if not exists babies (
  id                uuid primary key default gen_random_uuid(),
  asha_id           uuid not null references ashas(id),
  display_name      text not null,          -- e.g. "Reena's baby"
  sex               text,
  born_on           date not null,
  birth_weight_g    integer,
  family_phone      text,
  language          text not null default 'hi',
  consent_at        timestamptz,            -- read aloud by the ASHA at setup
  created_at        timestamptz not null default now()
);

create table if not exists bands (
  id          text primary key,             -- BLE device id / serial
  baby_id     uuid references babies(id),
  firmware    text,
  rules_ver   text,
  paired_at   timestamptz,
  last_upload timestamptz
);

-- One row per minute from the band (packages/ble-protocol SummaryRecord).
-- (band_id, seq) is the key, so a phone re-sending after a dropped connection
-- never creates duplicates.
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

create table if not exists alerts (
  band_id         text not null references bands(id),
  seq             bigint not null,
  raised_at       timestamptz not null,
  from_status     smallint not null,
  to_status       smallint not null,
  reason          smallint not null,
  acknowledged_at timestamptz,
  acknowledged_by uuid references ashas(id),
  received_at     timestamptz not null default now(),
  primary key (band_id, seq)
);

-- ASHA thermometer checks and danger-sign answers from a visit
create table if not exists visits (
  id              uuid primary key default gen_random_uuid(),
  baby_id         uuid not null references babies(id),
  asha_id         uuid not null references ashas(id),
  visited_at      timestamptz not null,
  axillary_temp_c numeric(4,2),
  danger_signs    jsonb not null default '{}',
  outcome         text                        -- 'home_care' | 'referred'
);
