-- Migration 0001_identity. Never edit after it ships, add a new file instead.

CREATE TABLE brands (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE
                CHECK (length(slug) BETWEEN 2 AND 40
                       AND slug NOT GLOB '*[^a-z0-9-]*'
                       AND slug NOT GLOB '-*' AND slug NOT GLOB '*-'),
  name          TEXT NOT NULL,
  timezone      TEXT NOT NULL,          -- IANA, validated in the Worker via Intl
  logo_r2_key   TEXT,
  accent_hex    TEXT NOT NULL DEFAULT '#FF4D1C',
  ground_hex    TEXT NOT NULL DEFAULT '#FFFFFF',
  ink_hex       TEXT NOT NULL DEFAULT '#19120F',
  accent_dark_hex TEXT,                 -- optional, derived when NULL
  ground_dark_hex TEXT,
  ink_dark_hex    TEXT,
  display_font  TEXT NOT NULL DEFAULT 'archivo-black',  -- key into a curated, self-hosted list
  radius_px     INTEGER NOT NULL DEFAULT 2 CHECK (radius_px BETWEEN 0 AND 24),
  on_finder_map INTEGER NOT NULL DEFAULT 1 CHECK (on_finder_map IN (0,1)),
  public_at     INTEGER,                -- set when the brand first publishes a shift, slug is frozen after
  created_at    INTEGER NOT NULL,
  CHECK (accent_hex GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]'),
  CHECK (ground_hex GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]'),
  CHECK (ink_hex    GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]')
);
-- note: no accent_ink column, by design. It is computed.

CREATE TRIGGER brands_slug_immutable_once_public
BEFORE UPDATE OF slug ON brands
WHEN OLD.public_at IS NOT NULL AND NEW.slug <> OLD.slug
BEGIN SELECT RAISE(ABORT, 'slug_immutable'); END;

CREATE TABLE trucks (
  id          TEXT PRIMARY KEY,
  brand_id    TEXT NOT NULL REFERENCES brands(id),
  name        TEXT NOT NULL,            -- console-only, customers never see it
  archived_at INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX trucks_brand ON trucks(brand_id);

CREATE TABLE operators (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name       TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE memberships (
  brand_id    TEXT NOT NULL REFERENCES brands(id),
  operator_id TEXT NOT NULL REFERENCES operators(id),
  role        TEXT NOT NULL CHECK (role IN ('owner','crew')),
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (brand_id, operator_id)
);
CREATE INDEX memberships_operator ON memberships(operator_id);

-- Magic links. Only the SHA-256 of the token is stored, the token exists only in the email.
CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL COLLATE NOCASE,
  expires_at INTEGER NOT NULL,          -- 15 minutes
  used_at    INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX login_tokens_email ON login_tokens(email, created_at);  -- rate limiting

-- Sessions. Cookie holds a random id, the table holds its hash.
CREATE TABLE sessions (
  id_hash      TEXT PRIMARY KEY,
  operator_id  TEXT NOT NULL REFERENCES operators(id),
  expires_at   INTEGER NOT NULL,        -- 30 days, sliding
  last_seen_at INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX sessions_operator ON sessions(operator_id);
