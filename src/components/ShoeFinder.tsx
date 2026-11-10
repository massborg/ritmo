// Find your shoes (instead of typing a name): search by brand or model, filter by brand, pick the model, then its
// colour, and the rest fills itself in (what they are for, when to retire them). A shoe that is not listed can still
// be added by name. The picture is Ritmo's own drawing in the shoe's colour, not a product photo.
import { useMemo, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Search, Trash2 } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { StatusLine } from './ui';
import { prepareShoePhoto, removeShoePhoto, shoePhotoProblem, uploadShoePhoto, useShoePhoto } from '../data/shoe-photo';
import { Chips, DateField, Sheet, Stepper } from './inputs';
import { SHOE_BRANDS, SHOE_COLOURS, searchShoes, shapeForUse, shoeDisplayName, shoeShape, type CatalogShoe } from '../training/shoe-catalog';
import { SHOE_SHAPES, type ShoePart, type ShoeShape } from './shoe-shapes';
import { SHOE_USE } from '../training/shoes';
import { uid, ymd } from '../lib/format';
import type { Shoe, ShoeUse } from '../lib/types';

const USE_OPTIONS = (Object.keys(SHOE_USE) as ShoeUse[]).map((value) => ({ value, label: SHOE_USE[value] }));
const colourHex = (name?: string) => SHOE_COLOURS.find((c) => c.name === name)?.hex;

/** Blend two #RRGGBB colours: t = 0 is a, 1 is b */
const mixHex = (a: string, b: string, t: number) => `#${[1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('')}`;

/** Light colours get a darker accent and an outline, so the shoe stands out on a light background */
const LIGHT_COLOURS = new Set(['White', 'Yellow', 'Pink', 'Grey']);

/**
 * A side view of a running shoe, drawn in the shape that fits the model (daily trainer, max cushion, carbon racer,
 * trail...): the upper in the shoe's colour with a matching accent, a light midsole and a dark outsole. Generic
 * shapes only, never a brand's design.
 */
