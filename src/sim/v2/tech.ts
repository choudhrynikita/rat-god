/** Advancement: an open-ended knowledge graph. Discovery is stochastic (curiosity × need × knowledge × tools × luck); knowledge lives in
 *  knowers and is lost when they die untaught. Lab rats from the White Place may arrive carrying half-finished ideas. */
import { RF, type TechInfo } from './contract';
import { R, chance, clamp01, emit, pick, type Rat, type World } from './state';
import { remember } from './rats';

export interface TechDef { id: string; name: string; era: TechInfo['era']; pre: string[][]; /** any-of groups */ blurb: string; need: (w: World) => number; skill: string; diff: number }
const S = (w: World) => w.stats;
const cold = (w: World) => (w.env.tempC < 6 ? 1 : w.env.season === 'winter' ? 0.6 : 0.15);
const hungry = (w: World) => clamp01(meanNeed(w, 'hunger') * 1.4);
const sick = (w: World) => clamp01(w.rats.filter((r) => r.disease).length / Math.max(1, w.rats.length) * 4 + 0.1);
const flooded = (w: World) => clamp01(w.chambers.reduce((a, c) => Math.max(a, c.flooded), 0) * 2 + (w.env.rain > 0.5 ? 0.3 : 0));
const danger = (w: World) => clamp01(w.hazards.length * 0.3 + (w.chron.deathsByCause.cat ?? 0) * 0.02);
const pop = (w: World) => clamp01(w.rats.length / 200);
const unrest = (w: World) => S(w).unrest;
export function meanNeed(w: World, k: 'hunger' | 'energy' | 'safety' | 'social' | 'status' | 'comfort') { let s = 0, n = 0; for (const r of w.rats) if (!r.rodentoid) { s += r.needs[k]; n++; } return n ? s / n : 0; }

