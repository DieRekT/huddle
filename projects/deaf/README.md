# Huddle

**Read the room.** Real-time transcription and AI-powered summaries for deaf and hard-of-hearing users.

Huddle provides a unified, multi-location system where distributed microphones feed into a single room brain, delivering one calm, merged understanding to the viewer.

## Architecture

### Core Model

- **Room (Server)**: Single source of truth - brain + state management
- **Mic Node**: Any device, anywhere - captures audio → sends to room
- **Viewer**: Deaf user - receives merged transcript + room intelligence
- **Invites**: QR/link that takes people to the correct role instantly

### Multi-Location Support

Multiple people in different locations can speak naturally, while the deaf user experiences a single, clear, trustworthy understanding of the conversation.

- Each speaker joins as a Mic Node (phone, iPad, laptop, remote location)
- All Mic Nodes connect to the same Room
- Server merges transcripts by timestamp, deduplicates overlapping speech
- Viewer receives ONE unified transcript stream + room summaries

## Quick Start

### Prerequisites

- Node.js 18+
- OpenAI API key ([get one here](https://platform.openai.com/api-keys))
- FFmpeg (optional but recommended)

### Installation

1. Clone the repository
2. Copy `env.example` to `.env`:
   ```bash
   cp env.example .env
   ```
3. Edit `.env` and add your OpenAI API key:
   ```
   OPENAI_API_KEY=sk-your-key-here
   PUBLIC_BASE_URL=
   REALTIME_ENABLED=true
   ```
4. Install dependencies:
   ```bash
   npm install
   ```
5. Start the server:
   ```bash
   npm run dev
   # or
   npm start
   ```

The server runs on `http://localhost:8787`

## Usage

### 1. Create Room (Viewer)

1. Open the app in your browser
2. Enter your name
3. Select **Viewer**
4. Click **Create Room**
5. Note the room code (e.g., `A1B2C3`)
6. Click **Invite** to get QR code or share link

### 2. Join as Mic

**Option A: QR Code**
1. Viewer clicks **Invite** button
2. Scan QR code with phone/iPad
3. Device automatically opens mic page
4. Enter name (auto-suggests device type: Phone/iPad/Laptop)
5. Click **Join Room**
6. Click **Start Mic** to begin streaming

**Option B: Link**
1. Viewer copies mic link from invite modal
2. Share link with remote speakers
3. Open link on any device
4. Follow same join flow

### 3. Viewer Experience

The viewer sees:
- **Current Situation**: Topic, status, confidence
- **What's happening now**: Summary card with "Analyze Title" button to generate discussion titles
- **Key Points**: Max 3 bullets
- **Next Steps**: Max 3 actions
- **Live Transcript**: Secondary, dark card, auto-scrolls
- **Mic Health Chips**: LIVE/QUIET/OFFLINE status per mic

### 4. Catch-up

Click **Catch-up** button for a strong summary of the last 2 minutes.

### 5. Read the Room

Click **Read the Room** button for a comprehensive overview of the entire conversation. This generates a full summary from all transcripts, providing key points and a complete overview of everything discussed.

### 6. Analyze Discussion Title

Click the **Analyze Title** button in the "What's happening now" card to generate a concise title (2-8 words) that captures the main topic of the conversation based on recent transcripts.

### 7. Intro Showcase Screen

First-time users see a 15-second intro showcase screen that explains Huddle's features. The intro:
- Shows 5 slides highlighting key features
- Offers optional audio narration (user-initiated)
- Can be skipped anytime
- Can be set to "Don't show again" for future visits

To generate the intro audio narration:
```bash
node tools/make_intro_tts.js
```

This uses OpenAI TTS to generate `public/assets/intro.mp3`. The intro works without audio if the file is missing.

## How It Works

### Routes

- **`/host`**: Host mode - Creates room, auto-joins as mic, shows invite QR
- **`/viewer?room=XXXXXX`**: Viewer mode (default QR) - Read-only monitoring, optional mic enable
- **`/mic?room=XXXXXX`**: Mic-only mode (optional) - Direct mic access without viewer UI

### Flow

1. **Host** opens `/host` → Room created → Auto-joins as mic
2. **Host** clicks Invite → QR code encodes `/viewer?room=XXXXXX`
3. **Viewer** scans QR → Opens `/viewer?room=XXXXXX` → No mic permission prompt
4. **Viewer** (optional) clicks "Enable microphone" → Permission prompt → Becomes mic while staying viewer
5. Multiple devices can join as viewers or mics (or both simultaneously)

### Device Identity

Each device gets a stable `deviceId` stored in localStorage. This is used for:
- Viewer WebSocket: `deviceId` parameter
- Mic WebSocket: `micId=mic-{deviceId}` for consistent mic identity
- A single device can be both viewer and mic at the same time

## Deployment

### Local Development

```bash
npm run dev
```

### Production (Cloudflare Tunnel)

For production use with mobile devices, you need HTTPS:

1. **Install cloudflared** (if not already installed):
   ```bash
./scripts/install-cloudflared.sh
   ```

2. **Set up permanent tunnel** (recommended):
   ```bash
   ./scripts/setup-tunnel-idview.sh huddle huddle idview.org
```

   This will:
   - Create tunnel named "huddle"
   - Set up DNS for `huddle.idview.org`
   - Update `.env` with `PUBLIC_BASE_URL=https://huddle.idview.org`

3. **Start app with tunnel**:
   ```bash
   ./scripts/start-app.sh
   ```

4. **Or use temporary tunnel** (for testing):
```bash
   ./scripts/tunnel-quick.sh
```

### Environment Variables

Edit `.env` to customize:

- `OPENAI_API_KEY`: Your OpenAI API key (required)
- `PUBLIC_BASE_URL`: Public base URL for QR codes/links (e.g., `https://huddle.idview.org`)
- `REALTIME_ENABLED`: Enable OpenAI Realtime transcription (default: `true`)
- `PORT`: Server port (default: `8787`)
- `SUMMARY_INTERVAL_SEC`: Summary update interval (default: `10`)
- `SUMMARY_LOOKBACK_SEC`: Lookback window for summaries (default: `120`)
- `ROOM_TTL_MS`: Room idle timeout (default: `7200000` = 2 hours)
- `OPENAI_TRANSCRIBE_MODEL`: Transcription model (default: `whisper-1`)
- `TRANSCRIBE_TEMPERATURE`: Transcription temperature (default: `0.0`)
- `LOG_LEVEL`: Logging level - `debug`, `info`, `warn`, `error` (default: `info`)

## Smoke Test

Quick verification that everything works:

1. **Start server**:
```bash
   npm run dev
   ```

2. **Open viewer**:
   - Open `http://localhost:8787` (or your tunnel URL)
   - Enter name, select Viewer, click Create Room
   - Note the room code

3. **Invite mic**:
   - Click **Invite** button
   - QR code should show correct URL (localhost or tunnel)
   - Copy link or scan QR with another device

4. **Join as mic** (on phone/iPad/another browser):
   - Open the mic link
   - Enter name, click Join Room
   - Click **Start Mic**

5. **Test transcription**:
   - Speak: "How much wood would a woodchuck chuck if a woodchuck could chuck wood?"
   - Viewer should see:
     - ✅ Transcript appears in real-time
     - ✅ Topic updates (may take 10 seconds)
     - ✅ Mic health chip shows LIVE status
     - ✅ Key points/actions appear when conversation develops

6. **Test catch-up**:
   - Click **Catch-up** button
   - Summary should update with recent conversation

7. **Test multi-location**:
   - Join with 2+ mic devices from different locations
   - All should show in mic health strip
   - Transcripts should merge correctly
   - No duplicate text

## Architecture Details

### Room State Model

The server maintains a unified `Room` object with:
- `roomId`: 6-character hex code
- `mics`: Map of active mic nodes with health status
- `transcript`: Time-ordered array of transcript lines
- `insights`: Current situation, topic, confidence, key points, next steps
- `viewers`: Set of viewer WebSocket clients

### Event Payloads

Normalized event types:
- `mic_join`: Mic node joins room
- `mic_status`: Mic health update (LIVE/QUIET/MUTED/OFFLINE)
- `transcript_line`: New transcript entry with timestamp
- `insights_update`: Room insights updated
- `viewer_state`: Full room state for viewer (on connect)

### Transport

- **Mic ↔ Server**: WebSocket (audio chunks + status)
- **Viewer ↔ Server**: WebSocket (state updates + transcripts)
- **Server ↔ OpenAI**: Realtime API (ephemeral sessions per mic)

### Audio Pipeline

1. Mic captures audio (48kHz mono, clean constraints)
2. Server converts to 16kHz mono PCM16
3. RMS + VAD gating (skip silence)
4. Stream to OpenAI Realtime transcription (one session per mic)
5. Merge transcripts by timestamp
6. Deduplicate overlapping/repeated speech
7. Update insights every 5-10 seconds

### Design System

Shared design tokens in `public/theme.css`:
- Celtics theme: `--brand: #007A33`, `--accent: #BA9653`
- Shared components: `.card`, `.btn`, `.pill`, `.chip`, `.topbar`
- Dark mode support with green-tinted surfaces

## Multi-Location Architecture

### How It Works

1. **Viewer creates room** on laptop
2. **Multiple mic nodes join** from different locations (phones, iPads, laptops)
3. **Server receives all audio streams** and transcribes each independently
4. **Server merges transcripts** by timestamp, deduplicates
5. **Viewer receives unified stream** - no separate transcripts per mic
6. **Room summaries** reflect the entire conversation across all locations

### Mic Node

Each mic node:
- Captures mono audio (48kHz)
- Sends audio chunks to server via WebSocket
- Receives mic status updates only
- Shows: mic status, room code, viewer connected status, other mics count
- Does NOT show transcript

### Server Responsibilities

- Timestamp incoming audio chunks immediately
- Apply RMS + VAD gating per mic
- Send gated audio to OpenAI Realtime transcription (one session per mic)
- Receive partial + final transcript events
- Merge transcript lines across mics by timestamp
- Deduplicate overlapping or repeated speech
- Suppress low-confidence or noise-generated text
- Maintain room state (mics, transcripts, insights)
- Broadcast updates to viewers

### Viewer Experience

- Receives unified transcript stream (merged from all mics)
- Receives room summaries (topic, key points, next steps)
- Sees mic health indicators per speaker (LIVE/QUIET/OFFLINE)
- Does NOT see separate transcripts per mic
- Does NOT need to manually select mics
- Calm, minimal, professional interface

## Troubleshooting

### QR Code shows localhost instead of tunnel URL

- Check `.env` has `PUBLIC_BASE_URL=https://huddle.idview.org`
- Restart server after setting `PUBLIC_BASE_URL`
- Verify tunnel is running: `cloudflared tunnel list`

### Mic not connecting

- Check WebSocket connection (status bar shows connected)
- Verify room code is correct (6 characters, uppercase)
- Check browser console for errors
- Ensure microphone permissions granted

### Transcription not appearing

- Check OpenAI API key is set in `.env`
- Verify audio is being captured (check mic level meter)
- Check server logs for transcription errors
- Ensure `REALTIME_ENABLED=true` if using Realtime mode

### Multiple mics showing duplicate text

- Server should deduplicate automatically
- If duplicates persist, check server logs
- Verify all mics are in same room
- Check network latency (high latency can cause issues)

## License

MIT
