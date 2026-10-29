# Improvement log

Running record of the improvement pass that started 2026-10-29 on branch
`claude/adix-paper-improvement-scd3or`. Each entry: problem, change, evidence. Read this first
when resuming work.

## Baseline (2026-10-29, commit `2f8a6e2`, before any change)

| Check | Command | Result |
|---|---|---|
| Backend lint | `cd backend && ruff check app tests` | pass |
| Backend tests (PostgreSQL 16, local) | `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/adix_test python -m pytest -q` | **124 passed** |
| Frontend lint | `cd frontend && npm run lint` | pass |
| Translation parity | `npm run check:i18n` | pass (601 keys, 530 referenced) |
| Production build | `npm run build` | pass (main chunk 389 kB / 128 kB gz; Analytics 397 kB, recharts) |

Environment notes: Python 3.12 venv via `uv` (`pywebpush` → `http-ece` fails to build on the
system Python 3.13); PostgreSQL 16 started locally. CI runs PostgreSQL 16 and 18.

### Verified strengths (read in code, covered by tests)

- Object-level access for workers (`_ensure_kvar_access`, list filter), internal fields stripped
  from worker fault responses (`KVAR_INTERNAL_FIELDS`), internal comments filtered.
- Optimistic concurrency (`verzija` + row lock), idempotent reports (`klijent_kljuc`), hold
  reasons, password change revokes other sessions (`sesije_od`), deactivated users rejected on
  every request.
- Photo re-encoding (EXIF/GPS stripped, format and pixel limits, body-size guard before parsing).
- SSE stream authenticates with the header, re-checks the session, carries only ids.
- Plant-time periods are DST-safe; analytics definitions are tested with hand-computed values.

### Documents reconciled

PRODUCT.md, AUDIT.md, IMPLEMENTATION_PLAN.md, PRE_PRODUCTION_CHECKLIST.md, DESIGN.md,
DEPLOYMENT.md, README.md, decisions.md. Treated as history; every finding below was checked in
the current code.

## Findings and fixes

Severity: Critical / High / Medium / Low. Status: **Fixed** (with test), **Open**, **Owner**.

### Round 1 — authorization and record integrity (backend)

| # | Sev | Finding (evidence) | Fix | Test |
|---|---|---|---|---|
| R1-1 | High | Workers received summed **repair costs per machine**: `GET /api/oprema` and `/api/oprema/{id}` return `ukupni_troskovi` to any signed-in user (the worker report form loads this list). Violates "workers never see costs". | `ukupni_troskovi` is `null` for workers (`routers/oprema.py::_for_user`); leads/admins unchanged. | `test_integrity.py::test_workers_never_receive_machine_repair_costs` |
| R1-2 | Medium | Worker timeline showed **internal changes**: a "spare parts updated (count n)" event and "details updated: troskovi, materijal" were public; only a change to internal notes alone was hidden. | Parts events are internal; a details change is split into a public entry (work done, downtime) and an internal one (cost, material, notes). | `test_worker_timeline_hides_changes_to_costs_material_and_parts` |
| R1-3 | Medium | A **resolved fault could lose "work done"**: the rule was checked only on the transition to Riješeno, so a later save could blank it. | Checked on every save that leaves the fault resolved. | `test_a_resolved_fault_cannot_lose_its_work_done` |
| R1-4 | Medium | **Lifecycle dates accepted from the client unchecked**: `PUT` accepted any `datum_pocetka` / `datum_rjesavanja` (future, before the report, or a resolution date on an open fault), corrupting SLA and MTTR. The UI never sends them; scripts might. | Kept in the API, validated: not before the report, not in the future (2 min skew), start ≤ resolution, resolution only on a resolved fault; explicit `null` ignored (status changes own them). | `test_lifecycle_dates_cannot_contradict_the_status_or_the_clock` |
| R1-5 | Medium | **Worker could add photos to a resolved fault** through the API (PRODUCT.md: reporter adds photos while open; the UI already hid the button). | 403 for workers once resolved; leads unchanged. | `test_worker_adds_photos_only_while_the_fault_is_open` |
| R1-6 | Medium | **Editing parts failed** with "Spare part not found" when the fault already listed a part that was later deactivated in the catalogue (soft-deactivation broke history editing). | A part already on the fault stays valid; new parts must be active. | `test_parts_list_can_be_edited_when_it_holds_a_part_since_deactivated` |
| R1-7 | Low | `POST /api/notifikacije/posalji` (unused by the UI, lead-only) pushed to **deactivated users' devices** and accepted **any URL**, which the service worker opened (another site from a trusted notification). | Active users only; `url` must be an in-app path; `sw.js` opens same-origin paths only. | `test_manual_push_accepts_only_in_app_links` |

