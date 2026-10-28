import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/v2/boot';
import { RF } from '../src/sim/v2/contract';
import { actGod } from '../src/sim/v2/god';
import { maybeGrow } from '../src/sim/v2/grow';
import { loadWorld, saveWorld } from '../src/sim/v2/persist';
import { buildSnap } from '../src/sim/v2/snap';
import { emit } from '../src/sim/v2/state';
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
    for (const e of w.edges) {
      if (e.kind === 'surface' || e.pts.length < 2) continue;
      const a = w.nodes[e.a], b = w.nodes[e.b];
      expect(Math.hypot(e.pts[0][0] - a.x, e.pts[0][1] - a.y)).toBeLessThan(0.05);
      const last = e.pts[e.pts.length - 1];
      expect(Math.hypot(last[0] - b.x, last[1] - b.y)).toBeLessThan(0.05);
    }
  });

  it('does not widen the crust just because the street crosses it', () => {
    const w = createWorld({ seed: 7, scenario: 'founding', founders: 10 });
    for (let i = 0; i < 6; i++) maybeGrow(w);
    expect(w.T.W).toBeLessThanOrEqual(320 + 128);
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

  it('turns a pregnancy into pups and plans another room after the throne', () => {
    const w = createWorld({ seed: 7, scenario: 'founding', founders: 10 });
    const mom = w.rats.find((r) => r.alive && r.female && r.stageN >= 2)!;
    const dad = w.rats.find((r) => r.alive && !r.female && r.stageN >= 2)!;
    mom.pregnant = 1; mom.pregFather = dad.id;
    stepWorld(w, 2920);
    expect(w.rats.some((r) => r.mother === mom.id)).toBe(true);
    expect(mom.pregnant).toBe(0);
    stepWorld(w, 2 * 960);
    const kinds = new Set(w.chambers.map((c) => c.kind));
    expect(kinds.has('latrine') || kinds.has('granary') || kinds.has('gallery') || kinds.has('nursery') || kinds.has('midden')).toBe(true);
  });

  it('keeps later rooms apart and founds a faith once the hall is crowned', () => {
    const w = createWorld({ seed: 7, scenario: 'founding', founders: 10 });
    stepWorld(w, 6 * 960);
    const rooms = w.chambers.filter((c) => c.kind !== 'bolthole' && c.kind !== 'deadend');
    const kinds = new Set(rooms.map((c) => c.kind));
    expect(kinds.has('nest') && kinds.has('throne')).toBe(true);
    expect(['latrine', 'gallery', 'granary', 'nursery', 'midden', 'shrine'].filter((k) => kinds.has(k as never)).length).toBeGreaterThan(1);
    for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];
      const piled = Math.abs(a.cx - b.cx) < (a.rx + b.rx) * 0.35 && Math.abs(a.cy - b.cy) < (a.ry + b.ry) * 0.35;
      expect(piled).toBe(false);
    }
    expect(w.religions.length).toBeGreaterThan(0);
    expect(w.religions[0].members).toBeGreaterThan(0);
  });

  it('makes a curse of madness attack, a blessing change the body, and a dug room stay quiet', () => {
    const w = createWorld({ seed: 4, scenario: 'city', founders: 24 });
    const adults = w.rats.filter((r) => r.alive && r.stageN >= 2);
    const a = adults[0]; const b = adults[1];
    b.edge = a.edge; b.s = a.s; b.x = a.x + 0.3; b.y = a.y;
    const cursed = actGod(w, { t: 'god', req: 2, power: 'curse', target: { rat: a.id }, params: { curse: 'madness' } });
    expect(cursed.ok).toBe(true);
    expect(a.curses.some((c) => String(c).includes('madness'))).toBe(true);
    expect(a.emo.anger).toBe(1);
    expect(w.rats.some((r) => r.alive && r.id !== a.id && r.emo.fear >= 0.5)).toBe(true);
    stepWorld(w, 80);
    expect(w.events.some((e) => e.kind === 'fight' || e.kind === 'murder' || e.kind === 'maimed' || e.kind === 'death')).toBe(true);
    const strong = w.rats.find((r) => r.alive && r.id !== a.id)!;
    const blessed = actGod(w, { t: 'god', req: 3, power: 'bless', target: { rat: strong.id }, params: { gift: 'strength' } });
    expect(blessed.ok).toBe(true);
    expect(strong.genes.strength).toBeGreaterThanOrEqual(0.95);
    expect(strong.flags & RF.blessed).toBeTruthy();
    w.ripples.push({ id: 9, power: 'sign', tick: w.tick, text: 'a mark', open: true, chain: [], until: w.tick + 9999, world: true });
    w.ripCtx = [9];
    const dug = emit(w, 'chamber_done', 'THE CLAY SLUM is dug out.', 1, { x: 1, y: 1 });
    expect(dug.imp).toBe('minor');
    expect(dug.score).toBeLessThanOrEqual(18);
  });
});
