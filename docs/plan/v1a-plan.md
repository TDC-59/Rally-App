# Rally v1a — Build Plan (draft for review)

Status: **approved 2026-11-09.**

Decisions:
1. Standing rules win over the build prompt; scope is v1a only.
2. `README.md` renamed to `CLAUDE.md`; `CONTEXT.md` and ADRs 0001–0004 drafted.
3. Editing a published shift notifies no one. Push kinds are today + open (standing rules); T-60 is out unless reinstated.
4. A real production domain is required before the first customer follows. `workers.dev` is for building and the iOS spike only. **Domain still to be named.**
5. No travel buffer between back-to-back shifts.

Deviations found while building (2026-11-09):
- `@cloudflare/vitest-pool-workers` is deprecated and renamed `@cloudflare/vitest-plugin`. Using the new name.
- Static files are bundled into the Worker as modules (`static/` + `src/static.ts`), not Workers static assets. The asset-upload step authenticates with a short-lived upload token that this cloud sandbox's credential proxy overwrites. Bundling also removes a second deploy artifact.
- `migrations/` is authoritative. SQLite requires table CHECKs after all columns, so `shifts` is laid out differently from the sketch in §2. The constraints are the same.
- `.npmrc` sets `legacy-peer-deps=true` to get past an npm 10 bug with vitest 4's optional peers.
- Brand pages are canonical at `/{slug}/`, with a trailing slash. A page must sit inside its service worker's scope, and a scope of `/{slug}` without the slash would also cover `/{slug}bros`.
- The VAPID subject is the Rally https origin, not a personal email address.
- The RFC 8291 Appendix A vector couldn't be fetched from this sandbox. Encryption is tested by round-trip through an independently written user-agent decryptor. The real-device test is the acceptance check.

This plan reconciles two sources that disagree: the build prompt and the standing rules (`README.md`, which is really `CLAUDE.md`). Where they conflict, this plan follows the standing rules, because the prompt says not to deviate from them — and calls out every conflict.

---

## 0. Conflicts between the prompt and the standing rules

