import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Award } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { BarChart } from '../components/charts';
import { Kpi, Lanes } from '../components/ui';
import { dist, duration, MONTHS_LONG, parseYmd, shortDate, toUnit } from '../lib/format';
import { runningStory } from '../training/insights';
import { estimateFitness, predictTime } from '../training/fitness';
import { forStats } from '../data/quality';

export default function Story() {
  const { data, today, hr, stage } = useApp();
  const [params] = useSearchParams();
  const setup = params.get('setup') === '1';
  const U = data.profile.units;
  const st = useMemo(() => runningStory(forStats(data.activities), today), [data.activities, today]);
  const trend = useMemo(() => st.years.map((y) => {
    const end = new Date(Number(y.year), 11, 31);
    const f = estimateFitness(forStats(data.activities), hr, end > today ? today : end);
    return { year: y.year, tenK: f ? predictTime(f.vdot, 10000) : undefined };
  }), [st.years, data.activities, hr, today]);
  if (!st.totalRuns) return (
    <div className="stack-lg"><h1 className="display-lg">Your running story</h1>
      <div className="card stack"><p className="muted">Your story builds as you run: total distance, biggest weeks, streaks and personal bests. Log your first run or upload your history to start it.</p>
        <div className="row wrap"><Link to="/" className="btn btn-primary">Log a run</Link><Link to="/profile/data" className="btn">Upload my runs</Link></div></div>
    </div>
  );
  const bm = st.biggestMonth ? `${MONTHS_LONG[Number(st.biggestMonth.month.slice(5)) - 1]} ${st.biggestMonth.month.slice(0, 4)}` : '';
  const first10 = trend.find((t) => t.tenK), last10 = [...trend].reverse().find((t) => t.tenK);

  return (
    <div className="stack-lg" style={{ maxWidth: 860, margin: '0 auto' }}>
      {setup && <p className="caption">Step 2 of 3</p>}
      <section className="hero stack">
        <Lanes />
        <p className="label">Your running story</p>
        <p className="stat-xl">{dist(st.totalM, U, 0)}</p>
        <p className="body">across {st.totalRuns} runs and {Math.round(st.totalS / 3600)} hours since {st.firstDate ? shortDate(new Date(st.firstDate)) : ''}.</p>
      </section>

      <div className="grid-3">
        <div className="card"><Kpi label="Biggest year" value={st.biggestYear ? dist(st.biggestYear.m, U, 0) : '–'} sub={st.biggestYear?.year} /></div>
        <div className="card"><Kpi label="Biggest month" value={st.biggestMonth ? dist(st.biggestMonth.m, U, 0) : '–'} sub={bm} /></div>
        <div className="card"><Kpi label="Longest run" value={st.longest ? dist(st.longest.distanceM, U) : '–'} sub={st.longest ? shortDate(new Date(st.longest.startTime)) : ''} /></div>
        <div className="card"><Kpi label="Active weeks" value={`${st.activeWeeksPct}%`} sub="weeks with at least one run" /></div>
        <div className="card"><Kpi label="Longest streak" value={`${st.longestStreakWeeks} weeks`} sub="in a row" /></div>
        <div className="card"><Kpi label="Current streak" value={`${st.currentStreakWeeks} weeks`} /></div>
      </div>

      <section className="card stack">
        <h2 className="title">Year by year</h2>
        <BarChart bars={st.years.map((y) => ({ label: y.year, value: toUnit(y.m, U), highlight: y.year === st.biggestYear?.year }))} format={(v) => `${v.toFixed(0)} ${U}`} />
        {stage.predictions && first10?.tenK && last10?.tenK && first10.year !== last10.year && (
          <p>{last10.tenK < first10.tenK ? `Your estimated 10K has improved from ${duration(first10.tenK)} in ${first10.year} to ${duration(last10.tenK)} in ${last10.year}.` : `Your estimated 10K is ${duration(last10.tenK)}, compared with ${duration(first10.tenK)} in ${first10.year}.`}</p>
        )}
      </section>

      <section className="card stack">
        <div className="row" style={{ gap: 8 }}><Award size={20} strokeWidth={2} color="var(--accent-mark)" aria-hidden="true" /><h2 className="title">Personal bests</h2></div>
        {st.pbs.length === 0 && <p className="muted">Personal bests appear once you have run 5 km or more in one go.</p>}
        <div className="grid-3">{st.pbs.map((p) => <Kpi key={p.label} label={p.label} value={duration(p.timeS)} sub={shortDate(parseYmd(p.date))} />)}</div>
      </section>

      {setup ? <Link to="/goals?setup=1" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Set my goals</Link> : <Link to="/you" className="btn" style={{ alignSelf: 'flex-start' }}>Back to You</Link>}
    </div>
  );
}
