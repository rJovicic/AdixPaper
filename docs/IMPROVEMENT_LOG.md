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

## Open items

### Owner decisions

| # | Topic | Why it matters | Needed |
|---|---|---|---|
| O-1 | **SLA wording vs. rule.** The code measures 2 h / 8 h / 48 h from report **to resolution** (PRODUCT.md says the same), but the UI calls it "Rok odziva" / "Response due" and "response window", which reads as time-to-take. | A lead may believe taking a fault in time meets the target; on-time % in Analytics would then surprise. | Confirm which is intended. If resolution: rename to "Rok rješavanja" / "Resolve by" (copy only). If response: the rule changes to "taken by" (code + analytics + tests). Not changed silently. |
| O-2 | **Backups are off** (owner, 2026-10-28). | Any bad delete, faulty migration or volume failure is permanent; code rollback does not restore data. Photos live in the database too. | Strongly recommended: Railway Postgres Daily + Weekly backups (≈ cents/month at 0.32 GB), then one restore drill on staging. |
| O-3 | **Public repository** carries the supplier catalogue with prices and stock (`backend/app/seed_data/spareparts.csv`). | Commercially sensitive data is public; history keeps it even if the file is removed. | Decide on making the repo private (check Actions minutes) or purging the file from history. |
| O-4 | Spare-part costs in Analytics and exports use the **current catalogue price**, not the price at the time of use. | Editing a price rewrites past cost figures. | Decide whether historical prices matter; if yes, store the unit price on each usage row (additive column). |
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
