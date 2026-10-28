// Ambience beds (the five Sogni beds from v1), streamed with HTMLAudio (each is ~1 min; never decoded whole) and mixed
// by weather, where the camera is, the tech era and what the colony is doing. They sit on the amb bus, which stingers duck.
import { AUDIO_EXT, getBuses, audioCtx, onAudioReady, onUnlockGesture } from './core';

export const AMB = ['amb_sewer_drips', 'amb_street_rain', 'amb_machine_hum', 'amb_crowd_murmur', 'amb_silence_dread', 'amb_retro_cave'] as const;
export type AmbId = (typeof AMB)[number];
export type AmbMix = Partial<Record<AmbId, number>>;
interface Chan { el: HTMLAudioElement; g: GainNode | null; want: number; id: AmbId }
const url = (id: string) => `assets/final/audio/${id}.${AUDIO_EXT}`;
function mkEl() { const el = new Audio(); el.loop = true; el.preload = 'none'; el.crossOrigin = 'anonymous'; (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true; return el; }

export class Ambience {
  ch: Chan[] = AMB.map((id) => ({ el: mkEl(), g: null, want: 0, id }));
  constructor() {
    onUnlockGesture(() => { for (const c of this.ch) { if (!c.el.src) c.el.src = url(c.id); c.el.muted = true; c.el.play()?.then(() => { if (c.want <= 0.001) c.el.pause(); c.el.muted = false; }).catch(() => { c.el.muted = false; }); } });
    onAudioReady((ctx, b) => { for (const c of this.ch) { try { const s = ctx.createMediaElementSource(c.el); c.g = ctx.createGain(); c.g.gain.value = 0; s.connect(c.g).connect(b.amb); } catch { c.g = null; } } });
  }
  set(mix: AmbMix, fade = 1.5) {
    const ctx = audioCtx(); if (!getBuses()) { for (const c of this.ch) c.want = mix[c.id] ?? 0; return; }
    for (const c of this.ch) {
      const v = Math.max(0, Math.min(1, mix[c.id] ?? 0)); if (Math.abs(v - c.want) < 0.02) continue; c.want = v;
      if (c.g && ctx) c.g.gain.setTargetAtTime(v, ctx.currentTime, fade / 3); else c.el.volume = v;
      if (v > 0.001 && c.el.paused) { if (!c.el.src) c.el.src = url(c.id); void c.el.play().catch(() => {}); }
      if (v <= 0.001 && !c.el.paused) setTimeout(() => { if (c.want <= 0.001) c.el.pause(); }, fade * 1000 + 300);
    }
  }
}
/** pure mixing rule (unit-tested): world context → bed levels */
export function ambMix(o: { underground: number; /** 0 = street view, 1 = deep */ rain: number; storm: boolean; machines: number; crowd: number; dread: boolean; dead: boolean; night: boolean }): AmbMix {
  const surf = 1 - o.underground;
  return {
    amb_sewer_drips: o.dead ? 0.3 : 0.25 + 0.35 * o.underground + 0.2 * o.rain * o.underground,
    amb_street_rain: Math.min(0.8, (0.1 + 0.6 * o.rain + (o.storm ? 0.2 : 0)) * (0.25 + 0.75 * surf)),
    amb_machine_hum: o.dead ? 0 : Math.min(0.5, 0.05 + 0.45 * o.machines),
    amb_crowd_murmur: o.dead ? 0 : Math.min(0.55, o.crowd * (o.night ? 0.5 : 1)),
    amb_silence_dread: o.dread || o.dead ? 0.6 : 0,
    // CC0 chiptune bed (Void Estate). Quiet under the drip bed so the two share the amb bus.
    amb_retro_cave: o.dead ? 0.04 : 0.08 + 0.1 * o.underground,
  };
}
