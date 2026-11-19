// Pieces shared by History, the day on Training and the You page (update 5, U1): one row for any activity, the
// "saved · Undo" message, and the form for a session of another sport.
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Chips, Stepper } from './inputs';
import type { FeedItem } from '../training/feed';
import { sportMark } from '../training/feed';

export const SPORTS = ['Bike', 'Indoor bike', 'Swim', 'Elliptical', 'Row', 'Walk / hike', 'Class', 'Other'];
/** Sports where distance comes from GPS when recorded outside */
export const GPS_SPORTS = ['Bike', 'Walk / hike'];

/** "Bike saved · 45 min · Undo", for a few seconds after saving, on every screen */
export function LogSavedToast() {
  const { logSaved, undoLog, dismissLogSaved } = useApp();
  if (!logSaved) return null;
  return (
    <div className="toast toast-action" role="status" aria-live="polite">
      <Link to={`/log/${logSaved.id}`} onClick={dismissLogSaved} style={{ color: 'inherit' }}>{logSaved.text}</Link>
      <button className="toast-btn" onClick={undoLog}>Undo</button>
    </div>
  );
}

export function FeedMark({ item }: { item: FeedItem }) {
  const text = item.type === 'run' ? 'R' : item.type === 'strength' ? 'S' : item.type === 'hyrox' ? 'HX' : item.type === 'note' ? 'N' : sportMark(item.title);
  return <span className={`feed-mark feed-${item.type}`} aria-hidden="true">{text}</span>;
}

/** One activity of any kind: icon, name, what it amounted to, and a tag for its type */
export function FeedRow({ item, when }: { item: FeedItem; when?: string }) {
  return (
    <li>
      <Link to={item.link} className="list-item feed-row">
        <FeedMark item={item} />
        <span className="stack-sm" style={{ gap: 0, flex: 1, minWidth: 0 }}>
          <span className="label feed-title">{item.title}</span>
          <span className="caption">{[when, item.line].filter(Boolean).join(' · ')}</span>
        </span>
        <span className={`feed-tag feed-${item.type}`}>{item.type === 'cross' ? 'Cross' : item.tag}</span>
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
    </li>
  );
}

/** Sport, minutes and effort for a session of another sport */
export function CrossFields({ sport, setSport, minutes, setMinutes, rpe, setRpe, idPrefix = 'cx', showSport = true }: { sport: string; setSport: (s: string) => void; minutes?: number; setMinutes: (m: number | undefined) => void; rpe: number; setRpe: (r: number) => void; idPrefix?: string; showSport?: boolean }) {
  // An entry saved under an older name ("Gym", "Walk") keeps it as a choice
  const options = SPORTS.includes(sport) ? SPORTS : [sport, ...SPORTS];
  return (
    <>
      {showSport && <Chips label="What" value={sport} onChange={setSport} options={options.map((x) => ({ value: x, label: x }))} />}
      <Stepper id={`${idPrefix}-min`} label="Minutes" value={minutes} onChange={setMinutes} min={1} max={900} step={5} unit="min" />
      <Chips label="How hard (1 easy, 10 all out)" value={rpe} onChange={setRpe} options={[2, 4, 6, 8, 10].map((x) => ({ value: x, label: String(x) }))} />
    </>
  );
}
