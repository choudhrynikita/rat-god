// quick v2 dev probe: consent → opening → world. usage: node scripts/v2shot.mjs [url-suffix] [name]
import { chromium, devices } from 'playwright';
const suf = process.argv[2] ?? ''; const name = process.argv[3] ?? 'probe';
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage(); const errs = [];
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 400)); }); p.on('pageerror', (e) => errs.push('pageerror: ' + e.message + '\n' + (e.stack ?? '').slice(0, 600)));
await p.goto('http://127.0.0.1:5181/' + suf); await p.waitForTimeout(3000);
const out = '/workspace/ratgod/reports/v2/dev/';
await p.screenshot({ path: out + name + '_0gate.png' });
const enter = p.locator('[data-enter]'); if (await enter.count()) await enter.click();
await p.waitForTimeout(1500); await p.screenshot({ path: out + name + '_1open.png' });
await p.locator('.h2-opening').click().catch(() => {}); await p.waitForTimeout(2500);
await p.screenshot({ path: out + name + '_2world.png' });
const info = await p.evaluate(() => { const w = window.__rg?.world; return w ? { fps: w.fps, z: w.cam.z, x: w.cam.x, y: w.cam.y, tier: w.post.tier, rats: w.actors.rv.size } : null; });
console.log(JSON.stringify(info)); console.log(errs.slice(0, 20).join('\n'));
await b.close();
