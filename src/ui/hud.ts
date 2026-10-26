// Observer HUD. The god may only watch: every control here is camera, time, inspection or meta.
import type { Snapshot, RatInfo } from '../sim/sim';
import type { Chronicle, Speed } from '../net/protocol';
import { LAWS, LAW_BY_ID } from '../sim/laws';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pct = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 100);
/** final art served from public/assets/final */
const A = (p: string) => 'assets/final/' + p;
export const PORTRAIT: Record<string, string> = { king: 'king', king_starving: 'king_starving', new_king: 'new_king', founder: 'founder', worker_m: 'worker_m', worker_f: 'worker_f', elder: 'elder', enforcer: 'enforcer', outcast: 'outcast', prophet: 'prophet' };
/** a 6-frame talking portrait (96×96 frames) animated with CSS steps() — integer scale only */
export const portrait = (who: string, scale = 1, still = false) => `<span class="pt${still ? ' still' : ''}" role="img" aria-label="" style="--s:${scale};background-image:url(${A(`portraits/portrait_${PORTRAIT[who] ?? 'worker_m'}_talk.png`)})"></span>`;
const ICON = (n: string) => `<img class="ico" src="${A(`ui/icon_${n}.png`)}" alt="">`;
export const card = (id: string, cls = '') => `<img class="card ${cls}" src="${A(`backgrounds/event_${id}.png`)}" alt="">`;
/** which event card illustrates a sim event (null = no card) */
const CARD_FOR: Record<string, string> = { founding: 'founding', famine: 'famine', feast_famine: 'famine', plague: 'plague', gas: 'extermination', gather: 'vote', executed: 'execution', king_died: 'king_dies_alone', crowned: 'succession', exile: 'exodus', prophet: 'exodus', suppressed: 'riot', purge: 'riot', city_dead: 'collapse' };
/** these open a full modal with their card, so no toast */
const MODAL_KINDS = new Set(['executed', 'king_died', 'crowned', 'city_dead']);
const PHASE: Record<string, string> = { founding: 'FOUNDING', reign: 'REIGN', interregnum: 'NO KING', gathering: 'THE VOTE', dead: 'SILENCE' };

export interface HudEvents {
  speed(v: Speed): void; inspect(id: number | null): void; follow(id: number | null): void; focusKing(): void; focusPlaza(): void;
  chronicle(): void; newGame(): void; continueGame(): void; gore(on: boolean): void; sound(on: boolean): void; music(on: boolean): void; ui(): void;
}

export class Hud {
  root: HTMLElement; ev: HudEvents;
  snap: Snapshot | null = null; info: RatInfo | null = null; speed: Speed = 1;
  following: number | null = null; boardOpen = false; lastSeq = 0; modalOpen = false;
  plateHist: number[] = [];
  constructor(root: HTMLElement, ev: HudEvents) {
    this.root = root; this.ev = ev;
    root.innerHTML = `
      <div id="top" class="hidden">
        <div id="statrow">
          <div id="stats" class="panel rivet scan"></div>
          <button id="menu" class="btn" aria-label="Settings">&#9776;</button>
        </div>
        <button id="kingchip" class="panel" aria-label="Watch the king's board"></button>
        <div id="objective" class="panel hidden"></div>
        <div id="herald" class="panel hidden"></div>
        <div id="banner" class="hidden"></div>
      </div>
      <div id="ticker" class="hidden"></div>
      <div id="vote" class="panel rivet hidden"></div>
      <div id="card" class="hidden" aria-live="polite"></div>
      <div id="inspect" class="sheet panel rivet hidden"></div>
      <div id="bottom" class="hidden">
        <div class="grp" role="group" aria-label="Time">
          <button class="btn spd" data-v="0" aria-label="Pause">II</button>
          <button class="btn spd" data-v="1">1&times;</button>
          <button class="btn spd" data-v="2">2&times;</button>
          <button class="btn spd" data-v="4">4&times;</button>
        </div>
        <div class="grp">
          <button id="bKing" class="btn rust" aria-label="Watch the king">KING</button>
          <button id="bBook" class="btn" aria-label="Chronicle">BOOK</button>
        </div>
      </div>
      <div id="board" class="modal-wrap hidden"><div class="modal panel rivet"></div></div>
      <div id="modal" class="modal-wrap hidden"><div class="modal panel rivet"></div></div>
      <div id="title" class="hidden"></div>
      <div id="desk" class="hidden"></div>`;
    root.querySelectorAll<HTMLButtonElement>('.spd').forEach((b) => b.addEventListener('click', () => { this.ev.ui(); this.ev.speed(+b.dataset.v! as Speed); }));
    $('#bKing').addEventListener('click', () => { this.ev.ui(); this.openBoard(); });
    $('#kingchip').addEventListener('click', () => { this.ev.ui(); this.openBoard(); });
    $('#bBook').addEventListener('click', () => { this.ev.ui(); this.ev.chronicle(); });
    $('#menu').addEventListener('click', () => { this.ev.ui(); this.openSettings(); });
    $('#board').addEventListener('click', (e) => { if (e.target === $('#board')) this.closeBoard(); });
  }

