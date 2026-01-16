#!/bin/bash

# Check if .env exists
if [ ! -f .env ]; then
    echo "ERROR: .env file not found. Run ./scripts/setup.sh first."
    exit 1
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "ERROR: Dependencies not installed. Run ./scripts/setup.sh first."
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Check if OPENAI_API_KEY is set
if [ -z "$OPENAI_API_KEY" ] || [ "$OPENAI_API_KEY" = "your_openai_api_key_here" ]; then
    echo "ERROR: OPENAI_API_KEY is not set in .env file."
    echo "Please edit .env and add your OpenAI API key."
    exit 1
fi

# Check if permanent tunnel is set up and PUBLIC_BASE_URL is configured
CONFIG_FILE="$HOME/.cloudflared/config.yml"
if [ -f "${CONFIG_FILE}" ] && [ -n "${PUBLIC_BASE_URL:-}" ]; then
    echo "✅ Permanent Cloudflare tunnel is configured: ${PUBLIC_BASE_URL}"
    echo "   Starting with permanent tunnel..."
    echo ""
    # Use start-app.sh which handles tunnel + server
    exec "$(dirname "$0")/start-app.sh"
    exit $?
fi

# Check if tunnel config exists but PUBLIC_BASE_URL is not set
if [ -f "${CONFIG_FILE}" ]; then
    echo "⚠️  Tunnel config found but PUBLIC_BASE_URL not set in .env"
    echo "   Setting up permanent tunnel URL..."
    echo ""
    echo "   Run: ./scripts/setup-tunnel-idview.sh"
    echo "   Or set PUBLIC_BASE_URL in .env manually"
    echo ""
    echo "   Starting server only (without tunnel)..."
    echo ""
fi

echo "Starting RoomBrief server..."
echo "Server will be available at: http://localhost:${PORT:-8787}"
if [ -n "${PUBLIC_BASE_URL:-}" ]; then
    echo "Public URL: ${PUBLIC_BASE_URL}"
fi
echo ""
echo "For permanent HTTPS tunnel, run: ./scripts/start-app.sh"
echo "Press Ctrl+C to stop the server."
echo ""

node server.js






















