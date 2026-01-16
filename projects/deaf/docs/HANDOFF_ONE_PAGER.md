# RoomBrief - Developer Handoff (One Page)

## Project: RoomBrief

**Goal**: Help a deaf/HoH person "read the room" in group conversations by showing (1) live captions and (2) continuously updating topic headers + rolling summaries, plus a "What I missed" catch-up button. It must work when people are spread around a room.

## Users / Roles

- **Viewer (deaf/HoH)**: Reads the room; needs confidence + context.
- **Mic (supporter)**: Contributes audio. Multiple mic devices = "room mesh" (best accuracy).

## Core Experience

1. Viewer creates a room → gets a short code.
2. Others join as Mic and stream short audio chunks.
3. Viewer screen shows:
   - Topic header (Topic / Subtopic / Status + confidence)
   - Rolling summary (1–2 sentences, updates every ~10s)
   - Decisions / Actions / Questions lanes
   - Live Transcript feed, tagged by mic device name
   - "What I missed" → instant recap of the last ~45s or since last glance
   - "Topic shift" alert when the system detects a real change

## Why It's Different

Most caption apps stop at verbatim text. This product is a **comprehension layer** (topic + summary + decisions) optimized for social settings and anxiety caused by losing context.

## Non-Negotiables

- **Low-latency**: Transcript should appear within a few seconds.
- **Stability**: Topic should not flip constantly; only change when confident.
- **Multi-mic support**: Don't rely on diarization alone—use joined mic devices for speaker tagging.
- **Privacy/consent**: Explicit "mic on + recording/captioning" acknowledgement and session expiry.

## Technical Approach (MVP Implementation)

- Web app frontend (mobile-friendly) + backend server.
- Transport: WebSocket.
- Audio capture: getUserMedia + MediaRecorder chunking (2s).
- Server:
  - Room manager with bounded transcript buffer.
  - Per-room audio queue to process chunks sequentially.
  - Transcription: streaming-style chunk transcription.
  - Summarizer: every N seconds, summarize last 120s into a structured "Room State".
  - "What I missed": summarize last 45s (or since timestamp).
- Outputs must be validated via a schema (topic/subtopic/status/summary/lanes/confidence).

## Done Criteria (MVP)

- Viewer can create room, see code, and receive state updates.
- Multiple Mic devices can join and stream audio.
- Viewer sees transcript lines tagged by mic name.
- Rolling summary updates every ~10s and remains stable.
- "What I missed" returns a meaningful recap + bullet points.
- Decisions/Actions/Questions populate when spoken.

## Stack

- **Backend**: Node.js + Express + WebSocket (ws library)
- **AI**: OpenAI API (transcription + GPT-4o-mini for summaries)
- **Frontend**: Vanilla JavaScript (no framework)
- **Audio**: Browser MediaRecorder API

## Key Files

- `server.js`: Main backend server (WebSocket + room management)
- `public/index.html`: UI structure
- `public/app.js`: Frontend logic (WebSocket client + audio capture)
- `public/style.css`: Styling
- `.env`: Configuration (API keys, intervals, etc.)

## Next Steps for v1.0

See `docs/TICKETS.md` for detailed ticket breakdown including:
- Consent screens
- Auth/room locking
- Session export
- HTTPS deployment guide
- Accessibility improvements




























