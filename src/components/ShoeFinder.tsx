// Find your shoes (instead of typing a name): search by brand or model, filter by brand, pick the model, then its
// colour, and the rest fills itself in (what they are for, when to retire them). A shoe that is not listed can still
// be added by name. The picture is Ritmo's own drawing in the shoe's colour, not a product photo.
import { useMemo, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Search, Trash2 } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { StatusLine } from './ui';
import { prepareShoePhoto, removeShoePhoto, shoePhotoProblem, uploadShoePhoto, useShoePhoto } from '../data/shoe-photo';
import { Chips, DateField, Sheet, Stepper } from './inputs';
import { SHOE_BRANDS, SHOE_COLOURS, searchShoes, shoeDisplayName, type CatalogShoe } from '../training/shoe-catalog';
import { SHOE_USE } from '../training/shoes';
import { uid, ymd } from '../lib/format';
import type { Shoe, ShoeUse } from '../lib/types';

const USE_OPTIONS = (Object.keys(SHOE_USE) as ShoeUse[]).map((value) => ({ value, label: SHOE_USE[value] }));
const colourHex = (name?: string) => SHOE_COLOURS.find((c) => c.name === name)?.hex;

/** A side view of a running shoe: upper in the shoe's colour, a light midsole and a dark outsole. */
export function ShoePicture({ colour, size = 72, label }: { colour?: string; size?: number; label?: string }) {
  const upper = colourHex(colour) ?? colour ?? 'var(--border)';
  const light = colour === 'White';
  return (
    <svg className="shoe-pic" width={size} height={size * 0.5} viewBox="0 0 120 60" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {/* upper: heel counter, collar, tongue, laces down to a low toe */}
      <path d="M9 41 C7 33 7 25 10 19 C12 15 17 14 21 16 C25 18 29 20 33 18 C37 12 42 8 48 8 C52 8 54 11 57 15 L84 27 C94 30 106 32 112 36 C115 38 115 41 112 42 Z"
        fill={upper} stroke={light ? 'var(--border)' : 'none'} strokeWidth="1.5" strokeLinejoin="round" />
      {/* side stripe and lace marks */}
      <path d="M30 34 C46 26 64 26 86 34" stroke={light ? 'var(--border)' : 'rgb(255 255 255 / 0.55)'} strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <path d="M55 17 L60 21 M62 20 L67 24 M69 23 L74 27" stroke={light ? 'var(--border)' : 'rgb(255 255 255 / 0.5)'} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M10 19 C9 27 9 34 11 41" stroke={light ? 'var(--border)' : 'rgb(0 0 0 / 0.18)'} strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* midsole: thicker at the heel, rocking up at the toe */}
      <path d="M5 40 L113 41 C117 42 117 46 113 47 C108 49 100 50 92 50 L14 51 C8 51 4 47 5 40 Z" fill="var(--surface-raised)" stroke="var(--border)" strokeWidth="1.5" strokeLinejoin="round" />
      {/* outsole */}
      <path d="M11 51 L94 50 C102 50 108 49 112 47 C110 52 104 54 96 54 L17 55 C13 55 11 53 11 51 Z" fill="var(--graphite)" />
    </svg>
  );
}

/** The runner's own photo when there is one, otherwise the drawing in the shoe's colour */
export function ShoeImage({ shoe, size = 56 }: { shoe: Pick<Shoe, 'photo' | 'colour' | 'name'>; size?: number }) {
  const url = useShoePhoto(shoe.photo);
  if (shoe.photo && url) return <img className="shoe-photo" src={url} alt={`Your ${shoe.name}`} style={{ width: size, height: size * 0.625 }} />;
  return <ShoePicture size={size} colour={shoe.colour} />;
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
                    <ShoePicture size={64} />
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
          <div className="shoe-hero">{preview ? <img className="shoe-photo shoe-photo-lg" src={preview} alt={`Your ${name || 'shoes'}`} /> : <ShoePicture size={180} colour={colour} label={`${name || 'Shoe'} picture`} />}</div>
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
