-- Migration 0002_shifts. Never edit after it ships, add a new file instead.

-- A series is the rule, the occurrences are real rows in shifts.
-- Time is stored as LOCAL wall clock plus the brand's timezone, so a 17:00 Tuesday
-- series stays 17:00 across DST. The UTC instant is computed per occurrence on expansion.
CREATE TABLE series (
  id            TEXT PRIMARY KEY,
  truck_id      TEXT NOT NULL REFERENCES trucks(id),
  kind          TEXT NOT NULL CHECK (kind IN ('service','catering')),
  rule          TEXT NOT NULL,          -- RRULE subset: FREQ=WEEKLY INTERVAL=n BYDAY=TU,TH (fields split by semicolons)
  local_start   TEXT NOT NULL CHECK (local_start GLOB '[0-2][0-9]:[0-5][0-9]'),
  duration_min  INTEGER NOT NULL CHECK (duration_min BETWEEN 15 AND 1440),
  starts_on     TEXT NOT NULL,          -- local date YYYY-MM-DD
  until_on      TEXT,                   -- local date, inclusive, NULL = open-ended
  expanded_through TEXT NOT NULL,       -- local date, cron extends a rolling horizon
  place_name    TEXT, address TEXT, lat REAL, lng REAL,
  notes         TEXT,
  ended_at      INTEGER,
  created_at    INTEGER NOT NULL
);

CREATE TABLE shifts (
  id            TEXT PRIMARY KEY,
  truck_id      TEXT NOT NULL REFERENCES trucks(id),
  kind          TEXT NOT NULL CHECK (kind IN ('service','catering')),
  state         TEXT NOT NULL,

  place_name    TEXT,
  address       TEXT,
  lat           REAL CHECK (lat BETWEEN -90 AND 90),
  lng           REAL CHECK (lng BETWEEN -180 AND 180),

  starts_at     INTEGER NOT NULL,       -- unix seconds UTC
  ends_at       INTEGER NOT NULL,
  opened_at     INTEGER,
  closed_at     INTEGER,

  -- catering only
  client_name   TEXT,
  client_email  TEXT,
  hold_expires_at INTEGER,

  series_id     TEXT REFERENCES series(id),
  detached      INTEGER NOT NULL DEFAULT 0 CHECK (detached IN (0,1)),  -- edited occurrence, series edits skip it
  notes         TEXT,

  gross_cents   INTEGER CHECK (gross_cents >= 0),   -- entered on close, feeds the push-test report
  gcal_event_id TEXT,
  gcal_synced_at INTEGER,
  updated_at    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,

  -- ADR 0001: the state must belong to the kind
  CHECK ( (kind = 'service'  AND state IN ('draft','published','open','closed','cancelled'))
       OR (kind = 'catering' AND state IN ('tentative','booked','closed','cancelled')) ),
  CHECK ((lat IS NULL) = (lng IS NULL)),
  -- a service shift customers can see must be on the map
  CHECK (kind <> 'service' OR state IN ('draft','cancelled') OR lat IS NOT NULL),
  CHECK (ends_at > starts_at),
  CHECK (state <> 'open' OR opened_at IS NOT NULL),
  CHECK (kind = 'catering' OR (client_name IS NULL AND client_email IS NULL AND hold_expires_at IS NULL))
);

-- Conflict detection and the calendar: per truck, by time
CREATE INDEX shifts_truck_time ON shifts(truck_id, starts_at, ends_at);
-- Finder map + crons: the selective predicate is "public and near now", not geography
CREATE INDEX shifts_public_time ON shifts(starts_at, lat, lng)
  WHERE kind = 'service' AND state IN ('published','open');
CREATE INDEX shifts_open ON shifts(state) WHERE state = 'open';
CREATE INDEX shifts_series ON shifts(series_id, starts_at);
CREATE UNIQUE INDEX shifts_series_occurrence ON shifts(series_id, starts_at) WHERE series_id IS NOT NULL;
