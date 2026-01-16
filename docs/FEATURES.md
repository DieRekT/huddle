# Huddle - Feature Documentation

Comprehensive guide to all features in Huddle v1.0.0.

## Core Features

### Real-Time Transcription
- Multi-mic support: Multiple devices can stream audio simultaneously
- Automatic speaker identification: Each mic is tagged with the user's name
- Timestamp-based merging: Transcripts are merged chronologically
- Cross-mic deduplication: Overlapping speech from multiple mics is automatically deduplicated
- Audio quality detection: Warnings for low-quality audio (too quiet, too short)

### AI-Powered Summarization

#### Rolling Summary
- Updates every 10 seconds (configurable)
- Analyzes last 2 minutes of conversation
- Extracts: topic, subtopic, status, key points, decisions, next steps
- Topic stability: Requires confidence >= 0.60 and 2 consecutive updates before changing

#### Full Room Overview
- Comprehensive summary of entire conversation
- **Chunked Summarization**: Automatically handles long meetings by splitting into segments
- **Hierarchical Processing**: For very long meetings, summarizes chunks first, then synthesizes
- **Extended Output**: Includes overview, key points, decisions, and next steps
- **Copy Functionality**: One-click copy of complete summary
- **Segment Indicator**: Shows when summary was generated from multiple segments

#### Catch-Up Summary
- Quick summary of last 45 seconds (or since timestamp)
- 1-2 sentence overview + key points
- Accessible via "Catch-up" button

#### Title Analysis
- Generates concise discussion title (2-8 words)
- Based on recent transcripts
- Accessible via "Analyze Title" button

### Room Management

#### Room Creation
- Generate unique 6-character room codes
- Optional passcode protection (4-6 digits)
- Admin token for room management
- Automatic cleanup after TTL (default: 2 hours)

#### Room Joining
- Join by room code
- Passcode validation for protected rooms
- Support for multiple roles (viewer, mic, or both)
- Device identity tracking (stable across sessions)

#### Room Security
- Optional passcode protection
- Server-side validation
- Error messages for incorrect passcodes
- Admin controls for room creators

### User Interface

#### Viewer Dashboard
- **What's happening now**: Current topic, summary, key points, decisions, next steps
- **Live Transcript**: Real-time transcript stream with auto-scroll
- **Mic Health**: Status indicators for each connected mic (LIVE/QUIET/OFFLINE)
- **Topic Log**: History of topic changes with timestamps
- **Zen Mode**: Hide transcript for distraction-free viewing

#### Mic Interface
- Large start/stop button
- "Mic LIVE" indicator with pulse animation
- Mic statistics (chunks sent, last sent time)
- Consent checkbox before starting
- HTTPS warning for mobile devices

#### Invite System
- QR code generation for easy sharing
- Shareable links for remote participants
- Automatic role detection (viewer vs mic)
- Passcode included in share links

### Accessibility Features

#### Font Size Toggle
- Three sizes: Normal, Large, Extra Large
- Persists across sessions (localStorage)
- Accessible via menu (⋯ button)

#### High Contrast Mode
- WCAG AAA compliant color scheme
- Enhanced visibility for low vision users
- Toggle in accessibility menu
- Persists across sessions

#### Keyboard Navigation
- Full keyboard support for all features
- Tab navigation throughout
- Enter/Space for button activation
- Escape to close modals

#### Screen Reader Support
- Comprehensive ARIA labels
- Live regions for dynamic content
- Semantic HTML structure
- Focus management for modals and panels

### Privacy & Consent

#### Consent System
- Required consent checkbox before mic start
- "Everyone here knows captions are running" consent
- Persistent "Live captions active" banner on viewer screen
- Start button disabled until consent given

#### Data Management
- Session export (Markdown and JSON formats)
- Save & Clear: Copy summary then reset room
- End & Delete: Permanently delete room and all data
- Automatic room cleanup after TTL

### Export Features

#### Session Export
- Complete session data in Markdown format
- JSON export for programmatic access
- Includes: topic, summary, decisions, next steps, full transcript
- Timestamps and speaker information

#### Copy Functionality
- Copy room code
- Copy mic invite link
- Copy Full Room Overview summary
- Copy formatted session report

## Technical Features

### WebSocket Communication
- Real-time bidirectional communication
- Automatic reconnection with exponential backoff
- Connection status indicators
- Error handling and recovery

### Audio Processing
- FFmpeg-based audio conversion (16kHz mono WAV)
- Audio quality validation (RMS, duration)
- Chunk size limits and rate limiting
- Support for multiple audio formats (WebM, MP4, OGG)

### AI Integration
- OpenAI Whisper for transcription
- GPT-4o-mini for summarization
- Standardized prompt system
- Prompt injection protection
- Token estimation and chunking

### Multi-Location Architecture
- Distributed mic nodes
- Central room server
- Unified transcript stream
- Health monitoring for remote mics

## Configuration

### Environment Variables
- `OPENAI_API_KEY`: Required for AI features
- `PORT`: Server port (default: 8787)
- `SUMMARY_INTERVAL_SEC`: Summary update frequency (default: 10)
- `SUMMARY_LOOKBACK_SEC`: Transcript window for summaries (default: 120)
- `ROOM_TTL_MS`: Room expiration time (default: 7200000 = 2 hours)
- `MAX_CHUNK_SIZE_BYTES`: Maximum audio chunk size (default: 220000)
- `TOPIC_SHIFT_CONFIDENCE_THRESHOLD`: Topic change confidence (default: 0.60)

### Deployment Options
- Local development (HTTP)
- Cloudflare Tunnel (HTTPS for mobile)
- Reverse proxy (Nginx, etc.)
- Docker (documentation available)

## Browser Support

- **Chrome/Edge**: Full support (desktop and mobile)
- **Firefox**: Full support (desktop)
- **Safari**: Full support (iOS and macOS)
- **Mobile**: Best results with Chrome on Android, Safari on iOS

## Performance

- Handles multiple simultaneous mics
- Efficient transcript deduplication
- Chunked summarization for long meetings
- Optimized WebSocket message handling
- Client-side transcript caching

## Security

- Optional room passcodes
- Admin token system
- Server-side validation
- No persistent user data (rooms auto-expire)
- HTTPS recommended for production

## Future Features (Roadmap)

See `docs/ROADMAP.md` for planned features including:
- Mobile apps (React Native / Flutter)
- Multi-language support
- Analytics dashboard
- Advanced export formats
- User accounts and room history

