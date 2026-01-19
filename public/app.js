// === Multi-mic reliability improvements (2026-01) ===
const HEARTBEAT_INTERVAL_MS = 3000;
let micHeartbeatTimer = null;
let micStreaming = false;
let micPaused = false;

function getStableDeviceId(key = 'huddle_device_id') {
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('dev_' + Math.random().toString(16).slice(2));
      localStorage.setItem(key, id);
    }
    return id;
  } catch (e) {
    return 'dev_' + Math.random().toString(16).slice(2);
  }
}

function getMicDisplayName() {
  const ua = navigator.userAgent || '';
  const isIPad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isIPhone = /iPhone/.test(ua);
  const isAndroid = /Android/.test(ua);
  if (isIPad) return 'iPad Mic';
  if (isIPhone) return 'iPhone Mic';
  if (isAndroid) return 'Android Mic';
  return 'Browser Mic';
}

function safeSend(ws, obj) {
  try {
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(obj));
    return true;
  } catch (e) {
    return false;
  }
}

const micDeviceId = getStableDeviceId();

function startMicHeartbeat(ws, roomCode) {
  stopMicHeartbeat();
  const name = getMicDisplayName();
  console.log('[Diagnostic] Starting mic heartbeat:', { roomCode, name, deviceId: micDeviceId, wsState: ws?.readyState });

const tick = () => {
    safeSend(ws, {
      type: 'mic_heartbeat',
      roomCode,
      deviceId: micDeviceId,
      name,
      streaming: !!micStreaming,
      paused: !!micPaused,
      tsMs: Date.now()
    });
    // Only log heartbeat occasionally to reduce console spam (every 10th heartbeat ~= every 30s)
    if (micStreaming && Math.random() < 0.1) {
      console.log('[Diagnostic] Mic heartbeat sent:', { roomCode, name, streaming: micStreaming, paused: micPaused, wsState: ws?.readyState });
    }
  };

  tick();
  micHeartbeatTimer = setInterval(tick, HEARTBEAT_INTERVAL_MS);
}

function stopMicHeartbeat() {
  if (micHeartbeatTimer) {
    clearInterval(micHeartbeatTimer);
    micHeartbeatTimer = null;
  }
}

// Visibility: iOS/Android will pause mic in background/lock.
document.addEventListener('visibilitychange', () => {
  micPaused = document.visibilityState !== 'visible';
});
window.addEventListener('pagehide', () => { micPaused = true; });
window.addEventListener('pageshow', () => { micPaused = document.visibilityState !== 'visible'; });


// WebSocket connections (dual support: viewer + mic)
let ws = null; // Viewer WebSocket (primary)
let micWs = null; // Mic WebSocket (optional, when viewer enables mic)
let clientId = null;
let micClientId = null;
let currentRoom = null;
let currentRole = null;
let isMicEnabled = false; // Track if viewer has enabled mic
let isMicMuted = false; // Track if mic is muted
let isSummaryUpdating = false; // Track if summary is being updated
let userName = '';
let mediaRecorder = null;
let audioStream = null;
let lastMissedCheck = Date.now();
let adminToken = null;
let chunksSent = 0;
let chunksAcked = 0;
let lastSentTime = null;
let lastAckTime = null;
let userScrolledUp = false;
let lastTranscriptEntry = null;
let transcriptEntries = []; // viewer-side cache for export
let lastRoomState = null;
let lastTranscriptAt = 0;
let lastMicRoster = [];
let lastMicRosterSignature = null; // Signature for spam prevention
let wsConnected = false;
let lastAudioWarningAt = 0;
let lastAudioWarningReason = '';
let lastAudioWarningMsg = '';
let segmentsNextCursor = null; // paging cursor for "Load older"
const segmentDomById = new Map(); // segmentId -> element
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let useRealtimeMode = false; // Feature flag for Realtime transcription
let realtimeMicInitialized = false;
let lastTopicUpdate = null; // Track last topic update time for debouncing
let pendingTopicUpdate = null; // Store pending topic update
let saveClearPending = false; // Flag to distinguish Save & Clear from normal Read the Room
const TOPIC_UPDATE_DEBOUNCE_MS = 3000; // Don't change topic too quickly (3 seconds)
const micTranscriptEntries = []; // Cache transcript entries for mic screen
const micSegmentDomById = new Map(); // segmentId -> element for mic transcript
let justCreatedRoom = false; // Track if we just created a room (to prevent auto-redirect to viewer)

// Topic log state (viewer)
let topicLogEntries = [];
const TOPIC_LOG_MAX = 200;

// Live "What's happening now" line (viewer)
let liveNowTimer = null;

// VAD (Voice Activity Detection) state - improved version
let audioContext = null;
let analyser = null;
let gainNode = null; // Audio gain node for boosting mic signal (especially iPad/iOS)
let vadInterval = null;
const VAD_CHECK_MS = 80; // Update meter ~12.5 fps

// Detect iPad/iOS devices for device-specific audio adjustments
// Add null checks for Safari compatibility
const isIPad = /iPad/.test(navigator.userAgent || '') || 
               (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && typeof navigator.maxTouchPoints !== 'undefined' && navigator.maxTouchPoints > 1) ||
               /iPhone|iPod/.test(navigator.userAgent || '');
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || '') || 
              (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && typeof navigator.maxTouchPoints !== 'undefined' && navigator.maxTouchPoints > 1);

// If you see lots of "[inaudible]" spam, the threshold is too low (we're sending near-silence).
// iPad devices often have lower mic sensitivity, so use lower threshold
const VAD_THRESHOLD = isIPad || isIOS ? 0.008 : 0.012; // RMS threshold - raised to reduce noise/silence false positives (raise if too sensitive, lower if missing speech)
const VAD_HANG_MS = 900; // Keep "speaking" true briefly after speech stops (reduces clipped words)
let vadSpeaking = false;
let vadRms = 0;
let vadHangUntil = 0;
let vadChunkHadSpeech = false; // set true if speech was detected at any point during the current chunk window

// Pre-roll: keep last silent blob to avoid chopping first syllable
let lastBlob = null;
let lastBlobMime = '';
let lastBlobTsEnd = 0;

// MediaRecorder init/header chunk (needed for Firefox WebM fragments)
let initBlob = null;
let initBlobMime = '';
let initBlobTsEnd = 0;
let initSent = false;

// Chunk tuning:
// - Slightly longer chunks improve ASR accuracy (more context), while VAD still keeps costs down.
const TIMESLICE_MS = 5000; // 5s chunks (better phoneme continuity and word boundaries; VAD still limits cost)

// UI Elements
// Support both the unified single-page app (`index.html`) and split-route pages (`host.html`, `viewer.html`, `mic.html`)
const introScreen = document.getElementById('introScreen');
const joinScreen = document.getElementById('joinScreen') || document.getElementById('createRoomScreen');
const hostScreen = document.getElementById('hostScreen') || document.getElementById('hostRoomScreen');
const viewerScreen = document.getElementById('viewerScreen');
const micScreen = document.getElementById('micScreen');

