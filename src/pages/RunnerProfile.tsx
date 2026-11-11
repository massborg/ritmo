// The Hub profile (update 2, §13): every runner's page, opened from their name or photo anywhere on the Hub, or your
// own from the photo in the Hub header. Private accounts show the header and counts to non-followers, and say so.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Flame, Lock, Pencil, Search, Settings, Share2 } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { Empty, Segmented, StatusLine } from '../components/ui';
import { Sheet } from '../components/inputs';
import { RunnerAvatar } from '../components/RunnerAvatar';
import { FollowStateButton } from '../components/FollowButton';
import { PbStrip } from '../components/HubBits';
import { dist, duration, pace as fmtPace } from '../lib/format';
import * as hub from '../data/hub';
import type { HubProfile, Post } from '../data/hub';

type Tab = 'runs' | 'records';

export default function RunnerProfile() {
  const { id: param } = useParams();
  const { session, data } = useApp();
  const nav = useNavigate();
  const uid = session?.user.id;
  const id = param === 'me' || !param ? uid : param;
  const own = id === uid;
  const U = data.profile.units;
  const [p, setP] = useState<HubProfile | null>();
  const [counts, setCounts] = useState<hub.HubCounts>();
  const [follows, setFollows] = useState<hub.Follow[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [top, setTop] = useState<Post[]>();
  const [tab, setTab] = useState<Tab>('runs');
  const [msg, setMsg] = useState<string>();
  const [err, setErr] = useState<string>();
  const load = useCallback(async () => {
    if (!id || !uid) return;
    try {
      const [prof, c, f, ps] = await Promise.all([hub.profilesFor([id]).then((m) => m.get(id) ?? null), hub.hubCounts(id), hub.follows(uid), hub.postsBy(id)]);
      setP(prof); setCounts(c); setFollows(f); setPosts(ps);
    } catch (e) { setErr((e as Error).message); setP(null); }
  }, [id, uid]);
  useEffect(() => { void load(); }, [load]);

  if (!id) return null;
  if (p === undefined) return <div className="stack-lg"><AppHeader title="Profile" back large={false} /><p className="muted" role="status">Loading…</p></div>;
  if (p === null) return <div className="stack-lg"><AppHeader title="Profile" back large={false} /><Empty title={own ? 'You are not on the Hub yet' : 'Runner not found'} action={<Link to="/hub" className="btn">Go to the Hub</Link>}>{own ? 'Join the Hub to get a profile other runners can see.' : err ?? 'They may have left the Hub.'}</Empty></div>;

  const iFollow = follows.some((f) => f.follower_id === uid && f.followee_id === id && f.status === 'accepted');
  const canSee = own || !p.private || iFollow;
  const runs = p.stats?.runs;
  const streak = p.stats?.weekStreak ?? 0;
  const races = posts.filter((x) => x.stats?.type === 'race' || x.stats?.type === 'timetrial');
  const share = async () => {
    const url = `${window.location.origin}/hub/runner/${id}`;
    const text = `${p.display_name} on Ritmo`;
    try { if (navigator.share) await navigator.share({ title: text, url }); else { await navigator.clipboard.writeText(url); setMsg('Link copied.'); } } catch { /* cancelled */ }
  };
  const countBtn = (label: string, n: number | undefined, to: string, tint = false) => (
    <Link to={to} className={`profile-count${tint ? ' is-tinted' : ''}`}><span className="stat">{(n ?? 0).toLocaleString('en-GB')}</span><span className="caption">{label}</span></Link>
  );

  return (
    <div className="stack-lg runner-profile">
      <AppHeader title={own ? 'Your profile' : p.display_name} back large={false} right={own ? <>
        <Link className="icon-btn" aria-label="Find runners" to="/hub/find"><Search size={20} strokeWidth={2} /></Link>
        <Link className="icon-btn" aria-label="Hub and privacy" to="/profile/hub"><Settings size={20} strokeWidth={2} /></Link>
      </> : undefined} />

      <section className="stack profile-head">
        <div className="row" style={{ gap: 16 }}>
          <span className="profile-ring"><RunnerAvatar id={id} profile={p} size="lg" /></span>
          <div className="stack-sm" style={{ gap: 2, minWidth: 0 }}>
            <h2 className="title profile-name">{p.display_name}</h2>
            <span className="caption">{[runs != null ? `${runs.toLocaleString('en-GB')} run${runs === 1 ? '' : 's'}` : null, p.area || p.club].filter(Boolean).join(' · ')}</span>
          </div>
        </div>
        {p.bio && <p>{p.bio}</p>}
        {canSee && <PbStrip pbs={p.pbs} />}
        <div className="row wrap profile-flames">
          {streak > 0 && <span className="row" style={{ gap: 6 }}><Flame size={18} strokeWidth={2} className="flame" aria-hidden="true" /><span><strong>{streak}</strong> week streak</span></span>}
          <button type="button" className="link-btn row" style={{ gap: 6 }} onClick={async () => setTop(await hub.postsBy(id, 'fuego').catch(() => []))} disabled={!canSee}>
            <Flame size={18} strokeWidth={2} className="flame" aria-hidden="true" /><span><strong>{counts?.fuego ?? 0}</strong> Fuego received</span>
          </button>
        </div>
        <nav className="profile-counts" aria-label="Followers and following">
          {countBtn('Followers', counts?.followers, `/hub/runner/${own ? 'me' : id}/people/followers`)}
          {own && countBtn('Requests', counts?.requests, '/hub/runner/me/people/requests', (counts?.requests ?? 0) > 0)}
          {countBtn('Following', counts?.following, `/hub/runner/${own ? 'me' : id}/people/following`)}
        </nav>
        <div className="row" style={{ gap: 8 }}>
          {own ? <>
            <Link to="/hub/edit" className="btn btn-block"><Pencil size={18} strokeWidth={2} aria-hidden="true" />Edit profile</Link>
            <button className="btn btn-block" onClick={() => void share()}><Share2 size={18} strokeWidth={2} aria-hidden="true" />Share profile</button>
          </> : <FollowStateButton other={id} name={p.display_name} follows={follows} onChange={() => void load()} />}
        </div>
        {msg && <StatusLine kind="success">{msg}</StatusLine>}
      </section>

      {!canSee ? (
        <section className="card stack-sm private-note">
          <p className="label row" style={{ gap: 8 }}><Lock size={18} strokeWidth={2} aria-hidden="true" />This account is private</p>
          <p className="caption">Follow {p.display_name} to see their runs and records. They approve each follower.</p>
        </section>
      ) : <>
        <Segmented<Tab> label="Profile sections" value={tab} onChange={setTab} options={[{ value: 'runs', label: 'Runs' }, { value: 'records', label: 'Records' }]} />
        {tab === 'runs' && (posts.length
          ? <ul className="list card profile-runs">{posts.map((x) => (
            <li key={x.id}>
              {own && x.activity_id ? <Link to={`/activity/${x.activity_id}`} className="profile-run"><RunLine p={x} U={U} /></Link> : <div className="profile-run"><RunLine p={x} U={U} /></div>}
            </li>))}</ul>
          : <Empty title="No runs posted yet">{own ? 'New runs appear here once they are on the Hub.' : 'Runs they post will appear here.'}</Empty>)}
        {tab === 'records' && (
          <section className="stack">
            {p.pbs?.length ? <PbStrip pbs={p.pbs} /> : <p className="muted">{own ? <>No PBs shown. <Link to="/hub/edit#pbs" className="label">Choose PBs to show</Link></> : 'No PBs shown.'}</p>}
            {races.length > 0 && <>
              <h2 className="label">Races</h2>
              <ul className="list card profile-runs">{races.map((x) => <li key={x.id}><div className="profile-run"><RunLine p={x} U={U} /></div></li>)}</ul>
            </>}
          </section>
        )}
      </>}

      {top && (
        <Sheet open onClose={() => setTop(undefined)} title="Most Fuego'd runs">
          {top.length ? <ul className="list">{top.filter((x) => x.ritmo_count > 0).map((x) => <li key={x.id} className="profile-run"><RunLine p={x} U={U} /></li>)}</ul> : <p className="muted">No Fuego yet.</p>}
        </Sheet>
      )}
      {own && <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => nav('/hub')}>Back to the Hub</button>}
    </div>
  );
}

function RunLine({ p, U }: { p: Post; U: 'km' | 'mi' }) {
  const d = new Date(p.stats?.startedAt ?? p.created_at);
  return (
    <>
      <span className="stack-sm" style={{ gap: 0, flex: 1, minWidth: 0 }}>
        <span className="caption">{d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        <span className="label profile-run-title">{p.title}</span>
        <span className="caption">{dist(p.stats.distanceM, U)} · {fmtPace(p.stats.paceS, U)} · {duration(p.stats.movingS)}</span>
      </span>
      <span className="row caption" style={{ gap: 4 }}><Flame size={16} strokeWidth={2} className="flame" aria-hidden="true" />{p.ritmo_count}</span>
    </>
  );
}
