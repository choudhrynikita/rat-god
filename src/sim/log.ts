import type { SimState } from './types';
export function log(s: SimState, kind: string, text: string) {
  s.events.push({ day: Math.floor(s.tick / s_TPD), tick: s.tick, kind, text });
  s.eventSeq++;
  if (s.events.length > 60) s.events.splice(0, s.events.length - 60);
}
const s_TPD = 20;
