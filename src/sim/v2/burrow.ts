/** Burrow graph: nodes, tunnels, chambers; the planner (site + route), per-tile gradual digging, spoil, collapse. */
import { Mat, type Chamber, type ChamberKind, type NavEdge, type NavNode } from './contract';
import { MATERIALS, densify, denseOf, sampleEdge } from './shared';
import { R, chance, clamp, emit, type World } from './state';
import { diggable, fillDisc, idx, inB, stampDisc } from './terrain';

// ── chamber archetypes (tiles; an adult rat is ~5 long, 1.5 tall) ──
export const KIND_SPEC: Record<ChamberKind, { rx: [number, number]; ry: [number, number]; depth: [number, number]; cap: number; label: string }> = {
  entrance: { rx: [3, 4], ry: [2, 2.5], depth: [6, 10], cap: 2, label: 'Mouth' },
  bolthole: { rx: [2, 2], ry: [1.5, 1.5], depth: [1, 3], cap: 1, label: 'Bolt-hole' },
  nest: { rx: [6, 8], ry: [3.5, 4.5], depth: [14, 50], cap: 10, label: 'Nest' },
  cache: { rx: [4, 5], ry: [2.5, 3], depth: [10, 40], cap: 2, label: 'Cache' },
  latrine: { rx: [3.5, 4.5], ry: [2.5, 3], depth: [12, 45], cap: 3, label: 'Latrine' },
  gallery: { rx: [9, 12], ry: [3.5, 4.5], depth: [20, 80], cap: 12, label: 'Gallery' },
  deadend: { rx: [2, 2.5], ry: [1.5, 2], depth: [12, 90], cap: 1, label: 'Dead end' },
  throne: { rx: [11, 13], ry: [5.5, 6.5], depth: [45, 95], cap: 14, label: 'Throne Hall' },
  granary: { rx: [9, 11], ry: [4.5, 5.5], depth: [25, 70], cap: 6, label: 'Granary' },
  nursery: { rx: [7, 8], ry: [3.5, 4], depth: [30, 80], cap: 10, label: 'Nursery' },
  plaza: { rx: [14, 17], ry: [5, 6], depth: [25, 70], cap: 40, label: 'Plaza' },
  shrine: { rx: [6, 7], ry: [4, 5], depth: [20, 90], cap: 10, label: 'Shrine' },
  barracks: { rx: [8, 10], ry: [3.5, 4.5], depth: [40, 95], cap: 12, label: 'Barracks' },
  midden: { rx: [5, 7], ry: [3, 4], depth: [8, 25], cap: 3, label: 'Midden' },
  infirmary: { rx: [7, 8], ry: [3.5, 4], depth: [25, 80], cap: 10, label: 'Infirmary' },
  market: { rx: [11, 14], ry: [4, 5], depth: [20, 70], cap: 24, label: 'Market' },
  workshop: { rx: [8, 10], ry: [3.5, 4.5], depth: [25, 90], cap: 12, label: 'Workshop' },
  slum: { rx: [9, 12], ry: [3, 4], depth: [10, 40], cap: 18, label: 'Slum' },
  jail: { rx: [6, 7], ry: [3, 3.5], depth: [50, 110], cap: 10, label: 'Jail' },
  temple: { rx: [9, 11], ry: [5, 6], depth: [25, 100], cap: 24, label: 'Temple' },
  lab: { rx: [7, 9], ry: [3.5, 4.5], depth: [30, 110], cap: 8, label: 'Lab' },
  council: { rx: [10, 12], ry: [4.5, 5.5], depth: [30, 90], cap: 20, label: 'Council Hall' },
  archive: { rx: [5, 6], ry: [3, 3.5], depth: [30, 110], cap: 4, label: 'Archive' },
  home: { rx: [4.5, 6.5], ry: [2.8, 3.6], depth: [14, 100], cap: 6, label: 'Home' },
};
const FLAVOUR = ['DEEP', 'DAMP', 'OLD', 'ROOT', 'CLAY', 'LOW', 'NORTH', 'SOUTH', 'WARM', 'STONE', 'DRIP', 'GRIT', 'PIPE', 'DARK', 'LONG', 'CROOKED', 'QUIET', 'HOLLOW'];