Verification after round 1: `ruff check app tests` pass; full backend suite **131 passed**
(PostgreSQL 16).

### Round 2 — browser journeys, layout and live-state honesty (frontend)

Evidence: the production build served by FastAPI on :8000 (PostgreSQL 16, `e2e/seed-demo.py`
data), screenshots at 390 × 844 and 1366 × 900, plus the Playwright suite.

| # | Sev | Finding (evidence) | Fix | Test |
|---|---|---|---|---|
| R2-1 | High (worker, phone) | **Report form stretched the page to 2 802 px** at 390 px with a long machine list: the visually hidden radio inputs (`sr-only`, absolutely positioned) had no positioned ancestor, so they escaped the scrolling list. The worker could scroll into blank space, and focusing a radio could jump the page. Measured `document.scrollHeight` 2802 → 920 after the fix. | `relative` on the list and its rows (`ReportFault.jsx`). | e2e `redesign.spec.js` › "a long machine list scrolls inside its box…" |
| R2-2 | Medium (lead/admin) | **Stale data shown without warning** off the overview: only the overview reported a lost live connection; the fault list, fault detail and every worker screen kept the last data silently while offline. | `ConnectionNotice` in both shells: offline at once, a lost connection after an 8 s grace (planned stream rotations stay silent); the overview keeps only its "live" label, so the message is not shown twice. Texts already existed in both languages. | e2e `live.spec.js` › "offline, every screen says the data may be behind…" |
| R2-3 | Medium (lead, desktop) | **Fault-list filters clipped** at 1366 px: seven selects in one row cut their labels ("Svi otvoren", "Bilo koji raz", "Najnoviji pr"). | One row only from 1536 px (active) / 1280 px (resolved); two rows of four below. | screenshot check; overflow e2e still passes |
| R2-4 | Low (lead, phone) | **KPI changes without context on phones**: "↑ 23" with no "vs last week" (the reference line was hidden below `sm`; only screen readers heard it). | Reference line shown at every width; cards without one no longer reserve a blank line. | screenshot check; axe e2e passes |

Checked and left as is (working as intended): live stream reconnect/stall/backgrounding logic,
de-duplication of new-fault alerts (per id, OS notifications share a tag across tabs),
quiet refresh keeps data on failure, service worker has no fetch cache (no offline write
promise), maskable icon inside the 80 % safe zone, manifest colours and launch handler.

Verification after round 2: `npm run lint` pass, `npm run check:i18n` pass, `npm run build`
pass; Playwright against the production build **56 passed** (54 existing + 2 new); backend
**131 passed**.

### Round 3 — owner decisions (2026-10-29): first-response SLA, historical part prices, sensitive data, management screens

#### First-response SLA (owner: the 2 h / 8 h / 48 h are first-response targets)

