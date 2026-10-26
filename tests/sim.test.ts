import { describe, it, expect } from 'vitest';
import { createState, step, growCity, enactNow, applyCommand, snapshot, inspectRat, chronicle, king, cityGrievance } from '../src/sim/sim';
import { pressLaw, lawAvailable } from '../src/sim/decree';
import { LAWS, computeMods } from '../src/sim/laws';
import { R, TPD } from '../src/sim/types';
import type { SimState } from '../src/sim/types';
import { runAB, M } from './lawab';

const days = (s: SimState, d: number, noKing = false) => { for (let i = 0; i < d * TPD; i++) { if (noKing) s.mind = null; step(s); if (!s.rats.length) break; } };

describe('economy', () => {
  it('undug rooms produce nothing', () => {
    const s = createState(3); growCity(s, 40);
    s.rooms[R.entrance].level = 0; s.rooms[R.workshop].level = 0; s.scrap = 0; s.power = 0;
    for (let d = 0; d < 3; d++) { days(s, 1, true); expect(s.history[s.history.length - 1].foodIn).toBe(0); }
    expect(s.scrap).toBe(0);
    expect(s.power).toBe(0);
  });
  it('founding starts with nothing dug and no forage before the drain mouth', () => {
    const s = createState(5);
    expect(s.rooms.every((r) => r.level === 0)).toBe(true);
    for (let i = 0; i < 40 && s.rooms[R.entrance].level === 0; i++) step(s);
    expect(s.dayAcc.foodIn).toBe(0);
  });
  it('the economy stays bounded with no laws (300 days, 4 seeds)', () => {
    let alive = 0;
    for (const seed of [1, 2, 3, 4]) {
      const s = createState(seed); growCity(s, 30);
      let maxPop = 0, maxFood = 0;
      for (let d = 0; d < 300; d++) { days(s, 1, true); maxPop = Math.max(maxPop, s.rats.length); maxFood = Math.max(maxFood, s.food); }
      expect(maxPop).toBeLessThan(400);
      expect(maxFood).toBeLessThanOrEqual(320 + 1e-6);
      if (s.rats.length > 0) alive++;
      expect(Number.isFinite(s.food)).toBe(true);
    }
    expect(alive).toBeGreaterThanOrEqual(3); // without a meddling king most cities endure
  });
  it('births happen with food and mates, and not without food', () => {
    const fed = createState(8); growCity(fed, 30); const b0 = fed.totalBorn; days(fed, 12, true);
    expect(fed.totalBorn).toBeGreaterThan(b0);
    const starved = createState(8); growCity(starved, 30);
    starved.rooms[R.entrance].level = 0; starved.food = 0; for (const r of starved.rats) r.preg = 0;
    const b1 = starved.totalBorn; days(starved, 6, true);
    expect(starved.totalBorn).toBe(b1);
    const males = createState(8); growCity(males, 30); males.rats = males.rats.filter((r) => r.sex === 0 || r.isKing);
    for (const r of males.rats) r.preg = 0;
    const b2 = males.totalBorn; days(males, 10, true);
    expect(males.totalBorn).toBe(b2);
  });
});

// Each law moves its metric in the direction its hidden truth claims (A/B vs. control, 3 seeds, king AI off).
const EXPECT: [string, string, 1 | -1, number?, number?][] = [
  ['longer_shifts', 'prod', -1], ['longer_shifts', 'despair', 1],
  ['rest_day', 'sick', -1],
  ['double_tithe', 'loyalty', -1], ['double_tithe', 'plate', 1],
  ['tithe_holiday', 'loyalty', 1], ['tithe_holiday', 'plate', -1],
  ['breeding_bounty', 'births', 1],
  ['litter_limit', 'births', -1],
  ['curfew', 'predators', -1], ['curfew', 'despair', 1],
  ['enforcers', 'fear', 1], ['enforcers', 'anger', 1],
  ['public_punishment', 'fear', 1], ['public_punishment', 'despair', 1],
  ['open_granary', 'food', -1],
  ['ration_cards', 'prod', -1], ['ration_cards', 'outcasts', 1],
  ['merit_rations', 'prod', 1],
  ['quarantine_pit', 'sick', -1], ['quarantine_pit', 'loyalty', -1],
  ['burn_the_dead', 'births', -1],
  ['eat_the_dead', 'shaking', 1, 6, 14],
  ['shrine', 'loyalty', 1],
  ['ban_shrine', 'hope', -1], ['ban_shrine', 'outcasts', 1],
  ['raid_surface', 'foodIn', 1],
  ['seal_grates', 'foodIn', -1], ['seal_grates', 'predators', -1],
  ['child_labour', 'pupDeaths', 1], ['child_labour', 'anger', 1],
  ['elder_exile', 'content', -1], ['elder_exile', 'predators', 1],
  ['wheel_quotas', 'heart', 1],
  ['free_squeak', 'hope', 1],
  ['silence_law', 'anger', 1],
  ['free_election', 'loyalty', -1],
  ['royal_guard', 'food', -1],
  ['feast_days', 'loyalty', 1], ['feast_days', 'sick', 1],
  ['outcast_purge', 'anger', 1],
  ['mating_lottery', 'despair', 1], ['mating_lottery', 'births', -1],
];

