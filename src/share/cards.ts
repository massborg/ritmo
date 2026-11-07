// Share images of a run (review #2 §5), drawn on a canvas at full size so the export matches the preview.
// Six templates; Story, Post and Square sizes; light, dark or orange; the runner picks which stats show.
// Routes have their start and finish trimmed, like on the Hub.

export type Template = 'route' | 'stats' | 'splits' | 'sticker' | 'photo' | 'pb';
export type Size = 'story' | 'post' | 'square';
export type Theme = 'dark' | 'light' | 'orange';
export const TEMPLATE_LABEL: Record<Template, string> = { route: 'Route', stats: 'Stats bold', splits: 'Splits', sticker: 'Sticker (transparent)', photo: 'Photo overlay', pb: 'PB / race' };
export const SIZES: Record<Size, [number, number]> = { story: [1080, 1920], post: [1080, 1350], square: [1080, 1080] };

export interface CardData {
  title: string; date: string; distance: string; time: string; pace: string; hr?: string; climb?: string; cadence?: string;
  route?: [number, number][] | null; splits?: { label: string; paceS: number; inTarget?: boolean }[]; target?: [number, number];
  splitsCaption?: string; pb?: { label: string; time: string; race?: string };
}
export interface CardOpts { template: Template; size: Size; theme: Theme; show: { distance: boolean; time: boolean; pace: boolean; hr: boolean; climb: boolean; cadence: boolean }; map: boolean; routeColour: string; photo?: HTMLImageElement }

const THEMES: Record<Theme, { bg: string; ink: string; muted: string; accent: string }> = {
  dark: { bg: '#1E1A17', ink: '#FAF8F5', muted: '#B9AFA6', accent: '#FF6A2B' },
  light: { bg: '#FAF8F5', ink: '#1E1A17', muted: '#6B625B', accent: '#E8480C' },
  orange: { bg: '#E8480C', ink: '#FFFFFF', muted: '#FFD9C7', accent: '#1E1A17' },
};
const DISPLAY = "'Bricolage Grotesque', 'Instrument Sans', system-ui, sans-serif";
const BODY = "'Instrument Sans', system-ui, sans-serif";
const MONO = "'DM Mono', ui-monospace, monospace";

function stats(d: CardData, o: CardOpts): [string, string][] {
  return ([['Distance', o.show.distance && d.distance], ['Time', o.show.time && d.time], ['Pace', o.show.pace && d.pace], ['Avg HR', o.show.hr && d.hr], ['Climb', o.show.climb && d.climb], ['Cadence', o.show.cadence && d.cadence]] as [string, string | false | undefined][])
    .filter((x): x is [string, string] => !!x[1]);
}

function drawRoute(c: CanvasRenderingContext2D, route: [number, number][], x: number, y: number, w: number, h: number, colour: string, width = 10) {
  const lats = route.map((p) => p[0]), lons = route.map((p) => p[1]);
  const [la0, la1, lo0, lo1] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const k = Math.cos(((la0 + la1) / 2) * Math.PI / 180);
  const sx = (lo1 - lo0) * k, sy = la1 - la0;
  const s = Math.min(w / Math.max(sx, 1e-6), h / Math.max(sy, 1e-6));
  const ox = x + (w - sx * s) / 2, oy = y + (h - sy * s) / 2;
  c.save(); c.strokeStyle = colour; c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath();
  route.forEach(([la, lo], i) => { const px = ox + (lo - lo0) * k * s, py = oy + (la1 - la) * s; if (i) c.lineTo(px, py); else c.moveTo(px, py); });
  c.stroke(); c.restore();
}

function statRow(c: CanvasRenderingContext2D, items: [string, string][], x: number, y: number, w: number, ink: string, muted: string, big = 64) {
  const n = Math.max(1, Math.min(3, items.length));
  const col = w / n;
  items.slice(0, 6).forEach(([label, value], i) => {
    const cx = x + (i % n) * col, cy = y + Math.floor(i / n) * (big + 70);
    c.fillStyle = muted; c.font = `500 34px ${BODY}`; c.fillText(label, cx, cy);
    c.fillStyle = ink; c.font = `500 ${big}px ${MONO}`; c.fillText(value, cx, cy + big + 10);
  });
}

function wordmark(c: CanvasRenderingContext2D, x: number, y: number, colour: string) {
  c.fillStyle = colour; c.font = `800 52px ${DISPLAY}`; c.fillText('ritmo', x, y);
}