// Intro screen elements
const introCanvas = document.getElementById('introCanvas');
const introLogo = document.getElementById('introLogo');
const activeRoomsPanel = document.getElementById('activeRoomsPanel');
const activeRooms = document.getElementById('activeRooms');
const noActiveRooms = document.getElementById('noActiveRooms');
const introCTA = document.getElementById('introCTA');
const letsHuddleBtn = document.getElementById('letsHuddleBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const skipIntro = document.getElementById('skipIntro');

const userNameInput = document.getElementById('userName');
const roomCodeInput = document.getElementById('roomCode');
const roomCodeGroup = document.getElementById('roomCodeGroup');
const roomPasscodeInput = document.getElementById('roomPasscode');
const roomPasscodeGroup = document.getElementById('roomPasscodeGroup');
const joinPasscodeInput = document.getElementById('joinPasscode');
const joinPasscodeGroup = document.getElementById('joinPasscodeGroup');
const createBtn = document.getElementById('createBtn');
const joinBtn = document.getElementById('joinBtn');
const joinError = document.getElementById('joinError');

const roleButtons = document.querySelectorAll('.role-btn, .segmented-btn');

// Host screen elements
const hostRoomCode = document.getElementById('hostRoomCode');
const hostQrCode = document.getElementById('hostQrCode');
const hostOpenRoomBtn = document.getElementById('hostOpenRoomBtn');

// Viewer elements
const viewerRoomCode = document.getElementById('viewerRoomCode');
const missedBtn = document.getElementById('missedBtn');
const catchUpBtn = document.getElementById('catchUpBtn'); // Renamed from missedBtn
const readRoomBtn = document.getElementById('readRoomBtn');
const zenModeToggle = document.getElementById('zenModeToggle');
const leaveViewerBtn = document.getElementById('leaveViewerBtn');
// Viewer mic controls (topbar + optional legacy card)
const viewerMicBtn = document.getElementById('viewerMicBtn');
const disableMicMenuBtn = document.getElementById('disableMicMenuBtn');
// Legacy role module (if present)
const roleModuleCard = document.getElementById('roleModuleCard');
const roleModuleStatus = document.getElementById('roleModuleStatus');
const roleModuleActions = document.getElementById('roleModuleActions');
const enableMicBtn = document.getElementById('enableMicBtn');
const roleModuleMicControls = document.getElementById('roleModuleMicControls');
const muteMicBtn = document.getElementById('muteMicBtn');
const disableMicBtn = document.getElementById('disableMicBtn');
const roleModuleMicChip = document.getElementById('roleModuleMicChip');
const topicMain = document.getElementById('topicMain');
const topicSub = document.getElementById('topicSub');
const statusBadge = document.getElementById('statusBadge');
const confidence = document.getElementById('confidence');
const rollingSummary = document.getElementById('rollingSummary');
const summaryUpdated = document.getElementById('summaryUpdated');
const summaryReadMore = document.getElementById('summaryReadMore');
const liveNowRow = document.getElementById('liveNowRow');
const liveNowText = document.getElementById('liveNowText');
const liveNowMeta = document.getElementById('liveNowMeta');
const analyzeTitleBtn = document.getElementById('analyzeTitleBtn');
const decisionsList = document.getElementById('decisionsList');
const nextStepsList = document.getElementById('nextStepsList');
const keyPointsList = document.getElementById('keyPointsList'); // New: Key Points list
const actionsList = document.getElementById('actionsList'); // New: Actions list (next steps)
// Admin-only edit button for decisions/next steps (Next Steps card)
const editActionsBtn = document.getElementById('editActionsBtn');
const transcriptContent = document.getElementById('transcriptContent');
const transcriptCard = document.getElementById('transcriptCard'); // New: Transcript card for Zen mode
const transcriptToggle = document.getElementById('transcriptToggle'); // New: Toggle transcript visibility
const loadOlderBtn = document.getElementById('loadOlderBtn');
const jumpLiveBtn = document.getElementById('jumpLiveBtn');
const liveBanner = document.getElementById('liveBanner');
const endSessionBtn = document.getElementById('endSessionBtn');
const catchUpPanel = document.getElementById('catchUpPanel');
const missedSummary = document.getElementById('missedSummary');
const missedPoints = document.getElementById('missedPoints');
const readRoomPanel = document.getElementById('readRoomPanel');
const readRoomSummary = document.getElementById('readRoomSummary');
const readRoomPoints = document.getElementById('readRoomPoints');
const readRoomCloseBtn = document.getElementById('readRoomCloseBtn');
const readRoomCopyBtn = document.getElementById('readRoomCopyBtn');
const readRoomSegmentNote = document.getElementById('readRoomSegmentNote');
const readRoomDecisions = document.getElementById('readRoomDecisions');
const readRoomNextSteps = document.getElementById('readRoomNextSteps');
const readRoomDecisionsSection = document.getElementById('readRoomDecisionsSection');
const readRoomNextStepsSection = document.getElementById('readRoomNextStepsSection');

// Viewer awareness dock elements
const primaryStatusLine = document.getElementById('primaryStatusLine');
const secondaryAttentionLine = document.getElementById('secondaryAttentionLine');
const coverageState = document.getElementById('coverageState');
const coverageReason = document.getElementById('coverageReason');
const degradedChip = document.getElementById('degradedChip');
const catchUpDegraded = document.getElementById('catchUpDegraded');

// Onboarding banner elements
const onboardingBanner = document.getElementById('onboardingBanner');
const dismissOnboardingBtn = document.getElementById('dismissOnboardingBtn');
const topicShiftAlert = document.getElementById('topicShiftAlert');
const topicShiftText = document.getElementById('topicShiftText');
const micHealthList = document.getElementById('micHealthList'); // New: Mic health indicator
const viewerMicBanner = document.getElementById('viewerMicBanner');
const roomLivePill = document.getElementById('roomLivePill'); // Merged room/live status
const micTranscriptCard = document.getElementById('micTranscriptCard'); // Mic transcript card
const micTranscriptContent = document.getElementById('micTranscriptContent'); // Mic transcript content
const micTranscriptToggle = document.getElementById('micTranscriptToggle'); // Mic transcript toggle

// Topic log (viewer)
const topicLogCard = document.getElementById('topicLogCard');
const topicLogToggleBtn = document.getElementById('topicLogToggleBtn');
const topicLogBody = document.getElementById('topicLogBody');
const topicLogList = document.getElementById('topicLogList');
const topicLogEmpty = document.getElementById('topicLogEmpty');

// Topic summary modal (viewer)
const topicSummaryModal = document.getElementById('topicSummaryModal');
const topicSummaryClose = document.getElementById('topicSummaryClose');
const topicSummaryTitle = document.getElementById('topicSummaryTitle');
const topicSummaryMeta = document.getElementById('topicSummaryMeta');
const topicSummaryText = document.getElementById('topicSummaryText');
const topicSummaryPoints = document.getElementById('topicSummaryPoints');

// Phase 2: share/export/prompts (viewer)
const copyMicLinkBtn = document.getElementById('copyMicLinkBtn');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const saveClearBtn = document.getElementById('saveClearBtn');
const exportBtn = document.getElementById('exportBtn');
const viewerPrompt = document.getElementById('viewerPrompt');
const viewerPromptText = document.getElementById('viewerPromptText');
const viewerPromptCopyMicLinkBtn = document.getElementById('viewerPromptCopyMicLinkBtn');

// Accessibility controls
const fontSizeToggle = document.getElementById('fontSizeToggle');
const highContrastToggle = document.getElementById('highContrastToggle');
const fontSizeDownBtn = document.getElementById('fontSizeDownBtn');
const fontSizeUpBtn = document.getElementById('fontSizeUpBtn');

// Connection status chip
const connectionStatusText = document.getElementById('connectionStatusText');
const connectionStatusDot = document.getElementById('connectionStatusDot');

// Invite modal (QR)
const btnInvite = document.getElementById('btnInvite');
const hostInviteBtn = document.getElementById('hostInviteBtn');
const inviteModal = document.getElementById('inviteModal');
const inviteClose = document.getElementById('inviteClose');

// Invite modal elements (new)
const viewerInviteLink = document.getElementById('viewerInviteLink');
const micInviteLink = document.getElementById('micInviteLink');
const copyViewerLinkBtn = document.getElementById('copyViewerLink');
const copyMicLinkModalBtn = document.getElementById('copyMicLink');
const viewerQrImg = document.getElementById('viewerQrImg');

// Invite modal elements (legacy fallback)
const inviteLinkEl = document.getElementById('inviteLink');
const copyInviteLinkBtn = document.getElementById('copyInviteLink');
const inviteQrImg = document.getElementById('inviteQrImg');

// Mic elements
const micRoomCode = document.getElementById('micRoomCode');
const micName = document.getElementById('micName');
const micStatus = document.getElementById('micStatus');
const micRoomStatus = document.getElementById('micRoomStatus');
const micRoomStatusText = document.getElementById('micRoomStatusText');
const startMicBtn = document.getElementById('startMicBtn');
const stopMicBtn = document.getElementById('stopMicBtn');
const leaveMicBtn = document.getElementById('leaveMicBtn');
const openRoomBtn = document.getElementById('openRoomBtn');
const micIndicator = document.getElementById('micIndicator');
const micIconContainer = document.querySelector('.mic-icon-container');
const micStatusDot = document.getElementById('micStatusDot');
const micPulseRings = document.getElementById('micPulseRings');
const micFeedback = document.getElementById('micFeedback');
const consentCheckbox = document.getElementById('consentCheckbox');
const consentBox = document.getElementById('consentBox');
const consentError = document.getElementById('consentError');
const httpsWarning = document.getElementById('httpsWarning');
const micStats = document.getElementById('micStats');
const chunksSentSpan = document.getElementById('chunksSent');
const lastSentSpan = document.getElementById('lastSent');
const micWarningBanner = document.getElementById('micWarningBanner');
const micWarningText = document.getElementById('micWarningText');

// Status bars (truth indicators)
const viewerWsDot = document.getElementById('viewerWsDot');
const viewerWsStatus = document.getElementById('viewerWsStatus');
const viewerMicsStatus = document.getElementById('viewerMicsStatus');
const viewerLastTranscript = document.getElementById('viewerLastTranscript');
const viewerWarnItem = document.getElementById('viewerWarnItem');
const viewerWarnText = document.getElementById('viewerWarnText');

const micWsDot = document.getElementById('micWsDot');
const micWsStatus = document.getElementById('micWsStatus');
const micSentStatus = document.getElementById('micSentStatus');
const micAckStatus = document.getElementById('micAckStatus');
const micLastAck = document.getElementById('micLastAck');
const micWarnItem = document.getElementById('micWarnItem');
const micWarnText = document.getElementById('micWarnText');
// Mic inline stats (mic page)
const micAckInline = document.getElementById('micAckInline');
const micLastAckInline = document.getElementById('micLastAckInline');

// Role selection
if (roleButtons && roleButtons.length > 0) {
    roleButtons.forEach(btn => {
        if (!btn) return;
        btn.addEventListener('click', () => {
            roleButtons.forEach(b => {
                if (b && b.classList) b.classList.remove('active');
            });
            if (btn && btn.classList) btn.classList.add('active');
            roleButtons.forEach(b => {
                if (b) b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
            });
            
            const role = btn.dataset?.role;
            if (role === 'mic') {
                if (roomCodeGroup) roomCodeGroup.style.display = 'block';
                if (roomPasscodeGroup) roomPasscodeGroup.style.display = 'none';
                if (joinPasscodeGroup) joinPasscodeGroup.style.display = 'block';
                if (createBtn) createBtn.style.display = 'none';
                if (joinBtn) joinBtn.style.display = 'block';
            } else {
                if (roomCodeGroup) roomCodeGroup.style.display = 'none';
                if (roomPasscodeGroup) roomPasscodeGroup.style.display = 'block';
                if (joinPasscodeGroup) joinPasscodeGroup.style.display = 'none';
                if (createBtn) createBtn.style.display = 'block';
                if (joinBtn) joinBtn.style.display = 'none';
            }
        });
    });
}

// Initial role UI state (default Viewer)
try {
    const activeRoleBtn = Array.from(roleButtons || []).find(b => b && b.classList && b.classList.contains('active'));
    const role = activeRoleBtn?.dataset?.role || 'viewer';
    if (role === 'mic') {
        if (roomCodeGroup) roomCodeGroup.style.display = 'block';
        if (roomPasscodeGroup) roomPasscodeGroup.style.display = 'none';
        if (joinPasscodeGroup) joinPasscodeGroup.style.display = 'block';
        if (createBtn) createBtn.style.display = 'none';
        if (joinBtn) joinBtn.style.display = 'block';
    } else {
        if (roomCodeGroup) roomCodeGroup.style.display = 'none';
        if (roomPasscodeGroup) roomPasscodeGroup.style.display = 'block';
        if (joinPasscodeGroup) joinPasscodeGroup.style.display = 'none';
        if (createBtn) createBtn.style.display = 'block';
        if (joinBtn) joinBtn.style.display = 'none';
    }
} catch {}

// Create room
if (createBtn) {
    createBtn.addEventListener('click', () => {
        const name = userNameInput?.value?.trim() || '';
        if (!name) {
            showError('Please enter your name');
            return;
        }

        userName = name;
        currentRole = 'viewer';
        try {
            localStorage.setItem('roombrief_name', name);
        } catch (e) {}

        connectAndCreate();
    });
}

// Join room
if (joinBtn) {
    joinBtn.addEventListener('click', () => {
        const name = userNameInput?.value?.trim() || '';
        const code = roomCodeInput?.value?.trim().toUpperCase() || '';
        const passcode = joinPasscodeInput?.value?.trim() || null;
        
        // First click: show room code input if not visible
        if (roomCodeGroup && roomCodeGroup.style.display === 'none') {
            roomCodeGroup.style.display = 'block';
            if (createBtn) createBtn.style.display = 'none';
            if (roomCodeInput) roomCodeInput.focus();
            return;
        }
        
        // Second click: actually join
        if (!name) {
            showError('Please enter your name');
            return;
        }
        
        if (!code || code.length !== 6) {
            showError('Please enter a valid 6-character room code');
            return;
        }
        
        userName = name;
        currentRole = 'viewer'; // Join as viewer by default, can switch to mic later
        connectAndJoin(code, passcode);
    });
}

function showError(message) {
    if (joinError) {
        joinError.textContent = message;
        if (joinError.classList) joinError.classList.add('show');
        setTimeout(() => {
            if (joinError && joinError.classList) joinError.classList.remove('show');
        }, 5000);
    }
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        wsConnected = true;
        reconnectAttempts = 0; // Reset on successful connection
        updateStatusBars();
    };
    
    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleMessage(message);
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
            showError('Received invalid message from server.');
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        showError('Connection error. Please refresh the page.');
    };
    
    ws.onclose = () => {
        console.log('WebSocket closed');
        wsConnected = false;
        updateStatusBars();
        
        if (currentRoom && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Exponential backoff, max 30s
            reconnectAttempts++;
            
            console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms...`);
            
        setTimeout(() => {
                // Reconnect to the *same* room/role (don't accidentally create a new room)
                const passcode = getRoomPasscode(currentRoom);
                if (currentRole === 'viewer' && currentRoom) {
                    connectAndJoinAsViewer(currentRoom, passcode);
                } else if (currentRole === 'mic' && currentRoom) {
                    connectAndJoin(currentRoom, passcode);
                }
            }, delay);
        } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            showError('Connection lost after multiple attempts. Please refresh the page.');
        }
    };
}

function fmtAge(msAgo) {
    if (msAgo === null || msAgo === undefined) return '—';
    if (msAgo < 1000) return 'now';
    const s = Math.floor(msAgo / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
}

function setDot(dotEl, ok, textEl, text) {
    if (textEl && typeof text === 'string') textEl.textContent = text;
    if (!dotEl) return;
    dotEl.classList.remove('status-ok', 'status-bad');
    if (ok === true) dotEl.classList.add('status-ok');
    else if (ok === false) dotEl.classList.add('status-bad');
}

function updateStatusBars() {
    const now = Date.now();
    // Viewer
    if (viewerWsStatus && viewerWsDot) {
        setDot(viewerWsDot, wsConnected, viewerWsStatus, wsConnected ? 'connected' : (currentRoom ? 'reconnecting…' : 'disconnected'));
    }
    if (connectionStatusText) {
        if (wsConnected) {
            connectionStatusText.textContent = 'Live';
        } else if (currentRoom) {
            connectionStatusText.textContent = 'Reconnecting…';
        } else {
            connectionStatusText.textContent = 'Offline';
        }
    }
    const connectionChip = connectionStatusText?.closest('.connection-chip');
    if (connectionChip) {
        connectionChip.classList.toggle('is-reconnecting', !wsConnected && !!currentRoom);
        connectionChip.classList.toggle('is-offline', !wsConnected && !currentRoom);
    }
    if (viewerMicsStatus) {
        viewerMicsStatus.textContent = String((lastMicRoster || []).length || 0);
    }
    if (viewerLastTranscript) {
        const age = lastTranscriptAt ? (now - lastTranscriptAt) : null;
        viewerLastTranscript.textContent = lastTranscriptAt ? fmtAge(age) + ' ago' : '—';
    }

    // Mic
    if (micWsStatus && micWsDot) {
        setDot(micWsDot, wsConnected, micWsStatus, wsConnected ? 'connected' : (currentRoom ? 'reconnecting…' : 'disconnected'));
    }
    if (micSentStatus) micSentStatus.textContent = String(chunksSent || 0);
    if (micAckStatus) micAckStatus.textContent = String(chunksAcked || 0);
    if (micLastAck) {
        const age = lastAckTime ? (now - lastAckTime) : null;
        micLastAck.textContent = lastAckTime ? fmtAge(age) + ' ago' : '—';
    }

    // Warnings
    const warnFresh = lastAudioWarningAt && (now - lastAudioWarningAt) < 30000;
    const warnText = lastAudioWarningMsg || '';
    if (viewerWarnItem && viewerWarnText) {
        if (warnFresh && warnText) {
            viewerWarnItem.style.display = 'inline-flex';
            viewerWarnText.textContent = warnText;
        } else {
            viewerWarnItem.style.display = 'none';
        }
    }
    if (micWarnItem && micWarnText) {
        if (warnFresh && warnText) {
            micWarnItem.style.display = 'inline-flex';
            micWarnText.textContent = warnText;
        } else {
            micWarnItem.style.display = 'none';
        }
    }
}

// Phase 2: deep-link auto-join (?room=CB4F6D&role=mic)
function applyDeepLink() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        const room = (params.get('room') || '').trim().toUpperCase();
        const role = (params.get('role') || '').trim().toLowerCase();
        const auto = (params.get('auto') || '').trim() === '1';

        if (!room || room.length !== 6) return;
        if (role !== 'mic' && role !== 'viewer') return;

        roomCodeInput.value = room;

        roleButtons.forEach(b => b.classList.remove('active'));
        const btn = Array.from(roleButtons).find(b => b.dataset.role === role);
        if (btn) btn.classList.add('active');
        roleButtons.forEach(b => b.setAttribute('aria-selected', b === btn ? 'true' : 'false'));

        if (role === 'mic') {
            roomCodeGroup.style.display = 'block';
            createBtn.style.display = 'none';
            joinBtn.style.display = 'block';
            // Auto-join if we already have a name (stored) and auto=1.
            if (auto) {
                setTimeout(() => {
                    const name = userNameInput.value.trim();
                    if (name) {
                        joinBtn.click();
                    }
                }, 250);
            }
        } else {
            // Viewer deep-link: we just prefill the code (viewer flow is still "create").
            roomCodeGroup.style.display = 'block';
        }
    } catch {}
}

// Route detection for /host, /viewer, /mic
function detectRouteAndInit() {
    const pathname = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const room = (params.get('room') || '').trim().toUpperCase();
    const passcode = (params.get('pass') || params.get('p') || '').trim();
    
    if (pathname === '/host') {
        // Host route: auto-create room and auto-join as mic
        // Hide join screen, will auto-create room on load
        if (joinScreen) joinScreen.style.display = 'none';
        // Will handle in initialization
        return { route: 'host', room: null };
    } else if (pathname === '/viewer') {
        // Viewer route: join as viewer (no mic permission)
        if (!room || room.length !== 6) {
            showError('Invalid room code');
            return null;
        }
        if (joinScreen) joinScreen.style.display = 'none';
        return { route: 'viewer', room, passcode };
    } else if (pathname === '/mic') {
        // Mic route: join as mic (existing behavior)
        if (!room || room.length !== 6) {
            showError('Invalid room code');
            return null;
        }
        return { route: 'mic', room, passcode };
    }
    
    // Default: use existing deep-link logic
    applyDeepLink();
    return null;
}

// Initialize intro screen
function initializeIntroScreen() {
    if (!introScreen) return;
    
    // Hide join screen initially
    if (joinScreen) joinScreen.classList.remove('active');
    
    // Load active rooms
    loadActiveRooms();
    
    // Handle "Let's Huddle" button
    if (letsHuddleBtn) {
        letsHuddleBtn.addEventListener('click', () => {
            // Hide intro, show join screen with all options visible
            if (introScreen) introScreen.classList.remove('active');
            if (joinScreen) {
                joinScreen.classList.add('active');
                // Show all options: Create Room and Join Room buttons both visible
                if (roomCodeGroup) roomCodeGroup.style.display = 'none';
                if (createBtn) createBtn.style.display = 'block';
                if (joinBtn) joinBtn.style.display = 'block';
            }
        });
    }
    
    // Handle "Join Room" button on intro screen
    if (joinRoomBtn) {
        joinRoomBtn.addEventListener('click', () => {
            // Hide intro, show join screen in join mode
            if (introScreen) introScreen.classList.remove('active');
            if (joinScreen) {
                joinScreen.classList.add('active');
                if (roomCodeGroup) roomCodeGroup.style.display = 'block';
                if (createBtn) createBtn.style.display = 'none';
                if (joinBtn) joinBtn.style.display = 'block';
                if (roomCodeInput) roomCodeInput.focus();
            }
        });
    }
    
    // Handle skip intro (accessibility)
    if (skipIntro) {
        skipIntro.addEventListener('click', (e) => {
            e.preventDefault();
            if (introScreen) introScreen.classList.remove('active');
            if (joinScreen) joinScreen.classList.add('active');
        });
    }
}

// Load and display active rooms
async function loadActiveRooms() {
    if (!activeRooms || !noActiveRooms) return;
    
    try {
        const response = await fetch('/api/rooms');
        const data = await response.json();
        
        if (data.rooms && data.rooms.length > 0) {
            noActiveRooms.style.display = 'none';
            activeRooms.innerHTML = '';
            
            data.rooms.slice(0, 5).forEach((room, index) => { // Show max 5 rooms
                const roomCard = document.createElement('div');
                roomCard.className = 'active-room-card';
                
                const roomInfo = document.createElement('div');
                roomInfo.className = 'active-room-info';
                
                const code = document.createElement('div');
                code.className = 'active-room-code';
                code.textContent = room.code;
                
                const meta = document.createElement('div');
                meta.className = 'active-room-meta';
                const parts = [];
                if (room.micCount > 0) parts.push(`${room.micCount} mic${room.micCount !== 1 ? 's' : ''}`);
                if (room.viewerCount > 0) parts.push(`${room.viewerCount} viewer${room.viewerCount !== 1 ? 's' : ''}`);
                meta.textContent = parts.length > 0 ? parts.join(', ') : 'Empty';
                
                // Avatar cluster
                const avatarCluster = document.createElement('div');
                avatarCluster.className = 'active-room-avatar-cluster';
                const participantCount = (room.micCount || 0) + (room.viewerCount || 0);
                for (let i = 0; i < Math.min(participantCount, 3); i++) {
                    const avatar = document.createElement('div');
                    avatar.className = 'active-room-avatar';
                    avatarCluster.appendChild(avatar);
                }
                meta.appendChild(avatarCluster);
                
                roomInfo.appendChild(code);
                roomInfo.appendChild(meta);
                
                const joinBtn = document.createElement('button');
                joinBtn.className = 'btn btn-join-room-card';
                joinBtn.textContent = 'Join';
                joinBtn.onclick = (e) => {
                    e.stopPropagation();
                    // Navigate to join screen with room code
                    if (introScreen) introScreen.classList.remove('active');
                    if (joinScreen) {
                        joinScreen.classList.add('active');
                        if (roomCodeInput) {
                            roomCodeInput.value = room.code;
                            roomCodeInput.focus();
                        }
                        if (roomCodeGroup) roomCodeGroup.style.display = 'block';
                        if (createBtn) createBtn.style.display = 'none';
                        if (joinBtn) document.getElementById('joinBtn').style.display = 'block';
                    }
                };
                
                roomCard.appendChild(roomInfo);
                roomCard.appendChild(joinBtn);
                activeRooms.appendChild(roomCard);
                
                // Stagger animation
                setTimeout(() => {
                    roomCard.classList.add('visible');
                }, index * 100);
            });
        } else {
            noActiveRooms.style.display = 'block';
            activeRooms.innerHTML = '';
        }
    } catch (error) {
        console.error('Failed to load active rooms:', error);
        if (noActiveRooms) noActiveRooms.style.display = 'block';
    }
}

// Initialize intro screen if it exists
// BUT: Skip intro if we're on a specific route (/viewer, /mic, /host)
let routeInfo = null;
const pathname = window.location.pathname;
const shouldSkipIntro = pathname === '/viewer' || pathname === '/mic' || pathname === '/host';

if (introScreen && !shouldSkipIntro) {
    // Show intro only on / (root) or other non-route pages
    initializeIntroScreen();
} else {
    // No intro screen OR we're on a route that should skip intro
    if (introScreen && shouldSkipIntro) {
        // Hide intro screen if we're on a route page
        introScreen.classList.remove('active');
    }
    // Proceed with normal route detection
    routeInfo = detectRouteAndInit();
}

// Get or create deviceId (stable device identity)
function getDeviceId() {
    try {
        let deviceId = localStorage.getItem('huddle_deviceId');
        if (!deviceId) {
            // Generate UUID-like ID
            deviceId = 'device-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('huddle_deviceId', deviceId);
        }
        return deviceId;
    } catch (e) {
        // Fallback if localStorage unavailable
        return 'device-' + Date.now().toString(36);
    }
}

const deviceId = getDeviceId();

// Initialize particle loader (mount once, reuse)
let particleLoader = null;
function getParticleLoader() {
    if (!particleLoader && window.HuddleParticleLoader) {
        particleLoader = window.HuddleParticleLoader.mount();
    }
    return particleLoader;
}

// Minimum display time for loader - animation needs:
// 0.9s drift + 3.2s settle + 2.5s pulse = 6.6s total
// Add buffer for image loading and smooth completion
const LOADER_MIN_MS = 7500; // 7.5 seconds to ensure logo forms and pulses
const LOADER_FADE_MS = 220;

// Helper function to show loader with minimum display time
function showLoaderWithMinDuration(loader) {
    if (!loader) return null;
    const t0 = performance.now();
    loader.show();
    
    // Return function to hide with minimum delay, waiting for animation to complete
    return function hideLoaderMinDelay() {
        if (!loader) return;
        let hidden = false;
        
        const hideWhenReady = () => {
            if (hidden || !loader) return;
            hidden = true;
            if (typeof loader.hide === 'function') {
                loader.hide();
            }
        };
        
        // Poll every 100ms for animation completion
        const pollInterval = setInterval(() => {
            if (!loader) {
                clearInterval(pollInterval);
                return;
            }
            const elapsed = performance.now() - t0;
            // Hide if animation is done OR minimum time has passed
            if (loader.doneOnce || elapsed >= LOADER_MIN_MS) {
                clearInterval(pollInterval);
                hideWhenReady();
            }
        }, 100);
        
        // Fallback: ensure we hide after maximum wait time (safety net)
        setTimeout(() => {
            clearInterval(pollInterval);
            hideWhenReady();
        }, LOADER_MIN_MS + 1000);
    };
}

// Debug helper to manually show loader for demo
if (typeof window !== 'undefined') {
    window.huddleDemoLoader = function() {
        const loader = window.HuddleParticleLoader?.mount?.();
        if (loader) {
            loader.show();
            setTimeout(() => loader.hide(), 3000);
            console.log('Loader shown for 3 seconds. Animation should be visible!');
        } else {
            console.error('HuddleParticleLoader not available');
        }
    };
}

// Initialize routes (/host, /viewer, /mic)
async function initializeRoute() {
    if (!routeInfo) return;
    
    // Set viewer opened timestamp for connecting grace period
    if (routeInfo.route === 'viewer') {
        window.__viewerOpenedAt = Date.now();
    }
    
    if (routeInfo.route === 'host') {
        // /host route: create room via POST /api/rooms, then show host UI (invite + open viewer)
        try {
            const savedName = localStorage.getItem('roombrief_name') || 'Host';
            userName = savedName;
            if (userNameInput) userNameInput.value = savedName;
            
            // Create room via API
            const response = await fetch('/api/rooms', { method: 'POST' });
            if (!response.ok) {
                throw new Error('Failed to create room');
            }
            const data = await response.json();
            const roomCode = data.roomId;
            
            currentRole = 'host';
            currentRoom = roomCode;
            showHostScreen();
        } catch (error) {
            console.error('Host initialization error:', error);
            showError('Failed to create room. Please refresh.');
        }
    } else if (routeInfo.route === 'viewer') {
        // /viewer route: join as viewer (no mic permission)
        const savedName = localStorage.getItem('roombrief_name') || 'Viewer';
        userName = savedName;
        if (userNameInput) userNameInput.value = savedName;
        
        currentRole = 'viewer';
        currentRoom = routeInfo.room;
        if (routeInfo.passcode) setRoomPasscode(routeInfo.room, routeInfo.passcode);
        connectAndJoinAsViewer(routeInfo.room, routeInfo.passcode || getRoomPasscode(routeInfo.room));
    } else if (routeInfo.route === 'mic') {
        // /mic route: join as mic (existing behavior)
        const savedName = localStorage.getItem('roombrief_name') || 'Mic';
        userName = savedName;
        if (userNameInput) userNameInput.value = savedName;
        
        currentRole = 'mic';
        currentRoom = routeInfo.room;
        if (routeInfo.passcode) setRoomPasscode(routeInfo.room, routeInfo.passcode);
        connectAndJoin(routeInfo.room, routeInfo.passcode || getRoomPasscode(routeInfo.room));
    }
}

// Intro is disabled; initialize routes immediately.
if (routeInfo && (routeInfo.route === 'host' || routeInfo.route === 'viewer' || routeInfo.route === 'mic')) {
    initializeRoute();
} else {
    // No route detected, show join screen if present.
    const joinScreenEl = document.getElementById('joinScreen');
    if (joinScreenEl && !joinScreenEl.classList.contains('active')) {
        joinScreenEl.classList.add('active');
    }
}

// Remember name for low-friction home use
try {
    const savedName = localStorage.getItem('roombrief_name');
    if (savedName && !userNameInput.value) userNameInput.value = savedName;
    userNameInput.addEventListener('input', () => {
        localStorage.setItem('roombrief_name', userNameInput.value.trim());
    });
} catch {}

function getRoomPasscode(roomCode) {
    if (!roomCode) return null;
    try {
        return localStorage.getItem(`huddle_room_passcode_${String(roomCode).toUpperCase()}`) || null;
    } catch {
        return null;
    }
}

function setRoomPasscode(roomCode, passcode) {
    if (!roomCode) return;
    const key = `huddle_room_passcode_${String(roomCode).toUpperCase()}`;
    try {
        if (passcode && String(passcode).trim()) {
            localStorage.setItem(key, String(passcode).trim());
        } else {
            localStorage.removeItem(key);
        }
    } catch {}
}

function getRoomAdminToken(roomCode) {
    if (!roomCode) return null;
    try {
        return localStorage.getItem(`huddle_room_admin_token_${String(roomCode).toUpperCase()}`) || null;
    } catch {
        return null;
    }
}

function setRoomAdminToken(roomCode, token) {
    if (!roomCode) return;
    const key = `huddle_room_admin_token_${String(roomCode).toUpperCase()}`;
    try {
        if (token && String(token).trim()) {
            localStorage.setItem(key, String(token).trim());
        } else {
            localStorage.removeItem(key);
        }
    } catch {}
}

async function getShareOrigin() {
    const { protocol, hostname, port } = window.location;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (!isLocalhost) return window.location.origin;

    try {
        const r = await fetch('/api/network');
        const j = await r.json();
        if (j && j.lanIp && typeof j.lanIp === 'string' && j.lanIp.trim()) {
            const p = port ? `:${port}` : '';
            return `${protocol}//${j.lanIp.trim()}${p}`;
        }
        // Fallback: if LAN IP isn't available, try configured public base URL (e.g., Cloudflare Tunnel)
        if (j && j.publicBaseUrl && typeof j.publicBaseUrl === 'string' && j.publicBaseUrl.trim()) {
            return j.publicBaseUrl.trim();
        }
    } catch (error) {
        console.warn('Failed to fetch network info, using current origin:', error);
    }
    return window.location.origin;
}

// ============================================================
// Topic Log (Viewer)
// ============================================================

function fmtTime(ts) {
    const d = new Date(Number(ts || Date.now()));
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

function setTopicLogExpanded(expanded) {
    if (!topicLogBody || !topicLogToggleBtn) return;
    topicLogBody.style.display = expanded ? 'block' : 'none';
    topicLogToggleBtn.textContent = expanded ? 'Hide' : 'Show';
    topicLogToggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    try {
        localStorage.setItem('huddle_topicLog_expanded', expanded ? '1' : '0');
    } catch {}
}

function renderTopicLog() {
    if (!topicLogList || !topicLogEmpty) return;
    topicLogList.innerHTML = '';

    const items = (topicLogEntries || []).slice(-TOPIC_LOG_MAX).reverse(); // newest first
    topicLogEmpty.style.display = items.length ? 'none' : 'block';

    for (let i = 0; i < items.length; i++) {
        const e = items[i];
        const row = document.createElement('div');
        row.className = 'topic-log-item';

        // Compute window [startTs, endTs] where start is this topic change, end is next newer change (or now)
        const startTs = Number(e.ts || 0) || Date.now();
        const endTs = (i === 0)
            ? Date.now()
            : (Number(items[i - 1]?.ts || 0) || Date.now());
        row.dataset.start = String(startTs);
        row.dataset.end = String(Math.max(endTs, startTs + 1));

        const left = document.createElement('div');
        left.className = 'topic-log-left';

        const topLine = document.createElement('div');
        topLine.className = 'topic-log-title';
        const from = (e.fromTopic || '').trim();
        const to = (e.toTopic || e.topic || '').trim();
        topLine.textContent = from ? `${from} → ${to || '—'}` : (to || '—');

        const metaLine = document.createElement('div');
        metaLine.className = 'topic-log-meta';
        const sub = (e.toSubtopic || e.subtopic || '').trim();
        const status = (e.toStatus || e.status || '').trim();
        const bits = [];
        if (status) bits.push(status);
        if (sub) bits.push(sub);
        metaLine.textContent = bits.join(' · ');

        left.appendChild(topLine);
        left.appendChild(metaLine);

        const right = document.createElement('div');
        right.className = 'topic-log-right';
        const conf = typeof e.confidence === 'number' ? `${Math.round(e.confidence * 100)}%` : '';
        right.textContent = `${fmtTime(e.ts)}${conf ? ` · ${conf}` : ''}`;

        row.appendChild(left);
        row.appendChild(right);
        row.addEventListener('click', async () => {
            await openTopicSummaryModal({
                topic: (e.toTopic || e.topic || '').trim(),
                subtopic: (e.toSubtopic || e.subtopic || '').trim(),
                status: (e.toStatus || e.status || '').trim(),
                start: startTs,
                end: Math.max(endTs, startTs + 1)
            });
        });
        topicLogList.appendChild(row);
    }
}

function openModal(modalEl) {
    if (modalEl) modalEl.classList.remove('hidden');
}

function closeModal(modalEl) {
    if (modalEl) modalEl.classList.add('hidden');
}

async function openTopicSummaryModal({ topic, subtopic, status, start, end }) {
    if (!topicSummaryModal || !topicSummaryText || !topicSummaryTitle || !topicSummaryPoints) return;
    if (!currentRoom) {
        showToast('No room yet', 'warn');
        return;
    }
    if (topicSummaryTitle) topicSummaryTitle.textContent = topic ? `Topic: ${topic}` : 'Topic summary';
    if (topicSummaryMeta) {
        const bits = [];
        if (status) bits.push(status);
        if (subtopic) bits.push(subtopic);
        bits.push(`${fmtTime(start)}–${fmtTime(end)}`);
        topicSummaryMeta.textContent = bits.join(' · ');
    }
    topicSummaryText.textContent = 'Loading…';
    topicSummaryPoints.innerHTML = '';
    openModal(topicSummaryModal);

    try {
        let url = `/api/room/${encodeURIComponent(currentRoom)}/topic-summary?start=${encodeURIComponent(String(start))}&end=${encodeURIComponent(String(end))}`;
        const passcode = getRoomPasscode(currentRoom);
        if (passcode) url += `&pass=${encodeURIComponent(passcode)}`;
        const r = await fetch(url);
        if (!r.ok) {
            let errorMsg = `HTTP ${r.status}`;
            try {
                const errorJson = await r.json();
                if (errorJson.error) errorMsg = errorJson.error;
            } catch {
                // Not JSON, use status text
                errorMsg = r.statusText || errorMsg;
            }
            throw new Error(errorMsg);
        }
        const j = await r.json();

        topicSummaryText.textContent = String(j.summary || '').trim() || 'No summary available.';
        const points = Array.isArray(j.key_points) ? j.key_points : [];
        if (points.length === 0) {
            const li = document.createElement('li');
            li.className = 'empty-state';
            li.textContent = 'No key points for this topic window.';
            topicSummaryPoints.appendChild(li);
        } else {
            for (const p of points.slice(0, 5)) { // Increased from 3 to 5 to match server change
                const li = document.createElement('li');
                li.textContent = p;
                topicSummaryPoints.appendChild(li);
            }
        }
    } catch (e) {
        console.error('Failed to load topic summary:', e);
        const errorMsg = e?.message || 'Unknown error';
        topicSummaryText.textContent = `Could not load topic summary: ${errorMsg}`;
        const li = document.createElement('li');
        li.className = 'empty-state';
        if (errorMsg.includes('403') || errorMsg.includes('passcode')) {
            li.textContent = 'Tip: This room requires a passcode. Make sure you entered it correctly.';
        } else if (errorMsg.includes('404') || errorMsg.includes('not found')) {
            li.textContent = 'Tip: Room not found. Make sure you are connected to the correct room.';
        } else if (errorMsg.includes('400') || errorMsg.includes('Invalid')) {
            li.textContent = 'Tip: Invalid time range. Try selecting a different topic window.';
        } else {
            li.textContent = 'Tip: Ensure the server is running and try again.';
        }
        topicSummaryPoints.appendChild(li);
    }
}

if (topicSummaryClose) topicSummaryClose.addEventListener('click', () => closeModal(topicSummaryModal));
if (topicSummaryModal) {
    topicSummaryModal.addEventListener('click', (e) => {
        if (e.target === topicSummaryModal) closeModal(topicSummaryModal);
    });
}

function addTopicLogEntry(entry) {
    if (!entry) return;
    topicLogEntries.push({
        ts: entry.ts || Date.now(),
        fromTopic: entry.fromTopic || '',
        toTopic: entry.toTopic || entry.topic || '',
        confidence: entry.confidence,
        fromSubtopic: entry.fromSubtopic || '',
        toSubtopic: entry.toSubtopic || entry.subtopic || '',
        fromStatus: entry.fromStatus || '',
        toStatus: entry.toStatus || entry.status || '',
        source: entry.source || 'ws'
    });
    if (topicLogEntries.length > TOPIC_LOG_MAX) {
        topicLogEntries.splice(0, topicLogEntries.length - TOPIC_LOG_MAX);
    }
    renderTopicLog();
}

async function loadTopicHistory(roomCode) {
    if (!roomCode || !topicLogList) return;
    try {
        // Append passcode if room is passcode-protected
        const passcode = getRoomPasscode(roomCode);
        let url = `/api/room/${encodeURIComponent(roomCode)}/topic-history`;
        if (passcode) url += `?pass=${encodeURIComponent(passcode)}`;
        const r = await fetch(url);
        if (!r.ok) return;
        const j = await r.json();
        if (j && Array.isArray(j.history)) {
            topicLogEntries = j.history.slice(-TOPIC_LOG_MAX);
            renderTopicLog();
        }
    } catch {}
}

// Wire toggle (viewer-only)
if (topicLogToggleBtn) {
    topicLogToggleBtn.addEventListener('click', () => {
        const expanded = topicLogBody && topicLogBody.style.display !== 'block';
        setTopicLogExpanded(Boolean(expanded));
    });
    const expanded = (localStorage.getItem('huddle_topicLog_expanded') || '0') === '1';
    setTopicLogExpanded(expanded);
}

async function buildMicJoinLink(roomCode) {
    const origin = await getShareOrigin();
    const url = new URL('/mic', origin);
    url.searchParams.set('room', roomCode);
    const passcode = getRoomPasscode(roomCode);
    if (passcode) url.searchParams.set('pass', passcode);
    return url.toString();
}

async function buildViewerLink(roomCode) {
    if (!roomCode) {
        throw new Error('Room code is required');
    }
    const origin = await getShareOrigin();
    if (!origin || typeof origin !== 'string') {
        // Fallback to current origin if getShareOrigin fails
        const fallbackOrigin = window.location.origin;
        console.warn('getShareOrigin returned invalid value, using fallback:', fallbackOrigin);
        const url = new URL('/viewer', fallbackOrigin);
        url.searchParams.set('room', roomCode);
        return url.toString();
    }
    try {
        const url = new URL('/viewer', origin);
        url.searchParams.set('room', roomCode);
        const passcode = getRoomPasscode(roomCode);
        if (passcode) url.searchParams.set('pass', passcode);
        return url.toString();
    } catch (error) {
        // If origin is invalid, fallback to current origin
        console.warn('Invalid origin from getShareOrigin, using fallback:', error);
        const fallbackOrigin = window.location.origin;
        const url = new URL('/viewer', fallbackOrigin);
        url.searchParams.set('room', roomCode);
        const passcode = getRoomPasscode(roomCode);
        if (passcode) url.searchParams.set('pass', passcode);
        return url.toString();
    }
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard', 'info');
    } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand('copy');
            showToast('Copied to clipboard', 'info');
        } catch {
            showToast('Copy failed — please copy manually', 'warn');
        } finally {
            ta.remove();
        }
    }
}

