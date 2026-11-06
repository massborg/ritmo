// Laps read from screenshots, mapped onto the planned session: the warm-up before the first fast lap, the reps,
// slow recovery jogs between reps, and the cool-down after the last rep. The runner checks and edits the result.

export interface ReadLap { rep: number; distance_m: number | null; time_s: number | null; pace_s_per_km: number | null; avg_hr: number | null; unsure: string[] }
export interface MappedRow { label: string; kind: 'warmup' | 'work' | 'recovery' | 'cooldown'; distanceM?: number; timeS?: number; avgHr?: number; unsure: ('time' | 'hr' | 'distance')[] }

const paceOf = (l: ReadLap) => l.pace_s_per_km ?? (l.time_s && l.distance_m ? l.time_s / (l.distance_m / 1000) : undefined);

export function mapLaps(laps: ReadLap[]): MappedRow[] {
  const paces = laps.map(paceOf);
  const known = paces.filter((p): p is number => !!p).sort((a, b) => a - b);
  let isWork = (_: number) => true;
  if (known.length >= 3) {
    const fast = known[Math.floor(known.length * 0.25)], slow = known[Math.floor(known.length * 0.75)];
    // A structured session has clearly faster and slower laps; then "work" means the faster group
    if (slow / fast > 1.12) { const cut = Math.sqrt(fast * slow); isWork = (i) => (paces[i] ?? Infinity) <= cut; }
  }
  const workIdx = laps.map((_, i) => i).filter((i) => isWork(i));
  const first = workIdx[0] ?? 0, last = workIdx[workIdx.length - 1] ?? laps.length - 1;
  let rep = 0;
  return laps.map((l, i) => {
    const kind: MappedRow['kind'] = i < first ? 'warmup' : i > last ? 'cooldown' : isWork(i) ? 'work' : 'recovery';
    if (kind === 'work') rep++;
    const unsure = l.unsure.map((u) => (u === 'time_s' || u === 'pace_s_per_km' ? 'time' : u === 'distance_m' ? 'distance' : u === 'avg_hr' ? 'hr' : undefined)).filter((x): x is 'time' | 'hr' | 'distance' => !!x);
    return {
      label: kind === 'work' ? `Rep ${rep}` : kind === 'warmup' ? 'Warm-up' : kind === 'cooldown' ? 'Cool-down' : 'Recovery',
      kind, distanceM: l.distance_m ?? undefined, timeS: l.time_s ?? undefined, avgHr: l.avg_hr ?? undefined, unsure: [...new Set(unsure)],
    };
  });
}
