// Athlete setup: one question group per screen, saved to the account after each step,
// so it can be resumed on any device. Existing users only see the steps they have not answered.
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Check, Compass, HeartPulse, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Logo, StatusLine } from '../components/ui';
import { Chips, DateField, DurationField, Stepper } from '../components/inputs';
import { AvatarEditor, AvatarImage } from '../components/AvatarEditor';
import { ProgressSteps } from '../components/setup-ui';
import { UploadPanel } from './DataSources';
import { addDays, DAY_NAMES, DAY_SHORT, dist, duration, durationWords, longDate, MONTHS_LONG, parseYmd, RACE_DISTANCES, uid, ymd } from '../lib/format';
import type { BackgroundLevel, GoalType, Injury, Plan, Profile, Race, RunningBackground, TrainingSchedule } from '../lib/types';
import {
  ageOn, backgroundFromRuns, checkGoal, CONSENT_VERSION, HEALTH_QUESTIONS, MIN_AGE, planFromSetup, type SetupStep, stepsNeeded, vdotFromWeeklyKm,
} from '../training/setup';
import { vdotFromPerformance } from '../training/fitness';
import { pickStarterDays } from '../training/plan';

const TITLES: Record<SetupStep, string> = {
  consent: 'Your data', basics: 'About you', health: 'Health check', background: 'Your running', goal: 'Your goal',
  schedule: 'Your week', injuries: 'Injuries', runs: 'Your runs', preview: 'Your plan',
};

export default function Setup() {
  const app = useApp();
  const { data, updateProfile, today, fitness } = app;
  const nav = useNavigate();
  const hasRuns = data.activities.length > 0;
  const hadPlan = !!data.plan;
  // The list is fixed when setup opens, so it does not shrink while answers are saved
  const [steps] = useState<SetupStep[]>(() => stepsNeeded(data.profile, { hasRuns, hasPlan: hadPlan, today: new Date() }));
  const [i, setI] = useState(0);
  const step = steps[i];

  const next = (patch: Partial<Profile>) => {
    const done = new Set(data.profile.setupStepsDone ?? []);
    done.add(step);
    updateProfile({ ...patch, setupStep: step, setupStepsDone: [...done] });
    if (i + 1 < steps.length) { setI(i + 1); window.scrollTo(0, 0); }
    else setI(steps.length);
  };
  const back = i > 0 ? () => { setI(i - 1); window.scrollTo(0, 0); } : undefined;

  if (!steps.length || i >= steps.length) return <Done hadPlan={hadPlan} onFinish={(plan) => { app.finishSetup(plan); nav('/', { replace: true }); }} />;

  return (
    <div className="setup">
      <header className="setup-top">
        {back
          ? <button className="icon-btn" onClick={back} aria-label="Back to the previous question"><ArrowLeft size={22} strokeWidth={2} /></button>
          : <Logo variant="compact" width={92} alt="Ritmo" />}
        <ProgressSteps current={i} total={steps.length} label={TITLES[step]} />
      </header>
      <div className="setup-body" key={step}>
        {step === 'consent' && <ConsentStep onNext={next} />}
        {step === 'basics' && <BasicsStep onNext={next} />}
        {step === 'health' && <HealthStep onNext={next} />}
        {step === 'background' && <BackgroundStep onNext={next} />}
        {step === 'goal' && <GoalStep onNext={next} vdot={fitness?.vdot} />}
        {step === 'schedule' && <ScheduleStep onNext={next} />}
        {step === 'injuries' && <InjuriesStep onNext={next} />}
        {step === 'runs' && <RunsStep onNext={next} />}
        {step === 'preview' && <PreviewStep today={today} onEditDays={() => { const k = steps.indexOf('schedule'); if (k >= 0) setI(k); }} onAccept={(plan) => { app.finishSetup(plan); nav('/', { replace: true }); }} />}
      </div>
      {(step === 'consent' || step === 'basics') && data.mode !== 'sample' && (
        <button className="btn btn-ghost btn-block" style={{ marginTop: 'var(--s5)' }} onClick={() => { app.loadSample(); nav('/'); }}>
          <Compass size={18} strokeWidth={2} aria-hidden="true" />Look around with sample data first
        </button>
      )}
    </div>
  );
}

type StepProps = { onNext: (p: Partial<Profile>) => void };

function StepHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="stack-sm">
      <h1 className="display-sm">{title}</h1>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}

