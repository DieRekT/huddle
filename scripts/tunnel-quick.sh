#!/bin/bash
# Quick tunnel - temporary URL (for testing only)
# For production use, set up a permanent tunnel: ./scripts/setup-tunnel-idview.sh

set -euo pipefail

PORT="${PORT:-8787}"

# Check if permanent tunnel is configured
CONFIG_FILE="$HOME/.cloudflared/config.yml"
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs) 2>/dev/null || true
fi

if [ -f "${CONFIG_FILE}" ] && [ -n "${PUBLIC_BASE_URL:-}" ]; then
  echo "⚠️  WARNING: Permanent tunnel is already configured: ${PUBLIC_BASE_URL}"
  echo ""
  echo "For permanent tunnel with stable URL, use:"
  echo "  ./scripts/start-app.sh"
  echo ""
  echo "This script creates a temporary URL that changes each time."
  echo "QR codes won't work across restarts with temporary tunnels."
  echo ""
  read -p "Continue with temporary tunnel anyway? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled. Use ./scripts/start-app.sh for permanent tunnel."
    exit 0
  fi
  echo ""
fi

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

echo "⚠️  Starting temporary Cloudflare Tunnel (trycloudflare)..."
echo "⚠️  WARNING: This creates a temporary URL that changes each time."
echo "⚠️  QR codes will NOT work across restarts with temporary tunnels."
echo ""
echo "For permanent tunnel with stable URL, run:"
echo "  ./scripts/setup-tunnel-idview.sh"
echo "  ./scripts/start-app.sh"
echo ""
echo "Local service: http://localhost:${PORT}"
echo "When cloudflared prints the HTTPS URL, open it on your laptop + phones."
echo ""

"$CLOUDFLARED" tunnel --url "http://localhost:${PORT}"


