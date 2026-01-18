# Code Structure Summary for Multi-Mic Improvements

## Current State Analysis

Based on room export **7A37F5** analysis, these improvements are needed:
1. **Multi-mic de-duplication** (cross-mic duplicates)
2. **Device registry + heartbeat** (stable device truth)
3. **Topic timeline** (segment-based topics vs single topic)
4. **Summary confidence** (grounded in transcript coverage)

---

## 1. Multi-Mic De-Duplication

### Current Implementation
**File**: `server.js`  
**Location**: `Room.addTranscript()` method (lines 556-649)

**Existing Logic**:
- ✅ **Same-speaker de-dup** (lines 581-592): Removes identical adjacent transcripts from same speaker within `TRANSCRIPT_MERGE_WINDOW_MS` (5000ms)
- ✅ **Repeat suppression** (lines 594-609): Suppresses if same speaker repeats same line 2+ times within 30s
- ⚠️ **Cross-mic de-dup** (lines 619-636): Uses `similarTranscript()` but only checks **adjacent** entries

**Problem**: Cross-mic duplicate checking only looks at immediate neighbors (`prev2`, `next2`), not all entries within time window.

**Current `similarTranscript()` function** (lines 188-197):
- Simple includes() check on normalized text
- Only works for very short texts (<12 chars)
- No similarity scoring (Jaro-Winkler, cosine, etc.)

### Files to Modify
- `server.js`:
  - `addTranscript()` method (lines 556-649)
  - `similarTranscript()` function (lines 188-197) - needs enhancement
  - Add new similarity scoring functions

### Constants Used
- `TRANSCRIPT_MERGE_WINDOW_MS` = 5000ms (env: `TRANSCRIPT_MERGE_WINDOW_MS`)
- `MAX_TRANSCRIPTS` = 1000 (env: `MAX_TRANSCRIPTS`)

---

## 2. Device Registry + Heartbeat

### Current Implementation
**File**: `server.js`  
**Location**: `Room` class

**Existing State**:
- ✅ **Device tracking**: `this.activeMics` Map (line 500)
  - Structure: `micId -> { clientId, name, status, lastActivity, connectedAt, lastTranscript }`
  - Status: `'connected'`, `'quiet'`, `'disconnected'`
- ✅ **Client tracking**: `this.clients` Map (line 483)
  - Structure: `clientId -> { role, name, ws, micId, joinedAt, lastSeen }`
- ⚠️ **No heartbeat endpoint**: Device state only updated on audio packets or disconnect

### Mic Health Broadcast
**Location**: `Room.broadcastMicHealth()` method
- Called on: client add/remove, periodic timer
- Broadcasts: `{ type: 'mic_health', mics: [...] }`

### Files to Modify
- `server.js`:
  - WebSocket message handler (lines 1674-2100+) - add heartbeat message type
  - `Room.addClient()` / `removeClient()` methods (lines 504-554)
  - `Room.activeMics` structure - add `streaming`, `heartbeatTs` fields
- `public/app.js`:
  - Mic WebSocket connection logic (lines 1402-1600+)
  - Add heartbeat interval timer (every 2-3s)
  - Add visibility API handlers (background/foreground)

### Constants Needed
- `DEVICE_HEARTBEAT_INTERVAL_MS` = 2500ms (new)
- `DEVICE_OFFLINE_THRESHOLD_MS` = 10000ms (new)

---

## 3. Topic Timeline (Segment-Based Topics)

### Current Implementation
**File**: `server.js`

**Current Topic System**:
- **Single topic**: `room.summary.topic` (line 461)
- **Topic history**: `room.topicHistory[]` (line 495) - tracks changes only
- **Topic detection**: `recordTopicChange()` (line 730) - only records, doesn't compute segments

**Topic Change Detection** (line 730):
- Records topic transitions in `topicHistory`
- Uses `TOPIC_SHIFT_CONFIDENCE` (0.60) and `TOPIC_SHIFT_DURATION` (8s)

**Summary Generation** (lines 1400-1500+):
- `generateRollingSummary()` - every `SUMMARY_INTERVAL_SEC` (10s)
- Looks back `SUMMARY_LOOKBACK_SEC` (120s)
- Single rolling summary, not segmented

### Files to Modify
- `server.js`:
  - `Room` class - add `topicTimeline[]` array (line ~496)
  - Summary generation logic (lines 1400+) - compute segment topics
  - Topic detection - switch to segment-based computation
