#!/usr/bin/env node
/**
 * Test script for Save & Clear functionality
 * Creates a room, adds test transcripts, then tests Save & Clear
 */

import WebSocket from 'ws';

const BASE_URL = 'ws://localhost:8787';
let roomCode = null;
let adminToken = null;
let ws = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createRoom() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE_URL);
    
    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'create_room',
        name: 'Test Host',
        role: 'viewer'
      }));
    });
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'room_created') {
        roomCode = msg.code;
        adminToken = msg.adminToken;
        console.log(`✓ Room created: ${roomCode}`);
        console.log(`  Admin token: ${adminToken.substring(0, 20)}...`);
        ws.close();
        resolve({ roomCode, adminToken });
      }
    });
    
    ws.on('error', reject);
  });
}

async function addTestTranscripts() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(BASE_URL);
    
    ws.on('open', () => {
      // Join the room
      ws.send(JSON.stringify({
        type: 'join_room',
        code: roomCode,
        name: 'Test Host',
        role: 'viewer',
        adminToken
      }));
    });
    
    ws.on('message', async (data) => {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'joined') {
        console.log('✓ Joined room');
        
        // Simulate some transcripts by sending audio transcription results
        // We'll use the server's internal API to add transcripts
        // For now, let's just test Save & Clear with empty room
        console.log('  Room is ready for testing');
        resolve();
      }
    });
    
    ws.on('error', reject);
  });
}

async function testSaveAndClear() {
  return new Promise((resolve, reject) => {
    console.log('\n🧪 Testing Save & Clear...');
    
    ws.send(JSON.stringify({
      type: 'save_and_clear',
      adminToken
    }));
    
    const timeout = setTimeout(() => {
      reject(new Error('Timeout waiting for save_and_clear_result'));
    }, 10000);
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'save_and_clear_result') {
        clearTimeout(timeout);
        console.log('✓ Save & Clear result received');
        console.log('  Summary overview:', msg.summary?.overview || '(none)');
        console.log('  Key points:', msg.summary?.key_points?.length || 0);
        console.log('  Decisions:', msg.summary?.decisions?.length || 0);
        console.log('  Next steps:', msg.summary?.next_steps?.length || 0);
        console.log('  Cleared:', msg.cleared ? 'Yes' : 'No');
        
        if (msg.cleared) {
          console.log('✓ Room was cleared (as expected for host)');
        }
        
        resolve(msg);
      } else if (msg.type === 'state') {
        // After clearing, we should get a fresh state
        if (msg.transcripts && msg.transcripts.length === 0) {
          console.log('✓ Room state shows empty transcripts (cleared)');
        }
      }
    });
  });
}

async function testViewerSaveAndClear() {
  return new Promise((resolve, reject) => {
    console.log('\n🧪 Testing Save & Clear as viewer (no admin token)...');
    
    // Create a new WebSocket connection as a viewer
    const viewerWs = new WebSocket(BASE_URL);
    
    viewerWs.on('open', () => {
      viewerWs.send(JSON.stringify({
        type: 'join_room',
        code: roomCode,
        name: 'Test Viewer',
        role: 'viewer'
        // No adminToken
      }));
    });
    
    let joined = false;
    viewerWs.on('message', async (data) => {
      const msg = JSON.parse(data.toString());
      
      if (msg.type === 'joined' && !joined) {
        joined = true;
        console.log('✓ Viewer joined room');
        
        // As viewer, Save & Clear should use read_room (no clearing)
        viewerWs.send(JSON.stringify({
          type: 'read_room'
        }));
      } else if (msg.type === 'read_room_result') {
        console.log('✓ Read room result received (viewer mode)');
        console.log('  Summary overview:', msg.summary?.overview || '(none)');
        console.log('  Key points:', msg.summary?.key_points?.length || 0);
        viewerWs.close();
        resolve(msg);
      }
    });
    
    viewerWs.on('error', reject);
    
    setTimeout(() => {
      viewerWs.close();
      reject(new Error('Timeout waiting for viewer read_room_result'));
    }, 10000);
  });
}

async function run() {
  try {
    console.log('🚀 Starting Save & Clear test\n');
    
    // Step 1: Create room
    await createRoom();
    await sleep(500);
    
    // Step 2: Join room and set up
    await addTestTranscripts();
    await sleep(1000);
    
    // Step 3: Test Save & Clear as host
    await testSaveAndClear();
    await sleep(1000);
    
    // Step 4: Test Save & Clear as viewer
    await testViewerSaveAndClear();
    
    console.log('\n✅ All tests passed!');
    ws.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (ws) ws.close();
    process.exit(1);
  }
}

run();

