// The "+" menu: log a run, add a race, cross-training or a note, or tell Ritmo you are not feeling 100%.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bandage, Bike, Flag, Footprints, HeartPulse, StickyNote } from 'lucide-react';
import { BodyCheckinSheet } from './BodyCheckin';
import { useApp } from '../app/AppContext';
import { Chips, DateField, Sheet, Stepper } from './inputs';
import { StatusLine } from './ui';
import { LogRunSheet } from './LogRun';
import { longDate, parseYmd, ymd } from '../lib/format';

type View = 'menu' | 'run' | 'cross' | 'note' | 'unwell' | 'hurts';

export function QuickAdd({ open, onClose, start = 'menu' }: { open: boolean; onClose: () => void; start?: View }) {
  const [view, setView] = useState<View>(start);
  const { hasFlag } = useApp();
  const nav = useNavigate();
  const close = () => { setView(start); onClose(); };
  if (!open) return null;
  if (view === 'run') return <LogRunSheet open onClose={close} />;
  if (view === 'cross' || view === 'note') return <LogOther kind={view} onClose={close} />;
  if (view === 'unwell') return <NotFeeling onClose={close} />;
  if (view === 'hurts') return <BodyCheckinSheet onClose={close} />;
  const Item = ({ icon, label, sub, onClick }: { icon: React.ReactNode; label: string; sub: string; onClick: () => void }) => (
    <button className="choice" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} onClick={onClick}>
      <span className="row-icon">{icon}</span><span className="stack-sm" style={{ gap: 0 }}><span className="label">{label}</span><span className="caption">{sub}</span></span>
    </button>
  );
  return (
    <Sheet open onClose={close} title="Add">
      <div className="stack-sm">
        <Item icon={<Footprints size={20} strokeWidth={2} aria-hidden="true" />} label="Log a run" sub="Time, distance and how it felt" onClick={() => setView('run')} />
        <Item icon={<Bike size={20} strokeWidth={2} aria-hidden="true" />} label="Cross-training" sub="Bike, swim, gym, elliptical" onClick={() => setView('cross')} />
        <Item icon={<StickyNote size={20} strokeWidth={2} aria-hidden="true" />} label="Note" sub="Anything worth remembering" onClick={() => setView('note')} />
        <Item icon={<HeartPulse size={20} strokeWidth={2} aria-hidden="true" />} label="Not feeling 100%" sub="Ill, tired, sore or travelling" onClick={() => setView('unwell')} />
        {hasFlag('body') && <Item icon={<Bandage size={20} strokeWidth={2} aria-hidden="true" />} label="Something hurts" sub="A niggle, pain or injury" onClick={() => setView('hurts')} />}
        <Item icon={<Flag size={20} strokeWidth={2} aria-hidden="true" />} label="Add a race" sub="Your goal race, a tune-up or a fun run" onClick={() => { close(); nav('/race/new'); }} />
      </div>
    </Sheet>
  );
}

function LogOther({ kind, onClose }: { kind: 'cross' | 'note'; onClose: () => void }) {
  const { addLog } = useApp();
  const [date, setDate] = useState(ymd(new Date()));
  const [sport, setSport] = useState('Bike');
  const [minutes, setMinutes] = useState<number | undefined>(45);
  const [rpe, setRpe] = useState<number>(4);
  const [text, setText] = useState('');
  const ok = kind === 'note' ? text.trim().length > 0 : !!minutes;
  return (
    <Sheet open onClose={onClose} title={kind === 'cross' ? 'Cross-training' : 'Note'}
      footer={<button className="btn btn-primary btn-block" disabled={!ok} onClick={() => { addLog({ date, kind, ...(kind === 'cross' ? { sport, minutes, rpe } : {}), text: text.trim() || undefined }); onClose(); }}>Save</button>}>
      <div className="stack">
        <DateField id="lo-date" label="Date" value={date} onChange={setDate} />
        {kind === 'cross' && <>
          <Chips label="What" value={sport} onChange={setSport} options={['Bike', 'Swim', 'Gym', 'Elliptical', 'Walk', 'Other'].map((x) => ({ value: x, label: x }))} />
          <Stepper id="lo-min" label="Minutes" value={minutes} onChange={setMinutes} min={5} max={600} step={5} unit="min" />
          <Chips label="How hard (1 easy, 10 all out)" value={rpe} onChange={setRpe} options={[2, 4, 6, 8, 10].map((x) => ({ value: x, label: String(x) }))} />
          <p className="caption">Cross-training counts toward your fitness and fatigue, scaled by how hard it was and how much it carries over to running. It does not count as running distance.</p>
        </>}
        <div className="field"><label htmlFor="lo-text">{kind === 'note' ? 'Note' : 'Note (optional)'}</label><textarea id="lo-text" className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)} /></div>
      </div>
    </Sheet>
  );
}

/** Ill, tired, sore or travelling: change the next few days, then come back gradually. */
export function NotFeeling({ onClose }: { onClose: () => void }) {
  const { data, reportIllness, clearIllness, setAdjust } = useApp();
  const [kind, setKind] = useState<'ill' | 'easier' | 'nopace' | 'travel'>('easier');
  const [days, setDays] = useState(3);
  const adj = data.profile.adjust;
  const ill = data.profile.illnessUntil && data.profile.illnessUntil >= ymd(new Date());
  const apply = () => {
    if (kind === 'ill') reportIllness(days); else setAdjust(kind, days);
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Not feeling 100%?"
      footer={<button className="btn btn-primary btn-block" onClick={apply}>Change my plan</button>}>
      <div className="stack">
        {(adj && adj.until >= ymd(new Date())) || ill ? (
          <div className="card stack-sm">
            <StatusLine kind="info">{ill ? `Resting until ${longDate(parseYmd(data.profile.illnessUntil!))}` : `${adj!.kind === 'easier' ? 'Easier sessions' : adj!.kind === 'travel' ? 'Travel mode' : 'No pace targets'} until ${longDate(parseYmd(adj!.until))}`}</StatusLine>
            <button className="btn btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => { if (ill) clearIllness(); setAdjust(null); onClose(); }}>I feel back to normal</button>
          </div>
        ) : null}
        <Chips label="What is going on?" value={kind} onChange={setKind} options={[
          { value: 'easier', label: 'Tired or sore', sub: 'easier sessions' },
          { value: 'nopace', label: 'Run by feel', sub: 'no pace targets' },
          { value: 'ill', label: 'Ill', sub: 'rest' },
          { value: 'travel', label: 'Travelling', sub: 'short easy runs' },
        ]} />
        <Chips label="For how long?" value={days} onChange={setDays} options={(kind === 'ill' ? [2, 3, 5, 7] : [3, 5, 7, 14]).map((x) => ({ value: x, label: `${x} days` }))} />
        <p className="caption">{kind === 'ill' ? 'Sessions become rest, then four easy days ease you back. If you have a fever or chest symptoms, wait until you have been symptom-free for at least a day.'
          : kind === 'easier' ? 'Hard sessions become easy runs and long runs are shorter. The first hard session afterwards is a little shorter too.'
          : kind === 'nopace' ? 'Sessions keep their shape, but you run them by feel. Good after illness, in heat, or when life is stressful.'
          : 'Sessions become easy runs of up to 45 minutes that you can fit in anywhere, or skip if the day is too full.'}</p>
      </div>
    </Sheet>
  );
}
