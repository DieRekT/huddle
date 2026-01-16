# Huddle App - Comprehensive Summary

## Overview
**Huddle** (formerly RoomBrief) is a real-time conversation assistant designed specifically for **deaf and hard-of-hearing (HoH) individuals** to "read the room" during group conversations. The app provides live captions, AI-powered summaries, and contextual awareness to help deaf users stay engaged when people are spread around a room or not facing them directly.

## Core Purpose
Deaf/HoH people often miss conversation context because:
- People aren't facing them (can't lip-read)
- Multiple speakers spread across a room
- Fast-paced conversations with overlapping dialogue
- Missing visual/contextual cues

Huddle bridges this gap by providing **immediate, actionable information** about what's happening RIGHT NOW.

## Architecture

### Roles
- **Viewer** (deaf/HoH person): Receives live captions, summaries, and context updates
- **Mic** (supporters/friends): Streams audio from their devices to help capture conversation

### Technology Stack
- **Backend**: Node.js + Express + WebSocket
- **Frontend**: Vanilla JavaScript (mobile-friendly, no framework dependencies)
- **AI**: OpenAI API (Whisper for transcription, GPT-4o-mini for summarization)
- **Audio**: Browser MediaRecorder API (WebRTC for real-time mode)
- **Transport**: WebSocket for real-time bidirectional communication

## Key Features

### 1. Live Captions (Real-Time Transcription)
- Multiple microphone sources from different devices ("Room Mesh")
- Real-time transcription using OpenAI Whisper API
- Speaker tagging by device/mic name
- Low-latency updates (appears within seconds)
- Supports both chunked audio and Realtime API modes

### 2. Topic Detection
- Automatically identifies current conversation topic (2-5 word phrases)
- Shows subtopic (specific aspect being discussed)
- Displays with confidence percentage (even low confidence shown - deaf users need context NOW)
- Debounced to prevent rapid topic changes
- Examples: "Planning weekend BBQ", "Arguing about budget", "Making dinner plans"

### 3. Rolling Summaries
- Continuously updated every 10 seconds
- 1-2 sentence summary of what's happening RIGHT NOW
- Focuses on WHO is doing WHAT and WHY
- Answers: "What conversation am I missing right now?"
- Maximum 180-200 characters for quick scanning

### 4. Key Points Extraction
- Highlights 3-5 most important bullet points from conversation
- Includes: important facts, questions asked/answered, action items, specific details (names, dates, times, locations)
- Prioritizes actionable information
- Updates dynamically as conversation progresses

### 5. Decisions Tracking
- Extracts concrete commitments made (max 3 most recent)
- Specific details: "Saturday at 4pm", "Sarah will drive", "Everyone pays $20"
- Helps deaf users catch decisions they might have missed

### 6. Next Steps / Actions
- Immediate action items (max 3 most urgent)
- Includes WHO/WHAT/WHEN: "John to text location by tonight"
- Helps track what needs to happen next

### 7. "What I Missed" / Catch-Up Button
- Instant recap button for missed segments
- Summarizes last 45 seconds or since specific timestamp
- Provides 1-2 sentence summary + 3-5 key bullet points
- Helps catch up quickly when attention was diverted

### 8. Multi-Mic Support ("Room Mesh")
- Multiple phones/devices can join as "Mic" role
- Each device streams audio independently
- Better accuracy when speakers are spread across a room
- Visual mic health indicators showing LIVE/QUIET/OFFLINE status for each mic
- Tip shown: "Best results in real rooms come from 2+ mic phones spread out"

### 9. Status Awareness
- Real-time status indicators showing conversation state
- Visual feedback for mic activity
- Connection status for WebSocket
- Transcript timestamps showing when last speech was detected

### 10. Export Functionality
- Export full conversation transcript + summaries
- Markdown and JSON formats
- Includes topic, summary, decisions, next steps, full transcript

## User Experience

### Viewer Screen (Deaf/HoH Person)
The interface is optimized for **immediate context awareness**:

1. **Top Bar**: Room code + LIVE status + action buttons (Invite, Catch-up, Zen mode, Menu)
2. **Hero Topic Card** (Prominent, sticky): 
   - Large display of current topic
   - Subtopic or rolling summary below
   - Status badge (Deciding/Confirming/Done) + confidence %
3. **Mic Health Strip**: Visual chips showing each connected mic's status (LIVE/QUIET/OFFLINE)
4. **"What's happening now" Card**: Rolling summary (1-2 sentences, updates every 10s)
5. **Key Points Card**: Bullet list of most important points (max 3-5 items)
6. **Actions Card**: Next steps with WHO/WHAT/WHEN (max 3 items)
7. **What's Being Said Card**: Compact transcript (last 2-4 entries, collapsible)
   - Speaker tags by mic name
   - Auto-scrolls to latest
   - Can expand to see more history
8. **Catch-up Panel**: Appears when "Catch-up" button clicked, shows missed summary + key points

### Mic Screen (Supporters)
Simple interface for people providing audio:

