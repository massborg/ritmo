# Ritmo Running

Train to your own rhythm.

Ritmo connects to a runner's data, understands years of training, and tells them what to do next and why.

## Status: Stage 1 in progress

This is work in progress and does not build yet.

Done so far:
- `src/training/`: fitness (VDOT, race predictions, paces, heart rate zones), load and readiness, session analysis and feedback, adaptive plans, insights (personal bests, running story, race readiness, pacing, taper)
- `src/data/`: one integration layer for all sources with de-duplication, FIT/GPX/TCX/Garmin export parsers, local-first storage with a Supabase mirror, deterministic sample data
- `public/brand/`: logo files

Still to do: UI screens (splash, Today, Calendar, Progress, Coach, Profile), coach chat, Supabase schema, tests, Netlify deploy.

## Build order
1. Responsive web app with sample data and file uploads
2. Live Garmin sync once Garmin approves access
3. iPhone and Android apps (shared codebase) with Apple Health and Health Connect
