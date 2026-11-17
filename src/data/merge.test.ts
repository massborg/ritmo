import { describe, expect, it } from 'vitest';
import { merge3 } from './merge';

describe('merge3', () => {
  const base = { units: 'km', strength: { units: 'kg', templates: [{ id: 'a', name: 'A' }] }, log: [{ id: 'l1', n: 1 }] };
  it('keeps a change made on either side', () => {
    const mine = { ...base, strength: { ...base.strength, templates: [...base.strength.templates, { id: 'b', name: 'B' }] } };
    const theirs = { ...base, units: 'mi' };
    expect(merge3(base, mine, theirs)).toEqual({ ...mine, units: 'mi' });
  });
  it('merges two lists changed on both sides by id (two tabs each save a workout)', () => {
    const mine = { ...base, strength: { ...base.strength, templates: [...base.strength.templates, { id: 'b', name: 'TabA' }] } };
    const theirs = { ...base, strength: { ...base.strength, templates: [...base.strength.templates, { id: 'c', name: 'TabB' }] } };
    expect(merge3(base, mine, theirs).strength.templates.map((t) => t.name)).toEqual(['A', 'TabA', 'TabB']);
  });
  it('a delete on one side stays deleted; an item edited here survives a delete elsewhere', () => {
    const mine = { ...base, log: [{ id: 'l1', n: 1 }, { id: 'l2', n: 2 }] };
    const theirs = { ...base, log: [] as { id: string; n: number }[], units: 'mi' };
    expect(merge3(base, mine, theirs).log).toEqual([{ id: 'l2', n: 2 }]);
    const deletedHere = { ...base, log: [] as { id: string; n: number }[], units: 'x' };
    expect(merge3(base, deletedHere, { ...base, units: 'mi', log: [{ id: 'l1', n: 1 }, { id: 'l3', n: 3 }] }).log).toEqual([{ id: 'l3', n: 3 }]);
  });
  it('this device wins when both changed the same plain value', () => {
    expect(merge3(base, { ...base, units: 'mi' }, { ...base, units: 'nm' }).units).toBe('mi');
  });
  it('a key removed on one side and untouched on the other is removed', () => {
    const b = { a: 1, b: 2 } as { a?: number; b?: number };
    expect(merge3(b, { b: 2 }, { a: 1, b: 3 })).toEqual({ b: 3 });
  });
});
