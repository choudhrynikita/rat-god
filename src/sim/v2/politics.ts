/** Factions (emergent from shared beliefs + grievance + kin + faith), propaganda, coups, assassinations, reform petitions,
 *  parties, the council and elections, lobbying & corruption, and the atheist 'prove-reality' movement's organisation. */
import { RF, type FactionKind } from './contract';
import { R, RK, chance, clamp, clamp01, day, emit, pick, type Faction, type Party, type Rat, type World } from './state';
import { kill, remember } from './rats';
import { startRumour } from './social';
import { lawOn, succession, crown, LAW2 } from './laws2';
import { battle } from './combat';
import { anyChamber } from './places';

const isAdult = (r: Rat) => r.alive && !r.rodentoid && r.stageN >= 2 && !(r.flags & RF.jailed);
const COLORS: Record<FactionKind, number[]> = { royalists: [0xd4a020, 0xe0c040], zealots: [0xf0f0d0, 0xc8b8ff], dissidents: [0xc03030, 0xe05050], reformers: [0x40a0e0, 0x60c0a0], guild: [0x9a7040, 0xb08050], gang: [0x505050, 0x803080], cult: [0x8040c0, 0x40c0c0], clan: [0x60a040, 0xa06040], atheists: [0x808890, 0xb0b8c0], caste: [0x706050, 0x907060] };
const AIMS: Record<FactionKind, string[]> = {
  royalists: ['LONG LIVE THE KING', 'THE CROWN IS ORDER'], zealots: ['THE GOD ABOVE THE CROWN', 'PURGE THE UNBELIEVERS', 'OBEY THE SIGNS'],
  dissidents: ['OVERTHROW THE KING', 'NO MORE CROWNS', 'BREAD BEFORE THRONES'], reformers: ['A COUNCIL FOR ALL', 'FAIR SHARES', 'LAWS BY VOTE'],
  guild: ['PAWS BEFORE PROFIT', 'FAIR WAGES'], gang: ['TAKE WHAT YOU CAN', 'THE TUNNELS ARE OURS'], cult: ['THE PROPHET SPEAKS TRUE', 'THE END COMES'],
  clan: ['BLOOD FIRST', 'OUR HOUSE WILL RULE'], atheists: ['PROVE THE WORLD IS REAL', 'THERE IS NO SKY-RAT', 'WE ARE NOT TOYS'], caste: ['BREAK THE LINES', 'KEEP THE LINES'],
};
const NAMES: Record<FactionKind, string[]> = {
  royalists: ['THE LOYAL PAWS', 'CROWN GUARD', 'THE THRONE-FAITHFUL'], zealots: ['THE KNEELERS', 'SKY-WATCHERS', 'THE LISTENERS'],
  dissidents: ['THE GNAWERS', 'RED TAILS', 'THE UNCROWNED'], reformers: ['THE OPEN BURROW', 'FAIR SHARE', 'THE MANY PAWS'],
  guild: ['THE TUNNEL GUILD', 'COMMON PAW'], gang: ['THE SHIVS', 'GUTTER KNIVES', 'BLACK WHISKERS'], cult: ['THE HALO', 'THE CHOSEN'],
  clan: ['THE BLOOD OF', 'SONS AND DAUGHTERS OF'], atheists: ['THE REAL', 'EMPTY SKY', 'THE PROVERS'], caste: ['THE LINE-BREAKERS', 'THE PURE'],
};
function classify(w: World, r: Rat): FactionKind | null {
  const b = r.beliefs;
  if (b.god < -0.45 && (w.godRejection > 0.25 || r.mem.some((m) => m.kind === 'god_wrath'))) return 'atheists';
  if (b.god > 0.6 && (r.flags & (RF.zealot | RF.prophet) || r.religion)) return r.flags & RF.prophet ? 'cult' : 'zealots';
  if (b.crown > 0.55) return 'royalists';
  if (b.crown < -0.4 && (r.grievance > 0.3 || r.emo.anger > 0.4)) return 'dissidents';
  if (b.equality > 0.4 && b.crown > -0.4) return 'reformers';
  if (r.crimes >= 2 && r.P.A < 0.4) return 'gang';
  if (r.flags & RF.unionist) return 'guild';
  if (b.kin > 0.6 && r.dynasty && r.dynasty !== (w.byId.get(w.kingId)?.dynasty ?? -1)) return 'clan';
  if (w.casteEra && r.grievance > 0.5 && w.castes.some((c) => c.id === r.caste && c.rank >= w.castes.length - 2)) return 'caste';
  return null;
}
function centroid(ms: Rat[]) { const s = { crown: 0, god: 0, equality: 0, order: 0 }; for (const r of ms) { s.crown += r.beliefs.crown; s.god += r.beliefs.god; s.equality += r.beliefs.equality; s.order += r.beliefs.order; } const n = Math.max(1, ms.length); return { crown: s.crown / n, god: s.god / n, equality: s.equality / n, order: s.order / n }; }

