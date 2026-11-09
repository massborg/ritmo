// Race-day mode for A races: target splits (even or negative), a warm-up timer, what to eat and when, and after the
// race a report comparing the actual splits with the plan. The result also flows into PBs and the share card.
import { forStats } from '../data/quality';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { useRunDetail } from '../app/useRunDetail';
import { AppHeader } from '../components/app';
import { Chips } from '../components/inputs';
import { Empty, StatusLine } from '../components/ui';
import { distanceLabel, duration, longDate, pace, parseYmd, ymd } from '../lib/format';
import { raceReadiness } from '../training/insights';
import { fuelling, raceReport, targetSplits, warmup, type Strategy, type WarmupStep } from '../training/raceday';

export default function RaceDay() {
  const { id } = useParams();
  const { data, fitness, stage, today } = useApp();
  const race = data.races.find((r) => r.id === id);
  const [strategy, setStrategy] = useState<Strategy>('even');
  const result = race && race.date <= ymd(today)
    ? data.activities.filter((a) => a.startTime.slice(0, 10) === race.date)
      // The run marked as the race first, then the one nearest the race distance, then the most detailed
      .sort((a, b) => Number(!!b.isRace) - Number(!!a.isRace) || Math.abs(a.distanceM - race.distanceM) - Math.abs(b.distanceM - race.distanceM) || b.detailScore - a.detailScore)[0]
    : undefined;
  const { run } = useRunDetail(result, data.mode === 'real');
  if (!race) return <Empty title="Race not found" action={<Link to="/" className="btn">Back to Training</Link>} />;

  const U = data.profile.units;
  const rr = fitness && stage.predictions ? raceReadiness(race, forStats(data.activities), fitness.vdot, today) : undefined;
  const target = race.goalS ?? rr?.predictedS;
  const plan = target ? targetSplits(race.distanceM, target, strategy) : [];
  const report = result && plan.length ? raceReport(run?.streams ?? result.streams, plan) : undefined;
  const past = race.date < ymd(today);

  return (
    <div className="stack-lg race-day">
      <AppHeader title="Race-day mode" eyebrow={`${race.name} · ${longDate(parseYmd(race.date))} · ${distanceLabel(race.distanceM)}`} back large={false} />

      <section className="card stack" aria-labelledby="rd-splits">
        <h2 id="rd-splits" className="title">{target ? `Target splits for ${duration(target)}` : 'Target splits'}</h2>
        {target ? (
          <>
            <p className="caption">{race.goalS ? 'From your goal time.' : 'From your predicted time. Add a goal time to the race to plan around it instead.'}</p>
            <Chips label="Pacing strategy" value={strategy} onChange={setStrategy}
              options={[{ value: 'even', label: 'Even', sub: 'same pace throughout' }, { value: 'negative', label: 'Negative split', sub: 'second half faster' }]} />
            <p className="caption">{strategy === 'even' ? 'The same pace from start to finish: the most efficient way to race, if you resist the fast start.' : 'Start about 1% slower than goal pace and finish about 1% faster. Safer if you tend to fade.'}</p>
            <div className="table-scroll"><table className="data"><thead><tr><th scope="col">Split</th><th scope="col">Pace</th><th scope="col">Clock</th></tr></thead>
              <tbody>{plan.map((r) => <tr key={r.label}><td style={{ fontFamily: 'var(--font-body)' }}>{r.label}</td><td>{pace(r.paceS, U)}</td><td>{duration(r.cumS)}</td></tr>)}</tbody></table></div>
          </>
        ) : <p className="muted">Add a goal time to the race, or log a timed effort so Ritmo can predict one, to get target splits. <Link to={`/race/${race.id}`}>Edit the race</Link>.</p>}
      </section>

      {!past && <WarmupTimer steps={warmup(race.distanceM)} />}

      {!past && (
        <section className="card stack" aria-labelledby="rd-fuel">
          <h2 id="rd-fuel" className="title">What to eat and when</h2>
          <ul className="list">{fuelling(race.distanceM).map((f) => <li key={f.when} className="list-item stack-sm" style={{ alignItems: 'flex-start' }}><span className="label">{f.when}</span><span>{f.what}</span></li>)}</ul>
          <p className="caption">General guidance. Use only what you have practised in training, and follow any advice from your doctor or dietitian.</p>
        </section>
      )}

      {result && (
        <section className="card stack" aria-labelledby="rd-report">
          <h2 id="rd-report" className="title">Race report</h2>
          <div className="row wrap" style={{ gap: 'var(--s5)' }}>
            <div><p className="caption">Result</p><p className="stat-xl" style={{ fontSize: 40, lineHeight: '44px' }}>{duration(result.movingS * (race.distanceM / result.distanceM))}</p></div>
            {target && <div><p className="caption">{race.goalS ? 'Goal' : 'Predicted'}</p><p className="stat">{duration(target)}</p></div>}
          </div>
          {report ? (
            <>
              <p>{report.summary}</p>
              <div className="table-scroll"><table className="data"><thead><tr><th scope="col">Split</th><th scope="col">Plan</th><th scope="col">Actual</th><th scope="col">Difference</th></tr></thead>
                <tbody>{report.rows.map((r) => (
                  <tr key={r.label}><td style={{ fontFamily: 'var(--font-body)' }}>{r.label}</td><td>{duration(r.targetS)}</td><td>{r.actualS != null ? duration(r.actualS) : '–'}</td>
                    <td className={r.diffS == null ? '' : r.diffS <= 0 ? 'diff-fast' : 'diff-slow'}>{r.diffS == null ? '–' : `${r.diffS <= 0 ? '−' : '+'}${Math.round(Math.abs(r.diffS))} s`}</td></tr>
                ))}</tbody></table></div>
            </>
          ) : <p className="muted">{target ? 'This run has no GPS or distance stream, so the splits cannot be compared.' : 'Add a goal time to compare your splits with a plan.'}</p>}
          <p className="caption">Your result counts towards your personal bests and fitness. Share it from the run page.</p>
          <Link to={`/activity/${result.id}`} className="btn" style={{ alignSelf: 'flex-start' }}>Open the run</Link>
        </section>
      )}
      {past && !result && <StatusLine kind="info">No run found on race day yet. Upload it and the race report appears here.</StatusLine>}
    </div>
  );
}

