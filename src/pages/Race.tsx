import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Empty, ScoreRing, StatusLine } from '../components/ui';
import { daysBetween, distanceLabel, duration, longDate, pace, parseYmd, RACE_DISTANCES, uid, ymd } from '../lib/format';
import { pacingPlan, raceReadiness, taperGuidance } from '../training/insights';
import { estimateFitness, predictTime, vdotFromPerformance } from '../training/fitness';
import type { CourseType, Race, RacePriority } from '../lib/types';

function parseTime(s: string): number | undefined {
  const parts = s.trim().split(':').map(Number);
  if (!parts.length || parts.some(isNaN)) return undefined;
  return parts.reduce((acc, p) => acc * 60 + p, 0) * (parts.length === 2 ? 1 : 1);
}

function RaceForm({ race, onSave }: { race?: Race; onSave: (r: Race) => void }) {
  const [name, setName] = useState(race?.name ?? '');
  const [date, setDate] = useState(race?.date ?? '');
  const [dm, setDm] = useState(String(race?.distanceM ?? 10000));
  const [custom, setCustom] = useState('');
  const [course, setCourse] = useState<CourseType>(race?.courseType ?? 'road');
  const [goal, setGoal] = useState(race?.goalS ? duration(race.goalS) : '');
  const [prio, setPrio] = useState<RacePriority>(race?.priority ?? 'A');
  const [err, setErr] = useState('');
  return (
    <form className="card stack" onSubmit={(e) => {
      e.preventDefault();
      const distanceM = dm === 'custom' ? Number(custom) * 1000 : Number(dm);
      if (!name.trim() || !date || !distanceM) { setErr('Add a name, date and distance.'); return; }
      const goalS = goal ? parseTime(goal) : undefined;
      if (goal && !goalS) { setErr('Write the goal time as h:mm:ss or mm:ss.'); return; }
      onSave({ id: race?.id ?? uid(), name: name.trim(), date, distanceM, courseType: course, goalS, priority: prio, resultActivityId: race?.resultActivityId });
    }}>
      <div className="field"><label htmlFor="rn">Race name</label><input id="rn" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" /></div>
      <div className="field"><label htmlFor="rd">Date</label><input id="rd" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="field"><label htmlFor="rdist">Distance</label>
        <select id="rdist" className="input" value={dm} onChange={(e) => setDm(e.target.value)}>
          {RACE_DISTANCES.map((d) => <option key={d.m} value={d.m}>{d.label}</option>)}
          <option value="custom">Other distance</option>
        </select>
        {dm === 'custom' && <input aria-label="Distance in km" className="input" inputMode="decimal" placeholder="Distance in km" value={custom} onChange={(e) => setCustom(e.target.value)} />}
      </div>
      <div className="field"><label htmlFor="rc">Course type</label>
        <select id="rc" className="input" value={course} onChange={(e) => setCourse(e.target.value as CourseType)}>
          <option value="road">Road</option><option value="trail">Trail</option><option value="track">Track</option><option value="cross-country">Cross-country</option>
        </select></div>
      <div className="field"><label htmlFor="rg">Goal time (optional)</label><input id="rg" className="input" placeholder="3:14:30" value={goal} onChange={(e) => setGoal(e.target.value)} inputMode="numeric" /></div>
      <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Priority</legend>
        <div className="row wrap">{(['A', 'B', 'C'] as RacePriority[]).map((p) => <button type="button" key={p} className="chip" aria-pressed={prio === p} onClick={() => setPrio(p)}>{p}{p === 'A' ? ': main goal' : p === 'B' ? ': important' : ': training race'}</button>)}</div>
      </fieldset>
      {err && <StatusLine kind="danger">{err}</StatusLine>}
      <button className="btn btn-primary" type="submit">{race ? 'Save race' : 'Add race'}</button>
    </form>
  );
}