export function factionsDaily(w: World) {
  const adults = w.rats.filter(isAdult); if (adults.length < 8) return;
  // 1. emergence: a charismatic rat with ≥3 like-minded friends founds one
  for (const r of adults) {
    if (r.faction) continue; const k = classify(w, r); if (!k) continue;
    if (w.factions.some((f) => f.kind === k && f.memberIds.length > 0 && k !== 'clan' && k !== 'gang')) {
      // join an existing one: affinity to the leader and closeness of belief
      const f = w.factions.find((x) => x.kind === k)!; const L = w.byId.get(f.leader); const aff = L ? (r.rel.get(L.id)?.aff ?? 0) : 0;
      if (chance(w, clamp01(0.08 + aff * 0.3 + r.P.E * 0.05 + (r.emo.anger * 0.1)))) { r.faction = f.id; f.memberIds.push(r.id); if (chance(w, 0.15)) emit(w, 'faction_joined', `${r.name} joins ${f.name}.`, 0, { rats: [r.id] }); }
      continue;
    }
    const friends = [...r.rel].filter(([id, x]) => x.aff > 0.3 && (() => { const o = w.byId.get(id); return !!o && isAdult(o) && classify(w, o) === k; })()).length;
    if (friends < 3 || !chance(w, 0.05 + r.genes.charisma * 0.1 + (r.flags & RF.leader ? 0.1 : 0))) continue;
    const base = pick(w, NAMES[k]); const name = k === 'clan' ? `${base} ${w.dyns.find((d) => d.id === r.dynasty)?.name.replace('HOUSE ', '') ?? r.name}` : w.factions.some((f) => f.name === base) ? `${base} ${['II', 'NEW', 'TRUE'][Math.floor(R(w) * 3)]}` : base;
    const f: Faction = { id: ++w.nextFaction, kind: k, name, leader: r.id, members: 1, color: pick(w, COLORS[k]), creed: pick(w, AIMS[k]), strength: 0, founded: w.tick, parent: 0, stance: { crown: r.beliefs.crown, god: r.beliefs.god, equality: r.beliefs.equality, order: r.beliefs.order }, aims: pick(w, AIMS[k]), memberIds: [r.id] };
    w.factions.push(f); r.faction = f.id; r.flags |= RF.leader;
    for (const [id, x] of r.rel) { const o = w.byId.get(id); if (o && !o.faction && x.aff > 0.3 && isAdult(o) && classify(w, o) === k) { o.faction = f.id; f.memberIds.push(o.id); } }
    remember(w, r, 'faction', `I founded ${f.name}: ${f.aims}.`, 0.8, 0, true);
    emit(w, 'faction_formed', `${r.name} founds ${f.name}. Their cry: "${f.aims}"`, k === 'dissidents' || k === 'atheists' ? 2 : 1, { rats: [r.id], fx: 'banner' });
  }
  // 2. upkeep: members, strength, leaving, schism
  const pop = adults.length;
  for (const f of w.factions) {
    f.memberIds = f.memberIds.filter((id) => { const r = w.byId.get(id); if (!r || !r.alive || r.faction !== f.id) return false; if (classify(w, r) !== f.kind && chance(w, 0.06)) { r.faction = 0; return false; } return true; });
    f.members = f.memberIds.length;
    const ms = f.memberIds.map((id) => w.byId.get(id)!);
    f.stance = centroid(ms);
    f.strength = clamp01(ms.reduce((s, r) => s + 0.5 + r.genes.charisma * 0.5 + r.skills.fight * 0.3, 0) / Math.max(1, pop) * 1.3);
    const L = w.byId.get(f.leader); if (!L || !L.alive || L.faction !== f.id) { const nl = ms.sort((a, b) => b.genes.charisma - a.genes.charisma)[0]; if (nl) { f.leader = nl.id; nl.flags |= RF.leader; emit(w, 'faction_joined', `${nl.name} now leads ${f.name}.`, 0, { rats: [nl.id] }); } }
    // schism: a rival with a following and different views splits off
    if (f.members >= 10 && chance(w, 0.03)) {
      const leader = w.byId.get(f.leader)!; const rival = ms.filter((r) => r !== leader && (r.rel.get(leader.id)?.aff ?? 0) < -0.1).sort((a, b) => b.genes.charisma - a.genes.charisma)[0];
      if (rival) { const follow = ms.filter((r) => r !== leader && (r.rel.get(rival.id)?.aff ?? 0) > (r.rel.get(leader.id)?.aff ?? 0));
        if (follow.length >= 3) {
          const nf: Faction = { ...f, id: ++w.nextFaction, name: `TRUE ${f.name.replace(/^THE /, '')}`, leader: rival.id, founded: w.tick, parent: f.id, aims: pick(w, AIMS[f.kind]), color: pick(w, COLORS[f.kind]), memberIds: follow.map((r) => r.id), members: follow.length };
          for (const r of follow) r.faction = nf.id; f.memberIds = f.memberIds.filter((id) => !follow.some((r) => r.id === id)); w.factions.push(nf);
          emit(w, 'schism', `${f.name} splits. ${rival.name} leads ${follow.length} away to found ${nf.name}.`, 2, { rats: [rival.id, leader.id] });
        } }
    }
  }
  w.factions = w.factions.filter((f) => f.memberIds.length > 0 || w.tick - f.founded < 960);
  // 3. actions
  const king = w.byId.get(w.kingId); const L = w.stats.legitimacy;
  for (const f of w.factions) {
    const lead = w.byId.get(f.leader); if (!lead || !lead.alive || f.members < 3) continue;
    const ms = f.memberIds.map((id) => w.byId.get(id)!).filter(Boolean);
    // propaganda
    if ((f.kind === 'dissidents' || f.kind === 'atheists' || f.kind === 'reformers') && king && chance(w, 0.3 * (lawOn(w, 'silence_law') ? 0.3 : 1))) {
      const claim = pick(w, ['hoarder', 'traitor', 'plotting'] as const); startRumour(w, lead, king.id, claim, (king as any).plate > 1.3 && claim === 'hoarder', 0.7);
      if (chance(w, 0.3)) emit(w, 'propaganda', `${f.name} whisper that the king is a ${claim}.`, 0, { rats: [lead.id] });
    }
    if (f.kind === 'royalists' && king && chance(w, 0.2)) startRumour(w, lead, king.id, 'kind', true, 0.6);
    // coup: when dissidents (or a clan, or zealots against a godless king) outweigh legitimacy and the guard
    const guard = (lawOn(w, 'royal_guard') ? 0.25 : 0) + w.factions.filter((x) => x.kind === 'royalists').reduce((s, x) => s + x.strength, 0);
    const motive = f.kind === 'dissidents' || f.kind === 'clan' || (f.kind === 'zealots' && king && (w.king as any)?.stance === 'at_war') || (f.kind === 'atheists' && king && king.beliefs.god > 0.5);
    if (king && motive && f.strength > 0.12 && !w.gathering && chance(w, clamp01((f.strength - guard * 0.6 - L * 0.25) * 0.6))) {
      if (lead.P.A < 0.35 && chance(w, 0.5)) { // assassination instead of open revolt
        const killer = ms.filter((r) => r.skills.fight > 0.3 && r.P.A < 0.5).sort((a, b) => b.skills.fight - a.skills.fight)[0] ?? lead;
        const caught = chance(w, 0.35 + (lawOn(w, 'royal_guard') ? 0.3 : 0) + (lawOn(w, 'secret_police') ? 0.2 : 0));
        if (!caught) { kill(w, king, 'murder', killer.id, true); emit(w, 'assassination', `${killer.name} of ${f.name} slips into the throne hall and murders King ${king.name}.`, 3, { rats: [killer.id, king.id], mature: ['violence'], card: 'The king is dead.' }); remember(w, killer, 'regicide', 'I killed the king.', 0.5, king.id, true); }
        else { emit(w, 'assassination', `${killer.name} of ${f.name} is caught with a blade at the throne hall.`, 2, { rats: [killer.id, king.id] }); killer.suspicion = 1; w.crimes.push({ tick: w.tick, by: killer.id, victim: king.id, kind: 'treason', x: killer.x, y: killer.y, witnessed: [king.id], solved: true }); }
      } else coup(w, f, ms, king);
    }
    // reform petition: reformers press the king/council for a law that matches their creed
    if (f.kind === 'reformers' && chance(w, 0.15)) { const ask = pick(w, ['free_election', 'open_granary', 'rest_day', 'free_squeak', 'tithe_holiday', 'schooling']); (w as any).councilAsk = ask; emit(w, 'reform', `${f.name} petition for ${LAW2[ask]?.name ?? ask}.`, 1, { rats: [lead.id] }); if (!w.council && f.strength > 0.25 && chance(w, 0.25)) formCouncil(w, `${f.name}'s petition`); }
    // gangs: protection, extortion
    if (f.kind === 'gang' && chance(w, 0.2)) { const v = w.rats.find((r) => isAdult(r) && !r.faction && r.food > 3); if (v) { const amt = Math.min(2, v.food * 0.4); v.food -= amt; lead.food += amt; w.crimes.push({ tick: w.tick, by: lead.id, victim: v.id, kind: 'extortion', x: v.x, y: v.y, witnessed: [], solved: false }); emit(w, 'theft', `${f.name} squeeze ${v.name} for food.`, 0, { rats: [lead.id, v.id] }); } }
    // dynastic feuds: clans fight
  }
  // feuds between houses flare into fights
  const feuds = ((w as any).feuds ?? []) as { a: number; b: number; since: number; heat: number }[];
  for (const fd of feuds) { fd.heat *= 0.97; if (fd.heat > 0.3 && chance(w, fd.heat * 0.1)) { const A = w.rats.filter((r) => r.dynasty === fd.a && isAdult(r)), B = w.rats.filter((r) => r.dynasty === fd.b && isAdult(r)); if (A.length && B.length) battle(w, A.slice(0, 4), B.slice(0, 4), `A blood feud between ${w.dyns.find((d) => d.id === fd.a)?.name} and ${w.dyns.find((d) => d.id === fd.b)?.name} spills into the tunnels`); } }
  (w as any).feuds = feuds.filter((f) => f.heat > 0.1);
}
function coup(w: World, f: Faction, ms: Rat[], king: Rat) {
  const loyal = w.rats.filter((r) => isAdult(r) && (r.beliefs.crown > 0.4 || r.flags & RF.enforcer || w.factions.find((x) => x.id === r.faction)?.kind === 'royalists'));
  const throne = anyChamber(w, 'throne');
  emit(w, 'coup', `${f.name} rise against King ${king.name}! ${ms.length} storm the throne hall.`, 3, { rats: [f.leader, king.id], chamber: throne?.id, fx: 'riot', sfx: 'crowd' });
  const res = battle(w, ms.slice(0, 30), [king, ...loyal.slice(0, 30)], `The battle for the throne hall`, throne ? { x: throne.cx, y: throne.cy, chamber: throne.id } : undefined);
  if (res.winner === 'A' && king.alive) {
    const lead = w.byId.get(f.leader); const spare = lead && lead.P.A > 0.6 && chance(w, 0.4);
    if (spare) { king.flags &= ~RF.king; king.flags |= RF.outcast; emit(w, 'coup', `King ${king.name} is thrown down and cast out, alive.`, 3, { rats: [king.id] }); w.kingDied = { id: king.id, cause: 'deposed', by: f.leader }; }
    else { kill(w, king, 'executed', f.leader, true); emit(w, 'regicide', `The rebels drag King ${king.name} from the throne and kill him.`, 3, { rats: [king.id, f.leader], mature: ['violence'] }); }
    if (lead && lead.alive && chance(w, 0.6)) (w as any).nextKing = lead.id;
    if (f.kind === 'reformers' || (lead && lead.beliefs.equality > 0.4)) formCouncil(w, 'the revolution');
  } else if (king.alive) {
    emit(w, 'coup', `The coup fails. ${f.name} are broken; King ${king.name} holds the throne.`, 2, { rats: [king.id, f.leader] });
    for (const r of ms) { r.suspicion = clamp01(r.suspicion + 0.5); if (chance(w, 0.3)) w.crimes.push({ tick: w.tick, by: r.id, victim: king.id, kind: 'treason', x: r.x, y: r.y, witnessed: [king.id], solved: true }); }
    w.stats.legitimacy = clamp01(w.stats.legitimacy + 0.05);
  }
}

