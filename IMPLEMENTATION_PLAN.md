# Implementation plan — command center, fault workflow, worker flow

Branch: `claude/command-center-redesign` (from `main` @ `ab992b2`). Started 2026-10-27.
This file is the session's source of truth: if work is interrupted, resume from **Next task**.

## 1. Audit summary (2026-10-27, this pass)

The previous two passes (see `AUDIT.md`) left a coherent, tested app: FastAPI + SQLAlchemy + Postgres,
React 18 + Vite + Tailwind, one Railway service, 57 backend tests, 25 Playwright e2e tests with axe scans.
The stack described in the brief matches the repository. Nothing in this pass changes it.

### Baseline (before any change, commit `ab992b2`)

| Check | Result |
|---|---|
| `ruff check app tests` | clean |
| `pytest` on PostgreSQL 16 | **57 passed** |
| `npm run lint`, `check:i18n`, `build` | clean / 361 keys OK / OK |
| Playwright e2e against the production build (FastAPI serving `dist`, Postgres) | **25 passed** |

No pre-existing failures. (One e2e failure appeared only when an orphan server from a previous run held stale data; it passed on a clean DB.)

### Gaps against the brief (confirmed by reading code and running the app)

| ID | Pri | Gap | Evidence |
|---|---|---|---|
| G1 | P1 | Overview shows 3 counts and a list; no unassigned / waiting / in-progress / resolved-in-period counts, no workload, no recent activity, no period selector | `pages/admin/Dashboard.jsx` |
| G2 | P1 | Attention list never says *why* a fault needs attention; the reader infers it from time + priority | same |
| G3 | P1 | "Na čekanju" has no reason or start time: nobody can tell whether a fault waits for parts, an outside service, approval or the machine | `models.Kvar`, `routers/kvarovi.py` |
| G4 | P1 | Two leads editing one fault: last write wins silently (AUDIT A2-29) | `update_kvar` has no version check |
| G5 | P2 | Workers cannot attach a photo (AUDIT A2-32); the brief asks for it | `foto_url` unused |
| G6 | P2 | No duplicate warning when reporting (AUDIT A2-33); the brief asks for one that does not block | `ReportFault.jsx` |
| G7 | P2 | Fault list downloads every fault and filters in the browser (AUDIT A2-30) | `Faults.jsx` |
| G8 | P2 | Analytics has no MTTR, response time, SLA compliance, MTBF, waiting time or recurring faults, and no period selector | `Analytics.jsx`, `dashboard.py` |
| G9 | P2 | Fault detail has no machine history and no attachments; status actions offer "pause" without a reason | `FaultDetail.jsx` |
| G10 | P3 | Workers are not told when their fault changes (AUDIT A2-31) | no "updated" signal |
| G11 | P3 | Phone navigation: the worker's main action scrolls away; leads get only a drawer | `WorkerShell.jsx`, `AdminShell.jsx` |

### Deliberately not done (with reasons)

- **Semantic colours (green/amber).** The brief and the reference images use them, but the owner decided on
  2026-10-27 (`decisions.md`, "Back to the reel label, logo colours only") against "crayons". The newest
  explicit owner decision wins; layout, hierarchy, density and components follow the references. The palette is
  token-driven (`index.css :root`), so adding semantic hues later is a one-file change. **Owner to confirm.**
- **Separate "responsible manager" and "technician".** The domain has one handler per fault (`voditelj_id`);
  leads *are* the technicians (PRODUCT.md). Adding a second role would invent a business rule. Ownership history
  is already kept in the timeline (`assignment` events with old/new).
- **Stock levels / inventory movements.** The owner removed stock from the UI on 2026-10-27; parts used are
  recorded per fault and replaced atomically (no double counting). No stock is changed by this pass.
- **Offline queueing.** Not promised; reports need a connection. Drafts already survive reloads.
- **In-app QR scanner.** Printed labels open `/m/<id>` with the phone's own camera on iOS and Android; an in-app
  scanner needs `BarcodeDetector` (absent on iOS Safari) or a library in the worker bundle.