function Footer({ onNext, disabled, label = 'Continue', err }: { onNext: () => void; disabled?: boolean; label?: string; err?: string }) {
  return (
    <div className="setup-footer stack-sm">
      {err && <div role="alert"><StatusLine kind="danger">{err}</StatusLine></div>}
      <button className="btn btn-primary btn-block" onClick={onNext} disabled={disabled}>{label}</button>
    </div>
  );
}

function Check2({ checked, onChange, children, id }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; id: string }) {
  return (
    <label className="consent" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

// ---------------- 1. Consent ----------------
function ConsentStep({ onNext }: StepProps) {
  const { data } = useApp();
  const [health, setHealth] = useState(false);
  const [ai, setAi] = useState(!!data.profile.consents?.aiCoach?.granted);
  const now = () => new Date().toISOString();
  return (
    <div className="stack-lg">
      <StepHead title="How Ritmo uses your data">To coach you, Ritmo needs to process information about your health and training. Here is exactly what that means.</StepHead>
      <ul className="card stack setup-points">
        <li><ShieldCheck size={20} strokeWidth={2} aria-hidden="true" /><span><strong>What:</strong> your runs, heart rate, how sessions felt, pain or illness you report, and the answers in this setup.</span></li>
        <li><HeartPulse size={20} strokeWidth={2} aria-hidden="true" /><span><strong>Why:</strong> only to build and adjust your plan and explain your training to you. Never sold, never used for advertising.</span></li>
        <li><Check size={20} strokeWidth={2} aria-hidden="true" /><span><strong>Your control:</strong> export or delete everything at any time in Privacy. Deleting your account removes it all.</span></li>
      </ul>
      <div className="stack">
        <Check2 id="c-health" checked={health} onChange={setHealth}>
          I agree to Ritmo processing my health and training data to coach me, as described in the <Link to="/privacy" target="_blank">privacy notice</Link>. <span className="caption">Required</span>
        </Check2>
        <Check2 id="c-ai" checked={ai} onChange={setAi}>
          Use the AI coach for chat answers. Ritmo sends your question and a training summary to an AI service, never your email, photo, date of birth or health check. <span className="caption">Optional, change any time</span>
        </Check2>
      </div>
      <Footer disabled={!health} onNext={() => onNext({ healthConsentAt: now(), consents: { ...data.profile.consents, healthData: { granted: true, at: now(), version: CONSENT_VERSION }, aiCoach: { granted: ai, at: now() } } })} />
    </div>
  );
}

// ---------------- 2. Basics ----------------
function BasicsStep({ onNext }: StepProps) {
  const { data, signOut } = useApp();
  const p = data.profile;
  const [name, setName] = useState(p.name);
  const dob0 = p.dateOfBirth ? parseYmd(p.dateOfBirth) : undefined;
  const [d, setD] = useState(dob0 ? String(dob0.getDate()) : '');
  const [m, setM] = useState(dob0 ? String(dob0.getMonth() + 1) : '');
  const [y, setY] = useState(dob0 ? String(dob0.getFullYear()) : '');
  const [units, setUnits] = useState(p.units);
  const [photo, setPhoto] = useState(false);
  const [err, setErr] = useState<string>();
  const [tooYoung, setTooYoung] = useState(false);
  const thisYear = new Date().getFullYear();
  const dob = d && m && y ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : '';
  const validDate = dob && parseYmd(dob).getDate() === Number(d);

  if (tooYoung) {
    return (
      <div className="stack-lg">
        <StepHead title={`Ritmo is for adults ${MIN_AGE} and over`}>Thank you for your interest. Training plans for younger runners need different care, so Ritmo cannot coach you yet. Your date of birth has not been saved.</StepHead>
        <p className="muted">A local running club with qualified youth coaches is a great place to start.</p>
        <div className="stack-sm">
          <Link to="/profile/privacy" className="btn btn-block">Delete my account</Link>
          <button className="btn btn-ghost btn-block" onClick={() => void signOut()}>Log out</button>
          <button className="btn btn-ghost btn-block" onClick={() => setTooYoung(false)}>I entered the wrong date</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <StepHead title="About you">This helps Ritmo talk to you and keep training safe for your age.</StepHead>
      <div className="row" style={{ gap: 'var(--s4)' }}>
        <AvatarImage size={72} />
        <div className="stack-sm" style={{ gap: 4 }}>
          <button className="btn btn-small" onClick={() => setPhoto(true)}><Camera size={18} strokeWidth={2} aria-hidden="true" />{p.avatar ? 'Change photo' : 'Add a photo'}</button>
          <span className="caption">Optional</span>
        </div>
      </div>
      <AvatarEditor open={photo} onClose={() => setPhoto(false)} />
      <div className="field"><label htmlFor="s-name">First name</label><input id="s-name" className="input" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 6 }}>Date of birth</legend>
        <div className="dob">
          <select aria-label="Day" className="input" value={d} onChange={(e) => setD(e.target.value)}><option value="">Day</option>{Array.from({ length: 31 }, (_, k) => <option key={k} value={k + 1}>{k + 1}</option>)}</select>
          <select aria-label="Month" className="input" value={m} onChange={(e) => setM(e.target.value)}><option value="">Month</option>{MONTHS_LONG.map((x, k) => <option key={x} value={k + 1}>{x}</option>)}</select>
          <select aria-label="Year" className="input" value={y} onChange={(e) => setY(e.target.value)}><option value="">Year</option>{Array.from({ length: 90 }, (_, k) => thisYear - 10 - k).map((x) => <option key={x} value={x}>{x}</option>)}</select>
        </div>
        <span className="caption">Used for the age rule and age-aware training limits. Never shown to anyone.</span>
      </fieldset>
      <Chips label="Distance units" value={units} onChange={setUnits} options={[{ value: 'km', label: 'Kilometres' }, { value: 'mi', label: 'Miles' }]} />
      <Footer err={err} onNext={() => {
        if (!name.trim()) { setErr('Please enter your first name.'); return; }
        if (!validDate) { setErr('Please choose your full date of birth.'); return; }
        if (ageOn(dob, new Date()) < MIN_AGE) { setErr(undefined); setTooYoung(true); return; }
        onNext({ name: name.trim(), dateOfBirth: dob, birthYear: Number(y), units });
      }} />
    </div>
  );
}

// ---------------- 3. Health check ----------------
function HealthStep({ onNext }: StepProps) {
  const [answers, setAnswers] = useState<Record<string, 'yes' | 'no' | ''>>({});
  const [ack, setAck] = useState(false);
  const all = HEALTH_QUESTIONS.every((q) => answers[q.id]);
  const anyYes = HEALTH_QUESTIONS.some((q) => answers[q.id] === 'yes');
  return (
    <div className="stack-lg">
      <StepHead title="Before you start">Six quick questions to check running is safe for you right now. Ritmo keeps only the outcome, not your answers.</StepHead>
      {HEALTH_QUESTIONS.map((q, k) => (
        <div key={q.id} className="card">
          <Chips label={`${k + 1}. ${q.text}`} value={answers[q.id] ?? ''} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]} />
        </div>
      ))}
      {anyYes && (
        <div className="card stack" role="status">
          <StatusLine kind="warning">Please check with a doctor before you start</StatusLine>
          <p className="muted">One of your answers means a doctor should confirm that running is right for you, and whether anything should be adjusted. Ritmo gives coaching guidance, not medical advice.</p>
          <Check2 id="h-ack" checked={ack} onChange={setAck}>I have checked with a doctor, or will before I start training, and I understand Ritmo is not medical advice.</Check2>
        </div>
      )}
      <Footer disabled={!all || (anyYes && !ack)} onNext={() => {
        const at = new Date().toISOString();
        onNext({ healthCheck: anyYes ? { completedAt: at, doctorAdvised: true, acknowledgedAt: at } : { completedAt: at, doctorAdvised: false } });
      }} />
    </div>
  );
}

