const roomsList = document.getElementById('roomsList');
const roomsEmpty = document.getElementById('roomsEmpty');
const roomsStatus = document.getElementById('roomsStatus');
const refreshRoomsBtn = document.getElementById('refreshRoomsBtn');
const resumeRoomBtn = document.getElementById('resumeRoomBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const emptyCreateRoomBtn = document.getElementById('emptyCreateRoomBtn');
const passcodeModal = document.getElementById('passcodeModal');
const passcodeCloseBtn = document.getElementById('passcodeCloseBtn');
const passcodeJoinBtn = document.getElementById('passcodeJoinBtn');
const passcodeInput = document.getElementById('passcodeInput');
const passcodeRoomLabel = document.getElementById('passcodeRoomLabel');
const passcodeError = document.getElementById('passcodeError');

let pendingPasscodeRoom = '';

function formatAge(timestamp) {
    if (!timestamp) return 'Just now';
    const diffMs = Date.now() - timestamp;
    const diffMin = Math.max(Math.floor(diffMs / 60000), 0);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
}

function formatParticipants(room) {
    const micCount = room.micCount || 0;
    const viewerCount = room.viewerCount || 0;
    const total = micCount + viewerCount;
    if (total === 0) return 'Empty';
    const parts = [];
    if (micCount) parts.push(`${micCount} mic${micCount === 1 ? '' : 's'}`);
    if (viewerCount) parts.push(`${viewerCount} viewer${viewerCount === 1 ? '' : 's'}`);
    return parts.join(' · ');
}

function renderRooms(rooms) {
    if (!roomsList || !roomsEmpty) return;
    roomsList.innerHTML = '';

    if (!rooms || rooms.length === 0) {
        roomsEmpty.style.display = 'flex';
        return;
    }

    roomsEmpty.style.display = 'none';

    rooms.forEach((room) => {
        const card = document.createElement('div');
        card.className = 'rooms-item';

        const info = document.createElement('div');
        info.className = 'rooms-item-info';

        const code = document.createElement('div');
        code.className = 'rooms-item-code';
        code.textContent = room.code;

        const meta = document.createElement('div');
        meta.className = 'rooms-item-meta';
        meta.textContent = `${formatParticipants(room)} · Started ${formatAge(room.createdAt)}`;

        info.appendChild(code);
        info.appendChild(meta);

        if (room.hasPasscode) {
            const badge = document.createElement('div');
            badge.className = 'rooms-item-badge';
            badge.textContent = 'Passcode';
            info.appendChild(badge);
        }

        const joinBtn = document.createElement('button');
        joinBtn.className = 'btn btn-secondary btn-small';
        joinBtn.textContent = 'Join';
        joinBtn.addEventListener('click', () => {
            if (room.hasPasscode) {
                openPasscodeModal(room.code);
                return;
            }
            window.location.assign(`/viewer?room=${encodeURIComponent(room.code)}`);
        });

        card.appendChild(info);
        card.appendChild(joinBtn);
        roomsList.appendChild(card);
    });
}

async function loadRooms() {
    if (roomsStatus) roomsStatus.textContent = 'Loading rooms...';
    try {
        const response = await fetch('/api/rooms');
        if (!response.ok) throw new Error('Failed to load rooms');
        const data = await response.json();
        renderRooms(data.rooms || []);
        if (roomsStatus) roomsStatus.textContent = '';
    } catch (error) {
        console.error('Failed to load rooms:', error);
        if (roomsStatus) roomsStatus.textContent = 'Unable to load rooms.';
        renderRooms([]);
    }
}

function goToMic() {
    window.location.assign('/mic');
}

function getLastRoom() {
    try {
        return (localStorage.getItem('huddle:lastRoom') || '').trim().toUpperCase();
    } catch {
        return '';
    }
}

function resumeLastRoom() {
    const code = getLastRoom();
    if (!code || code.length !== 6) {
        if (roomsStatus) roomsStatus.textContent = 'No recent room to resume.';
        return;
    }
    window.location.assign(`/viewer?room=${encodeURIComponent(code)}`);
}

function openPasscodeModal(roomCode) {
    pendingPasscodeRoom = roomCode;
    if (passcodeRoomLabel) passcodeRoomLabel.textContent = `Room ${roomCode}`;
    if (passcodeInput) passcodeInput.value = '';
    if (passcodeError) {
        passcodeError.style.display = 'none';
        passcodeError.textContent = '';
    }
    if (passcodeModal) passcodeModal.style.display = 'flex';
    setTimeout(() => passcodeInput?.focus(), 0);
}

function closePasscodeModal() {
    pendingPasscodeRoom = '';
    if (passcodeModal) passcodeModal.style.display = 'none';
}

passcodeCloseBtn?.addEventListener('click', closePasscodeModal);
passcodeModal?.addEventListener('click', (e) => {
    if (e.target === passcodeModal) closePasscodeModal();
});

passcodeJoinBtn?.addEventListener('click', () => {
    const pass = (passcodeInput?.value || '').trim();
    if (!pendingPasscodeRoom) return;
    if (!pass) {
        if (passcodeError) {
            passcodeError.textContent = 'Passcode required.';
            passcodeError.style.display = 'block';
        }
        return;
    }
    try {
        localStorage.setItem(`huddle_room_passcode_${pendingPasscodeRoom}`, pass);
    } catch {}
    closePasscodeModal();
    window.location.assign(`/viewer?room=${encodeURIComponent(pendingPasscodeRoom)}&pass=${encodeURIComponent(pass)}`);
});

passcodeInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') passcodeJoinBtn?.click();
    if (e.key === 'Escape') closePasscodeModal();
});

if (refreshRoomsBtn) {
    refreshRoomsBtn.addEventListener('click', () => {
        loadRooms();
    });
}

if (resumeRoomBtn) {
    const code = getLastRoom();
    resumeRoomBtn.disabled = !(code && code.length === 6);
    resumeRoomBtn.addEventListener('click', resumeLastRoom);
}

if (createRoomBtn) {
    createRoomBtn.addEventListener('click', goToMic);
}

if (emptyCreateRoomBtn) {
    emptyCreateRoomBtn.addEventListener('click', goToMic);
}

loadRooms();
const roomsPollInterval = setInterval(loadRooms, 5000);
window.addEventListener('beforeunload', () => clearInterval(roomsPollInterval));
