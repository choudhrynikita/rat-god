// Playwright gate: iPhone 13 + Pixel 7 screenshots, ≥12px text, ≥44px touch targets, console errors, 500-rat fps.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const URL0 = process.env.RG_URL ?? 'http://localhost:4173/';
async function clearModals(p) { for (let i = 0; i < 6; i++) { await p.evaluate(() => window.__rg.hud.closeModal()); await p.waitForTimeout(250); } }
const out = { devices: {}, consoleErrors: [], fps: {}, audio: {}, inspectFollow: {} };
fs.mkdirSync('reports/shots', { recursive: true });
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function audit(p) {
  return p.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0 && r.bottom > 0 && r.top < innerHeight; };
    const small = [], tiny = [];
    for (const el of document.querySelectorAll('#ui *')) {
      if (!vis(el)) continue;
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (hasText) { const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 12) small.push(`${el.tagName}.${el.className}:${fs}px "${el.textContent.trim().slice(0, 30)}"`); }
      if (el.matches('button, a, [role=button], input')) { const r = el.getBoundingClientRect(); if (r.width < 44 || r.height < 44) tiny.push(`${el.tagName}#${el.id}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)} "${el.textContent.trim().slice(0, 20)}"`); }
    }
    return { small, tiny };
  });
}
const wait = (p, ms) => p.waitForTimeout(ms);
const rg = (p, fn, arg) => p.evaluate(fn, arg);

