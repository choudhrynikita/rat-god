/** Crime & punishment: crimes leave witnesses and suspicion; enforcers investigate (on evidence or on rumour, so the innocent
 *  are sometimes taken); trials are gatherings judged by the king's appointee or the council; jail, exile, execution, release;
 *  prison gangs, escapes, jailbreaks, pardons, secret police. */
import { RF } from './contract';
import { R, chance, clamp01, emit, pick, type Rat, type World } from './state';
import { kill, remember, addRel } from './rats';
import { lawOn } from './laws2';
import { ensure, anyChamber } from './places';

const isAdult = (r: Rat) => r.alive && !r.rodentoid && r.stageN >= 2;
export function enforcers(w: World) { return w.rats.filter((r) => r.flags & RF.enforcer && r.alive); }
export function recordCrime(w: World, by: Rat, victim: number, kind: string) {
  const witnessed = w.rats.filter((o) => o !== by && o.id !== victim && o.alive && o.edge === by.edge && Math.abs(o.s - by.s) < 18).map((o) => o.id);
  w.crimes.push({ tick: w.tick, by: by.id, victim, kind, x: by.x, y: by.y, witnessed, solved: false }); if (w.crimes.length > 120) w.crimes.shift();
  by.crimes++; by.flags |= RF.criminal; by.suspicion = clamp01(by.suspicion + 0.1 + witnessed.length * 0.12); by.record.push(`${kind} (day ${Math.floor(w.tick / 960)})`);
  for (const id of witnessed) { const o = w.byId.get(id)!; const g = addRel(w, o, by, -0.2, -0.3); void g; }
}
const SENT: Record<string, number> = { theft: 3, extortion: 4, assault: 5, murder: 20, treason: 15, heresy: 6, sabotage: 6, poaching: 2, taboo: 6, dissent: 8, arson: 10 };