describe('laws move metrics in their hidden directions', () => {
  it('covers every law except abolish', () => {
    const covered = new Set(EXPECT.map((e) => e[0]));
    for (const l of LAWS) if (l.id !== 'abolish_laws') expect(covered.has(l.id), l.id).toBe(true);
  });
  for (const [law, metric, dir, from = 2, to = 10] of EXPECT) {
    it(`${law} → ${metric} ${dir > 0 ? 'up' : 'down'}`, () => {
      let d = 0, base = 0;
      for (const seed of [11, 12, 13]) { const a = runAB(seed, null, M[metric], from, to); const b = runAB(seed, law, M[metric], from, to); d += b - a; base += Math.abs(a); }
      expect(Math.sign(d), `${law} ${metric} delta ${d.toFixed(3)} (base ${base.toFixed(2)})`).toBe(dir);
      expect(Math.abs(d)).toBeGreaterThan(0.02 * Math.max(base, 0.05));
    });
  }
  it('abolish laws tears every law down and brings chaos', () => {
    const s = createState(4); growCity(s, 50);
    enactNow(s, 'double_tithe'); enactNow(s, 'curfew');
    s.peakPop = 200; s.mind = null;
    expect(pressLaw(s, 'abolish_laws')).toBe(true);
    for (let i = 0; i < 20 * TPD && Object.keys(s.laws).length; i++) { s.mind = null; step(s); }
    expect(Object.keys(s.laws).length).toBe(0);
    expect(s.chaosUntil).toBeGreaterThan(0);
  });
});

describe('decrees spread with lag', () => {
  it('a press takes effect gradually as the herald walks the districts', () => {
    const s = createState(6); growCity(s, 50); s.mind = null;
    expect(pressLaw(s, 'double_tithe')).toBe(true);
    expect(s.laws.double_tithe.adopt).toBe(0);
    expect(computeMods(s).tithe).toBeCloseTo(0.15, 5);
    const seen: number[] = [];
    for (let i = 0; i < 6 * TPD; i++) { s.mind = null; step(s); seen.push(s.laws.double_tithe?.adopt ?? 0); }
    expect(seen[2]).toBe(0); // the herald waits at the throne first
    const mid = seen.find((a) => a > 0 && a < 1);
    expect(mid).toBeDefined();
    expect(seen[seen.length - 1]).toBe(1);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(computeMods(s).tithe).toBeCloseTo(0.32, 5);
    const snap = snapshot(s);
    expect(Object.values(snap.posters).flat()).toContain('double_tithe');
  });
  it('locked, duplicate and capped presses are refused', () => {
    const s = createState(6); growCity(s, 12); s.peakPop = 12;
    expect(lawAvailable(s, 'free_election').ok).toBe(false);
    expect(pressLaw(s, 'curfew')).toBe(true);
    expect(lawAvailable(s, 'curfew').ok).toBe(false); // herald already on the road
  });
});

describe('the king', () => {
  it('founding is autonomous and crowns the founder', () => {
    const s = createState(2);
    for (let i = 0; i < 40 * TPD && s.phase === 'founding'; i++) step(s);
    expect(s.phase).toBe('reign');
    const k = king(s)!; expect(k.founder).toBe(true); expect(s.mind).not.toBeNull();
  });
  it('the king presses buttons on his own and learns from his plate', () => {
    const s = createState(9); growCity(s, 40);
    let pressed = 0;
    for (let i = 0; i < 40 * TPD; i++) { step(s); if (s.mind && s.mind.pressLog.length > pressed) pressed = s.mind.pressLog.length; if (!s.mind) break; }
    expect(pressed).toBeGreaterThan(0);
    const vals = Object.values(s.mind?.values ?? {});
    expect(vals.some((v) => v !== 0)).toBe(true);
    for (const v of vals) { expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1); }
  });
  it('once crowned the king never leaves the throne hall', () => {
    const s = createState(10); growCity(s, 40);
    for (let i = 0; i < 30 * TPD; i++) { step(s); const k = king(s); if (k && s.phase !== 'founding') expect(k.room).toBe(R.throne); }
  });
  it('personas differ between kings', () => {
    const a = createState(1), b = createState(2); growCity(a, 20); growCity(b, 20);
    expect(JSON.stringify(a.mind!.persona)).not.toBe(JSON.stringify(b.mind!.persona));
    expect(a.mind!.traits.length).toBeGreaterThan(0);
  });
});

