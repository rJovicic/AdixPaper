#!/bin/bash
# Adix Paper - Pokretanje lokalno (za testiranje)
# Potrebno: PostgreSQL lokalno instaliran ili koristiti SQLite u dev modu

echo "==============================="
echo "  Adix Paper - Evidencija Održavanja"
echo "==============================="
echo ""

# Postavi PATH za node i uv
export PATH="$HOME/node/bin:$HOME/.local/bin:$PATH"

# Pokreni backend
echo ">> Pokrećem backend (FastAPI)..."
cd "$(dirname "$0")/backend"
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!
echo "   Backend: http://localhost:8000"
echo "   API Docs: http://localhost:8000/docs"

sleep 2

# Pokreni frontend dev server
echo ""
echo ">> Pokrećem frontend (React)..."
cd "$(dirname "$0")/frontend"
npm run dev &
FRONTEND_PID=$!
echo "   Frontend: http://localhost:3000"

echo ""
echo "Aplikacija pokrenuta!"
echo "Pritisni Ctrl+C za zaustavljanje."
echo ""

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
