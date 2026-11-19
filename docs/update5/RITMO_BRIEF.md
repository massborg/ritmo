# Ritmo: build brief for Claude

You're working on **Ritmo** (https://ritmo-running.netlify.app), a running-coach web app. It's React + Vite with react-router, Supabase for auth and data, and Capacitor for the native build. Read this whole brief, look at the mockups in `images/`, then work through the tasks **in order**. After each task, run the app, check it at phone width (390 px), and commit separately.

The mockups match Ritmo's design tokens (`--surface #FAF8F5`, `--ink #171412`, `--brand #E8480C`, `--accent #FFB547`, `--graphite #1E1A17`, radius tokens `--r-card 12px`, `--r-pill 999px`, fonts Bricolage Grotesque / Instrument Sans / DM Mono). They were drawn with stand-in fonts, so use the app's real components, tokens and wording style rather than copying the pixels.

## Where things are (found in the production build; find the matching source files)

| Area | Build chunk / clue |
|---|---|
| Shared time input | Component in the main bundle with `className="input time-input"`, `inputMode="numeric"`, `placeholder="mm:ss or h:mm:ss"`, and the hint "Use minutes and seconds, like 15:30, or hours too, like 1:13:37." Parser splits on ":" (1 part = minutes, 2 = m:s, 3 = h:m:s). The onChange filter is `value.replace(/[^\d:]/g, "")`. |
| Where it's used | Onboarding `Setup` ("Your time", id `s-racetime`), Log a run (`lr-time`, "How long were you out?"), Log session (`ls-time`, "Total time") |
| Pace inputs | Session builder: "Target pace (per km)", `aria-label="Fastest pace"`, `inputMode="numeric"`, placeholder `4:50` |
| Onboarding | `Setup` chunk. Steps: Your data, About you, Health check, Your running, Your goal, Your week, Injuries, Your runs, Your plan. Goals list `te` (start, 5k, first10k, faster, further, fit, race). Race distances constant `[{5K,5000},{10K,10000},{Half marathon,21097.5},{Marathon,42195}]` |
| Plan engine | Goal distance mapped to the keys `"5K" | "10K" | "HM" | "M"`, with lookup tables keyed on those (long-run caps, volumes, pace blends) |
| Run / recording | `Run` chunk, route `/run`. Tabs "Ritmo plan" / "Free run". Free run modes: Just run, Distance, Time, Pace. Pocket mode, voice cues, BackgroundGeolocation |
| Strength | `StrengthPlayer` (`/strength/:id`), `StrengthPlan` (`/strength-plan`), `ProfileStrength` (`/profile/strength`). Manual log in the Training "+" sheet: "Log strength session" (date, Gym/Class/At home, duration, effort only) |
| Readiness / care | `Readiness`, `CarePlan` (`/care`). Return-to-run steps ("step 2 of 6") |
| Nav | Sidebar and bottom nav: Training, Coach, Run, Hub, You |

---

## Update 18 Nov: do these first

Tested against the build `index-QMYLDpEB.js`. Activity (`/record`), `StrengthFree`, `Hyrox*` and `HyroxGoal` already exist, so this round fixes and extends them. Plan-builder findings came from calling the exported plan builder (`kd`, exported as `bM`; paces from `At`, exported as `bN`) with 31 made-up profiles.

### U1. Cross-training: make it visible, recordable and importable (High)
See `images/s-other-sport.png` and `images/s-cross-visible.png`.
- **Bug:** `addLog({kind:'cross', sport, minutes, rpe})` (the cross-training sheet, `Zv`) saves to `profile.log`, but no screen renders `kind === 'cross'` entries. `removeLog` is only used by `HyroxSession`. There's no confirmation, so users think "Bike doesn't work". The live account has a 45-min bike at 2026-11-18T16:01Z that nobody can see.
- Show a toast after saving ("Bike saved · 45 min · Undo").
- Render log entries (cross, strength, note, hyrox) on the day: on the Training day view and calendar dots, as a card with sport icon, minutes, effort and load. Tap → edit / delete (`updateLog` / `removeLog`).
- **History page** (new route `/history`, linked from the Activity "History" button instead of `/you`) listing runs plus all log kinds, with filters All / Runs / Strength / HYROX / Cross-training.
- **"Other sport" on Activity:** a sport picker (Bike, Indoor bike, Swim, Elliptical, Row, Walk/hike, Class, Other) with tabs **Record now** (timer, pause, and GPS for outdoor bike and walk using the existing geolocation and Pocket mode; ask effort at the end) and **Log one I did** (the existing form). Saved as `kind:'cross'` with `distanceM` and `durationS` when recorded.
- **Imports:** FIT/Garmin/Strava currently throw `gs("cycling")` etc. and skip non-runs (`dk` map: cycling, swimming, walking, gym, other-sport). Instead, save them as cross-training (sport, minutes, avg HR, distance). Keep rejecting only wellness files and unreadable ones.
- **Test-data cleanup:** in the live account, one entry with text "TEST by Claude - delete" (Bike, 5 min, 2026-11-18). Once History exists, it can be deleted there.

### U2. Custom exercises (requested)
See `images/s-custom-exercise.png`.
- In the `/strength` library search, when nothing matches, show "Add '<query>' as my exercise". Also add a "+ Add your own exercise" button above the list.
- Fields: name (required, unique per user), muscle group (Legs, Hamstrings, Hips, Core, Upper, Plyo, HYROX), measure (`reps` | `seconds` | `distanceM`), load type (`added` | `bodyweight` | `band`), equipment (`none` | `light` | `gym`), `perSide`, default sets × reps, and an optional note or video URL.
- Store in `profile.strength.customExercises` (or a `custom_exercises` table with RLS by `user_id`) with id `custom:<uuid>`. Merge into the library everywhere: builder, swaps, templates, the logging picker. Show a **MINE** tag. Edit and archive; never hard-delete one that's used in history.
- Progression and "last time" work the same as for library exercises. Keep custom exercises out of auto-generated plan sessions unless the user swaps one in.

