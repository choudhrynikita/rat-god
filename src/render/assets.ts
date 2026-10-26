// Asset loading: Sogni finals (assets/final/index.json) → approved pixel-test art → palette silhouettes.
import { Assets, Rectangle, Texture } from 'pixi.js';

export interface Anim { frames: Texture[]; fps: number; loop: boolean; anchor: [number, number]; source: 'final' | 'pixel_test' | 'silhouette' }
type Entry = { id: string; file?: string; path?: string; src?: string; frames?: number; w?: number; h?: number; frame_w?: number; frame_h?: number; fps?: number; size?: [number, number]; anchor?: [number, number]; status?: string; loop?: boolean; type?: string };

/** game sprite id → [ordered manifest ids to try in assets/final, pixel_test fallback file] */
const WANT: Record<string, [string[], string | null]> = {
  // workers
  rat: [['worker_idle', 'worker_walk'], 'worker_z_48'],
  rat_walk: [['worker_walk', 'worker_idle'], 'worker_z_48'],
  rat_dig: [['worker_dig'], 'worker_z_48'],
  rat_haul: [['worker_haul', 'worker_walk'], 'worker_z_48'],
  rat_sleep: [['worker_sleep'], 'worker_z_48'],
  rat_wheel: [['worker_work_wheel'], 'worker_z_48'],
  rat_gnaw: [['worker_work_gnaw'], 'worker_z_48'],
  rat_eat: [['worker_eat'], 'worker_z_48'],
  rat_drink: [['worker_drink', 'worker_eat'], 'worker_z_48'],
  rat_groom: [['worker_groom', 'worker_idle'], 'worker_z_48'],
  rat_nurse: [['worker_nurse', 'worker_idle'], 'worker_z_48'],
  rat_vote: [['worker_vote', 'worker_protest'], 'worker_z_48'],
  rat_protest: [['worker_protest', 'worker_vote'], 'worker_z_48'],
  rat_cheer: [['worker_cheer', 'worker_idle'], 'worker_z_48'],
  rat_fight: [['worker_fight', 'worker_protest'], 'worker_z_48'],
  rat_starve: [['worker_starving_walk', 'worker_sick_idle'], 'worker_z_48'],
  rat_cower: [['worker_cower'], 'worker_z_48'],
  rat_sick: [['worker_sick_idle', 'worker_exhausted_collapse'], 'worker_z_48'],
  rat_collapse: [['worker_exhausted_collapse', 'worker_sick_idle'], 'worker_z_48'],
  rat_hurt: [['worker_hurt', 'worker_cower'], 'worker_z_48'],
  rat_run: [['worker_run', 'worker_walk'], 'worker_z_48'],
  rat_court: [['worker_court'], 'worker_z_48'],
  rat_die: [['worker_die'], 'worker_z_48'],
  rat_die_violent: [['worker_die_violent', 'worker_die'], 'worker_z_48'],
  // castes
  elder: [['elder_idle_cough', 'elder_walk_limp'], 'worker_z_48'],
  elder_walk: [['elder_walk_limp', 'elder_idle_cough'], 'worker_z_48'],
  elder_teach: [['elder_teach', 'elder_idle_cough'], 'worker_z_48'],
  outcast: [['outcast_idle', 'outcast_beg'], 'worker_q_48'],
  outcast_beg: [['outcast_beg', 'outcast_idle'], 'worker_q_48'],
  outcast_steal: [['outcast_steal', 'outcast_idle'], 'worker_q_48'],
  enforcer: [['enforcer_idle', 'enforcer_patrol'], 'enforcer'],
  enforcer_walk: [['enforcer_patrol', 'enforcer_idle'], 'enforcer'],
  enforcer_beat: [['enforcer_beat', 'enforcer_idle'], 'enforcer'],
  enforcer_drag: [['enforcer_drag_body', 'enforcer_patrol'], 'enforcer'],
  pup: [['pup_idle', 'pup_play'], 'pup'],
  pup_walk: [['pup_walk', 'pup_idle'], 'pup'],
  pup_suckle: [['pup_suckle', 'pup_idle'], 'pup'],
  pup_play: [['pup_play', 'pup_idle'], 'pup'],
  pup_die: [['pup_die'], 'pup'],
  // founder & heralds
  alt: [['founder_idle', 'king_dig_founder'], 'worker_q_48'],
  alt_walk: [['founder_walk'], 'worker_q_48'],
  alt_dig: [['king_dig_founder', 'founder_idle'], 'worker_q_48'],
  alt_build: [['king_build_founder', 'king_dig_founder'], 'worker_q_48'],
  herald: [['herald_walk', 'founder_walk'], 'worker_q_48'],
  herald_announce: [['herald_announce', 'herald_walk'], 'worker_q_48'],
  herald_paste: [['herald_paste_poster', 'herald_announce'], 'worker_q_48'],
  // the king (never leaves the throne)
  king: [['king_idle_throne', 'king_decree@0'], 'king'],
  king_press: [['king_press_law', 'king_decree'], 'king'],
  king_decree: [['king_decree', 'king_press_law'], 'king'],
  king_feast: [['king_feast', 'king_indulge'], 'king'],
  king_indulge: [['king_indulge', 'king_feast'], 'king'],
  king_scraps: [['king_eat_scraps', 'king_idle_throne'], 'king'],
  king_sick: [['king_sick', 'king_starving'], 'king'],
  king_starve: [['king_starving', 'king_sick'], 'king'],
  king_sleep: [['king_sleep', 'king_idle_throne'], 'king'],
  king_frustrated: [['king_frustrated', 'king_idle_throne'], 'king'],
  king_crowned: [['king_crowned', 'king_idle_throne'], 'king'],
  king_die: [['king_die', 'king_sick'], 'corpse'],
  king_executed: [['king_executed', 'king_die'], 'corpse'],
  king_walk: [['king_walk', 'founder_walk'], 'king'],
  // remains
  corpse: [['prop_corpse_fresh', 'worker_die'], 'corpse'],
  corpse_bloat: [['prop_corpse_bloated', 'prop_corpse_fresh'], 'corpse'],
  corpse_old: [['prop_corpse_skeleton', 'prop_corpse_bloated'], 'corpse'],
  corpse_kill: [['prop_kill_remains', 'prop_corpse_fresh'], 'corpse'],
  // hazards
  cat: [['cat_prowl', 'cat_idle_tail'], null], cat_pounce: [['cat_pounce', 'cat_prowl'], null], cat_eat: [['cat_eat_kill', 'cat_prowl'], null], cat_idle: [['cat_idle_tail', 'cat_prowl'], null],
  drone: [['exterminator_drone_hover'], null], drone_spray: [['exterminator_drone_spray_gas', 'exterminator_drone_hover'], null], drone_scan: [['exterminator_drone_scan', 'exterminator_drone_hover'], null],
  roach: [['roach_swarm_crawl'], null], boot: [['giant_boot'], null],
  // scenes
  bg_throne: [['bg_throne_hall'], 'throne_bg'],
  bg_street: [['bg_surface_street'], 'street_bg'],
  city_far: [['parallax_city_far'], null], city_mid: [['parallax_city_mid'], null],
  tile_earth: [['tileset_burrow_0'], null], tile_brick: [['tileset_burrow_1'], null], tile_pipe: [['tileset_burrow_2'], null], tile_metal: [['tileset_burrow_3'], null], tile_tunnel: [['tileset_burrow_4'], null],
  bust: [['portrait_king_talk'], 'bust'],
  poster: [['prop_law_poster_fresh', 'prop_law_poster'], null],
  poster_torn: [['prop_law_poster_torn', 'prop_law_poster_fresh'], null],
  bg_entrance: [['bg_burrow_entrance'], null], bg_granary: [['bg_granary'], null], bg_nursery: [['bg_nursery'], null], bg_workshop: [['bg_workshop'], null],
  bg_barracks: [['bg_barracks'], null], bg_plaza: [['bg_plaza'], null], bg_shrine: [['bg_shrine'], null], bg_graveyard: [['bg_graveyard'], null],
  bg_warren: [['bg_sleeping_warren'], null], bg_deepwarren: [['bg_sleeping_warren'], null], bg_slum: [['bg_outcast_slum'], null],
  // props
  pebble: [['prop_pebble'], null], pebble_bowl: [['prop_pebble_bowl'], null], law_tablet: [['prop_law_tablet'], null],
  scrap: [['prop_bottle_cap_pile', 'prop_wire_coil'], null], scrap2: [['prop_wire_coil', 'prop_bottle_cap_pile'], null], scrap3: [['prop_battery', 'prop_wire_coil'], null],
  food: [['prop_cheese_rind', 'prop_food_crumb'], null], food2: [['prop_food_crumb', 'prop_cheese_rind'], null], food3: [['prop_rotten_fruit', 'prop_food_crumb'], null],
  bone: [['prop_bone'], null], syringe: [['prop_syringe'], null], poster_scrap: [['prop_poster_scrap'], null],
  // fx loops
  fx_neon: [['neon_sign_rat_glyph_loop'], null], fx_arrow: [['neon_arrow_loop'], null], fx_drip: [['pipe_drip_loop'], null], fx_steam: [['steam_vent_loop'], null],
  fx_fire: [['fire_barrel_loop'], null], fx_lamp: [['lamp_flicker_loop'], null], fx_flies: [['flies_corpse_loop'], null], fx_wheel: [['treadwheel_loop'], null],
  fx_sewage: [['sewage_flow_loop'], null], fx_blood: [['blood_pool_spread_loop'], null], fx_stamp: [['law_stamp_vfx_loop'], null], fx_gas: [['gas_cloud_loop'], null],
  fx_fleas: [['plague_flea_cloud_loop'], null], fx_rain: [['rain_grate_loop'], null],
};
/** keys whose art carries blood: a palette-swapped (blood → ash) twin is built for the reduce-gore setting */
const GORE = new Set(['rat_die', 'rat_die_violent', 'rat_fight', 'rat_hurt', 'pup_die', 'king_die', 'king_executed', 'corpse', 'corpse_bloat', 'corpse_old', 'corpse_kill', 'enforcer_beat', 'enforcer_drag', 'cat_eat', 'cat_pounce', 'fx_blood', 'boot']);
const BLOOD: [number, number][] = [[0x670a1e, 0x3b3f42], [0xaa494d, 0x5f6667], [0x3b041b, 0x2a2d30], [0x20060d, 0x1a1c1e], [0x69303f, 0x45494c], [0xe84b5a, 0x7a8384]];

