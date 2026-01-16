#!/bin/bash
# Setup Cloudflare tunnel with idview.org domain
# This script sets up a named tunnel for the RoomBrief/Huddle app

set -euo pipefail

TUNNEL_NAME="${1:-huddle}"
SUBDOMAIN="${2:-huddle}"
DOMAIN="${3:-idview.org}"
FULL_HOSTNAME="${SUBDOMAIN}.${DOMAIN}"

# Load Cloudflare API token from .env if available
SCRIPT_DIR="$(dirname "$0")"
ENV_FILE="${SCRIPT_DIR}/../.env"
if [ -f "${ENV_FILE}" ]; then
  # Source .env file and export CLOUDFLARE_API_TOKEN if set
  set -a
  source "${ENV_FILE}" 2>/dev/null || true
  set +a
  if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
    export CLOUDFLARE_API_TOKEN
    export TUNNEL_TOKEN="${CLOUDFLARE_API_TOKEN}"
    echo "✅ Using Cloudflare API token from .env"
  fi
fi

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

echo "Setting up Cloudflare tunnel for ${FULL_HOSTNAME}..."
echo ""

# Step 1: Check if already logged in
if ! "$CLOUDFLARED" tunnel list >/dev/null 2>&1; then
  echo "Step 1: Logging in to Cloudflare..."
  "$CLOUDFLARED" tunnel login
  echo ""
fi

# Step 2: Check if tunnel already exists
TUNNEL_LIST_OUTPUT=$("$CLOUDFLARED" tunnel list 2>/dev/null || echo "")
if echo "$TUNNEL_LIST_OUTPUT" | grep -q "${TUNNEL_NAME}"; then
  echo "Step 2: Tunnel '${TUNNEL_NAME}' already exists."
  # Extract tunnel ID (first column of the matching line)
  TUNNEL_ID=$(echo "$TUNNEL_LIST_OUTPUT" | grep "${TUNNEL_NAME}" | awk '{print $1}' | head -1)
  echo "  Tunnel ID: ${TUNNEL_ID}"
else
  echo "Step 2: Creating tunnel '${TUNNEL_NAME}'..."
  "$CLOUDFLARED" tunnel create "${TUNNEL_NAME}"
  # Wait a moment for tunnel to be created
  sleep 1
  TUNNEL_LIST_OUTPUT=$("$CLOUDFLARED" tunnel list 2>/dev/null || echo "")
  TUNNEL_ID=$(echo "$TUNNEL_LIST_OUTPUT" | grep "${TUNNEL_NAME}" | awk '{print $1}' | head -1)
  if [ -z "${TUNNEL_ID}" ]; then
    echo "  ERROR: Could not retrieve tunnel ID after creation"
    exit 1
  fi
  echo "  Tunnel created with ID: ${TUNNEL_ID}"
fi
echo ""

# Step 3: Route DNS to tunnel
echo "Step 3: Routing DNS hostname ${FULL_HOSTNAME} to tunnel..."
"$CLOUDFLARED" tunnel route dns "${TUNNEL_NAME}" "${FULL_HOSTNAME}" || echo "  (DNS route may already exist)"
echo ""

# Step 4: Create/update config file
CONFIG_DIR="$HOME/.cloudflared"
CONFIG_FILE="${CONFIG_DIR}/config.yml"
mkdir -p "${CONFIG_DIR}"

# Get credentials file path
CREDENTIALS_FILE="${CONFIG_DIR}/${TUNNEL_ID}.json"

echo "Step 4: Creating/updating config file at ${CONFIG_FILE}..."
cat > "${CONFIG_FILE}" <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: ${CREDENTIALS_FILE}

ingress:
  - hostname: ${FULL_HOSTNAME}
    service: http://localhost:8787
  - service: http_status:404
EOF

echo "  Config file created successfully."
echo ""

# Step 5: Update .env file
ENV_FILE="$(dirname "$0")/../.env"
if [ -f "${ENV_FILE}" ]; then
  echo "Step 5: Updating .env file with PUBLIC_BASE_URL..."
  if grep -q "^PUBLIC_BASE_URL=" "${ENV_FILE}"; then
    sed -i "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=https://${FULL_HOSTNAME}|" "${ENV_FILE}"
  else
    echo "PUBLIC_BASE_URL=https://${FULL_HOSTNAME}" >> "${ENV_FILE}"
  fi
  echo "  PUBLIC_BASE_URL set to https://${FULL_HOSTNAME}"
else
  echo "Step 5: .env file not found. Create it and set:"
  echo "  PUBLIC_BASE_URL=https://${FULL_HOSTNAME}"
fi
echo ""

echo "✅ Tunnel setup complete!"
echo ""
echo "To start the tunnel, run:"
echo "  ./scripts/start-tunnel.sh ${TUNNEL_NAME}"
echo ""
echo "Or to start both tunnel and server:"
echo "  ./scripts/start-app.sh"
echo ""

