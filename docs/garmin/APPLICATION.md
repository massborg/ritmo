# Garmin Connect Developer Program: application pack for Ritmo Running

Prepared 5 November 2026. Fill in the items marked **[YOU]**, check the live form, then submit.

## 1. Where things stand

- **Programme status.** Garmin reopened the Connect Developer Program to new business applicants on 21 October 2026, after pausing new applications in March. Verify on the form before relying on this.
- **Access levels.** Garmin now has three levels:
  - **Personal.** Individuals can create a key for their own data only. This is not suitable for Ritmo.
  - **Starter (business).** Reported to be free. It includes the Activity, Health, Women's Health, Training and Courses APIs, push-only delivery, up to about 1,000 connected users, and **no historical data**.
  - **Enterprise (business).** Requested later from inside the Garmin Developer Portal. It adds historical data and backfill, ping/pull delivery and unlimited users, with pricing agreed case by case. Reports say per-user fees for apps at scale start from 1 April 2027.
- **Where to apply:** the access request form at https://www.garmin.com/en-US/forms/GarminConnectDeveloperAccess/ (Garmin Developer Portal: https://developerportal.garmin.com/developer-programs/connect-developer-api).
- **If the form is unavailable or you get no reply:** use the Garmin developer "Contact us" form with the email in section 6. Forum users report replies within hours to a few days.
- **Get fees, user limits and AI terms in writing before launch.** Reports disagree on pricing, and Garmin has edited its FAQ.

**Recommendation.** Apply for **Starter** now. It covers automatic sync of every new run for the first ~1,000 users. Past years keep coming from the Garmin export upload that Ritmo already supports. Ask for Enterprise later if you need history or more users.

## 2. Before you submit (checklist)

| Item | Status | Notes |
|---|---|---|
| Legal entity name | **[YOU]** | Garmin reviews companies, not individuals. Use the company that will own Ritmo, for example TriCore Consult Ltd if that is the one. |
| Company registration number and country | **[YOU]** | Malta Business Registry number. |
| Registered address | **[YOU]** | |
| VAT number | **[YOU]** | If registered. |
| Contact name and role | **[YOU]** | The person Garmin will email. |
| Business email address | **[YOU]** | Use a company address if possible. Personal webmail is more likely to be questioned. Also set it in `src/lib/contact.ts` so it shows on the public pages. |
| Product website | Ready | https://ritmo-running.netlify.app/about (public, no login) |
| Privacy policy URL | Ready | https://ritmo-running.netlify.app/privacy (public). Lists data use, processors, deletion and Garmin-specific commitments. |
| Terms of service URL | Ready, draft | https://ritmo-running.netlify.app/terms. **Have a lawyer review before launch.** |
| OAuth redirect URL | Ready to register | `https://ritmo-running.netlify.app/garmin/callback` |
| Data delivery (push) endpoint | Built after approval | `https://gujuzacfqxbwfpprkgrx.supabase.co/functions/v1/garmin-webhook` |
| Screenshots | Ready | Use the Today, session feedback, Calendar and Progress screenshots, with sample data clearly labelled. |
| Demo account for reviewers | Optional | Create a test account with sample data if Garmin asks to try the app. |

## 3. Draft answers for the form

Copy these, adjust, and keep them truthful. Garmin reviews what you say against your website.

**Product / application name**
Ritmo Running

**Short description**
Ritmo Running is a running coach app for web, iPhone and Android. It analyses each run (pace, heart rate, cadence, splits, elevation), tracks training load and fitness, and builds adaptive training plans with plain-English explanations of what to do next and why. It is for runners at every level, from a first 5K to a marathon best.

**How Ritmo will use Garmin data**
When a runner connects their Garmin account, Ritmo receives each new running activity: summary, laps, samples and the activity file. It uses that data only to give that runner:
- feedback on the session (type, score, splits, heart rate zones, pacing patterns),
- an updated fitness and training load estimate,
- adjustments to their own training plan.

Data is shown only to the runner who owns it. It is not sold, shared with other users or third parties, or used for advertising. **Garmin data is never used to train AI models.**

**APIs requested**
- **Activity API (required).** Activity summaries, activity details (samples, laps) and activity files (FIT), to analyse each run.
- **Health API (optional, phase 2).** Daily resting heart rate and sleep summaries, to improve the readiness status. Ask only if you want this now. Requesting fewer APIs keeps the review simpler.
- **Training API (optional, phase 2).** To send planned sessions from the runner's Ritmo plan to their Garmin watch. A strong feature for runners; worth requesting.
- Not needed: Women's Health, Courses, Golf.

**Data delivery**
Push notifications to our HTTPS endpoint. We acknowledge each delivery immediately and process it in the background. We handle user deregistration and permission changes by stopping processing and deleting the stored Garmin tokens.

**Users and growth**
**[YOU: estimate]** Suggested wording: "Private beta of under 100 runners from launch, growing to 500 to 1,000 in the first 12 months."

**Business model**
**[YOU: decide]** For example: "Free during beta. Later a free tier plus an optional subscription for advanced coaching. No advertising and no sale of data."

