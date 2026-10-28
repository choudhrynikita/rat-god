// Rats & other actors. Positions are interpolated between sim snapshots by time; gait is driven by distance travelled
// (no foot slide), non-locomotion loops run at their own fps; turns squash-flip, anim changes crossfade, bodies tilt with
// the slope and rotate onto walls when climbing, feet are snapped to the painted floor so rats never float, and far zoom
// switches to cheap static impostors.
import { Container, Sprite, Texture } from 'pixi.js';
import { Anim, Carry, RF, Stage, type Snapshot2, type Hazard, type Corpse, type Item, type Poster } from '../../sim/v2/contract';
import { STRIDE_TILES } from '../../sim/v2/shared';
import { clip, has, type Clip } from './sprites';
import { PX } from './units';
import type { Terrain } from './terrain';
import { lightTexture } from './post';
import { toolTexture } from './props';

const LOCO = new Set<number>([Anim.Walk, Anim.Run, Anim.Sneak, Anim.Climb, Anim.Squeeze, Anim.Swim, Anim.Flee, Anim.Patrol, Anim.Haul, Anim.Carry, Anim.Steal, Anim.Charge]);
// anim → candidate clip suffixes (first one present wins)
const MAP: Record<number, string[]> = {
  [Anim.Idle]: ['idle'], [Anim.Walk]: ['walk', 'walk_limp', 'patrol'], [Anim.Run]: ['run', 'walk'], [Anim.Sneak]: ['walk'], [Anim.Climb]: ['walk'],
  [Anim.Squeeze]: ['squeeze', 'walk'], [Anim.Swim]: ['swim', 'walk'], [Anim.Dig]: ['dig', 'dig_founder', 'work_gnaw'], [Anim.Haul]: ['haul', 'walk'],
  [Anim.Gnaw]: ['work_gnaw', 'eat'], [Anim.Craft]: ['work_gnaw', 'build_founder'], [Anim.Eat]: ['eat', 'eat_scraps', 'feast', 'suckle'], [Anim.Drink]: ['drink', 'eat'],
  [Anim.Sleep]: ['sleep'], [Anim.Groom]: ['groom', 'idle'], [Anim.Nurse]: ['nurse', 'suckle'], [Anim.Mate]: ['court'], [Anim.Play]: ['play', 'cheer'],
  [Anim.Talk]: ['idle', 'announce'], [Anim.Trade]: ['idle'], [Anim.Fight]: ['fight', 'beat'], [Anim.Flee]: ['run', 'walk'], [Anim.Cower]: ['cower', 'idle'],
  [Anim.Pray]: ['pray', 'cower'], [Anim.Preach]: ['preach', 'announce', 'decree', 'cheer'], [Anim.Mourn]: ['sick_idle', 'idle_cough', 'idle'], [Anim.Sick]: ['sick_idle', 'sick', 'idle_cough'],
  [Anim.Shiver]: ['shake', 'sick_idle'], [Anim.Protest]: ['protest', 'cheer'], [Anim.Vote]: ['vote'], [Anim.Cheer]: ['cheer'], [Anim.Steal]: ['steal', 'walk'],
  [Anim.Patrol]: ['patrol', 'walk'], [Anim.Guard]: ['idle'], [Anim.Throne]: ['idle_throne', 'idle'], [Anim.Press]: ['press_law', 'decree'], [Anim.Feast]: ['feast', 'indulge', 'eat'],
  [Anim.Paste]: ['paste_poster', 'work_gnaw'], [Anim.Carry]: ['carry_pup', 'haul', 'walk'], [Anim.Dying]: ['die', 'die_violent'], [Anim.Dead]: ['die'], [Anim.Risen]: ['walk', 'starving_walk'],
  [Anim.Kneel]: ['pray', 'cower'], [Anim.Celebrate]: ['dance', 'cheer'], [Anim.Experiment]: ['experiment', 'work_gnaw'], [Anim.Write]: ['write', 'work_gnaw'], [Anim.Graffiti]: ['graffiti', 'work_gnaw'],
  [Anim.Dance]: ['dance', 'cheer'], [Anim.Music]: ['music', 'cheer'], [Anim.Game]: ['play', 'cheer'], [Anim.Jailed]: ['jailed', 'sick_idle'], [Anim.Strike]: ['protest', 'cheer'],
  [Anim.Trial]: ['idle'], [Anim.Lecture]: ['teach', 'announce', 'preach', 'idle'], [Anim.Repair]: ['repair', 'work', 'work_gnaw'], [Anim.Charge]: ['run'], [Anim.Tend]: ['work_gnaw', 'idle'], [Anim.Kiss]: ['court'],
};
const COAT = [0xffffff, 0xc9c6cc, 0x8a8790, 0xffffff, 0xfff0d8, 0xe8d4b8, 0xfff6f6, 0xe6e0e0];
const TIER = (r: number) => r;
interface RV { id: number; root: Container; body: Sprite; ghost: Sprite; tool: Sprite; light: Sprite | null; mark: Sprite | null; ring: Sprite | null; pip: Sprite | null;
  px: number; py: number; cx: number; cy: number; pd: number; cd: number; ph: number; ch: number; x: number; y: number; dist: number;
  snapY: number; rot: number; facing: number; flip: number; clipId: string; fade: number; seen: number; t0: number; off: number; i: number; lastAnim: number }

