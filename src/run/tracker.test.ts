import { describe, expect, it } from 'vitest';
import { addFix, addLap, avgPace, clockS, currentPace, gpsLostS, lapSplits, paceGoalStep, setPaused, startTrack, stepLeft, stepsFor, toStreams, type Fix } from './tracker';
import type { PlannedSession } from '../lib/types';
import { pace as fmtPace, paceRange } from '../lib/format';

/** A simulated run north from Valletta: one fix a second at 5:00/km, with GPS noise, bad fixes and a stop. */
function simulate(km: number, paceS = 300) {
  const fixes: Fix[] = [];
  const t0 = 1_800_000_000_000;
  let d = 0, t = 0, seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  while (d < km * 1000) {
    t++;
    const stopped = t > 600 && t < 640; // a 40 s stop at a crossing
    if (!stopped) d += 1000 / paceS;
    const noise = rnd() * 3; // up to ±1.5 m
    fixes.push({ t: t0 + t * 1000, lat: 35.9 + (d + noise) / 111195, lon: 14.5, acc: t % 97 === 0 ? 60 : 6 });
    if (t % 211 === 0) fixes.push({ t: t0 + t * 1000 + 500, lat: 35.9 + (d + 400) / 111195, lon: 14.5, acc: 8 }); // a GPS jump
  }
  return { fixes, t0, trueM: d };
}

describe('GPS run recording', () => {
  it('measures distance within 2%, ignoring bad fixes and jumps, and pauses at a stop', () => {
    const { fixes, t0, trueM } = simulate(5);
    let s = startTrack(t0);
    let sawAutoPause = false;
    for (const f of fixes) { s = addFix(s, f); if (s.autoPaused) sawAutoPause = true; }
    expect(Math.abs(s.distanceM - trueM) / trueM).toBeLessThan(0.02);
    expect(sawAutoPause).toBe(true);
    expect(avgPace(s)!).toBeGreaterThan(285);
    expect(avgPace(s)!).toBeLessThan(315);
    expect(currentPace(s)!).toBeGreaterThan(270);
    expect(currentPace(s)!).toBeLessThan(330);
    // moving time leaves out the stop
    expect(s.movingS).toBeLessThan(s.elapsedS - 30);
    const streams = toStreams(s);
    expect(streams[streams.length - 1].d).toBeCloseTo(s.distanceM, 0);
  });
  it('pause and resume: distance run while paused does not count', () => {
    const { fixes, t0 } = simulate(2);
    let s = startTrack(t0);
    fixes.forEach((f, i) => { if (i === 100) s = setPaused(s, true, f.t); if (i === 200) s = setPaused(s, false, f.t); s = addFix(s, f, false); });
    expect(s.distanceM).toBeLessThan(2000 * 0.9);
  });
  it('turns a planned interval session into steps to follow', () => {
    const plan = { steps: [
      { label: 'Warm up', detail: '', kind: 'warmup', km: 3 },
      { label: '6 x 1 km', detail: 'at 3:10/km, 2 min easy jog between', kind: 'work', pace: [188, 193] },
      { label: 'Cool down', detail: '', kind: 'cooldown', km: 2 },
    ] } as unknown as PlannedSession;
    const st = stepsFor(plan);
    expect(st.map((x) => x.label)).toEqual(['Warm up', 'Rep 1 of 6', 'Recovery', 'Rep 2 of 6', 'Recovery', 'Rep 3 of 6', 'Recovery', 'Rep 4 of 6', 'Recovery', 'Rep 5 of 6', 'Recovery', 'Rep 6 of 6', 'Cool down']);
    expect(st[2].durationS).toBe(120);
    expect(stepLeft(st[1], 900, 3000, 1000, 3600)).toEqual({ leftM: 400, complete: false });
    expect(stepLeft(st[2], 1100, 4000, 1220, 4300).complete).toBe(true);
  });
});

