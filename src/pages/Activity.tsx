import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Award, Check, MessageCircle, TrendingUp, X } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { useRunDetail } from '../app/useRunDetail';
import { AppHeader } from '../components/app';
import { Empty, ScoreRing, StatusLine, ZoneBar } from '../components/ui';
import { LineChart, RouteMap } from '../components/charts';
import { dist, duration, longDate, pace, type Units } from '../lib/format';
import { TYPE_FOCUS, TYPE_LABEL } from '../training/analysis';
import { raceEvidence } from '../training/fitness';
import { ROLE_LABEL } from '../training/sessions';
import { DayRuns } from '../components/DayRuns';
import { Breakdown, RepChart, Sparkline } from '../components/ReportParts';
import { buildReport } from '../training/report';
import type { SessionFeedback } from '../lib/types';

const FEELS = ['Very hard', 'Hard', 'Okay', 'Good', 'Great'];
const AREAS = ['Foot', 'Ankle', 'Achilles', 'Left calf', 'Right calf', 'Shin', 'Knee', 'Hamstring', 'Hip', 'Lower back', 'Chest pain, dizziness or feeling faint'];

function FeedbackForm({ activityId, existing, onSave }: { activityId: string; existing?: SessionFeedback; onSave: (f: SessionFeedback) => void }) {
  const [feel, setFeel] = useState<number | undefined>(existing?.feel);
  const [rpe, setRpe] = useState<number>(existing?.rpe ?? 5);
  const [pain, setPain] = useState<SessionFeedback['pain']>(existing?.pain ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [saved, setSaved] = useState(false);
  const toggle = (area: string) => setPain((p) => (p.some((x) => x.area === area) ? p.filter((x) => x.area !== area) : [...p, { area, severity: 1 }]));
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); if (!feel) return; onSave({ activityId, feel: feel as SessionFeedback['feel'], rpe, pain, notes: notes || undefined, loggedAt: new Date().toISOString() }); setSaved(true); }}>
      <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">How did it feel?</legend>
        <div className="row wrap">{FEELS.map((f, i) => <button type="button" key={f} className="chip" aria-pressed={feel === i + 1} onClick={() => setFeel(i + 1)}>{f}</button>)}</div>
      </fieldset>
      <div className="field">
        <label htmlFor="rpe">Effort, 1 to 10: <span className="stat">{rpe}</span></label>
        <input id="rpe" type="range" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} style={{ minHeight: 44, accentColor: 'var(--brand)' }} />
      </div>
      <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Any pain or niggles?</legend>
        <div className="row wrap">{AREAS.map((a) => <button type="button" key={a} className="chip" aria-pressed={pain.some((p) => p.area === a)} onClick={() => toggle(a)}>{a}</button>)}</div>
        {pain.map((p) => (
          <div key={p.area} className="row wrap" style={{ gap: 8 }}>
            <span className="label" style={{ minWidth: 100 }}>{p.area}</span>
            {(['Mild', 'Moderate', 'Severe'] as const).map((lvl, i) => (
              <button type="button" key={lvl} className="chip" aria-pressed={p.severity === i + 1} onClick={() => setPain((all) => all.map((x) => (x.area === p.area ? { ...x, severity: (i + 1) as 1 | 2 | 3 } : x)))}>{lvl}</button>
            ))}
          </div>
        ))}
        {pain.some((p) => /chest|dizz/i.test(p.area)) ? <div role="alert"><StatusLine kind="danger">Please stop exercising and get medical advice before you run again. If it is severe or happening now, call your local emergency number.</StatusLine></div>
          : pain.some((p) => p.severity >= 2) && <StatusLine kind="warning">Ritmo will keep the next days easy. If pain persists or changes how you run, please see a physio or doctor.</StatusLine>}
      </fieldset>
      <div className="field">
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Weather, sleep, how your legs felt" />
      </div>
      <div className="row">
        <button className="btn btn-primary" type="submit" disabled={!feel}>Save how it felt</button>
        {saved && <StatusLine kind="success">Saved. Future feedback will take this into account.</StatusLine>}
      </div>
    </form>
  );
}

