# Logic Improvements for RoomBrief

## Overview
This document outlines potential improvements to the application logic, covering error handling, edge cases, performance, concurrency, and code quality.

---

## 🔴 Critical Issues

### 1. Race Condition in Audio Queue Processing
**Location**: `server.js:405-488`

**Problem**: 
- `processAudioQueue` can be called multiple times simultaneously
- `audioBusy` flag check isn't atomic
- Multiple chunks could be processed concurrently, causing transcription errors

**Current Code**:
```javascript
async function processAudioQueue(room) {
  if (room.audioBusy || room.audioQueue.length === 0) return;
  room.audioBusy = true;
  // ... processing
}
```

**Fix**:
```javascript
async function processAudioQueue(room) {
  // Atomic check-and-set
  if (room.audioBusy || room.audioQueue.length === 0) return;
  
  // Use a lock mechanism
  const wasBusy = room.audioBusy;
  room.audioBusy = true;
  if (wasBusy) return; // Double-check after setting
  
  try {
    // ... existing processing logic
  } finally {
    room.audioBusy = false;
    // Process next chunk if available
    if (room.audioQueue.length > 0) {
      setImmediate(() => processAudioQueue(room));
    }
  }
}
```

### 2. Memory Leak: WebSocket Not Cleaned Up on Error
**Location**: `server.js:491-755`

**Problem**: 
- If WebSocket connection fails during room creation/join, the connection isn't properly cleaned up
- Room might be created but client never notified
- `summaryTimer` might not be cleared if client disconnects unexpectedly

**Fix**:
```javascript
ws.on('error', (error) => {
  console.error(`WebSocket error for client ${clientId}:`, error);
  if (currentRoom) {
    const room = rooms.get(currentRoom);
    if (room) {
      room.removeClient(clientId);
      if (room.clients.size === 0) {
        if (room.summaryTimer) clearInterval(room.summaryTimer);
        rooms.delete(currentRoom);
      }
    }
  }
});
```

### 3. No Rate Limiting on Audio Chunks
**Location**: `server.js:585-659`

**Problem**: 
- Malicious client could spam audio chunks
- No per-client rate limiting
- Could exhaust server resources

**Fix**:
```javascript
// Add to Room class
constructor(code) {
  // ... existing code
  this.clientChunkRates = new Map(); // clientId -> { count, resetAt }
}

// In audio_chunk handler
const client = room.clients.get(clientId);
if (client) {
  const now = Date.now();
  const rate = room.clientChunkRates.get(clientId) || { count: 0, resetAt: now + 60000 };
  
  if (now > rate.resetAt) {
    rate.count = 0;
    rate.resetAt = now + 60000;
  }
  
  rate.count++;
  if (rate.count > 100) { // Max 100 chunks per minute
    ws.send(JSON.stringify({
      type: 'warn',
      message: 'Rate limit exceeded. Please slow down.'
    }));
    return;
  }
  
  room.clientChunkRates.set(clientId, rate);
}
```

---

## 🟡 Important Improvements

### 4. Summary Update Could Skip If Busy
**Location**: `server.js:223-351`

**Problem**: 
- If `summaryBusy` is true, update is silently skipped
- No queue or retry mechanism
- Summary could become stale

**Fix**:
```javascript
class Room {
  constructor(code) {
    // ... existing code
    this.summaryPending = false; // Flag to retry after busy
  }
}

async function updateSummary(room) {
  if (room.summaryBusy) {
    room.summaryPending = true; // Mark as pending
    return;
  }
  
  room.summaryBusy = true;
  room.summaryPending = false;
  
  try {
    // ... existing logic
  } finally {
    room.summaryBusy = false;
    
    // Retry if there was a pending update
    if (room.summaryPending) {
      setImmediate(() => updateSummary(room));
    }
  }
}
```

### 5. Room Code Collision (Low Probability But Possible)
**Location**: `server.js:133-135`

**Problem**: 
- 6-character hex codes have ~16.7M combinations
- With many concurrent rooms, collisions are possible
- No check for existing room code

