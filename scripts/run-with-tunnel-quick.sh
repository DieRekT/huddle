#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Run ./scripts/setup.sh first."
  exit 1
fi

export $(cat .env | grep -v '^#' | xargs)

PORT="${PORT:-8787}"

# Check if permanent tunnel is configured
CONFIG_FILE="$HOME/.cloudflared/config.yml"
if [ -f "${CONFIG_FILE}" ] && [ -n "${PUBLIC_BASE_URL:-}" ]; then
  echo "✅ Permanent Cloudflare tunnel is configured: ${PUBLIC_BASE_URL}"
  echo "   Using permanent tunnel instead of temporary one..."
  echo ""
  # Use start-app.sh which handles permanent tunnel + server
  exec "$(dirname "$0")/start-app.sh"
  exit $?
fi

echo "⚠️  WARNING: Using temporary tunnel (changes URL each time)"
echo "   For permanent tunnel with stable URL, run: ./scripts/setup-tunnel-idview.sh"
echo ""

CLOUDFLARED="./bin/cloudflared"
if [ ! -x "$CLOUDFLARED" ]; then
  if command -v cloudflared >/dev/null 2>&1; then
    CLOUDFLARED="cloudflared"
  else
    echo "ERROR: cloudflared not found."
    echo "Run: ./scripts/install-cloudflared.sh"
    exit 1
  fi
fi

echo "Starting RoomBrief on http://localhost:${PORT}"
echo "Starting temporary Cloudflare Tunnel (trycloudflare) for HTTPS sharing"
echo "⚠️  Note: Temporary tunnel URL changes each time. QR codes won't work across restarts."
echo ""

cleanup() {
  echo ""
  echo "Stopping processes..."
  kill "${SERVER_PID:-}" 2>/dev/null || true
  kill "${TUNNEL_PID:-}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

node server.js &
SERVER_PID=$!

"$CLOUDFLARED" tunnel --url "http://localhost:${PORT}" &
TUNNEL_PID=$!

wait "${SERVER_PID}"


