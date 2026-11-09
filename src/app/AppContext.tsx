import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Activity, CoachMessage, Lap, LogEntry, StreamPoint, Plan, PlanAdjust, PlannedSession, Profile, Race, SessionFeedback, SessionType, SourceKind } from '../lib/types';
import { combineRuns, forStats, withDistance } from '../data/quality';
import { inWeatherWindow, requestWeather } from '../data/weather';
import { addDays, daysBetween, parseYmd, startOfWeek, uid, ymd } from '../lib/format';
import {
  type AppData, clearCoachInCloud, clearLegacy, clearUserCache, deleteAccount, deleteOtherPlans, deleteRaceInCloud, deleteRunsInCloud, emptyData, friendlyError,
  actPrint, type CachedData, deriveMissing, loadLegacy, loadUserCache, markPulled, newPushState, pullFromCloud, pushActivities, pushToCloud, saveUserCache,
} from '../data/store';
import { generateSample, SAMPLE_PROFILE, SAMPLE_TODAY } from '../data/sample';
import { detailScore, merge } from '../data/integration';
import { type ParsedFile, parseFiles } from '../data/parsers';
import { setClosing, supabase } from '../data/supabase';
import { avatarDataUrl, avatarUrl, removeAvatar, uploadAvatar } from '../data/avatar';
import { disablePush, refreshPush } from '../data/push';
import { healthKind, isNative, requestHealthAccess, syncHealth } from '../data/health';
import { disconnectGarmin, finishGarminConnect, garminConnected, pullGarminInbox, startGarminConnect } from '../data/garmin';
import { disconnectStrava, finishStravaConnect, isStravaRun, pullStravaInbox, startStravaConnect, stravaConnected } from '../data/strava';
import { estimateFitness, type FitnessEstimate, hrSetup, likelyRace, type HrSetup, hrZones, trainingPaces, type TrainingPaces, hrCheck, type HrCheck } from '../training/fitness';
import { type LoadDay, loadSeries, type Readiness } from '../training/load';
import { asReadiness, readinessScore, type ReadinessScore } from '../training/readiness';
import { analyse, type Analysis, classify, type Zones, TYPE_LABEL, SESSION_SHORT } from '../training/analysis';
import { DERIVED_VERSION } from '../training/derive';
import { groupIndex, groupRuns, type RunGroup } from '../training/sessions';
import { activeNiggle, applyBody, areaLabel, type BodyCheckin, type BodyState, DISCLAIMER, redFlags, stepUnlocked, textRedFlags, WHEN_LABEL } from '../training/body';
import { adaptPlan, buildStarterPlan, dropMissed, moveSession as movePlanSession, swapSession, type SwapKind } from '../training/plan';
import { generatePlan, type PlanProblem } from '../training/generator';
import { raceReadiness, type RaceReadiness } from '../training/insights';
import { fitnessStage, type StageInfo } from '../training/stage';
import { ask, askBody, type CoachContext } from '../coach/coach';
import { logOut } from './auth';

export interface ImportState {
  running: boolean;
  done: number;
  total: number;
  label: string;
  result?: { found: number; added: number; replaced: number; duplicates: number; skipped: ParsedFile['skipped'] };
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
  avgHr?: number;
  reps?: Activity['reps'];
  media?: string[];
  /** Start time of day (HH:MM), when known */
  time?: string;
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
  /** Today's readiness score with its factors (brief 4A) */
  readinessToday: ReadinessScore;
  plan?: Plan;
  todaySession?: PlannedSession;
  typeOf: (a: Activity) => SessionType;
  /** Heart-rate zones look set too low (a run above max HR, or easy runs reading Z3): suggest checking them */
  hrIssue?: HrCheck;
  /** The run's label on every screen, e.g. "Easy run · swapped from intervals" */
  labelOf: (a: Activity) => string;
  /** The planned session this run completed or replaced */
  sessionOfRun: (activityId: string) => PlannedSession | undefined;
  aRace?: Race;
  nextRace?: Race;
  aRaceReadiness?: RaceReadiness;
  typicalMovingS: number;
  /** One source of truth for the numbers every screen and the coach show */
  athlete: AthleteState;
  /** The session a run belongs to (warm-up, main run and cool-down saved as separate files) */
  groupOf: (id: string) => RunGroup | undefined;
}

