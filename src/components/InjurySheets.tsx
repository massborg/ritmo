// The injury flow after the first report (update 4, task 2b):
// - the daily check-in, from day 2: 20 seconds, compared with yesterday, with the pain trend from day 3 and a quick
//   test every 3rd day
// - "It feels healed": three checks, then ease back in or go straight back to the plan
// - the injury history, with "It's back" for 30 days
// General guidance only, never a diagnosis; red flags still pause running (rules in training/body).
import { useState } from 'react';
import { Check } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Chips, Sheet } from './inputs';
import { StatusLine } from './ui';
import { DISCLAIMER, RTR_STEPS } from '../training/body';
import { canReopen, dayNumber, EASE_DAYS, EASE_NO_HARD_DAYS, injuryLabel, painTrend, testDue, testFor, trendWord, type CheckResult, type Injury, type PastInjury } from '../training/injury';
import { DAY_SHORT, parseYmd, weekday, ymd } from '../lib/format';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dayMonth = (d: string) => parseYmd(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Morning pain over the last days as bars: taller is worse, green at 0–1, amber at 2, orange above */
export function PainTrend({ days, title }: { days: { date: string; pain: number }[]; title: string }) {
  const max = 5;
  return (
    <div className="pain-trend" role="img" aria-label={`${title}: ${days.map((d) => `${DAY_SHORT[weekday(parseYmd(d.date))]} ${d.pain} out of 10`).join(', ')}`}>
      {days.map((d) => (
        <div key={d.date} className="pain-day">
          <span className={`pain-bar${d.pain <= 1 ? ' low' : d.pain <= 2 ? ' mid' : ''}`} style={{ height: `${Math.max(8, (Math.min(max, d.pain) / max) * 100)}%` }} />
          <span className="caption">{d.date === ymd(new Date()) ? 'Today' : DAY_SHORT[weekday(parseYmd(d.date))]}</span>
        </div>
      ))}
    </div>
  );
}

export function InjuryCheckinSheet({ injury, onClose, onHealed, onUpdateDetails }: { injury: Injury; onClose: () => void; onHealed: () => void; onUpdateDetails: () => void }) {
  const { injuryCheckIn, today } = useApp();
  const t = ymd(today);
  const dayN = dayNumber(injury, t);
  const yesterday = [...injury.days].filter((d) => d.date < t).sort((a, b) => b.date.localeCompare(a.date))[0];
  const already = injury.days.find((d) => d.date === t && dayN > 1);
  const [vs, setVs] = useState<'better' | 'same' | 'worse' | ''>(already?.vs ?? '');
  const [pain, setPain] = useState<number>(already?.pain ?? Math.min(5, yesterday?.pain ?? 1));
  const [run, setRun] = useState<'ok' | 'high' | 'none' | ''>(already?.run ?? '');
  const [test, setTest] = useState<'pass' | 'fail' | ''>(already?.test ?? '');
  const [out, setOut] = useState<{ result?: CheckResult; flags: string[] }>();
  const step = RTR_STEPS[injury.step - 1];
  const due = testDue(injury, t);
  const trend = painTrend({ days: [...injury.days.filter((d) => d.date !== t), { date: t, pain }].sort((a, b) => a.date.localeCompare(b.date)) });
  const ok = vs && run && (!due || test);
  const title = `${cap(injuryLabel(injury))} · day ${dayN} · step ${injury.step} of 6`;

  if (out) {
    const r = out.result;
    return (
      <Sheet open onClose={onClose} title={out.flags.length ? 'Stop running and get checked' : 'Check-in saved'} footer={<button className="btn btn-primary btn-block" onClick={onClose}>Done</button>}>
        {out.flags.length ? (
          <div className="stack" role="alert">
            <StatusLine kind="danger">Please stop running and see a doctor or physio before you run again.</StatusLine>
            <ul className="bullets">{out.flags.map((f) => <li key={f}>{f}</li>)}</ul>
            <p>Your plan is paused until you confirm you have been checked. You can do that from the Training page.</p>
          </div>
        ) : r && (
          <div className="stack">
            <div className={`card stack-sm step-result ${r.change}`} role="status">
              <div className="row-between"><span className="label">{r.change === 'up' ? `Step ${r.injury.step} unlocked` : r.change === 'back' ? `Back to step ${r.injury.step}` : `Step ${r.injury.step} of 6`}</span>{r.clearDays > 0 && <span className="status-chip done">{r.clearDays} day{r.clearDays === 1 ? '' : 's'} clear</span>}</div>
              <p>{r.message}</p>
              <p className="caption">{RTR_STEPS[r.injury.step - 1].detail}</p>
            </div>
            {r.offerHealed && (
              <div className="card stack-sm">
                <p className="label">Feels healed?</p>
                <p className="caption">Five days at 0–1 out of 10. If it feels healed, you can go back to your plan.</p>
                <button className="btn btn-small" style={{ alignSelf: 'flex-start' }} onClick={onHealed}>It feels healed</button>
              </div>
            )}
          </div>
        )}
        <p className="caption">{DISCLAIMER}</p>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title="Morning check-in"
      footer={<button className="btn btn-primary btn-block" disabled={!ok} onClick={() => setOut(injuryCheckIn({ pain, vs: vs || undefined, run: run || undefined, test: test || undefined }))}>Save check-in</button>}>
      <p className="caption">{title}</p>
      {dayN >= 3 && trend.length >= 2 && (
        <div className="card stack-sm">
          <div className="row-between"><span className="caption">Pain, last {trend.length} days</span><span className={`status-chip ${trendWord({ days: trend }) === 'Getting better' ? 'done' : trendWord({ days: trend }) === 'Getting worse' ? 'missed' : ''}`}>{trendWord({ days: trend })}</span></div>
          <PainTrend days={trend} title="Morning pain" />
        </div>
      )}
      <Chips<'better' | 'same' | 'worse' | ''> label={`This morning compared to yesterday${yesterday ? ` (${yesterday.pain}/10)` : ''}`} value={vs} onChange={setVs} options={[{ value: 'better', label: 'Better' }, { value: 'same', label: 'Same' }, { value: 'worse', label: 'Worse' }]} />
      <Chips<number> label="Pain this morning" value={pain} onChange={setPain} options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: n, label: n === 5 ? '5+' : String(n) }))} />
      <Chips<'ok' | 'high' | 'none' | ''> label={`Yesterday's run: step ${injury.step}, ${step.km} km easy`} value={run} onChange={setRun} options={[{ value: 'ok', label: 'Pain 2 or less' }, { value: 'high', label: 'Above 2' }, { value: 'none', label: "Didn't run" }]} />
      {due && <Chips<'pass' | 'fail' | ''> label={`Quick test: ${testFor(injury.area)}, without pain?`} value={test} onChange={setTest} options={[{ value: 'pass', label: 'Yes, no pain' }, { value: 'fail', label: 'It hurt' }]} />}
      <button type="button" className="list-item row-between healed-row" onClick={onHealed}>
        <span className="row" style={{ gap: 10 }}><span className="healed-tick" aria-hidden="true"><Check size={18} strokeWidth={2.5} /></span><span className="stack-sm" style={{ gap: 0, textAlign: 'left' }}><span className="label">It feels healed</span><span className="caption">Skip the remaining steps and go back to your plan.</span></span></span>
      </button>
      <button type="button" className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={onUpdateDetails}>Update details (wrong place or type?)</button>
    </Sheet>
  );
}

