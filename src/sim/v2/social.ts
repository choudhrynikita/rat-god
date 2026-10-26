/** Social graph: talk, gossip & rumours, friendship, rivalry, courtship, pair bonds, affairs, mentorship, debts, grudges. */
import { RF, type RumourClaim } from './contract';
import { R, RK, chance, clamp, clamp01, emit, type Beliefs, type Rat, type World } from './state';
import { addRel, remember } from './rats';
import { teach } from './tech';
import { taboo, forbiddenUnion, jealousy } from './family';

export interface Rumour { about: number; claim: RumourClaim; truth: boolean; strength: number; origin: number; tick: number }
export const rumours = (r: Rat): Rumour[] => ((r as any).rumours ??= []);
const AX: (keyof Beliefs)[] = ['crown', 'god', 'equality', 'order', 'kin'];
export function beliefSim(a: Rat, b: Rat) { let d = 0; for (const k of AX) d += Math.abs(a.beliefs[k] - b.beliefs[k]); return 1 - d / (AX.length * 2); }
export function persSim(a: Rat, b: Rat) { return 1 - (Math.abs(a.P.O - b.P.O) + Math.abs(a.P.E - b.P.E) + Math.abs(a.P.A - b.P.A) + Math.abs(a.P.C - b.P.C)) / 4; }
export const bonded = (r: Rat) => { for (const [id, x] of r.rel) if (x.k & RK.bond) return id; return 0; };