export interface AthleteState {
  runCount: number;
  totalM: number;
  /** Monday to today */
  weekM: number;
  weekRuns: number;
  lastRun?: Activity;
  /** Plan sessions dated today or earlier (the ones that can be done so far) */
  planDueSoFar: number;
  planDoneSoFar: number;
  planStart?: string;
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
  linkRunToSession: (activityId: string, sessionId: string) => void;
  /** Body: save a check-in (red flags are worked out here, by rules); returns the red flags found */
  addBodyCheckin: (c: Omit<BodyCheckin, 'id' | 'at' | 'redFlags'>) => string[];
  updateBody: (patch: Partial<BodyState>) => void;
  /** Save a run recorded with the Run tab; returns its id */
  saveRecordedRun: (r: { startedAt: number; streams: StreamPoint[]; movingS: number; elapsedS: number; distanceM: number; laps: Lap[]; sessionId?: string }) => string;
  skipSession: (sessionId: string) => void;
  /** A feature switched on for this account (Run, Hub, share cards, Body); never in sample mode */
  hasFlag: (f: 'run_tab' | 'hub' | 'share_cards' | 'body' | 'garmin' | 'strava') => boolean;
  /** Mark runs as races (true), not races (false), or back to automatic detection (null) */
  setRaceFlag: (ids: string[], race: boolean | null) => void;
  /** Data-quality tools: merge two copies of a run, leave a run out of stats, choose its shoe, correct its distance */
  mergeRuns: (a: Activity, b: Activity) => Promise<string | undefined>;
  setRunHidden: (id: string, hidden: boolean) => void;
  setRunShoe: (id: string, shoeId: string | undefined) => void;
  fixRunDistance: (run: Activity, distanceM: number) => void;
  fixRunTime: (run: Activity, seconds: number) => void;
  handleMissed: (sessionId: string, toDate?: string) => void;
  swap: (sessionId: string, kind: SwapKind) => void;
  applyCoachProposal: (messageId: string) => void;
  setAdjust: (kind: PlanAdjust['kind'] | null, days?: number) => void;
  addLog: (e: Omit<LogEntry, 'id' | 'at'>) => void;
  removeLog: (id: string) => void;
  reportIllness: (days: number) => void;
  clearIllness: () => void;
  analysisFor: (a: Activity) => Analysis;
  sendCoach: (text: string, useAi?: boolean, topic?: 'body') => Promise<void>;
  clearCoach: () => void;
  exportData: () => Promise<void>;
  deleteEverything: () => Promise<string | undefined>;
  disconnectSource: (k: SourceKind) => void;
  connectHealth: () => Promise<string | undefined>;
  syncHealthNow: (justConnected?: boolean) => Promise<void>;
  healthSyncing: boolean;
  /** Garmin Connect (behind the 'garmin' flag): open Garmin's consent page */
  connectGarmin: () => Promise<string | undefined>;
  /** Finish connecting after Garmin sends the runner back; returns an error message or undefined */
  completeGarminConnect: (code: string, state: string) => Promise<string | undefined>;
  syncGarminNow: () => Promise<void>;
  garminSyncing: boolean;
  /** Strava (behind the 'strava' flag): open Strava's consent page; finish after Strava sends the runner back */
  connectStrava: () => Promise<string | undefined>;
  completeStravaConnect: (code: string, state: string, scope: string) => Promise<string | undefined>;
  syncStravaNow: () => Promise<void>;
  stravaSyncing: boolean;
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
function mergeDeviceChanges(cloud: AppData, device: CachedData): AppData {
  const out = { ...cloud };
  // Runs only on this device (not yet saved) are kept. Runs the account held before but no longer does were
  // deleted elsewhere, so they are not brought back.
  const inCloud = new Set(cloud.activities.map((a) => a.id));
  const knownInCloud = new Set(device.cloudIds ?? []);
  const deviceOnly = device.activities.filter((a) => !inCloud.has(a.id) && !knownInCloud.has(a.id));
  if (deviceOnly.length) out.activities = merge(cloud.activities, deviceOnly).activities;
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
const OPEN_TO_ALL = new Set(['run_tab', 'hub', 'share_cards', 'body', 'strava']);
const pickPrefs = (p?: Partial<Profile>): Partial<Profile> => (p ? { theme: p.theme, units: p.units, healthConsentAt: p.healthConsentAt, consents: p.consents, dateOfBirth: p.dateOfBirth, avatar: p.avatar, reminders: p.reminders } : {});

/** The training model (fitness, paces, load, readiness, the adapted plan) from the app's data. A plain function, so it
 *  can also be computed without certain runs (Strava runs are never part of what the AI coach is told). */
function computeDerived(data: AppData): Derived {
  const today = data.mode === 'sample' ? new Date(`${SAMPLE_TODAY}T09:00:00`) : new Date();
  const acts = forStats(data.activities);
  const hr = hrSetup(data.profile, acts, today);
  const zones = hrZones(hr);
  const fitness = estimateFitness(acts, hr, today, data.races);
  const stage = fitnessStage(acts, fitness, today);
  const paces = fitness && stage.paces ? trainingPaces(fitness.vdot) : undefined;
  const series = loadSeries(acts, hr, paces?.threshold[1], today, 400, data.profile.log);

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

  const adapted = data.plan
    ? adaptPlan({ plan: data.plan, activities: acts, feedback: data.feedback, profile: data.profile, today, typeOf, paces: paces ?? trainingPaces(35) })
    : data.plan;
  // Body (flagged): pain check-ins change the coming days; red flags pause running until checked
  // Body is open to every runner too: its plan changes apply whether or not the account has the old flag
  const bodyOn = data.mode === 'real' && (OPEN_TO_ALL.has('body') || !!data.flags?.includes('body'));
  const plan = adapted && bodyOn ? applyBody(adapted, data.profile.body, today) : adapted;
  const t = ymd(today);
  const todaySession = plan?.sessions.find((s) => s.date === t);
  const upcoming = data.races.filter((r) => r.date >= t).sort((a, b) => a.date.localeCompare(b.date));
  const aRace = upcoming.find((r) => r.priority === 'A') ?? upcoming[0];
  const nextRace = upcoming[0];
  // Heart-rate zones that make easy runs look hard (max HR set too low): one check for every screen
  const hrIssue = paces ? hrCheck(acts, hr, paces.easy[0], today) : undefined;
  // Readiness (brief 4A): worked out once here, so every screen shows the same score, word and sentence
  const readinessToday = readinessScore({ now: today, series, activities: acts, feedback: data.feedback, profile: data.profile, typeOf, zones, paces, todaySession, race: aRace, simple: !stage.predictions, hrSuspect: !!hrIssue });
  const readiness = asReadiness(readinessToday);
  const aRaceReadiness = aRace && fitness && stage.predictions ? raceReadiness(aRace, acts, fitness.vdot, today) : undefined;
  const tKey = ymd(today), wkKey = ymd(startOfWeek(today));
  const thisWeek = acts.filter((a) => { const d = a.startTime.slice(0, 10); return d >= wkKey && d <= tKey; });
  const due = (plan?.sessions ?? []).filter((x) => x.type !== 'rest' && x.date <= tKey);
  const athlete: AthleteState = {
    runCount: acts.length,
    totalM: acts.reduce((x, a) => x + a.distanceM, 0),
    weekM: thisWeek.reduce((x, a) => x + a.distanceM, 0),
    weekRuns: thisWeek.length,
    lastRun: acts.length ? acts.reduce((m, a) => (a.startTime > m.startTime ? a : m)) : undefined,
    planDueSoFar: due.length,
    planDoneSoFar: due.filter((x) => x.status === 'done').length,
    planStart: plan?.startDate,
  };
  const groups = groupIndex(groupRuns(acts));
  const groupOf = (id: string) => groups.get(id);
  // One label per run, everywhere: its own type, plus what it replaced when it was a swapped session
  const sessionByRun = new Map((plan?.sessions ?? []).filter((s) => s.completedActivityId).map((s) => [s.completedActivityId!, s]));
  const sessionOfRun = (id: string) => sessionByRun.get(id);
  const labelOf = (a: Activity) => {
    const s = sessionByRun.get(a.id);
    const base = TYPE_LABEL[typeOf(a)];
    return s?.status === 'swapped' ? `${base} · swapped from ${SESSION_SHORT[s.type] ?? s.title.toLowerCase()}` : base;
  };
  return { hrIssue, readinessToday, today, hr, zones, fitness, paces, stage, series, readiness, plan, todaySession, typeOf, labelOf, sessionOfRun, aRace, nextRace, aRaceReadiness, typicalMovingS, athlete, groupOf };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [authReady, setAuthReady] = useState(!supabase);
  const [session, setSession] = useState<Session | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [data, setData] = useState<AppData>(emptyData);
  const [ready, setReady] = useState(false);
  // The account has loaded (not just the copy on this device): imports from Strava and Garmin wait for this
  const [cloudReady, setCloudReady] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [syncError, setSyncError] = useState<string>();
  const [legacyOffer, setLegacyOffer] = useState<{ runs: number; races: number }>();
  const [importState, setImportState] = useState<ImportState>({ running: false, done: 0, total: 0, label: '' });
  const [coachBusy, setCoachBusy] = useState(false);
  const [healthSyncing, setHealthSyncing] = useState(false);
  const [garminSyncing, setGarminSyncing] = useState(false);
  const [stravaSyncing, setStravaSyncing] = useState(false);
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
  // Weather for recent runs (MET Norway only has current weather): ask once per run while it is recent, as soon as
  // the run arrives (recorded, logged or synced), so it does not depend on the run page being opened in time.
  const weatherAsked = useRef(new Set<string>());
  useEffect(() => {
    if (data.mode !== 'real') return;
    const now = Date.now();
    for (const a of data.activities) {
      if (a.weather || a.weatherSkip || weatherAsked.current.has(a.id) || !inWeatherWindow(a, now)) continue;
      weatherAsked.current.add(a.id);
      requestWeather(a.id).then((w) => {
        if (!w) return;
        const patch = 'skip' in w ? { weatherSkip: w.skip } : { weather: w };
        setData((d) => ({ ...d, activities: d.activities.map((x) => (x.id === a.id ? { ...x, ...patch } : x)) }));
      });
    }
  }, [data.mode, data.activities]);
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
    setCloudReady(false);
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
        const cloud = await pullFromCloud(cached);
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
        setCloudReady(true);
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
    const ps = pushState.current;
    void saveUserCache(userId, data, cloudLoaded.current ? (a) => ps.activities.get(a.id) === actPrint(a) : undefined);
  }, [data, userId, ready]);

