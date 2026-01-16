# Testing Room Creation - Quick Debug Guide

## ✅ Server Status

The server is now running with all enhancements:

1. ✅ **Realtime transcription** module loaded (`realtime_mic.js`)
2. ✅ **Awareness Stack UI** layout (single-column, premium design)
3. ✅ **Zen mode toggle** for hiding transcript
4. ✅ **Mic health indicator** strip
5. ✅ **WebSocket connection** fixed in `connectAndCreate()`

## 🔧 Fix Applied

Fixed WebSocket connection issue where `connectAndCreate()` was overwriting the `onopen` handler. The function now:
- Checks if WebSocket is already connected and sends message immediately
- Creates new connection if needed and sets up proper handlers
- Handles connection states (OPEN, CONNECTING, CLOSED) correctly

## 🧪 How to Test Room Creation

1. **Open the app in Chrome**:
   ```bash
   # Use the desktop launcher or:
   google-chrome-stable http://localhost:8787
   ```

2. **Hard refresh to clear cache** (important!):
   - Press `Ctrl+Shift+R` (Linux/Windows) or `Cmd+Shift+R` (Mac)
   - Or open Developer Tools (F12) → Right-click refresh button → "Empty Cache and Hard Reload"

3. **Check browser console for errors**:
   - Press F12 to open Developer Tools
   - Go to Console tab
   - Look for any red error messages

4. **Test room creation**:
   - Enter your name (e.g., "Viewer")
   - Select "Viewer" role (should be selected by default)
   - Click "Create Room"
   - You should see:
     - WebSocket connected message in console
     - Room code appear in top bar
     - Viewer screen with Awareness Stack layout

## 🐛 Troubleshooting

### If room creation still doesn't work:

1. **Check WebSocket connection**:
   ```javascript
   // In browser console (F12):
   // Should show WebSocket is connecting
   console.log(ws?.readyState); // Should be 0 (CONNECTING) or 1 (OPEN)
   ```

2. **Check server logs**:
   ```bash
   tail -f /tmp/huddle-server.log
   ```

3. **Test WebSocket manually**:
   ```bash
   # In browser console:
   const ws = new WebSocket('ws://localhost:8787');
   ws.onopen = () => console.log('✅ WebSocket connected');
   ws.onmessage = (e) => console.log('Message:', JSON.parse(e.data));
   ws.onerror = (e) => console.error('❌ WebSocket error:', e);
   ```

4. **Verify server is serving files correctly**:
   ```bash
   curl -I http://localhost:8787/app.js
   # Should return HTTP 200
   ```

5. **Clear browser cache completely**:
   - Chrome: Settings → Privacy → Clear browsing data → Cached images and files
   - Or use Incognito mode: `Ctrl+Shift+N`

## 📋 Expected Behavior

When you click "Create Room":
1. Browser console should show: `"WebSocket connected"`
2. Browser sends: `{"type":"create_room","name":"YourName"}`
3. Server responds with: `{"type":"room_created","roomCode":"ABC123",...}`
4. Browser receives: `{"type":"joined","roomCode":"ABC123",...}`
5. Viewer screen appears with room code in top bar
6. Awareness Stack layout shows: Current Situation, Key Points, Actions, What's Being Said

## 🚨 Common Issues

- **"Connection error. Please refresh the page."**: WebSocket failed to connect. Check firewall/port 8787.
- **No room code appears**: Check browser console for WebSocket errors.
- **Old UI appears**: Hard refresh (Ctrl+Shift+R) to clear cache.
- **404 on app.js**: Server might not be running. Check `/tmp/huddle-server.log`.

## 📝 Server Logs Location

- Server log: `/tmp/huddle-server.log`
- Tunnel log: `/tmp/huddle-tunnel.log` (if using Cloudflare tunnel)

Monitor logs in real-time:
```bash
tail -f /tmp/huddle-server.log
```












