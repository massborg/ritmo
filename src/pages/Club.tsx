// A club's own page (brief §9.4): about, members, upcoming group runs, the leaderboard (week, month) and the club's
// feed. Admins add group runs. Members choose whether they are on the leaderboard, and can leave.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { Sheet } from '../components/inputs';
import { Empty, Segmented, StatusLine } from '../components/ui';
import * as clubs from '../data/clubs';
import * as hub from '../data/hub';
import type { Club, ClubMember, GroupRun, LeaderRow } from '../data/clubs';
import type { HubProfile, Post } from '../data/hub';
import { CommentsSheet, GiversSheet, GroupRunRow, initials, Leaderboard, PostList, useFeed, useHubMe } from './Hub';

export default function ClubPage() {
  const { id = '' } = useParams();
  const { session } = useApp();
  const uid = session?.user.id ?? '';
  const nav = useNavigate();
  const { ready, loading } = useHubMe();
  const [club, setClub] = useState<Club | null>();
  const [members, setMembers] = useState<ClubMember[]>([]);
  const [names, setNames] = useState<Map<string, HubProfile>>(new Map());
  const [runs, setRuns] = useState<GroupRun[]>([]);
  const [going, setGoing] = useState<Set<string>>(new Set());
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [board, setBoard] = useState<LeaderRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string>();
  const me = members.find((m) => m.user_id === uid);

  const load = useCallback(async () => {
    if (!uid) return;
    try {
      const [c] = await clubs.clubsByIds([id]);
      setClub(c ?? null);
      if (!c) return;
      const ms = await clubs.members(id).catch(() => []);
      setMembers(ms);
      setNames(await hub.profilesFor(ms.map((m) => m.user_id)));
      if (ms.some((m) => m.user_id === uid)) {
        const rs = await clubs.groupRuns([id]);
        setRuns(rs);
        setGoing(await clubs.myGoing(uid, rs.map((r) => r.id)));
      }
    } catch (e) { setErr((e as Error).message); setClub(null); }
  }, [id, uid]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (me) clubs.leaderboard(id, clubs.periodStart(period)).then(setBoard).catch(() => setBoard([])); }, [id, period, me?.user_id, me?.on_leaderboard]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading || club === undefined) return <p className="muted" role="status">Loading…</p>;
  if (!club) return <Empty title="Club not found" action={<button className="btn" onClick={() => nav('/hub?tab=clubs')}>Back to clubs</button>}>{err ?? 'It may have been removed.'}</Empty>;
  return (
    <div className="stack-lg">
      <AppHeader back title={club.name} />
      <section className="stack-sm">
        <div className="row" style={{ gap: 12 }}>
          <span className="club-logo" aria-hidden="true">{initials(club.name)}</span>
          <span className="stack-sm" style={{ gap: 0 }}><span className="caption">{club.member_count} member{club.member_count === 1 ? '' : 's'}{club.area ? ` · ${club.area}` : ''}</span>{me?.role === 'admin' && <span className="caption">You are an admin</span>}</span>
        </div>
        {club.about && <p>{club.about}</p>}
        {!me && ready && <JoinButton club={club} onJoined={load} />}
        {!ready && <StatusLine kind="info">Turn on Hub sharing to join clubs.</StatusLine>}
      </section>
      {me && <>
        <section className="stack-sm" aria-labelledby="club-runs">
          <div className="row-between"><h2 id="club-runs" className="title">Group runs</h2>{me.role === 'admin' && <button className="btn btn-small" onClick={() => setAdding(true)}><Plus size={16} strokeWidth={2} aria-hidden="true" />Add</button>}</div>
          {!runs.length && <p className="caption">No group run planned yet.{me.role === 'admin' ? ' Add one for your members.' : ''}</p>}
          <div className="card stack">{runs.map((r) => <GroupRunRow key={r.id} run={r} going={going.has(r.id)} onChange={load} />)}</div>
        </section>
        <section className="stack-sm" aria-labelledby="club-board">
          <div className="row-between"><h2 id="club-board" className="title">Leaderboard</h2><Segmented<'week' | 'month'> label="Leaderboard period" value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} /></div>
          <div className="card"><Leaderboard rows={board} uid={uid} top={10} /></div>
          <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={me.on_leaderboard} onChange={async (e) => { const on = e.target.checked; setMembers((ms) => ms.map((m) => (m.user_id === uid ? { ...m, on_leaderboard: on } : m))); await clubs.setOnLeaderboard(uid, id, on).catch(() => {}); }} /> Show my distance on this leaderboard</label>
          <p className="caption">Runs imported from Strava are never counted here.</p>
        </section>
        <section className="stack-sm" aria-labelledby="club-members">
          <h2 id="club-members" className="title">Members</h2>
          <ul className="list card">{members.map((m) => <li key={m.user_id} className="club-row"><span className="hub-avatar" aria-hidden="true">{initials(names.get(m.user_id)?.display_name)}</span><span style={{ flex: 1 }}>{m.user_id === uid ? 'You' : names.get(m.user_id)?.display_name ?? 'Runner'}</span>{m.role === 'admin' && <span className="tag">Admin</span>}</li>)}</ul>
        </section>
        <ClubFeed memberIds={members.map((m) => m.user_id)} />
        {!(me.role === 'admin' && members.filter((m) => m.role === 'admin').length === 1) && <button className="btn btn-ghost" onClick={async () => { await clubs.leave(uid, id); nav('/hub?tab=clubs'); }}>Leave club</button>}
      </>}
      {adding && <AddGroupRun clubId={id} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); void load(); }} />}
    </div>
  );
}

