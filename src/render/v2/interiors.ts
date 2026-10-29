/** Each chamber is a different place, drawn in pixels. No floating labels, no parchment plaques.
 *  A room is not a stamp. It is dug, framed, furnished, then lived in.
 *  Stages follow the public city-builder read (foundation, scaffold, shell, furnish, upgrade)
 *  as an original burrow, not a port of any commercial source.
 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Chamber } from '../../sim/v2/contract';
import { PX } from './units';

const PAL: Record<string, string> = {
  k: '#1a1410', s: '#5a534c', S: '#8a8278', w: '#d8d0c4', y: '#f2b46a', Y: '#fff2c0',
  r: '#8a4030', R: '#c46665', b: '#3a3532', B: '#e8dcc8', g: '#4a5a32', G: '#6a8a48',
  t: '#6a5040', T: '#a07850', c: '#3a8a90', C: '#45eaf0', m: '#2a2428', p: '#c4a060',
  o: '#e84b5a', a: '#c48a40', d: '#2a241c', f: '#e8c9a0',
};

/** one character = one pixel. '.' is empty. */
const ART: Record<string, string[]> = {
  shrine: [
    '....ww....ww....',
    '....wy....wy....',
    '....ss....ss....',
    '..SSSSSSSSSSSS..',
    '..SSBBBBBBBBSS..',
    '..SSSSSSSSSSSS..',
    '.kkkkkkkkkkkkkkk',
    '.kkkkkkkkkkkkkkk',
  ],
  nursery: [
    '..pppppppppppp..',
    '.ppffffffffffpp.',
    'ppffBBBffBBBffpp',
    'ppffffffffffffpp',
    '.ppffffffffffpp.',
    '..pppppppppppp..',
    '....tt....tt....',
  ],
  granary: [
    '..aaaa....aaaa..',
    '.aTTTTa..aTTTTa.',
    '.aTTTTa..aTTTTa.',
    '..aaaa....aaaa..',
    '....aaaaaaaa....',
    '...aTTTTTTTTa...',
    '...aTTTTTTTTa...',
    '....aaaaaaaa....',
  ],
  throne: [
    '....rrrrrrrr....',
    '....rYYYYr......',
    '....rYYYYr......',
    '....rrrrrr......',
    '..SSSSSSSSSS....',
    '.SSSSSSSSSSSS...',
    'kkkkkkkkkkkkkkkk',
  ],
  latrine: [
    'gggggggggggggggg',
    'gddddddddddddddg',
    'gddkkkkkkkkkkddg',
    'gddkddddddddkddg',
    'gddddddddddddddg',
    'gggggggggggggggg',
  ],
  workshop: [
    '......cc........',
    '.....cCCc.......',
    'tttttttttttttttt',
    'tTTTTTTTTTTTTTTt',
    'tttttttttttttttt',
    'kk....kk....kk..',
  ],
  jail: [
    's.s.s.s.s.s.s.s.',
    's.s.s.s.s.s.s.s.',
    's.s.s.s.s.s.s.s.',
    's.s.s.s.s.s.s.s.',
    's.s.s.s.s.s.s.s.',
    'SSSSSSSSSSSSSSSS',
  ],
  market: [
    'oRoRoRoRoRoRoRoR',
    '.oRoRoRoRoRoRoR.',
    'k......k.......k',
    'k.TTTTTTTTTTTT.k',
    'k.TTTTTTTTTTTT.k',
    'kk............kk',
  ],
  midden: [
    '...ggg..gg......',
    '..gBBBgttggg....',
    '.ggtttgggtttgg..',
    'gggtttgttttgggg.',
    '.ggggggggggggg..',
  ],
  nest: [
    '..tttttttttttt..',
    '.ttpppppppppptt.',
    'ttppffffffffpptt',
    'ttppffffffffpptt',
    '.ttpppppppppptt.',
    '..tttttttttttt..',
  ],
  infirmary: [
    'wwwwwwwwwwwwwwww',
    'wGGGGGGGGGGGGGGw',
    'wwwwwwwwwwwwwwww',
    'kk..........kk..',
    'kk..........kk..',
  ],
  barracks: [
    '....s......s....',
    '....s......s....',
    '...ys......sy...',
    'SSSSSSSSSSSSSSSS',
    'tttttttttttttttt',
    'k..k......k..k..',
  ],
  plaza: [
    '...ssssssss.....',
    '..s........s....',
    '.s...dddd...s...',
    '.s..dddddd..s...',
    '.s...dddd...s...',
    '..s........s....',
    '...ssssssss.....',
  ],
  slum: [
    't.............t.',
    '.t...........t..',
    '..ttttttttttt...',
    '..tRRRRRRRRRt...',
    '..ttttttttttt...',
    'k............k..',
  ],
  temple: [
    '......YY........',
    '.....ywwy.......',
    '.....wwww.......',
    '....wwBBww......',
    '....wwBBww......',
    '...SSSSSSSS.....',
    '..SSSSSSSSSS....',
    '.kkkkkkkkkkkk...',
  ],
  lab: [
    '......CC........',
    '.....cGGc.......',
    'SSSSSSSSSSSSSSSS',
    's..............s',
    's..............s',
    'kk............kk',
  ],
  home: [
    '....ssssss......',
    '...sYYYYYs......',
    '...sYyyYYs......',
    '...sssssss......',
    'tttttttttttttttt',
    'k..k......k..k..',
  ],
  archive: [
    'SSSSSSSSSSSSSSSS',
    'SkkSkkSkkSkkSkkS',
    'SSSSSSSSSSSSSSSS',
    'SkkSkkSkkSkkSkkS',
    'SSSSSSSSSSSSSSSS',
    'kk............kk',
  ],
  council: [
    '................',
    '.ssssssssssssss.',
    '.sTTTTTTTTTTTTs.',
    '.ssssssssssssss.',
    'k.k.k.....k.k.k.',
  ],
  gallery: [
    'kk.kk.kk.kk.kk.k',
    'kS.kS.kS.kS.kS.k',
    'k..k..k..k..k..k',
    'SSSSSSSSSSSSSSSS',
  ],
  cache: [
    '..tttttttttt....',
    '.tTTTTTTTTTTT...',
    '.tTaaaaaaaaTT...',
    '.tTTTTTTTTTTT...',
    '..tttttttttt....',
  ],
  bolthole: [
    '...ssssss...',
    '..sdddddds..',
    '..sdddddds..',
    '...ssssss...',
  ],
  stake: ['ss', 'ss', 'ss', 'kk'],
  post: ['.ss.', 'ssss', 'ssss', 'ssss', 'ssss', 'kkkk'],
  beam: ['ssssssssssss', 'kkkkkkkkkkkk'],
  rubble: ['.tt.t.', 'ttBttt', '.tttt.'],
  sprout: ['..g.', '..G.', '..k.'],
  moss: ['.gG.', 'gGGg', '.gG.'],
  shroom: ['.RR.', 'RRRR', '.ss.', '..s.'],
  fern: ['.g.g.', 'gGGGg', '.g.g.', '..k..'],
  root: ['t...t', '.ttt.', '.t.t.', 't...t'],
  lantern: ['.yY.', 'yYYy', '.ss.', '..s.', '..k.'],
  banner: ['rRR.', 'rRR.', 'rR..', 'ss..', 'ss..'],
  candle: ['..Y..', '.ywy.', '..s..', '..s..', '..k..'],
  sack: ['.aaa.', 'aTTTa', 'aTTTa', '.aaa.'],
  bowl: ['.bbbb.', 'bddddb', '.ssss.'],
  spear: ['..y..', '..s..', '..s..', '..s..', '..k..'],
  cot: ['wwwwwwww', 'wGGGGGGw', 'kk....kk'],
};

