# Railway deploy

AdixPaper deploys as **one** Railway service built from the root `Dockerfile`
(React is built and served by FastAPI on the same origin) plus a Railway Postgres.

Required variables on the app service: `DATABASE_URL=${{Postgres.DATABASE_URL}}`,
`SECRET_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`. Health check: `GET /health`.