function JoinButton({ club, onJoined }: { club: Club; onJoined: () => void }) {
  const { session } = useApp();
  const [board, setBoard] = useState(true);
  const [err, setErr] = useState<string>();
  return (
    <div className="stack-sm">
      <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={board} onChange={(e) => setBoard(e.target.checked)} /> Show my distance on the club leaderboard</label>
      <button className="btn btn-primary" onClick={async () => { try { await clubs.join(session!.user.id, club.id, board); onJoined(); } catch (e) { setErr((e as Error).message); } }}>Join {club.name}</button>
      {err && <StatusLine kind="danger">{err}</StatusLine>}
    </div>
  );
}

function ClubFeed({ memberIds }: { memberIds: string[] }) {
  const feed = useFeed(() => clubs.clubFeed(memberIds), [memberIds.join()]);
  const [sheet, setSheet] = useState<{ kind: 'comments' | 'givers'; post: Post }>();
  return (
    <section className="stack-sm" aria-labelledby="club-feed">
      <h2 id="club-feed" className="title">Club feed</h2>
      {!feed.loading && !feed.posts.length && <p className="caption">Runs members share with everyone, or with followers you follow, show here.</p>}
      <PostList feed={feed} onComments={(p) => setSheet({ kind: 'comments', post: p })} onGivers={(p) => setSheet({ kind: 'givers', post: p })} />
      {sheet?.kind === 'comments' && <CommentsSheet post={sheet.post} people={feed.people} onClose={() => { setSheet(undefined); void feed.reload(); }} />}
      {sheet?.kind === 'givers' && <GiversSheet post={sheet.post} follows={[]} onClose={() => setSheet(undefined)} />}
    </section>
  );
}

function AddGroupRun({ clubId, onClose, onAdded }: { clubId: string; onClose: () => void; onAdded: () => void }) {
  const { session, data } = useApp();
  const U = data.profile.units;
  const tomorrow = new Date(Date.now() + 86400e3);
  const [f, setF] = useState({ title: '', date: tomorrow.toISOString().slice(0, 10), time: '07:30', meeting: '', distance: '', pace: '' });
  const [err, setErr] = useState<string>();
  const valid = f.title.trim().length >= 2 && f.date && f.time;
  return (
    <Sheet open onClose={onClose} title="Add a group run"
      footer={<button className="btn btn-primary btn-block" disabled={!valid} onClick={async () => {
        const starts = new Date(`${f.date}T${f.time}`);
        if (isNaN(starts.getTime())) { setErr('Check the date and time.'); return; }
        const km = parseFloat(f.distance.replace(',', '.'));
        try {
          await clubs.createGroupRun(session!.user.id, { club_id: clubId, title: f.title.trim(), starts_at: starts.toISOString(), meeting_point: f.meeting.trim() || null, distance_m: km > 0 ? Math.round(km * (U === 'mi' ? 1609.344 : 1000)) : null, pace_group: f.pace.trim() || null });
          onAdded();
        } catch (e) { setErr((e as Error).message); }
      }}>Add group run</button>}>
      <div className="field"><label htmlFor="gr-title">Title</label><input id="gr-title" className="input" maxLength={80} value={f.title} placeholder="Saturday long run" onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      <div className="row" style={{ gap: 8 }}>
        <div className="field" style={{ flex: 1 }}><label htmlFor="gr-date">Date</label><input id="gr-date" type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
        <div className="field" style={{ flex: 1 }}><label htmlFor="gr-time">Time</label><input id="gr-time" type="time" className="input" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></div>
      </div>
      <div className="field"><label htmlFor="gr-meet">Meeting point</label><input id="gr-meet" className="input" maxLength={120} value={f.meeting} onChange={(e) => setF({ ...f, meeting: e.target.value })} /></div>
      <div className="row" style={{ gap: 8 }}>
        <div className="field" style={{ flex: 1 }}><label htmlFor="gr-dist">Distance ({U}, optional)</label><input id="gr-dist" className="input" inputMode="decimal" value={f.distance} onChange={(e) => setF({ ...f, distance: e.target.value })} /></div>
        <div className="field" style={{ flex: 1 }}><label htmlFor="gr-pace">Pace group (optional)</label><input id="gr-pace" className="input" maxLength={40} value={f.pace} placeholder="5:30–6:00" onChange={(e) => setF({ ...f, pace: e.target.value })} /></div>
      </div>
      {err && <StatusLine kind="danger">{err}</StatusLine>}
    </Sheet>
  );
}
