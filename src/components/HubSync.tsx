// Keeps the runner's Hub up to date in the background (update 2, §6 and §7), once they have joined the Hub:
// - their Hub profile carries their photo setting, the small copy of their photo, and a searchable name
// - runs are posted automatically (never Strava runs), with their audience and map privacy settings
import { useEffect, useRef } from 'react';
import { useApp } from '../app/AppContext';
import * as hub from '../data/hub';
import { avatarUrl, uploadSmallAvatar } from '../data/avatar';
import { fetchRunDetail } from '../data/store';
import { autoPostCandidates, autoPostOn, DEFAULT_TRIM_M } from '../training/autopost';
import { buildRunPost } from './PostToHub';

export function HubSync() {
  const { data, session, hasFlag, typeOf, updateProfile } = useApp();
  const uid = session?.user.id;
  const joined = data.mode === 'real' && !!uid && hasFlag('hub') && !!data.profile.consents?.hubSharing?.granted;
  const prefs = data.profile.hub;
  // Off until the runner agreed to automatic posting (new Hub text) or turned it on themselves
  const on = autoPostOn(data.profile);
  const photoVis = data.profile.photoVisibility ?? 'everyone';
  const avatarPath = data.profile.avatar?.path;
  // Functions from the app change on every render; the effects below use the latest without re-running for it
  const fns = useRef({ typeOf, updateProfile });
  fns.current = { typeOf, updateProfile };

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

  return null;
}
