// All records (brief 6.1): every personal best (1 km to marathon) with when it was set and how it improved, and the
// runs Ritmo thinks were races, to confirm so the PBs are labelled right.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { Sheet } from '../components/inputs';
import { dist, duration, parseYmd, shortDate } from '../lib/format';
import { type PB, PB_KIND_LABEL, pbHistory, pbSource, personalBests, racesToReview } from '../training/insights';
import { forStats } from '../data/quality';
import type { Activity } from '../lib/types';

export default function Records() {
  const { data } = useApp();
  const acts = useMemo(() => forStats(data.activities), [data.activities]);
  const pbs = useMemo(() => personalBests(acts, data.races), [acts, data.races]);
  const toReview = useMemo(() => racesToReview(acts, data.races), [acts, data.races]);
  const [reviewing, setReviewing] = useState(false);
  return (
    <div className="stack-lg">
      <AppHeader title="All records" back />
      <section className="card stack" aria-labelledby="pbs">
        <div className="row" style={{ gap: 8 }}><Award size={20} strokeWidth={2} color="var(--accent-mark)" aria-hidden="true" /><h2 id="pbs" className="title">Personal bests</h2></div>
        {pbs.length === 0 && <p className="muted">Personal bests appear once you have run 1 km or more with GPS.</p>}
        <p className="caption">Best times anywhere inside your runs, not only whole runs of that distance, worked out by Ritmo from each run's GPS or watch data. They can differ by a few seconds from Strava's best efforts or an official chip time, which isn't imported. To show an official time on your Hub profile, enter it there as your own. Tap History to see how each one improved.</p>
        <ul className="list">{pbs.map((p) => <PbRow key={p.label} pb={p} />)}</ul>
        {toReview.length > 0 && (
          <div className="stack-sm">
            <p className="caption">Ritmo found {toReview.length} run{toReview.length === 1 ? '' : 's'} that look{toReview.length === 1 ? 's' : ''} like {toReview.length === 1 ? 'a race' : 'races'}. Confirming them labels your PBs correctly.</p>
            <button className="btn btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => setReviewing(true)}>Review races</button>
          </div>
        )}
        {reviewing && <RaceReview runs={toReview} onClose={() => setReviewing(false)} />}
      </section>
    </div>
  );
}

/** One PB, with its history (every time it was improved) folded underneath. */
function PbRow({ pb }: { pb: PB }) {
  const { data } = useApp();
  const [open, setOpen] = useState(false);
  const history = useMemo(() => (open ? pbHistory(forStats(data.activities), pb.m, data.races).reverse() : []), [open, data.activities, data.races, pb.m]);
  return (
    <li>
      <div className="row-between" style={{ gap: 8 }}>
        <Link to={`/activity/${pb.activityId}`} className="list-item row-between" style={{ flex: 1 }}>
          <span className="stack-sm" style={{ gap: 0 }}><span className="label">{pb.label}</span><span className="caption">{shortDate(parseYmd(pb.date))} · {pbSource(pb)}</span></span>
          <span className="stat" style={{ fontSize: 20 }}>{duration(pb.timeS)}</span>
        </Link>
        <button className="btn btn-ghost btn-small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'History'}</button>
      </div>
      {open && (
        <ol className="pb-history caption">
          {history.map((h) => <li key={h.activityId}><Link to={`/activity/${h.activityId}`}>{duration(h.timeS)}</Link> · {shortDate(parseYmd(h.date))} · {PB_KIND_LABEL[h.kind]}</li>)}
        </ol>
      )}
    </li>
  );
}

/** Confirm or reject the runs Ritmo thinks were races. */
function RaceReview({ runs, onClose }: { runs: Activity[]; onClose: () => void }) {
  const { setRaceFlag, data } = useApp();
  const U = data.profile.units;
  return (
    <Sheet open onClose={onClose} title="Were these races?"
      footer={<div className="row" style={{ gap: 8 }}><button className="btn btn-block" onClick={onClose}>Done</button><button className="btn btn-primary btn-block" onClick={() => { setRaceFlag(runs.map((r) => r.id), true); onClose(); }}>All were races</button></div>}>
      <p className="caption">Races count fully towards your fitness and are labelled as races in your PBs. You can change this later on each run.</p>
      <ul className="list">
        {runs.map((a) => (
          <li key={a.id} className="row-between wrap" style={{ padding: 'var(--s2) 0', gap: 8 }}>
            <span className="stack-sm" style={{ gap: 0 }}><span className="label">{a.name}</span><span className="caption">{shortDate(new Date(a.startTime))} · {dist(a.distanceM, U)} · {duration(a.movingS)}</span></span>
            <span className="row" style={{ gap: 4 }}>
              <button className="btn btn-small btn-primary" onClick={() => setRaceFlag([a.id], true)}>Race</button>
              <button className="btn btn-small" onClick={() => setRaceFlag([a.id], false)}>Not a race</button>
            </span>
          </li>
        ))}
      </ul>
      {!runs.length && <p className="muted">All done.</p>}
    </Sheet>
  );
}