function downloadFile(filename, content, mimeType = 'text/plain') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
}

function exportRoom() {
    if (!currentRoom || !lastRoomState) {
        showToast('Nothing to export yet', 'warn');
        return;
    }

    const now = new Date();
    const room = lastRoomState;
    const summary = room.summary || {};

    const payload = {
        exportedAt: now.toISOString(),
        roomCode: room.code || currentRoom,
        topic: summary.topic || '',
        subtopic: summary.subtopic || '',
        status: summary.status || '',
        confidence: summary.confidence,
        rolling_summary: summary.rolling_summary || '',
        decisions: summary.decisions || [],
        next_steps: summary.next_steps || [],
        transcript: transcriptEntries.slice(-1000)
    };

    // Phase 2.1 export: Markdown grouped into 5-minute time blocks
    const blockMs = 5 * 60 * 1000;
    const buckets = new Map(); // bucketStartMs -> entries[]

    for (const t of payload.transcript) {
        const ts = Number(t.ts || 0);
        if (!ts) continue;
        const bucketStart = Math.floor(ts / blockMs) * blockMs;
        if (!buckets.has(bucketStart)) buckets.set(bucketStart, []);
        buckets.get(bucketStart).push(t);
    }

    const bucketStarts = Array.from(buckets.keys()).sort((a, b) => a - b);
    const md = [];

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');

    md.push(`# Huddle (${yyyy}-${mm}-${dd} ${hh}:${min})`);
    md.push(``);
    md.push(`**Room:** ${payload.roomCode}`);
    md.push(``);
    md.push(`## Topic`);
    md.push(`- **Topic:** ${payload.topic || '(none)'}`);
    if (payload.subtopic) md.push(`- **Subtopic:** ${payload.subtopic}`);
    md.push(`- **Status:** ${payload.status || 'Deciding'} (${Math.round((payload.confidence || 0) * 100)}%)`);
    md.push(``);
    md.push(`## Summary`);
    md.push(payload.rolling_summary || '_No summary yet._');
    md.push(``);
    md.push(`## Decisions`);
    if (payload.decisions.length) payload.decisions.forEach(d => md.push(`- ${d}`));
    else md.push(`- _None_`);
    md.push(``);
    md.push(`## Next steps`);
    if (payload.next_steps.length) payload.next_steps.forEach(s => md.push(`- ${s}`));
    else md.push(`- _None_`);
    md.push(``);
    md.push(`## Transcript`);
    if (bucketStarts.length === 0) {
        md.push(`_No transcript yet._`);
    } else {
        for (const startMs of bucketStarts) {
            const endMs = startMs + blockMs;
            const startLabel = new Date(startMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const endLabel = new Date(endMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            md.push(`### ${startLabel}–${endLabel}`);
            for (const t of buckets.get(startMs)) {
                const tsLabel = t.ts ? new Date(t.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                md.push(`- **${t.speaker}:** ${t.text}${tsLabel ? ` _(at ${tsLabel})_` : ''}`);
            }
            md.push(``);
        }
    }

    const fileName = `Huddle_${yyyy}-${mm}-${dd}_${hh}${min}.md`;
    downloadFile(fileName, md.join('\n'), 'text/markdown');
    // Keep JSON for debugging (optional)
    downloadFile(`Huddle_${yyyy}-${mm}-${dd}_${hh}${min}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

function updateViewerPrompt() {
    if (!viewerPrompt || !viewerPromptText) return;
    if (!currentRoom || currentRole !== 'viewer') {
        viewerPrompt.style.display = 'none';
        return;
    }

    const micCount = Array.isArray(lastMicRoster) ? lastMicRoster.length : 0;
    const secondsSinceTranscript = lastTranscriptAt ? Math.floor((Date.now() - lastTranscriptAt) / 1000) : null;

    if (micCount === 1) {
        viewerPromptText.textContent = 'Tip: Add another mic near the far speaker for much better accuracy in messy rooms.';
        viewerPrompt.style.display = 'block';
        return;
    }

    if (micCount > 0 && secondsSinceTranscript !== null && secondsSinceTranscript >= 15) {
        viewerPromptText.textContent = 'No speech detected recently. Move the mic closer or add another mic near the speaker.';
        viewerPrompt.style.display = 'block';
        return;
    }

    viewerPrompt.style.display = 'none';
}

function timeAgoShort(msAgo) {
    const s = Math.max(0, Math.floor(msAgo / 1000));
    if (s < 10) return 'just now';
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
}

function truncateText(s, max = 120) {
    const t = String(s || '').trim();
    if (t.length <= max) return t;
    return t.slice(0, max - 1) + '…';
}

function updateLiveNow() {
    if (!liveNowText) return;
    if (currentRole !== 'viewer') return;

    const last = transcriptEntries && transcriptEntries.length ? transcriptEntries[transcriptEntries.length - 1] : null;
    const ts = Number(last?.ts || 0) || lastTranscriptAt || 0;
    const text = String(last?.text || '').trim();
    const speaker = String(last?.speaker || '').trim();

    if (!ts || !text) {
        liveNowText.textContent = 'Listening…';
        if (liveNowMeta) {
            liveNowMeta.textContent = '';
        }
        if (liveNowRow) {
            liveNowRow.style.display = 'none';
        }
        return;
    }

    liveNowText.textContent = truncateText(`${speaker ? speaker + ': ' : ''}${text}`, 140);
    if (liveNowMeta) {
        liveNowMeta.textContent = `• ${timeAgoShort(Date.now() - ts)}`;
    }
    if (liveNowRow) {
        liveNowRow.style.display = 'none';
    }
}

function startLiveNowTimer() {
    if (liveNowTimer) return;
    liveNowTimer = window.setInterval(updateLiveNow, 1000);
}

function stopLiveNowTimer() {
    if (!liveNowTimer) return;
    window.clearInterval(liveNowTimer);
    liveNowTimer = null;
}

function connectAndCreate() {
    // Check if WebSocket is already connected
    if (ws && ws.readyState === WebSocket.OPEN) {
        // Already connected, send message immediately
        const passcode = roomPasscodeInput?.value?.trim() || null;
        ws.send(JSON.stringify({
            type: 'create_room',
            name: userName,
            deviceId: deviceId,
            passcode: passcode
        }));
        return;
    }
    
    // Create new connection or use existing
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        // No particle loader for room creation - direct connection
        // Create new WebSocket connection
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        ws = new WebSocket(wsUrl);
        
        // Set up handlers
        ws.onopen = () => {
            console.log('WebSocket connected');
            wsConnected = true;
            reconnectAttempts = 0;
            updateStatusBars();
            
            // Send create_room message once connected
            const passcode = roomPasscodeInput?.value?.trim() || null;
            ws.send(JSON.stringify({
                type: 'create_room',
                name: userName,
                deviceId: deviceId,
                passcode: passcode
            }));
        };
        
        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                handleMessage(message);
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
                showError('Received invalid message from server.');
            }
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            showError('Connection error. Please refresh the page.');
        };
        
        ws.onclose = () => {
            console.log('WebSocket closed');
            wsConnected = false;
            updateStatusBars();
            
            if (currentRoom && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                reconnectAttempts++;
                
                console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms...`);
                
                setTimeout(() => {
                    if (currentRole === 'viewer' && currentRoom) {
                        connectAndCreate();
                    }
                }, delay);
            } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                showError('Connection lost after multiple attempts. Please refresh the page.');
            }
        };
    } else if (ws.readyState === WebSocket.CONNECTING) {
        // Currently connecting, add handler to send message when open
        // No particle loader for room creation
        const originalOnOpen = ws.onopen;
        ws.onopen = () => {
            if (originalOnOpen) originalOnOpen();
            if (ws.readyState === WebSocket.OPEN) {
                const passcode = roomPasscodeInput?.value?.trim() || null;
                ws.send(JSON.stringify({
                    type: 'create_room',
                    name: userName,
                    deviceId: deviceId,
                    passcode: passcode
                }));
            }
        };
    }
}

function connectAndJoinAsViewer(code, passcode = null) {
    // Track room join time for connecting grace period
    window.__roomJoinedAt = Date.now();
    
    // Check if WebSocket is already connected
    if (ws && ws.readyState === WebSocket.OPEN) {
        // Already connected, send message immediately
        ws.send(JSON.stringify({
            type: 'join',
            roomCode: code,
            role: 'viewer',
            name: userName,
            deviceId: deviceId,
            passcode: passcode
        }));
        return;
    }
    
    // Create new connection or use existing
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        // Show particle loader before connecting with minimum display time
        const loader = getParticleLoader();
        const hideLoaderMinDelay = showLoaderWithMinDuration(loader);
        
        // Create new WebSocket connection
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        console.log('[Diagnostic] Creating WebSocket connection:', { wsUrl, roomCode: code, role: 'viewer' });
        console.log('[Diagnostic] WebSocket URL:', wsUrl);
        
        ws = new WebSocket(wsUrl);
        
        // Set up handlers
        ws.onopen = () => {
            console.log('[Diagnostic] WebSocket connected (viewer)', { wsUrl, readyState: ws.readyState });
            wsConnected = true;
            reconnectAttempts = 0;
            updateStatusBars();
            
            // Hide loader with minimum delay
            hideLoaderMinDelay();
            
            // Send join message once connected
            const joinMessage = {
                type: 'join',
                roomCode: code,
                role: 'viewer',
                name: userName,
                deviceId: deviceId,
                passcode: passcode
            };
            console.log('[Diagnostic] Sending join message:', joinMessage);
            ws.send(JSON.stringify(joinMessage));
            
            // Start keepalive pings for Cloudflare-safe connection
            clearInterval(window.__viewerPingTimer);
            window.__viewerPingTimer = setInterval(() => {
                try {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'ping', roomCode: code, ts: Date.now() }));
                    }
                } catch (e) {
                    // Ignore send errors
                }
            }, 8000);
        };
        
        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                // Hide loader on first meaningful payload
                if (message && (message.type === 'viewer_state' || message.type === 'insights_update' || message.type === 'room_state' || message.type === 'joined')) {
                    hideLoaderMinDelay();
                }
                handleMessage(message);
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
                showError('Received invalid message from server.');
            }
        };
        
        ws.onerror = (error) => {
            console.error('[Diagnostic] WebSocket error:', { error, wsUrl, readyState: ws?.readyState, roomCode: code });
            hideLoaderMinDelay();
            showError('Connection error. Please refresh the page.');
        };
        
        ws.onclose = (event) => {
            console.log('[Diagnostic] WebSocket closed:', { 
                code: event.code, 
                reason: event.reason, 
                wasClean: event.wasClean,
                wsUrl,
                roomCode: code 
            });
            wsConnected = false;
            updateStatusBars();
            hideLoaderMinDelay();
            
            // Clear keepalive ping timer
            clearInterval(window.__viewerPingTimer);
            window.__viewerPingTimer = null;
            
            if (currentRoom && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                reconnectAttempts++;
                
                console.log(`[Diagnostic] Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms...`);
                
                setTimeout(() => {
                    if (currentRole === 'viewer' && currentRoom) {
                        connectAndJoinAsViewer(currentRoom);
                    }
                }, delay);
            }
        };
    }
}

function connectAndJoin(code, passcode = null) {
    // Check if WebSocket is already connected
    if (ws && ws.readyState === WebSocket.OPEN) {
        // Already connected, send message immediately
        const micLabel = detectDeviceLabel();
        const uniqueName = userName ? `${userName} (${micLabel})` : micLabel;
        const micId = `mic-${deviceId}`;
        console.log(`[Mic] Joining as ${uniqueName} with micId ${micId}`);
        // Set currentRole before sending join
        currentRole = 'mic';
        ws.send(JSON.stringify({
            type: 'join',
            roomCode: code,
            role: 'mic',
            name: uniqueName,
            deviceId: deviceId,
            micId: micId,
            label: micLabel,
            passcode: passcode
        }));
        // Start heartbeat immediately since we're already connected
        console.log('[Diagnostic] Mic role detected (already connected), starting heartbeat for room:', code);
        startMicHeartbeat(ws, code);
        return;
    }
    
    // Create new connection or use existing
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        // Show particle loader before connecting with minimum display time
        const loader = getParticleLoader();
        const hideLoaderMinDelay = showLoaderWithMinDuration(loader);
        
        // Create new WebSocket connection
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        ws = new WebSocket(wsUrl);
        
        // Set up handlers
        ws.onopen = () => {
            console.log('WebSocket connected');
            wsConnected = true;
            reconnectAttempts = 0;
            updateStatusBars();
            
            // Hide loader with minimum delay
            hideLoaderMinDelay();
            
            // Send join message once connected
            const micLabel = detectDeviceLabel();
            const uniqueName = userName ? `${userName} (${micLabel})` : micLabel;
            const micId = `mic-${deviceId}`;
            console.log(`[Mic] Joining as ${uniqueName} with micId ${micId}`);
            // Set currentRole before sending join (needed for heartbeat check)
            currentRole = 'mic';
            ws.send(JSON.stringify({
                type: 'join',
                roomCode: code,
                role: 'mic',
                name: uniqueName,
                deviceId: deviceId,
                micId: micId,
                label: micLabel,
                passcode: passcode
            }));
            // Start heartbeat for mic role (start after join is sent)
            console.log('[Diagnostic] Mic role detected, starting heartbeat for room:', code);
            startMicHeartbeat(ws, code);
        };
        
        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                // Hide loader on first meaningful payload
                if (message && (message.type === 'joined' || message.type === 'viewer_state' || message.type === 'insights_update' || message.type === 'room_state')) {
                    hideLoaderMinDelay();
                }
                handleMessage(message);
            } catch (error) {
                console.error('Failed to parse WebSocket message:', error);
                showError('Received invalid message from server.');
            }
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            hideLoaderMinDelay();
            showError('Connection error. Please refresh the page.');
        };
        
        ws.onclose = () => {
            console.log('WebSocket closed');
            wsConnected = false;
            updateStatusBars();
            hideLoaderMinDelay();
            stopMicHeartbeat();
            
            if (currentRoom && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                reconnectAttempts++;
                
                console.log(`Attempting to reconnect (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) in ${delay}ms...`);
                
                setTimeout(() => {
                    if (currentRole === 'mic' && currentRoom) {
                        connectAndJoin(currentRoom);
                    }
                }, delay);
            } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                showError('Connection lost after multiple attempts. Please refresh the page.');
            }
        };
    } else if (ws.readyState === WebSocket.CONNECTING) {
        // Currently connecting, add handler to send message when open
        const loader = getParticleLoader();
        const hideLoaderMinDelay = showLoaderWithMinDuration(loader);
        const originalOnOpen = ws.onopen;
        ws.onopen = () => {
            if (originalOnOpen) originalOnOpen();
            hideLoaderMinDelay();
            if (ws.readyState === WebSocket.OPEN) {
                const micLabel = detectDeviceLabel();
                const uniqueName = userName ? `${userName} (${micLabel})` : micLabel;
                const micId = `mic-${deviceId}`;
                console.log(`[Mic] Joining as ${uniqueName} with micId ${micId}`);
                ws.send(JSON.stringify({
                    type: 'join',
                    roomCode: code,
                    role: 'mic',
                    name: uniqueName,
                    deviceId: deviceId,
                    micId: micId,
                    label: micLabel,
                    passcode: passcode
                }));
            }
        };
    }
}

