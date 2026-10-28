// Small shared helpers for the v2 HUD.
import type { SimEvent2, RatsBlock } from '../../sim/v2/contract';
import { RF, Stage } from '../../sim/v2/contract';
export const A = (p: string) => `assets/final/${p}`;
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const h = (html: string) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild as HTMLElement; };
/** never show words for the makers that would break the world's rule (defence in depth against sim text) */
const MAKER_WORDS: [RegExp, string][] = [[new RegExp('\\bh' + 'umans?\\b', 'gi'), 'Giants'], [new RegExp('\\bpeo' + 'ple\\b', 'gi'), 'Giants'], [new RegExp('\\bman' + 'kind\\b', 'gi'), 'the Giants']];
export const clean = (s: string) => MAKER_WORDS.reduce((t, [re, w]) => t.replace(re, w), String(s ?? ''));
export type Tier = 'minor' | 'notable' | 'major';
export function tierOf(e: SimEvent2): Tier { if (e.imp) return e.imp; return e.sev >= 2 ? 'major' : e.sev === 1 ? 'notable' : 'minor'; }
const CARD: Record<string, string> = {
  famine: 'famine', plague: 'plague', riot: 'riot', protest: 'riot', strike: 'riot', crackdown: 'riot', vote: 'vote', election: 'vote', council: 'vote',
  execution: 'execution', verdict: 'execution', king_died: 'king_dies_alone', regicide: 'king_dies_alone', crowned: 'succession', coup: 'succession', assassination: 'king_dies_alone',
  predator: 'extermination', predator_kill: 'extermination', gas: 'extermination', poison: 'extermination', flood: 'flood', drain: 'flood', golden_age: 'golden_age', festival: 'golden_age',
  harvest: 'golden_age', miracle: 'golden_age', collapse: 'collapse', quake: 'collapse', exodus: 'exodus', city_dead: 'exodus', law_proclaimed: 'first_law', founding: 'founding',
  god_punish: 'god_punish', defiance: 'defiance', war_on_god: 'defiance', apostasy: 'defiance', prove_reality: 'defiance', holy_war: 'war', battle: 'war', caste_conflict: 'war',
  marriage: 'wedding', courtship: 'wedding', discovery: 'discovery', rodentoid_built: 'discovery', labrats_arrive: 'labrats', religion_founded: 'religion', schism: 'religion', temple: 'religion',
  caste_formed: 'caste', smite: 'god_punish', risen: 'religion', omen: 'religion', prophecy: 'religion',
};
let haveCards: Set<string> | null = null;
export async function loadCardList() { try { const idx = await (await fetch(A('index.json'))).json(); haveCards = new Set(idx.assets.filter((a: any) => a.type === 'event_card').map((a: any) => a.id)); } catch { haveCards = new Set(); } }
export function cardFor(e: SimEvent2): string | null {
  const ids = [e.card, CARD[e.kind] && `event_${CARD[e.kind]}`, 'event_golden_age'].filter(Boolean) as string[];
  for (const id of ids) { const k = id.startsWith('event_') ? id : `event_${id}`; if (!haveCards || haveCards.has(k)) return A(`backgrounds/${k}.png`); }
  return null;
}
const PORTRAIT_OF = (fl: number, stage: number, female: boolean) => fl & RF.king ? 'king' : fl & RF.founder ? 'founder' : fl & RF.prophet || fl & RF.priest ? 'prophet' : fl & RF.enforcer ? 'enforcer' : fl & RF.outcast ? 'outcast' : stage === Stage.Elder ? 'elder' : female ? 'worker_f' : 'worker_m';
export function portraitUrl(rats: RatsBlock | null | undefined, id: number | undefined): string {
  if (!rats || id == null) return '';
  for (let i = 0; i < rats.n; i++) if (rats.id[i] === id) { const fl = rats.flags[i]; return A(`portraits/portrait_${PORTRAIT_OF(fl, rats.stage[i], !!(fl & RF.female))}_talk.png`); }
  return '';
}
export const day = (tick: number) => Math.floor(tick / 960) + 1;
export const pct = (v: number) => `${Math.round(v * 100)}%`;
