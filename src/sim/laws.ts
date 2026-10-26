import type { SimState } from './types';
import { TPD } from './types';

export interface LawDef {
  id: string; n: number; name: string; prop: string; tier: number;
  conflicts?: string[]; truth: string; room?: 'shrine' | 'barracks' | 'graveyard';
}

// Tier unlock thresholds by PEAK population: tier 0 at crowning, then 10 / 30 / 80 / 150 rats.
export const TIER_POP = [0, 10, 30, 80, 150];

export const LAWS: LawDef[] = [
  { n: 1, id: 'longer_shifts', name: 'LONGER SHIFTS', prop: 'IDLE PAWS STARVE.', tier: 0, conflicts: ['rest_day'], truth: 'Output rises for three days, then exhausted rats collapse and output falls below normal. Health drains.' },
  { n: 2, id: 'rest_day', name: 'REST DAY', prop: 'EVEN THE WHEEL MUST STOP.', tier: 0, conflicts: ['longer_shifts'], truth: 'One idle day in seven, but fewer sick rats: after five days the city outworks itself.' },
  { n: 3, id: 'double_tithe', name: 'DOUBLE TITHE', prop: 'FEED THE CROWN, FEED THE CITY.', tier: 0, conflicts: ['tithe_holiday'], truth: 'The king feasts; the poor grow poorer and their grievance climbs fast. Loyalty falls.' },
  { n: 4, id: 'tithe_holiday', name: 'TITHE HOLIDAY', prop: 'THE CROWN FASTS WITH YOU.', tier: 0, conflicts: ['double_tithe'], truth: 'Loyalty soars and the city prospers while the king himself starves.' },
  { n: 5, id: 'breeding_bounty', name: 'BREEDING BOUNTY', prop: 'MORE PAWS, MORE GLORY.', tier: 0, conflicts: ['litter_limit'], truth: 'Litters double. After eight days crowding breeds disease and misery.' },
  { n: 6, id: 'litter_limit', name: 'LITTER LIMIT', prop: 'ONE NEST, ONE LITTER.', tier: 1, conflicts: ['breeding_bounty'], truth: 'Births collapse and mothers despair, but each rat eats better and lives healthier.' },
  { n: 7, id: 'curfew', name: 'CURFEW', prop: 'DARK TUNNELS ARE SAFE TUNNELS.', tier: 1, conflicts: ['free_squeak'], truth: 'Fewer rats are taken by predators, but loneliness breeds slow despair and fewer births.' },
  { n: 8, id: 'enforcers', name: 'ENFORCERS', prop: 'ORDER PROTECTS THE LOYAL.', tier: 2, truth: 'A caste of enforcers spreads fear and short-term output and crushes gatherings, while anger quietly builds toward a bigger riot.', room: 'barracks' },
  { n: 9, id: 'public_punishment', name: 'PUBLIC PUNISHMENT', prop: 'SEE WHAT LAZINESS COSTS.', tier: 2, truth: 'Fear spikes and output rises briefly; witnesses sink into despair and bold rats turn angry.' },
  { n: 10, id: 'open_granary', name: 'OPEN GRANARY', prop: 'NO RAT GOES HUNGRY.', tier: 0, conflicts: ['ration_cards', 'merit_rations'], truth: 'Bellies fill and spirits lift, but hoarding drains the granary in days. Then famine.' },
  { n: 11, id: 'ration_cards', name: 'RATION CARDS', prop: 'FAIR SHARES FOR ALL.', tier: 2, conflicts: ['open_granary', 'merit_rations'], truth: 'Hunger is shared evenly, but diligent rats lose their reason to work, and a black market of outcasts appears.' },
  { n: 12, id: 'merit_rations', name: 'MERIT RATIONS', prop: 'EAT WHAT YOU EARN.', tier: 2, conflicts: ['open_granary', 'ration_cards'], truth: 'The strong work harder; the weak and old starve. The ruthless rise toward the throne.' },
  { n: 13, id: 'quarantine_pit', name: 'QUARANTINE PIT', prop: 'SEPARATE THE SICK.', tier: 2, truth: 'Plague spreads slower, but the sick die alone in the pit; their families despair and loyalty falls.', room: 'graveyard' },
  { n: 14, id: 'burn_the_dead', name: 'BURN THE DEAD', prop: 'SMOKE CLEANSES.', tier: 1, conflicts: ['eat_the_dead'], truth: 'Corpses no longer spread disease, but the smoke chokes the nursery and fewer pups are born.' },
  { n: 15, id: 'eat_the_dead', name: 'EAT THE DEAD', prop: 'WASTE NOTHING.', tier: 1, conflicts: ['burn_the_dead'], truth: 'Corpses become food. After six days the shaking sickness begins, and it rots the body.' },
  { n: 16, id: 'shrine', name: 'SHRINE OF THE CROWN', prop: 'THE CROWN SEES ALL.', tier: 2, conflicts: ['ban_shrine'], truth: 'Loyalty and credulity rise, keepers leave the wheel. When the king dies, faith collapses into misery.', room: 'shrine' },
  { n: 17, id: 'ban_shrine', name: 'BAN THE SHRINE', prop: 'NO IDOLS, ONLY WORK.', tier: 3, conflicts: ['shrine'], truth: 'A little more output, but hope dies and a prophet leads followers into the outcast slum.' },
  { n: 18, id: 'raid_surface', name: 'RAID THE SURFACE', prop: 'TAKE FROM THE GIANTS.', tier: 1, conflicts: ['seal_grates'], truth: 'Food floods in, but the exterminators notice. Gas follows, and the boldest die first.' },
  { n: 19, id: 'seal_grates', name: 'SEAL THE GRATES', prop: 'THE WORLD ABOVE IS DEATH.', tier: 1, conflicts: ['raid_surface'], truth: 'No more drones, but forage falls and the air goes stale, slowly sickening everyone.' },
  { n: 20, id: 'child_labour', name: 'CHILD LABOUR', prop: 'SMALL PAWS, SMALL TUNNELS.', tier: 1, truth: 'Pups dig and gnaw, but they die young, and after four days the adults turn angry.' },
  { n: 21, id: 'elder_exile', name: 'ELDER EXILE', prop: 'THE OLD EAT THE YOUNG\'S BREAD.', tier: 3, truth: 'Fewer mouths to feed, but the elders\' wisdom is lost: more disease deaths, more predator deaths, lower spirits.' },
  { n: 22, id: 'wheel_quotas', name: 'WHEEL QUOTAS', prop: 'SPIN OR STARVE.', tier: 2, truth: 'The wheels spin faster, and the runners\' hearts burst. Sudden deaths.' },
  { n: 23, id: 'free_squeak', name: 'FREE SQUEAK', prop: 'LET THE CITY SPEAK.', tier: 3, conflicts: ['curfew', 'silence_law'], truth: 'Spirits and hope rise; grievance is voiced openly, so gatherings come sooner, but more kings are spared.' },
  { n: 24, id: 'silence_law', name: 'SILENCE LAW', prop: 'LOOSE SQUEAKS SINK CITIES.', tier: 3, conflicts: ['free_squeak'], truth: 'Fewer gatherings, but anger grows unseen and the rebellion threshold silently drops to 30%.' },
  { n: 25, id: 'free_election', name: 'FREE ELECTION', prop: 'THE CITY CHOOSES.', tier: 4, truth: 'Loyalty shifts to the city. The next king is the most popular rat, not the most able, and enforcers are barred.' },
  { n: 26, id: 'royal_guard', name: 'ROYAL GUARD', prop: 'SHIELD THE CROWN.', tier: 3, truth: 'The king is harder to execute, but the guards eat first: a fifth of the tithe and a share of the granary vanish.' },
  { n: 27, id: 'feast_days', name: 'FEAST DAYS', prop: 'REJOICE UNDER THE CROWN.', tier: 0, truth: 'Every fifth day joy and loyalty surge, the granary is gutted and plague spreads through the crowds.' },
  { n: 28, id: 'outcast_purge', name: 'OUTCAST PURGE', prop: 'CLEAN TUNNELS.', tier: 4, truth: 'Theft stops because the outcasts are killed. Bold rats seethe at the blood.' },
  { n: 29, id: 'mating_lottery', name: 'MATING LOTTERY', prop: 'THE CROWN PAIRS THE WORTHY.', tier: 3, truth: 'Only the efficient breed, shifting the bloodline; the rest grow lonely, despairing and violent.' },
  { n: 30, id: 'abolish_laws', name: 'ABOLISH LAWS', prop: 'BEGIN AGAIN.', tier: 0, truth: 'Every law is torn down. Two days of chaos cut output, but loyalty rises for the new start.' },
];
export const LAW_BY_ID: Record<string, LawDef> = Object.fromEntries(LAWS.map((l) => [l.id, l]));
export const MAX_ACTIVE = 8;

