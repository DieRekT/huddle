# RoomBrief MVP - Changelog

## Latest Update: Status Display Improvements & Bug Fixes

### Status Display Enhancements (2025-01-10)
- ✅ **Fixed**: Viewer now correctly shows mic activity status (was showing "waiting" even when mics active)
- ✅ **Fixed**: Mic roster properly updated when audio chunks received
- ✅ **Fixed**: `lastSeen` timestamp now updated for ALL audio chunks (not just init chunks)
- ✅ **Added**: Intelligent status messages with contextual information
- ✅ **Added**: Visual indicators (color coding, pulsing animations) for status states
- ✅ **Added**: Real-time status updates every 2 seconds + event-driven updates
- ✅ **Improved**: Status detection based on mic activity, transcript history, and room state

See `STATUS_DISPLAY_IMPROVEMENTS.md` for complete details.

---

## Previous Update: Polish & Finishing Changes

## Summary of Changes

This update polishes the RoomBrief MVP with reliability improvements, UI simplification, privacy features, and code quality enhancements.

## A) Viewer UI Polish

### Changes Made:
- ✅ Simplified to two lanes: **Decisions** + **Next Steps** (removed Questions)
- ✅ Made "What I missed?" button primary (blue, more prominent)
- ✅ Added empty states: "Waiting for speech...", "No decisions yet", "No next steps yet"
- ✅ Improved mobile layout: Topic + Summary above fold
- ✅ Transcript auto-scroll only when user hasn't scrolled up
- ✅ Added live captions banner with "End & delete" button

### Files Modified:
- `public/index.html`: Removed Questions lane, added empty states, added live banner
- `public/app.js`: Updated to handle two lanes, improved scroll behavior
- `public/style.css`: Mobile-first improvements, empty state styles

## B) Mic UX Reliability

### Changes Made:
- ✅ Added "Mic LIVE" indicator with pulse animation
- ✅ Added mic stats: chunks sent count + last sent timestamp
- ✅ Pre-flight mic permission check on join
- ✅ HTTPS warning banner for mobile devices
- ✅ Consent checkbox: "Everyone here knows captions are running"
- ✅ Better error messages for mic permission failures
- ✅ Start button disabled until consent given

### Files Modified:
- `public/index.html`: Added consent checkbox, HTTPS warning, mic stats display
- `public/app.js`: Added permission check, stats tracking, better error handling
- `public/style.css`: Styles for consent box, HTTPS warning, mic stats

## C) Summary Stability + Clamping

### Changes Made:
- ✅ Topic stability rule: requires confidence >= 0.60 AND persist for 2 consecutive updates
- ✅ Length clamping enforced:
  - Rolling summary: max 200 characters
  - Decisions: max 5 items
  - Next steps: max 5 items
  - Missed summary: max 220 characters, max 5 bullets
- ✅ Changed "actions" to "next_steps" throughout (UI + model)
- ✅ Removed "questions" from model output

### Files Modified:
- `server.js`: Added clamping functions, topic stability logic, updated prompts
- `test.js`: Added tests for topic stability and clamping (all pass ✅)

## D) Privacy/Consent Minimum Viable

### Changes Made:
- ✅ Consent checkbox before mic start (required)
- ✅ Persistent "Live captions active" banner on viewer screen
- ✅ "End & delete" button to delete room data
- ✅ Admin token system for room deletion (secure)
- ✅ DELETE `/api/room/:code` endpoint with token verification

### Files Modified:
- `server.js`: Added admin token generation, delete endpoint, WebSocket delete handler
- `public/index.html`: Added consent checkbox, live banner
- `public/app.js`: Added delete room functionality

## E) Code Quality + Tests

### Changes Made:
- ✅ Updated to two-lane model (Decisions + Next Steps)
- ✅ Added `test.js` with 2 test suites:
  1. Topic stability gating logic
  2. Clamping functions (summary + array)
- ✅ All tests pass ✅
- ✅ Added `npm test` script

### Files Modified:
- `package.json`: Added test script
- `test.js`: New test file
- `server.js`: Refactored summary logic for stability

## Configuration Updates

- `TOPIC_SHIFT_CONFIDENCE_THRESHOLD`: Default changed from 0.7 to 0.60
- Model prompts updated to enforce length limits
- Model output changed from "actions" to "next_steps"

## Testing

Run tests:
```bash
npm test
```

All tests pass ✅

## Next Steps for Production

1. **Consent screen**: Consider more detailed consent language
2. **Auth**: Add optional room passcode (see tickets)
3. **Export**: Add session export feature (see tickets)
4. **Accessibility**: Font size toggle, high contrast mode
5. **Deployment**: HTTPS setup guide (Cloudflare tunnel documented)

## Files Changed

- `server.js` - Major updates (stability, clamping, privacy)
- `public/index.html` - UI simplification, new elements
- `public/app.js` - Feature additions, error handling
- `public/style.css` - New styles, mobile improvements
- `package.json` - Added test script
- `test.js` - New test file

## Breaking Changes

- **API**: Summary model now returns "next_steps" instead of "actions"
- **UI**: Questions lane removed (now only Decisions + Next Steps)
- **WebSocket**: New "delete_room" message type, "room_created" now includes adminToken












