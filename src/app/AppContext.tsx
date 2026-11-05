import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Activity, CoachMessage, Plan, PlannedSession, Profile, Race, SessionFeedback, SessionType, SourceKind } from '../lib/types';
import { addDays, daysBetween, parseYmd, startOfWeek, uid, ymd } from '../lib/format';
import { type AppData, clearLocal, deleteCloudData, emptyData, loadLocal, pullFromCloud, pushToCloud, saveLocal } from '../data/store';
import { generateSample, SAMPLE_TODAY } from '../data/sample';
import { merge } from '../data/integration';
import { parseFiles } from '../data/parsers';
import { supabase } from '../data/supabase';
import { estimateFitness, type FitnessEstimate, hrSetup, type HrSetup, hrZones, trainingPaces, type TrainingPaces } from '../training/fitness';
import { type LoadDay, loadSeries, readiness as computeReadiness, type Readiness } from '../training/load';
import { analyse, type Analysis, classify, type Zones } from '../training/analysis';
import { adaptPlan, buildPlan, moveSession as movePlanSession } from '../training/plan';
import { raceReadiness, type RaceReadiness } from '../training/insights';
import { ask, type CoachContext } from '../coach/coach';

export interface ImportState {
  running: boolean;
  done: number;
  total: number;
  label: string;
  result?: { added: number; replaced: number; duplicates: number; skipped: { file: string; reason: string }[] };
  error?: string;
}

interface Derived {
  today: Date;
  hr: HrSetup;
  zones: Zones;
  fitness?: FitnessEstimate;
  paces?: TrainingPaces;
  series: LoadDay[];
  readiness: Readiness;
  plan?: Plan;
  todaySession?: PlannedSession;
  typeOf: (a: Activity) => SessionType;
  aRace?: Race;
  nextRace?: Race;
  aRaceReadiness?: RaceReadiness;
  typicalMovingS: number;
}

interface Ctx extends Derived {
  ready: boolean;
  data: AppData;
  session: Session | null;
  cloudError?: string;
  importState: ImportState;
  coachBusy: boolean;
  loadSample: () => void;
  startFresh: () => void;
  importFiles: (files: File[]) => Promise<void>;
  updateProfile: (p: Partial<Profile>) => void;
  saveRace: (r: Race) => void;
  deleteRace: (id: string) => void;
  logFeedback: (f: SessionFeedback) => void;
  buildMyPlan: () => void;
  moveSession: (sessionId: string, toDate: string) => void;
  reportIllness: (days: number) => void;
  clearIllness: () => void;
  analysisFor: (a: Activity) => Analysis;
  sendCoach: (text: string) => Promise<void>;
  clearCoach: () => void;
  exportData: () => void;
  deleteAll: () => Promise<void>;
  disconnectSource: (k: SourceKind) => void;
  signIn: (email: string) => Promise<string | undefined>;
  signOut: () => Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [cloudError, setCloudError] = useState<string>();
  const [importState, setImportState] = useState<ImportState>({ running: false, done: 0, total: 0, label: '' });
  const [coachBusy, setCoachBusy] = useState(false);
  const firstLoad = useRef(true);

  // ---- Load ----
  useEffect(() => {
    (async () => {
      const local = await loadLocal();
      if (local && local.mode !== 'empty') setData(local);
      else setData({ ...generateSample(), mode: 'sample', coach: [], sources: [{ kind: 'sample', connected: true, lastSyncAt: new Date().toISOString(), activityCount: 0 }] });
      setReady(true);
    })();
    if (supabase) {
      supabase.auth.getSession().then(({ data: d }) => setSession(d.session));
      const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
      return () => sub.subscription.unsubscribe();
    }
  }, []);

  // ---- Save locally on every change; mirror real data to the cloud ----
  useEffect(() => {
    if (!ready) return;
    if (firstLoad.current) { firstLoad.current = false; return; }
    saveLocal(data);
  }, [data, ready]);

