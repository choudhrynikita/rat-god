/** The life loop the bible already described and nothing was calling.
 *  Rats sleep, eat, forage, study, court, give birth, pray, and carry laws.
 *  Rooms after the throne are asked for here, one a day, as the colony can bear them. */
import { Anim, Carry, DAY_TICKS, RF, type ChamberKind, type GodPower, type Prayer } from './contract';
import { isOpen } from './burrow';
import { heraldPost } from './laws2';
import { pathTo } from './move';
import { anyChamber, chambersOf, nearestChamber, spotIn } from './places';
import { newRat } from './rats';
import { court, interact } from './social';
import { FIRM_SPEC } from './economy';
import { R, chance, emit, type Rat, type World } from './state';
import { has, researchTick } from './tech';

const GEST = 3 * DAY_TICKS;

export function pulseLife(w: World) {
  deliverDue(w);
  mingle(w);
  pray(w);
  stock(w);
}

/** One scholar works steadily. The first tools show up within a few days, not a season. */
export function study(w: World) {
  let best: Rat | null = null;
  for (const r of w.rats) {
    if (!r.alive || r.rodentoid || r.stageN < 2 || r.flags & RF.king) continue;
    if (!best || r.genes.curiosity > best.genes.curiosity) best = r;
  }
  if (best) researchTick(w, best, has(w, 'tools') ? 1.15 : 1);
}

export function chooseIntent(w: World, r: Rat) {
  if (!r.alive || r.rodentoid) return;
  if (r.flags & RF.king) { holdThrone(w, r); return; }
  if (r.flags & RF.jailed) { r.anim = Anim.Jailed; r.intent.kind = 'jail'; r.intent.until = w.tick + 40; return; }
  if (r.role === 'herald' && heraldErrand(w, r)) return;
  const night = w.env.hour < 5 || w.env.hour >= 22;
  if (!night) r.flags &= ~RF.asleep;
  if ((r as { nursing?: number }).nursing && w.tick < (r as { nursing?: number }).nursing!) {
    goChamber(w, r, ['nursery', 'nest']); r.anim = Anim.Nurse; r.intent.kind = 'nurse'; r.intent.until = w.tick + 36; return;
  }
  if (r.flags & RF.pregnant && r.pregnant > 0 && w.tick - r.pregnant > GEST - 400) {
    goChamber(w, r, ['nursery', 'nest']); r.intent.kind = 'nurse'; r.intent.until = w.tick + 30; return;
  }
  if (night && r.needs.energy < 0.7 && r.stageN >= 1) {
    if (goChamber(w, r, r.home >= 0 ? ['home', 'nest'] : ['nest', 'nursery'])) {
      r.intent.kind = 'sleep'; r.anim = Anim.Sleep; r.flags |= RF.asleep; r.needs.energy = Math.min(1, r.needs.energy + 0.04); r.intent.until = w.tick + 48; return;
    }
  }
  if (r.needs.hunger > 0.55 && eatAt(w, r)) return;
  if (r.stageN >= 2 && w.granary < 12 && r.needs.hunger > 0.28 && chance(w, 0.35)) {
    if (goSurface(w, r)) { r.intent.kind = 'forage'; r.intent.until = w.tick + 46; if (onSurface(w, r)) pocketFood(w, r); return; }
  }
  if (r.stageN >= 2 && (r.genes.curiosity > 0.62 || r.labrat) && chance(w, 0.2)) {
    r.intent.kind = 'research'; r.anim = Anim.Idle; r.intent.until = w.tick + 40; return;
  }
  if (r.stageN >= 2 && workAt(w, r)) return;
  wander(w, r);
}

function holdThrone(w: World, r: Rat) {
  const hall = anyChamber(w, 'throne') ?? chambersOf(w, 'throne', false)[0];
  if (hall && hall.floorEdge >= 0) {
    const spot = spotIn(w, hall, 0.7);
    if (r.edge !== spot.edge || Math.abs(r.s - spot.s) > 1.4) pathTo(w, r, spot);
  }
  r.anim = Anim.Throne; r.intent.kind = 'throne'; r.intent.until = w.tick + 90;
}

