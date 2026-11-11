// Hub › Edit profile (update 2, §13 and §14): name, area, about, approving followers, and the PBs to show.
// PBs are off by default; up to 4 distances, each Ritmo's best or a time the runner enters (shown as self-reported).
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { StatusLine } from '../components/ui';
import { PbStrip } from '../components/HubBits';
import { duration } from '../lib/format';
import * as hub from '../data/hub';
import type { HubProfile } from '../data/hub';
import { fasterThanOwn, MAX_PROFILE_PBS, parseTime, PROFILE_PB_DISTANCES, resolvePbs, ritmoBests, type HubPbSettings, type PbChoice } from '../training/profile-pbs';

export default function EditHubProfile() {
  const { session, data, updateProfile } = useApp();
  const nav = useNavigate();
  const uid = session?.user.id;
  const [p, setP] = useState<HubProfile | null>();
  const [pbs, setPbs] = useState<HubPbSettings>(data.profile.hubPbs ?? { show: false, items: [] });
  const [times, setTimes] = useState<Record<number, string>>(() => Object.fromEntries((data.profile.hubPbs?.items ?? []).filter((c) => c.timeS).map((c) => [c.m, duration(c.timeS!)])));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'danger'; text: string }>();
  useEffect(() => { if (uid) hub.myHubProfile(uid).then((x) => setP(x ?? null)).catch(() => setP(null)); }, [uid]);
  useEffect(() => { if (window.location.hash === '#pbs') setTimeout(() => document.getElementById('pbs')?.scrollIntoView({ block: 'start' }), 300); }, []);
  const bests = useMemo(() => ritmoBests(data.activities, data.races), [data.activities, data.races]);
  const faster = fasterThanOwn(pbs, bests);

  if (!uid) return null;
  if (p === undefined) return <div className="stack-lg"><AppHeader title="Edit profile" back large={false} /><p className="muted" role="status">Loading…</p></div>;
  if (p === null) return <div className="stack-lg"><AppHeader title="Edit profile" back large={false} /><p>Join the Hub first. <Link to="/hub" className="label">Open the Hub</Link></p></div>;

  const chosen = (m: number) => pbs.items.find((c) => c.m === m);
  const toggle = (m: number) => setPbs((s) => {
    if (s.items.some((c) => c.m === m)) return { ...s, items: s.items.filter((c) => c.m !== m) };
    if (s.items.length >= MAX_PROFILE_PBS) return s;
    return { ...s, items: [...s.items, { m, mode: (bests.has(m) ? 'ritmo' : 'own') as PbChoice['mode'] }].sort((a, b) => a.m - b.m) };
  });
  const setItem = (m: number, patch: Partial<PbChoice>) => setPbs((s) => ({ ...s, items: s.items.map((c) => (c.m === m ? { ...c, ...patch } : c)) }));
  const badTimes = pbs.show ? pbs.items.filter((c) => c.mode === 'own' && !parseTime(times[c.m] ?? '')).map((c) => c.m) : [];
  const preview = resolvePbs({ ...pbs, items: pbs.items.map((c) => (c.mode === 'own' ? { ...c, timeS: parseTime(times[c.m] ?? '') } : c)) }, bests);

  const save = async () => {
    if (badTimes.length) { setMsg({ kind: 'danger', text: 'Enter each time as m:ss or h:mm:ss, for example 15:38 or 1:13:37.' }); return; }
    setSaving(true); setMsg(undefined);
    const items = pbs.items.map((c) => (c.mode === 'own' ? { ...c, timeS: parseTime(times[c.m] ?? '') } : { m: c.m, mode: c.mode } as PbChoice));
    try {
      await hub.saveHubProfile({ ...p, display_name: p.display_name.trim() || 'Runner', area: p.area?.trim() || null, bio: p.bio?.trim() || null, pbs: resolvePbs({ ...pbs, items }, bests) });
      updateProfile({ hubPbs: { show: pbs.show, items } });
      setMsg({ kind: 'success', text: 'Saved.' });
      setTimeout(() => nav('/hub/runner/me'), 500);
    } catch (e) { setMsg({ kind: 'danger', text: (e as Error).message }); } finally { setSaving(false); }
  };

  return (
    <div className="stack-lg">
      <AppHeader title="Edit profile" back large={false} right={<button className="btn btn-small btn-primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button>} />
      {msg && <StatusLine kind={msg.kind}>{msg.text}</StatusLine>}
      <section className="card stack">
        <div className="field"><label htmlFor="ep-name">Name on the Hub</label><input id="ep-name" className="input" value={p.display_name} maxLength={60} onChange={(e) => setP({ ...p, display_name: e.target.value })} /></div>
        <div className="field"><label htmlFor="ep-area">Area (optional)</label><input id="ep-area" className="input" placeholder="For example Sliema" value={p.area ?? ''} maxLength={60} onChange={(e) => setP({ ...p, area: e.target.value })} /><span className="caption">A town or area, never an address.</span></div>
        <div className="field"><label htmlFor="ep-bio">About you (optional)</label><textarea id="ep-bio" className="input" value={p.bio ?? ''} maxLength={280} onChange={(e) => setP({ ...p, bio: e.target.value })} /></div>
        <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={p.private} onChange={(e) => setP({ ...p, private: e.target.checked })} /> Approve new followers before they see my runs</label>
        <p className="caption">Your photo and who can see it are on <Link to="/profile" className="label">Profile</Link>.</p>
      </section>

      <section className="card stack" id="pbs" aria-labelledby="pbs-h">
        <h2 id="pbs-h" className="title">PBs on your profile</h2>
        <label className="row-between" style={{ gap: 12, minHeight: 44 }}>
          <span className="label">Show PBs on my profile</span>
          <input type="checkbox" style={{ width: 24, height: 24 }} checked={pbs.show} onChange={(e) => setPbs({ ...pbs, show: e.target.checked })} />
        </label>
        {pbs.show && <>
          <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label" style={{ marginBottom: 6 }}>Which distances (up to {MAX_PROFILE_PBS})</legend>
            <div className="row wrap" style={{ gap: 6 }}>
              {PROFILE_PB_DISTANCES.map((d) => <button key={d.m} type="button" className="chip" aria-pressed={!!chosen(d.m)} disabled={!chosen(d.m) && pbs.items.length >= MAX_PROFILE_PBS} onClick={() => toggle(d.m)}>{d.label}</button>)}
            </div>
          </fieldset>
          {pbs.items.map((c) => {
            const d = PROFILE_PB_DISTANCES.find((x) => x.m === c.m)!;
            const b = bests.get(c.m);
            return (
              <div key={c.m} className="pb-choice stack-sm">
                <span className="label">{d.label}</span>
                <div className="row wrap" style={{ gap: 6 }} role="radiogroup" aria-label={`${d.label} time`}>
                  <button type="button" role="radio" className="chip" aria-checked={c.mode === 'ritmo'} aria-pressed={c.mode === 'ritmo'} disabled={!b} onClick={() => setItem(c.m, { mode: 'ritmo' })}>Ritmo best{b ? `: ${duration(Math.round(b.timeS))}` : ''}</button>
                  <button type="button" role="radio" className="chip" aria-checked={c.mode === 'own'} aria-pressed={c.mode === 'own'} onClick={() => setItem(c.m, { mode: 'own' })}>Enter my own</button>
                </div>
                {c.mode === 'ritmo' && b && <span className="caption">{new Date(`${b.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{b.race ? ` · ${b.race}` : ''}{b.within ? ' · fastest stretch of a longer run' : ''}</span>}
                {!b && <span className="caption">No Ritmo time yet at this distance from runs that can be shown. Runs from Strava can't be shown to others (Strava's rules), so enter your own.</span>}
                {c.mode === 'own' && (
                  <div className="row wrap" style={{ gap: 8 }}>
                    <input className="input" style={{ maxWidth: 130 }} aria-label={`${d.label} time`} inputMode="numeric" placeholder="m:ss or h:mm:ss" value={times[c.m] ?? ''} onChange={(e) => setTimes((t) => ({ ...t, [c.m]: e.target.value }))} aria-invalid={badTimes.includes(c.m)} />
                    <input className="input" style={{ flex: 1, minWidth: 140 }} aria-label={`${d.label} race or date (optional)`} placeholder="Race or date (optional)" value={c.race ?? ''} maxLength={60} onChange={(e) => setItem(c.m, { race: e.target.value })} />
                  </div>
                )}
                {badTimes.includes(c.m) && (times[c.m] ?? '') !== '' && <span className="caption" style={{ color: 'var(--danger)' }}>Use m:ss or h:mm:ss, for example 15:38.</span>}
              </div>
            );
          })}
          {faster.map((f) => (
            <div key={f.m} className="banner stack-sm" role="note">
              <p>New best {duration(f.timeS)} at {f.label}{f.race ? ` (${f.race})` : ''}. Update your profile?</p>
              <button className="btn btn-small btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => setItem(f.m, { mode: 'ritmo' })}>Use {duration(f.timeS)}</button>
            </div>
          ))}
          <div className="stack-sm">
            <span className="label">Preview</span>
            {preview ? <PbStrip pbs={preview} /> : <p className="caption">Choose at least one distance with a time.</p>}
          </div>
        </>}
        {!pbs.show && <p className="caption">Off: no PBs are shown on your profile.</p>}
      </section>
    </div>
  );
}
