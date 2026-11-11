// Followers · Following · Requests (update 2, §11 and §12). Your own lists come from your follow rows; another
// runner's lists only show what their privacy allows (a public profile, or one you follow).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MoreHorizontal, Search } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { Sheet } from '../components/inputs';
import { Empty, StatusLine } from '../components/ui';
import { RunnerAvatar } from '../components/RunnerAvatar';
import { FollowStateButton } from '../components/FollowButton';
import { ActionToast } from '../components/HubBits';
import * as hub from '../data/hub';
import type { HubProfile } from '../data/hub';

type Tab = 'followers' | 'following' | 'requests';

export default function HubPeople() {
  const { id: param, tab: tabParam } = useParams();
  const { session } = useApp();
  const nav = useNavigate();
  const uid = session?.user.id;
  const id = param === 'me' || !param ? uid : param;
  const own = id === uid;
  const tab = (['followers', 'following', 'requests'].includes(tabParam ?? '') && (own || tabParam !== 'requests') ? tabParam : 'followers') as Tab;
  const [follows, setFollows] = useState<hub.Follow[]>([]);
  const [theirs, setTheirs] = useState<{ followers: string[]; following: string[] }>();
  const [people, setPeople] = useState<Map<string, HubProfile>>(new Map());
  const [owner, setOwner] = useState<HubProfile>();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'one-way'>('all');
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ id: string; name: string }>();
  const [removing, setRemoving] = useState<HubProfile>();
  const [err, setErr] = useState<string>();

  const load = useCallback(async () => {
    if (!uid || !id) return;
    try {
      const f = await hub.follows(uid);
      setFollows(f);
      let ids: string[] = f.flatMap((x) => [x.follower_id, x.followee_id]);
      if (!own) {
        const [fo, fi] = await Promise.all([hub.followList(id, 'followers'), hub.followList(id, 'following')]);
        setTheirs({ followers: fo, following: fi });
        ids = [...ids, ...fo, ...fi, id];
      }
      setPeople(await hub.profilesFor(ids.filter((x) => x !== uid || !own)));
      setOwner((await hub.profilesFor([id])).get(id));
    } catch (e) { setErr((e as Error).message); }
  }, [uid, id, own]);
  useEffect(() => { void load(); }, [load]);

  const lists = useMemo(() => {
    if (!uid) return { followers: [], following: [], incoming: [], sent: [] };
    if (!own) return { followers: theirs?.followers ?? [], following: theirs?.following ?? [], incoming: [], sent: [] };
    return {
      followers: follows.filter((f) => f.followee_id === uid && f.status === 'accepted').map((f) => f.follower_id),
      following: follows.filter((f) => f.follower_id === uid && f.status === 'accepted').map((f) => f.followee_id),
      incoming: follows.filter((f) => f.followee_id === uid && f.status === 'pending').map((f) => f.follower_id),
      sent: follows.filter((f) => f.follower_id === uid && f.status === 'pending').map((f) => f.followee_id),
    };
  }, [follows, theirs, own, uid]);
  const followsMe = (x: string) => follows.some((f) => f.follower_id === x && f.followee_id === uid && f.status === 'accepted');
  const iFollow = (x: string) => follows.some((f) => f.follower_id === uid && f.followee_id === x && f.status === 'accepted');
  const name = (x: string) => people.get(x)?.display_name ?? 'Runner';
  const match = (x: string) => !q.trim() || hub.searchName(name(x)).includes(hub.searchName(q));

  if (!uid || !id) return null;
  const counts = { followers: lists.followers.length, following: lists.following.length, requests: lists.incoming.length + lists.sent.length };
  const shown = (tab === 'followers' ? lists.followers.filter((x) => filter === 'all' || !iFollow(x)) : tab === 'following' ? lists.following.filter((x) => filter === 'all' || !followsMe(x)) : []).filter(match);
  const row = (x: string, line?: string, extra?: React.ReactNode) => (
    <li key={x} className="find-row">
      <Link to={`/hub/runner/${x}`} className="row" style={{ gap: 12, flex: 1, minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
        <RunnerAvatar id={x} profile={people.get(x)} />
        <span className="find-row-text"><span className="label">{name(x)}</span>{line && <span className="caption">{line}</span>}</span>
      </Link>
      {extra ?? <FollowStateButton other={x} name={name(x)} follows={follows} onChange={() => void load()} />}
    </li>
  );
  const accept = async (x: string) => {
    try { await hub.acceptFollower(uid, x); setAccepted((s) => new Set(s).add(x)); setToast({ id: x, name: name(x) }); await load(); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="stack-lg">
      <AppHeader title={own ? 'You' : owner?.display_name ?? 'Runner'} back large={false} />
      <div className="people-tabs" role="tablist" aria-label="People">
        {(['followers', 'following', ...(own ? ['requests'] : [])] as Tab[]).map((t) => (
          <button key={t} role="tab" type="button" className="run-tab" aria-selected={tab === t} onClick={() => { setFilter('all'); nav(`/hub/runner/${own ? 'me' : id}/people/${t}`, { replace: true }); }}>
            {t === 'followers' ? 'Followers' : t === 'following' ? 'Following' : 'Requests'} <span className="people-count">{counts[t]}</span>
          </button>
        ))}
      </div>
      {err && <StatusLine kind="warning">{err}</StatusLine>}
      {tab !== 'requests' && (
        <>
          <div className="find-search find-search-sm">
            <Search size={18} strokeWidth={2} aria-hidden="true" />
            <input type="search" aria-label={`Search ${tab}`} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} autoCorrect="off" autoCapitalize="none" spellCheck={false} />
          </div>
          {own && (
            <div className="row" style={{ gap: 6 }} role="group" aria-label="Filter">
              <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
              <button type="button" className="chip" aria-pressed={filter === 'one-way'} onClick={() => setFilter('one-way')}>{tab === 'followers' ? 'Not following back' : "Doesn't follow back"}</button>
            </div>
          )}
          {shown.length ? <ul className="list" aria-label={tab}>{shown.map((x) => {
            if (!own) return row(x);
            if (tab === 'followers') return row(x, iFollow(x) ? 'Follows you · you follow back' : 'Follows you', (
              <span className="row" style={{ gap: 4 }}>
                <FollowStateButton other={x} name={name(x)} follows={follows} onChange={() => void load()} />
                <button className="icon-btn" aria-label={`More for ${name(x)}`} onClick={() => setRemoving(people.get(x) ?? { user_id: x, display_name: name(x), private: true })}><MoreHorizontal size={20} strokeWidth={2} /></button>
              </span>
            ));
            return row(x, followsMe(x) ? 'Follows you' : "Doesn't follow you");
          })}</ul> : <Empty title={q ? `No one matches '${q}'` : tab === 'followers' ? (filter === 'all' ? 'No followers yet' : 'You follow everyone back') : (filter === 'all' ? 'Not following anyone yet' : 'Everyone follows you back')}>{tab === 'following' && filter === 'all' ? <Link to="/hub/find" className="label">Find runners</Link> : null}</Empty>}
          {!own && !theirs?.followers.length && !theirs?.following.length && owner?.private && <p className="caption">{owner.display_name}'s lists are private. Follow them to see who they follow.</p>}
        </>
      )}
      {tab === 'requests' && own && (
        <section className="stack">
          <h2 className="label">Asking to follow you</h2>
          {lists.incoming.length || accepted.size ? <ul className="list">
            {[...accepted].filter((x) => !lists.incoming.includes(x)).map((x) => row(x, 'You accepted. They can now see your runs.'))}
            {lists.incoming.map((x) => row(x, 'Wants to follow you', (
              <span className="row" style={{ gap: 6 }}>
                <button className="btn btn-small btn-primary" onClick={() => void accept(x)}>Accept</button>
                <button className="btn btn-small" onClick={async () => { await hub.removeFollower(uid, x); void load(); }}>Decline</button>
              </span>
            )))}
          </ul> : <p className="muted">No requests waiting.</p>}
          <h2 className="label">Requests you sent</h2>
          {lists.sent.length ? <ul className="list">{lists.sent.map((x) => row(x, 'Waiting for them to accept'))}</ul> : <p className="muted">None waiting.</p>}
        </section>
      )}
      {removing && (
        <Sheet open onClose={() => setRemoving(undefined)} title={`Remove ${removing.display_name}?`}
          footer={<div className="row" style={{ gap: 8 }}><button className="btn btn-block" onClick={() => setRemoving(undefined)}>Cancel</button><button className="btn btn-block btn-danger" onClick={async () => { const r = removing; setRemoving(undefined); await hub.removeFollower(uid, r.user_id); void load(); }}>Remove follower</button></div>}>
          <p>They will stop seeing your followers-only runs. They won't be told.</p>
        </Sheet>
      )}
      {toast && <ActionToast message={`${toast.name} can now follow you.`} onDone={() => setToast(undefined)}
        action={iFollow(toast.id) ? undefined : <button className="toast-btn" onClick={async () => { await hub.follow(uid, toast.id); setToast(undefined); void load(); }}>Follow back</button>} />}
    </div>
  );
}
