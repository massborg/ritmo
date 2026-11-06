// Screenshots of a run's laps (up to 10): choose, drop or paste them, reorder, remove, view full size, then let
// Ritmo read the lap table. The result is never saved silently: it fills the rep table for the runner to check.
// Screenshots are private (the runner's own folder in run-media).
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, X } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { supabase } from '../data/supabase';
import { mapLaps, type ReadLap } from '../training/laps';
import { Sheet } from './inputs';
import { StatusLine } from './ui';
import type { PlannedSession } from '../lib/types';
import type { RepRow } from './LogSession';

const MAX = 10;

interface Shot { file: Blob; url: string; name: string }

/** Large photos are scaled down to 2000 px on the long side before upload (screens stay sharp, files stay small). */
async function shrink(file: File): Promise<Blob> {
  if (file.size < 1.5e6) return file;
  const img = await createImageBitmap(file);
  const k = Math.min(1, 2000 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.9));
}

export function ScreenshotReader({ session, onRows, onUploaded }: { session: PlannedSession; onRows: (rows: RepRow[], totals?: { timeS?: number; distanceM?: number; avgHr?: number }) => void; onUploaded?: (paths: string[]) => void }) {
  const { session: auth } = useApp();
  const [shots, setShots] = useState<Shot[]>([]);
  const [view, setView] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'info' | 'warning' | 'danger'; text: string }>();
  const box = useRef<HTMLDivElement>(null);

  const add = async (files: File[]) => {
    const imgs = files.filter((f) => /^image\/(png|jpe?g|webp|heic)/.test(f.type));
    if (!imgs.length) return;
    const room = MAX - shots.length;
    if (imgs.length > room) setMsg({ kind: 'warning', text: `Up to ${MAX} screenshots per run. The first ${room} were added.` });
    const next = await Promise.all(imgs.slice(0, room).map(async (f) => { const b = await shrink(f); return { file: b, url: URL.createObjectURL(b), name: f.name }; }));
    setShots((s) => [...s, ...next]);
  };
  // Paste from the clipboard anywhere in the sheet
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => { const files = [...(e.clipboardData?.files ?? [])]; if (files.length) { e.preventDefault(); void add(files); } };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });
  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (i: number, d: -1 | 1) => setShots((s) => { const a = [...s]; const j = i + d; if (j < 0 || j >= a.length) return s; [a[i], a[j]] = [a[j], a[i]]; return a; });
  const remove = (i: number) => setShots((s) => { URL.revokeObjectURL(s[i].url); return s.filter((_, j) => j !== i); });

  const read = async () => {
    if (!supabase || !auth) return;
    setBusy(true); setMsg(undefined);
    try {
      const stamp = Date.now();
      const paths: string[] = [];
      for (let i = 0; i < shots.length; i++) {
        const ext = shots[i].file.type === 'image/png' ? 'png' : shots[i].file.type === 'image/webp' ? 'webp' : 'jpg';
        const path = `${auth.user.id}/${session.id}/${stamp}-${i + 1}.${ext}`;
        const up = await supabase.storage.from('run-media').upload(path, shots[i].file, { contentType: shots[i].file.type || 'image/jpeg', upsert: true });
        if (up.error) throw up.error;
        paths.push(path);
      }
      onUploaded?.(paths);
      const { data, error } = await supabase.functions.invoke('read-laps', { body: { paths } });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        let code: string | undefined;
        try { code = ((await ctx?.clone().json()) as { error?: string } | undefined)?.error; } catch { /* not JSON */ }
        setMsg(code === 'not_configured'
          ? { kind: 'info', text: 'Reading laps from screenshots is not set up yet. Your screenshots are saved with this run; type the laps under Enter manually.' }
          : ctx?.status === 429 ? { kind: 'warning', text: 'You have read a lot of screenshots today (30 a day). Type the laps under Enter manually, or try again tomorrow.' }
          : { kind: 'danger', text: 'Ritmo could not read these screenshots. Check they show the lap table, or type the laps under Enter manually.' });
        return;
      }
      const res = data as { laps: ReadLap[]; totals?: { distance_m: number | null; time_s: number | null; avg_hr: number | null } };
      if (!res.laps?.length) { setMsg({ kind: 'warning', text: 'No lap table was found in these screenshots.' }); return; }
      const rows = mapLaps(res.laps).map((r) => ({
        label: r.label, kind: r.kind, distanceM: r.distanceM,
        time: r.timeS ? `${Math.floor(r.timeS / 60)}:${String(Math.round(r.timeS % 60)).padStart(2, '0')}` : '', hr: r.avgHr ? String(Math.round(r.avgHr)) : '', unsure: r.unsure,
      }));
      onRows(rows, { timeS: res.totals?.time_s ?? undefined, distanceM: res.totals?.distance_m ?? undefined, avgHr: res.totals?.avg_hr ?? undefined });
    } catch (e) {
      setMsg({ kind: 'danger', text: `The screenshots could not be uploaded: ${(e as Error).message ?? e}` });
    } finally { setBusy(false); }
  };

  return (
    <div className="stack" ref={box}>
      <label className="drop-zone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void add([...e.dataTransfer.files]); }}>
        <ImagePlus size={24} strokeWidth={2} aria-hidden="true" />
        <span className="label">Add screenshots of your laps</span>
        <span className="caption">Choose, drop or paste up to {MAX}. Garmin Connect, Strava, COROS, Apple Fitness and Polar all work.</span>
        <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void add([...(e.target.files ?? [])]); e.target.value = ''; }} />
      </label>
      {shots.length > 0 && (
        <ol className="shot-grid" aria-label="Screenshots, in order">
          {shots.map((s, i) => (
            <li key={s.url} className="shot">
              <button type="button" className="shot-img" onClick={() => setView(i)} aria-label={`View screenshot ${i + 1} full size`}><img src={s.url} alt={`Screenshot ${i + 1}`} /></button>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <button type="button" className="icon-btn" aria-label={`Move screenshot ${i + 1} earlier`} disabled={i === 0} onClick={() => move(i, -1)}><ChevronLeft size={18} /></button>
                <button type="button" className="icon-btn" aria-label={`Remove screenshot ${i + 1}`} onClick={() => remove(i)}><X size={18} /></button>
                <button type="button" className="icon-btn" aria-label={`Move screenshot ${i + 1} later`} disabled={i === shots.length - 1} onClick={() => move(i, 1)}><ChevronRight size={18} /></button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {shots.length > 0 && <button type="button" className="btn btn-primary" disabled={busy} onClick={read}>{busy ? 'Reading your laps…' : 'Read the laps'}</button>}
      {msg && <div role="status"><StatusLine kind={msg.kind === 'danger' ? 'danger' : msg.kind === 'warning' ? 'warning' : 'info'}>{msg.text}</StatusLine></div>}
      <p className="caption">Screenshots are private: only you can see them. You check and edit every lap before anything is saved.</p>
      <Sheet open={view !== undefined} onClose={() => setView(undefined)} title={view !== undefined ? `Screenshot ${view + 1} of ${shots.length}` : ''}>
        {view !== undefined && shots[view] && <img src={shots[view].url} alt={`Screenshot ${view + 1}, full size`} style={{ width: '100%', borderRadius: 'var(--r-input)' }} />}
      </Sheet>
    </div>
  );
}
