// Shared A/B harness: grown city, king AI disabled, one law enacted instantly; returns daily metrics.
import { createState, step, enactNow, growCity, cityGrievance } from '../src/sim/sim';
import { TPD } from '../src/sim/types';
import type { SimState } from '../src/sim/types';

export type Metric = (s: SimState) => number;
const avg = (s: SimState, f: (r: SimState['rats'][number]) => number) => {
  const a = s.rats.filter((r) => r.age >= 6 && !r.isKing); return a.length ? a.reduce((x, r) => x + f(r), 0) / a.length : 0;
};
export const M: Record<string, Metric> = {
  health: (s) => avg(s, (r) => r.health), loyalty: (s) => avg(s, (r) => r.loyalty), fear: (s) => avg(s, (r) => r.fear),
  despair: (s) => avg(s, (r) => r.despair), anger: (s) => avg(s, (r) => r.anger), content: (s) => avg(s, (r) => r.content),
  hope: (s) => avg(s, (r) => r.hope), grievance: (s) => cityGrievance(s),
  food: (s) => s.food, births: (s) => s.totalBorn, deaths: (s) => s.totalDead, pop: (s) => s.rats.length,
  foodIn: (s) => s.history[s.history.length - 1]?.foodIn ?? 0, prod: (s) => s.history[s.history.length - 1]?.prod ?? 0,
  plate: (s) => s.king.plateRatio, sick: (s) => s.rats.filter((r) => r.inf > 0).length,
  power: (s) => s.power, outcasts: (s) => s.rats.filter((r) => r.caste === 'outcast').length,
  heart: (s) => s.lastDeathCause['a burst heart on the wheel'] ?? 0,
  shaking: (s) => s.rats.filter((r) => r.shaking > 0).length + (s.lastDeathCause['the shaking sickness'] ?? 0),
  predators: (s) => (s.lastDeathCause['a cat'] ?? 0) + (s.lastDeathCause['a human boot'] ?? 0),
  pupDeaths: (s) => (s.lastDeathCause['worked to death in the tunnels'] ?? 0) + (s.lastDeathCause['collapse in the tunnels'] ?? 0),
  laws: (s) => Object.keys(s.laws).length,
};

/** Mean of metric over days [from, to) after enactment. */
export function runAB(seed: number, law: string | null, metric: Metric, from: number, to: number, popN = 60): number {
  const s = createState(seed);
  growCity(s, popN);
  for (let i = 0; i < 2 * TPD; i++) { s.mind = null; step(s); }
  if (law) enactNow(s, law);
  let sum = 0, n = 0;
  for (let d = 0; d < to; d++) {
    for (let i = 0; i < TPD; i++) { s.mind = null; step(s); }
    if (d >= from) { sum += metric(s); n++; }
    if (!s.rats.length) break;
  }
  return n ? sum / n : 0;
}