### U3. Saved workouts you can find and schedule (requested)
See `images/s-workouts-find.png`. Saving already works (`saveTemplate` / `profile.strength.templates`, tested: survives reload). What's missing:
- **Name default:** if the name is empty, use "Strength session N" (next free number). Also allow saving from the end-of-workout screen ("Save these exercises as a workout").
- **Findable:** a "Your workouts" row on Activity (`/record`), with starred ones first; Profile → Strength → My workouts; and a "Use a saved workout" picker in the "Log strength session" sheet (it currently records only type, duration, effort and HR).
- **Schedule on a date:** add `profile.strength.scheduled: [{templateId, date}]`. Show it on Training for that day with Start, count it in the week's load, and let the user move it like other sessions.
- Actions per workout: Start, Schedule, Edit exercises, Rename, Duplicate, Log as done, Delete.
- After adding an exercise from the long list, show a toast "Added Goblet squat (2 in workout)" with a link that scrolls up to the builder.

### U5. Exercise animations: 23 of 51 are wrong (requested)
See `images/demos-1.png` and `images/demos-2.png` (now → proposed). Code: the animated drawing component `Q0` (svg `.exercise-demo`) and the pose table `O0` (12 patterns) in the main bundle. The exercise library `Zo` sets `pattern` for each exercise. Elbows are solved by `H0`; `B0` / `K0` build and blend the drawing.

**Wrong now:**

| Exercise | Pattern now | What it shows | Should be |
|---|---|---|---|
| Dumbbell RDL, Trap-bar deadlift | hinge | single-leg RDL | `hinge-2leg` |
| Dumbbell row | hinge | single-leg RDL | `row` |
| Sled pull | hinge | single-leg RDL | `sled-pull` (sit back, hand-over-hand rope pull) |
| Bird dog | core-floor | lying on back | `quadruped` |
| Wall sit | squat | moving squat | `wall-sit` (still hold, wall prop) |
| Bulgarian split squat (+ load) | lunge | plain lunge | `rfess` (rear foot on bench) |
| Push-up | plank | hip lift | `push-up` |
| Pallof press | plank | hip lift | `pallof` (standing, band) |
| Overhead press | mobility | leg swing | `overhead-press` |
| Band pull-down | mobility | leg swing | `pull-down` (arms overhead → to hips, band) |
| Farmers carry | mobility | leg swing | `carry` |
| Wall balls | squat | squat, no ball | `wall-ball` |
| Sled push | lunge | lunge | `sled-push` |
| Banded side walk | clam | lying clamshell | `side-walk` |
| Skater bounds | hop | pogo on the spot | `skater` |
| Burpee broad jumps | hop | pogo on the spot | `burpee-broad-jump` (3 keyframes: stand → chest down → jump forward) |
| Kneeling hip-flexor stretch, Ankle rocks | mobility | leg swing | `half-kneel` (ankle rocks: knee travels over toes) |
| World's greatest stretch | mobility | leg swing | `wgs` (deep lunge, elbow to instep, rotate arm up) |
| Seated calf raise (machine) | calf | standing | `seated-calf` |
| Slow step-down | step | knee drive | `step-down` (on a box) |

**Close but missing a detail:** single-leg glute bridge (move only one leg, other leg straight), single-leg hip thrust and hip thrust (add sofa/bench under shoulders), bent-knee calf raise (knees bent), side plank with leg lift (lift top leg), side-lying leg raise (straight leg, not clam), sandbag lunges (sandbag on shoulders), step-up / step-up + load (draw the box), plank (keep it still or use a gentle breathing motion only).

**Renderer changes:** add `elbow2`/`hand2` (second arm; currently one `hand` only), optional fixed `elbow`, a `props` layer (bench, box, wall, ball, band, sled, target, dumbbell, kettlebell, sandbag), N keyframes instead of exactly 2, and show the weight when `weights` is true. Check every exercise in a story or test page (all 51 side by side) before shipping.