export default function RacePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, saveRace, deleteRace, fitness, hr, today, buildMyPlan, plan } = useApp();
  const [editing, setEditing] = useState(id === 'new');
  const race = data.races.find((r) => r.id === id);
  const U = data.profile.units;

  if (id === 'new' || editing) {
    return (
      <div className="stack-lg">
        <button className="btn btn-ghost btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => (race ? setEditing(false) : nav(-1))}><ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />Back</button>
        <h1 className="display-lg">{race ? 'Edit race' : 'Add a race'}</h1>
        <RaceForm race={race} onSave={(r) => { saveRace(r); setEditing(false); nav(`/race/${r.id}`, { replace: true }); }} />
      </div>
    );
  }
  if (!race) return <Empty title="Race not found" action={<Link to="/calendar" className="btn">Back to calendar</Link>} />;

  const past = race.date < ymd(today);
  const days = daysBetween(today, parseYmd(race.date));
  const rr = fitness ? raceReadiness(race, data.activities, fitness.vdot, today) : undefined;
  const target = race.goalS && rr && race.goalS >= rr.predictedS * 0.98 ? race.goalS : rr?.predictedS;
  const pp = target ? pacingPlan(race, target) : [];

  // Post-race review: find the race activity on that day
  const result = past ? data.activities.filter((a) => a.startTime.slice(0, 10) === race.date).sort((a, b) => Math.abs(a.distanceM - race.distanceM) - Math.abs(b.distanceM - race.distanceM))[0] : undefined;
  const before = past ? estimateFitness(data.activities.filter((a) => a.startTime.slice(0, 10) < race.date), hr, addDay(parseYmd(race.date), -1)) : undefined;
  const after = past ? estimateFitness(data.activities, hr, addDay(parseYmd(race.date), 1)) : undefined;
  const predictedBefore = before ? predictTime(before.vdot, race.distanceM) : undefined;

  return (
    <div className="stack-lg">
      <button className="btn btn-ghost btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => nav(-1)}><ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />Back</button>
      <div className="stack-sm">
        <p className="caption">{longDate(parseYmd(race.date))} · {distanceLabel(race.distanceM)} · {race.courseType}</p>
        <h1 className="display-lg">{race.name}</h1>
        <div className="row wrap"><span className={`tag ${race.priority === 'A' ? 'tag-accent' : ''}`}>{race.priority} race</span>{!past && <span className="label">{days} days to go</span>}</div>
      </div>

      {!past && rr && (
        <>
          <section className="hero stack">
            <p className="label">Predicted finish</p>
            <p className="stat-xl">{duration(rr.predictedS)}</p>
            <p className="body">{race.goalS ? `Goal ${duration(race.goalS)}. ` : ''}Based on {fitness?.basedOn}{race.courseType !== 'road' ? `, adjusted for a ${race.courseType} course` : ''}.</p>
          </section>
          <div className="grid-2">
            <section className="card stack">
              <div className="row" style={{ gap: 'var(--s4)' }}><ScoreRing score={rr.score} /><div className="stack-sm"><h2 className="title">Race readiness</h2><p>{rr.summary}</p></div></div>
              <ul className="list">{rr.parts.map((p) => <li key={p.label} className="row-between" style={{ padding: '10px 0' }}><span className="caption" style={{ color: 'var(--ink)' }}>{p.label}</span><StatusLine kind={p.ok ? 'success' : 'warning'}>{p.value}</StatusLine></li>)}</ul>
            </section>
            <section className="card stack"><h2 className="title">Taper guidance</h2><p>{taperGuidance(race, today)}</p>
              {plan?.raceId !== race.id && race.priority === 'A' && <button className="btn btn-primary" onClick={buildMyPlan}>Build my plan for this race</button>}
            </section>
          </div>
          {pp.length > 0 && (
            <section className="card stack">
              <h2 className="title">Pacing plan for {duration(target!)}</h2>
              <p className="caption">Start slightly conservative, settle into goal pace, and save a little for the final stretch.</p>
              <div className="table-scroll"><table className="data"><thead><tr><th scope="col">Split</th><th scope="col">Pace</th><th scope="col">Clock</th></tr></thead>
                <tbody>{pp.map((r) => <tr key={r.label}><td style={{ fontFamily: 'var(--font-body)' }}>{r.label}</td><td>{pace(r.splitPace, U)}</td><td>{duration(r.cumulativeS)}</td></tr>)}</tbody></table></div>
            </section>
          )}
        </>
      )}

      {past && (
        <section className="card stack">
          <h2 className="title">Post-race review</h2>
          {result ? (
            <>
              <div className="row wrap" style={{ gap: 'var(--s5)' }}>
                <div><p className="caption">Result</p><p className="stat-xl" style={{ fontSize: 40, lineHeight: '44px' }}>{duration(result.movingS * (race.distanceM / result.distanceM))}</p></div>
                {predictedBefore && <div><p className="caption">Predicted beforehand</p><p className="stat">{duration(predictedBefore)}</p></div>}
                {race.goalS && <div><p className="caption">Goal</p><p className="stat">{duration(race.goalS)}</p></div>}
              </div>
              {before && after && <p>{after.vdot > before.vdot + 0.2 ? `This result raised your fitness estimate from ${before.vdot.toFixed(1)} to ${after.vdot.toFixed(1)}, so your training paces have been updated.` : `Your fitness estimate is ${after.vdot.toFixed(1)}. This result confirmed it, so your paces stay the same.`} Race equivalent fitness: {vdotFromPerformance(result.distanceM, result.movingS).toFixed(1)}.</p>}
              <Link to={`/activity/${result.id}`} className="btn" style={{ alignSelf: 'flex-start' }}>See the full analysis</Link>
            </>
          ) : <p className="muted">No run found on race day yet. Upload it and Ritmo will review the race and update your fitness.</p>}
        </section>
      )}

      <div className="row wrap">
        <button className="btn" onClick={() => setEditing(true)}>Edit race</button>
        <button className="btn btn-danger" onClick={() => { if (confirm(`Delete ${race.name}?`)) { deleteRace(race.id); nav('/calendar'); } }}><Trash2 size={18} strokeWidth={2} aria-hidden="true" />Delete race</button>
      </div>
    </div>
  );
}

function addDay(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
