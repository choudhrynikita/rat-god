/** Economy: food & scrap, the granary, the market, firms (our allegory of corporations), wages, unions, strikes, rodentoid labour. */
import { RF, Stage, type FirmKind } from './contract';
import { R, chance, clamp, clamp01, emit, pick, type Firm, type Rat, type World } from './state';
import { addRel, newRat, remember } from './rats';
import { has, TECH_BY_ID } from './tech';
import { anyChamber, ensure, spotIn } from './places';
import { lawOn } from './laws2';

export const FIRM_SPEC: Record<FirmKind, { label: string[]; tech: string | null; task: string; crown: boolean; minPop: number; botable: boolean }> = {
  foragers: { label: ['FORAGE CO.', 'CRUMB HAULERS', 'GUTTER PICKERS'], tech: null, task: 'forage', crown: false, minPop: 10, botable: true },
  diggers: { label: ['DIGGERS GUILD', 'DEEP WORKS', 'TUNNEL & SONS'], tech: null, task: 'dig', crown: true, minPop: 12, botable: true },
  scrapworks: { label: ['SCRAP WORKS', 'SHINY THINGS LTD', 'WIRE & TIN'], tech: null, task: 'scavenge', crown: false, minPop: 16, botable: true },
  granary: { label: ['GRANARY KEEPERS', 'THE STORE'], tech: 'marks', task: 'store', crown: true, minPop: 20, botable: false },
  healers: { label: ['HEALERS HOUSE', 'THE POULTICE'], tech: 'herbs', task: 'heal', crown: false, minPop: 14, botable: false },
  builders: { label: ['PROP & BEAM', 'BUILDERS GUILD'], tech: 'shoring', task: 'build', crown: true, minPop: 20, botable: true },
  wheelworks: { label: ['WHEELWORKS', 'ROLLING CO.'], tech: 'wheel', task: 'craft', crown: false, minPop: 20, botable: true },
  smithy: { label: ['THE SMITHY', 'HOT SCRAP'], tech: 'metalwork', task: 'craft', crown: false, minPop: 20, botable: false },
  sparkworks: { label: ['SPARKWORKS', 'CABLE TAPPERS'], tech: 'sparks', task: 'craft', crown: false, minPop: 25, botable: false },
  rodentoid_works: { label: ['RODENTOID WORKS', 'TIN RAT FOUNDRY', 'RI SYSTEMS'], tech: 'rodentoids', task: 'craft', crown: false, minPop: 25, botable: false },
  scribes: { label: ['SCRIBES HALL', 'SLATE & MARK'], tech: 'writing', task: 'write', crown: false, minPop: 20, botable: false },
  brewers: { label: ['SOUR MASH BREWERS', 'THE VAT'], tech: 'fermenting', task: 'craft', crown: false, minPop: 18, botable: false },
  traders: { label: ['TRADING HOUSE', 'BARTER HOUSE'], tech: 'tokens', task: 'trade', crown: false, minPop: 25, botable: false },
  guards: { label: ['IRON PAWS SECURITY', 'NIGHT WATCH CO.'], tech: null, task: 'patrol', crown: false, minPop: 30, botable: true },
};
export const isAdult = (r: Rat) => r.stageN >= Stage.Adult && !r.rodentoid;
export const wealth = (w: World, r: Rat) => r.food + r.scrap / Math.max(0.2, w.market.price);

export function gini(w: World): number {
  const v = w.rats.filter(isAdult).map((r) => wealth(w, r)).sort((a, b) => a - b); const n = v.length; if (n < 2) return 0;
  let cum = 0, s = 0; for (let i = 0; i < n; i++) { cum += v[i]; s += cum; } const tot = cum; if (tot <= 0) return 0;
  return clamp01((n + 1 - 2 * (s / tot)) / n);
}

/** deliver gathered food: tithe to the granary, firm takes its cut, the rest is the forager's own */
export function deliverFood(w: World, r: Rat, amt: number) {
  const tithe = clamp(w.lawMods.tithe ?? 0.15, 0, 0.6);
  const t = amt * tithe; w.granary += t; amt -= t;
  const f = r.firm ? w.firms.find((x) => x.id === r.firm) : null;
  if (f && f.status === 'open') { const cut = amt * (0.35 + (1 - bossA(w, f)) * 0.3); f.wealth += cut; f.output += amt; amt -= cut; }
  r.food += amt;
}
const bossA = (w: World, f: Firm) => w.byId.get(f.boss)?.P.A ?? 0.5;

