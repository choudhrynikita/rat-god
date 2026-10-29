// Pure, testable mapping from simulation state/events to music intents and stinger/SFX requests.
// No WebAudio here: the director (music.ts) and the voice manager (voices.ts) act on what this returns.
import type { Snapshot2, SimEvent2, GodPower } from '../sim/v2/contract';

export type MusicState =
  | 'title' | 'menu' | 'founding' | 'calm' | 'unease' | 'famine' | 'plague' | 'rebellion' | 'war' | 'revolution' | 'vote'
  | 'coronation' | 'funeral' | 'succession' | 'collapse' | 'storm' | 'flood' | 'game_over'
  | 'lab' | 'festival' | 'pups' | 'hymn' | 'protest' | 'oppression' | 'jail' | 'trial' | 'holy_war' | 'silence'
  | 'wedding' | 'romance' | 'king_defies' | 'godless' | 'consent';
export const URGENT: ReadonlySet<MusicState> = new Set(['vote', 'funeral', 'coronation', 'revolution', 'game_over', 'flood', 'holy_war', 'trial', 'silence', 'title', 'menu', 'consent', 'wedding', 'king_defies']);
/** camera context supplied by the render stream: what the player is looking at */
export type Focus = 'none' | 'jail' | 'lab' | 'temple' | 'nursery' | 'throne' | 'surface';
export interface MusicIntent { state: MusicState; tension: number; night: boolean; era: number; faith: 0 | 1; reason: string }
export interface MusicCtx { night: boolean; era: number; faith: 0 | 1 }

/** Four original beds. Every state lands on one of them so the director never asks for a missing file. */
const DRIFT = 'bed_drift';
const NIGHT = 'bed_night';
const STRAIN = 'bed_strain';
const HYMN = 'bed_hymn';
const STRAIN_STATES: ReadonlySet<MusicState> = new Set(['unease', 'famine', 'plague', 'rebellion', 'war', 'revolution', 'storm', 'flood', 'collapse', 'protest', 'oppression', 'jail', 'trial', 'holy_war', 'godless', 'king_defies']);
export function cuePool(s: MusicState, c: MusicCtx): string[] {
  if (s === 'silence') return [];
  if (s === 'hymn' || s === 'festival' || s === 'wedding' || s === 'coronation' || s === 'romance') return [HYMN];
  if (s === 'funeral' || s === 'game_over' || s === 'succession') return [NIGHT];
  if (STRAIN_STATES.has(s)) return [c.night ? NIGHT : STRAIN];
  return [c.night ? NIGHT : DRIFT];
}
export function eraCue(era: number) { return era >= 5 ? 'loop_era_ri' : era >= 4 ? 'loop_era_mechanised' : era >= 2 ? 'loop_era_scrap_electric' : 'loop_era_primitive'; }

const GATHER: Record<string, MusicState> = { vote: 'vote', election: 'vote', riot: 'revolution', coup: 'revolution', funeral: 'funeral', sermon: 'hymn', strike: 'protest', protest: 'protest', trial: 'trial', festival: 'festival', holy_war: 'holy_war' };

