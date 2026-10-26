/** The autonomous king (never leaves the throne hall), laws with hidden & delayed second-order effects, heralds and posters. */
import { Anim, Carry, RF } from './contract';
import { LAWS as V1LAWS, TIER_POP, MAX_ACTIVE } from '../laws';
import { R, chance, clamp, clamp01, emit, pick, type KingMind, type Rat, type World } from './state';
import { remember, newDynasty } from './rats';
import { anyChamber } from './places';
import { has } from './tech';

export interface LawDef2 { id: string; name: string; prop: string; tier: number; conflicts?: string[]; tags: Partial<Record<Tag, number>>; req?: (w: World) => boolean }
type Tag = 'food' | 'safety' | 'faith' | 'joy' | 'order' | 'breed' | 'blood' | 'kind' | 'progress';
const TAGS: Record<string, Partial<Record<Tag, number>>> = {
  longer_shifts: { food: 0.8, order: 0.3 }, rest_day: { kind: 0.7, joy: 0.2 }, double_tithe: { food: 1.2 }, tithe_holiday: { kind: 1, joy: 0.3 },
  breeding_bounty: { breed: 1, food: 0.3 }, litter_limit: { kind: 0.3, order: 0.4 }, curfew: { safety: 0.8, order: 0.5 }, enforcers: { safety: 1.1, order: 0.8 },
  public_punishment: { order: 0.9, blood: 0.8, food: 0.3 }, open_granary: { kind: 0.9, joy: 0.5 }, ration_cards: { kind: 0.5, order: 0.4 }, merit_rations: { food: 0.5, order: 0.4, blood: 0.2 },
  quarantine_pit: { safety: 0.6, order: 0.3 }, burn_the_dead: { safety: 0.5 }, eat_the_dead: { food: 0.7, blood: 0.6 }, shrine: { faith: 1.2, safety: 0.4 }, ban_shrine: { order: 0.5, food: 0.2 },
  raid_surface: { food: 1, blood: 0.3 }, seal_grates: { safety: 0.9 }, child_labour: { food: 0.6, blood: 0.5 }, elder_exile: { food: 0.5, blood: 0.5 }, wheel_quotas: { food: 0.5, order: 0.5 },
  free_squeak: { kind: 0.8, joy: 0.5 }, silence_law: { safety: 0.8, order: 0.6 }, free_election: { kind: 0.6 }, royal_guard: { safety: 1.2 }, feast_days: { joy: 1.1, faith: 0.4, food: 0.3 },
  outcast_purge: { order: 0.7, blood: 0.9 }, mating_lottery: { breed: 0.6, order: 0.5 }, abolish_laws: {},
};
const EXTRA: LawDef2[] = [
  { id: 'ban_machines', name: 'BAN THE MACHINES', prop: 'PAWS, NOT GEARS.', tier: 2, conflicts: ['machine_tithe'], tags: { kind: 0.6, order: 0.4 }, req: (w) => w.rats.some((r) => r.rodentoid) || has(w, 'automata') },
  { id: 'machine_tithe', name: 'MACHINE TITHE', prop: 'THE GEARS FEED THE CROWN.', tier: 2, conflicts: ['ban_machines'], tags: { food: 1, progress: 0.6 }, req: (w) => w.rats.some((r) => r.rodentoid) },
  { id: 'state_faith', name: 'STATE FAITH', prop: 'ONE CITY, ONE PRAYER.', tier: 2, conflicts: ['ban_faith'], tags: { faith: 1, order: 0.6 }, req: (w) => w.religions.some((x) => x.members > 3) },
  { id: 'ban_faith', name: 'BAN THE FAITHS', prop: 'KNEEL ONLY TO THE CROWN.', tier: 2, conflicts: ['state_faith'], tags: { order: 0.9, safety: 0.3 }, req: (w) => w.religions.some((x) => x.members > 3) },
  { id: 'secret_police', name: 'SECRET WATCHERS', prop: 'THE LOYAL HAVE NOTHING TO HIDE.', tier: 3, tags: { safety: 1.1, order: 1 } },
  { id: 'amnesty', name: 'AMNESTY', prop: 'A CLEAN SLATE FOR ALL.', tier: 1, tags: { kind: 1, joy: 0.4 }, req: (w) => w.justice.inmates.length > 0 },
  { id: 'ban_parties', name: 'BAN THE PARTIES', prop: 'ONE CROWN NEEDS NO FACTIONS.', tier: 3, tags: { order: 1, safety: 0.5 }, req: (w) => w.parties.some((p) => !p.banned) },
  { id: 'schooling', name: 'SLATES FOR PUPS', prop: 'A MARKED MIND IS A STRONG MIND.', tier: 2, tags: { progress: 1, kind: 0.4 }, req: (w) => has(w, 'writing') },
  { id: 'ban_knowledge', name: 'FORBIDDEN LORE', prop: 'SOME DOORS STAY SHUT.', tier: 3, tags: { order: 0.7, safety: 0.6 }, req: (w) => Object.values(w.tech).some((t) => t.era >= 3 && t.knowers > 0) },
  { id: 'prison_labour', name: 'PRISON LABOUR', prop: 'THE GUILTY DIG FOR THE GOOD.', tier: 2, tags: { food: 0.6, blood: 0.3, order: 0.4 }, req: (w) => w.justice.inmates.length > 0 },
];
export const LAWS2: LawDef2[] = [...V1LAWS.map((l) => ({ id: l.id, name: l.name, prop: l.prop, tier: l.tier, conflicts: l.conflicts, tags: TAGS[l.id] ?? {} })), ...EXTRA];
export const LAW2: Record<string, LawDef2> = Object.fromEntries(LAWS2.map((l) => [l.id, l]));
export const lawAdopt = (w: World, id: string) => w.laws.find((l) => l.id === id)?.adopt ?? 0;
export const lawOn = (w: World, id: string) => lawAdopt(w, id) >= 0.5;
const lawAge = (w: World, id: string) => { const l = w.laws.find((x) => x.id === id); return l ? (w.tick - l.since) / 960 : 0; };