describe('rebellion and succession', () => {
  it('starvation breeds grievance, a gathering, a vote and a successor', () => {
    const s = createState(7); growCity(s, 50); s.mind = null;
    enactNow(s, 'double_tithe');
    s.food = 0;
    for (const r of s.rats) { r.sat = 0.3; r.satSlow = 0.05; r.anger = 0.8; r.loyalty = 0.1; }
    const firstKing = s.king.id;
    let gathered = false;
    for (let i = 0; i < 25 * TPD; i++) { s.mind = null; step(s); if (s.phase === 'gathering') gathered = true; if (s.king.id !== firstKing && s.phase === 'reign') break; }
    expect(cityGrievance(s)).toBeGreaterThanOrEqual(0);
    expect(gathered).toBe(true);
    expect(s.lastResult).not.toBeNull();
    expect(s.reigns.length).toBeGreaterThanOrEqual(1);
  });
  it('a dead king is found, voted on, and the most efficient adult is crowned', () => {
    const s = createState(12); growCity(s, 40);
    for (const r of s.rats) r.eff = 1; const best = s.rats.find((r) => !r.isKing && r.age > 8 && r.age < r.life * 0.6)!; best.eff = 3;
    applyCommand(s, { t: 'debug', what: 'killKing' });
    let crowned = -1;
    for (let i = 0; i < 15 * TPD; i++) { s.mind = null; step(s); if (s.phase === 'reign' && king(s)) { crowned = s.king.id; break; } }
    expect(crowned).toBe(best.id);
    expect(king(s)!.room).toBe(R.throne);
    expect(s.reigns.length).toBe(2);
  });
  it('a forced gathering can execute the king', () => {
    let executed = false;
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = createState(seed); growCity(s, 50); s.mind = null;
      for (const r of s.rats) { r.anger = 1; r.loyalty = 0; r.sat = 0.1; r.satSlow = 0.1; }
      applyCommand(s, { t: 'debug', what: 'gather' });
      for (let i = 0; i < 6 * TPD; i++) { s.mind = null; for (const r of s.rats) { r.anger = 1; r.loyalty = 0; } step(s); }
      if (s.reigns[0].cause === 'executed by the plaza') executed = true;
    }
    expect(executed).toBe(true);
  });
  it('the experiment ends at population zero', () => {
    const s = createState(3); growCity(s, 10);
    for (const r of s.rats) { r.health = 0.01; r.sat = 0; } s.food = 0; s.rooms[R.entrance].level = 0;
    for (let i = 0; i < 40 * TPD && s.rats.length; i++) step(s);
    expect(s.rats.length).toBe(0);
    expect(s.phase).toBe('dead');
    const c = chronicle(s); expect(c.dead).toBeGreaterThan(0);
  });
});

describe('observer API', () => {
  it('inspect returns the god-view facts for any rat', () => {
    const s = createState(4); growCity(s, 30); days(s, 2);
    for (const r of s.rats.slice(0, 10)) {
      const info = inspectRat(s, r.id)!;
      expect(info.name.length).toBeGreaterThan(0);
      expect(info.job.length).toBeGreaterThan(0);
      expect(info.thought.length).toBeGreaterThan(0);
      expect(info.opinion.length).toBeGreaterThan(0);
      expect(info.hunger).toBeGreaterThanOrEqual(0);
    }
  });
  it('the simulation is deterministic for a seed', () => {
    const a = createState(42), b = createState(42);
    days(a, 30); days(b, 30);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('state survives a JSON save/load round-trip', () => {
    const a = createState(42); days(a, 25);
    const b = JSON.parse(JSON.stringify(a)); days(a, 10); days(b, 10);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('balance', () => {
  it('most dynasties survive to day 150 (seeds 1-30: at most 6 collapses)', () => {
    let collapsed = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = createState(seed);
      for (let t = 0; t < 150 * 20 && s.rats.length; t++) step(s);
      if (!s.rats.length) collapsed++;
    }
    expect(collapsed).toBeLessThanOrEqual(6);
  }, 60000);
});
