// RAT GOD v2 HUD. Tiered events (minor → ambient feed, notable → persistent pills, MAJOR → cinematic banner + Omens inbox),
// first-launch rating & consent gate, the single opening line (no tutorial), diegetic prayer nudges, the radial god menu.
import type { FromWorker2, Snapshot2, SimEvent2, GodPowerInfo, RatDetail, Consent, GodPower, BurrowInit, GodResult, Ripple } from '../../sim/v2/contract';
import type { World2 } from '../../render/v2/world2';
import type { SimPort } from '../../main2';
import { PX } from '../../render/v2/units';
import { esc, h, clean, tierOf, cardFor, portraitUrl, loadCardList } from './util2';
import { GodMenu } from './god2';
import { Sheets } from './sheets2';

const CONSENT_KEY = 'rg2.consent.v1';
export const DEFAULT_CONSENT: Consent = { mature: false, gore: 0, sexual: false };
export function loadConsent(): (Consent & { adult: boolean }) | null { try { const c = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null'); return c && c.adult ? c : null; } catch { return null; } }
export function saveConsent(c: Consent) { localStorage.setItem(CONSENT_KEY, JSON.stringify({ ...c, adult: true, at: Date.now() })); }

export interface Omen { e: SimEvent2; read: boolean; at: number }

export class Hud2 {
  readonly el: HTMLElement; powers: GodPowerInfo[] = []; snap: Snapshot2 | null = null; detail: RatDetail | null = null; B: BurrowInit | null = null;
  consent: Consent = DEFAULT_CONSENT; names = new Map<number, string>();
  laws: { id: string; name: string; prop: string }[] = [];
  feedLog: SimEvent2[] = []; notable: SimEvent2[] = []; omens: Omen[] = []; ripples = new Map<number, Ripple>();
  private top!: HTMLElement; private pillsEl!: HTMLElement; private feedEl!: HTMLElement; private nudgeEl!: HTMLElement; private bottom!: HTMLElement; private selEl!: HTMLElement;
  private pills: { e: SimEvent2; el: HTMLElement }[] = []; private lastMajor = 0; private majorQ: SimEvent2[] = []; private cine: HTMLElement | null = null;
  readonly god: GodMenu; readonly sheets: Sheets; following = -1; private started = false; private nudgeEls = new Map<number, HTMLElement>();
  speed = 1; private lastTop = 0; blocking = false; private resume = false;
  constructor(host: HTMLElement, readonly world: World2, readonly sim: SimPort) {
    host.innerHTML = ''; this.el = h(`<div class="h2"></div>`); host.appendChild(this.el);
    this.god = new GodMenu(this); this.sheets = new Sheets(this);
    const saved = loadConsent(); if (saved) this.consent = { mature: saved.mature, gore: saved.gore, sexual: saved.sexual };
    loadCardList();
    world.cam.onTap = (sx, sy) => this.tapWorld(sx, sy);
    world.cam.onUserMove = () => { if (this.following >= 0 && !this.god.targeting) { this.following = -1; this.world.cam.follow = null; } };
  }
  start() {
    this.build();
    const go = () => {
      const q = new URLSearchParams(location.search);
      const saved = q.has('new') ? null : localStorage.getItem('rg2.burrow');
      if (saved) { this.resume = true; this.sim.send({ t: 'load', state: saved }); }
      else this.fresh();
      this.sendConsent(); this.opening();
    };
    if (loadConsent() && !new URLSearchParams(location.search).has('consent')) go(); else this.gate(go);
  }
  sendConsent() { this.sim.send({ t: 'consent', consent: this.consent }); this.world.fx.gore = this.consent.mature ? this.consent.gore : 0; this.world.actors.gore = this.world.fx.gore > 0; }
  fresh() {
    const q = new URLSearchParams(location.search);
    const scenario = q.get('scenario') === 'city' ? 'city' : 'founding';
    this.sim.send({ t: 'new', opts: { seed: Number(q.get('seed') ?? Date.now() % 100000), scenario, founders: scenario === 'city' ? 48 : 10 } });
  }
  // ───────── first launch: rating & consent ─────────
  gate(done: () => void) {
    const c = { ...this.consent };
    const g = h(`<div class="h2-gate scan" role="dialog" aria-label="Rating and content settings">
      <h1>RAT GOD</h1><div class="rating">18+</div>
      <div class="box panel rivet">
        <p class="h2-p">A living society of rats, simulated without mercy. Over time it can show:</p>
        <p class="h2-p" style="color:var(--amberL)">war and violent death · disease, famine and grief · tyranny, injustice and persecution · religion, heresy and holy war · castes and discrimination · courtship, marriage and implied mating (never explicit) · blood and gore (only if you allow it)</p>
        <p class="h2-p">Mature content starts OFF. You can change any of this later in Settings. Your choice stays on this device.</p>
        <div class="h2-tog"><span>Mature content</span><span class="seg" data-k="mature"><button class="btn" data-v="0">OFF</button><button class="btn" data-v="1">ON</button></span></div>
        <div class="h2-tog" data-dep><span>Gore</span><span class="seg" data-k="gore"><button class="btn" data-v="0">NONE</button><button class="btn" data-v="1">BLOOD</button><button class="btn" data-v="2">CARNAGE</button></span></div>
        <div class="h2-tog" data-dep><span>Sexual themes</span><span class="seg" data-k="sexual"><button class="btn" data-v="0">OFF</button><button class="btn" data-v="1">IMPLIED</button></span></div>
        <button class="btn rust" data-enter style="min-height:52px;font-size:15px">I AM 18 OR OLDER · ENTER</button>
        <button class="btn" data-leave>LEAVE</button>
      </div></div>`);
    const paint = () => { g.querySelectorAll<HTMLElement>('.seg').forEach((s) => { const k = s.dataset.k as keyof Consent; const v = Number(c[k]); s.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === v)); });
      g.querySelectorAll<HTMLElement>('[data-dep]').forEach((d) => { d.style.opacity = c.mature ? '1' : '.45'; d.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = !c.mature)); }); };
    g.querySelectorAll<HTMLElement>('.seg button').forEach((b) => b.onclick = () => { const k = (b.parentElement as HTMLElement).dataset.k!; const v = Number(b.dataset.v);
      if (k === 'mature') { c.mature = !!v; if (!v) { c.gore = 0; c.sexual = false; } } else if (k === 'gore') c.gore = v as 0 | 1 | 2; else c.sexual = !!v; paint(); });
    (g.querySelector('[data-enter]') as HTMLElement).onclick = () => { this.consent = c; saveConsent(c); g.remove(); done(); };
    (g.querySelector('[data-leave]') as HTMLElement).onclick = () => { g.innerHTML = `<p class="h2-p" style="text-align:center">The burrow stays sealed. Close this tab whenever you like.</p>`; };
    paint(); this.el.appendChild(g);
  }
  // ───────── the only opening ─────────
  opening() {
    const o = h(`<div class="h2-opening" role="dialog" aria-label="Opening"><p><span>You are their god.</span><span>You may watch everything, and act only when you choose.</span><span>tap to begin</span></p></div>`);
    let t = 0; const close = () => { if (t) return; t = 1; o.style.transition = 'opacity 1.4s'; o.style.opacity = '0'; setTimeout(() => o.remove(), 1500); this.started = true; };
    o.onclick = close; setTimeout(close, 9000); this.el.appendChild(o);
  }
  // ───────── chrome ─────────
  private build() {
    this.top = h(`<div class="h2-top"><div class="h2-stat panel" data-k="stat"><span class="clock">DAY 1</span><span class="pop">0 RATS</span>
        <span class="h2-grace" aria-label="Grace"><span class="lbl2">GRACE</span><i><b style="width:0%"></b></i></span></div>
      <button class="btn h2-iconbtn" data-k="omens" aria-label="Omens inbox">✶<span class="h2-badge hidden">0</span></button></div>`);
    this.pillsEl = h(`<div class="h2-pills"></div>`); this.feedEl = h(`<div class="h2-feed"></div>`); this.nudgeEl = h(`<div class="h2-nudges"></div>`);
    this.selEl = h(`<div class="h2-sel" style="display:none"></div>`);
    this.bottom = h(`<div class="h2-bottom"><div class="grp"><button class="btn" data-k="speed" aria-label="Speed">▶ 1×</button><button class="btn" data-k="society">CITY</button><button class="btn" data-k="ripples">RIPPLES</button><button class="btn h2-iconbtn" data-k="settings" aria-label="Settings">⚙</button></div>
      <button class="h2-god" data-k="god" aria-label="Act as god">ACT</button></div>`);
    this.el.append(this.nudgeEl, this.top, this.pillsEl, this.feedEl, this.bottom, this.selEl);
    const on = (k: string, f: () => void) => this.el.querySelectorAll<HTMLElement>(`[data-k="${k}"]`).forEach((b) => b.onclick = f);
    on('omens', () => this.sheets.omens()); on('society', () => this.sheets.society()); on('ripples', () => this.sheets.society('ripples')); on('settings', () => this.sheets.settings());
    on('god', () => this.god.open()); on('stat', () => this.sheets.society());
    on('speed', () => { const seq = [1, 2, 4, 8, 16, 0] as const; const i = seq.indexOf(this.speed as never); this.setSpeed(seq[(i + 1) % seq.length]); });
  }
  setSpeed(v: number) { this.speed = v; this.sim.send({ t: 'speed', v: v as never }); const b = this.el.querySelector<HTMLElement>('[data-k="speed"]'); if (b) b.textContent = v === 0 ? '❚❚ PAUSED' : `▶ ${v}×`; }
  // ───────── sim messages ─────────
  handle(m: FromWorker2) {
    if (m.t === 'init') { this.resume = false; this.powers = m.powers; this.B = m.burrow; this.laws = m.laws; }
    else if (m.t === 'snap') { this.snap = m.snap; if (m.inspect) { this.detail = m.inspect; this.names.set(m.inspect.id, m.inspect.name); this.sheets.refreshRat(m.inspect); }
      for (const p of m.snap.prayers) this.names.set(p.ratId, p.name);
      for (const r of m.snap.ripples ?? []) this.ripples.set(r.id, r);
      if (m.snap.king) this.names.set(m.snap.king.id, m.snap.king.name);
      for (const e of m.snap.events) this.event(e); }
    else if (m.t === 'godResult') this.godResult(m);
    else if (m.t === 'story') { this.names.set(m.id, m.detail.name); this.sheets.story(m.detail); }
    else if (m.t === 'chronicle') this.sheets.chronicle(m.data);
    else if (m.t === 'saved') { try { localStorage.setItem('rg2.burrow', m.state); } catch { /* the bottle did not fit; the burrow still runs */ } }
    else if (m.t === 'error') { console.warn('[sim]', m.msg); if (this.resume) { this.resume = false; try { localStorage.removeItem('rg2.burrow'); } catch { /* */ } this.fresh(); } }
  }
  matureHidden(e: SimEvent2) { const t = e.mature ?? []; if (!t.length) return false; if (!this.consent.mature) return true;
    if ((t.includes('gore') || t.includes('torture')) && this.consent.gore < 1) return true; if ((t.includes('sex') || t.includes('incest')) && !this.consent.sexual) return true; return false; }
  event(e: SimEvent2) {
    if (this.matureHidden(e)) return; // the sim also filters; this is the device-side guarantee
    e = { ...e, text: clean(e.text) };
    const tier = tierOf(e);
    if (tier === 'minor') return this.feed(e);
    if (tier === 'notable') { this.notable.unshift(e); this.notable.length = Math.min(this.notable.length, 120); return this.pill(e); }
    this.omens.unshift({ e, read: false, at: Date.now() }); this.omens.length = Math.min(this.omens.length, 80); this.badge();
    this.majorQ.push(e); this.pumpMajor();
  }
  // minor → ambient feed: wraps, never truncates; tap to open the full log
  private feed(e: SimEvent2) {
    this.feedLog.unshift(e); this.feedLog.length = Math.min(this.feedLog.length, 300);
    const ln = h(`<div class="ln" role="button" tabindex="0">${esc(e.text)}</div>`); ln.onclick = () => this.sheets.log();
    this.feedEl.appendChild(ln); while (this.feedEl.children.length > 3) this.feedEl.firstElementChild!.remove();
    setTimeout(() => ln.classList.add('old'), 7000); setTimeout(() => ln.remove(), 16000);
  }
  // notable → persistent pill with a portrait and "jump there"
  pill(e: SimEvent2, opts: { label?: string; god?: boolean } = {}) {
    const por = portraitUrl(this.snap?.rats, e.rats?.[0]);
    const el = h(`<div class="h2-pill panel${opts.god ? ' k-god' : ''}"><span class="por" style="background-image:url(${por})"></span>
      <span class="tx"><span class="lbl2">${esc(opts.label ?? e.kind.replace(/_/g, ' '))}</span>${esc(e.text)}</span>
      ${this.canJump(e) ? '<button class="btn go">GO</button>' : ''}<button class="btn x" aria-label="Dismiss">✕</button></div>`);
    (el.querySelector('.x') as HTMLElement).onclick = () => this.dropPill(el);
    const go = el.querySelector('.go') as HTMLElement | null; if (go) go.onclick = () => { this.jump(e); this.dropPill(el); };
    this.pills.unshift({ e, el }); this.layoutPills();
    setTimeout(() => this.dropPill(el), 45000);
  }
  private dropPill(el: HTMLElement) { const i = this.pills.findIndex((p) => p.el === el); if (i < 0) return; this.pills.splice(i, 1); el.remove(); this.layoutPills(); }
  private layoutPills() {
    this.pillsEl.innerHTML = ''; const show = this.pills.slice(0, 2); for (const p of show) this.pillsEl.appendChild(p.el);
    if (this.pills.length > 2) { const m = h(`<button class="btn h2-more">+${this.pills.length - 2} MORE</button>`); m.onclick = () => this.sheets.omens('notable'); this.pillsEl.appendChild(m); }
    this.pillsEl.querySelectorAll('*').forEach((n) => ((n as HTMLElement).style.pointerEvents = 'auto'));
  }
  canJump(e: SimEvent2) { return (e.rats?.length ?? 0) > 0 || e.x != null; }
  jump(e: SimEvent2, z = 2.2) {
    const id = e.rats?.[0]; const p = id != null ? this.world.actors.posOf(id) : null;
    if (id != null && p) { this.followRat(id, z); return; }
    if (e.x != null && e.y != null) { this.following = -1; this.world.cam.follow = null; this.world.cam.flyTo(e.x * PX, e.y * PX, z); }
  }
  followRat(id: number, z = 2.4) { this.following = id; const a = this.world.actors; a.selected = id; this.world.cam.follow = () => a.posOf(id); const p = a.posOf(id); if (p) this.world.cam.flyTo(p.x, p.y, Math.max(this.world.cam.z, z)); this.sim.send({ t: 'inspect', id }); }
  // MAJOR → cinematic: time-slow, camera cut, art card, stinger; kept in the Omens inbox until read
  private pumpMajor() {
    if (this.cine || !this.majorQ.length || !this.started) return; const now = performance.now(); if (now - this.lastMajor < 6000) { setTimeout(() => this.pumpMajor(), 6000 - (now - this.lastMajor)); return; }
    const e = this.majorQ.shift()!; this.lastMajor = now; this.cinematic(e);
  }
  cinematic(e: SimEvent2) {
    this.sheets.close(); this.god.close(); this.god.cancel();
    const art = cardFor(e); this.world.slow(4000, 0.15); if (this.canJump(e)) this.jump(e, 1.8);
    window.dispatchEvent(new CustomEvent('rg:stinger', { detail: { kind: e.kind, sfx: e.sfx, score: e.score } }));
    const c = h(`<div class="h2-cine" role="dialog" aria-label="Major event"><div class="card panel rivet scan">
      ${art ? `<div class="art" style="background-image:url(${art})"></div>` : ''}<span class="lbl2">${esc(e.kind.replace(/_/g, ' '))} · day ${Math.floor(e.tick / 960) + 1}</span>
      <h2>${esc(e.text)}</h2><div class="row">${this.canJump(e) ? '<button class="btn rust" data-a="watch">WATCH</button>' : ''}<button class="btn" data-a="later">LATER</button></div></div></div>`);
    const om = this.omens.find((o) => o.e === e || o.e.seq === e.seq);
    this.blocking = true; this.el.classList.add('modal');
    const close = (read: boolean) => { if (!this.cine) return; this.cine = null; this.blocking = false; this.el.classList.remove('modal'); c.remove(); if (om && read) om.read = true; this.badge(); setTimeout(() => this.pumpMajor(), 400); };
    c.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => b.onclick = () => { if (b.dataset.a === 'watch') { this.jump(e, 2.4); close(true); } else close(false); });
    this.cine = c; this.el.appendChild(c); setTimeout(() => close(false), 14000);
  }
  badge() { const n = this.omens.filter((o) => !o.read).length; const b = this.el.querySelector<HTMLElement>('.h2-badge'); if (b) { b.textContent = String(n); b.classList.toggle('hidden', n === 0); } }
  // ───────── god results ─────────
  private godResult(r: GodResult) {
    const info = this.powers.find((p) => p.power === r.power);
    const text = r.ok ? (r.effects.map(clean).join(' · ') || `${info?.label ?? r.power} is done.`) + (r.witnesses ? ` · ${r.witnesses} saw it.` : '') : clean(r.reason ?? 'Nothing answers.');
    this.pill({ seq: -1, tick: this.snap?.tick ?? 0, kind: 'god_act', text, sev: 1 } as SimEvent2, { label: `${info?.label ?? r.power} · grace ${Math.round(r.grace)}`, god: true });
    if (r.forecast) this.sheets.forecast(r.forecast);
  }
  // ───────── world taps ─────────
  private tapWorld(sx: number, sy: number) {
    const w = this.world.cam.s2w(sx, sy);
    const slack = 52 / Math.max(0.35, this.world.cam.z);
    if (this.god.targeting) { this.god.pick(w.x, w.y, this.world.actors.pickAt(w.x, w.y, slack)); return; }
    if (this.blocking) return;
    const id = this.world.actors.pickAt(w.x, w.y, slack);
    if (id >= 0) { this.followRat(id); this.sheets.rat(id); } else if (this.following >= 0 || this.world.actors.selected >= 0) { this.following = -1; this.world.cam.follow = null; this.world.actors.selected = -1; this.sim.send({ t: 'inspect', id: null }); this.sheets.close(); }
  }
  chamberAt(wx: number, wy: number) { if (!this.B) return null; let best = null as null | (typeof this.B.chambers)[number], bd = 1e9;
    for (const c of this.B.chambers) { const dx = (wx / PX - c.cx) / Math.max(1, c.rx), dy = (wy / PX - c.cy) / Math.max(1, c.ry); const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = c; } } return bd < 2.5 ? best : null; }
  name(id: number) { return this.names.get(id) ?? `rat #${id}`; }
  // ───────── per-frame ─────────
  frame() {
    const s = this.snap; if (!s) return; const now = performance.now();
    if (now - this.lastTop > 250) { this.lastTop = now; const env = s.env, st = s.stats;
      const clock = this.top.querySelector('.clock')!, pop = this.top.querySelector('.pop')!, g = this.top.querySelector<HTMLElement>('.h2-grace b')!;
      const hh = String(env.hour).padStart(2, '0'); clock.textContent = `DAY ${env.day + 1} · ${hh}:00 · ${env.weather.toUpperCase()}`; pop.textContent = `${st.pop} RATS`;
      g.style.width = `${Math.round((st.grace / Math.max(1, st.graceMax)) * 100)}%`; }
    this.nudges(s);
    this.tagSelected();
  }
  /** gold name over the marked rat. The ring lives on the sprite; this is the readable label. */
  private tagSelected() {
    const id = this.world.actors.selected;
    if (id < 0) { this.selEl.style.display = 'none'; return; }
    const p = this.world.actors.posOf(id);
    if (!p) { this.selEl.style.display = 'none'; return; }
    const sp = this.world.cam.w2s(p.x, p.y - 22);
    this.selEl.style.display = 'block';
    this.selEl.style.left = `${sp.x}px`;
    this.selEl.style.top = `${sp.y}px`;
    this.selEl.textContent = this.name(id);
  }
  /** diegetic prayer nudges: a small glyph over a praying rat; tap it to hear the plea and see the power it hints at */
  private nudges(s: Snapshot2) {
    const cam = this.world.cam; const live = new Set<number>(); const zd = cam.z;
    if (zd > 0.7 && !this.god.targeting) for (const p of s.prayers.slice(0, 4)) { if (!p.suggest) continue; const pos = this.world.actors.posOf(p.ratId); if (!pos) continue;
      const sp = cam.w2s(pos.x, pos.y - 22); if (sp.x < 20 || sp.y < 70 || sp.x > cam.vw - 20 || sp.y > cam.vh - 90) continue; live.add(p.ratId);
      let el = this.nudgeEls.get(p.ratId);
      if (!el) { el = h(`<button class="h2-nudge" aria-label="A prayer">✧</button>`); const pr = p; el.onclick = (ev) => { ev.stopPropagation(); this.prayerCard(pr); }; this.nudgeEl.appendChild(el); this.nudgeEls.set(p.ratId, el); }
      el.style.left = `${sp.x}px`; el.style.top = `${sp.y}px`; }
    for (const [id, el] of this.nudgeEls) if (!live.has(id)) { el.remove(); this.nudgeEls.delete(id); }
  }
  private prayerCard(p: Snapshot2['prayers'][number]) {
    const info = this.powers.find((x) => x.power === p.suggest);
    this.sheets.open(`${esc(p.name)} PRAYS`, `<p class="h2-p">“${esc(clean(p.plea))}”</p>
      ${info ? `<p class="h2-p" style="color:var(--grey)">You sense what would answer it: <b style="color:var(--amberL)">${esc(info.label)}</b> — ${esc(info.blurb)}</p>` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap">${info ? `<button class="btn rust" data-answer>${esc(info.label)} · ${info.cost} GRACE</button>` : ''}<button class="btn" data-watch>WATCH ${esc(p.name)}</button><button class="btn" data-ignore>LET IT BE</button></div>`, (root) => {
      root.querySelector<HTMLElement>('[data-answer]')?.addEventListener('click', () => { this.sheets.close(); this.god.begin(p.suggest as GodPower, { rat: p.ratId, x: p.x, y: p.y }); });
      root.querySelector<HTMLElement>('[data-watch]')?.addEventListener('click', () => { this.sheets.close(); this.followRat(p.ratId); });
      root.querySelector<HTMLElement>('[data-ignore]')?.addEventListener('click', () => this.sheets.close()); });
  }
}
