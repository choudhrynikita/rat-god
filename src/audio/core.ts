// Audio core: one AudioContext and the bus graph. Everything plays into a bus; settings map to bus gains.
//
//   music ─► musicDuck ─► musicTone(lowpass) ─┐
//   stinger ─────────────────────────────────┤
//   amb ─► ambDuck ──────────────────────────┼─► master ─► limiter ─► destination
//   sfx ─► sfxDuck ──────────────────────────┤
//   ui ──────────────────────────────────────┘
// Ducking happens on the *Duck buses so it never fights the player's volume settings.
export type BusName = 'music' | 'stinger' | 'amb' | 'sfx' | 'ui';
export interface Buses { verbSend: GainNode; verb: ConvolverNode; master: GainNode; music: GainNode; musicDuck: GainNode; musicTone: BiquadFilterNode; stinger: GainNode; amb: GainNode; ambDuck: GainNode; sfx: GainNode; sfxDuck: GainNode; ui: GainNode; limiter: DynamicsCompressorNode }
/** default bus levels in dB (mix balance, measured against -16 LUFS music and -18 LUFS stingers) */
export const BUS_DB: Record<BusName, number> = { music: -6, stinger: -5, amb: -14, sfx: -9, ui: -12 };
export const dbToGain = (db: number) => (db <= -80 ? 0 : Math.pow(10, db / 20));
export const gainToDb = (g: number) => (g <= 0.0001 ? -80 : 20 * Math.log10(g));

let ctx: AudioContext | null = null; let buses: Buses | null = null;
const ready: ((c: AudioContext, b: Buses) => void)[] = [];
let unlockHooks: (() => void)[] = [];
const prefs = { master: 1, music: 1, sfx: 1, enabled: true, musicOn: true };

export function audioCtx() { return ctx; }
export function getBuses() { return buses; }
export function onAudioReady(fn: (c: AudioContext, b: Buses) => void) { if (ctx && buses) fn(ctx, buses); else ready.push(fn); }
/** work that must run inside the first user gesture (mobile media unlock) */
export function onUnlockGesture(fn: () => void) { unlockHooks.push(fn); }

/** Prefer Ogg Vorbis (smaller); Safari/iOS without Vorbis gets AAC in .m4a (gapless via the mp4 edit list). */
export const AUDIO_EXT: 'ogg' | 'm4a' = (() => { try { const a = new Audio(); return a.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a'; } catch { return 'm4a'; } })();

/** Call from every pointerdown (cheap after the first). Creates/resumes the context inside the gesture. */
export function unlock() {
  const hooks = unlockHooks; unlockHooks = []; for (const h of hooks) { try { h(); } catch { /* ignore */ } }
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return; }
  try { ctx = new AudioContext({ latencyHint: 'interactive' }); } catch { return; }
  const c = ctx; const g = () => c.createGain();
  const limiter = c.createDynamicsCompressor(); // safety net only: -1 dBFS ceiling-ish, fast
  limiter.threshold.value = -3; limiter.knee.value = 2; limiter.ratio.value = 20; limiter.attack.value = 0.002; limiter.release.value = 0.12;
  const master = g(); master.connect(limiter).connect(c.destination);
  const musicTone = c.createBiquadFilter(); musicTone.type = 'lowpass'; musicTone.frequency.value = 20000; musicTone.Q.value = 0.5;
  const musicDuck = g(); const music = g(); music.connect(musicDuck).connect(musicTone).connect(master);
  const stinger = g(); stinger.connect(master);
  const ambDuck = g(); const amb = g(); amb.connect(ambDuck).connect(master);
  const sfxDuck = g(); const sfx = g(); sfx.connect(sfxDuck).connect(master);
  const ui = g(); ui.connect(master);
  // cinematic reverb: a send from music/ambience/SFX into a generated 2.4 s chip-hall impulse (silent unless cinematic)
  const verb = c.createConvolver(); const len = Math.floor(c.sampleRate * 2.4); const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 64 ? i / 64 : 1); }
  verb.buffer = ir; const verbSend = g(); verbSend.gain.value = 0; verbSend.connect(verb).connect(master);
  musicTone.connect(verbSend); ambDuck.connect(verbSend); sfxDuck.connect(verbSend); stinger.connect(verbSend);
  buses = { verbSend, verb, master, music, musicDuck, musicTone, stinger, amb, ambDuck, sfx, sfxDuck, ui, limiter };
  applyPrefs();
  // iOS: a silent 1-sample buffer inside the gesture fully unlocks output
  try { const b = c.createBuffer(1, 1, c.sampleRate); const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(); } catch { /* ignore */ }
  for (const l of ready.splice(0)) l(c, buses);
}