**Fix**:
```javascript
function generateRoomCode() {
  let code;
  let attempts = 0;
  do {
    code = randomBytes(3).toString('hex').toUpperCase();
    attempts++;
    if (attempts > 10) {
      throw new Error('Failed to generate unique room code');
    }
  } while (rooms.has(code));
  return code;
}
```

### 6. Transcript Array Could Grow Unbounded
**Location**: `server.js:109-116`

**Problem**: 
- While capped at 1000, if many transcripts arrive quickly, memory could spike
- No time-based cleanup
- Old transcripts never removed except by shift()

**Fix**:
```javascript
addTranscript(entry) {
  this.transcripts.push(entry);
  
  // Keep only last 1000 entries
  if (this.transcripts.length > 1000) {
    this.transcripts.shift();
  }
  
  // Also remove entries older than 2 hours
  const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
  this.transcripts = this.transcripts.filter(t => t.ts >= twoHoursAgo);
  
  this.updatedAt = Date.now();
}
```

### 7. No Validation on JSON Parsing
**Location**: `server.js:497`, `public/app.js:158`

**Problem**: 
- `JSON.parse` could throw on malformed messages
- Could crash server/client

**Fix**:
```javascript
ws.on('message', async (data) => {
  let message;
  try {
    message = JSON.parse(data.toString());
  } catch (error) {
    console.error('Invalid JSON message:', error);
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Invalid message format'
    }));
    return;
  }
  
  // Validate message structure
  if (!message.type || typeof message.type !== 'string') {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Message must have a type field'
    }));
    return;
  }
  
  // ... rest of handler
});
```

### 8. Audio Buffer Size Not Validated Before Base64 Decode
**Location**: `server.js:621`

**Problem**: 
- Base64 string could be extremely large
- `Buffer.from(b64, 'base64')` could allocate huge buffer
- Could cause memory issues

**Fix**:
```javascript
const b64 = message.data;
if (!b64 || typeof b64 !== 'string') {
  console.warn(`[${room.code}] Invalid audio chunk data from ${speaker}`);
  return;
}

// Validate base64 string length (roughly 4/3 of binary size)
const estimatedSize = (b64.length * 3) / 4;
if (estimatedSize > MAX_CHUNK_SIZE * 2) { // Allow some overhead
  ws.send(JSON.stringify({
    type: 'warn',
    message: `Chunk too large (estimated ${Math.round(estimatedSize / 1024)} KB)`
  }));
  return;
}

const audioBuffer = Buffer.from(b64, 'base64');
```

---

## 🟢 Performance Optimizations

### 9. Inefficient Transcript Filtering
**Location**: `server.js:118-121`, `server.js:228`

**Problem**: 
- `filter()` creates new array every time
- Called frequently (every summary update)
- Could be optimized with binary search or caching

**Fix**:
```javascript
// Cache recent transcripts with timestamp
getRecentTranscripts(seconds) {
  const cutoff = Date.now() - (seconds * 1000);
  
  // If transcripts are sorted by timestamp, use binary search
  // For now, simple optimization: check if we can skip
  if (this.transcripts.length === 0) return [];
  if (this.transcripts[0].ts >= cutoff) return this.transcripts;
  
  // Only filter if necessary
  return this.transcripts.filter(t => t.ts >= cutoff);
}
```

### 10. Multiple Broadcast Calls Could Be Batched
**Location**: `server.js:327-344`

**Problem**: 
- State update and topic shift are separate broadcasts
- Could combine into single message

**Fix**:
```javascript
// Single broadcast with all updates
room.broadcast({
  type: 'state',
  room: {
    code: room.code,
    summary: room.summary
  },
  topicShift: topicShiftDetected ? {
    topic: finalTopic,
    subtopic: result.subtopic || '',
    status: result.status || 'Deciding',
    confidence: newConfidence
  } : null
});
```

### 11. Context Building Could Be Cached
**Location**: `server.js:447-452`

