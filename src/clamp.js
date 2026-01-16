export function clampText(text, maxChars) {
  if (!text) return '';
  const s = String(text);
  if (!maxChars || s.length <= maxChars) return s;
  return s.slice(0, Math.max(0, maxChars)).trimEnd() + '...';
}

export function clampList(arr, maxItems, maxItemChars = 120) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const item of arr) {
    if (out.length >= maxItems) break;
    const s = clampText(String(item ?? '').trim(), maxItemChars);
    if (s) out.push(s);
  }
  return out;
}

export function clampSummaryObject(summaryObj) {
  const obj = summaryObj && typeof summaryObj === 'object' ? summaryObj : {};

  return {
    topic: clampText(obj.topic || '', 60),
    subtopic: clampText(obj.subtopic || '', 80),
    status: obj.status || 'Deciding',
    rolling_summary: clampText(obj.rolling_summary || '', 200),
    decisions: clampList(obj.decisions || [], 5, 140),
    next_steps: clampList(obj.next_steps || [], 5, 140),
    confidence: typeof obj.confidence === 'number' ? obj.confidence : 0.5
  };
}

























