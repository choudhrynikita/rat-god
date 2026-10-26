// Captions for stingers and voices (V2_SCOPE_DELTA §3, shared with the render's caption layer).
// Lore-safe: sounds are described in the world's own terms (rats, the god, the Giants), never anything else.
import type { StingerId } from './state';

export interface Caption { text: string; kind: 'music' | 'stinger' | 'voice' | 'sfx' | 'god'; id: string; /** -1 left .. 1 right, when positional */ pan?: number; /** seconds the caption should stay up */ dur: number; /** 0 low .. 3 MAJOR */ weight: number }
export const STINGER_CAPTIONS: Record<StingerId, string> = {
  sting_smite: 'thunderous crash from above', sting_blessing: 'bright rising chime', sting_miracle: 'radiant swelling fanfare',
  sting_curse: 'sour falling chord', sting_plague: 'sickly wavering tones', sting_flood: 'rushing water and alarm',
  sting_resurrection: 'eerie rising hymn', sting_birth: 'tiny bright tune', sting_death: 'slow mournful notes',
  sting_forbidden_love: 'secret tender melody', sting_assassination: 'sharp stabbing chords', sting_prophet: 'mystic shimmering tones',
  sting_discovery: 'curious bubbling arpeggio', sting_eureka_a: 'triumphant eureka fanfare', sting_eureka_b: 'small bright eureka',
  sting_era_advance: 'grand rising fanfare: a new age', sting_crowning: 'royal fanfare: a king is crowned', sting_revolt: 'urgent drums: the colony rises',
  sting_notable_chime: 'soft chime', sting_god_punishes_king: 'the god strikes the crown', sting_cinematic_a: 'epic fanfare',
  sting_cinematic_b: 'dark ominous chord', sting_cinematic_c: 'triumphant flourish', sting_cinematic_d: 'mysterious shimmer',
};
/** SFX that deserve a caption (rat voices and loud world sounds); others are too small to caption */
export const SFX_CAPTIONS: Record<string, [string, Caption['kind']]> = {
  squeak: ['squeaking', 'voice'], squeal: ['pained squeal', 'voice'], death: ['a dying squeak', 'voice'], growl: ['predator growl', 'voice'],
  pray: ['murmured prayer', 'voice'], herald: ['herald horn', 'sfx'], bell: ['bell tolls', 'sfx'], thunder: ['thunder', 'sfx'],
  collapse: ['tunnel collapse', 'sfx'], rumble: ['deep rumble', 'sfx'], splash: ['splashing water', 'sfx'], fire: ['crackling fire', 'sfx'],
  boot: ['a Giant\u2019s footstep', 'sfx'], gas: ['hissing gas', 'sfx'], crunch: ['a sickening crunch', 'voice'], nuzzle: ['soft chirps', 'voice'],
  god_sign: ['a sign appears', 'god'], god_voice: ['the god speaks', 'god'], god_mark: ['a mark is set', 'god'], god_pardon: ['a pardon rings out', 'god'],
  god_illuminate: ['light floods the tunnel', 'god'], god_spring: ['water bursts up', 'god'], god_judge: ['judgement falls', 'god'], god_reveal: ['a law is revealed', 'god'],
  god_fail: ['the power fizzles', 'god'],
};
type Cb = (c: Caption) => void;
const subs = new Set<Cb>(); const lastAt = new Map<string, number>();
export function onCaption(cb: Cb) { subs.add(cb); return () => subs.delete(cb); }
/** throttled: the same caption at most every 2.5 s (rat voices every 4 s) */
export function emitCaption(c: Caption, nowMs = performance.now()) {
  if (!subs.size) return; const gap = c.kind === 'voice' ? 4000 : 2500;
  if (nowMs - (lastAt.get(c.text) ?? -1e9) < gap) return; lastAt.set(c.text, nowMs);
  for (const s of subs) { try { s(c); } catch { /* a bad subscriber must not break audio */ } }
}
export const panWord = (pan?: number) => (pan === undefined || Math.abs(pan) < 0.25 ? '' : pan < 0 ? ' (left)' : ' (right)');
