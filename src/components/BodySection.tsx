// Body in "You": niggle history per area, pattern alerts, prehab routines (rated to progress), and a physio
// summary to download. General guidance only; Body data is never shown on the Hub or in share images.
import { useState } from 'react';
import { useApp } from '../app/AppContext';
import { areaLabel, DISCLAIMER, PREHAB, patternAlert, WHEN_LABEL } from '../training/body';
import { StatusLine } from './ui';

export function BodySection() {
  const { data, today, updateBody, plan } = useApp();
  const b = data.profile.body;
  const checkins = [...(b?.checkins ?? [])].sort((x, y) => y.at.localeCompare(x.at));
  const [routine, setRoutine] = useState<string>();
  const alert = patternAlert(checkins, today);
  const byArea = new Map<string, typeof checkins>();
  for (const c of checkins) byArea.set(areaLabel(c), [...(byArea.get(areaLabel(c)) ?? []), c]);

  const summary = () => {
    const sixWeeks = Array.from({ length: 6 }, (_, i) => {
      const end = new Date(today.getTime() - i * 7 * 86400000), start = new Date(end.getTime() - 7 * 86400000);
      const km = data.activities.filter((a) => { const t = new Date(a.startTime); return t > start && t <= end; }).reduce((x, a) => x + a.distanceM, 0) / 1000;
      return `  Week ending ${end.toDateString()}: ${km.toFixed(1)} km`;
    }).reverse();
    const shoes = (data.profile.shoes ?? []).filter((s) => !s.retired).map((s) => `  ${s.name}, since ${s.startDate}`);
    const lines = [
      'Ritmo physio summary', `Prepared ${new Date().toDateString()} for a physio or doctor. ${DISCLAIMER}`, '',
      'Pain log (newest first):', ...checkins.slice(0, 30).map((c) => `  ${new Date(c.at).toDateString()}: ${areaLabel(c)}, pain ${c.pain}/10, ${c.when.map((w) => WHEN_LABEL[w].toLowerCase()).join(', ')}, started ${c.onset}${c.trend ? `, ${c.trend} than the day before` : ''}${c.signs.length ? `, signs: ${c.signs.join(', ')}` : ''}`), '',
      'Training load, last 6 weeks:', ...sixWeeks, '',
      'Shoes in use:', ...(shoes.length ? shoes : ['  none recorded']), '',
      'What has been tried (plan changes):', ...((plan?.changes ?? []).filter((c) => c.reason === 'pain').map((c) => `  ${c.summary}`)), ...(b?.rtrStep ? [`  Return to run, step ${b.rtrStep} of 6`] : []),
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = `ritmo-physio-summary-${new Date().toISOString().slice(0, 10)}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="card stack" aria-labelledby="body-h">
      <h2 id="body-h" className="title">Body</h2>
      <p className="caption">{DISCLAIMER} Body check-ins are never shown on the Hub or in share images.</p>
      {alert && <StatusLine kind="warning">{alert}</StatusLine>}
      {!checkins.length ? <p className="muted">No niggles logged. Use "Something hurts" in the + menu if anything comes up.</p> : (
        <ul className="list">
          {[...byArea.entries()].map(([area, list]) => (
            <li key={area} className="stack-sm" style={{ padding: 'var(--s2) 0' }}>
              <span className="label">{area}</span>
              <span className="caption">{list.slice(0, 8).map((c) => `${new Date(c.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ${c.pain}/10`).join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="stack-sm">
        <span className="label">Exercises many runners use to stay strong</span>
        <div className="row wrap">{Object.entries(PREHAB).map(([k, r]) => <button key={k} className="chip" aria-pressed={routine === k} onClick={() => setRoutine(routine === k ? undefined : k)}>{r.title}</button>)}</div>
        {routine && (() => {
          const r = PREHAB[routine], lvl = b?.prehab?.[routine] ?? 0;
          return (
            <div className="card stack-sm" style={{ background: 'var(--surface-sunken)' }}>
              <ul className="bullets">{r.exercises.map((e) => <li key={e.name}>{e.name}: {e.dose[Math.min(lvl, e.dose.length - 1)]}</li>)}</ul>
              <p className="caption">About 10 minutes, on easy days. Only if it does not hurt. How was it?</p>
              <div className="row wrap" style={{ gap: 6 }}>
                <button className="btn btn-small" onClick={() => updateBody({ prehab: { ...b?.prehab, [routine]: Math.min(2, lvl + 1) } })}>Too easy</button>
                <button className="btn btn-small" onClick={() => updateBody({ prehab: { ...b?.prehab, [routine]: lvl } })}>Just right</button>
                <button className="btn btn-small" onClick={() => updateBody({ prehab: { ...b?.prehab, [routine]: Math.max(0, lvl - 1) } })}>Too hard</button>
              </div>
            </div>
          );
        })()}
      </div>
      {checkins.length > 0 && <button className="btn btn-small" style={{ alignSelf: 'flex-start' }} onClick={summary}>Download a physio summary</button>}
    </section>
  );
}
