/** Navigation (Dijkstra over dug edges) and physical movement: acceleration, lanes, queueing, squeezing. Rats never leave dug tunnels. */
import { Anim, type NavEdge } from './contract';
import { SPEEDS, sampleEdge, type Pose } from './shared';
import { clamp, type Rat, type World } from './state';
import { isOpen, reach } from './burrow';

const he = (eid: number, rev: boolean) => (eid << 1) | (rev ? 1 : 0);
export const heEdge = (h: number) => h >> 1; export const heRev = (h: number) => (h & 1) === 1;

export interface Goal { edge: number; s: number }
/** cost multiplier for traversing an edge (exposure, water, crowding) */
function edgeCost(w: World, e: NavEdge, flee: boolean): number {
  let c = e.len;
  if (e.kind === 'surface') c *= flee ? 3 : 1.25;
  if (e.chamber >= 0) { const ch = w.chambers[e.chamber]; c *= 1 + ch.flooded * 6; }
  if (e.width < 2) c *= 1.3;
  return c;
}
/** shortest path from the rat's position to (goal.edge, goal.s). Returns false if unreachable. */
export function pathTo(w: World, r: Rat, g: Goal, flee = false): boolean {
  const ge = w.edges[g.edge]; if (!ge) return false;
  const [glo, ghi] = reach(ge); const gs = clamp(g.s, glo, ghi);
  const ce = w.edges[r.edge]; const [clo, chi] = reach(ce);
  // same edge, dug between
  if (r.edge === g.edge) { r.path = [he(r.edge, gs < r.s)]; r.pathI = 0; r.goalS = gs; return true; }
  const N = w.nodes.length; const dist = new Float64Array(N).fill(Infinity); const via = new Int32Array(N).fill(-1); const done = new Uint8Array(N);
  // seeds: ends of the current edge reachable from s
  if (clo <= 1e-3) { dist[ce.a] = r.s; via[ce.a] = he(ce.id, true); }
  if (chi >= ce.len - 1e-3) { const d = ce.len - r.s; if (d < dist[ce.b]) { dist[ce.b] = d; via[ce.b] = he(ce.id, false); } }
  // tiny binary heap of nodes
  const heap: number[] = []; const hk: number[] = [];
  const push = (n: number, k: number) => { heap.push(n); hk.push(k); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= hk[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hk[p], hk[i]] = [hk[i], hk[p]]; i = p; } };
  const pop = () => { const t = heap[0]; const ln = heap.pop()!, lk = hk.pop()!; if (heap.length) { heap[0] = ln; hk[0] = lk; let i = 0; for (;;) { const l = 2 * i + 1, rr = l + 1; let m = i; if (l < heap.length && hk[l] < hk[m]) m = l; if (rr < heap.length && hk[rr] < hk[m]) m = rr; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hk[m], hk[i]] = [hk[i], hk[m]]; i = m; } } return t; };
  for (const n of [ce.a, ce.b]) if (dist[n] < Infinity) push(n, dist[n]);
  let bestEnd = -1, bestCost = Infinity;
  while (heap.length) {
    const u = pop(); if (done[u]) continue; done[u] = 1; if (dist[u] >= bestCost) break;
    // can we finish from u onto the goal edge?
    if (u === ge.a && glo <= 1e-3) { const c = dist[u] + gs; if (c < bestCost) { bestCost = c; bestEnd = u; } }
    if (u === ge.b && ghi >= ge.len - 1e-3) { const c = dist[u] + (ge.len - gs); if (c < bestCost) { bestCost = c; bestEnd = u; } }
    for (const eid of w.adj[u]) {
      const e = w.edges[eid]; if (!isOpen(e) || eid === g.edge) continue; const v = e.a === u ? e.b : e.a;
      const nd = dist[u] + edgeCost(w, e, flee); if (nd < dist[v]) { dist[v] = nd; via[v] = he(eid, e.a !== u); push(v, nd); }
    }
  }
  if (bestEnd < 0) return false;
  const rev: number[] = [he(g.edge, bestEnd === ge.b)];
  let n = bestEnd; let guard = 0;
  while (guard++ < 10000) {
    const h = via[n]; if (h < 0) return false; const e = w.edges[heEdge(h)];
    rev.push(h); if (heEdge(h) === r.edge) break;
    n = heRev(h) ? e.b : e.a; // we arrived at n travelling along h; the start of h is the other node
  }
  r.path = rev.reverse(); r.pathI = 0; r.goalS = gs; return true;
}
/** nearest point on any open edge to (x,y) — for spawning */
export function nearestOnGraph(w: World, x: number, y: number, kinds?: NavEdge['kind'][]): Goal | null {
  let best: Goal | null = null, bd = Infinity; const p: Pose = { x: 0, y: 0, heading: 0 };
  for (const e of w.edges) { if (kinds && !kinds.includes(e.kind)) continue; const [lo, hi] = reach(e); if (hi - lo < 0.1) continue;
    for (let s = lo; s <= hi; s += 1) { sampleEdge(e, s, p); const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = { edge: e.id, s }; } } }
  return best;
}

