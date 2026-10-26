// Copies approved art into public/: Sogni final assets (if the asset agent has produced index.json)
// and the approved pixel-test sprites as the first fallback. Writes reports/missing_assets.{json,md}.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FINAL = join(ROOT, 'assets/final');
const PT = join(ROOT, 'pixel_test/native');
const out = 'public/assets';
mkdirSync(join(out, 'pixel_test'), { recursive: true });
for (const f of ['worker_z_48.png', 'worker_q_48.png', 'king.png', 'pup.png', 'corpse.png', 'enforcer.png', 'throne_bg.png', 'street_bg.png', 'bust.png', 'law_button.png', 'law_panel.png'])
  if (existsSync(join(PT, f))) cpSync(join(PT, f), join(out, 'pixel_test', f));
const countFiles = (d) => existsSync(d) ? readdirSync(d).reduce((a, f) => { const p = join(d, f); return a + (statSync(p).isDirectory() ? countFiles(p) : 1); }, 0) : 0;
let index = null;
if (existsSync(join(FINAL, 'index.json'))) {
  try { index = JSON.parse(readFileSync(join(FINAL, 'index.json'), 'utf8')); } catch (e) { console.warn('index.json unreadable:', e.message); }
}
if (existsSync(join(out, 'final'))) rmSync(join(out, 'final'), { recursive: true });
// copy everything except the raw combined sheets (the game uses the per-animation strips)
if (index) { cpSync(FINAL, join(out, 'final'), { recursive: true, filter: (src) => !src.includes('/sheets') && !src.endsWith('.wav') }); console.log('synced final assets'); }
// PWA / favicon icons from the final 64px app icon, upscaled nearest-neighbour (integer factors only)
const ICON = join(FINAL, 'ui/pwa_icon.png');
if (existsSync(ICON)) {
  const { execFileSync } = await import('node:child_process');
  mkdirSync('public/icons', { recursive: true });
  const py = `
from PIL import Image
src = Image.open(${JSON.stringify(ICON)}).convert('RGBA')
def up(n, f): return src.resize((64*f, 64*f), Image.NEAREST)
def fit(size, pad=0):
    f = max(1, (size - 2*pad) // 64); im = up(64, f)
    bg = Image.new('RGBA', (size, size), (8, 13, 10, 255)); bg.alpha_composite(im, ((size-im.width)//2, (size-im.height)//2)); return bg
fit(192).save('public/icons/icon-192.png'); fit(512).save('public/icons/icon-512.png')
fit(192, 32).save('public/icons/maskable-192.png'); fit(180).save('public/icons/apple-touch-icon.png'); fit(64).save('public/favicon.png')
`;
  try { execFileSync('python3', ['-c', py]); console.log('icons from pwa_icon'); } catch (e) { console.warn('icon build failed:', e.message); }
}
const manifest = JSON.parse(readFileSync(join(ROOT, 'asset_manifest.json'), 'utf8')).assets;
const have = new Set();
if (index) {
  const list = Array.isArray(index) ? index : Array.isArray(index.assets) ? index.assets : Object.entries(index.assets ?? index).map(([id, v]) => ({ id, ...(typeof v === 'string' ? { file: v } : v) }));
  for (const a of list) if (a && a.id && (!a.status || a.status === 'done')) have.add(a.id); // retry/failed entries are not final
}
// ids for which the game ships a pixel-test fallback
const PT_FALLBACK_OLD = { worker_idle: 'worker_z_48', worker_walk: 'worker_z_48', worker_haul: 'worker_z_48', worker_dig: 'worker_z_48', worker_work_wheel: 'worker_z_48', worker_work_gnaw: 'worker_z_48', worker_sleep: 'worker_z_48', worker_eat: 'worker_z_48', founder_idle: 'worker_q_48', founder_walk: 'worker_q_48', king_idle_throne: 'king', king_press_law: 'king', king_feast: 'king', king_eat_scraps: 'king', king_sick: 'king', king_starving: 'king', king_die: 'corpse', pup_idle: 'pup', pup_walk: 'pup', pup_suckle: 'pup', pup_play: 'pup', enforcer_idle: 'enforcer', enforcer_patrol: 'enforcer', prop_corpse_fresh: 'corpse', prop_corpse_bloated: 'corpse', worker_die: 'corpse', bg_throne_hall: 'throne_bg', bg_surface_street: 'street_bg', portrait_king_talk: 'bust', ui_law_button: 'law_button', ui_law_board_frame: 'law_panel', herald_walk: 'worker_q_48', herald_paste_poster: 'worker_q_48', elder_walk_limp: 'worker_z_48', elder_idle_cough: 'worker_z_48', outcast_idle: 'worker_q_48', outcast_beg: 'worker_q_48' };
const PT_FALLBACK = {}; // every character, room and UI id now ships as final art; anything missing falls to a palette silhouette
const rows = manifest.map((a) => ({ id: a.id, category: a.category, kind: a.kind, final: have.has(a.id), fallback: have.has(a.id) ? 'final' : PT_FALLBACK[a.id] ? `pixel_test/${PT_FALLBACK[a.id]}.png` : a.kind === 'sfx' || a.kind === 'music' || a.kind === 'ambience' || /^(sfx|music|amb)_/.test(a.id) ? 'procedural WebAudio' : a.id.startsWith('fx_dust_motes') || a.id.startsWith('dust_motes') ? 'not shown (cut)' : 'palette silhouette / procedural' }));
mkdirSync('reports', { recursive: true });
writeFileSync('reports/missing_assets.json', JSON.stringify({ finalDirFiles: countFiles(FINAL), indexJson: !!index, total: rows.length, final: rows.filter((r) => r.final).length, rows }, null, 1));
const md = ['# Asset status', '', `Final Sogni assets: ${rows.filter((r) => r.final).length}/${rows.length} (index.json ${index ? 'found' : 'NOT found'}; files in assets/final: ${countFiles(FINAL)})`, '', '| id | category | in game as |', '|---|---|---|', ...rows.filter((r) => !r.final).map((r) => `| ${r.id} | ${r.category} | ${r.fallback} |`)];
writeFileSync('reports/missing_assets.md', md.join('\n'));
console.log(`assets: final ${rows.filter((r) => r.final).length}/${rows.length}, pixel-test fallbacks ${rows.filter((r) => !r.final && r.fallback.startsWith('pixel_test')).length}`);
