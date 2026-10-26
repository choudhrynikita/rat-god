// Observer camera: drag to pan, pinch to zoom (snapped to integer device-pixel scales), tap to pick.
import type { Application, Container } from 'pixi.js';

export class Camera {
  bias = 0.56; padTop = 0; padBot = 0; x = 360; y = 300; z = 2; // world point at screen centre; z = device px per world px (integer)
  minZ = 1; maxZ = 8;
  private ptrs = new Map<number, { x: number; y: number }>();
  private downAt = 0; private downPos = { x: 0, y: 0 }; private moved = false;
  private pinch0 = 0; private z0 = 2; private zf = 2;
  onTap: (wx: number, wy: number) => void = () => {};
  onUserMove: () => void = () => {};
  constructor(private app: Application, private root: Container, private W: number, private H: number, public dpr: number) {
    const el = app.canvas;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.zoomAt(e.offsetX * this.dpr, e.offsetY * this.dpr, this.z + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
    this.fitDefault();
  }
  res = 1; // device px per internal canvas px (divides z, so pixels stay exact)
  devW = 0; devH = 0;
  get vw() { return this.devW || this.app.renderer.width; } get vh() { return this.devH || this.app.renderer.height; }
  fitDefault() { this.minZ = Math.max(1, Math.floor(this.vw / this.W)); this.z = Math.min(this.maxZ, this.minZ + 2); this.x = this.W / 2; this.y = 150; this.clamp(); }
  clamp() {
    this.minZ = Math.max(1, Math.floor(this.vw / this.W));
    this.z = Math.max(this.minZ, Math.min(this.maxZ, Math.round(this.z)));
    const hw = this.vw / this.z / 2;
    this.x = hw * 2 >= this.W ? this.W / 2 : Math.max(hw, Math.min(this.W - hw, this.x));
    const top = this.vh * this.bias / this.z, bot = this.vh * (1 - this.bias) / this.z;
    this.y = Math.max(top - this.padTop / this.z, Math.min(this.H - bot + this.padBot / this.z, this.y));
  }
  apply() {
    const r = this.res;
    this.root.scale.set(this.z / r);
    this.root.x = Math.round((this.vw / 2 - this.x * this.z) / r);
    this.root.y = Math.round((this.vh * this.bias - this.y * this.z) / r);
  }
  toWorld(sx: number, sy: number) { return { x: (sx - this.root.x * this.res) / this.z, y: (sy - this.root.y * this.res) / this.z }; }
  centerOn(wx: number, wy: number, z?: number) { if (z) this.z = z; this.x = wx; this.y = wy; this.clamp(); this.apply(); }
  follow(wx: number, wy: number, dt: number) { const k = Math.min(1, dt / 220); this.x += (wx - this.x) * k; this.y += (wy - this.y) * k; this.clamp(); }
  zoomAt(sx: number, sy: number, nz: number) {
    nz = Math.max(this.minZ, Math.min(this.maxZ, Math.round(nz))); if (nz === this.z) return;
    const w = this.toWorld(sx, sy); this.z = nz;
    this.x = w.x - (sx - this.vw / 2) / nz; this.y = w.y - (sy - this.vh * this.bias) / nz; this.clamp(); this.apply();
  }
  private dev(e: PointerEvent) { return { x: e.offsetX * this.dpr, y: e.offsetY * this.dpr }; }
  private down(e: PointerEvent) {
    this.app.canvas.setPointerCapture?.(e.pointerId);
    this.ptrs.set(e.pointerId, this.dev(e));
    if (this.ptrs.size === 1) { this.downAt = performance.now(); this.downPos = this.dev(e); this.moved = false; }
    if (this.ptrs.size === 2) { const [a, b] = [...this.ptrs.values()]; this.pinch0 = Math.hypot(a.x - b.x, a.y - b.y); this.z0 = this.z; this.zf = this.z; this.moved = true; }
  }
  private move(e: PointerEvent) {
    const p = this.ptrs.get(e.pointerId); if (!p) return;
    const n = this.dev(e);
    if (this.ptrs.size === 1) {
      const dx = n.x - p.x, dy = n.y - p.y;
      if (Math.abs(n.x - this.downPos.x) + Math.abs(n.y - this.downPos.y) > 12 * this.dpr) { if (!this.moved) this.onUserMove(); this.moved = true; }
      if (this.moved) { this.x -= dx / this.z; this.y -= dy / this.z; this.clamp(); }
    } else if (this.ptrs.size === 2) {
      const [a, b] = [...this.ptrs.entries()].map(([id, v]) => (id === e.pointerId ? n : v));
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch0 > 0) { this.zf = this.z0 * (d / this.pinch0); const target = Math.round(this.zf); if (target !== this.z) { this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, target); this.onUserMove(); } }
    }
    this.ptrs.set(e.pointerId, n);
  }
  private up(e: PointerEvent, cancel = false) {
    const had = this.ptrs.has(e.pointerId); this.ptrs.delete(e.pointerId);
    if (!had || cancel) return;
    if (this.ptrs.size === 0 && !this.moved && performance.now() - this.downAt < 450) { const w = this.toWorld(this.downPos.x, this.downPos.y); this.onTap(w.x, w.y); }
  }
}
