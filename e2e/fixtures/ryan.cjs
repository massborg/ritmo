// A test runner shaped like the review account: about 93 km a week for 18 weeks, races at
// 5K 15:51 (20 Sep), half marathon 1:13:37 (4 Oct) and 10K 33:11 (1 Nov), training on Tue/Thu/Sat only.
// Dates are relative to `today` so the fixture stays valid.
const DAY = 86400000;
const iso = (d) => new Date(d).toISOString();
const ymd = (d) => new Date(d).toISOString().slice(0, 10);

function ryanActivities(today = new Date('2026-11-06T12:00:00Z')) {
  const out = [];
  let n = 0;
  const add = (date, km, paceS, extra = {}) => {
    const id = `ryan-${++n}`;
    const moving = Math.round(km * paceS);
    out.push({ id, source: 'upload', sourceIds: { upload: id }, startTime: iso(date), name: extra.name ?? 'Run', sport: 'run',
      distanceM: Math.round(km * 1000), durationS: moving + 30, movingS: moving, avgHr: extra.avgHr ?? 142, maxHr: extra.maxHr ?? 160,
      detailScore: 3, importedAt: iso(today), isRace: false });
  };
  const t0 = new Date(today); t0.setUTCHours(6, 30, 0, 0);
  // Week pattern (Mon..Sun offsets): long 21, easy 12, threshold 14, easy 13, intervals 13, easy 10, easy 10 (~93 km)
  const pattern = [[0, 21, 268], [1, 12, 275], [2, 14, 240], [3, 13, 272], [4, 13, 245], [5, 10, 280], [6, 10, 278]];
  const monday = new Date(t0); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  for (let w = 18; w >= 1; w--) {
    for (const [dow, km, pace] of pattern) add(monday.getTime() - w * 7 * DAY + dow * DAY, km, pace, pace <= 245 ? { avgHr: 165, maxHr: 178 } : {});
  }
  // Races (hard heart rate, full distance)
  const at = (s) => new Date(`${s}T08:00:00Z`).getTime();
  add(at('2026-09-20'), 5, 951 / 5, { avgHr: 181, maxHr: 189 });
  add(at('2026-10-04'), 21.0975, 4417 / 21.0975, { avgHr: 176, maxHr: 186 });
  add(at('2026-11-01'), 10, 1991 / 10, { avgHr: 179, maxHr: 188 });
  // This week: Mon 21.1 + 8.0 + 1.0, Wed 14.2 km in 1:03:54
  add(monday.getTime() + 0 * DAY, 21.1, 265); add(monday.getTime() + 0 * DAY + 6 * 3600000, 8, 280); add(monday.getTime() + 0 * DAY + 7 * 3600000, 1, 300);
  add(monday.getTime() + 2 * DAY, 14.2, 3834 / 14.2);
  return out.filter((a) => new Date(a.startTime) <= today).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

const ryanProfile = {
  name: 'Ryan', units: 'km', theme: 'system', goal: 'Safi 5K AM in 15:30', daysAvailable: [1, 3, 5], longRunDay: 5, injuries: [], onboarded: true,
  experience: 'runner', dateOfBirth: '1990-04-15', birthYear: 1990,
  consents: { healthData: { granted: true, at: '2026-11-05T08:00:00Z', version: '2026-11' }, aiCoach: { granted: false, at: '2026-11-05T08:00:00Z' } },
  healthCheck: { completedAt: '2026-11-05T08:00:00Z', doctorAdvised: false }, background: { level: 'racer', weeklyKm: 93, longestRecentKm: 21 },
  goalType: 'race', schedule: { sessionMinutes: 60, startDate: '2026-11-05', timeOff: [] }, injuriesAnswered: true,
  setupStep: 'done', setupStepsDone: ['consent', 'basics', 'health', 'background', 'goal', 'schedule', 'injuries', 'runs', 'preview'], setupCompletedAt: '2026-11-05T09:00:00Z',
};
const ryanRace = { id: 'race-safi', name: 'Safi 5K AM', date: '2026-12-06', distanceM: 5000, courseType: 'road', goalS: 930, priority: 'A' };

/** Rows for the simulated backend */
function ryanRows(uid, today) {
  const acts = ryanActivities(today);
  return {
    profiles: [{ user_id: uid, data: { profile: ryanProfile, mode: 'real', sources: [{ kind: 'upload', connected: true, activityCount: acts.length }] }, updated_at: iso(today ?? Date.now()) }],
    activities: acts.map((a) => ({ id: a.id, user_id: uid, source: a.source, source_ids: a.sourceIds, start_time: a.startTime, name: a.name, distance_m: a.distanceM,
      duration_s: a.durationS, moving_s: a.movingS, elev_gain_m: null, avg_hr: a.avgHr, max_hr: a.maxHr, avg_cadence: null, is_race: false, detail_score: 3, laps: null, streams: null, imported_at: a.importedAt })),
    races: [{ id: ryanRace.id, user_id: uid, data: ryanRace }],
  };
}

module.exports = { ryanActivities, ryanProfile, ryanRace, ryanRows, ymd };
