// Update 2, §6, §7, §10: which runs post automatically, which copy of a run is its source, and name search.
import { describe, expect, it } from 'vitest';
import type { Activity, Profile, SessionType } from '../lib/types';
import { autoPostCandidates, autoPostOn, autoPostUndecided, HUB_CONSENT_VERSION } from './autopost';
import { merge } from '../data/integration';
import { searchName } from '../data/hub';

const now = new Date('2026-11-11T12:00:00Z');
const run = (id: string, hoursAgo: number, km: number, extra: Partial<Activity> = {}): Activity => {
  const t = new Date(now.getTime() - hoursAgo * 3600e3).toISOString();
  return { id, source: 'ritmo_gps', sourceIds: { ritmo_gps: id }, startTime: t, name: 'Run', sport: 'run', distanceM: km * 1000, durationS: km * 300, movingS: km * 300, detailScore: 5, importedAt: t, ...extra };
};
const since = new Date(now.getTime() - 48 * 3600e3).toISOString();
const typeOf = (a: Activity): SessionType => (a.isRace ? 'race' : 'easy');
const pick = (runs: Activity[], prefs: Parameters<typeof autoPostCandidates>[0]['prefs'], posted = new Set<string>()) => autoPostCandidates({ runs, prefs, now, posted, typeOf }).map((a) => a.id);

describe('automatic posting (update 2, §6)', () => {
  const recorded = run('gps-1', 2, 8);
  const upload: Activity = { ...run('fit-1', 5, 10), source: 'upload', sourceIds: { upload: 'fit-1' } };
  const manual: Activity = { ...run('manual-1', 6, 5), source: 'manual', sourceIds: { manual: 'manual-1' } };
  const strava: Activity = { ...run('strava-1', 3, 12), source: 'strava', sourceIds: { strava: '1' } };

  it('posts runs recorded in Ritmo, uploaded and logged by hand, never Strava runs', () => {
    expect(pick([recorded, upload, manual, strava], { autoPost: true, autoSince: since })).toEqual(['gps-1', 'fit-1', 'manual-1']);
  });
  it('turning it off stops new posts', () => {
    expect(pick([recorded, upload], { autoPost: false, autoSince: since })).toEqual([]);
  });
  it('never posts history: only runs since it started, and only the last few days', () => {
    const old = run('gps-old', 24 * 10, 8);
    const before = run('gps-before', 60, 8, { importedAt: new Date(now.getTime() - 60 * 3600e3).toISOString() });
    expect(pick([old, before, recorded], { autoPost: true, autoSince: since })).toEqual(['gps-1']);
  });
  it('skips races and short runs when asked, and runs already posted, hidden or deleted', () => {
    const race = run('gps-race', 1, 5, { isRace: true });
    const short = run('gps-short', 1, 2);
    expect(pick([race, short, recorded], { autoPost: true, autoSince: since, skipRaces: true, skipUnderKm: 3 })).toEqual(['gps-1']);
    expect(pick([recorded, run('h', 1, 6, { hidden: true }), run('d', 1, 6, { deletedAt: now.toISOString() })], { autoPost: true, autoSince: since }, new Set(['gps-1']))).toEqual([]);
  });
  it('a run the runner asked to share (by uploading its original file) is posted whatever its date', () => {
    const old: Activity = { ...run('strava-9', 24 * 20, 10), source: 'upload', sourceIds: { strava: '9', upload: 'x' } };
    expect(pick([old], { autoPost: false, shareIds: ['strava-9'] })).toEqual(['strava-9']);
  });
  it('runners who joined before automatic posting are asked first; new joiners have it on', () => {
    const oldJoiner: Pick<Profile, 'hub' | 'consents'> = { consents: { hubSharing: { granted: true, at: '', version: '2026-11' } } };
    const newJoiner: Pick<Profile, 'hub' | 'consents'> = { consents: { hubSharing: { granted: true, at: '', version: HUB_CONSENT_VERSION } } };
    expect(autoPostOn(oldJoiner)).toBe(false);
    expect(autoPostUndecided(oldJoiner)).toBe(true);
    expect(autoPostOn({ ...oldJoiner, hub: { autoPost: true } })).toBe(true);
    expect(autoPostOn(newJoiner)).toBe(true);
    expect(autoPostUndecided(newJoiner)).toBe(false);
  });
});

describe('the copy of a run that can be shared (update 2, §6.3)', () => {
  const strava: Activity = { ...run('strava-5', 3, 12.3), source: 'strava', sourceIds: { strava: '5' }, detailScore: 6 };
  const file: Activity = { ...run('fit-5', 3, 12.31), source: 'upload', sourceIds: { upload: 'fit-5' }, detailScore: 4 };
  it('an uploaded file of a Strava run becomes its source, even with less detail', () => {
    const m = merge([strava], [file]);
    expect(m.activities).toHaveLength(1);
    expect(m.activities[0].source).toBe('upload');
    expect(m.activities[0].id).toBe('strava-5');
    expect(m.activities[0].sourceIds).toMatchObject({ strava: '5', upload: 'fit-5' });
  });
  it('a Strava copy arriving later never replaces a shareable copy', () => {
    const m = merge([file], [{ ...strava, detailScore: 9 }]);
    expect(m.activities[0].source).toBe('upload');
    expect(m.activities[0].sourceIds).toMatchObject({ strava: '5', upload: 'fit-5' });
  });
});

describe('finding runners by name (update 2, §10)', () => {
  it('ignores accents and case', () => {
    expect(searchName('Żammit')).toBe('zammit');
    expect(searchName('Ħal  Far')).toBe('hal far');
    expect(searchName('  MASSIMO Borg ')).toBe('massimo borg');
    expect(searchName('José Müller')).toBe('jose muller');
  });
});
