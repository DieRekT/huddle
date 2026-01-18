
# Huddle UI Overhaul — Spec Pack (Cursor-ready)



This folder is the implementation contract for the Jan 2026 UI overhaul.



**Mission (non-negotiable):**

Huddle is a *peripheral awareness aid* for deaf / hard-of-hearing people when they can't visually track speakers.

Not a meeting app. Not a transcript-first tool.



## What you implement (in order)

1) UI shell + layout rules (top bar, single surface, drawers)

2) State machine (room status + attention + coverage) with hysteresis and dwell times

3) Catch Up overlay (2 sentences, confidence gated)

4) Settings drawer (only allowed settings)

5) Debug drawer (optional, hidden, never first-class)

6) Acceptance tests



## Files

- SPEC.md — Canonical product spec (screens, layout, behavior)

- STATE_MACHINE.md — Deterministic state transitions, thresholds, timing rules

- UI_COPY.md — Microcopy for every button/tooltip + all system text

- DESIGN_TOKENS.md — Celtics-inspired tokens + checklist

- GUARDRAILS.md — What must never appear on screen (and why)

- ACCEPTANCE_TESTS.md — Implementation-grade tests + pass criteria



## Cursor tasks

See `cursor_tasks/huddle_ui_overhaul/` for step-by-step build prompts.

