// Activity (update 4, task 3): one place to record. Today's planned session first, whatever its type, with Start
// and Details; then a free run, your own strength workout, or log something already done.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Dumbbell, Play, Plus } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { QuickAdd } from '../components/QuickAdd';
import { resolveStrength } from '../training/strength';
import { sessionAmount, structureLine } from '../training/session-view';
import { resetVoice, unlockAudio } from '../run/cues';
import { ymd } from '../lib/format';

// A tap that leads to the run recorder unlocks speech, so the first voice cue is heard
const primeSpeech = () => { resetVoice(); unlockAudio(); };

export default function Record() {
  const { plan, today, data } = useApp();
  const [adding, setAdding] = useState(false);
  const t0 = ymd(today);
  const log = data.profile.log ?? [];
  const strengthDone = (id: string) => log.some((e) => e.kind === 'strength' && e.strength?.sessionId === id);
  // Today's session still to do: a run first, then strength
  const todays = (plan?.sessions ?? []).filter((s) => s.date === t0 && (s.strengthPlan ? !strengthDone(s.id) : s.type !== 'rest' && s.status !== 'done' && s.status !== 'swapped' && s.status !== 'skipped'));
  const s = todays.find((x) => !x.strengthPlan) ?? todays[0];
  const strength = s?.strengthPlan ? resolveStrength(s.strengthPlan, data.profile.strength) : undefined;
  const line = !s ? '' : strength ? `${strength.items.length} exercises · about ${strength.minutes} min` : [structureLine(s), sessionAmount(s, data.profile.units)].filter(Boolean).join(' · ');
  const Card = ({ to, onClick, icon, tone, title, sub, isNew }: { to?: string; onClick?: () => void; icon: React.ReactNode; tone: string; title: string; sub: string; isNew?: boolean }) => {
    const inner = <>
      <span className={`record-icon ${tone}`} aria-hidden="true">{icon}</span>
      <span className="stack-sm" style={{ gap: 0, flex: 1, minWidth: 0 }}><span className="label record-title">{title}{isNew && <span className="new-tag">New</span>}</span><span className="caption">{sub}</span></span>
      <ChevronRight size={20} aria-hidden="true" />
    </>;
    return to ? <Link to={to} className="card card-link record-card" onClick={to.startsWith('/run') ? primeSpeech : undefined}>{inner}</Link> : <button type="button" className="card card-link record-card" onClick={onClick}>{inner}</button>;
  };
  return (
    <div className="stack-lg record-page" style={{ maxWidth: 720 }}>
      <AppHeader title="Activity" right={<Link to="/you" className="btn btn-small btn-outline">History</Link>} />
      {s ? (
        <section className="record-today" aria-label="Today's planned session">
          <p className="record-eyebrow">Ritmo plan · today</p>
          <h2 className="record-today-title">{strength?.title ?? s.title}</h2>
          {line && <p className="record-today-sub">{line}</p>}
          <div className="row" style={{ gap: 8 }}>
            <Link to={s.strengthPlan ? `/strength/${s.id}` : '/run'} className="btn btn-primary record-start" onClick={s.strengthPlan ? undefined : primeSpeech}><Play size={18} strokeWidth={2.2} aria-hidden="true" />Start session</Link>
            <Link to={`/session/${s.id}`} className="btn record-details">Details</Link>
          </div>
        </section>
      ) : (
        <section className="card stack-sm" aria-label="Today's planned session">
          <p className="label">{plan ? 'Nothing planned for the rest of today' : 'No plan yet'}</p>
          <p className="caption">{plan ? 'Rest is part of training. You can still record anything below.' : 'You can record a run or a strength workout below.'}</p>
        </section>
      )}
      <section className="stack-sm" aria-labelledby="rec-else">
        <h2 id="rec-else" className="record-eyebrow dim">{s ? 'Record something else' : 'Record'}</h2>
        <Card to="/run?free=1" tone="brand" icon={<Play size={20} fill="currentColor" />} title="Free run" sub="Just run, or set a distance, time or pace." />
        <Card to="/strength" tone="accent" icon={<Dumbbell size={20} strokeWidth={2.2} />} title="Strength" sub="Pick your exercises or start a saved workout." isNew />
        <Card onClick={() => setAdding(true)} tone="plain" icon={<Plus size={20} strokeWidth={2.4} />} title="Log something done" sub="Add a run, strength or cross-training after the fact." />
      </section>
      <QuickAdd open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
