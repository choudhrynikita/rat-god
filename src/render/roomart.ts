// Procedural pixel art for the burrow, painted only with the 47-colour style palette.
// (No generated imagery: deterministic code-drawn rock, brick, pipes and props.)
import { Texture } from 'pixi.js';
import type { RoomKind } from '../sim/types';
import { WORLD_W, WORLD_H, STREET_H, SHAFT_X, ROOM_BOX, THRONE_Y } from './layout';
import { R } from '../sim/types';

export const P = {
  ink: '#000000', ink1: '#080d0a', ink2: '#14151a', wine: '#20060d', slate0: '#1e2228', slate1: '#222c32', slate2: '#26373d', slate3: '#23434c', teal: '#3b666f', tealL: '#4b7e89', tealX: '#489da2',
  vio0: '#352e46', vio1: '#413b5a', blood0: '#30161b', blood1: '#3b041b', mauve0: '#441f28', plum: '#4f0939', mauve1: '#572932', blood: '#670a1e', mauve2: '#69303f', brown: '#70473f', rose0: '#793650', rose1: '#864f4d',
  rose2: '#995d66', red0: '#aa494d', rose3: '#ad6b7a', red1: '#c46665', pink: '#c67f7b', red: '#e84b5a', rust0: '#9c6e4e', rust1: '#ba8360', amber: '#d5a063', bone: '#d8b397', amberL: '#f2b46a', amberX: '#f6c992',
  cyan0: '#42c3ca', cyan: '#45eaf0', g0: '#38302d', g1: '#373f41', g2: '#40494b', g3: '#475052', g4: '#4d3d3d', g5: '#505b5c', g6: '#574950', g7: '#5f4e61', g8: '#796765', g9: '#907d78',
};

