// Voice cues that are checked (update 3, §2). On iPhone, speech started from a timer is often blocked, the silent
// switch can mute it and a voice may not be installed. So:
// - the Start tap speaks "Ready when you are" straight away (inside the tap), which unlocks later cues
// - every cue is watched: if speech reports an error, or has not started within 2 seconds, voice is "blocked"
// - once blocked, cues are played from short recorded clips instead (numbers 1–59, "kilometres", pace words)
// - failures are logged once per run, so they can be seen in support
import { speak, type SpeakOptions } from './voice';
import { reportError } from '../lib/errors';

export type VoiceState = 'unknown' | 'checking' | 'ok' | 'blocked';
let state: VoiceState = 'unknown';
let logged = false;
const listeners = new Set<(s: VoiceState) => void>();
const setState = (s: VoiceState) => { state = s; listeners.forEach((f) => f(s)); };
export const voiceState = () => state;
export function onVoiceState(f: (s: VoiceState) => void): () => void { listeners.add(f); return () => { listeners.delete(f); }; }
/** A new run: check again, and log again if it fails */
export function resetVoice() { state = 'unknown'; logged = false; }

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

function blocked(why: string, text: string) {
  setState('blocked');
  if (!logged) {
    logged = true;
    // For support: error tracking (when on), the console, and a short log kept on the device
    reportError(new Error(`Voice cue blocked: ${why}`), `run-voice:${text.slice(0, 40)}`);
    console.warn(`[ritmo] voice cue blocked: ${why}`);
    try {
      const log = JSON.parse(localStorage.getItem('ritmo:voice-log') ?? '[]') as unknown[];
      localStorage.setItem('ritmo:voice-log', JSON.stringify([...log, { at: new Date().toISOString(), why, cue: text.slice(0, 60), ua: navigator.userAgent.slice(0, 120) }].slice(-20)));
    } catch { /* storage may be off */ }
  }
}

/**
 * Say a cue and check that it was spoken. Resolves true when speech started; false when it failed (then the
 * recorded clips play instead, now and for the rest of the run).
 */
export function cue(text: string, o: SpeakOptions = {}): Promise<boolean> {
  if (state === 'blocked') { playClips(clipsFor(text)); return Promise.resolve(false); }
  const has = typeof window !== 'undefined' && 'speechSynthesis' in window;
  if (!has) { blocked('no speechSynthesis', text); playClips(clipsFor(text)); return Promise.resolve(false); }
  if (state === 'unknown') setState('checking');
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean, why = '') => {
      if (done) return;
      done = true; window.clearTimeout(timer);
      if (ok) { if (state !== 'ok') setState('ok'); }
      else { blocked(why, text); playClips(clipsFor(text)); }
      resolve(ok);
    };
    const timer = window.setTimeout(() => {
      // iPhone may not fire onstart: if it says it is speaking, that counts
      if (window.speechSynthesis.speaking) finish(true); else finish(false, 'nothing spoken within 2 s');
    }, 2000);
    speak(text, { ...o, onStart: () => finish(true), onError: (e) => finish(false, e) });
  });
}
