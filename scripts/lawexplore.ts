import { runAB, M } from '../tests/lawab';
import { LAWS } from '../src/sim/laws';
const seeds=[11,12,13];
const law = process.argv[2];
const ids = law ? [law] : LAWS.map(l=>l.id);
const ms = Object.keys(M);
for (const id of ids) {
  const out:string[]=[];
  for (const k of ms) {
    let dl=0, base=0;
    for (const sd of seeds){ const a=runAB(sd,null,M[k],2,10), b=runAB(sd,id,M[k],2,10); dl+=b-a; base+=Math.abs(a);}
    const rel = dl/Math.max(1e-6, base);
    if (Math.abs(rel)>0.08) out.push(`${k}${rel>0?'+':''}${(rel*100).toFixed(0)}%`);
  }
  console.log(id.padEnd(18), out.join(' '));
}
