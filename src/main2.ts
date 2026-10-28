// RAT GOD v2 entry: renderer + world + sim (in-process mock by default, ?sim=real for the SIM worker) + HUD.
import './ui/styles.css';
import './ui/v2/hud2.css';
import { autoDetectRenderer } from 'pixi.js';
import { World2 } from './render/v2/world2';
import { loadSprites } from './render/v2/sprites';
import { Post } from './render/v2/post';
import { MockSim } from './render/mock/mocksim';
import type { FromWorker2, ToWorker2 } from './sim/v2/contract';
import { TICK_MS_1X } from './sim/v2/contract';
import { PX } from './render/v2/units';
import { Hud2 } from './ui/v2/hud2';

const params = new URLSearchParams(location.search);
export interface SimPort { send(m: ToWorker2): void; on(f: (m: FromWorker2) => void): void; tick(ms: number): void }

function makeSim(): SimPort {
  if (params.get('sim') !== 'mock') {
    const mods = import.meta.glob('./sim/v2/worker.ts', { query: '?worker', import: 'default', eager: true }) as Record<string, new () => Worker>;
    const W = Object.values(mods)[0];
    if (W) {
      const w = new W(); const ls: ((m: FromWorker2) => void)[] = [];
      w.onmessage = (e) => { for (const f of ls) f(e.data); };
      let speed = 1, acc = 0;
      return {
        send: (m) => { if (m.t === 'speed') speed = m.v; w.postMessage(m); },
        on: (f) => ls.push(f),
        tick: (ms) => {
          if (!speed) return;
          acc += ms * speed;
          let n = 0;
          const cap = Math.max(8, Math.ceil(speed * 4));
          while (acc >= TICK_MS_1X && n < cap) { acc -= TICK_MS_1X; n++; }
          if (acc > TICK_MS_1X) acc = TICK_MS_1X;
          if (n) w.postMessage({ t: 'advance', ticks: n });
        },
      };
    }
    console.warn('sim worker not available; using the mock');
  }
  const m = new MockSim(Number(params.get('seed') ?? 7)); return { send: (x) => m.send(x), on: (f) => m.on(f), tick: (ms) => m.update(ms) };
}

async function boot() {
  const bar = document.getElementById('bootBar') as HTMLElement | null;
  await loadSprites((d, t) => { if (bar) bar.style.width = `${Math.round((d / t) * 100)}%`; });
  const host = document.getElementById('world')!;
  const R = Post.resFor('high');
  const renderer = await autoDetectRenderer({ preference: 'webgl', antialias: false, resolution: R, autoDensity: true, width: innerWidth, height: innerHeight, background: '#080d0a', powerPreference: 'high-performance' });
  host.appendChild(renderer.canvas); renderer.canvas.style.display = 'block';
  const world = new World2(renderer, renderer.canvas);
  const resize = (res = renderer.resolution) => { renderer.resolution = res; renderer.resize(innerWidth, innerHeight, res); world.resize(innerWidth, innerHeight, res); };
  addEventListener('resize', () => resize()); resize(R);
  world.onTier = (t) => resize(Post.resFor(t));
  const sim = makeSim();
  const hud = new Hud2(document.getElementById('ui')!, world, sim);
  sim.on((m) => { world.handle(m); hud.handle(m); });
  hud.start();
  (window as any).__rg = { world, sim, hud };
  let last = performance.now();
  let saveAcc = 0, viewAcc = 0;
  const loop = () => {
    const now = performance.now(); const dt = Math.min(100, now - last); last = now;
    sim.tick(dt);
    saveAcc += dt; viewAcc += dt;
    if (saveAcc > 15000) { saveAcc = 0; sim.send({ t: 'save' }); }
    if (viewAcc > 400 && world.T) {
      viewAcc = 0; const v = world.cam.view(48);
      sim.send({ t: 'view', x0: v.x0 / PX, y0: v.y0 / PX, x1: v.x1 / PX, y1: v.y1 / PX });
    }
    world.frame(); hud.frame(); requestAnimationFrame(loop);
  };
  addEventListener('visibilitychange', () => { if (document.hidden) sim.send({ t: 'save' }); });
  addEventListener('pagehide', () => sim.send({ t: 'save' }));
  requestAnimationFrame(loop);
  document.getElementById('boot')?.remove();
}
boot().catch((e) => { console.error(e); const m = document.getElementById('bootMsg'); if (m) m.textContent = 'THE CITY FAILED TO WAKE: ' + String(e?.message ?? e); });
