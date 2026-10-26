import { createState, step, snapshot, chronicle } from '../src/sim/sim';
const seed = +(process.argv[2]??1), days=+(process.argv[3]??300);
const s = createState(seed);
let line='', crowned=-1;
for(let i=0;i<days*20;i++){ step(s); if(crowned<0 && s.phase!=='founding') crowned=s.tick; if(s.tick%400===0){const sn=snapshot(s); line+=`d${sn.day}:${sn.stats.pop}/${sn.stats.food.toFixed(0)}/L${sn.activeCount} `;} if(!s.rats.length) break;}
const c = chronicle(s);
console.log('seed',seed,'crownedAtTick',crowned, line);
for (const k of c.kings) console.log('  ',k.name,k.start,'-',k.end,k.cause,'|',k.laws.join(','));
console.log(' deaths', JSON.stringify(s.lastDeathCause));
console.log(' insights', c.insights.map(i=>i.name).join(', '));
