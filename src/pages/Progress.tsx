// You (update brief, section 6): Progress and Races.
// Progress: a week, month, year or all-time view with one big total, runs, average pace and time, a bar chart with
// the average marked, personal bests, the way into Insights, and the runs themselves as cards with their plan tag.
// Races: the next race against your goal, adding a race, race predictions and past races.
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Award, Check, ChevronDown, ChevronRight, Flag, Footprints, Info, Plus, Sparkles, TriangleAlert } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader, SampleChip, ZONE_OF } from '../components/app';
import { Empty, Segmented } from '../components/ui';
import { Sheet } from '../components/inputs';
import { QuickAdd } from '../components/QuickAdd';
import { addDays, DAY_SHORT, distanceLabel, duration, MONTHS, MONTHS_LONG, pace, parseYmd, RACE_DISTANCES, startOfWeek, toUnit, weekday, ymd } from '../lib/format';
import { personalBests, raceReadiness } from '../training/insights';
import { predictRace } from '../training/fitness';
import { TYPE_LABEL } from '../training/analysis';
import { forStats } from '../data/quality';
import { isStravaRun } from '../data/strava';
import { garminAttribution } from '../data/garmin';
import type { Activity } from '../lib/types';
import { useRunLongPress } from '../components/DeleteRun';

type P = 'W' | 'M' | 'Y' | 'A';
interface Bar { key: string; label: string; m: number; title: string; today: boolean }

const dayOf = (a: Activity) => a.startTime.slice(0, 10);

/** The bars, title and range for a period starting at `anchor` */
function periodView(p: P, anchor: Date, acts: Activity[], today: Date): { title: string; from: string; to: string; bars: Bar[]; unitWord: string } {
  const t = ymd(today);
  const sumDays = (days: string[]) => days.map((d) => ({ d, m: acts.filter((a) => dayOf(a) === d).reduce((x, a) => x + a.distanceM, 0) }));
  if (p === 'W') {
    const ws = startOfWeek(anchor);
    const days = Array.from({ length: 7 }, (_, i) => ymd(addDays(ws, i)));
    return { title: `Week of ${ws.getDate()} ${MONTHS[ws.getMonth()]} ${ws.getFullYear()}`, from: days[0], to: days[6], unitWord: 'day',
      bars: sumDays(days).map(({ d, m }) => ({ key: d, label: DAY_SHORT[weekday(parseYmd(d))].slice(0, 1), m, title: `${DAY_SHORT[weekday(parseYmd(d))]} ${parseYmd(d).getDate()} ${MONTHS_LONG[parseYmd(d).getMonth()]}`, today: d === t })) };
  }
  if (p === 'M') {
    const y = anchor.getFullYear(), mo = anchor.getMonth(), n = new Date(y, mo + 1, 0).getDate();
    const days = Array.from({ length: n }, (_, i) => ymd(new Date(y, mo, i + 1)));
    return { title: `${MONTHS_LONG[mo]} ${y}`, from: days[0], to: days[n - 1], unitWord: 'day',
      bars: sumDays(days).map(({ d, m }, i) => ({ key: d, label: i === 0 || i === 14 || i === n - 1 ? String(i + 1) : '', m, title: `${i + 1} ${MONTHS_LONG[mo]}`, today: d === t })) };
  }
  if (p === 'Y') {
    const y = anchor.getFullYear();
    return { title: String(y), from: `${y}-01-01`, to: `${y}-12-31`, unitWord: 'month',
      bars: Array.from({ length: 12 }, (_, i) => { const k = `${y}-${String(i + 1).padStart(2, '0')}`; return { key: k, label: MONTHS[i].slice(0, 1), m: acts.filter((a) => a.startTime.startsWith(k)).reduce((x, a) => x + a.distanceM, 0), title: `${MONTHS_LONG[i]} ${y}`, today: t.startsWith(k) }; }) };
  }
  const years = [...new Set(acts.map((a) => a.startTime.slice(0, 4)))].sort();
  const first = Number(years[0] ?? today.getFullYear()), last = today.getFullYear();
  const ys = Array.from({ length: last - first + 1 }, (_, i) => String(first + i));
  return { title: 'All time', from: `${first}-01-01`, to: `${last}-12-31`, unitWord: 'year',
    bars: ys.map((y) => ({ key: y, label: ys.length > 8 && Number(y) % 2 ? '' : `'${y.slice(2)}`, m: acts.filter((a) => a.startTime.startsWith(y)).reduce((x, a) => x + a.distanceM, 0), title: y, today: y === String(last) })) };
}

