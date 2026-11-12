import { describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import { CLIP_WORDS, clipsFor } from './cues';

describe('recorded voice clips (update 3, §2)', () => {
  it('say Ritmo\'s cues from numbers and known words', () => {
    expect(clipsFor('5 kilometres. Average pace 4 32.')).toEqual(['5', 'kilometres', 'average-pace', '4', '32']);
    expect(clipsFor('1 kilometre. Average pace 5:05.')).toEqual(['1', 'kilometre', 'average-pace', '5', '5']);
    expect(clipsFor('Ready when you are.')).toEqual(['ready']);
    expect(clipsFor('Go.')).toEqual(['go']);
    expect(clipsFor("You're 4 seconds too fast.")).toEqual(['4', 'seconds', 'too-fast']);
    expect(clipsFor('Run finished.')).toEqual(['run-finished']);
    expect(clipsFor('Voice cues are working.')).toEqual(['voice-check']);
  });
  it('every clip they can ask for exists', () => {
    for (const n of [...Array.from({ length: 59 }, (_, i) => String(i + 1)), ...CLIP_WORDS, 'silence']) {
      expect(existsSync(`public/audio/cues/${n}.mp3`), n).toBe(true);
    }
  });
});
