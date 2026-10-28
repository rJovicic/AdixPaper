# Pre-production checklist

State as of 2026-10-28. Markers: **[V]** verified (read-only Railway API, logs, code, CI) · **[D]** Railway docs · **[A]** assumption · 🔒 needs the owner's approval.

Owner decisions (2026-10-28):
- EU region (Amsterdam);
- photos deleted 12 months after a fault is resolved;
- staging with **synthetic data only**;
- keep the Railway domain for now;
- alerts via existing or free capabilities;
- **no new costs without prior approval.**

> Merging into `main` deploys to production immediately: the service auto-deploys `main` and "Wait for CI" is off [V].

## 1. Production as found

| Item | State |
|---|---|
| Project / environment | `zucchini-insight` / `production` (the only environment) [V] |
| Services | `AdixPaper` (Dockerfile build per `railway.toml`, 1 replica) and `Postgres` (`postgres-ssl:18`, **PostgreSQL 18.6**) [V] |
| Region | **Amsterdam (`europe-west4-drams3a`) since 2026-10-28 07:54 UTC** for both services and the volume [V]. The change was made under the owner's Railway account, not by this work. **Owner to confirm it was intentional.** Verified: same volume, clean Postgres shutdown and restart on existing data, disk use unchanged (0.32 GB), app serving normally afterwards. |
| Volume | `postgres-volume`, 5000 MB allocated, about 0.32 GB used, not publicly exposed (no TCP proxy) [V] |
| Domain | `adixpaper-production.up.railway.app`, unchanged after the move; no custom domain [V] |
| Variables (names only) | `ACCESS_TOKEN_EXPIRE_MINUTES`, `ADMIN_PASSWORD`, `ADMIN_USERNAME`, `DATABASE_URL`, `SECRET_KEY`; `PUBLIC_URL` and `VAPID_*` unset [V] |
| Backups | Not visible through the API; **assume none** until checked [A] |
| Alerts | No project webhooks [V] |
| Live code | `ab992b2` (PR #2). The command-center release is **not** deployed [V] |
| Startup incident | During the move the app started before `postgres.railway.internal` resolved, exited, and recovered on restart [V]. Fixed in this release: startup now waits for the database (§4). |
| GitHub repo | **Public**; it includes the spare-parts catalogue with prices and stock (552 of 668 parts) [V] |

## 2. Tested by the repository (no infrastructure needed)

| What | How | Where |
|---|---|---|
| Unit and API tests on **PostgreSQL 16 and 18** | `backend` CI job, matrix `16` / `18` | CI |
| Upgrade of a database created by the previous release, on **PostgreSQL 18** | `upgrade` CI job: release on `main` creates and seeds the DB → this branch starts on it → `e2e/upgrade-check.py` checks records unchanged, existing faults at `verzija = 1`, new endpoints, stale-save 409, photo upload | CI (also run locally on 16) |
| Browser tests, accessibility, phone/tablet/desktop overflow, production Docker image | `e2e` CI job on **PostgreSQL 18** | CI |
| App waits for a late database | `tests/test_startup.py` (starts the real app against a port that opens later) | CI + local |
| Rollback to `ab992b2` on the upgraded schema | Ran locally: everything works; only deleting a fault that has photos is refused by the foreign key (nothing lost; admin API only) | Local |

## 3. Remaining operational tasks (owner)

| # | Task | Cost | Status |
|---|---|---|---|
| 1 | **Confirm the 07:54 move to Amsterdam was intentional**; check in the app that fault, machine and user counts look right | — | Open |
| 2 | 🔒 **Backups**: Postgres → Backups → enable Daily + Weekly; take one manual backup before merging | Billed like volumes, incremental (worst case at today's size ≈ $0.60/month — calculation, not a quote) | Open |
| 3 | 🔒 **Wait for CI** on the `AdixPaper` service (Settings → Source) before merging | None | Open |
| 4 | 🔒 **Staging on PostgreSQL 18, synthetic data** (§5). Optional now that CI covers PostgreSQL 18; useful for a hands-on review and the backup-restore drill | Extra service usage (≈ $1.5–2.5/month if left running; cents for a few days — calculation from measured usage × published prices; confirm plan) | Open |
| 5 | 🔒 **Monitoring** (§6) | None for the free options | Open |
| 6 | **QR validation** (read-only), then 🔒 set `PUBLIC_URL` (§7) | None | Open |
| 7 | **Employee privacy notice** text (company/legal) and the 12-month photo rule in it (§8) | — | Open |
| 8 | 🔒 **Repository visibility**: decide whether to make the repo private (it publishes supplier prices and stock) | Private repos have limited free Actions minutes — check the GitHub plan | Open |
| 9 | 🔒 Merge the command-center PR, then (later) the photo-retention PR. The retention PR ships in `dry-run`: check the logged count, then 🔒 set `PHOTO_RETENTION_MODE=delete` | — | Open |

## 4. Database startup (in this release)

- On startup the app tries `SELECT 1` before touching the schema. On failure it logs a warning and retries with backoff: 1 s doubling up to 10 s.
- It gives up after `DB_STARTUP_TIMEOUT_SECONDS` (default **90**, under the 120 s deploy health check), so the platform can still restart it.
- Running connections use `pool_pre_ping`, so a database restart while the app runs replaces dead connections instead of failing requests.

## 5. Staging (synthetic data only) 🔒

1. **Create an empty environment**, not a duplicate: a duplicate copies production variables (`SECRET_KEY`, the admin password, possibly a database URL).
2. In it, add Postgres from the same template (`postgres-ssl:18`, Amsterdam) and the `AdixPaper` service from this repo, **branch = the PR branch**.
3. Variables:
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}` (the staging Postgres);
   - a **new** `SECRET_KEY`;
   - staging-only `ADMIN_USERNAME` / `ADMIN_PASSWORD`;
   - no `PUBLIC_URL`, no `VAPID_*`.

   Generate a Railway domain.
4. Fill it with synthetic data:
   - Playwright (`E2E_BASE_URL=https://<staging-domain> npx playwright test`); its tests create their own fake users, machines and faults;
   - or `e2e/seed-demo.py` with a non-`railway.app` URL. The script refuses Railway URLs on purpose.

   **Never load production data.**
5. Review the app. Practise a backup restore on the **staging** volume (Railway restores only within the same project and environment [D]).
6. **Never print QR labels from staging.** Delete the environment when done.

## 6. Monitoring (free / existing)

Railway's health check runs only at deploy time [D]. Free options:

| Need | Option |
|---|---|
| Failed or crashed deploy, volume usage | Railway project webhook → Discord or Slack channel (formatted automatically [D]) |
| App down, or database unreachable (`/health` returns 503 without the DB) | Scheduled GitHub Actions workflow calling `/health` every 15–30 min; a failure emails the owner. Free for public repos; GitHub may delay schedules and pauses them after 60 days without repo activity. |
| Photo-cleanup failures | Photo-retention PR: `/health/jobs` (503 after 3 failed runs or 48 h without a run) for the same scheduled check, plus optional `ALERT_WEBHOOK_URL` (Discord/Slack, free) |

Paid, not planned without approval: Railway Pro monitors, Uptime Kuma as an extra service, Sentry or external uptime services.

Railway shows Postgres's normal `LOG` lines as "error", so don't alert on log severity.

## 7. QR labels with the current domain

- `PUBLIC_URL` is unset, so labels encode the request's own address.
- Reproduced locally with production's start flags: through Railway's edge (sending `X-Forwarded-Proto: https`) labels decode to `https://adixpaper-production.up.railway.app/m/<id>`; without that header they would say `http://`.

Steps:
1. **Read-only check:** as admin, open Machines → QR labels for one machine in production. Scan it with an iPhone and an Android phone, signed out. It must open sign-in, then the report form with the machine chosen.
2. 🔒 Set `PUBLIC_URL=https://adixpaper-production.up.railway.app` to remove the header dependency (one redeploy).
3. Print all labels only after the scan works. A domain change later means reprinting.

## 8. Employee privacy (internal tool, proportionate)

**In place:**
- roles enforced on the server; workers see only their own faults;
- photos are served only to signed-in users who may see that fault, never via public links;
- GPS and camera data stripped from photos;
- 8 h sessions; password change ends other sessions.

**Owner tasks:**
1. A privacy notice from the company. Cover:
   - controller and contact;
   - purpose (fault handling);
   - legal basis (legal to decide);
   - data: names, contacts, sign-ins, activity, photos;
   - Railway as processor, EU region;
   - retention: photos 12 months after resolution, and photos remain in backups until those expire, up to about 3 months; decide periods for faults and deactivated users;
   - rights and the Croatian authority (AZOP).
2. Railway data processing agreement on file; one entry in the record of processing (GDPR Art. 30).
3. Use activity history for maintenance, not staff evaluation, unless employees are told.
4. Ask legal whether employee or works-council consultation applies.

## 9. Release procedure (after the open items above)

1. 🔒 Manual backup.
2. 🔒 Wait for CI on.
3. 🔒 Merge the PR in a quiet hour.
4. Watch the deploy log for the additive `ALTER TABLE` / `CREATE INDEX` lines, then check sign-in, the overview, an old fault and a new report.
5. If something is wrong: Railway → Deployments → previous deployment → **Rollback**.
   - Hobby keeps rollback images for 72 h [D]; after that, redeploy commit `ab992b2`.
   - The added columns and table can stay.
