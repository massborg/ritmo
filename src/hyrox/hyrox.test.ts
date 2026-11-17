import { describe, expect, it } from 'vitest';
import { LOADS, STATIONS, loadFor } from './hyroxDivisions';
import { advance, buttonLabel, clock, deltaTag, enteredRace, finish, pause, practicePlan, records, resume, segmentMs, segmentWork, simulationPlan, startLive, stopEarly, summarise, targetMs, totalMs, undo, wholeHyrox, type HyroxSession, type Live } from './hyrox';

const live = (o: Partial<Parameters<typeof startLive>[0]> = {}): Live => startLive({ id: 'h1', title: 'HYROX full simulation', mode: 'full', division: 'men_open', plan: simulationPlan('full', 'men_open'), roxzone: false, indoor: true, ...o }, 0);

describe('the race format (25/26)', () => {
  it('8 stations in order, with the loads by division', () => {
    expect(STATIONS.map((s) => s.name)).toEqual(['SkiErg', 'Sled push', 'Sled pull', 'Burpee broad jumps', 'Row', 'Farmers carry', 'Sandbag lunges', 'Wall balls']);
    expect(LOADS.women_open.sled_push?.kg).toBe(102);
    expect(LOADS.men_open.sled_pull?.kg).toBe(103);
    expect(LOADS.men_pro.sled_push?.kg).toBe(202);
    expect(LOADS.women_pro.wall_balls?.text).toBe('6 kg to 2.70 m');
    expect(loadFor('men_pro', 'farmers_carry')?.text).toBe('2 × 32 kg');
    expect(loadFor('doubles_women', 'sandbag_lunges')?.kg).toBe(10);
    expect(loadFor('men_open', 'skierg')).toBeUndefined();
  });
  it('a full simulation is 16 segments; a half is 8', () => {
    const full = simulationPlan('full', 'men_open');
    expect(full).toHaveLength(16);
    expect(full.map((p) => (p.kind === 'run' ? `R${p.n}` : p.key)).slice(0, 4)).toEqual(['R1', 'skierg', 'R2', 'sled_push']);
    expect(full[3].loadKg).toBe(152);
    const back = simulationPlan('half_back', 'women_open');
    expect(back).toHaveLength(8);
    expect(back[0]).toMatchObject({ kind: 'run', n: 5 });
    expect(back[7]).toMatchObject({ key: 'wall_balls', reps: 100, loadKg: 4 });
    expect(segmentWork(full[7], 'men_open')).toBe('80 m · chest to floor, jump with both feet');
    expect(segmentWork(full[3], 'men_open')).toMatch(/^50 m · 152 kg/);
  });
  it('a swapped station is flagged and has no standard load', () => {
    const plan = simulationPlan('full', 'men_open', { sled_push: 'prowler' });
    expect(plan[3]).toMatchObject({ key: 'sled_push', swapped: 'Heavy prowler push', loadKg: undefined });
    expect(segmentWork(plan[3], 'men_open')).toBe('50 m · instead of sled push');
  });
  it('station practice: repeats with a rest between', () => {
    expect(practicePlan('wall_balls', 3, 'men_open').map((p) => p.kind)).toEqual(['station', 'rest', 'station', 'rest', 'station']);
  });
});

