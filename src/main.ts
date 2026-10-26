import './ui/styles.css';
import { World } from './render/world';
import { loadAll, report } from './render/assets';
import { SimClient } from './client/simclient';
import { Hud } from './ui/hud';
import { readSave, writeSave, clearSave, prefs } from './client/save';
import { sfx, unlock, setAudio } from './audio/sfx';
import { Mixer } from './audio/mixer';
import { STREET_H } from './render/layout';
import type { Speed, Chronicle } from './net/protocol';
import type { Snapshot } from './sim/sim';
import { R } from './sim/types';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

async function boot() {
  const hud = new Hud(document.getElementById('ui')!, {
    speed: (v) => setSpeed(v), inspect: (id) => inspect(id), follow: (id) => { world.followId = id; },
    focusKing: () => { world.followId = null; world.focusKing(Math.max(world.cam.minZ + 1, 3)); },
    focusPlaza: () => { world.followId = null; world.focusRoom(R.plaza); },
    chronicle: () => { want = 'book'; sim.send({ t: 'chronicle' }); },
    newGame: () => newGame(), continueGame: () => void cont(),
    gore: (on) => { world.gore = on; prefs.set('gore', on); sim.send({ t: 'gore', on }); },
    sound: (on) => { setAudio(on); prefs.set('sound', on); }, music: (on) => { mixer.setMusicOn(on); prefs.set('music', on); }, ui: () => sfx.ui(),
  });
  const mixer = new Mixer();
  const gore = prefs.get('gore', true); const sound = prefs.get('sound', true); const music = prefs.get('music', true);
  if (!gore) document.body.classList.add('nogore');
  hud.soundOn = sound; setAudio(sound); hud.musicOn = music; mixer.setMusicOn(music);

  const coarse = matchMedia('(pointer: coarse)').matches;
  const desktop = !coarse && window.innerWidth > 820 && !params.has('desktop') && !DEBUG;
  if (desktop) { document.getElementById('boot')?.remove(); await new Promise<void>((res) => void hud.showDesktop(location.href.split('#')[0], res)); }

  const world = new World();
  const bootBar = document.getElementById('bootBar');
  await loadAll((d, t) => { if (bootBar) bootBar.style.width = `${Math.round(100 * d / t)}%`; });
  await world.init(document.getElementById('world')!);
  document.getElementById('boot')?.remove();
  world.gore = gore;
  const sim = new SimClient();
  let speed: Speed = 1, resumeSpeed: Speed = 1, started = false, want: 'book' | 'death' | 'over' | null = null;
  let pendingDeath: { text: string; executed: boolean } | null = null;
  let last: Snapshot | null = null; let inspectId: number | null = null;
  const queue: (() => void)[] = [];
  const showModal = (fn: () => void, pause = true) => {
    const run = () => { if (pause && speed !== 0) { resumeSpeed = speed; setSpeed(0, true); } fn(); };
    if (hud.modalOpen) queue.push(run); else run();
  };
  hud.onModalClose = () => { const n = queue.shift(); if (n) n(); else if (speed === 0 && resumeSpeed !== 0 && autoPaused) { autoPaused = false; setSpeed(resumeSpeed); } };
  let autoPaused = false;
  function setSpeed(v: Speed, auto = false) { speed = v; autoPaused = auto; sim.send({ t: 'speed', v }); }
  function inspect(id: number | null) { inspectId = id; sim.send({ t: 'inspect', id }); if (id == null) hud.info = null; }
  world.onTapRat = (id) => { if (id == null) { if (hud.info) hud.closeInspect(); return; } if (Math.random() < 0.35) sfx.scurry(); else sfx.squeak(); inspect(id); };
  world.onTapThrone = () => hud.openBoard();
  world.cam.onUserMove = () => { if (world.followId != null) { world.followId = null; hud.following = null; } };

  sim.on((m) => {
    if (m.t === 'snap') {
      const first = !last; last = m.snap;
      world.setSnapshot(m.snap, m.tickMs);
      if (inspectId != null && !m.inspect) { inspectId = null; hud.info = null; }
      hud.update(m.snap, inspectId != null ? m.inspect : null, m.speed);
      // keep a followed rat in the strip of world still visible between the top HUD and the inspect sheet
      const sheet = document.getElementById('inspect')!; const H = window.innerHeight;
      if (hud.info && !sheet.classList.contains('hidden')) {
        const bot = H - sheet.getBoundingClientRect().top; const top = document.getElementById('top')!.getBoundingClientRect().bottom;
        world.followOffsetCss = Math.max(0, world.cam.bias * H - (top + (H - bot)) / 2); world.cam.padBot = Math.max(90, bot) * world.cam.dpr;
      } else { world.followOffsetCss = 0; world.cam.padBot = 90 * world.cam.dpr; }
      if (first) { if (m.snap.phase === 'founding') world.cam.centerOn(250, 150); else world.focusKing(); }
      if (m.snap.phase === 'dead' && started && want !== 'over' && !overShown) { overShown = true; want = 'over'; sim.send({ t: 'chronicle' }); }
      if (started) mixer.update(m.snap, world.cam.y, STREET_H);
    } else if (m.t === 'saved') void writeSave({ state: m.state, day: m.day, seed: m.seed, at: Date.now() });
    else if (m.t === 'chronicle') onChronicle(m.data);
    else if (m.t === 'error') console.warn('[sim]', m.msg);
  });
  let overShown = false; let lastReveal: string | null = null;
  function onChronicle(c: Chronicle) {
    const w = want; want = null;
    if (w === 'book') showModal(() => hud.chronicle(c), false);
    else if (w === 'death' && pendingDeath) { const d = pendingDeath; pendingDeath = null; showModal(() => hud.kingDeath(d.text, d.executed, c.insights[c.insights.length - 1] ?? null)); }
    else if (w === 'over') showModal(() => hud.experimentOver(c));
  }
  hud.onEvent = (kind, text) => {
    world.onSimEvent(kind);
    if (kind === 'press' || kind === 'law') sfx.press();
    else if (kind === 'cat') { sfx.hiss(); setTimeout(() => sfx.scurry(), 700); }
    else if (kind === 'boot') sfx.boot();
    else if (kind === 'gas') sfx.gas();
    else if (kind === 'exile' || kind === 'stray') sfx.scurry();
    else if (kind === 'herald') sfx.herald();
    else if (kind === 'birth') sfx.squeak();
    else if (kind === 'crowned') {
      sfx.bell(); mixer.holdState('succession', 45000);
      const s = last; const ins = lastReveal; lastReveal = null;
      if (s) setTimeout(() => showModal(() => hud.succession(last?.king.name ?? s.king.name, text, last?.mind?.traits ?? [], ins)), 400);
    } else if (kind === 'king_died' || kind === 'executed') {
      sfx.death(); mixer.holdState('death', 50000); pendingDeath = { text, executed: kind === 'executed' };
      setTimeout(() => { want = 'death'; sim.send({ t: 'chronicle' }); }, 300);
    } else if (kind === 'death') { if (Math.random() < 0.3) sfx.death(); }
    else if (kind === 'gather') sfx.pebble();
    else if (kind === 'reveal') lastReveal = text;
  };

  function newGame() {
    void clearSave(); overShown = false; last = null; hud.lastSeq = 0; hud.primed = false; hud.closeModal(); queue.length = 0;
    const seed = params.has('seed') ? +params.get('seed')! : (Date.now() % 2147483647) | 0;
    hud.hideTitle(); started = true; sim.send({ t: 'new', seed }); setSpeed(1);
  }
  async function cont() { const sv = await readSave(); if (!sv) return newGame(); started = true; overShown = false; sim.send({ t: 'load', state: sv.state }); setSpeed(1); }

  window.addEventListener('pointerdown', () => unlock(), { once: false, passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden && started) sim.send({ t: 'save' }); });

  const sv = await readSave();
  if (params.has('autostart')) newGame(); else { hud.showTitle(sv ? { day: sv.day } : null); mixer.title(); }

  if (DEBUG) {
    (window as unknown as Record<string, unknown>).__rg = {
      sim, world, hud, report, mixer, send: (m: Parameters<SimClient['send']>[0]) => sim.send(m), fps: () => world.fps, last: () => last, setSpeed,
      newGame, ratCount: () => world.rats.size,
    };
  }
}
boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="color:#e84b5a;padding:20px;white-space:pre-wrap">Rat God failed to start: ${String(e)}</pre>`); });
