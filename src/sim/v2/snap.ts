/** Snapshot2 / RatDetail for the renderer that already exists. */
import {
  CONTRACT_VERSION, DAY_TICKS, TICK_MS_1X, TILE_CM, type BurrowDelta, type ChronicleV2, type GodLedger, type RatsBlock, type RatDetail,
  type Snapshot2, type SocietyStats, type TerrainDelta, type TerrainInit,
} from './contract';
import { occupation } from './family';
import { available } from './laws2';
import { ageDays, getRat } from './rats';
import { clamp, type World } from './state';
import { era } from './tech';

export function terrainInit(w: World): TerrainInit {
  const T = w.T;
  return { W: T.W, H: T.H, tileCm: TILE_CM, surfaceY: T.surfaceY, mat: T.mat, carve: T.carve, water: T.water, moist: T.moist, debris: T.debris, stab: T.stab, pipes: T.pipes, roots: T.roots, rocks: T.rocks };
}

export function takeTerrain(w: World): TerrainDelta | null {
  const n = w.dirtyTiles.size; if (!n) return null;
  const idx = new Uint32Array(n), carve = new Uint8Array(n), water = new Uint8Array(n), debris = new Uint8Array(n), stab = new Uint8Array(n), moist = new Uint8Array(n);
  let i = 0;
  for (const t of w.dirtyTiles) { idx[i] = t; carve[i] = w.T.carve[t]; water[i] = w.T.water[t]; debris[i] = w.T.debris[t]; stab[i] = w.T.stab[t]; moist[i] = w.T.moist[t]; i++; }
  w.dirtyTiles.clear();
  return { idx, carve, water, debris, stab, moist };
}

export function takeBurrow(w: World): BurrowDelta | null {
  if (!w.newNodes.length && !w.newEdges.length && !w.newChambers.length && !w.dirtyEdges.size && !w.dirtyChambers.size) return null;
  const seenE = new Set(w.newEdges), seenC = new Set(w.newChambers);
  const edgeDug: [number, number][] = [];
  for (const id of w.dirtyEdges) if (!seenE.has(id) && w.edges[id]) edgeDug.push([id, w.edges[id].dug]);
  const chamber: [number, number, number, number, number][] = [];
  for (const id of w.dirtyChambers) { const c = w.chambers[id]; if (c && !seenC.has(id)) chamber.push([c.id, c.progress, c.stock, c.owner, c.flooded]); }
  const delta: BurrowDelta = {
    newNodes: w.newNodes.map((id) => w.nodes[id]).filter(Boolean),
    newEdges: w.newEdges.map((id) => w.edges[id]).filter(Boolean),
    newChambers: w.newChambers.map((id) => w.chambers[id]).filter(Boolean),
    edgeDug, chamber,
  };
  w.newNodes = []; w.newEdges = []; w.newChambers = []; w.dirtyEdges.clear(); w.dirtyChambers.clear();
  return delta;
}

