// Core domain model for Ritmo. Mirrors the Supabase schema in supabase/migrations.

export type SourceKind =
  | 'sample'
  | 'upload'
  | 'manual'
  | 'garmin'
  | 'apple_health'
  | 'health_connect'
  | 'strava'
  | 'coros'
  | 'ritmo_gps'; // recorded with the Run tab

export type SessionType =
  | 'easy'
  | 'recovery'
  | 'long'
  | 'tempo'
  | 'threshold'
  | 'vo2max'
  | 'speed'
  | 'hills'
  | 'race'
  | 'runwalk'
  | 'timetrial'
  | 'strides' // short strides or drills file (often part of a warm-up)
  | 'rest';

export interface StreamPoint {
  t: number; // seconds from start
  d: number; // cumulative metres
  hr?: number;
  cad?: number; // steps per minute (both feet)
  alt?: number; // metres
  lat?: number;
  lon?: number;
}

export interface Lap {
  index: number;
  startS: number;
  durationS: number;
  distanceM: number;
  avgHr?: number;
  /** The workout step type the watch recorded for this lap, when the file has it */
  intensity?: 'warmup' | 'active' | 'rest' | 'recovery' | 'cooldown';
}

export interface Activity {
  id: string;
  source: SourceKind;
  sourceIds: Partial<Record<SourceKind, string>>; // external ids per source, used for de-duplication
  startTime: string; // ISO
  name: string;
  sport: 'run';
  distanceM: number;
  durationS: number; // elapsed
  movingS: number;
  elevGainM?: number;
  avgHr?: number;
  maxHr?: number;
  avgCadence?: number;
  /** Energy from the watch or service, kcal (shown when the source has it) */
  calories?: number;
  laps?: Lap[];
  streams?: StreamPoint[];
  isRace?: boolean;
  isTimeTrial?: boolean; // an all-out test effort, used to unlock full fitness features
  /** The runner said this was not a race (so race detection leaves it alone) */
  notRace?: boolean;
  /** The planned session this run was logged against ("I've done this run") */
  plannedSessionId?: string;
  /** Screenshots stored with the run (private storage paths) */
  media?: string[];
  /** Device that recorded the run, e.g. "Forerunner 965" (shown as Garmin attribution) */
  device?: string;
  /** Lap or rep table the runner entered or confirmed from screenshots */
  reps?: { label: string; distanceM?: number; timeS?: number; avgHr?: number; kind?: 'warmup' | 'work' | 'recovery' | 'cooldown' }[];
  /** Stored summary (best efforts, structure), so history works without loading every run's streams */
  derived?: ActivityDerived;
  /** Weather at the run's starting area, halfway through it (MET Norway, looked up while the run is recent) */
  weather?: RunWeather;
  /** Left out of fitness, PBs, volume and reviews (still listed), e.g. a run the watch recorded badly */
  hidden?: boolean;
  /** Deleted by the runner (imported runs only, which are kept so a sync does not bring them back and so they can be
   *  re-imported). A deleted run is never in the run list, stats, plan, coach or Hub. */
  deletedAt?: string;
  /** The distance before the runner corrected it (treadmill calibration), metres */
  distFrom?: number;
  /** The shoe the runner chose for this run; otherwise Ritmo picks one by session type */
  shoeId?: string;
  /** Why this run has no weather and is never looked up (e.g. 'no_gps' for an indoor run) */
  weatherSkip?: string;
  detailScore: number; // higher = more detailed, used to choose the best duplicate
  importedAt: string;
}

export interface RunWeather {
  /** Temperature and feels-like temperature, °C */
  t: number;
  fl: number;
  /** Relative humidity %, dew point °C */
  h: number;
  dp?: number;
  /** Wind speed km/h and the direction it blows from, degrees */
  ws: number;
  wd?: number;
  /** Short description, e.g. "clear sky" */
  c?: string;
  /** When it was looked up (ISO) and from which service */
  at: string;
  src: 'met.no' | 'openweather';
}

export interface ActivityDerived {
  v: number;
  /** best effort seconds by distance in metres (rounded) */
  be?: Record<string, number>;
  /** lap or 400 m segment paces, only for structured runs */
  segs?: number[];
  /** seconds per 5 bpm heart-rate band */
  hrh?: Record<string, number>;
}

export interface SessionFeedback {
  activityId: string;
  feel: 1 | 2 | 3 | 4 | 5; // 1 very hard ... 5 great
  rpe?: number; // 1-10
  pain: { area: string; severity: 1 | 2 | 3 }[];
  notes?: string;
  loggedAt: string;
}

export type RacePriority = 'A' | 'B' | 'C';
export type CourseType = 'road' | 'trail' | 'track' | 'cross-country';

export interface Race {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  distanceM: number;
  courseType: CourseType;
  goalS?: number;
  priority: RacePriority;
  resultActivityId?: string;
}

export interface Injury {
  area: string;
  status: 'current' | 'past';
  notes?: string;
}

