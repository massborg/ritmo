// "Map laps to HYROX segments" (update 4, task 7): a run from a watch with 16 or more laps may be a HYROX session
// (a lap pressed at every change). This turns the laps into run 1, station 1, run 2 … and saves it as a session.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { Chips, Sheet } from './inputs';
import type { Activity } from '../lib/types';
import { DIVISIONS, divisionLabel, type Division } from '../hyrox/hyroxDivisions';
import { clock, segmentName, type HyroxSession } from '../hyrox/hyrox';
import { HYROX_LAPS, hyroxSessions, lapsToSegments, looksLikeHyrox } from '../hyrox/predict';

export function HyroxLaps({ activity }: { activity: Activity }) {
  const { data, saveHyrox } = useApp();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [division, setDivision] = useState<Division>(data.profile.hyrox?.division ?? 'men_open');
  const [isRace, setIsRace] = useState(!!activity.isRace);
  if (!looksLikeHyrox(activity.laps)) return null;
  const id = `laps-${activity.id}`;
  const already = hyroxSessions(data.profile).find((h) => h.id === id);
  const segs = lapsToSegments(activity.laps!, division);
  const total = segs ? segs.reduce((a, s) => a + s.ms, 0) : 0;
  const save = () => {
    if (!segs) return;
    const h: HyroxSession = { id, startedAt: activity.startTime, mode: isRace ? 'race' : 'full', division, title: `${isRace ? 'HYROX race' : 'HYROX full simulation'} · ${divisionLabel(division)}`, segments: segs, totalMs: total, isRace };
    saveHyrox(h);
    nav(`/hyrox/session/${id}`);
  };
  return (
    <section className="card stack-sm" aria-labelledby="hx-laps">
      <h2 id="hx-laps" className="title">Was this a HYROX session?</h2>
      <p className="caption">This run has {activity.laps!.length} laps. If you pressed lap at every change, Ritmo can read them as the 8 runs and 8 stations.</p>
      <div className="row wrap" style={{ gap: 8 }}>
        {already ? <button type="button" className="btn" onClick={() => nav(`/hyrox/session/${id}`)}>See the HYROX summary</button> : <button type="button" className="btn" onClick={() => setOpen(true)}>Map laps to HYROX segments</button>}
      </div>
      {open && (
        <Sheet open onClose={() => setOpen(false)} title="Map laps to HYROX segments"
          footer={<button type="button" className="btn btn-primary btn-block" disabled={!segs} onClick={save}>Save as a HYROX session</button>}>
          <div className="stack">
            <Chips<Division> label="Division" value={division} onChange={setDivision} options={DIVISIONS.slice(0, 4).map((d) => ({ value: d.value, label: d.label }))} />
            <Chips<number> label="What was it?" value={isRace ? 1 : 0} onChange={(v) => setIsRace(v === 1)} options={[{ value: 0, label: 'A simulation' }, { value: 1, label: 'A race' }]} />
            {segs ? (
              <>
                <p className="caption">{activity.laps!.length > HYROX_LAPS ? `There are more than ${HYROX_LAPS} laps, so Ritmo took the 8 laps closest to 1 km as the runs and the lap after each as its station.` : 'Laps in order: run 1, station 1, run 2, and so on.'} Check that it looks right. Total {clock(total)}.</p>
                <ul className="list lap-map">{segs.map((s) => <li key={s.i} className="list-item row-between"><span>{s.kind === 'run' ? segmentName(s) : `${s.n} ${segmentName(s)}`}</span><span className="stat">{clock(s.ms)}</span></li>)}</ul>
                <p className="caption">Transitions are inside the laps, so Roxzone is not shown separately. The run itself stays in your runs as it is.</p>
              </>
            ) : <p className="muted">These laps do not fit the pattern of 8 runs of about 1 km, each followed by a station. Enter the splits by hand in Activity, HYROX, Race day.</p>}
          </div>
        </Sheet>
      )}
    </section>
  );
}
