// Hub clubs (brief §9.4): clubs, members, group runs and who is going, and a weekly/monthly distance leaderboard.
// Who can see what is enforced by the database (row-level security, see the clubs migration):
// - anyone signed in can find a club; members, group runs and the leaderboard are for members only
// - only club admins create group runs
// - the leaderboard only lists members who chose to be on it, and never counts Strava runs
// - the club feed is just members' posts that the viewer can already see (everyone, or followers they follow)
import { supabase } from './supabase';
import type { Post } from './hub';

export interface Club { id: string; name: string; area?: string | null; about?: string | null; created_by: string; member_count: number; created_at: string }
export interface ClubMember { club_id: string; user_id: string; role: 'admin' | 'member'; on_leaderboard: boolean; joined_at: string }
export interface GroupRun { id: string; club_id: string; title: string; starts_at: string; meeting_point?: string | null; distance_m?: number | null; pace_group?: string | null; created_by?: string | null; going_count: number }
export interface LeaderRow { user_id: string; display_name: string; distance_m: number; runs: number }

const db = () => { if (!supabase) throw new Error('Not connected'); return supabase; };
const ok = <T,>(r: { data: T | null; error: { message: string; code?: string } | null }): T => {
  if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code });
  return r.data as T;
};
/** True when the clubs tables are not in the database yet (the migration has not been applied) */
export const notReady = (e: unknown) => /PGRST205|42P01|no table|does not exist|schema cache/i.test(`${(e as { code?: string }).code ?? ''} ${(e as Error).message ?? ''}`);

export async function myMemberships(uid: string): Promise<ClubMember[]> {
  return ok(await db().from('club_members').select('*').eq('user_id', uid)) as ClubMember[];
}
export async function clubsByIds(ids: string[]): Promise<Club[]> {
  if (!ids.length) return [];
  return ok(await db().from('clubs').select('*').in('id', ids)) as Club[];
}
export async function findClubs(q: string): Promise<Club[]> {
  const term = q.replace(/[%_,()]/g, '').trim();
  let query = db().from('clubs').select('*').order('member_count', { ascending: false }).limit(20);
  if (term) query = query.or(`name.ilike.%${term}%,area.ilike.%${term}%`);
  return ok(await query) as Club[];
}
export async function createClub(uid: string, c: { name: string; area?: string; about?: string }): Promise<Club> {
  const row = { id: crypto.randomUUID(), created_by: uid, name: c.name.trim(), area: c.area?.trim() || null, about: c.about?.trim() || null };
  ok(await db().from('clubs').insert(row));
  // The database adds the creator as the club's admin
  return { ...row, member_count: 1, created_at: new Date().toISOString() };
}
export async function join(uid: string, clubId: string, onLeaderboard: boolean) {
  ok(await db().from('club_members').insert({ club_id: clubId, user_id: uid, role: 'member', on_leaderboard: onLeaderboard }));
}
export async function leave(uid: string, clubId: string) { ok(await db().from('club_members').delete().eq('club_id', clubId).eq('user_id', uid)); }
export async function setOnLeaderboard(uid: string, clubId: string, on: boolean) {
  ok(await db().from('club_members').update({ on_leaderboard: on }).eq('club_id', clubId).eq('user_id', uid));
}
export async function members(clubId: string): Promise<ClubMember[]> {
  return ok(await db().from('club_members').select('*').eq('club_id', clubId).order('joined_at')) as ClubMember[];
}

export async function groupRuns(clubIds: string[], fromIso = new Date(Date.now() - 2 * 3600e3).toISOString()): Promise<GroupRun[]> {
  if (!clubIds.length) return [];
  return ok(await db().from('group_runs').select('*').in('club_id', clubIds).gte('starts_at', fromIso).order('starts_at').limit(50)) as GroupRun[];
}
export async function createGroupRun(uid: string, g: Omit<GroupRun, 'id' | 'going_count' | 'created_by'>) {
  ok(await db().from('group_runs').insert({ ...g, id: crypto.randomUUID(), created_by: uid }));
}
export async function myGoing(uid: string, runIds: string[]): Promise<Set<string>> {
  if (!runIds.length) return new Set();
  return new Set((ok(await db().from('group_run_going').select('group_run_id').eq('user_id', uid).in('group_run_id', runIds)) as { group_run_id: string }[]).map((x) => x.group_run_id));
}
export async function setGoing(uid: string, runId: string, on: boolean) {
  if (on) ok(await db().from('group_run_going').upsert({ group_run_id: runId, user_id: uid }));
  else ok(await db().from('group_run_going').delete().eq('group_run_id', runId).eq('user_id', uid));
}

/** Distance per member since a date (Monday for the week, the 1st for the month). Members only; Strava runs never count. */
export async function leaderboard(clubId: string, sinceIso: string): Promise<LeaderRow[]> {
  return ok(await db().rpc('club_leaderboard', { c: clubId, since: sinceIso })) as LeaderRow[];
}

/** Members' posts the viewer can already see (row-level security on posts decides) */
export async function clubFeed(memberIds: string[]): Promise<Post[]> {
  if (!memberIds.length) return [];
  return ok(await db().from('posts').select('*').in('user_id', memberIds).neq('visibility', 'only_me').order('created_at', { ascending: false }).limit(30)) as Post[];
}

/** Start of this week (Monday 00:00 local) and of this month, as ISO */
export function periodStart(kind: 'week' | 'month', now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), kind === 'month' ? 1 : now.getDate());
  if (kind === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString();
}
/** "Mon 16 Nov" / "16" + "NOV" for the date block */
export const dateBlock = (iso: string) => { const d = new Date(iso); return { day: String(d.getDate()), month: d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase(), weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }), time: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) }; };