function applyPrefs(t = 0.05) {
  if (!ctx || !buses) return; const now = ctx.currentTime; const set = (n: AudioParam, v: number) => n.setTargetAtTime(v, now, t);
  set(buses.master.gain, prefs.enabled ? prefs.master : 0);
  const m = prefs.musicOn ? prefs.music : 0;
  set(buses.music.gain, dbToGain(BUS_DB.music) * m); set(buses.stinger.gain, dbToGain(BUS_DB.stinger) * Math.max(m, prefs.sfx * 0.7));
  set(buses.sfx.gain, dbToGain(BUS_DB.sfx) * prefs.sfx); set(buses.ui.gain, dbToGain(BUS_DB.ui) * prefs.sfx);
  set(buses.amb.gain, dbToGain(BUS_DB.amb) * prefs.sfx);
}
/** 0..1 sliders are squared before use so the audible change spreads over the whole travel */
export function setVolumes(v: { master?: number; music?: number; sfx?: number }) {
  if (v.master !== undefined) prefs.master = clamp01(v.master) ** 2; if (v.music !== undefined) prefs.music = clamp01(v.music) ** 2; if (v.sfx !== undefined) prefs.sfx = clamp01(v.sfx) ** 2; applyPrefs();
}
export function setEnabled(on: boolean) { prefs.enabled = on; applyPrefs(); }
export function setMusicEnabled(on: boolean) { prefs.musicOn = on; applyPrefs(0.2); }
export function isEnabled() { return prefs.enabled; }
export function musicEnabled() { return prefs.musicOn; }
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Duck a bus (dB) with attack/hold/release in seconds. Overlapping ducks keep the deepest one. */
const duckUntil: Record<string, { until: number; db: number }> = {};
let silentUntil = 0;
export function duck(which: 'musicDuck' | 'ambDuck' | 'sfxDuck', db: number, hold: number, attack = 0.06, release = 0.8) {
  if (!ctx || !buses || ctx.currentTime < silentUntil) return; const now = ctx.currentTime; const p = buses[which].gain;
  const cur = duckUntil[which]; const until = now + attack + hold;
  if (cur && cur.until > now && cur.db < db) { if (until > cur.until) { cur.until = until; } else return; } else duckUntil[which] = { until: Math.max(until, cur && cur.until > now ? cur.until : 0), db };
  const d = duckUntil[which];
  p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.linearRampToValueAtTime(dbToGain(d.db), now + attack);
  p.setValueAtTime(dbToGain(d.db), d.until); p.setTargetAtTime(1, d.until, release / 3);
}

/** MAJOR cinematic slow-time (time at <= 0.3x): low-pass the world + music and swell the reverb; restores on exit.
 *  `amount` 0..1. The music director's night low-pass is overridden while cinematic. */
let cine = 0;
export function cinematicAmount() { return cine; }
export function setCinematic(amount: number) {
  cine = clamp01(amount); if (!ctx || !buses) return; const now = ctx.currentTime;
  buses.verbSend.gain.setTargetAtTime(0.55 * cine, now, cine > 0 ? 0.25 : 0.6);
  buses.musicTone.frequency.setTargetAtTime(cine > 0 ? 18000 - 16800 * cine : 18000, now, cine > 0 ? 0.2 : 0.5);
  buses.sfxDuck.gain.setTargetAtTime(1 - 0.5 * cine, now, 0.2);
}
/** the 'silence' god power: an audible absence. Everything sinks to near-silence for `sec`, then returns. */
export function godSilence(sec = 6) {
  if (!ctx || !buses) return; const now = ctx.currentTime;
  for (const b of [buses.musicDuck, buses.ambDuck, buses.sfxDuck]) { const p = b.gain; p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.linearRampToValueAtTime(0.02, now + 0.6); p.setValueAtTime(0.02, now + 0.6 + sec); p.linearRampToValueAtTime(1, now + 0.6 + sec + 3); }
  for (const k of Object.keys(duckUntil)) delete duckUntil[k];
  silentUntil = now + 0.6 + sec + 3;
}
