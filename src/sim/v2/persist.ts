/** Save the whole burrow, tile arrays included. Terraria writes the modified tile buffer;
 *  regenerating from the seed would forget every gnawed room. */
import type { World } from './state';

const TA: Record<string, { new (n: number): { buffer: ArrayBuffer }; BYTES_PER_ELEMENT: number }> = {
  Uint8Array: Uint8Array as never, Uint16Array: Uint16Array as never, Uint32Array: Uint32Array as never,
  Int8Array: Int8Array as never, Int16Array: Int16Array as never, Int32Array: Int32Array as never,
  Float32Array: Float32Array as never, Float64Array: Float64Array as never,
};

function u8ToB64(u: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u.length; i += CHUNK) s += String.fromCharCode(...u.subarray(i, Math.min(u.length, i + CHUNK)));
  return btoa(s);
}
function b64ToU8(s: string): Uint8Array {
  const bin = atob(s); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

function encode(v: unknown): unknown {
  if (v == null || typeof v !== 'object') return v;
  if (v instanceof Map) return { $: 'M', e: [...v.entries()].map(([k, val]) => [k, encode(val)]) };
  if (v instanceof Set) return { $: 'S', e: [...v.values()].map(encode) };
  if (ArrayBuffer.isView(v) && !(v instanceof DataView)) {
    const u = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    return { $: 'T', n: v.constructor.name, b: u8ToB64(u) };
  }
  if (Array.isArray(v)) return v.map(encode);
  const o: Record<string, unknown> = {};
  for (const k of Object.keys(v as object)) o[k] = encode((v as Record<string, unknown>)[k]);
  return o;
}

function decode(v: unknown): unknown {
  if (v == null || typeof v !== 'object') return v;
  const o = v as { $?: string; e?: unknown; n?: string; b?: string };
  if (o.$ === 'M' && Array.isArray(o.e)) return new Map((o.e as [unknown, unknown][]).map(([k, val]) => [k, decode(val)]));
  if (o.$ === 'S' && Array.isArray(o.e)) return new Set((o.e as unknown[]).map(decode));
  if (o.$ === 'T' && o.n && o.b) {
    const bin = b64ToU8(o.b);
    const Ctor = TA[o.n] as unknown as new (b: ArrayBuffer) => unknown;
    if (!Ctor) return bin;
    const buf = new ArrayBuffer(bin.byteLength);
    new Uint8Array(buf).set(bin);
    return new Ctor(buf);
  }
  if (Array.isArray(v)) return v.map(decode);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as object)) out[k] = decode((v as Record<string, unknown>)[k]);
  return out;
}

export function saveWorld(w: World): string {
  const ghosts = [...w.ghosts.entries()];
  const copy = { ...w, byId: undefined, ghosts: undefined };
  return JSON.stringify({ v: 1, w: encode(copy), ghosts: encode(ghosts) });
}

export function loadWorld(state: string): World {
  const data = JSON.parse(state) as { v?: number; w?: unknown; ghosts?: unknown };
  if (data.v !== 1 || !data.w) throw new Error('not a burrow bottle');
  const w = decode(data.w) as World;
  w.byId = new Map();
  for (const r of w.rats) w.byId.set(r.id, r);
  const ghosts = decode(data.ghosts);
  w.ghosts = ghosts instanceof Map ? ghosts as World['ghosts'] : new Map();
  if (!(w.dirtyTiles instanceof Set)) w.dirtyTiles = new Set();
  if (!(w.dirtyEdges instanceof Set)) w.dirtyEdges = new Set();
  if (!(w.dirtyChambers instanceof Set)) w.dirtyChambers = new Set();
  if (!(w.watched instanceof Set)) w.watched = new Set();
  w.dirtyTiles.clear();
  w.newNodes = []; w.newEdges = []; w.newChambers = [];
  if (!Array.isArray(w.adj) || w.adj.length !== w.nodes.length) {
    w.adj = w.nodes.map(() => []);
    for (const e of w.edges) { w.adj[e.a]?.push(e.id); w.adj[e.b]?.push(e.id); }
  }
  return w;
}
