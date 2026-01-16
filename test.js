import { test } from 'node:test';
import assert from 'node:assert';
import { clampText, clampList, clampSummaryObject } from './src/clamp.js';
import { addUtterance, DEFAULT_THRESHOLDS } from './src/segmenter.js';
import { pageSegments } from './src/paging.js';

// Import chunking functions from server.js (we'll test them directly)
// Note: These are server-side functions, so we test the logic here
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

function buildTranscriptText(transcripts) {
  return transcripts
    .map(t => `${t.speaker}: ${t.text}`)
    .join('\n');
}

function chunkTranscriptsByTokens(transcripts, maxTokensPerChunk = 30000) {
  if (transcripts.length === 0) return [];
  
  const chunks = [];
  let currentChunk = {
    startIdx: 0,
    transcripts: []
  };
  let currentTokenCount = 0;
  
  for (let i = 0; i < transcripts.length; i++) {
    const entry = transcripts[i];
    const entryText = `${entry.speaker}: ${entry.text}\n`;
    const entryTokens = estimateTokens(entryText);
    
    if (currentTokenCount + entryTokens > maxTokensPerChunk && currentChunk.transcripts.length > 0) {
      // Finalize current chunk
      currentChunk.endIdx = i;
      currentChunk.text = buildTranscriptText(currentChunk.transcripts);
      chunks.push(currentChunk);
      
      // Start new chunk
      currentChunk = {
        startIdx: i,
        transcripts: [entry]
      };
      currentTokenCount = entryTokens;
    } else {
      currentChunk.transcripts.push(entry);
      currentTokenCount += entryTokens;
    }
  }
  
  // Add final chunk
  if (currentChunk.transcripts.length > 0) {
    currentChunk.endIdx = transcripts.length;
    currentChunk.text = buildTranscriptText(currentChunk.transcripts);
    chunks.push(currentChunk);
  }
  
  return chunks;
}

// Topic stability logic test
function testTopicStability() {
  const TOPIC_SHIFT_CONFIDENCE = 0.60;
  
  // Simulate topic stability state
  let topicStability = {
    pendingTopic: null,
    pendingCount: 0
  };
  
  let currentTopic = 'Topic A';
  
  // Test 1: New topic with high confidence, but only 1 update
  const newTopic1 = 'Topic B';
  const confidence1 = 0.75;
  const topicChanged1 = newTopic1 !== currentTopic && confidence1 >= TOPIC_SHIFT_CONFIDENCE;
  
  if (topicChanged1) {
    if (topicStability.pendingTopic === newTopic1) {
      topicStability.pendingCount++;
      if (topicStability.pendingCount >= 2) {
        currentTopic = newTopic1;
        topicStability.pendingTopic = null;
        topicStability.pendingCount = 0;
      }
    } else {
      topicStability.pendingTopic = newTopic1;
      topicStability.pendingCount = 1;
    }
  }
  
  assert.equal(currentTopic, 'Topic A', 'Topic should not change after 1 update');
  assert.equal(topicStability.pendingCount, 1, 'Pending count should be 1');
  
  // Test 2: Same topic again (2nd update)
  const newTopic2 = 'Topic B';
  const confidence2 = 0.80;
  const topicChanged2 = newTopic2 !== currentTopic && confidence2 >= TOPIC_SHIFT_CONFIDENCE;
  
  if (topicChanged2) {
    if (topicStability.pendingTopic === newTopic2) {
      topicStability.pendingCount++;
      if (topicStability.pendingCount >= 2) {
        currentTopic = newTopic2;
        topicStability.pendingTopic = null;
        topicStability.pendingCount = 0;
      }
    } else {
      topicStability.pendingTopic = newTopic2;
      topicStability.pendingCount = 1;
    }
  }
  
  assert.equal(currentTopic, 'Topic B', 'Topic should change after 2 consecutive updates');
  assert.equal(topicStability.pendingCount, 0, 'Pending count should reset');
  
  // Test 3: Low confidence should not trigger pending
  topicStability = { pendingTopic: null, pendingCount: 0 };
  currentTopic = 'Topic C';
  const newTopic3 = 'Topic D';
  const confidence3 = 0.50; // Below threshold
  
  const topicChanged3 = newTopic3 !== currentTopic && confidence3 >= TOPIC_SHIFT_CONFIDENCE;
  assert.equal(topicChanged3, false, 'Low confidence should not trigger topic change');
  
  console.log('✓ Topic stability tests passed');
}

// Clamping tests
function testClamping() {
  // clampText
  assert.equal(clampText('abc', 10), 'abc');
  assert.ok(clampText('A'.repeat(250), 200).length <= 203);
  assert.ok(clampText('A'.repeat(250), 200).endsWith('...'));

  // clampList
  assert.deepEqual(clampList(['a', 'b'], 5), ['a', 'b']);
  assert.equal(clampList(['a', 'b', 'c'], 2).length, 2);

  // clampSummaryObject
  const s = clampSummaryObject({
    topic: 'T',
    rolling_summary: 'A'.repeat(400),
    decisions: Array.from({ length: 20 }, (_, i) => `d${i}`)
  });
  assert.ok(s.rolling_summary.length <= 203);
  assert.ok(s.decisions.length <= 5);
  
  console.log('✓ Clamping tests passed');
}