/** "It feels healed": three quick checks, then how to return. A "No" warns gently but never blocks. */
export function HealedSheet({ onClose }: { onClose: () => void }) {
  const { data, healInjury, today } = useApp();
  const inj = data.profile.body?.injury;
  const test = inj ? testFor(inj.area) : undefined;
  const checks = ['Walking and stairs pain-free', 'Last easy run, pain 0–1', test ? `${test}, no pain` : 'Normal movement, no pain'];
  const [ans, setAns] = useState<(boolean | undefined)[]>([undefined, undefined, undefined]);
  const [how, setHow] = useState<'ease' | 'straight'>('ease');
  const [done, setDone] = useState(false);
  const anyNo = ans.some((a) => a === false);
  const name = inj ? injuryLabel(inj) : 'injury';
  if (done) return (
    <Sheet open onClose={onClose} title="Back to your plan" footer={<button className="btn btn-primary btn-block" onClick={onClose}>Done</button>}>
      <StatusLine kind="success">{cap(name)} marked healed. Your plan is rebuilt from today{how === 'ease' ? `, easing back in over ${EASE_DAYS} days` : ''}.</StatusLine>
      <p className="caption">It is saved in your injury history (Profile, Health). If it comes back within 30 days, tap "It's back" there or on Training and you restart at the step you reached, not step 1.</p>
    </Sheet>
  );
  return (
    <Sheet open onClose={onClose} title="Back to your plan"
      footer={<button className="btn btn-primary btn-block" disabled={ans.some((a) => a === undefined)} onClick={() => { healInjury(how); setDone(true); }}>Mark as healed</button>}>
      <p className="caption">Three quick checks so Ritmo knows how to bring you back.</p>
      <ul className="list healed-checks">
        {checks.map((c, i) => (
          <li key={c} className="list-item row-between" style={{ gap: 12 }}>
            <span>{c}</span>
            <span className="row" role="group" aria-label={c} style={{ gap: 6 }}>
              <button type="button" className="chip" aria-pressed={ans[i] === true} onClick={() => setAns((a) => a.map((x, j) => (j === i ? true : x)))}>Yes</button>
              <button type="button" className="chip" aria-pressed={ans[i] === false} onClick={() => setAns((a) => a.map((x, j) => (j === i ? false : x)))}>No</button>
            </span>
          </li>
        ))}
      </ul>
      {anyNo && <StatusLine kind="warning">One of these isn't a clear yes. You can still mark it healed, but another few days of the steps may be safer. See a physio if you are unsure.</StatusLine>}
      <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 6 }}>How do you want to return?</legend>
        <button type="button" role="radio" aria-checked={how === 'ease'} className={`choice${how === 'ease' ? ' on' : ''}`} onClick={() => setHow('ease')}>
          <span className="label">Ease back in <span className="status-chip partial">Recommended</span></span>
          <span className="caption">{EASE_DAYS} days at about 70% of your plan, no intervals or hills for the first {EASE_NO_HARD_DAYS}, then the full plan.</span>
        </button>
        <button type="button" role="radio" aria-checked={how === 'straight'} className={`choice${how === 'straight' ? ' on' : ''}`} onClick={() => setHow('straight')}>
          <span className="label">Straight back to my plan</span>
          <span className="caption">Rebuild from today as if nothing happened.</span>
        </button>
      </fieldset>
      {inj && <p className="caption">Moves to your injury history ({name}, {dayMonth(inj.startedAt)} to {dayMonth(ymd(today))}). If it comes back within 30 days, tap It's back and you restart at step {inj.step}, not step 1.</p>}
      <p className="caption">{DISCLAIMER}</p>
    </Sheet>
  );
}

