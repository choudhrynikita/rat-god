/** Emotions are not a number on a sheet. Fear makes a rat run, anger makes a fight,
 *  madness makes a killer, love makes two rats find each other. Witnesses carry it away. */
import { Anim, RF } from './contract';
import { fight } from './combat';
import { pathTo } from './move';
import { clamp, clamp01, type Rat, type World } from './state';

const mad = (r: Rat) => r.curses.some((c) => String(c).includes('madness'));

export function feel(w: World) {
  const alive = w.rats.filter((r) => r.alive && !r.rodentoid);
  for (const r of alive) {
    if (r.stageN < 1 || r.flags & RF.jailed) continue;
    if (mad(r)) { madden(w, r, alive); continue; }
    if (r.flags & RF.blessed && r.blessings.includes('charisma')) warm(w, r, alive);
    if (r.emo.fear > 0.6) scare(w, r, alive);
    else if (r.emo.anger > 0.72 && w.tick % 30 === r.id % 30) brawl(w, r, alive);
    else if (r.spouse && r.emo.love > 0.28 && w.tick % 24 === r.id % 24) seekMate(w, r);
    if (w.tick % 40 === 0 && !mad(r)) {
      r.emo.anger = clamp01(r.emo.anger * 0.9);
      r.emo.fear = clamp01(r.emo.fear * 0.88);
    }
  }
  meet(w, alive);
}

function madden(w: World, r: Rat, alive: Rat[]) {
  r.emo.anger = 1; r.emo.joy = 0; r.flags |= RF.cursed;
  r.anim = Anim.Run;
  const near = nearest(r, alive, (o) => o.stageN >= 2 && o.id !== r.id);
  if (!near) return;
  for (const o of alive) {
    if (o === r || Math.hypot(o.x - r.x, o.y - r.y) > 14) continue;
    o.emo.fear = clamp01(o.emo.fear + 0.22);
    if (o.genes.strength > 0.65) o.emo.anger = clamp01(o.emo.anger + 0.12);
    else if (o.anim !== Anim.Fight) o.anim = o.emo.fear > 0.75 ? Anim.Cower : Anim.Flee;
  }
  const close = Math.hypot(near.x - r.x, near.y - r.y) < 2.4 || (near.edge === r.edge && Math.abs(near.s - r.s) < 2.5);
  if (!close) {
    if (near.edge >= 0) pathTo(w, r, { edge: near.edge, s: near.s });
    r.intent.kind = 'fight'; r.intent.until = w.tick + 24; r.anim = Anim.Run;
    return;
  }
  const swung = (r as { lastSwing?: number }).lastSwing ?? 0;
  if (w.tick - swung < 18) { r.anim = Anim.Fight; near.anim = Anim.Cower; return; }
  (r as { lastSwing?: number }).lastSwing = w.tick;
  const since = (r as { lastKill?: number }).lastKill ?? 0;
  const lethal = w.tick - since > 140;
  const lose = fight(w, r, near, 'madness', lethal);
  r.intent.kind = 'fight'; r.intent.until = w.tick + 22; r.anim = Anim.Fight;
  if (lose && !lose.alive) (r as { lastKill?: number }).lastKill = w.tick;
  for (const o of alive) {
    if (o === r || o === near || Math.hypot(o.x - r.x, o.y - r.y) > 16) continue;
    o.emo.fear = clamp01(Math.max(o.emo.fear, 0.7));
    o.emo.anger = clamp01(o.emo.anger + 0.2);
    const g = o.rel.get(r.id); if (g) g.aff = Math.min(g.aff, -0.4);
  }
}

function meet(w: World, alive: Rat[]) {
  let n = 0;
  const used = new Set<number>();
  for (const a of alive) {
    if (n >= 6 || a.stageN < 2 || used.has(a.id) || mad(a) || a.flags & RF.jailed) continue;
    if (w.tick - ((a as { met?: number }).met ?? -999) < 80) continue;
    let b: Rat | null = null; let bd = 2.8;
    for (const o of alive) {
      if (o === a || used.has(o.id) || o.stageN < 2 || mad(o) || o.flags & RF.jailed) continue;
      const d = Math.hypot(o.x - a.x, o.y - a.y);
      if (d < bd) { bd = d; b = o; }
    }
    if (!b) continue;
    if (w.tick - ((b as { met?: number }).met ?? -999) < 80) continue;
    used.add(a.id); used.add(b.id); n++;
    (a as { met?: number }).met = w.tick; (b as { met?: number }).met = w.tick;
    const aff = a.rel.get(b.id)?.aff ?? 0;
    if ((a.emo.anger > 0.62 || b.emo.anger > 0.62) && aff < -0.05) {
      fight(w, a, b, 'a grudge', false);
      a.emo.anger = clamp01(a.emo.anger * 0.55); b.emo.anger = clamp01(b.emo.anger + 0.2);
      w.stats.unrest = clamp01(w.stats.unrest + 0.012);
      a.intent.until = w.tick + 18; b.intent.until = w.tick + 18;
      continue;
    }
    const giver = a.food >= b.food ? a : b; const taker = giver === a ? b : a;
    if (taker.needs.hunger > 0.65 && giver.food > 0.45) {
      const bite = Math.min(0.35, giver.food * 0.45);
      if (aff > -0.15) {
        giver.food -= bite; taker.food += bite; taker.needs.hunger = clamp01(taker.needs.hunger - 0.22);
        giver.emo.joy = clamp01(giver.emo.joy + 0.05); taker.emo.love = clamp01(taker.emo.love + 0.08);
        giver.anim = Anim.Talk; taker.anim = Anim.Eat;
      } else {
        giver.food = Math.max(0, giver.food - bite); taker.food += bite;
        giver.emo.anger = 1; taker.emo.shame = clamp01(taker.emo.shame + 0.35); taker.emo.fear = clamp01(taker.emo.fear + 0.2);
        giver.anim = Anim.Fight; taker.anim = Anim.Flee;
        w.stats.unrest = clamp01(w.stats.unrest + 0.02);
      }
      giver.intent.until = w.tick + 16; taker.intent.until = w.tick + 16;
      continue;
    }
    if ((a.emo.fear > 0.55 || b.emo.fear > 0.55) && aff >= 0) {
      const scared = a.emo.fear >= b.emo.fear ? a : b; const calm = scared === a ? b : a;
      scared.emo.fear = clamp01(scared.emo.fear - 0.18); scared.emo.joy = clamp01(scared.emo.joy + 0.06);
      calm.emo.love = clamp01(calm.emo.love + 0.04); calm.anim = Anim.Groom; scared.anim = Anim.Talk;
      calm.intent.until = w.tick + 16; scared.intent.until = w.tick + 16;
      continue;
    }
    if (aff > 0.05 || a.spouse === b.id) {
      const close = a.spouse === b.id;
      a.anim = close ? Anim.Mate : Anim.Talk; b.anim = a.anim;
      a.emo.joy = clamp01(a.emo.joy + 0.04); b.emo.joy = clamp01(b.emo.joy + 0.04);
      if (close) { a.emo.love = clamp01(a.emo.love + 0.06); b.emo.love = clamp01(b.emo.love + 0.06); }
      const rl = a.rel.get(b.id); if (rl) rl.aff = clamp(rl.aff + 0.02, -1, 1);
      a.needs.social = Math.max(0, a.needs.social - 0.1); b.needs.social = Math.max(0, b.needs.social - 0.1);
      a.intent.until = w.tick + 14; b.intent.until = w.tick + 14;
    }
  }
}

