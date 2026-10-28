# AdixPaper — Audit and launch readiness

Latest audit: **2026-10-27**, baseline commit `e968904` (the version running in production at the time). The audit of 2026-10-26 follows further down.

Each finding is labelled **Confirmed** (reproduced in a test, in the browser, or in production logs) or **Hypothesis** (from reading the code, not reproduced).

## Command-center pass (2026-10-27, after `ab992b2`)

Branch `claude/command-center-redesign`. Details, phases and verification: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

| ID | Gap | Resolution | Evidence |
|---|---|---|---|
| G1–G2 | Overview had 3 counts and no reasons, workload or activity | `GET /api/dashboard/pregled`; six linked figures, queue with reasons, workload, activity, period | pytest `test_overview_counts_match_the_lists_they_link_to`; e2e `workflow.spec.js` |
| G3 | "On hold" had no reason or start | Reason required, since recorded, wait time logged | pytest `test_putting_a_fault_on_hold_requires_a_reason_and_records_it`; e2e |
| G4 / A2-29 | Last write wins between leads | Version + row lock, 409, "Load latest" | pytest + e2e `a save based on an outdated page is refused…` |
| G5 / A2-32 | No photos | `kvar_prilozi`, re-encoded, EXIF stripped, limits, permissions | `tests/test_prilozi.py` (8) + e2e |
| G6 / A2-33 | No duplicate warning | Open faults on the machine, non-blocking | pytest (no people/internals leak) + e2e + axe |
| G7 / A2-30 | Whole fault list loaded and filtered in the browser | Server-side search, filters, sort, paging (`X-Total-Count`) | pytest `test_fault_list_pages_searches_and_filters_on_the_server` |
| G8 / A2-34 | Analytics without MTTR, SLA, waiting, MTBF, period | `GET /api/dashboard/analitika`, definitions on the page | `tests/test_analitika.py` (hand-computed values) |
| G9 | Fault detail lacked history, photos, hold reason | Machine history, photos, waiting dialog, deadline, time open | e2e |
| G10 / A2-31 | Workers not told about changes | "Updated" badge; push to the reporter when VAPID is set | pytest `test_reporter_is_notified_of_changes_they_can_see` |
| G11 | Phone navigation | Tab bars for workers and leads | e2e + overflow checks at 360/768/1280 |
| R1 | Found in review: uploads were size-checked only after Starlette spooled the body | 413 on `Content-Length` > 13 MB before parsing | pytest `test_oversized_bodies_are_refused_before_they_are_read` |
| R2 | Found in review: 7/30-day periods started at 01:00 local after the DST change | Calendar days in plant time | pytest `test_periods_start_at_plant_midnight_across_a_dst_change` |
| R3 | Overdue badge polled full statistics every minute per tab | One page of overdue faults, count from header | code |

Verification at the end of this pass: ruff clean; **pytest 79 passed** on PostgreSQL 16 and on SQLite; ESLint 0, i18n parity OK, production build OK; `npm audit --omit=dev` 0, `pip-audit` 0; **Playwright 30 passed** against the production build served by FastAPI on Postgres (axe 0 serious/critical on every screen checked, no horizontal overflow at 360/768/1280). Not verified: Docker image build (no daemon here; CI builds it), the deployed environment, real phones (iOS Safari camera/file picker, push on iOS home-screen apps), real users.

### Reliability and release safety (2026-10-28, after the Railway review)

