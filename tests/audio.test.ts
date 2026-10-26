import { describe, it, expect } from 'vitest';
import { cuePool, eventAudio, pickEvents, godPowerStinger, eraCue, deriveFromSim2 } from '../src/audio/state';
import { VoiceManager } from '../src/audio/voices';
import { ambMix } from '../src/audio/ambience';
import { RECIPES } from '../src/audio/chip';
import type { SimEvent2, Snapshot2 } from '../src/sim/v2/contract';

const ev = (kind: string, sev = 1, x?: number): SimEvent2 => ({ seq: 1, tick: 1, kind, text: '', sev, x, y: x === undefined ? undefined : 0 } as unknown as SimEvent2);
function snap(o: Record<string, unknown> = {}, stats: Record<string, unknown> = {}, env: Record<string, unknown> = {}): Snapshot2 {
  return { v: 2, tick: 1, phase: 'reign', gathering: null, events: [], religions: [], arcs: [], research: [], festivals: [], justice: { secretPolice: false, inmates: [] },
    env: { tod: 0.5, weather: 'clear', intensity: 0, rain: 0, lightning: false, ...env },
    stats: { pop: 50, pups: 3, births: 1, deaths: 0, food: 100, hunger: 0.1, disease: 0, unrest: 0.1, legitimacy: 0.8, faith: 0.3, techEra: 0, rodentoids: 0, jailed: 0, joy: 0.5, ...stats }, ...o } as unknown as Snapshot2;
}
describe('audio state mapping', () => {
  it('calm day/night pools rotate prosperity with the era theme', () => {
    expect(cuePool('calm', { night: false, era: 0, faith: 0 })).toEqual(['loop_prosperity_day', 'loop_era_primitive']);
    expect(cuePool('calm', { night: true, era: 5, faith: 0 })).toEqual(['loop_prosperity_night', 'loop_era_ri']);
    expect([0, 1, 2, 3, 4, 5].map(eraCue)).toEqual(['loop_era_primitive', 'loop_era_primitive', 'loop_era_scrap_electric', 'loop_era_scrap_electric', 'loop_era_mechanised', 'loop_era_ri']);
    expect(cuePool('hymn', { night: false, era: 0, faith: 1 })).toEqual(['loop_hymn_b']);
  });
  it('derives states by priority', () => {
    expect(deriveFromSim2(snap()).state).toBe('calm');
    expect(deriveFromSim2(snap({}, {}, { tod: 0.95 })).night).toBe(true);
    expect(deriveFromSim2(snap({}, { hunger: 0.8 })).state).toBe('famine');
    expect(deriveFromSim2(snap({}, { disease: 0.3, hunger: 0.8 })).state).toBe('plague');
    expect(deriveFromSim2(snap({}, {}, { weather: 'storm', intensity: 0.9 })).state).toBe('storm');
    expect(deriveFromSim2(snap({ gathering: { kind: 'trial' } }, { hunger: 0.9 })).state).toBe('trial');
    expect(deriveFromSim2(snap({ phase: 'dead' })).state).toBe('game_over');
    expect(deriveFromSim2(snap({ justice: { secretPolice: true, inmates: [] } }, { unrest: 0.4 })).state).toBe('oppression');
    expect(deriveFromSim2(snap({ justice: { secretPolice: false, inmates: [1] } }), 'jail').state).toBe('jail');
    expect(deriveFromSim2(snap({}, { unrest: 0.9 })).tension).toBeGreaterThan(0.8);
  });
  it('maps events to at most one stinger per snapshot', () => {
    expect(eventAudio(ev('king_died', 3))?.stinger).toBe('sting_death');
    expect(eventAudio(ev('discovery', 2))?.stinger).toBe('sting_eureka_a');
    expect(eventAudio(ev('birth', 0))?.stinger).toBeUndefined();
    const p = pickEvents([ev('birth', 2), ev('king_died', 3), ev('miracle', 2), ev('dig_start', 0, 5)]);
    expect(p.top?.e.kind).toBe('king_died');
    expect(p.rest.length).toBe(3);
    expect(godPowerStinger('whisper')).toBeNull();
    expect(godPowerStinger('raise_dead')).toBe('sting_resurrection');
  });
});
describe('voice manager (anti-cacophony)', () => {
  const mk = () => { const v = new VoiceManager(); v.listener = { x: 0, y: 0, halfW: 100, halfH: 60, detailRef: 100 }; return v; };
  it('cooldown and burst limits drop rapid repeats', () => {
    const v = mk(); let ok = 0;
    for (let i = 0; i < 20; i++) { const d = v.decide('squeak', { x: 0, y: 0 }, i * 50, 0); if (d.ok) { ok++; (v as any).last.set('squeak', i * 50); (v as any).hits.set('squeak', [...((v as any).hits.get('squeak') ?? []), i * 50]); } }
    expect(ok).toBeLessThanOrEqual(3); // 1 s window, cooldown 180 ms, burst 3
  });
  it('attenuates with distance, culls off-screen, pans by x', () => {
    const v = mk();
    const near = v.decide('dig', { x: 0, y: 0 }, 0, 0), edge = v.decide('collapse', { x: 120, y: 0 }, 0, 0), far = v.decide('dig', { x: 400, y: 0 }, 0, 0);
    expect(near.ok).toBe(true); expect(far.ok).toBe(false); expect(far.why).toBe('far');
    expect(edge.pan).toBeGreaterThan(0.5);
    const mid = v.decide('splash', { x: 90, y: 0 }, 0, 0); const ctr = v.decide('splash', { x: 0, y: 0 }, 5000, 0);
    expect(mid.gain).toBeLessThan(ctr.gain);
  });
  it('zooming out fades small detail sounds', () => {
    const v = mk(); const a = v.decide('squeak', { x: 0, y: 0 }, 0, 0).gain; v.listener.halfW = 600; const b = v.decide('squeak', { x: 0, y: 0 }, 9999, 0);
    expect(b.ok ? b.gain : 0).toBeLessThan(a * 0.25);
  });
  it('category caps: low-priority sounds cannot steal from high ones', () => {
    const v = mk(); const fakeOut = { gain: { setTargetAtTime() {} } } as unknown as GainNode;
    (v as any).active = [0, 1].map(() => ({ id: 'thunder', cat: 'world', score: 7, end: 10, out: fakeOut }));
    expect(v.decide('fire', { x: 0, y: 0 }, 0, 0).ok).toBe(false);
    expect(v.decide('fire', { x: 0, y: 0 }, 1, 0).why).toMatch(/voices|cooldown/);
  });
  it('every recipe produces bounded notes with variation', () => {
    for (const [id, r] of Object.entries(RECIPES)) { const n = r(); expect(n.length, id).toBeGreaterThan(0); for (const x of n) { expect(x.dur).toBeLessThan(2.5); expect(x.vol).toBeLessThanOrEqual(1); } }
  });
  it('ambience mix follows weather and depth', () => {
    const top = ambMix({ underground: 0, rain: 1, storm: true, machines: 0, crowd: 0, dread: false, dead: false, night: false });
    const deep = ambMix({ underground: 1, rain: 1, storm: true, machines: 0, crowd: 0, dread: false, dead: false, night: false });
    expect(top.amb_street_rain!).toBeGreaterThan(deep.amb_street_rain! * 2);
  });
});