  showGame(on: boolean) { for (const id of ['#top', '#ticker', '#bottom']) $(id).classList.toggle('hidden', !on); }

  // ---------- title & desktop gate ----------
  showTitle(hasSave: { day: number } | null) {
    const t = $('#title'); t.classList.remove('hidden'); this.showGame(false); t.style.backgroundImage = `linear-gradient(rgba(8,13,10,.15), rgba(8,13,10,.35) 45%, rgba(8,13,10,.92) 80%), url(${A('backgrounds/title_key_art.png')})`;
    t.innerHTML = `
      <img class="icon" src="${A('ui/pwa_icon.png')}" alt="">
      <h1 class="disp"><img class="wordmark" src="${A('ui/wordmark.png')}" alt="RAT GOD"></h1>
      <div class="sub">A city of rats beneath the neon. A king who presses buttons. You are their god. You may only watch.</div>
      <div class="btns">
        ${hasSave ? `<button id="tCont" class="btn rust">CONTINUE &middot; DAY ${hasSave.day}</button>` : ''}
        <button id="tNew" class="btn ${hasSave ? '' : 'rust'}">BEGIN AN EXPERIMENT</button>
      </div>
      <div class="fine">Pan, pinch, tap a rat to read its mind. Rotate nothing. Interfere with nothing.</div>`;
    $('#tNew', t).addEventListener('click', () => {
      this.ev.ui();
      if (hasSave) this.confirm('BEGIN AGAIN?', 'The current experiment will be erased. Its dynasty will be forgotten.', 'ERASE AND BEGIN', () => { this.hideTitle(); this.ev.newGame(); });
      else { this.hideTitle(); this.ev.newGame(); }
    });
    $('#tCont', t)?.addEventListener('click', () => { this.ev.ui(); this.hideTitle(); this.ev.continueGame(); });
  }
  hideTitle() { $('#title').classList.add('hidden'); this.showGame(true); }
  async showDesktop(url: string, playAnyway: () => void) {
    const d = $('#desk'); d.classList.remove('hidden');
    d.innerHTML = `<div class="modal panel rivet scan"><h2>RAT GOD LIVES ON PHONES</h2><div class="note" style="color:var(--bone)">This experiment is built for a hand-held god. Scan to open it on your phone.</div><canvas id="qr" width="200" height="200" aria-label="QR code"></canvas><div class="lbl" style="word-break:break-all">${esc(url)}</div><div style="margin-top:12px"><button id="dAny" class="btn">WATCH HERE ANYWAY</button></div></div>`;
    const QR = await import('qrcode');
    await QR.toCanvas($('#qr', d) as HTMLCanvasElement, url, { margin: 1, scale: 5, color: { dark: '#080d0aff', light: '#d8b397ff' } });
    $('#dAny', d).addEventListener('click', () => { d.classList.add('hidden'); playAnyway(); });
  }

