// World layout in native pixels. A side-view cross-section: the neon street on top,
// a central shaft, districts in two columns, and the throne hall at the very bottom.
import { R, SURFACE } from '../sim/types';

export const WORLD_W = 768;
export const STREET_H = 220;
export const SHAFT_X = 384; // centre of the vertical shaft
/** native size of every final room scene (shown 1:1, uncropped) */
export const ROOM_W = 360, ROOM_H = 220;
export interface Box { x: number; y: number; w: number; h: number; floor: number }
const ROW_Y = (i: number) => STREET_H + 16 + i * (ROOM_H + 14);
const L = (row: number): Box => ({ x: 8, y: ROW_Y(row), w: ROOM_W, h: ROOM_H, floor: ROW_Y(row) + 202 });
const Rt = (row: number): Box => ({ x: WORLD_W - 8 - ROOM_W, y: ROW_Y(row), w: ROOM_W, h: ROOM_H, floor: ROW_Y(row) + 202 });
export const THRONE_Y = ROW_Y(6);
export const ROOM_BOX: Box[] = [];
ROOM_BOX[R.entrance] = L(0); ROOM_BOX[R.granary] = Rt(0);
ROOM_BOX[R.nursery] = L(1); ROOM_BOX[R.workshop] = Rt(1);
ROOM_BOX[R.warren] = L(2); ROOM_BOX[R.plaza] = Rt(2);
ROOM_BOX[R.shrine] = L(3); ROOM_BOX[R.barracks] = Rt(3);
ROOM_BOX[R.graveyard] = L(4); ROOM_BOX[R.slum] = Rt(4);
ROOM_BOX[R.deepwarren] = L(5);
ROOM_BOX[R.throne] = { x: (WORLD_W - ROOM_W) / 2, y: THRONE_Y, w: ROOM_W, h: ROOM_H, floor: THRONE_Y + 196 };
export const STREET_BOX: Box = { x: 0, y: 0, w: WORLD_W, h: STREET_H, floor: 208 };
export const WORLD_H = THRONE_Y + ROOM_H + 120; // earth below the throne so the camera can centre it
export const box = (room: number): Box => (room === SURFACE ? STREET_BOX : ROOM_BOX[room] ?? STREET_BOX);
/** king's seat on the throne (feet position) */
export const THRONE_SEAT = { x: (WORLD_W - ROOM_W) / 2 + 182, y: THRONE_Y + 150 };
/** sim item x (0..360 street units) → world x */
export const streetX = (x: number) => Math.round((x / 360) * (WORLD_W - 48) + 24);

/** deterministic hash → [0,1) */
export function h01(a: number, b = 0) { let x = (a * 374761393 + b * 668265263) | 0; x = (x ^ (x >>> 13)) * 1274126177; x ^= x >>> 16; return ((x >>> 0) % 100000) / 100000; }

/** A resting spot for rat `id` inside a room. */
export function spot(room: number, id: number, salt = 0): { x: number; y: number } {
  const b = box(room);
  if (room === R.throne) return { x: b.x + 40 + h01(id, salt) * (b.w - 80), y: b.floor - 2 - h01(id, salt + 7) * 10 };
  const margin = 26;
  return { x: b.x + margin + h01(id, salt) * (b.w - margin * 2), y: b.floor - h01(id, salt + 7) * 22 };
}

/** Waypoints from one room to another through the shaft. */
export function route(from: { x: number; y: number }, fromRoom: number, toRoom: number, to: { x: number; y: number }): { x: number; y: number }[] {
  if (fromRoom === toRoom) return [to];
  const a = box(fromRoom), b = box(toRoom);
  const pts: { x: number; y: number }[] = [];
  pts.push({ x: SHAFT_X, y: fromRoom === SURFACE ? STREET_BOX.floor : a.floor });
  pts.push({ x: SHAFT_X, y: toRoom === SURFACE ? STREET_BOX.floor : b.floor });
  pts.push(to);
  void from;
  return pts;
}