  // ---- Fill in missing run summaries (best efforts etc.) on the server, from data already in the account ----
  const deriving = useRef(false);
  const derivedTried = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!userId || !ready || !cloudLoaded.current || data.mode !== 'real' || deriving.current || derivedTried.current === userId) return;
    if (!data.activities.some((a) => !a.streams && (a.derived?.v ?? 0) < DERIVED_VERSION)) return;
    deriving.current = true;
    derivedTried.current = userId; // once per session; the next visit continues where this one stopped
    const uidAtStart = userId;
    deriveMissing((updates) => {
      if (currentUid.current !== uidAtStart) return;
      const byId = new Map(updates.map((u) => [u.id, u.derived]));
      setData((d) => ({
        ...d,
        activities: d.activities.map((a) => {
          const dv = byId.get(a.id);
          if (!dv) return a;
          const next = { ...a, derived: dv };
          pushState.current.activities.set(a.id, actPrint(next)); // already saved by the server
          return next;
        }),
      }));
    }).catch((e) => console.warn('Run summaries could not be completed yet', e)).finally(() => { deriving.current = false; });
  }, [userId, ready, data.mode, data.activities]);

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
  // Recomputed only when these parts of the data change (not, for example, on every coach message)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const derived = useMemo<Derived>(() => computeDerived(data), [data.activities, data.profile, data.plan, data.feedback, data.races, data.mode, data.flags]);

  // Keep the plan's change log once adaptations happen
  useEffect(() => {
    if (data.mode === 'sample' || !derived.plan || !data.plan) return;
    if (derived.plan.changes.length !== data.plan.changes.length) setData((d) => ({ ...d, plan: derived.plan }));
  }, [derived.plan, data.plan, data.mode]);

  const analysisCache = useRef(new Map<string, Analysis>());
  useEffect(() => { analysisCache.current.clear(); }, [derived, data.feedback]);
  const analysisFor = useCallback((a: Activity) => {
    const key = `${a.id}|${a.streams || a.laps ? 'detail' : 'summary'}`;
    const hit = analysisCache.current.get(key);
    if (hit) return hit;
    const planned = derived.plan?.sessions.find((s) => s.completedActivityId === a.id);
    const res = analyse({
      a, all: data.activities, paces: derived.paces ?? trainingPaces(40), zones: a.avgHr ? derived.zones : undefined,
      typicalMovingS: derived.typicalMovingS, planned, feedback: data.feedback.find((f) => f.activityId === a.id), hrSuspect: !!derived.hrIssue,
      pastFeedback: data.feedback.filter((f) => f.activityId !== a.id && daysBetween(new Date(f.loggedAt), new Date(a.startTime)) <= 30 && f.loggedAt < a.startTime),
      units: data.profile.units, typeOf: derived.typeOf,
    });
    analysisCache.current.set(key, res);
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
        setImportState({ running: false, done: 0, total: 0, label: '', error: parsed.skipped.length ? `No runs were found in ${parsed.skipped.length === 1 ? 'that file' : `those ${parsed.skipped.length} files`}. Check that they are FIT, GPX or TCX running files, or a Garmin export ZIP.` : 'No files were chosen.', result: { found: 0, added: 0, replaced: 0, duplicates: 0, skipped: parsed.skipped } });
        return;
      }
      setData((d) => {
        const base = d.mode === 'sample' ? { ...emptyData(), mode: 'real' as const, profile: { ...emptyData().profile, ...pickPrefs(d.profile) } } : d;
        const m = merge(base.activities, parsed.activities);
        setImportState({ running: false, done: 1, total: 1, label: 'Done', result: { found: parsed.activities.length, added: m.added, replaced: m.replaced, duplicates: m.duplicates, skipped: parsed.skipped } });
        const sources = base.sources.filter((s) => s.kind !== 'upload' && s.kind !== 'sample');
        sources.push({ kind: 'upload', connected: true, lastSyncAt: new Date().toISOString(), activityCount: m.activities.filter((a) => a.source === 'upload').length, lastError: parsed.skipped.some((x) => x.category === 'unreadable') ? `${parsed.skipped.filter((x) => x.category === 'unreadable').length} file(s) could not be read` : undefined });
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
    const start = r.time ? new Date(`${r.date}T${r.time}:00`) : isToday ? new Date(Date.now() - r.durationS * 1000) : new Date(`${r.date}T12:00:00`);
    const a: Activity = {
      id, source: 'manual', sourceIds: { manual: id }, startTime: start.toISOString(),
      // Named like watch imports: by time of day when there is no planned session ("Morning run")
      name: session && session.type !== 'rest' ? session.title : `${start.getHours() < 12 ? 'Morning' : start.getHours() < 17 ? 'Afternoon' : 'Evening'} run`, sport: 'run',
      distanceM: Math.round(r.distanceM), durationS: Math.round(r.durationS), movingS: Math.round(r.durationS),
      isTimeTrial: session?.type === 'timetrial' || undefined,
      avgHr: r.avgHr, plannedSessionId: session?.id, reps: r.reps?.length ? r.reps : undefined, media: r.media?.length ? r.media : undefined,
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

  const saveRecordedRun = (r: { startedAt: number; streams: StreamPoint[]; movingS: number; elapsedS: number; distanceM: number; laps: Lap[]; sessionId?: string }): string => {
    const id = `gps-${r.startedAt}`;
    const session = derived.plan?.sessions.find((s) => s.id === r.sessionId);
    const start = new Date(r.startedAt);
    const h = start.getHours();
    const part = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
    let gain = 0;
    for (let i = 1; i < r.streams.length; i++) { const a = r.streams[i - 1].alt, b = r.streams[i].alt; if (a != null && b != null && b - a > 0.5) gain += b - a; }
    const a: Activity = {
      id, source: 'ritmo_gps', sourceIds: { ritmo_gps: id }, startTime: start.toISOString(),
      name: session && session.type !== 'rest' ? session.title : `${part} run`, sport: 'run',
      distanceM: Math.round(r.distanceM), durationS: Math.round(r.elapsedS), movingS: Math.round(r.movingS),
      elevGainM: r.streams.some((p) => p.alt != null) ? Math.round(gain) : undefined,
      streams: r.streams, laps: r.laps.length ? r.laps : undefined, plannedSessionId: session?.id,
      isTimeTrial: session?.type === 'timetrial' || undefined, detailScore: 0, importedAt: new Date().toISOString(),
    };
    a.detailScore = detailScore(a);
    setData((d) => {
      const base = d.mode === 'empty' ? { ...d, mode: 'real' as const } : d;
      return { ...base, activities: merge(base.activities, [a]).activities };
    });
    return id;
  };

  const addBodyCheckin = (c: Omit<BodyCheckin, 'id' | 'at' | 'redFlags'>): string[] => {
    const prev = data.profile.body ?? { checkins: [] };
    const flags = redFlags(c, prev.checkins);
    const entry: BodyCheckin = { ...c, id: uid(), at: new Date().toISOString(), redFlags: flags };
    const step = prev.rtrStep;
    // Return to run: a check-in at 2/10 or lower unlocks the next step; pain above that holds the step
    const rtrStep = flags.length ? undefined : step ? (stepUnlocked(entry) ? Math.min(step + 1, 7) : step) : undefined;
    setData((d) => ({ ...d, profile: { ...d.profile, body: { ...prev, checkins: [...prev.checkins, entry], ...(flags.length ? { redFlagAt: entry.at } : {}), rtrStep: rtrStep && rtrStep > 6 ? undefined : rtrStep } } }));
    return flags;
  };
  /** What Body answers may use: logged pain, recent load and plan changes (never shared on the Hub) */
  /** What the AI may be told is built without Strava runs (Strava's terms): the same model, computed without them. */
  const aiView = (): { d: Derived; acts: Activity[] } => {
    if (!data.activities.some(isStravaRun)) return { d: derived, acts: data.activities };
    const acts = data.activities.filter((a) => !isStravaRun(a));
    return { d: computeDerived({ ...data, activities: acts }), acts };
  };
  const bodyFacts = (forAi = false): string[] => {
    const b = data.profile.body;
    const { d: dv, acts } = forAi ? aiView() : { d: derived, acts: data.activities };
    const n = activeNiggle(b, dv.today);
    const last4 = acts.filter((a) => daysBetween(new Date(a.startTime), dv.today) < 28).reduce((x, a) => x + a.distanceM, 0) / 4000;
    return [
      n ? `Active niggle: ${areaLabel(n)}, pain ${n.pain}/10, ${n.when.map((w) => WHEN_LABEL[w].toLowerCase()).join(', ')}, started ${n.onset}, trend ${n.trend ?? 'unknown'}, first logged ${new Date((b!.checkins.find((c) => c.area === n.area && c.side === n.side) ?? n).at).toDateString()}.` : 'No active niggle logged.',
      `This week so far ${(dv.athlete.weekM / 1000).toFixed(1)} km; last 4 weeks average ${last4.toFixed(0)} km a week.`,
      ...(b?.rtrStep ? [`Return to run: step ${b.rtrStep} of 6.`] : []),
      ...(dv.plan?.changes.filter((c) => c.reason === 'pain').slice(-3).map((c) => `Plan change: ${c.summary}`) ?? []),
    ];
  };
  const updateBody = (patch: Partial<BodyState>) => setData((d) => ({ ...d, profile: { ...d.profile, body: { checkins: [], ...d.profile.body, ...patch } } }));

  /** "From my watch": link a run that is already imported to a planned session */
  const linkRunToSession = (activityId: string, sessionId: string) =>
    setData((d) => ({ ...d, activities: d.activities.map((a) => (a.id === activityId ? { ...a, plannedSessionId: sessionId } : a.plannedSessionId === sessionId ? { ...a, plannedSessionId: undefined } : a)) }));
  /** "I skipped it": the session stays in the plan as skipped (no catch-up) */
  const skipSession = (sessionId: string) =>
    setData((d) => (d.plan ? { ...d, plan: { ...d.plan, sessions: d.plan.sessions.map((s) => (s.id === sessionId ? { ...s, status: 'skipped' as const } : s)) } } : d));

  const updateProfile = (p: Partial<Profile>) => setData((d) => ({ ...d, profile: { ...d.profile, ...p } }));

  /** Builds a plan from the runner's settings. Returns the problem (and options) instead when it does not fit. */
  const makePlan = (d: AppData, race: Race | undefined, why?: string): { plan?: Plan; problem?: PlanProblem } => {
    const today = d.mode === 'sample' ? new Date(`${SAMPLE_TODAY}T09:00:00`) : new Date();
    const runs = forStats(d.activities);
    const hr = hrSetup(d.profile, runs, today);
    const f = estimateFitness(runs, hr, today, d.races);
    if (!f) return {};
    const recent = runs.filter((a) => { const x = daysBetween(new Date(a.startTime), today); return x >= 0 && x < 28; });
    const longest = runs.filter((a) => { const x = daysBetween(new Date(a.startTime), today); return x >= 0 && x < 42; }).reduce((m, a) => Math.max(m, a.distanceM), 0);
    const t0 = ymd(today);
    const otherRaces = d.races.filter((r) => r.id !== race?.id && r.date >= t0 && (!race || r.date < race.date));
    const res = generatePlan({ today, profile: d.profile, race, paces: trainingPaces(f.vdot), recentWeeklyKm: recent.reduce((x, a) => x + a.distanceM, 0) / 4000, longestRecentKm: longest / 1000, pacesFrom: f.basedOn, otherRaces });
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

  // Features tested with a few accounts first; those listed here are now open to every runner (with their own data).
  // Garmin stays behind its flag until Garmin approves the integration.
  const hasFlag = (f: string) => data.mode === 'real' && (OPEN_TO_ALL.has(f) || !!data.flags?.includes(f));
  const setRaceFlag = (ids: string[], race: boolean | null) => {
    const set = new Set(ids);
    setData((d) => ({ ...d, activities: d.activities.map((a) => (set.has(a.id) ? { ...a, isRace: race === true, notRace: race === false } : a)) }));
  };
  const mergeRuns = async (a: Activity, b: Activity) => {
    const { keep, dropId } = combineRuns(a, b);
    try { if (dataRef.current.mode === 'real') await deleteRunsInCloud([dropId]); } catch (e) { return friendlyError(e); }
    setData((d) => ({ ...d, activities: d.activities.filter((x) => x.id !== dropId).map((x) => (x.id === keep.id ? keep : x)),
      feedback: d.feedback.map((f) => (f.activityId === dropId ? { ...f, activityId: keep.id } : f)) }));
    return undefined;
  };
  const patchRun = (id: string, patch: Partial<Activity>) => setData((d) => ({ ...d, activities: d.activities.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const setRunHidden = (id: string, hidden: boolean) => patchRun(id, { hidden: hidden || undefined });
  const setRunShoe = (id: string, shoeId: string | undefined) => patchRun(id, { shoeId });
  /** Correct a run's time (a mistyped manual entry, e.g. 75 seconds for 75 minutes). Only for runs without a GPS track. */
  const fixRunTime = (run: Activity, seconds: number) => patchRun(run.id, { movingS: seconds, durationS: Math.max(seconds, run.durationS === run.movingS ? seconds : run.durationS) });
  const fixRunDistance = (run: Activity, distanceM: number) => {
    const fixed = withDistance(run, distanceM);
    setData((d) => ({ ...d, activities: d.activities.map((x) => (x.id === run.id ? { ...x, ...fixed } : x)) }));
  };
  const moveSession = (sessionId: string, toDate: string) => setData((d) => (d.plan ? { ...d, plan: movePlanSession(derived.plan ?? d.plan, sessionId, toDate) } : d));
  const swap = (sessionId: string, kind: SwapKind) => setData((d) => (d.plan ? { ...d, plan: swapSession(derived.plan ?? d.plan, sessionId, kind, derived.paces ?? trainingPaces(40)) } : d));
  const applyCoachProposal = (messageId: string) => setData((d) => {
    const m = d.coach.find((x) => x.id === messageId);
    const p = m?.proposal;
    if (!p || p.applied || !d.plan) return d;
    const base = derived.plan ?? d.plan;
    const plan = p.kind === 'move' && p.toDate ? movePlanSession(base, p.sessionId, p.toDate) : p.swap ? swapSession(base, p.sessionId, p.swap, derived.paces ?? trainingPaces(40)) : base;
    return { ...d, plan, coach: d.coach.map((x) => (x.id === messageId ? { ...x, proposal: { ...p, applied: true } } : x)) };
  });
  const setAdjust = (kind: PlanAdjust['kind'] | null, days = 3) => {
    if (!kind) { updateProfile({ adjust: undefined }); return; }
    const from = ymd(derived.today);
    updateProfile({ adjust: { kind, from, until: ymd(addDays(derived.today, days - 1)), at: new Date().toISOString() } });
  };
  const addLog = (e: Omit<LogEntry, 'id' | 'at'>) => setData((d) => ({ ...d, profile: { ...d.profile, log: [...(d.profile.log ?? []), { ...e, id: uid(), at: new Date().toISOString() }] } }));
  const removeLog = (id: string) => setData((d) => ({ ...d, profile: { ...d.profile, log: (d.profile.log ?? []).filter((x) => x.id !== id) } }));
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

  const derivedState = derived;
  const sendCoach = async (text: string, useAi?: boolean, topic?: 'body') => {
    const mode = data.mode === 'sample' ? 'sample' as const : 'real' as const;
    const msg: CoachMessage = { id: uid(), role: 'runner', text, at: new Date().toISOString(), mode, topic };
    setData((d) => ({ ...d, coach: [...d.coach, msg] }));
    if (topic === 'body') {
      // Red flags are rules, checked before any AI sees the message
      const flags = textRedFlags(text);
      setCoachBusy(true);
      try {
        const reply = flags.length
          ? { text: `Please stop running and get checked by a doctor or physio before you run again. You mentioned: ${flags.join('; ').toLowerCase()}.${flags.some((f) => /chest|dizz|faint/i.test(f)) ? ' If this is happening now, call your local emergency number.' : ''}`, facts: [] as string[], source: 'local' as const, fallback: undefined }
          : await (async () => {
            const ai = (useAi ?? !!dataRef.current.profile.consents?.aiCoach?.granted) && data.profile.body?.aiChat !== false;
            return askBody(text, bodyFacts(ai), data.coach.filter((m) => m.topic === 'body').map((m) => ({ role: m.role, text: m.text })), ai);
          })();
        if (flags.length) updateBody({ redFlagAt: new Date().toISOString() });
        setData((d) => ({ ...d, coach: [...d.coach, { id: uid(), role: 'coach', text: `${reply.text}\n\n${DISCLAIMER}`, at: new Date().toISOString(), facts: reply.facts, mode, topic, source: reply.source, fallback: reply.fallback }] }));
      } finally { setCoachBusy(false); }
      return;
    }
    setCoachBusy(true);
    try {
      const aiOn = useAi ?? !!dataRef.current.profile.consents?.aiCoach?.granted;
      // With the AI on, everything it is told comes from runs that did not come from Strava
      const { d: derived, acts: coachActs } = aiOn ? aiView() : { d: derivedState, acts: data.activities };
      const lastAnalysis = (a: Activity) => (derived === derivedState ? analysisFor(a) : analyse({
        a, all: coachActs, paces: derived.paces ?? trainingPaces(40), zones: a.avgHr ? derived.zones : undefined, typicalMovingS: derived.typicalMovingS, hrSuspect: !!derived.hrIssue,
        planned: derived.plan?.sessions.find((s) => s.completedActivityId === a.id), feedback: data.feedback.find((f) => f.activityId === a.id),
        pastFeedback: data.feedback.filter((f) => f.activityId !== a.id && daysBetween(new Date(f.loggedAt), new Date(a.startTime)) <= 30 && f.loggedAt < a.startTime),
        units: data.profile.units, typeOf: derived.typeOf,
      }));
      const t = ymd(derived.today);
      const wk = ymd(startOfWeek(derived.today));
      const weekEnd = ymd(addDays(startOfWeek(derived.today), 6));
      const last = derived.athlete.lastRun;
      const weekSessions = (derived.plan?.sessions ?? []).filter((s) => s.date >= wk && s.date <= weekEnd && s.type !== 'rest');
      const ctx: CoachContext = {
        today: derived.today, profile: data.profile, units: data.profile.units, readiness: derived.readiness, stage: derived.stage,
        todaySession: derived.todaySession, nextSessions: (derived.plan?.sessions ?? []).filter((s) => s.date > t && s.type !== 'rest').slice(0, 3),
        race: derived.aRace, raceReadiness: derived.aRaceReadiness, fitness: derived.stage.predictions ? derived.fitness : undefined, paces: derived.paces,
        weekDoneM: derived.athlete.weekM,
        weekPlannedM: weekSessions.reduce((x, s) => x + s.distanceM, 0),
        weekSessionsDone: weekSessions.filter((s) => s.status === 'done').length,
        weekSessionsPlanned: weekSessions.length,
        // Only sessions dated today or earlier count: a plan that starts next week is not "0 of 25 done"
        planSessionsDone: derived.athlete.planDoneSoFar,
        planSessionsTotal: derived.athlete.planDueSoFar,
        planStart: derived.athlete.planStart,
        runCount: derived.athlete.runCount,
        last: last ? { activity: last, analysis: lastAnalysis(last) } : undefined,
        hasData: coachActs.length > 0 || !!derived.plan,
        weekAhead: (derived.plan?.sessions ?? []).filter((s) => s.date >= wk && s.date <= ymd(addDays(derived.today, 7))),
        weekTargetKm: derived.plan?.weeks?.find((w) => w.start === wk)?.targetKm,
        maxEasyMin: data.profile.training?.maxEasyMin ?? 90,
      };
      const reply = await ask(text, ctx, data.coach.filter((m) => (m.mode ?? 'real') === mode && m.topic !== 'body').map((m) => ({ role: m.role, text: m.text })), aiOn);
      setData((d) => ({ ...d, coach: [...d.coach, { id: uid(), role: 'coach', text: reply.text, at: new Date().toISOString(), facts: reply.facts, mode, proposal: reply.proposal, source: reply.source, fallback: reply.fallback }] }));
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
    // Photos of the runner's shoes are in the same private folder as the profile picture
    const shoePhotos = Object.fromEntries(await Promise.all((data.profile.shoes ?? []).filter((x) => x.photo).map(async (x) => [x.id, await avatarDataUrl(x.photo!)] as const)));
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), app: 'Ritmo', account: { email: session?.user.email, createdAt: session?.user.created_at }, profilePicture: picture, shoePhotos, ...data }, null, 2)], { type: 'application/json' });
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

  const disconnectSource = (k: SourceKind) => {
    // Garmin: also tell Garmin to stop sending data and remove the stored tokens (runs already saved stay)
    if (k === 'garmin') void disconnectGarmin().catch(() => undefined);
    // Strava: revoke Ritmo's access at Strava and remove the stored tokens (runs already saved stay)
    if (k === 'strava') void disconnectStrava().catch(() => undefined);
    setData((d) => ({ ...d, sources: d.sources.map((s) => (s.kind === k ? { ...s, connected: false } : s)) }));
  };

  // ---- Garmin Connect (behind the 'garmin' flag) ----
  // Garmin pushes each new run to our webhook; here the app collects them and merges them like any other source.
  const syncGarminNow = async () => {
    if (dataRef.current.mode !== 'real' || !dataRef.current.flags?.includes('garmin')) return;
    // Only once the account has loaded: otherwise loading it would replace the runs added here
    if (!cloudLoaded.current || !userId) return;
    setGarminSyncing(true);
    try {
      const { runs, clear } = await pullGarminInbox();
      // Saved to the account before the inbox is cleared, so a run can never be lost in between
      if (runs.length) await pushActivities(userId, merge(dataRef.current.activities, runs).activities, pushState.current);
      setData((d) => {
        const m = runs.length ? merge(d.activities, runs) : { activities: d.activities };
        const sources = d.sources.filter((x) => x.kind !== 'garmin');
        sources.push({ kind: 'garmin', connected: true, lastSyncAt: new Date().toISOString(), activityCount: m.activities.filter((a) => a.sourceIds.garmin).length });
        return { ...d, activities: m.activities, sources };
      });
      // Cleared only after the runs are saved in the account
      await clear();
    } catch (e) {
      setData((d) => ({ ...d, sources: d.sources.map((x) => (x.kind === 'garmin' ? { ...x, lastError: `Garmin sync failed: ${friendlyError(e)}` } : x)) }));
    } finally {
      setGarminSyncing(false);
    }
  };
  const connectGarmin = async () => {
    try { await startGarminConnect(); return undefined; } catch (e) { return friendlyError(e); }
  };
  const completeGarminConnect = async (code: string, state: string) => {
    try {
      await finishGarminConnect(code, state);
      setData((d) => ({ ...d, sources: [...d.sources.filter((x) => x.kind !== 'garmin'), { kind: 'garmin', connected: true, activityCount: d.activities.filter((a) => a.sourceIds.garmin).length }] }));
      void syncGarminNowRef.current();
      return undefined;
    } catch (e) {
      return friendlyError(e);
    }
  };
  const syncGarminNowRef = useRef(syncGarminNow);
  syncGarminNowRef.current = syncGarminNow;
  const garminFlag = data.mode === 'real' && !!data.flags?.includes('garmin');
  useEffect(() => {
    if (!ready || !cloudReady || !garminFlag) return;
    let live = true;
    const run = () => { garminConnected().then((on) => { if (live && on) void syncGarminNowRef.current(); }); };
    run();
    // New runs are picked up whenever the runner comes back to the app
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { live = false; document.removeEventListener('visibilitychange', onVisible); };
  }, [ready, cloudReady, garminFlag]);

  // ---- Strava (behind the 'strava' flag) ----
  // The webhook and the first 30-day backfill fill strava_inbox; here the app turns those into runs. A run deleted on
  // Strava is removed here too (Strava's terms), unless the runner has the same run from another source.
  const syncStravaNow = async () => {
    // Strava is open to every runner (OPEN_TO_ALL), not only accounts with the old flag
    if (dataRef.current.mode !== 'real' || !(OPEN_TO_ALL.has('strava') || dataRef.current.flags?.includes('strava'))) return;
    // Only once the account has loaded: otherwise loading it would replace the runs added here (this lost runs)
    if (!cloudLoaded.current || !userId) return;
    setStravaSyncing(true);
    try {
      const { runs, deleted, clear } = await pullStravaInbox();
      // Saved to the account before the inbox is cleared, so a run can never be lost in between
      if (runs.length) await pushActivities(userId, merge(dataRef.current.activities, runs).activities, pushState.current);
      const gone = new Set(deleted);
      const dropIds = dataRef.current.activities.filter((a) => isStravaRun(a) && a.sourceIds.strava && gone.has(a.sourceIds.strava)).map((a) => a.id);
      if (dropIds.length) await deleteRunsInCloud(dropIds);
      setData((d) => {
        const kept = d.activities.filter((a) => !dropIds.includes(a.id));
        const m = runs.length ? merge(kept, runs) : { activities: kept };
        const sources = d.sources.filter((x) => x.kind !== 'strava');
        sources.push({ kind: 'strava', connected: true, lastSyncAt: new Date().toISOString(), activityCount: m.activities.filter((a) => a.sourceIds.strava).length });
        return { ...d, activities: m.activities, sources };
      });
      await clear();
    } catch (e) {
      setData((d) => ({ ...d, sources: d.sources.map((x) => (x.kind === 'strava' ? { ...x, lastError: `Strava sync failed: ${friendlyError(e)}` } : x)) }));
    } finally {
      setStravaSyncing(false);
    }
  };
  const connectStrava = async () => {
    try { await startStravaConnect(); return undefined; } catch (e) { return friendlyError(e); }
  };
  const syncStravaNowRef = useRef(syncStravaNow);
  syncStravaNowRef.current = syncStravaNow;
  const completeStravaConnect = async (code: string, state: string, scope: string) => {
    try {
      await finishStravaConnect(code, state, scope);
      setData((d) => ({ ...d, sources: [...d.sources.filter((x) => x.kind !== 'strava'), { kind: 'strava', connected: true, activityCount: d.activities.filter((a) => a.sourceIds.strava).length }] }));
      // The last 30 days arrive in the background over a few seconds; pick them up shortly after connecting
      setTimeout(() => void syncStravaNowRef.current(), 8000);
      return undefined;
    } catch (e) {
      return friendlyError(e);
    }
  };
  const stravaFlag = data.mode === 'real' && (OPEN_TO_ALL.has('strava') || !!data.flags?.includes('strava'));
  useEffect(() => {
    if (!ready || !cloudReady || !stravaFlag) return;
    let live = true;
    const run = () => { stravaConnected().then((on) => { if (live && on) void syncStravaNowRef.current(); }); };
    run();
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { live = false; document.removeEventListener('visibilitychange', onVisible); };
  }, [ready, cloudReady, stravaFlag]);

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

  // ---- Push reminders: keep this device's subscription and time zone current ----
  useEffect(() => { if (ready && userId && data.mode === 'real') void refreshPush(); }, [ready, userId, data.mode]);

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
    await disablePush().catch(() => undefined); // a shared device never shows the last person's reminders
    await logOut(); // session ends first, so nothing saves to this device afterwards
    if (uid) await clearUserCache(uid);
  };

  const value: Ctx = {
    ...derived, authReady, session, recovering, ready, loadError, data, syncError, legacyOffer, importState, coachBusy,
    retryLoad: () => setReloadKey((k) => k + 1), acceptLegacy, dismissLegacy,
    loadSample, startFresh, finishSetup, importFiles, logManualRun, updateProfile, saveRace, deleteRace, logFeedback, buildMyPlan, moveSession, setRaceFlag, mergeRuns, setRunHidden, setRunShoe, fixRunDistance, fixRunTime, hasFlag, linkRunToSession, skipSession, saveRecordedRun, addBodyCheckin, updateBody, handleMissed, swap, applyCoachProposal, setAdjust, addLog, removeLog,
    reportIllness, clearIllness, analysisFor, sendCoach, clearCoach, exportData, deleteEverything, disconnectSource, connectHealth, syncHealthNow, healthSyncing, connectGarmin, completeGarminConnect, syncGarminNow, garminSyncing, connectStrava, completeStravaConnect, syncStravaNow, stravaSyncing,
    signOut, finishRecovery: () => setRecovering(false), avatarSrc, saveAvatar, deleteAvatar, planProblem, applyPlanOption, dismissPlanProblem: () => setPlanProblem(undefined),
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
