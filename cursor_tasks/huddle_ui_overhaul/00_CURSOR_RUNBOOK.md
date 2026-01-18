
# Cursor Runbook — Huddle UI Overhaul (Do in order)



## Rules for Cursor

- Follow `docs/huddle_specpack/*` exactly.

- Do not invent new screens.

- Do not add new settings.

- Do not make transcript first-class.

- All UI states must come from the state machine (no ad-hoc UI heuristics).



---



## Task 1 — UI shell + layout guardrails

Goal: Implement the Room Awareness screen as the default and enforce layout rules:

- Single primary surface, no overlapping panels

- Top bar controls: Catch Up, Alerts dropdown, A-/A+, Settings drawer



Deliverables:

- Updated HTML/CSS layout for Room Awareness

- Settings drawer component (structure only; wire later)

- Catch Up overlay component (structure only; wire later)

- Ensure responsive behavior (mobile + desktop)



Definition of done:

- No clipping at max text size

- Reduce Motion toggle exists (no animation yet)

- Contrast toggle exists (no theme changes yet)



---



## Task 2 — Implement state machine (pure module)

Goal: Add a deterministic state machine per `STATE_MACHINE.md`.



Deliverables:

- A pure module that takes inputs (vadActive, speechEnergy, overlapScore, turnTakingRate, coverageScore, attentionScore, cues) and returns:

  - RoomState, AttentionState, CoverageState, CoverageReason

- Includes dwell-time gating + hysteresis + quiet hold

- Unit tests for all transition rules



Definition of done:

- Unit tests cover all transitions

- No UI dependencies in the state module



---



## Task 3 — Wire state machine into UI

Goal: UI labels update ONLY via the state machine.



Deliverables:

- Bind primary status text

- Bind attention line

- Bind coverage chip + reason

- Enforce "no more than 1 UI update per 1.2s" via dwell gate



Definition of done:

- States behave stable under simulated speech bursts



---



## Task 4 — Catch Up generation (bounded)

Goal: Catch Up overlay produces <=2 sentences with conservative phrasing.



Deliverables:

- Catch Up generator with strict constraints

- If confidence low -> include "Not fully sure."

- Never names speakers

- Never asserts directed speech unless conditions met



Definition of done:

- Tests verify sentence limit + phrasing constraints



---



## Task 5 — Settings wiring

Goal: Only allowed settings; defaults safe.



Deliverables:

- Alerts dropdown (Off/Gentle/Strong)

- Sensitivity dropdown (Low/Normal/High)

- Context dropdown (Minimal/Normal/Extra reassurance)

- Accessibility: Text size, Contrast, Reduce motion



Definition of done:

- Settings impact UI immediately (text size, contrast, motion)

- Alerts default is Gentle (or Off if you choose ultra-conservative)



---



## Task 6 — Debug drawer (optional)

Goal: Provide diagnostics without polluting primary experience.



Deliverables:

- Advanced section toggle in Settings

- Debug drawer with connection + mic states

- Debug transcript allowed but hidden



Definition of done:

- Debug never appears unless user opens Advanced



