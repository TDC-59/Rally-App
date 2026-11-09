# CONTEXT — Rally glossary

Use these terms, exactly, in code, tests, and UI copy.

**Brand** — the business a customer knows and follows. Owns the slug, theme, timezone, followers, and (from v1b) the lead form, packages, and payment/accounting connections. A one-truck business is a brand with one truck. Customers only ever see the brand.

**Truck** — a vehicle with its own schedule. Belongs to one brand. Its name is console-only. Conflicts are detected per truck.

**Operator** — a person who signs in to the console. Belongs to brands through a **membership** with a **role**:
- **Owner** — everything, including theme, trucks, team, and integrations.
- **Crew** — runs the day: opens and closes shifts, sees the calendar.

**Shift** — a truck at a place, in a time window. Every commitment of a truck's time is a shift. Two kinds:
- **Service** — public. Appears on the brand page, the finder map, the iCal feed, and in pushes. States: `draft → published → open → closed`.
- **Catering** — private, one client, never on the public map. States: `tentative → booked → closed`.
- Either kind can be `cancelled`.

**Open** — a service shift whose window the operator has confirmed is open *right now* by tapping "We're open". Only an operator can open a shift; a clock never does. Open is the only thing that shows signal yellow.

**Tentative hold** — a catering shift held for a quote that hasn't been accepted. Expires at `hold_expires_at`. Two tentative holds never conflict with each other (competing quotes; first deposit wins). Everything else does.

**Conflict** — two non-cancelled shifts on the same truck whose half-open windows `[starts_at, ends_at)` overlap, regardless of kind. Back-to-back is not a conflict. No travel buffer in v1a.

**Series** — a recurrence rule (weekly, by weekday) stored in the brand's local wall-clock time. It is expanded into real shift rows called **occurrences**. An occurrence edited on its own is **detached** and series edits skip it.

**Follower** — an anonymous browser subscribed to a brand's Web Push. No account. Identified only by its push endpoint.

**Push** — one notification sent to all of a brand's followers about one shift. Kinds in v1a:
- **Today push** — on the day of a service shift, before it starts.
- **Open push** — when the operator taps "We're open".
A shift gets at most one push of each kind. Editing a published shift sends nothing.

**Finder map** — `/near-me`. Rally's own page showing every brand that is open now or scheduled today. Wears the Rally layer, never a brand's.

**Push-test report** — the v1a measurement: per shift, followers reached, push clicks, page visits by source, and the operator-entered Instagram story stats and gross sales for comparison.

**Brand layer / Rally layer** — the two CSS token sets: `--t-*` (white-label, per brand) and `--r-*` (Rally's chrome).
