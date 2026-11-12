// Change what Ritmo gives you: running sessions (update 3, §8)
import { describe, expect, it } from 'vitest';
import type { Plan, PlannedSession } from '../lib/types';
import { applyEdit, impactCheck, paceNote, resetEdit } from './edit-session';
import { easyRun } from './generator';
import { trainingPaces } from './fitness';

const P = trainingPaces(55);
const thu = easyRun('2026-11-19', 8, 'build', { paces: P });
const fri: PlannedSession = { ...easyRun('2026-11-20', 10, 'build', { paces: P }), id: 'fri', type: 'threshold', title: 'Threshold: 3 x 10 min',
  steps: [{ kind: 'warmup', label: 'Warm up', detail: '2 km easy', km: 2, durationS: 640 }, { kind: 'work', label: '3 x 10 min threshold', detail: 'x', km: 6.4, durationS: 2000 }, { kind: 'cooldown', label: 'Cool down', detail: '1.6 km easy', km: 1.6, durationS: 512 }], distanceM: 10000, durationS: 3152 };
const sat: PlannedSession = { ...easyRun('2026-11-21', 20, 'build', { paces: P }), id: 'sat', type: 'long', title: 'Long run' };
const plan = { id: 'p', createdAt: '', startDate: '2026-11-16', endDate: '2026-12-31', phases: [], changes: [], sessions: [easyRun('2026-11-16', 10, 'build', { paces: P }), thu, fri, sat] } as unknown as Plan;

describe('editing a running session', () => {
  it('8 → 10 km: steps, time and pace match, shown as "+2 km", that day only', () => {
    const { session, summary } = applyEdit(thu, { distanceM: 10000 }, P);
    expect(session.distanceM).toBe(10000);
    expect(session.steps.reduce((a, x) => a + (x.km ?? 0), 0)).toBeCloseTo(10, 1);
    expect(session.durationS).toBeGreaterThan(thu.durationS);
    expect(summary).toMatch(/You changed Thursday \(Thursday 19 November\) to 10 km \(\+2 km\)/);
    expect(summary).toMatch(/nothing else in your week is cut/);
    expect(session.edited?.original.distanceM).toBe(8000);
  });
  it('the type within the easy family: Easy + strides, Recovery', () => {
    expect(applyEdit(thu, { kind: 'strides' }, P).session.steps.some((x) => x.kind === 'strides')).toBe(true);
    const rec = applyEdit(thu, { kind: 'recovery' }, P).session;
    expect(rec.type).toBe('recovery');
    expect(rec.title).toBe('Recovery run');
  });
  it('a hard session keeps its reps when the distance changes', () => {
    const s = applyEdit(fri, { distanceM: 12000 }, P).session;
    expect(s.steps[1]).toEqual(fri.steps[1]);
    expect(s.steps[0].km! + s.steps[2].km!).toBeCloseTo(5.6, 1);
  });
  it('Reset to plan brings back exactly what the plan had, even after two edits', () => {
    const once = applyEdit(thu, { distanceM: 10000 }, P).session;
    const twice = applyEdit(once, { kind: 'recovery' }, P).session;
    const back = resetEdit(twice);
    expect(back.distanceM).toBe(8000);
    expect(back.type).toBe('easy');
    expect(back.edited).toBeUndefined();
  });
  it('a target pace out of the zone gets a note', () => {
    expect(paceNote(thu, [P.threshold[0], P.threshold[1]], P)).toMatch(/Faster than your easy range/);
    expect(paceNote(thu, [P.easy[0] + 5, P.easy[1]], P)).toBeUndefined();
  });
  it('impact check: fine for the week, or a gentle warning (biggest week, hard session tomorrow)', () => {
    const mon = plan.sessions[0];
    const monMore = applyEdit(mon, { distanceM: 11000 }, P).session;
    expect(impactCheck(plan, monMore, { biggestWeekKm: 100, targetKm: 60 })).toEqual({ ok: true, text: 'Fine for your week, 49 of 60 km planned.' });
    expect(impactCheck(plan, monMore, { biggestWeekKm: 40 }).text).toMatch(/your biggest week \(49 km; your biggest so far is 40 km\)/);
    // Thursday, the day before Friday's threshold session
    expect(impactCheck(plan, applyEdit(thu, { distanceM: 9000 }, P).session, { biggestWeekKm: 100 }).text).toMatch(/Threshold: 3 x 10 min is tomorrow/);
    // A shorter run is never a warning
    expect(impactCheck(plan, applyEdit(thu, { distanceM: 6000 }, P).session, { biggestWeekKm: 100 }).ok).toBe(true);
  });
});
