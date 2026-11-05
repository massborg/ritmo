import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { Empty, ScoreRing, StatusLine } from '../components/ui';
import { daysBetween, distanceLabel, duration, longDate, pace, parseYmd, RACE_DISTANCES, uid, ymd } from '../lib/format';
import { pacingPlan, raceReadiness, taperGuidance } from '../training/insights';
import { estimateFitness, predictTime, vdotFromPerformance } from '../training/fitness';
import type { CourseType, Race, RacePriority } from '../lib/types';
import { Chips, DateField, DurationField, Stepper } from '../components/inputs';

const DIST_OPTS = [...RACE_DISTANCES.map((d) => ({ value: String(d.m), label: d.label })), { value: 'custom', label: 'Other' }];

function RaceForm({ race, onSave }: { race?: Race; onSave: (r: Race) => void }) {
  const known = race ? RACE_DISTANCES.some((d) => Math.abs(d.m - race.distanceM) < 1) : true;
  const [name, setName] = useState(race?.name ?? '');
  const [date, setDate] = useState(race?.date ?? '');
  const [dm, setDm] = useState(race ? (known ? String(race.distanceM) : 'custom') : '10000');
  const [customKm, setCustomKm] = useState<number | undefined>(race && !known ? Math.round(race.distanceM / 1000) : 15);
  const [course, setCourse] = useState<CourseType>(race?.courseType ?? 'road');
  const [goalS, setGoalS] = useState<number | undefined>(race?.goalS);
  const [prio, setPrio] = useState<RacePriority>(race?.priority ?? 'A');
  const [err, setErr] = useState('');
  return (
    <form className="stack-lg" onSubmit={(e) => {
      e.preventDefault();
      const distanceM = dm === 'custom' ? (customKm ?? 0) * 1000 : Number(dm);
      if (!name.trim()) { setErr('Give the race a name.'); return; }
      if (!date) { setErr('Choose the race date.'); return; }
      if (!distanceM) { setErr('Choose a distance.'); return; }
      onSave({ id: race?.id ?? uid(), name: name.trim(), date, distanceM, courseType: course, goalS, priority: prio, resultActivityId: race?.resultActivityId });
    }}>
      <section className="card stack">
        <div className="field"><label htmlFor="rn">Race name</label><input id="rn" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" placeholder="For example, City Half Marathon" /></div>
        <DateField id="rd" label="Race date" value={date} onChange={setDate} min={ymd(new Date())} />
      </section>
      <section className="card stack">
        <Chips label="Distance" value={dm} onChange={setDm} options={DIST_OPTS} />
        {dm === 'custom' && <Stepper id="rkm" label="Distance" unit="km" value={customKm} onChange={setCustomKm} min={1} max={250} />}
        <Chips<CourseType> label="Course" value={course} onChange={setCourse} options={[{ value: 'road', label: 'Road' }, { value: 'trail', label: 'Trail' }, { value: 'track', label: 'Track' }, { value: 'cross-country', label: 'Cross-country' }]} />
      </section>
      <section className="card stack">
        <DurationField id="rg" label="Goal time (optional)" value={goalS} onChange={setGoalS} />
        <Chips<RacePriority> label="Priority" value={prio} onChange={setPrio} options={[{ value: 'A', label: 'A', sub: 'main goal' }, { value: 'B', label: 'B', sub: 'important' }, { value: 'C', label: 'C', sub: 'training race' }]} />
      </section>
      {err && <StatusLine kind="danger">{err}</StatusLine>}
      <button className="btn btn-primary btn-block" type="submit">{race ? 'Save race' : 'Add race'}</button>
    </form>
  );
}

export default function RacePage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, saveRace, deleteRace, fitness, hr, today, buildMyPlan, plan, stage } = useApp();
  const [editing, setEditing] = useState(id === 'new');
  const [planMsg, setPlanMsg] = useState<string>();
  const race = data.races.find((r) => r.id === id);
  const U = data.profile.units;

  if (id === 'new' || editing) {
    return (
      <div className="stack-lg">
        <AppHeader title={race ? 'Edit race' : 'Add a race'} back />
        <RaceForm race={race} onSave={(r) => { saveRace(r); setEditing(false); nav(`/race/${r.id}`, { replace: true }); }} />
      </div>
    );
  }
  if (!race) return <Empty title="Race not found" action={<Link to="/calendar" className="btn">Back to calendar</Link>} />;

  const past = race.date < ymd(today);
  const days = daysBetween(today, parseYmd(race.date));
  const rr = fitness && stage.predictions ? raceReadiness(race, data.activities, fitness.vdot, today) : undefined;
  const target = race.goalS && rr && race.goalS >= rr.predictedS * 0.98 ? race.goalS : rr?.predictedS;
  const pp = target ? pacingPlan(race, target) : [];

  // Post-race review: find the race activity on that day
  const result = past ? data.activities.filter((a) => a.startTime.slice(0, 10) === race.date).sort((a, b) => Math.abs(a.distanceM - race.distanceM) - Math.abs(b.distanceM - race.distanceM))[0] : undefined;
  const before = past ? estimateFitness(data.activities.filter((a) => a.startTime.slice(0, 10) < race.date), hr, addDay(parseYmd(race.date), -1)) : undefined;
  const after = past ? estimateFitness(data.activities, hr, addDay(parseYmd(race.date), 1)) : undefined;
  const predictedBefore = before ? predictTime(before.vdot, race.distanceM) : undefined;

  return (
    <div className="stack-lg">
      <AppHeader title="Race" back large={false} />
      <div className="stack-sm">
        <p className="caption">{longDate(parseYmd(race.date))} · {distanceLabel(race.distanceM)} · {race.courseType}</p>
        <h1 className="display-lg">{race.name}</h1>
        <div className="row wrap"><span className={`tag ${race.priority === 'A' ? 'tag-accent' : ''}`}>{race.priority} race</span>{!past && <span className="label">{days} days to go</span>}</div>
      </div>

      {!past && !rr && (
        <section className="card stack">
          <StatusLine kind="info">Predictions are not available yet</StatusLine>
          <p className="muted">To predict your finish time and race readiness, Ritmo needs a timed effort such as a 5K time trial or a race. {stage.next}</p>
          <p><strong>Taper guidance.</strong> {taperGuidance(race, today)}</p>
          <div className="row wrap"><Link to="/" className="btn btn-primary">Log a run</Link><Link to="/profile/data" className="btn">Upload files</Link></div>
        </section>
      )}
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
              {plan?.raceId !== race.id && race.priority === 'A' && <button className="btn btn-primary" onClick={() => setPlanMsg(buildMyPlan())}>Build my plan for this race</button>}
              {planMsg && <div role="alert"><StatusLine kind="warning">{planMsg}</StatusLine></div>}
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