/** Hidden, delayed, second-order effects. Every value is scaled by how far heralds have spread the law. */
export function computeLawMods(w: World) {
  const m: Record<string, number> = { tithe: 0.15, forage: 1, fert: 1, predator: 1, disease: 1, joy: 0, fear: 0, anger: 0, loyalty: 0, work: 1, dig: 1, social: 1, granaryOpen: 0.35, merit: 0, ration: 0, crowd: 1, enforcers: 0, guard: 0, gas: 0, elderExile: 0, childLabour: 0, curfew: 0, silence: 0, election: 0, feast: 0, burn: 0, eatDead: 0, quarantine: 0, purge: 0, lottery: 0, banMachines: 0, machineTithe: 0, stateFaith: 0, banFaith: 0, secretPolice: 0, banParties: 0, schooling: 0, banKnowledge: 0, prisonLabour: 0, restDay: 0, shrine: 0, raid: 0, seal: 0 };
  for (const l of w.laws) {
    const a = l.adopt; if (a <= 0.001) continue; const d = lawAge(w, l.id);
    const add = (k: string, v: number) => { m[k] += v * a; };
    switch (l.id) {
      case 'longer_shifts': add('work', d < 3 ? 0.15 : -0.25); add('joy', -0.06); if (d >= 3) add('anger', 0.05); break;
      case 'rest_day': add('joy', 0.06); add('disease', -0.35); if (d >= 5) add('work', 0.1); add('restDay', 1); break;
      case 'double_tithe': add('tithe', 0.17); add('loyalty', -0.2); add('anger', 0.1); break;
      case 'tithe_holiday': add('tithe', -0.13); add('loyalty', 0.25); add('joy', 0.06); break;
      case 'breeding_bounty': add('fert', 1.2); if (d >= 8) { add('disease', 0.6); add('crowd', -0.3); add('joy', -0.06); } break;
      case 'litter_limit': add('fert', -0.85); add('joy', -0.05); break;
      case 'curfew': add('predator', -0.7); add('social', -0.35); add('fert', -0.25); add('joy', -Math.min(0.15, 0.03 * d)); add('curfew', 1); break;
      case 'enforcers': add('enforcers', 1); add('fear', 0.2); add('anger', Math.min(0.15, 0.03 * d)); break;
      case 'public_punishment': add('fear', 0.3); add('anger', 0.06); add('joy', -0.1); break;
      case 'open_granary': add('granaryOpen', 0.65); add('joy', 0.08); break;
      case 'ration_cards': add('ration', 1); add('work', -0.1); add('granaryOpen', 0.2); break;
      case 'merit_rations': add('merit', 1); add('granaryOpen', -0.2); add('work', 0.1); break;
      case 'quarantine_pit': add('quarantine', 1); add('disease', -0.4); add('loyalty', -0.05); break;
      case 'burn_the_dead': add('burn', 1); add('disease', -0.25); add('fert', -0.15); break;
      case 'eat_the_dead': add('eatDead', 1); if (d >= 6) add('disease', 0.6); break;
      case 'shrine': add('shrine', 1); add('loyalty', 0.15); break;
      case 'ban_shrine': add('work', 0.05); add('joy', -0.06); break;
      case 'raid_surface': add('forage', 0.6); add('gas', 1); add('raid', 1); break;
      case 'seal_grates': add('forage', -0.45); add('predator', -0.5); add('seal', 1); if (d > 3) add('disease', 0.2); break;
      case 'child_labour': add('childLabour', 1); if (d >= 4) add('anger', 0.08); break;
      case 'elder_exile': add('elderExile', 1); add('joy', -0.05); break;
      case 'wheel_quotas': add('work', 0.2); add('joy', -0.05); break;
      case 'free_squeak': add('joy', 0.08); add('social', 0.2); add('silence', -1); break;
      case 'silence_law': add('silence', 1); add('anger', 0.05); break;
      case 'free_election': add('election', 1); break;
      case 'royal_guard': add('guard', 1); add('tithe', 0.03); break;
      case 'feast_days': add('feast', 1); break;
      case 'outcast_purge': add('purge', 1); add('anger', 0.06); break;
      case 'mating_lottery': add('lottery', 1); add('joy', -0.06); add('anger', 0.04); break;
      case 'ban_machines': add('banMachines', 1); break;
      case 'machine_tithe': add('machineTithe', 1); break;
      case 'state_faith': add('stateFaith', 1); break;
      case 'ban_faith': add('banFaith', 1); add('anger', 0.05); break;
      case 'secret_police': add('secretPolice', 1); add('fear', 0.25); add('joy', -0.05); break;
      case 'ban_parties': add('banParties', 1); add('anger', 0.06); break;
      case 'schooling': add('schooling', 1); add('work', -0.03); break;
      case 'ban_knowledge': add('banKnowledge', 1); break;
      case 'prison_labour': add('prisonLabour', 1); break;
      case 'amnesty': break;
    }
  }
  w.lawMods = m;
}

