
# Guardrails — What Never Appears on Screen



These are hard constraints. If any appear in the primary UI, the implementation is rejected.



## Never on the primary surface (Room Awareness)

- Full transcript blocks or scrolling transcript panels

- Speaker names / diarization ("John: …")

- Meeting controls (agenda, minutes, action items, timers)

- "AI model" selectors, temperatures, provider names

- Multi-pane dashboards with overlapping cards

- Rapidly changing waveform visualizers

- Notifications that demand attention ("URGENT", "ALERT")



## Never as definitive claims

- "They asked you…"

- "They said your name…" (unless nameCue is reliable and explicitly enabled)

- "They are talking about you."

- Any medical/legal advice tone



## Never-request behaviors

- Mic permission prompts triggered automatically on join

- Auto-enabling microphone when opening Viewer link/QR

- Auto-switching screens without explicit user action (except initial route)

- Loud haptics by default (Alerts default must be Gentle or Off)



## Debug content rules

- Debug drawer may show transcript for troubleshooting only.

- Debug must be behind "Advanced".

- Debug must never be the default view.



