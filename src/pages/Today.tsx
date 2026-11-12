import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Footprints, Lightbulb, MessageCircle, Play, Plus, Sparkles, Upload, Zap } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { useRunDetail } from '../app/useRunDetail';
import { DayRuns } from '../components/DayRuns';
import { Empty, Lanes, StatusLine, ZoneTag } from '../components/ui';
import { AppHeader, SampleChip, SectionTitle, Tile, WeekStrip, WorkoutGraph } from '../components/app';
import { CheckInCard, MonthPlan, NextRaceCard, PlanChanges, ReadinessStrip, RebuildSheet, RestOfWeek, SyncNote, SessionSheet, WeekBar } from '../components/training';
import { buildReport } from '../training/report';
import { buildVerdict } from '../training/verdict';
import { forStats } from '../data/quality';
import { LogRunSheet } from '../components/LogRun';
import { GearQuestion } from '../components/GearQuestion';
import { LogSessionSheet } from '../components/LogSession';
import { MonthCalendar, Sheet } from '../components/inputs';
import { SeeMore } from '../components/setup-ui';
import { NotFeeling, QuickAdd } from '../components/QuickAdd';
import { addDays, DAY_NAMES, daysBetween, dist, localise, duration, durationWords, longDate, pace, paceRange, parseYmd, shortDate, startOfWeek, toUnit, ymd } from '../lib/format';
import { TYPE_LABEL } from '../training/analysis';
import { PHASE_LABEL } from '../training/plan';
import { RUNS_FOR_PACES } from '../training/stage';
import { weekReview } from '../training/report';
import { explainWeek } from '../training/explain';
import { shoeAlert, shoeTotals } from '../training/shoes';
import { InstallPrompt } from '../components/InstallPrompt';
import { activeNiggle, areaLabel, DISCLAIMER, painRule } from '../training/body';
import { plannedNum } from '../training/session-view';
import { BodyCheckinSheet } from '../components/BodyCheckin';
import { missedKeySession, missedMoveOptions, swapLine } from '../training/plan';
import type { PlannedSession } from '../lib/types';

/** "Today's training", "Yesterday's training", "Tomorrow's training" or "Monday's training · 2 Nov" */
function dayTitle(d: string, t: string): string {
  const diff = Math.round((parseYmd(d).getTime() - parseYmd(t).getTime()) / 86400000);
  if (diff === 0) return "Today's training";
  if (diff === -1) return "Yesterday's training";
  if (diff === 1) return "Tomorrow's training";
  const date = parseYmd(d);
  return `${DAY_NAMES[(date.getDay() + 6) % 7]}'s training · ${date.getDate()} ${date.toLocaleDateString('en-GB', { month: 'short' })}`;
}

/** Body: the niggle Ritmo is looking after, a red-flag pause, or the return-to-run step */
function BodyCard({ onCheckIn }: { onCheckIn: () => void }) {
  const { data, today, updateBody } = useApp();
  const b = data.profile.body;
  const n = activeNiggle(b, today);
  const paused = !!b?.redFlagAt && (!b.checkedAt || b.checkedAt < b.redFlagAt);
  if (!n && !paused && !b?.rtrStep) return null;
  const firstOfArea = n ? [...(b?.checkins ?? [])].filter((c) => c.area === n.area && c.side === n.side).sort((x, y) => x.at.localeCompare(y.at))[0] : undefined;
  const dayN = firstOfArea ? Math.floor((today.getTime() - new Date(firstOfArea.at).getTime()) / 86400000) + 1 : 1;
  const trend = n?.trend === 'better' ? 'improving' : n?.trend === 'worse' ? 'getting worse' : 'about the same';
  return (
    <section className="card stack-sm" aria-labelledby="body-card">
      <h2 id="body-card" className="label">{paused ? 'Training paused: get checked first' : n ? `${areaLabel(n)} · day ${dayN} · ${trend} · ${n.pain}/10` : `Return to run · step ${b!.rtrStep} of 6`}</h2>
      {paused ? <p>You reported a warning sign. See a doctor or physio, then confirm here to resume training.</p>
        : b?.rtrStep ? <p>Each step unlocks when pain stays at 2/10 or lower during the run and the next morning. Check in after each step.</p>
        : n && <p className="body-rule">{painRule(n, b?.careful === n.id).short} Check in each day so Ritmo can bring you back at the right pace.</p>}
      <div className="row wrap">
        {paused ? <button className="btn btn-primary btn-small" onClick={() => updateBody({ checkedAt: new Date().toISOString() })}>I have been checked by a professional</button>
          : <button className="btn btn-primary btn-small" onClick={onCheckIn}>Check in</button>}
        {!paused && n && n.pain <= 2 && !b?.rtrStep && <button className="btn btn-small" onClick={() => updateBody({ rtrStep: 1 })}>Start return to run</button>}
        {!paused && n && !b?.rtrStep && painRule(n).level !== 'rest' && (b?.careful === n.id
          ? <button className="btn btn-ghost btn-small" onClick={() => updateBody({ careful: undefined })}>Back to Ritmo's advice</button>
          : <button className="btn btn-small" onClick={() => updateBody({ careful: n.id })}>Be more careful</button>)}
        {!paused && <Link to="/coach?mode=body" className="btn btn-ghost btn-small">Ask about it</Link>}
      </div>
      <p className="caption">{DISCLAIMER}</p>
    </section>
  );
}

