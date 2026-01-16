#!/bin/bash
# Launcher script for Huddle desktop entry
# Starts server/tunnel if needed and opens Chrome with the app

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "${PROJECT_DIR}"

PORT="${PORT:-8787}"
TUNNEL_NAME="${1:-huddle}"

# Function to check if server is running
is_server_running() {
    curl -s "http://localhost:${PORT}" > /dev/null 2>&1
}

# Function to check if tunnel is running
is_tunnel_running() {
    pgrep -f "cloudflared tunnel run" > /dev/null 2>&1
}

# Function to start server in background
start_server_background() {
    if is_server_running; then
        echo "✅ Server already running on port ${PORT}"
        return 0
    fi

    # Check if server process is already running (node server.js)
    if pgrep -f "node server.js" > /dev/null 2>&1; then
        echo "✅ Server process found, waiting for it to be ready..."
        # Wait for server to be ready (max 10 seconds)
        for i in {1..10}; do
            if is_server_running; then
                echo "✅ Server is ready"
                return 0
            fi
            sleep 1
        done
    fi

    echo "🚀 Starting server..."
    cd "${PROJECT_DIR}"
    
    # Use nohup to ensure process survives after script exits
    nohup bash -c "cd '${PROJECT_DIR}' && PORT='${PORT}' npm start" > /tmp/huddle-server.log 2>&1 &
    SERVER_PID=$!
    
    # Wait for server to be ready (max 10 seconds)
    for i in {1..10}; do
        if is_server_running; then
            echo "✅ Server started (PID: ${SERVER_PID})"
            return 0
        fi
        sleep 1
    done
    
    echo "❌ Server failed to start. Check logs: /tmp/huddle-server.log"
    return 1
}

# Function to start tunnel in background
start_tunnel_background() {
    if is_tunnel_running; then
        echo "✅ Tunnel already running"
        return 0
    fi

    # Check if cloudflared is available
    CLOUDFLARED="./bin/cloudflared"
    if [ ! -x "$CLOUDFLARED" ]; then
        if command -v cloudflared >/dev/null 2>&1; then
            CLOUDFLARED="cloudflared"
        else
            echo "⚠️  cloudflared not found. Starting without tunnel."
            return 1
        fi
    fi

    # Check if tunnel config exists
    CONFIG_FILE="$HOME/.cloudflared/config.yml"
    if [ ! -f "${CONFIG_FILE}" ]; then
        echo "⚠️  Tunnel config not found. Starting without tunnel."
        return 1
    fi

    echo "🚀 Starting Cloudflare tunnel..."
    "${CLOUDFLARED}" tunnel run "${TUNNEL_NAME}" > /tmp/huddle-tunnel.log 2>&1 &
    TUNNEL_PID=$!
    
    # Wait for tunnel to initialize
    sleep 3
    
    if ! kill -0 ${TUNNEL_PID} 2>/dev/null; then
        echo "⚠️  Tunnel failed to start. Check logs: /tmp/huddle-tunnel.log"
        return 1
    fi
    
    echo "✅ Tunnel started (PID: ${TUNNEL_PID})"
    return 0
}

# Load PUBLIC_BASE_URL from .env if set
PUBLIC_URL=""
if [ -f .env ]; then
    PUBLIC_URL=$(grep -v '^#' .env | grep PUBLIC_BASE_URL | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs)
fi

# Start server
if ! start_server_background; then
    exit 1
fi

# Try to start tunnel (non-blocking if it fails)
start_tunnel_background || true

# Determine which URL to use
if [ -n "${PUBLIC_URL}" ]; then
    APP_URL="${PUBLIC_URL}"
    echo "🌐 Using tunnel URL: ${APP_URL}"
else
    APP_URL="http://localhost:${PORT}"
    echo "🌐 Using local URL: ${APP_URL}"
fi

# Wait a moment for everything to be ready
sleep 2

# Detect and open Chrome/Chromium
echo "🌐 Opening Huddle in Chrome..."

# Try to find an existing Chrome window, if so, open in new tab, otherwise new window
if command -v google-chrome-stable > /dev/null 2>&1; then
    # Use new window for better desktop app experience
    google-chrome-stable --new-window "${APP_URL}" > /dev/null 2>&1 &
elif command -v google-chrome > /dev/null 2>&1; then
    google-chrome --new-window "${APP_URL}" > /dev/null 2>&1 &
elif command -v chromium-browser > /dev/null 2>&1; then
    chromium-browser --new-window "${APP_URL}" > /dev/null 2>&1 &
elif command -v chromium > /dev/null 2>&1; then
    chromium --new-window "${APP_URL}" > /dev/null 2>&1 &
elif command -v firefox > /dev/null 2>&1; then
    firefox -new-window "${APP_URL}" > /dev/null 2>&1 &
elif command -v xdg-open > /dev/null 2>&1; then
    xdg-open "${APP_URL}" > /dev/null 2>&1 &
else
    echo "❌ No browser found. Please open ${APP_URL} manually"
    exit 1
fi

echo "✅ Huddle opened in browser!"
exit 0

