/**
 * RAT GOD — SIM v2 ⇄ RENDER/UI contract (types only, no runtime cost).
 * Owned by the SIM stream. Readable spec: docs/CONTRACT_V2.md. Bump CONTRACT_VERSION on any breaking change.
 *
 * Import from render/ui code:  import type { Snapshot2, ... } from '../sim/v2/contract';
 * Runtime helpers that are shared (spline sampling, enums) live in ./shared.ts (pure, safe to import on the main thread).
 */
export const CONTRACT_VERSION = '2.2.0';

// ───────────────────────────── units & time ─────────────────────────────
/** 1 terrain tile = 4 cm. An adult rat body (no tail) is ~5 tiles long, ~1.5 tiles tall. Tunnels are ~2–3 tiles wide. */
export const TILE_CM = 4;
/** Sim tick = 80 ms of wall time at 1×. One day is about 77 seconds. 16× is under 5 seconds a day. */
export const TICK_MS_1X = 80;
/** One sim day = 960 ticks (~77 s at 1×, ~5 s at 16×). 40 ticks per sim hour. */
export const DAY_TICKS = 960;
export const HOUR_TICKS = 40;
/** 4 seasons × 10 days = a 40-day year. */
export const SEASON_DAYS = 10;
export type Speed2 = 0 | 0.25 | 0.5 | 1 | 2 | 4 | 8 | 16;

// ───────────────────────────── terrain ─────────────────────────────
/** Material of a tile. Hardness/permeability are in shared.ts MATERIALS. */
export enum Mat { Air = 0, Topsoil = 1, Loam = 2, Clay = 3, Gravel = 4, Roots = 5, Rock = 6, Pipe = 7, Concrete = 8, Bedrock = 9 }
/**
 * Terrain is a W×H grid, row-major, idx = y*W + x. y grows downward. Row surfaceY[x] is the first non-air row of column x
 * (the street/ground line). Everything above is the open-air surface world.
 * carve: 0 = solid, 255 = fully excavated. A tile is PASSABLE for rats when carve >= PASSABLE (and it lies on a nav edge).
 * Intermediate values are a partially gnawed face (render as cracked / crumbling earth).
 */
export const PASSABLE = 200;
export interface TerrainInit {
  W: number; H: number; tileCm: number;
  surfaceY: Int16Array;      // length W
  mat: Uint8Array;           // Mat, length W*H
  carve: Uint8Array;         // 0..255
  water: Uint8Array;         // standing water depth in the tile, 0..255 (255 = full tile)
  moist: Uint8Array;         // soil moisture 0..255 (dark/wet soil)
  debris: Uint8Array;        // loose spoil lying in the tile 0..255 (render as dirt mound on the floor)
  stab: Uint8Array;          // structural stability 0..255; < 60 = cracks; collapse happens below ~25
  /** static decorative-but-physical features (all coordinates in tiles) */
  pipes: { x0: number; y0: number; x1: number; y1: number; r: number; leaking: boolean }[];
  roots: { pts: [number, number][]; r: number }[];
  rocks: { cx: number; cy: number; rx: number; ry: number }[];
}
/** Tiles changed since the previous snapshot (parallel arrays). */
export interface TerrainDelta { idx: Uint32Array; carve: Uint8Array; water: Uint8Array; debris: Uint8Array; stab: Uint8Array; moist: Uint8Array }

// ───────────────────────────── burrow graph ─────────────────────────────
export type ChamberKind =
  | 'entrance' | 'bolthole' | 'nest' | 'cache' | 'latrine' | 'gallery' | 'deadend'
  | 'throne' | 'granary' | 'nursery' | 'plaza' | 'shrine' | 'barracks' | 'midden' | 'infirmary' | 'market' | 'workshop' | 'slum'
  // 2.1
  | 'jail' | 'temple' | 'lab' | 'council' | 'archive'
  // 2.2
  | 'home';
export interface Chamber {
  id: number; kind: ChamberKind; name: string;
  /** organic blob: ellipse + per-chamber wobble seed; the authoritative shape is the carve field. */
  cx: number; cy: number; rx: number; ry: number; seed: number;
  floorY: number;            // y of the walkable floor line (tiles)
  floorEdge: number;         // edge id of the floor walkway
  entryNode: number;         // node where the access tunnel meets the chamber
  progress: number;          // 0..1 excavated (planned chambers start at 0)
  stock: number;             // food units stored (granary/cache), debris (midden), corpses (midden)
  owner: number;             // faction id that claims it (0 = public)
  flooded: number;           // 0..1
}
export type EdgeKind = 'tunnel' | 'floor' | 'shaft' | 'surface';
export interface NavNode { id: number; x: number; y: number; kind: 'junction' | 'chamber' | 'entrance' | 'surface' | 'deadend' }
export interface NavEdge {
  id: number; a: number; b: number; kind: EdgeKind;
  /** centreline control points in tiles, from node a to node b. Sample with shared.ts sampleEdge(edge, s) (Catmull-Rom, arc-length). */
  pts: [number, number][];
  len: number;               // arc length in tiles
  width: number;             // clear width in tiles (lanes = floor(width / 1.4))
  chamber: number;           // chamber id for 'floor' edges, -1 otherwise
  /** excavation along the edge. Digging proceeds from node `from` toward the other end. dug == len → open. */
  dug: number; from: number;
}
export interface BurrowInit { nodes: NavNode[]; edges: NavEdge[]; chambers: Chamber[] }
/** Changes since the last snapshot. `edges`/`chambers` carry only changed fields of existing items or whole new items.
 *  2.1: an item in newEdges/newChambers whose id already exists REPLACES the old one (e.g. a chamber re-purposed: kind/name changed). */
