# Ritmo Running

Train to your own rhythm.

Ritmo connects to a runner's data, understands years of training, and tells them what to do next and why.

## Status: Stage 1 (web app)

Live: https://ritmo-running.netlify.app

- Splash, first-time setup (upload, import progress, running story, goals), Today, Calendar (day/week/month), training plan with explained adaptations, session analysis and feedback, races (prediction, readiness, pacing, taper, post-race review), Progress, Coach, Profile, data sources, privacy (export and delete).
- Clearly labelled sample data runs through the same integration layer as real sources.
- **Accounts are required.** Email and password sign-up with health-data consent, log in, log out, forgot and reset password (Supabase Auth). Every route except log in, sign up, password reset and privacy needs an account, and returns people to the page they wanted after login.
- Each account's runs, plans, races, feedback and coach chats are stored in Supabase under row-level security, with a per-user cache on the device that is cleared on logout. Data saved by older versions in a browser is offered to the next new account on that browser.
- **Beginner path:** "I'm new to running" builds an effort-based run/walk plan (three days a week, building to 30 minutes continuous, then a 5K). "I did it" logs runs by hand. Features unlock in stages: estimated paces after 3 runs; VDOT, race predictions, readiness score and training load after a time trial, race or detailed history.

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

## Security

- All seven tables (`profiles`, `activities`, `races`, `plans`, `session_feedback`, `sources`, `coach_messages`) have RLS with select/insert/update/delete limited to `auth.uid() = user_id`; signed-out clients have no table grants.
- `delete_my_data()` runs as the caller, so RLS limits it to their rows. The `delete-account` function deletes only the user identified by the request's own token (rows cascade). The `coach` function rejects anyone who is not a signed-in user.
- `supabase/tests/rls_check.sql` verifies this with two temporary users (last run 5 Nov 2026: all checks passed).

## Development

```bash
npm install
npm run dev
npm test                 # unit tests: plan logic, adaptation rules, fitness stages, analysis, coach
npm run build && npx vite preview --port 4173 &
node e2e/flows.cjs       # browser flows at phone and desktop size against a simulated Supabase
node scripts/phone-fit.cjs   # overflow and 44px tap targets on seven phone sizes
```

### Supabase Auth settings (dashboard)

- Authentication > URL Configuration: Site URL `https://ritmo-running.netlify.app`; add `https://ritmo-running.netlify.app/**` to Redirect URLs.
- Authentication > Providers > Email: keep "Confirm email" on.
- Authentication > Emails: set up custom SMTP before launch (the built-in sender is rate limited).

## Build order
1. Responsive web app with sample data and file uploads (this stage)
2. Live Garmin sync once Garmin approves access (add a `garmin` adapter with `sync()` behind the same integration layer; Garmin data is never used to train AI models)
3. iPhone and Android apps from a shared codebase with Apple Health and Health Connect
