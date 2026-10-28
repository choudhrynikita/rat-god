/** Faith becomes an institution: a shrine, a prophet, or enough unanswered prayers founds a religion.
 *  Members gather, a feast day is kept, and a bitter rival can split the faith. */
import { RF, type ReligionInfo } from './contract';
import { anyChamber } from './places';
import { R, chance, clamp01, day, emit, type Rat, type Religion, type World } from './state';

const DEITIES: ReligionInfo['deity'][] = ['the Unseen', 'the Ancestors', 'the Flood', 'the Crown', 'the Machine'];
const NAMES: Record<ReligionInfo['deity'], string[]> = {
  'the Unseen': ['THE LISTENERS', 'THE QUIET ABOVE'],
  'the Ancestors': ['THE OLD ONES', 'HOUSE OF BONES'],
  'the Flood': ['THE DRAIN SAINTS', 'THE WET PRAYER'],
  'the Crown': ['THE LOYAL KNEEL', 'THRONE AND TOOTH'],
  'the Machine': ['THE SPARK CULT', 'GEAR AND GOSPEL'],
  'the Giants': ['THE BOOT WATCH'],
  'the White Place': ['THE PALE RETURN'],
};
const CREED: Record<ReligionInfo['deity'], string[]> = {
  'the Unseen': ['THE SKY HEARS', 'PRAY BEFORE THE MEAL'],
  'the Ancestors': ['THE DEAD STILL VOTE', 'BURY WHAT YOU LOVED'],
  'the Flood': ['WATER REMEMBERS', 'NEVER DIG UNDER A DRIP'],
  'the Crown': ['THE KING IS THE ALTAR', 'TITHE THE FIRST CRUMB'],
  'the Machine': ['THE WHEEL IS HOLY', 'DO NOT FEAR THE SPARK'],
  'the Giants': ['STAY OFF THE STREET AT NOON'],
  'the White Place': ['THE TAGGED ONES CAME FROM LIGHT'],
};

export function faithDaily(w: World) {
  w.festivals = w.festivals.filter((f) => f.endsAt > w.tick);
  if (w.founding && w.founding.stage !== 'done') return;
  if (!w.religions.length) { maybeFound(w); return; }
  recruit(w);
  sermon(w);
  feast(w);
  schism(w);
}

function devout(w: World): Rat[] {
  return w.rats.filter((r) => r.alive && !r.rodentoid && r.stageN >= 2).sort((a, b) => b.beliefs.god - a.beliefs.god);
}

function maybeFound(w: World) {
  if (day(w) < 4) return;
  const rats = devout(w); const lead = rats[0]; if (!lead) return;
  const shrine = w.chambers.find((c) => c.kind === 'shrine' || c.kind === 'temple');
  const prayed = w.prayers.length > 0 || (w.chron.counts.prayer ?? 0) > 0;
  if (lead.beliefs.god < 0.22 && !shrine && !prayed && !(lead.flags & RF.prophet)) return;
  const deity = lead.flags & RF.prophet ? 'the Unseen' : lead.beliefs.crown > 0.45 ? 'the Crown' : shrine ? 'the Ancestors' : DEITIES[Math.floor(R(w) * 5)];
  const rel: Religion = {
    id: ++w.nextRel, name: NAMES[deity][0], deity, doctrine: CREED[deity],
    founder: lead.id, prophet: lead.id, members: 1, temples: shrine ? [shrine.id] : [],
    tolerance: clamp01(lead.P.A) * 2 - 1, enemies: [], parent: 0, founded: w.tick,
    color: deity === 'the Machine' ? 0x45eaf0 : deity === 'the Flood' ? 0x42c3ca : 0xf2b46a,
    memberIds: [lead.id],
  };
  w.religions.push(rel);
  lead.religion = rel.id; lead.flags |= RF.priest; lead.role = 'priest';
  for (const r of rats.slice(1, 6)) if (r.beliefs.god > 0.15 || prayed) { r.religion = rel.id; rel.memberIds.push(r.id); }
  rel.members = rel.memberIds.length;
  emit(w, 'religion_founded', `${lead.name} founds ${rel.name}. They kneel to ${rel.deity}. ${rel.doctrine[0]}.`, 2, { rats: [lead.id], chamber: shrine?.id, x: shrine?.cx ?? lead.x, y: shrine?.cy ?? lead.y, card: rel.name });
}

