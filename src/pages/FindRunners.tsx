// Hub › Find runners (update 2, §10): a full screen. Results as you type from the first letter (accents and case
// ignored), one button per runner that always shows the real follow state, and suggestions when the box is empty.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Search, Share2, X } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { Empty, Segmented, StatusLine } from '../components/ui';
import { RunnerAvatar, initials } from '../components/RunnerAvatar';
import { FollowStateButton } from '../components/FollowButton';
import * as hub from '../data/hub';
import * as clubs from '../data/clubs';
import type { HubProfile } from '../data/hub';
import type { Club } from '../data/clubs';

type Filter = 'people' | 'clubs';
const RECENT_KEY = 'ritmo:hub-recent-searches';
const loadRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[]; } catch { return []; } };
const saveRecent = (list: string[]) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6))); } catch { /* */ } };

/** Why this runner is shown: the relationship, a shared club, or their club */
function reasonFor(p: HubProfile, uid: string, follows: hub.Follow[], sharedClub: Map<string, string>): string | undefined {
  if (follows.some((f) => f.follower_id === p.user_id && f.followee_id === uid && f.status === 'accepted')) return 'Follows you';
  if (follows.some((f) => f.follower_id === p.user_id && f.followee_id === uid && f.status === 'pending')) return 'Asked to follow you';
  const club = sharedClub.get(p.user_id);
  if (club) return `Also in ${club}`;
  return p.club ?? undefined;
}

function invite() {
  const url = `${window.location.origin}/`;
  const text = 'I train with Ritmo. Join me on the Hub:';
  if (navigator.share) return navigator.share({ title: 'Ritmo', text, url }).catch(() => undefined);
  return navigator.clipboard?.writeText(`${text} ${url}`).then(() => alert('Link copied. Paste it to a friend.')).catch(() => undefined);
}

