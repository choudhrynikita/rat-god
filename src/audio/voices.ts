// The anti-cacophony layer. Every SFX request passes through here:
//  1. per-id cooldown and burst limiting (the 5th squeak in a second is dropped, not stacked)
//  2. spatial culling and attenuation: distance from the camera centre in view-widths, plus a zoom "detail" factor so
//     small sounds (squeaks, digging) fade out when the player zooms out to see the whole colony
//  3. stereo panning by on-screen x
//  4. per-category voice caps with priority stealing (a quiet far squeak never steals from a stamp)
//  5. random pitch (semitones) and volume (dB) variation per play
import { RECIPES, play, LEVEL_DB } from './chip';
import { dbToGain } from './core';

export type Category = 'ui' | 'creature' | 'work' | 'world' | 'god' | 'social';
export interface SfxDef { cat: Category; prio: number; db: number; cooldown: number; /** ms between plays of this id */ burst: number; /** max plays per second */ pitch: number; /** ± semitones */ vol: number; /** ± dB */ spatial: boolean; radius: number; /** audible radius in view half-widths (1 = screen edge) */ detail: boolean; /** fades when zoomed out */ }
const D = (cat: Category, prio: number, db: number, cooldown: number, burst: number, o: Partial<SfxDef> = {}): SfxDef => ({ cat, prio, db, cooldown, burst, pitch: 1, vol: 2, spatial: true, radius: 1.25, detail: true, ...o });
export const DEFS: Record<string, SfxDef> = {
  squeak: D('creature', 1, -10, 180, 3, { pitch: 3 }), squeal: D('creature', 3, -6, 400, 2, { pitch: 2 }), death: D('creature', 4, -6, 600, 2, { detail: false }),
  scurry: D('work', 1, -12, 250, 3), dig: D('work', 1, -12, 140, 4, { pitch: 2 }), gnaw: D('work', 1, -13, 300, 2), eat: D('work', 1, -14, 400, 2),
  stamp: D('social', 6, -3, 300, 2, { spatial: false, detail: false }), herald: D('social', 4, -8, 1500, 1, { radius: 1.6, detail: false, pitch: 0 }), pebble: D('social', 3, -9, 70, 8, { pitch: 2, detail: false }),
  bell: D('social', 6, -6, 4000, 1, { spatial: false, detail: false, pitch: 0 }), chime: D('god', 5, -8, 1200, 1, { detail: false, pitch: 0 }), pray: D('social', 1, -16, 2500, 1, { pitch: 0 }),
  hiss: D('world', 5, -6, 900, 1, { radius: 1.6, detail: false }), growl: D('world', 5, -6, 1200, 1, { radius: 1.6, detail: false }), boot: D('world', 6, -3, 500, 2, { radius: 2, detail: false }),
  gas: D('world', 5, -9, 2500, 1, { radius: 1.8, detail: false }), thunder: D('world', 7, -3, 1500, 1, { spatial: false, detail: false, pitch: 2 }), collapse: D('world', 6, -4, 900, 1, { radius: 1.8, detail: false }),
  rumble: D('world', 6, -5, 2000, 1, { spatial: false, detail: false }), splash: D('world', 4, -8, 400, 2, { radius: 1.5 }), fire: D('world', 3, -12, 600, 2),
  zap: D('work', 3, -10, 500, 2), clank: D('work', 2, -10, 350, 2), beep: D('work', 2, -13, 900, 1, { pitch: 0 }), gear: D('work', 1, -14, 800, 1),
  ui_tap: D('ui', 8, -6, 40, 10, { spatial: false, detail: false, pitch: 0.3, vol: 0.5 }), ui_open: D('ui', 8, -6, 80, 6, { spatial: false, detail: false, pitch: 0, vol: 0 }), ui_close: D('ui', 8, -6, 80, 6, { spatial: false, detail: false, pitch: 0, vol: 0 }),
  ui_confirm: D('ui', 8, -5, 80, 6, { spatial: false, detail: false, pitch: 0, vol: 0 }), ui_deny: D('ui', 8, -5, 150, 4, { spatial: false, detail: false, pitch: 0, vol: 0 }),
  god_sign: D('god', 8, -5, 400, 2, { spatial: false, detail: false, pitch: 0, vol: 0 }), god_voice: D('god', 8, -4, 800, 1, { spatial: false, detail: false, pitch: 0, vol: 0 }),
  god_mark: D('god', 8, -5, 300, 2, { detail: false, pitch: 0, vol: 0, radius: 3 }), god_pardon: D('god', 8, -5, 500, 2, { detail: false, pitch: 0, vol: 0, radius: 3 }),
  god_illuminate: D('god', 8, -6, 600, 1, { spatial: false, detail: false, pitch: 0, vol: 0 }), god_spring: D('god', 8, -5, 600, 1, { detail: false, radius: 3 }),
  god_judge: D('god', 8, -4, 600, 1, { spatial: false, detail: false, pitch: 0, vol: 0 }), god_reveal: D('god', 8, -5, 600, 1, { spatial: false, detail: false, pitch: 0, vol: 0 }),
  crunch: D('creature', 4, -8, 300, 2, { detail: false }), nuzzle: D('creature', 1, -14, 2000, 1, { pitch: 1 }),
  god_select: D('god', 8, -6, 120, 4, { spatial: false, detail: false, pitch: 0, vol: 0 }), god_charge: D('god', 8, -6, 300, 2, { spatial: false, detail: false, pitch: 0, vol: 0 }), god_fail: D('god', 8, -6, 300, 2, { spatial: false, detail: false, pitch: 0, vol: 0 }),
};
export const CAT_MAX: Record<Category, number> = { ui: 3, creature: 3, work: 3, world: 2, god: 2, social: 3 };
export const TOTAL_MAX = 10;
/** "rat voices" (sounds made by rats) share one cap of 6 (V2_SCOPE_DELTA §3, L15.9) */
export const RAT_VOICE_MAX = 6; export const isRatVoice = (cat: Category) => cat === 'creature' || cat === 'work' || cat === 'social';
/** content gating: gore SFX need gore >= mild; mating sounds need sexual themes = implied */
export const GORE_SFX = new Set(['squeal', 'crunch']); export const SEXUAL_SFX = new Set(['nuzzle']);
export interface Content { gore: 'off' | 'mild' | 'graphic'; sexual: 'off' | 'implied' }
export interface Listener { x: number; y: number; halfW: number; halfH: number; /** view half-size in world units */ detailRef: number; /** half-width at which small sounds are at full level */ }
export interface PlayOpts { x?: number; y?: number; gain?: number; /** extra dB */ prio?: number; /** event severity 0..3 (scales priority) */ sev?: number; force?: boolean }
interface Voice { id: string; cat: Category; score: number; end: number; out: GainNode }
export interface Decision { ok: boolean; why: string; gain: number; pan: number; score: number }

