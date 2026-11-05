import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Share2 } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Kpi, Lanes, Logo, StatusLine } from '../components/ui';
import { dist, duration, MONTHS_LONG } from '../lib/format';
import { personalBests } from '../training/insights';
import { TYPE_LABEL } from '../training/analysis';

export default function Review() {
  const { period = '' } = useParams();
  const nav = useNavigate();
  const { data, typeOf } = useApp();
  const U = data.profile.units;
  const [shared, setShared] = useState('');
  const isMonth = period.length === 7;
  const label = isMonth ? `${MONTHS_LONG[Number(period.slice(5)) - 1]} ${period.slice(0, 4)}` : period;
  const acts = useMemo(() => data.activities.filter((a) => a.startTime.startsWith(period)), [data.activities, period]);
  const prevKey = isMonth ? (() => { const y = Number(period.slice(0, 4)), m = Number(period.slice(5)); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; })() : String(Number(period) - 1);
  const prev = data.activities.filter((a) => a.startTime.startsWith(prevKey));
  const total = acts.reduce((x, a) => x + a.distanceM, 0), prevTotal = prev.reduce((x, a) => x + a.distanceM, 0);
  const longest = [...acts].sort((a, b) => b.distanceM - a.distanceM)[0];
  const beforePbs = personalBests(data.activities.filter((a) => a.startTime < period));
  const nowPbs = personalBests(data.activities.filter((a) => a.startTime.slice(0, period.length) <= period));
  const newPbs = nowPbs.filter((p) => p.date.startsWith(period) && (!beforePbs.find((b) => b.label === p.label) || p.timeS < beforePbs.find((b) => b.label === p.label)!.timeS));
  const types = acts.reduce<Record<string, number>>((m, a) => ((m[typeOf(a)] = (m[typeOf(a)] ?? 0) + 1), m), {});
  const topType = Object.entries(types).sort((a, b) => b[1] - a[1])[0];

  const share = async () => {
    const text = `My ${label} with Ritmo: ${dist(total, U, 0)} over ${acts.length} runs${newPbs.length ? `, with new personal bests at ${newPbs.map((p) => p.label).join(' and ')}` : ''}. Train to your own rhythm.`;
    try {
      if (navigator.share) { await navigator.share({ title: `My ${label} with Ritmo`, text }); setShared('Shared.'); }
      else { await navigator.clipboard.writeText(text); setShared('Summary copied. Paste it anywhere.'); }
    } catch { /* cancelled */ }
  };

  return (
    <div className="stack-lg" style={{ maxWidth: 640, margin: '0 auto' }}>
      <button className="btn btn-ghost btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => nav(-1)}><ArrowLeft size={18} strokeWidth={2} aria-hidden="true" />Back</button>
      <section className="hero stack" aria-label={`${label} review`}>
        <Lanes />
        <p className="label">Your {isMonth ? 'month' : 'year'}</p>
        <h1 className="display-lg">{label}</h1>
        <p className="stat-xl">{dist(total, U, 0)}</p>
        <p className="body">{acts.length} runs · {Math.round(acts.reduce((x, a) => x + a.movingS, 0) / 3600)} hours{prevTotal ? ` · ${total >= prevTotal ? '+' : ''}${Math.round(((total - prevTotal) / prevTotal) * 100)}% on the ${isMonth ? 'month' : 'year'} before` : ''}</p>
        <div style={{ background: 'var(--surface-raised)', borderRadius: 12, padding: '8px 12px', alignSelf: 'flex-start' }}><Logo variant="compact" width={96} /></div>
      </section>
      {acts.length === 0 ? <div className="card stack"><p className="muted">No runs in {label}, so there is nothing to review yet.</p><div className="row wrap"><Link to="/" className="btn btn-primary">Go to Today</Link><Link to="/progress" className="btn">Back to Progress</Link></div></div> : (
        <div className="grid-2">
          <div className="card"><Kpi label="Longest run" value={longest ? dist(longest.distanceM, U) : '–'} sub={longest ? duration(longest.movingS) : ''} /></div>
          <div className="card"><Kpi label="Most common session" value={topType ? TYPE_LABEL[topType[0] as keyof typeof TYPE_LABEL] : '–'} sub={topType ? `${topType[1]} times` : ''} /></div>
          {newPbs.length > 0 && (
            <div className="card stack-sm" style={{ gridColumn: '1 / -1' }}>
              <span className="tag tag-accent" style={{ alignSelf: 'flex-start' }}>New personal best</span>
              {newPbs.map((p) => <p key={p.label} className="row-between"><span className="label">{p.label}</span><span className="stat">{duration(p.timeS)}</span></p>)}
            </div>
          )}
        </div>
      )}
      <div className="row">
        <button className="btn btn-primary" onClick={share} disabled={acts.length === 0}><Share2 size={18} strokeWidth={2} aria-hidden="true" />Share</button>
        {shared && <StatusLine kind="success">{shared}</StatusLine>}
      </div>
    </div>
  );
}