export const TECHS: TechDef[] = [
  // era 0 — basics
  { id: 'fire', name: 'FIRE', era: 0, pre: [[]], skill: 'craft', diff: 1.2, need: (w) => 0.3 + cold(w) * 0.7, blurb: 'Warmth in winter, cooked food (less sickness), light against the dark. Smoke, burns and tunnel fires.' },
  { id: 'tools', name: 'GNAWED TOOLS', era: 0, pre: [[]], skill: 'craft', diff: 0.8, need: (w) => 0.4 + clamp01(w.digQueue.length / 6) * 0.4, blurb: 'Sharpened glass and bone. Digging and gnawing go faster.' },
  { id: 'marks', name: 'COUNTING MARKS', era: 0, pre: [[]], skill: 'lore', diff: 0.9, need: (w) => 0.2 + clamp01(w.granary / 80) * 0.4, blurb: 'Scratches that count food. Granaries are harder to skim; debts are remembered.' },
  { id: 'weaving', name: 'NEST WEAVING', era: 0, pre: [[]], skill: 'build', diff: 0.7, need: (w) => 0.3 + cold(w) * 0.4, blurb: 'Shredded bedding. Pups survive the cold; nests hold more rats.' },
  { id: 'herbs', name: 'HERB LORE', era: 0, pre: [[]], skill: 'heal', diff: 0.9, need: (w) => sick(w), blurb: 'Bitter roots that ease fevers. Fewer deaths from sickness.' },
  { id: 'music', name: 'DRUMS AND PIPES', era: 0, pre: [[]], skill: 'talk', diff: 0.6, need: (w) => 0.25 + S(w).joy * 0.3, blurb: 'Rhythm on tin and bone. Festivals, dances, songs; joy spreads.' },
  // era 1
  { id: 'writing', name: 'WRITTEN MARKS', era: 1, pre: [['marks']], skill: 'lore', diff: 1.4, need: (w) => 0.3 + pop(w) * 0.4, blurb: 'Signs that keep words. Posters can be read; knowledge survives on slates; literacy grows.' },
  { id: 'pottery', name: 'CLAY POTS', era: 1, pre: [['fire']], skill: 'craft', diff: 1.0, need: (w) => 0.3 + clamp01(w.granary / 60) * 0.5, blurb: 'Fired clay jars. The granary rots far slower.' },
  { id: 'preservation', name: 'DRYING AND SALTING', era: 1, pre: [['fire'], ['pottery']], skill: 'forage', diff: 1.0, need: (w) => 0.3 + (w.env.season === 'autumn' ? 0.4 : 0) + hungry(w) * 0.3, blurb: 'Food that lasts through winter. Famines bite less.' },
  { id: 'shoring', name: 'ROOF PROPS', era: 1, pre: [['tools']], skill: 'build', diff: 1.0, need: (w) => 0.2 + clamp01((w.chron.counts.collapse ?? 0) * 0.2), blurb: 'Sticks and bone props. Far fewer cave-ins; bigger halls possible.' },
  { id: 'drainage', name: 'DRAIN CHANNELS', era: 1, pre: [['tools']], skill: 'dig', diff: 1.0, need: (w) => 0.15 + flooded(w) * 0.8, blurb: 'Sloped channels and sumps. Floods drain away faster.' },
  { id: 'traps', name: 'SNARES', era: 1, pre: [['tools']], skill: 'craft', diff: 1.1, need: (w) => 0.15 + danger(w) * 0.8, blurb: 'Wire nooses at the mouths. Predators are wounded or driven off more often.' },
  { id: 'wheel', name: 'THE WHEEL', era: 1, pre: [['tools']], skill: 'build', diff: 1.3, need: (w) => 0.2 + clamp01(w.spoil.size * 0.1), blurb: 'Rolling carts. Hauling spoil and food is faster.' },
  { id: 'medicine', name: 'MEDICINE', era: 1, pre: [['herbs']], skill: 'heal', diff: 1.3, need: (w) => sick(w) * 1.2, blurb: 'Poultices and setting bones. Wounds and plague kill fewer.' },
  { id: 'fermenting', name: 'FERMENTING', era: 1, pre: [['pottery'], ['preservation']], skill: 'forage', diff: 1.0, need: (w) => 0.2 + S(w).joy * 0.3, blurb: 'Sour mash brew. Festivals are merrier; drunken fights more common.' },
  // era 2
  { id: 'metalwork', name: 'SCRAP-SMITHING', era: 2, pre: [['fire', 'tools']], skill: 'craft', diff: 1.6, need: (w) => 0.3 + clamp01(w.scrapPool / 60) * 0.4, blurb: 'Bent and hammered scrap. Better tools; blades.' },
  { id: 'weapons', name: 'SPEARS', era: 2, pre: [['tools'], ['metalwork']], skill: 'fight', diff: 1.2, need: (w) => 0.15 + unrest(w) * 0.5 + danger(w) * 0.4, blurb: 'Pointed wire and glass. Fights and wars turn deadly; enforcers grow stronger.' },
  { id: 'lanterns', name: 'LANTERNS', era: 2, pre: [['fire', 'pottery']], skill: 'craft', diff: 1.2, need: (w) => 0.25 + danger(w) * 0.3, blurb: 'Covered flames. Night foraging is safer; tunnel fires rarer than with open flame.' },
  { id: 'sanitation', name: 'SANITATION', era: 2, pre: [['medicine'], ['drainage', 'herbs']], skill: 'heal', diff: 1.3, need: (w) => sick(w), blurb: 'Latrines kept apart, the dead carried out. Disease spreads slower.' },
  { id: 'tokens', name: 'SCRAP TOKENS', era: 2, pre: [['marks', 'metalwork']], skill: 'talk', diff: 1.3, need: (w) => 0.2 + clamp01(w.firms.length / 5) * 0.5, blurb: 'Stamped scrap as money. Markets move faster; the rich grow richer faster.' },
  { id: 'lawcode', name: 'WRITTEN LAW', era: 2, pre: [['writing']], skill: 'lore', diff: 1.3, need: (w) => 0.15 + clamp01(S(w).crime * 0.2) * 0.6, blurb: 'Laws on slates. Fewer wrongful convictions; laws spread faster and stick.' },
  { id: 'surgery', name: 'SURGERY', era: 2, pre: [['medicine', 'metalwork']], skill: 'heal', diff: 1.6, need: (w) => sick(w) * 0.7 + 0.1, blurb: 'Fine blades for wounds. Injuries rarely kill.' },
  { id: 'stamping', name: 'STAMPED POSTERS', era: 2, pre: [['writing', 'metalwork']], skill: 'craft', diff: 1.4, need: (w) => 0.15 + clamp01(w.parties.length * 0.25), blurb: 'Many posters from one stamp. Propaganda and news spread far faster.' },
  // era 3
  { id: 'sparks', name: 'SPARKS', era: 3, pre: [['metalwork']], skill: 'craft', diff: 2.0, need: (w) => 0.25 + cold(w) * 0.2 + (w.env.lightning ? 0.3 : 0), blurb: 'Power bled from the Giants\' street cables. Light and heat without smoke. Shocks kill the careless.' },
  { id: 'pumps', name: 'PUMPS', era: 3, pre: [['wheel', 'metalwork']], skill: 'build', diff: 1.6, need: (w) => flooded(w) + 0.1, blurb: 'Bellows and screws that lift water. Floods are pumped out.' },
  { id: 'clockwork', name: 'CLOCKWORK', era: 3, pre: [['wheel', 'metalwork']], skill: 'craft', diff: 1.8, need: (w) => 0.2 + clamp01(w.firms.length / 6) * 0.3, blurb: 'Springs and gears. Shifts are timed; output rises; work grows dull.' },
  { id: 'powders', name: 'POWDERS', era: 3, pre: [['fire', 'pottery', 'medicine']], skill: 'heal', diff: 1.7, need: (w) => 0.15 + danger(w) * 0.3 + sick(w) * 0.3, blurb: 'Mixed salts and ash. Bait can be tested for poison; some powders burn.' },
  { id: 'blasting', name: 'BLASTING', era: 3, pre: [['powders', 'fire']], skill: 'dig', diff: 1.9, need: (w) => 0.1 + clamp01((w.chron.counts.dig_done ?? 0) * 0.01), blurb: 'Powder that cracks stone. Rock can be dug through — and roofs come down.' },
  { id: 'cure', name: 'THE CURE', era: 3, pre: [['medicine', 'powders']], skill: 'heal', diff: 2.0, need: (w) => sick(w) * 1.2, blurb: 'A tincture against the plague. Epidemics burn out fast.' },
  // era 4
  { id: 'wires', name: 'WHISPER WIRES', era: 4, pre: [['sparks', 'clockwork']], skill: 'craft', diff: 2.2, need: (w) => 0.2 + pop(w) * 0.3, blurb: 'Voices along a wire. News and rumour cross the whole city at once.' },
  { id: 'motors', name: 'MOTORS', era: 4, pre: [['sparks', 'clockwork']], skill: 'build', diff: 2.3, need: (w) => 0.2 + clamp01(w.digQueue.length / 6) * 0.3, blurb: 'Spinning cores. Wheels turn without runners; many jobs need fewer paws.' },
  { id: 'glow', name: 'GLOW TUBES', era: 4, pre: [['sparks']], skill: 'craft', diff: 1.8, need: (w) => 0.2 + danger(w) * 0.2, blurb: 'Steady light everywhere. Night loses its terror; sleep grows restless.' },
  { id: 'listening', name: 'LISTENING WIRES', era: 4, pre: [['wires']], skill: 'craft', diff: 2.0, need: (w) => 0.1 + unrest(w) * 0.6, blurb: 'Hidden wires in the walls. The powerful hear every whisper. Secret police thrive.' },
  { id: 'automata', name: 'CLOCKWORK RATS', era: 4, pre: [['clockwork', 'motors']], skill: 'craft', diff: 2.5, need: (w) => 0.15 + clamp01(w.stats.wages / 3) * 0.3, blurb: 'Wind-up haulers. Clumsy, but they never tire.' },
  // era 5 — hyper-advanced
  { id: 'ri', name: 'RATIFICIAL INTELLIGENCE', era: 5, pre: [['motors', 'wires', 'writing']], skill: 'lore', diff: 3.2, need: (w) => 0.2 + pop(w) * 0.3, blurb: 'A thinking machine: RI. It advises whoever owns it, and it is rarely wrong about facts.' },
  { id: 'rodentoids', name: 'RODENTOIDS', era: 5, pre: [['ri', 'motors'], ['automata', 'ri']], skill: 'craft', diff: 3.0, need: (w) => 0.2 + clamp01(w.stats.wages / 2) * 0.4, blurb: 'Robot rats run by RI. They dig, haul and forage without food or sleep. Workers they replace must find new lives.' },
  { id: 'burrowmind', name: 'THE BURROW-MIND', era: 5, pre: [['ri', 'listening']], skill: 'lore', diff: 3.5, need: (w) => 0.1 + unrest(w) * 0.3, blurb: 'An RI that hears the whole city and runs its queues. Order — or a cage.' },
  { id: 'whitecraft', name: 'WHITE PLACE MEDICINE', era: 5, pre: [['ri', 'cure']], skill: 'heal', diff: 3.2, need: (w) => sick(w) * 0.5 + 0.1, blurb: 'What the lab rats remember of the White Place: rats live far longer, and pups are born stronger.' },
];
export const TECH_BY_ID: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.id, t]));