const POSE: Pose = { x: 0, y: 0, heading: 0 };
/** desired cruise speed for the rat's current intent/body (tiles per tick) */
export function cruise(w: World, r: Rat): number {
  if (!r.alive) return 0;
  const k = r.intent.kind; const st = r.stageN;
  let v = SPEEDS.walk;
  if (k === 'flee' || k === 'evacuate' || k === 'hide') v = SPEEDS.flee; else if (k === 'fight' || k === 'murder') v = SPEEDS.run;
  else if (k === 'patrol' || k === 'herald') v = SPEEDS.trot; else if (k === 'play') v = SPEEDS.trot;
  if (r.carry) v = Math.min(v, SPEEDS.carry);
  v *= 0.75 + 0.5 * r.genes.speed;
  if (st === 0) v *= 0.35; else if (st === 1) v *= 0.85; else if (st === 3) v *= 0.7;
  if (r.injured > 0.3) v *= 0.6; if (r.health < 0.3) v *= 0.6; if (r.needs.energy > 0.85) v *= 0.75;
  if (r.rodentoid) v = SPEEDS.walk * 0.9;
  return v;
}

/** Advance every rat's body. Crowd rules apply on narrow edges: followers queue, opposing rats squeeze past. */
export function moveAll(w: World) {
  const buckets = new Map<number, Rat[]>();
  for (const r of w.rats) { if (!r.alive || r.edge < 0) continue; let b = buckets.get(r.edge); if (!b) buckets.set(r.edge, (b = [])); b.push(r); }
  for (const [eid, list] of buckets) {
    const e = w.edges[eid]; const lanes = Math.max(1, Math.floor(e.width / 1.4));
    if (list.length > 1) list.sort((a, b) => a.s - b.s);
    for (let i = 0; i < list.length; i++) {
      const r = list[i]; const lod = (r.flags & (1 << 21)) !== 0;
      if (lod && (w.tick + r.id) % 4 !== 0) continue;
      const dtk = lod ? 4 : 1;
      stepRat(w, r, e, list, i, lanes, dtk);
    }
  }
}
function stepRat(w: World, r: Rat, e: NavEdge, list: Rat[], i: number, lanes: number, dt: number) {
  const moving = r.path.length > 0 && r.pathI < r.path.length;
  let target = 0;
  if (moving) {
    const h = r.path[r.pathI]; const last = r.pathI === r.path.length - 1;
    if (heEdge(h) !== r.edge) { r.path = []; r.speed = 0; return; }
    r.dir = heRev(h) ? -1 : 1;
    const endS = last ? r.goalS : (r.dir > 0 ? e.len : 0);
    const remain = (endS - r.s) * r.dir;
    let vmax = cruise(w, r);
    if (last) vmax = Math.min(vmax, Math.max(0.15, remain * 0.6)); // ease in to the stop
    // crowd: nearest rat ahead in the travel direction
    const bodyLen = 5 * r.size; let squeeze = false; r.flags &= ~(1 << 22);
    for (let j = r.dir > 0 ? i + 1 : i - 1; j >= 0 && j < list.length; j += r.dir) {
      const o = list[j]; const gap = (o.s - r.s) * r.dir; if (gap > bodyLen * 1.6 + 2) break; if (o === r || !o.alive) continue;
      const oppose = o.path.length > o.pathI && o.dir !== r.dir && o.speed > 0.05;
      if (lanes >= 2 && Math.abs(o.lane - r.lane) > 0.9) continue; // different lane
      if (oppose) { squeeze = true; continue; }
      const need = 1.1 * bodyLen * 0.5 + 1.1 * 5 * o.size * 0.5;
      if (gap < need + 0.4) {
        if (lanes >= 2) { r.laneT = clamp(o.lane + (r.lane >= o.lane ? 1.2 : -1.2), -(e.width / 2 - 0.7), e.width / 2 - 0.7); }
        else { vmax = Math.min(vmax, Math.max(0, (gap - need) * 0.5 + (o.dir === r.dir ? o.speed : 0))); r.flags |= 1 << 22; }
      }
    }
    if (squeeze && lanes < 2) { vmax = Math.min(vmax, SPEEDS.squeeze); r.laneT = 0.5; } else if (lanes < 2) r.laneT = 0;
    target = vmax;
    // acceleration-limited speed change
    const acc = 0.25 * dt, dec = 0.5 * dt;
    r.speed = r.speed < target ? Math.min(target, r.speed + acc) : Math.max(target, r.speed - dec);
    let adv = r.speed * dt;
    if (adv >= remain) {
      adv = Math.max(0, remain);
      if (last) { r.s = endS; r.path = []; r.speed = 0; }
      else {
        // move onto the next edge, carrying the remainder
        r.dist += adv; const nh = r.path[++r.pathI]; const ne = w.edges[heEdge(nh)];
        r.edge = ne.id; r.s = heRev(nh) ? ne.len : 0; r.dir = heRev(nh) ? -1 : 1; adv = 0;
        const [lo, hi] = reach(ne); if (r.s < lo - 1e-3 || r.s > hi + 1e-3) { r.edge = e.id; r.s = r.dir > 0 ? e.len : 0; r.path = []; r.speed = 0; }
      }
    }
    if (r.edge === e.id) { r.s = clamp(r.s + adv * r.dir, 0, e.len); r.dist += adv; }
    // never stand in undug ground: clamp to the reachable interval
    const ed = w.edges[r.edge]; const [lo, hi] = reach(ed); if (r.s < lo) { r.s = lo; r.speed = 0; } if (r.s > hi) { r.s = hi; r.speed = 0; }
  } else { r.speed = Math.max(0, r.speed - 0.5 * dt); r.flags &= ~(1 << 22); }
  // lane smoothing
  const ed = w.edges[r.edge]; const maxLane = Math.max(0, ed.width / 2 - 0.6);
  r.lane += clamp(clamp(r.laneT, -maxLane, maxLane) - r.lane, -0.12 * dt, 0.12 * dt);
  sampleEdge(ed, r.s, POSE);
  const hd = r.dir > 0 ? POSE.heading : POSE.heading + Math.PI;
  const nx = -Math.sin(hd), ny = Math.cos(hd);
  r.x = POSE.x + nx * r.lane; r.y = POSE.y + ny * r.lane; r.heading = Math.atan2(Math.sin(hd), Math.cos(hd));
  const c = Math.cos(r.heading); if (Math.abs(c) > 0.2) r.facing = c > 0 ? 1 : -1;
  if (r.speed > 0.05 && r.path.length) {
    const climb = Math.abs(Math.sin(r.heading)) > 0.8;
    r.anim = r.flags & (1 << 22) ? Anim.Walk : climb ? Anim.Climb : (r.laneT === 0.5 && ed.width < 2.6 ? Anim.Squeeze : r.speed > 2 ? (r.intent.kind === 'flee' ? Anim.Flee : Anim.Run) : r.intent.kind === 'steal' ? Anim.Sneak : r.carry === 5 ? Anim.Haul : Anim.Walk);
    if (r.stageN === 0 && r.speed < 0.3) r.anim = Anim.Walk;
  }
}
export function setPose(w: World, r: Rat) { const e = w.edges[r.edge]; sampleEdge(e, r.s, POSE); r.x = POSE.x; r.y = POSE.y; r.heading = POSE.heading; }
export { Anim };
