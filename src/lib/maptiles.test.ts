import { describe, expect, it } from 'vitest';
import { fitView, project, TILE } from './maptiles';

const route = Array.from({ length: 100 }, (_, i) => ({ lat: 35.9 + i * 0.0004, lon: 14.5 + Math.sin(i / 10) * 0.003 }));

describe('map tiles', () => {
  it('projects like the standard tile scheme', () => {
    expect(project(0, 0, 0)).toEqual({ x: 128, y: 128 });
    const p = project(35.9, 14.5, 15);
    expect(Math.floor(p.x / TILE)).toBe(17703); // Malta, z15 tile column
    expect(Math.floor(p.y / TILE)).toBe(12878);
  });
  it('fits the route inside the view with padding', () => {
    const v = fitView(route, 640, 400)!;
    const pts = route.map((p) => v.toView(p.lat, p.lon));
    for (const p of pts) {
      expect(p.x).toBeGreaterThanOrEqual(23.9); expect(p.x).toBeLessThanOrEqual(616.1);
      expect(p.y).toBeGreaterThanOrEqual(23.9); expect(p.y).toBeLessThanOrEqual(376.1);
    }
    // one zoom closer would no longer fit
    expect(fitView(route, 640, 400, 24)!.z).toBeLessThan(18);
  });
  it('covers the whole view with tiles', () => {
    const v = fitView(route, 640, 400)!;
    expect(v.tiles.length).toBeGreaterThanOrEqual(4);
    expect(Math.min(...v.tiles.map((t) => t.left))).toBeLessThanOrEqual(0);
    expect(Math.min(...v.tiles.map((t) => t.top))).toBeLessThanOrEqual(0);
    expect(Math.max(...v.tiles.map((t) => t.left + TILE))).toBeGreaterThanOrEqual(640);
    expect(Math.max(...v.tiles.map((t) => t.top + TILE))).toBeGreaterThanOrEqual(400);
    expect(v.tiles[0].url).toMatch(/^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/);
  });
  it('centres a single point at the zoom limit, and never zooms past it', () => {
    expect(fitView([], 640, 400)).toBeUndefined();
    const one = fitView([{ lat: 35.9, lon: 14.5 }], 360, 360, 24, 16)!;
    expect(one.z).toBe(16);
    const c = one.toView(35.9, 14.5);
    expect(c.x).toBeCloseTo(180, 6); expect(c.y).toBeCloseTo(180, 6);
    // GPS wobble of a few metres stays small instead of filling the view
    const wobble = fitView([{ lat: 35.9, lon: 14.5 }, { lat: 35.90008, lon: 14.50005 }], 360, 360, 24, 16)!;
    expect(wobble.z).toBe(16);
    const a = wobble.toView(35.9, 14.5), b = wobble.toView(35.90008, 14.50005);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(20);
  });
});
