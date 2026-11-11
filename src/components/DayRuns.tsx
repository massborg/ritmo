// A day's runs as sessions: pieces saved as separate files (warm-up, strides, main run, cool-down) shown together
// with the session total. Each piece still opens on its own.
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { dist, duration } from '../lib/format';
import { ROLE_LABEL, type RunGroup } from '../training/sessions';
import type { Activity } from '../lib/types';
import { useRunLongPress } from './DeleteRun';

const time = (a: Activity) => new Date(a.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function DayRuns({ runs, unplanned, currentId }: { runs: Activity[]; unplanned?: boolean; currentId?: string }) {
  const { groupOf, labelOf, data } = useApp();
  const U = data.profile.units;
  // Press and hold a run to delete it (update 2, §8)
  const press = useRunLongPress();
  const groups: RunGroup[] = [];
  for (const a of runs) { const g = groupOf(a.id); if (g && !groups.includes(g)) groups.push(g); }
  return (
    <ul className="list">
      {groups.map((g) => g.parts.length === 1 ? (
        <li key={g.id}><Link {...press.bind(g.main)} to={`/activity/${g.main.id}`} className={`list-item row-between run-link${g.main.id === currentId ? ' is-current' : ''}`} aria-current={g.main.id === currentId ? 'page' : undefined}>
          <span className="stack-sm" style={{ gap: 0 }}><span className="label">{g.main.name}</span><span className="caption">{time(g.main)} · {labelOf(g.main)}{unplanned ? ' · unplanned' : ''}</span></span>
          <span className="stat">{dist(g.main.distanceM, U)} · {duration(g.main.movingS)}</span>
        </Link></li>
      ) : (
        <li key={g.id} className="stack-sm" style={{ padding: 'var(--s2) 0' }}>
          <Link to={`/activity/${g.main.id}`} className="row-between run-link session-head" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="stack-sm" style={{ gap: 0 }}><span className="label">{g.main.name}</span><span className="caption">Session of {g.parts.length} parts · {time(g.parts[0])}{unplanned ? ' · unplanned' : ''}</span></span>
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
        </li>
      ))}
      {press.sheet}
    </ul>
  );
}
