import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, LineChart, MessageCircle, Sun, User } from 'lucide-react';
import { AppProvider, useApp } from './app/AppContext';
import { Logo } from './components/ui';
import Today from './pages/Today';
import { getSplashVariant, Splash } from './components/Splash';

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
const Story = lazy(() => import('./pages/Story'));
const Review = lazy(() => import('./pages/Review'));
const Goals = lazy(() => import('./pages/Goals'));
const SplashPicker = lazy(() => import('./pages/SplashPicker'));

const TABS = [
  { to: '/', label: 'Today', icon: Sun },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/progress', label: 'Progress', icon: LineChart },
  { to: '/coach', label: 'Coach', icon: MessageCircle },
  { to: '/profile', label: 'Profile', icon: User },
];

function ThemeSync() {
  const { data } = useApp();
  useEffect(() => {
    const t = data.profile.theme;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }, [data.profile.theme]);
  return null;
}

function FirstVisit() {
  const nav = useNavigate();
  const loc = useLocation();
  const { ready } = useApp();
  useEffect(() => {
    if (!ready) return;
    let seen = false;
    try { seen = localStorage.getItem('ritmo:welcomed') === '1'; } catch { seen = true; }
    if (!seen && loc.pathname === '/') nav('/welcome', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  return null;
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function Shell() {
  const { ready } = useApp();
  const { pathname } = useLocation();
  const bare = pathname.startsWith('/welcome');
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
      <main id="main" className="main page" key={pathname}>
        {!ready ? (
          <div className="stack" aria-busy="true" aria-label="Loading">
            <div className="skeleton" style={{ height: 40, width: 220 }} />
            <div className="skeleton" style={{ height: 220 }} />
            <div className="skeleton" style={{ height: 120 }} />
          </div>
        ) : (
          <Suspense fallback={<div className="skeleton" style={{ height: 240 }} aria-label="Loading" />}>
            <Routes>
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
              <Route path="/profile/opening" element={<SplashPicker />} />
              <Route path="/welcome" element={<Welcome />} />
              <Route path="/story" element={<Story />} />
              <Route path="/review/:period" element={<Review />} />
              <Route path="*" element={<Today />} />
            </Routes>
          </Suspense>
        )}
      </main>
      {!bare && (
        <nav className="tabbar" aria-label="Main">
          {TABS.map((t) => <NavLink key={t.to} to={t.to} end={t.to === '/'} className="tab"><t.icon size={24} strokeWidth={2} aria-hidden="true" />{t.label}</NavLink>)}
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
        <FirstVisit />
        <ScrollTop />
        <Splash variant={getSplashVariant()} />
        <Shell />
      </BrowserRouter>
    </AppProvider>
  );
}
