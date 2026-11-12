// Self-contained reminder logic for push notifications. No imports, so the same file runs in the app and in the
// push server function (Deno); supabase/functions/_shared/push-core.ts is a copy, checked by a test.
// Update 2, §15. Grouped like Profile › Reminders:
//   Training: today's session (morning), haven't logged a run (evening), no run for a while, missed key session,
//             low readiness, how did it feel? (about an hour after a synced run)
//   Races and gear: race countdown (7 days, 2 days, race eve), weekly summary (Sunday 19:00), shoes nearly worn out
//   Hub: follow requests and new followers; Fuego and comments
// Rules: quiet hours (default 21:30–06:30; a reminder timed inside them comes just after, or for evening ones just
// before); no training nudges on rest days, while unwell, while training is paused for an injury, or (for "no run
// for a while" and "missed key session") in race week; at most one morning training reminder a day, by priority:
// missed key session, low readiness, today's session, no run for a while. Kind wording, never guilt.

export interface Reminders {
  /** "HH:MM" local time of the morning reminder, or null for off */
  morning: string | null;
  /** "HH:MM" local time of the evening check-in, or null for off */
  evening: string | null;
  /** After this many days with no run (2–5), or null for off */
  noRunDays?: number | null;
  missedKey?: boolean;
  lowReadiness?: boolean;
  feel?: boolean;
  race?: boolean;
  weekly?: boolean;
  /** Off by default */
  shoes?: boolean;
  hubFollows?: boolean;
  hubFuego?: boolean;
  /** Quiet hours, "HH:MM" */
  quietStart?: string;
  quietEnd?: string;
}
export const DEFAULT_REMINDERS: Reminders = {
  morning: '07:00', evening: '20:00', noRunDays: 3, missedKey: true, lowReadiness: true, feel: true,
  race: true, weekly: true, shoes: false, hubFollows: true, hubFuego: true, quietStart: '21:30', quietEnd: '06:30',
};
/** Saved settings with the defaults for anything added since they were saved (a time set to off stays off) */
export const withDefaults = (r?: Partial<Reminders> | null): Reminders => ({ ...DEFAULT_REMINDERS, ...(r ?? {}) });

export interface PushSession { id: string; date: string; type: string; title: string; distanceM: number; durationS: number; status?: string }
export interface PushMessage { title: string; body: string; url: string; tag: string }
/** The app's adapted sessions for the coming days (after pain check-ins, a lighter week, travel...), saved with the profile */
export interface PushAdapted { from: string; to: string; sessions: PushSession[] }

/** The stored plan with the app's adapted sessions in place for the days they cover, so reminders match Training. */
export function withAdapted(stored: PushSession[], hint?: PushAdapted): PushSession[] {
  if (!hint?.sessions || !hint.from || !hint.to) return stored;
  return [...stored.filter((s) => s.date < hint.from || s.date > hint.to), ...hint.sessions].sort((a, b) => a.date.localeCompare(b.date));
}

/** A reminder sent up to this long after its time (the server checks every 15 minutes), never twice a day. */
export const LATE_WINDOW_MIN = 60;

