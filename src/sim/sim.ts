import { clamp, clamp01, nextRand, sigmoid } from './rng';
import { computeMods, LAWS, LAW_BY_ID, TIER_POP as TIER_POP_, type Mods } from './laws';
import { ratName, roman } from './names';
import { log } from './log';
import { heraldPath, lawAvailable, pressLaw, stepHeralds } from './decree';
import { kingLearn, kingThink, newMind } from './king';
export { lawAvailable, pressLaw };
import {
  Act, OBJECTIVES, R, ROOM_KINDS, ROOM_LABEL, SURFACE, TPD, type Caste, type DayStat, type Rat, type SimState,
} from './types';

// ---------- tuning constants ----------
export const ADULT_AGE = 6;
const BASE_WORK_TICKS = 13;
const DUSK = 14;
const EMO_K = 1 - Math.pow(0.5, 1 / (2 * TPD)); // half-life 2 days
const DIG_COST = [3, 6, 10]; // dig-days to reach level 1/2/3
const SCRAP_COST = [2, 5, 9];
const FOUND_DIG: Partial<Record<number, number>> = { [R.entrance]: 1.2, [R.throne]: 2, [R.granary]: 1.5, [R.nursery]: 1.5 };
const FOUND_SCRAP: Partial<Record<number, number>> = { [R.entrance]: 0, [R.throne]: 3, [R.granary]: 1, [R.nursery]: 2 };
const GRANARY_CAP = [8, 70, 160, 320];
const NURSERY_CAP = [4, 14, 30, 50];
const WARREN_CAP = [0, 22, 50, 90];
const DEEP_CAP = [0, 40, 80, 140];
const CASTE_BASE: Record<Caste, number> = { none: 0, digger: 1, hauler: 1, wheel: 1, gnawer: 1, nurse: 1, enforcer: 0, outcast: 0, keeper: 0 };

export type Command =
  | { t: 'gore'; on: boolean }
  | { t: 'debug'; what: 'gather' | 'killKing' | 'grow' | 'skipFounding' | 'press' | 'starveKing'; id?: string; n?: number };

export interface CmdResult { ok: boolean; msg: string }

// ---------- creation ----------
function newRat(s: SimState, opts: Partial<Rat> = {}): Rat {
  const r: Rat = {
    id: s.nextId++, name: ratName(s), sex: nextRand(s) < 0.5 ? 0 : 1, age: 0, life: 0, health: 1, sat: 0.9, satSlow: 0.9,
    rest: 1, social: 0.7, content: 0.55, hope: 0.5, fear: 0.05, fearSlow: 0.05, anger: 0.08, despair: 0.08, loyalty: 0.55,
    dil: nextRand(s), bold: nextRand(s), cred: nextRand(s), soc: nextRand(s), con: nextRand(s),
    caste: 'none', eff: 1, work: 0, room: R.entrance, act: Act.Idle, preg: 0, father: -1, lastLitter: -99, litters: 0,
    inf: 0, immune: 0, shaking: 0, isKing: false, founder: false, mother: -1, grief: 0, out: 0, ...opts,
  };
  if (!r.life) r.life = 50 + 18 * r.con + 8 * nextRand(s);
  return r;
}

export function createState(seed: number): SimState {
  const s: SimState = {
    version: 1, seed, rng: seed >>> 0 || 1, tick: 0, phase: 'founding', rats: [], nextId: 1,
    rooms: ROOM_KINDS.map((k) => ({ kind: k, level: 0, dug: 0 })),
    food: 6, scrap: 0, power: 0,
    king: { id: -1, luxury: 0, appetite: 2, plate: 'none', plateRatio: 0, emptyDays: 0, dying: false, fat: 0, stash: 0, titheAcc: 0, rotOnPlate: 0, spared: false, deadSinceTick: -1, corpseAge: 0, reignNo: 0, lastPlateTick: -1, feastInFamine: 0 },
    laws: {}, cooldown: {}, lawsPassedTotal: 0, peakPop: 1, totalDead: 0, totalBorn: 0, exiled: 0,
    corpses: [], items: [], events: [], eventSeq: 0, history: [], reigns: [], revealed: [], gathering: null,
    grievDays: 0, lastGatherSpared: false, suppressedCount: 0, droneAttention: 0,
    founder: { task: 'idle', room: SURFACE, timer: 0, item: -1, itemX: 0, carried: { scrap: 0, food: 0 }, scrapCollected: 0, mateId: -1, mated: false, objective: 0 },
    heralds: [], mind: null,
    digTarget: -1, chaosUntil: 0, faithCollapseUntil: 0, feastDayFlag: false,
    dayAcc: { births: 0, deaths: 0, foodIn: 0, output: 0, workerTicks: 0 }, lastDeathCause: {}, flags: { gore: true }, lastResult: null,
  };
  // warm up rng
  for (let i = 0; i < 5; i++) nextRand(s);
  const f = newRat(s, { sex: 0, age: 10, founder: true, room: SURFACE, dil: 0.8, con: 0.7, life: 70 });
  f.name = ratName(s);
  s.rats.push(f);
  spawnItems(s, true);
  log(s, 'founding', `${f.name} CRAWLS DOWN FROM THE STREET. THE SEWER IS EMPTY.`);
  return s;
}

export const day = (s: SimState) => Math.floor(s.tick / TPD);
export const isAdult = (r: Rat) => r.age >= ADULT_AGE;
export const isElder = (r: Rat) => r.age >= r.life * 0.75;
export const king = (s: SimState) => s.rats.find((r) => r.id === s.king.id);

// ---------- capacity helpers ----------
function lvl(s: SimState, k: number) { return s.rooms[k].level; }
export function granaryCap(s: SimState) { return GRANARY_CAP[lvl(s, R.granary)]; }
export function nurseryCap(s: SimState) { return NURSERY_CAP[lvl(s, R.nursery)]; }
export function housingCap(s: SimState, m?: Mods) {
  const c = 8 + WARREN_CAP[lvl(s, R.warren)] + DEEP_CAP[lvl(s, R.deepwarren)] + 12 * lvl(s, R.slum) + 4 * lvl(s, R.nursery);
  return c * (m ? m.crowdCap : 1);
}
/** balance knobs (tuned over 200 seeded soaks: see scripts/balance.sh) */
export const BAL = { leanBoost: 0.8, leanPop: 26, haulK: 3.5 };
export function forageK(s: SimState, m: Mods) { return (30 + 60 * lvl(s, R.entrance)) * m.forageK; }

// ---------- founding (autonomous founder AI) ----------
function spawnItems(s: SimState, initial = false) {
  const want = initial ? 5 : 4;
  const scrapNeeded = s.founder.scrapCollected < 6;
  while (s.items.length < want) {
    const isScrap = scrapNeeded && (s.items.filter((i) => i.kind === 'scrap').length < 2 || nextRand(s) < 0.45);
    const surface = !isScrap || s.rooms[R.entrance].level === 0 || nextRand(s) < 0.6;
    s.items.push({ id: s.nextId++, kind: isScrap ? 'scrap' : 'food', x: 20 + Math.floor(nextRand(s) * 320), y: 0, room: surface ? SURFACE : R.entrance });
  }
}

function founderObjective(s: SimState): number {
  const f = s.founder;
  if (s.rooms[R.entrance].level < 1) return 0;
  if (f.scrapCollected < 3) return 1;
  if (s.rooms[R.throne].level < 1) return 2;
  if (s.rooms[R.granary].level < 1 || s.food < 6) return 3;
  if (s.rooms[R.nursery].level < 1) return 4;
  if (!f.mated) return 5;
  return 6;
}

const FOUND_ORDER = [R.entrance, R.throne, R.granary, R.nursery];
const TRAVEL = 3; // ticks between the drain mouth and the street

/** what the founder wants to do next, as a utility pick over a handful of options */
function founderChoose(s: SimState, f: Rat) {
  const fs = s.founder;
  const obj = founderObjective(s);
  // hungry: eat if there is a store, else go find food
  if (f.sat < 0.35 && s.food >= 1 && s.rooms[R.entrance].level >= 1) { fs.task = 'eat'; fs.timer = 2; fs.room = s.rooms[R.granary].level ? R.granary : R.entrance; return; }
  const next = FOUND_ORDER.find((k) => s.rooms[k].level < 1);
  const need = (kind: 'scrap' | 'food') => {
    const it = s.items.filter((i) => i.kind === kind).sort((a, b) => (a.room === b.room ? 0 : a.room === R.entrance ? -1 : 1))[0];
    if (!it) return false;
    fs.item = it.id; fs.itemX = it.x;
    if (it.room === R.entrance) { fs.task = 'pick'; fs.timer = 2; fs.room = R.entrance; }
    else { fs.task = 'toSurface'; fs.timer = TRAVEL; fs.room = R.entrance; }
    return true;
  };
  if (f.sat < 0.35 && need('food')) return;
  if (obj === 0) { fs.task = 'dig'; fs.room = R.entrance; return; }
  if (obj === 1) { if (need('scrap')) return; }
  if (next !== undefined) {
    const room = s.rooms[next];
    const cost = FOUND_DIG[next] ?? 2;
    if (room.dug < cost) { fs.task = 'dig'; fs.room = next; return; }
    if (s.scrap < (FOUND_SCRAP[next] ?? 0)) { if (need('scrap')) return; }
  }
  if (obj === 3 && s.food < 6) { if (need('food')) return; }
  if (obj === 5) { fs.task = 'court'; fs.timer = 6; fs.room = R.nursery; return; }
  if (obj === 6 && s.food < granaryCap(s) && need('food')) return;
  fs.task = 'rest'; fs.timer = 4; fs.room = R.nursery;
}

