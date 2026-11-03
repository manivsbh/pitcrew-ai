#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-8000}"
HOST="${HOST:-0.0.0.0}"
ROOM="${ROOM:-FORMA1}"
DO_BUILD=0
AUTO_TUNNEL=0

for arg in "$@"; do
  case "$arg" in
    --build) DO_BUILD=1 ;;
    --tunnel) AUTO_TUNNEL=1 ;;
  esac
done

if [[ "$DO_BUILD" -eq 1 || ! -f "$ROOT_DIR/frontend/dist/index.html" ]]; then
  echo "[MFI] Building frontend bundle (Desktop Studio + Mobile Companion)..."
  (cd "$ROOT_DIR/frontend" && npm run build)
fi

PYTHON_BIN="$ROOT_DIR/.venv/bin/python"
UVICORN_BIN="$ROOT_DIR/.venv/bin/uvicorn"

LAN_IP="$("$PYTHON_BIN" -c "from backend.app.mobile_sync import detect_lan_ips; ips=detect_lan_ips(); print(ips[0] if ips else '127.0.0.1')")"

echo ""
echo "=================================================================="
echo "  Machine Fault Investigator — Desktop Studio + Mobile Sync"
echo "=================================================================="
echo "  Desktop Studio : http://localhost:${PORT}/?room=${ROOM}"
echo "  Mobile (Wi-Fi) : http://${LAN_IP}:${PORT}/?room=${ROOM}&mobile=1"
echo "  QR Pairing     : Click 'Connect Mobile' in the top bar for"
echo "                   instant QR + 1-click HTTPS Tunnel (Mic/Camera)"
echo "=================================================================="
echo ""

if [[ "$AUTO_TUNNEL" -eq 1 ]]; then
  (
    for _ in {1..25}; do
      if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
        echo "[MFI] Starting public HTTPS tunnel for mobile Mic + Camera..."
        TUNNEL_JSON="$(curl -fsS -X POST "http://127.0.0.1:${PORT}/api/mobile/tunnel/start?local_port=${PORT}" || true)"
        if [[ -n "$TUNNEL_JSON" ]]; then
          "$PYTHON_BIN" -c "import json,sys; d=json.loads(sys.argv[1]); u=d.get('url'); print(f'\n  [HTTPS MOBILE READY] {u}/?room=${ROOM}&mobile=1\n' if u else f'  [Tunnel Info] {d}')" "$TUNNEL_JSON"
        fi
        break
      fi
      sleep 0.4
    done
  ) &
fi

exec "$UVICORN_BIN" backend.app.main:app --host "$HOST" --port "$PORT"
