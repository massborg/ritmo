// Spoken cues in the store app. The phone's own speech engine (AVSpeechSynthesizer on iPhone, Android's
// text-to-speech) speaks them, through the native plugin:
// - Android's in-app browser has no Web Speech at all, so without this the app could only play recorded clips
// - on iPhone the "playback" audio category keeps speaking with the screen locked and with the silent switch on,
//   and lowers music while a cue plays
// - no tap is needed first, so a cue can never be blocked the way a browser blocks it
import { Capacitor } from '@capacitor/core';
import { pickVoice, type SpeakOptions, type VoiceLike } from './voice';

type Tts = typeof import('@capacitor-community/text-to-speech').TextToSpeech;
let plugin: Promise<Tts | undefined> | undefined;
let voices: VoiceLike[] | undefined;

export const hasNativeVoice = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('TextToSpeech');

function tts(): Promise<Tts | undefined> {
  if (!plugin) {
    plugin = import('@capacitor-community/text-to-speech')
      .then(async (m) => {
        try { voices = (await m.TextToSpeech.getSupportedVoices()).voices as VoiceLike[]; } catch { voices = []; }
        return m.TextToSpeech;
      })
      .catch(() => undefined);
  }
  return plugin;
}

/** Load the plugin and the voice list before the first cue (the Run screen calls this when it opens) */
export function primeNativeVoice(): void { if (hasNativeVoice()) void tts(); }

/** The device's voices as the native engine lists them (for Settings: Voice in the app) */
export async function nativeVoices(): Promise<VoiceLike[]> { await tts(); return voices ?? []; }

/**
 * Speak a cue with the phone's speech engine. Cues queue behind each other rather than cutting each other off.
 * onStart is called once the engine has taken the cue (it reports errors straight away), onEnd when it was spoken.
 */
export function speakNative(text: string, o: SpeakOptions = {}): void {
  void tts().then((t) => {
    if (!t) { o.onError?.('native speech unavailable'); return; }
    const list = voices ?? [];
    const v = o.defaultVoice ? undefined : pickVoice(list, o.voiceURI);
    const index = v ? list.indexOf(v) : -1;
    let failed = false;
    const accepted = window.setTimeout(() => { if (!failed) o.onStart?.(); }, 250);
    t.speak({ text, lang: v?.lang || 'en-GB', rate: o.rate ?? 1, volume: 1, ...(index >= 0 ? { voice: index } : {}), category: 'playback', queueStrategy: 1 })
      .then(() => { window.clearTimeout(accepted); if (!failed) { o.onStart?.(); o.onEnd?.(); } })
      .catch((e: unknown) => { failed = true; window.clearTimeout(accepted); o.onError?.(e instanceof Error ? e.message : 'native speech error'); });
  });
}

export function stopNative(): void { void tts().then((t) => t?.stop().catch(() => {})); }
