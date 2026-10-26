/** One tick of the living city. Each system already exists; this only calls them in order. */
import { Anim, DAY_TICKS, HOUR_TICKS, RF, type Season, type WeatherKind } from './contract';
import { digEdge, frontierS, isOpen } from './burrow';
import { healDaily } from './combat';
import { economyDaily } from './economy';
import { familyDaily } from './family';
import { justiceHourly } from './justice';
import { computeLawMods, kingThink, lawsHourly, succession } from './laws2';
import { nearestOnGraph, pathTo, moveAll } from './move';
import { maybeExtras } from './places';
import { factionsDaily, partiesDaily } from './politics';
import { bodySize, kill, newRat, prune, stageOf } from './rats';
import { socialHourly } from './social';
import { R, chance, clamp, clamp01, day, emit, pick, type World } from './state';
import { techDaily } from './tech';

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
  if (w.kingDied) { const why = w.kingDied.cause; w.kingDied = null; guard('succession', () => succession(w, why)); }
  if (w.tick % HOUR_TICKS === 0) {
    guard('laws', () => lawsHourly(w));
    guard('king', () => kingThink(w));
    guard('justice', () => justiceHourly(w));
    guard('social', () => socialHourly(w));
    guard('lawMods', () => computeLawMods(w));
    w.grace = Math.min(w.graceMax, w.grace + (w.unbound ? 0 : 0.35));
  }
  if (w.tick % DAY_TICKS === 0) {
    w.stats.births = 0; w.stats.deaths = 0;
    guard('economy', () => economyDaily(w));
    guard('family', () => familyDaily(w));
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
    guard('places', () => maybeExtras(w));
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
  const openF = w.edges.filter((e) => isOpen(e) && (e.kind === 'floor' || e.kind === 'tunnel'));
  if (!openF.length) return;
  let budget = 5;
  for (const r of w.rats) {
    if (!r.alive || r.edge < 0) continue;
    const moving = r.path.length > r.pathI;
    if (!moving && r.speed < 0.08) {
      if (r.flags & RF.king) r.anim = Anim.Throne;
      else if (r.flags & RF.jailed) r.anim = Anim.Jailed;
      else if (r.flags & RF.priest && (w.tick + r.id) % 80 < 2) r.anim = Anim.Pray;
      else if (r.anim === Anim.Walk || r.anim === Anim.Run || r.anim === Anim.Eat) r.anim = Anim.Idle;
    }
    if (moving || w.tick < r.intent.until || budget <= 0) continue;
    if (r.flags & RF.king) { r.intent.until = w.tick + 80; continue; }
    budget--;
    if (chance(w, 0.28)) {
      r.intent.kind = 'idle'; r.intent.since = w.tick; r.intent.until = w.tick + 15 + Math.floor(R(w) * 50);
      r.anim = (r.flags & RF.priest) ? Anim.Pray : Anim.Idle; continue;
    }
    const e = openF[(r.id + w.tick) % openF.length];
    const s = 0.3 + R(w) * Math.max(0.2, e.len - 0.6);
    r.intent.kind = 'wander'; r.intent.since = w.tick; r.intent.until = w.tick + 120; r.intent.goalEdge = e.id; r.intent.goalS = s;
    pathTo(w, r, { edge: e.id, s });
  }
}

function dig(w: World) {
  if (!w.digQueue.length || w.tick % 2 !== 0) return;
  const e = w.edges[w.digQueue[0]];
  if (!e || isOpen(e)) return;
  digEdge(w, e, 0.85);
  if ((w.tick + e.id) % 24 !== 0) return;
  const s = clamp(frontierS(e), 0, e.len);
  const digger = w.rats.find((r) => r.alive && !(r.flags & (RF.king | RF.jailed)) && r.stageN >= 2);
  if (!digger) return;
  if (pathTo(w, digger, { edge: e.id, s: Math.max(0.2, s - 0.4) })) { digger.intent.kind = 'dig'; digger.anim = Anim.Dig; digger.intent.until = w.tick + 30; }
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
  w.chron.history.push({ day: day(w), pop, food: w.granary, gini: w.stats.gini, legitimacy: w.stats.legitimacy, faith: w.faith, unrest: w.stats.unrest, joy: w.stats.joy, era: 0 });
  if (w.chron.history.length > 400) w.chron.history.shift();
  void pups; void elders; void sick; void jailed; void bots; void wed;
}
