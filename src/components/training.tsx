// Training screen parts (update brief, sections 4 and 4A): this week's progress, the readiness strip and morning
// check-in, the next-race card, the rest of the week, the month calendar, the session sheet and the plan changes.
// The calendar's features live here now: drag a session to another day in the same week (press and hold on phones),
// or tap a session and choose a day.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, ChevronLeft, ChevronRight, Flag, RefreshCw } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Sheet } from './inputs';
import { StatusLine } from './ui';
import { ZONE_OF } from './app';
import { addDays, DAY_SHORT, dist, distanceLabel, duration, localise, longDate, MONTHS_LONG, parseYmd, shortDate, startOfWeek, toUnit, weekday, ymd } from '../lib/format';
import { moveClash, moveTargets, PHASE_EXPLAIN, PHASE_LABEL } from '../training/plan';
import { useDragMove } from '../lib/useDragMove';
import { keptPlanToday, type ReadinessScore } from '../training/readiness';
import { canRestore } from '../training/rebuild';
import { findDuplicates } from '../data/quality';
import { relTime } from '../lib/format';
import type { PlannedSession } from '../lib/types';
import { plannedNum, sessionAmount } from '../training/session-view';
import { EditSession } from './EditSession';
import { StrengthCard } from './StrengthSession';

const BAND_COLOUR = { recover: 'var(--danger)', easy: 'var(--warning)', hard: 'var(--success)' } as const;
const dayName = (d: string) => `${DAY_SHORT[weekday(parseYmd(d))]} ${parseYmd(d).getDate()}`;

/** "This week  16.3 / 100 km" with a bar */
export function WeekBar({ doneM, plannedM, thisWeek }: { doneM: number; plannedM: number; thisWeek?: boolean }) {
  const { data, weekTarget: wt } = useApp();
  const U = data.profile.units;
  // Never past 100%: anything over the target is said in words
  const pct = plannedM > 0 ? Math.min(100, (doneM / plannedM) * 100) : 0;
  const over = plannedM > 0 ? doneM - plannedM : 0;
  const n = (m: number) => plannedNum(m, U);
  return (
    <div className="week-bar" aria-label="This week">
      <div className="row-between"><span className="label">This week</span><span className="stat">{toUnit(doneM, U).toFixed(1)}{plannedM > 0 ? ` / ${n(plannedM)}` : ''} <small>{U}</small></span></div>
      {plannedM > 0 && <div className="week-bar-track" role="progressbar" aria-label="Distance this week" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}><span style={{ width: `${pct}%` }} /></div>}
      {over >= 100 && <p className="caption week-over">+{n(over)} {U} over this week's target</p>}
      {thisWeek && wt.lowered && plannedM > 0 && <p className="caption week-why">Lowered from {n(wt.originalM)} {U} on {new Date(wt.lowered.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} because {wt.lowered.because}. <a href="#changes" onClick={(e) => { e.preventDefault(); const el = document.getElementById('changes'); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); el?.closest('section')?.querySelector('details')?.setAttribute('open', ''); }}>Why?</a></p>}
    </div>
  );
}

/** The three-zone bar with a marker at the score */
export function ReadinessBar({ score, labels }: { score: number; labels?: boolean }) {
  return (
    <div className="stack-sm" style={{ gap: 4 }}>
      <div className="rd-bar" aria-hidden="true">
        <span className="rd-seg rd-recover" /><span className="rd-seg rd-easy" /><span className="rd-seg rd-hard" />
        <span className="rd-marker" style={{ left: `${score}%` }} />
      </div>
      {labels && <div className="rd-bar-labels caption" aria-hidden="true"><span>Recover</span><span>Easy day</span><span>Ready for hard</span></div>}
    </div>
  );
}

/** Readiness, minimal (4A.1): caption, score, band word, chevron, the bar and one line, plus a swap link when
 *  readiness and today's plan disagree. Tapping the strip opens the breakdown. */
