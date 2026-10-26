// Adaptive music director.
//  • Horizontal re-sequencing: a MusicState maps to a pool of cues; the director switches cues on the next bar line of
//    the playing cue (all gameplay cues share a ~120 BPM 4/4 grid, so the new cue's bar 0 lands on the old bar line),
//    rotates within a pool after a couple of loops, and uses short bridges of silence before grave moments.
//  • Vertical layering: cues with stems play a harmonic layer (pulse/triangle) and a percussive layer (noise channel)
//    sample-locked; tension fades the percussion in/out. Night darkens the bus with a low-pass.
//  • Deliberate silence: in calm states the music rests for 25–70 s after a few minutes, leaving only ambience.
//  • Stingers duck the music bus (-9 dB) and are quantised to the next beat.
import { audioCtx, getBuses, onAudioReady, duck, dbToGain, clamp01, cinematicAmount, type Buses } from './core';
import { loadManifest, getManifest, type Cue } from './manifest';
import { load, prefetch, pin } from './buffers';
import { cuePool, URGENT, type MusicState, type MusicIntent, type StingerId } from './state';

interface Deck { cue: Cue; srcs: AudioBufferSourceNode[]; out: GainNode; perc: GainNode | null; t0: number; plays: number; barDur: number }
export interface StingerOpts { quantize?: 'beat' | 'bar' | 'none'; duckDb?: number; prio?: number }
const STING_COOLDOWN: Partial<Record<StingerId, number>> = { sting_birth: 40000, sting_death: 15000, sting_eureka_b: 25000, sting_forbidden_love: 30000, sting_discovery: 20000, sting_notable_chime: 6000, sting_crowning: 20000, sting_revolt: 20000, sting_cinematic_a: 3000, sting_cinematic_b: 3000, sting_cinematic_c: 3000, sting_cinematic_d: 3000 };

