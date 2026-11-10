import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Camera, ChevronRight, Database, Volume2, KeyRound, LogOut, Shield, Target, Thermometer, UserRound } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Logo, Segmented, StatusLine } from '../components/ui';
import { AppHeader, SampleChip } from '../components/app';
import { Stepper } from '../components/inputs';
import { AvatarEditor, AvatarImage } from '../components/AvatarEditor';
import { distanceLabel, duration, relTime, shortDate, parseYmd } from '../lib/format';
import { sendPasswordReset } from '../app/auth';
import type { Profile as P } from '../lib/types';
import { PushReminders } from '../components/PushReminders';
import { Shoes } from '../components/Shoes';
import { BodySection } from '../components/BodySection';
import { CalendarFeed } from '../components/CalendarFeed';

export default function Profile() {
  const { data, updateProfile, session, signOut, reportIllness, clearIllness, hr, zones, fitness, syncError, today, stage, aRace, hrIssue, hasFlag } = useApp();
  const nav = useNavigate();
  const { hash } = useLocation();
  // Links such as /profile#hr (from a run's "Check your max heart rate" card) open at that section
  useEffect(() => { if (hash) document.getElementById(hash.slice(1))?.closest('section')?.scrollIntoView({ block: 'start' }); }, [hash]);
  const p = data.profile;
  const [msg, setMsg] = useState<{ kind: 'success' | 'danger'; text: string }>();
  const [photo, setPhoto] = useState(false);
  const goalText = aRace?.goalS ? `${aRace.name} in ${duration(aRace.goalS)}` : p.goal;
  const hasHr = data.activities.some((a) => a.avgHr);
  const ill = p.illnessUntil && p.illnessUntil >= today.toISOString().slice(0, 10);

  return (
    <div className="stack-lg">
      <AppHeader title="Profile" right={<SampleChip />} />

      <section className="card stack">
        <div className="row" style={{ gap: 'var(--s4)' }}>
          <AvatarImage size={72} />
          <div className="stack-sm" style={{ gap: 4 }}>
            <button className="btn btn-small" onClick={() => setPhoto(true)} disabled={data.mode === 'sample'}><Camera size={18} strokeWidth={2} aria-hidden="true" />{p.avatar ? 'Change or remove photo' : 'Add a photo'}</button>
            <span className="caption">{data.mode === 'sample' ? 'Available with your own data' : 'Private to you'}</span>
          </div>
        </div>
        <AvatarEditor open={photo} onClose={() => setPhoto(false)} />
        <div className="field"><label htmlFor="pname">Your name</label><input id="pname" className="input" value={p.name} onChange={(e) => updateProfile({ name: e.target.value })} autoComplete="given-name" /></div>
        <div className="row-between wrap"><span className="label">Units</span><Segmented label="Units" value={p.units} onChange={(u) => updateProfile({ units: u })} options={[{ value: 'km', label: 'Kilometres' }, { value: 'mi', label: 'Miles' }]} /></div>
        <div className="stack-sm">
          <span className="label">Appearance</span>
          <Segmented<P['theme']> label="Theme" value={p.theme} onChange={(theme) => updateProfile({ theme })} options={[{ value: 'system', label: 'System' }, { value: 'giorno', label: 'Light' }, { value: 'notte', label: 'Dark' }, { value: 'sole', label: 'High contrast' }]} />
          <p className="caption">Light (Giorno), Dark (Notte), or High contrast (Sole) for bright sunshine outdoors. System follows your phone.</p>
        </div>
      </section>

      <div className="group">
        <Link to="/goals" className="row-between"><span className="row"><span className="row-icon"><Target size={18} strokeWidth={2} aria-hidden="true" /></span><span className="stack-sm" style={{ gap: 0 }}><span className="label">Goals and availability</span><span className="caption">{goalText || 'Not set'}</span></span></span><ChevronRight size={20} strokeWidth={2} aria-hidden="true" /></Link>
        <Link to="/profile/data" className="row-between"><span className="row"><span className="row-icon"><Database size={18} strokeWidth={2} aria-hidden="true" /></span><span className="stack-sm" style={{ gap: 0 }}><span className="label">Data sources</span><span className="caption">{data.sources.filter((s) => s.connected).map((s) => (s.kind === 'sample' ? 'Sample data' : s.kind === 'upload' ? 'File upload' : s.kind)).join(', ') || 'None connected'}{data.sources[0]?.lastSyncAt ? ` · last import ${relTime(data.sources[0].lastSyncAt)}` : ''}</span></span></span><ChevronRight size={20} strokeWidth={2} aria-hidden="true" /></Link>
        <Link to="/profile/privacy" className="row-between"><span className="row"><span className="row-icon"><Shield size={18} strokeWidth={2} aria-hidden="true" /></span><span className="label">Privacy and your data</span></span><ChevronRight size={20} strokeWidth={2} aria-hidden="true" /></Link>
      </div>

      <PushReminders />
      {/* Moved from You (brief 6.1): shoes, and Body's niggles and exercises */}
      <Shoes />
      {hasFlag('body') && <BodySection />}

      <section className="card stack-sm" aria-labelledby="run-settings-h">
        <div className="row" style={{ gap: 8 }}><Volume2 size={20} strokeWidth={2} aria-hidden="true" /><h2 id="run-settings-h" className="title">Run settings</h2></div>
        <p className="muted">The voice and speed of spoken cues, which cues you hear, the countdown, auto-pause and keeping the screen on.</p>
        <Link to="/run?settings=1" className="btn btn-small" style={{ alignSelf: 'flex-start' }}>Open run settings <ChevronRight size={18} strokeWidth={2} aria-hidden="true" /></Link>
      </section>
      <CalendarFeed />

      <section className="card stack" aria-labelledby="ill">
        <div className="row" style={{ gap: 8 }}><Thermometer size={20} strokeWidth={2} aria-hidden="true" /><h2 id="ill" className="title">Feeling unwell?</h2></div>
        {ill ? (
          <>
            <StatusLine kind="info">Rest until {shortDate(parseYmd(p.illnessUntil!))}. Your plan has been adjusted.</StatusLine>
            <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={clearIllness}>I feel better</button>
          </>
        ) : (
          <>
            <p className="muted">Tell Ritmo and your plan switches to rest, then eases you back in.</p>
            <div className="row wrap">{[2, 3, 5].map((d) => <button key={d} className="chip" onClick={() => reportIllness(d)}>Rest {d} days</button>)}</div>
          </>
        )}
      </section>

      <section className="card stack" aria-labelledby="hr">
        <h2 id="hr" className="title">Heart rate and fitness</h2>
        <div className="grid-2">
          <Stepper id="maxhr" label="Maximum heart rate" unit="bpm" value={p.maxHr} placeholder={String(hr.max)} min={120} max={230} onChange={(v) => updateProfile({ maxHr: v })} />
          <Stepper id="resthr" label="Resting heart rate" unit="bpm" value={p.restHr} placeholder={String(hr.rest)} min={30} max={100} onChange={(v) => updateProfile({ restHr: v })} />
        </div>
        {hrIssue && (
          <div className="banner banner-stack" role="note">
            <StatusLine kind="warning">Your zones may be set too low</StatusLine>
            <p>{hrIssue.reason}{hrIssue.suggestedMax ? ` Your runs this year suggest a maximum of about ${hrIssue.suggestedMax} bpm.` : ' If you know your real maximum, enter it above.'}</p>
            {hrIssue.suggestedMax && <button className="btn btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => updateProfile({ maxHr: hrIssue.suggestedMax })}>Use {hrIssue.suggestedMax} bpm</button>}
          </div>
        )}
        <div className="table-scroll"><table className="data"><caption className="sr-only">Heart rate zones</caption><thead><tr><th scope="col">Zone</th><th scope="col">From</th><th scope="col">To</th></tr></thead>
          <tbody>{zones.map((z) => <tr key={z.zone}><td style={{ fontFamily: 'var(--font-body)' }}><span className="row" style={{ gap: 8 }}><span className={`zone-dot z${z.zone}`} aria-hidden="true" />Z{z.zone}</span></td><td>{z.min}</td><td>{z.max}</td></tr>)}</tbody></table></div>
        {!hasHr && <p className="caption">Zones are used once your runs include heart rate from a watch or chest strap.</p>}
        {fitness && stage.predictions ? <p className="caption">Fitness estimate (VDOT) {fitness.vdot.toFixed(1)}, based on {fitness.basedOn}.</p> : <p className="caption">Your fitness estimate appears after a time trial or race. {stage.next}</p>}
        {data.races.length > 0 && <p className="caption">Races: {data.races.map((r) => `${r.name} (${distanceLabel(r.distanceM)})`).join(', ')}</p>}
      </section>

      <section className="card stack" aria-labelledby="account">
        <div className="row" style={{ gap: 8 }}><UserRound size={20} strokeWidth={2} aria-hidden="true" /><h2 id="account" className="title">Account and sync</h2></div>
        <StatusLine kind="success">Logged in as {session?.user.email}</StatusLine>
        <p className="muted">{data.mode === 'sample'
          ? 'You are exploring sample data. Sample runs are not saved to your account; your settings and coach chats are.'
          : 'Your runs, plan, races, feedback and coach chats are saved to your account, private to you, and available on any device where you log in.'}</p>
        {syncError && <StatusLine kind="warning">{syncError}</StatusLine>}
        <div className="row wrap">
          <button className="btn btn-small" onClick={async () => { const r = await sendPasswordReset(session?.user.email ?? ''); setMsg(r.ok ? { kind: 'success', text: `We sent a link to ${session?.user.email} to change your password.` } : { kind: 'danger', text: r.message ?? 'Could not send the link.' }); }}><KeyRound size={18} strokeWidth={2} aria-hidden="true" />Change password</button>
          <button className="btn btn-small" onClick={async () => { await signOut(); nav('/login', { replace: true }); }}><LogOut size={18} strokeWidth={2} aria-hidden="true" />Log out</button>
        </div>
        {msg && <StatusLine kind={msg.kind}>{msg.text}</StatusLine>}
        <p className="caption">Logging out removes your data from this device only. Everything stays in your account. To delete your account, go to <Link to="/profile/privacy" className="label">Privacy and your data</Link>.</p>
      </section>

      <div className="row" style={{ justifyContent: 'center', padding: 'var(--s5) 0' }}>
        <div className="stack-sm" style={{ alignItems: 'center' }}>
          <Logo variant="main" width={140} />
          <p className="caption">Train to your own rhythm.</p>
        </div>
      </div>
    </div>
  );
}