export function ReadinessStrip({ r }: { r: ReadinessScore }) {
  const nav = useNavigate();
  const { today } = useApp();
  const swap = r.swap && !keptPlanToday(today) ? r.swap : undefined;
  if (r.score == null) return <div className="card rd-strip" role="status"><StatusLine kind="info">{r.unavailable}</StatusLine></div>;
  return (
    <div className="card rd-strip">
      <Link to="/readiness" className="rd-strip-main" aria-label={`Readiness ${r.score}, ${r.word}. ${r.line} See what's behind it.`}>
        <span className="row-between">
          <span className="row" style={{ gap: 8, alignItems: 'baseline' }}>
            <span className="caption">Readiness</span>
            <span className="rd-score">{r.score}</span>
            <span className="rd-word" style={{ color: BAND_COLOUR[r.band] }}>{r.word}</span>
          </span>
          <ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
        </span>
        <ReadinessBar score={r.score} />
      </Link>
      <div className="row-between rd-strip-line">
        <span className="caption">{r.line}</span>
        {swap && <button className="link-btn rd-swap" onClick={() => nav(`/session/${swap.sessionId}?swap=${swap.kind}`)}>{swap.label}</button>}
      </div>
    </div>
  );
}

const PILLS = { sleep: ['Poor', 'Fair', 'Okay', 'Good', 'Great'], legs: ['Sore', 'Heavy', 'Okay', 'Fresh', 'Bouncy'], energy: ['Low', 'Fair', 'Okay', 'Good', 'Great'] } as const;

/** Optional morning check-in (4A.3): sleep, legs and energy, 1–5. Never blocks anything. */
export function CheckInCard({ onDone, compact }: { onDone?: () => void; compact?: boolean }) {
  const { data, today, updateProfile } = useApp();
  const t = ymd(today);
  const had = data.profile.checkins?.find((c) => c.date === t);
  const [open, setOpen] = useState(!compact);
  const [v, setV] = useState({ sleep: had?.sleep ?? 0, legs: had?.legs ?? 0, energy: had?.energy ?? 0 });
  const ready = v.sleep > 0 && v.legs > 0 && v.energy > 0;
  const save = () => {
    const keep = (data.profile.checkins ?? []).filter((c) => c.date !== t && c.date >= ymd(addDays(today, -14)));
    updateProfile({ checkins: [...keep, { date: t, ...v }] });
    onDone?.();
  };
  if (!open) {
    return (
      <div className="card row-between checkin-prompt">
        <span className="caption">How are you this morning? A quick check-in makes readiness more accurate.</span>
        <button className="btn btn-small" onClick={() => setOpen(true)}>Check in</button>
      </div>
    );
  }
  return (
    <section className="card stack checkin" aria-labelledby="checkin-h">
      <h2 id="checkin-h" className="title">Morning check-in</h2>
      {(['sleep', 'legs', 'energy'] as const).map((k) => (
        <div key={k} className="stack-sm">
          <span className="label" id={`ci-${k}`}>{k === 'sleep' ? 'Sleep' : k === 'legs' ? 'Legs' : 'Energy'}</span>
          <div className="ci-pills" role="radiogroup" aria-labelledby={`ci-${k}`}>
            {PILLS[k].map((label, i) => (
              <button key={label} type="button" role="radio" aria-checked={v[k] === i + 1} className={`chip${v[k] === i + 1 ? ' chip-on' : ''}`} onClick={() => setV((x) => ({ ...x, [k]: i + 1 }))}>{label}</button>
            ))}
          </div>
        </div>
      ))}
      <div className="row wrap">
        <button className="btn btn-primary" disabled={!ready} onClick={save}>Save</button>
        {compact && <button className="btn btn-ghost" onClick={() => setOpen(false)}>Not now</button>}
        <Link to="/profile#ill" className="link-btn" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Ill or injured?</Link>
      </div>
    </section>
  );
}