export interface BurrowDelta {
  newNodes: NavNode[]; newEdges: NavEdge[]; newChambers: Chamber[];
  edgeDug: [id: number, dug: number][];
  chamber: [id: number, progress: number, stock: number, owner: number, flooded: number][];
}

// ───────────────────────────── rats ─────────────────────────────
/** What the rat's body is doing — the render picks the animation from this (+ carry, stage, speed). */
export enum Anim {
  Idle = 0, Walk, Run, Sneak, Climb, Squeeze, Swim,
  Dig, Haul, Gnaw, Craft, Eat, Drink, Sleep, Groom, Nurse, Mate, Play, Talk, Trade,
  Fight, Flee, Cower, Pray, Preach, Mourn, Sick, Shiver, Protest, Vote, Cheer, Steal, Patrol, Guard,
  Throne, Press, Feast, Paste, Carry, Dying, Dead, Risen, Kneel, Celebrate,
  // 2.1
  Experiment, Write, Graffiti, Dance, Music, Game, Jailed, Strike, Trial, Lecture, Repair, Charge, Tend /* fire / machine */, Kiss,
}
export enum Stage { Pup = 0, Juvenile = 1, Adult = 2, Elder = 3 }
export enum Carry { None = 0, Food = 1, Scrap = 2, Debris = 3, Pup = 4, Corpse = 5, Poster = 6, Nest = 7, Bait = 8 }
/** bit flags in RatsBlock.flags */
export const RF = {
  female: 1 << 0, king: 1 << 1, pregnant: 1 << 2, sick: 1 << 3, injured: 1 << 4, starving: 1 << 5, wet: 1 << 6,
  enforcer: 1 << 7, priest: 1 << 8, healer: 1 << 9, outcast: 1 << 10, criminal: 1 << 11, herald: 1 << 12,
  prophet: 1 << 13, blessed: 1 << 14, cursed: 1 << 15, risen: 1 << 16, founder: 1 << 17, leader: 1 << 18,
  zealot: 1 << 19, asleep: 1 << 20, lod: 1 << 21, /** body is being simulated coarsely (off-screen) */
  queued: 1 << 22, /** waiting behind another rat in a narrow tunnel */
  watched: 1 << 23, /** on the 'watch this' feed */
  // 2.1
  rodentoid: 1 << 24, /** a robot rat (render: metal rat art). stage is always Adult; coat = model 0..3 */
  labrat: 1 << 25,    /** escaped from the White Place (render: pale/albino, ear tag, stitched) */
  jailed: 1 << 26, boss: 1 << 27, unionist: 1 << 28, believer: 1 << 29, /** member of an organised religion (see religion field) */
  festive: 1 << 30,   /** taking part in a festival */
} as const;
/**
 * Per-rat structure-of-arrays, n rats, all indexed by i. Positions are in TILES (float). The rat's feet are at (x, y);
 * the body extends ±len/2 along `heading`. Render: interpolate x/y/heading between two snapshots by time, and drive gait from
 * `dist` (cumulative distance walked, tiles) → phase = dist / strideTiles. Never advance gait by wall time while speed≈0.
 */
export interface RatsBlock {
  n: number;
  id: Int32Array;
  x: Float32Array; y: Float32Array;
  heading: Float32Array;     // radians, direction of travel along the tunnel centreline (0 = +x, π/2 = down). Slopes/climbs tilt the body.
  facing: Int8Array;         // -1 left, +1 right (sprite flip)
  speed: Float32Array;       // current speed, tiles per tick (signed along edge not needed: use facing/heading)
  dist: Float32Array;        // cumulative distance travelled (tiles) — the gait clock
  edge: Int32Array; s: Float32Array; // position along a nav edge (tiles from node a); -1 = off-graph (surface/air ballistic)
  lane: Float32Array;        // lateral offset from the centreline in tiles (+ = right of travel). Squeeze ≈ ±0.5
  anim: Uint8Array;          // Anim
  stage: Uint8Array;         // Stage
  carry: Uint8Array;         // Carry
  size: Float32Array;        // body scale 0.35 (newborn) .. 1.15 (big adult), from age × size gene
  coat: Uint8Array;          // 0..7 heritable coat variant (0 brown, 1 grey, 2 black, 3 pied, 4 cream, 5 agouti, 6 albino, 7 hooded)
  faction: Uint16Array;      // faction id (0 = none)
  dynasty: Uint16Array;      // house id
  flags: Uint32Array;        // RF bits
  mood: Int8Array;           // -100..100 (emoji/thought tint)
  target: Int32Array;        // rat id the action is directed at (fight/talk/mate/nurse), -1 none
  // 2.1
  religion: Uint16Array;     // religion id (0 none)
  firm: Uint16Array;         // employer firm id (0 none)
  party: Uint16Array;        // political party id (0 none)
  tool: Uint8Array;          // held tool/tech prop: 0 none, 1 torch, 2 digging blade, 3 spear, 4 marks-slate, 5 wire/spark, 6 lantern, 7 wrench
  // 2.2
  caste?: Uint8Array;        // caste id (0 none / before castes emerge)
  home?: Int16Array;         // home id (-1 none)
  /** per-body-part wounds, 2 bits per part (0 ok, 1 wounded, 2 maimed/scarred, 3 missing). Part order = BODY_PARTS. Render draws bandages/scars/stumps (gore setting permitting). */
  wounds?: Uint32Array;
  blood?: Uint8Array;        // 0..255 blood on the fur (fresh wounds, battle) — render only if gore >= 1
  /** 2.2 final: visible marks, bits = MARK_BITS */
  marks?: Uint8Array;
}
export const MARK_BITS = { ear_notch: 1, docked_tail: 2, ear_tag: 4, holy_mark: 8, cursed_mark: 16, scar: 32 } as const;
/** body part index for RatsBlock.wounds / Corpse.wounds (2 bits each, part k at bits 2k..2k+1) */
export const BODY_PARTS = ['head', 'left_ear', 'right_ear', 'eye', 'snout', 'left_foreleg', 'right_foreleg', 'left_hindleg', 'right_hindleg', 'tail', 'belly', 'back'] as const;
export type BodyPart = typeof BODY_PARTS[number];
export const woundOf = (bits: number, part: number) => (bits >>> (part * 2)) & 3;