export class Actors {
  readonly layer = new Container({ label: 'rats', sortableChildren: false });
  readonly back = new Container({ label: 'actor-back' });   // items, corpses, posters (scene layer)
  readonly lights = new Container({ label: 'actor-lights' });
  rv = new Map<number, RV>(); private snap: Snapshot2 | null = null; private snapAt = 0; private tickMs = 250;
  gore = true; selected = -1; private frameNo = 0;
  private hz = new Map<number, { s: Sprite; px: number; py: number; cx: number; cy: number }>();
  private itemSpr = new Map<string, Sprite>();
  constructor(private terrain: Terrain) {}
  /** world grew to the left: keep sprites under the same tiles */
  shift(dxPx: number) {
    if (!dxPx) return;
    for (const v of this.rv.values()) { v.px += dxPx; v.cx += dxPx; v.x += dxPx; }
    for (const h of this.hz.values()) { h.px += dxPx; h.cx += dxPx; h.s.x += dxPx; }
  }
  ingest(s: Snapshot2, now: number) {
    const R = s.rats; this.tickMs = Math.max(4, s.tickMs || 80);
    const alive = new Set<number>();
    for (let i = 0; i < R.n; i++) {
      const id = R.id[i]; alive.add(id); let v = this.rv.get(id);
      const x = R.x[i] * PX, y = R.y[i] * PX;
      if (!v) { v = this.make(id, x, y); v.facing = R.facing[i] || 1; v.cd = v.pd = v.dist = R.dist[i]; v.ch = v.ph = R.heading[i]; }
      // restart interpolation from where the rat is DRAWN now (no pops when snapshots arrive early/late)
      v.px = v.x; v.py = v.y; v.pd = v.dist; v.ph = v.ch; v.cx = x; v.cy = y; v.cd = R.dist[i]; v.ch = R.heading[i];
      // teleports (respawn / edge jumps) — snap
      if (Math.abs(v.cx - v.px) > 120 || Math.abs(v.cy - v.py) > 120) { v.px = v.x = v.cx; v.py = v.y = v.cy; v.snapY = v.cy; v.pd = v.cd; }
      v.i = i; v.seen = now;
    }
    for (const [id, v] of this.rv) if (!alive.has(id)) { v.root.destroy({ children: true }); v.light?.destroy(); this.rv.delete(id); }
    this.snap = s; this.snapAt = now;
    this.syncHazards(s.hazards, now); this.syncStatics(s.corpses, s.items, s.posters);
  }
  private make(id: number, x: number, y: number): RV {
    const root = new Container(); const body = new Sprite(); const ghost = new Sprite(); const tool = new Sprite(); tool.visible = false; ghost.visible = false;
    root.addChild(ghost, body, tool); this.layer.addChild(root);
    const v: RV = { id, root, body, ghost, tool, light: null, mark: null, ring: null, pip: null, px: x, py: y, cx: x, cy: y, pd: 0, cd: 0, ph: 0, ch: 0, x, y, dist: 0, snapY: y, rot: 0, facing: 1, flip: 1, clipId: '', fade: 0, seen: 0, t0: performance.now() - Math.random() * 4000, off: (id * 0.6180339) % 1, i: 0, lastAnim: -1 };
    this.rv.set(id, v); return v;
  }
  private character(flags: number, stage: number): string {
    if (flags & RF.rodentoid) return has('rodentoid_walk') ? 'rodentoid' : 'worker';
    if (flags & RF.labrat) return has('labrat_walk') ? 'labrat' : 'worker';
    if (flags & RF.king) return 'king';
    if (stage === Stage.Pup) return 'pup';
    if (flags & RF.enforcer) return 'enforcer';
    if (flags & RF.herald) return 'herald';
    if (flags & RF.outcast) return 'outcast';
    if (flags & RF.founder) return 'founder';
    if (stage === Stage.Elder) return 'elder';
    return 'worker';
  }
  private pick(ch: string, anim: number, moving: boolean, carry: number, violent: boolean): Clip {
    let a = anim; if (LOCO.has(a) && !moving && a !== Anim.Climb) a = carry ? Anim.Idle : Anim.Idle;
    if (a === Anim.Carry && carry !== Carry.Pup) a = Anim.Haul;
    const cands = [...(MAP[a] ?? ['idle'])]; if (a === Anim.Dying && violent && this.gore) cands.unshift('die_violent');
    for (const c of cands) { const k = `${ch}_${c}`; const cl = clip(k); if (cl) return cl; }
    if (ch !== 'worker') return this.pick('worker', anim, moving, carry, violent);
    return clip('worker_idle')!;
  }
  /** per-frame update. zd = device px per world px; view in world px */
  update(now: number, zd: number, view: { x0: number; y0: number; x1: number; y1: number }, frozen: boolean) {
    const s = this.snap; if (!s) return; this.frameNo++;
    const R = s.rats; const a = frozen ? 0 : Math.min(1, (now - this.snapAt) / this.tickMs);
    const impostor = zd < 0.55; const dt = 16;
    for (const v of this.rv.values()) {
      const i = v.i; if (R.id[i] !== v.id) continue;
      v.x = v.px + (v.cx - v.px) * a; v.y = v.py + (v.cy - v.py) * a; v.dist = v.pd + (v.cd - v.pd) * a;
      const vis = v.x > view.x0 - 80 && v.x < view.x1 + 80 && v.y > view.y0 - 80 && v.y < view.y1 + 80; v.root.visible = vis;
      if (v.light) v.light.visible = vis; if (!vis) continue;
      const flags = R.flags[i], stage = R.stage[i], anim = R.anim[i], carry = R.carry[i];
      const moving = Math.abs(R.speed[i]) > 0.02 || Math.abs(v.cd - v.pd) > 0.01;
      const ch = this.character(flags, stage);
      const c = impostor ? (clip(`${ch}_idle`) ?? clip('worker_idle')!) : this.pick(ch, anim, moving, carry, false);
      // crossfade on clip change
      if (c.id !== v.clipId) { if (v.clipId && !impostor) { v.ghost.texture = v.body.texture; v.ghost.anchor.copyFrom(v.body.anchor); v.ghost.position.copyFrom(v.body.position); v.ghost.visible = true; v.fade = 1; } v.clipId = c.id; v.t0 = now; }
      if (v.fade > 0) { v.fade -= dt / 140; v.ghost.alpha = Math.max(0, v.fade); v.body.alpha = 1 - Math.max(0, v.fade) * 0.6; if (v.fade <= 0) { v.ghost.visible = false; v.body.alpha = 1; } }
      // frame selection
      let f = 0; const n = c.frames.length;
      if (!impostor) {
        if (LOCO.has(anim) && moving && /walk|run|patrol|limp|squeeze|swim|haul|carry|steal/.test(c.id)) {
          const stride = STRIDE_TILES[Math.min(3, stage)] * (anim === Anim.Run || anim === Anim.Flee || anim === Anim.Charge ? 1.35 : 1) * (c.id.includes('run') ? 1.6 : 1);
          f = Math.floor((((v.dist / stride + v.off) % 1) + 1) % 1 * n) % n;
        } else {
          const t = (now - v.t0) / 1000; const fps = c.fps * (anim === Anim.Dead ? 0 : 1);
          f = c.loop ? Math.floor(t * fps + v.off * n) % n : Math.min(n - 1, Math.floor(t * fps));
          if (anim === Anim.Dead) f = n - 1;
        }
      }
      v.body.texture = c.frames[f]; v.body.anchor.set(c.ax, c.ay);
      // facing: squash-flip turn
      const fc = R.facing[i] || 1; if (fc !== v.facing) v.facing = fc;
      v.flip += (v.facing - v.flip) * Math.min(1, dt / 70); if (Math.abs(v.flip - v.facing) < 0.02) v.flip = v.facing;
      const sx = Math.sign(v.flip || v.facing) * Math.max(0.15, Math.abs(v.flip));
      // slope / climb rotation from heading (sprite space: positive = clockwise)
      let hx = Math.cos(v.ch), hy = Math.sin(v.ch); if (!moving && anim !== Anim.Climb) { hx = 1; hy = 0; }
      let target = v.facing * Math.atan2(hy, Math.abs(hx)); const steep = Math.abs(target) > 1.0 || anim === Anim.Climb;
      if (!steep) target = Math.max(-0.35, Math.min(0.35, target));
      else {
        const fl = this.terrain.floorBelow(v.x, v.y - 6, 22);
        if (fl - (v.y - 6) < 16) target = Math.max(-0.28, Math.min(0.28, target));
        else target = Math.max(-1.15, Math.min(1.15, target));
      }
      let d = target - v.rot; d = Math.atan2(Math.sin(d), Math.cos(d)); v.rot += d * Math.min(1, dt / 90);
      // feet on the painted floor. Search down through a body-height, and climb out if the sim point is inside dirt.
      let fy = v.y;
      const col = Math.max(0, Math.min(this.terrain.W - 1, Math.floor(v.x / PX)));
      const under = v.y > this.terrain.T.surfaceY[col] * PX - 4;
      if (!impostor && anim !== Anim.Swim && under) {
        let probe = v.y;
        if (!this.terrain.isOpenPx(v.x, probe)) {
          let y = Math.floor(probe);
          for (let k = 0; k < 18 && y > 0 && !this.terrain.isOpenPx(v.x, y); k++) y--;
          probe = y;
        }
        // a floor is the dirt under their feet, not the bottom of an open shaft
        const fl = this.terrain.floorBelow(v.x, probe + 1, 12);
        if (fl - probe >= -1 && fl - probe <= 12) fy = fl;
      }
      const gap = fy - v.snapY;
      if (Math.abs(gap) > 12) v.snapY = fy; else v.snapY += gap * 0.72;
      // a rat must fit the tunnel: native art is ~52px, a room is only a few tiles tall
      let sc = (R.size[i] || 1) * 0.56; if (ch === 'pup') sc *= 0.62; if (ch === 'king' || flags & RF.leader) sc *= 1.12;
      sc = Math.max(0.28, Math.min(0.78, sc));
      if (anim === Anim.Squeeze && !c.id.includes('squeeze')) { v.body.scale.set(sx * sc, sc * 0.8); } else v.body.scale.set(sx * sc, sc);
      v.ghost.scale.copyFrom(v.body.scale);
      v.body.position.set(c.dx[f] * v.facing * sc, c.dy[f] * sc);
      let tint = COAT[R.coat[i] & 7];
      if (flags & RF.rodentoid && ch !== 'rodentoid') tint = 0x9fb8c8;
      else if (flags & RF.labrat && ch !== 'labrat') tint = 0xfff8f8;
      if (anim === Anim.Risen || flags & RF.risen) tint = 0xa8dca0; else if (flags & RF.cursed) tint = 0xc8a8d0;
      if (flags & RF.jailed) tint = ((tint >> 1) & 0x7f7f7f) + 0x303030;
      v.body.tint = tint; v.ghost.tint = tint;
      // swimming bob
      const bob = anim === Anim.Swim ? Math.sin(now * 0.006 + v.off * 6) * 1.5 : 0;
      v.root.position.set(Math.round(v.x * 4) / 4, Math.round((v.snapY + bob) * 4) / 4); v.root.rotation = v.rot;
      // held tool / tech prop
      const tool = R.tool?.[i] ?? 0;
      if (tool && !impostor) { v.tool.visible = true; v.tool.texture = toolTexture(tool, Math.floor(now / 120 + v.off * 7) % 3); v.tool.anchor.set(0.5, 1); v.tool.scale.set(v.facing, 1);
        v.tool.position.set(v.facing * c.w * 0.3 * sc, -c.top * 0.35 * sc); } else v.tool.visible = false;
      const glow = tool === 1 || tool === 6 || tool === 8 || (flags & RF.blessed) || (flags & RF.rodentoid) || tool === 5;
      if (glow) { if (!v.light) { v.light = new Sprite(lightTexture()); v.light.anchor.set(0.5); v.light.blendMode = 'add'; this.lights.addChild(v.light); }
        const L = v.light; const fl = 0.85 + Math.sin(now * 0.02 + v.off * 9) * 0.08 + Math.sin(now * 0.053) * 0.05;
        if (tool === 1) { L.tint = 0xffa040; L.scale.set(1.3 * fl); L.alpha = 0.9; } else if (tool === 6) { L.tint = 0xffc070; L.scale.set(1.7 * fl); L.alpha = 0.85; }
        else if (tool === 8) { L.tint = 0xf2b46a; L.scale.set(1.5 * fl); L.alpha = 0.95; } else if (tool === 5) { L.tint = 0x60e0ff; L.scale.set(0.7 + Math.random() * 0.3); L.alpha = 0.7; } else if (flags & RF.rodentoid) { L.tint = 0x40d0e0; L.scale.set(0.45); L.alpha = 0.6; } else { L.tint = 0xffe08a; L.scale.set(1.1); L.alpha = 0.6; }
        L.position.set(v.x, v.snapY - 12); } else if (v.light) { v.light.destroy(); v.light = null; }
      // selection: gold ring at the feet, chevron over the head, body warmed
      if (v.id === this.selected) {
        if (!v.ring) { v.ring = new Sprite(ringTexture()); v.ring.anchor.set(0.5, 0.5); v.root.addChildAt(v.ring, 0); }
        if (!v.mark) { v.mark = new Sprite(markTexture()); v.mark.anchor.set(0.5, 1); v.mark.scale.set(1.5); v.root.addChild(v.mark); }
        const pulse = 0.5 + Math.sin(now * 0.008) * 0.5;
        v.ring.position.set(0, 2); v.ring.rotation = -v.rot; v.ring.scale.set(sc * (0.9 + pulse * 0.12)); v.ring.alpha = 0.8 + pulse * 0.2;
        v.mark.position.set(0, -c.top * sc - 8 + Math.sin(now * 0.008) * 2); v.mark.rotation = -v.rot;
        v.body.tint = mixTint(tint, 0xf2b46a, 0.28 + pulse * 0.22);
      } else {
        if (v.mark) { v.mark.destroy(); v.mark = null; }
        if (v.ring) { v.ring.destroy(); v.ring = null; }
      }
      const mood = anim === Anim.Fight ? 'anger' : anim === Anim.Flee || anim === Anim.Cower ? 'fear' : anim === Anim.Mate || anim === Anim.Kiss ? 'love' : '';
      if (mood) {
        if (!v.pip) { v.pip = new Sprite(pipTex(mood)); v.pip.anchor.set(0.5, 1); v.root.addChild(v.pip); }
        v.pip.visible = true; v.pip.texture = pipTex(mood);
        v.pip.position.set(v.facing * 7, -c.top * sc - 6); v.pip.rotation = -v.rot; v.pip.scale.set(1.6);
      } else if (v.pip) v.pip.visible = false;
    }
    this.updateHazards(now);
  }
  /** nearest rat to a world point. r is a horizontal slack; the body is a column from the feet up. */
  pickAt(wx: number, wy: number, r: number): number {
    const all = this.pickAll(wx, wy, r); return all[0] ?? -1;
  }
  /** every rat under a finger, nearest first, so a crowd can be stepped through */
  pickAll(wx: number, wy: number, r: number): number[] {
    const hits: { id: number; d: number }[] = []; const r2 = r * r;
    for (const v of this.rv.values()) {
      if (!v.root.visible) continue;
      const top = v.snapY - 40, bot = v.snapY + 8;
      const cy = wy < top ? top : wy > bot ? bot : wy;
      const d = (v.x - wx) * (v.x - wx) + (cy - wy) * (cy - wy);
      if (d <= r2) hits.push({ id: v.id, d });
    }
    hits.sort((a, b) => a.d - b.d);
    return hits.map((h) => h.id);
  }
  posOf(id: number) { const v = this.rv.get(id); return v ? { x: v.x, y: v.snapY - 14 } : null; }
  // ───── hazards, corpses, items, posters ─────
  private syncHazards(H: Hazard[], now: number) {
    const keep = new Set<number>();
    for (const h of H) { keep.add(h.id); let e = this.hz.get(h.id); const x = h.x * PX, y = h.y * PX;
      if (!e) { const s = new Sprite(); s.anchor.set(0.5, 1); this.layer.addChild(s); e = { s, px: x, py: y, cx: x, cy: y }; this.hz.set(h.id, e); }
      e.px = e.s.x || x; e.py = e.s.y || y; e.cx = x; e.cy = y;
      const k = h.kind === 'cat' ? `cat_${h.anim === 'pounce' || h.anim === 'strike' ? 'pounce' : h.anim === 'eat' ? 'eat_kill' : h.anim === 'idle' || h.anim === 'lie' ? 'idle_tail' : 'prowl'}`
        : h.kind === 'drone' || h.kind === 'exterminator' ? `exterminator_drone_${h.anim === 'spray' ? 'spray_gas' : h.anim === 'idle' ? 'scan' : 'hover'}`
        : h.kind === 'boot' && this.gore ? 'giant_boot' /* the stomp art shows blood: gore-gated, otherwise just the falling shadow */ : '';
      const c = k ? clip(k) : null; (e.s as any).__clip = c; (e.s as any).__kind = h.kind; e.s.scale.x = h.facing; e.s.visible = !!c || h.kind === 'boot';
      if (!c && h.kind === 'boot') { e.s.texture = shadowTexture(); e.s.anchor.set(0.5, 0.5); e.s.alpha = 0.55; }
      void now;
    }
    for (const [id, e] of this.hz) if (!keep.has(id)) { e.s.destroy(); this.hz.delete(id); }
  }
  private updateHazards(now: number) {
    const a = Math.min(1, (now - this.snapAt) / this.tickMs);
    for (const e of this.hz.values()) { const c: Clip | null = (e.s as any).__clip; e.s.position.set(e.px + (e.cx - e.px) * a, e.py + (e.cy - e.py) * a);
      if (c) { e.s.texture = c.frames[Math.floor(now / 1000 * c.fps) % c.frames.length]; e.s.anchor.set(c.ax, c.ay); } }
  }
  private syncStatics(C: Corpse[], I: Item[], P: Poster[]) {
    const keep = new Set<string>();
    const put = (key: string, id: string, x: number, y: number, tint = 0xffffff, sc = 1) => { keep.add(key); let s = this.itemSpr.get(key); const c = clip(id); if (!c) return;
      if (!s) { s = new Sprite(c.frames[0]); s.anchor.set(0.5, 1); this.back.addChild(s); this.itemSpr.set(key, s); } else s.texture = c.frames[0];
      const fy = this.terrain.floorBelow(x, y - 6, 18); s.position.set(x, fy < y + 12 ? fy : y); s.tint = tint; s.scale.set(sc); };
    for (const c of C) { const id = !this.gore ? 'prop_corpse_skeleton' : c.decay > 0.66 ? 'prop_corpse_skeleton' : c.decay > 0.33 ? 'prop_corpse_bloated' : c.violent ? 'prop_kill_remains' : 'prop_corpse_fresh';
      put('c' + c.id, id, c.x * PX, c.y * PX, this.gore ? COAT[c.coat & 7] : 0x9a9aa0, Math.max(0.5, c.size || 1)); }
    const FOOD = ['prop_food_crumb', 'prop_cheese_rind', 'prop_rotten_fruit'], SCRAP = ['prop_bottle_cap_pile', 'prop_battery', 'prop_wire_coil'];
    for (const it of I) { const id = it.kind === 'food' ? FOOD[it.id % 3] : it.kind === 'scrap' ? SCRAP[it.id % 3] : it.kind === 'bait' ? 'prop_pebble' : it.kind === 'poster' ? 'prop_poster_scrap' : 'prop_pebble_bowl';
      put('i' + it.id, id, it.x * PX, it.y * PX, it.kind === 'bait' ? 0x9be070 : 0xffffff, 0.75); }
    for (const p of P) put('p' + p.id, p.torn ? 'prop_law_poster_torn' : 'prop_law_poster_fresh', p.x * PX, p.y * PX, 0xffffff, 0.6);
    for (const [k, s] of this.itemSpr) if (!keep.has(k)) { s.destroy(); this.itemSpr.delete(k); }
  }
}
let _mark: Texture | null = null;
function markTexture() { if (_mark) return _mark; const c = document.createElement('canvas'); c.width = 9; c.height = 7; const g = c.getContext('2d')!;
  g.fillStyle = '#080d0a'; for (let y = 0; y < 6; y++) g.fillRect(y - 0, y, 9 - y * 2 + 0, 1); g.fillStyle = '#f2b46a'; for (let y = 0; y < 4; y++) g.fillRect(y + 1, y, 7 - y * 2, 1);
  _mark = Texture.from(c); _mark.source.scaleMode = 'nearest'; return _mark; }
