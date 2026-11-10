// "Post to Hub": share one run, choosing who sees it and whether the route and heart rate show.
// Only after the runner has turned on sharing. Nothing is ever posted automatically.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { createPost, shareableRoute, type Visibility, defaultPostTitle } from '../data/hub';
import { Chips, Sheet } from './inputs';
import { StatusLine } from './ui';
import { TYPE_LABEL } from '../training/analysis';
import { garminAttribution } from '../data/garmin';
import type { Activity, SessionType } from '../lib/types';

export function PostToHub({ run, type, badges, compliance, onClose }: { run: Activity; type: SessionType; badges: string[]; compliance?: string; onClose: () => void }) {
  const { session } = useApp();
  const [title, setTitle] = useState(defaultPostTitle(run.startTime));
  const [body, setBody] = useState('');
  const [vis, setVis] = useState<Visibility>('followers');
  const [map, setMap] = useState(true);
  const [hr, setHr] = useState(true);
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [err, setErr] = useState<string>();
  const route = run.streams ? shareableRoute(run.streams) : null;
  const post = async () => {
    setState('busy'); setErr(undefined);
    try {
      await createPost({
        id: crypto.randomUUID(), user_id: session!.user.id, activity_id: run.id, title: title.trim(), body: body.trim() || null, visibility: vis,
        show_map: map && !!route, show_hr: hr, route: map ? route : null, city: null,
        stats: { startedAt: run.startTime, device: postDevice(run), distanceM: run.distanceM, movingS: run.movingS, paceS: run.movingS / (run.distanceM / 1000), elevGainM: run.elevGainM, avgHr: hr ? run.avgHr : undefined, type, typeLabel: TYPE_LABEL[type], badges, compliance },
      });
      setState('done');
    } catch (e) { setErr((e as Error).message); setState('idle'); }
  };
  return (
    <Sheet open onClose={onClose} title="Post to Hub"
      footer={state === 'done' ? <Link to="/hub" className="btn btn-primary btn-block" onClick={onClose}>See it on the Hub</Link>
        : <button className="btn btn-primary btn-block" disabled={!title.trim() || state === 'busy'} onClick={post}>{state === 'busy' ? 'Posting…' : 'Post'}</button>}>
      {state === 'done' ? <StatusLine kind="success">Posted.</StatusLine> : <>
        <div className="field"><label htmlFor="ph-title">Title</label><input id="ph-title" className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="field"><label htmlFor="ph-body">Description (optional)</label><textarea id="ph-body" className="input" value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} /></div>
        <Chips<Visibility> label="Who can see it?" value={vis} onChange={setVis} options={[{ value: 'followers', label: 'Followers' }, { value: 'everyone', label: 'Everyone' }, { value: 'only_me', label: 'Only me' }]} />
        <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={map && !!route} disabled={!route} onChange={(e) => setMap(e.target.checked)} /> Show the route{route ? ' (start and finish hidden)' : ' (no GPS route for this run)'}</label>
        <label className="row" style={{ gap: 8, minHeight: 44 }}><input type="checkbox" checked={hr} onChange={(e) => setHr(e.target.checked)} /> Show heart rate</label>
        <p className="caption">How the run felt, pain and notes are never shared.</p>
        {err && <StatusLine kind="danger">{err}</StatusLine>}
      </>}
    </Sheet>
  );
}

/** What recorded the run, for the post header ("Garmin Forerunner 965", "Ritmo") */
function postDevice(run: Activity): string | undefined {
  return garminAttribution(run) ?? run.device ?? (run.source === 'ritmo_gps' ? 'Ritmo' : undefined);
}
