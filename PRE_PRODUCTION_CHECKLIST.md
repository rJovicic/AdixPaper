# Pre-production checklist — PR #3 (command center)

Prepared 2026-10-28 from the repository and **read-only** Railway API calls. Nothing in production was changed, no secret values were read, no migration was run against production, and PR #3 is not merged.

**Legend**
- **[V]** verified today (Railway API, build logs, repository code, CI)
- **[D]** from Railway's documentation as of today, not tried on this project
- **[A]** assumption, not verified
- 🔒 **needs your approval** (changes production, costs money, touches real personal data, or is a legal/business decision)

> **Merging PR #3 deploys to production immediately.** The service auto-deploys `main` [V] and does not wait for CI [V: `checkSuites: false`]. Do every 🔒 step you want *before* merging.

---

## 0. Tools and permissions used for this review

| Tool | Access | Used for |
|---|---|---|
| Railway MCP (account `rjovicic`) [V] | Full account access — it *could* change production | Only read calls: `describe-service`, `environment-status`, `list-deployments`, `list-domains`, `list-webhooks`, build log, docs search |
| `list-variables` | Returns secret **values** in plain text | **Not used.** Variable *names* come from `describe-service` |
| GitHub MCP | PR #3 read, CI status | CI check runs |
| Local sandbox | Postgres 16, Playwright | Tests; Postgres 18 could not be installed (network policy) |
| Not available | — | Railway billing/plan, backup status, Postgres data and row counts (would need DB credentials) |

---

## 1. Current production setup

