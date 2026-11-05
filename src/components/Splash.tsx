// Opening animations. Every option moves, scales, fades or masks the supplied logo files;
// none redraws, recolours, rotates, stretches or changes the lean of the logo.
import { useEffect, useState } from 'react';

export type SplashVariant = 'run' | 'track' | 'rhythm' | 'countdown' | 'trail' | 'reveal';

export const SPLASH_OPTIONS: { value: SplashVariant; label: string; description: string }[] = [
  { value: 'run', label: 'Run in', description: 'The badge runs in from the left with a light stride and lane streaks, then the full logo settles.' },
  { value: 'track', label: 'Track', description: 'Lane lines sweep around like a running track, the badge lands in the middle, and the name slides out beside it.' },
  { value: 'rhythm', label: 'Rhythm', description: 'The badge beats three times like a steady cadence, sending out rings, then the full logo appears.' },
  { value: 'countdown', label: 'Countdown', description: 'A calm 3, 2, 1 in the stat font, then the badge springs in on "go".' },
  { value: 'trail', label: 'Pace trail', description: 'A dotted trail of footsteps runs across the screen and the badge arrives at the end of it.' },
  { value: 'reveal', label: 'Quiet reveal', description: 'Minimal: the badge fades up, then the wordmark is unveiled from left to right.' },
];

export const SPLASH_DURATION: Record<SplashVariant, number> = { run: 2300, track: 2400, rhythm: 2400, countdown: 2700, trail: 2400, reveal: 2000 };

export function getSplashVariant(): SplashVariant {
  try {
    const v = localStorage.getItem('ritmo:splash') as SplashVariant | null;
    if (v && SPLASH_OPTIONS.some((o) => o.value === v)) return v;
  } catch { /* ignore */ }
  return 'run';
}

const Badge = ({ size = 96 }: { size?: number }) => <img src="/brand/ritmo-badge.svg" width={size} height={size} alt="" style={{ borderRadius: size * 0.22 }} />;
const FullLogo = ({ width = 260 }: { width?: number }) => <img src="/brand/ritmo-running-logo.svg" width={width} height={Math.round(width * 120 / 326)} alt="" />;

function Stage({ variant }: { variant: SplashVariant }) {
  switch (variant) {
    case 'run':
      return (
        <>
          <div className="sp-lanes">{[0, 1, 2, 3].map((i) => <span key={i} className="sp-streak" style={{ top: `${46 + i * 3.2}%`, animationDelay: `${i * 60}ms` }} />)}</div>
          <div className="sp-center sp-run"><div className="sp-tile sp-bob"><Badge /></div></div>
          <div className="sp-center sp-card sp-card-late"><FullLogo /></div>
        </>
      );
    case 'track':
      return (
        <>
          <svg className="sp-track" viewBox="0 0 400 400" aria-hidden="true">
            {[170, 145, 120, 95].map((r, i) => (
              <circle key={r} cx="200" cy="200" r={r} fill="none" stroke="var(--lane)" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * r}`} strokeDashoffset={`${2 * Math.PI * r}`} style={{ animationDelay: `${i * 90}ms` }} />
            ))}
          </svg>
          <div className="sp-center sp-card sp-wipe-card"><div className="sp-wipe"><FullLogo /></div></div>
        </>
      );
    case 'rhythm':
      return (
        <>
          <div className="sp-center">{[0, 1, 2].map((i) => <span key={i} className="sp-ring" style={{ animationDelay: `${i * 380}ms` }} />)}</div>
          <div className="sp-center sp-tile sp-beat"><Badge /></div>
          <div className="sp-center sp-card sp-card-rhythm"><FullLogo /></div>
        </>
      );
    case 'countdown':
      return (
        <>
          {['3', '2', '1'].map((n, i) => <span key={n} className="sp-center sp-count" style={{ animationDelay: `${i * 450}ms` }}>{n}</span>)}
          <div className="sp-center sp-tile sp-go"><Badge /></div>
          <div className="sp-center sp-card sp-card-count"><FullLogo /></div>
        </>
      );
    case 'trail':
      return (
        <>
          <div className="sp-trail">{Array.from({ length: 9 }, (_, i) => <span key={i} className="sp-step" style={{ left: `${4 + i * 5}%`, top: `${i % 2 ? 52 : 47}%`, animationDelay: `${i * 90}ms` }} />)}</div>
          <div className="sp-center sp-tile sp-arrive"><Badge /></div>
          <div className="sp-center sp-card sp-card-trail"><FullLogo /></div>
        </>
      );
    case 'reveal':
    default:
      return <div className="sp-center sp-card sp-quiet"><div className="sp-quiet-mask"><FullLogo /></div></div>;
  }
}

/** Full-screen splash. `replayKey` lets the preview restart it. */
export function Splash({ variant, onDone, preview = false, replayKey = 0 }: { variant: SplashVariant; onDone?: () => void; preview?: boolean; replayKey?: number }) {
  const [show, setShow] = useState(true);
  useEffect(() => {
    setShow(true);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => { setShow(false); onDone?.(); }, reduce ? 500 : SPLASH_DURATION[variant]);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, replayKey]);
  if (!show) return null;
  return (
    <div key={`${variant}-${replayKey}`} className={`splash splash-v-${variant}${preview ? ' splash-preview' : ''}`} role="img" aria-label="Ritmo Running" style={{ animationDelay: `${SPLASH_DURATION[variant] - 300}ms` }}>
      <Stage variant={variant} />
    </div>
  );
}