/** One conversation between two nearby rats. Affinity, trust, beliefs, rumours and knowledge flow. */
export function interact(w: World, a: Rat, b: Rat, mode: 'talk' | 'gossip' | 'court' | 'teach' | 'play' = 'talk') {
  if (a.rodentoid || b.rodentoid) return;
  const ab = addRel(w, a, b, 0, 0), ba = addRel(w, b, a, 0, 0);
  const sim = 0.6 * beliefSim(a, b) + 0.4 * persSim(a, b);
  const warm = (a.P.A + b.P.A) / 2; const mood = (a.emo.joy + b.emo.joy) / 2 - (a.emo.anger + b.emo.anger) / 2;
  const d = (sim - 0.55) * 0.12 + (warm - 0.5) * 0.06 + mood * 0.04 + (R(w) - 0.5) * 0.08;
  ab.aff = clamp(ab.aff + d, -1, 1); ba.aff = clamp(ba.aff + d * (0.8 + R(w) * 0.4), -1, 1);
  ab.fam = clamp01(ab.fam + 0.05); ba.fam = clamp01(ba.fam + 0.05); ab.trust = clamp01(ab.trust + d * 0.5); ba.trust = clamp01(ba.trust + d * 0.5);
  a.needs.social = Math.max(0, a.needs.social - 0.25); b.needs.social = Math.max(0, b.needs.social - 0.25);
  a.skills.talk = Math.min(1, a.skills.talk + 0.002); b.skills.talk = Math.min(1, b.skills.talk + 0.002);
  // label changes
  for (const [x, y, rl] of [[a, b, ab], [b, a, ba]] as const) {
    if (!(rl.k & RK.friend) && rl.aff > 0.45 && rl.fam > 0.35) { rl.k |= RK.friend; rl.k &= ~RK.rival; if (chance(w, 0.25)) emit(w, 'friend', `${x.name} and ${y.name} become friends.`, 0, { rats: [x.id, y.id] }); }
    if (!(rl.k & RK.rival) && rl.aff < -0.4 && rl.fam > 0.2) { rl.k |= RK.rival; rl.k &= ~RK.friend; remember(w, x, 'rival', `${y.name} is my rival.`, -0.4, y.id); if (chance(w, 0.4)) emit(w, 'rival', `${x.name} and ${y.name} can't stand each other.`, 0, { rats: [x.id, y.id] }); }
  }
  // beliefs drift toward the more charismatic / trusted speaker
  const infl = (from: Rat, to: Rat, trust: number) => { const k = 0.03 * from.genes.charisma * trust * (1 - to.P.C * 0.4) * (to.P.O * 0.5 + 0.5); for (const ax of AX) to.beliefs[ax] = clamp(to.beliefs[ax] + (from.beliefs[ax] - to.beliefs[ax]) * k, -1, 1); };
  infl(a, b, ba.trust); infl(b, a, ab.trust);
  // gossip spreads rumours (true and false); trust decides whether they are believed
  if (mode === 'gossip' || chance(w, 0.35)) spread(w, a, b, ba.trust);
  if (mode === 'gossip' || chance(w, 0.2)) spread(w, b, a, ab.trust);
  // mentorship: an older, skilled rat takes a younger one under its wing
  const older = (w.tick - a.born) > (w.tick - b.born) ? a : b, younger = older === a ? b : a;
  const rlO = older === a ? ab : ba;
  if (rlO.aff > 0.3 && (w.tick - younger.born) < 30 * 960 && older.stageN >= 2 && !(rlO.k & RK.mentor) && chance(w, 0.06 + older.P.A * 0.06)) {
    rlO.k |= RK.mentee; (younger === a ? ab : ba).k |= RK.mentor;
    remember(w, younger, 'mentor', `${older.name} took me as an apprentice.`, 0.6, older.id, true); emit(w, 'mentor', `${older.name} takes ${younger.name} as an apprentice.`, 0, { rats: [older.id, younger.id] });
  }
  if ((mode === 'teach' || (rlO.k & RK.mentee)) && older.knows.length) {
    const learnt = teach(w, older, younger);
    if (learnt) { emit(w, 'lesson', `${older.name} teaches ${younger.name} ${learnt.toUpperCase().replace(/_/g, ' ')}.`, 0, { rats: [older.id, younger.id] }); }
    for (const k of Object.keys(older.skills)) if (older.skills[k] > younger.skills[k]) younger.skills[k] = Math.min(1, younger.skills[k] + (older.skills[k] - younger.skills[k]) * 0.02);
  }
  // debts: a fed friend lends to a hungry one
  for (const [x, y, rl] of [[a, b, ab], [b, a, ba]] as const) {
    if (y.needs.hunger > 0.6 && y.food < 0.5 && x.food > 2.5 && rl.aff > 0.2 && chance(w, 0.3 + x.P.A * 0.4)) {
      const amt = Math.min(1.5, x.food - 2); x.food -= amt; y.food += amt; const yb = y.rel.get(x.id)!; yb.debt += amt; yb.aff = clamp(yb.aff + 0.15, -1, 1); remember(w, y, 'debt', `${x.name} fed me when I was starving.`, 0.6, x.id);
      if (chance(w, 0.3)) emit(w, 'debt', `${x.name} lends food to ${y.name}.`, 0, { rats: [x.id, y.id] });
    }
    const xb = x.rel.get(y.id)!; if (xb.debt > 0 && x.food > 3 && chance(w, 0.3 + x.P.C * 0.5)) { const p = Math.min(xb.debt, x.food - 2); x.food -= p; y.food += p; xb.debt -= p; }
  }
}

/** pass one rumour from teller to hearer */
function spread(w: World, teller: Rat, hearer: Rat, trust: number) {
  const rs = rumours(teller); if (!rs.length) return;
  const rm = rs[Math.floor(R(w) * rs.length)]; if (rm.about === hearer.id) return;
  const believe = trust * 0.6 + (1 - hearer.P.C) * 0.2 + (rm.truth ? 0.15 : 0) + (hearer.rel.get(rm.about)?.aff ?? 0) * -0.3;
  const hr = rumours(hearer); const have = hr.find((x) => x.about === rm.about && x.claim === rm.claim);
  if (have) { have.strength = Math.min(1, have.strength + 0.1); return; }
  if (!chance(w, clamp01(believe))) return;
  hr.push({ ...rm, strength: rm.strength * 0.85, tick: w.tick }); if (hr.length > 8) hr.shift();
  applyClaim(w, hearer, rm);
}
export function applyClaim(w: World, r: Rat, rm: Rumour) {
  const about = w.byId.get(rm.about); const isKing = rm.about === w.kingId;
  if (rm.about === -1) { // about the god
    r.beliefs.god = clamp(r.beliefs.god + (rm.claim === 'blessed' || rm.claim === 'kind' ? 0.1 : -0.1), -1, 1); return;
  }
  if (!about) return;
  const rl = addRel(w, r, about, 0, 0); const bad = !['blessed', 'kind'].includes(rm.claim);
  rl.aff = clamp(rl.aff + (bad ? -0.2 : 0.2) * rm.strength, -1, 1); rl.trust = clamp01(rl.trust + (bad ? -0.2 : 0.15) * rm.strength);
  if (bad) about.suspicion = clamp01(about.suspicion + 0.04 * rm.strength * (['thief', 'murderer', 'poisoner', 'traitor'].includes(rm.claim) ? 1.5 : 1));
  if (isKing) r.beliefs.crown = clamp(r.beliefs.crown + (bad ? -0.12 : 0.1) * rm.strength, -1, 1);
}
export function startRumour(w: World, teller: Rat, about: number, claim: RumourClaim, truth: boolean, strength = 0.8) {
  rumours(teller).push({ about, claim, truth, strength, origin: teller.id, tick: w.tick });
}

