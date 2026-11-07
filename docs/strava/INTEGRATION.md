# Strava sync: setup

Strava sync is built and switched on per account with the `strava` feature flag. Nothing changes for other runners.

## How it works

- **Connect (Data sources):** "Connect with Strava" opens Strava's consent page (scope `read,activity:read_all`). Strava sends the runner back to `/strava/callback`, and the `strava-auth` function swaps the code for tokens. Tokens are server-only, in `strava_connections`.
- **First import:** the runs from the last 30 days are fetched in the background and land in `strava_inbox`. The app turns them into Ritmo runs and merges them with the usual rules, so a run already uploaded from a file is not duplicated.
- **New runs:** Strava calls the `strava-webhook` function for each new, edited or deleted activity. The webhook answers at once and fetches the run and its streams afterwards. The app picks runs up when it opens and whenever it comes back to the foreground.
- **Deleted on Strava:** the run is removed from Ritmo too.
- **Disconnect:** revokes Ritmo's access at Strava (`/oauth/deauthorize`) and removes the tokens. Deleting the Ritmo account does the same.

## Strava's API agreement: what the app enforces

- **No sharing:** runs whose data came from Strava (`source === 'strava'`) cannot be posted to the Hub or shared as images. The run page explains why.
- **No AI:** nothing derived from Strava runs is sent to the AI coach or Body chat. When the AI is used, the training model is computed again without Strava runs and the AI is told only that. The built-in (non-AI) coach still uses every run.
- **Attribution:** each Strava run says "from Strava" with a **View on Strava** link, and Data sources shows "Powered by Strava".
- **Check before launch:** read Strava's current API Agreement and Brand Guidelines (developers.strava.com). Replace the orange text button and "Powered by Strava" text with Strava's official image assets.

## Setup steps

1. **Create the Strava API application** at strava.com/settings/api:
   - Website: `https://ritmorunning.run`
   - Authorization Callback Domain: `app.ritmorunning.run`

   Note the Client ID and Client Secret.
2. **Add the Supabase secrets** (Edge Functions, then Secrets):
   - `STRAVA_CLIENT_ID`
   - `STRAVA_CLIENT_SECRET`
   - `STRAVA_VERIFY_TOKEN`: any long random string
3. **Apply the migration** `supabase/migrations/20261108000000_strava_connect.sql`.
4. **Deploy the functions:**
   - `strava-auth`, with JWT verification on
   - `strava-webhook`, with JWT verification off (Strava cannot send a Supabase token)
   - `delete-account` again, so it also revokes Strava access
5. **Create the webhook subscription**, once per Strava app, from any computer:

   ```bash
   curl -X POST https://www.strava.com/api/v3/push_subscriptions \
     -F client_id=YOUR_CLIENT_ID -F client_secret=YOUR_CLIENT_SECRET \
     -F callback_url=https://gujuzacfqxbwfpprkgrx.supabase.co/functions/v1/strava-webhook \
     -F verify_token=YOUR_VERIFY_TOKEN
   ```

   Strava checks the callback straight away. A response with an `id` means it worked.
6. **Turn it on for an account:**

   ```sql
   insert into public.feature_flags (user_id, flag) values ('<user id>', 'strava');
   ```

## Limits

- **New Strava apps allow only one connected athlete** (the developer) until Strava reviews the app. Request more athletes from the app's settings page before opening it to everyone.
- **Default rate limits** are 100 requests every 15 minutes and 1,000 a day. Each run costs two requests (the activity and its streams). A first 30-day import of a daily runner costs about 60.