export function addNode(w: World, x: number, y: number, kind: NavNode['kind']): NavNode {
  const n: NavNode = { id: w.nodes.length, x, y, kind }; w.nodes.push(n); w.adj.push([]); w.newNodes.push(n.id); return n;
}
export function addEdge(w: World, a: number, b: number, kind: NavEdge['kind'], pts: [number, number][], width: number, chamber = -1, open = false): NavEdge {
  const len = densify(pts).len;
  const e: NavEdge = { id: w.edges.length, a, b, kind, pts, len, width, chamber, dug: open ? len : 0, from: a };
  w.edges.push(e); w.adj[a].push(e.id); w.adj[b].push(e.id); w.newEdges.push(e.id); w.navVer++;
  if (!open) w.digQueue.push(e.id);
  return e;
}
export const isOpen = (e: NavEdge) => e.dug >= e.len - 1e-3;
/** reachable s-interval of an edge (the dug part, measured from node a) */
export function reach(e: NavEdge): [number, number] { if (isOpen(e)) return [0, e.len]; return e.from === e.a ? [0, e.dug] : [e.len - e.dug, e.len]; }
export const frontierS = (e: NavEdge) => (e.from === e.a ? e.dug : e.len - e.dug);
export const nodeOpen = (w: World, n: number) => w.adj[n].some((eid) => { const e = w.edges[eid]; return isOpen(e) || e.from === n && e.dug > 0.5; }) || w.nodes[n].kind === 'surface' || w.nodes[n].kind === 'entrance';

// ── the surface walkway (open air along the ground line) ──
export function initSurface(w: World) {
  const T = w.T; const xs: number[] = []; for (let x = 4; x < T.W - 4; x += 30) xs.push(x); xs.push(T.W - 5);
  let prev = -1;
  for (const x of xs) {
    const n = addNode(w, x, T.surfaceY[x] - 0.6, 'surface'); w.surfNodes.push(n.id);
    if (prev >= 0) addSurfaceEdge(w, prev, n.id);
    prev = n.id;
  }
}
function addSurfaceEdge(w: World, a: number, b: number) {
  const T = w.T; const na = w.nodes[a], nb = w.nodes[b]; const pts: [number, number][] = [];
  const x0 = na.x, x1 = nb.x, n = Math.max(1, Math.round(Math.abs(x1 - x0) / 6));
  for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * (k / n); pts.push([x, k === 0 ? na.y : k === n ? nb.y : T.surfaceY[Math.floor(x)] - 0.6]); }
  return addEdge(w, a, b, 'surface', pts, 6, -1, true);
}
/** an entrance hole on the ground at column x; returns its node, connected to the surface walkway */
export function addEntrance(w: World, x: number): NavNode {
  const T = w.T; const n = addNode(w, x, T.surfaceY[x] - 0.6, 'entrance'); w.entrances.push(n.id);
  let L = -1, Rr = -1; for (const s of w.surfNodes) { const sx = w.nodes[s].x; if (sx <= x && (L < 0 || sx > w.nodes[L].x)) L = s; if (sx > x && (Rr < 0 || sx < w.nodes[Rr].x)) Rr = s; }
  if (L >= 0) addSurfaceEdge(w, L, n.id); if (Rr >= 0) addSurfaceEdge(w, n.id, Rr);
  return n;
}

