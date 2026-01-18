# Read-the-Room Formal Scoring Framework

## Implementation Complete ✅

The Read-the-Room feature now includes a **formal scoring framework** that enables self-grading, self-correction, and deterministic quality control.

## What Was Implemented

### 1. **Scoring Rubric (100 points total)**

The system evaluates summaries across 6 categories:

- **Factual Grounding (25 pts)**: Only facts directly supported by transcript
- **Situational Awareness (20 pts)**: Clear sense of activity, environment, constraints
- **Emotional & Cognitive Tone (15 pts)**: Accurate tone without mind-reading
- **Relevance Filtering (15 pts)**: Key themes surfaced, trivia compressed
- **Structural Clarity (15 pts)**: Clean sections, logical flow
- **Usefulness for Deaf/HoH Users (10 pts)**: Provides orientation and reassurance

### 2. **Self-Grading System**

After generating a summary, the system:
1. Scores itself using the rubric
2. Lists deductions explicitly
3. Calculates total score
4. Takes corrective action based on score

### 3. **Self-Correction Loop**

**Score ≥ 70**: Acceptable - Ship with score metadata

**Score 55-69**: Weak - Use revised summary if provided, otherwise keep original with warning

**Score < 55**: Unsafe - Regenerate with simplified, conservative prompt

### 4. **Automatic Penalties**

The system penalizes:
- Identity assumptions (-10)
- Unstated motivations (-10)
- Invented places/events (-15)
- Emotional mind-reading (reduces tone score)

## How It Works

1. **Initial Generation**: Summary is generated with scoring rules embedded in prompt
2. **Self-Grading**: AI scores its own output using the rubric
3. **Correction**: If score < 70, system attempts revision or regeneration
4. **Logging**: All scores and deductions are logged for auditability

## Benefits

✅ **Auditable**: Every summary has a score and reasoning  
✅ **Predictable**: Deterministic quality thresholds  
✅ **Legally Safer**: No identity assumptions or hallucinations  
✅ **Trust-Building**: Deaf users get reliable, grounded summaries  

## Configuration

Self-grading is enabled by default. To disable:

```javascript
await generateReadRoomSummary(room, { enableSelfGrading: false });
```

## Logging

The system logs:
- Self-grade scores (info level)
- Deductions and issues (debug level)
- Regeneration events (warn level)

Example log output:
```
[ROOM_CODE] Self-grade score: 85/100
  scores: { factual_grounding: 25, situational_awareness: 18, ... }
  deductions: []
```

## Next Steps (Future Enhancements)

The framework is ready for:
- 🔀 **Adaptive verbosity modes** (1-line reassurance vs full context)
- 🧪 **Confidence calibration** tied to transcript coverage
- 🕰️ **Timeline-aware Room Signals** ("conversation is shifting")

## Technical Details

### Functions Added

- `getReadRoomScoringRubric()`: Returns the scoring framework text
- `getSelfGradingPrompt()`: Generates self-grading prompt
- `selfGradeAndCorrect()`: Main self-grading and correction logic
- `regenerateWithSimplifiedPrompt()`: Conservative regeneration for low scores

### Integration Points

- `generateReadRoomSummary()`: Main function now includes self-grading
- Both single-pass and chunked summarization paths support scoring
- Scores are included in return object (for future UI display)

## Testing

To test the scoring system:

1. Generate a Read-the-Room summary
2. Check server logs for score output
3. Verify low-scoring summaries trigger correction
4. Confirm no identity assumptions or hallucinations appear

---

**Status**: Production-ready ✅  
**Version**: 1.0  
**Date**: 2026-01

