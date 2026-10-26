// PixiJS world view: integer-scaled pixel art, nearest-neighbour, driven by worker snapshots.
import { Application, Container, Graphics, Rectangle, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { Snapshot } from '../sim/sim';
import { Act, R, ROOM_KINDS, SURFACE, TPD } from '../sim/types';
import { anim, tex, isFinal, setGoreArt, seamless, type Anim } from './assets';
import { box, h01, ROOM_BOX, route, spot, streetX, SHAFT_X, STREET_BOX, STREET_H, THRONE_SEAT, THRONE_Y, WORLD_H, WORLD_W } from './layout';
import { paintRoom, P } from './roomart';
import { Camera } from './camera';

interface RatView { keyAt: number; curKey: string; frameIdx: number; moving: boolean; id: number; sp: Sprite; x: number; y: number; path: { x: number; y: number }[]; speed: number; room: number; act: number; flags: number; face: 1 | -1; wanderAt: number; salt: number; tex: string; phase: number }
const hex = (c: string) => parseInt(c.slice(1), 16);
/** a looping (or one-shot) final-art sprite: frame chosen from the clock */
class Fx { sp: Sprite; t0 = performance.now(); constructor(public key: string, x: number, y: number, public phase = 0, parent?: Container) { const a = anim(key); this.sp = new Sprite(a.frames[0]); this.sp.anchor.set(a.anchor[0], a.anchor[1]); this.sp.x = x; this.sp.y = y; parent?.addChild(this.sp); }
  tick(now: number, run = true) { const a = anim(this.key); const n = a.frames.length; if (!run || n < 2) { this.sp.texture = a.frames[0]; return; } const f = Math.floor(((now - this.t0) / 1000) * a.fps + this.phase); this.sp.texture = a.frames[a.loop ? f % n : Math.min(n - 1, f)]; }
  done(now: number) { const a = anim(this.key); return !a.loop && ((now - this.t0) / 1000) * a.fps >= a.frames.length; } }
/** scripted hazard actor (cat, boot, drone): a list of timed legs, each with its own animation */
interface Leg { key: string; ms: number; x0: number; x1: number; y: number; face: 1 | -1 }
class Actor { fx: Fx; i = 0; legT = performance.now(); constructor(public legs: Leg[], parent: Container) { const l = legs[0]; this.fx = new Fx(l.key, l.x0, l.y, 0, parent); }
  tick(now: number): boolean { let l = this.legs[this.i]; while (now - this.legT > l.ms) { this.legT += l.ms; this.i++; if (this.i >= this.legs.length) { this.fx.sp.destroy(); return false; } l = this.legs[this.i]; this.fx.key = l.key; this.fx.t0 = this.legT; const a: Anim = anim(l.key); this.fx.sp.anchor.set(a.anchor[0], a.anchor[1]); }
    const k = Math.min(1, (now - this.legT) / l.ms); this.fx.sp.x = Math.round(l.x0 + (l.x1 - l.x0) * k); this.fx.sp.y = l.y; this.fx.sp.scale.x = l.face; this.fx.tick(now); return true; } }

export class World {
  app = new Application();
  cam!: Camera;
  root = new Container();
  layers = { back: new Container(), rooms: new Container(), props: new Container(), posters: new Container(), corpses: new Container(), rats: new Container(), fx: new Container() };
  rats = new Map<number, RatView>();
  roomSprites: { interior: Sprite; undug: TilingSprite; src: Texture; ox: number; oy: number; level: number }[] = [];
  corpseSprites = new Map<number, { sp: Sprite; key: string; flies: Fx | null; blood: Fx | null }>();
  itemSprites = new Map<number, Sprite>();
  posterSprites = new Map<string, Sprite>();
  heraldSprites = new Map<number, Container>();
  granaryPile = new Container();
  plazaPebbles = new Container();
  tablets = new Container();
  tunnels = new Graphics();
  wheel!: Fx; loops: { fx: Fx; room: number }[] = []; stamp: Fx | null = null; actors: Actor[] = []; drone: Fx | null = null;
  fleas: Fx[] = []; roaches: { fx: Fx; room: number; x0: number; x1: number; sp: number }[] = [];
  crownedAt = -1e9; followOffsetCss = 0;
  night = new Graphics();
  snap: Snapshot | null = null;
  tickMs = 1000;
  lastSnapAt = 0;
  gore = true;
  onTapRat: (id: number | null) => void = () => {};
  onTapThrone: () => void = () => {};
  fps = 0; private fpsAcc = 0; private fpsN = 0;
  followId: number | null = null;
  pressFlash = 0;
  lastPressed: string | null = null;

  async init(host: HTMLElement) {
    const dpr = Math.min(window.devicePixelRatio || 1, 4);
    await this.app.init({ width: Math.floor(host.clientWidth * dpr), height: Math.floor(host.clientHeight * dpr), resolution: 1, antialias: false, background: '#080d0a', roundPixels: true, autoDensity: false, powerPreference: 'high-performance', preference: 'webgl' });
    const cv = this.app.canvas; cv.style.display = 'block'; cv.style.imageRendering = 'pixelated'; cv.setAttribute('aria-label', 'The rat city');
    host.appendChild(cv);
    this.app.stage.addChild(this.root);
    for (const l of Object.values(this.layers)) this.root.addChild(l);
    this.layers.back.isRenderGroup = true;
    this.host = host;
    this.cam = new Camera(this.app, this.root, WORLD_W, WORLD_H, dpr);
    this.cam.devW = this.app.renderer.width; this.cam.devH = this.app.renderer.height; this.cam.fitDefault(); this.updateRes(true);
    this.cam.onTap = (wx, wy) => this.tap(wx, wy); this.cam.padTop = 240 * dpr; this.cam.padBot = 90 * dpr;
    this.buildStatic();
    this.app.ticker.add((t) => this.frame(t.deltaMS));
    const ro = new ResizeObserver(() => this.resize(host)); ro.observe(host);
  }

  host!: HTMLElement;
  /** Render at the coarsest internal resolution that keeps every world pixel an exact block of device pixels. */
  updateRes(force = false) {
    const dpr = this.cam.dpr; const z = this.cam.z;
    let d = 1; for (let k = Math.floor(dpr); k >= 1; k--) if (z % k === 0) { d = k; break; }
    if (!force && d === this.cam.res) return;
    this.cam.res = d;
    const W = Math.ceil(this.cam.devW / d), H = Math.ceil(this.cam.devH / d);
    this.app.renderer.resize(W, H);
    const cv = this.app.canvas; cv.style.width = (W * d) / dpr + 'px'; cv.style.height = (H * d) / dpr + 'px';
  }
  resize(host: HTMLElement) {
    const dpr = Math.min(window.devicePixelRatio || 1, 4);
    this.cam.devW = Math.floor(host.clientWidth * dpr); this.cam.devH = Math.floor(host.clientHeight * dpr);
    this.cam.dpr = dpr; this.updateRes(true); this.cam.padTop = 240 * dpr; this.cam.padBot = 90 * dpr; this.cam.clamp();
  }

  buildStatic() {
    const back = this.layers.back;
    // the earth: final burrow tiles (0 roots, 1 brick, 2 pipes), tiled under everything
    const earth = new TilingSprite({ texture: seamless('tile_earth'), width: WORLD_W, height: WORLD_H - STREET_H }); earth.y = STREET_H; earth.tint = 0x5a5862; back.addChild(earth);
    const shaft = new TilingSprite({ texture: tex('tile_pipe'), width: 40, height: THRONE_Y - STREET_H + 30 }); shaft.x = SHAFT_X - 20; shaft.y = STREET_H - 10; back.addChild(shaft);
    const tbx = ROOM_BOX[R.throne];
    const collar = new TilingSprite({ texture: tex('tile_brick'), width: tbx.w + 32, height: tbx.h + 24 }); collar.x = tbx.x - 16; collar.y = tbx.y - 12; collar.tint = 0x8a8a90; back.addChild(collar);
    // tunnels from the shaft into each room row
    const tg = this.tunnels;
    for (const b of ROOM_BOX) {
      if (!b || b === ROOM_BOX[R.throne]) continue;
      const left = b.x < SHAFT_X; const tx = left ? b.x + b.w : SHAFT_X + 20; const tw = left ? SHAFT_X - 20 - tx : b.x - tx;
      tg.rect(tx, b.floor - 30, tw, 32).fill(hex(P.ink1)); tg.rect(tx, b.floor + 2, tw, 2).fill(hex(P.g4));
    }
    back.addChild(tg);
    // street: final parallax skyline + mid buildings tiled across, the alley scene centred over the shaft
    const far = new TilingSprite({ texture: tex('city_far'), width: WORLD_W, height: tex('city_far').height }); back.addChild(far);
    const mid = new TilingSprite({ texture: tex('city_mid'), width: WORLD_W, height: tex('city_mid').height }); mid.y = STREET_H - mid.height; back.addChild(mid);
    const st = tex('bg_street'); const s1 = new Sprite(st); s1.x = Math.round(SHAFT_X - st.width / 2); s1.y = STREET_H - st.height; back.addChild(s1);
    // throne hall (final art), shown whole
    const tb = tex('bg_throne'); const throne = new Sprite(tb); throne.x = tbx.x + Math.floor((tbx.w - tb.width) / 2); throne.y = tbx.y + Math.floor((tbx.h - tb.height) / 2); back.addChild(throne);
    // rooms: each final scene is 360×220, the room box is exactly that, so it is shown 1:1 (revealed as it is dug)
    ROOM_KINDS.forEach((k, i) => {
      const b = ROOM_BOX[i]; if (!b || i === R.throne) { this.roomSprites[i] = null as never; return; }
      const fk = 'bg_' + k; const fin = isFinal(fk);
      const src = fin ? tex(fk) : paintRoom(k, b.w, b.h, 100 + i);
      const ox = fin ? Math.max(0, Math.floor((src.width - b.w) / 2)) : 0, oy = fin ? Math.max(0, src.height - b.h) : 0;
      const interior = new Sprite(src); interior.visible = false;
      const undug = new TilingSprite({ texture: seamless('tile_earth'), width: b.w, height: b.h }); undug.x = b.x; undug.y = b.y; undug.tint = 0x48464e; undug.tilePosition.x = -b.x; undug.tilePosition.y = -b.y;
      this.layers.rooms.addChild(undug, interior);
      this.roomSprites[i] = { interior, undug, src, ox, oy, level: -1 };
    });
    // ambient fx loops (final art), shown only once their room exists
    const F = this.layers.props; const L = (key: string, room: number, x: number, y: number) => { const fx = new Fx(key, Math.round(x), Math.round(y), h01(x | 0, y | 0) * 8, F); this.loops.push({ fx, room }); };
    const SX = Math.round(SHAFT_X - 180); // street scene origin
    L('fx_rain', -1, SX + 140, STREET_H - 44); L('fx_neon', -1, SX + 420, 46); L('fx_neon', -1, 70, 70); L('fx_steam', -1, SX + 262, STREET_H - 60); L('fx_fire', -1, WORLD_W - 70, STREET_H - 24); L('fx_fire', -1, 44, STREET_H - 22);
    const B = (r: number) => ROOM_BOX[r];
    L('fx_drip', R.entrance, B(R.entrance).x + 60, B(R.entrance).y + 30); L('fx_drip', R.entrance, B(R.entrance).x + 290, B(R.entrance).y + 26); L('fx_sewage', R.entrance, B(R.entrance).x + 180, B(R.entrance).floor + 6);
    for (const r of [R.shrine, R.barracks]) { L('fx_lamp', r, B(r).x + 40, B(r).y + 40); L('fx_lamp', r, B(r).x + B(r).w - 40, B(r).y + 40); }
    L('fx_lamp', R.throne, tbx.x + 248, tbx.y + 60); L('fx_drip', R.throne, tbx.x + 300, tbx.y + 150);
    L('fx_arrow', R.plaza, B(R.plaza).x + B(R.plaza).w / 2, B(R.plaza).y + 36);
    L('fx_drip', R.graveyard, B(R.graveyard).x + 90, B(R.graveyard).y + 28);
    for (const r of [R.graveyard, R.slum]) { const b = B(r); for (let j = 0; j < 2; j++) { const fx = new Fx('roach', b.x + 40 + j * 200, b.floor - 2, j * 3, F); this.roaches.push({ fx, room: r, x0: b.x + 24, x1: b.x + b.w - 24, sp: 0.012 + j * 0.006 }); } }
    // workshop treadwheel (final loop, turns only while rats run it)
    const wb = ROOM_BOX[R.workshop]; this.wheel = new Fx('fx_wheel', wb.x + wb.w - 64, wb.floor - 36, 0, F);
    F.addChild(this.granaryPile, this.plazaPebbles, this.tablets);
    // the static backdrop never changes: flatten it into one texture (one quad instead of ~10 overlapping layers)
    this.layers.back.cacheAsTexture({ resolution: 1, antialias: false, scaleMode: 'nearest' });
    this.night.rect(0, 0, WORLD_W, STREET_H).fill({ color: hex(P.vio0), alpha: 1 }); this.night.alpha = 0; this.layers.fx.addChild(this.night);
  }

  /** the king's red button on the throne art (native 110,95 in bg_throne_hall) */
  get buttonPos() { const tb = ROOM_BOX[R.throne]; return { x: tb.x + 110, y: tb.y + 96 }; }

  /** hazards made visible: called with each new sim event */
  onSimEvent(kind: string) {
    const now = performance.now(); const fy = STREET_BOX.floor; const gx = SHAFT_X - 40;
    if (kind === 'cat') {
      this.actors.push(new Actor([
        { key: 'cat', ms: 2200, x0: WORLD_W + 80, x1: gx + 70, y: fy, face: -1 },
        { key: 'cat_pounce', ms: 450, x0: gx + 70, x1: gx + 10, y: fy, face: -1 },
        { key: 'cat_eat', ms: 2600, x0: gx + 10, x1: gx + 10, y: fy, face: -1 },
        { key: 'cat_idle', ms: 900, x0: gx + 10, x1: gx + 10, y: fy, face: 1 },
        { key: 'cat', ms: 2400, x0: gx + 10, x1: WORLD_W + 90, y: fy, face: 1 },
      ], this.layers.fx));
    } else if (kind === 'boot') {
      const x = 120 + Math.floor(h01(now | 0, 3) * (WORLD_W - 240));
      this.actors.push(new Actor([{ key: 'boot', ms: 700, x0: x, x1: x, y: fy + 4, face: 1 }, { key: 'boot', ms: 1, x0: x, x1: x, y: -400, face: 1 }], this.layers.fx));
    } else if (kind === 'gas') {
      this.actors.push(new Actor([
        { key: 'drone', ms: 1400, x0: -60, x1: gx, y: 96, face: 1 },
        { key: 'drone_spray', ms: 3200, x0: gx, x1: gx, y: 96, face: 1 },
        { key: 'drone', ms: 1600, x0: gx, x1: WORLD_W + 60, y: 80, face: 1 },
      ], this.layers.fx));
      this.actors.push(new Actor([{ key: 'fx_gas', ms: 1500, x0: gx, x1: gx, y: -400, face: 1 }, { key: 'fx_gas', ms: 4200, x0: gx + 10, x1: gx + 40, y: fy - 20, face: 1 }], this.layers.fx));
    } else if (kind === 'crowned') this.crownedAt = now;
  }

  setSnapshot(snap: Snapshot, tickMs: number) {
    const prev = this.snap; this.snap = snap; this.tickMs = tickMs; this.lastSnapAt = performance.now();
    this.syncRooms(snap); this.syncRats(snap, prev); this.syncCorpses(snap); this.syncItems(snap); this.syncPosters(snap); this.syncHeralds(snap); this.drawProps(snap);
    if (snap.mind?.lastPressed && snap.mind.lastPress === snap.tick - 1) this.pressFlash = 1;
  }

  syncRooms(s: Snapshot) {
    s.rooms.forEach((r, i) => {
      const rs = this.roomSprites[i]; if (!rs) return;
      const b = ROOM_BOX[i];
      const frac = r.level >= 1 ? 1 : r.cost > 0 ? Math.min(1, r.dug / r.cost) : 0;
      const key = r.level >= 1 ? 1000 : Math.round(frac * 40);
      if (key === rs.level) return; rs.level = key;
      const fx = rs.src.frame.x, fy = rs.src.frame.y;
      if (r.level >= 1 || frac > 0) {
        const full = r.level >= 1;
        const w = full ? b.w : Math.max(8, Math.round(b.w * frac)); const left = b.x < SHAFT_X;
        const cx = full ? 0 : left ? b.w - w : 0, cy = full ? 0 : Math.round(b.h * 0.35), ch = b.h - cy;
        rs.interior.texture = new Texture({ source: rs.src.source, frame: new Rectangle(fx + rs.ox + cx, fy + rs.oy + cy, w, ch) });
        rs.interior.x = b.x + cx; rs.interior.y = b.y + cy; rs.interior.visible = true;
        rs.undug.visible = !full;
      } else { rs.interior.visible = false; rs.undug.visible = true; }
    });
  }

  ratTexKey(act: number, flags: number, isFounder: boolean, id = 0): string {
    if (flags & 16) {
      if (this.snap?.king.dying || act === Act.Sick) return 'king_sick';
      if (performance.now() - this.crownedAt < 2600) return 'king_crowned';
      switch (act) { case Act.Press: return 'king_press'; case Act.Feast: return (this.snap?.king.luxury ?? 0) > 0.6 ? 'king_indulge' : 'king_feast'; case Act.Starve: return 'king_starve'; case Act.Scraps: return 'king_scraps'; case Act.Sleep: return 'king_sleep'; case Act.Shake: return 'king_frustrated'; case Act.Dead: return 'king_die'; default: return 'king'; }
    }
    if (flags & 1) return act === Act.Suckle ? 'pup_suckle' : act === Act.Play ? 'pup_play' : act === Act.Dead ? 'pup_die' : 'pup';
    if (flags & 64) return act === Act.Fight ? 'enforcer_beat' : act === Act.Patrol ? 'enforcer_walk' : 'enforcer';
    if (isFounder) return act === Act.Dig ? 'alt_dig' : act === Act.Haul ? 'alt_build' : 'alt';
    if (flags & 32 && (act === Act.Idle || act === Act.Teach || act === Act.Pray)) return act === Act.Teach ? 'elder_teach' : 'elder';
    if (flags & 128 && (act === Act.Idle || act === Act.Beg || act === Act.Scraps)) return act === Act.Beg ? 'outcast_beg' : act === Act.Scraps ? 'outcast_steal' : 'outcast';
    switch (act) {
      case Act.Dig: return 'rat_dig'; case Act.Haul: return 'rat_haul'; case Act.Sleep: return 'rat_sleep'; case Act.Wheel: return 'rat_wheel'; case Act.Gnaw: return 'rat_gnaw';
      case Act.Eat: case Act.Scraps: return h01(id, 11) < 0.3 ? 'rat_drink' : 'rat_eat'; case Act.Vote: return 'rat_vote'; case Act.Protest: return 'rat_protest'; case Act.Cheer: return 'rat_cheer'; case Act.Fight: return 'rat_fight';
      case Act.Starve: return 'rat_starve'; case Act.Collapse: return 'rat_collapse'; case Act.Cower: case Act.Pray: return 'rat_cower'; case Act.Sick: return 'rat_sick'; case Act.Nurse: return 'rat_nurse'; case Act.Dead: return 'rat_die';
      case Act.Beg: return 'rat_cower'; case Act.Teach: return 'rat_groom';
      default: return h01(id, 13) < 0.25 ? 'rat_groom' : 'rat';
    }
  }

  targetFor(s: Snapshot, i: number, v: RatView): { x: number; y: number } {
    const id = s.ids[i], room = s.room[i], fl = s.flags[i];
    if (fl & 16 && s.phase !== 'founding') return { x: THRONE_SEAT.x, y: THRONE_SEAT.y };
    if (s.phase === 'founding' && id === s.founderId) {
      const f = s.founder;
      if (room === SURFACE && (f.task === 'pick' || f.task === 'toSurface')) return { x: streetX(f.itemX), y: STREET_BOX.floor };
    }
    if (room === R.plaza && s.phase === 'gathering') { const b = box(room); return { x: b.x + 30 + h01(id, 3) * (b.w - 60), y: b.floor - h01(id, 9) * 30 }; }
    return spot(room, id, v.salt);
  }

  syncRats(s: Snapshot, _prev: Snapshot | null) {
    const seen = new Set<number>();
    const founderId = s.phase === 'founding' ? s.founderId : -1;
    for (let i = 0; i < s.n; i++) {
      const id = s.ids[i]; seen.add(id);
      let v = this.rats.get(id);
      const room = s.room[i], act = s.act[i], fl = s.flags[i];
      if (!v) {
        const sp = new Sprite(tex('rat')); sp.anchor.set(0.5, 1);
        const start = fl & 1 ? spot(R.nursery, id) : spot(room, id);
        v = { keyAt: 0, curKey: '', frameIdx: -1, moving: false, id, sp, x: start.x, y: start.y, path: [], speed: 0, room, act, flags: fl, face: h01(id, 1) < 0.5 ? 1 : -1, wanderAt: 0, salt: 0, tex: '', phase: h01(id, 5) * 6 };
        sp.x = v.x; sp.y = v.y;
        this.layers.rats.addChild(sp); this.rats.set(id, v);
      }
      v.tex = this.ratTexKey(act, fl, id === founderId, id);
      const changedRoom = room !== v.room;
      if (changedRoom || act !== v.act || (fl & 16 && s.phase !== 'founding')) {
        const to = this.targetFor(s, i, v);
        v.path = changedRoom ? route({ x: v.x, y: v.y }, v.room, room, to) : [to];
        const len = this.pathLen(v);
        v.speed = Math.max(0.03, Math.min(1.4, len / (this.tickMs * (changedRoom ? 0.9 : 1.6))));
      }
      v.room = room; v.act = act; v.flags = fl;
      // tints (palette-derived multipliers)
      // final art carries caste, sickness and sleep; only a faint cue for states that have no dedicated pose
      let tint = 0xffffff;
      if (fl & 4 && act !== Act.Sick) tint = 0xc8e0d0; else if (fl & 8 && act !== Act.Starve) tint = 0xe8d8d0;
      v.sp.tint = tint;
    }
    for (const [id, v] of this.rats) if (!seen.has(id)) { v.sp.destroy(); this.rats.delete(id); if (this.followId === id) this.followId = null; }
  }
  pathLen(v: RatView) { let x = v.x, y = v.y, L = 0; for (const p of v.path) { L += Math.abs(p.x - x) + Math.abs(p.y - y); x = p.x; y = p.y; } return L; }

  corpseKey(c: Snapshot['corpses'][number]) {
    if (c.king) return c.violent ? 'king_executed' : 'king_die';
    if (c.pup) return 'pup_die';
    return c.stage >= 2 ? 'corpse_old' : c.stage === 1 ? 'corpse_bloat' : c.violent ? 'corpse_kill' : 'corpse';
  }
  syncCorpses(s: Snapshot) {
    const seen = new Set<number>();
    setGoreArt(this.gore);
    let flies = 0;
    for (const c of s.corpses) {
      seen.add(c.id);
      let cv = this.corpseSprites.get(c.id);
      if (!cv) {
        const sp = new Sprite(); sp.anchor.set(0.5, 1);
        const p = c.king && c.room === R.throne ? { x: THRONE_SEAT.x + 30, y: THRONE_SEAT.y + 34 } : spot(c.room, c.id, 77); sp.x = Math.round(p.x); sp.y = Math.round(p.y);
        if (h01(c.id, 2) < 0.5) sp.scale.x = -1;
        this.layers.corpses.addChild(sp); cv = { sp, key: '', flies: null, blood: null }; this.corpseSprites.set(c.id, cv);
      }
      const key = this.corpseKey(c) + (this.gore ? '' : '~');
      if (key !== cv.key) {
        cv.key = key; const a = anim(this.corpseKey(c)); cv.sp.texture = a.frames[a.frames.length - 1]; cv.sp.anchor.set(a.anchor[0], a.anchor[1]);
        cv.sp.alpha = this.gore ? 1 : 0.8;
        const wantBlood = this.gore && c.violent && c.stage === 0 && !c.king;
        if (wantBlood && !cv.blood) { cv.blood = new Fx('fx_blood', cv.sp.x, cv.sp.y - 2, 0); cv.blood.sp.anchor.set(0.5, 0.5); this.layers.corpses.addChildAt(cv.blood.sp, 0); }
        if (!wantBlood && cv.blood) { cv.blood.sp.destroy(); cv.blood = null; }
      }
      const wantFlies = this.gore && c.stage >= 1 && flies < 14;
      if (wantFlies) flies++;
      if (wantFlies && !cv.flies) { cv.flies = new Fx('fx_flies', cv.sp.x, cv.sp.y - 22, h01(c.id, 4) * 6, this.layers.fx); }
      if (!wantFlies && cv.flies) { cv.flies.sp.destroy(); cv.flies = null; }
    }
    for (const [id, cv] of this.corpseSprites) if (!seen.has(id)) { cv.sp.destroy(); cv.flies?.sp.destroy(); cv.blood?.sp.destroy(); this.corpseSprites.delete(id); }
  }

  syncItems(s: Snapshot) {
    const seen = new Set<number>();
    for (const it of s.items) {
      seen.add(it.id);
      let sp = this.itemSprites.get(it.id);
      if (!sp) {
        const v = 1 + Math.floor(h01(it.id, 6) * 3); sp = new Sprite(tex((it.kind === 'scrap' ? 'scrap' : 'food') + (v > 1 ? v : ''))); sp.anchor.set(0.5, 1);
        if (it.room === SURFACE) { sp.x = streetX(it.x); sp.y = STREET_BOX.floor; } else { const b = box(it.room); sp.x = Math.round(b.x + 20 + (it.x / 360) * (b.w - 40)); sp.y = b.floor; }
        this.layers.props.addChild(sp); this.itemSprites.set(it.id, sp);
      }
    }
    for (const [id, sp] of this.itemSprites) if (!seen.has(id)) { sp.destroy(); this.itemSprites.delete(id); }
  }

  syncPosters(s: Snapshot) {
    const seen = new Set<string>();
    for (const [roomS, laws] of Object.entries(s.posters)) {
      const room = +roomS; const b = box(room);
      laws.forEach((law, j) => {
        const key = room + ':' + law; seen.add(key);
        let sp = this.posterSprites.get(key);
        if (!sp) { sp = new Sprite(tex(h01(room * 31 + j, 3) < 0.25 ? 'poster_torn' : 'poster')); sp.anchor.set(0, 0); this.layers.posters.addChild(sp); this.posterSprites.set(key, sp); }
        // posters along the upper wall (throne: on the right-hand pipe wall, beside the existing notices)
        const pw = sp.texture.width + 3; sp.x = room === R.throne ? b.x + 196 + (j % 4) * pw : b.x + 18 + j * pw; sp.y = room === R.throne ? b.y + 104 + Math.floor(j / 4) * 30 : b.y + 22 + (j % 2) * 3;
      });
    }
    for (const [k, sp] of this.posterSprites) if (!seen.has(k)) { sp.destroy(); this.posterSprites.delete(k); }
  }

  syncHeralds(s: Snapshot) {
    const seen = new Set<number>();
    for (const h of s.heralds) {
      seen.add(h.id);
      let c = this.heraldSprites.get(h.id);
      if (!c) {
        c = new Container(); const body = new Sprite(tex('herald')); body.anchor.set(0.5, 1); body.tint = h.kind === 'pass' ? 0xffffff : 0xc8c0d0;
        c.addChild(body); const p0 = spot(R.throne, h.id); c.x = p0.x; c.y = p0.y;
        this.layers.rats.addChild(c); this.heraldSprites.set(h.id, c);
      }
      const hc = c as Container & { target?: { x: number; y: number }; key?: string };
      hc.target = h.step === 0 ? spot(R.throne, h.id) : spot(h.room, h.id, 31);
      // walking between rooms; announcing on arrival, pasting the poster mid-stay
      hc.key = h.t < 2 ? 'herald' : h.t < 4.5 ? 'herald_announce' : 'herald_paste';
    }
    for (const [id, c] of this.heraldSprites) if (!seen.has(id)) { c.destroy({ children: true }); this.heraldSprites.delete(id); }
  }

  private pool(c: Container, n: number, key: (i: number) => string) {
    while (c.children.length < n) { const sp = new Sprite(); sp.anchor.set(0.5, 1); c.addChild(sp); }
    c.children.forEach((sp, i) => { sp.visible = i < n; if (i < n) (sp as Sprite).texture = tex(key(i)); });
    return c.children as Sprite[];
  }
  drawProps(s: Snapshot) {
    // granary: a heap of final food props that grows with the stock
    const gb = ROOM_BOX[R.granary];
    const fill = s.rooms[R.granary].level >= 1 ? Math.min(1, s.stats.food / Math.max(1, s.stats.foodCap)) : 0;
    const n = Math.round(36 * fill); const kinds = ['food', 'food2', 'food3', 'food', 'food2'];
    const gs = this.pool(this.granaryPile, n, (i) => kinds[i % 5]);
    let row = 0, inRow = 0, rowLen = 9; const cx = gb.x + gb.w / 2 + 40;
    for (let i = 0; i < n; i++) { if (inRow >= rowLen) { row++; inRow = 0; rowLen = Math.max(1, rowLen - 1); } gs[i].x = Math.round(cx + (inRow - (rowLen - 1) / 2) * 11); gs[i].y = gb.floor - row * 6; gs[i].scale.x = i % 2 ? -1 : 1; inRow++; }
    // vote: real pebbles, two heaps either side of the bowl (red-tinted = kill, pale = spare)
    const pb = ROOM_BOX[R.plaza];
    if (s.gathering) {
      const kills = Math.min(40, s.gathering.kills), spares = Math.min(40, Math.max(0, s.gathering.counted - s.gathering.kills));
      const ps = this.pool(this.plazaPebbles, kills + spares + 1, (i) => (i === 0 ? 'pebble_bowl' : 'pebble'));
      ps[0].x = pb.x + pb.w / 2; ps[0].y = pb.floor - 4; ps[0].tint = 0xffffff;
      const heap = (start: number, k: number, x0: number, tint: number) => { let row = 0, inRow = 0, len = 7; for (let j = 0; j < k; j++) { if (inRow >= len) { row++; inRow = 0; len = Math.max(1, len - 1); } const sp = ps[start + j]; sp.x = Math.round(x0 + (inRow - (len - 1) / 2) * 6); sp.y = pb.floor - 2 - row * 4; sp.tint = tint; inRow++; } };
      heap(1, kills, pb.x + pb.w / 2 - 40, 0xff8a8a); heap(1 + kills, spares, pb.x + pb.w / 2 + 40, 0xffffff);
    } else this.pool(this.plazaPebbles, 0, () => 'pebble');
    // the king's board: one law tablet per active law at the foot of the button pedestal; force = lit, spreading = dim
    const active = s.laws.filter((l) => l.state !== 'none');
    const ts = this.pool(this.tablets, Math.min(8, active.length), () => 'law_tablet'); const bp = this.buttonPos;
    ts.forEach((sp, i) => { const l = active[i]; sp.x = bp.x - 34 + (i % 4) * 14; sp.y = bp.y + 74 + Math.floor(i / 4) * 9; sp.tint = l.state === 'force' ? 0xffffff : l.state === 'repealing' ? 0x707070 : 0xb0a0a0; });
  }

  frame(dt: number) {
    this.fpsAcc += dt; this.fpsN++; if (this.fpsAcc >= 500) { this.fps = (this.fpsN * 1000) / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    const now = performance.now();
    for (const v of this.rats.values()) {
      let moving = false;
      if (v.path.length) {
        let step = v.speed * dt;
        while (step > 0 && v.path.length) {
          const p = v.path[0]; const dx = p.x - v.x, dy = p.y - v.y; const d = Math.abs(dx) + Math.abs(dy);
          if (d <= step) { v.x = p.x; v.y = p.y; v.path.shift(); step -= d; }
          else { const k = step / d; v.x += dx * k; v.y += dy * k; if (Math.abs(dx) > 0.5) v.face = dx > 0 ? 1 : -1; step = 0; }
          moving = true;
        }
      } else if (now > v.wanderAt && !(v.flags & 16) && v.act !== Act.Sleep && v.act !== Act.Dead && v.room !== SURFACE) {
        v.wanderAt = now + 2500 + h01(v.id, now & 1023) * 6000; v.salt = (v.salt + 1) % 7;
        if (this.snap && this.snap.phase !== 'gathering') { const t = spot(v.room, v.id, v.salt); v.path = [t]; v.speed = 0.02 + h01(v.id, 4) * 0.02; }
      }
      v.phase += dt * 0.012;
      // choose animation: walking/running overrides the act while travelling
      let key = v.tex;
      if (moving && !(v.flags & 16)) key = key.startsWith('alt') ? 'alt_walk' : v.flags & 1 ? 'pup_walk' : v.flags & 64 ? 'enforcer_walk' : v.flags & 32 ? 'elder_walk' : v.speed > 0.12 ? 'rat_run' : key === 'rat_haul' ? 'rat_haul' : 'rat_walk';
      const a = anim(key);
      const n = a.frames.length;
      if (key !== v.curKey) v.keyAt = now;
      const fi = n > 1 ? (a.loop ? Math.floor(now / 1000 * a.fps + v.phase * 3) % n : Math.min(n - 1, Math.floor(((now - v.keyAt) / 1000) * a.fps))) : 0;
      if (key !== v.curKey || fi !== v.frameIdx) { v.sp.texture = a.frames[fi]; v.frameIdx = fi; if (key !== v.curKey) { v.sp.anchor.set(a.anchor[0], a.anchor[1]); v.curKey = key; } }
      const animated = n > 1;
      const bob = animated ? 0 : moving ? (Math.sin(v.phase * 3) > 0 ? -1 : 0) : v.act === Act.Dig || v.act === Act.Gnaw ? (Math.sin(v.phase * 4) > 0.3 ? -1 : 0) : v.act === Act.Press ? (Math.sin(v.phase * 2) > 0 ? -2 : 0) : v.act === Act.Vote || v.act === Act.Protest ? (Math.sin(v.phase * 2.5) > 0.6 ? -3 : 0) : 0;
      v.sp.x = Math.round(v.x); v.sp.y = Math.round(v.y) + bob;
      v.sp.scale.x = v.flags & 16 ? -1 : v.face;
      v.sp.scale.y = 1;
      v.sp.tint = v.flags & 128 && key === 'rat_walk' ? 0xa898a0 : v.sp.tint;
      v.sp.zIndex = v.sp.y;
    }
    this.layers.rats.sortableChildren = true;
    for (const c of this.heraldSprites.values()) {
      const t = (c as Container & { target?: { x: number; y: number } }).target; if (!t) continue;
      const dx = t.x - c.x, dy = t.y - c.y; const d = Math.abs(dx) + Math.abs(dy); const sp = Math.min(d, 0.12 * dt);
      const body = c.children[0] as Sprite; const hk = d > 0.5 ? 'herald' : ((c as Container & { key?: string }).key ?? 'herald'); const ha = anim(hk);
      body.texture = ha.frames[Math.floor((now / 1000) * ha.fps) % ha.frames.length]; body.anchor.set(ha.anchor[0], ha.anchor[1]);
      if (d > 0.5) { c.x += (dx / d) * sp; c.y += (dy / d) * sp; body.scale.x = dx >= 0 ? 1 : -1; }
      c.zIndex = c.y; c.x = Math.round(c.x); c.y = Math.round(c.y);
    }
    // wheel turns when anyone runs it
    if (this.snap) {
      let wheelers = 0; for (let i = 0; i < this.snap.n; i++) if (this.snap.act[i] === Act.Wheel) wheelers++;
      this.wheel.sp.visible = this.snap.rooms[R.workshop].level >= 1; this.wheel.tick(now, wheelers > 0);
      for (const l of this.loops) { const on = l.room < 0 || (this.snap.rooms[l.room]?.level ?? 0) >= 1; l.fx.sp.visible = on; if (on) l.fx.tick(now); }
      for (const r of this.roaches) { const on = (this.snap.rooms[r.room]?.level ?? 0) >= 1; r.fx.sp.visible = on; if (!on) continue; const span = r.x1 - r.x0; const t = ((now * r.sp) % (span * 2)); r.fx.sp.x = Math.round(t < span ? r.x0 + t : r.x1 - (t - span)); r.fx.sp.scale.x = t < span ? 1 : -1; r.fx.tick(now); }
      // plague: flea clouds over (up to six) sick rats
      let k = 0; if (this.snap.stats.sick > 0) for (const v of this.rats.values()) { if (k >= 6) break; if (v.flags & 4) { const f = this.fleas[k] ?? (this.fleas[k] = new Fx('fx_fleas', 0, 0, k, this.layers.fx)); f.sp.visible = true; f.sp.x = Math.round(v.x); f.sp.y = Math.round(v.y) - 30; f.tick(now); k++; } }
      for (let j = k; j < this.fleas.length; j++) this.fleas[j].sp.visible = false;
      // the exterminator drone circles while its attention is high
      const att = this.snap.drone ?? 0; const busy = this.actors.some((a) => a.legs.some((l) => l.key === 'drone_spray'));
      if (att > 0.55 && !busy) { if (!this.drone) this.drone = new Fx('drone_scan', 0, 0, 0, this.layers.fx); this.drone.sp.visible = true; this.drone.sp.x = Math.round(SHAFT_X + Math.sin(now / 2400) * 220); this.drone.sp.y = 70 + Math.round(Math.sin(now / 700) * 4); this.drone.sp.scale.x = Math.cos(now / 2400) >= 0 ? 1 : -1; this.drone.tick(now); }
      else if (this.drone) this.drone.sp.visible = false;
      const dayT = (this.snap.dayTick + Math.min(1, (now - this.lastSnapAt) / this.tickMs)) / TPD;
      this.night.alpha = dayT > 0.7 ? Math.min(0.55, (dayT - 0.7) * 2.2) : dayT < 0.08 ? 0.4 * (1 - dayT / 0.08) : 0;
    }
    if (this.pressFlash > 0) { if (!this.stamp) { const bp = this.buttonPos; this.stamp = new Fx('fx_stamp', bp.x, bp.y, 0, this.layers.fx); this.stamp.sp.anchor.set(0.5, 0.5); } this.pressFlash = 0; this.stamp.t0 = now; this.stamp.sp.visible = true; }
    if (this.stamp?.sp.visible) { this.stamp.tick(now); if (now - this.stamp.t0 > 900) this.stamp.sp.visible = false; }
    this.actors = this.actors.filter((a) => a.tick(now));
    // when the inspect sheet covers the bottom of the screen, keep the followed rat centred in what is still visible
    if (this.followId != null) { const v = this.rats.get(this.followId); if (v) this.cam.follow(v.x, v.y - 16 + (this.followOffsetCss * this.cam.dpr) / this.cam.z, dt); else this.followId = null; }
    this.updateRes();
    this.cam.apply();
  }

  tap(wx: number, wy: number) {
    let best: RatView | null = null, bd = 26 * 26;
    for (const v of this.rats.values()) { const dx = v.x - wx, dy = v.y - 12 - wy; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = v; } }
    if (best) { this.onTapRat(best.id); return; }
    const tb = ROOM_BOX[R.throne];
    if (wx >= tb.x && wx <= tb.x + tb.w && wy >= tb.y && wy <= tb.y + tb.h) { this.onTapThrone(); return; }
    this.onTapRat(null);
  }

  focusRoom(room: number, zoom?: number) { const b = box(room); this.cam.centerOn(b.x + b.w / 2, b.y + b.h / 2, zoom); }
  focusKing(zoom?: number) { this.cam.centerOn(THRONE_SEAT.x, THRONE_SEAT.y - 40, zoom); }
  ratPos(id: number) { const v = this.rats.get(id); return v ? { x: v.x, y: v.y } : null; }
}