// ── routing through soil (A* on tiles) ──
let clearCache: { ver: number; seed: number; d: Uint8Array } | null = null;
/** distance (tiles, capped) to the nearest undiggable solid tile */
function clearance(w: World): Uint8Array {
  if (clearCache && clearCache.seed === w.seed && clearCache.ver === (w.T as any).matVer) return clearCache.d;
  const T = w.T, N = T.W * T.H; const d = new Uint8Array(N).fill(255); const q: number[] = [];
  for (let i = 0; i < N; i++) { const m = T.mat[i]; if (m !== Mat.Air && !MATERIALS[m as Mat].diggable) { d[i] = 0; q.push(i); } }
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % T.W, y = (i / T.W) | 0; const nd = d[i] + 1; if (nd > 8) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (!inB(T, xx, yy)) continue; const j = yy * T.W + xx; if (d[j] > nd) { d[j] = nd; q.push(j); } } }
  clearCache = { ver: (w.T as any).matVer, seed: w.seed, d }; return d;
}
export function routeSoil(w: World, sx: number, sy: number, gx: number, gy: number, width: number): [number, number][] | null {
  const T = w.T; const clr = clearance(w); const need = Math.ceil(width / 2 + 1);
  const pad = 40; const x0 = Math.max(0, Math.floor(Math.min(sx, gx) - pad)), x1 = Math.min(T.W - 1, Math.ceil(Math.max(sx, gx) + pad));
  const y0 = Math.max(0, Math.floor(Math.min(sy, gy) - pad)), y1 = Math.min(T.H - 1, Math.ceil(Math.max(sy, gy) + pad));
  const BW = x1 - x0 + 1, BH = y1 - y0 + 1, N = BW * BH;
  const g = new Float32Array(N).fill(Infinity), par = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const L = (x: number, y: number) => (y - y0) * BW + (x - x0);
  const s = L(Math.floor(sx), Math.floor(sy)), t = L(Math.floor(gx), Math.floor(gy));
  const heap: number[] = [], hf: number[] = [];
  const push = (n: number, f: number) => { heap.push(n); hf.push(f); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hf[p], hf[i]] = [hf[i], hf[p]]; i = p; } };
  const pop = () => { const top = heap[0]; const ln = heap.pop()!, lf = hf.pop()!; if (heap.length) { heap[0] = ln; hf[0] = lf; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && hf[l] < hf[m]) m = l; if (r < heap.length && hf[r] < hf[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hf[m], hf[i]] = [hf[i], hf[m]]; i = m; } } return top; };
  g[s] = 0; push(s, 0); let found = false; let iter = 0;
  while (heap.length && iter++ < 60000) {
    const c = pop(); if (closed[c]) continue; closed[c] = 1; if (c === t) { found = true; break; }
    const cx = (c % BW) + x0, cy = ((c / BW) | 0) + y0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue; const xx = cx + dx, yy = cy + dy; if (xx < x0 || xx > x1 || yy < y0 || yy > y1) continue;
      const n = L(xx, yy); if (closed[n]) continue; const i = yy * T.W + xx;
      const nearEnds = Math.hypot(xx - sx, yy - sy) < 5 || Math.hypot(xx - gx, yy - gy) < 6;
      if (!nearEnds && (yy < T.surfaceY[xx] + 3 || clr[i] < need)) continue;
      if (T.mat[i] !== Mat.Air && !diggable(T, i)) continue;
      let cost = (dx && dy ? 1.414 : 1) * (1 + MATERIALS[T.mat[i] as Mat].hardness / 12 + T.moist[i] / 600);
      if (dy && !dx) cost *= 1.8; // prefer sloped tunnels to vertical shafts
      if (T.carve[i] > 0 && T.mat[i] !== Mat.Air && !nearEnds) cost += 25; // don't plough through other tunnels
      if (clr[i] < need + 2) cost += 1.5;
      const ng = g[c] + cost; if (ng < g[n]) { g[n] = ng; par[n] = c; push(n, ng + Math.hypot(xx - gx, yy - gy) * 1.05); }
    }
  }
  if (!found) return null;
  const raw: [number, number][] = []; for (let c = t; c >= 0; c = par[c]) raw.push([(c % BW) + x0 + 0.5, ((c / BW) | 0) + y0 + 0.5]);
  raw.reverse(); raw[0] = [sx, sy]; raw[raw.length - 1] = [gx, gy];
  return resample(rdp(raw, 1.3), 7);
}
function rdp(p: [number, number][], eps: number): [number, number][] {
  if (p.length < 3) return p; const [ax, ay] = p[0], [bx, by] = p[p.length - 1]; const L = Math.hypot(bx - ax, by - ay) || 1;
  let md = 0, mi = 0; for (let i = 1; i < p.length - 1; i++) { const d = Math.abs((bx - ax) * (ay - p[i][1]) - (ax - p[i][0]) * (by - ay)) / L; if (d > md) { md = d; mi = i; } }
  if (md < eps) return [p[0], p[p.length - 1]]; const l = rdp(p.slice(0, mi + 1), eps), r = rdp(p.slice(mi), eps); return [...l.slice(0, -1), ...r];
}
function resample(p: [number, number][], maxSeg: number): [number, number][] {
  const out: [number, number][] = [p[0]];
  for (let i = 1; i < p.length; i++) { const [x0, y0] = p[i - 1], [x1, y1] = p[i]; const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / maxSeg); for (let k = 1; k <= n; k++) out.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]); }
  return out;
}

