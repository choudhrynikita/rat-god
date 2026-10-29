/** One tick of the living city. Each system already exists; this only calls them in order. */
import { Anim, DAY_TICKS, HOUR_TICKS, RF, type Season, type WeatherKind } from './contract';
import { digEdge, forceOpen, isOpen, layRoom, planChamber } from './burrow';
import { healDaily } from './combat';
import { economyDaily } from './economy';
import { faithDaily } from './faith';
import { familyDaily } from './family';
import { justiceHourly } from './justice';
import { computeLawMods, crown, kingThink, lawsHourly, succession } from './laws2';
import { nearestOnGraph, pathTo, moveAll } from './move';
import { chooseIntent, pulseLife, study } from './life';
import { anyChamber, civicStep, maybeExtras, spotIn } from './places';
import { factionsDaily, partiesDaily } from './politics';
import { bodySize, kill, newRat, prune, stageOf } from './rats';
import { socialHourly } from './social';
import { R, chance, clamp01, day, emit, pick, type World } from './state';
import { feel } from './feelings';
import { era, techDaily } from './tech';

const failed = new Set<string>();
function guard(name: string, fn: () => void) {
  try { fn(); } catch (e) { if (!failed.has(name)) { failed.add(name); console.warn('[ratgod]', name, e); } }
}

const WEATHER: WeatherKind[] = ['clear', 'clear', 'overcast', 'rain', 'fog', 'storm', 'heat', 'cold'];
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

export function stepWorld(w: World, ticks = 1) {
  for (let i = 0; i < ticks; i++) stepOne(w);
}

function stepOne(w: World) {
  w.tick++;
  clock(w);
  bodies(w);
  think(w);
  moveAll(w);
  dig(w);
  foundingPulse(w);
  if (w.tick % 10 === 0) guard('feel', () => feel(w));
  if (w.tick % 2 === 0) guard('study', () => study(w));
  if (w.kingDied) { const why = w.kingDied.cause; w.kingDied = null; guard('succession', () => succession(w, why)); }
  if (w.tick % HOUR_TICKS === 0) {
    guard('laws', () => lawsHourly(w));
    guard('king', () => kingThink(w));
    guard('justice', () => justiceHourly(w));
    guard('social', () => socialHourly(w));
    guard('life', () => pulseLife(w));
    guard('lawMods', () => computeLawMods(w));
    w.grace = Math.min(w.graceMax, w.grace + (w.unbound ? 0 : 0.35));
  }
  if (w.tick % DAY_TICKS === 0) {
    w.stats.births = 0; w.stats.deaths = 0;
    guard('economy', () => economyDaily(w));
    guard('family', () => familyDaily(w));
    guard('faith', () => faithDaily(w));
    guard('factions', () => factionsDaily(w));
    guard('parties', () => partiesDaily(w));
    guard('heal', () => healDaily(w));
    guard('tech', () => techDaily(w, (n) => {
      const mouth = w.entrances[0];
      const spot = mouth != null ? nearestOnGraph(w, w.nodes[mouth].x, w.nodes[mouth].y) : null;
      const out = [];
      for (let i = 0; i < n; i++) out.push(newRat(w, { labrat: true, ageDays: 20, edge: spot?.edge, s: spot?.s }));
      emit(w, 'labrats_arrive', `${n} pale rats crawl out of a grate, ear-tagged, blinking.`, 2, { rats: out.map((r) => r.id), card: 'From the White Place' });
      return out;
    }));
    guard('places', () => { maybeExtras(w); civicStep(w); });
    tally(w);
    prune(w);
  }
}

function clock(w: World) {
  const tod = (w.tick % DAY_TICKS) / DAY_TICKS;
  const d = day(w);
  const season = SEASONS[Math.floor(d / 10) % 4];
  const sun = Math.max(0, Math.sin((tod - 0.25) * Math.PI * 2));
  const e = w.env;
  e.tick = w.tick; e.day = d; e.tod = tod; e.hour = Math.floor(tod * 24);
  e.season = season; e.seasonT = (d % 10) / 10; e.year = Math.floor(d / 40);
  e.sunlight = sun;
  e.tempC = (season === 'winter' ? 3 : season === 'summer' ? 27 : season === 'autumn' ? 12 : 16) + (sun - 0.5) * 6;
  e.streetActivity = clamp01(sun * 0.85 + (e.hour > 7 && e.hour < 19 ? 0.15 : 0));
  e.quake = Math.max(0, e.quake - 0.015);
  e.wagonInDays = Math.max(0, 4 - (d % 5));
  e.marketDay = d % 7 === 3;
  if (--w.weatherLeft <= 0) {
    e.weather = pick(w, WEATHER); e.intensity = 0.35 + R(w) * 0.6; w.weatherLeft = 180 + Math.floor(R(w) * 400);
    e.rain = e.weather === 'rain' || e.weather === 'storm' ? e.intensity : 0;
    emit(w, 'weather', `The street turns ${e.weather}.`, 0);
  }
  e.lightning = e.weather === 'storm' && chance(w, 0.012);
  if (sun > 0.45) w.foodOnSurface = Math.min(90, w.foodOnSurface + 0.02);
}