function scare(w: World, r: Rat, alive: Rat[]) {
  const threat = nearest(r, alive, (o) => o !== r && (mad(o) || o.emo.anger > 0.7 || o.anim === Anim.Fight));
  r.anim = r.emo.fear > 0.85 && !threat ? Anim.Cower : Anim.Flee;
  r.intent.kind = 'flee'; r.intent.until = w.tick + 18;
  if (!threat || threat.edge < 0 || r.edge < 0) return;
  if (w.tick % 16 !== r.id % 16) return;
  const away = w.edges.find((e) => e.kind !== 'surface' && e.dug > 2 && e.id !== threat.edge);
  if (away) pathTo(w, r, { edge: away.id, s: Math.min(away.len * 0.5, away.dug * 0.5) });
}

function brawl(w: World, r: Rat, alive: Rat[]) {
  let rival = alive.find((o) => o !== r && o.alive && (o.rel.get(r.id)?.aff ?? 0) < -0.35 && Math.hypot(o.x - r.x, o.y - r.y) < 8);
  if (!rival) rival = nearest(r, alive, (o) => o !== r && o.stageN >= 2 && o.emo.anger > 0.55 && Math.hypot(o.x - r.x, o.y - r.y) < 4) ?? undefined;
  if (!rival) return;
  const close = Math.hypot(rival.x - r.x, rival.y - r.y) < 2.2;
  if (!close) { if (rival.edge >= 0) pathTo(w, r, { edge: rival.edge, s: rival.s }); r.anim = Anim.Run; return; }
  fight(w, r, rival, 'a grudge', false);
  r.anim = Anim.Fight; rival.anim = Anim.Fight;
  r.intent.until = w.tick + 20; rival.intent.until = w.tick + 20;
}

function seekMate(w: World, r: Rat) {
  const sp = w.byId.get(r.spouse); if (!sp?.alive || sp.rodentoid) return;
  const close = Math.hypot(sp.x - r.x, sp.y - r.y) < 2.2 || (sp.edge === r.edge && Math.abs(sp.s - r.s) < 2);
  if (close) {
    r.anim = Anim.Mate; sp.anim = Anim.Mate;
    r.emo.joy = clamp01(r.emo.joy + 0.08); sp.emo.joy = clamp01(sp.emo.joy + 0.08);
    r.emo.love = clamp01(r.emo.love + 0.04); sp.emo.love = clamp01(sp.emo.love + 0.04);
    r.intent.kind = 'court'; r.intent.until = w.tick + 24;
    return;
  }
  if (sp.edge >= 0) pathTo(w, r, { edge: sp.edge, s: sp.s });
  r.intent.kind = 'court'; r.anim = Anim.Walk; r.intent.until = w.tick + 30;
}

function warm(w: World, r: Rat, alive: Rat[]) {
  for (const o of alive) {
    if (o === r || Math.hypot(o.x - r.x, o.y - r.y) > 9) continue;
    o.emo.joy = clamp01(o.emo.joy + 0.03);
    o.emo.fear = clamp01(o.emo.fear - 0.04);
    o.beliefs.god = clamp(o.beliefs.god + 0.01, -1, 1);
    if (w.tick % 40 === r.id % 40 && o.edge !== r.edge && r.edge >= 0) pathTo(w, o, { edge: r.edge, s: r.s });
  }
}

function nearest(r: Rat, alive: Rat[], ok: (o: Rat) => boolean): Rat | null {
  let best: Rat | null = null; let bd = 1e9;
  for (const o of alive) {
    if (!ok(o)) continue;
    const d = Math.hypot(o.x - r.x, o.y - r.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}
