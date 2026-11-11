// Update 2, §8: an imported run the runner deleted is matched on every sync and stays deleted; a file uploaded again
// on purpose brings it back.
import { describe, expect, it } from 'vitest';
import type { Activity } from '../lib/types';
import { mergeWithRemoved } from './integration';
import { actPrint } from './store';

const run = (id: string, iso: string, km: number, extra: Partial<Activity> = {}): Activity => ({ id, source: 'strava', sourceIds: { strava: id.replace('strava-', '') }, startTime: iso, name: 'Run', sport: 'run', distanceM: km * 1000, durationS: km * 300, movingS: km * 300, detailScore: 3, importedAt: iso, ...extra });

describe('deleted imported runs (update 2, §8)', () => {
  const kept = run('strava-1', '2026-11-09T05:42:00Z', 16.3);
  const deleted = { ...run('strava-2', '2026-11-10T05:50:00Z', 14.2), deletedAt: '2026-11-11T08:00:00Z' };

  it('the same Strava run arriving again on the next sync stays deleted', () => {
    const again = run('strava-2', '2026-11-10T05:50:00Z', 14.2, { detailScore: 5 });
    const m = mergeWithRemoved([kept], [deleted], [again]);
    expect(m.activities.map((a) => a.id)).toEqual(['strava-1']);
    expect(m.removed.map((a) => a.id)).toEqual(['strava-2']);
    expect(m.removed[0].deletedAt).toBeTruthy();
    expect(m.added).toBe(0);
  });

  it('a copy from another source (a Garmin file of the same run) does not bring it back either', () => {
    const garmin: Activity = { ...run('garmin-9', '2026-11-10T05:50:20Z', 14.21, { detailScore: 6 }), source: 'garmin', sourceIds: { garmin: '9' } };
    const m = mergeWithRemoved([kept], [deleted], [garmin]);
    expect(m.activities).toHaveLength(1);
    expect(m.removed[0].sourceIds).toMatchObject({ strava: '2', garmin: '9' });
  });

  it('uploading the file again on purpose brings the run back', () => {
    const file: Activity = { ...run('fit-1', '2026-11-10T05:50:00Z', 14.2), source: 'upload', sourceIds: { upload: 'fit-1' } };
    const m = mergeWithRemoved([kept], [deleted], [file], true);
    expect(m.activities.map((a) => a.id)).toEqual(['strava-1', 'strava-2']);
    expect(m.removed).toHaveLength(0);
  });

  it('new runs are still added', () => {
    const m = mergeWithRemoved([kept], [deleted], [run('strava-3', '2026-11-11T06:00:00Z', 10)]);
    expect(m.activities.map((a) => a.id)).toEqual(['strava-1', 'strava-3']);
  });

  it('deleting or restoring a run changes what is saved', () => {
    expect(actPrint(deleted)).not.toBe(actPrint({ ...deleted, deletedAt: undefined }));
  });
});
