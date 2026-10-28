/** Chamber lookup & planning on demand */
import type { Chamber, ChamberKind } from './contract';
import { R, day, type Rat, type World } from './state';
import { planChamber, planBolthole, planDeadEnd, isOpen } from './burrow';
import { reach } from './burrow';
import { has } from './tech';

export const open = (c: Chamber) => c.progress >= 0.999;
export function chambersOf(w: World, kind: ChamberKind, openOnly = true) { return w.chambers.filter((c) => c.kind === kind && (!openOnly || open(c))); }
export function anyChamber(w: World, kind: ChamberKind) { return w.chambers.find((c) => c.kind === kind && open(c)) ?? null; }
/** nearest usable chamber of a kind (open, or with enough dug floor to stand on) */
export function nearestChamber(w: World, r: Rat, kinds: ChamberKind[]): Chamber | null {
  let best: Chamber | null = null, bd = Infinity;
  for (const c of w.chambers) { if (!kinds.includes(c.kind)) continue; const e = w.edges[c.floorEdge]; const [lo, hi] = reach(e); if (hi - lo < 2) continue;
    const d = Math.abs(c.cx - r.x) + Math.abs(c.cy - r.y) * 1.3; if (d < bd) { bd = d; best = c; } }
  return best;
}
/** a standing spot on a chamber's floor (s along its floor edge, within the dug part) */
export function spotIn(w: World, c: Chamber, frac?: number): { edge: number; s: number } {
  const e = w.edges[c.floorEdge]; const [lo, hi] = reach(e); const f = frac ?? R(w);
  return { edge: e.id, s: lo + (hi - lo) * (0.1 + 0.8 * f) };
}
export function planned(w: World, kind: ChamberKind) { return w.chambers.some((c) => c.kind === kind && !open(c)); }
/** make sure a chamber of this kind exists or is being dug; returns true if one is open */
export function ensure(w: World, kind: ChamberKind, n = 1, owner = 0): boolean {
  const have = w.chambers.filter((c) => c.kind === kind); if (have.filter(open).length >= n) return true;
  if (have.length >= n) return false;
  const digging = w.digQueue.length; if (digging > 4 + Math.floor(w.rats.length / 25)) return false; // the colony can only dig so much at once
  planChamber(w, kind, { owner }); return false;
}
export function maybeExtras(w: World) {
  // bolt-holes and dead ends appear as rats explore (realistic warren features)
  const nests = chambersOf(w, 'nest'); if (!nests.length) return;
  const holes = w.chambers.filter((c) => c.kind === 'bolthole').length;
  if (holes < 1 + Math.floor(nests.length / 3) && R(w) < 0.3) planBolthole(w, nests[Math.floor(R(w) * nests.length)].entryNode);
  const ends = w.nodes.filter((n) => n.kind === 'deadend').length;
  if (ends < 2 + nests.length && R(w) < 0.2) { const ns = w.nodes.filter((n) => n.kind === 'junction' || n.kind === 'chamber'); if (ns.length) planDeadEnd(w, ns[Math.floor(R(w) * ns.length)].id); }
}

/** After the throne, the city asks for the next room. One plan a day, in bible order. */
const CIVIC: { kind: ChamberKind; when: (w: World) => boolean }[] = [
  { kind: 'latrine', when: (w) => day(w) >= 1 },
  { kind: 'gallery', when: (w) => day(w) >= 2 },
  { kind: 'granary', when: (w) => day(w) >= 2 },
  { kind: 'midden', when: (w) => day(w) >= 3 },
  { kind: 'nest', when: (w) => w.rats.filter((r) => r.alive).length >= 14 && chambersOf(w, 'nest').length < 2 },
  { kind: 'nursery', when: (w) => w.rats.some((r) => r.alive && r.stageN < 2) || day(w) >= 4 },
  { kind: 'plaza', when: (w) => w.rats.filter((r) => r.alive).length >= 16 },
  { kind: 'shrine', when: (w) => w.faith > 0.22 || day(w) >= 6 },
  { kind: 'workshop', when: (w) => has(w, 'tools') || day(w) >= 7 },
  { kind: 'barracks', when: (w) => w.rats.filter((r) => r.alive).length >= 22 },
  { kind: 'infirmary', when: (w) => w.rats.some((r) => !!r.disease) || day(w) >= 8 },
  { kind: 'market', when: (w) => w.rats.filter((r) => r.alive).length >= 24 },
  { kind: 'slum', when: (w) => w.rats.filter((r) => r.alive).length >= 30 },
  { kind: 'temple', when: (w) => w.religions.length > 0 },
  { kind: 'archive', when: (w) => has(w, 'writing') },
  { kind: 'lab', when: (w) => has(w, 'sparks') || w.rats.some((r) => r.labrat) },
  { kind: 'council', when: (w) => w.rats.filter((r) => r.alive).length >= 40 },
  { kind: 'jail', when: (w) => w.stats.crime > 0.15 || w.justice.inmates.length > 0 },
];
export function civicStep(w: World) {
  if (w.founding && w.founding.stage !== 'done') return;
  if (w.digQueue.length > 3) return;
  const nest = w.chambers.find((c) => c.kind === 'nest');
  for (let i = 0; i < CIVIC.length; i++) {
    const step = CIVIC[i];
    if (w.chambers.some((c) => c.kind === step.kind && (step.kind !== 'nest' || chambersOf(w, 'nest').length >= 2))) continue;
    if (step.kind === 'nest' && chambersOf(w, 'nest', false).length >= 2) continue;
    if (!step.when(w)) continue;
    const ang = (i / CIVIC.length) * Math.PI * 2;
    const near = nest ? { x: nest.cx + Math.cos(ang) * (26 + (i % 4) * 8), y: nest.cy + 6 + Math.sin(ang) * 10 } : undefined;
    const from = nest?.entryNode ?? w.entrances[0];
    if (planChamber(w, step.kind, { from, near, fit: 'modest' })) return;
  }
}
export { isOpen };