| # | Prompt says | Standing rules say | Plan follows |
|---|---|---|---|
| 1 | `trucks` owns slug, theme, timezone, followers | **Brand** owns them; a truck is a vehicle with a schedule (ADR 0003) | Brand above truck |
| 2 | Catering (packages, quotes, lead form) not in v1 | Catering **is** v1, shipped as v1b after v1a | Build v1a only; v1b is a separate approval |
| 3 | One flat state enum incl. `tentative` | State depends on kind; DB rejects a mismatch (ADR 0001) | Kind-dependent states with a CHECK |
| 4 | Cron opens shifts on schedule | Only the operator opens; cron may only close forgotten shifts | Operator-only open |
| 5 | Conflicts ignore kind, full stop | Ignore kind, except two tentative caterings never conflict | Standing rule |
| 6 | Push on publish + T-60 push | "Today push" and "open push" | Today + open (see §5) |
| 7 | `truck_operators` with free-text role | Owner and Crew roles, on the brand | `memberships(brand_id, operator_id, role)` |
| 8 | No measurement of the thesis | v1a includes "the push-test report" | Report included |
| 9 | — | References `CONTEXT.md`, `docs/adr/0001–0003`, `docs/agents/*` | **Those files don't exist in the repo.** |
| 10 | Save rules as `CLAUDE.md` | File is committed as `README.md` | Rename to `CLAUDE.md` (it doesn't load as standing rules under its current name) |

Item 2 matters most: acceptance criterion 4 (blocked by a booked catering) needs *some* way to create a catering. The plan covers that with a `kind` selector on the ordinary shift form (client name/email, tentative/booked) and nothing more.

---

## 1. Build order (changed from the prompt)

The prompt says to check iOS push early but lists push sixth. I moved a throwaway push spike up to step 1, because if iOS fails, everything after it changes.

0. **Scaffold + deploy.** Hono worker, `wrangler.jsonc`, D1/KV/R2/Queue bindings, `/healthz` live on a real URL. *Blocked on Cloudflare credentials.*
1. **Push spike (gate).** `/spike` page: manifest, service worker, subscribe button, "send me a push" button. WebCrypto VAPID + RFC 8291 encryption, tested against the RFC 8291 Appendix A vector. **You test it on your iPhone as a Home Screen app.** If it fails, I stop and tell you.
2. Schema + migrations (below), applied locally and remotely.
3. Auth: magic link, sessions, Owner/Crew.
4. Shift engine: CRUD, state machine by kind, conflict detection, series expansion. Tests for timezone, conflicts, and recurrence.
5. Public brand page + white-label theming + contrast computation (tested). Per-brand manifest and service worker.
6. Unified calendar (month/week).
7. Followers + push for real: queue fan-out, idempotent sends, 404/410 pruning, click tracking.
8. Finder map `/near-me` + `/api/shifts/live`.
9. iCal feed, then Google Calendar push (one calendar per truck).
10. Cron: close forgotten shifts, today push, expire tentative holds, Google reconcile, extend series horizon.
11. Push-test report.

Spike code gets deleted once step 7 lands.

---

## 2. Migrations

Conventions: ids are `TEXT` (`crypto.randomUUID()`). **All instants are `INTEGER` unix seconds UTC** — a column of integers can't hold an accidental local-time string, and overlap math is plain integer comparison. Wall-clock values (series start time, local dates) are `TEXT` and always paired with the brand's timezone. Each migration is one file and never gets edited after it ships.

### `migrations/0001_identity.sql`

```sql
CREATE TABLE brands (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE
                CHECK (length(slug) BETWEEN 2 AND 40
                       AND slug NOT GLOB '*[^a-z0-9-]*'
                       AND slug NOT GLOB '-*' AND slug NOT GLOB '*-'),
  name          TEXT NOT NULL,
  timezone      TEXT NOT NULL,          -- IANA; validated in the Worker via Intl
  logo_r2_key   TEXT,
  accent_hex    TEXT NOT NULL DEFAULT '#FF4D1C',
  ground_hex    TEXT NOT NULL DEFAULT '#FFFFFF',
  ink_hex       TEXT NOT NULL DEFAULT '#19120F',
  accent_dark_hex TEXT,                 -- optional; derived when NULL
  ground_dark_hex TEXT,
  ink_dark_hex    TEXT,
  display_font  TEXT NOT NULL DEFAULT 'archivo-black',  -- key into a curated, self-hosted list
  radius_px     INTEGER NOT NULL DEFAULT 2 CHECK (radius_px BETWEEN 0 AND 24),
  on_finder_map INTEGER NOT NULL DEFAULT 1 CHECK (on_finder_map IN (0,1)),
  public_at     INTEGER,                -- set when the brand first publishes a shift; slug is frozen after
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
  name        TEXT NOT NULL,            -- console-only; customers never see it
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

-- Magic links. Only the SHA-256 of the token is stored; the token exists only in the email.
CREATE TABLE login_tokens (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL COLLATE NOCASE,
  expires_at INTEGER NOT NULL,          -- 15 minutes
  used_at    INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX login_tokens_email ON login_tokens(email, created_at);  -- rate limiting

-- Sessions. Cookie holds a random id; the table holds its hash.
CREATE TABLE sessions (
  id_hash      TEXT PRIMARY KEY,
  operator_id  TEXT NOT NULL REFERENCES operators(id),
  expires_at   INTEGER NOT NULL,        -- 30 days, sliding
  last_seen_at INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX sessions_operator ON sessions(operator_id);
```

### `migrations/0002_shifts.sql`

```sql
-- A series is the rule; the occurrences are real rows in shifts.
-- Time is stored as LOCAL wall clock plus the brand's timezone, so a 17:00 Tuesday
-- series stays 17:00 across DST. The UTC instant is computed per occurrence on expansion.
CREATE TABLE series (
  id            TEXT PRIMARY KEY,
  truck_id      TEXT NOT NULL REFERENCES trucks(id),
  kind          TEXT NOT NULL CHECK (kind IN ('service','catering')),
  rule          TEXT NOT NULL,          -- RRULE subset: FREQ=WEEKLY;INTERVAL=n;BYDAY=TU,TH
  local_start   TEXT NOT NULL CHECK (local_start GLOB '[0-2][0-9]:[0-5][0-9]'),
  duration_min  INTEGER NOT NULL CHECK (duration_min BETWEEN 15 AND 1440),
  starts_on     TEXT NOT NULL,          -- local date YYYY-MM-DD
  until_on      TEXT,                   -- local date, inclusive; NULL = open-ended
  expanded_through TEXT NOT NULL,       -- local date; cron extends a rolling horizon
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
  -- ADR 0001: the state must belong to the kind
  CHECK ( (kind = 'service'  AND state IN ('draft','published','open','closed','cancelled'))
       OR (kind = 'catering' AND state IN ('tentative','booked','closed','cancelled')) ),

  place_name    TEXT,
  address       TEXT,
  lat           REAL CHECK (lat BETWEEN -90 AND 90),
  lng           REAL CHECK (lng BETWEEN -180 AND 180),
  CHECK ((lat IS NULL) = (lng IS NULL)),
  -- a service shift customers can see must be on the map
  CHECK (kind <> 'service' OR state IN ('draft','cancelled') OR lat IS NOT NULL),

  starts_at     INTEGER NOT NULL,       -- unix seconds UTC
  ends_at       INTEGER NOT NULL,
  CHECK (ends_at > starts_at),
  opened_at     INTEGER,
  closed_at     INTEGER,
  CHECK (state <> 'open' OR opened_at IS NOT NULL),

  -- catering only
  client_name   TEXT,
  client_email  TEXT,
  hold_expires_at INTEGER,
  CHECK (kind = 'catering' OR (client_name IS NULL AND client_email IS NULL AND hold_expires_at IS NULL)),

  series_id     TEXT REFERENCES series(id),
  detached      INTEGER NOT NULL DEFAULT 0 CHECK (detached IN (0,1)),  -- edited occurrence; series edits skip it
  notes         TEXT,

  gross_cents   INTEGER CHECK (gross_cents >= 0),   -- entered on close; feeds the push-test report
  gcal_event_id TEXT,
  gcal_synced_at INTEGER,
  updated_at    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);

-- Conflict detection and the calendar: per truck, by time
CREATE INDEX shifts_truck_time ON shifts(truck_id, starts_at, ends_at);
-- Finder map + crons: the selective predicate is "public and near now", not geography
CREATE INDEX shifts_public_time ON shifts(starts_at, lat, lng)
  WHERE kind = 'service' AND state IN ('published','open');
CREATE INDEX shifts_open ON shifts(state) WHERE state = 'open';
CREATE INDEX shifts_series ON shifts(series_id, starts_at);
CREATE UNIQUE INDEX shifts_series_occurrence ON shifts(series_id, starts_at) WHERE series_id IS NOT NULL;
```

Conflict detection is a single atomic statement, not a read followed by a write. D1 has no interactive transactions, so a check-then-insert would race:

```sql
INSERT INTO shifts (id, truck_id, kind, state, starts_at, ends_at, ...)
SELECT ?1, ?2, ?3, ?4, ?5, ?6, ...
WHERE NOT EXISTS (
  SELECT 1 FROM shifts s
  WHERE s.truck_id = ?2
    AND s.state <> 'cancelled'
    AND s.starts_at < ?6 AND s.ends_at > ?5          -- half-open: back-to-back is allowed
    AND NOT (s.state = 'tentative' AND ?4 = 'tentative')
);
-- meta.changes = 0  → look up the blocking row and say exactly what it is and when
```

### `migrations/0003_followers_push.sql`

```sql
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
```

### `migrations/0004_gcal.sql`

```sql
CREATE TABLE gcal_connections (
  truck_id          TEXT PRIMARY KEY REFERENCES trucks(id),
  google_email      TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,      -- AES-GCM with a Worker secret; never plaintext
  calendar_id       TEXT NOT NULL,      -- the dedicated "{Truck} — Rally" calendar
  busy_calendar_id  TEXT,               -- optional read-only busy source
  connected_by      TEXT NOT NULL REFERENCES operators(id),
  last_reconciled_at INTEGER,
  last_error        TEXT,
  created_at        INTEGER NOT NULL
);
```

### Changes from the prompt's model, with reasons

- **Brand/truck split** — standing rule, ADR 0003.
- **Integer UTC seconds**, not ISO text — overlap math and DST safety.
- **Series keep local wall time** — a series stored as a UTC start drifts an hour at every DST change. This is the most likely bug in the project.
- **`login_tokens` table added; sessions store hashes** — the prompt's model has nowhere to put the magic link, and a leaked DB dump shouldn't contain working session ids.
- **`followers.endpoint` unique per brand**, not globally.
- **Dropped `followers.lat/lng`** — unused, and it's location data on anonymous people.
- **`push_log` → `pushes` with `UNIQUE(shift_id, kind)`** — same idea as the QuickBooks invoice rule. The cron runs every few minutes and queues redeliver, so without the constraint a follower eventually gets the same push twice.
- **Geo index moved to public shifts, keyed by time first.** For "live now / today", time cuts the rows far more than a bounding box does. The bounding box filters inside that set.
- **`gross_cents` + `shift_ig_stats`** — without an outcome metric, v1 can't answer its own question.
- **No `places` table.** The shift form offers "reuse a recent location" from a `SELECT DISTINCT` over past shifts, with no schema cost.

---

## 3. Routes

```
PUBLIC (brand layer, white-label)
GET  /{slug}                         brand page
GET  /{slug}/manifest.webmanifest    per-brand PWA manifest, scope /{slug}/
GET  /{slug}/sw.js                   per-brand service worker, Service-Worker-Allowed: /{slug}/
POST /{slug}/follow                  store push subscription
POST /{slug}/unfollow
GET  /{slug}/feed.ics                public service shifts only
POST /{slug}/e                       funnel beacon (follow_tap, a2hs_shown, …)
GET  /p/{push_id}                    notification click → count → 302 /{slug}?src=push

PUBLIC (Rally layer)
GET  /near-me                        finder map
GET  /api/shifts/live?bbox=…         open now + published today, bbox filtered
GET  /media/{key}                    R2 logos, immutable cache headers

AUTH
GET  /login · POST /login · GET /auth/{token} · POST /logout

OPERATOR (Rally layer, session required)
GET   /app                           today, next shift, follower count
GET   /app/calendar?view=month|week&date=
GET   /app/shifts/new
POST  /app/shifts                    create (single or series)
GET   /app/shifts/{id}
PATCH /app/shifts/{id}               ?scope=this|future for series occurrences
POST  /app/shifts/{id}/publish       draft → published (+ today push if it's today)
POST  /app/shifts/{id}/open          → open; body carries device lat/lng; open push
POST  /app/shifts/{id}/close         → closed; optional gross
POST  /app/shifts/{id}/cancel
POST  /app/shifts/{id}/book          catering tentative → booked
GET   /app/report                    push-test report
GET   /app/settings · POST /app/settings · POST /app/settings/logo
GET   /app/trucks · POST /app/trucks
GET   /app/team · POST /app/team     invite crew (owner only)
GET   /app/integrations/google?truck= · GET /app/integrations/google/cb
POST  /app/integrations/google/disconnect

Hono's method-override middleware handles PATCH from HTML forms (no JS required).

CRON (one handler, dispatched on schedule)
*/5 * * * *   today pushes due · close shifts forgotten 2h past end · expire tentative holds
*/15 * * * *  Google reconcile (drifted or failed events)
0 4 * * *     extend series horizon to +8 weeks · purge expired login_tokens/sessions
QUEUE  push-fanout   consumer sends in batches of 50 subscriptions per message
```

---

## 4. Directory layout

```
CLAUDE.md                 standing rules (renamed from README.md)
README.md                 short human readme
CONTEXT.md                glossary (referenced but missing; I'll draft it)
docs/adr/0001-shift-state-by-kind.md
docs/adr/0002-v1-in-two-releases.md
docs/adr/0003-brand-above-truck.md
docs/adr/0004-integer-utc-and-local-series.md   (new)
docs/plan/v1a-plan.md     this file
wrangler.jsonc · package.json · tsconfig.json · vitest.config.ts
migrations/0001_identity.sql … 0004_gcal.sql
src/
  index.ts                export { fetch, scheduled, queue }
  env.ts                  Bindings type
  routes/                 public.ts finder.ts auth.ts track.ts
    app/                  dashboard.ts calendar.ts shifts.ts settings.ts team.ts report.ts google.ts
  domain/                 pure functions, no I/O; this is where the tests are
    tz.ts                 wall-clock ↔ UTC via Intl, DST gap/overlap policy
    shift-state.ts        allowed transitions per kind
    conflicts.ts          overlap rule + human message
    series.ts             RRULE subset → occurrences
    contrast.ts           WCAG luminance, accent-ink, dark-pair derivation
    theme.ts              brand row → <style>:root{--t-*}</style>
  db/                     prepared-statement query modules per table
  push/                   vapid.ts encrypt.ts send.ts fanout.ts
  gcal/                   oauth.ts api.ts sync.ts
  ical/feed.ts
  email/                  mailer.ts (interface) resend.ts
  geo/                    bbox.ts geocode.ts (Nominatim, cached)
  cron/index.ts
  views/                  html.ts (hono/html escaping) rally-layout.ts brand-layout.ts components.ts pages/*
public/                   Workers static assets
  css/rally.css css/brand.css
  js/countdown.js js/follow.js js/map.js js/shift-form.js
  fonts/  vendor/leaflet-1.9.4/
test/
  tz.test.ts conflicts.test.ts series.test.ts contrast.test.ts push-encrypt.test.ts
  integration/shifts.test.ts  (D1 in vitest-pool-workers)
```

---

## 5. Push policy

Push-on-publish is wrong as written. Publishing a four-week Tuesday series would send four pushes in one second about dates weeks away, and followers who get that switch notifications off. Proposed:

- **today** — sent on the day: at `starts_at − 2h`, never before 08:00 local; or right away if the shift is published inside that window. At most one per shift.
- **open** — sent when the operator taps "We're open."
- **T-60** — dropped. Three pushes per shift is how a brand loses permission. **DECIDE.**
- Editing a published shift sends nothing in v1a. **DECIDE** whether a "tell followers about the change" button is in scope.

---

## 6. Timezone policy (tested)

- Instants: UTC seconds. Rendering: `Intl.DateTimeFormat` with the brand's `timezone`, never the server's or the viewer's.
- Wall clock → UTC: computed from the zone's offset at that instant, with a fixed-point correction.
  - Spring-forward gap (02:30 doesn't exist): move forward to the first valid instant.
  - Fall-back overlap (01:30 happens twice): use the earlier one.
- "Today" means the brand's local day, from 00:00 to 24:00 in the brand's zone. That day lasts 23 or 25 hours twice a year.
- Countdown: the server embeds `ends_at` and its own `now`. The client corrects for phone clock skew and counts absolute seconds, so DST can't affect it. Only the "until 2:00" label is zone-formatted.
- Tests pin `America/New_York` across 2027-03-14 and 2026-11-01, plus a zone with no DST and one with a 30-minute offset.

---

## 7. What I need from you before step 0

- Cloudflare API token (Workers, D1, KV, R2, Queues edit) + account id, requested through the session's secure credential form. Not in chat.
- Confirmation that the account's plan covers Queues.
- The production domain — see §8.
- Resend API key + a verified sending domain (needed at step 3).
- A Google Cloud OAuth client (needed at step 9).

---

## 8. Origin decision (sticky — decide before the first real follower)

A push subscription and an installed Home Screen app are bound to the **origin** they were created on. Move a brand from `rally.example/angry-archies` to `angryarchies.com` later, and every one of its followers has to re-follow and re-install. Options:

- **Path per brand on a real Rally domain** (`rally.example/{slug}`): matches the route map, simplest. Custom domains later cost each brand its follower list.
- **Subdomain per brand** (`{slug}.rally.example`): one origin per brand, cleaner PWA isolation, same migration cost later.
- **Custom domain from day one** via Cloudflare for SaaS: no migration ever, but more setup per brand.

Recommendation: path per brand on a real domain for v1a. Never let a real customer follow on `*.workers.dev`. **DECIDE** the domain.

## 9. Known risks

- **iOS Web Push only works from a Home Screen web app** (iOS 16.4+). On an iPhone, "tap Follow" really means Share → Add to Home Screen → open it → Follow → Allow. The funnel is instrumented step by step so we can tell "push lost" apart from "install friction lost."
- **Rally's own tokens fail the contrast rule** they impose on brands: white on ember is 3.32:1, ember link text on white is 3.32:1, and `--r-ink-3` on white is 3.92:1. Fix proposed: `--r-ember-ink: #19120F` (5.58:1) and darken ink-3, or keep ember for large text only.
- **OSM's public tile servers** aren't meant for a commercial product's traffic. Fine on our own trucks; switch tile source before outside trucks join.
- **Geocoding** goes through Nominatim, server-side, cached, at 1 request/second, with a draggable pin to correct it.
- **Google OAuth in "Testing" status issues refresh tokens that die after 7 days.** The reconcile cron would fail silently after a week. Set the OAuth app's publishing status to production (unverified is OK under 100 users).
- **KV is eventually consistent (up to ~60s across locations).** "Open" state is read from D1, not KV. Otherwise a customer who taps the push lands on a page that says the truck isn't open yet. KV only caches the slow-changing brand profile and theme.
- **Durable Objects:** nothing in v1a needs atomic per-shift state. None until v2 pre-ordering.