function handleMessage(message) {
    switch (message.type) {
        case 'hello':
            clientId = message.clientId;
            break;
            
        case 'pong':
            // Optional: track latency / connection health
            window.__lastPongTs = Date.now();
            break;
            
        case 'room_created':
            currentRoom = message.roomCode;
            adminToken = message.adminToken;
            justCreatedRoom = true; // Mark that we just created a room
            // Persist passcode for this room (so invites can include it)
            try {
                const passcode = roomPasscodeInput?.value?.trim() || null;
                setRoomPasscode(currentRoom, passcode);
            } catch {}
            // Persist admin token so the creator can refresh and still manage the room
            try {
                setRoomAdminToken(currentRoom, adminToken);
            } catch {}
            updateAdminUI();
            showHostScreen();
            break;
            
        case 'joined':
            currentRoom = message.roomCode;
            // Best-effort: load admin token if the creator refreshed/navigated
            if (!adminToken && currentRoom) {
                try {
                    adminToken = getRoomAdminToken(currentRoom);
                } catch {}
            }
            // Start heartbeat for mic role after join confirmation
            if (message.role === 'mic' && ws && ws.readyState === WebSocket.OPEN) {
                console.log('[Diagnostic] Mic role joined, starting heartbeat for room:', currentRoom);
                startMicHeartbeat(ws, currentRoom);
            }
            // If we just created the room, stay on host screen - don't auto-redirect to viewer
            // User will click "Open Room" button to go to viewer screen
            // BUT: if user manually clicked "Open Room", justCreatedRoom will be false, so show viewer
            if (justCreatedRoom && message.role === 'viewer') {
                console.log('[App] Ignoring joined message - staying on host screen (just created room)');
                // Don't reset justCreatedRoom here - it will be reset when user clicks "Open Room"
                break;
            }
            if (message.role === 'viewer') {
                showViewerScreen();
                // Backfill topic history once we know the room
                loadTopicHistory(currentRoom).catch(() => {});
            } else {
                showMicScreen();
            }
            justCreatedRoom = false; // Reset flag
            break;
            
        case 'state':
            // Set updating flag when new state arrives
            if (message.room && message.room.summary) {
                isSummaryUpdating = true;
            }
            updateRoomState(message.room);
            if (message.room) {
                lastRoomState = message.room;
                lastMicRoster = message.room.micRoster || [];
                updateViewerPrompt();
                // IMPROVEMENT: Update listening status when room state changes
                updateListeningStatus();
            }
            // Clear updating flag after update completes
            isSummaryUpdating = false;
            // Handle topic shift if included in state message
            if (message.topicShift) {
                handleTopicShift(message.topicShift);
            }
            updateAdminUI();
            break;


        case 'segment': {
            // Phase 2.1 segment update (preferred)
            if (message.segment) {
                handleSegmentEvent(message.action, message.segment);
                // Add segment to mic screen transcript if visible
                if (currentRole === 'mic' && micTranscriptContent) {
                    const entry = normalizeSegmentToEntry(message.segment);
                    if (entry) addMicTranscriptEntry(entry);
                }
            }
            break;
        }

        case 'recent_segments': {
            // Phase 2.1: best-effort initial segments (HTTP paging is primary)
            if (Array.isArray(message.segments) && message.segments.length > 0 && transcriptEntries.length === 0) {
                replaceTranscriptWithSegments(message.segments);
                // Add segments to mic screen if visible
                if (currentRole === 'mic' && micTranscriptContent) {
                    message.segments.forEach(seg => {
                        const entry = normalizeSegmentToEntry(seg);
                        if (entry) addMicTranscriptEntry(entry);
                    });
                }
            }
            break;
        }
            
        case 'transcript':
            addTranscriptEntry(message.entry);
            if (message.entry) {
                if (!transcriptEntries.some(e => e.id && message.entry.id && e.id === message.entry.id)) {
                    transcriptEntries.push(message.entry);
                }
                lastTranscriptAt = message.entry.ts || Date.now();
                if (transcriptEntries.length > 1500) {
                    transcriptEntries = transcriptEntries.slice(-1000);
                }
                updateLiveNow();
                updateViewerPrompt();
                // IMPROVEMENT: Update status immediately when transcript arrives
                updateListeningStatus();
                // Add transcript entry to mic screen if visible
                if (currentRole === 'mic' && micTranscriptContent) {
                    addMicTranscriptEntry(message.entry);
                }
            }
            break;
            
        case 'recent_transcripts':
            message.entries.forEach(entry => addTranscriptEntry(entry));
            if (Array.isArray(message.entries)) {
                transcriptEntries = message.entries.slice(-1000);
                const last = transcriptEntries.length ? transcriptEntries[transcriptEntries.length - 1] : null;
                lastTranscriptAt = last?.ts || lastTranscriptAt;
                updateLiveNow();
                updateViewerPrompt();
                // IMPROVEMENT: Update status when recent transcripts arrive
                updateListeningStatus();
                // Add recent transcripts to mic screen if visible
                if (currentRole === 'mic' && micTranscriptContent && Array.isArray(message.entries)) {
                    message.entries.forEach(entry => {
                        if (entry) addMicTranscriptEntry(entry);
                    });
                }
            }
            break;
            
        case 'topic':
            handleTopicShift(message);
            break;
            
        case 'missed_result':
            showMissedResult(message);
            break;

        case 'device_list':
            // Update device list UI from heartbeat-driven device registry
            // EXPOSE FULL PAYLOAD FOR DIAGNOSIS (temporary)
            window.__lastDeviceListPayload = JSON.parse(JSON.stringify(message));
            console.log('[DEVICE_LIST_PAYLOAD]', JSON.stringify(message, null, 2));
            
            if (message.devices && Array.isArray(message.devices)) {
                // Convert device_list to mic roster format for compatibility
                const micRoster = message.devices.map(dev => ({
                    deviceId: dev.deviceId || dev.id,
                    name: dev.name || 'Mic',
                    streaming: dev.streaming || false,
                    status: dev.status || 'offline',
                    lastSeen: dev.lastSeen || dev.lastHeartbeat || dev.heartbeatTs || Date.now()
                }));
                
                // Only log if roster changed (to reduce console spam)
                // Use signature-based comparison to reliably detect actual changes
                const newIds = micRoster.map(m => String(m?.deviceId || m?.id || '')).filter(id => id && id !== 'undefined' && id !== 'null' && id !== '').sort();
                const newSignature = JSON.stringify(newIds);
                const rosterChanged = lastMicRosterSignature !== null && lastMicRosterSignature !== newSignature;
                
                if (rosterChanged) {
                    const prevIds = (lastMicRoster || []).map(m => String(m?.deviceId || m?.id || '')).filter(id => id && id !== 'undefined' && id !== 'null' && id !== '').sort();
                    console.log('[Diagnostic] Mic roster changed:', {
                        prevCount: prevIds.length,
                        newCount: newIds.length,
                        prevIds: prevIds,
                        newIds: newIds,
                        devices: micRoster.map(d => ({ name: d.name, status: d.status, streaming: d.streaming })),
                        room: currentRoom
                    });
                }
                
                // Update signature AFTER comparison (always update, even if unchanged)
                lastMicRosterSignature = newSignature;
                
                // Update lastMicRoster AFTER comparison
                lastMicRoster = micRoster;
                
                // updateDeviceListUI handles the conversion and UI update internally
                // No need to call updateMicRoster separately as it's redundant
                updateDeviceListUI(message.devices);
                updateStatusBars();
                updateListeningStatus();
            }
            break;
            
        case 'read_room_result':
            // If this is from a Save & Clear operation, format and copy to clipboard
            if (saveClearPending) {
                const summary = {
                    overview: message.overview || '',
                    key_points: Array.isArray(message.key_points) ? message.key_points : [],
                    decisions: Array.isArray(message.decisions) ? message.decisions : [],
                    next_steps: Array.isArray(message.next_steps) ? message.next_steps : []
                };
                let report = '';
                if (summary.overview) {
                    report += 'Overview:\n' + summary.overview + '\n\n';
                }
                if (summary.key_points.length > 0) {
                    report += 'Key Points:\n' + summary.key_points.map(p => '- ' + p).join('\n') + '\n\n';
                }
                if (summary.decisions.length > 0) {
                    report += 'Decisions:\n' + summary.decisions.map(d => '- ' + d).join('\n') + '\n\n';
                }
                if (summary.next_steps.length > 0) {
                    report += 'Next Steps:\n' + summary.next_steps.map(n => '- ' + n).join('\n');
                }
                copyText(report.trim());
                showToast('Conversation summary copied to clipboard.', 'info');
                saveClearPending = false;
            } else {
                // Normal Read the Room display
                if (readRoomSummary) {
                    readRoomSummary.textContent = message.overview || 'No overview available.';
                }
                
                // Show segment count note if summary was generated from multiple segments
                if (readRoomSegmentNote) {
                    if (message.segmentCount && message.segmentCount > 1) {
                        readRoomSegmentNote.textContent = `Summary generated from ${message.segmentCount} segments of a long meeting.`;
                        readRoomSegmentNote.style.display = 'block';
                    } else {
                        readRoomSegmentNote.style.display = 'none';
                    }
                }
                
                // Display key points
                if (readRoomPoints && message.key_points && Array.isArray(message.key_points)) {
                    readRoomPoints.innerHTML = '';
                    if (message.key_points.length === 0) {
                        const li = document.createElement('li');
                        li.className = 'empty-state';
                        li.textContent = 'No key points yet.';
                        readRoomPoints.appendChild(li);
                    } else {
                        message.key_points.forEach(point => {
                            const li = document.createElement('li');
                            li.textContent = point;
                            readRoomPoints.appendChild(li);
                        });
                    }
                }
                
                // Display decisions
                if (readRoomDecisions && message.decisions && Array.isArray(message.decisions)) {
                    readRoomDecisions.innerHTML = '';
                    if (message.decisions.length === 0) {
                        if (readRoomDecisionsSection) readRoomDecisionsSection.style.display = 'none';
                    } else {
                        if (readRoomDecisionsSection) readRoomDecisionsSection.style.display = 'block';
                        message.decisions.forEach(decision => {
                            const li = document.createElement('li');
                            li.textContent = decision;
                            readRoomDecisions.appendChild(li);
                        });
                    }
                } else if (readRoomDecisionsSection) {
                    readRoomDecisionsSection.style.display = 'none';
                }
                
                // Display next steps
                if (readRoomNextSteps && message.next_steps && Array.isArray(message.next_steps)) {
                    readRoomNextSteps.innerHTML = '';
                    if (message.next_steps.length === 0) {
                        if (readRoomNextStepsSection) readRoomNextStepsSection.style.display = 'none';
                    } else {
                        if (readRoomNextStepsSection) readRoomNextStepsSection.style.display = 'block';
                        message.next_steps.forEach(step => {
                            const li = document.createElement('li');
                            li.textContent = step;
                            readRoomNextSteps.appendChild(li);
                        });
                    }
                } else if (readRoomNextStepsSection) {
                    readRoomNextStepsSection.style.display = 'none';
                }
                
                if (readRoomPanel) {
                    readRoomPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    // Focus management for accessibility
                    readRoomPanel.setAttribute('tabindex', '-1');
                    readRoomPanel.focus();
                }
            }
            break;

        case 'save_and_clear_result':
            // Handle result from save & clear operation (admin)
            if (message.summary) {
                const summary = message.summary;
                let report = '';
                if (summary.overview) {
                    report += 'Overview:\n' + summary.overview + '\n\n';
                }
                if (Array.isArray(summary.key_points) && summary.key_points.length > 0) {
                    report += 'Key Points:\n' + summary.key_points.map(p => '- ' + p).join('\n') + '\n\n';
                }
                if (Array.isArray(summary.decisions) && summary.decisions.length > 0) {
                    report += 'Decisions:\n' + summary.decisions.map(d => '- ' + d).join('\n') + '\n\n';
                }
                if (Array.isArray(summary.next_steps) && summary.next_steps.length > 0) {
                    report += 'Next Steps:\n' + summary.next_steps.map(n => '- ' + n).join('\n');
                }
                copyText(report.trim());
                if (message.cleared) {
                    showToast('Conversation saved and cleared. Summary copied to clipboard.', 'info');
                } else {
                    showToast('Conversation summary copied to clipboard.', 'info');
                }
            }
            saveClearPending = false;
            break;

        case 'mic_roster_update':
            console.log('[Diagnostic] Mic roster update message received:', {
                count: message.micRoster?.length || 0,
                mics: message.micRoster || [],
                room: currentRoom,
                role: currentRole
            });
            updateMicRoster(message.micRoster);
            lastMicRoster = message.micRoster || [];
            updateViewerPrompt();
            updateStatusBars();
            // IMPROVEMENT: Update listening status when mic roster changes
            updateListeningStatus();
            break;

        case 'audio_ack':
            // Server acknowledged receiving audio chunk
            chunksAcked++;
            lastAckTime = Date.now();
            updateMicStats();
            updateStatusBars();
            break;

        case 'audio_warning': {
            // Actionable audio quality guidance (rate-limited server-side)
            const who = message.speaker ? `${message.speaker}: ` : '';
            const msg = message.message || 'Audio quality issue detected. Move the mic closer or check input device.';
            lastAudioWarningAt = Date.now();
            lastAudioWarningReason = String(message.reason || '');
            lastAudioWarningMsg = msg;
            showToast(`${who}${msg}`, 'warn');
            // If this device is a mic, also show the persistent mic banner briefly.
            if (currentRole === 'mic' && micWarningBanner && micWarningText) {
                micWarningBanner.style.display = 'flex';
                micWarningText.textContent = msg;
                window.clearTimeout(window.__huddleMicWarnTimer);
                window.__huddleMicWarnTimer = window.setTimeout(() => {
                    micWarningBanner.style.display = 'none';
                }, 6000);
            }
            updateStatusBars();
            break;
        }

        case 'room_deleted':
            alert('Room deleted successfully');
            reset();
            break;
            
        case 'error':
        case 'warn':
            console.warn(message.message);
            showToast(message.message, message.type === 'error' ? 'error' : 'warn');
            break;
    }
}

function showHostScreen() {
    // If this page doesn't include the host DOM, do nothing.
    if (!hostScreen) return;

    // Hide intro screen if it's still active
    if (introScreen && introScreen.classList) introScreen.classList.remove('active');
    if (joinScreen && joinScreen.classList) joinScreen.classList.remove('active');
    if (micScreen) micScreen.classList.remove('active');
    if (viewerScreen) viewerScreen.classList.remove('active');
    hostScreen.classList.add('active');
    
    // Update room code display
    if (hostRoomCode && currentRoom) {
        hostRoomCode.textContent = currentRoom;
    }
    
    // Update QR code to point to mic join URL
    if (hostQrCode && currentRoom) {
        hostQrCode.src = `/api/room/${currentRoom}/invite-qr.png?role=mic`;
        hostQrCode.alt = `QR Code for room ${currentRoom}`;
    }
}

function showViewerScreen() {
    // If this page doesn't include the viewer DOM (e.g. `/host`), navigate to the viewer route.
    if (!viewerScreen) {
        if (currentRoom) {
            window.location.assign(`/viewer?room=${encodeURIComponent(currentRoom)}`);
        } else {
            console.error('[App] Cannot show viewer screen: no currentRoom and no viewerScreen element');
            showToast('No room available. Please create a room first.', 'error');
        }
        return;
    }
    // On split-route pages, join/host/mic screens may not exist; only toggle what exists.
    // Hide intro screen if it's still active
    if (introScreen && introScreen.classList) introScreen.classList.remove('active');
    if (joinScreen && joinScreen.classList) joinScreen.classList.remove('active');
    if (hostScreen && hostScreen.classList) hostScreen.classList.remove('active');
    if (micScreen && micScreen.classList) micScreen.classList.remove('active');
    if (viewerScreen && viewerScreen.classList) {
        viewerScreen.classList.add('active');
    } else {
        console.error('[App] viewerScreen element not found or has no classList');
        if (currentRoom) {
            window.location.assign(`/viewer?room=${encodeURIComponent(currentRoom)}`);
        }
        return;
    }
    
    // Update merged room/live pill
    if (roomLivePill && currentRoom) {
        const roomCodeEl = roomLivePill.querySelector('.room-pill-code');
        if (roomCodeEl) roomCodeEl.textContent = currentRoom;
        roomLivePill.style.display = 'inline-flex';
    } else if (roomLivePill) {
        roomLivePill.style.display = 'none';
    }

    // Phase 2.1: load paged segments (canonical transcript)
    loadInitialSegments().catch(() => {});
    updateStatusBars();
    // IMPROVEMENT: Initialize listening status when viewer screen is shown
    updateListeningStatus();
    startLiveNowTimer();
    updateLiveNow();

    // Viewer onboarding (read-only banner) + admin UI toggle
    initOnboardingBanner();
    updateAdminUI();

    if (catchUpPanel) {
        catchUpPanel.style.display = 'block';
    }
    
    // Update role module UI (reset to viewer-only on screen show if not enabled)
    if (currentRole === 'viewer' && !isMicEnabled) {
        updateRoleModuleUI();
        updateViewerMicButtonUI();
    }
}

