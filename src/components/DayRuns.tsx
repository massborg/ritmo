// A day's runs as sessions: pieces saved as separate files (warm-up, strides, main run, cool-down) shown together
// with the session total. Each piece still opens on its own.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { Sheet } from './inputs';
import { dist, duration } from '../lib/format';
import { ROLE_LABEL, type RunGroup } from '../training/sessions';
import type { Activity, PlannedSession } from '../lib/types';
import { useRunLongPress } from './DeleteRun';

const time = (a: Activity) => new Date(a.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** With `session` (the day view on Training): which run matched the plan, which were extra, and Split / Change plan. */
export function DayRuns({ runs, unplanned, currentId, session }: { runs: Activity[]; unplanned?: boolean; currentId?: string; session?: PlannedSession }) {
  const { groupOf, labelOf, data, sessionOfRun, updateProfile, linkRunToSession } = useApp();
  const [choosing, setChoosing] = useState(false);
  const U = data.profile.units;
  // Press and hold a run to delete it (update 2, §8)
  const press = useRunLongPress();
  const groups: RunGroup[] = [];
  for (const a of runs) { const g = groupOf(a.id); if (g && !groups.includes(g)) groups.push(g); }
  const planned = session && session.type !== 'rest' ? session : undefined;
  // "Matched plan", "Swapped", or extra, for each run or session in parts on a day with a planned session
  const tag = (g: RunGroup) => {
    if (!planned) return unplanned ? ' · unplanned' : '';
    const s = sessionOfRun(g.main.id);
    if (s?.id === planned.id) return s.status === 'swapped' ? ' · swapped' : ' · Matched plan';
    return planned.completedActivityId ? ' · extra' : '';
  };
  const split = new Set(data.profile.splitRuns ?? []);
  const splitHere = runs.filter((a) => split.has(a.id));
  return (
    <>
    <ul className="list">
      {groups.map((g) => g.parts.length === 1 ? (
        <li key={g.id}><Link {...press.bind(g.main)} to={`/activity/${g.main.id}`} className={`list-item row-between run-link${g.main.id === currentId ? ' is-current' : ''}`} aria-current={g.main.id === currentId ? 'page' : undefined}>
          <span className="stack-sm" style={{ gap: 0 }}><span className="label">{g.main.name}</span><span className="caption">{time(g.main)} · {labelOf(g.main)}{tag(g) === ' · extra' ? '' : tag(g)}</span></span>
          <span className="stat">{dist(g.main.distanceM, U)} · {duration(g.main.movingS)}</span>
        </Link></li>
      ) : (
        <li key={g.id} className="stack-sm" style={{ padding: 'var(--s2) 0' }}>
          <Link to={`/activity/${g.main.id}`} className="row-between run-link session-head" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="stack-sm" style={{ gap: 0 }}><span className="label">{g.main.name}</span><span className="caption">Session of {g.parts.length} parts · {time(g.parts[0])}{tag(g)}</span></span>
            <span className="stat">{dist(g.totalM, U)} · {duration(g.movingS)}</span>
          </Link>
          <ol className="session-parts">
            {g.parts.map((p) => (
              <li key={p.id}><Link {...press.bind(p)} to={`/activity/${p.id}`} className={`row-between run-link${p.id === currentId ? ' is-current' : ''}`} aria-current={p.id === currentId ? 'page' : undefined}>
                <span className="caption"><strong className="run-part-name">{ROLE_LABEL[g.roles[p.id]]}</strong>{p.id === currentId ? <span className="run-here"> · viewing</span> : null}{g.roles[p.id] === 'main' ? ` · ${labelOf(p)}` : ''}</span>
                <span className="caption stat">{dist(p.distanceM, U)} · {duration(p.movingS)}</span>
              </Link></li>
            ))}
          </ol>
          {session && <button type="button" className="pill-btn" style={{ alignSelf: 'flex-start' }} onClick={() => updateProfile({ splitRuns: [...split, ...g.parts.slice(1).map((p) => p.id)] })}>Split into separate runs</button>}
        </li>
      ))}
      {press.sheet}
    </ul>
    {session && (planned && groups.length > 1 || splitHere.length > 0) && (
      <div className="row wrap day-run-actions" style={{ gap: 8 }}>
        {planned && groups.length > 1 && <button type="button" className="pill-btn" onClick={() => setChoosing(true)}>Change plan</button>}
        {splitHere.length > 0 && <button type="button" className="pill-btn" onClick={() => updateProfile({ splitRuns: [...split].filter((id) => !splitHere.some((a) => a.id === id)) })}>Join runs again</button>}
      </div>
    )}
    {planned && (
      <Sheet open={choosing} onClose={() => setChoosing(false)} title="Which run was your planned session?">
        <p className="caption">{planned.title}. The others count as extra runs.</p>
        <ul className="list">
          {groups.map((g) => (
            <li key={g.id}><button type="button" className="list-item row-between" style={{ width: '100%' }} aria-pressed={sessionOfRun(g.main.id)?.id === planned.id}
              onClick={() => { linkRunToSession(g.main.id, planned.id); setChoosing(false); }}>
              <span className="stack-sm" style={{ gap: 0, textAlign: 'left' }}><span className="label">{g.parts.length > 1 ? `Session of ${g.parts.length} parts` : g.main.name}</span><span className="caption">{time(g.parts[0])} · {labelOf(g.main).replace(' · extra', '')}</span></span>
              <span className="stat">{dist(g.totalM, U)}</span>
            </button></li>
          ))}
        </ul>
      </Sheet>
    )}
    </>
  );
}
