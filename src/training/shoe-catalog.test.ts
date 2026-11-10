import { describe, expect, it } from 'vitest';
import { SHOE_CATALOG, searchShoes, shoeDisplayName, shoeShape } from './shoe-catalog';
import { SHOE_SHAPES } from '../components/shoe-shapes';

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

  it('every shoe has a drawing that fits it', () => {
    const shape = (b: string, m: string) => SHOE_CATALOG.find((s) => s.brand === b && s.model === m)?.shape;
    expect(shape('Nike', 'Vaporfly 3')).toBe('carbon-racer');
    expect(shape('HOKA', 'Speedgoat 6')).toBe('trail');
    expect(shape('HOKA', 'Bondi 9')).toBe('max');
    expect(shape('ASICS', 'Gel-Kayano 32')).toBe('stability');
    expect(shape('Saucony', 'Endorphin Speed 4')).toBe('tempo');
    expect(shape('Saucony', 'Kinvara 15')).toBe('light-racer');
    expect(shape('Altra', 'Torin 8')).toBe('wide-toe');
    expect(shape('Brooks', 'Ghost 17')).toBe('daily');
    for (const s of SHOE_CATALOG) expect(SHOE_SHAPES[s.shape]).toBeTruthy();
    // All eight drawings are used
    expect(new Set(SHOE_CATALOG.map((s) => s.shape)).size).toBe(Object.keys(SHOE_SHAPES).length);
  });

  it('a shoe added by name gets the drawing for what it is used for', () => {
    expect(shoeShape({ name: 'Old trail pair', use: 'trail' } as never)).toBe('trail');
    expect(shoeShape({ brand: 'Nike', model: 'Alphafly 3', use: 'everyday' })).toBe('carbon-racer');
    expect(shoeShape({})).toBe('daily');
  });

  it('the drawings carry no scripts, links or images', () => {
    for (const parts of Object.values(SHOE_SHAPES)) for (const [, d] of parts) expect(d).toMatch(/^[MmLlHhVvQqCcZz0-9 .,-]+$/);
  });

  it('covers the brands runners use, with current models (about 250)', () => {
    expect(SHOE_CATALOG.length).toBeGreaterThanOrEqual(240);
    for (const b of ['Under Armour', 'Topo Athletic', 'Kiprun', 'Karhu', 'Inov-8', 'Skechers', 'Craft', 'Merrell']) expect(SHOE_CATALOG.some((s) => s.brand === b)).toBe(true);
    expect(searchShoes('topo phantom')[0]?.shape).toBe('wide-toe');
    expect(searchShoes('kiprun kd900x ld')[0]?.shape).toBe('carbon-racer');
    expect(searchShoes('speedgoat')[0]?.shape).toBe('trail');
    // A brand filter shows every model of that brand
    expect(searchShoes('', 'HOKA', 100).length).toBe(SHOE_CATALOG.filter((s) => s.brand === 'HOKA').length);
  });
});