/** Next race: name, date, goal and days to go */
export function NextRaceCard() {
  const { data, aRace, today } = useApp();
  if (!aRace) return null;
  const days = Math.round((parseYmd(aRace.date).getTime() - parseYmd(ymd(today)).getTime()) / 86400000);
  const d = parseYmd(aRace.date);
  return (
    <Link to={`/race/${aRace.id}`} className="card card-link row-between next-race" aria-label={`${aRace.name}, ${longDate(d)}${aRace.goalS ? `, goal ${duration(aRace.goalS)}` : ''}. ${days} days to go`}>
      <span className="row" style={{ gap: 12 }}>
        <Flag size={22} strokeWidth={2} color="var(--accent-mark)" aria-hidden="true" />
        <span className="stack-sm" style={{ gap: 0 }}>
          <span className="label">{aRace.name}</span>
          <span className="caption">{DAY_SHORT[weekday(d)]} {d.getDate()} {MONTHS_LONG[d.getMonth()].slice(0, 3)}{aRace.goalS ? ` · goal ${duration(aRace.goalS)}` : ` · ${distanceLabel(aRace.distanceM)}`}</span>
        </span>
      </span>
      <span className="stack-sm" style={{ gap: 0, alignItems: 'flex-end' }}><span className="stat" style={{ fontSize: 22 }}>{days}</span><span className="caption">{days === 1 ? 'day' : 'days'} to go</span></span>
      {data.races.length > 1 && <span className="sr-only">{data.races.length} races planned</span>}
    </Link>
  );
}

/** Moving sessions: the same rules for drag and drop and for the day buttons, with an undo. */
function useMover() {
  const { plan, today, moveSession } = useApp();
  const t = ymd(today);
  const [askMove, setAskMove] = useState<{ id: string; to: string }>();
  const [moveMsg, setMoveMsg] = useState<{ text: string; undo?: { id: string; to: string } }>();
  const doMove = (id: string, to: string) => {
    const s = plan?.sessions.find((x) => x.id === id);
    if (!s) return;
    moveSession(id, to);
    setAskMove(undefined);
    setMoveMsg({ text: `Moved ${s.title.toLowerCase()} to ${dayName(to)}.`, undo: { id, to: s.date } });
  };
  const tryMove = (id: string, to: string) => {
    const s = plan?.sessions.find((x) => x.id === id);
    if (!plan || !s || to === s.date) return;
    if (!moveTargets(s, today).includes(to)) { setMoveMsg({ text: to < t ? 'Sessions cannot move into the past.' : 'Sessions can move to another day in the same week.' }); return; }
    if (moveClash(plan, s, to)) { setAskMove({ id, to }); return; }
    doMove(id, to);
  };
  const ui = (
    <>
      {moveMsg && (
        <div role="status" className="row-between card" style={{ padding: 'var(--s2) var(--s3)' }}>
          <span>{moveMsg.text}</span>
          <span className="row" style={{ gap: 4 }}>
            {moveMsg.undo && <button className="btn btn-ghost btn-small" onClick={() => { moveSession(moveMsg.undo!.id, moveMsg.undo!.to); setMoveMsg(undefined); }}>Undo</button>}
            <button className="btn btn-ghost btn-small" onClick={() => setMoveMsg(undefined)}>Dismiss</button>
          </span>
        </div>
      )}
      <Sheet open={!!askMove} onClose={() => setAskMove(undefined)} title="Two hard days in a row?"
        footer={<div className="row" style={{ gap: 8 }}><button className="btn btn-block" onClick={() => setAskMove(undefined)}>Keep it where it is</button><button className="btn btn-primary btn-block" onClick={() => askMove && doMove(askMove.id, askMove.to)}>Move anyway</button></div>}>
        <p>That puts two hard days back to back. Hard sessions work best with an easier day between them. If you move it anyway, take the second one a little easier.</p>
      </Sheet>
    </>
  );
  return { tryMove, ui };
}

