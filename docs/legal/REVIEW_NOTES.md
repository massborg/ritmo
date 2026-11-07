# Legal review notes (Phase 1)

Draft wording in the app was written by the product team, not a lawyer. These points need review by a
qualified lawyer (EU/Malta, GDPR) before public launch. Nothing here is legal advice.

## For the lawyer

| # | Topic | Where in the app | What we did | Question for review |
|---|-------|------------------|-------------|---------------------|
| 1 | Minimum age 18 | Sign-up checkbox, setup date of birth, Terms | Self-declared 18+ at sign-up, then date of birth in setup. Under 18: blocked, date not saved, offered account deletion | Is self-declaration plus date of birth enough? Should under-18 accounts be deleted automatically? |
| 2 | Health data consent (GDPR Art. 9(2)(a)) | Setup step 1 | Separate, unticked, required checkbox; version and time stored in the profile (`consents.healthData`) | Is the wording explicit enough? Is storing consent in the profile JSON sufficient as a record, or is a separate audit log needed? How should withdrawal work, given the service cannot run without it (currently: delete account)? |
| 3 | AI coach consent | Setup step 1 (optional box), first coach question, Privacy | Optional, off unless ticked; only training facts sent | Does this need a separate lawful basis/DPA with the AI provider? Transfer outside the EU (provider is US-based): SCCs or DPF? |
| 4 | Health check | Setup step 3 | Our own six questions (adapted in spirit from common pre-exercise screening, not copied). Only outcome stored | Is the wording appropriate? Any liability concerns with "acknowledge and continue" after a "yes"? |
| 5 | Profile pictures | Profile, setup | Private bucket, owner-only access, EXIF removed on device, deleted with account | Biometric concerns? (We do no face recognition.) Retention wording |
| 6 | Processors list | Privacy | Supabase (EU), Netlify, Anthropic | DPAs signed with each? Netlify sees IP addresses in logs |
| 7 | Terms | /terms | Liability limited to fees paid in 12 months; "as is" | Enforceability for EU consumers; governing law clause missing; contact details now set (TriCore Consult Ltd, Cyprus) |
| 8 | Garmin | Privacy, Terms | No AI training on Garmin data; not affiliated | Check against the Garmin Connect Developer Program agreement once received |

## Still missing (needs a decision or information from you)

- Done: company (TriCore Consult Ltd, HE 467194), registered office (Agia Fyla, Limassol, Cyprus) and contact email (info@tricoreconsult.eu) are set in `src/lib/contact.ts` and shown on About, Privacy and Terms.
- Governing law: the provider is a Cyprus company serving EU consumers; confirm which law and courts to name.
- Data Protection Officer or privacy contact, if required.
- Governing law and jurisdiction clause.
- Cookie/storage notice: the app uses only essential storage (login session, device cache). Confirm no banner is needed.
