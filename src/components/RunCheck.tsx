// "Before you start" (update 3, §2–3): shown when Start is tapped. The tap itself has already said "Ready when you
// are", so the sheet can show whether voice cues work, with GPS, the Pocket mode warning, Test voice and Start run.
import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, Smartphone, Volume2 } from 'lucide-react';
import { Sheet } from './inputs';
import { cue, onVoiceState, playClips, resetVoice, setVoiceSource, unlockAudio, voiceState, type VoiceSource, type VoiceState } from '../run/cues';
import { hasNativeVoice } from '../run/native-voice';
import { isIos } from '../lib/install';
import type { SpeakOptions } from '../run/voice';
import { hasBackgroundGps } from '../run/native-gps';

export function RunCheck({ open, onClose, onStart, gps, gpsReady, cuesOn, voice, pocket, setPocket, source = 'phone', setSource }: {
  open: boolean; onClose: () => void; onStart: () => void; gps: string; gpsReady: boolean; cuesOn: boolean; voice: SpeakOptions;
  pocket: boolean; setPocket: (on: boolean) => void; source?: VoiceSource; setSource?: (s: VoiceSource) => void;
}) {
  // iPhone browsers mute the phone's voice on silent but still say it is speaking: only the runner can tell
  const [heard, setHeard] = useState(false);
  useEffect(() => { if (open) setHeard(false); }, [open]);
  const askHeard = cuesOn && source === 'phone' && isIos() && !hasNativeVoice();
  const useRitmo = () => {
    setVoiceSource('ritmo'); setSource?.('ritmo'); unlockAudio();
    playClips(['ready']); // inside the tap, so it plays now, on silent too
  };
  const usePhone = () => { setVoiceSource('phone'); setSource?.('phone'); resetVoice(); unlockAudio(); void cue('Voice cues are working.', voice); };
  const [v, setV] = useState<VoiceState>(voiceState());
  const native = hasBackgroundGps();
  useEffect(() => onVoiceState(setV), []);
  useEffect(() => { if (open) setV(voiceState()); }, [open]);
  const line = (ok: boolean | undefined, text: string, cls: string) => (
    <li className={`run-check-line ${cls}`}>
      {ok === undefined ? <Loader2 size={20} strokeWidth={2} aria-hidden="true" className="spin" /> : ok ? <CheckCircle2 size={20} strokeWidth={2} aria-hidden="true" /> : <AlertTriangle size={20} strokeWidth={2} aria-hidden="true" />}
      <span>{text}</span>
    </li>
  );
  return (
    <Sheet open={open} onClose={onClose} title="Before you start"
      footer={<div className="stack-sm">
        <button className="btn btn-primary btn-block run-check-start" onClick={onStart}>Start run</button>
        {cuesOn && <button className="btn btn-block" onClick={() => { resetVoice(); unlockAudio(); void cue('Voice cues are working.', voice); }}><Volume2 size={18} strokeWidth={2} aria-hidden="true" />Test voice</button>}
      </div>}>
      <div className="stack">
        <ul className="run-check" aria-live="polite">
          {line(gpsReady ? true : gps.startsWith('Searching') ? undefined : false, gps, 'run-check-gps')}
          {cuesOn ? line(v === 'ok' ? true : v === 'blocked' ? false : undefined, v === 'ok' ? (source === 'ritmo' && !hasNativeVoice() ? "Voice cues: Ritmo's recorded voice" : 'Voice cues working') : v === 'blocked' ? 'Voice is blocked' : 'Checking voice cues…', 'run-check-voice')
            : line(true, 'Voice cues are off', 'run-check-voice')}
        </ul>
        {askHeard && v === 'ok' && !heard && (
          <div className="card stack-sm run-voice-heard" role="group" aria-label="Did you hear it?">
            <p className="label">Did you hear "Ready when you are"?</p>
            <p className="caption">With the silent switch on, an iPhone mutes the phone's voice in a browser, and Ritmo can't tell. Ritmo's recorded voice still plays on silent.</p>
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn btn-small" onClick={() => setHeard(true)}>Yes, I heard it</button>
              <button className="btn btn-small btn-primary" onClick={useRitmo}>No, use Ritmo's recorded voice</button>
            </div>
          </div>
        )}
        {cuesOn && source === 'ritmo' && !hasNativeVoice() && (
          <div className="card stack-sm run-voice-ritmo">
            <p className="caption">Cues use Ritmo's recorded voice, which plays with the silent switch on. It may pause music from another app while it speaks.</p>
            <button className="btn btn-small btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={usePhone}>Use the phone's voice instead</button>
          </div>
        )}
        {cuesOn && v === 'blocked' && (
          <div className="card stack-sm run-voice-blocked" role="alert">
            <p className="label">Your phone didn't speak. Check:</p>
            <ul className="bullets caption">
              <li>The silent switch on the side of an iPhone is off (or use Ritmo's recorded voice, below)</li>
              <li>The volume is up (press the volume buttons now)</li>
              <li>A voice is installed: Settings › Accessibility › Spoken Content › Voices</li>
            </ul>
            <p className="caption">Then tap Test voice to try again. Until it works, Ritmo plays its own recorded cues for distance and pace.</p>
            {setSource && <button className="btn btn-small" style={{ alignSelf: 'flex-start' }} onClick={useRitmo}>Always use Ritmo's recorded voice</button>}
          </div>
        )}
        <div className="card stack-sm run-pocket-warn">
          <p className="label row" style={{ gap: 8 }}><Smartphone size={18} strokeWidth={2} aria-hidden="true" />{native ? 'Locking your phone is fine' : "Don't lock your phone, use Pocket mode"}</p>
          <p className="caption">{native ? 'In the app, GPS and voice keep going with the phone locked. Pocket mode is there if you prefer it: a black screen that ignores touches. Swipe up to unlock it.' : 'A browser pauses GPS and voice when the screen locks. Pocket mode keeps Ritmo running with a black screen that ignores touches. Swipe up to unlock it.'}</p>
          <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={pocket} onChange={(e) => setPocket(e.target.checked)} /> Start in Pocket mode</label>
        </div>
      </div>
    </Sheet>
  );
}
