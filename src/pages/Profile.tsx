import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Cloud, Database, Shield, Target, Thermometer } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Logo, Segmented, StatusLine } from '../components/ui';
import { AppHeader, SampleChip } from '../components/app';
import { Stepper } from '../components/inputs';
import { distanceLabel, relTime, shortDate, parseYmd } from '../lib/format';
import type { Profile as P } from '../lib/types';

export default function Profile() {
  const { data, updateProfile, session, signIn, signOut, reportIllness, clearIllness, hr, zones, fitness, cloudError, today } = useApp();
  const p = data.profile;
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<{ kind: 'success' | 'danger'; text: string }>();
  const ill = p.illnessUntil && p.illnessUntil >= today.toISOString().slice(0, 10);

  return (
    <div className="stack-lg">
      <AppHeader title="Profile" right={<SampleChip />} />

      <section className="card stack">
        <div className="field"><label htmlFor="pname">Your name</label><input id="pname" className="input" value={p.name} onChange={(e) => updateProfile({ name: e.target.value })} autoComplete="given-name" /></div>
        <div className="row-between wrap"><span className="label">Units</span><Segmented label="Units" value={p.units} onChange={(u) => updateProfile({ units: u })} options={[{ value: 'km', label: 'Kilometres' }, { value: 'mi', label: 'Miles' }]} /></div>
        <div className="stack-sm">
          <span className="label">Appearance</span>
          <Segmented<P['theme']> label="Theme" value={p.theme} onChange={(theme) => updateProfile({ theme })} options={[{ value: 'system', label: 'System' }, { value: 'giorno', label: 'Giorno' }, { value: 'notte', label: 'Notte' }, { value: 'sole', label: 'Sole' }]} />
          <p className="caption">Giorno is light and Notte is dark. Sole is high contrast for bright sunshine outdoors.</p>
          <Link to="/profile/opening" className="btn btn-small" style={{ alignSelf: 'flex-start' }}>Opening animation</Link>
        </div>
      </section>

      <div className="group">
        <Link to="/goals" className="row-between"><span className="row"><span className="row-icon"><Target size={18} strokeWidth={2} aria-hidden="true" /></span><span className="stack-sm" style={{ gap: 0 }}><span className="label">Goals and availability</span><span className="caption">{p.goal || 'Not set'}</span></span></span><ChevronRight size={20} strokeWidth={2} aria-hidden="true" /></Link>
        <Link to="/profile/data" className="row-between"><span className="row"><span className="row-icon"><Database size={18} strokeWidth={2} aria-hidden="true" /></span><span className="stack-sm" style={{ gap: 0 }}><span className="label">Data sources</span><span className="caption">{data.sources.filter((s) => s.connected).map((s) => (s.kind === 'sample' ? 'Sample data' : s.kind === 'upload' ? 'File upload' : s.kind)).join(', ') || 'None connected'}{data.sources[0]?.lastSyncAt ? ` · last import ${relTime(data.sources[0].lastSyncAt)}` : ''}</span></span></span><ChevronRight size={20} strokeWidth={2} aria-hidden="true" /></Link>
        <Link to="/profile/privacy" className="row-between"><span className="row"><span className="row-icon"><Shield size={18} strokeWidth={2} aria-hidden="true" /></span><span className="label">Privacy and your data</span></span><ChevronRight size={20} strokeWidth={2} aria-hidden="true" /></Link>
      </div>

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
        <div className="table-scroll"><table className="data"><caption className="sr-only">Heart rate zones</caption><thead><tr><th scope="col">Zone</th><th scope="col">From</th><th scope="col">To</th></tr></thead>
          <tbody>{zones.map((z) => <tr key={z.zone}><td style={{ fontFamily: 'var(--font-body)' }}><span className="row" style={{ gap: 8 }}><span className={`zone-dot z${z.zone}`} aria-hidden="true" />Z{z.zone}</span></td><td>{z.min}</td><td>{z.max}</td></tr>)}</tbody></table></div>
        {fitness && <p className="caption">Fitness estimate (VDOT) {fitness.vdot}, based on {fitness.basedOn}.</p>}
        {data.races.length > 0 && <p className="caption">Races: {data.races.map((r) => `${r.name} (${distanceLabel(r.distanceM)})`).join(', ')}</p>}
      </section>

      <section className="card stack" aria-labelledby="cloud">
        <div className="row" style={{ gap: 8 }}><Cloud size={20} strokeWidth={2} aria-hidden="true" /><h2 id="cloud" className="title">Account and sync</h2></div>
        {session ? (
          <>
            <StatusLine kind="success">Signed in as {session.user.email}</StatusLine>
            <p className="muted">{data.mode === 'real' ? 'Your runs, plan and feedback are backed up and available on your other devices.' : 'Sample data stays on this device. Upload your own runs to back them up.'}</p>
            {cloudError && <StatusLine kind="danger">Sync problem: {cloudError}</StatusLine>}
            <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={signOut}>Sign out</button>
          </>
        ) : (
          <form className="stack" onSubmit={async (e) => { e.preventDefault(); const err = await signIn(email); setMsg(err ? { kind: 'danger', text: err } : { kind: 'success', text: 'Check your email for a sign-in link.' }); }}>
            <p className="muted">Ritmo works on this device without an account. Sign in to back up your data and use it on other devices.</p>
            <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></div>
            <button className="btn btn-primary" type="submit" style={{ alignSelf: 'flex-start' }}>Email me a sign-in link</button>
            {msg && <StatusLine kind={msg.kind}>{msg.text}</StatusLine>}
          </form>
        )}
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