**Starting poses** (same coordinate system as `O0`: viewBox 0–100, ground y≈92, facing right; `k1/f1` near leg, `k2/f2` far leg):
```js
  "hinge-2leg": [{"head":[50,14],"sh":[50,26],"hip":[50,52],"k1":[52,72],"f1":[51,92],"k2":[48,72],"f2":[47,92],"hand":[53,51],"hand2":[51,51]},{"head":[73,41],"sh":[65,43],"hip":[42,52],"k1":[50,72],"f1":[51,92],"k2":[47,72],"f2":[47,92],"hand":[64,67],"hand2":[62,67]}],  // Two-leg hinge (DB RDL, trap-bar deadlift) · props: dumbbell / trap bar at hands
  "row": [{"head":[72,39],"sh":[64,43],"hip":[40,52],"k1":[50,72],"f1":[52,92],"k2":[42,72],"f2":[38,92],"hand":[64,67],"hand2":[54,68]},{"head":[72,39],"sh":[64,43],"hip":[40,52],"k1":[50,72],"f1":[52,92],"k2":[42,72],"f2":[38,92],"hand":[52,52],"elbow":[46,40],"hand2":[54,68]}],  // Bent-over dumbbell row · props: dumbbell in near hand
  "quadruped": [{"head":[22,63],"sh":[30,70],"hip":[58,70],"k1":[60,92],"f1":[76,92],"k2":[58,92],"f2":[74,92],"hand":[30,92],"hand2":[32,92]},{"head":[22,63],"sh":[30,70],"hip":[58,70],"k1":[74,68],"f1":[92,66],"k2":[58,92],"f2":[74,92],"hand":[30,92],"hand2":[8,64]}],  // Bird dog (hands and knees)
  "wall-sit": [{"head":[36,36],"sh":[36,48],"hip":[36,72],"k1":[58,72],"f1":[58,92],"k2":[56,72],"f2":[56,92],"hand":[48,70]},{"head":[36,36],"sh":[36,48],"hip":[36,72],"k1":[58,72],"f1":[58,92],"k2":[56,72],"f2":[56,92],"hand":[48,70]}],  // Wall sit (static hold against a wall) · props: wall at x 26–30
  "rfess": [{"head":[58,14],"sh":[57,26],"hip":[55,52],"k1":[64,70],"f1":[66,92],"k2":[42,64],"f2":[28,72]},{"head":[58,30],"sh":[57,42],"hip":[53,66],"k1":[70,68],"f1":[68,92],"k2":[42,84],"f2":[28,72]}],  // Bulgarian split squat (rear foot on a bench) · props: bench x 14–38, top y 74
  "push-up": [{"head":[23,61],"sh":[30,67],"hip":[56,76],"k1":[70,82],"f1":[86,89],"k2":[70,82],"f2":[86,89],"hand":[30,92]},{"head":[22,79],"sh":[30,84],"hip":[56,87],"k1":[70,89],"f1":[86,90],"k2":[70,89],"f2":[86,90],"hand":[30,92],"elbow":[40,82]}],  // Push-up (elbows bend, body moves as one)
  "overhead-press": [{"head":[50,14],"sh":[50,26],"hip":[50,52],"k1":[52,72],"f1":[52,92],"k2":[48,72],"f2":[48,92],"hand":[55,24],"elbow":[57,36],"hand2":[47,24],"elbow2":[45,36]},{"head":[50,14],"sh":[50,26],"hip":[50,52],"k1":[52,72],"f1":[52,92],"k2":[48,72],"f2":[48,92],"hand":[53,3],"hand2":[48,3]}],  // Overhead press · props: dumbbell at near hand
  "carry": [{"head":[50,14],"sh":[50,26],"hip":[50,52],"k1":[58,72],"f1":[62,92],"k2":[44,72],"f2":[38,92],"hand":[52,52],"hand2":[48,52]},{"head":[52,14],"sh":[52,26],"hip":[52,52],"k1":[48,72],"f1":[42,92],"k2":[58,72],"f2":[64,92],"hand":[54,52],"hand2":[50,52]}],  // Farmers carry (walking, weights at sides) · props: kettlebell in each hand
  "wall-ball": [{"head":[46,34],"sh":[47,44],"hip":[37,64],"k1":[58,66],"f1":[52,92],"k2":[56,68],"f2":[48,92],"hand":[56,40],"elbow":[56,50],"hand2":[54,40]},{"head":[52,10],"sh":[51,22],"hip":[50,48],"k1":[52,70],"f1":[52,92],"k2":[48,70],"f2":[48,90],"hand":[56,6],"hand2":[54,7]}],  // Wall ball: squat, then drive and throw to the target · props: wall x 92, target band y 2–6 x 78–92, ball held at hands
  "sled-push": [{"head":[66,38],"sh":[58,44],"hip":[38,60],"k1":[52,72],"f1":[54,92],"k2":[28,78],"f2":[18,92],"hand":[72,50],"hand2":[71,51]},{"head":[70,38],"sh":[62,44],"hip":[42,60],"k1":[36,78],"f1":[26,92],"k2":[56,72],"f2":[58,92],"hand":[76,50],"hand2":[75,51]}],  // Sled push (lean in, drive the legs) · props: sled x 74–96, y 74–93, poles at x 74 and x 90 up to y 46
  "side-walk": [{"head":[46,18],"sh":[46,30],"hip":[46,56],"k1":[52,72],"f1":[53,92],"k2":[40,72],"f2":[39,92],"hand":[54,50],"hand2":[38,50]},{"head":[54,18],"sh":[54,30],"hip":[54,56],"k1":[68,72],"f1":[72,92],"k2":[46,72],"f2":[42,92],"hand":[62,50],"hand2":[46,50]}],  // Banded side walk (front view, standing) · props: band between knees
  "skater": [{"head":[30,24],"sh":[32,36],"hip":[34,60],"k1":[32,76],"f1":[30,92],"k2":[46,74],"f2":[54,84],"hand":[46,40],"hand2":[18,54]},{"head":[70,24],"sh":[68,36],"hip":[66,60],"k1":[68,76],"f1":[70,92],"k2":[54,74],"f2":[46,84],"hand":[54,40],"hand2":[82,54]}],  // Skater bounds (side to side, front view)
  "half-kneel": [{"head":[46,32],"sh":[46,44],"hip":[46,70],"k1":[64,72],"f1":[66,92],"k2":[40,91],"f2":[24,92],"hand":[54,64]},{"head":[52,30],"sh":[52,42],"hip":[52,72],"k1":[68,72],"f1":[68,92],"k2":[42,91],"f2":[26,92],"hand":[54,14]}],  // Kneeling hip-flexor stretch
  "burpee-broad-jump": [{"head":[18,86],"sh":[26,88],"hip":[52,88],"k1":[66,89],"f1":[82,90],"k2":[66,89],"f2":[82,90],"hand":[28,92]},{"head":[70,30],"sh":[66,40],"hip":[52,58],"k1":[66,64],"f1":[58,78],"k2":[62,66],"f2":[54,80],"hand":[82,30],"hand2":[80,32]}],  // Burpee broad jump (chest down, then jump forward)
  "seated-calf": [{"head":[40,32],"sh":[40,44],"hip":[42,68],"k1":[62,68],"f1":[62,92],"k2":[60,68],"f2":[60,92],"hand":[60,66]},{"head":[40,29],"sh":[40,41],"hip":[42,65],"k1":[62,63],"f1":[63,86],"k2":[60,63],"f2":[61,86],"hand":[60,61]}],  // Seated calf raise (sitting, knees bent) · props: bench x 26–50, top y 70; dumbbell on knee
  "step-down": [{"head":[46,8],"sh":[46,20],"hip":[46,46],"k1":[47,62],"f1":[46,76],"k2":[52,62],"f2":[56,80],"hand":[56,36]},{"head":[42,18],"sh":[43,30],"hip":[40,56],"k1":[52,64],"f1":[46,76],"k2":[52,76],"f2":[58,92],"hand":[56,46]}],  // Slow step-down (on a box, lower the free heel) · props: box x 30–56, top y 77
  "pallof": [{"head":[50,14],"sh":[50,26],"hip":[50,52],"k1":[54,72],"f1":[56,92],"k2":[46,72],"f2":[44,92],"hand":[54,38],"elbow":[56,46],"hand2":[52,38]},{"head":[50,14],"sh":[50,26],"hip":[50,52],"k1":[54,72],"f1":[56,92],"k2":[46,72],"f2":[44,92],"hand":[72,36],"hand2":[70,36]}],  // Pallof press (standing, band from the side) · props: band from hands to anchor at x 96, y 38
```