// ───────────────────────────── world entities ─────────────────────────────
export type HazardKind = 'cat' | 'snake' | 'exterminator' | 'drone' | 'bait' | 'boot' | 'owl' | 'ferret' | 'trap' /* 2.2: a Giant snap trap at an entrance */;
export interface Hazard { id: number; kind: HazardKind; x: number; y: number; edge: number; s: number; facing: -1 | 1; anim: 'prowl' | 'stalk' | 'pounce' | 'eat' | 'leave' | 'idle' | 'slither' | 'strike' | 'spray' | 'hover' | 'lie' | 'stomp'; target: number }
export interface Corpse { id: number; ratId: number; x: number; y: number; edge: number; s: number; age: number; cause: string; violent: boolean; decay: number /*0..1*/; stage: Stage; coat: number; size: number;
  /** 2.2 carnage data (render only with gore on): wounds bitfield as RatsBlock.wounds, blood pool 0..1, disembowelled, headless */ wounds?: number; gore?: number; mature?: boolean }
export interface Item { id: number; kind: 'food' | 'scrap' | 'bait' | 'poster' | 'nest' | 'graffiti' | 'slate' | 'idol' | 'limb' | 'blood' | 'possession'; x: number; y: number; edge: number; s: number; amount: number;
  /** 2.2: limb -> BodyPart name, graffiti -> motif, possession -> kind; mature=true for gore items (hide when gore off) */ variant?: string; mature?: boolean }
/** Coarse scalar fields on a (W/4)×(H/4) grid, sent only when non-empty. 0..255. */
export interface Fields { cw: number; ch: number; gas?: Uint8Array; smoke?: Uint8Array; fire?: Uint8Array; scent?: Uint8Array; light?: Uint8Array }
export interface Poster { id: number; law: string; chamber: number; x: number; y: number; torn: boolean; since: number }

// ───────────────────────────── environment ─────────────────────────────
export type WeatherKind = 'clear' | 'overcast' | 'fog' | 'rain' | 'storm' | 'heat' | 'cold' | 'snow' | 'drought';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export interface Env {
  tick: number; day: number;
  tod: number;               // time of day 0..1 (0 = midnight, 0.25 = dawn 06:00, 0.5 = noon, 0.75 = dusk 18:00)
  hour: number;              // 0..23
  season: Season; seasonT: number; year: number;
  weather: WeatherKind; intensity: number; // 0..1
  rain: number;              // precipitation rate 0..1 (drives water inflow at entrances)
  wind: number;              // -1..1 (direction × strength)
  tempC: number;             // surface temperature
  sunlight: number;          // 0..1 surface light (render: sky/ambient)
  lightning: boolean;        // a strike this snapshot (flash + thunder)
  streetActivity: number;    // 0..1 traffic of the Giants on the street (boots, wheels, noise)
  quake: number;             // 0..1 current ground shaking (camera shake)
  // 2.2 (bible L1.4) — the Street cycles and the Giants' attention
  wagonInDays?: number;      // days until the Roaring Wagon empties the bins (dawn)
  marketDay?: boolean;       // a stall above the lot today (spills)
  festiveSpill?: boolean;    // mid-winter waste surge
  binFood?: number;          // FU lying in the bins/gutters right now
  ga?: number;               // Giant Attention 0..1
  rung?: 'none' | 'traps' | 'bait' | 'sealing' | 'gas' | 'hunters' | 'pouring'; // current escalation rung (v2 reaches 'bait')
}

