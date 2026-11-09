import { lazy, Suspense, useState } from 'react';
import { forStats, implausible } from '../data/quality';
import { garminAttribution } from '../data/garmin';
import { isStravaRun, stravaUrl } from '../data/strava';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeftRight, Award, Check, CheckCircle2, HeartPulse, MessageCircle, Share2, TrendingUp, Users, X } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { useRunDetail } from '../app/useRunDetail';
import { AppHeader } from '../components/app';
import { Empty, ScoreRing, StatusLine, ZoneBar } from '../components/ui';
import { LineChart, RouteMap } from '../components/charts';
import { dist, duration, longDate, pace, type Units, ymd } from '../lib/format';
import { EASY_FAMILY, TYPE_FOCUS, TYPE_LABEL } from '../training/analysis';
import { buildVerdict } from '../training/verdict';
import { ReadinessStrip } from '../components/training';
import { swapLine } from '../training/plan';
import { raceEvidence, zoneOf } from '../training/fitness';
import { ROLE_LABEL } from '../training/sessions';
import { DayRuns } from '../components/DayRuns';
import { Breakdown, RepChart, Sparkline } from '../components/ReportParts';
import { buildReport } from '../training/report';
import { weatherLine } from '../training/weather';
import { PostToHub } from '../components/PostToHub';
import { shareableRoute } from '../data/hub';
const ShareSheet = lazy(() => import('../components/ShareSheet').then((m) => ({ default: m.ShareSheet })));
import type { Activity, SessionFeedback } from '../lib/types';
import { isDuplicatePair } from '../data/quality';
import { shoeForRun } from '../training/shoes';