export class VoiceManager {
  listener: Listener = { x: 0, y: 0, halfW: 100, halfH: 180, detailRef: 60 };
  content: Content = { gore: 'off', sexual: 'off' };
  private last = new Map<string, number>(); private hits = new Map<string, number[]>(); private active: Voice[] = [];
  private lastRecipe = new Map<string, number>();
  stats = { played: 0, dropped: { cooldown: 0, burst: 0, far: 0, quiet: 0, voices: 0 } as Record<string, number> };
  /** pure decision (exported for tests): may this sound play, at what gain/pan, with what score */
  decide(id: string, o: PlayOpts, nowMs: number, nowCtx: number): Decision {
    const d = DEFS[id]; if (!d) return { ok: false, why: 'unknown', gain: 0, pan: 0, score: 0 };
    if (GORE_SFX.has(id) && this.content.gore === 'off') return this.drop('content');
    if (SEXUAL_SFX.has(id) && this.content.sexual !== 'implied') return this.drop('content');
    if (!o.force) {
      const l = this.last.get(id) ?? -1e9; if (nowMs - l < d.cooldown) return this.drop('cooldown');
      const h = (this.hits.get(id) ?? []).filter((t) => nowMs - t < 1000); if (h.length >= d.burst) return this.drop('burst');
    }
    let g = dbToGain(d.db + (LEVEL_DB[id] ?? 0) + (o.gain ?? 0)); let pan = 0; let dist = 0;
    if (d.spatial && o.x !== undefined && o.y !== undefined) {
      const L = this.listener; const dx = (o.x - L.x) / L.halfW, dy = (o.y - L.y) / L.halfH; dist = Math.hypot(dx, dy * 0.8);
      if (dist > d.radius + 0.35) return this.drop('far');
      const fall = dist <= 0.55 ? 1 : Math.max(0, 1 - (dist - 0.55) / (d.radius + 0.35 - 0.55)); g *= fall * fall;
      pan = Math.max(-0.85, Math.min(0.85, dx * 0.8));
    }
    if (d.detail) { const L = this.listener; g *= Math.min(1, Math.max(0.08, (L.detailRef / L.halfW) ** 1.2)); }
    if (g < dbToGain(-48)) return this.drop('quiet');
    // priority = severity x 1/distance (L15.9): sev 0..3 lifts base priority; nearer sounds win
    const score = (o.prio ?? d.prio) * (1 + (o.sev ?? 0)) / (0.5 + dist);
    this.active = this.active.filter((v) => v.end > nowCtx);
    const inCat = this.active.filter((v) => v.cat === d.cat);
    const voices = isRatVoice(d.cat) ? this.active.filter((v) => isRatVoice(v.cat)) : [];
    const catFull = inCat.length >= CAT_MAX[d.cat], voiceFull = voices.length >= RAT_VOICE_MAX;
    const full = catFull || voiceFull || this.active.length >= TOTAL_MAX;
    if (full) {
      const pool = catFull ? inCat : voiceFull ? voices : this.active; const weakest = pool.reduce((a, b) => (a.score <= b.score ? a : b));
      if (weakest.score >= score) return this.drop('voices');
      try { weakest.out.gain.setTargetAtTime(0, nowCtx, 0.015); } catch { /* ignore */ } weakest.end = 0; this.active = this.active.filter((v) => v !== weakest);
    }
    return { ok: true, why: 'ok', gain: g, pan, score };
  }
  private drop(why: string): Decision { this.stats.dropped[why] = (this.stats.dropped[why] ?? 0) + 1; return { ok: false, why, gain: 0, pan: 0, score: 0 }; }
  play(c: AudioContext, dest: AudioNode, id: string, o: PlayOpts = {}): boolean {
    const nowMs = performance.now(); const dec = this.decide(id, o, nowMs, c.currentTime); if (!dec.ok) return false;
    const d = DEFS[id];
    this.last.set(id, nowMs); const h = (this.hits.get(id) ?? []).filter((t) => nowMs - t < 1000); h.push(nowMs); this.hits.set(id, h);
    const out = c.createGain(); out.gain.value = dec.gain * dbToGain((Math.random() * 2 - 1) * d.vol);
    let node: AudioNode = out;
    if (dec.pan !== 0 && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = dec.pan; out.connect(p); node = p; p.connect(dest); } else out.connect(dest);
    void node;
    const pitch = Math.pow(2, ((Math.random() * 2 - 1) * d.pitch) / 12);
    const end = play(c, out, RECIPES[id](), c.currentTime + 0.005, pitch);
    this.active.push({ id, cat: d.cat, score: dec.score, end, out }); this.stats.played++;
    setTimeout(() => { try { out.disconnect(); } catch { /* ignore */ } }, (end - c.currentTime + 0.3) * 1000);
    this.lastRecipe.set(id, nowMs); return true;
  }
  activeCount(nowCtx: number) { return this.active.filter((v) => v.end > nowCtx).length; }
}
