// The voice cue engine against a simulated phone (update 3 voice fix): speech that works, a voice list that is
// still empty, a chosen voice that fails, speech that never starts, a late start, and speech stuck "speaking".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/errors', () => ({ reportError: vi.fn() }));
vi.mock('./native-voice', () => ({ hasNativeVoice: () => false, speakNative: vi.fn() }));

type Mode = 'works' | 'silent' | 'voice-fails';
interface FakeU { text: string; voice?: { voiceURI: string }; lang?: string; volume?: number; rate?: number; onstart?: () => void; onend?: () => void; onerror?: (e: { error: string }) => void }

function phone(mode: Mode, voices: { voiceURI: string; name: string; lang: string; localService: boolean }[]) {
  const spoken: FakeU[] = [];
  const calls: string[] = [];
  const ss = {
    speaking: false, pending: false, paused: false,
    getVoices: () => voices,
    addEventListener: () => {}, removeEventListener: () => {},
    resume: vi.fn(() => calls.push('resume')),
    cancel: vi.fn(() => { calls.push('cancel'); ss.speaking = false; ss.pending = false; }),
    speak: vi.fn((u: FakeU) => {
      calls.push(`speak:${u.text}`);
      spoken.push(u);
      if (u.text.trim() === '') return;
      if (mode === 'works' || (mode === 'voice-fails' && !u.voice)) {
        ss.speaking = true;
        setTimeout(() => u.onstart?.(), 100);
        setTimeout(() => { ss.speaking = false; u.onend?.(); }, 600);
      } else if (mode === 'voice-fails') setTimeout(() => u.onerror?.({ error: 'synthesis-failed' }), 50);
    }),
  };
  return { ss, spoken, calls };
}

const played: string[] = [];
let paused = 0;
class FakeAudio {
  src = ''; volume = 1; dataset: Record<string, string> = {}; onended?: () => void; onerror?: () => void;
  play() { if (this.dataset.clip) played.push(this.dataset.clip); return Promise.resolve(); }
  pause() { paused++; }
}

const VOICES = [{ voiceURI: 'daniel', name: 'Daniel', lang: 'en-GB', localService: true }];

async function load(mode: Mode, voices = VOICES) {
  vi.resetModules();
  const p = phone(mode, voices);
  const store = new Map<string, string>();
  vi.stubGlobal('window', { speechSynthesis: p.ss, setTimeout, clearTimeout });
  vi.stubGlobal('document', { addEventListener: () => {}, visibilityState: 'visible' });
  vi.stubGlobal('navigator', { language: 'en-GB', userAgent: 'test' });
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; constructor(t: string) { this.text = t; } });
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
  const m = await import('./cues');
  return { ...p, m, store };
}

