/** 2.2 Family life: the housing era, marriage & weddings, homes, parenting, siblings, divorce, widowhood, inheritance,
 *  jealousy, the incest taboo & scandal, shunning, and an emergent caste system. Nothing here is scripted: each step is a
 *  probability shaped by personality, beliefs, wealth and circumstance. */
import { RF } from './contract';
import { R, RK, chance, clamp, clamp01, day, emit, pick, type Home, type Rat, type World } from './state';
import { addRel, kinship, remember, getRat } from './rats';
import { planChamber } from './burrow';
import { open, chambersOf, anyChamber } from './places';
import { wealth } from './economy';
import { has } from './tech';
import { startRumour } from './social';

const adult = (w: World, r: Rat) => r.alive && !r.rodentoid && r.stageN === 2;
export const spouseOf = (w: World, r: Rat) => (r.spouse ? w.byId.get(r.spouse) : undefined);
const surname = (w: World, r: Rat) => (w.dyns.find((d) => d.id === r.dynasty)?.name.replace('HOUSE ', '') ?? r.name);

/** what a rat does for a living, for castes and culture tags */
export function occupation(w: World, r: Rat): string {
  if (r.flags & RF.king) return 'crown';
  if (r.flags & (RF.priest | RF.prophet)) return 'priest';
  if (r.flags & RF.healer) return 'healer';
  if (r.flags & RF.enforcer) return 'enforcer';
  if (r.flags & RF.herald) return 'herald';
  if (r.role === 'boss') return 'boss';
  if (r.labrat) return 'scholar';
  const f = r.firm ? w.firms.find((x) => x.id === r.firm) : undefined;
  if (f) return f.kind;
  return r.role === 'idle' || r.role === 'none' ? 'idle' : r.role;
}
const OCC_RANK: Record<string, number> = { crown: 0, priest: 1, boss: 1, scholar: 1, scribes: 1, healer: 2, traders: 2, healers: 2, enforcer: 2, guards: 2, herald: 2, smithy: 2, sparkworks: 2, rodentoid_works: 2, wheelworks: 3, builders: 3, granary: 3, brewers: 3, diggers: 4, foragers: 4, scrapworks: 4, idle: 5 };

// ───────────── the housing era ─────────────
function housingReady(w: World) {
  const pop = w.rats.filter((r) => r.alive && !r.rodentoid).length;
  // bible: about 40, once a second nest and a surplus exist. Day 12 stands in for tools the colony has not named yet.
  if (pop < 36) return false;
  const nests = chambersOf(w, 'nest').length;
  const bonded = w.rats.some((r) => r.spouse || [...r.rel.values()].some((x) => x.k & RK.bond));
  const surplus = w.granary > 6 || w.granary / Math.max(1, pop) > 0.35;
  return bonded && (nests >= 2 || pop >= 48) && surplus && w.stats.unrest < 0.8 && (has(w, 'tools') || has(w, 'shoring') || day(w) >= 12);
}

