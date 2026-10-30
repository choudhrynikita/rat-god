// Held tools drawn as thick ink, the same poster language as the rats. Not pixel stamps.
import { Texture } from 'pixi.js';
const cache = new Map<string, Texture>();
const INK = '#1c1612', PAPER = '#f4efe4', CLAY = '#6a5344', MUST = '#e2b15a', BRICK = '#c4543a', OLIVE = '#6d7a3c', TIN = '#8a8478';
function ink(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): Texture {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!;
  g.lineWidth = 5; g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = INK; g.fillStyle = CLAY;
  draw(g);
  const t = Texture.from(c); t.source.scaleMode = 'linear'; return t;
}
const stroke = (g: CanvasRenderingContext2D) => { g.stroke(); };
export function toolTexture(tool: number, frame: number): Texture {
  const k = `${tool}:${frame % 3}`; let t = cache.get(k); if (t) return t;
  const flick = frame % 3;
  switch (tool) {
    case 1: t = ink(36, 64, (g) => { g.fillStyle = CLAY; g.fillRect(14, 22, 8, 36); g.strokeRect(14, 22, 8, 36); g.fillStyle = flick === 1 ? PAPER : MUST; g.beginPath(); g.ellipse(18, 16, 8, 12, 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = BRICK; g.beginPath(); g.ellipse(18, 12, 4, 6, 0, 0, Math.PI * 2); g.fill(); }); break;
    case 2: t = ink(40, 48, (g) => { g.fillStyle = CLAY; g.fillRect(16, 18, 8, 26); g.strokeRect(16, 18, 8, 26); g.fillStyle = TIN; g.fillRect(6, 10, 28, 10); g.strokeRect(6, 10, 28, 10); }); break;
    case 3: t = ink(28, 72, (g) => { g.strokeStyle = INK; g.beginPath(); g.moveTo(8, 68); g.lineTo(18, 8); g.stroke(); g.fillStyle = TIN; g.beginPath(); g.moveTo(18, 4); g.lineTo(26, 16); g.lineTo(12, 16); g.closePath(); g.fill(); stroke(g); }); break;
    case 4: t = ink(40, 32, (g) => { g.fillStyle = PAPER; g.fillRect(4, 4, 32, 24); g.strokeRect(4, 4, 32, 24); g.fillStyle = INK; g.fillRect(10, 12, 14, 3); g.fillRect(10, 18, 10, 3); }); break;
    case 5: t = ink(48, 28, (g) => { g.strokeStyle = OLIVE; g.lineWidth = 4; g.beginPath(); g.moveTo(4, 20); g.quadraticCurveTo(20, 4, 40, 16); g.stroke(); g.fillStyle = MUST; g.beginPath(); g.arc(40, 12, 4 + flick, 0, Math.PI * 2); g.fill(); }); break;
    case 6: t = ink(32, 40, (g) => { g.fillStyle = TIN; g.fillRect(8, 10, 16, 18); g.strokeRect(8, 10, 16, 18); g.fillStyle = MUST; g.fillRect(12, 16, 8, 8); g.strokeStyle = INK; g.beginPath(); g.moveTo(16, 10); g.lineTo(16, 2); g.stroke(); }); break;
    case 7: t = ink(48, 28, (g) => { g.strokeStyle = TIN; g.lineWidth = 6; g.beginPath(); g.moveTo(6, 22); g.lineTo(30, 8); g.stroke(); g.strokeStyle = INK; g.lineWidth = 4; g.strokeRect(28, 2, 14, 10); }); break;
    case 8: t = ink(36, 36, (g) => { g.fillStyle = flick ? BRICK : MUST; g.beginPath(); g.arc(18, 18, 12, 0, Math.PI * 2); g.fill(); g.stroke(); }); break;
    default: t = Texture.EMPTY;
  }
  cache.set(k, t); return t;
}
