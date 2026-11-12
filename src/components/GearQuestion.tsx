// "Your Strava runs say you ran in Pegasus 41. Which of your shoes is that?" Asked once for each pair of shoes the
// runner logs on Strava; the answer applies to past and future runs with them (unless they picked another pair for
// a run). Strava's shoe names are shown only to the runner.
import { useMemo, useState } from 'react';
import { Footprints } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { ShoeFinder } from './ShoeFinder';

export function GearQuestion() {
  const { data, answerGear, updateProfile } = useApp();
  const [adding, setAdding] = useState(false);
  const map = data.profile.gearMap ?? {};
  const shoes = (data.profile.shoes ?? []).filter((s) => !s.retired);
  // The pair seen most recently that hasn't been answered yet, with how many runs it has
  const ask = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; runs: number; last: string }>();
    for (const a of data.activities) {
      if (!a.gear || map[a.gear.id] || a.deletedAt) continue;
      const g = seen.get(a.gear.id) ?? { id: a.gear.id, name: a.gear.name, runs: 0, last: '' };
      g.runs++; if (a.startTime > g.last) g.last = a.startTime; if (!g.name && a.gear.name) g.name = a.gear.name;
      seen.set(a.gear.id, g);
    }
    return [...seen.values()].sort((x, y) => y.last.localeCompare(x.last))[0];
  }, [data.activities, map]);
  if (data.mode !== 'real' || !ask) return null;
  const label = ask.name || 'one pair of shoes';
  return (
    <section className="card stack-sm gear-question" aria-labelledby="gear-q">
      <h2 id="gear-q" className="label row" style={{ gap: 8 }}><Footprints size={18} strokeWidth={2} aria-hidden="true" />Which shoes are these?</h2>
      <p className="caption">Your Strava runs say you ran in <strong>{label}</strong> ({ask.runs} run{ask.runs === 1 ? '' : 's'}). Tell Ritmo which of your shoes that is, and those runs, and new ones, count for it.</p>
      <div className="row wrap" style={{ gap: 6 }}>
        {shoes.map((s) => <button key={s.id} type="button" className="chip" onClick={() => answerGear(ask.id, s.id)}>{s.name}</button>)}
        <button type="button" className="chip" onClick={() => setAdding(true)}>Add as a new pair</button>
        <button type="button" className="chip" onClick={() => answerGear(ask.id, 'ignore')}>Don't track these</button>
      </div>
      <ShoeFinder open={adding} onClose={() => setAdding(false)} onSave={(s) => { updateProfile({ shoes: [...(data.profile.shoes ?? []), s], gearMap: { ...map, [ask.id]: s.id } }); }} />
    </section>
  );
}
