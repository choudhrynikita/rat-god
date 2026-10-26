// Thin wrapper around the simulation worker.
import type { FromWorker, ToWorker } from '../net/protocol';
export class SimClient {
  w = new Worker(new URL('../sim/worker.ts', import.meta.url), { type: 'module' });
  handlers: ((m: FromWorker) => void)[] = [];
  constructor() { this.w.onmessage = (e: MessageEvent<FromWorker>) => { for (const h of this.handlers) h(e.data); }; this.w.onerror = (e) => console.warn('sim worker error', e.message); }
  send(m: ToWorker) { this.w.postMessage(m); }
  on(h: (m: FromWorker) => void) { this.handlers.push(h); }
}