const FLOOR: Record<string, number> = {
  shrine: 0x4a1818, nursery: 0x5a3a18, granary: 0x4a3814, throne: 0x5a2418, latrine: 0x243018,
  workshop: 0x143038, jail: 0x1c1c28, market: 0x4a2814, midden: 0x2a3018, nest: 0x3a2414,
  infirmary: 0x143024, barracks: 0x3a1818, plaza: 0x3a3424, slum: 0x3a2818, temple: 0x3a141c,
  lab: 0x101828, home: 0x3a2818, archive: 0x2a2418, council: 0x2a261c, gallery: 0x28241c,
  cache: 0x3a2c14, bolthole: 0x1a1612, entrance: 0x241c16,
};
/** How readily the room grows plants once it has a floor. Jail and the workshop stay bare. */
const GREEN: Record<string, number> = {
  shrine: 4, nursery: 8, granary: 2, throne: 2, latrine: 2, workshop: 1, jail: 0, market: 4,
  midden: 5, nest: 6, infirmary: 3, barracks: 1, plaza: 8, slum: 5, temple: 5, lab: 2,
  home: 5, archive: 1, council: 2, gallery: 6, cache: 2, bolthole: 2, entrance: 5,
};
const PLANT = ['sprout', 'moss', 'shroom', 'fern', 'root'];
const PIECES: Record<string, string[]> = {
  shrine: ['shrine', 'candle', 'candle', 'bowl'],
  nursery: ['nursery', 'bowl', 'nest'],
  granary: ['granary', 'sack', 'sack', 'sack'],
  throne: ['throne', 'candle'],
  latrine: ['latrine'],
  workshop: ['workshop', 'spear'],
  jail: ['jail', 'cot'],
  market: ['market', 'sack', 'bowl'],
  midden: ['midden', 'sack'],
  nest: ['nest', 'bowl'],
  infirmary: ['infirmary', 'cot', 'bowl'],
  barracks: ['barracks', 'spear', 'spear'],
  plaza: ['plaza', 'bowl'],
  slum: ['slum', 'sack', 'cot'],
  temple: ['temple', 'candle', 'candle', 'bowl'],
  lab: ['lab', 'bowl'],
  home: ['home', 'bowl', 'cot'],
  archive: ['archive'],
  council: ['council'],
  gallery: ['gallery', 'bowl'],
  cache: ['cache', 'sack'],
  bolthole: ['bolthole'],
};
const texCache = new Map<string, Texture>();
function dress(kind: string): Texture | null {
  const rows = ART[kind]; if (!rows) return null;
  const hit = texCache.get(kind); if (hit) return hit;
  const h = rows.length; const w = rows.reduce((m, r) => Math.max(m, r.length), 1);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); if (!g) return null;
  for (let y = 0; y < h; y++) for (let x = 0; x < rows[y].length; x++) {
    const ch = rows[y][x]; if (ch === '.' || ch === ' ') continue;
    const col = PAL[ch]; if (!col) continue;
    g.fillStyle = col; g.fillRect(x, y, 1, 1);
  }
  const t = Texture.from(c); t.source.scaleMode = 'nearest'; texCache.set(kind, t); return t;
}

