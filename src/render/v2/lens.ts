// Lenses: a data overlay on the rats. Colour from a colour-blind-safe ramp (cividis-like) AND a shape code
// (▼ low · ■ middle · ● high) so no meaning is carried by colour alone. The world desaturates while a lens is on.
import { Graphics } from 'pixi.js';
import { RF, type Snapshot2 } from '../../sim/v2/contract';
import type { Actors } from './actors';
import { PX } from './units';

export type LensId = 'needs' | 'mood' | 'faith' | 'caste' | 'wealth' | 'disease' | 'giants';
export const LENSES: { id: LensId; label: string; legend: string }[] = [
  { id: 'needs', label: 'NEEDS', legend: '▼ desperate · ■ wanting · ● content' },
  { id: 'mood', label: 'MOOD', legend: '▼ miserable · ■ getting by · ● happy' },
  { id: 'faith', label: 'FAITH', legend: '▼ no faith · ■ believer · ● devout' },
  { id: 'caste', label: 'CASTE', legend: '● highest caste · ■ middle · ▼ lowest · grey = none yet' },
  { id: 'wealth', label: 'WEALTH', legend: '▼ poor or cast out · ■ middling · ● rich' },
  { id: 'disease', label: 'DISEASE', legend: '▼ healthy · ■ hurt · ● sick' },
  { id: 'giants', label: 'GIANTS', legend: '▼ hidden · ■ could be noticed · ● exposed to the Giants' },
];
// cividis anchors (dark blue → grey → yellow), readable for all common colour-vision types
const RAMP = [[0x00, 0x22, 0x4e], [0x57, 0x5c, 0x6d], [0x8a, 0x87, 0x79], [0xc3, 0xb3, 0x69], [0xfd, 0xea, 0x45]];
export function ramp(v: number) { v = Math.max(0, Math.min(1, v)) * (RAMP.length - 1); const i = Math.min(RAMP.length - 2, Math.floor(v)), f = v - i; const a = RAMP[i], b = RAMP[i + 1];
  return (Math.round(a[0] + (b[0] - a[0]) * f) << 16) | (Math.round(a[1] + (b[1] - a[1]) * f) << 8) | Math.round(a[2] + (b[2] - a[2]) * f); }

export class Lenses {
  readonly layer = new Graphics(); mode: LensId | null = null;
  value(s: Snapshot2, i: number, surfY: (x: number) => number): number {
    const R = s.rats, fl = R.flags[i];
    switch (this.mode) {
      case 'needs': return fl & RF.starving ? 0 : fl & (RF.sick | RF.injured) ? 0.3 : R.mood[i] < -40 ? 0.45 : 0.6 + Math.max(0, R.mood[i]) / 250;
      case 'mood': return (R.mood[i] + 100) / 200;
      case 'faith': return fl & (RF.prophet | RF.priest | RF.zealot) ? 1 : fl & RF.believer || R.religion[i] ? 0.6 : 0.1;
      case 'wealth': { const w = (R as unknown as { wealth?: Uint8Array }).wealth; if (w) return w[i] / 255;
        if (fl & RF.king) return 1; if (fl & (RF.boss | RF.leader | RF.founder)) return 0.85; if (fl & (RF.outcast | RF.criminal | RF.jailed)) return 0.05;
        const c = R.caste?.[i]; const cs = s.castes?.find((x) => x.id === c); if (cs) return 1 - cs.rank / Math.max(1, (s.castes?.length ?? 1) - 1) * 0.9; return 0.45; }
      case 'disease': return fl & RF.sick ? 1 : fl & RF.injured ? 0.5 : 0;
      case 'giants': { const x = R.x[i], y = R.y[i]; const depth = Math.max(0, y - surfY(x)); let v = (0.25 + 0.75 * s.env.streetActivity) * Math.exp(-depth / 25);
        for (const h of s.hazards) { const d = Math.hypot(h.x - x, h.y - y); if (d < 60) v = Math.max(v, 1 - d / 60); } return v; }
    }
    return 0;
  }
  update(actors: Actors, s: Snapshot2 | null, zd: number, surfY: (x: number) => number) {
    const g = this.layer; g.clear(); if (!this.mode || !s) return;
    const r = Math.max(3, 7 / Math.max(0.2, zd)); const R = s.rats;
    for (let i = 0; i < R.n; i++) {
      const p = actors.posOf(R.id[i]); if (!p) continue;
      const x = p.x, y = p.y - 18 / Math.max(0.6, zd) - r;
      if (this.mode === 'caste') {
        const id = R.caste?.[i] ?? 0; const cs = id ? s.castes?.find((c) => c.id === id) : undefined;
        const nC = Math.max(1, (s.castes?.length ?? 1) - 1);
        const t = cs ? cs.rank / nC : 0.5;
        const col = cs ? cs.color : 0x575c6d;
        if (!cs || t > 0.66) g.poly([x - r, y - r * 0.8, x + r, y - r * 0.8, x, y + r]);
        else if (t > 0.33) g.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6);
        else g.circle(x, y, r);
        g.fill({ color: col }).stroke({ width: Math.max(1, r * 0.3), color: 0x000000 });
        continue;
      }
      const v = this.value(s, i, surfY); const col = ramp(v);
      if (v < 0.34) g.poly([x - r, y - r * 0.8, x + r, y - r * 0.8, x, y + r]); else if (v < 0.67) g.rect(x - r * 0.8, y - r * 0.8, r * 1.6, r * 1.6); else g.circle(x, y, r);
      g.fill({ color: col }).stroke({ width: Math.max(1, r * 0.3), color: 0x000000 });
    }
  }
  static surfFn(surfaceY: Int16Array | undefined) { return (x: number) => surfaceY ? surfaceY[Math.max(0, Math.min(surfaceY.length - 1, Math.floor(x)))] : 0; }
  get px() { return PX; }
}
