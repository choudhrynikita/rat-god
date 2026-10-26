import { createState, step, growCity } from '../src/sim/sim';
import { R, TPD } from '../src/sim/types';
const s = createState(7); growCity(s, 50); s.mind = null;
s.laws={}; s.rooms[R.entrance].level = 0; s.food = 0;
for (const r of s.rats) { r.sat = 0.05; r.satSlow = 0.05; r.anger = 0.8; r.loyalty = 0.1; }
for (let i = 0; i < 25 * TPD; i++) { s.mind = null; const n=s.rats.length; step(s); if (s.phase==='gathering'||n-s.rats.length>3) console.log(s.tick, s.phase, s.rats.length, JSON.stringify(s.lastDeathCause), s.rats.slice(0,3).map(r=>r.health.toFixed(2)+'/'+r.sat.toFixed(2)).join(' ')); if(!s.rats.length)break; }
console.log(s.events.slice(-8).map(e=>e.text).join('\n'));