function bodies(w: World) {
  for (const r of w.rats) {
    if (!r.alive || r.rodentoid) continue;
    r.stageN = stageOf(w, r); r.size = bodySize(w, r);
    r.needs.hunger = clamp01(r.needs.hunger + 0.0009);
    r.needs.energy = clamp01(r.needs.energy + (w.env.hour < 6 || w.env.hour > 21 ? -0.001 : 0.0004));
    if (r.needs.hunger > 0.62 && r.food > 0.15) { r.food -= 0.08; r.needs.hunger = clamp01(r.needs.hunger - 0.18); if (r.speed < 0.05) r.anim = Anim.Eat; }
    else if (r.needs.hunger > 0.7 && w.granary > 0.2 && !(r.flags & RF.jailed)) { w.granary -= 0.05; r.needs.hunger = clamp01(r.needs.hunger - 0.12); }
    if (r.needs.hunger > 0.9) r.flags |= RF.starving; else r.flags &= ~RF.starving;
    if (r.injured > 0) r.injured = Math.max(0, r.injured - 0.00015);
    if (r.needs.hunger >= 1 && r.food <= 0 && chance(w, 0.0015)) kill(w, r, 'starvation');
    else if (r.stageN === 3 && (w.tick - r.born) / DAY_TICKS > 78 && chance(w, 0.00025)) kill(w, r, 'old age');
  }
}

function think(w: World) {
  let budget = 6;
  for (const r of w.rats) {
    if (!r.alive || r.edge < 0) continue;
    const moving = r.path.length > r.pathI && r.speed > 0.02;
    if (!moving && r.speed < 0.08 && r.intent.kind !== 'sleep' && r.intent.kind !== 'eat' && r.intent.kind !== 'throne' && r.intent.kind !== 'nurse') {
      if (r.flags & RF.king) r.anim = Anim.Throne;
      else if (r.flags & RF.jailed) r.anim = Anim.Jailed;
      else if (r.anim === Anim.Walk || r.anim === Anim.Run || r.anim === Anim.Eat) r.anim = Anim.Idle;
    }
    if (moving || w.tick < r.intent.until || budget <= 0) continue;
    if (r.flags & RF.king) { chooseIntent(w, r); continue; }
    budget--;
    chooseIntent(w, r);
  }
}

function dig(w: World) {
  if (!w.digQueue.length || w.tick % 2 !== 0) return;
  let guard = 0;
  while (w.digQueue.length && guard++ < 8) {
    const head = w.edges[w.digQueue[0]];
    if (!head || isOpen(head) || (head as { dead?: boolean }).dead) { w.digQueue.shift(); continue; }
    break;
  }
  const e = w.edges[w.digQueue[0]];
  if (!e || isOpen(e)) return;
  digEdge(w, e, w.founding && w.founding.stage !== 'done' ? 0.7 : 0.85);
  if ((w.tick + e.id) % 16 !== 0) return;
  const adults = w.rats.filter((r) => r.alive && !(r.flags & (RF.king | RF.jailed)) && r.stageN >= 2);
  if (!adults.length) return;
  // rotate: the old find() always sent the same rat, and a path onto undug ground pinned them there
  const digger = adults[(Math.floor(w.tick / 16) + e.id) % adults.length];
  const mouth = e.from;
  const stand = w.edges.find((ed) => ed.id !== e.id && isOpen(ed) && (ed.a === mouth || ed.b === mouth));
  if (!stand) return;
  const s = stand.a === mouth ? Math.min(stand.len, 0.6) : Math.max(0, stand.len - 0.6);
  if (pathTo(w, digger, { edge: stand.id, s })) { digger.intent.kind = 'dig'; digger.anim = Anim.Dig; digger.intent.until = w.tick + 24; }
}

function planFounding(w: World, kind: 'cache' | 'midden' | 'throne', from: number | undefined, name: string, attempt: number) {
  const nest = w.chambers.find((c) => c.kind === 'nest');
  const near = nest ? { x: nest.cx + ((attempt % 2 === 0 ? 1 : -1) * (24 + (attempt % 4) * 10)), y: nest.cy + 5 + (attempt % 3) * 6 } : undefined;
  return planChamber(w, kind, { from: attempt > 4 ? undefined : from, near, name, fit: 'modest' });
}

