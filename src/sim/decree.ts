// Decrees: a king's press does not bite at once. A herald carries it from the throne
// through each dug district; the law's adoption is the share of districts reached.
import { LAW_BY_ID, MAX_ACTIVE, TIER_POP } from './laws';
import { log } from './log';
import { R, ROOM_KINDS, ROOM_LABEL, TPD, type Herald, type SimState } from './types';

export const HERALD_WAIT = 4; // ticks before the herald leaves the throne
export const HERALD_TICKS = 7; // ticks spent posting the decree in each district

/** grid position of a room (2 columns, rows of two) */
const pos = (k: number) => ({ row: Math.floor(k / 2), col: k % 2 });
export function heraldPath(s: SimState): number[] {
  const t = pos(R.throne);
  return s.rooms
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => r.level >= 1 && i !== R.throne)
    .sort((a, b) => {
      const pa = pos(a.i), pb = pos(b.i);
      return Math.abs(pa.row - t.row) + Math.abs(pa.col - t.col) - (Math.abs(pb.row - t.row) + Math.abs(pb.col - t.col)) || a.i - b.i;
    })
    .map(({ i }) => i);
}

export function lawAvailable(s: SimState, id: string): { ok: boolean; why: string; kind: 'pass' | 'repeal' | 'abolish' } {
  const d = LAW_BY_ID[id];
  const kind = id === 'abolish_laws' ? 'abolish' : id in s.laws && !s.laws[id].repealing ? 'repeal' : 'pass';
  if (!d) return { ok: false, why: 'NO SUCH LAW', kind };
  if (s.phase !== 'reign') return { ok: false, why: s.phase === 'founding' ? 'NO KING YET' : 'THE THRONE IS SILENT', kind };
  if (s.peakPop < TIER_POP[d.tier]) return { ok: false, why: `NEEDS ${TIER_POP[d.tier]} RATS`, kind };
  if (s.heralds.some((h) => h.law === id)) return { ok: false, why: 'HERALD ON THE ROAD', kind };
  if ((s.cooldown[id] ?? 0) > s.tick) return { ok: false, why: 'COOLDOWN', kind };
  if (kind === 'abolish' && !Object.keys(s.laws).length) return { ok: false, why: 'NO LAWS', kind };
  if (kind === 'pass') {
    const n = Object.values(s.laws).filter((l) => !l.repealing).length;
    const conflicts = (d.conflicts ?? []).some((c) => c in s.laws);
    if (n >= MAX_ACTIVE && !conflicts) return { ok: false, why: '8 LAWS IN FORCE', kind };
  }
  return { ok: true, why: kind.toUpperCase(), kind };
}

/** The king presses a button on his board. Returns false if the board refused it. */
export function pressLaw(s: SimState, id: string): boolean {
  const a = lawAvailable(s, id);
  if (!a.ok) return false;
  const d = LAW_BY_ID[id];
  const path = heraldPath(s);
  const spread = HERALD_WAIT + path.length * HERALD_TICKS;
  s.cooldown[id] = s.tick + TPD;
  const h: Herald = { id: s.nextId++, law: id, kind: a.kind, path, step: 0, t: -HERALD_WAIT };
  s.heralds.push(h);
  const rg = s.reigns[s.reigns.length - 1];
  if (a.kind === 'pass') {
    s.lawsPassedTotal++;
    if (rg) rg.laws.push(id);
    s.laws[id] = { since: s.tick + spread, pressed: s.tick, adopt: s.laws[id]?.adopt ?? 0, reached: s.laws[id]?.reached ?? [], repealing: false };
    for (const cf of d.conflicts ?? []) if (cf in s.laws) s.laws[cf].repealing = true;
    log(s, 'press', `THE KING PRESSES ${d.name}. A HERALD SETS OUT.`);
  } else if (a.kind === 'repeal') {
    s.laws[id].repealing = true;
    log(s, 'press', `THE KING STRIKES ${d.name}. A HERALD SETS OUT TO TEAR THE POSTERS.`);
  } else {
    s.lawsPassedTotal++;
    if (rg) rg.laws.push(id);
    for (const l of Object.values(s.laws)) l.repealing = true;
    log(s, 'press', 'THE KING SLAMS ABOLISH LAWS. A HERALD RUNS TO TEAR DOWN EVERY POSTER.');
  }
  if (s.mind) s.mind.pressLog.push({ tick: s.tick, id, kind: a.kind });
  return true;
}

export function stepHeralds(s: SimState) {
  for (let hi = s.heralds.length - 1; hi >= 0; hi--) {
    const h = s.heralds[hi];
    h.t++;
    if (h.t < 0) continue;
    // a district is reached every HERALD_TICKS
    if (h.t >= HERALD_TICKS) {
      h.t = 0;
      const room = h.path[h.step];
      h.step++;
      const frac = h.path.length ? h.step / h.path.length : 1;
      const d = LAW_BY_ID[h.law];
      if (h.kind === 'pass') {
        const l = s.laws[h.law];
        if (l && room !== undefined && !l.reached.includes(room)) l.reached.push(room);
        if (l) l.adopt = Math.max(l.adopt, frac);
        for (const cf of d.conflicts ?? []) {
          const c = s.laws[cf];
          if (c) { c.adopt = Math.min(c.adopt, 1 - frac); c.reached = c.reached.filter((x) => x !== room); }
        }
        if (h.step === 1 && room !== undefined) log(s, 'herald', `THE HERALD NAILS ${d.name} TO THE ${ROOM_LABEL[ROOM_KINDS[room]]} WALL.`);
      } else {
        const targets = h.kind === 'abolish' ? Object.keys(s.laws) : [h.law];
        for (const id of targets) {
          const l = s.laws[id];
          if (!l) continue;
          l.adopt = Math.min(l.adopt, 1 - frac);
          l.reached = l.reached.filter((x) => x !== room);
        }
      }
    }
    if (h.step >= h.path.length) finishHerald(s, h, hi);
  }
}

function finishHerald(s: SimState, h: Herald, hi: number) {
  s.heralds.splice(hi, 1);
  const d = LAW_BY_ID[h.law];
  if (h.kind === 'pass') {
    const l = s.laws[h.law];
    if (l) { l.adopt = 1; l.since = Math.min(l.since, s.tick); }
    for (const cf of d.conflicts ?? []) if (cf in s.laws) { delete s.laws[cf]; log(s, 'law', `${LAW_BY_ID[cf].name} IS STRUCK FROM THE WALLS.`); }
    log(s, 'law', `${d.name} IS NOW LAW IN EVERY DISTRICT: "${d.prop}"`);
  } else if (h.kind === 'repeal') {
    delete s.laws[h.law];
    log(s, 'law', `${d.name} IS FORGOTTEN.`);
  } else {
    s.laws = {};
    s.chaosUntil = s.tick + 2 * TPD;
    log(s, 'law', 'EVERY LAW IS TORN DOWN. THE TUNNELS RUN WILD.');
  }
}
