# CLAUDE.md — Rally

Standing rules for this repo. Read before writing code in any session.

**Rally** is an operating system for food trucks, sold to operators as SaaS. A restaurant's address is a constant; a truck's address is the product. Discovery therefore works by push (announce where you are to people who follow you), not by pull (rank an address on Google).

Domain language lives in `CONTEXT.md` and decisions in `docs/adr/`. Use the glossary's terms in code, tests, and UI copy.

## Non-negotiables

**A brand sits above its trucks.** The brand owns the slug, theme, timezone, followers, lead form, packages, and payment and accounting connections; a truck is a vehicle with its own schedule. A one-truck business is a brand with one truck — no separate path. See ADR 0003.

**One `shifts` table with a `kind` discriminator.** A catering booking is a shift (`kind='catering'`), not a separate entity. Never split them. Conflict detection, honest availability, the unified calendar, and revenue-per-operating-day all follow from them sharing one table. If you want to split them, stop and ask.

**All timestamps stored UTC, rendered in the brand's IANA timezone.** Never server-local, never viewer-local. A 5pm shift reads as 5pm to its customers across DST. Highest-risk area in the codebase; keep it tested.

**Conflict detection ignores `kind` and runs per truck.** A catering overlapping a service shift is the exact conflict this product exists to catch. Every shift except a cancelled one blocks, with one exception: two tentative caterings never conflict (competing quotes; first deposit wins).

**Shift state depends on kind.** Service: `draft → published → open → closed`. Catering: `tentative → booked → closed`. Either can be `cancelled`. The database rejects a state that doesn't belong to the row's kind. See ADR 0001.

**Only the operator opens a shift.** A clock never flips a shift to open — signal yellow must mean the window really is open. Cron may close a forgotten shift after its scheduled end.

**Recurrences expand into real rows.** Never compute occurrences at read time — conflicts, calendar, and push all need real rows, and operators edit single occurrences.

**Compute `--t-accent-ink`, never store it.** Check the brand's accent against both grounds at 4.5:1 and pick black or white. Operators choose accents that fail contrast; whether their customers can read the button is not delegable.

**Google Calendar is one-way.** Rally is the source of truth and overwrites drift. No two-way sync.

**QuickBooks invoice IDs are idempotency keys.** Store them, and refuse a second invoice of the same type at the schema level. Never invoice a shift marked invoiced elsewhere.

**Payment providers and accounting sit behind a small interface.** Each brand picks its own (QuickBooks Payments or Square in v1, plus a manual "deposit received"). Never call a provider SDK inline.

**No geo library.** D1 is SQLite. Bounding box on indexed `(lat, lng)`, refine in the Worker.

## Stack

Cloudflare Workers · Hono · D1 (raw SQL migrations via `wrangler d1 migrations`) · Durable Objects (one per *open* shift only) · KV (hot public reads) · R2 (images) · Queues (push/email fan-out) · Cron Triggers · server-rendered HTML + minimal vanilla JS · PWA with VAPID Web Push · Leaflet + OSM tiles · Resend · Vitest with `@cloudflare/vitest-pool-workers`.

**Do not add:** React or any client framework, an ORM, Tailwind or any CSS framework, a component library, Postgres/Supabase, a geo library, `web-push` (Node crypto — use WebCrypto VAPID instead).

Pin dependency versions. Hand-written CSS only, built from the tokens below.

## Two token layers

`--r-*` — **Rally layer.** Fixed Street Bold identity. Operator console, marketing, auth, the shared finder map, operator email.

`--t-*` — **Brand layer.** White-label, injected per request as a `<style>` block in the head from the brand's row. The brand's public page, its quote links, its lead form, its customer email (and later its ordering flow). Seven values only: `--t-accent`, `--t-accent-ink` (computed), `--t-ground`, `--t-ink`, `--t-line`, `--t-display`, `--t-radius`.

The brand's public page carries no Rally logo, no "Powered by," nothing.

## Design tokens

