export function pageSegments({ segments, cursor, limit }) {
  const segs = Array.isArray(segments) ? segments : [];
  let lim = Number(limit || 80);
  if (!Number.isFinite(lim) || lim <= 0) lim = 80;
  lim = Math.min(lim, 300);

  const len = segs.length;
  const cur = cursor == null ? null : Number(cursor);

  if (len === 0) {
    return { segments: [], nextCursor: null };
  }

  if (cur == null || !Number.isFinite(cur)) {
    const start = Math.max(0, len - lim);
    const slice = segs.slice(start, len);
    return { segments: slice, nextCursor: start > 0 ? start : null };
  }

  const end = Math.max(0, Math.min(cur, len));
  const start = Math.max(0, end - lim);
  const slice = segs.slice(start, end);
  return { segments: slice, nextCursor: start > 0 ? start : null };
}

























