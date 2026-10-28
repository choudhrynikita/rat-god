/**
 * Pure helpers shared by the sim worker and the render thread (no state, deterministic).
 * The render MUST use sampleEdge() to place things on tunnels so its curves match the sim's exactly.
 */
import { Mat, type NavEdge } from './contract';

export interface MatInfo { name: string; hardness: number; /** labour-ticks per tile to carve at skill 0.5 */ perm: number; /** water permeability 0..1 */ cohesion: number; /** resists collapse 0..1 */ diggable: boolean; color: number }
export const MATERIALS: Record<Mat, MatInfo> = {
  [Mat.Air]: { name: 'air', hardness: 0, perm: 1, cohesion: 1, diggable: false, color: 0x000000 },
  [Mat.Topsoil]: { name: 'topsoil', hardness: 6, perm: 0.55, cohesion: 0.35, diggable: true, color: 0x4a3426 },
  [Mat.Loam]: { name: 'loam', hardness: 9, perm: 0.35, cohesion: 0.6, diggable: true, color: 0x3e2c22 },
  [Mat.Clay]: { name: 'clay', hardness: 16, perm: 0.08, cohesion: 0.9, diggable: true, color: 0x5a3a2a },
  [Mat.Gravel]: { name: 'gravel', hardness: 12, perm: 0.8, cohesion: 0.15, diggable: true, color: 0x4b4744 },
  [Mat.Roots]: { name: 'roots', hardness: 22, perm: 0.4, cohesion: 0.95, diggable: true, color: 0x5b3b2b },
  [Mat.Rock]: { name: 'rock', hardness: 999, perm: 0.02, cohesion: 1, diggable: false, color: 0x3a3a3f },
  [Mat.Pipe]: { name: 'pipe', hardness: 999, perm: 0, cohesion: 1, diggable: false, color: 0x556066 },
  [Mat.Concrete]: { name: 'concrete', hardness: 999, perm: 0.01, cohesion: 1, diggable: false, color: 0x55565a },
  [Mat.Bedrock]: { name: 'bedrock', hardness: 999, perm: 0, cohesion: 1, diggable: false, color: 0x202024 },
};

/** Catmull-Rom (centripetal-ish uniform) interpolation of a control polyline, densified to ~STEP tiles. */
export const STEP = 0.5;
export interface Dense { xs: Float32Array; ys: Float32Array; cum: Float32Array; len: number }
const denseCache = new WeakMap<object, Dense>();
export function densify(pts: [number, number][]): Dense {
  const out: number[] = [];
  const P = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  if (pts.length === 1) out.push(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(1, Math.ceil(segLen / STEP));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push(f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]));
    }
  }
  if (pts.length > 1) out.push(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  const m = out.length / 2; const xs = new Float32Array(m), ys = new Float32Array(m), cum = new Float32Array(m);
  for (let i = 0; i < m; i++) { xs[i] = out[2 * i]; ys[i] = out[2 * i + 1]; if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]); }
  return { xs, ys, cum, len: cum[m - 1] };
}
export function denseOf(e: Pick<NavEdge, 'pts'>): Dense { let d = denseCache.get(e.pts); if (!d) { d = densify(e.pts); denseCache.set(e.pts, d); } return d; }
/** control points moved (a column shift). The cached spline would otherwise stay on the old ground. */
export function forgetDense(pts: object) { denseCache.delete(pts); }
export interface Pose { x: number; y: number; heading: number }
/** Point at arc length s (clamped) along the edge, with the tangent heading (radians, direction a→b). */
export function sampleDense(d: Dense, s: number, out: Pose = { x: 0, y: 0, heading: 0 }): Pose {
  const { xs, ys, cum } = d; const m = xs.length;
  if (m === 1) { out.x = xs[0]; out.y = ys[0]; out.heading = 0; return out; }
  if (s <= 0) { out.x = xs[0]; out.y = ys[0]; out.heading = Math.atan2(ys[1] - ys[0], xs[1] - xs[0]); return out; }
  if (s >= d.len) { out.x = xs[m - 1]; out.y = ys[m - 1]; out.heading = Math.atan2(ys[m - 1] - ys[m - 2], xs[m - 1] - xs[m - 2]); return out; }
  let lo = 0, hi = m - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
  const t = (s - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
  out.x = xs[lo] + (xs[hi] - xs[lo]) * t; out.y = ys[lo] + (ys[hi] - ys[lo]) * t; out.heading = Math.atan2(ys[hi] - ys[lo], xs[hi] - xs[lo]);
  return out;
}
export const sampleEdge = (e: Pick<NavEdge, 'pts'>, s: number, out?: Pose) => sampleDense(denseOf(e), s, out);

/** Recommended gait stride in tiles per full walk cycle, by stage (pup..elder). Render: phase = (dist / stride) % 1. */
export const STRIDE_TILES = [1.6, 2.6, 3.4, 3.0];
/** Typical speeds in tiles/tick, for reference (the sim sets RatsBlock.speed). */
export const SPEEDS = { crawl: 0.25, squeeze: 0.35, carry: 0.7, walk: 1.0, trot: 1.5, run: 2.6, flee: 3.4 };
export const LAW_IDS_NOTE = 'Law ids are the v1 ids (src/sim/laws.ts); definitions are sent in the init message.';
