export const TPD = 20; // ticks per sim day (1 tick = 1 s at x1, so 1 day = 20 s)

export const ROOM_KINDS = [
  'entrance', 'throne', 'granary', 'nursery', 'workshop', 'warren',
  'plaza', 'shrine', 'barracks', 'graveyard', 'slum', 'deepwarren',
] as const;
export type RoomKind = (typeof ROOM_KINDS)[number];
export const R: Record<RoomKind, number> = Object.fromEntries(ROOM_KINDS.map((k, i) => [k, i])) as any;
export const SURFACE = -1; // pseudo-room index for the street above

export const ROOM_LABEL: Record<RoomKind, string> = {
  entrance: 'DRAIN MOUTH', throne: 'THRONE HALL', granary: 'GRANARY', nursery: 'NURSERY',
  workshop: 'WORKSHOP', warren: 'SLEEPING WARREN', plaza: 'PLAZA', shrine: 'SHRINE',
  barracks: 'BARRACKS', graveyard: 'CORPSE PIT', slum: 'OUTCAST SLUM', deepwarren: 'DEEP WARREN',
};

export interface Room {
  kind: RoomKind;
  level: number;   // 0 = undug; production/capacity only when level >= 1
  dug: number;     // dig work done toward the next level
}

export type Caste = 'none' | 'digger' | 'hauler' | 'wheel' | 'gnawer' | 'nurse' | 'enforcer' | 'outcast' | 'keeper';

// Activity → maps to an animation in the renderer
export enum Act {
  Idle = 0, Dig, Haul, Wheel, Gnaw, Eat, Sleep, Nurse, Sick, Starve, Protest, Vote, Cheer, Cower,
  Patrol, Beg, Pray, Teach, Fight, Suckle, Play, Throne, Feast, Scraps, Dead, Collapse, Shake, Press,
}

export interface Rat {
  id: number;
  name: string;
  sex: 0 | 1; // 0 male, 1 female
  age: number; // days
  life: number; // lifespan days
  health: number; // 0..1
  sat: number; // satiety 0..1
  satSlow: number; // slow EMA of satiety → poverty
  rest: number;
  social: number;
  // emotions 0..1
  content: number; hope: number; fear: number; fearSlow: number; anger: number; despair: number; loyalty: number;
  // traits 0..1
  dil: number; bold: number; cred: number; soc: number; con: number;
  caste: Caste;
  eff: number; // efficiency EMA (output / caste mean)
  work: number; // lifetime output
  room: number; act: Act;
  preg: number; // days left of gestation, 0 = not
  father: number;
  lastLitter: number; // day
  litters: number;
  inf: number; // days infected (0 = healthy)
  immune: number; // days of immunity left
  shaking: number; // prion sickness severity
  isKing: boolean;
  founder: boolean;
  mother: number;
  grief: number; // recent kin death 0..1
  out: number; // last output per day
}

export interface Corpse { id: number; room: number; age: number; kind: 'adult' | 'pup' | 'king'; violent: boolean; }
export interface Item { id: number; kind: 'scrap' | 'food'; x: number; y: number; room: number; }

export interface Reign {
  kingId: number; name: string; start: number; end: number | null;
  laws: string[]; cause: string | null; pop: number[]; remembered: { law: string; text: string } | null;
  peakLuxury: number;
}

export interface CityEvent { day: number; tick: number; kind: string; text: string; }

export interface Gathering {
  startTick: number; endTick: number; voters: number[]; votes: number[]; // 1 kill 0 spare
  kingAlive: boolean; suppressed: boolean; result: 'kill' | 'spare' | 'crown' | null;
}

export type Phase = 'founding' | 'reign' | 'interregnum' | 'gathering' | 'dead';

export interface KingState {
  id: number; // -1 none
  luxury: number; appetite: number; plate: 'feast' | 'meal' | 'scraps' | 'empty' | 'none';
  plateRatio: number; emptyDays: number; dying: boolean; fat: number; stash: number;
  titheAcc: number; rotOnPlate: number; spared: boolean; deadSinceTick: number; corpseAge: number;
  reignNo: number; lastPlateTick: number; feastInFamine: number;
}