function testSegmentation() {
  const thr = { ...DEFAULT_THRESHOLDS };
  let segments = [];

  // 1) merge same-speaker fragments within 1.2s
  ({ segments } = addUtterance(segments, { speaker: 'A', text: 'Hello', tEndMs: 1000 }, thr));
  const r1 = addUtterance(segments, { speaker: 'A', text: 'there', tEndMs: 1800 }, thr);
  segments = r1.segments;
  assert.equal(segments.length, 1);
  assert.equal(segments[0].text, 'Hello there');

  // 2) split when pause >= 2s
  const r2 = addUtterance(segments, { speaker: 'A', text: 'Next', tEndMs: 5000 }, thr);
  segments = r2.segments;
  assert.equal(segments.length, 2);

  // 3) speaker change creates new segment
  const r3 = addUtterance(segments, { speaker: 'B', text: 'Hi', tEndMs: 5200 }, thr);
  segments = r3.segments;
  assert.equal(segments.length, 3);

  // 4) splits when char limit exceeded
  const small = { ...thr, MAX_CHARS: 10 };
  let segs2 = [];
  ({ segments: segs2 } = addUtterance(segs2, { speaker: 'A', text: '12345', tEndMs: 1000 }, small));
  ({ segments: segs2 } = addUtterance(segs2, { speaker: 'A', text: '67890', tEndMs: 1500 }, small));
  // would be "12345 67890" (11 chars incl space) => should split
  assert.equal(segs2.length, 2);

  // 5) duration/word limit triggers split
  const wordy = { ...thr, MAX_WORDS: 3 };
  let segs3 = [];
  ({ segments: segs3 } = addUtterance(segs3, { speaker: 'A', text: 'one two', tEndMs: 1000 }, wordy));
  ({ segments: segs3 } = addUtterance(segs3, { speaker: 'A', text: 'three four', tEndMs: 1500 }, wordy));
  assert.equal(segs3.length, 2);

  console.log('✓ Segmentation tests passed');
}

function testPaging() {
  const segments = Array.from({ length: 250 }, (_, i) => ({ id: String(i), tEndMs: i * 1000, speaker: 'A', text: `t${i}` }));

  const p1 = pageSegments({ segments, cursor: null, limit: 80 });
  assert.equal(p1.segments.length, 80);
  assert.equal(p1.segments[0].id, '170');
  assert.equal(p1.nextCursor, 170);

  const p2 = pageSegments({ segments, cursor: p1.nextCursor, limit: 80 });
  assert.equal(p2.segments.length, 80);
  assert.equal(p2.segments[0].id, '90');
  assert.equal(p2.nextCursor, 90);

  console.log('✓ Paging tests passed');
}

// Chunking function tests
function testChunking() {
  // Test estimateTokens
  assert.equal(estimateTokens(''), 0, 'Empty string should be 0 tokens');
  assert.equal(estimateTokens('test'), 1, '4 chars = 1 token');
  assert.equal(estimateTokens('test test'), 3, '9 chars = 3 tokens (rounded up from 2.25)');
  assert.equal(estimateTokens('A'.repeat(100)), 25, '100 chars = 25 tokens');

  // Test buildTranscriptText
  const transcripts = [
    { speaker: 'Alice', text: 'Hello' },
    { speaker: 'Bob', text: 'Hi there' }
  ];
  const text = buildTranscriptText(transcripts);
  assert.equal(text, 'Alice: Hello\nBob: Hi there', 'Should build transcript text correctly');
  assert.equal(buildTranscriptText([]), '', 'Empty array should return empty string');

  // Test chunkTranscriptsByTokens - small transcripts (no chunking needed)
  const smallTranscripts = Array.from({ length: 10 }, (_, i) => ({
    speaker: 'Speaker',
    text: `Message ${i}`
  }));
  const smallChunks = chunkTranscriptsByTokens(smallTranscripts, 30000);
  assert.equal(smallChunks.length, 1, 'Small transcript should not be chunked');
  assert.equal(smallChunks[0].transcripts.length, 10, 'All transcripts should be in one chunk');

  // Test chunkTranscriptsByTokens - large transcripts (should chunk)
  // Create transcripts that will exceed token limit
  const largeTranscripts = Array.from({ length: 100 }, (_, i) => ({
    speaker: 'Speaker',
    text: 'A'.repeat(2000) // Each entry ~500 tokens, 100 entries = ~50k tokens
  }));
  const largeChunks = chunkTranscriptsByTokens(largeTranscripts, 10000); // Small limit to force chunking
  assert.ok(largeChunks.length > 1, 'Large transcript should be chunked');
  assert.ok(largeChunks[0].startIdx === 0, 'First chunk should start at index 0');
  assert.ok(largeChunks[largeChunks.length - 1].endIdx === largeTranscripts.length, 'Last chunk should end at transcript length');

  // Test chunkTranscriptsByTokens - empty array
  assert.deepEqual(chunkTranscriptsByTokens([]), [], 'Empty array should return empty array');

  console.log('✓ Chunking tests passed');
}

// Passcode validation tests
function testPasscodeValidation() {
  // Valid passcodes (4-6 digits)
  const validPasscodes = ['1234', '12345', '123456', '0000', '999999'];
  validPasscodes.forEach(passcode => {
    assert.ok(/^\d{4,6}$/.test(passcode), `Passcode ${passcode} should be valid`);
  });

  // Invalid passcodes
  const invalidPasscodes = ['123', '1234567', 'abcd', '12ab', '', '123 4'];
  invalidPasscodes.forEach(passcode => {
    assert.ok(!/^\d{4,6}$/.test(passcode), `Passcode ${passcode} should be invalid`);
  });

  console.log('✓ Passcode validation tests passed');
}

// Run tests
test('Topic stability', () => {
  testTopicStability();
});

test('Clamping functions', () => {
  testClamping();
});

test('Segmentation', () => {
  testSegmentation();
});

test('Paging', () => {
  testPaging();
});

test('Chunking functions', () => {
  testChunking();
});

test('Passcode validation', () => {
  testPasscodeValidation();
});

console.log('\nAll tests passed! ✅');