const ZONE_WORD = ['recovery', 'easy', 'tempo', 'threshold', 'VO2 max'];
const zoneOfRun = (bpm: number, z?: { zone: number; min: number; max: number }[]) => (z ? zoneOf(bpm, z) : 1);
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
  const { data, analysisFor, logFeedback, setRaceFlag, groupOf, plan, aRace, paces, fitness, typeOf, hasFlag, labelOf, zones, hr, hrIssue, readinessToday, today } = useApp();
  const [posting, setPosting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { run: a, loading } = useRunDetail(data.activities.find((x) => x.id === id), data.mode === 'real');
  if (!a) return <Empty title="Run not found" action={<Link to="/you" className="btn">Back</Link>} />;
  const an = analysisFor(a);
  const rep = buildReport({ a, an, planned: an.planned, all: forStats(data.activities), plan, race: aRace, paces, fitnessVdot: fitness?.vdot, units: data.profile.units, typeOf, workPace: an.workPace });
  const verdict = buildVerdict({ a, an, rep, paces, zones: a.avgHr ? zones : undefined, units: data.profile.units, hrSuspect: !!hrIssue });
  const easyLike = EASY_FAMILY.includes(an.type);
  // What happens to the plan: the plan-change entry for a swapped session, otherwise the tip for the next one
  const swapped = an.swappedFrom && plan?.sessions.find((x) => x.id === an.swappedFrom!.id);
  const planLine = (swapped && plan ? swapLine({ ...swapped, swappedTo: swapped.swappedTo ?? an.type }, a, plan.sessions) : undefined) || rep.nextTip;
  // The max heart rate check (section 8.2): only on runs with heart rate, when the settings look too low
  const showHrCheck = !!hrIssue && !!a.avgHr && data.mode === 'real';
  const canShare = !isStravaRun(a) && hasFlag('share_cards');
  const source = isStravaRun(a) ? 'Strava' : garminAttribution(a) ?? (a.source === 'sample' ? 'Sample data' : a.source === 'upload' ? 'File upload' : a.source === 'manual' ? 'Logged by hand' : a.source === 'ritmo_gps' ? 'Recorded in Ritmo' : a.source === 'apple_health' ? 'Apple Health' : a.source === 'health_connect' ? 'Health Connect' : a.source === 'coros' ? 'COROS' : a.source);
  const when = new Date(a.startTime);
  const dateline = `${when.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · ${source}`;
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
      <AppHeader title={a.name} back eyebrow={dateline}
        right={canShare ? <button className="icon-btn" aria-label="Share this run" onClick={() => setSharing(true)}><Share2 size={22} strokeWidth={2} /></button> : undefined} />
      {loading && <p className="caption" role="status">Loading splits, charts and route…</p>}
      <div className="stack-sm" style={{ marginTop: 'calc(-1 * var(--s3))' }}>
        <div className="row wrap"><span className="tag">{labelOf(a)}</span><span className="tag">Focus: {TYPE_FOCUS[an.type]}</span>{stravaUrl(a) && <a className="strava-link caption" href={stravaUrl(a)} target="_blank" rel="noopener noreferrer">View on Strava</a>}</div>
        {data.mode === 'real' && (
          <div className="row wrap" style={{ gap: 8 }}>
            {raceEvidence(a, data.races)
              ? <><span className="caption">{a.isRace ? 'You marked this as a race.' : 'Ritmo thinks this was a race.'}</span>
                {!a.isRace && <button className="btn btn-small btn-ghost" onClick={() => setRaceFlag([a.id], true)}>Yes, it was</button>}
                <button className="btn btn-small btn-ghost" onClick={() => setRaceFlag([a.id], false)}>Not a race</button></>
              : <button className="btn btn-small" onClick={() => setRaceFlag([a.id], true)}>This was a race</button>}
          </div>
        )}
      </div>

      {an.swappedFrom && (
        <div className="banner banner-info swap-banner" role="note">
          <ArrowLeftRight size={20} strokeWidth={2} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
          <div className="stack-sm" style={{ gap: 2 }}>
            <p className="label">Swapped session</p>
            <p>Planned {an.swappedFrom.title.toLowerCase()}, you ran it easy. Ritmo judges it as an easy run.</p>
          </div>
        </div>
      )}

      {implausible(a) && !a.hidden && (
        <div className="banner banner-stack" role="alert">
          <StatusLine kind="warning">This run can't be right</StatusLine>
          <p>{dist(a.distanceM, U, 2)} in {duration(a.movingS)} is {implausible(a)}. It is left out of your fitness, load, personal bests and predictions until you fix it under Fix this run below.</p>
        </div>
      )}
      {group && group.parts.length > 1 && (
        <section className="card stack-sm" aria-labelledby="session-parts">
          <h2 id="session-parts" className="label">{role === 'main' ? 'Your session that day' : `This is the ${ROLE_LABEL[role!].toLowerCase()} of a session`}: {dist(group.totalM, U)} in total</h2>
          <DayRuns runs={group.parts} currentId={a.id} />
          {role !== 'main' && <p className="caption">The full feedback is on the main run. Short pieces like this one are not compared with other runs.</p>}
        </section>
      )}

      <section className="card stack" aria-label="Run summary">
        <div className="stat-2x2">
          <div><p className="caption">Distance</p><p className="stat">{dist(a.distanceM, U, 2).split(' ')[0]}<small> {U}</small></p></div>
          <div><p className="caption">Pace</p><p className="stat">{pace(a.movingS / (a.distanceM / 1000), U).replace(/\/(km|mi)$/, '')}<small>/{U}</small></p></div>
          <div><p className="caption">Time</p><p className="stat">{duration(a.movingS)}</p></div>
          {a.avgHr ? <div><p className="caption">Avg heart rate</p><p className="stat">{a.avgHr}<small> bpm</small></p></div>
            : a.elevGainM != null ? <div><p className="caption">Climb</p><p className="stat">{a.elevGainM}<small> m</small></p></div>
            : a.avgCadence ? <div><p className="caption">Cadence</p><p className="stat">{a.avgCadence}<small> spm</small></p></div> : null}
        </div>
        {(() => {
          const extra = [a.avgHr && a.avgCadence ? `Cadence ${a.avgCadence} spm` : '', a.avgHr && a.elevGainM != null ? `Climb ${a.elevGainM} m` : !a.avgHr && a.elevGainM != null && a.avgCadence ? `Cadence ${a.avgCadence} spm` : ''].filter(Boolean);
          return extra.length ? <p className="caption mono-caption">{extra.join(' · ')}</p> : null;
        })()}
        {a.weather && (
          <div className="run-weather">
            <p className="caption"><strong>Weather</strong></p>
            <p className="caption">{weatherLine(a.weather, U)}</p>
            <p className="caption" style={{ opacity: 0.75 }}>Weather data: <a href="https://www.met.no/en" target="_blank" rel="noopener noreferrer">MET Norway</a></p>
          </div>
        )}
      </section>

      {an.limitedData && <div className="banner banner-stack" role="note"><StatusLine kind="info">Limited data</StatusLine><p>{an.limitedData}</p></div>}

      <section className="card stack verdict-card" aria-labelledby="verdict" data-score={an.score}>
        <div className="stack-sm">
          <div className="row wrap" style={{ gap: 8 }}>
            <h2 id="verdict" className="title">{verdict.title}</h2>
            {verdict.zone && <span className="zone-chip"><span className={`zone-dot z${verdict.zone}`} aria-hidden="true" />Z{verdict.zone} average</span>}
          </div>
          <p className="muted">{verdict.meaning}</p>
          {!easyLike && <p className="caption">{rep.verdict}</p>}
          {rep.weatherNote && <p className="weather-note">{rep.weatherNote}</p>}
        </div>
        {verdict.checks.length > 0 && (
          <ul className="check-list" aria-label="How the run went">
            {verdict.checks.map((c) => (
              <li key={c.label} className={c.ok ? 'ok' : 'warn'}>
                {c.ok ? <CheckCircle2 size={20} strokeWidth={2} aria-hidden="true" /> : <AlertTriangle size={20} strokeWidth={2} aria-hidden="true" />}
                <span><span className="check-label">{c.label}<span className="sr-only">{c.ok ? ' (good)' : ' (to change)'}</span></span>{c.detail && <span className="caption check-detail">{c.detail}</span>}</span>
              </li>
            ))}
          </ul>
        )}
        {rep.badges.length > 0 && <div className="badge-row">{rep.badges.map((b) => <span key={b} className="badge"><Award size={14} strokeWidth={2} color="var(--accent-mark)" aria-hidden="true" />{b}</span>)}</div>}
        {rep.reps.length >= 2 && <RepChart reps={rep.reps} target={rep.target} units={U} />}
      </section>

      {((aRace && (easyLike || rep.goalNote)) || planLine) && (
        <section className="card stack-sm" aria-label="Race and plan">
          {aRace && easyLike && (
            <div className="race-line">
              <p className="label">{aRace.name} prediction</p>
              <p><strong>Not changed.</strong> Easy runs don't move your race estimate.</p>
            </div>
          )}
          {aRace && !easyLike && rep.goalNote && <><h2 className="label">What this means for your goal</h2><p>{rep.goalNote}</p></>}
          {planLine && <><h2 className="label">{an.swappedFrom ? 'Your plan' : 'Next session'}</h2><p>{planLine}</p></>}
        </section>
      )}

      {/* Today's run: the same readiness as Training and Coach, including this run */}
      {plan && a.startTime.slice(0, 10) === ymd(today) && <div className="stack-sm"><h2 className="label">Readiness now</h2><ReadinessStrip r={readinessToday} /></div>}

      {showHrCheck && (
        <section className="card stack-sm settings-check" aria-labelledby="hr-check">
          <div className="row" style={{ gap: 8 }}><HeartPulse size={20} strokeWidth={2} aria-hidden="true" /><h2 id="hr-check" className="title">Check your max heart rate</h2></div>
          <p>It's set to {hr.max}, so {a.avgHr} bpm counts as Z{zoneOfRun(a.avgHr!, zones)} ({ZONE_WORD[zoneOfRun(a.avgHr!, zones) - 1]}). {hrIssue!.reason}{hrIssue!.suggestedMax ? ` Your runs this year suggest a max of about ${hrIssue!.suggestedMax}.` : ''}</p>
          <Link to="/profile#hr" className="btn btn-small" style={{ alignSelf: 'flex-start' }}>Update heart rate</Link>
        </section>
      )}

      {/* The route on a map, always visible for runs with GPS (not tucked inside the full analysis) */}
      {a.streams?.some((p) => p.lat != null && p.lon != null) && <section className="card stack" aria-labelledby="route-h"><h2 id="route-h" className="title">Route</h2><RouteMap points={a.streams} /></section>}

      {/* Asked near the top until answered, so it actually gets filled in */}
      {!fb && feelSection}

      {rep.trend && (
        <section className="card stack-sm">
          <h2 className="label">Compared with your recent {TYPE_LABEL[an.type].toLowerCase()}s</h2>
          <Sparkline values={rep.trend.paces} labels={rep.trend.labels} units={U} />
          <p className="caption">Average pace, the dot is this run. Lower is faster.</p>
        </section>
      )}
      <div className="row wrap">
        <Link to={`/coach?q=${encodeURIComponent(`How did my run on ${longDate(new Date(a.startTime))} go?`)}`} className="btn"><MessageCircle size={18} strokeWidth={2} aria-hidden="true" />Ask the coach about this run</Link>
        {!isStravaRun(a) && hasFlag('hub') && data.profile.consents?.hubSharing?.granted && <button className="btn" onClick={() => setPosting(true)}><Users size={18} strokeWidth={2} aria-hidden="true" />Post to Hub</button>}
        {isStravaRun(a) && (hasFlag('hub') || hasFlag('share_cards')) && <p className="caption" style={{ flexBasis: '100%' }}>This run came from Strava, so it stays private to you: Strava's rules do not allow posting it to the Hub or sharing it as an image.</p>}
      </div>
      {sharing && <Suspense fallback={null}><ShareSheet onClose={() => setSharing(false)} data={{
        title: a.name, date: longDate(new Date(a.startTime)), distance: dist(a.distanceM, U), time: duration(a.movingS), pace: pace(a.movingS / (a.distanceM / 1000), U),
        hr: a.avgHr ? `${a.avgHr} bpm` : undefined, climb: a.elevGainM != null ? `${a.elevGainM} m` : undefined, cadence: a.avgCadence ? `${a.avgCadence} spm` : undefined,
        route: a.streams ? shareableRoute(a.streams) : null,
        splits: rep.reps.filter((r) => r.paceS).length >= 2 ? rep.reps.filter((r) => r.paceS).map((r, i) => ({ label: String(i + 1), paceS: r.paceS!, inTarget: r.inTarget })) : an.splits.slice(0, 20).map((x) => ({ label: String(x.index), paceS: x.paceS })),
        target: rep.target, splitsCaption: rep.reps.length >= 2 ? rep.verdict.split(':')[1]?.split(',')[0]?.trim() : `Splits per ${U}`,
        pb: (() => { const b = rep.badges.find((x) => /best effort/.test(x)); const m = b?.match(/New (.+) best effort: (.+)$/); return m ? { label: m[1], time: m[2], race: a.isRace ? a.name : undefined } : undefined; })(),
      }} /></Suspense>}
      {posting && !isStravaRun(a) && <PostToHub run={a} type={an.type} badges={rep.badges} compliance={rep.breakdown.find((b) => b.key === 'pace' && b.value === 100) ? 'All reps on target' : undefined} onClose={() => setPosting(false)} />}

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
        <Breakdown items={rep.breakdown} />
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

      <div className="grid-2">
        <section className="card stack"><h2 className="title">What went well</h2><ul className="bullets">{an.wentWell.slice(0, 3).map((x) => <li key={x}>{x}</li>)}</ul></section>
        <section className="card stack"><h2 className="title">What to improve</h2><ul className="bullets">{an.improve.slice(0, 3).map((x) => <li key={x}>{x}</li>)}</ul></section>
      </div>

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

        </div>
      </details>

      {fb && feelSection}

      <FixRun run={a} />
    </div>
  );
}