/** Derive the wanted music from a v2 snapshot. `holds` are event-driven states that stick for a while. */
export function deriveFromSim2(s: Snapshot2, focus: Focus = 'none', hold: MusicState | null = null): MusicIntent {
  const st = s.stats; const env = s.env;
  const night = env.tod < 0.23 || env.tod > 0.8;
  const era = st.techEra ?? 0;
  const rel = s.religions?.[0]; const faith = (rel ? rel.id % 2 : 0) as 0 | 1;
  const fear = Math.max(0, (st.hunger - 0.4) * 1.4, st.disease * 2.2, st.unrest, 1 - st.legitimacy - 0.3);
  const tension = clamp01(0.15 + 0.85 * fear + (env.weather === 'storm' ? 0.15 * env.intensity : 0));
  const base = { tension, night, era, faith };
  const I = (state: MusicState, reason: string): MusicIntent => ({ ...base, state, reason });
  if (s.phase === 'dead' || st.pop <= 0) return I('game_over', 'city dead');
  if (s.gathering && GATHER[s.gathering.kind]) return I(GATHER[s.gathering.kind], 'gathering:' + s.gathering.kind);
  if (hold) return I(hold, 'hold');
  if (st.pop <= 4 && st.deaths > st.births) return I('collapse', 'last survivors');
  const holyWar = s.religions?.some((r) => (r.enemies?.length ?? 0) > 0);
  if (holyWar && st.unrest > 0.35) return I('holy_war', 'religions at war');
  if (env.weather === 'storm' && env.intensity > 0.6) return I('storm', 'storm');
  if (st.disease > 0.18) return I('plague', 'disease ' + st.disease.toFixed(2));
  if (st.hunger > 0.62 || (st.food <= 0 && st.pop > 0)) return I('famine', 'hunger ' + st.hunger.toFixed(2));
  if (st.unrest > 0.72) return I('rebellion', 'unrest ' + st.unrest.toFixed(2));
  const feud = s.arcs?.some((a) => !a.ended && (a.kind === 'feud' || a.kind === 'coup') && a.heat > 0.6);
  if (feud) return I('war', 'feud arc');
  // god-vs-king and atheist arcs (arc kinds are open strings in later contract revisions; matched loosely)
  const arcKind = (k: string) => s.arcs?.some((a) => !a.ended && String(a.kind).includes(k) && a.heat > 0.4);
  if (arcKind('defi') || arcKind('war_on_god')) return I('king_defies', 'king defies the god');
  if (arcKind('godless') || arcKind('atheis') || arcKind('prove')) return I('godless', 'godless movement');
  if (s.justice?.secretPolice && st.unrest > 0.3) return I('oppression', 'secret police');
  if (s.phase === 'interregnum') return I('succession', 'interregnum');
  if (s.phase === 'founding') return I('founding', 'founding');
  // what the camera is looking at colours calm times
  if (focus === 'jail' && (s.justice?.inmates?.length ?? 0) > 0) return I('jail', 'focus jail');
  if (focus === 'lab' && (s.research?.length ?? 0) > 0) return I('lab', 'focus lab');
  if (focus === 'temple' && rel) return I('hymn', 'focus temple');
  const fest = s.festivals?.[0]; if (fest) return I(fest.kind === 'wedding' ? 'wedding' : 'festival', 'festival ' + fest.kind);
  if (st.unrest > 0.62 || st.legitimacy < 0.18 || st.hunger > 0.62) return I('unease', 'unease');
  if (focus === 'nursery' && !night && st.pups > 0) return I('pups', 'focus nursery');
  return I('calm', 'calm');
}

// ─── events → audio ───
export type StingerId =
  | 'sting_smite' | 'sting_blessing' | 'sting_miracle' | 'sting_curse' | 'sting_plague' | 'sting_flood' | 'sting_resurrection'
  | 'sting_birth' | 'sting_death' | 'sting_forbidden_love' | 'sting_assassination' | 'sting_prophet' | 'sting_discovery'
  | 'sting_eureka_a' | 'sting_eureka_b' | 'sting_era_advance'
  | 'sting_crowning' | 'sting_revolt' | 'sting_notable_chime'
  | 'sting_god_punishes_king' | 'sting_cinematic_a' | 'sting_cinematic_b' | 'sting_cinematic_c' | 'sting_cinematic_d';