  // ---------- per-snapshot ----------
  update(s: Snapshot, info: RatInfo | null, speed: Speed) {
    this.snap = s; this.info = info; this.speed = speed;
    this.root.querySelectorAll<HTMLButtonElement>('.spd').forEach((b) => b.classList.toggle('on', +b.dataset.v! === speed));
    const st = s.stats;
    const food = st.pop ? st.food / st.pop : 0;
    $('#stats').innerHTML = `
      <div class="stat"><span class="lbl">${PHASE[s.phase] ?? ''}</span><b>DAY ${s.day}</b></div>
      <div class="stat"><span class="lbl">${ICON('population')}RATS</span><b>${st.pop}</b></div>
      <div class="stat ${food < 1.5 ? 'bad' : food > 6 ? 'good' : ''}"><span class="lbl">${ICON('food')}FOOD</span><b>${Math.floor(st.food)}</b></div>
      <div class="stat ${st.mood < 0.35 ? 'bad' : st.mood > 0.6 ? 'good' : ''}"><span class="lbl">${ICON('mood')}MOOD</span><b>${pct(st.mood)}%</b></div>`;
    // king chip
    const kc = $('#kingchip');
    if (s.phase === 'founding') kc.innerHTML = `<span class="nm">THE FOUNDER</span><span class="th">${esc(s.mind?.thought || 'Sniffs the drain for a home.')}</span>`;
    else if (s.king.alive) kc.innerHTML = `<span class="nm">${esc(s.king.name)}</span><span class="th">&ldquo;${esc(s.mind?.thought ?? '...')}&rdquo;</span><span class="plate ${s.king.plate}"><img src="${A(`ui/ui_king_plate_${['feast', 'meal', 'scraps', 'empty'].includes(s.king.plate) ? s.king.plate : 'empty'}.png`)}" alt="${s.king.plate}"></span>`;
    else kc.innerHTML = `<span class="nm">NO KING</span><span class="th">${s.phase === 'gathering' ? 'The plaza decides.' : 'The throne room is quiet.'}</span>`;
    // founding objective
    const ob = $('#objective');
    if (s.phase === 'founding') { ob.classList.remove('hidden'); ob.innerHTML = `<span class="lbl">THE FOUNDER MEANS TO</span><br>${esc(s.founder.objectiveText || '...')}`; } else ob.classList.add('hidden');
    // herald chip
    const he = $('#herald');
    if (s.heralds.length) {
      const h = s.heralds[0]; const law = LAW_BY_ID[h.law];
      he.classList.remove('hidden');
      he.innerHTML = `<span class="lbl">HERALD</span> ${h.kind === 'repeal' ? 'TEARS DOWN' : 'CARRIES'} &ldquo;${esc(law?.name ?? h.law)}&rdquo; <span class="bar"><i style="width:${pct(h.step / Math.max(1, h.total))}%"></i></span>${s.heralds.length > 1 ? ` +${s.heralds.length - 1}` : ''}`;
    } else he.classList.add('hidden');
    // throne-silent banner
    const bn = $('#banner');
    const silent = s.phase === 'interregnum' || (s.phase === 'reign' && s.king.alive && s.king.emptyDays >= 2) || (s.king.alive && s.king.dying);
    bn.classList.toggle('hidden', !silent || s.phase === 'gathering');
    if (silent) bn.textContent = s.phase === 'interregnum' ? 'THE THRONE IS SILENT' : s.king.dying ? 'THE KING IS SICKENING' : 'THE KING\u2019S PLATE IS EMPTY';
    // vote
    const v = $('#vote');
    if (s.gathering) {
      const g = s.gathering; const tot = Math.max(1, g.total);
      v.classList.remove('hidden');
      v.innerHTML = `<div class="row"><h2 style="font-size:16px">THE PEBBLE VOTE</h2><span class="sp"></span><button class="btn" id="vWatch">WATCH</button></div>
        <div style="font-size:19px">${g.kingAlive ? `Shall ${esc(s.king.name)} live?` : 'The plaza mourns, and argues.'} ${g.counted}/${g.total} pebbles fallen.</div>
        <div class="tally"><div class="k" style="width:${(g.kills / tot) * 100}%"></div><div style="flex:1"></div><div class="s" style="width:${(g.spares / tot) * 100}%"></div></div>
        <div class="row"><span class="lbl" style="color:var(--red)">DEATH ${g.kills}</span><span class="sp"></span><span class="lbl" style="color:var(--tealL)">MERCY ${g.spares}</span></div>`;
      $('#vWatch', v).addEventListener('click', () => { this.ev.ui(); this.ev.focusPlaza(); });
    } else v.classList.add('hidden');
    // events → ticker + modals
    this.events(s);
    if (this.info) this.renderInspect(); else $('#inspect').classList.add('hidden');
    if (this.boardOpen) this.renderBoard();
  }

