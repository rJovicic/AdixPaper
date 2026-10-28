# Deployment

AdixPaper runs on Railway as **one application service plus a Railway PostgreSQL service**, in project `zucchini-insight`, environment `production`.

```
Browser ──HTTPS──▶ AdixPaper service (Docker)            Postgres service
                   FastAPI (uvicorn)                      (Railway template,
                   ├─ /api/*      JSON API                 private network)
                   ├─ /health     liveness + DB check  ◀──▶ DATABASE_URL
                   └─ /*          built React app (SPA)
```

Frontend and API share one origin, so there is no API URL to configure, no proxy and no CORS.

## Build and start

Railway reads `railway.toml` at the repository root:

| Setting | Value |
|---|---|
| Builder | `DOCKERFILE` (`/Dockerfile`) |
| Root directory | repository root (leave empty) |
| Start command | from the Dockerfile `CMD`: `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*' --log-config log_config.json` |
| Health check | `GET /health`, timeout 120 s — returns 200 only when the database answers |
| Restart policy | `ON_FAILURE`, 5 retries |

The Dockerfile has two stages: `node:22-alpine` runs `npm ci && npm run build` in `frontend/`; `python:3.12-slim` installs `backend/requirements.txt`, copies `backend/app` and the built `dist/` to `/app/static`, and runs as a non-root user. Railway injects `PORT`; the app binds `0.0.0.0`.

## Variables (AdixPaper service)

| Name | Required | Value / notes |
|---|---|---|
| `DATABASE_URL` | yes | `${{Postgres.DATABASE_URL}}` (reference to the Postgres service) |
| `SECRET_KEY` | yes | Long random string. Startup **fails** in production without it. Changing it signs everyone out. |
| `ADMIN_USERNAME` | first deploy | Username of the first administrator, created only if no admin exists. |
| `ADMIN_PASSWORD` | first deploy | Its password. Read the current value in Railway → AdixPaper → Variables. Change it in the app after first sign-in; the variable is then only used for resets. |
| `ADMIN_RESET_PASSWORD` | no | `true` resets the admin's password (and profile) to the `ADMIN_*` values on the next start. Set back to `false` afterwards. |
| `RESET_USERNAME` / `RESET_PASSWORD` | no | One-off password reset for any user on next start. Clear both afterwards. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | Session length, default `480`. |
| `AUTO_SEED_SPARE_PARTS` | no | Default `true`: loads the 668-part catalogue into an **empty** parts table only. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` | no | Enable Web Push: leads hear about new faults, workers about status, assignee and public-comment changes on their own faults. Without them the "notifications" toggle is hidden; in-app alerts and the worker's "updated" badge still work. Generate with `npx web-push generate-vapid-keys`. |
| `PUBLIC_URL` | before printing QR labels | Origin printed into machine QR codes, e.g. `https://adixpaper-production.up.railway.app` (or the final domain). Without it the origin of the request that generates the PDF is used. Labels printed for one origin must be reprinted if the domain changes. |
| `CORS_ORIGINS` | no | Only if another origin must call the API. |
| `DB_STARTUP_TIMEOUT_SECONDS` | no | Default `90`. On startup the app waits this long for the database (retrying with backoff 1→10 s) before exiting, so a Postgres restart or a not-yet-resolvable private hostname does not use up the platform's restarts. Keep it below the 120 s deploy health-check timeout. |
| `PHOTO_RETENTION_MODE` | no | `dry-run` (default: counts what the 12-month rule would remove and records it, deletes nothing), `delete` (removes the photos), `off` (kill switch: nothing runs). See "Photo retention" below. |
| `PHOTO_RETENTION_MAX_PER_RUN` | no | Default `200`. Most photos removed in one run (whole faults only); the rest follows on the next day's run. |
| `PHOTO_RETENTION_HOUR` | no | Default `3`. Plant-local hour (Europe/Zagreb) after which the daily run starts. |
| `ALERT_WEBHOOK_URL` | no | Optional Discord/Slack incoming-webhook URL (free). Called once when the photo job fails 3 runs in a row. Treat as a secret. |

`RAILWAY_ENVIRONMENT_NAME` is set by Railway and switches the app into production mode (secret required). `APP_ENV=production` does the same elsewhere.

## Database

Before merging a release, work through [PRE_PRODUCTION_CHECKLIST.md](PRE_PRODUCTION_CHECKLIST.md) (backups, region, `PUBLIC_URL`, alerting, staging). Production Postgres is **PostgreSQL 18** (`postgres-ssl:18`, verified 2026-10-28). CI runs the backend tests on 16 and 18, the browser tests on 18, and an `upgrade` job that starts this branch on a database created by the release on `main` (PostgreSQL 18).

