// "Who can see your photo: Everyone · Followers · Only me" (update 2, §7), on Profile and in Hub and privacy.
import { useApp } from '../app/AppContext';
import { Chips } from './inputs';
import type { Profile } from '../lib/types';

type V = NonNullable<Profile['photoVisibility']>;
const OPTIONS: { value: V; label: string }[] = [{ value: 'everyone', label: 'Everyone' }, { value: 'followers', label: 'Followers' }, { value: 'only_me', label: 'Only me' }];

/** "Who can see your photo: Everyone · Followers · Only me" (Everyone by default) */
export function PhotoVisibility() {
  const { data, updateProfile } = useApp();
  const v = data.profile.photoVisibility ?? 'everyone';
  return (
    <div className="stack-sm">
      <Chips<V> label="Who can see your photo" value={v} onChange={(photoVisibility) => updateProfile({ photoVisibility })} options={OPTIONS} />
      <p className="caption">{v === 'everyone' ? 'Shown next to your name on the Hub: your posts, comments and in search.' : v === 'followers' ? 'Only runners who follow you see it. Everyone else sees your initials.' : 'Only you see it. Everyone else sees your initials.'}</p>
    </div>
  );
}