export function ratsBlock(w: World): RatsBlock {
  const list = w.rats.filter((r) => r.alive);
  const n = list.length;
  const b: RatsBlock = {
    n, id: new Int32Array(n), x: new Float32Array(n), y: new Float32Array(n), heading: new Float32Array(n), facing: new Int8Array(n),
    speed: new Float32Array(n), dist: new Float32Array(n), edge: new Int32Array(n), s: new Float32Array(n), lane: new Float32Array(n),
    anim: new Uint8Array(n), stage: new Uint8Array(n), carry: new Uint8Array(n), size: new Float32Array(n), coat: new Uint8Array(n),
    faction: new Uint16Array(n), dynasty: new Uint16Array(n), flags: new Uint32Array(n), mood: new Int8Array(n), target: new Int32Array(n),
    religion: new Uint16Array(n), firm: new Uint16Array(n), party: new Uint16Array(n), tool: new Uint8Array(n),
    caste: new Uint8Array(n), home: new Int16Array(n), wounds: new Uint32Array(n), blood: new Uint8Array(n), marks: new Uint8Array(n),
  };
  for (let i = 0; i < n; i++) {
    const r = list[i];
    b.id[i] = r.id; b.x[i] = r.x; b.y[i] = r.y; b.heading[i] = r.heading; b.facing[i] = r.facing < 0 ? -1 : 1;
    b.speed[i] = r.speed; b.dist[i] = r.dist; b.edge[i] = r.edge; b.s[i] = r.s; b.lane[i] = r.lane;
    b.anim[i] = r.anim; b.stage[i] = r.stageN; b.carry[i] = r.carry; b.size[i] = r.size || 1; b.coat[i] = r.genes.coat & 7;
    b.faction[i] = r.faction; b.dynasty[i] = r.dynasty; b.flags[i] = r.flags;
    b.mood[i] = clamp(Math.round((r.emo.joy - r.emo.fear - r.emo.anger) * 100), -100, 100);
    b.target[i] = r.target; b.religion[i] = r.religion; b.firm[i] = r.firm; b.party[i] = r.party; b.tool[i] = r.tool;
    b.caste![i] = r.caste; b.home![i] = r.home; b.wounds![i] = r.wounds; b.blood![i] = r.blood;
    if (r.labrat) b.marks![i] |= 4;
  }
  return b;
}

export function society(w: World): SocietyStats {
  const alive = w.rats.filter((r) => r.alive);
  let pups = 0, elders = 0, adults = 0, hunger = 0, sick = 0, jailed = 0, bots = 0, wed = 0, court = 0, clergy = 0, poor = 0, workers = 0;
  const n = Math.max(1, alive.length);
  for (const r of alive) {
    hunger += r.needs.hunger;
    if (r.stageN === 0) pups++; else if (r.stageN >= 3) elders++; else if (r.stageN >= 2) adults++;
    if (r.disease) sick++; if (r.flags & 1 << 26) jailed++; if (r.rodentoid) bots++; if (r.spouse) wed++;
    if (r.role === 'king' || r.role === 'herald') court++;
    else if (r.role === 'priest' || r.role === 'enforcer') clergy++;
    else if (r.food < 0.5) poor++; else workers++;
  }
  let devout = 0, believer = 0, doubter = 0, atheist = 0;
  for (const r of alive) { const g = r.beliefs.god; if (g > 0.55) devout++; else if (g > 0.15) believer++; else if (g < -0.4) atheist++; else doubter++; }
  let readers = 0;
  for (const r of alive) if (r.knows.includes('writing') || r.knows.includes('marks')) readers++;
  return {
    pop: alive.length, adults, pups, elders, births: w.stats.births, deaths: w.stats.deaths,
    food: w.granary + w.foodOnSurface, granary: w.granary, scrap: w.scrapPool, foodPrice: w.market.price,
    gini: w.stats.gini, legitimacy: w.stats.legitimacy, trust: w.stats.trust, unrest: w.stats.unrest, faith: w.faith,
    cohesion: w.stats.cohesion, crime: w.stats.crime, disease: sick / n, hunger: hunger / n,
    classes: { court, clergy, guild: w.firms.length, workers, poor, outcasts: alive.filter((r) => r.flags & (1 << 10)).length },
    unemployment: w.stats.unemployment, wages: w.stats.wages, joy: w.stats.joy, techEra: era(w), rodentoids: bots, jailed, literacy: readers / n,
    grace: w.grace, graceMax: w.graceMax,
    faithDist: { devout: devout / n, believer: believer / n, doubter: doubter / n, atheist: atheist / n },
    godRejection: w.godRejection, married: wed, homes: w.homes.length, casteTension: 0, ga: w.env.ga,
  };
}

