// Web Mercator maths for drawing a route over OpenStreetMap tiles (256 px squares, zoom 0-19).
// Pure functions, no network: the RouteMap component turns the result into <image> tiles under the route line.

export const TILE = 256;
export const TILE_URL = 'https://tile.openstreetmap.org';
export const MAX_ZOOM = 17;

/** World pixel position of a point at a zoom level. */
export function project(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = TILE * 2 ** z;
  const la = Math.max(-85.0511, Math.min(85.0511, lat)) * (Math.PI / 180);
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2) * n };
}

export interface MapView {
  z: number;
  /** World pixel of the view's top-left corner */
  ox: number;
  oy: number;
  tiles: { x: number; y: number; z: number; left: number; top: number; url: string }[];
  /** Point to view pixels */
  toView: (lat: number, lon: number) => { x: number; y: number };
}

/** The highest zoom (up to maxZoom) where the route fits inside w x h with padding, centred, and the tiles that cover
 *  the view. A single point is centred at maxZoom (a run that has only just started). */
export function fitView(points: { lat: number; lon: number }[], w: number, h: number, pad = 24, maxZoom = MAX_ZOOM): MapView | undefined {
  if (!points.length) return undefined;
  const lats = points.map((p) => p.lat), lons = points.map((p) => p.lon);
  const n0 = { lat: Math.max(...lats), lon: Math.min(...lons) }, s0 = { lat: Math.min(...lats), lon: Math.max(...lons) };
  let z = Math.min(MAX_ZOOM, maxZoom);
  for (; z > 1; z--) {
    const a = project(n0.lat, n0.lon, z), b = project(s0.lat, s0.lon, z);
    if (b.x - a.x <= w - 2 * pad && b.y - a.y <= h - 2 * pad) break;
  }
  const a = project(n0.lat, n0.lon, z), b = project(s0.lat, s0.lon, z);
  const ox = (a.x + b.x) / 2 - w / 2, oy = (a.y + b.y) / 2 - h / 2;
  const count = 2 ** z;
  const tiles: MapView['tiles'] = [];
  for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + h) / TILE); ty++) {
    if (ty < 0 || ty >= count) continue;
    for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + w) / TILE); tx++) {
      const x = ((tx % count) + count) % count;
      tiles.push({ x, y: ty, z, left: tx * TILE - ox, top: ty * TILE - oy, url: `${TILE_URL}/${z}/${x}/${ty}.png` });
    }
  }
  return { z, ox, oy, tiles, toView: (lat, lon) => { const p = project(lat, lon, z); return { x: p.x - ox, y: p.y - oy }; } };
}

const KEY = 'ritmo:maps';
/** Whether map tiles are shown behind routes on this device (on unless turned off). */
export function mapsOn(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function setMapsOn(on: boolean) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage blocked: the choice lasts for this visit */ }
}

const warmed = new Set<string>();
/**
 * Fetch the map tiles around a position ahead of time (into the browser's cache), so a run's map appears at once
 * instead of loading tile by tile after the start. A handful of tiles at the zooms a run starts on; each only once.
 */
export function prefetchTiles(lat: number, lon: number, w = 360, h = 360, zooms = [16, 15]): number {
  if (!mapsOn() || typeof Image === 'undefined') return 0;
  let n = 0;
  for (const z of zooms) {
    for (const t of fitView([{ lat, lon }], w + TILE, h + TILE, 0, z)?.tiles ?? []) {
      if (warmed.has(t.url)) continue;
      warmed.add(t.url);
      const img = new Image();
      img.decoding = 'async';
      img.src = t.url;
      n++;
    }
  }
  return n;
}