function stepFounding(s: SimState) {
  const f = s.rats.find((r) => r.founder);
  const fs = s.founder;
  if (s.tick % (TPD / 2) === 0) spawnItems(s);
  if (!f) return;
  if (fs.task === 'idle') founderChoose(s, f);
  switch (fs.task) {
    case 'dig': {
      const k = fs.room, room = s.rooms[k], cost = FOUND_DIG[k] ?? 2;
      f.room = k; f.act = Act.Dig;
      if (room.level >= 1) { fs.task = 'idle'; break; }
      room.dug = Math.min(cost, room.dug + (f.sat > 0.2 ? 1 : 0.5) / TPD * 1.6);
      if (room.dug >= cost) { tryFinishFoundRoom(s, k); fs.task = 'idle'; }
      break;
    }
    case 'toSurface':
      f.act = Act.Haul; f.room = --fs.timer > 0 ? R.entrance : SURFACE;
      if (fs.timer <= 0) { fs.task = 'pick'; fs.timer = 2; fs.room = SURFACE; }
      break;
    case 'pick': {
      f.room = fs.room; f.act = Act.Idle;
      if (--fs.timer > 0) break;
      const it = s.items.find((i) => i.id === fs.item);
      if (it) { s.items.splice(s.items.indexOf(it), 1); if (it.kind === 'scrap') fs.carried.scrap++; else fs.carried.food++; }
      fs.task = 'carry'; fs.timer = fs.room === SURFACE ? TRAVEL : 1;
      break;
    }
    case 'carry':
      f.act = Act.Haul; f.room = fs.timer > 1 ? SURFACE : R.entrance;
      if (--fs.timer > 0) break;
      f.room = R.entrance;
      if (s.rooms[R.entrance].level >= 1) {
        s.scrap += fs.carried.scrap; fs.scrapCollected += fs.carried.scrap;
        s.food = Math.min(Math.max(granaryCap(s), 8), s.food + fs.carried.food * 2);
        if (fs.carried.scrap || fs.carried.food) log(s, 'founding', `${f.name} DRAGS ${fs.carried.scrap ? fs.carried.scrap + ' SCRAP' : fs.carried.food * 2 + ' FOOD'} INTO THE BURROW.`);
      } else f.sat = clamp01(f.sat + 0.25 * fs.carried.food);
      fs.carried = { scrap: 0, food: 0 };
      for (const k of FOUND_ORDER) tryFinishFoundRoom(s, k);
      fs.task = 'idle';
      break;
    case 'eat':
      f.room = fs.room; f.act = Act.Eat;
      if (--fs.timer > 0) break;
      { const e = Math.min(s.food, 1.5); s.food -= e; f.sat = clamp01(f.sat + e * 0.4); }
      fs.task = 'idle';
      break;
    case 'court': {
      f.room = R.nursery; f.act = Act.Idle;
      const m = s.rats.find((r) => r.id === fs.mateId);
      if (m) m.room = R.nursery;
      if (--fs.timer > 0) break;
      if (m && !fs.mated) {
        fs.mated = true; m.preg = 1.5; m.father = f.id;
        log(s, 'founding', `${f.name} AND ${m.name} MATE IN THE SHREDDED POSTERS.`);
      }
      fs.task = 'idle';
      break;
    }
    case 'rest':
      f.room = R.nursery; f.act = Act.Sleep;
      if (--fs.timer <= 0) fs.task = 'idle';
      break;
  }
  fs.objective = founderObjective(s);
}

function tryFinishFoundRoom(s: SimState, k: number) {
  const room = s.rooms[k];
  if (room.level >= 1 || room.dug < (FOUND_DIG[k] ?? 9)) return;
  if (k !== R.entrance && s.rooms[R.entrance].level < 1) return;
  const sc = FOUND_SCRAP[k] ?? 0;
  if (s.scrap < sc) return;
  s.scrap -= sc; room.level = 1; room.dug = 0;
  log(s, 'build', `THE ${ROOM_LABEL[room.kind]} IS DUG.`);
  if (k === R.nursery) spawnMate(s);
}

function spawnMate(s: SimState) {
  if (s.founder.mateId >= 0) return;
  const m = newRat(s, { sex: 1, age: 9, room: R.entrance, con: 0.7, dil: 0.6, life: 62 });
  s.rats.push(m);
  s.founder.mateId = m.id;
  log(s, 'founding', `A FEMALE, ${m.name}, SNIFFS AT THE DRAIN MOUTH.`);
}

function crownFounder(s: SimState) {
  const f = s.rats.find((r) => r.founder);
  if (!f) return;
  // strays come in to kneel
  for (let i = 0; i < 5; i++) {
    const r = newRat(s, { age: 8 + nextRand(s) * 6, room: R.entrance, sex: (i % 2) as 0 | 1 });
    s.rats.push(r);
  }
  s.phase = 'reign';
  s.items = [];
  s.food = Math.max(s.food, 12);
  for (const r of s.rats) if (!r.isKing && isAdult(r)) r.loyalty = 0.7;
  startReign(s, f, 'founder');
  log(s, 'founding', `FIVE STRAYS CRAWL IN FROM THE DRAIN TO KNEEL. ${f.name} TAKES THE THRONE AND WILL NEVER LEAVE IT.`);
}

// ---------- reigns / succession ----------
function startReign(s: SimState, r: Rat, how: 'founder' | 'efficient' | 'popular') {
  r.isKing = true; r.caste = 'none'; r.room = R.throne; r.act = Act.Throne;
  s.king = { ...s.king, id: r.id, luxury: 0, plate: 'none', plateRatio: 0, emptyDays: 0, dying: false, fat: 0, stash: how === 'founder' ? 10 : 5,
    titheAcc: 0, rotOnPlate: 0, spared: false, deadSinceTick: -1, corpseAge: 0, reignNo: s.king.reignNo + 1, feastInFamine: 0 };
  s.lastGatherSpared = false; s.grievDays = 0; s.suppressedCount = 0;
  s.mind = newMind(s, r.bold, r.soc, r.cred);
  const title = `KING ${r.name} ${roman(s.king.reignNo)}`;
  s.reigns.push({ kingId: r.id, name: title, start: day(s), end: null, laws: [], cause: null, pop: [], remembered: null, peakLuxury: 0 });
  for (const o of s.rats) if (!o.isKing) o.loyalty = Math.min(1, o.loyalty + 0.3);
  log(s, 'crowned', `${title} IS RAISED UP${how === 'efficient' ? ': THE MOST EFFICIENT RAT IN THE CITY' : how === 'popular' ? ': CHOSEN BY THE CITY' : ''}. ${s.mind.traits.join(', ')}.`);
}

function endReign(s: SimState, cause: string) {
  const rg = s.reigns[s.reigns.length - 1];
  if (rg && rg.end === null) { rg.end = day(s); rg.cause = cause; }
}

function rememberLaw(s: SimState) {
  const rg = s.reigns[s.reigns.length - 1];
  if (!rg || rg.remembered) return;
  const cands = [...rg.laws, ...Object.keys(s.laws), ...s.reigns.flatMap((x) => x.laws)].filter((l) => l !== 'abolish_laws' && !s.revealed.includes(l));
  const pick = cands[0];
  if (!pick) return;
  s.revealed.push(pick);
  const d = LAW_BY_ID[pick];
  rg.remembered = { law: pick, text: d.truth };
  log(s, 'reveal', `GOD'S INSIGHT: ${d.name}. ${d.truth.toUpperCase()}`);
}

function crownSuccessor(s: SimState, m: Mods) {
  rememberLaw(s);
  // remove the old king's corpse from the throne (dragged to the pit)
  const oldCorpse = s.corpses.find((c) => c.kind === 'king');
  if (oldCorpse) oldCorpse.room = lvl(s, R.graveyard) ? R.graveyard : R.plaza, oldCorpse.kind = 'adult';
  let cands = s.rats.filter((r) => isAdult(r) && !r.isKing && r.caste !== 'outcast');
  if (!cands.length) cands = s.rats.filter((r) => isAdult(r) && !r.isKing);
  if (m.election) cands = cands.filter((r) => r.caste !== 'enforcer');
  if (!cands.length) {
    s.phase = 'interregnum';
    s.king.id = -1;
    log(s, 'interregnum', 'THERE IS NO ADULT LEFT TO RAISE UP.');
    return;
  }
  const score = (r: Rat) => (m.election ? 0.5 * r.soc + 0.3 * r.content + 0.2 * r.loyalty : r.eff + (m.ration === 'merit' ? 0.2 * r.bold : 0));
  cands.sort((a, b) => score(b) - score(a) || b.age - a.age || a.id - b.id);
  s.phase = 'reign';
  startReign(s, cands[0], m.election ? 'popular' : 'efficient');
}

function killRat(s: SimState, r: Rat, cause: string, violent = false) {
  const idx = s.rats.indexOf(r);
  if (idx < 0) return;
  s.rats.splice(idx, 1);
  s.totalDead++; s.dayAcc.deaths++;
  s.lastDeathCause[cause] = (s.lastDeathCause[cause] ?? 0) + 1;
  const isK = r.isKing;
  s.corpses.push({ id: r.id, room: isK ? R.throne : r.room < 0 ? R.entrance : r.room, age: 0, kind: isK ? 'king' : isAdult(r) ? 'adult' : 'pup', violent });
  if (s.corpses.length > 160) s.corpses.splice(0, s.corpses.length - 160);
  for (const o of s.rats) {
    if (o.mother === r.id || r.mother === o.id || (o.room === r.room && nextRand(s) < 0.25)) {
      o.grief = Math.min(1, o.grief + (o.mother === r.id || r.mother === o.id ? 0.8 : 0.15));
      o.fear = Math.min(1, o.fear + (violent ? 0.12 : 0.04));
    }
  }
  if (isK) {
    endReign(s, cause);
    s.mind = null;
    s.king.deadSinceTick = s.tick;
    if ('shrine' in s.laws) s.faithCollapseUntil = s.tick + 3 * TPD;
    if (cause === 'executed by the plaza') log(s, 'executed', `THE PLAZA TEARS ${s.reigns[s.reigns.length - 1]?.name ?? 'THE KING'} APART.`);
    else { s.phase = s.phase === 'gathering' ? 'gathering' : 'interregnum'; log(s, 'king_died', `${s.reigns[s.reigns.length - 1]?.name ?? 'THE KING'} DIED OF ${cause.toUpperCase()}. THE THRONE IS SILENT.`); }
  }
}

