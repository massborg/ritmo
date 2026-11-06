import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Activity, CoachMessage, Plan, PlannedSession, Profile, Race, SessionFeedback, SessionType, SourceKind } from '../lib/types';
import { addDays, daysBetween, parseYmd, startOfWeek, uid, ymd } from '../lib/format';
import {
  type AppData, clearCoachInCloud, clearLegacy, clearUserCache, deleteAccount, deleteOtherPlans, deleteRaceInCloud, emptyData, friendlyError,
  loadLegacy, loadUserCache, markPulled, newPushState, pullFromCloud, pushToCloud, saveUserCache,
} from '../data/store';
import { generateSample, SAMPLE_PROFILE, SAMPLE_TODAY } from '../data/sample';
import { detailScore, merge } from '../data/integration';
import { parseFiles } from '../data/parsers';
import { setClosing, supabase } from '../data/supabase';
import { avatarDataUrl, avatarUrl, removeAvatar, uploadAvatar } from '../data/avatar';
import { healthKind, isNative, requestHealthAccess, syncHealth } from '../data/health';
import { estimateFitness, type FitnessEstimate, hrSetup, likelyRace, type HrSetup, hrZones, trainingPaces, type TrainingPaces } from '../training/fitness';
import { type LoadDay, loadSeries, readiness as computeReadiness, type Readiness } from '../training/load';
import { analyse, type Analysis, classify, type Zones } from '../training/analysis';
import { adaptPlan, buildStarterPlan, dropMissed, moveSession as movePlanSession } from '../training/plan';
import { generatePlan, type PlanProblem } from '../training/generator';
import { raceReadiness, type RaceReadiness } from '../training/insights';
import { fitnessStage, type StageInfo } from '../training/stage';
import { ask, type CoachContext } from '../coach/coach';
import { logOut } from './auth';

export interface ImportState {
  running: boolean;
  done: number;
  total: number;
  label: string;
  result?: { added: number; replaced: number; duplicates: number; skipped: { file: string; reason: string }[] };
  error?: string;
}

export interface ManualRun {
  date: string;
  durationS: number;
  distanceM: number;
  feel: SessionFeedback['feel'];
  rpe?: number;
  pain: SessionFeedback['pain'];
  notes?: string;
  sessionId?: string;
}


