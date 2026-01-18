# Server Function Names & Structure

## Room Management

- **Rooms Map**: `const rooms = new Map();` (line 457)
- **Get room**: `rooms.get(roomCode)` - direct Map access (no function wrapper)
- **Create room**: `const room = new Room(code, passcode); rooms.set(code, room);` (lines 1716-1717)
- **No `getOrCreateRoom()` function** - rooms are retrieved with `rooms.get()` and checked for null

## Broadcast Method

- **Method**: `room.broadcast(message, excludeClientId = null)` (line 662)
- **Class**: Room class method
- **Usage**: `room.broadcast({ type: 'device_list', ... })` where `room` is a Room instance

## WebSocket Message Routing

- **Structure**: `switch (message.type)` block starting at line 1704
- **Location**: Inside `ws.on('message', async (data) => { ... })` handler (line 1680)
- **Parse**: `message = JSON.parse(data.toString());` (line 1683)

## Current Message Types Handled

From switch statement (starting line 1704):
- `'create_room'` (line 1705)
- `'join'` (line 1761)
- `'audio'` (line ~1944)
- Other cases...

## Insertion Point for `mic_heartbeat`

Add new case in the `switch (message.type)` block after the existing cases, before the default/end.

## Notes

- No `getOrCreateRoom()` wrapper - use `rooms.get(roomCode)` and check for null
- Broadcast is `room.broadcast()`, not `broadcastToRoom(roomId, message)`
- Room code is stored in `message.roomCode` or `message.roomId` (check which is used in join)
- For heartbeat, we'll need to find the room using `rooms.get(message.roomCode || message.roomId)`