// ── chamber geometry ──
export function inChamber(ch: Chamber, x: number, y: number) {
  const dx = (x - ch.cx) / ch.rx, dy = (y - ch.cy) / ch.ry; const a = Math.atan2(dy, dx);
  const wob = 1 + 0.1 * Math.sin(a * 3 + ch.seed) + 0.06 * Math.sin(a * 5 + ch.seed * 1.7);
  return dx * dx + dy * dy < wob * wob && y <= ch.floorY + 0.9;
}
function siteOk(w: World, kind: ChamberKind, cx: number, cy: number, rx: number, ry: number): boolean {
  const T = w.T; const clr = clearance(w);
  for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
    if (!inB(T, x, y)) return false; const i = y * T.W + x; if (y < T.surfaceY[x] + 4 && kind !== 'bolthole') return false;
    if (clr[i] < 2) return false; if (T.carve[i] > 0 && T.mat[i] !== Mat.Air) return false;
  }
  for (const c of w.chambers) if (Math.abs(c.cx - cx) < c.rx + rx + 6 && Math.abs(c.cy - cy) < c.ry + ry + 5) return false;
  return true;
}
function avgAround(w: World, cx: number, cy: number, rx: number, ry: number, f: (i: number) => number) {
  let s = 0, n = 0; for (let y = Math.floor(cy - ry); y <= cy + ry; y += 2) for (let x = Math.floor(cx - rx); x <= cx + rx; x += 2) { if (!inB(w.T, x, y)) continue; s += f(y * w.T.W + x); n++; } return n ? s / n : 0;
}

/** candidate anchor nodes to branch from: open chamber/junction nodes + live dig fronts' parents */
function anchors(w: World): number[] {
  const out: number[] = [];
  for (const n of w.nodes) { if (n.kind === 'surface') continue; if (n.kind === 'entrance' || nodeOpen(w, n.id)) out.push(n.id); }
  return out;
}

