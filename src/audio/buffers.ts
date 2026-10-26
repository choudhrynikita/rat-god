// Lazy cue loading: compressed bytes are fetched on demand (and kept: ~0.3-0.8 MB each), decoded buffers live in a
// small LRU so a phone never holds more than ~MAX_DECODED_SEC of PCM (mono 48 kHz float ≈ 0.19 MB/s).
import { AUDIO_EXT } from './core';
import { AUDIO_BASE } from './manifest';
const MAX_DECODED_SEC = 420;
const bytes = new Map<string, Promise<ArrayBuffer | null>>();
const decoded = new Map<string, { buf: AudioBuffer; used: number }>();
const decoding = new Map<string, Promise<AudioBuffer | null>>();
const pinned = new Set<string>();
const url = (file: string) => `${file.startsWith('assets/') ? '' : AUDIO_BASE}${file}.${AUDIO_EXT}`;
/** fetch the compressed file only (cheap, for prefetching likely-next cues) */
export function prefetch(file: string) {
  if (!bytes.has(file)) bytes.set(file, fetch(url(file)).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
  return bytes.get(file)!;
}
export function getDecoded(file: string) { const d = decoded.get(file); if (d) d.used = performance.now(); return d?.buf ?? null; }
export function load(ctx: BaseAudioContext, file: string): Promise<AudioBuffer | null> {
  const d = decoded.get(file); if (d) { d.used = performance.now(); return Promise.resolve(d.buf); }
  if (decoding.has(file)) return decoding.get(file)!;
  const p = prefetch(file).then(async (ab) => {
    if (!ab) return null;
    try { const buf = await ctx.decodeAudioData(ab.slice(0)); decoded.set(file, { buf, used: performance.now() }); evict(); return buf; } catch { return null; }
  }).finally(() => decoding.delete(file));
  decoding.set(file, p); return p;
}
/** keep a buffer resident regardless of LRU (the currently playing cue and its stems) */
export function pin(files: string[]) { pinned.clear(); for (const f of files) pinned.add(f); }
function evict() {
  let total = 0; for (const v of decoded.values()) total += v.buf.duration;
  if (total <= MAX_DECODED_SEC) return;
  const order = [...decoded.entries()].filter(([k]) => !pinned.has(k)).sort((a, b) => a[1].used - b[1].used);
  for (const [k, v] of order) { if (total <= MAX_DECODED_SEC) break; decoded.delete(k); total -= v.buf.duration; }
}
export function stats() { let sec = 0; for (const v of decoded.values()) sec += v.buf.duration; return { decoded: decoded.size, decodedSec: Math.round(sec), fetched: bytes.size }; }
