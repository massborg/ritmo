// "Your plan in your calendar": a private link to the calendar server function, which Apple Calendar, Google Calendar
// and Outlook subscribe to and refresh, so the calendar follows the plan as it changes. The link can be reset or
// turned off. Reminders travel with the feed: a morning alert and, the evening before a long run or race, a fuelling
// and kit reminder.
import { useState } from 'react';
import { CalendarPlus, Copy, RefreshCw } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Chips } from './inputs';
import { StatusLine } from './ui';

const FN = `${(import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''}/functions/v1/calendar`;
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');

export function CalendarFeed() {
  const { data, updateProfile } = useApp();
  const feed = data.profile.calendarFeed;
  const [copied, setCopied] = useState(false);
  const sample = data.mode !== 'real';
  const https = feed ? `${FN}?t=${feed.token}` : '';
  const webcal = https.replace(/^https?:\/\//, 'webcal://');
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  const turnOn = () => updateProfile({ calendarFeed: { token: newToken(), createdAt: new Date().toISOString(), morningHour: 7, eveReminder: true } });
  const set = (patch: Partial<NonNullable<typeof feed>>) => feed && updateProfile({ calendarFeed: { ...feed, ...patch } });
  const copy = async () => { try { await navigator.clipboard.writeText(https); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the link is shown to copy by hand */ } };

  return (
    <section className="card stack" aria-labelledby="cal-feed">
      <div className="row" style={{ gap: 8 }}><CalendarPlus size={20} strokeWidth={2} aria-hidden="true" /><h2 id="cal-feed" className="title">Your plan in your calendar</h2></div>
      {!feed ? (
        <>
          <p className="muted">Add your planned sessions and races to Apple Calendar, Google Calendar or Outlook. The calendar updates when your plan changes, with reminders if you want them.</p>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={turnOn} disabled={sample}>Create my calendar link</button>
          {sample && <p className="caption">Available with your own data.</p>}
        </>
      ) : (
        <>
          <div className="row wrap">
            <a className="btn btn-primary" href={webcal}>Add to Apple Calendar</a>
            <a className="btn" href={google} target="_blank" rel="noopener noreferrer">Add to Google Calendar</a>
            <button className="btn btn-ghost" onClick={copy}><Copy size={18} strokeWidth={2} aria-hidden="true" />{copied ? 'Copied' : 'Copy link'}</button>
          </div>
          <p className="caption cal-link" aria-label="Your calendar link">{https}</p>
          <p className="caption">For Outlook or other apps, choose "Subscribe from web" (or similar) and paste the link. Calendars refresh the feed every few hours.</p>
          <Chips label="Morning reminder on training days" value={feed.morningHour ?? -1} onChange={(v) => set({ morningHour: v < 0 ? null : v })}
            options={[{ value: -1, label: 'Off' }, { value: 6, label: '06:00' }, { value: 7, label: '07:00' }, { value: 8, label: '08:00' }]} />
          <Chips label="The evening before a long run or race" value={feed.eveReminder ? 'on' : 'off'} onChange={(v) => set({ eveReminder: v === 'on' })}
            options={[{ value: 'on', label: 'Fuel and kit reminder at 20:00' }, { value: 'off', label: 'Off' }]} />
          <StatusLine kind="info">Apple Calendar and Outlook show these reminders. Google Calendar ignores reminders in calendars you subscribe to, so add your own there if you want them.</StatusLine>
          <p className="caption">Anyone with this link can see your planned sessions and races, but nothing else: no runs, health data or location. Keep it to yourself.</p>
          <div className="row wrap">
            <button className="btn btn-small" onClick={() => set({ token: newToken() })}><RefreshCw size={16} strokeWidth={2} aria-hidden="true" />Reset the link</button>
            <button className="btn btn-small btn-ghost" onClick={() => updateProfile({ calendarFeed: undefined })}>Turn off</button>
          </div>
          <p className="caption">Resetting or turning off stops the old link working. Remove the old calendar from your calendar app too.</p>
        </>
      )}
    </section>
  );
}