/** courtship: attraction, consent, pair bonds and affairs */
export function court(w: World, a: Rat, b: Rat): 'bond' | 'mate' | 'reject' | 'affair' {
  const ab = addRel(w, a, b, 0, 0), ba = addRel(w, b, a, 0, 0);
  const attr = (x: Rat, y: Rat) => 0.3 * y.genes.charisma + 0.2 * y.genes.size + 0.2 * persSim(x, y) + 0.3 * (x.rel.get(y.id)?.aff ?? 0) + (R(w) - 0.5) * 0.4 + (y.flags & RF.king ? 0.2 : 0);
  const bBond = bonded(b), aBond = bonded(a);
  // the incest taboo and caste purity weigh on the one being courted (and the courter already chose to try)
  const tb = taboo(w, b, a); const casteBar = w.casteEra && a.caste !== b.caste && w.castes.some((c) => c.id === b.caste && c.norms.includes('MARRY WITHIN')) ? 0.25 * (0.5 + b.beliefs.order * 0.5) : 0;
  const shun = a.shunned && w.tick < a.shunned ? 0.35 : 0;
  const yes = attr(b, a) - tb.t * 0.9 - casteBar - shun > 0.35 - (b.emo.love * 0.2) && (!bBond || bBond === a.id || (b.P.C < 0.4 && b.P.A < 0.6 && chance(w, 0.4)));
  if (!yes) { ab.aff = clamp(ab.aff - 0.05, -1, 1); a.emo.shame = clamp01(a.emo.shame + 0.1); if (chance(w, 0.1)) emit(w, 'courtship', `${b.name} spurns ${a.name}.`, 0, { rats: [a.id, b.id] }); return 'reject'; }
  ab.aff = clamp(ab.aff + 0.2, -1, 1); ba.aff = clamp(ba.aff + 0.2, -1, 1); a.emo.love = clamp01(a.emo.love + 0.3); b.emo.love = clamp01(b.emo.love + 0.3);
  if (tb.k >= 0.06) { ab.k |= RK.lover; ba.k |= RK.lover; forbiddenUnion(w, a, b, tb.k); return 'mate'; }
  const cheating = (aBond && aBond !== b.id) || (bBond && bBond !== a.id);
  if (cheating) {
    ab.k |= RK.lover; ba.k |= RK.lover;
    emit(w, 'affair', `${a.name} and ${b.name} meet in secret and mate.`, 1, { rats: [a.id, b.id], mature: ['sex'], safe: `${a.name} and ${b.name} meet in secret.` });
    remember(w, a, 'affair', `I am in love with ${b.name}, though I should not be.`, 0.5, b.id, true); remember(w, b, 'affair', `${a.name} and I have a secret.`, 0.4, a.id, true);
    // witnesses may talk
    for (const o of w.rats) if (o !== a && o !== b && o.edge === a.edge && Math.abs(o.s - a.s) < 12 && chance(w, 0.5)) { startRumour(w, o, a.id, 'cheat', true, 0.7); }
    return 'affair';
  }
  if (!(ab.k & RK.bond) && ab.aff > 0.5 && ba.aff > 0.45 && chance(w, 0.35 + (a.P.C + b.P.C) * 0.15)) {
    ab.k |= RK.bond | RK.mate; ba.k |= RK.bond | RK.mate;
    remember(w, a, 'bond', `${b.name} and I are bonded.`, 0.8, b.id, true); remember(w, b, 'bond', `${a.name} and I are bonded.`, 0.8, a.id, true);
    emit(w, 'pairbond', `${a.name} and ${b.name} pair for life.`, (a.flags | b.flags) & (RF.king | RF.leader) ? 2 : 1, { rats: [a.id, b.id], sfx: 'love' });
    return 'bond';
  }
  ab.k |= RK.mate; ba.k |= RK.mate; return 'mate';
}
/** a betrayed partner learns of an affair (via rumour) */
export function discoverAffair(w: World, victim: Rat, cheat: Rat, lover: Rat | undefined) {
  const rl = victim.rel.get(cheat.id); if (!rl || !(rl.k & RK.bond)) return;
  const forgive = victim.P.A * 0.6 + rl.aff * 0.3 - victim.P.N * 0.3 + R(w) * 0.3 > 0.55;
  if (forgive) { rl.trust *= 0.5; remember(w, victim, 'betrayal', `${cheat.name} betrayed me. I forgave.`, -0.6, cheat.id, true); return; }
  rl.k &= ~(RK.bond | RK.mate); rl.k |= RK.ex | RK.grudge; rl.aff = -0.5; const cr = cheat.rel.get(victim.id); if (cr) { cr.k &= ~(RK.bond | RK.mate); cr.k |= RK.ex; }
  victim.emo.anger = clamp01(victim.emo.anger + 0.5); victim.emo.grief = clamp01(victim.emo.grief + 0.3);
  remember(w, victim, 'betrayal', `${cheat.name} betrayed me${lover ? ' with ' + lover.name : ''}.`, -0.9, cheat.id, true);
  if (lover) { const g = addRel(w, victim, lover, -0.7, -0.6, RK.grudge); g.aff = Math.min(g.aff, -0.6); jealousy(w, victim, cheat, lover); }
  emit(w, 'breakup', `${victim.name} learns of ${cheat.name}'s affair${lover ? ' with ' + lover.name : ''}, and leaves.`, 1, { rats: [victim.id, cheat.id, ...(lover ? [lover.id] : [])] });
  // dynastic feud if houses differ and pride is high
  if (lover && victim.dynasty && lover.dynasty && victim.dynasty !== lover.dynasty && victim.beliefs.kin > 0.3 && chance(w, 0.3)) {
    (w as any).feuds = (w as any).feuds ?? []; (w as any).feuds.push({ a: victim.dynasty, b: lover.dynasty, since: w.tick, heat: 0.6 });
    emit(w, 'grudge', `A feud begins between ${w.dyns.find((d) => d.id === victim.dynasty)?.name} and ${w.dyns.find((d) => d.id === lover.dynasty)?.name}.`, 2, { rats: [victim.id, lover.id] });
  }
}
/** hourly: rumour checks (affairs exposed), emotion decay, grudge→revenge desire */
export function socialHourly(w: World) {
  for (const r of w.rats) {
    if (r.rodentoid) continue;
    const e = r.emo; e.joy *= 0.985; e.fear *= 0.95; e.anger *= 0.975; e.grief *= 0.993; e.love *= 0.99; e.shame *= 0.97;
    const rs = rumours(r); for (const rm of rs) rm.strength *= 0.995; if (rs.length && rs[0].strength < 0.1) rs.shift();
    for (const rm of rs) if (rm.claim === 'cheat') { const c = w.byId.get(rm.about); if (!c) continue; const bond = bonded(c); if (bond === r.id && rm.strength > 0.3 && chance(w, 0.3)) { let lover: Rat | undefined; for (const [id, x] of c.rel) if (x.k & RK.lover) lover = w.byId.get(id); discoverAffair(w, r, c, lover); rm.strength = 0; } }
  }
}
