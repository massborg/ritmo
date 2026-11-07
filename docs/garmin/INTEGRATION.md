# Garmin Connect integration

Built ahead of Garmin's approval (request submitted 7 November 2026). It stays switched off until the steps
below are done, and then only for accounts with the `garmin` feature flag.

## How it works

1. **Connect.** Data sources → Garmin Connect → **Connect Garmin**. The `garmin-auth` function starts OAuth 2.0
   with PKCE and opens Garmin's consent page. Garmin sends the runner back to `/garmin/callback`, and
   `garmin-auth` exchanges the code for tokens, reads the Garmin user id and permissions, and stores them in
   `garmin_connections` (server-only: no client policies).
2. **New runs.** Garmin pushes activity summaries and activity details to `garmin-webhook`. Running types
   are stored in `garmin_inbox` for the matching runner; other sports are ignored.
3. **Into Ritmo.** When the app opens or comes back to the foreground, it collects the inbox, maps each run
   (`src/data/garmin.ts`, tested in `garmin.test.ts`), merges it with the usual rules (a run that also
   arrives as a file is kept once, the most detailed version wins), saves it, and clears the inbox.
4. **Attribution.** Runs from Garmin show "from Garmin <device>" on the run page, per Garmin's brand guidelines.
5. **Disconnect.** Disconnect in Ritmo calls Garmin's `DELETE user/registration`, deletes the tokens and
   anything still in the inbox. Runs already saved stay. A deregistration or permission change sent by Garmin
   does the same on our side. Deleting the Ritmo account also deregisters with Garmin first.

## Switching it on (after Garmin approves)

1. **Database:** apply `supabase/migrations/20261107120000_garmin_connect.sql`.
2. **Functions:** deploy `garmin-auth` (normal) and `garmin-webhook` **with JWT verification off**
   (`supabase functions deploy garmin-webhook --no-verify-jwt`), and redeploy `delete-account`.
3. **Secrets** (Supabase → Edge Functions → Secrets): `GARMIN_CLIENT_ID`, `GARMIN_CLIENT_SECRET`.
   Optional: `GARMIN_REDIRECT_URI` (default `https://app.ritmorunning.run/garmin/callback`) and the endpoint
   overrides in `supabase/functions/_shared/garmin.ts` if the Developer Portal lists different addresses.
4. **Garmin Developer Portal** (evaluation app first):
   - Redirect URL: `https://app.ritmorunning.run/garmin/callback`
   - Push endpoints for Activities, Activity Details, Deregistrations and User Permissions:
     `https://gujuzacfqxbwfpprkgrx.supabase.co/functions/v1/garmin-webhook`
5. **Flag:** add `garmin` for the test accounts, for example
   `insert into public.feature_flags (user_id, flag) values ('<user id>', 'garmin');`
6. Connect a test account, record a run, and check it appears in Ritmo with the device name.
7. Pass Garmin's partner verification, switch to production keys, then open the flag to everyone.

## Notes

- Starter access has no historical data. Past years still come from the Garmin export upload.
- The webhook trusts Garmin's user ids, which are opaque; notifications for unknown users are ignored.
  If Garmin offers a signature or IP allowlist after approval, add it in `garmin-webhook`.
- Training API (sending planned sessions to the watch) is the next step and is not built yet.

## Before approval: your own runs with a Personal API key

Garmin's Personal API gives each person access to their own data with a self-made key. Garmin says it is
not intended for commercial applications serving multiple end users, so Ritmo does not call it. Instead,
`scripts/garmin-personal-sync.mjs` runs on your own computer and downloads your new runs as Garmin's original
files, which you upload in Ritmo like a Garmin export.

1. Garmin Connect Web → Personal API Key → Create Key (choose 30 days to 1 year). Copy it; it is shown once.
2. `GARMIN_PERSONAL_API_KEY=your-key node scripts/garmin-personal-sync.mjs` (add `--since 2026-10-01` for
   older runs; files go to `garmin-downloads/`).
3. Ritmo → Data sources → Upload files → choose the new `.zip` files. Duplicates are merged automatically.

Keep the key private and never put it in the app, the repo or a chat. Delete it on Garmin Connect Web when
direct sync is approved.
