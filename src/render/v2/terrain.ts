// Destructible pixel terrain: a soil cross-section painted per world pixel from the sim's tile grid (carve, water, moisture,
// debris, stability) — organic, noise-jittered boundaries (never the tile grid), strata, rocks, roots, pipes, worn floors,
// dark ceilings, AO on the tunnel back wall, crumbling dig faces, cracks, spoil heaps and standing water.
// Chunks of CH×CH px are painted lazily when first seen and repainted locally on terrain deltas.
// A coarse overview texture (2 texels per tile) stands in at far zoom (LOD).
import { Container, Sprite, Texture } from 'pixi.js';
import { Mat, PASSABLE, type TerrainInit, type TerrainDelta } from '../../sim/v2/contract';
import { PX } from './units';

const CH = 256;
const hex = (h: number) => [(h >> 16) & 255, (h >> 8) & 255, h & 255] as const;
// palette ramps (dark → light), all from style_ref/palette.hex
const RAMP: Record<number, number[]> = {
  [Mat.Topsoil]: [0x30161b, 0x441f28, 0x572932, 0x70473f],
  [Mat.Loam]: [0x1e2228, 0x38302d, 0x4d3d3d, 0x70473f],
  [Mat.Clay]: [0x441f28, 0x572932, 0x864f4d, 0x9c6e4e],
  [Mat.Gravel]: [0x222c32, 0x373f41, 0x475052, 0x505b5c],
  [Mat.Roots]: [0x30161b, 0x441f28, 0x70473f, 0x9c6e4e],
  [Mat.Rock]: [0x1e2228, 0x373f41, 0x475052, 0x796765],
  [Mat.Pipe]: [0x14151a, 0x23434c, 0x3b666f, 0x4b7e89],
  [Mat.Concrete]: [0x373f41, 0x40494b, 0x505b5c, 0x796765],
  [Mat.Bedrock]: [0x080d0a, 0x14151a, 0x1e2228, 0x222c32],
  [Mat.Air]: [0, 0, 0, 0],
};
const RAMPC: Record<number, (readonly [number, number, number])[]> = {};
for (const k in RAMP) RAMPC[k] = RAMP[k].map(hex);
const BACK = [0x080d0a, 0x14151a, 0x1e2228, 0x2a2126].map(hex);
const DIRT = [0x38302d, 0x4d3d3d, 0x70473f, 0x9c6e4e].map(hex);
const INK = hex(0x080d0a);
const WATER = hex(0x23434c), WATER_HI = hex(0x489da2), WATER_TOP = hex(0x42c3ca);