// ---------------- 4. Running background ----------------
const LEVELS: { value: BackgroundLevel; label: string; sub: string }[] = [
  { value: 'new', label: 'I am new to running', sub: 'Little or no running before' },
  { value: 'returning', label: 'I am coming back', sub: 'I used to run and stopped for a while' },
  { value: 'sometimes', label: 'I run now and then', sub: 'Once a week or less' },
  { value: 'regular', label: 'I run regularly', sub: 'Two or more times a week' },
  { value: 'racer', label: 'I train for races', sub: 'I follow a plan and race' },
];
const EXERCISE = ['Walking', 'Cycling', 'Swimming', 'Gym', 'Team sports', 'Yoga or pilates'];

function BackgroundStep({ onNext }: StepProps) {
  const { data, today } = useApp();
  const b0 = data.profile.background;
  const fromRuns = useMemo(() => backgroundFromRuns(data.activities, today), [data.activities, today]);
  const [level, setLevel] = useState<BackgroundLevel | ''>(b0?.level ?? (fromRuns ? 'regular' : ''));
  const [canRun10, setCanRun10] = useState<'yes' | 'no' | ''>(b0?.canRun10 === undefined ? '' : b0.canRun10 ? 'yes' : 'no');
  const [walks, setWalks] = useState<'yes' | 'no' | ''>(b0?.walksRegularly === undefined ? '' : b0.walksRegularly ? 'yes' : 'no');
  const [months, setMonths] = useState<number | 0>(b0?.monthsSinceLastRan ?? 0);
  const [exDays, setExDays] = useState<number | undefined>(b0?.exerciseDaysPerWeek);
  const [exTypes, setExTypes] = useState<string[]>(b0?.exerciseTypes ?? []);
  const [weeklyKm, setWeeklyKm] = useState<number | undefined>(b0?.weeklyKm ?? fromRuns?.weeklyKm);
  const [longest, setLongest] = useState<number | undefined>(b0?.longestRecentKm ?? fromRuns?.longestRecentKm);
  const r0 = b0?.recentRace && b0.recentRace !== 'unknown' ? b0.recentRace : undefined;
  const [raceM, setRaceM] = useState<number | 0>(r0?.distanceM ?? 0);
  const [raceS, setRaceS] = useState<number | undefined>(r0?.timeS);
  const [noRace, setNoRace] = useState(b0?.recentRace === 'unknown');
  const [err, setErr] = useState<string>();
  const unit = data.profile.units === 'mi' ? 'mi' : 'km';
  const runner = level === 'sometimes' || level === 'regular' || level === 'racer';

  const save = () => {
    if (!level) { setErr('Choose the option that fits you best.'); return; }
    const bg: RunningBackground = { level };
    if (level === 'new' || level === 'returning') {
      if (!canRun10) { setErr('Please say whether you can run for 10 minutes.'); return; }
      bg.canRun10 = canRun10 === 'yes';
      if (level === 'new') { if (!walks) { setErr('Please say whether you walk regularly.'); return; } bg.walksRegularly = walks === 'yes'; }
      else { if (!months) { setErr('Please say how long it has been since you last ran.'); return; } bg.monthsSinceLastRan = months; bg.walksRegularly = true; }
      bg.exerciseDaysPerWeek = exDays ?? 0; bg.exerciseTypes = exTypes;
    } else {
      if (weeklyKm === undefined) { setErr(`Please give a rough weekly distance. A guess is fine.`); return; }
      bg.weeklyKm = unit === 'mi' ? Math.round(weeklyKm * 1.609) : weeklyKm;
      bg.longestRecentKm = longest === undefined ? undefined : unit === 'mi' ? Math.round(longest * 1.609) : longest;
      if (raceM && raceS) bg.recentRace = { distanceM: raceM, timeS: raceS };
      else if (noRace) bg.recentRace = 'unknown';
      else if (level === 'racer') { setErr('Add a recent race time, or choose "I do not have one".'); return; }
      bg.filledFromRuns = !!fromRuns && weeklyKm === fromRuns.weeklyKm;
    }
    onNext({ background: bg });
  };

  return (
    <div className="stack-lg">
      <StepHead title="Your running so far">So your first week is not too easy or too hard.</StepHead>
      <div className="stack-sm" role="radiogroup" aria-label="Which describes you best?">
        {LEVELS.map((l) => (
          <button key={l.value} role="radio" aria-checked={level === l.value} className={`choice${level === l.value ? ' on' : ''}`} onClick={() => { setLevel(l.value); setErr(undefined); }}>
            <span className="label">{l.label}</span><span className="caption">{l.sub}</span>
          </button>
        ))}
      </div>

      {(level === 'new' || level === 'returning') && (
        <section className="card stack">
          {level === 'returning' && <Chips label="When did you last run regularly?" value={months} onChange={setMonths} options={[{ value: 2, label: 'Under 3 months' }, { value: 6, label: '3 to 12 months' }, { value: 18, label: '1 to 2 years' }, { value: 30, label: 'Longer' }]} />}
          <Chips label="Can you run for 10 minutes without stopping?" value={canRun10} onChange={setCanRun10} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'Not yet' }]} />
          {level === 'new' && <Chips label="Do you walk regularly, for example 30 minutes most days?" value={walks} onChange={setWalks} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'Not really' }]} />}
          <Stepper id="s-exdays" label="Days a week you do other exercise" value={exDays} onChange={setExDays} min={0} max={7} placeholder="0" />
          <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ marginBottom: 6 }}>What kind? <span className="caption">Optional</span></legend>
            <div className="row wrap">{EXERCISE.map((x) => <button key={x} type="button" className="chip" aria-pressed={exTypes.includes(x)} onClick={() => setExTypes((t) => (t.includes(x) ? t.filter((y) => y !== x) : [...t, x]))}>{x}</button>)}</div>
          </fieldset>
        </section>
      )}

      {runner && (
        <section className="card stack">
          {fromRuns && <StatusLine kind="info">Filled in from your runs. Change anything that looks wrong.</StatusLine>}
          <Stepper id="s-weekly" label={`Typical distance a week (${unit})`} value={weeklyKm} onChange={setWeeklyKm} min={0} max={250} step={5} unit={unit} placeholder="15" />
          <Stepper id="s-long" label={`Longest run in the last 6 weeks (${unit})`} value={longest} onChange={setLongest} min={0} max={60} unit={unit} placeholder="8" />
          <Chips label="A recent race or time trial" value={noRace ? -1 : raceM} onChange={(v) => { if (v === -1) { setNoRace(true); setRaceM(0); } else { setNoRace(false); setRaceM(v); } }}
            options={[...RACE_DISTANCES.filter((r) => r.m <= 42195).map((r) => ({ value: r.m, label: r.label })), { value: -1, label: 'I do not have one' }]} />
          {!!raceM && <DurationField id="s-racetime" label="Your time" value={raceS} onChange={setRaceS} />}
          <p className="caption">A time from the last six months gives the most accurate paces. Without one, paces start as an estimate and improve as you log runs.</p>
        </section>
      )}
      <Footer err={err} onNext={save} />
    </div>
  );
}