beforeEach(() => { vi.useFakeTimers(); played.length = 0; paused = 0; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('voice cues on a simulated phone', () => {
  it('speaks with the chosen voice when speech works, and calls resume() first', async () => {
    const { m, spoken, calls } = await load('works');
    const p = m.cue('Ready when you are.', { voiceURI: 'daniel' });
    await vi.advanceTimersByTimeAsync(200);
    expect(await p).toBe(true);
    expect(m.voiceState()).toBe('ok');
    expect(spoken[0].voice?.voiceURI).toBe('daniel');
    expect(calls.slice(0, 2)).toEqual(['resume', 'speak:Ready when you are.']);
    expect(played).toEqual([]);
  });

  it('unlocks speech inside the tap before the phone has listed its voices, then speaks the cue', async () => {
    const { m, ss, spoken } = await load('works', []);
    const p = m.cue('Ready when you are.');
    // Synchronously, in the same tick as the tap: a silent word, which is what unlocks speech on iPhone
    expect(ss.speak).toHaveBeenCalledTimes(1);
    expect(spoken[0].text).toBe(' ');
    await vi.advanceTimersByTimeAsync(1700);
    expect(await p).toBe(true);
    expect(spoken[1].text).toBe('Ready when you are.');
    expect(m.voiceState()).toBe('ok');
  });

  it('retries with the default voice when the chosen voice fails, then keeps using it', async () => {
    const { m, spoken, store } = await load('voice-fails');
    const p = m.cue('1 kilometre.', { voiceURI: 'daniel' });
    await vi.advanceTimersByTimeAsync(300);
    expect(await p).toBe(true);
    expect(m.voiceState()).toBe('ok');
    expect(spoken.map((u) => !!u.voice)).toEqual([true, false]);
    expect(played).toEqual([]);
    expect(store.get('ritmo:voice-log')).toContain('default voice used');
    const q = m.cue('2 kilometres.', { voiceURI: 'daniel' });
    await vi.advanceTimersByTimeAsync(200);
    expect(await q).toBe(true);
    expect(spoken[2].voice).toBeUndefined();
  });

  it('plays the recorded clips when speech never starts, and logs it once', async () => {
    const { m, store } = await load('silent');
    const p = m.cue('5 kilometres. Average pace 4 32.', { voiceURI: 'daniel' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await p).toBe(false);
    expect(m.voiceState()).toBe('blocked');
    await vi.advanceTimersByTimeAsync(10);
    expect(played[0]).toBe('5');
    const log = JSON.parse(store.get('ritmo:voice-log')!);
    expect(log).toHaveLength(1);
    expect(log[0].why).toMatch(/blocked/);
  });

  it('waits for the first check before saying the next countdown number', async () => {
    const { m, ss } = await load('works');
    void m.cue('5');
    void m.cue('4');
    expect(ss.speak).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(ss.speak).toHaveBeenCalledTimes(2);
  });

  it('goes back to speech (and stops the clips) when speech starts late', async () => {
    const { m, spoken } = await load('silent');
    const p = m.cue('Go.');
    await vi.advanceTimersByTimeAsync(5000);
    await p;
    expect(m.voiceState()).toBe('blocked');
    spoken[spoken.length - 1].onstart?.();
    expect(m.voiceState()).toBe('ok');
    expect(paused).toBeGreaterThan(0);
  });

  it('clears speech that is stuck "speaking" with nothing said, and says the cue', async () => {
    const { m, ss, calls } = await load('works');
    const p = m.cue('Go.');
    await vi.advanceTimersByTimeAsync(700);
    await p;
    // The phone hangs: it says it is speaking, but the cue never starts, until speech is cleared
    ss.speak.mockImplementationOnce((u: FakeU) => { ss.speaking = true; void u; });
    const q = m.cue('1 kilometre.');
    await vi.advanceTimersByTimeAsync(3000);
    expect(await q).toBe(true);
    expect(calls.filter((c) => c === 'cancel')).toHaveLength(1);
    expect(ss.speak.mock.calls.filter(([u]) => (u as FakeU).text === '1 kilometre.')).toHaveLength(2);
    expect(m.voiceState()).toBe('ok');
    expect(played).toEqual([]);
  });

  it('Test voice after a block checks speech again', async () => {
    const { m, ss } = await load('silent');
    const p = m.cue('Go.');
    await vi.advanceTimersByTimeAsync(5000);
    await p;
    ss.speak.mockImplementation((u: FakeU) => { ss.speaking = true; setTimeout(() => u.onstart?.(), 100); });
    m.resetVoice();
    const q = m.cue('Voice cues are working.');
    await vi.advanceTimersByTimeAsync(200);
    expect(await q).toBe(true);
    expect(m.voiceState()).toBe('ok');
  });

  it("uses Ritmo's recorded voice when chosen (an iPhone on silent mutes the phone's voice)", async () => {
    const { m, ss } = await load('works');
    m.setVoiceSource('ritmo');
    m.unlockClips();
    const ok = await m.cue('3 kilometres. Average pace 5 10.');
    await vi.advanceTimersByTimeAsync(10);
    expect(ok).toBe(true);
    expect(ss.speak).not.toHaveBeenCalled();
    expect(played).toEqual(['3']);
    expect(m.voiceState()).toBe('ok');
  });
});