/** colony has a working tech (some living knower, not banned unless used in secret) */
export function has(w: World, id: string): boolean { const t = w.tech[id]; return !!t && (t.status === 'known' || t.status === 'secret' || t.status === 'worshipped') && t.knowers > 0; }
export const era = (w: World) => { let e = 0; for (const t of Object.values(w.tech)) if (t.knowers > 0 && t.status !== 'lost') e = Math.max(e, t.era); return e; };
export const knows = (r: Rat, id: string) => r.knows.includes(id);
const prereqOk = (r: Rat, d: TechDef) => d.pre.some((g) => g.every((p) => r.knows.includes(p)));

export function learn(w: World, r: Rat, id: string, how: TechInfo['how'], from = 0) {
  if (r.knows.includes(id) || r.rodentoid) return false;
  r.knows.push(id);
  let t = w.tech[id]; const d = TECH_BY_ID[id];
  if (!t || t.status === 'lost') {
    const re = t?.status === 'lost';
    t = w.tech[id] = { id, name: d.name, era: d.era, status: 'known', knowers: 0, discovered: w.tick, discoverer: r.id, how, holder: 0, blurb: d.blurb, progressLost: 0, slates: t?.slates ?? 0 };
    const verb = how === 'accident' ? 'stumbles upon' : how === 'observation' ? 'works out, from watching,' : how === 'labrats' ? 'brings from the White Place' : how === 'stolen' ? 'steals' : 'discovers';
    const e = emit(w, 'discovery', `${r.name} ${verb} ${d.name}${re ? ' — lost knowledge, found again' : ''}.`, d.era >= 3 ? 3 : 2, { rats: [r.id], x: r.x, y: r.y, fx: 'discovery', sfx: 'discovery', card: d.blurb });
    void e; remember(w, r, 'discovery', `I discovered ${d.name}.`, 0.9, 0, true); r.titles.push(`DISCOVERER OF ${d.name}`);
    r.emo.joy = clamp01(r.emo.joy + 0.5); r.needs.status = Math.max(0, r.needs.status - 0.4);
    // secrecy: a greedy discoverer with a firm or faction may keep it to themselves
    if (r.firm && r.P.A < 0.4 && chance(w, 0.5)) { t.status = 'secret'; t.holder = r.firm; }
  } else if (how === 'stolen' && t.status === 'secret') emit(w, 'tech_stolen', `${r.name} steals the secret of ${d.name}.`, 2, { rats: [r.id, from] });
  t.knowers++;
  return true;
}