/** iPhone Safari only speaks after a tap: a silent word now lets the run's audio cues play later. */
const primeSpeech = () => { try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); } } catch { /* cues are optional */ } };

export default function Today() {
  const { data, today, readinessToday, plan, aRace, aRaceReadiness, analysisFor, buildMyPlan, fitness, stage, paces, zones, handleMissed, athlete, skipSession, hasFlag, typeOf, labelOf, hrIssue, markRebuildSeen } = useApp();
  const niggle = activeNiggle(data.profile.body, today);
  const U = data.profile.units;
  const t = ymd(today);
  const [params] = useSearchParams();
  // From the "Missed key session" reminder: its move-or-skip card is brought into view once
  const scrolledToMissed = useRef(false);
  const [showRebuild, setShowRebuild] = useState(() => params.get('rebuilt') === '1');
  const [selected, setSelected] = useState(() => { const d = params.get('day'); return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : t; });
  const [sheetDay, setSheetDay] = useState<string>();
  const [explaining, setExplaining] = useState(false);
  const [logFor, setLogFor] = useState<PlannedSession | 'free' | null>(null);
  const [planMsg, setPlanMsg] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [unwell, setUnwell] = useState(false);
  const [logSession, setLogSession] = useState<PlannedSession>();
  const [picking, setPicking] = useState(false);
  const [hurts, setHurts] = useState(false);
  const shiftDay = (n: number) => setSelected((d) => ymd(addDays(parseYmd(d), n)));
  // ← and → change the day on a keyboard (not while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) || document.querySelector('.sheet-backdrop')) return;
      if (e.key === 'ArrowLeft') setSelected((d) => ymd(addDays(parseYmd(d), -1)));
      if (e.key === 'ArrowRight') setSelected((d) => ymd(addDays(parseYmd(d), 1)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const swipe = useRef<number | undefined>(undefined);
  const latest = data.activities.length ? data.activities.reduce((m, x) => (x.startTime > m.startTime ? x : m)) : undefined;
  const { run: last } = useRunDetail(latest, data.mode === 'real');
  // Quick run: a small outline button in the header, so today's session card is the only orange block
  const quickButton = <Link to="/run?quick=1" className="btn btn-small btn-outline quick-run-btn" onClick={primeSpeech} aria-label="Quick run: start recording now, no plan needed"><Zap size={16} strokeWidth={2.2} aria-hidden="true" />Quick run</Link>;
  const logButton = <button className="icon-btn" aria-label="Add a run, cross-training, a note or a race" onClick={() => setAdding(true)}><Plus size={24} strokeWidth={2} /></button>;
  const sheet = <>
    {logFor && <LogRunSheet open onClose={() => setLogFor(null)} session={logFor === 'free' ? undefined : logFor} />}
    {logSession && <LogSessionSheet session={logSession} onClose={() => setLogSession(undefined)} />}
    <QuickAdd open={adding} onClose={() => setAdding(false)} />
    {unwell && <NotFeeling onClose={() => setUnwell(false)} />}
  </>;

  if (!data.activities.length && !plan) {
    return (
      <div className="stack-lg">
        <AppHeader title="Training" eyebrow={longDate(today)} avatar right={<><SampleChip />{logButton}</>} />
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

  const ws = startOfWeek(parseYmd(selected));
  const week = Array.from({ length: 7 }, (_, i) => ymd(addDays(ws, i)));
  const ranOn = (d: string) => data.activities.some((a) => a.startTime.slice(0, 10) === d);
  const days = week.map((d) => { const session = plan?.sessions.find((x) => x.date === d); return { date: d, dow: DAY_NAMES[(parseYmd(d).getDay() + 6) % 7], dom: parseYmd(d).getDate(), session, done: ranOn(d), today: d === t, unplanned: ranOn(d) && (!session || session.type === 'rest'), missed: !!session && session.type !== 'rest' && d < t && !ranOn(d) }; });
  const review = parseYmd(selected).getDay() === 0 && selected <= t ? weekReview({ weekStart: ymd(ws), plan, activities: data.activities, units: U }) : undefined;
  const runsHere = data.activities.filter((a) => a.startTime.slice(0, 10) === selected).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const s = plan?.sessions.find((x) => x.date === selected);
  const isToday = selected === t;
  const weekSessions = (plan?.sessions ?? []).filter((x) => week.includes(x.date) && x.type !== 'rest');
  const doneM = athlete.weekM;
  const plannedM = weekSessions.reduce((x, p) => x + p.distanceM, 0);
  const durationBased = weekSessions.length > 0 && plannedM === 0 || weekSessions.some((x) => x.type === 'runwalk');
  const lastAn = last ? analysisFor(last) : undefined;
  const missed = plan ? missedKeySession(plan, today) : undefined;
  const missedTo = plan && missed ? missedMoveOptions(plan, missed.id, today).slice(0, 3) : [];
  const ranHereKm = data.activities.filter((a) => a.startTime.slice(0, 10) === selected).reduce((x, a) => x + a.distanceM, 0);
  const done = s?.completedActivityId ? data.activities.find((a) => a.id === s.completedActivityId) : undefined;
  const phaseNow = plan?.phases.find((p) => p.start <= t && p.end >= t);
  // "Safi 5K · build phase until 22 Nov": what the plan is for and where it is
  const subtitle = [aRace?.name, phaseNow ? `${PHASE_LABEL[phaseNow.phase].toLowerCase()} phase until ${shortDate(parseYmd(phaseNow.end))}` : plan ? `plan until ${shortDate(parseYmd(plan.endDate))}` : longDate(today)].filter(Boolean).join(' · ');
  const ranToday = data.activities.some((a) => a.startTime.slice(0, 10) === t);
  const checkedIn = !!data.profile.checkins?.some((c) => c.date === t);
  // A swapped session: what was run, and how it went, in one line
  const swappedNote = done && s?.status === 'swapped' ? (() => {
    const an = analysisFor(done);
    const rep = buildReport({ a: done, an, planned: an.planned, all: forStats(data.activities), plan, race: aRace, paces, units: U, typeOf, workPace: an.workPace });
    const v = buildVerdict({ a: done, an, rep, paces, zones: done.avgHr ? zones : undefined, units: U, hrSuspect: !!hrIssue });
    return { ran: `You ran ${labelOf(done).split(' · ')[0].toLowerCase().replace(/ run$/, '')} ${dist(done.distanceM, U)} instead · ${pace(done.movingS / (done.distanceM / 1000), U)} · ${duration(done.movingS)} · ${v.title.toLowerCase()}`, next: plan ? swapLine(s, done, plan.sessions) : '' };
  })() : undefined;
  const upcoming = (plan?.sessions ?? []).filter((x) => x.date >= t && x.type !== 'rest');
  const isStarter = plan?.sessions.some((x) => x.type === 'runwalk' || x.type === 'timetrial');

  // Coaching insight: only recent plan changes (they carry their own date), otherwise a note from the last run, dated
  const recentChange = plan?.changes.filter((c) => c.id !== 'built' && daysBetween(new Date(c.at), today) <= 2).sort((a, b) => b.at.localeCompare(a.at))[0];
  const lastRunNote = last && lastAn && daysBetween(new Date(last.startTime), today) <= 7
    ? `From your run on ${longDate(new Date(last.startTime))}: ${lastAn.patternNotes[0] ? `${lastAn.patternNotes[0]} ${lastAn.improve[0]}` : lastAn.wentWell[0]}`
    : undefined;
  const insight = recentChange?.summary ?? lastRunNote;

  const sessionAmount = (x: PlannedSession) => x.distanceM > 0
    ? <div><span className="stat-xl">{plannedNum(x.distanceM, U)}</span><span className="label"> {U}</span></div>
    : <div><span className="stat-xl">{Math.round(x.durationS / 60)}</span><span className="label"> min</span></div>;

  return (
    <div className="stack-lg">
      <AppHeader title="Training" eyebrow={subtitle} avatar right={<><SampleChip />{data.mode === 'real' && quickButton}{logButton}</>} />

      {(plan || data.activities.length > 0) && (
        <div className="stack-sm"
          onTouchStart={(e) => { swipe.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => { const x0 = swipe.current; swipe.current = undefined; if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 60) shiftDay(dx < 0 ? 7 : -7); }}>
          <div className="row-between">
            <button className="icon-btn" aria-label="Previous week" onClick={() => shiftDay(-7)}><ChevronLeft size={22} strokeWidth={2} /></button>
            <div className="row" style={{ gap: 6 }}>
              {!isToday && <button className="chip" onClick={() => setSelected(t)}>Today</button>}
              <button className="chip" aria-haspopup="dialog" onClick={() => setPicking(true)}><CalendarDays size={16} strokeWidth={2} aria-hidden="true" />Pick a date</button>
            </div>
            <button className="icon-btn" aria-label="Next week" onClick={() => shiftDay(7)}><ChevronRight size={22} strokeWidth={2} /></button>
          </div>
          <WeekStrip days={days} selected={selected} onSelect={setSelected} />
          {plan && (() => {
            const text = explainWeek(plan, ymd(startOfWeek(parseYmd(selected))), data.races, data.profile.units);
            if (!text) return null;
            return (
              <div className="stack-sm">
                <button type="button" className="link-btn explain-btn" aria-expanded={explaining} onClick={() => setExplaining((x) => !x)}>
                  <Lightbulb size={16} strokeWidth={2} aria-hidden="true" />{explaining ? 'Hide the explanation' : 'Explain this week'}
                </button>
                {explaining && <p className="explain-week">{text}</p>}
              </div>
            );
          })()}
          <SyncNote />
          {!durationBased && <WeekBar doneM={week.reduce((x, d) => x + data.activities.filter((a) => a.startTime.slice(0, 10) === d).reduce((y, a) => y + a.distanceM, 0), 0)} plannedM={plannedM} thisWeek={ymd(ws) === ymd(startOfWeek(today))} />}
        </div>
      )}
      {/* Strava shoes not matched to a Ritmo shoe yet: asked once (also on Profile › Shoes) */}
      {isToday && (data.profile.shoes?.length ?? 0) > 0 && <GearQuestion />}
      {isToday && (() => {
        const shoes = data.profile.shoes ?? [];
        if (!shoes.length) return null;
        const totals = shoeTotals(data.activities, shoes, typeOf);
        const worn = shoes.map((sh) => ({ sh, km: totals.get(sh.id) ?? 0 })).find(({ sh, km }) => shoeAlert(sh, km));
        if (!worn) return null;
        return <Link to="/profile/shoes" className="banner shoe-alert" role="note"><StatusLine kind="warning">{shoeAlert(worn.sh, worn.km) === 'retire' ? `Time for new shoes: ${worn.sh.name} have done ${Math.round(worn.km)} km` : `${worn.sh.name}: about ${Math.max(0, Math.round(worn.sh.retireKm - worn.km))} km left before they are worn out`}</StatusLine></Link>;
      })()}
      {hasFlag('body') && <BodyCard onCheckIn={() => setHurts(true)} />}
      {hurts && <BodyCheckinSheet onClose={() => setHurts(false)} start={niggle ? { area: niggle.area, side: niggle.side } : undefined} />}
      <Sheet open={picking} onClose={() => setPicking(false)} title="Go to a day">
        <MonthCalendar value={selected} marks={new Set(data.activities.map((a) => a.startTime.slice(0, 10)))} onChange={(d) => { setSelected(d); setPicking(false); }} />
        <p className="caption" style={{ textAlign: 'center' }}>Dots mark days you ran.</p>
      </Sheet>

      {s ? (
        <section className="hero stack" aria-labelledby="session-title">
          <Lanes />
          <div className="hero-top">
            <span className="pill-on-brand">{isToday ? 'Today' : dayTitle(selected, t).replace("'s training", '')}</span>
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
          {swappedNote && (
            <div className="swapped-block stack-sm">
              <span className="tag tag-swapped"><ArrowLeftRight size={14} strokeWidth={2.5} aria-hidden="true" />Swapped</span>
              <p className="swapped-line">{swappedNote.ran}</p>
              {swappedNote.next && <p className="swapped-next">{swappedNote.next}</p>}
            </div>
          )}
          {done && s.status === 'done' && <p className="swapped-line"><span className="tag">Done</span> {dist(done.distanceM, U)} · {pace(done.movingS / (done.distanceM / 1000), U)} · {duration(done.movingS)}</p>}
          {!done && s.type !== 'rest' && selected < t && s.status !== 'skipped' && <p className="label">Did you do this session?</p>}
          {s.status === 'skipped' && <p className="label">You skipped this session.</p>}
          <div className="row wrap">
            {done
              ? <><Link to={`/activity/${done.id}`} className="btn btn-primary">See feedback <ArrowRight size={18} strokeWidth={2} aria-hidden="true" /></Link>
                <Link to={`/coach?q=${encodeURIComponent(`How did my run on ${longDate(new Date(done.startTime))} go?`)}`} className="btn"><MessageCircle size={18} strokeWidth={2} aria-hidden="true" />Ask coach</Link>
                {!swappedNote && <span className="pill-on-brand"><Check size={14} strokeWidth={2.5} aria-hidden="true" /> Linked to your {new Date(done.startTime).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} run</span>}</>
              : isToday && s.type !== 'rest' && s.status === 'planned'
                ? <>
                    <Link to="/run" className="btn btn-primary" onClick={primeSpeech}><Play size={18} strokeWidth={2.2} aria-hidden="true" />Start session</Link>
                    <button className="btn" onClick={() => setSheetDay(s.date)}><ArrowLeftRight size={18} strokeWidth={2} aria-hidden="true" />Swap</button>
                    <button className="btn btn-ghost" onClick={() => setLogSession(s)}><Check size={18} strokeWidth={2} aria-hidden="true" />I’ve done this run</button>
                  </>
              : s.type !== 'rest' && selected <= t && s.status !== 'skipped'
                ? <>
                    <button className="btn btn-primary" onClick={() => setLogSession(s)}><Check size={18} strokeWidth={2} aria-hidden="true" />{selected < t ? 'Log this session' : 'I\u2019ve done this run'}</button>
                    {selected < t && <button className="btn" onClick={() => skipSession(s.id)}>I skipped it</button>}
                    {selected < t && <button className="btn" onClick={() => setAdding(true)}>I did something else</button>}
                  </>
                : null}
            {!done && <Link to={`/session/${s.id}`} className="btn btn-ghost">{s.type === 'rest' ? 'Why rest matters' : selected > t ? 'Move or change' : 'Session details'}</Link>}
            {isToday && s.type !== 'rest' && !done && <Link to="/coach?q=I only have 30 minutes, what should I do?" className="btn btn-ghost">Short on time?</Link>}
            {isToday && <button className="btn btn-ghost" onClick={() => setUnwell(true)}>Not feeling 100%?</button>}
          </div>
        </section>
      ) : plan ? (runsHere.length && upcoming.length ? null : (
        <Empty title={upcoming.length ? 'Nothing planned' : 'Your plan is complete'} action={!upcoming.length && <button className="btn btn-primary" onClick={() => setPlanMsg(buildMyPlan())}>Build my next plan</button>}>
          {upcoming.length ? 'Enjoy the day off. A gentle walk is always fine.' : 'Well done for finishing it. Ritmo can build your next plan from what you have done.'}
        </Empty>
      )) : (
        <Empty title="No plan yet" action={<button className="btn btn-primary" onClick={() => setPlanMsg(buildMyPlan())}>Build my plan</button>}>
          Ritmo builds a plan from your past training, current fitness and goals, then adapts it as you go.
        </Empty>
      )}
      {planMsg && <div role="alert"><StatusLine kind="warning">{planMsg}</StatusLine></div>}

      {/* Readiness, directly under today's session (brief 4A.1), and the optional morning check-in before the first run */}
      {isToday && plan && <ReadinessStrip r={readinessToday} />}
      {isToday && plan && !checkedIn && !ranToday && data.mode === 'real' && new Date().getHours() < 14 && <CheckInCard compact />}

      {/* Sundays: the week in review */}
      {review && (
        <section className="card stack-sm" aria-labelledby="week-review">
          <h2 id="week-review" className="title">{review.title}</h2>
          <ul className="bullets">{review.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        </section>
      )}

      {/* What was actually run on the selected day, planned or not */}
      {runsHere.length > 0 && (
        <section className="card stack-sm" aria-labelledby="ran-here">
          <h2 id="ran-here" className="label">{isToday ? 'Your runs today' : `Your runs on ${longDate(parseYmd(selected))}`}: {dist(runsHere.reduce((x, a) => x + a.distanceM, 0), U)}</h2>
          <DayRuns runs={runsHere} unplanned={!s || s.type === 'rest'} session={s} />
        </section>
      )}

      {missed && (
        <section className="card stack-sm" aria-labelledby="missed" ref={(el) => { if (el && params.get('missed') && !scrolledToMissed.current) { scrolledToMissed.current = true; setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 400); } }}>
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

      <NextRaceCard />
      <RestOfWeek from={isToday ? t : selected < t ? t : selected} />
      <MonthPlan initial={selected} />

      {insight && (
        <section className="card stack-sm" aria-labelledby="insight">
          <div className="row" style={{ gap: 8 }}><Lightbulb size={20} strokeWidth={2} color="var(--accent-mark)" aria-hidden="true" /><h2 id="insight" className="label">Coach</h2></div>
          <p>{insight}</p>
          <Link to="/coach" className="label row" style={{ gap: 4, textDecoration: 'none', minHeight: 44 }}>Ask your coach <ChevronRight size={18} strokeWidth={2} aria-hidden="true" /></Link>
        </section>
      )}

      <SeeMore label="See more: fitness, predictions and last run">

      {!stage.predictions && (
        <section className="card stack-sm" aria-labelledby="unlock">
          <h2 id="unlock" className="label">Unlocking your fitness</h2>
          <div className="row" style={{ alignItems: 'baseline', gap: 8 }}><span className="stat-xl" style={{ fontSize: 32, lineHeight: '36px' }}>{stage.runs}</span><span className="muted label">run{stage.runs === 1 ? '' : 's'} in the last 3 months</span></div>
          <div className="progress" role="progressbar" aria-label="Runs towards pace targets" aria-valuemin={0} aria-valuemax={RUNS_FOR_PACES} aria-valuenow={Math.min(RUNS_FOR_PACES, stage.runs)}><span style={{ width: `${Math.min(100, (stage.runs / RUNS_FOR_PACES) * 100)}%` }} /></div>
          <p className="caption">{stage.next}</p>
        </section>
      )}

      <SectionTitle action={<Link to="/you" className="btn btn-ghost btn-small">You</Link>}>At a glance</SectionTitle>
      <div className="tiles">
        {durationBased
          ? <Tile to="/#month" label="This week" value={weekSessions.filter((x) => x.status === 'done').length} unit={`of ${weekSessions.length}`} sub="sessions done" />
          : <Tile to="/you" label="This week" value={toUnit(doneM, U).toFixed(1)} unit={U} sub={plannedM > 0 ? `of ${toUnit(plannedM, U).toFixed(0)} ${U} planned` : 'run so far'} />}
        {aRaceReadiness && <Tile to={aRace ? `/race/${aRace.id}` : undefined} label="Predicted finish" value={duration(aRaceReadiness.predictedS)} sub={aRace?.goalS ? `Goal ${duration(aRace.goalS)}` : undefined} />}
        {fitness && stage.predictions && <Tile to="/you" label="Fitness (VDOT)" value={fitness.vdot.toFixed(1)} sub={aRaceReadiness ? `Race preparation ${aRaceReadiness.score}` : undefined} />}
        {!stage.predictions && <Tile to="/you" label="Runs logged" value={athlete.runCount} sub={athlete.runCount ? `${dist(athlete.totalM, U)} in total` : 'Your first one is next'} />}
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
      <PlanChanges />
      {showRebuild && <RebuildSheet onClose={() => { setShowRebuild(false); markRebuildSeen(); }} />}
      {data.mode === 'real' && <InstallPrompt />}
      <SessionSheet date={sheetDay} onClose={() => setSheetDay(undefined)} />
      {sheet}
    </div>
  );
}
