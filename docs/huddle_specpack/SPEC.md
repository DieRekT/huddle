
# Huddle — Peripheral Awareness UI (Jan 2026) — Product Spec



## 0) One-line definition

Huddle is a peripheral awareness aid for deaf / hard-of-hearing people when they can't visually track speakers.



## 1) What Huddle must do (in plain English)

Continuously answer:

- Is anyone talking right now?

- How active is the room (quiet vs discussion vs overlap)?

- Do I likely need to look up / respond (conservatively)?

- How reliable is the feed (coverage)?



## 2) What Huddle must NOT lead with

- Full transcripts (allowed only in Debug drawer)

- Speaker names (no diarization UI)

- Meeting controls, agendas, timers, "minutes"

- Long summaries

- Model/settings panels as primary UI

- "AI"-brag language (never on primary screens)



## 3) Screen model (ONLY THREE primary screens)

### Screen A — Room Awareness (default)

Single-glance, calm UI.



**Layout rules**

- One primary surface only. No split panes overlapping primary text.

- Large "status line" changes slowly (state machine dwell time).

- Small secondary line for attention guidance (never absolute claims).

- Coverage chip always visible.

- Top bar is the only control surface; everything else is a drawer or overlay.



**Always visible elements**

- Primary status (large)

- Secondary attention line (small)

- Coverage chip (Good/Partial/Limited + reason)

- Top bar buttons: Catch Up, Alerts, Text Size, Settings



**Top bar controls**

- Catch Up (button)

- Alerts (dropdown: Off / Gentle / Strong)

- Text size (A- / A+)

- Settings (icon button opens drawer)



**Optional cues**

- Subtle pulse animation tied to state changes (respect Reduce Motion)

- Vibration cue on state change if Alerts != Off (mobile only)



### Screen B — Catch Up (overlay; one tap)

Purpose: confidence-gated, short reassurance about what was missed.



**Rules**

- Max 2 sentences.

- Must be conservative. Never assert "They asked you…" unless confidence is high AND coverage not Limited AND sustained attention score.

- Always allows immediate return to Awareness with one tap.

- Overlay must not shift underlying layout.



### Screen C — Room Setup (Create / Join)

Purpose: minimum friction room entry.



**Rules**

- Joining via link/QR opens Viewer mode by default (NO mic permission prompt).

- "Enable microphone" is explicit and optional.

- "Create room" starts listening on host device (with permission only when user taps).



## 4) User journey

1) Open Huddle → Room Awareness (if already in a room, rejoin silently)

2) Create or Join Room

   - Create: becomes Host (listening device)

   - Join: becomes Viewer (safe mode)

3) Live Room Awareness runs continuously

4) Catch Up (one tap)

5) Optional: Enable microphone (explicit)

6) Leave Room

   - Host leaves → stops listening + room ends

   - Viewer leaves → leaves monitoring, room continues



## 5) Information hierarchy (what the user sees first)

1) "What's happening" (Room State)

2) "Do I need to look up" (Attention State)

3) "Can I trust this" (Coverage)

4) Optional details (only if user asks: Catch Up / Debug)



## 6) Visual tone

- Calm, high-contrast, low-cognitive-load

- Celtics-inspired greens as accents only; neutrals carry structure

- No neon, no busy gradients, no rapidly changing elements



## 7) Performance and stability requirements

- No state flicker: UI must not change more than once per 1.2s.

- All state transitions must be debounced with dwell time.

- Coverage reason must be present when not Good.

- Zero overlapping text in any viewport size from mobile to desktop.



## 8) Accessibility requirements

- Text size controls must scale primary and secondary lines without clipping.

- Reduce Motion disables pulses/animations and prefers opacity fades.

- Contrast mode strengthens borders/text weights and avoids thin gray text.



