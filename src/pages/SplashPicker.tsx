import { useState } from 'react';
import { Check, Play } from 'lucide-react';
import { AppHeader } from '../components/app';
import { getSplashVariant, Splash, SPLASH_OPTIONS, type SplashVariant } from '../components/Splash';
import { StatusLine } from '../components/ui';

export default function SplashPicker() {
  const [chosen, setChosen] = useState<SplashVariant>(getSplashVariant);
  const [playing, setPlaying] = useState<SplashVariant | null>(null);
  const [replay, setReplay] = useState(0);
  const choose = (v: SplashVariant) => {
    setChosen(v);
    try { localStorage.setItem('ritmo:splash', v); } catch { /* ignore */ }
  };
  const play = (v: SplashVariant) => { setPlaying(v); setReplay((r) => r + 1); };

  return (
    <div className="stack-lg">
      <AppHeader title="Opening animation" eyebrow="Plays each time Ritmo opens" back />
      <div className="group">
        {SPLASH_OPTIONS.map((o) => (
          <div key={o.value} style={{ alignItems: 'flex-start' }}>
            <button type="button" className="row-icon" style={{ border: 0, cursor: 'pointer', background: chosen === o.value ? 'var(--brand)' : undefined, color: chosen === o.value ? 'var(--on-brand)' : undefined }}
              aria-label={`Use ${o.label}`} aria-pressed={chosen === o.value} onClick={() => choose(o.value)}>
              {chosen === o.value ? <Check size={18} strokeWidth={2.5} aria-hidden="true" /> : null}
            </button>
            <button type="button" className="stack-sm" style={{ flex: 1, gap: 2, background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', minHeight: 44 }} onClick={() => choose(o.value)}>
              <span className="label">{o.label}</span>
              <span className="caption">{o.description}</span>
            </button>
            <button type="button" className="btn btn-small" onClick={() => play(o.value)} aria-label={`Preview ${o.label}`}><Play size={16} strokeWidth={2} aria-hidden="true" />Preview</button>
          </div>
        ))}
      </div>
      <StatusLine kind="success">{SPLASH_OPTIONS.find((o) => o.value === chosen)?.label} will play next time you open Ritmo.</StatusLine>
      {playing && <Splash variant={playing} replayKey={replay} preview onDone={() => setPlaying(null)} />}
    </div>
  );
}
