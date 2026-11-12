# Ritmo update 3: test checklist report (brief §11)

Run on 12 November 2026 against `main` after PR57, plus the checklist branch (`update3-checklist`).

**Result: every check passes.**
- 338 unit tests.
- 964 end-to-end checks in 44 suites.
- A sweep of the 14 update 3 screens and sheets in Giorno, Notte and Sole, on phone (390 px) and desktop: 84 views.

The sweep found one problem: small tap targets on a post's author. It's fixed on the checklist branch (see the end).

| Checklist item | Result | Covered by |
|---|---|---|
| Section 1 acceptance: data consistency, the Mon 9 Nov session in parts, PB, challenges, Strava visibility | ✅ 33/33 | `u3-consistency`, plus unit tests `session-view`, `match-day`, `body`, `challenges` |
| Voice: priming, Test voice, blocked-state message, fallback clips | ✅ 26/26 | `u3-stage2` (with `voice` 15/15 and `run-screen` 27/27); unit `cues` |
| Store app: cues with the screen locked | ⏸ Not testable | Needs the native store app |
| Locked screen: Pocket mode works; the gap is flagged and excluded | ✅ | `u3-stage2`; unit `tracker` (5 km run with a 10-minute lock: gap left out, pace unchanged) |
| Store app: full tracking with the phone locked | ⏸ Not testable | Needs the native store app |
| Strength in the plan by phase, away from hard days, none in the last 3–4 days before an A race | ✅ | Unit `strength` and `engine`; `u3-stage4` |
| Guided player (sets, reps, load), rest timer, manual log, auto-posted to the Hub with Fuego | ✅ 32/32 + 2 | `u3-stage4`; Fuego on another runner's strength post in `checklist-u3` |
| Choose your week: per-day types, + Strength, strength on a rest day, guard-rail warnings, rebuild from tomorrow only | ✅ 24/24 | `u3-stage3`; unit `week-choice` |
| Edit an exercise (swap, Always use this instead, Never give me) | ✅ | `u3-stage4`; unit `strength` |
| Edit today's run (8 → 10 km, impact check, Reset to plan); feedback uses the edited session | ✅ | `u3-stage3`; unit `edit-session` |
| Progression: more load and reps after a good session, repeat after a hard one, next block after week 4 | ✅ 34/34 | `u3-stage5`; unit `progression-care` |
| Injury care: stages, pain-check rules, running adjustments with undo, safety text, physio referral wording | ✅ | `u3-stage5`; unit `progression-care` |
| All three themes, phone and desktop; tap targets at least 44 px; keyboard focus visible | ✅ 8/8 | `checklist-u3`: 84 views, no sideways scrolling, every control labelled, focus visible |

## Earlier features (no regressions)

All 44 suites pass:

| Group | Suites |
|---|---|
| Update 2 | `update2-stage1/2/4/5`, `checklist-u2`, `delete-runs`, `shoe-match-reasons`, `push`, `strava` |
| Core app | `flows` (74), `fit` (59), `hub`, `hub-stage8`, `coach`, `feedback`, `readiness`, `training`, `body`, `nav`, `profile`, `you` |

The five screenshot scripts (`screens`, `ryan-screens`, `setup-screens`, `feature-screens`, `make-garmin-export`) ran without errors. They make images, not pass/fail checks.

## Fixed during this run

- **Tap targets on another runner's post.** The author's photo link was 40×40 px and the name link was 20 px tall. Both now have a 44 px hit area, and the layout doesn't move. This is on branch `update3-checklist`, waiting to be merged.

## Still open

- **Native store app:** voice with the screen locked, and GPS tracking with the phone locked. These need native code (background audio and location).
- **Physiotherapist review of the care plans** before launch. The content is in `public/care/care-plans.json`. Set `"reviewed": true` there once it has been checked.
- **A real iPhone run** of the voice acceptance test (cues every km for 5 km with the screen on). Speech here is simulated.
