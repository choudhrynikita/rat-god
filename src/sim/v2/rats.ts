/** Individuals: genetics, birth, ageing, life stages, memory, death. */
import { Anim, Carry, RF, Stage } from './contract';
import { R, chance, clamp, clamp01, emit, gauss, pick, type Big5, type Genes, type Memory, type Rat, type Rel, type World } from './state';
import { nearestOnGraph, setPose } from './move';
import { onDeath } from './family';

const A = ['GNAW', 'SCAB', 'MANG', 'VERM', 'RUST', 'SOOT', 'GRIM', 'ROT', 'MURK', 'FESTER', 'SKULK', 'TATTER', 'CRUST', 'BLIGHT', 'SLUDGE', 'WHISK', 'NIB', 'GRUB', 'MOLD', 'CHITTER', 'SCRAP', 'CINDER', 'ASH', 'DREG', 'GRIT', 'PEST', 'SNIV', 'BRACK', 'LOUSE', 'TICK', 'PIP', 'BRAN', 'MOSS', 'FLINT', 'NETTLE', 'SORREL', 'TANSY', 'BURDOCK'];
const B = ['LIN', 'BARD', 'Y', 'IN', 'TAIL', 'WICK', 'TOOTH', 'CLAW', 'EAR', 'NOSE', 'PAW', 'BELLY', 'ER', 'KIN', 'LET', 'MAW', 'RICK', 'SNOUT', 'WHISKER', 'BONE', 'SKIN', 'FUR', 'SQUEAK', 'NIP'];
const HOUSE = ['GUTTERBORN', 'PIPEWATER', 'ROOTHOLD', 'CLAYMOUTH', 'ASHFALL', 'DRAINSIDE', 'GRATEKIN', 'BONEPILE', 'DEEPDARK', 'MOSSBACK', 'CINDERHOLE', 'WIRECHEW', 'CRUMBHALL', 'STONETOOTH', 'DAMPHEART', 'GRITCLAW'];
const LAB = ['SUBJECT', 'SPECIMEN', 'NUMBER', 'TAG', 'CAGE'];
export const ratName = (w: World) => pick(w, A) + pick(w, B);

export const DAY = 960;
export const AGE = { juvenile: 3, adult: 8, elder: 60 }; // days
export function stageOf(w: World, r: Rat): Stage {
  if (r.rodentoid) return Stage.Adult;
  const d = (w.tick - r.born) / DAY;
  return d < AGE.juvenile ? Stage.Pup : d < AGE.adult ? Stage.Juvenile : d < AGE.elder * (0.7 + 0.6 * r.genes.longevity) ? Stage.Adult : Stage.Elder;
}
export const ageDays = (w: World, r: Rat) => (w.tick - r.born) / DAY;
export function bodySize(w: World, r: Rat) {
  if (r.rodentoid) return 1;
  const d = ageDays(w, r); const g = 0.85 + 0.3 * r.genes.size;
  return clamp(0.35 + 0.65 * Math.min(1, d / AGE.adult), 0.35, 1) * g;
}

function inheritGenes(w: World, m?: Genes, f?: Genes): Genes {
  const g = (k: keyof Genes) => {
    if (k === 'coat') { if (!m || !f) return Math.floor(R(w) * 8); return chance(w, 0.04) ? Math.floor(R(w) * 8) : chance(w, 0.5) ? m.coat : f.coat; }
    const base = m && f ? (m[k] + f[k]) / 2 : 0.5 + gauss(w) * 0.18; return clamp01(base + gauss(w) * 0.08);
  };
  return { size: g('size'), speed: g('speed'), intellect: g('intellect'), fertility: g('fertility'), longevity: g('longevity'), health: g('health'), charisma: g('charisma'), strength: g('strength'), coat: g('coat'), curiosity: g('curiosity') };
}
function personality(w: World, m?: Big5, f?: Big5): Big5 {
  const t = (k: keyof Big5) => clamp01((m && f ? (m[k] + f[k]) / 2 * 0.45 + 0.275 : 0.5) + gauss(w) * 0.2);
  return { O: t('O'), C: t('C'), E: t('E'), A: t('A'), N: t('N') };
}

