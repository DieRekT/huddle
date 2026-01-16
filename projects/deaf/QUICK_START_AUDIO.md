# Quick Start: Audio Quality Improvements

## ✅ What's Been Upgraded

1. **VAD-Lite**: Only sends chunks when speech detected
2. **Shorter chunks**: 1.5s (catches word starts better)
3. **Pre-roll**: Sends last silent chunk when speech starts (prevents chopping)
4. **Mic level meter**: Visual feedback on audio levels
5. **FFmpeg conversion**: Converts all audio to 16kHz WAV (better quality)

## 🚀 Quick Test

1. **Install FFmpeg** (if not already):
   ```bash
   sudo apt-get install -y ffmpeg
   ```

2. **Restart server**:
   ```bash
   ./scripts/run.sh
   ```

3. **Refresh browser** (hard refresh: Ctrl+Shift+R)

4. **Start mic** and watch:
   - Mic level meter should move when you speak
   - Status shows: `sent X • ack Y • level Z%`
   - Only chunks sent when speaking (check console)

## 📊 What to Check

### Mic Meter:
- **Should show 10%+** when speaking
- **Color**: Green (good), Yellow (low), Red (too quiet)
- **Warning**: "TOO QUIET? move closer" if level stays low

### Console Logs:
- `Sending audio chunk` (only when speaking)
- No logs during silence (VAD filtering)

### Server Logs:
- `Converting webm to WAV...` (if FFmpeg installed)
- `Transcribing audio...`
- `Transcription result: "your text"`

## ⚠️ If Mic Meter Doesn't Move

1. **Speak closer** to microphone
2. **Check mic isn't muted** (system settings)
3. **Try Chrome** instead of Firefox (better MediaRecorder)
4. **Check browser permissions** (allow microphone)

## 🎯 Expected Results

- ✅ **Fewer broken words** (shorter chunks + pre-roll)
- ✅ **No silence chunks** (VAD filtering)
- ✅ **Better transcription** (WAV conversion)
- ✅ **Lower cost** (fewer API calls)
- ✅ **Visual feedback** (mic meter)

## 📝 Configuration

If you need to tune VAD sensitivity, edit `public/app.js`:

```js
const VAD_THRESHOLD = 0.018; // Lower = more sensitive
const VAD_HANG_MS = 600; // How long to keep "speaking" after speech stops
const TIMESLICE_MS = 1500; // Chunk duration
```

## 🔍 Diagnostics

After testing, share:
1. **Mic meter level** when speaking (what %?)
2. **Does "ack" increase** when speaking? (yes/no)
3. **Browser** (Firefox/Chrome?)
4. **Any server errors** in terminal?




























