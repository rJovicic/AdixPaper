#!/usr/bin/env bash
# Local development: FastAPI on :8000 (auto-reload) and Vite on :3000 (proxies /api to :8000).
# Requires backend/.venv (see README) and frontend/node_modules.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

# Without DATABASE_URL (env or backend/.env), fall back to a local SQLite file.
if [ -z "${DATABASE_URL:-}" ] && ! grep -qs '^DATABASE_URL=' "$ROOT/backend/.env"; then
  export DATABASE_URL="sqlite:///$ROOT/backend/adix_local.db"
  echo ">> DATABASE_URL not set, using SQLite: backend/adix_local.db"
fi
export ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin-pass-123}"

cd "$ROOT/backend"
# shellcheck disable=SC1091
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload --log-config log_config.json &
BACKEND_PID=$!

cd "$ROOT/frontend"
npm run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!

trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null' EXIT INT TERM
echo ">> App: http://localhost:3000  (admin / ${ADMIN_PASSWORD})   API docs: http://localhost:8000/docs"
wait
