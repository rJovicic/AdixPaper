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
THESIS: Every fault is a labelled object, like the ID label on a jumbo paper reel: one unmistakable number, ruled fields, one ink. Refuses the category default of pastel pill badges and a wall of equal stat tiles.
OWN-WORLD: White label stock on a cool reel-core grey ground; near-black ink for numerals and text; the logo blue #2A59A2 is the only brand ink (shell rail, primary actions, links, focus); the wordmark grey #949597 family for rules and quiet text. Palette only from the logo: blue, its deep shade, wordmark grey #949597, white, ink. States are shapes (filled blue new, half blue in progress, hollow grey on hold, filled grey resolved) plus their word; red only for urgent, overdue and errors (owner, 2026-10-27). Archivo variable: normal width for UI, condensed heavy for numbers. Hairline ruled field grids; tabular numerals.
STORY: The lead understands in one glance what is late and who owns it, acts on it, and records the repair; the worker knows the report landed and can see it move.
FIRST VIEWPORT: Desktop — deep-blue left rail (logo, nav, language, account). Main: page title + date; a ruled strip of three label figures (Open · Urgent · Overdue) in condensed numerals; below, open faults ordered by response-window risk as label rows (big condensed fault number, title, machine · component, priority marker, time left, assignee); analytics follow below the fold. Phone — blue top bar, full-width "Report fault" primary action, then fault label cards.
FORM: Reel label, position 1 of the ordered list (user-selected over the assigned #4 T-card board; degraded roll, no challengers). seed: 7afcd9fa784b6b8b
SIGNATURE: the label block — fault number set large in condensed heavy ("#42"), with small uppercase field labels over values in hairline-ruled cells (MACHINE / COMPONENT / PRIORITY / DUE). Used on fault rows, worker cards and the detail header.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
- Photo attachments (not in scope).