/** Bars with rounded caps, today's in orange, a dashed average line, y labels on the right */
function PeriodBars({ bars, unit, unitWord }: { bars: Bar[]; unit: 'km' | 'mi'; unitWord: string }) {
  const vals = bars.map((b) => toUnit(b.m, unit));
  const max = Math.max(1, ...vals);
  const withRuns = vals.filter((v) => v > 0);
  const avg = withRuns.length ? withRuns.reduce((x, y) => x + y, 0) / withRuns.length : 0;
  const top = Math.ceil(max / 5) * 5 || 5;
  const W = 320, H = 150, R = 30, plotW = W - R, step = plotW / bars.length, bw = Math.max(3, Math.min(18, step * 0.62));
  const y = (v: number) => H - 18 - (v / top) * (H - 30);
  // The longest bar itself (the scale has a 1 km floor, so short runs never equal `max`)
  const longest = vals.indexOf(Math.max(...vals, 0));
  const summary = withRuns.length ? `Longest ${unitWord} ${vals[longest].toFixed(1)} ${unit} on ${bars[longest].title}. Average ${avg.toFixed(1)} ${unit} per ${unitWord} with runs.` : 'No runs in this period.';
  return (
    <figure className="pbars">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        {[0, top / 2, top].map((v) => <g key={v}><line x1="0" x2={plotW} y1={y(v)} y2={y(v)} className="pbars-grid" /><text x={W - 2} y={y(v) + 4} textAnchor="end" className="pbars-axis">{v % 1 ? v.toFixed(1) : v}</text></g>)}
        {bars.map((b, i) => {
          const v = vals[i];
          if (v <= 0) return null;
          const h = Math.max(bw, (v / top) * (H - 30));
          return <rect key={b.key} x={i * step + (step - bw) / 2} y={H - 18 - h} width={bw} height={h} rx={bw / 2} className={b.today ? 'pbar today' : 'pbar'}><title>{`${b.title}: ${v.toFixed(1)} ${unit}`}</title></rect>;
        })}
        {avg > 0 && <><line x1="0" x2={plotW} y1={y(avg)} y2={y(avg)} className="pbars-avg" /><text x={plotW - 2} y={y(avg) - 4} textAnchor="end" className="pbars-avg-label">avg {avg.toFixed(1)}</text></>}
        {bars.map((b, i) => b.label && <text key={`l${b.key}`} x={i * step + step / 2} y={H - 3} textAnchor="middle" className="pbars-axis">{b.label}</text>)}
      </svg>
      <figcaption className="caption">{summary}</figcaption>
    </figure>
  );
}