class Painter {
  c: HTMLCanvasElement; g: CanvasRenderingContext2D; seed: number;
  constructor(w: number, h: number, seed = 1) { this.c = document.createElement('canvas'); this.c.width = w; this.c.height = h; this.g = this.c.getContext('2d')!; this.seed = seed; }
  r() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  px(x: number, y: number, w: number, h: number, col: string) { this.g.fillStyle = col; this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  speckle(x: number, y: number, w: number, h: number, cols: string[], n: number, s = 1) { for (let i = 0; i < n; i++) this.px(x + this.r() * w, y + this.r() * h, s, s, cols[Math.floor(this.r() * cols.length)]); }
  rock(x: number, y: number, w: number, h: number) {
    this.px(x, y, w, h, P.ink2);
    for (let i = 0; i < (w * h) / 180; i++) { const bw = 6 + this.r() * 18, bh = 3 + this.r() * 7; const cx = x + this.r() * w, cy = y + this.r() * h; this.px(cx, cy, bw, bh, this.r() < 0.5 ? P.slate0 : P.g0); this.px(cx, cy, bw, 1, this.r() < 0.5 ? P.slate1 : P.g4); }
    this.speckle(x, y, w, h, [P.ink1, P.g1, P.mauve0], (w * h) / 60);
  }
  brick(x: number, y: number, w: number, h: number, a: string, b: string, mortar: string) {
    this.px(x, y, w, h, mortar);
    for (let row = 0; row * 8 < h; row++) for (let col = -1; col * 16 < w; col++) {
      const bx = x + col * 16 + (row % 2 ? 8 : 0), by = y + row * 8; if (bx + 15 < x || bx > x + w) continue;
      const cx = Math.max(x, bx + 1), cw = Math.min(x + w, bx + 15) - cx; this.px(cx, by + 1, cw, 6, this.r() < 0.3 ? b : a); this.px(cx, by + 1, cw, 1, this.r() < 0.5 ? b : mortar);
    }
    this.speckle(x, y, w, h, [P.ink1, mortar], (w * h) / 40);
  }
  pipe(x: number, y: number, len: number, vertical: boolean, th = 8) {
    const [w, h] = vertical ? [th, len] : [len, th];
    this.px(x, y, w, h, P.ink); this.px(x + 1, y + 1, w - 2, h - 2, P.rust0);
    if (vertical) { this.px(x + 2, y + 1, 2, h - 2, P.rust1); this.px(x + w - 3, y + 1, 1, h - 2, P.brown); for (let i = 12; i < len; i += 32) { this.px(x - 1, y + i, w + 2, 3, P.ink); this.px(x, y + i + 1, w, 1, P.amber); } }
    else { this.px(x + 1, y + 2, w - 2, 2, P.rust1); this.px(x + 1, y + h - 3, w - 2, 1, P.brown); for (let i = 12; i < len; i += 32) { this.px(x + i, y - 1, 3, h + 2, P.ink); this.px(x + i + 1, y, 1, h, P.amber); } }
    this.speckle(x, y, w, h, [P.rose1, P.mauve2, P.blood0], len / 3);
  }
  neon(x: number, y: number, w: number, h: number, col: string, glow: string) { this.px(x - 1, y - 1, w + 2, h + 2, glow); this.px(x, y, w, h, col); }
  tex() { const t = Texture.from(this.c); t.source.scaleMode = 'nearest'; return t; }
}

/** The whole static backdrop: earth, shaft, cavities for every room position, street ground line. */
export function paintBackdrop(): Texture {
  const p = new Painter(WORLD_W, WORLD_H, 7);
  p.rock(0, STREET_H, WORLD_W, WORLD_H - STREET_H);
  // strata bands
  for (let y = STREET_H; y < WORLD_H; y += 90 + Math.floor(p.r() * 60)) { p.px(0, y, WORLD_W, 2, P.g4); p.speckle(0, y - 3, WORLD_W, 8, [P.mauve0, P.g0, P.brown], 160); }
  // pipes in the earth
  p.pipe(0, STREET_H + 4, WORLD_W, false, 10);
  p.pipe(6, STREET_H + 14, WORLD_H - STREET_H - 40, true, 8);
  p.pipe(WORLD_W - 14, STREET_H + 14, WORLD_H - STREET_H - 40, true, 8);
  // the shaft
  const sx = SHAFT_X - 16;
  p.px(sx, 118, 32, THRONE_Y - 118 + 20, P.ink1);
  p.px(sx, 118, 2, THRONE_Y - 118 + 20, P.slate1); p.px(sx + 30, 118, 2, THRONE_Y - 118 + 20, P.ink);
  for (let y = 130; y < THRONE_Y; y += 10) { p.px(sx + 4, y, 24, 2, P.g1); p.px(sx + 4, y, 24, 1, P.g5); } // ladder rungs of wire
  p.px(sx + 4, 120, 2, THRONE_Y - 100, P.rust0); p.px(sx + 26, 120, 2, THRONE_Y - 100, P.rust0);
  // throne chamber surround: concrete collar
  p.px(150, THRONE_Y - 12, 420, 248, P.ink);
  p.brick(154, THRONE_Y - 8, 412, 240, P.g2, P.g3, P.ink2);
  // tunnels from shaft into each room row
  for (const b of ROOM_BOX) {
    if (!b || b === ROOM_BOX[R.throne]) continue;
    const left = b.x < SHAFT_X;
    const tx = left ? b.x + b.w - 2 : SHAFT_X + 14; const tw = left ? SHAFT_X - 14 - tx : b.x + 2 - tx;
    p.px(tx, b.floor - 22, tw, 24, P.ink1); p.px(tx, b.floor + 2, tw, 2, P.g4);
  }
  return p.tex();
}

/** Interior of a dug room (dark cavity + kind-specific props). */
export function paintRoom(kind: RoomKind, w: number, h: number, seed: number): Texture {
  const p = new Painter(w, h, seed);
  p.px(0, 0, w, h, P.ink);
  p.px(2, 2, w - 4, h - 4, P.ink1);
  // back wall
  const wallA = { entrance: P.slate1, granary: P.mauve0, nursery: P.mauve1, workshop: P.slate2, warren: P.vio0, plaza: P.slate1, shrine: P.plum, barracks: P.g4, graveyard: P.g0, slum: P.brown, deepwarren: P.vio0, throne: P.slate1 }[kind];
  p.brick(3, 3, w - 6, h - 20, wallA, P.g0, P.ink2);
  p.speckle(3, 3, w - 6, h - 20, [P.ink1, P.ink2], (w * h) / 22); // grime
  for (let i = 0; i < 6; i++) { const x = 6 + p.r() * (w - 12); p.px(x, 3, 1, 10 + p.r() * 30, P.slate3); } // drips
  // floor
  p.px(2, h - 16, w - 4, 14, P.g0); p.px(2, h - 16, w - 4, 2, P.g4); p.speckle(2, h - 14, w - 4, 12, [P.g1, P.brown, P.ink2], w / 2);
  const floor = h - 16;
  switch (kind) {
    case 'entrance': {
      p.px(w - 120, 3, 64, 50, P.ink); p.px(w - 116, 3, 56, 46, P.slate0); for (let i = 0; i < 6; i++) p.px(w - 114 + i * 9, 3, 3, 46, P.g5); // drain grate
      p.px(w - 114, 30, 52, 12, P.tealL); p.speckle(w - 114, 26, 52, 20, [P.tealX, P.teal], 60); // light falling
      p.px(10, floor - 6, 60, 6, P.slate3); p.px(14, floor - 5, 40, 2, P.teal); // puddle
      p.neon(40, 16, 40, 4, P.red, P.blood); p.neon(40, 24, 28, 4, P.red, P.blood);
      break;
    }
    case 'granary': {
      for (let i = 0; i < 4; i++) { const x = 20 + i * 76; p.px(x, 20, 4, floor - 20, P.rust0); p.px(x, 20, 1, floor - 20, P.amber); }
      p.px(10, 20, w - 20, 3, P.rust1);
      p.neon(w - 60, 10, 36, 4, P.amberL, P.rust0);
      break;
    }
    case 'nursery': {
      for (let i = 0; i < 4; i++) { const x = 16 + i * 78; p.px(x, floor - 14, 56, 14, P.ink); p.px(x + 2, floor - 12, 52, 10, P.bone); p.speckle(x + 2, floor - 13, 52, 12, [P.pink, P.rose3, P.amberX, P.g9], 90); }
      p.neon(w / 2 - 20, 12, 40, 3, P.pink, P.rose0);
      break;
    }
    case 'workshop': {
      p.px(16, floor - 36, 110, 4, P.rust0); p.px(20, floor - 32, 4, 32, P.rust0); p.px(118, floor - 32, 4, 32, P.rust0); // bench
      p.speckle(18, floor - 44, 100, 8, [P.cyan0, P.amber, P.g9, P.red1], 40); // wires and caps
      p.neon(20, 12, 50, 4, P.cyan, P.cyan0);
      break;
    }
    case 'warren': case 'deepwarren': {
      for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) { const x = 12 + i * 52, y = 14 + r * 46; p.px(x, y, 40, 30, P.ink); p.px(x + 2, y + 2, 36, 26, kind === 'deepwarren' ? P.vio1 : P.vio0); p.px(x + 4, y + 22, 32, 6, P.g9); }
      break;
    }
    case 'plaza': {
      p.px(w / 2 - 30, floor - 14, 60, 14, P.ink); p.px(w / 2 - 28, floor - 12, 56, 10, P.g5); p.px(w / 2 - 26, floor - 12, 52, 2, P.g8); // pebble bowl
      p.neon(w / 2 - 50, 10, 100, 5, P.cyan, P.cyan0); p.neon(w / 2 - 34, 20, 68, 3, P.red, P.blood);
      for (let i = 0; i < 8; i++) p.px(20 + i * 38, 40, 10, 14, P.bone); // old posters
      break;
    }
    case 'shrine': {
      const cx = w / 2; p.px(cx - 24, floor - 40, 48, 40, P.ink); p.px(cx - 22, floor - 38, 44, 38, P.rose1);
      p.px(cx - 14, floor - 62, 28, 22, P.ink); for (let i = 0; i < 5; i++) p.px(cx - 12 + i * 6, floor - 60, 4, 6, P.amber); p.px(cx - 12, floor - 52, 24, 10, P.rust1); // bottle-cap crown
      for (let i = 0; i < 6; i++) { const x = 30 + i * 50; p.px(x, floor - 10, 3, 10, P.bone); p.px(x, floor - 13, 3, 3, P.amberL); }
      break;
    }
    case 'barracks': {
      for (let i = 0; i < 7; i++) { const x = 30 + i * 40; p.px(x, 18, 2, floor - 18, P.g9); p.px(x - 2, 16, 6, 4, P.cyan0); }
      p.px(10, floor - 30, w - 20, 3, P.rust0);
      break;
    }
    case 'graveyard': {
      p.px(30, floor - 24, w - 60, 24, P.ink); p.px(32, floor - 22, w - 64, 22, P.blood0);
      p.speckle(34, floor - 22, w - 68, 20, [P.bone, P.g9, P.amberX], 120, 2);
      break;
    }
    case 'slum': {
      for (let i = 0; i < 4; i++) { const x = 14 + i * 80; p.px(x, 30, 64, floor - 30, P.ink); p.px(x + 2, 32, 60, floor - 34, [P.rose0, P.slate3, P.mauve2, P.g7][i]); p.px(x + 2, 32, 60, 3, P.g9); }
      p.speckle(4, floor - 8, w - 8, 8, [P.rust0, P.g9, P.red0], 60, 2);
      break;
    }
  }
  return p.tex();
}

