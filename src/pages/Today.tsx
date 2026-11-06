import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, ChevronRight, Clock, Footprints, Lightbulb, Plus, Sparkles, Upload } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { useRunDetail } from '../app/useRunDetail';
import { DayRuns } from '../components/DayRuns';
import { Empty, Lanes, ReadinessStatus, StatusLine, ZoneTag } from '../components/ui';
import { AppHeader, Avatar, ReadinessGauge, SampleChip, SectionTitle, Tile, WeekStrip, WorkoutGraph } from '../components/app';
import { LogRunSheet } from '../components/LogRun';
import { SeeMore } from '../components/setup-ui';
import { NotFeeling, QuickAdd } from '../components/QuickAdd';
import { addDays, DAY_NAMES, daysBetween, daysUntil, dist, localise, duration, durationWords, longDate, paceRange, parseYmd, startOfWeek, toUnit, ymd } from '../lib/format';
import { TYPE_LABEL } from '../training/analysis';
import { PHASE_LABEL } from '../training/plan';
import { RUNS_FOR_PACES } from '../training/stage';
import { missedKeySession, missedMoveOptions } from '../training/plan';
import type { PlannedSession } from '../lib/types';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Today() {
  const { data, today, readiness, plan, aRace, aRaceReadiness, analysisFor, buildMyPlan, series, fitness, stage, paces, handleMissed, athlete } = useApp();
  const U = data.profile.units;
  const t = ymd(today);
  const [selected, setSelected] = useState(t);
  const [logFor, setLogFor] = useState<PlannedSession | 'free' | null>(null);
  const [planMsg, setPlanMsg] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [unwell, setUnwell] = useState(false);
  const latest = data.activities.length ? data.activities.reduce((m, x) => (x.startTime > m.startTime ? x : m)) : undefined;
  const { run: last } = useRunDetail(latest, data.mode === 'real');
  const logButton = <button className="icon-btn" aria-label="Add a run, cross-training, a note or a race" onClick={() => setAdding(true)}><Plus size={24} strokeWidth={2} /></button>;
  const sheet = <>
    {logFor && <LogRunSheet open onClose={() => setLogFor(null)} session={logFor === 'free' ? undefined : logFor} />}
    <QuickAdd open={adding} onClose={() => setAdding(false)} />
    {unwell && <NotFeeling onClose={() => setUnwell(false)} />}
  </>;

  if (!data.activities.length && !plan) {
    return (
      <div className="stack-lg">
        <AppHeader title="Today" eyebrow={longDate(today)} right={<><SampleChip />{logButton}<Avatar /></>} />
        <Empty icon={<Sparkles size={28} strokeWidth={2} aria-hidden="true" />} title="Let's get you started"
          action={<div className="stack-sm" style={{ width: '100%' }}>
            <Link to="/setup" className="btn btn-primary"><Footprints size={18} strokeWidth={2} aria-hidden="true" />Get my plan</Link>
            <Link to="/profile/data" className="btn"><Upload size={18} strokeWidth={2} aria-hidden="true" />Upload my runs</Link>
            <button className="btn btn-ghost" onClick={() => setLogFor('free')}><Plus size={18} strokeWidth={2} aria-hidden="true" />Log a run by hand</button>
          </div>}>
          Ritmo plans your week from your running. There is nothing here yet: answer a few questions for a plan, bring in your history, or log a run you have done.
        </Empty>
        {sheet}
      </div>
    );
  }

  const ws = startOfWeek(today);
  const week = Array.from({ length: 7 }, (_, i) => ymd(addDays(ws, i)));
  const ranOn = (d: string) => data.activities.some((a) => a.startTime.slice(0, 10) === d);
  const days = week.map((d) => { const session = plan?.sessions.find((x) => x.date === d); return { date: d, dow: DAY_NAMES[(parseYmd(d).getDay() + 6) % 7], dom: parseYmd(d).getDate(), session, done: ranOn(d), today: d === t, unplanned: ranOn(d) && (!session || session.type === 'rest'), missed: !!session && session.type !== 'rest' && d < t && !ranOn(d) }; });
  const runsHere = data.activities.filter((a) => a.startTime.slice(0, 10) === selected).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const s = plan?.sessions.find((x) => x.date === selected);
  const isToday = selected === t;
  const weekSessions = (plan?.sessions ?? []).filter((x) => week.includes(x.date) && x.type !== 'rest');
  const doneM = athlete.weekM;
  const plannedM = weekSessions.reduce((x, p) => x + p.distanceM, 0);
  const durationBased = weekSessions.length > 0 && plannedM === 0 || weekSessions.some((x) => x.type === 'runwalk');
  const lastAn = last ? analysisFor(last) : undefined;
  const daysToRace = aRace ? daysUntil(today, aRace.date) : undefined;
  const missed = plan ? missedKeySession(plan, today) : undefined;
  const missedTo = plan && missed ? missedMoveOptions(plan, missed.id, today).slice(0, 3) : [];
  const ranHereKm = data.activities.filter((a) => a.startTime.slice(0, 10) === selected).reduce((x, a) => x + a.distanceM, 0);
  const done = s?.completedActivityId ? data.activities.find((a) => a.id === s.completedActivityId) : undefined;
  const tsb = series.find((d) => d.date === t)?.tsb ?? 0;
  const gauge = Math.round(readiness.level === 'ready' ? Math.max(65, Math.min(98, 78 + tsb)) : readiness.level === 'easy' ? Math.max(40, Math.min(64, 58 + tsb / 2)) : Math.max(10, Math.min(39, 30 + tsb / 3)));
  const upcoming = (plan?.sessions ?? []).filter((x) => x.date >= t && x.type !== 'rest');
  const isStarter = plan?.sessions.some((x) => x.type === 'runwalk' || x.type === 'timetrial');

  // Coaching insight: only recent plan changes (they carry their own date), otherwise a note from the last run, dated
  const recentChange = plan?.changes.filter((c) => c.id !== 'built' && daysBetween(new Date(c.at), today) <= 2).sort((a, b) => b.at.localeCompare(a.at))[0];
  const lastRunNote = last && lastAn && daysBetween(new Date(last.startTime), today) <= 7
    ? `From your run on ${longDate(new Date(last.startTime))}: ${lastAn.patternNotes[0] ? `${lastAn.patternNotes[0]} ${lastAn.improve[0]}` : lastAn.wentWell[0]}`
    : undefined;
  const insight = recentChange?.summary ?? lastRunNote;

  const sessionAmount = (x: PlannedSession) => x.distanceM > 0
    ? <div><span className="stat-xl">{toUnit(x.distanceM, U).toFixed(x.distanceM % 1000 ? 1 : 0)}</span><span className="label"> {U}</span></div>
    : <div><span className="stat-xl">{Math.round(x.durationS / 60)}</span><span className="label"> min</span></div>;

  return (
    <div className="stack-lg">
      <AppHeader title="Today" eyebrow={`${greeting()}${data.profile.name ? `, ${data.profile.name}` : ''} · ${longDate(today)}`} right={<><SampleChip />{logButton}<Avatar /></>} />

      {(plan || data.activities.length > 0) && <WeekStrip days={days} selected={selected} onSelect={setSelected} />}

      {s ? (
        <section className="hero stack" aria-labelledby="session-title">
          <Lanes />
          <div className="hero-top">
            <span className="pill-on-brand">{isToday ? 'Today' : longDate(parseYmd(selected))}</span>
            <span className="label">{s.focus} · {PHASE_LABEL[s.phase]}</span>
          </div>
          <h2 id="session-title" className="display-lg">{s.title}</h2>
          {s.type !== 'rest' ? (
            <>
              <div className="row wrap" style={{ gap: 'var(--s5)', alignItems: 'flex-end' }}>
                {sessionAmount(s)}
                {s.distanceM > 0 && <div className="row label" style={{ gap: 6, paddingBottom: 6 }}><Clock size={16} strokeWidth={2} aria-hidden="true" />{durationWords(s.durationS)}</div>}
              </div>
              <WorkoutGraph session={s} onBrand height={64} />
              <p className="body hero-why"><strong>Why: </strong>{s.purpose}</p>
            </>
          ) : ranHereKm > 0 ? <p className="body">You ran {dist(ranHereKm, U)} on a rest day. It counts toward your week, and the rest of the week adjusts if needed.</p> : <p className="body">{s.purpose}</p>}
          <div className="row wrap">
            {done
              ? <Link to={`/activity/${done.id}`} className="btn btn-primary">See your feedback <ArrowRight size={18} strokeWidth={2} aria-hidden="true" /></Link>
              : s.type !== 'rest' && selected <= t
                ? <button className="btn btn-primary" onClick={() => setLogFor(s)}><Check size={18} strokeWidth={2} aria-hidden="true" />I did it</button>
                : null}
            {!done && <Link to={`/session/${s.id}`} className="btn">{s.type === 'rest' ? 'Why rest matters' : 'Session details'}</Link>}
            {isToday && s.type !== 'rest' && !done && <Link to="/coach?q=I only have 30 minutes, what should I do?" className="btn btn-ghost">Short on time?</Link>}
            {isToday && <button className="btn btn-ghost" onClick={() => setUnwell(true)}>Not feeling 100%?</button>}
          </div>
        </section>
      ) : runsHere.length ? null : plan ? (
        <Empty title={upcoming.length ? 'Nothing planned' : 'Your plan is complete'} action={!upcoming.length && <button className="btn btn-primary" onClick={() => setPlanMsg(buildMyPlan())}>Build my next plan</button>}>
          {upcoming.length ? 'Enjoy the day off. A gentle walk is always fine.' : 'Well done for finishing it. Ritmo can build your next plan from what you have done.'}
        </Empty>
      ) : (
        <Empty title="No plan yet" action={<button className="btn btn-primary" onClick={() => setPlanMsg(buildMyPlan())}>Build my plan</button>}>
          Ritmo builds a plan from your past training, current fitness and goals, then adapts it as you go.
        </Empty>
      )}
      {planMsg && <div role="alert"><StatusLine kind="warning">{planMsg}</StatusLine></div>}

      {/* What was actually run on the selected day, planned or not */}
      {runsHere.length > 0 && (
        <section className="card stack-sm" aria-labelledby="ran-here">
          <h2 id="ran-here" className="label">{isToday ? 'Your runs today' : `Your runs on ${longDate(parseYmd(selected))}`}: {dist(runsHere.reduce((x, a) => x + a.distanceM, 0), U)}</h2>
          <DayRuns runs={runsHere} unplanned={!s || s.type === 'rest'} />
        </section>
      )}

      {missed && (
        <section className="card stack-sm" aria-labelledby="missed">
          <h2 id="missed" className="label">You missed {missed.title.toLowerCase()} on {longDate(parseYmd(missed.date))}</h2>
          <p className="muted">{missedTo.length ? 'Move it to a day this week with an easier day either side, or let it go. One missed session costs very little.' : 'There is no safe day left this week, so it is best to let it go. One missed session costs very little.'}</p>
          <div className="row wrap">
            {missedTo.map((d) => <button key={d} className="btn btn-small btn-primary" onClick={() => handleMissed(missed.id, d)}>Move to {d === t ? 'today' : DAY_NAMES[(parseYmd(d).getDay() + 6) % 7]}</button>)}
            <button className="btn btn-small" onClick={() => handleMissed(missed.id)}>Let it go</button>
          </div>
        </section>
      )}

      {isStarter && stage.predictions && (
        <section className="card stack-sm">
          <StatusLine kind="success">Full plans unlocked</StatusLine>
          <p>Your time trial means Ritmo now knows your fitness. You can move on to a plan for a 5K, 10K or longer goal, with pace targets and race predictions.</p>
          <div className="row wrap"><button className="btn btn-primary" onClick={() => setPlanMsg(buildMyPlan())}>Build my next plan</button><Link to="/race/new" className="btn">Add a race first</Link></div>
        </section>
      )}

      {s && s.type !== 'rest' && s.type !== 'race' && (
        <section className="card stack-sm" aria-label="How to run it">
          <div className="row-between wrap" style={{ gap: 'var(--s4)' }}>
            {s.paceTarget && <div><p className="caption">Target pace{stage.stage === 'building' ? ' (estimated from your runs)' : ''}</p><p className="stat" style={{ fontSize: 22, lineHeight: '28px' }}>{paceRange(s.paceTarget.minSPerKm, s.paceTarget.maxSPerKm, U)}</p></div>}
            {s.type === 'runwalk' && (paces
              ? <div><p className="caption">Running parts, estimated from your runs</p><p className="stat" style={{ fontSize: 22, lineHeight: '28px' }}>{paceRange(paces.easy[0], paces.easy[1], U)}</p></div>
              : <div><p className="caption">Effort</p><p className="label">Easy: you can talk in full sentences</p></div>)}
            {s.hrZones && data.activities.some((a) => a.avgHr) && <ZoneTag zones={s.hrZones} />}
          </div>
          <ol className="ol-steps">{s.steps.map((st, i) => <li key={i}><strong>{localise(st.label, U)}</strong> {localise(st.detail, U)}</li>)}</ol>
          {s.second && <p className="caption"><strong style={{ color: 'var(--ink)' }}>{s.second.title}.</strong> {localise(s.second.detail, U)}</p>}
          {s.strength && <p className="caption"><strong style={{ color: 'var(--ink)' }}>Strength.</strong> {s.strength}</p>}
        </section>
      )}

      <section className="card stack-sm" aria-label="Readiness">
        <ReadinessStatus level={readiness.level} label={readiness.label} />
        <p>{readiness.summary}</p>
      </section>

      {insight && (
        <section className="card stack-sm" aria-labelledby="insight">
          <div className="row" style={{ gap: 8 }}><Lightbulb size={20} strokeWidth={2} color="var(--accent-mark)" aria-hidden="true" /><h2 id="insight" className="label">Coach</h2></div>
          <p>{insight}</p>
          <Link to="/coach" className="label row" style={{ gap: 4, textDecoration: 'none', minHeight: 44 }}>Ask your coach <ChevronRight size={18} strokeWidth={2} aria-hidden="true" /></Link>
        </section>
      )}

      <SeeMore label="See more: readiness, this week and last run">
      <SectionTitle>How you are today</SectionTitle>
      <section className="card stack" aria-label="Readiness details">
        {stage.predictions && <div className="row" style={{ gap: 'var(--s4)' }}><ReadinessGauge level={readiness.level} value={gauge} label={readiness.label} /><p className="caption">Readiness combines your recent training load with how your runs felt.</p></div>}
        {!stage.predictions && <p className="caption">A readiness score with training load appears once Ritmo knows your fitness. Until then it is based on how your runs felt and any pain or illness you log.</p>}
        <details>
          <summary className="label row" style={{ cursor: 'pointer', minHeight: 44, gap: 6 }}>What this is based on</summary>
          <ul className="bullets caption">{readiness.basedOn.map((b) => <li key={b}>{b}</li>)}</ul>
        </details>
      </section>

      {!stage.predictions && (
        <section className="card stack-sm" aria-labelledby="unlock">
          <h2 id="unlock" className="label">Unlocking your fitness</h2>
          <div className="row" style={{ alignItems: 'baseline', gap: 8 }}><span className="stat-xl" style={{ fontSize: 32, lineHeight: '36px' }}>{stage.runs}</span><span className="muted label">run{stage.runs === 1 ? '' : 's'} in the last 3 months</span></div>
          <div className="progress" role="progressbar" aria-label="Runs towards pace targets" aria-valuemin={0} aria-valuemax={RUNS_FOR_PACES} aria-valuenow={Math.min(RUNS_FOR_PACES, stage.runs)}><span style={{ width: `${Math.min(100, (stage.runs / RUNS_FOR_PACES) * 100)}%` }} /></div>
          <p className="caption">{stage.next}</p>
        </section>
      )}

      <SectionTitle action={<Link to="/progress" className="btn btn-ghost btn-small">Progress</Link>}>At a glance</SectionTitle>
      <div className="tiles">
        {durationBased
          ? <Tile to="/calendar" label="This week" value={weekSessions.filter((x) => x.status === 'done').length} unit={`of ${weekSessions.length}`} sub="sessions done" />
          : <Tile to="/calendar" label="This week" value={toUnit(doneM, U).toFixed(1)} unit={U} sub={plannedM > 0 ? <span className="stack-sm" style={{ gap: 6 }}>of {toUnit(plannedM, U).toFixed(0)} {U} planned<span className="progress" style={{ display: 'block' }}><span style={{ width: `${Math.min(100, (doneM / (plannedM || 1)) * 100)}%` }} /></span></span> : 'run so far'} />}
        {aRace && daysToRace != null && <Tile to={`/race/${aRace.id}`} accent label={aRace.name} value={daysToRace} unit="days" sub={`${aRace.priority} race`} />}
        {aRaceReadiness && <Tile to={aRace ? `/race/${aRace.id}` : undefined} label="Predicted finish" value={duration(aRaceReadiness.predictedS)} sub={aRace?.goalS ? `Goal ${duration(aRace.goalS)}` : undefined} />}
        {fitness && stage.predictions && <Tile to="/progress" label="Fitness (VDOT)" value={fitness.vdot.toFixed(1)} sub={aRaceReadiness ? `Race readiness ${aRaceReadiness.score}` : undefined} />}
        {!stage.predictions && <Tile to="/progress" label="Runs logged" value={athlete.runCount} sub={athlete.runCount ? `${dist(athlete.totalM, U)} in total` : 'Your first one is next'} />}
      </div>

      {last && lastAn && (
        <>
          <SectionTitle>Last run</SectionTitle>
          <div className="group">
            <Link to={`/activity/${last.id}`}>
              <span className="row-icon"><span className="stat" style={{ fontSize: 15 }}>{lastAn.score}</span></span>
              <span className="stack-sm" style={{ gap: 0, flex: 1 }}>
                <span className="label">{TYPE_LABEL[lastAn.type]} · {dist(last.distanceM, U)}</span>
                <span className="caption">{longDate(new Date(last.startTime))} · {duration(last.movingS)}</span>
              </span>
              <ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
            </Link>
          </div>
        </>
      )}
      </SeeMore>
      {sheet}
    </div>
  );
}
