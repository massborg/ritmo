import { lazyPage } from './lib/chunks';
import { ChunkBoundary } from './components/ChunkBoundary';
import { UpdateToast } from './components/UpdateToast';
import { ConsentBanner } from './components/ConsentBanner';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, LineChart, MessageCircle, Play, Sun, User, Users } from 'lucide-react';
import { AppProvider, useApp } from './app/AppContext';
import { Logo, StatusLine } from './components/ui';
import Today from './pages/Today';
import { getSplashVariant, Splash } from './components/Splash';
import { Sheet } from './components/inputs';
import { syncStatusBar, tapHaptic } from './native';
import { ForgotPassword, Login, ResetPassword, SignUp } from './pages/Auth';

const Calendar = lazyPage(() => import('./pages/Calendar'));
const Progress = lazyPage(() => import('./pages/Progress'));
const Coach = lazyPage(() => import('./pages/Coach'));
const Profile = lazyPage(() => import('./pages/Profile'));
const DataSources = lazyPage(() => import('./pages/DataSources'));
const GarminCallback = lazyPage(() => import('./pages/GarminCallback'));
const StravaCallback = lazyPage(() => import('./pages/StravaCallback'));
const Privacy = lazyPage(() => import('./pages/Privacy'));
const ActivityPage = lazyPage(() => import('./pages/Activity'));
const PlannedPage = lazyPage(() => import('./pages/Planned'));
const RacePage = lazyPage(() => import('./pages/Race'));
const RaceDay = lazyPage(() => import('./pages/RaceDay'));
const Setup = lazyPage(() => import('./pages/Setup'));
const Story = lazyPage(() => import('./pages/Story'));
const Review = lazyPage(() => import('./pages/Review'));
const Goals = lazyPage(() => import('./pages/Goals'));
const HealthConnect = lazyPage(() => import('./pages/HealthConnect'));
const NotFound = lazyPage(() => import('./pages/NotFound'));
const About = lazyPage(() => import('./pages/About'));
const Terms = lazyPage(() => import('./pages/Terms'));
const RunPage = lazyPage(() => import('./pages/Run'));
const HubPage = lazyPage(() => import('./pages/Hub'));

interface Tab { to: string; label: string; icon: typeof Sun; also?: string[] }
/** Desktop sidebar: everything */
const SIDEBAR: Tab[] = [
  { to: '/', label: 'Training', icon: Sun },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/progress', label: 'Progress', icon: LineChart },
  { to: '/coach', label: 'Coach', icon: MessageCircle },
  { to: '/profile', label: 'Profile', icon: User },
];
/** Phone tab bar: Training, Calendar, You (Progress with Profile behind a settings button). Coach is a
 *  floating button on Training, run and session pages, and has an entry in You. */
const MOBILE: Tab[] = [
  { to: '/', label: 'Training', icon: Sun },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/progress', label: 'You', icon: User, also: ['/profile', '/coach', '/goals', '/story', '/review'] },
];
/** Pages with the floating coach button */
const COACH_FAB = [/^\/$/, /^\/activity\//, /^\/session\//];

/** Pages anyone can open without an account */
const PUBLIC = ['/login', '/signup', '/forgot-password', '/reset-password', '/privacy', '/terms', '/about'];
/** Pages shown without the app's navigation */
const BARE = ['/setup', ...PUBLIC];
/** Pages a signed-in person can open before finishing setup */
const BEFORE_SETUP = ['/setup', '/profile/privacy', '/reset-password', ...PUBLIC];

function ThemeSync() {
  const { data } = useApp();
  useEffect(() => {
    const t = data.profile.theme;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    void syncStatusBar(t);
  }, [data.profile.theme]);
  return null;
}

/** After the first screen is up, fetch the other main screens quietly so moving between tabs is instant. */
function Prefetch() {
  const { ready } = useApp();
  useEffect(() => {
    if (!ready) return;
    const go = () => {
      // A page file missing after a new deploy must not reload the app in the background (the runner may be typing):
      // background fetches fail quietly, and the reload happens only if that page is actually opened
      const w2 = window as Window & { __ritmoPrefetching?: number };
      const loads = [() => import('./pages/Activity'), () => import('./pages/Calendar'), () => import('./pages/Progress'), () => import('./pages/Run'), () => import('./pages/Planned'),
        () => import('./pages/Profile'), () => import('./pages/Coach'), () => import('./pages/Hub'), () => import('./pages/Goals'), () => import('./pages/DataSources'), () => import('./pages/Race')];
      w2.__ritmoPrefetching = (w2.__ritmoPrefetching ?? 0) + 1;
      void Promise.allSettled(loads.map((load) => load())).finally(() => { w2.__ritmoPrefetching = Math.max(0, (w2.__ritmoPrefetching ?? 1) - 1); });
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(go); else setTimeout(go, 1500);
  }, [ready]);
  return null;
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

/** After a password-reset link, take the person to choose a new password. */
function RecoveryRedirect() {
  const { recovering } = useApp();
  const nav = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => { if (recovering && pathname !== '/reset-password') nav('/reset-password', { replace: true }); }, [recovering, pathname, nav]);
  return null;
}

/** The splash plays once per visit (each app launch), not on every page load. */
function SplashOnce() {
  const [show] = useState(() => {
    try {
      if (sessionStorage.getItem('ritmo:splash-shown')) return false;
      sessionStorage.setItem('ritmo:splash-shown', '1');
    } catch { /* storage blocked: show it */ }
    return true;
  });
  return show ? <Splash variant={getSplashVariant()} /> : null;
}

function Loading() {
  return (
    <div className="stack" aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ height: 40, width: 220 }} />
      <div className="skeleton" style={{ height: 220 }} />
      <div className="skeleton" style={{ height: 120 }} />
    </div>
  );
}

