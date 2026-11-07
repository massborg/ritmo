// Share a run as an image: swipe through templates, see a live preview, customise, then share to Instagram,
// WhatsApp and others (the phone's share sheet), download a PNG, or copy it. Behind the "share_cards" flag.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Download, Share2 } from 'lucide-react';
import { Chips, Sheet } from './inputs';
import { StatusLine } from './ui';
import { drawCard, SIZES, TEMPLATE_LABEL, toPng, type CardData, type CardOpts, type Size, type Template, type Theme } from '../share/cards';

const TEMPLATES: Template[] = ['route', 'stats', 'splits', 'sticker', 'photo', 'pb'];

export function ShareSheet({ data, onClose }: { data: CardData; onClose: () => void }) {
  const available = TEMPLATES.filter((t) => (t === 'route' || t === 'sticker' ? !!data.route?.length : t === 'splits' ? (data.splits?.length ?? 0) >= 2 : t === 'pb' ? !!data.pb : true));
  const [i, setI] = useState(0);
  const [size, setSize] = useState<Size>('story');
  const [theme, setTheme] = useState<Theme>('dark');
  const [show, setShow] = useState<CardOpts['show']>({ distance: true, time: true, pace: true, hr: false, climb: false, cadence: false });
  const [map, setMap] = useState(true);
  const [title, setTitle] = useState(data.title);
  const [photo, setPhoto] = useState<HTMLImageElement>();
  const [msg, setMsg] = useState<string>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const template = available[Math.min(i, available.length - 1)];
  const opts = useMemo<CardOpts>(() => ({ template, size, theme, show, map, routeColour: theme === 'orange' ? '#1E1A17' : theme === 'light' ? '#E8480C' : '#FF6A2B', photo }), [template, size, theme, show, map, photo]);
  useEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => { if (live && canvas.current) drawCard(canvas.current, { ...data, title }, opts); });
    return () => { live = false; };
  }, [data, title, opts]);

  const name = `ritmo-${template}-${size}.png`;
  const share = async () => {
    const file = await toPng(canvas.current!, name);
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) { try { await nav.share({ files: [file], title: data.title }); } catch { /* cancelled */ } }
    else { download(file); setMsg('Sharing images is not supported here, so it was downloaded instead.'); }
  };
  const download = (file?: File) => {
    const go = (f: File) => { const url = URL.createObjectURL(f); const a = document.createElement('a'); a.href = url; a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    if (file) go(file); else void toPng(canvas.current!, name).then(go);
  };
  const copy = async () => {
    try { const f = await toPng(canvas.current!, name); await navigator.clipboard.write([new ClipboardItem({ 'image/png': f })]); setMsg('Copied.'); }
    catch { setMsg('Copying images is not supported here. Use Download instead.'); }
  };
  const [w, h] = SIZES[size];

  return (
    <Sheet open onClose={onClose} title="Share your run"
      footer={<div className="row wrap" style={{ gap: 8, width: '100%' }}>
        <button className="btn btn-primary" onClick={share}><Share2 size={18} strokeWidth={2} aria-hidden="true" />Share</button>
        <button className="btn" onClick={() => download()}><Download size={18} strokeWidth={2} aria-hidden="true" />Download</button>
        <button className="btn btn-ghost" onClick={copy}><Copy size={18} strokeWidth={2} aria-hidden="true" />Copy</button>
      </div>}>
      <div className="row-between">
        <button className="icon-btn" aria-label="Previous template" onClick={() => setI((x) => (x - 1 + available.length) % available.length)}><ChevronLeft size={22} /></button>
        <span className="label" aria-live="polite">{TEMPLATE_LABEL[template]} · {i % available.length + 1} of {available.length}</span>
        <button className="icon-btn" aria-label="Next template" onClick={() => setI((x) => (x + 1) % available.length)}><ChevronRight size={22} /></button>
      </div>
      <div className={`share-preview${template === 'sticker' ? ' checker' : ''}`} style={{ aspectRatio: `${w} / ${h}` }}
        onTouchStart={(e) => { (e.currentTarget as HTMLElement).dataset.x = String(e.touches[0].clientX); }}
        onTouchEnd={(e) => { const x0 = Number((e.currentTarget as HTMLElement).dataset.x); const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) setI((x) => (x + (dx < 0 ? 1 : -1) + available.length) % available.length); }}>
        <canvas ref={canvas} role="img" aria-label={`${TEMPLATE_LABEL[template]} share image preview`} />
      </div>
      <Chips<Size> label="Size" value={size} onChange={setSize} options={[{ value: 'story', label: 'Story' }, { value: 'post', label: 'Post' }, { value: 'square', label: 'Square' }]} />
      {template !== 'sticker' && template !== 'photo' && <Chips<Theme> label="Theme" value={theme} onChange={setTheme} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'orange', label: 'Orange' }]} />}
      <fieldset className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 6 }}>Show</legend>
        <div className="row wrap">{(['distance', 'time', 'pace', 'hr', 'climb', 'cadence'] as const).map((k) => (
          <button key={k} type="button" className="chip" aria-pressed={show[k]} onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}>{k === 'hr' ? 'Heart rate' : k[0].toUpperCase() + k.slice(1)}</button>
        ))}{data.route?.length ? <button type="button" className="chip" aria-pressed={map} onClick={() => setMap((m) => !m)}>Route</button> : null}</div>
      </fieldset>
      <div className="field"><label htmlFor="sh-title">Title</label><input id="sh-title" className="input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} /></div>
      {template === 'photo' && <div className="field"><label htmlFor="sh-photo">Photo</label><input id="sh-photo" type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const img = new Image(); img.onload = () => setPhoto(img); img.src = URL.createObjectURL(f); }} /></div>}
      <p className="caption">Your route leaves out the start and finish, so your home is not shown.</p>
      {msg && <StatusLine kind="info">{msg}</StatusLine>}
    </Sheet>
  );
}