  useEffect(() => {
    if (!ready || !session) return;
    let cancelled = false;
    (async () => {
      if (data.mode !== 'real') {
        const remote = await pullFromCloud();
        if (remote && !cancelled) setData((d) => ({ ...d, ...remote, coach: d.coach, sources: d.sources.length ? d.sources : [{ kind: 'upload', connected: true, activityCount: remote.activities?.length ?? 0, lastSyncAt: new Date().toISOString() }] } as AppData));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, ready]);

  const pushTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!ready || !session || data.mode !== 'real') return;
    window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(async () => setCloudError(await pushToCloud(data)), 1500);
  }, [data, session, ready]);

  // ---- Derived training state ----
  const derived = useMemo<Derived>(() => {
    const today = data.mode === 'sample' ? new Date(`${SAMPLE_TODAY}T09:00:00`) : new Date();
    const acts = data.activities;
    const hr = hrSetup(data.profile, acts, today);
    const zones = hrZones(hr);
    const fitness = estimateFitness(acts, hr, today);
    const paces = fitness ? trainingPaces(fitness.vdot) : undefined;
    const series = loadSeries(acts, hr, paces?.threshold[1], today, 400);

    // Paces at the time of each run (monthly), so old runs are judged against fitness back then
    const monthPaces = new Map<string, TrainingPaces>();
    const pacesAt = (iso: string) => {
      const k = iso.slice(0, 7);
      let p = monthPaces.get(k);
      if (!p) {
        const end = new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0);
        const f = estimateFitness(acts, hr, end > today ? today : end);
        p = f ? trainingPaces(f.vdot) : paces ?? trainingPaces(40);
        monthPaces.set(k, p);
      }
      return p;
    };
    const recent = acts.filter((a) => daysBetween(new Date(a.startTime), today) <= 90).map((a) => a.movingS).sort((a, b) => a - b);
    const typicalMovingS = recent.length ? recent[Math.floor(recent.length / 2)] : 45 * 60;
    const typeCache = new Map<string, SessionType>();
    const typeOf = (a: Activity) => {
      let t = typeCache.get(a.id);
      if (!t) { t = classify(a, pacesAt(a.startTime), a.streams ? zones : undefined, typicalMovingS).type; typeCache.set(a.id, t); }
      return t;
    };

    const plan = data.plan && paces
      ? adaptPlan({ plan: data.plan, activities: acts, feedback: data.feedback, profile: data.profile, today, typeOf, paces })
      : data.plan;
    const t = ymd(today);
    const todaySession = plan?.sessions.find((s) => s.date === t);
    const upcoming = data.races.filter((r) => r.date >= t).sort((a, b) => a.date.localeCompare(b.date));
    const aRace = upcoming.find((r) => r.priority === 'A') ?? upcoming[0];
    const nextRace = upcoming[0];
    const readiness = computeReadiness({ today, profile: data.profile, series, activities: acts, feedback: data.feedback });
    const aRaceReadiness = aRace && fitness ? raceReadiness(aRace, acts, fitness.vdot, today) : undefined;
    return { today, hr, zones, fitness, paces, series, readiness, plan, todaySession, typeOf, aRace, nextRace, aRaceReadiness, typicalMovingS };
  }, [data.activities, data.profile, data.plan, data.feedback, data.races, data.mode]);

  // Persist new plan changes for real data so the log is kept
  useEffect(() => {
    if (data.mode !== 'real' || !derived.plan || !data.plan) return;
    if (derived.plan.changes.length !== data.plan.changes.length) setData((d) => ({ ...d, plan: derived.plan }));
  }, [derived.plan, data.plan, data.mode]);

  const analysisCache = useRef(new Map<string, Analysis>());
  useEffect(() => { analysisCache.current.clear(); }, [derived, data.feedback]);
  const analysisFor = useCallback((a: Activity) => {
    const hit = analysisCache.current.get(a.id);
    if (hit) return hit;
    const planned = derived.plan?.sessions.find((s) => s.completedActivityId === a.id);
    const res = analyse({
      a, all: data.activities, paces: derived.paces ?? trainingPaces(40), zones: a.avgHr ? derived.zones : undefined,
      typicalMovingS: derived.typicalMovingS, planned, feedback: data.feedback.find((f) => f.activityId === a.id),
      pastFeedback: data.feedback.filter((f) => f.activityId !== a.id && daysBetween(new Date(f.loggedAt), new Date(a.startTime)) <= 30 && f.loggedAt < a.startTime),
      units: data.profile.units, typeOf: derived.typeOf,
    });
    analysisCache.current.set(a.id, res);
    return res;
  }, [derived, data.activities, data.feedback, data.profile.units]);

  // ---- Actions ----
  const loadSample = () => setData({ ...generateSample(), mode: 'sample', coach: [], sources: [{ kind: 'sample', connected: true, lastSyncAt: new Date().toISOString(), activityCount: 0 }] });
  const startFresh = () => setData({ ...emptyData(), mode: 'real' });

  const importFiles = async (files: File[]) => {
    setImportState({ running: true, done: 0, total: files.length, label: 'Reading files' });
    try {
      const parsed = await parseFiles(files, (done, total, label) => setImportState((s) => ({ ...s, done, total, label })));
      setData((d) => {
        const base = d.mode === 'sample' ? { ...emptyData(), mode: 'real' as const, profile: { ...d.profile, onboarded: false, name: '' } } : d;
        const m = merge(base.activities, parsed.activities);
        setImportState({ running: false, done: 1, total: 1, label: 'Done', result: { added: m.added, replaced: m.replaced, duplicates: m.duplicates, skipped: parsed.skipped } });
        const sources = base.sources.filter((s) => s.kind !== 'upload' && s.kind !== 'sample');
        sources.push({ kind: 'upload', connected: true, lastSyncAt: new Date().toISOString(), activityCount: m.activities.filter((a) => a.source === 'upload').length, lastError: parsed.skipped.length ? `${parsed.skipped.length} file${parsed.skipped.length > 1 ? 's' : ''} skipped` : undefined });
        return { ...base, mode: 'real', activities: m.activities, sources };
      });
    } catch (e) {
      setImportState({ running: false, done: 0, total: 0, label: '', error: (e as Error).message });
    }
  };

  const updateProfile = (p: Partial<Profile>) => setData((d) => ({ ...d, profile: { ...d.profile, ...p } }));

  const rebuild = (d: AppData, race: Race | undefined, why?: string): Plan | undefined => {
    const today = d.mode === 'sample' ? new Date(`${SAMPLE_TODAY}T09:00:00`) : new Date();
    const hr = hrSetup(d.profile, d.activities, today);
    const f = estimateFitness(d.activities, hr, today);
    if (!f) return d.plan;
    const recent = d.activities.filter((a) => { const x = daysBetween(new Date(a.startTime), today); return x >= 0 && x < 28; });
    const longest = d.activities.filter((a) => { const x = daysBetween(new Date(a.startTime), today); return x >= 0 && x < 42; }).reduce((m, a) => Math.max(m, a.distanceM), 0);
    const plan = buildPlan({ today, profile: d.profile, race, paces: trainingPaces(f.vdot), recentWeeklyKm: recent.reduce((x, a) => x + a.distanceM, 0) / 4000, longestRecentKm: longest / 1000 });
    // keep what already happened this week
    if (d.plan) {
      const past = d.plan.sessions.filter((s) => s.date < ymd(today) && s.date >= plan.startDate);
      plan.sessions = [...past, ...plan.sessions.filter((s) => s.date >= ymd(today))];
      plan.changes = [...d.plan.changes, { ...plan.changes[0], id: uid(), summary: why ? `${why} ${plan.changes[0].summary}` : plan.changes[0].summary }];
    }
    return plan;
  };

  const saveRace = (r: Race) => setData((d) => {
    const prev = d.races.find((x) => x.id === r.id);
    const races = prev ? d.races.map((x) => (x.id === r.id ? r : x)) : [...d.races, r];
    let plan = d.plan;
    const isPlanRace = d.plan?.raceId === r.id;
    if (isPlanRace && prev && prev.date !== r.date) plan = rebuild({ ...d, races }, r, `${r.name} moved from ${prev.date} to ${r.date}, so the plan was rebuilt around the new date.`);
    return { ...d, races, plan };
  });
  const deleteRace = (id: string) => setData((d) => ({ ...d, races: d.races.filter((r) => r.id !== id) }));

  const logFeedback = (f: SessionFeedback) => setData((d) => ({ ...d, feedback: [...d.feedback.filter((x) => x.activityId !== f.activityId), f] }));

  const buildMyPlan = () => setData((d) => {
    const t = ymd(d.mode === 'sample' ? parseYmd(SAMPLE_TODAY) : new Date());
    const race = d.races.filter((r) => r.date >= t).sort((a, b) => (a.priority === b.priority ? a.date.localeCompare(b.date) : a.priority.localeCompare(b.priority)))[0];
    return { ...d, plan: rebuild({ ...d, plan: undefined }, race) };
  });

  const moveSession = (sessionId: string, toDate: string) => setData((d) => (d.plan ? { ...d, plan: movePlanSession(derived.plan ?? d.plan, sessionId, toDate) } : d));

  const reportIllness = (days: number) => updateProfile({ illnessUntil: ymd(addDays(derived.today, days - 1)) });
  const clearIllness = () => updateProfile({ illnessUntil: undefined });

  const sendCoach = async (text: string) => {
    const msg: CoachMessage = { id: uid(), role: 'runner', text, at: new Date().toISOString() };
    setData((d) => ({ ...d, coach: [...d.coach, msg] }));
    setCoachBusy(true);
    const t = ymd(derived.today);
    const wk = ymd(startOfWeek(derived.today));
    const weekEnd = ymd(addDays(startOfWeek(derived.today), 6));
    const last = [...data.activities].sort((a, b) => b.startTime.localeCompare(a.startTime))[0];
    const ctx: CoachContext = {
      today: derived.today, profile: data.profile, units: data.profile.units, readiness: derived.readiness,
      todaySession: derived.todaySession, nextSessions: (derived.plan?.sessions ?? []).filter((s) => s.date > t && s.type !== 'rest').slice(0, 3),
      race: derived.aRace, raceReadiness: derived.aRaceReadiness, fitness: derived.fitness, paces: derived.paces,
      weekDoneM: data.activities.filter((a) => a.startTime.slice(0, 10) >= wk && a.startTime.slice(0, 10) <= t).reduce((x, a) => x + a.distanceM, 0),
      weekPlannedM: (derived.plan?.sessions ?? []).filter((s) => s.date >= wk && s.date <= weekEnd).reduce((x, s) => x + s.distanceM, 0),
      last: last ? { activity: last, analysis: analysisFor(last) } : undefined,
      hasData: data.activities.length > 0,
    };
    const reply = await ask(text, ctx, data.coach.map((m) => ({ role: m.role, text: m.text })));
    setData((d) => ({ ...d, coach: [...d.coach, { id: uid(), role: 'coach', text: reply.text, at: new Date().toISOString(), facts: reply.facts }] }));
    setCoachBusy(false);
  };
  const clearCoach = () => setData((d) => ({ ...d, coach: [] }));

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), app: 'Ritmo', ...data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ritmo-export-${ymd(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const deleteAll = async () => {
    if (session) setCloudError(await deleteCloudData());
    await clearLocal();
    setData({ ...emptyData(), mode: 'real' });
  };

  const disconnectSource = (k: SourceKind) => setData((d) => ({ ...d, sources: d.sources.map((s) => (s.kind === k ? { ...s, connected: false } : s)) }));

  const signIn = async (email: string) => {
    if (!supabase) return 'Cloud sync is not configured for this build.';
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + '/profile' } });
    return error?.message;
  };
  const signOut = async () => { await supabase?.auth.signOut(); };

  const value: Ctx = {
    ...derived, ready, data, session, cloudError, importState, coachBusy,
    loadSample, startFresh, importFiles, updateProfile, saveRace, deleteRace, logFeedback, buildMyPlan, moveSession,
    reportIllness, clearIllness, analysisFor, sendCoach, clearCoach, exportData, deleteAll, disconnectSource, signIn, signOut,
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
