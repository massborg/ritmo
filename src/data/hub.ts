// Ritmo Hub: posts, the single "Ritmo" reaction, comments, follows and notifications. Who can see what is
// enforced by the database (row-level security); these are thin calls on top.
import { supabase } from './supabase';

export type Visibility = 'everyone' | 'followers' | 'only_me';
export interface HubProfile { user_id: string; display_name: string; bio?: string | null; club?: string | null; private: boolean }
export interface PostStats { distanceM: number; movingS: number; paceS: number; /** When the run started (ISO), shown when it differs from the posting day */ startedAt?: string; elevGainM?: number; avgHr?: number; type?: string; typeLabel?: string; badges?: string[]; compliance?: string }
export interface Post {
  id: string; user_id: string; activity_id?: string | null; title: string; body?: string | null; visibility: Visibility;
  show_map: boolean; show_hr: boolean; stats: PostStats; route?: [number, number][] | null; city?: string | null;
  ritmo_count: number; comment_count: number; created_at: string;
}
export interface Comment { id: string; post_id: string; user_id: string; parent_id?: string | null; body: string; created_at: string; edited_at?: string | null }
export interface Notification { id: number; kind: 'ritmo' | 'comment' | 'reply' | 'mention' | 'follow' | 'follow_request'; actor_id?: string | null; post_id?: string | null; read_at?: string | null; created_at: string }
export interface Follow { follower_id: string; followee_id: string; status: 'pending' | 'accepted' }