// ───────────────────────────── society ─────────────────────────────
export type FactionKind = 'royalists' | 'zealots' | 'dissidents' | 'reformers' | 'guild' | 'gang' | 'cult' | 'clan' | 'atheists' /* 2.2: the prove-reality movement */ | 'caste';
export interface FactionInfo {
  id: number; kind: FactionKind; name: string; leader: number; members: number; color: number; // 0xRRGGBB tint
  creed: string; strength: number; // 0..1 share of influence
  founded: number; parent: number; /** faction it split from (schism), 0 = none */
  stance: { crown: number; god: number; equality: number; order: number }; // -1..1 centroid beliefs
  aims: string;              // e.g. 'OVERTHROW THE KING', 'PURGE THE UNBELIEVERS'
}
export interface SocietyStats {
  pop: number; adults: number; pups: number; elders: number; births: number; deaths: number; // births/deaths today
  food: number; granary: number; scrap: number; foodPrice: number; // scrap per food on the market
  gini: number;              // wealth inequality 0..1
  legitimacy: number;        // 0..1 belief that the king has the right to rule
  trust: number;             // 0..1 trust in institutions
  unrest: number;            // 0..1
  faith: number;             // -1..1 mean belief in the god
  cohesion: number;          // 0..1 social-graph clustering / mutual affinity
  crime: number;             // crimes per day (EMA)
  disease: number;           // share infected
  hunger: number;            // mean hunger 0..1
  classes: { court: number; clergy: number; guild: number; workers: number; poor: number; outcasts: number };
  // 2.1
  unemployment: number; wages: number; joy: number; techEra: number; rodentoids: number; jailed: number; literacy: number;
  grace: number; graceMax: number; // the god's power pool
  // 2.2
  faithDist?: { devout: number; believer: number; doubter: number; atheist: number }; // shares, sum 1
  godRejection?: number;      // 0..1 how much the colony has turned against the god
  married?: number; homes?: number; casteTension?: number;
  // 2.2 final (V2_SCOPE_DELTA §1.9)
  ga?: number;                // Giant Attention 0..1 (bible L1.4)
  misinformation?: number;    // mean |belief − truth| over the core claims (bible L0.4)
  wrongfulConvictions?: number; // cumulative, ground truth only the god sees (bible L8.3)
  godImage?: { exists: number; benevolence: number; wrath: number; justice: number; caprice: number; attention: number }; // colony means 0..1 (bible L9.2)
  arrangedShare?: number; housedShare?: number; casteIndex?: number; /** reserved (v2.5) */ atheistShare?: number;
  /** the conservation ledger for food energy, today so far (FU). err = |Δstock − (sources − sinks)| / max(1, stock) */
  ledger?: { sources: Record<string, number>; sinks: Record<string, number>; stock: number; err: number };
  diseases?: Record<string, { E: number; I: number; R: number }>; // SEIR counts per pathogen
  conditions?: Record<string, number>; // mental conditions → count (bible L3.10)
}
export interface KingInfo {
  id: number; name: string; reignNo: number; dynasty: number; since: number; persona: string[]; thought: string;
  plate: 'feast' | 'meal' | 'scraps' | 'empty' | 'none'; reaching: string | null; reachingKind: 'pass' | 'repeal' | 'abolish' | null;
  laws: { id: string; adopt: number; since: number; repealing: boolean }[]; available: string[];
  // 2.2
  stanceToGod?: 'devout' | 'fearful' | 'indifferent' | 'repentant' | 'defiant' | 'at_war'; punished?: number; /** times the god has punished him */
  // 2.2 final (bible L7.1, L7.3, L7.11)
  /** the Board: 36 sockets (6×6). socket i holds a law id or null; provenance says where the button came from */
  board?: { sockets: (string | null)[]; provenance: ('base' | 'drafted' | 'tech' | 'god' | null)[]; sealed: boolean[] /** pressed by this king */ };
  court?: Partial<Record<CourtOffice, number>>; // office → rat id
  stance?: 'faithful' | 'repentant' | 'defiant'; // coarse form of stanceToGod (delta §1.9)
}
export type CourtOffice = 'plate_bearer' | 'herald' | 'guard_captain' | 'advisor' | 'consort' | 'priest';
export interface Prayer { ratId: number; name: string; plea: string; kind: 'food' | 'heal' | 'love' | 'revenge' | 'justice' | 'sign' | 'safety' | 'child' | 'rain'; tick: number; x: number; y: number;
  /** 2.2: the power this prayer is implicitly asking for (a diegetic nudge for the UI) */ suggest?: GodPower }
export interface Watch { ratId: number; arc: number; reason: string; score: number }
export interface Arc { id: number; kind: ArcKind; title: string; rats: number[]; started: number; updated: number; stage: string; heat: number; ended: boolean }
export type ArcKind =
  | 'rise_to_power' | 'forbidden_love' | 'infidelity' | 'martyr' | 'famine' | 'schism' | 'feud' | 'coup' | 'assassination'
  | 'plague' | 'prophet' | 'revenge' | 'dynasty_fall' | 'exodus' | 'crime_wave' | 'reform' | 'tyrant' | 'saviour' | 'disaster' | 'miracle' | 'orphan' | 'rivalry'
  // 2.1
  | 'discovery' | 'lab_rats' | 'machine_age' | 'strike' | 'holy_war' | 'trial' | 'jailbreak' | 'festival' | 'monopoly' | 'election' | 'persecution' | 'golden_age' | 'lost_knowledge'
  // 2.2
  | 'god_vs_king' | 'apostasy' | 'marriage' | 'scandal' | 'caste_war' | 'inheritance' | 'war';

// ───────────────────────────── 2.1: knowledge, institutions, culture ─────────────────────────────
/** A technology/idea. The tree is NOT linear: each tech has prerequisites (any-of groups), needs (what pressures make rats think of it),
 *  and materials; discovery is a per-rat stochastic event (curiosity × need × knowledge × tools × luck). Knowledge lives in the heads of
 *  rats who know it: if all knowers die before teaching it, it is LOST and can be rediscovered later. */
