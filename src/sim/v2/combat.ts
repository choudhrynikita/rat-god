/** Fights, wounds per body part, maiming, battles between groups (coups, holy wars, caste wars, riots). Carnage data for render. */
import { Anim, BODY_PARTS, RF } from './contract';
import { R, RK, chance, clamp, clamp01, day, emit, pick, type Rat, type World } from './state';
import { addRel, kill, remember } from './rats';
import { recordCrime } from './justice';

const WEAPON = (r: Rat) => (r.tool === 2 ? 0.25 : r.tool === 3 ? 0.4 : 0) + (r.knows.includes('weapons') ? 0.1 : 0);
export const power = (r: Rat) => (r.rodentoid ? 0.9 : r.genes.strength * 0.5 + r.skills.fight * 0.4 + r.health * 0.3 + WEAPON(r) - r.injured * 0.4 + (r.flags & RF.blessed ? 0.15 : 0)) * (r.stageN === 0 ? 0.2 : r.stageN === 1 ? 0.6 : r.stageN === 3 ? 0.7 : 1);
const PART_W = [3, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2]; const PW = PART_W.reduce((a, b) => a + b, 0);
function rollPart(w: World) { let x = R(w) * PW; for (let i = 0; i < PART_W.length; i++) { x -= PART_W[i]; if (x <= 0) return i; } return 0; }
export function wound(w: World, r: Rat, severity: number, by?: Rat): { part: string; level: number; dead: boolean } {
  const p = rollPart(w); const cur = (r.wounds >>> (p * 2)) & 3;
  const lvl = Math.min(3, cur + (severity > 0.85 && p !== 0 && p !== 10 ? 3 : severity > 0.55 ? 2 : 1));
  r.wounds = (r.wounds & ~(3 << (p * 2))) | (lvl << (p * 2)); r.wounds >>>= 0;
  r.blood = Math.min(255, r.blood + Math.round(60 + severity * 140)); r.injured = clamp01(r.injured + 0.2 + severity * 0.4); r.flags |= RF.injured;
  r.health = clamp01(r.health - severity * (p === 0 || p === 10 ? 0.5 : 0.25));
  const part = BODY_PARTS[p];
  if (lvl === 3) { // severed
    w.items.push({ id: ++w.nextObj, kind: 'limb', variant: part, x: r.x + (R(w) - 0.5) * 3, y: r.y, edge: r.edge, s: r.s, amount: 1, mature: true }); if (w.items.length > 300) w.items.shift();
    if (part.includes('leg')) r.genes.speed = clamp01(r.genes.speed - 0.25); if (part === 'eye') r.curses.push('one eye'); if (part === 'tail') r.curses.push('no tail');
    remember(w, r, 'maimed', `${by ? by.name + ' took' : 'I lost'} my ${part.replace('_', ' ')}.`, -0.9, by?.id ?? 0, true);
    emit(w, 'maimed', `${r.name}'s ${part.replace('_', ' ')} is ${pick(w, ['torn off', 'bitten clean through', 'severed'])}${by ? ' by ' + by.name : ''}.`, 1, { rats: by ? [r.id, by.id] : [r.id], x: r.x, y: r.y, mature: ['gore'], safe: `${r.name} is badly wounded${by ? ' by ' + by.name : ''}.`, fx: 'blood' });
  }
  return { part, level: lvl, dead: r.health <= 0.02 || (p === 0 && lvl === 3) };
}
/** one fight between two rats. Returns the loser (or null if both walk away). Lethal if `lethal` (murder, war). */
export function fight(w: World, a: Rat, b: Rat, why: string, lethal = false): Rat | null {
  if (!a.alive || !b.alive) return null;
  a.anim = Anim.Fight; b.anim = Anim.Fight; a.target = b.id; b.target = a.id;
  const pa = power(a) + (R(w) - 0.5) * 0.6, pb = power(b) + (R(w) - 0.5) * 0.6;
  const win = pa >= pb ? a : b, lose = win === a ? b : a; const margin = Math.abs(pa - pb);
  const blows = 1 + Math.floor(R(w) * 3);
  for (let i = 0; i < blows; i++) { const res = wound(w, lose, clamp01(0.2 + margin * 0.7 + (lethal ? 0.25 : 0) + R(w) * 0.2), win); if (res.dead) { kill(w, lose, why === 'war' ? 'battle' : lethal ? 'murder' : 'fight', win.id, true); break; } }
  if (chance(w, 0.35)) wound(w, win, clamp01(0.1 + R(w) * 0.3), lose);
  if (lethal && lose.alive && chance(w, 0.25 + margin)) kill(w, lose, why === 'war' ? 'battle' : 'murder', win.id, true);
  win.skills.fight = Math.min(1, win.skills.fight + 0.03); lose.skills.fight = Math.min(1, lose.skills.fight + 0.015);
  const g = addRel(w, lose, win, -0.4, -0.4, RK.grudge); g.aff = Math.min(g.aff, -0.3);
  if (lose.alive && why !== 'war') emit(w, 'fight', `${win.name} beats ${lose.name} (${why}).`, 0, { rats: [win.id, lose.id], x: lose.x, y: lose.y, mature: ['violence'] });
  else if (!lose.alive && lethal && why !== 'war') recordCrime(w, win, lose.id, 'murder');
  return lose;
}
/** a battle between two groups (holy war, coup, caste war, riot). Pairs off fighters; produces carnage. */
export function battle(w: World, A: Rat[], B: Rat[], name: string, where?: { x: number; y: number; chamber?: number }): { deadA: number; deadB: number; winner: 'A' | 'B' } {
  A = A.filter((r) => r.alive); B = B.filter((r) => r.alive); let deadA = 0, deadB = 0;
  const rounds = 2 + Math.floor(R(w) * 3);
  for (let k = 0; k < rounds && A.length && B.length; k++) {
    const n = Math.min(A.length, B.length, 40);
    for (let i = 0; i < n; i++) {
      const a = A[Math.floor(R(w) * A.length)], b = B[Math.floor(R(w) * B.length)]; if (!a.alive || !b.alive) continue;
      const lose = fight(w, a, b, 'war', chance(w, 0.35)); if (lose && !lose.alive) { if (lose === a) deadA++; else deadB++; }
    }
    A = A.filter((r) => r.alive); B = B.filter((r) => r.alive);
    // morale: the side that bleeds more breaks
    const mA = A.reduce((s, r) => s + power(r), 0), mB = B.reduce((s, r) => s + power(r), 0);
    if (mA < mB * 0.45 || mB < mA * 0.45) break;
  }
  const sA = A.reduce((s, r) => s + power(r), 0) - deadA * 0.5, sB = B.reduce((s, r) => s + power(r), 0) - deadB * 0.5;
  const winner = sA >= sB ? 'A' : 'B'; const dead = deadA + deadB;
  w.wars.push({ day: day(w), name, dead }); if (w.wars.length > 50) w.wars.shift();
  const gory = dead > 2 ? ` ${dead} lie dead in the tunnels, ${pick(w, ['entrails across the floor', 'the walls slick with blood', 'torn limbs everywhere', 'the floor red to the ankles'])}.` : dead ? ` ${dead} die.` : ' No one dies.';
  emit(w, 'battle', `${name}.${gory}`, dead > 4 ? 3 : 2, { rats: [...A.slice(0, 3), ...B.slice(0, 3)].map((r) => r.id), x: where?.x, y: where?.y, chamber: where?.chamber, mature: dead > 2 ? ['gore', 'violence'] : ['violence'], safe: `${name}.${dead ? ` ${dead} die.` : ' No one dies.'}`, fx: 'battle', sfx: 'battle' });
  for (const r of [...A, ...B]) { r.emo.fear = clamp01(r.emo.fear + 0.3); r.emo.anger = clamp01(r.emo.anger + 0.2); }
  return { deadA, deadB, winner };
}
/** heal over time: blood fades, wounds scar (maimed parts stay), injury declines */
export function healDaily(w: World) {
  for (const r of w.rats) {
    if (!r.wounds && !r.blood && !r.injured) continue;
    r.blood = Math.max(0, r.blood - 60);
    const heal = 0.08 + r.genes.health * 0.08 + (r.flags & RF.healer ? 0 : 0) + (w.rats.some((h) => h.flags & RF.healer) ? 0.06 : 0) + (r.knows.includes('medicine') ? 0.04 : 0);
    r.injured = Math.max(0, r.injured - heal); if (r.injured <= 0) r.flags &= ~RF.injured;
    for (let p = 0; p < BODY_PARTS.length; p++) { const v = (r.wounds >>> (p * 2)) & 3; if (v === 1 && chance(w, 0.4)) r.wounds = (r.wounds & ~(3 << (p * 2))) >>> 0; }
    // infected wounds can kill without medicine
    if (r.injured > 0.6 && !w.tech['medicine']?.knowers && chance(w, 0.05)) kill(w, r, 'wounds');
  }
}
void clamp;
