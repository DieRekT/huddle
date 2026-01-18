# Cursor Prompt — Task 2: State Machine Module

Implement a deterministic state machine exactly per docs/huddle_specpack/STATE_MACHINE.md.

Requirements:
- Pure module (no DOM, no network).
- Must implement dwell time (>= 1.2s), quiet hold (>= 2.5s), hysteresis.
- Must output RoomState, AttentionState, CoverageState, CoverageReason.
- Must include unit tests for every transition rule and constraints.
- Use fake timers / deterministic clock control.

Output:
- New module file(s)
- Test suite
- Minimal integration stub (not wired to UI yet)
