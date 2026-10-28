// Bottom sheets: rat life (now / story / bonds / life / ripples), the city (overview, factions & parties & religions & castes,
// tech timeline, justice log, firms, homes, ripples), the Omens inbox, the full ambient log, settings.
import type { RatDetail, ChronicleV2, Forecast, Snapshot2 } from '../../sim/v2/contract';
import { esc, h, clean, pct, day } from './util2';
import type { Hud2 } from './hud2';
import { saveConsent } from './hud2';
import type { Tier } from '../../render/v2/post';

const hex = (c: number) => `#${(c >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
export class Sheets {
  private el: HTMLElement | null = null; private kind = ''; private ratId = -1; private ratTab = 'now'; private socTab = 'overview'; private storyCache = new Map<number, RatDetail>();
  constructor(private hud: Hud2) {}
  close() { this.el?.remove(); this.el = null; this.kind = ''; }
  open(title: string, body: string, bind?: (root: HTMLElement) => void, tabs?: { id: string; label: string; on: boolean }[], onTab?: (id: string) => void, kind = 'misc') {
    if (this.hud.blocking) return this.el ?? this.hud.el;
    this.close(); this.kind = kind;
    const el = h(`<div class="h2-sheet panel rivet scan" role="dialog" aria-label="${esc(title)}"><div class="hd"><h3>${title}</h3><button class="btn" data-close aria-label="Close">✕</button></div>
      ${tabs ? `<div class="h2-tabs">${tabs.map((t) => `<button class="btn${t.on ? ' on' : ''}" data-tab="${t.id}">${esc(t.label)}</button>`).join('')}</div>` : ''}<div class="sc">${body}</div></div>`);
    (el.querySelector('[data-close]') as HTMLElement).onclick = () => this.close();
    el.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.onclick = () => onTab?.(b.dataset.tab!));
    el.querySelectorAll<HTMLElement>('[data-rat]').forEach((b) => b.onclick = () => { const id = Number(b.dataset.rat); this.hud.followRat(id); this.rat(id); });
    bind?.(el); this.hud.el.appendChild(el); this.el = el; return el;
  }
  private ratLink(id: number) { return id > 0 ? `<button class="btn" data-rat="${id}" style="min-height:44px">${esc(this.hud.name(id))}</button>` : '—'; }
  // ───────── a rat's life ─────────
  rat(id: number) { this.ratId = id; this.hud.sim.send({ t: 'inspect', id }); if (this.ratTab === 'story') this.hud.sim.send({ t: 'story', id }); this.renderRat(this.hud.detail?.id === id ? this.hud.detail : null); }
  refreshRat(d: RatDetail) { if (this.kind === 'rat' && d.id === this.ratId && this.ratTab !== 'story' && !this.el?.matches(':hover')) { const sc = this.el?.querySelector('.sc'); const top = sc?.scrollTop ?? 0; this.renderRat(d); const sc2 = this.el?.querySelector('.sc'); if (sc2) sc2.scrollTop = top; } }
  story(d: RatDetail) { this.storyCache.set(d.id, d); if (this.kind === 'rat' && d.id === this.ratId && this.ratTab === 'story') this.renderRat(d); }
  private renderRat(d: RatDetail | null) {
    const hud = this.hud; const tabs = [['now', 'NOW'], ['story', 'LIFE STORY'], ['bonds', 'BONDS'], ['life', 'PLACE IN THE CITY'], ['ripples', 'YOUR HAND']].map(([id, label]) => ({ id, label, on: id === this.ratTab }));
    const title = d ? `${esc(d.name)}${d.title ? ` · ${esc(d.title)}` : ''}` : esc(hud.name(this.ratId));
    let body = '<p class="h2-p">Listening…</p>';
    if (d) {
      const t = this.ratTab;
      if (t === 'now') body = `<p class="h2-p" style="color:var(--amberL)">“${esc(clean(d.thought))}”</p><p class="h2-p">${esc(clean(d.doing))}</p>
        <div class="h2-row"><span>${d.sex === 'F' ? 'She' : 'He'} is ${Math.round(d.ageDays)} days old · ${esc(d.role)} · ${esc(d.className)}</span></div>
        ${Object.entries(d.needs).map(([k, v]) => `<div class="h2-row"><span>${k.toUpperCase()}</span><span style="flex:1;max-width:55%"><div class="h2-bar"><b style="width:${pct(Math.max(0, Math.min(1, v)))}"></b></div></span></div>`).join('')}
        ${d.lastDecision ? `<div class="h2-sec">Why ${d.sex === 'F' ? 'she' : 'he'} chose</div><p class="h2-p">${esc(clean(d.lastDecision.choice))}: ${esc(clean(d.lastDecision.why))}</p><div class="h2-row"><span>GUT</span><span class="v">${pct(d.lastDecision.intuition)}</span></div><div class="h2-row"><span>REASON</span><span class="v">${pct(d.lastDecision.facts)}</span></div>` : ''}
        ${d.memories.length ? `<div class="h2-sec">Remembers</div>${d.memories.slice(0, 6).map((m) => `<p class="h2-p" style="color:${m.valence < 0 ? '#f0c0b8' : 'var(--bone)'}">Day ${day(m.tick)}: ${esc(clean(m.text))}</p>`).join('')}` : ''}`;
      else if (t === 'story') { const s = this.storyCache.get(d.id) ?? d; body = s.story.length ? s.story.map((p) => `<p class="h2-p">${esc(clean(p))}</p>`).join('') : '<p class="h2-p">Nothing has been written of this life yet.</p>'; }
      else if (t === 'bonds') body = `<canvas class="h2-web" width="600" height="440"></canvas>${d.relations.map((r) => `<div class="h2-row"><span>${this.ratLink(r.id)} ${esc(r.kinds.join(', '))}${r.alive ? '' : ' (dead)'}</span><span class="v">${r.aff > 0 ? '♥' : '✕'} ${Math.round(r.aff * 100)}</span></div>`).join('')}
        <div class="h2-sec">Family</div><div class="h2-row"><span>MOTHER</span>${this.ratLink(d.mother)}</div><div class="h2-row"><span>FATHER</span>${this.ratLink(d.father)}</div>${d.spouse ? `<div class="h2-row"><span>SPOUSE</span>${this.ratLink(d.spouse)}</div>` : ''}
        ${d.children.length ? `<div class="h2-row"><span>CHILDREN</span><span>${d.children.length}</span></div>` : ''}<div class="h2-row"><span>HOUSE</span><span class="v">${esc(d.dynasty.name)} · gen ${d.generation}</span></div>`;
      else if (t === 'life') body = `${[['FACTION', d.faction?.name], ['FAITH', d.religion?.name], ['PARTY', d.party?.name], ['WORK', d.firm ? `${d.firm.name}${d.firm.boss ? ' (boss)' : ''}` : null], ['CASTE', d.caste?.name], ['HOME', d.home?.name]].filter((r) => r[1]).map((r) => `<div class="h2-row"><span>${r[0]}</span><span class="v">${esc(r[1])}</span></div>`).join('')}
        ${d.jailed ? `<p class="h2-p" style="color:#f0c0b8">Jailed for ${esc(d.jailed.crime)} until day ${d.jailed.untilDay}${d.jailed.wrongful ? ' — wrongly' : ''}.</p>` : ''}${d.shunned ? '<p class="h2-p" style="color:#f0c0b8">Shunned.</p>' : ''}
        ${d.knows.length ? `<div class="h2-sec">Knows</div><p class="h2-p">${d.knows.map((k) => `<span class="h2-chip">${esc(k)}</span>`).join('')}</p>` : ''}
        ${d.blessings.length || d.curses.length ? `<div class="h2-sec">Touched by you</div><p class="h2-p">${d.blessings.map((b) => `<span class="h2-chip" style="color:var(--amberL)">${esc(b)}</span>`).join('')}${d.curses.map((b) => `<span class="h2-chip" style="color:var(--red)">${esc(b)}</span>`).join('')}</p>` : ''}
        ${d.record.length ? `<div class="h2-sec">Record</div>${d.record.map((r) => `<p class="h2-p">${esc(clean(r))}</p>`).join('')}` : ''}
        ${d.wounds?.length && hud.consent.mature && hud.consent.gore >= 1 ? `<div class="h2-sec">Wounds</div><p class="h2-p">${d.wounds.map((w) => `<span class="h2-chip">${esc(w.part.replace(/_/g, ' '))} ${['', 'cut', 'maimed', 'lost'][w.level] ?? ''}</span>`).join('')}</p>` : ''}
        <div class="h2-sec">Beliefs</div>${Object.entries(d.beliefs).map(([k, v]) => `<div class="h2-row"><span>${k.toUpperCase()}</span><span class="v">${v > 0.2 ? 'for' : v < -0.2 ? 'against' : 'unsure'}</span></div>`).join('')}`;
      else body = this.rippleList((d.ripples ?? []).map((id) => hud.ripples.get(id)).filter(Boolean) as never) || '<p class="h2-p">You have not touched this life. Yet.</p>';
    }
    body += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px"><button class="btn rust" data-bless>BLESS</button><button class="btn" data-curse>CURSE</button><button class="btn rust" data-act>ACT ON ${d ? esc(d.name.toUpperCase()) : 'THIS RAT'}</button><button class="btn" data-unfollow>STOP FOLLOWING</button></div>`;
    const el = this.open(title, body, (root) => {
      root.querySelector<HTMLElement>('[data-bless]')!.onclick = () => { const id = this.ratId; this.close(); hud.god.begin('bless', { rat: id }); };
      root.querySelector<HTMLElement>('[data-curse]')!.onclick = () => { const id = this.ratId; this.close(); hud.god.begin('curse', { rat: id }); };
      root.querySelector<HTMLElement>('[data-act]')!.onclick = () => { const id = this.ratId; this.close(); hud.god.open({ rat: id }); };
      root.querySelector<HTMLElement>('[data-unfollow]')!.onclick = () => { hud.following = -1; hud.world.cam.follow = null; hud.world.actors.selected = -1; this.close(); };
    }, tabs, (id) => { this.ratTab = id; if (id === 'story') hud.sim.send({ t: 'story', id: this.ratId }); this.renderRat(hud.detail?.id === this.ratId ? hud.detail : d); }, 'rat');
    const cv = el.querySelector('canvas'); if (cv && d) this.web(cv as HTMLCanvasElement, d);
  }
  private web(cv: HTMLCanvasElement, d: RatDetail) {
    const g = cv.getContext('2d')!; const W = cv.width, H = cv.height; g.clearRect(0, 0, W, H); g.font = '22px VT323, monospace'; g.textAlign = 'center';
    const rs = d.relations.slice(0, 10); rs.forEach((r, i) => { const a = (i / Math.max(1, rs.length)) * Math.PI * 2 - Math.PI / 2; const x = W / 2 + Math.cos(a) * W * 0.36, y = H / 2 + Math.sin(a) * H * 0.36;
      g.strokeStyle = r.aff >= 0 ? `rgba(242,180,106,${0.3 + Math.abs(r.aff) * 0.7})` : `rgba(232,75,90,${0.3 + Math.abs(r.aff) * 0.7})`; g.lineWidth = 1 + Math.abs(r.aff) * 6; g.beginPath(); g.moveTo(W / 2, H / 2); g.lineTo(x, y); g.stroke();
      g.fillStyle = r.alive ? '#26373d' : '#14151a'; g.fillRect(x - 6, y - 6, 12, 12); g.fillStyle = r.alive ? '#d8b397' : '#907d78'; g.fillText(r.name, x, y + (y > H / 2 ? 26 : -12)); });
    g.fillStyle = '#f2b46a'; g.fillRect(W / 2 - 9, H / 2 - 9, 18, 18); g.fillText(d.name, W / 2, H / 2 + 32);
  }
  rippleList(rs: { id: number; power: string; tick: number; text: string; open: boolean; chain: { seq: number; tick: number; text: string; depth: number }[] }[]) {
    return rs.map((r) => `<div class="h2-ripple"><div class="lbl2" style="color:var(--amberL)">${esc(r.power.replace(/_/g, ' '))} · day ${day(r.tick)}${r.open ? ' · still spreading' : ''}</div><p class="h2-p">${esc(clean(r.text))}</p>
      ${r.chain.map((c) => `<div class="ch" style="--d:${Math.min(6, c.depth)}">↳ Day ${day(c.tick)}: ${esc(clean(c.text))}</div>`).join('')}</div>`).join('');
  }
  // ───────── the city ─────────
  society(tab = this.socTab) {
    this.socTab = tab; const s = this.hud.snap; if (!s) return;
    const tabs = [['overview', 'OVERVIEW'], ['factions', 'FACTIONS'], ['faiths', 'FAITHS'], ['politics', 'PARTIES'], ['laws', 'LAWS'], ['castes', 'CASTES & HOMES'], ['tech', 'KNOWLEDGE'], ['justice', 'JUSTICE'], ['firms', 'FIRMS'], ['ripples', 'RIPPLES']].map(([id, label]) => ({ id, label, on: id === tab }));
    this.open('THE CITY', this.socBody(tab, s), undefined, tabs, (id) => this.society(id), 'society');
  }
  private socBody(tab: string, s: Snapshot2) {
    const st = s.stats, N = (id: number) => this.ratLink(id); const row = (k: string, v: string) => `<div class="h2-row"><span>${k}</span><span class="v">${v}</span></div>`;
    switch (tab) {
      case 'overview': { const k = s.king; return `${k ? `<p class="h2-p">${N(k.id)} reigns. ${k.stanceToGod ? `Toward you: <b style="color:${k.stanceToGod === 'defiant' || k.stanceToGod === 'at_war' ? 'var(--red)' : 'var(--amberL)'}">${esc(k.stanceToGod.replace('_', ' '))}</b>. ` : ''}“${esc(clean(k.thought))}”</p>` : '<p class="h2-p">No one rules.</p>'}
        ${row('RATS', `${st.pop} · ${st.pups} pups`)}${row('BORN / DIED', `${st.births} / ${st.deaths}`)}${row('FOOD', `${Math.round(st.food)} · store ${Math.round(st.granary)}`)}${row('HUNGER', pct(st.hunger))}${row('UNREST', pct(st.unrest))}${row('FAITH IN YOU', `${Math.round(st.faith * 100)}`)}
        ${s.arcs.filter((a) => !a.ended).slice(0, 2).map((a) => `<p class="h2-p">${esc(clean(a.title))}</p>`).join('')}`; }
      case 'factions': return s.factions.map((f) => `<div class="h2-sec" style="color:${hex(f.color)}">${esc(f.name)} · ${f.kind}</div><p class="h2-p">“${esc(clean(f.creed))}” — aims: ${esc(clean(f.aims))}</p>${row('MEMBERS', String(f.members))}${row('INFLUENCE', pct(f.strength))}<div class="h2-row"><span>LEADER</span>${N(f.leader)}</div>`).join('') || '<p class="h2-p">No factions yet.</p>';
      case 'faiths': return s.religions.map((r) => `<div class="h2-sec" style="color:${hex(r.color)}">${esc(r.name)}</div><p class="h2-p">Worships ${esc(r.deity)}. ${r.doctrine.map((d) => esc(clean(d))).join(' · ')}</p>${row('FAITHFUL', String(r.members))}${row('TEMPLES', String(r.temples.length))}${row('TOWARD OTHERS', r.tolerance > 0.3 ? 'harmonious' : r.tolerance < -0.3 ? 'persecuting' : 'wary')}${r.enemies.length ? row('HOLY WAR WITH', r.enemies.map((e) => esc(s.religions.find((x) => x.id === e)?.name ?? '?')).join(', ')) : ''}<div class="h2-row"><span>PROPHET</span>${N(r.prophet)}</div>`).join('') || '<p class="h2-p">No organised faith yet. They pray to you alone, or not at all.</p>';
      case 'laws': return this.lawBoard(s);
      case 'politics': return `${s.council ? `<div class="h2-sec">Council</div>${row('SEATS', String(s.council.seats))}${row('NEXT ELECTION', `day ${day(s.council.nextElection)}`)}${s.council.lastVote ? `<p class="h2-p">Last vote: ${esc(clean(s.council.lastVote))}</p>` : ''}` : '<p class="h2-p">No council sits.</p>'}
        ${s.parties.map((p) => `<div class="h2-sec" style="color:${hex(p.color)}">${esc(p.name)}${p.banned ? ' · BANNED' : ''}</div><p class="h2-p">${p.platform.map((x) => `<span class="h2-chip">${esc(clean(x))}</span>`).join('')}</p>${row('MEMBERS · SEATS', `${p.members} · ${p.seats}`)}${p.corrupt > 0.4 ? row('CORRUPTION', pct(p.corrupt)) : ''}<div class="h2-row"><span>LEADER</span>${N(p.leader)}</div>`).join('')}`;
      case 'castes': return `${(s.castes ?? []).sort((a, b) => a.rank - b.rank).map((c) => `<div class="h2-sec" style="color:${hex(c.color)}">${esc(c.name)} · rank ${c.rank + 1}</div>${row('MEMBERS', String(c.members))}<p class="h2-p">${c.occupations.map((o) => `<span class="h2-chip">${esc(o)}</span>`).join('')}</p>${c.norms.map((n) => `<p class="h2-p" style="color:var(--grey)">${esc(clean(n))}</p>`).join('')}`).join('') || '<p class="h2-p">No castes have hardened. Yet.</p>'}
        <div class="h2-sec">Homes</div>${row('FAMILY HOMES', String(s.stats.homes ?? 0))}${row('MARRIED PAIRS', String(s.stats.married ?? 0))}`;
      case 'tech': { const order = [...s.tech].sort((a, b) => a.era - b.era || a.discovered - b.discovered); const ERA = ['BASICS', 'FIRE & TOOLS', 'CRAFT', 'MACHINES', 'SPARK', 'RI & RODENTOIDS'];
        return `<div class="h2-tl">${order.map((t) => `<div class="it ${t.status === 'lost' ? 'lost' : t.status === 'secret' ? 'secret' : ''}"><div class="lbl2">${ERA[t.era]} · day ${day(t.discovered)} · ${esc(t.status)}</div><p class="h2-p"><b style="color:var(--amberL)">${esc(t.name)}</b> — ${esc(clean(t.blurb))} ${t.discoverer ? `<br>found by ${esc(this.hud.name(t.discoverer))} through ${esc(t.how)}` : ''} · ${t.knowers} know it</p></div>`).join('')}
          ${s.research.map((r) => `<div class="it future"><div class="lbl2">being worked on · ${pct(r.progress)}</div><p class="h2-p">${esc(this.hud.name(r.ratId))} tinkers toward ${esc(r.tech.replace(/_/g, ' '))}${r.fails ? ` (${r.fails} failures)` : ''}</p></div>`).join('')}</div>` || '<p class="h2-p">Nothing is known but teeth and dark.</p>'; }
      case 'justice': { const j = s.justice; return `${row('IN JAIL', String(j.inmates.length))}${row('EXECUTIONS · EXILES', `${j.executions} · ${j.exiles}`)}${j.secretPolice ? '<p class="h2-p" style="color:var(--red)">A secret police watches the tunnels.</p>' : ''}
        <div class="h2-sec">Trials</div>${j.trials.map((t) => `<p class="h2-p">${esc(this.hud.name(t.accused))} accused of ${esc(t.crime)}, judged by ${esc(this.hud.name(t.judge))}</p>`).join('') || '<p class="h2-p">None now.</p>'}
        <div class="h2-sec">Inmates</div>${j.inmates.map((m) => `<div class="h2-row"><span>${N(m.ratId)} ${esc(m.crime)}${m.wrongful ? ' (wrongful)' : ''}</span><span class="v">until day ${day(m.until)}</span></div>`).join('') || '<p class="h2-p">The cells are empty.</p>'}
        <div class="h2-sec">Justice log</div>${this.hud.feedLog.concat(this.hud.notable).filter((e) => ['arrest', 'trial', 'verdict', 'jailed', 'released', 'escape', 'pardon', 'wrongful', 'exile', 'execution'].includes(e.kind)).sort((a, b) => b.tick - a.tick).slice(0, 40).map((e) => `<p class="h2-p">Day ${day(e.tick)}: ${esc(e.text)}</p>`).join('') || '<p class="h2-p">Nothing recorded yet.</p>'}`; }
      case 'firms': return s.firms.map((f) => `<div class="h2-sec">${esc(f.name)} · ${esc(f.kind.replace(/_/g, ' '))}${f.status !== 'open' ? ` · ${f.status.toUpperCase()}` : ''}</div>${row('WORKERS · RODENTOIDS', `${f.workers} · ${f.rodentoids}`)}${row('WAGE', `${f.wage.toFixed(1)} food/day`)}${row('MARKET SHARE', pct(f.share) + (f.share >= 0.7 ? ' (monopoly)' : ''))}<div class="h2-row"><span>BOSS</span>${N(f.boss)}</div>${f.union ? `<div class="h2-row"><span>UNION</span>${N(f.union)}</div>` : ''}`).join('') || '<p class="h2-p">No firms. Work is still done for family and crown.</p>';
      case 'ripples': { const rs = [...this.hud.ripples.values()].sort((a, b) => b.tick - a.tick); return rs.length ? `<p class="h2-p" style="color:var(--grey)">What your hand set moving.</p>${this.rippleList(rs)}` : '<p class="h2-p">You have not acted. Everything here happened without you.</p>'; }
    }
    return '';
  }
  /** God's Wheel: 36 sockets. Pressed laws sit in the first sockets; the rest stay empty. */
  private lawBoard(s: Snapshot2) {
    const k = s.king;
    const cat = new Map(this.hud.laws.map((l) => [l.id, l]));
    const sockets = k?.board?.sockets ?? Array.from({ length: 36 }, (_, i) => k?.laws[i]?.id ?? null);
    const sealed = k?.board?.sealed ?? sockets.map((id) => id != null);
    const cells = sockets.slice(0, 36).map((id, i) => {
      const law = id ? cat.get(id) : undefined;
      const name = law?.name ?? (id ? id.replace(/_/g, ' ') : '');
      const short = name ? name.split(' ').slice(0, 2).join(' ') : String(i + 1);
      const on = id ? ' on' : '';
      const reach = k?.reaching && id === k.reaching ? ' reach' : '';
      const title = law ? `${law.name} — ${law.prop}` : (id ?? 'empty socket');
      return `<div class="h2-sock${on}${reach}" title="${esc(title)}">${esc(short)}${sealed[i] === false && id ? ' ·' : ''}</div>`;
    }).join('');
    const pressed = (k?.laws ?? []).map((l) => {
      const law = cat.get(l.id);
      return `<div class="h2-row"><span>${esc(law?.name ?? l.id.replace(/_/g, ' '))}</span><span class="v">${l.repealing ? 'repealing' : 'pressed'}</span></div>${law ? `<p class="h2-p" style="color:var(--grey)">${esc(law.prop)}</p>` : ''}`;
    }).join('') || '<p class="h2-p">The board is empty. The king has pressed nothing.</p>';
    const reach = k?.reaching ? `<p class="h2-p">The king reaches for <b style="color:var(--amberL)">${esc(cat.get(k.reaching)?.name ?? k.reaching.replace(/_/g, ' '))}</b> (${esc(k.reachingKind ?? 'pass')}).</p>` : '<p class="h2-p" style="color:var(--grey)">The king is not reaching for a law.</p>';
    return `<div class="h2-sec">The wheel · 36 sockets</div>${reach}<div class="h2-board">${cells}</div><div class="h2-sec">Pressed</div>${pressed}`;
  }
  // ───────── inbox & logs ─────────
  omens(tab: 'omens' | 'notable' = 'omens') {
    const hud = this.hud; const tabs = [{ id: 'omens', label: `OMENS (${hud.omens.filter((o) => !o.read).length} new)`, on: tab === 'omens' }, { id: 'notable', label: 'NOTABLE', on: tab === 'notable' }];
    const list = tab === 'omens' ? hud.omens.map((o, i) => `<div class="h2-row" style="align-items:center"><span style="${o.read ? 'color:var(--grey)' : ''}">${o.read ? '' : '✶ '}Day ${day(o.e.tick)}: ${esc(o.e.text)}</span><span style="display:flex;gap:4px"><button class="btn" data-see="${i}">SEE</button></span></div>`).join('') || '<p class="h2-p">No omens yet.</p>'
      : hud.notable.map((e, i) => `<div class="h2-row" style="align-items:center"><span>Day ${day(e.tick)}: ${esc(e.text)}</span>${hud.canJump(e) ? `<button class="btn" data-go="${i}">GO</button>` : ''}</div>`).join('') || '<p class="h2-p">Nothing notable yet.</p>';
    this.open('OMENS', list, (root) => {
      root.querySelectorAll<HTMLElement>('[data-see]').forEach((b) => b.onclick = () => { const o = hud.omens[Number(b.dataset.see)]; o.read = true; hud.badge(); this.close(); hud.cinematic(o.e); });
      root.querySelectorAll<HTMLElement>('[data-go]').forEach((b) => b.onclick = () => { this.close(); hud.jump(hud.notable[Number(b.dataset.go)]); });
    }, tabs, (id) => this.omens(id as never), 'omens');
  }
  log() { this.open('WHISPERS OF THE BURROW', this.hud.feedLog.slice(0, 200).map((e) => `<p class="h2-p">Day ${day(e.tick)}: ${esc(e.text)}</p>`).join('') || '<p class="h2-p">Silence.</p>', undefined, undefined, undefined, 'log'); }
  chronicle(c: ChronicleV2) { this.open('THE CHRONICLE', `${c.reigns.map((r) => `<p class="h2-p"><b style="color:var(--amberL)">${esc(r.name)}</b> of ${esc(r.dynasty)}, day ${day(r.start)}–${r.end ? day(r.end) : 'now'}${r.cause ? `, ${esc(r.cause)}` : ''}</p>`).join('')}`); }
  forecast(f: Forecast) { this.open('WHAT MAY COME', `${f.lines.map((l) => `<p class="h2-p">${esc(clean(l))}</p>`).join('')}<div class="h2-row"><span>CERTAINTY</span><span class="v">${pct(f.confidence)}</span></div>`); }
  // ───────── settings ─────────
  settings() {
    const hud = this.hud, P = hud.world.post; const c = { ...hud.consent };
    const seg = (k: string, opts: [string, string][], cur: string) => `<span class="seg" data-k="${k}">${opts.map(([v, l]) => `<button class="btn${v === cur ? ' on' : ''}" data-v="${v}">${l}</button>`).join('')}</span>`;
    const GROUPS: { id: string; label: string; keys: (keyof import('../../render/v2/post').PostToggles)[] }[] = [
      { id: 'glow', label: 'GLOW', keys: ['lighting', 'bloom', 'rim', 'haze'] },
      { id: 'depth', label: 'DEPTH', keys: ['fog', 'grade', 'vignette'] },
      { id: 'film', label: 'FILM', keys: ['grain', 'ca'] },
      { id: 'scan', label: 'SCAN', keys: ['crt'] },
    ];
    const body = `<div class="h2-sec">Content (this device)</div>
      <div class="h2-tog"><span>Mature content</span>${seg('mature', [['0', 'OFF'], ['1', 'ON']], c.mature ? '1' : '0')}</div>
      <div class="h2-tog"><span>Gore</span>${seg('gore', [['0', 'NONE'], ['1', 'BLOOD'], ['2', 'CARNAGE']], String(c.mature ? c.gore : 0))}</div>
      <div class="h2-tog"><span>Sexual themes</span>${seg('sexual', [['0', 'OFF'], ['1', 'IMPLIED']], c.mature && c.sexual ? '1' : '0')}</div>
      <div class="h2-sec">Picture</div><div class="h2-tog"><span>Quality</span>${seg('tier', [['auto', 'AUTO'], ['high', 'HIGH'], ['mid', 'MID'], ['low', 'LOW']], P.auto ? 'auto' : P.tier)}</div>
      ${GROUPS.map((g) => `<div class="h2-tog"><span>${g.label}</span>${seg('grp:' + g.id, [['1', 'ON'], ['0', 'OFF']], g.keys.every((k) => P.toggles[k]) ? '1' : '0')}</div>`).join('')}
      <p class="h2-p" style="color:var(--grey)">Glow is light and bloom. Depth is fog and colour. Film is grain. Scan is the old tube.</p>
      <div class="h2-sec">Game</div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" data-chron>CHRONICLE</button><button class="btn red" data-new>NEW WORLD</button></div>`;
    this.open('SETTINGS', body, (root) => {
      root.querySelectorAll<HTMLElement>('.seg button').forEach((b) => b.onclick = () => { const k = (b.parentElement as HTMLElement).dataset.k!, v = b.dataset.v!;
        if (k === 'mature') { c.mature = v === '1'; if (!c.mature) { c.gore = 0; c.sexual = false; } } else if (k === 'gore') { c.gore = Number(v) as 0 | 1 | 2; if (c.gore) c.mature = true; } else if (k === 'sexual') { c.sexual = v === '1'; if (c.sexual) c.mature = true; }
        else if (k === 'tier') { if (v === 'auto') P.auto = true; else { P.auto = false; P.setTier(v as Tier); hud.world.onTier(v as Tier); } }
        else if (k.startsWith('grp:')) { const g = GROUPS.find((x) => x.id === k.slice(4)); if (g) for (const key of g.keys) P.toggles[key] = v === '1'; }
        if (['mature', 'gore', 'sexual'].includes(k)) { hud.consent = c; saveConsent(c); hud.sendConsent(); }
        this.settings(); });
      root.querySelector<HTMLElement>('[data-chron]')!.onclick = () => hud.sim.send({ t: 'chronicle' });
      root.querySelector<HTMLElement>('[data-new]')!.onclick = () => { if (confirm('Begin a new world? This one will be lost.')) location.reload(); };
    }, undefined, undefined, 'settings');
  }
}
