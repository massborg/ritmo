// Update 2, §15: more reminder types and the rules around them.
import { describe, expect, it } from 'vitest';
import { inQuiet, planPush, slotTime, withDefaults, type PushInput, type PushSession } from './push-core';

const S = (o: Partial<PushSession>): PushSession => ({ id: o.date ?? 'x', date: '2026-11-12', type: 'easy', title: 'Easy run', distanceM: 8000, durationS: 2700, status: 'planned', ...o });
const at = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const base = (o: Partial<PushInput> = {}): PushInput => ({
  date: '2026-11-12', minutes: at('07:05'), nowMs: Date.parse('2026-11-12T07:05:00Z'), r: withDefaults({ morning: null, evening: null }), units: 'km',
  sessions: [], sent: {}, ranToday: false, ranYesterday: false, lastRunDate: '2026-11-09', ill: false, paused: false,
  races: [], recentRuns: [], shoes: [], hub: [], ...o,
});
const titles = (i: PushInput) => planPush(i).messages.map((m) => m.title);

describe('No run for a while (the acceptance case)', () => {
  it('3 days with no run and no rest days planned: one reminder in the morning, outside quiet hours', () => {
    const sessions = [S({ date: '2026-11-10' }), S({ date: '2026-11-11' }), S({ date: '2026-11-12' })];
    const p = planPush(base({ sessions }));
    expect(p.messages).toHaveLength(1);
    expect(p.messages[0]).toMatchObject({ title: 'Ready for an easy run?', body: "It's been 3 days since your last run. A relaxed 30 minutes gets you back in rhythm.", url: '/' });
    expect(p.sent.noRun).toBe('2026-11-09');
    // Only once for that gap, even on later mornings
    expect(titles(base({ date: '2026-11-13', sessions, sent: p.sent }))).toEqual([]);
  });
  it('not while rest mode ("Feeling unwell?") is on, nor while training is paused, nor in race week', () => {
    expect(titles(base({ ill: true }))).toEqual([]);
    expect(titles(base({ paused: true }))).toEqual([]);
    expect(titles(base({ races: [{ id: 'r', name: 'Safi 5K', date: '2026-11-17' }] })).some((t) => /easy run/.test(t))).toBe(false);
  });
  it('not on a rest day, nor when the days without running were planned rest', () => {
    expect(titles(base({ sessions: [S({ date: '2026-11-12', type: 'rest' })] }))).toEqual([]);
    expect(titles(base({ sessions: [S({ date: '2026-11-10', type: 'rest' }), S({ date: '2026-11-11', type: 'rest' })] }))).toEqual([]);
  });
  it('honours the chosen number of days', () => {
    expect(titles(base({ r: withDefaults({ morning: null, evening: null, noRunDays: 4 }) }))).toEqual([]);
    expect(titles(base({ r: withDefaults({ morning: null, evening: null, noRunDays: null }) }))).toEqual([]);
  });
});

describe('one training reminder a day, by priority', () => {
  const r = withDefaults({ morning: '07:00', evening: null });
  it('missed key session first, with a link to move or skip it', () => {
    const p = planPush(base({ r, lastRunDate: '2026-11-10', sessions: [S({ id: 'thr', date: '2026-11-11', type: 'threshold', title: 'Threshold intervals' }), S({ date: '2026-11-12' })] }));
    expect(p.messages.map((m) => m.title)).toEqual(["Missed Wednesday's threshold intervals?"]);
    expect(p.messages[0].url).toBe('/?missed=thr');
  });
  it('then low readiness on a hard day', () => {
    const p = planPush(base({ r, lastRunDate: '2026-11-11', sessions: [S({ date: '2026-11-12', type: 'vo2max', title: '6 x 800 m' })], readiness: { date: '2026-11-12', score: 34, band: 'recover' } }));
    expect(p.messages.map((m) => m.title)).toEqual(['Readiness 34: take it easier today?']);
    expect(p.messages[0].body).toBe("Swap today's 6 x 800 m for an easy run? Your body is still recovering.");
  });
  it('then today\'s session; readiness from another day is ignored', () => {
    const p = planPush(base({ r, lastRunDate: '2026-11-11', sessions: [S({ date: '2026-11-12', type: 'vo2max', title: '6 x 800 m' })], readiness: { date: '2026-11-11', score: 30, band: 'recover' } }));
    expect(p.messages.map((m) => m.title)).toEqual(['Today: 6 x 800 m']);
  });
  it('never twice in a morning', () => {
    expect(titles(base({ r, lastMorning: '2026-11-12', sessions: [S({})] }))).toEqual([]);
  });
});