function heraldErrand(w: World, r: Rat): boolean {
  const rooms = w.chambers.filter((c) => c.progress >= 0.999 && c.kind !== 'bolthole' && c.kind !== 'deadend' && c.floorEdge >= 0);
  const ch = rooms.find((c) => w.laws.some((l) => !l.repealing && !w.posters.some((p) => p.law === l.id && p.chamber === c.id)));
  if (!ch) return false;
  const spot = spotIn(w, ch, 0.35);
  if (r.edge === ch.floorEdge) { heraldPost(w, r, ch.id); r.intent.until = w.tick + 24; return true; }
  pathTo(w, r, spot); r.intent.kind = 'herald'; r.carry = Carry.Poster; r.anim = Anim.Walk; r.intent.until = w.tick + 40; return true;
}

function goChamber(w: World, r: Rat, kinds: ChamberKind[]): boolean {
  const home = r.homeNest >= 0 ? w.chambers[r.homeNest] : null;
  const ch = (home && kinds.includes(home.kind) && home.progress >= 0.5 ? home : null) ?? nearestChamber(w, r, kinds) ?? kinds.map((k) => anyChamber(w, k)).find(Boolean) ?? null;
  if (!ch || ch.floorEdge < 0) return false;
  const spot = spotIn(w, ch, 0.25 + ((r.id * 17) % 50) / 100);
  if (r.edge !== spot.edge || Math.abs(r.s - spot.s) > 1.6) pathTo(w, r, spot);
  return true;
}

function eatAt(w: World, r: Rat): boolean {
  const ch = nearestChamber(w, r, ['granary', 'cache', 'nest']);
  if (!ch) return false;
  const spot = spotIn(w, ch, 0.5);
  const there = r.edge === spot.edge && Math.abs(r.s - spot.s) < 2.2;
  if (!there) { pathTo(w, r, spot); r.intent.kind = 'eat'; r.intent.until = w.tick + 36; return true; }
  const take = Math.min(0.35, ch.stock > 0.2 ? 0.35 : 0.15);
  if (ch.stock > 0.15) { ch.stock -= take; w.granary = Math.max(0, w.granary - take * 0.5); }
  r.needs.hunger = Math.max(0, r.needs.hunger - 0.22); r.food += 0.15; r.anim = Anim.Eat; r.flags &= ~RF.starving;
  r.intent.kind = 'eat'; r.intent.until = w.tick + 18; return true;
}

function goSurface(w: World, r: Rat): boolean {
  const id = w.entrances[0]; if (id == null) return false;
  const e = w.edges.find((ed) => ed.kind === 'surface' && isOpen(ed) && (ed.a === id || ed.b === id));
  if (!e) return false;
  const s = e.a === id ? Math.min(e.len, 1.2) : Math.max(0, e.len - 1.2);
  if (r.edge !== e.id || Math.abs(r.s - s) > 2) pathTo(w, r, { edge: e.id, s });
  return true;
}
function onSurface(w: World, r: Rat) { return r.edge >= 0 && w.edges[r.edge]?.kind === 'surface'; }
function pocketFood(w: World, r: Rat) {
  if (w.foodOnSurface <= 0.2) return;
  const bite = Math.min(0.5, w.foodOnSurface);
  w.foodOnSurface -= bite; r.food += bite * 0.6; w.granary += bite * 0.4; r.needs.hunger = Math.max(0, r.needs.hunger - 0.12);
  const gran = anyChamber(w, 'granary') ?? anyChamber(w, 'cache'); if (gran) gran.stock += bite * 0.4;
}

const POST: Partial<Record<string, ChamberKind[]>> = {
  store: ['granary', 'cache'],
  heal: ['infirmary', 'nest'],
  craft: ['workshop', 'lab'],
  trade: ['market', 'plaza'],
  patrol: ['barracks', 'plaza'],
  write: ['archive', 'council'],
  scavenge: ['midden', 'slum'],
  build: ['workshop', 'gallery'],
};
function workAt(w: World, r: Rat): boolean {
  if (r.flags & (RF.priest | RF.prophet) || (r.religion && chance(w, 0.4))) {
    if (goChamber(w, r, ['temple', 'shrine', 'nest'])) { r.anim = Anim.Pray; r.intent.kind = 'pray'; r.intent.until = w.tick + 36; return true; }
  }
  const fest = w.festivals.find((f) => f.endsAt > w.tick);
  if (fest && chance(w, 0.45)) {
    const ch = w.chambers[fest.chamber];
    if (ch && ch.progress > 0.4 && goChamber(w, r, [ch.kind])) { r.anim = Anim.Cheer; r.intent.kind = 'festival'; r.intent.until = w.tick + 40; return true; }
  }
  const firm = r.firm ? w.firms.find((f) => f.id === r.firm) : undefined;
  if (!firm || firm.status === 'strike' || firm.status === 'bust') return false;
  const task = FIRM_SPEC[firm.kind]?.task;
  if (!task || task === 'forage' || task === 'dig') return false;
  const kinds = POST[task]; if (!kinds || !chance(w, 0.65)) return false;
  if (goChamber(w, r, kinds)) { r.anim = Anim.Idle; r.intent.kind = 'work'; r.intent.until = w.tick + 42; return true; }
  return false;
}