1. **Large Mic Icon**: Visual feedback with pulse rings when recording
2. **Status Card**: Shows "Mic LIVE" status and mic name
3. **Consent Checkbox**: "Everyone here knows captions are running" (required)
4. **Action Buttons**: Start Mic / Stop Mic
5. **Mic Level Meter**: Visual feedback showing audio input level
6. **Transcript Display**: Optional view of what's being transcribed

## Workflow

### Typical Session Flow

1. **Viewer creates room**:
   - Opens app, enters name, selects "Viewer"
   - Clicks "Create Room"
   - Receives 6-character room code
   - Shares room code (or QR code via Invite button)

2. **Supporters join as Mic**:
   - Open app on phone/tablet/laptop
   - Enter name, select "Mic"
   - Enter room code (or scan QR code)
   - Check consent: "Everyone here knows captions are running"
   - Click "Start Mic"
   - Device streams audio chunks (2-second segments)

3. **Conversation happens**:
   - Multiple people talk, spread around room
   - Each mic device captures audio from its location
   - Audio sent to server, transcribed via Whisper
   - Transcripts tagged with mic name (speaker identification)

4. **AI processing**:
   - Every 10 seconds: Analyze last 120 seconds of transcript
   - Extract: Topic, Subtopic, Status, Summary, Key Points, Decisions, Next Steps
   - Update Viewer screen immediately (even with low confidence - context needed NOW)

5. **Viewer stays engaged**:
   - Sees current topic at top (large, prominent)
   - Reads rolling summary (what's happening now)
   - Scans key points (most important info)
   - Checks actions (what needs to happen next)
   - Watches live transcript (exact words being said)
   - Can click "Catch-up" if they missed something

## Technical Details

### Audio Processing
- Audio captured in 2-second chunks via MediaRecorder API
- Converted to 16kHz mono WAV for optimal Whisper transcription
- Voice Activity Detection (VAD) filters out silence
- RMS (Root Mean Square) threshold prevents sending near-silence
- Supports WebM (Chrome/Firefox) and MP4 (Safari) formats
- Optional Realtime API mode for lower latency

### Real-Time Communication
- WebSocket connection for bidirectional communication
- Auto-reconnect with exponential backoff
- State synchronization (room state, mic roster, transcripts)
- Rate limiting to prevent abuse

### AI Integration
- **Transcription**: OpenAI Whisper API (whisper-1 model)
- **Summarization**: GPT-4o-mini (cost-effective, fast, accurate enough)
- Temperature: 0.2 (low = more factual, consistent)
- Response format: JSON with schema validation
- Timeout protection: 30 seconds default
- Retry logic for failed API calls

### Room Management
- 6-character alphanumeric room codes
- Auto-expiry after 2 hours of inactivity
- Bounded transcript storage (last 1000 entries)
- Mic roster tracking (who's connected, last seen timestamp)
- No persistent storage (privacy-focused)

### Privacy & Consent
- Consent checkbox required before mic start
- Room codes expire automatically
- No persistent storage by default
- Transcripts only stored in-memory during session
- HTTPS required for production (microphone permissions)

## Configuration Options

Environment variables (`.env`):
- `PORT`: Server port (default: 8787)
- `OPENAI_API_KEY`: Required for transcription/summarization
- `SUMMARY_INTERVAL_SEC`: How often summaries update (default: 10)
- `SUMMARY_LOOKBACK_SEC`: How far back to look (default: 120)
- `REALTIME_ENABLED`: Enable Realtime API mode (default: false)
- `TRANSCRIBE_MODEL`: Whisper model (default: whisper-1)
- `TOPIC_SHIFT_CONFIDENCE`: Minimum confidence for topic changes (default: 0.60)
- `ROOM_TTL_MS`: Room expiry time (default: 2 hours)

## Deployment

### Local Development
```bash
npm install
npm start  # Runs on http://localhost:8787
```

### Production with HTTPS
HTTPS required for microphone permissions on mobile devices:
- Use Cloudflare Tunnel (included scripts)
- Or deploy to hosting with HTTPS (Vercel, Railway, etc.)
- Set `PUBLIC_BASE_URL` in `.env` for proper WebSocket URLs

## Design Philosophy

1. **Deaf-First**: Optimized for users who cannot rely on lip-reading or visual cues
2. **Context NOW**: Show information immediately, even with low confidence (better than waiting)
3. **Actionable**: Focus on what's happening RIGHT NOW, not abstract themes
4. **Simple**: Clean UI, no distractions, key information prominent
5. **Mobile-Friendly**: Works on phones, tablets, laptops (responsive design)
6. **Privacy-Aware**: No persistent storage, explicit consent, auto-expiry

## Use Cases

- Group conversations at social events
- Work meetings with multiple participants
- Family gatherings
- Educational settings (lectures, discussions)
- Any situation where deaf/HoH person needs to stay engaged in conversation

## Future Enhancements (Not Yet Implemented)

- User authentication / room locking
- Session history / recordings
- Enhanced accessibility features (font size, high contrast)
- More granular speaker diarization
- Integration with hearing aid devices
- Mobile app (currently web-based)







