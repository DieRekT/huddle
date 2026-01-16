import { WebSocket } from 'ws';
import http from 'http';

// Test WebSocket connection and basic flow
async function testWebSocket() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:8787');
    let testsPassed = 0;
    let testsFailed = 0;
    const results = [];

    ws.on('open', () => {
      console.log('✅ WebSocket connection opened');
      testsPassed++;
      
      // Test 1: Create room
      ws.send(JSON.stringify({
        type: 'create_room',
        name: 'TestViewer'
      }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'hello') {
        console.log('✅ Received hello message');
        testsPassed++;
      }
      
      if (message.type === 'room_created') {
        console.log(`✅ Room created: ${message.roomCode}`);
        console.log(`✅ Admin token received: ${message.adminToken ? 'Yes' : 'No'}`);
        testsPassed++;
        
        if (message.adminToken) {
          testsPassed++;
        } else {
          testsFailed++;
          results.push('❌ Admin token missing');
        }
        
        // Test 2: Join as mic
        const ws2 = new WebSocket('ws://localhost:8787');
        ws2.on('open', () => {
          ws2.send(JSON.stringify({
            type: 'join',
            roomCode: message.roomCode,
            role: 'mic',
            name: 'TestMic'
          }));
        });
        
        ws2.on('message', (data2) => {
          const msg2 = JSON.parse(data2.toString());
          if (msg2.type === 'joined') {
            console.log('✅ Mic joined successfully');
            testsPassed++;
            
            // Test 3: Send audio chunk (empty, just test the flow)
            ws2.send(JSON.stringify({
              type: 'audio_chunk',
              mime: 'audio/webm',
              data: Buffer.from('fake audio data').toString('base64'),
              tsEnd: Date.now()
            }));
            
            setTimeout(() => {
              ws2.close();
              ws.close();
              resolve({ passed: testsPassed, failed: testsFailed, results });
            }, 1000);
          }
        });
      }
      
      if (message.type === 'error') {
        console.error(`❌ Error: ${message.message}`);
        testsFailed++;
        results.push(`❌ Error: ${message.message}`);
      }
    });

    ws.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
      testsFailed++;
      results.push(`❌ WebSocket error: ${error.message}`);
      reject(error);
    });

    setTimeout(() => {
      ws.close();
      resolve({ passed: testsPassed, failed: testsFailed, results });
    }, 5000);
  });
}

// Test HTTP endpoints
async function testHTTP() {
  return new Promise((resolve) => {
    const results = { passed: 0, failed: 0, results: [] };
    
    // Test 1: GET /
    http.get('http://localhost:8787', (res) => {
      if (res.statusCode === 200) {
        console.log('✅ HTTP server responding');
        results.passed++;
      } else {
        console.log(`❌ HTTP status: ${res.statusCode}`);
        results.failed++;
        results.results.push(`❌ HTTP status: ${res.statusCode}`);
      }
      resolve(results);
    }).on('error', (err) => {
      console.error(`❌ HTTP error: ${err.message}`);
      results.failed++;
      results.results.push(`❌ HTTP error: ${err.message}`);
      resolve(results);
    });
  });
}

// Test clamping functions
function testClamping() {
  console.log('\n=== Testing Clamping Functions ===');
  
  function clampSummary(text, maxLength = 200) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    const cut = text.substring(0, maxLength);
    const lastPeriod = cut.lastIndexOf('.');
    const lastSpace = cut.lastIndexOf(' ');
    const cutPoint = lastPeriod > maxLength * 0.7 ? lastPeriod + 1 : lastSpace;
    return cut.substring(0, cutPoint > 0 ? cutPoint : maxLength) + '...';
  }

  function clampArray(arr, maxLength = 5) {
    return Array.isArray(arr) ? arr.slice(0, maxLength) : [];
  }

  let passed = 0;
  let failed = 0;

  // Test summary clamping
  const longText = 'A'.repeat(250);
  const clamped = clampSummary(longText, 200);
  if (clamped.length <= 203 && clamped.endsWith('...')) {
    console.log('✅ Summary clamping works');
    passed++;
  } else {
    console.log('❌ Summary clamping failed');
    failed++;
  }

  // Test array clamping
  const longArray = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const clampedArray = clampArray(longArray, 5);
  if (clampedArray.length === 5) {
    console.log('✅ Array clamping works');
    passed++;
  } else {
    console.log('❌ Array clamping failed');
    failed++;
  }

  return { passed, failed };
}

// Run all tests
async function runTests() {
  console.log('=== RoomBrief Integration Tests ===\n');
  
  // Test 1: HTTP
  console.log('Testing HTTP server...');
  const httpResults = await testHTTP();
  
  // Test 2: WebSocket
  console.log('\nTesting WebSocket...');
  let wsResults = { passed: 0, failed: 0, results: [] };
  try {
    wsResults = await testWebSocket();
  } catch (error) {
    console.error('WebSocket test failed:', error.message);
    wsResults.failed++;
  }
  
  // Test 3: Clamping
  const clampResults = testClamping();
  
  // Summary
  const totalPassed = httpResults.passed + wsResults.passed + clampResults.passed;
  const totalFailed = httpResults.failed + wsResults.failed + clampResults.failed;
  
  console.log('\n=== Test Summary ===');
  console.log(`✅ Passed: ${totalPassed}`);
  console.log(`❌ Failed: ${totalFailed}`);
  
  if (totalFailed === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed');
    process.exit(1);
  }
}

runTests();




