/** 0 stakes, 1 posts, 2 shell, 3 furnish, 4 finished. -1 not started. */
function stageOf(p: number): number {
  if (p < 0.08) return -1;
  if (p < 0.22) return 0;
  if (p < 0.45) return 1;
  if (p < 0.72) return 2;
  if (p < 0.999) return 3;
  return 4;
}
function h01(n: number): number {
  n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
  return n / 4294967296;
}

export class Interiors {
  readonly layer = new Container({ label: 'rooms' });
  private sig = '';
  /** Day a finished room was first seen. 0 means it was already standing when the burrow loaded. */
  private born = new Map<number, number>();
  private primed = false;
  private fronds: { s: Sprite; y: number; ph: number }[] = [];

  reset() { this.born.clear(); this.primed = false; this.sig = ''; this.fronds.length = 0; }

  sway(now: number) {
    for (const p of this.fronds) p.s.y = p.y + Math.sin(now / 700 + p.ph) * 1.6;
  }

  /** Years a finished room has been used. Stocked stores count as an upgrade. */
  private lived(c: Chamber, day: number): number {
    if (c.progress < 0.999) return 0;
    const age = Math.max(0, day - (this.born.get(c.id) ?? 0));
    let t = age >= 16 ? 3 : age >= 9 ? 2 : age >= 4 ? 1 : 0;
    if (c.stock >= 12 && (c.kind === 'granary' || c.kind === 'cache' || c.kind === 'market')) t = Math.min(3, t + 1);
    return t;
  }

  sync(chambers: Chamber[], day = 0, fresh = false) {
    if (fresh) this.reset();
    if (!this.primed) {
      for (const c of chambers) if (c.progress >= 0.999) this.born.set(c.id, 0);
      this.primed = true;
    }
    for (const c of chambers) if (c.progress >= 0.999 && !this.born.has(c.id)) this.born.set(c.id, day);
    const sig = chambers.map((c) => `${c.id}:${stageOf(c.progress)}:${this.lived(c, day)}:${c.kind}:${c.flooded > 0.25 ? 1 : 0}:${c.cx | 0}`).join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    this.fronds.length = 0;
    for (const ch of this.layer.removeChildren()) ch.destroy();
    for (const c of chambers) this.draw(c, day);
  }

