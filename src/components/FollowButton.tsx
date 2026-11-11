// One follow button for another runner that always shows the real state (update 2, §10):
// Follow (brand) · Requested (outline, tap to cancel) · Following (outline, tap to unfollow, confirmed) · Follow back (graphite)
import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Sheet } from './inputs';
import * as hub from '../data/hub';

export type FollowState = 'none' | 'requested' | 'following' | 'follow_back';
/** The one button state for another runner, from both directions of following */
export function followState(uid: string, other: string, follows: hub.Follow[]): FollowState {
  const mine = follows.find((f) => f.follower_id === uid && f.followee_id === other);
  if (mine) return mine.status === 'accepted' ? 'following' : 'requested';
  return follows.some((f) => f.follower_id === other && f.followee_id === uid && f.status === 'accepted') ? 'follow_back' : 'none';
}

/** Follow (brand) · Requested (outline, tap to cancel) · Following (outline, tap to unfollow, confirmed) · Follow back (graphite) */
export function FollowStateButton({ other, name, follows, onChange }: { other: string; name: string; follows: hub.Follow[]; onChange: () => void }) {
  const { session } = useApp();
  const uid = session!.user.id;
  const real = followState(uid, other, follows);
  // Shown straight away after a tap, until the refreshed follows confirm it (a public profile accepts at once)
  const [shown, setShown] = useState<{ from: FollowState; to: FollowState }>();
  const state = shown && shown.from === real ? shown.to : real;
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string>();
  if (other === uid) return null;
  const theyFollow = follows.some((f) => f.follower_id === other && f.followee_id === uid && f.status === 'accepted');
  const run = async (f: () => Promise<void>, to: FollowState) => { setBusy(true); setErr(undefined); try { await f(); setShown({ from: real, to }); onChange(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const doFollow = () => run(() => hub.follow(uid, other), 'requested');
  const doUnfollow = () => run(() => hub.unfollow(uid, other), theyFollow ? 'follow_back' : 'none');
  const btn = state === 'following' ? <button className="btn btn-small follow-btn" disabled={busy} onClick={() => setConfirm(true)}>Following</button>
    : state === 'requested' ? <button className="btn btn-small follow-btn" disabled={busy} aria-label={`Requested. Cancel your request to follow ${name}`} onClick={() => void doUnfollow()}>Requested</button>
    : state === 'follow_back' ? <button className="btn btn-small follow-btn btn-graphite" disabled={busy} onClick={() => void doFollow()}>Follow back</button>
    : <button className="btn btn-small follow-btn btn-primary" disabled={busy} onClick={() => void doFollow()}><UserPlus size={16} strokeWidth={2} aria-hidden="true" />Follow</button>;
  return (
    <>
      {btn}
      {err && <span className="sr-only" role="alert">{err}</span>}
      {confirm && (
        <Sheet open onClose={() => setConfirm(false)} title={`Unfollow ${name}?`}
          footer={<div className="row" style={{ gap: 8 }}><button className="btn btn-block" onClick={() => setConfirm(false)}>Cancel</button><button className="btn btn-block btn-danger" onClick={() => { setConfirm(false); void doUnfollow(); }}>Unfollow</button></div>}>
          <p>You will stop seeing their runs in your feed. You can follow them again at any time.</p>
        </Sheet>
      )}
    </>
  );
}
