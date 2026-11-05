import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, LineChart, MessageCircle, Sun, User } from 'lucide-react';
import { AppProvider, useApp } from './app/AppContext';
import { Logo, StatusLine } from './components/ui';
import Today from './pages/Today';
import { getSplashVariant, Splash } from './components/Splash';
import { Sheet } from './components/inputs';
import { syncStatusBar, tapHaptic } from './native';
import { ForgotPassword, Login, ResetPassword, SignUp } from './pages/Auth';

const Calendar = lazy(() => import('./pages/Calendar'));
const Progress = lazy(() => import('./pages/Progress'));
const Coach = lazy(() => import('./pages/Coach'));
const Profile = lazy(() => import('./pages/Profile'));
const DataSources = lazy(() => import('./pages/DataSources'));
const Privacy = lazy(() => import('./pages/Privacy'));
const ActivityPage = lazy(() => import('./pages/Activity'));
const PlannedPage = lazy(() => import('./pages/Planned'));
const RacePage = lazy(() => import('./pages/Race'));
const Welcome = lazy(() => import('./pages/Welcome'));
const Start = lazy(() => import('./pages/Start'));
const Story = lazy(() => import('./pages/Story'));
const Review = lazy(() => import('./pages/Review'));
const Goals = lazy(() => import('./pages/Goals'));
const HealthConnect = lazy(() => import('./pages/HealthConnect'));
const NotFound = lazy(() => import('./pages/NotFound'));
const About = lazy(() => import('./pages/About'));
const Terms = lazy(() => import('./pages/Terms'));

const TABS = [
  { to: '/', label: 'Today', icon: Sun },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/progress', label: 'Progress', icon: LineChart },
  { to: '/coach', label: 'Coach', icon: MessageCircle },
  { to: '/profile', label: 'Profile', icon: User },
];

/** Pages anyone can open without an account */
const PUBLIC = ['/login', '/signup', '/forgot-password', '/reset-password', '/privacy', '/terms', '/about'];
/** Pages shown without the app's navigation */
const BARE = ['/welcome', '/start', ...PUBLIC];

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
  // A new account starts on the welcome screen
  if (data.mode === 'empty' && !data.profile.onboarded && !BARE.includes(loc.pathname) && !['/profile', '/profile/privacy', '/profile/data'].includes(loc.pathname)) return <Navigate to="/welcome" replace />;
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

function Shell() {
  const { pathname } = useLocation();
  const { session } = useApp();
  const bare = BARE.includes(pathname) || !session;
  return (
    <div className={`app${bare ? ' app-bare' : ''}`}>
      <a href="#main" className="sr-only">Skip to content</a>
      {!bare ? (
        <aside className="sidebar" aria-label="Main navigation">
          <NavLink to="/" className="sidebar-logo" aria-label="Ritmo, go to Today"><Logo variant="compact" width={112} alt="Ritmo" /></NavLink>
          <nav className="stack-sm" aria-label="Main">
            {TABS.map((t) => <NavLink key={t.to} to={t.to} end={t.to === '/'} className="navlink"><t.icon size={20} strokeWidth={2} aria-hidden="true" />{t.label}</NavLink>)}
          </nav>
          <p className="caption sidebar-foot">Train to your own rhythm.</p>
        </aside>
      ) : <span />}
      <main id="main" className={`main page${bare ? ' main-bare' : ''}`} key={pathname}>
        <SyncBanner />
        <Gate>
          <Suspense fallback={<Loading />}>
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
              <Route path="/progress" element={<Progress />} />
              <Route path="/coach" element={<Coach />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/data" element={<DataSources />} />
              <Route path="/profile/privacy" element={<Privacy />} />
              <Route path="/goals" element={<Goals />} />
              <Route path="/profile/health" element={<HealthConnect />} />
              <Route path="/welcome" element={<Welcome />} />
              <Route path="/start" element={<Start />} />
              <Route path="/story" element={<Story />} />
              <Route path="/review/:period" element={<Review />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </Gate>
        <LegacyOffer />
      </main>
      {!bare && (
        <nav className="tabbar" aria-label="Main">
          {TABS.map((t) => <NavLink key={t.to} to={t.to} end={t.to === '/'} className="tab" onClick={() => void tapHaptic()}><t.icon size={24} strokeWidth={2} aria-hidden="true" />{t.label}</NavLink>)}
        </nav>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <ThemeSync />
        <ScrollTop />
        <RecoveryRedirect />
        <SplashOnce />
        <Shell />
      </BrowserRouter>
    </AppProvider>
  );
}

