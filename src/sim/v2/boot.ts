/** Founding: fill a World, cut the first burrow, wake the rats. The systems in this folder do the rest. */
import { Anim, RF, TILE_CM, type ChamberKind, type Consent, type NewGameOpts } from './contract';
import { addEntrance, forceOpen, initSurface, isOpen, layRoom, planChamber } from './burrow';
import { addRel, newRat } from './rats';
import { setPose } from './move';
import { crown } from './laws2';
import { genTerrain } from './terrain';
import { RK, R, clamp, emit, type World } from './state';

const DEFAULT_CONSENT: Consent = { mature: false, gore: 0, sexual: false };

export function createWorld(opts: NewGameOpts): World {
  const seed = opts.seed | 0 || 1;
  const w = blank(opts, seed);
  w.T = genTerrain(w);
  initSurface(w);
  const grate = (w.T as { grateX?: number }).grateX ?? Math.floor(w.T.W * 0.45);
  const ent = addEntrance(w, clamp(Math.floor(grate), 8, w.T.W - 9));
  const city = opts.scenario !== 'founding';
  const order: ChamberKind[] = city
    ? ['plaza', 'granary', 'shrine', 'market', 'nursery', 'throne', 'barracks', 'jail', 'temple']
    : [];
  // the planner routes from a dug node; long searches die in the rock, so stay near the nest
  if (!w.chambers.some((c) => c.kind === 'nest')) {
    for (let t = 0; t < 8 && !w.chambers.some((c) => c.kind === 'nest'); t++) planChamber(w, 'nest', { from: ent.id });
  }
  if (!w.chambers.length) emergencyNest(w, ent.id);
  openQueued(w);
  const home = w.chambers.find((c) => c.progress >= 0.999) ?? w.chambers[0];
  if (home) {
    for (const kind of order) {
      for (let t = 0; t < 8; t++) {
        const ang = t / 8 * Math.PI * 2;
        const ch = planChamber(w, kind, {
          from: home.entryNode,
          near: { x: home.cx + Math.cos(ang) * (18 + t * 3), y: home.cy + 6 + Math.sin(ang) * 14 },
        });
        if (ch) { openQueued(w); break; }
      }
    }
  }
  if (!w.edges.some((e) => e.kind === 'floor' && isOpen(e))) emergencyNest(w, ent.id);
  if (city && !w.edges.some((e) => !isOpen(e) && e.kind === 'tunnel')) {
    const from = (w.chambers.find((c) => c.progress >= 0.999) ?? home)?.entryNode ?? ent.id;
    planChamber(w, 'midden', { from });
  }
  const n = city ? Math.max(24, opts.founders ?? 48) : Math.max(6, opts.founders ?? 10);
  spawn(w, n);
  const adults = w.rats.filter((r) => r.alive && r.stageN >= 2);
  const leader = adults.reduce((a, b) => (b.genes.charisma + b.P.E > a.genes.charisma + a.P.E ? b : a), adults[0]);
  if (leader && city) {
    crown(w, leader, 'the first claw');
    const hall = w.chambers.find((c) => c.kind === 'throne' && c.progress >= 0.999) ?? w.chambers.find((c) => c.progress >= 0.999);
    if (hall && hall.floorEdge >= 0) {
      const e = w.edges[hall.floorEdge];
      leader.edge = e.id; leader.s = e.len * 0.5; setPose(w, leader); leader.anim = Anim.Throne;
    }
    let guards = 0, priests = 0;
    for (const r of adults) {
      if (r === leader) continue;
      if (guards < 3) { r.flags |= RF.enforcer; r.role = 'enforcer'; guards++; }
      else if (priests < 2) { r.flags |= RF.priest; r.role = 'priest'; r.beliefs.god = Math.max(r.beliefs.god, 0.7); priests++; }
    }
  } else if (leader) {
    leader.flags |= RF.leader | RF.founder;
    leader.role = 'leader';
    leader.titles.push('THE FIRST CLAW');
    w.founding = { leader: leader.id, stage: 'nest', wait: 0 };
    emit(w, 'founding', `${leader.name} leads them. No crown yet. The first room is only a hole.`, 1, { rats: [leader.id], x: leader.x, y: leader.y });
  }
  for (const r of w.rats) { const nest = w.chambers.find((c) => c.kind === 'nest'); if (nest) r.homeNest = nest.id; }
  w.granary = city ? 70 : 18;
  w.foodOnSurface = city ? 36 : 10;
  const gran = w.chambers.find((c) => c.kind === 'granary'); if (gran) gran.stock = w.granary;
  w.chron.peakPop = w.rats.length;
  w.chron.totalBorn = w.rats.length;
  // geometry rides on the init message, not the first delta
  w.newNodes = []; w.newEdges = []; w.newChambers = [];
  w.dirtyTiles.clear(); w.dirtyEdges.clear(); w.dirtyChambers.clear();
  return w;
}

function openQueued(w: World) { forceOpen(w); }

