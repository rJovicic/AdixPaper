# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Responsive web app served from one origin, installable to a phone home screen (web app manifest, service worker for push).

## Users

| Role (`rola`) | Who | Situation | Job |
|---|---|---|---|
| `radnik` — worker | Machine operators on the production floor of Cupup d.o.o and Delt papir d.o.o | On a phone, standing at a stopped or misbehaving machine, often mid-shift, noise and time pressure | Report a fault in under a minute and find out later whether someone is on it |
| `voditelj` — maintenance lead | Maintenance technicians and their lead | Desktop in the workshop office, phone on the floor | See what is broken now and what is overdue, take a fault, record the repair (work done, time, cost, spare parts), close it |
| `admin` | Plant/maintenance management | Desktop | Everything a lead does, plus manage people, machines, components, spare-parts catalogue, and pull reports |

Workers only ever see their own reports. Leads and admins see all faults.

## Product Purpose

AdixPaper replaces word-of-mouth and paper fault reporting with one shared record per machine fault: who reported it, on which machine and component, how urgent it is, who fixed it, what was done, how long the machine was down, which spare parts were used, and what it cost.

Success means a reported fault is never lost, urgent faults are picked up inside their response window, and management can see which machines and components cost the most downtime and money.

## Positioning

Built around this plant's own machines, components and spare-parts catalogue (668 parts from the two companies' supplier lists), with response windows tied to fault priority — not a generic CMMS that must be configured first.

## Operating Context

- Fault priorities and response windows: **Hitno / Urgent — 2 h**, **Normalno / Normal — 8 h**, **Nisko / Low — 48 h**, measured from the moment of reporting until the fault is resolved.
- Fault states: **Novo → U rješavanju → (Na čekanju) → Riješeno**. A resolved fault can be reopened. Putting a fault on hold requires a reason — spare parts, outside service, approval, machine availability (production), other — and records since when; the time on hold per reason feeds Analytics.
- A fault needs attention when it is **overdue**, **due soon** (last quarter of its window), **urgent**, **untaken**, or **on hold for more than 24 h**. The server computes these reasons once (`Kvar.razlozi_paznje`); the overview and lists show them in words.
- One person handles a fault (`voditelj_id`, shown as "Preuzeo"). Leads are the technicians; there is no separate manager/technician split. Every reassignment is in the timeline.
- Every change to a fault (status, priority, assignee, component, resolution details, parts) is written to the fault's timeline; leads can add internal notes workers do not see.
- Reports leave the system as Excel (faults; spare-part usage grouped by supplier, one sheet per supplier) and PDF.
- Leads are alerted to new faults in the open app (polling) and, when VAPID keys are configured, by Web Push.
- Reporting periods ("today", "this month") follow the plant's local time, Europe/Zagreb.

## Capabilities and Constraints

- Stack: React 18 + Vite + Tailwind (frontend), FastAPI + SQLAlchemy (backend), PostgreSQL. Deployed as one Railway service plus Railway Postgres.
- Interface languages: Croatian (default) and English, switchable by each user; the choice is remembered on the device. Data entered by users (machine names, fault text) is not translated.
- Domain enum values are stored in Croatian (`Hitno`, `U rješavanju`, …) and translated for display only.
- Accounts are created by an admin; there is no self-registration and no email-based password reset. Every user can change their own password, which signs out their other devices.
- Photos: up to 6 per fault, added by the reporter (while open) or by leads. Stored re-encoded (max 1600 px, EXIF/GPS removed). `foto_url` stays unused.
- A fault can be resolved only once "work done" is filled in.
- Workers see status, assignee, waiting reason, work done, photos and public comments of their own faults; never costs, material, parts or internal notes.
- While reporting, a worker sees the open faults already on that machine (number, title, status, part, time — no names) and may still report.
- Two leads saving the same fault: the second save, made from an older version, is refused (409) and the page offers to load the latest. Nothing is overwritten silently.
- Each machine can have a printed QR label linking to `/m/<id>`.
- Single plant timezone; single currency (EUR).

## Brand Commitments

- Name: **Adix Paper**. Logo: `frontend/public/adix-paper-logo.png` (blue mark with "ADIX PAPER" wordmark); the app icons and in-app mark are drawn from a vector trace of it (`BrandMark`). The logo's blue is the brand colour.
- Companies named in the product: Cupup d.o.o, Delt papir d.o.o.

## Evidence on Hand

