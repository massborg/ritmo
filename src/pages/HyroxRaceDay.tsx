// HYROX race day (update 4, task 7): a pace for each of the 8 runs, each station's target and one tip, a warm-up,
// and then the splits: record the race live, or enter the official times afterwards.
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { HYROX_WARMUP, hyroxSessions, predictHyrox, racePacing } from '../hyrox/predict';
import { clock } from '../hyrox/hyrox';
import { divisionLabel } from '../hyrox/hyroxDivisions';
import { longDate, pace, parseYmd, ymd } from '../lib/format';

export default function HyroxRaceDay() {
  const { data, paces, today } = useApp();
  const h = data.profile.hyrox ?? {};
  const U = data.profile.units;
  const thresholdS = paces ? Math.round((paces.threshold[0] + paces.threshold[1]) / 2) : undefined;
  const pacing = racePacing(data.profile, thresholdS);
  const pred = predictHyrox(data.profile, thresholdS);
  const t = ymd(today);
  const raced = hyroxSessions(data.profile).filter((x) => x.isRace && (!h.raceDate || x.startedAt.slice(0, 10) >= h.raceDate)).pop();
  const days = h.raceDate ? Math.round((parseYmd(h.raceDate).getTime() - parseYmd(t).getTime()) / 86400000) : undefined;
  const runTotal = pacing ? pacing.runs.reduce((a, r) => a + r.paceS, 0) : 0;
  return (
    <div className="stack-lg hyrox-race-day" style={{ maxWidth: 720 }}>
      <AppHeader title="HYROX race day" back large={false} />
      <p className="caption hrd-when">{[divisionLabel(h.division ?? 'men_open'), h.raceDate ? longDate(parseYmd(h.raceDate)) : undefined, days != null && days >= 0 ? (days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} to go`) : undefined].filter(Boolean).join(' · ')}</p>
      {raced && (
        <Link to={`/hyrox/session/${raced.id}`} className="card card-link row-between"><span className="stack-sm" style={{ gap: 0 }}><span className="label">Your result</span><span className="caption">See your splits</span></span><span className="stat-xl" style={{ fontSize: 32 }}>{clock(raced.totalMs)}</span></Link>
      )}
      <section className="card stack-sm" aria-labelledby="hrd-plan">
        <h2 id="hrd-plan" className="title">{h.goalS ? `Your plan for ${clock(h.goalS * 1000)}` : pred ? `Your plan: about ${clock(pred.totalS * 1000)}` : 'Your plan'}</h2>
        {pacing ? <p className="caption">{h.goalS ? 'From your goal time' : 'From your predicted time'}: the 8 runs take about {clock(runTotal * 1000)}. Runs are never planned faster than your threshold pace.{pred && h.goalS ? ` Ritmo's prediction today is ${clock(pred.totalS * 1000)}.` : ''}</p>
          : <p className="muted">Add a goal time in Profile, HYROX, or record a few runs, and Ritmo will plan your race pace. <Link to="/profile/hyrox">Set a goal</Link>.</p>}
      </section>

      {pacing && (
        <section className="stack-sm" aria-label="Pacing, run by run">
          {pacing.runs.map((r, i) => {
            const st = pacing.stations[i];
            return (
              <article key={r.n} className="card pace-card" aria-label={`Run ${r.n} and ${st.name}`}>
                <div className="row-between"><span className="label">Run {r.n} · 1 km</span><span className="stat pace-card-v">{pace(r.paceS, U)}</span></div>
                <p className="caption">{r.note}</p>
                <div className="row-between pace-card-st"><span className="label">{st.name}</span>{st.targetS ? <span className="stat pace-card-v">{clock(st.targetS * 1000)}</span> : <span className="caption">steady</span>}</div>
                <p className="caption">{st.work}. {st.tip}</p>
              </article>
            );
          })}
        </section>
      )}

      <section className="card stack-sm" aria-labelledby="hrd-warm">
        <h2 id="hrd-warm" className="title">Warm-up</h2>
        <p className="caption">About {HYROX_WARMUP.reduce((a, x) => a + x.minutes, 0)} minutes. Finish it 10 minutes before your start wave.</p>
        <ol className="list hrd-warm">{HYROX_WARMUP.map((w) => <li key={w.label} className="list-item row-between" style={{ alignItems: 'flex-start' }}><span className="stack-sm" style={{ gap: 0 }}><span className="label">{w.label}</span><span className="caption">{w.detail}</span></span><span className="caption" style={{ flex: 'none' }}>{w.minutes} min</span></li>)}</ol>
      </section>

      <section className="card stack-sm" aria-labelledby="hrd-splits">
        <h2 id="hrd-splits" className="title">Your splits</h2>
        <p className="caption">Record the race live with one tap at each change, or enter your official splits afterwards. Either way you get the full summary, and the result counts for your records and your next prediction.</p>
        <div className="row wrap" style={{ gap: 8 }}>
          <Link to="/hyrox?tab=race" className="btn btn-primary">Enter my splits</Link>
          <Link to="/hyrox?tab=race" className="btn">Record it live</Link>
        </div>
      </section>
      <p className="caption">General guidance for pacing and warming up. Use only food and drink you have practised with in training.</p>
    </div>
  );
}
