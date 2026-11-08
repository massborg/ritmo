// "Voice for run cues" in Profile: the same choice as Run > Settings (saved on this device), easy to find before a
// run, since Quick run starts straight away without showing the Run settings.
import { useState } from 'react';
import { Volume2 } from 'lucide-react';
import { VoicePicker } from './VoicePicker';

const KEY = 'ritmo:run:settings';
const read = (): { voiceURI?: string; rate?: number } => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } };

export function RunVoiceCard() {
  const [s, setS] = useState(read);
  const change = (v: { voiceURI?: string; rate?: number }) => {
    const next = { ...read(), ...v };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: lasts for this visit */ }
    setS(next);
  };
  if (!('speechSynthesis' in window)) return null;
  return (
    <section className="card stack" aria-labelledby="run-voice">
      <div className="row" style={{ gap: 8 }}><Volume2 size={20} strokeWidth={2} aria-hidden="true" /><h2 id="run-voice" className="title">Voice for run cues</h2></div>
      <p className="muted">The voice that counts you in and calls out kilometres, laps and steps while you run.</p>
      <VoicePicker voiceURI={s.voiceURI} rate={s.rate ?? 1} onChange={change} />
    </section>
  );
}
