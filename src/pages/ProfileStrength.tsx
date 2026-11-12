// Profile › Strength (update 3, §4–6, §8): the equipment you have, "Never give me…" (exercises or whole categories),
// the swaps you chose with "Always use this instead", the rest between sets, and posting strength to the Hub.
import { X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { Chips } from '../components/inputs';
import { EQUIPMENT_LABEL, EXERCISES, exById, NEVER_CATEGORIES, type Equipment } from '../training/strength';

export default function ProfileStrength() {
  const { data, setStrengthPrefs, updateProfile, hasFlag } = useApp();
  const p = data.profile.strength ?? {};
  const never = p.never ?? [];
  const toggle = (v: string) => setStrengthPrefs({ never: never.includes(v) ? never.filter((x) => x !== v) : [...never, v] });
  const swaps = Object.entries(p.swaps ?? {}).filter(([a, b]) => exById.has(a) && exById.has(b));
  const hub = data.profile.hub ?? {};
  return (
    <div className="stack-lg" style={{ maxWidth: 720 }}>
      <AppHeader title="Strength" eyebrow="What Ritmo gives you in strength sessions" back />
      <Link to="/strength-plan" className="card card-link row-between"><span className="label">Your strength plan</span><span className="caption">Blocks, progress and what's next</span></Link>
      <section className="card stack">
        <Chips<Equipment> label="Equipment you have" value={p.equipment ?? 'none'} onChange={(v) => setStrengthPrefs({ equipment: v })}
          options={(['none', 'light', 'gym'] as Equipment[]).map((e) => ({ value: e, label: EQUIPMENT_LABEL[e] }))} />
        <p className="caption">Sessions use the best exercises for what you have. You can change any exercise on the session itself.</p>
        <Chips<number> label="Rest between sets" value={p.rest ?? 60} onChange={(v) => setStrengthPrefs({ rest: v })} options={[30, 45, 60, 90, 120].map((s) => ({ value: s, label: `${s} s` }))} />
      </section>

      <section className="card stack" aria-labelledby="never">
        <h2 id="never" className="title">Never give me…</h2>
        <div className="row wrap" style={{ gap: 6 }}>{NEVER_CATEGORIES.map((c) => <button key={c.value} type="button" className="chip" aria-pressed={never.includes(c.value)} onClick={() => toggle(c.value)}>{c.label}</button>)}</div>
        <details>
          <summary className="label">Single exercises ({never.filter((x) => !x.startsWith('tag:')).length})</summary>
          <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>{EXERCISES.map((e) => <button key={e.id} type="button" className="chip" aria-pressed={never.includes(e.id)} onClick={() => toggle(e.id)}>{e.name}</button>)}</div>
        </details>
        <p className="caption">Ritmo leaves these out of every session and every list of alternatives.</p>
      </section>

      <section className="card stack" aria-labelledby="swaps">
        <h2 id="swaps" className="title">Always used instead</h2>
        {swaps.length ? (
          <ul className="list">{swaps.map(([a, b]) => (
            <li key={a} className="list-item row-between">
              <span>{exById.get(b)!.name} <span className="caption">instead of {exById.get(a)!.name}</span></span>
              <button className="icon-btn" aria-label={`Stop using ${exById.get(b)!.name} instead of ${exById.get(a)!.name}`} onClick={() => { const next = { ...(p.swaps ?? {}) }; delete next[a]; setStrengthPrefs({ swaps: next }); }}><X size={18} /></button>
            </li>
          ))}</ul>
        ) : <p className="muted">None yet. When you swap an exercise, tick "Always use this instead" to keep it in future sessions.</p>}
      </section>

      {hasFlag('hub') && (
        <section className="card stack">
          <label className="row" style={{ gap: 8, minHeight: 44 }}>
            <input type="checkbox" checked={hub.autoPostStrength !== false} onChange={(e) => updateProfile({ hub: { ...hub, autoPostStrength: e.target.checked } })} /> Auto-post strength sessions to the Hub
          </label>
          <p className="caption">Posted like your runs, to {({ everyone: 'everyone', followers: 'your followers', only_me: 'only you' } as const)[hub.audience ?? 'followers']}, when automatic posting is on. You can hide each post or change who sees it.</p>
        </section>
      )}
    </div>
  );
}
