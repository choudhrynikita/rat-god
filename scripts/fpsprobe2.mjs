import { chromium, devices } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
await p.goto('http://localhost:4173/?debug=1&seed=11&autostart'); await p.waitForTimeout(2500);
await p.evaluate(() => { window.__rg.send({ t: 'debug', cmd: { what: 'grow', n: 500 } }); }); await p.waitForTimeout(2500);
console.log(await p.evaluate(async () => {
  const w = window.__rg.world, h = window.__rg.hud, s = window.__rg.last();
  let t0 = performance.now(); for (let i = 0; i < 20; i++) w.setSnapshot(s, 1000); const snapMs = (performance.now() - t0) / 20;
  t0 = performance.now(); for (let i = 0; i < 20; i++) h.update(s, null, 1); const hudMs = (performance.now() - t0) / 20;
  // frame timing over 3 s via rAF deltas
  const d = []; let last = performance.now(); await new Promise((res) => { const f = (t) => { d.push(t - last); last = t; if (d.length < 120) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  d.sort((a, b) => a - b);
  return { snapMs, hudMs, medianFrame: d[60], p90: d[108], n: s.n };
}));
await b.close();