for (const name of ['iPhone 13', 'Pixel 7']) {
  const key = name.replace(/\s+/g, '').toLowerCase();
  const ctx = await b.newContext({ ...devices[name] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  out.failedRequests ??= []; p.on('requestfailed', (r) => { const e = r.failure()?.errorText ?? ''; if (e !== 'net::ERR_ABORTED') out.failedRequests.push(key + ': ' + r.url() + ' ' + e); });
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  const shots = {}; const audits = {};
  const shot = async (scene) => { const f = `reports/shots/${key}_${scene}.png`; await p.screenshot({ path: f }); shots[scene] = f; audits[scene] = await audit(p); };
  await p.goto(URL0 + '?debug=1&seed=11'); await p.waitForSelector('#tNew', { timeout: 60000 }); await wait(p, 1200);
  await shot('title');
  await p.tap('#tNew'); await wait(p, 1500);
  // founder digging: fast-forward until the founder is digging, follow him
  await rg(p, () => window.__rg.send({ t: 'advance', ticks: 30 })); await wait(p, 600);
  await rg(p, () => { const s = window.__rg.last(); const id = s.founderId; window.__rg.world.followId = id; window.__rg.world.cam.z = 4; window.__rg.send({ t: 'inspect', id }); window.__rg.hud.following = id; });
  await wait(p, 2500);
  await shot('founder_digging');
  await rg(p, () => { window.__rg.hud.closeInspect(); });
  // law board: grow city, let the king think and press
  await rg(p, () => { window.__rg.send({ t: 'debug', cmd: { what: 'grow', n: 60 } }); });
  await wait(p, 800);
  await rg(p, () => window.__rg.send({ t: 'advance', ticks: 20 * 6 })); await wait(p, 1500);
  await rg(p, () => { window.__rg.hud.closeModal(); window.__rg.hud.closeModal(); window.__rg.hud.openBoard(); }); await wait(p, 700);
  await shot('kings_board');
  await rg(p, () => window.__rg.hud.closeBoard());
  // whole-city overview at the minimum zoom
  await rg(p, () => { const c = window.__rg.world.cam; window.__rg.world.followId = null; c.z = c.minZ; c.x = 384; c.y = 520; c.clamp(); c.apply(); }); await wait(p, 900);
  await shot('city_overview');
  // hazards on the street: the cat and the exterminator drone (final art)
  await rg(p, () => { const w = window.__rg.world; w.onSimEvent('cat'); w.onSimEvent('gas'); w.cam.centerOn(384, 120, w.cam.minZ + 1); }); await wait(p, 2600);
  await shot('street_hazards');
  out.audio[key] = await rg(p, () => { const m = window.__rg.mixer; return { state: m.state, ctx: m.ctx?.state ?? null, decks: m.decks.map((d) => ({ id: d.id, src: d.el.src.split('/').pop(), paused: d.el.paused, want: d.want })), amb: m.amb.map((a) => ({ id: a.id, want: +a.want.toFixed(2), paused: a.el.paused })) }; });
  await rg(p, () => { window.__rg.world.focusKing(); }); await wait(p, 800);
  await shot('throne');
  // vote
  await rg(p, () => window.__rg.send({ t: 'debug', cmd: { what: 'gather' } })); await wait(p, 300);
  await rg(p, () => window.__rg.send({ t: 'advance', ticks: 13 })); await wait(p, 300);
  await rg(p, () => { window.__rg.world.followId = null; window.__rg.world.focusRoom(6); }); await wait(p, 1500);
  await shot('vote');
  // king death
  await rg(p, () => { window.__rg.hud.closeModal(); window.__rg.send({ t: 'debug', cmd: { what: 'killKing' } }); }); await wait(p, 300);
  await rg(p, () => window.__rg.send({ t: 'advance', ticks: 2 })); await wait(p, 2000);
  await shot('king_death');
  await rg(p, () => { window.__rg.hud.closeModal(); window.__rg.hud.chronicle; window.__rg.send({ t: 'chronicle' }); }); await wait(p, 400);
  // inspect a worker (after the succession modal has come and gone)
  await wait(p, 1500); await clearModals(p);
  await rg(p, () => { const s = window.__rg.last(); const id = s.ids[Math.floor(s.n / 2)]; window.__rg.world.onTapRat(id); window.__rg.world.followId = id; window.__rg.hud.following = id; }); await wait(p, 2000);
  await shot('inspect');
  out.inspectFollow[key] = await rg(p, () => { const w = window.__rg.world; const v = w.rats.get(w.followId); if (!v) return null; const c = w.cam; const sy = (v.y * c.z + w.root.y * c.res) / c.dpr; const sheetTop = document.getElementById('inspect').getBoundingClientRect().top; const topBot = document.getElementById('top').getBoundingClientRect().bottom; return { ratScreenY: Math.round(sy), sheetTop: Math.round(sheetTop), hudBottom: Math.round(topBot), visible: sy < sheetTop && sy - 40 > topBot }; });
  // fps at 500 rats
  if (key === 'iphone13') {
    await rg(p, () => { window.__rg.hud.closeInspect(); window.__rg.hud.closeModal(); window.__rg.send({ t: 'debug', cmd: { what: 'grow', n: 500 } }); window.__rg.world.cam.z = window.__rg.world.cam.minZ; window.__rg.world.cam.clamp(); });
    await wait(p, 3000);
    const n = await rg(p, () => window.__rg.ratCount());
    const rafFps = () => p.evaluate(async () => { const d = []; let last = performance.now(); await new Promise((res) => { const f = (t) => { d.push(t - last); last = t; if (d.length < 240) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); const tot = d.slice(10).reduce((a, x) => a + x, 0); const sorted = d.slice(10).sort((a, b) => a - b); return { fps: (d.length - 10) * 1000 / tot, p95FrameMs: sorted[Math.floor(sorted.length * 0.95)], tickerFps: window.__rg.fps() }; });
    const whole = await rafFps();
    await rg(p, () => { const c = window.__rg.world.cam; c.z = c.minZ + 2; c.clamp(); }); await wait(p, 1500);
    const play = await rafFps();
    const frameTime = await p.evaluate(() => { const w = window.__rg.world; const t0 = performance.now(); for (let i = 0; i < 60; i++) w.frame(16.7); return (performance.now() - t0) / 60; });
    await rg(p, () => { const c = window.__rg.world.cam; c.z = c.minZ; c.clamp(); }); await wait(p, 800);
    await shot('rats500');
    out.fps = { rats: n, wholeCityZoom: whole, defaultZoom: play, cpuUpdateMsPerFrame: frameTime, renderer: await p.evaluate(() => window.__rg.world.app.renderer.name ?? window.__rg.world.app.renderer.type) };
  }
  out.devices[key] = { shots, audits };
  out.consoleErrors.push(...errs.map((e) => `${key}: ${e}`));
  await ctx.close();
}
// short screen: the inspect sheet must not hide a followed rat (iPhone SE, 667px tall)
{ const ctx = await b.newContext({ ...devices['iPhone SE'] }); const p = await ctx.newPage(); await p.goto(URL0 + '?debug=1&seed=11'); await p.waitForSelector('#tNew', { timeout: 60000 }); await wait(p, 800); await p.tap('#tNew'); await wait(p, 1200);
  await rg(p, () => { window.__rg.send({ t: 'debug', cmd: { what: 'grow', n: 60 } }); }); await wait(p, 600); await rg(p, () => window.__rg.send({ t: 'advance', ticks: 200 })); await wait(p, 1500);
  await clearModals(p);
  await rg(p, () => { const s = window.__rg.last(); let id = s.ids[0]; for (let i = 0; i < s.n; i++) if (s.room[i] === 0 || s.room[i] === 1) { id = s.ids[i]; break; } window.__rg.world.onTapRat(id); window.__rg.world.followId = id; window.__rg.hud.following = id; window.__rg.world.cam.z = 4; }); await wait(p, 2500);
  await p.screenshot({ path: 'reports/shots/iphonese_inspect_follow.png' });
  out.inspectFollow.iphonese = await rg(p, () => { const w = window.__rg.world; const v = w.rats.get(w.followId); if (!v) return null; const c = w.cam; const sy = (v.y * c.z + w.root.y * c.res) / c.dpr; const sheetTop = document.getElementById('inspect').getBoundingClientRect().top; const topBot = document.getElementById('top').getBoundingClientRect().bottom; return { ratScreenY: Math.round(sy), sheetTop: Math.round(sheetTop), hudBottom: Math.round(topBot), visible: sy < sheetTop && sy - 40 > topBot }; });
  await ctx.close(); }
// desktop gate
{ const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage(); const errs = []; p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); await p.goto(URL0); await wait(p, 2000); await p.screenshot({ path: 'reports/shots/desktop_qr.png' }); out.consoleErrors.push(...errs.map((e) => 'desktop: ' + e)); await ctx.close(); }
await b.close();
fs.writeFileSync('reports/verify.json', JSON.stringify(out, null, 2));
const bad = Object.entries(out.devices).flatMap(([d, v]) => Object.entries(v.audits).flatMap(([s, a]) => [...a.small.map((x) => `${d}/${s} small: ${x}`), ...a.tiny.map((x) => `${d}/${s} target: ${x}`)]));
console.log(JSON.stringify({ fps: out.fps, audio: out.audio, inspectFollow: out.inspectFollow, consoleErrors: out.consoleErrors, auditFailures: [...new Set(bad)] }, null, 2));
