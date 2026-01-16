#!/bin/bash
set -euo pipefail

TUNNEL_NAME="${1:-roombrief}"

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

echo "Running named Cloudflare Tunnel: ${TUNNEL_NAME}"
echo "Config is expected at: ~/.cloudflared/config.yml"
echo ""

"$CLOUDFLARED" tunnel run "${TUNNEL_NAME}"


