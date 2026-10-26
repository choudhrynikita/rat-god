import { createState, step, applyCommand } from '../src/sim/sim';
const s = createState(99);
applyCommand(s,{t:'debug',what:'skipFounding'});
for(let i=0;i<3000;i++){ step(s); if(s.tick%20===1 && s.tick>2500){const h=s.history[s.history.length-1]; const c:any={}; for(const r of s.rats) c[r.caste]=(c[r.caste]??0)+1; const avgSat=s.rats.reduce((a,r)=>a+r.sat,0)/s.rats.length; console.log(h.day,s.phase,'pop',h.pop,'ad',h.adults,'pups',h.pups,'in',h.foodIn.toFixed(0),'food',h.food.toFixed(0),'prod',h.prod.toFixed(2),'sat',avgSat.toFixed(2),'hp',h.health.toFixed(2),JSON.stringify(c), 'K', s.rooms[0].level, 'pow', s.power.toFixed(2))} }
