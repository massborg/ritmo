// History (update 5, U1): everything you did, runs and every other kind, newest first, with a filter per type.
// Before this, cross-training was saved and then shown nowhere.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { FeedRow } from '../components/LogBits';
import { FEED_FILTERS, activityFeed, type FeedType } from '../training/feed';
import { MONTHS_LONG, parseYmd, ymd } from '../lib/format';

const KEY = 'ritmo:history:filter';
const PAGE = 60;

export default function History() {
  const { data, today } = useApp();
  const [filter, setFilterState] = useState<'all' | FeedType>(() => { try { const v = localStorage.getItem(KEY); return FEED_FILTERS.some((f) => f.value === v) ? (v as 'all' | FeedType) : 'all'; } catch { return 'all'; } });
  const [shown, setShown] = useState(PAGE);
  const setFilter = (f: 'all' | FeedType) => { setFilterState(f); setShown(PAGE); try { localStorage.setItem(KEY, f); } catch { /* */ } };
  const all = useMemo(() => activityFeed(data.activities, data.profile), [data.activities, data.profile]);
  const list = filter === 'all' ? all : all.filter((x) => x.type === filter);
  const t = ymd(today), y = ymd(new Date(today.getTime() - 86400000));
  const when = (d: string) => (d === t ? 'Today' : d === y ? 'Yesterday' : parseYmd(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }));
  // Grouped by month, so a long history is easy to scan
  const groups: { key: string; title: string; items: typeof list }[] = [];
  for (const it of list.slice(0, shown)) {
    const key = it.date.slice(0, 7);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) { g = { key, title: `${MONTHS_LONG[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`, items: [] }; groups.push(g); }
    g.items.push(it);
  }
  return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <AppHeader title="History" back />
      <div className="row wrap" role="group" aria-label="Show" style={{ gap: 6 }}>
        {FEED_FILTERS.map((f) => <button key={f.value} type="button" className="chip" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</button>)}
      </div>
      {!list.length && (
        <section className="card stack-sm">
          <p className="label">{filter === 'all' ? 'Nothing recorded yet' : `No ${FEED_FILTERS.find((f) => f.value === filter)!.label.toLowerCase()} yet`}</p>
          <p className="caption">Anything you record or log shows here: runs, strength, HYROX and other sports.</p>
          <Link to="/record" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Go to Activity</Link>
        </section>
      )}
      {groups.map((g) => (
        <section key={g.key} className="stack-sm" aria-label={g.title}>
          <h2 className="record-eyebrow dim">{g.title}</h2>
          <ul className="list card feed-list">{g.items.map((it) => <FeedRow key={`${it.type}-${it.id}`} item={it} when={when(it.date)} />)}</ul>
        </section>
      ))}
      {list.length > shown && <button type="button" className="btn btn-block" onClick={() => setShown((n) => n + PAGE)}>Show more ({list.length - shown} older)</button>}
      {list.length > 0 && <p className="caption">Tap any entry to see it, change it or delete it.</p>}
    </div>
  );
}
