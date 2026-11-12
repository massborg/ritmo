// Update 3, §9 (strength that progresses) and §10 (strength to help with an injury)
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { blockOf, levelFor, nextAfter, resolveStrength, skippedInARow, targetFor } from './strength';
import { applyCheck, careAreaFor, careStep, physioAdvice, type CarePlans, type CareState } from './care';

const weeks = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07', '2026-12-14', '2026-12-21'].map((start, i) => ({ start, cutback: i === 3 || i === 7, phase: 'build' }));

describe('4-week blocks', () => {
  it('learn, build, load, lighter, lined up with the lighter running week; then a new block', () => {
    expect(['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24', '2026-12-01', '2026-12-22'].map((d) => blockOf(weeks, d))).toEqual([
      { block: 1, week: 1 }, { block: 1, week: 2 }, { block: 1, week: 3 }, { block: 1, week: 4 }, { block: 2, week: 1 }, { block: 2, week: 4 }]);
  });
  it('a taper week is a lighter week', () => {
    expect(blockOf([{ start: '2026-11-02', phase: 'build' }, { start: '2026-11-09', phase: 'taper' }], '2026-11-10').week).toBe(4);
  });
  it('a new block brings harder versions of each movement, as far as equipment and choices allow', () => {
    expect([1, 2, 3].map((b) => levelFor('split-squat', b))).toEqual(['split-squat', 'bulgarian', 'bulgarian']); // no weights at home
    expect([1, 2, 3].map((b) => levelFor('split-squat', b, { equipment: 'light' }))).toEqual(['split-squat', 'bulgarian', 'rfe-weighted']);
    expect([1, 2, 3].map((b) => levelFor('glute-bridge', b))).toEqual(['glute-bridge', 'sl-bridge', 'sl-hip-thrust']);
    expect([1, 2, 3].map((b) => levelFor('calf-raise', b, { equipment: 'light' }))).toEqual(['calf-raise', 'sl-calf-raise', 'weighted-sl-calf']);
    expect([1, 2, 3].map((b) => levelFor('plank', b))).toEqual(['plank', 'side-plank', 'side-plank-lift']);
    // "Never give me floor work": the plank stays where it is
    expect(levelFor('plank', 3, { never: ['tag:floor'] })).toBe('plank');
    const b2 = resolveStrength({ routine: 'core', intensity: 'heavy', why: '' }, {}, { block: 2, week: 1 });
    expect(b2.items.some((x) => x.id === 'side-plank')).toBe(true);
  });
  it('week 2 builds reps, week 4 is lighter', () => {
    const w1 = resolveStrength({ routine: 'A', intensity: 'heavy', why: '' }, {}, { block: 1, week: 1 }).items[0];
    const w2 = resolveStrength({ routine: 'A', intensity: 'heavy', why: '' }, {}, { block: 1, week: 2 }).items[0];
    const w4 = resolveStrength({ routine: 'A', intensity: 'heavy', why: '' }, {}, { block: 1, week: 4 }).items[0];
    expect(w2.reps).toBe((w1.reps ?? 0) + 2);
    expect(w4.sets).toBeLessThan(w1.sets);
  });
});

describe('session to session', () => {
  it('all sets done and OK: progress; hard or sets missed: repeat', () => {
    expect(nextAfter([{ reps: 12 }, { reps: 12 }, { reps: 12 }], 3, 6)).toBe('up');
    expect(nextAfter([{ reps: 12 }, { reps: 12 }, { reps: 12 }], 3, 8)).toBe('repeat');
    expect(nextAfter([{ reps: 12 }, { reps: 12 }], 3, 5)).toBe('repeat');
  });
  it('progress: +1 rep, +5 s, or +2 kg when it has load; repeat keeps it; a step back lowers it', () => {
    const x = { id: 'bw-squat', sets: 3, reps: 12 };
    expect(targetFor(x, { reps: 12, next: 'up', at: '' }, 1)).toMatchObject({ reps: 13, note: '+1 reps (to 13)' });
    expect(targetFor({ id: 'goblet-squat', sets: 3, reps: 10 }, { reps: 10, load: 12, next: 'up', at: '' }, 1)).toMatchObject({ load: 14, note: '+2 kg (to 14 kg)' });
    expect(targetFor({ id: 'plank', sets: 3, seconds: 40 }, { seconds: 40, next: 'up', at: '' }, 1)).toMatchObject({ seconds: 45 });
    expect(targetFor(x, { reps: 12, next: 'repeat', at: '' }, 1).reps).toBe(12);
    expect(targetFor(x, { reps: 12, next: 'back', at: '' }, 1).reps).toBe(11);
  });
  it('two planned sessions skipped in a row: a step back', () => {
    const s = [{ id: 'a', date: '2026-11-03', strengthPlan: {} }, { id: 'b', date: '2026-11-06', strengthPlan: {} }, { id: 'c', date: '2026-11-10', strengthPlan: {} }];
    expect(skippedInARow(s, new Set(['a']), '2026-11-12')).toBe(2);
    expect(skippedInARow(s, new Set(['c']), '2026-11-12')).toBe(0);
    const back = resolveStrength({ routine: 'core', intensity: 'heavy', why: '' }, { progress: { plank: { seconds: 45, next: 'up', at: '' } } }, { block: 2, week: 1, skips: 2 });
    expect(back.items.some((x) => x.id === 'side-plank-lift')).toBe(false); // the block's harder versions wait
    expect(resolveStrength({ routine: 'core', intensity: 'heavy', why: '' }, {}, { block: 2, week: 1 }).items.some((x) => x.id === 'side-plank-lift')).toBe(true);
    expect(back.items.find((x) => x.id === 'plank')!.seconds).toBe(40);
  });
});

