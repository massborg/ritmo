# Phase 1: steps outside the code

Nothing below has been done yet. Each needs your approval or your dashboard access.

## 1. Apply the database migration (needs approval)
`supabase/migrations/20261106000000_phase1_avatars_and_coach_limits.sql`
- Creates the private `avatars` storage bucket (JPEG only, 2 MB max) with owner-only policies.
- Creates `ai_usage` and `take_coach_quota()` (30 AI answers an hour, 100 a day per person).
Then run `supabase/tests/phase1_check.sql` in the SQL editor: every row should read `ok`.

## 2. Redeploy two edge functions (needs approval)
- `coach`: checks the usage limit before calling the AI (returns 429 over the limit).
- `delete-account`: also deletes the person's profile picture.
Deploy them after the migration, or the coach logs a quota warning and carries on without a limit.

## 3. Supabase dashboard (Authentication settings)
- Rate limits: keep sign-ups and emails sent at the defaults or lower (for example 30 sign-ups an hour per IP).
- Passwords: minimum length 8, require letters and digits (matches the app).
- Turn on leaked password protection if your plan includes it.
- URL configuration (from before): Site URL `https://ritmo-running.netlify.app`, redirect URL `https://ritmo-running.netlify.app/**`.

## 4. Merge to main (deploys to Netlify)
Merging `phase-1` into `main` publishes the new screens and the security headers in `netlify.toml`.
Apply steps 1 and 2 first, otherwise photo uploads fail with a clear error until the bucket exists.

## 5. Legal review
See `docs/legal/REVIEW_NOTES.md`. Company name, address and contact email are still missing.