| ID | Finding | Resolution | Evidence |
|---|---|---|---|
| R4 | During the region move (07:54 UTC) the app started before `postgres.railway.internal` resolved and exited; recovery relied on the 5-retry restart policy | Startup waits for the database with backoff (`DB_STARTUP_TIMEOUT_SECONDS`, default 90 s) | `tests/test_startup.py`: the real app started against a port that opens 3 s later becomes healthy; with the wait removed the same test fails |
| R5 | A report whose response was lost (weak Wi-Fi) created a duplicate when the worker sent it again | Idempotency key per report draft (`kvarovi.klijent_kljuc`, unique); a retry returns the fault already saved; another user's key → 409 | pytest + e2e that drops the first response in the browser |
| R7 | Photos had no retention rule (owner: 12 months after resolution) | Separate PR: daily in-app job, Europe/Zagreb calendar months, reopened faults excluded, `dry-run` default, `off` kill switch, per-run limit, advisory lock + per-fault row-lock re-check, run log `zadaci_izvrsenja`, `/health/jobs`, optional webhook alert | `tests/test_retention.py` (24: boundaries incl. DST and 29 Feb, reopen before and during a run, limits across runs, failure rollback, single alert, lock, health) |
| R6 | Nothing tested PostgreSQL 18 (production) or the upgrade of a database created by the previous release | CI: backend tests on 16 and 18, e2e on 18, `upgrade` job (release on `main` creates and seeds, this branch upgrades, `e2e/upgrade-check.py` verifies) | CI; upgrade also run locally on 16 |

### Visual QA against the reference images (2026-10-28)

Method: 48 screenshots of every screen and the main dialogs at 1440 × 900 and 390 × 844 (Playwright on the production build, Postgres, realistic local demo data incl. overdue, on-hold, resolved, comments and a photo), compared with the four reference boards. Re-captured after each round.

| ID | Finding before | Status |
|---|---|---|
| V1 | No semantic state colours: status and priority were logo-blue/grey squares, references use tinted pills (red/amber/blue/green) | Fixed: semantic tokens + `Badge` everywhere (faults, machines, users, search, worker cards); contrast table in DESIGN.md |
| V2 | KPI figures were a ruled strip without icons | Fixed: figure cards with tinted icon tiles |
| V3 | Sidebar active item was a white chip; references fill it blue | Fixed |
| V4 | Fault detail had no status progression | Fixed: stepper with time and person per step |
| V5 | Analytics mostly tables, monochrome bars | Fixed: status donut, colour-coded priority/waiting bars, resolved series green |
| V6 | Worker home: no greeting, no action tiles, no in-app QR scan | Fixed: greeting, report tile, raised "+" tab; scan tile/tab/screen where `BarcodeDetector` exists |
| V7 | Login plain grey | Fixed: navy ground |
| V8 | Waiting reason wrapped into 4 lines in the fault table | Fixed: compact one-line reason |
| V9 | Same information repeated: "kasni 3 d" twice per queue row; waiting reason 3× on fault detail; "Normalno" shown as a reason | Fixed |
| V10 | Labels truncated on phones ("Čekaju dijel…", "Zastoj (evidentir…"); badges stretched in machine cards | Fixed |
| V11 | Found by axe after the change: report-tile subtitle 3.7:1; donut SVG sectors unlabeled/focusable | Fixed (white 90 % = 5.9:1; CSS donut) |

Not adopted from the references, deliberately: tabs on fault detail (one scrolling workspace keeps the resolve-validation focus behaviour), machine photos (no such data), separate manager/technician fields, a notifications centre and a settings page (account menu covers language, password, push, sign-out).

Still open (owner) — details in [PRE_PRODUCTION_CHECKLIST.md](PRE_PRODUCTION_CHECKLIST.md) §3: confirm the 2026-10-28 move to Amsterdam was intentional (A2-24, region now EU), backups and a tested restore (A2-23), Wait for CI, staging on PostgreSQL 18 with synthetic data, monitoring (A2-27), QR validation and `PUBLIC_URL` (A2-26), employee privacy notice (A2-25), repository visibility. Photo retention: 12 months after resolution, implemented in a separate PR (R7), shipped in `dry-run`.

## 1. Executive summary

AdixPaper is live (`adixpaper-production.up.railway.app`, Railway, one app service + Postgres). The previous pass fixed the deployment, the committed JWT secret and many crashes, and introduced one coherent design system. The rendered UI was inspected at 390, 1024 and 1366 px with demo data: the hierarchy is clear, there are no console errors, and axe reports no serious or critical violations.

