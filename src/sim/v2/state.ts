/** Internal SIM v2 state. Everything here is plain data (Maps/typed arrays allowed) so it can be cloned (foresee) and saved. */
import type {
  Anim, Arc, Carry, Chamber, ChamberKind, Corpse, Council, Env, EventKind, FactionInfo, Festival, FirmInfo, Hazard, Item,
  Justice, NavEdge, NavNode, NewGameOpts, PartyInfo, Poster, Prayer, ReligionInfo, Research, SimEvent2, Speed2, TechInfo, Watch,
  HomeInfo, CasteInfo, Ripple, Consent,
} from './contract';

export type Big5 = { O: number; C: number; E: number; A: number; N: number };
export type Beliefs = { crown: number; god: number; equality: number; order: number; kin: number };
export type Needs = { hunger: number; energy: number; safety: number; social: number; status: number; comfort: number };
export type Emo = { joy: number; fear: number; anger: number; grief: number; love: number; shame: number };
export interface Genes { size: number; speed: number; intellect: number; fertility: number; longevity: number; health: number; charisma: number; strength: number; coat: number; curiosity: number }
export interface Memory { tick: number; text: string; val: number; other: number; kind: string; pinned: boolean; w: number /* salience */ }
/** relationship bits */
export const RK = { kin: 1, friend: 2, rival: 4, mate: 8, bond: 16, ex: 32, mentor: 64, mentee: 128, grudge: 256, lover: 512, parent: 1024, child: 2048, sibling: 4096, inmate: 8192, comrade: 16384 } as const;
export interface Rel { aff: number; trust: number; fam: number; k: number; debt: number; last: number }

export type IntentKind =
  | 'idle' | 'eat' | 'sleep' | 'forage' | 'scavenge' | 'dig' | 'haul' | 'work' | 'socialize' | 'court' | 'mate' | 'nurse' | 'play'
  | 'pray' | 'preach' | 'patrol' | 'steal' | 'fight' | 'flee' | 'protest' | 'strike' | 'research' | 'teach' | 'learn' | 'festival'
  | 'graffiti' | 'music' | 'mourn' | 'trade' | 'heal' | 'herald' | 'throne' | 'jail' | 'trial' | 'gather' | 'wander' | 'seek_help'
  | 'repair' | 'charge' | 'murder' | 'exile' | 'pilgrim' | 'hide' | 'evacuate' | 'drain' | 'rebuild'
  | 'wedding' | 'build_home' | 'home' | 'defy' | 'battle';

export interface Intent {
  kind: IntentKind; since: number; until: number;
  goalNode: number; goalEdge: number; goalS: number; chamber: number; target: number; data: number; phase: number;
}

export interface Rat {
  id: number; name: string; female: boolean; born: number; alive: boolean; died: number; cause: string;
  dynasty: number; gen: number; mother: number; father: number; children: number[];
  genes: Genes; P: Big5; needs: Needs; emo: Emo; beliefs: Beliefs;
  health: number; disease: string | null; diseaseT: number; injured: number; pregnant: number; /** tick of conception, 0 none */ pregFather: number;
  food: number; scrap: number;
  skills: Record<string, number>;
  mem: Memory[]; rel: Map<number, Rel>; knows: string[];
  role: string; firm: number; faction: number; party: number; religion: number;
  flags: number; blessings: string[]; curses: string[]; record: string[]; titles: string[];
  suspicion: number; crimes: number; grievance: number; insecurity: number; faithGod: number;
  // movement
  edge: number; s: number; dir: 1 | -1; speed: number; lane: number; x: number; y: number; heading: number; dist: number;
  path: number[]; pathI: number; goalS: number; laneT: number; facing: number; stageN: number; /** path = list of signed half-edges: (edgeId << 1) | (dir < 0 ? 1 : 0) */
  anim: Anim; carry: Carry; carryAmt: number; tool: number; target: number;
  intent: Intent; nextThink: number; lastDecision: { choice: string; intuition: number; facts: number; why: string } | null;
  rodentoid: boolean; model: number; charge: number; /** rodentoids */
  labrat: boolean; homeNest: number; story: string[];
  // 2.2
  size: number; spouse: number; married: number; /** tick, 0 = not */ home: number; caste: number; inbr: number; /** inbreeding coefficient F */
  wounds: number; blood: number; shunned: number; /** tick until shunned */ rip: { id: number; d: number; t: number }[]; /** ripple tags */
  exes: number[]; jealous: number; /** rival id */ parenting: number; /** 0..1 care given / received */
}
export interface Home extends HomeInfo { dirty: boolean }
export interface Caste extends CasteInfo { occ: Record<string, number> }
export interface RippleS extends Ripple { until: number; world: boolean }

