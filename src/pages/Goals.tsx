import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { Chips, Stepper } from '../components/inputs';
import { StatusLine } from '../components/ui';
import { DAY_NAMES, DAY_SHORT, daysBetween, distanceLabel, shortDate, parseYmd, startOfWeek, ymd } from '../lib/format';
import type { Injury, TrainingSettings } from '../lib/types';
import { checkVolumeFit, resolveSettings, sessionCaps, splitWeek, weekRoles } from '../training/generator';
import { forStats } from '../data/quality';
import { WeekChooser, describeWeek } from '../components/WeekChooser';

const MI = 1.609344;

export default function Goals() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const setup = params.get('setup') === '1';
  const { data, updateProfile, buildMyPlan, rebuildMyPlan, paces, today, aRace } = useApp();
  const p = data.profile;
  const mi = p.units === 'mi';
  const toU = (km: number) => Math.round(mi ? km / MI : km);
  const fromU = (v: number) => (mi ? v * MI : v);
  const U = mi ? 'mi' : 'km';

  // Recent volume, to pre-fill and to compare against
  const recent = useMemo(() => {
    const weeks = new Map<string, number>();
    for (const a of forStats(data.activities)) {
      const d = daysBetween(new Date(a.startTime), today);
      if (d < 0 || d >= 56) continue;
      const k = ymd(startOfWeek(new Date(a.startTime)));
      weeks.set(k, (weeks.get(k) ?? 0) + a.distanceM / 1000);
    }
    const last4 = forStats(data.activities).filter((a) => { const d = daysBetween(new Date(a.startTime), today); return d >= 0 && d < 28; }).reduce((x, a) => x + a.distanceM, 0) / 4000;
    return { avg: Math.round(last4), longestWeek: Math.round(Math.max(0, ...weeks.values())) };
  }, [data.activities, today]);

  const [goal, setGoal] = useState(p.goal);
  const [days, setDays] = useState<number[]>(p.daysAvailable);
  const [longDay, setLongDay] = useState(p.longRunDay);
  const [t, setT] = useState<TrainingSettings>(() => ({ ...p.training }));
  const [injuries, setInjuries] = useState<Injury[]>(p.injuries);
  const [area, setArea] = useState('');
  const [status, setStatus] = useState<Injury['status']>('current');
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<TrainingSettings>) => setT((x) => ({ ...x, ...patch }));

  const draft = { ...p, daysAvailable: [...new Set(days.includes(longDay) ? days : [...days, longDay])].sort((a, b) => a - b), longRunDay: longDay, training: t };
  const resolved = resolveSettings(draft, aRace, recent.avg || 30);
  const fit = paces ? checkVolumeFit(resolved, paces) : undefined;
  const preview = useMemo(() => {
    if (!paces || !fit?.fits) return undefined;
    const { roles } = weekRoles(resolved);
    const caps = sessionCaps(resolved, paces);
    const split = splitWeek(resolved.peakKm, roles.filter((x) => x === 'q1' || x === 'q2').length, roles.filter((x) => x === 'easy').length, true, caps);
    return { roles, split };
  }, [paces, fit?.fits, resolved]);

  const save = (andRebuild: boolean) => {
    updateProfile({ goal, daysAvailable: draft.daysAvailable, longRunDay: longDay, injuries, onboarded: true, training: t });
    if (andRebuild && data.plan && !setup) {
      // Rebuilding: say so, then show what changed on Training. On failure the old plan stays and the reason shows here.
      setBusy(true); setMsg(undefined);
      setTimeout(() => {
        // A week of the runner's own rebuilds from tomorrow and says what they chose (update 3, §7)
        const weekChanged = JSON.stringify(t.week ?? null) !== JSON.stringify(p.training?.week ?? null);
        const r = weekChanged ? rebuildMyPlan({ from: 'tomorrow', why: t.week?.mode === 'custom' ? `You chose your week: ${describeWeek(t.week)}.` : 'Ritmo plans your week again.' }) : rebuildMyPlan();
        if (r.ok) nav('/?rebuilt=1');
        else { setBusy(false); setMsg(r.message); }
      }, 50);
      return;
    }
    if (andRebuild || setup) { setTimeout(() => setMsg(buildMyPlan()), 0); if (setup) nav('/'); }
    else nav(-1);
  };
  const classic = !!preview && longDay === 5 && preview.roles[0] === 'q1' && preview.roles[3] === 'q2';
  const roleName = { long: 'Long run', q1: classic ? 'Threshold' : 'Quality', q2: classic ? 'Intervals' : 'Quality', easy: 'Easy', rest: 'Rest' } as const;
  /** "Classic week": threshold on Monday, intervals on Thursday, long run on Saturday, easy days between */
  const useClassic = () => {
    let list = [...new Set([...days, 0, 3, 5])].sort((a, b) => a - b);
    let n = Math.max(4, t.daysPerWeek ?? resolved.daysPerWeek);
    // If the weekly volume does not fit safely in that many days, add the days the fit check recommends
    if (paces) {
      const tt = { ...t, hardSessions: 2, daysPerWeek: n };
      const f = checkVolumeFit(resolveSettings({ ...p, daysAvailable: list, longRunDay: 5, training: tt }, aRace, recent.avg || 30), paces);
      if (!f.fits && f.recommendedDays && f.recommendedDayList) { n = f.recommendedDays; list = [...new Set([...list, ...f.recommendedDayList])].sort((a, b) => a - b); }
    }
    setLongDay(5);
    setDays(list);
    set({ hardSessions: 2, daysPerWeek: n });
    setTimeout(() => document.getElementById('fit')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <AppHeader title="Goals and training" eyebrow="Goals, races, weekly volume and the days you train" back={!setup} />

      <section className="card stack">
        <div className="field"><label htmlFor="goal">What are you training for?</label><input id="goal" className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="For example, my first 10K, or a marathon under 3:30" /></div>
        <div className="stack-sm">
          <span className="label">Target races</span>
          {data.races.length ? <ul className="bullets">{data.races.map((r) => <li key={r.id}>{r.name}, {distanceLabel(r.distanceM)}, {shortDate(parseYmd(r.date))} ({r.priority})</li>)}</ul> : <p className="caption">No races yet.</p>}
          <button className="btn btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => nav('/race/new')}><Plus size={18} strokeWidth={2} aria-hidden="true" />Add a race</button>
        </div>
      </section>

      <section className="card stack" aria-labelledby="vol">
        <h2 id="vol" className="title">Weekly volume</h2>
        {recent.avg > 0 && <p className="caption">Your recent average: {toU(recent.avg)} {U} a week · biggest week in the last 8 weeks: {toU(recent.longestWeek)} {U}</p>}
        <div className="grid-2">
          <Stepper id="wk" label={`Start at (${U} a week)`} value={t.weeklyKm !== undefined ? toU(t.weeklyKm) : undefined} placeholder={String(toU(recent.avg || 30))} min={5} max={250} step={5} unit={U} onChange={(v) => set({ weeklyKm: v === undefined ? undefined : fromU(v) })} />
          <Stepper id="pk" label={`Build to (${U} a week)`} value={t.peakKm !== undefined ? toU(t.peakKm) : undefined} placeholder={String(toU(resolved.peakKm))} min={5} max={300} step={5} unit={U} onChange={(v) => set({ peakKm: v === undefined ? undefined : fromU(v) })} />
        </div>
        {recent.avg > 0 && resolved.peakKm > recent.avg * 1.3 && <StatusLine kind="warning">That peak is more than 30% above your recent {toU(recent.avg)} {U} a week. Build carefully.</StatusLine>}
        <Chips label="How fast to build" value={t.progression ?? 'progressive'} onChange={(v) => set({ progression: v })}
          options={[{ value: 'maintain', label: 'Maintain' }, { value: 'steady', label: 'Steady', sub: '+5%' }, { value: 'progressive', label: 'Progressive', sub: '+8%' }, { value: 'aggressive', label: 'Aggressive', sub: '+12%' }]} />
        <Chips label="Lighter week every" value={t.cutbackEvery ?? 4} onChange={(v) => set({ cutbackEvery: v })} options={[{ value: 3, label: '3 weeks' }, { value: 4, label: '4 weeks' }]} />
      </section>

      <section className="card stack" aria-labelledby="days">
        <h2 id="days" className="title">Your week</h2>
        <WeekChooser value={t.week} onChange={(w) => set({ week: w })} autoRoles={preview?.roles ?? weekRoles(resolved).roles} />
        <div className="preset">
          <div className="stack-sm" style={{ flex: 1 }}>
            <span className="label">{classic ? 'Preset in use: Classic week' : 'Apply preset: Classic week'}</span>
            <span className="caption">{classic ? 'Threshold on Monday, intervals on Thursday, long run on Saturday, easy days in between.' : 'Changes your week to threshold on Monday, intervals on Thursday and the long run on Saturday. Your typical week below shows your current settings.'}</span>
          </div>
          <button type="button" className="btn btn-small" aria-pressed={classic} onClick={useClassic}>{classic ? 'In use' : 'Apply'}</button>
        </div>
        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Days you could run</legend>
          <div className="row wrap">{DAY_SHORT.map((d, i) => <button type="button" key={d} className="chip" aria-pressed={days.includes(i)} aria-label={DAY_NAMES[i]} onClick={() => setDays((x) => (x.includes(i) ? x.filter((y) => y !== i) : [...x, i]))}>{d}</button>)}</div>
        </fieldset>
        <Stepper id="dpw" label="Days to run each week" value={t.daysPerWeek} placeholder={String(resolved.daysPerWeek)} min={2} max={Math.max(2, draft.daysAvailable.length)} onChange={(v) => set({ daysPerWeek: v })} />
        <p className="caption">{draft.daysAvailable.length > resolved.daysPerWeek ? `${draft.daysAvailable.length} days available. Ritmo picks the best ${resolved.daysPerWeek}, keeping a day between hard sessions.` : `${resolved.daysPerWeek} days a week.`}</p>
        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Long-run day</legend>
          <div className="row wrap">{DAY_SHORT.map((d, i) => <button type="button" key={d} className="chip" aria-pressed={longDay === i} aria-label={DAY_NAMES[i]} onClick={() => setLongDay(i)}>{d}</button>)}</div>
          <p className="caption">Your long run is on {DAY_NAMES[longDay]}. Hard sessions move around it so two hard days never touch.</p>
        </fieldset>
        <Chips label={`The day after the long run (${DAY_NAMES[(longDay + 1) % 7]})`} value={t.dayAfterLong ?? 'easy'} onChange={(v) => set({ dayAfterLong: v })} options={[{ value: 'easy', label: 'Easy run', sub: 'more volume' }, { value: 'off', label: 'Day off', sub: 'more recovery' }]} />
        <Chips label="Start the plan" value={t.startMode ?? 'today'} onChange={(v) => set({ startMode: v })} options={[{ value: 'today', label: 'Today' }, { value: 'monday', label: 'Next Monday' }]} />
      </section>

      <section className="card stack" aria-labelledby="style">
        <h2 id="style" className="title">Training style</h2>
        <Chips label="Hard sessions a week (plus the long run)" value={t.hardSessions ?? 2} onChange={(v) => set({ hardSessions: v })} options={[{ value: 0, label: 'None' }, { value: 1, label: 'One' }, { value: 2, label: 'Two' }]} />
        <Chips label="How hard should they feel?" value={t.difficulty ?? 'normal'} onChange={(v) => set({ difficulty: v })} options={[{ value: 'easier', label: 'Easier' }, { value: 'normal', label: 'Normal' }, { value: 'harder', label: 'Harder' }]} />
        <Chips label="Long runs" value={t.longRunStyle ?? 'auto'} onChange={(v) => set({ longRunStyle: v })} options={[{ value: 'auto', label: 'By phase', sub: 'recommended' }, { value: 'steady', label: 'Steady' }, { value: 'progressive', label: 'Progressive' }, { value: 'fast-finish', label: 'Fast finish' }]} />
        <Chips label="Strides on easy days" value={t.strides === false ? 'off' : 'on'} onChange={(v) => set({ strides: v === 'on' })} options={[{ value: 'on', label: 'Yes' }, { value: 'off', label: 'No' }]} />
        <Chips label="Strength and mobility a week" value={t.strengthPerWeek ?? 0} onChange={(v) => set({ strengthPerWeek: v })} options={[0, 1, 2, 3].map((x) => ({ value: x, label: x ? `${x}` : 'None' }))} />
        <p className="caption">{t.week?.mode === 'custom' ? 'You choose your strength days in "Your week" above.' : 'Placed away from hard days: more in the base phase, less near a race, none in the last 4 days before it.'} Equipment and exercises to leave out: <Link to="/profile/strength" className="label">Profile › Strength</Link>.</p>
        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label">Second easy run on (doubles, for experienced high-volume runners)</legend>
          <div className="row wrap">{DAY_SHORT.map((d, i) => <button type="button" key={d} className="chip" aria-pressed={(t.doubles ?? []).includes(i)} aria-label={`Double on ${DAY_NAMES[i]}`} disabled={i === longDay || !draft.daysAvailable.includes(i)} onClick={() => set({ doubles: (t.doubles ?? []).includes(i) ? (t.doubles ?? []).filter((x) => x !== i) : [...(t.doubles ?? []), i].sort() })}>{d}</button>)}</div>
          <p className="caption">A short easy run at least four hours after the first. Never on the long-run day or in race week.</p>
        </fieldset>
        {!aRace && <Stepper id="pw" label="Plan length without a race (weeks)" value={t.planWeeks} placeholder="12" min={4} max={24} unit="weeks" onChange={(v) => set({ planWeeks: v })} />}
      </section>

      <section className="card stack" aria-labelledby="caps">
        <h2 id="caps" className="title">Longest sessions</h2>
        <div className="grid-2">
          <Stepper id="cE" label="Easy runs (min)" value={t.maxEasyMin} placeholder={String(resolved.maxEasyMin)} min={20} max={150} step={5} unit="min" onChange={(v) => set({ maxEasyMin: v })} />
          <Stepper id="cQ" label="Quality sessions (min)" value={t.maxQualityMin} placeholder={String(resolved.maxQualityMin)} min={30} max={150} step={5} unit="min" onChange={(v) => set({ maxQualityMin: v })} />
          <Stepper id="cL" label="Long run (min)" value={t.maxLongMin} placeholder={String(resolved.maxLongMin)} min={45} max={240} step={5} unit="min" onChange={(v) => set({ maxLongMin: v })} />
        </div>
      </section>

      {fit && (
        <section className="card stack" aria-live="polite" aria-labelledby="fit">
          <h2 id="fit" className="title">Your typical week</h2>
          {fit.fits && preview ? (
            <>
              <ul className="week-preview">{preview.roles.map((r, i) => (
                <li key={i} className={r === 'rest' ? 'muted' : ''}><span className="label">{DAY_SHORT[i]}</span><span>{roleName[r]}</span><span className="stat">{r === 'long' ? `${toU(preview.split.longKm)}` : r === 'q1' || r === 'q2' ? `${toU(preview.split.qKm)}` : r === 'easy' ? `${toU(preview.split.easyKm)}` : ''}</span></li>
              ))}</ul>
              <p className="caption">At {toU(resolved.peakKm)} {U} a week. Distances in {U}; quality sessions include warm-up and cool-down.{classic ? ' Threshold and intervals as shown in build weeks; base weeks start with easier running.' : ''}</p>
              {fit.easyHeavy && <StatusLine kind="info">Easy runs are a little long.{fit.recommendedDays && fit.recommendedDays > resolved.daysPerWeek ? ` A ${fit.recommendedDays}th day would spread the volume better.` : ''}</StatusLine>}
            </>
          ) : (
            <>
              <StatusLine kind="warning">{toU(fit.weeklyKm)} {U} does not fit into {fit.days} days safely</StatusLine>
              <p className="muted">Some runs would be longer than their safe limit. The most that fits in {fit.days} days is about {toU(fit.maxKm)} {U}.</p>
              <div className="row wrap">
                {fit.recommendedDays && fit.recommendedDayList && <button className="btn btn-primary btn-small" onClick={() => { setDays([...new Set([...days, ...fit.recommendedDayList!])]); set({ daysPerWeek: fit.recommendedDays }); }}>Train {fit.recommendedDays} days (recommended)</button>}
                <button className="btn btn-small" onClick={() => set({ weeklyKm: fit.maxKm, peakKm: fit.maxKm })}>Lower to {toU(fit.maxKm)} {U}</button>
              </div>
            </>
          )}
        </section>
      )}

      <section className="card stack">
        <span className="label">Current or past injuries</span>
        <p className="caption">Ritmo uses this to be more careful with load. It is not a diagnosis.</p>
        <ul className="list">{injuries.map((inj, i) => (
          <li key={i} className="list-item row-between"><span>{inj.area} <span className="caption">({inj.status})</span></span><button className="icon-btn" aria-label={`Remove ${inj.area}`} onClick={() => setInjuries((x) => x.filter((_, j) => j !== i))}><X size={18} strokeWidth={2} /></button></li>
        ))}</ul>
        <div className="row wrap">
          <input aria-label="Injury area" className="input" style={{ flex: 1, minWidth: 180 }} placeholder="For example, right knee" value={area} onChange={(e) => setArea(e.target.value)} />
          <div className="segmented" role="group" aria-label="Injury status">
            <button type="button" aria-pressed={status === 'current'} onClick={() => setStatus('current')}>Current</button>
            <button type="button" aria-pressed={status === 'past'} onClick={() => setStatus('past')}>Past</button>
          </div>
          <button className="btn btn-small" type="button" disabled={!area.trim()} onClick={() => { setInjuries((x) => [...x, { area: area.trim(), status }]); setArea(''); }}>Add</button>
        </div>
        {injuries.some((i) => i.status === 'current') && <p className="caption">With a current injury, please check with a physio or doctor before increasing training.</p>}
      </section>

      {msg && <div role="alert"><StatusLine kind="warning">{msg}</StatusLine></div>}
      <div className="row wrap">
        <button className="btn btn-primary" onClick={() => save(true)} disabled={busy || draft.daysAvailable.length < 2} aria-busy={busy}>{busy ? 'Rebuilding your plan…' : setup ? 'Build my plan' : data.plan ? 'Save and rebuild my plan' : 'Save and build my plan'}</button>
        {!setup && <button className="btn" onClick={() => save(false)} disabled={busy || draft.daysAvailable.length < 2}>Save only</button>}
        {busy && <span className="caption" role="status">Rebuilding your plan… Past sessions and this week's runs stay as they are.</span>}
      </div>
    </div>
  );
}