// ---------- commands (the god only watches; these are settings + debug hooks) ----------
export function applyCommand(s: SimState, c: Command): CmdResult {
  switch (c.t) {
    case 'gore': s.flags.gore = c.on; return { ok: true, msg: '' };
    case 'debug': {
      const m = computeMods(s);
      if (c.what === 'skipFounding' && s.phase === 'founding') {
        for (const k of [R.entrance, R.throne, R.granary, R.nursery]) s.rooms[k].level = 1;
        s.founder.scrapCollected = 3; s.food = 20; spawnMate(s); s.founder.mated = true;
        const mt = s.rats.find((r) => r.id === s.founder.mateId)!; mt.preg = 0.05; mt.father = s.rats[0].id;
      } else if (c.what === 'gather' && (s.phase === 'reign' || s.phase === 'interregnum')) startGathering(s, m, true);
      else if (c.what === 'killKing') { const k = king(s); if (k) killRat(s, k, 'a burst heart'); }
      else if (c.what === 'grow') growCity(s, c.n ?? 60);
      else if (c.what === 'press' && c.id) pressLaw(s, c.id);
      else if (c.what === 'starveKing') { s.king.stash = 0; s.king.emptyDays = 3; s.king.dying = true; }
      return { ok: true, msg: 'DEBUG' };
    }
  }
}

/** Test helper: enact a law instantly in every district (skips the herald). */
export function enactNow(s: SimState, id: string) {
  s.laws[id] = { since: s.tick, pressed: s.tick, adopt: 1, reached: heraldPath(s), repealing: false };
  for (const cf of LAW_BY_ID[id].conflicts ?? []) delete s.laws[cf];
}

/** Test/debug helper: jump to a developed city with `n` adults and all core rooms built. */
export function growCity(s: SimState, n: number) {
  if (s.phase === 'founding') { applyCommand(s, { t: 'debug', what: 'skipFounding' }); while (s.phase === 'founding') step(s); }
  for (const k of [R.entrance, R.throne, R.granary, R.nursery, R.workshop, R.warren, R.plaza, R.graveyard]) s.rooms[k].level = Math.max(s.rooms[k].level, k === R.warren || k === R.entrance ? 2 : 1);
  s.rooms[R.deepwarren].level = Math.max(s.rooms[R.deepwarren].level, n > 60 ? 1 : 0);
  s.rooms[R.granary].level = 2;
  while (s.rats.length < n) s.rats.push(newRat(s, { age: ADULT_AGE + nextRand(s) * 30, room: R.warren }));
  s.food = Math.max(s.food, Math.min(granaryCap(s), n * 2));
  s.scrap = Math.max(s.scrap, 10);
  s.peakPop = Math.max(s.peakPop, s.rats.length);
  assignCastes(s, computeMods(s));
}

// ---------- city AI ----------
function assignCastes(s: SimState, m: Mods) {
  const adults = s.rats.filter((r) => isAdult(r) && !r.isKing && !(s.phase === 'founding'));
  const pups = s.rats.filter((r) => !isAdult(r)).length;
  // enforcers / keepers
  const wantEnf = m.enforcers ? Math.max(1, Math.round(adults.length * 0.05)) : 0;
  const wantKeep = m.shrine ? Math.max(1, Math.round(adults.length * 0.04)) : 0;
  const pool = adults.filter((r) => r.caste !== 'outcast');
  const enf = pool.filter((r) => r.caste === 'enforcer');
  if (enf.length > wantEnf) enf.slice(wantEnf).forEach((r) => (r.caste = 'none'));
  else if (enf.length < wantEnf) pool.filter((r) => r.caste !== 'enforcer').sort((a, b) => b.bold - a.bold).slice(0, wantEnf - enf.length).forEach((r) => (r.caste = 'enforcer'));
  const keep = pool.filter((r) => r.caste === 'keeper');
  if (keep.length > wantKeep) keep.slice(wantKeep).forEach((r) => (r.caste = 'none'));
  else if (keep.length < wantKeep) pool.filter((r) => r.caste !== 'enforcer' && r.caste !== 'keeper').sort((a, b) => b.cred - a.cred).slice(0, wantKeep - keep.length).forEach((r) => (r.caste = 'keeper'));
  const workers = pool.filter((r) => r.caste !== 'enforcer' && r.caste !== 'keeper');
  const n = workers.length;
  if (!n) return;
  const want: Record<string, number> = {};
  want.nurse = lvl(s, R.nursery) ? Math.min(Math.ceil(pups / 6), Math.ceil(n * 0.2)) : 0;
  want.digger = s.digTarget >= 0 ? (n >= 6 || s.food > s.rats.length * 3 ? Math.max(1, Math.round(n * 0.14)) : 0) : 0;
  want.wheel = lvl(s, R.workshop) ? Math.max(1, Math.round(n * 0.1)) : 0;
  want.gnawer = lvl(s, R.workshop) ? Math.max(1, Math.round(n * 0.08)) : 0;
  const cons = s.rats.reduce((a, r) => a + (isAdult(r) ? 1 : 0.5), 0);
  const last = s.history[s.history.length - 1];
  const balance = last ? last.foodIn / Math.max(1, cons) : 1;
  const minHaul = s.food < cons * 2 || balance < 1.05 ? 0.7 : 0.45;
  if (minHaul > 0.5) { want.digger = Math.min(want.digger, Math.round(n * 0.05)); want.gnawer = Math.min(want.gnawer, Math.round(n * 0.04)); }
  let rest = n - want.nurse - want.digger - want.wheel - want.gnawer;
  const nW = n - want.nurse;
  if (rest < Math.ceil(nW * minHaul)) { // food first (nurses exempt)
    const scale = Math.max(0, (nW - Math.ceil(nW * minHaul)) / Math.max(1, nW - rest));
    for (const k of ['digger', 'wheel', 'gnawer']) want[k] = Math.floor(want[k] * scale);
    rest = n - want.nurse - want.digger - want.wheel - want.gnawer;
  }
  want.hauler = rest;
  const have: Record<string, Rat[]> = { nurse: [], digger: [], wheel: [], gnawer: [], hauler: [], none: [] };
  for (const r of workers) (have[r.caste] ?? have.none).push(r);
  const free: Rat[] = [...have.none];
  for (const k of ['nurse', 'digger', 'wheel', 'gnawer', 'hauler']) {
    while (have[k].length > want[k]) free.push(have[k].pop()!);
  }
  for (const k of ['hauler', 'nurse', 'digger', 'wheel', 'gnawer']) {
    while (have[k].length < want[k] && free.length) {
      // prefer females as nurses, diligent as wheel
      let i = 0;
      if (k === 'nurse') i = Math.max(0, free.findIndex((r) => r.sex === 1));
      const r = free.splice(i, 1)[0];
      r.caste = k as Caste; have[k].push(r);
    }
  }
  for (const r of free) r.caste = 'hauler';
}

function chooseDigTarget(s: SimState, m: Mods) {
  if (s.digTarget >= 0 && s.rooms[s.digTarget].level < 3) {
    const cur = s.rooms[s.digTarget];
    if (cur.dug < DIG_COST[cur.level] || s.scrap < SCRAP_COST[cur.level]) return; // keep going
  }
  const pop = s.rats.length;
  const pups = s.rats.filter((r) => !isAdult(r)).length;
  const u: [number, number][] = [];
  const add = (k: number, v: number) => { if (s.rooms[k].level < 3) u.push([k, v]); };
  const density = pop / housingCap(s, m);
  add(R.workshop, lvl(s, R.workshop) ? 0.1 : 0.9);
  add(R.warren, density > 0.6 ? 1.2 * density : 0.2);
  if (lvl(s, R.warren) >= 2) add(R.deepwarren, density > 0.6 ? 1.1 * density : 0.15);
  add(R.granary, s.food > granaryCap(s) * 0.75 ? 0.9 : 0.1);
  add(R.nursery, pups > nurseryCap(s) * 0.7 ? 0.95 : 0.1);
  add(R.entrance, 0.35 + 0.1 * lvl(s, R.warren));
  add(R.plaza, pop >= 15 && !lvl(s, R.plaza) ? 0.8 : 0.05);
  add(R.graveyard, s.totalDead >= 5 && !lvl(s, R.graveyard) ? 0.85 : 0.03);
  if (m.shrine || m.prophet) add(R.shrine, lvl(s, R.shrine) ? 0.1 : 1.0);
  if (m.enforcers) add(R.barracks, lvl(s, R.barracks) ? 0.1 : 1.0);
  if (s.rats.some((r) => r.caste === 'outcast')) add(R.slum, lvl(s, R.slum) ? 0.15 : 0.7);
  u.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  s.digTarget = u.length ? u[0][0] : -1;
}

// ---------- gatherings ----------
function grievance(r: Rat) {
  const poverty = 1 - r.satSlow;
  return 0.5 * poverty + 0.35 * r.anger + 0.25 * r.despair - 0.25 * r.loyalty - 0.15 * r.fear + 0.1;
}
export const GRIEVANT = 0.25;
export function cityGrievance(s: SimState) {
  const ad = s.rats.filter((r) => isAdult(r) && !r.isKing);
  if (!ad.length) return 0;
  return ad.filter((r) => grievance(r) > GRIEVANT).length / ad.length;
}

function startGathering(s: SimState, m: Mods, forced = false) {
  const k = king(s);
  const ad = s.rats.filter((r) => isAdult(r) && !r.isKing);
  if (!ad.length) return;
  const enfRatio = ad.filter((r) => r.caste === 'enforcer').length / ad.length;
  const avgFear = ad.reduce((a, r) => a + r.fear, 0) / ad.length;
  if (k && !forced && enfRatio > 0) {
    const p = clamp(enfRatio * 10 * avgFear * 2.2, 0, 0.85);
    if (nextRand(s) < p) {
      for (const r of ad) r.anger = Math.min(1, r.anger + 0.15);
      s.suppressedCount++; s.grievDays = 0;
      log(s, 'suppressed', 'ENFORCERS BREAK UP A GATHERING IN THE PLAZA. THE ANGER DOES NOT LEAVE.');
      return;
    }
  }
  const votes: number[] = [];
  const fif = s.king.feastInFamine;
  for (const r of ad) {
    const g = grievance(r);
    const x = 6 * (g - 0.2) - 2 * r.fear * enfRatio * 10 + 1.5 * fif + m.killBias + 0.4 * s.suppressedCount + (s.king.spared ? 0.4 : 0);
    votes.push(nextRand(s) < sigmoid(x) ? 1 : 0);
  }
  s.gathering = { startTick: s.tick, endTick: s.tick + TPD, voters: ad.map((r) => r.id), votes, kingAlive: !!k, suppressed: false, result: null };
  s.phase = 'gathering';
  log(s, 'gather', k ? 'THE PLAZA GATHERS. PEBBLES ARE COUNTED FOR THE KING\'S LIFE.' : 'THE PLAZA GATHERS. SOMEONE CLIMBS TO THE SILENT THRONE.');
}