function SplitsTable({ splits, units }: { splits: ReturnType<ReturnType<typeof useApp>['analysisFor']>['splits']; units: Units }) {
  const avg = splits.reduce((x, s) => x + s.paceS, 0) / (splits.length || 1);
  return (
    <div className="table-scroll">
      <table className="data">
        <caption className="sr-only">Splits per {units}</caption>
        <thead><tr><th scope="col">{units === 'km' ? 'Km' : 'Mile'}</th><th scope="col">Pace</th><th scope="col">HR</th><th scope="col">Cadence</th><th scope="col">Elev</th></tr></thead>
        <tbody>
          {splits.map((s) => (
            <tr key={s.index}>
              <td>{s.distanceM < (units === 'km' ? 950 : 1550) ? (s.distanceM / (units === 'km' ? 1000 : 1609.344)).toFixed(2) : s.index}</td>
              <td style={{ color: s.paceS < avg - 5 ? 'var(--success)' : s.paceS > avg + 8 ? 'var(--warning)' : undefined }}>{pace(s.paceS, units, false)}</td>
              <td>{s.avgHr ?? '–'}</td><td>{s.avgCad ?? '–'}</td><td>{s.elevDelta != null ? `${s.elevDelta > 0 ? '+' : ''}${s.elevDelta}` : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ActivityPage() {
  const { id } = useParams();
  const { data, analysisFor, logFeedback, setRaceFlag, groupOf, plan, aRace, paces, fitness, typeOf } = useApp();
  const { run: a, loading } = useRunDetail(data.activities.find((x) => x.id === id), data.mode === 'real');
  if (!a) return <Empty title="Run not found" action={<Link to="/progress" className="btn">Back</Link>} />;
  const an = analysisFor(a);
  const rep = buildReport({ a, an, planned: an.planned, all: data.activities, plan, race: aRace, paces, fitnessVdot: fitness?.vdot, units: data.profile.units, typeOf, workPace: an.workPace });
  const group = groupOf(a.id);
  const role = group?.roles[a.id];
  const U = data.profile.units;
  const fb = data.feedback.find((f) => f.activityId === a.id);

  // stream chart data, sampled to ~120 points
  const s = a.streams ?? [];
  const step = Math.max(1, Math.floor(s.length / 120));
  const sampled = s.filter((_, i) => i % step === 0);
  const paceVals = sampled.map((p, i) => {
    const prev = sampled[Math.max(0, i - 3)];
    const dd = p.d - prev.d, dt = p.t - prev.t;
    return dd > 5 ? Math.min(600, dt / (dd / 1000)) * (U === 'km' ? 1 : 1.609344) : null;
  });
  // Distance ticks: one decimal on runs under 5 km/mi, so short runs do not read "0 0 0 1 1"
  const unitM = U === 'km' ? 1000 : 1609.344;
  const decimals = (s[s.length - 1]?.d ?? 0) / unitM < 5 ? 1 : 0;
  const labels = sampled.map((p) => (p.d / unitM).toFixed(decimals));
  const every = Math.max(1, Math.floor(sampled.length / 8));

  const feelSection = (
    <section className="card stack" aria-labelledby="feel">
      <h2 id="feel" className="title">How did it feel?</h2>
      <p className="caption">Ritmo uses this in future feedback and to adjust your plan.</p>
      <FeedbackForm activityId={a.id} existing={fb} onSave={logFeedback} />
    </section>
  );

  return (
    <div className="stack-lg">
      <AppHeader title="Run" back large={false} />
      {loading && <p className="caption" role="status">Loading splits, charts and route…</p>}
      <div className="stack-sm">
        <p className="caption">{longDate(new Date(a.startTime))} · {new Date(a.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · from {a.source === 'sample' ? 'sample data' : a.source === 'upload' ? 'file upload' : a.source}</p>
        <h1 className="display-lg">{a.name}</h1>
        <div className="row wrap"><span className="tag">{TYPE_LABEL[an.type]}</span><span className="tag">Focus: {TYPE_FOCUS[an.type]}</span></div>
        {data.mode === 'real' && (
          <div className="row wrap" style={{ gap: 8 }}>
            {raceEvidence(a, data.races)
              ? <><span className="caption">{a.isRace ? 'You marked this as a race.' : 'Ritmo thinks this was a race.'}</span>
                {!a.isRace && <button className="btn btn-small btn-ghost" onClick={() => setRaceFlag([a.id], true)}>Yes, it was</button>}
                <button className="btn btn-small btn-ghost" onClick={() => setRaceFlag([a.id], false)}>Not a race</button></>
              : <button className="btn btn-small btn-ghost" onClick={() => setRaceFlag([a.id], true)}>This was a race</button>}
          </div>
        )}
      </div>

      {group && group.parts.length > 1 && (
        <section className="card stack-sm" aria-labelledby="session-parts">
          <h2 id="session-parts" className="label">{role === 'main' ? 'Your session that day' : `This is the ${ROLE_LABEL[role!].toLowerCase()} of a session`}: {dist(group.totalM, U)} in total</h2>
          <DayRuns runs={group.parts} />
          {role !== 'main' && <p className="caption">The full feedback is on the main run. Short pieces like this one are not compared with other runs.</p>}
        </section>
      )}

      <section className="card row wrap" style={{ gap: 'var(--s5)', justifyContent: 'space-between' }}>
        <div className="row wrap" style={{ gap: 'var(--s5)' }}>
          <div><p className="caption">Distance</p><p className="stat-xl" style={{ fontSize: 40, lineHeight: '44px' }}>{dist(a.distanceM, U, 2).split(' ')[0]}<span className="label"> {U}</span></p></div>
          <div><p className="caption">Time</p><p className="stat" style={{ fontSize: 24, lineHeight: '30px' }}>{duration(a.movingS)}</p></div>
          <div><p className="caption">Pace</p><p className="stat" style={{ fontSize: 24, lineHeight: '30px' }}>{pace(a.movingS / (a.distanceM / 1000), U)}</p></div>
          {a.avgHr && <div><p className="caption">Avg HR</p><p className="stat" style={{ fontSize: 24, lineHeight: '30px' }}>{a.avgHr}</p></div>}
          {a.avgCadence && <div><p className="caption">Cadence</p><p className="stat" style={{ fontSize: 24, lineHeight: '30px' }}>{a.avgCadence}</p></div>}
          {a.elevGainM != null && <div><p className="caption">Climb</p><p className="stat" style={{ fontSize: 24, lineHeight: '30px' }}>{a.elevGainM} m</p></div>}
        </div>
      </section>

      {/* Asked near the top until answered, so it actually gets filled in */}
      {!fb && feelSection}

      {an.limitedData && <div className="banner" role="note"><StatusLine kind="info">Limited data</StatusLine><p>{an.limitedData}</p></div>}

      <section className="card stack" aria-labelledby="verdict">
        <div className="row" style={{ gap: 'var(--s4)', alignItems: 'flex-start' }}>
          <ScoreRing score={an.score} />
          <div className="stack-sm">
            <h2 id="verdict" className="title">{rep.verdict}</h2>
            <p className="caption">Session score {an.score}. {an.scoreReason}</p>
          </div>
        </div>
        {rep.badges.length > 0 && <div className="badge-row">{rep.badges.map((b) => <span key={b} className="badge"><Award size={14} strokeWidth={2} color="var(--accent-mark)" aria-hidden="true" />{b}</span>)}</div>}
        <Breakdown items={rep.breakdown} />
        {rep.reps.length >= 2 && <RepChart reps={rep.reps} target={rep.target} units={U} />}
      </section>

      <div className="grid-2">
        <section className="card stack"><h2 className="title">What went well</h2><ul className="bullets">{an.wentWell.slice(0, 3).map((x) => <li key={x}>{x}</li>)}</ul></section>
        <section className="card stack"><h2 className="title">What to improve</h2><ul className="bullets">{an.improve.slice(0, 3).map((x) => <li key={x}>{x}</li>)}</ul></section>
      </div>

      {(rep.goalNote || rep.nextTip || rep.trend) && (
        <section className="card stack-sm">
          {rep.goalNote && <><h2 className="label">What this means for your goal</h2><p>{rep.goalNote}</p></>}
          {rep.nextTip && <><h2 className="label">Next session</h2><p>{rep.nextTip}</p></>}
          {rep.trend && <><h2 className="label">Compared with your recent {TYPE_LABEL[an.type].toLowerCase()}s</h2><Sparkline values={rep.trend.paces} labels={rep.trend.labels} units={U} /><p className="caption">Average pace, the dot is this run. Lower is faster.</p></>}
        </section>
      )}
      <Link to={`/coach?q=${encodeURIComponent(`How did my run on ${longDate(new Date(a.startTime))} go?`)}`} className="btn" style={{ alignSelf: 'flex-start' }}><MessageCircle size={18} strokeWidth={2} aria-hidden="true" />Ask the coach about this run</Link>

      <details className="full-analysis">
        <summary className="btn btn-ghost">Show full analysis</summary>
        <div className="stack-lg" style={{ marginTop: 'var(--s4)' }}>
      <section className="card stack" aria-labelledby="score">
        <div className="row" style={{ gap: 'var(--s4)' }}>
          <ScoreRing score={an.score} />
          <div className="stack-sm">
            <h2 id="score" className="title">Session score</h2>
            <p>{an.scoreReason}</p>
            <p className="caption">Identified as {TYPE_LABEL[an.type].toLowerCase()}: {an.classificationReason.toLowerCase()}.</p>
          </div>
        </div>
        {an.plannedVsActual.length > 0 && (
          <div className="table-scroll">
            <table className="data">
              <caption className="sr-only">Planned compared with actual</caption>
              <thead><tr><th scope="col">Planned vs actual</th><th scope="col">Planned</th><th scope="col">Actual</th><th scope="col"><span className="sr-only">Result</span></th></tr></thead>
              <tbody>
                {an.plannedVsActual.map((r) => (
                  <tr key={r.label}><td style={{ fontFamily: 'var(--font-body)' }}>{r.label}</td><td>{r.planned}</td><td>{r.actual}</td>
                    <td>{r.ok ? <span className="status status-success"><Check size={16} strokeWidth={2} aria-hidden="true" /><span className="sr-only">On target</span></span> : <span className="status status-warning"><X size={16} strokeWidth={2} aria-hidden="true" /><span className="sr-only">Off target</span></span>}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="band stack">
        <h2 className="title">How this changes the coming days</h2>
        <p>{an.nextDays}</p>
      </section>

      {(an.patternNotes.length > 0 || an.similarNote) && (
        <section className="card stack">
          <h2 className="title">Patterns</h2>
          {an.patternNotes.length > 0 && <ul className="bullets">{an.patternNotes.map((x) => <li key={x}>{x}</li>)}</ul>}
          <div className="row wrap" style={{ gap: 'var(--s5)' }}>
            {an.patterns.hrDriftPct != null && <div><p className="caption">Heart rate drift</p><p className="stat">{an.patterns.hrDriftPct}%</p></div>}
            {an.patterns.fadePct != null && <div><p className="caption">Last 20% vs rest</p><p className="stat">{an.patterns.fadePct > 0 ? '+' : ''}{an.patterns.fadePct}%</p></div>}
            {an.patterns.easyTooHardPct != null && <div><p className="caption">Time in Z3+</p><p className="stat">{an.patterns.easyTooHardPct}%</p></div>}
          </div>
          {an.similarNote && (
            <div className="stack-sm">
              <p className="row label" style={{ gap: 8 }}><TrendingUp size={18} strokeWidth={2} aria-hidden="true" />Compared with similar sessions</p>
              <p>{an.similarNote}</p>
              <ul className="list">
                {an.similar.map((x) => (
                  <li key={x.activity.id}><Link to={`/activity/${x.activity.id}`} className="list-item row-between"><span>{longDate(new Date(x.activity.startTime))}</span><span className="stat">{dist(x.activity.distanceM, U)} · {pace(x.paceS, U)}{x.avgHr ? ` · ${x.avgHr} bpm` : ''}</span></Link></li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {sampled.length > 10 && (
        <div className="grid-2">
          <section className="card stack"><h2 className="title">Pacing</h2><LineChart series={[{ name: 'Pace', values: paceVals, color: 'var(--brand)' }]} labels={labels} every={every} invert format={(v) => pace(v / (U === 'km' ? 1 : 1.609344), U, false)} /><p className="caption">Distance in {U}. Higher is faster.</p></section>
          {s.some((p) => p.hr) && <section className="card stack"><h2 className="title">Heart rate</h2><LineChart series={[{ name: 'Heart rate', values: sampled.map((p) => p.hr ?? null), color: 'var(--zone-4)' }]} labels={labels} every={every} /><p className="caption">Beats per minute over distance in {U}.</p></section>}
          {s.some((p) => p.alt != null) && <section className="card stack"><h2 className="title">Elevation</h2><LineChart series={[{ name: 'Elevation', values: sampled.map((p) => p.alt ?? null), color: 'var(--ink-muted)' }]} labels={labels} every={every} format={(v) => `${v.toFixed(0)}`} /><p className="caption">Metres over distance in {U}.</p></section>}
          {s.some((p) => p.cad) && <section className="card stack"><h2 className="title">Cadence</h2><LineChart series={[{ name: 'Cadence', values: sampled.map((p) => p.cad ?? null), color: 'var(--info)' }]} labels={labels} every={every} /><p className="caption">Steps per minute over distance in {U}.</p></section>}
        </div>
      )}

      <div className="grid-2">
        {an.zoneSeconds && <section className="card stack"><h2 className="title">Heart rate zones</h2><ZoneBar seconds={an.zoneSeconds} /></section>}
        {an.splits.length > 0 && <section className="card stack"><h2 className="title">Splits</h2><SplitsTable splits={an.splits} units={U} /></section>}
      </div>
      {a.laps && a.laps.length > 1 && (
        <section className="card stack">
          <h2 className="title">Laps</h2>
          <div className="table-scroll"><table className="data"><thead><tr><th scope="col">Lap</th><th scope="col">Distance</th><th scope="col">Time</th><th scope="col">Pace</th><th scope="col">HR</th></tr></thead>
            <tbody>{a.laps.map((l) => <tr key={l.index}><td>{l.index}</td><td>{(l.distanceM / 1000).toFixed(2)}</td><td>{duration(l.durationS)}</td><td>{pace(l.durationS / (l.distanceM / 1000), U, false)}</td><td>{l.avgHr ?? '–'}</td></tr>)}</tbody></table></div>
        </section>
      )}
      {a.streams?.some((p) => p.lat != null && p.lon != null) && <section className="card stack"><h2 className="title">Route</h2><RouteMap points={a.streams} /></section>}

        </div>
      </details>

      {fb && feelSection}
    </div>
  );
}