// ───────────── council, parties, elections ─────────────
const PLATFORMS: [string, (r: Rat) => number, string][] = [
  ['OPEN THE GRANARY', (r) => r.beliefs.equality + r.needs.hunger * 0.5, 'open_granary'], ['BAN THE MACHINES', (r) => r.insecurity * 1.5 - 0.3, 'ban_machines'],
  ['THE GOD ABOVE THE CROWN', (r) => r.beliefs.god - r.beliefs.crown * 0.3, 'state_faith'], ['ORDER IN THE TUNNELS', (r) => r.beliefs.order, 'enforcers'],
  ['REST FOR THE TIRED', (r) => r.grievance - r.beliefs.order * 0.3, 'rest_day'], ['GEARS FEED US ALL', (r) => -r.insecurity + (r.knows.includes('automata') ? 0.5 : 0), 'machine_tithe'],
  ['SLATES FOR PUPS', (r) => r.skills.lore + r.P.O * 0.3 - 0.4, 'schooling'], ['BLOOD AND HOUSE', (r) => r.beliefs.kin, 'royal_guard'], ['NO SKY-RAT', (r) => -r.beliefs.god - 0.3, 'ban_faith'],
];
export function formCouncil(w: World, why: string) {
  if (w.council) return; const seats = 5 + 2 * Math.floor(Math.min(6, w.rats.length / 40));
  w.council = { seats, parties: [], nextElection: w.tick + 960 * 2, speaker: 0, lastVote: null };
  emit(w, 'council', `A council of ${seats} seats is formed, after ${why}. The king must now hear it.`, 3, { card: 'council' });
}
export function partiesDaily(w: World) {
  if (!w.council && (w.stats.legitimacy < 0.3 && w.factions.some((f) => f.kind === 'reformers' && f.strength > 0.2) && chance(w, 0.05))) formCouncil(w, 'the king lost the city\'s trust');
  if (!w.council && lawOn(w, 'free_election')) formCouncil(w, 'the free-election law');
  if (!w.council) return;
  const ad = w.rats.filter(isAdult); const banned = lawOn(w, 'ban_parties');
  // party founding: an ambitious, talkative rat with a platform many share
  if (!banned && w.parties.filter((p) => !p.banned).length < 5 && chance(w, 0.25)) {
    const cand = ad.filter((r) => !r.party && r.P.E > 0.5 && r.skills.talk > 0.3).sort((a, b) => b.genes.charisma - a.genes.charisma)[0];
    if (cand) { const plats = PLATFORMS.map(([n, f]) => [n, f(cand)] as const).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n]) => n);
      if (!w.parties.some((p) => p.platform[0] === plats[0] && !p.banned)) {
        const p: Party = { id: ++w.nextParty, name: pick(w, ['THE ', '']) + pick(w, ['PAW', 'TAIL', 'BURROW', 'GRAIN', 'IRON', 'SKY', 'DEEP', 'COMMON', 'NEW']) + ' ' + pick(w, ['PARTY', 'FRONT', 'LEAGUE', 'UNION', 'MOVEMENT']), leader: cand.id, members: 1, platform: plats, color: Math.floor(R(w) * 0xffffff), seats: 0, corrupt: 0, patron: 0, founded: w.tick, banned: false, memberIds: [cand.id], axis: plats[0], dir: 1 };
        w.parties.push(p); cand.party = p.id; emit(w, 'party_formed', `${cand.name} founds ${p.name}: "${plats.join(' / ')}".`, 1, { rats: [cand.id] }); } }
  }
  for (const p of w.parties) {
    if (banned && !p.banned) { p.banned = true; emit(w, 'crackdown', `${p.name} is banned by the crown.`, 2, {}); for (const id of p.memberIds) { const r = w.byId.get(id); if (r) { r.grievance = clamp01(r.grievance + 0.2); r.suspicion = clamp01(r.suspicion + 0.2); } } }
    if (!banned && p.banned && chance(w, 0.2)) p.banned = false;
    // membership by platform affinity
    for (const r of ad) if (!r.party && chance(w, 0.03)) { const fit = PLATFORMS.filter(([n]) => p.platform.includes(n)).reduce((s, [, f]) => s + f(r), 0); if (fit > 0.5) { r.party = p.id; p.memberIds.push(r.id); } }
    p.memberIds = p.memberIds.filter((id) => w.byId.get(id)?.alive && w.byId.get(id)!.party === p.id); p.members = p.memberIds.length;
    // lobbying: a rich firm buys a party whose platform suits it
    if (!p.patron && chance(w, 0.05)) { const firm = w.firms.filter((f) => f.status === 'open' && f.wealth > 10).sort((a, b) => b.wealth - a.wealth)[0];
      if (firm && (p.platform.includes('GEARS FEED US ALL') ? firm.kind === 'rodentoid_works' : true) && chance(w, 0.4)) { p.patron = firm.id; firm.wealth -= 3; const L = w.byId.get(p.leader); if (L) L.food += 3; p.corrupt = clamp01(p.corrupt + 0.25); emit(w, 'lobby', `${firm.name} quietly funds ${p.name}.`, 1, { rats: [firm.boss, p.leader] }); } }
    if (p.patron && chance(w, 0.02 * (1 + p.corrupt))) { emit(w, 'corruption', `It comes out that ${p.name} is paid by ${w.firms.find((f) => f.id === p.patron)?.name ?? 'a firm'}.`, 2, { rats: [p.leader] }); for (const id of p.memberIds) { const r = w.byId.get(id); if (r && chance(w, 0.3)) { r.party = 0; } } p.patron = 0; }
  }
  w.parties = w.parties.filter((p) => p.members > 0 || w.tick - p.founded < 960 * 2);
  // elections
  const c = w.council;
  if (w.tick >= c.nextElection && w.parties.some((p) => !p.banned)) {
    const votes = new Map<number, number>(); let turnout = 0;
    for (const r of ad) {
      if (!chance(w, 0.5 + r.P.C * 0.3)) continue; turnout++;
      let best = 0, bv = -Infinity;
      for (const p of w.parties) { if (p.banned) continue; const L = w.byId.get(p.leader);
        // intuition (the leader's charm, kin, caste) + facts (does the platform serve me) + noise
        const fit = PLATFORMS.filter(([n]) => p.platform.includes(n)).reduce((s, [, f]) => s + f(r), 0);
        const charm = L ? (r.rel.get(L.id)?.aff ?? 0) * 0.6 + L.genes.charisma * 0.4 + (L.caste === r.caste ? 0.2 : 0) + (L.dynasty === r.dynasty ? 0.2 : 0) : 0;
        const v = fit * (0.4 + r.P.C * 0.4) + charm * (0.6 - r.P.C * 0.3) + (p.patron ? 0.15 : 0) + (R(w) - 0.5) * 0.6; if (v > bv) { bv = v; best = p.id; } }
      if (best) votes.set(best, (votes.get(best) ?? 0) + 1);
    }
    const total = [...votes.values()].reduce((a, b) => a + b, 0) || 1; let left = c.seats; const alloc: [number, number][] = [];
    const ranked = [...votes].sort((a, b) => b[1] - a[1]);
    for (const [pid, v] of ranked) { const s = Math.min(left, Math.round((v / total) * c.seats)); if (s > 0) { alloc.push([pid, s]); left -= s; } }
    if (left > 0 && alloc.length) alloc[0][1] += left;
    c.parties = alloc; for (const p of w.parties) p.seats = alloc.find(([id]) => id === p.id)?.[1] ?? 0;
    const top = w.parties.find((p) => p.id === alloc[0]?.[0]); c.speaker = top?.leader ?? 0; c.nextElection = w.tick + 960 * 20;
    if (top) { const law = PLATFORMS.find(([n]) => n === top.platform[0])?.[2]; (w as any).councilAsk = law; c.lastVote = top.platform[0]; }
    emit(w, 'election', `Election day: ${turnout} vote. ${alloc.map(([id, s]) => `${w.parties.find((p) => p.id === id)?.name} ${s}`).join(', ')}.${top ? ` ${w.byId.get(top.leader)?.name ?? ''} speaks for the council.` : ''}`, 2, { rats: top ? [top.leader] : [], sfx: 'crowd' });
  }
  // the council can depose a hated king
  const king = w.byId.get(w.kingId);
  if (king && c.speaker && w.stats.legitimacy < 0.15 && chance(w, 0.04)) { king.flags &= ~RF.king; w.kingDied = { id: king.id, cause: 'deposed', by: c.speaker }; emit(w, 'coup', `The council votes King ${king.name} off the throne.`, 3, { rats: [king.id, c.speaker] }); }
}
export function politicsSuccession(w: World) {
  const nk = (w as any).nextKing as number | undefined; delete (w as any).nextKing;
  const r = nk ? w.byId.get(nk) : undefined; if (r && r.alive) { crown(w, r, 'by the revolt'); return; }
  succession(w, 'vacancy');
}
void RK; void day; void clamp;
