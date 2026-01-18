# Cursor Prompt — Task 4: Catch Up Overlay (Bounded)

Implement Catch Up generation.

Constraints (must enforce):
- Max 2 sentences.
- Must start with: "General chat…", "They're discussing…", or "A decision was being made about…"
- If uncertain: include "Not fully sure."
- Never mentions people by name.
- Never claims "They asked you…" unless:
  - AttentionState == POSSIBLE_ATTENTION_ON_YOU for >= 2.0s AND CoverageState == GOOD.

Output:
- Catch Up generator + tests
- Overlay wiring to display output
