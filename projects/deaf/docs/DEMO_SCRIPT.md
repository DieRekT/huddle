# RoomBrief - Demo Script

This script helps you test RoomBrief end-to-end with Adr(i)ck's use case.

## Setup

1. Start the server:
   ```bash
   ./scripts/run.sh
   ```

2. For mobile testing, expose via HTTPS:
   ```bash
   cloudflared tunnel --url http://localhost:8787
   ```
   Copy the HTTPS URL provided.

3. Prepare devices:
   - **Device 1**: Viewer (Adr(i)ck's device) - laptop/tablet/phone
   - **Device 2**: Mic (Friend 1) - phone
   - **Device 3**: Mic (Friend 2) - phone (optional)

## Test Scenario: Weekend Planning Conversation

### Step 1: Create Room (Viewer)

1. Open app on Device 1 (Viewer)
2. Enter name: "Adrick"
3. Select "Viewer"
4. Click "Create Room"
5. Note the room code (e.g., "K8F3QZ")
6. Share code with others

### Step 2: Join as Mic Devices

**Device 2 (Friend 1)**:
1. Open app
2. Enter name: "Allan"
3. Select "Mic"
4. Enter room code
5. Click "Join Room"
6. Click "Start Mic"
7. Grant microphone permission

**Device 3 (Friend 2)** - Optional:
1. Repeat steps above with name "Sarah"

### Step 3: Test Conversation Flow

Have the mic devices engage in a natural conversation. Suggested script:

**Topic 1: Planning Weekend BBQ**
- Allan: "Hey, should we do a BBQ this weekend?"
- Sarah: "Yeah, that sounds great! When were you thinking?"
- Allan: "How about Saturday? Maybe around 4pm?"
- Sarah: "4pm works for me. Where should we have it?"
- Allan: "Let's do it at Harwood Hall. Adrick, can you confirm if you're free?"

**Topic Shift: Money Discussion**
- Allan: "Actually, wait. How much is this going to cost?"
- Sarah: "We could split it. Maybe $20 each?"
- Allan: "That's reasonable. Should we ask everyone to bring something?"

**Topic Shift: Transportation**
- Sarah: "Oh, and who can drive? I don't have a car."
- Allan: "I can drive. I'll pick up Adrick too if needed."

### Step 4: Test Viewer Features

While conversation is happening, on Viewer device:

1. **Check Topic Header**:
   - Should show current topic (e.g., "Weekend BBQ")
   - Subtopic should update (e.g., "Time & location" → "Cost" → "Transportation")
   - Status should change appropriately

2. **Check Rolling Summary**:
   - Should update every ~10 seconds
   - Should be concise (1-2 sentences)
   - Should reflect current conversation state

3. **Check Lanes**:
   - Decisions: Should show "BBQ at Harwood Hall", "Saturday 4pm", etc.
   - Actions: Should show "Adrick to confirm availability", etc.
   - Questions: Should show "Who can drive?", etc.

4. **Test "What I Missed"**:
   - Wait for conversation to continue
   - Click "What I missed?" button
   - Should show recap + bullet points of recent activity

5. **Test Topic Shift Alert**:
   - When conversation shifts topics, alert should appear
   - Should show new topic clearly

6. **Check Transcript**:
   - Should show live transcript with speaker names
   - Should scroll automatically
   - Should be readable

### Step 5: Test Edge Cases

1. **Mic disconnects**:
   - Stop mic on one device
   - Viewer should still receive updates from other mics
   - Mic can rejoin with same code

2. **Viewer reconnects**:
   - Close viewer tab
   - Reopen and join with same room code
   - Should see recent transcripts and current state

3. **Multiple topic shifts**:
   - Have rapid topic changes
   - Topic header should remain stable (not flip constantly)
   - Alerts should only appear for significant shifts

4. **Silence handling**:
   - Have mic devices be silent for 30 seconds
   - System should handle gracefully (no errors)
   - Summary should still update with available context

## Success Criteria

✅ Viewer can follow conversation without asking "what's happening?"
✅ Topic header accurately reflects conversation
✅ "What I missed" provides useful catch-up
✅ Multiple mics work simultaneously
✅ System handles topic shifts gracefully
✅ No crashes or errors during 10+ minute session

## Troubleshooting

**No transcriptions appearing**:
- Check OpenAI API key in .env
- Check server logs for errors
- Verify mic permissions granted

**Topic not updating**:
- Check SUMMARY_INTERVAL_SEC in .env (default 10s)
- Check server logs for summary errors
- Ensure conversation is active

**Mobile mic not working**:
- Must use HTTPS (use Cloudflare tunnel)
- Check browser permissions
- Try Chrome or Firefox

**Room not found**:
- Room codes expire after 2 hours idle
- Ensure exact code match (case-sensitive)
- Check server is running

## Notes for Adr(i)ck's Use Case

This demo specifically tests:
- **Paranoia trigger**: Topic shifts → alerts help
- **Spread-out room**: Multiple mics improve accuracy
- **Catch-up**: "What I missed" reduces anxiety
- **Context**: Summary + lanes provide comprehension layer

If Adr(i)ck still feels anxious, consider:
- Adjusting SUMMARY_INTERVAL_SEC (faster updates)
- Adding haptic feedback on topic shifts
- Customizing summary tone/prompt
- Adding "confidence meter" visualization




