export interface Profile {
  name: string;
  units: 'km' | 'mi';
  theme: 'system' | 'giorno' | 'notte' | 'sole';
  birthYear?: number;
  maxHr?: number;
  restHr?: number;
  goal: string;
  daysAvailable: number[]; // 0=Mon..6=Sun
  longRunDay: number; // 0=Mon..6=Sun
  injuries: Injury[];
  onboarded: boolean;
  illnessUntil?: string; // YYYY-MM-DD, set when runner reports illness
  /** Optional morning check-ins (sleep, legs, energy 1–5), the last two weeks, for readiness */
  checkins?: { date: string; sleep: number; legs: number; energy: number }[];
  experience?: 'new' | 'runner';
  starter?: { canRun10: boolean; walksRegularly: boolean; startedAt: string };
  healthConsentAt?: string; // when the runner agreed to health data processing
  // ---- Athlete setup (Phase 1). Only what the app uses is stored. ----
  dateOfBirth?: string; // YYYY-MM-DD, used for the 18+ rule and age-aware load limits
  consents?: Consents;
  /** Hub challenges the runner joined (a copy of each, with when it was finished and shared) */
  challenges?: import('../training/challenges').JoinedChallenge[];
  /** Health check: only the outcome is stored, never the individual answers */
  healthCheck?: { completedAt: string; doctorAdvised: boolean; acknowledgedAt?: string };
  background?: RunningBackground;
  goalType?: GoalType;
  schedule?: TrainingSchedule;
  injuriesAnswered?: boolean;
  avatar?: { path: string; updatedAt: string };
  setupStep?: string; // last completed setup step, to resume on any device
  setupStepsDone?: string[]; // optional steps already seen (e.g. "runs" skipped)
  setupCompletedAt?: string;
  /** How the runner wants to train. Anything missing falls back to a sensible default. */
  training?: TrainingSettings;
  adjust?: PlanAdjust;
  log?: LogEntry[];
  shoes?: Shoe[];
  /** Calendar feed of the plan: the private link's token and the reminder settings */
  calendarFeed?: { token: string; createdAt: string; morningHour: number | null; eveReminder: boolean };
  /** Push reminder times (local "HH:MM", null for off); notifications are turned on per device */
  reminders?: import('../training/push-core').Reminders;
  /** Body check-ins (pain and niggles) and return-to-run progress; never shown on the Hub */
  body?: import('../training/body').BodyState;
}

export interface TrainingSettings {
  weeklyKm?: number; // starting weekly volume; defaults to the recent average
  peakKm?: number; // where the plan builds to
  progression?: 'maintain' | 'steady' | 'progressive' | 'aggressive';
  daysPerWeek?: number; // 2–7, at most the available days
  dayAfterLong?: 'easy' | 'off';
  cutbackEvery?: 3 | 4;
  maxEasyMin?: number;
  maxQualityMin?: number;
  maxLongMin?: number;
  startMode?: 'today' | 'monday';
  /** Days with a second, easy run (AM and PM) for high-volume runners, 0 = Monday */
  doubles?: number[];
  /** Hard sessions per week (0–2; the long run is separate) */
  hardSessions?: number;
  difficulty?: 'easier' | 'normal' | 'harder';
  longRunStyle?: 'auto' | 'steady' | 'progressive' | 'fast-finish';
  strides?: boolean;
  /** Strength and mobility sessions per week (0–3), placed on easy days */
  strengthPerWeek?: number;
  /** Plan length in weeks when there is no race */
  planWeeks?: number;
}

/** Temporary changes the runner asks for: easier sessions, no pace targets, or travel */
export interface PlanAdjust { kind: 'easier' | 'nopace' | 'travel'; from: string; until: string; at: string }

/** Things logged that are not runs */
export interface LogEntry { id: string; date: string; kind: 'cross' | 'note'; sport?: string; minutes?: number; rpe?: number; text?: string; at: string }

export type ShoeUse = 'everyday' | 'fast' | 'long' | 'trail';
export interface Shoe { id: string; name: string; startDate: string; startKm: number; retireKm: number; retired?: boolean; /** From the shoe finder: brand, model and colour (for the picture) */ brand?: string; model?: string; colour?: string; /** A photo of the runner's own pair, in their private storage folder */ photo?: string; /** What the shoe is for, used to assign runs automatically (default everyday) */ use?: ShoeUse; /** When it was retired (YYYY-MM-DD); runs after that never count for it */ retiredAt?: string }

export interface Consents {
  /** Required: processing health and training data to coach the runner */
  healthData?: { granted: boolean; at: string; version: string };
  /** Optional: send summaries of training data to the AI coach service */
  aiCoach?: { granted: boolean; at: string };
  /** Optional, off by default: share runs the runner chooses with other runners on the Hub */
  hubSharing?: { granted: boolean; at: string; version: string };
}

