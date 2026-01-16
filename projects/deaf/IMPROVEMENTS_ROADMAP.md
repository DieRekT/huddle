# Improvements Roadmap

## High Priority (Core Multi-Location Enhancements)

### 1. **Speaker Diarization** ⭐
**Status**: Not implemented  
**Impact**: High  
**Effort**: Medium-High

**What**: Identify which person is speaking even when multiple people are near the same mic.

**Why**: In multi-location scenarios, you might have:
- Multiple people in the same physical location (e.g., 3 people around one phone)
- One mic picking up multiple speakers
- Need to distinguish speakers without requiring separate mics

**How**:
- Use OpenAI Whisper with speaker diarization (if available)
- Or implement client-side speaker detection (voice fingerprinting)
- Display speaker labels: "Alice: ..." vs "Bob: ..."
- Merge with mic-based speaker names: "Remote Mic (Alice): ..."

**Considerations**:
- Only enable when useful (not all scenarios need it)
- Keep it optional/automatic
- Don't add complexity to UI

---

### 2. **Better Viewer Detection** ⭐
**Status**: Partial (uses heuristic)  
**Impact**: Medium  
**Effort**: Low

**What**: Accurately detect if viewer is connected, not just estimate from summary.

**Why**: Current implementation uses heuristic (summary exists = viewer exists), but:
- Viewer might disconnect
- Summary might exist without active viewer
- Mic page status might be inaccurate

**How**:
- Server tracks viewer count explicitly
- Include `viewerCount` in room state messages
- Update mic page status: "1 viewer connected" vs "No viewers"

**Effort**: ~30 minutes (add viewer count to Room class, include in state)

---

### 3. **Network Quality Indicators** ⭐
**Status**: Not implemented  
**Impact**: Medium  
**Effort**: Medium

**What**: Show network quality per mic (latency, packet loss, connection quality).

**Why**: 
- Remote mics may have poor network
- Viewer should know which mics have issues
- Helps diagnose audio quality problems

**How**:
- Track WebSocket ping/pong latency per mic
- Monitor audio chunk delivery rates
- Display quality indicator: "Good" / "Fair" / "Poor"
- Show in mic health strip: "Remote Mic (Poor connection)"

**UI**: Small icon next to mic name in health strip

---

### 4. **Enhanced Mic Health Visualization** ⭐
**Status**: Basic (LIVE/QUIET/OFFLINE)  
**Impact**: Medium  
**Effort**: Low-Medium

**What**: Better visual indicators for mic health.

**Why**: Current status is text-based, could be more visual.

**How**:
- Add color coding: Green (LIVE), Yellow (QUIET), Red (OFFLINE)
- Add connection quality bars (like WiFi signal strength)
- Show last activity timestamp: "Active 2s ago"
- Add audio level indicators per mic

**UI**: Enhanced mic health chips with visual indicators

---

## Medium Priority (User Experience)

### 5. **Improved Mic Naming** 
**Status**: Basic (device type suggestion)  
**Impact**: Medium  
**Effort**: Low

**What**: Better mic naming strategy.

**Why**: Device types are generic ("Phone", "Laptop"). Better names would help.

**How**:
- Suggest name based on location: "Living Room", "Kitchen", "Remote"
- Allow custom names when joining
- Auto-number duplicates: "Phone 1", "Phone 2"
- Remember names per device (localStorage)

**UI**: Better name input suggestions

---

### 6. **Better Room Sharing Flow**
**Status**: Basic (QR code + link)  
**Impact**: Medium  
**Effort**: Medium

**What**: Enhanced room sharing experience.

**Why**: Current QR/link flow works but could be smoother.

**How**:
- Add "Share Room" button (copy link + QR)
- Generate shorter links (URL shortener)
- Add share via native apps (SMS, WhatsApp, etc.)
- Show share count: "Shared 3 times"
- Add expiration reminders

**UI**: Enhanced invite modal with more sharing options

---

### 7. **Audio Quality Metrics Per Mic**
**Status**: Basic (server-side RMS/VAD)  
**Impact**: Medium  
**Effort**: Medium

**What**: Show audio quality metrics per mic.

**Why**: Helps diagnose why some mics have poor transcripts.

**How**:
- Display audio level per mic in health strip
- Show RMS level: "Good" / "Low" / "Too Quiet"
- Track audio quality over time
- Warn when audio quality is consistently poor

**UI**: Small audio level indicator per mic chip

---

### 8. **Better Error Messages**
**Status**: Basic  
**Impact**: Medium  
**Effort**: Low

**What**: More helpful error messages.

**Why**: Current errors are generic. Better messages help users fix issues.

**How**:
- "Mic disconnected - check your network connection"
- "Audio too quiet - move mic closer to speaker"
- "Room not found - code may have expired (2 hours)"
- "Connection lost - reconnecting..."

**UI**: Better error messaging with actionable advice

---

## Lower Priority (Nice to Have)

### 9. **Turn-Taking Detection**
**Status**: Not implemented  
**Impact**: Low-Medium  
**Effort**: High

**What**: Detect when speakers take turns (conversation flow).

**Why**: Helps viewer understand conversation dynamics.

**How**:
- Analyze transcript timestamps
- Detect gaps between speakers
- Highlight active speakers
- Show conversation flow visualization

