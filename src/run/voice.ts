// Spoken cues during a run, using the voices already on the phone or computer (free, and they work offline once
// downloaded). Phones ship far more natural voices than the default one: Siri and "Enhanced"/"Premium" voices on
// iPhone, Google voices on Android and Chrome, "Natural" voices in Edge. We list the English ones, best first,
// leave out novelty and robotic voices, and remember the runner's choice on this device.

export interface VoiceLike { voiceURI: string; name: string; lang: string; localService: boolean; default?: boolean }
export interface VoiceChoice { uri: string; name: string; lang: string; quality: 'premium' | 'enhanced' | 'standard'; kind?: 'woman' | 'man'; accent: string; score: number }

// Apple's joke voices and the old "Eloquence" voices: robotic by design, never offered
const NOVELTY = /\b(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good News|Hysterical|Jester|Junior|Organ|Pipe Organ|Ralph|Superstar|Trinoids|Whisper|Wobble|Zarvox|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Kathy|Fred)\b/i;

// What a voice sounds like, for well-known voices (browsers do not say)
const WOMEN = /\b(Samantha|Karen|Moira|Tessa|Serena|Kate|Fiona|Victoria|Allison|Ava|Susan|Zoe|Nicky|Martha|Catherine|Stephanie|Kathy|Veena|Isha|Aria|Jenny|Sonia|Libby|Natasha|Clara|Emily|Hazel|Zira|Female)\b/i;
const MEN = /\b(Daniel|Arthur|Oliver|Alex|Tom|Aaron|Gordon|Lee|Rishi|Evan|Nathan|Malcolm|Guy|Ryan|Liam|William|Thomas|George|David|Mark|James|Male)\b/i;

const ACCENTS: Record<string, string> = { 'en-GB': 'British', 'en-US': 'American', 'en-AU': 'Australian', 'en-IE': 'Irish', 'en-ZA': 'South African', 'en-IN': 'Indian', 'en-NZ': 'New Zealand', 'en-CA': 'Canadian', 'en-SG': 'Singaporean', 'en-SC': 'Scottish' };

export function describe(v: VoiceLike, preferLang = 'en-GB'): VoiceChoice | null {
  const lang = v.lang.replace('_', '-');
  if (!/^en(-|$)/i.test(lang) || NOVELTY.test(v.name)) return null;
  const id = `${v.voiceURI} ${v.name}`;
  const quality: VoiceChoice['quality'] = /premium/i.test(id) ? 'premium' : /enhanced|natural|neural|wavenet|siri/i.test(id) ? 'enhanced' : 'standard';
  const kind = WOMEN.test(v.name) ? 'woman' : MEN.test(v.name) ? 'man' : undefined;
  let score = quality === 'premium' ? 60 : quality === 'enhanced' ? 45 : 0;
  if (/google/i.test(id)) score += 30; // Google's voices are natural even without a label
  if (lang.toLowerCase() === preferLang.toLowerCase()) score += 10; else if (lang.slice(0, 2) === preferLang.slice(0, 2)) score += 4;
  if (v.localService) score += 3; // works without signal
  if (/compact/i.test(id)) score -= 20; // Apple's small, flat-sounding versions
  const name = v.name.replace(/\s*\((Enhanced|Premium|Natural)\)/i, '').replace(/\s*-\s*English.*$/i, '').replace(/^Microsoft\s+/i, '').replace(/\s+Online$/i, '').trim();
  return { uri: v.voiceURI, name, lang, quality, kind, accent: ACCENTS[lang] ?? lang, score };
}

/** English voices worth offering, best first, at most one per name (the best version of it). */
export function rankVoices(voices: VoiceLike[], preferLang = 'en-GB', max = 12): VoiceChoice[] {
  const best = new Map<string, VoiceChoice>();
  for (const v of voices) {
    const d = describe(v, preferLang);
    if (!d) continue;
    const key = `${d.name}|${d.lang}`;
    if (!best.has(key) || best.get(key)!.score < d.score) best.set(key, d);
  }
  return [...best.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, max);
}