| Item | Value | Status |
|---|---|---|
| Railway project | `zucchini-insight` (`bc25566b-…`), environment `production` (the only one) | [V] |
| App service | `AdixPaper`, source `rJovicic/AdixPaper` branch `main`, 1 replica, online, last deploy `6d5c87bb` (commit `ab992b2`, PR #2) SUCCESS | [V] |
| Build | Dashboard says RAILPACK, but `railway.toml` sets `DOCKERFILE`; the build log shows the Dockerfile stages, so `railway.toml` wins | [V] |
| Health check / restarts | `/health`, 120 s; restart on failure ×5 (from `railway.toml`) | [V] repo, [A] applied |
| Wait for CI before deploy | **Off** (`checkSuites: false`) | [V] |
| Domain | `adixpaper-production.up.railway.app`, no custom domain | [V] |
| App variables (names only) | `ACCESS_TOKEN_EXPIRE_MINUTES`, `ADMIN_PASSWORD`, `ADMIN_USERNAME`, `DATABASE_URL`, `SECRET_KEY` | [V] |
| Not set | `PUBLIC_URL`, `VAPID_*` (push off), `ADMIN_RESET_PASSWORD`, `CORS_ORIGINS` | [V] |
| `DATABASE_URL` is a reference `${{Postgres.DATABASE_URL}}` | Set that way on 2026-10-26 according to DEPLOYMENT.md; the value was not read today | [A] |
| Database | `Postgres` service, image `postgres-ssl:18` (**PostgreSQL 18**), 1 replica, online | [V] |
| Database volume | `postgres-volume`, 5000 MB, `us-west2` | [V] |
| Region | `us-west2` (California) for both services | [V] |
| Backups | **Unknown**: no API visibility; earlier audit could not verify either | [A] assume none until you check |
| Alerts | **No project webhooks** | [V] |
| Pending work | One staged environment patch from 2026-10-26 with **0 changes** | [V]; harmless, but never click "Deploy" on staged changes without reading them |
| CI / tests | PR #3 green (backend, frontend, e2e incl. Docker build) — on **PostgreSQL 16** | [V] |

**Gap:** production runs Postgres 18 while CI and all local tests use 16. The code only adds columns, indexes and a table and uses standard SQL, so the risk is low but **not tested**. The staging run in §7 closes this gap.

### Checklist
- [ ] You: Railway → `zucchini-insight` → `AdixPaper` → Variables → raw editor: confirm `DATABASE_URL` reads `${{Postgres.DATABASE_URL}}`, not a pasted connection string. This decides whether a duplicated environment gets its own database (§7). No change.
- [ ] You: Railway → Postgres → **Backups** tab: note whether schedules exist. No change.
- [ ] You: confirm the admin password was changed in the app, then decide whether to remove `ADMIN_PASSWORD` from variables (🔒; it is only used on first start or with `ADMIN_RESET_PASSWORD=true`).
- [ ] 🔒 Enable **Wait for CI** on the `AdixPaper` service (Settings → Source) so a red build on `main` never deploys [D]. Low risk; it is a production setting.

---

## 2. Backups and a restore test

What Railway offers [D]:
- **Volume backups** on the Postgres volume: manual, or scheduled. Daily runs are kept 6 days, weekly runs 1 month, monthly runs 3 months.
- Backups are incremental, copy-on-write, billed per GB like volumes.
- **Point-in-time recovery** (PITR) is also offered.
- **Restore** stages a *new* volume on the *same* service; the old volume is unmounted but kept. You then review and click Deploy.

**A restore on production replaces production's data volume**, so the restore drill must not be done on the production service.

### Steps
1. 🔒 Production → Postgres → Backups → enable **Daily + Weekly** (cost: storage of changed blocks). Then take one **manual backup** before merging PR #3.
2. Restore drill, Railway mechanics, in the staging environment from §7 only:
   1. In staging, create a few faults and machines.
   2. Take a manual backup of the **staging** Postgres volume.
   3. Delete a fault or change a machine.
   4. Restore the backup → review the staged change → Deploy (staging only).
   5. Check the deleted fault is back; `/health` returns 200.
3. 🔒 Logical restore drill with a copy of real data. This needs production DB credentials and handles employees' personal data.
   1. `pg_dump -Fc --no-acl --no-owner` from production through a **temporary** TCP proxy, read-only use.
   2. `pg_restore --no-acl --no-owner` into **staging** Postgres.
   3. Compare row counts per table (`korisnici`, `oprema`, `kvarovi`, `kvar_dogadjaji`, `rezervni_dijelovi`, `kvar_rezervni_dijelovi`).
   4. Remove the TCP proxy afterwards.
   5. Keep the dump file only as long as the test needs, then delete it.
4. Write the date, backup id and result into `AUDIT.md` (A2-23). The launch checklist item stays open until a restore has actually worked once.

---

## 3. Data region

| Fact | Status |
|---|---|
| App and database run in `us-west2` (California) | [V] |
| Railway's EU region is `europe-west4-drams3a` (Amsterdam) | [D] |
| Changing a service's region: no downtime without a volume; **with a volume the data is migrated and the service is down during the migration** (time depends on size) | [D] |
| Volume size today: 5000 MB allocated; actual data size unknown | [V] allocated, [A] used |
| Railway is a US company even in the EU region; a DPA/SCC review is still needed | [A] legal |

### Decision 🔒 (owner, with legal advice)
Employee personal data in the US is a third-country transfer (GDPR Chapter V). Either confirm Railway's DPA/SCCs cover it, or move to the EU.

### If moving (recommended *before* real use and before photos accumulate, while the volume is small)
1. Announce a maintenance window (expect minutes, not hours, while the data is small [A]).
2. 🔒 Manual backup (§2.1). Then, to have a copy outside Railway as well, 🔒 a `pg_dump` (§2.3).
3. 🔒 Change the **Postgres** service region to EU West (the volume migrates; downtime). Then change the **AdixPaper** service region (no downtime).
   - Alternative with an easier rollback: create a new EU Postgres, `pg_restore` into it, and repoint `DATABASE_URL`. More steps, but the old database stays untouched until you delete it.
4. Verify:
   - `/health` returns 200;
   - you can sign in;
   - row counts match the pre-move dump;
   - an existing fault and its timeline open.
5. The domain, `DATABASE_URL` reference and QR labels do not change (same services, same domain) [D for region change; A for the alternative].
6. Update DEPLOYMENT.md "Region and personal data" and AUDIT.md A2-24.

---

## 4. `PUBLIC_URL` and QR labels

How it works [V, code `backend/app/routers/oprema.py`]:
- The label PDF encodes `PUBLIC_URL` + `/m/<machine id>`. When `PUBLIC_URL` is empty, it uses the URL of the request that generated the PDF.
- The app runs with `--proxy-headers` [V, Dockerfile], so behind Railway that should be `https://adixpaper-production.up.railway.app` [A: never decoded from a production-printed label].
- The scanner (PR #3) only uses the numeric id from any `/m/<id>` URL [V]. A label printed under one domain still works in the in-app scanner on another domain, but **the phone camera app opens the printed domain**.

### Steps
1. 🔒 Decide the permanent domain (e.g. a company subdomain). Every label printed before a domain change must be reprinted.
2. 🔒 Add the custom domain in Railway (DNS record at your registrar) → wait for the certificate.
3. 🔒 Set `PUBLIC_URL=https://<final domain>` on production (no trailing slash). This triggers a redeploy.
4. Print **one** test label, then scan it with an iPhone camera and with an Android camera, signed out:
   - it should open sign-in, then the report form with the machine chosen;
   - a lead should land on that machine's faults.
5. Only then print all labels.
6. **Never print labels from staging or a preview environment**: they would point at an address that will be deleted.
7. Machine ids survive a region move or `pg_dump`/`pg_restore` (ids are dumped), so labels survive §3.

---

## 5. Photo retention

Current behaviour [V]:
- Photos are stored in Postgres (`kvar_prilozi`), re-encoded JPEG, ≤ 1600 px, EXIF and GPS removed, at most 6 per fault.
- They are deleted only when someone removes one, or when an admin deletes the whole fault. **No automatic retention.**
- Estimate: 150–400 kB per photo, so about 1 GB a year at 50 photos a week [A].

| Option | Effort | Implications |
|---|---|---|
| A. Keep for the life of the fault record (status quo) | None | Simplest. Volume grows (5 GB allocated; watch it, §6). Backups grow. Must be stated in the privacy notice. |
| B. Delete photos N months after the fault is resolved (e.g. 12 or 24), keep the fault record | Small code change (daily cleanup at startup or a Railway cron) + test | Bounded storage; fault history stays; photos used as evidence disappear after N months. The deletion is logged in the timeline. |
| C. Move photos to object storage (Railway bucket / S3) with lifecycle rules | Medium: infrastructure, credentials, code | Database stays small; another place where personal data lives (region, access, DPA); bucket region cannot change later [D]. |

**Recommendation:** B with 24 months, plus a line in the report form and privacy notice: "Photograph the machine, not people."

- [ ] 🔒 Choose A, B or C and N. Ask me to implement B as a separate small PR, not inside PR #3.

---

## 6. Employee privacy notice and error alerting

### Privacy notice (GDPR Art. 13) 🔒 owner / legal
The app processes:
- names, username, phone, email, department and role;
- sign-in times;
- who reported, handled and commented on each fault;
- photos (may show people) and push subscriptions.

The notice must come from the employer. It is not legal text from this review [A: I am not a lawyer]. Content outline:
1. **Controller**: Cupup d.o.o / Delt papir d.o.o, and contact details (and the DPO, if appointed).
2. **Purposes**: maintenance fault handling, accountability, analytics. **Legal basis**: typically employer obligations or legitimate interest (decision for legal).
3. **Recipients and processors**: Railway (hosting), GitHub only for code (no personal data) [A].
4. **Transfers**: US region today (§3), and the safeguards relied on.
5. **Retention**: faults, users, photos (§5) and sign-in data.
6. **Rights** (access, rectification, erasure where applicable, objection) and the right to complain to **AZOP** (Croatian DPA).
7. Instruction not to photograph people.

- [ ] 🔒 Provide the text; I can add a "Privacy" link on the sign-in page and in the account menu (small change, separate PR).

### Error alerting — nothing is configured today [V: no webhooks]
| Option | What it catches | Cost / data |
|---|---|---|
| Railway **project webhook** → Slack/Discord/email relay [D] | Failed builds, crashed deployments, monitor alerts | Free [A]; event metadata only |
| Railway **monitors** [D] | CPU/memory thresholds; **volume usage** (set 80 % on `postgres-volume` for photo growth) | Notifications by email/in-app [D] |
| External uptime check on `/health` every 1–5 min | Outages the platform does not report | Third-party service; no personal data |
| Sentry (or similar) in the app | Unhandled exceptions and 5xx with stack traces | Code change + DSN secret; error payloads may include personal data, so it needs scrubbing and goes in the privacy notice |

- [ ] 🔒 Minimum before launch: one webhook for `Deployment.failed` / `crashed`, a volume monitor at 80 %, and an uptime check on `/health`.

---

## 7. Safe staging / preview procedure (does not touch production)

Railway offers two routes [D]:
- **Duplicate Environment**: copies services, variables and configuration, and stages everything for your review.
- **PR environments**: a copy per pull request.

Either one runs a second app and a second Postgres. **That costs usage** 🔒, while builds are not billed [D]. Delete the environment afterwards.

### Steps (Duplicate Environment)
1. 🔒 Railway → `zucchini-insight` → Environments → **New → Duplicate `production`** → name it `staging`. The services are staged, **not deployed yet** [D].
2. Before approving the staged deploy, check in the **staging** environment only:
   1. `AdixPaper` → Settings → Source → **branch = `claude/command-center-redesign`** (not `main`).
   2. `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`, so it points at the **staging** Postgres. If it holds a pasted production URL, **stop**: staging would write to production.
   3. `SECRET_KEY` → a **new** random value, so production sessions are not valid in staging.
   4. `ADMIN_PASSWORD` → a staging-only value.
   5. Leave `PUBLIC_URL` and `VAPID_*` unset.
   6. Staging's Postgres volume starts **empty** [A: verify the volume shows as new and small].
3. Deploy staging. Expect:
   - the app starts;
   - startup creates the schema on the empty PostgreSQL 18 database (`create_all` plus the additive checks).
4. Run against the staging domain only:
   - `python3 e2e/seed-demo.py https://<staging-domain>`. The script refuses `railway.app` URLs, so for a `*.up.railway.app` staging domain either use a custom staging domain or run the Playwright suite (`E2E_BASE_URL=https://<staging-domain> npx playwright test`) after creating the admin.
5. **Migration on real-shaped data (optional, 🔒 §2.3):**
   1. Deploy staging from `main` (the current production code).
   2. `pg_restore` a production dump into it.
   3. Switch the branch to `claude/command-center-redesign` and deploy. This runs exactly the additive migration production will run, on PostgreSQL 18, against a copy of real data.
   4. Check sign-in, old faults, the overview counts, and that `verzija = 1` was added to existing rows.
6. Manual phone checks on staging:
   - iOS Safari: photo picker and report;
   - Android Chrome: in-app QR scan of a label *printed from staging for this test only*, then discard the label;
   - push only if you set staging VAPID keys.
7. Do the backup and restore drill (§2.2) here.
8. 🔒 Delete the `staging` environment when done (stops usage; removes its volume and data).

### Then, production rollout
1. 🔒 Manual production backup (§2.1).
2. 🔒 Merge PR #3 → automatic deploy.
3. Watch the deploy log for the additive `ALTER TABLE` / `CREATE INDEX` lines; then check:
   - `/health` returns 200;
   - you can sign in;
   - the overview figures look right;
   - an old fault opens.
4. Rollback if needed: Railway → Deployments → the previous deployment (`6d5c87bb`) → **Rollback** [V: `canRollback: true`].
   - The added columns and table stay; no database restore is needed. **[V] 2026-10-28, locally:** the production code (`ab992b2`) ran against a database migrated by PR #3 (PostgreSQL 16) and served sign-in, lists, fault detail, statistics, create and update.
   - One difference after a rollback: deleting a fault that has photos returns 500, because the database's foreign key refuses it. Nothing is lost; that delete is admin-only API, not offered in the UI.
   - Faults put on hold under the old code have no reason until edited.

---

## Approval summary

| # | Action | Why it needs you |
|---|---|---|
| 1 | Enable Wait for CI | Production setting |
| 2 | Remove `ADMIN_PASSWORD` variable (after confirming the in-app password change) | Production setting / access |
| 3 | Enable backup schedules; take a manual backup | Production + cost |
| 4 | `pg_dump` of production; temporary TCP proxy | Credentials + employees' personal data |
| 5 | Region decision and move | Legal + downtime |
| 6 | Final domain, DNS, `PUBLIC_URL` | Production setting, business decision |
| 7 | Photo retention option and period | Policy |
| 8 | Privacy notice text | Legal |
| 9 | Alerting (webhook, monitor, uptime service) | New integrations; possible third party |
| 10 | Create and later delete `staging` | Usage cost |
| 11 | Merge PR #3 | Production deploy |

Nothing above has been done. PR #3 stays open.
