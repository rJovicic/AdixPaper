---
version: 1
slug: "frontend-src-app-jsx"
primary_target: "frontend/src/App.jsx"
related_targets: ["frontend/src"]
---

## Scope
Whole app (operate mode): sign-in, worker "My faults" + report form + fault view, lead/admin dashboard, fault list, fault detail, machines, spare parts, people. Croatian and English.

## Audience and task
Workers report a fault from a phone at the machine; leads triage what is overdue and record the repair; admins manage data and export. Constraints: bright shop floor, one hand, gloves; leads on desktop.

## Direction contract
THESIS: A plant-floor console: a deep navy frame around a cool light work surface, white cards, one saturated action blue, state in pale pills with a dot and a word. Replaces the 2026-10-27 "reel label" world (owner's five-screen reference, 2026-10-28, is the visual authority).
OWN-WORLD: Navy #10265A frame (rail, phone header, status bar), ground #F4F6FA, white cards 14 px, action blue #1F56D0, semantic states (red urgent, amber waiting/normal, blue in progress, violet new, green resolved, slate low). White Adix Paper mark on navy. Archivo at normal width; bold tabular figures.
STORY: The lead sees in one glance what is open, urgent, waiting and resolved today, and how that moved; picks the most pressing fault; the worker reports in three short steps and sees it move.
FIRST VIEWPORT: Desktop — navy rail + white top bar (search, bell, HR/EN, avatar); greeting + "Prijavi kvar"; four KPI cards with solid icon tiles and honest changes; priority table beside live activity. Phone — navy header, greeting, full-width "Prijavi kvar", 2 × 2 KPIs, priority rows, bottom tab bar with a raised "+".
SIGNATURE: the raised "+" in the bottom bar and the priority-marker fault row (round marker, machine #number, title, pills, "Danas 08:42").
FINISH: DESIGN.md rewritten from the shipped build; screens verified at 390/430/768/1024/1440 against the reference.

## Unresolved
- Photo attachments (not in scope).
