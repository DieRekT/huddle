
# Huddle State Machine — Deterministic Rules



## 1) Inputs (runtime signals)

You will compute these continuously:



- `vadActive`: boolean (overall room voice activity)

- `speechEnergy`: 0..1 (smoothed)

- `overlapScore`: 0..1 (probability of simultaneous voices)

- `turnTakingRate`: events per minute (speaker turn changes, proxy allowed)

- `coverageScore`: 0..1 (audio reliability)

- `attentionScore`: 0..1 (conservative "user may be needed" composite)

- `nameCue`: boolean (optional; true only if reliable name/keyword hit)

- `directQuestionCue`: boolean (optional; reliable question pattern + pause)



All scores MUST be smoothed with EMA (or equivalent) to avoid jitter.



## 2) Outputs (UI states)

### RoomState (primary)

- `QUIET`

- `TALKING`

- `DISCUSSION`

- `OVERLAP`



### AttentionState (secondary)

- `NO_ACTION`

- `MAY_LOOK_UP`

- `POSSIBLE_ATTENTION_ON_YOU`



### CoverageState (chip)

- `GOOD`

- `PARTIAL`

- `LIMITED`



CoverageReason (only required when not GOOD)

- `DISTANT`

- `ECHO`

- `NOISE`

- `SINGLE_SIDE`

- `CLIPPING`

- `UNKNOWN` (allowed only if you truly cannot classify; avoid if possible)



## 3) Timing rules (non-negotiable)

### Dwell time (UI update gate)

A state must remain stable for >= 1.2s before UI changes.



### Hysteresis

Escalation thresholds must be stricter than de-escalation thresholds.



### Quiet hold

To return to QUIET, require >= 2.5s of `vadActive == false`.



## 4) RoomState transition rules

### QUIET -> TALKING

If `vadActive == true` sustained for >= 600ms.



### TALKING -> DISCUSSION

If `turnTakingRate >= 18/min` sustained for >= 2.0s.

(18/min is a default; tune later. Must remain deterministic.)



### DISCUSSION -> OVERLAP

If `overlapScore >= 0.70` sustained for >= 800ms.



### OVERLAP -> DISCUSSION

If `overlapScore <= 0.45` sustained for >= 1.6s AND `vadActive == true`.



### DISCUSSION -> TALKING

If `turnTakingRate <= 10/min` sustained for >= 3.0s AND `vadActive == true`.



### TALKING -> QUIET (global rule)

Any state -> QUIET only if `vadActive == false` sustained for >= 2.5s.



## 5) CoverageState rules

Compute CoverageState from `coverageScore`:

- GOOD: >= 0.75

- PARTIAL: 0.45 .. 0.74

- LIMITED: < 0.45



CoverageReason mapping (deterministic)

- If `coverageScore < 0.45` AND `speechEnergy` high but ASR confidence low => `NOISE`

- If high reverberation / long decay => `ECHO`

- If average signal level low across samples => `DISTANT`

- If clipping ratio high => `CLIPPING`

- If one-channel dominance / single mic only => `SINGLE_SIDE`

- Else => `UNKNOWN` (avoid)



## 6) AttentionState rules (conservative)

Important: this does NOT claim certainty. It only guides whether user should look up.



### Preconditions (hard)

If CoverageState == LIMITED => AttentionState MUST NOT exceed MAY_LOOK_UP.



### NO_ACTION -> MAY_LOOK_UP

If `attentionScore >= 0.55` sustained for >= 1.2s

OR `nameCue == true` sustained for >= 400ms.



### MAY_LOOK_UP -> POSSIBLE_ATTENTION_ON_YOU

Only if ALL true:

- CoverageState != LIMITED

- `attentionScore >= 0.80` sustained for >= 1.5s

AND at least one cue:

- `nameCue == true` OR `directQuestionCue == true`



### POSSIBLE_ATTENTION_ON_YOU -> MAY_LOOK_UP

If `attentionScore <= 0.65` sustained for >= 2.0s OR cues absent for >= 2.5s.



### MAY_LOOK_UP -> NO_ACTION

If `attentionScore <= 0.35` sustained for >= 3.0s AND `vadActive == true`

OR RoomState == QUIET.



## 7) Catch Up generation constraints

- Max 2 sentences.

- Must start with one of:

  - "General chat…"

  - "They're discussing…"

  - "A decision was being made about…"

- If confidence < threshold => must include "Not fully sure."

- Never mention people by name.

- Never claim "They asked you…" unless AttentionState was POSSIBLE_ATTENTION_ON_YOU for >= 2.0s AND CoverageState == GOOD.



