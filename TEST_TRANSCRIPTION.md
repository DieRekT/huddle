# Transcription Test Suite

Comprehensive test suite for verifying transcription functionality and quality.

## Quick Start

```bash
# Run transcription tests
npm run test:transcription
```

## What It Tests

### ✅ Configuration Tests
- Verifies transcription model is set correctly
- Checks temperature, retry attempts, and context settings
- Validates API key is configured

### ✅ WAV File Generation
- Tests generation of valid WAV audio files
- Verifies WAV header structure
- Checks file size and format

### ✅ Audio Conversion
- Tests FFmpeg conversion to 16kHz mono WAV
- Verifies audio preprocessing (if FFmpeg available)
- Falls back gracefully if FFmpeg not installed

### ✅ Context Building
- Tests context trimming (last N words)
- Verifies context is passed correctly to API
- Checks context length limits

### ✅ Real Transcription
- **Requires**: OpenAI API key in `.env`
- Sends actual audio to transcription API
- Measures transcription latency
- Verifies response format

### ✅ Transcription with Context
- Tests context-aware transcription
- Verifies context improves accuracy
- Tests proper noun recognition

### ✅ Error Handling
- Tests empty buffer rejection
- Tests invalid file format handling
- Verifies retry logic on errors
- Tests exponential backoff

### ✅ Full Integration Flow
- End-to-end test: generate → convert → transcribe
- Tests complete pipeline
- Verifies all components work together

## Test Results

When run successfully, you should see:

```
ℹ tests 9
ℹ pass 9
ℹ fail 0
```

## Requirements

1. **OpenAI API Key**: Set `OPENAI_API_KEY` in `.env` file
   - Without API key, some tests will be skipped
   - Real transcription tests require valid API key

2. **FFmpeg** (optional but recommended):
   ```bash
   sudo apt-get install ffmpeg
   ```
   - Tests will work without FFmpeg but audio conversion tests will be skipped

## Configuration

Tests use environment variables from `.env`:

```bash
OPENAI_API_KEY=your_key_here
OPENAI_TRANSCRIBE_MODEL=whisper-1  # or gpt-4o-mini-transcribe
TRANSCRIBE_TEMPERATURE=0.0
TRANSCRIBE_RETRY_ATTEMPTS=3
TRANSCRIBE_CONTEXT_WORDS=50
```

## Expected Output

```
🎯 Transcription Tests Complete!

=== Configuration Check ===
Model: whisper-1
Temperature: 0
Retry attempts: 3
Context words: 50
API Key: Set ✓
✅ Configuration is valid

=== Testing WAV Generation ===
✅ Generated WAV file: 16044 bytes

=== Testing Audio Conversion ===
✅ Audio conversion works: 16044 → 16078 bytes

=== Testing Context Building ===
✅ Context building works (trimmed 101 → 50 words)

=== Testing Real Transcription ===
✅ Transcription completed in 2452ms
   Result: "Hello"
   Length: 5 characters

=== Testing Transcription with Context ===
✅ Transcription with context completed

=== Testing Error Handling ===
✅ Empty buffer correctly rejected
✅ Invalid extension correctly handled

=== Testing Full Transcription Flow ===
✅ Full flow test passed!

✅ Test cleanup completed
```

## Troubleshooting

### "API key not set"
- Add `OPENAI_API_KEY` to your `.env` file
- Some tests will be skipped without API key

### "FFmpeg not found"
- Install FFmpeg: `sudo apt-get install ffmpeg`
- Audio conversion tests will be skipped but other tests will run

### "Rate limited" errors
- OpenAI API has rate limits
- Wait a few minutes and retry
- Tests will skip gracefully on rate limit errors

### "Invalid API key"
- Check your `.env` file
- Verify API key is correct
- Ensure you have API credits/quota

## Continuous Integration

This test suite is designed to run in CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run transcription tests
  run: npm run test:transcription
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## Performance Benchmarks

Typical test execution times:
- Configuration: < 1ms
- WAV generation: < 5ms
- Audio conversion: 100-200ms (with FFmpeg)
- Real transcription: 1-3 seconds (API call)
- Full suite: 5-10 seconds

## Notes

- Tests use minimal audio files (sine waves) for speed
- Real-world accuracy may vary with actual speech
- Tests verify functionality, not accuracy (use manual testing for accuracy)
- API costs: ~$0.001 per test run (minimal)

## Related Tests

- `npm test` - Unit tests for clamping and topic stability
- `node test-integration.js` - WebSocket and HTTP integration tests

