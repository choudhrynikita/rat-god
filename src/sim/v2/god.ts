/** God acts. Grace is spent, the city answers, a ripple is opened. No sexual acts. */
import type { GodCommand, GodPowerInfo, GodResult, GodTarget } from './contract';
import { Anim, RF } from './contract';
import { kill } from './rats';
import { clamp, clamp01, emit, type Rat, type RippleS, type World } from './state';

export const GOD_POWERS: GodPowerInfo[] = [
  { power: 'smite', label: 'SMITE', group: 'destruction', cost: 30, target: ['rat'], params: [], blurb: 'Strike one rat down. Witnesses remember.', targetKind: 'rat' },
  { power: 'bless', label: 'BLESS', group: 'elevation', cost: 18, target: ['rat'], params: ['gift'], blurb: 'Lay a gift on one rat.', targetKind: 'rat' },
  { power: 'curse', label: 'CURSE', group: 'curse', cost: 18, target: ['rat'], params: ['curse'], blurb: 'A curse that sticks to a name.', targetKind: 'rat' },
  { power: 'anoint_prophet', label: 'PROPHET', group: 'elevation', cost: 36, target: ['rat'], params: [], blurb: 'This rat hears you. Others may kneel, or hate them.', targetKind: 'rat' },
  { power: 'punish_king', label: 'PUNISH', group: 'judgement', cost: 22, target: [], params: ['punishment'], blurb: 'Chastise the king. The city will take a side.', targetKind: 'king' },
  { power: 'punish', label: 'CHASTISE', group: 'judgement', cost: 16, target: ['rat'], params: ['punishment'], blurb: 'Pain, humiliation, or a blighted store.', targetKind: 'rat' },
  { power: 'whisper', label: 'WHISPER', group: 'influence', cost: 8, target: ['rat'], params: ['idea'], blurb: 'Plant an idea. It is still their idea.', targetKind: 'rat' },
  { power: 'harvest', label: 'HARVEST', group: 'nature', cost: 16, target: [], params: [], blurb: 'Crumbs pour through the grate.', targetKind: 'none' },
  { power: 'flood', label: 'FLOOD', group: 'nature', cost: 28, target: ['x', 'y'], params: ['magnitude'], blurb: 'Water finds the low tunnels.', targetKind: 'place' },
  { power: 'earthquake', label: 'QUAKE', group: 'nature', cost: 40, target: [], params: ['magnitude'], blurb: 'The whole kingdom shakes.', targetKind: 'none' },
  { power: 'storm', label: 'STORM', group: 'nature', cost: 12, target: [], params: [], blurb: 'A storm over the street.', targetKind: 'none' },
  { power: 'plague', label: 'PLAGUE', group: 'nature', cost: 36, target: ['chamber'], params: [], blurb: 'A fever starts where you point.', targetKind: 'chamber' },
  { power: 'miracle', label: 'MIRACLE', group: 'fate', cost: 40, target: ['chamber'], params: ['miracle'], blurb: 'Feed, heal, or calm.', targetKind: 'chamber' },
  { power: 'foresee', label: 'FORESEE', group: 'knowledge', cost: 4, target: [], params: ['query'], blurb: 'A short look at what is already true.', targetKind: 'none' },
  { power: 'sign', label: 'SIGN', group: 'presence', cost: 8, target: [], params: ['text'], blurb: 'A mark in the dirt. They argue about what it means.', targetKind: 'none' },
];

const COST = new Map(GOD_POWERS.map((p) => [p.power, p.cost]));

