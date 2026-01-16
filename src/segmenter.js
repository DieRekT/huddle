import { randomBytes } from 'crypto';

export const DEFAULT_THRESHOLDS = {
  PAUSE_BOUNDARY_MS: 2000,
  MERGE_GAP_MS: 1200,
  MAX_CHARS: 280,
  MAX_WORDS: 35,
  MAX_DURATION_MS: 12000
};

function countWords(text) {
  if (!text) return 0;
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

function cleanText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function needsSpaceJoin(prevText, nextText) {
  if (!prevText) return false;
  const last = prevText.slice(-1);
  if (last === '-' || last === '—') return false;
  if (/[([{\u201C\u2018]$/.test(last)) return false;
  if (/[\s]$/.test(last)) return false;
  if (/^[.,!?;:)\]}]/.test(nextText)) return false;
  return true;
}

function makeId() {
  return randomBytes(8).toString('hex');
}

/**
 * addUtterance(segments, incoming, thresholds?) -> { segments, event }
 * incoming: { speaker, text, tEndMs, tStartMs?, sourceClientId? }
 * event: { action: 'created'|'updated', segment }
 */
export function addUtterance(segments, incoming, thresholds = DEFAULT_THRESHOLDS) {
  const segs = Array.isArray(segments) ? segments : [];
  const speaker = String(incoming?.speaker || 'Unknown');
  const text = cleanText(incoming?.text || '');
  const tEndMs = Number(incoming?.tEndMs || Date.now());
  const tStartMs = incoming?.tStartMs != null ? Number(incoming.tStartMs) : null;
  const sourceClientId = incoming?.sourceClientId || null;

  if (!text) {
    return { segments: segs, event: null };
  }

  // Find last segment for this speaker
  let lastIdx = -1;
  for (let i = segs.length - 1; i >= 0; i--) {
    if (segs[i]?.speaker === speaker) {
      lastIdx = i;
      break;
    }
  }

  const shouldStartNew = () => {
    if (lastIdx === -1) return true;
    const last = segs[lastIdx];
    const gap = tEndMs - Number(last.tEndMs || 0);

    if (gap >= thresholds.PAUSE_BOUNDARY_MS) return true;

    const combinedText = (last.text || '') + (needsSpaceJoin(last.text || '', text) ? ' ' : '') + text;
    const combinedChars = combinedText.length;
    const combinedWords = countWords(combinedText);

    const durStart = Number(last.tStartMs ?? last.tEndMs ?? tEndMs);
    const duration = tEndMs - durStart;

    if (gap >= thresholds.MERGE_GAP_MS) return true;
    if (combinedChars > thresholds.MAX_CHARS) return true;
    if (combinedWords > thresholds.MAX_WORDS) return true;
    if (duration > thresholds.MAX_DURATION_MS) return true;

    return false;
  };

  if (shouldStartNew()) {
    const seg = {
      id: makeId(),
      speaker,
      text,
      tStartMs: tStartMs != null ? tStartMs : tEndMs,
      tEndMs,
      sourceClientId
    };
    return { segments: [...segs, seg], event: { action: 'created', segment: seg } };
  }

  // Merge into last segment for speaker
  const last = segs[lastIdx];
  const mergedText = (last.text || '') + (needsSpaceJoin(last.text || '', text) ? ' ' : '') + text;
  const updated = {
    ...last,
    text: mergedText,
    tEndMs
  };
  const out = segs.slice();
  out[lastIdx] = updated;
  return { segments: out, event: { action: 'updated', segment: updated } };
}

























