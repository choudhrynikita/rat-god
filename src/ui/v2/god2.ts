// Radial god menu: groups → powers → parameters → targeting → command. Every option is a ≥60×84 touch target.
import type { GodPower, GodPowerInfo, GodTarget, GodParams } from '../../sim/v2/contract';
import { PX } from '../../render/v2/units';
import { esc, h } from './util2';
import type { Hud2 } from './hud2';

const GROUPS: { id: GodPowerInfo['group']; label: string }[] = [
  { id: 'elevation', label: 'RAISE & CHASTEN' }, { id: 'influence', label: 'MINDS' }, { id: 'nature', label: 'NATURE' }, { id: 'fate', label: 'FATE' }, { id: 'creation', label: 'LIFE & DEATH' }];
type Opt = { v: unknown; label: string };
const PARAM_OPTS: Partial<Record<keyof GodParams, { title: string; opts: Opt[] }>> = {
  gift: { title: 'WHICH GIFT?', opts: ['genius', 'charisma', 'strength', 'longevity', 'prophecy', 'fertility', 'health'].map((v) => ({ v, label: v.toUpperCase() })) },
  curse: { title: 'WHICH CURSE?', opts: ['plague', 'barren', 'misfortune', 'madness', 'weakness'].map((v) => ({ v, label: v.toUpperCase() })) },
  punishment: { title: 'HOW TO PUNISH?', opts: [{ v: 'pain', label: 'PAIN' }, { v: 'humble', label: 'HUMBLE' }, { v: 'blight', label: 'BLIGHT HIS STORES' }, { v: 'strip', label: 'STRIP HIS CROWN' }, { v: 'nightmare', label: 'NIGHTMARES' }] },
  dream: { title: 'WHAT DREAM?', opts: ['omen', 'vision', 'nightmare', 'prophecy', 'memory'].map((v) => ({ v, label: v.toUpperCase() })) },
  feeling: { title: 'WHAT FEELING?', opts: ['love', 'hatred', 'friendship', 'rivalry'].map((v) => ({ v, label: v.toUpperCase() })) },
  claim: { title: 'WHAT RUMOUR?', opts: ['thief', 'traitor', 'heretic', 'blessed', 'poisoner', 'cheat', 'hoarder', 'kind', 'murderer', 'plotting'].map((v) => ({ v, label: v.toUpperCase() })) },
  predator: { title: 'WHICH HUNTER?', opts: [{ v: 'cat', label: 'CAT' }, { v: 'snake', label: 'SNAKE' }, { v: 'exterminator', label: 'GAS DRONE' }, { v: 'poison_bait', label: 'POISON BAIT' }] },
  miracle: { title: 'WHICH MIRACLE?', opts: ['feed', 'heal', 'calm', 'light', 'fertile'].map((v) => ({ v, label: v.toUpperCase() })) },
  query: { title: 'FORESEE WHAT?', opts: [{ v: 'city', label: 'THE CITY' }, { v: 'king', label: 'THE KING' }, { v: 'rat', label: 'ONE RAT' }, { v: 'faction', label: 'A FACTION' }] },
  magnitude: { title: 'HOW STRONG?', opts: [{ v: 0.3, label: 'A WARNING' }, { v: 0.6, label: 'STRONG' }, { v: 1, label: 'WRATHFUL' }] },
  days: { title: 'HOW LONG?', opts: [{ v: 1, label: '1 DAY' }, { v: 3, label: '3 DAYS' }, { v: 7, label: '7 DAYS' }] },
  horizonDays: { title: 'HOW FAR AHEAD?', opts: [{ v: 3, label: '3 DAYS' }, { v: 10, label: '10 DAYS' }, { v: 30, label: '30 DAYS' }] },
  about: { title: 'ABOUT WHOM?', opts: [{ v: 'king', label: 'THE KING' }, { v: 'god', label: 'THEIR GOD' }] },
  idea: { title: 'WHICH THOUGHT?', opts: [
    { v: { kind: 'desire', what: 'worship' }, label: 'WORSHIP ME' }, { v: { kind: 'desire', what: 'share' }, label: 'SHARE' }, { v: { kind: 'desire', what: 'rebel' }, label: 'REBEL' },
    { v: { kind: 'desire', what: 'reform' }, label: 'REFORM' }, { v: { kind: 'desire', what: 'dig' }, label: 'DIG' }, { v: { kind: 'desire', what: 'leave' }, label: 'LEAVE' },
    { v: { kind: 'belief', axis: 'crown', dir: -1 }, label: 'DOUBT THE CROWN' }, { v: { kind: 'belief', axis: 'equality', dir: 1 }, label: 'ALL ARE EQUAL' }, { v: { kind: 'belief', axis: 'god', dir: 1 }, label: 'BELIEVE' }] },
};
const NEEDS_LABEL: Partial<Record<keyof GodTarget, string>> = { rat: 'TAP A RAT', rat2: 'NOW TAP A SECOND RAT', chamber: 'TAP A CHAMBER', x: 'TAP A PLACE', dynasty: 'TAP ANY RAT OF THAT HOUSE', corpse: 'TAP NEAR A BODY', faction: 'TAP A MEMBER OF THE FACTION' };