```css
:root {
  /* ground + ink — warm-biased neutrals, never default grey */
  --r-ground: #FFFFFF;  --r-surface: #FAF8F7;  --r-surface-2: #F1EDEB;
  --r-line: #E3DCD8;    --r-line-hard: #19120F;
  --r-ink: #19120F;     --r-ink-2: #574C47;    --r-ink-3: #8B7E78;

  /* brand */
  --r-ember: #FF4D1C;   --r-ember-ink: #FFFFFF;   /* actions only */
  --r-signal: #FFD400;  --r-signal-ink: #19120F;  /* LIVE only */
  --r-teal: #00806F;                              /* catering, info */

  /* semantic — deliberately off ember's hue */
  --r-ok: #0E7A52;      --r-warn: #8A5200;     --r-crit: #BE123C;
  --r-ok-bg: #E4F4EC;   --r-warn-bg: #FBF0DC;  --r-crit-bg: #FCE7EC;
  --r-teal-bg: #DEF2EF;

  /* type */
  --f-display: "Archivo Black", "Arial Black", system-ui, sans-serif;
  --f-body: "Archivo", system-ui, -apple-system, sans-serif;
  --f-data: "IBM Plex Mono", ui-monospace, Menlo, monospace;

  /* space + form */
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px;
  --s5: 24px; --s6: 32px; --s7: 48px; --s8: 64px;
  --radius: 2px; --pill: 999px;
  --sticker: 3px 3px 0 var(--r-line-hard);
  --sticker-sm: 2px 2px 0 var(--r-line-hard);
}
```

Dark theme redefines the same tokens under both `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and `:root[data-theme="dark"]`, so an explicit choice wins in both directions. Dark values: ground `#0A0A0A`, surface `#151211`, surface-2 `#211C19`, line `#332B27`, line-hard `#FAF7F6`, ink `#FAF7F6`, ink-2 `#B6AAA5`, ink-3 `#80746F`, ember `#FF6236`, ember-ink `#1A0A04`, teal `#2BD9C0`, ok `#35C98A`, warn `#F0A42A`, crit `#FF5F7A`.

Every color gets its first definition on bare `:root`. Never define a color only inside a media or `[data-theme]` block.

## Three color rules

1. **Signal yellow has one job** — live right now. Not warnings, not highlights, not hover. When a customer sees that yellow anywhere in Rally, a truck's window is open.
2. **Ember is for actions** — buttons, links, active nav. Never a status. A hot orange that sometimes means "press this" and sometimes "something's wrong" teaches people to ignore it.
3. **State is never color alone** — every status carries a shape and a word. Trucks get operated in direct sunlight on cracked phone screens, and roughly one man in twelve can't separate crimson from ember.

## Visual language

Type: **Archivo Black** display (uppercase, tight tracking, big size jumps), **Archivo** body, **IBM Plex Mono** for anything with a decimal point. Every column of figures gets `font-variant-numeric: tabular-nums`.

Form: **2px radius** on every box, **999px** on status pills only — nothing in between. Depth is a **hard offset shadow** in `--r-line-hard`, screen-printed like a decal on a truck panel. No soft blur shadows anywhere. Buttons press into the page on click.

Layout: flex/grid with `gap`, never per-element margins. Side gutter of at least 16px at every width. Works at 390px. Status is a pill with dot/square/triangle plus a label.

## Conventions

- Server-rendered HTML returned from Hono handlers; small composable template functions, no JSX
- One migration file per change, never edit a shipped migration
- Prepared statements with bound parameters, always
- Money in integer cents; never floats
- Brand slugs are lowercase, URL-safe, immutable once public
- Truck names are console-only; customers only ever see the brand
- Durable Objects only for shifts in `open` state; everything else is plain D1
- Deploy to Cloudflare early and keep it deployed
- Commit small, working increments

## Scope discipline

The current milestone is **v1**. It answers one question — does a push to 400 followers beat an Instagram story to 4,000? — and ships the catering module that makes trucks switch. **Catering is part of v1.** v1 goes out as two releases (ADR 0002):

**v1a — the push test:** operator auth with Owner and Crew roles, brands with multiple trucks, brand profile with theme, shift engine with series and conflict detection, white-label public brand page, follow + Web Push (today push and open push), shared finder map, unified calendar, one-way Google Calendar push per truck + iCal, the push-test report. Goes live on our own trucks first.

**v1b — catering:** packages and the quote builder (manual permits line), quote links with accept and expiry, deposits through the brand's payment provider (QuickBooks Payments or Square, or marked received), optional QuickBooks deposit and balance invoices with a default class, the lead form with real availability, and the lead pipeline. Lands before outside trucks join.

**Not in v1 — do not build:** ordering or pre-orders, menus or inventory, loyalty, SMS, live GPS, subscription billing, native app, admin panel, Stripe, automatic permit lookup from the FTOTM permit engine, pipeline analytics, FTOTM lead routing, Tripleseat import.

**v2:** Square catalog and order sync, pre-ordering with atomic inventory in the per-shift Durable Object, order queue, ticket printing.
**v3:** loyalty and location-chase rewards, pipeline analytics, unit economics, live GPS option, FTOTM lead routing, automatic permit costs.

The strongest thing about this plan is what it leaves out. If a change needs scope beyond the current milestone, ask before building it.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