export function actGod(w: World, cmd: GodCommand): GodResult {
  const cost = COST.get(cmd.power) ?? 10;
  if (!w.unbound && w.grace < cost) {
    return { t: 'godResult', req: cmd.req, ok: false, reason: 'Not enough grace.', power: cmd.power, cost: 0, grace: w.grace, effects: [], witnesses: 0, events: [] };
  }
  const before = w.seq;
  const rat = cmd.target.rat ? w.byId.get(cmd.target.rat) : undefined;
  let text = 'You do nothing the city can see.';
  let ok = true;
  let reason: string | undefined;
  const effects: string[] = [];
  const at = placeOf(w, cmd, rat);
  if (cmd.power === 'smite') {
    if (!rat?.alive) { ok = false; reason = 'No living rat under your hand.'; }
    else {
      kill(w, rat, 'smite'); text = `${rat.name} is struck down.`; effects.push(text);
      let n = 0;
      for (const o of w.rats) if (o.alive && o !== rat && Math.hypot(o.x - rat.x, o.y - rat.y) < 16) { o.emo.fear = Math.max(o.emo.fear, 0.85); o.anim = Anim.Cower; n++; }
      if (n) effects.push(`${n} saw it and cower.`);
    }
  } else if (cmd.power === 'bless' && rat?.alive) {
    const gift = cmd.params?.gift ?? 'health';
    rat.flags |= RF.blessed;
    if (!rat.blessings.includes(gift)) rat.blessings.push(gift);
    applyBless(w, rat, gift);
    text = `${rat.name} is blessed with ${gift}. The others can see it.`; effects.push(text);
  } else if (cmd.power === 'curse' && rat?.alive) {
    const curse = cmd.params?.curse ?? 'madness';
    rat.flags |= RF.cursed;
    if (!rat.curses.includes(curse)) rat.curses.push(curse);
    applyCurse(w, rat, curse);
    text = curse === 'madness' ? `${rat.name} goes mad and turns on the nearest rat.` : `${rat.name} is cursed with ${curse}.`;
    effects.push(text);
  } else if (cmd.power === 'anoint_prophet' && rat?.alive) {
    rat.flags |= RF.prophet | RF.priest; rat.role = 'priest'; rat.beliefs.god = 1; rat.anim = Anim.Preach;
    let n = 0;
    for (const o of w.rats) if (o.alive && o !== rat && Math.hypot(o.x - rat.x, o.y - rat.y) < 14) { o.beliefs.god = clamp(o.beliefs.god + 0.25, -1, 1); o.anim = Anim.Pray; n++; }
    text = `${rat.name} hears a voice and calls it yours. ${n} nearby kneel.`; effects.push(text);
  } else if (cmd.power === 'punish_king' || (cmd.power === 'punish' && !rat)) {
    const k = w.byId.get(w.kingId);
    if (!k?.alive) { ok = false; reason = 'The throne is empty.'; }
    else { text = punish(w, k, cmd.params?.punishment ?? 'pain'); effects.push(text); }
  } else if (cmd.power === 'punish' && rat?.alive) {
    text = punish(w, rat, cmd.params?.punishment ?? 'pain'); effects.push(text);
  } else if (cmd.power === 'whisper' && rat?.alive) {
    const idea = cmd.params?.idea;
    if (idea?.kind === 'belief') rat.beliefs[idea.axis] = clamp(rat.beliefs[idea.axis] + 0.55 * idea.dir, -1, 1);
    else if (idea?.kind === 'desire' && idea.what === 'rebel') { rat.beliefs.crown = clamp(rat.beliefs.crown - 0.6, -1, 1); rat.grievance = clamp01(rat.grievance + 0.55); }
    else if (idea?.kind === 'desire' && idea.what === 'worship') rat.beliefs.god = 0.95;
    else if (idea?.kind === 'desire' && idea.what === 'dig') rat.role = 'digger';
    else if (idea?.kind === 'desire' && idea.what === 'leave') { rat.emo.fear = Math.max(rat.emo.fear, 0.7); rat.beliefs.kin = clamp(rat.beliefs.kin - 0.4, -1, 1); }
    else rat.beliefs.god = clamp(rat.beliefs.god + 0.45, -1, 1);
    rat.anim = Anim.Talk; rat.intent.until = w.tick + 48;
    text = `A thought settles in ${rat.name}, and they speak it.`; effects.push(text);
  } else if (cmd.power === 'harvest') {
    w.granary += 40; w.foodOnSurface += 24;
    const g = w.chambers.find((c) => c.kind === 'granary'); if (g) g.stock = w.granary;
    let fed = 0;
    for (const r of w.rats) if (r.alive && r.food < 2.2 && fed < 18) { r.food += 1.6; r.emo.joy = clamp01(r.emo.joy + 0.35); r.anim = Anim.Eat; fed++; }
    text = fed ? `Food spills through the grate. ${fed} eat.` : 'Food spills through the grate.'; effects.push(text);
  } else if (cmd.power === 'flood') {
    const mag = cmd.params?.magnitude ?? 0.7;
    const ch = nearestChamber(w, cmd.target);
    let n = 0;
    if (ch) {
      ch.flooded = clamp01(Math.max(ch.flooded, 0.45 + mag * 0.5)); w.dirtyChambers.add(ch.id);
      for (const r of w.rats) if (r.alive && Math.hypot(r.x - ch.cx, r.y - ch.cy) < ch.rx + 3) { r.emo.fear = Math.max(r.emo.fear, 0.75); if (mag >= 0.6) r.injured = Math.max(r.injured, 0.28); r.anim = Anim.Flee; n++; }
    }
    w.env.rain = 1; w.env.weather = 'storm'; w.env.intensity = Math.max(w.env.intensity, 0.7); w.weatherLeft = 400;
    text = ch ? `Water fills ${ch.name}. ${n} are caught in it.` : 'Water rises in the low places.'; effects.push(text);
  } else if (cmd.power === 'earthquake') {
    const mag = cmd.params?.magnitude ?? 0.6;
    w.env.quake = clamp01(0.6 + mag * 0.4); w.quakeT = w.tick;
    let n = 0; const cap = 3 + Math.round(mag * 6);
    for (const r of w.rats) if (r.alive && n < cap && (r.id + (w.tick % 5)) % 4 === 0) { r.injured = Math.max(r.injured, 0.25 + mag * 0.35); r.emo.fear = Math.max(r.emo.fear, 0.8); r.anim = Anim.Cower; n++; }
    text = `The ground heaves. ${n} are thrown.`; effects.push(text);
  } else if (cmd.power === 'storm') {
    w.env.weather = 'storm'; w.env.intensity = 1; w.env.rain = 1; w.weatherLeft = 520;
    let n = 0;
    for (const r of w.rats) if (r.alive && r.y < 8) { r.emo.fear = Math.max(r.emo.fear, 0.65); r.anim = Anim.Flee; n++; }
    text = n ? `A storm breaks over the street. ${n} run for the mouth.` : 'A storm breaks over the street.'; effects.push(text);
  } else if (cmd.power === 'plague') {
    const ch = w.chambers[cmd.target.chamber ?? -1] ?? nearestChamber(w, cmd.target);
    let n = 0;
    for (const r of w.rats) if (r.alive && ch && Math.hypot(r.x - ch.cx, r.y - ch.cy) < ch.rx + 5 && n < 12) { r.disease = 'fever'; r.flags |= RF.sick; r.health = clamp(r.health - 0.15, 0.1, 1); r.anim = Anim.Sick; r.emo.fear = Math.max(r.emo.fear, 0.55); n++; }
    text = n ? `A fever takes ${n} in ${ch?.name ?? 'the dark'}.` : 'The fever finds no one.'; effects.push(text);
  } else if (cmd.power === 'miracle') {
    const kind = cmd.params?.miracle ?? 'heal';
    const ch = nearestChamber(w, cmd.target);
    if (kind === 'feed') {
      w.granary += 50; const g = w.chambers.find((c) => c.kind === 'granary'); if (g) g.stock = w.granary;
      let fed = 0; for (const r of w.rats) if (r.alive && r.food < 3 && fed < 24) { r.food += 2; r.anim = Anim.Eat; fed++; }
      text = `The stores fill. ${fed} eat.`;
    } else if (kind === 'calm') {
      for (const r of w.rats) { r.emo.anger *= 0.2; r.emo.fear *= 0.5; }
      w.stats.unrest *= 0.35; text = 'The shouting stops.';
    } else if (kind === 'light') {
      let n = 0;
      for (const r of w.rats) if (r.alive && (!ch || Math.hypot(r.x - ch.cx, r.y - ch.cy) < ch.rx + 6)) { r.emo.fear *= 0.15; r.emo.joy = clamp01(r.emo.joy + 0.45); r.anim = Anim.Cheer; n++; }
      text = `A light stands in ${ch?.name ?? 'the tunnels'}. ${n} look up.`;
    } else if (kind === 'fertile') {
      let n = 0;
      for (const r of w.rats) if (r.alive && r.stageN >= 2 && (!ch || Math.hypot(r.x - ch.cx, r.y - ch.cy) < (ch?.rx ?? 8) + 4)) { r.genes.fertility = Math.max(r.genes.fertility, 0.9); r.emo.joy = clamp01(r.emo.joy + 0.3); n++; }
      text = `${n} are made fruitful.`;
    } else {
      let n = 0; for (const r of w.rats) if (r.disease || r.injured > 0.15) { r.disease = null; r.injured = 0; r.health = 1; r.flags &= ~RF.sick; r.anim = Anim.Cheer; n++; }
      text = n ? `${n} wounds close.` : 'No one was hurt.';
    }
    effects.push(text);
  } else if (cmd.power === 'foresee') {
    text = 'You look, and do not touch.';
  } else if (cmd.power === 'sign') {
    const ch = nearestChamber(w, cmd.target);
    let up = 0, down = 0;
    const line = cmd.params?.text?.slice(0, 80);
    if (ch) for (const r of w.rats) if (r.alive && Math.hypot(r.x - ch.cx, r.y - ch.cy) < ch.rx + 6) {
      if (r.id % 2 === 0) { r.beliefs.god = clamp(r.beliefs.god + 0.4, -1, 1); up++; }
      else { r.beliefs.god = clamp(r.beliefs.god - 0.3, -1, 1); down++; }
      r.anim = Anim.Talk;
    }
    text = line || (ch ? `A mark in ${ch.name}. ${up} kneel. ${down} spit.` : 'A sign is scratched where many pass.');
    effects.push(text);
  } else if (!rat?.alive && (cmd.power === 'bless' || cmd.power === 'curse' || cmd.power === 'whisper' || cmd.power === 'anoint_prophet')) {
    ok = false; reason = 'Choose a living rat.';
  } else {
    ok = false; reason = 'That power has no purchase yet.';
  }
  if (!ok) return { t: 'godResult', req: cmd.req, ok: false, reason, power: cmd.power, cost: 0, grace: w.grace, effects: [], witnesses: 0, events: [] };
  if (!w.unbound) w.grace -= cost;
  const witnesses = countWitnesses(w, rat);
  const rp: RippleS = { id: ++w.nextRipple, power: cmd.power, tick: w.tick, text, target: rat?.id, open: true, chain: [], until: w.tick + 960 * 14, world: true };
  w.ripples.push(rp); if (w.ripples.length > 24) w.ripples.shift();
  w.ripCtx = [rp.id];
  const fx = fxOf(cmd);
  const who = cmd.power === 'punish_king' ? w.byId.get(w.kingId) : rat;
  const ev = emit(w, cmd.power === 'punish_king' || cmd.power === 'punish' ? 'god_punish' : cmd.power === 'smite' ? 'smite' : 'god_act', text, cmd.power === 'smite' || cmd.power === 'punish_king' || cmd.power === 'earthquake' || cmd.power === 'plague' ? 2 : 1, { rats: who ? [who.id] : [], x: who?.x ?? at.x, y: who?.y ?? at.y, chamber: at.chamber, fx, card: text.slice(0, 48) });
  w.ripCtx = [];
  w.chron.godActs.push({ tick: w.tick, power: cmd.power, text });
  if (rat) { rat.beliefs.god = clamp(rat.beliefs.god + (cmd.power === 'smite' || cmd.power === 'curse' || cmd.power === 'punish' ? -0.15 : 0.2), -1, 1); rat.rip.push({ id: rp.id, d: 0, t: w.tick }); }
  const events: number[] = [];
  for (let s = before + 1; s <= w.seq; s++) events.push(s);
  void ev;
  const forecast = cmd.power === 'foresee' ? {
    horizonDays: 3,
    lines: [`${w.rats.filter((r) => r.alive).length} rats still breathe.`, `The king is ${w.byId.get(w.kingId)?.name ?? 'gone'}.`, `Granary holds ${w.granary.toFixed(0)}. Unrest ${(w.stats.unrest * 100).toFixed(0)}.`],
    kingSurvives: !!w.byId.get(w.kingId)?.alive, popAfter: w.rats.filter((r) => r.alive).length, confidence: 0.4,
  } : undefined;
  return { t: 'godResult', req: cmd.req, ok: true, power: cmd.power, cost: w.unbound ? 0 : cost, grace: w.grace, effects, witnesses, events, forecast };
}

