-- Postgres schema (intended for Neon). Draft: review before the first migration.

create table ashas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text not null unique,
  village     text,
  created_at  timestamptz not null default now()
);

create table babies (
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

create table bands (
  id          text primary key,             -- BLE device id / serial
  baby_id     uuid references babies(id),
  firmware    text,
  rules_ver   text,
  paired_at   timestamptz
);

-- One row per band summary record (see packages/ble-protocol SummaryRecord)
create table band_summaries (
  band_id       text not null references bands(id),
  seq           bigint not null,
  recorded_at   timestamptz not null,
  skin_temp_c   numeric(4,2),
  room_temp_c   numeric(4,2),
  contact_pct   smallint not null,
  heart_rate    smallint,
  status        smallint not null,          -- 0 green, 1 yellow, 2 red, 3 grey
  received_at   timestamptz not null default now(),
  primary key (band_id, seq)
);

create table alerts (
  band_id         text not null references bands(id),
  seq             bigint not null,
  raised_at       timestamptz not null,
  from_status     smallint not null,
  to_status       smallint not null,
  reason          smallint not null,
  acknowledged_at timestamptz,
  acknowledged_by uuid references ashas(id),
  primary key (band_id, seq)
);

-- ASHA thermometer checks and danger-sign answers from a visit
create table visits (
  id              uuid primary key default gen_random_uuid(),
  baby_id         uuid not null references babies(id),
  asha_id         uuid not null references ashas(id),
  visited_at      timestamptz not null,
  axillary_temp_c numeric(4,2),
  danger_signs    jsonb not null default '{}',
  outcome         text                        -- 'home_care' | 'referred'
);
