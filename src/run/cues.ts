// Voice cues that are checked (update 3, §2; hardened after testers heard nothing). On iPhone, speech started from a
// timer is blocked unless a tap spoke first, the silent switch can mute it, speech can be left paused after the page
// was in the background, and the engine can get stuck "speaking" while saying nothing. So:
// - every tap that leads to a run (Start, Quick run, Start now, Test voice) unlocks speech and the recorded clips
// - every cue is watched: if it has not started within 2.5 seconds, Ritmo retries once with the default voice
//   (the chosen voice may be missing or need a download), then plays its recorded clips instead
// - speech that is stuck (queued for 8 seconds with nothing spoken) is cleared before the next cue
// - if speech starts working again later (a late start), Ritmo goes back to it
// - in the store app the phone's own speech engine speaks, which no browser rule can block
// - failures are logged once per run, so they can be seen in support
import { speak, unlockSpeech, type SpeakOptions } from './voice';
import { hasNativeVoice, speakNative } from './native-voice';
import { reportError } from '../lib/errors';

export type VoiceState = 'unknown' | 'checking' | 'ok' | 'blocked';
let state: VoiceState = 'unknown';
let logged = false;
const listeners = new Set<(s: VoiceState) => void>();
const setState = (s: VoiceState) => { state = s; listeners.forEach((f) => f(s)); };
export const voiceState = () => state;
export function onVoiceState(f: (s: VoiceState) => void): () => void { listeners.add(f); return () => { listeners.delete(f); }; }
/** A new run: check again, and log again if it fails */
export function resetVoice() { state = 'unknown'; logged = false; useDefault = false; }

/** The recorded clips in public/audio/cues (made with scripts/make-cue-clips.sh) */
export const CLIP_WORDS = ['kilometre', 'kilometres', 'mile', 'miles', 'average-pace', 'minutes', 'seconds', 'go', 'paused', 'resumed', 'run-finished', 'ready', 'lap', 'recovery', 'easy', 'too-fast', 'too-slow', 'goal-reached', 'next', 'great-work', 'voice-check'] as const;
const WORDS: Record<string, string> = {
  kilometre: 'kilometre', kilometres: 'kilometres', mile: 'mile', miles: 'miles', go: 'go', paused: 'paused', resumed: 'resumed',
  lap: 'lap', recovery: 'recovery', easy: 'easy', minutes: 'minutes', minute: 'minutes', seconds: 'seconds', second: 'seconds', next: 'next',
};
const PHRASES: [RegExp, string][] = [
  [/average pace/g, ' average-pace '], [/run finished/g, ' run-finished '], [/ready when you are/g, ' ready '], [/too fast/g, ' too-fast '],
  [/too slow/g, ' too-slow '], [/goal reached/g, ' goal-reached '], [/great work/g, ' great-work '], [/voice cues are working/g, ' voice-check '],
];

/** The clips that say a cue: numbers and the words Ritmo's cues use; anything else is left out. */
export function clipsFor(text: string): string[] {
  let t = ` ${text.toLowerCase().replace(/(\d+):(\d\d)/g, '$1 $2')} `;
  for (const [re, w] of PHRASES) t = t.replace(re, w);
  const out: string[] = [];
  for (const tok of t.split(/[^a-z0-9-]+/).filter(Boolean)) {
    if (/^\d+$/.test(tok)) { const n = Number(tok); if (n >= 1 && n <= 59) out.push(String(n)); else if (n === 0) continue; else out.push(...String(n).split('').filter((d) => d !== '0')); continue; }
    if ((CLIP_WORDS as readonly string[]).includes(tok)) { out.push(tok); continue; }
    if (WORDS[tok]) out.push(WORDS[tok]);
  }
  return out;
}

let audio: HTMLAudioElement | undefined;
// Clips kept in memory once loaded, so the fallback works with no signal in the middle of a run
const loaded = new Map<string, string>();
let preloading: Promise<void> | undefined;
/** Load every clip (about 350 KB) when the pre-run sheet opens */
export function preloadClips(): Promise<void> {
  if (preloading) return preloading;
  const names = [...Array.from({ length: 59 }, (_, i) => String(i + 1)), ...CLIP_WORDS];
  preloading = Promise.all(names.map(async (n) => {
    try { const r = await fetch(`/audio/cues/${n}.mp3`); if (r.ok) loaded.set(n, URL.createObjectURL(await r.blob())); } catch { /* played from the network instead */ }
  })).then(() => undefined);
  return preloading;
}
let queue: string[] = [];
let playing = false;
const SILENT = '/audio/cues/silence.mp3';

/** Inside the Start tap: lets the page play the recorded clips later (iPhone only allows sound started by a tap) */
export function unlockClips(): void {
  try {
    if (!audio) audio = new Audio();
    audio.src = SILENT; audio.volume = 0;
    void audio.play().catch(() => { /* nothing to unlock on this device */ });
  } catch { /* no audio element */ }
}

function next() {
  const name = queue.shift();
  if (!name || !audio) { playing = false; return; }
  playing = true;
  audio.volume = 1;
  audio.src = loaded.get(name) ?? `/audio/cues/${name}.mp3`;
  audio.dataset.clip = name;
  audio.onended = () => next();
  audio.onerror = () => next();
  void audio.play().catch(() => { playing = false; queue = []; });
}
/** Play a cue from the recorded clips */
export function playClips(names: string[]): void {
  if (!names.length) return;
  if (!audio) audio = new Audio();
  queue.push(...names);
  if (!playing) next();
}

/** Stop the recorded clips (speech is working again) */
export function stopClips(): void {
  queue = []; playing = false;
  try { audio?.pause(); } catch { /* */ }
}