**Problem**: 
- Context rebuilt for every chunk from same speaker
- Could cache recent context per speaker

**Fix**:
```javascript
// Add to Room class
constructor(code) {
  // ... existing code
  this.speakerContexts = new Map(); // speaker -> { text, lastUpdated }
}

// In processAudioQueue
const speakerContext = room.speakerContexts.get(speaker);
let recentFromSpeaker = '';

if (speakerContext && (Date.now() - speakerContext.lastUpdated < 5000)) {
  // Use cached context if recent
  recentFromSpeaker = speakerContext.text;
} else {
  // Rebuild context
  const recent = room.transcripts
    .filter(t => t.speaker === speaker)
    .slice(-5)
    .map(t => t.text)
    .join(' ');
  
  room.speakerContexts.set(speaker, {
    text: recent,
    lastUpdated: Date.now()
  });
  recentFromSpeaker = recent;
}
```

---

## 🔵 Edge Cases & Robustness

### 12. Empty Transcription Handling
**Location**: `server.js:458-477`

**Problem**: 
- Empty transcriptions are logged but not handled gracefully
- Could send empty entries to clients

**Current**: Already handled, but could be improved

**Enhancement**:
```javascript
if (text && text.trim().length > 0) {
  // Only add if meaningful (more than just whitespace/punctuation)
  const meaningfulText = text.trim().replace(/^[^\w]+|[^\w]+$/g, '');
  if (meaningfulText.length > 0) {
    // ... add transcript
  } else {
    console.log(`[${room.code}] Only punctuation/whitespace detected`);
  }
}
```

### 13. WebSocket Reconnection Logic
**Location**: `public/app.js:167-175`

**Problem**: 
- Reconnection doesn't preserve room state
- Client loses room code on reconnect
- No exponential backoff

**Fix**:
```javascript
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

ws.onclose = () => {
  console.log('WebSocket closed');
  
  if (currentRoom && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    reconnectAttempts++;
    
    setTimeout(() => {
      if (currentRole === 'viewer') {
        connectAndCreate();
      } else {
        connectAndJoin(currentRoom);
      }
    }, delay);
  } else {
    showError('Connection lost. Please refresh the page.');
  }
};

ws.onopen = () => {
  reconnectAttempts = 0; // Reset on successful connection
};
```

### 14. Summary JSON Parsing Could Fail
**Location**: `server.js:277`

**Problem**: 
- `JSON.parse` could throw if model returns invalid JSON
- No fallback or retry

**Fix**:
```javascript
let result;
try {
  result = JSON.parse(completion.choices[0].message.content);
} catch (error) {
  console.error('Failed to parse summary JSON:', error);
  console.error('Raw response:', completion.choices[0].message.content);
  
  // Try to extract JSON from markdown code blocks
  const content = completion.choices[0].message.content;
  const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  
  if (jsonMatch) {
    try {
      result = JSON.parse(jsonMatch[1]);
    } catch (e) {
      console.error('Failed to parse extracted JSON:', e);
      // Use previous summary as fallback
      return;
    }
  } else {
    // Use previous summary as fallback
    return;
  }
}
```

### 15. Temp File Cleanup on Process Crash
**Location**: `server.js:154-220`

**Problem**: 
- Temp files created but if process crashes, files remain
- Could fill disk over time

**Fix**:
```javascript
// Add cleanup on startup
async function cleanupTempFiles() {
  try {
    const files = await fs.readdir(TMP_DIR);
    const now = Date.now();
    const maxAge = 3600000; // 1 hour
    
    for (const file of files) {
      const filePath = join(TMP_DIR, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtimeMs > maxAge) {
        await fs.unlink(filePath).catch(() => {});
      }
    }
  } catch (error) {
    console.error('Temp file cleanup error:', error);
  }
}

// Run on startup and periodically
cleanupTempFiles();
setInterval(cleanupTempFiles, 3600000); // Every hour
```

---

## 🟣 Code Quality Improvements

