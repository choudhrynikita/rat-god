/** Column growth. Terraria keeps one fixed tile array and saves it; this world starts the same way,
 *  then widens and deepens when the burrow or the camera nears an edge. Left growth shifts every x
 *  so idx = y*W+x stays true. New columns are hashed from the seed, not from the sim RNG. */
import { Mat } from './contract';
import { clamp, type Terrain, type World } from './state';
import { forgetDense } from './shared';
import { tileStab, vnoise1 } from './terrain';

const CHUNK_X = 64;
const CHUNK_Y = 48;
const MAX_W = 2048;
const MAX_H = 420;
const EDGE = 36;

export function maybeGrow(w: World): { dx: number; grew: boolean } {
  const T = w.T;
  let minX = T.W, maxX = 0, maxY = 0, any = false;
  const consider = (x: number, y: number) => { any = true; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y > maxY) maxY = y; };
  for (const c of w.chambers) if (c.progress > 0.02) { consider(c.cx - c.rx, c.cy - c.ry); consider(c.cx + c.rx, c.cy + c.ry); }
  // the street walkway is born spanning the whole map; it must not drag the crust wider every tick
  for (const e of w.edges) if (e.kind !== 'surface' && e.dug > 0.4) for (const p of e.pts) consider(p[0], p[1]);
  for (const n of w.nodes) if (n.kind === 'entrance') consider(n.x, n.y);
  if (w.view) { consider(w.view.x0, w.view.y0); consider(w.view.x1, w.view.y1); }
  if (!any) return { dx: 0, grew: false };
  const origW = T.W, origH = T.H;
  let dx = 0, grew = false;
  if (minX < EDGE && origW + CHUNK_X <= MAX_W) { growLeft(w, CHUNK_X); dx += CHUNK_X; grew = true; }
  if (maxX > origW - EDGE && w.T.W + CHUNK_X <= MAX_W) { growRight(w, CHUNK_X); grew = true; }
  if (maxY > origH - EDGE && w.T.H + CHUNK_Y <= MAX_H) { growDown(w, CHUNK_Y); grew = true; }
  if (grew) w.dirtyTiles.clear();
  return { dx, grew };
}

function growLeft(w: World, n: number) {
  const oldW = w.T.W;
  realloc(w.T, oldW + n, w.T.H, n);
  for (let x = 0; x < n; x++) fillColumn(w.T, w.seed, x);
  shiftWorldX(w, n, oldW);
  extendPipes(w.T, n, 'left');
}

function growRight(w: World, n: number) {
  const oldW = w.T.W;
  realloc(w.T, oldW + n, w.T.H, 0);
  for (let x = oldW; x < w.T.W; x++) fillColumn(w.T, w.seed, x);
  extendPipes(w.T, oldW, 'right');
}

function growDown(w: World, n: number) {
  const oldH = w.T.H;
  realloc(w.T, w.T.W, oldH + n, 0);
  const T = w.T, seed = w.seed;
  for (let x = 0; x < T.W; x++) {
    const sy = T.surfaceY[x];
    const b = T.H - 9 - Math.round(6 * vnoise1(seed + 19, x, 30));
    for (let y = 0; y < T.H; y++) {
      const i = y * T.W + x;
      if (y >= oldH) {
        const m = columnMat(seed, x, y, T.H, sy);
        T.mat[i] = m; T.carve[i] = m === Mat.Air ? 255 : 0; T.water[i] = 0; T.debris[i] = 0;
        T.moist[i] = moistOf(m, y - sy); T.stab[i] = tileStab(T, i);
      } else if (T.carve[i] < 40 && T.mat[i] !== Mat.Air && T.mat[i] !== Mat.Pipe && T.mat[i] !== Mat.Concrete && T.mat[i] !== Mat.Rock) {
        if (T.mat[i] === Mat.Bedrock && y < b) { T.mat[i] = Mat.Loam; T.stab[i] = tileStab(T, i); }
        else if (y >= b) { T.mat[i] = Mat.Bedrock; T.stab[i] = tileStab(T, i); }
      }
    }
  }
}

function realloc(T: Terrain, newW: number, newH: number, dx: number) {
  const oldW = T.W, oldH = T.H;
  const mat = new Uint8Array(newW * newH), carve = new Uint8Array(newW * newH), water = new Uint8Array(newW * newH);
  const moist = new Uint8Array(newW * newH), debris = new Uint8Array(newW * newH), stab = new Uint8Array(newW * newH);
  const rows = Math.min(oldH, newH);
  for (let y = 0; y < rows; y++) {
    const s = y * oldW, d = y * newW + dx, n = oldW;
    mat.set(T.mat.subarray(s, s + n), d);
    carve.set(T.carve.subarray(s, s + n), d);
    water.set(T.water.subarray(s, s + n), d);
    moist.set(T.moist.subarray(s, s + n), d);
    debris.set(T.debris.subarray(s, s + n), d);
    stab.set(T.stab.subarray(s, s + n), d);
  }
  const surfaceY = new Int16Array(newW);
  surfaceY.set(T.surfaceY.subarray(0, Math.min(oldW, newW - dx)), dx);
  T.W = newW; T.H = newH; T.mat = mat; T.carve = carve; T.water = water; T.moist = moist; T.debris = debris; T.stab = stab; T.surfaceY = surfaceY;
}