/** Uncrowned start: nest, then a store, then a throne. The button is born only when that hall is empty. */
function foundingPulse(w: World) {
  const f = w.founding; if (!f || f.stage === 'done') return;
  const leader = w.byId.get(f.leader);
  if (!leader?.alive) { f.stage = 'done'; return; }
  if ((f.stage === 'nest' || f.stage === 'cache') && w.tick % 40 !== 0) return;
  if ((f.stage === 'throne' || f.stage === 'clear') && w.tick % 8 !== 0) return;
  const done = (k: 'nest' | 'cache' | 'midden' | 'granary' | 'throne') => w.chambers.some((c) => c.kind === k && c.progress >= 0.999);
  const nest = w.chambers.find((c) => c.kind === 'nest');
  const from = nest?.entryNode ?? w.entrances[0];
  const due = 2 * DAY_TICKS + (w.seed % 900);
  // a seed that cannot find soil still finishes the hall before the button's day
  if (w.tick >= due - 480 && f.stage !== 'clear') {
    if (from != null) {
      if (!w.chambers.some((c) => c.kind === 'cache' || c.kind === 'midden')) layRoom(w, from, 'cache', 'THE FIRST CACHE');
      if (!w.chambers.some((c) => c.kind === 'throne')) layRoom(w, from, 'throne', 'THE FIRST THRONE');
    }
    forceOpen(w);
    if (done('throne')) { f.stage = 'clear'; f.wait = w.tick; }
  }
  if (f.stage === 'nest') {
    if (!done('nest') || from == null) return;
    const ch = planFounding(w, 'cache', from, 'THE FIRST CACHE', f.wait) ?? planFounding(w, 'midden', from, 'THE FIRST MIDDEN', f.wait);
    if (ch) { f.stage = 'cache'; f.wait = 0; emit(w, 'dig_start', `${leader.name} sends them to chew a store.`, 1, { rats: [leader.id], chamber: ch.id, x: ch.cx, y: ch.cy }); }
    else if (++f.wait >= 4 && from != null) { const laid = layRoom(w, from, 'cache', 'THE FIRST CACHE'); if (laid) { f.stage = 'cache'; f.wait = 0; } }
  } else if (f.stage === 'cache') {
    if (!done('cache') && !done('midden') && !done('granary')) return;
    const hall = planFounding(w, 'throne', from, 'THE FIRST THRONE', f.wait);
    if (hall) { f.stage = 'throne'; f.wait = 0; emit(w, 'dig_start', `They start a hall for ${leader.name}. The crown waits on the far wall.`, 1, { rats: [leader.id], chamber: hall.id, x: hall.cx, y: hall.cy }); }
    else if (++f.wait >= 4 && from != null) { const laid = layRoom(w, from, 'throne', 'THE FIRST THRONE'); if (laid) { f.stage = 'throne'; f.wait = 0; } }
  } else if (f.stage === 'throne') {
    const hall = anyChamber(w, 'throne'); if (!hall) return;
    f.stage = 'clear'; f.wait = w.tick;
    const spot = spotIn(w, hall, 0.5); pathTo(w, leader, spot);
    emit(w, 'chamber_done', `${hall.name} is finished. The others file out. ${leader.name} stays.`, 2, { rats: [leader.id], chamber: hall.id, x: hall.cx, y: hall.cy, fx: 'dust_burst' });
  } else if (f.stage === 'clear') {
    const hall = anyChamber(w, 'throne'); if (!hall) return;
    const floor = hall.floorEdge;
    const nestSpot = nest ? spotIn(w, nest, 0.3) : null;
    let others = 0;
    for (const r of w.rats) {
      if (!r.alive || r.id === leader.id || r.edge !== floor) continue;
      others++;
      if (nestSpot && !(r.path.length > r.pathI)) pathTo(w, r, nestSpot);
    }
    if (others > 0 && w.tick - f.wait < 160) return;
    if (w.tick < due) return;
    crown(w, leader, 'the finished hall');
    leader.tool = 8; leader.anim = Anim.Throne;
    f.stage = 'done'; w.founding = null;
  }
}

function tally(w: World) {
  const alive = w.rats.filter((r) => r.alive);
  const pop = alive.length;
  let faith = 0, joy = 0, hunger = 0, crown = 0, pups = 0, elders = 0, adults = 0, sick = 0, jailed = 0, idle = 0, bots = 0, wed = 0;
  for (const r of alive) {
    faith += r.beliefs.god; joy += r.emo.joy; hunger += r.needs.hunger; crown += r.beliefs.crown;
    if (r.stageN === 0) pups++; else if (r.stageN >= 3) elders++; else if (r.stageN >= 2) adults++;
    if (r.disease) sick++; if (r.flags & RF.jailed) jailed++; if (r.rodentoid) bots++; if (r.spouse) wed++;
    if (r.stageN >= 2 && (r.role === 'idle' || r.role === 'none') && !r.firm) idle++;
  }
  const n = Math.max(1, pop);
  w.faith = faith / n;
  w.stats.joy = clamp01(joy / n);
  w.stats.legitimacy = clamp01((crown / n + 1) / 2);
  w.stats.trust = clamp01(w.stats.legitimacy * 0.7 + 0.15);
  w.stats.unrest = clamp01(w.stats.unrest * 0.92 + (1 - w.stats.legitimacy) * 0.05 + hunger / n * 0.03);
  w.stats.unemployment = adults ? idle / adults : 0;
  w.stats.gini = clamp01(w.stats.gini);
  if (pop > w.chron.peakPop) w.chron.peakPop = pop;
  w.chron.history.push({ day: day(w), pop, food: w.granary, gini: w.stats.gini, legitimacy: w.stats.legitimacy, faith: w.faith, unrest: w.stats.unrest, joy: w.stats.joy, era: era(w) });
  if (w.chron.history.length > 400) w.chron.history.shift();
  void pups; void elders; void sick; void jailed; void bots; void wed;
}