/** Data-quality tools for one run: possible duplicate (merge), shoes, leave out of stats, correct the distance. */
function FixRun({ run }: { run: Activity }) {
  const { data, mergeRuns, setRunHidden, setRunShoe, fixRunDistance, fixRunTime, typeOf } = useApp();
  const nav = useNavigate();
  const U = data.profile.units;
  const toU = (m: number) => (U === 'mi' ? m / 1609.344 : m / 1000);
  const [km, setKm] = useState('');
  const [time, setTime] = useState('');
  // "1:15:00", "75:00" or "75" (minutes)
  const newS = (() => { const p = time.trim().split(':').map(Number); if (!time.trim() || p.some((x) => !Number.isFinite(x))) return NaN; return p.length === 1 ? p[0] * 60 : p.length === 2 ? p[0] * 60 + p[1] : p[0] * 3600 + p[1] * 60 + p[2]; })();
  const [msg, setMsg] = useState<string>();
  const shoes = (data.profile.shoes ?? []).filter((s) => !s.retired || s.id === run.shoeId);
  const auto = shoeForRun({ startTime: run.startTime }, typeOf(run), data.profile.shoes ?? []);
  const t = new Date(run.startTime).getTime();
  const dup = data.activities.find((x) => x.id !== run.id && Math.abs(new Date(x.startTime).getTime() - t) < 3.1 * 3600000 && isDuplicatePair(run, x));
  const newM = Number(km.replace(',', '.')) * (U === 'mi' ? 1609.344 : 1000);
  const valid = newM > 100 && Math.abs(newM - run.distanceM) > 5 && newM < run.distanceM * 3;
  return (
    <section className="card stack fix-run" aria-labelledby="fix-run">
      <h2 id="fix-run" className="title">Fix this run</h2>
      {dup && (
        <div className="banner stack-sm" role="note">
          <StatusLine kind="warning">This looks like a duplicate</StatusLine>
          <p>Another run on {longDate(new Date(dup.startTime))} has the same distance and time ({dist(dup.distanceM, U)}, {duration(dup.movingS)}), starting at {new Date(dup.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}. It is often the same run imported twice, with the clock an hour out.</p>
          <div className="row wrap">
            <button className="btn btn-small btn-primary" onClick={async () => { const err = await mergeRuns(run, dup); if (err) setMsg(err); else nav(`/activity/${run.detailScore >= dup.detailScore ? run.id : dup.id}`, { replace: true }); }}>Merge the two</button>
            <Link to={`/activity/${dup.id}`} className="btn btn-small">See the other run</Link>
          </div>
          <p className="caption">Merging keeps the more detailed copy and anything you set on either one (race, notes, linked session).</p>
        </div>
      )}
      {shoes.length > 0 && (
        <div className="field">
          <label htmlFor="run-shoe">Shoes</label>
          <select id="run-shoe" className="input" value={run.shoeId ?? ''} onChange={(e) => setRunShoe(run.id, e.target.value || undefined)}>
            <option value="">Automatic{auto ? ` (${auto.name})` : ''}</option>
            {shoes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      <label className="row" style={{ gap: 10, minHeight: 44 }}>
        <input type="checkbox" checked={!!run.hidden} onChange={(e) => setRunHidden(run.id, e.target.checked)} />
        <span>Leave out of my stats<span className="caption" style={{ display: 'block' }}>Not counted in fitness, personal bests, volume or reviews. The run stays here.</span></span>
      </label>
      <div className="stack-sm">
        <label htmlFor="fix-km" className="label">Correct the distance</label>
        <p className="caption">For a treadmill run or a watch that measured wrong. Pace, splits and best efforts are recalculated.{run.distFrom ? ` Originally ${dist(run.distFrom, U, 2)}.` : ''}</p>
        <div className="row wrap">
          <input id="fix-km" className="input" style={{ maxWidth: 160 }} inputMode="decimal" placeholder={toU(run.distanceM).toFixed(2)} value={km} onChange={(e) => setKm(e.target.value)} aria-describedby="fix-km-unit" />
          <span id="fix-km-unit" className="label">{U}</span>
          <button className="btn btn-small" disabled={!valid} onClick={() => { fixRunDistance(run, newM); setKm(''); setMsg(`Distance set to ${dist(newM, U, 2)}.`); }}>Save distance</button>
          {run.distFrom && <button className="btn btn-small btn-ghost" onClick={() => { fixRunDistance(run, run.distFrom!); setMsg('Original distance restored.'); }}>Restore original</button>}
        </div>
      </div>
      {!run.streams?.length && (
        <div className="stack-sm" id="fix-time-block">
          <label htmlFor="fix-time" className="label">Correct the time</label>
          <p className="caption">For a run typed in by hand with the wrong time. Enter it as hours:minutes:seconds or minutes:seconds, or just minutes.</p>
          <div className="row wrap">
            <input id="fix-time" className="input" style={{ maxWidth: 160 }} inputMode="numeric" placeholder={duration(run.movingS)} value={time} onChange={(e) => setTime(e.target.value)} />
            <button className="btn btn-small" disabled={!(newS >= 60 && newS < 86400 && Math.abs(newS - run.movingS) >= 1)} onClick={() => { fixRunTime(run, newS); setTime(''); setMsg(`Time set to ${duration(newS)}.`); }}>Save time</button>
          </div>
        </div>
      )}
      {msg && <p role="status" className="caption">{msg}</p>}
    </section>
  );
}

