
# Acceptance Tests — Implementation Pass/Fail



## A) Permissions + privacy

1) Join via link/QR must NOT trigger microphone permission.

PASS: user can view Room Awareness without any permission modal.



2) "Enable microphone" must be explicit.

PASS: permission is requested only after user taps Enable microphone + confirms.



## B) State stability

3) No flicker.

PASS: UI changes state no more than once per 1.2s even during intermittent speech.



4) Quiet hold.

PASS: after speech ends, UI remains non-QUIET for at least 2.5s before returning to Quiet.



5) Overlap gating.

PASS: "Multiple voices" appears only when overlapScore >= 0.70 for >= 800ms.



## C) Coverage behavior

6) Coverage always visible.

PASS: Coverage chip visible on Room Awareness at all viewport sizes.



7) Coverage reason required.

PASS: When Coverage is Partial or Limited, a reason phrase is shown.



8) Attention ceiling under Limited coverage.

PASS: If Coverage == Limited, AttentionState never shows "Possible attention on you."



## D) Catch Up constraints

9) Max 2 sentences.

PASS: Catch Up never outputs more than 2 sentences.



10) Conservative language.

PASS: Catch Up never uses definitive phrasing ("they asked you") unless both:

- AttentionState was POSSIBLE_ATTENTION_ON_YOU for >= 2.0s AND

- Coverage == GOOD



11) One tap return.

PASS: Back closes overlay without layout shift; Room Awareness remains stable.



## E) Layout + accessibility

12) No overlap/clipping at max text size.

PASS: Primary and secondary lines remain readable with A+ on smallest supported viewport.



13) Reduce Motion.

PASS: toggling Reduce Motion removes pulse animation and uses fades only.



14) Contrast.

PASS: Contrast toggle visibly increases text/border clarity without breaking layout.



## Recommended automated tooling

- Playwright for UI flows (join link, open settings, toggles)

- Unit tests for state machine transitions (pure functions + fake clock)