function stepGathering(s: SimState, m: Mods) {
  const g = s.gathering!;
  for (const r of s.rats) if (!r.isKing && isAdult(r)) { r.room = lvl(s, R.plaza) ? R.plaza : R.throne; r.act = s.tick % 3 === 0 ? Act.Vote : Act.Protest; }
  if (s.tick < g.endTick) return;
  const kills = g.votes.reduce((a, v) => a + v, 0);
  const k = king(s);
  if (k) {
    if (kills > g.votes.length / 2) {
      g.result = 'kill';
      const hisLaws = s.reigns[s.reigns.length - 1]?.laws ?? [];
      killRat(s, k, 'executed by the plaza', true);
      for (const r of s.rats) { r.anger *= 0.5; r.fear = Math.min(1, r.fear + 0.2); }
      // the mob tears down the dead king's posters
      const torn = Object.keys(s.laws).filter((id) => hisLaws.includes(id));
      for (const id of torn) delete s.laws[id];
      s.heralds = [];
      if (torn.length) log(s, 'torn', `THE MOB RIPS DOWN HIS POSTERS: ${torn.map((id) => LAW_BY_ID[id].name).join(', ')}.`);
      s.gathering = null;
      crownSuccessor(s, m);
    } else {
      g.result = 'spare';
      s.king.spared = true; s.lastGatherSpared = true; s.grievDays = 0;
      for (const r of s.rats) { r.anger *= 0.7; r.despair *= 0.85; }
      log(s, 'spared', `THE PEBBLES SAY SPARE HIM: ${kills} TO KILL, ${g.votes.length - kills} TO SPARE.`);
      s.gathering = null; s.phase = 'reign';
    }
  } else {
    g.result = 'crown';
    log(s, 'discovered', 'THEY FIND THE KING ROTTING ON THE THRONE.');
    s.gathering = null;
    crownSuccessor(s, m);
  }
  s.lastResult = { result: g.result!, kills, total: g.votes.length, tick: s.tick };
}

// ---------- main step ----------
export function step(s: SimState): void {
  if (s.phase === 'dead') return;
  s.tick++;
  const dt = s.tick % TPD;
  const newDay = dt === 0;
  const m = computeMods(s);
  if (newDay) dailyUpdate(s, m);
  if (s.phase === 'founding') stepFounding(s);
  if (s.phase === 'gathering' && s.gathering) stepGathering(s, m);
  stepHeralds(s);
  if (s.phase === 'reign') kingThink(s, s.tick % 5 === 0 || s.cachedGriev === undefined ? (s.cachedGriev = cityGrievance(s)) : s.cachedGriev);
  tickRats(s, m, dt);
  if (s.phase !== 'founding' && dt === DUSK) { dusk(s, m); kingLearn(s); }
  // city death
  if (s.rats.length === 0) {
    s.phase = 'dead'; endReign(s, 'the city died');
    log(s, 'city_dead', 'THE LAST RAT IS DEAD. THE CITY IS SILENT FOREVER.');
  }
}