function recruit(w: World) {
  for (const rel of w.religions) {
    const prophet = w.byId.get(rel.prophet);
    for (const r of w.rats) {
      if (!r.alive || r.religion || r.rodentoid || r.stageN < 2) continue;
      const pull = r.beliefs.god * 0.5 + (prophet ? (r.rel.get(prophet.id)?.aff ?? 0) * 0.3 : 0) + (r.needs.hunger > 0.6 ? 0.15 : 0);
      if (pull > 0.28 && chance(w, 0.25)) { r.religion = rel.id; rel.memberIds.push(r.id); r.flags |= RF.believer; }
    }
    rel.memberIds = rel.memberIds.filter((id) => { const r = w.byId.get(id); return !!r && r.alive && r.religion === rel.id; });
    rel.members = rel.memberIds.length;
    const shrine = anyChamber(w, 'temple') ?? anyChamber(w, 'shrine');
    if (shrine && !rel.temples.includes(shrine.id)) rel.temples.push(shrine.id);
  }
}

function sermon(w: World) {
  const rel = w.religions[0]; if (!rel || rel.members < 3) return;
  const hall = w.chambers[rel.temples[0]] ?? anyChamber(w, 'shrine') ?? anyChamber(w, 'nest');
  if (!hall) return;
  const priest = w.byId.get(rel.prophet); if (!priest?.alive) return;
  if (!chance(w, 0.18)) return;
  for (const id of rel.memberIds) {
    const r = w.byId.get(id); if (!r) continue;
    r.beliefs.god = Math.min(1, r.beliefs.god + 0.04);
    r.emo.fear = Math.max(0, r.emo.fear - 0.05);
  }
  w.faith = Math.min(1, w.faith + 0.02);
  emit(w, 'doctrine', `${priest.name} preaches in ${hall.name}: "${rel.doctrine[Math.floor(R(w) * rel.doctrine.length)]}"`, 0, { rats: [priest.id], chamber: hall.id, x: hall.cx, y: hall.cy });
}

function feast(w: World) {
  if (day(w) % 6 !== 0) return;
  const rel = w.religions.find((r) => r.members >= 4); if (!rel) return;
  const hall = w.chambers[rel.temples[0]] ?? anyChamber(w, 'plaza') ?? anyChamber(w, 'nest');
  if (!hall || w.festivals.some((f) => f.kind === 'saints_day')) return;
  w.festivals.push({ id: ++w.nextFest, kind: 'saints_day', name: `${rel.name} keeps a feast`, chamber: hall.id, endsAt: w.tick + 80, joy: 0.15 });
  w.chron.festivals.push({ day: day(w), name: rel.name });
  emit(w, 'festival', `${rel.name} keeps a feast in ${hall.name}. The tunnels smell of crumbs and lamp oil.`, 1, { chamber: hall.id, x: hall.cx, y: hall.cy, rats: [rel.prophet], card: 'A feast day' });
}

function schism(w: World) {
  const rel = w.religions.find((r) => r.members >= 10 && !r.parent); if (!rel || w.religions.length > 2) return;
  if (!chance(w, 0.2)) return;
  const founder = w.byId.get(rel.founder);
  const rival = rel.memberIds.map((id) => w.byId.get(id)).filter((r): r is Rat => !!r && r.alive && r.id !== rel.prophet && (founder ? (r.rel.get(founder.id)?.aff ?? 0) < -0.05 : r.beliefs.god > 0.5)).sort((a, b) => b.genes.charisma - a.genes.charisma)[0];
  if (!rival) return;
  const deity: ReligionInfo['deity'] = rel.deity === 'the Unseen' ? 'the Machine' : 'the Unseen';
  const child: Religion = {
    id: ++w.nextRel, name: NAMES[deity][0], deity, doctrine: CREED[deity],
    founder: rival.id, prophet: rival.id, members: 1, temples: [], tolerance: -0.2,
    enemies: [rel.id], parent: rel.id, founded: w.tick, color: 0xe84b5a, memberIds: [rival.id],
  };
  rival.religion = child.id; rival.role = 'priest'; rival.flags |= RF.priest;
  const leave = rel.memberIds.filter((id) => { const r = w.byId.get(id); return !!r && r !== rival && (r.rel.get(rival.id)?.aff ?? 0) > 0.2; }).slice(0, 4);
  for (const id of leave) { const r = w.byId.get(id); if (r) { r.religion = child.id; child.memberIds.push(r.id); } }
  child.members = child.memberIds.length;
  rel.enemies.push(child.id);
  w.religions.push(child);
  emit(w, 'schism', `${rival.name} splits ${rel.name} and founds ${child.name}.`, 2, { rats: [rival.id, rel.prophet] });
}