/** researcher works for one tick on their current idea */
export function researchTick(w: World, r: Rat, labBonus: number): void {
  let rs = w.research.find((x) => x.ratId === r.id);
  if (!rs) {
    const cands = TECHS.filter((d) => !r.knows.includes(d.id) && prereqOk(r, d));
    if (!cands.length) return;
    // choose by perceived need × curiosity, with labrat partial-progress memories favoured
    let tot = 0; const ws = cands.map((d) => { const v = (0.15 + d.need(w)) * (r.skills[d.skill] + 0.3) * (d.era <= era(w) + 1 ? 1 : 0.25) * ((w.tech[d.id]?.status === 'lost') ? 1.5 : 1); tot += v; return v; });
    let x = R(w) * tot, pick_ = cands[0]; for (let i = 0; i < cands.length; i++) { x -= ws[i]; if (x <= 0) { pick_ = cands[i]; break; } }
    rs = { ratId: r.id, tech: pick_.id, progress: (r as any).labIdeas?.[pick_.id] ?? 0, fails: 0, chamber: -1 }; w.research.push(rs);
  }
  const d = TECH_BY_ID[rs.tech];
  if (r.knows.includes(d.id)) { w.research.splice(w.research.indexOf(rs), 1); return; }
  const tools = r.knows.includes('tools') ? 1.2 : 1; const sp = (0.4 + r.genes.intellect) * (0.3 + r.skills[d.skill] + r.skills.lore * 0.5) * tools * labBonus * (r.labrat ? 1.6 : 1);
  rs.progress += sp / (d.diff * 900 * (1 + d.era * 0.9)) * (0.5 + R(w));
  r.skills.lore = Math.min(1, r.skills.lore + 0.0004); r.skills[d.skill] = Math.min(1, r.skills[d.skill] + 0.0003);
  // failed experiments: setbacks and accidents; with lessons learnt
  if (chance(w, 0.0009 * (1 + d.era))) {
    rs.fails++; rs.progress = Math.max(0, rs.progress - 0.1);
    const hurt = d.id === 'fire' || d.id === 'sparks' || d.id === 'blasting' || d.id === 'powders' ? 0.4 : 0.1;
    r.injured = Math.max(r.injured, hurt * R(w)); if (d.id === 'sparks' && chance(w, 0.08)) { (w as any).pendingKills.push([r.id, 'shock']); }
    emit(w, 'experiment_failed', `${r.name}'s experiment with ${d.name.toLowerCase()} goes wrong${hurt > 0.3 ? ' — singed fur and a lesson' : ''}.`, 0, { rats: [r.id], x: r.x, y: r.y, fx: hurt > 0.3 ? 'spark' : undefined });
    remember(w, r, 'fail', `My experiment with ${d.name} failed.`, -0.3);
  }
  if (rs.progress >= 1) { w.research.splice(w.research.indexOf(rs), 1); learn(w, r, d.id, rs.fails > 2 ? 'experiment' : chance(w, 0.5) ? 'curiosity' : 'need'); }
}