/** one wedding: rite chosen by the couple's faith and culture; guests are kin and friends */
function wed(w: World, a: Rat, b: Rat) {
  a.spouse = b.id; b.spouse = a.id; a.married = b.married = w.tick;
  const rel = w.religions.find((x) => x.id === (a.religion || b.religion));
  const rite = rel ? `before the faithful of ${rel.name}` : a.beliefs.kin > 0.4 ? 'before both their families' : chance(w, 0.3) ? 'in secret, with only two witnesses' : 'with a feast in the plaza';
  const guests = new Set<number>(); for (const r of [a, b]) for (const [id, x] of r.rel) if (x.aff > 0.3 || x.k & (RK.kin | RK.parent | RK.child | RK.sibling)) guests.add(id);
  const place = (rel && rel.temples[0] != null ? w.chambers[rel.temples[0]] : null) ?? anyChamber(w, 'plaza') ?? anyChamber(w, 'nest');
  if (place && !rite.includes('secret')) {
    w.festivals.push({ id: ++w.nextFest, kind: 'wedding', name: `the wedding of ${a.name} and ${b.name}`, chamber: place.id, endsAt: w.tick + 60, joy: 0.12 });
    for (const id of guests) { const g = w.byId.get(id); if (g) { g.emo.joy = clamp01(g.emo.joy + 0.15); (g as any).wedding = { chamber: place.id, until: w.tick + 60 }; } }
  }
  for (const r of [a, b]) { r.emo.joy = clamp01(r.emo.joy + 0.5); r.emo.love = clamp01(r.emo.love + 0.3); remember(w, r, 'marriage', `I married ${r === a ? b.name : a.name} ${rite}.`, 0.9, r === a ? b.id : a.id, true); }
  const royal = (a.flags | b.flags) & RF.king;
  emit(w, 'marriage', `${a.name} and ${b.name} are married ${rite}.${guests.size > 6 ? ` ${guests.size} guests come.` : ''}`, royal ? 3 : 1, { rats: [a.id, b.id], chamber: place?.id, sfx: 'wedding', fx: 'hearts' });
  // marrying across caste lines breaks the purity norm
  if (w.casteEra && a.caste !== b.caste) {
    const ca = w.castes.find((c) => c.id === a.caste), cb = w.castes.find((c) => c.id === b.caste);
    if (ca && cb && (ca.norms.includes('MARRY WITHIN') || cb.norms.includes('MARRY WITHIN'))) {
      const low = ca.rank > cb.rank ? a : b, high = low === a ? b : a;
      if (chance(w, 0.5)) { high.caste = low.caste; emit(w, 'mobility', `${high.name} marries beneath the ${w.castes.find((c) => c.id === high.caste)?.name ?? ''} line and loses rank.`, 1, { rats: [high.id, low.id] }); }
      else { emit(w, 'scandal', `The marriage of ${a.name} and ${b.name} across caste lines scandalises the burrow.`, 1, { rats: [a.id, b.id] }); for (const r of [a, b]) r.shunned = w.tick + 960 * 4; }
    }
  }
  return place;
}

