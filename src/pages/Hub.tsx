// Ritmo Hub (brief §9): Feed | Challenges | Clubs.
// - Feed: runs shared with other runners, one reaction ("Fuego"; stored as `ritmos`), comments, follows and
//   notifications. Behind a separate, opt-in sharing consent (off until the runner agrees).
// - Challenges: Ritmo-made, worked out on the device from the runner's own runs; no sharing needed.
// - Clubs: need the Hub profile (members see each other's names), see ./Club.tsx for a club's own page.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Award, Bell, ChevronRight, Flame, MapPin, MessageCircle, MoreHorizontal, Plus, Search, Settings, Share2, Trophy } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader, ZONE_OF } from '../components/app';
import { Sheet } from '../components/inputs';
import { Empty, Segmented, StatusLine } from '../components/ui';
import { dist, duration, pace as fmtPace } from '../lib/format';
import { fitView, mapsOn, TILE } from '../lib/maptiles';
import * as hub from '../data/hub';
import * as clubs from '../data/clubs';
import type { Comment, HubProfile, Notification, Post } from '../data/hub';
import type { Club, ClubMember, GroupRun, LeaderRow } from '../data/clubs';
import { badgeOf, badgeSrc, BADGES, catalogue, localDay, progress, type BadgeId, type Challenge, type JoinedChallenge } from '../training/challenges';
import { BadgeShelf, useChallenges } from '../components/Badges';
import { RunnerAvatar } from '../components/RunnerAvatar';
import { HUB_CONSENT_VERSION, autoPostUndecided } from '../training/autopost';
import { FollowStateButton } from '../components/FollowButton';
import { ZONE_NAMES } from '../training/fitness';
import type { SessionType } from '../lib/types';

export { HUB_CONSENT_VERSION } from '../training/autopost';
type Section = 'feed' | 'challenges' | 'clubs';
type Tab = 'following' | 'everyone' | 'mine';
export const initials = (n?: string) => (n ?? '?').split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/** Whether this runner has a Hub profile and has agreed to share. undefined while loading. */
export function useHubMe() {
  const { data, session } = useApp();
  const uid = session?.user.id;
  const consent = data.profile.consents?.hubSharing?.granted;
  const [me, setMe] = useState<HubProfile | null>();
  useEffect(() => { if (uid) hub.myHubProfile(uid).then((p) => setMe(p ?? null)).catch(() => setMe(null)); else setMe(null); }, [uid]);
  return { me, setMe, ready: !!(consent && me), loading: me === undefined };
}

