// Phone-first camera: pan with inertia, pinch anchored at the finger midpoint, rubber-band zoom & edges, double-tap zoom,
// tap → pick/follow, two-finger tap → zoom out, mouse wheel, smooth fly-to, follow, trauma shake & hit-stop.
// Units: x,y = world px at screen centre; z = css px per world px.
export interface CamBounds { x0: number; y0: number; x1: number; y1: number }
type Ptr = { id: number; x: number; y: number; sx: number; sy: number; t: number };
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export class Camera2 {
  x = 0; y = 0; z = 1;
  vw = 390; vh = 844;            // viewport css px
  minZ = 0.1; maxZ = 3.5;
  bounds: CamBounds = { x0: 0, y0: 0, x1: 1000, y1: 1000 };
  private vx = 0; private vy = 0; // inertia (world px / ms)
  private fly: { x: number; y: number; z: number; k: number } | null = null;
  follow: (() => { x: number; y: number } | null) | null = null;
  trauma = 0; hitStop = 0; shakeX = 0; shakeY = 0;
  private ptrs = new Map<number, Ptr>();
  private pinch: { d0: number; z0: number; wx: number; wy: number } | null = null;
  private lastMove = 0; private dragging = false; private moved = 0;
  private twoDownAt = 0; private twoMoved = 0;
  private lastTap = { t: 0, x: 0, y: 0 };
  private wheelUntil = 0;
  onTap: (sx: number, sy: number) => void = () => {};
  onDoubleTap: (sx: number, sy: number) => void = (sx, sy) => this.zoomAt(sx, sy, this.z < this.maxZ * 0.6 ? Math.min(this.maxZ, this.z * 2.4) : this.z / 2.4);
  onTwoFingerTap: () => void = () => this.zoomOut();
  onLongPress: (sx: number, sy: number) => void = () => {};
  private lp = 0;
  onUserMove: () => void = () => {};
  constructor(private el: HTMLElement) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e), { passive: true });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.wheelUntil = performance.now() + 220; this.zoomAt(e.offsetX, e.offsetY, this.z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), true); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  resize(w: number, h: number) { this.vw = w; this.vh = h; this.fitLimits(); }
  setBounds(b: CamBounds) { this.bounds = b; this.fitLimits(); }
  private fitLimits() { const b = this.bounds; this.minZ = Math.min(this.vw / (b.x1 - b.x0), this.vh / (b.y1 - b.y0)) * 0.98; }
  s2w(sx: number, sy: number) { return { x: this.x + (sx - this.vw / 2) / this.z, y: this.y + (sy - this.vh / 2) / this.z }; }
  w2s(wx: number, wy: number) { return { x: (wx - this.x) * this.z + this.vw / 2, y: (wy - this.y) * this.z + this.vh / 2 }; }
  view(margin = 0) { const hw = this.vw / 2 / this.z + margin, hh = this.vh / 2 / this.z + margin; return { x0: this.x - hw, y0: this.y - hh, x1: this.x + hw, y1: this.y + hh }; }
  get busy() { return this.ptrs.size > 0; }
  // ───── gestures ─────
  private down(e: PointerEvent) {
    try { this.el.setPointerCapture(e.pointerId); } catch { /* */ }
    const p: Ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() };
    this.ptrs.set(e.pointerId, p); this.vx = this.vy = 0; this.fly = null;
    clearTimeout(this.lp);
    if (this.ptrs.size === 1) { this.dragging = true; this.moved = 0; const r = this.el.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top;
      this.lp = window.setTimeout(() => { if (this.ptrs.size === 1 && this.moved < 10) { this.dragging = false; this.vx = this.vy = 0; this.onLongPress(sx, sy); } }, 520); }
    if (this.ptrs.size === 2) { this.startPinch(); this.twoDownAt = performance.now(); this.twoMoved = 0; }
  }
  private startPinch() {
    const [a, b] = [...this.ptrs.values()]; const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; const w = this.s2w(mx, my);
    this.pinch = { d0: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), z0: this.z, wx: w.x, wy: w.y };
  }
  private move(e: PointerEvent) {
    const p = this.ptrs.get(e.pointerId); if (!p) return;
    const now = performance.now(); const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (this.ptrs.size >= 2 && this.pinch) {
      const [a, b] = [...this.ptrs.values()]; const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const d = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)); this.twoMoved += Math.abs(dx) + Math.abs(dy);
      this.z = this.rubberZ(this.pinch.z0 * (d / this.pinch.d0));
      // keep the world point that was under the midpoint under the (moving) midpoint
      this.x = this.pinch.wx - (mx - this.vw / 2) / this.z; this.y = this.pinch.wy - (my - this.vh / 2) / this.z;
      this.follow = null; this.onUserMove(); return;
    }
    if (!this.dragging) return;
    this.moved += Math.abs(dx) + Math.abs(dy);
    if (this.moved < 6) return;
    this.follow = null; this.onUserMove();
    const r = this.edgeResist();
    this.x -= (dx / this.z) * r.x; this.y -= (dy / this.z) * r.y;
    const dt = Math.max(1, now - this.lastMove); this.lastMove = now;
    // low-pass the release velocity
    this.vx = this.vx * 0.6 + (-dx / this.z / dt) * 0.4 * r.x; this.vy = this.vy * 0.6 + (-dy / this.z / dt) * 0.4 * r.y;
  }
  private up(e: PointerEvent, cancel = false) {
    const p = this.ptrs.get(e.pointerId); if (!p) return; this.ptrs.delete(e.pointerId); clearTimeout(this.lp);
    const now = performance.now();
    if (this.ptrs.size === 1 && this.pinch) {
      // two-finger tap: both fingers down briefly, barely moved
      if (!cancel && now - this.twoDownAt < 260 && this.twoMoved < 16) this.onTwoFingerTap();
      this.pinch = null; this.dragging = false; this.vx = this.vy = 0; return; // remaining finger must lift before a new pan
    }
    if (this.ptrs.size === 0) {
      this.pinch = null;
      if (this.dragging && !cancel && this.moved < 10 && now - p.t < 320) {
        const lt = this.lastTap; const sx = e.clientX - this.el.getBoundingClientRect().left, sy = e.clientY - this.el.getBoundingClientRect().top;
        if (now - lt.t < 320 && Math.hypot(sx - lt.x, sy - lt.y) < 36) { this.lastTap.t = 0; this.onDoubleTap(sx, sy); }
        else { this.lastTap = { t: now, x: sx, y: sy }; this.onTap(sx, sy); }
      }
      if (now - this.lastMove > 80) { this.vx = this.vy = 0; }
      this.dragging = false;
    }
  }
  private rubberZ(z: number) {
    if (z > this.maxZ) return this.maxZ * Math.pow(z / this.maxZ, 0.3);
    if (z < this.minZ) return this.minZ * Math.pow(z / this.minZ, 0.3);
    return z;
  }
  private edgeResist() {
    const v = this.view(); const b = this.bounds; return { x: v.x0 < b.x0 || v.x1 > b.x1 ? 0.35 : 1, y: v.y0 < b.y0 || v.y1 > b.y1 ? 0.35 : 1 };
  }
  // ───── programmatic ─────
  zoomAt(sx: number, sy: number, z: number, instant = false) {
    z = clamp(z, this.minZ, this.maxZ); const w = this.s2w(sx, sy);
    const nx = w.x - (sx - this.vw / 2) / z, ny = w.y - (sy - this.vh / 2) / z;
    if (instant) { this.x = nx; this.y = ny; this.z = z; this.fly = null; } else this.flyTo(nx, ny, z, 7);
    this.follow = null;
  }
  zoomOut() { const b = this.bounds; this.follow = null; this.flyTo((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, this.minZ, 4); }
  flyTo(x: number, y: number, z = this.z, k = 5) { this.fly = { x, y, z: clamp(z, this.minZ, this.maxZ), k }; this.vx = this.vy = 0; }
  jumpTo(x: number, y: number, z = this.z) { this.x = x; this.y = y; this.z = clamp(z, this.minZ, this.maxZ); this.fly = null; }
  shake(amount: number) { this.trauma = Math.min(1, this.trauma + amount); }
  freeze(ms: number) { this.hitStop = Math.max(this.hitStop, ms); }
  /** advance; returns false while hit-stopped (caller pauses sim interpolation) */
  update(dtMs: number): boolean {
    const dt = Math.min(dtMs, 50);
    if (this.hitStop > 0) this.hitStop -= dtMs;
    const touching = this.ptrs.size > 0;
    if (!touching) {
      if (this.follow) { const t = this.follow(); if (t) { const k = 1 - Math.exp(-dt * 0.006); this.x += (t.x - this.x) * k; this.y += (t.y - this.y) * k; } else this.follow = null; }
      if (this.fly) {
        const k = 1 - Math.exp(-dt * 0.001 * this.fly.k);
        // interpolate zoom in log space so the anchor feels natural
        const lz = Math.log(this.z) + (Math.log(this.fly.z) - Math.log(this.z)) * k; this.z = Math.exp(lz);
        if (!this.follow) { this.x += (this.fly.x - this.x) * k; this.y += (this.fly.y - this.y) * k; }
        if (Math.abs(this.fly.z - this.z) / this.z < 0.002 && Math.abs(this.fly.x - this.x) * this.z < 0.5 && Math.abs(this.fly.y - this.y) * this.z < 0.5) this.fly = null;
      }
      // inertia
      if (Math.abs(this.vx) + Math.abs(this.vy) > 1e-4) { this.x += this.vx * dt; this.y += this.vy * dt; const f = Math.pow(0.9945, dt); this.vx *= f; this.vy *= f; }
      // rubber-band springs back
      if (performance.now() > this.wheelUntil) {
        if (this.z > this.maxZ) this.z += (this.maxZ - this.z) * (1 - Math.exp(-dt * 0.012));
        if (this.z < this.minZ) this.z += (this.minZ - this.z) * (1 - Math.exp(-dt * 0.012));
      }
      const v = this.view(); const b = this.bounds; const k = 1 - Math.exp(-dt * 0.012);
      const hw = (v.x1 - v.x0) / 2, hh = (v.y1 - v.y0) / 2;
      const cx = hw * 2 >= b.x1 - b.x0 ? (b.x0 + b.x1) / 2 : clamp(this.x, b.x0 + hw, b.x1 - hw);
      const cy = hh * 2 >= b.y1 - b.y0 ? (b.y0 + b.y1) / 2 : clamp(this.y, b.y0 + hh, b.y1 - hh);
      if (cx !== this.x) { this.x += (cx - this.x) * k; this.vx *= 0.5; }
      if (cy !== this.y) { this.y += (cy - this.y) * k; this.vy *= 0.5; }
    }
    // trauma shake (squared falloff), in css px
    this.trauma = Math.max(0, this.trauma - dt * 0.0016);
    const s = this.trauma * this.trauma * 14, t = performance.now() * 0.05;
    this.shakeX = s * (Math.sin(t * 1.7) + Math.sin(t * 3.1) * 0.5); this.shakeY = s * (Math.sin(t * 2.3 + 1) + Math.sin(t * 4.3) * 0.5);
    return this.hitStop <= 0;
  }
}
