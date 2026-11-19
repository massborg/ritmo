// One logged entry (update 5, U1): another sport, a strength session or a note. Shown in full, with edit and
// delete. A HYROX session has its own summary page and is sent there.
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { DateField } from '../components/inputs';
import { CrossFields } from '../components/LogBits';
import { crossLoad } from '../training/load';
import { exerciseSummary, sessionSummary } from '../training/strength-load';
import { dist, duration, longDate, parseYmd } from '../lib/format';

export default function LogEntryPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, updateLog, removeLog } = useApp();
  const e = (data.profile.log ?? []).find((x) => x.id === id);
  const [date, setDate] = useState(e?.date ?? '');
  const [sport, setSport] = useState(e?.sport ?? 'Bike');
  const [minutes, setMinutes] = useState<number | undefined>(e?.minutes ?? (e?.durationS ? Math.round(e.durationS / 60) : undefined));
  const [rpe, setRpe] = useState(e?.rpe ?? 4);
  const [text, setText] = useState(e?.text ?? '');
  const [saved, setSaved] = useState(false);
  if (!e) return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <AppHeader title="Not found" back />
      <p className="muted">This entry is no longer in your log. It may have been deleted.</p>
    </div>
  );
  if (e.kind === 'hyrox' && e.hyrox) return <Navigate to={`/hyrox/session/${e.hyrox.id}`} replace />;
  const unit = data.profile.strength?.units ?? 'kg';
  const del = () => { if (window.confirm(e.kind === 'note' ? 'Delete this note?' : `Delete this ${e.kind === 'strength' ? 'strength session' : (e.sport ?? 'session').toLowerCase()}? It will no longer count toward your load.`)) { removeLog(e.id); nav(-1); } };
  const editable = e.kind === 'cross' || e.kind === 'note';
  const changed = date !== e.date || text.trim() !== (e.text ?? '') || (e.kind === 'cross' && (sport !== e.sport || minutes !== (e.minutes ?? (e.durationS ? Math.round(e.durationS / 60) : undefined)) || rpe !== (e.rpe ?? 4)));
  const ok = e.kind === 'note' ? text.trim().length > 0 : !!minutes;
  const save = () => {
    // A recorded time is exact; changing the minutes replaces it
    updateLog(e.id, { date, text: text.trim() || undefined, ...(e.kind === 'cross' ? { sport, minutes, rpe, durationS: minutes === Math.round((e.durationS ?? 0) / 60) ? e.durationS : undefined } : {}) });
    setSaved(true);
  };
  const title = e.kind === 'cross' ? e.sport ?? 'Cross-training' : e.kind === 'strength' ? e.strength?.title ?? 'Strength session' : 'Note';
  const sum = e.kind === 'strength' && e.strength?.exercises.length ? sessionSummary(e.strength.exercises) : undefined;
  return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <AppHeader title={title} eyebrow={longDate(parseYmd(e.date))} back />
      {e.kind === 'cross' && (
        <section className="card stack-sm" aria-label="Summary">
          <dl className="stat-row">
            <div><dt className="caption">Time</dt><dd className="stat">{e.durationS ? duration(e.durationS) : `${e.minutes ?? 0} min`}</dd></div>
            {e.distanceM ? <div><dt className="caption">Distance</dt><dd className="stat">{dist(e.distanceM, data.profile.units)}</dd></div> : null}
            {e.avgHr ? <div><dt className="caption">Avg heart rate</dt><dd className="stat">{e.avgHr}</dd></div> : null}
            <div><dt className="caption">Load</dt><dd className="stat">{Math.round(crossLoad({ ...e, sport, minutes, rpe }))}</dd></div>
          </dl>
          <p className="caption">{e.importId ? 'Imported from your watch. ' : e.recorded ? 'Recorded in Ritmo. ' : ''}Counts toward fitness and fatigue, scaled by effort. It is not running distance.</p>
        </section>
      )}
      {e.kind === 'strength' && (
        <section className="card stack-sm" aria-label="Summary">
          <dl className="stat-row">
            <div><dt className="caption">Time</dt><dd className="stat">{e.minutes ?? 0} min</dd></div>
            {sum?.volumeKg ? <div><dt className="caption">Volume</dt><dd className="stat">{Math.round(unit === 'lb' ? sum.volumeKg * 2.2046 : sum.volumeKg).toLocaleString('en-GB')} {unit}</dd></div> : null}
            {e.rpe ? <div><dt className="caption">Effort</dt><dd className="stat">{e.rpe}</dd></div> : null}
          </dl>
          {e.strength?.exercises.length ? (
            <ul className="list">
              {e.strength.exercises.map((x) => <li key={x.id} className="list-item row-between"><span className="label">{x.name}</span><span className="caption" style={{ textAlign: 'right' }}>{exerciseSummary(x.sets, unit).text}</span></li>)}
            </ul>
          ) : <p className="caption">Logged without exercises{e.sport ? ` (${e.sport.toLowerCase()})` : ''}.</p>}
          {e.strength?.notes && <p className="caption">{e.strength.notes}</p>}
        </section>
      )}
      {editable && (
        <section className="card stack" aria-label="Edit">
          <DateField id="le-date" label="Date" value={date} onChange={(d) => { setDate(d); setSaved(false); }} />
          {e.kind === 'cross' && <CrossFields idPrefix="le" sport={sport} setSport={(s) => { setSport(s); setSaved(false); }} minutes={minutes} setMinutes={(m) => { setMinutes(m); setSaved(false); }} rpe={rpe} setRpe={(r) => { setRpe(r); setSaved(false); }} />}
          <div className="field"><label htmlFor="le-text">{e.kind === 'note' ? 'Note' : 'Note (optional)'}</label><textarea id="le-text" className="input" rows={3} value={text} onChange={(ev) => { setText(ev.target.value); setSaved(false); }} /></div>
          <button type="button" className="btn btn-primary btn-block" disabled={!ok || !changed} onClick={save}>{saved && !changed ? 'Saved' : 'Save changes'}</button>
        </section>
      )}
      <button type="button" className="btn btn-ghost btn-danger" onClick={del}>Delete</button>
    </div>
  );
}
