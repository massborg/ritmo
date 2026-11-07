import { describe, expect, it } from 'vitest';
import { addFix, avgPace, currentPace, setPaused, startTrack, stepLeft, stepsFor, toStreams, type Fix } from './tracker';
import type { PlannedSession } from '../lib/types';

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
    fixes.forEach((f, i) => { if (i === 100) s = setPaused(s, true); if (i === 200) s = setPaused(s, false); s = addFix(s, f, false); });
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