/** Every page except the public ones needs an account. */
function Gate({ children }: { children: ReactNode }) {
  const { authReady, session, ready, loadError, retryLoad, data } = useApp();
  const loc = useLocation();
  const isPublic = PUBLIC.includes(loc.pathname);
  if (!authReady) return <Loading />;
  if (!session) {
    if (isPublic) return <>{children}</>;
    const next = loc.pathname + loc.search;
    return <Navigate to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} replace />;
  }
  if (['/login', '/signup', '/forgot-password'].includes(loc.pathname)) {
    const next = new URLSearchParams(loc.search).get('next');
    return <Navigate to={next && next.startsWith('/') && !next.startsWith('//') ? next : '/'} replace />;
  }
  if (loadError) {
    return (
      <div className="card stack" role="alert" style={{ marginTop: 'var(--s6)' }}>
        <StatusLine kind="danger">Your data could not be loaded</StatusLine>
        <p className="muted">{loadError}</p>
        <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={retryLoad}>Try again</button>
      </div>
    );
  }
  if (!ready) return <Loading />;
  // Everyone answers the setup questions first (existing accounts only see what is missing). Sample data skips it.
  if (data.mode !== 'sample' && !data.profile.setupCompletedAt && !BEFORE_SETUP.includes(loc.pathname)) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

function SyncBanner() {
  const { syncError, session } = useApp();
  if (!syncError || !session) return null;
  return <div className="sync-banner" role="status"><StatusLine kind="warning">{syncError}</StatusLine></div>;
}

function LegacyOffer() {
  const { legacyOffer, acceptLegacy, dismissLegacy } = useApp();
  const [busy, setBusy] = useState(false);
  if (!legacyOffer) return null;
  return (
    <Sheet open onClose={() => dismissLegacy(false)} title="Move your data into your account?"
      footer={<div className="stack-sm">
        <button className="btn btn-primary btn-block" disabled={busy} onClick={async () => { setBusy(true); await acceptLegacy(); setBusy(false); }}>Move it into my account</button>
        <button className="btn btn-block" onClick={() => dismissLegacy(true)}>Delete it from this browser</button>
        <button className="btn btn-ghost btn-block" onClick={() => dismissLegacy(false)}>Not now</button>
      </div>}>
      <p>This browser has Ritmo data from before accounts were needed: {legacyOffer.runs} run{legacyOffer.runs === 1 ? '' : 's'}{legacyOffer.races ? ` and ${legacyOffer.races} race${legacyOffer.races === 1 ? '' : 's'}` : ''}.</p>
      <p className="muted">Moving it keeps it safe in your account and on your other devices. Only do this if the data is yours.</p>
    </Sheet>
  );
}

/** When a plan cannot be built as asked: the reason, and one-tap options. Nothing is changed silently. */
function PlanProblemSheet() {
  const { planProblem, applyPlanOption, dismissPlanProblem } = useApp();
  const nav = useNavigate();
  const [msg, setMsg] = useState<string>();
  if (!planProblem) return null;
  return (
    <Sheet open onClose={dismissPlanProblem} title={planProblem.kind === 'doesNotFit' ? 'That week does not fit' : 'The plan could not be built'}
      footer={<div className="stack-sm">
        {planProblem.options.map((o) => (
          <button key={o.label} className={`btn btn-block${o.recommended ? ' btn-primary' : ''}`} onClick={() => setMsg(applyPlanOption(o))}>{o.label}</button>
        ))}
        <button className="btn btn-ghost btn-block" onClick={() => { dismissPlanProblem(); nav('/goals'); }}>Change my training settings</button>
      </div>}>
      <p>{planProblem.message}</p>
      {planProblem.fit && <p className="muted">Ritmo will not squeeze extra distance into one run. Long runs, quality sessions and easy runs each have a safe limit, and no run is more than about a third of your week.</p>}
      {msg && <div role="alert"><StatusLine kind="warning">{msg}</StatusLine></div>}
    </Sheet>
  );
}