export function drawCard(canvas: HTMLCanvasElement, d: CardData, o: CardOpts) {
  const [W, H] = SIZES[o.size];
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d')!;
  const t = THEMES[o.theme];
  const pad = 80;
  c.clearRect(0, 0, W, H);
  c.textBaseline = 'alphabetic';
  const sticker = o.template === 'sticker';
  if (o.template === 'photo' && o.photo) {
    const img = o.photo, r = Math.max(W / img.width, H / img.height);
    c.drawImage(img, (W - img.width * r) / 2, (H - img.height * r) / 2, img.width * r, img.height * r);
    const g = c.createLinearGradient(0, H * 0.45, 0, H); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.8)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  } else if (!sticker) { c.fillStyle = t.bg; c.fillRect(0, 0, W, H); }
  const ink = sticker || o.template === 'photo' ? '#FFFFFF' : t.ink;
  const muted = sticker || o.template === 'photo' ? 'rgba(255,255,255,0.8)' : t.muted;
  const items = stats(d, o);

  if (o.template === 'route' || o.template === 'sticker') {
    if (!sticker) { c.fillStyle = t.muted; c.font = `500 36px ${BODY}`; c.fillText(d.date, pad, pad + 40); c.fillStyle = t.ink; c.font = `700 72px ${DISPLAY}`; c.fillText(d.title, pad, pad + 130, W - pad * 2); }
    const top = sticker ? pad : pad + 190, bottom = H - (items.length > 3 ? 420 : 300);
    if (o.map && d.route?.length) drawRoute(c, d.route, pad, top, W - pad * 2, bottom - top, sticker ? '#FFFFFF' : o.routeColour, 12);
    statRow(c, items, pad, H - (items.length > 3 ? 360 : 230), W - pad * 2, ink, muted);
    if (!sticker) wordmark(c, W - pad - 160, H - pad + 10, t.accent);
  } else if (o.template === 'stats' || o.template === 'photo') {
    const base = o.template === 'photo' ? H - 520 : H * 0.36;
    c.fillStyle = muted; c.font = `500 40px ${BODY}`; c.fillText(`${d.title} · ${d.date}`, pad, base - 260, W - pad * 2);
    c.fillStyle = ink; c.font = `800 ${o.size === 'square' ? 220 : 280}px ${DISPLAY}`; c.fillText(d.distance.replace(/ (km|mi)$/, ''), pad - 10, base);
    c.fillStyle = o.template === 'photo' ? '#FFFFFF' : t.accent; c.font = `700 72px ${DISPLAY}`; c.fillText(d.distance.match(/(km|mi)$/)?.[0] ?? '', pad, base + 90);
    statRow(c, items.filter(([l]) => l !== 'Distance'), pad, base + 220, W - pad * 2, ink, muted);
    wordmark(c, pad, H - pad + 10, o.template === 'photo' ? '#FFFFFF' : t.accent);
  } else if (o.template === 'splits') {
    c.fillStyle = t.muted; c.font = `500 36px ${BODY}`; c.fillText(d.date, pad, pad + 40);
    c.fillStyle = t.ink; c.font = `700 72px ${DISPLAY}`; c.fillText(d.splitsCaption ?? d.title, pad, pad + 130, W - pad * 2);
    const sp = (d.splits ?? []).slice(0, 20);
    if (sp.length) {
      const top = pad + 220, bottom = H - 300, bw = (W - pad * 2) / sp.length;
      const ps = sp.map((x) => x.paceS);
      const lo = Math.min(...ps, d.target?.[0] ?? Infinity) - 8, hi = Math.max(...ps, d.target?.[1] ?? -Infinity) + 8;
      const y = (p: number) => top + ((p - lo) / (hi - lo)) * (bottom - top);
      if (d.target) { c.fillStyle = 'rgba(60,170,110,0.22)'; c.fillRect(pad, y(d.target[0]), W - pad * 2, Math.max(4, y(d.target[1]) - y(d.target[0]))); }
      sp.forEach((s, i) => {
        c.fillStyle = s.inTarget === false ? '#D99A00' : t.accent;
        const by = y(s.paceS);
        c.beginPath(); c.roundRect(pad + i * bw + bw * 0.15, by, bw * 0.7, bottom - by, 12); c.fill();
        c.fillStyle = t.ink; c.font = `500 ${Math.min(34, bw * 0.4)}px ${MONO}`; c.textAlign = 'center';
        // pace above each bar only when there is room for it
        if (bw >= 70) c.fillText(`${Math.floor(s.paceS / 60)}:${String(Math.round(s.paceS % 60)).padStart(2, '0')}`, pad + i * bw + bw / 2, by - 14);
        c.fillStyle = t.muted; c.fillText(s.label, pad + i * bw + bw / 2, bottom + 46); c.textAlign = 'left';
      });
    }
    statRow(c, items.slice(0, 3), pad, H - 150, W - pad * 2, t.ink, t.muted, 52);
  } else if (o.template === 'pb') {
    const cx = W / 2, cy = H * 0.36, r = Math.min(W, H) * 0.2;
    c.strokeStyle = t.accent; c.lineWidth = 18; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
    c.fillStyle = t.accent; c.beginPath(); c.moveTo(cx - r * 0.5, cy + r * 0.85); c.lineTo(cx - r * 0.8, cy + r * 1.7); c.lineTo(cx - r * 0.2, cy + r * 1.1); c.fill();
    c.beginPath(); c.moveTo(cx + r * 0.5, cy + r * 0.85); c.lineTo(cx + r * 0.8, cy + r * 1.7); c.lineTo(cx + r * 0.2, cy + r * 1.1); c.fill();
    c.textAlign = 'center';
    c.fillStyle = t.ink; c.font = `800 ${r * 0.55}px ${DISPLAY}`; c.fillText(d.pb?.time ?? d.time, cx, cy + r * 0.18);
    c.fillStyle = t.muted; c.font = `600 48px ${BODY}`; c.fillText(`New ${d.pb?.label ?? ''} PB`.replace('  ', ' '), cx, cy + r + 230);
    c.fillStyle = t.ink; c.font = `700 64px ${DISPLAY}`; c.fillText(d.pb?.race ?? d.title, cx, cy + r + 320, W - pad * 2);
    c.fillStyle = t.muted; c.font = `500 40px ${BODY}`; c.fillText(d.date, cx, cy + r + 390);
    c.textAlign = 'left';
    wordmark(c, cx - 80, H - pad + 10, t.accent);
  }
}

/** The canvas as a PNG file */
export const toPng = (canvas: HTMLCanvasElement, name: string): Promise<File> =>
  new Promise((res, rej) => canvas.toBlob((b) => (b ? res(new File([b], name, { type: 'image/png' })) : rej(new Error('Could not make the image'))), 'image/png'));