export interface PlanOpts { near?: { x: number; y: number }; from?: number; name?: string; owner?: number }
/** Plan a new chamber of `kind` and the tunnel(s) to it. Returns the chamber (progress 0) or null if no site/route. */
export function planChamber(w: World, kind: ChamberKind, o: PlanOpts = {}): Chamber | null {
  const T = w.T; const sp = KIND_SPEC[kind]; const anc = o.from != null ? [o.from] : anchors(w); if (!anc.length) return null;
  const rx = sp.rx[0] + R(w) * (sp.rx[1] - sp.rx[0]), ry = sp.ry[0] + R(w) * (sp.ry[1] - sp.ry[0]);
  let best: { x: number; y: number; sc: number; a: number } | null = null;
  const centre = o.near ?? (() => { let sx = 0, sy = 0, n = 0; for (const c of w.chambers) { sx += c.cx; sy += c.cy; n++; } return n ? { x: sx / n, y: sy / n } : { x: w.nodes[anc[0]].x, y: w.nodes[anc[0]].y + 20 }; })();
  for (let k = 0; k < 70; k++) {
    const x = clamp(centre.x + (R(w) - 0.5) * 140, rx + 4, T.W - rx - 4);
    const sy = T.surfaceY[Math.floor(x)]; const y = sy + sp.depth[0] + R(w) * (sp.depth[1] - sp.depth[0]);
    if (y + ry > T.H - 12) continue;
    if (!siteOk(w, kind, x, y, rx, ry)) continue;
    let a = -1, ad = Infinity; for (const n of anc) { const d = Math.hypot(w.nodes[n].x - x, w.nodes[n].y - y); if (d < ad) { ad = d; a = n; } }
    const coh = avgAround(w, x, y - ry, rx, 2, (i) => MATERIALS[T.mat[i] as Mat].cohesion);
    const mo = avgAround(w, x, y, rx, ry, (i) => T.moist[i] / 255);
    let sc = -ad * 0.6 + coh * 30 - Math.abs(x - centre.x) * 0.15 + R(w) * 8;
    if (kind === 'granary' || kind === 'cache' || kind === 'archive') sc -= mo * 60; // dry stores
    if (kind === 'latrine' || kind === 'midden') sc -= Math.max(0, 10 - ad) * 2; // a little away
    if (kind === 'nursery' || kind === 'throne') sc += (y - sy) * 0.15; // deep & safe
    if (ad > 70) sc -= 100;
    if (!best || sc > best.sc) best = { x, y, sc, a };
  }
  if (!best) return null;
  const { x: cx, y: cy, a } = best; const floorY = cy + ry * 0.55;
  const fx0 = cx - rx * 0.72, fx1 = cx + rx * 0.72;
  const A = w.nodes[a];
  const leftEntry = A.x < cx;
  // the access tunnel meets the chamber at the floor end nearest the anchor
  const ex = leftEntry ? fx0 : fx1;
  const route = routeSoil(w, A.x, A.y, ex, floorY, 2.2);
  const name = o.name ?? `${sp.label === 'Throne Hall' || sp.label === 'Plaza' || sp.label === 'Council Hall' ? 'the ' : ''}${FLAVOUR[Math.floor(R(w) * FLAVOUR.length)]} ${sp.label.toUpperCase()}`.replace(/^the /, 'THE ');
  if (!route || route.length < 2) return null;
  const nE = addNode(w, ex, floorY, 'chamber'), nO = addNode(w, leftEntry ? fx1 : fx0, floorY, 'chamber');
  // long access tunnels get a junction in the middle (future branches can start there)
  const width = kind === 'throne' || kind === 'plaza' || kind === 'market' ? 2.8 : 2.2;
  if (route.length >= 6) {
    const mid = Math.floor(route.length / 2); const j = addNode(w, route[mid][0], route[mid][1], 'junction');
    addEdge(w, a, j.id, 'tunnel', route.slice(0, mid + 1), width); addEdge(w, j.id, nE.id, 'tunnel', route.slice(mid), width);
  } else addEdge(w, a, nE.id, 'tunnel', route, width);
  const n = 4; const fpts: [number, number][] = [];
  for (let k = 0; k <= n; k++) { const t = k / n; const xx = leftEntry ? fx0 + (fx1 - fx0) * t : fx1 + (fx0 - fx1) * t; const dx = (xx - cx) / rx; fpts.push([xx, k === 0 || k === n ? floorY : floorY + 0.25 * (1 - dx * dx) - 0.12]); }
  const ch: Chamber = { id: w.chambers.length, kind, name, cx, cy, rx, ry, seed: Math.floor(R(w) * 1000), floorY, floorEdge: -1, entryNode: nE.id, progress: 0, stock: 0, owner: o.owner ?? 0, flooded: 0 };
  w.chambers.push(ch); w.newChambers.push(ch.id);
  const fe = addEdge(w, nE.id, nO.id, 'floor', fpts, Math.max(2.2, ry * 1.2), ch.id); ch.floorEdge = fe.id;
  emit(w, 'dig_start', `Rats begin to dig ${ch.name}.`, 0, { chamber: ch.id, x: cx, y: cy });
  return ch;
}
/** an exploratory tunnel from node `from` that ends blind (realistic dead end / escape pocket) */
export function planDeadEnd(w: World, from: number): boolean {
  const A = w.nodes[from]; const ang = Math.PI * (0.1 + 0.8 * R(w)); const L = 10 + R(w) * 16;
  const gx = clamp(A.x + Math.cos(ang) * L * (R(w) < 0.5 ? -1 : 1), 6, w.T.W - 6), gy = clamp(A.y + Math.sin(ang) * L * 0.6, w.T.surfaceY[Math.floor(A.x)] + 8, w.T.H - 14);
  const route = routeSoil(w, A.x, A.y, gx, gy, 2); if (!route || route.length < 2) return false;
  const n = addNode(w, gx, gy, 'deadend'); addEdge(w, from, n.id, 'tunnel', route, 2);
  return true;
}
/** a narrow escape tunnel from a chamber node up to the surface at a new hole */
export function planBolthole(w: World, from: number): Chamber | null {
  const T = w.T; const A = w.nodes[from];
  for (let k = 0; k < 12; k++) {
    const x = Math.floor(clamp(A.x + (R(w) - 0.5) * 70, 6, T.W - 7)); const i = idx(T, x, T.surfaceY[x] + 1); if (!diggable(T, i)) continue;
    if (w.entrances.some((e) => Math.abs(w.nodes[e].x - x) < 10)) continue;
    const route = routeSoil(w, A.x, A.y, x, T.surfaceY[x] - 0.6, 1.8); if (!route) continue;
    const top = addEntrance(w, x); const e = addEdge(w, from, top.id, 'tunnel', route, 1.8);
    const ch: Chamber = { id: w.chambers.length, kind: 'bolthole', name: 'A BOLT-HOLE', cx: x + 0.5, cy: T.surfaceY[x] + 1.5, rx: 2, ry: 1.5, seed: 1, floorY: T.surfaceY[x] + 2, floorEdge: e.id, entryNode: top.id, progress: 0, stock: 0, owner: 0, flooded: 0 };
    w.chambers.push(ch); w.newChambers.push(ch.id); return ch;
  }
  return null;
}

