# Morning report: Review #2 implementation

Date: 7 November 2026. Brief: "Ritmo Running — Review #2 & Improvement Brief (FINAL)".

## TL;DR

- The big bug is fixed: **every run loads, with no cap**. Ryan's account has 1,319 runs, and the live app loads only 1,000. Tested with 10,000 and 12,000 runs.
- All work is in **five stacked pull requests**. Merge them in order: #1 → #2 → #3 → #5 → #6. Merging needs your review (I am not allowed to merge), so **none of this is on the live site yet**.
- Run, Hub, share images and Body are built and **on for Ryan's account only** (feature flags).
- The database changes are **additive only**, and a full copy of the runs table was taken first. The Supabase functions are deployed.

## Pull requests (merge in this order)

| # | What | Brief sections |
|---|---|---|
| [#1](https://github.com/massborg/ritmo/pull/1) | Every run loads (no cap), light loading, best efforts, import report, deploy recovery, past days | §1, §9.1 |
| [#2](https://github.com/massborg/ritmo/pull/2) | One source of truth, races recognised, same-day sessions, run page, coach fallback, race week | §9.2–§9.7 |
| [#3](https://github.com/massborg/ritmo/pull/3) | Training page for any day, Log this session, screenshots, feedback report, navigation | §2, §6 |
| [#5](https://github.com/massborg/ritmo/pull/5) | Run tab, Hub, share images, Body, privacy update (all flagged, Ryan only) | §3, §4, §5, §9.8, §10 |
| #6 | Small polish and this report | §9.9 |

Each pull request is based on the one before it. Netlify builds a preview for each pull request, linked in its checks (usually `deploy-preview-<n>--ritmo-running.netlify.app`).

## What was done, by section

**§1 Critical bugs**
- 1.1 Runs load newest first in pages of 1,000 until the account's count is reached, so there is no cap. Only summary columns are downloaded; streams and laps load for the run being viewed. Each run keeps a small stored summary (best efforts at 12 distances, structure, heart-rate bands). The new `derive-runs` Edge Function fills it in for existing runs on the server. Repeat visits fetch only changes (about 1.4 KB). Saving a run loaded as a summary never overwrites its detail in the database.
- 1.2 Best efforts use a sliding window inside every run and ignore GPS jumps faster than 2:20/km. PBs cover 1 km to marathon, each with a PB history, labelled race, time trial or training effort.
- 1.3 The import report lists skipped files by category (wellness, cycling, swimming, walking, gym, unreadable), shows runs found, saved, merged and failed, and has a downloadable log. Treadmill, track, trail, indoor and virtual runs are all imported.
- 1.4 After a deploy, a missing page file reloads the app once; if that fails, a "Ritmo was updated" message appears, never a white screen. An "update available" prompt appears too. Old asset files now return a real 404.
- 1.5 Every day shows the runs actually done. The week strip marks missed sessions.

**§9 Re-test #3 findings**
- 9.1 10,000 runs ≈ 2.2 MB of summaries before gzip, 0 bytes of streams; usable in about 1.5 s on first load and about 1 s on repeat visits. Libraries are split into separately cached files.
- 9.2 One athlete summary feeds Today, Progress and the coach. Plan compliance counts only sessions due so far. "Log 3 more runs" never shows when there is a history.
- 9.3 Races are recognised from names (English, Italian and Maltese), calendar dates or the runner's own mark. There is a review list and a race toggle on each run. "Nadur 10k race" is a unit test.
- 9.4 Pieces within 90 minutes on the same day form one session with a day total. Short structured files are "Strides and drills". Fragments under 2 km are never compared.
- 9.5 Run page: one-decimal chart ticks on short runs, "What to improve" always specific and never contradicting the run's pace, "How did it feel?" near the top, route only when there is GPS.
- 9.6 The coach says when and why the AI was unavailable. Answers written before the data fix are marked, with "Clear old answers".
- 9.7 Race week keeps the chosen run days, rests 2–3 days before the race, and has one race-pace sharpener 4–5 days out. Labels follow the actual previous day. Easy runs vary in length.
- 9.8 The privacy text is updated for the Hub, screenshots and Body. Hub sharing has a separate opt-in consent, off by default, with its date recorded.
- 9.9 Hand-logged runs are named by time of day ("Morning run").

**§2 Requested changes**
- 2.1 Nav label "Training"; the title follows the selected day ("Monday's training · 2 Nov").
- 2.2 Any day can be chosen with the strip, week arrows, a swipe, the date picker or the ← → keys. Past sessions ask "Did you do this session?".
- 2.3 "Log this session" offers three ways: link a watch run, read screenshots, or enter time, distance, heart rate and each rep. The run is linked to the session, and a later watch file merges instead of duplicating.
- 2.4 Up to 10 screenshots, stored privately. The `read-laps` function reads the lap table with a smaller vision model and marks unsure cells in amber. Nothing is saved without the runner confirming.
- 2.5 The feedback report has a specific verdict, a score breakdown (pace accuracy, consistency, effort control, recovery quality, completion), a rep chart against the target band, a goal note, a next-session tip, badges and a trend line, and "Ask the coach about this run". There is a Sunday "Your week in review".

**§6 Navigation.** Phones show Training · Calendar · (Run) · (Hub) · You; Run and Hub appear only when flagged. Coach is a floating button on Training, run and session pages, and has an entry in You. The desktop sidebar lists everything.

**§3 Run tab (flagged)**
- GPS with accuracy shown before the start, a countdown, audio cues, auto-pause, pause and resume, laps, screen lock and hold-to-finish.
- Workout mode follows the planned steps with a pace gauge.
- The run is saved on the device every 5 s and offered back after a crash.
- The site's security headers blocked location; they now allow it for Ritmo's own pages.

**§4 Hub (flagged)**
- Opt-in first. The feed has Following, Everyone and Your runs.
- One reaction, "Ritmo", shown as an orange flame. Tap the button or double-tap the route; the count updates at once and is rolled back if saving fails. You can see who gave a ritmo.
- Comments with one level of replies, editing and deleting, reporting, blocking and a profanity filter.
- Notifications are batched, follow requests can be accepted or declined, and runners can be found and followed.
- The database access rules were tested directly in Supabase.

**§5 Share images (flagged).** Six templates in three sizes, with themes and stat toggles. Share, download or copy. Routes leave out the start and finish.

**§10 Body (flagged)**
- The check-in uses rule-based red flags. A red flag gives no exercise tips and pauses running until the runner confirms they have been checked.
- The plan adapts by pain level and body area, and every change is logged with its reason. Return to run comes in 6 steps.
- Body chat runs the same red-flag rules before any AI, and the server checks again. It has its own safety prompt and its own AI switch.
- The You page shows history, pattern alerts, exercise routines and a physio summary download.

## Tests (all passing on the last run)

- Unit tests: 138.
- End-to-end: flows 74, training 19, scale 12 (10,000 and 12,000 runs), drag 16, deploy recovery 4, run 9, hub 19, share 14, body 11. Phone fit on 7 devices: clean. Lint and build: clean.
- The mock Supabase used by the tests now behaves like PostgREST, including the 1,000-row cap, so this class of bug is caught.
- Database access rules for the Hub and account deletion were tested on the real database in rolled-back transactions.

## Skipped or partial, and why

- **Service worker / offline (§9.1, §8.6).** Not added. A badly cached service worker can trap people on an old version, which is the same problem as §1.4. The deploy-recovery work covers the white screen; offline support needs its own careful step.
- **Server-side athlete stats table (§1.1).** Stats are computed on the device from run summaries instead; it's fast at 12,000 runs. A server table can come later if needed.
- **First load under 300 KB for 10,000 runs (§9.1 test).** Not met: about 2.2 MB before gzip, roughly 400–500 KB over the network. Repeat visits are about 1 KB. Getting under 300 KB would need the server-side stats above.
- **Maps.** Done after this report: routes on your own run pages now sit on OpenStreetMap tiles, with the required credit and a "Hide map" switch remembered on the device. The privacy policy names the OpenStreetMap Foundation. Hub posts and share images still show the route line only, so other people never see a map of where you run.
- **Weather (§2.5, §8.3).** Built after this report with MET Norway (free, no key, commercial use allowed): recent runs with GPS get temperature, feels-like, humidity and wind as they arrive, and the feedback adds a note on hot, humid, windy or cold days without changing the score. MET has no past weather, so runs older than about 3 hours (including the existing history) have none. Server function `weather`.
- **AI write-up of feedback (§2.5).** The structured report is complete; an AI rewording can be added now that the key exists.
- **Hub:** clubs, race pages, live updates (the feed refreshes on open), push notifications, @mention notifications, photos in posts and an admin moderation view are not built yet.
- **Body:** the body map uses area buttons, not a drawn figure. There are no exercise videos. The physio summary is a download, not a link that expires after 7 days. There is no physio directory.
- **Run tab:** live location sharing, SOS, GPX/FIT export, Web Bluetooth heart-rate straps and following a saved route are not built. Background GPS needs the Capacitor app.
- **§7 and §8 polish** not reached: Goals week preview and "Classic week" preset, plan length control, "Explain this week", ICS calendar feed, reminders, race-day mode, Sentry, shoe auto-assignment, duplicate tools, PWA install prompt.

## Decisions I made

- **Backup:** there is no `pg_dump` access from here, so I made a full copy of the runs table inside the database (`activities_backup_20261106`, readable only by the service role).
- **Run summaries:** filled in on the server rather than on the phone, so Ryan's phone does not download about 67 MB once.
- **New columns** go in the existing `source_ids` JSON instead of new columns (race marks, planned-session links, reps, screenshots), keeping migrations small.
- **Navigation for everyone (§6):** Training · Calendar · You, with the coach as a floating button. Coach is no longer a tab for anyone.
- **Hub:** private profiles by default (approve followers), and initials rather than profile photos. Photos are stored privately and the privacy text says other runners never see them.
- **Lap reading** uses `claude-haiku-5-5` (cheaper; change it with the `LAPS_MODEL` secret). The coach keeps `claude-opus-5-5` (change it with `COACH_MODEL`).

## Things only you can do

1. **Review and merge** the pull requests in order (#1, #2, #3, #5, #6).
2. **Check the AI key.** `ANTHROPIC_API_KEY` was added. Ask the coach a question; if the "data used" line reads "AI coach", it works.
3. **Garmin terms (§9.8).** Before the Hub opens to anyone else, check Garmin's Connect developer terms on showing Garmin data to other users and on device attribution. The app never posts Garmin runs on its own; the runner chooses each post.
4. **Legal check for Body (§10)** before public launch: wording and features avoid diagnosis and treatment, but that should be confirmed under the EU medical device rules.
5. **Strava (§8.19).** Read Strava's current API agreement before building Strava sync, because it limits showing Strava data to other users and using it in AI features.
6. **Turn features on for others** when ready by adding rows to `feature_flags` (`run_tab`, `hub`, `share_cards`, `body`).

## Everything changed in Supabase (already live; additive)

- **Tables and columns:** backup table `activities_backup_20261106`; columns `activities.derived` and `activities.updated_at` (with trigger and indexes); `activity_deletions`; `feature_flags` (on for Ryan only); the Hub tables.
- **Storage and limits:** the `run-media` private bucket with owner-folder policies; `lap_reads` with a limit of 30 a day.
- **Edge Functions:** `derive-runs` (new), `read-laps` (new), `delete-account` (also removes run screenshots), `coach` (Body mode).
- **Account deletion** still removes everything; tested in a rolled-back transaction after the new tables were added.