**UI**: Optional conversation flow indicator

---

### 10. **Multiple Language Support**
**Status**: English only  
**Impact**: Low (unless needed)  
**Effort**: Medium

**What**: Support non-English languages.

**Why**: Expand accessibility to non-English speakers.

**How**:
- Add language selection in room settings
- Pass language to OpenAI API
- Update prompts for different languages
- UI translations

**UI**: Language selector in room settings

---

### 11. **Room Persistence / History**
**Status**: Not implemented  
**Impact**: Low  
**Effort**: Medium-High

**What**: Save/load room history.

**Why**: Allow viewers to review past conversations.

**How**:
- Export room to JSON/text
- Import room from file
- Room history storage (optional)
- Search past transcripts

**UI**: Export/import functionality (already partially exists)

---

### 12. **Mobile UX Improvements**
**Status**: Basic mobile support  
**Impact**: Medium  
**Effort**: Medium

**What**: Better mobile experience.

**Why**: Many users will use phones/iPads.

**How**:
- Touch-optimized controls
- Better mobile keyboard handling
- Swipe gestures
- Mobile-specific layouts
- Better mobile audio handling

**UI**: Mobile-optimized interface

---

### 13. **Performance Optimizations**
**Status**: Good (but could be better)  
**Impact**: Medium  
**Effort**: Medium

**What**: Optimize for performance.

**Why**: Better performance = better UX, especially with many mics.

**How**:
- WebSocket message batching
- Transcript rendering optimization
- Lazy loading of old transcripts
- Efficient state updates
- Memory management improvements

**Technical**: Performance profiling and optimization

---

### 14. **Privacy/Security Enhancements**
**Status**: Basic  
**Impact**: Medium  
**Effort**: Medium-High

**What**: Better privacy/security.

**Why**: Important for production use.

**How**:
- End-to-end encryption (optional)
- Better consent flows
- Data retention policies
- Room access controls
- Audit logging

**UI**: Privacy settings, consent improvements

---

### 15. **Analytics / Stats**
**Status**: Not implemented  
**Impact**: Low  
**Effort**: Low-Medium

**What**: Room analytics and statistics.

**Why**: Help users understand conversation quality.

**How**:
- Total speaking time per mic
- Transcript quality metrics
- Network quality stats
- Room duration
- Activity timeline

**UI**: Optional stats view

---

## Architectural Improvements

### 16. **OpenAI Realtime API Integration**
**Status**: Placeholder (endpoints exist)  
**Impact**: High (for latency)  
**Effort**: High

**What**: Full OpenAI Realtime API integration.

**Why**: Lower latency, better quality than chunked Whisper.

**How**:
- Complete server-side session management
- Client-side WebSocket to OpenAI
- Handle real-time transcript events
- Merge real-time transcripts

**Technical**: Requires OpenAI API documentation review

---

### 17. **Better Transcript Deduplication**
**Status**: Good (but could be better)  
**Impact**: Medium  
**Effort**: Medium

**What**: Improved transcript merging logic.

**Why**: Reduce duplicate transcripts, especially with many mics.

**How**:
- Better similarity detection
- Context-aware deduplication
- Speaker-aware merging
- Semantic similarity (vs just text matching)

**Technical**: NLP improvements

---

### 18. **Background Noise Filtering**
**Status**: Basic (VAD gating)  
**Impact**: Medium  
**Effort**: Medium

**What**: Better noise filtering.

**Why**: Reduce false transcripts from background noise.

**How**:
- Enhanced VAD (voice activity detection)
- Background noise cancellation
- Silence detection improvements
- Audio preprocessing

**Technical**: Audio processing improvements

---

## Prioritization Recommendations

### **Do First** (High Impact, Low Effort):
1. Better Viewer Detection (#2) - 30 min
2. Enhanced Mic Health Visualization (#4) - 2 hours
3. Better Error Messages (#8) - 1 hour

### **Do Next** (High Impact, Medium Effort):
4. Speaker Diarization (#1) - 1-2 days
5. Network Quality Indicators (#3) - 1 day
6. Improved Mic Naming (#5) - 2 hours

### **Consider Later** (Medium Impact):
7. Better Room Sharing Flow (#6)
8. Audio Quality Metrics (#7)
9. OpenAI Realtime API (#16) - Big project

### **Nice to Have** (Lower Priority):
10. Turn-Taking Detection (#9)
11. Multiple Language Support (#10)
12. Room Persistence (#11)
13. Mobile UX Improvements (#12)
14. Performance Optimizations (#13)
15. Privacy/Security (#14)
16. Analytics/Stats (#15)

---

## Quick Wins (Can Do Today)

1. **Better Viewer Detection** - Add `viewerCount` to room state
2. **Enhanced Error Messages** - Improve error text
3. **Better Mic Naming** - Remember names in localStorage
4. **Visual Mic Health** - Add color coding to health chips

---

## Future Considerations

- **Offline Mode**: Work without server connection
- **P2P Audio**: Direct mic-to-viewer audio (WebRTC)
- **Room Templates**: Save room configurations
- **Custom Summaries**: User-defined summary formats
- **Integration**: Slack, Teams, Discord bots
- **API**: REST API for external integrations











