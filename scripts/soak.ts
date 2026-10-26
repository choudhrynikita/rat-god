// 2,000-tick soak from founding with the autonomous king. Writes reports/soak.png + reports/soak.json.
import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createState, step, cityGrievance, snapshot, chronicle } from '../src/sim/sim';

const seed = +(process.argv[2] ?? 1), ticks = +(process.argv[3] ?? 2000);
const s = createState(seed);
const rows: { t: number; pop: number; food: number; griev: number; laws: number; plate: number }[] = [];
let maxStep = 0, nan = 0; const t0 = performance.now();
for (let t = 0; t < ticks; t++) {
  const a = performance.now(); step(s); maxStep = Math.max(maxStep, performance.now() - a);
  if (t % 5 === 0) {
    const r = { t, pop: s.rats.length, food: s.food, griev: cityGrievance(s), laws: Object.keys(s.laws).length, plate: s.king.plateRatio };
    if (Object.values(r).some((v) => !Number.isFinite(v))) nan++;
    rows.push(r);
    snapshot(s);
  }
}
const ms = performance.now() - t0;
const W = 900, H = 420, png = new PNG({ width: W, height: H });
const px = (x: number, y: number, c: number[]) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 255; };
for (let i = 0; i < W * H; i++) { png.data[i * 4] = 18; png.data[i * 4 + 1] = 14; png.data[i * 4 + 2] = 20; png.data[i * 4 + 3] = 255; }
const series: [keyof typeof rows[0], number[], number][] = [['pop', [230, 200, 120], 0], ['food', [110, 200, 120], 0], ['griev', [220, 70, 70], 1], ['laws', [90, 170, 230], 8], ['plate', [200, 120, 220], 3]];
for (let y = 0; y < H; y += 60) for (let x = 0; x < W; x++) px(x, y, [40, 34, 44]);
for (const [k, c, fixed] of series) {
  const max = fixed || Math.max(1, ...rows.map((r) => r[k] as number));
  let prev: [number, number] | null = null;
  rows.forEach((r, i) => {
    const x = Math.round((i / (rows.length - 1)) * (W - 1)), y = Math.round(H - 10 - ((r[k] as number) / max) * (H - 20));
    if (prev) { const [x0, y0] = prev; const n = Math.max(Math.abs(x - x0), Math.abs(y - y0), 1); for (let j = 0; j <= n; j++) { px(Math.round(x0 + ((x - x0) * j) / n), Math.round(y0 + ((y - y0) * j) / n), c); px(Math.round(x0 + ((x - x0) * j) / n), Math.round(y0 + ((y - y0) * j) / n) + 1, c); } }
    prev = [x, y];
  });
}
mkdirSync('reports', { recursive: true });
writeFileSync('reports/soak.png', PNG.sync.write(png));
const c = chronicle(s);
const summary = { seed, ticks, ms: Math.round(ms), msPerTick: +(ms / ticks).toFixed(3), maxStepMs: +maxStep.toFixed(2), nanRows: nan, finalPop: s.rats.length, peak: s.peakPop, maxFood: Math.max(...rows.map((r) => r.food)), kings: c.kings.length, lawsPressed: c.lawsPressed, phase: s.phase, legend: 'pop=gold food=green grievance(0-1)=red laws(0-8)=blue plate(0-3)=violet' };
writeFileSync('reports/soak.json', JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary));
if (nan) process.exit(1);