**Third-party AI or analytics services that process Garmin data**
Yes, one, and only at the runner's request. Ritmo's in-app coach can use Anthropic's Claude API to phrase answers to a runner's own questions about their training. When the runner asks a question, Ritmo sends a short text summary of that runner's relevant metrics (for example weekly distance, recent session results, plan for today). Anthropic does not use API inputs to train its models. Garmin data is not used to train any AI model, by us or by Anthropic. The runner sees which data an answer used. No analytics or advertising services receive Garmin data.

**Where data is stored and how it is protected**
Supabase (PostgreSQL) in the EU (Frankfurt). Data is encrypted in transit and at rest. Row-level security restricts every table to the account that owns it, and this is tested. Runners can export or permanently delete all their data and their account from inside the app. Disconnecting Garmin stops new data and removes the stored Garmin tokens.

**Integration on behalf of a client, or subcontractors?**
No. Ritmo is our own product. **[YOU: adjust if a developer or agency works on it for you.]**

**Attribution**
Activities from Garmin devices will show the Garmin device model as required by the Garmin API Brand Guidelines. We will follow the brand guidelines for any "Connect Garmin" button.

## 4. Technical plan once approved (for our side)

1. **OAuth 2.0 (PKCE).** A "Connect Garmin" button in Profile, then Data sources, with a callback at `/garmin/callback`. Tokens are stored server-side in Supabase, never in the browser.
2. **Webhook.** A Supabase function `garmin-webhook` receives activity notifications. It fetches activity details and files, maps them into Ritmo's existing integration layer and saves them under the runner's account. Duplicates with uploaded files are merged automatically, keeping the most detailed version.
3. **Deregistration and permission changes.** These remove tokens and stop sync. "Disconnect" in the app also deregisters with Garmin.
4. **Sync status.** Last sync time and errors appear in Data sources, as the brief requires.
5. **Brand.** The device model is shown on each Garmin activity, and an official "Connect with Garmin" button is used.
6. **No AI training.** Garmin data is marked by source and excluded from any future model work.

## 5. Decisions needed from you

1. **Which legal entity applies.** This must match the company that will publish the app in the stores.
2. **Contact email** for Garmin and for the public pages.
3. **Business model** and a 12-month user estimate.
4. **APIs.** Activity only, or Activity plus Training (send workouts to the watch) plus Health.
5. **AI coach and Garmin data.** Keep it as described (recommended, fully disclosed), or exclude Garmin-sourced numbers from coach answers until Garmin confirms its AI terms in writing.

## 6. Email template (if the form is unavailable or you need to follow up)

> **Subject:** Connect Developer Program access request: Ritmo Running (Starter)
>
> Hello Garmin Connect Partner Services,
>
> We would like to apply for Starter access to the Garmin Connect Developer Program for Ritmo Running, a running coach app for web, iPhone and Android, developed by **[company name]** in Malta (registration **[number]**).
>
> Ritmo analyses each run and adapts the runner's training plan with clear explanations. With the runner's permission, we would use the Activity API (summaries, details and FIT files) to analyse each new run automatically. We may also later request the Training API, to send planned sessions to the runner's watch.
>
> Garmin data is used only to show each runner their own analysis. It is not sold or shared, and it is never used to train AI models. Our in-app coach can use Anthropic's Claude API to phrase answers to the runner's own questions, using a short summary of that runner's metrics. Anthropic does not train on this data, and we disclose this in our privacy policy.
>
> Data is stored in the EU (Supabase, Frankfurt) with per-user access controls, and runners can export or delete everything at any time.
>
> - Website: https://ritmo-running.netlify.app/about
> - Privacy policy: https://ritmo-running.netlify.app/privacy
> - Terms: https://ritmo-running.netlify.app/terms
> - Expected users: **[estimate]** in the first 12 months
>
> We would be grateful for access, and for confirmation of the current Starter terms, user limits and fees, and any AI-related requirements.
>
> Kind regards,
> **[Name]**, **[Role]**
> **[Company]** · **[Email]** · **[Phone]**

## Sources

- [Garmin Connect Developer (developer portal)](https://developerportal.garmin.com/developer-programs/connect-developer-api)
- [Garmin Connect Developer Program Reopens: What Changes (Momentum)](https://www.themomentum.ai/blog/garmin-connect-developer-program-reopens)
- [Garmin API Access in 2026: New Tiers, Fees and Terms (Sahha)](https://sahha.ai/blog/garmin-connect-api-reopened-fees/)
- [Garmin Revamps Its Connect Developer API With Personal, Starter, and Enterprise Access (Garmin Rumors)](https://garminrumors.com/garmin-connect-developer-program-personal-starter-enterprise/)
- [Garmin reopened its developer program. Check whose key you're on (Open Wearables)](https://mailwal.com/n/open-wearables-newsletter/2331-garmin-reopened-its-developer-program-check-whos)
- [Garmin API (2026): Approval First, Five APIs, OAuth 2.0 (AIFitnessAPI)](https://aifitnessapi.com/integrate/garmin-api)
- [Garmin forum: Connect Developer Program access form unavailable](https://forums.garmin.com/developer/connect-iq/f/discussion/436226/connect-developer-program-access-form-unavailable-anyone-got-through-recently)
- [Garmin access request form](https://www.garmin.com/zh-HK/forms/GarminConnectDeveloperAccess)

Note: these details come mostly from news and developer reports. Garmin's own developer pages could not be opened from this environment, so confirm the current form, tiers and agreement on the Garmin site before you submit.
