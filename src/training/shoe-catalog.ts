// A built-in list of popular running shoes, so runners can find theirs by brand or model instead of typing a name.
// Names only (no product photos): each model has what it is mostly used for and a typical lifespan, which pre-fill
// the shoe's settings. Runners can always change both, or add a shoe that is not listed.
import type { Shoe, ShoeUse } from '../lib/types';
import type { ShoeShape } from '../components/shoe-shapes';

export interface CatalogShoe { id: string; brand: string; model: string; use: ShoeUse; lifeKm: number; note?: string; /** Which generic drawing fits it */ shape: ShoeShape }

const LIFE: Record<ShoeUse, number> = { everyday: 700, long: 800, fast: 450, trail: 700 };
const RACE = 350; // carbon-plated racing shoes wear out sooner

// [model, use, lifeKm?, note?]
type Row = [string, ShoeUse, number?, string?];
const BRANDS: Record<string, Row[]> = {
  Nike: [['Pegasus 41', 'everyday'], ['Pegasus Plus', 'everyday'], ['Vomero 18', 'long'], ['Vomero Plus', 'long'], ['Invincible 3', 'long'], ['Structure 26', 'everyday', 700, 'Stability'],
    ['Zoom Fly 6', 'fast'], ['Vaporfly 3', 'fast', RACE, 'Race'], ['Alphafly 3', 'fast', RACE, 'Race'], ['Streakfly 2', 'fast', RACE, 'Race'], ['Pegasus Trail 5', 'trail'], ['Ultrafly', 'trail', 500], ['Wildhorse 8', 'trail'], ['Zegama 2', 'trail']],
  adidas: [['Adizero Boston 13', 'fast'], ['Adizero SL2', 'everyday'], ['Adizero Evo SL', 'fast'], ['Adizero Adios Pro 4', 'fast', RACE, 'Race'], ['Supernova Rise 2', 'everyday'], ['Ultraboost 5', 'everyday'], ['Adistar 3', 'long'], ['Terrex Agravic Speed', 'trail']],
  ASICS: [['Gel-Nimbus 27', 'long'], ['Gel-Cumulus 27', 'everyday'], ['Gel-Kayano 32', 'everyday', 700, 'Stability'], ['GT-2000 13', 'everyday', 700, 'Stability'], ['Novablast 5', 'everyday'], ['Superblast 2', 'long'], ['Megablast', 'fast'],
    ['Magic Speed 4', 'fast'], ['Metaspeed Sky Paris', 'fast', RACE, 'Race'], ['Metaspeed Edge Paris', 'fast', RACE, 'Race'], ['Trabuco Max 4', 'trail']],
  Brooks: [['Ghost 17', 'everyday'], ['Glycerin 22', 'long'], ['Adrenaline GTS 24', 'everyday', 700, 'Stability'], ['Launch 11', 'fast'], ['Hyperion Max 2', 'fast'], ['Hyperion Elite 4', 'fast', RACE, 'Race'], ['Cascadia 18', 'trail'], ['Caldera 8', 'trail']],
  HOKA: [['Clifton 10', 'everyday'], ['Bondi 9', 'long'], ['Skyward X', 'long'], ['Arahi 7', 'everyday', 700, 'Stability'], ['Gaviota 5', 'long', 800, 'Stability'], ['Mach 6', 'fast'], ['Mach X 2', 'fast'], ['Rocket X 2', 'fast', RACE, 'Race'], ['Cielo X1 3.0', 'fast', RACE, 'Race'], ['Speedgoat 6', 'trail'], ['Tecton X 3', 'trail', 500]],
  'New Balance': [['Fresh Foam X 1080v14', 'long'], ['Fresh Foam X 880v15', 'everyday'], ['Fresh Foam X More v5', 'long'], ['FuelCell Rebel v4', 'fast'], ['FuelCell SC Trainer v3', 'long'], ['FuelCell SC Elite v4', 'fast', RACE, 'Race'], ['Fresh Foam X Hierro v9', 'trail']],
  Saucony: [['Ride 18', 'everyday'], ['Triumph 22', 'long'], ['Guide 18', 'everyday', 700, 'Stability'], ['Hurricane 24', 'long', 800, 'Stability'], ['Kinvara 15', 'fast'], ['Endorphin Speed 4', 'fast'], ['Endorphin Pro 4', 'fast', RACE, 'Race'], ['Endorphin Elite 2', 'fast', RACE, 'Race'], ['Peregrine 15', 'trail'], ['Xodus Ultra 3', 'trail']],
  On: [['Cloudmonster 2', 'long'], ['Cloudsurfer 2', 'everyday'], ['Cloudrunner 2', 'everyday', 700, 'Stability'], ['Cloudeclipse', 'long'], ['Cloudflow 4', 'fast'], ['Cloudboom Strike', 'fast', RACE, 'Race'], ['Cloudultra 2', 'trail']],
  PUMA: [['Velocity Nitro 3', 'everyday'], ['MagMax Nitro', 'long'], ['ForeverRun Nitro', 'everyday', 700, 'Stability'], ['Deviate Nitro 3', 'fast'], ['Deviate Nitro Elite 3', 'fast', RACE, 'Race'], ['Fast-R Nitro Elite 3', 'fast', RACE, 'Race']],
  Mizuno: [['Wave Rider 28', 'everyday'], ['Wave Sky 8', 'long'], ['Neo Zen', 'everyday'], ['Wave Rebellion Pro 3', 'fast', RACE, 'Race'], ['Wave Daichi 8', 'trail']],
  Altra: [['Torin 8', 'everyday'], ['Experience Flow 2', 'everyday'], ['Escalante 4', 'everyday'], ['Lone Peak 9', 'trail']],
  Salomon: [['Aero Glide 3', 'everyday'], ['S/Lab Phantasm 2', 'fast', RACE, 'Race'], ['Speedcross 6', 'trail'], ['Sense Ride 5', 'trail'], ['Genesis', 'trail']],
};