export type BackgroundLevel = 'new' | 'returning' | 'sometimes' | 'regular' | 'racer';

export interface RunningBackground {
  level: BackgroundLevel;
  // new or returning
  canRun10?: boolean;
  walksRegularly?: boolean;
  monthsSinceLastRan?: number; // returning only
  exerciseDaysPerWeek?: number;
  exerciseTypes?: string[];
  // regular, racer (and "sometimes")
  weeklyKm?: number;
  longestRecentKm?: number;
  recentRace?: { distanceM: number; timeS: number; date?: string } | 'unknown';
  filledFromRuns?: boolean;
}

export type GoalType = 'start' | '5k' | 'first10k' | 'faster' | 'further' | 'fit' | 'race';

export interface TrainingSchedule {
  sessionMinutes: number; // typical time available per session
  startDate: string; // plan start
  timeOff: { from: string; to: string; label?: string }[];
}

export interface SessionStep {
  label: string; // e.g. "Warm up", "6 x 800 m"
  detail: string; // e.g. "at 4:05/km, 90 s jog between"
  /** Structured parts, so distance and time always add up. Total km of this step, including any recoveries. */
  km?: number;
  durationS?: number;
  pace?: [number, number]; // s/km fast, slow
  zones?: number[];
  kind?: 'warmup' | 'work' | 'steady' | 'cooldown' | 'easy' | 'strides';
}

export interface PlannedSession {
  id: string;
  date: string; // YYYY-MM-DD
  type: SessionType;
  title: string;
  focus: string; // e.g. "VO2 max"
  purpose: string; // why it matters
  howItHelps: string; // link to goal
  steps: SessionStep[];
  distanceM: number;
  durationS: number;
  paceTarget?: { minSPerKm: number; maxSPerKm: number };
  hrZones?: number[]; // e.g. [2] or [3,4]
  phase: Phase;
  /** done: run as planned. swapped: a quality session run easy instead (judged as what was run, not added back) */
  status: 'planned' | 'done' | 'swapped' | 'missed' | 'moved' | 'skipped';
  completedActivityId?: string;
  /** For a swapped session: the type that was actually run */
  swappedTo?: SessionType;
  movedFrom?: string;
  /** A second, easy run the same day (doubles) */
  second?: { distanceM: number; durationS: number; title: string; detail: string };
  /** Strength and mobility added to this day */
  strength?: string;
}

export type Phase = 'base' | 'build' | 'peak' | 'taper' | 'recovery' | 'race';

export interface PlanChange {
  id: string;
  at: string; // ISO
  reason: 'missed' | 'harder' | 'easier' | 'illness' | 'race-date' | 'moved' | 'rebuilt' | 'pain' | 'paces';
  summary: string; // plain-English explanation shown to the runner
}

export interface PlanWeek { start: string; targetKm: number; phase: Phase; cutback?: boolean }

export interface Plan {
  id: string;
  /** Why this plan was chosen, and how confident its numbers are, in plain words */
  basis?: string;
  paceConfidence?: 'measured' | 'estimated' | 'none';
  raceId?: string;
  createdAt: string;
  startDate: string;
  endDate: string;
  phases: { phase: Phase; start: string; end: string }[];
  sessions: PlannedSession[];
  changes: PlanChange[];
  /** Weekly volume targets, so screens can compare planned, done and target */
  weeks?: PlanWeek[];
  /** After a rebuild: the plan it replaced, kept 24 hours for "Restore previous plan" */
  previous?: { at: string; plan: Plan };
  /** After a rebuild: no automatic load adjustments before this date (YYYY-MM-DD) */
  noAutoAdjustUntil?: string;
  /** After a rebuild: what changed, for the summary sheet on Training */
  rebuild?: import('../training/rebuild').RebuildSummary & { seen?: boolean };
  /** The training paces last shown to the runner (easy range, s/km), to explain when they change */
  pacesShown?: { easy: [number, number]; threshold: [number, number]; at: string };
}

export interface SourceStatus {
  kind: SourceKind;
  connected: boolean;
  lastSyncAt?: string;
  lastError?: string;
  activityCount: number;
}

export interface CoachMessage {
  id: string;
  role: 'runner' | 'coach';
  text: string;
  at: string;
  facts?: string[]; // data the answer is grounded on
  /** Chats with sample data are kept apart from the runner's own */
  mode?: 'sample' | 'real';
  /** Body mode (injury and recovery chat), kept apart from the coach chat */
  topic?: 'body';
  /** A plan change the coach offered; applied once the runner confirms */
  proposal?: { kind: 'move' | 'swap'; sessionId: string; toDate?: string; swap?: 'shorter' | 'easy'; label: string; applied?: boolean };
  /** Who wrote the answer: the AI coach, or Ritmo's built-in coach */
  source?: 'ai' | 'local';
  /** Why the built-in coach answered although the AI coach is on */
  fallback?: 'not_configured' | 'busy' | 'limit' | 'error' | 'health';
}