export function justiceHourly(w: World) {
  const J = w.justice; J.secretPolice = lawOn(w, 'secret_police');
  // appoint enforcers when the law or a guards firm demands it
  const openMurder = w.crimes.some((c) => !c.solved && (c.kind === 'murder' || c.kind === 'assault'));
  const want = (lawOn(w, 'enforcers') ? 2 + Math.floor(w.rats.length / 30) : 0) + (openMurder ? 1 : 0) + w.firms.filter((f) => f.kind === 'guards' && f.status === 'open').reduce((s, f) => s + f.workers, 0) * 0 + (J.secretPolice ? 2 : 0);
  const have = enforcers(w);
  if (have.length < want) { const c = w.rats.filter((r) => isAdult(r) && !(r.flags & (RF.king | RF.jailed | RF.enforcer | RF.criminal)) && (r.role === 'idle' || r.role === 'none' || r.role === 'worker')).sort((a, b) => b.beliefs.order + b.skills.fight - a.beliefs.order - a.skills.fight)[0]; if (c) { c.flags |= RF.enforcer; c.role = 'enforcer'; emit(w, 'hired', `${c.name} takes up the enforcer's club.`, 0, { rats: [c.id] }); } }
  if (have.length > want + 1) { const x = have[0]; x.flags &= ~RF.enforcer; x.role = 'idle'; }
  const E = enforcers(w);
  // investigations → arrests (only if there is a jail or a court to send them to)
  if (E.length || w.council) {
    for (const c of w.crimes) {
      if (c.solved || w.tick - c.tick > 960 * 6) continue;
      const by = w.byId.get(c.by); if (!by || !by.alive) { c.solved = true; continue; }
      const p = 0.01 + c.witnessed.length * 0.02 + E.length * 0.01 + (c.kind === 'murder' ? 0.12 : 0) + (J.secretPolice ? 0.02 : 0);
      if (chance(w, p)) { c.solved = true; arrest(w, by, c.kind, false); }
    }
    // rumour-driven arrests: the suspicious (guilty or not) get taken
    if (chance(w, 0.1 * E.length)) { const s = w.rats.filter((r) => isAdult(r) && !(r.flags & (RF.jailed | RF.king)) && r.suspicion > 0.55).sort((a, b) => b.suspicion - a.suspicion)[0];
      if (s) { const guilty = s.crimes > 0 && w.crimes.some((c) => c.by === s.id && !c.solved); arrest(w, s, guilty ? w.crimes.find((c) => c.by === s.id)!.kind : pick(w, ['theft', 'plotting', 'heresy']), !guilty); } }
    // secret police take dissidents
    if (J.secretPolice && chance(w, 0.08)) { const d = w.rats.find((r) => isAdult(r) && !(r.flags & RF.jailed) && r.beliefs.crown < -0.5 && chance(w, 0.3)); if (d) { arrest(w, d, 'dissent', d.crimes === 0); emit(w, 'secret_police', `${d.name} vanishes in the night. The secret watchers took them.`, 1, { rats: [d.id] }); } }
  }
  // trials
  for (const t of [...J.trials]) if (w.tick >= t.endsAt) { J.trials = J.trials.filter((x) => x !== t); verdict(w, t.accused, t.crime, t.judge); }
  // jail time, gangs, escapes
  const jail = J.jail >= 0 ? w.chambers[J.jail] : null;
  for (const m of [...J.inmates]) {
    const r = w.byId.get(m.ratId); if (!r || !r.alive) { J.inmates = J.inmates.filter((x) => x !== m); continue; }
    r.needs.status = clamp01(r.needs.status + 0.01); r.grievance = clamp01(r.grievance + (m.wrongful ? 0.01 : 0.003));
    if (w.tick >= m.until) { release(w, r, 'served'); continue; }
    if (!m.gang && r.P.A < 0.4 && chance(w, 0.01)) { m.gang = r.id; for (const o of J.inmates) if (o !== m && chance(w, 0.4)) o.gang = r.id; emit(w, 'jailed', `${r.name} runs a gang inside the jail.`, 0, { rats: [r.id] }); }
    const guards = enforcers(w).length; const gang = J.inmates.filter((x) => x.gang && x.gang === m.gang).length;
    if (chance(w, 0.0015 * (1 + gang) * (r.skills.dig + 0.3) / (1 + guards * 0.5))) {
      const many = J.inmates.filter((x) => x.gang && x.gang === m.gang);
      const who = gang > 1 ? many : [m];
      for (const x of who) { const e = w.byId.get(x.ratId); if (e) { e.flags &= ~RF.jailed; e.flags |= RF.outcast | RF.criminal; e.role = 'idle'; e.suspicion = 1; } }
      J.inmates = J.inmates.filter((x) => !who.includes(x));
      emit(w, 'escape', `${who.length > 1 ? `${who.length} prisoners led by ${r.name}` : r.name} ${pick(w, ['tunnel out of the jail', 'overpower the guard and run', 'slip the bars at night'])}.`, 2, { rats: who.map((x) => x.ratId), chamber: jail?.id });
      break;
    }
  }
  if (lawOn(w, 'prison_labour')) for (const m of J.inmates) { const r = w.byId.get(m.ratId); if (r) { (r as any).forcedLabour = true; } }
}
export function arrest(w: World, r: Rat, crime: string, wrongful: boolean) {
  if (r.flags & (RF.jailed | RF.king)) return;
  ensure(w, 'jail'); const J = w.justice; const jail = anyChamber(w, 'jail'); J.jail = jail ? jail.id : -1;
  r.flags |= RF.jailed; r.role = 'prisoner'; (r as any).wrongful = wrongful;
  const judge = w.council?.speaker || w.rats.find((x) => x.flags & RF.priest && x.alive)?.id || w.kingId;
  J.trials.push({ accused: r.id, crime, judge, endsAt: w.tick + 120 + Math.floor(R(w) * 240) });
  remember(w, r, 'arrest', wrongful ? `I was taken for ${crime}. I did nothing.` : `I was caught for ${crime}.`, -0.8, 0, true);
  emit(w, 'arrest', `${r.name} is arrested for ${crime}.`, 1, { rats: [r.id], x: r.x, y: r.y });
  for (const [id, rl] of r.rel) if (rl.k & (1 | 8 | 16 | 1024 | 2048)) { const o = w.byId.get(id); if (o) { o.emo.fear = clamp01(o.emo.fear + 0.2); if (wrongful) o.grievance = clamp01(o.grievance + 0.2); } }
}
function verdict(w: World, id: number, crime: string, judgeId: number) {
  const r = w.byId.get(id); if (!r || !r.alive) return; const J = w.justice; const judge = w.byId.get(judgeId);
  const wrongful = !!(r as any).wrongful;
  // evidence + bias: the judge's view of the accused, caste, faction, bribes, the god's mark, and mercy
  let guilt = (wrongful ? 0.25 : 0.7) + r.suspicion * 0.3 + (R(w) - 0.5) * 0.4;
  if (judge) { const rl = judge.rel.get(r.id); guilt -= (rl?.aff ?? 0) * 0.3; if (w.casteEra && judge.caste !== r.caste) { const jc = w.castes.find((c) => c.id === judge.caste), rc = w.castes.find((c) => c.id === r.caste); if (jc && rc && rc.rank > jc.rank) guilt += 0.15; }
    if (r.faction && judge.faction && r.faction !== judge.faction) guilt += 0.1; if (r.food > 4 && judge.P.A < 0.4 && chance(w, 0.3)) { r.food -= 3; judge.food += 3; guilt -= 0.4; emit(w, 'corruption', `${r.name} bribes the judge.`, 0, { rats: [r.id, judge.id] }); } }
  if (r.flags & RF.blessed) guilt -= 0.2;
  const sev = SENT[crime] ?? 4;
  if (guilt < 0.5) { release(w, r, 'acquitted'); emit(w, 'verdict', `${r.name} is found innocent of ${crime}.`, 1, { rats: [r.id] }); return; }
  const mercy = w.king?.persona.mercy ?? 0.5, cruel = w.king?.persona.cruelty ?? 0.3;
  if ((crime === 'murder' || crime === 'treason') && (lawOn(w, 'public_punishment') || cruel > 0.5) && chance(w, 0.3 + cruel * 0.4 - mercy * 0.3)) {
    J.executions++; r.flags &= ~RF.jailed; emit(w, 'verdict', `${r.name} is condemned to die for ${crime}.${wrongful ? ' Many say the wrong rat hangs.' : ''}`, 2, { rats: [r.id], card: 'Execution' });
    kill(w, r, 'executed', judgeId, true); if (wrongful) wrong(w, r); return;
  }
  if (chance(w, sev > 8 ? 0.25 : 0.1)) { J.exiles++; r.flags &= ~RF.jailed; r.flags |= RF.outcast; r.role = 'exile'; (r as any).exiled = w.tick; emit(w, 'exile', `${r.name} is exiled for ${crime}.`, 1, { rats: [r.id] }); if (wrongful) wrong(w, r); return; }
  const days = Math.max(1, Math.round(sev * (0.6 + R(w) * 0.8) * (1 + cruel - mercy)));
  J.inmates.push({ ratId: r.id, crime, until: w.tick + days * 960, wrongful, gang: 0 }); r.flags |= RF.jailed; r.anim = 14 as any;
  emit(w, 'jailed', `${r.name} is jailed for ${days} days for ${crime}.`, 1, { rats: [r.id] }); if (wrongful) wrong(w, r);
}
function wrong(w: World, r: Rat) {
  emit(w, 'wrongful', `Whispers say ${r.name} was innocent.`, 1, { rats: [r.id] }); w.stats.trust = clamp01(w.stats.trust - 0.03);
  for (const [id, rl] of r.rel) if (rl.aff > 0.3) { const o = w.byId.get(id); if (o) { o.grievance = clamp01(o.grievance + 0.25); o.beliefs.crown = Math.max(-1, o.beliefs.crown - 0.15); } }
}
export function release(w: World, r: Rat, why: string) {
  r.flags &= ~RF.jailed; r.role = 'idle'; w.justice.inmates = w.justice.inmates.filter((x) => x.ratId !== r.id); w.justice.trials = w.justice.trials.filter((x) => x.accused !== r.id);
  r.suspicion *= 0.5; delete (r as any).forcedLabour; if (why !== 'acquitted') emit(w, why === 'pardon' ? 'pardon' : 'released', `${r.name} ${why === 'pardon' ? 'is pardoned' : 'walks out of jail'}.`, 0, { rats: [r.id] });
}