export interface TechState extends TechInfo { progressLost: number; slates: number /** written copies (needs 'marks') */ }
export interface KingMind { persona: Record<string, number>; traits: string[]; values: Record<string, number>; tries: Record<string, number>; nextThink: number; thought: string; reaching: string | null; reachingKind: 'pass' | 'repeal' | 'abolish' | null; plateHist: number[]; lastPress: number; advisorRI: boolean }
export interface LawState { id: string; adopt: number; since: number; repealing: boolean }
export interface Faction extends FactionInfo { memberIds: number[] }
export interface Firm extends FirmInfo { workerIds: number[]; botIds: number[]; chamber: number; lossDays: number; output: number }
export interface Party extends PartyInfo { memberIds: number[]; axis: string; dir: number }
export interface Religion extends ReligionInfo { memberIds: number[] }
export interface Dyn { id: number; name: string; founder: number; founded: number; kings: number[]; fallen: number | null }

export interface Terrain {
  W: number; H: number; surfaceY: Int16Array; mat: Uint8Array; carve: Uint8Array; water: Uint8Array; moist: Uint8Array; debris: Uint8Array; stab: Uint8Array;
  pipes: { x0: number; y0: number; x1: number; y1: number; r: number; leaking: boolean }[];
  roots: { pts: [number, number][]; r: number }[];
  rocks: { cx: number; cy: number; rx: number; ry: number }[];
  /** owner map: which edge (id+1) or chamber (-(id+1)) carved this tile; 0 = natural */
  wet: number[]; /** list of tile indices that currently hold water (sparse CA) */
}

