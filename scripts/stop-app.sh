#!/bin/bash
# Stop the Huddle/RoomBrief application
# Kills both the server and tunnel processes

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "${PROJECT_DIR}"

TUNNEL_NAME="${1:-huddle}"
PORT="${PORT:-8787}"

echo "Stopping Huddle/RoomBrief application..."
echo ""

# Find and kill server processes (node server.js)
SERVER_PIDS=$(pgrep -f "node.*server.js" || true)
if [ -n "$SERVER_PIDS" ]; then
    echo "Stopping server processes..."
    echo "$SERVER_PIDS" | while read pid; do
        echo "  Killing server process (PID: $pid)"
        kill "$pid" 2>/dev/null || true
    done
    sleep 1
    
    # Force kill if still running
    SERVER_PIDS=$(pgrep -f "node.*server.js" || true)
    if [ -n "$SERVER_PIDS" ]; then
        echo "$SERVER_PIDS" | while read pid; do
            echo "  Force killing server process (PID: $pid)"
            kill -9 "$pid" 2>/dev/null || true
        done
    fi
    echo "✅ Server stopped"
else
    echo "ℹ️  No server process found"
fi

echo ""

# Find and kill tunnel processes (cloudflared tunnel)
TUNNEL_PIDS=$(pgrep -f "cloudflared.*tunnel.*run" || true)
if [ -n "$TUNNEL_PIDS" ]; then
    echo "Stopping tunnel processes..."
    echo "$TUNNEL_PIDS" | while read pid; do
        echo "  Killing tunnel process (PID: $pid)"
        kill "$pid" 2>/dev/null || true
    done
    sleep 1
    
    # Force kill if still running
    TUNNEL_PIDS=$(pgrep -f "cloudflared.*tunnel.*run" || true)
    if [ -n "$TUNNEL_PIDS" ]; then
        echo "$TUNNEL_PIDS" | while read pid; do
            echo "  Force killing tunnel process (PID: $pid)"
            kill -9 "$pid" 2>/dev/null || true
        done
    fi
    echo "✅ Tunnel stopped"
else
    echo "ℹ️  No tunnel process found"
fi

echo ""
echo "✅ Application stopped"
echo ""