function newHome(w: World, a: Rat, b: Rat): Home | null {
  const near = a.homeNest >= 0 && w.chambers[a.homeNest] ? { x: w.chambers[a.homeNest].cx, y: w.chambers[a.homeNest].cy } : undefined;
  const ch = planChamber(w, 'home', { near, name: `THE ${surname(w, a)} HOME` }); if (!ch) return null;
  const h: Home = {
    id: ++w.nextHome, chamber: ch.id, name: ch.name, owners: [a.id, b.id], family: [a.id, b.id], built: 0, dynasty: a.dynasty || b.dynasty,
    wealth: 0, caste: a.caste, faith: a.religion || b.religion, culture: [], style: { tidy: 0, bold: 0, warm: 0, odd: 0, grand: 0 },
    history: [`DAY ${day(w)}: ${a.name} and ${b.name} began to dig it`], possessions: [], state: 'building', seed: Math.floor(R(w) * 1e9), dirty: true,
  };
  w.homes.push(h); a.home = b.home = h.id; refreshHome(w, h);
  return h;
}
const CULTURE: [string, (r: Rat, w: World) => number][] = [
  ['pious', (r) => r.beliefs.god], ['royalist', (r) => r.beliefs.crown], ['rebel', (r) => -r.beliefs.crown + r.beliefs.equality * 0.5],
  ['scholars', (r) => r.skills.lore + r.knows.length * 0.03 - 0.4], ['tinkerers', (r) => r.skills.craft - 0.3], ['warriors', (r) => r.skills.fight - 0.35],
  ['healers', (r) => r.skills.heal - 0.3], ['musicians', (r) => (r.knows.includes('music') ? 0.4 : 0) + r.P.E - 0.6], ['clannish', (r) => r.beliefs.kin - 0.2],
  ['diggers', (r) => r.skills.dig - 0.4], ['lab-born', (r) => (r.labrat ? 1 : 0)], ['machinists', (r) => (r.knows.includes('automata') || r.knows.includes('rodentoids') ? 1 : 0)],
];
export function refreshHome(w: World, h: Home) {
  const owners = h.owners.map((id) => w.byId.get(id)).filter((r): r is Rat => !!r && r.alive);
  const fam = h.family.map((id) => w.byId.get(id)).filter((r): r is Rat => !!r && r.alive);
  if (!owners.length && !fam.length) { if (h.state !== 'abandoned' && h.state !== 'ruined') { h.state = 'abandoned'; h.history.push(`DAY ${day(w)}: left empty`); h.dirty = true; } return; }
  const all = w.rats.filter((r) => !r.rodentoid && r.stageN === 2).map((r) => wealth(w, r)).sort((a, b) => a - b);
  const mine = fam.reduce((s, r) => s + wealth(w, r), 0) / Math.max(1, owners.length || 1);
  const rank = all.length ? all.filter((x) => x <= mine).length / all.length : 0.5;
  const P = (k: 'O' | 'C' | 'E' | 'A' | 'N') => owners.reduce((s, r) => s + r.P[k], 0) / Math.max(1, owners.length);
  const st = { tidy: clamp01(P('C') * 0.8 + rank * 0.2), bold: clamp01(P('E') * 0.6 + P('O') * 0.4), warm: clamp01(P('A') * 0.7 + owners.reduce((s, r) => s + r.emo.love, 0) / Math.max(1, owners.length) * 0.3), odd: clamp01(P('O') * 0.7 + (owners.some((r) => r.labrat) ? 0.3 : 0)), grand: clamp01(rank * 0.8 + (owners.some((r) => r.flags & RF.king) ? 0.3 : 0)) };
  const culture = CULTURE.map(([t, f]) => [t, owners.reduce((s, r) => s + f(r, w), 0) / Math.max(1, owners.length)] as const).filter(([, v]) => v > 0.25).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t]) => t);
  const changed = Math.abs(rank - h.wealth) > 0.05 || culture.join() !== h.culture.join() || h.style.tidy !== st.tidy;
  h.wealth = rank; h.style = st; h.culture = culture; h.caste = owners[0]?.caste ?? h.caste; h.faith = owners[0]?.religion ?? h.faith;
  h.family = [...new Set([...h.owners, ...fam.flatMap((r) => r.children)])].filter((id) => { const r = w.byId.get(id); return !!r && r.alive && (h.owners.includes(id) || r.home === h.id); });
  if (changed) h.dirty = true;
}
/** something enters a home: a gift, loot, an heirloom, a crafted thing */
export function addPossession(w: World, r: Rat, kind: string, quality: number, origin: string) {
  const h = w.homes.find((x) => x.id === r.home); if (!h) return;
  h.possessions.push({ kind, quality: clamp01(quality), origin }); if (h.possessions.length > 24) h.possessions.sort((a, b) => b.quality - a.quality).length = 24; h.dirty = true;
}
const GIFTS = ['woven mat', 'clay pot', 'shiny bottlecap', 'carved bone', 'feather bed', 'button', 'string of beads', 'cracked mirror', 'tin cup', 'seed jar', 'painted pebble', 'moss pillow', 'thimble', 'wire charm', 'coin', 'candle stub'];
const TECH_PROPS: Record<string, string> = { fire: 'hearth', pottery: 'pot shelf', weaving: 'loom', writing: 'slate wall', lanterns: 'lantern', clockwork: 'ticking box', glow: 'glow jar', music: 'drum', wheel: 'cart', metalwork: 'tin plates', herbs: 'drying herbs', fermenting: 'mash vat', sparks: 'spark coil', automata: 'little machine' };