### 16. Magic Numbers Should Be Constants
**Location**: Throughout codebase

**Examples**:
- `1000` (max transcripts)
- `50` (recent transcripts sent)
- `5` (context entries)
- `5000` (merge time window)

**Fix**:
```javascript
// Add to configuration section
const MAX_TRANSCRIPTS = parseInt(process.env.MAX_TRANSCRIPTS || '1000');
const RECENT_TRANSCRIPTS_SENT = parseInt(process.env.RECENT_TRANSCRIPTS_SENT || '50');
const CONTEXT_ENTRIES = parseInt(process.env.CONTEXT_ENTRIES || '5');
const TRANSCRIPT_MERGE_WINDOW_MS = parseInt(process.env.TRANSCRIPT_MERGE_WINDOW_MS || '5000');
```

### 17. Error Messages Should Be More Descriptive
**Location**: Throughout error handlers

**Problem**: 
- Generic error messages don't help debugging
- Missing context (room code, client ID, etc.)

**Fix**:
```javascript
catch (error) {
  console.error(`[${room?.code || 'unknown'}] Audio processing error (client: ${clientId}):`, {
    message: error.message,
    stack: error.stack,
    chunkSize: audioBuffer?.length,
    ext: ext
  });
  
  // Send more informative error to client
  room.broadcast({
    type: 'error',
    message: `Transcription failed: ${error.message}`,
    clientId: clientId
  }, clientId);
}
```

### 18. Add Input Sanitization
**Location**: `server.js:507`, `server.js:557`

**Problem**: 
- User names not sanitized
- Could contain XSS if displayed unsafely (though server doesn't render HTML)
- Room codes not validated format

**Fix**:
```javascript
function sanitizeName(name) {
  if (!name || typeof name !== 'string') return 'Unknown';
  // Remove control characters, limit length
  return name.trim().replace(/[\x00-\x1F\x7F]/g, '').substring(0, 50);
}

function validateRoomCode(code) {
  return /^[A-F0-9]{6}$/.test(code);
}
```

### 19. Add Request Timeout for OpenAI API Calls
**Location**: `server.js:185`, `server.js:270`

**Problem**: 
- No timeout on API calls
- Could hang indefinitely

**Fix**:
```javascript
// Add timeout wrapper
async function withTimeout(promise, timeoutMs, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

// Use in transcription
const transcription = await withTimeout(
  openai.audio.transcriptions.create(params),
  30000, // 30 second timeout
  'Transcription request timed out'
);
```

### 20. Better Logging with Levels
**Location**: Throughout

**Problem**: 
- All logs are `console.log` or `console.error`
- No log levels
- Hard to filter in production

**Fix**:
```javascript
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const logger = {
  debug: (...args) => LOG_LEVEL === 'debug' && console.log('[DEBUG]', ...args),
  info: (...args) => ['debug', 'info'].includes(LOG_LEVEL) && console.log('[INFO]', ...args),
  warn: (...args) => ['debug', 'info', 'warn'].includes(LOG_LEVEL) && console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args)
};
```

---

## 📊 Summary Priority

### High Priority (Do First)
1. Race condition in audio queue (#1)
2. Memory leak in WebSocket cleanup (#2)
3. Rate limiting (#3)
4. Summary update skipping (#4)

### Medium Priority
5. Room code collision (#5)
6. Transcript cleanup (#6)
7. JSON parsing validation (#7)
8. Buffer size validation (#8)

### Low Priority (Nice to Have)
9. Transcript filtering optimization (#9)
10. Broadcast batching (#10)
11. Context caching (#11)
12. Logging improvements (#20)

---

## 🧪 Testing Recommendations

For each improvement:
1. Write unit tests for the new logic
2. Test edge cases (empty inputs, large inputs, concurrent requests)
3. Load test for performance improvements
4. Monitor error rates before/after

---

## 📝 Implementation Notes

- Most improvements are backward compatible
- Some require database/memory structure changes (document first)
- Test in staging before production
- Monitor metrics after deployment

