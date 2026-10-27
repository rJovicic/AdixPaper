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
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` | no | Enable Web Push. Without them the "notifications" toggle is hidden; in-app alerts still work. Generate with `npx web-push generate-vapid-keys`. |
| `PUBLIC_URL` | before printing QR labels | Origin printed into machine QR codes, e.g. `https://adixpaper-production.up.railway.app` (or the final domain). Without it the origin of the request that generates the PDF is used. Labels printed for one origin must be reprinted if the domain changes. |
| `CORS_ORIGINS` | no | Only if another origin must call the API. |

`RAILWAY_ENVIRONMENT_NAME` is set by Railway and switches the app into production mode (secret required). `APP_ENV=production` does the same elsewhere.

## Database

- Schema is created on startup (`Base.metadata.create_all`) plus idempotent additive column checks in `backend/app/bootstrap.py`. Startup never drops or rewrites data.
- Seeding on every start is idempotent: the two companies as suppliers, the parts catalogue (only into an empty table), and the first admin (only if none exists).
- There is no migration tool yet. Additive changes are safe; renames or type changes need Alembic first (AUDIT.md backlog A2-28). Columns added so far on startup: `kvarovi.komponenta_id`, `rezervni_dijelovi.zaliha`, `korisnici.sesije_od` (2026-10-27; sessions issued before a user's last password change are rejected).
- Enable **Railway Postgres backups** (Postgres service → Backups) and test one restore before relying on production data. As of 2026-10-27 this could not be verified through the read-only API.

## Region and personal data

App and Postgres run in **`us-west2`** (verified 2026-10-27). The database holds personal data of EU employees (names, contact details, sign-in times, who reported or handled each fault). That is a transfer to a third country under GDPR Chapter V: confirm that Railway's DPA/SCCs cover it, or move both services to Railway's EU region. Moving also cuts ~150 ms of latency per request from Croatia. A move means a new Postgres in the EU region, `pg_dump` → `pg_restore`, repointing `DATABASE_URL` and a short maintenance window; it is the owner's decision (AUDIT.md A2-24).

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