export interface World {
  v: 2; seed: number; rng: number; tick: number; speed: Speed2; opts: NewGameOpts; unbound: boolean;
  T: Terrain;
  nodes: NavNode[]; edges: NavEdge[]; chambers: Chamber[];
  rats: Rat[]; byId: Map<number, Rat>; ghosts: Map<number, Rat>; /** dead rats kept for lineage/stories (slimmed) */
  nextRat: number; nextObj: number;
  hazards: Hazard[]; corpses: Corpse[]; items: Item[]; posters: Poster[];
  env: Env; weatherLeft: number; gasField: Map<number, number>; fireField: Map<number, number>; smokeField: Map<number, number>;
  // society
  kingId: number; reignNo: number; reignStart: number; king: KingMind | null; laws: LawState[]; lawHist: Record<string, number>;
  heralds: number[]; interregnum: number;
  factions: Faction[]; firms: Firm[]; parties: Party[]; council: Council | null; religions: Religion[]; justice: Justice; festivals: Festival[];
  tech: Record<string, TechState>; research: Research[];
  dyns: Dyn[];
  market: { price: number; supply: number; demand: number };
  granary: number; scrapPool: number; foodOnSurface: number;
  grace: number; graceMax: number; faith: number;
  stats: { legitimacy: number; trust: number; unrest: number; crime: number; joy: number; gini: number; cohesion: number; births: number; deaths: number; unemployment: number; wages: number };
  gathering: { kind: 'vote' | 'riot' | 'coup' | 'funeral' | 'sermon' | 'strike' | 'protest' | 'trial' | 'festival' | 'election' | 'holy_war'; chamber: number; votes: [number, number]; of: number; endsAt: number; subject: number; data: string } | null;
  // feeds
  seq: number; events: SimEvent2[]; pendingFx: string[];
  arcs: Arc[]; watch: Watch[]; prayers: Prayer[]; nextArc: number;
  chron: { reigns: { king: number; name: string; dynasty: string; start: number; end: number | null; cause: string | null; laws: string[] }[]; godActs: { tick: number; power: string; text: string }[]; deathsByCause: Record<string, number>; peakPop: number; totalBorn: number; totalDead: number; history: { day: number; pop: number; food: number; gini: number; legitimacy: number; faith: number; unrest: number; joy: number; era: number }[]; festivals: { day: number; name: string }[]; counts: Record<string, number> };
  // dirty tracking for snapshot deltas
  dirtyTiles: Set<number>; dirtyEdges: Set<number>; dirtyChambers: Set<number>; newNodes: number[]; newEdges: number[]; newChambers: number[];
  view: { x0: number; y0: number; x1: number; y1: number } | null;
  gore: boolean; hidden: boolean; /** hidden = foresee clone: no fx */
  lastLabRats: number; labRatsArrived: number; quakeT: number;
  lawMods: Record<string, number>;
  graffiti: number;
  spoil: Map<number, number>; /** edge id -> loose spoil waiting at its dig frontier */
  digQueue: number[]; /** edge ids in planned order */
  surfNodes: number[]; entrances: number[]; adj: number[][]; /** node -> edge ids */
  navVer: number;
  kingDied: { id: number; cause: string; by: number } | null;
  pendingKills: [number, string][];
  crimes: { tick: number; by: number; victim: number; kind: string; x: number; y: number; witnessed: number[]; solved: boolean }[];
  nextFirm: number; nextParty: number; nextRel: number; nextFaction: number; nextFest: number;
  surfaceScrap: number; noticed: number; /** how much the Giants have noticed the colony */
  // 2.2
  homes: Home[]; castes: Caste[]; ripples: RippleS[]; ripCtx: number[]; consent: Consent; nextHome: number; nextRipple: number;
  housingEra: number; casteEra: number; /** day it began, 0 = not yet */ godRejection: number; wars: { day: number; name: string; dead: number }[];
  watched: Set<number>;
}