  private events(s: Snapshot) {
    const nNew = Math.min(12, s.eventSeq - this.lastSeq); const fresh = nNew > 0 ? s.events.slice(-nNew) : [];
    const first = !this.primed; this.primed = true; this.lastSeq = s.eventSeq;
    if (first) { for (const e of s.events.slice(-3)) this.tick(e.kind, e.text); return; }
    for (const e of fresh) {
      if (['mutter', 'birth', 'stray'].includes(e.kind) && Math.random() < 0.5) continue;
      this.tick(e.kind, e.text);
      this.onEvent?.(e.kind, e.text);
      this.showCard(e.kind, e.text);
    }
  }
  primed = false;
  onEvent: ((kind: string, text: string) => void) | null = null;
  tick(kind: string, text: string) {
    const t = $('#ticker'); const d = document.createElement('div'); d.className = 'k-' + kind; d.textContent = text; t.appendChild(d);
    while (t.children.length > 3) t.firstElementChild!.remove();
    setTimeout(() => d.remove(), 9000);
  }

  // ---------- inspect ----------
  renderInspect() {
    const r = this.info!; const el = $('#inspect'); el.classList.remove('hidden');
    const bar = (label: string, v: number, warnHigh = false) => `<span class="lbl">${label}</span><div class="bar ${warnHigh ? (v > 0.6 ? 'warn' : 'amb') : v < 0.3 ? 'warn' : ''}"><i style="width:${pct(v)}%"></i></div>`;
    const op = ['var(--red)', 'var(--amber)', 'var(--grey)', 'var(--tealL)', 'var(--cyan)'][r.opinionLevel];
    el.innerHTML = `
      <div class="row">${portrait(this.portraitFor(r), 1)}<div style="min-width:0;flex:1"><h2>${esc(r.name)}</h2></div><span class="sp"></span>
        <button class="btn ${this.following === r.id ? 'on' : ''}" style="white-space:nowrap;padding:0 10px;flex:none" id="iFollow">${this.following === r.id ? 'WATCHING' : 'FOLLOW'}</button><button class="btn" id="iClose" style="flex:none" aria-label="Close">X</button></div>
      <div class="imeta"><span class="lbl" style="color:var(--bone)">${r.job} &middot; ${r.sex} &middot; ${r.age}D &middot; ${esc(r.room)}</span>${r.traits.map((t) => `<span class="chip trait">${t}</span>`).join('')}${r.sick ? '<span class="chip" style="background:#3b666f;color:#000">SICK</span>' : ''}${r.pregnant ? '<span class="chip">WITH LITTER</span>' : ''}</div>
      <div class="thought">${esc(r.thought)}</div>
      <div class="bars two">${bar('HUNGER', r.hunger, true)}${bar('HEALTH', r.health)}${bar('MOOD', r.mood)}${bar('FEAR', r.fear, true)}${bar('ANGER', r.anger, true)}${bar('LOYALTY', r.loyalty)}</div>
      <div class="iop"><h3>OF THE KING</h3><span style="color:${op};font-size:18px">${r.opinion}</span></div>
      ${r.family.length ? `<h3>FAMILY</h3><div class="chips">${r.family.map((f) => `<button class="btn fam" data-id="${f.id}">${f.rel}: ${esc(f.name)}</button>`).join('')}</div>` : ''}`;
    $('#iClose', el).addEventListener('click', () => { this.ev.ui(); this.closeInspect(); });
    $('#iFollow', el).addEventListener('click', () => { this.ev.ui(); this.following = this.following === r.id ? null : r.id; this.ev.follow(this.following); this.renderInspect(); });
    el.querySelectorAll<HTMLButtonElement>('.fam').forEach((b) => b.addEventListener('click', () => { this.ev.ui(); this.ev.inspect(+b.dataset.id!); }));
  }
  portraitFor(r: RatInfo) {
    if (r.isKing) return this.snap?.king.plate === 'empty' || this.snap?.king.dying ? 'king_starving' : 'king';
    if (r.job === 'FOUNDER') return 'founder'; if (r.job === 'ENFORCER') return 'enforcer'; if (r.job === 'OUTCAST') return 'outcast'; if (r.job === 'SHRINE KEEPER') return 'prophet';
    if (r.age >= 60) return 'elder';
    return r.sex === 'FEMALE' ? 'worker_f' : 'worker_m';
  }
  closeInspect() { this.info = null; $('#inspect').classList.add('hidden'); this.ev.inspect(null); if (this.following != null) { this.following = null; this.ev.follow(null); } }

