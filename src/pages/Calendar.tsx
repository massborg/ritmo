import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Flag, Plus, RefreshCw } from 'lucide-react';
import { MonthCalendar, Sheet } from '../components/inputs';
import { useApp } from '../app/AppContext';
import { AppHeader, Avatar, SampleChip } from '../components/app';
import { Empty, Segmented, StatusLine } from '../components/ui';
import { addDays, DAY_SHORT, dist, distanceLabel, duration, longDate, MONTHS_LONG, parseYmd, shortDate, startOfWeek, weekday, ymd } from '../lib/format';
import { PHASE_EXPLAIN, PHASE_LABEL } from '../training/plan';
import { TYPE_LABEL } from '../training/analysis';
import type { PlannedSession, SessionType } from '../lib/types';

type View = 'day' | 'week' | 'month';

const typeStyle = (t: SessionType): React.CSSProperties => {
  const z: Partial<Record<SessionType, number>> = { recovery: 1, easy: 2, long: 2, tempo: 3, threshold: 4, hills: 4, vo2max: 5, speed: 5 };
  const zone = z[t];
  return zone ? { borderLeft: `3px solid var(--zone-${zone})` } : t === 'race' ? { background: 'var(--accent)', color: 'var(--on-accent)' } : {};
};

export default function Calendar() {
  const { date } = useParams();
  const nav = useNavigate();
  const { data, plan, today, typeOf, buildMyPlan } = useApp();
  const [view, setView] = useState<View>(date ? 'day' : 'week');
  const [cursor, setCursor] = useState<Date>(date ? parseYmd(date) : today);
  const [picking, setPicking] = useState(false);
  const U = data.profile.units;
  const t = ymd(today);

  const sessionOn = (d: string) => plan?.sessions.find((s) => s.date === d);
  const actsOn = (d: string) => data.activities.filter((a) => a.startTime.slice(0, 10) === d);
  const raceOn = (d: string) => data.races.find((r) => r.date === d);

  const shift = (n: number) => setCursor((c) => (view === 'day' ? addDays(c, n) : view === 'week' ? addDays(c, 7 * n) : new Date(c.getFullYear(), c.getMonth() + n, 1)));
  const title = view === 'day' ? longDate(cursor) : view === 'week' ? `Week of ${shortDate(startOfWeek(cursor))}` : `${MONTHS_LONG[cursor.getMonth()]} ${cursor.getFullYear()}`;

  const DayDetail = ({ d }: { d: string }) => {
    const s = sessionOn(d);
    const acts = actsOn(d);
    const race = raceOn(d);
    return (
      <div className="stack">
        {race && <Link to={`/race/${race.id}`} className="card card-link row-between"><span className="row" style={{ gap: 8 }}><Flag size={18} strokeWidth={2} color="var(--accent-mark)" aria-hidden="true" /><span className="label">{race.name}</span></span><span className="tag tag-accent">{race.priority} race</span></Link>}
        {s && <SessionCard s={s} />}
        {acts.map((a) => (
          <Link key={a.id} to={`/activity/${a.id}`} className="card card-link row-between">
            <span className="stack-sm"><span className="label">{a.name}</span><span className="caption">{TYPE_LABEL[typeOf(a)]}</span></span>
            <span className="stat">{dist(a.distanceM, U)} · {duration(a.movingS)}</span>
          </Link>
        ))}
        {!s && !acts.length && !race && <p className="muted">Nothing planned.</p>}
      </div>
    );
  };

  const SessionCard = ({ s }: { s: PlannedSession }) => (
    <Link to={`/session/${s.id}`} className="card card-link stack-sm" style={typeStyle(s.type)}>
      <div className="row-between">
        <span className="label">{s.title}</span>
        {s.status === 'done' ? <StatusLine kind="success">Done</StatusLine> : s.status === 'missed' ? <StatusLine kind="warning">Missed</StatusLine> : <span className="caption">{s.focus}</span>}
      </div>
      {s.type !== 'rest' && <span className="caption">{dist(s.distanceM, U, 0)} · {s.steps.map((x) => x.label).join(', ')}</span>}
    </Link>
  );

  const ws = startOfWeek(cursor);
  const weekDays = Array.from({ length: 7 }, (_, i) => ymd(addDays(ws, i)));
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(monthStart);
  const monthDays = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const upcomingRaces = data.races.filter((r) => r.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  const pastRaces = data.races.filter((r) => r.date < t).sort((a, b) => b.date.localeCompare(a.date));
  const phaseNow = plan?.phases.find((p) => p.start <= t && p.end >= t);

  return (
    <div className="stack-lg">
      <AppHeader title="Calendar" right={<><SampleChip /><Avatar /></>} />
      <div className="row-between">
        <Segmented<View> label="Calendar view" value={view} onChange={setView} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
        <button className="chip" onClick={() => setCursor(today)}>Today</button>
      </div>

      <section className="stack" aria-labelledby="cal-title">
        <div className="cal-nav">
          <button className="icon-btn" aria-label="Previous" onClick={() => shift(-1)}><ChevronLeft size={22} strokeWidth={2} /></button>
          <button id="cal-title" className="cal-nav-title" aria-live="polite" aria-haspopup="dialog" aria-label={`${title}. Choose a date`} onClick={() => setPicking(true)}><CalendarDays size={18} strokeWidth={2} aria-hidden="true" />{title}</button>
          <button className="icon-btn" aria-label="Next" onClick={() => shift(1)}><ChevronRight size={22} strokeWidth={2} /></button>
        </div>

        {view === 'day' && <DayDetail d={ymd(cursor)} />}

        {view === 'week' && (
          <div className="card">
            <ul className="list">
              {weekDays.map((d, i) => {
                const s = sessionOn(d);
                const acts = actsOn(d);
                const race = raceOn(d);
                return (
                  <li key={d}>
                    <button className="week-row" style={{ width: '100%', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer' }} onClick={() => { setCursor(parseYmd(d)); setView('day'); }}>
                      <span className="stack-sm" style={{ gap: 0 }}>
                        <span className="label" style={{ color: d === t ? 'var(--brand)' : undefined }}>{DAY_SHORT[i]}</span>
                        <span className="caption">{parseYmd(d).getDate()}</span>
                      </span>
                      <span className="stack-sm" style={{ gap: 2 }}>
                        <span className="label">{race ? race.name : s ? s.title : 'Nothing planned'}</span>
                        <span className="caption">{acts.length ? `${acts.map((a) => dist(a.distanceM, U)).join(' + ')} done` : s && s.type !== 'rest' ? `${dist(s.distanceM, U, 0)} · ${s.focus}` : ''}</span>
                      </span>
                      <span>{acts.length ? <span className="status status-success"><Check size={18} strokeWidth={2} aria-hidden="true" /><span className="sr-only">Done</span></span> : s?.status === 'missed' ? <span className="caption">Missed</span> : null}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {view === 'month' && (
          <div className="stack-sm">
            <div className="cal-month" aria-hidden="true">{DAY_SHORT.map((d) => <span key={d} className="caption" style={{ textAlign: 'center' }}>{d}</span>)}</div>
            <div className="cal-month" role="grid" aria-label={title}>
              {monthDays.map((d) => {
                const k = ymd(d);
                const s = sessionOn(k);
                const acts = actsOn(k);
                const race = raceOn(k);
                return (
                  <button key={k} role="gridcell" className={`cal-cell${d.getMonth() !== cursor.getMonth() ? ' other' : ''}${k === t ? ' today' : ''}`}
                    aria-label={`${longDate(d)}: ${race ? race.name : s ? s.title : 'nothing planned'}${acts.length ? ', run done' : ''}`}
                    onClick={() => { setCursor(d); setView('day'); }}>
                    <span className="caption" style={{ color: 'var(--ink)' }}>{d.getDate()}</span>
                    {race ? <span className="cal-pill" style={typeStyle('race')}><span className="pill-long">{race.name}</span><span className="pill-short">Race</span></span>
                      : s && s.type !== 'rest' ? <span className="cal-pill" style={typeStyle(s.type)}><span className="pill-long">{s.focus}</span><span className="pill-short">{(s.distanceM / (U === 'km' ? 1000 : 1609.344)).toFixed(0)}</span></span> : null}
                    {acts.length > 0 && <span className="row caption" style={{ gap: 2, color: 'var(--success)' }}><Check size={12} strokeWidth={2.5} aria-hidden="true" />{(acts.reduce((x, a) => x + a.distanceM, 0) / (U === 'km' ? 1000 : 1609.344)).toFixed(0)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <div className="grid-2">
        <section className="card stack" aria-labelledby="races">
          <div className="row-between"><h2 id="races" className="title">Races</h2><button className="btn btn-small" onClick={() => nav('/race/new')}><Plus size={18} strokeWidth={2} aria-hidden="true" />Add race</button></div>
          {upcomingRaces.length === 0 && <p className="muted">No races yet. Add one and your plan will build towards it.</p>}
          <ul className="list">
            {upcomingRaces.map((r) => (
              <li key={r.id}><Link to={`/race/${r.id}`} className="list-item row-between">
                <span className="stack-sm" style={{ gap: 0 }}><span className="label">{r.name}</span><span className="caption">{distanceLabel(r.distanceM)} · {shortDate(parseYmd(r.date))}</span></span>
                <span className={`tag ${r.priority === 'A' ? 'tag-accent' : ''}`}>{r.priority}</span>
              </Link></li>
            ))}
          </ul>
          {pastRaces.length > 0 && <details><summary className="label" style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>Past races ({pastRaces.length})</summary>
            <ul className="list">{pastRaces.map((r) => <li key={r.id}><Link to={`/race/${r.id}`} className="list-item row-between"><span>{r.name}</span><span className="caption">{shortDate(parseYmd(r.date))}</span></Link></li>)}</ul>
          </details>}
        </section>

        <section className="card stack" aria-labelledby="plan">
          <div className="row-between"><h2 id="plan" className="title">Training plan</h2>
            <button className="btn btn-small" onClick={buildMyPlan}><RefreshCw size={18} strokeWidth={2} aria-hidden="true" />{plan ? 'Rebuild' : 'Build my plan'}</button></div>
          {!plan ? <Empty title="No plan yet">Build a plan from your history, fitness, races and available days.</Empty> : (
            <>
              <div className="row" style={{ gap: 2 }} role="img" aria-label={plan.phases.map((p) => `${PHASE_LABEL[p.phase]} from ${p.start}`).join(', ')}>
                {plan.phases.map((p) => {
                  const days = (parseYmd(p.end).getTime() - parseYmd(p.start).getTime()) / 86400000 + 1;
                  const active = p === phaseNow;
                  return <div key={p.start} title={PHASE_LABEL[p.phase]} style={{ flex: days, height: 12, borderRadius: 6, background: active ? 'var(--brand)' : p.phase === 'recovery' ? 'var(--surface-sunken)' : 'var(--border)', opacity: p.end < t ? 0.45 : 1 }} />;
                })}
              </div>
              {phaseNow && <p><strong>{PHASE_LABEL[phaseNow.phase]}</strong> until {shortDate(parseYmd(phaseNow.end))}. {PHASE_EXPLAIN[phaseNow.phase]}</p>}
              <p className="caption">{shortDate(parseYmd(plan.startDate))} to {shortDate(parseYmd(plan.endDate))}. Tap any session to see its purpose or move it to another day.</p>
            </>
          )}
        </section>
      </div>

      <Sheet open={picking} onClose={() => setPicking(false)} title="Go to date">
        <MonthCalendar value={ymd(cursor)} marks={new Set((plan?.sessions ?? []).filter((x) => x.type !== 'rest').map((x) => x.date).concat(data.races.map((r) => r.date)))} onChange={(d) => { setCursor(parseYmd(d)); setView('day'); setPicking(false); }} />
        <p className="caption" style={{ textAlign: 'center' }}>Dots mark planned sessions and races.</p>
      </Sheet>
      <button className="fab" aria-label="Add race" onClick={() => nav('/race/new')}><Plus size={26} strokeWidth={2} /></button>

      {plan && plan.changes.length > 0 && (
        <section className="card stack" aria-labelledby="changes">
          <h2 id="changes" className="title">Plan changes</h2>
          <p className="caption">Every change Ritmo makes is explained here.</p>
          <ul className="list">
            {[...plan.changes].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12).map((c) => (
              <li key={c.id} className="stack-sm" style={{ padding: 'var(--s3) 0' }}>
                <span className="caption">{shortDate(new Date(c.at))} · {weekday(new Date(c.at)) >= 0 ? { missed: 'Missed session', harder: 'Harder than planned', easier: 'Easier than planned', illness: 'Illness', 'race-date': 'Race date', moved: 'Moved', rebuilt: 'Plan update', pain: 'Pain logged' }[c.reason] : ''}</span>
                <span>{c.summary}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