export const report: Record<string, string> = {};
let finalIndex: Map<string, Entry> | null = null;

async function loadIndex(): Promise<Map<string, Entry>> {
  const m = new Map<string, Entry>();
  try {
    const r = await fetch('assets/final/index.json', { cache: 'no-cache' });
    if (!r.ok) return m;
    const j = await r.json();
    const list: Entry[] = Array.isArray(j) ? j : Array.isArray(j.assets) ? j.assets : Object.entries(j.assets ?? j).map(([id, v]) => ({ id, ...(typeof v === 'string' ? { file: v } : (v as object)) }));
    for (const e of list) if (e && e.id && (e.file || e.path || e.src) && (!e.status || e.status === 'done') && e.type !== 'spritesheet') m.set(e.id, e);
  } catch { /* no finals yet */ }
  return m;
}

function nearest(t: Texture) { t.source.scaleMode = 'nearest'; return t; }

function slice(tex: Texture, e: Entry): Texture[] {
  const n = Math.max(1, e.frames ?? 1);
  const fw = e.frame_w ?? e.w ?? e.size?.[0] ?? Math.floor(tex.width / n), fh = e.frame_h ?? e.h ?? e.size?.[1] ?? tex.height;
  if (n === 1 && fw >= tex.width) return [tex];
  const cols = Math.max(1, Math.floor(tex.width / fw));
  const out: Texture[] = [];
  const fh2 = Math.min(fh, tex.height); // some strips are a few px shorter than their declared frame
  for (let i = 0; i < n; i++) out.push(new Texture({ source: tex.source, frame: new Rectangle((i % cols) * fw, Math.min(Math.floor(i / cols) * fh, tex.height - fh2), Math.min(fw, tex.width), fh2) }));
  return out;
}

