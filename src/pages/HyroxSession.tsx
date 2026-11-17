// A HYROX session's summary (update 4, task 5): total against the goal; running, stations and Roxzone totals; the
// run splits as bars, with the runs that were slower named by the station before them; each station against its
// target or the best before; and the records it set.
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { clock, deltaTag, records, segmentName, summarise, targetMs, type HyroxSession } from '../hyrox/hyrox';
import { divisionLabel, type StationKey } from '../hyrox/hyroxDivisions';
import { parseYmd, ymd } from '../lib/format';

export default function HyroxSessionPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, removeLog } = useApp();
  const all = (data.profile.log ?? []).filter((e) => e.kind === 'hyrox' && e.hyrox).map((e) => e.hyrox as HyroxSession);
  const s = all.find((x) => x.id === id);
  if (!s) return <div className="stack-lg"><AppHeader title="HYROX" back large={false} /><p className="muted">This session was not found.</p><Link to="/hyrox" className="btn">Back to HYROX</Link></div>;
  const sum = summarise(s);
  const earlier = all.filter((x) => x.startedAt < s.startedAt);
  const before = records(earlier), after = records([...earlier, s]);
  const stations = s.segments.filter((x) => x.kind === 'station');
  const maxRun = Math.max(1, ...sum.runs.map((r) => r.ms)), minRun = Math.min(...sum.runs.map((r) => r.ms));
  const runTarget = targetMs('run', data.profile.hyrox, earlier);
  const day = parseYmd(ymd(new Date(s.startedAt))).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  // What this session set
  const set: string[] = [];
  if (after.simulation?.id === s.id) set.push(before.simulation ? `Best full simulation: ${clock(s.totalMs)} (was ${clock(before.simulation.ms)})` : `First full simulation: ${clock(s.totalMs)}`);
  if (after.race?.id === s.id) set.push(before.race ? `Best race: ${clock(s.totalMs)} (was ${clock(before.race.ms)})` : `First race result: ${clock(s.totalMs)}`);
  if (after.run && (!before.run || after.run.ms < before.run.ms) && s.segments.some((x) => x.kind === 'run' && x.ms === after.run!.ms)) set.push(`Best 1 km run split: ${clock(after.run.ms)}`);
  for (const x of stations) { const k = x.key as StationKey; if (!x.swapped && after.stations[k]?.ms === x.ms && before.stations[k] && x.ms < before.stations[k]!.ms) set.push(`Best ${segmentName(x).toLowerCase()}: ${clock(x.ms)} (was ${clock(before.stations[k]!.ms)})`); }
  // The goal is for the whole thing: a session stopped early is not measured against it (4:00 is not "goal met")
  const whole = sum.runs.length === 8 && stations.length === 8;
  const goal = whole ? s.goalMs : undefined;
  return (
    <div className="stack-lg hyrox-summary" style={{ maxWidth: 720 }}>
      <AppHeader title="HYROX" back large={false} />
      <div>
        <p className="caption">{day} · {s.title}{s.entered ? ' · official splits' : ''}{s.indoor ? ' · treadmill' : ''}</p>
        <p className="row-between" style={{ alignItems: 'center', margin: 0 }}>
          <span className="stat-xl hx-sum-total" data-testid="hx-sum-total">{clock(s.totalMs)}</span>
          {goal ? <span className={`hx-goal ${s.totalMs <= goal ? 'met' : ''}`}>Goal {clock(goal)}{sum.vsGoalMs != null ? ` · ${sum.vsGoalMs <= 0 ? '−' : '+'}${clock(Math.abs(sum.vsGoalMs))}` : ''}</span> : <span className="caption">{divisionLabel(s.division)}</span>}
        </p>
      </div>
      <section className="hx-totals" aria-label="Totals">
        <div className="card"><p className="caption">Running</p><p className="stat">{clock(sum.runningMs)}</p></div>
        <div className="card"><p className="caption">Stations</p><p className="stat">{clock(sum.stationsMs)}</p></div>
        <div className="card"><p className="caption">{sum.restMs && !sum.roxzoneMs ? 'Rest' : 'Roxzone'}</p><p className="stat">{sum.roxzoneMs ? clock(sum.roxzoneMs) : sum.restMs ? clock(sum.restMs) : '–'}</p></div>
      </section>
      {!sum.roxzoneMs && sum.runs.length > 0 && stations.length > 0 && <p className="caption">Roxzone was not timed, so transitions are part of the runs.</p>}

      {sum.runs.length > 0 && (
        <section className="card stack-sm" aria-labelledby="hx-runs">
          <p className="row-between" style={{ margin: 0 }}><span id="hx-runs" className="title">Run splits</span>{runTarget && <span className="caption">{runTarget.from === 'target' ? 'target' : 'best before'} {clock(runTarget.ms)}</span>}</p>
          <div className="hx-bars" role="img" aria-label={`Run splits: ${sum.runs.map((r) => `run ${r.n} ${clock(r.ms)}${r.slow ? ' (slower)' : ''}`).join(', ')}`}>
            {sum.runs.map((r, i) => (
              <div key={i} className="hx-bar-col">
                <span className={`hx-bar${r.slow ? ' slow' : ''}`} style={{ height: `${Math.round(30 + 70 * (maxRun === minRun ? 1 : (r.ms - minRun * 0.9) / (maxRun - minRun * 0.9)))}%` }} />
                <span className="hx-bar-t">{clock(r.ms)}</span>
              </div>
            ))}
          </div>
          {sum.slowLine ? <p className="hx-slow">{sum.slowLine} That is normal after a heavy station: practising a run straight after it is how it gets better.</p> : sum.runs.length >= 3 ? <p className="caption">Your runs were even: none was more than 15 s slower than the others.</p> : null}
        </section>
      )}

      {stations.length > 0 && (
        <section className="card" aria-label="Stations">
          <ul className="list hx-stations">
            {stations.map((x, i) => {
              const t = x.swapped ? undefined : targetMs(x.key as StationKey, data.profile.hyrox, earlier);
              const tag = t ? deltaTag(x.ms, t.ms) : undefined;
              return (
                <li key={i} className="list-item row-between">
                  <span className="stack-sm" style={{ gap: 0 }}><span>{s.mode === 'practice' ? `${x.n}. ` : `${x.n} `}{segmentName(x)}{x.distanceM ? ` ${x.distanceM} m` : x.reps ? ` ${x.reps}` : ''}</span>{x.swapped && <span className="caption">Swapped: not counted for records</span>}</span>
                  <span className="row" style={{ gap: 8 }}><span className="stat">{clock(x.ms)}</span>{tag ? <span className={`hx-tag ${tag.tone}`} title={t!.from === 'target' ? 'Against your target' : 'Against your best before'}>{tag.text}</span> : null}</span>
                </li>
              );
            })}
          </ul>
          {stations.some((x) => !x.swapped && targetMs(x.key as StationKey, data.profile.hyrox, earlier)) && <p className="caption" style={{ marginTop: 8 }}>The tags compare each station with {data.profile.hyrox?.targets ? 'your target, or your best before this session' : 'your best before this session'}.</p>}
        </section>
      )}

      {set.length > 0 && (
        <section className="card stack-sm" aria-labelledby="hx-set">
          <h2 id="hx-set" className="title">Records</h2>
          <ul className="list">{set.map((t) => <li key={t} className="list-item">{t}</li>)}</ul>
        </section>
      )}
      {(s.rpe || s.notes) && <p className="caption">{s.rpe ? `Effort ${s.rpe}/10` : ''}{s.rpe && s.notes ? ' · ' : ''}{s.notes}</p>}
      <p className="caption">It counts toward your streak and your load. It is not added to your running distance.</p>
      <div className="row wrap" style={{ gap: 8 }}>
        <Link to="/hyrox" className="btn">All HYROX sessions</Link>
        <button type="button" className="btn btn-ghost btn-danger" onClick={() => { if (window.confirm('Delete this HYROX session?')) { removeLog(s.id); nav('/hyrox', { replace: true }); } }}>Delete</button>
      </div>
    </div>
  );
}
