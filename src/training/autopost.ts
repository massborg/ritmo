// Which runs are posted to the Hub automatically (update 2, §6).
// - Every run that does not come from Strava: recorded in Ritmo, uploaded files, Health, a Garmin connection, by hand.
// - Never a Strava run (Strava's rules allow showing a runner's Strava data only to that runner).
// - Only runs from when automatic posting started, and only recent ones, so importing years of history never floods
//   the feed. A run the runner explicitly asked to share (by uploading its original file) is posted whatever its date.
// - The runner's choices: off altogether, no races, no short runs.
import type { Activity, HubPrefs, Profile, SessionType } from '../lib/types';

/** The Hub consent text version. 2026-11b added automatic posting; runners who agreed to the earlier text ("nothing is
 *  posted automatically") are asked once before any run is posted automatically. */
export const HUB_CONSENT_VERSION = '2026-11b';
/** Whether runs are posted automatically: the runner's choice, otherwise on for those who agreed to the current text */
export const autoPostOn = (p: Pick<Profile, 'hub' | 'consents'>) => p.hub?.autoPost ?? p.consents?.hubSharing?.version === HUB_CONSENT_VERSION;
/** A runner who joined before automatic posting existed and has not chosen yet */
export const autoPostUndecided = (p: Pick<Profile, 'hub' | 'consents'>) => !!p.consents?.hubSharing?.granted && p.hub?.autoPost === undefined && p.consents.hubSharing.version !== HUB_CONSENT_VERSION;

export const RECENT_DAYS = 3;
export const DEFAULT_TRIM_M = 200;

export function autoPostCandidates(o: { runs: Activity[]; prefs?: HubPrefs; now: Date; posted: Set<string>; typeOf: (a: Activity) => SessionType }): Activity[] {
  const p = o.prefs ?? {};
  const asked = new Set(p.shareIds ?? []);
  if (p.autoPost === false && !asked.size) return [];
  const since = p.autoSince;
  return o.runs.filter((a) => {
    if (o.posted.has(a.id) || a.deletedAt || a.source === 'strava' || a.source === 'sample') return false;
    if (asked.has(a.id)) return true;
    if (p.autoPost === false || !since || a.hidden) return false;
    if (a.startTime < since && (a.importedAt ?? '') < since) return false;
    if (o.now.getTime() - new Date(a.startTime).getTime() > RECENT_DAYS * 86400e3) return false;
    if (p.skipRaces && (a.isRace || ['race', 'timetrial'].includes(o.typeOf(a)))) return false;
    if (p.skipUnderKm && a.distanceM < p.skipUnderKm * 1000) return false;
    return true;
  });
}