- **Alembic.** All schema changes in this pass are additive (new nullable columns / defaulted columns / one new
  table) and use the existing `ensure_additive_schema` path. Alembic stays recommended before the first
  non-additive change (AUDIT A2-28).

## 2. Phases

| Phase | Scope | Depends on | Verification |
|---|---|---|---|
| 1 | Backend: waiting reason + since; fault `verzija` + 409 on stale save; attention reasons on every fault; overview endpoint (KPIs, workload, activity, period); machine open-faults endpoint for duplicate warning | — | new pytest cases on Postgres |
| 2 | Overview redesign (KPI strip → filtered lists, attention queue with reasons, workload, activity, period) | 1 | e2e + screenshots 390/1366 |
| 3 | Fault detail: waiting-reason dialog, conflict handling, machine history, layout per references | 1 | e2e |
| 4 | Photos: `kvar_prilozi` table, upload (re-encoded JPEG, EXIF stripped, size/type limits), worker + lead views | 1 | pytest (types, limits, isolation) + e2e |
| 5 | Worker: duplicate warning, photo on report, "updated" badge, bottom action bar | 1, 4 | e2e at 390 px |
| 6 | Fault list: server-side paging/search/filters incl. waiting reason | 1 | pytest + e2e |
| 7 | Analytics: period selector, MTTR, time to take, SLA compliance, downtime, MTBF per machine, waiting by reason, recurring faults | 1 | pytest with hand-computed values |
| 8 | Lead phone navigation, polish, docs (DESIGN/PRODUCT/AUDIT/decisions), full regression | all | full suite |

## 3. Progress log

| Phase | Status | Commit | Verified by |
|---|---|---|---|
| 1 Backend workflow | Done | `0be4d5b` | `tests/test_workflow.py` (8); migration run against a DB created by the old code |
| 4 Photos (backend) | Done | `77310f2` | `tests/test_prilozi.py` (7): formats, EXIF/GPS stripped, limits, isolation, delete rules |
| 2 Overview | Done | `61af697` | e2e `workflow.spec.js` (reasons, drill-down, figure → list); axe on phone overview; screenshots 390/1366 |
| 3 Fault detail | Done | `61af697` | e2e: hold with reason, stale save → banner → reload → save |
| 6 Paged list | Done | `61af697` | pytest paging/search/filters; existing list e2e |
| 5 Worker | Done | `923024e` | e2e: duplicate warning, photo on report, updated badge, tab bar hidden on form; axe |
| 7 Analytics | **Next** | | |
| 8 Lead phone nav, docs, regression | Pending | | |

Test totals after phase 5: pytest **72** (Postgres and SQLite), e2e **30**, lint/i18n/build clean.

Files changed so far: `backend/app/{models,schemas,bootstrap,timeutil,images}.py`, `backend/app/routers/{kvarovi,dashboard}.py`,
`backend/tests/test_{workflow,prilozi}.py`, `frontend/src/pages/admin/{Dashboard,Faults,FaultDetail}.jsx`,
`frontend/src/pages/worker/*`, `frontend/src/components/{Photos,FaultCard,Timeline,WorkerShell}.jsx`, `components/ui/Marks.jsx`,
`frontend/src/lib/{events,photo,seen}.js`, `i18n/*`, `e2e/tests/{workflow,quality,worker}.spec.js`, `e2e/seed-demo.py`.

Known limitations introduced/kept:
- Faults put on hold *before* this release have no reason or start time; they show as on hold without a reason until changed.
- A report retried after a network failure that actually reached the server can create a duplicate; the duplicate warning shows the first one. No idempotency key (would need a column and client key).
- The "updated" badge is per device (localStorage).

## 4. Next task

Phase 7 — analytics endpoint with period (`od`/`do`): MTTR, time to take, SLA compliance, recorded downtime,
cost, waiting time by reason (from status events), MTBF per machine, recurring faults; then the Analytics page.
