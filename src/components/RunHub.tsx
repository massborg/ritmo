// A run and the Hub (update 2, §6): its post (hide it, or change who sees it), and for a Strava run, the legitimate
// way to share it: upload the original file from Garmin Connect, which becomes the run's source.
import { useCallback, useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { useApp } from '../app/AppContext';
import * as hub from '../data/hub';
import type { Post, Visibility } from '../data/hub';
import { Chips, Sheet } from './inputs';
import { StatusLine } from './ui';
import type { Activity } from '../lib/types';

/** The runner's post for this run, if there is one (undefined while loading or when not on the Hub) */
export function useRunPost(run: Activity | undefined) {
  const { session, data, hasFlag } = useApp();
  const uid = session?.user.id;
  const joined = data.mode === 'real' && hasFlag('hub') && !!data.profile.consents?.hubSharing?.granted;
  const [post, setPost] = useState<Post | null>();
  const id = run?.id;
  const reload = useCallback(async () => {
    if (!uid || !id || !joined) { setPost(null); return; }
    setPost((await hub.postsForRuns(uid, [id]).catch(() => new Map<string, Post>())).get(id) ?? null);
  }, [uid, id, joined]);
  useEffect(() => { void reload(); }, [reload]);
  // Automatic posting happens a few seconds after a run arrives: look again shortly after opening a new run
  useEffect(() => { if (post !== null) return; const t = setTimeout(() => void reload(), 4000); return () => clearTimeout(t); }, [post, reload]);
  return { post, reload, joined };
}

const AUDIENCE: { value: Visibility; label: string }[] = [{ value: 'everyone', label: 'Everyone' }, { value: 'followers', label: 'Followers' }, { value: 'only_me', label: 'Only me' }];

export function AudienceSheet({ post, onClose, onChanged }: { post: Post; onClose: () => void; onChanged: () => void }) {
  const [v, setV] = useState<Visibility>(post.visibility);
  const [err, setErr] = useState<string>();
  const save = async () => { try { await hub.setPostVisibility(post.id, v); onChanged(); onClose(); } catch (e) { setErr((e as Error).message); } };
  return (
    <Sheet open onClose={onClose} title="Who sees this run on the Hub" footer={<button className="btn btn-primary btn-block" onClick={() => void save()}>Save</button>}>
      <Chips<Visibility> label="Audience" value={v} onChange={setV} options={AUDIENCE} />
      <p className="caption">{v === 'only_me' ? 'Hidden from the Hub: only you see it.' : v === 'followers' ? 'Runners who follow you see it in their feed.' : 'Anyone on the Hub can see it.'}</p>
      {err && <StatusLine kind="danger">{err}</StatusLine>}
    </Sheet>
  );
}

/** "Share this run: upload the original file from Garmin Connect" */
export function StravaShareGuide({ run, onClose }: { run: Activity; onClose: () => void }) {
  const { importFiles, importState, data, updateProfile } = useApp();
  const [picked, setPicked] = useState(false);
  const shared = picked && !importState.running && run.source !== 'strava';
  const noMatch = picked && !importState.running && run.source === 'strava' && (importState.result || importState.error);
  const pick = async (f?: File) => {
    if (!f) return;
    const h = data.profile.hub ?? {};
    updateProfile({ hub: { ...h, shareIds: [...new Set([...(h.shareIds ?? []), run.id])] } });
    setPicked(true);
    await importFiles([f]);
  };
  return (
    <Sheet open onClose={onClose} title="Share this run">
      <div className="stack">
        {shared ? <StatusLine kind="success">Done. The file is now this run's source, so it can go on the Hub. It will be posted in a moment, to your usual audience.</StatusLine> : <>
          <p>Strava's rules don't let apps show your Strava runs to anyone else. The original file from your watch isn't covered by that, so you can share the run with it.</p>
          <ol className="steps-list">
            <li>On a computer, open <strong>connect.garmin.com</strong> and find this run ({new Date(run.startTime).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}).</li>
            <li>Open the ⚙ menu on the run and choose <strong>Export Original</strong>. You get a ZIP file.</li>
            <li>Upload it here. The ZIP is fine; Ritmo finds the run in it.</li>
          </ol>
          <label className={`btn btn-primary file-btn${importState.running ? ' is-disabled' : ''}`} style={{ alignSelf: 'flex-start' }}>
            <input type="file" accept=".fit,.gpx,.tcx,.zip" className="sr-only" disabled={importState.running} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
            <Upload size={18} strokeWidth={2} aria-hidden="true" />{importState.running ? 'Reading the file…' : 'Upload the original file'}
          </label>
          {noMatch && <StatusLine kind="warning">That file doesn't look like this run (different time or distance). Check it's the same run and try again.</StatusLine>}
          <p className="caption">Other watches work too: export the original FIT, GPX or TCX file from your watch's app. Once Apple Health, Health Connect or Garmin is connected, runs from there are used instead of Strava's copy automatically.</p>
        </>}
      </div>
    </Sheet>
  );
}
