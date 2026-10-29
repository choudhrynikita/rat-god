// Particles & god-power VFX. A pooled pixel-particle system in world space (dirt clods, dust, debris, sparks, embers, blood
// — blood/gore only when the consent setting allows), chamber lights, and a distinct effect per god power/fx hint.
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { SimEvent2, BurrowInit, Chamber, Snapshot2 } from '../../sim/v2/contract';
import { PX } from './units';
import { lightTexture } from './post';
import type { Terrain } from './terrain';
import type { Camera2 } from './camera2';

interface P { s: Sprite; x: number; y: number; vx: number; vy: number; life: number; max: number; g: number; drag: number; size: number; fade: boolean; collide: boolean; add: boolean; spin?: number }
const DIRT = [0x38302d, 0x4d3d3d, 0x70473f, 0x9c6e4e], DUST = [0x907d78, 0x796765, 0x505b5c], GOLD = [0xf2b46a, 0xf6c992, 0xd5a063], CYAN = [0x45eaf0, 0x42c3ca, 0x489da2];
const BLOOD = [0x670a1e, 0x3b041b, 0xaa494d], VIOLET = [0x864f4d, 0x5f4e61, 0xad6b7a, 0x793650], SICK = [0x8faa5a, 0x5f7a3a, 0x9be070], WATER = [0x489da2, 0x42c3ca, 0x23434c];
let _glyphs: Texture[] | null = null;
function glyphs() { if (_glyphs) return _glyphs; _glyphs = [];
  const G = ['010111010', '101010101', '111101111', '110011110', '011110011', '100111001', '010101010', '111010111'];
  for (const g of G) { const c = document.createElement('canvas'); c.width = 5; c.height = 5; const x = c.getContext('2d')!; x.fillStyle = '#f6c992';
    for (let i = 0; i < 9; i++) if (g[i] === '1') x.fillRect(1 + (i % 3), 1 + Math.floor(i / 3), 1, 1); const t = Texture.from(c); t.source.scaleMode = 'nearest'; _glyphs.push(t); }
  return _glyphs; }

