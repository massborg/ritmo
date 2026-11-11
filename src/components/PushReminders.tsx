// Profile › Reminders (update 2, §15), grouped: Training, Races and gear, Hub, and quiet hours. Settings are saved with
// the profile (the same on every device); notifications are turned on per device, when the runner asks for them.
import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Chips } from './inputs';
import { StatusLine } from './ui';
import { currentSubscription, disablePush, enablePush, pushPermission, pushSupport, sendTestPush } from '../data/push';
import { DEFAULT_REMINDERS, withDefaults, type Reminders } from '../training/push-core';

const MORNING = ['06:00', '06:30', '07:00', '07:30', '08:00', '09:00'];
const EVENING = ['18:00', '19:00', '20:00', '21:00'];
const QUIET_START = ['21:00', '21:30', '22:00', '23:00'];
const QUIET_END = ['06:00', '06:30', '07:00', '08:00'];

export function PushReminders() {
  const { data, updateProfile } = useApp();
  const support = pushSupport();
  const [on, setOn] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'danger'; text: string }>();
  const sample = data.mode !== 'real';
  const r = withDefaults(data.profile.reminders);

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
      <p className="muted">At most one training reminder a day. Nothing on rest days, while you're unwell or while training is paused, and nothing during quiet hours.</p>
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
            <h3 className="label reminder-group">Training</h3>
            <Chips label="Today's session, in the morning" value={r.morning ?? 'off'} onChange={(v) => set({ morning: v === 'off' ? null : v })} options={opts(MORNING)} />
            <Chips label="Haven't logged a run, in the evening" value={r.evening ?? 'off'} onChange={(v) => set({ evening: v === 'off' ? null : v })} options={opts(EVENING)} />
            <Chips<string> label="No run for a while" value={r.noRunDays ? String(r.noRunDays) : 'off'} onChange={(v) => set({ noRunDays: v === 'off' ? null : Number(v) })}
              options={[{ value: 'off', label: 'Off' }, ...[2, 3, 4, 5].map((d) => ({ value: String(d), label: `${d} days` }))]} />
            <Toggle label="Missed key session" sub="The morning after: move it or skip it." on={!!r.missedKey} set={(v) => set({ missedKey: v })} />
            <Toggle label="Low readiness on a hard day" sub="A suggestion to swap for an easy run." on={!!r.lowReadiness} set={(v) => set({ lowReadiness: v })} />
            <Toggle label="How did it feel?" sub="About an hour after a synced run, if you haven't said." on={!!r.feel} set={(v) => set({ feel: v })} />
            <h3 className="label reminder-group">Races and gear</h3>
            <Toggle label="Race countdown" sub="A week before, 2 days before and on race eve, with a kit check." on={!!r.race} set={(v) => set({ race: v })} />
            <Toggle label="Weekly summary" sub="Sunday at 19:00: your week and next week's key session." on={!!r.weekly} set={(v) => set({ weekly: v })} />
            <Toggle label="Shoes nearly worn out" sub="At 85% of a pair's life." on={!!r.shoes} set={(v) => set({ shoes: v })} />
            <h3 className="label reminder-group">Hub</h3>
            <Toggle label="Follow requests and new followers" on={!!r.hubFollows} set={(v) => set({ hubFollows: v })} />
            <Toggle label="Fuego and comments on your runs" on={!!r.hubFuego} set={(v) => set({ hubFuego: v })} />
            <h3 className="label reminder-group">Quiet hours</h3>
            <div className="row wrap" style={{ gap: 12 }}>
              <Chips label="From" value={r.quietStart ?? '21:30'} onChange={(v) => set({ quietStart: v })} options={QUIET_START.map((t) => ({ value: t, label: t }))} />
              <Chips label="Until" value={r.quietEnd ?? '06:30'} onChange={(v) => set({ quietEnd: v })} options={QUIET_END.map((t) => ({ value: t, label: t }))} />
            </div>
            <p className="caption">Nothing arrives during quiet hours. A morning reminder set inside them comes just after; an evening one just before.</p>
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

function Toggle({ label, sub, on, set }: { label: string; sub?: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="row-between" style={{ gap: 12, minHeight: 44 }}>
      <span><span>{label}</span>{sub && <span className="caption" style={{ display: 'block' }}>{sub}</span>}</span>
      <input type="checkbox" style={{ width: 22, height: 22, flex: 'none' }} checked={on} onChange={(e) => set(e.target.checked)} />
    </label>
  );
}

