// v2 world orchestrator: owns the camera, terrain, sky, actors, fx and the post pipeline; consumes sim messages.
import type { Renderer } from 'pixi.js';
import type { FromWorker2, Snapshot2, TerrainInit, BurrowInit, Env, SimEvent2 } from '../../sim/v2/contract';
import { Camera2 } from './camera2';
import { Post, type Tier } from './post';
import { Terrain } from './terrain';
import { Sky } from './sky';
import { Actors } from './actors';
import { Fx } from './fx';
import { Lenses } from './lens';
import { PX, SKY_PX } from './units';

export class World2 {
  readonly cam: Camera2; readonly post: Post; readonly terrain = new Terrain(); readonly sky = new Sky(); readonly actors: Actors; readonly fx: Fx; readonly lens = new Lenses(); reduceMotion = false;
  T: TerrainInit | null = null; B: BurrowInit | null = null; env: Env | null = null; snap: Snapshot2 | null = null;
  R = 1; cssW = 0; cssH = 0; private last = performance.now(); fps = 60; private fpsAcc: number[] = [];
  onEvent: (e: SimEvent2) => void = () => {}; onTier: (t: Tier) => void = () => {};
  timeScale = 1; private slowUntil = 0;
  /** colony frame in world px. It only grows, so a finished room never slips back off-screen. */
  private colony = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, ready: false };
  private boxSig = '';
  private prevZ = 0;
  private calm = 0;
  constructor(renderer: Renderer, el: HTMLElement) {
    this.cam = new Camera2(el); this.post = new Post(renderer); this.actors = new Actors(this.terrain); this.fx = new Fx(this.terrain, this.cam);
    const P = this.post;
    P.sceneRoot.addChild(this.sky.back, this.terrain.overview, this.terrain.root, this.actors.back, this.fx.back);
    P.actorRoot.addChild(this.actors.layer, this.fx.front, this.sky.front, this.lens.layer);
    P.lightRoot.addChild(this.sky.lights, this.fx.lights, this.actors.lights);
  }
  handle(m: FromWorker2) {
    if (m.t === 'init') {
      this.T = m.terrain; this.B = m.burrow; this.terrain.init(m.terrain); this.sky.init(m.terrain, m.burrow); this.fx.initChambers(m.burrow);
      this.colony.ready = false; this.boxSig = '';
      this.cam.setBounds({ x0: -200, y0: -SKY_PX, x1: m.terrain.W * PX + 200, y1: m.terrain.H * PX });
      this.absorbColony(); this.cam.setMinZFloor(this.zoomFloor()); this.jumpColony();
    } else if (m.t === 'worldGrow') {
      const dx = m.dx * PX;
      if (this.B) this.shiftBurrow(m.dx);
      if (dx) { this.cam.x += dx; this.actors.shift(dx); if (this.colony.ready) { this.colony.x0 += dx; this.colony.x1 += dx; } }
      this.T = m.terrain;
      this.sky.relayout(m.terrain, dx);
      this.terrain.init(m.terrain);
      if (this.B) this.fx.initChambers(this.B);
      this.cam.setBounds({ x0: -200, y0: -SKY_PX, x1: m.terrain.W * PX + 200, y1: m.terrain.H * PX });
      this.cam.setMinZFloor(this.zoomFloor());
    } else if (m.t === 'snap') {
      const s = m.snap; this.snap = s; this.env = s.env; const now = performance.now();
      if (s.terrain) this.terrain.applyDelta(s.terrain);
      if (s.burrow && this.B) {
        const B = this.B;
        if (s.burrow.newNodes.length) B.nodes.push(...s.burrow.newNodes);
        if (s.burrow.newEdges.length) B.edges.push(...s.burrow.newEdges);
        if (s.burrow.newChambers.length) { B.chambers.push(...s.burrow.newChambers); for (const c of s.burrow.newChambers) this.fx.addChamberLight(c); }
        for (const [id, dug] of s.burrow.edgeDug) { const e = B.edges[id]; if (e && e.id === id) e.dug = dug; else { const f = B.edges.find((x) => x.id === id); if (f) f.dug = dug; } }
      }
      this.actors.ingest(s, now);
      if (s.consent) { this.fx.gore = s.consent.mature ? s.consent.gore : 0; this.actors.gore = this.fx.gore > 0; }
      for (const e of s.events) { this.fx.event(e, (id) => this.actors.posOf(id)); this.onEvent(e); }
      if (s.env.quake > 0.05) this.cam.shake(s.env.quake * 0.08);
    }
  }
  resize(cssW: number, cssH: number, R: number) { this.cssW = cssW; this.cssH = cssH; this.R = R; this.cam.resize(cssW, cssH); }
  /** cinematic time-slow for major events */
  slow(ms: number, scale = 0.25) { this.slowUntil = performance.now() + ms; this.timeScale = scale; }
  frame() {
    const now = performance.now(); const dt = Math.min(100, now - this.last); this.last = now; if (!this.T) return;
    if (now > this.slowUntil) this.timeScale += (1 - this.timeScale) * Math.min(1, dt / 300);
    this.absorbColony(); this.cam.setMinZFloor(this.zoomFloor()); this.easeColony();
    const live = this.cam.update(dt);
    const z = this.cam.z;
    if (this.prevZ > 0 && Math.abs(z - this.prevZ) > 0.006) this.calm = now + 220;
    this.prevZ = z;
    const fast = now < this.calm || this.cam.gesturing || this.cam.flying;
    const zd = z * this.R; const view = this.cam.view(24);
    this.terrain.update(view, z, fast);
    this.actors.update(now, zd, view, !live);
    this.lens.update(this.actors, this.snap, zd, Lenses.surfFn(this.T?.surfaceY));
    const penv = this.sky.update(this.env, this.cam, view, now, dt, this.post.tier === 'low' ? 0 : 1);
    this.fx.fromTerrain(); this.fx.ambient(view, this.env?.quake ?? 0, this.env?.rain ?? 0); this.fx.update(dt * (live ? 1 : 0.1), now);
    if (this.lens.mode) { penv.sat *= 0.3; penv.contrast *= 0.9; }
    if (this.reduceMotion) { this.cam.shakeX = 0; this.cam.shakeY = 0; }
    this.post.render({ x: this.cam.x, y: this.cam.y, zd, shakeX: this.cam.shakeX * this.R, shakeY: this.cam.shakeY * this.R }, Math.round(this.cssW * this.R), Math.round(this.cssH * this.R), this.cssW, this.cssH, penv, this.sky.surfaceY(), now / 1000, fast);
    this.fpsAcc.push(dt); if (this.fpsAcc.length >= 30) { this.fps = 1000 / (this.fpsAcc.reduce((a, b) => a + b, 0) / this.fpsAcc.length); this.fpsAcc.length = 0; }
    const t = this.post.sample(dt); if (t) this.onTier(t);
  }
  get skyTop() { return -SKY_PX; }
  private shiftBurrow(dx: number) {
    const B = this.B; if (!B || !dx) return;
    for (const n of B.nodes) n.x += dx;
    const seen = new WeakSet<[number, number]>();
    for (const e of B.edges) for (const p of e.pts) { if (seen.has(p)) continue; seen.add(p); p[0] += dx; }
    for (const c of B.chambers) c.cx += dx;
  }
  /** dug rooms and the hole they use. The street walkway is the whole city — it must not become the frame. */
  private absorbColony() {
    const B = this.B, T = this.T; if (!B || !T) return;
    const padX = 5 * PX, padY = 4 * PX;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x: number, y: number) => { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; };
    for (const c of B.chambers) if (c.progress > 0.08 || c.kind === 'nest') { add((c.cx - c.rx) * PX, (c.cy - c.ry) * PX); add((c.cx + c.rx) * PX, (c.cy + c.ry) * PX); }
    for (const e of B.edges) if (e.kind !== 'surface' && e.dug > 0.6) for (const p of e.pts) add(p[0] * PX, p[1] * PX);
    for (const n of B.nodes) if (n.kind === 'entrance') add(n.x * PX, n.y * PX);
    if (x0 === Infinity) return;
    x0 -= padX; x1 += padX; y1 += padY;
    const tx0 = Math.max(0, Math.floor((x0 + padX) / PX)), tx1 = Math.min(T.W - 1, Math.ceil((x1 - padX) / PX));
    let s = 0, n = 0;
    for (let x = tx0; x <= tx1; x += 2) { s += T.surfaceY[x]; n++; }
    const street = (n ? s / n : 30) * PX - 72;
    y0 = Math.min(y0 - padY, street);
    if (!this.colony.ready) { this.colony = { x0, y0, x1, y1, ready: true }; return; }
    this.colony.x0 = Math.min(this.colony.x0, x0);
    this.colony.y0 = Math.min(this.colony.y0, y0);
    this.colony.x1 = Math.max(this.colony.x1, x1);
    this.colony.y1 = Math.max(this.colony.y1, y1);
  }
  private fitZ() {
    const b = this.colony, cam = this.cam;
    const bw = Math.max(120, b.x1 - b.x0), bh = Math.max(120, b.y1 - b.y0);
    return Math.min(cam.vw / bw, cam.vh / bh) * 0.9;
  }
  /** pinch-out stops around a city block, unless the burrow itself is already wider */
  private zoomFloor() {
    const cam = this.cam;
    if (!this.colony.ready || cam.vw < 20) return 0.85;
    const block = cam.vw / (52 * PX);
    return Math.max(0.42, Math.min(block, this.fitZ()));
  }
  private playZ() {
    const fit = this.fitZ();
    return Math.max(this.cam.minZ, Math.min(1.22, fit));
  }
  private jumpColony() {
    if (!this.colony.ready) return;
    const b = this.colony;
    this.cam.jumpTo((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, this.playZ());
    this.boxSig = this.sig();
  }
  private sig() { const b = this.colony; return (b.x0 | 0) + ',' + (b.y0 | 0) + ',' + (b.x1 | 0) + ',' + (b.y1 | 0); }
  /** when a new room no longer fits, ease out. A pinch-in is left alone. */
  private easeColony() {
    const cam = this.cam, b = this.colony;
    if (!b.ready || cam.flying || cam.touching || cam.follow) return;
    const sig = this.sig();
    if (sig === this.boxSig) return;
    if (performance.now() - cam.lastUser < 800) return;
    const v = cam.view();
    const outside = v.x0 > b.x0 + 8 || v.x1 < b.x1 - 8 || v.y0 > b.y0 + 8 || v.y1 < b.y1 - 8;
    this.boxSig = sig;
    if (!outside) return;
    const z = Math.min(cam.z, Math.max(cam.minZ, this.fitZ()));
    cam.flyTo((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, z, 2.6);
  }
}