function applyBless(w: World, r: Rat, gift: string) {
  if (gift === 'genius') { r.genes.intellect = 1; r.genes.curiosity = 1; r.skills.lore = Math.max(r.skills.lore, 0.8); }
  else if (gift === 'charisma') { r.genes.charisma = 1; r.skills.talk = Math.max(r.skills.talk, 0.8); }
  else if (gift === 'strength') { r.genes.strength = 1; r.skills.fight = Math.max(r.skills.fight, 0.85); }
  else if (gift === 'longevity') r.genes.longevity = 1;
  else if (gift === 'prophecy') { r.flags |= RF.prophet | RF.priest; r.beliefs.god = 1; r.role = 'priest'; }
  else if (gift === 'fertility') r.genes.fertility = 1;
  else { r.health = 1; r.disease = null; r.injured = 0; r.flags &= ~RF.sick; }
  r.emo.joy = 1; r.anim = Anim.Cheer; r.intent.until = w.tick + 36;
  for (const o of w.rats) if (o.alive && o !== r && Math.hypot(o.x - r.x, o.y - r.y) < 12) o.emo.joy = clamp01(o.emo.joy + 0.15);
}
function applyCurse(w: World, r: Rat, curse: string) {
  if (curse === 'madness') {
    r.emo.anger = 1; r.emo.joy = 0; r.emo.fear = 0.1; r.anim = Anim.Fight;
    for (const o of w.rats) if (o.alive && o !== r && Math.hypot(o.x - r.x, o.y - r.y) < 14) o.emo.fear = Math.max(o.emo.fear, 0.62);
  } else if (curse === 'plague') {
    r.disease = 'fever'; r.flags |= RF.sick; r.emo.fear = 0.7;
    let n = 0;
    for (const o of w.rats) if (o.alive && o !== r && Math.hypot(o.x - r.x, o.y - r.y) < 8 && n < 4) { o.disease = 'fever'; o.flags |= RF.sick; o.emo.fear = Math.max(o.emo.fear, 0.5); n++; }
  } else if (curse === 'barren') { r.genes.fertility = 0; r.emo.shame = 0.8; }
  else if (curse === 'weakness') { r.genes.strength = 0.05; r.skills.fight = 0.05; r.emo.fear = 0.85; r.anim = Anim.Cower; }
  else { r.food = 0; r.injured = Math.max(r.injured, 0.55); r.emo.fear = 0.6; r.health = clamp(r.health - 0.25, 0.05, 1); }
}
function punish(w: World, r: Rat, how: string): string {
  r.beliefs.god = clamp(r.beliefs.god - 0.3, -1, 1);
  r.emo.fear = 1;
  r.mem.push({ tick: w.tick, text: `Something above punished me (${how}).`, val: -0.8, other: 0, kind: 'god_wrath', pinned: true, w: 0.9 });
  const king = (r.flags & RF.king) !== 0;
  if (how === 'humble') {
    r.emo.shame = 1; r.genes.charisma *= 0.35; r.titles.length = 0; r.anim = Anim.Cower;
    if (king) { w.stats.legitimacy = clamp01(w.stats.legitimacy - 0.22); w.stats.unrest = clamp01(w.stats.unrest + 0.18); }
    return `${r.name} is humbled. The titles come off.`;
  }
  if (how === 'blight') {
    w.granary = Math.max(0, w.granary * 0.4); r.food = 0; r.emo.fear = 0.85;
    const g = w.chambers.find((c) => c.kind === 'granary'); if (g) { g.stock = w.granary; w.dirtyChambers.add(g.id); }
    return `The stores rot under ${r.name}.`;
  }
  if (how === 'strip') {
    r.titles.length = 0; r.emo.shame = 1; r.anim = Anim.Cower; r.flags &= ~(RF.enforcer | RF.herald | RF.priest);
    if (!king) r.role = 'idle';
    if (king) { w.stats.legitimacy = clamp01(w.stats.legitimacy - 0.35); w.stats.unrest = clamp01(w.stats.unrest + 0.28); }
    return king ? `${r.name} keeps the throne and loses the city's trust.` : `${r.name} is stripped of office.`;
  }
  if (how === 'nightmare') {
    r.emo.fear = 1; r.anim = Anim.Sleep; r.needs.energy = 0;
    for (const o of w.rats) if (o.alive && o !== r && Math.hypot(o.x - r.x, o.y - r.y) < 10) o.emo.fear = Math.max(o.emo.fear, 0.45);
    return `${r.name} drops, dreaming of you.`;
  }
  r.injured = Math.max(r.injured, 0.75); r.health = clamp(r.health - 0.22, 0.08, 1); r.emo.fear = 1; r.anim = Anim.Cower;
  if (king) { w.stats.unrest = clamp01(w.stats.unrest + 0.14); w.stats.legitimacy = clamp01(w.stats.legitimacy - 0.1); w.godRejection = clamp01(w.godRejection + 0.06); }
  return `${r.name} is struck with pain.`;
}

