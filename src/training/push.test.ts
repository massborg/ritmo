import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { eveningMessage, isDue, localNow, morningMessage, type PushSession } from './push-core';
import { b64u, encrypt, generateKeyPair, unb64u, vapidAuth } from '../../supabase/functions/_shared/webpush';

const S = (o: Partial<PushSession>): PushSession => ({ id: 'a', date: '2026-11-09', type: 'easy', title: 'Easy run', distanceM: 8000, durationS: 2700, status: 'planned', ...o });

describe('reminder timing', () => {
  it('works out local date and time in the runner\'s time zone', () => {
    const now = new Date('2026-11-09T06:30:00Z');
    expect(localNow(now, 'Europe/London')).toEqual({ date: '2026-11-09', minutes: 390 });
    expect(localNow(now, 'America/Los_Angeles')).toEqual({ date: '2026-11-08', minutes: 22 * 60 + 30 });
    expect(localNow(now, 'Asia/Kolkata')).toEqual({ date: '2026-11-09', minutes: 12 * 60 });
    expect(localNow(now, 'Not/AZone')).toEqual({ date: '2026-11-09', minutes: 390 });
  });
  it('is due from its time for an hour, once a day, and never when off', () => {
    expect(isDue('07:00', 7 * 60, '2026-11-09', null)).toBe(true);
    expect(isDue('07:00', 7 * 60 + 59, '2026-11-09', '2026-11-08')).toBe(true);
    expect(isDue('07:00', 6 * 60 + 59, '2026-11-09', null)).toBe(false);
    expect(isDue('07:00', 8 * 60, '2026-11-09', null)).toBe(false);
    expect(isDue('07:00', 7 * 60 + 15, '2026-11-09', '2026-11-09')).toBe(false);
    expect(isDue(null, 7 * 60, '2026-11-09', null)).toBe(false);
    expect(isDue('7am', 7 * 60, '2026-11-09', null)).toBe(false);
  });
});

describe('reminder wording', () => {
  const today = '2026-11-09';
  it('morning: today\'s session, nothing on rest days or after it is done', () => {
    expect(morningMessage([S({})], today, 'km')).toMatchObject({ title: 'Today: Easy run', body: '8 km. Tap to see the session.' });
    expect(morningMessage([S({})], today, 'mi')?.body).toBe('5 mi. Tap to see the session.');
    expect(morningMessage([S({ type: 'rest', title: 'Rest' })], today, 'km')).toBeNull();
    expect(morningMessage([S({ date: '2026-11-10' })], today, 'km')).toBeNull();
    expect(morningMessage([S({ status: 'skipped' })], today, 'km')).toBeNull();
    expect(morningMessage([S({ type: 'race', title: 'Valencia 10K' })], today, 'km')?.title).toBe('Race day: Valencia 10K');
    expect(morningMessage([S({ distanceM: 0, durationS: 1800, title: 'Run-walk' })], today, 'km')?.body).toBe('30 min. Tap to see the session.');
  });
  it('evening: only when the session is still open and no run arrived', () => {
    expect(eveningMessage([S({})], today, false)?.body).toBe('Easy run is still open. Log your run, or mark it skipped so your plan can adjust.');
    expect(eveningMessage([S({})], today, true)).toBeNull();
    for (const status of ['done', 'skipped', 'moved', 'missed']) expect(eveningMessage([S({ status })], today, false)).toBeNull();
    expect(eveningMessage([S({ type: 'rest' })], today, false)).toBeNull();
    expect(eveningMessage([S({ type: 'race' })], today, false)).toBeNull();
  });
  it('the server function uses an identical copy', () => {
    expect(readFileSync('supabase/functions/_shared/push-core.ts', 'utf8')).toBe(readFileSync('src/training/push-core.ts', 'utf8'));
  });
});

describe('Web Push encryption and signing', () => {
  it('matches the worked example in RFC 8291 (appendix A)', async () => {
    const out = await encrypt(new TextEncoder().encode('When I grow up, I want to be a watermelon'),
      'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg',
      { salt: unb64u('DGv6ra1nlYgDCS1FRnbzlw'), local: { publicKey: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8', privateKey: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw' } });
    expect(b64u(out)).toBe('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
  });
  it('signs a VAPID token for the push service that verifies with the public key', async () => {
    const pair = await generateKeyPair();
    const header = await vapidAuth('https://web.push.apple.com/abc', pair, 'https://app.ritmorunning.run', Date.UTC(2026, 10, 9));
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!;
    expect(m[4]).toBe(pair.publicKey);
    const claims = JSON.parse(new TextDecoder().decode(unb64u(m[2])));
    expect(claims).toMatchObject({ aud: 'https://web.push.apple.com', sub: 'https://app.ritmorunning.run' });
    const key = await crypto.subtle.importKey('raw', unb64u(pair.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    expect(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64u(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`))).toBe(true);
  });
});
