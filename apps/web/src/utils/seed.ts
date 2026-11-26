import { deriveSeed } from '@starspell/shared';

function randomUint32(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] ?? 1;
  }
  return Date.now() >>> 0 || 1;
}

/**
 * Resolves the base seed for a solo chapter.
 * Honours `?seed=<n>` ONLY outside production builds so Vite tree-shakes it from `vite build`.
 */
export function resolveBaseSeed(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
): number {
  if (!import.meta.env.PROD) {
    const params = new URLSearchParams(search);
    const raw = params.get('seed');
    if (raw !== null && raw.trim() !== '') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) {
        return parsed >>> 0;
      }
    }
  }
  return randomUint32();
}

/**
 * Resolves the chapter seed from a base seed and 1-based chapter index.
 */
export function resolveChapterSeed(chapter: number, search?: string): number {
  const baseSeed = resolveBaseSeed(search);
  return chapter <= 1 ? baseSeed : deriveSeed(baseSeed, chapter);
}
