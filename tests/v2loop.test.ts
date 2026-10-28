import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/v2/boot';
import { actGod } from '../src/sim/v2/god';
import { maybeGrow } from '../src/sim/v2/grow';
import { loadWorld, saveWorld } from '../src/sim/v2/persist';
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

  it('crowns the founding leader between day 2 and day 3', () => {
    for (const seed of [3, 7, 19]) {
      const w = createWorld({ seed, scenario: 'founding', founders: 10 });
      stepWorld(w, 1919);
      expect(w.rats.some((r) => r.tool === 8)).toBe(false);
      stepWorld(w, 960);
      expect(w.rats.some((r) => r.tool === 8)).toBe(true);
      expect(w.tick).toBeGreaterThanOrEqual(2 * 960);
      expect(w.tick).toBeLessThan(3 * 960);
      const throne = w.chambers.find((c) => c.kind === 'throne' && c.progress >= 0.999);
      expect(throne && throne.rx > throne.ry).toBe(true);
    }
  });

  it('grows new ground without moving the nest off its tiles', () => {
    const w = createWorld({ seed: 3, scenario: 'founding', founders: 10 });
    const nest = w.chambers.find((c) => c.kind === 'nest')!;
    const ox = nest.cx;
    w.view = { x0: -8, y0: 0, x1: 12, y1: 40 };
    const g = maybeGrow(w);
    expect(g.grew).toBe(true);
    expect(g.dx).toBe(64);
    expect(w.chambers.find((c) => c.id === nest.id)!.cx).toBeCloseTo(ox + g.dx, 5);
    expect(w.T.W).toBeGreaterThan(320);
    expect(w.T.surfaceY[0]).toBeGreaterThan(10);
  });

  it('saves the gnawed ground and the day', () => {
    const w = createWorld({ seed: 5, scenario: 'founding', founders: 10 });
    stepWorld(w, 40);
    const i = 50 * w.T.W + 40;
    w.T.carve[i] = 222;
    const s = saveWorld(w);
    const w2 = loadWorld(s);
    expect(w2.tick).toBe(w.tick);
    expect(w2.T.carve[i]).toBe(222);
    expect(w2.byId.get(w2.rats[0].id)?.name).toBe(w.rats[0].name);
    expect(w2.rats.filter((r) => r.alive).length).toBe(w.rats.filter((r) => r.alive).length);
  });
});
