# Install FFmpeg (Required for Audio Conversion)

FFmpeg is required for converting audio chunks to WAV format for better transcription quality.

## Install on Ubuntu

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

## Verify Installation

```bash
ffmpeg -version | head -3
```

You should see FFmpeg version information.

## What It Does

FFmpeg converts audio chunks (webm/ogg) to 16kHz mono WAV before transcription:
- **Consistent format**: Firefox/ogg and Chrome/webm both become WAV
- **Better quality**: 16kHz mono is optimal for speech recognition
- **More reliable**: Reduces transcription errors from codec differences

## If FFmpeg Not Installed

The server will fall back to direct transcription, but quality may be lower, especially with Firefox/ogg files.




