What this audit found was beneath that surface. The earlier tests called the API differently from the UI, so these were missed:

1. **The primary lead action was broken.** "Preuzmi kvar" (Take) did not make the lead the assignee: the page sent the whole form, including `voditelj_id: null`, along with the status change. A stale tab could also silently un-assign another lead's fault.
2. **Workers could read internal data about their own faults.** The lead's internal note, costs, material and parts were in the JSON returned to the worker. The UI hid them; the API did not.
3. **Password guessing was not really limited.** The login throttle keyed on an IP taken from the client-controlled `X-Forwarded-For` header. Changing a password did not end existing sessions, and nobody except an admin could change a password at all.
4. **14 ordinary bad inputs returned 500.** Examples: an empty required field on edit, an invalid filter, an oversized value, an assignee that does not exist.
5. **Smaller defects that undercut trust.** The "session expired" notice never appeared. "Focus the first invalid field" never worked. PDFs dropped č/ć/đ. Exports of "open" faults contained every fault.

All of the above are fixed and covered by tests. The audit also added three workflow features: machine QR labels (scan → report with the machine already chosen), "assigned to me / unassigned" and per-machine filters, and report drafts that survive a reload or an expired session.

**Verdict: suitable for a controlled beta** (see §8). The code is in good shape. The remaining blockers are operational and legal, and only the owner can resolve them: verified backups, the data region, and the employee privacy notice.

## 2. Findings and their status

| ID | Pri | Finding | Evidence | Resolution | Status |
|---|---|---|---|---|---|
| A2-01 | P1 | Take did not assign the lead; stale forms overwrote other leads' changes | **Confirmed**: probe with the payload `FaultDetail.jsx` sent → `voditelj_id: null` | Server assigns after applying the payload, only on the transition into "U rješavanju" when no one owns the fault. The page sends only changed fields | Fixed (`test_taking_a_fault_assigns_the_lead_even_when_the_form_says_unassigned`, e2e asserts the owner) |
| A2-02 | P1 | Internal note, cost, material and parts sent to workers | **Confirmed**: as a worker, `GET /api/kvarovi/{id}` returned the lead's internal note and the cost 120.00 | Stripped for workers on every fault response; lists use a slim schema | Fixed (`test_workers_never_receive_internal_notes_costs_or_parts`) |
| A2-03 | P1 | Login throttle bypassable | **Confirmed**: uvicorn with `--forwarded-allow-ips='*'` returns the leftmost `X-Forwarded-For` entry (`uvicorn/middleware/proxy_headers.py`), which the client sets | Added a per-username cap of 20 failures per 15 min from any IP. Trade-off: someone can lock a username for 15 min on purpose | Fixed (`test_throttle_caps_guesses_per_username_even_when_the_ip_changes`) |
| A2-04 | P1 | Changing a password left old sessions valid for up to 8 h | **Confirmed** (probe: old token 200 after reset) | Tokens carry `iat`; `korisnici.sesije_od` (additive column) rejects older tokens | Fixed (2 tests) |
| A2-05 | P1 | Only admins could change passwords, so the admin knew every user's password | **Confirmed** (no endpoint, no UI) | `POST /api/auth/password` and a "Promijeni lozinku" dialog in both shells. Other devices are signed out | Fixed (API test + e2e) |
| A2-06 | P2 | 500 instead of 4xx on 14 inputs (null/blank required fields on edit, overlong text, invalid enum filters, `foto_url` > 500) | **Confirmed** (probe, Postgres) | Update schemas reject null for required columns and enforce lengths; filters validated; client `foto_url` ignored | Fixed (`tests/test_validation.py`) |
| A2-07 | P2 | Faults could be assigned to a worker, an inactive user, or a nonexistent id (500) | **Confirmed** | Only active leads/admins; 400 otherwise | Fixed |
| A2-08 | P2 | Any lead could permanently delete a fault and its history (not offered in the UI) | **Confirmed** | Admin only, and logged | Fixed |
| A2-09 | P2 | The "session expired" notice and return path never appeared | **Confirmed** (e2e): React Router 7 applies navigations as transitions, so `RequireRole` redirected to a bare `/login` first | `RequireRole` owns the redirect and keeps path + query, except after a deliberate sign-out | Fixed (e2e) |
| A2-10 | P2 | "Focus moves to the first invalid field" (DESIGN.md) did not work in the fault, user, machine and part forms | **Confirmed** (e2e): the lookup ran before React rendered the error markers | Shared `focusFirstInvalid` runs after paint | Fixed |
| A2-11 | P2 | PDFs could not print č, ć, đ | **Confirmed**: Helvetica/WinAnsi cannot encode them | Bundled Liberation Sans (SIL OFL) for all PDFs | Fixed (rendered and inspected) |
| A2-12 | P2 | Faults could be resolved with nothing recorded, so downtime and repair analytics rest on empty records | **Confirmed** | Resolving requires "Što je napravljeno" (server 400 + inline error) | Fixed (decision logged) |
| A2-13 | P2 | The overview downloaded every fault ever reported (with parts) to show 10 open ones | **Confirmed** (code + payload measurement: ~450 B per used part per row) | `status=otvoreni` on the server; slim list schema without parts | Fixed; full server pagination is A2-30 |
| A2-14 | P2 | Exporting with the "Open (all)" filter exported every status | **Confirmed** (code: the filter was applied only in the browser) | Filter applied on the server, so exports respect it | Fixed |
| A2-15 | P3 | Unknown usernames answered faster (no bcrypt), revealing which exist | Hypothesis (timing) | One dummy bcrypt check | Fixed |
| A2-16 | P3 | Machine list ran one stats query per machine | Confirmed (code) | One grouped query | Fixed |
| A2-17 | P3 | Average resolution time stripped UTC offsets before subtracting | Hypothesis (wrong only when the two times straddle a DST change) | Compares UTC instants | Fixed |
| A2-18 | P3 | Due time clipped on phone fault cards ("…58 mi") | Confirmed (screenshot) | Wraps | Fixed |
| A2-19 | P3 | Exports showed internal codes (`kasni`, `nema`) as due state | Confirmed | Words | Fixed |

