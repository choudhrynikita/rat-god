/** Procedural soil cross-section: strata, rock lenses, pipes, roots, moisture, stability. */
import { Mat, PASSABLE } from './contract';
import { MATERIALS } from './shared';
import { R, clamp, type Terrain, type World } from './state';

export const W0 = 320, H0 = 180;

export function vnoise1(seed: number, x: number, scale: number) {
  const h = (i: number) => { let v = Math.imul((i + seed) | 0, 0x27d4eb2d); v ^= v >>> 15; v = Math.imul(v, 0x85ebca6b); v ^= v >>> 13; return ((v >>> 0) % 10000) / 10000; };
  const xi = Math.floor(x / scale), t = x / scale - xi, f = t * t * (3 - 2 * t);
  return h(xi) * (1 - f) + h(xi + 1) * f;
}

export function genTerrain(w: World): Terrain {
  const W = W0, H = H0, N = W * H;
  const seed = w.seed;
  const mat = new Uint8Array(N), carve = new Uint8Array(N), water = new Uint8Array(N), moist = new Uint8Array(N), debris = new Uint8Array(N), stab = new Uint8Array(N);
  const surfaceY = new Int16Array(W);
  for (let x = 0; x < W; x++) surfaceY[x] = Math.round(30 + 3 * (vnoise1(seed, x, 40) - 0.5) * 2 + 1.2 * (vnoise1(seed + 7, x, 9) - 0.5));
  // strata depths (relative to surface)
  const top = (x: number) => 4 + Math.round(3 * vnoise1(seed + 11, x, 25));
  const loamEnd = (x: number) => 40 + Math.round(18 * vnoise1(seed + 13, x, 60));
  const clayEnd = (x: number) => 95 + Math.round(25 * vnoise1(seed + 17, x, 70));
  const bed = (x: number) => H - 9 - Math.round(6 * vnoise1(seed + 19, x, 30));
  // the street: a concrete slab on one side (the Giants' pavement), with a grate gap
  const streetLeft = R(w) < 0.5;
  const streetW = 70 + Math.floor(R(w) * 50);
  const grateX = streetLeft ? 15 + Math.floor(R(w) * (streetW - 30)) : W - streetW + 15 + Math.floor(R(w) * (streetW - 30));
  for (let x = 0; x < W; x++) {
    const sy = surfaceY[x], t = top(x), l = loamEnd(x), c = clayEnd(x), b = bed(x);
    const inStreet = streetLeft ? x < streetW : x >= W - streetW;
    for (let y = 0; y < H; y++) {
      const i = y * W + x; const d = y - sy;
      let m: Mat;
      if (d < 0) m = Mat.Air;
      else if (inStreet && d < 3 && Math.abs(x - grateX) > 2) m = Mat.Concrete;
      else if (d < t) m = Mat.Topsoil;
      else if (d < l) m = Mat.Loam;
      else if (d < c) m = Mat.Clay;
      else if (y < b) m = Mat.Loam; // deep silty loam
      else m = Mat.Bedrock;
      mat[i] = m;
      if (m === Mat.Air) carve[i] = 255;
    }
  }
  // lenses of gravel and clay
  const lens = (m: Mat, n: number, rxr: [number, number], ryr: [number, number], yr: [number, number]) => {
    for (let k = 0; k < n; k++) {
      const cx = R(w) * W, cy = yr[0] + R(w) * (yr[1] - yr[0]), rx = rxr[0] + R(w) * (rxr[1] - rxr[0]), ry = ryr[0] + R(w) * (ryr[1] - ryr[0]);
      for (let y = Math.max(0, Math.floor(cy - ry)); y < Math.min(H, cy + ry); y++) for (let x = Math.max(0, Math.floor(cx - rx)); x < Math.min(W, cx + rx); x++) {
        const i = y * W + x; if (mat[i] === Mat.Air || mat[i] === Mat.Concrete || mat[i] === Mat.Bedrock) continue;
        const dx = (x - cx) / rx, dy = (y - cy) / ry; if (dx * dx + dy * dy < 1 - 0.25 * vnoise1(seed + k, x + y, 4)) mat[i] = m;
      }
    }
  };
  lens(Mat.Gravel, 6 + Math.floor(R(w) * 6), [8, 22], [3, 6], [45, 150]);
  lens(Mat.Clay, 5 + Math.floor(R(w) * 5), [10, 26], [4, 8], [40, 120]);
  // rocks (boulders) — undiggable, tunnels must route around
  const rocks: Terrain['rocks'] = [];
  const nRock = 7 + Math.floor(R(w) * 9);
  for (let k = 0; k < nRock; k++) {
    const cx = 10 + R(w) * (W - 20), cy = 48 + R(w) * (H - 70), rx = 3 + R(w) * 7, ry = 2 + R(w) * 5;
    rocks.push({ cx, cy, rx, ry });
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue; const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) { const i = y * W + x; if (mat[i] !== Mat.Air) mat[i] = Mat.Rock; }
    }
  }
  // pipes (the Giants' water mains and drains) — undiggable, sometimes leaking
  const pipes: Terrain['pipes'] = [];
  const nPipe = 1 + Math.floor(R(w) * 3);
  for (let k = 0; k < nPipe; k++) {
    const y0 = 40 + R(w) * 60, y1 = y0 + (R(w) - 0.5) * 16, r = 1.5 + R(w) * 2;
    const p = { x0: 0, y0, x1: W - 1, y1, r, leaking: R(w) < 0.35 };
    pipes.push(p);
    for (let x = 0; x < W; x++) {
      const yc = y0 + (y1 - y0) * (x / (W - 1));
      for (let y = Math.floor(yc - r); y <= yc + r; y++) { if (y < 0 || y >= H) continue; const i = y * W + x; if (mat[i] !== Mat.Air) mat[i] = Mat.Pipe; }
    }
  }
  // roots from trees on the unpaved side
  const roots: Terrain['roots'] = [];
  const nTree = 1 + Math.floor(R(w) * 3);
  for (let k = 0; k < nTree; k++) {
    let tx = 0; for (let tries = 0; tries < 20; tries++) { tx = 10 + R(w) * (W - 20); const inStreet = streetLeft ? tx < streetW : tx >= W - streetW; if (!inStreet) break; }
    const branches = 3 + Math.floor(R(w) * 4);
    for (let b = 0; b < branches; b++) {
      const pts: [number, number][] = []; let x = tx, y = surfaceY[Math.floor(tx)];
      let a = Math.PI / 2 + (R(w) - 0.5) * 1.8; const L = 15 + R(w) * 30;
      for (let s = 0; s < L; s += 3) { pts.push([x, y]); x += Math.cos(a) * 3; y += Math.sin(a) * 3; a += (R(w) - 0.5) * 0.5; }
      const r = 0.8 + R(w) * 1.2; roots.push({ pts, r });
      for (const [px, py] of pts) for (let yy = Math.floor(py - r); yy <= py + r; yy++) for (let xx = Math.floor(px - r); xx <= px + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const i = yy * W + xx; if (mat[i] === Mat.Topsoil || mat[i] === Mat.Loam || mat[i] === Mat.Clay) mat[i] = Mat.Roots;
      }
    }
  }
  // moisture: wetter with depth near clay, near leaking pipes; drier near roots
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (mat[i] === Mat.Air) continue; const d = y - surfaceY[x];
    let m = 40 + d * 0.6 + (mat[i] === Mat.Clay ? 50 : 0) + (mat[i] === Mat.Gravel ? -20 : 0);
    for (const p of pipes) if (p.leaking) { const yc = p.y0 + (p.y1 - p.y0) * (x / (W - 1)); const dd = Math.abs(y - yc); if (dd < 14) m += (14 - dd) * 7; }
    moist[i] = clamp(Math.round(m), 0, 255);
  }
  const T: Terrain = { W, H, surfaceY, mat, carve, water, moist, debris, stab, pipes, roots, rocks, wet: [] };
  for (let i = 0; i < N; i++) stab[i] = tileStab(T, i);
  (T as any).grateX = grateX;
  return T;
}