export function newRat(w: World, o: { female?: boolean; mother?: Rat; father?: Rat; edge?: number; s?: number; ageDays?: number; dynasty?: number; labrat?: boolean; rodentoid?: boolean; model?: number }): Rat {
  const m = o.mother, f = o.father; const id = ++w.nextRat;
  const genes = inheritGenes(w, m?.genes, f?.genes); const P = personality(w, m?.P, f?.P);
  if (o.labrat) { genes.coat = 6; genes.intellect = clamp01(0.75 + R(w) * 0.25); genes.curiosity = clamp01(0.7 + R(w) * 0.3); P.O = clamp01(0.7 + R(w) * 0.3); }
  const born = w.tick - Math.round((o.ageDays ?? 0) * DAY);
  const bel = (k: string) => {
    const pb = m && f ? ((m.beliefs as any)[k] + (f.beliefs as any)[k]) / 2 : 0; return clamp(pb * 0.6 + gauss(w) * 0.25, -1, 1);
  };
  const r: Rat = {
    id, name: o.rodentoid ? `UNIT-${100 + id % 900}` : o.labrat ? `${pick(w, LAB)} ${Math.floor(R(w) * 90 + 10)}` : ratName(w),
    female: o.rodentoid ? false : o.female ?? chance(w, 0.5), born, alive: true, died: 0, cause: '',
    dynasty: o.dynasty ?? m?.dynasty ?? 0, gen: m ? m.gen + 1 : 0, mother: m?.id ?? 0, father: f?.id ?? 0, children: [],
    genes, P, needs: { hunger: 0.2, energy: 0.2, safety: 0.1, social: 0.3, status: 0.3, comfort: 0.2 },
    emo: { joy: 0.3, fear: 0, anger: 0, grief: 0, love: 0, shame: 0 },
    beliefs: { crown: bel('crown'), god: bel('god'), equality: bel('equality'), order: bel('order'), kin: bel('kin') },
    health: 0.8 + 0.2 * genes.health, disease: null, diseaseT: 0, injured: 0, pregnant: 0, pregFather: 0,
    food: o.ageDays && o.ageDays > 5 ? 2 : 0, scrap: 0,
    skills: { dig: 0.1 + R(w) * 0.2, forage: 0.1 + R(w) * 0.2, fight: 0.1 + R(w) * 0.2, craft: 0.05 + R(w) * 0.1, talk: 0.1 + R(w) * 0.2, heal: 0.05 + R(w) * 0.1, lore: 0.05 + R(w) * 0.1, build: 0.05 + R(w) * 0.1 },
    mem: [], rel: new Map(), knows: [], role: 'none', firm: 0, faction: 0, party: 0, religion: 0,
    flags: 0, blessings: [], curses: [], record: [], titles: [], suspicion: 0, crimes: 0, grievance: 0, insecurity: 0, faithGod: 0,
    edge: 0, s: 0, dir: 1, speed: 0, lane: 0, x: 0, y: 0, heading: 0, dist: 0, path: [], pathI: 0, goalS: 0, laneT: 0, facing: 1, stageN: 0,
    anim: Anim.Idle, carry: Carry.None, carryAmt: 0, tool: 0, target: -1,
    intent: { kind: 'idle', since: w.tick, until: w.tick + 20, goalNode: -1, goalEdge: -1, goalS: 0, chamber: -1, target: -1, data: 0, phase: 0 },
    nextThink: w.tick + 1 + Math.floor(R(w) * 30), lastDecision: null,
    rodentoid: !!o.rodentoid, model: o.model ?? 0, charge: 1, labrat: !!o.labrat, homeNest: -1, story: [],
    size: 1, spouse: 0, married: 0, home: m?.home ?? -1, caste: m && f && m.caste === f.caste ? m.caste : (m?.caste ?? 0), inbr: 0,
    wounds: 0, blood: 0, shunned: 0, rip: [], exes: [], jealous: 0, parenting: 0.5,
  };
  // real inbreeding: F = kinship of the parents; recessive faults surface in proportion
  if (m && f) {
    r.inbr = kinship(w, m, f);
    if (r.inbr > 0) {
      const F = r.inbr; genes.health = clamp01(genes.health - F * 1.6 * R(w)); genes.fertility = clamp01(genes.fertility - F * 1.4 * R(w)); genes.longevity = clamp01(genes.longevity - F * 1.2 * R(w)); genes.intellect = clamp01(genes.intellect - F * 0.8 * R(w));
      r.health = 0.8 + 0.2 * genes.health;
      if (chance(w, F * 1.5)) { const fault = pick(w, FAULTS); r.curses.push(fault); r.record.push(`born with ${fault}`); if (fault === 'a weak heart') r.health *= 0.6; }
    }
    // the pup inherits the god's attention from its parents
    for (const t of [...m.rip, ...f.rip]) if (t.d < 3) r.rip.push({ id: t.id, d: t.d + 1, t: w.tick });
    // parents' ripple tags are capped at 4 in tagRat; here we just keep the first few
    if (r.rip.length > 4) r.rip.length = 4;
  }
  if (r.female) r.flags |= RF.female; if (o.labrat) r.flags |= RF.labrat; if (o.rodentoid) { r.flags |= RF.rodentoid; r.genes.coat = o.model ?? 0; r.P = { O: 0.5, C: 1, E: 0, A: 1, N: 0 }; }
  if (o.labrat) { r.skills.lore = 0.6 + R(w) * 0.3; r.skills.craft = 0.4 + R(w) * 0.3; r.skills.heal = 0.3 + R(w) * 0.3; }
  if (m) { m.children.push(id); if (f) f.children.push(id); addRel(w, r, m, 0.7, 0.8, 1024 /*parent*/); addRel(w, m, r, 0.8, 0.6, 2048); if (f) { addRel(w, r, f, 0.4, 0.5, 1024); addRel(w, f, r, 0.4, 0.4, 2048); }
    for (const sid of m.children) { if (sid === id) continue; const sb = w.byId.get(sid); if (sb && sb.alive) { addRel(w, r, sb, 0.4, 0.5, 4096); addRel(w, sb, r, 0.4, 0.5, 4096); } } }
  const pos = o.edge != null ? { edge: o.edge, s: o.s ?? 0 } : m ? { edge: m.edge, s: m.s } : nearestOnGraph(w, w.T.W / 2, 40);
  r.edge = pos!.edge; r.s = pos!.s; setPose(w, r);
  r.stageN = stageOf(w, r);
  w.rats.push(r); w.byId.set(id, r);
  return r;
}