describe('run clock and laps', () => {
  const T0 = 1_800_000_000_000;
  const fix = (sec: number, m: number): Fix => ({ t: T0 + sec * 1000, lat: 35.9 + m / 111195, lon: 14.5, acc: 5 });
  it('ticks every second even when no GPS fix arrives', () => {
    const s = startTrack(T0);
    expect(clockS(s, T0 + 1000)).toBe(1);
    expect(clockS(s, T0 + 7500)).toBe(7.5);
  });
  it('counts the time before the first fix, and stays continuous when fixes arrive', () => {
    let s = startTrack(T0);
    s = addFix(s, fix(4, 0), false);
    expect(s.movingS).toBe(4);
    expect(clockS(s, T0 + 6000)).toBe(6);
    s = addFix(s, fix(9, 25), false);
    expect(clockS(s, T0 + 9000)).toBe(9);
    expect(clockS(s, T0 + 12000)).toBe(12);
  });
  it('a short GPS dropout (under 30 s) still counts; a longer gap is never filled in (update 3, §3)', () => {
    let s = addFix(startTrack(T0), fix(1, 0), false);
    s = addFix(s, fix(25, 90), false);
    expect(s.movingS).toBe(25);
    expect(Math.round(s.distanceM)).toBe(90);
    // No fix for 6 minutes (the phone was locked): the clock holds at +30 s, then nothing is added for the gap
    expect(clockS(s, T0 + 25_000 + 360_000)).toBe(55);
    expect(gpsLostS(s, T0 + 25_000 + 360_000)).toBe(360);
    s = addFix(s, fix(385, 1500), false);
    expect(s.movingS).toBe(25);
    expect(Math.round(s.distanceM)).toBe(90);
    expect(s.gaps).toEqual([{ fromT: T0 + 25_000, toT: T0 + 385_000, atM: s.distanceM }]);
    expect(s.points[s.points.length - 1].gap).toBe(true);
    // Running on from there counts again
    s = addFix(s, fix(405, 1580), false);
    expect(Math.round(s.distanceM)).toBe(170);
    expect(s.movingS).toBe(45);
  });
  it('a 5 km run with the screen locked for 10 minutes: the gap is left out of distance and pace, and marked', () => {
    // 3:30 for the first 2 km at 4:00/km... then locked for 10 min, then 2 km more at 4:00/km
    let s = startTrack(T0);
    let t = 0, m = 0;
    for (; m < 2000; t += 4, m += 16.7) s = addFix(s, fix(t, m), false);
    const before = s.distanceM;
    t += 600; m += 2500; // 10 minutes and about 2.5 km with no GPS
    for (let k = 0; k < 120; k++, t += 4, m += 16.7) s = addFix(s, fix(t, m), false);
    expect(s.gaps).toHaveLength(1);
    expect(s.distanceM).toBeGreaterThan(before + 1900);
    expect(s.distanceM).toBeLessThan(before + 2100); // nothing invented for the gap
    expect(Math.round(avgPace(s)! )).toBeGreaterThan(230); // pace still about 4:00/km
    expect(Math.round(avgPace(s)!)).toBeLessThan(250);
    const streams = toStreams(s);
    const g = streams.findIndex((p) => p.gap);
    expect(g).toBeGreaterThan(0);
    expect(streams[g].t - streams[g - 1].t).toBe(0); // no time for the gap in the saved run
  });
  it('stops while paused and picks up again after Resume', () => {
    let s = addFix(startTrack(T0), fix(1, 0), false);
    s = setPaused(s, true, T0 + 10_000);
    expect(clockS(s, T0 + 10_000)).toBe(10);
    expect(clockS(s, T0 + 40_000)).toBe(10);
    s = setPaused(s, false, T0 + 40_000);
    expect(clockS(s, T0 + 45_000)).toBe(15);
    s = addFix(s, fix(47, 10), false);
    expect(clockS(s, T0 + 50_000)).toBe(20);
  });
  it('splits laps by clock time and distance', () => {
    let s = addFix(startTrack(T0), fix(1, 0), false);
    s = addFix(s, fix(30, 100), false);
    s = addFix(s, fix(60, 200), false);
    s = addLap(s, T0 + 60_000);
    s = addFix(s, fix(80, 275), false);
    s = addFix(s, fix(100, 350), false);
    const laps = lapSplits(s, T0 + 100_000);
    expect(laps.map((l) => l.n)).toEqual([1, 2]);
    expect(laps[0].s).toBe(60); expect(Math.round(laps[0].m)).toBe(200);
    expect(laps[1].s).toBe(40); expect(Math.round(laps[1].m)).toBe(150);
  });
  it('does not auto-pause before the runner has got going', () => {
    let s = startTrack(T0);
    for (let i = 1; i <= 20; i++) s = addFix(s, fix(i, 0), true); // standing at the start for 20 s
    expect(s.autoPaused).toBe(false);
    expect(clockS(s, T0 + 20_000)).toBe(20);
    for (let i = 21; i <= 40; i++) s = addFix(s, fix(i, (i - 20) * 3), true); // runs 60 m
    for (let i = 41; i <= 50; i++) s = addFix(s, fix(i, 60), true); // then stops
    expect(s.autoPaused).toBe(true);
  });
});