const valid = (t: string | null | undefined): t is string => !!t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** The local date (YYYY-MM-DD) and minutes since midnight in a time zone; falls back to UTC for an unknown zone. */
export function localNow(now: Date, timeZone: string): { date: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  } catch {
    return localNow(now, 'UTC');
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** Is this reminder due now? lastSent is the local date it was last sent on this device. */
export function isDue(time: string | null | undefined, minutes: number, today: string, lastSent: string | null | undefined): boolean {
  if (!valid(time) || lastSent === today) return false;
  const start = toMin(time);
  return minutes >= start && minutes < start + LATE_WINDOW_MIN;
}

// Same rounding as every screen in the app (one decimal, no trailing .0), so a reminder says what Training says
const dist = (m: number, u: 'km' | 'mi') => { const v = u === 'mi' ? m / 1609.344 : m / 1000; return `${Math.round(v * 10) / 10} ${u}`; };
const amount = (s: PushSession, u: 'km' | 'mi') => (s.distanceM > 0 ? dist(s.distanceM, u) : s.durationS > 0 ? `${Math.round(s.durationS / 60)} min` : '');

/** Today's sessions that count for reminders: planned training, not rest. */
export const todaysSessions = (sessions: PushSession[], today: string) => sessions.filter((s) => s.date === today && s.type !== 'rest');

export function morningMessage(sessions: PushSession[], today: string, units: 'km' | 'mi'): PushMessage | null {
  const list = todaysSessions(sessions, today).filter((s) => !s.status || s.status === 'planned');
  if (!list.length) return null;
  const s = list[0];
  if (s.type === 'race') return { title: `Race day: ${s.title}`, body: 'Your race plan, splits and warm-up are ready in Ritmo. Enjoy it.', url: '/', tag: `morning-${today}` };
  const a = amount(s, units);
  const more = list.length > 1 ? ` (plus ${list.length - 1} more)` : '';
  return { title: `Today: ${s.title}${more}`, body: `${a ? `${a}. ` : ''}Tap to see the session.`, url: '/', tag: `morning-${today}` };
}

/**
 * Evening check-in: only when a session today is still open. ranToday is true when any run for today has arrived
 * (logged, synced or waiting to be added), so a run never gets a "did you run?" message.
 */
export function eveningMessage(sessions: PushSession[], today: string, ranToday: boolean): PushMessage | null {
  if (ranToday) return null;
  const open = todaysSessions(sessions, today).filter((s) => (!s.status || s.status === 'planned') && s.type !== 'race');
  if (!open.length) return null;
  return {
    title: 'How did today go?',
    body: `${open[0].title} is still open. Log your run, or mark it skipped so your plan can adjust.`,
    url: '/', tag: `evening-${today}`,
  };
}

// ---------------------------------------------------------------- update 2, §15

const QUALITY = ['tempo', 'threshold', 'vo2max', 'hills', 'speed', 'intervals', 'timetrial', 'long'];
const HARD = ['tempo', 'threshold', 'vo2max', 'hills', 'speed', 'intervals', 'timetrial'];
const DAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const hhmm = (m: number) => `${String(Math.floor((((m % 1440) + 1440) % 1440) / 60)).padStart(2, '0')}:${String((((m % 1440) + 1440) % 1440) % 60).padStart(2, '0')}`;
const addDaysYmd = (d: string, n: number) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const daysBetweenYmd = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86400000);
/** Monday = 0 */
export const weekdayOf = (d: string) => (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;

/** Inside quiet hours (which may run past midnight)? */
export function inQuiet(minutes: number, r: Reminders): boolean {
  if (!valid(r.quietStart) || !valid(r.quietEnd)) return false;
  const a = toMin(r.quietStart), b = toMin(r.quietEnd);
  return a === b ? false : a < b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
}
/** When a reminder set for `time` actually goes: just after quiet hours, or (evening ones) just before they start */
export function slotTime(time: string | null | undefined, r: Reminders, kind: 'morning' | 'evening'): string | null {
  if (!valid(time)) return null;
  const m = toMin(time);
  if (!inQuiet(m, r)) return time;
  return kind === 'morning' ? (r.quietEnd as string) : hhmm(toMin(r.quietStart as string) - 15);
}

export interface PushRace { id: string; name: string; date: string }
export interface PushRun { id: string; name: string; endedAtMs: number; synced: boolean; hasFeel: boolean }
export interface PushShoe { id: string; name: string; pct: number }
export interface PushHubGroup { kind: 'follow_request' | 'follow' | 'ritmo' | 'comment' | 'reply' | 'mention'; names: string[]; postId?: string | null }
/** What a device was already sent (local dates and ids), so each reminder goes once */
export interface Sent { training?: string; noRun?: string; race?: string[]; weekly?: string; feel?: string[]; shoes?: string[] }

export interface PushInput {
  date: string;
  minutes: number;
  nowMs: number;
  r: Reminders;
  units: 'km' | 'mi';
  sessions: PushSession[];
  lastMorning?: string | null;
  lastEvening?: string | null;
  sent: Sent;
  ranToday: boolean;
  ranYesterday: boolean;
  /** Local date of the last run, any source */
  lastRunDate?: string;
  ill: boolean;
  /** Hard training paused (a warning sign reported in Body) */
  paused: boolean;
  races: PushRace[];
  /** Today's readiness as the app last worked it out (used only when it is from today) */
  readiness?: { date: string; score: number; band: 'recover' | 'easy' | 'hard' };
  week?: { km: number; runs: number; done: number; planned: number };
  recentRuns: PushRun[];
  shoes: PushShoe[];
  hub: PushHubGroup[];
}
export interface PushPlan { messages: PushMessage[]; sent: Sent; lastMorning?: string; lastEvening?: string; hubHandled: boolean }

const names = (n: string[]) => (n.length === 1 ? n[0] : `${n[0]} and ${n.length - 1} other${n.length > 2 ? 's' : ''}`);
export function hubMessage(g: PushHubGroup): PushMessage {
  const who = names(g.names.length ? g.names : ['Someone']);
  const url = g.kind === 'ritmo' || g.kind === 'comment' || g.kind === 'reply' || g.kind === 'mention' || g.kind.startsWith('follow') ? '/hub/notifications' : '/hub';
  const [title, body] = g.kind === 'follow_request' ? [`${who} asked to follow you`, 'Accept or decline in the Hub.']
    : g.kind === 'follow' ? [`${who} started following you`, 'Follow back from the Hub.']
    : g.kind === 'ritmo' ? [`${who} gave your run a Fuego`, 'See who in the Hub.']
    : g.kind === 'reply' ? [`${who} replied to your comment`, 'Tap to read and reply.']
    : g.kind === 'mention' ? [`${who} mentioned you`, 'Tap to read and reply.']
    : [`${who} commented on your run`, 'Tap to read and reply.'];
  return { title, body, url, tag: `hub-${g.kind}-${g.postId ?? g.names.join(',')}` };
}

/** Every reminder due for one device now, and what to remember as sent */
export function planPush(i: PushInput): PushPlan {
  const r = i.r;
  const out: PushMessage[] = [];
  const sent: Sent = { ...i.sent, race: [...(i.sent.race ?? [])], feel: [...(i.sent.feel ?? [])], shoes: [...(i.sent.shoes ?? [])] };
  const quiet = inQuiet(i.minutes, r);
  const plan: PushPlan = { messages: out, sent, hubHandled: false };
  const today = todaysSessions(i.sessions, i.date);
  const restDay = i.sessions.some((s) => s.date === i.date) && !today.length;
  const raceWeek = i.races.some((x) => { const d = daysBetweenYmd(i.date, x.date); return d >= 0 && d <= 7; });
  const yesterday = addDaysYmd(i.date, -1);

  // ---- Morning slot: one training reminder, by priority ----
  const morningAt = slotTime(r.morning ?? '07:00', r, 'morning');
  if (isDue(morningAt, i.minutes, i.date, i.lastMorning)) {
    plan.lastMorning = i.date;
    let msg: PushMessage | null = null;
    if (!i.ill) {
      const missed = r.missedKey && !i.paused && !raceWeek && !i.ranYesterday
        ? i.sessions.find((s) => s.date === yesterday && QUALITY.includes(s.type) && (!s.status || s.status === 'planned' || s.status === 'missed')) : undefined;
      const hardToday = today.find((s) => HARD.includes(s.type) && (!s.status || s.status === 'planned'));
      if (missed) msg = { title: `Missed ${DAY[weekdayOf(missed.date)]}'s ${missed.title.toLowerCase()}?`, body: 'Move it to another day this week or skip it. Your plan adjusts either way.', url: `/?missed=${encodeURIComponent(missed.id)}`, tag: `missed-${missed.id}` };
      else if (r.lowReadiness && !i.paused && hardToday && i.readiness?.date === i.date && i.readiness.band !== 'hard') {
        msg = { title: `Readiness ${Math.round(i.readiness.score)}: take it easier today?`, body: `Swap today's ${hardToday.title.toLowerCase()} for an easy run? Your body is still recovering.`, url: '/readiness', tag: `readiness-${i.date}` };
      } else if (r.morning) msg = morningMessage(i.sessions, i.date, i.units);
      if (!msg && r.noRunDays && i.lastRunDate && !i.paused && !raceWeek && !restDay && !i.ranToday && sent.noRun !== i.lastRunDate) {
        const n = daysBetweenYmd(i.lastRunDate, i.date);
        // Days that were planned as rest don't count as a gap
        const gap = Array.from({ length: Math.max(0, n - 1) }, (_, k) => addDaysYmd(i.lastRunDate as string, k + 1));
        const allRest = gap.length > 0 && gap.every((d) => i.sessions.some((s) => s.date === d) && !i.sessions.some((s) => s.date === d && s.type !== 'rest'));
        if (n >= r.noRunDays && !allRest) {
          msg = { title: 'Ready for an easy run?', body: `It's been ${n} days since your last run. A relaxed 30 minutes gets you back in rhythm.`, url: '/', tag: `norun-${i.lastRunDate}` };
          sent.noRun = i.lastRunDate;
        }
      }
    }
    if (msg) { out.push(msg); sent.training = i.date; }

    // Races and gear go at the same time of day, on their own
    if (r.race) for (const x of i.races) {
      const d = daysBetweenYmd(i.date, x.date);
      const key = `${x.id}:${d}`;
      if (![7, 2, 1].includes(d) || sent.race!.includes(key)) continue;
      sent.race!.push(key);
      out.push(d === 7 ? { title: `${x.name} is a week away`, body: 'Keep the runs easy and sleep well. Kit check: shoes, bib and pins, watch charged, gels.', url: `/race/${x.id}`, tag: `race-${key}` }
        : d === 2 ? { title: `${x.name} is in 2 days`, body: 'Lay out your kit: shoes, bib and pins, watch charged, gels, a layer for the start.', url: `/race/${x.id}`, tag: `race-${key}` }
        : { title: `Race tomorrow: ${x.name}`, body: 'Kit ready? Shoes, bib and pins, watch charged, gels. An easy evening and an early night.', url: `/race/${x.id}/day`, tag: `race-${key}` });
      break;
    }
    if (r.shoes) for (const s of i.shoes) {
      if (s.pct < 85 || sent.shoes!.includes(s.id)) continue;
      sent.shoes!.push(s.id);
      out.push({ title: `${s.name}: nearly worn out`, body: `They're at ${Math.round(s.pct)}% of their life. Time to think about a new pair.`, url: '/profile/shoes', tag: `shoe-${s.id}` });
      break;
    }
  }

  // ---- Evening check-in ----
  const eveningAt = slotTime(r.evening, r, 'evening');
  if (isDue(eveningAt, i.minutes, i.date, i.lastEvening)) {
    plan.lastEvening = i.date;
    const msg = i.ill ? null : eveningMessage(i.sessions, i.date, i.ranToday);
    if (msg) out.push(msg);
  }

  // ---- Weekly summary, Sunday 19:00 ----
  if (r.weekly && i.week && weekdayOf(i.date) === 6 && isDue(slotTime('19:00', r, 'evening'), i.minutes, i.date, sent.weekly)) {
    sent.weekly = i.date;
    const next = i.sessions.filter((s) => s.date > i.date && s.date <= addDaysYmd(i.date, 7) && QUALITY.includes(s.type)).sort((a, b) => a.date.localeCompare(b.date))[0];
    const w = i.week;
    out.push({ title: 'Your week', body: `${dist(w.km * 1000, i.units)} in ${w.runs} run${w.runs === 1 ? '' : 's'}${w.planned ? ` · ${w.done} of ${w.planned} sessions done` : ''}.${next ? ` Next week's key session: ${next.title} on ${DAY[weekdayOf(next.date)]}.` : ''}`, url: '/you', tag: `weekly-${i.date}` });
  }

  if (!quiet) {
    // ---- How did it feel? About an hour after a synced run ----
    if (r.feel) {
      const run = i.recentRuns.find((x) => x.synced && !x.hasFeel && !sent.feel!.includes(x.id) && i.nowMs - x.endedAtMs >= 55 * 60e3 && i.nowMs - x.endedAtMs <= 4 * 3600e3);
      if (run) {
        sent.feel = [...sent.feel!, run.id].slice(-20);
        out.push({ title: 'How did it feel?', body: `Tell Ritmo how your ${run.name.toLowerCase()} felt, so your plan can adjust.`, url: `/activity/${encodeURIComponent(run.id)}`, tag: `feel-${run.id}` });
      }
    }
    // ---- Hub: held through quiet hours, then delivered ----
    plan.hubHandled = true;
    for (const g of i.hub.slice(0, 3)) {
      const on = g.kind === 'follow_request' || g.kind === 'follow' ? r.hubFollows : r.hubFuego;
      if (on) out.push(hubMessage(g));
    }
  }
  return plan;
}