const FAULTS = ['a crooked spine', 'clouded eyes', 'a weak heart', 'a twisted tail', 'shaking paws', 'a short snout', 'no sense of smell'];
export const getRat = (w: World, id: number): Rat | undefined => w.byId.get(id) ?? w.ghosts.get(id);
/** ancestors of a rat as id -> generations up (shortest), up to `depth` */
function ancestors(w: World, r: Rat, depth: number, out = new Map<number, number[]>(), g = 1): Map<number, number[]> {
  if (g > depth) return out;
  for (const pid of [r.mother, r.father]) { if (!pid) continue; const p = getRat(w, pid); if (!p) continue; const l = out.get(pid) ?? []; l.push(g); out.set(pid, l); ancestors(w, p, depth, out, g + 1); }
  return out;
}
/** Wright's coefficient of relationship (kinship) between a and b by the path method, 4 generations deep. 0.25 for full siblings / parent-child. */
export function kinship(w: World, a: Rat, b: Rat): number {
  const A = ancestors(w, a, 4), B = ancestors(w, b, 4); let k = 0;
  if (A.has(b.id)) for (const n of A.get(b.id)!) k += Math.pow(0.5, n + 1) * (1 + b.inbr);
  if (B.has(a.id)) for (const n of B.get(a.id)!) k += Math.pow(0.5, n + 1) * (1 + a.inbr);
  for (const [id, na] of A) { const nb = B.get(id); if (!nb) continue; const anc = getRat(w, id); const Fa = anc?.inbr ?? 0; for (const x of na) for (const y of nb) k += Math.pow(0.5, x + y + 1) * (1 + Fa); }
  return Math.min(0.5, k);
}
export function addRel(w: World, a: Rat, b: Rat, aff: number, trust: number, k = 0): Rel {
  let rl = a.rel.get(b.id);
  if (!rl) {
    if (a.rel.size >= 28) { // forget the weakest non-kin tie
      let wk = -1, wv = Infinity; for (const [id, x] of a.rel) { const v = Math.abs(x.aff) + x.fam + (x.k & (1 | 8 | 16 | 1024 | 2048) ? 5 : 0); if (v < wv) { wv = v; wk = id; } } if (wk >= 0) a.rel.delete(wk);
    }
    rl = { aff, trust, fam: 0.1, k, debt: 0, last: w.tick }; a.rel.set(b.id, rl);
  } else { rl.aff = clamp(rl.aff + aff * 0.3, -1, 1); rl.trust = clamp(rl.trust + trust * 0.2, 0, 1); rl.k |= k; rl.last = w.tick; }
  return rl;
}
export function remember(w: World, r: Rat, kind: string, text: string, val: number, other = 0, pin = false) {
  const m: Memory = { tick: w.tick, text, val, other, kind, pinned: pin || Math.abs(val) > 0.7, w: Math.abs(val) };
  r.mem.push(m);
  if (m.pinned && r.story.length < 60) r.story.push(`DAY ${Math.floor(w.tick / DAY)}: ${text}`);
  if (r.mem.length > 32) { const i = r.mem.findIndex((x) => !x.pinned); r.mem.splice(i >= 0 ? i : 0, 1); }
}
export function newDynasty(w: World, founder: Rat): number {
  const id = w.dyns.length + 1; const used = new Set(w.dyns.map((d) => d.name));
  let name = 'HOUSE ' + pick(w, HOUSE); for (let k = 0; k < 8 && used.has(name); k++) name = 'HOUSE ' + pick(w, HOUSE) + (k > 4 ? ' ' + (k + 1) : '');
  w.dyns.push({ id, name, founder: founder.id, founded: w.tick, kings: [], fallen: null }); founder.dynasty = id; return id;
}

