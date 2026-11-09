// Photos of the runner's own shoes: resized and re-encoded on the device (which strips location and other hidden
// details), then stored privately next to the profile picture, in the runner's own folder. Deleting the account
// removes them with the rest of that folder.
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { avatarFileProblem, loadImage } from './avatar';

const BUCKET = 'avatars';
const W = 800, H = 500; // landscape, like a shoe photographed from the side

export const shoePhotoProblem = avatarFileProblem;

/** Fit the photo into a landscape frame (cover, centred) and encode as JPEG */
export async function prepareShoePhoto(f: File): Promise<Blob> {
  const img = await loadImage(f);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not prepare the photo.'))), 'image/jpeg', 0.82));
}

export async function uploadShoePhoto(uid: string, shoeId: string, jpeg: Blob): Promise<string> {
  if (!supabase) throw new Error('Accounts are not configured.');
  const path = `${uid}/shoe-${shoeId}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, jpeg, { upsert: true, contentType: 'image/jpeg', cacheControl: '0' });
  if (error) throw new Error(`The photo could not be uploaded. ${error.message}`);
  return path;
}

export async function removeShoePhoto(path: string): Promise<void> {
  if (!supabase) return;
  await supabase.storage.from(BUCKET).remove([path]);
}

/** A short-lived private link to show the photo (only the owner's session can make one) */
export function useShoePhoto(path?: string): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let live = true;
    setUrl(undefined);
    if (!path || !supabase) return;
    supabase.storage.from(BUCKET).createSignedUrl(path, 3600).then(({ data }) => { if (live) setUrl(data?.signedUrl); });
    return () => { live = false; };
  }, [path]);
  return url;
}