export const R = (w: { rng: number }) => {
  let t = (w.rng = (w.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const pick = <T,>(w: { rng: number }, a: readonly T[]): T => a[Math.floor(R(w) * a.length)];
export const gauss = (w: { rng: number }) => { let u = 0; for (let i = 0; i < 4; i++) u += R(w); return (u - 2) / 0.577; };
export const chance = (w: { rng: number }, p: number) => R(w) < p;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const day = (w: World) => Math.floor(w.tick / 960);

/** base importance per kind (0..100) before severity / royalty / watch / ripple bonuses */
const BASE: Partial<Record<EventKind, number>> = {
  king_died: 80, crowned: 75, coup: 85, assassination: 85, regicide: 95, war_on_god: 92, apostasy: 80, god_punish: 70, repentance: 70, defiance: 75,
  schism: 70, holy_war: 85, faction_formed: 45, religion_founded: 70, discovery: 55, persecution: 60, verdict: 30, jailed: 25, execution: 55, labrats_arrive: 75, rodentoid_built: 40, displacement: 55, collapse: 55, flood: 60,
  plague: 70, famine: 75, festival: 45, marriage: 30, divorce: 30, widowed: 25, scandal: 50, incest: 55, shunned: 30, caste_formed: 80, caste_conflict: 60,
  battle: 70, maimed: 30, murder: 55, strike: 50, protest: 50, riot: 60, election: 55, home_built: 22, inheritance: 25, prove_reality: 55,
  birth: 6, death: 12, law_proclaimed: 55, law_repealed: 45, trial: 35, escape: 45, monopoly: 45, mobility: 18, discrimination: 25, jealousy: 25,
};
const SANE: Record<string, (t: string) => string> = {
  sex: (t) => t.replace(/\b(mated|mating|coupled)\b/gi, 'shared a nest').replace(/\b(bedded|lay with)\b/gi, 'grew close to'),
  gore: (t) => t.replace(/\b(tore off|ripped off|severed|disembowelled|gutted|mutilated|dismembered)\b/gi, 'wounded').replace(/,? ?(guts|entrails|blood)[^,.]*/gi, ''),
  incest: (t) => t.replace(/\bincest(uous)?\b/gi, 'forbidden').replace(/\b(sister|brother|mother|father) and lover\b/gi, 'forbidden lover'),
  violence: (t) => t, torture: (t) => t.replace(/\btortured?\b/gi, 'hurt'),
};
export function allowed(w: World, tag: string) { const c = w.consent; if (!c.mature) return false; if (tag === 'gore') return c.gore >= 2; if (tag === 'violence') return true; if (tag === 'sex' || tag === 'incest') return c.sexual; return c.gore >= 1; }
export function emit(w: World, kind: EventKind, text: string, sev: 0 | 1 | 2 | 3, o: Partial<SimEvent2> & { safe?: string } = {}): SimEvent2 {
  const { safe, ...rest } = o;
  if (rest.mature?.length) { for (const tag of rest.mature) if (!allowed(w, tag)) { text = safe ?? (SANE[tag]?.(text) ?? text); } }
  // ripples: from the current god-act context, from tagged rats, and from world-wide acts still in effect
  let rip: number[] = [...w.ripCtx]; let depth = 9;
  if (w.ripCtx.length) depth = 0;
  for (const id of rest.rats ?? []) { const r = w.byId.get(id); if (!r) continue; for (const t of r.rip) { if (!rip.includes(t.id)) rip.push(t.id); depth = Math.min(depth, t.d + 1); } }
  if (sev >= 1) for (const rp of w.ripples) if (rp.world && rp.open && w.tick < rp.until && !rip.includes(rp.id)) { rip.push(rp.id); depth = Math.min(depth, 1); }
  const watched = (rest.rats ?? []).some((id) => w.watched.has(id)); const royal = (rest.rats ?? []).includes(w.kingId);
  const score = Math.round(clamp((BASE[kind] ?? 10 + sev * 12) + sev * 8 + (royal ? 12 : 0) + (watched ? 15 : 0) + (rip.length ? 10 : 0), 0, 100));
  const imp = score >= 70 ? 'major' : score >= 35 ? 'notable' : 'minor';
  const e: SimEvent2 = { seq: ++w.seq, tick: w.tick, kind, text, sev, ...rest, imp, score };
  if (rip.length) {
    e.ripples = rip.slice(0, 4);
    for (const id of e.ripples) { const rp = w.ripples.find((x) => x.id === id); if (!rp || !rp.open) continue; if (rp.chain.length < 40) rp.chain.push({ seq: e.seq, tick: w.tick, kind, text, depth: depth > 8 ? 1 : depth, score }); }
    // the chain spreads: everyone named in a ripple-tagged event carries the tag one hop further
    if (depth < 4) for (const id of rest.rats ?? []) { const r = w.byId.get(id); if (!r) continue; for (const rid of e.ripples) tagRat(w, r, rid, depth > 8 ? 1 : depth + 1); }
  }
  w.events.push(e);
  w.chron.counts[kind] = (w.chron.counts[kind] ?? 0) + 1;
  if (w.events.length > 400) w.events.splice(0, w.events.length - 400);
  return e;
}
export function tagRat(w: World, r: Rat, id: number, d: number) {
  const ex = r.rip.find((t) => t.id === id); if (ex) { if (d < ex.d) ex.d = d; ex.t = w.tick; return; }
  if (d > 4) return; r.rip.push({ id, d, t: w.tick }); if (r.rip.length > 4) r.rip.shift();
}
export type { ChamberKind };