// ── crowning & succession ──
export function crown(w: World, r: Rat, how: string) {
  const old = w.byId.get(w.kingId); if (old && old.alive) old.flags &= ~RF.king;
  w.kingId = r.id; w.reignNo++; w.reignStart = w.tick; r.flags |= RF.king; r.role = 'king'; if (r.firm) { /* keeps no firm */ r.firm = 0; }
  if (!r.dynasty) newDynasty(w, r); const dyn = w.dyns.find((d) => d.id === r.dynasty); dyn?.kings.push(r.id);
  w.king = newMind(w, r); w.interregnum = 0;
  r.titles.push(`KING (${how})`); remember(w, r, 'crowned', `I was crowned king (${how}).`, 1, 0, true);
  w.chron.reigns.push({ king: r.id, name: r.name, dynasty: dyn?.name ?? '', start: w.tick, end: null, cause: null, laws: [] });
  emit(w, 'crowned', `${r.name} of ${dyn?.name ?? 'no house'} is crowned (${how}).`, 3, { rats: [r.id], x: r.x, y: r.y, fx: 'crown', sfx: 'fanfare', card: `Long live ${r.name}.` });
  for (const o of w.rats) { const rl = o.rel.get(r.id); o.beliefs.crown = clamp(o.beliefs.crown + (rl ? rl.aff * 0.2 : 0) + 0.05, -1, 1); }
}
function newMind(w: World, r: Rat): KingMind {
  const p = r.P; const g = () => R(w);
  const persona: Record<string, number> = {
    greed: clamp01(0.3 + (1 - p.A) * 0.5 * g() + 0.3 * g()), fear: clamp01(p.N * 0.6 * g() + 0.3 * g() * g()), piety: clamp01((r.beliefs.god + 1) / 2 * 0.7 * g() + 0.2 * g()),
    cruelty: clamp01((1 - p.A) * 0.6 * g() + 0.3 * g() * g()), reckless: clamp01((1 - p.C) * 0.5 * g() + 0.3 * g() * g()), sloth: clamp01((1 - p.C) * 0.6 * g() * g()),
    mercy: clamp01(p.A * 0.6 * g() + 0.2 * g() * g()), curiosity: clamp01(p.O * 0.6 * g() + 0.2 * g()),
  };
  const L: Record<string, string> = { greed: 'GREEDY', fear: 'PARANOID', piety: 'PIOUS', cruelty: 'CRUEL', reckless: 'RECKLESS', sloth: 'SLOTHFUL', mercy: 'SOFT-HEARTED', curiosity: 'CURIOUS' };
  const traits = Object.keys(persona).sort((a, b) => persona[b] - persona[a]).slice(0, 2).filter((t) => persona[t] > 0.35).map((t) => L[t]);
  return { persona, traits: traits.length ? traits : ['MEEK'], values: {}, tries: {}, nextThink: w.tick + 300, thought: 'THE THRONE IS MINE.', reaching: null, reachingKind: null, plateHist: [], lastPress: w.tick, advisorRI: false };
}
/** who takes the throne? depends on laws, council, factions and luck */
export function succession(w: World, why: string) {
  const adults = w.rats.filter((r) => r.alive && !r.rodentoid && r.stageN >= 2 && !(r.flags & (RF.jailed | RF.outcast)));
  if (adults.length < 2) return;
  const old = w.byId.get(w.kingId) ?? w.ghosts.get(w.kingId);
  let cand: Rat | undefined; let how = 'seized the throne';
  if (lawOn(w, 'free_election') || w.council) {
    // the most liked rat wins (popularity, not ability)
    const score = (r: Rat) => { let s = 0; for (const o of adults) { const rl = o.rel.get(r.id); if (rl) s += rl.aff; } return s + r.genes.charisma * 2 + R(w); };
    cand = adults.reduce((a, b) => (score(b) > score(a) ? b : a)); how = 'elected';
  } else if (old && old.children.length && chance(w, 0.6 + w.stats.legitimacy * 0.3)) {
    const heirs = old.children.map((id) => w.byId.get(id)).filter((x): x is Rat => !!x && x.alive && x.stageN >= 2);
    if (heirs.length) { cand = heirs.reduce((a, b) => (b.genes.charisma + b.P.E > a.genes.charisma + a.P.E ? b : a)); how = 'by birth'; }
  }
  if (!cand) { const score = (r: Rat) => r.genes.strength + r.genes.charisma + r.P.E * 0.5 + (1 - r.P.A) * 0.3 + r.needs.status * 0.5 + R(w) * 0.8; cand = adults.reduce((a, b) => (score(b) > score(a) ? b : a)); }
  void why; crown(w, cand, how);
}

