// The world above: a towering street of the Giants' city at 8× scale over the burrow, a sky that follows the sim's
// time of day, weather (rain, storm & lightning, fog, heat haze, snow), wet-street sheen and reflections, god rays into the
// entrance shaft by day, neon & street lamps at night, passing headlights, and depth-of-field on the far street when the
// camera is deep underground or zoomed in close.
import { Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { Env, TerrainInit, BurrowInit } from '../../sim/v2/contract';
import { clip } from './sprites';
import { PX, SKY_PX, STREET_SCALE } from './units';
import { lightTexture, type PostEnv } from './post';

const H = (h: number) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
const toHex = (c: number[]) => (Math.round(c[0] * 255) << 16) | (Math.round(c[1] * 255) << 8) | Math.round(c[2] * 255);
// key frames over the day: [tod, skyTop, skyBottom, ambient(surface), grade tint]
const KEYS: [number, number, number, number[], number[]][] = [
  [0.0, 0x080d0a, 0x23434c, [0.42, 0.48, 0.66], [0.86, 0.9, 1.08]],
  [0.2, 0x14151a, 0x352e46, [0.48, 0.5, 0.66], [0.9, 0.9, 1.05]],
  [0.27, 0x352e46, 0xc46665, [0.85, 0.7, 0.7], [1.05, 0.95, 0.92]],
  [0.36, 0x3b666f, 0xd5a063, [1.0, 0.95, 0.88], [1.04, 1.0, 0.96]],
  [0.5, 0x3b666f, 0x907d78, [1.08, 1.04, 1.0], [1.02, 1.0, 0.98]],
  [0.68, 0x413b5a, 0xd5a063, [1.0, 0.85, 0.75], [1.06, 0.97, 0.92]],
  [0.76, 0x352e46, 0xe84b5a, [0.8, 0.6, 0.62], [1.06, 0.92, 0.95]],
  [0.84, 0x14151a, 0x413b5a, [0.5, 0.5, 0.68], [0.9, 0.9, 1.05]],
  [1.0, 0x080d0a, 0x23434c, [0.42, 0.48, 0.66], [0.86, 0.9, 1.08]],
];
function keyAt(t: number) { for (let i = 0; i < KEYS.length - 1; i++) { const a = KEYS[i], b = KEYS[i + 1]; if (t >= a[0] && t <= b[0]) { const f = (t - a[0]) / (b[0] - a[0]); return { top: mix(H(a[1]), H(b[1]), f), bot: mix(H(a[2]), H(b[2]), f), amb: mix(a[3], b[3], f), tint: mix(a[4], b[4], f) }; } } const k = KEYS[0]; return { top: H(k[1]), bot: H(k[2]), amb: k[3], tint: k[4] }; }

function blurred(src: Texture, px: number): Texture {
  const res: any = src.source.resource; const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const g = c.getContext('2d')!;
  g.filter = `blur(${px}px)`; g.drawImage(res, src.frame.x, src.frame.y, src.width, src.height, 0, 0, src.width, src.height); const t = Texture.from(c); t.source.scaleMode = 'linear'; return t;
}

export class Sky {
  readonly back = new Container({ label: 'sky' });   // behind terrain
  readonly front = new Container({ label: 'sky-front' }); // rain etc. in front of everything
  readonly lights = new Container({ label: 'sky-lights' });
  private grad = new Sprite(); private gradCv = document.createElement('canvas'); private gradTex!: Texture;
  private stars = new Container(); private far?: TilingSprite; private farB?: TilingSprite; private mid?: TilingSprite; private midB?: TilingSprite; private sheen?: TilingSprite;
  private rain: Sprite[] = []; private rainTex!: Texture; private snowTex!: Texture; private bolt = new Graphics(); private boltT = 0;
  private rays: Sprite[] = []; private sunRect = new Sprite(Texture.WHITE); private sunFade = new Sprite();
  private lamps: Sprite[] = []; private head = new Sprite(); private headT = -1;
  private W = 0; private surf = 0; flash = 0; dof = 0; private lastKey = -1;
  init(T: TerrainInit, B: BurrowInit) {
    this.back.removeChildren(); this.front.removeChildren(); this.lights.removeChildren();
    this.W = T.W * PX; let s = 0; for (let x = 0; x < T.W; x++) s += T.surfaceY[x]; this.surf = (s / T.W) * PX;
    this.gradCv.width = 1; this.gradCv.height = 64; this.gradTex = Texture.from(this.gradCv); this.gradTex.source.scaleMode = 'linear';
    this.grad.texture = this.gradTex; this.grad.position.set(-400, -SKY_PX); this.grad.width = this.W + 800; this.grad.height = SKY_PX + this.surf + 40; this.back.addChild(this.grad);
    // stars
    let seed = 9; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 140; i++) { const st = new Sprite(Texture.WHITE); st.width = st.height = r() < 0.15 ? 4 : 2; st.position.set(r() * this.W, -SKY_PX + r() * SKY_PX * 0.6); st.alpha = 0.4 + r() * 0.6; st.tint = r() < 0.2 ? 0x45eaf0 : 0xf6c992; this.stars.addChild(st); }
    this.back.addChild(this.stars);
    const far = clip('parallax_city_far'), mid = clip('parallax_city_mid');
    if (far) { const t = far.frames[0]; this.far = new TilingSprite({ texture: t, width: this.W + 1600, height: t.height }); this.far.tileScale.set(STREET_SCALE * 0.75); this.far.height = t.height * STREET_SCALE * 0.75; this.far.position.set(-800, this.surf - this.far.height - 260);
      this.farB = new TilingSprite({ texture: blurred(t, 1.2), width: this.far.width, height: this.far.height }); this.farB.tileScale.copyFrom(this.far.tileScale); this.farB.position.copyFrom(this.far.position); this.back.addChild(this.far, this.farB); }
    if (mid) { const t = mid.frames[0]; this.mid = new TilingSprite({ texture: t, width: this.W + 1600, height: t.height * STREET_SCALE }); this.mid.tileScale.set(STREET_SCALE); this.mid.position.set(-800, this.surf - this.mid.height + 4 * STREET_SCALE);
      this.midB = new TilingSprite({ texture: blurred(t, 0.9), width: this.mid.width, height: this.mid.height }); this.midB.tileScale.copyFrom(this.mid.tileScale); this.midB.position.copyFrom(this.mid.position); this.back.addChild(this.mid, this.midB);
      // wet-street reflection strip: the street mirrored on the puddled kerb
      this.sheen = new TilingSprite({ texture: t, width: this.mid.width, height: 7 * STREET_SCALE }); this.sheen.tileScale.set(STREET_SCALE, -STREET_SCALE * 0.5); this.sheen.position.set(-800, this.surf - 7 * STREET_SCALE + 4); this.sheen.alpha = 0; this.sheen.blendMode = 'screen'; this.back.addChild(this.sheen); }
    // god rays into the entrance shafts
    const rayTex = (() => { const c = document.createElement('canvas'); c.width = 16; c.height = 128; const g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,240,200,0)'); gr.addColorStop(0.35, 'rgba(255,240,200,0.55)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 16, 128); const hg = g.createLinearGradient(0, 0, 16, 0); hg.addColorStop(0, 'rgba(0,0,0,1)'); hg.addColorStop(0.5, 'rgba(0,0,0,0)'); hg.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = hg; g.fillRect(0, 0, 16, 128); return Texture.from(c); })();
    for (const n of B.nodes) if (n.kind === 'surface' || n.kind === 'entrance') for (let k = 0; k < 3; k++) { const ry = new Sprite(rayTex); ry.anchor.set(0.5, 0.2); ry.position.set(n.x * PX + (k - 1) * 14, n.y * PX - 40); ry.width = 26 + k * 8; ry.height = 240 + k * 50; ry.skew.x = -0.25 + k * 0.08; ry.blendMode = 'add'; ry.alpha = 0; this.front.addChild(ry); this.rays.push(ry); }
    // rain / snow pool (positioned around the camera each frame)
    this.rainTex = (() => { const c = document.createElement('canvas'); c.width = 1; c.height = 10; const g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 0, 10); gr.addColorStop(0, 'rgba(160,220,230,0)'); gr.addColorStop(1, 'rgba(190,235,240,0.9)'); g.fillStyle = gr; g.fillRect(0, 0, 1, 10); return Texture.from(c); })();
    this.snowTex = Texture.WHITE;
    for (let i = 0; i < 360; i++) { const d = new Sprite(this.rainTex); d.visible = false; (d as any).sd = Math.random(); this.front.addChild(d); this.rain.push(d); }
    this.front.addChild(this.bolt);
    // lights: daylight over the open air, fading a little into the ground; night lamps & neon along the street
    this.sunRect.position.set(-800, -SKY_PX); this.sunRect.width = this.W + 1600; this.sunRect.height = SKY_PX + this.surf - 10; this.lights.addChild(this.sunRect);
    this.sunFade.texture = (() => { const c = document.createElement('canvas'); c.width = 1; c.height = 32; const g = c.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 0, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 1, 32); return Texture.from(c); })();
    this.sunFade.position.set(-800, this.surf - 10); this.sunFade.width = this.W + 1600; this.sunFade.height = 70; this.lights.addChild(this.sunFade);
    const LCOL = [0xe84b5a, 0x45eaf0, 0xf2b46a, 0xad6b7a, 0x42c3ca];
    for (let x = 120, i = 0; x < this.W; x += 260 + ((i * 97) % 180), i++) { const L = new Sprite(lightTexture()); L.anchor.set(0.5); L.blendMode = 'add'; L.position.set(x, this.surf - 120 - ((i * 53) % 380)); L.scale.set(3 + (i % 3)); L.tint = LCOL[i % LCOL.length]; (L as any).ph = i; this.lights.addChild(L); this.lamps.push(L); }
    this.head.texture = lightTexture(); this.head.anchor.set(0.5); this.head.blendMode = 'add'; this.head.scale.set(7, 2.2); this.head.tint = 0xf6c992; this.head.visible = false; this.lights.addChild(this.head);
  }
  /** per frame; returns the post env (grade, ambient, fog...) */
  update(env: Env | null, cam: { x: number; y: number; z: number }, view: { x0: number; y0: number; x1: number; y1: number }, now: number, dt: number, quality: number): PostEnv {
    const tod = env?.tod ?? 0.5; const w = env?.weather ?? 'clear'; const I = env?.intensity ?? 0; const rainA = Math.max(env?.rain ?? 0, w === 'rain' || w === 'storm' ? I : 0);
    const k = keyAt(tod); const gloom = (w === 'overcast' ? 0.35 : w === 'rain' ? 0.5 : w === 'storm' ? 0.75 : w === 'fog' ? 0.45 : w === 'snow' ? 0.3 : 0) * Math.max(0.4, I);
    const grey = H(0x40494b); const top = mix(k.top, grey, gloom * 0.7), bot = mix(k.bot, H(0x505b5c), gloom * 0.8);
    const key = Math.round(tod * 200) * 10 + Math.round(gloom * 9);
    if (key !== this.lastKey) { this.lastKey = key; const g = this.gradCv.getContext('2d')!; const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#' + toHex(top).toString(16).padStart(6, '0')); gr.addColorStop(1, '#' + toHex(bot).toString(16).padStart(6, '0')); g.fillStyle = gr; g.fillRect(0, 0, 1, 64); this.gradTex.source.update(); }
    const night = Math.max(0, Math.min(1, (Math.abs(tod - 0.5) - 0.24) / 0.08));
    this.stars.alpha = night * (1 - gloom); this.stars.visible = this.stars.alpha > 0.02;
    // parallax: far layer drifts with the camera, mid is fixed to the ground
    if (this.far && this.farB) { this.far.tilePosition.x = this.farB.tilePosition.x = cam.x * 0.45 / (STREET_SCALE * 0.75) * STREET_SCALE * 0.75; this.far.tint = this.farB.tint = toHex(mix([1, 1, 1], [0.55, 0.6, 0.75], night * 0.6 + gloom * 0.3)); }
    // depth of field: blur the street when the camera looks deep / close
    const deep = Math.max(0, Math.min(1, (cam.y - this.surf) / 600)); const close = Math.max(0, Math.min(1, (cam.z - 1.2) / 1.5));
    this.dof += (Math.max(deep, close * 0.8) - this.dof) * Math.min(1, dt / 300);
    if (this.farB) { this.farB.alpha = Math.max(0.35, this.dof); this.farB.visible = quality > 0; }
    if (this.midB) { this.midB.alpha = this.dof; this.midB.visible = quality > 0 && this.dof > 0.02; }
    if (this.sheen) { this.sheen.alpha = Math.min(0.45, rainA * 0.6 + (w === 'storm' ? 0.1 : 0)); this.sheen.tilePosition.x = Math.sin(now * 0.002) * 2; }
    // rain / snow around the view, only in the open air
    const precip = w === 'snow' ? I : rainA; const nDrops = Math.round(this.rain.length * Math.min(1, precip) * (quality > 0 ? 1 : 0.5));
    const vw = view.x1 - view.x0, vh = view.y1 - view.y0; const wind = env?.wind ?? 0.2; const snow = w === 'snow' || (env?.tempC ?? 10) < 0;
    for (let i = 0; i < this.rain.length; i++) { const d = this.rain[i]; if (i >= nDrops) { d.visible = false; continue; }
      const sd = (d as any).sd; const sp = snow ? 0.06 : 0.9 + sd * 0.4; const tt = now * sp + sd * 99991;
      const yy = view.y0 + ((tt % (vh + 200)) + (vh + 200)) % (vh + 200) - 100; const xx = view.x0 + ((sd * 7919 * vw + wind * (tt % (vh + 200)) * 0.3 + (snow ? Math.sin(tt * 0.01) * 10 : 0)) % vw + vw) % vw;
      if (yy > this.surf - 2) { d.visible = false; continue; }
      d.visible = true; d.position.set(xx, yy); d.texture = snow ? this.snowTex : this.rainTex; const zs = Math.max(1, 1 / cam.z);
      if (snow) { d.width = d.height = 2 * zs; d.rotation = 0; d.alpha = 0.8; } else { d.width = 1 * zs; d.height = (14 + sd * 10) * zs; d.rotation = -wind * 0.35; d.alpha = 0.35 + sd * 0.4; } }
    // lightning
    if (env?.lightning && this.boltT <= 0) { this.boltT = 380; this.flash = 1; this.drawBolt(view); }
    if (this.boltT > 0) { this.boltT -= dt; this.bolt.alpha = Math.max(0, this.boltT / 380) * (Math.random() < 0.8 ? 1 : 0.3); if (this.boltT <= 0) this.bolt.clear(); }
    this.flash = Math.max(0, this.flash - dt / 260);
    // god rays by day, through the entrance
    const day = 1 - night; for (const r of this.rays) r.alpha = day * (1 - gloom) * 0.22 * (0.85 + Math.sin(now * 0.0007 + r.x) * 0.15);
    // lights
    const amb = mix(k.amb, [0.6, 0.62, 0.7], gloom * 0.6); this.sunRect.tint = toHex(amb.map((v) => Math.min(1, v / 2))); this.sunFade.tint = this.sunRect.tint;
    for (const L of this.lamps) { L.alpha = night * 0.55 * (0.85 + Math.sin(now * 0.004 + (L as any).ph * 3) * 0.1 + (Math.random() < 0.01 ? -0.5 : 0)); L.visible = L.alpha > 0.02; }
    const sa = env?.streetActivity ?? 0;
    if (this.headT < 0 && Math.random() < sa * dt / 9000) this.headT = 0;
    if (this.headT >= 0) { this.headT += dt; const p = this.headT / 2600; this.head.visible = true; this.head.position.set(view.x0 - 300 + (vw + 600) * p, this.surf - 40); this.head.alpha = (0.4 + night * 0.5) * Math.sin(Math.PI * Math.min(1, p)); if (p >= 1) { this.headT = -1; this.head.visible = false; } }
    // post env
    const fog = 0.06 + (w === 'fog' ? 0.45 * I : 0) + (w === 'rain' || w === 'storm' ? 0.08 : 0);
    return {
      tint: [k.tint[0] * (1 - gloom * 0.08), k.tint[1] * (1 - gloom * 0.05), k.tint[2] * (1 + gloom * 0.03)], sat: 1 - gloom * 0.25 + (w === 'heat' ? 0.1 : 0), contrast: 1.04 + gloom * 0.06,
      fog, fogCol: w === 'fog' ? [0.55, 0.58, 0.6] : [0.24, 0.22, 0.25], flash: this.flash * 0.85, haze: w === 'heat' || w === 'drought' ? 1.6 : 0.8,
      ambient: [0.5, 0.47, 0.52], dust: 1,
    };
  }
  surfaceY() { return this.surf; }
  private drawBolt(view: { x0: number; x1: number; y0: number }) {
    const g = this.bolt; g.clear(); let x = view.x0 + (view.x1 - view.x0) * (0.2 + Math.random() * 0.6), y = Math.max(-SKY_PX, view.y0 - 50); const pts: number[] = [x, y];
    while (y < this.surf - 20) { x += (Math.random() - 0.5) * 60; y += 20 + Math.random() * 40; pts.push(x, Math.min(y, this.surf - 20)); }
    g.poly(pts, false).stroke({ width: 6, color: 0x45eaf0, alpha: 0.5 }); g.poly(pts, false).stroke({ width: 2, color: 0xffffff });
    const L = new Sprite(lightTexture()); L.anchor.set(0.5); L.blendMode = 'add'; L.position.set(x, this.surf - 40); L.scale.set(12); L.tint = 0xc8f0ff; this.lights.addChild(L); setTimeout(() => L.destroy(), 300);
  }
}