export default function HubPage() {
  const { hasFlag, data, session, updateProfile } = useApp();
  const uid = session?.user.id;
  const [params, setParams] = useSearchParams();
  const section = (['feed', 'challenges', 'clubs'].includes(params.get('tab') ?? '') ? params.get('tab') : 'feed') as Section;
  const setSection = (s: Section) => setParams(s === 'feed' ? {} : { tab: s }, { replace: true });
  const { me, setMe, ready, loading } = useHubMe();
  const [notes, setNotes] = useState<Notification[]>([]);
  const [follows, setFollows] = useState<hub.Follow[]>([]);
  const [sheet, setSheet] = useState<'settings'>();
  const loadSocial = useCallback(async () => {
    if (!uid) return;
    try {
      const [f, n] = await Promise.all([hub.follows(uid), hub.notifications()]);
      setFollows(f); setNotes(n);
    } catch { /* the feed shows its own error */ }
  }, [uid]);
  useEffect(() => { if (ready) void loadSocial(); }, [ready, loadSocial]);

  if (!hasFlag('hub')) return <Empty title="Available with your own data" action={<Link to="/" className="btn">Back to Training</Link>}>The Hub opens once you are using Ritmo with your own runs rather than the sample data.</Empty>;
  const unread = notes.filter((n) => !n.read_at).length;
  const optIn = <OptIn existing={me ?? undefined} onDone={async (p) => {
    await hub.saveHubProfile(p);
    updateProfile({ consents: { ...data.profile.consents, hubSharing: { granted: true, at: new Date().toISOString(), version: HUB_CONSENT_VERSION } } });
    setMe(p);
  }} />;

  return (
    <div className="stack-lg">
      <AppHeader avatar={ready ? '/hub/runner/me' : true} title="Hub" right={ready ? <>
        <Link className="icon-btn icon-btn-round" aria-label="Find runners" to="/hub/find"><Search size={20} strokeWidth={2} /></Link>
        <Link className="icon-btn icon-btn-round hub-bell" aria-label={`Notifications${unread ? `, ${unread} new` : ''}`} to="/hub/notifications"><Bell size={20} strokeWidth={2} />{unread > 0 && <span className="hub-badge">{unread}</span>}</Link>
        <button className="icon-btn icon-btn-round" aria-label="Hub settings" onClick={() => setSheet('settings')}><Settings size={20} strokeWidth={2} /></button>
      </> : undefined} />
      <Segmented<Section> label="Hub sections" value={section} onChange={setSection} options={[{ value: 'feed', label: 'Feed' }, { value: 'challenges', label: 'Challenges' }, { value: 'clubs', label: 'Clubs' }]} />
      {section === 'challenges' ? <ChallengesTab canPost={ready} />
        : loading ? <p className="muted" role="status">Loading…</p>
        : !ready ? optIn
        : section === 'feed' ? <FeedTab follows={follows} onSocial={loadSocial} />
        : <ClubsTab me={me!} />}

      {sheet === 'settings' && me && <SettingsSheet me={me} onSaved={setMe} onClose={() => setSheet(undefined)} onStop={async () => {
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
  const { updateProfile } = useApp();
  const [auto, setAuto] = useState(data.profile.hub?.autoPost ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  return (
    <section className="card stack">
      <h2 className="title">Share your runs on the Hub?</h2>
      <p>The Hub is where runners share runs, give each other a Fuego and run together in clubs. It is off until you turn it on.</p>
      <ul className="bullets">
        <li>Your runs are posted automatically, to your followers. Runs from Strava never are: Strava's rules keep them private to you.</li>
        <li>You can turn automatic posting off, change who sees your posts, or hide any run, at any time.</li>
        <li>Routes leave out the first and last 200 m (up to 500 m if you prefer), so your start and finish are not shown.</li>
        <li>Other runners see the name below. Never your email, date of birth, health check, pain or how runs felt.</li>
        <li>You can delete posts any time, and turning sharing off hides them all.</li>
      </ul>
      <div className="field"><label htmlFor="hub-name">Your name on the Hub</label><input id="hub-name" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></div>
      <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> Approve new followers before they see my runs</label>
      <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Post my runs automatically</label>
      {err && <StatusLine kind="danger">{err}</StatusLine>}
      <button className="btn btn-primary" disabled={!name.trim() || busy} onClick={async () => {
        setBusy(true); setErr(undefined);
        try { updateProfile({ hub: { ...data.profile.hub, autoPost: auto, autoSince: auto ? new Date().toISOString() : data.profile.hub?.autoSince } }); await onDone({ user_id: session!.user.id, display_name: name.trim(), private: priv, bio: existing?.bio ?? null, club: existing?.club ?? null }); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
      }}>Yes, share my runs on the Hub</button>
      <p className="caption">Challenges work without sharing. See <Link to="/profile/privacy">how Ritmo handles your data</Link>.</p>
    </section>
  );
}

// ---------------------------------------------------------------- Feed

/** Posts with the reaction state, givers and authors, shared by the Hub feed and a club's feed. */
export function useFeed(load: () => Promise<Post[]>, deps: unknown[]) {
  const { session } = useApp();
  const uid = session?.user.id;
  const [posts, setPosts] = useState<Post[]>([]);
  const [people, setPeople] = useState<Map<string, HubProfile>>(new Map());
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [givers, setGivers] = useState<Map<string, string[]>>(new Map());
  const [err, setErr] = useState<string>();
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!uid) return;
    setLoading(true); setErr(undefined);
    try {
      const ps = await load();
      setPosts(ps);
      const ids = ps.map((p) => p.id);
      const [m, g] = await Promise.all([hub.myRitmos(uid, ids), hub.giversFor(ids).catch(() => new Map<string, string[]>())]);
      setMine(m); setGivers(g);
      setPeople(await hub.profilesFor([...ps.map((p) => p.user_id), ...[...g.values()].flat()]));
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  }, [uid, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, [reload]);
  const toggle = async (p: Post, on: boolean) => {
    if (!uid || p.user_id === uid) return; // no Fuego on your own run
    const flip = (give: boolean) => {
      setMine((s) => { const n = new Set(s); if (give) n.add(p.id); else n.delete(p.id); return n; });
      setPosts((ps) => ps.map((x) => (x.id === p.id ? { ...x, ritmo_count: Math.max(0, x.ritmo_count + (give ? 1 : -1)) } : x)));
      setGivers((g) => { const n = new Map(g); const l = (n.get(p.id) ?? []).filter((x) => x !== uid); n.set(p.id, give ? [uid, ...l].slice(0, 3) : l); return n; });
    };
    flip(on); // optimistic, rolled back on error
    try { await hub.setRitmo(uid, p.id, on); } catch { flip(!on); }
  };
  return { posts, setPosts, people, mine, givers, toggle, reload, err, loading };
}

/** For runners who joined before automatic posting existed: asked once, nothing is posted until they choose */
function AutoPostNotice() {
  const { data, updateProfile } = useApp();
  if (!autoPostUndecided(data.profile)) return null;
  const h = data.profile.hub ?? {};
  return (
    <section className="card stack-sm" aria-labelledby="autopost-h">
      <h2 id="autopost-h" className="label">New: post your runs automatically</h2>
      <p className="caption">New runs go on the Hub for your followers without you having to post each one. Runs from Strava are never posted. You can change who sees them, hide any run, or turn this off in Hub and privacy.</p>
      <div className="row wrap" style={{ gap: 8 }}>
        <button className="btn btn-small btn-primary" onClick={() => updateProfile({ hub: { ...h, autoPost: true, autoSince: new Date().toISOString() } })}>Post automatically</button>
        <button className="btn btn-small" onClick={() => updateProfile({ hub: { ...h, autoPost: false } })}>Not now</button>
      </div>
    </section>
  );
}

function FeedTab({ follows, onSocial }: { follows: hub.Follow[]; onSocial: () => void }) {
  const { session } = useApp();
  const uid = session!.user.id;
  const [tab, setTab] = useState<Tab>('following');
  const following = useMemo(() => follows.filter((f) => f.follower_id === uid && f.status === 'accepted').map((f) => f.followee_id), [follows, uid]);
  const feed = useFeed(() => hub.feed(uid, tab, following), [tab, following.join()]);
  const [sheet, setSheet] = useState<{ kind: 'comments' | 'givers'; post: Post }>();
  return (
    <div className="stack">
      <div className="row wrap hub-filter" role="group" aria-label="Show runs from">
        {([['following', 'Following'], ['everyone', 'Everyone'], ['mine', 'Your runs']] as [Tab, string][]).map(([v, l]) => <button key={v} type="button" className="chip" aria-pressed={tab === v} onClick={() => setTab(v)}>{l}</button>)}
      </div>
      <AutoPostNotice />
      <YourWeek />
      <FirstTimeTip />
      {feed.err && <StatusLine kind="danger">{feed.err}</StatusLine>}
      {feed.loading && !feed.posts.length && <p className="muted" role="status">Loading runs…</p>}
      {!feed.loading && !feed.posts.length && <Empty title={tab === 'mine' ? 'You have not posted a run yet' : 'Nothing here yet'}>{tab === 'mine' ? 'New runs appear here once posted. You can also open any run and choose "Post to Hub".' : tab === 'following' ? 'Find runners to follow with the search button.' : 'Public runs appear here.'}</Empty>}
      <PostList feed={feed} onComments={(p) => setSheet({ kind: 'comments', post: p })} onGivers={(p) => setSheet({ kind: 'givers', post: p })} />
      {sheet?.kind === 'comments' && <CommentsSheet post={sheet.post} people={feed.people} onClose={() => { setSheet(undefined); void feed.reload(); }} />}
      {sheet?.kind === 'givers' && <GiversSheet post={sheet.post} follows={follows} onClose={() => { setSheet(undefined); onSocial(); }} />}
    </div>
  );
}

export function PostList({ feed, onComments, onGivers }: { feed: ReturnType<typeof useFeed>; onComments: (p: Post) => void; onGivers: (p: Post) => void }) {
  const { session } = useApp();
  const uid = session!.user.id;
  return (
    <div className="hub-feed">
      {feed.posts.map((p) => <PostCard key={p.id} post={p} author={feed.people.get(p.user_id)} people={feed.people} givers={feed.givers.get(p.id) ?? []} given={feed.mine.has(p.id)} own={p.user_id === uid}
        onFuego={(on) => feed.toggle(p, on)} onComments={() => onComments(p)} onGivers={() => onGivers(p)}
        onDelete={async () => { await hub.deletePost(p.id); feed.setPosts((ps) => ps.filter((x) => x.id !== p.id)); }}
        onReport={async (why) => { await hub.report(uid, { post_id: p.id }, why); }}
        onBlock={async () => { await hub.block(uid, p.user_id); void feed.reload(); }} />)}
    </div>
  );
}

/** This week's distance, runs and time, with a bar per day (today in orange). Every source counts: only you see it. */
function YourWeek() {
  const { data } = useApp();
  const U = data.profile.units;
  const now = new Date();
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => localDay(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i)));
  const runs = data.activities.filter((a) => days.includes(localDay(new Date(a.startTime))));
  const per = days.map((d) => runs.filter((a) => localDay(new Date(a.startTime)) === d).reduce((s, a) => s + a.distanceM, 0));
  const max = Math.max(...per, 1);
  const total = runs.reduce((s, a) => s + a.distanceM, 0), time = runs.reduce((s, a) => s + a.movingS, 0);
  const today = localDay(now);
  return (
    <Link to="/you" className="card hub-week" aria-label={`Your week: ${dist(total, U)}, ${runs.length} run${runs.length === 1 ? '' : 's'}, ${duration(Math.round(time))}`}>
      <div className="stack-sm" style={{ gap: 2 }}>
        <span className="label">Your week</span>
        <span className="stat">{dist(total, U)} · {runs.length} run{runs.length === 1 ? '' : 's'} · {duration(Math.round(time))}</span>
      </div>
      <div className="hub-week-bars" aria-hidden="true">
        {per.map((m, i) => <div key={days[i]} className="hub-week-day"><span className={`hub-week-bar${days[i] === today ? ' today' : ''}${m ? '' : ' empty'}`} style={{ height: m ? `${Math.max(12, (m / max) * 100)}%` : undefined }} /><span className="hub-week-letter">{'MTWTFSS'[i]}</span></div>)}
      </div>
    </Link>
  );
}

function FirstTimeTip() {
  const [show, setShow] = useState(() => { try { return !localStorage.getItem('ritmo:hub:tip'); } catch { return false; } });
  if (!show) return null;
  return (
    <div className="card row-between" role="note" style={{ gap: 8 }}>
      <span className="row" style={{ gap: 8 }}><Flame size={20} strokeWidth={2} color="var(--brand)" aria-hidden="true" /><span>Give a Fuego: Ritmo’s way of saying nice run.</span></span>
      <button className="btn btn-ghost btn-small" onClick={() => { setShow(false); try { localStorage.setItem('ritmo:hub:tip', '1'); } catch { /* */ } }}>Got it</button>
    </div>
  );
}

/** The route on a muted map, full width (start and finish already trimmed off when it was posted). */
export function PostMap({ route, onDoubleTap }: { route: [number, number][]; onDoubleTap?: () => void }) {
  const [flare, setFlare] = useState(false);
  const last = useRef(0);
  const W = 390, H = 230;
  const pts = route.map(([lat, lon]) => ({ lat, lon }));
  const view = fitView(pts, W, H, 28, 16);
  const tap = () => { const now = Date.now(); if (now - last.current < 320) { onDoubleTap?.(); setFlare(true); setTimeout(() => setFlare(false), 400); } last.current = now; };
  if (!view) return null;
  const line = pts.map((p) => { const v = view.toView(p.lat, p.lon); return `${v.x.toFixed(1)},${v.y.toFixed(1)}`; }).join(' ');
  const s = view.toView(pts[0].lat, pts[0].lon);
  const tiles = mapsOn();
  return (
    <div className="hub-route" onClick={tap} onDoubleClick={(e) => e.preventDefault()}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label="Route (start and finish hidden)">
        {tiles && view.tiles.map((t) => <image key={`${t.z}/${t.x}/${t.y}/${t.left}`} href={t.url} x={t.left} y={t.top} width={TILE} height={TILE} preserveAspectRatio="none" className="route-tile" />)}
        <polyline points={line} fill="none" stroke="var(--surface-raised)" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" opacity="0.8" />
        <polyline points={line} fill="none" stroke="var(--brand)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={s.x} cy={s.y} r="6" fill="var(--surface-raised)" stroke="var(--ink)" strokeWidth="2.5" />
      </svg>
      {tiles && <a className="run-map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>© OpenStreetMap</a>}
      {flare && <Flame className="hub-flare" size={64} strokeWidth={0} fill="var(--brand)" aria-hidden="true" />}
    </div>
  );
}

function PostCard({ post: p, author, people, givers, given, own, onFuego, onComments, onGivers, onDelete, onReport, onBlock }: {
  post: Post; author?: HubProfile; people: Map<string, HubProfile>; givers: string[]; given: boolean; own: boolean; onFuego: (on: boolean) => void; onComments: () => void; onGivers: () => void;
  onDelete: () => Promise<void>; onReport: (why: string) => Promise<void>; onBlock: () => Promise<void>;
}) {
  const { data } = useApp();
  const U = data.profile.units;
  const [menu, setMenu] = useState(false);
  const [done, setDone] = useState<string>();
  const s = p.stats;
  const challenge = s.type === 'challenge';
  // A race is just "Race": no training zone next to it
  const z = s.type && s.type !== 'race' && s.type !== 'challenge' ? ZONE_OF[s.type as SessionType] : undefined;
  const meta = [hub.whenLine(s.startedAt ?? p.created_at), s.device].filter(Boolean).join(' · ');
  const posted = s.startedAt && s.startedAt.slice(0, 10) !== p.created_at.slice(0, 10) ? `Posted ${ago(p.created_at)}` : undefined;
  const share = async () => {
    const text = challenge ? `${p.title} on Ritmo` : `${p.title}: ${dist(s.distanceM, U)} at ${fmtPace(s.paceS, U)} on Ritmo`;
    try {
      if (navigator.share) { await navigator.share({ title: p.title, text, url: 'https://app.ritmorunning.run/hub' }); return; }
      await navigator.clipboard.writeText(`${text} https://app.ritmorunning.run/hub`); setDone('Link copied.');
    } catch { /* closed the share sheet */ }
  };
  return (
    <article className="hub-post" aria-labelledby={`post-${p.id}`}>
      <div className="hub-post-head">
        <Link to={`/hub/runner/${p.user_id}`} aria-label={`${author?.display_name ?? 'Runner'}'s profile`}><RunnerAvatar id={p.user_id} profile={author} /></Link>
        <div className="hub-post-who">
          <Link to={`/hub/runner/${p.user_id}`} className="label runner-link">{author?.display_name ?? 'Runner'}</Link>
          <span className="caption">{meta}{own ? ` · ${p.visibility === 'everyone' ? 'Everyone' : p.visibility === 'followers' ? 'Followers' : 'Only you'}` : ''}</span>
          {(p.city || posted) && <span className="caption row" style={{ gap: 4 }}>{p.city && <><MapPin size={13} strokeWidth={2} aria-hidden="true" />{p.city}</>}{p.city && posted ? ' · ' : ''}{posted}</span>}
        </div>
        <button className="icon-btn" aria-label="More" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><MoreHorizontal size={20} /></button>
      </div>
      {menu && (
        <div className="row wrap hub-post-pad" style={{ gap: 6 }}>
          {own ? <button className="btn btn-small" onClick={() => void onDelete()}>Delete post</button> : <>
            <button className="btn btn-small" onClick={() => { void onReport('Reported from the feed'); setDone('Thanks, the post was reported.'); setMenu(false); }}>Report</button>
            <button className="btn btn-small" onClick={() => { void onBlock(); setMenu(false); }}>Block {author?.display_name ?? 'runner'}</button>
          </>}
        </div>
      )}
      {done && <div className="hub-post-pad"><StatusLine kind="info">{done}</StatusLine></div>}
      <div className="hub-post-pad stack-sm">
        <h2 id={`post-${p.id}`} className="hub-post-title">{p.title}</h2>
        <div className="row wrap" style={{ gap: 6 }}>
          {challenge ? <span className="tag tag-accent"><Award size={14} strokeWidth={2} aria-hidden="true" />Challenge complete</span>
            : s.typeLabel && <span className="zone-chip">{z && <span className={`zone-dot z${z}`} aria-hidden="true" />}{s.typeLabel}{z ? <span className="sr-only"> (Z{z} {ZONE_NAMES[z - 1]})</span> : null}</span>}
          {s.compliance && <span className="tag tag-accent">{s.compliance}</span>}
          {!challenge && (s.badges ?? []).map((b) => <span key={b} className="tag">{b}</span>)}
        </div>
        {p.body && <p>{p.body}</p>}
        {challenge ? (
          <div className="hub-badge-post">{s.badgeId && (BADGES as readonly string[]).includes(s.badgeId) ? <img className="badge-img badge-img-lg" src={badgeSrc(s.badgeId as BadgeId)} alt="" width={72} height={72} /> : <span className="badge-icon" aria-hidden="true"><Trophy size={26} strokeWidth={2} /></span>}<span className="stack-sm" style={{ gap: 2 }}><span className="label">{(s.badges ?? [])[0] ?? p.title}</span><span className="caption">Completed</span></span></div>
        ) : (
          <div className="hub-stats">
            <div><span className="caption">Distance</span><span className="stat">{dist(s.distanceM, U)}</span></div>
            <div><span className="caption">Pace</span><span className="stat">{fmtPace(s.paceS, U)}</span></div>
            <div><span className="caption">Time</span><span className="stat">{duration(Math.round(s.movingS))}</span></div>
            {p.show_hr && s.avgHr ? <div><span className="caption">Avg HR</span><span className="stat">{Math.round(s.avgHr)}</span></div> : null}
          </div>
        )}
      </div>
      {!challenge && p.show_map && p.route && p.route.length > 4 && <PostMap route={p.route} onDoubleTap={own ? undefined : () => { if (!given) onFuego(true); }} />}
      <div className="hub-summary hub-post-pad">
        {p.ritmo_count > 0 ? (
          <button className="hub-givers" onClick={onGivers} aria-label={`${hub.fuegoCount(p.ritmo_count)}: see who gave one`}>
            <span className="hub-stack" aria-hidden="true">{givers.slice(0, 3).map((g) => <RunnerAvatar key={g} id={g} profile={people.get(g)} size="xs" />)}</span>
            <span className="ritmo-count">{hub.fuegoCount(p.ritmo_count)}</span>
          </button>
        ) : <span className="caption">{own ? 'No Fuego yet' : ''}</span>}
        {p.comment_count > 0 && <button className="link-btn caption" onClick={onComments}>{p.comment_count} comment{p.comment_count === 1 ? '' : 's'}</button>}
      </div>
      <div className={`hub-actions${own ? ' two' : ''}`}>
        {/* No Fuego on your own run */}
        {!own && <button className={`hub-action fuego-btn${given ? ' on' : ''}`} aria-pressed={given} aria-label={given ? 'Remove your Fuego' : 'Give a Fuego'} onClick={() => onFuego(!given)}>
          <Flame size={20} strokeWidth={2} fill={given ? 'var(--brand)' : 'none'} aria-hidden="true" />Fuego
        </button>}
        <button className="hub-action" onClick={onComments} aria-label={`Comment${p.comment_count ? `, ${p.comment_count} comments` : ''}`}><MessageCircle size={20} strokeWidth={2} aria-hidden="true" />Comment</button>
        <button className="hub-action" onClick={() => void share()}><Share2 size={20} strokeWidth={2} aria-hidden="true" />Share</button>
      </div>
    </article>
  );
}

export function CommentsSheet({ post, people, onClose }: { post: Post; people: Map<string, HubProfile>; onClose: () => void }) {
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
      <span className="row" style={{ gap: 8 }}><Link to={`/hub/runner/${c.user_id}`} aria-hidden="true" tabIndex={-1}><RunnerAvatar id={c.user_id} profile={names.get(c.user_id)} size={child ? 'xs' : 'md'} /></Link><span><Link to={`/hub/runner/${c.user_id}`} className="label runner-link">{names.get(c.user_id)?.display_name ?? 'Runner'}</Link> <span className="caption">{ago(c.created_at)}{c.edited_at ? ' · edited' : ''}</span></span></span>
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

export function GiversSheet({ post, follows, onClose }: { post: Post; follows: hub.Follow[]; onClose: () => void }) {
  const [givers, setGivers] = useState<HubProfile[]>([]);
  useEffect(() => { hub.ritmoGivers(post.id).then(async (ids) => { const m = await hub.profilesFor(ids); setGivers(ids.map((id) => m.get(id) ?? { user_id: id, display_name: 'Runner', private: true })); }).catch(() => {}); }, [post.id]);
  return (
    <Sheet open onClose={onClose} title="Fuego from">
      <p className="caption">{hub.giversLine(givers.map((g) => g.display_name), post.ritmo_count)}</p>
      <ul className="list">{givers.map((g) => <li key={g.user_id} className="row-between" style={{ padding: 'var(--s2) 0' }}><Link to={`/hub/runner/${g.user_id}`} className="row runner-link" style={{ gap: 8 }}><RunnerAvatar id={g.user_id} profile={g} />{g.display_name}</Link><FollowStateButton other={g.user_id} name={g.display_name} follows={follows} onChange={() => undefined} /></li>)}</ul>
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
      <Link to="/profile/hub" className="btn btn-ghost" onClick={onClose}>Automatic posting, map privacy and your photo</Link>
      <button className="btn btn-ghost" onClick={() => void onStop()}>Stop sharing and hide all my posts</button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Challenges

function ChallengesTab({ canPost }: { canPost: boolean }) {
  const { data, updateProfile, session } = useApp();
  const U = data.profile.units;
  const joined = useChallenges();
  const today = new Date();
  // Running ones, and finished ones for two weeks (then they live on as badges)
  const recent = (j: JoinedChallenge) => (!j.completedAt ? localDay(today) <= j.challenge.end : Date.now() - new Date(j.completedAt).getTime() < 14 * 86400e3);
  const active = joined.filter(recent);
  const offered = catalogue(today, U).filter((c) => !joined.some((j) => j.challenge.id === c.id));
  const [msg, setMsg] = useState<string>();
  const set = (list: JoinedChallenge[]) => updateProfile({ challenges: list });
  const share = async (j: JoinedChallenge) => {
    try {
      await hub.createPost({
        id: crypto.randomUUID(), user_id: session!.user.id, activity_id: null, title: `Completed: ${j.challenge.title}`, body: null, visibility: 'followers',
        show_map: false, show_hr: false, route: null, city: null,
        // Only the badge and "Completed" are shared: the totals can include Strava runs, which others may never see
        stats: { distanceM: 0, movingS: 0, paceS: 0, type: 'challenge', typeLabel: 'Challenge complete', badges: [j.challenge.title], badgeId: badgeOf(j.challenge), challengeId: j.challenge.id },
      });
      set(joined.map((x) => (x.challenge.id === j.challenge.id ? { ...x, sharedAt: new Date().toISOString() } : x)));
      setMsg('Shared with your followers.');
    } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <div className="stack-lg">
      <section className="stack" aria-labelledby="ch-yours">
        <h2 id="ch-yours" className="title">Your challenges</h2>
        {!active.length && <p className="muted">{joined.some((j) => j.completedAt) ? 'No challenge running right now. Your finished ones are under Badges. Pick a new one below.' : 'You have not joined a challenge yet. Pick one below: your runs count automatically, including runs imported from Strava.'}</p>}
        {msg && <StatusLine kind="info">{msg}</StatusLine>}
        {active.map((j) => {
          const p = progress(j.challenge, data.activities, U);
          return (
            <article key={j.challenge.id} className="card stack-sm challenge-card" aria-label={j.challenge.title}>
              <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                {/* Earned: the challenge's own medal. Still going: the locked medal until it is finished */}
                <img className="badge-img" src={badgeSrc(p.done ? badgeOf(j.challenge) : 'locked')} alt={p.done ? `${j.challenge.title} badge` : 'Badge not earned yet'} width={52} height={52} />
                <div className="stack-sm" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                  <div className="row-between" style={{ gap: 8 }}><span className="label">{j.challenge.title}</span><span className={`tag${p.done ? ' tag-accent' : ''}`}>{p.done ? 'Complete' : 'Joined'}</span></div>
                  <span className="caption">{j.challenge.description}</span>
                </div>
              </div>
              <div className="progress" role="progressbar" aria-label={`${j.challenge.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p.frac * 100)}><span style={{ width: `${p.frac * 100}%` }} /></div>
              <span className="challenge-line">{p.line}</span>
              <div className="row wrap" style={{ gap: 6 }}>
                {p.done && canPost && !j.sharedAt && <button className="btn btn-small btn-primary" onClick={() => void share(j)}>Share to Feed</button>}
                {!p.done && <button className="btn btn-small btn-ghost" onClick={() => set(joined.filter((x) => x.challenge.id !== j.challenge.id))}>Leave</button>}
              </div>
            </article>
          );
        })}
      </section>
      <section className="stack" aria-labelledby="ch-join">
        <h2 id="ch-join" className="title">Join a challenge</h2>
        {offered.map((c: Challenge) => (
          <article key={c.id} className="card row challenge-card" style={{ gap: 12 }} aria-label={c.title}>
            <img className="badge-img" src={badgeSrc(badgeOf(c))} alt={`The ${c.title} badge you can earn`} width={52} height={52} />
            <div className="stack-sm" style={{ gap: 2, flex: 1, minWidth: 0 }}><span className="label">{c.title}</span><span className="caption">{c.description}</span></div>
            <button className="btn btn-small" aria-label={`Join ${c.title}`} onClick={() => set([...joined, { challenge: c, joinedAt: new Date().toISOString() }])}>Join</button>
          </article>
        ))}
      </section>
      <BadgeShelf />
    </div>
  );
}

// ---------------------------------------------------------------- Clubs

function ClubsTab({ me }: { me: HubProfile }) {
  const { session } = useApp();
  const uid = session!.user.id;
  const [state, setState] = useState<{ mine: ClubMember[]; clubs: Club[]; runs: GroupRun[]; going: Set<string>; board: LeaderRow[] }>();
  const [missing, setMissing] = useState(false);
  const [err, setErr] = useState<string>();
  const [find, setFind] = useState(false);
  const load = useCallback(async () => {
    setErr(undefined);
    try {
      const mine = await clubs.myMemberships(uid);
      const list = await clubs.clubsByIds(mine.map((m) => m.club_id));
      list.sort((a, b) => mine.findIndex((m) => m.club_id === a.id) - mine.findIndex((m) => m.club_id === b.id));
      const runs = await clubs.groupRuns(list.map((c) => c.id));
      const going = await clubs.myGoing(uid, runs.map((r) => r.id));
      const board = list[0] ? await clubs.leaderboard(list[0].id, clubs.periodStart('week')).catch(() => []) : [];
      setState({ mine, clubs: list, runs, going, board });
    } catch (e) { if (clubs.notReady(e)) setMissing(true); else setErr((e as Error).message); }
  }, [uid]);
  useEffect(() => { void load(); }, [load]);
  if (missing) return <Empty title="Clubs are almost ready">Clubs open here soon: group runs, who is going and a weekly leaderboard with your club.</Empty>;
  if (err) return <StatusLine kind="danger">{err}</StatusLine>;
  if (!state) return <p className="muted" role="status">Loading clubs…</p>;
  const [main, ...others] = state.clubs;
  return (
    <div className="stack-lg">
      {!main && <Empty title="You are not in a club yet" action={<button className="btn btn-primary" onClick={() => setFind(true)}><Search size={18} strokeWidth={2} aria-hidden="true" />Find a club</button>}>Run with others: see your club's group runs, say you are going and climb the weekly leaderboard.</Empty>}
      {main && <ClubCard club={main} runs={state.runs.filter((r) => r.club_id === main.id)} going={state.going} board={state.board} uid={uid} me={me} onChange={load} />}
      {others.length > 0 && (
        <section className="stack-sm" aria-labelledby="club-others">
          <h2 id="club-others" className="label">Your other clubs</h2>
          <ul className="list card">{others.map((c) => <li key={c.id}><Link to={`/hub/club/${c.id}`} className="club-row"><span className="club-logo club-logo-sm" aria-hidden="true">{initials(c.name)}</span><span className="stack-sm" style={{ gap: 0, flex: 1 }}><span className="label">{c.name}</span><span className="caption">{c.member_count} member{c.member_count === 1 ? '' : 's'}{c.area ? ` · ${c.area}` : ''}</span></span><ChevronRight size={18} aria-hidden="true" /></Link></li>)}</ul>
        </section>
      )}
      {main && <button className="btn" onClick={() => setFind(true)}><Search size={18} strokeWidth={2} aria-hidden="true" />Find a club</button>}
      {find && <FindClubSheet joined={new Set(state.clubs.map((c) => c.id))} onClose={() => setFind(false)} onJoined={() => { setFind(false); void load(); }} />}
    </div>
  );
}

export function GoingButton({ run, going, onChange }: { run: GroupRun; going: boolean; onChange: () => void }) {
  const { session } = useApp();
  const [on, setOn] = useState(going);
  const [n, setN] = useState(run.going_count);
  useEffect(() => { setOn(going); setN(run.going_count); }, [going, run.going_count]);
  return (
    <div className="row" style={{ gap: 8 }}>
      <span className="caption">{n} going</span>
      <button className={`btn btn-small${on ? ' btn-graphite' : ''}`} aria-pressed={on} onClick={async () => {
        const next = !on; setOn(next); setN((x) => x + (next ? 1 : -1));
        try { await clubs.setGoing(session!.user.id, run.id, next); onChange(); } catch { setOn(!next); setN((x) => x + (next ? -1 : 1)); }
      }}>{on ? 'Going' : 'Going?'}</button>
    </div>
  );
}

export function GroupRunRow({ run, going, onChange }: { run: GroupRun; going: boolean; onChange: () => void }) {
  const { data } = useApp();
  const b = clubs.dateBlock(run.starts_at);
  return (
    <div className="group-run">
      <span className="date-block" aria-hidden="true"><span className="date-block-m">{b.month}</span><span className="date-block-d">{b.day}</span></span>
      <div className="stack-sm" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        <span className="label">{run.title}</span>
        <span className="caption">{b.weekday} {b.time}{run.meeting_point ? ` · ${run.meeting_point}` : ''}</span>
        {(run.distance_m || run.pace_group) && <span className="caption">{[run.distance_m ? dist(run.distance_m, data.profile.units) : '', run.pace_group ?? ''].filter(Boolean).join(' · ')}</span>}
      </div>
      <GoingButton run={run} going={going} onChange={onChange} />
    </div>
  );
}

export function Leaderboard({ rows, uid, top = 3 }: { rows: LeaderRow[]; uid: string; top?: number }) {
  const { data } = useApp();
  const U = data.profile.units;
  const shown = rows.slice(0, top);
  const meIdx = rows.findIndex((r) => r.user_id === uid);
  if (!rows.length) return <p className="caption">No runs counted yet. Only members who chose to be on the leaderboard are listed.</p>;
  const Row = ({ r, i }: { r: LeaderRow; i: number }) => <li className={`leader-row${r.user_id === uid ? ' me' : ''}`}><span className="leader-rank">{i + 1}</span><RunnerAvatar id={r.user_id} name={r.display_name} size="xs" /><span className="leader-name">{r.user_id === uid ? 'You' : r.display_name}</span><span className="stat">{dist(r.distance_m, U)}</span></li>;
  return (
    <ol className="leaderboard">
      {shown.map((r, i) => <Row key={r.user_id} r={r} i={i} />)}
      {meIdx >= top && <Row r={rows[meIdx]} i={meIdx} />}
    </ol>
  );
}

function ClubCard({ club, runs, going, board, uid, onChange }: { club: Club; runs: GroupRun[]; going: Set<string>; board: LeaderRow[]; uid: string; me: HubProfile; onChange: () => void }) {
  const { data } = useApp();
  const next = runs[0];
  return (
    <article className="card stack club-card" aria-labelledby={`club-${club.id}`}>
      <Link to={`/hub/club/${club.id}`} className="club-row" aria-label={`Open ${club.name}`}>
        <span className="club-logo" aria-hidden="true">{initials(club.name)}</span>
        <span className="stack-sm" style={{ gap: 0, flex: 1 }}><span id={`club-${club.id}`} className="label">{club.name}</span><span className="caption">{club.member_count} member{club.member_count === 1 ? '' : 's'}{club.area ? ` · ${club.area}` : ''}</span></span>
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
      <div className="stack-sm">
        <span className="caption">Next group run</span>
        {next ? <GroupRunRow run={next} going={going.has(next.id)} onChange={onChange} /> : <p className="caption">No group run planned yet.</p>}
      </div>
      <div className="stack-sm">
        <span className="caption">This week's leaderboard ({data.profile.units})</span>
        <Leaderboard rows={board} uid={uid} />
      </div>
    </article>
  );
}

function FindClubSheet({ joined, onClose, onJoined }: { joined: Set<string>; onClose: () => void; onJoined: () => void }) {
  const { session } = useApp();
  const uid = session!.user.id;
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Club[]>([]);
  const [board, setBoard] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', area: '', about: '' });
  const [err, setErr] = useState<string>();
  useEffect(() => { const id = setTimeout(() => { clubs.findClubs(q).then(setRes).catch((e) => setErr((e as Error).message)); }, 250); return () => clearTimeout(id); }, [q]);
  return (
    <Sheet open onClose={onClose} title={creating ? 'Start a club' : 'Find a club'}
      footer={creating ? <button className="btn btn-primary btn-block" disabled={form.name.trim().length < 2} onClick={async () => {
        try { await clubs.createClub(uid, form); onJoined(); } catch (e) { setErr((e as Error).message); }
      }}>Start the club</button> : undefined}>
      {err && <StatusLine kind="danger">{err}</StatusLine>}
      {creating ? <>
        <div className="field"><label htmlFor="club-name">Club name</label><input id="club-name" className="input" maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="club-area">Area (optional)</label><input id="club-area" className="input" maxLength={60} value={form.area} placeholder="Town or neighbourhood" onChange={(e) => setForm({ ...form, area: e.target.value })} /></div>
        <div className="field"><label htmlFor="club-about">About (optional)</label><textarea id="club-about" className="input" maxLength={500} value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} /></div>
        <p className="caption">You will be the club's admin: you can add group runs and remove members.</p>
        <button className="link-btn" onClick={() => setCreating(false)}>Back to search</button>
      </> : <>
        <input className="input" aria-label="Search clubs by name or area" placeholder="Name or area" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={board} onChange={(e) => setBoard(e.target.checked)} /> Show my distance on club leaderboards</label>
        <ul className="list">{res.map((c) => <li key={c.id} className="club-row">
          <span className="club-logo club-logo-sm" aria-hidden="true">{initials(c.name)}</span>
          <span className="stack-sm" style={{ gap: 0, flex: 1, minWidth: 0 }}><span className="label">{c.name}</span><span className="caption">{c.member_count} member{c.member_count === 1 ? '' : 's'}{c.area ? ` · ${c.area}` : ''}</span></span>
          {joined.has(c.id) ? <span className="tag">Joined</span> : <button className="btn btn-small" aria-label={`Join ${c.name}`} onClick={async () => { try { await clubs.join(uid, c.id, board); onJoined(); } catch (e) { setErr((e as Error).message); } }}>Join</button>}
        </li>)}</ul>
        {!res.length && <p className="caption">{q ? 'No club matches.' : 'No clubs yet.'}</p>}
        <button className="btn btn-ghost" onClick={() => setCreating(true)}><Plus size={18} strokeWidth={2} aria-hidden="true" />Start a club</button>
      </>}
    </Sheet>
  );
}