export type TechStatus = 'known' | 'secret' | 'lost' | 'banned' | 'worshipped';
export interface TechInfo {
  id: string; name: string; era: 0 | 1 | 2 | 3 | 4 | 5; // 0 basics … 5 hyper-advanced (RI, rodentoids)
  status: TechStatus; knowers: number; discovered: number; discoverer: number; how: 'curiosity' | 'need' | 'accident' | 'observation' | 'experiment' | 'stolen' | 'labrats' | 'taught';
  holder: number;            // faction/firm/religion id that controls it when secret (0 = open)
  blurb: string;             // what it does (shown once known)
}
export interface Research { ratId: number; tech: string; progress: number /*0..1*/; fails: number; chamber: number }
export type FirmKind = 'diggers' | 'foragers' | 'scrapworks' | 'granary' | 'wheelworks' | 'healers' | 'builders' | 'smithy' | 'sparkworks' | 'rodentoid_works' | 'scribes' | 'brewers' | 'traders' | 'guards';
export interface FirmInfo {
  id: number; name: string; kind: FirmKind; boss: number; workers: number; rodentoids: number;
  wage: number;              // food units per day paid to a worker
  wealth: number; share: number; // market share 0..1 within its kind (≥ .7 = monopoly)
  founded: number; status: 'open' | 'strike' | 'bust' | 'merged'; union: number; /** union leader rat id, 0 none */
}
export interface PartyInfo { id: number; name: string; leader: number; members: number; platform: string[]; color: number; seats: number; corrupt: number /*0..1*/; patron: number /*firm id lobbying it*/; founded: number; banned: boolean }
export interface Council { seats: number; parties: [party: number, seats: number][]; nextElection: number; speaker: number; lastVote: string | null }
export interface ReligionInfo {
  id: number; name: string; deity: 'the Unseen' | 'the Giants' | 'the Machine' | 'the Crown' | 'the Flood' | 'the White Place' | 'the Ancestors';
  doctrine: string[]; founder: number; prophet: number; members: number; temples: number[]; // chamber ids
  tolerance: number;         // -1 persecuting … 1 harmonious
  enemies: number[];         // religion ids it is at holy war with
  parent: number; founded: number; color: number;
}
export interface Inmate { ratId: number; crime: string; until: number; wrongful: boolean; gang: number }
export interface Justice { jail: number; /** chamber id or -1 */ inmates: Inmate[]; trials: { accused: number; crime: string; judge: number; endsAt: number }[]; secretPolice: boolean; executions: number; exiles: number }
export interface Festival { id: number; kind: 'harvest' | 'saints_day' | 'crowning' | 'midwinter' | 'flood_mourning' | 'games' | 'wedding' | 'victory' | 'machine_day'; name: string; chamber: number; endsAt: number; joy: number }

// ───────────────────────────── events ─────────────────────────────
/** One thing that happened. `fx` is a render hint (an effect id), `sfx` an audio hint; both optional. */
export interface SimEvent2 {
  seq: number; tick: number; kind: EventKind; text: string;
  sev: 0 | 1 | 2 | 3;        // 0 trivia (ticker), 1 notable (chronicle), 2 major (toast), 3 epochal (modal/card)
  rats?: number[]; x?: number; y?: number; chamber?: number; arc?: number; fx?: string; sfx?: string; card?: string;
  // 2.2 — tiered UI: every event has an importance tier and a 0..100 score (sev is kept; imp is derived from score)
  imp?: 'minor' | 'notable' | 'major'; score?: number; // always filled by the v2 sim; optional only so 2.1 producers (mocks) still type-check
  /** ripple ids (god interventions) this event descends from — "this happened because you did X" */
  ripples?: number[];
  /** content tags; when the consent setting hides a tag the sim already sent the safe wording in `text`, and the render must hide the matching fx/items */
  mature?: ('sex' | 'gore' | 'incest' | 'violence' | 'torture')[];
  // 2.2 final (V2_SCOPE_DELTA §1.9, bible L14.6). Always filled by the v2 sim.
  tier?: 'minor' | 'notable' | 'major'; // same value as imp (imp kept for 2.2-draft consumers)
  title?: string;            // ≤ 48 chars, never cut with an ellipsis
  body?: string;             // ≤ 220 chars
  portraitRat?: number; artKey?: string; stinger?: string;
  cause?: string;            // causal id of this event ('G#3' = god act 3, 'E#1234' = event seq, 'N' = nature)
  godRoot?: string;          // the god act this descends from, if any ('G#n')
  content?: { sexual?: boolean; gore?: 0 | 1 | 2 }; // delta's mature-content flags (object form of `mature`)
  /** when consent hid something, the unfiltered wording (render may show it if the player changes settings later) */
  textFull?: string;
}
/** 2.2 final: a ripple card — a sev ≥ 2 consequence of a god act ≥ 1 day old (bible L12.8). Max 1 per in-game hour. */
export interface RippleCard { id: number; rootAct: string; power: GodPower; tick: number; text: string; chain: { seq: number; tick: number; kind: EventKind; text: string }[] }
/** 2.2 final: a logged god act (bible L12.4) */
export interface GodAct { id: string; tick: number; power: GodPower; target: GodTarget; text: string; witnesses: number }
/** 2.2 final: the God's Ledger (bible L12.9) */
export interface GodLedger {
  acts: GodAct[]; titles: string[];
  image: { exists: number; benevolence: number; wrath: number; justice: number; caprice: number; attention: number };
  profile: { benevolent: number; cruel: number; absent: number; just: number; capricious: number }; // 0..1
  ripples: Ripple[]; prophecies: { text: string; status: 'open' | 'kept' | 'broken'; tick: number }[];
  silenceUntil: number;      // tick, 0 = not silent
}
/** 2.2: a god intervention and the causal chain that followed from it */
export interface Ripple { id: number; power: GodPower; tick: number; text: string; target?: number; open: boolean; chain: { seq: number; tick: number; kind: EventKind; text: string; depth: number; score: number }[] }
/** 2.2: a family home dug into its own chamber. Everything the render needs to compose a unique interior from the prop kit. */
export interface HomeInfo {
  id: number; chamber: number; name: string; owners: number[]; family: number[]; built: number; dynasty: number;
  wealth: number;            // 0..1 relative to the city
  caste: number; faith: number; /** religion id, 0 none */ culture: string[]; /** tags e.g. 'tinkerers','pious','warriors','scholars','musicians' */
  style: { tidy: number; bold: number; warm: number; odd: number; grand: number }; // 0..1 from the owners' personalities and wealth
  history: string[];         // short lines: 'built by X and Y', 'mourned Z', 'flooded on day N'
  possessions: { kind: string; quality: number; origin: string }[]; // e.g. {kind:'lantern', quality:.7, origin:'gift of the king'}
  state: 'building' | 'lived' | 'mourning' | 'abandoned' | 'ruined'; seed: number;
}
export interface CasteInfo { id: number; name: string; rank: number; /** 0 top */ members: number; occupations: string[]; norms: string[]; /** 'MARRY WITHIN','NO TOUCHING THE DEAD-HANDLERS',... */ color: number; founded: number }
export type EventKind =
  | 'birth' | 'death' | 'murder' | 'execution' | 'mate' | 'pairbond' | 'breakup' | 'affair' | 'friend' | 'rival' | 'grudge' | 'mentor'
  | 'theft' | 'fight' | 'arrest' | 'trade' | 'debt' | 'rumour' | 'propaganda'
  | 'faction_formed' | 'faction_joined' | 'schism' | 'coup' | 'assassination' | 'reform' | 'riot' | 'gathering' | 'vote' | 'spared'
  | 'crowned' | 'king_died' | 'law_pressed' | 'law_proclaimed' | 'law_repealed' | 'herald'
  | 'dig_start' | 'dig_done' | 'chamber_done' | 'collapse' | 'flood' | 'drain' | 'fire' | 'quake' | 'plague' | 'famine' | 'harvest' | 'drought'
  | 'predator' | 'predator_kill' | 'predator_driven_off' | 'gas' | 'poison'
  | 'weather' | 'season' | 'dawn' | 'dusk'
  | 'god_act' | 'omen' | 'miracle' | 'prayer' | 'prophecy' | 'conversion' | 'heresy' | 'blessed' | 'cursed' | 'risen' | 'smite'
  | 'arc' | 'founding' | 'exodus' | 'migrant' | 'city_dead'
  // 2.1
  | 'discovery' | 'experiment_failed' | 'tech_lost' | 'tech_banned' | 'tech_stolen' | 'tech_worshipped' | 'lesson' | 'labrats_arrive'
  | 'rodentoid_built' | 'rodentoid_broken' | 'displacement' | 'protest' | 'strike' | 'union' | 'hired' | 'fired' | 'firm_founded' | 'firm_bust' | 'merger' | 'monopoly'
  | 'party_formed' | 'election' | 'council' | 'lobby' | 'corruption' | 'crackdown' | 'secret_police'
  | 'trial' | 'verdict' | 'jailed' | 'released' | 'escape' | 'pardon' | 'wrongful' | 'exile'
  | 'religion_founded' | 'doctrine' | 'holy_war' | 'persecution' | 'tolerance' | 'temple' | 'pilgrimage'
  | 'festival' | 'game' | 'music' | 'dance' | 'art' | 'graffiti' | 'courtship' | 'gossip' | 'play'
  // 2.2
  | 'god_punish' | 'repentance' | 'defiance' | 'war_on_god' | 'apostasy' | 'prove_reality' | 'regicide'
  | 'marriage' | 'divorce' | 'widowed' | 'home_built' | 'inheritance' | 'sibling_rivalry' | 'jealousy' | 'scandal' | 'shunned' | 'incest'
  | 'caste_formed' | 'caste_conflict' | 'discrimination' | 'mobility' | 'battle' | 'maimed'
  // 2.2 final
  | 'trap' | 'wagon' | 'ga_rung' | 'sign' | 'voice' | 'marked' | 'silence' | 'illuminate' | 'reveal_law' | 'judged' | 'disease_onset' | 'condition'
  | 'ordeal' | 'mob_justice' | 'court_office' | 'lobby_gift' | 'dream' | 'nightmare' | 'ripple';