const PAL = { ink: '#000000', fur: '#574950', furL: '#796765', pink: '#c67f7b', bone: '#d8b397', rust: '#864f4d', amber: '#d5a063', teal: '#3b666f', blood: '#670a1e', grey: '#505b5c' };
/** A palette-only silhouette so the game never shows a missing texture. */
function silhouette(kind: string): Texture {
  const c = document.createElement('canvas');
  const big = kind.startsWith('bg_');
  c.width = big ? 360 : kind === 'pup' ? 24 : 48; c.height = big ? 200 : kind === 'pup' ? 16 : 32;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  if (big) { px(0, 0, c.width, c.height, '#14151a'); for (let i = 0; i < 40; i++) px((i * 37) % c.width, (i * 53) % c.height, 8, 4, '#1e2228'); }
  else if (kind === 'poster') { c.width = 10; c.height = 12; px(0, 0, 10, 12, PAL.ink); px(1, 1, 8, 10, PAL.bone); px(2, 3, 6, 1, PAL.blood); px(2, 5, 5, 1, PAL.rust); px(2, 7, 6, 1, PAL.rust); }
  else if (kind === 'pebble') { c.width = 6; c.height = 5; px(1, 0, 4, 5, PAL.ink); px(0, 1, 6, 3, PAL.ink); px(1, 1, 4, 3, PAL.grey); px(1, 1, 2, 1, PAL.furL); }
  else if (kind === 'scrap') { c.width = 10; c.height = 6; px(0, 2, 10, 4, PAL.ink); px(1, 3, 8, 2, PAL.rust); px(2, 1, 6, 2, PAL.ink); px(3, 2, 4, 1, PAL.amber); }
  else if (kind === 'food') { c.width = 9; c.height = 6; px(0, 1, 9, 5, PAL.ink); px(1, 2, 7, 3, '#f2b46a'); px(2, 2, 2, 1, '#f6c992'); px(5, 3, 1, 1, PAL.rust); }
  else if (kind === 'cat') { c.width = 64; c.height = 40; px(6, 14, 46, 18, PAL.ink); px(44, 6, 16, 16, PAL.ink); px(46, 2, 4, 6, PAL.ink); px(54, 2, 4, 6, PAL.ink); px(48, 12, 2, 2, '#45eaf0'); px(54, 12, 2, 2, '#45eaf0'); px(0, 8, 6, 20, PAL.ink); px(8, 32, 4, 8, PAL.ink); px(40, 32, 4, 8, PAL.ink); }
  else {
    const w = c.width; const s = w / 48;
    px(8 * s, 10 * s, 28 * s, 14 * s, PAL.ink); px(34 * s, 12 * s, 10 * s, 9 * s, PAL.ink); px(0, 20 * s, 10 * s, 2 * s, PAL.pink);
    px(9 * s, 11 * s, 26 * s, 12 * s, PAL.fur); px(35 * s, 13 * s, 8 * s, 7 * s, PAL.furL); px(40 * s, 14 * s, 2 * s, 2 * s, PAL.ink); px(36 * s, 9 * s, 4 * s, 4 * s, PAL.pink);
    if (kind.startsWith('corpse')) px(6 * s, 24 * s, 34 * s, 3 * s, PAL.blood);
  }
  return nearest(Texture.from(c));
}