export interface Mods {
  workTicks: number; prod: number; wheel: number; dig: number; forageK: number; tithe: number; fert: number;
  healthDay: number; content: number; hope: number; fear: number; anger: number; despair: number; loyalty: number; social: number;
  predator: number; beta: number; diseaseMort: number; hoard: number; ration: 'free' | 'equal' | 'merit';
  enforcers: boolean; gatherDays: number; gatherThreshold: number; killBias: number; restDayToday: boolean;
  childLabour: boolean; childDeath: number; elderExile: boolean; heartFail: number; crowdCap: number;
  corpseFood: boolean; corpseRot: number; quarantine: boolean; shrine: boolean; prophet: boolean; drone: number;
  outcastBlackMarket: boolean; purge: boolean; lottery: boolean; fights: number; election: boolean; guard: boolean;
  feastToday: boolean; restDrain: number; shaking: boolean; nurseDespair: number; exhaustion: boolean;
}

/** Days since the law was fully proclaimed (fractional, >= 0). */
const age = (s: SimState, id: string) => Math.max(0, (s.tick - s.laws[id].since) / TPD);

/**
 * Effective modifiers. A pressed law only bites as far as its herald has carried it:
 * numeric effects are interpolated by adoption; switches flip once half the districts have it.
 */
export function computeMods(s: SimState): Mods {
  const full = new Set<string>(), partial: string[] = [];
  for (const [id, l] of Object.entries(s.laws)) {
    if (l.adopt >= 0.999) full.add(id); else if (l.adopt > 0.001) partial.push(id);
  }
  const base = rawMods(s, full);
  if (!partial.length) return base;
  const out: any = { ...base };
  for (const id of partial) {
    const a = s.laws[id].adopt;
    const w: any = rawMods(s, new Set([...full, id]));
    for (const k of Object.keys(w)) {
      const bv = (base as any)[k], wv = w[k];
      if (typeof wv === 'number') out[k] += (wv - bv) * a;
      else if (a >= 0.5 && wv !== bv) out[k] = wv;
    }
  }
  return out as Mods;
}

