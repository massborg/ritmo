// The You page beyond running (update 5, U8): All (time trained, sessions, time by type, every activity in one
// list), Strength (sessions, time, volume, records, muscles worked), HYROX (bests, run splits) and Other sport.
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { FeedRow } from './LogBits';
import { activityFeed } from '../training/feed';
import { forStats } from '../data/quality';
import { bySport, hoursMinutes, inRange, musclesWorked, sessionsPerWeek, strengthRecords, totalsByType, volumeKg } from '../training/you-sports';
import { clock, records, summarise, type HyroxSession } from '../hyrox/hyrox';
import { STATIONS } from '../hyrox/hyroxDivisions';
import { dist, parseYmd, ymd } from '../lib/format';
import { PART_LABEL, type Part } from './figure';

export type Sport = 'all' | 'run' | 'strength' | 'hyrox' | 'cross';
export const SPORTS: { value: Sport; label: string }[] = [{ value: 'all', label: 'All' }, { value: 'run', label: 'Run' }, { value: 'strength', label: 'Strength' }, { value: 'hyrox', label: 'HYROX' }, { value: 'cross', label: 'Other sport' }];
const TYPE_COLOR: Record<string, string> = { run: 'var(--brand)', strength: 'var(--accent)', hyrox: 'var(--graphite)', cross: '#7fa98a' };

