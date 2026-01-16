#!/bin/bash
# Deploy script - restarts the production server with latest code
# This ensures all fixes and improvements are live

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "${PROJECT_DIR}"

echo "🚀 Deploying Huddle application..."
echo ""

# Step 1: Stop existing processes
echo "Step 1: Stopping existing processes..."
./scripts/stop-app.sh || echo "  (No processes to stop)"
echo ""

# Step 2: Wait a moment for cleanup
sleep 2

# Step 3: Start application with tunnel
echo "Step 2: Starting application with Cloudflare tunnel..."
./scripts/start-app.sh