/** Injuries marked healed (Profile, Health), newest first, with "It's back" for 30 days */
export function InjuryHistory() {
  const { data, today, reopenInjury } = useApp();
  const [back, setBack] = useState<PastInjury>();
  const [pain, setPain] = useState(2);
  const list = [...(data.profile.body?.injuryHistory ?? [])].sort((a, b) => b.endedAt.localeCompare(a.endedAt));
  if (!list.length) return null;
  return (
    <div className="stack-sm injury-history">
      <span className="label">Injury history</span>
      <ul className="list">
        {list.map((p) => (
          <li key={p.id} className="list-item stack-sm" style={{ alignItems: 'stretch' }}>
            <div className="row-between">
              <span className="stack-sm" style={{ gap: 0 }}><span className="label">{cap(injuryLabel(p))}</span><span className="caption">{dayMonth(p.startedAt)} to {dayMonth(p.endedAt)} · reached step {p.lastStep} of 6 · {p.how === 'ease' ? 'eased back in' : 'straight back to the plan'}</span></span>
              {canReopen(p, today) && !data.profile.body?.injury && <button type="button" className="btn btn-small" onClick={() => { setBack(p); setPain(2); }}>It's back</button>}
            </div>
            {p.pains.length > 1 && <PainTrend days={p.pains.slice(-7).map((x, i) => ({ date: ymd(new Date(parseYmd(p.startedAt).getTime() + (Math.max(0, p.pains.length - 7) + i) * 86400000)), pain: x }))} title={`${injuryLabel(p)} pain`} />}
          </li>
        ))}
      </ul>
      {back && (
        <Sheet open onClose={() => setBack(undefined)} title={`${cap(injuryLabel(back))} is back`}
          footer={<button className="btn btn-primary btn-block" onClick={() => { reopenInjury(back.id, pain); setBack(undefined); }}>Restart at step {back.lastStep}</button>}>
          <p>Sorry it is back. Return to run restarts at step {back.lastStep} of 6, the last step you reached, not step 1.</p>
          <Chips<number> label="Pain this morning" value={pain} onChange={setPain} options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: n, label: n === 5 ? '5+' : String(n) }))} />
          <p className="caption">If it is sharp, swollen, numb, or hurts at night, use "Something hurts" for a full report instead. {DISCLAIMER}</p>
        </Sheet>
      )}
    </div>
  );
}
