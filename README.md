# Ritmo Running

Train to your own rhythm.

Ritmo connects to a runner's data, understands years of training, and tells them what to do next and why.

## Status: Stage 1 (web app)

Live: https://ritmo-running.netlify.app

- Splash, first-time setup (upload, import progress, running story, goals), Today, Calendar (day/week/month), training plan with explained adaptations, session analysis and feedback, races (prediction, readiness, pacing, taper, post-race review), Progress, Coach, Profile, data sources, privacy (export and delete).
- Clearly labelled sample data runs through the same integration layer as real sources.
- Local-first storage (IndexedDB), mirrored to Supabase when the runner signs in by email link.

## Architecture

- **Web app**: Vite + React + TypeScript, no UI framework. Design tokens for the Giorno, Notte and Sole themes in `src/styles/tokens.css`.
- **Training engine** (`src/training/`): pure functions, unit tested.
  - `fitness.ts`: VDOT from races and best efforts, race predictions, training paces, heart-rate zones Z1–Z5 (Karvonen).
  - `load.ts`: TRIMP-based load, fitness/fatigue/form, acute:chronic ratio, readiness with reasons.
  - `analysis.ts`: session classification, splits, heart-rate drift, fade, easy-too-hard, similar sessions, score and feedback.
  - `plan.ts`: base/build/peak/taper/recovery plans; adaptation after missed, harder or easier sessions, illness, pain, load spikes and race-date changes, each with a plain-English explanation.
  - `insights.ts`: mileage, personal bests, running story, race readiness, pacing plans, taper guidance.
- **Integration layer** (`src/data/integration.ts`): one adapter per source; `merge()` removes duplicates (start within 3 min, distance within 5%) and keeps the most detailed version, recording every source id.
- **Parsers** (`src/data/parsers.ts`): FIT, GPX, TCX and Garmin bulk export ZIP (nested ZIPs and `summarizedActivities` JSON), all in the browser.
- **Coach** (`src/coach/coach.ts`): answers built only from computed facts. The Supabase `coach` function can phrase answers with Claude when `ANTHROPIC_API_KEY` is set; otherwise the app answers locally.
- **Supabase** (project RITMO): tables `profiles`, `activities`, `races`, `plans`, `session_feedback`, `sources`, all with row-level security; `delete_my_data()` RPC. Schema in `supabase/migrations`.

## Development

```bash
npm install
npm run dev
npm test
```

## Build order
1. Responsive web app with sample data and file uploads (this stage)
2. Live Garmin sync once Garmin approves access (add a `garmin` adapter with `sync()` behind the same integration layer; Garmin data is never used to train AI models)
3. iPhone and Android apps from a shared codebase with Apple Health and Health Connect
