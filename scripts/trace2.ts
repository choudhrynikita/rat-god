import { createState, step } from '../src/sim/sim';
import { isAdult } from '../src/sim/sim';
const seed = +(process.argv[2] ?? 5), days = +(process.argv[3] ?? 100);
const s = createState(seed);
for (let t = 0; t < days * 20; t++) {
  step(s);
  if (s.tick % 40 === 0 && s.phase !== 'founding') {
    const h = s.history[s.history.length - 1] as any;
    const ad = s.rats.filter((r) => isAdult(r));
    const c: Record<string, number> = {}; for (const r of ad) c[r.caste] = (c[r.caste] ?? 0) + 1;
    const sat = ad.reduce((a, r) => a + r.sat, 0) / Math.max(1, ad.length);
    const hp = ad.reduce((a, r) => a + r.health, 0) / Math.max(1, ad.length);
    console.log(`d${Math.floor(s.tick / 20)} ${s.phase} pop ${s.rats.length} ad ${ad.length} food ${s.food.toFixed(0)} in ${h?.foodIn?.toFixed(1)} sat ${sat.toFixed(2)} hp ${hp.toFixed(2)} sick ${s.rats.filter(r=>r.inf>0).length} laws ${Object.keys(s.laws).join(',')} ${JSON.stringify(c)}`);
  }
  if (!s.rats.length) break;
}