describe('quiet hours', () => {
  const r = withDefaults({});
  it('default 21:30 to 06:30, across midnight', () => {
    expect(inQuiet(at('22:00'), r)).toBe(true);
    expect(inQuiet(at('03:00'), r)).toBe(true);
    expect(inQuiet(at('06:30'), r)).toBe(false);
    expect(inQuiet(at('21:29'), r)).toBe(false);
  });
  it('a morning reminder set inside them comes just after; an evening one just before', () => {
    expect(slotTime('06:00', r, 'morning')).toBe('06:30');
    expect(slotTime('22:00', r, 'evening')).toBe('21:15');
    expect(slotTime('07:00', r, 'morning')).toBe('07:00');
  });
  it('Hub notifications wait until quiet hours end', () => {
    const hub = [{ kind: 'follow_request' as const, names: ['Tom Vella'] }];
    const night = planPush(base({ minutes: at('23:10'), hub }));
    expect(night.messages).toEqual([]);
    expect(night.hubHandled).toBe(false);
    const morning = planPush(base({ minutes: at('09:00'), hub }));
    expect(morning.messages[0]).toMatchObject({ title: 'Tom Vella asked to follow you', url: '/hub/notifications' });
    expect(morning.hubHandled).toBe(true);
  });
});

describe('races, gear, summary and how it felt', () => {
  it('race countdown at 7 days, 2 days and race eve, each once, with a kit check', () => {
    const races = [{ id: 'safi', name: 'Safi 5K', date: '2026-11-19' }];
    const p = planPush(base({ races, lastRunDate: '2026-11-11' }));
    expect(p.messages[0]).toMatchObject({ title: 'Safi 5K is a week away', url: '/race/safi' });
    expect(p.messages[0].body).toMatch(/Kit check/);
    expect(titles(base({ races, lastRunDate: '2026-11-11', sent: p.sent, lastMorning: null }))).toEqual([]);
    expect(titles(base({ date: '2026-11-18', races, lastRunDate: '2026-11-17' }))).toEqual(['Race tomorrow: Safi 5K']);
  });
  it('weekly summary on Sunday at 19:00', () => {
    const p = planPush(base({ date: '2026-11-15', minutes: at('19:05'), lastRunDate: '2026-11-15', week: { km: 42.3, runs: 5, done: 4, planned: 5 }, sessions: [S({ date: '2026-11-18', type: 'tempo', title: 'Tempo 6 km' })] }));
    expect(p.messages[0]).toMatchObject({ title: 'Your week', url: '/you' });
    expect(p.messages[0].body).toBe("42.3 km in 5 runs · 4 of 5 sessions done. Next week's key session: Tempo 6 km on Wednesday.");
  });
  it('how did it feel? about an hour after a synced run without a feeling', () => {
    const now = Date.parse('2026-11-12T10:00:00Z');
    const runs = [{ id: 'strava-1', name: 'Morning run', endedAtMs: now - 70 * 60e3, synced: true, hasFeel: false }];
    const p = planPush(base({ minutes: at('10:00'), nowMs: now, recentRuns: runs, lastRunDate: '2026-11-12', ranToday: true }));
    expect(p.messages[0]).toMatchObject({ title: 'How did it feel?', url: '/activity/strava-1' });
    expect(titles(base({ minutes: at('10:00'), nowMs: now, recentRuns: [{ ...runs[0], hasFeel: true }], lastRunDate: '2026-11-12' }))).toEqual([]);
    expect(titles(base({ minutes: at('10:00'), nowMs: now, recentRuns: runs, lastRunDate: '2026-11-12', sent: p.sent }))).toEqual([]);
  });
  it('shoes at 85% only when turned on (off by default)', () => {
    const shoes = [{ id: 's1', name: 'Pegasus 41', pct: 88 }];
    expect(titles(base({ shoes, lastRunDate: '2026-11-11' }))).toEqual([]);
    expect(titles(base({ shoes, lastRunDate: '2026-11-11', r: withDefaults({ morning: null, evening: null, shoes: true }) }))).toEqual(['Pegasus 41: nearly worn out']);
  });
  it('no guilt-trip wording anywhere', () => {
    const all = [
      ...planPush(base({ sessions: [S({ date: '2026-11-10' }), S({ date: '2026-11-11' }), S({ date: '2026-11-12' })] })).messages,
      ...planPush(base({ r: withDefaults({ morning: '07:00' }), lastRunDate: '2026-11-10', sessions: [S({ id: 't', date: '2026-11-11', type: 'tempo', title: 'Tempo' })] })).messages,
    ];
    for (const m of all) expect(`${m.title} ${m.body}`).not.toMatch(/fail|lazy|should have|disappoint/i);
  });
});
