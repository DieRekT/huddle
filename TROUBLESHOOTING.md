# Troubleshooting: Microphone Not Working

## Quick Checks

1. **Open Browser Console** (F12 or Right-click → Inspect → Console)
   - Look for error messages
   - Check if you see "Audio chunk received" messages when speaking

2. **Check Mic Stats**
   - On the Mic screen, look for "Chunks sent" counter
   - If it stays at 0, audio isn't being captured
   - If it increases but no transcript appears, server isn't processing

3. **Check Server Logs**
   - Look at the terminal where server is running
   - You should see: `[ROOM_CODE] Audio chunk received from NAME: XXX bytes`
   - Then: `[ROOM_CODE] Transcribing audio...`
   - Then: `[ROOM_CODE] Transcription result: "your text"`

## Common Issues

### Issue 1: No Mic Permission
**Symptoms:**
- Browser asks for permission, you denied it
- Error: "Microphone permission denied"

**Fix:**
- Click the lock icon in browser address bar
- Set microphone to "Allow"
- Refresh page

### Issue 2: HTTPS Required (Mobile)
**Symptoms:**
- On phone, mic button doesn't work
- No permission prompt appears

**Fix:**
- Use Cloudflare tunnel for HTTPS:
  ```bash
  cloudflared tunnel --url http://localhost:8787
  ```
- Use the HTTPS URL provided on your phone

### Issue 3: No Audio Detected
**Symptoms:**
- Chunks are being sent (counter increases)
- But transcription is empty or "No speech detected"

**Possible Causes:**
- Microphone is muted (check system settings)
- Microphone volume too low
- Speaking too quietly
- Wrong microphone selected (check browser settings)

**Fix:**
- Check system microphone settings
- Speak louder and closer to mic
- Try a different microphone
- Check browser audio input settings

### Issue 4: WebSocket Disconnected
**Symptoms:**
- "Connection lost" error
- Chunks sent but nothing happens

**Fix:**
- Refresh the page
- Check internet connection
- Check server is still running

### Issue 5: Empty Audio Chunks
**Symptoms:**
- Chunks sent but size is 0 bytes
- Server logs show "Empty audio chunk received"

**Fix:**
- Stop mic and start again
- Check microphone is working in other apps
- Try different browser (Chrome/Firefox recommended)

## Debug Steps

1. **Check Browser Console:**
   - Open DevTools (F12)
   - Go to Console tab
   - Look for:
     - "MediaRecorder started"
     - "Audio chunk received: XXX bytes"
     - "Sending audio chunk to server"
     - Any error messages

2. **Check Mic Stats:**
   - On Mic screen, verify:
     - "Chunks sent" increases when speaking
     - "Last sent" shows recent timestamp
     - "Mic LIVE" indicator is visible

3. **Check Server Logs:**
   - Terminal should show:
     ```
     [ROOM_CODE] Audio chunk received from NAME: 12345 bytes
     [ROOM_CODE] Processing audio chunk: 12345 bytes
     [ROOM_CODE] Transcribing audio...
     [ROOM_CODE] Transcription result: "your words here"
     ```

4. **Test Microphone:**
   - Open browser settings
   - Test microphone in another app (like Google Meet)
   - Verify it's working there first

## Still Not Working?

1. **Try Different Browser:**
   - Chrome (recommended)
   - Firefox
   - Edge

2. **Check System Audio:**
   - Test mic in system settings
   - Check mic isn't muted
   - Check volume levels

3. **Check Server:**
   - Verify server is running: `ps aux | grep "node server.js"`
   - Check for errors in server terminal
   - Verify OpenAI API key is set correctly

4. **Check Network:**
   - Verify WebSocket connection (should see ping/pong in console)
   - Check firewall isn't blocking WebSocket

## Getting Help

If still not working, check:
- Browser console errors (F12)
- Server terminal logs
- Mic stats on screen
- Share these details for help




