/** A tiny route drawing when the run's track is on this device, otherwise a tile for the run type */
function RouteThumb({ a }: { a: Activity }) {
  const { typeOf } = useApp();
  const pts = (a.streams ?? []).filter((p) => p.lat != null && p.lon != null);
  if (pts.length > 5) {
    const lats = pts.map((p) => p.lat!), lons = pts.map((p) => p.lon!);
    const minLa = Math.min(...lats), maxLa = Math.max(...lats), minLo = Math.min(...lons), maxLo = Math.max(...lons);
    const k = Math.cos(((minLa + maxLa) / 2) * Math.PI / 180);
    const span = Math.max((maxLa - minLa) || 1e-6, ((maxLo - minLo) || 1e-6) * k);
    const step = Math.max(1, Math.floor(pts.length / 80));
    const d = pts.filter((_, i) => i % step === 0).map((p, i) => `${i ? 'L' : 'M'}${(6 + (((p.lon! - minLo) * k) / span) * 52).toFixed(1)},${(58 - ((p.lat! - minLa) / span) * 52).toFixed(1)}`).join('');
    return <svg className="run-thumb" viewBox="0 0 64 64" aria-hidden="true"><path d={d} fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  const z = ZONE_OF[typeOf(a)] ?? 2;
  return <span className="run-thumb run-thumb-icon" style={{ color: `var(--zone-${z})` }} aria-hidden="true"><Footprints size={26} strokeWidth={2} /></span>;
}

/** A run as a card: route, date and name, km · pace · time, its plan tag, and the device */
function RunCard({ a, press }: { a: Activity; press: Record<string, unknown> }) {
  const { data, today, plan, sessionOfRun, labelOf, typeOf } = useApp();
  const U = data.profile.units;
  const d = dayOf(a), t = ymd(today);
  const when = d === t ? 'Today' : d === ymd(addDays(today, -1)) ? 'Yesterday' : `${DAY_SHORT[weekday(parseYmd(d))]} ${parseYmd(d).getDate()} ${MONTHS[parseYmd(d).getMonth()]}${d.slice(0, 4) !== t.slice(0, 4) ? ` ${d.slice(0, 4)}` : ''}`;
  const s = sessionOfRun(a.id);
  const tag = s?.status === 'swapped' ? { kind: 'ok', icon: <ArrowLeftRight size={14} strokeWidth={2.5} aria-hidden="true" />, text: labelOf(a) }
    : s?.status === 'done' ? { kind: 'ok', icon: <Check size={14} strokeWidth={2.5} aria-hidden="true" />, text: `${d === t ? "Matched today's plan" : 'Matched your plan'} · ${TYPE_LABEL[typeOf(a)]}` }
    : plan && d >= plan.startDate ? { kind: 'muted', icon: <Plus size={14} strokeWidth={2.5} aria-hidden="true" />, text: 'Extra run · not on your plan' }
    : { kind: 'muted', icon: null, text: TYPE_LABEL[typeOf(a)] };
  const device = a.device ?? (isStravaRun(a) ? 'From Strava' : garminAttribution(a) ?? (a.source === 'ritmo_gps' ? 'Recorded in Ritmo' : a.source === 'manual' ? 'Logged by hand' : a.source === 'upload' ? 'File upload' : undefined));
  return (
    <li>
      <Link to={`/activity/${a.id}`} className="run-card-link" {...press}>
        <RouteThumb a={a} />
        <span className="run-card-body">
          <span className="caption">{when}</span>
          <span className="label run-card-name">{a.name}</span>
          <span className="run-card-nums"><span className="stat">{toUnit(a.distanceM, U).toFixed(2)}<small> {U}</small></span><span className="stat">{pace(a.movingS / (a.distanceM / 1000), U, false)}<small>/{U}</small></span><span className="stat">{duration(a.movingS)}</span></span>
          <span className={`plan-tag ${tag.kind}`}>{tag.icon}{tag.text}</span>
          {device && <span className="run-card-device caption">{device}</span>}
        </span>
        <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
      </Link>
    </li>
  );
}

function ProgressTab() {
  const { data, today } = useApp();
  const U = data.profile.units;
  const acts = useMemo(() => forStats(data.activities), [data.activities]);
  const [p, setP] = useState<P>('M');
  const [anchor, setAnchor] = useState(today);
  const [picking, setPicking] = useState(false);
  const [shown, setShown] = useState(10);
  // Press and hold a run to delete it (update 2, §8)
  const longPress = useRunLongPress();
  const v = useMemo(() => periodView(p, anchor, acts, today), [p, anchor, acts, today]);
  const runs = acts.filter((a) => dayOf(a) >= v.from && dayOf(a) <= v.to).sort((x, y) => y.startTime.localeCompare(x.startTime));
  const totalM = runs.reduce((x, a) => x + a.distanceM, 0), totalS = runs.reduce((x, a) => x + a.movingS, 0);
  const pbs = useMemo(() => personalBests(acts, data.races), [acts, data.races]);
  const tiles = [['5K', '5K'], ['10K', '10K'], ['Half marathon', 'Half']].map(([label, short]) => ({ short, pb: pbs.find((x) => x.label === label) }));
  const recent = (date: string) => (today.getTime() - parseYmd(date).getTime()) / 86400000 <= 30;

  // The periods to choose from, newest first, back to the first run
  const options = useMemo(() => {
    const first = acts.length ? parseYmd(acts.reduce((m, a) => (dayOf(a) < m ? dayOf(a) : m), ymd(today))) : today;
    const out: { label: string; d: Date }[] = [];
    if (p === 'W') for (let d = startOfWeek(today); d >= startOfWeek(first) && out.length < 104; d = addDays(d, -7)) out.push({ label: `Week of ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`, d });
    if (p === 'M') for (let d = new Date(today.getFullYear(), today.getMonth(), 1); d >= new Date(first.getFullYear(), first.getMonth(), 1) && out.length < 120; d = new Date(d.getFullYear(), d.getMonth() - 1, 1)) out.push({ label: `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`, d });
    if (p === 'Y') for (let y = today.getFullYear(); y >= first.getFullYear(); y--) out.push({ label: String(y), d: new Date(y, 0, 1) });
    return out;
  }, [p, acts, today]);

  if (!acts.length) return (
    <Empty title="No runs yet" action={<div className="row wrap"><Link className="btn btn-primary" to="/run">Record a run</Link><Link className="btn" to="/profile/data">Upload my runs</Link></div>}>
      Your distance, personal bests and runs appear here after your first run. Record one, log one by hand, or upload files from a watch.
    </Empty>
  );
  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <Segmented<P> label="Period" value={p} onChange={(x) => { setP(x); setAnchor(today); setShown(10); }} options={[{ value: 'W', label: 'W' }, { value: 'M', label: 'M' }, { value: 'Y', label: 'Y' }, { value: 'A', label: 'All' }]} />
        {p !== 'A'
          ? <button className="period-pick" aria-haspopup="dialog" onClick={() => setPicking(true)}>{v.title}<ChevronDown size={18} strokeWidth={2} aria-hidden="true" /></button>
          : <span className="period-pick">{v.title}</span>}
      </div>
      <section className="stack-sm you-total" aria-label={`${v.title} total`}>
        <span className="you-big">{toUnit(totalM, U).toFixed(totalM / (U === 'km' ? 1000 : 1609.344) >= 1000 ? 0 : 1)}</span>
        <span className="label">{U === 'km' ? 'Kilometres' : 'Miles'}</span>
        <div className="you-stats">
          <div><span className="stat">{runs.length}</span><span className="caption">Runs</span></div>
          <div><span className="stat">{totalM ? pace(totalS / (totalM / 1000), U, false) : '–'}</span><span className="caption">Avg pace /{U}</span></div>
          <div><span className="stat">{duration(totalS)}</span><span className="caption">Time</span></div>
        </div>
      </section>
      <PeriodBars bars={v.bars} unit={U} unitWord={v.unitWord} />

      <section className="stack-sm" aria-labelledby="pb-h">
        <div className="row-between"><h2 id="pb-h" className="title">Personal bests</h2><Link to="/you/records" className="link-row">All records <ChevronRight size={16} strokeWidth={2} aria-hidden="true" /></Link></div>
        <div className="pb-tiles">
          {tiles.map(({ short, pb }) => (
            <Link key={short} to={pb ? `/activity/${pb.activityId}` : '/you/records'} className="pb-tile card">
              <span className="row-between"><span className="label">{short}</span>{pb && recent(pb.date) && <span className="tag-new">New</span>}</span>
              <span className="stat">{pb ? duration(pb.timeS) : '–'}</span>
              <span className="caption">{pb ? `${parseYmd(pb.date).getDate()} ${MONTHS[parseYmd(pb.date).getMonth()]} ${pb.date.slice(0, 4)}` : 'Not yet'}</span>
            </Link>
          ))}
        </div>
      </section>

      <Link to="/you/insights" className="card card-link insights-row">
        <Sparkles size={20} strokeWidth={2} color="var(--accent-mark)" aria-hidden="true" />
        <span className="stack-sm" style={{ gap: 0, flex: 1 }}><span className="label">Insights</span><span className="caption">Training load, zones, threshold pace and race predictions</span></span>
        <ChevronRight size={20} strokeWidth={2} aria-hidden="true" />
      </Link>

      <section className="stack-sm" id="recent" aria-labelledby="recent-h">
        <h2 id="recent-h" className="title">{p === 'A' ? 'Recent activity' : `Runs · ${v.title}`}</h2>
        {runs.length ? <ul className="run-cards">{runs.slice(0, shown).map((a) => <RunCard key={a.id} a={a} press={longPress.bind(a)} />)}</ul> : <p className="muted">No runs in this period.</p>}
        {longPress.sheet}
        {runs.length > shown && <button className="btn" onClick={() => setShown((n) => n + 20)}>Show more ({runs.length - shown})</button>}
      </section>

      <Sheet open={picking} onClose={() => setPicking(false)} title={p === 'W' ? 'Choose a week' : p === 'M' ? 'Choose a month' : 'Choose a year'}>
        <ul className="list period-list">{options.map((o) => (
          <li key={o.label}><button className={`list-item period-opt${o.label === v.title ? ' on' : ''}`} onClick={() => { setAnchor(o.d); setPicking(false); setShown(10); }}>{o.label}{o.label === v.title && <Check size={18} strokeWidth={2.5} aria-hidden="true" />}</button></li>
        ))}</ul>
      </Sheet>
    </div>
  );
}

