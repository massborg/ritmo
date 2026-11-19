// Update 5, U1: other sports are kept, shown and counted
import { describe, expect, it } from 'vitest';
import { crossSport } from '../data/parsers';
import { stravaToCross } from '../data/strava';
import { crossToLog } from '../app/AppContext';
import { activityFeed, dayLog, logItem } from './feed';
import { crossLoad } from './load';
import type { Activity, LogEntry } from '../lib/types';

describe('sports from files and services', () => {
  it('are named the way Ritmo names them', () => {
    expect(crossSport('cycling')).toBe('Bike');
    expect(crossSport('indoor_cycling')).toBe('Indoor bike');
    expect(crossSport('Virtual Ride')).toBe('Indoor bike');
    expect(crossSport('lap_swimming')).toBe('Swim');
    expect(crossSport('hiking')).toBe('Walk / hike');
    expect(crossSport('elliptical')).toBe('Elliptical');
    expect(crossSport('rowing')).toBe('Row');
    expect(crossSport('yoga')).toBe('Class');
    expect(crossSport('strength_training')).toBe('Gym');
    expect(crossSport('paddling')).toBe('Other');
  });
  it('a Strava ride becomes cross-training; a run does not', () => {
    const ride = stravaToCross({ id: 77, sport_type: 'Ride', start_date: '2026-11-18T16:01:00Z', moving_time: 2700, elapsed_time: 2900, distance: 21500, average_heartrate: 131.4, name: 'Evening Ride' })!;
    expect(ride).toEqual({ importId: 'strava-77', sport: 'Bike', startTime: '2026-11-18T16:01:00.000Z', durationS: 2700, distanceM: 21500, avgHr: 131, name: 'Evening Ride' });
    expect(stravaToCross({ id: 78, sport_type: 'Ride', trainer: true, start_date: '2026-11-18T16:01:00Z', moving_time: 1800 })!.sport).toBe('Indoor bike');
    expect(stravaToCross({ id: 79, sport_type: 'Run', start_date: '2026-11-18T16:01:00Z', moving_time: 1800 })).toBeNull();
    expect(stravaToCross({ id: 80, sport_type: 'Swim', start_date: '2026-11-18T16:01:00Z', moving_time: 30 })).toBeNull();
  });
  it('are added to the log once, as cross-training with a steady effort to start from', () => {
    const c = { importId: 'fit-1', sport: 'Bike', startTime: '2026-11-18T16:01:00.000Z', durationS: 2700, distanceM: 21500, avgHr: 131 };
    const first = crossToLog([c], []);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ kind: 'cross', sport: 'Bike', minutes: 45, durationS: 2700, distanceM: 21500, avgHr: 131, rpe: 4, date: '2026-11-18', importId: 'fit-1' });
    // The same file again, or the same ride from another source in the same minute
    expect(crossToLog([c], first)).toEqual([]);
    expect(crossToLog([{ ...c, importId: 'strava-9' }], first)).toEqual([]);
    expect(crossToLog([{ ...c, importId: 'strava-9', sport: 'Swim' }], first)).toHaveLength(1);
    expect(crossLoad(first[0])).toBeGreaterThan(0);
  });
});

describe('the activity feed', () => {
  const run: Activity = { id: 'r1', source: 'upload', sourceIds: {}, startTime: '2026-11-18T07:00:00Z', name: 'Morning Run', sport: 'run', distanceM: 14560, durationS: 4350, movingS: 4340, detailScore: 1, importedAt: '' };
  const log: LogEntry[] = [
    { id: 'c1', kind: 'cross', date: '2026-11-18', at: '2026-11-18T17:01:00Z', sport: 'Bike', minutes: 45, rpe: 4 },
    { id: 's1', kind: 'strength', date: '2026-11-16', at: '2026-11-16T18:00:00Z', minutes: 32, rpe: 6, strength: { title: 'Strength session 1', source: 'free', exercises: [{ id: 'goblet-squat', name: 'Goblet squat', sets: [{ reps: 12, load: 18 }, { reps: 12, load: 18 }] }] } },
    { id: 'n1', kind: 'note', date: '2026-11-18', at: '2026-11-18T20:00:00Z', text: 'Felt good' },
  ];
  it('lists runs and every kind of logged session together, newest first', () => {
    const f = activityFeed([run], { log, units: 'km' });
    expect(f.map((x) => `${x.type}:${x.id}`)).toEqual(['cross:c1', 'run:r1', 'strength:s1']);
    expect(f[0]).toMatchObject({ title: 'Bike', line: '45 min · effort 4', link: '/log/c1', tag: 'Bike' });
    expect(f[1]).toMatchObject({ title: 'Morning Run', link: '/activity/r1' });
    expect(f[1].line).toMatch(/^14\.56 km · 4:58\/km$/);
    expect(f[2]).toMatchObject({ title: 'Strength session 1', line: '1 exercise · 432 kg · 32 min', volumeKg: 432 });
    expect(activityFeed([run], { log, units: 'km' }, { notes: true })).toHaveLength(4);
  });
  it('a recorded ride shows its distance; the day lists what was done that day', () => {
    expect(logItem({ id: 'c2', kind: 'cross', date: '2026-11-18', at: '2026-11-18T17:01:00Z', sport: 'Bike', minutes: 45, durationS: 2712, distanceM: 21500, rpe: 6, recorded: true }, 'km')!.line).toBe('45 min · 21.5 km · effort 6');
    expect(dayLog({ log, units: 'km' }, '2026-11-18').map((x) => x.id)).toEqual(['c1', 'n1']);
    expect(dayLog({ log, units: 'km' }, '2026-11-17')).toEqual([]);
  });
});