// ---------------- 5. Goal ----------------
const GOALS: { value: GoalType; label: string; for: 'beginner' | 'runner' | 'all' }[] = [
  { value: 'start', label: 'Start running and enjoy it', for: 'beginner' },
  { value: '5k', label: 'Run 5K without stopping', for: 'beginner' },
  { value: 'first10k', label: 'My first 10K', for: 'all' },
  { value: 'faster', label: 'Get faster', for: 'runner' },
  { value: 'further', label: 'Run further', for: 'runner' },
  { value: 'fit', label: 'Get fitter and healthier', for: 'all' },
  { value: 'race', label: 'Train for a race', for: 'all' },
];

function GoalStep({ onNext, vdot }: StepProps & { vdot?: number }) {
  const { data, saveRace, today } = useApp();
  const bg = data.profile.background;
  const beginner = !bg || bg.level === 'new' || bg.level === 'returning';
  const existingA = data.races.filter((r) => r.date >= ymd(today)).sort((a, b) => a.priority.localeCompare(b.priority))[0];
  const [goal, setGoal] = useState<GoalType | ''>(data.profile.goalType ?? (existingA ? 'race' : ''));
  const [race, setRace] = useState<Partial<Race>>(existingA ?? { name: '', distanceM: 10000, courseType: 'road', priority: 'A' });
  const [warn, setWarn] = useState<ReturnType<typeof checkGoal>>();
  const [err, setErr] = useState<string>();
  const opts = GOALS.filter((g) => g.for === 'all' || (beginner ? g.for === 'beginner' : g.for === 'runner'));
  const estVdot = vdot ?? (bg?.recentRace && bg.recentRace !== 'unknown' ? vdotFromPerformance(bg.recentRace.distanceM, bg.recentRace.timeS) : bg?.weeklyKm ? vdotFromWeeklyKm(bg.weeklyKm) : undefined);

  const commit = (g: GoalType, r?: Partial<Race>) => {
    const label = g === 'race' && r ? `${r.name || 'My race'}${r.goalS ? ` in ${duration(r.goalS)}` : ''}` : GOALS.find((x) => x.value === g)!.label;
    if (g === 'race' && r?.date && r.distanceM) saveRace({ id: r.id ?? uid(), name: r.name || 'My race', date: r.date, distanceM: r.distanceM, courseType: r.courseType ?? 'road', goalS: r.goalS, priority: 'A' });
    onNext({ goalType: g, goal: label });
  };
  const submit = () => {
    if (!goal) { setErr('Choose a goal.'); return; }
    if (goal === 'race' && !race.date) { setErr('Choose the race date.'); return; }
    const c = checkGoal({ goalType: goal, race, level: bg?.level ?? 'new', canRun10: bg?.canRun10, weeklyKm: bg?.weeklyKm, vdot: estVdot, today });
    if (!c.ok && !warn) { setWarn(c); return; }
    commit(goal, race);
  };

  return (
    <div className="stack-lg">
      <StepHead title="What would you like to achieve?">You can change this later.</StepHead>
      <div className="stack-sm" role="radiogroup" aria-label="Your goal">
        {opts.map((g) => <button key={g.value} role="radio" aria-checked={goal === g.value} className={`choice${goal === g.value ? ' on' : ''}`} onClick={() => { setGoal(g.value); setWarn(undefined); setErr(undefined); }}><span className="label">{g.label}</span></button>)}
      </div>
      {goal === 'race' && (
        <section className="card stack">
          <div className="field"><label htmlFor="g-name">Race name</label><input id="g-name" className="input" value={race.name ?? ''} onChange={(e) => { setRace({ ...race, name: e.target.value }); setWarn(undefined); }} placeholder="For example, Malta Marathon" /></div>
          <DateField id="g-date" label="Race date" value={race.date ?? ''} min={ymd(addDays(today, 1))} onChange={(v) => { setRace({ ...race, date: v }); setWarn(undefined); }} />
          <Chips label="Distance" value={race.distanceM ?? 10000} onChange={(v) => { setRace({ ...race, distanceM: v }); setWarn(undefined); }} options={RACE_DISTANCES.filter((r) => r.m <= 42195).map((r) => ({ value: r.m, label: r.label }))} />
          <DurationField id="g-time" label="Goal time (optional)" value={race.goalS} onChange={(v) => { setRace({ ...race, goalS: v }); setWarn(undefined); }} />
        </section>
      )}
      {warn && !warn.ok && (
        <div className="card stack" role="status">
          <StatusLine kind="warning">A safer option</StatusLine>
          <p>{warn.message}</p>
          {warn.saferGoal && <button className="btn btn-primary" onClick={() => commit(warn.saferGoal!.goalType, warn.saferGoal!.race ? { ...race, ...warn.saferGoal!.race } : undefined)}>{warn.saferGoal.label}</button>}
          <button className="btn btn-ghost" onClick={() => commit(goal as GoalType, race)}>Keep my goal</button>
        </div>
      )}
      {!(warn && !warn.ok) && <Footer err={err} onNext={submit} />}
    </div>
  );
}

