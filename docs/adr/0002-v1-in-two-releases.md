# ADR 0002 — v1 ships as two releases

Status: accepted

## Context
v1 has to answer one question — does a push to 400 followers beat an Instagram story to 4,000? — and also ship the catering module that makes outside trucks switch. Building both before the first is answered delays the answer.

## Decision
- **v1a — the push test.** Auth with Owner and Crew, brands with multiple trucks, theme, shift engine with series and conflict detection, white-label brand page, follow + Web Push (today and open pushes), finder map, unified calendar, one-way Google Calendar + iCal, push-test report. Goes live on our own trucks first.
- **v1b — catering.** Packages, quote builder, quote links, deposits, optional QuickBooks invoices, lead form with real availability, lead pipeline. Lands before outside trucks join.

v1a contains exactly one piece of catering: the shift form can create a `catering` shift (client name and email, tentative or booked), because conflict detection against caterings must be testable.

## Consequences
The schema carries `kind` and catering columns from day one so v1b adds tables rather than reshaping `shifts`.
