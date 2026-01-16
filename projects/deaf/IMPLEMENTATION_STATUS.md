# Implementation Status - Route Refactoring

## Backup Location
Files backed up to: `.backup/`
- server.js
- public/app.js
- public/index.html

## Completed Changes

### 1. Server-Side (server.js)
- ✅ Added POST /api/rooms endpoint (line ~1619)
- ✅ Updated QR generation to default to /viewer route (line ~1750)
- ✅ Added route handlers for /host, /viewer, /mic (lines ~29-40)

### 2. Client-Side (public/app.js)
- ✅ Added deviceId support (localStorage-based, line ~444)
- ✅ Added route detection function (detectRouteAndInit, line ~408)
- ✅ Added route initialization function (initializeRoute, line ~462)
- ✅ Updated buildViewerLink to use /viewer route (line ~499)
- ✅ Updated buildMicJoinLink to use /mic route (line ~492)
- ✅ Updated openInviteModal to use /viewer as default QR (line ~1945)
- ✅ Added connectAndJoinAsViewer function (line ~813)
- ✅ Updated connectAndJoin to include deviceId (line ~801)
- ✅ Updated create_room messages to include deviceId

## Remaining Work

### High Priority
1. **Viewer→Mic Opt-in** - Add UI button in viewer to enable mic (requires HTML changes)
2. **Dual WebSocket Support** - Support simultaneous viewer + mic connections
3. **Server deviceId handling** - Update server to use deviceId for micId

### Medium Priority
4. **README Update** - Document new routes and flow
5. **Testing** - Verify /host, /viewer, /mic routes work correctly

## Notes

- The /host route creates room via POST /api/rooms, then auto-joins as mic
- The /viewer route joins as viewer (no mic permission on load)
- The /mic route joins as mic (existing behavior)
- QR codes now default to /viewer route
- deviceId is stored in localStorage and sent with WebSocket messages

## Testing

To test:
1. Navigate to /host - should create room and show mic screen
2. Navigate to /viewer?room=XXXXXX - should join as viewer
3. Navigate to /mic?room=XXXXXX - should join as mic
4. Check QR code generation - should point to /viewer route