function wander(w: World, r: Rat) {
  const openF = w.edges.filter((e) => isOpen(e) && (e.kind === 'floor' || e.kind === 'tunnel'));
  if (!openF.length) { r.intent.until = w.tick + 12; return; }
  const prefer = r.stageN < 2 ? w.chambers.find((c) => (c.kind === 'nursery' || c.kind === 'nest') && c.progress > 0.5) : null;
  const e = prefer && w.edges[prefer.floorEdge] && isOpen(w.edges[prefer.floorEdge]) ? w.edges[prefer.floorEdge] : openF[(r.id + w.tick) % openF.length];
  const s = 0.3 + R(w) * Math.max(0.3, e.len - 0.6);
  r.intent.kind = 'wander'; r.intent.since = w.tick; r.intent.goalEdge = e.id; r.intent.goalS = s;
  if (pathTo(w, r, { edge: e.id, s })) r.intent.until = w.tick + 40 + Math.floor(R(w) * 30);
  else { r.intent.kind = 'idle'; r.anim = Anim.Idle; r.intent.until = w.tick + 10; }
}

function deliverDue(w: World) {
  for (const r of w.rats) {
    if (!r.alive || r.pregnant <= 0) continue;
    if (w.tick - r.pregnant < GEST) continue;
    const dad = w.byId.get(r.pregFather);
    const nest = anyChamber(w, 'nursery') ?? anyChamber(w, 'nest');
    const n = Math.min(4, 2 + Math.floor(R(w) * (1.2 + r.genes.fertility * 2)));
    const ids: number[] = [];
    for (let i = 0; i < n; i++) {
      if (w.rats.filter((x) => x.alive).length > 110) break;
      const spot = nest && nest.floorEdge >= 0 ? spotIn(w, nest, R(w)) : { edge: r.edge, s: r.s };
      const pup = newRat(w, { mother: r, father: dad, edge: spot.edge, s: spot.s, ageDays: 0 });
      pup.homeNest = nest?.id ?? r.homeNest; ids.push(pup.id);
    }
    r.pregnant = 0; r.pregFather = 0; r.flags &= ~RF.pregnant; (r as { nursing?: number }).nursing = w.tick + 500; (r as { bred?: number }).bred = w.tick;
    w.stats.births += ids.length;
    emit(w, 'birth', `${r.name} has ${ids.length} pups in the ${nest?.name ?? 'nest'}.`, 1, { rats: [r.id, ...ids], chamber: nest?.id, x: nest?.cx ?? r.x, y: nest?.cy ?? r.y });
  }
}

function mingle(w: World) {
  const adults = w.rats.filter((r) => r.alive && !r.rodentoid && r.stageN >= 2 && !(r.flags & (RF.king | RF.jailed)));
  const women = adults.filter((r) => r.female && r.pregnant <= 0);
  const men = adults.filter((r) => !r.female);
  const nest = anyChamber(w, 'nest') ?? anyChamber(w, 'nursery');
  if (women.length && men.length && nest && nest.floorEdge >= 0 && w.rats.filter((r) => r.alive).length < 96) {
    const a = women[Math.floor(w.tick / 40) % women.length];
    const b = men[Math.floor(w.tick / 80) % men.length];
    const sa = spotIn(w, nest, 0.42), sb = spotIn(w, nest, 0.58);
    if (a.edge !== sa.edge || Math.abs(a.s - sa.s) > 3) pathTo(w, a, sa);
    if (b.edge !== sb.edge || Math.abs(b.s - sb.s) > 3) pathTo(w, b, sb);
    if (a.edge === b.edge && Math.abs(a.s - b.s) < 12) {
      const res = court(w, a, b);
      if (res !== 'reject') conceive(w, a, b);
    }
  }
  let n = 0;
  for (let i = 0; i < adults.length && n < 2; i++) {
    const a = adults[(i + w.tick) % adults.length];
    const b = adults.find((o) => o !== a && o.edge === a.edge && Math.abs(o.s - a.s) < 8);
    if (!b || b.id < a.id) continue;
    interact(w, a, b, chance(w, 0.4) ? 'gossip' : 'talk');
    n++;
  }
}

