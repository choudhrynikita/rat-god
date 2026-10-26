// Balance harness: N seeded runs to day D. "Collapse" = the city dies (population 0) before day D.
// usage: tsx scripts/balance.ts <fromSeed> <toSeed> <days>  → prints one JSON line per seed
import { createState, step, chronicle, BAL } from '../src/sim/sim';
const E = process.env; if (E.RG_LEAN) BAL.leanBoost = +E.RG_LEAN; if (E.RG_LEANPOP) BAL.leanPop = +E.RG_LEANPOP; if (E.RG_HAULK) BAL.haulK = +E.RG_HAULK;
const a = +(process.argv[2] ?? 1), b = +(process.argv[3] ?? 200), days = +(process.argv[4] ?? 150);
for (let seed = a; seed <= b; seed++) {
  const s = createState(seed);
  let died = -1, minPop = 1e9, peak = 0, crowned = -1;
  for (let t = 0; t < days * 20; t++) {
    step(s);
    if (crowned < 0 && s.phase !== 'founding') crowned = Math.floor(s.tick / 20);
    const p = s.rats.length; if (s.phase !== 'founding') minPop = Math.min(minPop, p); peak = Math.max(peak, p);
    if (!p || s.phase === 'dead') { died = Math.floor(s.tick / 20); break; }
  }
  const c = chronicle(s);
  const causes = s.lastDeathCause ?? {};
  console.log(JSON.stringify({ seed, died, pop: s.rats.length, peak, crowned, kings: c.kings.length, exec: c.executions, presses: c.lawsPressed, laws: Object.keys(s.laws), causes }));
}
