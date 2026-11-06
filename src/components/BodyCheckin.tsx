// "Something hurts": a Body check-in (review #2 §10.2). Red flags come first and are rules, not AI; with a red
// flag there are no exercise tips, only "stop running and get checked". Otherwise: what Ritmo changes in the plan,
// general tips, and when to see a physio. General guidance only, never a diagnosis.
import { useState } from 'react';
import { useApp } from '../app/AppContext';
import { Chips, Sheet } from './inputs';
import { StatusLine } from './ui';
import { BODY_AREAS, type BodyArea, DISCLAIMER, PREHAB, prehabFor, type PainWhen, type Sign, SIGN_LABEL, WHEN_LABEL } from '../training/body';

export function BodyCheckinSheet({ onClose, start }: { onClose: () => void; start?: { area: BodyArea; side?: 'left' | 'right' } }) {
  const { addBodyCheckin, data, updateBody, plan } = useApp();
  const [area, setArea] = useState<BodyArea | ''>(start?.area ?? '');
  const [side, setSide] = useState<'left' | 'right' | ''>(start?.side ?? '');
  const [pain, setPain] = useState(3);
  const [when, setWhen] = useState<PainWhen[]>([]);
  const [onset, setOnset] = useState<'gradual' | 'sudden' | ''>('');
  const [trend, setTrend] = useState<'better' | 'same' | 'worse' | ''>(start ? '' : 'same');
  const [signs, setSigns] = useState<Sign[]>([]);
  const [result, setResult] = useState<string[]>();
  const first = !data.profile.body?.disclaimerSeenAt;
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const ok = area && onset && when.length > 0;

  if (result) {
    const tips = area ? PREHAB[prehabFor(area as BodyArea) ?? ''] : undefined;
    const changes = [...new Set((plan?.changes ?? []).filter((c) => c.id.startsWith('body-')).map((c) => c.summary))];
    return (
      <Sheet open onClose={onClose} title={result.length ? 'Stop running and get checked' : 'Thanks for checking in'}
        footer={<button className="btn btn-primary btn-block" onClick={onClose}>Done</button>}>
        {result.length ? (
          <div className="stack" role="alert">
            <StatusLine kind="danger">Please stop running and see a doctor or physio before you run again.</StatusLine>
            <p>This is because you told Ritmo:</p>
            <ul className="bullets">{result.map((r) => <li key={r}>{r}</li>)}</ul>
            {result.some((r) => /chest|dizz|faint/i.test(r)) && <p><strong>If you have chest pain, dizziness or fainting now, call your local emergency number.</strong></p>}
            <p>Your plan is paused: no running until you confirm you have been checked. You can do that from the Training page.</p>
          </div>
        ) : (
          <div className="stack">
            <section className="stack-sm"><h3 className="label">What Ritmo changes in your plan</h3>
              {changes.length ? <ul className="bullets">{changes.map((c) => <li key={c}>{c}</li>)}</ul> : <p>No change needed today. Check in again tomorrow, or sooner if it gets worse.</p>}
            </section>
            {tips && <section className="stack-sm"><h3 className="label">Exercises many runners use to keep the {tips.title.toLowerCase()} strong</h3>
              <ul className="bullets">{tips.exercises.slice(0, 4).map((e) => <li key={e.name}>{e.name}: {e.dose[0]}</li>)}</ul>
              <p className="caption">Only if they do not hurt. Stop any exercise that makes the pain worse.</p>
            </section>}
            <section className="stack-sm"><h3 className="label">When to see a physio</h3>
              <p>If it is not clearly better within a week, if it changes how you run, or if it keeps coming back. Straight away if you notice swelling, numbness, pain at night or one bony spot that hurts to press.</p>
            </section>
          </div>
        )}
        <p className="caption">{DISCLAIMER}</p>
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} title="Something hurts?"
      footer={<button className="btn btn-primary btn-block" disabled={!ok} onClick={() => {
        if (first) updateBody({ disclaimerSeenAt: new Date().toISOString() });
        setResult(addBodyCheckin({ area: area as BodyArea, side: side || undefined, pain, when, onset: onset as 'gradual' | 'sudden', trend: trend || undefined, signs }));
      }}>See what to do</button>}>
      {first && <StatusLine kind="info">{DISCLAIMER}</StatusLine>}
      <Chips<BodyArea | ''> label="Where?" value={area} onChange={setArea} options={BODY_AREAS.map((a) => ({ value: a, label: a }))} />
      {area && !['Lower back', 'Other'].includes(area) && <Chips<'left' | 'right' | ''> label="Which side?" value={side} onChange={setSide} options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} />}
      <div className="field">
        <label htmlFor="pain">How much does it hurt, 0 to 10: <span className="stat">{pain}</span></label>
        <input id="pain" type="range" min={0} max={10} value={pain} onChange={(e) => setPain(Number(e.target.value))} style={{ minHeight: 44, accentColor: 'var(--brand)' }} />
        <p className="caption">0 no pain · 3 noticeable · 5 distracting · 7 hard to ignore · 10 worst possible</p>
      </div>
      <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 6 }}>When does it hurt?</legend>
        <div className="row wrap">{(Object.keys(WHEN_LABEL) as PainWhen[]).map((w) => <button key={w} type="button" className="chip" aria-pressed={when.includes(w)} onClick={() => setWhen((x) => toggle(x, w))}>{WHEN_LABEL[w]}</button>)}</div>
      </fieldset>
      <Chips<'gradual' | 'sudden' | ''> label="How did it start?" value={onset} onChange={setOnset} options={[{ value: 'gradual', label: 'Gradually' }, { value: 'sudden', label: 'Suddenly (a pop, a fall)' }]} />
      <Chips<'better' | 'same' | 'worse' | ''> label="Compared with yesterday" value={trend} onChange={setTrend} options={[{ value: 'better', label: 'Better' }, { value: 'same', label: 'The same' }, { value: 'worse', label: 'Worse' }]} />
      <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 6 }}>Anything else? (optional)</legend>
        <div className="row wrap">{(Object.keys(SIGN_LABEL) as Sign[]).map((g) => <button key={g} type="button" className="chip" aria-pressed={signs.includes(g)} onClick={() => setSigns((x) => toggle(x, g))}>{SIGN_LABEL[g]}</button>)}</div>
      </fieldset>
    </Sheet>
  );
}