function conceive(w: World, a: Rat, b: Rat) {
  const mom = a.female ? a : b.female ? b : null; const dad = mom === a ? b : a;
  if (!mom || !dad || dad.female || mom.pregnant > 0) return;
  if ((mom as { bred?: number }).bred && w.tick - (mom as { bred?: number }).bred! < DAY_TICKS) return;
  if (w.rats.filter((r) => r.alive).length > 96) return;
  if (!chance(w, 0.55 + mom.genes.fertility * 0.25)) return;
  mom.pregnant = w.tick; mom.pregFather = dad.id; mom.flags |= RF.pregnant;
  emit(w, 'courtship', `${mom.name} is with pups.`, 0, { rats: [mom.id, dad.id], mature: ['sex'], safe: `${mom.name} is expecting.` });
}

function pray(w: World) {
  w.prayers = w.prayers.filter((p) => w.tick - p.tick < 2 * DAY_TICKS);
  if (w.prayers.length >= 4 || !chance(w, 0.45)) return;
  const rats = w.rats.filter((r) => r.alive && !r.rodentoid && r.stageN >= 2 && (r.needs.hunger > 0.62 || r.beliefs.god > 0.35 || r.flags & RF.priest || (r.spouse && !r.pregnant && r.female)));
  if (!rats.length) return;
  const r = rats[Math.floor(R(w) * rats.length)];
  let kind: Prayer['kind'] = 'sign'; let plea = 'If you are there, show us.'; let suggest: GodPower = 'sign';
  if (r.needs.hunger > 0.62) { kind = 'food'; plea = 'The cache is thin. Do not let the pups starve.'; suggest = 'harvest'; }
  else if (r.disease || r.injured > 0.3) { kind = 'heal'; plea = 'The sickness is in the bedding. Take it back.'; suggest = 'miracle'; }
  else if (r.female && r.spouse && !r.pregnant) { kind = 'child'; plea = 'A litter, if the nest can hold one.'; suggest = 'bless'; }
  else if (r.beliefs.god > 0.5 || r.flags & RF.priest) { kind = 'sign'; plea = 'Speak, so the others stop laughing.'; suggest = 'voice'; r.anim = Anim.Pray; }
  r.beliefs.god = Math.min(1, r.beliefs.god + 0.04);
  const p: Prayer = { ratId: r.id, name: r.name, plea, kind, tick: w.tick, x: r.x, y: r.y, suggest };
  w.prayers.push(p);
  emit(w, 'prayer', `${r.name} prays: ${plea}`, 0, { rats: [r.id], x: r.x, y: r.y });
}

const STOCK_KIND: Partial<Record<ChamberKind, 'food' | 'nest' | 'scrap'>> = {
  nest: 'nest', nursery: 'nest', cache: 'food', granary: 'food', midden: 'scrap', workshop: 'scrap', market: 'food',
};
function stock(w: World) {
  for (const c of w.chambers) {
    if (c.progress < 0.6) continue;
    const kind = STOCK_KIND[c.kind]; if (!kind) continue;
    const have = w.items.filter((it) => it.kind === kind && Math.hypot(it.x - c.cx, it.y - c.cy) < c.rx + 1).length;
    const want = kind === 'food' ? 2 + Math.min(4, Math.floor(c.stock / 3)) : 3;
    for (let i = have; i < want && w.items.length < 240; i++) {
      const spot = c.floorEdge >= 0 ? spotIn(w, c, (i + 1) / (want + 1)) : null;
      const e = spot ? w.edges[spot.edge] : null;
      w.items.push({ id: ++w.nextObj, kind, x: c.cx + (i - want / 2) * 1.3, y: c.floorY - 0.2, edge: e?.id ?? -1, s: spot?.s ?? 0, amount: 1 });
    }
  }
}
