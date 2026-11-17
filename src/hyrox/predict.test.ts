import { describe, expect, it } from 'vitest';
import type { Lap, LogEntry, Profile } from '../lib/types';
import { enteredRace, type HyroxSession } from './hyrox';
import { hyroxFacts, lapsToSegments, looksLikeHyrox, predictHyrox, racePacing } from './predict';

const full = (runs: number[], st: number[], o: Partial<HyroxSession> = {}): HyroxSession => ({ ...enteredRace({ id: 's', date: '2026-11-14', division: 'men_open', runs, stations: st }), mode: 'full', isRace: false, entered: undefined, ...o });
const log = (...h: HyroxSession[]): LogEntry[] => h.map((x, i) => ({ id: `${x.id}${i}`, date: x.startedAt.slice(0, 10), kind: 'hyrox', at: x.startedAt, hyrox: x }));
const T = 255; // threshold 4:15/km

describe('the HYROX race predictor (update 4, task 7)', () => {
  it('needs running fitness or a full session', () => {
    expect(predictHyrox({}, undefined)).toBeUndefined();
  });
  it('from running fitness alone: typical stations, low confidence, parts add up', () => {
    const p = predictHyrox({ hyrox: { goalS: 4500 } }, T)!;
    expect(p.confidence).toBe('low');
    expect(p.known).toBe(0);
    expect(p.runPaceS).toBe(Math.round(T * 1.07));
    expect(p.runningS + p.stationsS + p.roxzoneS).toBe(p.totalS);
    expect(p.totalS).toBeGreaterThan(65 * 60);
    expect(p.totalS).toBeLessThan(85 * 60);
    expect(p.vsGoalS).toBe(p.totalS - 4500);
    expect(p.basedOn).toMatch(/typical station times/);
    // A faster runner is predicted faster
    expect(predictHyrox({}, 220)!.totalS).toBeLessThan(p.totalS);
  });
  it('a custom session with eight shortened runs is not taken as a full simulation', () => {
    const base = predictHyrox({}, 270)!;
    const half = full(Array(8).fill(150), Array(8).fill(120));
    const custom: HyroxSession = { ...half, mode: 'custom', segments: half.segments.map((x) => (x.kind === 'run' ? { ...x, distanceM: 500 } : { ...x, distanceM: x.distanceM ? x.distanceM / 2 : undefined, reps: x.reps ? x.reps / 2 : undefined })) };
    const p = predictHyrox({ log: log(custom) }, 270)!;
    expect(p.runningS).toBe(base.runningS);
    expect(p.totalS).toBe(base.totalS);
    expect(p.confidence).toBe('low');
    expect(p.basedOn).not.toMatch(/full simulation/);
  });
  it('uses the athlete’s own stations: in-race times as they are, practice times a little slower', () => {
    const sim = full(Array(8).fill(270), [250, 200, 290, 320, 280, 130, 300, 380]);
    const practice: HyroxSession = { ...full([], []), id: 'p', mode: 'practice', startedAt: '2026-11-20T09:00:00.000Z', segments: [{ i: 0, kind: 'station', key: 'wall_balls', n: 1, reps: 100, startMs: 0, endMs: 300_000, ms: 300_000 }], totalMs: 300_000 };
    const p = predictHyrox({ log: log(sim, practice) }, T)!;
    expect(p.confidence).toBe('good');
    expect(p.known).toBe(8);
    expect(p.stations.find((x) => x.key === 'sled_push')).toMatchObject({ s: 200, from: 'race' });
    expect(p.stations.find((x) => x.key === 'wall_balls')).toMatchObject({ s: 324, from: 'practice' }); // 5:00 fresh → 5:24 in the race
    // Runs lean on the simulation's own runs (4:30) more than on fitness (4:33)
    expect(p.runPaceS).toBeGreaterThanOrEqual(270);
    expect(p.runPaceS).toBeLessThanOrEqual(273);
    expect(p.basedOn).toMatch(/your full simulation on 14 Nov, your running fitness, your own time on 8 of 8 stations/);
  });
  it('names the station with the most to gain', () => {
    const slowSled = full(Array(8).fill(270), [250, 200, 520, 320, 280, 130, 300, 380]);
    expect(predictHyrox({ log: log(slowSled) }, T)!.focus?.name).toBe('Sled pull');
  });
});

