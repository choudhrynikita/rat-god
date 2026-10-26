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
      this.cam.setBounds({ x0: 0, y0: -1500, x1: m.terrain.W * PX, y1: m.terrain.H * PX });
      const ent = m.burrow.chambers.find((c) => c.kind === 'plaza') ?? m.burrow.chambers[0];
      this.cam.jumpTo(ent ? ent.cx * PX : m.terrain.W * PX / 2, ent ? ent.cy * PX : 600, 1.4);
    } else if (m.t === 'snap') {
      const s = m.snap; this.snap = s; this.env = s.env; const now = performance.now();
      if (s.terrain) this.terrain.applyDelta(s.terrain);
      if (s.burrow) for (const c of s.burrow.newChambers) this.fx.addChamberLight(c);
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
    const live = this.cam.update(dt);
    const zd = this.cam.z * this.R; const view = this.cam.view(60);
    const lod = zd < 0.6;
    this.terrain.update(view, lod);
    this.actors.update(now, zd, view, !live);
    this.lens.update(this.actors, this.snap, zd, Lenses.surfFn(this.T?.surfaceY));
    const penv = this.sky.update(this.env, this.cam, view, now, dt, this.post.tier === 'low' ? 0 : 1);
    this.fx.fromTerrain(); this.fx.ambient(view, this.env?.quake ?? 0, this.env?.rain ?? 0); this.fx.update(dt * (live ? 1 : 0.1), now);
    if (this.lens.mode) { penv.sat *= 0.3; penv.contrast *= 0.9; }
    if (this.reduceMotion) { this.cam.shakeX = 0; this.cam.shakeY = 0; }
    this.post.render({ x: this.cam.x, y: this.cam.y, zd, shakeX: this.cam.shakeX * this.R, shakeY: this.cam.shakeY * this.R }, Math.round(this.cssW * this.R), Math.round(this.cssH * this.R), this.cssW, this.cssH, penv, this.sky.surfaceY(), now / 1000);
    this.fpsAcc.push(dt); if (this.fpsAcc.length >= 30) { this.fps = 1000 / (this.fpsAcc.reduce((a, b) => a + b, 0) / this.fpsAcc.length); this.fpsAcc.length = 0; }
    const t = this.post.sample(dt); if (t) this.onTier(t);
  }
  get skyTop() { return -SKY_PX; }
}
