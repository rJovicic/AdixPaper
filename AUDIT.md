# AdixPaper — Technical & UX Audit

Audit date: 2026-10-26. Baseline: commit `466052a` ("Fix used spare parts save").
Every finding is marked **Confirmed** (reproduced, or observed in logs/browser/tests) or **Hypothesis** (from code reading, not reproduced). Status reflects this release.

## 1. Executive summary

AdixPaper is a working maintenance fault-tracking app (FastAPI + React) for the Cupup d.o.o / Delt papir d.o.o plants. The application code was largely functional; **it was offline because of deployment configuration, not code**:

- The Railway service built the repository root, where Railpack found only `start.sh` (a local development script) and ran it in an image with neither Python nor Node. Nothing ever listened on `$PORT`; the edge returned `502 connection dial timeout`. No database existed and no variables were set.
- A committed default JWT secret allowed anyone to forge an admin token.

Beyond deployment, the audit found data-integrity crashes (500s on ordinary actions), an Excel export that has never worked on PostgreSQL, an unusable machine form, an admin self-lockout, and a UI split across three visual styles with weak feedback, no worker visibility into their own faults, and a phone layout that clips the fault table.

Deployment and backend issues are fixed and verified (production `/health` 200 over the public domain; 26 automated tests). Frontend issues are addressed by the redesign described in `PRODUCT.md` and `DESIGN.md`.

## 2. Confirmed architecture

| Area | Finding | Evidence |
|---|---|---|
| Frontend | React 18, Vite 5, Tailwind 3, React Router 6, axios, recharts, lucide-react; npm (lockfile v3) | `frontend/package.json` |
| Backend | FastAPI, SQLAlchemy 2 ORM, Pydantic 2, bcrypt, JWT (HS256), openpyxl/reportlab exports, pywebpush | `backend/requirements.txt`, `backend/app/` |
| Database | PostgreSQL in production (SQLite works locally). Schema by `create_all` plus two additive `ALTER TABLE`s; no migration tool | `backend/app/bootstrap.py` |
| Auth | Username/password → JWT bearer (8 h) stored in `localStorage`; roles `admin`, `voditelj`, `radnik` enforced server-side per route | `backend/app/auth.py`, routers |
| Routing | `/login`, `/radnik` (worker), `/admin/*` (lead/admin: dashboard, kvarovi, kvarovi/:id, oprema, rezervni-dijelovi, radnici) | `frontend/src/App.jsx` |
| Integrations | Web Push (VAPID) optional; no other external APIs | `routers/notifikacije.py` |
| Deployment (before) | Docs described two Railway services (frontend Node proxy + backend) + Postgres; actual project had one service at repo root, no DB, no variables | Railway API: service config, `RAILWAY_DEPLOY.md` |
| Deployment (now) | One Railway service built from root `Dockerfile` (Node build stage → Python runtime); FastAPI serves API and SPA on one origin; Railway Postgres | `Dockerfile`, `railway.toml` |
| Tests/CI | None before this audit | — |

## 3. Existing functionality (traced end to end)

- Worker: sign in → list own faults (open/resolved) → report fault (machine, optional component, title, description, priority). Push/in-app alert to leads.
- Lead/admin: dashboard (counts, SLA, monthly chart, status, priority, top machines/components/parts); fault list with status/priority/SLA filters; Excel/PDF/spare-parts exports; fault detail with quick status actions, resolution fields, spare-parts usage, timeline, public/internal comments.
- Admin: machines + components; spare parts + suppliers (668 seeded); users (create, edit, deactivate).
- Response windows (SLA): Urgent 2 h, Normal 8 h, Low 48 h (`models.SLA_SATI`).
- Dead code: `routers/odrzavanje.py` and `pages/Odrzavanje.jsx` referenced a model that does not exist and were never mounted.

## 4. Critical and high-priority problems

