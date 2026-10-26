// Main thread ⇄ sim worker messages. The player layer only ever sends view/time/meta messages:
// god watches, god never touches the city (debug commands exist only behind ?debug=1 for tests).
import type { Snapshot, RatInfo, chronicle } from '../sim/sim';

export type Speed = 0 | 1 | 2 | 4;
export type Chronicle = ReturnType<typeof chronicle>;
export type DebugCmd = { what: 'gather' | 'killKing' | 'grow' | 'skipFounding' | 'press' | 'starveKing'; id?: string; n?: number };

export type ToWorker =
  | { t: 'new'; seed: number }
  | { t: 'load'; state: string }
  | { t: 'speed'; v: Speed }
  | { t: 'inspect'; id: number | null }
  | { t: 'chronicle' }
  | { t: 'save' }
  | { t: 'gore'; on: boolean }
  | { t: 'advance'; ticks: number } // debug fast-forward
  | { t: 'debug'; cmd: DebugCmd };

export type FromWorker =
  | { t: 'snap'; snap: Snapshot; inspect: RatInfo | null; speed: Speed; tickMs: number }
  | { t: 'chronicle'; data: Chronicle }
  | { t: 'saved'; state: string; day: number; seed: number }
  | { t: 'error'; msg: string };