/** Counts down each warm-up step in turn, with a vibration (where supported) when the next step starts. */
function WarmupTimer({ steps }: { steps: WarmupStep[] }) {
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(steps[0].seconds);
  const [running, setRunning] = useState(false);
  const tick = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!running) return;
    tick.current = window.setInterval(() => setLeft((x) => x - 1), 1000);
    return () => window.clearInterval(tick.current);
  }, [running]);
  useEffect(() => {
    if (left > 0) return;
    if (i < steps.length - 1) { setI(i + 1); setLeft(steps[i + 1].seconds); navigator.vibrate?.(300); }
    else { setRunning(false); setLeft(0); navigator.vibrate?.([200, 100, 200]); }
  }, [left, i, steps]);
  const next = () => { if (i < steps.length - 1) { setI(i + 1); setLeft(steps[i + 1].seconds); } };
  const reset = () => { setRunning(false); setI(0); setLeft(steps[0].seconds); };
  const done = i === steps.length - 1 && left === 0;
  const total = steps.reduce((x, s) => x + s.seconds, 0);
  return (
    <section className="card stack" aria-labelledby="rd-warmup">
      <h2 id="rd-warmup" className="title">Warm-up timer</h2>
      <p className="caption">About {Math.round(total / 60)} minutes. Start it so you finish about 5 minutes before the gun.</p>
      <div className="warmup-now" aria-live="polite">
        <span className="label">{done ? 'Warm-up done' : `Step ${i + 1} of ${steps.length}: ${steps[i].label}`}</span>
        <span className="stat-xl" role="timer">{done ? 'Go' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</span>
        {!done && <span className="caption">{steps[i].detail}</span>}
      </div>
      <div className="row wrap">
        {!done && <button className="btn btn-primary" onClick={() => setRunning((x) => !x)}>{running ? <><Pause size={18} strokeWidth={2} aria-hidden="true" />Pause</> : <><Play size={18} strokeWidth={2} aria-hidden="true" />{left < steps[i].seconds || i > 0 ? 'Resume' : 'Start warm-up'}</>}</button>}
        {!done && i < steps.length - 1 && <button className="btn" onClick={next}><SkipForward size={18} strokeWidth={2} aria-hidden="true" />Next step</button>}
        <button className="btn btn-ghost" onClick={reset}><RotateCcw size={18} strokeWidth={2} aria-hidden="true" />Reset</button>
      </div>
      <ol className="warmup-steps">{steps.map((s, k) => <li key={s.label} className={k < i || done ? 'done' : k === i ? 'now' : ''}><span>{s.label}</span><span className="num">{Math.round(s.seconds / 60)} min</span></li>)}</ol>
    </section>
  );
}
