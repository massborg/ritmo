// Choose the voice for spoken cues: the best voices on this device, each with a play button to hear it first,
// plus the speaking speed. Voices differ per device, so the choice is remembered on this device.
import { useEffect, useState } from 'react';
import { Check, Play } from 'lucide-react';
import { Chips } from './inputs';
import { isIos } from '../lib/install';
import { loadVoices, rankVoices, SAMPLE, speak, voiceLabel, type VoiceChoice } from '../run/voice';
import { hasNativeVoice, nativeVoices, speakNative, stopNative } from '../run/native-voice';
import { playClips, unlockAudio, voiceLog, type VoiceSource } from '../run/cues';

export function VoicePicker({ voiceURI, rate, source = 'phone', onChange }: { voiceURI?: string; rate: number; source?: VoiceSource; onChange: (v: { voiceURI?: string; rate?: number; voiceSource?: VoiceSource }) => void }) {
  const [voices, setVoices] = useState<VoiceChoice[]>();
  const [playing, setPlaying] = useState<string>();
  // In the store app the phone's own speech engine speaks the cues, so its voices are the ones to offer
  const native = hasNativeVoice();
  useEffect(() => { let live = true; (native ? nativeVoices() : loadVoices()).then((v) => { if (live) setVoices(rankVoices(v, navigator.language || 'en-GB')); }); return () => { live = false; }; }, [native]);
  const [log] = useState(voiceLog);
  if (!native && !('speechSynthesis' in window)) return null;
  const play = (uri: string | undefined) => {
    if (native) stopNative(); else window.speechSynthesis.cancel();
    setPlaying(uri ?? 'auto');
    (native ? speakNative : speak)(SAMPLE, { voiceURI: uri, rate });
    window.setTimeout(() => setPlaying(undefined), 3500);
  };
  const current = voiceURI && voices?.some((v) => v.uri === voiceURI) ? voiceURI : undefined;
  const Row = ({ uri, title, sub }: { uri?: string; title: string; sub: string }) => {
    const on = current === uri;
    return (
      <li className={`voice-row${on ? ' on' : ''}`}>
        <button type="button" className="voice-pick" aria-pressed={on} onClick={() => { onChange({ voiceURI: uri }); play(uri); }}>
          <span className="voice-check" aria-hidden="true">{on && <Check size={16} strokeWidth={3} />}</span>
          <span className="stack-sm" style={{ gap: 0 }}><span className="voice-name">{title}</span><span className="caption">{sub}</span></span>
        </button>
        <button type="button" className="icon-btn voice-play" aria-label={`Play ${title}`} onClick={() => play(uri)}>
          <Play size={20} strokeWidth={2.2} aria-hidden="true" className={playing === (uri ?? 'auto') ? 'pulse' : undefined} />
        </button>
      </li>
    );
  };
  return (
    <div className="stack-sm">
      {!native && (
        <>
          <Chips<VoiceSource> label="Cues spoken by" value={source} onChange={(v) => { onChange({ voiceSource: v }); if (v === 'ritmo') { unlockAudio(); playClips(['voice-check']); } }}
            options={[{ value: 'phone', label: "The phone's voice" }, { value: 'ritmo', label: "Ritmo's recorded voice" }]} />
          <p className="caption">{isIos() ? "On iPhone, the silent switch mutes the phone's voice in a browser. Ritmo's recorded voice still plays on silent, but may pause music from another app. The Ritmo app speaks on silent with either." : "Ritmo's recorded voice plays even where the phone's voice is muted or missing."}</p>
        </>
      )}
      {source === 'ritmo' && !native ? null : <>
      <span className="label">Voice</span>
      {voices === undefined ? <p className="caption">Looking for voices on this device…</p> : (
        <ul className="voice-list" aria-label="Voices">
          <Row title="Automatic" sub={voices[0] ? `The best voice on this device: ${voices[0].name}` : 'Your device\'s default voice'} />
          {voices.map((v) => <Row key={v.uri} uri={v.uri} title={v.name} sub={voiceLabel(v)} />)}
        </ul>
      )}
      <p className="caption">Tap a voice to choose it and hear it, or tap ▶ just to listen.</p>
      <Chips label="Speaking speed" value={rate} onChange={(r) => { onChange({ rate: r }); }}
        options={[{ value: 0.9, label: 'Slower' }, { value: 1, label: 'Normal' }, { value: 1.1, label: 'Faster' }]} />
      <p className="caption">
        {isIos()
          ? 'For more natural voices on iPhone: Settings → Accessibility → Spoken Content → Voices → English, then download an "Enhanced" or "Premium" voice. It will appear here.'
          : 'For more voices: install them in your phone\'s text-to-speech settings (on Android, Settings → Accessibility → Text-to-speech). They will appear here.'}
      </p>
      </>}
      {log.length > 0 && (
        <details className="voice-log">
          <summary className="caption">Voice problems on this device ({log.length})</summary>
          <ul className="caption">{log.slice(-5).reverse().map((e) => <li key={e.at}>{new Date(e.at).toLocaleString()}: {e.why}</li>)}</ul>
          <p className="caption">If cues go quiet, tap Test voice before you start. This list helps support see what happened.</p>
        </details>
      )}
    </div>
  );
}
