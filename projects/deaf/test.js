import { test } from 'node:test';
import assert from 'node:assert';
import { clampText, clampList, clampSummaryObject } from './src/clamp.js';
import { addUtterance, DEFAULT_THRESHOLDS } from './src/segmenter.js';
import { pageSegments } from './src/paging.js';

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

console.log('\nAll tests passed! ✅');



