import { describe, expect, it } from 'vitest';
import { fuelling, raceReport, splitStep, targetSplits, warmup } from './raceday';

describe('race-day mode', () => {
  it('splits add up exactly to the target, for both strategies', () => {
    for (const st of ['even', 'negative'] as const) {
      const rows = targetSplits(10000, 45 * 60, st);
      expect(rows).toHaveLength(10);
      expect(rows[rows.length - 1].cumS).toBeCloseTo(2700, 6);
      expect(rows[rows.length - 1].label).toBe('Finish');
    }
    const neg = targetSplits(10000, 2700, 'negative');
    expect(neg[0].paceS).toBeGreaterThan(neg[9].paceS);
    expect(neg[0].paceS / neg[9].paceS).toBeCloseTo(1.01 / 0.99, 3);
    expect(targetSplits(10000, 2700, 'even').every((r) => Math.abs(r.paceS - 270) < 1e-6)).toBe(true);
  });
  it('uses 5 km splits beyond the half, with a short last segment', () => {
    expect(splitStep(42195)).toBe(5000);
    const m = targetSplits(42195, 3.5 * 3600, 'even');
    expect(m).toHaveLength(9);
    expect(m[8].segM).toBe(2195);
    expect(m[8].cumS).toBeCloseTo(12600, 6);
  });
  it('warm-up and fuelling suit the distance', () => {
    expect(warmup(5000).some((s) => s.label === 'Strides')).toBe(true);
    expect(warmup(42195).some((s) => s.label === 'Strides')).toBe(false);
    expect(fuelling(5000).some((f) => f.when === 'The day before')).toBe(false);
    expect(fuelling(42195)[0].when).toBe('The day before');
  });
  it('compares actual splits with the plan', () => {
    const plan = targetSplits(5000, 25 * 60, 'even'); // 300 s per km
    // went out fast: 280, 290, 300, 315, 320 s per km
    const per = [280, 290, 300, 315, 320];
    const streams = [{ t: 0, d: 0 }];
    let t = 0;
    per.forEach((p, k) => { for (let i = 1; i <= 10; i++) { t += p / 10; streams.push({ t, d: k * 1000 + i * 100 }); } });
    const r = raceReport(streams, plan)!;
    expect(r.rows.map((x) => Math.round(x.diffS!))).toEqual([-20, -10, 0, 15, 20]);
    expect(r.summary).toMatch(/^5 s slower than plan overall\. You went out faster than planned/);
    expect(raceReport(undefined, plan)).toBeUndefined();
  });
});
