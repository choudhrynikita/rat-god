// The OST manifest (assets/final/audio/audio_manifest.json), written by the asset pipeline.
// Every cue is Sogni-generated (MiniMax Music 3), loudness-normalised, and cut to whole bars.
export type CueKind = 'title' | 'loop' | 'stinger' | 'ambience';
export interface CueStem { id: string; file: string } // file stem without extension; both .ogg and .m4a exist
export interface Cue {
  id: string; kind: CueKind; file: string; /** path stem without extension, relative to the site root */
  dur: number; /** seconds */
  bpm: number; beatsPerBar: number; bars: number;
  loop: boolean; loopStart: number; loopEnd: number; /** seconds, sample-accurate, bar-aligned */
  lufs: number; gainDb: number; /** trim to apply at playback (already normalised; usually 0) */
  stems?: { harm: CueStem; perc: CueStem }; /** vertical layers: harmonic (pulse/triangle) + percussive (noise) */
  tags: string[]; /** e.g. ['day'], ['night'], ['era:2'] */
  bytes: { ogg: number; m4a: number };
  model: string; seed?: number; source?: string; /** provenance */
}
export interface AudioManifest { version: number; bpmGrid: number; key: string; cues: Record<string, Cue>; sfx: { procedural: string[]; sampled: string[] } }
let manifest: AudioManifest | null = null; let loading: Promise<AudioManifest | null> | null = null;
export const AUDIO_BASE = 'assets/final/audio/';
export function loadManifest(): Promise<AudioManifest | null> {
  if (manifest) return Promise.resolve(manifest);
  loading ??= fetch(AUDIO_BASE + 'audio_manifest.json').then((r) => (r.ok ? r.json() : null)).then((m) => (manifest = m)).catch(() => null);
  return loading;
}
export function getManifest() { return manifest; }
export function setManifestForTest(m: AudioManifest) { manifest = m; }
