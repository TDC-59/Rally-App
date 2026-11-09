-- Migration 0003_followers_push. Never edit after it ships, add a new file instead.

CREATE TABLE followers (
  id           TEXT PRIMARY KEY,
  brand_id     TEXT NOT NULL REFERENCES brands(id),
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'direct',  -- ?src= at follow time: ig, qr, push, direct
  platform     TEXT,                            -- ios-standalone, android, desktop
  created_at   INTEGER NOT NULL,
  last_ok_at   INTEGER,
  UNIQUE (brand_id, endpoint)
);
-- no lat/lng on followers: v1 doesn't use it, and it's location data on anonymous people

CREATE TABLE pushes (
  id            TEXT PRIMARY KEY,
  brand_id      TEXT NOT NULL REFERENCES brands(id),
  shift_id      TEXT NOT NULL REFERENCES shifts(id),
  kind          TEXT NOT NULL CHECK (kind IN ('today','open')),
  queued_at     INTEGER NOT NULL,
  followers_at_send INTEGER NOT NULL DEFAULT 0,
  accepted      INTEGER NOT NULL DEFAULT 0,     -- push service returned 201
  failed        INTEGER NOT NULL DEFAULT 0,
  pruned        INTEGER NOT NULL DEFAULT 0,     -- 404/410, subscription deleted
  clicks        INTEGER NOT NULL DEFAULT 0,
  finished_at   INTEGER,
  UNIQUE (shift_id, kind)                       -- idempotency: cron retries and queue redelivery can't double-send
);

-- Funnel + attribution for the push-test report. Daily counters, no per-person rows.
CREATE TABLE brand_daily_stats (
  brand_id   TEXT NOT NULL REFERENCES brands(id),
  day        TEXT NOT NULL,             -- local date in brand tz
  metric     TEXT NOT NULL,             -- view:push, view:ig, view:direct, follow_tap, a2hs_shown, permission_granted, ...
  n          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (brand_id, day, metric)
);

-- Operator-entered comparison: the Instagram story for the same shift
CREATE TABLE shift_ig_stats (
  shift_id     TEXT PRIMARY KEY REFERENCES shifts(id),
  story_views  INTEGER CHECK (story_views >= 0),
  link_taps    INTEGER CHECK (link_taps >= 0),
  entered_at   INTEGER NOT NULL
);