// ───────────── castes ─────────────
const CASTE_NAMES = [['THE CROWNED', 'THE HIGH BURROW', 'THE GOLDEN TAILS'], ['THE INKPAWS', 'THE KEEPERS', 'THE LEARNED'], ['THE MAKERS', 'THE GUILDED', 'THE IRON PAWS'], ['THE TOILERS', 'THE DIRT PAWS', 'THE HAULERS'], ['THE UNCLEAN', 'THE DREGS', 'THE DEAD-HANDLERS']];
const NORMS = ['MARRY WITHIN', 'THE LOW MAY NOT EAT FIRST', 'NO TOUCHING THE UNCLEAN', 'THE HIGH DO NOT DIG', 'CHILDREN TAKE THEIR FATHER\'S TRADE', 'THE LOW SLEEP NEAR THE MIDDEN'];
function casteFor(w: World, r: Rat): number {
  const occ = occupation(w, r); const ro = OCC_RANK[occ] ?? 4; const tier = Math.min(4, Math.max(0, ro >= 5 ? 4 : ro === 4 ? 3 : ro === 3 ? 2 : ro === 2 ? 2 : ro));
  // birth matters more than work under strict norms
  const m = getRat(w, r.mother), f = getRat(w, r.father); const parentCaste = (f?.caste || m?.caste) ?? 0;
  const pc = w.castes.find((c) => c.id === parentCaste);
  const byWork = w.castes.find((c) => c.rank === tier) ?? w.castes[w.castes.length - 1];
  if (pc && chance(w, 0.75)) return pc.id; return byWork?.id ?? 0;
}
function maybeCastes(w: World) {
  if (w.casteEra || !w.housingEra || w.homes.filter((h) => h.state === 'lived').length < 6) return;
  const ad = w.rats.filter((r) => adult(w, r)); if (ad.length < 40) return;
  const order = ad.reduce((s, r) => s + r.beliefs.order + r.beliefs.kin * 0.5 - r.beliefs.equality * 0.7, 0) / ad.length;
  let inherit = 0, n = 0; for (const r of ad) { const p = getRat(w, r.father) ?? getRat(w, r.mother); if (!p) continue; n++; if (occupation(w, p) === occupation(w, r)) inherit++; }
  const inh = n ? inherit / n : 0; const g = w.stats.gini;
  if (!chance(w, clamp01((order + inh * 0.8 + g * 0.6 - 0.35) * 0.25))) return;
  w.casteEra = day(w) || 1; const k = 3 + (g > 0.45 ? 2 : chance(w, 0.5) ? 1 : 0);
  const tiers = [0, 1, 2, 3, 4].slice(0, k); if (k < 5) tiers[tiers.length - 1] = 4;
  w.castes = tiers.map((t, i) => ({ id: i + 1, name: pick(w, CASTE_NAMES[t]), rank: i, members: 0, occupations: [], norms: [], color: [0xd8b040, 0x6080c0, 0x908070, 0x806040, 0x505048][t], founded: w.tick, occ: {} }));
  const nn = 1 + Math.floor(R(w) * 3); const norms = [...NORMS].sort(() => R(w) - 0.5).slice(0, nn); for (const c of w.castes) c.norms = norms.filter((x) => !(x.includes('UNCLEAN') && c.rank === w.castes.length - 1));
  for (const r of ad) r.caste = casteFor(w, r) || w.castes[Math.min(w.castes.length - 1, OCC_RANK[occupation(w, r)] ?? 3)].id;
  for (const r of w.rats) if (!r.caste && !r.rodentoid) r.caste = getRat(w, r.mother)?.caste || w.castes[w.castes.length - 2]?.id || 1;
  emit(w, 'caste_formed', `The burrow has hardened into castes: ${w.castes.map((c) => c.name).join(', ')}. ${norms.join('. ')}.`, 3, { card: 'castes' });
}
function casteDaily(w: World) {
  if (!w.casteEra || !w.castes.length) return;
  for (const c of w.castes) { c.members = 0; c.occ = {}; }
  const low = w.castes[w.castes.length - 1]; let tension = 0, nLow = 0;
  for (const r of w.rats) {
    if (r.rodentoid || !r.caste) continue; const c = w.castes.find((x) => x.id === r.caste); if (!c) continue; c.members++;
    const o = occupation(w, r); c.occ[o] = (c.occ[o] ?? 0) + 1;
    if (!adult(w, r)) continue;
    // mobility: wealth and merit pull rats across lines, slowly and against resistance
    const wr = wealth(w, r); const strict = c.norms.length / 4;
    const up = w.castes.find((x) => x.rank === c.rank - 1), down = w.castes.find((x) => x.rank === c.rank + 1);
    if (up && wr > 6 + c.rank * 2 && chance(w, 0.02 * (1 - strict))) { r.caste = up.id; emit(w, 'mobility', `${r.name} rises into ${up.name}.`, 0, { rats: [r.id] }); remember(w, r, 'caste', `I rose into ${up.name}.`, 0.7, 0, true); }
    else if (down && (r.crimes > 1 || wr < 0.3) && chance(w, 0.02)) { r.caste = down.id; emit(w, 'mobility', `${r.name} falls into ${down.name}.`, 0, { rats: [r.id] }); remember(w, r, 'caste', `I fell into ${down.name}.`, -0.7, 0, true); }
    // discrimination: the low are refused, cheated and sneered at
    if (c.rank >= w.castes.length - 2) {
      nLow++; r.grievance = clamp01(r.grievance + 0.01 * (1 + strict)); r.needs.status = clamp01(r.needs.status + 0.02);
      tension += r.grievance * (0.5 + Math.max(0, r.beliefs.equality));
      if (chance(w, 0.004 * (1 + strict))) emit(w, 'discrimination', `${r.name} of ${c.name} is ${pick(w, ['turned away from the market', 'made to eat last', 'beaten for touching a high-born', 'refused a job', 'spat on in the tunnel'])}.`, 0, { rats: [r.id], mature: ['violence'] });
    }
  }
  for (const c of w.castes) c.occupations = Object.entries(c.occ).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  const t = nLow ? tension / nLow : 0; (w as any).casteTension = t;
  if (t > 0.45 && chance(w, (t - 0.45) * 0.3)) {
    const leaders = w.rats.filter((r) => r.caste === low.id && adult(w, r)).sort((a, b) => b.genes.charisma + b.grievance - a.genes.charisma - a.grievance);
    const L = leaders[0]; if (L) {
      const violent = chance(w, 0.3 + w.stats.unrest * 0.4);
      emit(w, 'caste_conflict', violent ? `${low.name}, led by ${L.name}, rise up against the high castes. Blood is spilled in the tunnels.` : `${L.name} leads ${low.name} in a march against the caste laws.`, violent ? 3 : 2, { rats: [L.id], mature: violent ? ['violence'] : undefined });
      w.stats.unrest = clamp01(w.stats.unrest + (violent ? 0.15 : 0.06)); L.flags |= RF.leader;
      for (const r of leaders.slice(0, 20)) { r.grievance *= 0.8; r.beliefs.equality = clamp(r.beliefs.equality + 0.1, -1, 1); if (violent) (r as any).casteWar = w.tick + 960; }
    }
  }
  // abolition: if the colony comes to believe in equality, the lines blur away
  const eq = w.rats.reduce((s, r) => s + r.beliefs.equality, 0) / Math.max(1, w.rats.length);
  if (eq > 0.35 && chance(w, (eq - 0.35) * 0.1)) { emit(w, 'reform', `The caste lines are abolished. ${w.castes.map((c) => c.name).join(', ')} are only names now.`, 3, {}); w.castes = []; w.casteEra = 0; for (const r of w.rats) r.caste = 0; }
}

