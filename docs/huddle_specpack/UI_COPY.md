
# UI Copy — Buttons, Labels, Tooltips (Complete)



## Global voice

- Calm, brief, never dramatic.

- Conservative language: "may", "possible", "not fully sure".

- Never guilt the user. Never scold.



---



# 1) Top bar (Room Awareness)



## Button: Catch Up

Label: Catch Up

Tooltip: Quick summary of what you missed.

Accessibility label: Catch Up — summary overlay



## Dropdown: Alerts

Label: Alerts

Options:

- Off — No vibration or pulses

- Gentle — Subtle pulse / light vibration on changes

- Strong — Clear pulse / stronger vibration on changes

Tooltip: Choose how strongly Huddle nudges you.



## Button: Text size down

Label: A-

Tooltip: Reduce text size.

Accessibility label: Decrease text size



## Button: Text size up

Label: A+

Tooltip: Increase text size.

Accessibility label: Increase text size



## Button: Settings (drawer)

Tooltip: Open settings.

Accessibility label: Open settings drawer



---



# 2) Room Awareness (primary surface)



## Primary status line (RoomState)

QUIET: Quiet

TALKING: Someone speaking

DISCUSSION: Group discussion

OVERLAP: Multiple voices



## Secondary attention line (AttentionState)

NO_ACTION: Nothing you need to respond to.

MAY_LOOK_UP: You may want to look up.

POSSIBLE_ATTENTION_ON_YOU: Possible attention on you.



## Coverage chip

GOOD: Coverage: Good

Subtext: Clear + close



PARTIAL: Coverage: Partial

Subtext templates (pick one based on CoverageReason):

- Distant: Far / softer audio

- Echo: Echo / reverb

- Noise: Background noise

- Single-side: Only one side heard

- Clipping: Audio distortion

- Unknown: Mixed conditions



LIMITED: Coverage: Limited

Subtext templates (pick one based on CoverageReason):

- Distant: Too far away

- Echo: Too echoey

- Noise: Too noisy

- Single-side: Only one side captured

- Clipping: Distorted audio

- Unknown: Low reliability



---



# 3) Catch Up overlay



Title: Catch Up

Subtitle (optional, small): A short summary, confidence-gated.



Buttons:

- Back (icon) — Tooltip: Return to live awareness.

- Copy (optional) — Tooltip: Copy summary to clipboard.



System copy rules:

- Max 2 sentences.

- Conservative language; never absolute claims.

- If uncertain: include "Not fully sure."



Example outputs (style reference):

- "General chat about weekend plans. Nothing you need to respond to."

- "They're discussing what to do next. Not fully sure, but it sounds undecided."

- "A decision was being made about timing. You may want to look up."



---



# 4) Room Setup screen



Title: Huddle

Subtitle: Room awareness, without needing to face the room.



Buttons:

## Create Room

Label: Create room

Tooltip: Start a room from this device.

Subtext: This device listens for room awareness.



## Join Room

Label: Join room

Tooltip: Join a room using a code or link.

Subtext: Opens in Viewer mode — no microphone needed.



## Scan QR (optional)

Label: Scan QR

Tooltip: Scan a room QR code.



---



# 5) Viewer safe mode



Badge: Viewer mode

Helper text: Monitoring only. Microphone is off.



Button:

## Enable microphone

Label: Enable microphone

Tooltip: Share audio from this device. You can turn it off anytime.

Confirm dialog title: Enable microphone?

Confirm body: This will ask for microphone permission and share audio to the room.

Buttons: Cancel / Enable



---



# 6) Leave / End



Viewer button:

Label: Leave room

Tooltip: Stop monitoring this room.



Host button:

Label: End room

Tooltip: Stop listening and close the room for everyone.

Confirm dialog title: End room?

Confirm body: This stops listening and ends the room.

Buttons: Cancel / End room



---



# 7) Settings drawer (only allowed settings)



Section: Alerts

- Alerts (dropdown): Off / Gentle / Strong

- Sensitivity (dropdown): Low / Normal / High

Tooltip (Sensitivity): Adjust how easily Huddle triggers "look up" nudges.



Section: Context

- Context (dropdown): Minimal / Normal / Extra reassurance

Tooltip: Changes how much explanation Catch Up provides.



Section: Accessibility

- Text size (A- / A+)

- Contrast (toggle): Increase contrast

- Reduce motion (toggle): Reduce animations

Tooltips:

- Contrast: Stronger text and edges for easier reading.

- Reduce motion: Limits movement and pulses.



Section: Debug (hidden behind "Advanced")

Label: Advanced

Tooltip: Diagnostics and transcript view.



---



# 8) Debug drawer (optional; never primary)



Title: Diagnostics

Badges:

- Connection: Connected / Reconnecting / Offline

- Mic: Active / Off (per device)

- Model: (internal; do not show model names publicly)



Transcript label: Debug transcript

Helper text: For troubleshooting only. Not the main experience.



