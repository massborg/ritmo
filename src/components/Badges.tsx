// Hub challenge badges: joined challenges kept up to date, and the shelf of finished ones (Hub and Profile).
import { useEffect, useMemo, useRef } from 'react';
import { useApp } from '../app/AppContext';
import { badgeOf, badgeSrc, markCompleted, restoreFromPosts } from '../training/challenges';
import * as hub from '../data/hub';

/** Joined challenges, kept up to date: a newly finished one gets its completion date. */
export function useChallenges() {
  const { data, updateProfile, session } = useApp();
  const joined = useMemo(() => data.profile.challenges ?? [], [data.profile.challenges]);
  const latest = useRef(joined);
  latest.current = joined;
  useEffect(() => {
    const next = markCompleted(joined, data.activities);
    if (next) updateProfile({ challenges: next });
  }, [joined, data.activities]); // eslint-disable-line react-hooks/exhaustive-deps
  // One challenge state: a completed challenge the runner posted is completed here too (Challenges, Badges, Feed)
  const uid = session?.user.id;
  useEffect(() => {
    if (data.mode !== 'real' || !uid) return;
    let off = false;
    hub.postsBy(uid).then((posts) => {
      const next = off ? undefined : restoreFromPosts(latest.current, posts, data.profile.units);
      if (next) updateProfile({ challenges: next });
    }).catch(() => { /* the Hub may be off for this runner */ });
    return () => { off = true; };
  }, [uid, data.mode]); // eslint-disable-line react-hooks/exhaustive-deps
  return joined;
}

/** Completed challenges as badges (also shown on Profile). */
export function BadgeShelf({ compact }: { compact?: boolean }) {
  const joined = useChallenges();
  const done = joined.filter((j) => j.completedAt).sort((a, b) => b.completedAt!.localeCompare(a.completedAt!));
  if (!done.length) return compact ? null : <section className="stack-sm" aria-labelledby="ch-badges"><h2 id="ch-badges" className="title">Badges</h2><p className="muted">Finish a challenge to earn its badge.</p></section>;
  return (
    <section className={compact ? 'card stack-sm' : 'stack-sm'} aria-labelledby="ch-badges">
      <h2 id="ch-badges" className={compact ? 'label' : 'title'}>Badges</h2>
      <ul className="badge-shelf">
        {done.map((j) => <li key={j.challenge.id}><img className="badge-img badge-img-lg" src={badgeSrc(badgeOf(j.challenge))} alt="" width={72} height={72} /><span className="caption">{j.challenge.title}</span></li>)}
      </ul>
    </section>
  );
}

