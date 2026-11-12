// Ritmo Hub: posts, the single reaction ("Fuego"; stored as `ritmos` in the database), comments, follows and
// notifications. Who can see what is enforced by the database (row-level security); these are thin calls on top.
import { supabase } from './supabase';

export type Visibility = 'everyone' | 'followers' | 'only_me';
export type PhotoVisibility = 'everyone' | 'followers' | 'only_me';
export interface HubProfile {
  user_id: string; display_name: string; bio?: string | null; club?: string | null; private: boolean;
  /** The small copy of the runner's photo ("<uid>/avatar-small.jpg"), shown wherever they appear */
  photo_path?: string | null;
  /** Who can see the photo (the database enforces it); Everyone by default */
  photo_visibility?: PhotoVisibility;
  /** The name in lower case without accents, for search */
  search_name?: string | null;
  /** Optional area under the name ("Sliema") */
  area?: string | null;
  /** Published by the runner's app for their profile; never from Strava runs */
  stats?: { runs?: number; weekStreak?: number; updatedAt?: string } | null;
  /** The PBs the runner chose to show (null when hidden) */
  pbs?: import('../training/profile-pbs').ShownPb[] | null;
}

/** "Żammit" → "zammit", "Ħal Far" → "hal far": lower case, no accents, single spaces */
export const searchName = (s: string) => s.toLowerCase().replace(/ħ/g, 'h').replace(/ł/g, 'l').replace(/ø/g, 'o').replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ').trim();
export interface PostStats { distanceM: number; /** Watch or app that recorded it, e.g. "Garmin Forerunner 965" */ device?: string; movingS: number; paceS: number; /** When the run started (ISO), shown when it differs from the posting day */ startedAt?: string; elevGainM?: number; avgHr?: number; type?: string; typeLabel?: string; badges?: string[]; compliance?: string; /** Challenge posts: which medal to show */ badgeId?: string; /** Challenge posts: which challenge was completed */ challengeId?: string }
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
  ok(await db().from('hub_profiles').upsert({ ...p, search_name: searchName(p.display_name), updated_at: new Date().toISOString() }));
}
/** Keep the Hub profile's photo in step with the runner's own (after adding, changing or removing it) */
export async function setHubPhoto(uid: string, path: string | null) {
  ok(await db().from('hub_profiles').update({ photo_path: path, updated_at: new Date().toISOString() }).eq('user_id', uid));
}
export async function profilesFor(ids: string[]): Promise<Map<string, HubProfile>> {
  const m = new Map<string, HubProfile>();
  if (!ids.length) return m;
  for (const p of ok(await db().from('hub_profiles').select('*').in('user_id', [...new Set(ids)])) as HubProfile[]) m.set(p.user_id, p);
  return m;
}
/** Runners whose first name, surname or any part of their name contains the search, from the first letter. Accents
 *  and case are ignored ("zammit" finds "Żammit"). */
export async function searchRunners(q: string): Promise<HubProfile[]> {
  const n = searchName(q).replace(/'/g, '');
  if (!n) return [];
  const rows = ok(await db().from('hub_profiles').select('*').or(`search_name.ilike.*${n}*,display_name.ilike.*${n}*`).limit(40)) as HubProfile[];
  // Names that start with the search (first name or surname) first, then the rest, alphabetically
  const rank = (p: HubProfile) => { const s = p.search_name ?? searchName(p.display_name); return s.startsWith(n) ? 0 : s.split(' ').some((w) => w.startsWith(n)) ? 1 : 2; };
  return rows.sort((a, b) => rank(a) - rank(b) || a.display_name.localeCompare(b.display_name)).slice(0, 20);
}

// ---------- Profile photos ----------
// Signed links to the small photos, kept for the session (they last an hour); the storage rules decide who may see
// each one, so a photo the owner keeps to themselves or their followers simply does not come back.
const photoCache = new Map<string, { url?: string; until: number }>();
export async function photoUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const now = Date.now();
  const need = [...new Set(paths.filter(Boolean))].filter((p) => { const c = photoCache.get(p); if (c && c.until > now) { if (c.url) out.set(p, c.url); return false; } return true; });
  if (need.length && supabase) {
    const { data } = await supabase.storage.from('avatars').createSignedUrls(need, 3600);
    const got = new Map((data ?? []).map((x) => [x.path ?? '', x.error ? undefined : x.signedUrl]));
    for (const p of need) {
      const url = got.get(p) ?? undefined;
      photoCache.set(p, { url, until: now + (url ? 50 : 10) * 60e3 });
      if (url) out.set(p, url);
    }
  }
  return out;
}
export const forgetPhoto = (path: string) => photoCache.delete(path);

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
/** The runner's posts for some runs (to know which are already on the Hub) */
export async function postsForRuns(uid: string, runIds: string[]): Promise<Map<string, Post>> {
  const m = new Map<string, Post>();
  if (!runIds.length) return m;
  for (const p of ok(await db().from('posts').select('*').eq('user_id', uid).in('activity_id', runIds)) as Post[]) if (p.activity_id) m.set(p.activity_id, p);
  return m;
}
/** "Hide from Hub" (only the runner sees it, and it is not posted again) and "Change audience" */
export async function setPostVisibility(id: string, visibility: Visibility) { ok(await db().from('posts').update({ visibility }).eq('id', id)); }
/** A runner's posts that the viewer may see, newest first (the database decides what is visible) */
export async function postsBy(uid: string, order: 'new' | 'fuego' = 'new'): Promise<Post[]> {
  const q = db().from('posts').select('*').eq('user_id', uid).neq('visibility', 'only_me');
  return ok(await (order === 'fuego' ? q.order('ritmo_count', { ascending: false }).limit(5) : q.order('created_at', { ascending: false }).limit(50))) as Post[];
}
export async function postById(id: string): Promise<Post | undefined> {
  return (ok(await db().from('posts').select('*').eq('id', id).maybeSingle()) as Post | null) ?? undefined;
}
export interface HubCounts { followers: number; following: number; requests: number; fuego: number }
/** Followers, following, requests (own profile only) and Fuego received, for any runner */
export async function hubCounts(uid: string): Promise<HubCounts> {
  const rows = ok(await db().rpc('hub_counts', { target: uid })) as HubCounts[] | null;
  return rows?.[0] ?? { followers: 0, following: 0, requests: 0, fuego: 0 };
}
/** A runner's followers or following, when their privacy lets the viewer see them */
export async function followList(uid: string, which: 'followers' | 'following'): Promise<string[]> {
  return ((ok(await db().rpc('hub_follow_list', { target: uid, which })) as { user_id: string }[] | null) ?? []).map((r) => r.user_id);
}
export interface RunnerReason { user_id: string; mutuals: number; followed_by?: string | null; race_name?: string | null; race_date?: string | null }
/** Why runners are suggested: runners you follow who follow them, and a race you both have coming up. Empty (not an
 *  error) if the reasons can't be loaded, so search still works. */
