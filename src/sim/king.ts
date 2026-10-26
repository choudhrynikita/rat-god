// The king has free will. He sits on his throne, eats what the city sends up, and presses
// buttons on his board chasing a fuller plate and more pleasure. He does not know what
// the laws really do; he believes their propaganda, then learns (often wrongly) from
// what his plate does in the days after each press. Each king has his own temperament.
import { lawAvailable, pressLaw } from './decree';
import { LAWS, LAW_BY_ID } from './laws';
import { nextRand } from './rng';
import { TPD, type KingMind, type SimState, type Trait } from './types';

/** What a king *believes* each button gives him (from the propaganda, not the truth). */
type Tag = 'food' | 'safety' | 'faith' | 'joy' | 'order' | 'breed' | 'blood' | 'kind';
const BELIEF: Record<string, Partial<Record<Tag, number>>> = {
  longer_shifts: { food: 0.8, order: 0.3 },
  rest_day: { kind: 0.7, joy: 0.2 },
  double_tithe: { food: 1.2 },
  tithe_holiday: { kind: 1, joy: 0.3 },
  breeding_bounty: { breed: 1, food: 0.3 },
  litter_limit: { kind: 0.3, order: 0.4 },
  curfew: { safety: 0.8, order: 0.5 },
  enforcers: { safety: 1.1, order: 0.8 },
  public_punishment: { order: 0.9, blood: 0.8, food: 0.3 },
  open_granary: { kind: 0.9, joy: 0.5 },
  ration_cards: { kind: 0.5, order: 0.4 },
  merit_rations: { food: 0.5, order: 0.4, blood: 0.2 },
  quarantine_pit: { safety: 0.6, order: 0.3 },
  burn_the_dead: { safety: 0.5 },
  eat_the_dead: { food: 0.7, blood: 0.6 },
  shrine: { faith: 1.2, safety: 0.4 },
  ban_shrine: { order: 0.5, food: 0.2 },
  raid_surface: { food: 1, blood: 0.3 },
  seal_grates: { safety: 0.9 },
  child_labour: { food: 0.6, blood: 0.5 },
  elder_exile: { food: 0.5, blood: 0.5 },
  wheel_quotas: { food: 0.5, order: 0.5 },
  free_squeak: { kind: 0.8, joy: 0.5 },
  silence_law: { safety: 0.8, order: 0.6 },
  free_election: { kind: 0.6 },
  royal_guard: { safety: 1.2 },
  feast_days: { joy: 1.1, faith: 0.4, food: 0.3 },
  outcast_purge: { order: 0.7, blood: 0.9 },
  mating_lottery: { breed: 0.6, order: 0.5 },
  abolish_laws: {},
};

/** how much each temperament values each kind of promise */
const TASTE: Record<Trait, Partial<Record<Tag, number>>> = {
  greed: { food: 1.2, joy: 0.5, kind: -0.6 },
  fear: { safety: 1.2, order: 0.6, kind: -0.2 },
  piety: { faith: 1.3, kind: 0.3 },
  cruelty: { blood: 1.2, order: 0.5, kind: -0.8 },
  reckless: { blood: 0.3, joy: 0.5, breed: 0.4 },
  sloth: { joy: 0.6, food: 0.3 },
  mercy: { kind: 1.2, blood: -1, joy: 0.2 },
};
const TRAIT_LABEL: Record<Trait, string> = { greed: 'GREEDY', fear: 'PARANOID', piety: 'PIOUS', cruelty: 'CRUEL', reckless: 'RECKLESS', sloth: 'SLOTHFUL', mercy: 'SOFT-HEARTED' };
const TRAITS: Trait[] = ['greed', 'fear', 'piety', 'cruelty', 'reckless', 'sloth', 'mercy'];

export function newMind(s: SimState, bold: number, soc: number, cred: number): KingMind {
  const r = () => nextRand(s);
  const persona = {
    greed: 0.35 + 0.65 * r(), // every king is a little greedy
    fear: 0.2 * (1 - bold) + 0.8 * r() * r(),
    piety: 0.6 * cred * r() + 0.2 * r(),
    cruelty: 0.4 * bold * r() + 0.5 * r() * r(),
    reckless: 0.5 * bold * r() + 0.4 * r() * r(),
    sloth: 0.7 * r() * r(),
    mercy: 0.5 * soc * r() + 0.3 * r() * r(),
  } as Record<Trait, number>;
  const ranked = [...TRAITS].sort((a, b) => persona[b] - persona[a]);
  const traits = ranked.slice(0, 2).filter((t) => persona[t] > 0.35).map((t) => TRAIT_LABEL[t]);
  if (!traits.length) traits.push('MEEK');
  return {
    persona, traits, values: {}, tries: {}, baseline: 1, lastPress: s.tick, nextThink: s.tick + Math.floor(TPD * 0.6),
    thought: 'THE THRONE IS MINE. WHAT DO THESE BUTTONS DO?', reaching: null, reachingKind: null, pressLog: [], plateHist: [],
  };
}