function tickRats(s: SimState, m: Mods, dt: number) {
  const founding = s.phase === 'founding';
  const gathering = s.phase === 'gathering';
  const working = !founding && dt >= 1 && dt <= m.workTicks;
  const night = dt > m.workTicks || dt === 0;
  const n = s.rats.length;
  const pups = s.rats.filter((r) => !isAdult(r));
  const density = n / housingCap(s, m);
  const crowdEx = Math.max(0, density - 0.85);
  const infected = s.rats.reduce((a, r) => a + (r.inf > 0 ? 1 : 0), 0);
  const looseCorpses = s.corpses.filter((c) => c.room !== R.graveyard).length;
  const elders = s.rats.filter(isElder).length;
  const wisdom = n ? Math.min(1, elders / Math.max(1, 0.05 * n)) : 0;
  const diseaseMort = m.diseaseMort * (1 - 0.25 * wisdom);
  const kingR = king(s);
  const reignFresh = s.reigns.length ? Math.max(0, 1 - (day(s) - s.reigns[s.reigns.length - 1].start) / 6) : 0;
  const nurses = s.rats.filter((r) => r.caste === 'nurse').length + (founding ? 1 : 0);
  const motherIds = new Set(pups.map((p) => p.mother));
  const mothers = s.rats.filter((r) => motherIds.has(r.id) && isAdult(r)).length;
  const nurseRatio = pups.length ? (nurses * 6 + mothers * 2.5) / pups.length : 1;
  const warmth = 0.5 + 0.5 * s.power;
  const fif = s.king.feastInFamine;
  const enfPresent = s.rats.some((r) => r.caste === 'enforcer');

  // --- work + production ---
  let haulOut = 0, wheelOut = 0, gnawOut = 0, digOut = 0, totalOut = 0, workerCount = 0;
  const casteSum: Record<string, number> = {}; const casteN: Record<string, number> = {};
  if (working) {
    for (const r of s.rats) {
      const child = !isAdult(r) && m.childLabour && r.age >= 3;
      if (r.isKing || (!isAdult(r) && !child)) continue;
      if (gathering && r.id % 3 === 0) continue; // a third march to the plaza; the rest keep the city fed
      let caste = r.caste;
      if (child) caste = 'digger';
      if (!CASTE_BASE[caste]) continue;
      if (r.inf > 2 && m.quarantine) continue;
      const fs = clamp(0.8 + 0.3 * r.sat, 0.8, 1), fr = clamp(0.55 + 0.6 * r.rest, 0, 1), fh = 0.5 + 0.5 * r.health;
      const fearShort = Math.max(0, r.fear - r.fearSlow);
      const mood = clamp(0.6 + 0.6 * r.content - 0.3 * r.despair + 0.25 * fearShort * 4, 0.55, 1.4);
      let o = CASTE_BASE[caste] * (0.5 + r.dil) * fs * fr * fh * mood * m.prod * (isElder(r) ? 0.6 : 1) * (child ? 0.5 : 1) * (1 - 0.4 * Math.min(1, r.shaking));
      if (m.ration === 'merit' && r.dil > 0.6) o *= 1.08;
      if (caste === 'wheel') o *= m.wheel;
      const perTick = o / BASE_WORK_TICKS;
      r.out = o; r.work += perTick;
      casteSum[caste] = (casteSum[caste] ?? 0) + o; casteN[caste] = (casteN[caste] ?? 0) + 1;
      totalOut += o; workerCount++;
      if (caste === 'hauler') haulOut += perTick; else if (caste === 'wheel') wheelOut += perTick; else if (caste === 'gnawer') gnawOut += perTick; else if (caste === 'digger') digOut += perTick;
      else if (caste === 'nurse') { /* nurses keep pups alive */ }
      r.rest = clamp01(r.rest - 0.06 * m.restDrain);
      r.act = caste === 'hauler' ? Act.Haul : caste === 'wheel' ? Act.Wheel : caste === 'gnawer' ? Act.Gnaw : caste === 'digger' ? Act.Dig : Act.Nurse;
      r.room = caste === 'hauler' ? (s.tick + r.id) % 6 < 3 ? SURFACE : R.granary : caste === 'wheel' || caste === 'gnawer' ? R.workshop : caste === 'digger' ? (s.digTarget >= 0 ? s.digTarget : R.warren) : R.nursery;
    }
    // efficiency EMA vs caste mean
    for (const r of s.rats) {
      const c = !isAdult(r) ? 'digger' : r.caste;
      if (!casteN[c] || r.isKing) continue;
      const mean = casteSum[c] / casteN[c];
      if (mean > 0 && r.out > 0) r.eff += ((r.out / mean) - r.eff) * 0.01;
    }
    const K = forageK(s, m);
    // a small, hungry burrow picks the drain clean more easily: fewer mouths competing for the same gutter (balance: keeps tiny cities from a certain death spiral)
    const lean = 1 + BAL.leanBoost * clamp01(1 - s.rats.length / BAL.leanPop);
    const income = lvl(s, R.entrance) ? lean * (K / BASE_WORK_TICKS) * (1 - Math.exp((-BAL.haulK * haulOut * BASE_WORK_TICKS) / K)) : 0; // no drain mouth, no forage
    const tithe = kingR ? m.tithe : s.phase === 'interregnum' ? Math.min(m.tithe, 0.15) : 0;
    s.king.titheAcc += income * tithe;
    let net = income * (1 - tithe);
    // the paw that forages eats first
    for (const r of s.rats) {
      if (net <= 0) break;
      if (r.act === Act.Haul && r.sat < 0.7) { const e = Math.min(0.06, 0.7 - r.sat, net); r.sat += e; net -= e; }
    }
    s.food += net;
    s.dayAcc.foodIn += income;
    s.scrap = Math.min(80, s.scrap + (lvl(s, R.workshop) ? gnawOut * 0.5 : 0) + (lvl(s, R.entrance) ? haulOut * 0.04 : 0));
    s.dayAcc.output += totalOut / BASE_WORK_TICKS; s.dayAcc.workerTicks += workerCount;
    // power (EMA)
    const need = Math.max(1, 0.06 * n);
    const p = lvl(s, R.workshop) ? Math.min(1, (wheelOut * BASE_WORK_TICKS) / need) : 0;
    s.power += (p - s.power) * 0.05;
    // digging
    if (s.digTarget >= 0) {
      const room = s.rooms[s.digTarget];
      if (room.level < 3) {
        room.dug = Math.min(DIG_COST[room.level], room.dug + digOut * m.dig);
        if (room.dug >= DIG_COST[room.level] && s.scrap >= SCRAP_COST[room.level]) {
          s.scrap -= SCRAP_COST[room.level]; room.level++; room.dug = 0;
          log(s, 'build', room.level === 1 ? `WORKERS DIG OUT THE ${ROOM_LABEL[room.kind]}.` : `THE ${ROOM_LABEL[room.kind]} IS WIDENED (LEVEL ${room.level}).`);
          s.digTarget = -1; chooseDigTarget(s, m);
        }
      }
    }
  } else if (!founding && !gathering) {
    s.power *= 0.995;
  }

  // --- feeding (granary allocation) ---
  const eaters = s.rats.filter((r) => !r.isKing || founding);
  let demand = 0;
  const dem: number[] = new Array(eaters.length);
  for (let i = 0; i < eaters.length; i++) {
    const r = eaters[i];
    const size = isAdult(r) ? 1 : 0.5;
    const d = r.sat < 0.95 ? Math.min(1 - r.sat, 0.12) * size : 0;
    dem[i] = d; demand += d * (r.caste === 'outcast' ? 1 : m.hoard);
  }
  const avail = Math.max(0, s.food);
  if (demand > 0) {
    if (avail >= demand) {
      for (let i = 0; i < eaters.length; i++) { const r = eaters[i]; const size = isAdult(r) ? 1 : 0.5; r.sat = clamp01(r.sat + dem[i] / size); }
      s.food -= demand;
    } else {
      // scarcity: 'equal' shares the hunger; otherwise the strong eat first (pecking order)
      if (m.ration === 'equal') {
        let dsum = 0;
        for (let i = 0; i < eaters.length; i++) dsum += dem[i];
        const f = dsum > 0 ? avail / dsum : 0;
        for (let i = 0; i < eaters.length; i++) { const r = eaters[i]; const size = isAdult(r) ? 1 : 0.5; r.sat = clamp01(r.sat + (dem[i] * f) / size); }
      } else {
        const order: [number, number][] = [];
        for (let i = 0; i < eaters.length; i++) {
          const r = eaters[i];
          if (dem[i] <= 0) continue;
          let wi = m.ration === 'merit' ? Math.pow(Math.max(0.05, r.eff), 3) * (isElder(r) || r.inf > 0 ? 0.3 : 1) : (0.5 + r.bold) * (r.caste === 'hauler' ? 1.6 : 1) * (isAdult(r) ? 1 : 0.6);
          if (r.caste === 'outcast') wi *= 0.3;
          order.push([wi * (0.75 + 0.5 * ((r.id * 2654435761 + s.tick * 40503) % 1000) / 1000), i]);
        }
        order.sort((a, b) => b[0] - a[0]);
        let left = avail;
        for (const [, i] of order) {
          if (left <= 0) break;
          const r = eaters[i]; const size = isAdult(r) ? 1 : 0.5;
          const h = r.caste === 'outcast' ? 1 : m.hoard;
          const take = Math.min(dem[i] * h, left);
          left -= take;
          r.sat = clamp01(r.sat + take / h / size);
        }
      }
      s.food = 0;
    }
  }
  // spoilage + cap
  s.food -= s.food * ((0.03 - 0.015 * s.power) / TPD);
  if (s.food > granaryCap(s)) s.food = granaryCap(s);

  // --- per-rat needs, emotions, health ---
  const dead: [Rat, string, boolean][] = [];
  const deathsRecent = s.history.length ? s.history[s.history.length - 1].deaths / Math.max(1, s.history[s.history.length - 1].pop) : 0;
  const birthsRecent = s.history.length ? s.history[s.history.length - 1].births / Math.max(1, s.history[s.history.length - 1].pop) : 0;
  const DT = 1 / TPD;
  for (const r of s.rats) {
    r.age += DT;
    r.sat = clamp01(r.sat - DT * (founding && r.founder ? 0.35 : 1));
    if (r.isKing && !founding) r.sat = clamp01(r.sat + DT * kingSatGain(s));
    r.satSlow += (r.sat - r.satSlow) * 0.012;
    if (night || r.isKing) r.rest = clamp01(r.rest + 0.25);
    r.social = clamp01(r.social + DT * ((0.6 + m.social) * r.soc + 0.3 - r.social) * 2);
    r.grief = Math.max(0, r.grief - DT * 0.3);
    if (r.immune > 0) r.immune -= DT;
    const cm = 0.6 + 0.8 * r.cred;
    const poverty = 1 - r.satSlow;
    const sick = r.inf > 0 ? 1 : 0;
    const isNurse = r.caste === 'nurse';
    // targets
    const tContent = clamp01(0.2 + 0.35 * r.sat + 0.15 * r.rest + 0.15 * r.social + 0.1 * s.power + m.content * cm - 0.3 * sick - 0.25 * crowdEx - 0.2 * r.grief);
    const tHope = clamp01(0.35 + 1.5 * birthsRecent - 2 * deathsRecent + m.hope * cm + 0.1 * s.power - 0.2 * poverty);
    const tFear = clamp01(0.04 + m.fear + (enfPresent ? 0.05 : 0) + 3 * deathsRecent);
    const tAnger = clamp01(0.05 + 0.6 * poverty + m.anger + 0.35 * fif + 0.15 * r.grief + (m.purge || 'public_punishment' in s.laws ? 0.15 * r.bold : 0));
    const tDespair = clamp01(0.05 + 0.45 * poverty + m.despair + (isNurse ? m.nurseDespair : 0) + 0.25 * r.fearSlow + 0.3 * r.grief + 0.3 * crowdEx + (r.social < 0.3 ? 0.12 : 0));
    let tLoyal = clamp01(0.45 + m.loyalty * cm - 0.35 * poverty + 0.25 * reignFresh - 0.25 * fif);
    if (s.king.spared) tLoyal = Math.min(tLoyal, 0.4);
    if (!kingR) tLoyal = 0.2;
    r.content += (tContent - r.content) * EMO_K;
    r.hope += (tHope - r.hope) * EMO_K;
    r.fear += (tFear - r.fear) * EMO_K * 2;
    r.fearSlow += (r.fear - r.fearSlow) * EMO_K * 0.5;
    r.anger += (tAnger - r.anger) * EMO_K;
    r.despair += (tDespair - r.despair) * EMO_K;
    r.loyalty += (tLoyal - r.loyalty) * EMO_K;
    // health
    let dh = 0;
    if (r.sat < 0.15) dh -= 0.16; else if (r.sat > 0.5) dh += 0.08 * (0.35 + Math.min(1, r.rest));
    // overwork wears rats down but does not by itself grind them below a floor
    let wear = m.healthDay;
    if (m.exhaustion && isAdult(r) && !r.isKing && r.rest < 0.25) wear -= 0.05;
    if (wear < 0 && r.health > 0.45) dh += wear * Math.min(1, (r.health - 0.45) / 0.25);
    else if (wear > 0) dh += wear;
    if (r.inf > 0) dh -= 0.12;
    if (r.shaking > 0) dh -= 0.12 * r.shaking;
    if (r.caste === 'wheel' && m.heartFail) dh -= 0.03;
    if (isElder(r)) dh -= 0.02;
    if (r.isKing && !founding) dh += kingHealth(s);
    const maxH = r.age > r.life * 0.75 ? clamp01(1 - (r.age - r.life * 0.75) / (r.life * 0.4)) + 0.2 : 1;
    r.health = Math.min(maxH, clamp01(r.health + dh * DT));
    // disease
    if (r.inf > 0) {
      r.inf += DT;
      if (nextRand(s) < (0.05 * diseaseMort / (0.5 + r.con)) * DT) { dead.push([r, 'plague', false]); continue; }
      if (r.inf >= 4) { r.inf = 0; r.immune = 12; }
    } else if (r.immune <= 0 && n > 1) {
      const p = (0.9 * m.beta * (infected / n) * (0.5 + density) + 0.0015 * looseCorpses * m.corpseRot) * DT;
      if (nextRand(s) < p) r.inf = DT;
    }
    // pregnancy
    if (r.preg > 0) {
      r.preg -= DT;
      if (r.preg <= 0) { r.preg = 0; birth(s, r); }
    }
    // pups
    if (!isAdult(r)) {
      let pm = 0.006 + 0.1 * Math.max(0, 1 - nurseRatio) + 0.05 * (1 - warmth) + (m.childLabour && r.age >= 3 ? m.childDeath : 0);
      if (!lvl(s, R.nursery)) pm += 0.05;
      if (nextRand(s) < pm * DT) { dead.push([r, m.childLabour && r.age >= 3 ? 'collapse in the tunnels' : 'neglect', false]); continue; }
      if (r.age + DT >= ADULT_AGE && r.age < ADULT_AGE + DT) { /* matures next tick */ }
    }
    // death checks
    if (r.health <= 0) { dead.push([r, r.sat < 0.15 ? 'starvation' : r.shaking > 0 ? 'the shaking sickness' : r.inf > 0 ? 'plague' : 'exhaustion', false]); continue; }
    if (r.age > r.life && nextRand(s) < 0.35 * DT) { dead.push([r, 'old age', false]); continue; }
    // activity when not working
    if (!working || r.isKing || !isAdult(r)) setIdleActivity(s, r, night, m);
  }
  for (const [r, cause, v] of dead) killRat(s, r, cause, v);
  s.peakPop = Math.max(s.peakPop, s.rats.length);

  // corpses
  for (let i = s.corpses.length - 1; i >= 0; i--) {
    const c = s.corpses[i];
    c.age += DT;
    if (c.kind === 'king') { s.king.corpseAge = c.age; continue; }
    if (m.corpseFood && c.age > 0.3) { s.food = Math.min(granaryCap(s), s.food + (c.kind === 'pup' ? 1.5 : 4)); s.corpses.splice(i, 1); continue; }
    if (m.corpseRot === 0 && c.age > 0.5) { s.corpses.splice(i, 1); continue; }
    if (lvl(s, R.graveyard) && c.room !== R.graveyard && c.age > 0.6) c.room = R.graveyard;
    if (c.age > (c.room === R.graveyard ? 6 : 10)) s.corpses.splice(i, 1);
  }
}

