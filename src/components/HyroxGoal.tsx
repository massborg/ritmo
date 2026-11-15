// The HYROX goal (update 4, task 6): division with its loads, race date, goal time, previous time, the hardest
// stations (up to 3) and the equipment available. Used in onboarding and in Profile, HYROX.
import { Chips, DateField } from './inputs';
import { DurationInput } from './TimeEntry';
import { STATIONS, loadFor, type Division, type StationKey } from '../hyrox/hyroxDivisions';
import type { HyroxPrefs } from '../hyrox/hyrox';
import { EQUIPMENT, hyroxRunPace, RUN_SHARE } from '../hyrox/plan-goal';
import { duration, pace as fmtPace } from '../lib/format';

type Format = 'open' | 'pro' | 'doubles' | 'relay';
type Who = 'women' | 'men' | 'mixed';
const split = (d: Division): [Format, Who] => { const [a, b] = d.split('_'); return a === 'women' || a === 'men' ? [b as Format, a] : [a as Format, b as Who]; };
const join = (f: Format, w: Who): Division => (f === 'open' || f === 'pro' ? `${w === 'mixed' ? 'men' : w}_${f}` : `${f}_${w}`) as Division;
export const MAX_HARDEST = 3;

export function HyroxGoalFields({ value, onChange, minDate, thresholdS }: { value: HyroxPrefs; onChange: (p: Partial<HyroxPrefs>) => void; minDate?: string; /** Threshold pace (s/km), to show the HYROX run pace */ thresholdS?: number }) {
  const division: Division = value.division ?? 'men_open';
  const [format, who] = split(division);
  const hardest = value.hardest ?? [];
  const equipment = value.equipment ?? EQUIPMENT.map((e) => e.value);
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const runPace = value.goalS ? hyroxRunPace(value.goalS, RUN_SHARE, thresholdS ?? 0) : undefined;
  return (
    <div className="stack hyrox-goal">
      <Chips<Format> label="Division" value={format} onChange={(f) => onChange({ division: join(f, (f === 'open' || f === 'pro') && who === 'mixed' ? 'men' : who) })}
        options={[{ value: 'open', label: 'Open' }, { value: 'pro', label: 'Pro' }, { value: 'doubles', label: 'Doubles' }, { value: 'relay', label: 'Relay' }]} />
      <Chips<Who> label="Category" value={who} onChange={(w) => onChange({ division: join(format, w) })}
        options={[{ value: 'women', label: 'Women' }, { value: 'men', label: 'Men' }, ...(format === 'doubles' || format === 'relay' ? [{ value: 'mixed' as Who, label: 'Mixed' }] : [])]} />
      <p className="caption hyrox-loads">Loads: sled push {loadFor(division, 'sled_push')?.text}, sled pull {loadFor(division, 'sled_pull')?.text}, farmers carry {loadFor(division, 'farmers_carry')?.text}, sandbag {loadFor(division, 'sandbag_lunges')?.text}, wall ball {loadFor(division, 'wall_balls')?.text}.</p>
      <DateField id="hg-date" label="Race date (optional)" value={value.raceDate ?? ''} min={minDate} onChange={(v) => onChange({ raceDate: v || undefined })} />
      {value.raceDate && <button type="button" className="btn btn-ghost btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => onChange({ raceDate: undefined })}>No race date yet</button>}
      <div className="field">
        <label htmlFor="hg-goal">Goal time</label>
        <DurationInput id="hg-goal" label="HYROX goal time" value={value.goalS} onChange={(v) => onChange({ goalS: v })} />
        <span className="caption" role="status">{value.goalS ? `HYROX in ${duration(value.goalS)}: about ${fmtPace(runPace!, 'km')} for each 1 km run${thresholdS && runPace === thresholdS ? ' (your threshold pace: the plan never asks for faster)' : ''}.` : 'Type the digits: 1 1 5 0 0 becomes 1:15:00. Leave it empty if you are not sure yet.'}</span>
      </div>
      <div className="field">
        <label htmlFor="hg-prev">Your last HYROX time (optional)</label>
        <DurationInput id="hg-prev" label="Previous HYROX time" value={value.previousS} onChange={(v) => onChange({ previousS: v })} />
      </div>
      <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 6 }}>Your hardest stations (up to {MAX_HARDEST})</legend>
        <div className="row wrap">
          {STATIONS.map((s) => { const on = hardest.includes(s.key); return <button key={s.key} type="button" className="chip" aria-pressed={on} disabled={!on && hardest.length >= MAX_HARDEST} onClick={() => onChange({ hardest: toggle<StationKey>(hardest, s.key) })}>{s.name}</button>; })}
        </div>
        <span className="caption">Your plan gives these extra practice: in compromised runs and in strength.</span>
      </fieldset>
      <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 6 }}>Equipment you can use</legend>
        <div className="row wrap">
          {EQUIPMENT.map((e) => <button key={e.value} type="button" className="chip" aria-pressed={equipment.includes(e.value)} onClick={() => onChange({ equipment: toggle(equipment, e.value) })}>{e.label}</button>)}
        </div>
        <span className="caption">Without a piece of equipment, Ritmo gives you the closest exercise instead.</span>
      </fieldset>
    </div>
  );
}