function fillColumn(T: Terrain, seed: number, x: number) {
  const sy = Math.round(30 + 3 * (vnoise1(seed, x, 40) - 0.5) * 2 + 1.2 * (vnoise1(seed + 7, x, 9) - 0.5));
  T.surfaceY[x] = sy;
  for (let y = 0; y < T.H; y++) {
    const i = y * T.W + x;
    const m = columnMat(seed, x, y, T.H, sy);
    T.mat[i] = m;
    T.carve[i] = m === Mat.Air ? 255 : 0;
    T.water[i] = 0; T.debris[i] = 0;
    T.moist[i] = moistOf(m, y - sy);
    T.stab[i] = tileStab(T, i);
  }
}

function columnMat(seed: number, x: number, y: number, H: number, sy: number): Mat {
  const d = y - sy;
  const t = 4 + Math.round(3 * vnoise1(seed + 11, x, 25));
  const l = 40 + Math.round(18 * vnoise1(seed + 13, x, 60));
  const c = 95 + Math.round(25 * vnoise1(seed + 17, x, 70));
  const b = H - 9 - Math.round(6 * vnoise1(seed + 19, x, 30));
  let m: Mat;
  if (d < 0) m = Mat.Air;
  else if (d < t) m = Mat.Topsoil;
  else if (d < l) m = Mat.Loam;
  else if (d < c) m = Mat.Clay;
  else if (y < b) m = Mat.Loam;
  else m = Mat.Bedrock;
  if (m !== Mat.Air && m !== Mat.Bedrock) {
    const pocket = vnoise1(seed + 91, x * 3 + y, 7);
    if (pocket > 0.82 && d > 8 && d < 90) m = pocket > 0.91 ? Mat.Gravel : Mat.Clay;
    const band = 55 + 40 * vnoise1(seed + 103, x, 30);
    if (vnoise1(seed + 101, x, 18) > 0.86 && Math.abs(y - band) < 3 + 4 * vnoise1(seed + 107, x, 12)) m = Mat.Rock;
  }
  return m;
}

function moistOf(m: Mat, d: number) {
  if (m === Mat.Air) return 0;
  return clamp(Math.round(40 + Math.max(0, d) * 0.6 + (m === Mat.Clay ? 50 : 0) + (m === Mat.Gravel ? -20 : 0)), 0, 255);
}

function shiftWorldX(w: World, dx: number, oldW: number) {
  const newW = w.T.W;
  for (const n of w.nodes) n.x += dx;
  const seen = new WeakSet<[number, number]>();
  for (const e of w.edges) {
    for (const p of e.pts) { if (seen.has(p)) continue; seen.add(p); p[0] += dx; }
    forgetDense(e.pts);
  }
  for (const c of w.chambers) c.cx += dx;
  for (const r of w.rats) r.x += dx;
  for (const r of w.ghosts.values()) r.x += dx;
  for (const h of w.hazards) h.x += dx;
  for (const c of w.corpses) c.x += dx;
  for (const it of w.items) it.x += dx;
  for (const p of w.posters) p.x += dx;
  for (const e of w.events) if (e.x != null) e.x += dx;
  for (const p of w.prayers) p.x += dx;
  for (const c of w.crimes) c.x += dx;
  for (const p of w.T.pipes) { p.x0 += dx; p.x1 += dx; }
  for (const r of w.T.rocks) r.cx += dx;
  for (const r of w.T.roots) for (const p of r.pts) p[0] += dx;
  const mapIndex = (i: number) => { const x = i % oldW, y = (i / oldW) | 0; return y * newW + x + dx; };
  for (const m of [w.gasField, w.fireField, w.smokeField]) {
    if (!m.size) continue;
    const next = new Map<number, number>();
    for (const [i, v] of m) next.set(mapIndex(i), v);
    m.clear(); for (const [i, v] of next) m.set(i, v);
  }
  w.T.wet = w.T.wet.map(mapIndex);
}

/** A main that used to end on the old border keeps going into the new ground. */
function extendPipes(T: Terrain, mark: number, side: 'left' | 'right') {
  for (const p of T.pipes) {
    const hit = side === 'left' ? Math.abs(p.x0 - mark) < 1.5 : Math.abs(p.x1 - (mark - 1)) < 1.5;
    if (!hit) continue;
    const span = (p.x1 - p.x0) || 1;
    const slope = (p.y1 - p.y0) / span;
    if (side === 'left') {
      const y0 = p.y0 - slope * mark;
      stampPipe(T, 0, y0, p.x0, p.y0, p.r);
      p.x0 = 0; p.y0 = y0;
    } else {
      const x1 = T.W - 1;
      const y1 = p.y1 + slope * (x1 - p.x1);
      stampPipe(T, p.x1, p.y1, x1, y1, p.r);
      p.x1 = x1; p.y1 = y1;
    }
  }
}

function stampPipe(T: Terrain, x0: number, y0: number, x1: number, y1: number, r: number) {
  const xa = Math.max(0, Math.floor(Math.min(x0, x1)));
  const xb = Math.min(T.W - 1, Math.ceil(Math.max(x0, x1)));
  const span = (x1 - x0) || 1;
  for (let x = xa; x <= xb; x++) {
    const yc = y0 + (y1 - y0) * ((x - x0) / span);
    for (let y = Math.floor(yc - r); y <= Math.ceil(yc + r); y++) {
      if (y < 0 || y >= T.H) continue;
      const i = y * T.W + x;
      if (T.mat[i] !== Mat.Air && T.carve[i] < 200) T.mat[i] = Mat.Pipe;
    }
  }
}