/** pass knowledge on: teacher -> learner (one tech per session, chance by skill) */
export function teach(w: World, t: Rat, l: Rat): string | null {
  const allowed = t.knows.filter((id) => !l.knows.includes(id) && TECH_BY_ID[id].pre.some((g) => g.every((p) => l.knows.includes(p))) && (w.tech[id]?.status !== 'secret' || w.tech[id].holder === l.firm || w.tech[id].holder === l.faction));
  if (!allowed.length) return null;
  const id = pick(w, allowed);
  const p = 0.25 + t.skills.talk * 0.4 + l.genes.intellect * 0.3 + (has(w, 'writing') ? 0.15 : 0);
  if (chance(w, p)) { learn(w, l, id, 'taught', t.id); t.skills.talk = Math.min(1, t.skills.talk + 0.01); return id; }
  return null;
}

/** daily bookkeeping: count knowers, lose forgotten knowledge, accidental discoveries, lab-rat arrivals */
export function techDaily(w: World, spawnLabRats: (n: number) => Rat[]) {
  for (const t of Object.values(w.tech)) t.knowers = 0;
  for (const r of w.rats) for (const id of r.knows) { const t = w.tech[id]; if (t) t.knowers++; }
  for (const t of Object.values(w.tech)) {
    if (t.knowers === 0 && t.status !== 'lost') {
      if (t.slates > 0 && w.chambers.some((c) => c.kind === 'archive' && c.progress >= 1)) continue; // written down: recoverable by readers
      t.status = 'lost'; emit(w, 'tech_lost', `The knowledge of ${t.name} dies with its last keeper.`, 2, { card: 'Knowledge lost' });
    }
  }
  // slates: literate keepers write things down
  if (has(w, 'writing')) for (const t of Object.values(w.tech)) if (t.knowers > 0 && chance(w, 0.15)) t.slates = Math.min(5, t.slates + 1);
  // accidents & observation — the world teaches the watchful
  const pickRat = (f: (r: Rat) => boolean) => { const c = w.rats.filter((r) => r.alive && !r.rodentoid && f(r)); return c.length ? pick(w, c) : null; };
  const acc = (id: string, p: number, f: (r: Rat) => boolean, how: TechInfo['how']) => { const d = TECH_BY_ID[id]; if (!d || has(w, id)) return; const r = pickRat((x) => prereqOk(x, d) && f(x)); if (r && chance(w, p * (0.5 + r.genes.curiosity))) learn(w, r, id, how); };
  if (w.env.weather === 'storm') acc('fire', 0.25, (r) => r.edge >= 0 && w.edges[r.edge].kind === 'surface', 'accident');
  acc('fire', 0.01, () => true, 'accident');
  acc('traps', 0.05 * w.hazards.filter((h) => h.kind === 'exterminator').length, () => true, 'observation');
  acc('sparks', 0.02 + (w.env.weather === 'storm' ? 0.05 : 0), (r) => r.knows.includes('metalwork'), 'accident');
  acc('preservation', w.env.tempC < 2 ? 0.05 : 0.005, () => true, 'observation');
  acc('wheel', 0.01 * w.env.streetActivity, () => true, 'observation');
  acc('herbs', 0.01 + w.rats.filter((r) => r.disease).length * 0.002, () => true, 'observation');
  acc('music', 0.02, (r) => r.P.E > 0.6, 'curiosity');
  // lab rats: rare, emergent, never guaranteed — escapees from the White Place
  const d = Math.floor(w.tick / 960);
  const p = d < 8 ? 0 : 0.012 * (0.4 + w.env.streetActivity) * (1 + era(w) * 0.35) * (w.labRatsArrived ? 0.4 : 1);
  if (d - w.lastLabRats > 25 && chance(w, p)) {
    w.lastLabRats = d; w.labRatsArrived++;
    const n = 2 + Math.floor(R(w) * 4); const group = spawnLabRats(n);
    const basics = ['fire', 'tools', 'marks', 'herbs', 'writing', 'medicine', 'metalwork'];
    const dreams: Record<string, number> = { sparks: 0.5 + R(w) * 0.4, powders: 0.4 + R(w) * 0.4, clockwork: 0.3 + R(w) * 0.4, cure: 0.3 + R(w) * 0.4, motors: 0.2 + R(w) * 0.3, ri: 0.15 + R(w) * 0.3, whitecraft: 0.1 + R(w) * 0.3, rodentoids: R(w) * 0.25 };
    for (const r of group) {
      for (const b of basics) if (chance(w, 0.7)) r.knows.push(b);
      (r as any).labIdeas = Object.fromEntries(Object.entries(dreams).map(([k, v]) => [k, clamp01(v * (0.6 + R(w) * 0.6))]));
      for (const b of [...r.knows]) { const t = w.tech[b]; if (!t || t.status === 'lost') { r.knows = r.knows.filter((x) => x !== b); learn(w, r, b, 'labrats'); } }
      remember(w, r, 'origin', 'I escaped the White Place, where the Gloves cut and the lights never go out.', -0.8, 0, true);
      r.flags |= RF.labrat;
    }
    emit(w, 'labrats_arrive', `${n} pale rats with clipped ears stagger in from the street — escapees from the White Place. They know strange things.`, 3, { rats: group.map((r) => r.id), x: group[0]?.x, y: group[0]?.y, fx: 'labrats', sfx: 'omen', card: 'The lab rats have come.' });
  }
}