function rawMods(s: SimState, active: Set<string>): Mods {
  const day = Math.floor(s.tick / TPD);
  const m: Mods = {
    workTicks: 13, prod: 1, wheel: 1, dig: 1, forageK: 1, tithe: 0.15, fert: 1, healthDay: 0, content: 0, hope: 0, fear: 0,
    anger: 0, despair: 0, loyalty: 0, social: 0, predator: 1, beta: 1, diseaseMort: 1, hoard: 1, ration: 'free',
    enforcers: false, gatherDays: 2, gatherThreshold: 0.4, killBias: 0, restDayToday: false, childLabour: false,
    childDeath: 0, elderExile: false, heartFail: 0, crowdCap: 1, corpseFood: false, corpseRot: 1, quarantine: false,
    shrine: false, prophet: false, drone: 0, outcastBlackMarket: false, purge: false, lottery: false, fights: 0,
    election: false, guard: false, feastToday: false, restDrain: 1, shaking: false, nurseDespair: 0, exhaustion: false,
  };
  const has = (id: string) => active.has(id);
  if (s.lastGatherSpared) m.gatherThreshold = 0.3;
  if (has('longer_shifts')) {
    m.workTicks = 16; m.restDrain = 1.3; m.content -= 0.06; m.healthDay -= 0.008;
    if (age(s, 'longer_shifts') < 3) m.prod *= 1.12; else { m.prod *= 0.75; m.exhaustion = true; m.healthDay -= 0.015; m.despair += 0.05; }
  }
  if (has('rest_day')) {
    m.restDayToday = day % 7 === 6; m.content += 0.08; m.healthDay += 0.03; m.beta *= 0.6; m.diseaseMort *= 0.6;
    if (age(s, 'rest_day') >= 5) m.prod *= 1.12;
  }
  if (has('double_tithe')) { m.tithe = 0.32; m.content -= 0.08; m.loyalty -= 0.22; m.anger += 0.12; }
  if (has('tithe_holiday')) { m.tithe = 0.02; m.loyalty += 0.3; m.content += 0.08; m.hope += 0.1; }
  if (has('breeding_bounty')) {
    m.fert *= 2.2;
    if (age(s, 'breeding_bounty') >= 8) { m.crowdCap *= 0.7; m.beta *= 1.6; m.content -= 0.1; m.despair += 0.05; }
  }
  if (has('litter_limit')) { m.fert *= 0.15; m.nurseDespair += 0.2; m.healthDay += 0.02; }
  if (has('curfew')) {
    m.predator *= 0.25; m.social -= 0.35; m.fert *= 0.75;
    m.despair += Math.min(0.18, 0.04 * age(s, 'curfew'));
  }
  if (has('enforcers')) {
    m.enforcers = true; m.fear += 0.22;
    if (age(s, 'enforcers') < 3) m.prod *= 1.08;
    m.anger += Math.min(0.15, 0.03 * age(s, 'enforcers')); m.killBias += 0.4;
  }
  if (has('public_punishment')) {
    m.fear += 0.3; m.despair += 0.14; m.anger += 0.06;
    if (age(s, 'public_punishment') < 3) m.prod *= 1.1;
  }
  if (has('open_granary')) { m.hoard = 1.6; m.content += 0.1; }
  if (has('ration_cards')) { m.ration = 'equal'; m.prod *= 0.88; m.outcastBlackMarket = true; }
  if (has('merit_rations')) { m.ration = 'merit'; m.prod *= 1.06; }
  if (has('quarantine_pit')) { m.quarantine = true; m.beta *= 0.35; m.diseaseMort *= 1.5; m.despair += 0.06; m.loyalty -= 0.08; }
  if (has('burn_the_dead')) { m.corpseRot = 0; m.beta *= 0.8; m.fert *= 0.65; }
  if (has('eat_the_dead')) { m.corpseFood = true; if (age(s, 'eat_the_dead') >= 6) m.shaking = true; }
  if (has('shrine')) { m.shrine = true; m.loyalty += 0.22; m.prod *= 0.94; m.hope += 0.05; }
  if (has('ban_shrine')) { m.prod *= 1.05; m.hope -= 0.18; m.prophet = true; }
  if (has('raid_surface')) { m.forageK *= 1.6; m.drone = 0.07; }
  if (has('seal_grates')) {
    m.forageK *= 0.7; m.predator *= 0.5; m.drone = -1;
    m.healthDay -= Math.min(0.03, 0.005 * age(s, 'seal_grates')); m.beta *= 1.1;
  }
  if (has('child_labour')) {
    m.childLabour = true; m.childDeath = 0.05;
    if (age(s, 'child_labour') >= 4) m.anger += 0.16;
  }
  if (has('elder_exile')) { m.elderExile = true; m.diseaseMort *= 1.3; m.predator *= 1.6; m.content -= 0.08; }
  if (has('wheel_quotas')) { m.wheel *= 1.6; m.heartFail = 0.012; }
  if (has('free_squeak')) { m.content += 0.07; m.hope += 0.18; m.gatherDays = 1; m.gatherThreshold = 0.3; m.killBias -= 1.2; }
  if (has('silence_law')) { m.gatherDays = 4; m.gatherThreshold = 0.3; m.anger += 0.14; }
  if (has('free_election')) { m.election = true; m.loyalty -= 0.08; m.hope += 0.05; }
  if (has('royal_guard')) { m.guard = true; m.killBias -= 1.4; }
  if (has('feast_days')) {
    const fd = (day - Math.floor(s.laws.feast_days.since / TPD)) % 5 === 0;
    m.feastToday = fd; m.loyalty += 0.08; if (fd) { m.content += 0.3; m.beta *= 2.2; }
  }
  if (has('outcast_purge')) { m.purge = true; m.anger += 0.04; }
  if (has('mating_lottery')) { m.lottery = true; m.fert *= 0.85; m.social -= 0.25; m.despair += 0.12; m.fights = 0.004; }
  if (s.tick < s.chaosUntil) { m.prod *= 0.5; m.loyalty += 0.2; }
  if (s.tick < s.faithCollapseUntil) { m.content -= 0.3; m.despair += 0.2; }
  if (m.restDayToday) m.workTicks = 0;
  return m;
}