### U6. Workouts disappear when you close the page or go back (requested, High)
- **Cause:** `StrengthPlayer` saves progress to `sessionStorage` (key per session) and **only once a set is done** (`if(!sets.some(done)) sessionStorage.removeItem(key)`). sessionStorage is cleared when the tab closes or iOS/Android kills the web app. Nothing offers to resume, and unsaved free workouts in `StrengthFree` aren't stored at all.
- **Fix:** see `images/s-resume.png`.
  - Create an `activeWorkout` record **as soon as Start is tapped**: `{id, templateId?, source:'plan'|'free'|'template', startedAt, items, sets, meta, notes, idx, restEndsAt?, updatedAt}`. Write it to `localStorage` (or IndexedDB) on every change, and sync to Supabase (`active_workouts`, one row per user) every 30 s and on `visibilitychange`/`pagehide`. That way it also resumes on another device.
  - "Workout in progress" card on Activity and Training (and an app-wide small bar while away from the player) with **Resume**, **Finish & save** and **Discard** (confirm). Show the elapsed time and progress.
  - Leaving the player (back button, nav tab, browser back, closing the tab) → sheet: "Keep it running and leave" (default), "Finish & save", "Discard". Use `beforeunload` only for unsynced data.
  - Older than 12 h → on next open ask "Save the 7 sets you did on Tue?" (save as done with the actual duration) or discard. Never silently delete.
  - Do the same for the free-strength builder draft (unsaved exercise list) and check that HYROX live (already has Resume/Discard) uses localStorage, not sessionStorage.

### U7. Timers: per exercise, rest between sets and between exercises, saved in the workout (requested)
See `images/s-rest-setup.png` and `images/s-timers-live.png`.
- **Template fields:** add `restBetweenSetsS` and `restBetweenExercisesS` (defaults from Profile → Strength → Rest between sets, which exists). Each template item gets optional `restS` (between its sets), `restAfterS` (before the next exercise), and for timed exercises `workS` (plank 0:40, carry 1:00, wall sit…). Edit them in the builder: workout-level chips plus a per-exercise override shown as a tag. Save with the template, and planned sessions can carry them too.
- **Player:**
  - **Work timer** for timed exercises: big countdown, 3-2-1 beeps/vibration, auto-complete the set (with "Done early").
  - Elapsed **exercise time** and **total workout time** on screen.
  - **Rest timer** starts automatically when a set is logged. It uses `restS` between sets and `restAfterS` after the last set, with +15 s / −15 s / Skip, and shows what's next.
  - Base timers on timestamps (`restEndsAt`), not counting intervals, so they keep time with the screen locked or the app in the background. Fire a local notification/vibration at the end (Capacitor LocalNotifications in the native app; Notification API or sound in the browser).
  - The current "Rest between sets" dropdown in the player stays as a live override and can be saved back to the template.
- **Summary** shows the actual rest taken and the total time.

### U8. Show strength, HYROX and other sports on the You page (requested)
See `images/s-you-all.png` and `images/s-you-strength.png`. `/you` (Progress, Races; W/M/Y/All; "Runs · November") only reads `activities` (runs). Strength (`profile.log` kind `strength` + strength history), HYROX (kind `hyrox` / HYROX sessions) and cross-training (kind `cross`) never appear.
- Build one combined, date-sorted feed: runs + strength + HYROX + cross + recorded other sports. Each item has `type`, `date`, `durationS`, a key metric (km / volume kg / total time / minutes), a link to its detail page and its load. Reuse it for the new `/history` page (U1).
- Filter chips under Progress: All · Run · Strength · HYROX · Other sport. Remember the choice (localStorage).
- **All:** tiles Time trained · Sessions · Running km, a stacked "time by type" bar for the period, then the mixed list.
- **Run:** the current view, unchanged.
- **Strength:** sessions vs planned target, time, volume (kg × reps), sessions-per-week chart, records (best weight × reps per exercise, longest timed hold, estimated 1RM), muscle groups worked (sets per group from exercise `muscles`), session list → strength detail.
- **HYROX:** best full/half simulation, station bests vs division target, average run split and fade.
- **Other sport:** minutes and load per sport, list.
- Records page: add Strength and HYROX tabs. Year/month review (`/review/:period`) and the Hub profile include non-running totals.
- Tapping a strength or cross item opens a detail page with edit and delete (strength: exercises, sets, kg, notes).

