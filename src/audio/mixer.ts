// v1 compatibility shim: the old Mixer API (set/update/holdState/title/setMusicOn) over the v2 director.
// The v2 game should call updateFromSim()/setMusicState() from ./index instead.
import type { Snapshot } from '../sim/sim';
import { setMusicState, setIntent, setMusicEnabled, setAmbience, ambMix, setListener, frame } from './index';
import type { MusicState as V2State } from './state';

export type MusicState = 'title' | 'calm' | 'tension' | 'famine' | 'rebellion' | 'vote' | 'death' | 'succession' | 'silence';
const MAP: Record<MusicState, V2State> = { title: 'title', calm: 'calm', tension: 'unease', famine: 'famine', rebellion: 'rebellion', vote: 'vote', death: 'funeral', succession: 'succession', silence: 'game_over' };
let raf = 0; const loop = () => { frame(); raf = requestAnimationFrame(loop); };

export class Mixer {
  state: MusicState | null = null; private hold: { s: MusicState; until: number } | null = null; private inGame = false;
  constructor() { if (typeof requestAnimationFrame !== 'undefined' && !raf) raf = requestAnimationFrame(loop); }
  setMusicOn(v: boolean) { setMusicEnabled(v); }
  set(s: MusicState, now = false) { this.state = s; setMusicState(MAP[s], { immediate: now }); }
  holdState(s: MusicState, ms: number) { this.hold = { s, until: performance.now() + ms }; this.state = s; setMusicState(null); this.inGame = true; setIntent({ state: MAP[s], tension: 0.6, night: false, era: 0, faith: 0, reason: 'v1 hold' }); }
  title() { this.inGame = false; this.set('title', true); setAmbience({ amb_street_rain: 0.5, amb_sewer_drips: 0.3 }); }
  update(snap: Snapshot, viewY: number, streetH: number) {
    if (!this.inGame) { this.inGame = true; setMusicState(null); }
    const st = snap.stats; const now = performance.now();
    let want: MusicState;
    if (snap.phase === 'dead') want = 'silence';
    else if (snap.gathering) want = 'vote';
    else if (this.hold && now < this.hold.until) want = this.hold.s;
    else if (snap.phase === 'interregnum') want = 'death';
    else if (snap.phase === 'founding') want = 'calm';
    else if (st.pop > 0 && st.food / st.pop < 1 && (st.food < 5 || snap.king.plate === 'empty')) want = 'famine';
    else if (st.anger > 0.62 || st.grievance > 0.7) want = 'rebellion';
    else if (st.mood < 0.4 || st.fear > 0.5 || st.anger > 0.42 || snap.king.dying) want = 'tension';
    else want = 'calm';
    this.state = want;
    const tension = Math.min(1, 0.15 + Math.max(st.anger, st.fear, st.grievance * 0.8, 1 - st.mood) * 0.85);
    const v2: V2State = snap.phase === 'founding' && want === 'calm' ? 'founding' : MAP[want];
    if (want === 'silence') setMusicState('game_over'); else setIntent({ state: v2, tension, night: false, era: 0, faith: 0, reason: 'v1 ' + want });
    setListener({ y: viewY });
    const silent = snap.phase === 'interregnum' || snap.phase === 'dead' || (snap.king.alive && snap.king.emptyDays >= 2);
    setAmbience(ambMix({ underground: viewY < streetH + 120 ? 0 : 1, rain: viewY < streetH + 120 ? 0.6 : 0.1, storm: false, machines: Math.min(1, st.power), crowd: Math.min(0.55, (st.pop / 160) * 0.35 + (snap.gathering ? 0.35 : 0)), dread: silent, dead: snap.phase === 'dead', night: false }));
  }
}
