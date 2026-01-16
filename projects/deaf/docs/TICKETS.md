# RoomBrief - Ticket Breakdown (MVP → v1.0)

## EPIC A — Foundations & Room Lifecycle

### A1. Room create/join + roles
**Status**: ✅ Complete (MVP)
**AC**: Viewer can create room code; Mic can join by code; both see "joined" confirmation; reconnect doesn't crash room.

### A2. Room TTL + cleanup
**Status**: ✅ Complete (MVP)
**AC**: Idle rooms expire after configurable TTL; transcripts deleted; server memory stays bounded in load test.

### A3. Server-side config + validation
**Status**: ✅ Complete (MVP)
**AC**: .env required; startup fails fast if missing keys; settings logged (non-secret).

---

## EPIC B — Audio Ingest ("Room Mesh")

### B1. Mic capture + chunk send
**Status**: ✅ Complete (MVP)
**AC**: Mic start/stop works on Chrome desktop + Android Chrome; chunk interval configurable; error shown on permission denied.

### B2. Chunk limits + rate safety
**Status**: ✅ Complete (MVP)
**AC**: Reject too-large chunks; warning returned to client; server remains stable under abuse (e.g., 10 clients).

### B3. Multi-mic mixing strategy (do NOT mix early)
**Status**: ✅ Complete (MVP)
**AC**: Each mic is transcribed independently and tagged with that mic's name; viewer sees combined stream.

---

## EPIC C — Transcription Reliability

### C1. Chunk transcription pipeline
**Status**: ✅ Complete (MVP)
**AC**: Audio chunk -> text within reasonable time; no deadlocks; temp files cleaned up.

### C2. Noise & short chunk handling
**Status**: ✅ Complete (MVP)
**AC**: If chunk is silence/noise, transcript is empty (no hallucination); system doesn't spam filler.

### C3. Speaker label conventions
**Status**: ✅ Complete (MVP)
**AC**: Transcript lines display stable speaker labels = mic user's chosen name.

---

## EPIC D — Room Comprehension Layer (The Differentiator)

### D1. Rolling summary job
**Status**: ✅ Complete (MVP)
**AC**: Every N seconds, updates summary from last 120s of transcript; summary is concise and factual.

### D2. Stable topic header
**Status**: ✅ Complete (MVP)
**AC**: Topic changes only when confidence threshold and duration rules met; no flip-flop within short windows.

### D3. Decisions / Actions / Questions extraction
**Status**: ✅ Complete (MVP)
**AC**: When words like "let's do…", "we decided…", "can you…", "who…?" appear, lists update correctly.

### D4. Topic shift alert
**Status**: ✅ Complete (MVP)
**AC**: Viewer receives alert when topic changes; subtle UI message.

---

## EPIC E — "What I Missed" Catch-up

### E1. Missed request + response
**Status**: ✅ Complete (MVP)
**AC**: Button returns 1–2 sentence recap + 3–6 bullets for last 45s or since timestamp; response arrives quickly.

### E2. Calm tone / anxiety-aware
**Status**: ✅ Complete (MVP)
**AC**: Output is factual, short, non-judgmental; no invented details.

---

## EPIC F — UX Polish (v1 Feel, Still Simple)

### F1. Viewer-first layout
**Status**: ✅ Complete (MVP)
**AC**: Topic + summary visible above fold; transcript scrollable; lanes readable; works on phone and desktop.

### F2. Mic UX
**Status**: ✅ Complete (MVP)
**AC**: Big start/stop; clear "Mic live" indicator; shows joined room code; minimal distractions.

### F3. Accessibility
**Status**: ⚠️ Partial (MVP)
**AC**: Large text option; high contrast; keyboard navigation (basic).
**Notes**: Basic accessibility implemented. Enhanced features:
- ⚠️ Font size toggle (to be implemented)
- ⚠️ High contrast mode toggle (to be implemented)
- ✅ Basic keyboard navigation
- ⚠️ Screen reader improvements (to be enhanced)

---

## EPIC G — Privacy, Consent, and Deploy Readiness (v1.0)

### G1. Consent screen
**Status**: ✅ Complete (MVP)
**AC**: Before starting mic, user must accept a clear consent statement; viewer sees "Live captioning active" banner.
**Implementation Notes**:
- ✅ Consent checkbox implemented before mic start
- ✅ "Everyone here knows captions are running" consent required
- ✅ Live banner displayed on viewer screen when active
- ✅ Start button disabled until consent given

### G2. Session export + retention
**Status**: ✅ Complete (MVP)
**AC**: Viewer can export session notes (decisions/actions/questions + transcript) and server auto-deletes after configured retention.
**Implementation Notes**:
- ✅ "Export" button implemented on viewer screen
- ✅ Generates Markdown and JSON files with all session data
- ✅ Includes topic, summary, decisions, next steps, full transcript
- ✅ Server auto-deletes rooms after TTL (ROOM_TTL_MS config)

### G3. Auth / room lock
**Status**: ❌ Not Started
**Priority**: Medium
**AC**: Optional room passcode or one-time join token; prevents random joins.
**Implementation Notes**:
- Add optional passcode field when creating room
- Require passcode on join
- Or generate one-time join tokens (QR codes)
- Consider simple PIN system (4-6 digits)

### G4. HTTPS requirement note + recommended deployment
**Status**: ✅ Documented (MVP)
**AC**: Documentation for running behind HTTPS (Cloudflare tunnel / reverse proxy) so mobile mic permissions work reliably.
**Notes**: README includes Cloudflare tunnel instructions. Could add:
- Docker setup
- Nginx reverse proxy config
- Let's Encrypt SSL setup guide

---

## Suggested Build Order (Fastest to "Real Test")

1. ✅ A1 → B1 → C1 (get audio → text working) - **DONE**
2. ✅ D1 + E1 (rolling summary + missed catch-up) - **DONE**
3. ✅ D2/D3 (topic stability + lanes) - **DONE**
4. ✅ G1 + G4 (consent + HTTPS deploy) - **DONE**
5. ⚠️ F polish + G2/G3 (v1.0 readiness) - **G2 DONE, G3 TODO, F3 PARTIAL**

---

## Next Sprint (v1.0)

**Must-Have**:
1. ✅ G1: Consent screen (before mic start + viewer banner) - **DONE**
2. ⚠️ F3: Enhanced accessibility (font size, contrast toggle) - **IN PROGRESS**

**Nice-to-Have**:
3. ✅ G2: Session export feature - **DONE**
4. ⚠️ G3: Room passcode protection - **TODO**
5. ✅ Enhanced error handling and reconnection logic - **DONE**

**Future Considerations**:
- Mobile apps (React Native / Flutter)
- Offline mode with local models
- Integration with meeting platforms (Zoom, Teams)
- Analytics dashboard for admins
- Multi-language support




