// ── the king's mind: intuition (temperament × propaganda) + facts (what his plate & city did after each press) ──
const plateScore = (w: World) => { const k = w.byId.get(w.kingId); return k ? Math.min(2, (k as any).plate ?? 1) : 0; };
export function available(w: World): string[] {
  const peak = w.chron.peakPop; const tier = TIER_POP.filter((t) => peak >= t).length - 1;
  return LAWS2.filter((l) => l.tier <= tier && (!l.req || l.req(w))).map((l) => l.id);
}
export function kingThink(w: World) {
  const k = w.byId.get(w.kingId); const m = w.king; if (!k || !k.alive || !m || w.tick < m.nextThink) return;
  m.nextThink = w.tick + 960 * (0.5 + m.persona.sloth * 0.8 + R(w) * 0.5);
  // learn: credit the last press with the change in plate & city mood
  const ps = plateScore(w) + (w.stats.legitimacy - 0.5) * 0.6 - w.stats.unrest * 0.5; m.plateHist.push(ps); if (m.plateHist.length > 8) m.plateHist.shift();
  const last = w.laws.length ? w.laws[w.laws.length - 1].id : null;
  if (last && m.plateHist.length >= 2) { const d = m.plateHist[m.plateHist.length - 1] - m.plateHist[m.plateHist.length - 2]; m.values[last] = (m.values[last] ?? 0) * 0.7 + d * 0.3; }
  if (k.knows.includes('ri') || w.firms.some((f) => f.kind === 'rodentoid_works' && f.status === 'open')) m.advisorRI = true;
  const factsW = clamp01(0.25 + k.P.C * 0.3 + k.genes.intellect * 0.2 + (m.advisorRI ? 0.3 : 0));
  const avail = available(w).filter((id) => !w.laws.some((l) => l.id === id));
  const P = m.persona;
  const taste: Record<Tag, number> = { food: 0.6 + P.greed, safety: 0.3 + P.fear, faith: P.piety * 1.2, joy: 0.3 + P.sloth * 0.5 + P.reckless * 0.3, order: 0.2 + P.fear * 0.5 + P.cruelty * 0.4, breed: P.reckless * 0.4 + 0.1, blood: P.cruelty * 1.1 - P.mercy, kind: P.mercy * 1.1 - P.cruelty * 0.6, progress: P.curiosity * 0.9 };
  // facts: the city's pressures
  const s = w.stats; const press: Record<Tag, number> = { food: (k as any).plate < 0.8 ? 0.6 : 0, safety: w.hazards.length * 0.2 + s.crime * 0.1, faith: w.religions.length ? 0.1 : 0, joy: (0.5 - s.joy) * 0.5, order: s.unrest * 0.8, breed: w.rats.length < 20 ? 0.5 : -0.2, blood: 0, kind: s.unrest * 0.4 + (s.legitimacy < 0.4 ? 0.3 : 0), progress: 0.1 };
  const util = (id: string) => {
    const tags = LAW2[id].tags; let i = 0, f = 0;
    for (const t in tags) { const v = tags[t as Tag]!; i += v * taste[t as Tag]; f += v * press[t as Tag]; }
    f += (m.values[id] ?? 0) * 2; if (m.advisorRI) f += riTruth(w, id);
    // council pressure
    if (w.council && (w as any).councilAsk === id) f += 0.8;
    return { i, f, u: (1 - factsW) * i + factsW * f + (R(w) - 0.5) * (0.6 + P.reckless) };
  };
  let best: string | null = null, bu = 0.35 + P.sloth * 0.5, bi = 0, bf = 0;
  for (const id of avail) { if (w.laws.some((l) => LAW2[id].conflicts?.includes(l.id))) continue; const x = util(id); if (x.u > bu) { bu = x.u; best = id; bi = x.i; bf = x.f; } }
  // repeal: a law that keeps hurting him or that the city hates
  const worst = w.laws.filter((l) => !l.repealing && l.adopt > 0.9).map((l) => ({ l, v: (m.values[l.id] ?? 0) + (LAW2[l.id].tags.blood ?? 0) * (P.mercy - 0.5) - s.unrest * ((LAW2[l.id].tags.order ?? 0) > 0.5 ? 0.3 : 0) + (R(w) - 0.5) * 0.3 })).sort((a, b) => a.v - b.v)[0];
  if (worst && worst.v < -0.25 && chance(w, 0.5)) { repeal(w, worst.l.id); m.thought = `${LAW2[worst.l.id].name} HAS DONE ME NO GOOD.`; return; }
  if (best && w.laws.length < MAX_ACTIVE) {
    m.reaching = best; m.reachingKind = 'pass'; m.thought = `${LAW2[best].prop}`;
    proclaim(w, best, bi, bf, factsW);
  } else m.thought = pick(w, ['MY PLATE IS ' + ((k as any).plate > 1 ? 'FULL.' : 'LIGHT.'), 'WHO WHISPERS IN MY TUNNELS?', 'THE CITY HUMS.', 'I AM THE CROWN.']);
}
/** the RI advisor's whisper: the true sign of a law's effect on the city right now (it is rarely wrong) */
function riTruth(w: World, id: string): number {
  const t: Record<string, number> = { open_granary: w.granary > 40 ? 0.3 : -0.4, double_tithe: -0.3, tithe_holiday: 0.2, rest_day: 0.3, longer_shifts: -0.3, breeding_bounty: w.rats.length < 40 ? 0.2 : -0.4, enforcers: w.stats.crime > 1 ? 0.2 : -0.2, amnesty: 0.1, ban_machines: w.stats.unemployment > 0.3 ? 0.3 : -0.3, machine_tithe: 0.3, schooling: 0.3, secret_police: -0.4, outcast_purge: -0.6, child_labour: -0.4 };
  return t[id] ?? 0;
}
export function proclaim(w: World, id: string, i = 0, f = 0, fw = 0.5) {
  if (id === 'abolish_laws') { for (const l of [...w.laws]) repeal(w, l.id); emit(w, 'law_proclaimed', 'The king tears down every law. BEGIN AGAIN.', 2, { fx: 'poster' }); return; }
  if (id === 'amnesty') { for (const x of [...w.justice.inmates]) { const r = w.byId.get(x.ratId); if (r) { r.flags &= ~RF.jailed; r.role = 'idle'; remember(w, r, 'freed', 'I was freed by the king\'s amnesty.', 0.7, w.kingId, true); } } w.justice.inmates = []; emit(w, 'pardon', 'AMNESTY: the jail is opened. Every prisoner walks free.', 2, { fx: 'poster' }); return; }
  w.laws.push({ id, adopt: 0, since: w.tick, repealing: false }); w.lawHist[id] = (w.lawHist[id] ?? 0) + 1;
  const reign = w.chron.reigns[w.chron.reigns.length - 1]; reign?.laws.push(LAW2[id].name);
  const k = w.byId.get(w.kingId);
  if (k) k.lastDecision = { choice: `proclaim ${LAW2[id].name}`, intuition: +(i * (1 - fw)).toFixed(2), facts: +(f * fw).toFixed(2), why: fw > 0.5 ? 'what he has seen of the city' : 'his temper and the promise on the poster' };
  emit(w, 'law_pressed', `King ${k?.name ?? ''} proclaims ${LAW2[id].name}: "${LAW2[id].prop}"`, 2, { rats: k ? [k.id] : [], fx: 'poster', sfx: 'press', card: LAW2[id].prop });
}
export function repeal(w: World, id: string) {
  const l = w.laws.find((x) => x.id === id); if (!l) return; l.repealing = true;
  emit(w, 'law_repealed', `${LAW2[id].name} is repealed.`, 1, { fx: 'poster' });
}
/** adoption spread: heralds carry posters chamber to chamber; literacy, stamping and wires speed it */
export function lawsHourly(w: World) {
  const chambers = w.chambers.filter((c) => c.progress >= 0.999 && c.kind !== 'bolthole' && c.kind !== 'deadend'); const n = Math.max(1, chambers.length);
  for (const l of w.laws) {
    const posted = w.posters.filter((p) => p.law === l.id && !p.torn).length;
    const speed = (has(w, 'wires') ? 3 : 1) * (has(w, 'stamping') ? 1.6 : 1) * (lawOn(w, 'free_squeak') ? 1.2 : 1);
    const target = l.repealing ? 0 : clamp01(posted / n + 0.15 * speed);
    l.adopt = clamp01(l.adopt + clamp(target - l.adopt, -0.08 * speed, 0.05 * speed));
  }
  for (const l of w.laws.filter((x) => x.repealing && x.adopt <= 0.01)) { w.posters = w.posters.filter((p) => p.law !== l.id); }
  w.laws = w.laws.filter((x) => !(x.repealing && x.adopt <= 0.01));
  // heralds: ensure 1–3 heralds exist when a law needs carrying
  const need = w.laws.some((l) => !l.repealing && w.posters.filter((p) => p.law === l.id).length < n);
  const heralds = w.rats.filter((r) => r.role === 'herald');
  if (need && heralds.length < Math.min(3, 1 + Math.floor(w.rats.length / 40))) {
    const c = w.rats.filter((r) => r.alive && !r.rodentoid && r.stageN >= 2 && (r.role === 'idle' || r.role === 'none') && !(r.flags & (RF.king | RF.jailed)));
    if (c.length) { const h = c.reduce((a, b) => (b.beliefs.crown + b.P.E > a.beliefs.crown + a.P.E ? b : a)); h.role = 'herald'; h.flags |= RF.herald; h.nextThink = w.tick; }
  }
}
/** a herald at a chamber puts up a poster for the first law that chamber lacks */
export function heraldPost(w: World, r: Rat, chamberId: number) {
  const ch = w.chambers[chamberId]; if (!ch) return false;
  for (const l of w.laws) { if (l.repealing) continue; if (w.posters.some((p) => p.law === l.id && p.chamber === chamberId)) continue;
    w.posters.push({ id: ++w.nextObj, law: l.id, chamber: chamberId, x: ch.cx + (R(w) - 0.5) * ch.rx, y: ch.cy - ch.ry * 0.3, torn: false, since: w.tick });
    r.carry = Carry.None; r.anim = Anim.Paste; emit(w, 'herald', `${r.name} pastes ${LAW2[l.id].name} in ${ch.name}.`, 0, { rats: [r.id], chamber: chamberId, x: ch.cx, y: ch.cy });
    return true; }
  return false;
}
export const throneHall = (w: World) => anyChamber(w, 'throne');