export class Fx {
  readonly back = new Container({ label: 'fx-back' }); readonly front = new Container({ label: 'fx-front' }); readonly lights = new Container({ label: 'fx-lights' });
  private ps: P[] = []; private free: Sprite[] = []; private beams: { g: Graphics; t: number; max: number; L?: Sprite }[] = [];
  private flashes: { s: Sprite; t: number; max: number; sc: number }[] = [];
  private chamberLights: Sprite[] = [];
  private scars: { g: Graphics; life: number; max: number }[] = [];
  gore = 0; budget = 1400;
  constructor(private terrain: Terrain, private cam: Camera2) {}
  initChambers(B: BurrowInit) { for (const s of this.chamberLights) s.destroy(); this.chamberLights = []; for (const c of B.chambers) this.addChamberLight(c); }
  addChamberLight(c: Chamber) {
    const warm: Record<string, number> = { nest: 0xc48a62, cache: 0xd5a063, throne: 0xf2b46a, shrine: 0xf6c992, temple: 0xf6c992, workshop: 0x45eaf0, lab: 0x45eaf0, granary: 0xd5a063, nursery: 0xf2b46a, plaza: 0xe8a54b, market: 0xf2b46a, jail: 0x6070a0, barracks: 0xc46665, home: 0xf2b46a, infirmary: 0x9be070, latrine: 0x6a8a62, gallery: 0x8a7a68, midden: 0x7a6a48, archive: 0xc4a060, council: 0xf2b46a, slum: 0x6a5040 };
    const col = warm[c.kind]; if (!col) return; const L = new Sprite(lightTexture()); L.anchor.set(0.5); L.blendMode = 'add'; L.tint = col;
    L.position.set(c.cx * PX, (c.cy - c.ry * 0.2) * PX); L.scale.set(Math.max(1.4, c.rx * PX / 52)); (L as any).base = 0.75; (L as any).ph = c.id; this.lights.addChild(L); this.chamberLights.push(L);
  }
  private spawn(o: Partial<P> & { x: number; y: number; col: number }) {
    if (this.ps.length >= this.budget) return; const s = this.free.pop() ?? new Sprite(Texture.WHITE);
    const p: P = { s, x: o.x, y: o.y, vx: o.vx ?? 0, vy: o.vy ?? 0, life: o.max ?? 800, max: o.max ?? 800, g: o.g ?? 0.0006, drag: o.drag ?? 0.998, size: o.size ?? 2, fade: o.fade ?? true, collide: o.collide ?? true, add: o.add ?? false, spin: o.spin };
    s.texture = (o as any).tex ?? Texture.WHITE; s.tint = o.col; s.width = s.height = p.size; s.anchor.set(0.5); s.alpha = 1; s.rotation = 0; s.blendMode = p.add ? 'add' : 'normal';
    (p.add ? this.front : this.back).addChild(s); this.ps.push(p);
  }
  burst(x: number, y: number, n: number, cols: number[], sp: number, o: Partial<P> = {}) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = sp * (0.3 + Math.random() * 0.7); this.spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.4, col: cols[(Math.random() * cols.length) | 0], max: 500 + Math.random() * 700, ...o }); } }
  /** dig crumbs / collapse rubble from terrain carve changes */
  fromTerrain() { const T = this.terrain; const list = T.carveFx; T.carveFx = [];
    for (const c of list.slice(0, 80)) { if (c.amt < 0) { this.burst(c.x, c.y, 10, DUST, 0.08, { g: 0.0009 }); this.burst(c.x, c.y, 6, DIRT, 0.05, { size: 3 }); this.cam.shake(0.05); continue; }
      const n = 2 + Math.round(c.amt * 8); this.burst(c.x, c.y, n, DIRT, 0.07, { size: Math.random() < 0.3 ? 3 : 2 }); if (Math.random() < 0.4) this.spawn({ x: c.x, y: c.y, vx: (Math.random() - 0.5) * 0.02, vy: -0.01, col: DUST[0], size: 5, g: -0.00002, max: 1400, collide: false, drag: 0.99 }); } }
  /** ambient: ceiling drips & dust in unstable places, embers near warm chamber lights */
  ambient(view: { x0: number; y0: number; x1: number; y1: number }, quake: number, rain: number) {
    const vw = view.x1 - view.x0, vh = view.y1 - view.y0;
    if (quake > 0.05) for (let i = 0; i < quake * 6; i++) { const x = view.x0 + Math.random() * vw, y = view.y0 + Math.random() * vh; if (this.terrain.isOpenPx(x, y)) { const cy = this.terrain.ceilAbove(x, y, 60); this.spawn({ x, y: cy + 1, col: DIRT[(Math.random() * 4) | 0], size: Math.random() < 0.2 ? 3 : 1.5, g: 0.0012, max: 1500 }); } }
    if (rain > 0.2 && Math.random() < rain * 0.4) { const x = view.x0 + Math.random() * vw, y = view.y0 + Math.random() * vh; if (y > 0 && this.terrain.isOpenPx(x, y)) { const cy = this.terrain.ceilAbove(x, y, 80); this.spawn({ x, y: cy + 1, col: WATER[1], size: 1.5, g: 0.0011, max: 1200 }); } }
  }
  /** play the effect for a sim event (fx hint or god act) */
  event(e: SimEvent2, ratPos: (id: number) => { x: number; y: number } | null) {
    let x = (e.x ?? NaN) * PX, y = (e.y ?? NaN) * PX; if (e.rats?.length) { const p = ratPos(e.rats[0]); if (p) { x = p.x; y = p.y; } }
    if (!isFinite(x) || !isFinite(y)) return;
    const hidden = (e.mature ?? []).some((t) => (t === 'gore' || t === 'torture') ? this.gore < 1 : false);
    const fx = e.fx ?? (e.kind === 'smite' ? 'lightning' : e.kind === 'blessed' ? 'halo' : e.kind === 'cursed' ? 'curse' : e.kind === 'risen' ? 'risen' : e.kind === 'collapse' ? 'dust_burst' : e.kind === 'flood' ? 'splash' : e.kind === 'plague' ? 'miasma' : e.kind === 'god_punish' ? 'punish' : e.kind === 'defiance' || e.kind === 'war_on_god' ? 'defy' : e.kind === 'miracle' ? 'miracle' : e.kind === 'discovery' ? 'discovery' : (e.kind === 'battle' || e.kind === 'murder' || e.kind === 'maimed') ? 'blood' : e.kind === 'marriage' || e.kind === 'courtship' ? 'love' : e.kind === 'festival' ? 'fanfare' : '');
    this.play(fx, x, y, hidden);
    this.remember(e.kind, fx, x, y, e.sev);
  }
  /** The room keeps a few pixels of what happened. The log is not the story. */
  private remember(kind: string, fx: string, x: number, y: number, sev: number) {
    const mark = kind === 'birth' ? 'straw'
      : kind === 'flood' || fx === 'splash' ? 'stain'
      : kind === 'plague' || fx === 'miasma' ? 'sick'
      : kind === 'marriage' ? 'bond'
      : kind === 'blessed' || kind === 'miracle' || fx === 'halo' || fx === 'bless' ? 'ash'
      : kind === 'cursed' || kind === 'smite' || kind === 'god_punish' || fx === 'curse' || fx === 'punish' ? 'scorch'
      : '';
    if (!mark || sev < 1) return;
    if (this.scars.length > 32) { const old = this.scars.shift(); old?.g.destroy(); }
    const g = new Graphics();
    const px = (dx: number, dy: number, c: number) => { g.rect(dx, dy, 2, 2).fill({ color: c }); };
    if (mark === 'ash') { px(-3, 0, 0xf2b46a); px(0, -1, 0xf6c992); px(2, 1, 0x8a6040); }
    else if (mark === 'scorch') { px(-2, 0, 0x1a1210); px(1, -1, 0x2a1814); px(3, 1, 0x0a0808); px(0, 2, 0x3a2018); }
    else if (mark === 'straw') { px(-4, 0, 0xc4a060); px(-1, 1, 0x8a7040); px(2, 0, 0xd8b070); }
    else if (mark === 'stain') { px(-3, 1, 0x23434c); px(0, 0, 0x1a3038); px(3, 1, 0x2a4450); }
    else if (mark === 'bond') { px(-2, 0, 0xe84b5a); px(2, 0, 0xf2b46a); }
    else { px(-2, 0, 0x6a8a48); px(1, 1, 0x4a6a30); px(3, 0, 0x3a4a28); }
    g.position.set(Math.round(x), Math.round(y));
    this.back.addChild(g);
    const stay = mark === 'scorch' || mark === 'ash' || sev >= 2;
    this.scars.push({ g, life: stay ? 240000 : 90000, max: stay ? 240000 : 90000 });
  }
  play(fx: string, x: number, y: number, hideGore = false) {
    switch (fx) {
      case 'lightning': case 'smite': this.beam(x, y, 0xc8f0ff, 0x45eaf0, 520, true); this.burst(x, y, 30, CYAN, 0.25, { add: true, size: 2, g: 0.0004 }); this.burst(x, y, 20, DIRT, 0.15, { size: 3 }); this.flash(x, y, 0xc8f0ff, 7, 600); this.cam.shake(0.6); this.cam.freeze(90); break;
      case 'punish': this.beam(x, y, 0xffd0d0, 0xe84b5a, 900, true); this.burst(x, y, 40, [0xe84b5a, 0xf2b46a, 0xffffff], 0.22, { add: true }); this.flash(x, y, 0xe84b5a, 8, 900); this.ring(x, y, 0xe84b5a, 900); this.cam.shake(0.7); this.cam.freeze(140); break;
      case 'defy': for (let i = 0; i < 40; i++) this.spawn({ x: x + (Math.random() - 0.5) * 16, y, vx: (Math.random() - 0.5) * 0.04, vy: -0.12 - Math.random() * 0.1, col: [0xe84b5a, 0xc46665, 0xf2b46a][i % 3], g: 0, add: true, max: 1600, collide: false }); this.flash(x, y - 20, 0xe84b5a, 4, 1400); this.cam.shake(0.25); break;
      case 'halo': case 'bless': this.ring(x, y - 24, 0xf6c992, 1200); this.rise(x, y, GOLD, 30); this.flash(x, y - 10, 0xf6c992, 4, 1500); break;
      case 'curse': this.swirl(x, y, VIOLET, 50); this.flash(x, y, 0x793650, 3, 1400); break;
      case 'whisper': case 'dream': case 'omen': case 'foresee': for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; this.spawn({ x: x + Math.cos(a) * 18, y: y - 16 + Math.sin(a) * 10, vx: Math.cos(a + 1.6) * 0.03, vy: -0.015, col: fx === 'dream' ? 0xad6b7a : 0xf6c992, size: 5, g: 0, add: true, max: 1800, collide: false, tex: glyphs()[i % 8] } as any); } this.flash(x, y - 12, 0xad6b7a, 3, 1600); break;
      case 'risen': case 'raise_dead': this.rise(x, y, SICK, 50); this.flash(x, y, 0x9be070, 5, 1600); this.cam.shake(0.2); break;
      case 'splash': case 'flood': this.burst(x, y, 60, WATER, 0.22, { g: 0.0012, size: 2 }); this.flash(x, y, 0x42c3ca, 4, 800); this.cam.shake(0.25); break;
      case 'miasma': case 'plague': case 'gas': this.swirl(x, y, SICK, 60); break;
      case 'dust_burst': case 'collapse': case 'cave_in': case 'quake': case 'earthquake': this.burst(x, y, 50, DUST, 0.12, { g: 0.0005, size: 3, drag: 0.985 }); this.burst(x, y, 40, DIRT, 0.1, { size: 3 }); this.cam.shake(0.8); this.cam.freeze(60); break;
      case 'miracle': case 'harvest': this.rise(x, y, GOLD, 60); this.ring(x, y - 10, 0xf2b46a, 1400); this.flash(x, y, 0xf6c992, 9, 2000); break;
      case 'fire': case 'smoke': this.rise(x, y, [0xe84b5a, 0xf2b46a], 30); this.burst(x, y, 20, DUST, 0.05, { g: -0.0001, size: 4 }); this.flash(x, y, 0xf2b46a, 5, 1200); break;
      case 'blood': if (hideGore || this.gore < 1) { this.burst(x, y, 14, DUST, 0.08); break; } this.burst(x, y, 24 * this.gore, BLOOD, 0.18, { g: 0.0013, size: 2 }); this.cam.shake(0.15); break;
      case 'discovery': case 'spark': case 'machine': this.burst(x, y - 14, 30, CYAN, 0.18, { add: true, g: 0.0007 }); this.flash(x, y - 10, 0x45eaf0, 4, 900); break;
      case 'love': for (let i = 0; i < 6; i++) this.spawn({ x: x + (Math.random() - 0.5) * 20, y: y - 20, vx: (Math.random() - 0.5) * 0.02, vy: -0.03, col: 0xe84b5a, size: 3, g: 0, max: 1600, collide: false }); break;
      case 'fanfare': case 'crowd': case 'crown': this.burst(x, y - 30, 40, [0xe84b5a, 0xf2b46a, 0x45eaf0, 0xf6c992], 0.15, { g: 0.0004, size: 2 }); this.flash(x, y - 20, 0xf2b46a, 5, 1000); break;
      case 'riot': case 'strike': this.burst(x, y, 30, DUST, 0.1); this.cam.shake(0.2); break;
      default: if (fx) this.burst(x, y, 12, GOLD, 0.08);
    }
  }
  private beam(x: number, y: number, core: number, glow: number, ms: number, fromSky: boolean) {
    const g = new Graphics(); let cx = x, cy = fromSky ? Math.min(y - 400, this.terrain.T.surfaceY[Math.max(0, Math.min(this.terrain.W - 1, Math.floor(x / PX)))] * PX - 600) : y - 200; const pts = [cx, cy];
    while (cy < y) { cx += (Math.random() - 0.5) * 30; cy += 18 + Math.random() * 26; pts.push(cy >= y ? x : cx, Math.min(cy, y)); }
    g.poly(pts, false).stroke({ width: 7, color: glow, alpha: 0.45 }); g.poly(pts, false).stroke({ width: 2.5, color: core }); g.blendMode = 'add'; this.front.addChild(g); this.beams.push({ g, t: ms, max: ms });
  }
  private ring(x: number, y: number, col: number, ms: number) { const g = new Graphics(); g.circle(0, 0, 10).stroke({ width: 2, color: col }); g.position.set(x, y); g.blendMode = 'add'; this.front.addChild(g); this.beams.push({ g, t: ms, max: ms, L: undefined }); (g as any).ring = 1; }
  private rise(x: number, y: number, cols: number[], n: number) { for (let i = 0; i < n; i++) this.spawn({ x: x + (Math.random() - 0.5) * 30, y: y - Math.random() * 10, vx: (Math.random() - 0.5) * 0.01, vy: -0.03 - Math.random() * 0.05, col: cols[i % cols.length], g: 0, add: true, max: 1200 + Math.random() * 900, collide: false, size: Math.random() < 0.3 ? 3 : 2 }); }
  private swirl(x: number, y: number, cols: number[], n: number) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, r = 6 + Math.random() * 26; this.spawn({ x: x + Math.cos(a) * r, y: y - 10 + Math.sin(a) * r * 0.6, vx: -Math.sin(a) * 0.03, vy: Math.cos(a) * 0.02 - 0.01, col: cols[i % cols.length], g: 0, size: 3 + Math.random() * 3, max: 1800 + Math.random() * 1200, collide: false, drag: 0.995 }); } }
  private flash(x: number, y: number, col: number, sc: number, ms: number) { const s = new Sprite(lightTexture()); s.anchor.set(0.5); s.blendMode = 'add'; s.tint = col; s.position.set(x, y); this.lights.addChild(s); this.flashes.push({ s, t: ms, max: ms, sc }); }
  update(dt: number, now: number) {
    for (let i = this.ps.length - 1; i >= 0; i--) { const p = this.ps[i]; p.life -= dt;
      if (p.life <= 0) { p.s.removeFromParent(); this.free.push(p.s); this.ps[i] = this.ps[this.ps.length - 1]; this.ps.pop(); continue; }
      p.vy += p.g * dt; p.vx *= Math.pow(p.drag, dt / 16); p.vy *= Math.pow(p.drag, dt / 16); const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
      if (p.collide && ny > 0 && !this.terrain.isOpenPx(nx, ny)) { p.vy *= -0.2; p.vx *= 0.5; if (Math.abs(p.vy) < 0.02) { p.vy = 0; p.g = 0; p.vx = 0; } } else { p.x = nx; p.y = ny; }
      p.s.position.set(Math.round(p.x), Math.round(p.y)); if (p.fade) p.s.alpha = Math.min(1, p.life / (p.max * 0.4)); }
    for (let i = this.beams.length - 1; i >= 0; i--) { const b = this.beams[i]; b.t -= dt; const f = b.t / b.max;
      if ((b.g as any).ring) { b.g.scale.set(1 + (1 - f) * 4); b.g.alpha = f; } else b.g.alpha = f > 0.6 ? (Math.random() < 0.7 ? 1 : 0.4) : f / 0.6;
      if (b.t <= 0) { b.g.destroy(); this.beams.splice(i, 1); } }
    for (let i = this.flashes.length - 1; i >= 0; i--) { const f = this.flashes[i]; f.t -= dt; const k = f.t / f.max; f.s.scale.set(f.sc * (0.6 + 0.4 * k)); f.s.alpha = k; if (f.t <= 0) { f.s.destroy(); this.flashes.splice(i, 1); } }
    for (let i = this.scars.length - 1; i >= 0; i--) {
      const s = this.scars[i]; s.life -= dt;
      s.g.alpha = s.life > s.max * 0.25 ? 0.9 : Math.max(0, s.life / (s.max * 0.25));
      if (s.life <= 0) { s.g.destroy(); this.scars.splice(i, 1); }
    }
    for (const L of this.chamberLights) L.alpha = (L as any).base * (0.9 + Math.sin(now * 0.003 + (L as any).ph) * 0.06 + Math.sin(now * 0.017 + (L as any).ph * 3) * 0.04);
  }
  get count() { return this.ps.length; }
  syncSnapshot(_s: Snapshot2) { /* reserved: fields (gas/smoke/fire) overlays */ }
}
