import { createState, step, applyCommand, enactNow } from '../src/sim/sim';
import { LAWS } from '../src/sim/laws';
// run without king AI: strip mind each tick
function run(seed:number, law:string|null, days:number){
  const s=createState(seed); applyCommand(s,{t:'debug',what:'skipFounding'});
  while(s.phase==='founding') step(s);
  let applied=false;
  for(let i=0;i<days*20;i++){ s.mind=null; if(!applied && s.tick>=20*8){ if(law) enactNow(s,law); applied=true;} step(s); if(!s.rats.length)break;}
  return s.rats.length;
}
const ids=[null, ...LAWS.filter(l=>l.tier<=1).map(l=>l.id)];
for(const id of ids){ const r=[1,2,3,4,5,6].map(sd=>run(sd,id,45)); console.log((id??'CONTROL').padEnd(18), r.join(' '), 'avg', (r.reduce((a,b)=>a+b,0)/r.length).toFixed(0)); }