interface Derived {
  today: Date;
  hr: HrSetup;
  zones: Zones;
  fitness?: FitnessEstimate;
  paces?: TrainingPaces;
  stage: StageInfo;
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
  authReady: boolean;
  session: Session | null;
  recovering: boolean;
  ready: boolean;
  loadError?: string;
  data: AppData;
  syncError?: string;
  legacyOffer?: { runs: number; races: number };
  importState: ImportState;
  coachBusy: boolean;
  retryLoad: () => void;
  acceptLegacy: () => Promise<void>;
  dismissLegacy: (discard: boolean) => Promise<void>;
  loadSample: () => void;
  startFresh: () => void;
  /** End of setup: save the plan (if any) and mark setup complete */
  finishSetup: (plan?: Plan) => void;
  importFiles: (files: File[]) => Promise<void>;
  logManualRun: (r: ManualRun) => string;
  updateProfile: (p: Partial<Profile>) => void;
  saveRace: (r: Race) => void;
  deleteRace: (id: string) => void;
  logFeedback: (f: SessionFeedback) => void;
  buildMyPlan: () => string | undefined;
  moveSession: (sessionId: string, toDate: string) => void;
  handleMissed: (sessionId: string, toDate?: string) => void;
  reportIllness: (days: number) => void;
  clearIllness: () => void;
  analysisFor: (a: Activity) => Analysis;
  sendCoach: (text: string, useAi?: boolean) => Promise<void>;
  clearCoach: () => void;
  exportData: () => Promise<void>;
  deleteEverything: () => Promise<string | undefined>;
  disconnectSource: (k: SourceKind) => void;
  connectHealth: () => Promise<string | undefined>;
  syncHealthNow: (justConnected?: boolean) => Promise<void>;
  healthSyncing: boolean;
  signOut: () => Promise<void>;
  finishRecovery: () => void;
  /** Signed link to the person's own profile picture, if they have one */
  avatarSrc?: string;
  saveAvatar: (jpeg: Blob) => Promise<void>;
  /** Set when a plan could not be built as asked, with one-tap options */
  planProblem?: PlanProblem;
  applyPlanOption: (o: PlanProblem['options'][number]) => string | undefined;
  dismissPlanProblem: () => void;
  deleteAvatar: () => Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

const sampleBundle = (keep?: Partial<Profile>): AppData => {
  const s = generateSample();
  return { ...s, profile: { ...SAMPLE_PROFILE, ...pickPrefs(keep) }, mode: 'sample', coach: [], sources: [{ kind: 'sample', connected: true, lastSyncAt: new Date().toISOString(), activityCount: s.activities.length }] };
};
/** Combine account data with changes that only reached this device (e.g. the app closed before saving). */
function mergeDeviceChanges(cloud: AppData, device: AppData): AppData {
  const out = { ...cloud };
  out.activities = merge(cloud.activities, device.activities.filter((a) => !cloud.activities.some((b) => b.id === a.id))).activities;
  const fb = new Map(cloud.feedback.map((f) => [f.activityId, f]));
  for (const f of device.feedback) { const c = fb.get(f.activityId); if (!c || f.loggedAt > c.loggedAt) fb.set(f.activityId, f); }
  out.feedback = [...fb.values()];
  out.races = [...cloud.races, ...device.races.filter((r) => !cloud.races.some((x) => x.id === r.id))];
  out.coach = [...cloud.coach, ...device.coach.filter((m) => !cloud.coach.some((x) => x.id === m.id))].sort((a, b) => a.at.localeCompare(b.at));
  if (device.plan && (!cloud.plan || (device.plan.id === cloud.plan.id ? device.plan.changes.length > cloud.plan.changes.length : device.plan.createdAt > cloud.plan.createdAt))) out.plan = device.plan;
  if (JSON.stringify(device.profile) !== JSON.stringify(cloud.profile) && device.profile.onboarded && !cloud.profile.onboarded) out.profile = device.profile;
  return out;
}

/** Settings that belong to the person, not to the data set */
const pickPrefs = (p?: Partial<Profile>): Partial<Profile> => (p ? { theme: p.theme, units: p.units, healthConsentAt: p.healthConsentAt, consents: p.consents, dateOfBirth: p.dateOfBirth, avatar: p.avatar } : {});

export function AppProvider({ children }: { children: ReactNode }) {
  const [authReady, setAuthReady] = useState(!supabase);
  const [session, setSession] = useState<Session | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [data, setData] = useState<AppData>(emptyData);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [syncError, setSyncError] = useState<string>();
  const [legacyOffer, setLegacyOffer] = useState<{ runs: number; races: number }>();
  const [importState, setImportState] = useState<ImportState>({ running: false, done: 0, total: 0, label: '' });
  const [coachBusy, setCoachBusy] = useState(false);
  const [healthSyncing, setHealthSyncing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [avatarSrc, setAvatarSrc] = useState<string>();
  const [planProblem, setPlanProblem] = useState<PlanProblem>();
  const userId = session?.user.id;
  const currentUid = useRef<string | undefined>(undefined);
  const cloudLoaded = useRef(false);
  const pushState = useRef(newPushState());
  const dataRef = useRef(data);
  dataRef.current = data;

  // ---- Auth ----
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: d }) => { setSession(d.session); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ---- Load the signed-in user's data (device cache first, then the cloud) ----
  useEffect(() => {
    currentUid.current = userId;
    cloudLoaded.current = false;
    pushState.current = newPushState();
    setLegacyOffer(undefined);
    setSyncError(undefined);
    setLoadError(undefined);
    if (!userId) { setData(emptyData()); setReady(false); return; }
    let cancelled = false;
    const stale = () => cancelled || currentUid.current !== userId;
    setReady(false);
    (async () => {
      const cached = await loadUserCache(userId);
      if (stale()) return;
      if (cached) { setData(cached); setReady(true); }
      try {
        const cloud = await pullFromCloud();
        if (stale()) return;
        let next: AppData;
        if (cloud.found && cloud.data) {
          if (cloud.data.mode === 'sample') {
            next = { ...sampleBundle(cloud.data.profile), coach: cloud.data.coach ?? [] };
            // keep local-only sample edits (feedback, races) from this device
            if (cached?.mode === 'sample') next = { ...next, feedback: cached.feedback, races: cached.races, plan: cached.plan ?? next.plan };
          } else {
            next = { ...emptyData(), ...cloud.data } as AppData;
            // Changes made on this device that had not reached the account yet are kept, then saved
            if (cached?.mode === 'real') next = mergeDeviceChanges(next, cached);
          }
        } else {
          next = cached && cached.mode !== 'empty' ? cached : emptyData();
          const legacy = await loadLegacy();
          if (legacy && !stale()) setLegacyOffer({ runs: legacy.activities.length, races: legacy.races.length });
        }
        // Record what the account already holds, so anything only on this device is saved next
        markPulled(pushState.current, cloud.found && cloud.data ? ({ ...emptyData(), ...cloud.data } as AppData) : next);
        if (!cloud.found) pushState.current = newPushState();
        cloudLoaded.current = true;
        // Always a new object, so the save effect runs even when the device copy is reused unchanged
        // (e.g. the app closed before its first save reached the account).
        setData({ ...next });
        setReady(true);
      } catch (e) {
        if (stale()) return;
        if (cached) { setSyncError(`Showing data saved on this device. ${friendlyError(e)}`); setReady(true); }
        else setLoadError(friendlyError(e));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, reloadKey]);

  // ---- Save: device cache immediately, cloud shortly after (only what changed) ----
  useEffect(() => {
    if (!userId || !ready) return;
    void saveUserCache(userId, data);
  }, [data, userId, ready]);

  const pushTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!userId || !ready || !cloudLoaded.current) return;
    window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(async () => {
      if (currentUid.current !== userId) return;
      try {
        await pushToCloud(userId, dataRef.current, pushState.current);
        setSyncError(undefined);
      } catch (e) {
        setSyncError(`Your latest changes are saved on this device but not yet in your account. ${friendlyError(e)}`);
      }
    }, 1200);
  }, [data, userId, ready]);

  // Save straight away when the app is hidden or closed, rather than waiting for the timer
  useEffect(() => {
    if (!userId) return;
    const flush = () => {
      if (!ready || !cloudLoaded.current || currentUid.current !== userId) return;
      window.clearTimeout(pushTimer.current);
      setClosing(true);
      void pushToCloud(userId, dataRef.current, pushState.current).catch(() => {}).finally(() => setClosing(false));
    };
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', flush);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pagehide', flush); };
  }, [userId, ready]);

  // ---- Derived training state ----
  const derived = useMemo<Derived>(() => {
    const today = data.mode === 'sample' ? new Date(`${SAMPLE_TODAY}T09:00:00`) : new Date();
    const acts = data.activities;
    const hr = hrSetup(data.profile, acts, today);
    const zones = hrZones(hr);
    const fitness = estimateFitness(acts, hr, today, data.races);
    const stage = fitnessStage(acts, fitness, today);
    const paces = fitness && stage.paces ? trainingPaces(fitness.vdot) : undefined;
    const series = loadSeries(acts, hr, paces?.threshold[1], today, 400);

    const monthPaces = new Map<string, TrainingPaces>();
    const pacesAt = (iso: string) => {
      const k = iso.slice(0, 7);
      let p = monthPaces.get(k);
      if (!p) {
        const end = new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0);
        const f = estimateFitness(acts, hr, end > today ? today : end, data.races);
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
      if (!t) { t = a.isTimeTrial ? 'timetrial' : likelyRace(a, hr, data.races) ? 'race' : classify(a, pacesAt(a.startTime), a.streams ? zones : undefined, typicalMovingS).type; typeCache.set(a.id, t); }
      return t;
    };

    const plan = data.plan
      ? adaptPlan({ plan: data.plan, activities: acts, feedback: data.feedback, profile: data.profile, today, typeOf, paces: paces ?? trainingPaces(35) })
      : data.plan;
    const t = ymd(today);
    const todaySession = plan?.sessions.find((s) => s.date === t);
    const upcoming = data.races.filter((r) => r.date >= t).sort((a, b) => a.date.localeCompare(b.date));
    const aRace = upcoming.find((r) => r.priority === 'A') ?? upcoming[0];
    const nextRace = upcoming[0];
    let readiness = computeReadiness({ today, profile: data.profile, series, activities: acts, feedback: data.feedback, simple: !stage.predictions });
    // On a planned rest day, good readiness means the rest is working, not "go and train"
    if (todaySession?.type === 'rest' && readiness.level === 'ready') {
      readiness = { ...readiness, label: 'Recovering well', summary: `Enjoy the rest day: you are absorbing your training. You are in good shape for ${plan?.sessions.find((x) => x.date > t && x.type !== 'rest')?.title.toLowerCase() ?? 'your next session'}.` };
    }
    const aRaceReadiness = aRace && fitness && stage.predictions ? raceReadiness(aRace, acts, fitness.vdot, today) : undefined;
    return { today, hr, zones, fitness, paces, stage, series, readiness, plan, todaySession, typeOf, aRace, nextRace, aRaceReadiness, typicalMovingS };
  }, [data.activities, data.profile, data.plan, data.feedback, data.races, data.mode]);

  // Keep the plan's change log once adaptations happen
  useEffect(() => {
    if (data.mode === 'sample' || !derived.plan || !data.plan) return;
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

  // ---- Moving data from before accounts existed ----
  const acceptLegacy = async () => {
    const legacy = await loadLegacy();
    if (legacy) {
      setData((d) => {
        const base = d.mode === 'real' ? d : { ...emptyData(), mode: 'real' as const, profile: { ...legacy.profile, ...pickPrefs(d.profile), healthConsentAt: d.profile.healthConsentAt } };
        const m = merge(base.activities, legacy.activities);
        return {
          ...base, mode: 'real', activities: m.activities,
          races: [...base.races, ...legacy.races.filter((r) => !base.races.some((x) => x.id === r.id))],
          feedback: [...base.feedback, ...legacy.feedback.filter((f) => !base.feedback.some((x) => x.activityId === f.activityId))],
          plan: base.plan ?? legacy.plan,
          sources: [...base.sources.filter((s) => s.kind !== 'upload'), { kind: 'upload', connected: true, lastSyncAt: new Date().toISOString(), activityCount: m.activities.length }],
        };
      });
    }
    await clearLegacy();
    setLegacyOffer(undefined);
  };
  const dismissLegacy = async (discard: boolean) => {
    if (discard) await clearLegacy();
    setLegacyOffer(undefined);
  };

  // ---- Actions ----
  const loadSample = () => setData((d) => sampleBundle(d.profile));
  const startFresh = () => setData((d) => ({ ...emptyData(), mode: 'real', profile: { ...emptyData().profile, ...pickPrefs(d.profile) } }));

  const finishSetup = (plan?: Plan) => {
    setData((d) => {
      const bg = d.profile.background;
      const beginner = !!bg && (bg.level === 'new' || (bg.level === 'returning' && !d.activities.length));
      const profile: Profile = {
        ...d.profile, onboarded: true, setupCompletedAt: new Date().toISOString(), setupStep: 'done',
        experience: beginner ? 'new' : 'runner',
        starter: beginner ? { canRun10: !!bg?.canRun10, walksRegularly: bg?.walksRegularly ?? true, startedAt: plan?.startDate ?? ymd(new Date()) } : d.profile.starter,
      };
      const base = d.mode === 'sample' ? { ...emptyData(), mode: 'real' as const } : d;
      return { ...base, mode: 'real', profile, plan: plan ?? base.plan };
    });
    if (plan) void deleteOtherPlans(plan.id).catch(() => {});
  };

  const importFiles = async (files: File[]) => {
    setImportState({ running: true, done: 0, total: files.length, label: 'Reading files' });
    try {
      const parsed = await parseFiles(files, (done, total, label) => setImportState((s) => ({ ...s, done, total, label })));
      if (!parsed.activities.length) {
        setImportState({ running: false, done: 0, total: 0, label: '', error: parsed.skipped.length ? `No runs were found in ${parsed.skipped.length === 1 ? 'that file' : `those ${parsed.skipped.length} files`}. Check that they are FIT, GPX or TCX running files, or a Garmin export ZIP.` : 'No files were chosen.', result: { added: 0, replaced: 0, duplicates: 0, skipped: parsed.skipped } });
        return;
      }
      setData((d) => {
        const base = d.mode === 'sample' ? { ...emptyData(), mode: 'real' as const, profile: { ...emptyData().profile, ...pickPrefs(d.profile) } } : d;
        const m = merge(base.activities, parsed.activities);
        setImportState({ running: false, done: 1, total: 1, label: 'Done', result: { added: m.added, replaced: m.replaced, duplicates: m.duplicates, skipped: parsed.skipped } });
        const sources = base.sources.filter((s) => s.kind !== 'upload' && s.kind !== 'sample');
        sources.push({ kind: 'upload', connected: true, lastSyncAt: new Date().toISOString(), activityCount: m.activities.filter((a) => a.source === 'upload').length, lastError: parsed.skipped.length ? `${parsed.skipped.length} file${parsed.skipped.length > 1 ? 's' : ''} skipped` : undefined });
        return { ...base, mode: 'real', activities: m.activities, sources };
      });
    } catch (e) {
      setImportState({ running: false, done: 0, total: 0, label: '', error: `The upload failed: ${friendlyError(e)}` });
    }
  };

  const logManualRun = (r: ManualRun): string => {
    const id = `manual-${uid()}`;
    const session = derived.plan?.sessions.find((s) => s.id === r.sessionId);
    const isToday = r.date === ymd(new Date());
    const start = isToday ? new Date(Date.now() - r.durationS * 1000) : new Date(`${r.date}T12:00:00`);
    const a: Activity = {
      id, source: 'manual', sourceIds: { manual: id }, startTime: start.toISOString(),
      name: session && session.type !== 'rest' ? session.title : 'Run', sport: 'run',
      distanceM: Math.round(r.distanceM), durationS: Math.round(r.durationS), movingS: Math.round(r.durationS),
      isTimeTrial: session?.type === 'timetrial' || undefined,
      detailScore: 0, importedAt: new Date().toISOString(),
    };
    a.detailScore = detailScore(a);
    const fb: SessionFeedback = { activityId: id, feel: r.feel, rpe: r.rpe, pain: r.pain, notes: r.notes, loggedAt: new Date().toISOString() };
    setData((d) => {
      const base = d.mode === 'empty' ? { ...d, mode: 'real' as const } : d;
      const m = merge(base.activities, [a]);
      const sources = base.sources.some((s) => s.kind === 'manual') ? base.sources.map((s) => (s.kind === 'manual' ? { ...s, lastSyncAt: new Date().toISOString(), activityCount: s.activityCount + 1 } : s)) : [...base.sources, { kind: 'manual' as SourceKind, connected: true, lastSyncAt: new Date().toISOString(), activityCount: 1 }];
      return { ...base, activities: m.activities, feedback: [...base.feedback, fb], sources };
    });
    return id;
  };

  const updateProfile = (p: Partial<Profile>) => setData((d) => ({ ...d, profile: { ...d.profile, ...p } }));

  /** Builds a plan from the runner's settings. Returns the problem (and options) instead when it does not fit. */
  const makePlan = (d: AppData, race: Race | undefined, why?: string): { plan?: Plan; problem?: PlanProblem } => {
    const today = d.mode === 'sample' ? new Date(`${SAMPLE_TODAY}T09:00:00`) : new Date();
    const hr = hrSetup(d.profile, d.activities, today);
    const f = estimateFitness(d.activities, hr, today, d.races);
    if (!f) return {};
    const recent = d.activities.filter((a) => { const x = daysBetween(new Date(a.startTime), today); return x >= 0 && x < 28; });
    const longest = d.activities.filter((a) => { const x = daysBetween(new Date(a.startTime), today); return x >= 0 && x < 42; }).reduce((m, a) => Math.max(m, a.distanceM), 0);
    const res = generatePlan({ today, profile: d.profile, race, paces: trainingPaces(f.vdot), recentWeeklyKm: recent.reduce((x, a) => x + a.distanceM, 0) / 4000, longestRecentKm: longest / 1000, pacesFrom: f.basedOn });
    if (!res.ok) return { problem: res.problem };
    const plan = res.plan;
    if (res.warnings.length) plan.changes[0].summary += ` ${res.warnings.join(' ')}`;
    if (d.plan) {
      const past = d.plan.sessions.filter((s) => s.date < plan.startDate && s.date >= ymd(startOfWeek(parseYmd(plan.startDate))));
      plan.sessions = [...past, ...plan.sessions];
      plan.changes = [...d.plan.changes, { ...plan.changes[0], id: uid(), summary: why ? `${why} ${plan.changes[0].summary}` : plan.changes[0].summary }];
    }
    return { plan };
  };
  const rebuild = (d: AppData, race: Race | undefined, why?: string): Plan | undefined => {
    const r = makePlan(d, race, why);
    if (r.problem) { setPlanProblem(r.problem); return d.plan; }
    return r.plan ?? d.plan;
  };

  const saveRace = (r: Race) => setData((d) => {
    const prev = d.races.find((x) => x.id === r.id);
    const races = prev ? d.races.map((x) => (x.id === r.id ? r : x)) : [...d.races, r];
    let plan = d.plan;
    if (d.plan?.raceId === r.id && prev && prev.date !== r.date) plan = rebuild({ ...d, races }, r, `${r.name} moved from ${prev.date} to ${r.date}, so the plan was rebuilt around the new date.`);
    return { ...d, races, plan };
  });
  const deleteRace = (id: string) => {
    setData((d) => ({ ...d, races: d.races.filter((r) => r.id !== id) }));
    if (dataRef.current.mode === 'real') deleteRaceInCloud(id).catch((e) => setSyncError(`The race was removed here but not from your account. ${friendlyError(e)}`));
  };

  const logFeedback = (f: SessionFeedback) => setData((d) => ({ ...d, feedback: [...d.feedback.filter((x) => x.activityId !== f.activityId), f] }));

  /** Returns a message when a plan cannot be built, so nothing fails silently. */
  const buildMyPlan = (): string | undefined => {
    const d = dataRef.current;
    if (d.profile.experience === 'new' && !derived.stage.predictions) {
      const st = d.profile.starter ?? { canRun10: false, walksRegularly: true, startedAt: ymd(new Date()) };
      const plan = buildStarterPlan({ today: new Date(), profile: d.profile, canRun10: st.canRun10, walksRegularly: st.walksRegularly });
      setData((x) => ({ ...x, plan }));
      void deleteOtherPlans(plan.id).catch(() => {});
      return undefined;
    }
    if (!derived.fitness) {
      return d.activities.length
        ? 'Ritmo needs a few runs with time and distance from the last four months to build a plan. Log a run or upload more recent files.'
        : 'Ritmo needs some running history to build a plan. Upload your files, log a run, or choose "I\'m new to running" for a starter plan.';
    }
    return finishBuild(d);
  };
  const aRaceOf = (d: AppData) => {
    const t = ymd(d.mode === 'sample' ? parseYmd(SAMPLE_TODAY) : new Date());
    return d.races.filter((r) => r.date >= t).sort((a, b) => (a.priority === b.priority ? a.date.localeCompare(b.date) : a.priority.localeCompare(b.priority)))[0];
  };
  const finishBuild = (d: AppData): string | undefined => {
    const r = makePlan({ ...d, plan: undefined }, aRaceOf(d));
    if (r.problem) { setPlanProblem(r.problem); return undefined; }
    if (!r.plan) return 'The plan could not be built. Please try again.';
    const plan = r.plan;
    setPlanProblem(undefined);
    setData((x) => ({ ...x, plan, profile: { ...x.profile, experience: x.profile.experience ?? 'runner' } }));
    if (d.mode === 'real') void deleteOtherPlans(plan.id).catch(() => {});
    return undefined;
  };
  /** One tap on a "does not fit" option: save the change to the runner's settings, then build again. */
  const applyPlanOption = (o: PlanProblem['options'][number]) => {
    const d = dataRef.current;
    const profile: Profile = { ...d.profile, ...(o.daysAvailable ? { daysAvailable: o.daysAvailable } : {}), training: { ...d.profile.training, ...o.training } };
    setData((x) => ({ ...x, profile: { ...x.profile, ...(o.daysAvailable ? { daysAvailable: o.daysAvailable } : {}), training: { ...x.profile.training, ...o.training } } }));
    return finishBuild({ ...d, profile });
  };

  const moveSession = (sessionId: string, toDate: string) => setData((d) => (d.plan ? { ...d, plan: movePlanSession(derived.plan ?? d.plan, sessionId, toDate) } : d));
  /** A missed key session: move it to a safe day this week, or let it go */
  const handleMissed = (sessionId: string, toDate?: string) => setData((d) => {
    if (!d.plan) return d;
    const base = derived.plan ?? d.plan;
    const from = base.sessions.find((x) => x.id === sessionId)?.date;
    const moved = toDate ? movePlanSession(base, sessionId, toDate) : base;
    return { ...d, plan: dropMissed(moved, sessionId, toDate ? from : undefined) };
  });

  const reportIllness = (days: number) => updateProfile({ illnessUntil: ymd(addDays(derived.today, days - 1)) });
  const clearIllness = () => updateProfile({ illnessUntil: undefined });

  const sendCoach = async (text: string, useAi?: boolean) => {
    const mode = data.mode === 'sample' ? 'sample' as const : 'real' as const;
    const msg: CoachMessage = { id: uid(), role: 'runner', text, at: new Date().toISOString(), mode };
    setData((d) => ({ ...d, coach: [...d.coach, msg] }));
    setCoachBusy(true);
    try {
      const t = ymd(derived.today);
      const wk = ymd(startOfWeek(derived.today));
      const weekEnd = ymd(addDays(startOfWeek(derived.today), 6));
      const last = [...data.activities].sort((a, b) => b.startTime.localeCompare(a.startTime))[0];
      const weekSessions = (derived.plan?.sessions ?? []).filter((s) => s.date >= wk && s.date <= weekEnd && s.type !== 'rest');
      const ctx: CoachContext = {
        today: derived.today, profile: data.profile, units: data.profile.units, readiness: derived.readiness, stage: derived.stage,
        todaySession: derived.todaySession, nextSessions: (derived.plan?.sessions ?? []).filter((s) => s.date > t && s.type !== 'rest').slice(0, 3),
        race: derived.aRace, raceReadiness: derived.aRaceReadiness, fitness: derived.stage.predictions ? derived.fitness : undefined, paces: derived.paces,
        weekDoneM: data.activities.filter((a) => a.startTime.slice(0, 10) >= wk && a.startTime.slice(0, 10) <= t).reduce((x, a) => x + a.distanceM, 0),
        weekPlannedM: weekSessions.reduce((x, s) => x + s.distanceM, 0),
        weekSessionsDone: weekSessions.filter((s) => s.status === 'done').length,
        weekSessionsPlanned: weekSessions.length,
        planSessionsDone: (derived.plan?.sessions ?? []).filter((s) => s.status === 'done').length,
        planSessionsTotal: (derived.plan?.sessions ?? []).filter((s) => s.type !== 'rest').length,
        runCount: data.activities.length,
        last: last ? { activity: last, analysis: analysisFor(last) } : undefined,
        hasData: data.activities.length > 0 || !!derived.plan,
        weekAhead: (derived.plan?.sessions ?? []).filter((s) => s.date >= wk && s.date <= ymd(addDays(derived.today, 7))),
        weekTargetKm: derived.plan?.weeks?.find((w) => w.start === wk)?.targetKm,
        maxEasyMin: data.profile.training?.maxEasyMin ?? 90,
      };
      const reply = await ask(text, ctx, data.coach.filter((m) => (m.mode ?? 'real') === mode).map((m) => ({ role: m.role, text: m.text })), useAi ?? !!dataRef.current.profile.consents?.aiCoach?.granted);
      setData((d) => ({ ...d, coach: [...d.coach, { id: uid(), role: 'coach', text: reply.text, at: new Date().toISOString(), facts: reply.facts, mode }] }));
    } catch {
      setData((d) => ({ ...d, coach: [...d.coach, { id: uid(), role: 'coach', text: 'Sorry, I could not answer that just now. Please try again in a moment.', at: new Date().toISOString(), mode }] }));
    } finally {
      setCoachBusy(false);
    }
  };
  const clearCoach = () => {
    setData((d) => ({ ...d, coach: [] }));
    pushState.current.coach.clear();
    clearCoachInCloud().catch((e) => setSyncError(`The chat was cleared here but not in your account. ${friendlyError(e)}`));
  };

  const exportData = async () => {
    const picture = data.profile.avatar ? await avatarDataUrl(data.profile.avatar.path) : undefined;
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), app: 'Ritmo', account: { email: session?.user.email, createdAt: session?.user.created_at }, profilePicture: picture, ...data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ritmo-export-${ymd(new Date())}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** Deletes the account and all cloud data, then clears this device. */
  const deleteEverything = async (): Promise<string | undefined> => {
    try {
      await deleteAccount();
    } catch (e) {
      return `Your account could not be deleted: ${friendlyError(e)} Nothing has been removed.`;
    }
    const uid = userId;
    await logOut();
    if (uid) await clearUserCache(uid);
    return undefined;
  };

  const disconnectSource = (k: SourceKind) => setData((d) => ({ ...d, sources: d.sources.map((s) => (s.kind === k ? { ...s, connected: false } : s)) }));

  // ---- Apple Health / Health Connect (phone app only) ----
  const syncHealthNow = async (justConnected = false) => {
    const kind = healthKind();
    if (!kind) return;
    const src = dataRef.current.sources.find((x) => x.kind === kind);
    if (!justConnected && !src?.connected) return;
    setHealthSyncing(true);
    try {
      const since = src?.lastSyncAt ? new Date(new Date(src.lastSyncAt).getTime() - 2 * 86400000).toISOString() : undefined;
      const runs = await syncHealth(since);
      setData((d) => {
        const base = d.mode === 'sample' ? { ...emptyData(), mode: 'real' as const, profile: { ...emptyData().profile, ...pickPrefs(d.profile) } } : d;
        const m = merge(base.activities, runs);
        const sources = base.sources.filter((x) => x.kind !== kind && x.kind !== 'sample');
        sources.push({ kind, connected: true, lastSyncAt: new Date().toISOString(), activityCount: m.activities.filter((a) => a.sourceIds[kind]).length });
        return { ...base, mode: 'real', activities: m.activities, sources };
      });
    } catch (e) {
      setData((d) => ({ ...d, sources: d.sources.map((x) => (x.kind === kind ? { ...x, lastError: `Sync failed: ${friendlyError(e)}` } : x)) }));
    } finally {
      setHealthSyncing(false);
    }
  };
  const connectHealth = async () => {
    const kind = healthKind();
    if (!kind) return 'Available in the iPhone and Android apps.';
    try {
      const r = await requestHealthAccess();
      if (!r.granted) return r.message;
      setData((d) => ({ ...d, sources: [...d.sources.filter((x) => x.kind !== kind), { kind, connected: true, activityCount: 0 }] }));
      void syncHealthNow(true);
      return r.message;
    } catch (e) {
      return friendlyError(e);
    }
  };
  const syncHealthNowRef = useRef(syncHealthNow);
  syncHealthNowRef.current = syncHealthNow;
  useEffect(() => {
    if (!isNative() || !ready) return;
    let remove: (() => void) | undefined;
    import('@capacitor/app').then(({ App }) => {
      App.addListener('resume', () => { void syncHealthNowRef.current(); }).then((h) => { remove = () => h.remove(); });
    });
    void syncHealthNowRef.current();
    return () => remove?.();
  }, [ready]);

  // ---- Profile picture (private; never sent to the coach) ----
  const avatarPath = data.profile.avatar?.path;
  const avatarStamp = data.profile.avatar?.updatedAt;
  useEffect(() => {
    if (!avatarPath || !userId) { setAvatarSrc(undefined); return; }
    let live = true;
    avatarUrl(avatarPath).then((u) => { if (live) setAvatarSrc(u ? `${u}&v=${encodeURIComponent(avatarStamp ?? '')}` : undefined); });
    return () => { live = false; };
  }, [avatarPath, avatarStamp, userId]);
  const saveAvatar = async (jpeg: Blob) => {
    if (!userId) throw new Error('Log in to add a profile picture.');
    let path: string;
    try { path = await uploadAvatar(userId, jpeg); } catch (e) { throw new Error(friendlyError(e)); }
    setAvatarSrc(URL.createObjectURL(jpeg));
    updateProfile({ avatar: { path, updatedAt: new Date().toISOString() } });
  };
  const deleteAvatar = async () => {
    const path = dataRef.current.profile.avatar?.path;
    if (path) { try { await removeAvatar(path); } catch (e) { throw new Error(friendlyError(e)); } }
    setAvatarSrc(undefined);
    updateProfile({ avatar: undefined });
  };

  /** Log out: clear this device, keep everything in the account. */
  const signOut = async () => {
    const uid = userId;
    window.clearTimeout(pushTimer.current);
    await logOut(); // session ends first, so nothing saves to this device afterwards
    if (uid) await clearUserCache(uid);
  };

  const value: Ctx = {
    ...derived, authReady, session, recovering, ready, loadError, data, syncError, legacyOffer, importState, coachBusy,
    retryLoad: () => setReloadKey((k) => k + 1), acceptLegacy, dismissLegacy,
    loadSample, startFresh, finishSetup, importFiles, logManualRun, updateProfile, saveRace, deleteRace, logFeedback, buildMyPlan, moveSession, handleMissed,
    reportIllness, clearIllness, analysisFor, sendCoach, clearCoach, exportData, deleteEverything, disconnectSource, connectHealth, syncHealthNow, healthSyncing,
    signOut, finishRecovery: () => setRecovering(false), avatarSrc, saveAvatar, deleteAvatar, planProblem, applyPlanOption, dismissPlanProblem: () => setPlanProblem(undefined),
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