## 3. Features added in this pass

| Feature | Problem it solves | How it works | Verified by |
|---|---|---|---|
| **Machine QR labels** | Finding the machine in a long dropdown is the slowest part of a report from the floor | Machines → "QR oznake" prints an A4 sheet of cut-out labels (or one label from the machine dialog). Each QR opens `/m/<id>`: workers land on the report form with that machine chosen, leads on its faults. Signed-out users sign in first and continue there. No new dependency (reportlab QR); set `PUBLIC_URL` to pin the printed origin | `tests/test_pdf.py`; QR codes decoded from the rendered PDF (OpenCV); e2e scan-to-report signed out |
| **"Assigned to me / Unassigned" and machine filters** | A lead had no way to see their own queue; a machine's history was not reachable from the machine list | New "Preuzeo" filter; machine filter shown as a removable chip; machine fault counts link to it | e2e |
| **Report drafts** | An expired session or a reload lost what the worker had typed | Draft kept per user in `sessionStorage`; cleared on send | e2e (reload keeps the text) |
| **Self-service password change** | See A2-05 | Dialog in both shells | e2e |

## 4. UI/UX notes

The visual system (DESIGN.md) holds up across all screens at 390/1024/1366 px. Changes in this pass follow it: the filter chip is a ruled control with an icon button, QR labels reuse the logo blue and the reel-label hierarchy, and the password dialog uses the shared `Dialog`/`Field`. Interaction-level fixes are A2-09, A2-10, A2-12 and A2-18.

Remaining UX opportunities are in the backlog (§6): notifying workers when their fault is taken or resolved, warning about duplicate reports, and photos.

