import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight, Clock, Lightbulb, Upload } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Empty, Lanes, ReadinessStatus, ZoneTag } from '../components/ui';
import { AppHeader, Avatar, ReadinessGauge, SampleChip, SectionTitle, Tile, WeekStrip, WorkoutGraph } from '../components/app';
import { addDays, DAY_NAMES, daysBetween, dist, duration, durationWords, longDate, paceRange, parseYmd, startOfWeek, toUnit, ymd } from '../lib/format';
import { TYPE_LABEL } from '../training/analysis';
import { PHASE_LABEL } from '../training/plan';

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Today() {
  const { data, today, readiness, plan, aRace, aRaceReadiness, analysisFor, buildMyPlan, series, fitness } = useApp();
  const U = data.profile.units;
  const t = ymd(today);
  const [selected, setSelected] = useState(t);

  if (!data.activities.length) {
    return (
      <div className="stack-lg">
        <AppHeader title="Today" eyebrow={longDate(today)} right={<Avatar />} />
        <Empty icon={<Upload size={28} strokeWidth={2} aria-hidden="true" />} title="Bring in your runs" action={<Link to="/profile/data" className="btn btn-primary">Upload my runs</Link>}>
          Ritmo needs your training history to plan your week. Upload FIT, GPX or TCX files, or your full Garmin export.
        </Empty>
      </div>
    );
  }

  const ws = startOfWeek(today);
  const week = Array.from({ length: 7 }, (_, i) => ymd(addDays(ws, i)));
  const ranOn = (d: string) => data.activities.some((a) => a.startTime.slice(0, 10) === d);
  const days = week.map((d) => ({ date: d, dow: DAY_NAMES[(parseYmd(d).getDay() + 6) % 7], dom: parseYmd(d).getDate(), session: plan?.sessions.find((x) => x.date === d), done: ranOn(d), today: d === t }));
  const s = plan?.sessions.find((x) => x.date === selected);
  const isToday = selected === t;
  const doneM = data.activities.filter((a) => week.includes(a.startTime.slice(0, 10)) && a.startTime.slice(0, 10) <= t).reduce((x, a) => x + a.distanceM, 0);
  const plannedM = (plan?.sessions ?? []).filter((x) => week.includes(x.date)).reduce((x, p) => x + p.distanceM, 0);
  const last = [...data.activities].sort((a, b) => b.startTime.localeCompare(a.startTime))[0];
  const lastAn = last ? analysisFor(last) : undefined;
  const latestChange = plan?.changes.filter((c) => c.id !== 'built').sort((a, b) => b.at.localeCompare(a.at))[0];
  const daysToRace = aRace ? daysBetween(today, parseYmd(aRace.date)) : undefined;
  const done = s?.completedActivityId ? data.activities.find((a) => a.id === s.completedActivityId) : undefined;
  const tsb = series.find((d) => d.date === t)?.tsb ?? 0;
  const gauge = Math.round(readiness.level === 'ready' ? Math.max(65, Math.min(98, 78 + tsb)) : readiness.level === 'easy' ? Math.max(40, Math.min(64, 58 + tsb / 2)) : Math.max(10, Math.min(39, 30 + tsb / 3)));
  const insight = latestChange && daysBetween(new Date(latestChange.at), today) <= 7
    ? latestChange.summary
    : lastAn?.patternNotes[0] ? `${lastAn.patternNotes[0]} ${lastAn.improve[0]}` : lastAn?.wentWell[0];

  return (
    <div className="stack-lg">
      <AppHeader title="Today" eyebrow={`${greeting()}${data.profile.name ? `, ${data.profile.name}` : ''} · ${longDate(today)}`} right={<><SampleChip /><Avatar /></>} />

      <WeekStrip days={days} selected={selected} onSelect={setSelected} />

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
                <div><span className="stat-xl">{toUnit(s.distanceM, U).toFixed(s.distanceM % 1000 ? 1 : 0)}</span><span className="label"> {U}</span></div>
                <div className="row label" style={{ gap: 6, paddingBottom: 6 }}><Clock size={16} strokeWidth={2} aria-hidden="true" />{durationWords(s.durationS)}</div>
              </div>
              <WorkoutGraph session={s} onBrand height={64} />
              <ol className="ol-steps body">{s.steps.map((st, i) => <li key={i}><strong>{st.label}</strong> {st.detail}</li>)}</ol>
            </>
          ) : <p className="body">{s.purpose}</p>}
          <div className="row wrap">
            {done
              ? <Link to={`/activity/${done.id}`} className="btn btn-primary">See your feedback <ArrowRight size={18} strokeWidth={2} aria-hidden="true" /></Link>
              : <Link to={`/session/${s.id}`} className="btn btn-primary">{s.type === 'rest' ? 'Why rest matters' : 'Session details'} <ArrowRight size={18} strokeWidth={2} aria-hidden="true" /></Link>}
            {isToday && s.type !== 'rest' && !done && <Link to="/coach?q=I only have 30 minutes, what should I do?" className="btn">Short on time?</Link>}
          </div>
        </section>
      ) : (
        <Empty title={plan ? 'Nothing planned' : 'No plan yet'} action={!plan && <button className="btn btn-primary" onClick={buildMyPlan}>Build my plan</button>}>
          {plan ? 'Enjoy the day off.' : 'Ritmo builds a plan from your past training, current fitness and goals, then adapts it as you go.'}
        </Empty>
      )}

      {s && s.type !== 'rest' && s.type !== 'race' && (s.paceTarget || s.hrZones) && (
        <section className="card stack-sm" aria-label="Targets">
          <div className="row-between wrap" style={{ gap: 'var(--s4)' }}>
            {s.paceTarget && <div><p className="caption">Target pace</p><p className="stat" style={{ fontSize: 22, lineHeight: '28px' }}>{paceRange(s.paceTarget.minSPerKm, s.paceTarget.maxSPerKm, U)}</p></div>}
            {s.hrZones && <ZoneTag zones={s.hrZones} />}
          </div>
          <p className="caption"><strong style={{ color: 'var(--ink)' }}>Why it matters.</strong> {s.purpose}</p>
        </section>
      )}

      <SectionTitle>How you are today</SectionTitle>
      <section className="card stack" aria-label="Readiness">
        <div className="row" style={{ gap: 'var(--s4)' }}>
          <ReadinessGauge level={readiness.level} value={gauge} label={readiness.label} />
          <div className="stack-sm">
            <ReadinessStatus level={readiness.level} label={readiness.label} />
            <p>{readiness.summary}</p>
          </div>
        </div>
        <details>
          <summary className="label row" style={{ cursor: 'pointer', minHeight: 44, gap: 6 }}>What this is based on</summary>
          <ul className="bullets caption">{readiness.basedOn.map((b) => <li key={b}>{b}</li>)}</ul>
        </details>
      </section>

      <SectionTitle action={<Link to="/progress" className="btn btn-ghost btn-small">Progress</Link>}>At a glance</SectionTitle>
      <div className="tiles">
        <Tile to="/calendar" label="This week" value={toUnit(doneM, U).toFixed(1)} unit={U} sub={<span className="stack-sm" style={{ gap: 6 }}>of {toUnit(plannedM, U).toFixed(0)} {U} planned<span className="progress" style={{ display: 'block' }}><span style={{ width: `${Math.min(100, (doneM / (plannedM || 1)) * 100)}%` }} /></span></span>} />
        {aRace && daysToRace != null && <Tile to={`/race/${aRace.id}`} accent label={aRace.name} value={daysToRace} unit="days" sub={`${aRace.priority} race`} />}
        {aRaceReadiness && <Tile to={aRace ? `/race/${aRace.id}` : undefined} label="Predicted finish" value={duration(aRaceReadiness.predictedS)} sub={aRace?.goalS ? `Goal ${duration(aRace.goalS)}` : undefined} />}
        {fitness && <Tile to="/progress" label="Fitness (VDOT)" value={fitness.vdot.toFixed(1)} sub={aRaceReadiness ? `Race readiness ${aRaceReadiness.score}` : undefined} />}
      </div>

      {insight && (
        <section className="card stack-sm" aria-labelledby="insight">
          <div className="row" style={{ gap: 8 }}><Lightbulb size={20} strokeWidth={2} color="var(--accent-mark)" aria-hidden="true" /><h2 id="insight" className="label">Coach</h2></div>
          <p>{insight}</p>
          <Link to="/coach" className="label row" style={{ gap: 4, textDecoration: 'none', minHeight: 44 }}>Ask your coach <ChevronRight size={18} strokeWidth={2} aria-hidden="true" /></Link>
        </section>
      )}

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
    </div>
  );
}
