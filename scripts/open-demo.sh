#!/bin/bash

# Script to open RoomBrief in browser with both Viewer and Mic interfaces
# Opens two browser tabs: one for Viewer, one for Mic

URL="http://localhost:8787"

# Check if server is running
if ! curl -s "$URL" > /dev/null 2>&1; then
    echo "❌ Server is not running on $URL"
    echo "   Please start the server first: npm start"
    exit 1
fi

echo "✅ Server is running"
echo "🌐 Opening RoomBrief in browser..."

# Detect browser
if command -v google-chrome > /dev/null 2>&1; then
    BROWSER="google-chrome"
elif command -v chromium-browser > /dev/null 2>&1; then
    BROWSER="chromium-browser"
elif command -v firefox > /dev/null 2>&1; then
    BROWSER="firefox"
elif command -v xdg-open > /dev/null 2>&1; then
    BROWSER="xdg-open"
else
    echo "❌ No browser found. Please open $URL manually"
    exit 1
fi

# Open Viewer tab
echo "📺 Opening Viewer tab..."
if [[ "$BROWSER" == "google-chrome" ]] || [[ "$BROWSER" == "chromium-browser" ]]; then
    $BROWSER --new-tab "$URL" > /dev/null 2>&1 &
elif [[ "$BROWSER" == "firefox" ]]; then
    $BROWSER -new-tab "$URL" > /dev/null 2>&1 &
else
    $BROWSER "$URL" > /dev/null 2>&1 &
fi

# Wait a moment
sleep 1

# Open Mic tab
echo "🎤 Opening Mic tab..."
if [[ "$BROWSER" == "google-chrome" ]] || [[ "$BROWSER" == "chromium-browser" ]]; then
    $BROWSER --new-tab "$URL" > /dev/null 2>&1 &
elif [[ "$BROWSER" == "firefox" ]]; then
    $BROWSER -new-tab "$URL" > /dev/null 2>&1 &
else
    $BROWSER "$URL" > /dev/null 2>&1 &
fi

echo ""
echo "✅ Opened 2 browser tabs"
echo ""
echo "📋 Instructions:"
echo "   1. In the FIRST tab:"
echo "      - Enter name: 'Viewer'"
echo "      - Select 'Viewer' role"
echo "      - Click 'Create Room'"
echo "      - Copy the room code (e.g., 031D8A)"
echo ""
echo "   2. In the SECOND tab:"
echo "      - Enter name: 'Mic User'"
echo "      - Select 'Mic' role"
echo "      - Paste the room code"
echo "      - Click 'Join Room'"
echo "      - Check consent checkbox"
echo "      - Click 'Start Mic'"
echo ""
echo "🎉 Then speak into your microphone and watch transcriptions appear!"

























