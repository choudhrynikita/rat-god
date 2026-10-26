// Sprite library for v2: loads assets/final/index.json, slices horizontal strips into frames and computes a per-frame
// registration correction (stable foot baseline, stable body centroid on looping locomotion) so loops don't jitter.
import { Assets, Rectangle, Texture } from 'pixi.js';

export interface Clip { id: string; frames: Texture[]; fps: number; loop: boolean; w: number; h: number; ax: number; ay: number;
  dx: Float32Array; dy: Float32Array; /** px from anchor up to the top of the body (for labels/bubbles) */ top: number; kind: string }
const clips = new Map<string, Clip>();
const BASE = 'assets/final/';
export const clip = (id: string) => clips.get(id);
export const has = (id: string) => clips.has(id);
export const allClips = () => clips;

function stabilise(img: HTMLImageElement | ImageBitmap, w: number, h: number, n: number, loopLoco: boolean) {
  const cv = document.createElement('canvas'); cv.width = w * n; cv.height = h; const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img as CanvasImageSource, 0, 0); const d = g.getImageData(0, 0, w * n, h).data;
  const base: number[] = [], cen: number[] = []; let top = h;
  for (let f = 0; f < n; f++) {
    let b = -1, sx = 0, cnt = 0;
    for (let y = h - 1; y >= 0 && b < 0; y--) for (let x = 0; x < w; x++) if (d[(y * w * n + f * w + x) * 4 + 3] > 128) { b = y; break; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w * n + f * w + x) * 4 + 3] > 128) { sx += x; cnt++; if (y < top) top = y; }
    base.push(b < 0 ? h - 1 : b); cen.push(cnt ? sx / cnt : w / 2);
  }
  const med = (a: number[]) => [...a].sort((p, q) => p - q)[a.length >> 1];
  const mb = med(base), mc = med(cen); const dx = new Float32Array(n), dy = new Float32Array(n);
  for (let f = 0; f < n; f++) { const e = mb - base[f]; dy[f] = Math.abs(e) <= 3 ? e : 0; if (loopLoco) { const c = mc - cen[f]; dx[f] = Math.abs(c) <= 4 ? Math.round(c) : 0; } }
  return { dx, dy, top, base: mb };
}
const LOCO = /walk|run|patrol|prowl|crawl|limp|swim|squeeze|carry/;

export async function loadSprites(onProgress?: (d: number, t: number) => void) {
  const idx = await (await fetch(BASE + 'index.json')).json();
  const list = (idx.assets as any[]).filter((a) => (a.type === 'anim' || a.type === 'fx_loop' || a.type === 'prop' || a.type === 'parallax' || a.type === 'background') && a.path && a.status !== 'failed');
  let done = 0;
  await Promise.all(list.map(async (a) => {
    try {
      const tex: Texture = await Assets.load({ src: BASE + a.path, data: { scaleMode: 'nearest' } });
      tex.source.scaleMode = 'nearest';
      const n = Math.max(1, a.frames || 1); const [w, h] = a.size ?? [tex.width / n, tex.height];
      const frames: Texture[] = []; for (let f = 0; f < n; f++) frames.push(new Texture({ source: tex.source, frame: new Rectangle(f * w, 0, w, h) }));
      let st = { dx: new Float32Array(n), dy: new Float32Array(n), top: 0, base: h - 1 };
      if (a.type === 'anim') st = stabilise(tex.source.resource as HTMLImageElement, w, h, n, !!a.loop && LOCO.test(a.anim ?? ''));
      const anc = a.anchor ?? [0.5, a.type === 'prop' ? 1 : 0.5];
      // anchor at the measured foot baseline for characters (sprites sit ON the floor, never float)
      const ay = a.type === 'anim' ? (st.base + 1) / h : anc[1];
      clips.set(a.id, { id: a.id, frames, fps: a.fps || 8, loop: a.loop !== false, w, h, ax: anc[0], ay, dx: st.dx, dy: st.dy, top: (st.base + 1 - st.top), kind: a.type });
    } catch (e) { console.warn('sprite load failed', a.id); }
    onProgress?.(++done, list.length);
  }));
  return clips;
}