// Shoes whose drawing is not the one their use suggests: light, low racers and trainers, and zero-drop road shoes
const LIGHT = new Set(['Nike Streakfly 2', 'Brooks Launch 11', 'Saucony Kinvara 15', 'adidas Adizero SL2', 'Mizuno Wave Rebellion Pro 3']);
const WIDE_TOE = new Set(['Altra Torin 8', 'Altra Experience Flow 2', 'Altra Escalante 4']);

/** The drawing for a shoe from what it is for, when it is not in the list */
export const shapeForUse = (use: ShoeUse = 'everyday', note?: string): ShoeShape =>
  use === 'trail' ? 'trail' : note === 'Race' ? 'carbon-racer' : note === 'Stability' ? 'stability' : use === 'fast' ? 'tempo' : use === 'long' ? 'max' : 'daily';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
export const SHOE_CATALOG: CatalogShoe[] = Object.entries(BRANDS).flatMap(([brand, rows]) =>
  rows.map(([model, use, life, note]) => {
    const name = `${brand} ${model}`;
    const shape: ShoeShape = LIGHT.has(name) ? 'light-racer' : WIDE_TOE.has(name) ? 'wide-toe' : shapeForUse(use, note);
    return { id: `${slug(brand)}-${slug(model)}`, brand, model, use, lifeKm: life ?? LIFE[use], note, shape };
  }));

/** The drawing for one of the runner's shoes: its model's, otherwise from what it is used for */
export function shoeShape(s: Pick<Shoe, 'brand' | 'model' | 'use'>): ShoeShape {
  const c = s.brand && s.model ? SHOE_CATALOG.find((x) => x.brand === s.brand && x.model === s.model) : undefined;
  return c?.shape ?? shapeForUse(s.use);
}
export const SHOE_BRANDS = Object.keys(BRANDS);

/** Colours for the shoe picture and name. The names are the runner's choice; the swatches are design tokens' kin. */
export const SHOE_COLOURS: { name: string; hex: string }[] = [
  { name: 'Black', hex: '#1E1A17' }, { name: 'White', hex: '#F4F1EC' }, { name: 'Grey', hex: '#8E8780' }, { name: 'Blue', hex: '#2F5FB3' },
  { name: 'Red', hex: '#C2332B' }, { name: 'Orange', hex: '#E8480C' }, { name: 'Yellow', hex: '#E9B91E' }, { name: 'Green', hex: '#2E8A5C' },
  { name: 'Pink', hex: '#E27BA6' }, { name: 'Purple', hex: '#6F4BB0' },
];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Shoes matching a search, best first: every word must appear in the brand or model ("vomero plus", "nike peg",
 * "kayano"). Numbers can be left out ("ghost" finds Ghost 17). Optionally only one brand.
 */
export function searchShoes(query: string, brand?: string, max = 30): CatalogShoe[] {
  const words = norm(query).split(' ').filter(Boolean);
  const pool = brand ? SHOE_CATALOG.filter((s) => s.brand === brand) : SHOE_CATALOG;
  if (!words.length) return pool.slice(0, max);
  const scored = pool.map((s) => {
    const hay = norm(`${s.brand} ${s.model}`);
    const model = norm(s.model);
    if (!words.every((w) => hay.includes(w))) return null;
    const score = (model.startsWith(words[words.length - 1]) ? 2 : 0) + words.filter((w) => model.split(' ').includes(w)).length;
    return { s, score };
  }).filter((x): x is { s: CatalogShoe; score: number } => !!x);
  return scored.sort((a, b) => b.score - a.score || a.s.brand.localeCompare(b.s.brand) || a.s.model.localeCompare(b.s.model)).slice(0, max).map((x) => x.s);
}

/** "Nike Vomero Plus (Black)" */
export const shoeDisplayName = (brand: string, model: string, colour?: string) => `${brand} ${model}${colour ? ` (${colour})` : ''}`;
