# RoomBrief - Quick Start Guide

## 5-Minute Setup

1. **Install dependencies**:
   ```bash
   ./scripts/setup.sh
   ```

2. **Configure API key**:
   ```bash
   cp .env.example .env
   nano .env  # Add your OPENAI_API_KEY
   ```

3. **Start server**:
   ```bash
   ./scripts/run.sh
   ```

4. **Open in browser**:
   - Desktop: `http://localhost:8787`
   - Mobile: Use Cloudflare tunnel (see below)

## For Mobile Testing (HTTPS Required)

Microphone permissions require HTTPS. Use Cloudflare tunnel:

```bash
# Install cloudflared
sudo apt-get install cloudflared

# Run tunnel
cloudflared tunnel --url http://localhost:8787
```

Copy the HTTPS URL provided and use it on mobile devices.

## First Test

1. **Viewer** (laptop/tablet):
   - Open app
   - Name: "Adrick"
   - Role: Viewer
   - Create Room
   - Share code

2. **Mic** (phone):
   - Open app (use HTTPS URL)
   - Name: "Allan"
   - Role: Mic
   - Enter room code
   - Join → Start Mic

3. **Test**:
   - Speak into phone mic
   - Viewer should see transcript + summary
   - Try "What I missed?" button

## Troubleshooting

- **No transcriptions?** Check OpenAI API key and quota
- **Mic not working?** Must use HTTPS on mobile
- **Room not found?** Codes expire after 2 hours idle

See `README.md` for full documentation.




























