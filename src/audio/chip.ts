// Procedural retro chip SFX in the OST's palette: NES-style pulse (12.5/25/50 % duty), triangle, and LFSR noise
// (long "white" mode and short 93-step "metallic" mode). Envelopes and pitch move in 60 Hz frame steps, like the
// 2A03's frame counter, so they sound like the music's instruments rather than generic synth beeps.
// Each SFX is a recipe with built-in randomisation; the voice manager adds pitch/volume variation on top.

export type Wave = 'p12' | 'p25' | 'p50' | 'tri' | 'noise' | 'noiseShort';
const FRAME = 1 / 60;
const waves = new WeakMap<BaseAudioContext, Record<string, PeriodicWave | AudioBuffer>>();
function pulseWave(c: BaseAudioContext, duty: number) {
  const n = 64; const re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k++) { re[k] = (2 / (k * Math.PI)) * Math.sin(Math.PI * k * duty) * Math.cos(Math.PI * k * duty); im[k] = (2 / (k * Math.PI)) * Math.sin(Math.PI * k * duty) * Math.sin(Math.PI * k * duty); }
  return c.createPeriodicWave(re, im, { disableNormalization: false });
}
function triWave(c: BaseAudioContext) { // the 2A03 triangle is a 4-bit staircase: odd harmonics plus a little step grit
  const n = 64; const re = new Float32Array(n), im = new Float32Array(n);
  for (let k = 1; k < n; k += 2) im[k] = (8 / (Math.PI * Math.PI)) * ((k - 1) / 2 % 2 ? -1 : 1) / (k * k);
  for (let k = 31; k < n; k += 2) im[k] += 0.004; return c.createPeriodicWave(re, im);
}
function lfsr(c: BaseAudioContext, short: boolean) { // 15-bit LFSR; feedback tap 1 (long) or 6 (short)
  const len = short ? 93 * 64 : 32767; const b = c.createBuffer(1, len, 44100); const d = b.getChannelData(0); let r = 1;
  for (let i = 0; i < len; i++) { const bit = (r ^ (r >> (short ? 6 : 1))) & 1; r = (r >> 1) | (bit << 14); d[i] = r & 1 ? 0.8 : -0.8; }
  return b;
}
export function bank(c: BaseAudioContext) {
  let w = waves.get(c);
  if (!w) { w = { p12: pulseWave(c, 0.125), p25: pulseWave(c, 0.25), p50: pulseWave(c, 0.5), tri: triWave(c), noise: lfsr(c, false), noiseShort: lfsr(c, true) }; waves.set(c, w); }
  return w;
}
export interface Note {
  wave: Wave; t?: number; /** start offset s */ dur: number;
  f: number; /** Hz (tone) or noise "period" as playbackRate (0.05..4) */
  f2?: number; /** end pitch for a sweep (stepped per frame) */ arp?: number[]; /** semitone offsets cycled per frame */
  vol: number; decay?: number; /** volume steps down each frame by this factor (0..1) */ vib?: number; /** cents */
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** schedule notes into `out`; returns the end time */
export function play(c: BaseAudioContext, out: AudioNode, notes: Note[], when: number, pitch = 1): number {
  const b = bank(c); let end = when;
  for (const n of notes) {
    const t0 = when + (n.t ?? 0); const t1 = t0 + n.dur; end = Math.max(end, t1);
    const g = c.createGain(); g.connect(out);
    // stepped volume envelope (4-bit feel)
    const steps = Math.max(1, Math.round(n.dur / FRAME)); let v = n.vol; const dec = n.decay ?? 0.92;
    g.gain.setValueAtTime(0, t0); for (let i = 0; i < steps; i++) { g.gain.setValueAtTime(Math.round(v * 15) / 15 * 0.999, t0 + i * FRAME); v *= dec; }
    g.gain.setValueAtTime(0, t1);
    let src: AudioScheduledSourceNode; let freq: AudioParam;
    if (n.wave === 'noise' || n.wave === 'noiseShort') {
      const s = c.createBufferSource(); s.buffer = b[n.wave] as AudioBuffer; s.loop = true; freq = s.playbackRate; src = s;
      freq.setValueAtTime(n.f * pitch, t0);
    } else {
      const o = c.createOscillator(); o.setPeriodicWave(b[n.wave] as PeriodicWave); freq = o.frequency; src = o;
      freq.setValueAtTime(n.f * pitch, t0);
      if (n.vib) { const l = c.createOscillator(); l.frequency.value = 6; const lg = c.createGain(); lg.gain.value = n.vib; l.connect(lg).connect(o.detune); l.start(t0); l.stop(t1 + 0.02); }
    }
    if (n.f2 !== undefined || n.arp) {
      for (let i = 1; i < steps; i++) {
        let f = n.f; if (n.f2 !== undefined) f = n.f * Math.pow(n.f2 / n.f, i / steps);
        if (n.arp) f *= Math.pow(2, n.arp[i % n.arp.length] / 12);
        freq.setValueAtTime(f * pitch, t0 + i * FRAME);
      }
    }
    src.connect(g); src.start(t0); src.stop(t1 + 0.02);
  }
  return end;
}
// ─── recipes (each call returns a fresh, slightly different variant) ───
export type Recipe = () => Note[];
export const RECIPES: Record<string, Recipe> = {
  squeak: () => { const f = rnd(1500, 2300); return [{ wave: 'p12', dur: rnd(0.05, 0.09), f, f2: f * rnd(1.2, 1.6), vol: 0.5, decay: 0.85 }]; },
  squeal: () => { const f = rnd(1300, 1700); return [{ wave: 'p25', dur: 0.28, f, f2: f * 0.55, vol: 0.6, decay: 0.9, vib: 60 }, { wave: 'noise', t: 0.02, dur: 0.12, f: 2.5, vol: 0.15, decay: 0.8 }]; },
  scurry: () => Array.from({ length: 3 + Math.floor(Math.random() * 3) }, (_, i) => ({ wave: 'noiseShort' as Wave, t: i * rnd(0.045, 0.07), dur: 0.03, f: rnd(1.6, 2.4), vol: rnd(0.2, 0.32), decay: 0.6 })),
  dig: () => [{ wave: 'noise', dur: 0.07, f: rnd(0.35, 0.6), vol: 0.45, decay: 0.75 }, { wave: 'tri', dur: 0.05, f: rnd(90, 130), f2: 60, vol: 0.5, decay: 0.8 }],
  gnaw: () => Array.from({ length: 4 }, (_, i) => ({ wave: 'noiseShort' as Wave, t: i * 0.06, dur: 0.035, f: rnd(0.9, 1.3), vol: 0.22, decay: 0.7 })),
  eat: () => [{ wave: 'noise', dur: 0.05, f: 1.2, vol: 0.2, decay: 0.7 }, { wave: 'noise', t: 0.09, dur: 0.05, f: 1.0, vol: 0.18, decay: 0.7 }],
  death: () => { const f = rnd(330, 400); return [{ wave: 'p50', dur: 0.5, f, f2: f / 3, vol: 0.45, decay: 0.95 }, { wave: 'tri', t: 0.1, dur: 0.6, f: f / 4, f2: f / 8, vol: 0.5, decay: 0.96 }]; },
  stamp: () => [{ wave: 'noise', dur: 0.12, f: 0.25, vol: 0.8, decay: 0.78 }, { wave: 'tri', dur: 0.16, f: 110, f2: 45, vol: 0.9, decay: 0.85 }, { wave: 'p50', t: 0.01, dur: 0.05, f: 220, vol: 0.25, decay: 0.7 }],
  herald: () => [{ wave: 'p25', dur: 0.1, f: 523.25, vol: 0.4, decay: 0.97 }, { wave: 'p25', t: 0.11, dur: 0.1, f: 659.25, vol: 0.4, decay: 0.97 }, { wave: 'p25', t: 0.22, dur: 0.22, f: 783.99, vol: 0.45, decay: 0.95, vib: 25 }],
  pebble: () => [{ wave: 'p12', dur: 0.04, f: rnd(1900, 2600), vol: 0.35, decay: 0.75 }, { wave: 'noiseShort', dur: 0.03, f: 3, vol: 0.12, decay: 0.6 }],
  bell: () => [146.83, 220, 293.66].map((f, i) => ({ wave: (i ? 'p12' : 'tri') as Wave, t: i * 0.01, dur: 1.4, f, vol: i ? 0.25 : 0.5, decay: 0.975, vib: 8 })),
  chime: () => [587.33, 880, 1174.66].map((f, i) => ({ wave: 'p12' as Wave, t: i * 0.07, dur: 0.6, f, vol: 0.28, decay: 0.95 })),
  hiss: () => [{ wave: 'noise', dur: 0.45, f: 3.5, f2: 2.2, vol: 0.45, decay: 0.95 }],
  growl: () => [{ wave: 'noiseShort', dur: 0.5, f: 0.18, vol: 0.5, decay: 0.97 }, { wave: 'p50', dur: 0.45, f: 70, f2: 55, vol: 0.25, decay: 0.97, vib: 40 }],
  boot: () => [{ wave: 'noise', dur: 0.22, f: 0.12, vol: 1, decay: 0.85 }, { wave: 'tri', dur: 0.3, f: 70, f2: 35, vol: 1, decay: 0.9 }],
  gas: () => [{ wave: 'noise', dur: 1.2, f: 2.8, vol: 0.3, decay: 0.985 }],
  thunder: () => [{ wave: 'noise', dur: 0.08, f: 1.5, vol: 1, decay: 0.8 }, { wave: 'noise', t: 0.05, dur: 1.8, f: 0.09, f2: 0.05, vol: 0.9, decay: 0.975 }, { wave: 'tri', t: 0.05, dur: 1.2, f: 55, f2: 30, vol: 0.6, decay: 0.97 }],
  collapse: () => [{ wave: 'noise', dur: 1.0, f: 0.2, f2: 0.08, vol: 0.9, decay: 0.96 }, ...Array.from({ length: 5 }, (_, i) => ({ wave: 'noiseShort' as Wave, t: 0.15 + i * rnd(0.08, 0.16), dur: 0.05, f: rnd(0.4, 0.9), vol: 0.35, decay: 0.7 }))],
  rumble: () => [{ wave: 'noise', dur: 1.6, f: 0.06, vol: 0.7, decay: 0.985 }, { wave: 'tri', dur: 1.6, f: 41, vol: 0.5, decay: 0.985, vib: 50 }],
  splash: () => [{ wave: 'noise', dur: 0.4, f: 1.6, f2: 0.6, vol: 0.6, decay: 0.92 }, { wave: 'p12', dur: 0.12, f: 900, f2: 300, vol: 0.2, decay: 0.85 }],
  fire: () => Array.from({ length: 6 }, () => ({ wave: 'noiseShort' as Wave, t: rnd(0, 0.5), dur: 0.025, f: rnd(1.5, 3), vol: rnd(0.15, 0.3), decay: 0.6 })),
  zap: () => [{ wave: 'p12', dur: 0.15, f: 2400, f2: 200, arp: [0, 7, 12], vol: 0.4, decay: 0.85 }, { wave: 'noiseShort', dur: 0.12, f: 3.5, vol: 0.25, decay: 0.8 }],
  clank: () => [{ wave: 'noiseShort', dur: 0.12, f: 0.7, vol: 0.5, decay: 0.8 }, { wave: 'p25', dur: 0.15, f: rnd(330, 420), vol: 0.25, decay: 0.8, vib: 30 }],
  beep: () => [{ wave: 'p50', dur: 0.06, f: rnd(1400, 1700), vol: 0.25, decay: 0.95 }, { wave: 'p50', t: 0.08, dur: 0.06, f: rnd(1000, 1200), vol: 0.25, decay: 0.95 }],
  gear: () => Array.from({ length: 4 }, (_, i) => ({ wave: 'noiseShort' as Wave, t: i * 0.09, dur: 0.03, f: 1.1 + (i % 2) * 0.4, vol: 0.25, decay: 0.7 })),
  pray: () => [{ wave: 'p12', dur: 0.5, f: 880, vol: 0.18, decay: 0.95, vib: 15 }],
  ui_tap: () => [{ wave: 'p50', dur: 0.04, f: 1046.5, vol: 0.3, decay: 0.8 }],
  ui_open: () => [{ wave: 'p25', dur: 0.12, f: 523.25, arp: [0, 4, 7, 12], vol: 0.3, decay: 0.92 }],
  ui_close: () => [{ wave: 'p25', dur: 0.12, f: 1046.5, arp: [0, -5, -8, -12], vol: 0.3, decay: 0.92 }],
  ui_confirm: () => [{ wave: 'p25', dur: 0.06, f: 783.99, vol: 0.3, decay: 0.9 }, { wave: 'p25', t: 0.07, dur: 0.12, f: 1174.66, vol: 0.32, decay: 0.93 }],
  ui_deny: () => [{ wave: 'p50', dur: 0.16, f: 196, f2: 150, vol: 0.35, decay: 0.95 }],
  god_select: () => [{ wave: 'p12', dur: 0.25, f: 293.66, f2: 587.33, vol: 0.3, decay: 0.95, vib: 20 }, { wave: 'tri', dur: 0.25, f: 146.83, vol: 0.35, decay: 0.96 }],
  god_charge: () => [{ wave: 'p25', dur: 0.6, f: 146.83, f2: 1174.66, arp: [0, 7], vol: 0.25, decay: 0.995 }],
  god_fail: () => [{ wave: 'p50', dur: 0.3, f: 220, f2: 110, vol: 0.3, decay: 0.93 }, { wave: 'noise', dur: 0.15, f: 0.4, vol: 0.15, decay: 0.85 }],
};
// v2 god powers (V2_SCOPE_DELTA §3) and gated sounds
Object.assign(RECIPES, {
  god_sign: () => [{ wave: 'p12', dur: 0.5, f: 1174.66, arp: [0, 7, 12, 19], vol: 0.3, decay: 0.96, vib: 12 }, { wave: 'tri', dur: 0.6, f: 293.66, vol: 0.35, decay: 0.97 }],
  god_voice: () => [{ wave: 'p50', dur: 0.9, f: 73.42, vol: 0.4, decay: 0.985, vib: 35 }, { wave: 'p25', t: 0.05, dur: 0.8, f: 110, vol: 0.25, decay: 0.98, vib: 30 }, { wave: 'noise', dur: 0.9, f: 0.1, vol: 0.15, decay: 0.98 }],
  god_mark: () => [{ wave: 'p25', dur: 0.08, f: 880, vol: 0.35, decay: 0.85 }, { wave: 'noiseShort', t: 0.06, dur: 0.18, f: 1.8, vol: 0.25, decay: 0.85 }, { wave: 'p12', t: 0.08, dur: 0.35, f: 1760, f2: 1320, vol: 0.2, decay: 0.94 }],
  god_pardon: () => [{ wave: 'p25', dur: 0.14, f: 392, vol: 0.3, decay: 0.95 }, { wave: 'p25', t: 0.15, dur: 0.14, f: 493.88, vol: 0.3, decay: 0.95 }, { wave: 'p25', t: 0.3, dur: 0.5, f: 587.33, vol: 0.32, decay: 0.96, vib: 15 }, { wave: 'noiseShort', t: 0.3, dur: 0.1, f: 0.7, vol: 0.2, decay: 0.7 }],
  god_illuminate: () => [{ wave: 'p12', dur: 0.9, f: 587.33, f2: 2349.32, arp: [0, 4, 7], vol: 0.22, decay: 0.99 }, { wave: 'noise', dur: 0.9, f: 3.5, vol: 0.06, decay: 0.99 }],
  god_spring: () => [{ wave: 'noise', dur: 0.8, f: 1.2, f2: 2.4, vol: 0.35, decay: 0.97 }, { wave: 'p12', t: 0.1, dur: 0.4, f: 660, arp: [0, 5, 9, 12], vol: 0.2, decay: 0.93 }],
  god_judge: () => [{ wave: 'tri', dur: 0.25, f: 98, vol: 0.8, decay: 0.85 }, { wave: 'noise', dur: 0.12, f: 0.3, vol: 0.6, decay: 0.75 }, { wave: 'p50', t: 0.3, dur: 0.4, f: 196, vol: 0.25, decay: 0.95 }],
  god_reveal: () => [{ wave: 'p25', dur: 0.6, f: 440, arp: [0, 3, 7, 10, 12], vol: 0.25, decay: 0.97 }, { wave: 'tri', dur: 0.6, f: 110, vol: 0.35, decay: 0.98 }],
  crunch: () => [{ wave: 'noiseShort', dur: 0.09, f: 0.5, vol: 0.6, decay: 0.7 }, { wave: 'noise', t: 0.05, dur: 0.15, f: 0.9, vol: 0.4, decay: 0.75 }, { wave: 'tri', dur: 0.1, f: 90, f2: 50, vol: 0.4, decay: 0.8 }],
  nuzzle: () => [{ wave: 'p12', dur: 0.06, f: 1320, vol: 0.15, decay: 0.85 }, { wave: 'p12', t: 0.12, dur: 0.06, f: 1480, vol: 0.13, decay: 0.85 }],
} satisfies Record<string, Recipe>);
// levels for the v2 recipes (same -20 dBFS RMS-peak target; measured in the second render pass)
export const SFX_IDS = Object.keys(RECIPES);
/** measured per-recipe level trim (dB) that brings each recipe's loudest 100 ms to -20 dBFS RMS at unity gain
 *  (rendered in headless Chromium OfflineAudioContext; assets/work/audio_v2/sfxrender). DEFS.db in voices.ts is then pure mix balance. */
export const LEVEL_DB: Record<string, number> = {"squeak": -0.9, "squeal": -7.8, "scurry": -3.2, "dig": -7.7, "gnaw": 0.0, "eat": 1.7, "death": -11.4, "stamp": -14.6, "herald": -6.0, "pebble": 2.7, "bell": -9.5, "chime": -1.7, "hiss": -8.2, "growl": -11.8, "boot": -16.5, "gas": -5.3, "thunder": -16.9, "collapse": -15.0, "rumble": -14.3, "splash": -10.4, "fire": -0.4, "zap": -3.5, "clank": -8.0, "beep": -5.3, "gear": -1.0, "pray": 5.5, "ui_tap": -3.9, "ui_open": -2.4, "ui_close": -2.4, "ui_confirm": -2.8, "ui_deny": -8.4, "god_select": -6.1, "god_charge": -2.8, "god_fail": -7.1};