  // ---------- king's board (watched from outside) ----------
  openBoard() { this.boardOpen = true; $('#board').classList.remove('hidden'); this.renderBoard(); }
  closeBoard() { this.boardOpen = false; $('#board').classList.add('hidden'); }
  renderBoard() {
    const s = this.snap; if (!s) return; const m = $('#board .modal');
    const mind = s.mind;
    const tile = (l: Snapshot['laws'][number]) => {
      const def = LAW_BY_ID[l.id];
      const st = l.state === 'force' ? 'IN FORCE' : l.state === 'spreading' ? `SPREADING ${pct(l.adopt)}%` : l.state === 'repealing' ? 'BEING TORN DOWN' : l.locked ? 'UNLIT' : l.cooldown > 0 ? 'COOLING' : 'DARK';
      const reach = mind?.reaching === l.id ? ' reach' : '';
      const art = l.locked ? 'disabled' : l.state === 'force' ? 'pressed' : l.state === 'spreading' || reach ? 'hover' : 'normal';
      return `<div class="law ${l.state} ${l.locked ? 'locked' : ''}${reach}" title="${esc(def?.prop ?? '')}"><img class="btnart" src="${A(`ui/ui_law_button_${art}.png`)}" alt=""><span>${esc(def?.name ?? l.id)}</span><span class="st">${st}</span></div>`;
    };
    const ordered = [...s.laws].sort((a, b) => (LAW_BY_ID[a.id]?.n ?? 0) - (LAW_BY_ID[b.id]?.n ?? 0));
    const kingName = s.phase === 'founding' ? 'NO KING YET' : s.king.alive ? s.king.name : 'THE EMPTY THRONE';
    m.innerHTML = `
      <div class="row"><h2 style="font-size:16px">THE KING&rsquo;S BOARD</h2><span class="sp"></span><button class="btn" id="bWatch">WATCH HIM</button><button class="btn" id="bClose" aria-label="Close">X</button></div>
      <div class="boardhead" style="margin-top:10px">
        ${portrait(s.phase === 'founding' ? 'founder' : !s.king.alive ? 'king_starving' : s.king.plate === 'empty' || s.king.dying ? 'king_starving' : s.king.reign <= 1 && (mind?.plateHist.length ?? 0) < 3 ? 'new_king' : 'king', 1, !s.king.alive && s.phase !== 'founding')}
        <div style="flex:1;min-width:0"><div class="disp" style="color:var(--amberL);font-size:14px">${esc(kingName)}</div>
          ${s.king.alive && s.phase !== 'founding' ? `<div class="lbl" style="color:var(--bone)">REIGN DAY ${s.king.reign} &middot; PLATE: ${s.king.plate.toUpperCase()}</div>` : ''}
          <div class="chips">${(mind?.traits ?? []).map((t) => `<span class="chip trait">${t}</span>`).join('')}</div></div>
      </div>
      ${mind && s.king.alive ? `<div class="thought">${esc(mind.thought)}</div>` : ''}
      <h3>HIS PLATE, DAY BY DAY</h3><canvas class="spark" id="spark" width="120" height="20"></canvas>
      <h3>THE BUTTONS</h3>
      <div class="laws">${ordered.map(tile).join('')}</div>
      <div class="note">You see what he presses and what he hopes. You do not see what it does. Every reign, the chronicle reveals one truth.</div>`;
    $('#bClose', m).addEventListener('click', () => { this.ev.ui(); this.closeBoard(); });
    $('#bWatch', m).addEventListener('click', () => { this.ev.ui(); this.closeBoard(); this.ev.focusKing(); });
    const cv = $('#spark', m) as HTMLCanvasElement; const g = cv.getContext('2d')!;
    const hist = (mind?.plateHist ?? []).slice(-60); g.fillStyle = '#080d0a'; g.fillRect(0, 0, 120, 20);
    const mx = Math.max(1, ...hist);
    hist.forEach((v, i) => { const h = Math.max(1, Math.round((v / mx) * 18)); g.fillStyle = v / mx > 0.66 ? '#f2b46a' : v / mx > 0.33 ? '#9c6e4e' : '#670a1e'; g.fillRect(120 - hist.length * 2 + i * 2, 20 - h, 2, h); });
  }

