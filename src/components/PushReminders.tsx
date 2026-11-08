// "Reminders": a morning notification with today's session, and an evening check-in only when today's session is
// still open. Times are saved with the profile (the same on every device); notifications are turned on per device.
import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Chips } from './inputs';
import { StatusLine } from './ui';
import { currentSubscription, disablePush, enablePush, pushPermission, pushSupport, sendTestPush } from '../data/push';
import { DEFAULT_REMINDERS, type Reminders } from '../training/push-core';

const MORNING = ['06:00', '06:30', '07:00', '07:30', '08:00', '09:00'];
const EVENING = ['18:00', '19:00', '20:00', '21:00'];

export function PushReminders() {
  const { data, updateProfile } = useApp();
  const support = pushSupport();
  const [on, setOn] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'danger'; text: string }>();
  const sample = data.mode !== 'real';
  const r = data.profile.reminders ?? DEFAULT_REMINDERS;

  useEffect(() => { let live = true; currentSubscription().then((s) => { if (live) setOn(!!s && pushPermission() === 'granted'); }, () => live && setOn(false)); return () => { live = false; }; }, []);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setMsg(undefined); try { await fn(); } catch (e) { setMsg({ kind: 'danger', text: (e as Error).message }); } finally { setBusy(false); } };
  const turnOn = () => run(async () => { await enablePush(); if (!data.profile.reminders) updateProfile({ reminders: DEFAULT_REMINDERS }); setOn(true); });
  const turnOff = () => run(async () => { await disablePush(); setOn(false); });
  const test = () => run(async () => { await sendTestPush(); setMsg({ kind: 'success', text: 'Sent. It should appear in a few seconds.' }); });
  const set = (patch: Partial<Reminders>) => updateProfile({ reminders: { ...r, ...patch } });
  const opts = (times: string[]) => [{ value: 'off', label: 'Off' }, ...times.map((t) => ({ value: t, label: t }))];

  return (
    <section className="card stack" aria-labelledby="reminders">
      <div className="row" style={{ gap: 8 }}><BellRing size={20} strokeWidth={2} aria-hidden="true" /><h2 id="reminders" className="title">Reminders</h2></div>
      <p className="muted">A notification in the morning with today's session, and one in the evening only if you haven't logged it yet. Nothing on rest days or while you're unwell.</p>
      {sample ? <p className="caption">Available with your own data.</p>
        : support === 'native' ? <StatusLine kind="info">Reminders aren't available in this version of the app yet. They work in the browser at app.ritmorunning.run.</StatusLine>
        : support === 'ios-install' ? <StatusLine kind="info">On iPhone and iPad, Apple only allows notifications once Ritmo is on your home screen. In Safari, tap Share, then Add to Home Screen, and open Ritmo from there.</StatusLine>
        : support === 'unsupported' ? <StatusLine kind="info">This browser can't show notifications. Try Chrome, Edge, Firefox or Safari.</StatusLine>
        : on === undefined ? null
        : !on ? (
          <>
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={turnOn} disabled={busy}>{busy ? 'Turning on…' : 'Turn on reminders'}</button>
            {pushPermission() === 'denied' && <p className="caption">Notifications are blocked for Ritmo on this device. Allow them in your browser or phone settings first.</p>}
          </>
        ) : (
          <>
            <Chips label="Morning: today's session" value={r.morning ?? 'off'} onChange={(v) => set({ morning: v === 'off' ? null : v })} options={opts(MORNING)} />
            <Chips label="Evening: if you haven't logged it" value={r.evening ?? 'off'} onChange={(v) => set({ evening: v === 'off' ? null : v })} options={opts(EVENING)} />
            <p className="caption">Times are your local time and apply on every device where reminders are on.</p>
            <div className="row wrap">
              <button className="btn btn-small" onClick={test} disabled={busy}>Send a test</button>
              <button className="btn btn-small btn-ghost" onClick={turnOff} disabled={busy}>Turn off on this device</button>
            </div>
          </>
        )}
      {msg && <div role={msg.kind === 'danger' ? 'alert' : 'status'}><StatusLine kind={msg.kind}>{msg.text}</StatusLine></div>}
    </section>
  );
}