// End session handler
if (endSessionBtn) endSessionBtn.addEventListener('click', async () => {
    if (!confirm('End session and delete all data? This cannot be undone.')) {
        return;
    }
    
    if (adminToken && currentRoom) {
        try {
            const response = await fetch(`/api/room/${currentRoom}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adminToken })
            });
            
            if (response.ok) {
                if (ws) ws.close();
                reset();
            } else {
                // Fallback to WebSocket delete
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'delete_room',
                        adminToken
                    }));
                }
            }
        } catch (error) {
            // Fallback to WebSocket delete
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'delete_room',
                    adminToken
                }));
            }
        }
    }
});

async function showMicScreen() {
    // If this page doesn't include the mic DOM (e.g. `/host`), navigate to the mic route.
    if (!micScreen) {
        if (currentRoom) window.location.assign(`/mic?room=${encodeURIComponent(currentRoom)}`);
        return;
    }
    if (joinScreen) joinScreen.classList.remove('active');
    if (hostScreen) hostScreen.classList.remove('active');
    if (viewerScreen) viewerScreen.classList.remove('active');
    micScreen.classList.add('active');
    
    if (micRoomCode && currentRoom) {
        micRoomCode.textContent = currentRoom;
    }
    if (micName && userName) {
        micName.textContent = userName;
    }
    
    // Initialize mic screen state
    updateMicIconState('idle');
    if (startMicBtn) startMicBtn.style.display = 'block';
    if (stopMicBtn) stopMicBtn.style.display = 'none';
    if (micStatus) micStatus.textContent = 'Ready to start';
    if (micFeedback) micFeedback.style.display = 'none';
    if (micWarningBanner) micWarningBanner.style.display = 'none';
    
    // Initialize room status display (will update when state message arrives)
    if (micRoomStatusText) {
        micRoomStatusText.textContent = 'Connecting to room...';
    }
    
    // Show transcript card (initially hidden, will show when recording starts)
    if (micTranscriptCard) {
        micTranscriptCard.style.display = 'block';
        // Initialize transcript state (expanded by default, so content shows without extra clicks)
        if (micTranscriptContent) {
            const stored = localStorage.getItem('huddle_mic_transcript_expanded');
            // Default to expanded if no stored preference
            const transcriptExpanded = stored === null ? true : stored === 'true';
            if (!transcriptExpanded) {
                micTranscriptContent.classList.add('mic-transcript-collapsed');
                if (micTranscriptToggle) micTranscriptToggle.textContent = 'Show';
            } else {
                micTranscriptContent.classList.remove('mic-transcript-collapsed');
                if (micTranscriptToggle) micTranscriptToggle.textContent = 'Hide';
            }
        }
    }
    
    // Check HTTPS
    if (httpsWarning && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
        httpsWarning.style.display = 'block';
    }
    
    // Check if Realtime mode is enabled
    try {
        const response = await fetch('/api/network');
        const data = await response.json();
        // Check if Realtime mode is available (will fail gracefully if not)
        useRealtimeMode = false; // Default to false, will enable if session creation succeeds
    } catch (error) {
        useRealtimeMode = false;
    }
    
    // Load Realtime module if available (will be loaded dynamically)
    if (!window.RealtimeMic && useRealtimeMode) {
        const script = document.createElement('script');
        script.src = '/realtime_mic.js';
        script.onload = () => {
            console.log('Realtime module loaded');
        };
        script.onerror = () => {
            console.warn('Realtime module not available, using fallback');
            useRealtimeMode = false;
        };
        document.head.appendChild(script);
    }
    
    // Enable/disable start button based on consent
    consentCheckbox.addEventListener('change', () => {
        const isChecked = consentCheckbox.checked;
        startMicBtn.disabled = !isChecked;
        if (isChecked && consentError) {
            consentError.style.display = 'none';
        }
    });
    
    // Pre-flight mic permission check
    checkMicPermissions();
    updateStatusBars();
}

// Keep status bars fresh (ages, reconnect text)
setInterval(updateStatusBars, 750);

// IMPROVEMENT: Update listening status more frequently to catch state changes
setInterval(updateListeningStatus, 2000);

async function checkMicPermissions() {
    try {
        // Check if mediaDevices is available (Safari compatibility)
        if (!navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            return; // Silently skip if not available
        }
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                channelCount: 1,
                sampleRate: 48000,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        });
        if (stream && stream.getTracks) {
            stream.getTracks().forEach(track => track.stop());
        }
        // Permissions OK
    } catch (error) {
        // Silently handle - permissions check is optional
        console.debug('Mic permission check:', error);
    }
}

// Add a new function to compute intelligent status messages
function getListeningStatus(room, lastTranscriptAt, lastMicRoster, transcriptEntries) {
    const now = Date.now();
    const micCount = Array.isArray(lastMicRoster) ? lastMicRoster.length : 0;
    const secondsSinceTranscript = lastTranscriptAt ? Math.floor((now - lastTranscriptAt) / 1000) : null;
    const hasRecentTranscripts = transcriptEntries.length > 0;
    const transcriptCount = transcriptEntries.length;
    
    // Check if mics are actually active (seen recently)
    const activeMicCount = Array.isArray(lastMicRoster) 
        ? lastMicRoster.filter(mic => {
            const lastSeen = mic.lastSeen || mic.joinedAt || 0;
            return (now - lastSeen) < 30000; // Active if seen in last 30s
        }).length 
        : 0;
    
    // No mics at all
    if (micCount === 0) {
        return {
            message: 'Waiting for people to connect...',
            detail: 'Share the mic link so others can join with their devices',
            status: 'waiting',
            visual: 'idle'
        };
    }
    
    // Mics connected but not active
    if (activeMicCount === 0 && micCount > 0) {
        const inactiveCount = micCount;
        return {
            message: 'Microphones connected but inactive',
            detail: `${inactiveCount} mic${inactiveCount > 1 ? 's' : ''} joined, waiting for activity`,
            status: 'waiting',
            visual: 'idle'
        };
    }
    
    // No transcripts yet but mics are active
    if (!hasRecentTranscripts && activeMicCount > 0 && secondsSinceTranscript === null) {
        return {
            message: 'Listening for conversation...',
            detail: `${activeMicCount} mic${activeMicCount > 1 ? 's' : ''} active • Waiting for speech`,
            status: 'listening',
            visual: 'active'
        };
    }
    
    // Recent speech detected
    if (secondsSinceTranscript !== null && secondsSinceTranscript < 10) {
        return {
            message: 'Conversation active',
            detail: `${activeMicCount} mic${activeMicCount > 1 ? 's' : ''} • ${transcriptCount} transcript${transcriptCount !== 1 ? 's' : ''} • Last heard just now`,
            status: 'active',
            visual: 'active'
        };
    }
    
    // Speech detected recently (within 30s)
    if (secondsSinceTranscript !== null && secondsSinceTranscript < 30) {
        return {
            message: 'Processing conversation...',
            detail: `${activeMicCount} mic${activeMicCount > 1 ? 's' : ''} • Last heard ${secondsSinceTranscript}s ago • Analyzing...`,
            status: 'processing',
            visual: 'processing'
        };
    }
    
    // Speech detected but paused
    if (secondsSinceTranscript !== null && secondsSinceTranscript < 120) {
        return {
            message: 'Conversation paused',
            detail: `${activeMicCount} mic${activeMicCount > 1 ? 's' : ''} active • Last heard ${Math.floor(secondsSinceTranscript / 10) * 10}s ago`,
            status: 'paused',
            visual: 'idle'
        };
    }
    
    // Very old or no recent activity
    if (hasRecentTranscripts) {
        return {
            message: 'Waiting for new conversation...',
            detail: `${transcriptCount} transcript${transcriptCount !== 1 ? 's' : ''} recorded • Ready for more`,
            status: 'waiting',
            visual: 'idle'
        };
    }
    
    // Fallback
    return {
        message: 'Ready to listen...',
        detail: `${micCount} mic${micCount > 1 ? 's' : ''} connected`,
        status: 'ready',
        visual: 'idle'
    };
}

function getSummaryPlaceholder(listeningStatus) {
    switch (listeningStatus.status) {
        case 'waiting':
            return `Listening… ${listeningStatus.detail || ''}`;
        case 'listening':
            return `Listening… ${listeningStatus.detail || ''}`;
        case 'processing':
            return `Processing recent conversation… Analysis will appear here shortly.`;
        case 'active':
            return `Conversation in progress. Summary will update as topics emerge.`;
        case 'paused':
            return `Conversation paused. Summary will refresh when activity resumes.`;
        default:
            return 'Listening…';
    }
}

function computeMicActivityStats(micRoster) {
    const now = Date.now();
    const stats = {
        micCount: 0,
        activeCount: 0,
        liveCount: 0
    };

    if (!Array.isArray(micRoster)) return stats;
    stats.micCount = micRoster.length;

    micRoster.forEach(mic => {
        const truthStatus = normalizeTruthStatus(mic);
        const lastSeen = mic?.lastSeen || mic?.joinedAt || 0;
        const isActive = truthStatus !== 'OFFLINE' || (lastSeen && (now - lastSeen) < 30000);
        if (isActive) stats.activeCount += 1;
        if (truthStatus === 'LIVE') stats.liveCount += 1;
    });

    return stats;
}

function updateAwarenessDock(listeningStatus) {
    if (!primaryStatusLine && !secondaryAttentionLine && !coverageState && !coverageReason) return;

    const stats = computeMicActivityStats(lastMicRoster);
    let primary = 'Quiet';
    let secondary = 'Nothing you need to respond to';

    if (stats.liveCount >= 2) {
        primary = 'Multiple voices';
        secondary = 'You may want to look up';
    } else if (stats.liveCount === 1) {
        primary = 'Someone speaking';
        secondary = 'Someone may be speaking to you';
    } else if (stats.activeCount >= 2) {
        primary = 'Group discussion';
        secondary = 'You may want to look up';
    }

    if (primaryStatusLine) primaryStatusLine.textContent = primary;
    if (secondaryAttentionLine) secondaryAttentionLine.textContent = secondary;

    let reasonText = '';
    if (coverageState) {
        if (stats.micCount === 0) {
            coverageState.textContent = 'Limited';
            reasonText = 'No microphones connected';
        } else if (stats.activeCount >= 2) {
            coverageState.textContent = 'Good';
            reasonText = 'Multiple mics active';
        } else if (stats.activeCount === 1) {
            coverageState.textContent = 'Partial';
            reasonText = 'Single mic active';
        } else {
            coverageState.textContent = 'Limited';
            reasonText = 'Mics inactive';
        }
    }

    if (coverageReason) {
        coverageReason.textContent = reasonText ? `• ${reasonText}` : '';
    }

    const secondsSinceTranscript = lastTranscriptAt ? Math.floor((Date.now() - lastTranscriptAt) / 1000) : null;
    const isDegraded = stats.activeCount > 0 && secondsSinceTranscript !== null && secondsSinceTranscript > 45;

    if (degradedChip) {
        degradedChip.style.display = isDegraded ? 'inline-flex' : 'none';
    }
    if (catchUpDegraded) {
        catchUpDegraded.style.display = isDegraded ? 'inline-flex' : 'none';
    }
}

function updateTopicDisplay(status, summary) {
    // This function is deprecated - use updateSituationCard instead
    // But keep for compatibility
    if (!topicMain) return;
    updateSituationCard(status, summary);
}

function updateSummaryDisplay(status, summary) {
    if (!rollingSummary) return;
    
    // Check if we have a real summary (non-empty string)
    const hasSummary = summary?.rolling_summary && String(summary.rolling_summary).trim().length > 0;
    const summaryText = hasSummary ? summary.rolling_summary : getSummaryPlaceholder(status);
    const MAX_SUMMARY_LENGTH = 150;
    
    // Handle truncation with "Read more"
    if (hasSummary && summaryText.length > MAX_SUMMARY_LENGTH && summaryReadMore) {
        const truncatedText = summaryText.substring(0, MAX_SUMMARY_LENGTH) + '...';
        const isExpanded = rollingSummary.dataset.expanded === 'true';
        
        rollingSummary.textContent = isExpanded ? summaryText : truncatedText;
        rollingSummary.dataset.fullText = summaryText;
        summaryReadMore.style.display = 'inline-block';
        summaryReadMore.textContent = isExpanded ? 'Read less' : 'Read more';
        
        // Add click handler if not already added
        if (!summaryReadMore.hasAttribute('data-handler-attached')) {
            summaryReadMore.setAttribute('data-handler-attached', 'true');
            summaryReadMore.addEventListener('click', () => {
                const isExpanded = rollingSummary.dataset.expanded === 'true';
                rollingSummary.dataset.expanded = (!isExpanded).toString();
                rollingSummary.textContent = isExpanded 
                    ? truncatedText 
                    : rollingSummary.dataset.fullText;
                summaryReadMore.textContent = isExpanded ? 'Read more' : 'Read less';
            });
        }
    } else {
        rollingSummary.textContent = summaryText;
        rollingSummary.dataset.expanded = 'false';
        if (summaryReadMore) {
            summaryReadMore.style.display = 'none';
        }
    }
    
    rollingSummary.className = 'summary-content-now';
    if (!hasSummary) {
        rollingSummary.classList.add(`summary-status-${status.visual}`);
        rollingSummary.style.fontStyle = 'italic';
        rollingSummary.style.opacity = '0.7';
    } else {
        rollingSummary.classList.remove('summary-status-active', 'summary-status-processing', 'summary-status-idle', 'summary-status-waiting');
        rollingSummary.style.fontStyle = 'normal';
        rollingSummary.style.opacity = '1';
    }
    
    // Update timestamp or loading state if summaryUpdated element exists
    if (summaryUpdated) {
        if (isSummaryUpdating && !hasSummary) {
            // Show loading state while summary is being generated
            summaryUpdated.textContent = 'Updating...';
            summaryUpdated.className = 'summary-updated summary-updating';
        } else if (hasSummary) {
            // Show timestamp when summary exists
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            summaryUpdated.textContent = `Updated ${timeStr}`;
            summaryUpdated.className = 'summary-updated';
        } else {
            summaryUpdated.textContent = '';
            summaryUpdated.className = 'summary-updated';
        }
    }
}

function updateRoomState(room) {
    // IMPROVEMENT: Don't return early - handle missing summary gracefully
    // CRITICAL: Display topic IMMEDIATELY for deaf users (even low confidence)
    if (!room) {
        // Room data missing - use default status
        const status = getListeningStatus(null, lastTranscriptAt, lastMicRoster, transcriptEntries);
        updateSituationCard(status, null);
        updateSummaryDisplay(status, null);
        updateKeyPointsCard([]);
        updateDecisionsCard([]);
        updateActionsCard([]);
        updateAwarenessDock(status);
        return;
    }
    
    // Get summary with topic - display IMMEDIATELY even if confidence is low (0.3+)
    const summary = room.summary || {};
    
    // Compute current listening status
    const listeningStatus = getListeningStatus(room, lastTranscriptAt, lastMicRoster, transcriptEntries);
    
    // Update CURRENT SITUATION card (topic, status, confidence) - IMMEDIATE for deaf users
    updateSituationCard(listeningStatus, summary);
    
    // Update "What's happening now" summary card
    updateSummaryDisplay(listeningStatus, summary);
    
    // Update KEY POINTS card (max 5 bullets from key_points, or fallback to decisions if not available)
    const keyPoints = (summary.key_points && summary.key_points.length > 0) 
        ? summary.key_points 
        : (summary.decisions || []);
    updateKeyPointsCard(keyPoints);

    // Update decisions list (max 6 bullets)
    updateDecisionsCard(summary.decisions || []);
    
    // Update ACTIONS card (max 3 bullets from next_steps)
    const actions = (summary.next_steps || []).slice(0, 3);
    updateActionsCard(actions);
    
    // Mic roster (now shows as mic health strip)
    if (room.micRoster) {
        updateMicHealthStrip(room.micRoster);
        // BUGFIX: Update lastMicRoster so status detection works correctly
        lastMicRoster = room.micRoster;
    }

    updateAwarenessDock(listeningStatus);
    
    // Update mic page room status (multi-location architecture)
    updateMicRoomStatus(room);
}

// Multi-location architecture: Update room status on mic page
function updateMicRoomStatus(room) {
    if (!micRoomStatusText || currentRole !== 'mic') return;
    
    if (!room) {
        micRoomStatusText.textContent = 'Connecting to room...';
        return;
    }
    
    const micRoster = room.micRoster || [];
    // Estimate viewer count from room state (viewer exists if summary exists)
    const hasViewer = room.summary && (room.summary.topic || room.summary.rolling_summary);
    const otherMicCount = micRoster.length > 0 ? Math.max(0, micRoster.length - 1) : 0; // Exclude self
    
    const parts = [];
    if (hasViewer) {
        parts.push('Viewer connected');
    } else {
        parts.push('No viewer');
    }
    
    if (otherMicCount > 0) {
        parts.push(`${otherMicCount} other mic${otherMicCount > 1 ? 's' : ''}`);
    } else if (micRoster.length === 1) {
        // Only self, show that we're the only mic
        parts.push('Only mic');
    }
    
    micRoomStatusText.textContent = parts.join(' • ') || 'Connected to room';
}

// Update HERO TOPIC CARD - Show topic IMMEDIATELY (even low confidence for deaf users who need context NOW)
// With debouncing to prevent rapid topic changes, but always show newest topic
function updateSituationCard(listeningStatus, summary) {
    if (!topicMain) return;
    
    // Show topic IMMEDIATELY if detected (even with confidence 0.3+) - deaf users need context NOW
    const hasTopic = summary?.topic && String(summary.topic).trim().length > 0;
    const topicConfidence = summary?.confidence || 0;
    const now = Date.now();
    const currentTopic = topicMain.textContent;
    const newTopic = hasTopic && topicConfidence >= 0.3 ? summary.topic : null;
    
    // Always update immediately if there's no current topic or if it's the same topic
    const isFirstTopic = !currentTopic || currentTopic === 'Listening…' || currentTopic.trim().length === 0;
    
    // Debouncing logic: don't change topic too quickly, but always store the newest
    if (newTopic && newTopic !== currentTopic && !isFirstTopic) {
        // If we have a pending update or recently updated, debounce
        if (lastTopicUpdate && (now - lastTopicUpdate) < TOPIC_UPDATE_DEBOUNCE_MS) {
            // Always store the newest pending update (replaces any older pending update)
            pendingTopicUpdate = { summary, listeningStatus, timestamp: now };
            // Clear existing timeout and set new one to show the newest topic after debounce
            if (window.__topicUpdateTimeout) clearTimeout(window.__topicUpdateTimeout);
            window.__topicUpdateTimeout = setTimeout(() => {
                if (pendingTopicUpdate) {
                    // Apply the newest pending update
                    updateSituationCardImmediate(pendingTopicUpdate.listeningStatus, pendingTopicUpdate.summary);
                    pendingTopicUpdate = null;
                    lastTopicUpdate = Date.now();
                }
            }, TOPIC_UPDATE_DEBOUNCE_MS - (now - lastTopicUpdate));
            return; // Don't update yet - wait for debounce
        }
    }
    
    // Immediate update (either first topic, no change, or enough time has passed)
    updateSituationCardImmediate(listeningStatus, summary);
    if (newTopic && newTopic !== currentTopic) {
        lastTopicUpdate = now;
        // Clear any pending update since we just updated immediately
        pendingTopicUpdate = null;
        if (window.__topicUpdateTimeout) {
            clearTimeout(window.__topicUpdateTimeout);
            window.__topicUpdateTimeout = null;
        }
    }
}

// Internal function to actually update the topic display
function updateSituationCardImmediate(listeningStatus, summary) {
    if (!topicMain) return;
    
    const hasTopic = summary?.topic && String(summary.topic).trim().length > 0;
    const topicConfidence = summary?.confidence || 0;
    
    if (hasTopic && topicConfidence >= 0.3) {
        // Display topic immediately - even tentative topics are useful for deaf users
        topicMain.textContent = summary.topic;
        topicMain.className = 'hero-topic-text topic-active';
        
        // Show subtopic if available, otherwise use rolling summary
        if (topicSub) {
            const hasSubtopic = summary?.subtopic && String(summary.subtopic).trim().length > 0;
            if (hasSubtopic) {
                topicSub.textContent = summary.subtopic;
            } else if (summary?.rolling_summary && String(summary.rolling_summary).trim().length > 0) {
                topicSub.textContent = (summary.rolling_summary || '').substring(0, 120); // Truncate if too long
            } else {
                topicSub.textContent = 'Analyzing conversation...';
            }
        }
    } else {
        // No topic yet - show listening status
        topicMain.textContent = listeningStatus?.message || 'Listening…';
        topicMain.className = 'hero-topic-text topic-waiting';
        
        if (topicSub) {
            topicSub.textContent = listeningStatus?.detail || 'Waiting for conversation to start...';
        }
    }
    
    // Update status badge
    if (statusBadge) {
        statusBadge.textContent = summary?.status || 'Listening';
        // Style based on status
        statusBadge.className = 'hero-status-badge';
        if (summary?.status === 'Confirming') {
            statusBadge.classList.add('status-confirming');
        } else if (summary?.status === 'Done') {
            statusBadge.classList.add('status-done');
        } else {
            statusBadge.classList.add('status-deciding');
        }
    }
    
    // Show confidence only if topic exists (even if low)
    if (confidence) {
        const hasTopic = summary?.topic && String(summary.topic).trim().length > 0;
        const topicConfidence = summary?.confidence || 0;
        if (hasTopic && topicConfidence >= 0.3) {
            const confPercent = Math.round(topicConfidence * 100);
            const isHigh = confPercent >= 70;
            const isMedium = confPercent >= 50 && confPercent < 70;
            const isLow = confPercent < 50;
            
            // Icon: ✓ for high, ~ for medium, ? for low
            const icon = isHigh ? '✓' : (isMedium ? '~' : '?');
            
            // Build HTML with icon, text, and progress bar
            confidence.innerHTML = `
                <span class="confidence-indicator">
                    <span class="confidence-icon confidence-${isHigh ? 'high' : (isMedium ? 'medium' : 'low')}">${icon}</span>
                    <span class="confidence-text">${confPercent}%</span>
                    <span class="confidence-bar-container">
                        <span class="confidence-bar confidence-${isHigh ? 'high' : (isMedium ? 'medium' : 'low')}" style="width: ${confPercent}%"></span>
                    </span>
                </span>
            `;
            confidence.style.display = 'inline-flex';
            confidence.className = `hero-confidence ${isHigh ? 'high' : (isMedium ? 'medium' : 'low')}`;
        } else {
            confidence.style.display = 'none';
        }
    }
}

// Update KEY POINTS card (max 5 bullets, shows top 5 most important points)
function updateKeyPointsCard(keyPoints) {
    if (!keyPointsList) return;
    
    keyPointsList.innerHTML = '';
    if (!keyPoints || keyPoints.length === 0) {
        const li = document.createElement('li');
        li.className = 'empty-state';
        li.textContent = 'No key points yet. Speak to generate insights.';
        keyPointsList.appendChild(li);
    } else {
        // Show up to 5 key points (as generated by server)
        keyPoints.slice(0, 5).forEach(item => {
            const li = document.createElement('li');
            li.textContent = item;
            keyPointsList.appendChild(li);
        });
    }
}

// Update decisions list
function updateDecisionsCard(decisions) {
    if (!decisionsList) return;

    decisionsList.innerHTML = '';
    if (!decisions || decisions.length === 0) {
        const li = document.createElement('li');
        li.className = 'empty-state';
        li.textContent = 'No decisions detected.';
        decisionsList.appendChild(li);
    } else {
        decisions.slice(0, 6).forEach(item => {
            const li = document.createElement('li');
            li.textContent = item;
            decisionsList.appendChild(li);
        });
    }
}

// Update ACTIONS card (max 3 bullets from next_steps)
function updateActionsCard(actions) {
    if (!actionsList) return;
    
    actionsList.innerHTML = '';
    if (!actions || actions.length === 0) {
        const li = document.createElement('li');
        li.className = 'empty-state';
        li.textContent = 'No next steps yet. Decisions will appear here.';
        actionsList.appendChild(li);
    } else {
        actions.slice(0, 3).forEach(item => {
            const li = document.createElement('li');
            li.textContent = item;
            actionsList.appendChild(li);
        });
    }
}

// Update device list UI from heartbeat-driven device_list message
// ===== Device Truth UI helpers (B3 UX Sanity Pass) =====

const STATUS_PRIORITY = ["LIVE", "IDLE", "CONNECTED", "PAUSED", "OFFLINE"];

function normalizeTruthStatus(d) {
  // Backward-compatible: prefer truth model status; fall back to legacy fields if needed.
  const s = (d && (d.status || d.truthStatus || d.state || "")).toString().toUpperCase();
  
  if (["LIVE", "IDLE", "CONNECTED", "PAUSED", "OFFLINE"].includes(s)) return s;
  
  // Legacy fallbacks (best effort):
  // - Some older builds used "SENDING" for streaming, treat as CONNECTED/IDLE depending on lastSpeech.
  if (s === "SENDING") return "CONNECTED";
  
  return "OFFLINE";
}

function labelForStatus(status) {
  switch (status) {
    case "LIVE": return "Speaking";
    case "IDLE": return "Listening";
    case "CONNECTED": return "Ready";
    case "PAUSED": return "Paused";
    case "OFFLINE": return "Offline";
    default: return "Offline";
  }
}

function tooltipForStatus(status) {
  switch (status) {
    case "LIVE":
      return "This microphone is actively picking up speech.";
    case "IDLE":
      return "This microphone is on and listening, but no one is speaking right now.";
    case "CONNECTED":
      return "This microphone is connected but not yet streaming audio.";
    case "PAUSED":
      return "This microphone is temporarily paused.";
    case "OFFLINE":
    default:
      return "This microphone is not currently connected.";
  }
}

function summarizeStatuses(devices) {
  const counts = { LIVE: 0, IDLE: 0, CONNECTED: 0, PAUSED: 0, OFFLINE: 0 };
  for (const d of (devices || [])) {
    counts[normalizeTruthStatus(d)]++;
  }
  return counts;
}

function pickListeningState(counts, connectingGrace = false) {
  // Copy strings (exact)
  if (connectingGrace) return "Connecting to microphones…";
  
  const active = (counts.LIVE + counts.IDLE + counts.CONNECTED + counts.PAUSED);
  if (active === 0) return "Not listening — no active microphones";
  if (counts.LIVE > 0) return "Listening — speech detected";
  return "Listening — no one speaking";
}

function makeDeviceSummaryLine(counts) {
  // "2 speaking, 1 listening" etc. Uses viewer-facing labels.
  if ((counts.LIVE + counts.IDLE + counts.CONNECTED + counts.PAUSED) === 0) {
    return "No active microphones";
  }
  
  // Prefer LIVE then IDLE then CONNECTED then PAUSED
  const parts = [];
  if (counts.LIVE) parts.push(`${counts.LIVE} speaking`);
  if (counts.IDLE) parts.push(`${counts.IDLE} listening`);
  if (!parts.length && counts.CONNECTED) parts.push(`${counts.CONNECTED} ready`);
  if (counts.PAUSED) parts.push(`${counts.PAUSED} paused`);
  
  return parts.join(", ");
}

function shouldShowMultiMicReassurance(counts) {
  // "Multiple microphones active — improved coverage"
  const activeMics = counts.LIVE + counts.IDLE + counts.CONNECTED;
  return activeMics >= 2;
}

// Optional: silence reassurance. You can drive this via timestamps if available.
function shouldShowSilenceReassurance(roomSignal) {
  // roomSignal example: { confidence, lastSegmentMsAgo, ... } if you expose it later.
  // If you already have something similar client-side, wire it here.
  const conf = roomSignal?.confidence ?? 0;
  const lastSegAgo = roomSignal?.lastSegmentMsAgo ?? null;
  
  // Only show if we have enough confidence AND we know it's been quiet.
  if (conf >= 0.6 && typeof lastSegAgo === "number" && lastSegAgo >= 35000) return true;
  return false;
}

// Disconnect detection (non-alarming)
window.__prevDeviceStatusById = window.__prevDeviceStatusById || new Map();

function detectDisconnectToast(devices) {
  const prev = window.__prevDeviceStatusById;
  let disconnected = false;
  
  for (const d of (devices || [])) {
    const id = d.deviceId || d.micId || d.id;
    if (!id) continue;
    
    const curr = normalizeTruthStatus(d);
    const last = prev.get(id);
    
    if (last === "LIVE" && curr === "OFFLINE") disconnected = true;
    prev.set(id, curr);
  }
  
  if (disconnected) {
    const el = document.getElementById("micNotice");
    if (el) {
      el.textContent = "A microphone disconnected";
      el.style.display = "";
      clearTimeout(window.__micNoticeTimer);
      window.__micNoticeTimer = setTimeout(() => {
        el.style.display = "none";
      }, 4000);
    }
  }
}

function updateDeviceListUI(devices) {
    if (!micHealthList) return;
    
    if (!devices || devices.length === 0) {
        updateMicHealthStrip([]);
        // B3: Update viewer status to show "No mics"
        if (viewerMicsStatus) {
            viewerMicsStatus.textContent = 'No active microphones';
        }
        // Update listening state
        const elListening = document.getElementById("roomListeningState");
        if (elListening) elListening.textContent = "Not listening — no active microphones";
        return;
    }
    
    // B3 UX Sanity Pass: Use helper functions for consistent labels and summaries
    const counts = summarizeStatuses(devices);
    
    // Map devices to mic roster format with truth model status
    const micRoster = devices.map(dev => {
        const truthStatus = normalizeTruthStatus(dev);
        
        // Map to legacy format for backward compatibility with updateMicHealthStrip
        let legacyStatus = 'quiet';
        if (truthStatus === 'LIVE') {
            legacyStatus = 'live';
        } else if (truthStatus === 'IDLE') {
            legacyStatus = 'sending';
        } else if (truthStatus === 'CONNECTED') {
            legacyStatus = 'quiet';
        } else if (truthStatus === 'PAUSED') {
            legacyStatus = 'quiet';
        } else {
            legacyStatus = 'offline';
        }
        
        return {
            name: dev.name,
            status: legacyStatus, // For backward compatibility
            truthStatus: truthStatus, // B3: Store truth model status
            statusLabel: labelForStatus(truthStatus), // B3: Human-readable label
            streaming: dev.streaming,
            paused: dev.paused,
            lastActivity: dev.lastSeen || dev.heartbeatTs || Date.now(),
            lastAudioTs: dev.lastAudioTs || null,
            lastSpeechTs: dev.lastSpeechTs || null
        };
    });
    
    // Update listening state line
    const now = Date.now();
    // Use __viewerOpenedAt if available (set on page load), fallback to __roomJoinedAt (set on WebSocket connect)
    const viewerOpenedAt = window.__viewerOpenedAt || window.__roomJoinedAt;
    const connectingGrace = (viewerOpenedAt && (now - viewerOpenedAt < 5000));
    const listeningLine = pickListeningState(counts, connectingGrace);
    const summaryLine = makeDeviceSummaryLine(counts);
    
    const elListening = document.getElementById("roomListeningState");
    if (elListening) elListening.textContent = listeningLine;
    
    // Update viewer status summary
    if (viewerMicsStatus) {
        viewerMicsStatus.textContent = summaryLine;
    }
    
    // Optional multi-mic reassurance
    const elMulti = document.getElementById("multiMicNote");
    if (elMulti) {
        elMulti.style.display = shouldShowMultiMicReassurance(counts) ? "" : "none";
        if (elMulti.textContent.trim() === "") {
            elMulti.textContent = "Multiple microphones active — improved coverage";
        }
    }
    
    // Detect disconnects (non-alarming)
    detectDisconnectToast(devices);
    
    // Use existing updateMicHealthStrip for rendering (enhanced with truth model)
    updateMicHealthStrip(micRoster);
}

// Update mic health indicator strip (replaces old mic roster card)
function updateMicHealthStrip(micRoster) {
    if (!micHealthList) return;
    
    micHealthList.innerHTML = '';
    if (viewerMicBanner) viewerMicBanner.style.display = 'none';
    
    if (!micRoster || micRoster.length === 0) {
        const chip = document.createElement('div');
        chip.className = 'mic-health-chip offline';
        chip.innerHTML = '<span class="status-dot"></span> No mics';
        chip.title = 'No microphones connected to this room';
        micHealthList.appendChild(chip);
        if (viewerMicBanner) {
            viewerMicBanner.style.display = 'block';
            viewerMicBanner.textContent = 'No microphones connected. Open Invite → copy the mic link to add a speaker device.';
        }
        return;
    }
    
    const now = Date.now();
    let liveCount = 0;
    let sendingCount = 0;
    let quietCount = 0;
    let offlineCount = 0;
    micRoster.forEach(mic => {
        const lastActivity = mic.lastActivity || mic.lastSeen || mic.connectedAt || 0;
        const lastTranscript = mic.lastTranscript || 0;
        const secSinceActivity = Math.floor((now - lastActivity) / 1000);
        const secSinceTranscript = lastTranscript ? Math.floor((now - lastTranscript) / 1000) : null;
        
        // B3 UX Sanity Pass: Use helper functions for consistent labels and tooltips
        const truthStatus = normalizeTruthStatus(mic);
        const statusLabel = mic.statusLabel || labelForStatus(truthStatus);
        const tooltipText = tooltipForStatus(truthStatus);
        
        // Map truth status to legacy display status for CSS classes
        let status = 'quiet';
        if (truthStatus === 'LIVE') {
            status = 'live';
        } else if (truthStatus === 'IDLE') {
            status = 'sending';
        } else if (truthStatus === 'CONNECTED') {
            status = 'quiet';
        } else if (truthStatus === 'PAUSED') {
            status = 'quiet';
        } else {
            status = 'offline';
        }
        
        // Fallback: compute from timestamps if truth model not available (legacy behavior)
        if (!mic.truthStatus && !mic.status) {
            // Viewer-friendly status:
            // - live: server produced transcript recently
            // - sending: server is receiving audio recently, but hasn't produced transcript yet (quiet/noisy)
            // - quiet: connected but no recent activity
            // - offline: stale/disconnected
            if (secSinceActivity <= 20) {
                status = (secSinceTranscript !== null && secSinceTranscript <= 30) ? 'live' : 'sending';
            } else if (secSinceActivity <= 60) {
                status = 'quiet';
            } else {
                status = 'offline';
            }
        }
        
        // Format "last seen" time
        let lastSeenText = '';
        if (status === 'offline') {
            if (secSinceActivity < 3600) {
                lastSeenText = `${Math.floor(secSinceActivity / 60)}m ago`;
            } else {
                lastSeenText = `${Math.floor(secSinceActivity / 3600)}h ago`;
            }
        } else if (status === 'quiet') {
            lastSeenText = secSinceActivity < 60 ? `${secSinceActivity}s ago` : `${Math.floor(secSinceActivity / 60)}m ago`;
        } else if (status === 'sending') {
            lastSeenText = secSinceActivity < 60 ? `${secSinceActivity}s ago` : `${Math.floor(secSinceActivity / 60)}m ago`;
        }
        
        // Build tooltip with device name
        const tooltip = `${mic.name}: ${tooltipText}`;
        
        const chip = document.createElement('div');
        const truthStatusClass = `truth-${truthStatus.toLowerCase()}`;
        chip.className = `mic-health-chip ${status} ${truthStatusClass}`;
        chip.title = tooltip;
        chip.innerHTML = `
            <span class="status-dot"></span>
            <span class="mic-name">${escapeHtml(mic.name)}</span>
            <span class="mic-status-label">${statusLabel}</span>
            ${lastSeenText ? `<span class="mic-last-seen">${lastSeenText}</span>` : ''}
        `;
        micHealthList.appendChild(chip);

        if (status === 'live') liveCount++;
        else if (status === 'sending') sendingCount++;
        else if (status === 'quiet') quietCount++;
        else offlineCount++;
    });

    // Viewer banner guidance
    if (viewerMicBanner) {
        if (sendingCount > 0 && liveCount === 0) {
            viewerMicBanner.style.display = 'block';
            viewerMicBanner.textContent =
                'Receiving audio, but not getting clear speech yet. Move the mic closer, reduce background noise, and confirm the mic device isn’t muted.';
        } else if (quietCount > 0 && liveCount === 0 && sendingCount === 0) {
            viewerMicBanner.style.display = 'block';
            viewerMicBanner.textContent =
                'Mic(s) connected but quiet. If people are speaking, check the mic device is unmuted and has mic permission.';
        }
    }
}

// Show or hide admin-only UI elements based on the presence of an admin token.
// Currently controls the Edit button on the Next Steps card.
function updateAdminUI() {
    if (!editActionsBtn) return;
    editActionsBtn.style.display = adminToken ? 'inline-block' : 'none';
}

// Initialize the onboarding banner for first-time viewers. The banner informs users
// that viewer mode is read-only and that their microphone is not accessed.
function initOnboardingBanner() {
    if (!onboardingBanner) return;
    let dismissed = null;
    try {
        dismissed = localStorage.getItem('viewerOnboardingDismissed');
    } catch {}

    if (!dismissed) {
        onboardingBanner.style.display = 'flex';
        if (dismissOnboardingBtn) {
            dismissOnboardingBtn.onclick = () => {
                onboardingBanner.style.display = 'none';
                try {
                    localStorage.setItem('viewerOnboardingDismissed', '1');
                } catch {}
            };
        }
    } else {
        onboardingBanner.style.display = 'none';
    }
}

// IMPROVEMENT: Update status more frequently to catch state changes
function updateListeningStatus() {
    if (currentRole !== 'viewer' || !viewerScreen || !viewerScreen.classList || !viewerScreen.classList.contains('active')) {
        return;
    }
    
    // If we have room state, update it (this will refresh the status)
    if (lastRoomState) {
        updateRoomState(lastRoomState);
    } else {
        // No room state yet, use what we know
        const status = getListeningStatus(null, lastTranscriptAt, lastMicRoster, transcriptEntries);
        updateTopicDisplay(status, null);
        updateSummaryDisplay(status, null);
        updateAwarenessDock(status);
    }
}

function updateList(listElement, items) {
    listElement.innerHTML = '';
    if (items.length === 0) {
        const li = document.createElement('li');
        li.className = 'empty-state';
        if (listElement === decisionsList) {
            li.textContent = 'Nothing decided yet.';
        } else if (listElement === nextStepsList) {
            li.textContent = 'No next steps yet.';
        } else {
            li.textContent = 'None yet';
        }
        listElement.appendChild(li);
    } else {
        items.forEach(item => {
            const li = document.createElement('li');
            li.textContent = item;
            listElement.appendChild(li);
        });
    }
}

function updateMicRoster(micRoster) {
    // Legacy function - now redirects to mic health strip
    // Note: Logging moved to device_list handler to avoid duplicate logs
    updateMicHealthStrip(micRoster);
    
    // Also update old mic roster card if it still exists (backward compatibility)
    const micRosterCardEl = document.getElementById('micRosterCard');
    if (micRosterCardEl) {
        micRosterCardEl.style.display = 'none'; // Hide old card, use health strip instead
    }
}

function normalizeSegmentToEntry(seg) {
    if (!seg) return null;
    return {
        id: seg.id,
        ts: seg.tEndMs || seg.ts || Date.now(),
        speaker: seg.speaker || 'Unknown',
        text: seg.text || ''
    };
}

function clearTranscriptUI() {
    transcriptContent.innerHTML = '<div class="empty-state">Listening…</div>';
    segmentDomById.clear();
    lastTranscriptEntry = null;
    segmentsNextCursor = null;
    if (loadOlderBtn) loadOlderBtn.style.display = 'none';
    if (jumpLiveBtn) jumpLiveBtn.style.display = 'none';
}

function createTranscriptRow(entry) {
    const div = document.createElement('div');
    div.className = 'transcript-entry';
    div.dataset.segmentId = entry.id || '';
    div.innerHTML = `
        <div class="transcript-row">
            <span class="speaker-chip">${escapeHtml(entry.speaker)}</span>
        <span class="transcript-text">${escapeHtml(entry.text)}</span>
        </div>
    `;
    return div;
}

function upsertTranscriptEntry(entry, { prepend = false } = {}) {
    if (!entry) return;
    const id = entry.id;

    // Suppress [inaudible] spam - replace with single message
    if (entry.text && /^\[inaudible\]$/i.test(entry.text.trim())) {
        // Don't add [inaudible] entries - they're noise
        return;
    }

    // Remove empty state if present
    const emptyState = transcriptContent.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    if (id && segmentDomById.has(id)) {
        const el = segmentDomById.get(id);
        const textSpan = el?.querySelector('.transcript-text');
        if (textSpan) textSpan.textContent = entry.text;
        return;
    }

    const row = createTranscriptRow(entry);
    if (id) segmentDomById.set(id, row);

    if (prepend) {
        transcriptContent.prepend(row);
    } else {
        transcriptContent.appendChild(row);
    }

    lastTranscriptEntry = { ...entry };

    // Compact transcript mode: Keep only last 2-4 entries visible
    // Remove older entries to keep transcript card compact and not dominating
    const allEntries = Array.from(transcriptContent.children);
    const maxVisibleEntries = 4;
    if (allEntries.length > maxVisibleEntries && !prepend) {
        // Remove oldest entries, keep only last 4
        const toRemove = allEntries.slice(0, allEntries.length - maxVisibleEntries);
        toRemove.forEach(el => {
            const entryId = el.dataset.segmentId;
            if (entryId) segmentDomById.delete(entryId);
            el.remove();
        });
    }

    if (!userScrolledUp && !prepend) {
        transcriptContent.scrollTop = transcriptContent.scrollHeight;
    }
}

function replaceTranscriptWithSegments(segments) {
    transcriptEntries = [];
    segmentDomById.clear();
    transcriptContent.innerHTML = '';

    segments.forEach(seg => {
        const entry = normalizeSegmentToEntry(seg);
        if (!entry) return;
        transcriptEntries.push(entry);
        upsertTranscriptEntry(entry);
    });

    if (transcriptEntries.length === 0) {
        transcriptContent.innerHTML = '<div class="empty-state">Listening…</div>';
    }
}

function handleSegmentEvent(action, seg) {
    const entry = normalizeSegmentToEntry(seg);
    if (!entry) return;

    // Keep export cache updated
    const idx = transcriptEntries.findIndex(e => e.id === entry.id);
    if (idx >= 0) transcriptEntries[idx] = entry;
    else transcriptEntries.push(entry);

    lastTranscriptAt = entry.ts || Date.now();
    updateViewerPrompt();
    // IMPROVEMENT: Update listening status when segment arrives
    updateListeningStatus();

    upsertTranscriptEntry(entry);
}

async function fetchSegmentsPage({ cursor = null, limit = 80 } = {}) {
    const url = new URL(`/api/room/${currentRoom}/segments`, window.location.origin);
    url.searchParams.set('limit', String(limit));
    if (cursor != null) url.searchParams.set('cursor', String(cursor));
    // Append passcode if room is passcode-protected
    const passcode = getRoomPasscode(currentRoom);
    if (passcode) url.searchParams.set('pass', passcode);

    const res = await fetch(url.toString());
    if (!res.ok) {
        // Segments endpoint doesn't exist yet - return empty segments
        // Transcripts will come via WebSocket instead
        if (res.status === 404) {
            return { segments: [], nextCursor: null };
        }
        throw new Error(`Failed to load segments: ${res.status}`);
    }
    return await res.json();
}

async function loadInitialSegments() {
    if (!currentRoom || currentRole !== 'viewer') return;
    clearTranscriptUI();

    try {
        const { segments, nextCursor } = await fetchSegmentsPage({ limit: 80 });
        replaceTranscriptWithSegments(Array.isArray(segments) ? segments : []);
        segmentsNextCursor = nextCursor ?? null;

        if (loadOlderBtn) loadOlderBtn.style.display = segmentsNextCursor != null ? 'inline-flex' : 'none';
        if (jumpLiveBtn) jumpLiveBtn.style.display = 'none';
    } catch (error) {
        // If segments endpoint fails, just show empty transcript
        // Transcripts will come via WebSocket
        console.warn('Could not load initial segments:', error);
        clearTranscriptUI();
    }
}

async function loadOlderSegments() {
    if (segmentsNextCursor == null) return;
    const prevScrollHeight = transcriptContent.scrollHeight;
    const prevScrollTop = transcriptContent.scrollTop;

    const { segments, nextCursor } = await fetchSegmentsPage({ cursor: segmentsNextCursor, limit: 80 });
    const segs = Array.isArray(segments) ? segments : [];
    // Prepend in chronological order
    for (let i = segs.length - 1; i >= 0; i--) {
        const entry = normalizeSegmentToEntry(segs[i]);
        if (!entry) continue;
        if (!transcriptEntries.some(e => e.id === entry.id)) {
            transcriptEntries.unshift(entry);
        }
        upsertTranscriptEntry(entry, { prepend: true });
    }

    segmentsNextCursor = nextCursor ?? null;
    if (loadOlderBtn) loadOlderBtn.style.display = segmentsNextCursor != null ? 'inline-flex' : 'none';

    // Maintain scroll position when prepending
    const newScrollHeight = transcriptContent.scrollHeight;
    transcriptContent.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
}

function addTranscriptEntry(entry) {
    // Backward-compatible path: treat transcript entries as segments (no client-side merge)
    upsertTranscriptEntry(entry);
}

if (loadOlderBtn) {
    loadOlderBtn.addEventListener('click', () => {
        loadOlderSegments().catch(() => showToast('Failed to load older transcript', 'warn'));
    });
}

if (jumpLiveBtn) {
    jumpLiveBtn.addEventListener('click', () => {
        transcriptContent.scrollTop = transcriptContent.scrollHeight;
        userScrolledUp = false;
        jumpLiveBtn.style.display = 'none';
    });
}

// Track user scroll (autoscroll + jump-to-live)
if (transcriptContent) transcriptContent.addEventListener('scroll', () => {
    const isAtBottom = transcriptContent.scrollHeight - transcriptContent.scrollTop <= transcriptContent.clientHeight + 50;
    userScrolledUp = !isAtBottom;
    if (jumpLiveBtn) {
        jumpLiveBtn.style.display = userScrolledUp ? 'inline-flex' : 'none';
    }
});

function handleTopicShift(message) {
    topicShiftText.textContent = `${message.topic}${message.subtopic ? ' - ' + message.subtopic : ''}`;
    topicShiftAlert.style.display = 'block';

    // Also append to the Topic log panel (viewer-only)
    addTopicLogEntry({
        ts: Date.now(),
        fromTopic: message.fromTopic || message.prevTopic || '',
        toTopic: message.topic || '',
        confidence: message.confidence,
        toSubtopic: message.subtopic || '',
        toStatus: message.status || '',
        source: 'ws'
    });
    
    // Hide after 5 seconds
    setTimeout(() => {
        topicShiftAlert.style.display = 'none';
    }, 5000);
    
    // Optional: vibrate if supported
    if (navigator && typeof navigator.vibrate === 'function') {
        navigator.vibrate(200);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Phase 2: viewer buttons
if (copyMicLinkBtn) {
    copyMicLinkBtn.addEventListener('click', () => {
        if (!currentRoom) return;
        buildMicJoinLink(currentRoom).then(copyText);
    });
}
if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', () => {
        if (!currentRoom) return;
        copyText(currentRoom);
    });
}
if (exportBtn) {
    exportBtn.addEventListener('click', exportRoom);
}

if (saveClearBtn) {
    saveClearBtn.addEventListener('click', () => {
        if (!currentRoom) {
            showToast('No room active', 'warn');
            return;
        }
        // Mark that a save & clear operation is pending
        saveClearPending = true;
        try {
            if (ws && ws.readyState === WebSocket.OPEN) {
                if (adminToken) {
                    // Host request: ask server to save summary and clear transcripts
                    ws.send(JSON.stringify({
                        type: 'save_and_clear',
                        adminToken
                    }));
                } else {
                    // Viewer request: just request full conversation summary (no clearing)
                    ws.send(JSON.stringify({
                        type: 'read_room'
                    }));
                }
            } else {
                showToast('WebSocket not connected. Please try again later.', 'error');
                saveClearPending = false;
                return;
            }
        } catch (error) {
            console.error('Failed to send save_clear/read_room message:', error);
            showToast('Failed to save and clear.', 'error');
            saveClearPending = false;
            return;
        }
        // Immediately clear local UI for a fresh start
        lastRoomState = null;
        if (typeof clearTranscriptUI === 'function') {
            clearTranscriptUI();
        }
        updateRoomState(null);
    });
}

// Edit actions (decisions and next steps) button handler for admins
if (editActionsBtn) {
    editActionsBtn.addEventListener('click', () => {
        // Require admin token
        if (!adminToken) {
            showToast('You are not authorized to edit actions.', 'warn');
            return;
        }

        const currentDecisions = (lastRoomState && lastRoomState.summary && Array.isArray(lastRoomState.summary.decisions))
            ? lastRoomState.summary.decisions
            : [];
        const currentNextSteps = (lastRoomState && lastRoomState.summary && Array.isArray(lastRoomState.summary.next_steps))
            ? lastRoomState.summary.next_steps
            : [];

        const decStr = window.prompt('Enter decisions (one per line):', currentDecisions.join('\n'));
        if (decStr === null) return;
        const nextStr = window.prompt('Enter next steps (one per line):', currentNextSteps.join('\n'));
        if (nextStr === null) return;

        const decisions = decStr.split(/\n+/).map(s => s.trim()).filter(s => s.length > 0);
        const nextSteps = nextStr.split(/\n+/).map(s => s.trim()).filter(s => s.length > 0);

        try {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'update_next_steps',
                    adminToken,
                    decisions,
                    next_steps: nextSteps
                }));
                showToast('Updating decisions/next steps…', 'info');
            } else {
                showToast('WebSocket not connected. Please try again later.', 'error');
            }
        } catch (error) {
            console.error('Failed to send update_next_steps:', error);
            showToast('Failed to update actions', 'error');
        }
    });
}
if (viewerPromptCopyMicLinkBtn) {
    viewerPromptCopyMicLinkBtn.addEventListener('click', () => {
        if (!currentRoom) return;
        buildMicJoinLink(currentRoom).then(copyText);
    });
}

function closeInviteModal() {
    if (inviteModal) inviteModal.classList.add('hidden');
}

async function openInviteModal() {
    if (!currentRoom) return;
    // Default QR points to /viewer (primary link)
    const viewerLink = await buildViewerLink(currentRoom);
    const micLink = await buildMicJoinLink(currentRoom);

    // New modal fields
    if (viewerInviteLink) viewerInviteLink.value = viewerLink;
    if (micInviteLink) micInviteLink.value = micLink;
    if (viewerQrImg) viewerQrImg.src = `/api/room/${currentRoom}/invite-qr.png?role=viewer`;

    // Legacy fallback
    if (inviteLinkEl) inviteLinkEl.value = viewerLink;
    if (inviteQrImg) inviteQrImg.src = `/api/room/${currentRoom}/invite-qr.png?role=viewer`;

    if (inviteModal) inviteModal.classList.remove('hidden');
}

if (btnInvite) btnInvite.addEventListener('click', openInviteModal);
if (hostInviteBtn) hostInviteBtn.addEventListener('click', openInviteModal);
if (inviteClose) inviteClose.addEventListener('click', closeInviteModal);
if (inviteModal) {
    inviteModal.addEventListener('click', (e) => {
        if (e.target === inviteModal) closeInviteModal();
    });
}

if (copyInviteLinkBtn) {
    copyInviteLinkBtn.addEventListener('click', async () => {
        const text = inviteLinkEl?.value || '';
        if (!text) return;
        await copyText(text);
    });
}

if (copyViewerLinkBtn) {
    copyViewerLinkBtn.addEventListener('click', async () => {
        const text = viewerInviteLink?.value || '';
        if (!text) return;
        await copyText(text);
    });
}

if (copyMicLinkModalBtn) {
    copyMicLinkModalBtn.addEventListener('click', async () => {
        const text = micInviteLink?.value || '';
        if (!text) return;
        await copyText(text);
    });
}

// Catch-up button (renamed from missedBtn)
if (catchUpBtn) {
    catchUpBtn.addEventListener('click', () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            alert('Not connected');
            return;
        }
        
        ws.send(JSON.stringify({
            type: 'missed',
            since: lastMissedCheck
        }));
        
        lastMissedCheck = Date.now();
    });
}

// Read the Room button
if (readRoomBtn) {
    readRoomBtn.addEventListener('click', () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            showToast('Not connected', 'warn');
            return;
        }
        
        // Show loading state
        if (readRoomPanel) readRoomPanel.style.display = 'block';
        if (readRoomSummary) readRoomSummary.textContent = 'Generating full overview...';
        if (readRoomPoints) readRoomPoints.innerHTML = '';
        if (readRoomSegmentNote) readRoomSegmentNote.style.display = 'none';
        if (readRoomDecisionsSection) readRoomDecisionsSection.style.display = 'none';
        if (readRoomNextStepsSection) readRoomNextStepsSection.style.display = 'none';
        if (readRoomDecisions) readRoomDecisions.innerHTML = '';
        if (readRoomNextSteps) readRoomNextSteps.innerHTML = '';
        
        ws.send(JSON.stringify({
            type: 'read_room'
        }));
    });
}

// Close Read the Room panel
if (readRoomCloseBtn) {
    readRoomCloseBtn.addEventListener('click', () => {
        if (readRoomPanel) readRoomPanel.style.display = 'none';
    });
}

// Copy button for Full Room Overview
if (readRoomCopyBtn) {
    readRoomCopyBtn.addEventListener('click', async () => {
        if (!readRoomSummary) return;
        
        // Build the full summary text
        let report = '';
        
        const overview = readRoomSummary.textContent || '';
        if (overview && overview !== 'Generating full overview...' && overview !== 'No overview available.') {
            report += 'Overview:\n' + overview + '\n\n';
        }
        
        if (readRoomPoints) {
            const keyPoints = Array.from(readRoomPoints.querySelectorAll('li:not(.empty-state)'))
                .map(li => li.textContent.trim())
                .filter(Boolean);
            if (keyPoints.length > 0) {
                report += 'Key Points:\n' + keyPoints.map(p => '- ' + p).join('\n') + '\n\n';
            }
        }
        
        if (readRoomDecisions && readRoomDecisionsSection && readRoomDecisionsSection.style.display !== 'none') {
            const decisions = Array.from(readRoomDecisions.querySelectorAll('li'))
                .map(li => li.textContent.trim())
                .filter(Boolean);
            if (decisions.length > 0) {
                report += 'Decisions:\n' + decisions.map(d => '- ' + d).join('\n') + '\n\n';
            }
        }
        
        if (readRoomNextSteps && readRoomNextStepsSection && readRoomNextStepsSection.style.display !== 'none') {
            const nextSteps = Array.from(readRoomNextSteps.querySelectorAll('li'))
                .map(li => li.textContent.trim())
                .filter(Boolean);
            if (nextSteps.length > 0) {
                report += 'Next Steps:\n' + nextSteps.map(n => '- ' + n).join('\n');
            }
        }
        
        const finalReport = report.trim();
        if (finalReport) {
            await copyText(finalReport);
            showToast('Full Room Overview copied to clipboard.', 'info');
        } else {
            showToast('No summary available to copy.', 'warn');
        }
    });
}

// Legacy support for missedBtn if it still exists
if (missedBtn) {
    missedBtn.addEventListener('click', () => {
        if (catchUpBtn) catchUpBtn.click();
    });
}

// Analyze title button handler
if (analyzeTitleBtn) {
    analyzeTitleBtn.addEventListener('click', async () => {
        if (!currentRoom) {
            showToast('No room active', 'warn');
            return;
        }

        // Check if transcripts are available before making the request
        if (!transcriptEntries || transcriptEntries.length === 0) {
            showToast('No transcripts available yet. Start speaking to generate transcripts.', 'warn');
            return;
        }

        // Disable button while analyzing
        analyzeTitleBtn.disabled = true;
        const originalText = analyzeTitleBtn.textContent;
        analyzeTitleBtn.textContent = 'Analyzing...';

        try {
            const response = await fetch(`/api/room/${currentRoom}/analyze-title`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMsg = errorData.error || 'Failed to analyze title';
                // Provide user-friendly message for common errors
                if (errorMsg.includes('No transcripts available')) {
                    showToast('No transcripts available yet. Start speaking to generate transcripts.', 'warn');
                } else {
                    throw new Error(errorMsg);
                }
                return;
            }

            const data = await response.json();
            if (data.title) {
                showToast(`Title analyzed: ${data.title}`, 'info');
                // State update will come via WebSocket broadcast, which will update the UI
            } else {
                throw new Error('No title returned');
            }
        } catch (error) {
            // Only log and show error if it's not a handled case (like the early return above)
            if (error.message && !error.message.includes('No transcripts available')) {
                console.error('Title analysis error:', error);
                showToast(error.message || 'Failed to analyze title', 'error');
            }
        } finally {
            // Re-enable button
            analyzeTitleBtn.disabled = false;
            analyzeTitleBtn.textContent = originalText;
        }
    });
}

// Role module: Enable/disable mic from viewer
if (enableMicBtn) {
    enableMicBtn.addEventListener('click', async () => {
        await enableMicFromViewer();
    });
}
if (muteMicBtn) {
    muteMicBtn.addEventListener('click', () => {
        toggleMicMute();
    });
}
if (disableMicBtn) {
    disableMicBtn.addEventListener('click', () => {
        disableMicFromViewer();
    });
}

// Viewer topbar mic button
if (viewerMicBtn) {
    viewerMicBtn.addEventListener('click', async () => {
        if (!isMicEnabled) {
            await enableMicFromViewer();
        } else {
            toggleMicMute();
        }
    });
    updateViewerMicButtonUI();
}

if (disableMicMenuBtn) {
    disableMicMenuBtn.addEventListener('click', () => {
        disableMicFromViewer();
    });
}

// Zen mode toggle
if (zenModeToggle) {
    let zenMode = localStorage.getItem('huddle_zen_mode') === 'true';
    zenModeToggle.addEventListener('click', () => {
        zenMode = !zenMode;
        localStorage.setItem('huddle_zen_mode', zenMode.toString());
        updateZenMode(zenMode);
    });
    
    // Transcript toggle - collapse/expand transcript
    if (transcriptToggle) {
        // Default: expanded (so "What's Being Said" actually shows content without extra clicks)
        const stored = localStorage.getItem('huddle_transcript_expanded');
        const prefersCollapsed = window.matchMedia && window.matchMedia('(max-width: 1023px)').matches;
        let transcriptExpanded = stored === null ? !prefersCollapsed : stored === 'true';
        transcriptToggle.addEventListener('click', () => {
            transcriptExpanded = !transcriptExpanded;
            localStorage.setItem('huddle_transcript_expanded', transcriptExpanded.toString());
            
            if (transcriptExpanded) {
                transcriptContent.classList.remove('transcript-collapsed');
                transcriptToggle.textContent = 'Hide';
            } else {
                transcriptContent.classList.add('transcript-collapsed');
                transcriptToggle.textContent = 'Show';
            }
        });
        
        // Initialize transcript state
        if (!transcriptExpanded) {
            transcriptContent.classList.add('transcript-collapsed');
            transcriptToggle.textContent = 'Show';
        } else {
            transcriptContent.classList.remove('transcript-collapsed');
            transcriptToggle.textContent = 'Hide';
        }
    }
    
    // Initialize Zen mode from localStorage
    updateZenMode(zenMode);
}

function updateZenMode(enabled) {
    if (!zenModeToggle || !transcriptCard) return;
    
    if (enabled) {
        transcriptCard.classList.add('zen-mode-hidden');
        zenModeToggle.classList.add('active');
        zenModeToggle.textContent = 'Show Transcript';
    } else {
        transcriptCard.classList.remove('zen-mode-hidden');
        zenModeToggle.classList.remove('active');
        zenModeToggle.textContent = 'Zen';
    }
}

function showMissedResult(result) {
    // Support both old "missed" field and new "summary" field for backward compatibility
    missedSummary.textContent = result.summary || result.missed || 'No new activity.';
    
    missedPoints.innerHTML = '';
    if (result.key_points && result.key_points.length > 0) {
        result.key_points.forEach(point => {
            const li = document.createElement('li');
            li.textContent = point;
            missedPoints.appendChild(li);
        });
    }
    
    catchUpPanel.style.display = 'block';
    catchUpPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Host screen: Open Room button - navigate to viewer screen
if (hostOpenRoomBtn) {
    hostOpenRoomBtn.addEventListener('click', () => {
        if (!currentRoom) {
            showToast('No room available. Please create a room first.', 'warn');
            console.warn('[App] Open Room clicked but currentRoom is null');
            return;
        }
        justCreatedRoom = false; // Clear flag when user manually opens room
        console.log('[App] Open Room clicked, currentRoom:', currentRoom, 'currentRole:', currentRole);
        try {
            // Set role to viewer if not already set
            if (!currentRole || currentRole === 'host') {
                currentRole = 'viewer';
            }
            // Ensure we're connected as viewer before showing viewer screen
            if (ws && ws.readyState === WebSocket.OPEN) {
                // Already connected, send join message as viewer if needed
                if (currentRole === 'viewer') {
                    ws.send(JSON.stringify({
                        type: 'join',
                        roomCode: currentRoom,
                        role: 'viewer',
                        name: userName,
                        deviceId: deviceId,
                        passcode: getRoomPasscode(currentRoom)
                    }));
                    // showViewerScreen will be called when 'joined' message is received
                } else {
                    showViewerScreen();
                }
            } else if (currentRoom) {
                // Not connected, connect as viewer first
                // showViewerScreen will be called when 'joined' message is received
                connectAndJoinAsViewer(currentRoom, getRoomPasscode(currentRoom));
            } else {
                showViewerScreen();
            }
        } catch (error) {
            console.error('[App] Error showing viewer screen:', error);
            showToast('Failed to open room. Please try again.', 'error');
            // Fallback: try navigating to viewer route
            if (currentRoom) {
                window.location.assign(`/viewer?room=${encodeURIComponent(currentRoom)}`);
            }
        }
    });
}

// Leave buttons
if (leaveViewerBtn) leaveViewerBtn.addEventListener('click', () => {
    if (ws) ws.close();
    reset();
});

if (leaveMicBtn) leaveMicBtn.addEventListener('click', () => {
    stopMic();
    if (ws) ws.close();
    reset();
});

// Open Room button (opens viewer in new tab)
if (openRoomBtn) {
    openRoomBtn.addEventListener('click', async () => {
        if (!currentRoom) {
            showToast('No room to open', 'warn');
            return;
        }
        try {
            const viewerUrl = await buildViewerLink(currentRoom);
            if (!viewerUrl) {
                showToast('Failed to build room URL', 'error');
                return;
            }
            const newWindow = window.open(viewerUrl, '_blank');
            if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                // Popup blocked - try alternative approach
                showToast('Popup blocked. Please allow popups and try again, or copy the room code.', 'warn');
                // Fallback: show the URL so user can copy it
                try {
                    await copyText(viewerUrl);
                    showToast('Room URL copied to clipboard. Paste it in a new tab.', 'info');
                } catch (copyError) {
                    // If copy also fails, at least show the URL in console
                    console.log('Room URL:', viewerUrl);
                    showToast('Popup blocked. Check console for room URL.', 'warn');
                }
            } else {
                showToast('Opening room as viewer in new tab', 'info');
            }
        } catch (error) {
            console.error('Error opening room:', error);
            showToast(`Failed to open room: ${error.message}`, 'error');
        }
    });
}

function reset() {
    currentRoom = null;
    currentRole = null;
    userName = '';
    adminToken = null;
    if (joinScreen && joinScreen.classList) joinScreen.classList.add('active');
    if (hostScreen && hostScreen.classList) hostScreen.classList.remove('active');
    if (viewerScreen && viewerScreen.classList) viewerScreen.classList.remove('active');
    if (micScreen && micScreen.classList) micScreen.classList.remove('active');
    if (roomLivePill) roomLivePill.style.display = 'none';
    stopLiveNowTimer();
    if (userNameInput) userNameInput.value = '';
    if (roomCodeInput) roomCodeInput.value = '';
    if (typeof clearTranscriptUI === 'function') clearTranscriptUI();
    if (catchUpPanel) catchUpPanel.style.display = 'none';
    if (consentCheckbox) consentCheckbox.checked = false;
    if (startMicBtn) startMicBtn.disabled = true;
    stopMic();
    userScrolledUp = false;
    chunksSent = 0;
    chunksAcked = 0;
    lastSentTime = null;
    lastAckTime = null;
    lastTranscriptEntry = null;
    transcriptEntries = [];
    lastRoomState = null;
    lastTranscriptAt = 0;
    lastMicRoster = [];
    lastBlob = null;
    lastTopicUpdate = null;
    pendingTopicUpdate = null;
    micTranscriptEntries.length = 0;
    micSegmentDomById.clear();
    if (micWarningBanner) micWarningBanner.style.display = 'none';
    if (consentError) consentError.style.display = 'none';
    if (micTranscriptContent) {
        micTranscriptContent.innerHTML = '<div class="empty-state">Listening…</div>';
        // Don't collapse on reset - keep user's preference or default to expanded
        const stored = localStorage.getItem('huddle_mic_transcript_expanded');
        const transcriptExpanded = stored === null ? true : stored === 'true';
        if (!transcriptExpanded) {
            micTranscriptContent.classList.add('mic-transcript-collapsed');
        } else {
            micTranscriptContent.classList.remove('mic-transcript-collapsed');
        }
    }
    if (window.__topicUpdateTimeout) {
        clearTimeout(window.__topicUpdateTimeout);
        window.__topicUpdateTimeout = null;
    }
    teardownVAD();
}

function showToast(message, type = 'info') {
    // Simple toast notification with auto-hide
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Auto-hide after 3 seconds (unless fatal error)
    const hideDelay = type === 'error' && message.includes('fatal') ? 10000 : 3000;
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, hideDelay);
}

// Mic controls
if (startMicBtn) startMicBtn.addEventListener('click', () => {
    if (!consentCheckbox.checked) {
        if (consentError) {
            consentError.style.display = 'block';
            setTimeout(() => {
                if (consentError) consentError.style.display = 'none';
            }, 5000);
        }
        return;
    }
    startMic();
});
if (stopMicBtn) stopMicBtn.addEventListener('click', stopMic);

// Update mic icon state
function updateMicIconState(state) {
    if (!micIconContainer) return;
    
    // Remove all state classes
    micIconContainer.classList.remove('mic-state-idle', 'mic-state-ready', 'mic-state-recording', 'mic-state-error');
    
    // Add new state class
    if (state) {
        micIconContainer.classList.add(`mic-state-${state}`);
    }
    
    // Handle pulse rings for recording state
    if (state === 'recording') {
        startPulseRings();
    } else {
        stopPulseRings();
    }
}

// Start pulse rings animation when recording
function startPulseRings() {
    if (!micPulseRings) return;
    stopPulseRings(); // Clear existing rings
    
    // Create multiple pulse rings
    for (let i = 0; i < 3; i++) {
        const ring = document.createElement('div');
        ring.className = 'mic-pulse-ring';
        ring.style.animationDelay = `${i * 0.67}s`;
        micPulseRings.appendChild(ring);
    }
}

// Stop pulse rings animation
function stopPulseRings() {
    if (!micPulseRings) return;
    micPulseRings.innerHTML = '';
}

async function startMic() {
    try {
        // Check if mediaDevices is available (Safari compatibility)
        if (!navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            const protocol = window.location.protocol;
            const hostname = window.location.hostname;
            const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
            const isHTTPS = protocol === 'https:';
            
            let errorMsg = 'Microphone access requires HTTPS. ';
            if (!isHTTPS && !isLocalhost) {
                errorMsg += 'Please use HTTPS or access via localhost. ';
                if (hostname.includes('192.168.') || hostname.includes('10.') || hostname.includes('172.')) {
                    errorMsg += 'For local IP addresses, use Cloudflare tunnel (cloudflared tunnel --url http://localhost:8787) or access via localhost.';
                }
            } else {
                errorMsg += 'Your browser may not support microphone access or it is disabled.';
            }
            throw new Error(errorMsg);
        }
        // Enable autoGainControl for iPad/iOS to boost audio signal and improve detection
        // This helps compensate for lower microphone sensitivity on mobile devices
        // Note: We also apply additional gain via Web Audio API gain node (see setupVAD)
        // For iPad/iOS, enable noise suppression and echo cancellation for better audio quality
        audioStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                channelCount: 1,
                sampleRate: 48000,
                echoCancellation: isIPad || isIOS ? true : false,  // Enable for iPad/iOS
                noiseSuppression: isIPad || isIOS ? true : false,  // Enable for iPad/iOS
                autoGainControl: isIPad || isIOS ? true : false // Enable for iPad/iOS to boost signal
            }
        });
        
        // Update icon to ready state
        updateMicIconState('ready');
        
        // Try Realtime mode first if available (requires REALTIME_ENABLED=true on server)
        // For iPad/iOS, prefer chunked transcription which is more reliable
        const shouldTryRealtime = window.RealtimeMic && !realtimeMicInitialized && !isIOS && !isIPad;
        if (shouldTryRealtime) {
            try {
                await window.RealtimeMic.init(currentRoom, clientId, userName);
                realtimeMicInitialized = true;
                await window.RealtimeMic.start();
                useRealtimeMode = true;
                micStreaming = true;
                
                startMicBtn.style.display = 'none';
                stopMicBtn.style.display = 'block';
                micStatus.textContent = 'Realtime Mic LIVE';
                if (micIndicator) micIndicator.style.display = 'inline-flex';
                if (micFeedback) micFeedback.style.display = 'block';
                if (micStats) micStats.style.display = 'block';
                if (micTranscriptCard) micTranscriptCard.style.display = 'block'; // Show transcript card when mic starts
                updateMicIconState('recording');
                chunksSent = 0;
                chunksAcked = 0;
                if (micWarningBanner) micWarningBanner.style.display = 'none';
                if (consentError) consentError.style.display = 'none';
                updateMicStats();
                console.log('Realtime mode started successfully');
                return; // Successfully started Realtime mode
            } catch (error) {
                console.warn('Realtime mode failed, falling back to chunked transcription:', error);
                useRealtimeMode = false;
                realtimeMicInitialized = false;
                // Clean up any partial Realtime state
                try {
                    if (window.RealtimeMic) window.RealtimeMic.cleanup();
                } catch (e) {}
                // Continue with fallback chunked transcription
            }
        } else if (isIOS || isIPad) {
            console.log('Using chunked transcription for iPad/iOS (more reliable)');
        }
        
        // Fallback to chunked transcription (existing implementation)
        useRealtimeMode = false;
        
        // Browser support matrix:
        // - Chrome/Firefox: audio/webm (opus) or audio/ogg (opus)
        // - iOS Safari: audio/mp4 (AAC) (sometimes reports video/mp4)
        const mimeTypes = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/ogg',
            'audio/mp4;codecs=mp4a.40.2',
            'audio/mp4',
            'audio/aac',
            'video/mp4'
        ];
        
        let mimeType = null;
        for (const mime of mimeTypes) {
            if (MediaRecorder.isTypeSupported(mime)) {
                mimeType = mime;
                break;
            }
        }
        
        if (!mimeType) {
            throw new Error('No supported audio format');
        }
        
        mediaRecorder = new MediaRecorder(audioStream, {
            mimeType: mimeType,
            audioBitsPerSecond: 128000
        });
        
        mediaRecorder.ondataavailable = async (event) => {
            if (!event.data || event.data.size === 0) return;
            
            const blob = event.data;
            const tsEnd = Date.now();
            const mimeType = blob.type || mimeType;

            // Cache the first chunk as an init/header segment. Some browsers (notably Firefox)
            // produce chunks that are not standalone-decodable unless the init segment is present.
            if (!initBlob) {
                initBlob = blob;
                initBlobMime = mimeType;
                initBlobTsEnd = tsEnd;
            }
            
            // VAD-lite gate + pre-roll:
            // - if not speaking, keep lastBlob but don't send
            // - if speaking, send lastBlob first (pre-roll) then current blob
            const chunkHadSpeech = !!vadChunkHadSpeech;
            vadChunkHadSpeech = false; // reset for the next chunk window
            const speakingNow = chunkHadSpeech || vadSpeaking || (Date.now() < vadHangUntil);
            
            if (!speakingNow) {
                // Not speaking - store as pre-roll but don't send
                lastBlob = blob;
                lastBlobMime = mimeType;
                lastBlobTsEnd = tsEnd;
                updateMicUI(mimeType);
                return;
            }

            // Ensure the server gets the init/header chunk once per recording session.
            if (!initSent && initBlob) {
                await sendBlob(initBlob, initBlobMime, initBlobTsEnd, { init: true });
                initSent = true;
            }
            
            // Speaking - send pre-roll first (to avoid chopping first syllable)
            if (lastBlob) {
                await sendBlob(lastBlob, lastBlobMime, lastBlobTsEnd);
                lastBlob = null;
            }
            
            // Send current blob
            await sendBlob(blob, mimeType, tsEnd);
            updateMicUI(mimeType);
        };
        
        mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event);
            showToast('Audio recording error. Try stopping and starting again.', 'error');
        };
        
        // Record in ~5s chunks for better phoneme continuity and word boundaries - VAD filters silence so cost stays low
        mediaRecorder.start(TIMESLICE_MS);
        micStreaming = true;
        
        console.log('MediaRecorder started, state:', mediaRecorder.state);
        console.log('Audio stream active:', audioStream.active);
        console.log('Audio tracks:', audioStream.getAudioTracks().map(t => ({
            enabled: t.enabled,
            muted: t.muted,
            readyState: t.readyState,
            label: t.label
        })));
        
        // Initialize improved VAD (Voice Activity Detection) with WebAudio
        setupVAD(audioStream);
        
        startMicBtn.style.display = 'none';
        stopMicBtn.style.display = 'block';
        micStatus.textContent = 'Mic LIVE • waiting for speech…';
        if (micIndicator) micIndicator.style.display = 'inline-flex';
        if (micFeedback) micFeedback.style.display = 'block';
        if (micStats) micStats.style.display = 'block';
        if (micTranscriptCard) micTranscriptCard.style.display = 'block'; // Show transcript card when mic starts
        updateMicIconState('recording');
        chunksSent = 0;
        chunksAcked = 0;
        lastBlob = null;
        initBlob = null;
        initBlobMime = '';
        initBlobTsEnd = 0;
        initSent = false;
        if (micWarningBanner) micWarningBanner.style.display = 'none';
        if (consentError) consentError.style.display = 'none';
        updateMicStats();
        
    } catch (error) {
        console.error('Error starting mic:', error);
        let errorMsg = 'Could not access microphone. ';
        if (error.name === 'NotAllowedError') {
            errorMsg += 'Please grant microphone permission in your browser settings.';
        } else if (error.name === 'NotFoundError') {
            errorMsg += 'No microphone found.';
        } else {
            errorMsg += error.message;
        }
        showToast(errorMsg, 'error');
    }
}

function updateMicStats() {
    if (chunksSentSpan) {
        chunksSentSpan.textContent = chunksSent;
    }
    if (micAckInline) micAckInline.textContent = String(chunksAcked || 0);
    if (micLastAckInline) {
        const now = Date.now();
        const age = lastAckTime ? (now - lastAckTime) : null;
        micLastAckInline.textContent = lastAckTime ? fmtAge(age) + ' ago' : '—';
    }
    if (lastSentSpan && lastSentTime) {
        const secondsAgo = Math.floor((Date.now() - lastSentTime) / 1000);
        lastSentSpan.textContent = secondsAgo < 60 ? `${secondsAgo}s ago` : '>1m ago';
    }
    
    // Check for mic warning condition: sending but no acks for a while
    if (micWarningBanner && mediaRecorder && mediaRecorder.state === 'recording') {
        const now = Date.now();
        const timeSinceLastAck = lastAckTime ? (now - lastAckTime) : Infinity;
        const timeSinceLastSent = lastSentTime ? (now - lastSentTime) : Infinity;
        const inflight = Math.max(0, (chunksSent || 0) - (chunksAcked || 0));
        // Consider it "actively sending" if we sent something recently OR we're seeing audio energy
        const hasRecentActivity =
            (timeSinceLastSent < 12000) ||
            (typeof vadRms !== 'undefined' && vadRms > (VAD_THRESHOLD * 0.5));
        // Warn if we have inflight chunks and no ack for a bit (avoid warning when truly silent)
        if ((chunksSent > 0 && inflight >= 2) && timeSinceLastAck > 7000 && hasRecentActivity) {
            micWarningBanner.style.display = 'flex';
            if (micWarningText) {
                micWarningText.textContent = 'Mic is sending, but the server isn’t acknowledging it. Check your connection, then refresh this mic page if it persists.';
            }
        } else if (timeSinceLastAck < 7000 || inflight < 2) {
            micWarningBanner.style.display = 'none';
        }
    }
    
    // Update mic status (keep it short; detailed stats live in the small text row)
    if (micStatus && mediaRecorder && mediaRecorder.state === 'recording') {
        const now = Date.now();
        const ageAck = lastAckTime ? (now - lastAckTime) : null;
        const inflight = Math.max(0, (chunksSent || 0) - (chunksAcked || 0));
        const ok = ageAck !== null && ageAck < 7000;
        micStatus.textContent = ok
            ? `Mic LIVE • server receiving`
            : (inflight >= 2 ? `Mic LIVE • not reaching server` : `Mic LIVE`);
    }
}


// Helper function to convert blob to base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            // Get base64 without data URL prefix
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function stopMic() {
    // Stop Realtime mode if active
    if (useRealtimeMode && window.RealtimeMic) {
        try {
            window.RealtimeMic.stop();
            window.RealtimeMic.cleanup();
            realtimeMicInitialized = false;
            useRealtimeMode = false;
        } catch (error) {
            console.error('Error stopping Realtime mode:', error);
        }
    }
    
    // Stop VAD monitoring
    teardownVAD();
    
    // Clear pre-roll
    lastBlob = null;
    initBlob = null;
    initBlobMime = '';
    initBlobTsEnd = 0;
    initSent = false;
    
    if (mediaRecorder) {
        if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
    }
    micStreaming = false;
    
    if (audioStream) {
        audioStream.getTracks().forEach(track => {
            track.stop();
            console.log('Stopped audio track:', track.label);
        });
        audioStream = null;
    }
    
    // Update UI
    startMicBtn.style.display = 'block';
    stopMicBtn.style.display = 'none';
    micStatus.textContent = 'Ready to start';
    updateMicIconState('idle');
    if (micIndicator) micIndicator.style.display = 'none';
    if (micFeedback) micFeedback.style.display = 'none';
    if (micStats) micStats.style.display = 'none';
    chunksSent = 0;
    lastSentTime = null;
    if (micWarningBanner) micWarningBanner.style.display = 'none';
    
    // Hide mic level meter
    const micMeterRow = document.getElementById('micMeterRow');
    if (micMeterRow) {
        micMeterRow.style.display = 'none';
    }
}

function setupVAD(stream) {
    teardownVAD();
    
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(stream);
    
    // Create gain node to boost audio signal (especially important for iPad/iOS)
    gainNode = audioContext.createGain();
    // Boost iPad/iOS audio by 4.0x (~12dB) to compensate for lower mic sensitivity
    // Note: This affects VAD/meter detection. MediaRecorder uses autoGainControl for actual recording.
    const audioGain = (isIPad || isIOS) ? 4.0 : 1.0;
    gainNode.gain.value = audioGain;
    source.connect(gainNode);
    
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048; // Better frequency resolution
    analyser.smoothingTimeConstant = 0.8;
    gainNode.connect(analyser);
    
    const data = new Float32Array(analyser.fftSize);
    
    vadInterval = setInterval(() => {
        analyser.getFloatTimeDomainData(data);
        
        // Calculate RMS (Root Mean Square) for speech detection
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i] * data[i];
        }
        const rms = Math.sqrt(sum / data.length);
        vadRms = rms;
        
        // Speaking gate with hang time
        if (rms >= VAD_THRESHOLD) {
            vadSpeaking = true;
            vadHangUntil = Date.now() + VAD_HANG_MS;
            vadChunkHadSpeech = true; // speech occurred during this chunk window
        } else if (Date.now() > vadHangUntil) {
            vadSpeaking = false;
        }
        
        // Update mic meter UI
        updateMicMeter(rms);
    }, VAD_CHECK_MS);
}

function teardownVAD() {
    if (vadInterval) {
        clearInterval(vadInterval);
        vadInterval = null;
    }
    
    vadSpeaking = false;
    vadRms = 0;
    vadHangUntil = 0;
    
    try {
        if (audioContext) {
            audioContext.close().catch(() => {});
        }
    } catch {}
    
    audioContext = null;
    analyser = null;
    gainNode = null;
}

async function sendBlob(blob, mimeType, tsEnd, opts = {}) {
    // Use micWs if mic is enabled (viewer→mic opt-in), otherwise use ws
    const targetWs = (isMicEnabled && micWs && micWs.readyState === WebSocket.OPEN) ? micWs : ws;
    if (!targetWs || targetWs.readyState !== WebSocket.OPEN) {
        console.warn('[Audio] WebSocket not connected, cannot send audio');
        return;
    }
    
    try {
        const base64 = await blobToBase64(blob);
        const deviceLabel = detectDeviceLabel();
        const micType = isMicEnabled ? 'viewer-mic' : 'dedicated-mic';
        console.log(`[Audio] Sending chunk from ${deviceLabel} (${micType}):`, {
            size: base64.length,
            blobSize: blob.size,
            mime: mimeType,
            rms: vadRms?.toFixed(3) || 'N/A',
            muted: isMicMuted
        });
        
        const payload = {
            type: 'audio_chunk',
            mime: mimeType,
            data: base64,
            tsEnd: tsEnd
        };

        if (opts.init) {
            payload.init = true;
            console.log(`[Audio] Sending init chunk from ${deviceLabel}`);
        }

        targetWs.send(JSON.stringify(payload));
        
        chunksSent++;
        lastSentTime = Date.now();
        updateMicStats();
        if (isMicEnabled) updateRoleModuleMicStatus();
    } catch (err) {
        console.error('[Audio] Error sending audio chunk:', err);
        showToast('Error reading audio data', 'error');
    }
}

function updateMicUI(mimeType) {
    // Update mic status with VAD info
    if (micStatus && mediaRecorder && mediaRecorder.state === 'recording') {
        const quiet = vadRms < (VAD_THRESHOLD * 0.8);
        const quietMsg = quiet ? ' • TOO QUIET? move closer' : '';
        const ackStatus = chunksAcked > 0 ? ` • ack ${chunksAcked}` : ' • waiting for ack...';
        micStatus.textContent = `Mic LIVE • sent ${chunksSent}${ackStatus} • level ${(vadRms * 100).toFixed(1)}${quietMsg}`;
    }
}

function updateMicMeter(rms) {
    const micMeter = document.getElementById('micMeter');
    const micMeterText = document.getElementById('micMeterText');
    const micMeterRow = document.getElementById('micMeterRow');
    
    if (!micMeter || !micMeterRow) return;
    
    // Show feedback section if hidden
    if (micFeedback) {
        micFeedback.style.display = 'block';
    }
    micMeterRow.style.display = 'flex';
    
    // Scale RMS to 0-1 for progress bar (multiply by ~20 for visual scaling)
    const visualLevel = Math.min(1, Math.max(0, rms * 20));
    micMeter.value = visualLevel;
    
    // Update text
    const percentage = Math.min(100, Math.round(rms * 1000));
    if (micMeterText) {
        micMeterText.textContent = percentage + '%';
        
        // Color coding for dark theme - Celtics colors
        if (percentage > 30) {
            micMeterText.style.color = '#007A33'; // Celtics green
        } else if (percentage > 10) {
            micMeterText.style.color = '#BA9653'; // Celtics gold
        } else {
            micMeterText.style.color = '#ef4444'; // Red for error
        }
    }
    
    // Update icon state based on activity
    if (rms >= VAD_THRESHOLD && micIconContainer) {
        // Already recording, ensure state is set
        if (!micIconContainer.classList.contains('mic-state-recording')) {
            updateMicIconState('recording');
        }
    }
}

// Mic transcript functions
function addMicTranscriptEntry(entry) {
    if (!entry || !micTranscriptContent) return;
    const id = entry.id;

    // Suppress [inaudible] spam
    if (entry.text && /^\[inaudible\]$/i.test(entry.text.trim())) {
        return;
    }

    // Remove empty state if present
    const emptyState = micTranscriptContent.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    if (id && micSegmentDomById.has(id)) {
        const el = micSegmentDomById.get(id);
        const textSpan = el?.querySelector('.transcript-text');
        if (textSpan) textSpan.textContent = entry.text;
        return;
    }

    const row = createMicTranscriptRow(entry);
    if (id) micSegmentDomById.set(id, row);

    micTranscriptContent.appendChild(row);

    // Keep transcript compact - only last 4 entries
    const allEntries = Array.from(micTranscriptContent.children);
    const maxVisibleEntries = 4;
    if (allEntries.length > maxVisibleEntries) {
        const toRemove = allEntries.slice(0, allEntries.length - maxVisibleEntries);
        toRemove.forEach(el => {
            const entryId = el.dataset.segmentId;
            if (entryId) micSegmentDomById.delete(entryId);
            el.remove();
        });
    }

    // Auto-scroll to bottom
    micTranscriptContent.scrollTop = micTranscriptContent.scrollHeight;

    // Keep export cache updated
    const idx = micTranscriptEntries.findIndex(e => e.id === entry.id);
    if (idx >= 0) {
        micTranscriptEntries[idx] = entry;
    } else {
        micTranscriptEntries.push(entry);
        // Keep only last 1000 entries
        if (micTranscriptEntries.length > 1000) {
            micTranscriptEntries.splice(0, micTranscriptEntries.length - 1000);
        }
    }
}

function createMicTranscriptRow(entry) {
    const div = document.createElement('div');
    div.className = 'transcript-entry';
    div.dataset.segmentId = entry.id || '';
    div.innerHTML = `
        <div class="transcript-row">
            <span class="speaker-chip">${escapeHtml(entry.speaker)}</span>
            <span class="transcript-text">${escapeHtml(entry.text)}</span>
        </div>
    `;
    return div;
}

// Mic transcript toggle handler
if (micTranscriptToggle) {
    micTranscriptToggle.addEventListener('click', () => {
        if (!micTranscriptContent) return;
        const isExpanded = !micTranscriptContent.classList.contains('mic-transcript-collapsed');
        
        if (isExpanded) {
            micTranscriptContent.classList.add('mic-transcript-collapsed');
            micTranscriptToggle.textContent = 'Show';
            localStorage.setItem('huddle_mic_transcript_expanded', 'false');
        } else {
            micTranscriptContent.classList.remove('mic-transcript-collapsed');
            micTranscriptToggle.textContent = 'Hide';
            localStorage.setItem('huddle_mic_transcript_expanded', 'true');
        }
    });
}

// Keep connection alive
setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
    }
    if (micWs && micWs.readyState === WebSocket.OPEN) {
        micWs.send(JSON.stringify({ type: 'ping' }));
    }
}, 30000);

// Viewer→mic opt-in functions
async function enableMicFromViewer() {
    if (isMicEnabled) return;
    
    // Clean up any existing WebSocket connection before creating a new one
    if (micWs) {
        try {
            if (micWs.readyState === WebSocket.OPEN || micWs.readyState === WebSocket.CONNECTING) {
                micWs.close();
            }
        } catch (e) {
            // Ignore close errors
        }
        micWs = null;
    }
    
    try {
        // Request microphone permission (ONLY when user clicks button)
        if (!navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast('Microphone access not available in this browser', 'error');
            return;
        }
        
        // Enable autoGainControl for iPad/iOS to boost audio signal
        // Additional gain is applied via Web Audio API gain node (see setupVAD)
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                sampleRate: 48000,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: isIPad || isIOS ? true : false // Enable for iPad/iOS to boost signal
            }
        });
        
        // Create separate mic WebSocket connection
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        micWs = new WebSocket(wsUrl);
        
        micWs.onopen = () => {
            console.log('Mic WebSocket connected (viewer→mic opt-in)');
            // Safety check: ensure WebSocket is still open before sending
            if (!micWs || micWs.readyState !== WebSocket.OPEN) {
                console.warn('[Mic] WebSocket closed before join message could be sent');
                return;
            }
            // Join as mic with deviceId
            const micId = `mic-${deviceId}`;
            const micLabel = detectDeviceLabel();
            // Use device label in name to ensure unique speaker names for each device
            const uniqueName = userName ? `${userName} (${micLabel})` : micLabel;
            const passcode = getRoomPasscode(currentRoom);
            console.log(`[Mic] Joining as ${uniqueName} with micId ${micId}`);
            try {
                micWs.send(JSON.stringify({
                    type: 'join',
                    roomCode: currentRoom,
                    role: 'mic',
                    name: uniqueName,
                    deviceId: deviceId,
                    micId: micId,
                    label: micLabel,
                    passcode: passcode
                }));
                // Start heartbeat after join
                startMicHeartbeat(micWs, currentRoom);
                
                // Start keepalive pings for Cloudflare-safe connection
                clearInterval(window.__micPingTimer);
                window.__micPingTimer = setInterval(() => {
                    try {
                        if (micWs && micWs.readyState === WebSocket.OPEN) {
                            micWs.send(JSON.stringify({ type: 'ping', roomCode: currentRoom, ts: Date.now() }));
                        }
                    } catch (e) {
                        // Ignore send errors
                    }
                }, 8000);
            } catch (err) {
                console.error('[Mic] Error sending join message:', err);
                // If send fails, close and clean up
                if (micWs) {
                    try {
                        micWs.close();
                    } catch (e) {
                        // Ignore close errors
                    }
                    micWs = null;
                }
            }
        };
        
        micWs.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'joined') {
                    micClientId = message.clientId;
                    // Start audio streaming
                    startMicFromViewer();
                } else if (message.type === 'audio_ack') {
                    chunksAcked++;
                    lastAckTime = Date.now();
                    updateMicStats();
                    if (isMicEnabled) updateRoleModuleMicStatus();
                }
            } catch (error) {
                console.error('Failed to parse mic WebSocket message:', error);
            }
        };
        
        micWs.onerror = (error) => {
            console.error('Mic WebSocket error:', error);
            showToast('Mic connection error', 'error');
        };
        
        micWs.onclose = () => {
            console.log('Mic WebSocket closed');
            stopMicHeartbeat();
            
            // Clear keepalive ping timer
            clearInterval(window.__micPingTimer);
            window.__micPingTimer = null;
            
            if (isMicEnabled) {
                // Reconnect if mic is still enabled
                setTimeout(() => {
                    if (isMicEnabled && currentRoom) {
                        enableMicFromViewer();
                    }
                }, 1000);
            }
        };
        
    } catch (error) {
        console.error('Error enabling mic from viewer:', error);
        let errorMsg = 'Could not access microphone. ';
        if (error.name === 'NotAllowedError') {
            errorMsg += 'Please grant microphone permission.';
        } else if (error.name === 'NotFoundError') {
            errorMsg += 'No microphone found.';
        } else {
            errorMsg += error.message;
        }
        showToast(errorMsg, 'error');
        // Clean up on error
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
        }
    }
}

function detectDeviceLabel() {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone/.test(ua)) return 'Phone Mic';
    if (/ipad/.test(ua)) return 'iPad Mic';
    if (/android.*mobile/.test(ua)) return 'Phone Mic';
    if (/macintosh|mac os x/.test(ua)) return 'PC Mic';
    if (/windows/.test(ua)) return 'PC Mic';
    return 'Remote Mic';
}

async function startMicFromViewer() {
    if (!audioStream || !micWs || micWs.readyState !== WebSocket.OPEN) return;
    
    try {
        const mimeTypes = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/ogg',
            'audio/mp4;codecs=mp4a.40.2',
            'audio/mp4',
            'audio/aac',
            'video/mp4'
        ];
        
        let mimeType = null;
        for (const mime of mimeTypes) {
            if (MediaRecorder.isTypeSupported(mime)) {
                mimeType = mime;
                break;
            }
        }
        
        if (!mimeType) {
            throw new Error('No supported audio format');
        }
        
        mediaRecorder = new MediaRecorder(audioStream, {
            mimeType: mimeType,
            audioBitsPerSecond: 128000
        });
        
        mediaRecorder.ondataavailable = async (event) => {
            if (!event.data || event.data.size === 0 || isMicMuted) return;
            
            const blob = event.data;
            const tsEnd = Date.now();
            const mimeType = blob.type || mimeType;
            
            if (!initBlob) {
                initBlob = blob;
                initBlobMime = mimeType;
                initBlobTsEnd = tsEnd;
            }
            
            const chunkHadSpeech = !!vadChunkHadSpeech;
            vadChunkHadSpeech = false;
            const speakingNow = chunkHadSpeech || vadSpeaking || (Date.now() < vadHangUntil);
            
            if (!speakingNow) {
                lastBlob = blob;
                lastBlobMime = mimeType;
                lastBlobTsEnd = tsEnd;
                return;
            }
            
            if (!initSent && initBlob) {
                await sendBlob(initBlob, initBlobMime, initBlobTsEnd, { init: true });
                initSent = true;
            }
            
            if (lastBlob) {
                await sendBlob(lastBlob, lastBlobMime, lastBlobTsEnd);
                lastBlob = null;
            }
            
            await sendBlob(blob, mimeType, tsEnd);
        };
        
        mediaRecorder.onerror = (event) => {
            console.error('MediaRecorder error:', event);
            showToast('Audio recording error', 'error');
        };
        
        mediaRecorder.start(TIMESLICE_MS);
        setupVAD(audioStream);
        micStreaming = true;
        
        isMicEnabled = true;
        isMicMuted = false;
        updateRoleModuleUI();
        updateViewerMicButtonUI();
        
    } catch (error) {
        console.error('Error starting mic from viewer:', error);
        showToast('Error starting microphone', 'error');
    }
}

function toggleMicMute() {
    if (!isMicEnabled || !audioStream) return;
    
    isMicMuted = !isMicMuted;
    if (audioStream && audioStream.getAudioTracks().length > 0) {
        audioStream.getAudioTracks()[0].enabled = !isMicMuted;
    }
    updateRoleModuleUI();
    updateViewerMicButtonUI();
    showToast(isMicMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
}

function disableMicFromViewer() {
    if (!isMicEnabled) return;
    
    // Stop media recorder
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
    mediaRecorder = null;
    
    // Stop audio stream
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }
    
    // Close mic WebSocket
    if (micWs) {
        micWs.close();
        micWs = null;
    }
    
    // Clean up VAD
    teardownVAD();
    
    // Reset state
    isMicEnabled = false;
    isMicMuted = false;
    micClientId = null;
    chunksSent = 0;
    chunksAcked = 0;
    lastBlob = null;
    initBlob = null;
    initSent = false;
    
    updateRoleModuleUI();
    updateViewerMicButtonUI();
    showToast('Microphone disabled', 'info');
}

function updateRoleModuleUI() {
    if (!roleModuleStatus || !roleModuleActions || !enableMicBtn || !roleModuleMicControls) return;
    
    if (isMicEnabled) {
        roleModuleStatus.textContent = 'Viewer + Mic';
        enableMicBtn.style.display = 'none';
        roleModuleMicControls.style.display = 'flex';
        if (muteMicBtn) muteMicBtn.textContent = isMicMuted ? 'Unmute' : 'Mute';
        updateRoleModuleMicStatus();
    } else {
        roleModuleStatus.textContent = 'Viewer mode (read-only)';
        enableMicBtn.style.display = 'inline-block';
        roleModuleMicControls.style.display = 'none';
    }
    updateViewerMicButtonUI();
}

function updateRoleModuleMicStatus() {
    if (!isMicEnabled || !roleModuleMicChip) return;
    
    let status = 'OFFLINE';
    if (micWs && micWs.readyState === WebSocket.OPEN) {
        if (isMicMuted) {
            status = 'MUTED';
        } else if (mediaRecorder && mediaRecorder.state === 'recording') {
            if (vadRms > VAD_THRESHOLD) {
                status = 'LIVE';
            } else {
                status = 'QUIET';
            }
        }
    }
    
    roleModuleMicChip.textContent = status;
    roleModuleMicChip.className = `role-module-mic-chip mic-health-chip-${status.toLowerCase()}`;
    updateViewerMicButtonUI();
}

function updateViewerMicButtonUI() {
    if (!viewerMicBtn) return;

    // Menu item visibility
    if (disableMicMenuBtn) {
        disableMicMenuBtn.style.display = isMicEnabled ? 'block' : 'none';
    }

    if (!isMicEnabled) {
        viewerMicBtn.textContent = 'Enable mic';
        viewerMicBtn.title = 'Enable microphone (permission prompt)';
        return;
    }

    // Enabled
    if (isMicMuted) {
        viewerMicBtn.textContent = 'Mic muted';
        viewerMicBtn.title = 'Click to unmute';
        return;
    }

    if (!micWs || micWs.readyState !== WebSocket.OPEN) {
        viewerMicBtn.textContent = 'Mic reconnecting…';
        viewerMicBtn.title = 'Mic is reconnecting';
        return;
    }

    // Connected
    const speaking = vadRms > VAD_THRESHOLD && mediaRecorder && mediaRecorder.state === 'recording';
    viewerMicBtn.textContent = speaking ? 'Mic live' : 'Mic on';
    viewerMicBtn.title = 'Click to mute';
}

// Event listeners for role module buttons
if (enableMicBtn) {
    enableMicBtn.addEventListener('click', () => {
        enableMicFromViewer();
    });
}

if (muteMicBtn) {
    muteMicBtn.addEventListener('click', () => {
        toggleMicMute();
    });
}

if (disableMicBtn) {
    disableMicBtn.addEventListener('click', () => {
        disableMicFromViewer();
    });
}

// Accessibility features
// Font size toggle
let currentFontSize = localStorage.getItem('huddle_fontSize') || 'normal';
const fontSizes = ['normal', 'large', 'xlarge'];
const fontSizeLabels = { normal: 'Normal', large: 'Large', xlarge: 'Extra Large' };

function updateFontSize() {
    document.documentElement.classList.remove('font-normal', 'font-large', 'font-xlarge');
    document.documentElement.classList.add(`font-${currentFontSize}`);
    if (fontSizeToggle) {
        fontSizeToggle.textContent = `Font size: ${fontSizeLabels[currentFontSize]}`;
    }
    if (fontSizeDownBtn) {
        fontSizeDownBtn.disabled = currentFontSize === 'normal';
    }
    if (fontSizeUpBtn) {
        fontSizeUpBtn.disabled = currentFontSize === 'xlarge';
    }
    localStorage.setItem('huddle_fontSize', currentFontSize);
}

function setFontSize(nextSize) {
    if (!fontSizes.includes(nextSize)) return;
    currentFontSize = nextSize;
    updateFontSize();
}

if (fontSizeToggle) {
    fontSizeToggle.addEventListener('click', () => {
        const currentIndex = fontSizes.indexOf(currentFontSize);
        currentFontSize = fontSizes[(currentIndex + 1) % fontSizes.length];
        updateFontSize();
    });
    updateFontSize(); // Initialize on load
}

if (fontSizeDownBtn) {
    fontSizeDownBtn.addEventListener('click', () => {
        const currentIndex = fontSizes.indexOf(currentFontSize);
        const nextIndex = Math.max(0, currentIndex - 1);
        setFontSize(fontSizes[nextIndex]);
    });
}

if (fontSizeUpBtn) {
    fontSizeUpBtn.addEventListener('click', () => {
        const currentIndex = fontSizes.indexOf(currentFontSize);
        const nextIndex = Math.min(fontSizes.length - 1, currentIndex + 1);
        setFontSize(fontSizes[nextIndex]);
    });
}

// High contrast toggle
let highContrastEnabled = localStorage.getItem('huddle_highContrast') === 'true';

function updateHighContrast() {
    if (highContrastEnabled) {
        document.documentElement.classList.add('high-contrast');
    } else {
        document.documentElement.classList.remove('high-contrast');
    }
    if (highContrastToggle) {
        highContrastToggle.textContent = `High contrast: ${highContrastEnabled ? 'On' : 'Off'}`;
    }
    localStorage.setItem('huddle_highContrast', highContrastEnabled.toString());
}

if (highContrastToggle) {
    highContrastToggle.addEventListener('click', () => {
        highContrastEnabled = !highContrastEnabled;
        updateHighContrast();
    });
    updateHighContrast(); // Initialize on load
}