| ID | Severity | Finding | Evidence | Impact | Resolution | Status |
|---|---|---|---|---|---|---|
| C1 | Critical | Railway service never ran the app | **Confirmed.** Deploy log `3de76b27`: `uvicorn: command not found`, `npm: command not found`; Railpack "Detected Shell → bash start.sh"; HTTP logs: `502 connection dial timeout` for real browser requests at 13:11 and 13:34 UTC; replicas running: 0 while status read "SUCCESS" | App offline | Root `Dockerfile` + `railway.toml` (Dockerfile builder, `/health` check, restart policy) | **Fixed** — deployment `f98dd065`: external `GET /health` 200, `GET /login` 200 |
| C2 | Critical | No database, no variables | **Confirmed.** Railway project had one service, `variableNames: []` | Backend would crash connecting to `localhost:5432` | Added Railway Postgres; set `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `SECRET_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` | **Fixed** |
| C3 | Critical | Hardcoded JWT secret in public repo | **Confirmed.** Token signed with `adix-paper-super-secret-key-2024` returned 200 on `/api/auth/me` as admin | Full admin takeover of any deployment without `SECRET_KEY` | No default; startup fails in production without `SECRET_KEY`; random ephemeral key in local dev | **Fixed** (test `test_token_signed_with_old_public_default_secret_is_rejected`) |
| C4 | Critical | Unauthenticated `/api/auth/register` creates an admin when no admin exists | **Hypothesis** (code path read; not exploited — prod was never reachable) | First visitor of a fresh DB without `ADMIN_*` becomes admin | Endpoint removed; first admin comes only from `ADMIN_*` variables | **Fixed** |
| H1 | High | Excel export crashes on PostgreSQL | **Confirmed** by test on Postgres: `TypeError: Excel does not support timezones` (timestamptz values) | Faults export has never worked in production | Export plant-local naive timestamps | **Fixed** |
| H2 | High | Deleting a machine that has faults → 500 | **Confirmed** (`DELETE /api/oprema/1` → 500, FK/NOT NULL) | Error with no explanation | 409 with guidance to set status "Raspisano" | **Fixed** |
| H3 | High | Admin can deactivate or demote own account | **Confirmed** (`PUT /api/korisnici/1 {"aktivan":false}` → 200, then 401) | Lockout; recovery only via env reset + redeploy | 400 for self-deactivation/demotion | **Fixed** |
| H4 | High | Second user without email (or machine without serial) → 500 | **Confirmed** (second `POST /api/korisnici` with `email:""` → 500) | Forms default to `""`; UNIQUE columns collide | Blank optional text normalised to NULL server-side | **Fixed** |
| H5 | High | Machine form loses focus after every keystroke | **Confirmed** in Chromium: typing "Stroj" leaves "S" | Creating/editing machines practically impossible | Form component moved out of render | Planned (frontend) |
| H6 | High | Opening the app root logs the user out | **Hypothesis** (code: `/` → `/login`, whose mount effect calls `clearSession()`; manifest `start_url` is `/`) | Installed home-screen app signs workers out on every launch | `/` routes to the role's home when a session exists; login page no longer clears a valid session | Planned (frontend) |
| H7 | High | SSE stream holds a pooled DB connection per open admin tab and runs blocking queries in the event loop | **Hypothesis** (code; pool default 5+10) | ~15 concurrent admin tabs exhaust the pool and stall all requests; token in query string lands in access logs | Replaced by `GET /api/kvarovi/novi?since_id=` polling; SSE removed | **Fixed** |
| H8 | High | Fault table clips Status column on phones; header actions crowd the title | **Confirmed** (screenshot at 390 px) | Leads cannot read status on the floor | Card list on small screens | Planned (frontend) |
| H9 | High | Vulnerable dependencies | **Confirmed**: `pip-audit` 38 advisories (starlette, python-jose/ecdsa, python-multipart, python-dotenv); `npm audit --omit=dev` 6 (3 high: axios chain, form-data) | Known CVEs in request parsing/JWT | Upgraded FastAPI/Starlette/etc.; replaced unmaintained `python-jose` with `PyJWT`; psycopg 3 | Python **Fixed** (0 advisories); npm planned |

## 5. Medium and low-priority improvements

| ID | Severity | Finding | Evidence | Resolution | Status |
|---|---|---|---|---|---|
| M1 | Medium | Reopening a resolved fault keeps its resolution date | Confirmed (API) | Cleared when status leaves Riješeno | **Fixed** |
| M2 | Medium | "Today"/"this month" computed in UTC | Confirmed (code) | Europe/Zagreb boundaries | **Fixed** |
| M3 | Medium | Background push task used the request's closed DB session; errors swallowed | Confirmed (code; FastAPI closes `yield` deps before background tasks) | Own session + logged errors | **Fixed** |
| M4 | Medium | Admin profile overwritten from env on every deploy | Confirmed (code) | Only on creation or explicit reset | **Fixed** |
| M5 | Medium | No input limits (negative cost, 0 quantity, unbounded text) | Confirmed (code) | Pydantic constraints | **Fixed** |
| M6 | Medium | Mutations without error handling (parts, suppliers, components, exports) → unhandled rejections, no feedback | Confirmed (code) | Shared error/toast handling | Planned (frontend) |
| M7 | Medium | Fault detail shows API errors in success green | Confirmed (code: colour chosen by `msg.includes('Greška')`) | Typed status messages | Planned (frontend) |
| M8 | Medium | Worker cannot open their fault, see who handles it or read comments, though the API supports it | Confirmed (UI) | Worker fault view with public timeline + comment | Planned (frontend) |
| M9 | Medium | No UI to assign a fault; assignment events exist | Confirmed (UI vs API) | Assignee select for leads | Planned (frontend) |
| M10 | Medium | Push: VAPID key only at build time; unsubscribe leaves server record | Confirmed (code) | Runtime key from API; DELETE on unsubscribe | Planned (frontend) |
| M11 | Medium | No security headers; unthrottled login | Confirmed (response headers) | CSP, nosniff, frame-deny, HSTS; 10 failures/15 min throttle | **Fixed** |
| L1 | Low | Dead `odrzavanje` router/page | Confirmed | Removed | **Fixed** |
| L2 | Low | Two alert mechanisms (SSE + 15 s full-list polling) | Confirmed | One lightweight poll | **Fixed** |
| L3 | Low | Python logs to stderr → Railway shows INFO as `error` | Confirmed (deploy logs) | `log_config.json` to stdout | **Fixed** |
| L4 | Low | No tests or CI | Confirmed | `backend/tests` (26), Playwright e2e, GitHub Actions | Backend **Fixed**; e2e/CI planned |
| L5 | Low | Deprecated APIs (`utcnow`, Pydantic `class Config`, `declarative_base` import) | Confirmed | Updated | **Fixed** |
| L6 | Low | JWT in `localStorage` | Hypothesis (risk only with an XSS; React escapes output, no `dangerouslySetInnerHTML`) | Strict CSP added; cookie session left as future work | Accepted risk |
| L7 | Low | Three competing visual styles, English eyebrow in a Croatian UI, 11 equal stat tiles | Confirmed (screenshots) | Single design system (`DESIGN.md`) | Planned (frontend) |

## 6. UX evaluation (incumbent UI)

Method: heuristic evaluation and cognitive walkthrough of the two primary tasks (worker reports a fault; lead resolves a fault) on 390 px and 1366 px screenshots of the baseline build with demo data. No user research or analytics exist.

**Anti-pattern verdict:** Significant issues — no deceptive patterns; common failures: missing feedback, dead ends, destructive actions without confirmation, mobile afterthought, inconsistent patterns.

**Critical**
- *Machine form unusable* (H5) — error prevention / user control.
- *Installed app signs users out* (H6) — user control.

**Major**
- *Worker report goes into a void* — after sending, the modal closes silently; the worker cannot open the fault or see progress (visibility of system status; recognition over recall). Fix: success confirmation, tappable fault cards, public timeline.
- *Status unreadable on phones* (H8) — aesthetic/minimalist design, flexibility.
- *Errors as browser `alert()` or not at all* (M6, M7) — help users recover from errors.
- *Status changes twice on one screen* — quick actions and a Status select both change status; quick actions save immediately while the select needs Save (consistency).
- *Deactivating a machine part/user/spare part has no confirmation or undo in some places* (error prevention): spare part and machine deletion confirm, user deactivation does not.

**Minor**
- Dashboard shows 11 equal tiles and repeats totals; what is overdue is not the headline (aesthetic/minimalist).
- Login and worker screens use a blue gradient; admin uses black/amber; badges use a third palette (consistency).
- Priority and status conveyed mostly by colour pills.
- Icon-only logout and edit/delete buttons without accessible names.

**Cosmetic**
- "Production maintenance command" eyebrow in English; mixed "Mašine"/"oprema" naming.

**Cognitive walkthrough — worker reports a fault (390 px)**

| Step | Fails on | Finding |
|---|---|---|
| Open installed app | Lands on sign-in again | Installed app signs users out |
| Submit report | No visible confirmation | Worker report goes into a void |
| Check progress later | Card is not interactive | Worker report goes into a void |

**Cognitive walkthrough — lead resolves a fault (1366 px)**

| Step | Fails on | Finding |
|---|---|---|
| Find what is late | Overdue count is one tile among 11 | Dashboard hierarchy |
| Take the fault | Two competing controls | Status changes twice |
| Save with an invalid value | Error shown in green | Errors as alert() or not at all |

**Protect in the redesign:** the timeline with internal notes; component-level fault reporting; spare-part picker with search by name/code/supplier; one-click exports; SLA countdown.

## 7. Technical risks and dependencies

- **No migration tool.** Schema changes rely on `create_all` + hand-written additive `ALTER`s. Safe for additive changes only; a column rename or type change needs Alembic first. (Risk: medium; recommended next step.)
- **Single replica assumptions.** Login throttle state is per process; fine for one replica.
- **Web Push** requires VAPID keys the owner must generate; disabled until set.
- **No backups configured** beyond Railway's Postgres volume. Owner should enable Railway backups.
- **Dependencies** now current as of 2026-10; Dependabot recommended.

## 8. Deployment blockers

| Blocker | Status |
|---|---|
| Wrong build context / no runtime | Fixed (Dockerfile) |
| No Postgres / variables | Fixed (Railway Postgres; variables set via Railway API) |
| Health check disabled | Fixed (`/health` checks DB) |
| Public domain reachability | Verified via Railway edge logs: external `GET /health` 200 and `/login` 200 (my sandbox cannot reach `*.up.railway.app` directly) |

## 9. Implementation order

1. Deployment: Dockerfile, Postgres, variables, health check → online. *(done)*
2. Security and data integrity: secret, register endpoint, 500s, lockout, validation, dependency upgrades. *(done)*
3. Tests for the above. *(done)*
4. Frontend correctness: focus bug, root logout, error handling, worker visibility, assignment.
5. Design system and redesign of all screens; Croatian/English.
6. E2E, responsive and accessibility checks; documentation; production verification.