// ───────────────────────────── snapshot ─────────────────────────────
export interface Snapshot2 {
  v: 2; tick: number; speed: Speed2; tickMs: number; // wall ms per tick at the current speed
  env: Env;
  rats: RatsBlock;
  terrain: TerrainDelta | null;
  burrow: BurrowDelta | null;
  hazards: Hazard[]; corpses: Corpse[]; items: Item[]; posters: Poster[]; fields: Fields | null;
  events: SimEvent2[];       // new since the last snapshot
  stats: SocietyStats;
  king: KingInfo | null;
  factions: FactionInfo[];
  prayers: Prayer[];         // open prayers (newest first, max 12)
  watch: Watch[];            // 'watch this' feed (max 8)
  arcs: Arc[];               // active + recently ended arcs (max 16)
  phase: 'founding' | 'reign' | 'interregnum' | 'gathering' | 'dead';
  gathering: { kind: 'vote' | 'riot' | 'coup' | 'funeral' | 'sermon' | 'strike' | 'protest' | 'trial' | 'festival' | 'election' | 'holy_war'; chamber: number; votes: [kill: number, spare: number]; of: number; endsAt: number } | null;
  // 2.1 — sent every snapshot (small arrays)
  tech: TechInfo[]; research: Research[]; firms: FirmInfo[]; parties: PartyInfo[]; council: Council | null;
  religions: ReligionInfo[]; justice: Justice; festivals: Festival[];
  // 2.2
  ripples?: Ripple[];        // open + recent ripples (max 12)
  homes?: HomeInfo[] | null; // homes changed since last snapshot (full list in init-after-load via debug 'homes')
  castes?: CasteInfo[];
  consent?: Consent;
  // 2.2 final
  omensUnread?: number;      // MAJOR events not yet opened (full list via { t: 'omens' })
}
/** 2.2: what the player has consented to see. The sim words events accordingly; the render hides tagged fx/items. Default all off. */
export interface Consent { mature: boolean; gore: 0 | 1 | 2; /** 0 none, 1 blood, 2 full carnage */ sexual: boolean }

