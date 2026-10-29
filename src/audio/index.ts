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
import { unlock as coreUnlock, setCinematic, godSilence } from './core';
import { onCaption } from './captions';
import { MusicDirector, type StingerOpts } from './music';
import { VoiceManager, DEFS, type PlayOpts, type Listener, type Content } from './voices';
import { Ambience, ambMix } from './ambience';
import { deriveFromSim2, pickEvents, eventAudio, tiered, CINEMATIC, type MusicState, type Focus, type StingerId } from './state';
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
let focus: Focus = 'none'; let uiState: MusicState | null = null;
let world = { streetY: 40, worldH: 180 * 4 }; // world px: street level and depth, for the ambience mix

export function unlock() { coreUnlock(); }
/** Start the bed on the first gesture, before the sim has sent a snapshot. */
export function prime() { unlock(); if (!director.state) director.setState('founding', { immediate: true }); }
/** force music: 'title' | 'menu' | 'game_over' | 'silence' or any MusicState (scripted). `null` hands control back to the sim. */
export function setMusicState(s: MusicState | null, o: { hold?: number; immediate?: boolean } = {}) {
  uiState = s === 'title' || s === 'menu' || s === 'game_over' || s === 'consent' ? s : null;
  if (s) director.setState(s, o); else if (director.state === 'title' || director.state === 'menu' || director.state === 'consent') director.state = null;
}
export async function playStinger(_id: StingerId, _o?: StingerOpts): Promise<boolean> { return false; }
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
/** Sound effects are off. The bed is the only audio. */
export function playSfx(_id: string, _o: PlayOpts = {}) { return false; }
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
}
export function onSimEvents(evs: SimEvent2[]) {
  if (!evs?.length || uiState) return;
  const { top } = pickEvents(evs);
  if (!top?.a.hold) return;
  director.setState(top.a.hold.state, { hold: top.a.hold.sec });
}
export function onGodResult(r: GodResult) {
  if (!r.ok) return;
  if (String(r.power) === 'silence') { godSilence(6); return; }
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