/** A day's session: purpose, details, move to another day, swap. Opened from the week list and the month calendar. */
export function SessionSheet({ date, onClose }: { date?: string; onClose: () => void }) {
  const { data, plan, today, swap } = useApp();
  const { tryMove, ui } = useMover();
  const [editing, setEditing] = useState(false);
  const U = data.profile.units;
  if (!date) return ui;
  const s = plan?.sessions.find((x) => x.date === date);
  const runs = data.activities.filter((a) => a.startTime.slice(0, 10) === date);
  const race = data.races.find((r) => r.date === date);
  const targets = s ? moveTargets(s, today) : [];
  const phase = plan?.phases.find((p) => p.start <= date && p.end >= date);
  const open = s && s.status === 'planned' && s.type !== 'rest' && s.type !== 'race';
  return (
    <>
      {ui}
      <Sheet open onClose={onClose} title={longDate(parseYmd(date))}>
        <div className="stack">
          {race && <Link to={`/race/${race.id}`} className="row" style={{ gap: 8 }}><Flag size={18} strokeWidth={2} color="var(--accent-mark)" aria-hidden="true" /><span className="label">{race.name}</span></Link>}
          {s ? (
            <div className="stack-sm">
              <div className="row-between"><h3 className="title">{s.title}</h3><StatusChip s={s} /></div>
              {s.edited && <span className="tag edited-tag" style={{ alignSelf: 'flex-start' }}>Your version</span>}
              {s.type !== 'rest' && <p className="caption">{sessionAmount(s, U)} · {s.focus}{phase ? ` · ${PHASE_LABEL[phase.phase]} phase` : ''}</p>}
              <p>{s.purpose}</p>
              {s.strengthPlan && <StrengthCard session={s} compact />}
              {s.type !== 'rest' && s.steps.length > 0 && <ol className="ol-steps caption">{s.steps.map((st, i) => <li key={i}><strong style={{ color: 'var(--ink)' }}>{localise(st.label, U)}</strong> {localise(st.detail ?? '', U)}</li>)}</ol>}
            </div>
          ) : !runs.length && !race ? <p className="muted">Nothing planned.</p> : null}
          {runs.map((a) => <Link key={a.id} to={`/activity/${a.id}`} className="card card-link row-between"><span className="label">{a.name}</span><span className="stat">{dist(a.distanceM, U)}</span></Link>)}
          {open && <button className="btn btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing(true)}>Edit this session</button>}
          {open && targets.length > 0 && (
            <div className="stack-sm">
              <span className="label">Move to</span>
              <div className="row wrap" style={{ gap: 6 }}>{targets.map((d) => <button key={d} className="chip" onClick={() => { tryMove(s.id, d); onClose(); }}>{dayName(d)}</button>)}</div>
            </div>
          )}
          {open && (
            <div className="stack-sm">
              <span className="label">Swap</span>
              <div className="row wrap" style={{ gap: 6 }}>
                <button className="chip" onClick={() => { swap(s.id, 'shorter'); onClose(); }}>Make it shorter</button>
                {s.type !== 'easy' && s.type !== 'recovery' && <button className="chip" onClick={() => { swap(s.id, 'easy'); onClose(); }}>Easy run instead</button>}
                {['threshold', 'vo2max', 'tempo', 'hills'].includes(s.type) && <button className="chip" onClick={() => { swap(s.id, 'similar'); onClose(); }}>Something similar</button>}
                <button className="chip" onClick={() => { swap(s.id, 'treadmill'); onClose(); }}>Treadmill version</button>
              </div>
            </div>
          )}
          {s && <Link to={`/session/${s.id}`} className="btn btn-small" style={{ alignSelf: 'flex-start' }}>Full details</Link>}
          {plan && <p className="caption">Plan: {shortDate(parseYmd(plan.startDate))} to {shortDate(parseYmd(plan.endDate))}.</p>}
        </div>
      </Sheet>
      {s && editing && <EditSession session={s} open onClose={() => { setEditing(false); onClose(); }} />}
    </>
  );
}

function StatusChip({ s }: { s: PlannedSession }) {
  if (s.status === 'done') return <span className="status-chip done">Done</span>;
  if (s.status === 'swapped') return <span className="status-chip swapped"><ArrowLeftRight size={12} strokeWidth={2.5} aria-hidden="true" />Swapped</span>;
  if (s.status === 'missed') return <span className="status-chip missed">Missed</span>;
  if (s.status === 'skipped') return <span className="status-chip missed">Skipped</span>;
  return s.type === 'rest' ? <span className="status-chip">Rest</span> : <span className="status-chip planned">Planned</span>;
}

/** The rest of the week: day, title, detail and zone; drag to another day, or tap to open the session sheet */
export function RestOfWeek({ from }: { from: string }) {
  const { data, plan, today } = useApp();
  const U = data.profile.units;
  const [open, setOpen] = useState<string>();
  const { tryMove, ui } = useMover();
  const { drag, handle, swallowClick } = useDragMove(tryMove);
  const ws = startOfWeek(parseYmd(from));
  const days = Array.from({ length: 7 }, (_, i) => ymd(addDays(ws, i))).filter((d) => d > from);
  const dragged = drag ? plan?.sessions.find((x) => x.id === drag.id) : undefined;
  const targets = new Set(dragged ? moveTargets(dragged, today) : []);
  const dropClass = (d: string) => (!drag ? '' : d === drag.over ? (targets.has(d) ? 'drop-over' : 'drop-no') : targets.has(d) ? 'drop-ok' : '');
  if (!plan || !days.length) return null;
  return (
    <section className="stack-sm" aria-labelledby="rest-week">
      <h2 id="rest-week" className="title">Rest of the week</h2>
      {ui}
      <ul className="group rest-week" onClickCapture={swallowClick}>
        {days.map((d) => {
          const s = plan.sessions.find((x) => x.date === d);
          const ran = data.activities.some((a) => a.startTime.slice(0, 10) === d);
          const z = s ? ZONE_OF[s.type] : undefined;
          const canDrag = !!s && s.type !== 'rest' && s.status === 'planned' && !ran && moveTargets(s, today).length > 0;
          return (
            <li key={d} data-drop-date={d} className={dropClass(d) || undefined}>
              <button className="rw-row" onClick={() => setOpen(d)} {...(canDrag ? handle(s!.id, s!.title) : {})}>
                <span className="rw-day"><span className="label">{DAY_SHORT[weekday(parseYmd(d))]}</span><span className="caption">{parseYmd(d).getDate()}</span></span>
                <span className="rw-main"><span className="label">{s ? s.title : 'Nothing planned'}</span>{s && s.type !== 'rest' && <span className="caption">{sessionAmount(s, U)}</span>}</span>
                {z ? <span className="zone-chip"><span className={`zone-dot z${z}`} aria-hidden="true" />Z{z}</span> : s?.type === 'rest' ? <span className="caption">Rest</span> : null}
                <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="caption">Drag a session to another day this week (press and hold on a phone), or tap it to move or swap it.</p>
      {drag && <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">{drag.label}{drag.over && drag.over !== dragged?.date ? ` → ${dayName(drag.over)}` : ''}</div>}
      <SessionSheet date={open} onClose={() => setOpen(undefined)} />
    </section>
  );
}

/** The month calendar (replaces the Calendar tab): Monday first, a mark under each day, tap a day for its session */
export function MonthPlan({ initial }: { initial?: string }) {
  const { data, plan, today } = useApp();
  const t = ymd(today);
  const [cursor, setCursor] = useState(() => { const d = initial ? parseYmd(initial) : today; return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [open, setOpen] = useState<string>();
  const { tryMove, ui } = useMover();
  const { drag, handle, swallowClick } = useDragMove(tryMove);
  const dragged = drag ? plan?.sessions.find((x) => x.id === drag.id) : undefined;
  const targets = new Set(dragged ? moveTargets(dragged, today) : []);
  const dropClass = (d: string) => (!drag ? '' : d === drag.over ? (targets.has(d) ? ' drop-over' : ' drop-no') : targets.has(d) ? ' drop-ok' : '');
  const gridStart = startOfWeek(cursor);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const title = `${MONTHS_LONG[cursor.getMonth()]} ${cursor.getFullYear()}`;
  const shift = (n: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));
  return (
    <section className="card stack month-plan" id="month" aria-labelledby="month-title">
      <div className="cal-nav">
        <button className="icon-btn" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft size={22} strokeWidth={2} /></button>
        <h2 id="month-title" className="title" aria-live="polite">{title}</h2>
        <button className="icon-btn" aria-label="Next month" onClick={() => shift(1)}><ChevronRight size={22} strokeWidth={2} /></button>
      </div>
      {ui}
      <div className="mp-grid" aria-hidden="true">{DAY_SHORT.map((d) => <span key={d} className="caption mp-dow">{d.slice(0, 1)}</span>)}</div>
      <div className="mp-grid" role="grid" aria-label={title} onClickCapture={swallowClick}>
        {cells.map((d) => {
          const k = ymd(d);
          const s = plan?.sessions.find((x) => x.date === k);
          const ran = data.activities.some((a) => a.startTime.slice(0, 10) === k);
          const race = data.races.find((r) => r.date === k);
          const done = ran || s?.status === 'done' || s?.status === 'swapped';
          const planned = !done && !!s && s.type !== 'rest' && s.status === 'planned';
          const canDrag = !!s && s.type !== 'rest' && s.status === 'planned' && !ran && !race && moveTargets(s, today).length > 0;
          return (
            <button key={k} role="gridcell" data-drop-date={k} className={`mp-cell${d.getMonth() !== cursor.getMonth() ? ' other' : ''}${k === t ? ' today' : ''}${dropClass(k)}`}
              aria-label={`${longDate(d)}: ${race ? race.name : s ? s.title : 'nothing planned'}${done ? ', done' : ''}`}
              onClick={() => setOpen(k)} {...(canDrag ? handle(s!.id, s!.title) : {})}>
              <span className="mp-num">{d.getDate()}</span>
              <span className={`mp-dot${race ? ' race' : done ? ' done' : planned ? ' planned' : ''}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="mp-legend caption" aria-hidden="true">
        <span><span className="mp-dot done" />Done</span><span><span className="mp-dot planned" />Planned</span><span><span className="mp-dot race" />Race</span><span><span className="mp-today-key" />Today</span>
      </div>
      {drag && <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">{drag.label}{drag.over && drag.over !== dragged?.date ? ` → ${dayName(drag.over)}` : ''}</div>}
      <SessionSheet date={open} onClose={() => setOpen(undefined)} />
    </section>
  );
}

const REASON: Record<string, string> = { missed: 'Missed session', harder: 'Harder than planned', easier: 'Easier than planned', illness: 'Illness', 'race-date': 'Race date', moved: 'Moved', rebuilt: 'Plan update', pain: 'Pain logged', paces: 'Paces updated', edited: 'Your change' };

/** Plan changes: collapsed, with the latest change visible. Also the plan itself (phases, races, rebuild). */
export function PlanChanges() {
  const { data, plan, today, rebuildMyPlan, restorePreviousPlan, weekTarget: wt } = useApp();
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const t = ymd(today);
  if (!plan) return null;
  const changes = [...plan.changes].sort((a, b) => b.at.localeCompare(a.at));
  const latest = changes[0];
  const phaseNow = plan.phases.find((p) => p.start <= t && p.end >= t);
  const races = data.races.filter((r) => r.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <section className="card stack-sm plan-changes" aria-labelledby="changes">
      <h2 id="changes" className="title">Plan changes</h2>
      <p className="caption">Every change Ritmo makes is explained here.</p>
      {wt.m > 0 && <p className="week-target-line"><span className="label">This week's target: {plannedNum(wt.m, data.profile.units)} {data.profile.units}</span>{wt.lowered && <span className="caption"> · lowered from {plannedNum(wt.originalM, data.profile.units)} {data.profile.units} on {new Date(wt.lowered.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} because {wt.lowered.because}</span>}</p>}
      {latest && <p><span className="caption">{shortDate(new Date(latest.at))} · {REASON[latest.reason] ?? ''}</span><br />{latest.summary}</p>}
      {canRestore(data.plan) && <div className="row wrap" style={{ gap: 8 }}><button className="btn btn-small" onClick={restorePreviousPlan}>Restore previous plan</button><span className="caption">Available for 24 hours after a rebuild.</span></div>}
      <details className="plan-more">
        <summary className="label">{changes.length > 1 ? `All changes and your plan (${changes.length})` : 'Your plan'}</summary>
        <ul className="list">
          {changes.slice(1, 12).map((c) => (
            <li key={c.id} className="stack-sm" style={{ padding: 'var(--s3) 0' }}>
              <span className="caption">{shortDate(new Date(c.at))} · {REASON[c.reason] ?? ''}</span>
              <span>{c.summary}</span>
            </li>
          ))}
        </ul>
        <div className="stack-sm" style={{ marginTop: 'var(--s3)' }}>
          <div className="row" style={{ gap: 2 }} role="img" aria-label={plan.phases.map((p) => `${PHASE_LABEL[p.phase]} from ${p.start}`).join(', ')}>
            {plan.phases.map((p) => {
              const days = (parseYmd(p.end).getTime() - parseYmd(p.start).getTime()) / 86400000 + 1;
              return <div key={p.start} title={PHASE_LABEL[p.phase]} style={{ flex: days, height: 10, borderRadius: 5, background: p === phaseNow ? 'var(--brand)' : p.phase === 'recovery' ? 'var(--surface-sunken)' : 'var(--border)', opacity: p.end < t ? 0.45 : 1 }} />;
            })}
          </div>
          {phaseNow && <p className="caption"><strong style={{ color: 'var(--ink)' }}>{PHASE_LABEL[phaseNow.phase]}</strong> until {shortDate(parseYmd(phaseNow.end))}. {PHASE_EXPLAIN[phaseNow.phase]}</p>}
          <p className="caption">{shortDate(parseYmd(plan.startDate))} to {shortDate(parseYmd(plan.endDate))}.</p>
          {races.length > 0 && <p className="caption">Races: {races.map((r) => <Link key={r.id} to={`/race/${r.id}`} className="label" style={{ marginRight: 8 }}>{r.name}</Link>)}</p>}
          <div className="row wrap">
            <button className="btn btn-small" disabled={busy} aria-busy={busy} onClick={() => { setBusy(true); setMsg(undefined); setTimeout(() => { const r = rebuildMyPlan(); setBusy(false); if (r.ok) nav('/?rebuilt=1'); else setMsg(r.message); }, 50); }}><RefreshCw size={18} strokeWidth={2} aria-hidden="true" />{busy ? 'Rebuilding your plan…' : 'Rebuild plan'}</button>
            <button className="btn btn-small btn-ghost" onClick={() => nav('/race/new')}>Add race</button>
          </div>
          {msg && <div role="alert"><StatusLine kind="warning">{msg}</StatusLine></div>}
        </div>
      </details>
    </section>
  );
}

/** After a rebuild: what the new plan looks like and what changed against the old one */
export function RebuildSheet({ onClose }: { onClose: () => void }) {
  const { data, plan, restorePreviousPlan } = useApp();
  const U = data.profile.units;
  const r = data.plan?.rebuild;
  if (!plan || !r) return null;
  return (
    <Sheet open onClose={onClose} title="Your plan is rebuilt"
      footer={<div className="row" style={{ gap: 8, width: '100%' }}>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>Done</button>
        {canRestore(data.plan) && <button className="btn" onClick={() => { restorePreviousPlan(); onClose(); }}>Restore previous plan</button>}
      </div>}>
      <div className="stack">
        <div className="rebuild-stats">
          <div><span className="stat">{r.weeks}</span><span className="caption">week{r.weeks === 1 ? '' : 's'}</span></div>
          <div><span className="stat">{toUnit(r.firstWeekKm * 1000, U).toFixed(0)}{r.peakKm > r.firstWeekKm ? `–${toUnit(r.peakKm * 1000, U).toFixed(0)}` : ''}</span><span className="caption">{U} a week</span></div>
          <div><span className="stat">{r.changed}</span><span className="caption">session{r.changed === 1 ? '' : 's'} changed</span></div>
        </div>
        <p>The new plan starts {longDate(parseYmd(r.startDate))}. Past sessions and your runs are unchanged{r.unchanged ? `, and ${r.unchanged} upcoming session${r.unchanged === 1 ? ' stays' : 's stay'} the same` : ''}.</p>
        {r.notes.map((n) => <StatusLine key={n} kind="info">{n}</StatusLine>)}
        {r.keyThisWeek.length > 0 && (
          <div className="stack-sm">
            <span className="label">Key sessions this week</span>
            <ul className="list">{r.keyThisWeek.map((k) => <li key={k.date + k.title} className="row-between" style={{ padding: '6px 0' }}><span>{DAY_SHORT[weekday(parseYmd(k.date))]} · {k.title}</span><span className="stat">{dist(k.km * 1000, U)}</span></li>)}</ul>
          </div>
        )}
        <p className="caption">The change is logged in Plan changes. You can restore the previous plan for 24 hours.</p>
      </div>
    </Sheet>
  );
}

/** A short note on Training when Strava sync failed or is over a day old, or a run looks like it is in twice */
export function SyncNote() {
  const { data, today, syncStravaNow, stravaSyncing } = useApp();
  if (data.mode !== 'real') return null;
  const st = data.sources.find((x) => x.kind === 'strava' && x.connected);
  const stale = st && (!st.lastSyncAt || today.getTime() - new Date(st.lastSyncAt).getTime() > 24 * 3600e3);
  const weekAgo = ymd(addDays(today, -14));
  const dup = findDuplicates(data.activities).find(([x]) => x.startTime.slice(0, 10) >= weekAgo);
  if (!st?.lastError && !stale && !dup) return null;
  return (
    <div className="stack-sm">
      {st && (st.lastError || stale) && (
        <div className="banner row-between wrap" role="status" style={{ gap: 8 }}>
          <StatusLine kind="warning">{st.lastError ? 'Strava sync failed' : `Strava last synced ${st.lastSyncAt ? relTime(st.lastSyncAt) : 'a while ago'}`}</StatusLine>
          <button className="btn btn-small" disabled={stravaSyncing} onClick={() => void syncStravaNow(true)}>{stravaSyncing ? 'Syncing…' : 'Sync now'}</button>
        </div>
      )}
      {dup && (
        <Link to="/profile/data#dups" className="banner row-between" role="note" style={{ gap: 8, textDecoration: 'none', color: 'inherit' }}>
          <StatusLine kind="info">{`The same run may be in twice on ${DAY_SHORT[weekday(new Date(dup[0].startTime))]} ${new Date(dup[0].startTime).getDate()}: it counts double in your week`}</StatusLine>
          <span className="label">Check</span>
        </Link>
      )}
    </div>
  );
}
