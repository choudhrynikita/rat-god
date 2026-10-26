import { createState, step, applyCommand, snapshot } from '../src/sim/sim';
const s = createState(99);
applyCommand(s,{t:'debug',what:'skipFounding'});
for(let i=0;i<2000;i++){ step(s); if(i%100===0){const sn=snapshot(s); console.log(sn.day, s.phase, sn.stats.pop, sn.stats.pups, sn.stats.food.toFixed(1), 'cap',sn.stats.foodCap, 'scrap',s.scrap.toFixed(1),'mood',sn.stats.mood.toFixed(2),'ang',sn.stats.anger.toFixed(2),'griev',sn.stats.grievance.toFixed(2),'plate',s.king.plate,s.king.luxury, 'rooms',s.rooms.map(r=>r.level).join(''), 'dig',s.digTarget, 'pow',s.power.toFixed(2))} }
console.log(s.reigns.map(r=>[r.name,r.start,r.end,r.cause].join('|')).join('\n'));
console.log(s.lastDeathCause);
