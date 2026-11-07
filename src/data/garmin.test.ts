import { describe, expect, it, vi } from 'vitest';
vi.mock('./supabase', () => ({ supabase: {} }));
import { garminAttribution, garminToActivity, type GarminDetails, type GarminSummary } from './garmin';
import { merge } from './integration';

const start = 1762500000; // a fixed start time in seconds
const summary: GarminSummary = {
  summaryId: '9001', activityType: 'RUNNING', activityName: 'Morning Run', deviceName: 'Forerunner 965',
  startTimeInSeconds: start, durationInSeconds: 1800, movingDurationInSeconds: 1780, distanceInMeters: 6000,
  averageHeartRateInBeatsPerMinute: 148, maxHeartRateInBeatsPerMinute: 171, averageRunCadenceInStepsPerMinute: 172, totalElevationGainInMeters: 35,
};
const details: GarminDetails = {
  summaryId: '9001-detail', summary,
  samples: Array.from({ length: 1801 }, (_, i) => ({ startTimeInSeconds: start + i, totalDistanceInMeters: i * (6000 / 1800), heartRate: 140 + (i % 10), stepsPerMinute: 172, latitudeInDegree: 35.9, longitudeInDegree: 14.5 })),
  laps: [{ startTimeInSeconds: start }, { startTimeInSeconds: start + 900 }],
};

describe('garminToActivity', () => {
  it('maps a summary to a Ritmo run', () => {
    const a = garminToActivity(summary)!;
    expect(a.id).toBe('garmin-9001');
    expect(a.source).toBe('garmin');
    expect(a.sourceIds.garmin).toBe('9001');
    expect(a.distanceM).toBe(6000);
    expect(a.movingS).toBe(1780);
    expect(a.avgHr).toBe(148);
    expect(a.device).toBe('Forerunner 965');
    expect(a.startTime).toBe(new Date(start * 1000).toISOString());
    expect(a.streams).toBeUndefined();
  });

  it('adds streams and laps from details', () => {
    const a = garminToActivity(undefined, details)!;
    expect(a.id).toBe('garmin-9001');
    expect(a.streams?.length).toBe(1801);
    expect(a.streams?.[0]).toMatchObject({ t: 0, d: 0, cad: 172, lat: 35.9 });
    expect(a.laps?.length).toBe(2);
    expect(a.laps?.[1].startS).toBe(900);
    expect(Math.round(a.laps![0].distanceM)).toBe(3000);
  });

  it('ignores anything that is not a run', () => {
    expect(garminToActivity({ ...summary, activityType: 'CYCLING' })).toBeNull();
    expect(garminToActivity({ ...summary, summaryId: undefined })).toBeNull();
  });

  it('accepts other running types', () => {
    for (const t of ['TRAIL_RUNNING', 'TREADMILL_RUNNING', 'TRACK_RUNNING', 'VIRTUAL_RUN']) expect(garminToActivity({ ...summary, activityType: t })).not.toBeNull();
  });

  it('upgrades a summary-only run when the details arrive, and keeps one copy', () => {
    const first = merge([], [garminToActivity(summary)!]);
    const second = merge(first.activities, [garminToActivity(undefined, details)!]);
    expect(second.activities.length).toBe(1);
    expect(second.replaced).toBe(1);
    expect(second.activities[0].streams?.length).toBe(1801);
    expect(second.activities[0].device).toBe('Forerunner 965');
  });

  it('credits Garmin with the device model', () => {
    expect(garminAttribution(garminToActivity(summary)!)).toBe('Garmin Forerunner 965');
    expect(garminAttribution({ source: 'garmin', sourceIds: {}, device: undefined })).toBe('Garmin');
    expect(garminAttribution({ source: 'upload', sourceIds: {}, device: undefined })).toBeUndefined();
  });
});
