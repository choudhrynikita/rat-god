/** A room is one of the painted backgrounds, masked into the hole that was dug.
 *  No generated stamps, no coloured ovals standing in for a place.
 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Chamber } from '../../sim/v2/contract';
import { PX } from './units';
import { clip } from './sprites';

/** The painting for each kind of room. Only ids that exist as finished art. */
const ROOM: Record<string, string> = {
  nest: 'bg_nursery', home: 'bg_nursery', nursery: 'bg_nursery', infirmary: 'bg_nursery',
  throne: 'bg_throne_hall', council: 'bg_throne_hall',
  shrine: 'bg_shrine', temple: 'bg_shrine', archive: 'bg_shrine',
  granary: 'bg_granary', market: 'bg_granary', cache: 'bg_granary',
  workshop: 'bg_workshop', lab: 'bg_workshop',
  barracks: 'bg_barracks', jail: 'bg_barracks',
  plaza: 'bg_plaza', gallery: 'bg_plaza',
  entrance: 'bg_burrow_entrance', bolthole: 'bg_burrow_entrance',
  slum: 'bg_outcast_slum', midden: 'bg_outcast_slum', latrine: 'bg_outcast_slum',
};

/** Small real objects on the floor. Nothing here is drawn from a character grid. */
const DRESS: Record<string, string[]> = {
  nest: ['prop_pebble_bowl'],
  home: ['prop_pebble_bowl'],
  nursery: ['prop_pebble_bowl', 'prop_cheese_rind'],
  throne: ['prop_law_tablet'],
  shrine: ['prop_pebble_bowl'],
  temple: ['prop_pebble_bowl'],
  granary: ['prop_cheese_rind', 'prop_pebble_bowl'],
  cache: ['prop_cheese_rind'],
  market: ['prop_cheese_rind', 'prop_bottle_cap_pile'],
  workshop: ['prop_wire_coil', 'prop_bone'],
  lab: ['prop_battery', 'prop_wire_coil'],
  barracks: ['prop_bone'],
  slum: ['prop_rotten_fruit', 'prop_poster_scrap'],
  midden: ['prop_rotten_fruit', 'prop_bone'],
  infirmary: ['prop_pebble_bowl'],
};

const ERA: [string, string, string][] = [
  ['pottery', 'granary', 'prop_pebble_bowl'],
  ['writing', 'archive', 'prop_law_tablet'],
  ['metalwork', 'workshop', 'prop_bone'],
  ['weapons', 'barracks', 'prop_bone'],
  ['sparks', 'lab', 'prop_battery'],
  ['rodentoids', 'lab', 'prop_wire_coil'],
];

/** 0 stakes, 1 posts, 2 shell, 3 furnish, 4 finished. -1 not started. */
function stageOf(p: number): number {
  if (p < 0.08) return -1;
  if (p < 0.22) return 0;
  if (p < 0.45) return 1;
  if (p < 0.72) return 2;
  if (p < 0.999) return 3;
  return 4;
}
function boxOf(c: Chamber) {
  const rw = Math.max(18, c.rx * PX * 0.92);
  const rh = Math.max(10, c.ry * PX * 0.62);
  return { rw, rh, ox: c.cx * PX, fy: c.floorY * PX };
}

function painting(tex: Texture, ox: number, fy: number, rw: number, rh: number, alpha: number) {
  const hold = new Container();
  hold.position.set(ox, fy);
  const s = new Sprite(tex);
  s.anchor.set(0.5, 0.78);
  const wide = Math.max(rw * 1.75, 80);
  const sc = Math.min(wide / tex.width, (rh * 1.85) / tex.height);
  s.scale.set(sc);
  s.alpha = alpha;
  const mask = new Graphics();
  mask.ellipse(0, -rh * 0.22, rw * 1.05, rh * 0.98).fill(0xffffff);
  hold.addChild(s, mask);
  s.mask = mask;
  return hold;
}

function propAt(id: string, x: number, y: number, px: number): Sprite | null {
  const c = clip(id); if (!c) return null;
  const s = new Sprite(c.frames[0]);
  s.anchor.set(c.ax, c.ay || 1);
  s.scale.set(px / Math.max(1, c.w));
  s.position.set(x, y);
  return s;
}

export interface CivicLook {
  laws: number;
  reaching: boolean;
  known: Set<string>;
  gathering: { kind: string; chamber: number } | null;
  hearths: { chamber: number; state: string; color: number }[];
}

