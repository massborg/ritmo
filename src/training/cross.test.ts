import { describe, expect, it } from 'vitest';
import { crossLoad, loadSeries } from './load';
import type { LogEntry } from '../lib/types';

const hr = { rest: 50, max: 190 } as Parameters<typeof loadSeries>[1];
const entry = (o: Partial<LogEntry>): LogEntry => ({ id: 'x', date: '2026-11-02', kind: 'cross', sport: 'Bike', minutes: 60, rpe: 7, at: '', ...o });

describe('cross-training load', () => {
  it('scales with minutes, effort and sport', () => {
    expect(crossLoad(entry({}))).toBeCloseTo(70, 0); // an hour on the bike at threshold effort
    expect(crossLoad(entry({ minutes: 30 }))).toBeCloseTo(35, 0);
    expect(crossLoad(entry({ rpe: 4 }))).toBeLessThan(crossLoad(entry({ rpe: 8 })));
    expect(crossLoad(entry({ sport: 'Swim' }))).toBeLessThan(crossLoad(entry({ sport: 'Elliptical' })));
  });
  it('ignores notes and entries without minutes', () => {
    expect(crossLoad(entry({ kind: 'note' }))).toBe(0);
    expect(crossLoad(entry({ minutes: undefined }))).toBe(0);
  });
  it('adds to fatigue and fitness on the day', () => {
    const to = new Date('2026-11-03T09:00:00');
    const without = loadSeries([], hr, undefined, to, 10);
    const withCross = loadSeries([], hr, undefined, to, 10, [entry({})]);
    const day = (s: typeof without) => s.find((d) => d.date === '2026-11-02')!;
    expect(day(without).load).toBe(0);
    expect(day(withCross).load).toBeCloseTo(70, 0);
    expect(withCross[withCross.length - 1].atl).toBeGreaterThan(without[without.length - 1].atl);
  });
});
