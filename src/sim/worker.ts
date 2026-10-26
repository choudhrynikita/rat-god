/// <reference lib="webworker" />
// The simulation runs here, off the main thread. 1 tick = 1 s at 1×.
import { createState, step, snapshot, inspectRat, chronicle, applyCommand, growCity, day } from './sim';
import type { SimState } from './types';
import type { ToWorker, FromWorker, Speed } from '../net/protocol';

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, transfer);
let s: SimState | null = null;
let speed: Speed = 1;
let inspectId: number | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastSaveDay = -1;
const BASE_MS = 1000;

function tickMs() { return speed ? BASE_MS / speed : BASE_MS; }

function emit() {
  if (!s) return;
  const snap = snapshot(s);
  post({ t: 'snap', snap, inspect: inspectId != null ? inspectRat(s, inspectId) : null, speed, tickMs: tickMs() }, [snap.ids.buffer, snap.room.buffer, snap.act.buffer, snap.flags.buffer]);
}
function save() { if (s) post({ t: 'saved', state: JSON.stringify(s), day: day(s), seed: s.seed }); }

function loop() {
  timer = null;
  if (!s) return;
  if (speed > 0 && s.phase !== 'dead') {
    try { step(s); } catch (e) { post({ t: 'error', msg: String((e as Error)?.stack ?? e) }); speed = 0; }
    const d = day(s);
    if (d !== lastSaveDay && d % 2 === 0) { lastSaveDay = d; save(); }
    if ((s.phase as string) === 'dead') save();
  }
  emit();
  timer = setTimeout(loop, tickMs());
}
function restart() { if (timer) clearTimeout(timer); timer = setTimeout(loop, 0); }

self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  switch (m.t) {
    case 'new': s = createState(m.seed); lastSaveDay = -1; inspectId = null; restart(); save(); break;
    case 'load': try { s = JSON.parse(m.state) as SimState; inspectId = null; restart(); } catch (e) { post({ t: 'error', msg: 'bad save: ' + String(e) }); } break;
    case 'speed': speed = m.v; restart(); break;
    case 'inspect': inspectId = m.id; emit(); break;
    case 'chronicle': if (s) post({ t: 'chronicle', data: chronicle(s) }); break;
    case 'save': save(); break;
    case 'gore': if (s) applyCommand(s, { t: 'gore', on: m.on }); break;
    case 'advance': if (s) { for (let i = 0; i < m.ticks && s.phase !== 'dead'; i++) step(s); emit(); } break;
    case 'debug':
      if (!s) break;
      if (m.cmd.what === 'grow') growCity(s, m.cmd.n ?? 60);
      else applyCommand(s, { t: 'debug', what: m.cmd.what, id: m.cmd.id, n: m.cmd.n });
      emit();
      break;
  }
};