export function buildSnap(w: World, sinceSeq: number): Snapshot2 {
  const fresh = w.events.filter((e) => e.seq > sinceSeq);
  const k = w.byId.get(w.kingId);
  const king = k && w.king ? {
    id: k.id, name: k.name, reignNo: w.reignNo, dynasty: k.dynasty, since: w.reignStart,
    persona: w.king.traits, thought: w.king.thought,
    plate: (k.food > 4 ? 'feast' : k.food > 2 ? 'meal' : k.food > 0.4 ? 'scraps' : 'empty') as 'feast' | 'meal' | 'scraps' | 'empty',
    reaching: w.king.reaching, reachingKind: w.king.reachingKind,
    laws: w.laws.map((l) => ({ id: l.id, adopt: l.adopt, since: l.since, repealing: l.repealing })),
    board: lawBoard(w),
    available: safeLaws(w),
    stanceToGod: (k.beliefs.god > 0.45 ? 'devout' : k.beliefs.god < -0.35 ? 'defiant' : 'indifferent') as 'devout' | 'defiant' | 'indifferent',
    punished: w.chron.godActs.filter((a) => a.power === 'punish_king' || a.power === 'punish').length,
  } : null;
  const speed = w.speed || 1;
  return {
    v: 2, tick: w.tick, speed: w.speed, tickMs: TICK_MS_1X / Math.max(0.25, speed),
    env: w.env, rats: ratsBlock(w), terrain: takeTerrain(w), burrow: takeBurrow(w),
    hazards: w.hazards, corpses: w.corpses, items: w.items.slice(-80), posters: w.posters,
    fields: null, events: fresh, stats: society(w), king, factions: w.factions,
    prayers: w.prayers.slice(-12).reverse(), watch: w.watch.slice(0, 8), arcs: w.arcs.slice(-16),
    phase: alivePop(w) === 0 ? 'dead' : w.gathering ? 'gathering' : k?.alive ? 'reign' : 'founding',
    gathering: w.gathering ? { kind: w.gathering.kind, chamber: w.gathering.chamber, votes: w.gathering.votes, of: w.gathering.of, endsAt: w.gathering.endsAt } : null,
    tech: Object.values(w.tech), research: w.research, firms: w.firms, parties: w.parties, council: w.council,
    religions: w.religions, justice: w.justice, festivals: w.festivals,
    ripples: w.ripples.slice(-12), homes: null, castes: w.castes, consent: w.consent,
    omensUnread: w.events.filter((e) => (e.sev ?? 0) >= 2).length,
    hearths: w.homes.map((h) => ({ chamber: h.chamber, state: h.state, caste: h.caste })),
  };
}

function safeLaws(w: World) { try { return available(w).slice(0, 16); } catch { return []; } }

/** 36 sockets. Pressed laws fill from the first socket; provenance is base until drafting exists. */
function lawBoard(w: World) {
  const sockets: (string | null)[] = Array.from({ length: 36 }, () => null);
  const provenance: ('base' | 'drafted' | 'tech' | 'god' | null)[] = Array.from({ length: 36 }, () => null);
  const sealed: boolean[] = Array.from({ length: 36 }, () => false);
  for (let i = 0; i < w.laws.length && i < 36; i++) {
    const l = w.laws[i];
    sockets[i] = l.id;
    provenance[i] = 'base';
    sealed[i] = !l.repealing;
  }
  return { sockets, provenance, sealed };
}

function alivePop(w: World) { let n = 0; for (const r of w.rats) if (r.alive) n++; return n; }

const RKNAME: [number, string][] = [[1, 'kin'], [2, 'friend'], [4, 'rival'], [8, 'mate'], [16, 'bond'], [32, 'ex'], [64, 'mentor'], [128, 'mentee'], [256, 'grudge'], [512, 'lover'], [1024, 'parent'], [2048, 'child'], [4096, 'sibling']];