describe('the live recorder', () => {
  it('one tap per segment, and the button says what comes next', () => {
    let l = live();
    expect(buttonLabel(l)).toBe('Run done → SkiErg');
    l = advance(l, 250_000);
    expect(buttonLabel(l)).toBe('Station done → Run 2');
    expect(segmentMs(l, 260_000)).toBe(10_000);
    l = advance(l, 500_000);
    expect(l.done.map((s) => s.ms)).toEqual([250_000, 250_000]);
    expect(l.idx).toBe(2);
    expect(totalMs(l, 510_000)).toBe(510_000);
  });
  it('a pause is left out of the segment and the total', () => {
    let l = live();
    l = pause(l, 100_000);
    expect(segmentMs(l, 160_000)).toBe(100_000);
    l = resume(l, 160_000);
    l = advance(l, 260_000);
    expect(l.done[0].ms).toBe(200_000);
    expect(totalMs(l, 260_000)).toBe(200_000);
  });
  it('undo takes back the last tap: the segment carries on', () => {
    let l = advance(live(), 250_000);
    l = undo(l);
    expect(l.done).toHaveLength(0);
    expect(l.idx).toBe(0);
    expect(segmentMs(l, 260_000)).toBe(260_000);
    // Undo after the last segment: not finished any more
    let f = live({ plan: simulationPlan('full', 'men_open').slice(0, 2) });
    f = advance(advance(f, 1000), 2000);
    expect(f.finishedAt).toBe(2000);
    f = undo(f);
    expect(f.finishedAt).toBeUndefined();
    expect(f.idx).toBe(1);
  });
  it('undo after a pause in the last segment does not take the pause off twice', () => {
    let l = live({ mode: 'practice', plan: practicePlan('wall_balls', 1, 'men_open') });
    l = resume(pause(l, 60_000), 90_000);
    l = advance(l, 120_000);
    expect(l.done[0].ms).toBe(90_000);
    l = undo(l);
    expect(segmentMs(l, 120_000)).toBe(90_000);
    l = advance(l, 130_000);
    expect(l.done[0].ms).toBe(100_000);
    expect(finish(l).totalMs).toBe(totalMs(l, 130_000));
  });
  it('"Stop here" taken back returns to the segment in progress, still paused, with every finished segment kept', () => {
    let l = advance(advance(live(), 240_000), 490_000); // run 1 4:00, SkiErg 4:10
    l = pause(l, 610_000); // 2:00 into run 2
    const stopped = stopEarly(l, 620_000);
    expect(stopped.finishedAt).toBe(620_000);
    expect(finish(stopped).totalMs).toBe(490_000);
    // Five minutes on the Finished screen, then "Not finished: undo"
    const back = undo(stopped);
    expect(back.finishedAt).toBeUndefined();
    expect(back.done.map((x) => x.ms)).toEqual([240_000, 250_000]);
    expect(back.idx).toBe(2);
    expect(back.pausedAt).toBe(610_000);
    expect(segmentMs(back, 920_000)).toBe(120_000);
    expect(totalMs(back, 920_000)).toBe(610_000);
    // Carrying on: the time on the Finished screen is not in the run
    expect(advance(resume(back, 920_000), 980_000).done[2].ms).toBe(180_000);
  });
  it('a whole HYROX is eight 1 km runs and eight stations; a custom session with short runs is not', () => {
    const t = Array(8).fill(240);
    const race = enteredRace({ id: 'r', date: '2026-11-12', division: 'men_open', runs: t, stations: t });
    expect(wholeHyrox(race)).toBe(true);
    expect(wholeHyrox({ ...race, mode: 'custom', segments: race.segments.map((x) => (x.kind === 'run' ? { ...x, distanceM: 500 } : x)) })).toBe(false);
    expect(wholeHyrox({ ...race, mode: 'custom', segments: race.segments.map((x) => (x.kind === 'station' ? { ...x, distanceM: 1, reps: 1 } : x)) })).toBe(false);
    expect(wholeHyrox({ ...race, mode: 'custom' })).toBe(true);
    // The record's date is the day on the athlete's calendar
    expect(records([race]).race?.date).toBe('2026-11-12');
  });
  it('Roxzone timing: two taps per transition, kept as its own segment', () => {
    let l = live({ roxzone: true });
    l = advance(l, 240_000);
    expect(l.phase).toBe('roxzone');
    expect(buttonLabel(l)).toBe('Start skierg');
    l = advance(l, 270_000);
    expect(l.phase).toBe('segment');
    expect(l.done.map((s) => `${s.kind}:${s.ms}`)).toEqual(['run:240000', 'roxzone:30000']);
    l = advance(l, 500_000);
    expect(l.done[2]).toMatchObject({ kind: 'station', key: 'skierg', ms: 230_000 });
    expect(l.phase).toBe('segment'); // station → run has no second tap
    // Undo out of the station, back into the Roxzone
    const u = undo(undo(l));
    expect(u.phase).toBe('roxzone');
    expect(u.idx).toBe(1);
  });
  it('outdoor runs keep their GPS distance', () => {
    let l = live({ indoor: false });
    l = advance(l, 250_000, 1012);
    l = advance(l, 500_000, 1012);
    l = advance(l, 750_000, 2020);
    expect(l.done.map((s) => s.gpsM)).toEqual([1012, undefined, 1008]);
  });
});