// ───────────── incest taboo & scandal ─────────────
/** how strongly a rat recoils from mating with `o` (0 none … 1 absolute); also returns the kinship */
export function taboo(w: World, a: Rat, o: Rat): { k: number; t: number } {
  const k = kinship(w, a, o); if (k < 0.03) return { k, t: 0 };
  const norm = 0.6 + a.beliefs.kin * 0.2 + a.beliefs.order * 0.15 + (a.beliefs.god > 0.3 ? 0.1 : 0) - (1 - a.P.C) * 0.2 - a.P.O * 0.1;
  return { k, t: clamp01(norm * clamp01(k * 4)) };
}
/** called after a mating between close kin (court said yes despite the taboo) */
export function forbiddenUnion(w: World, a: Rat, b: Rat, k: number) {
  const what = k >= 0.24 ? (a.mother === b.id || b.mother === a.id || a.father === b.id || b.father === a.id ? 'parent and child' : 'siblings') : 'close kin';
  remember(w, a, 'taboo', `${b.name} and I broke the oldest rule.`, -0.3, b.id, true); remember(w, b, 'taboo', `${a.name} and I broke the oldest rule.`, -0.3, a.id, true);
  a.emo.shame = clamp01(a.emo.shame + 0.5); b.emo.shame = clamp01(b.emo.shame + 0.5); (a as any).taboo = (b as any).taboo = w.tick;
  emit(w, 'incest', `${a.name} and ${b.name}, ${what}, lie together in secret.`, 1, { rats: [a.id, b.id], mature: ['incest', 'sex'], safe: `${a.name} and ${b.name} share a forbidden secret.` });
  for (const o of w.rats) if (o !== a && o !== b && o.edge === a.edge && Math.abs(o.s - a.s) < 14 && chance(w, 0.6)) startRumour(w, o, a.id, 'cheat', true, 0.8), ((o as any).sawTaboo = [a.id, b.id]);
}
function scandals(w: World) {
  for (const r of w.rats) {
    const st = (r as any).sawTaboo as number[] | undefined; if (!st) continue;
    if (!chance(w, 0.25 + (1 - r.P.A) * 0.3)) continue; delete (r as any).sawTaboo;
    const a = w.byId.get(st[0]), b = w.byId.get(st[1]); if (!a || !b) continue;
    emit(w, 'scandal', `${r.name} tells everyone what ${a.name} and ${b.name} did. The burrow is disgusted.`, 2, { rats: [a.id, b.id, r.id], mature: ['incest'], safe: `${r.name} exposes a forbidden union between ${a.name} and ${b.name}.` });
    for (const x of [a, b]) {
      x.shunned = w.tick + 960 * (6 + Math.floor(R(w) * 10)); x.suspicion = clamp01(x.suspicion + 0.3); x.needs.status = 1;
      emit(w, 'shunned', `${x.name} is shunned. No one will eat beside them.`, 1, { rats: [x.id] });
      for (const [id, rl] of x.rel) { const o = w.byId.get(id); if (!o) continue; const back = o.rel.get(x.id); if (back) { back.aff = clamp(back.aff - 0.35 * (0.5 + o.beliefs.kin * 0.5), -1, 1); back.trust *= 0.5; } void rl; }
    }
    // the family's name is stained
    const h = w.homes.find((x) => x.id === a.home); if (h) { h.history.push(`DAY ${day(w)}: shamed by scandal`); h.dirty = true; }
  }
  for (const r of w.rats) if (r.shunned && w.tick > r.shunned) { r.shunned = 0; remember(w, r, 'shunned', 'They speak to me again.', 0.4); }
}

