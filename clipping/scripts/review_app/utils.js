export function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatDuration(sec) {
  const totalSec = parseFloat(sec);
  const m = Math.floor(totalSec / 60);
  const s = (totalSec % 60).toFixed(1);
  if (m > 0) return `${m}分${s}秒 (${totalSec}s)`;
  return `${s}秒`;
}

export function mergeAdjacentSegments(segments, threshold = 0.05) {
  const merged = [];
  for (const seg of segments) {
    if (merged.length === 0) {
      merged.push({ ...seg });
      continue;
    }
    const last = merged[merged.length - 1];
    if (Math.abs(seg.start - last.end) < threshold) last.end = seg.end;
    else merged.push({ ...seg });
  }
  return merged;
}

