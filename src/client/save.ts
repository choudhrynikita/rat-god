// Save slot: IndexedDB with a localStorage fallback.
export interface SaveRec { state: string; day: number; seed: number; at: number }
const DB = 'ratgod', STORE = 'saves', KEY = 'slot0', LS = 'ratgod.slot0';
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
export async function writeSave(rec: SaveRec) {
  try { const db = await idb(); await new Promise<void>((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(rec, KEY); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); db.close(); try { localStorage.removeItem(LS); } catch { /* */ } }
  catch { try { localStorage.setItem(LS, JSON.stringify(rec)); } catch { /* quota */ } }
}
export async function readSave(): Promise<SaveRec | null> {
  try { const db = await idb(); const v = await new Promise<SaveRec | undefined>((res, rej) => { const r = db.transaction(STORE).objectStore(STORE).get(KEY); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); db.close(); if (v) return v; } catch { /* */ }
  try { const s = localStorage.getItem(LS); return s ? JSON.parse(s) : null; } catch { return null; }
}
export async function clearSave() {
  try { const db = await idb(); await new Promise<void>((res) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(KEY); tx.oncomplete = () => res(); tx.onerror = () => res(); }); db.close(); } catch { /* */ }
  try { localStorage.removeItem(LS); } catch { /* */ }
}
export const prefs = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem('ratgod.pref.' + k); return v == null ? d : (JSON.parse(v) as T); } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem('ratgod.pref.' + k, JSON.stringify(v)); } catch { /* */ } },
};
