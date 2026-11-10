// "I've done this run": log a planned session, pre-filled from the plan. Three ways in: link a run already
// imported from the watch, read the laps from screenshots, or enter time, distance and each rep by hand.
// Saving links the run to the session, marks it done and opens the feedback.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Image as ImageIcon, Watch, PenLine } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Chips, DurationField, Sheet, StartTimeField, defaultStart } from './inputs';
import { Segmented, StatusLine } from './ui';
import { PAIN_AREAS } from './LogRun';
import { ScreenshotReader } from './ScreenshotReader';
import { dist, duration, longDate, pace, paceRange, parseTime, parseYmd } from '../lib/format';
import type { Activity, PlannedSession, SessionFeedback } from '../lib/types';

type Tab = 'watch' | 'screens' | 'manual';
export interface RepRow { label: string; kind: NonNullable<NonNullable<Activity['reps']>[number]['kind']>; distanceM?: number; time: string; hr: string; unsure?: ('time' | 'hr' | 'distance')[] }

/** "How did it feel?" chips, mapped onto Ritmo's 1–5 feel scale */
const FEEL_TAGS: { value: string; label: string; feel: SessionFeedback['feel'] }[] = [
  { value: 'strong', label: 'Strong', feel: 5 }, { value: 'normal', label: 'Normal', feel: 4 }, { value: 'heavy', label: 'Heavy legs', feel: 3 },
  { value: 'struggled', label: 'Struggled', feel: 2 }, { value: 'stopped', label: 'Stopped early', feel: 1 },
];

