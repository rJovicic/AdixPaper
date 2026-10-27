# Adix Paper

Fault and maintenance log for the Cupup d.o.o and Delt papir d.o.o paper-converting plants.

- **Workers** report a machine fault from their phone in under a minute and follow it until it is fixed.
- **Maintenance leads** see what is overdue first, take faults, record the repair (work done, downtime, cost, spare parts) and close them.
- **Administrators** also manage users, machines and their parts, the spare-parts catalogue, and export Excel/PDF reports.
- **Machine QR labels**: print one per machine; scanning it opens the report form with that machine chosen (leads see its faults).
- Everyone can change their own password; doing so signs out their other devices.

Interface in Croatian (default) and English. Production: <https://adixpaper-production.up.railway.app>

| Document | Contents |
|---|---|
| [PRODUCT.md](PRODUCT.md) | Users, journeys, principles, acceptance criteria |
| [DESIGN.md](DESIGN.md) | Design system: tokens, components, accessibility |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Railway setup, variables, verification, troubleshooting |
| [AUDIT.md](AUDIT.md) | Audit findings, launch checklist, backlog and verdict |
| [decisions.md](decisions.md) | Decisions someone might want to revisit |

## Stack

- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2, PostgreSQL (psycopg 3), PyJWT, bcrypt; Excel/PDF via openpyxl/reportlab; optional Web Push.
- **Frontend:** React 18, React Router 7, Vite 7, Tailwind CSS 3, recharts, lucide icons, Geist + Geist Mono (self-hosted).
- **Deployment:** one Docker image (FastAPI serves the API and the built SPA) + Railway Postgres.

```
backend/app/
  main.py          app, health check, SPA serving
  pdf.py, fonts/   shared PDF font (Liberation Sans, for č/ć/đ)
  bootstrap.py     startup: schema, seed data, first admin
  routers/         auth, korisnici (users), oprema (machines), kvarovi (faults), dashboard, rezervni_dijelovi, notifikacije
  models.py schemas.py auth.py security.py timeutil.py
frontend/src/
  pages/worker/    MyFaults, ReportFault, WorkerFault  (MachineLink: /m/:id from QR labels)
  pages/admin/     Dashboard (overview), Analytics, Faults, FaultDetail, Machines, SpareParts, Users
  components/      shells, Timeline, FaultCard, ui/ (Dialog, Field, Toast, Marks, PartPicker…)
  i18n/            hr.js, en.js, provider and formatters
e2e/               Playwright end-to-end + accessibility tests
```

## Local development

Prerequisites: Python 3.12, Node 22, PostgreSQL 16 (or nothing: SQLite is used as a fallback).

```bash
# Backend
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # set DATABASE_URL, ADMIN_PASSWORD

# Frontend
cd ../frontend && npm ci

# Run both (API :8000, app :3000)
cd .. && ./start.sh
```

Sign in at <http://localhost:3000> with `ADMIN_USERNAME` / `ADMIN_PASSWORD`. To get realistic data in a **local** database: `python3 e2e/seed-demo.py` (refuses Railway URLs).

## Tests and checks

```bash
# Backend: 57 tests (set TEST_DATABASE_URL to use PostgreSQL; SQLite otherwise)
cd backend && ruff check app tests && python -m pytest -q

# Frontend
cd frontend && npm run lint && npm run check:i18n && npm run build

# End-to-end + accessibility (25 tests; the new-version banner test runs only against a production build) (needs the app running and seed-demo data)
cd e2e && npm ci && npx playwright test                      # against Vite on :3000
E2E_BASE_URL=http://localhost:8000 npx playwright test       # against the Docker image
```

The same checks run in GitHub Actions on every push and pull request.

## Deployment

Push to `main`; Railway builds the root `Dockerfile` and gates the release on `GET /health`. See [DEPLOYMENT.md](DEPLOYMENT.md).