const db = () => { if (!supabase) throw new Error('Not connected'); return supabase; };
const ok = <T,>(r: { data: T | null; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data as T; };

export async function myHubProfile(uid: string): Promise<HubProfile | undefined> {
  return ok(await db().from('hub_profiles').select('*').eq('user_id', uid).maybeSingle()) ?? undefined;
}
export async function saveHubProfile(p: HubProfile) {
  ok(await db().from('hub_profiles').upsert({ ...p, updated_at: new Date().toISOString() }));
}
export async function profilesFor(ids: string[]): Promise<Map<string, HubProfile>> {
  const m = new Map<string, HubProfile>();
  if (!ids.length) return m;
  for (const p of ok(await db().from('hub_profiles').select('*').in('user_id', [...new Set(ids)])) as HubProfile[]) m.set(p.user_id, p);
  return m;
}
export async function searchRunners(q: string): Promise<HubProfile[]> {
  return ok(await db().from('hub_profiles').select('*').ilike('display_name', `%${q.replace(/[%_]/g, '')}%`).limit(20)) as HubProfile[];
}

/** Feed: "following" (people I follow and me), "everyone" (public posts), "mine" (my own posts) */
export async function feed(uid: string, which: 'following' | 'everyone' | 'mine', following: string[]): Promise<Post[]> {
  let q = db().from('posts').select('*').order('created_at', { ascending: false }).limit(50);
  if (which === 'mine') q = q.eq('user_id', uid);
  else if (which === 'everyone') q = q.eq('visibility', 'everyone');
  else q = q.in('user_id', [uid, ...following]);
  return ok(await q) as Post[];
}
export async function createPost(p: Omit<Post, 'ritmo_count' | 'comment_count' | 'created_at'>) {
  ok(await db().from('posts').insert(p));
}
export async function deletePost(id: string) { ok(await db().from('posts').delete().eq('id', id)); }
/** Turning sharing off hides every post (only the runner can see them) */
export async function hideAllMyPosts(uid: string) { ok(await db().from('posts').update({ visibility: 'only_me' }).eq('user_id', uid)); }

export async function myRitmos(uid: string, postIds: string[]): Promise<Set<string>> {
  if (!postIds.length) return new Set();
  return new Set((ok(await db().from('ritmos').select('post_id').eq('user_id', uid).in('post_id', postIds)) as { post_id: string }[]).map((x) => x.post_id));
}
export async function setRitmo(uid: string, postId: string, on: boolean) {
  if (on) ok(await db().from('ritmos').upsert({ post_id: postId, user_id: uid }));
  else ok(await db().from('ritmos').delete().eq('post_id', postId).eq('user_id', uid));
}
export async function ritmoGivers(postId: string): Promise<string[]> {
  return (ok(await db().from('ritmos').select('user_id').eq('post_id', postId).order('created_at', { ascending: false })) as { user_id: string }[]).map((x) => x.user_id);
}

export async function comments(postId: string): Promise<Comment[]> {
  return ok(await db().from('comments').select('*').eq('post_id', postId).order('created_at')) as Comment[];
}
export async function addComment(c: { id: string; post_id: string; user_id: string; parent_id?: string; body: string }) { ok(await db().from('comments').insert(c)); }
export async function editComment(id: string, body: string) { ok(await db().from('comments').update({ body }).eq('id', id)); }
export async function deleteComment(id: string) { ok(await db().from('comments').delete().eq('id', id)); }

export async function follows(uid: string): Promise<Follow[]> {
  return ok(await db().from('follows').select('*').or(`follower_id.eq.${uid},followee_id.eq.${uid}`)) as Follow[];
}
export async function follow(uid: string, other: string) { ok(await db().from('follows').insert({ follower_id: uid, followee_id: other, status: 'pending' })); }
export async function unfollow(uid: string, other: string) { ok(await db().from('follows').delete().eq('follower_id', uid).eq('followee_id', other)); }
export async function acceptFollower(uid: string, other: string) { ok(await db().from('follows').update({ status: 'accepted' }).eq('follower_id', other).eq('followee_id', uid)); }
export async function removeFollower(uid: string, other: string) { ok(await db().from('follows').delete().eq('follower_id', other).eq('followee_id', uid)); }

export async function block(uid: string, other: string) {
  ok(await db().from('blocks').upsert({ blocker_id: uid, blocked_id: other }));
  await db().from('follows').delete().eq('follower_id', uid).eq('followee_id', other);
  await db().from('follows').delete().eq('follower_id', other).eq('followee_id', uid);
}
export async function report(uid: string, what: { post_id?: string; comment_id?: string }, reason: string) {
  ok(await db().from('reports').insert({ reporter_id: uid, ...what, reason }));
}

export async function notifications(): Promise<Notification[]> {
  return ok(await db().from('notifications').select('*').order('created_at', { ascending: false }).limit(50)) as Notification[];
}
export async function markAllRead(uid: string) { ok(await db().from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', uid).is('read_at', null)); }

// ---------- Safety helpers ----------
const BAD = /\b(fuck\w*|shit\w*|cunt\w*|bitch\w*|bastard\w*|wank\w*|dick\w*|asshole\w*|nigg\w*|fag\w*|retard\w*|whore\w*|slut\w*)\b/gi;
/** A basic profanity filter for comments: letters replaced with asterisks. */
export const cleanText = (t: string) => t.replace(BAD, (w) => `${w[0]}${'*'.repeat(w.length - 1)}`);

/** "1 ritmo", "24 ritmos" */
export const ritmoCount = (n: number) => `${n} ritmo${n === 1 ? '' : 's'}`;
/** "Marco gave a ritmo", "Marco and Elena gave a ritmo", "Marco, Elena and 22 others gave a ritmo" */
export function giversLine(names: string[], total: number): string {
  if (!total) return '';
  if (total === 1) return `${names[0] ?? 'Someone'} gave a ritmo`;
  if (total === 2 && names.length >= 2) return `${names[0]} and ${names[1]} gave a ritmo`;
  return `${names.slice(0, 2).join(', ')} and ${total - Math.min(2, names.length)} other${total - Math.min(2, names.length) === 1 ? '' : 's'} gave a ritmo`;
}
/** Batched notification text: "Marco gave your run a ritmo", "Marco and 5 others gave your run a ritmo" */
export function notificationText(kind: Notification['kind'], actors: string[]): string {
  const who = actors.length === 1 ? actors[0] : `${actors[0]} and ${actors.length - 1} other${actors.length > 2 ? 's' : ''}`;
  return kind === 'ritmo' ? `${who} gave your run a ritmo`
    : kind === 'comment' ? `${who} commented on your run`
    : kind === 'reply' ? `${who} replied to your comment`
    : kind === 'mention' ? `${who} mentioned you`
    : kind === 'follow' ? `${who} started following you`
    : `${who} asked to follow you`;
}

/** The route for a post: start and finish trimmed (200 m each) so a home is not shown, and thinned to ~150 points. */
export function shareableRoute(points: { lat?: number; lon?: number; d: number }[], trimM = 200): [number, number][] | null {
  const geo = points.filter((p) => p.lat != null && p.lon != null);
  if (geo.length < 10) return null;
  const total = geo[geo.length - 1].d;
  const kept = geo.filter((p) => p.d >= geo[0].d + trimM && p.d <= total - trimM);
  if (kept.length < 5) return null;
  const step = Math.max(1, Math.ceil(kept.length / 150));
  return kept.filter((_, i) => i % step === 0).map((p) => [Math.round(p.lat! * 1e5) / 1e5, Math.round(p.lon! * 1e5) / 1e5]);
}

/** A default post title from the run's local start: "Monday afternoon run" (the runner's own time zone). */
export function defaultPostTitle(startIso: string): string {
  const d = new Date(startIso);
  const h = d.getHours();
  const part = h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
  return `${d.toLocaleDateString('en-GB', { weekday: 'long' })} ${part} run`;
}