export class MusicDirector {
  state: MusicState | null = null; private ctxState = { night: false, era: 0, faith: 0 as 0 | 1 };
  private deck: Deck | null = null; private gen = 0; private tension = 0.2; private tensionT = 0.2;
  private hold: { s: MusicState; until: number } | null = null; private pending: { s: MusicState; since: number } | null = null;
  private lastSwitch = 0; private restUntil = 0; private nextRestAt = 0; private poolIdx = new Map<string, number>();
  private sting: { id: string; prio: number; end: number } | null = null; private stingLast = new Map<string, number>();
  log: string[] = [];
  constructor() { void loadManifest(); onAudioReady(() => { if (this.state) { const s = this.state; this.state = null; this.setState(s, { immediate: true }); } }); }
  private get c() { return audioCtx(); } private get b(): Buses | null { return getBuses(); }
  /** force a state (title, menu, game over, or a scripted moment). `hold` keeps it for that many seconds against sim updates. */
  setState(s: MusicState, o: { immediate?: boolean; hold?: number; silenceFirst?: number } = {}) {
    if (o.hold) this.hold = { s, until: performance.now() + o.hold * 1000 };
    if (s === this.state && !o.silenceFirst) return;
    this.state = s; this.pending = null; this.lastSwitch = performance.now(); this.restUntil = 0;
    this.scheduleNextRest();
    void this.toPool(o.immediate ? 'now' : URGENT.has(s) ? 'beat' : 'bar', o.silenceFirst ?? 0);
  }
  /** feed the sim-derived intent every snapshot; applies hysteresis, holds and rests */
  setIntent(i: MusicIntent) {
    const now = performance.now();
    this.tensionT = i.tension;
    const ctxChanged = i.night !== this.ctxState.night || i.era !== this.ctxState.era || i.faith !== this.ctxState.faith;
    this.ctxState = { night: i.night, era: i.era, faith: i.faith };
    let want = i.state;
    if (this.hold && now < this.hold.until && !(URGENT.has(want) && i.reason.startsWith('gathering'))) want = this.hold.s; else if (this.hold && now >= this.hold.until) this.hold = null;
    if (this.state === 'title' || this.state === 'menu' || this.state === 'consent') return; // UI owns those
    if (want !== this.state) {
      if (!this.pending || this.pending.s !== want) this.pending = { s: want, since: now };
      const dwell = now - this.lastSwitch; const stable = now - this.pending.since;
      if (URGENT.has(want) || (stable > 6000 && dwell > 20000) || (stable > 2500 && this.state === null)) this.setState(want);
    } else { this.pending = null; if (ctxChanged && this.deck && !cuePool(want, this.ctxState).includes(this.deck.cue.id)) void this.toPool('bar', 0); }
  }
  /** call every frame or snapshot */
  tick() {
    const c = this.c, b = this.b; if (!c || !b) return; const now = performance.now();
    this.tension += (this.tensionT - this.tension) * 0.02;
    // vertical layer: percussion follows tension (and is thinned at night)
    if (this.deck?.perc) { const g = clamp01(0.15 + this.tension * 1.1) * (this.ctxState.night ? 0.6 : 1); this.deck.perc.gain.setTargetAtTime(g, c.currentTime, 0.8); }
    // night darkens the music a little
    if (cinematicAmount() === 0) b.musicTone.frequency.setTargetAtTime(this.ctxState.night && this.state !== 'title' ? 5200 : 18000, c.currentTime, 1.5);
    // deliberate silence in calm states
    const restful = this.state === 'calm' || this.state === 'founding' || this.state === 'pups' || this.state === 'unease' || this.state === 'lab';
    if (restful && this.deck && this.nextRestAt && now > this.nextRestAt && this.tension < 0.55) {
      this.restUntil = now + (this.ctxState.night ? 45000 + Math.random() * 25000 : 25000 + Math.random() * 25000); this.nextRestAt = 0;
      this.log.push(`rest ${Math.round((this.restUntil - now) / 1000)}s`); this.stopDeck(this.nextBoundary('bar'), 2 * (this.deck?.barDur ?? 2));
    } else if (this.restUntil && now > this.restUntil) { this.restUntil = 0; this.scheduleNextRest(); void this.toPool('now', 0); }
    // rotate within a pool after a couple of loops (checked near the loop end)
    const d = this.deck; if (d && d.cue.loop && !this.restUntil) {
      const len = d.cue.loopEnd - d.cue.loopStart; const played = Math.floor((c.currentTime - d.t0) / len);
      if (played !== d.plays) { d.plays = played; const pool = cuePool(this.state!, this.ctxState); if (pool.length > 1 && played >= 2) void this.toPool('loop', 0, true); }
    }
  }
  private scheduleNextRest() { this.nextRestAt = performance.now() + 150000 + Math.random() * 120000; }
  isResting() { return this.restUntil > performance.now(); }
  private pick(rotate: boolean): Cue | null {
    const m = getManifest(); if (!m || !this.state) return null;
    const pool = cuePool(this.state, this.ctxState).filter((id) => m.cues[id]); if (!pool.length) return null;
    const key = this.state; let i = this.poolIdx.get(key) ?? 0;
    if (rotate) i = (i + 1) % pool.length; else if (this.deck && pool.includes(this.deck.cue.id)) i = pool.indexOf(this.deck.cue.id);
    this.poolIdx.set(key, i); return m.cues[pool[i % pool.length]];
  }
  /** next musical boundary of the playing deck (ctx time) */
  private nextBoundary(q: 'beat' | 'bar' | 'loop' | 'now'): number {
    const c = this.c!; const d = this.deck; const now = c.currentTime + 0.06;
    if (!d || q === 'now') return now;
    const unit = q === 'beat' ? d.barDur / d.cue.beatsPerBar : q === 'bar' ? d.barDur : d.cue.loopEnd - d.cue.loopStart;
    const k = Math.ceil((now - d.t0) / unit); return d.t0 + Math.max(0, k) * unit;
  }
  private async toPool(q: 'beat' | 'bar' | 'loop' | 'now', silence: number, rotate = false) {
    const my = ++this.gen; await loadManifest(); const c = this.c, b = this.b; if (!c || !b) return;
    if (this.state === 'silence' || this.restUntil > performance.now()) { this.stopDeck(this.nextBoundary('bar'), 1.5); return; }
    const cue = this.pick(rotate); if (!cue) { this.stopDeck(this.nextBoundary('bar'), 1.5); return; }
    if (this.deck && this.deck.cue.id === cue.id && !silence) { return; }
    const files = cue.stems ? [cue.stems.harm.file, cue.stems.perc.file] : [cue.file];
    const bufs = await Promise.all(files.map((f) => load(c, f))); if (my !== this.gen) return;
    if (bufs.some((x) => !x)) { this.log.push('load failed ' + cue.id); return; }
    pin(files);
    let t = this.nextBoundary(this.deck ? q : 'now'); if (t - c.currentTime > 8) t = this.nextBoundary('bar');
    const old = this.deck; const oldBar = old?.barDur ?? 2;
    if (old) this.stopDeck(t, silence ? 0.25 : q === 'beat' ? Math.min(0.5, oldBar / 2) : oldBar);
    const start = t + silence;
    const out = c.createGain(); out.gain.value = 0; out.connect(b.music);
    const lvl = dbToGain(cue.gainDb || 0);
    out.gain.setValueAtTime(0, start); out.gain.linearRampToValueAtTime(lvl, start + (q === 'now' && !old ? 1.2 : 0.08));
    const srcs: AudioBufferSourceNode[] = []; let perc: GainNode | null = null;
    bufs.forEach((buf, k) => {
      const s = c.createBufferSource(); s.buffer = buf!; s.loop = cue.loop; if (cue.loop) { s.loopStart = cue.loopStart; s.loopEnd = cue.loopEnd; }
      if (cue.stems && k === 1) { perc = c.createGain(); perc.gain.value = clamp01(0.15 + this.tension * 1.1); s.connect(perc).connect(out); } else s.connect(out);
      s.start(start, 0); srcs.push(s);
    });
    const barDur = (60 / cue.bpm) * cue.beatsPerBar;
    this.deck = { cue, srcs, out, perc, t0: start, plays: 0, barDur };
    this.log.push(`${this.state} -> ${cue.id} @${q}${silence ? ' +' + silence + 's silence' : ''}`); if (this.log.length > 60) this.log.shift();
    this.prefetchNeighbours();
  }
  private stopDeck(at: number, fade: number) {
    const d = this.deck; const c = this.c; if (!d || !c) return; if (this.deck === d) this.deck = null;
    const g = d.out.gain; g.cancelScheduledValues(at); g.setValueAtTime(g.value, Math.max(c.currentTime, at - 0.001)); g.linearRampToValueAtTime(0, at + fade);
    for (const s of d.srcs) { try { s.stop(at + fade + 0.05); } catch { /* ignore */ } }
    setTimeout(() => { try { d.out.disconnect(); } catch { /* ignore */ } }, (at + fade - c.currentTime + 0.3) * 1000);
  }
  /** fetch (not decode) cues the colony is likely to need next, so a switch never waits on the network */
  private prefetchNeighbours() {
    const m = getManifest(); if (!m || !this.state) return;
    const near: MusicState[] = this.tension > 0.5 ? ['rebellion', 'famine', 'unease'] : ['unease', 'calm'];
    for (const s of near) for (const id of cuePool(s, this.ctxState)) { const cue = m.cues[id]; if (cue) for (const f of cue.stems ? [cue.stems.harm.file, cue.stems.perc.file] : [cue.file]) void prefetch(f); }
  }
  /** one-shot musical stinger over the bed; ducks the music; one at a time by priority */
  async playStinger(id: StingerId, o: StingerOpts = {}): Promise<boolean> {
    const m = await loadManifest(); const c = this.c, b = this.b; const cue = m?.cues[id]; if (!c || !b || !cue) return false;
    const now = performance.now(); const prio = o.prio ?? 2;
    if (now - (this.stingLast.get(id) ?? -1e9) < (STING_COOLDOWN[id] ?? 8000)) return false;
    if (this.sting && this.sting.end > c.currentTime && this.sting.prio >= prio) return false;
    this.stingLast.set(id, now);
    const buf = await load(c, cue.file); if (!buf) return false;
    const t = o.quantize === 'none' || !this.deck ? c.currentTime + 0.03 : Math.min(this.nextBoundary(o.quantize ?? 'beat'), c.currentTime + 0.6);
    const s = c.createBufferSource(); s.buffer = buf; const g = c.createGain(); g.gain.value = dbToGain(cue.gainDb || 0); s.connect(g).connect(b.stinger); s.start(t);
    this.sting = { id, prio, end: t + buf.duration };
    duck('musicDuck', o.duckDb ?? -9, Math.max(0.2, t - c.currentTime + buf.duration - 0.4), 0.08, 1.2); duck('ambDuck', -6, buf.duration, 0.1, 1.5); duck('sfxDuck', -4, Math.min(buf.duration, 1.5), 0.05, 0.6);
    this.log.push('stinger ' + id); return true;
  }
  info() { const c = this.c; return { state: this.state, cue: this.deck?.cue.id ?? null, resting: this.isResting(), tension: +this.tension.toFixed(2), bar: this.deck && c ? Math.floor((c.currentTime - this.deck.t0) / this.deck.barDur) : null, hold: this.hold?.s ?? null }; }
}