// ───────────────────────────── inspect / stories ─────────────────────────────
export interface RelView { id: number; name: string; kinds: string[]; aff: number; trust: number; alive: boolean }
export interface MemoryView { tick: number; text: string; valence: number; other?: number }
export interface RatDetail {
  id: number; name: string; title: string; sex: 'F' | 'M'; ageDays: number; stage: Stage; alive: boolean;
  dynasty: { id: number; name: string }; generation: number; mother: number; father: number; children: number[];
  role: string; className: string; faction: { id: number; name: string } | null;
  personality: { O: number; C: number; E: number; A: number; N: number };
  genes: Record<string, number>;
  needs: { hunger: number; energy: number; safety: number; social: number; status: number; comfort: number };
  health: number; disease: string | null; wealth: { food: number; scrap: number };
  skills: Record<string, number>;   // 0..1
  beliefs: { crown: number; god: number; equality: number; order: number; kin: number };
  blessings: string[]; curses: string[];
  mood: number; thought: string; doing: string;
  relations: RelView[];             // strongest 12
  memories: MemoryView[];           // recent + pinned, max 16
  story: string[];                  // the life story, paragraph by paragraph, generated from what happened
  // 2.1
  knows: string[]; religion: { id: number; name: string } | null; party: { id: number; name: string } | null; firm: { id: number; name: string; boss: boolean } | null;
  jailed: { crime: string; untilDay: number; wrongful: boolean } | null; record: string[]; /** crimes, trials */
  lastDecision: { choice: string; intuition: number; facts: number; why: string } | null; /** the stochastic mix that produced the latest choice */
  // 2.2
  spouse?: number; married?: number | null; home?: HomeInfo | null; caste?: { id: number; name: string } | null; inbreeding?: number; /** 0..1 coefficient */
  wounds?: { part: string; level: number }[]; shunned?: boolean; ripples?: number[]; /** god interventions that shaped this life */
  // 2.2 final (V2_SCOPE_DELTA §1.9)
  genome?: { loci: Record<string, number> /** z-scores of the 10 quantitative loci */; coat: string /** genotype e.g. 'AaBBCcHhPPDd' */; bitterBlood: 0 | 1 | 2; load: number /** heterozygous load sites */; defects: string[] };
  F?: number;                // inbreeding coefficient by origin tags (bible L2.1)
  needs12?: Record<string, number>;    // hunger, thirst, warmth, rest, air, safety, social, intimacy, status, autonomy, purpose, curiosity (+faith) — deficits 0..1
  emotions12?: Record<string, number>; // joy, fear, anger, grief, love, shame, disgust, surprise, envy, pride, hope, boredom — 0..1
  godImage?: { exists: number; benevolence: number; wrath: number; justice: number; caprice: number; attention: number };
  marriage?: { spouse: number; since: number; status: 'intact' | 'strained' | 'broken' | 'widowed' } | null;
  marks?: string[];          // visible stigma / holy marks: 'ear_notch', 'docked_tail', 'ear_tag', 'holy_mark', 'cursed_mark'
  conditions?: string[];     // 'Despair', 'Dread', 'The Watching', 'The Beautiful Ones', + disease state e.g. 'Wet cough (sick)'
  energy?: { stomach: number; fat: number; protein: number; vitality: number; thirst: number }; // kc / 0..1
}
export interface DynastyInfo { id: number; name: string; founder: number; founded: number; living: number; dead: number; kings: number[]; fallen: number | null }
export interface ChronicleV2 {
  days: number; seed: number; reigns: { king: number; name: string; dynasty: string; start: number; end: number | null; cause: string | null; laws: string[] }[];
  dynasties: DynastyInfo[]; arcs: Arc[]; godActs: { tick: number; power: string; text: string }[];
  deathsByCause: Record<string, number>; peakPop: number; totalBorn: number; totalDead: number;
  history: { day: number; pop: number; food: number; gini: number; legitimacy: number; faith: number; unrest: number; joy: number; era: number }[];
  // 2.1
  tech: TechInfo[]; religions: ReligionInfo[]; parties: PartyInfo[]; firms: FirmInfo[]; festivals: { day: number; name: string }[];
  // 2.2
  ripples?: Ripple[]; castes?: CasteInfo[]; marriages?: number; homes?: number; wars?: { day: number; name: string; dead: number }[];
}

// ───────────────────────────── god powers ─────────────────────────────
export type GodPower =
  // creation & destruction
  | 'seed_founder' | 'smite' | 'wipe_dynasty' | 'raise_dead'
  // elevation
  | 'bless' | 'anoint_prophet' | 'curse' | 'punish' /* 2.2: chastise a rat — usually the king */
  // influence
  | 'whisper' | 'sow_rumour' | 'inspire' | 'dream'
  // nature
  | 'flood' | 'cave_in' | 'plague' | 'famine' | 'harvest' | 'earthquake' | 'drought' | 'fire' | 'storm' | 'predator'
  // time & fate
  | 'foresee' | 'miracle'
  // 2.2 final (bible L12.3 v2 set)
  | 'punish_king' | 'sign' | 'voice' | 'spring' | 'mark' | 'pardon' | 'judge' | 'reveal_law' | 'illuminate' | 'silence';