/** Rows for the rep table, built from the plan: warm-up, each rep, cool-down. */
export function repRowsFromPlan(s: PlannedSession): RepRow[] {
  const rows: RepRow[] = [];
  for (const st of s.steps) {
    if (st.kind === 'warmup') rows.push({ label: 'Warm-up', kind: 'warmup', distanceM: st.km ? st.km * 1000 : undefined, time: '', hr: '' });
    else if (st.kind === 'cooldown') rows.push({ label: 'Cool-down', kind: 'cooldown', distanceM: st.km ? st.km * 1000 : undefined, time: '', hr: '' });
    else if (st.kind === 'work') {
      const m = st.label.match(/^(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(km|m|min|s)\b/i);
      if (m) {
        const n = Number(m[1]), v = Number(m[2]), unit = m[3].toLowerCase();
        const d = unit === 'km' ? v * 1000 : unit === 'm' ? v : undefined;
        for (let i = 1; i <= n; i++) rows.push({ label: `Rep ${i}${unit === 'min' || unit === 's' ? ` (${v} ${unit})` : ''}`, kind: 'work', distanceM: d, time: '', hr: '' });
      } else rows.push({ label: st.label, kind: 'work', distanceM: st.km ? st.km * 1000 : undefined, time: '', hr: '' });
    }
  }
  return rows;
}

export function LogSessionSheet({ session, onClose }: { session: PlannedSession; onClose: () => void }) {
  const { data, logManualRun, linkRunToSession, logFeedback } = useApp();
  const nav = useNavigate();
  const U = data.profile.units;
  // Runs from the watch on that day (or the day after), closest distance first
  const candidates = useMemo(() => {
    const d0 = session.date, d1 = new Date(parseYmd(session.date).getTime() + 86400000).toISOString().slice(0, 10);
    return data.activities.filter((a) => a.source !== 'manual' && [d0, d1].includes(a.startTime.slice(0, 10)))
      .sort((a, b) => Math.abs(a.distanceM - session.distanceM) - Math.abs(b.distanceM - session.distanceM));
  }, [data.activities, session]);
  const [tab, setTab] = useState<Tab>(candidates.length ? 'watch' : 'manual');
  const [pick, setPick] = useState<string | undefined>(candidates[0]?.id);
  const [durationS, setDurationS] = useState<number | undefined>(session.durationS || undefined);
  const [time, setTime] = useState(() => defaultStart(session.date, session.durationS));
  const [km, setKm] = useState(session.distanceM ? String(Math.round(session.distanceM / 100) / 10) : '');
  const [avgHr, setAvgHr] = useState('');
  const [rows, setRows] = useState<RepRow[]>(() => repRowsFromPlan(session));
  const [rpe, setRpe] = useState(6);
  const [tag, setTag] = useState('');
  const [pain, setPain] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const [media, setMedia] = useState<string[]>([]);
  const redFlag = pain.some((p) => /chest|dizz/i.test(p));
  const work = session.steps.find((x) => x.kind === 'work');

  const setRow = (i: number, patch: Partial<RepRow>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const feedbackFor = (activityId: string): SessionFeedback => ({
    activityId, feel: FEEL_TAGS.find((f) => f.value === tag)!.feel, rpe, pain: pain.map((area) => ({ area, severity: /chest|dizz/i.test(area) ? 3 : 2 })),
    notes: [FEEL_TAGS.find((f) => f.value === tag)?.label, notes].filter(Boolean).join('. ') || undefined, loggedAt: new Date().toISOString(),
  });

  const save = () => {
    setErr('');
    if (!tag) { setErr('Tell us how it felt.'); return; }
    if (tab === 'watch') {
      if (!pick) { setErr('Choose the run from your watch.'); return; }
      linkRunToSession(pick, session.id);
      logFeedback(feedbackFor(pick));
      onClose(); nav(`/activity/${pick}`);
      return;
    }
    const reps = rows.map((r) => ({ label: r.label, kind: r.kind, distanceM: r.distanceM, timeS: parseTime(r.time), avgHr: Number(r.hr) || undefined })).filter((r) => r.timeS || r.avgHr);
    const repTime = reps.reduce((x, r) => x + (r.timeS ?? 0), 0);
    const total = durationS ?? (repTime || undefined);
    const kmNum = Number(km.replace(',', '.'));
    if (!total || total < 60) { setErr('Add the total time, or the time of each rep.'); return; }
    if (!kmNum || kmNum <= 0 || kmNum > 100) { setErr('Add the distance in kilometres. A good guess is fine.'); return; }
    const fb = feedbackFor('');
    const id = logManualRun({ date: session.date, time: time || undefined, durationS: total, distanceM: kmNum * 1000, feel: fb.feel, rpe, pain: fb.pain, notes: fb.notes, sessionId: session.id, avgHr: Number(avgHr) || undefined, reps, media });
    onClose(); nav(`/activity/${id}`);
  };

  return (
    <Sheet open onClose={onClose} title="Log this session"
      footer={<button className="btn btn-primary btn-block" onClick={save}><Check size={18} strokeWidth={2} aria-hidden="true" />Save and see feedback</button>}>
      <div className="card stack-sm" style={{ background: 'var(--surface-sunken)' }}>
        <span className="caption">{longDate(parseYmd(session.date))} · planned</span>
        <span className="label">{session.title}</span>
        <span className="caption">{session.distanceM ? `${dist(session.distanceM, U)} · ` : ''}{session.steps.map((x) => x.label).join(', ')}{work?.pace ? ` · reps at ${paceRange(work.pace[0], work.pace[1], U)}` : ''}</span>
      </div>
      <Segmented<Tab> label="How do you want to log it?" value={tab} onChange={setTab} options={[
        { value: 'watch', label: 'From my watch' }, { value: 'screens', label: 'Screenshots' }, { value: 'manual', label: 'Enter manually' },
      ]} />

      {tab === 'watch' && (candidates.length ? (
        <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="label" style={{ marginBottom: 6 }}><Watch size={16} strokeWidth={2} aria-hidden="true" /> Runs imported that day</legend>
          {candidates.map((a) => (
            <label key={a.id} className="choice" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <input type="radio" name="watch-run" checked={pick === a.id} onChange={() => setPick(a.id)} />
              <span className="stack-sm" style={{ gap: 0 }}><span className="label">{a.name}</span><span className="caption">{new Date(a.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · {dist(a.distanceM, U)} · {duration(a.movingS)} · {pace(a.movingS / (a.distanceM / 1000), U)}</span></span>
            </label>
          ))}
        </fieldset>
      ) : <p className="muted">No run from your watch on that day yet. Upload your file in Data sources, or enter it manually.</p>)}

      {tab === 'screens' && <ScreenshotReader session={session} onUploaded={setMedia} onRows={(r, totals) => {
        setRows(r);
        if (totals?.timeS) setDurationS(totals.timeS);
        if (totals?.distanceM) setKm(String(Math.round(totals.distanceM / 100) / 10));
        if (totals?.avgHr) setAvgHr(String(totals.avgHr));
        setTab('manual');
      }} />}

      {tab === 'manual' && (
        <div className="stack">
          <div className="grid-2">
            <StartTimeField id="ls-start" value={time} onChange={setTime} />
            <DurationField id="ls-time" label="Total time" value={durationS} onChange={setDurationS} />
            <div className="field"><label htmlFor="ls-km">Distance (km)</label><input id="ls-km" className="input" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} /></div>
          </div>
          <div className="field" style={{ maxWidth: 200 }}><label htmlFor="ls-hr">Average heart rate (optional)</label><input id="ls-hr" className="input" inputMode="numeric" value={avgHr} onChange={(e) => setAvgHr(e.target.value.replace(/\D/g, ''))} /></div>
          {rows.length > 0 && (
            <div className="stack-sm">
              <span className="label"><PenLine size={16} strokeWidth={2} aria-hidden="true" /> Each rep (optional)</span>
              <p className="caption">Type times like 3:12. Tab moves to the next box.{rows.some((r) => r.unsure?.length) ? ' Boxes in amber were hard to read: please check them.' : ''}</p>
              <div className="table-scroll">
                <table className="data rep-table">
                  <thead><tr><th scope="col">Part</th><th scope="col">Time</th><th scope="col">Pace</th><th scope="col">HR</th></tr></thead>
                  <tbody>{rows.map((r, i) => {
                    const t = parseTime(r.time);
                    return (
                      <tr key={i} className={r.kind !== 'work' ? 'muted' : undefined}>
                        <th scope="row">{r.label}{r.distanceM ? <span className="caption"> · {r.distanceM >= 1000 ? `${r.distanceM / 1000} km` : `${r.distanceM} m`}</span> : null}</th>
                        <td><input className={`input input-sm${r.unsure?.includes('time') ? ' unsure' : ''}`} aria-label={`${r.label} time${r.unsure?.includes('time') ? ', please check' : ''}`} inputMode="numeric" placeholder="m:ss" value={r.time} onChange={(e) => setRow(i, { time: e.target.value, unsure: r.unsure?.filter((u) => u !== 'time') })} /></td>
                        <td className="stat">{t && r.distanceM ? pace(t / (r.distanceM / 1000), U, false) : '–'}</td>
                        <td><input className={`input input-sm${r.unsure?.includes('hr') ? ' unsure' : ''}`} aria-label={`${r.label} heart rate${r.unsure?.includes('hr') ? ', please check' : ''}`} inputMode="numeric" value={r.hr} onChange={(e) => setRow(i, { hr: e.target.value.replace(/\D/g, ''), unsure: r.unsure?.filter((u) => u !== 'hr') })} /></td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <Chips<number> label="Effort, 1 easy to 10 all out" value={rpe} onChange={setRpe} options={[2, 3, 4, 5, 6, 7, 8, 9, 10].map((x) => ({ value: x, label: String(x) }))} />
      <Chips<string> label="How did it feel?" value={tag} onChange={setTag} options={FEEL_TAGS.map((f) => ({ value: f.value, label: f.label }))} />
      <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 6 }}>Any pain or niggles?</legend>
        <div className="row wrap">{PAIN_AREAS.map((a) => <button type="button" key={a} className="chip" aria-pressed={pain.includes(a)} onClick={() => setPain((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]))}>{a}</button>)}</div>
        {redFlag && <div role="alert"><StatusLine kind="danger">Please stop exercising and get medical advice before you run again. If it is severe or happening now, call your local emergency number.</StatusLine></div>}
      </fieldset>
      <div className="field"><label htmlFor="ls-notes">Notes (optional)</label><textarea id="ls-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Weather, surface, how your legs felt" /></div>
      {err && <div role="alert"><StatusLine kind="danger">{err}</StatusLine></div>}
      <p className="caption"><ImageIcon size={14} strokeWidth={2} aria-hidden="true" /> If the watch file arrives later, Ritmo merges it with this log instead of counting the run twice.</p>
    </Sheet>
  );
}
