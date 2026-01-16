#!/bin/bash
# Start Cloudflare tunnel
set -euo pipefail

TUNNEL_NAME="${1:-huddle}"

CLOUDFLARED="./bin/cloudflared"
if [ ! -x "$CLOUDFLARED" ]; then
  if command -v cloudflared >/dev/null 2>&1; then
    CLOUDFLARED="cloudflared"
  else
    echo "ERROR: cloudflared not found."
    echo "Run: ./scripts/install-cloudflared.sh first"
    exit 1
  fi
fi

echo "Starting Cloudflare tunnel: ${TUNNEL_NAME}..."
echo ""

# Check if config exists
CONFIG_FILE="$HOME/.cloudflared/config.yml"
if [ ! -f "${CONFIG_FILE}" ]; then
  echo "ERROR: Config file not found at ${CONFIG_FILE}"
  echo "Run: ./scripts/setup-tunnel-idview.sh first"
  exit 1
fi

# Start tunnel
"$CLOUDFLARED" tunnel run "${TUNNEL_NAME}"
















