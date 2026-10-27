---
version: 1
slug: "frontend-src-app-jsx"
primary_target: "frontend/src/App.jsx"
related_targets: ["frontend/src"]
---

## Scope
Whole app (operate mode): sign-in, worker "My faults" + report form + fault view, lead/admin overview, fault list, fault detail, machines, spare parts, people, analytics. Croatian and English.

## Audience and task
Workers report a fault from a phone at the machine; leads triage what is overdue and record the repair; admins manage data and export. Constraints: bright shop floor, one hand, gloves; leads on desktop.

## Direction contract
THESIS: The plant prints napkin and towel packaging; the app reads like a press sheet. Time against a fault's response window is ink laid down: a density strip that fills and changes ink as the deadline nears. Refuses the category default of a grey dashboard with pastel status pills and equal stat tiles.
OWN-WORLD: Key-black shell (#111316) with white sheet surfaces on a cool #F3F4F6 ground. Process inks do the state jobs: cyan = new, yellow = in progress / due soon, magenta = urgent / overdue, a green spot = resolved, hollow key = on hold / low. Logo blue #2A59A2 stays the action ink (primary buttons, links, focus). Geist for UI; Geist Mono for fault numbers, times, counts and small caps labels. 10 px radii, hairline rules, soft offset shadows.
STORY: A lead sees in one glance what is late and who owns it, from the colour bar and the strips; a worker sees their report land and the strip move until someone takes it.
FIRST VIEWPORT: Desktop — key-black left rail (logo, search field with Ctrl K that works on every screen, nav with overdue count, account menu at the foot). Main: title + mono date; a press colour bar of five ink patches (Open, Urgent, Overdue, In progress, Unassigned) between registration marks; below, "Needs attention" table with All / Unassigned / Mine tabs and each row's due strip, beside a "My faults" panel. Phone — key-black top bar with avatar menu, full-width blue "Report fault", underline tabs, fault cards each topped by its due strip.
FORM: Press-production marks (CMYK colour bar, density steps), position 3 of the ordered list (work orders, T-card board, press marks, safety signage, departure board, swatch books); user-selected from mockups. seed:51fd582c1ecfd074
SIGNATURE: the due strip — 12 density steps, ink rising from 35 % to solid as the response window is used: cyan while on time, yellow from 75 %, magenta once overdue. On rows, cards, the fault header and the overview colour bar.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
- Photo attachments (not in scope).
