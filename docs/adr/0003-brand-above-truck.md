# ADR 0003 — A brand sits above its trucks

Status: accepted

## Context
Customers follow a business, not a vehicle. A business with two trucks has one Instagram, one logo, one set of followers, and one catering pipeline, but two schedules that can each conflict on their own.

## Decision
- `brands` owns slug, theme, timezone, followers, and (later) lead form, packages, and payment/accounting connections.
- `trucks` belongs to a brand and owns only a name and a schedule.
- Memberships (Owner, Crew) attach operators to brands.
- Conflict detection runs per truck. Google Calendar connects per truck.
- A one-truck business is a brand with one truck. There is no separate code path.

## Consequences
The public page lists every truck's public shifts under the brand. If two trucks are open at once, the page shows two live locations. Truck names never reach customers.