## 5. Production launch checklist

| Item | Status |
|---|---|
| App deploys from `main` with a health-gated Dockerfile build | Done (verified: deployment `b867c684` SUCCESS, no tracebacks in deploy logs) |
| `SECRET_KEY`, `DATABASE_URL`, `ADMIN_*` set | Done (verified on 2026-10-26) |
| Backend tests on Postgres, lint, i18n, build, `npm audit`, `pip-audit`, e2e + axe | Done locally (57 / 0 / OK / OK / 0 / 0 / 21 passed); CI runs the same on push |
| Security: secret, throttle, session revocation, role checks, worker data isolation, CSP/HSTS | Done |
| **Postgres backups enabled and one restore tested** | **Open — owner.** Railway → Postgres → Backups. Not verifiable through the read-only API |
| **Data region** | **Open — owner decision.** App and Postgres run in `us-west2` (verified). For EU employees' personal data this is a third-country transfer (GDPR Ch. V; check Railway's DPA/SCCs) and adds ~150 ms per request from Croatia. Railway offers an EU region; moving needs a `pg_dump`/restore and a short downtime window |
| **Employee privacy notice (GDPR Art. 13)** | **Open — owner/legal.** The app processes names, phone numbers, emails, sign-in times and who reported or handled what. Employees need a notice: controller (Cupup / Delt papir), purpose, legal basis, retention, rights. The text must come from the company; this audit did not draft legal text |
| Retention rule for faults and deactivated users | **Open — owner.** Deactivated users are kept (the record needs their names); decide how long |
| `PUBLIC_URL` set before printing QR labels | **Open — owner.** `https://adixpaper-production.up.railway.app` (or the final domain) |
| Custom domain + HTTPS | Optional. Railway domain works with HTTPS; a domain must be set before QR labels are printed, or the labels must be reprinted |
| Web Push (`VAPID_*`) | Optional. In-app alerts work without it |
| Error alerting | **Open (recommended).** Railway logs only; add Railway alerts on deploy failure / 5xx, or Sentry |
| First admin password changed in the app | Owner to confirm. It is now possible from the account menu |

## 6. Prioritised backlog (remaining)

| ID | Pri | Task | Impact | Effort | Depends on | Acceptance criteria |
|---|---|---|---|---|---|---|
| A2-23 | P1 | Enable and test Postgres backups | Data loss protection | S | Railway access | Daily backup visible; one restore into a scratch DB succeeds |
| A2-24 | P1 | Decide the data region; move to EU if required | GDPR transfer, latency | M | Owner decision | App and DB in an EU region; `/health` 200; data intact (row counts match) |
| A2-25 | P1 | Publish an employee privacy notice; set retention | GDPR Art. 13/5(1)(e) | S (owner) | Legal text | Notice linked from the login page; retention documented |
| A2-26 | P2 | Set `PUBLIC_URL` (and the final domain) before printing labels | QR labels keep working | S | Domain decision | Decoded QR = production URL |
| A2-27 | P2 | Alerting on deploy failure and 5xx spikes | Faster recovery | S | Railway/Sentry | A forced 500 produces an alert |
| A2-28 | P2 | Introduce Alembic (baseline + stamp existing DB) before the first non-additive schema change | Safe migrations | M | — | `alembic upgrade head` is a no-op on production; CI runs migrations on an empty DB |
| A2-29 | P2 | Optimistic concurrency on fault edits (version column, 409 on conflict) | Two leads editing the same field: last write wins today (much rarer now that only changed fields are sent) | M | — | Second save of a stale form gets "changed by X — reload" |
| A2-30 | P2 | Server-side pagination and search for the fault list | List payload grows with history (all faults load into the lead list) | M | — | List loads in < 1 s with 10 000 faults |
| A2-31 | P2 | Tell workers when their fault is taken or resolved (push for workers, or an "updated" badge) | Closes the loop; reduces "is anyone on it?" walks | M | VAPID keys for push | Worker gets a notification within 1 min of a status change |
| A2-32 | P3 | Photo on fault report | Faster diagnosis | L | Storage (volume/S3), image size limits, retention | Worker attaches ≤ 1 photo, lead sees it; files deleted with retention |
| A2-33 | P3 | Show open faults on the chosen machine while reporting (duplicate warning) | Fewer duplicate reports | S | **Owner decision**: today workers see only their own faults | Picking a machine lists its open faults (title + status only) |
| A2-34 | P3 | MTBF / MTTR per machine in Analytics | Maintenance planning | M | Enough history | Values match a hand calculation on demo data |
| A2-35 | P3 | Preventive maintenance schedules (recurring tasks per machine) | Moves the product from a fault log to maintenance planning; the most valuable larger step | XL | Owner validation that leads want it | Lead defines "every N days" tasks; due tasks appear on the overview |
| A2-36 | P3 | Restrict trusted proxies so the per-IP throttle sees the real client IP | Fewer shared-IP lockouts | S | Confirm which header Railway's edge sets | Throttle test with a forged `X-Forwarded-For` keys on the edge-provided IP |

