#!/bin/bash
# Adix Paper - Pokretanje lokalno (za testiranje)
# Potrebno: PostgreSQL lokalno instaliran ili koristiti SQLite u dev modu

echo "==============================="
echo "  Adix Paper - Evidencija Održavanja"
echo "==============================="
echo ""

# Postavi PATH za node i uv
export PATH="$HOME/node/bin:$HOME/.local/bin:$PATH"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo localhost)"

# Ako lokalni PostgreSQL nije dostupan, koristi SQLite da dev server ipak radi.
if [ -z "$DATABASE_URL" ]; then
  ENV_DATABASE_URL="$(awk -F= '/^DATABASE_URL=/{print substr($0, index($0, "=") + 1)}' "$SCRIPT_DIR/backend/.env" 2>/dev/null | tr -d '\"' | tr -d "'")"
  if [ -z "$ENV_DATABASE_URL" ] || { echo "$ENV_DATABASE_URL" | grep -Eq 'postgres(ql)?://.*localhost:5432' && ! nc -z localhost 5432 2>/dev/null; }; then
    export DATABASE_URL="sqlite:///$SCRIPT_DIR/backend/adix_local.db"
    echo ">> Lokalni PostgreSQL nije dostupan, koristim SQLite dev bazu: backend/adix_local.db"
  fi
fi

# Pokreni backend
echo ">> Pokrećem backend (FastAPI)..."
cd "$SCRIPT_DIR/backend"
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "   Backend: http://localhost:8000"
echo "   Backend LAN: http://$LAN_IP:8000"
echo "   API Docs: http://localhost:8000/docs"

sleep 2

# Pokreni frontend dev server
echo ""
echo ">> Pokrećem frontend (React)..."
cd "$SCRIPT_DIR/frontend"
npm run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!
echo "   Frontend: http://localhost:3000"
echo "   Frontend LAN: http://$LAN_IP:3000"

echo ""
echo "Aplikacija pokrenuta!"
echo "Pritisni Ctrl+C za zaustavljanje."
echo ""

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
