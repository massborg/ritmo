// The HYROX session being recorded, kept on the device (IndexedDB) after every tap and every few seconds, so a
// crash, a reload or a closed app does not lose it.
import { get, set, del } from 'idb-keyval';
import type { Live } from './hyrox';

export const liveKey = (userId?: string) => `ritmo:hyrox:active:${userId ?? 'anon'}`;
export const saveLive = (key: string, l: Live) => set(key, l).catch(() => {});
export const loadLive = (key: string) => get(key).then((v) => v as Live | undefined).catch(() => undefined);
export const clearLive = (key: string) => del(key).catch(() => {});
