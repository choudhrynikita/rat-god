// RENDER-side MOCK of the SIM v2 worker, speaking the real contract (src/sim/v2/contract.ts). It exists so render/UI can be
// built and verified before the SIM stream's worker lands; it is NOT a simulation (no needs, no society) — just plausible motion,
// digging, weather and events. Swap for the real worker by passing ?sim=real (see main2.ts).
import {
  Anim, Carry, Mat, PASSABLE, RF, Stage, DAY_TICKS, TICK_MS_1X,
  type BurrowInit, type Chamber, type ChamberKind, type FromWorker2, type GodPowerInfo, type NavEdge, type NavNode, type RatsBlock,
  type Snapshot2, type TerrainInit, type ToWorker2, type WeatherKind, type SimEvent2, type Speed2, type FactionInfo, type RatDetail,
} from '../../sim/v2/contract';
import { sampleEdge, denseOf } from '../../sim/v2/shared';

type Rng = () => number;
function mulberry(a: number): Rng { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const MOCK_SOCIETY = {
  tech: [
    { id: 'fire', name: 'Fire', era: 0, status: 'known', knowers: 12, discovered: 40, discoverer: 11, how: 'labrats', holder: 0, blurb: 'Warmth, light, cooked crumbs.' },
    { id: 'digging_blade', name: 'Digging Blade', era: 0, status: 'known', knowers: 30, discovered: 90, discoverer: 17, how: 'need', holder: 0, blurb: 'Sharpened tin digs twice as fast.' },
    { id: 'marks', name: 'Marks', era: 1, status: 'secret', knowers: 3, discovered: 400, discoverer: 7, how: 'curiosity', holder: 2, blurb: 'Scratches that remember.' },
    { id: 'spark', name: 'Captured Spark', era: 2, status: 'known', knowers: 5, discovered: 900, discoverer: 12, how: 'experiment', holder: 0, blurb: 'Light from the humming wires.' },
  ],
  research: [{ ratId: 12, tech: 'wheel', progress: 0.4, fails: 2, chamber: 5 }],
  firms: [
    { id: 1, name: 'Deepclaw Diggers', kind: 'diggers', boss: 17, workers: 14, rodentoids: 0, wage: 1.5, wealth: 40, share: 0.6, founded: 100, status: 'open', union: 0 },
    { id: 2, name: 'Sparkworks', kind: 'sparkworks', boss: 12, workers: 5, rodentoids: 0, wage: 2.2, wealth: 25, share: 1, founded: 900, status: 'open', union: 0 },
  ],
  parties: [
    { id: 1, name: 'Crumbs For All', leader: 20, members: 18, platform: ['share the hoard', 'curb the crown'], color: 0x8fb36b, seats: 3, corrupt: 0.1, patron: 0, founded: 300, banned: false },
    { id: 2, name: 'The Old Order', leader: 2, members: 22, platform: ['obey the seat'], color: 0xd5a063, seats: 4, corrupt: 0.5, patron: 1, founded: 200, banned: false },
  ],
  council: { seats: 7, parties: [[1, 3], [2, 4]], nextElection: 2000, speaker: 2, lastVote: 'Tithe of crumbs passed 4-3' },
  religions: [{ id: 1, name: 'The Listening', deity: 'the Unseen', doctrine: ['pray at dusk', 'share with the starving'], founder: 7, prophet: 7, members: 17, temples: [4], tolerance: 0.3, enemies: [], parent: 0, founded: 120, color: 0x45eaf0 }],
  justice: { jail: 6, inmates: [{ ratId: 30, crime: 'theft of crumbs', until: 3000, wrongful: false, gang: 0 }, { ratId: 31, crime: 'heresy', until: 5000, wrongful: true, gang: 0 }], trials: [], secretPolice: false, executions: 1, exiles: 0 },
  festivals: [],
} as unknown as Pick<Snapshot2, 'tech' | 'research' | 'firms' | 'parties' | 'council' | 'religions' | 'justice' | 'festivals'>;
export const MOCK_POWERS: GodPowerInfo[] = [
  { power: 'smite', label: 'SMITE', group: 'creation', cost: 30, target: ['rat'], params: [], blurb: 'Strike one rat down with lightning.' },
  { power: 'bless', label: 'BLESS', group: 'elevation', cost: 20, target: ['rat'], params: ['gift'], blurb: 'Grant a gift: genius, charisma, strength…' },
  { power: 'curse', label: 'CURSE', group: 'elevation', cost: 20, target: ['rat'], params: ['curse'], blurb: 'Lay a curse on one rat.' },
  { power: 'anoint_prophet', label: 'PROPHET', group: 'elevation', cost: 40, target: ['rat'], params: [], blurb: 'Make a rat hear your voice.' },
  { power: 'whisper', label: 'WHISPER', group: 'influence', cost: 8, target: ['rat'], params: ['idea'], blurb: 'Plant an idea in a mind.' },
  { power: 'sow_rumour', label: 'RUMOUR', group: 'influence', cost: 10, target: ['rat'], params: ['claim', 'about'], blurb: 'Start a rumour about someone.' },
  { power: 'inspire', label: 'INSPIRE', group: 'influence', cost: 15, target: ['chamber'], params: ['idea'], blurb: 'Fill a chamber with fervour.' },
  { power: 'dream', label: 'DREAM', group: 'influence', cost: 12, target: ['rat'], params: ['dream'], blurb: 'Send a dream or an omen.' },
  { power: 'flood', label: 'FLOOD', group: 'nature', cost: 35, target: ['x', 'y'], params: ['magnitude'], blurb: 'Send water surging down the tunnels.' },
  { power: 'cave_in', label: 'CAVE-IN', group: 'nature', cost: 25, target: ['x', 'y'], params: [], blurb: 'Bring the ceiling down.' },
  { power: 'plague', label: 'PLAGUE', group: 'nature', cost: 40, target: ['chamber'], params: [], blurb: 'Release a miasma.' },
  { power: 'harvest', label: 'HARVEST', group: 'nature', cost: 20, target: [], params: [], blurb: 'Rain food from the street.' },
  { power: 'storm', label: 'STORM', group: 'nature', cost: 15, target: [], params: [], blurb: 'Summon a storm above.' },
  { power: 'earthquake', label: 'QUAKE', group: 'nature', cost: 45, target: [], params: ['magnitude'], blurb: 'Shake the whole kingdom.' },
  { power: 'raise_dead', label: 'RAISE', group: 'creation', cost: 60, target: ['corpse'], params: [], blurb: 'Return a dead rat to life.' },
  { power: 'miracle', label: 'MIRACLE', group: 'fate', cost: 50, target: ['chamber'], params: ['miracle'], blurb: 'Feed, heal, calm or light.' },
  { power: 'foresee', label: 'FORESEE', group: 'fate', cost: 5, target: [], params: ['query'], blurb: 'Glimpse what may come.' },
];
const NAMES = ['Skritch', 'Murk', 'Tallow', 'Nib', 'Grisel', 'Pock', 'Ash', 'Bramble', 'Cinder', 'Dreg', 'Fennel', 'Gnash', 'Hob', 'Inkle', 'Jot', 'Kettle', 'Lint', 'Mote', 'Nettle', 'Oddment', 'Pith', 'Quill', 'Rasp', 'Sorrel', 'Tick', 'Umber', 'Vetch', 'Wisp', 'Yarrow', 'Zest'];

interface MRat { id: number; name: string; edge: number; s: number; dir: 1 | -1; path: number[]; anim: Anim; busy: number; speed: number; dist: number; stage: Stage; flags: number; coat: number; size: number; carry: Carry; faction: number; home: number; x: number; y: number; heading: number; facing: -1 | 1; target: number; lane: number; alive: boolean }

export class MockSim {
  private rng: Rng; private tick = 0; private speed: Speed2 = 1; private acc = 0; private seq = 1;
  terrain!: TerrainInit; burrow!: BurrowInit; private rats: MRat[] = []; private dirty = new Set<number>();
  private events: SimEvent2[] = []; private adj = new Map<number, { e: number; to: number }[]>();
  private weather: WeatherKind = 'clear'; private intensity = 0; private wTimer = 0; private lightning = false; private quake = 0;
  private digEdge = -1; private inspectId: number | null = null; private grace = 120;
  private listeners: ((m: FromWorker2) => void)[] = [];
  constructor(seed = 7) { this.rng = mulberry(seed); }
  on(f: (m: FromWorker2) => void) { this.listeners.push(f); }
  private emit(m: FromWorker2) { for (const f of this.listeners) f(m); }
  send(m: ToWorker2) {
    if (m.t === 'new') { this.build(); this.emit({ t: 'init', contract: '2.0.0', terrain: this.terrain, burrow: this.burrow, powers: MOCK_POWERS, laws: [] }); this.snap(); }
    else if (m.t === 'speed') this.speed = m.v;
    else if (m.t === 'inspect') this.inspectId = m.id;
    else if (m.t === 'debug') { if (m.what === 'weather') { this.weather = String(m.arg) as WeatherKind; this.intensity = 0.9; this.wTimer = 400; } if (m.what === 'tod') this.tick = Math.round(Number(m.arg) * DAY_TICKS); }
    else if (m.t === 'god') this.god(m.power, m.target, m.req);
    else if (m.t === 'story') { const d = this.detail(m.id); if (d) this.emit({ t: 'story', id: m.id, detail: d }); }
  }
  /** advance by wall-clock ms */
  update(ms: number) {
    if (!this.terrain || this.speed === 0) return;
    this.acc += ms * this.speed;
    let n = 0;
    while (this.acc >= TICK_MS_1X && n < 8) { this.acc -= TICK_MS_1X; this.step(); n++; if (n === 8) this.acc = 0; }
    if (n) this.snap();
  }
  get tickMs() { return TICK_MS_1X / Math.max(0.25, this.speed); }
  // ───────────────────────── world building ─────────────────────────
  private build() {
    const W = 480, H = 230, r = this.rng; const N = W * H;
    const surfaceY = new Int16Array(W); const mat = new Uint8Array(N), carve = new Uint8Array(N), water = new Uint8Array(N), moist = new Uint8Array(N), debris = new Uint8Array(N), stab = new Uint8Array(N).fill(255);
    for (let x = 0; x < W; x++) surfaceY[x] = Math.round(34 + Math.sin(x * 0.021) * 1.5 + Math.sin(x * 0.07 + 2) * 0.6 + (x > 150 && x < 330 ? 0 : 0));
    const clayTop = (x: number) => 70 + Math.sin(x * 0.013) * 9 + Math.sin(x * 0.051) * 3;
    const gravTop = (x: number) => 128 + Math.sin(x * 0.009 + 1) * 12;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, s = surfaceY[x];
      let m: Mat = Mat.Air;
      if (y >= s) { const d = y - s; m = d < 7 ? Mat.Topsoil : y < clayTop(x) ? Mat.Loam : y < gravTop(x) ? Mat.Clay : y < 200 ? (Math.sin(x * 0.11 + y * 0.07) > 0.6 ? Mat.Gravel : Mat.Loam) : y < H - 6 ? Mat.Clay : Mat.Bedrock; }
      // concrete footing of the building on the left and a kerb slab on the right
      if (y >= surfaceY[x] && y < surfaceY[x] + 26 && x < 46) m = Mat.Concrete;
      mat[i] = m; moist[i] = y > s ? Math.min(255, 40 + (y - s) * 0.8 + Math.max(0, Math.sin(x * 0.03) * 60)) : 0;
    }
    const rocks: TerrainInit['rocks'] = []; for (let k = 0; k < 46; k++) { const cx = 50 + r() * (W - 60), cy = 50 + r() * (H - 60), rx = 2 + r() * 5, ry = 1.5 + r() * 3; rocks.push({ cx, cy, rx, ry }); }
    const roots: TerrainInit['roots'] = []; for (let k = 0; k < 9; k++) { let x = 60 + r() * (W - 80), y = surfaceY[Math.floor(x)]; const pts: [number, number][] = [[x, y]]; for (let j = 0; j < 7; j++) { x += (r() - 0.5) * 9; y += 3 + r() * 5; pts.push([x, y]); } roots.push({ pts, r: 0.6 + r() * 0.8 }); }
    const pipes: TerrainInit['pipes'] = [{ x0: 0, y0: 52, x1: 300, y1: 54, r: 3.2, leaking: true }, { x0: 380, y0: 46, x1: 380, y1: 34, r: 2.2, leaking: false }];
    const paint = (cx: number, cy: number, rx: number, ry: number, m: Mat) => { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) { if (x < 0 || y < 0 || x >= W || y >= H) continue; if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 && mat[y * W + x] !== Mat.Air) mat[y * W + x] = m; } };
    for (const k of rocks) paint(k.cx, k.cy, k.rx, k.ry, Mat.Rock);
    for (const p of pipes) { const L = Math.hypot(p.x1 - p.x0, p.y1 - p.y0); for (let t = 0; t <= L; t += 0.5) paint(p.x0 + (p.x1 - p.x0) * t / L, p.y0 + (p.y1 - p.y0) * t / L, p.r, p.r, Mat.Pipe); }
    // burrow
    const nodes: NavNode[] = [], edges: NavEdge[] = [], chambers: Chamber[] = [];
    const node = (x: number, y: number, kind: NavNode['kind']) => { nodes.push({ id: nodes.length, x, y, kind }); return nodes.length - 1; };
    const wob = (a: [number, number], b: [number, number], k = 3, amp = 2.5): [number, number][] => { const pts: [number, number][] = [a]; for (let j = 1; j < k; j++) { const t = j / k; pts.push([a[0] + (b[0] - a[0]) * t + (r() - 0.5) * amp * 2, a[1] + (b[1] - a[1]) * t + (r() - 0.5) * amp]); } pts.push(b); return pts; };
    const edge = (a: number, b: number, kind: NavEdge['kind'], width = 2.6, pts?: [number, number][], chamber = -1, dugFrac = 1) => {
      const A = nodes[a], B = nodes[b]; const P = pts ?? wob([A.x, A.y], [B.x, B.y], Math.max(2, Math.round(Math.hypot(B.x - A.x, B.y - A.y) / 12)));
      const e: NavEdge = { id: edges.length, a, b, kind, pts: P, len: 0, width, chamber, dug: 0, from: a }; e.len = denseOf(e).len; e.dug = e.len * dugFrac; edges.push(e); return e.id; };
    const K: [ChamberKind, string, number, number, number, number][] = [
      ['entrance', 'The Grate Mouth', 205, 44, 7, 4], ['plaza', 'The Commons', 240, 92, 18, 6], ['granary', 'The Hoard', 140, 84, 13, 5], ['nursery', 'The Warm Nest', 330, 80, 12, 5],
      ['shrine', 'The Listening Hole', 95, 128, 11, 5], ['workshop', 'The White Room', 395, 128, 14, 6], ['barracks', 'The Teeth', 300, 140, 12, 5], ['nest', 'Deep Warren', 180, 150, 14, 5],
      ['throne', 'The Seat', 245, 196, 16, 7], ['midden', 'The Midden', 60, 180, 10, 4], ['slum', 'Gutter Row', 420, 186, 13, 5], ['market', 'Scrap Market', 140, 116, 9, 4],
    ];
    const surf = node(205, surfaceY[205] - 0.01, 'surface');
    for (const [kind, name, cx, cy, rx, ry] of K) {
      const floorY = cy + ry - 0.9; const a = node(cx - rx + 2, floorY, 'chamber'), b = node(cx + rx - 2, floorY, 'chamber');
      const ch: Chamber = { id: chambers.length, kind, name, cx, cy, rx, ry, seed: Math.floor(r() * 1e6), floorY, floorEdge: -1, entryNode: a, progress: 1, stock: 0, owner: 0, flooded: 0 };
      ch.floorEdge = edge(a, b, 'floor', ry * 2, [[cx - rx + 2, floorY], [cx, floorY + 0.2], [cx + rx - 2, floorY]], ch.id); chambers.push(ch);
    }
    const ent = (c: number, side: 0 | 1) => side ? edges[chambers[c].floorEdge].b : edges[chambers[c].floorEdge].a;
    edge(surf, ent(0, 0), 'shaft', 2.4, [[205, surfaceY[205]], [203, 38], [199, 42], [nodes[ent(0, 0)].x, nodes[ent(0, 0)].y]]);
    const links: [number, 0 | 1, number, 0 | 1][] = [[0, 1, 1, 0], [1, 0, 2, 1], [1, 1, 3, 0], [2, 0, 11, 1], [11, 0, 4, 1], [1, 1, 6, 0], [3, 1, 5, 0], [11, 1, 7, 0], [7, 1, 6, 0], [7, 1, 8, 0], [4, 0, 9, 1], [8, 1, 10, 0], [6, 1, 10, 0], [7, 0, 9, 1]];
    for (const [c1, s1, c2, s2] of links) edge(ent(c1, s1), ent(c2, s2), 'tunnel', 2.4 + r() * 0.6);
    // a dead end and an unfinished dig heading east from the warren
    const de = node(250, 165, 'deadend'); edge(ent(7, 1), de, 'tunnel', 2.4, undefined, -1, 1);
    const dg = node(470, 120, 'deadend'); this.digEdge = edge(ent(5, 1), dg, 'tunnel', 2.6, undefined, -1, 0.15);
    this.terrain = { W, H, tileCm: 4, surfaceY, mat, carve, water, moist, debris, stab, pipes, roots, rocks };
    this.burrow = { nodes, edges, chambers };
    for (const e of edges) this.carveEdge(e, e.dug, false);
    for (const c of chambers) this.carveChamber(c);
    // some debris near the midden, a damp sump under the pipe, a cracked ceiling in the slum
    for (let y = 175; y < 186; y++) for (let x = 50; x < 70; x++) if (carve[y * W + x] > 200) debris[y * W + x] = Math.min(255, (y - 175) * 30);
    for (let x = 400; x < 440; x++) for (let y = 178; y < 186; y++) stab[y * W + x] = 40;
    for (const e of edges) { const a = this.adj.get(e.a) ?? []; a.push({ e: e.id, to: e.b }); this.adj.set(e.a, a); const b = this.adj.get(e.b) ?? []; b.push({ e: e.id, to: e.a }); this.adj.set(e.b, b); }
    // rats
    const n = 70;
    for (let i = 0; i < n; i++) {
      const c = chambers[1 + Math.floor(r() * (chambers.length - 1))]; const e = c.floorEdge; const st: Stage = r() < 0.15 ? Stage.Pup : r() < 0.1 ? Stage.Elder : Stage.Adult;
      const R: MRat = { id: i + 1, name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ' ' + 'IVX'[i % 3] : ''), edge: e, s: r() * edges[e].len, dir: r() < 0.5 ? 1 : -1, path: [], anim: Anim.Idle, busy: r() * 20, speed: 0, dist: r() * 10,
        stage: st, flags: (r() < 0.5 ? RF.female : 0), coat: Math.floor(r() * 8), size: st === Stage.Pup ? 0.45 : 0.9 + r() * 0.2, carry: Carry.None, faction: 1 + Math.floor(r() * 3), home: c.id, x: 0, y: 0, heading: 0, facing: 1, target: -1, lane: 0, alive: true };
      this.rats.push(R);
    }
    const king = this.rats[0]; king.flags |= RF.king; king.edge = chambers[8].floorEdge; king.s = edges[king.edge].len / 2; king.home = 8; king.stage = Stage.Adult; king.size = 1.15;
    for (let i = 1; i < 6; i++) { this.rats[i].flags |= RF.enforcer; }
    for (let i = 6; i < 10; i++) { this.rats[i].flags |= RF.priest; this.rats[i].home = 4; }
    for (let i = 10; i < 16; i++) { this.rats[i].flags |= RF.prophet * 0; this.rats[i].home = 5; this.rats[i].coat = 6; }  // lab rats: albino
    const digger = this.rats[16]; digger.edge = this.digEdge; digger.s = this.burrow.edges[this.digEdge].dug - 1.2; digger.dir = 1; digger.anim = Anim.Dig; digger.busy = 1e9;
  }
  private setCarve(x: number, y: number, v: number) { const T = this.terrain; if (x < 0 || y < 0 || x >= T.W || y >= T.H) return; const i = y * T.W + x; if (T.mat[i] === Mat.Air || T.mat[i] === Mat.Rock || T.mat[i] === Mat.Pipe || T.mat[i] === Mat.Concrete || T.mat[i] === Mat.Bedrock) return; if (v > T.carve[i]) { T.carve[i] = v; this.dirty.add(i); } }
  private carveDisc(cx: number, cy: number, rad: number, v = 255) { for (let y = Math.floor(cy - rad - 1); y <= cy + rad + 1; y++) for (let x = Math.floor(cx - rad - 1); x <= cx + rad + 1; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d <= rad) this.setCarve(x, y, v); else if (d <= rad + 0.8) this.setCarve(x, y, Math.min(v, 120)); } }
  private carveEdge(e: NavEdge, upto: number, partialFace: boolean) {
    for (let s = 0; s <= Math.min(upto, e.len); s += 0.4) { const p = sampleEdge(e, s); this.carveDisc(p.x, p.y - e.width / 2 + 0.3, e.width / 2); }
    if (partialFace && upto < e.len) { const p = sampleEdge(e, upto + 0.8); this.carveDisc(p.x, p.y - e.width / 2 + 0.3, e.width / 2, 150 + Math.floor(this.rng() * 40)); }
  }
  private carveChamber(c: Chamber) {
    const r = mulberry(c.seed);
    const k1 = r() * 6, k2 = r() * 6;
    for (let y = Math.floor(c.cy - c.ry - 2); y <= c.cy + c.ry + 2; y++) for (let x = Math.floor(c.cx - c.rx - 2); x <= c.cx + c.rx + 2; x++) {
      const a = Math.atan2(y - c.cy, x - c.cx); const w = 1 + 0.12 * Math.sin(a * 3 + k1) + 0.07 * Math.sin(a * 5 + k2);
      let dy = (y + 0.5 - c.cy) / c.ry; if (dy > 0) dy *= 1.6; // flatter floor
      const d = Math.hypot((x + 0.5 - c.cx) / c.rx, dy) / w; if (d <= 1) this.setCarve(x, y, 255); else if (d < 1.08) this.setCarve(x, y, 110);
    }
  }
  // ───────────────────────── stepping ─────────────────────────
  private bfs(from: number, to: number): number[] {
    const prev = new Map<number, [number, number]>(); const q = [from]; prev.set(from, [-1, -1]);
    while (q.length) { const u = q.shift()!; if (u === to) break; for (const { e, to: v } of this.adj.get(u) ?? []) { const E = this.burrow.edges[e]; if (E.dug < E.len - 0.01 || prev.has(v)) continue; prev.set(v, [u, e]); q.push(v); } }
    if (!prev.has(to)) return []; const path: number[] = []; let c = to; while (c !== from) { const [p, e] = prev.get(c)!; path.unshift(e); c = p; } return path;
  }
  private step() {
    this.tick++; const r = this.rng; const B = this.burrow;
    // weather cycle
    if (--this.wTimer <= 0) { const opts: WeatherKind[] = ['clear', 'rain', 'storm', 'fog', 'clear', 'overcast', 'snow', 'heat']; this.weather = opts[Math.floor(r() * opts.length)]; this.intensity = 0.4 + r() * 0.6; this.wTimer = 300 + r() * 500; this.ev('weather', `The sky turns: ${this.weather}.`, 0); }
    this.lightning = this.weather === 'storm' && r() < 0.02;
    this.quake = Math.max(0, this.quake - 0.02);
    // flooding: rain pours down the entrance shaft and pools in the commons
    const wet = this.weather === 'rain' || this.weather === 'storm';
    const T = this.terrain; const pool = B.chambers[1];
    for (let x = Math.floor(pool.cx - pool.rx); x < pool.cx + pool.rx; x++) {
      const y = Math.floor(pool.cy + pool.ry - 1); for (const yy of [y, y - 1]) { const i = yy * T.W + x; if (T.carve[i] < PASSABLE) continue; const tgt = wet ? Math.min(255, T.water[i] + (yy === y ? 6 : 2) * this.intensity) : Math.max(0, T.water[i] - 1); if (tgt !== T.water[i]) { T.water[i] = tgt; this.dirty.add(i); } }
    }
    // digging advances the face
    const de = B.edges[this.digEdge];
    if (de.dug < de.len && this.tick % 3 === 0) { de.dug = Math.min(de.len, de.dug + 0.12); this.carveEdge(de, de.dug, true); if (this.tick % 30 === 0) { const p = sampleEdge(de, Math.max(0, de.dug - 6)); const i = Math.floor(p.y - 0.5) * T.W + Math.floor(p.x); T.debris[i] = Math.min(255, T.debris[i] + 40); this.dirty.add(i); } }
    for (const R of this.rats) this.moveRat(R);
    // occasional events
    if (r() < 0.01) { const R = this.rats[Math.floor(r() * this.rats.length)]; this.ev('rumour', `${R.name} whispers that the granary is half empty.`, 1, [R.id], R.x, R.y); }
    if (r() < 0.004) { const R = this.rats[Math.floor(r() * this.rats.length)]; this.ev('prayer', `${R.name} prays for a sign.`, 2, [R.id], R.x, R.y); }
  }
  private moveRat(R: MRat) {
    const r = this.rng; const B = this.burrow; let e = B.edges[R.edge];
    if (R.anim === Anim.Dig) { R.s = Math.max(0, e.dug - 1.6); R.dist += 0; R.speed = 0; R.dir = 1; }
    else if (R.path.length === 0 && R.speed === 0) {
      if (--R.busy <= 0) {
        // choose: wander to another chamber, or potter in this one
        if (r() < 0.45 && !(R.flags & RF.king)) {
          const goal = r() < 0.6 ? R.home : Math.floor(r() * B.chambers.length);
          const tgtNode = r() < 0.5 ? B.edges[B.chambers[goal].floorEdge].a : B.edges[B.chambers[goal].floorEdge].b;
          const cur = R.s < e.len / 2 ? e.a : e.b; R.path = this.bfs(cur, tgtNode);
          if (R.path.length) { R.s = cur === e.a ? 0 : e.len; }
          R.carry = r() < 0.15 ? Carry.Food : r() < 0.05 && R.stage === Stage.Adult ? Carry.Pup : Carry.None;
        }
        if (!R.path.length) {
          const acts = R.flags & RF.king ? [Anim.Throne, Anim.Feast, Anim.Throne] : R.flags & RF.priest ? [Anim.Pray, Anim.Preach, Anim.Idle] : R.home === 5 ? [Anim.Craft, Anim.Idle, Anim.Gnaw] : [Anim.Idle, Anim.Groom, Anim.Eat, Anim.Sleep, Anim.Idle, Anim.Walk, Anim.Talk, Anim.Play];
          let a = acts[Math.floor(r() * acts.length)]; if (R.stage === Stage.Pup && a !== Anim.Walk) a = r() < 0.5 ? Anim.Play : Anim.Idle;
          R.anim = a; R.busy = 20 + r() * 60;
          if (a === Anim.Walk) { R.dir = r() < 0.5 ? 1 : -1; R.busy = 4 + r() * 10; }
        }
      }
    }
    // locomotion
    const moving = R.path.length > 0 || (R.anim === Anim.Walk && R.busy > 0);
    if (moving) {
      if (R.path.length) {
        e = B.edges[R.path[0]]; if (R.edge !== e.id) { const prevE = B.edges[R.edge]; const at = R.s <= 0.01 ? prevE.a : prevE.b; R.edge = e.id; R.dir = e.a === at ? 1 : -1; R.s = R.dir === 1 ? 0 : e.len; }
      }
      const tight = e.kind !== 'floor' && e.width < 3.0;
      const want = R.flags & RF.king ? 0.6 : R.carry === Carry.Food ? 0.7 : R.stage === Stage.Pup ? 0.6 : R.anim === Anim.Walk ? 0.5 : tight ? 0.85 : 1.1;
      R.speed += (want - R.speed) * 0.5;
      const ds = R.speed * R.dir; R.s += ds; R.dist += Math.abs(ds);
      R.anim = e.kind === 'shaft' && Math.abs(Math.sin(sampleEdge(e, R.s).heading)) > 0.75 ? Anim.Climb : tight ? Anim.Squeeze : R.speed > 1.5 ? Anim.Run : Anim.Walk;
      if (R.carry) R.anim = R.carry === Carry.Food || R.carry === Carry.Pup ? Anim.Carry : R.anim;
      if (R.s < 0 || R.s > e.len) {
        R.s = Math.max(0, Math.min(e.len, R.s));
        if (R.path.length) R.path.shift(); else R.dir = (-R.dir) as 1 | -1;
        if (!R.path.length && R.anim !== Anim.Walk) { R.speed = 0; R.anim = Anim.Idle; R.busy = 10 + r() * 30; R.carry = Carry.None; }
      }
      if (!R.path.length && R.anim === Anim.Walk && --R.busy <= 0) { R.speed = 0; R.anim = Anim.Idle; R.busy = 10 + r() * 40; }
    } else R.speed = 0;
    const p = sampleEdge(B.edges[R.edge], R.s); const E = B.edges[R.edge];
    R.x = p.x; R.y = p.y + (E.kind === 'floor' ? 0 : 0); R.heading = R.dir === 1 ? p.heading : p.heading + Math.PI;
    if (R.speed > 0.05) R.facing = Math.cos(R.heading) >= 0 ? 1 : -1; else if (R.anim === Anim.Dig) R.facing = 1;
  }
  private ev(kind: SimEvent2['kind'], text: string, sev: SimEvent2['sev'], rats?: number[], x?: number, y?: number, fx?: string) { this.events.push({ seq: this.seq++, tick: this.tick, kind, text, sev, rats, x, y, fx }); }
  private god(power: string, target: { rat?: number; x?: number; y?: number; chamber?: number }, req: number) {
    const R = target.rat != null ? this.rats.find((q) => q.id === target.rat) : undefined;
    const x = R?.x ?? target.x ?? 240, y = R?.y ?? target.y ?? 90;
    let ok = true; const effects: string[] = [];
    if (power === 'smite' && R) { R.alive = false; R.anim = Anim.Dead; R.speed = 0; R.path = []; R.busy = 1e9; effects.push(`${R.name} is struck down.`); this.ev('smite', `Lightning from nowhere! ${R.name} is struck down.`, 2, [R.id], x, y, 'smite'); }
    else if (power === 'bless' && R) { R.flags |= RF.blessed; this.ev('blessed', `${R.name} glows with a strange warmth.`, 2, [R.id], x, y, 'bless'); }
    else if (power === 'curse' && R) { R.flags |= RF.cursed; this.ev('cursed', `${R.name} shivers under a curse.`, 2, [R.id], x, y, 'curse'); }
    else if (power === 'whisper' && R) this.ev('god_act', `${R.name} hears a voice in the dark.`, 1, [R.id], x, y, 'whisper');
    else if (power === 'flood') { const T = this.terrain; for (let yy = Math.floor(y) - 3; yy < y + 8; yy++) for (let xx = Math.floor(x) - 25; xx < x + 25; xx++) { const i = yy * T.W + xx; if (T.carve[i] >= PASSABLE) { T.water[i] = 255; this.dirty.add(i); } } this.ev('flood', 'Water surges through the tunnels!', 2, [], x, y, 'flood'); }
    else if (power === 'plague') this.ev('plague', 'A sickly green miasma seeps into the chamber.', 2, [], x, y, 'plague');
    else if (power === 'earthquake') { this.quake = 1; this.ev('quake', 'The earth shudders.', 2, [], x, y, 'quake'); }
    else if (power === 'cave_in') { const T = this.terrain; for (let yy = Math.floor(y) - 4; yy < y + 1; yy++) for (let xx = Math.floor(x) - 4; xx < x + 4; xx++) { const i = yy * T.W + xx; if (T.carve[i] > 0) { T.debris[i] = 255; T.stab[i] = 10; this.dirty.add(i); } } this.ev('collapse', 'The ceiling gives way!', 2, [], x, y, 'collapse'); }
    else if (power === 'raise_dead' && R) { R.alive = true; R.anim = Anim.Risen; R.busy = 20; R.flags |= RF.risen; this.ev('risen', `${R.name} rises again.`, 3, [R.id], x, y, 'raise'); }
    else if (power === 'storm') { this.weather = 'storm'; this.intensity = 1; this.wTimer = 400; this.ev('weather', 'Black clouds boil over the street.', 1, [], x, y, 'storm'); }
    else if (power === 'miracle' || power === 'harvest') this.ev('miracle', 'Crumbs rain down from the grate!', 2, [], x, y, 'miracle');
    else if (power === 'foresee') effects.push('The king will not see the winter.');
    else if (power === 'dream' && R) this.ev('omen', `${R.name} dreams of a white light.`, 1, [R.id], x, y, 'dream');
    else if (power === 'anoint_prophet' && R) { R.flags |= RF.prophet; this.ev('prophecy', `${R.name} begins to preach of you.`, 3, [R.id], x, y, 'prophet'); }
    else ok = false;
    const cost = MOCK_POWERS.find((p) => p.power === power)?.cost ?? 0; if (ok) this.grace = Math.max(0, this.grace - cost);
    this.emit({ t: 'godResult', req, ok, power: power as never, cost, grace: this.grace, effects, witnesses: 5, events: [], reason: ok ? undefined : 'Nothing answers.' });
  }
  private detail(id: number): RatDetail | null {
    const R = this.rats.find((q) => q.id === id); if (!R) return null;
    const rel = this.rats.filter((q) => q !== R).slice(0, 8).map((q, k) => ({ id: q.id, name: q.name, kinds: [['mate', 'friend', 'rival', 'kin', 'mentor', 'grudge', 'friend', 'kin'][k]], aff: [0.9, 0.6, -0.7, 0.4, 0.5, -0.4, 0.3, 0.2][k], trust: 0.5, alive: q.alive }));
    return { id, name: R.name, title: R.flags & RF.king ? 'King' : R.flags & RF.enforcer ? 'Enforcer' : R.flags & RF.priest ? 'Priest' : R.coat === 6 ? 'Escapee of the White Place' : 'Digger', sex: R.flags & RF.female ? 'F' : 'M', ageDays: 3 + id % 20, stage: R.stage, alive: R.alive,
      dynasty: { id: 1, name: 'House Gnaw' }, generation: 2, mother: 0, father: 0, children: [], role: 'digger', className: 'workers', faction: { id: R.faction, name: ['', 'Crown Loyalists', 'The Listeners', 'Tunnel Guild'][R.faction] },
      personality: { O: 0.6, C: 0.4, E: 0.5, A: 0.3, N: 0.7 }, genes: {}, needs: { hunger: 0.4, energy: 0.6, safety: 0.7, social: 0.5, status: 0.3, comfort: 0.4 }, health: 0.8, disease: null, wealth: { food: 2, scrap: 1 },
      skills: { dig: 0.7, craft: 0.3, talk: 0.5 }, beliefs: { crown: 0.2, god: 0.6, equality: -0.1, order: 0.3, kin: 0.7 }, blessings: [], curses: [], mood: 10, thought: 'The walls are wet again.', doing: Anim[R.anim].toLowerCase(),
      relations: rel, memories: [{ tick: 10, text: 'Saw a sibling taken by the cat.', valence: -0.8 }, { tick: 40, text: 'Shared a crust with Murk.', valence: 0.5 }],
      knows: ['fire', 'digging'], religion: R.flags & RF.priest ? { id: 1, name: 'The Listening' } : null, party: { id: 1, name: 'Crumbs For All' }, firm: { id: 1, name: 'Deepclaw Diggers', boss: false }, jailed: null, record: [], lastDecision: { choice: 'dig east', intuition: 0.6, facts: 0.4, why: 'smelled water' },
      story: [`${R.name} was born in the Warm Nest during the second rain, the runt of a litter of seven.`, `Trained as a digger, ${R.name} carved half of the eastern gallery and lost a sibling to the cat on the way.`, `Lately ${R.name} has been listening to the priests.`] };
  }
  private snap() {
    const n = this.rats.length; const B = this.burrow; const T = this.terrain;
    const rb: RatsBlock = { religion: new Uint16Array(n), firm: new Uint16Array(n), party: new Uint16Array(n), tool: new Uint8Array(n), n, id: new Int32Array(n), x: new Float32Array(n), y: new Float32Array(n), heading: new Float32Array(n), facing: new Int8Array(n), speed: new Float32Array(n), dist: new Float32Array(n), edge: new Int32Array(n), s: new Float32Array(n), lane: new Float32Array(n), anim: new Uint8Array(n), stage: new Uint8Array(n), carry: new Uint8Array(n), size: new Float32Array(n), coat: new Uint8Array(n), faction: new Uint16Array(n), dynasty: new Uint16Array(n), flags: new Uint32Array(n), mood: new Int8Array(n), target: new Int32Array(n) };
    this.rats.forEach((R, i) => { rb.id[i] = R.id; rb.x[i] = R.x; rb.y[i] = R.y; rb.heading[i] = R.heading; rb.facing[i] = R.facing; rb.speed[i] = R.speed; rb.dist[i] = R.dist; rb.edge[i] = R.edge; rb.s[i] = R.s; rb.anim[i] = R.alive ? R.anim : Anim.Dead; rb.stage[i] = R.stage; rb.carry[i] = R.carry; rb.size[i] = R.size; rb.coat[i] = R.coat; rb.faction[i] = R.faction; rb.flags[i] = R.flags; rb.target[i] = -1; rb.tool[i] = R.home === 5 ? 5 : R.anim === Anim.Dig ? 2 : (R.flags & RF.enforcer) ? 3 : 0; rb.religion[i] = R.flags & RF.priest ? 1 : 0; if (R.home === 5) rb.flags[i] |= RF.labrat; });
    let terrain: Snapshot2['terrain'] = null;
    if (this.dirty.size) { const idx = Uint32Array.from(this.dirty); terrain = { idx, carve: idx.map((i) => T.carve[i]) as unknown as Uint8Array, water: Uint8Array.from(idx, (i) => T.water[i]), debris: Uint8Array.from(idx, (i) => T.debris[i]), stab: Uint8Array.from(idx, (i) => T.stab[i]), moist: Uint8Array.from(idx, (i) => T.moist[i]) }; terrain.carve = Uint8Array.from(idx, (i) => T.carve[i]); this.dirty.clear(); }
    const de = B.edges[this.digEdge];
    const tod = (this.tick % DAY_TICKS) / DAY_TICKS; const hour = Math.floor(tod * 24);
    const factions: FactionInfo[] = [
      { id: 1, kind: 'royalists', name: 'Crown Loyalists', leader: 1, members: 28, color: 0xd5a063, creed: 'The Seat is sacred.', strength: 0.45, founded: 0, parent: 0, stance: { crown: 0.9, god: 0.2, equality: -0.6, order: 0.8 }, aims: 'KEEP THE KING' },
      { id: 2, kind: 'cult', name: 'The Listeners', leader: 7, members: 17, color: 0x45eaf0, creed: 'Something hears us.', strength: 0.3, founded: 40, parent: 0, stance: { crown: -0.2, god: 0.9, equality: 0.3, order: 0.1 }, aims: 'PLEASE THE VOICE' },
      { id: 3, kind: 'guild', name: 'Tunnel Guild', leader: 17, members: 25, color: 0x8fb36b, creed: 'Who digs, decides.', strength: 0.25, founded: 80, parent: 0, stance: { crown: -0.4, god: 0, equality: 0.7, order: 0.2 }, aims: 'FAIR CRUMBS' },
    ];
    const s: Snapshot2 = {
      v: 2, tick: this.tick, speed: this.speed, tickMs: this.tickMs,
      env: { tick: this.tick, day: Math.floor(this.tick / DAY_TICKS) + 1, tod, hour, season: 'autumn', seasonT: 0.3, year: 1, weather: this.weather, intensity: this.intensity, rain: this.weather === 'rain' ? this.intensity * 0.6 : this.weather === 'storm' ? this.intensity : 0, wind: Math.sin(this.tick * 0.003) * (this.weather === 'storm' ? 1 : 0.3), tempC: this.weather === 'snow' ? -2 : this.weather === 'heat' ? 34 : 14, sunlight: Math.max(0, Math.sin((tod - 0.25) * Math.PI * 2)) * (this.weather === 'storm' ? 0.35 : this.weather === 'rain' || this.weather === 'overcast' ? 0.6 : 1), lightning: this.lightning, streetActivity: 0.5, quake: this.quake },
      rats: rb, terrain, burrow: { newNodes: [], newEdges: [], newChambers: [], edgeDug: [[de.id, de.dug]], chamber: [] },
      hazards: [], corpses: [], items: [], posters: [], fields: null, events: this.events.splice(0), stats: { pop: n, adults: n - 10, pups: 10, elders: 4, births: 0, deaths: 0, food: 120, granary: 80, scrap: 30, foodPrice: 2, gini: 0.4, legitimacy: 0.6, trust: 0.5, unrest: 0.3, faith: 0.2, cohesion: 0.5, crime: 1, disease: 0.05, hunger: 0.3, classes: { court: 6, clergy: 4, guild: 20, workers: 30, poor: 8, outcasts: 2 }, unemployment: 0.12, wages: 1.4, joy: 0.55, techEra: 1, rodentoids: 0, jailed: 2, literacy: 0.1, grace: this.grace, graceMax: 200 },
      king: null, factions, prayers: [], watch: [], arcs: [], phase: 'reign', gathering: null, ...MOCK_SOCIETY,
    };
    this.emit({ t: 'snap', snap: s, inspect: this.inspectId != null ? this.detail(this.inspectId) : null });
    void hour;
  }
}
