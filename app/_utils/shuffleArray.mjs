export function shuffleArray(items, rng = Math.random) {
  const next = Array.isArray(items) ? [...items] : [];
  const random = typeof rng === 'function' ? rng : Math.random;
  for (let i = next.length - 1; i > 0; i -= 1) {
    const raw = Number(random());
    const normalized = Number.isFinite(raw) ? Math.min(0.999999999, Math.max(0, raw)) : 0;
    const j = Math.floor(normalized * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}
