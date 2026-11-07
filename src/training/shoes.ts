// Shoes assigned to runs automatically by session type (fast shoes for intervals and races, long-run shoes for long
// runs, everyday trainers for the rest), unless the runner picked one for a run. Distance per shoe and retirement
// alerts follow from that.
import type { Activity, SessionType, Shoe, ShoeUse } from '../lib/types';

export const SHOE_USE: Record<ShoeUse, string> = { everyday: 'Everyday', fast: 'Fast sessions and races', long: 'Long runs', trail: 'Trail' };
const FAST: SessionType[] = ['threshold', 'vo2max', 'tempo', 'speed', 'race', 'timetrial', 'strides', 'hills'];
/** Warn this far before the retirement distance (so 600 km for a shoe retired at 700). */
export const WARN_BEFORE_KM = 100;

/** Shoes in use on a day: added on or before it, and not retired before it. */
const inUse = (shoes: Shoe[], day: string) => shoes.filter((s) => s.startDate <= day && !(s.retiredAt && s.retiredAt < day));

/** The shoe a run counts for: the runner's choice, else the newest shoe in use whose type suits the session. */
export function shoeForRun(a: Pick<Activity, 'startTime' | 'shoeId'>, type: SessionType, shoes: Shoe[]): Shoe | undefined {
  if (a.shoeId) { const s = shoes.find((x) => x.id === a.shoeId); if (s) return s; }
  const day = a.startTime.slice(0, 10);
  const avail = inUse(shoes, day).filter((s) => (s.use ?? 'everyday') !== 'trail').sort((x, y) => y.startDate.localeCompare(x.startDate));
  if (!avail.length) return undefined;
  const want: ShoeUse[] = FAST.includes(type) ? ['fast', 'everyday'] : type === 'long' ? ['long', 'everyday'] : ['everyday'];
  for (const u of want) { const s = avail.find((x) => (x.use ?? 'everyday') === u); if (s) return s; }
  return avail[0];
}

/** Kilometres per shoe (including the distance it had when added). */
export function shoeTotals(acts: Activity[], shoes: Shoe[], typeOf: (a: Activity) => SessionType): Map<string, number> {
  const km = new Map(shoes.map((s) => [s.id, s.startKm]));
  if (!shoes.length) return km;
  for (const a of acts) {
    if (a.hidden) continue;
    const s = shoeForRun(a, typeOf(a), shoes);
    if (s) km.set(s.id, (km.get(s.id) ?? 0) + a.distanceM / 1000);
  }
  return km;
}

/** 'retire' at or past the limit, 'soon' within WARN_BEFORE_KM of it, otherwise undefined. */
export function shoeAlert(s: Shoe, km: number): 'retire' | 'soon' | undefined {
  if (s.retired) return undefined;
  return km >= s.retireKm ? 'retire' : km >= s.retireKm - WARN_BEFORE_KM ? 'soon' : undefined;
}
