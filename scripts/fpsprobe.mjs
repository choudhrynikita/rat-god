import { chromium, devices } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage();
await p.goto('http://localhost:4173/?debug=1&seed=11&autostart'); await p.waitForTimeout(2500);
const meas = async (label) => { await p.waitForTimeout(1500); const xs = []; for (let i = 0; i < 6; i++) { await p.waitForTimeout(500); xs.push(await p.evaluate(() => window.__rg.fps())); } 
  const r = await p.evaluate(() => { const w = window.__rg.world; const t0 = performance.now(); for (let i = 0; i < 30; i++) { w.frame(16.7); w.app.renderer.render(w.app.stage); } w.app.renderer.gl?.finish?.(); return { ms: (performance.now() - t0) / 30, res: w.cam.res, z: w.cam.z, W: w.app.renderer.width, n: w.rats.size }; });
  console.log(label, JSON.stringify(r), 'fps', (xs.reduce((a, x) => a + x, 0) / xs.length).toFixed(1)); };
await p.evaluate(() => { window.__rg.world.cam.z = 1; }); await meas('1 rat z1');
await p.evaluate(() => { window.__rg.send({ t: 'debug', cmd: { what: 'grow', n: 500 } }); }); await p.waitForTimeout(2000);
await p.evaluate(() => { window.__rg.world.cam.z = 1; window.__rg.world.cam.clamp(); }); await meas('500 z1');
await p.evaluate(() => { window.__rg.world.cam.z = 3; window.__rg.world.cam.clamp(); }); await meas('500 z3');
await p.evaluate(() => { window.__rg.setSpeed(0); }); await meas('500 z3 paused');
await b.close();
