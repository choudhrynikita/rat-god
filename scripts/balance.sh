#!/bin/bash
# runs 200 seeds across 8 processes, aggregates
cd "$(dirname "$0")/.."
N=${1:-200}; D=${2:-150}; OUT=${3:-reports/balance.jsonl}
: > $OUT.tmp
per=$(( (N + 7) / 8 ))
for i in 0 1 2 3 4 5 6 7; do a=$((i*per+1)); b=$(((i+1)*per)); [ $b -gt $N ] && b=$N; [ $a -le $N ] && npx tsx scripts/balance.ts $a $b $D >> $OUT.tmp.$i & done
wait
cat $OUT.tmp.* > $OUT; rm -f $OUT.tmp*
python3 - "$OUT" "$D" <<'PY'
import json,sys,collections
rows=[json.loads(l) for l in open(sys.argv[1])]
D=int(sys.argv[2])
col=[r for r in rows if 0<=r['died']<D]
print(f"seeds {len(rows)}  collapsed before day {D}: {len(col)} ({100*len(col)/len(rows):.1f}%)")
print(" collapse days:", sorted(r['died'] for r in col))
alive=[r for r in rows if r['died']<0]
if alive: print(f" survivors: median pop {sorted(r['pop'] for r in alive)[len(alive)//2]}, mean kings {sum(r['kings'] for r in alive)/len(alive):.2f}, mean executions {sum(r['exec'] for r in alive)/len(alive):.2f}, mean presses {sum(r['presses'] for r in alive)/len(alive):.1f}")
c=collections.Counter()
for r in rows:
  for k,v in (r['causes'] or {}).items(): c[k]+=v
print(" deaths by cause (all seeds):", c.most_common(10))
print(" mean peak:", sum(r['peak'] for r in rows)/len(rows))
PY