- **Definition.** First response = the first time a lead or admin moves a fault out of "Novo" (take → U rješavanju, hold → Na čekanju, or resolve). Recorded once by the server in the new column `kvarovi.datum_odziva`; never sent by the client; kept when the fault is reopened. Edits, comments and assignment alone are not a response.
- **Rule.** Only a fault still waiting (status Novo and no `datum_odziva`) can be overdue / due soon (`Kvar.ceka_odziv`, `udio_roka_u`, `razlozi_paznje_u`). After the response, `odziv_u_roku` says whether it was within the window.
- **Everywhere:** attention reasons and overview "overdue", the `sla` filter and `sort=rizik` on the fault list (and the rail's overdue badge, which uses that filter), Excel/PDF "Odziv" column ("Odziv u roku" / "Odziv izvan roka" / waiting states) plus a "Prvi odziv" date, the legacy `/dashboard/stats`, fault list and detail (countdown only while waiting; outcome afterwards; detail fields "Rok odziva" and "Prvi odziv"), report-form priority hints ("Odziv u 2 h"), Analytics.
- **Analytics.** "Time to first response" replaces "time to take" (mean over faults first responded to in the period). "Responded on time" = of faults *reported* in the period, the share whose first response was within the window. A fault with no response after its window counts as late; one still inside its window is not judged yet; faults that left "Novo" with no trace of when are not judged. MTTR (time to resolution) and repair time are unchanged and separate. API: `vrijeme_do_preuzimanja_min` → `vrijeme_do_odziva_min`, new `sla_ocijenjeno` (frontend and tests updated together).
- **Existing data** (filled once in the transaction that adds the column): first status change away from "Novo" in the timeline, else `datum_pocetka`, else `datum_rjesavanja`; faults still new stay empty. Verified on PostgreSQL with data created by the `main` release.

#### Historical spare-part prices

- New columns `kvar_rezervni_dijelovi.jedinicna_cijena` (unit price when used) and `cijena_naknadno` (true for rows that existed before the upgrade). New usage copies the catalogue price; re-saving a fault's parts list carries each existing part's recorded price over, so editing quantities never re-prices the past.
- Every cost uses it: analytics period parts cost and top parts, per-machine cost, `/dashboard/stats`, `/dashboard/utrosak-dijelova`, the parts Excel export (with a "Cijena upisana naknadno" column), fault detail data.
- **Rows without a historical price:** frozen at the catalogue price at upgrade time and flagged. That is the best value available, and it no longer drifts. A part with no catalogue price stays `NULL` and costs 0, as before.

#### Management screens

| # | Screen | Finding | Change |
|---|---|---|---|
| R3-1 | Machines | **Cost column showed labour only** under "Cost"; Analytics per-machine cost the same, while the period total included parts. | Machine cost = labour + parts at recorded prices (API, list, Analytics); header "Trošak (rad + dijelovi)". |
| R3-2 | Machines | **Dead delete action**: offered for every machine, always refused (409) for machines with faults after a confirmation. | Shown only for machines without faults; machines with faults are retired via status "Raspisano" (as the server message already says). |
| R3-3 | Machines | No status filter; decommissioned machines mixed in. | Status filter beside search (client-side; list already loaded). |
| R3-4 | Spare parts | **Part names truncated** to ~25 characters at 1366 px (`max-w-0` collapsed the name column while "Unit" took the width). | Name column takes the width, up to two lines, full name on hover; unit/price shrink to content. |
| R3-5 | Spare parts | **A removed part could not be restored** in the UI (API supported it); an accidental removal was permanent for users. | "Show removed" toggle, "Removed" badge, "Return to catalogue" action; the header counts active parts only. |
| R3-6 | Spare parts | Price edits gave no hint that past costs are fixed now. | Hint in the edit dialog. |
| R3-7 | Users | 81 people, **no search or filter**. | Search (name, username, department) + role filter, result count, "clear filters" empty state. |
| R3-8 | Analytics | The monthly chart looked empty in a screenshot. | **Not a bug**: bars render after recharts' animation (measured 155 px / 16 px). No change. |
| R3-9 | Analytics | Definitions described the old SLA and catalogue-price costs. | Rewritten in both languages for first response and recorded prices. |

#### Supplier data exposure

- Tracked files and the history of all 79 commits were searched: catalogue prices/stock appear **only** in `backend/app/seed_data/spareparts.csv` (552 of 668 rows priced), added in `08db6e1` and unchanged since. No price appears in other files, docs or the two design screenshots (checked visually); sampled part codes occur nowhere else.
- On this branch the file now holds supplier, code, name, unit only. Production is unaffected (seed loads only into an empty table).
- **Not done (needs authorisation):** repository visibility and history rewrite. Steps in PRE_PRODUCTION_CHECKLIST.md §10 item 7.

#### Production configuration (read-only check)

Railway MCP, `list-variables` for service AdixPaper (production), **names only — the tool returned values redacted**:
`RESET_USERNAME`, `RESET_PASSWORD`, `ADMIN_RESET_PASSWORD` are **not set**. `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` **are set** (the 2026-10-28 checklist said unset), so push is configured but not verified on devices.

#### Verification (round 3)

| Check | Result |
|---|---|
| `ruff check app tests` | pass |
| Backend tests, PostgreSQL 16 | **139 passed** (new: `test_response_window.py` 5, `test_part_prices.py` 3; updated: `test_analitika.py` hand calculation, `test_workflow.py` attention reasons) |
| Backend tests, SQLite | 137 passed, 2 skipped (PostgreSQL-only) |
| Upgrade from `main` on PostgreSQL 16 (CI `upgrade` job steps run locally; `upgrade-check.py` extended to assert parts costs unchanged and first responses filled) | `upgrade OK: 5 faults, 12 events, 4 machines, 4 users, 668 parts unchanged`; second restart healthy |
| Migration on a hand-built legacy SQLite schema, run twice | backfill values as specified; idempotent; frozen price survives a catalogue change |
| Frontend lint, i18n parity (614 keys), production build | pass |
| Playwright against the production build | **60 passed** (new `management.spec.js` 4) |

## Open items

### Owner decisions

| # | Topic | Why it matters | Needed |
|---|---|---|---|
| O-1 | ✅ **Resolved 2026-10-29 (round 3): first response.** ~~SLA wording vs. rule.~~ The code measures 2 h / 8 h / 48 h from report **to resolution** (PRODUCT.md says the same), but the UI calls it "Rok odziva" / "Response due" and "response window", which reads as time-to-take. | A lead may believe taking a fault in time meets the target; on-time % in Analytics would then surprise. | Confirm which is intended. If resolution: rename to "Rok rješavanja" / "Resolve by" (copy only). If response: the rule changes to "taken by" (code + analytics + tests). Not changed silently. |
| O-2 | **Backups: owner agreed 2026-10-29; not enabled yet** (operator action, PRE_PRODUCTION_CHECKLIST §10). | Any bad delete, faulty migration or volume failure is permanent; code rollback does not restore data. Photos live in the database too. | Strongly recommended: Railway Postgres Daily + Weekly backups (≈ cents/month at 0.32 GB), then one restore drill on staging. |
| O-3 | **Public repository** — file cleaned on the branch (round 3); visibility/history still owner actions. carries the supplier catalogue with prices and stock (`backend/app/seed_data/spareparts.csv`). | Commercially sensitive data is public; history keeps it even if the file is removed. | Decide on making the repo private (check Actions minutes) or purging the file from history. |
| O-4 | ✅ **Resolved (round 3): recorded unit prices.** ~~Spare-part costs in Analytics and exports use the **current catalogue price**, not the price at the time of use. | Editing a price rewrites past cost figures. | Decide whether historical prices matter; if yes, store the unit price on each usage row (additive column). |
| O-5 | Privacy notice, Railway DPA, retention for faults and deactivated users (PRE_PRODUCTION_CHECKLIST §8). | GDPR obligations for employee data and photos. | Company/legal text. |

### Operator tasks (need access, not code)

- Turn on **Wait for CI** for the Railway service: merging to `main` deploys immediately.
- Set `VAPID_*` if push is wanted, then verify on a real iPhone (installed app) and Android:
  subscribe, test button, a new fault while the phone is locked. Not verified in this pass.
- Scan one printed QR label with iPhone and Android, signed out, before printing all.
- Free monitoring: scheduled GitHub Action hitting `/health` and `/health/jobs`.
- Switch `PHOTO_RETENTION_MODE` to `delete` when agreed.
- Never leave `RESET_USERNAME` / `RESET_PASSWORD` or `ADMIN_RESET_PASSWORD=true` set: they
  re-apply on every start, overwrite the person's own password and sign them out everywhere.

### Not verified in this environment

Real devices (camera/QR scanning, install prompt, push delivery), production Railway behaviour,
PostgreSQL 18 locally (CI covers 16 and 18), the CI `upgrade` job (needs the `main` worktree
flow; the schema changes in this pass are none).