/** Kill a rat. Leaves a corpse; ripples grief through relations. */
export function kill(w: World, r: Rat, cause: string, by = 0, violent = false) {
  if (!r.alive) return;
  r.alive = false; r.died = w.tick; r.cause = cause; r.anim = Anim.Dead; r.speed = 0; r.path = [];
  w.chron.totalDead++; w.stats.deaths++; w.chron.deathsByCause[cause] = (w.chron.deathsByCause[cause] ?? 0) + 1;
  if (!r.rodentoid) w.corpses.push({ id: ++w.nextObj, ratId: r.id, x: r.x, y: r.y, edge: r.edge, s: r.s, age: 0, cause, violent, decay: 0, stage: r.stageN, coat: r.genes.coat, size: bodySize(w, r), wounds: r.wounds, gore: violent ? clamp01(0.3 + r.blood / 255 + woundCount(r.wounds) * 0.1) : 0, mature: violent });
  if (violent && woundCount(r.wounds) >= 3) { w.items.push({ id: ++w.nextObj, kind: 'blood', x: r.x, y: r.y + 1, edge: r.edge, s: r.s, amount: 1, mature: true }); if (w.items.length > 300) w.items.shift(); }
  onDeath(w, r);
  if (w.corpses.length > 80) w.corpses.shift();
  const killer = by ? w.byId.get(by) : undefined;
  for (const [oid, rl] of r.rel) {
    const o = w.byId.get(oid); if (!o || !o.alive) continue; const back = o.rel.get(r.id); if (!back) continue;
    if (back.aff > 0.3 || back.k & (8 | 16 | 1024 | 2048)) {
      o.emo.grief = clamp01(o.emo.grief + 0.3 + back.aff * 0.5);
      remember(w, o, 'loss', `${r.name} died (${cause}).`, -0.6 - back.aff * 0.3, r.id, back.aff > 0.6 || (back.k & (8 | 16 | 2048)) !== 0);
      if (killer && killer !== o) { const g = addRel(w, o, killer, -0.6, -0.5, 256); g.aff = Math.min(g.aff, -0.5); }
    }
    void rl;
  }
  const lineage = r.story.length ? r.story : [];
  r.story = lineage;
  // slim the ghost
  r.rel = new Map([...r.rel].filter(([, x]) => x.k & (1 | 8 | 16 | 1024 | 2048 | 4096)).slice(0, 12)); r.mem = r.mem.filter((m) => m.pinned).slice(-12);
  w.ghosts.set(r.id, r);
  if (r.flags & RF.king) w.kingDied = { id: r.id, cause, by };
  if (r.flags & RF.watched) {}
  const sev = r.flags & RF.king ? 3 : r.flags & (RF.leader | RF.prophet) ? 2 : violent ? 1 : 0;
  if (violent && cause !== 'smite' && cause !== 'executed') {
    w.stats.unrest = clamp01(w.stats.unrest + (cause === 'murder' ? 0.08 : 0.03));
    w.faith = Math.max(0, w.faith - (cause === 'murder' ? 0.02 : 0.005));
  }
  r.rip = r.rip; // ripple tags stay on the ghost so the death event carries them
  emit(w, cause === 'murder' ? 'murder' : cause === 'executed' ? 'execution' : 'death', deathLine(r, cause, killer?.name), sev as 0 | 1 | 2 | 3, { rats: by ? [r.id, by] : [r.id], x: r.x, y: r.y, sfx: violent ? 'death_violent' : 'death' });
}
function deathLine(r: Rat, cause: string, killer?: string) {
  const n = r.rodentoid ? `${r.name} (a rodentoid)` : r.name;
  switch (cause) {
    case 'old age': return `${n} dies of old age.`; case 'starvation': return `${n} starves.`; case 'murder': return `${n} is murdered${killer ? ' by ' + killer : ''}.`;
    case 'executed': return `${n} is executed.`; case 'drowned': return `${n} drowns.`; case 'buried': return `${n} is buried alive in a cave-in.`;
    case 'plague': return `${n} dies of the plague.`; case 'cat': case 'snake': case 'owl': return `${n} is taken by a ${cause}.`;
    case 'gas': return `${n} chokes on the Giants' gas.`; case 'poison': return `${n} eats poison bait and dies.`; case 'smite': return `${n} is struck down from above.`;
    case 'fire': return `${n} burns.`; case 'fight': return `${n} dies in a fight${killer ? ' with ' + killer : ''}.`; case 'broken': return `${n} breaks down for good.`;
    case 'holy war': return `${n} falls in the holy war.`; case 'riot': return `${n} is trampled in the riot.`; case 'cold': return `${n} freezes.`; case 'stillborn': return `${n} never wakes.`;
    case 'boot': return `${n} is crushed under a Giant's boot.`; case 'shock': return `${n} is killed by a spark from the cables.`;
    default: return `${n} dies (${cause}).`;
  }
}
export function woundCount(b: number) { let n = 0; for (let k = 0; k < 12; k++) if ((b >>> (k * 2)) & 3) n++; return n; }
export function prune(w: World) { if (w.rats.some((r) => !r.alive)) w.rats = w.rats.filter((r) => r.alive); }
export { Carry, Stage };
