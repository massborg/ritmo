// Choose your week (update 3, §7): "Ritmo plans it" or "I choose each day", a picker for each weekday, "+ Strength"
// on run days, "Let Ritmo adjust by phase", and guard rails that warn but never block.
import { AlertTriangle, Dumbbell } from 'lucide-react';
import { DAY_NAMES } from '../lib/format';
import { DAY_CHOICES, emptyWeek, weekWarnings, type DayChoice, type WeekChoice } from '../training/week-choice';
import type { Role } from '../training/generator';

export function WeekChooser({ value, onChange, autoRoles }: { value?: WeekChoice; onChange: (w: WeekChoice) => void; autoRoles?: Role[] }) {
  const w = value ?? emptyWeek();
  const custom = w.mode === 'custom';
  const setDay = (d: number, c: DayChoice) => { const days = [...w.days]; days[d] = c; const plusStrength = [...w.plusStrength]; if (c === 'rest' || c === 'strength') plusStrength[d] = false; onChange({ ...w, days, plusStrength }); };
  const togglePlus = (d: number) => { const plusStrength = [...w.plusStrength]; plusStrength[d] = !plusStrength[d]; onChange({ ...w, plusStrength }); };
  const warnings = weekWarnings(w, autoRoles);
  const autoName = (d: number) => { const r = autoRoles?.[d]; return r === 'long' ? 'long run' : r === 'q1' || r === 'q2' ? 'a hard session' : r === 'easy' ? 'easy' : r === 'rest' ? 'rest' : ''; };
  return (
    <div className="stack week-chooser">
      <div className="segmented" role="group" aria-label="Who plans your week">
        <button type="button" aria-pressed={!custom} onClick={() => onChange({ ...w, mode: 'auto' })}>Ritmo plans it</button>
        <button type="button" aria-pressed={custom} onClick={() => onChange({ ...w, mode: 'custom' })}>I choose each day</button>
      </div>
      {custom && (
        <>
          <p className="caption">Ritmo still fills in each session: distance, reps and paces from your fitness, the phase and your race.</p>
          <ul className="week-days">
            {DAY_NAMES.map((name, d) => {
              const c = w.days[d] ?? 'auto';
              const canPlus = c !== 'rest' && c !== 'strength';
              return (
                <li key={name} className="week-day-row">
                  <label className="label" htmlFor={`wd-${d}`}>{name}</label>
                  <select id={`wd-${d}`} className="input" value={c} onChange={(e) => setDay(d, e.target.value as DayChoice)}>
                    {DAY_CHOICES.map((o) => <option key={o.value} value={o.value}>{o.value === 'auto' && autoName(d) ? `Ritmo picks (${autoName(d)})` : o.label}</option>)}
                  </select>
                  <button type="button" className="chip week-plus" aria-pressed={!!w.plusStrength[d]} disabled={!canPlus} aria-label={`Add strength on ${name}`} onClick={() => togglePlus(d)}>
                    <Dumbbell size={14} strokeWidth={2} aria-hidden="true" />+<span className="week-plus-text"> Strength</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="caption">Strength on a rest day means no run that day: a moderate strength session, treated as recovery.</p>
          <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={w.adjustByPhase} onChange={(e) => onChange({ ...w, adjustByPhase: e.target.checked })} /> Let Ritmo adjust by phase</label>
          <p className="caption">{w.adjustByPhase ? 'Ritmo may make a hard day easier in the base phase or in a lighter week.' : 'Your session types stay as chosen in every phase. Race week is always adjusted to keep you fresh.'}</p>
          {warnings.length > 0 && (
            <div className="card stack-sm week-warnings" role="status">
              {warnings.map((x) => <p key={x} className="caption row" style={{ gap: 8, alignItems: 'flex-start' }}><AlertTriangle size={16} strokeWidth={2} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />{x}</p>)}
              <p className="caption">You can keep your choice: these are only warnings.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** "Mon threshold, Tue easy + strength, …" for Plan changes */
export function describeWeek(w: WeekChoice): string {
  const short = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const name = (c: DayChoice) => (c === 'auto' ? 'Ritmo picks' : c === 'long' ? 'long run' : c === 'strength' ? 'strength (no run)' : c);
  return w.days.map((c, d) => `${short[d]} ${name(c)}${w.plusStrength[d] ? ' + strength' : ''}`).join(', ');
}