// ───────────── jealousy ─────────────
export function jealousy(w: World, victim: Rat, cheat: Rat, lover: Rat) {
  victim.jealous = lover.id; const g = addRel(w, victim, lover, -0.5, -0.5, RK.grudge); g.aff = Math.min(g.aff, -0.6);
  const rage = victim.P.N * 0.5 + (1 - victim.P.A) * 0.4 + victim.emo.anger * 0.3 + victim.genes.strength * 0.2 + (R(w) - 0.5) * 0.4;
  if (rage > 0.95) { (victim as any).revenge = { on: lover.id, kill: rage > 1.1 && chance(w, 0.35), until: w.tick + 960 * 3 };
    emit(w, 'jealousy', `${victim.name} burns with jealousy and goes looking for ${lover.name}.`, 1, { rats: [victim.id, lover.id, cheat.id], mature: ['violence'] }); }
  else if (rage > 0.6) emit(w, 'jealousy', `${victim.name} cannot stop watching ${cheat.name} and ${lover.name}.`, 0, { rats: [victim.id, lover.id] });
}

// ───────────── life events ─────────────
export function onDeath(w: World, r: Rat) {
  const sp = r.spouse ? w.byId.get(r.spouse) : undefined;
  if (sp && sp.alive) {
    sp.spouse = 0; sp.emo.grief = clamp01(sp.emo.grief + 0.7); r.exes; sp.exes.push(r.id);
    remember(w, sp, 'widowed', `${r.name}, my mate, is gone.`, -0.95, r.id, true);
    emit(w, 'widowed', `${sp.name} is widowed.`, (sp.flags | r.flags) & RF.king ? 2 : 0, { rats: [sp.id, r.id] });
  }
  const h = w.homes.find((x) => x.id === r.home);
  if (h && h.owners.includes(r.id)) {
    h.owners = h.owners.filter((x) => x !== r.id); h.history.push(`DAY ${day(w)}: ${r.name} died (${r.cause})`); h.state = 'mourning'; h.dirty = true;
    if (!h.owners.length) {
      // inheritance: eldest living child in the home; rivals may dispute it
      const heirs = r.children.map((id) => w.byId.get(id)).filter((c): c is Rat => !!c && c.alive && c.stageN >= 1).sort((a, b) => a.born - b.born);
      if (heirs.length) {
        const heir = heirs[0]; h.owners = [heir.id]; heir.home = h.id; heir.food += r.food; heir.scrap += r.scrap;
        h.history.push(`DAY ${day(w)}: passed to ${heir.name}`);
        emit(w, 'inheritance', `${heir.name} inherits ${h.name}${h.possessions.length ? ` and its ${h.possessions.length} treasures` : ''}.`, 0, { rats: [heir.id, r.id] });
        for (const sib of heirs.slice(1)) if (sib.P.A < 0.45 && chance(w, 0.5 - sib.P.A * 0.5 + (r.food + r.scrap > 6 ? 0.2 : 0))) {
          const g = addRel(w, sib, heir, -0.5, -0.4, RK.rival | RK.grudge); g.aff = Math.min(g.aff, -0.4);
          emit(w, 'sibling_rivalry', `${sib.name} disputes ${heir.name}'s inheritance. The siblings stop speaking.`, 1, { rats: [sib.id, heir.id] });
          remember(w, sib, 'inheritance', `${heir.name} took everything.`, -0.7, heir.id, true);
        }
      } else if (sp && sp.alive) { h.owners = [sp.id]; }
    }
  }
}

