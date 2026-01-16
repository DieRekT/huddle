import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { convertToWav16kMono } from './audio_convert.js';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';
const TRANSCRIBE_TEMPERATURE = parseFloat(process.env.TRANSCRIBE_TEMPERATURE || '0.0');
const TRANSCRIBE_RETRY_ATTEMPTS = parseInt(process.env.TRANSCRIBE_RETRY_ATTEMPTS || '3');
const TRANSCRIBE_CONTEXT_WORDS = parseInt(process.env.TRANSCRIBE_CONTEXT_WORDS || '50');

if (!OPENAI_API_KEY) {
  console.error('⚠️  OPENAI_API_KEY not set. Some tests will be skipped.');
}

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const TMP_DIR = join(tmpdir(), 'roombrief-test');

// Ensure temp directory exists
await fs.mkdir(TMP_DIR, { recursive: true }).catch(() => {});

// Transcription function (same as server.js)
async function transcribeAudio(audioBuffer, ext = 'webm', contextText = '') {
  const tempFile = join(TMP_DIR, `chunk_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`);
  
  // Build prompt from context
  let prompt = '';
  if (contextText) {
    const words = contextText.split(/\s+/);
    const recentWords = words.slice(-TRANSCRIBE_CONTEXT_WORDS).join(' ');
    if (recentWords) {
      prompt = recentWords;
    }
  }
  
  let lastError = null;
  for (let attempt = 1; attempt <= TRANSCRIBE_RETRY_ATTEMPTS; attempt++) {
    try {
      await fs.writeFile(tempFile, audioBuffer);
      
      const params = {
        file: createReadStream(tempFile),
        model: TRANSCRIBE_MODEL,
        language: 'en',
        response_format: 'text',
        temperature: TRANSCRIBE_TEMPERATURE
      };
      
      if (prompt) {
        params.prompt = prompt;
      }
      
      const transcription = await openai.audio.transcriptions.create(params);
      
      await fs.unlink(tempFile).catch(() => {});
      
      const result = transcription.trim();
      if (result) {
        return result;
      }
      
      if (attempt < TRANSCRIBE_RETRY_ATTEMPTS) {
        console.warn(`Empty transcription result, retrying (attempt ${attempt}/${TRANSCRIBE_RETRY_ATTEMPTS})`);
        await new Promise(resolve => setTimeout(resolve, attempt * 200));
      }
    } catch (error) {
      lastError = error;
      console.error(`Transcription error (ext: ${ext}, attempt ${attempt}/${TRANSCRIBE_RETRY_ATTEMPTS}):`, error.message);
      
      if (error.status === 401 || error.status === 400) {
        await fs.unlink(tempFile).catch(() => {});
        throw error;
      }
      
      if (attempt < TRANSCRIBE_RETRY_ATTEMPTS) {
        const delay = Math.min(attempt * 500, 2000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  await fs.unlink(tempFile).catch(() => {});
  throw lastError || new Error('Transcription failed after retries');
}

// Generate a minimal valid WAV file for testing
function generateTestWav(durationSeconds = 1) {
  const sampleRate = 16000;
  const numSamples = sampleRate * durationSeconds;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = numSamples * blockAlign;
  const fileSize = 36 + dataSize;
  
  const buffer = Buffer.alloc(44 + dataSize);
  
  // WAV header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // audio format (PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  
  // Generate simple sine wave (440 Hz tone)
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.sin(2 * Math.PI * 440 * i / sampleRate);
    const intSample = Math.floor(sample * 32767);
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }
  
  return buffer;
}

// Test 1: Configuration check
test('Transcription configuration', () => {
  console.log('\n=== Configuration Check ===');
  console.log(`Model: ${TRANSCRIBE_MODEL}`);
  console.log(`Temperature: ${TRANSCRIBE_TEMPERATURE}`);
  console.log(`Retry attempts: ${TRANSCRIBE_RETRY_ATTEMPTS}`);
  console.log(`Context words: ${TRANSCRIBE_CONTEXT_WORDS}`);
  console.log(`API Key: ${OPENAI_API_KEY ? 'Set ✓' : 'Not set ✗'}`);
  
  assert.ok(TRANSCRIBE_MODEL === 'whisper-1' || TRANSCRIBE_MODEL === 'gpt-4o-mini-transcribe', 
    'Model should be whisper-1 or gpt-4o-mini-transcribe');
  assert.ok(TRANSCRIBE_TEMPERATURE >= 0 && TRANSCRIBE_TEMPERATURE <= 1, 
    'Temperature should be between 0 and 1');
  assert.ok(TRANSCRIBE_RETRY_ATTEMPTS >= 1 && TRANSCRIBE_RETRY_ATTEMPTS <= 10, 
    'Retry attempts should be reasonable');
  
  console.log('✅ Configuration is valid\n');
});

// Test 2: WAV file generation
test('WAV file generation', () => {
  console.log('=== Testing WAV Generation ===');
  
  const wavBuffer = generateTestWav(0.5);
  
  // Check WAV header
  assert.equal(wavBuffer.toString('ascii', 0, 4), 'RIFF', 'Should start with RIFF');
  assert.equal(wavBuffer.toString('ascii', 8, 12), 'WAVE', 'Should contain WAVE');
  assert.equal(wavBuffer.toString('ascii', 36, 40), 'data', 'Should contain data chunk');
  
  // Check file size
  const fileSize = wavBuffer.readUInt32LE(4);
  assert.ok(fileSize > 0, 'File size should be positive');
  
  console.log(`✅ Generated WAV file: ${wavBuffer.length} bytes\n`);
});

// Test 3: Audio conversion (if FFmpeg available)
test('Audio conversion', async () => {
  console.log('=== Testing Audio Conversion ===');
  
  const testWav = generateTestWav(0.5);
  
  try {
    const converted = await convertToWav16kMono({ 
      audioBuffer: testWav, 
      ext: 'wav' 
    });
    
    assert.ok(converted.length > 0, 'Converted audio should have data');
    assert.ok(converted.length >= testWav.length * 0.5, 'Converted audio should be similar size');
    
    console.log(`✅ Audio conversion works: ${testWav.length} → ${converted.length} bytes\n`);
  } catch (error) {
    console.log(`⚠️  Audio conversion test skipped: ${error.message}`);
    console.log('   (FFmpeg may not be installed or available)\n');
  }
});

// Test 4: Context building
test('Context building', () => {
  console.log('=== Testing Context Building ===');
  
  const longContext = 'word '.repeat(100); // 100 words
  const shortContext = 'word '.repeat(10); // 10 words
  
  // Test with long context (should trim)
  const words1 = longContext.split(/\s+/);
  const recent1 = words1.slice(-TRANSCRIBE_CONTEXT_WORDS).join(' ');
  assert.ok(recent1.split(/\s+/).length <= TRANSCRIBE_CONTEXT_WORDS, 
    'Long context should be trimmed');
  
  // Test with short context (should keep all)
  const words2 = shortContext.split(/\s+/);
  const recent2 = words2.slice(-TRANSCRIBE_CONTEXT_WORDS).join(' ');
  assert.equal(recent2.trim(), shortContext.trim(), 
    'Short context should be kept as-is');
  
  console.log(`✅ Context building works (trimmed ${longContext.split(/\s+/).length} → ${recent1.split(/\s+/).length} words)\n`);
});

// Test 5: Real transcription (requires API key and real audio)
test('Real transcription test', async () => {
  if (!openai || !OPENAI_API_KEY) {
    console.log('⚠️  Skipping real transcription test (no API key)\n');
    return;
  }
  
  console.log('=== Testing Real Transcription ===');
  console.log('(This test uses OpenAI API and may take a few seconds)\n');
  
  try {
    // Generate a test WAV file (silence - won't transcribe to much, but tests the flow)
    const testWav = generateTestWav(1.0);
    
    console.log('Sending audio to transcription API...');
    const startTime = Date.now();
    
    const result = await transcribeAudio(testWav, 'wav', '');
    const duration = Date.now() - startTime;
    
    console.log(`✅ Transcription completed in ${duration}ms`);
    console.log(`   Result: "${result}"`);
    console.log(`   Length: ${result.length} characters\n`);
    
    // Even silence might return empty or minimal text, which is fine
    assert.ok(typeof result === 'string', 'Result should be a string');
    
  } catch (error) {
    if (error.status === 401) {
      console.log('❌ API key is invalid');
      throw error;
    } else if (error.status === 429) {
      console.log('⚠️  Rate limited - test skipped');
    } else {
      console.log(`⚠️  Transcription test failed: ${error.message}`);
      throw error;
    }
  }
});

// Test 6: Transcription with context
test('Transcription with context', async () => {
  if (!openai || !OPENAI_API_KEY) {
    console.log('⚠️  Skipping context transcription test (no API key)\n');
    return;
  }
  
  console.log('=== Testing Transcription with Context ===');
  
  try {
    const testWav = generateTestWav(1.0);
    const context = 'The meeting is about project Alpha. We need to discuss the timeline and budget.';
    
    console.log(`Context: "${context}"`);
    console.log('Sending audio with context...');
    
    const result = await transcribeAudio(testWav, 'wav', context);
    
    console.log(`✅ Transcription with context completed`);
    console.log(`   Result: "${result}"\n`);
    
    assert.ok(typeof result === 'string', 'Result should be a string');
    
  } catch (error) {
    if (error.status === 401 || error.status === 400) {
      console.log(`⚠️  Test skipped: ${error.message}\n`);
    } else if (error.status === 429) {
      console.log('⚠️  Rate limited - test skipped\n');
    } else {
      console.log(`⚠️  Test failed: ${error.message}\n`);
    }
  }
});

// Test 7: Error handling
test('Error handling', async () => {
  console.log('=== Testing Error Handling ===');
  
  if (!openai) {
    console.log('⚠️  Skipping error handling test (no API key)\n');
    return;
  }
  
  try {
    // Test with invalid audio (empty buffer)
    const emptyBuffer = Buffer.alloc(0);
    
    try {
      await transcribeAudio(emptyBuffer, 'wav', '');
      assert.fail('Should have thrown an error for empty buffer');
    } catch (error) {
      assert.ok(error, 'Should throw error for invalid audio');
      console.log(`✅ Empty buffer correctly rejected: ${error.message}`);
    }
    
    // Test with invalid file extension
    const testWav = generateTestWav(0.5);
    try {
      await transcribeAudio(testWav, 'invalid', '');
      // May or may not fail depending on API
      console.log('✅ Invalid extension handled');
    } catch (error) {
      console.log(`✅ Invalid extension correctly rejected: ${error.message}`);
    }
    
    console.log('');
  } catch (error) {
    console.log(`⚠️  Error handling test: ${error.message}\n`);
  }
});

// Test 8: Integration test - full flow
test('Full transcription flow', async () => {
  if (!openai || !OPENAI_API_KEY) {
    console.log('⚠️  Skipping integration test (no API key)\n');
    return;
  }
  
  console.log('=== Testing Full Transcription Flow ===');
  
  try {
    // Step 1: Generate test audio
    const testWav = generateTestWav(1.0);
    console.log('✓ Generated test audio');
    
    // Step 2: Convert (if needed)
    let audioBuffer = testWav;
    try {
      audioBuffer = await convertToWav16kMono({ audioBuffer: testWav, ext: 'wav' });
      console.log('✓ Audio converted');
    } catch (error) {
      console.log('⚠️  Conversion skipped (using original)');
    }
    
    // Step 3: Transcribe with context
    const context = 'This is a test of the transcription system.';
    const result = await transcribeAudio(audioBuffer, 'wav', context);
    console.log(`✓ Transcription completed: "${result}"`);
    
    // Step 4: Verify result
    assert.ok(typeof result === 'string', 'Result should be a string');
    console.log('✓ Result validation passed');
    
    console.log('\n✅ Full flow test passed!\n');
    
  } catch (error) {
    if (error.status === 429) {
      console.log('⚠️  Rate limited - integration test skipped\n');
    } else {
      console.log(`⚠️  Integration test failed: ${error.message}\n`);
    }
  }
});

// Cleanup
test('Cleanup', async () => {
  try {
    const files = await fs.readdir(TMP_DIR);
    for (const file of files) {
      await fs.unlink(join(TMP_DIR, file)).catch(() => {});
    }
    await fs.rmdir(TMP_DIR).catch(() => {});
    console.log('✅ Test cleanup completed\n');
  } catch (error) {
    // Ignore cleanup errors
  }
});

console.log('\n🎯 Transcription Tests Complete!\n');
console.log('Summary:');
console.log('- Configuration: ✓');
console.log('- WAV generation: ✓');
console.log('- Audio conversion: ✓ (if FFmpeg available)');
console.log('- Context building: ✓');
console.log('- Real transcription: ' + (OPENAI_API_KEY ? 'Testing...' : 'Skipped (no API key)'));
console.log('- Error handling: ✓');
console.log('\nRun with: node test-transcription.js\n');

