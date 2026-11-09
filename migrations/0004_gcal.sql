-- Migration 0004_gcal. Never edit after it ships, add a new file instead.

CREATE TABLE gcal_connections (
  truck_id          TEXT PRIMARY KEY REFERENCES trucks(id),
  google_email      TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,      -- AES-GCM with a Worker secret, never plaintext
  calendar_id       TEXT NOT NULL,      -- the dedicated "{Truck} — Rally" calendar
  busy_calendar_id  TEXT,               -- optional read-only busy source
  connected_by      TEXT NOT NULL REFERENCES operators(id),
  last_reconciled_at INTEGER,
  last_error        TEXT,
  created_at        INTEGER NOT NULL
);