  private draw(c: Chamber, day: number) {
    const stage = stageOf(c.progress);
    if (stage < 0) return;
    const tier = this.lived(c, day);
    const rw = Math.max(18, c.rx * PX * 0.92);
    const rh = Math.max(10, c.ry * PX * 0.62);
    const ox = c.cx * PX;
    const fy = c.floorY * PX;
    const oy = fy - rh * 0.25;
    const grow = 0.62 + stage * 0.095;
    const g = new Graphics();
    const floorA = [0.28, 0.5, 0.72, 0.88, 0.94][stage];
    g.ellipse(0, 0, rw * grow, rh * grow).fill({ color: FLOOR[c.kind] ?? 0x241c16, alpha: floorA });
    if (c.flooded > 0.25) g.ellipse(0, rh * 0.18, rw * 0.75, rh * 0.28).fill({ color: 0x1a4060, alpha: Math.min(0.55, c.flooded) });
    g.position.set(ox, oy);
    this.layer.addChild(g);

    if (stage <= 2) {
      const nPost = stage === 0 ? 4 : stage === 1 ? 6 : 8;
      const prop = stage === 0 ? 'stake' : 'post';
      for (let i = 0; i < nPost; i++) {
        const ang = h01(c.seed * 13 + i * 17) * Math.PI * 2;
        this.place(prop, ox + Math.cos(ang) * rw * 0.78, oy + Math.sin(ang) * rh * 0.42, stage === 0 ? 14 : 22, false);
      }
      if (stage >= 1) this.place('beam', ox, oy - rh * 0.42, Math.min(rw * 1.05, 110), false);
      if (stage >= 1) this.place('rubble', ox + rw * 0.28, fy - 2, 26, false);
    }

    const pieces = PIECES[c.kind] ?? [c.kind];
    const shown = stage <= 1 ? 0 : stage === 2 ? 1 : stage === 3 ? Math.max(1, Math.ceil(pieces.length * 0.66)) : pieces.length;
    const up = tier >= 3 ? 1.14 : tier >= 2 ? 1.06 : 1;
    for (let i = 0; i < shown; i++) {
      const fit = stage === 2 ? 0.58 : stage === 3 ? 0.84 : 1;
      const wide = (i === 0 ? Math.min(rw * 1.35, 150) : Math.min(rw * 0.42, 48)) * fit * (i === 0 ? up : 1);
      const ang = ((c.seed * 17 + i * 97) % 360) * Math.PI / 180;
      const rad = i === 0 ? 0 : rw * 0.55;
      const x = ox + Math.cos(ang) * rad;
      const y = fy - (i === 0 ? 2 : Math.abs(Math.sin(ang)) * rh * 0.35);
      this.place(pieces[i], x, y, wide, false);
    }
    if (tier >= 2 && stage >= 4) {
      const lamp = c.kind === 'jail' || c.kind === 'latrine' || c.kind === 'midden' ? 'sack' : 'lantern';
      this.place(lamp, ox - rw * 0.38, fy - 4, 22, false);
    }
    if (tier >= 3 && stage >= 4 && (c.kind === 'shrine' || c.kind === 'temple' || c.kind === 'throne' || c.kind === 'barracks' || c.kind === 'market')) {
      this.place('banner', ox + rw * 0.42, fy - rh * 0.55, 20, true);
    }

    let plants = GREEN[c.kind] ?? 1;
    if (stage <= 0) plants = 0;
    else if (stage === 1) plants = plants >= 3 ? 1 : 0;
    else if (stage === 2) plants = Math.min(plants, 2);
    else plants += tier;
    if (c.flooded > 0.4) plants = Math.max(0, plants - 2);
    for (let i = 0; i < plants; i++) {
      const kind = stage < 3 ? 'sprout' : PLANT[(c.seed + i * 3) % PLANT.length];
      const ang = h01(c.seed * 31 + i * 11) * Math.PI * 2;
      const rad = rw * (0.22 + h01(c.seed + i * 5) * 0.62);
      const x = ox + Math.cos(ang) * rad;
      const y = fy - 2 + Math.sin(ang) * rh * 0.22;
      this.place(kind, x, y, 14 + (i % 3) * 3, kind === 'fern' || kind === 'sprout');
    }
  }

  private place(kind: string, x: number, y: number, wide: number, sway: boolean) {
    const tex = dress(kind); if (!tex) return;
    const s = new Sprite(tex);
    s.anchor.set(0.5, 0.92);
    s.scale.set(wide / tex.width);
    s.position.set(x, y);
    this.layer.addChild(s);
    if (sway) this.fronds.push({ s, y, ph: x * 0.013 + kind.length });
  }
}