// ---------------- 6. Schedule ----------------
function ScheduleStep({ onNext }: StepProps) {
  const { data, today } = useApp();
  const p = data.profile;
  const bg = p.background;
  const beginner = !bg || bg.level === 'new' || bg.level === 'returning';
  const [days, setDays] = useState<number[]>(p.daysAvailable.length ? p.daysAvailable : beginner ? [1, 3, 5] : [1, 3, 5, 6]);
  const [longDay, setLongDay] = useState<number>(p.longRunDay ?? 6);
  const [mins, setMins] = useState<number>(p.schedule?.sessionMinutes ?? (beginner ? 30 : 45));
  const [start, setStart] = useState<string>(p.schedule?.startDate && p.schedule.startDate >= ymd(today) ? p.schedule.startDate : ymd(today));
  const [off, setOff] = useState<TrainingSchedule['timeOff']>(p.schedule?.timeOff ?? []);
  const [offFrom, setOffFrom] = useState('');
  const [offTo, setOffTo] = useState('');
  const [err, setErr] = useState<string>();
  const used = beginner ? pickStarterDays(days) : days;
  const ld = days.includes(longDay) ? longDay : days[days.length - 1];

  return (
    <div className="stack-lg">
      <StepHead title="Your training week">Pick the days you could run. Ritmo plans rest days around them.</StepHead>
      <section className="card stack">
        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 6 }}>Days you could run</legend>
          <div className="row wrap">{DAY_SHORT.map((d, k) => <button type="button" key={d} className="chip" aria-pressed={days.includes(k)} aria-label={DAY_NAMES[k]} onClick={() => setDays((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k].sort()))}>{d}</button>)}</div>
          {days.length >= 2
            ? <p className="caption">{beginner ? `Your plan will use ${used.map((x) => DAY_NAMES[x]).join(', ').replace(/, ([^,]*)$/, ' and $1')}, with a rest day between each.` : `${days.length} days a week.`}</p>
            : <p className="caption">Choose at least two days.</p>}
        </fieldset>
        {!beginner && days.length >= 2 && <Chips label="Long run day" value={ld} onChange={setLongDay} options={days.map((k) => ({ value: k, label: DAY_SHORT[k] }))} />}
        <Chips label="Time you have for a usual session" value={mins} onChange={setMins} options={[20, 30, 45, 60, 90].map((x) => ({ value: x, label: x === 90 ? '90 min or more' : `${x} min` }))} />
      </section>
      <section className="card stack">
        <DateField id="s-start" label="Start date" value={start} min={ymd(today)} onChange={setStart} />
        <div className="stack-sm">
          <span className="label">Time off coming up <span className="caption">Optional</span></span>
          <p className="caption">Holidays or busy weeks. Ritmo plans rest on these days.</p>
          {off.map((o, k) => (
            <div key={k} className="row-between"><span>{longDate(parseYmd(o.from))} to {longDate(parseYmd(o.to))}</span><button className="icon-btn" aria-label="Remove this time off" onClick={() => setOff((x) => x.filter((_, j) => j !== k))}><X size={18} strokeWidth={2} /></button></div>
          ))}
          <div className="grid-2">
            <DateField id="s-off-from" label="From" value={offFrom} min={ymd(today)} onChange={(v) => { setOffFrom(v); if (!offTo || offTo < v) setOffTo(v); }} />
            <DateField id="s-off-to" label="To" value={offTo} min={offFrom || ymd(today)} onChange={setOffTo} />
          </div>
          <button className="btn btn-small" style={{ alignSelf: 'flex-start' }} disabled={!offFrom || !offTo} onClick={() => { setOff((x) => [...x, { from: offFrom, to: offTo }].sort((a, b) => a.from.localeCompare(b.from))); setOffFrom(''); setOffTo(''); }}>Add time off</button>
        </div>
      </section>
      <Footer err={err} onNext={() => {
        if (days.length < 2) { setErr('Choose at least two days you could run.'); return; }
        onNext({ daysAvailable: days, longRunDay: ld, schedule: { sessionMinutes: mins, startDate: start, timeOff: off } });
      }} />
    </div>
  );
}