function emergencyNest(w: World, from: number) {
  layRoom(w, from, 'nest', 'THE FIRST NEST');
  openQueued(w);
}

function spawn(w: World, n: number) {
  const floors = w.edges.filter((e) => isOpen(e) && e.kind === 'floor');
  const pool = floors.length ? floors : w.edges.filter((e) => isOpen(e) && e.kind !== 'surface');
  if (!pool.length) return;
  for (let i = 0; i < n; i++) {
    const e = pool[i % pool.length];
    const roll = i / n;
    const ageDays = roll < 0.12 ? 2 : roll > 0.88 ? 62 : 10 + Math.floor(R(w) * 28);
    const r = newRat(w, { edge: e.id, s: 0.4 + R(w) * Math.max(0.2, e.len - 0.8), ageDays, female: i % 2 === 0 });
    r.flags |= RF.founder;
    r.food = 1.5 + R(w) * 3;
    r.role = 'idle';
    const band = i % 4;
    if (band === 0) r.beliefs.crown = 0.72;
    else if (band === 1) { r.beliefs.god = 0.78; r.flags |= RF.zealot; }
    else if (band === 2) { r.beliefs.crown = -0.62; r.grievance = 0.55; r.emo.anger = 0.5; }
    else { r.beliefs.equality = 0.62; r.beliefs.crown = 0.05; }
  }
  const rats = w.rats;
  for (let i = 0; i < rats.length; i++) {
    for (let k = 1; k <= 3; k++) {
      const b = rats[(i + k * 4) % rats.length];
      if (b === rats[i]) continue;
      addRel(w, rats[i], b, 0.58, 0.42, RK.friend);
      addRel(w, b, rats[i], 0.58, 0.42, RK.friend);
    }
  }
}

function blank(opts: NewGameOpts, seed: number): World {
  const consent = opts.contentSettings ?? DEFAULT_CONSENT;
  const w = {
    v: 2 as const, seed, rng: seed, tick: 0, speed: 1 as const, opts, unbound: !!opts.unbound,
    T: undefined as unknown as World['T'],
    nodes: [], edges: [], chambers: [],
    rats: [], byId: new Map(), ghosts: new Map(), nextRat: 0, nextObj: 0,
    hazards: [], corpses: [], items: [], posters: [],
    env: {
      tick: 0, day: 0, tod: 0.32, hour: 8, season: 'spring' as const, seasonT: 0, year: 0,
      weather: 'clear' as const, intensity: 0.15, rain: 0, wind: 0.05, tempC: 16, sunlight: 0.45,
      lightning: false, streetActivity: 0.25, quake: 0, wagonInDays: 4, marketDay: false,
      festiveSpill: false, binFood: 14, ga: 0.02, rung: 'none' as const,
    },
    weatherLeft: 200, gasField: new Map(), fireField: new Map(), smokeField: new Map(),
    kingId: 0, reignNo: 0, reignStart: 0, king: null, laws: [], lawHist: {},
    heralds: [], interregnum: 0,
    factions: [], firms: [], parties: [], council: null, religions: [],
    justice: { jail: -1, inmates: [], trials: [], secretPolice: false, executions: 0, exiles: 0 },
    festivals: [], tech: {}, research: [], dyns: [],
    market: { price: 1, supply: 8, demand: 8 },
    granary: 0, scrapPool: 4, foodOnSurface: 0,
    grace: 120, graceMax: 120, faith: 0.15,
    stats: {
      legitimacy: 0.55, trust: 0.45, unrest: 0.08, crime: 0, joy: 0.35, gini: 0.2, cohesion: 0.4,
      births: 0, deaths: 0, unemployment: 0.4, wages: 0,
    },
    gathering: null, seq: 0, events: [], pendingFx: [], arcs: [], watch: [], prayers: [], nextArc: 1,
    chron: {
      reigns: [], godActs: [], deathsByCause: {}, peakPop: 0, totalBorn: 0, totalDead: 0, history: [],
      festivals: [], counts: {},
    },
    dirtyTiles: new Set<number>(), dirtyEdges: new Set<number>(), dirtyChambers: new Set<number>(),
    newNodes: [], newEdges: [], newChambers: [],
    view: null, gore: consent.gore >= 1, hidden: false, lastLabRats: -99, labRatsArrived: 0, quakeT: 0,
    lawMods: {}, graffiti: 0, spoil: new Map(), digQueue: [], surfNodes: [], entrances: [], adj: [],
    navVer: 0, kingDied: null, pendingKills: [], crimes: [],
    nextFirm: 0, nextParty: 0, nextRel: 0, nextFaction: 0, nextFest: 0, surfaceScrap: 6, noticed: 0,
    homes: [], castes: [], ripples: [], ripCtx: [], consent: { ...consent, sexual: false },
    nextHome: 0, nextRipple: 0, housingEra: 0, casteEra: 0, godRejection: 0, wars: [], watched: new Set<number>(),
    founding: null,
  } satisfies World;
  // tile size is a contract constant; terrain init echoes it
  void TILE_CM;
  return w;
}