/** Inside any tap that leads to a run: unlock speech and the recorded clips, and load the clips */
export function unlockAudio(): void {
  if (!hasNativeVoice()) unlockSpeech();
  unlockClips();
  void preloadClips();
}

function log(why: string, text: string) {
  // For support: error tracking (when on), the console, and a short log kept on the device
  reportError(new Error(`Voice cue: ${why}`), `run-voice:${text.slice(0, 40)}`);
  console.warn(`[ritmo] voice cue: ${why}`);
  try {
    const list = JSON.parse(localStorage.getItem('ritmo:voice-log') ?? '[]') as unknown[];
    localStorage.setItem('ritmo:voice-log', JSON.stringify([...list, { at: new Date().toISOString(), why, cue: text.slice(0, 60), ua: navigator.userAgent.slice(0, 120) }].slice(-20)));
  } catch { /* storage may be off */ }
}
function blocked(why: string, text: string) {
  setState('blocked');
  if (!logged) { logged = true; log(`blocked: ${why}`, text); }
}

/** What the device said about the voice on this device, newest last (shown in Settings: Voice, for support) */
export function voiceLog(): { at: string; why: string; cue: string }[] {
  try { return JSON.parse(localStorage.getItem('ritmo:voice-log') ?? '[]'); } catch { return []; }
}

// Speech engine health: when one of our utterances last started or ended, and how many are waiting
let lastProgress = 0;
let waiting = 0;
let useDefault = false;
const STUCK_MS = 8000;
const progress = () => { lastProgress = Date.now(); };
/** Speech says it is busy, but none of our cues has started or ended for 8 seconds: it is stuck */
function stuck(): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  const ss = window.speechSynthesis;
  return waiting > 0 && (ss.speaking || ss.pending) && Date.now() - lastProgress > STUCK_MS;
}
function unstick() {
  if (!stuck()) return;
  try { window.speechSynthesis.cancel(); } catch { /* */ }
  waiting = 0;
  log('speech was stuck: cleared', '');
}
if (typeof document !== 'undefined') {
  // Back from the background (or the screen was off): iPhone can leave speech paused or stuck
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !('speechSynthesis' in window)) return;
    try { window.speechSynthesis.resume?.(); } catch { /* */ }
    unstick();
  });
}

/** One attempt to speak; resolves 'started', 'failed' (with why) or 'silent' (nothing within the time) */
function attempt(text: string, o: SpeakOptions, ms: number, onLate: () => void): Promise<{ r: 'started' | 'failed' | 'silent'; why?: string }> {
  return new Promise((resolve) => {
    let done = false;
    const end = (r: 'started' | 'failed' | 'silent', why?: string) => { if (done) return; done = true; window.clearTimeout(timer); resolve({ r, why }); };
    let counted = true;
    waiting++;
    const settle = () => { if (counted) { counted = false; waiting = Math.max(0, waiting - 1); } };
    const timer = window.setTimeout(() => {
      // Queued behind a cue that is still being spoken, with the engine making progress: it will come
      const ss = window.speechSynthesis;
      if ((ss.speaking || ss.pending) && Date.now() - lastProgress < STUCK_MS && waiting > 1) end('started');
      else end('silent');
    }, ms);
    const opts: SpeakOptions = {
      ...o,
      onStart: () => { progress(); if (done) onLate(); else end('started'); },
      onEnd: () => { progress(); settle(); },
      onError: (e) => { settle(); end('failed', e); },
    };
    if (hasNativeVoice()) speakNative(text, opts); else speak(text, opts);
  });
}

/**
 * Say a cue and check that it was spoken. Resolves true when speech started; false when it failed (then the
 * recorded clips play instead, until speech is seen working again).
 */
let checking: Promise<boolean> | undefined;
export async function cue(text: string, o: SpeakOptions = {}): Promise<boolean> {
  // While the first cue is being checked, later ones wait for the answer (the countdown says a number a second)
  if (state === 'checking' && checking) await checking.catch(() => false);
  const p = run(text, o);
  if (state === 'checking' || state === 'unknown') checking = p;
  return p;
}
async function run(text: string, o: SpeakOptions): Promise<boolean> {
  const native = hasNativeVoice();
  const has = native || (typeof window !== 'undefined' && 'speechSynthesis' in window);
  if (!has) { blocked('no speech on this device', text); playClips(clipsFor(text)); return false; }
  if (state === 'blocked') { playClips(clipsFor(text)); return false; }
  if (state === 'unknown') setState('checking');
  if (!native) unstick();
  // A late start (the phone was slow, not blocked): go back to speech and stop the clips saying the same thing
  const late = () => { if (state === 'blocked') { stopClips(); setState('ok'); } };
  const first = await attempt(text, { ...o, defaultVoice: o.defaultVoice || useDefault }, 2500, late);
  if (first.r === 'started') { if (state !== 'ok') setState('ok'); return true; }
  // Once more with the device's default voice: the chosen voice may be missing, or need a download or signal
  if (!useDefault) {
    if (!native) { try { window.speechSynthesis.cancel(); waiting = 0; } catch { /* */ } }
    const second = await attempt(text, { ...o, defaultVoice: true }, 2000, late);
    if (second.r === 'started') {
      useDefault = true;
      log(`chosen voice failed (${first.why ?? 'nothing spoken'}), default voice used`, text);
      if (state !== 'ok') setState('ok');
      return true;
    }
  }
  blocked(first.why ?? 'nothing spoken within 2.5 s', text);
  playClips(clipsFor(text));
  return false;
}