export type Gift = 'genius' | 'charisma' | 'strength' | 'longevity' | 'prophecy' | 'fertility' | 'health';
export type CurseKind = 'plague' | 'barren' | 'misfortune' | 'madness' | 'weakness';
export type BeliefAxis = 'crown' | 'god' | 'equality' | 'order' | 'kin';
export type Idea =
  | { kind: 'belief'; axis: BeliefAxis; dir: 1 | -1 }
  | { kind: 'desire'; what: 'rebel' | 'worship' | 'leave' | 'hoard' | 'share' | 'dig' | 'breed' | 'reform' | 'rule' }
  | { kind: 'feeling'; toward: number; what: 'love' | 'hate' | 'trust' | 'fear' | 'envy' };
export type RumourClaim = 'thief' | 'traitor' | 'heretic' | 'blessed' | 'poisoner' | 'cheat' | 'hoarder' | 'kind' | 'murderer' | 'plotting';
export interface GodTarget { rat?: number; rat2?: number; dynasty?: number; chamber?: number; corpse?: number; x?: number; y?: number; faction?: number }
export interface GodParams {
  gift?: Gift; curse?: CurseKind; idea?: Idea; about?: number | 'king' | 'god'; claim?: RumourClaim;
  feeling?: 'love' | 'hatred' | 'friendship' | 'rivalry'; dream?: 'omen' | 'vision' | 'nightmare' | 'prophecy' | 'memory';
  predator?: 'cat' | 'snake' | 'exterminator' | 'poison_bait'; magnitude?: number /*0..1*/; days?: number;
  miracle?: 'feed' | 'heal' | 'calm' | 'light' | 'fertile'; query?: 'king' | 'rat' | 'city' | 'faction'; horizonDays?: number;
  name?: string;
  punishment?: 'pain' | 'humble' | 'blight' | 'strip' | 'nightmare' /* 2.2 */ | 'illness' | 'terror' | 'favourite' /* punish_king (bible L12.3) */;
  // 2.2 final
  text?: string;             // sign / voice: the glyph line
  law?: string;              // reveal_law: law id
  tech?: string;             // illuminate: tech/idea id (omit = an adjacent idea)
  mark?: 'holy' | 'cursed';  // mark
}
export interface GodCommand { t: 'god'; req: number; power: GodPower; target: GodTarget; params?: GodParams }
export interface GodResult {
  t: 'godResult'; req: number; ok: boolean; reason?: string; power: GodPower;
  cost: number; grace: number;      // grace spent and remaining
  effects: string[];                // readable immediate consequences
  witnesses: number;                // rats who perceived the act (they form beliefs about the god)
  events: number[];                 // seqs of the SimEvent2s it caused
  forecast?: Forecast;              // for 'foresee'
}
export interface Forecast { horizonDays: number; lines: string[]; kingSurvives: boolean | null; popAfter: number; ratFate?: string; confidence: number }
export interface GodPowerInfo { power: GodPower; label: string; group: 'creation' | 'elevation' | 'influence' | 'nature' | 'fate' | 'destruction' | 'curse' | 'knowledge' | 'judgement' | 'presence'; cost: number; target: (keyof GodTarget)[]; params: (keyof GodParams)[]; blurb: string;
  /** 2.2 final */ targetKind?: 'none' | 'rat' | 'king' | 'place' | 'chamber' | 'dynasty' | 'corpse'; halo?: boolean; /** an open prayer is asking for this (diegetic nudge) */ }

// ───────────────────────────── worker protocol ─────────────────────────────
export interface NewGameOpts { seed: number; unbound?: boolean /** god powers ignore grace */; founders?: number; scenario?: 'founding' | 'city' /** start with an established 150-rat city */;
  /** 2.2 final: echoed back in init; the sim words events by it but never changes the simulation by it */ contentSettings?: Consent }
/** 2.2 final (bible L15.7) */
export interface SaveHeader { magic: 'RATG'; saveVersion: number; contractVersion: string; seed: number; tick: number; created: number; contentSettings: Consent; godMode: 'grace' | 'unbound' }
export type ToWorker2 =
  | { t: 'new'; opts: NewGameOpts }
  | { t: 'load'; state: string }
  | { t: 'speed'; v: Speed2 }
  | { t: 'view'; x0: number; y0: number; x1: number; y1: number } // visible rect in tiles → LOD (rats outside are simulated coarsely)
  | { t: 'inspect'; id: number | null }
  | { t: 'story'; id: number }
  | { t: 'chronicle' }
  | { t: 'save' }
  | { t: 'gore'; on: boolean }
  | { t: 'advance'; ticks: number }
  | GodCommand
  | { t: 'debug'; what: string; arg?: number | string }
  | { t: 'consent'; consent: Consent } /* 2.2 */
  | { t: 'omens' } | { t: 'omensRead'; seqs: number[] } | { t: 'ledger' } /* 2.2 final */;
export type FromWorker2 =
  | { t: 'init'; contract: string; terrain: TerrainInit; burrow: BurrowInit; powers: GodPowerInfo[]; laws: { id: string; name: string; prop: string; category?: string }[]; contentSettings?: Consent }
  | { t: 'worldGrow'; terrain: TerrainInit; dx: number }
  | { t: 'snap'; snap: Snapshot2; inspect: RatDetail | null }
  | GodResult
  | { t: 'story'; id: number; detail: RatDetail }
  | { t: 'chronicle'; data: ChronicleV2 }
  | { t: 'saved'; state: string; day: number; seed: number; header?: SaveHeader }
  | { t: 'ripple'; card: RippleCard }        /* 2.2 final: pushed as it happens (≤ 1 per in-game hour) */
  | { t: 'omens'; list: SimEvent2[]; unread: number }
  | { t: 'ledger'; data: GodLedger }
  | { t: 'error'; msg: string };