  // ---------- modals ----------
  modal(html: string, wire?: (m: HTMLElement) => void) {
    const w = $('#modal'); const m = $('#modal .modal'); m.innerHTML = html; w.classList.remove('hidden'); this.modalOpen = true;
    m.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((b) => b.addEventListener('click', () => { this.ev.ui(); this.closeModal(); }));
    wire?.(m);
  }
  closeModal() { $('#modal').classList.add('hidden'); this.modalOpen = false; this.onModalClose?.(); }
  onModalClose: (() => void) | null = null;
  confirm(title: string, body: string, yes: string, ok: () => void) {
    this.modal(`<h2>${title}</h2><div style="margin:10px 0;font-size:20px">${body}</div><div class="row"><button class="btn" data-close>KEEP WATCHING</button><span class="sp"></span><button class="btn red" id="mYes">${yes}</button></div>`, (m) => $('#mYes', m).addEventListener('click', () => { this.closeModal(); ok(); }));
  }
  kingDeath(text: string, executed: boolean, insight: { name: string; truth: string } | null) {
    this.modal(`${card(executed ? 'execution' : 'king_dies_alone', 'hero')}<div class="stamp-wrap"><span class="stamp">${executed ? 'EXECUTED' : 'DEAD'}</span></div>
      <h2 style="text-align:center">THE KING IS DEAD</h2><div style="margin:10px 0;font-size:20px;text-align:center">${esc(text)}</div>
      ${insight ? `<div class="insight"><b>GOD&rsquo;S INSIGHT &middot; ${esc(insight.name)}</b><br>${esc(insight.truth)}</div>` : '<div class="note" style="text-align:center">When the next king is raised, god will learn one true thing about this reign.</div>'}
      <div style="text-align:center;margin-top:12px"><button class="btn rust" data-close>WATCH WHAT FOLLOWS</button></div>`);
  }
  succession(name: string, text: string, traits: string[], insight: string | null = null) {
    this.modal(`${card('succession', 'hero')}<h2 style="text-align:center">LONG LIVE ${esc(name)}</h2>
      <div style="display:flex;justify-content:center;margin:8px 0">${portrait('new_king', 1)}</div>
      <div style="font-size:20px;text-align:center">${esc(text)}</div>
      <div class="chips" style="justify-content:center">${traits.map((t) => `<span class="chip trait">${t}</span>`).join('')}</div>
      <div class="note" style="text-align:center">The most efficient rat takes the throne. He will never leave it.</div>
      ${insight ? `<div class="insight"><b>GOD&rsquo;S INSIGHT</b><br>${esc(insight.replace(/^GOD'S INSIGHT:\s*/, ''))}</div>` : ''}
      <div style="text-align:center;margin-top:12px"><button class="btn rust" data-close>WATCH HIM RULE</button></div>`);
  }
  chronicle(c: Chronicle) {
    const kings = c.kings.map((k) => `<li><b class="disp" style="font-size:13px;color:var(--amberL)">${esc(k.name)}</b> &middot; day ${Math.floor(k.start / 20)}${k.end != null ? `&ndash;${Math.floor(k.end / 20)}` : '&ndash;'} &middot; ${esc(k.cause ?? 'reigns')}${k.laws.length ? `<br><span style="color:var(--grey)">${k.laws.map(esc).join(', ')}</span>` : ''}</li>`).join('');
    const seen = this.cardsSeen.length ? this.cardsSeen.slice(-6) : ['founding'];
    this.modal(`<div class="row"><h2>THE CHRONICLE</h2><span class="sp"></span><button class="btn" data-close aria-label="Close">X</button></div>
      ${card(c.executions > 0 && c.kings.length > 2 ? 'golden_age' : 'founding', 'hero')}
      <div class="bars" style="grid-template-columns:1fr 1fr 1fr 1fr;text-align:center">
        <div><div class="lbl">DAYS</div><b class="disp">${c.days}</b></div><div><div class="lbl">BORN</div><b class="disp">${c.born}</b></div><div><div class="lbl">DEAD</div><b class="disp">${c.dead}</b></div><div><div class="lbl">PEAK</div><b class="disp">${c.peak}</b></div></div>
      <h3>THE DYNASTY</h3><ol class="list">${kings || '<li>No king has yet been crowned.</li>'}</ol>
      <h3>GOD&rsquo;S INSIGHTS</h3>${c.insights.length ? c.insights.map((i) => `<div class="insight"><b>${esc(i.name)}</b><br>${esc(i.truth)}</div>`).join('') : '<div class="note">One truth is revealed when each reign ends.</div>'}
      <h3>WHAT GOD HAS WITNESSED</h3><div class="cards">${[...new Set(seen)].map((id) => card(id, 'thumb')).join('')}</div>
      <div class="note">${c.lawsPressed} presses. ${c.executions} execution${c.executions === 1 ? '' : 's'} by pebble.</div>`);
  }
  experimentOver(c: Chronicle) {
    const longest = [...c.kings].sort((a, b) => (b.end ?? 0) - b.start - ((a.end ?? 0) - a.start))[0];
    this.modal(`${card('collapse', 'hero')}<h2 style="text-align:center">THE EXPERIMENT IS OVER</h2>
      <div style="font-size:20px;text-align:center;margin:10px 0">The last rat is still. The neon hums on above an empty burrow.</div>
      <div class="bars" style="grid-template-columns:1fr 1fr 1fr;text-align:center">
        <div><div class="lbl">DAYS</div><b class="disp">${c.days}</b></div><div><div class="lbl">KINGS</div><b class="disp">${c.kings.length}</b></div><div><div class="lbl">PEAK</div><b class="disp">${c.peak}</b></div>
        <div><div class="lbl">BORN</div><b class="disp">${c.born}</b></div><div><div class="lbl">DEAD</div><b class="disp">${c.dead}</b></div><div><div class="lbl">EXECUTED</div><b class="disp">${c.executions}</b></div></div>
      ${longest ? `<div class="note" style="color:var(--bone)">Longest reign: ${esc(longest.name)}.</div>` : ''}
      ${c.insights.length ? `<h3>WHAT GOD LEARNED</h3>${c.insights.map((i) => `<div class="insight"><b>${esc(i.name)}</b><br>${esc(i.truth)}</div>`).join('')}` : ''}
      <div class="row" style="margin-top:12px"><button class="btn" data-close>LOOK AT THE RUINS</button><span class="sp"></span><button class="btn rust" id="mNew">NEW EXPERIMENT</button></div>`,
      (m) => $('#mNew', m).addEventListener('click', () => { this.closeModal(); this.ev.newGame(); }));
  }
  openSettings() {
    const gore = !document.body.classList.contains('nogore'); const snd = this.soundOn;
    this.modal(`<div class="row"><h2>SETTINGS</h2><span class="sp"></span><button class="btn" data-close aria-label="Close">X</button></div>
      <div class="toggle"><span>Show blood and remains</span><button class="btn ${gore ? 'on' : ''}" id="sGore">${gore ? 'ON' : 'REDUCED'}</button></div>
      <div class="toggle"><span>Sound (all audio)</span><button class="btn ${snd ? 'on' : ''}" id="sSnd">${snd ? 'ON' : 'MUTED'}</button></div>
      <div class="toggle"><span>Music</span><button class="btn ${this.musicOn ? 'on' : ''}" id="sMus">${this.musicOn ? 'ON' : 'OFF'}</button></div>
      <div class="toggle"><span>Erase and begin anew</span><button class="btn red" id="sNew">NEW</button></div>
      <div class="note">The city saves itself every two days. Art, music and ambience: final RAT GOD asset set. Small sound effects are synthesized.</div>`,
      (m) => {
        $('#sGore', m).addEventListener('click', () => { document.body.classList.toggle('nogore'); this.ev.gore(!document.body.classList.contains('nogore')); this.openSettings(); });
        $('#sSnd', m).addEventListener('click', () => { this.soundOn = !this.soundOn; this.ev.sound(this.soundOn); this.openSettings(); });
        $('#sMus', m).addEventListener('click', () => { this.musicOn = !this.musicOn; this.ev.music(this.musicOn); this.openSettings(); });
        $('#sNew', m).addEventListener('click', () => this.confirm('BEGIN AGAIN?', 'The current experiment will be erased.', 'ERASE AND BEGIN', () => this.ev.newGame()));
      });
  }
  soundOn = true; musicOn = true;
  cardsSeen: string[] = [];
  private cardAt = 0;
  /** event-card toast: rate-limited, the big ones always shown */
  showCard(kind: string, text: string) {
    const first = (kind === 'press' || kind === 'law') && !this.cardsSeen.includes('first_law');
    const cid = first ? 'first_law' : CARD_FOR[kind]; if (!cid) return; const now = performance.now();
    if (!this.cardsSeen.includes(cid) || first || ['executed', 'king_died', 'city_dead', 'gather', 'founding'].includes(kind)) this.cardsSeen.push(cid);
    if (MODAL_KINDS.has(kind) || this.modalOpen || (now - this.cardAt < 25000 && !first && kind !== 'founding')) return;
    this.cardAt = now;
    const t = $('#card'); t.innerHTML = `${card(cid)}<div>${esc(text)}</div>`; t.classList.remove('hidden', 'out'); void t.offsetWidth; t.onclick = () => t.classList.add('hidden');
    clearTimeout(this.cardT); this.cardT = window.setTimeout(() => { t.classList.add('out'); this.cardT = window.setTimeout(() => t.classList.add('hidden'), 500); }, 4200);
  }
  private cardT = 0;
}
void LAWS;
