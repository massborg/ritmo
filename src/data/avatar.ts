// Profile pictures: converted, cropped, resized and re-encoded on the device (which also strips
// location and other metadata), then stored in the user's own private folder in Supabase Storage.
import { supabase } from './supabase';

export const AVATAR_MAX_BYTES = 10 * 1024 * 1024;
export const AVATAR_SIZE = 512;
const BUCKET = 'avatars';
const ACCEPTED = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];

export function avatarFileProblem(f: File): string | undefined {
  const isHeic = /\.(heic|heif)$/i.test(f.name) || /heic|heif/.test(f.type);
  if (!ACCEPTED.includes(f.type) && !isHeic && !/\.(jpe?g|png)$/i.test(f.name)) return 'That file type is not supported. Choose a JPG, PNG or HEIC photo.';
  if (f.size > AVATAR_MAX_BYTES) return 'That photo is larger than 10 MB. Choose a smaller one.';
  return undefined;
}

async function decode(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Decode any accepted file into an image element. Safari and the phone apps open HEIC directly.
 * Elsewhere HEIC is converted on the device; the website's security policy blocks that converter,
 * so in that case the person is asked for a JPG or PNG instead.
 */
export async function loadImage(f: File): Promise<HTMLImageElement> {
  try { return await decode(f); } catch { /* try converting below */ }
  if (/\.(heic|heif)$/i.test(f.name) || /heic|heif/.test(f.type)) {
    try {
      const heic2any = (await import('heic2any')).default as (o: { blob: Blob; toType: string; quality: number }) => Promise<Blob | Blob[]>;
      const out = await heic2any({ blob: f, toType: 'image/jpeg', quality: 0.9 });
      return await decode(Array.isArray(out) ? out[0] : out);
    } catch {
      throw new Error('This browser cannot open HEIC photos. Choose a JPG or PNG, or add the photo from your phone.');
    }
  }
  throw new Error('That photo could not be opened. Try a different one.');
}

export interface Crop { x: number; y: number; scale: number } // x, y: offset in output pixels; scale: zoom over "cover" size

/** Draw the crop to a square canvas and encode as JPEG. Re-encoding drops all EXIF, including GPS. */
export async function renderAvatar(img: HTMLImageElement, crop: Crop, size = AVATAR_SIZE): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  const cover = Math.max(size / img.naturalWidth, size / img.naturalHeight) * crop.scale;
  const w = img.naturalWidth * cover, h = img.naturalHeight * cover;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, (size - w) / 2 + crop.x, (size - h) / 2 + crop.y, w, h);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not prepare the photo.'))), 'image/jpeg', 0.85));
}

export async function uploadAvatar(uid: string, jpeg: Blob): Promise<string> {
  if (!supabase) throw new Error('Accounts are not configured.');
  const path = `${uid}/avatar.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, jpeg, { upsert: true, contentType: 'image/jpeg', cacheControl: '0' });
  if (error) throw new Error(`The photo could not be uploaded. ${error.message}`);
  return path;
}

export async function removeAvatar(path: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`The photo could not be removed. ${error.message}`);
}

/** Private bucket: a short-lived signed link, only for the owner's own session. */
export async function avatarUrl(path: string): Promise<string | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return error ? undefined : data.signedUrl;
}

/** For data export: the picture as a data URL. */
export async function avatarDataUrl(path: string): Promise<string | undefined> {
  const url = await avatarUrl(path);
  if (!url) return undefined;
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(blob); });
  } catch { return undefined; }
}
