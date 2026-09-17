/* Shared, deterministic OCR validation. Also loaded by node:test. */
(function(root) {
  const normalize = value => String(value ?? '').normalize('NFC').replace(/\s+/g, '');
  const baseName = value => normalize(value).replace(/\([^)]*\)$/, '');
  function readLevel(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (!/^\d{1,2}$/.test(String(value).trim())) return null;
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
  }
  function distance(a, b) {
    const row = Array.from({length: b.length + 1}, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0]; row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const old = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = old;
      }
    }
    return row[b.length];
  }
  function match(raw, dataset) {
    const name = normalize(raw), keys = Object.keys(dataset);
    if (!name) return {key: null, fuzzy: false, candidates: []};
    // A bare name may have both an untagged value and conditional variants.
    const exact = keys.filter(k => baseName(k) === name || normalize(k) === name);
    if (exact.length === 1) return {key: exact[0], fuzzy: false, candidates: exact};
    if (exact.length > 1) return {key: null, fuzzy: false, candidates: exact};
    const limit = name.length >= 4 ? Math.floor(name.length * 0.25) : 0;
    const candidates = keys.map(key => ({key, d: distance(name, baseName(key))}))
      .filter(x => x.d <= limit).sort((a, b) => a.d - b.d).map(x => x.key);
    return {key: null, fuzzy: candidates.length > 0, candidates};
  }
  function splitRows(box, count) {
    if (!Number.isInteger(count) || count < 1 || count > 18) throw new Error('행 수는 1~18이어야 합니다.');
    return Array.from({length: count}, (_, i) => ({x: box.x, y: box.y + box.h * i / count, w: box.w, h: box.h / count}));
  }
  const api = {normalize, baseName, readLevel, distance, match, splitRows};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OCR = api;
})(globalThis);