// ---------------- 7. Injuries ----------------
function InjuriesStep({ onNext }: StepProps) {
  const { data } = useApp();
  const [list, setList] = useState<Injury[]>(data.profile.injuries);
  const [area, setArea] = useState('');
  const [status, setStatus] = useState<Injury['status']>('current');
  return (
    <div className="stack-lg">
      <StepHead title="Any injuries?">Ritmo uses this to be more careful with you. It is not a diagnosis.</StepHead>
      <button className={`choice${!list.length ? ' on' : ''}`} aria-pressed={!list.length} onClick={() => onNext({ injuries: [], injuriesAnswered: true })}>
        <span className="label">No injuries</span><span className="caption">Continue</span>
      </button>
      <section className="card stack">
        <span className="label">Add an injury</span>
        {list.map((inj, k) => (
          <div key={k} className="row-between"><span>{inj.area} <span className="caption">({inj.status === 'current' ? 'current' : 'past'})</span></span><button className="icon-btn" aria-label={`Remove ${inj.area}`} onClick={() => setList((x) => x.filter((_, j) => j !== k))}><X size={18} strokeWidth={2} /></button></div>
        ))}
        <div className="field"><label htmlFor="i-area">Where</label><input id="i-area" className="input" placeholder="For example, left knee" value={area} onChange={(e) => setArea(e.target.value)} /></div>
        <Chips label="Is it bothering you now?" value={status} onChange={setStatus} options={[{ value: 'current', label: 'Yes, now' }, { value: 'past', label: 'In the past' }]} />
        <button className="btn btn-small" style={{ alignSelf: 'flex-start' }} disabled={!area.trim()} onClick={() => { setList((x) => [...x, { area: area.trim(), status }]); setArea(''); }}>Add</button>
        {list.some((x) => x.status === 'current') && <StatusLine kind="info">With a current injury, check with a physio or doctor before you start running.</StatusLine>}
      </section>
      {list.length > 0 && <Footer onNext={() => onNext({ injuries: list, injuriesAnswered: true })} />}
    </div>
  );
}