export function firmName(w: World, kind: FirmKind, boss: Rat) {
  const l = pick(w, FIRM_SPEC[kind].label); return chance(w, 0.4) ? `${boss.name}'S ${l}` : l;
}
export function foundFirm(w: World, boss: Rat, kind: FirmKind): Firm {
  const f: Firm = { id: ++w.nextFirm, name: firmName(w, kind, boss), kind, boss: boss.id, workers: 0, rodentoids: 0, wage: 0.6 + R(w) * 0.6, wealth: Math.min(boss.food, 4), share: 1, founded: w.tick, status: 'open', union: 0, workerIds: [], botIds: [], chamber: -1, lossDays: 0, output: 0 };
  boss.food -= f.wealth; boss.firm = f.id; boss.role = 'boss'; boss.flags |= RF.boss; boss.titles.push(`FOUNDER OF ${f.name}`);
  // greedy bosses pay less, warm bosses more
  f.wage *= 0.7 + boss.P.A * 0.6;
  w.firms.push(f);
  remember(w, boss, 'firm', `I founded ${f.name}.`, 0.7, 0, true);
  emit(w, 'firm_founded', `${boss.name} founds ${f.name}.`, 1, { rats: [boss.id], x: boss.x, y: boss.y });
  if (['smithy', 'sparkworks', 'rodentoid_works', 'brewers', 'wheelworks', 'scribes'].includes(kind)) ensure(w, kind === 'scribes' ? 'archive' : 'workshop', 1);
  return f;
}
function hire(w: World, f: Firm, r: Rat) {
  if (r.firm) leave(w, r);
  r.firm = f.id; f.workerIds.push(r.id); r.role = 'worker'; r.grievance = Math.max(0, r.grievance - 0.2);
  const boss = w.byId.get(f.boss); if (boss) addRel(w, r, boss, 0.1, 0.1);
  if (chance(w, 0.3)) emit(w, 'hired', `${f.name} hires ${r.name}.`, 0, { rats: [r.id] });
}
export function leave(w: World, r: Rat) {
  const f = w.firms.find((x) => x.id === r.firm); if (f) { f.workerIds = f.workerIds.filter((x) => x !== r.id); f.botIds = f.botIds.filter((x) => x !== r.id); }
  r.firm = 0; if (!r.rodentoid && r.role === 'worker') r.role = 'idle';
}
function fire(w: World, f: Firm, r: Rat, why: string) {
  leave(w, r); r.grievance = clamp01(r.grievance + 0.3); r.emo.anger = clamp01(r.emo.anger + 0.3); r.needs.status = clamp01(r.needs.status + 0.3);
  const boss = w.byId.get(f.boss); if (boss) { const rl = addRel(w, r, boss, -0.4, -0.4); if (why === 'machines') rl.k |= 256; }
  remember(w, r, 'fired', why === 'machines' ? `I was replaced by a rodentoid at ${f.name}.` : `${f.name} threw me out.`, -0.6, f.boss, why === 'machines');
  emit(w, why === 'machines' ? 'displacement' : 'fired', why === 'machines' ? `${r.name} is replaced by a rodentoid at ${f.name}.` : `${f.name} lets ${r.name} go (${why}).`, why === 'machines' ? 1 : 0, { rats: [r.id] });
}

