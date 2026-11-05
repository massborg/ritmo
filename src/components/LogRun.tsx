// "I did it": log a run by hand with time, rough distance and how it felt.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Chips, DateField, DurationField, Sheet } from './inputs';
import { StatusLine } from './ui';
import type { PlannedSession, SessionFeedback } from '../lib/types';
import { ymd } from '../lib/format';

const FEELS: { value: SessionFeedback['feel']; label: string }[] = [
  { value: 1, label: 'Very hard' }, { value: 2, label: 'Hard' }, { value: 3, label: 'Okay' }, { value: 4, label: 'Good' }, { value: 5, label: 'Great' },
];
export const PAIN_AREAS = ['Foot', 'Ankle', 'Shin', 'Calf', 'Knee', 'Hamstring', 'Hip', 'Lower back', 'Chest pain, dizziness or feeling faint'];

/** Rough distance for a run/walk session: running parts at about 7:30/km, walking at about 11:00/km. */
function estimateKm(s: PlannedSession | undefined, durationS: number): number {
  if (!s || s.distanceM) return s?.distanceM ? s.distanceM / 1000 : Math.round((durationS / 60 / 7) * 10) / 10;
  const m = s.steps[1]?.label.match(/(\d+) x \((\d+) min(?: (\d+) s)? running \+ (\d+) min(?: (\d+) s)? walking\)/);
  if (m) {
    const run = Number(m[2]) * 60 + Number(m[3] ?? 0), walk = Number(m[4]) * 60 + Number(m[5] ?? 0), n = Number(m[1]);
    return Math.round(((n * run) / 450 + ((n - 1) * walk + 600) / 660) * 10) / 10;
  }
  return Math.round((durationS / 450) * 10) / 10;
}

export function LogRunSheet({ open, onClose, session }: { open: boolean; onClose: () => void; session?: PlannedSession }) {
  const { logManualRun } = useApp();
  const nav = useNavigate();
  const [date, setDate] = useState(session?.date ?? ymd(new Date()));
  const [durationS, setDurationS] = useState<number | undefined>(session?.durationS || 30 * 60);
  const [km, setKm] = useState<string>(() => String(estimateKm(session, session?.durationS || 1800)));
  const [feel, setFeel] = useState<SessionFeedback['feel'] | 0>(0);
  const [pain, setPain] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const kmNum = Number(km.replace(',', '.'));
  const redFlag = pain.some((p) => /chest|dizz/i.test(p));

  const save = () => {
    if (!durationS || durationS < 60) { setErr('Add how long you were out, at least one minute.'); return; }
    if (!kmNum || kmNum <= 0 || kmNum > 100) { setErr('Add a rough distance in kilometres. A guess is fine.'); return; }
    if (!feel) { setErr('Tell us how it felt.'); return; }
    const id = logManualRun({ date, durationS, distanceM: kmNum * 1000, feel, pain: pain.map((area) => ({ area, severity: /chest|dizz/i.test(area) ? 3 : 2 })), notes: notes || undefined, sessionId: session?.id });
    onClose();
    nav(`/activity/${id}`);
  };

  return (
    <Sheet open={open} onClose={onClose} title={session && session.type !== 'rest' ? `Log: ${session.title}` : 'Log a run'}
      footer={<button className="btn btn-primary btn-block" onClick={save}><Check size={18} strokeWidth={2} aria-hidden="true" />Save run</button>}>
      <DateField id="lr-date" label="Date" value={date} onChange={setDate} />
      <DurationField id="lr-time" label="How long were you out?" value={durationS} onChange={setDurationS} />
      <div className="field">
        <label htmlFor="lr-km">Rough distance (km)</label>
        <input id="lr-km" className="input" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
        <p className="caption">A guess is fine{session?.type === 'runwalk' ? '. We estimated it from your intervals.' : '.'}</p>
      </div>
      <Chips<SessionFeedback['feel'] | 0> label="How did it feel?" value={feel} onChange={setFeel} options={FEELS} />
      <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 6 }}>Any pain or niggles?</legend>
        <div className="row wrap">{PAIN_AREAS.map((a) => <button type="button" key={a} className="chip" aria-pressed={pain.includes(a)} onClick={() => setPain((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]))}>{a}</button>)}</div>
        {redFlag && <div role="alert"><StatusLine kind="danger">Please stop exercising and get medical advice before you run again. If it is severe or happening now, call your local emergency number.</StatusLine></div>}
        {!redFlag && pain.length > 0 && <StatusLine kind="warning">Ritmo will give you rest and easy days. See a physio or doctor if pain continues.</StatusLine>}
      </fieldset>
      <div className="field"><label htmlFor="lr-notes">Notes (optional)</label><textarea id="lr-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Weather, sleep, how your legs felt" /></div>
      {err && <div role="alert"><StatusLine kind="danger">{err}</StatusLine></div>}
      <p className="caption">Recorded it on a watch? <Link to="/profile/data" onClick={onClose} className="label">Upload the file instead</Link> for splits and heart rate.</p>
    </Sheet>
  );
}