## 7. Verification performed

- Backend: `ruff` clean; **57 tests pass** on PostgreSQL 16 and on SQLite. Each new regression test was run against the old code and **failed (19 checks)** before the fixes.
- Frontend: ESLint 0 problems, i18n parity OK (338 keys), production build OK. Worker bundle 104 kB gzip (+2.4 kB for the password dialog).
- Dependencies: `npm audit --omit=dev` 0, `pip-audit -r requirements.txt` 0.
- End-to-end: **21 Playwright tests pass** against the production build served by FastAPI (`APP_ENV=production`, Postgres), including axe WCAG 2.2 AA scans with 0 serious/critical violations on every screen, the password dialog and the filtered list.
- PDFs rendered to PNG and inspected; QR codes decoded from the rendered sheet.
- Not verified here: the Docker image build (no Docker daemon in this sandbox; CI builds it), the production deployment of these changes (not deployed by this audit), and real devices or real users.

## 8. Verdict

**Suitable for a controlled beta.** Start with one plant or one shift for 2–4 weeks once backups are verified (A2-23).

Evidence for this verdict:
- Every primary journey (report, take, record, resolve, follow up, export) passes end to end against the production build.
- Security boundaries are tested: role checks, worker data isolation, session revocation, throttling.
- Production has run without errors since 26 Oct.

Why not "production-ready" plant-wide:
- Backups are unverified.
- The data residency decision and the employee privacy notice are open.
- There is no alerting.
- No real worker or lead has used the app yet: production logs show only the owner.

## Previous audit (2026-10-26)

Audit date: 2026-10-26. Baseline: commit `466052a` ("Fix used spare parts save").
Every finding is marked **Confirmed** (reproduced, or observed in logs/browser/tests) or **Hypothesis** (from code reading, not reproduced). Status reflects this release.

### 1. Executive summary

AdixPaper is a working maintenance fault-tracking app (FastAPI + React) for the Cupup d.o.o / Delt papir d.o.o plants. The application code was largely functional; **it was offline because of deployment configuration, not code**:

- The Railway service built the repository root, where Railpack found only `start.sh` (a local development script) and ran it in an image with neither Python nor Node. Nothing ever listened on `$PORT`; the edge returned `502 connection dial timeout`. No database existed and no variables were set.
- A committed default JWT secret allowed anyone to forge an admin token.

Beyond deployment, the audit found data-integrity crashes (500s on ordinary actions), an Excel export that has never worked on PostgreSQL, an unusable machine form, an admin self-lockout, and a UI split across three visual styles with weak feedback, no worker visibility into their own faults, and a phone layout that clips the fault table.

Deployment and backend issues are fixed and verified (production `/health` 200 over the public domain; 27 backend tests). Frontend issues are fixed by the redesign described in `PRODUCT.md` and `DESIGN.md` and verified by 13 Playwright tests (including axe WCAG 2.2 AA scans) against the production Docker image.

