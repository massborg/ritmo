// Keeps the runner's Hub up to date in the background (update 2, §6 and §7), once they have joined the Hub:
// - their Hub profile carries their photo setting, the small copy of their photo, and a searchable name
// - runs are posted automatically (never Strava runs), with their audience and map privacy settings
import { useEffect, useRef } from 'react';
import type { LogEntry } from '../lib/types';
import { useApp } from '../app/AppContext';
import * as hub from '../data/hub';
import { avatarUrl, uploadSmallAvatar } from '../data/avatar';
import { fetchRunDetail } from '../data/store';
import { autoPostCandidates, autoPostOn, DEFAULT_TRIM_M } from '../training/autopost';
import { buildRunPost } from './PostToHub';
import { resolvePbs, ritmoBests, shareableRuns, weekStreak } from '../training/profile-pbs';

export function HubSync() {
  const { data, session, hasFlag, typeOf, updateProfile, updateLog } = useApp();
  const uid = session?.user.id;
  const joined = data.mode === 'real' && !!uid && hasFlag('hub') && !!data.profile.consents?.hubSharing?.granted;
  const prefs = data.profile.hub;
  // Off until the runner agreed to automatic posting (new Hub text) or turned it on themselves
  const on = autoPostOn(data.profile);
  const photoVis = data.profile.photoVisibility ?? 'everyone';
  const avatarPath = data.profile.avatar?.path;
  // Functions from the app change on every render; the effects below use the latest without re-running for it
  const fns = useRef({ typeOf, updateProfile, updateLog });
  fns.current = { typeOf, updateProfile, updateLog };

  // ---- Hub profile: photo setting, small photo, searchable name ----
  useEffect(() => {
    if (!joined || !uid) return;
    let live = true;
    (async () => {
      const me = await hub.myHubProfile(uid).catch(() => undefined);
      if (!me || !live) return;
      const patch: Partial<hub.HubProfile> = {};
      if ((me.photo_visibility ?? 'everyone') !== photoVis) patch.photo_visibility = photoVis;
      if (me.search_name !== hub.searchName(me.display_name)) patch.search_name = hub.searchName(me.display_name);
      // Photos added before this update have no small copy yet: make it from the full one, once
      if (avatarPath && !me.photo_path) {
        try {
          const url = await avatarUrl(avatarPath);
          if (url) { const big = await (await fetch(url)).blob(); patch.photo_path = await uploadSmallAvatar(uid, big); }
        } catch { /* tried again next time */ }
      }
      if (!avatarPath && me.photo_path) patch.photo_path = null;
      if (Object.keys(patch).length && live) await hub.saveHubProfile({ ...me, ...patch }).catch(() => undefined);
    })();
    return () => { live = false; };
  }, [joined, uid, photoVis, avatarPath]);

  // ---- The profile's numbers and chosen PBs (never from Strava runs), published when they change ----
  const pbSettings = data.profile.hubPbs;
  useEffect(() => {
    if (!joined || !uid) return;
    const t = setTimeout(async () => {
      const runs = shareableRuns(data.activities);
      const stats = { runs: runs.length, weekStreak: weekStreak(data.activities, new Date(), (data.profile.log ?? []).filter((e) => e.kind === 'strength').map((e) => e.date)) };
      const pbs = resolvePbs(pbSettings, ritmoBests(data.activities, data.races));
      const me = await hub.myHubProfile(uid).catch(() => undefined);
      if (!me) return;
      const same = me.stats?.runs === stats.runs && me.stats?.weekStreak === stats.weekStreak && JSON.stringify(me.pbs ?? null) === JSON.stringify(pbs);
      if (!same) await hub.saveHubProfile({ ...me, stats: { ...stats, updatedAt: new Date().toISOString() }, pbs }).catch(() => undefined);
    }, 3000);
    return () => clearTimeout(t);
  }, [joined, uid, data.activities, data.races, pbSettings, data.profile.log]);

  // ---- Automatic posting starts from now: earlier runs are never posted automatically ----
  useEffect(() => {
    if (joined && on && !prefs?.autoSince) fns.current.updateProfile({ hub: { ...prefs, autoSince: new Date().toISOString() } });
  }, [joined, on, prefs]);

  // ---- Post new runs ----
  const busy = useRef(false);
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!joined || !uid || !prefs?.autoSince && !prefs?.shareIds?.length) return;
    const t = setTimeout(async () => {
      if (busy.current) return;
      const { typeOf, updateProfile } = fns.current;
      const due = autoPostCandidates({ runs: data.activities, prefs: { ...prefs, autoPost: on }, now: new Date(), posted: tried.current, typeOf });
      if (!due.length) return;
      busy.current = true;
      try {
        const existing = await hub.postsForRuns(uid, due.map((a) => a.id));
        for (const a of due) {
          tried.current.add(a.id);
          if (existing.has(a.id)) continue;
          // The route needs the run's GPS points, which are loaded per run for runs that came from the account
          const run = a.streams || data.mode !== 'real' ? a : { ...a, ...(await fetchRunDetail(a.id).catch(() => undefined)) };
          await hub.createPost(buildRunPost(run, { uid, type: typeOf(a), visibility: prefs?.audience ?? 'followers', trimM: prefs?.trimM ?? DEFAULT_TRIM_M }));
        }
        const asked = prefs?.shareIds ?? [];
        if (asked.some((id) => tried.current.has(id))) updateProfile({ hub: { ...prefs, shareIds: asked.filter((id) => !tried.current.has(id)) } });
      } catch {
        // Not posted this time (offline, or the Hub is unavailable): the next change tries again
        for (const a of due) tried.current.delete(a.id);
      } finally { busy.current = false; }
    }, 2500);
    return () => clearTimeout(t);
  }, [joined, uid, data.activities, data.mode, prefs, on]);

  // ---- Post new strength sessions (update 3, §6): Ritmo's own data, so no Strava rule; on by default, to followers ----
  const strengthTried = useRef(new Set<string>());
  useEffect(() => {
    if (!joined || !uid || !prefs?.autoSince || !on || prefs?.autoPostStrength === false) return;
    const t = setTimeout(async () => {
      const recent = (data.profile.log ?? []).filter((e) => e.kind === 'strength' && e.strength && !e.strength.postId && !strengthTried.current.has(e.id)
        && e.at >= prefs.autoSince! && Date.now() - new Date(e.at).getTime() < 3 * 86400e3);
      for (const e of recent) {
        strengthTried.current.add(e.id);
        try {
          // One post per workout, whatever happens: the post's id comes from the workout's own id, so a second try
          // (another tab, a reload before the id was saved) can never post it twice
          const id = await stablePostId(e.id);
          const have = await hub.postById(id).catch(() => undefined);
          if (!have) await hub.createPost(buildStrengthPost(e, { uid, id, visibility: prefs?.audience ?? 'followers' }));
          fns.current.updateLog(e.id, { strength: { ...e.strength!, postId: id } });
        } catch { strengthTried.current.delete(e.id); }
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [joined, uid, data.profile.log, prefs, on]);

  return null;
}

/** A UUID made from a text (SHA-256), so the same workout always gets the same post id */
export async function stablePostId(text: string): Promise<string> {
  const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ritmo-strength:${text}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** A strength session as a Hub post: time, exercises and sets, and the top 4 exercises */
export function buildStrengthPost(e: LogEntry, o: { uid: string; id: string; visibility: hub.Visibility }): Omit<hub.Post, 'ritmo_count' | 'comment_count' | 'created_at'> {
  const st = e.strength!;
  const sets = st.exercises.reduce((a, x) => a + x.sets.length, 0);
  const top = st.exercises.slice(0, 4).map((x) => {
    const first = x.sets[0] ?? {};
    return { name: x.name, dose: `${x.sets.length} x ${first.seconds ? `${first.seconds} s` : first.reps ?? ''}${first.load ? ` @ ${first.load} kg` : ''}` };
  });
  const asPlanned = !!st.sessionId;
  return {
    id: o.id, user_id: o.uid, activity_id: null, title: st.title, body: null, visibility: o.visibility, show_map: false, show_hr: false, route: null, city: null,
    stats: { distanceM: 0, paceS: 0, movingS: (e.minutes ?? 0) * 60, startedAt: e.at, device: st.source === 'ritmo' ? 'Recorded in Ritmo' : undefined,
      type: 'strength', typeLabel: asPlanned ? 'Strength · as planned' : 'Strength', strength: { exercises: st.exercises.length, sets, top } },
  };
}
