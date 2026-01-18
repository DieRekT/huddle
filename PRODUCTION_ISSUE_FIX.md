# Production Issue: Viewer Not Connecting

## Issue
Production site at https://huddle.idview.org/viewer?room=6AB566 shows "Connecting..." but WebSocket connection never completes.

## Diagnosis Steps

### 1. Check Server Logs
On production server, check:
```bash
tail -f /tmp/huddle-server.log | grep -E "WS|connection|join"
```

### 2. Check Browser Console
Open browser DevTools (F12) and check Console tab for:
- `[Diagnostic] Creating WebSocket connection:` - Should show wss:// URL
- `[Diagnostic] WebSocket connected (viewer)` - Should appear if connection succeeds
- `[Diagnostic] WebSocket error:` - Will show if connection fails
- `[Diagnostic] WebSocket closed:` - Will show close code and reason

### 3. Verify Room Exists
```bash
curl -s https://huddle.idview.org/api/rooms | jq '.rooms[] | select(.code == "6AB566")'
```

### 4. Test WebSocket Connection
```bash
# Test WebSocket upgrade
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: test" https://huddle.idview.org/
```

## Possible Causes

### 1. WebSocket Server Not Running
**Symptom**: No connection logs on server
**Fix**: Restart server with `./scripts/deploy.sh`

### 2. Cloudflare Blocking WebSocket
**Symptom**: Connection closes immediately with code 1006
**Fix**: 
- Check Cloudflare tunnel is running
- Verify WebSocket upgrade headers are allowed
- Check Cloudflare dashboard for WebSocket settings

### 3. Room Doesn't Exist
**Symptom**: Server logs show "Room not found"
**Fix**: Create room first, then join as viewer

### 4. WebSocket URL Issue
**Symptom**: Client tries ws:// instead of wss:// on HTTPS
**Fix**: Already handled in code (auto-detects protocol)

## Fixes Applied

### Client-Side (public/app.js)
- ✅ Added diagnostic logging for WebSocket connection attempts
- ✅ Added detailed error/close event logging
- ✅ Log WebSocket URL, readyState, and connection events

### Server-Side (server.js)
- ✅ Added connection logging with client ID and IP
- ✅ Added join request logging
- ✅ Added room validation logging

## Next Steps

1. **Deploy fixes to production**:
   ```bash
   git pull origin main
   ./scripts/deploy.sh
   ```

2. **Monitor logs**:
   ```bash
   tail -f /tmp/huddle-server.log
   ```

3. **Check browser console** for diagnostic messages

4. **Verify room exists** before joining

## Testing

After deployment, test:
1. Create a new room
2. Join as viewer via `/viewer?room=XXXXXX`
3. Check browser console for diagnostic messages
4. Check server logs for connection attempts