/** cinematic banner stinger family (tone → cue) for MAJOR events */
export const CINEMATIC: Record<'epic' | 'dark' | 'triumph' | 'mystery', StingerId> = { epic: 'sting_cinematic_a', dark: 'sting_cinematic_b', triumph: 'sting_cinematic_c', mystery: 'sting_cinematic_d' };
export interface EventAudio { stinger?: StingerId; priority: number; hold?: { state: MusicState; sec: number }; sfx?: string; positional?: boolean; silenceFirst?: number }
const SFX_HINT: Record<string, string> = { thunder: 'thunder', collapse: 'collapse', squeal: 'squeal', choir: 'chime', bell: 'bell', splash: 'splash', hiss: 'hiss', gas: 'gas', fire: 'fire', zap: 'zap', clank: 'clank', stamp: 'stamp', pebble: 'pebble', horn: 'herald' };
export function eventAudio(e: SimEvent2): EventAudio | null {
  const big = e.sev >= 2; const hint = e.sfx ? SFX_HINT[e.sfx] ?? e.sfx : undefined;
  const r = (x: Partial<EventAudio>): EventAudio => ({ priority: e.sev, sfx: hint, positional: e.x !== undefined, ...x });
  switch (e.kind) {
    case 'crowned': return r({ hold: { state: 'coronation', sec: 48 }, priority: 3 });
    case 'king_died': case 'execution': return e.kind === 'execution' && !big ? r({ sfx: 'death' }) : r({ stinger: 'sting_death', hold: { state: 'funeral', sec: 60 }, priority: 3, silenceFirst: 1.5 });
    case 'assassination': case 'murder': return big || e.kind === 'assassination' ? r({ stinger: 'sting_assassination', priority: 3 }) : r({ sfx: 'squeal' });
    case 'birth': return big ? r({ stinger: 'sting_birth', priority: 1.5 }) : r({ sfx: 'squeak' });
    case 'death': return big ? r({ stinger: 'sting_death', priority: 2 }) : r({ sfx: 'death' });
    case 'affair': return big ? r({ stinger: 'sting_forbidden_love', priority: 2, hold: { state: 'romance', sec: 35 } }) : null;
    case 'courtship': case 'mate': return big ? r({ hold: { state: 'romance', sec: 35 }, priority: 1.5 }) : null;
    case 'pairbond': return big ? r({ hold: { state: 'wedding', sec: 40 }, priority: 2, sfx: 'chime' }) : null;
    case 'prophecy': case 'religion_founded': return r({ stinger: 'sting_prophet', priority: 2.5 });
    case 'discovery': return r({ stinger: big ? 'sting_eureka_a' : 'sting_eureka_b', priority: big ? 2.5 : 1.2 });
    case 'labrats_arrive': return r({ stinger: 'sting_discovery', priority: 2.5, hold: { state: 'lab', sec: 40 } });
    case 'rodentoid_built': return r({ sfx: 'clank' });
    case 'flood': return r({ stinger: 'sting_flood', hold: { state: 'flood', sec: 40 }, priority: 3, sfx: 'splash' });
    case 'plague': return r({ stinger: 'sting_plague', priority: 2.5 });
    case 'miracle': return r({ stinger: 'sting_miracle', priority: 3 });
    case 'blessed': return r({ stinger: 'sting_blessing', priority: 2 });
    case 'cursed': return r({ stinger: 'sting_curse', priority: 2 });
    case 'risen': return r({ stinger: 'sting_resurrection', priority: 3 });
    case 'smite': return r({ stinger: 'sting_smite', priority: 3, sfx: 'thunder' });
    case 'trial': return big ? r({ hold: { state: 'trial', sec: 45 } }) : null;
    case 'jailed': return r({ sfx: 'clank' });
    case 'holy_war': return r({ hold: { state: 'holy_war', sec: 60 }, priority: 3 });
    case 'festival': return r({ hold: { state: 'festival', sec: 50 }, priority: 2 });
    case 'protest': case 'strike': return big ? r({ hold: { state: 'protest', sec: 45 } }) : null;
    case 'crackdown': case 'secret_police': return r({ hold: { state: 'oppression', sec: 50 }, priority: 2 });
    case 'law_pressed': case 'law_proclaimed': return r({ sfx: 'stamp' });
    case 'herald': return r({ sfx: 'herald' });
    case 'vote': return r({ sfx: 'pebble' });
    case 'collapse': return r({ sfx: 'collapse' });
    case 'predator': return r({ sfx: 'hiss' });
    case 'gas': return r({ sfx: 'gas' });
    case 'fire': return r({ sfx: 'fire' });
    case 'quake': return r({ sfx: 'rumble' });
    case 'dig_start': case 'dig_done': return r({ sfx: 'dig' });
    case 'play': case 'game': case 'dance': return r({ sfx: 'squeak' });
    case 'coup': return big ? r({ stinger: 'sting_assassination', priority: 2.5, hold: { state: 'revolution', sec: 40 } }) : r({ sfx: 'stamp' });
    case 'riot': return r({ sfx: 'boot', priority: 2 });
    case 'omen': return big ? r({ stinger: 'sting_prophet', priority: 2 }) : null;
    case 'harvest': return big ? r({ stinger: 'sting_blessing', priority: 1.5 }) : r({ sfx: 'chime' });
    case 'famine': case 'drought': return big ? r({ stinger: 'sting_curse', priority: 2 }) : null;
    case 'arrest': case 'escape': case 'released': return r({ sfx: 'clank' });
    case 'verdict': case 'pardon': return r({ sfx: 'stamp' });
    case 'experiment_failed': case 'rodentoid_broken': return r({ sfx: 'zap' });
    case 'predator_kill': return r({ sfx: 'squeal', priority: 2 });
    case 'predator_driven_off': return r({ sfx: 'squeak' });
    case 'temple': case 'pilgrimage': case 'prayer': return r({ sfx: e.kind === 'temple' ? 'bell' : 'pray' });
    case 'tech_worshipped': case 'conversion': return big ? r({ stinger: 'sting_prophet', priority: 1.5 }) : r({ sfx: 'chime' });
    case 'heresy': {
      const t = (e.sfx ?? '') + ' ' + (e.card ?? '');
      if (t.includes('king_defies')) return r({ hold: { state: 'king_defies', sec: 60 }, priority: 3 });
      if (t.includes('godless')) return r({ hold: { state: 'godless', sec: 60 }, priority: 2.5 });
      return big ? r({ stinger: 'sting_curse', priority: 1.5 }) : null;
    }
    case 'god_act': if ((e.sfx ?? '').includes('punish_king')) return r({ stinger: 'sting_god_punishes_king', priority: 4 }); return null; // the GodResult already played the power's stinger
    default: return hint ? r({}) : null;
  }
}
/** the stinger for a god power the player cast (from GodResult.ok) */
/** whisper / sow_rumour are deliberately silent (subtle powers); a future 'punish_king' power maps to its own stinger */
export function godPowerStinger(p: GodPower): StingerId | null {
  switch (p) {
    case 'smite': case 'wipe_dynasty': case 'earthquake': case 'cave_in': case 'fire': case 'storm': return 'sting_smite';
    case 'bless': case 'harvest': case 'inspire': return 'sting_blessing';
    case 'miracle': return 'sting_miracle';
    case 'curse': case 'famine': case 'drought': case 'predator': return 'sting_curse';
    case 'plague': return 'sting_plague';
    case 'flood': return 'sting_flood';
    case 'raise_dead': return 'sting_resurrection';
    case 'anoint_prophet': case 'dream': case 'foresee': return 'sting_prophet';
    case 'seed_founder': return 'sting_birth';
    default: { const q = String(p); if (q.includes('punish')) return 'sting_god_punishes_king'; if (q === 'judge') return CINEMATIC.dark; return null; }
  }
}
export type Tier = 'minor' | 'notable' | 'major';
export const tierOf = (e: SimEvent2): Tier => e.imp ?? (e.sev >= 3 ? 'major' : e.sev >= 1 ? 'notable' : 'minor');
/** MAJOR tier: one stinger per MAJOR kind (WORLD_BIBLE L14.6 / V2_SCOPE_DELTA §3) */
export function majorStinger(e: SimEvent2): StingerId {
  const k = String(e.kind), h = `${e.sfx ?? ''} ${e.card ?? ''}`;
  if (k === 'crowned' || k.includes('coronat')) return 'sting_crowning';
  if (k === 'king_died' || k === 'assassination' || k.includes('regicide')) return 'sting_assassination';
  if (k === 'plague') return 'sting_plague';
  if (k === 'discovery' || k.includes('era')) return 'sting_era_advance';
  if (k === 'revolution' || k === 'coup' || k === 'riot' || k.includes('revolt')) return 'sting_revolt';
  if (k === 'flood') return 'sting_flood';
  if (k === 'god_act' || /punish_king|defi|god_vs_king|war_on_god/.test(k + h)) return /punish/.test(k + h) ? 'sting_god_punishes_king' : CINEMATIC.dark;
  if (/who_are_you|whoareyou/.test(k + h)) return CINEMATIC.mystery;
  if (k === 'miracle' || k === 'risen') return k === 'miracle' ? 'sting_miracle' : 'sting_resurrection';
  if (k === 'holy_war' || k === 'war') return CINEMATIC.epic;
  if (k === 'festival' || k === 'pairbond' || k === 'wedding') return CINEMATIC.triumph;
  return CINEMATIC.epic;
}
/** soft "notable" stingers that may keep their own sound instead of the generic chime */
const NOTABLE_OWN = new Set<StingerId>(['sting_birth', 'sting_eureka_b', 'sting_forbidden_love', 'sting_blessing', 'sting_curse', 'sting_prophet', 'sting_death', 'sting_smite']);
/** tiering: MAJOR -> its MAJOR stinger at top priority; notable -> a soft stinger or the notable chime; minor -> no stinger at all (SFX only) */
export function tiered(e: SimEvent2, a: EventAudio | null): EventAudio | null {
  const t = tierOf(e);
  if (t === 'major') return { ...(a ?? { priority: 3, positional: e.x !== undefined }), stinger: a?.stinger === 'sting_god_punishes_king' || a?.stinger === 'sting_smite' || a?.stinger === 'sting_miracle' ? a.stinger : majorStinger(e), priority: Math.max(4, a?.priority ?? 0) };
  if (t === 'notable') { if (!a) return { priority: 1, stinger: 'sting_notable_chime' }; return { ...a, stinger: a.stinger && NOTABLE_OWN.has(a.stinger) ? a.stinger : 'sting_notable_chime', priority: Math.min(a.priority, 2.5) }; }
  if (!a) return null; const { stinger: _s, ...rest } = a; void _s; return rest.sfx || rest.hold ? rest : null;
}
/** collapse a snapshot's events into at most one stinger (highest priority) plus the rest */
export function pickEvents(evs: SimEvent2[]): { top: { e: SimEvent2; a: EventAudio } | null; rest: { e: SimEvent2; a: EventAudio }[] } {
  let top: { e: SimEvent2; a: EventAudio } | null = null; const rest: { e: SimEvent2; a: EventAudio }[] = [];
  for (const e of evs) { const a = tiered(e, eventAudio(e)); if (!a) continue; if (a.stinger || a.hold) { if (!top || a.priority > top.a.priority) { if (top) rest.push(top); top = { e, a }; } else rest.push({ e, a }); } else rest.push({ e, a }); }
  return { top, rest };
}
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** v2 powers (V2_SCOPE_DELTA §3) that sound as chip SFX rather than stingers; 'silence' is an audible absence */
export const GOD_POWER_SFX: Record<string, string> = { sign: 'god_sign', voice: 'god_voice', mark: 'god_mark', pardon: 'god_pardon', illuminate: 'god_illuminate', spring: 'god_spring', judge: 'god_judge', reveal_law: 'god_reveal', whisper: 'god_charge', sow_rumour: 'hiss' };
