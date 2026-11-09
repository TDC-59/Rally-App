# ADR 0001 — Shift state depends on kind

Status: accepted

## Context
Service shifts and caterings share the `shifts` table (the whole product depends on that). Their lifecycles differ: a service shift is drafted, published to followers, opened by the operator, and closed. A catering is held tentatively for a quote, booked when the client commits, and closed after the event. A single flat state enum would allow nonsense like a `published` catering (which would leak a private event onto the public map) or a `tentative` service shift.

## Decision
- Service: `draft → published → open → closed`.
- Catering: `tentative → booked → closed`.
- Either may become `cancelled`.
- The database enforces this with a CHECK constraint tying `state` to `kind`. The application enforces allowed transitions in `src/domain/shift-state.ts`.

## Consequences
A bug in application code cannot put a catering on the public map through its state. New states need a migration, which is intended.