describe('race-day pacing', () => {
  it('a pace for each run from the goal, the first held back, with station targets', () => {
    const r = racePacing({ hyrox: { goalS: 4500, division: 'women_open', targets: { wall_balls: 390 } } }, 240)!;
    expect(r.runPaceS).toBe(264);
    expect(r.runs).toHaveLength(8);
    expect(r.runs[0].paceS).toBe(270);
    expect(r.runs[7].paceS).toBe(261);
    expect(r.stations.map((s) => s.name)[1]).toBe('Sled push');
    expect(r.stations[1].work).toBe('50 m · 102 kg');
    expect(r.stations[7].targetS).toBe(390);
  });
  it('never asks for runs faster than threshold pace', () => {
    expect(racePacing({ hyrox: { goalS: 3600 } }, 255)!.runPaceS).toBe(255);
    expect(racePacing({}, undefined)).toBeUndefined();
  });
});

describe('laps from a watch', () => {
  const lap = (i: number, durationS: number, distanceM: number): Lap => ({ index: i, startS: 0, durationS, distanceM });
  it('16 laps in order are run 1, station 1, run 2 …', () => {
    const laps = Array.from({ length: 16 }, (_, i) => (i % 2 === 0 ? lap(i + 1, 270, 1005) : lap(i + 1, 240, 60)));
    expect(looksLikeHyrox(laps)).toBe(true);
    const segs = lapsToSegments(laps, 'men_open')!;
    expect(segs).toHaveLength(16);
    expect(segs[0]).toMatchObject({ kind: 'run', n: 1, ms: 270_000, gpsM: 1005 });
    expect(segs[3]).toMatchObject({ kind: 'station', key: 'sled_push', ms: 240_000, loadKg: 152 });
    expect(segs[15]).toMatchObject({ key: 'wall_balls', endMs: 8 * 270_000 + 8 * 240_000 });
  });
  it('with extra laps, the 1 km laps are the runs and the lap after each is its station', () => {
    const laps = [lap(1, 30, 80), ...Array.from({ length: 16 }, (_, i) => (i % 2 === 0 ? lap(i + 2, 270, 998) : lap(i + 2, 240, 40)))];
    const segs = lapsToSegments(laps, 'men_open')!;
    expect(segs[0]).toMatchObject({ kind: 'run', ms: 270_000 });
    expect(segs.filter((x) => x.kind === 'run').every((x) => x.ms === 270_000)).toBe(true);
  });
  it('fewer than 16 laps cannot be mapped', () => {
    expect(looksLikeHyrox(Array.from({ length: 10 }, (_, i) => lap(i, 300, 1000)))).toBe(false);
    expect(lapsToSegments(Array.from({ length: 10 }, (_, i) => lap(i, 300, 1000)), 'men_open')).toBeUndefined();
  });
});

describe('what the Coach is told', () => {
  it('nothing for a runner with no HYROX sessions', () => {
    expect(hyroxFacts({} as Profile, T)).toEqual([]);
  });
  it('the profile, the latest splits, bests, weak stations and the prediction', () => {
    const sim = full([242, 254, 281, 258, 262, 265, 292, 276], [252, 221, 295, 271, 290, 150, 330, 360]);
    const f = hyroxFacts({ athleteType: 'hyrox', hyrox: { division: 'women_open', goalS: 4500, raceDate: '2027-02-13', hardest: ['sled_pull', 'wall_balls'], equipment: ['skierg', 'wall_ball'] }, log: log(sim) }, T).join(' ');
    expect(f).toMatch(/trains for HYROX\. Division Women Open, race on 2027-02-13, goal 1:15:00/);
    expect(f).toMatch(/finds hardest: sled pull, wall balls/);
    expect(f).toMatch(/equipment available: skierg, wall ball/);
    expect(f).toMatch(/Latest HYROX session .*run 1 4:02, skierg 4:12/);
    expect(f).toMatch(/Runs after sled push and farmers carry were 25 s slower/);
    expect(f).toMatch(/HYROX bests: full simulation 1:11:39, 1 km run split 4:02/);
    expect(f).toMatch(/HYROX prediction: 1:\d\d:\d\d \(confidence good/);
  });
});