export class GodMenu {
  private el: HTMLElement | null = null; targeting: { info: GodPowerInfo; target: GodTarget; params: GodParams; need: (keyof GodTarget)[]; bar: HTMLElement } | null = null;
  private req = 1;
  constructor(private hud: Hud2) {}
  close() { this.el?.remove(); this.el = null; }
  open(preset: GodTarget = {}) {
    this.close(); const hud = this.hud; const vw = hud.world.cam.vw, vh = hud.world.cam.vh; const cx = vw / 2, cy = Math.min(vh * 0.48, vh - 260);
    const root = h(`<div class="h2-radial" role="dialog" aria-label="God powers"></div>`); this.el = root;
    const grace = hud.snap?.stats.grace ?? 0;
    const info = h(`<div class="info panel"><div class="lbl2">GRACE ${Math.round(grace)} / ${Math.round(hud.snap?.stats.graceMax ?? 0)}</div><div class="body" data-blurb>Choose how to act. Or close, and only watch.</div></div>`);
    const ring = (opts: { label: string; sub?: string; dis?: boolean; on: () => void; blurb?: string }[], back?: () => void) => {
      root.querySelectorAll('.opt,.hub').forEach((n) => n.remove());
      const R = Math.min(vw, vh) * 0.36; const n = opts.length;
      opts.forEach((o, i) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; const b = h(`<button class="word opt${o.dis ? ' dis' : ''}">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`);
        b.style.left = `${cx + Math.cos(a) * R}px`; b.style.top = `${cy + Math.sin(a) * R * 0.92}px`; b.onclick = (ev) => { ev.stopPropagation(); o.on(); };
        b.onpointerenter = () => { if (o.blurb) (info.querySelector('[data-blurb]') as HTMLElement).textContent = o.blurb; }; root.appendChild(b); });
      const hub = h(`<button class="h2-god hub" aria-label="${back ? 'Back' : 'Close'}">${back ? 'back' : 'watch'}</button>`); hub.style.left = `${cx}px`; hub.style.top = `${cy}px`;
      hub.onclick = (ev) => { ev.stopPropagation(); back ? back() : this.close(); }; root.appendChild(hub);
    };
    const fits = (p: GodPowerInfo) => !preset.rat || p.target.length === 0 || p.target.includes('rat') || p.target.includes('dynasty') || p.target.includes('x');
    const groups = () => ring(GROUPS.filter((g) => hud.powers.some((p) => p.group === g.id && fits(p))).map((g) => ({ label: g.label, on: () => powers(g.id), blurb: hud.powers.filter((p) => p.group === g.id).map((p) => p.label).join(' · ') })));
    const powers = (gid: string) => ring(hud.powers.filter((p) => p.group === gid && fits(p)).map((p) => ({ label: p.label, sub: `${p.cost} grace`, dis: p.cost > grace,
      blurb: p.blurb, on: () => { (info.querySelector('[data-blurb]') as HTMLElement).textContent = p.blurb; if (p.cost > grace) return; this.close(); this.begin(p.power, preset); } })), groups);
    root.onclick = () => this.close(); root.appendChild(info); groups(); hud.el.appendChild(root);
  }
  /** start a power: ask its parameters, then targets (preset ones are reused) */
  begin(power: GodPower, preset: GodTarget = {}) {
    const info = this.hud.powers.find((p) => p.power === power); if (!info) return;
    const params: GodParams = {}; const queue = info.params.filter((k) => PARAM_OPTS[k]);
    const nextParam = () => {
      const k = queue.shift(); if (!k) return this.targets(info, preset, params);
      const spec = PARAM_OPTS[k]!; this.hud.sheets.open(`${info.label}: ${spec.title}`, `<p class="h2-p" style="color:var(--grey)">${esc(info.blurb)}</p><div style="display:flex;flex-wrap:wrap;gap:6px">${spec.opts.map((o, i) => `<button class="word" data-i="${i}">${esc(o.label)}</button>`).join('')}</div>`, (root) => {
        root.querySelectorAll<HTMLElement>('[data-i]').forEach((b) => b.onclick = () => { (params as Record<string, unknown>)[k] = spec.opts[Number(b.dataset.i)].v; this.hud.sheets.close(); nextParam(); }); });
    };
    nextParam();
  }
  private targets(info: GodPowerInfo, preset: GodTarget, params: GodParams) {
    const target: GodTarget = {}; const need: (keyof GodTarget)[] = [];
    for (const k of info.target) { if (k === 'y') continue; if (k === 'rat' && preset.rat != null) target.rat = preset.rat; else if (k === 'x' && preset.x != null) { target.x = preset.x; target.y = preset.y; } else need.push(k); }
    if (info.power === 'punish' && need.includes('rat') && this.hud.snap?.king) { /* default target the king, but let the player tap another rat */ }
    if (!need.length) return this.fire(info, target, params);
    const bar = h(`<div class="h2-target"><span class="body"></span><button class="word red">never mind</button></div>`);
    (bar.querySelector('button') as HTMLElement).onclick = () => this.cancel();
    if (info.power === 'punish' && this.hud.snap?.king) { const kb = h(`<button class="word rust">the king</button>`); kb.onclick = () => { target.rat = this.hud.snap!.king!.id; this.hud.world.actors.selected = target.rat; this.targeting!.need = this.targeting!.need.filter((n) => n !== 'rat'); this.advance(); }; bar.insertBefore(kb, bar.lastElementChild); }
    const held = this.hud.following >= 0 ? this.hud.following : this.hud.world.actors.selected;
    if (held >= 0 && need.some((k) => k === 'rat' || k === 'dynasty' || k === 'faction')) {
      const tb = h(`<button class="word rust">this one</button>`);
      tb.onclick = () => this.pick(0, 0, held);
      bar.insertBefore(tb, bar.lastElementChild);
    }
    this.hud.el.appendChild(bar); this.targeting = { info, target, params, need, bar }; this.advance();
  }
  private advance() { const t = this.targeting!; if (!t.need.length) { this.cancel(); this.fire(t.info, t.target, t.params); return; }
    (t.bar.querySelector('.body') as HTMLElement).textContent = `${t.info.label}: ${NEEDS_LABEL[t.need[0]] ?? 'TAP THE WORLD'}`; }
  pick(wx: number, wy: number, ratId: number) {
    const t = this.targeting; if (!t) return; const k = t.need[0]; const snap = this.hud.snap;
    const ratIdx = (id: number) => { if (!snap) return -1; for (let i = 0; i < snap.rats.n; i++) if (snap.rats.id[i] === id) return i; return -1; };
    if (k === 'rat' || k === 'rat2') { if (ratId < 0) return this.flashBar(); t.target[k] = ratId; this.hud.world.actors.selected = ratId; }
    else if (k === 'dynasty') { const i = ratIdx(ratId); if (i < 0) return this.flashBar(); t.target.dynasty = snap!.rats.dynasty[i]; this.hud.world.actors.selected = ratId; }
    else if (k === 'faction') { const i = ratIdx(ratId); if (i < 0 || !snap!.rats.faction[i]) return this.flashBar(); t.target.faction = snap!.rats.faction[i]; this.hud.world.actors.selected = ratId; }
    else if (k === 'chamber') { const c = this.hud.chamberAt(wx, wy); if (!c) return this.flashBar(); t.target.chamber = c.id; }
    else if (k === 'corpse') { const c = snap?.corpses.reduce((b, c) => { const d = Math.hypot(c.x * PX - wx, c.y * PX - wy); return d < b.d ? { d, id: c.id } : b; }, { d: 80, id: -1 }); if (!c || c.id < 0) return this.flashBar(); t.target.corpse = c.id; }
    else { t.target.x = wx / PX; t.target.y = wy / PX; }
    t.need.shift(); this.advance();
  }
  private flashBar() { const b = this.targeting?.bar; if (!b) return; b.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 220 }); }
  cancel() { this.targeting?.bar.remove(); this.targeting = null; }
  private fire(info: GodPowerInfo, target: GodTarget, params: GodParams) {
    const hud = this.hud; hud.sim.send({ t: 'god', req: this.req++, power: info.power, target, params });
    // local anticipation VFX at the target (the sim's events will add the consequence effects)
    let x = target.x != null ? target.x * PX : NaN, y = target.y != null ? target.y * PX : NaN;
    const rid = target.rat ?? -1; if (rid >= 0) { const p = hud.world.actors.posOf(rid); if (p) { x = p.x; y = p.y; } }
    if (target.chamber != null && hud.B) { const c = hud.B.chambers.find((c) => c.id === target.chamber); if (c) { x = c.cx * PX; y = c.cy * PX; } }
    if (isFinite(x)) { const fx: Record<string, string> = { smite: 'smite', bless: 'bless', curse: 'curse', punish: 'punish', whisper: 'whisper', dream: 'dream', inspire: 'whisper', sow_rumour: 'whisper', anoint_prophet: 'bless', raise_dead: 'raise_dead', flood: 'flood', cave_in: 'cave_in', plague: 'plague', earthquake: 'earthquake', harvest: 'harvest', fire: 'fire', miracle: 'miracle', foresee: 'foresee', storm: 'lightning', wipe_dynasty: 'smite', seed_founder: 'bless', famine: 'curse', drought: 'fire' };
      hud.world.fx.play(fx[info.power] ?? 'miracle', x, y); if (rid < 0) hud.world.cam.flyTo(x, y, Math.max(hud.world.cam.z, 1.2)); }
  }
}
