import { Link } from 'react-router-dom';
import { ArrowRight, Flag, Lightbulb, Upload } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Empty, Lanes, ReadinessStatus, SampleBanner, ZoneTag } from '../components/ui';
import { addDays, DAY_SHORT, daysBetween, dist, distanceLabel, duration, durationWords, longDate, paceRange, parseYmd, startOfWeek, ymd } from '../lib/format';
import { TYPE_LABEL } from '../training/analysis';
import { PHASE_LABEL } from '../training/plan';

function greeting(d: Date) {
  const h = new Date().getHours();
  void d;
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Today() {
  const { data, today, todaySession: s, readiness, plan, aRace, aRaceReadiness, analysisFor, buildMyPlan } = useApp();
  const U = data.profile.units;
  const t = ymd(today);

  if (!data.activities.length) {
    return (
      <div className="stack-lg">
        <h1 className="display-lg">Today</h1>
        <Empty icon={<Upload size={28} strokeWidth={2} aria-hidden="true" />} title="Bring in your runs" action={<Link to="/profile/data" className="btn btn-primary">Upload my runs</Link>}>
          Ritmo needs your training history to plan your week. Upload FIT, GPX or TCX files, or your full Garmin export.
        </Empty>
      </div>
    );
  }

  const ws = startOfWeek(today);
  const week = Array.from({ length: 7 }, (_, i) => ymd(addDays(ws, i)));
  const weekActs = data.activities.filter((a) => week.includes(a.startTime.slice(0, 10)));
  const doneM = weekActs.filter((a) => a.startTime.slice(0, 10) <= t).reduce((x, a) => x + a.distanceM, 0);
  const plannedM = (plan?.sessions ?? []).filter((x) => week.includes(x.date)).reduce((x, p) => x + p.distanceM, 0);
  const last = [...data.activities].sort((a, b) => b.startTime.localeCompare(a.startTime))[0];
  const lastAn = last ? analysisFor(last) : undefined;
  const latestChange = plan?.changes.filter((c) => c.id !== 'built').sort((a, b) => b.at.localeCompare(a.at))[0];
  const daysToRace = aRace ? daysBetween(today, parseYmd(aRace.date)) : undefined;
  const done = s?.status === 'done' && s.completedActivityId ? data.activities.find((a) => a.id === s.completedActivityId) : undefined;

  const insight = latestChange && daysBetween(new Date(latestChange.at), today) <= 7
    ? latestChange.summary
    : lastAn?.patternNotes[0] ? `${lastAn.patternNotes[0]} ${lastAn.improve[0]}` : lastAn?.wentWell[0];

  return (
    <div className="stack-lg">
      <SampleBanner />
      <div className="screen-head" style={{ marginBottom: 0 }}>
        <div className="stack-sm">
          <p className="caption">{longDate(today)}</p>
          <h1 className="display-lg">{greeting(today)}{data.profile.name ? `, ${data.profile.name}` : ''}</h1>
        </div>
        <ReadinessStatus level={readiness.level} label={readiness.label} />
      </div>

      {s ? (
        <section className="hero stack" aria-labelledby="today-title">
          <Lanes />
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="label">Today</span>
            <span className="caption">·</span>
            <span className="label">{s.focus}</span>
            <span className="caption">·</span>
            <span className="caption">{PHASE_LABEL[s.phase]} phase</span>
          </div>
          <h2 id="today-title" className="display-lg">{s.title}</h2>
          {s.type !== 'rest' ? (
            <div className="row wrap" style={{ gap: 'var(--s5)', alignItems: 'flex-end' }}>
              <div><span className="stat-xl">{(s.distanceM / (U === 'km' ? 1000 : 1609.344)).toFixed(s.distanceM % 1000 ? 1 : 0)}</span> <span className="label">{U}</span></div>
              <div className="label">about {durationWords(s.durationS)}</div>
            </div>
          ) : <p className="body">{s.steps[0].detail}</p>}
          {s.type !== 'rest' && (
            <ol className="ol-steps body">
              {s.steps.map((st, i) => <li key={i}><strong>{st.label}</strong> {st.detail}</li>)}
            </ol>
          )}
          <p className="body" style={{ maxWidth: 640 }}><strong>Why it matters.</strong> {s.purpose}</p>
          <div className="row wrap">
            {done
              ? <Link to={`/activity/${done.id}`} className="btn btn-primary">See your feedback <ArrowRight size={18} strokeWidth={2} aria-hidden="true" /></Link>
              : <Link to={`/session/${s.id}`} className="btn btn-primary">Session details <ArrowRight size={18} strokeWidth={2} aria-hidden="true" /></Link>}
            {s.type !== 'rest' && !done && <Link to="/coach?q=I only have 30 minutes, what should I do?" className="btn">Short on time?</Link>}
          </div>
        </section>
      ) : (
        <Empty title="No plan yet" action={<button className="btn btn-primary" onClick={buildMyPlan}>Build my plan</button>}>
          Ritmo builds a plan from your past training, current fitness and goals, then adapts it as you go.
        </Empty>
      )}

      <div className="grid-2">
        {s && s.type !== 'rest' && (s.paceTarget || s.hrZones) && (
          <section className="card stack" aria-labelledby="targets">
            <h2 id="targets" className="title">Targets</h2>
            {s.paceTarget && <div><p className="caption">Pace</p><p className="stat" style={{ fontSize: 24, lineHeight: '30px' }}>{paceRange(s.paceTarget.minSPerKm, s.paceTarget.maxSPerKm, U)}</p></div>}
            {s.hrZones && <div className="stack-sm"><p className="caption">Heart rate</p><ZoneTag zones={s.hrZones} /></div>}
            <p className="caption">{s.howItHelps}</p>
          </section>
        )}

        <section className="card stack" aria-labelledby="readiness">
          <div className="row-between"><h2 id="readiness" className="title">How you are today</h2></div>
          <ReadinessStatus level={readiness.level} label={readiness.label} />
          <p>{readiness.summary}</p>
          <div className="stack-sm">
            <p className="caption">Based on</p>
            <ul className="bullets caption">{readiness.basedOn.map((b) => <li key={b}>{b}</li>)}</ul>
          </div>
        </section>

        <section className="card stack" aria-labelledby="week">
          <div className="row-between"><h2 id="week" className="title">This week</h2><Link to="/calendar" className="btn btn-ghost btn-small">Calendar</Link></div>
          <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
            <span className="stat-xl" style={{ fontSize: 40, lineHeight: '44px' }}>{dist(doneM, U, 1).split(' ')[0]}</span>
            <span className="muted label">of {dist(plannedM, U, 0)} planned</span>
          </div>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, doneM / (plannedM || 1)) * 100)} aria-label="Weekly distance progress"><span style={{ width: `${Math.min(100, (doneM / (plannedM || 1)) * 100)}%` }} /></div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            {week.map((d, i) => {
              const ps = plan?.sessions.find((x) => x.date === d);
              const ran = data.activities.some((a) => a.startTime.slice(0, 10) === d);
              const isToday = d === t;
              return (
                <div key={d} className="stack-sm" style={{ alignItems: 'center', gap: 4 }} title={ps?.title}>
                  <span className={`caption`} style={{ fontWeight: isToday ? 600 : 400, color: isToday ? 'var(--ink)' : undefined }}>{DAY_SHORT[i]}</span>
                  <span aria-label={`${DAY_SHORT[i]}: ${ran ? 'run done' : ps?.status === 'missed' ? 'missed' : ps?.type === 'rest' ? 'rest' : ps ? 'planned' : 'nothing planned'}`}
                    style={{ width: 14, height: 14, borderRadius: 7, background: ran ? 'var(--ink)' : 'transparent', border: `2px solid ${ran ? 'var(--ink)' : ps?.type === 'rest' || !ps ? 'var(--hairline)' : isToday ? 'var(--brand)' : 'var(--border)'}` }} />
                </div>
              );
            })}
          </div>
        </section>

        {aRace && daysToRace != null && (
          <Link to={`/race/${aRace.id}`} className="card card-link stack" aria-label={`${aRace.name}, ${daysToRace} days to go`}>
            <div className="row-between"><h2 className="title">Next race</h2><span className="tag tag-accent"><Flag size={14} strokeWidth={2} aria-hidden="true" />{aRace.priority} race</span></div>
            <div className="row" style={{ alignItems: 'baseline', gap: 8 }}>
              <span className="stat-xl" style={{ fontSize: 40, lineHeight: '44px' }}>{daysToRace}</span>
              <span className="label muted">days to {aRace.name}</span>
            </div>
            {aRaceReadiness && (
              <div className="row wrap" style={{ gap: 'var(--s5)' }}>
                <div><p className="caption">Predicted</p><p className="stat">{duration(aRaceReadiness.predictedS)}</p></div>
                {aRace.goalS && <div><p className="caption">Goal</p><p className="stat">{duration(aRace.goalS)}</p></div>}
                <div><p className="caption">Readiness</p><p className="stat">{aRaceReadiness.score}/100</p></div>
              </div>
            )}
            <p className="caption">{distanceLabel(aRace.distanceM)} · {longDate(parseYmd(aRace.date))}</p>
          </Link>
        )}

        {insight && (
          <section className="card stack" aria-labelledby="insight">
            <div className="row" style={{ gap: 8 }}><Lightbulb size={20} strokeWidth={2} color="var(--accent-mark)" aria-hidden="true" /><h2 id="insight" className="title">Coaching insight</h2></div>
            <p>{insight}</p>
            <Link to="/coach" className="btn btn-small" style={{ alignSelf: 'flex-start' }}>Ask your coach</Link>
          </section>
        )}

        {last && lastAn && (
          <Link to={`/activity/${last.id}`} className="card card-link stack">
            <div className="row-between"><h2 className="title">Last run</h2><span className="caption">{longDate(new Date(last.startTime))}</span></div>
            <div className="row wrap" style={{ gap: 'var(--s5)' }}>
              <div><p className="caption">Distance</p><p className="stat">{dist(last.distanceM, U)}</p></div>
              <div><p className="caption">Time</p><p className="stat">{duration(last.movingS)}</p></div>
              <div><p className="caption">Score</p><p className="stat">{lastAn.score}</p></div>
            </div>
            <p className="label">{TYPE_LABEL[lastAn.type]}</p>
            <p className="muted">{lastAn.scoreReason}</p>
          </Link>
        )}
      </div>
    </div>
  );
}