/** daily labour market, firm accounts, mergers, busts, unions & strikes, rodentoid trade */
export function economyDaily(w: World) {
  const adults = w.rats.filter(isAdult); const pop = w.rats.length;
  // 1. new firms: enterprising rats see a gap
  const kinds = Object.keys(FIRM_SPEC) as FirmKind[];
  for (const r of adults) {
    if (r.firm || r.flags & (RF.king | RF.jailed | RF.outcast) || r.role === 'priest' || r.role === 'enforcer') continue;
    const drive = r.P.E * 0.4 + r.P.C * 0.3 + (1 - r.P.A) * 0.2 + r.genes.intellect * 0.1 + Math.min(1, r.food / 6) * 0.3;
    if (!chance(w, 0.025 * drive * drive)) continue;
    const opts = kinds.filter((k) => pop >= FIRM_SPEC[k].minPop && (!FIRM_SPEC[k].tech || r.knows.includes(FIRM_SPEC[k].tech!)) && w.firms.filter((f) => f.kind === k && f.status === 'open').length < (k === 'foragers' ? 3 : k === 'diggers' ? 2 : 1 + (pop > 120 ? 1 : 0)));
    if (!opts.length) continue;
    // intuition (what I know) + facts (what is missing)
    const k = opts.reduce((a, b) => (gap(w, b) + (r.knows.includes(FIRM_SPEC[b].tech ?? '') ? 0.3 : 0) + R(w) * 0.5 > gap(w, a) + R(w) * 0.5 ? b : a));
    foundFirm(w, r, k);
  }
  // 2. each firm: revenue, wages, profit, losses
  let wagesPaid = 0, wageN = 0;
  for (const f of w.firms) {
    if (f.status !== 'open' && f.status !== 'strike') continue;
    const boss = w.byId.get(f.boss);
    if (!boss || !boss.alive) { // succession: senior worker inherits, or the firm folds
      const heir = f.workerIds.map((id) => w.byId.get(id)).filter((x): x is Rat => !!x && x.alive && !x.rodentoid).sort((a, b) => b.P.C + b.P.E - a.P.C - a.P.E)[0];
      if (heir) { f.boss = heir.id; heir.flags |= RF.boss; f.workerIds = f.workerIds.filter((x) => x !== heir.id); heir.role = 'boss'; emit(w, 'firm_founded', `${heir.name} takes over ${f.name}.`, 0, { rats: [heir.id] }); }
      else { bust(w, f, 'its boss is gone'); continue; }
    }
    const workers = f.workerIds.map((id) => w.byId.get(id)).filter((x): x is Rat => !!x && x.alive);
    f.workerIds = workers.map((x) => x.id); f.botIds = f.botIds.filter((id) => w.byId.get(id)?.alive);
    f.workers = workers.filter((x) => !x.rodentoid).length; f.rodentoids = f.botIds.length;
    // revenue: crown contracts (from the granary), market sales (from wealthy rats), or goods already delivered (foragers)
    const out = f.output; f.output = 0;
    if (FIRM_SPEC[f.kind].crown) { const pay = Math.min(w.granary * 0.25, out * 0.12 + f.workers * 0.3); w.granary -= pay; f.wealth += pay; }
    else if (f.kind !== 'foragers') {
      const buyers = adults.filter((r) => r.food > 3 && r.firm !== f.id); const want = Math.min(buyers.length, Math.ceil(out * 0.05 + 1));
      for (let k = 0; k < want; k++) { const b = buyers[Math.floor(R(w) * buyers.length)]; const p = Math.min(b.food - 2, 0.4 + R(w) * 0.6); if (p > 0) { b.food -= p; f.wealth += p; } }
      if (f.kind === 'scrapworks') { const sc = out * 0.05; w.scrapPool += sc; f.wealth += sc * w.market.price * 0.2; }
    }
    // pay wages (food), striking workers get nothing
    const payroll = f.status === 'strike' ? 0 : f.wage * f.workers;
    if (f.wealth >= payroll) { f.wealth -= payroll; for (const x of workers) if (!x.rodentoid) { x.food += f.wage; wagesPaid += f.wage; wageN++; } f.lossDays = Math.max(0, f.lossDays - 1); }
    else { const share = f.wealth / Math.max(1, f.workers); for (const x of workers) if (!x.rodentoid) { x.food += share; x.grievance = clamp01(x.grievance + 0.15); } f.wealth = 0; f.lossDays++; wagesPaid += share * f.workers; wageN += f.workers; }
    // the boss takes profit
    if (boss && f.wealth > 3) { const take = (f.wealth - 3) * (0.3 + (1 - boss.P.A) * 0.5); boss.food += take; f.wealth -= take; }
    // wage drift: greed and monopoly push down, competition and unions push up
    const rivals = w.firms.filter((g) => g !== f && g.kind === f.kind && g.status === 'open').length;
    f.share = 1 / (1 + rivals);
    const target = (0.5 + (boss?.P.A ?? 0.5) * 0.6) * (rivals ? 1.15 : 0.8) * (f.union ? 1.25 : 1) * (f.rodentoids ? 0.8 : 1);
    f.wage = clamp(f.wage + (target - f.wage) * 0.15 + (R(w) - 0.5) * 0.05, 0.15, 3);
    // staffing: hire if profitable, fire if losing
    const want = Math.round(clamp(2 + gap(w, f.kind) * 10 + f.wealth / 4, 1, 22)) - f.rodentoids;
    if (f.workers < want && f.lossDays === 0) {
      const pool = adults.filter((r) => !r.firm && r.role !== 'king' && !(r.flags & (RF.jailed | RF.king | RF.boss)) && (r.role === 'idle' || r.role === 'none' || r.role === 'forager' || r.role === 'digger'));
      // rats choose among offers: wage (facts) and whether they like the boss / know rats there (intuition)
      for (let k = 0; k < Math.min(3, want - f.workers) && pool.length; k++) {
        const c = pool.splice(Math.floor(R(w) * pool.length), 1)[0]; const like = boss ? (c.rel.get(boss.id)?.aff ?? 0) : 0;
        const u = f.wage * 0.8 + like * 0.5 + (FIRM_SPEC[f.kind].task === 'forage' ? (c.skills.forage - 0.3) : 0) + c.P.C * 0.3 + (R(w) - 0.5) * 0.6;
        if (u > 0.35) hire(w, f, c);
      }
    } else if (f.lossDays >= 2 && f.workers > 1) { const v = workers.filter((x) => !x.rodentoid).sort((a, b) => a.P.C - b.P.C)[0]; if (v) fire(w, f, v, 'no food to pay'); }
    if (f.lossDays >= 5) bust(w, f, 'it ran out of food');
  }
  w.stats.wages = wageN ? wagesPaid / wageN : 0;
  // 3. mergers & monopolies
  for (const k of kinds) {
    const fs = w.firms.filter((f) => f.kind === k && f.status === 'open'); if (fs.length < 2) continue;
    fs.sort((a, b) => b.wealth - a.wealth); const big = fs[0], small = fs[fs.length - 1]; const bb = w.byId.get(big.boss);
    if (bb && big.wealth > small.wealth * 3 + 4 && chance(w, 0.15 * (1.2 - bb.P.A))) {
      big.wealth -= Math.min(big.wealth * 0.4, 4); for (const id of small.workerIds) { const r = w.byId.get(id); if (r) { r.firm = big.id; big.workerIds.push(id); } } big.botIds.push(...small.botIds);
      small.status = 'merged'; small.workerIds = []; const sb = w.byId.get(small.boss); if (sb) { sb.flags &= ~RF.boss; sb.firm = big.id; big.workerIds.push(sb.id); sb.role = 'worker'; remember(w, sb, 'firm', `${big.name} swallowed my ${small.name}.`, -0.5, big.boss, true); }
      emit(w, 'merger', `${big.name} swallows ${small.name}.`, 1, { rats: [big.boss, small.boss] });
      if (fs.length === 2) emit(w, 'monopoly', `${big.name} now owns all ${k} work. Wages fall.`, 2, { rats: [big.boss] });
    }
  }
  // 4. unions & strikes — only where grievance is real
  for (const f of w.firms) {
    if (f.status !== 'open' && f.status !== 'strike') continue;
    const ws = f.workerIds.map((id) => w.byId.get(id)).filter((x): x is Rat => !!x && x.alive && !x.rodentoid); if (ws.length < 3) continue;
    const g = ws.reduce((a, x) => a + x.grievance + x.insecurity * 0.7, 0) / ws.length;
    const boss = w.byId.get(f.boss);
    if (!f.union) {
      const lead = ws.filter((x) => x.P.E > 0.55 && x.beliefs.equality > 0.1).sort((a, b) => b.genes.charisma - a.genes.charisma)[0];
      if (lead && chance(w, clamp01(g - 0.25) * 0.5)) { f.union = lead.id; lead.flags |= RF.unionist; for (const x of ws) if (chance(w, 0.4 + x.beliefs.equality * 0.3)) x.flags |= RF.unionist;
        emit(w, 'union', `${lead.name} organises the workers of ${f.name} into a union.`, 1, { rats: [lead.id] }); remember(w, lead, 'union', `I founded the union at ${f.name}.`, 0.6, 0, true); }
    } else if (f.status === 'open') {
      const lead = w.byId.get(f.union); if (!lead || !lead.alive || lead.firm !== f.id) { f.union = 0; continue; }
      if (chance(w, clamp01(g - 0.35) * 0.6 * (lawOn(w, 'enforcers') ? 0.6 : 1))) {
        f.status = 'strike'; (f as any).strikeDay = w.tick;
        emit(w, 'strike', `The workers of ${f.name} lay down their tools. ${lead.name} leads the strike.`, 2, { rats: [lead.id, f.boss], fx: 'strike', sfx: 'crowd' });
      }
    } else if (f.status === 'strike' && boss) {
      // the boss answers from who they are and what they can do
      const bots = has(w, 'rodentoids') && w.firms.some((x) => x.kind === 'rodentoid_works' && x.status === 'open');
      const opts = { concede: boss.P.A * 0.8 + (f.wealth > 4 ? 0.3 : 0) - (1 - boss.P.A) * 0.2, fire: (1 - boss.P.A) * 0.5 + (bots ? 0.5 : 0), crush: (1 - boss.P.A) * 0.4 + (lawOn(w, 'enforcers') ? 0.4 : 0) + (w.king?.persona.cruelty ?? 0) * 0.3, wait: 0.3 + boss.P.N * 0.2 };
      const days = (w.tick - ((f as any).strikeDay ?? w.tick)) / 960; if (days < 1) continue;
      const pickK = (Object.keys(opts) as (keyof typeof opts)[]).reduce((a, b) => (opts[b] + R(w) * 0.4 > opts[a] + R(w) * 0.4 ? b : a));
      if (pickK === 'concede') { f.wage *= 1.35; f.status = 'open'; for (const x of ws) { x.grievance *= 0.5; x.emo.joy = clamp01(x.emo.joy + 0.3); } emit(w, 'strike', `${boss.name} gives in: ${f.name} raises wages. The strike ends.`, 1, { rats: [boss.id, f.union] }); }
      else if (pickK === 'fire') { const n = Math.ceil(ws.length / 2); for (const x of ws.filter((x) => x.flags & RF.unionist).slice(0, n)) fire(w, f, x, 'striking'); f.status = 'open'; f.union = 0; emit(w, 'strike', `${boss.name} throws the strikers out of ${f.name}.`, 2, { rats: [boss.id] }); }
      else if (pickK === 'crush') { f.status = 'open'; for (const x of ws) { x.emo.fear = clamp01(x.emo.fear + 0.4); x.grievance = clamp01(x.grievance + 0.2); if (chance(w, 0.2)) { x.injured = Math.max(x.injured, 0.5); remember(w, x, 'crushed', `Enforcers broke our strike at ${f.name}.`, -0.8, boss.id, true); } }
        emit(w, 'crackdown', `Enforcers break the strike at ${f.name}.`, 2, { rats: [boss.id, f.union], fx: 'riot' }); w.stats.trust = clamp01(w.stats.trust - 0.05); }
      else if (days > 4) { f.status = 'open'; for (const x of ws) x.grievance *= 0.8; emit(w, 'strike', `The strike at ${f.name} fizzles out after ${Math.floor(days)} days.`, 1, { rats: [f.union] }); }
    }
  }
  // 5. rodentoids: built by RI works, bought by firms whose wages make them worthwhile
  const works = w.firms.filter((f) => f.kind === 'rodentoid_works' && f.status === 'open');
  for (const rw of works) {
    if (!has(w, 'rodentoids') || !has(w, 'sparks')) continue;
    const cost = 6; if (w.scrapPool < cost && rw.wealth < 4) continue;
    if (w.scrapPool >= cost) w.scrapPool -= cost; else rw.wealth -= 4;
    const buyers = w.firms.filter((f) => f.status === 'open' && FIRM_SPEC[f.kind].botable && f !== rw && f.wealth > 5 && f.wage * 8 > 5).sort((a, b) => b.wealth - a.wealth);
    const buyer = buyers[0] ?? null; const ws = workshopSpot(w);
    const bot = newRat(w, { rodentoid: true, model: Math.floor(R(w) * 4), edge: ws?.edge, s: ws?.s }); bot.role = 'worker'; bot.dynasty = 0;
    emit(w, 'rodentoid_built', `${rw.name} builds ${bot.name}, a rodentoid.`, w.rats.filter((x) => x.rodentoid).length <= 1 ? 3 : 1, { rats: [bot.id], x: bot.x, y: bot.y, fx: 'spark', sfx: 'machine', card: w.rats.filter((x) => x.rodentoid).length <= 1 ? 'The first rodentoid walks.' : undefined });
    if (buyer) {
      buyer.wealth -= 5; rw.wealth += 5; bot.firm = buyer.id; buyer.botIds.push(bot.id); buyer.workerIds.push(bot.id);
      // displacement: the buyer lets a worker go — who it is depends on the boss
      const humanless = buyer.workerIds.map((id) => w.byId.get(id)).filter((x): x is Rat => !!x && x.alive && !x.rodentoid);
      if (humanless.length > 1 && chance(w, 0.75)) { const v = humanless.sort((a, b) => (a.flags & RF.unionist ? -1 : 0) - (b.flags & RF.unionist ? -1 : 0) || a.skills.dig - b.skills.dig)[0]; fire(w, buyer, v, 'machines'); }
      for (const x of humanless) x.insecurity = clamp01(x.insecurity + 0.15 + x.P.N * 0.15);
    } else { bot.firm = rw.id; rw.botIds.push(bot.id); rw.workerIds.push(bot.id); }
  }
  // 6. attitudes to the machines: some rats welcome the rest, others feel the ground move
  if (w.rats.some((r) => r.rodentoid)) for (const r of adults) {
    const exposed = r.firm && FIRM_SPEC[w.firms.find((f) => f.id === r.firm)?.kind ?? 'foragers']?.botable;
    const comfortable = wealth(w, r) > 6 || lawOn(w, 'open_granary');
    r.insecurity = clamp01(r.insecurity * 0.97 + (exposed ? 0.02 + r.P.N * 0.03 : 0) - (comfortable ? 0.03 : 0) + (!r.firm ? 0.02 : 0));
    if (comfortable && !r.firm && chance(w, 0.02)) r.emo.joy = clamp01(r.emo.joy + 0.2); // leisure
  }
  // 7. market: food price in scrap follows scarcity
  const supply = w.granary + adults.reduce((a, r) => a + r.food, 0); const demand = Math.max(1, pop * 1.2);
  w.market.supply = supply; w.market.demand = demand; w.market.price = clamp(w.market.price * 0.7 + 0.3 * clamp(demand / Math.max(1, supply) * 1.2, 0.2, 8), 0.2, 8);
  // employment
  const ad = adults.filter((r) => !(r.flags & (RF.king | RF.jailed)));
  w.stats.unemployment = ad.length ? ad.filter((r) => !r.firm && !['enforcer', 'priest', 'healer', 'herald', 'courtier', 'boss', 'scribe'].includes(r.role)).length / ad.length : 0;
  for (const r of ad) if (!r.firm && w.firms.length) r.grievance = clamp01(r.grievance + 0.01 + r.P.N * 0.01);
}
function bust(w: World, f: Firm, why: string) {
  f.status = 'bust'; for (const id of f.workerIds) { const r = w.byId.get(id); if (r) { r.firm = 0; if (r.rodentoid) r.role = 'idle'; else { r.role = 'idle'; r.grievance = clamp01(r.grievance + 0.2); } } }
  const b = w.byId.get(f.boss); if (b) { b.flags &= ~RF.boss; b.firm = 0; b.role = 'idle'; remember(w, b, 'bust', `${f.name} went bust.`, -0.7, 0, true); }
  f.workerIds = []; emit(w, 'firm_bust', `${f.name} goes bust — ${why}.`, 1, { rats: [f.boss] });
}
/** how much the colony lacks what this kind of firm provides (0..1) */
export function gap(w: World, k: FirmKind): number {
  const pop = Math.max(1, w.rats.length); const n = w.firms.filter((f) => f.kind === k && f.status === 'open').reduce((a, f) => a + f.workers + f.rodentoids, 0);
  const need: Record<FirmKind, number> = { foragers: 0.35, diggers: 0.12 + w.digQueue.length * 0.02, scrapworks: 0.06, granary: 0.04, healers: 0.05 + w.rats.filter((r) => r.disease).length / pop, builders: has(w, 'shoring') ? 0.05 : 0, wheelworks: 0.04, smithy: 0.04, sparkworks: 0.05, rodentoid_works: 0.04, scribes: 0.04, brewers: 0.03, traders: 0.04, guards: w.stats.crime > 1 ? 0.05 : 0.01 };
  return clamp01(need[k] - n / pop) * 3;
}
function workshopSpot(w: World) { const c = anyChamber(w, 'workshop') ?? anyChamber(w, 'nest'); return c ? spotIn(w, c) : null; }
export const techName = (id: string) => TECH_BY_ID[id]?.name ?? id;