export const voiceLabel = (v: VoiceChoice) => [v.accent, v.kind ? `${v.kind}'s voice` : undefined, v.quality !== 'standard' ? (v.quality === 'premium' ? 'Premium' : 'Natural') : undefined].filter(Boolean).join(' · ');

/** The device's voices; some browsers only fill the list a moment after the page loads. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!('speechSynthesis' in window)) return Promise.resolve([]);
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((res) => {
    const done = () => { window.speechSynthesis.removeEventListener?.('voiceschanged', done); res(window.speechSynthesis.getVoices()); };
    window.speechSynthesis.addEventListener?.('voiceschanged', done);
    setTimeout(done, 1500);
  });
}

export interface SpeakOptions {
  voiceURI?: string; rate?: number;
  /** Called when speech starts, when it ends, or with the reason it failed */
  onStart?: () => void; onEnd?: () => void; onError?: (why: string) => void;
  /** Use the device's default voice (after the chosen voice failed) */
  defaultVoice?: boolean;
}

/** Ask the device for its voices early (the Run screen calls this when it opens), so the first cue already has
 *  them: on iPhone the list is often empty for a moment, and anything spoken then uses the default voice. */
export function primeVoices(): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.getVoices();
  void loadVoices();
}

/** The voice to use: the runner's choice, or the best English voice on the device */
export function pickVoice<T extends VoiceLike>(all: T[], voiceURI?: string): T | undefined {
  return (voiceURI && all.find((v) => v.voiceURI === voiceURI))
    || (() => { const top = rankVoices(all, (typeof navigator !== 'undefined' && navigator.language) || 'en-GB')[0]; return top && all.find((v) => v.voiceURI === top.uri); })();
}

// Utterances being spoken are kept here: Chrome drops the events of an utterance that is garbage-collected
// mid-sentence, and then a cue looks as if it never started.
const live = new Set<SpeechSynthesisUtterance>();
export const liveUtterances = () => live.size;

/**
 * Speak with the chosen voice (or the best one on the device). On iPhone speech only works if something is spoken
 * inside a tap, and the voice list can be empty for a moment. Then a silent word is spoken now (inside the tap, which
 * unlocks speech) and the cue as soon as the chosen voice is listed, never in the device's default voice unless it
 * has no voice list at all. resume() first: iPhone can leave speech paused after the page was in the background,
 * and then every cue queues up silently.
 */
let noVoiceList = false;
export function speak(text: string, o: SpeakOptions = {}, waited = false): void {
  if (!('speechSynthesis' in window)) { o.onError?.('no speechSynthesis'); return; }
  const ss = window.speechSynthesis;
  const all = ss.getVoices();
  if (!all.length && !waited && !noVoiceList && !o.defaultVoice) {
    unlockSpeech();
    void loadVoices().then((v) => { if (!v.length) noVoiceList = true; speak(text, o, true); });
    return;
  }
  const chosen = o.defaultVoice ? undefined : pickVoice(all, o.voiceURI);
  const u = new SpeechSynthesisUtterance(text);
  if (chosen) { u.voice = chosen; u.lang = chosen.lang; } else u.lang = (typeof navigator !== 'undefined' && /^en/i.test(navigator.language) && navigator.language) || 'en-GB';
  u.rate = o.rate ?? 1;
  u.onstart = () => o.onStart?.();
  u.onend = () => { live.delete(u); o.onEnd?.(); };
  u.onerror = (e) => { live.delete(u); if (e.error === 'interrupted' || e.error === 'canceled') o.onEnd?.(); else o.onError?.(e.error || 'speech error'); };
  live.add(u);
  try { ss.resume?.(); ss.speak(u); } catch (e) { live.delete(u); o.onError?.((e as Error).message); }
}

/** Inside a tap: a silent word, so the phone allows the cues that are spoken later from a timer */
export function unlockSpeech(): void {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.resume?.();
    window.speechSynthesis.speak(u);
  } catch { /* cues are optional */ }
}

/** A short sample in the style of a real cue, for trying voices. */
export const SAMPLE = 'Two kilometres. Average pace five minutes ten. Nice and steady.';
