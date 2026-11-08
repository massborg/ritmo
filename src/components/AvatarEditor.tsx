// Profile picture: take or choose a photo, crop it to a circle with a live preview, then save.
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Camera, ImagePlus, Trash2 } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Sheet } from './inputs';
import { StatusLine } from './ui';
import { avatarFileProblem, loadImage, renderAvatar, type Crop } from '../data/avatar';

const VIEW = 260; // crop window size in CSS pixels

export function AvatarImage({ size = 44, label }: { size?: number; label?: string }) {
  const { data, session, avatarSrc } = useApp();
  const initial = (data.profile.name || session?.user.email || 'R').trim()[0]?.toUpperCase() ?? 'R';
  return avatarSrc
    ? <img src={avatarSrc} alt={label ?? 'Your profile picture'} width={size} height={size} className="avatar-img" style={{ width: size, height: size }} />
    : <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-label={label ?? 'Your initial'}>{initial}</span>;
}

export function AvatarEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { saveAvatar, deleteAvatar, data } = useApp();
  const [img, setImg] = useState<HTMLImageElement>();
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0, scale: 1 });
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string>();
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | undefined>(undefined);

  useEffect(() => { if (!open) { setImg(undefined); setErr(undefined); setPreview(undefined); setCrop({ x: 0, y: 0, scale: 1 }); } }, [open]);
  // live preview of the saved result
  useEffect(() => {
    if (!img) return;
    let url: string | undefined;
    const t = setTimeout(async () => { const b = await renderAvatar(img, { ...crop, x: crop.x * (128 / VIEW), y: crop.y * (128 / VIEW) }, 128); url = URL.createObjectURL(b); setPreview(url); }, 60);
    return () => { clearTimeout(t); if (url) URL.revokeObjectURL(url); };
  }, [img, crop]);

  // Cleared after each pick, so choosing the same photo again still works
  const onInput = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; void onFile(f); };
  const onFile = async (f?: File) => {
    setErr(undefined);
    if (!f) return;
    const problem = avatarFileProblem(f);
    if (problem) { setErr(problem); return; }
    try { setBusy(true); setImg(await loadImage(f)); setCrop({ x: 0, y: 0, scale: 1 }); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  const cover = img ? Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight) * crop.scale : 1;
  const save = async () => {
    if (!img) return;
    setBusy(true); setErr(undefined);
    try {
      const k = 512 / VIEW;
      const blob = await renderAvatar(img, { x: crop.x * k, y: crop.y * k, scale: crop.scale });
      await saveAvatar(blob);
      onClose();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Profile picture"
      footer={img
        ? <div className="row"><button className="btn btn-ghost" onClick={() => setImg(undefined)}>Choose another</button><button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save picture'}</button></div>
        : null}>
      {!img ? (
        <div className="stack">
          <p className="muted">Optional. Your picture is private to you for now, and is never sent to the AI coach or analytics tools. Location and other details stored in the photo are removed before upload.</p>
          <div className="row wrap">
            {/* The browser's own file controls, styled as buttons: Safari on iPhone can ignore a hidden picker opened from code */}
            <label className={`btn btn-primary file-btn${busy ? ' is-disabled' : ''}`}>
              <input type="file" accept="image/*" capture="user" className="sr-only" disabled={busy} onChange={onInput} />
              <Camera size={18} strokeWidth={2} aria-hidden="true" />Take a photo
            </label>
            <label className={`btn file-btn${busy ? ' is-disabled' : ''}`}>
              <input type="file" accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif" className="sr-only" disabled={busy} onChange={onInput} />
              <ImagePlus size={18} strokeWidth={2} aria-hidden="true" />Choose a photo
            </label>
          </div>
          <p className="caption">JPG, PNG or HEIC, up to 10 MB.</p>
          {data.profile.avatar && (
            <button className="btn btn-danger" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={async () => { setBusy(true); try { await deleteAvatar(); onClose(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }}>
              <Trash2 size={18} strokeWidth={2} aria-hidden="true" />Remove picture
            </button>
          )}
        </div>
      ) : (
        <div className="stack" style={{ alignItems: 'center' }}>
          <div className="crop-view" style={{ width: VIEW, height: VIEW }}
            onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, cx: crop.x, cy: crop.y }; }}
            onPointerMove={(e) => { if (!drag.current) return; setCrop((c) => ({ ...c, x: drag.current!.cx + e.clientX - drag.current!.x, y: drag.current!.cy + e.clientY - drag.current!.y })); }}
            onPointerUp={() => { drag.current = undefined; }}
            role="img" aria-label="Drag to position your photo inside the circle">
            <img src={img.src} alt="" draggable={false} style={{ width: img.naturalWidth * cover, height: img.naturalHeight * cover, transform: `translate(calc(-50% + ${crop.x}px), calc(-50% + ${crop.y}px))` }} />
            <span className="crop-mask" aria-hidden="true" />
          </div>
          <div className="field" style={{ width: VIEW }}>
            <label htmlFor="zoom">Zoom</label>
            <input id="zoom" type="range" min={1} max={3} step={0.01} value={crop.scale} onChange={(e) => setCrop((c) => ({ ...c, scale: Number(e.target.value) }))} style={{ accentColor: 'var(--brand)', minHeight: 44 }} />
          </div>
          <div className="row" style={{ gap: 'var(--s3)' }}>
            {preview && <img src={preview} alt="Preview of your picture" width={64} height={64} className="avatar-img" />}
            <span className="caption">Preview. Drag the photo to move it, and use the slider to zoom.</span>
          </div>
        </div>
      )}
      {err && <div role="alert"><StatusLine kind="danger">{err}</StatusLine></div>}
    </Sheet>
  );
}
