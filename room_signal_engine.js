/**
 * Room Signal Engine (RSE)
 * 
 * Converts raw audio chunks + transcripts into stable, truthful room segments.
 * No UI coupling. Pure backend truth discipline.
 */

// === Similarity Functions (same as server.js) ===

function normalizeText(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[\u2019']/g, "'")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s) {
  const t = normalizeText(s);
  return t ? t.split(" ") : [];
}

function jaccardSimilarity(a, b) {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uni = A.size + B.size - inter;
  return uni ? inter / uni : 0;
}

function jaroWinkler(a, b) {
  a = normalizeText(a);
  b = normalizeText(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const al = a.length,
    bl = b.length;
  const matchDist = Math.floor(Math.max(al, bl) / 2) - 1;
  const aM = new Array(al).fill(false);
  const bM = new Array(bl).fill(false);
  let matches = 0;

  for (let i = 0; i < al; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, bl);
    for (let j = start; j < end; j++) {
      if (bM[j]) continue;
      if (a[i] !== b[j]) continue;
      aM[i] = true;
      bM[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;

  let t = 0,
    k = 0;
  for (let i = 0; i < al; i++) {
    if (!aM[i]) continue;
    while (!bM[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  t /= 2;

  const m = matches;
  const jaro = (m / al + m / bl + (m - t) / m) / 3;

  let prefix = 0;
  for (let i = 0; i < Math.min(4, al, bl); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }
  const p = 0.1;
  return jaro + prefix * p * (1 - jaro);
}

function combinedSimilarity(a, b) {
  const jw = jaroWinkler(a, b);
  const jac = jaccardSimilarity(a, b);
  return 0.65 * jw + 0.35 * jac;
}

// === Room Signal Engine ===

export class RoomSignalEngine {
  constructor(roomCode, options = {}) {
    this.roomCode = roomCode;
    this.options = {
      // Window configuration
      windowTargetMs: options.windowTargetMs || 2500,
      windowExtendGapMs: options.windowExtendGapMs || 700,
      windowCloseSilenceMs: options.windowCloseSilenceMs || 900,
      windowMaxDurationMs: options.windowMaxDurationMs || 6000,
      windowMinDurationMs: options.windowMinDurationMs || 1200,

      // RMS thresholds
      noiseFloorWindowSize: options.noiseFloorWindowSize || 30,
      noiseFloorMaxRms: options.noiseFloorMaxRms || 0.03,
      speechThresholdOffset: options.speechThresholdOffset || 0.02,
      strongSpeechOffset: options.strongSpeechOffset || 0.05,

      // Merge configuration
      mergeWindowMs: options.mergeWindowMs || 1200,
      mergeSimilarityThreshold: options.mergeSimilarityThreshold || 0.92,

      // Confidence weights
      confidenceWeights: options.confidenceWeights || {
        coverage: 0.4,
        clarity: 0.3,
        consensus: 0.2,
        stability: 0.1
      }
    };

    // Per-device state
    this.deviceWindows = new Map(); // deviceId -> MicWindow
    this.deviceRmsHistory = new Map(); // deviceId -> [rms values]
    this.deviceReconnects = new Map(); // deviceId -> count

    // Room-level output
    this.segments = []; // RoomSegment[]
    this.nextSegmentId = 1;

    // Statistics for confidence
    this.totalWindows = 0;
    this.speakingWindows = 0;
    this.reconnectCount = 0;
  }

  /**
   * Ingest audio chunk metadata
   */
  ingestAudioChunk({ deviceId, rms, timestampMs, hasSpeechHint = false }) {
    if (!deviceId || typeof rms !== 'number' || isNaN(rms)) return;

    const ts = timestampMs || Date.now();

    // Track RMS history for noise floor
    if (!this.deviceRmsHistory.has(deviceId)) {
      this.deviceRmsHistory.set(deviceId, []);
    }
    const history = this.deviceRmsHistory.get(deviceId);
    history.push(rms);
    // Keep only recent history
    const maxHistory = this.options.noiseFloorWindowSize * 2;
    if (history.length > maxHistory) {
      history.shift();
    }

    // Get or create window
    let window = this.deviceWindows.get(deviceId);

    // Compute dynamic noise floor and thresholds
    const noiseFloor = this.computeNoiseFloor(deviceId);
    const speechThreshold = noiseFloor + this.options.speechThresholdOffset;
    const strongSpeech = noiseFloor + this.options.strongSpeechOffset;

    const isSpeech = rms >= speechThreshold || hasSpeechHint;
    const isStrongSpeech = rms >= strongSpeech;

    if (!window) {
      // No active window - check if we should open one
      if (isSpeech) {
        window = {
          deviceId,
          startMs: ts,
          endMs: ts,
          rmsSum: rms,
          rmsPeak: rms,
          rmsCount: 1,
          chunkCount: 1,
          transcriptCandidates: [],
          closed: false
        };
        this.deviceWindows.set(deviceId, window);
      }
    } else if (!window.closed) {
      // Active window - extend or close
      const gapMs = ts - window.endMs;
      const durationMs = ts - window.startMs;

      if (isSpeech || gapMs < this.options.windowExtendGapMs) {
        // Extend window
        window.endMs = ts;
        window.rmsSum += rms;
        window.rmsCount++;
        window.rmsPeak = Math.max(window.rmsPeak, rms);
        window.chunkCount++;
      } else if (gapMs >= this.options.windowCloseSilenceMs || durationMs >= this.options.windowMaxDurationMs) {
        // Close window
        this.closeWindow(deviceId, window);
      }
    }

    // Check if we should emit a window immediately (strong speech + duration)
    if (window && !window.closed) {
      const durationMs = ts - window.startMs;
      if (durationMs >= this.options.windowMinDurationMs || isStrongSpeech) {
        // Could emit now, but let's wait for tick() to do it cleanly
      }
    }
  }

  /**
   * Ingest transcript candidate from server transcription
   */
  ingestTranscriptCandidate({ deviceId, text, timestampMs, confidence = null }) {
    if (!deviceId || !text || typeof text !== 'string') return;

    const ts = timestampMs || Date.now();
    const cleanedText = text.trim();

    if (!cleanedText) return;

    // Find active window for this device
    const window = this.deviceWindows.get(deviceId);
    if (window && !window.closed) {
      // Add to active window's candidates
      window.transcriptCandidates.push({
        text: cleanedText,
        timestampMs: ts,
        confidence: confidence || 1.0
      });
    } else {
      // No active window - create a temporary one for this transcript
      // This handles cases where transcript arrives without audio chunks
      const tempWindow = {
        deviceId,
        startMs: ts - 1000, // Assume 1s before transcript
        endMs: ts,
        rmsSum: 0,
        rmsPeak: 0.05, // Default for transcripts without RMS
        rmsCount: 0,
        chunkCount: 0,
        transcriptCandidates: [
          {
            text: cleanedText,
            timestampMs: ts,
            confidence: confidence || 1.0
          }
        ],
        closed: false
      };
      this.deviceWindows.set(deviceId, tempWindow);
      // Close it immediately so it gets processed
      this.closeWindow(deviceId, tempWindow);
    }
  }

  /**
   * Periodic tick - process windows and emit segments
   */
  tick(nowMs) {
    const now = nowMs || Date.now();

    // Check all active windows for closure conditions
    for (const [deviceId, window] of this.deviceWindows.entries()) {
      if (window.closed) continue;

      const gapMs = now - window.endMs;
      const durationMs = now - window.startMs;

      // Check if window should be closed
      if (gapMs >= this.options.windowCloseSilenceMs || durationMs >= this.options.windowMaxDurationMs) {
        this.closeWindow(deviceId, window);
      }
    }
  }

  /**
   * Compute dynamic noise floor for a device
   */
  computeNoiseFloor(deviceId) {
    const history = this.deviceRmsHistory.get(deviceId);
    if (!history || history.length < 5) {
      return 0.01; // Default noise floor
    }

    // Get low-energy samples (likely noise)
    const lowEnergy = history
      .filter(rms => rms < this.options.noiseFloorMaxRms)
      .slice(-this.options.noiseFloorWindowSize);

    if (lowEnergy.length === 0) {
      return 0.01; // No low-energy samples, use default
    }

    // Compute median
    const sorted = [...lowEnergy].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * Close a window and emit segment if valid
   */
  closeWindow(deviceId, window) {
    if (window.closed) return;
    window.closed = true;

    const durationMs = window.endMs - window.startMs;
    const rmsAvg = window.rmsCount > 0 ? window.rmsSum / window.rmsCount : 0;

    // Only emit if window meets minimum criteria
    if (
      durationMs >= this.options.windowMinDurationMs ||
      window.rmsPeak >= this.computeNoiseFloor(deviceId) + this.options.strongSpeechOffset
    ) {
      this.emitSegment(deviceId, window);
    }

    // Clean up window
    this.deviceWindows.delete(deviceId);
  }

  /**
   * Emit a room segment from a closed window
   */
  emitSegment(deviceId, window) {
    this.totalWindows++;

    // Choose best transcript candidate
    let bestText = null;
    let bestConfidence = 0;

    if (window.transcriptCandidates.length > 0) {
      // Sort by confidence, then by text length
      const candidates = [...window.transcriptCandidates].sort((a, b) => {
        const confDiff = (b.confidence || 1.0) - (a.confidence || 1.0);
        if (Math.abs(confDiff) > 0.1) return confDiff;
        return b.text.length - a.text.length;
      });

      bestText = candidates[0].text;
      bestConfidence = candidates[0].confidence || 1.0;
      this.speakingWindows++;
    } else {
      // No transcript - create placeholder or skip?
      // For now, skip segments without transcripts
      return;
    }

    const rmsAvg = window.rmsCount > 0 ? window.rmsSum / window.rmsCount : window.rmsPeak;

    // Create candidate segment
    const candidateSegment = {
      id: `seg-${this.nextSegmentId++}`,
      startMs: window.startMs,
      endMs: window.endMs,
      text: bestText,
      bestDeviceId: deviceId,
      devicesContributed: [deviceId],
      qualityScore: this.computeQualityScore(window, bestConfidence),
      rmsAvg,
      rmsPeak: window.rmsPeak
    };

    // Merge with existing segments if similar
    const merged = this.mergeSegment(candidateSegment);
    if (merged) {
      this.segments.push(merged);
    }
  }

  /**
   * Merge segment with existing segments if similar
   */
  mergeSegment(candidate) {
    const windowStart = candidate.startMs - this.options.mergeWindowMs;
    const windowEnd = candidate.endMs + this.options.mergeWindowMs;

    // Find existing segments within time window
    const candidates = this.segments.filter(
      seg => seg.endMs >= windowStart && seg.startMs <= windowEnd
    );

    for (const existing of candidates) {
      const similarity = combinedSimilarity(candidate.text, existing.text);
      if (similarity >= this.options.mergeSimilarityThreshold) {
        // Merge into existing segment
        // Keep "best" segment (higher quality, longer, or clearer)
        const candidateScore = this.segmentScore(candidate);
        const existingScore = this.segmentScore(existing);

        if (candidateScore > existingScore) {
          // Replace existing with candidate
          const idx = this.segments.indexOf(existing);
          if (idx >= 0) {
            this.segments.splice(idx, 1);
            // Add existing's device to contributors
            candidate.devicesContributed = [
              ...new Set([...candidate.devicesContributed, ...existing.devicesContributed])
            ];
            return candidate;
          }
        } else {
          // Keep existing, add candidate's device to contributors
          existing.devicesContributed = [
            ...new Set([...existing.devicesContributed, ...candidate.devicesContributed])
          ];
          // Update bestDeviceId if candidate is better
          if (candidateScore > existingScore * 0.9) {
            existing.bestDeviceId = candidate.bestDeviceId;
          }
          return null; // Don't add candidate, existing was kept
        }
      }
    }

    // No merge - return candidate as-is
    return candidate;
  }

  /**
   * Score a segment for comparison (higher = better)
   */
  segmentScore(segment) {
    const quality = segment.qualityScore || 0.5;
    const textLength = normalizeText(segment.text).length;
    const rmsScore = segment.rmsAvg || 0;
    return quality * 0.5 + (textLength / 100) * 0.3 + rmsScore * 0.2;
  }

  /**
   * Compute quality score for a window
   */
  computeQualityScore(window, transcriptConfidence) {
    const rmsAvg = window.rmsCount > 0 ? window.rmsSum / window.rmsCount : window.rmsPeak;
    const noiseFloor = this.computeNoiseFloor(window.deviceId);
    const clarity = Math.min(1.0, (rmsAvg - noiseFloor) / 0.1); // Normalize to 0-1
    return Math.min(1.0, (transcriptConfidence * 0.7 + clarity * 0.3));
  }

  /**
   * Get segments since timestamp
   */
  getSegments(sinceMs) {
    const since = sinceMs || 0;
    return this.segments.filter(seg => seg.endMs >= since);
  }

  /**
   * Get room signal (high-level summary)
   */
  getRoomSignal(nowMs) {
    const now = nowMs || Date.now();
    const recentWindowMs = 180000; // 3 minutes
    const windowStart = now - recentWindowMs;

    const recentSegments = this.getSegments(windowStart);

    // Compute confidence components
    // Coverage: speaking windows / total windows in recent period
    // For now, use segment count as proxy (each segment = one speaking window)
    const recentWindowCount = recentSegments.length;
    const coverage = recentWindowCount > 0 ? Math.min(1.0, this.speakingWindows / Math.max(1, this.totalWindows)) : 0;
    const clarity = recentSegments.length > 0
      ? recentSegments.reduce((sum, seg) => sum + (seg.qualityScore || 0.5), 0) / recentSegments.length
      : 0.5;
    const consensus = recentSegments.length > 0
      ? recentSegments.reduce((sum, seg) => sum + Math.min(1, seg.devicesContributed.length / 2), 0) / recentSegments.length
      : 0;
    const stability = 1.0 - Math.min(1.0, this.reconnectCount / Math.max(1, recentWindowCount));

    // Compute final confidence
    const weights = this.options.confidenceWeights;
    let confidence =
      weights.coverage * coverage +
      weights.clarity * clarity +
      weights.consensus * consensus +
      weights.stability * stability;

    // Apply hard caps
    if (confidence > 0.85) {
      if (coverage <= 0.75 || clarity <= 0.75 || stability <= 0.8) {
        confidence = 0.85;
      }
    }

    return {
      confidence: Math.max(0, Math.min(1, confidence)),
      segments: recentSegments.length,
      coverage,
      clarity,
      consensus,
      stability
    };
  }
}

