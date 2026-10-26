// Small code-drawn pixel props (held tools) until generated art replaces them. All colours from the palette.
import { Texture } from 'pixi.js';
const cache = new Map<string, Texture>();
type Px = [number, number, string];
function draw(w: number, h: number, px: Px[]) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!; for (const [x, y, col] of px) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } const t = Texture.from(c); t.source.scaleMode = 'nearest'; return t; }
const line = (x0: number, y0: number, x1: number, y1: number, col: string): Px[] => { const out: Px[] = []; const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) out.push([Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), col]); return out; };
const WOOD = '#70473f', DARK = '#080d0a', MET = '#796765', MET2 = '#4b7e89', FIRE = ['#f2b46a', '#e84b5a', '#f6c992'], CYAN = '#45eaf0';
export function toolTexture(tool: number, frame: number): Texture {
  const k = `${tool}:${frame}`; let t = cache.get(k); if (t) return t;
  let px: Px[] = [];
  switch (tool) {
    case 1: px = [...line(2, 11, 2, 4, WOOD), [1, 3, FIRE[frame % 3]], [2, 2, FIRE[(frame + 1) % 3]], [3, 3, FIRE[(frame + 2) % 3]], [2, 1, FIRE[0]], [2, 3, '#f6c992']]; t = draw(5, 12, px); break; // torch
    case 2: px = [...line(1, 9, 1, 6, WOOD), ...line(0, 5, 4, 5, MET), ...line(1, 4, 3, 4, '#907d78'), [2, 3, '#907d78']]; t = draw(5, 10, px); break; // digging blade
    case 3: px = [...line(0, 13, 5, 2, WOOD), [5, 1, MET], [6, 0, '#907d78'], [6, 1, MET]]; t = draw(7, 14, px); break; // spear
    case 4: px = []; for (let y = 2; y < 8; y++) for (let x = 0; x < 6; x++) px.push([x, y, y === 2 || x === 0 ? '#505b5c' : '#373f41']); px.push([2, 4, '#d8b397'], [3, 4, '#d8b397'], [2, 6, '#d8b397']); t = draw(6, 8, px); break; // slate with marks
    case 5: px = [...line(0, 7, 3, 4, '#ba8360'), ...line(3, 4, 5, 5, '#ba8360'), [5 + (frame % 2), 4 - frame % 2, CYAN], [4, 3, frame ? CYAN : '#42c3ca']]; t = draw(7, 8, px); break; // wire & spark
    case 6: px = [...line(2, 0, 2, 1, MET), [1, 2, DARK], [3, 2, DARK], [1, 3, FIRE[frame % 3]], [2, 3, '#f6c992'], [3, 3, FIRE[0]], [1, 4, FIRE[0]], [2, 4, FIRE[(frame + 1) % 3]], [3, 4, FIRE[0]], ...line(1, 5, 3, 5, DARK)]; t = draw(5, 6, px); break; // lantern
    case 7: px = [...line(0, 8, 4, 3, MET2), [4, 2, MET2], [5, 3, MET2], [5, 1, MET2], [6, 2, MET2]]; t = draw(7, 9, px); break; // wrench
    default: t = Texture.EMPTY;
  }
  cache.set(k, t); return t;
}
