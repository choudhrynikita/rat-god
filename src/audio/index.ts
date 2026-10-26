// Rat God audio — public API. See docs/AUDIO_API.md.
//
//   import * as audio from './audio';
//   window.addEventListener('pointerdown', () => audio.unlock());
//   audio.setMusicState('title');                       // UI-owned states: title, menu, game_over, silence
//   audio.updateFromSim(snap2, 'jail');                  // every snapshot: picks music, plays event stingers/SFX
//   audio.setListener({ x, y, halfW, halfH });           // every camera change (world px)
//   audio.playSfx('squeak', { x, y });                   // positional one-shot; limited, attenuated, panned, varied
//   audio.playStinger('sting_miracle');                   // musical one-shot over the bed; ducks the music
//   audio.onGodResult(res);                               // a GodResult message from the sim worker
//   audio.frame();                                        // every animation frame (cheap)
import { unlock as coreUnlock, audioCtx, getBuses, isEnabled, setCinematic, godSilence } from './core';
import { onCaption, emitCaption, STINGER_CAPTIONS, SFX_CAPTIONS } from './captions';
import { MusicDirector, type StingerOpts } from './music';
import { VoiceManager, DEFS, type PlayOpts, type Listener, type Content } from './voices';
import { Ambience, ambMix } from './ambience';
import { deriveFromSim2, pickEvents, godPowerStinger, eventAudio, tiered, tierOf, GOD_POWER_SFX, CINEMATIC, type MusicState, type Focus, type StingerId } from './state';
import { stats as bufferStats } from './buffers';
import type { Snapshot2, SimEvent2, GodResult, Consent } from '../sim/v2/contract';

export type { MusicState, Focus, StingerId } from './state';
export type { Caption } from './captions';
export { onCaption };
export { setVolumes, setEnabled, setMusicEnabled, isEnabled, musicEnabled } from './core';
export const SFX = Object.keys(DEFS);

const director = new MusicDirector();
const voices = new VoiceManager();
const amb = new Ambience();
let focus: Focus = 'none'; let lastEra = -1; let uiState: MusicState | null = null;
let world = { streetY: 40, worldH: 180 * 4 }; // world px: street level and depth, for the ambience mix

export function unlock() { coreUnlock(); }
/** force music: 'title' | 'menu' | 'game_over' | 'silence' or any MusicState (scripted). `null` hands control back to the sim. */
export function setMusicState(s: MusicState | null, o: { hold?: number; immediate?: boolean } = {}) {
  uiState = s === 'title' || s === 'menu' || s === 'game_over' || s === 'consent' ? s : null;
  if (s) director.setState(s, o); else if (director.state === 'title' || director.state === 'menu' || director.state === 'consent') director.state = null;
}
export async function playStinger(id: StingerId, o?: StingerOpts) {
  const ok = await director.playStinger(id, id === 'sting_notable_chime' ? { duckDb: -3, ...o } : o);
  if (ok) emitCaption({ text: STINGER_CAPTIONS[id] ?? 'music', kind: 'stinger', id, dur: 3, weight: Math.min(3, Math.round(o?.prio ?? 2)) });
  else if (id === 'sting_notable_chime') playSfx('chime', { prio: 3 }); // fallback before the Sogni chime exists / during a bigger stinger
  return ok;
}
/** MAJOR-event cinematic banner: plays the tone's stinger immediately (highest priority) with a deep music duck */
export function playCinematic(tone: keyof typeof CINEMATIC = 'epic') { return playStinger(CINEMATIC[tone], { prio: 5, quantize: 'none', duckDb: -14 }); }
/** MAJOR cinematic slow-time (render sets time to 0.25x): pass the current time scale. <= 0.3 low-passes and swells reverb; 1 restores. */
export function setTimeScale(scale: number) { setCinematic(scale >= 0.99 ? 0 : scale <= 0.3 ? 1 : (1 - scale) / 0.7); }
/** content gating (consent screen). Gore SFX need gore >= 1 (mild); mating sounds need sexual themes = implied. Default: all off. */
export function setContent(c: Partial<Consent>) {
  const v: Content = voices.content;
  if (c.gore !== undefined) v.gore = c.gore >= 2 ? 'graphic' : c.gore >= 1 ? 'mild' : 'off';
  if (c.mature === false) v.gore = 'off';
  if (c.sexual !== undefined) v.sexual = c.sexual && c.mature !== false ? 'implied' : 'off';
}
export function contentSettings() { return { ...voices.content }; }
/** positional SFX. x/y in world px (same space as the camera). Returns false if it was culled/limited. */
export function playSfx(id: string, o: PlayOpts = {}) {
  const c = audioCtx(), b = getBuses(); if (!c || !b || !isEnabled()) return false;
  const d = DEFS[id]; if (!d) return false;
  const ok = voices.play(c, d.cat === 'ui' || d.cat === 'god' ? b.ui : b.sfx, id, o);
  const cap = ok ? SFX_CAPTIONS[id] : undefined;
  if (cap) { const L = voices.listener; const pan = o.x !== undefined ? Math.max(-1, Math.min(1, (o.x - L.x) / L.halfW)) : undefined; emitCaption({ text: cap[0], kind: cap[1], id, pan, dur: 2, weight: Math.min(3, o.sev ?? 1) }); }
  return ok;
}
/** camera → listener. halfW/halfH: half the visible world size; detailRef: half-width at which small sounds are full volume */
export function setListener(l: Partial<Listener>) { Object.assign(voices.listener, l); }
export function setFocus(f: Focus) { focus = f; }
export function setWorld(w: Partial<typeof world>) { Object.assign(world, w); }