function setIdleActivity(s: SimState, r: Rat, night: boolean, m: Mods) {
  if (s.phase === 'gathering' && isAdult(r) && !r.isKing) return;
  if (r.isKing) {
    r.room = R.throne;
    const pressing = s.mind && (s.mind.reaching || s.tick - s.mind.lastPress < 3);
    r.act = s.phase === 'founding' ? r.act : pressing && !s.king.dying ? Act.Press : r.inf > 0 ? Act.Sick : s.king.dying || s.king.plate === 'empty' ? Act.Starve : s.king.plate === 'feast' ? Act.Feast : s.king.plate === 'scraps' ? Act.Scraps : night ? Act.Sleep : Act.Throne;
    return;
  }
  if (r.founder && s.phase === 'founding') return;
  if (s.phase === 'founding') { if (r.preg > 0 || s.rats.some((x) => !isAdult(x))) { r.room = R.nursery; r.act = Act.Nurse; } else r.act = Act.Idle; return; }
  if (!isAdult(r)) { r.room = R.nursery; r.act = night ? Act.Sleep : (r.id + day(s)) % 3 === 0 ? Act.Play : Act.Suckle; return; }
  if (r.inf > 0) { r.room = m.quarantine && lvl(s, R.graveyard) ? R.graveyard : lvl(s, R.warren) ? R.warren : R.entrance; r.act = Act.Sick; return; }
  if (r.shaking > 0.3) { r.act = Act.Shake; return; }
  if (r.caste === 'outcast') { r.room = lvl(s, R.slum) ? R.slum : R.entrance; r.act = (r.id + s.tick) % 5 === 0 ? Act.Beg : Act.Idle; return; }
  if (r.caste === 'enforcer') { r.room = lvl(s, R.barracks) && night ? R.barracks : (r.id % 2 ? R.plaza : R.throne); r.act = night ? Act.Sleep : Act.Patrol; return; }
  if (r.caste === 'keeper') { r.room = lvl(s, R.shrine) ? R.shrine : R.throne; r.act = night ? Act.Sleep : Act.Pray; return; }
  if (night) { r.room = lvl(s, R.deepwarren) && r.id % 2 ? R.deepwarren : lvl(s, R.warren) ? R.warren : R.entrance; r.act = Act.Sleep; return; }
  if (r.sat < 0.15) { r.act = Act.Starve; return; }
  if (r.caste === 'nurse') { r.room = R.nursery; r.act = Act.Nurse; return; }
  if (isElder(r)) { r.room = lvl(s, R.warren) ? R.warren : R.entrance; r.act = Act.Teach; return; }
  r.act = m.feastToday ? Act.Cheer : r.fear > 0.5 ? Act.Cower : Act.Idle;
}

function kingSatGain(s: SimState) {
  switch (s.king.plate) { case 'feast': return 1.3; case 'meal': return 1.0; case 'scraps': return 0.6; case 'empty': return 0.15; default: return 1; }
}
function kingHealth(s: SimState) {
  if (s.king.dying) return -0.45;
  switch (s.king.plate) { case 'feast': return 0.05; case 'meal': return 0.02; case 'scraps': return -0.03; case 'empty': return -0.12; default: return 0; }
}

function birth(s: SimState, mother: Rat) {
  const nPups = Math.max(1, Math.round((2 + nextRand(s) * 3.5) * (0.5 + 0.5 * mother.health) * (0.6 + 0.4 * mother.sat)));
  const father = s.rats.find((r) => r.id === mother.father);
  for (let i = 0; i < nPups; i++) {
    const mix = (a: number, b: number) => clamp01((a + b) / 2 + (nextRand(s) - 0.5) * 0.3);
    const p = newRat(s, { mother: mother.id, room: R.nursery, sat: 0.8 });
    if (father) { p.dil = mix(mother.dil, father.dil); p.bold = mix(mother.bold, father.bold); p.cred = mix(mother.cred, father.cred); p.soc = mix(mother.soc, father.soc); p.con = mix(mother.con, father.con); p.life = 50 + 18 * p.con + 8 * nextRand(s); }
    s.rats.push(p);
  }
  mother.lastLitter = day(s); mother.litters++;
  s.totalBorn += nPups; s.dayAcc.births += nPups;
  log(s, 'birth', `${mother.name} BIRTHS ${nPups} PUPS IN THE NURSERY.`);
  if (s.phase === 'founding') crownFounder(s);
}

function dusk(s: SimState, m: Mods) {
  const k = king(s);
  let acc = s.king.titheAcc;
  s.king.titheAcc = 0;
  if (m.guard) { acc *= 0.8; s.food = Math.max(0, s.food - 0.04 * s.rats.length); }
  if (!k) { s.king.rotOnPlate += acc; return; }
  const ad = s.rats.filter((r) => !r.isKing);
  const pop = s.rats.length;
  s.king.appetite = (1.2 + 0.035 * pop) * (1 + 0.22 * s.king.luxury);
  let plate = acc;
  if (plate < s.king.appetite && s.king.stash > 0) { const top = Math.min(s.king.stash, s.king.appetite - plate); s.king.stash -= top; plate += top; }
  const ratio = plate / s.king.appetite;
  s.king.plateRatio = ratio;
  s.king.lastPlateTick = s.tick;
  const prevPlate = s.king.plate;
  s.king.plate = ratio >= 1.5 ? 'feast' : ratio >= 1 ? 'meal' : ratio >= 0.4 ? 'scraps' : 'empty';
  if (s.king.plate === 'feast') { s.king.luxury = Math.min(10, s.king.luxury + 1); s.king.fat = Math.min(1, s.king.fat + 0.2); }
  if (s.king.plate === 'scraps') { s.king.luxury = Math.max(0, s.king.luxury - 1); s.king.fat = Math.max(0, s.king.fat - 0.1); }
  if (s.king.plate === 'empty') { s.king.emptyDays++; s.king.fat = Math.max(0, s.king.fat - 0.25); s.king.luxury = Math.max(0, s.king.luxury - 1); } else { s.king.emptyDays = 0; s.king.dying = false; }
  if (s.king.emptyDays >= 3 && !s.king.dying) { s.king.dying = true; log(s, 'king_dying', 'THE KING\'S RIBS SHOW THROUGH HIS FUR. HE IS DYING OF HUNGER.'); }
  const rg = s.reigns[s.reigns.length - 1];
  if (rg) rg.peakLuxury = Math.max(rg.peakLuxury, s.king.luxury);
  // workers witness the plate
  const avgSat = ad.length ? ad.reduce((a, r) => a + r.satSlow, 0) / ad.length : 1;
  if (s.king.plate === 'feast' && avgSat < 0.55) {
    s.king.feastInFamine = Math.min(1, s.king.feastInFamine + 0.5);
    for (const r of ad) if (nextRand(s) < 0.6) r.anger = Math.min(1, r.anger + 0.2);
    log(s, 'feast_famine', 'THE KING FEASTS WHILE THE CITY STARVES. THEY ALL SAW IT.');
  } else s.king.feastInFamine = Math.max(0, s.king.feastInFamine - 0.25);
  if (prevPlate !== s.king.plate) log(s, 'plate', `THE KING'S PLATE: ${s.king.plate.toUpperCase()}.`);
}