// ── digging ──
export function frontierTile(w: World, e: NavEdge): number {
  const s = e.from === e.a ? Math.min(e.len, e.dug + 0.8) : Math.max(0, e.len - e.dug - 0.8);
  const p = sampleEdge(e, s); return idx(w.T, p.x, p.y);
}
/** apply `labour` units of digging at the edge's frontier. Returns tiles advanced. */
export function digEdge(w: World, e: NavEdge, labour: number): number {
  if (isOpen(e)) return 0;
  const T = w.T; const ti = frontierTile(w, e); const m = T.mat[ti] as Mat;
  if (m !== Mat.Air && !MATERIALS[m].diggable) { // struck rock/pipe: this way is blocked — becomes a dead end
    blockEdge(w, e); return 0;
  }
  const ch = e.chamber >= 0 ? w.chambers[e.chamber] : null;
  const face = ch ? ch.ry * 1.3 : e.width; // area of the face per tile advance
  const hard = m === Mat.Air || T.carve[ti] >= 200 ? 0.5 : MATERIALS[m].hardness * (1 + T.moist[ti] / 512);
  const sp = w.spoil.get(e.id) ?? 0; const clog = sp > 25 ? 0.25 : 1;
  const adv = Math.min(e.len - e.dug, (labour * clog) / Math.max(0.5, hard * face * 0.45));
  const old = e.dug; e.dug += adv; w.dirtyEdges.add(e.id);
  w.spoil.set(e.id, sp + adv * face * (ch ? 0.5 : 0.8));
  carveEdge(w, e, old, e.dug);
  const fi = frontierTile(w, e); T.debris[fi] = Math.min(255, Math.round((w.spoil.get(e.id) ?? 0) * 8)); w.dirtyTiles.add(fi);
  if (isOpen(e)) {
    w.spoil.delete(e.id); const qi = w.digQueue.indexOf(e.id); if (qi >= 0) w.digQueue.splice(qi, 1); w.navVer++;
    if (ch) { ch.progress = 1; w.dirtyChambers.add(ch.id); emit(w, 'chamber_done', `${ch.name} is dug out.`, 1, { chamber: ch.id, x: ch.cx, y: ch.cy, sfx: 'dig_done' }); }
    else emit(w, 'dig_done', 'A tunnel breaks through.', 0, { x: e.pts[e.pts.length - 1][0], y: e.pts[e.pts.length - 1][1] });
  }
  return adv;
}
/** a tunnel that hit something undiggable: shorten it to what was dug and make the end a dead end */
function blockEdge(w: World, e: NavEdge) {
  const s = frontierS(e); const p = sampleEdge(e, s);
  const qi = w.digQueue.indexOf(e.id); if (qi >= 0) w.digQueue.splice(qi, 1);
  const far = e.from === e.a ? e.b : e.a;
  // truncate control points to the dug part
  const keep: [number, number][] = []; const d = denseOf(e); const L = e.dug;
  if (L < 1) { e.len = Math.max(0.01, e.len); e.dug = 0; (e as any).dead = true; w.dirtyEdges.add(e.id); return; }
  for (let k = 0; k <= 4; k++) { const q = sampleEdge(e, e.from === e.a ? (L * k) / 4 : e.len - (L * k) / 4); keep.push([q.x, q.y]); }
  void d;
  const dn = addNode(w, p.x, p.y, 'deadend');
  // retarget the edge to the new node
  w.adj[far] = w.adj[far].filter((x) => x !== e.id); w.adj[dn.id].push(e.id);
  if (e.from === e.a) { e.b = dn.id; e.pts = keep; } else { e.a = dn.id; e.pts = keep.reverse(); e.from = e.b; }
  e.len = densify(e.pts).len; e.dug = e.len; w.newEdges.push(e.id); w.navVer++;
  if (e.chamber >= 0) { const ch = w.chambers[e.chamber]; ch.progress = 1; ch.rx = Math.max(3, ch.rx * 0.6); w.dirtyChambers.add(ch.id); }
  emit(w, 'dig_done', 'Diggers strike stone. The tunnel ends blind.', 0, { x: p.x, y: p.y });
}
/** carve tiles for the dug interval [d0, d1] (measured from `from`) */
export function carveEdge(w: World, e: NavEdge, d0: number, d1: number) {
  const ch = e.chamber >= 0 ? w.chambers[e.chamber] : null; const r = e.width / 2;
  for (let d = Math.max(0, d0 - 0.5); d <= d1 + 1e-6; d += 0.5) {
    const s = e.from === e.a ? d : e.len - d; const p = sampleEdge(e, Math.min(e.len, Math.max(0, s)));
    if (!ch) { stampDisc(w, p.x, p.y, r); continue; }
    // chamber: excavate the full-height column above this floor point (organic ellipse)
    stampDisc(w, p.x, p.y, 1.1);
    for (let xx = Math.floor(p.x - 0.75); xx <= p.x + 0.75; xx++) for (let yy = Math.floor(ch.cy - ch.ry - 1); yy <= ch.floorY + 1; yy++) {
      if (!inB(w.T, xx, yy)) continue; if (!inChamber(ch, xx + 0.5, yy + 0.5)) continue; const i = yy * w.T.W + xx;
      if (diggable(w.T, i) && w.T.carve[i] < 255) { w.T.carve[i] = 255; w.dirtyTiles.add(i); }
    }
  }
  // chamber ends: carve the rounded walls beyond the floor walkway once complete
  if (ch && isOpen(e)) for (let yy = Math.floor(ch.cy - ch.ry - 1); yy <= ch.floorY + 1; yy++) for (let xx = Math.floor(ch.cx - ch.rx - 1); xx <= ch.cx + ch.rx + 1; xx++) {
    if (!inB(w.T, xx, yy) || !inChamber(ch, xx + 0.5, yy + 0.5)) continue; const i = yy * w.T.W + xx; if (diggable(w.T, i) && w.T.carve[i] < 255) { w.T.carve[i] = 255; w.dirtyTiles.add(i); }
  }
  if (ch) { ch.progress = e.dug / e.len; w.dirtyChambers.add(ch.id); }
}
/** re-stamp every dug edge whose bbox touches (x0..x1, y0..y1) — used after a collapse refills tiles */
export function restamp(w: World, x0: number, y0: number, x1: number, y1: number) {
  for (const e of w.edges) {
    if (e.kind === 'surface' || e.dug <= 0) continue; let hit = false;
    for (const [px, py] of e.pts) if (px > x0 - 14 && px < x1 + 14 && py > y0 - 8 && py < y1 + 8) { hit = true; break; }
    if (hit) carveEdge(w, e, 0, e.dug);
  }
}