export async function runnerReasons(ids: string[]): Promise<Map<string, RunnerReason>> {
  const m = new Map<string, RunnerReason>();
  if (!ids.length || !supabase) return m;
  const r = await supabase.rpc('hub_runner_reasons', { targets: [...new Set(ids)].slice(0, 60) });
  if (r.error) return m;
  for (const x of (r.data ?? []) as RunnerReason[]) m.set(x.user_id, x);
  return m;
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
/** The first givers of each post (newest first), for the stacked avatars on the card */
export async function giversFor(postIds: string[]): Promise<Map<string, string[]>> {
  const m = new Map<string, string[]>();
  if (!postIds.length) return m;
  const rows = ok(await db().from('ritmos').select('post_id,user_id').in('post_id', postIds).order('created_at', { ascending: false }).limit(300)) as { post_id: string; user_id: string }[];
  for (const r of rows) { const l = m.get(r.post_id) ?? []; if (l.length < 3) l.push(r.user_id); m.set(r.post_id, l); }
  return m;
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

/** "1 Fuego", "24 Fuego" (no plural s) */
export const fuegoCount = (n: number) => `${n} Fuego`;
/** "Marco gave a Fuego", "Marco and Elena gave a Fuego", "Marco, Elena and 22 others gave a Fuego" */
export function giversLine(names: string[], total: number): string {
  if (!total) return '';
  if (total === 1) return `${names[0] ?? 'Someone'} gave a Fuego`;
  if (total === 2 && names.length >= 2) return `${names[0]} and ${names[1]} gave a Fuego`;
  const rest = total - Math.min(2, names.length);
  return `${names.slice(0, 2).join(', ')} and ${rest} other${rest === 1 ? '' : 's'} gave a Fuego`;
}
/** Batched notification text: "Anna gave your run a Fuego", "Anna and 5 others gave your run a Fuego" */
export function notificationText(kind: Notification['kind'], actors: string[]): string {
  const who = actors.length === 1 ? actors[0] : `${actors[0]} and ${actors.length - 1} other${actors.length > 2 ? 's' : ''}`;
  return kind === 'ritmo' ? `${who} gave your run a Fuego`
    : kind === 'comment' ? `${who} commented on your run`
    : kind === 'reply' ? `${who} replied to your comment`
    : kind === 'mention' ? `${who} mentioned you`
    : kind === 'follow' ? `${who} started following you`
    : `${who} asked to follow you`;
}

/** When a run happened, for the post header: "Today at 06:42", "Yesterday at 18:10", "Mon 9 Nov at 07:05" */
export function whenLine(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const t = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const day = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (day(d) === day(now)) return `Today at ${t}`;
  if (day(d) === day(y)) return `Yesterday at ${t}`;
  const sameYear = d.getFullYear() === now.getFullYear();
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })} at ${t}`;
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


/** One photo link; calls made in the same moment (a whole feed of avatars) are fetched in a single request */
let queued: { path: string; resolve: (u: string | undefined) => void }[] = [];
export function photoUrl(path: string): Promise<string | undefined> {
  const c = photoCache.get(path);
  if (c && c.until > Date.now()) return Promise.resolve(c.url);
  return new Promise((resolve) => {
    queued.push({ path, resolve });
    if (queued.length === 1) setTimeout(() => {
      const batch = queued; queued = [];
      photoUrls(batch.map((x) => x.path)).then((m) => batch.forEach((x) => x.resolve(m.get(x.path)))).catch(() => batch.forEach((x) => x.resolve(undefined)));
    }, 0);
  });
}
