/** SIM v2 worker. Speaks FromWorker2. The renderer already knows the words. */
import { CONTRACT_VERSION, type FromWorker2, type ToWorker2 } from './contract';
import { createWorld } from './boot';
import { GOD_POWERS, actGod } from './god';
import { LAWS2 } from './laws2';
import { buildSnap, chronicle, ledger, ratDetail, terrainInit } from './snap';
import { stepWorld } from './step';
import { maybeGrow } from './grow';
import { loadWorld, saveWorld } from './persist';
import type { World } from './state';

let world: World | null = null;
let inspectId: number | null = null;
let since = 0;
const omenRead = new Set<number>();

const post = (m: FromWorker2) => postMessage(m);

function publish() {
  if (!world) return;
  const snap = buildSnap(world, since);
  since = world.seq;
  post({ t: 'snap', snap, inspect: inspectId != null ? ratDetail(world, inspectId) : null });
}

function postInit() {
  if (!world) return;
  const burrow = { nodes: world.nodes, edges: world.edges, chambers: world.chambers };
  post({
    t: 'init', contract: CONTRACT_VERSION, terrain: terrainInit(world), burrow,
    powers: GOD_POWERS,
    laws: LAWS2.map((l) => ({ id: l.id, name: l.name, prop: l.prop })),
    contentSettings: world.consent,
  });
  publish();
}

function announceGrow() {
  if (!world) return;
  const g = maybeGrow(world);
  if (g.grew) post({ t: 'worldGrow', terrain: terrainInit(world), dx: g.dx });
}

function onNew(opts: ToWorker2 & { t: 'new' }) {
  world = createWorld(opts.opts);
  since = 0;
  inspectId = null;
  postInit();
}

self.onmessage = (ev: MessageEvent<ToWorker2>) => {
  const m = ev.data;
  try {
    if (!world && m.t !== 'new' && m.t !== 'load') return;
    if (m.t === 'new') onNew(m);
    else if (m.t === 'load') {
      world = loadWorld(m.state);
      since = world.seq;
      inspectId = null;
      postInit();
    }
    else if (!world) return;
    else if (m.t === 'speed') world.speed = m.v;
    else if (m.t === 'view') { world.view = { x0: m.x0, y0: m.y0, x1: m.x1, y1: m.y1 }; announceGrow(); }
    else if (m.t === 'inspect') { inspectId = m.id; publish(); }
    else if (m.t === 'story') { const detail = ratDetail(world, m.id); if (detail) post({ t: 'story', id: m.id, detail }); }
    else if (m.t === 'chronicle') post({ t: 'chronicle', data: chronicle(world) });
    else if (m.t === 'save') post({ t: 'saved', state: saveWorld(world), day: Math.floor(world.tick / 960) + 1, seed: world.seed });
    else if (m.t === 'gore') world.gore = m.on;
    else if (m.t === 'consent') world.consent = { ...m.consent, sexual: false };
    else if (m.t === 'advance') {
      if (world.speed !== 0 && m.ticks > 0) { stepWorld(world, Math.min(96, m.ticks)); announceGrow(); publish(); }
    }
    else if (m.t === 'god') post(actGod(world, m));
    else if (m.t === 'omens') {
      const list = world.events.filter((e) => (e.sev ?? 0) >= 2).slice(-40);
      post({ t: 'omens', list, unread: list.filter((e) => !omenRead.has(e.seq)).length });
    } else if (m.t === 'omensRead') { for (const s of m.seqs) omenRead.add(s); }
    else if (m.t === 'ledger') post({ t: 'ledger', data: ledger(world) });
    else if (m.t === 'debug') { if (m.what === 'tod') world.tick = Math.round(Number(m.arg) * 960); }
  } catch (e) {
    post({ t: 'error', msg: e instanceof Error ? e.message : String(e) });
  }
};