describe('a free run with a pace goal', () => {
  it('per km: the typed pace is the target, 5 s either side', () => {
    const st = paceGoalStep(300, 'km', (p) => fmtPace(p, 'km'));
    expect(st.label).toBe('Hold 5:00/km');
    expect(st.pace).toEqual([295, 305]);
  });
  it('per mile: 8:00/mi is shown as 8:00/mi and kept as seconds per km', () => {
    const st = paceGoalStep(480, 'mi', (p) => fmtPace(p, 'mi'));
    expect(st.label).toBe('Hold 8:00/mi');
    expect(Math.round(st.pace![0])).toBe(295);
    expect(Math.round(st.pace![1])).toBe(301);
    expect(paceRange(st.pace![0], st.pace![1], 'mi')).toBe('7:55–8:05/mi');
  });
});

describe('pauses in the pace and in the saved stream', () => {
  // One fix a second at 3.2 m/s (5:13/km), from second `from` to second `to`
  const t0 = 1_800_000_000_000;
  const feed = (s: ReturnType<typeof startTrack>, from: number, to: number, at: (sec: number) => number, autoPause = false) => {
    for (let i = from; i <= to; i++) s = addFix(s, { t: t0 + i * 1000, lat: 35.9 + at(i) / 111195, lon: 14.5, acc: 5 }, autoPause);
    return s;
  };
  it('a 40 s pause by the runner is not in "Pace now" and not in the stream clock', () => {
    let s = feed(startTrack(t0), 0, 30, (i) => i * 3.2);
    s = setPaused(s, true, t0 + 30_000);
    s = feed(s, 31, 69, () => 30 * 3.2);
    s = setPaused(s, false, t0 + 70_000);
    s = feed(s, 70, 73, (i) => 30 * 3.2 + (i - 70) * 3.2);
    // Too little running since the resume to say a pace: a dash, not 11:00/km
    expect(currentPace(s)).toBeUndefined();
    s = feed(s, 74, 100, (i) => 30 * 3.2 + (i - 70) * 3.2);
    expect(currentPace(s)!).toBeGreaterThan(300);
    expect(currentPace(s)!).toBeLessThan(325);
    const st = toStreams(s);
    expect(Math.abs(st[st.length - 1].t - s.movingS)).toBeLessThanOrEqual(1);
    expect(s.movingS).toBeCloseTo(60, 0);
    // No jump in the stream clock where the pause was
    expect(Math.max(...st.slice(1).map((x, i) => x.t - st[i].t))).toBeLessThanOrEqual(2);
  });
  it('after an automatic pause, the pace is from the running since it ended and the stream clock is the moving time', () => {
    let s = feed(startTrack(t0), 0, 30, (i) => i * 3.2, true);
    s = feed(s, 31, 45, () => 30 * 3.2, true);
    expect(s.autoPaused).toBe(true);
    s = feed(s, 46, 66, (i) => 30 * 3.2 + (i - 45) * 3.2, true);
    expect(s.autoPaused).toBe(false);
    expect(currentPace(s)!).toBeLessThan(330);
    const st = toStreams(s);
    expect(Math.abs(st[st.length - 1].t - s.movingS)).toBeLessThanOrEqual(1);
  });
});