function dailyUpdate(s: SimState, m: Mods) {
  const d = day(s);
  // record yesterday
  const ad = s.rats.filter((r) => isAdult(r) && !r.isKing);
  const avg = (f: (r: Rat) => number) => (ad.length ? ad.reduce((a, r) => a + f(r), 0) / ad.length : 0);
  const st: DayStat = {
    day: d - 1, pop: s.rats.length, adults: ad.length, pups: s.rats.filter((r) => !isAdult(r)).length, food: s.food,
    foodIn: s.dayAcc.foodIn, births: s.dayAcc.births, deaths: s.dayAcc.deaths, content: avg((r) => r.content), anger: avg((r) => r.anger),
    despair: avg((r) => r.despair), loyalty: avg((r) => r.loyalty), fear: avg((r) => r.fear), grievance: cityGrievance(s),
    prod: s.dayAcc.workerTicks ? (s.dayAcc.output * BASE_WORK_TICKS) / s.dayAcc.workerTicks : 0,
    plate: s.king.plateRatio, sick: s.rats.filter((r) => r.inf > 0).length, king: s.king.id >= 0 ? 1 : 0, luxury: s.king.luxury,
    health: avg((r) => r.health), scrap: s.scrap,
  };
  s.history.push(st);
  if (s.history.length > 400) s.history.splice(0, s.history.length - 400);
  const rg = s.reigns[s.reigns.length - 1];
  if (rg && rg.end === null) { rg.pop.push(s.rats.length); if (rg.pop.length > 200) rg.pop.splice(0, rg.pop.length - 200); }
  s.dayAcc = { births: 0, deaths: 0, foodIn: 0, output: 0, workerTicks: 0 };
  if (s.phase === 'founding') return;

  // mature pups into workers, outcasts drift, laws with daily effects
  chooseDigTarget(s, m);
  // outcasts
  for (const r of ad) {
    if (r.caste === 'outcast') {
      if (r.loyalty > 0.4 && r.despair < 0.3 && nextRand(s) < 0.1) r.caste = 'none';
      else { const st = Math.min(s.food, 0.3); s.food -= st; r.sat = clamp01(r.sat + st); }
    } else if ((r.loyalty < 0.12 && r.despair > 0.55 && nextRand(s) < 0.1) || (m.outcastBlackMarket && r.bold > 0.6 && nextRand(s) < 0.03)) {
      r.caste = 'outcast';
    }
  }
  if (m.prophet && d % 2 === 0) {
    const f = ad.find((r) => r.caste !== 'outcast' && r.caste !== 'enforcer' && r.hope < 0.35);
    if (f) { f.caste = 'outcast'; log(s, 'prophet', `${f.name} FOLLOWS THE PROPHET INTO THE SLUM.`); }
  }
  if (m.purge) {
    const outs = ad.filter((r) => r.caste === 'outcast').slice(0, 3);
    for (const o of outs) killRat(s, o, 'the purge', true);
    if (outs.length) { for (const r of ad) if (r.bold > 0.6) r.anger = Math.min(1, r.anger + 0.1); log(s, 'purge', `ENFORCERS CLEAR THE SLUM. ${outs.length} DEAD.`); }
  }
  if ('public_punishment' in s.laws) {
    const w = ad.filter((r) => r.caste !== 'enforcer' && r.out > 0).sort((a, b) => a.out - b.out)[0];
    if (w) {
      w.health -= 0.35;
      for (const r of ad) { r.fear = Math.min(1, r.fear + 0.12); r.despair = Math.min(1, r.despair + 0.05); if (r.bold > 0.6) r.anger = Math.min(1, r.anger + 0.08); }
      if (w.health <= 0) killRat(s, w, 'a public beating', true);
      log(s, 'punish', `${w.name} IS BEATEN IN THE PLAZA FOR IDLENESS.`);
    }
  }
  if (m.elderExile) {
    const old = s.rats.filter((r) => isElder(r) && !r.isKing);
    for (const o of old) { s.rats.splice(s.rats.indexOf(o), 1); s.exiled++; }
    if (old.length) log(s, 'exile', `${old.length} ELDERS ARE DRIVEN INTO THE DEEP SEWER.`);
  }
  if (m.heartFail) for (const r of ad.filter((x) => x.caste === 'wheel')) if (nextRand(s) < m.heartFail * 3) { killRat(s, r, 'a burst heart on the wheel'); log(s, 'death', `${r.name}'S HEART BURSTS ON THE WHEEL.`); }
  if (m.fights) for (const r of ad) if (nextRand(s) < m.fights * 4) { r.health -= 0.5; if (r.health <= 0) killRat(s, r, 'a mating fight', true); }
  if (m.shaking) for (const r of s.rats) if (nextRand(s) < 0.06) r.shaking = Math.min(1.5, r.shaking + 0.3);
  if (m.feastToday) { s.food *= 0.7; log(s, 'feast', 'A FEAST DAY. THE GRANARY IS GUTTED FOR SONG.'); }
  // fertility (once a day)
  const males = ad.filter((r) => r.sex === 0 && !isElder(r) && r.health > 0.3);
  const pupsN = s.rats.length - ad.length - (king(s) ? 1 : 0);
  const pop = s.rats.length;
  const pending = s.rats.reduce((a, r) => a + (r.preg > 0 ? 3.5 : 0), 0);
  const density = (pop + pending) / housingCap(s, m);
  const consD = s.rats.reduce((a, r) => a + (isAdult(r) ? 1 : 0.5), 0);
  const lastD = s.history[s.history.length - 1];
  const bal = lastD && lastD.foodIn > 0 ? lastD.foodIn / Math.max(1, consD) : 1.2;
  const foodF = clamp(s.food / Math.max(1, pop) / 2, 0.1, 1) * clamp((bal - 0.9) / 0.35, 0.05, 1);
  const nurseryF = lvl(s, R.nursery) ? clamp(1 - (pupsN + pending) / nurseryCap(s), 0, 1) : 0.1;
  const crowdF = density < 0.8 ? 1 : Math.exp(-4 * (density - 0.8));
  const effs = ad.map((r) => r.eff).sort((a, b) => a - b);
  const medEff = effs.length ? effs[Math.floor(effs.length / 2)] : 1;
  if (males.length) for (const f of ad) {
    if (f.sex !== 1 || f.preg > 0 || isElder(f) || f.caste === 'outcast' || d - f.lastLitter < 4 || f.sat < 0.35 || f.health < 0.4) continue;
    if ('litter_limit' in s.laws && f.litters >= 1) continue;
    if (m.lottery && f.eff < medEff) continue;
    const stressF = clamp(1.2 - f.despair - 0.5 * f.fear, 0.2, 1);
    const p = 0.22 * foodF * nurseryF * crowdF * stressF * m.fert;
    if (nextRand(s) < p) {
      const cand = m.lottery ? males.filter((x) => x.eff >= medEff) : males;
      const mate = cand[Math.floor(nextRand(s) * cand.length)] ?? males[0];
      f.preg = 2; f.father = mate.id;
    }
  }
  assignCastes(s, m);
  // strays drift in from the street when a small city has food to spare
  if (pop > 0 && pop < 24 && s.food > pop * 1.5 && nextRand(s) < 0.3) {
    const k = 1 + Math.floor(nextRand(s) * 2);
    for (let i = 0; i < k; i++) s.rats.push(newRat(s, { age: ADULT_AGE + 2 + nextRand(s) * 8, room: R.entrance, loyalty: 0.5 }));
    log(s, 'stray', `${k === 1 ? 'A STRAY' : 'TWO STRAYS'} SMELL THE GRANARY AND CRAWL IN FROM THE STREET.`);
  }
  // hazards
  if (pop > 4) {
    const big = Math.min(1, pop / 30);
    if (nextRand(s) < 0.07 * m.predator * (0.3 + 0.7 * big)) {
      const victims = s.rats.filter((r) => r.caste === 'hauler' || r.room === SURFACE || r.room === R.entrance);
      const k = Math.min(victims.length, 1 + Math.floor(nextRand(s) * (1 + 2 * big)));
      for (let i = 0; i < k; i++) killRat(s, victims[i], 'a cat', true);
      if (k) log(s, 'cat', `A CAT TOOK ${k} RAT${k > 1 ? 'S' : ''} AT THE DRAIN.`);
    }
    if (nextRand(s) < 0.03 * m.predator * (0.3 + 0.7 * big)) {
      const v = s.rats.find((r) => r.caste === 'hauler');
      if (v) { killRat(s, v, 'a human boot', true); log(s, 'boot', `A BOOT CRUSHED ${v.name} ON THE STREET.`); }
    }
    if (m.drone < 0) s.droneAttention = 0; else s.droneAttention = Math.max(0, s.droneAttention + m.drone - 0.01);
    if (s.droneAttention >= 1) {
      const h = s.rats.filter((r) => r.caste === 'hauler').sort((a, b) => b.bold - a.bold);
      const k = Math.max(1, Math.round(h.length * (0.25 + nextRand(s) * 0.15)));
      for (let i = 0; i < Math.min(k, h.length); i++) killRat(s, h[i], 'exterminator gas', true);
      s.droneAttention = 0.3;
      log(s, 'gas', `AN EXTERMINATOR DRONE GASSED THE GRATE. ${k} HAULERS CHOKED.`);
    }
    const pIndex = 0.035 * (pop < 15 ? 0.3 : 1) + ('raid_surface' in s.laws ? 0.04 : 0) + ('seal_grates' in s.laws ? 0.03 : 0);
    if (nextRand(s) < pIndex && !s.rats.some((r) => r.inf > 0)) {
      const r = s.rats[Math.floor(nextRand(s) * s.rats.length)];
      if (r && r.immune <= 0) { r.inf = 0.05; log(s, 'plague', `${r.name} COMES BACK FROM THE STREET COUGHING BLOOD.`); }
    }
  }
  // rebellion check
  if (s.phase === 'reign' || s.phase === 'interregnum') {
    const share = cityGrievance(s);
    if (share >= m.gatherThreshold) s.grievDays++; else s.grievDays = 0;
    const discovered = s.phase === 'interregnum' && s.king.deadSinceTick >= 0 && s.tick - s.king.deadSinceTick >= 5 * TPD;
    const cur = s.reigns[s.reigns.length - 1];
    const grace = s.phase === 'reign' && cur && cur.end === null && d - cur.start < 7; // the plaza gives a new king a week
    if ((s.grievDays >= m.gatherDays && !grace) || discovered) startGathering(s, m);
    if (share >= 0.25 && s.grievDays === 1) log(s, 'mutter', 'MUTTERING IN THE TUNNELS. PAWS CLENCH AROUND PEBBLES.');
  }
  if (pop > 0 && s.food < pop * 0.3 && d % 2 === 0) log(s, 'famine', 'THE GRANARY IS NEARLY EMPTY.');
}

// ---------- snapshot for renderer/UI ----------
export interface Snapshot {
  tick: number; day: number; dayTick: number; phase: SimState['phase'];
  n: number; ids: Int32Array; room: Int8Array; act: Uint8Array; flags: Uint8Array; // flags: bit0 pup, bit1 female, bit2 sick, bit3 starving, bit4 king, bit5 elder, bit6 enforcer, bit7 outcast
  corpses: { id: number; room: number; stage: number; violent: boolean; king: boolean; pup: boolean }[];
  items: { id: number; kind: string; x: number; room: number }[];
  rooms: { level: number; dug: number; cost: number }[];
  stats: { pop: number; food: number; foodCap: number; scrap: number; mood: number; anger: number; grievance: number; loyalty: number; power: number; sick: number; pups: number; dead: number; peak: number; despair: number; fear: number; health: number; fat: number };
  king: { id: number; name: string; alive: boolean; plate: string; ratio: number; luxury: number; emptyDays: number; dying: boolean; spared: boolean; age: number; health: number; reign: number };
  laws: { id: string; state: 'none' | 'spreading' | 'force' | 'repealing'; adopt: number; avail: boolean; locked: boolean; why: string; cooldown: number }[];
  activeCount: number;
  heralds: { id: number; law: string; kind: string; room: number; nextRoom: number; t: number; step: number; total: number }[];
  posters: Record<number, string[]>; // room → law ids posted there
  mind: { thought: string; traits: string[]; reaching: string | null; reachingKind: string | null; plateHist: number[]; lastPress: number; lastPressed: string | null } | null;
  founder: SimState['founder'] & { objectiveText: string; foundCost: number[] };
  gathering: { kills: number; spares: number; total: number; counted: number; kingAlive: boolean } | null;
  events: SimState['events']; eventSeq: number;
  lastResult: SimState['lastResult'];
  digTarget: number;
  founderId: number;
  /** exterminator drone attention 0..1 (≥1 = gassing) */
  drone: number;
}