export function familyDaily(w: World) {
  if (!w.housingEra && housingReady(w)) { w.housingEra = day(w) || 1; emit(w, 'home_built', 'The burrow is strong enough now: bonded pairs begin to dig homes of their own.', 3, { card: 'housing' }); }
  // marriages
  const married = new Set<number>();
  for (const a of w.rats) {
    if (!adult(w, a) || a.spouse || married.has(a.id) || (a.shunned && w.tick < a.shunned)) continue;
    let bid = 0; for (const [id, x] of a.rel) if (x.k & RK.bond) { bid = id; break; } if (!bid) continue;
    const b = w.byId.get(bid); if (!b || !adult(w, b) || b.spouse) continue;
    const rl = a.rel.get(b.id)!, br = b.rel.get(a.id); if (!br || rl.aff < 0.45 || br.aff < 0.4) continue;
    const p = 0.04 + (a.beliefs.kin + b.beliefs.kin) * 0.03 + (a.beliefs.god > 0.3 ? 0.03 : 0) + (w.housingEra ? 0.06 : 0) + (a.P.C + b.P.C) * 0.02;
    if (!chance(w, p)) continue;
    wed(w, a, b); married.add(a.id); married.add(b.id);
    if (w.housingEra && w.homes.filter((h) => h.state === 'building').length < 2 + Math.floor(w.rats.length / 60)) newHome(w, a, b);
  }
  // homeless married couples try to build once the era allows
  if (w.housingEra) for (const a of w.rats) {
    if (!a.spouse || a.home >= 0 || !adult(w, a)) continue; const b = w.byId.get(a.spouse); if (!b || b.home >= 0) continue;
    if (w.homes.filter((h) => h.state === 'building').length >= 2 + Math.floor(w.rats.length / 60)) break;
    if (chance(w, 0.25)) newHome(w, a, b);
  }
  for (const h of w.homes) {
    const ch = w.chambers[h.chamber];
    if (h.state === 'building' && ch && open(ch)) {
      h.state = 'lived'; h.built = w.tick; h.history.push(`DAY ${day(w)}: finished`); h.dirty = true;
      const o = h.owners.map((id) => w.byId.get(id)).filter((r): r is Rat => !!r);
      for (const r of o) { r.homeNest = h.chamber; r.emo.joy = clamp01(r.emo.joy + 0.4); r.needs.comfort = 0; remember(w, r, 'home', `We finished our home, ${h.name}.`, 0.8, 0, true); }
      for (const c of o.flatMap((r) => r.children)) { const k = w.byId.get(c); if (k && k.alive && k.stageN < 2) { k.home = h.id; k.homeNest = h.chamber; } }
      emit(w, 'home_built', `${o.map((r) => r.name).join(' and ')} finish ${h.name}.`, 0, { rats: h.owners, chamber: h.chamber });
      // housewarming gifts from friends, and things they make with what they know
      for (const r of o) { for (const [id, x] of r.rel) if (x.aff > 0.5 && chance(w, 0.4)) { const g = w.byId.get(id); if (g) addPossession(w, r, pick(w, GIFTS), 0.2 + R(w) * 0.6, `gift of ${g.name}`); }
        for (const t of r.knows) if (TECH_PROPS[t] && chance(w, 0.5)) addPossession(w, r, TECH_PROPS[t], 0.3 + r.skills.craft * 0.6, 'made by hand'); }
    }
    if (h.state === 'mourning' && chance(w, 0.2)) { h.state = h.owners.length ? 'lived' : 'abandoned'; h.dirty = true; }
    if (ch && ch.flooded > 0.5 && h.state === 'lived' && chance(w, 0.3)) { h.history.push(`DAY ${day(w)}: flooded`); h.possessions = h.possessions.filter(() => chance(w, 0.7)); h.dirty = true; }
    if (day(w) % 2 === 0) refreshHome(w, h);
    // wealth buys things
    for (const id of h.owners) { const r = w.byId.get(id); if (r && wealth(w, r) > 6 && chance(w, 0.05)) { r.scrap = Math.max(0, r.scrap - 1); addPossession(w, r, pick(w, GIFTS), 0.5 + R(w) * 0.5, 'bought at market'); } }
  }
  // parenting, siblings, divorce
  for (const r of w.rats) {
    if (r.rodentoid) continue;
    if (r.stageN < 2 && (r.mother || r.father)) {
      const ps = [getRat(w, r.mother), getRat(w, r.father)].filter((p): p is Rat => !!p && p.alive);
      const care = ps.length ? ps.reduce((s, p) => s + p.P.A * 0.5 + p.P.C * 0.3 + (p.needs.hunger < 0.6 ? 0.2 : 0) - p.emo.anger * 0.3, 0) / ps.length : 0.1;
      r.parenting = r.parenting * 0.9 + care * 0.1;
      for (const p of ps) { // children absorb their parents' beliefs in proportion to the care they get
        for (const k of ['crown', 'god', 'equality', 'order', 'kin'] as const) r.beliefs[k] = clamp(r.beliefs[k] + (p.beliefs[k] - r.beliefs[k]) * 0.02 * care, -1, 1);
        if (care < 0.25 && chance(w, 0.03)) { remember(w, r, 'neglect', `${p.name} has no time for me.`, -0.5, p.id); r.grievance = clamp01(r.grievance + 0.05); }
      }
      // siblings compete for food and attention
      if (chance(w, 0.03)) { const m = getRat(w, r.mother); if (m) { const sibs = m.children.map((id) => w.byId.get(id)).filter((s): s is Rat => !!s && s.alive && s !== r && Math.abs(s.born - r.born) < 960 * 4);
        const s = sibs[0]; if (s && r.P.A + s.P.A < 0.8 && chance(w, 0.4)) { const g = addRel(w, r, s, -0.3, -0.1, RK.rival); void g; emit(w, 'sibling_rivalry', `${r.name} and ${s.name} fight over ${pick(w, ['the warmest spot', 'a crust', 'their mother\'s attention', 'a shiny button'])}.`, 0, { rats: [r.id, s.id] }); } } }
    }
    if (r.spouse && adult(w, r)) {
      const sp = w.byId.get(r.spouse); const rl = r.rel.get(r.spouse);
      if (!sp || !sp.alive) { r.spouse = 0; continue; }
      if (rl && (rl.aff < -0.2 || !(rl.k & RK.bond)) && chance(w, 0.08 + (r.beliefs.kin < 0 ? 0.05 : 0) - (r.beliefs.god > 0.5 ? 0.04 : 0))) {
        r.spouse = 0; sp.spouse = 0; r.exes.push(sp.id); sp.exes.push(r.id);
        const h = w.homes.find((x) => x.id === r.home);
        const keeper = wealth(w, r) >= wealth(w, sp) ? r : sp, leaver = keeper === r ? sp : r;
        if (h) { h.owners = [keeper.id]; h.history.push(`DAY ${day(w)}: ${leaver.name} left`); h.dirty = true; leaver.home = -1; }
        remember(w, r, 'divorce', `${sp.name} and I are finished.`, -0.6, sp.id, true); remember(w, sp, 'divorce', `${r.name} and I are finished.`, -0.6, r.id, true);
        emit(w, 'divorce', `${r.name} and ${sp.name} divorce.${h ? ` ${keeper.name} keeps ${h.name}.` : ''}`, 1, { rats: [r.id, sp.id] });
      }
    }
  }
  scandals(w); maybeCastes(w); casteDaily(w);
}
export { taboo as incestTaboo };
