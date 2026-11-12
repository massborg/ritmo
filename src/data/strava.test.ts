import { describe, expect, it } from 'vitest';
import { isStravaRun, stravaToActivity, stravaUrl } from './strava';

const act = { id: 987654321, name: 'Morning Run', sport_type: 'Run', start_date: '2026-11-07T06:30:00Z', distance: 10020, moving_time: 2950, elapsed_time: 3010, total_elevation_gain: 42.4, average_heartrate: 148.6, max_heartrate: 171, average_cadence: 86, device_name: 'Garmin Forerunner 265',
  laps: [{ elapsed_time: 1500, distance: 5000, start_index: 0, average_heartrate: 145 }, { elapsed_time: 1510, distance: 5020, start_index: 2, average_heartrate: 152 }] };
const streams = { time: { data: [0, 1500, 1501, 3010] }, distance: { data: [0, 5000, 5003, 10020] }, latlng: { data: [[35.9, 14.5], [35.91, 14.51], [35.91, 14.51], [35.92, 14.52]] as [number, number][] }, heartrate: { data: [120, 150, 151, 170] }, cadence: { data: [85, 86, 87, 88] }, altitude: { data: [10, 20, 20, 15] } };

describe('Strava to Ritmo', () => {
  it('maps a run with streams and laps', () => {
    const a = stravaToActivity(act, streams)!;
    expect(a).toMatchObject({ id: 'strava-987654321', source: 'strava', sourceIds: { strava: '987654321' }, startTime: '2026-11-07T06:30:00.000Z', name: 'Morning Run',
      distanceM: 10020, durationS: 3010, movingS: 2950, elevGainM: 42, avgHr: 149, maxHr: 171, avgCadence: 172, device: 'Garmin Forerunner 265' });
    expect(a.streams).toHaveLength(4);
    expect(a.streams![1]).toEqual({ t: 1500, d: 5000, hr: 150, cad: 172, alt: 20, lat: 35.91, lon: 14.51 });
    expect(a.laps!.map((l) => [l.startS, l.durationS, l.distanceM, l.avgHr])).toEqual([[0, 1500, 5000, 145], [1501, 1510, 5020, 152]]);
    expect(a.detailScore).toBeGreaterThan(0);
  });
  it('accepts trail and virtual runs, and works without streams', () => {
    expect(stravaToActivity({ ...act, sport_type: 'TrailRun' })?.streams).toBeUndefined();
    expect(stravaToActivity({ ...act, sport_type: 'VirtualRun', trainer: true })).not.toBeNull();
  });
  it('ignores rides, walks and incomplete activities', () => {
    expect(stravaToActivity({ ...act, sport_type: 'Ride' })).toBeNull();
    expect(stravaToActivity({ ...act, sport_type: 'Walk' })).toBeNull();
    expect(stravaToActivity({ ...act, start_date: undefined })).toBeNull();
  });
  it('knows which runs are Strava data, and links back to Strava', () => {
    const a = stravaToActivity(act)!;
    expect(isStravaRun(a)).toBe(true);
    expect(stravaUrl(a)).toBe('https://www.strava.com/activities/987654321');
    expect(isStravaRun({ source: 'upload' })).toBe(false);
    expect(stravaUrl({ source: 'upload', sourceIds: { strava: '1' } })).toBeUndefined();
  });
});

describe('Strava shoes (matched to Ritmo shoes, asked once)', () => {
  it('keeps the shoes a run was logged with', () => {
    expect(stravaToActivity({ ...act, gear: { id: 'g123', name: ' Pegasus 41 ' } })?.gear).toEqual({ id: 'g123', name: 'Pegasus 41' });
    expect(stravaToActivity({ ...act, gear_id: 'g9' })?.gear).toEqual({ id: 'g9', name: '' });
    expect(stravaToActivity(act)?.gear).toBeUndefined();
  });
  it('a file copy of the run keeps the Strava shoes and any shoe the runner chose', async () => {
    const { merge } = await import('./integration');
    const s = { ...stravaToActivity({ ...act, gear: { id: 'g123', name: 'Pegasus 41' } })!, shoeId: 'shoe-1' };
    const file = { ...s, id: 'fit-1', source: 'upload' as const, sourceIds: { upload: 'fit-1' }, gear: undefined, shoeId: undefined, detailScore: 9 };
    const m = merge([s], [file]);
    expect(m.activities).toHaveLength(1);
    expect(m.activities[0]).toMatchObject({ source: 'upload', gear: { id: 'g123' }, shoeId: 'shoe-1' });
  });
});
