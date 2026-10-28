/** Room props. The sim stores the chamber; this dresses it from the prop kit so a nest is not a black hole. */
import { Container, Sprite, Texture } from 'pixi.js';
import type { Chamber } from '../../sim/v2/contract';
import { clip } from './sprites';
import { PX } from './units';

const KIT: Record<string, string[]> = {
  nest: ['prop_pebble_bowl', 'prop_pebble_bowl', 'prop_food_crumb'],
  nursery: ['prop_pebble_bowl', 'prop_pebble', 'prop_food_crumb'],
  cache: ['prop_cheese_rind', 'prop_food_crumb', 'prop_rotten_fruit', 'prop_pebble_bowl'],
  granary: ['prop_cheese_rind', 'prop_pebble_bowl', 'prop_food_crumb', 'prop_cheese_rind'],
  throne: ['prop_law_tablet', 'prop_pebble_bowl'],
  midden: ['prop_rotten_fruit', 'prop_bone', 'prop_poster_scrap'],
  workshop: ['prop_wire_coil', 'prop_battery', 'prop_bottle_cap_pile'],
  lab: ['prop_syringe', 'prop_battery', 'prop_wire_coil'],
  market: ['prop_bottle_cap_pile', 'prop_cheese_rind', 'prop_pebble'],
  shrine: ['prop_bone', 'prop_pebble_bowl'],
  temple: ['prop_law_tablet', 'prop_bone', 'prop_pebble_bowl'],
  barracks: ['prop_bone', 'prop_pebble'],
  plaza: ['prop_law_poster_fresh', 'prop_pebble'],
  jail: ['prop_bone', 'prop_wire_coil', 'prop_bone'],
  infirmary: ['prop_syringe', 'prop_pebble_bowl'],
  home: ['prop_pebble_bowl', 'prop_cheese_rind', 'prop_pebble'],
  archive: ['prop_law_tablet', 'prop_pebble'],
  council: ['prop_law_tablet', 'prop_pebble_bowl'],
  slum: ['prop_poster_scrap', 'prop_rotten_fruit', 'prop_pebble'],
  gallery: ['prop_pebble', 'prop_bone'],
  latrine: ['prop_pebble'],
};

const SHORT: Record<string, string> = {
  nest: 'NEST', nursery: 'NURSERY', cache: 'CACHE', granary: 'GRANARY', throne: 'THRONE',
  midden: 'MIDDEN', workshop: 'WORKS', lab: 'LAB', market: 'MARKET', shrine: 'SHRINE',
  temple: 'TEMPLE', barracks: 'BARRACKS', plaza: 'PLAZA', jail: 'JAIL', infirmary: 'SICK',
  home: 'HOME', archive: 'ARCHIVE', council: 'COUNCIL', slum: 'SLUM', gallery: 'GALLERY',
  latrine: 'LATRINE', bolthole: 'BOLT',
};
const WASH: Record<string, number> = {
  nest: 0x6a4030, nursery: 0xc48a62, cache: 0x8a6a30, granary: 0xc4a050, throne: 0xf2b46a,
  midden: 0x5a6840, workshop: 0x3a8a90, lab: 0x45eaf0, market: 0xd5a063, shrine: 0xf6c992,
  temple: 0xf6c992, barracks: 0xc46665, plaza: 0x8a7a68, jail: 0x6070a0, infirmary: 0x9be070,
  home: 0xa07050, archive: 0x907060, council: 0xc4a060, slum: 0x6a5040, gallery: 0x7a7068, latrine: 0x6a8a62,
};
const GLYPH: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101011', K: '101101110101101', L: '100100100100111',
  M: '101111101101101', N: '101111111101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101111001', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101011', V: '101101101101010', W: '101101101111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
};
const labels = new Map<string, Texture>();
function labelTex(word: string): Texture | null {
  const hit = labels.get(word); if (hit) return hit;
  const gw = 3, gh = 5, gap = 1;
  const c = document.createElement('canvas');
  c.width = Math.max(1, word.length * (gw + gap) - gap); c.height = gh;
  const x = c.getContext('2d'); if (!x) return null;
  x.fillStyle = '#f6c992';
  for (let i = 0; i < word.length; i++) {
    const g = GLYPH[word[i]]; if (!g) continue;
    for (let p = 0; p < g.length; p++) if (g[p] === '1') x.fillRect(i * (gw + gap) + (p % gw), (p / gw) | 0, 1, 1);
  }
  const t = Texture.from(c); t.source.scaleMode = 'nearest'; labels.set(word, t); return t;
}

export class Interiors {
  readonly layer = new Container({ label: 'rooms' });
  private sig = '';
  sync(chambers: Chamber[]) {
    if (!clip('prop_pebble_bowl') && !clip('prop_cheese_rind')) return;
    const sig = chambers.map((c) => `${c.id}:${(c.progress * 5) | 0}:${c.stock | 0}:${c.cx | 0}`).join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    for (const ch of this.layer.removeChildren()) ch.destroy();
    for (const c of chambers) {
      if (c.progress < 0.45) continue;
      const washCol = WASH[c.kind];
      if (washCol != null) {
        const wash = new Sprite(Texture.WHITE);
        wash.anchor.set(0.5, 0.65); wash.tint = washCol; wash.alpha = 0.34;
        wash.width = Math.max(18, c.rx * 1.35 * PX); wash.height = Math.max(10, c.ry * 0.85 * PX);
        wash.position.set(c.cx * PX, c.floorY * PX);
        this.layer.addChild(wash);
      }
      const word = SHORT[c.kind];
      const tex = word ? labelTex(word) : null;
      if (tex) {
        const lab = new Sprite(tex); lab.anchor.set(0.5, 1); lab.scale.set(2);
        lab.position.set(c.cx * PX, (c.floorY - 0.35) * PX);
        this.layer.addChild(lab);
      }
      const kit = KIT[c.kind]; if (!kit?.length) continue;
      const piles = c.kind === 'granary' || c.kind === 'cache' ? Math.min(kit.length, 2 + Math.min(3, Math.floor(c.stock / 4))) : Math.min(kit.length, 2 + (c.seed % 2));
      for (let i = 0; i < piles; i++) {
        const cl = clip(kit[(c.seed + i) % kit.length]); if (!cl) continue;
        const s = new Sprite(cl.frames[0]);
        s.anchor.set(cl.ax, cl.ay);
        const t = (i + 1) / (piles + 1);
        s.position.set((c.cx - c.rx * 0.72 + t * c.rx * 1.44) * PX, c.floorY * PX);
        s.scale.set(c.kind === 'throne' && i === 0 ? 0.85 : 0.55);
        this.layer.addChild(s);
      }
    }
  }
}
