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
- Free strength: build, save, favourite, start, log, finish, see it in history and the Hub. Saved workouts survive a reload.
- HYROX: full simulation with Undo and Pause, reload mid-session (state restored), summary values add up (runs + stations + Roxzone = total).
- No layout overflow at 360 px width. Light and dark themes both work.