export function snapshot(s: SimState): Snapshot {
  const n = s.rats.length;
  const ids = new Int32Array(n), room = new Int8Array(n), act = new Uint8Array(n), flags = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = s.rats[i];
    ids[i] = r.id; room[i] = r.room; act[i] = r.act;
    flags[i] = (isAdult(r) ? 0 : 1) | (r.sex ? 2 : 0) | (r.inf > 0 ? 4 : 0) | (r.sat < 0.15 ? 8 : 0) | (r.isKing ? 16 : 0) | (isElder(r) ? 32 : 0) | (r.caste === 'enforcer' ? 64 : 0) | (r.caste === 'outcast' ? 128 : 0);
  }
  const ad = s.rats.filter((r) => isAdult(r) && !r.isKing);
  const avg = (f: (r: Rat) => number) => (ad.length ? ad.reduce((a, r) => a + f(r), 0) / ad.length : 0);
  const k = king(s);
  const rg = s.reigns[s.reigns.length - 1];
  const g = s.gathering;
  let gs: Snapshot['gathering'] = null;
  if (g) {
    const frac = clamp01((s.tick - g.startTick) / (g.endTick - g.startTick) * 1.15);
    const counted = Math.floor(g.votes.length * frac);
    const kills = g.votes.slice(0, counted).reduce((a, v) => a + v, 0);
    gs = { kills, spares: counted - kills, total: g.votes.length, counted, kingAlive: g.kingAlive };
  }
  return {
    tick: s.tick, day: day(s), dayTick: s.tick % TPD, phase: s.phase, n, ids, room, act, flags,
    corpses: s.corpses.map((c) => ({ id: c.id, room: c.room, stage: c.age < 2 ? 0 : c.age < 5 ? 1 : 2, violent: c.violent, king: c.kind === 'king', pup: c.kind === 'pup' })),
    items: s.items.map((i) => ({ id: i.id, kind: i.kind, x: i.x, room: i.room })),
    rooms: s.rooms.map((r, i) => ({ level: r.level, dug: r.dug, cost: s.phase === 'founding' ? FOUND_DIG[i] ?? 0 : DIG_COST[Math.min(2, r.level)] })),
    stats: {
      pop: n, food: s.food, foodCap: granaryCap(s), scrap: s.scrap, mood: avg((r) => r.content), anger: avg((r) => r.anger), grievance: cityGrievance(s),
      loyalty: avg((r) => r.loyalty), power: s.power, sick: s.rats.filter((r) => r.inf > 0).length, pups: s.rats.filter((r) => !isAdult(r)).length,
      dead: s.totalDead, peak: s.peakPop, despair: avg((r) => r.despair), fear: avg((r) => r.fear), health: avg((r) => r.health), fat: s.king.fat,
    },
    king: { id: s.king.id, name: rg?.name ?? '', alive: !!k, plate: s.king.plate, ratio: s.king.plateRatio, luxury: s.king.luxury, emptyDays: s.king.emptyDays, dying: s.king.dying, spared: s.king.spared, age: k?.age ?? 0, health: k?.health ?? 0, reign: s.king.reignNo },
    laws: LAWS.map((l) => {
      const a = lawAvailable(s, l.id); const st = s.laws[l.id];
      const state = !st ? 'none' : st.repealing ? 'repealing' : st.adopt < 1 ? 'spreading' : 'force';
      return { id: l.id, state, adopt: st?.adopt ?? 0, avail: a.ok, locked: s.peakPop < TIER_POP_[l.tier], why: a.why, cooldown: Math.max(0, (s.cooldown[l.id] ?? 0) - s.tick) };
    }),
    activeCount: Object.values(s.laws).filter((l) => !l.repealing).length,
    heralds: s.heralds.map((h) => ({ id: h.id, law: h.law, kind: h.kind, room: h.t < 0 || h.step === 0 ? (h.step === 0 ? R.throne : h.path[h.step - 1]) : h.path[h.step - 1], nextRoom: h.path[h.step] ?? R.throne, t: Math.max(0, h.t), step: h.step, total: h.path.length })),
    posters: (() => { const p: Record<number, string[]> = {}; for (const [id, l] of Object.entries(s.laws)) for (const r of l.reached) (p[r] ??= []).push(id); return p; })(),
    mind: s.mind ? { thought: s.mind.thought, traits: s.mind.traits, reaching: s.mind.reaching, reachingKind: s.mind.reachingKind, plateHist: s.mind.plateHist.slice(-7), lastPress: s.mind.lastPress, lastPressed: s.mind.pressLog[s.mind.pressLog.length - 1]?.id ?? null } : null,
    founder: { ...s.founder, objectiveText: OBJECTIVES[s.founder.objective] ?? '', foundCost: [FOUND_SCRAP[R.throne]!, FOUND_SCRAP[R.granary]!, FOUND_SCRAP[R.nursery]!] },
    gathering: gs, events: s.events.slice(-12), eventSeq: s.eventSeq, lastResult: s.lastResult, digTarget: s.digTarget, founderId: s.rats.find((r) => r.founder)?.id ?? -1, drone: s.droneAttention,
  };
}

// ---------- inspection (the god's eye) ----------
export interface RatInfo {
  id: number; name: string; sex: string; age: number; job: string; room: string; isKing: boolean;
  hunger: number; health: number; rest: number; mood: number; fear: number; anger: number; loyalty: number; despair: number;
  thought: string; opinion: string; opinionLevel: number; family: { rel: string; name: string; id: number }[]; sick: boolean; pregnant: boolean; eff: number; traits: string[];
}
const JOB: Record<string, string> = { none: 'IDLER', digger: 'DIGGER', hauler: 'FORAGER', wheel: 'WHEEL RUNNER', gnawer: 'GNAWER', nurse: 'NURSE', enforcer: 'ENFORCER', outcast: 'OUTCAST', keeper: 'SHRINE KEEPER' };
export function inspectRat(s: SimState, id: number): RatInfo | null {
  const r = s.rats.find((x) => x.id === id);
  if (!r) return null;
  const g = grievance(r);
  const lvlOp = r.isKing ? 4 : g > 0.45 ? 0 : g > GRIEVANT ? 1 : r.loyalty > 0.75 ? 4 : r.loyalty > 0.5 ? 3 : 2;
  const opinion = r.isKing ? 'HE IS THE KING' : ['WANTS HIM DEAD', 'RESENTS HIM', 'INDIFFERENT', 'LOYAL', 'ADORES HIM'][lvlOp];
  const fam: RatInfo['family'] = [];
  const mom = s.rats.find((x) => x.id === r.mother); if (mom) fam.push({ rel: 'MOTHER', name: mom.name, id: mom.id });
  const mate = s.rats.find((x) => x.id === r.father && r.preg > 0) ?? s.rats.find((x) => x.father === r.id && x.preg > 0); if (mate) fam.push({ rel: 'MATE', name: mate.name, id: mate.id });
  for (const c of s.rats.filter((x) => x.mother === r.id).slice(0, 4)) fam.push({ rel: isAdult(c) ? 'CHILD' : 'PUP', name: c.name, id: c.id });
  const roomName = r.room === SURFACE ? 'THE STREET' : ROOM_LABEL[ROOM_KINDS[r.room]] ?? '';
  const tr: string[] = [];
  if (r.dil > 0.7) tr.push('DILIGENT'); else if (r.dil < 0.25) tr.push('LAZY');
  if (r.bold > 0.7) tr.push('BOLD'); else if (r.bold < 0.25) tr.push('TIMID');
  if (r.cred > 0.7) tr.push('CREDULOUS'); if (r.soc > 0.7) tr.push('SOCIABLE'); if (r.con > 0.75) tr.push('HARDY');
  return {
    id: r.id, name: r.name, sex: r.sex ? 'FEMALE' : 'MALE', age: Math.floor(r.age), job: r.isKing ? 'KING' : !isAdult(r) ? 'PUP' : r.founder && s.phase === 'founding' ? 'FOUNDER' : JOB[r.caste] ?? 'IDLER',
    room: roomName, isKing: r.isKing, hunger: 1 - r.sat, health: r.health, rest: r.rest, mood: r.content, fear: r.fear, anger: r.anger, loyalty: r.loyalty, despair: r.despair,
    thought: r.isKing ? (s.mind?.thought ?? '...') : ratThought(s, r, g), opinion, opinionLevel: lvlOp, family: fam, sick: r.inf > 0, pregnant: r.preg > 0, eff: r.eff, traits: tr,
  };
}

function ratThought(s: SimState, r: Rat, g: number): string {
  if (s.phase === 'founding') return r.founder ? `I MUST ${(OBJECTIVES[s.founder.objective] ?? 'SURVIVE').toLowerCase()}.`.toUpperCase() : 'THIS HOLE SMELLS SAFE.';
  if (!isAdult(r)) return r.sat < 0.3 ? 'HUNGRY. HUNGRY. WHERE IS MOTHER?' : 'WARM PILE. SQUEAK.';
  if (s.phase === 'gathering') return g > GRIEVANT ? 'A PEBBLE FOR DEATH. HE HAS EATEN ENOUGH.' : 'I WILL SPARE HIM. WHO ELSE WOULD RULE?';
  if (r.inf > 0) return 'MY BLOOD IS HOT. THE TUNNEL SPINS.';
  if (r.shaking > 0.3) return 'MY PAWS WILL NOT STOP SHAKING.';
  if (r.grief > 0.5) return 'THEY DRAGGED MY KIN TO THE PIT.';
  if (r.sat < 0.2) return s.king.plate === 'feast' ? 'THE KING FEASTS WHILE MY BELLY EATS ITSELF.' : 'NOTHING IN THE GRANARY. NOTHING.';
  const h = s.heralds.find((x) => x.path.slice(0, x.step).includes(r.room));
  if (h) return `A NEW POSTER: ${LAW_BY_ID[h.law].name}. WHAT NOW?`;
  if (r.fear > 0.55) return 'KEEP YOUR HEAD DOWN. THEY ARE WATCHING.';
  if (r.anger > 0.5) return 'ONE DAY WE WILL COUNT PEBBLES FOR HIM.';
  if (r.rest < 0.2) return 'MY LEGS ARE STONE. LET ME SLEEP.';
  if (r.loyalty > 0.8) return 'LONG LIVE THE KING. HE KNOWS BEST.';
  if (r.content > 0.65) return 'FULL BELLY, WARM NEST. LIFE IS GOOD.';
  if (r.caste === 'hauler') return 'THE STREET IS WIDE AND FULL OF BOOTS.';
  if (r.caste === 'digger') return 'DIG. DIG. THE KING WANTS MORE ROOM.';
  if (r.caste === 'wheel') return 'ROUND AND ROUND. THE LIGHTS STAY ON.';
  return 'ANOTHER DAY UNDER THE STREET.';
}

/** Dynasty summary for the chronicle / experiment-over screen. */
export function chronicle(s: SimState) {
  return {
    days: day(s), born: s.totalBorn, dead: s.totalDead, peak: s.peakPop, lawsPressed: s.lawsPassedTotal, phase: s.phase,
    kings: s.reigns.map((r) => ({ name: r.name, start: r.start, end: r.end, cause: r.cause, laws: r.laws.map((id) => LAW_BY_ID[id]?.name ?? id), remembered: r.remembered, peakPop: Math.max(0, ...r.pop) })),
    executions: s.reigns.filter((r) => r.cause === 'executed by the plaza').length,
    insights: s.revealed.map((id) => ({ name: LAW_BY_ID[id].name, truth: LAW_BY_ID[id].truth })),
    causes: s.lastDeathCause,
  };
}