### U4. Plan builder fixes (from the 31-profile test)
Write these as unit tests against `kd` with the profiles described:
1. **Marathon / half long runs too short (High).** A 20-week marathon (30 km/wk now, `peakKm` 70, `maxLongMin` 180, 4 days) never goes past an 18 km long run. With `peakKm` 38 the max is 11 km. A half in 16 weeks maxes at 14 km. Target the longest run at 28–32 km for a marathon and 18–21 km for a half (time-capped by `maxLongMin`). If the volume, days or weeks can't support that, return a warning and offer options (more weeks, the half, a higher peak).
2. **"Both" athletes (High).** `jp()` returns only one target, so the plan ends at the nearer race. Example: 10K in 6 weeks + HYROX in 14 weeks → plan ends at the 10K, with no HYROX work. Plan both blocks in sequence (block → recovery week → block) and keep 1 maintenance session a week for the other sport (`keepHyrox` / `keepRunning` currently produce nothing).
3. **Injuries ignored (Med).** `profile.injuries` with pain 4/10 doesn't change the plan. Apply the care-plan override at generation (see Task 2 #1).
4. **Limits ignored (Med).** `training.peakKm` lower than current weekly km is ignored (90 → 89–91 km planned against a 60 limit). `schedule.sessionMinutes: 30` is ignored (sessions up to 97 min). Respect them or return a warning with options.
5. **Unrealistic goal (Med).** A 5K goal of 13:00 with VDOT 40 (about 24:00) builds normally. Compare `goalS` with the predicted time and warn beyond about 8%.
6. **HYROX progression (Med).** 1 km repeats peak at 5–7 reps. Build to 8 × 1 km. 16-week plans have 1 half simulation, so add one every 2–3 weeks in the build. With `equipment: []`, station blocks still use bands, so fall back to bodyweight (burpees, walking lunges, air squats, wall sit).
7. **Warning text (Low).** "Easy runs are a little long at {X} km on {n} days" prints weekly km, not run length. It suggests "a 6th day" to a 3-day beginner, and shows when the race is today or tomorrow. Fix the variables, limit suggestions to days the runner offered, and skip it when fewer than 7 days remain.
8. **Race detection (Low).** A run named "…Zurrieq 10K", 10.03 km at race effort, shows as "Extra run". Suggest "Add as race result" when the name contains K/race/parkrun and the effort is high.
9. **Small:** the Free run page heading still says "Run". `/record` History links to `/you` (runs only).

---

## Task 1: Fix the time and pace inputs (blocks sign-up)

**Bug:** `inputMode="numeric"` shows a keypad with no ":" on iOS and most Android phones. The onChange also strips "." and ",", even though the parser accepts them. "2005" is read as 2,005 minutes. Users can't enter a 5K time during onboarding.

**Build** a single `DurationInput` (and a `PaceInput` with m:ss) to replace every time and pace field. See `images/s-time-before.png` and `images/s-time-after.png`.

- Keep `inputMode="numeric"` and `pattern="[0-9]*"` for the fast keypad.
- Fill digits in from the right, like a timer app. Keep up to 6 digits: `2 → 0:02`, `20 → 0:20`, `205 → 2:05`, `2005 → 20:05`, `200515 → 20:05:15`. Backspace removes the last digit.
- Show it as three boxes `h : mm : ss`, or one field showing the formatted value. Use `aria-label`s that read the value out ("20 minutes 5 seconds").
- Accept pasted or hardware-keyboard input with `:`, `.`, `,` or spaces as separators (`1.13.37` → 1:13:37).
- Live readback under the field for race times: "5K in 20:05 · 4:01/km". Validate seconds and minutes < 60, and flag times that can't be right for the distance (a 5K under 12:00 or over 2:00:00) with a gentle warning, not a block.
- Unit tests: `"2005"`, `"200515"`, `"20:05"`, `"1.13.37"`, `"1:13:37"`, `""`, `"99"`, `"6000"`, pasted `" 20:05 "`.
- Use it in onboarding, Log a run, Log session, and the session-builder pace fields.

## Task 2: Other bug fixes