describe('care plans', () => {
  const plans = JSON.parse(readFileSync('public/care/care-plans.json', 'utf8')) as CarePlans;
  it('the data file: 9 areas, 3 stages each, every exercise with a dose, frequency and cues', () => {
    expect(Object.keys(plans.areas).sort()).toEqual(['achilles', 'ankle', 'calf', 'foot', 'hamstring', 'itband-hip', 'knee', 'lower-back', 'shin']);
    expect(plans.stages.map((s) => s.name)).toEqual(['Calm it down', 'Build', 'Return to full training']);
    for (const a of Object.values(plans.areas)) { expect(a.stages).toHaveLength(3); for (const st of a.stages) { expect(st.length).toBeGreaterThanOrEqual(2); for (const e of st) { expect(e.dose && e.frequency && e.cues.length).toBeTruthy(); } } }
    expect(plans.areas.achilles.stages[0].map((e) => e.name)).toContain('Isometric calf hold');
    expect(plans.areas.achilles.stages[1].map((e) => e.name)).toContain('Slow bent-knee heel drops');
  });
  it('niggle areas map to a care plan', () => {
    expect(['Achilles', 'Left calf', 'Knee', 'Hip', 'Lower back', 'Foot', 'Hamstring'].map(careAreaFor)).toEqual(['achilles', 'calf', 'knee', 'itband-hip', 'lower-back', 'foot', 'hamstring']);
  });
  it('the pain rule: 0–2 forward, 3–5 stay, 6+ step back and rest', () => {
    expect([0, 2, 3, 5, 6, 9].map(careStep)).toEqual(['forward', 'forward', 'stay', 'stay', 'back', 'back']);
  });
  it('moves forward only after the stage\'s minimum days; the worse of morning and during counts', () => {
    const c: CareState = { area: 'achilles', stage: 0, startedAt: '2026-11-01', stageSince: '2026-11-01', checks: [], done: [] };
    expect(applyCheck(c, { date: '2026-11-02', morning: 1 }, plans).state.stage).toBe(0);
    const r = applyCheck(c, { date: '2026-11-04', morning: 1 }, plans);
    expect(r.state.stage).toBe(1);
    expect(r.message).toMatch(/move forward to "Build"/);
    expect(applyCheck(r.state, { date: '2026-11-05', morning: 1, during: 4 }, plans)).toMatchObject({ step: 'stay', state: { stage: 1 } });
    const back = applyCheck(r.state, { date: '2026-11-05', morning: 6 }, plans);
    expect(back.state.stage).toBe(0);
    expect(back.message).toMatch(/step back to "Calm it down" and rest that area/);
  });
  it('advises a physio for sharp pain, limping, getting worse, or over 2 weeks', () => {
    const c: CareState = { area: 'knee', stage: 1, startedAt: '2026-11-01', stageSince: '2026-11-03', checks: [], done: [] };
    expect(physioAdvice({ ...c, checks: [{ date: '2026-11-05', morning: 2, sharp: true }] }, '2026-11-05')).toMatch(/Sharp pain/);
    expect(physioAdvice({ ...c, checks: [{ date: '2026-11-05', morning: 2, limping: true }] }, '2026-11-05')).toMatch(/limp/);
    expect(physioAdvice({ ...c, checks: [{ date: '2026-11-03', morning: 1 }, { date: '2026-11-04', morning: 2 }, { date: '2026-11-05', morning: 3 }] }, '2026-11-05')).toMatch(/getting worse/);
    expect(physioAdvice(c, '2026-11-20')).toMatch(/more than 2 weeks/);
    expect(physioAdvice(c, '2026-11-05')).toBeUndefined();
  });
});