// ---------------- 8. Runs ----------------
function RunsStep({ onNext }: StepProps) {
  const { data, today } = useApp();
  const runs = data.activities.length;
  const fill = () => {
    const f = backgroundFromRuns(data.activities, today);
    const bg = data.profile.background;
    if (f && bg && bg.level !== 'new' && bg.level !== 'returning' && !bg.weeklyKm) return { background: { ...bg, ...f, filledFromRuns: true } };
    return {};
  };
  return (
    <div className="stack-lg">
      <StepHead title="Add your past runs">Optional. With your history, Ritmo can measure your fitness instead of estimating it.</StepHead>
      <section className="card stack"><UploadPanel /></section>
      <p className="caption">On a phone, you can connect Apple Health or Health Connect later in Profile. Garmin sync is coming once Garmin approves access.</p>
      <Footer label={runs ? `Continue with ${runs} run${runs === 1 ? '' : 's'}` : 'Skip for now'} onNext={() => onNext(fill())} />
    </div>
  );
}

// ---------------- 9. Plan preview ----------------
function PreviewStep({ today, onAccept, onEditDays }: { today: Date; onAccept: (plan: Plan) => void; onEditDays: () => void }) {
  const { data } = useApp();
  const result = useMemo(() => planFromSetup({ profile: data.profile, races: data.races, activities: data.activities, today }), [data.profile, data.races, data.activities, today]);
  const u = data.profile.units;
  const first = result.plan.sessions.filter((s) => s.type !== 'rest').slice(0, 6);
  return (
    <div className="stack-lg">
      <StepHead title="Your first weeks" />
      <section className="card stack">
        <p>{result.basis}</p>
        <span className={`tag${result.confidence === "measured" ? " tag-accent" : ""}`} style={{ alignSelf: 'flex-start' }}>
          {result.confidence === 'measured' ? 'Paces measured from your runs' : result.confidence === 'estimated' ? 'Paces are an estimate for now' : 'Set by effort, no paces yet'}
        </span>
      </section>
      <ul className="list card" aria-label="First sessions">
        {first.map((s) => (
          <li key={s.id} className="list-item row-between">
            <span className="stack-sm" style={{ gap: 2 }}><span className="label">{s.title}</span><span className="caption">{longDate(parseYmd(s.date))}</span></span>
            <span className="stat">{s.distanceM ? dist(s.distanceM, u) : durationWords(s.durationS)}</span>
          </li>
        ))}
      </ul>
      <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={onEditDays}>Change my training days</button>
      <Footer label="Start my plan" onNext={() => onAccept(result.plan)} />
      <p className="caption" style={{ textAlign: 'center' }}><Sparkles size={14} strokeWidth={2} aria-hidden="true" style={{ display: 'inline', verticalAlign: '-2px' }} /> The plan adapts after every run you log.</p>
    </div>
  );
}

