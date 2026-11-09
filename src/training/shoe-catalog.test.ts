import { describe, expect, it } from 'vitest';
import { SHOE_CATALOG, searchShoes, shoeDisplayName } from './shoe-catalog';

describe('shoe finder', () => {
  it('finds a shoe by model, by brand and model, and without the version number', () => {
    expect(searchShoes('vomero plus')[0].model).toBe('Vomero Plus');
    expect(searchShoes('nike peg').map((s) => s.model)).toEqual(expect.arrayContaining(['Pegasus 41', 'Pegasus Plus', 'Pegasus Trail 5']));
    expect(searchShoes('ghost')[0]).toMatchObject({ brand: 'Brooks', model: 'Ghost 17', use: 'everyday', lifeKm: 700 });
    expect(searchShoes('Kayano')[0].note).toBe('Stability');
  });
  it('filters by brand, and racing shoes get a shorter life', () => {
    expect(searchShoes('', 'HOKA').every((s) => s.brand === 'HOKA')).toBe(true);
    expect(searchShoes('vaporfly')[0]).toMatchObject({ use: 'fast', lifeKm: 350 });
  });
  it('ids are unique, and the name reads naturally', () => {
    expect(new Set(SHOE_CATALOG.map((s) => s.id)).size).toBe(SHOE_CATALOG.length);
    expect(shoeDisplayName('Nike', 'Vomero Plus', 'Black')).toBe('Nike Vomero Plus (Black)');
    expect(searchShoes('zzzz')).toEqual([]);
  });
});
