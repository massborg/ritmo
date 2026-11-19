// Update 5, U8: the You page for every kind of training
import { describe, expect, it } from 'vitest';
import { bySport, hoursMinutes, musclesWorked, sessionsPerWeek, strengthRecords, totalsByType, volumeKg } from './you-sports';
import { activityFeed } from './feed';
import type { Activity, LogEntry } from '../lib/types';

const run: Activity = { id: 'r1', source: 'upload', sourceIds: {}, startTime: '2026-11-18T07:00:00Z', name: 'Morning Run', sport: 'run', distanceM: 14560, durationS: 4350, movingS: 4340, detailScore: 1, importedAt: '' };
const st = (id: string, date: string, sets: { reps?: number; load?: number; seconds?: number }[][], ex = ['goblet-squat', 'plank']): LogEntry => ({ id, kind: 'strength', date, at: `${date}T18:00:00Z`, minutes: 30, rpe: 6, strength: { title: 'Strength session 1', source: 'free', exercises: sets.map((s, i) => ({ id: ex[i], name: ex[i], sets: s })) } });
const log: LogEntry[] = [
  st('s1', '2026-11-02', [[{ reps: 10, load: 16 }, { reps: 10, load: 16 }], [{ seconds: 60 }]]),
  st('s2', '2026-11-16', [[{ reps: 12, load: 18 }, { reps: 12, load: 18 }, { reps: 8, load: 20 }], [{ seconds: 90 }, { seconds: 45 }]]),
  { id: 'c1', kind: 'cross', date: '2026-11-18', at: '2026-11-18T17:00:00Z', sport: 'Bike', minutes: 45, rpe: 4 },
  { id: 'c2', kind: 'cross', date: '2026-11-10', at: '2026-11-10T17:00:00Z', sport: 'Bike', minutes: 60, rpe: 6 },
  { id: 'c3', kind: 'cross', date: '2026-11-12', at: '2026-11-12T17:00:00Z', sport: 'Swim', minutes: 30, rpe: 4 },
];

describe('the You page for all sports', () => {
  it('time and sessions by type, in a fixed order, leaving out what was not done', () => {
    const t = totalsByType(activityFeed([run], { log, units: 'km' }));
    expect(t.map((x) => [x.type, x.sessions])).toEqual([['run', 1], ['strength', 2], ['cross', 3]]);
    expect(t[0].seconds).toBe(4340);
    expect(t[1].seconds).toBe(3600);
    expect(t[2].seconds).toBe(135 * 60);
    expect(hoursMinutes(26 * 3600 + 14 * 60 + 30)).toBe('26:14');
  });
  it('strength records: the best set by estimated 1-rep max, the longest hold', () => {
    const r = strengthRecords(log);
    // 18 kg x 12 (est. 25.2) beats 20 kg x 8 (est. 25.3)? No: 25.3 is higher, so 20 x 8 is the record
    expect(r.find((x) => x.id === 'goblet-squat')).toMatchObject({ text: '20 kg × 8', date: '2026-11-16' });
    expect(r.find((x) => x.id === 'plank')).toMatchObject({ text: '1:30', date: '2026-11-16' });
    expect(strengthRecords(undefined)).toEqual([]);
  });
  it('volume and muscles worked from the sessions in the period', () => {
    expect(volumeKg([log[0]])).toBe(320);
    expect(volumeKg(log.slice(0, 2))).toBe(320 + 432 + 160);
    const m = musclesWorked([log[1]]);
    expect(m.find((x) => x.muscle === 'quads')?.sets).toBe(3);
    expect(m.find((x) => x.muscle === 'core')?.sets).toBe(2);
    expect(m[0].sets).toBeGreaterThanOrEqual(m[m.length - 1].sets);
  });
  it('minutes, sessions and load per sport', () => {
    const s = bySport(log);
    expect(s.map((x) => [x.sport, x.minutes, x.sessions])).toEqual([['Bike', 105, 2], ['Swim', 30, 1]]);
    expect(s[0].load).toBeGreaterThan(s[1].load);
  });
  it('sessions per week for the last four weeks, Monday to Sunday', () => {
    const w = sessionsPerWeek(['2026-11-02', '2026-11-16', '2026-11-17', '2026-10-01'], new Date('2026-11-19T10:00:00'));
    expect(w.map((x) => x.start)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
    expect(w.map((x) => x.n)).toEqual([0, 1, 0, 2]);
  });
});
