import { createState, step, cityGrievance } from '../src/sim/sim';
const seed=+(process.argv[2]??1), from=+(process.argv[3]??0), to=+(process.argv[4]??100);
const s=createState(seed);
for(let i=0;i<to*20;i++){ step(s); if(s.tick%20===15 && s.tick/20>=from){ const h=s.history[s.history.length-1]; if(!h) continue; console.log(`d${h.day} ${s.phase} pop${h.pop} pups${h.pups} in${h.foodIn.toFixed(0)} food${s.food.toFixed(0)} prod${h.prod.toFixed(2)} hp${h.health.toFixed(2)} sat${(s.rats.reduce((a,r)=>a+r.sat,0)/Math.max(1,s.rats.length)).toFixed(2)} g${cityGrievance(s).toFixed(2)} plate${s.king.plateRatio.toFixed(1)} D${h.deaths} B${h.births} laws:${Object.entries(s.laws).map(([k,v])=>k+(v.adopt<1?'~':'')).join(',')} | ${s.mind?.thought??''}`);} if(!s.rats.length)break; }
console.log(JSON.stringify(s.lastDeathCause));
