import { chromium, devices } from 'playwright';
const name = process.argv[2] ?? 'z';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ ...devices['iPhone 13'] });
await ctx.addInitScript(() => localStorage.setItem('rg2.consent.v1', JSON.stringify({ mature: false, gore: 0, sexual: false, adult: true })));
const p = await ctx.newPage(); const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); }); p.on('pageerror', (e) => errs.push('pageerror: ' + e.message + (e.stack ?? '').slice(0, 400)));
await p.goto('http://127.0.0.1:5181/' + (process.argv[3] ?? '')); await p.waitForTimeout(2500);
await p.locator('.h2-opening').click().catch(() => {}); await p.waitForTimeout(1600);
await p.evaluate(() => { const w = window.__rg.world; w.post.auto = false; });
const shots = JSON.parse(process.argv[4] ?? '[["far",null,null,0],["mid",null,null,0.35],["street",null,-300,0.7],["close",null,null,3]]');
for (const [n, x, y, z] of shots) {
  await p.evaluate(([x, y, z]) => { const w = window.__rg.world, c = w.cam; c.follow = null; const b = c.bounds; c.jumpTo(x ?? (b.x0 + b.x1) / 2 , y ?? (z < 0.5 ? (b.y0 + b.y1) / 2 : 920), z || c.minZ); }, [x, y, z]);
  await p.waitForTimeout(1500);
  const fps = await p.evaluate(() => window.__rg.world.fps);
  await p.screenshot({ path: `/workspace/ratgod/reports/v2/dev/${name}_${n}.png` }); console.log(n, 'fps', fps.toFixed(1));
}
console.log(errs.slice(0, 10).join('\n')); await b.close();
