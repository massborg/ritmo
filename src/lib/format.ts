export type Units = 'km' | 'mi';
const MI = 1609.344;

export const toUnit = (m: number, u: Units) => (u === 'km' ? m / 1000 : m / MI);

export function dist(m: number, u: Units, digits = 1): string {
  return `${toUnit(m, u).toFixed(digits)} ${u}`;
}

export function distNum(m: number, u: Units, digits = 1): string {
  return toUnit(m, u).toFixed(digits);
}

export function duration(s: number): string {
  s = Math.round(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function durationWords(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** pace in seconds per km -> "4:35/km" or per mile */
export function pace(sPerKm: number, u: Units, withUnit = true): string {
  if (!isFinite(sPerKm) || sPerKm <= 0) return '–';
  const s = u === 'km' ? sPerKm : sPerKm * (MI / 1000);
  const m = Math.floor(s / 60);
  let sec = Math.round(s % 60);
  let mm = m;
  if (sec === 60) {
    mm += 1;
    sec = 0;
  }
  return `${mm}:${String(sec).padStart(2, '0')}${withUnit ? `/${u}` : ''}`;
}

export function paceRange(a: number, b: number, u: Units) {
  return `${pace(a, u, false)}–${pace(b, u)}`;
}

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const daysBetween = (a: Date, b: Date) =>
  Math.round((parseYmd(ymd(b)).getTime() - parseYmd(ymd(a)).getTime()) / 86400000);

/** Monday-based weekday 0..6 */
/** Whole days from today to a date (0 = today). The one countdown used everywhere. */
export const daysUntil = (today: Date, date: string) => daysBetween(parseYmd(ymd(today)), parseYmd(date));

export const weekday = (d: Date) => (d.getDay() + 6) % 7;

export const startOfWeek = (d: Date) => addDays(parseYmd(ymd(d)), -weekday(d));

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function longDate(d: Date) {
  return `${DAY_NAMES[weekday(d)]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}
export function shortDate(d: Date) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function relTime(iso: string, now = new Date()) {
  const diff = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  return `${Math.round(diff / 86400)} days ago`;
}

export const uid = () =>
  (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
  Math.random().toString(36).slice(2) + Date.now().toString(36);

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export const RACE_DISTANCES: { label: string; m: number }[] = [
  { label: '5K', m: 5000 },
  { label: '10K', m: 10000 },
  { label: 'Half marathon', m: 21097.5 },
  { label: 'Marathon', m: 42195 },
];

export function distanceLabel(m: number) {
  const r = RACE_DISTANCES.find((x) => Math.abs(x.m - m) < 60);
  return r ? r.label : `${(m / 1000).toFixed(1)} km`;
}