export function ratDetail(w: World, id: number): RatDetail | null {
  const r = getRat(w, id); if (!r) return null;
  const dyn = w.dyns.find((d) => d.id === r.dynasty);
  const fac = w.factions.find((f) => f.id === r.faction);
  const rels = [...r.rel.entries()].sort((a, b) => Math.abs(b[1].aff) - Math.abs(a[1].aff)).slice(0, 12).map(([oid, x]) => {
    const o = getRat(w, oid);
    const kinds = RKNAME.filter(([bit]) => x.k & bit).map(([, name]) => name);
    return { id: oid, name: o?.name ?? 'a gone rat', kinds, aff: x.aff, trust: x.trust, alive: !!o?.alive };
  });
  return {
    id: r.id, name: r.name, title: r.titles[0] ?? occupation(w, r), sex: r.female ? 'F' : 'M', ageDays: ageDays(w, r), stage: r.stageN, alive: r.alive,
    dynasty: { id: r.dynasty, name: dyn?.name ?? 'no house' }, generation: r.gen, mother: r.mother, father: r.father, children: r.children,
    role: r.role, className: occupation(w, r), faction: fac ? { id: fac.id, name: fac.name } : null,
    personality: r.P, genes: { ...r.genes }, needs: r.needs, health: r.health, disease: r.disease, wealth: { food: r.food, scrap: r.scrap },
    skills: r.skills, beliefs: r.beliefs, blessings: r.blessings, curses: r.curses,
    mood: clamp(Math.round((r.emo.joy - r.emo.fear) * 100), -100, 100),
    thought: r.lastDecision?.why ?? (r.flags & 2 ? 'The throne is heavy.' : 'The tunnels are close.'),
    doing: r.intent.kind, relations: rels,
    memories: r.mem.slice(-16).map((m) => ({ tick: m.tick, text: m.text, valence: m.val, other: m.other || undefined })),
    story: r.story.length ? r.story : [`Day ${Math.floor(r.born / DAY_TICKS)}: ${r.name} came into the burrow.`],
    knows: r.knows, religion: null, party: null, firm: null,
    jailed: (r.flags & (1 << 26)) ? { crime: r.record[0] ?? 'held', untilDay: 0, wrongful: false } : null,
    record: r.record, lastDecision: r.lastDecision, spouse: r.spouse || undefined, married: r.married || null,
    home: w.homes.find((h) => h.id === r.home) ?? null, caste: null, inbreeding: r.inbr, wounds: [], shunned: r.shunned > w.tick, ripples: r.rip.map((t) => t.id),
  };
}

export function chronicle(w: World): ChronicleV2 {
  return {
    days: Math.floor(w.tick / DAY_TICKS), seed: w.seed, reigns: w.chron.reigns,
    dynasties: w.dyns.map((d) => ({
      id: d.id, name: d.name, founder: d.founder, founded: d.founded,
      living: w.rats.filter((r) => r.alive && r.dynasty === d.id).length,
      dead: [...w.ghosts.values()].filter((r) => r.dynasty === d.id).length,
      kings: d.kings, fallen: d.fallen,
    })),
    arcs: w.arcs, godActs: w.chron.godActs, deathsByCause: w.chron.deathsByCause,
    peakPop: w.chron.peakPop, totalBorn: w.chron.totalBorn, totalDead: w.chron.totalDead, history: w.chron.history,
    tech: Object.values(w.tech), religions: w.religions, parties: w.parties, firms: w.firms, festivals: w.chron.festivals,
    ripples: w.ripples, castes: w.castes, marriages: w.rats.filter((r) => r.spouse).length, homes: w.homes.length, wars: w.wars,
  };
}

export function ledger(w: World): GodLedger {
  let exists = 0, ben = 0, wrath = 0, justice = 0, cap = 0, att = 0, n = 0;
  for (const r of w.rats) if (r.alive) { n++; exists += (r.beliefs.god + 1) / 2; ben += r.emo.joy; wrath += r.emo.fear; }
  n = Math.max(1, n);
  return {
    acts: w.chron.godActs.map((a, i) => ({ id: `G#${i + 1}`, tick: a.tick, power: a.power as GodLedger['acts'][number]['power'], target: {}, text: a.text, witnesses: 0 })),
    titles: [],
    image: { exists: exists / n, benevolence: ben / n, wrath: wrath / n, justice, caprice: cap, attention: att },
    profile: { benevolent: ben / n, cruel: wrath / n, absent: 1 - exists / n, just: w.stats.trust, capricious: 0.2 },
    ripples: w.ripples, prophecies: [], silenceUntil: 0,
  };
}

export { CONTRACT_VERSION };
