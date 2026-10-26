// v1 compatibility shim (main.ts v1 imports { sfx, unlock, setAudio } from here). All sounds now go through the
// v2 audio system in ./index (chip SFX palette + voice limiting). New code should import from './index'.
import { unlock as u, playSfx, setEnabled, isEnabled } from './index';
export { AUDIO_EXT, onAudioReady, onUnlockGesture, audioCtx } from './core';
export function unlock() { u(); }
export function setAudio(v: boolean) { setEnabled(v); }
export function audioOn() { return isEnabled(); }
export const sfx = {
  squeak() { playSfx('squeak'); }, press() { playSfx('stamp'); }, hiss() { playSfx('hiss'); }, scurry() { playSfx('scurry'); },
  herald() { playSfx('herald'); }, bell() { playSfx('bell'); }, death() { playSfx('death'); }, pebble() { playSfx('pebble'); },
  dig() { playSfx('dig'); }, ui() { playSfx('ui_tap'); }, boot() { playSfx('boot'); }, gas() { playSfx('gas'); },
};