export function SportsView({ sport, from, to, title }: { sport: Exclude<Sport, 'run'>; from: string; to: string; title: string }) {
  const { data, today, plan } = useApp();
  const U = data.profile.units;
  const log = data.profile.log ?? [];
  const feed = activityFeed(forStats(data.activities), data.profile).filter((x) => inRange(x.date, from, to));
  const t = ymd(today), y = ymd(new Date(today.getTime() - 86400000));
  const when = (d: string) => (d === t ? 'Today' : d === y ? 'Yesterday' : parseYmd(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }));
  const List = ({ items, empty }: { items: typeof feed; empty: string }) => (items.length
    ? <ul className="list card feed-list">{items.slice(0, 60).map((it) => <FeedRow key={`${it.type}-${it.id}`} item={it} when={when(it.date)} />)}</ul>
    : <p className="muted">{empty}</p>);

  if (sport === 'all') {
    const types = totalsByType(feed), total = types.reduce((a, x) => a + x.seconds, 0);
    const runM = feed.filter((x) => x.type === 'run').reduce((a, x) => a + (x.distanceM ?? 0), 0);
    return (
      <div className="stack-lg">
        <dl className="sport-tiles" aria-label={`${title} totals`}>
          <div className="card"><dt className="caption">Time trained</dt><dd className="stat">{hoursMinutes(total)}</dd></div>
          <div className="card"><dt className="caption">Sessions</dt><dd className="stat">{feed.length}</dd></div>
          <div className="card"><dt className="caption">Running</dt><dd className="stat">{dist(runM, U, 0)}</dd></div>
        </dl>
        {total > 0 && (
          <section className="card stack-sm" aria-labelledby="by-type">
            <h2 id="by-type" className="label">Time by type</h2>
            <div className="type-bar" role="img" aria-label={types.map((x) => `${x.label} ${hoursMinutes(x.seconds)}`).join(', ')}>
              {types.map((x) => <span key={x.type} style={{ flexGrow: Math.max(x.seconds, total * 0.02), background: TYPE_COLOR[x.type] }} />)}
            </div>
            <ul className="type-legend">{types.map((x) => <li key={x.type}><span className="type-dot" style={{ background: TYPE_COLOR[x.type] }} aria-hidden="true" />{x.label} {hoursMinutes(x.seconds)} · {x.sessions}</li>)}</ul>
          </section>
        )}
        <section className="stack-sm" aria-labelledby="all-h">
          <h2 id="all-h" className="title">All activity · {title}</h2>
          <List items={feed} empty="Nothing recorded in this period." />
        </section>
      </div>
    );
  }

  if (sport === 'strength') {
    const entries = log.filter((e) => e.kind === 'strength' && inRange(e.date, from, to));
    const items = feed.filter((x) => x.type === 'strength');
    const planned = (plan?.sessions ?? []).filter((s) => s.strengthPlan && inRange(s.date, from, to)).length;
    const vol = volumeKg(entries), secs = items.reduce((a, x) => a + x.durationS, 0);
    const weeks = sessionsPerWeek(log.filter((e) => e.kind === 'strength').map((e) => e.date), parseYmd(to < t ? to : t)), max = Math.max(1, ...weeks.map((w) => w.n));
    const recs = strengthRecords(log).slice(0, 6), muscles = musclesWorked(entries);
    const unit = data.profile.strength?.units ?? 'kg';
    const volText = unit === 'lb' ? `${Math.round(vol * 2.2046).toLocaleString('en-GB')} lb` : vol >= 1000 ? `${(vol / 1000).toFixed(1)} t` : `${Math.round(vol)} kg`;
    return (
      <div className="stack-lg">
        <dl className="sport-tiles" aria-label={`${title} strength totals`}>
          <div className="card"><dt className="caption">Sessions</dt><dd className="stat">{entries.length}</dd>{planned > 0 && <dd className="caption">target {planned}</dd>}</div>
          <div className="card"><dt className="caption">Time</dt><dd className="stat">{hoursMinutes(secs)}</dd></div>
          <div className="card"><dt className="caption">Volume</dt><dd className="stat">{vol ? volText : '–'}</dd></div>
        </dl>
        <section className="card stack-sm" aria-labelledby="st-week">
          <h2 id="st-week" className="label">Sessions per week</h2>
          <div className="week-bars" role="img" aria-label={weeks.map((w) => `week of ${w.start}: ${w.n}`).join(', ')}>
            {weeks.map((w) => <div key={w.start} className="week-bar"><span style={{ height: `${Math.max(6, (w.n / max) * 100)}%`, opacity: w.n ? 1 : 0.25 }} /><span className="caption">{parseYmd(w.start).getDate()} {parseYmd(w.start).toLocaleDateString('en-GB', { month: 'short' })}</span></div>)}
          </div>
        </section>
        {recs.length > 0 && (
          <section className="card stack-sm" aria-labelledby="st-rec">
            <h2 id="st-rec" className="label">Strength records</h2>
            <ul className="list">{recs.map((r) => <li key={r.id} className="list-item row-between"><span className="label">{r.name}</span><span className="row" style={{ gap: 8 }}><span className="stat" style={{ fontSize: 16 }}>{r.text}</span>{inRange(r.date, ymd(new Date(today.getTime() - 14 * 86400000)), t) && <span className="tag-new">New</span>}</span></li>)}</ul>
            <p className="caption">Best set of each exercise: the heaviest by estimated 1-rep max, or the longest hold.</p>
          </section>
        )}
        {muscles.length > 0 && (
          <section className="card stack-sm" aria-labelledby="st-mus">
            <h2 id="st-mus" className="label">Muscles worked · {title}</h2>
            <div className="row wrap" style={{ gap: 6 }}>{muscles.map((m, i) => <span key={m.muscle} className={`muscle-chip${i < 3 ? ' top' : ''}`}>{PART_LABEL[m.muscle as Part] ?? m.muscle} {m.sets} set{m.sets === 1 ? '' : 's'}</span>)}</div>
          </section>
        )}
        <section className="stack-sm" aria-labelledby="st-list">
          <h2 id="st-list" className="title">Strength sessions</h2>
          <List items={items} empty="No strength sessions in this period." />
          {!items.length && <Link to="/strength" className="btn" style={{ alignSelf: 'flex-start' }}>Start a workout</Link>}
        </section>
      </div>
    );
  }

  if (sport === 'hyrox') {
    const all = log.filter((e) => e.kind === 'hyrox' && e.hyrox).map((e) => e.hyrox as HyroxSession);
    const rec = records(all), items = feed.filter((x) => x.type === 'hyrox');
    const inP = all.filter((h) => inRange(ymd(new Date(h.startedAt)), from, to));
    const runs = inP.flatMap((h) => summarise(h).runs), avg = runs.length ? runs.reduce((a, r) => a + r.ms, 0) / runs.length : 0;
    // Fade: how much slower the second half of the runs was than the first, in whole sessions
    const fades = inP.map((h) => summarise(h).runs).filter((r) => r.length >= 4).map((r) => { const half = Math.floor(r.length / 2), a = r.slice(0, half).reduce((x, y) => x + y.ms, 0) / half, b = r.slice(-half).reduce((x, y) => x + y.ms, 0) / half; return b - a; });
    const fade = fades.length ? fades.reduce((a, b) => a + b, 0) / fades.length : undefined;
    return (
      <div className="stack-lg">
        <dl className="sport-tiles" aria-label="HYROX bests">
          <div className="card"><dt className="caption">Best simulation</dt><dd className="stat">{rec.simulation ? clock(rec.simulation.ms) : '–'}</dd></div>
          <div className="card"><dt className="caption">Best race</dt><dd className="stat">{rec.race ? clock(rec.race.ms) : '–'}</dd></div>
          <div className="card"><dt className="caption">Best 1 km</dt><dd className="stat">{rec.run ? clock(rec.run.ms) : '–'}</dd></div>
        </dl>
        {runs.length > 0 && (
          <section className="card stack-sm" aria-label="Run splits">
            <p className="label">Runs · {title}</p>
            <p className="caption">Average 1 km split {clock(avg)}{fade != null ? `. The later runs were ${clock(Math.abs(fade))} ${fade >= 0 ? 'slower' : 'faster'} than the early ones.` : '.'}</p>
          </section>
        )}
        {Object.keys(rec.stations).length > 0 && (
          <section className="card stack-sm" aria-labelledby="hx-st">
            <h2 id="hx-st" className="label">Station bests</h2>
            <ul className="list">{STATIONS.filter((s) => rec.stations[s.key]).map((s) => <li key={s.key} className="list-item row-between"><span className="label">{s.name}</span><span className="stat" style={{ fontSize: 16 }}>{clock(rec.stations[s.key]!.ms)}</span></li>)}</ul>
          </section>
        )}
        <section className="stack-sm" aria-labelledby="hx-list">
          <h2 id="hx-list" className="title">HYROX sessions</h2>
          <List items={items} empty="No HYROX sessions in this period." />
          {!items.length && <Link to="/hyrox" className="btn" style={{ alignSelf: 'flex-start' }}>Record a HYROX session</Link>}
        </section>
      </div>
    );
  }

  const entries = log.filter((e) => e.kind === 'cross' && inRange(e.date, from, to));
  const sports = bySport(entries), items = feed.filter((x) => x.type === 'cross');
  return (
    <div className="stack-lg">
      <dl className="sport-tiles" aria-label={`${title} other sport totals`}>
        <div className="card"><dt className="caption">Sessions</dt><dd className="stat">{entries.length}</dd></div>
        <div className="card"><dt className="caption">Time</dt><dd className="stat">{hoursMinutes(sports.reduce((a, s) => a + s.minutes, 0) * 60)}</dd></div>
        <div className="card"><dt className="caption">Load</dt><dd className="stat">{sports.reduce((a, s) => a + s.load, 0)}</dd></div>
      </dl>
      {sports.length > 0 && (
        <section className="card stack-sm" aria-labelledby="os-by">
          <h2 id="os-by" className="label">By sport</h2>
          <ul className="list">{sports.map((s) => <li key={s.sport} className="list-item row-between"><span className="label">{s.sport}</span><span className="caption">{s.minutes} min · {s.sessions} session{s.sessions === 1 ? '' : 's'} · load {s.load}</span></li>)}</ul>
          <p className="caption">Other sports count toward fitness and fatigue, not running distance.</p>
        </section>
      )}
      <section className="stack-sm" aria-labelledby="os-list">
        <h2 id="os-list" className="title">Other sport sessions</h2>
        <List items={items} empty="No other sports in this period." />
        {!items.length && <Link to="/other" className="btn" style={{ alignSelf: 'flex-start' }}>Record another sport</Link>}
      </section>
    </div>
  );
}
