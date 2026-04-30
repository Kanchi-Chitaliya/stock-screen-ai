#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== StockScreenAI ==="

# --- Backend ---
echo "[1/4] Installing Python dependencies..."
cd "$ROOT/backend"
pip install -r requirements.txt -q

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "  → Created backend/.env  — add your ANTHROPIC_API_KEY to enable AI Analysis"
fi

echo "[2/4] Starting FastAPI backend on :8000..."
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# --- Frontend ---
echo "[3/4] Installing Node dependencies..."
cd "$ROOT/frontend"
npm install -q

echo "[4/4] Starting Vite frontend on :5173..."
npm run dev &
FRONTEND_PID=$!

echo ""
echo "  Frontend → http://localhost:5173"
echo "  API docs → http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers."

cleanup() {
  echo "Stopping..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM

wait
