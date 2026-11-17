// Profile, HYROX (update 4, task 6): how you train, and your HYROX goal. Saving rebuilds the plan.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { Chips } from '../components/inputs';
import { StatusLine } from '../components/ui';
import { HyroxGoalFields } from '../components/HyroxGoal';
import type { HyroxPrefs } from '../hyrox/hyrox';
import { targetsFromGoal, type AthleteType } from '../hyrox/plan-goal';
import { addDays, ymd } from '../lib/format';

export const ATHLETE_OPTIONS: { value: AthleteType; label: string; sub?: string }[] = [
  { value: 'runner', label: 'Runner' }, { value: 'hyrox', label: 'HYROX athlete' }, { value: 'both', label: 'Both' },
];

export default function ProfileHyrox() {
  const { data, updateProfile, rebuildMyPlan, plan, paces, today } = useApp();
  const [type, setType] = useState<AthleteType>(data.profile.athleteType ?? 'runner');
  const [h, setH] = useState<HyroxPrefs>(data.profile.hyrox ?? {});
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const thresholdS = paces ? Math.round((paces.threshold[0] + paces.threshold[1]) / 2) : undefined;
  const save = () => {
    const hyrox: HyroxPrefs = { ...data.profile.hyrox, ...h, raceDate: h.raceDate, previousS: h.previousS, goalS: h.goalS, targets: h.goalS ? targetsFromGoal(h.goalS, undefined, thresholdS) : undefined };
    updateProfile({ athleteType: type, hyrox });
    if (!plan) { setMsg({ ok: true, text: 'Saved.' }); return; }
    // The profile is saved first; the plan is rebuilt from it straight after
    setTimeout(() => {
      const r = rebuildMyPlan({ why: type === 'runner' ? 'You train as a runner.' : type === 'hyrox' ? 'You train for HYROX.' : 'You train for running and HYROX.' });
      setMsg(r.ok ? { ok: true, text: 'Saved. Your plan has been rebuilt: see Plan changes on Training.' } : { ok: false, text: r.message });
    }, 0);
  };
  return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <AppHeader title="HYROX" eyebrow="How you train, and your HYROX goal" back />
      <section className="card stack">
        <Chips<AthleteType> label="How do you train?" value={type} onChange={setType} options={ATHLETE_OPTIONS} />
        <p className="caption">{type === 'runner' ? 'Your plan is a running plan. You can still record HYROX sessions from Activity.' : type === 'hyrox' ? 'Your plan is built for HYROX: less running than a road plan, with 1 km repeats, compromised runs, simulations and station strength.' : 'Your plan is built for whichever race is nearer. If the two are within 8 weeks, one session a week is kept for the other.'}</p>
      </section>
      {type !== 'runner' && <section className="card"><HyroxGoalFields value={h} onChange={(p) => setH((x) => ({ ...x, ...p }))} minDate={ymd(addDays(today, 1))} thresholdS={thresholdS} /></section>}
      {msg && <div role="status"><StatusLine kind={msg.ok ? 'success' : 'warning'}>{msg.text}</StatusLine></div>}
      <button type="button" className="btn btn-primary btn-block" onClick={save}>Save{plan ? ' and rebuild my plan' : ''}</button>
      <Link to="/hyrox" className="card card-link row-between"><span className="label">Record a HYROX session</span><span className="caption">Simulate, practise a station, race day</span></Link>
    </div>
  );
}
