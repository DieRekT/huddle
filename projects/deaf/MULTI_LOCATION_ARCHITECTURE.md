# Multi-Location Architecture Implementation

This document describes the multi-location architecture upgrade for Huddle, enabling multiple speakers to join and talk from different physical locations while maintaining a single unified room understanding for the viewer.

## Implementation Summary

### ✅ Core Architecture Changes

1. **Mic State Tracking**
   - Added `activeMics` Map to Room class to track active mic nodes
   - Each mic has: `micId`, `clientId`, `name`, `status`, `lastActivity`, `connectedAt`
   - Mic status: `connected`, `quiet`, `disconnected`

2. **Mic Health Tracking**
   - `getMicRoster()` method returns array of mic states with health status
   - `updateMicActivity()` method updates mic activity timestamps
   - `broadcastMicHealth()` method broadcasts mic health updates to viewers
   - Quiet threshold: 30 seconds without activity = "quiet" status

3. **Room State Enhancements**
   - Room state broadcasts now include `micRoster` array
   - Viewers receive real-time mic health updates
   - Mic activity is tracked when transcripts are added

4. **Client-Server Communication**
   - Mic clients can specify `micId` when joining (defaults to `clientId`)
   - Server tracks mic activity and broadcasts health status
   - Transcript processing updates mic activity timestamps

### ✅ Server-Side Changes

**File: `server.js`**

1. **Room Class Enhancements:**
   - Added `activeMics` Map for tracking mic nodes
   - Added `micHealthTimer` for periodic health updates (future use)
   - Enhanced `addClient()` to track mic nodes
   - Enhanced `removeClient()` to update mic status on disconnect
   - Added `getMicRoster()` method
   - Added `updateMicActivity()` method
   - Added `broadcastMicHealth()` method

2. **API Endpoints:**
   - `POST /api/realtime/session` - Create OpenAI Realtime API session (placeholder)
   - `POST /api/realtime/transcript` - Receive transcript events from Realtime API

3. **Transcript Processing:**
   - Audio chunk processing now updates mic activity
   - Mic activity tracked per transcript addition

4. **State Broadcasts:**
   - Room state messages now include `micRoster` array
   - Viewers receive mic health updates in real-time

### ✅ Client-Side Status

The client-side code already has:
- `updateMicHealthStrip()` function to display mic health indicators
- `lastMicRoster` tracking for mic roster state
- Mic health list UI element in viewer screen
- Support for displaying mic status (LIVE / QUIET / DISCONNECTED)

### 📋 Architecture Model

```
┌─────────────────────────────────────────────────────────┐
│                    MULTI-LOCATION MODEL                  │
└─────────────────────────────────────────────────────────┘

┌──────────┐    ┌──────────┐    ┌──────────┐
│ Mic Node │    │ Mic Node │    │ Mic Node │
│ (Phone)  │    │ (iPad)   │    │ (Laptop) │
└────┬─────┘    └────┬─────┘    └────┬─────┘
     │               │               │
     └───────────────┼───────────────┘
                     │
              ┌──────▼──────┐
              │   Server    │
              │  (Room Hub) │
              │             │
              │ • Track mics│
              │ • Merge     │
              │ • Dedupe    │
              │ • Summarize │
              └──────┬──────┘
                     │
              ┌──────▼──────┐
              │   Viewer    │
              │ (Deaf User) │
              │             │
              │ • Unified   │
              │ • Calm      │
              │ • Trusted   │
              └─────────────┘
```

### 🎯 Key Features

1. **Distributed Mic Nodes**
   - Multiple speakers can join from different locations
   - Each mic node has unique `micId`
   - Mic health tracked per node

2. **Server as Single Source of Truth**
   - All audio streams received by server
   - Server timestamps and processes all chunks
   - Server merges transcripts by timestamp
   - Server deduplicates overlapping speech

3. **Unified Viewer Experience**
   - Viewer sees one merged transcript stream
   - Viewer sees mic health indicators
   - Viewer sees unified summaries and topics
   - No manual mic selection required

4. **Mic Health Tracking**
   - Connection status: `connected`, `quiet`, `disconnected`
   - Last activity timestamp tracked
   - Automatic quiet detection (30s threshold)
   - Automatic disconnect cleanup (5s delay)

### 🔮 Future Enhancements

1. **OpenAI Realtime API Integration**
   - Currently using chunked Whisper API (works well)
   - Realtime API would provide lower latency
   - Requires OpenAI API documentation review
   - Endpoints prepared but need implementation

2. **Speaker Diarization**
   - Optional enhancement to identify speakers
   - Useful when multiple people speak near one mic
   - Can be added when OpenAI adds support

3. **Enhanced QR/Link Flow**
   - Current QR code/link flow works
   - Could add auto-join, device detection
   - Could add location/name suggestions

### 📝 Testing

To test the multi-location architecture:

1. **Create a room as Viewer**
2. **Join as Mic from multiple devices:**
   - Phone (location 1)
   - iPad (location 2)
   - Laptop (location 3)
3. **Verify:**
   - Viewer sees all mics in health strip
   - Mic status updates correctly (LIVE / QUIET)
   - Transcripts merge correctly from all mics
   - No duplicate transcripts
   - Mic health updates in real-time

### 🚀 Usage

The multi-location architecture is now active by default:

- **Viewers**: See mic health indicators automatically
- **Mic Clients**: Automatically tracked and health monitored
- **Server**: Merges transcripts from all mics seamlessly

No configuration changes needed - the architecture is built-in and active.