function placeOf(w: World, cmd: GodCommand, rat?: Rat): { x: number; y: number; chamber?: number } {
  if (rat?.alive) return { x: rat.x, y: rat.y };
  const ch = nearestChamber(w, cmd.target);
  if (ch) return { x: ch.cx, y: ch.floorY || ch.cy, chamber: ch.id };
  const nest = w.chambers[0];
  return { x: nest?.cx ?? 0, y: nest?.cy ?? 0, chamber: nest?.id };
}
function fxOf(cmd: GodCommand): string {
  if (cmd.power === 'smite') return 'smite';
  if (cmd.power === 'bless') return cmd.params?.gift === 'prophecy' ? 'halo' : 'bless';
  if (cmd.power === 'anoint_prophet') return 'halo';
  if (cmd.power === 'curse') return cmd.params?.curse === 'plague' ? 'plague' : cmd.params?.curse === 'madness' ? 'riot' : 'curse';
  if (cmd.power === 'punish' || cmd.power === 'punish_king') return cmd.params?.punishment === 'nightmare' ? 'dream' : cmd.params?.punishment === 'blight' ? 'miasma' : 'punish';
  if (cmd.power === 'whisper') return 'whisper';
  if (cmd.power === 'harvest') return 'harvest';
  if (cmd.power === 'flood') return 'flood';
  if (cmd.power === 'earthquake') return 'earthquake';
  if (cmd.power === 'storm') return 'storm';
  if (cmd.power === 'plague') return 'plague';
  if (cmd.power === 'miracle') return cmd.params?.miracle === 'light' ? 'halo' : cmd.params?.miracle === 'calm' ? 'whisper' : 'miracle';
  if (cmd.power === 'foresee') return 'foresee';
  if (cmd.power === 'sign') return 'sign';
  return 'god';
}

function nearestChamber(w: World, t: GodTarget) {
  if (t.chamber != null && w.chambers[t.chamber]) return w.chambers[t.chamber];
  if (t.x == null || t.y == null) return w.chambers.find((c) => c.progress >= 0.999) ?? null;
  let best = w.chambers[0], bd = Infinity;
  for (const c of w.chambers) { const d = (c.cx - t.x) ** 2 + (c.cy - t.y) ** 2; if (d < bd) { bd = d; best = c; } }
  return best ?? null;
}
function countWitnesses(w: World, r?: Rat) {
  if (!r) return Math.min(12, w.rats.filter((x) => x.alive).length);
  let n = 0; for (const o of w.rats) if (o.alive && o !== r && Math.hypot(o.x - r.x, o.y - r.y) < 18) n++; return n;
}
