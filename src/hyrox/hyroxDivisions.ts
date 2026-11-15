// HYROX race format and loads, season 2025/26. Update this file each season: nothing else holds these numbers.
// 8 × (1 km run + station), in this order. Sled weights include the sled.
export const HYROX_SEASON = '2025/26';

export type StationKey = 'skierg' | 'sled_push' | 'sled_pull' | 'burpee_broad_jump' | 'row' | 'farmers_carry' | 'sandbag_lunges' | 'wall_balls';
/** The four weight classes; doubles and relay use one of them (see DIVISIONS) */
export type LoadClass = 'women_open' | 'men_open' | 'women_pro' | 'men_pro';
export type Division = LoadClass | 'doubles_women' | 'doubles_men' | 'doubles_mixed' | 'relay_women' | 'relay_men' | 'relay_mixed';

export interface Station {
  key: StationKey; n: number; name: string;
  /** The work, as distance or reps */
  distanceM?: number; reps?: number;
  /** The movement standard, in a few words */
  standard: string;
  /** What to do instead when the equipment is missing. A swapped station is flagged and left out of records. */
  swaps: { id: string; name: string; work: string }[];
  /** Which exercise in the strength library this is, if any */
  exerciseId?: string;
}

export const RUN_M = 1000;

export const STATIONS: Station[] = [
  { key: 'skierg', n: 1, name: 'SkiErg', distanceM: 1000, standard: 'feet stay on the platform', swaps: [{ id: 'band-pulldown', name: 'Band pull-downs', work: '100 reps' }], exerciseId: 'band-pulldown' },
  { key: 'sled_push', n: 2, name: 'Sled push', distanceM: 50, standard: '4 lengths of 12.5 m, the whole sled over the line', swaps: [{ id: 'prowler', name: 'Heavy prowler push', work: '50 m' }, { id: 'treadmill-push', name: 'Treadmill push, belt off', work: '50 m' }], exerciseId: 'sled-push' },
  { key: 'sled_pull', n: 3, name: 'Sled pull', distanceM: 50, standard: 'stay inside the box, pull hand over hand', swaps: [{ id: 'band-drag', name: 'Band sled drag', work: '50 m' }, { id: 'heavy-row', name: 'Heavy band rows', work: '60 reps' }], exerciseId: 'sled-pull' },
  { key: 'burpee_broad_jump', n: 4, name: 'Burpee broad jumps', distanceM: 80, standard: 'chest to floor, jump with both feet', swaps: [], exerciseId: 'burpee-broad-jump' },
  { key: 'row', n: 5, name: 'Row', distanceM: 1000, standard: 'stay seated until the monitor shows 1000 m', swaps: [{ id: 'skierg', name: 'SkiErg', work: '1000 m' }, { id: 'bike', name: 'Bike erg', work: '2000 m' }] },
  { key: 'farmers_carry', n: 6, name: 'Farmers carry', distanceM: 200, standard: 'arms straight, put the weights down as often as you need', swaps: [{ id: 'lighter-carry', name: 'Carry with the weights you have', work: '200 m' }], exerciseId: 'farmers-carry' },
  { key: 'sandbag_lunges', n: 7, name: 'Sandbag lunges', distanceM: 100, standard: 'back knee touches the floor, bag stays on the shoulders', swaps: [{ id: 'db-lunge', name: 'Dumbbell walking lunges', work: '100 m' }], exerciseId: 'sandbag-lunge' },
  { key: 'wall_balls', n: 8, name: 'Wall balls', reps: 100, standard: 'hips below the knees, hit the target', swaps: [{ id: 'thruster', name: 'Thrusters', work: '100 reps' }], exerciseId: 'wall-ball' },
];
export const stationByKey = new Map(STATIONS.map((s) => [s.key, s]));

/** Load for each station by weight class: kg (per hand for the carry), and how it is shown */
export const LOADS: Record<LoadClass, Partial<Record<StationKey, { kg: number; text: string }>>> = {
  women_open: { sled_push: { kg: 102, text: '102 kg' }, sled_pull: { kg: 78, text: '78 kg' }, farmers_carry: { kg: 16, text: '2 × 16 kg' }, sandbag_lunges: { kg: 10, text: '10 kg' }, wall_balls: { kg: 4, text: '4 kg to 2.70 m' } },
  men_open: { sled_push: { kg: 152, text: '152 kg' }, sled_pull: { kg: 103, text: '103 kg' }, farmers_carry: { kg: 24, text: '2 × 24 kg' }, sandbag_lunges: { kg: 20, text: '20 kg' }, wall_balls: { kg: 6, text: '6 kg to 3.00 m' } },
  women_pro: { sled_push: { kg: 152, text: '152 kg' }, sled_pull: { kg: 103, text: '103 kg' }, farmers_carry: { kg: 24, text: '2 × 24 kg' }, sandbag_lunges: { kg: 20, text: '20 kg' }, wall_balls: { kg: 6, text: '6 kg to 2.70 m' } },
  men_pro: { sled_push: { kg: 202, text: '202 kg' }, sled_pull: { kg: 153, text: '153 kg' }, farmers_carry: { kg: 32, text: '2 × 32 kg' }, sandbag_lunges: { kg: 30, text: '30 kg' }, wall_balls: { kg: 9, text: '9 kg to 3.00 m' } },
};

export const DIVISIONS: { value: Division; label: string; loads: LoadClass; note?: string }[] = [
  { value: 'women_open', label: 'Women Open', loads: 'women_open' },
  { value: 'men_open', label: 'Men Open', loads: 'men_open' },
  { value: 'women_pro', label: 'Women Pro', loads: 'women_pro' },
  { value: 'men_pro', label: 'Men Pro', loads: 'men_pro' },
  { value: 'doubles_women', label: 'Doubles Women', loads: 'women_open', note: 'Partners split the station work; both run all 8 km.' },
  { value: 'doubles_men', label: 'Doubles Men', loads: 'men_open', note: 'Partners split the station work; both run all 8 km.' },
  { value: 'doubles_mixed', label: 'Doubles Mixed', loads: 'men_open', note: 'Partners split the station work; both run all 8 km. Mixed pairs use the Men Open weights.' },
  { value: 'relay_women', label: 'Relay Women', loads: 'women_open', note: '4 people: each does 2 runs and 2 stations.' },
  { value: 'relay_men', label: 'Relay Men', loads: 'men_open', note: '4 people: each does 2 runs and 2 stations.' },
  { value: 'relay_mixed', label: 'Relay Mixed', loads: 'men_open', note: '4 people: each does 2 runs and 2 stations. Women use the Women Open weights.' },
];
export const divisionLabel = (d: Division) => DIVISIONS.find((x) => x.value === d)?.label ?? d;
export const loadFor = (d: Division, k: StationKey) => LOADS[DIVISIONS.find((x) => x.value === d)?.loads ?? 'men_open'][k];