export default function FindRunners() {
  const { session } = useApp();
  const uid = session?.user.id;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('people');
  const [res, setRes] = useState<HubProfile[]>([]);
  const [clubRes, setClubRes] = useState<Club[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'offline' | 'error'>('idle');
  const [follows, setFollows] = useState<hub.Follow[]>([]);
  const [suggested, setSuggested] = useState<HubProfile[]>([]);
  const [sharedClub, setSharedClub] = useState<Map<string, string>>(new Map());
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const input = useRef<HTMLInputElement>(null);

  const loadFollows = useCallback(async () => { if (uid) setFollows(await hub.follows(uid).catch(() => [])); }, [uid]);
  useEffect(() => { void loadFollows(); }, [loadFollows]);
  useEffect(() => { input.current?.focus(); }, []);

  // Suggestions: people who follow you that you don't follow yet, then members of your clubs
  useEffect(() => {
    if (!uid) return;
    let live = true;
    (async () => {
      const f = await hub.follows(uid).catch(() => [] as hub.Follow[]);
      const followers = f.filter((x) => x.followee_id === uid && x.status === 'accepted' && !f.some((y) => y.follower_id === uid && y.followee_id === x.follower_id)).map((x) => x.follower_id);
      const shared = new Map<string, string>();
      try {
        const mine = await clubs.myMemberships(uid);
        const list = await clubs.clubsByIds(mine.map((m) => m.club_id));
        for (const c of list.slice(0, 5)) for (const m of await clubs.members(c.id)) if (m.user_id !== uid && !shared.has(m.user_id)) shared.set(m.user_id, c.name);
      } catch { /* clubs are optional */ }
      const ids = [...new Set([...followers, ...[...shared.keys()].filter((id) => !f.some((y) => y.follower_id === uid && y.followee_id === id))])].slice(0, 12);
      const people = await hub.profilesFor(ids).catch(() => new Map<string, HubProfile>());
      if (!live) return;
      setSharedClub(shared);
      setSuggested(ids.map((id) => people.get(id)).filter((p): p is HubProfile => !!p));
    })();
    return () => { live = false; };
  }, [uid]);

  // Results as you type, from the first letter, 250 ms after the last key
  useEffect(() => {
    const term = q.trim();
    if (!term) { setRes([]); setClubRes([]); setState('idle'); return; }
    if (!navigator.onLine) { setState('offline'); return; }
    setState('loading');
    let live = true;
    const t = setTimeout(() => {
      const p = filter === 'people' ? hub.searchRunners(term).then((r) => { if (live) setRes(r.filter((x) => x.user_id !== uid)); }) : clubs.findClubs(term).then((r) => { if (live) setClubRes(r); });
      p.then(() => { if (live) setState('done'); }).catch(() => { if (live) setState(navigator.onLine ? 'error' : 'offline'); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, filter, uid]);

  const remember = (term: string) => { const t = term.trim(); if (!t) return; const next = [t, ...recent.filter((x) => x.toLowerCase() !== t.toLowerCase())]; setRecent(next.slice(0, 6)); saveRecent(next); };
  const row = (p: HubProfile) => (
    <li key={p.user_id} className="find-row">
      <Link to={`/hub/runner/${p.user_id}`} className="row" style={{ gap: 12, flex: 1, minWidth: 0, color: 'inherit', textDecoration: 'none' }} onClick={() => remember(q)}>
        <RunnerAvatar id={p.user_id} profile={p} />
        <span className="find-row-text">
          <span className="label">{p.display_name}</span>
          {reasonFor(p, uid!, follows, sharedClub) && <span className="caption">{reasonFor(p, uid!, follows, sharedClub)}</span>}
        </span>
      </Link>
      <FollowStateButton other={p.user_id} name={p.display_name} follows={follows} onChange={() => { remember(q); void loadFollows(); }} />
    </li>
  );
  const term = q.trim();
  const skeleton = useMemo(() => [0, 1, 2].map((i) => <li key={i} className="find-row find-skeleton" aria-hidden="true"><span className="hub-avatar" /><span className="find-row-text"><span className="sk sk-line" /><span className="sk sk-line short" /></span></li>), []);

  return (
    <div className="stack-lg find-runners">
      <AppHeader title="Find runners" back large={false} />
      <div className="find-search">
        <Search size={20} strokeWidth={2} aria-hidden="true" />
        <input ref={input} type="search" inputMode="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
          aria-label={filter === 'people' ? 'Search runners by name' : 'Search clubs by name or area'} placeholder={filter === 'people' ? 'Search by name' : 'Search clubs'}
          value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') remember(q); }} />
        {q && <button type="button" className="icon-btn find-clear" aria-label="Clear search" onClick={() => { setQ(''); input.current?.focus(); }}><X size={18} strokeWidth={2} /></button>}
      </div>
      <Segmented<Filter> label="Search for" value={filter} onChange={setFilter} options={[{ value: 'people', label: 'People' }, { value: 'clubs', label: 'Clubs' }]} />

      {state === 'offline' && <StatusLine kind="warning">You're offline. Searching needs a connection.</StatusLine>}
      {state === 'error' && <StatusLine kind="warning">Search isn't working right now. Try again in a moment.</StatusLine>}

      {term && filter === 'people' && (
        state === 'loading' && !res.length ? <ul className="list" aria-busy="true">{skeleton}</ul>
          : res.length ? <ul className="list" aria-label="Runners">{res.map(row)}</ul>
          : state === 'done' ? <Empty title={`No runners found for '${term}'`} action={<button className="btn" onClick={() => void invite()}><Share2 size={18} strokeWidth={2} aria-hidden="true" />Invite friends</button>}>Check the spelling, or invite them to join Ritmo.</Empty> : null
      )}
      {term && filter === 'clubs' && (
        state === 'loading' && !clubRes.length ? <ul className="list" aria-busy="true">{skeleton}</ul>
          : clubRes.length ? <ul className="list" aria-label="Clubs">{clubRes.map((c) => <li key={c.id}><Link to={`/hub/club/${c.id}`} className="find-row"><span className="club-logo club-logo-sm" aria-hidden="true">{initials(c.name)}</span><span className="find-row-text"><span className="label">{c.name}</span><span className="caption">{c.member_count} member{c.member_count === 1 ? '' : 's'}{c.area ? ` · ${c.area}` : ''}</span></span><ChevronRight size={18} aria-hidden="true" /></Link></li>)}</ul>
          : state === 'done' ? <Empty title={`No clubs found for '${term}'`}>You can start one from Hub › Clubs.</Empty> : null
      )}

      {!term && (
        <>
          {recent.length > 0 && (
            <section className="stack-sm" aria-labelledby="find-recent">
              <div className="row-between"><h2 id="find-recent" className="label">Recent searches</h2><button className="link-btn" onClick={() => { setRecent([]); saveRecent([]); }}>Clear</button></div>
              <div className="row wrap" style={{ gap: 6 }}>{recent.map((r) => <button key={r} className="chip" onClick={() => setQ(r)}>{r}</button>)}</div>
            </section>
          )}
          {filter === 'people' && suggested.length > 0 && (
            <section className="stack-sm" aria-labelledby="find-suggested">
              <h2 id="find-suggested" className="label">Suggested for you</h2>
              <ul className="list">{suggested.map(row)}</ul>
            </section>
          )}
          <section className="card stack-sm">
            <h2 className="label">Invite friends</h2>
            <p className="caption">Running is better together. Send friends a link to Ritmo.</p>
            <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => void invite()}><Share2 size={18} strokeWidth={2} aria-hidden="true" />Invite friends</button>
          </section>
        </>
      )}
    </div>
  );
}