export class Interiors {
  readonly layer = new Container({ label: 'rooms' });
  readonly life = new Container({ label: 'civic' });
  private sig = '';
  private lifeSig = '';
  private look: CivicLook | null = null;
  private chambers: Chamber[] = [];

  reset() {
    this.sig = ''; this.lifeSig = ''; this.look = null; this.chambers = [];
    for (const ch of this.life.removeChildren()) ch.destroy({ children: true });
  }

  sway(_now: number) { /* paintings do not sway */ }

  sync(chambers: Chamber[], _day = 0, fresh = false) {
    if (fresh) this.reset();
    this.chambers = chambers;
    const sig = chambers.map((c) => `${c.id}:${stageOf(c.progress)}:${c.kind}:${c.flooded > 0.25 ? 1 : 0}:${c.cx | 0}`).join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    this.lifeSig = '';
    for (const ch of this.layer.removeChildren()) ch.destroy({ children: true });
    for (const c of chambers) this.draw(c);
    if (this.look) this.paintCivic();
  }

  civic(look: CivicLook) { this.look = look; this.paintCivic(); }

  private draw(c: Chamber) {
    const stage = stageOf(c.progress);
    if (stage < 2) return;
    const { rw, rh, ox, fy } = boxOf(c);
    const id = ROOM[c.kind];
    const art = id ? clip(id) : undefined;
    if (art) this.layer.addChild(painting(art.frames[0], ox, fy, rw, rh, stage === 2 ? 0.78 : 1));
    if (c.flooded > 0.25) {
      const g = new Graphics();
      g.ellipse(0, -rh * 0.08, rw * 0.72, rh * 0.3).fill({ color: 0x1a4060, alpha: Math.min(0.5, c.flooded) });
      g.position.set(ox, fy);
      this.layer.addChild(g);
    }
    const props = DRESS[c.kind] ?? [];
    props.forEach((p, i) => {
      const s = propAt(p, ox + (i - (props.length - 1) / 2) * 16, fy - 1, 18);
      if (s) this.layer.addChild(s);
    });
  }

  private paintCivic() {
    const look = this.look; if (!look) return;
    const chambers = this.chambers;
    const sig = [
      look.laws, look.reaching ? 1 : 0,
      [...look.known].sort().join(','),
      look.gathering ? `${look.gathering.kind}@${look.gathering.chamber}` : '',
      look.hearths.map((h) => `${h.chamber}:${h.state}`).join(','),
      chambers.map((c) => `${c.id}:${c.cx | 0}:${stageOf(c.progress)}`).join('|'),
    ].join('#');
    if (sig === this.lifeSig) return;
    this.lifeSig = sig;
    for (const ch of this.life.removeChildren()) ch.destroy({ children: true });
    const throne = chambers.filter((c) => c.kind === 'throne' && c.progress >= 0.45).sort((a, b) => b.progress - a.progress)[0];
    if (throne && look.laws > 0) {
      const box = boxOf(throne);
      const n = Math.min(5, look.laws);
      for (let i = 0; i < n; i++) {
        const s = propAt('prop_law_tablet', box.ox + (i - (n - 1) / 2) * 14, box.fy - box.rh * 0.42, 16);
        if (s) this.life.addChild(s);
      }
    }
    for (const h of look.hearths) {
      if (h.state !== 'lived' && h.state !== 'mourning') continue;
      const c = chambers.find((x) => x.id === h.chamber); if (!c || c.progress < 0.2) continue;
      const box = boxOf(c);
      const s = propAt(h.state === 'mourning' ? 'prop_bone' : 'prop_pebble_bowl', box.ox, box.fy - 1, 16);
      if (s) this.life.addChild(s);
    }
    for (const [tech, kind, prop] of ERA) {
      if (!look.known.has(tech)) continue;
      for (const c of chambers) {
        if (c.kind !== kind || c.progress < 0.72) continue;
        const box = boxOf(c);
        const s = propAt(prop, box.ox + box.rw * 0.28, box.fy - 1, 18);
        if (s) this.life.addChild(s);
      }
    }
    if (look.gathering) {
      const c = chambers.find((x) => x.id === look.gathering!.chamber);
      if (c && c.progress > 0.15) {
        const box = boxOf(c);
        const hot = /riot|coup|protest|strike|trial/.test(look.gathering.kind);
        const fest = /festival|election|feast/.test(look.gathering.kind);
        const s = propAt(hot ? 'prop_law_poster_fresh' : fest ? 'prop_cheese_rind' : 'prop_pebble_bowl', box.ox, box.fy - 2, 22);
        if (s) this.life.addChild(s);
      }
    }
  }
}