const session = (runs: number[], stations: number[], o: Partial<HyroxSession> = {}): HyroxSession => ({ ...enteredRace({ id: 's', date: '2026-11-14', division: 'men_open', runs, stations }), mode: 'full', isRace: false, entered: undefined, ...o });

describe('the summary', () => {
  const s = session([242, 254, 281, 258, 262, 265, 292, 276], [252, 221, 295, 271, 290, 150, 330, 360], { goalMs: 75 * 60000 });
  it('totals, and the runs that were slower, named by the station before', () => {
    const sum = summarise(s);
    expect(clock(sum.runningMs)).toBe('35:30');
    expect(sum.roxzoneMs).toBe(0);
    expect(sum.runs.filter((r) => r.slow).map((r) => r.n)).toEqual([3, 7]);
    expect(sum.slowLine).toBe('Runs after sled push and farmers carry were 25 s slower than your other runs.');
    expect(sum.vsGoalMs).toBe(s.totalMs - 75 * 60000);
  });
  it('records: best simulation, run split and station; swapped stations and half sessions do not count', () => {
    const faster = session([240, 240, 240, 240, 240, 240, 240, 240], [200, 200, 200, 200, 200, 200, 200, 200], { id: 'b', startedAt: '2026-11-20T09:00:00.000Z' });
    const swapped = { ...faster, id: 'c', segments: faster.segments.map((x) => (x.key === 'sled_push' ? { ...x, ms: 60_000, swapped: 'Heavy prowler push' } : x)), totalMs: 1 };
    const r = records([s, faster, swapped]);
    expect(r.simulation).toMatchObject({ id: 'b' });
    expect(r.run?.ms).toBe(240_000);
    expect(r.stations.sled_push?.ms).toBe(200_000);
    expect(r.stations.farmers_carry?.ms).toBe(150_000);
    expect(r.race).toBeUndefined();
  });
  it('each station against the target, or the best before', () => {
    expect(targetMs('skierg', { targets: { skierg: 260 } }, [])).toEqual({ ms: 260_000, from: 'target' });
    expect(targetMs('skierg', {}, [s])).toEqual({ ms: 252_000, from: 'best' });
    expect(targetMs('skierg', {}, [])).toBeUndefined();
    expect(deltaTag(252_000, 260_000)).toEqual({ text: '−8 s', tone: 'good' });
    expect(deltaTag(221_000, 195_000)).toEqual({ text: '+26 s', tone: 'slow' });
    expect(deltaTag(271_000, 270_000).text).toBe('on');
  });
  it('a race entered from official splits', () => {
    const r = enteredRace({ id: 'r', date: '2026-11-14', division: 'women_open', runs: Array(8).fill(300), stations: Array(8).fill(240), roxzoneS: 432 });
    expect(r.isRace && r.entered).toBe(true);
    expect(r.segments).toHaveLength(17);
    expect(clock(r.totalMs)).toBe('1:19:12');
    expect(summarise(r).roxzoneMs).toBe(432_000);
    expect(records([r]).race?.id).toBe('r');
  });
  it('a finished live session becomes a session', () => {
    let l = live({ plan: practicePlan('wall_balls', 1, 'men_open'), mode: 'practice' });
    l = advance(l, 300_000);
    expect(finish(l, { rpe: 8 })).toMatchObject({ mode: 'practice', totalMs: 300_000, rpe: 8, indoor: true });
  });
});