function Shell() {
  const { pathname } = useLocation();
  const { session, hasFlag } = useApp();
  // Run (centre, orange) and Hub are open to every runner using their own data
  // Run (centre, orange) and Hub appear for accounts with those flags: Training · Calendar · Run · Hub · You
  const extra: Tab[] = [...(hasFlag('run_tab') ? [{ to: '/run', label: 'Run', icon: Play }] : []), ...(hasFlag('hub') ? [{ to: '/hub', label: 'Hub', icon: Users }] : [])];
  const mobile: Tab[] = [MOBILE[0], MOBILE[1], ...extra, MOBILE[2]];
  const sidebar: Tab[] = [SIDEBAR[0], SIDEBAR[1], ...extra, ...SIDEBAR.slice(2)];
  const bare = BARE.includes(pathname) || !session;
  return (
    <div className={`app${bare ? ' app-bare' : ''}`}>
      <a href="#main" className="sr-only">Skip to content</a>
      {!bare ? (
        <aside className="sidebar" aria-label="Main navigation">
          <NavLink to="/" className="sidebar-logo" aria-label="Ritmo, go to Today"><Logo variant="compact" width={112} alt="Ritmo" /></NavLink>
          <nav className="stack-sm" aria-label="Main">
            {sidebar.map((t) => <NavLink key={t.to} to={t.to} end={t.to === '/'} className="navlink"><t.icon size={20} strokeWidth={2} aria-hidden="true" />{t.label}</NavLink>)}
          </nav>
          <p className="caption sidebar-foot">Train to your own rhythm.</p>
        </aside>
      ) : <span />}
      <main id="main" className={`main page${bare ? ' main-bare' : ''}`}>
        <SyncBanner />
        <Gate>
          <ChunkBoundary resetKey={pathname}>
          <Suspense fallback={<Loading />}>
            {/* Each screen starts fresh (key), and fades in gently; the Suspense around it stays, so while the next
                screen's code loads the current one stays visible instead of flashing to a loading placeholder */}
            <div key={pathname} className="page-in">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<SignUp />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/about" element={<About />} />
              <Route path="/" element={<Today />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/calendar/:date" element={<Calendar />} />
              <Route path="/session/:id" element={<PlannedPage />} />
              <Route path="/activity/:id" element={<ActivityPage />} />
              <Route path="/race/:id" element={<RacePage />} />
              <Route path="/race/:id/day" element={<RaceDay />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/run" element={<RunPage />} />
              <Route path="/hub" element={<HubPage />} />
              <Route path="/coach" element={<Coach />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/data" element={<DataSources />} />
              <Route path="/garmin/callback" element={<GarminCallback />} />
              <Route path="/strava/callback" element={<StravaCallback />} />
              <Route path="/profile/privacy" element={<Privacy />} />
              <Route path="/goals" element={<Goals />} />
              <Route path="/profile/health" element={<HealthConnect />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/welcome" element={<Navigate to="/setup" replace />} />
              <Route path="/start" element={<Navigate to="/setup" replace />} />
              <Route path="/story" element={<Story />} />
              <Route path="/review/:period" element={<Review />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </div>
          </Suspense>
          </ChunkBoundary>
        </Gate>
        <UpdateToast />
        <ConsentBanner />
        {!bare && COACH_FAB.some((r) => r.test(pathname)) && (
          <NavLink to="/coach" className="coach-fab" aria-label="Ask your coach"><MessageCircle size={24} strokeWidth={2} aria-hidden="true" /></NavLink>
        )}
        <LegacyOffer />
        <PlanProblemSheet />
      </main>
      {!bare && (
        <nav className="tabbar" aria-label="Main">
          {mobile.map((t) => <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => `tab${t.to === '/run' ? ' tab-run' : ''}${isActive || t.also?.some((p) => pathname.startsWith(p)) ? ' active' : ''}`} onClick={() => void tapHaptic()}><t.icon size={24} strokeWidth={2} aria-hidden="true" />{t.label}</NavLink>)}
        </nav>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ThemeSync />
        <Prefetch />
        <ScrollTop />
        <RecoveryRedirect />
        <SplashOnce />
        <Shell />
      </BrowserRouter>
    </AppProvider>
  );
}

