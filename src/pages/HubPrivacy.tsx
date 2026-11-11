// Profile › Hub and privacy (update 2, §6 and §7): automatic posting, who sees posts, map privacy and the photo.
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { AppHeader } from '../components/app';
import { Chips } from '../components/inputs';
import type { HubPrefs } from '../lib/types';
import { autoPostOn, DEFAULT_TRIM_M } from '../training/autopost';
import { PhotoVisibility } from '../components/PhotoVisibility';

type Audience = NonNullable<HubPrefs['audience']>;
const AUDIENCE: { value: Audience; label: string }[] = [{ value: 'everyone', label: 'Everyone' }, { value: 'followers', label: 'Followers' }, { value: 'only_me', label: 'Only me' }];

export default function HubPrivacy() {
  const { data, updateProfile } = useApp();
  const p = data.profile;
  const h = p.hub ?? {};
  const set = (patch: Partial<HubPrefs>) => updateProfile({ hub: { ...h, ...patch } });
  const joined = !!p.consents?.hubSharing?.granted;
  const auto = autoPostOn(p);
  const U = p.units;
  return (
    <div className="stack-lg">
      <AppHeader title="Hub and privacy" back />
      {!joined && <div className="banner" role="note"><p>You haven't joined the Hub yet, so nothing is shared. These settings apply once you do. <Link to="/hub" className="label">Open the Hub</Link></p></div>}

      <section className="card stack" aria-labelledby="hp-post">
        <h2 id="hp-post" className="title">Posting runs</h2>
        <label className="row-between" style={{ gap: 12, minHeight: 44 }}>
          <span><span className="label">Post my runs to the Hub automatically</span><span className="caption" style={{ display: 'block' }}>Runs you record in Ritmo, upload, log by hand or sync from Health or Garmin. Runs from Strava are never posted: Strava's rules keep them private to you.</span></span>
          <input type="checkbox" style={{ width: 24, height: 24, flex: "none" }} checked={auto} onChange={(e) => set({ autoPost: e.target.checked, autoSince: e.target.checked ? new Date().toISOString() : h.autoSince })} />
        </label>
        <Chips<Audience> label="Who sees your posts" value={h.audience ?? 'followers'} onChange={(audience) => set({ audience })} options={AUDIENCE} />
        <p className="caption">You can change who sees any one run, or hide it, from that run's ⋯ menu.</p>
        {auto && <>
          <label className="row" style={{ gap: 10, minHeight: 44 }}><input type="checkbox" checked={!!h.skipRaces} onChange={(e) => set({ skipRaces: e.target.checked })} /> Don't post races automatically</label>
          <Chips<number> label={`Don't post runs shorter than`} value={h.skipUnderKm ?? 0} onChange={(skipUnderKm) => set({ skipUnderKm })}
            options={[{ value: 0, label: 'Post all' }, { value: 3, label: U === 'mi' ? '2 mi' : '3 km' }, { value: 5, label: U === 'mi' ? '3 mi' : '5 km' }]} />
        </>}
      </section>

      <section className="card stack" aria-labelledby="hp-map">
        <h2 id="hp-map" className="title">Map privacy</h2>
        <Chips<number> label="Hide the start and finish of maps" value={h.trimM ?? DEFAULT_TRIM_M} onChange={(trimM) => set({ trimM })}
          options={[200, 300, 400, 500].map((m) => ({ value: m, label: `${m} m` }))} />
        <p className="caption">The first and last part of every route you post is left off, so where you start and finish, such as your home, isn't shown.</p>
      </section>

      <section className="card stack" aria-labelledby="hp-photo">
        <h2 id="hp-photo" className="title">Your photo</h2>
        <PhotoVisibility />
      </section>

      <p className="caption">How a run felt, pain, notes and body check-ins are never shared. <Link to="/profile/privacy" className="label">Privacy and your data</Link></p>
    </div>
  );
}