/** Solid earth with a partial excavation (`frac` dug toward level 1). */
export function paintUndug(w: number, h: number, seed: number): Texture {
  const p = new Painter(w, h, seed);
  p.rock(0, 0, w, h);
  p.px(0, 0, w, 1, P.g4); p.px(0, h - 1, w, 1, P.ink);
  return p.tex();
}

export function paintWheelFrames(): Texture[] {
  const out: Texture[] = [];
  for (let f = 0; f < 4; f++) {
    const p = new Painter(44, 44, 3);
    const cx = 22, cy = 22;
    for (let a = 0; a < 64; a++) { const t = (a / 64) * Math.PI * 2; p.px(cx + Math.cos(t) * 20 - 1, cy + Math.sin(t) * 20 - 1, 3, 3, P.ink); }
    for (let a = 0; a < 64; a++) { const t = (a / 64) * Math.PI * 2; p.px(cx + Math.cos(t) * 20, cy + Math.sin(t) * 20, 1, 1, a % 8 === 0 ? P.amber : P.rust0); }
    for (let k = 0; k < 4; k++) { const t = (k / 4) * Math.PI + (f / 4) * (Math.PI / 4) * 2; for (let r = -18; r <= 18; r += 1) p.px(cx + Math.cos(t) * r, cy + Math.sin(t) * r, 1, 1, P.g9); }
    p.px(cx - 2, cy - 2, 4, 4, P.amber);
    out.push(p.tex());
  }
  return out;
}

export function paintStreetFiller(): Texture {
  const p = new Painter(WORLD_W, 40, 5);
  p.px(0, 0, WORLD_W, 40, P.ink2);
  return p.tex();
}