/** Collapse: refill part of an edge or chamber. Rats under it are buried (killed) or thrown clear (injured). */
export function collapseEdge(w: World, e: NavEdge, sFrom: number, cause: string): { buried: number[]; hurt: number[] } {
  const buried: number[] = [], hurt: number[] = [];
  const keepFromDist = e.from === e.a ? sFrom : e.len - sFrom; // distance from `from` that survives
  const keep = clamp(keepFromDist, 0, e.dug);
  if (e.kind === 'surface' || keep >= e.dug - 0.3) return { buried, hurt };
  const lo = e.from === e.a ? keep : e.len - e.dug, hi = e.from === e.a ? e.dug : e.len - keep;
  for (let s = lo; s <= hi; s += 0.6) { const p = sampleEdge(e, s); fillDisc(w, p.x, p.y, e.chamber >= 0 ? Math.max(e.width, w.chambers[e.chamber].ry) + 1 : e.width / 2 + 0.6); }
  if (e.chamber >= 0) { const ch = w.chambers[e.chamber]; for (let yy = Math.floor(ch.cy - ch.ry - 1); yy <= ch.floorY + 1; yy++) for (let xx = Math.floor(ch.cx - ch.rx - 1); xx <= ch.cx + ch.rx + 1; xx++) {
    if (!inB(w.T, xx, yy) || !inChamber(ch, xx + 0.5, yy + 0.5)) continue; const fx = clamp((xx - ch.cx) / ch.rx, -1, 1);
    const p0 = sampleEdge(e, lo), p1 = sampleEdge(e, hi); if (xx + 0.5 >= Math.min(p0.x, p1.x) - 1 && xx + 0.5 <= Math.max(p0.x, p1.x) + 1) { const i = yy * w.T.W + xx; w.T.carve[i] = 0; w.dirtyTiles.add(i); } void fx;
  } ch.progress = keep / e.len; w.dirtyChambers.add(ch.id); }
  const old = e.dug; e.dug = keep; w.dirtyEdges.add(e.id); if (!w.digQueue.includes(e.id)) w.digQueue.unshift(e.id); w.navVer++;
  w.spoil.set(e.id, (w.spoil.get(e.id) ?? 0) + (old - keep) * 2);
  // rats in the refilled interval
  for (const r of w.rats) {
    if (r.edge !== e.id || r.s < lo - 0.2 || r.s > hi + 0.2) continue;
    if (chance(w, 0.45 + (w.tick - r.born < 8 * 960 ? 0.3 : 0))) buried.push(r.id);
    else { r.s = e.from === e.a ? Math.max(0, keep - 0.6) : Math.min(e.len, e.len - keep + 0.6); if (keep < 0.6) { r.s = e.from === e.a ? 0 : e.len; } r.injured = Math.max(r.injured, 0.6); hurt.push(r.id); }
  }
  const pts = [sampleEdge(e, lo), sampleEdge(e, hi)];
  restamp(w, Math.min(pts[0].x, pts[1].x), Math.min(pts[0].y, pts[1].y), Math.max(pts[0].x, pts[1].x), Math.max(pts[0].y, pts[1].y));
  // a refilled stretch: if rats were left beyond it with no way out, they are trapped but alive at the far node
  void cause;
  return { buried, hurt };
}