const plateScore = (s: SimState) => Math.min(2, s.king.plateRatio) + 0.15 * s.king.luxury;

/** Called once at dusk after the plate arrives: credit recent presses with how the plate changed. */
export function kingLearn(s: SimState) {
  const m = s.mind;
  if (!m) return;
  const score = plateScore(s);
  m.plateHist.push(Math.round(s.king.plateRatio * 100) / 100);
  if (m.plateHist.length > 10) m.plateHist.shift();
  const reward = score - m.baseline;
  for (const p of m.pressLog) {
    const ageD = (s.tick - p.tick) / TPD;
    if (ageD > 5) continue;
    const trace = Math.exp(-ageD / 2.2); // he blames whatever he pressed most recently
    const sign = p.kind === 'repeal' ? -1 : 1;
    const v = m.values[p.id] ?? 0;
    m.values[p.id] = Math.max(-1, Math.min(1, v + 0.35 * trace * (sign * reward - v * 0.2)));
  }
  m.baseline += (score - m.baseline) * 0.3;
  if (m.pressLog.length > 40) m.pressLog.splice(0, m.pressLog.length - 40);
}

/** What the king perceives of the city from his throne: mutters, his plate, rumours. */
function perceive(s: SimState, grievance: number) {
  const k = s.king;
  const hunger = Math.max(0, 1.1 - k.plateRatio) + 0.4 * Math.min(3, k.emptyDays);
  const threat = Math.min(1.5, grievance * 1.6 + (s.gathering ? 0.8 : 0) + (s.lastResult?.result === 'spare' ? 0.4 : 0));
  const sick = s.rats.length ? s.rats.filter((r) => r.inf > 0).length / s.rats.length : 0;
  const small = s.rats.length < 25 ? 1 : 0;
  const bored = Math.max(0, 1 - 0.1 * k.luxury) * (k.plateRatio >= 1.5 ? 1 : 0.3);
  return { hunger, threat, sick, small, bored };
}