function ringTexture() {
  if (_ring) return _ring; const c = document.createElement('canvas'); c.width = 28; c.height = 12; const g = c.getContext('2d')!;
  g.strokeStyle = '#f2b46a'; g.lineWidth = 2; g.beginPath(); g.ellipse(14, 6, 11, 4, 0, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#080d0a'; g.lineWidth = 1; g.beginPath(); g.ellipse(14, 6, 13, 5, 0, 0, Math.PI * 2); g.stroke();
  _ring = Texture.from(c); _ring.source.scaleMode = 'nearest'; return _ring;
}
function mixTint(a: number, b: number, t: number) {
  const ch = (s: number, m: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t) & 255;
  return (ch(16, 0) << 16) | (ch(8, 0) << 8) | ch(0, 0);
}
let _ring: Texture | null = null;
const _pip = new Map<string, Texture>();
function pipTex(kind: string) {
  const hit = _pip.get(kind); if (hit) return hit;
  const c = document.createElement('canvas'); c.width = 5; c.height = 5; const g = c.getContext('2d')!;
  const px = (x: number, y: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  if (kind === 'anger') { px(1, 0, '#e84b5a'); px(3, 0, '#e84b5a'); px(0, 2, '#e84b5a'); px(2, 2, '#fff2c0'); px(4, 2, '#e84b5a'); px(1, 4, '#e84b5a'); px(3, 4, '#e84b5a'); }
  else if (kind === 'fear') { px(1, 0, '#45eaf0'); px(3, 0, '#45eaf0'); px(2, 2, '#d8d0c4'); px(1, 4, '#45eaf0'); px(3, 4, '#45eaf0'); }
  else { px(1, 1, '#e84b5a'); px(3, 1, '#e84b5a'); px(0, 2, '#e84b5a'); px(2, 2, '#e84b5a'); px(4, 2, '#e84b5a'); px(1, 3, '#e84b5a'); px(3, 3, '#e84b5a'); px(2, 4, '#e84b5a'); }
  const t = Texture.from(c); t.source.scaleMode = 'nearest'; _pip.set(kind, t); return t;
}
let _shadow: Texture | null = null;
function shadowTexture() { if (_shadow) return _shadow; const c = document.createElement('canvas'); c.width = 64; c.height = 16; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 8, 2, 32, 8, 32); gr.addColorStop(0, 'rgba(0,0,0,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 16);
  _shadow = Texture.from(c); return _shadow; }
void TIER;