function RacesTab() {
  const { data, today, aRace, fitness, stage, plan } = useApp();
  const acts = useMemo(() => forStats(data.activities), [data.activities]);
  const [info, setInfo] = useState(false);
  const t = ymd(today);
  const rr = aRace && fitness && stage.predictions ? raceReadiness(aRace, acts, fitness.vdot, today) : undefined;
  const days = aRace ? Math.round((parseYmd(aRace.date).getTime() - parseYmd(t).getTime()) / 86400000) : 0;
  const taper = plan?.phases.find((x) => x.phase === 'taper');
  const behind = rr && aRace?.goalS ? Math.round(rr.predictedS - aRace.goalS) : undefined;
  const pbs = useMemo(() => personalBests(acts, data.races), [acts, data.races]);
  const pbRuns = new Set(pbs.map((x) => x.activityId));
  const past = acts.filter((a) => a.isRace).sort((x, y) => y.startTime.localeCompare(x.startTime));
  const upcoming = data.races.filter((r) => r.date >= t && r.id !== aRace?.id).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="stack-lg">
      {aRace ? (
        <section className="card stack next-race-card" aria-labelledby="next-race-h">
          <div className="row-between"><span className="caption">Next race{aRace.priority === 'A' ? ' · main goal' : ''}</span><span className="tag">{DAY_SHORT[weekday(parseYmd(aRace.date))]} {parseYmd(aRace.date).getDate()} {MONTHS[parseYmd(aRace.date).getMonth()]}</span></div>
          <h2 id="next-race-h" className="title">{aRace.name}</h2>
          <p><span className="you-countdown">{days}</span> <span className="label">{days === 1 ? 'day' : 'days'} to go</span></p>
          <div className="race-vs">
            <div><span className="caption">Your goal</span><span className="stat">{aRace.goalS ? duration(aRace.goalS) : '–'}</span></div>
            <div><span className="caption">Ritmo estimate</span><span className="stat">{rr ? duration(Math.round(rr.predictedS)) : '–'}</span></div>
          </div>
          {behind != null && (behind <= 0
            ? <p className="status status-success"><Check size={18} strokeWidth={2} aria-hidden="true" />On track for your goal{taper && taper.start > t ? ` · taper starts ${parseYmd(taper.start).getDate()} ${MONTHS[parseYmd(taper.start).getMonth()]}` : ''}</p>
            : <p className="status status-warning"><TriangleAlert size={18} strokeWidth={2} aria-hidden="true" />Behind your goal by {duration(behind)}</p>)}
          {!rr && <p className="caption">{stage.predictions ? 'Add a goal time to compare it with Ritmo\'s estimate.' : `Ritmo's estimate appears after a race or time trial. ${stage.next}`}</p>}
          <div className="row wrap"><Link to={`/race/${aRace.id}/day`} className="btn btn-primary">Race plan</Link><Link to={`/race/${aRace.id}`} className="btn">Edit goal</Link></div>
        </section>
      ) : <Empty title="No race yet" action={<Link to="/race/new" className="btn btn-primary">Add a race</Link>}>Add a race and Ritmo builds your plan towards it.</Empty>}

      {aRace && <Link to="/race/new" className="btn" style={{ alignSelf: 'flex-start' }}><Plus size={18} strokeWidth={2} aria-hidden="true" />Add a race</Link>}
      {upcoming.length > 0 && (
        <section className="stack-sm" aria-labelledby="upcoming-h"><h2 id="upcoming-h" className="title">Coming up</h2>
          <ul className="group">{upcoming.map((r) => <li key={r.id}><Link to={`/race/${r.id}`} className="list-item row-between"><span className="stack-sm" style={{ gap: 0 }}><span className="label">{r.name}</span><span className="caption">{distanceLabel(r.distanceM)} · {parseYmd(r.date).getDate()} {MONTHS[parseYmd(r.date).getMonth()]} {r.date.slice(0, 4)}</span></span><span className={`tag ${r.priority === 'A' ? 'tag-accent' : ''}`}>{r.priority}</span></Link></li>)}</ul>
        </section>
      )}

      <section className="stack-sm" aria-labelledby="pred-h">
        <div className="row-between"><h2 id="pred-h" className="title">Race predictions</h2><button className="icon-btn" aria-label="How predictions work" aria-expanded={info} onClick={() => setInfo((x) => !x)}><Info size={20} strokeWidth={2} /></button></div>
        {info && <p className="caption">Based on {fitness?.basedOn ?? 'your recent runs'}, and never slower than a time you have run in the last 8 weeks. Predictions assume you have trained for the distance: the marathon needs long runs behind it.</p>}
        {fitness && stage.predictions ? (
          <div className="pred-grid">{RACE_DISTANCES.map((d) => <div key={d.label} className="card pred-tile"><span className="caption">{d.label === 'Half marathon' ? 'Half' : d.label}</span><span className="stat">{duration(Math.round(predictRace(fitness.vdot, d.m, acts, today).timeS))}</span></div>)}</div>
        ) : <p className="muted">Predictions need a timed effort. Run a 5K time trial or a race and Ritmo predicts your 5K, 10K, half marathon and marathon. {stage.next}</p>}
      </section>

      <section className="stack-sm" aria-labelledby="past-h">
        <div className="row" style={{ gap: 8 }}><Flag size={20} strokeWidth={2} color="var(--accent-mark)" aria-hidden="true" /><h2 id="past-h" className="title">Past races</h2></div>
        {past.length ? <ul className="group">{past.map((a) => (
          <li key={a.id}><Link to={`/activity/${a.id}`} className="list-item row-between"><span className="stack-sm" style={{ gap: 0 }}><span className="label">{a.name}</span><span className="caption">{parseYmd(dayOf(a)).getDate()} {MONTHS[parseYmd(dayOf(a)).getMonth()]} {dayOf(a).slice(0, 4)} · {distanceLabel(a.distanceM)}</span></span>
            <span className="row" style={{ gap: 6 }}>{pbRuns.has(a.id) && <span className="tag-new"><Award size={12} strokeWidth={2.5} aria-hidden="true" />PB</span>}<span className="stat">{duration(a.movingS)}</span></span></Link></li>
        ))}</ul> : <p className="muted">Runs you mark as races appear here. On a run's page, tap "This was a race".</p>}
      </section>
    </div>
  );
}

export default function You() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'races' ? 'races' : 'progress';
  const [adding, setAdding] = useState(false);
  return (
    <div className="stack-lg">
      <AppHeader title="You" avatar right={<><SampleChip /><button className="icon-btn" aria-label="Add a run, cross-training, a note or a race" onClick={() => setAdding(true)}><Plus size={24} strokeWidth={2} /></button></>} />
      <Segmented<'progress' | 'races'> label="Section" value={tab} onChange={(x) => setParams(x === 'races' ? { tab: 'races' } : {}, { replace: true })} options={[{ value: 'progress', label: 'Progress' }, { value: 'races', label: 'Races' }]} />
      {tab === 'progress' ? <ProgressTab /> : <RacesTab />}
      <QuickAdd open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