- `public/app.js`:
  - Viewer UI - display "Current topic" + "Earlier: ..." (topic timeline)

### Constants Used
- `SUMMARY_INTERVAL_SEC` = 10s (env: `SUMMARY_INTERVAL_SEC`)
- `SUMMARY_LOOKBACK_SEC` = 120s (env: `SUMMARY_LOOKBACK_SEC`)
- `TOPIC_SHIFT_CONFIDENCE` = 0.60 (env: `TOPIC_SHIFT_CONFIDENCE_THRESHOLD`)
- `TOPIC_SHIFT_DURATION` = 8s (env: `TOPIC_SHIFT_DURATION_SEC`)

### New Constants Needed
- `TOPIC_SEGMENT_INTERVAL_SEC` = 300s (5 min) or based on transcript line count
- `TOPIC_SEGMENT_MIN_LINES` = 20 (minimum transcript lines per segment)

---

## 4. Summary Confidence (Transcript Coverage)

### Current Implementation
**File**: `server.js`

**Summary Structure** (lines 459-474):
```javascript
{
  topic: '',
  subtopic: '',
  status: '',
  confidence: 0.9,  // ❌ Currently hardcoded/static
  rolling_summary: '',
  // ...
}
```

**Confidence Generation**:
- ❌ **Not found** - confidence appears to be hardcoded or computed elsewhere
- Need to search for where `confidence` is set in summary generation

### Files to Modify
- `server.js`:
  - `generateRollingSummary()` - compute confidence from:
    - % of time windows with transcript
    - Average segment confidence
    - Duplicate suppression rate
  - Summary response messages - include computed confidence

### Constants Needed
- `CONFIDENCE_WINDOW_SEC` = 10s (time window for coverage check)
- `MIN_COVERAGE_FOR_HIGH_CONFIDENCE` = 0.70 (70% of windows have transcripts)

---

## Key Files Overview

### `server.js` (Main Backend)
- **Lines 477-502**: `Room` class constructor (state initialization)
- **Lines 504-554**: Client/device management (`addClient`, `removeClient`)
- **Lines 556-649**: `addTranscript()` - **PRIMARY DE-DUP LOCATION**
- **Lines 188-197**: `similarTranscript()` - **NEEDS ENHANCEMENT**
- **Lines 1674-2100+**: WebSocket message handler - **ADD HEARTBEAT HERE**
- **Lines 459-474**: `defaultRoomSummary()` - summary structure
- **Lines 730+**: `recordTopicChange()` - topic tracking
- **Lines 1400+**: Summary generation functions

### `public/app.js` (Frontend)
- **Lines 1-50**: WebSocket connection variables
- **Lines 397-449**: `connectWebSocket()` - viewer WebSocket
- **Lines 1402-1600+**: Mic WebSocket connection logic - **ADD HEARTBEAT HERE**
- **Lines 3700+**: MediaRecorder setup (`startMic()` function)

### WebSocket Message Types (server.js)
Current types handled:
- `join` (line ~1783)
- `audio` (line ~1944)
- `audio_ack` (line ~1954)
- `mic_health` (broadcast by `broadcastMicHealth()`)
- `transcript` (sent on transcript add)
- `summary` (sent on summary update)

**Need to add**:
- `heartbeat` message type (mic → server)

---

## Search Patterns for Quick Location

```bash
# De-dup logic
rg -n "similarTranscript|TRANSCRIPT_MERGE_WINDOW|addTranscript" server.js

# Device tracking
rg -n "activeMics|addClient|removeClient|broadcastMicHealth" server.js

# Topic/summary
rg -n "topic|summary|confidence|generateRollingSummary" server.js

# WebSocket handlers
rg -n "ws\.on\(|case 'join'|case 'audio'|type:" server.js | head -50

# Mic client code
rg -n "MediaRecorder|getUserMedia|micWs|startMic" public/app.js
```

---

## Next Steps

1. **Enhance `similarTranscript()`** to use Jaro-Winkler or cosine similarity
2. **Expand cross-mic de-dup** to check all entries within time window (±1200ms), not just neighbors
3. **Add heartbeat endpoint** in WebSocket handler + client-side timer
4. **Implement topic timeline** - segment-based topic computation
5. **Compute confidence** from transcript coverage metrics