1. **Injury mode must override the plan.** While a return-to-run or care plan is active, change today's and upcoming sessions: long or hard sessions become easy, flat runs at the duration the current step allows. Show the original crossed out and label it "Changed for your ankle" (`images/s-fix-today.png`). Coach already says "Hard sessions this week become easy runs", so make the plan match.
2. **Cap readiness during injury.** Never show "Ready for hard" while a care plan is active. Show "Easy day · capped by injury".
3. **Partly done state.** Mark a planned session Done only if the matched activity covers ≥ 80% of the planned distance or time *and* the type is compatible. Otherwise show "Partly done · 7.1 of 22 km" with a progress bar, and keep the matched type honest ("Matched as an easy run").
4. **Consistent grouping.** All activities matched to one planned session group the same way ("Session of N parts"). Thu 12 Nov currently shows 4 separate runs, each "Matched your plan". Count the planned session once in the weekly totals.
5. **Weekly target text.** When injury reduces the week, show "25 km (reduced from 93 km while returning)" in both the Training header and Plan changes.
6. **Strength progression table** (`/strength-plan`): Block 3 must progress beyond Block 2 (they're identical now). Don't progress "Bulgarian split squat" into "Weighted rear-foot elevated split squat" (the same movement), so call it "Bulgarian split squat + load". Avoid two split-squat variants in one block. List every exercise that appears in sessions (calf raise and Pallof press are missing).
7. **Hide the "Full plans unlocked" card** once a plan has been built from a race result or PB.
8. **One time formatter.** The 5K PB shows 15:53 on You and 15:52 in the plan note. Use one rounding rule everywhere.
9. **Run tab with nothing planned:** hide the faded Start button (or send it to Free run). Pin the Start control to the bottom safe area so it's never below the fold.
10. **Check** why the next strength session is 10 days after the last one in week 1 (Sat 14 Nov → Tue 24 Nov). If taper or a lighter week causes it, say so on screen.

## Task 2b: Injury flow: "It feels healed" and check-ins that change by day

See `images/s-care-day1.png`, `images/s-care-daily.png` and `images/s-care-healed.png`. (Care plan code: `CarePlan` chunk, route `/care`, the "Check in" button on the Training return-to-run card.)

**Problem:** once a return-to-run plan starts, there's no way to say the injury has healed and return to the plan. The check-in asks the same questions every day.

**1. First report (day 1 only).** Ask where, which side, sudden or gradual start, pain walking (0–10), how it behaves when running (eases as I warm up / stays the same / gets worse / haven't tried), red flags (swelling, bruising, limping, can't put weight on it, numbness), and whether they've seen a physio. Use the answers to pick the starting step. Can't bear weight or numbness → pause running and show "see a doctor or physio" (keep the existing medical disclaimer).

**2. Daily check-in (day 2 onwards), short and comparative.** Load the previous answers and ask:
- This morning compared to yesterday: better / same / worse, with yesterday's score in the label.
- Pain this morning (0–5+).
- Yesterday's step session: pain 2 or less / above 2 / didn't run. Ask this only if a step session was planned.
- From day 3, show a pain trend chart for the last 5 days. Every 3rd day add one functional test: 10 single-leg hops pain-free (foot, ankle, shin, knee), or 15 single-leg calf raises (calf, Achilles).
- Don't ask the day-1 questions again. Allow "update details" if the location or type was wrong.

**3. Progression rules** (keep the existing ones, made explicit):
- 2 consecutive days with run pain ≤ 2 and the next morning not worse → unlock the next step and update today's session.
- Pain above 2 or worse next morning → stay on the step. Twice in a row → go back one step.
- 5 days at 0–1 with a passed functional test → offer "Feels healed?" on the card.

**4. "It feels healed" (always available** on the care card, the check-in screen and `/care`):
- 3 confirmations: walking and stairs pain-free, last easy run pain 0–1, hop test pain-free. If any is "No", show a gentle warning but still allow it.
- Choose how to return:
  - **Ease back in** (default): about 10 days at about 70% of planned volume, no intervals or hills for the first 4 days, then the full plan.
  - **Straight back to my plan**: rebuild from today.
- End the care plan and **rebuild the plan from today**, logged in Plan changes as "Ankle marked healed on 17 Nov, easing back in over 10 days". Remove the readiness cap and the "changed for your injury" labels.
- Move the injury to **Injury history** (Profile → Health) with start and end dates and the pain trend.
- **"It's back"** button for 30 days after: reopens the same injury at the last step reached, not step 1, with a short check-in.

**Test:** report on day 1 → day 2 check-in shows the short form with yesterday's value → day 3 shows the trend chart and unlocks step 3 → "It feels healed" → plan rebuilt, card gone, history entry exists → "It's back" resumes at step 3.

## Task 2c: Strides as their own group in activity splits

See `images/s-activity-strides.png`. Code: activity detail (`Activity` chunk, `/activity/:id`) and the session-parts and plan matching logic ("Session of N parts", "Main run · Easy run", "Cool-down").

**Problem:** for warm-up → a few strides → interval session, the strides get grouped inside the intervals. This skews the interval averages, rep count and fastest rep, and can break plan matching.

- Add a segment type `strides` alongside warm-up, intervals (work), recovery and cool-down. Splits tab filter chips: All · Warm-up · Strides N · Intervals N · Cool-down.
- **Detection** (run before interval detection):
  - Use watch laps when present (Garmin/Strava laps), otherwise pace-change detection on the stream.
  - A stride is a fast effort ≤ 40 s **and** ≤ 200 m, clearly faster than the surrounding easy pace (about 15% or more), followed by a jog or walk recovery of at least 30 s.
  - A run of 2–10 of these before the main set (or after an easy run, or at the end of a session) becomes one **Strides ×N** group.
  - Interval reps are then detected from what's left. Strides never join an interval set, even when similar in pace.
- **Display:** group row "Strides ×4 · avg 20 s · 98 m · jog-back recovery", expandable to each stride's time and pace. Leave them out of interval averages, "fastest rep" and the interval count.
- **Plan matching:** "Easy + strides" (already an option in the session builder) matches against the strides group. Strides before an interval session don't count as part of the session's work volume.
- **Manual correction:** long-press or tap ⋯ on any lap → Mark as warm-up / stride / interval / recovery / cool-down. Save the override for that activity (e.g. `activity_lap_overrides` or a jsonb column), re-group and re-match, and use the corrections to tune the thresholds for that user.
- **Tests:** easy 3 km + 4 × 20 s strides + 5 × 1 km + cool-down → groups W/S×4/I×5/R×4/C; easy run with 6 strides at the end → Easy + Strides×6; 8 × 200 m at 5K pace with 200 m jogs → intervals (not strides, because 200 m reps longer than 40 s count as intervals).

## Task 3: Rename Run to Activity, with a single recording hub

See `images/s-activity.png`.

- Nav label **Activity** (same position). New route `/record`, and redirect `/run` to it (`/activity/:id` is already the activity detail page, so don't reuse `/activity`).
- At the top: **today's planned session**, whatever its type (run, strength or HYROX), with Start and Details.
- Below it: **Free run** (the existing free-run screen and modes), **Strength** (Task 4), **HYROX** (Task 5), and **Log something done** (opens the existing "+" sheet).
- The existing Training "+" → "Log strength session" also offers "Pick exercises" (opens the Task 4 builder in log-after mode).

## Task 4: Free strength training with saved workouts

See `images/s-strength-build.png` and `images/s-strength-live.png`.

- **Builder:** search and filter the existing exercise library (Legs, Hips, Core, Upper, Plyo, plus a new **HYROX** tag). Add exercises, set sets × reps (or time) × kg, drag to reorder. Respect the "Never give me…" list and equipment settings, marking excluded exercises rather than hiding them.
- **Save as a workout** with a name. Users can save several and star up to 2 favourites, which appear first as cards with Start. Edit, rename, duplicate, delete.
- **Recorder:** reuse `StrengthPlayer`'s set logging: reps/kg steppers, effort per set (5–10), a rest timer from Profile → Rest between sets, "Last time: 3 × 8 at 10 kg" with a suggested increase, and Swap / Add exercise / Notes.
- **On finish**, save as a strength activity with its exercises. It counts toward weekly load, can auto-post to the Hub (existing setting), and feeds progression when an exercise matches a plan exercise.
- **Data (Supabase):**
  ```sql
  create table strength_templates (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users on delete cascade,
    name text not null,
    exercises jsonb not null,   -- [{exerciseId, sets, reps|null, seconds|null, weightKg|null, restS|null}]
    favourite boolean not null default false,
    created_at timestamptz default now(),
    last_used_at timestamptz
  );
  alter table strength_templates enable row level security;
  create policy "own templates" on strength_templates
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  ```
  Store free sessions in the same table and shape as planned strength sessions, with `source = 'free'` and `template_id` (nullable).

### 4b: Weight on every set (planned and free sessions)
See `images/s-strength-weight.png`.
- Every logged set stores `{reps|null, seconds|null, loadKg|null, loadType: 'added'|'bodyweight'|'bodyweight_plus'|'band', band?: 'light'|'medium'|'heavy', perSide?: boolean, effort}`. Apply this to `StrengthPlayer` (planned sessions), the free strength recorder, and the "Log strength session" form when exercises are picked.
- **Set table UI:** columns Set / Last time / kg / Reps / ✓, filled from the last session's values. Numeric keypad with decimal allowed for kg (`inputMode="decimal"`). Quick chips −2.5 / −1 / +1 / +2.5. kg/lb setting in Profile → Strength (store kg, convert for display).
- **Progression:** today it only adds reps ("Next: +1 reps (to 13)"). Use double progression instead: when all sets are at effort ≤ 7, add reps until the top of the range (for example 12). Then add load (+2.5 kg lower body, +1–2 kg upper body/dumbbells) and drop back to the bottom of the range. Bodyweight exercises progress through reps, then the harder variation (the block progression that already exists).
- **Summary** (and `/strength-plan` "Last session"): show weight with reps ("2 × 12 · 18 kg"), session volume (kg × reps), best set and estimated 1RM (Epley: kg × (1 + reps/30)), plus a per-exercise history chart on tap.
- **Equipment "No equipment"**: hide the kg column by default but keep "+ add load".

## Task 5: HYROX recording

See `images/s-hyrox-setup.png`, `images/s-hyrox-live.png` and `images/s-hyrox-summary.png`.

### Race format (25/26 rulebook)
8 × (1 km run + station), in this order:

| # | Station | Work | Women Open | Men Open / Women Pro | Men Pro |
|---|---|---|---|---|---|
| 1 | SkiErg | 1000 m | — | — | — |
| 2 | Sled push | 50 m | 102 kg | 152 kg | 202 kg |
| 3 | Sled pull | 50 m | 78 kg | 103 kg | 153 kg |
| 4 | Burpee broad jumps | 80 m | — | — | — |
| 5 | Row | 1000 m | — | — | — |
| 6 | Farmers carry | 200 m | 2 × 16 kg | 2 × 24 kg | 2 × 32 kg |
| 7 | Sandbag lunges | 100 m | 10 kg | 20 kg | 30 kg |
| 8 | Wall balls | 100 reps | 4 kg to 2.70 m | 6 kg to 3.00 m (Women Pro: 2.70 m) | 9 kg to 3.00 m |

Sled weights include the sled. Divisions: Open, Pro, Doubles (partners split station work, both run all 8 km), Relay (4 people, each does 2 runs and 2 stations). **Roxzone** is the transition area between the run course and the stations. Put the loads in a config file (`hyroxDivisions.ts`) so they can be updated each season.

### Modes (tabs: Simulate / Station practice / Race day)
- **Full simulation:** 16 segments.
- **Half simulation:** front half (runs 1–4 + stations 1–4) or back half (runs 5–8 + stations 5–8).
- **Custom:** choose which runs and stations, the order, distances and reps. It can be saved like a strength template (`hyrox_templates`, same shape as Task 4).
- **Station practice:** time one station, with optional repeats.
- **Race day:** enter official splits after the race (16 times plus Roxzone), or run the recorder live.
- **Swaps** if equipment is missing (no sled → heavy prowler / band sled drag; no SkiErg → band pull-downs). Swapped segments are flagged and left out of records.

### Live recorder (`images/s-hyrox-live.png`)
- Dark full-screen layout, total time, and a 16-segment progress strip (done = brand, current = accent).
- Current segment card: name, work, standard ("chest to floor, two-foot jump"), segment timer, target for the segment.
- **One big button:** "Station done → Run 5" / "Run done → Sled push". Add a 3-second Undo and a Pause.
- Optional **Roxzone timing:** two taps per transition (arrive at station / start station). Otherwise transitions count as part of the run.
- **Runs:** GPS distance using the existing run recorder, or a "Treadmill / indoor" toggle that records time only. Voice cue and vibration on every segment change. Pocket mode works. Call `navigator.wakeLock.request('screen')` in the browser.
- Save progress continuously (IndexedDB) so a crash or reload doesn't lose the session.

### Summary (`images/s-hyrox-summary.png`)
- Total vs goal; running / stations / Roxzone totals.
- Run-split bars (8). Highlight runs > 15 s slower than the median of the other runs, and name the station before each one ("Runs after sled pull and sandbag lunges were 26 s slower").
- Each station vs the target from onboarding or the previous best, as +/− tags.
- Records: best simulation, best run split, best time per station.

### Data
```sql
create table hyrox_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  started_at timestamptz not null,
  mode text not null check (mode in ('full','half_front','half_back','custom','practice','race')),
  division text not null,          -- 'women_open','men_open','women_pro','men_pro','doubles_*','relay_*'
  segments jsonb not null,         -- [{i, kind:'run'|'station'|'roxzone', key:'skierg'|..., startMs, endMs, distanceM?, reps?, loadKg?, swapped?:string, gpsTrackId?}]
  total_ms int not null,
  is_race boolean default false,
  rpe int, notes text,
  template_id uuid null
);
-- RLS: same as strength_templates.
```
Also add each session to the main activities feed (type `hyrox`) so it appears on You, in the weekly load and on the Hub.

## Task 6: HYROX athlete onboarding and plan

See `images/s-onb-type.png`, `images/s-onb-hyrox.png` and `images/s-hyrox-plan.png`.

### Onboarding
- New step in **About you**: "How do you train?" → **Runner** / **HYROX athlete** (NEW tag) / **Both**. Save as `profile.athleteType`.
- **Your goal** distance chips: 5K · 10K · Half marathon · Marathon · **HYROX** (HYROX athletes see it selected by default).
- When HYROX is picked: division (Open / Pro / Doubles / Relay plus Women / Men / Mixed, with a one-line summary of the loads), race date (optional), goal time (uses `DurationInput`), optional previous HYROX time, **hardest stations** (up to 3), and equipment available (SkiErg, Rower, Sled, Wall ball, Kettlebells, Sandbag).
- Keep the existing recent 5K/10K step: run paces still come from running fitness.
- Profile gets a "HYROX" section to edit all of this later.

### Plan generation
- Add goal key `"HX"` next to `"5K" | "10K" | "HM" | "M"`. Run volume is lower than for road racing (similar to a 10K plan at about 60–75% of the volume) and the long run is capped around 75–90 min.
- **HYROX run pace** = (goal time × run share) / 8, with run share 0.47 by default. Once a simulation exists, use the athlete's own share. Limit it so it's never faster than threshold pace from 5K fitness.
- **Session types to add:**
  - `hyrox_km_repeats`: 1 km repeats at HYROX run pace. Start at 6 × 1 km with 90 s rest, build to 8 × 1 km, then shorten the rest (90 → 60 → 45 s), then replace the rest with a short station block.
  - `compromised_runs`: 4–8 × (station block + 1 km at HYROX pace). Choose station blocks from the hardest stations and the equipment available (for example 25 wall balls, 50 m lunges, 250 m SkiErg/row, 20 m sled).
  - `hyrox_sim_half` every 2–3 weeks in the build phase, and `hyrox_sim_full` once, 3–4 weeks out. Never in race week.
  - Plus the existing easy, threshold and long runs.
- **Strength:** the existing strength plan with a HYROX block. Extra work for the chosen weak stations: sled push/pull (or alternatives), lunges, wall balls, farmers carry (grip), burpee broad jumps. Two sessions a week, one of them light during taper weeks.
- **Typical week** (build phase, 5–6 days): Mon 1 km repeats · Tue station strength · Wed easy · Thu compromised runs · Fri rest/mobility · Sat half simulation or long easy · Sun long easy.
- **Taper:** last 10 days cut volume by about 40%, keep a short race-pace touch (4 × 1 km), and finish with one light station run-through.
- **"Both"** athletes: plan for whichever race is nearer. If two races are within 8 weeks, keep 1 maintenance session a week for the other.
- Explain every change in Plan changes, the same way the app already does.

## Task 7: Smaller improvements (if time allows)
- HYROX race predictor in You → Insights.
- When an imported Garmin or Strava activity has ≥ 16 laps, offer "Map laps to HYROX segments".
- Give Coach the HYROX profile, splits and weak stations.
- Race-day screen for HYROX: pacing card per run, warm-up, then split entry.

## Check before finishing
- Every time field works on iOS Safari and Android Chrome (real device or emulator), with keypad only.
- Onboarding works end to end as a Runner, as a HYROX athlete and as Both, and as a new user with no race time.
- Injury: day 1 report → short day 2 and 3 check-ins → "It feels healed" → plan rebuilt → "It's back" resumes at the last step.
- Strength: kg saved on every set, shown as last time next session, progression adds weight after hitting the top of the rep range.
- Splits: warm-up + strides + intervals session shows a separate Strides group, and interval averages exclude strides.
- Cross-training: save shows a toast, appears on the day and in History, can be edited and deleted. Recording a bike works. A Garmin ride imports.
- Custom exercise: create, use in a workout, log it with weight, see "last time" next session.
- Saved workout: blank name becomes "Strength session N", it shows on Activity, can be scheduled for Thursday and appears on Training that day.
- You page: with a strength session, a bike and a HYROX sim this month, All shows them in the list and in time trained. The Strength filter shows sessions, volume and records.
- Plan builder: unit tests for U4 pass.
- Animations: every exercise on a test page shows the right movement, with props and the second arm.
- Start a workout, close the tab, reopen: "Workout in progress → Resume" restores the exact set. Press back mid-workout: the leave sheet appears.
- Rest and timers: set 60 s between sets and 2 min between exercises plus a 40 s plank, save, restart the app, start the workout: same timers. The rest timer finishes correctly after locking the phone for 2 min.
- Free strength: build, save, favourite, start, log, finish, see it in history and the Hub. Saved workouts survive a reload.
- HYROX: full simulation with Undo and Pause, reload mid-session (state restored), summary values add up (runs + stations + Roxzone = total).
- No layout overflow at 360 px width. Light and dark themes both work.
