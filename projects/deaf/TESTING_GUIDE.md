# Testing Multi-Location Architecture

## Quick Test Setup

### 1. Start the Server

```bash
cd /home/lucifer/projects/deaf
npm start
```

Or if using a tunnel:
```bash
./scripts/run-with-tunnel-quick.sh
```

The server will start on `http://localhost:8787` (or your tunnel URL).

### 2. Create Room as Viewer

1. Open browser to `http://localhost:8787` (or your tunnel URL)
2. Enter your name (e.g., "Viewer")
3. Select "Viewer" role
4. Click "Create Room"
5. Note the room code (e.g., "A1B2C3")

### 3. Join as Mic from Multiple Devices

#### Device 1 (Phone/iPad/Laptop):
1. Open browser to the same URL (or scan QR code from viewer)
2. Enter device name (or let it auto-detect: "Phone", "iPad", "Laptop")
3. Select "Mic" role
4. Enter the room code
5. Click "Join Room"

#### Device 2 (Another device):
1. Repeat steps for Device 1
2. Use a different device type if possible

### 4. Check Mic Page Status

On each mic device, check the status card:
- Should show: "Viewer connected • X other mics"
- Examples:
  - "Viewer connected • 1 other mic" (when 2 mics total)
  - "Viewer connected • 2 other mics" (when 3 mics total)
  - "No viewer • Only mic" (if viewer left)

### 5. Expected Behavior

**On Mic Page:**
- Room code displayed in top bar
- Status card shows:
  - "You are: [Name]"
  - Room status: "Viewer connected • X other mics"
- Mic status: "Ready to start" (before starting)
- Mic status: "Mic LIVE" (when recording)

**On Viewer Page:**
- Mic health strip shows all connected mics
- Each mic shows status: LIVE / QUIET / OFFLINE
- Unified transcript from all mics
- Room summaries and topics

## Testing Checklist

- [ ] Viewer can create room
- [ ] Mic can join room with room code
- [ ] Mic page shows "Viewer connected" status
- [ ] Mic page shows count of other mics
- [ ] Device name auto-detection works (Phone, iPad, Laptop)
- [ ] Multiple mics can join same room
- [ ] Viewer sees all mics in health strip
- [ ] Transcripts merge correctly from all mics
- [ ] No duplicate transcripts
- [ ] Room status updates in real-time

## Troubleshooting

**Mic page shows "Connecting to room...":**
- Check WebSocket connection (look at status bar)
- Refresh the page
- Verify room code is correct

**Mic page shows "No viewer":**
- Viewer may have left
- Wait a few seconds for state update
- Check viewer is still connected

**Mic count seems wrong:**
- Mic count excludes yourself
- Check browser console for errors
- Verify all mics are actually connected

**Device name not auto-detected:**
- Check browser user agent
- Try manually entering name
- Device detection is a suggestion, not required

## Notes

- Room status updates are sent via WebSocket
- Mic roster is included in room state messages
- Viewer count is estimated from summary existence (heuristic)
- Mic count is accurate (from micRoster array)











