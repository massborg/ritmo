// Activity (update 4, task 3): one place to record. Today's planned session first, whatever its type, with Start
// and Details; then a free run, your own strength workout, or log something already done.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bike, ChevronRight, Dumbbell, Play, Plus, Star } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { QuickAdd } from '../components/QuickAdd';
import { exById, resolveStrength } from '../training/strength';
import { sortTemplates, templateLine } from '../training/strength-load';
import { startTemplate } from '../components/StrengthBits';
import { sessionAmount, structureLine } from '../training/session-view';
import { resetVoice, unlockAudio } from '../run/cues';
import { localise, parseYmd, ymd } from '../lib/format';

// A tap that leads to the run recorder unlocks speech, so the first voice cue is heard
const primeSpeech = () => { resetVoice(); unlockAudio(); };

export default function Record() {
  const { plan, today, data } = useApp();
  const [adding, setAdding] = useState(false);
  const t0 = ymd(today);
  const log = data.profile.log ?? [];
  const nav = useNavigate();
  // Saved workouts, favourites first, with the next day each is scheduled for
  const workouts = sortTemplates((data.profile.strength?.templates ?? []).filter((t) => t.exercises.some((x) => exById.has(x.exerciseId))));
  const sched = data.profile.strength?.scheduled ?? [];
  const shortDay = (d: string) => parseYmd(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const strengthDone = (id: string) => log.some((e) => e.kind === 'strength' && e.strength?.sessionId === id);
  // Today's session still to do: a run first, then strength. The plan puts strength on the run's own session
  // ("after the run"), so one session can be both: the run while it is open, then the strength workout.
  const todays = (plan?.sessions ?? []).filter((x) => x.date === t0);
  const runOpen = (x: (typeof todays)[number]) => x.type !== 'rest' && x.status !== 'done' && x.status !== 'swapped' && x.status !== 'skipped';
  const strengthOpen = (x: (typeof todays)[number]) => !!x.strengthPlan && !strengthDone(x.id);
  const runS = todays.find(runOpen);
  const s = runS ?? todays.find(strengthOpen);
  const strength = s && !runS && s.strengthPlan ? resolveStrength(s.strengthPlan, data.profile.strength) : undefined;
  const line = !s ? '' : strength ? `${strength.items.length} exercises · about ${strength.minutes} min` : (s.steps.length > 1 ? [structureLine(s), sessionAmount(s, data.profile.units)] : [sessionAmount(s, data.profile.units) || structureLine(s), s.focus]).filter(Boolean).join(' · ');
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
      <AppHeader title="Activity" right={<Link to="/history" className="btn btn-small btn-outline">History</Link>} />
      {s ? (
        <section className="record-today" aria-label="Today's planned session">
          <p className="record-eyebrow">Ritmo plan · today</p>
          <h2 className="record-today-title">{strength?.title ?? localise(s.title, data.profile.units)}</h2>
          {line && <p className="record-today-sub">{strength ? line : localise(line, data.profile.units)}</p>}
          <div className="row" style={{ gap: 8 }}>
            <Link to={strength ? `/strength/${s.id}` : s.hyrox && ['sim_half', 'sim_full', 'race'].includes(s.hyrox.kind) ? (s.hyrox.kind === 'race' ? '/hyrox?tab=race' : s.hyrox.kind === 'sim_half' ? '/hyrox?sim=half' : '/hyrox') : '/run'} className="btn btn-primary record-start" onClick={strength ? undefined : primeSpeech}><Play size={18} strokeWidth={2.2} aria-hidden="true" />Start session</Link>
            <Link to={`/session/${s.id}`} className="btn record-details">Details</Link>
          </div>
        </section>
      ) : (
        <section className="card stack-sm" aria-label="Today's planned session">
          <p className="label">{plan ? 'Nothing planned for the rest of today' : 'No plan yet'}</p>
          <p className="caption">{plan ? 'Rest is part of training. You can still record anything below.' : 'You can record a run or a strength workout below.'}</p>
        </section>
      )}
      {workouts.length > 0 && (
        <section className="stack-sm" aria-labelledby="rec-workouts">
          <div className="row-between"><h2 id="rec-workouts" className="record-eyebrow dim">Your workouts</h2><Link to="/strength" className="caption">All ({workouts.length})</Link></div>
          <ul className="workout-row">
            {workouts.slice(0, 6).map((t) => {
              const next = sched.filter((x) => x.templateId === t.id && x.date >= t0).sort((a, b) => a.date.localeCompare(b.date))[0];
              const last = log.filter((e) => e.kind === 'strength' && e.strength?.templateId === t.id).sort((a, b) => b.date.localeCompare(a.date))[0];
              return (
                <li key={t.id} className="card workout-card">
                  <span className="label workout-name">{t.name}{t.favourite && <Star size={14} fill="var(--accent)" color="var(--accent)" aria-label="Favourite" />}</span>
                  <span className="caption">{templateLine(t)}</span>
                  <span className="caption">{next ? `Scheduled ${next.date === t0 ? 'today' : shortDay(next.date)}` : last ? `Last done ${shortDay(last.date)}` : 'Never done'}</span>
                  <div className="row" style={{ gap: 6 }}>
                    <button type="button" className={`btn btn-small${t.favourite ? ' btn-primary' : ''}`} style={{ flex: 1 }} aria-label={`Start ${t.name}`} onClick={() => startTemplate(t, nav)}>Start</button>
                    <Link to={`/strength?menu=${t.id}`} className="btn btn-small" aria-label={`More for ${t.name}: schedule, edit, log as done`}>More</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <section className="stack-sm" aria-labelledby="rec-else">
        <h2 id="rec-else" className="record-eyebrow dim">{s ? 'Record something else' : 'Record'}</h2>
        <Card to="/run?free=1" tone="brand" icon={<Play size={20} fill="currentColor" />} title="Free run" sub="Just run, or set a distance, time or pace." />
        <Card to="/strength" tone="accent" icon={<Dumbbell size={20} strokeWidth={2.2} />} title="Strength" sub="Pick your exercises or start a saved workout." isNew />
        <Card to="/hyrox" tone="dark" icon={<span className="hx-mark">HX</span>} title="HYROX" sub="Full or half simulation, custom stations, or race day." isNew />
        <Card to="/other" tone="other" icon={<Bike size={20} strokeWidth={2.2} />} title="Other sport" sub="Bike, swim, elliptical, row, walk or a class: record it or log it." isNew />
        <Card onClick={() => setAdding(true)} tone="plain" icon={<Plus size={20} strokeWidth={2.4} />} title="Log something done" sub="Add a run, strength or cross-training after the fact." />
      </section>
      <QuickAdd open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
