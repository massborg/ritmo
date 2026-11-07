// Ritmo Hub (review #2 §4): runs shared with other runners, one reaction ("Ritmo"), comments, follows and
// notifications. Behind the "hub" flag and a separate, opt-in sharing consent (off until the runner agrees).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Flame, MessageCircle, MoreHorizontal, Search, Settings, UserPlus } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { Sheet } from '../components/inputs';
import { Empty, Segmented, StatusLine } from '../components/ui';
import { dist, duration, pace as fmtPace } from '../lib/format';
import * as hub from '../data/hub';
import type { Comment, HubProfile, Notification, Post } from '../data/hub';

export const HUB_CONSENT_VERSION = '2026-11';
type Tab = 'following' | 'everyone' | 'mine';
const initials = (n?: string) => (n ?? '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export default function HubPage() {
  const { hasFlag, data, session, updateProfile } = useApp();
  const uid = session?.user.id;
  const consent = data.profile.consents?.hubSharing?.granted;
  const [me, setMe] = useState<HubProfile | null>();
  const [tab, setTab] = useState<Tab>('following');
  const [posts, setPosts] = useState<Post[]>([]);
  const [people, setPeople] = useState<Map<string, HubProfile>>(new Map());
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [follows, setFollows] = useState<hub.Follow[]>([]);
  const [notes, setNotes] = useState<Notification[]>([]);
  const [sheet, setSheet] = useState<{ kind: 'comments' | 'givers' | 'notes' | 'find' | 'settings'; post?: Post }>();
  const [err, setErr] = useState<string>();
  const [loading, setLoading] = useState(true);

  const following = useMemo(() => follows.filter((f) => f.follower_id === uid && f.status === 'accepted').map((f) => f.followee_id), [follows, uid]);
  const load = useCallback(async () => {
    if (!uid) return;
    setLoading(true); setErr(undefined);
    try {
      const [f, n] = await Promise.all([hub.follows(uid), hub.notifications()]);
      setFollows(f); setNotes(n);
      const fol = f.filter((x) => x.follower_id === uid && x.status === 'accepted').map((x) => x.followee_id);
      const ps = await hub.feed(uid, tab, fol);
      setPosts(ps);
      const ids = [...ps.map((p) => p.user_id), ...n.map((x) => x.actor_id ?? ''), ...f.flatMap((x) => [x.follower_id, x.followee_id])].filter(Boolean);
      setPeople(await hub.profilesFor(ids));
      setMine(await hub.myRitmos(uid, ps.map((p) => p.id)));
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [uid, tab]);

  useEffect(() => { if (uid && hasFlag('hub')) hub.myHubProfile(uid).then((p) => setMe(p ?? null)).catch(() => setMe(null)); }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (me && consent) void load(); }, [me, consent, load]);

  if (!hasFlag('hub')) return <Empty title="Not available yet" action={<Link to="/" className="btn">Back to Training</Link>}>The Hub is being tested and will open to everyone soon.</Empty>;
  if (me === undefined) return <p className="muted" role="status">Loading…</p>;
  if (!consent || !me) return <OptIn existing={me ?? undefined} onDone={async (p) => {
    await hub.saveHubProfile(p);
    updateProfile({ consents: { ...data.profile.consents, hubSharing: { granted: true, at: new Date().toISOString(), version: HUB_CONSENT_VERSION } } });
    setMe(p);
  }} />;

  const toggle = async (p: Post, on: boolean) => {
    if (!uid) return;
    // optimistic, rolled back on error
    setMine((s) => { const n = new Set(s); if (on) n.add(p.id); else n.delete(p.id); return n; });
    setPosts((ps) => ps.map((x) => (x.id === p.id ? { ...x, ritmo_count: Math.max(0, x.ritmo_count + (on ? 1 : -1)) } : x)));
    try { await hub.setRitmo(uid, p.id, on); } catch {
      setMine((s) => { const n = new Set(s); if (on) n.delete(p.id); else n.add(p.id); return n; });
      setPosts((ps) => ps.map((x) => (x.id === p.id ? { ...x, ritmo_count: Math.max(0, x.ritmo_count + (on ? -1 : 1)) } : x)));
    }
  };
  const unread = notes.filter((n) => !n.read_at).length;

  return (
    <div className="stack-lg">
      <AppHeader title="Ritmo Hub" right={<>
        <button className="icon-btn" aria-label="Find runners" onClick={() => setSheet({ kind: 'find' })}><Search size={22} strokeWidth={2} /></button>
        <button className="icon-btn hub-bell" aria-label={`Notifications${unread ? `, ${unread} new` : ''}`} onClick={() => setSheet({ kind: 'notes' })}><Bell size={22} strokeWidth={2} />{unread > 0 && <span className="hub-badge">{unread}</span>}</button>
        <button className="icon-btn" aria-label="Hub settings" onClick={() => setSheet({ kind: 'settings' })}><Settings size={22} strokeWidth={2} /></button>
      </>} />
      <Segmented<Tab> label="Feed" value={tab} onChange={setTab} options={[{ value: 'following', label: 'Following' }, { value: 'everyone', label: 'Everyone' }, { value: 'mine', label: 'Your runs' }]} />
      <FirstTimeTip />
      {err && <StatusLine kind="danger">{err}</StatusLine>}
      {loading && !posts.length && <p className="muted" role="status">Loading runs…</p>}
      {!loading && !posts.length && <Empty title={tab === 'mine' ? 'You have not posted a run yet' : 'Nothing here yet'}>{tab === 'mine' ? 'Open any run and choose "Post to Hub".' : tab === 'following' ? 'Find runners to follow with the search button.' : 'Public runs appear here.'}</Empty>}
      <div className="stack">
        {posts.map((p) => <PostCard key={p.id} post={p} author={people.get(p.user_id)} mineRitmo={mine.has(p.id)} own={p.user_id === uid}
          onRitmo={(on) => toggle(p, on)} onComments={() => setSheet({ kind: 'comments', post: p })} onGivers={() => setSheet({ kind: 'givers', post: p })}
          onDelete={async () => { await hub.deletePost(p.id); setPosts((ps) => ps.filter((x) => x.id !== p.id)); }}
          onReport={async (why) => { await hub.report(uid!, { post_id: p.id }, why); }}
          onBlock={async () => { await hub.block(uid!, p.user_id); void load(); }} />)}
      </div>

      {sheet?.kind === 'comments' && sheet.post && <CommentsSheet post={sheet.post} people={people} onClose={() => { setSheet(undefined); void load(); }} />}
      {sheet?.kind === 'givers' && sheet.post && <GiversSheet post={sheet.post} following={following} follows={follows} onClose={() => setSheet(undefined)} />}
      {sheet?.kind === 'notes' && <NotesSheet notes={notes} people={people} follows={follows} onChange={load} onClose={() => { setSheet(undefined); void hub.markAllRead(uid!).then(load); }} />}
      {sheet?.kind === 'find' && <FindSheet follows={follows} onChange={load} onClose={() => setSheet(undefined)} />}
      {sheet?.kind === 'settings' && <SettingsSheet me={me} onSaved={setMe} onClose={() => setSheet(undefined)} onStop={async () => {
        await hub.hideAllMyPosts(uid!);
        updateProfile({ consents: { ...data.profile.consents, hubSharing: { granted: false, at: new Date().toISOString(), version: HUB_CONSENT_VERSION } } });
        setSheet(undefined);
      }} />}
    </div>
  );
}

function OptIn({ existing, onDone }: { existing?: HubProfile; onDone: (p: HubProfile) => Promise<void> }) {
  const { data, session } = useApp();
  const [name, setName] = useState(existing?.display_name ?? data.profile.name ?? '');
  const [priv, setPriv] = useState(existing?.private ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  return (
    <div className="stack-lg">
      <AppHeader title="Ritmo Hub" />
      <section className="card stack">
        <h2 className="title">Share your runs on the Hub?</h2>
        <p>The Hub is where runners share runs and give each other a ritmo. It is off until you turn it on.</p>
        <ul className="bullets">
          <li>Nothing is posted automatically. You choose each run and who sees it: everyone, your followers, or only you.</li>
          <li>Routes leave out the first and last 200 m, so your start and finish are not shown.</li>
          <li>Other runners see the name below. Never your email, date of birth, health check, pain or how runs felt.</li>
          <li>You can delete posts any time, and turning sharing off hides them all.</li>
        </ul>
        <div className="field"><label htmlFor="hub-name">Your name on the Hub</label><input id="hub-name" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></div>
        <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Approve new followers before they see my runs</label>
        {err && <StatusLine kind="danger">{err}</StatusLine>}
        <button className="btn btn-primary" disabled={!name.trim() || busy} onClick={async () => {
          setBusy(true); setErr(undefined);
          try { await onDone({ user_id: session!.user.id, display_name: name.trim(), private: priv, bio: existing?.bio ?? null, club: existing?.club ?? null }); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
        }}>Yes, share my runs on the Hub</button>
        <p className="caption">See <Link to="/profile/privacy">how Ritmo handles your data</Link>.</p>
      </section>
    </div>
  );
}

function FirstTimeTip() {
  const [show, setShow] = useState(() => { try { return !localStorage.getItem('ritmo:hub:tip'); } catch { return false; } });
  if (!show) return null;
  return (
    <div className="card row-between" role="note" style={{ gap: 8 }}>
      <span className="row" style={{ gap: 8 }}><Flame size={20} strokeWidth={2} color="var(--brand)" aria-hidden="true" /><span>Give a ritmo: Ritmo’s way of saying nice run.</span></span>
      <button className="btn btn-ghost btn-small" onClick={() => { setShow(false); try { localStorage.setItem('ritmo:hub:tip', '1'); } catch { /* */ } }}>Got it</button>
    </div>
  );
}

export function RouteThumb({ route, onDoubleTap }: { route: [number, number][]; onDoubleTap?: () => void }) {
  const [flare, setFlare] = useState(false);
  const last = useRef(0);
  const lats = route.map((p) => p[0]), lons = route.map((p) => p[1]);
  const [la0, la1, lo0, lo1] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const k = Math.cos(((la0 + la1) / 2) * Math.PI / 180);
  // Same scale both ways, centred in the frame
  const sx = (lo1 - lo0) * k, sy = la1 - la0;
  const scale = Math.min(280 / Math.max(sx, 1e-6), 140 / Math.max(sy, 1e-6));
  const ox = 10 + (280 - sx * scale) / 2, oy = 10 + (140 - sy * scale) / 2;
  const pts = route.map(([la, lo]) => `${ox + (lo - lo0) * k * scale},${oy + (la1 - la) * scale}`).join(' ');
  const tap = () => { const now = Date.now(); if (now - last.current < 320) { onDoubleTap?.(); setFlare(true); setTimeout(() => setFlare(false), 400); } last.current = now; };
  return (
    <div className="hub-route" onClick={tap} onDoubleClick={(e) => e.preventDefault()}>
      <svg viewBox="0 0 300 160" role="img" aria-label="Route (start and finish hidden)"><polyline points={pts} fill="none" stroke="var(--brand)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" /></svg>
      {flare && <Flame className="hub-flare" size={64} strokeWidth={0} fill="var(--brand)" aria-hidden="true" />}
    </div>
  );
}

function PostCard({ post: p, author, mineRitmo, own, onRitmo, onComments, onGivers, onDelete, onReport, onBlock }: {
  post: Post; author?: HubProfile; mineRitmo: boolean; own: boolean; onRitmo: (on: boolean) => void; onComments: () => void; onGivers: () => void;
  onDelete: () => Promise<void>; onReport: (why: string) => Promise<void>; onBlock: () => Promise<void>;
}) {
  const { data } = useApp();
  const U = data.profile.units;
  const [menu, setMenu] = useState(false);
  const [done, setDone] = useState<string>();
  const s = p.stats;
  return (
    <article className="card stack-sm hub-post" aria-labelledby={`post-${p.id}`}>
      <div className="row-between">
        <div className="row" style={{ gap: 10 }}>
          <span className="hub-avatar" aria-hidden="true">{initials(author?.display_name)}</span>
          <span className="stack-sm" style={{ gap: 0 }}><span className="label">{author?.display_name ?? 'Runner'}</span><span className="caption">{ago(p.created_at)}{p.city ? ` · ${p.city}` : ''}{own ? ` · ${p.visibility === 'everyone' ? 'Everyone' : p.visibility === 'followers' ? 'Followers' : 'Only you'}` : ''}</span></span>
        </div>
        <button className="icon-btn" aria-label="More" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><MoreHorizontal size={20} /></button>
      </div>
      {menu && (
        <div className="row wrap" style={{ gap: 6 }}>
          {own ? <button className="btn btn-small" onClick={() => void onDelete()}>Delete post</button> : <>
            <button className="btn btn-small" onClick={() => { void onReport('Reported from the feed'); setDone('Thanks, the post was reported.'); setMenu(false); }}>Report</button>
            <button className="btn btn-small" onClick={() => { void onBlock(); setMenu(false); }}>Block {author?.display_name ?? 'runner'}</button>
          </>}
        </div>
      )}
      {done && <StatusLine kind="info">{done}</StatusLine>}
      <h2 id={`post-${p.id}`} className="title">{p.title}</h2>
      {p.body && <p>{p.body}</p>}
      {p.show_map && p.route && p.route.length > 4 && <RouteThumb route={p.route} onDoubleTap={() => { if (!mineRitmo) onRitmo(true); }} />}
      <div className="hub-stats">
        <div><span className="caption">Distance</span><span className="stat">{dist(s.distanceM, U)}</span></div>
        <div><span className="caption">Time</span><span className="stat">{duration(Math.round(s.movingS))}</span></div>
        <div><span className="caption">Pace</span><span className="stat">{fmtPace(s.paceS, U)}</span></div>
        {s.elevGainM != null && <div><span className="caption">Climb</span><span className="stat">{s.elevGainM} m</span></div>}
        {p.show_hr && s.avgHr && <div><span className="caption">Avg HR</span><span className="stat">{s.avgHr}</span></div>}
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        {s.typeLabel && <span className="tag">{s.typeLabel}</span>}
        {s.compliance && <span className="tag tag-accent">{s.compliance}</span>}
        {(s.badges ?? []).map((b) => <span key={b} className="tag">{b}</span>)}
      </div>
      <div className="row-between hub-actions">
        <div className="row" style={{ gap: 6 }}>
          <button className={`btn btn-small ritmo-btn${mineRitmo ? ' on' : ''}`} aria-pressed={mineRitmo} aria-label={mineRitmo ? 'Take back your ritmo' : 'Give a ritmo'} onClick={() => onRitmo(!mineRitmo)}>
            <Flame size={18} strokeWidth={2} fill={mineRitmo ? 'var(--brand)' : 'none'} color="var(--brand)" aria-hidden="true" />Ritmo
          </button>
          {p.ritmo_count > 0 ? <button className="ritmo-count" onClick={onGivers} aria-label={`${hub.ritmoCount(p.ritmo_count)}: see who gave one`}><Flame size={12} strokeWidth={0} fill="var(--brand)" aria-hidden="true" />{p.ritmo_count}</button>
            : own ? <span className="caption">No ritmos yet</span> : null}
        </div>
        <button className="btn btn-small btn-ghost" onClick={onComments}><MessageCircle size={18} strokeWidth={2} aria-hidden="true" />{p.comment_count || ''}<span className="sr-only">comments</span></button>
      </div>
    </article>
  );
}

function CommentsSheet({ post, people, onClose }: { post: Post; people: Map<string, HubProfile>; onClose: () => void }) {
  const { session } = useApp();
  const uid = session!.user.id;
  const [list, setList] = useState<Comment[]>([]);
  const [names, setNames] = useState(people);
  const [text, setText] = useState('');
  const [reply, setReply] = useState<Comment>();
  const [editing, setEditing] = useState<Comment>();
  const [err, setErr] = useState<string>();
  const load = useCallback(async () => {
    const c = await hub.comments(post.id); setList(c);
    const missing = c.map((x) => x.user_id).filter((id) => !names.has(id));
    if (missing.length) { const more = await hub.profilesFor(missing); setNames((n) => new Map([...n, ...more])); }
  }, [post.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);
  const send = async () => {
    const body = hub.cleanText(text.trim());
    if (!body) return;
    setErr(undefined);
    try {
      if (editing) await hub.editComment(editing.id, body);
      else await hub.addComment({ id: crypto.randomUUID(), post_id: post.id, user_id: uid, parent_id: reply?.id, body });
      setText(''); setReply(undefined); setEditing(undefined); void load();
    } catch (e) { setErr((e as Error).message); }
  };
  const top = list.filter((c) => !c.parent_id);
  const Row = ({ c, child }: { c: Comment; child?: boolean }) => (
    <li className={`hub-comment${child ? ' child' : ''}`}>
      <span className="label">{names.get(c.user_id)?.display_name ?? 'Runner'}</span> <span className="caption">{ago(c.created_at)}{c.edited_at ? ' · edited' : ''}</span>
      <p>{c.body}</p>
      <div className="row wrap" style={{ gap: 4 }}>
        {!child && <button className="btn btn-ghost btn-small" onClick={() => { setReply(c); setEditing(undefined); }}>Reply</button>}
        {c.user_id === uid && <button className="btn btn-ghost btn-small" onClick={() => { setEditing(c); setReply(undefined); setText(c.body); }}>Edit</button>}
        {(c.user_id === uid || post.user_id === uid) && <button className="btn btn-ghost btn-small" onClick={async () => { await hub.deleteComment(c.id); void load(); }}>Delete</button>}
        {c.user_id !== uid && <button className="btn btn-ghost btn-small" onClick={async () => { await hub.report(uid, { comment_id: c.id }, 'Reported comment'); setErr('Thanks, the comment was reported.'); }}>Report</button>}
      </div>
    </li>
  );
  return (
    <Sheet open onClose={onClose} title="Comments"
      footer={<div className="stack-sm" style={{ width: '100%' }}>
        {(reply || editing) && <span className="caption">{editing ? 'Editing your comment' : `Replying to ${names.get(reply!.user_id)?.display_name ?? 'runner'}`} · <button className="link-btn" onClick={() => { setReply(undefined); setEditing(undefined); setText(''); }}>Cancel</button></span>}
        <div className="row" style={{ gap: 8 }}>
          <input className="input" aria-label="Write a comment" placeholder="Add a comment" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} />
          <button className="btn btn-primary" onClick={send} disabled={!text.trim()}>{editing ? 'Save' : 'Send'}</button>
        </div>
      </div>}>
      {err && <StatusLine kind="info">{err}</StatusLine>}
      {!list.length && <p className="muted">No comments yet.</p>}
      <ul className="list">{top.map((c) => <li key={c.id} style={{ listStyle: 'none' }}><ul className="list"><Row c={c} />{list.filter((x) => x.parent_id === c.id).map((r) => <Row key={r.id} c={r} child />)}</ul></li>)}</ul>
    </Sheet>
  );
}

function FollowButton({ other, follows, onChange }: { other: string; follows: hub.Follow[]; onChange?: () => void }) {
  const { session } = useApp();
  const uid = session!.user.id;
  const f = follows.find((x) => x.follower_id === uid && x.followee_id === other);
  const [state, setState] = useState(f?.status);
  if (other === uid) return null;
  return state
    ? <button className="btn btn-small" onClick={async () => { await hub.unfollow(uid, other); setState(undefined); onChange?.(); }}>{state === 'accepted' ? 'Following' : 'Requested'}</button>
    : <button className="btn btn-small btn-primary" onClick={async () => { await hub.follow(uid, other); setState('pending'); onChange?.(); }}><UserPlus size={16} strokeWidth={2} aria-hidden="true" />Follow</button>;
}

function GiversSheet({ post, follows, onClose }: { post: Post; following: string[]; follows: hub.Follow[]; onClose: () => void }) {
  const [givers, setGivers] = useState<HubProfile[]>([]);
  useEffect(() => { hub.ritmoGivers(post.id).then(async (ids) => { const m = await hub.profilesFor(ids); setGivers(ids.map((id) => m.get(id) ?? { user_id: id, display_name: 'Runner', private: true })); }).catch(() => {}); }, [post.id]);
  return (
    <Sheet open onClose={onClose} title={hub.ritmoCount(post.ritmo_count)}>
      <p className="caption">{hub.giversLine(givers.map((g) => g.display_name), post.ritmo_count)}</p>
      <ul className="list">{givers.map((g) => <li key={g.user_id} className="row-between" style={{ padding: 'var(--s2) 0' }}><span className="row" style={{ gap: 8 }}><span className="hub-avatar" aria-hidden="true">{initials(g.display_name)}</span>{g.display_name}</span><FollowButton other={g.user_id} follows={follows} /></li>)}</ul>
    </Sheet>
  );
}

function NotesSheet({ notes, people, follows, onChange, onClose }: { notes: Notification[]; people: Map<string, HubProfile>; follows: hub.Follow[]; onChange: () => void; onClose: () => void }) {
  const { session } = useApp();
  const uid = session!.user.id;
  // Batch: the same kind on the same post becomes one line ("Marco and 5 others gave your run a ritmo")
  const groups = new Map<string, Notification[]>();
  for (const n of notes) { const k = n.kind === 'follow_request' ? `${n.kind}:${n.actor_id}` : `${n.kind}:${n.post_id ?? n.actor_id}`; groups.set(k, [...(groups.get(k) ?? []), n]); }
  const name = (id?: string | null) => people.get(id ?? '')?.display_name ?? 'Someone';
  return (
    <Sheet open onClose={onClose} title="Notifications">
      {!notes.length && <p className="muted">Nothing yet.</p>}
      <ul className="list">
        {[...groups.values()].map((g) => {
          const n = g[0];
          const pending = n.kind === 'follow_request' && follows.some((f) => f.follower_id === n.actor_id && f.followee_id === uid && f.status === 'pending');
          return (
            <li key={`${n.kind}-${n.id}`} className="stack-sm" style={{ padding: 'var(--s2) 0' }}>
              <span className={g.some((x) => !x.read_at) ? 'label' : undefined}>{hub.notificationText(n.kind, [...new Set(g.map((x) => name(x.actor_id)))])}</span>
              <span className="caption">{ago(n.created_at)}</span>
              {pending && <div className="row" style={{ gap: 6 }}>
                <button className="btn btn-small btn-primary" onClick={async () => { await hub.acceptFollower(uid, n.actor_id!); onChange(); }}>Accept</button>
                <button className="btn btn-small" onClick={async () => { await hub.removeFollower(uid, n.actor_id!); onChange(); }}>Decline</button>
              </div>}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

function FindSheet({ follows, onChange, onClose }: { follows: hub.Follow[]; onChange: () => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<HubProfile[]>([]);
  useEffect(() => { if (q.trim().length < 2) { setRes([]); return; } const id = setTimeout(() => { hub.searchRunners(q.trim()).then(setRes).catch(() => setRes([])); }, 250); return () => clearTimeout(id); }, [q]);
  return (
    <Sheet open onClose={() => { onChange(); onClose(); }} title="Find runners">
      <input className="input" aria-label="Search by name" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="list">{res.map((p) => <li key={p.user_id} className="row-between" style={{ padding: 'var(--s2) 0' }}><span className="row" style={{ gap: 8 }}><span className="hub-avatar" aria-hidden="true">{initials(p.display_name)}</span><span className="stack-sm" style={{ gap: 0 }}><span>{p.display_name}</span>{p.club && <span className="caption">{p.club}</span>}</span></span><FollowButton other={p.user_id} follows={follows} /></li>)}</ul>
    </Sheet>
  );
}

function SettingsSheet({ me, onSaved, onStop, onClose }: { me: HubProfile; onSaved: (p: HubProfile) => void; onStop: () => Promise<void>; onClose: () => void }) {
  const [p, setP] = useState(me);
  const [msg, setMsg] = useState<string>();
  return (
    <Sheet open onClose={onClose} title="Hub settings"
      footer={<button className="btn btn-primary btn-block" onClick={async () => { await hub.saveHubProfile(p); onSaved(p); setMsg('Saved.'); }}>Save</button>}>
      <div className="field"><label htmlFor="hs-name">Name on the Hub</label><input id="hs-name" className="input" value={p.display_name} maxLength={60} onChange={(e) => setP({ ...p, display_name: e.target.value })} /></div>
      <div className="field"><label htmlFor="hs-club">Club (optional)</label><input id="hs-club" className="input" value={p.club ?? ''} maxLength={80} onChange={(e) => setP({ ...p, club: e.target.value || null })} /></div>
      <div className="field"><label htmlFor="hs-bio">About you (optional)</label><textarea id="hs-bio" className="input" value={p.bio ?? ''} maxLength={280} onChange={(e) => setP({ ...p, bio: e.target.value || null })} /></div>
      <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={p.private} onChange={(e) => setP({ ...p, private: e.target.checked })} /> Approve new followers before they see my runs</label>
      {msg && <StatusLine kind="success">{msg}</StatusLine>}
      <button className="btn btn-ghost" onClick={() => void onStop()}>Stop sharing and hide all my posts</button>
    </Sheet>
  );
}