const cache = new Map<string, Anim>();
const ashCache = new Map<string, Anim>();
function ashTexture(tex: Texture): Texture {
  const res = tex.source.resource as CanvasImageSource; const w = tex.source.width, h = tex.source.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(res, 0, 0); const d = g.getImageData(0, 0, w, h); const a = d.data;
  for (let i = 0; i < a.length; i += 4) {
    if (!a[i + 3]) continue; const rgb = (a[i] << 16) | (a[i + 1] << 8) | a[i + 2];
    for (const [from, to] of BLOOD) if (rgb === from) { a[i] = to >> 16; a[i + 1] = (to >> 8) & 255; a[i + 2] = to & 255; break; }
  }
  g.putImageData(d, 0, 0);
  return nearest(Texture.from(c));
}
/** a tile that is not seamless on its own, made seamless by trimming its edges and mirroring it 2x2 */
const seamCache = new Map<string, Texture>();
export function seamless(k: string, inset = 3): Texture {
  const hit = seamCache.get(k); if (hit) return hit;
  const t = tex(k); const res = t.source.resource as CanvasImageSource; const w = t.source.width - inset * 2, h = t.source.height - inset * 2;
  if (w <= 0 || h <= 0) return t;
  const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
  for (const [fx, fy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { g.save(); g.translate(fx < 0 ? w * 2 : 0, fy < 0 ? h * 2 : 0); g.scale(fx, fy); g.drawImage(res, inset, inset, w, h, 0, 0, w, h); g.restore(); }
  const out = nearest(Texture.from(c)); seamCache.set(k, out); return out;
}
export const urls: Record<string, string> = {};
const fileUrl = (e: Entry) => 'assets/final/' + (e.file ?? e.path ?? e.src)!.replace(/^\.?\//, '').replace(/^assets\/final\//, '');
export async function loadAll(onProgress?: (done: number, total: number) => void): Promise<Map<string, Anim>> {
  finalIndex = await loadIndex();
  let done = 0; const total = Object.keys(WANT).length;
  for (const [id, e] of finalIndex) urls[id] = fileUrl(e);
  const tasks = Object.entries(WANT).map(async ([key, [ids, pt]]) => { try { await loadOne(key, ids, pt); } finally { onProgress?.(++done, total); } });
  async function loadOne(key: string, ids: string[], pt: string | null) {
    for (const spec of ids) {
      const [id, only] = spec.split('@');
      const e = finalIndex!.get(id);
      if (!e) continue;
      try {
        const tex = nearest(await Assets.load<Texture>(fileUrl(e)));
        const pick = (t: Texture) => { let fr = slice(t, e); if (only !== undefined) fr = [fr[Math.min(+only, fr.length - 1)]]; return fr; };
        const meta = { fps: e.fps ?? 8, loop: e.loop ?? true, anchor: (e.anchor ?? [0.5, 1]) as [number, number], source: 'final' as const };
        cache.set(key, { frames: pick(tex), ...meta }); report[key] = `final:${id}`;
        if (GORE.has(key)) { try { ashCache.set(key, { frames: pick(ashTexture(tex)), ...meta }); } catch { /* keep gore art */ } }
        return;
      } catch { /* try next */ }
    }
    if (pt) {
      try { const tex = nearest(await Assets.load<Texture>(`assets/pixel_test/${pt}.png`)); cache.set(key, { frames: [tex], fps: 1, loop: true, anchor: [0.5, 1], source: 'pixel_test' }); report[key] = `pixel_test:${pt}`; return; } catch { /* fall through */ }
    }
    cache.set(key, { frames: [silhouette(key)], fps: 1, loop: true, anchor: [0.5, 1], source: 'silhouette' }); report[key] = 'silhouette';
  }
  await Promise.all(tasks);
  return cache;
}
let goreOn = true;
export function setGoreArt(on: boolean) { goreOn = on; }
export const anim = (k: string): Anim => (!goreOn && ashCache.get(k)) || cache.get(k) || cache.get('rat')!;
export const tex = (k: string) => anim(k).frames[0];
export const isFinal = (k: string) => cache.get(k)?.source === 'final';
export const finalCount = () => finalIndex?.size ?? 0;
export const assetUrl = (id: string, fallback = '') => urls[id] ?? fallback;
