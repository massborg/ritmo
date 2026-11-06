import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Flame, Lock, Share2 } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader, Avatar, SampleChip } from '../components/app';
import { BarChart, LineChart } from '../components/charts';
import { Empty, Kpi, Segmented, ZoneBar } from '../components/ui';
import { addDays, daysBetween, duration, MONTHS, MONTHS_LONG, parseYmd, shortDate, startOfWeek, toUnit, ymd } from '../lib/format';
import { easyHardBalance, monthKey, personalBests, runningStory, totalsBy, weekKey } from '../training/insights';
import { PHASE_LABEL } from '../training/plan';
import { estimateFitness, predictRace } from '../training/fitness';
import { zoneTime } from '../training/analysis';

type Period = 'week' | 'month' | 'year';

export default function Progress() {
  const { data, today, typeOf, series, zones, hr, updateProfile, stage, plan, fitness } = useApp();
  const U = data.profile.units;
  const acts = data.activities;
  const [period, setPeriod] = useState<Period>('week');
  const years = useMemo(() => [...new Set(acts.map((a) => a.startTime.slice(0, 4)))].sort().reverse(), [acts]);
  const [year, setYear] = useState(String(today.getFullYear()));

  const story = useMemo(() => runningStory(acts, today), [acts, today]);
  const pbs = useMemo(() => personalBests(acts), [acts]);

  // Mileage bars
  const bars = useMemo(() => {
    const u = (m: number) => toUnit(m, U);
    if (period === 'week') {
      const wk = totalsBy(acts, weekKey);
      const out = [];
      const ws = startOfWeek(today);
      for (let i = 15; i >= 0; i--) {
        const d = addDays(ws, -7 * i);
        const ly = startOfWeek(addDays(d, -364));
        out.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value: u(wk.get(ymd(d))?.m ?? 0), compare: u(wk.get(ymd(ly))?.m ?? 0), highlight: i === 0, title: `Week of ${ymd(d)}` });
      }
      return out;
    }
    if (period === 'month') {
      const mo = totalsBy(acts, monthKey);
      return Array.from({ length: 12 }, (_, m) => {
        const k = `${year}-${String(m + 1).padStart(2, '0')}`;
        const lk = `${Number(year) - 1}-${String(m + 1).padStart(2, '0')}`;
        return { label: MONTHS[m], value: u(mo.get(k)?.m ?? 0), compare: u(mo.get(lk)?.m ?? 0), highlight: k === ymd(today).slice(0, 7), title: `${MONTHS_LONG[m]} ${year}` };
      });
    }
    return [...story.years].map((y) => ({ label: y.year, value: u(y.m), highlight: y.year === String(today.getFullYear()) }));
  }, [period, acts, U, today, year, story.years]);

  // Same period last year
  const ytd = (y: number) => acts.filter((a) => a.startTime.slice(0, 4) === String(y) && a.startTime.slice(5, 10) <= ymd(today).slice(5, 10)).reduce((x, a) => x + a.distanceM, 0);
  const thisYtd = ytd(today.getFullYear()), lastYtd = ytd(today.getFullYear() - 1);

  // Long runs: longest per month, last 18 months
  const longRuns = useMemo(() => {
    const labels: string[] = [], vals: (number | null)[] = [];
    for (let i = 17; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const k = ymd(d).slice(0, 7);
      const m = acts.filter((a) => a.startTime.startsWith(k)).reduce((x, a) => Math.max(x, a.distanceM), 0);
      labels.push(MONTHS[d.getMonth()]);
      vals.push(m ? toUnit(m, U) : null);
    }
    return { labels, vals };
  }, [acts, today, U]);

  // Zones and balance over last 4 weeks
  const last28 = acts.filter((a) => { const d = daysBetween(new Date(a.startTime), today); return d >= 0 && d < 28; });
  const zt = last28.filter((a) => a.streams).reduce((acc, a) => zoneTime(a.streams!, zones).map((v, i) => v + acc[i]), [0, 0, 0, 0, 0]);
  const balance = easyHardBalance({ activities: acts, typeOf, sessions: (plan?.sessions ?? []).map((x) => ({ ...x, phase: PHASE_LABEL[x.phase].toLowerCase() })), today });
  const easyPct = balance?.easyPct ?? 0;

  // Training load (last 120 days, weekly samples)
  const loadSlice = series.slice(-120).filter((_, i, arr) => (arr.length - 1 - i) % 7 === 0);

  // Estimated race times over time: monthly, last 24 months
  const est = useMemo(() => {
    const labels: string[] = [], five: (number | null)[] = [], ten: (number | null)[] = [], half: (number | null)[] = [], mar: (number | null)[] = [];
    for (let i = 23; i >= 0; i -= 1) {
      const d = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
      const at = d > today ? today : d;
      const f = estimateFitness(acts, hr, at, data.races);
      labels.push(`${MONTHS[d.getMonth()]}${d.getMonth() === 0 ? ` ${String(d.getFullYear()).slice(2)}` : ''}`);
      const pr = (m: number) => (f ? predictRace(f.vdot, m, acts, at).timeS / 60 : null);
      five.push(pr(5000)); ten.push(pr(10000)); half.push(pr(21097.5)); mar.push(pr(42195));
    }
    return { labels, five, ten, half, mar };
  }, [acts, today, hr, data.races]);

  if (!acts.length) return (
    <div className="stack-lg">
      <AppHeader title="Progress" right={<><SampleChip /><Avatar /></>} />
      <Empty title="No runs yet" action={<div className="row wrap"><Link className="btn btn-primary" to="/">Log a run on Today</Link><Link className="btn" to="/profile/data">Upload my runs</Link></div>}>
        Your distance, streaks and personal bests appear here after your first run. Log one by hand, or upload files from a watch.
      </Empty>
    </div>
  );
  const Locked = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="card stack-sm"><div className="row" style={{ gap: 8 }}><Lock size={18} strokeWidth={2} aria-hidden="true" /><h2 className="title">{title}</h2></div><p className="muted">{children}</p><p className="caption">{stage.next}</p></section>
  );

  const fmtU = (v: number) => v.toFixed(0);
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);

  return (
    <div className="stack-lg">
      <AppHeader title="Progress" right={<><SampleChip /><Avatar /></>} />
      <div className="row">
        <Segmented label="Units" value={U} onChange={(u) => updateProfile({ units: u })} options={[{ value: 'km', label: 'km' }, { value: 'mi', label: 'miles' }]} />
      </div>

      <section className="card stack" aria-labelledby="mileage">
        <div className="row-between wrap">
          <h2 id="mileage" className="title">Mileage</h2>
          <Segmented<Period> label="Period" value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }, { value: 'year', label: 'Yearly' }]} />
        </div>
        {period === 'month' && (
          <div className="row wrap" role="group" aria-label="Year">
            {years.map((y) => <button key={y} className="chip" aria-pressed={y === year} onClick={() => setYear(y)}>{y}</button>)}
          </div>
        )}
        <BarChart bars={bars} format={(v) => `${v.toFixed(0)} ${U}`} valueLabel={period === 'year' ? `${U} per year` : period === 'month' ? year : 'This year'} compareLabel={period === 'year' ? undefined : period === 'month' ? String(Number(year) - 1) : 'Same week last year'} every={period === 'week' ? 2 : 1} />
        <div className="grid-3">
          <Kpi label={`${today.getFullYear()} so far`} value={`${fmtU(toUnit(thisYtd, U))} ${U}`} sub={lastYtd ? `${thisYtd >= lastYtd ? '+' : ''}${Math.round(((thisYtd - lastYtd) / lastYtd) * 100)}% on the same point last year` : undefined} />
          <Kpi label="Lifetime" value={`${fmtU(toUnit(story.totalM, U))} ${U}`} sub={`${story.totalRuns} runs`} />
          <Kpi label="Biggest year" value={story.biggestYear ? `${fmtU(toUnit(story.biggestYear.m, U))} ${U}` : '–'} sub={story.biggestYear?.year} />
        </div>
      </section>

      <div className="grid-2">
        <section className="card stack" aria-labelledby="consistency">
          <div className="row" style={{ gap: 8 }}><Flame size={20} strokeWidth={2} color="var(--accent-mark)" aria-hidden="true" /><h2 id="consistency" className="title">Consistency</h2></div>
          <div className="grid-3">
            <Kpi label="Current streak" value={`${story.currentStreakWeeks} wk`} sub="weeks with a run" />
            <Kpi label="Longest streak" value={`${story.longestStreakWeeks} wk`} />
            <Kpi label="Active weeks" value={`${story.activeWeeksPct}%`} sub="since you started" />
          </div>
        </section>
        <section className="card stack" aria-labelledby="balance">
          <h2 id="balance" className="title">Easy and hard balance</h2>
          <p className="caption">Last 4 weeks, by time</p>
          <div className="row" style={{ alignItems: 'baseline', gap: 8 }}><span className="stat-xl" style={{ fontSize: 40, lineHeight: '44px' }}>{easyPct}%</span><span className="label muted">easy</span></div>
          <div className="zone-bar" role="img" aria-label={`${easyPct}% easy, ${100 - easyPct}% hard`}><span className="z2" style={{ width: `${easyPct}%` }} /><span className="z4" style={{ width: `${100 - easyPct}%` }} /></div>
          {balance?.plannedEasyPct != null && <p className="caption">Your plan for these weeks: {balance.plannedEasyPct}% easy.</p>}
          <p>{balance ? balance.message : 'No runs in the last 4 weeks.'}</p>
        </section>
      </div>

      <div className="grid-2">
        <section className="card stack" aria-labelledby="zones"><h2 id="zones" className="title">Time in each zone</h2><p className="caption">Last 4 weeks, runs with heart rate</p>{zt.some((v) => v > 0) ? <ZoneBar seconds={zt} /> : <p className="muted">{acts.some((a) => a.avgHr) ? 'No heart rate data in the last 4 weeks.' : 'Zones need heart rate from a watch or chest strap. Upload a file from your watch to see them.'}</p>}</section>
        <section className="card stack" aria-labelledby="long"><h2 id="long" className="title">Long-run progress</h2><p className="caption">Longest run each month, {U}</p><LineChart series={[{ name: 'Longest run', values: longRuns.vals, color: 'var(--brand)' }]} labels={longRuns.labels} every={3} /></section>
      </div>

      {stage.predictions ? (
      <section className="card stack" aria-labelledby="load">
        <h2 id="load" className="title">Training load</h2>
        <p className="caption">Fitness is your 6-week average load, fatigue your 1-week average, and form the difference. Form between –10 and –25 is productive training; below that, rest.</p>
        <LineChart labels={loadSlice.map((d) => `${parseYmd(d.date).getDate()}/${parseYmd(d.date).getMonth() + 1}`)} every={3}
          series={[{ name: 'Fitness', values: loadSlice.map((d) => d.ctl), color: 'var(--ink)' }, { name: 'Fatigue', values: loadSlice.map((d) => d.atl), color: 'var(--brand)' }, { name: 'Form', values: loadSlice.map((d) => d.tsb), color: 'var(--info)', dashed: true }]} />
      </section>
      ) : <Locked title="Training load">Fitness, fatigue and form need a few weeks of runs and a known fitness level. Until then they would only be guesses, so Ritmo keeps them hidden.</Locked>}

      <div className="grid-2">
        <section className="card stack" aria-labelledby="pbs">
          <div className="row" style={{ gap: 8 }}><Award size={20} strokeWidth={2} color="var(--accent-mark)" aria-hidden="true" /><h2 id="pbs" className="title">Personal bests</h2></div>
          {pbs.length === 0 && <p className="muted">Personal bests appear once you have run 5 km or more in one go.</p>}
          <ul className="list">{pbs.map((p) => (
            <li key={p.label}><Link to={`/activity/${p.activityId}`} className="list-item row-between"><span className="stack-sm" style={{ gap: 0 }}><span className="label">{p.label}</span><span className="caption">{shortDate(parseYmd(p.date))}{p.fromRace ? ' · race' : ' · in training'}</span></span><span className="stat" style={{ fontSize: 20 }}>{duration(p.timeS)}</span></Link></li>
          ))}</ul>
        </section>
{stage.predictions ? (
        <section className="card stack" aria-labelledby="est">
          <h2 id="est" className="title">Estimated race times</h2>
          <p className="caption">Minutes, last 24 months. Lower is faster. Now based on {fitness?.basedOn ?? 'your recent runs'}, and never slower than a time you have run in the last 8 weeks.</p>
          <LineChart labels={est.labels} every={4} format={(v) => duration(v * 60).replace(/:\d\d$/, '')} series={[{ name: 'Half marathon', values: est.half, color: 'var(--brand)' }, { name: '10K', values: est.ten, color: 'var(--ink)' }]} />
          <div className="grid-3">
            {[['5K', est.five], ['10K', est.ten], ['Half', est.half], ['Marathon', est.mar]].map(([l, v]) => {
              const arr = (v as (number | null)[]).filter((x): x is number => x != null);
              return <Kpi key={l as string} label={l as string} value={arr.length ? duration(arr[arr.length - 1] * 60) : '–'} sub={arr.length > 12 ? `${arr[arr.length - 1] < arr[arr.length - 13] ? '' : '+'}${duration(Math.abs(arr[arr.length - 1] - arr[arr.length - 13]) * 60)} vs a year ago` : undefined} />;
            })}
          </div>
        </section>
        ) : <Locked title="Estimated race times">Race predictions are based on a timed effort. Run a 5K time trial or a race and Ritmo will predict your 5K, 10K, half marathon and marathon times.</Locked>}
      </div>

      <section className="band row-between wrap">
        <div className="stack-sm"><h2 className="title">Your reviews</h2><p className="muted">Shareable summaries of your month and year.</p></div>
        <div className="row wrap">
          <Link className="btn" style={{ color: 'var(--on-graphite)', borderColor: 'var(--on-graphite)' }} to={`/review/${ymd(lastMonth).slice(0, 7)}`}><Share2 size={18} strokeWidth={2} aria-hidden="true" />{MONTHS_LONG[lastMonth.getMonth()]}</Link>
          <Link className="btn" style={{ color: 'var(--on-graphite)', borderColor: 'var(--on-graphite)' }} to={`/review/${today.getFullYear()}`}><Share2 size={18} strokeWidth={2} aria-hidden="true" />{today.getFullYear()}</Link>
          <Link className="btn" style={{ color: 'var(--on-graphite)', borderColor: 'var(--on-graphite)' }} to="/story">Your running story</Link>
        </div>
      </section>
    </div>
  );
}