/** Feed every v2 snapshot. Picks the music state, then turns this snapshot's events into at most one stinger plus SFX. */
export function updateFromSim(s: Snapshot2, f: Focus = focus) {
  focus = f;
  if (s.consent) setContent(s.consent);
  const intent = deriveFromSim2(s, focus, null);
  if (!uiState) director.setIntent(intent);
  if (lastEra >= 0 && s.stats.techEra > lastEra) void director.playStinger('sting_era_advance', { prio: 3, quantize: 'bar' });
  lastEra = s.stats.techEra;
  onSimEvents(s.events);
  // ambience
  const L = voices.listener; const under = Math.max(0, Math.min(1, (L.y - world.streetY) / (world.worldH * 0.5)));
  amb.set(ambMix({ underground: under, rain: s.env.rain, storm: s.env.weather === 'storm', machines: Math.min(1, s.stats.techEra / 5 + s.stats.rodentoids / 40), crowd: Math.min(1, s.stats.pop / 220 + (s.gathering ? 0.4 : 0)), dread: s.phase === 'interregnum' || !!s.justice?.secretPolice, dead: s.phase === 'dead', night: intent.night }));
  if (s.env.lightning) playSfx('thunder');
}
export function onSimEvents(evs: SimEvent2[]) {
  if (!evs?.length) return;
  const { top, rest } = pickEvents(evs);
  if (top) {
    const a = top.a;
    if (a.hold && !uiState) director.setState(a.hold.state, { hold: a.hold.sec, silenceFirst: a.silenceFirst });
    if (a.stinger) void playStinger(a.stinger, { prio: a.priority, quantize: a.silenceFirst || tierOf(top.e) === 'major' ? 'none' : 'beat', duckDb: tierOf(top.e) === 'major' ? -12 : undefined });
    if (a.sfx && allowed(top.e, a.sfx)) playSfx(a.sfx, { x: top.e.x, y: top.e.y, prio: a.priority + 2, sev: top.e.sev });
  }
  // per-snapshot SFX: one per distinct sound id (the voice manager limits further), loudest events first
  const seen = new Set<string>();
  for (const { e, a } of rest.sort((p, q) => q.e.sev - p.e.sev)) { if (!a.sfx || seen.has(a.sfx) || !allowed(e, a.sfx)) continue; seen.add(a.sfx); playSfx(a.sfx, { x: e.x, y: e.y, sev: e.sev }); if (seen.size >= 4) break; }
}
/** events tagged mature: gore-tagged sounds need gore >= mild; sex-tagged sounds need sexual = implied (and are only ever 'implied' chirps) */
function allowed(e: SimEvent2, sfx: string) {
  const m = e.mature ?? []; const c = voices.content;
  if ((m.includes('gore') || m.includes('torture')) && c.gore === 'off') return sfx !== 'squeal' && sfx !== 'crunch' && sfx !== 'death';
  if ((m.includes('sex') || m.includes('incest')) && c.sexual !== 'implied') return false;
  return true;
}
export function onGodResult(r: GodResult) {
  if (!r.ok) { playSfx('god_fail'); return; }
  const p = String(r.power);
  if (p === 'silence') { godSilence(6); emitCaption({ text: 'sudden silence', kind: 'god', id: 'silence', dur: 6, weight: 2 }); return; } // the absence is the sound
  const sfx = GOD_POWER_SFX[p]; if (sfx) playSfx(sfx, { prio: 9, force: true });
  const st = godPowerStinger(r.power); if (st) void playStinger(st, { prio: 4, quantize: 'none' });
}
/** every animation frame */
export function frame() { director.tick(); }
/** debug overlay / tests */
export function debug() { return { music: director.info(), log: director.log.slice(-12), voices: voices.stats, buffers: bufferStats() }; }
export { eventAudio, tiered, deriveFromSim2 };
/** advanced: drive the director with a hand-made intent (used by the v1 adapter in mixer.ts) */
export function setIntent(i: import('./state').MusicIntent) { if (!uiState) director.setIntent(i); }
export function setAmbience(m: import('./ambience').AmbMix) { amb.set(m); }
export { ambMix };