// deterministic tileable value-noise tables
function noiseTable(seed: number, cell: number): Float32Array {
  const N = 256, g = N / cell; const grid = new Float32Array(g * g); let s = seed;
  for (let i = 0; i < grid.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; grid[i] = s / 0x7fffffff - 0.5; }
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const G = (a: number, b: number) => grid[((b + g) % g) * g + ((a + g) % g)];
    const a = G(x0, y0) + (G(x0 + 1, y0) - G(x0, y0)) * sx, b = G(x0, y0 + 1) + (G(x0 + 1, y0 + 1) - G(x0, y0 + 1)) * sx;
    out[y * N + x] = a + (b - a) * sy;
  }
  return out;
}
const N8 = noiseTable(11, 8), N16 = noiseTable(23, 16), N4 = noiseTable(51, 4);
const nz = (t: Float32Array, x: number, y: number) => t[((y & 255) << 8) | (x & 255)];
const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export class Terrain {
  T!: TerrainInit; W = 0; H = 0; pxW = 0; pxH = 0;
  readonly root = new Container({ label: 'terrain' });
  readonly overview = new Sprite();
  private chunks = new Map<number, { spr: Sprite; cv: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: Texture }>();
  private dirty = new Map<number, [number, number, number, number]>(); // chunk key → dirty rect in chunk px
  private ov!: { cv: HTMLCanvasElement; g: CanvasRenderingContext2D; img: ImageData; tex: Texture };
  private ovDirty = false;
  private pipeSeg: { ax: number; ay: number; bx: number; by: number; r: number }[] = [];
  private rootSeg: { ax: number; ay: number; bx: number; by: number; r: number }[] = [];
  /** fresh carve events (world px) for dust/dirt particles */
  carveFx: { x: number; y: number; amt: number }[] = [];
  init(T: TerrainInit) {
    this.T = T; this.W = T.W; this.H = T.H; this.pxW = T.W * PX; this.pxH = T.H * PX;
    for (const c of this.chunks.values()) { c.spr.destroy(); c.tex.destroy(true); } this.chunks.clear(); this.root.removeChildren();
    this.pipeSeg = T.pipes.map((p) => ({ ax: p.x0 * PX, ay: p.y0 * PX, bx: p.x1 * PX, by: p.y1 * PX, r: p.r * PX }));
    this.rootSeg = []; for (const r of T.roots) for (let i = 0; i < r.pts.length - 1; i++) this.rootSeg.push({ ax: r.pts[i][0] * PX, ay: r.pts[i][1] * PX, bx: r.pts[i + 1][0] * PX, by: r.pts[i + 1][1] * PX, r: Math.max(1.2, r.r * PX * 0.35 * (1 - i / r.pts.length)) });
    // overview LOD: 2 texels per tile
    const ow = T.W * 2, oh = T.H * 2; const cv = document.createElement('canvas'); cv.width = ow; cv.height = oh;
    const g = cv.getContext('2d', { willReadFrequently: true })!; const img = g.createImageData(ow, oh);
    this.ov = { cv, g, img, tex: Texture.from(cv) }; this.ov.tex.source.scaleMode = 'linear';
    this.paintOverview(0, 0, ow, oh); g.putImageData(img, 0, 0); this.ov.tex.source.update();
    this.overview.texture = this.ov.tex; this.overview.scale.set(PX / 2); this.overview.visible = false;
  }
  // ───────────── field sampling ─────────────
  private tile(arr: Uint8Array, tx: number, ty: number) { if (tx < 0) tx = 0; else if (tx >= this.W) tx = this.W - 1; if (ty < 0) ty = 0; else if (ty >= this.H) ty = this.H - 1; return arr[ty * this.W + tx]; }
  /** bilinear sample of a tile field at world px (tile centres at (i+.5)*PX) → 0..255 */
  private bil(arr: Uint8Array, wx: number, wy: number) {
    const tx = wx / PX - 0.5, ty = wy / PX - 0.5; const i = Math.floor(tx), j = Math.floor(ty); const fx = tx - i, fy = ty - j;
    const a = this.tile(arr, i, j), b = this.tile(arr, i + 1, j), c = this.tile(arr, i, j + 1), d = this.tile(arr, i + 1, j + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
  private matAt(wx: number, wy: number) { // noise-jittered so material borders are organic
    const jx = nz(N16, wx, wy) * 9, jy = nz(N16, wy + 97, wx + 13) * 9;
    return this.tile(this.T.mat, Math.floor((wx + jx) / PX), Math.floor((wy + jy) / PX));
  }
  /** carve field incl. edge noise → >0.5 means open */
  private openness(wx: number, wy: number) {
    const c = this.bil(this.T.carve, wx, wy) / 255; const n = nz(N8, wx, wy) * 0.65 + nz(N4, wx, wy) * 0.35;
    return c + n * 0.34;
  }
  isOpenPx(wx: number, wy: number): boolean {
    const m = this.tile(this.T.mat, Math.floor(wx / PX), Math.floor(wy / PX)); if (m === Mat.Air) return true;
    return this.openness(wx, wy) > 0.5;
  }
  /** first solid pixel at or below (wx,wy), searching down at most maxPx; returns wy if solid, or wy+maxPx if none */
  floorBelow(wx: number, wy: number, maxPx = 40) { let y = Math.floor(wy); for (let k = 0; k < maxPx; k++, y++) if (!this.isOpenPx(wx, y)) return y; return Math.floor(wy) + maxPx; }
  ceilAbove(wx: number, wy: number, maxPx = 40) { let y = Math.floor(wy); for (let k = 0; k < maxPx; k++, y--) if (!this.isOpenPx(wx, y)) return y; return Math.floor(wy) - maxPx; }
  // ───────────── painting ─────────────
  private paintRegion(x0: number, y0: number, w: number, h: number, out: Uint8ClampedArray, ow: number, ox: number, oy: number) {
    const T = this.T; const B = 2, DB = 16; // border for lips, extra rows below for floor distance
    const ew = w + B * 2, eh = h + B + DB + B;
    const open = new Uint8Array(ew * eh); const mats = new Uint8Array(ew * eh); const oval = new Float32Array(ew * eh);
    for (let y = 0; y < eh; y++) { const wy = y0 - B + y; for (let x = 0; x < ew; x++) {
      const wx = x0 - B + x; const k = y * ew + x;
      if (wy < 0) { open[k] = 2; mats[k] = Mat.Air; continue; }
      const m = this.matAt(wx, wy); mats[k] = m;
      if (m === Mat.Air) { open[k] = 2; continue; }
      const o = this.openness(wx, wy); oval[k] = o; open[k] = o > 0.5 && m !== Mat.Rock && m !== Mat.Pipe && m !== Mat.Concrete && m !== Mat.Bedrock ? 1 : 0;
    } }
    // floor distance (px to first solid below) for open pixels
    const fd = new Uint8Array(ew * eh);
    for (let x = 0; x < ew; x++) { let d = 255; for (let y = eh - 1; y >= 0; y--) { const k = y * ew + x; if (open[k] !== 1) d = 0; else d = Math.min(255, d + 1); fd[k] = d; } }
    for (let y = 0; y < h; y++) {
      const wy = y0 + y; const ey = y + B;
      for (let x = 0; x < w; x++) {
        const wx = x0 + x; const ex = x + B; const k = ey * ew + ex; const o = open[k];
        const p = ((oy + y) * ow + (ox + x)) * 4;
        if (o === 2) {
          const col = Math.max(0, Math.min(T.W - 1, Math.floor(wx / PX)));
          const sy = T.surfaceY[col] * PX;
          const above = sy - wy;
          if (above > 0 && above < 22) {
            const tx = Math.floor(wx / 4);
            const cob = hash(tx, 2) > 0.45 ? 0x2c3338 : 0x1a2024;
            const c = hex(above < 3 ? 0x3a4448 : cob);
            out[p] = c[0]; out[p + 1] = c[1]; out[p + 2] = c[2]; out[p + 3] = above < 3 ? 255 : 210;
          } else out[p + 3] = 0;
          continue;
        }
        const moist = this.bil(T.moist, wx, wy) / 255; let r = 0, g = 0, b = 0;
        if (o === 1) {
          // tunnel back wall, AO toward walls, a darker ceiling band, scratch marks
          const ov = oval[k]; const ao = Math.min(1, Math.max(0, (ov - 0.5) * 2.6));
          const up1 = open[k - ew] !== 1, up2 = open[k - 2 * ew] !== 1 || up1;
          let li = ao < 0.25 ? 0 : ao < 0.6 ? 1 : 2; if (nz(N4, wx, wy) > 0.32 && li > 0) li--;
          if (up1) li = 0; else if (up2 && li > 1) li = 1;
          if (li >= 1 && hash(wx >> 1, wy) > 0.985) li = 3;
          const c = BACK[li]; r = c[0]; g = c[1]; b = c[2];
          // spoil heaps on the floor
          const deb = this.bil(T.debris, wx, wy) / 255; const f = fd[k];
          if (deb > 0.04 && f <= 1 + deb * 13 * (0.75 + nz(N8, wx, 3) * 0.6)) { const dc = DIRT[Math.min(3, Math.max(0, Math.floor((nz(N4, wx, wy) + 0.5) * 3.2 + (f <= 1 ? 0 : 0))))]; r = dc[0]; g = dc[1]; b = dc[2]; if (open[k - ew] === 1 && fd[k - ew] > f + 0) { r = DIRT[3][0]; g = DIRT[3][1]; b = DIRT[3][2]; } }
          // standing water (flat-topped per tile)
          const wl = this.tile(T.water, Math.floor(wx / PX), Math.floor(wy / PX)) / 255;
          if (wl > 0.02) { const ly = (wy % PX) / PX; const top = 1 - wl;
            if (ly >= top) { const sur = ly - top < 1.5 / PX && open[k - ew] === 1 && (this.tile(T.water, Math.floor(wx / PX), Math.floor((wy - PX) / PX)) < 8);
              const c2 = sur ? (hash(wx, 7) > 0.5 ? WATER_TOP : WATER_HI) : WATER; const a = sur ? 0.9 : 0.62; r = r * (1 - a) + c2[0] * a; g = g * (1 - a) + c2[1] * a; b = b * (1 - a) + c2[2] * a; } }
        } else {
          const m = mats[k]; const R = RAMPC[m] ?? RAMPC[Mat.Loam];
          const tx = Math.floor(wx / PX), ty = Math.floor(wy / PX);
          const cell = hash(tx, ty);
          // one value per tile, like a placed block, plus a little grain — not a sine-wave stripe
          let v = 1.15 + (cell - 0.5) * 1.7 + nz(N8, wx, wy) * 0.35;
          const col = Math.max(0, Math.min(T.W - 1, tx));
          const depth = ty - T.surfaceY[col];
          if (depth >= 0 && depth < 2 && m !== Mat.Concrete && m !== Mat.Pipe) {
            const grass = hex(cell > 0.55 ? 0x6d8f4a : 0x3f5c32);
            r = grass[0]; g = grass[1]; b = grass[2]; v = -9;
          }
          if (m === Mat.Pipe) { // shade across the pipe axis
            let best = 1e9, sh = 0; for (const s of this.pipeSeg) { const dx = s.bx - s.ax, dy = s.by - s.ay, L2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((wx - s.ax) * dx + (wy - s.ay) * dy) / L2)); const px = s.ax + dx * t, py = s.ay + dy * t; const d = Math.hypot(wx - px, wy - py); if (d < best) { best = d; const nxp = -dy / Math.sqrt(L2), nyp = dx / Math.sqrt(L2); sh = ((wx - px) * nxp + (wy - py) * nyp) / s.r; } }
            v = 1.6 - sh * 1.6; if (hash(wx >> 2, wy >> 2) > 0.93) { const rc = hex(0x864f4d); r = rc[0]; g = rc[1]; b = rc[2]; v = -9; }
          } else if (m === Mat.Concrete) v = 1.5 + nz(N4, wx, wy) * 0.9 + ((wx % 40 === 0 || wy % 24 === 0) ? -1.2 : 0);
          else if (m === Mat.Rock) v = 1.3 + nz(N8, wx * 2, wy * 2) * 1.8 + (mats[k - ew] !== m ? 1.2 : 0) + (mats[k + ew] !== m ? -0.8 : 0);
          if (v !== -9) { const d = (hash(wx, wy) - 0.5) * 0.7; const li = Math.max(0, Math.min(3, Math.round(v + d))); const c = R[li]; r = c[0]; g = c[1]; b = c[2]; }
          // pebbles & specks in soft soils
          if ((m === Mat.Loam || m === Mat.Clay || m === Mat.Topsoil) && hash(wx >> 1, wy >> 1) > 0.992) { const c = hex(0x907d78); r = c[0]; g = c[1]; b = c[2]; }
          // roots (overlay inside soil)
          if (m !== Mat.Pipe && m !== Mat.Concrete) for (const s of this.rootSeg) { if (wx < Math.min(s.ax, s.bx) - 6 || wx > Math.max(s.ax, s.bx) + 6 || wy < Math.min(s.ay, s.by) - 6 || wy > Math.max(s.ay, s.by) + 6) continue;
            const dx = s.bx - s.ax, dy = s.by - s.ay, L2 = dx * dx + dy * dy || 1; const t = Math.max(0, Math.min(1, ((wx - s.ax) * dx + (wy - s.ay) * dy) / L2)); const d = Math.hypot(wx - s.ax - dx * t, wy - s.ay - dy * t) + nz(N4, wx, wy) * 1.5;
            if (d < s.r) { const c = RAMPC[Mat.Roots][d < s.r * 0.4 ? 3 : d < s.r * 0.8 ? 2 : 0]; r = c[0]; g = c[1]; b = c[2]; } }
          // crumbling, half-gnawed dig face
          const ovv = oval[k]; if (ovv > 0.3 && ovv <= 0.5 && hash(wx, wy) > 0.55) { const c = R[0]; r = c[0]; g = c[1]; b = c[2]; }
          // lips: worn lit floor under open space, inked ceiling and walls
          const above = open[k - ew] === 1, below = open[k + ew] === 1, left = open[k - 1] === 1, right = open[k + 1] === 1;
          if (above) { const c = R[3]; r = (c[0] * 3 + 255) / 4 * 0.85; g = (c[1] * 3 + 230) / 4 * 0.85; b = (c[2] * 3 + 200) / 4 * 0.85; }
          else if (open[k - 2 * ew] === 1) { const c = R[3]; r = c[0]; g = c[1]; b = c[2]; }
          else if (below || left || right) { r = INK[0]; g = INK[1]; b = INK[2]; }
          // cracks where the ground is unstable
          const st = this.bil(T.stab, wx, wy); if (st < 70) { const q = Math.abs(nz(N16, wx * 2, wy * 2)) + Math.abs(nz(N8, wx + 50, wy)) * 0.3; if (q < 0.035 * (1 - st / 70) + 0.006) { r = INK[0]; g = INK[1]; b = INK[2]; } }
          // grass-less street crust right under the open air
          if (open[k - ew] === 2) { const c = hex(0x505b5c); r = c[0]; g = c[1]; b = c[2]; } else if (open[k - 2 * ew] === 2 || open[k - 3 * ew] === 2) { const c = hex(0x373f41); r = c[0]; g = c[1]; b = c[2]; }
        }
        if (moist > 0.25) { const f = 1 - (moist - 0.25) * 0.35; r *= f; g *= f; b *= f * 1.04; }
        out[p] = r; out[p + 1] = g; out[p + 2] = b; out[p + 3] = 255;
      }
    }
  }
  private paintOverview(tx0: number, ty0: number, tw: number, th: number) {
    const T = this.T; const img = this.ov.img; const ow = T.W * 2; const s = PX / 2;
    for (let y = ty0; y < ty0 + th; y++) for (let x = tx0; x < tx0 + tw; x++) {
      const wx = x * s + s / 2, wy = y * s + s / 2; const p = (y * ow + x) * 4; const m = this.tile(T.mat, Math.floor(wx / PX), Math.floor(wy / PX));
      if (m === Mat.Air) {
        const col = Math.max(0, Math.min(T.W - 1, Math.floor(wx / PX)));
        const above = T.surfaceY[col] * PX - wy;
        if (above > 0 && above < 22) { const c = hex(above < 6 ? 0x3a4448 : hash(x, 2) > 0.45 ? 0x2c3338 : 0x1a2024); img.data[p] = c[0]; img.data[p + 1] = c[1]; img.data[p + 2] = c[2]; img.data[p + 3] = 230; }
        else img.data[p + 3] = 0;
        continue;
      }
      let c: readonly [number, number, number];
      if (this.openness(wx, wy) > 0.5 && m !== Mat.Rock && m !== Mat.Pipe && m !== Mat.Concrete) { const wl = this.tile(T.water, Math.floor(wx / PX), Math.floor(wy / PX)); c = wl > 60 ? WATER : BACK[1]; }
      else {
        const tx = Math.floor(wx / PX), ty = Math.floor(wy / PX);
        const col = Math.max(0, Math.min(T.W - 1, tx));
        const depth = ty - T.surfaceY[col];
        if (depth >= 0 && depth < 2 && m !== Mat.Concrete && m !== Mat.Pipe) c = hex(hash(tx, ty) > 0.55 ? 0x6d8f4a : 0x3f5c32);
        else { const R = RAMPC[m] ?? RAMPC[Mat.Loam]; c = R[(hash(tx, ty) * 4) | 0]; }
      }
      const moist = this.tile(T.moist, Math.floor(wx / PX), Math.floor(wy / PX)) / 255; const f = moist > 0.25 ? 1 - (moist - 0.25) * 0.35 : 1;
      img.data[p] = c[0] * f; img.data[p + 1] = c[1] * f; img.data[p + 2] = c[2] * f; img.data[p + 3] = 255;
    }
  }
  private chunk(cx: number, cy: number) {
    const key = cy * 4096 + cx; let c = this.chunks.get(key); if (c) return c;
    const cv = document.createElement('canvas'); cv.width = CH; cv.height = CH; const g = cv.getContext('2d', { willReadFrequently: true })!;
    const img = g.createImageData(CH, CH); this.paintRegion(cx * CH, cy * CH, CH, CH, img.data, CH, 0, 0); g.putImageData(img, 0, 0);
    const tex = Texture.from(cv); tex.source.scaleMode = 'nearest';
    const spr = new Sprite(tex); spr.position.set(cx * CH, cy * CH); spr.roundPixels = true; this.root.addChild(spr);
    c = { spr, cv, g, tex }; this.chunks.set(key, c); return c;
  }
  /** apply a sim delta: update fields, queue local repaints, collect dig particles */
  applyDelta(d: TerrainDelta) {
    const T = this.T;
    for (let n = 0; n < d.idx.length; n++) {
      const i = d.idx[n]; const before = T.carve[i];
      T.carve[i] = d.carve[n]; T.water[i] = d.water[n]; T.debris[i] = d.debris[n]; T.stab[i] = d.stab[n]; T.moist[i] = d.moist[n];
      const tx = i % T.W, ty = (i / T.W) | 0;
      if (d.carve[n] > before) this.carveFx.push({ x: (tx + 0.5) * PX, y: (ty + 0.5) * PX, amt: (d.carve[n] - before) / 255 });
      else if (d.carve[n] < before && before >= PASSABLE) this.carveFx.push({ x: (tx + 0.5) * PX, y: (ty + 0.5) * PX, amt: -1 });
      // dirty px rect around the tile (bilinear + jitter reach ≈ 1.5 tiles)
      const x0 = (tx - 2) * PX, y0 = (ty - 2) * PX, x1 = (tx + 3) * PX, y1 = (ty + 3) * PX + 16;
      for (let cy = Math.floor(y0 / CH); cy <= Math.floor(y1 / CH); cy++) for (let cx = Math.floor(x0 / CH); cx <= Math.floor(x1 / CH); cx++) {
        const key = cy * 4096 + cx; if (!this.chunks.has(key)) continue;
        const rx0 = Math.max(0, x0 - cx * CH), ry0 = Math.max(0, y0 - cy * CH), rx1 = Math.min(CH, x1 - cx * CH), ry1 = Math.min(CH, y1 - cy * CH);
        if (rx1 <= rx0 || ry1 <= ry0) continue; const r = this.dirty.get(key);
        this.dirty.set(key, r ? [Math.min(r[0], rx0), Math.min(r[1], ry0), Math.max(r[2], rx1), Math.max(r[3], ry1)] : [rx0, ry0, rx1, ry1]);
      }
      const ox0 = Math.max(0, (tx - 2) * 2), oy0 = Math.max(0, (ty - 2) * 2); this.paintOverview(ox0, oy0, Math.min(T.W * 2 - ox0, 10), Math.min(T.H * 2 - oy0, 10)); this.ovDirty = true;
    }
  }
  /** per-frame: make visible chunks exist, flush dirty repaints (time-boxed), toggle LOD */
  update(view: { x0: number; y0: number; x1: number; y1: number }, lod: boolean, budgetMs = 6) {
    const t0 = performance.now();
    this.overview.visible = lod; this.root.visible = !lod;
    if (this.ovDirty) { this.ov.g.putImageData(this.ov.img, 0, 0); this.ov.tex.source.update(); this.ovDirty = false; }
    if (lod) return;
    const cx0 = Math.max(0, Math.floor(view.x0 / CH)), cy0 = Math.max(0, Math.floor(view.y0 / CH)), cx1 = Math.min(Math.ceil(this.pxW / CH) - 1, Math.floor(view.x1 / CH)), cy1 = Math.min(Math.ceil(this.pxH / CH) - 1, Math.floor(view.y1 / CH));
    for (const [key, c] of this.chunks) { const cx = key % 4096, cy = Math.floor(key / 4096); c.spr.visible = cx >= cx0 - 1 && cx <= cx1 + 1 && cy >= cy0 - 1 && cy <= cy1 + 1; }
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { if (!this.chunks.has(cy * 4096 + cx)) { this.chunk(cx, cy); if (performance.now() - t0 > budgetMs * 3) return; } }
    for (const [key, r] of this.dirty) {
      const c = this.chunks.get(key)!; const cx = key % 4096, cy = Math.floor(key / 4096); const w = r[2] - r[0], h = r[3] - r[1];
      const img = c.g.createImageData(w, h); this.paintRegion(cx * CH + r[0], cy * CH + r[1], w, h, img.data, w, 0, 0); c.g.putImageData(img, r[0], r[1]); c.tex.source.update();
      this.dirty.delete(key); if (performance.now() - t0 > budgetMs) break;
    }
  }
  /** pre-paint every chunk (used by verification and to avoid pop-in on slow phones when idle) */
  paintAll() { for (let cy = 0; cy < Math.ceil(this.pxH / CH); cy++) for (let cx = 0; cx < Math.ceil(this.pxW / CH); cx++) this.chunk(cx, cy); }
}
