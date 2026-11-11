// Hub notifications (update 2, §11): Follow requests first, then Today and Earlier. After accepting a request the row
// says so and offers Follow back and View profile; new followers get Follow back too. Comment rows open the comments.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, MessageCircle, UserPlus } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { Empty } from '../components/ui';
import { RunnerAvatar } from '../components/RunnerAvatar';
import { FollowStateButton } from '../components/FollowButton';
import { ActionToast } from '../components/HubBits';
import { CommentsSheet } from './Hub';
import * as hub from '../data/hub';
import type { HubProfile, Notification, Post } from '../data/hub';

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export default function HubNotifications() {
  const { session } = useApp();
  const uid = session?.user.id;
  const [notes, setNotes] = useState<Notification[]>();
  const [follows, setFollows] = useState<hub.Follow[]>([]);
  const [people, setPeople] = useState<Map<string, HubProfile>>(new Map());
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ id: string; name: string }>();
  const [comments, setComments] = useState<Post>();
  const load = useCallback(async () => {
    if (!uid) return;
    const [n, f] = await Promise.all([hub.notifications().catch(() => [] as Notification[]), hub.follows(uid).catch(() => [] as hub.Follow[])]);
    setNotes(n); setFollows(f);
    setPeople(await hub.profilesFor([...n.map((x) => x.actor_id ?? ''), ...f.flatMap((x) => [x.follower_id, x.followee_id])].filter(Boolean)).catch(() => new Map()));
  }, [uid]);
  useEffect(() => { void load(); }, [load]);
  // Opening the screen reads them
  useEffect(() => () => { if (uid) void hub.markAllRead(uid).catch(() => undefined); }, [uid]);
  if (!uid) return null;

  const name = (id?: string | null) => people.get(id ?? '')?.display_name ?? 'Someone';
  const pending = (id?: string | null) => follows.some((f) => f.follower_id === id && f.followee_id === uid && f.status === 'pending');
  // Batch: the same kind on the same post becomes one row ("Anna and 5 others gave your run a Fuego")
  const groups = new Map<string, Notification[]>();
  for (const n of notes ?? []) { const k = n.kind === 'follow_request' || n.kind === 'follow' ? `${n.kind}:${n.actor_id}` : `${n.kind}:${n.post_id ?? n.actor_id}`; groups.set(k, [...(groups.get(k) ?? []), n]); }
  const all = [...groups.values()];
  const requests = all.filter((g) => g[0].kind === 'follow_request' && (pending(g[0].actor_id) || accepted.has(g[0].actor_id ?? '')));
  const rest = all.filter((g) => !requests.includes(g) && !(g[0].kind === 'follow_request' && !pending(g[0].actor_id)));
  const today = new Date().toDateString();
  const todays = rest.filter((g) => new Date(g[0].created_at).toDateString() === today);
  const earlier = rest.filter((g) => !todays.includes(g));

  const accept = async (id: string) => {
    await hub.acceptFollower(uid, id);
    setAccepted((s) => new Set(s).add(id));
    setToast({ id, name: name(id) });
    void load();
  };
  const icon = (k: Notification['kind']) => k === 'ritmo' ? <Flame size={14} strokeWidth={2.5} className="flame" aria-hidden="true" /> : k === 'comment' || k === 'reply' || k === 'mention' ? <MessageCircle size={14} strokeWidth={2.5} aria-hidden="true" /> : <UserPlus size={14} strokeWidth={2.5} aria-hidden="true" />;
  const Row = ({ g }: { g: Notification[] }) => {
    const n = g[0];
    const actor = n.actor_id ?? '';
    const unread = g.some((x) => !x.read_at);
    const isAccepted = n.kind === 'follow_request' && accepted.has(actor);
    const text = isAccepted ? <>You accepted <strong>{name(actor)}</strong>. They can now see your runs.</> : <>{hub.notificationText(n.kind, [...new Set(g.map((x) => name(x.actor_id)))])}</>;
    return (
      <li className={`note-row${unread ? ' is-unread' : ''}`}>
        <Link to={`/hub/runner/${actor}`} className="note-avatar" aria-label={`${name(actor)}'s profile`}>
          <RunnerAvatar id={actor} profile={people.get(actor)} />
          <span className={`note-kind note-${n.kind}`}>{icon(n.kind)}</span>
        </Link>
        <div className="stack-sm" style={{ gap: 6, flex: 1, minWidth: 0 }}>
          <span>{text} <span className="caption">{ago(n.created_at)}</span></span>
          {n.kind === 'follow_request' && pending(actor) && !isAccepted && (
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-small btn-primary" onClick={() => void accept(actor)}>Accept</button>
              <button className="btn btn-small" onClick={async () => { await hub.removeFollower(uid, actor); void load(); }}>Decline</button>
            </div>
          )}
          {(isAccepted || n.kind === 'follow') && (
            <div className="row" style={{ gap: 6 }}>
              <FollowStateButton other={actor} name={name(actor)} follows={follows} onChange={() => void load()} />
              <Link to={`/hub/runner/${actor}`} className="btn btn-small">View profile</Link>
            </div>
          )}
          {(n.kind === 'comment' || n.kind === 'reply' || n.kind === 'mention') && n.post_id && (
            <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={async () => { const p = await hub.postById(n.post_id!).catch(() => undefined); if (p) setComments(p); }}>Reply</button>
          )}
        </div>
      </li>
    );
  };
  const section = (title: string, list: Notification[][]) => list.length > 0 && (
    <section className="stack-sm" aria-label={title}>
      <h2 className="label">{title}</h2>
      <ul className="list note-list">{list.map((g) => <Row key={`${g[0].kind}-${g[0].id}`} g={g} />)}</ul>
    </section>
  );

  return (
    <div className="stack-lg">
      <AppHeader title="Notifications" back large={false} />
      {notes === undefined ? <p className="muted" role="status">Loading…</p> : !all.length ? <Empty title="Nothing yet">Fuego, comments and new followers show up here.</Empty> : <>
        {section('Follow requests', requests)}
        {section('Today', todays)}
        {section('Earlier', earlier)}
      </>}
      {comments && <CommentsSheet post={comments} people={people} onClose={() => setComments(undefined)} />}
      {toast && <ActionToast message={`${toast.name} can now follow you.`} onDone={() => setToast(undefined)}
        action={follows.some((f) => f.follower_id === uid && f.followee_id === toast.id) ? undefined : <button className="toast-btn" onClick={async () => { await hub.follow(uid, toast.id); setToast(undefined); void load(); }}>Follow back</button>} />}
    </div>
  );
}
