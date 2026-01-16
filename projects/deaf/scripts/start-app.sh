#!/bin/bash
# Start both Cloudflare tunnel and server
# This script manages both processes and handles cleanup

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "${PROJECT_DIR}"

TUNNEL_NAME="${1:-huddle}"
PORT="${PORT:-8787}"

# Cleanup function
cleanup() {
  echo ""
  echo "Shutting down..."
  kill ${TUNNEL_PID} ${SERVER_PID} 2>/dev/null || true
  wait ${TUNNEL_PID} ${SERVER_PID} 2>/dev/null || true
  echo "Done."
  exit 0
}

trap cleanup SIGINT SIGTERM

# Check if cloudflared is available
CLOUDFLARED="./bin/cloudflared"
if [ ! -x "$CLOUDFLARED" ]; then
  if command -v cloudflared >/dev/null 2>&1; then
    CLOUDFLARED="cloudflared"
  else
    echo "WARNING: cloudflared not found. Starting server only (no tunnel)."
    echo "For full functionality, install cloudflared: ./scripts/install-cloudflared.sh"
    echo ""
    cd "${PROJECT_DIR}"
    PORT="${PORT}" npm start
    exit $?
  fi
fi

# Check if tunnel is set up
CONFIG_FILE="$HOME/.cloudflared/config.yml"
if [ ! -f "${CONFIG_FILE}" ]; then
  echo "WARNING: Tunnel config not found. Starting server only (no tunnel)."
  echo "To set up tunnel: ./scripts/setup-tunnel-idview.sh"
  echo ""
  cd "${PROJECT_DIR}"
  PORT="${PORT}" npm start
  exit $?
fi

# Load PUBLIC_BASE_URL from .env if set
if [ -f .env ]; then
  export $(grep -v '^#' .env | grep PUBLIC_BASE_URL | xargs) 2>/dev/null || true
fi

echo "Starting RoomBrief/Huddle application..."
echo "  Tunnel: ${TUNNEL_NAME}"
echo "  Server: http://localhost:${PORT}"
if [ -n "${PUBLIC_BASE_URL:-}" ]; then
  echo "  Public URL: ${PUBLIC_BASE_URL}"
fi
echo ""

# Start tunnel in background
echo "Starting Cloudflare tunnel..."
"${CLOUDFLARED}" tunnel run "${TUNNEL_NAME}" > /tmp/huddle-tunnel.log 2>&1 &
TUNNEL_PID=$!

# Wait a moment for tunnel to initialize
sleep 3

# Check if tunnel started successfully
if ! kill -0 ${TUNNEL_PID} 2>/dev/null; then
  echo "ERROR: Tunnel failed to start. Check logs: /tmp/huddle-tunnel.log"
  exit 1
fi

echo "✅ Tunnel started (PID: ${TUNNEL_PID})"
echo ""

# Start server in background
echo "Starting server..."
cd "${PROJECT_DIR}"
PORT="${PORT}" npm start > /tmp/huddle-server.log 2>&1 &
SERVER_PID=$!

# Wait a moment for server to start
sleep 2

# Check if server started successfully
if ! kill -0 ${SERVER_PID} 2>/dev/null; then
  echo "ERROR: Server failed to start. Check logs: /tmp/huddle-server.log"
  kill ${TUNNEL_PID} 2>/dev/null || true
  exit 1
fi

echo "✅ Server started (PID: ${SERVER_PID})"
echo ""

# Display URLs
if [ -n "${PUBLIC_BASE_URL:-}" ]; then
  echo "🌐 Application is available at: ${PUBLIC_BASE_URL}"
else
  echo "🌐 Application is available at: http://localhost:${PORT}"
  echo "   (Set PUBLIC_BASE_URL in .env for HTTPS tunnel URL)"
fi
echo ""
echo "Logs:"
echo "  Tunnel: /tmp/huddle-tunnel.log"
echo "  Server: /tmp/huddle-server.log"
echo ""
echo "Press Ctrl+C to stop both services..."
echo ""

# Wait for both processes
wait ${TUNNEL_PID} ${SERVER_PID}
