/** structural stability 0..255 of a tile, from its own cohesion, moisture and nearby carved openness */
export function tileStab(T: Terrain, i: number): number {
  const m = T.mat[i] as Mat; if (m === Mat.Air) return 255;
  const c = MATERIALS[m].cohesion;
  return clamp(Math.round(255 * c * (1 - 0.45 * (T.moist[i] / 255)) + 10), 0, 255);
}

export const idx = (T: Terrain, x: number, y: number) => (Math.floor(y) * T.W + Math.floor(x));
export const inB = (T: Terrain, x: number, y: number) => x >= 0 && y >= 0 && x < T.W && y < T.H;
export const passableAt = (T: Terrain, x: number, y: number) => inB(T, x, y) && T.carve[idx(T, x, y)] >= PASSABLE;
export const diggable = (T: Terrain, i: number) => MATERIALS[T.mat[i] as Mat].diggable;

/** set carve on a disc (centre x,y radius r), only on diggable/air tiles; marks dirty */
export function stampDisc(w: World, x: number, y: number, r: number, v = 255) {
  const T = w.T; const r2 = (r + 0.35) * (r + 0.35);
  for (let yy = Math.floor(y - r - 1); yy <= y + r + 1; yy++) for (let xx = Math.floor(x - r - 1); xx <= x + r + 1; xx++) {
    if (!inB(T, xx, yy)) continue; const dx = xx + 0.5 - x, dy = yy + 0.5 - y; const d2 = dx * dx + dy * dy; const i = yy * T.W + xx;
    if (!diggable(T, i) && T.mat[i] !== Mat.Air) continue;
    if (d2 <= r2) { if (T.carve[i] < v) { T.carve[i] = v; w.dirtyTiles.add(i); } }
    else if (d2 <= (r + 1.2) * (r + 1.2) && v === 255) { if (T.carve[i] < 70 && T.mat[i] !== Mat.Air) { T.carve[i] = 70 + ((xx * 7 + yy * 13) % 40); w.dirtyTiles.add(i); } } // gnawed face
  }
}
/** refill (collapse) a disc: carve -> 0, add debris */
export function fillDisc(w: World, x: number, y: number, r: number) {
  const T = w.T;
  for (let yy = Math.floor(y - r); yy <= y + r; yy++) for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
    if (!inB(T, xx, yy)) continue; const i = yy * T.W + xx; if (T.mat[i] === Mat.Air || yy < T.surfaceY[xx]) continue;
    const dx = xx + 0.5 - x, dy = yy + 0.5 - y; if (dx * dx + dy * dy > r * r) continue;
    T.carve[i] = 0; T.debris[i] = 0; T.water[i] = 0; T.stab[i] = 90; w.dirtyTiles.add(i);
  }
}