export function ShoePicture({ colour, size = 72, label, shape = 'daily' }: { colour?: string; size?: number; label?: string; shape?: ShoeShape }) {
  const upper = colourHex(colour) ?? colour ?? 'var(--border)';
  const light = !colour || LIGHT_COLOURS.has(colour);
  const hex = colourHex(colour);
  const accent = colour === 'White' ? '#C9C2B8' : hex ? mixHex(hex, light ? '#000000' : '#FFFFFF', light ? 0.3 : 0.45) : '#A39B91';
  const line = light ? 'rgb(0 0 0 / 0.28)' : 'rgb(255 255 255 / 0.5)';
  const paint: Record<ShoePart, React.SVGProps<SVGPathElement>> = {
    outsole: { fill: '#2B2724' },
    // The foam stays light and the rubber dark in both themes, like real shoes
    midsole: { fill: '#FAF8F4', stroke: '#857D73', strokeWidth: 2, strokeLinejoin: 'round' },
    upper: { fill: upper, ...(colour === 'White' ? { stroke: '#B5ADA3', strokeWidth: 1.5, strokeLinejoin: 'round' as const } : {}) },
    accent: { fill: accent },
    detail: { fill: 'none', stroke: line, strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' },
    seam: { fill: 'none', stroke: accent, strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
  };
  return (
    <svg className="shoe-pic" data-shape={shape} width={size} height={size * 0.5} viewBox="4 4 232 116" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {SHOE_SHAPES[shape].map(([part, d], i) => <path key={i} d={d} {...paint[part]} />)}
    </svg>
  );
}

/** The runner's own photo when there is one, otherwise the drawing in the shoe's colour */
export function ShoeImage({ shoe, size = 56 }: { shoe: Pick<Shoe, 'photo' | 'colour' | 'name' | 'brand' | 'model' | 'use'>; size?: number }) {
  const url = useShoePhoto(shoe.photo);
  if (shoe.photo && url) return <img className="shoe-photo" src={url} alt={`Your ${shoe.name}`} style={{ width: size, height: size * 0.625 }} />;
  return <ShoePicture size={size} colour={shoe.colour} shape={shoeShape(shoe)} />;
}

/** Take or choose a photo of your pair: resized on the device, then stored privately */
export function ShoePhotoButton({ shoeId, onDone, label = 'Add a photo of your pair' }: { shoeId: string; onDone: (path: string | undefined, preview?: string) => void; label?: string }) {
  const { session, data } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  if (!session || data.mode !== 'real') return null;
  const pick = async (f?: File) => {
    if (!f) return;
    const problem = shoePhotoProblem(f);
    if (problem) { setErr(problem); return; }
    setBusy(true); setErr(undefined);
    try {
      const jpeg = await prepareShoePhoto(f);
      const path = await uploadShoePhoto(session.user.id, shoeId, jpeg);
      onDone(path, URL.createObjectURL(jpeg));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="stack-sm">
      <label className="btn btn-small shoe-photo-btn" aria-disabled={busy}>
        <Camera size={18} strokeWidth={2} aria-hidden="true" />{busy ? 'Saving photo…' : label}
        <input type="file" accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif" className="sr-only" disabled={busy} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {err && <div role="alert"><StatusLine kind="danger">{err}</StatusLine></div>}
    </div>
  );
}

export function ShoeFinder({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (s: Shoe) => void }) {
  const [step, setStep] = useState<'find' | 'details'>('find');
  const [shoeId, setShoeId] = useState(() => uid());
  const [photo, setPhoto] = useState<string>();
  const [preview, setPreview] = useState<string>();
  const [q, setQ] = useState('');
  const [brand, setBrand] = useState<string>();
  const [pick, setPick] = useState<CatalogShoe | null>(null);
  const [colour, setColour] = useState<string>();
  const [name, setName] = useState('');
  const [named, setNamed] = useState(false);
  const [use, setUse] = useState<ShoeUse>('everyday');
  const [start, setStart] = useState(ymd(new Date()));
  const [startKm, setStartKm] = useState<number | undefined>(0);
  const [retire, setRetire] = useState<number | undefined>(700);
  const results = useMemo(() => searchShoes(q, brand), [q, brand]);

  const reset = () => { setShoeId(uid()); setPhoto(undefined); setPreview(undefined); setStep('find'); setQ(''); setBrand(undefined); setPick(null); setColour(undefined); setName(''); setNamed(false); setUse('everyday'); setStart(ymd(new Date())); setStartKm(0); setRetire(700); };
  // A photo taken but not saved with a shoe is removed again, so nothing is left behind in storage
  const close = (saved = false) => { if (photo && !saved) void removeShoePhoto(photo); reset(); onClose(); };
  const choose = (s: CatalogShoe | null) => {
    setPick(s); setColour(undefined); setNamed(false);
    setName(s ? shoeDisplayName(s.brand, s.model) : q.trim());
    setUse(s?.use ?? 'everyday'); setRetire(s?.lifeKm ?? 700); setStep('details');
  };
  const pickColour = (c: string) => { setColour(c); if (pick && !named) setName(shoeDisplayName(pick.brand, pick.model, c)); };
  const save = () => {
    onSave({ id: shoeId, name: name.trim(), startDate: start, startKm: startKm ?? 0, retireKm: retire ?? 700, use, brand: pick?.brand, model: pick?.model, colour, photo });
    close(true);
  };

  return (
    <Sheet open={open} onClose={() => close()} title={step === 'find' ? 'Find your shoes' : pick ? `${pick.brand} ${pick.model}` : 'Add shoes'}
      footer={step === 'details' ? <div className="row" style={{ gap: 8 }}><button className="btn btn-block" onClick={() => setStep('find')}><ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />Back</button><button className="btn btn-primary btn-block" disabled={!name.trim()} onClick={save}>Save shoes</button></div> : undefined}>
      {step === 'find' ? (
        <div className="stack shoe-finder">
          <label className="shoe-search">
            <Search size={18} strokeWidth={2} aria-hidden="true" />
            <input className="input" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brand or model, e.g. Pegasus" aria-label="Search shoes by brand or model" />
          </label>
          <div className="shoe-brands" role="group" aria-label="Brand">
            <button type="button" className="chip" aria-pressed={!brand} onClick={() => setBrand(undefined)}>All</button>
            {SHOE_BRANDS.map((b) => <button key={b} type="button" className="chip" aria-pressed={brand === b} onClick={() => setBrand(brand === b ? undefined : b)}>{b}</button>)}
          </div>
          {results.length ? (
            <ul className="group shoe-results" aria-label="Shoes">
              {results.map((s) => (
                <li key={s.id}>
                  <button type="button" className="shoe-result" onClick={() => choose(s)}>
                    <ShoePicture size={64} shape={s.shape} />
                    <span className="stack-sm" style={{ gap: 0, minWidth: 0 }}>
                      <span className="label">{s.model}</span>
                      <span className="caption">{s.brand} · {SHOE_USE[s.use]}{s.note ? ` · ${s.note}` : ''}</span>
                    </span>
                    <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="muted">No shoes match "{q}".</p>}
          <button type="button" className="link-btn" style={{ alignSelf: 'flex-start', minHeight: 44 }} onClick={() => choose(null)}>Can't find yours? Add it by name</button>
        </div>
      ) : (
        <div className="stack">
          <div className="shoe-hero">{preview ? <img className="shoe-photo shoe-photo-lg" src={preview} alt={`Your ${name || 'shoes'}`} /> : <ShoePicture size={180} colour={colour} shape={pick?.shape ?? shapeForUse(use)} label={`${name || 'Shoe'} picture`} />}</div>
          <div className="row wrap" style={{ gap: 8 }}>
            <ShoePhotoButton shoeId={shoeId} label={photo ? 'Change photo' : 'Add a photo of your pair'} onDone={(p, url) => { setPhoto(p); setPreview(url); }} />
            {photo && <button type="button" className="btn btn-small btn-ghost" onClick={() => { if (photo) void removeShoePhoto(photo); setPhoto(undefined); setPreview(undefined); }}><Trash2 size={16} strokeWidth={2} aria-hidden="true" />Use the drawing</button>}
          </div>
          <p className="caption">Optional. Your photo is stored privately and only you see it.</p>
          {pick && (
            <div className="stack-sm">
              <span className="label" id="shoe-colour">Colour</span>
              <div className="shoe-colours" role="radiogroup" aria-labelledby="shoe-colour">
                {SHOE_COLOURS.map((c) => (
                  <button key={c.name} type="button" role="radio" aria-checked={colour === c.name} aria-label={c.name} className={`swatch${colour === c.name ? ' on' : ''}`} style={{ background: c.hex }} onClick={() => pickColour(c.name)} />
                ))}
              </div>
              {colour && <span className="caption">{colour}</span>}
            </div>
          )}
          <div className="field"><label htmlFor="sh-name">Name</label><input id="sh-name" className="input" value={name} onChange={(e) => { setName(e.target.value); setNamed(true); }} placeholder="For example, daily trainers" /></div>
          <Chips label="What they are for" value={use} onChange={setUse} options={USE_OPTIONS} />
          <DateField id="sh-date" label="First run in them" value={start} onChange={setStart} />
          <div className="grid-2">
            <Stepper id="sh-km" label="Distance already (km)" value={startKm} onChange={setStartKm} min={0} max={2000} step={10} unit="km" />
            <Stepper id="sh-ret" label="Retire at (km)" value={retire} onChange={setRetire} min={100} max={2000} step={50} unit="km" />
          </div>
          {pick && <p className="caption">{pick.note === 'Race' ? 'Racing shoes with a carbon plate usually last 300 to 400 km.' : `Shoes like these usually last about ${pick.lifeKm} km.`} You can change it.</p>}
        </div>
      )}
    </Sheet>
  );
}
