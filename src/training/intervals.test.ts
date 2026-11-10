import { describe, expect, it } from 'vitest';
import type { Activity, StreamPoint } from '../lib/types';
import { segTime, splitRun } from './intervals';

/** A 1 Hz stream from pieces of [seconds, pace s/km] */
function stream(pieces: [number, number][], hr = (i: number) => 130 + (i % 7)): StreamPoint[] {
  const out: StreamPoint[] = [{ t: 0, d: 0, hr: 130, cad: 170, alt: 10 }];
  let t = 0, d = 0;
  for (const [secs, pace] of pieces) for (let i = 0; i < secs; i++) { t++; d += 1000 / pace; out.push({ t, d, hr: hr(t), cad: pace < 240 ? 192 : 170, alt: 10 + Math.sin(t / 300) * 3 }); }
  return out;
}
const run = (s: StreamPoint[], extra: Partial<Activity> = {}): Activity => ({ id: 'r', source: 'strava', sourceIds: {}, startTime: '2026-11-10T05:50:00Z', name: 'Run', sport: 'run', distanceM: s[s.length - 1].d, durationS: s[s.length - 1].t, movingS: s[s.length - 1].t, streams: s, detailScore: 5, importedAt: '', ...extra });

// The 10 Nov run: 6.48 km warm up at 4:50/km, 6 × ~31 s strides at 3:14–3:24 with ~2:31 recoveries, then cool down
const tenNov = (() => {
  const reps = [198, 195, 195, 197, 199, 204];
  const pieces: [number, number][] = [[1877, 290]];
  reps.forEach((p, i) => { pieces.push([31, p]); if (i < reps.length - 1) pieces.push([151, 320]); });
  pieces.push([1500, 306]);
  return run(stream(pieces));
})();

describe('splitting a run into intervals (update 2, §2)', () => {
  it('finds the six strides automatically, with recoveries, a warm up and a cool down', () => {
    const r = splitRun(tenNov);
    expect(r.method).toBe('auto');
    expect(r.caption).toBe('found automatically');
    expect(r.reps).toHaveLength(6);
    expect(r.title).toBe('6 × 30 s strides');
    for (const rep of r.reps) { expect(rep.paceS!).toBeGreaterThan(185); expect(rep.paceS!).toBeLessThan(215); }
    const wu = r.segments[0];
    expect(wu.kind).toBe('warmup');
    expect(wu.distanceM / 1000).toBeGreaterThan(6.3);
    expect(wu.distanceM / 1000).toBeLessThan(6.7);
    expect(r.segments.filter((x) => x.kind === 'recovery')).toHaveLength(5);
    expect(r.segments[r.segments.length - 1].kind).toBe('cooldown');
    expect(r.summary?.avgRecoveryS).toBeGreaterThan(140);
    expect(r.summary?.note).toMatch(/^Even reps: only \d+ s\/km between fastest and slowest/);
    expect(r.segments.find((x) => x.kind === 'run')?.avgHr).toBeTruthy();
  });

  it('a steady run with no laps or reps shows 1 km splits', () => {
    const r = splitRun(run(stream([[1800, 300]])));
    expect(r.method).toBe('splits');
    expect(r.title).toBe('Splits');
    expect(r.segments.length).toBe(6);
    expect(Math.round(r.segments[0].paceS!)).toBe(300);
  });

  it('even 1 km auto-laps are splits, not reps; uneven laps with fast ones are reps', () => {
    const s = stream([[1800, 300]]);
    const auto = Array.from({ length: 6 }, (_, i) => ({ index: i + 1, startS: i * 300, durationS: 300, distanceM: 1000 }));
    expect(splitRun(run(s, { laps: auto })).method).toBe('splits');
    const laps = [{ index: 1, startS: 0, durationS: 600, distanceM: 2000 }, { index: 2, startS: 600, durationS: 190, distanceM: 1000 }, { index: 3, startS: 790, durationS: 120, distanceM: 300 },
      { index: 4, startS: 910, durationS: 191, distanceM: 1000 }, { index: 5, startS: 1101, durationS: 120, distanceM: 300 }, { index: 6, startS: 1221, durationS: 189, distanceM: 1000 }, { index: 7, startS: 1410, durationS: 600, distanceM: 2000 }];
    const r = splitRun(run(s, { laps }));
    expect(r.method).toBe('laps');
    expect(r.title).toBe('3 × 1 km');
    expect(r.segments.map((x) => x.kind)).toEqual(['warmup', 'run', 'recovery', 'run', 'recovery', 'run', 'cooldown']);
  });

  it('auto 1 km laps for the warm up, lap-button strides, then auto-laps again: as on the 10 Nov run', () => {
    const laps: { index: number; startS: number; durationS: number; distanceM: number }[] = [];
    let t = 0;
    const add = (durationS: number, distanceM: number) => { laps.push({ index: laps.length, startS: t, durationS, distanceM }); t += durationS; };
    for (const d of [293, 285, 283, 289, 290, 284]) add(d, 1000);
    add(153, 480);
    [[31, 160], [31, 158], [31, 158], [35, 176], [35, 175], [31, 150]].forEach(([d, m], i) => { add(d, m); if (i < 5) add(152, 470); });
    add(87, 277); for (const d of [300, 311, 301, 297]) add(d, 1000); add(63, 181);
    const r = splitRun(run(stream([[t, 300]]), { laps }));
    expect(r.method).toBe('laps');
    expect(r.title).toBe('6 × 30 s strides');
    expect(r.segments[0].kind).toBe('warmup');
    expect(Math.round(r.segments[0].distanceM)).toBe(6480);
    expect(segTime(r.segments[0].timeS)).toBe('31:17');
    expect(r.segments.filter((x) => x.kind === 'warmup')).toHaveLength(1);
    expect(r.segments.filter((x) => x.kind === 'cooldown')).toHaveLength(1);
    expect(r.segments.filter((x) => x.kind === 'recovery')).toHaveLength(5);
    expect(Math.round(r.summary!.avgRecoveryS!)).toBe(152);
  });

  it('workout steps from the watch come first', () => {
    const s = stream([[1800, 300]]);
    const laps = [{ index: 1, startS: 0, durationS: 600, distanceM: 2000, intensity: 'warmup' as const }, { index: 2, startS: 600, durationS: 600, distanceM: 2000, intensity: 'active' as const }, { index: 3, startS: 1200, durationS: 120, distanceM: 300, intensity: 'rest' as const }, { index: 4, startS: 1320, durationS: 600, distanceM: 2000, intensity: 'active' as const }];
    const r = splitRun(run(s, { laps }));
    expect(r.method).toBe('workout');
    expect(r.caption).toBe('from your workout');
    expect(r.reps).toHaveLength(2);
  });

  it('reps entered by hand are shown as entered', () => {
    const a: Activity = { ...run(stream([[60, 300]])), streams: undefined, reps: [1, 2, 3].map((i) => ({ label: `Rep ${i}`, kind: 'work' as const, timeS: 31, distanceM: 160 })) };
    const r = splitRun(a);
    expect(r.method).toBe('entered');
    expect(r.title).toBe('3 × 30 s strides');
  });

  it('times under a minute show tenths', () => {
    expect(segTime(31.63)).toBe('0:31.6');
    expect(segTime(1877)).toBe('31:17');
    expect(segTime(4189)).toBe('1:09:49');
  });
});
