/** Room props. The sim stores the chamber; this dresses it from the prop kit so a nest is not a black hole. */
import { Container, Sprite } from 'pixi.js';
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
