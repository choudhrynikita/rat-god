/** Each chamber is a different place, drawn in pixels. No floating labels, no parchment plaques. */
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

export class Interiors {
  readonly layer = new Container({ label: 'rooms' });
  private sig = '';
  sync(chambers: Chamber[]) {
    const sig = chambers.map((c) => `${c.id}:${c.progress > 0.55 ? 1 : 0}:${c.cx | 0}`).join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    for (const ch of this.layer.removeChildren()) ch.destroy();
    for (const c of chambers) {
      if (c.progress < 0.55) continue;
      const rw = Math.max(18, c.rx * PX * 0.92);
      const rh = Math.max(10, c.ry * PX * 0.62);
      const g = new Graphics();
      g.ellipse(0, 0, rw, rh).fill({ color: FLOOR[c.kind] ?? 0x241c16, alpha: 0.92 });
      g.position.set(c.cx * PX, c.floorY * PX - rh * 0.25);
      this.layer.addChild(g);
      const pieces = PIECES[c.kind] ?? [c.kind];
      pieces.forEach((kind, i) => {
        const tex = dress(kind); if (!tex) return;
        const s = new Sprite(tex);
        s.anchor.set(0.5, 0.9);
        const wide = i === 0 ? Math.min(rw * 1.35, 150) : Math.min(rw * 0.42, 48);
        s.scale.set(wide / tex.width);
        const ang = ((c.seed * 17 + i * 97) % 360) * Math.PI / 180;
        const rad = i === 0 ? 0 : rw * 0.55;
        s.position.set(c.cx * PX + Math.cos(ang) * rad, c.floorY * PX - (i === 0 ? 2 : Math.abs(Math.sin(ang)) * rh * 0.35));
        this.layer.addChild(s);
      });
    }
  }
}
