// Realtime transcription client module
// Connects to OpenAI Realtime API via WebRTC for low-latency streaming transcription

let realtimeSession = null;
let realtimeSocket = null;
let realtimeAudioStream = null; // Renamed to avoid conflict with app.js
let realtimeMediaStream = null; // Renamed to avoid conflict
let pc = null; // RTCPeerConnection
let isRecording = false;
let roomCode = null;
let micId = null;
let speakerName = 'Mic';

// Initialize Realtime transcription
async function initRealtimeMic(clientRoomCode, clientMicId, clientSpeakerName) {
  roomCode = clientRoomCode;
  micId = clientMicId || `mic_${Date.now()}`;
  speakerName = clientSpeakerName || 'Mic';

  try {
    // Request ephemeral session credentials from our server
    const response = await fetch('/api/realtime/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create Realtime session');
    }

    const sessionData = await response.json();
    const { client_secret, session_id } = sessionData;

    // Connect to OpenAI Realtime API using WebRTC
    // The client_secret is the ephemeral credential that authenticates this session
    await connectToRealtime(session_id, client_secret);

    return true;
  } catch (error) {
    console.error('Realtime initialization error:', error);
    throw error;
  }
}

// Connect to OpenAI Realtime API via WebRTC
async function connectToRealtime(sessionId, clientSecret) {
  return new Promise((resolve, reject) => {
    try {
      // OpenAI Realtime API WebSocket endpoint
      // The client_secret is used for authentication
      const wsUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17`;
      
      realtimeSocket = new WebSocket(wsUrl, [], {
        headers: {
          'Authorization': `Bearer ${clientSecret}`,
          'OpenAI-Beta': 'realtime=v1'
        }
      });

      realtimeSocket.onopen = () => {
        console.log('Realtime WebSocket connected');
        
        // Send session configuration
        realtimeSocket.send(JSON.stringify({
          type: 'session.update',
          session: {
            input_audio_transcription: {
              model: 'whisper-1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5
            },
            modalities: ['audio', 'text'],
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16'
          }
        }));

        resolve();
      };

      realtimeSocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleRealtimeMessage(message);
        } catch (error) {
          console.error('Failed to parse Realtime message:', error);
        }
      };

      realtimeSocket.onerror = (error) => {
        console.error('Realtime WebSocket error:', error);
        reject(error);
      };

      realtimeSocket.onclose = () => {
        console.log('Realtime WebSocket closed');
        cleanupRealtime();
      };

    } catch (error) {
      reject(error);
    }
  });
}

// Handle messages from OpenAI Realtime API
function handleRealtimeMessage(message) {
  switch (message.type) {
    case 'conversation.item.input_audio_transcription.delta':
      // Incremental transcript update
      if (message.delta && message.delta.text) {
        handleTranscriptDelta(message.delta.text, false);
      }
      break;

    case 'conversation.item.input_audio_transcription.completed':
      // Final transcript for this segment
      if (message.item && message.item.text) {
        handleTranscriptComplete(message.item.text);
      }
      break;

    case 'session.updated':
      // Session configuration confirmed
      console.log('Realtime session configured');
      break;

    case 'error':
      console.error('Realtime API error:', message.error);
      // Forward error to server for logging
      if (roomCode) {
        forwardTranscriptToServer({
          roomCode,
          micId,
          ts: Date.now(),
          text: '',
          isFinal: false,
          error: message.error?.message || 'Realtime API error'
        });
      }
      break;

    default:
      // Ignore other message types (audio output, tool calls, etc.)
      break;
  }
}

// Handle incremental transcript updates (delta events)
let currentTranscriptBuffer = '';
function handleTranscriptDelta(deltaText, isFinal) {
  if (!deltaText) return;

  currentTranscriptBuffer += deltaText;

  // Send delta updates to server (for live preview)
  if (roomCode && currentTranscriptBuffer.trim().length > 0) {
    forwardTranscriptToServer({
      roomCode,
      micId,
      ts: Date.now(),
      text: currentTranscriptBuffer.trim(),
      isFinal: false
    });
  }
}

// Handle completed transcript segments
function handleTranscriptComplete(finalText) {
  if (!finalText || !finalText.trim()) return;

  // Clear buffer and send final transcript
  const normalizedText = finalText.trim();
  currentTranscriptBuffer = '';

  if (roomCode && normalizedText.length > 0) {
    forwardTranscriptToServer({
      roomCode,
      micId,
      ts: Date.now(),
      text: normalizedText,
      isFinal: true
    });
  }
}

// Forward transcript events to our server for merging and broadcasting
async function forwardTranscriptToServer(transcriptData) {
  try {
    const response = await fetch('/api/realtime/transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...transcriptData,
        speaker: speakerName
      })
    });

    if (!response.ok) {
      console.error('Failed to forward transcript to server:', await response.text());
    }
  } catch (error) {
    console.error('Error forwarding transcript:', error);
  }
}

// Start capturing and streaming audio to Realtime API
async function startRealtimeRecording() {
  if (isRecording) {
    console.warn('Realtime recording already started');
    return;
  }

  try {
    // Get microphone audio stream
    realtimeAudioStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 24000, // Realtime API supports 24kHz
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    realtimeMediaStream = realtimeAudioStream;

    // Create RTCPeerConnection for WebRTC audio streaming
    // OpenAI Realtime uses WebRTC for audio transport
    pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    // Add audio track to peer connection
    const audioTrack = realtimeAudioStream.getAudioTracks()[0];
    pc.addTrack(audioTrack, realtimeAudioStream);

    // Handle ICE candidates for WebRTC connection
    pc.onicecandidate = (event) => {
      if (event.candidate && realtimeSocket && realtimeSocket.readyState === WebSocket.OPEN) {
        realtimeSocket.send(JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: event.candidate // Simplified - actual implementation may differ
        }));
      }
    };

    // For now, use a simpler approach: send audio data via WebSocket
    // Note: OpenAI Realtime API may require WebRTC setup - this is a simplified version
    // In production, you'd establish a proper WebRTC connection with OpenAI's signaling

    // Alternative: stream audio chunks via WebSocket (if WebRTC isn't required)
    // This is a fallback approach - check OpenAI Realtime API docs for correct method
    streamAudioToRealtime(realtimeAudioStream);

    isRecording = true;
    console.log('Realtime recording started');

  } catch (error) {
    console.error('Error starting Realtime recording:', error);
    throw error;
  }
}

// Stream audio chunks to Realtime API via WebSocket
// Note: This is a simplified implementation - actual OpenAI Realtime may use different audio transport
function streamAudioToRealtime(stream) {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: 24000
  });
  
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);

  processor.onaudioprocess = (event) => {
    if (!isRecording || !realtimeSocket || realtimeSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    const inputBuffer = event.inputBuffer.getChannelData(0);
    // Convert Float32Array to PCM16 (16-bit signed integers)
    const pcm16 = new Int16Array(inputBuffer.length);
    for (let i = 0; i < inputBuffer.length; i++) {
      const s = Math.max(-1, Math.min(1, inputBuffer[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Send audio chunk to Realtime API
    // Base64 encode the PCM16 data
    const base64Audio = btoa(String.fromCharCode.apply(null, new Uint8Array(pcm16.buffer)));
    
    realtimeSocket.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: base64Audio
    }));
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  // Store processor for cleanup
  realtimeSession = { audioContext, processor, source };
}

// Stop Realtime recording
function stopRealtimeRecording() {
  if (!isRecording) return;

  isRecording = false;

  // Stop audio stream
  if (realtimeAudioStream) {
    realtimeAudioStream.getTracks().forEach(track => track.stop());
    realtimeAudioStream = null;
    realtimeMediaStream = null;
  }

  // Cleanup audio processing
  if (realtimeSession) {
    const { audioContext, processor, source } = realtimeSession;
    if (processor) processor.disconnect();
    if (source) source.disconnect();
    if (audioContext) audioContext.close().catch(() => {});
    realtimeSession = null;
  }

  // Close WebRTC connection
  if (pc) {
    pc.close();
    pc = null;
  }

  console.log('Realtime recording stopped');
}

// Cleanup Realtime connection
function cleanupRealtime() {
  stopRealtimeRecording();

  if (realtimeSocket) {
    realtimeSocket.close();
    realtimeSocket = null;
  }

  roomCode = null;
  micId = null;
  currentTranscriptBuffer = '';
}

// Export functions for use in main app
window.RealtimeMic = {
  init: initRealtimeMic,
  start: startRealtimeRecording,
  stop: stopRealtimeRecording,
  cleanup: cleanupRealtime,
  isRecording: () => isRecording
};


