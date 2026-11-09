# ADR 0004 — Instants are integer UTC; series are local wall clock

Status: accepted

## Context
The highest-risk area in Rally is time. A 5pm Tuesday shift has to read as 5pm to customers on both sides of a DST change, and "today" means the brand's day, not the server's or the viewer's.

## Decision
- Every instant (`starts_at`, `ends_at`, `opened_at`, …) is stored as `INTEGER` unix seconds UTC. A column of integers cannot hold a local-time string by accident, and overlap checks are plain integer comparisons.
- A series stores its start as local wall-clock time (`local_start` `HH:MM`, `duration_min`) plus local dates. Each occurrence's UTC instant is computed at expansion time in the brand's timezone. A series stored as one UTC start would drift an hour at every DST change.
- Wall clock → UTC policy:
  - In the spring-forward gap (a local time that doesn't exist), move forward by the gap.
  - In the fall-back overlap (a local time that happens twice), use the earlier instant.
- Rendering always goes through `Intl.DateTimeFormat` with the brand's IANA zone.
- Countdowns count absolute seconds to `ends_at`, corrected for the phone's clock skew against the server's `now`.

## Consequences
All time logic lives in `src/domain/tz.ts` and is tested across DST in `America/New_York` and in zones with no DST and with non-hour offsets.