export interface LawState { since: number; pressed: number; adopt: number; reached: number[]; repealing: boolean }
/** A herald carries a decree from the throne through the districts, one room at a time. */
export interface Herald { id: number; law: string; kind: 'pass' | 'repeal' | 'abolish'; path: number[]; step: number; t: number }

export type Trait = 'greed' | 'fear' | 'piety' | 'cruelty' | 'reckless' | 'sloth' | 'mercy';
export interface KingMind {
  persona: Record<Trait, number>;
  traits: string[]; // top labels, e.g. ['GREEDY','PARANOID']
  values: Record<string, number>; // learned: did this button seem to fill my plate? (-1..1)
  tries: Record<string, number>;
  baseline: number; // EMA of plate pleasure
  lastPress: number; // tick
  nextThink: number; // tick
  thought: string;
  reaching: string | null; // law id he is about to press (for the watched board)
  reachingKind: 'pass' | 'repeal' | 'abolish' | null;
  pressLog: { tick: number; id: string; kind: 'pass' | 'repeal' | 'abolish' }[];
  plateHist: number[]; // last plate ratios
}

export interface FounderState {
  task: 'idle' | 'dig' | 'toSurface' | 'pick' | 'carry' | 'eat' | 'court' | 'rest';
  room: number; timer: number; item: number; itemX: number;
  carried: { scrap: number; food: number }; scrapCollected: number; mateId: number; mated: boolean; objective: number;
}

export interface DayStat {
  day: number; pop: number; adults: number; pups: number; food: number; foodIn: number; births: number; deaths: number;
  content: number; anger: number; despair: number; loyalty: number; fear: number; grievance: number; prod: number;
  plate: number; sick: number; king: number; luxury: number; health: number; scrap: number;
}

export interface SimState {
  version: 1;
  seed: number; rng: number; tick: number; phase: Phase;
  rats: Rat[]; nextId: number;
  rooms: Room[];
  food: number; scrap: number; power: number;
  king: KingState;
  /** laws the king has pressed. adopt 0..1 = share of districts the herald has reached (effects scale with it).
   *  since = tick the law is considered fully proclaimed (press tick + spread time); used for delayed effects. */
  laws: Record<string, LawState>;
  heralds: Herald[];
  mind: KingMind | null;
  cooldown: Record<string, number>; // law → tick when it can be passed again
  lawsPassedTotal: number;
  peakPop: number; totalDead: number; totalBorn: number; exiled: number;
  corpses: Corpse[]; items: Item[];
  events: CityEvent[]; // ring (last 40)
  eventSeq: number;
  history: DayStat[];
  reigns: Reign[];
  revealed: string[]; // law ids whose truth is known
  gathering: Gathering | null;
  grievDays: number; // consecutive days over threshold
  lastGatherSpared: boolean;
  suppressedCount: number;
  droneAttention: number;
  founder: FounderState;
  digTarget: number; // room index city is digging
  chaosUntil: number; // tick
  faithCollapseUntil: number;
  feastDayFlag: boolean;
  dayAcc: { births: number; deaths: number; foodIn: number; output: number; workerTicks: number };
  lastDeathCause: Record<string, number>;
  flags: { gore: boolean };
  cachedGriev?: number;
  lastResult: { result: 'kill' | 'spare' | 'crown'; kills: number; total: number; tick: number } | null;
}

export const OBJECTIVES = [
  'DIG THE DRAIN MOUTH',
  'HAUL 3 SCRAP INTO THE BURROW',
  'DIG THE THRONE HALL',
  'DIG THE GRANARY AND STORE 6 FOOD',
  'DIG THE NURSERY',
  'TAKE A MATE',
  'AWAIT THE FIRST LITTER',
] as const;