- Schema is created on startup (`Base.metadata.create_all`) plus idempotent additive column checks in `backend/app/bootstrap.py`. Startup never drops or rewrites data.
- Seeding on every start is idempotent: the two companies as suppliers, the parts catalogue (only into an empty table), and the first admin (only if none exists).
- There is no migration tool yet. Additive changes are safe; renames or type changes need Alembic first (AUDIT.md backlog A2-28). Columns added so far on startup: `kvarovi.komponenta_id`, `rezervni_dijelovi.zaliha`, `korisnici.sesije_od` (2026-10-27; sessions issued before a user's last password change are rejected), and in the command-center release `kvarovi.razlog_cekanja`, `kvarovi.cekanje_od`, `kvarovi.verzija` (`NOT NULL DEFAULT 1`), `kvarovi.azurirano`, `kvarovi.klijent_kljuc` (report idempotency key, unique index `ix_kvarovi_klijent_kljuc`), plus indexes `ix_kvarovi_status`, `ix_kvarovi_datum_prijave`, `ix_kvar_dogadjaji_kreiran`. The new table `kvar_prilozi` (photos) is created by `create_all`. Verified against a database created by the previous release: the app starts, columns and indexes appear, existing rows get `verzija = 1`.
- **Photos live in Postgres** (`kvar_prilozi.sadrzaj`, re-encoded JPEG, typically 150–400 kB, at most 6 per fault). Watch the Postgres volume size on Railway; at 50 photos a week that is roughly 1 GB a year. Backups include them. Photos are removed 12 months after the fault is resolved (below).
- Enable **Railway Postgres backups** (Postgres service → Backups) and test one restore before relying on production data. As of 2026-10-27 this could not be verified through the read-only API.

## Photo retention

Owner's rule (2026-10-28): a fault's photos are removed **12 calendar months after it was resolved**, counted in plant time (Europe/Zagreb). Resolved on 15 March → removed from 00:00 on 15 March a year later; 29 February → 28 February. Reopening a fault clears its resolution date, so its photos stay; resolving again restarts the clock. The fault, its work record and its timeline stay; the timeline gets an entry "Photos removed under the retention rule".

- Runs inside the app (a background thread, no extra service): checked hourly, one run per day after `PHOTO_RETENTION_HOUR`. A failed run is retried on the next hourly check.
- Safety: `PHOTO_RETENTION_MODE` defaults to **`dry-run`**; set `delete` only after the owner has seen a dry-run count. At most `PHOTO_RETENTION_MAX_PER_RUN` per run. One runner at a time (PostgreSQL advisory lock); each fault is re-checked under a row lock right before its photos are removed, in its own transaction. Runs with an implausible clock are refused.
- Audit: every run is a row in `zadaci_izvrsenja` (mode, status `ok`/`greska`/`preskoceno`, counts, message) and a log line `Photo retention (<mode>): …`. To see a dry-run count: Railway → AdixPaper → Logs, search `Photo retention`.
- Monitoring: `GET /health/jobs` → 200 when the job is healthy, off, or not yet due after a deploy; **503** after 3 failed runs in a row or no successful run for 48 h. No personal data in the response. After 3 failures in a row the app also logs an error and calls `ALERT_WEBHOOK_URL` once.
- Removed photos remain in Railway backups until those backups expire (daily 6 days, weekly 1 month, monthly 3 months [Railway docs]). State this in the privacy notice.

## Region and personal data

App, Postgres and its volume run in **Amsterdam (`europe-west4-drams3a`)** since 2026-10-28 07:54 UTC (verified read-only: same volume, clean restart on existing data, domain unchanged). They ran in `us-west2` before. The change was made under the owner's Railway account, outside this repository's work; **the owner still has to confirm it was intentional**. Railway is a US company even in the EU region, so keep its data processing agreement on file. The database holds personal data of employees (names, contact details, sign-in times, who reported or handled each fault, photos).

## Deploying

Pushing to `main` deploys automatically (the service tracks `rJovicic/AdixPaper@main`). CI (`.github/workflows/ci.yml`) runs backend tests on PostgreSQL, frontend lint/i18n/build, `npm audit`, and the Playwright suite against the Docker image.

To deploy manually: Railway → AdixPaper → Deployments → Redeploy.

## Verifying a deployment

1. Railway → AdixPaper → Deployments: latest is **Active** (the health check gates this).
2. Deploy logs show `Uvicorn running on http://0.0.0.0:<PORT>` and no tracebacks.
3. `https://adixpaper-production.up.railway.app/health` → `{"status":"ok"}`.
4. `https://adixpaper-production.up.railway.app/login` loads; sign in as the admin.
5. Deep link `https://adixpaper-production.up.railway.app/admin/kvarovi` loads the app (SPA fallback).
6. Railway → AdixPaper → Observability / HTTP logs: no 5xx.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Deploy fails health check, logs show `SECRET_KEY must be set` | Variable missing | Set `SECRET_KEY`, redeploy |
| Health check returns 503 | Database unreachable | Check Postgres service is online and `DATABASE_URL` references it |
| Logs show `Database not reachable yet (attempt N)` after a deploy or restart | Postgres is starting or its private hostname is not resolvable yet | Normally resolves on its own within seconds. If it ends with `giving up`, check the Postgres service, then redeploy the app |
| `/health/jobs` returns 503 | Photo job failed 3 times in a row, or has not succeeded for 48 h | Logs: search `Photo retention`. Fix the cause; the next hourly check retries. `PHOTO_RETENTION_MODE=off` stops it meanwhile |
| `502 connection dial timeout` at the edge | No process listening on `$PORT` | Ensure the builder is Dockerfile and root directory is empty (this was the original outage) |
| Cannot sign in as admin | Admin existed before `ADMIN_*` changed | Set `ADMIN_RESET_PASSWORD=true`, redeploy, sign in, set it back to `false` |
| Logs show `Too many failed sign-in attempts` (429) | Throttle: 10 failures per IP+username, or 20 per username from any IP, per 15 min | Wait, or restart the service to clear it |
| A user is signed out on every device after a password change | Intended: changing a password ends all other sessions | Sign in again with the new password |

## Local production check

```bash
docker build -t adixpaper .
docker run --rm -p 8000:8000 -e APP_ENV=production -e SECRET_KEY=change-me \
  -e ADMIN_USERNAME=admin -e ADMIN_PASSWORD=change-me-too \
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/adixpaper adixpaper
```