- Spare-parts catalogue: `backend/app/seed_data/spareparts.csv` (668 rows: supplier, code, name, unit).
- No usage analytics, user research, or interview findings exist. Nothing in this repository describes how many users there are or how faults were tracked before.

## Product Principles

1. **Reporting a fault must be faster than walking to find someone.** The worker's form asks only what maintenance needs to act: machine, component, what is wrong, how urgent.
2. **What is overdue is the headline.** For leads, the first thing on screen is what needs action now, ordered by response-window risk — not totals.
3. **Every action answers back.** Saving, failing, and waiting are always visible; nothing is lost silently.
4. **The record is the truth.** Changes are logged, destructive actions are confirmed, and history is never deleted to make numbers look better.
5. **Respect the floor.** Large touch targets, readable in bright light, works one-handed on a phone.

## Primary Journey

1. Worker signs in once on their phone (session lasts 8 h) and lands on **My faults**.
2. Taps **Report fault** → picks machine → picks component (when the machine has components) → writes a short title and optional detail → picks urgency → sends. Or scans the QR label on the machine, which opens the form with the machine already chosen. A half-written report survives a reload or an expired session.
3. Sees confirmation and the new fault at the top of their list with status **Novo**.
4. Lead is alerted (in-app notice within ~20 s; push if enabled), sees it in **Needs attention** with the reason ("untaken", "urgent"), opens the fault, **takes it** (status → U rješavanju, lead becomes assignee unless someone already is, start time recorded). If parts are missing, the lead puts it **on hold** with the reason. "Assigned to me" in the fault list is the lead's own queue.
5. Lead records work done, downtime, cost and spare parts, marks it **Riješeno** (work done is required).
6. Worker sees an **Updated** badge (and a push, if enabled), opens their fault and sees the status, who handled it, why it waits, and the public timeline/comments.
7. Admin reviews Analytics for a period (time to take, time to resolve, share on time, downtime, cost, waiting by reason, recurring faults) and exports the month's faults and spare-part usage.

## Accessibility & Inclusion

WCAG 2.2 AA: keyboard operable, visible focus, 4.5:1 text contrast, labelled form controls with errors tied to their fields, touch targets ≥ 44 px on worker screens, reduced-motion respected. Status and priority are never conveyed by colour alone.

## Acceptance Criteria

| Outcome | Observable test |
|---|---|
| Worker can report a fault on a 390 px phone | From sign-in, a new fault is submitted in ≤ 6 interactions after reaching My faults; confirmation and the new list entry appear without reload |
| Invalid input never reaches the server silently | Submitting without machine or title shows field-level messages and focuses the first invalid field |
| Worker sees progress | A worker can open any of their faults and see status, assignee and public comments; internal notes are never shown |
| Lead sees what needs action | Overview's first viewport shows open, urgent, overdue, untaken, waiting-for-parts and resolved-in-period counts, each linking to a list with the same count, and the faults needing attention with the reason in words |
| Hold has a reason | Putting a fault on hold without a reason is refused; the reason is visible to leads and the reporter |
| No silent overwrite | Saving a fault that changed since the page loaded shows a conflict notice and keeps the other person's change |
| Lead closes a fault with parts | Status, work done, minutes, cost and ≥ 1 spare part are saved in one save; the timeline records each change |
| Failures are recoverable | Every list, form and export shows an error with a retry/next step when the API fails; no unhandled promise rejections |
| No lockout | An admin cannot deactivate or demote their own account |
| Take assigns | After "Take", the fault's assignee is the lead who took it (unless already assigned) |
| Worker data isolation | A worker's API responses never contain internal notes, costs, material or parts |
| Scan to report | Scanning a machine's QR label, signed out, leads through sign-in to the report form with that machine chosen |
| Language | Every screen renders fully in Croatian and English; switching does not lose form input or session |
| Responsive | No horizontal page scroll at 360, 768, 1280 px; tables become cards on phones |
| App is online | `GET /health` returns 200 on the public Railway domain; deep links (e.g. `/admin/kvarovi/12`) load the app |

## Open Questions

- How many workers share a phone, and is a 480-minute session right for shared devices?
- Are the response windows (2 h / 8 h / 48 h) the agreed internal targets, or placeholders?
- Should the dashboard separate the two companies (Cupup / Delt)?
- How long should photos be kept (storage grows ~1 GB/year at 50 photos a week)?
- Must production data stay in the EU (the service currently runs in Railway `us-west2`)?