### 2. Confirmed architecture

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

### 3. Existing functionality (traced end to end)

- Worker: sign in → list own faults (open/resolved) → report fault (machine, optional component, title, description, priority). Push/in-app alert to leads.
- Lead/admin: dashboard (counts, SLA, monthly chart, status, priority, top machines/components/parts); fault list with status/priority/SLA filters; Excel/PDF/spare-parts exports; fault detail with quick status actions, resolution fields, spare-parts usage, timeline, public/internal comments.
- Admin: machines + components; spare parts + suppliers (668 seeded); users (create, edit, deactivate).
- Response windows (SLA): Urgent 2 h, Normal 8 h, Low 48 h (`models.SLA_SATI`).
- Dead code: `routers/odrzavanje.py` and `pages/Odrzavanje.jsx` referenced a model that does not exist and were never mounted.

### 4. Critical and high-priority problems

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
| H5 | High | Machine form loses focus after every keystroke | **Confirmed** in Chromium: typing "Stroj" leaves "S" | Creating/editing machines practically impossible | Form component moved out of render; ESLint `react/no-unstable-nested-components` guards it | **Fixed** (e2e: machine form keeps focus) |
| H6 | High | Opening the app root logs the user out | **Hypothesis** (code: `/` → `/login`, whose mount effect calls `clearSession()`; manifest `start_url` is `/`) | Installed home-screen app signs workers out on every launch | `/` routes to the role's home when a session exists; login page no longer clears a valid session | **Fixed** (e2e: root keeps worker signed in) |
| H7 | High | SSE stream holds a pooled DB connection per open admin tab and runs blocking queries in the event loop | **Hypothesis** (code; pool default 5+10) | ~15 concurrent admin tabs exhaust the pool and stall all requests; token in query string lands in access logs | Replaced by `GET /api/kvarovi/novi?since_id=` polling; SSE removed | **Fixed** |
| H8 | High | Fault table clips Status column on phones; header actions crowd the title | **Confirmed** (screenshot at 390 px) | Leads cannot read status on the floor | Label-card list below 768 px; table with fixed title column above | **Fixed** (e2e: no overflow at 360/768/1280) |
| H9 | High | Vulnerable dependencies | **Confirmed**: `pip-audit` 38 advisories (starlette, python-jose/ecdsa, python-multipart, python-dotenv); `npm audit --omit=dev` 6 (3 high: axios chain, form-data) | Known CVEs in request parsing/JWT | Upgraded FastAPI/Starlette/etc.; replaced unmaintained `python-jose` with `PyJWT`; psycopg 3 | **Fixed**: pip-audit 0; `npm audit --omit=dev` 0 (React Router 7, axios update). One dev-only advisory remains in Tailwind 3's `postcss-selector-parser` (build-time, parses only our CSS; fix requires Tailwind 4) |

### 5. Medium and low-priority improvements

