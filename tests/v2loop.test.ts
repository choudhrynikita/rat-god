import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/v2/boot';
import { actGod } from '../src/sim/v2/god';
import { buildSnap } from '../src/sim/v2/snap';
import { stepWorld } from '../src/sim/v2/step';

describe('v2 loop', () => {
  it('wakes a city, walks rats, and answers a god act', () => {
    const w = createWorld({ seed: 11, scenario: 'city', founders: 36 });
    expect(w.chambers.filter((c) => c.progress >= 0.999).length).toBeGreaterThan(2);
    expect(w.rats.filter((r) => r.alive).length).toBeGreaterThan(10);
    expect(w.kingId).toBeGreaterThan(0);
    const x0 = w.rats[3].x;
    stepWorld(w, 80);
    const moved = w.rats.some((r) => r.alive && r.dist > 0.2);
    expect(moved).toBe(true);
    expect(w.rats[3].x === x0 || moved).toBe(true);
    const snap = buildSnap(w, 0);
    expect(snap.rats.n).toBeGreaterThan(8);
    expect(snap.king?.name.length).toBeGreaterThan(0);
    const king = w.kingId;
    const res = actGod(w, { t: 'god', req: 1, power: 'punish_king', target: {}, params: { punishment: 'humble' } });
    expect(res.ok).toBe(true);
    expect(w.grace).toBeLessThan(120);
    expect(w.byId.get(king)?.emo.fear).toBeGreaterThan(0.5);
  });

  it('keeps founding rats walking after the first tunnels open', () => {
    const w = createWorld({ seed: 7, scenario: 'founding', founders: 10 });
    stepWorld(w, 1600);
    const mark = new Map(w.rats.filter((r) => r.alive).map((r) => [r.id, r.dist]));
    stepWorld(w, 400);
    const alive = w.rats.filter((r) => r.alive);
    const moved = alive.filter((r) => r.dist - (mark.get(r.id) ?? 0) > 1).length;
    expect(moved).toBeGreaterThan(alive.length * 0.6);
  });
});
