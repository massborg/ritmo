import { describe, expect, it } from 'vitest';
import { rankVoices, voiceLabel, type VoiceLike } from './voice';

const V = (name: string, lang: string, voiceURI = name, localService = true): VoiceLike => ({ name, lang, voiceURI, localService });

describe('choosing natural voices', () => {
  const iphone: VoiceLike[] = [
    V('Daniel', 'en-GB', 'com.apple.voice.compact.en-GB.Daniel'),
    V('Serena (Premium)', 'en-GB', 'com.apple.voice.premium.en-GB.Serena'),
    V('Serena', 'en-GB', 'com.apple.voice.compact.en-GB.Serena'),
    V('Samantha (Enhanced)', 'en-US', 'com.apple.voice.enhanced.en-US.Samantha'),
    V('Karen', 'en-AU', 'com.apple.voice.compact.en-AU.Karen'),
    V('Zarvox', 'en-US', 'com.apple.speech.synthesis.voice.Zarvox'),
    V('Bubbles', 'en-US', 'com.apple.speech.synthesis.voice.Bubbles'),
    V('Grandma (English (UK))', 'en-GB', 'com.apple.eloquence.en-GB.Grandma'),
    V('Thomas', 'fr-FR', 'com.apple.voice.compact.fr-FR.Thomas'),
  ];
  it('puts premium and enhanced voices first, and prefers the runner\'s own accent', () => {
    const r = rankVoices(iphone, 'en-GB');
    expect(r[0]).toMatchObject({ name: 'Serena', quality: 'premium', kind: 'woman', accent: 'British' });
    expect(r[1]).toMatchObject({ name: 'Samantha', quality: 'enhanced' });
  });
  it('leaves out novelty, robotic and non-English voices, and keeps one version of each voice', () => {
    const names = rankVoices(iphone, 'en-GB').map((v) => v.name);
    for (const n of ['Zarvox', 'Bubbles', 'Grandma (English (UK))', 'Thomas']) expect(names).not.toContain(n);
    expect(names.filter((n) => n === 'Serena')).toHaveLength(1);
    expect(names).toEqual(expect.arrayContaining(['Daniel', 'Karen']));
  });
  it('rates natural Microsoft voices and Google voices above plain ones', () => {
    const r = rankVoices([V('Google UK English Female', 'en-GB', 'Google UK English Female', false), V('Microsoft Sonia Online (Natural) - English (United Kingdom)', 'en-GB'), V('Microsoft George - English (United Kingdom)', 'en-GB')], 'en-GB');
    expect(r.map((v) => v.name)).toEqual(['Sonia', 'Google UK English Female', 'George']);
    expect(voiceLabel(r[0])).toBe("British · woman's voice · Natural");
    expect(r[2].kind).toBe('man');
  });
  it('describes a voice in plain words', () => {
    expect(voiceLabel(rankVoices([V('Karen', 'en-AU')])[0])).toBe("Australian · woman's voice");
  });
});