| ID | Severity | Finding | Evidence | Resolution | Status |
|---|---|---|---|---|---|
| M1 | Medium | Reopening a resolved fault keeps its resolution date | Confirmed (API) | Cleared when status leaves Riješeno | **Fixed** |
| M2 | Medium | "Today"/"this month" computed in UTC | Confirmed (code) | Europe/Zagreb boundaries | **Fixed** |
| M3 | Medium | Background push task used the request's closed DB session; errors swallowed | Confirmed (code; FastAPI closes `yield` deps before background tasks) | Own session + logged errors | **Fixed** |
| M4 | Medium | Admin profile overwritten from env on every deploy | Confirmed (code) | Only on creation or explicit reset | **Fixed** |
| M5 | Medium | No input limits (negative cost, 0 quantity, unbounded text) | Confirmed (code) | Pydantic constraints | **Fixed** |
| M6 | Medium | Mutations without error handling (parts, suppliers, components, exports) → unhandled rejections, no feedback | Confirmed (code) | Toasts, inline field errors, error states with retry on every list | **Fixed** |
| M7 | Medium | Fault detail shows API errors in success green | Confirmed (code: colour chosen by `msg.includes('Greška')`) | Toast tones (success/error) | **Fixed** |
| M8 | Medium | Worker cannot open their fault, see who handles it or read comments, though the API supports it | Confirmed (UI) | Worker fault view with public timeline + comment | **Fixed** (e2e) |
| M9 | Medium | No UI to assign a fault; assignment events exist | Confirmed (UI vs API) | Assignee select for leads | **Fixed** |
| M10 | Medium | Push: VAPID key only at build time; unsubscribe leaves server record | Confirmed (code) | Runtime key from API (toggle hidden when unset); DELETE on unsubscribe | **Fixed** |
| M11 | Medium | No security headers; unthrottled login | Confirmed (response headers) | CSP, nosniff, frame-deny, HSTS; 10 failures/15 min throttle | **Fixed** |
| M12 | Medium | Every fault save logged "details updated" and rewrote/logged spare parts even when nothing changed | Confirmed (code: event logged when the key is present in the payload) | Log only real value changes; skip unchanged parts | **Fixed** (test `test_resaving_unchanged_details_does_not_spam_the_timeline`) |
| L1 | Low | Dead `odrzavanje` router/page | Confirmed | Removed | **Fixed** |
| L2 | Low | Two alert mechanisms (SSE + 15 s full-list polling) | Confirmed | One lightweight poll | **Fixed** |
| L3 | Low | Python logs to stderr → Railway shows INFO as `error` | Confirmed (deploy logs) | `log_config.json` to stdout | **Fixed** |
| L4 | Low | No tests or CI | Confirmed | `backend/tests` (27), Playwright e2e (13), GitHub Actions | **Fixed** |
| L5 | Low | Deprecated APIs (`utcnow`, Pydantic `class Config`, `declarative_base` import) | Confirmed | Updated | **Fixed** |
| L6 | Low | JWT in `localStorage` | Hypothesis (risk only with an XSS; React escapes output, no `dangerouslySetInnerHTML`) | Strict CSP added; cookie session left as future work | Accepted risk |
| L7 | Low | Three competing visual styles, English eyebrow in a Croatian UI, 11 equal stat tiles | Confirmed (screenshots) | Single design system (`DESIGN.md`); Impeccable detector 0 findings | **Fixed** |

### 6. UX evaluation (incumbent UI)

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

### 7. Technical risks and dependencies

- **No migration tool.** Schema changes rely on `create_all` + hand-written additive `ALTER`s. Safe for additive changes only; a column rename or type change needs Alembic first. (Risk: medium; recommended next step.)
- **Single replica assumptions.** Login throttle state is per process; fine for one replica.
- **Web Push** requires VAPID keys the owner must generate; disabled until set.
- **No backups configured** beyond Railway's Postgres volume. Owner should enable Railway backups.
- **Dependencies** now current as of 2026-10; Dependabot recommended.

### 8. Deployment blockers

| Blocker | Status |
|---|---|
| Wrong build context / no runtime | Fixed (Dockerfile) |
| No Postgres / variables | Fixed (Railway Postgres; variables set via Railway API) |
| Health check disabled | Fixed (`/health` checks DB) |
| Public domain reachability | Verified via Railway edge logs: external `GET /health` 200 and `/login` 200 (my sandbox cannot reach `*.up.railway.app` directly) |

### 9. Implementation order

1. Deployment: Dockerfile, Postgres, variables, health check → online. *(done)*
2. Security and data integrity: secret, register endpoint, 500s, lockout, validation, dependency upgrades. *(done)*
3. Tests for the above. *(done)*
4. Frontend correctness: focus bug, root logout, error handling, worker visibility, assignment. *(done)*
5. Design system and redesign of all screens; Croatian/English. *(done)*
6. E2E, responsive and accessibility checks; documentation; production verification. *(done)*
