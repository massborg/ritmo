// A runner's photo wherever they appear on the Hub (posts, comments, Fuego, search, clubs, leaderboards,
// notifications). The small copy is used; initials only when there is no photo or its owner keeps it to themselves.
import { useEffect, useState } from 'react';
import { photoUrl, type HubProfile } from '../data/hub';

export const initials = (n?: string) => (n ?? '?').split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase() || '?';

export function RunnerAvatar({ id, profile, name, size = 'md' }: { id: string; profile?: Pick<HubProfile, 'photo_path' | 'display_name'>; name?: string; size?: 'xs' | 'md' | 'lg' }) {
  // A profile that is known to have no photo is not asked for; otherwise the small copy's fixed path is tried, and
  // the storage rules decide whether this viewer may see it
  const path = profile ? profile.photo_path ?? undefined : `${id}/avatar-small.jpg`;
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setUrl(undefined); setFailed(false);
    if (path) void photoUrl(path).then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [path]);
  const cls = `hub-avatar${size === 'xs' ? ' hub-avatar-xs' : size === 'lg' ? ' hub-avatar-lg' : ''}`;
  const label = name ?? profile?.display_name;
  return url && !failed
    ? <img className={`${cls} hub-avatar-img`} src={url} alt="" aria-hidden="true" loading="lazy" decoding="async" onError={() => setFailed(true)} />
    : <span className={cls} aria-hidden="true">{initials(label)}</span>;
}