/** Called every tick while reigning. Mostly he eats and sulks; now and then he presses. */
export function kingThink(s: SimState, grievance: number) {
  const m = s.mind;
  if (!m || s.phase !== 'reign' || s.tick < m.nextThink) return;
  const P = m.persona;
  const sense = perceive(s, grievance);
  // a reached-for button is pressed on the next think
  if (m.reaching) {
    const id = m.reaching;
    m.reaching = null; m.reachingKind = null;
    if (pressLaw(s, id)) { m.lastPress = s.tick; m.tries[id] = (m.tries[id] ?? 0) + 1; }
    m.nextThink = s.tick + 3;
    return;
  }
  m.nextThink = s.tick + 4 + Math.floor(nextRand(s) * 6);
  const sinceDays = (s.tick - m.lastPress) / TPD;
  const urge = 0.05 + 0.55 * sense.hunger + 0.5 * sense.threat * P.fear + 0.35 * P.reckless + 0.25 * sense.bored - 0.35 * P.sloth + 0.12 * sinceDays;
  const minGap = (s.reigns.length <= 1 ? 2.5 : 1.8) + 2.2 * (1 - P.reckless) + 1.5 * P.sloth - 0.8 * Math.min(1, sense.hunger);
  if (sinceDays < minGap || nextRand(s) > Math.min(0.9, urge) * 0.5) {
    if (nextRand(s) < 0.25) m.thought = idleThought(s, sense);
    return;
  }
  // score every button
  const weight: Record<Tag, number> = { food: 0, safety: 0, faith: 0, joy: 0, order: 0, breed: 0, blood: 0, kind: 0 };
  for (const t of TRAITS) for (const [tag, w] of Object.entries(TASTE[t])) weight[tag as Tag] += P[t] * (w as number);
  weight.food += 1.1 * sense.hunger;
  weight.safety += 1.2 * sense.threat * (0.4 + P.fear);
  weight.order += 0.5 * sense.threat;
  weight.breed += 0.6 * sense.small;
  weight.joy += 0.5 * sense.bored;
  let best: { id: string; score: number; kind: 'pass' | 'repeal' | 'abolish'; why: string } | null = null;
  for (const d of LAWS) {
    const a = lawAvailable(s, d.id);
    if (!a.ok) continue;
    const learned = m.values[d.id] ?? 0;
    let score: number, why: string;
    if (a.kind === 'pass') {
      let belief = 0, topTag: Tag = 'food', topV = -9;
      for (const [tag, v] of Object.entries(BELIEF[d.id])) { const c = weight[tag as Tag] * (v as number); belief += c; if (c > topV) { topV = c; topTag = tag as Tag; } }
      const nActive = Object.values(s.laws).filter((l) => !l.repealing).length;
      score = 0.6 * belief + 1.6 * learned - 0.15 * (m.tries[d.id] ?? 0) * (learned < 0 ? 1 : 0) - 0.22 * Math.max(0, nActive - 3);
      why = learned > 0.15 ? `LAST TIME I PRESSED ${d.name} MY PLATE GREW. AGAIN.` : passThought(d.name, topTag);
    } else if (a.kind === 'repeal') {
      const l = s.laws[d.id];
      if (l.adopt < 1) continue; // he waits for it to reach the districts before judging
      const inForce = (s.tick - l.since) / TPD;
      const nActive = Object.values(s.laws).filter((x) => !x.repealing).length;
      score = -2.2 * learned - 0.3 + (inForce > 4 && learned < 0.05 ? 0.35 : 0) + (learned <= 0.05 ? 0.7 * Math.min(1.5, sense.hunger) : 0) + 0.12 * Math.max(0, nActive - 4) + 0.55 * sense.threat * (0.5 + P.fear);
      why = sense.threat > 0.7 && learned > -0.1 ? `THE PLAZA HATES ${d.name}. LET IT GO. FOR NOW.` : learned < -0.1 ? `${d.name} HAS STARVED MY PLATE. STRIKE IT.` : `${d.name} DOES NOTHING FOR ME.`;
    } else {
      const bad = Object.keys(s.laws).filter((id) => (m.values[id] ?? 0) < -0.1).length;
      score = bad >= 3 && sense.hunger > 0.8 ? 1 + 0.5 * P.reckless : -9;
      why = 'NOTHING WORKS. TEAR IT ALL DOWN.';
    }
    score += (nextRand(s) - 0.5) * (0.4 + 1.2 * P.reckless); // whim
    if (!best || score > best.score) best = { id: d.id, score, kind: a.kind, why };
  }
  if (!best || best.score < 0.45) { m.thought = idleThought(s, sense); return; }
  m.reaching = best.id; m.reachingKind = best.kind;
  m.thought = best.why;
  m.nextThink = s.tick + 3; // visible reach before the press
}

function passThought(name: string, tag: Tag) {
  switch (tag) {
    case 'food': return `MY PLATE IS THIN. ${name} WILL FILL IT.`;
    case 'safety': return `I HEAR THEM MUTTERING. ${name} WILL KEEP ME SAFE.`;
    case 'faith': return `THEY SHOULD WORSHIP ME. ${name}.`;
    case 'joy': return `I AM BORED. ${name} WILL MAKE THEM SING.`;
    case 'order': return `THE TUNNELS ARE UNRULY. ${name}.`;
    case 'breed': return `TOO FEW BACKS TO CARRY MY FOOD. ${name}.`;
    case 'blood': return `THEY NEED A LESSON. ${name}.`;
    default: return `THEY WILL LOVE ME FOR ${name}.`;
  }
}

function idleThought(s: SimState, sense: ReturnType<typeof perceive>) {
  const k = s.king;
  if (k.dying) return 'THE PLATE IS EMPTY. WHY DO THEY NOT FEED ME?';
  if (sense.threat > 0.8) return 'THE PLAZA IS LOUD TONIGHT. I DO NOT LIKE IT.';
  if (k.plate === 'feast') return k.luxury > 4 ? 'MORE. ALWAYS MORE.' : 'GOOD. GOOD. THE CITY LOVES ME.';
  if (k.plate === 'scraps' || k.plate === 'empty') return 'SCRAPS AGAIN. SOMEONE IS STEALING FROM ME.';
  const spreading = s.heralds[0];
  if (spreading) return `MY HERALD CARRIES ${LAW_BY_ID[spreading.law].name}. SOON.`;
  return 'I CHEW. I WAIT. I AM KING.';
}