// ---------------- Finished (existing users) ----------------
function Done({ hadPlan, onFinish }: { hadPlan: boolean; onFinish: (plan?: Plan) => void }) {
  const { data, today } = useApp();
  const [confirm, setConfirm] = useState(false);
  if (!hadPlan) {
    // New setup with nothing left to answer but no plan: build one now
    const r = planFromSetup({ profile: data.profile, races: data.races, activities: data.activities, today });
    return (
      <div className="setup stack-lg">
        <StepHead title="All set">{r.basis}</StepHead>
        <button className="btn btn-primary btn-block" onClick={() => onFinish(r.plan)}>Start my plan</button>
      </div>
    );
  }
  return (
    <div className="setup stack-lg">
      <StepHead title="Thank you, all set">Your answers are saved. Your current plan stays as it is.</StepHead>
      <button className="btn btn-primary btn-block" onClick={() => onFinish()}>Go to today</button>
      {!confirm
        ? <button className="btn btn-ghost btn-block" onClick={() => setConfirm(true)}>Rebuild my plan with these answers</button>
        : (
          <div className="card stack" role="alertdialog" aria-label="Replace your plan?">
            <p>This replaces your current plan from today. Past sessions and your runs are kept.</p>
            <div className="row"><button className="btn" onClick={() => setConfirm(false)}>Keep my plan</button><button className="btn btn-primary" onClick={() => onFinish(planFromSetup({ profile: data.profile, races: data.races, activities: data.activities, today }).plan)}>Replace it</button></div>
          </div>
        )}
    </div>
  );
}
