// The findings from the second QA sweep that needed a decision
import { afterEach, describe, expect, it } from 'vitest';
import { PAIN } from '../coach/coach';
import { noteInUnit } from './strength';
import { runDay } from '../lib/format';
import { enteredRace, isPartial, records, summarise } from '../hyrox/hyrox';
import { racePacing } from '../hyrox/predict';
import type { LogEntry } from '../lib/types';

describe('the coach pain check', () => {
  it('does not take ordinary words for an injury', () => {
    for (const q of ['When will I be back to full fitness?', 'Should I do back-to-back long runs?', 'Any feedback on my week?', 'Am I pushing too hard?', 'How do I restrain myself early in a race?', 'Is this workout hip right now?'.replace('hip', 'popular')])
      expect(PAIN.test(q), q).toBe(false);
  });
  it('still hears real pain', () => {
    for (const q of ['My knee hurts after long runs', 'my lower back is sore', 'I have back pain', 'shin pain when I run', 'a niggle in my calf', 'tight hips', 'is it an injury?', 'my achilles aches'])
      expect(PAIN.test(q), q).toBe(true);
  });
});

describe('progression notes follow the unit', () => {
  it('a note saved in kg reads in lb, and the other way round', () => {
    expect(noteInUnit('Same again: 10 reps at 25 kg (the last session felt hard)', 'lb')).toBe('Same again: 10 reps at 55 lb (the last session felt hard)');
    expect(noteInUnit('+1 rep: 11 reps at 100 lb for all sets', 'kg')).toBe('+1 rep: 11 reps at 45.36 kg for all sets');
    expect(noteInUnit('+5 s (to 35 s)', 'lb')).toBe('+5 s (to 35 s)');
    expect(noteInUnit('Add load: 27.5 kg for 8 reps (you reached 12 reps at 25 kg)', 'kg')).toBe('Add load: 27.5 kg for 8 reps (you reached 12 reps at 25 kg)');
  });
});

describe('a run belongs to the day on the runner’s calendar', () => {
  const tz = process.env.TZ;
  afterEach(() => { process.env.TZ = tz; });
  it('an evening run west of UTC is on that evening’s day', () => {
    process.env.TZ = 'America/New_York';
    expect(runDay('2026-11-12T00:30:00Z')).toBe('2026-11-11'); // 19:30 on the 11th in New York
    process.env.TZ = 'Australia/Sydney';
    expect(runDay('2026-11-11T20:30:01Z')).toBe('2026-11-12'); // 07:30 on the 12th in Sydney
  });
});

describe('an entered HYROX race', () => {
  const t5 = Array(8).fill(300), t4 = Array(8).fill(240);
  const o = { id: 'r', date: '2026-11-14', division: 'men_open' as const };
  it('with every split and the Roxzone total is a finish time', () => {
    const r = enteredRace({ ...o, runs: t5, stations: t4, roxzoneS: 390, goalMs: 85 * 60000 });
    expect(isPartial(r)).toBe(false);
    expect(r.totalMs).toBe(78.5 * 60000);
    expect(summarise(r).vsGoalMs).toBe(-6.5 * 60000);
    expect(records([r]).race?.ms).toBe(r.totalMs);
  });
  it('with every split and the finish time: the rest is the Roxzone', () => {
    const r = enteredRace({ ...o, runs: t5, stations: t4, finishS: 78.5 * 60 });
    expect(isPartial(r)).toBe(false);
    expect(r.totalMs).toBe(78.5 * 60000);
    expect(summarise(r).roxzoneMs).toBe(390_000);
  });
  it('without the Roxzone or finish time, or with splits missing, it is partial: no goal comparison, not a best', () => {
    const noRox = enteredRace({ ...o, runs: t5, stations: t4, goalMs: 85 * 60000 });
    expect(isPartial(noRox)).toBe(true);
    expect(summarise(noRox).vsGoalMs).toBeUndefined();
    const few = enteredRace({ ...o, runs: [300], stations: [270], roxzoneS: 390, goalMs: 90 * 60000 });
    expect(isPartial(few)).toBe(true);
    expect(records([noRox, few]).race).toBeUndefined();
    // A full result still wins the record when a partial one is "faster"
    const full = enteredRace({ ...o, id: 'f', runs: t5, stations: t4, roxzoneS: 390 });
    expect(records([noRox, full]).race?.id).toBe('f');
    // Results saved before partial was recorded are judged the same way
    expect(isPartial({ ...noRox, partial: undefined })).toBe(true);
  });
});

describe('the race-day plan adds up to the goal', () => {
  it('uses the athlete’s own shares for runs, stations and transitions', () => {
    const race = enteredRace({ id: 'r', date: '2026-11-01', division: 'men_open', runs: Array(8).fill(300), stations: Array(8).fill(240), roxzoneS: 390 });
    const log: LogEntry[] = [{ id: 'l', date: '2026-11-01', kind: 'hyrox', at: race.startedAt, hyrox: race }];
    const p = racePacing({ hyrox: { goalS: 85 * 60, division: 'men_open' }, log }, 240)!;
    const runs = p.runPaceS * 8, stations = p.stations.reduce((a, s) => a + (s.targetS ?? 0), 0);
    const rox = 85 * 60 * (390 / (78.5 * 60));
    expect(Math.abs(runs + stations + rox - 85 * 60)).toBeLessThan(60);
  });
});
