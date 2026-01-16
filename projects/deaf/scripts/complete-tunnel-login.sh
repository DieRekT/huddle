#!/bin/bash
# Helper script to complete Cloudflare tunnel login
# This provides instructions for the manual browser login step

set -euo pipefail

SCRIPT_DIR="$(dirname "$0")"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_DIR}"

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

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Cloudflare Tunnel Login Helper                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if already logged in
if "$CLOUDFLARED" tunnel list >/dev/null 2>&1; then
  echo "✅ Already logged in to Cloudflare!"
  echo ""
  echo "Tunnels:"
  "$CLOUDFLARED" tunnel list
  exit 0
fi

# Check if cert.pem already exists
if [ -f ~/.cloudflared/cert.pem ]; then
  echo "✅ Origin certificate found at ~/.cloudflared/cert.pem"
  echo ""
  echo "Verifying certificate..."
  if "$CLOUDFLARED" tunnel list >/dev/null 2>&1; then
    echo "✅ Certificate is valid!"
    "$CLOUDFLARED" tunnel list
    exit 0
  else
    echo "⚠️  Certificate exists but appears invalid. Please login again."
    echo ""
  fi
fi

echo "To complete Cloudflare tunnel setup, you need to authenticate."
echo ""
echo "METHOD 1: Automatic browser login (recommended)"
echo "-----------------------------------------------"
echo "This will open a browser window for you to login:"
echo ""
read -p "Press Enter to start browser login, or Ctrl+C to cancel..."
echo ""
echo "Starting login process..."
echo ""
"$CLOUDFLARED" tunnel login || {
  echo ""
  echo "⚠️  Browser login didn't complete automatically."
  echo ""
  echo "METHOD 2: Manual certificate download"
  echo "--------------------------------------"
  echo "1. Open this URL in your browser:"
  echo "   https://dash.cloudflare.com/argotunnel"
  echo ""
  echo "2. Log in to your Cloudflare account"
  echo ""
  echo "3. Authorize the tunnel application"
  echo ""
  echo "4. Your browser will download a file named 'cert.pem'"
  echo ""
  echo "5. Save it to: ~/.cloudflared/cert.pem"
  echo ""
  echo "   You can also run:"
  echo "   mkdir -p ~/.cloudflared"
  echo "   mv ~/Downloads/cert.pem ~/.cloudflared/cert.pem"
  echo ""
  echo "6. Then run this script again to verify"
  exit 1
}

echo ""
echo "✅ Login successful!"
echo ""
echo "Verifying authentication..."
"$CLOUDFLARED" tunnel list
echo ""
echo "Next step: Run ./scripts/setup-tunnel-idview.sh to create the tunnel"





