# Ritmo phone apps (Stage 3)

The iPhone and Android apps share this codebase. [Capacitor](https://capacitorjs.com) wraps the web app in native shells (`ios/`, `android/`) and adds native plugins.

| Piece | Where |
|---|---|
| Shared app (React) | `src/` |
| Capacitor config (app id, name, splash) | `capacitor.config.ts` |
| Apple Health / Health Connect adapter | `src/data/health.ts` |
| Permission screen | `src/pages/HealthConnect.tsx` (route `/profile/health`) |
| Native helpers (status bar, haptics, back button) | `src/native.ts` |
| iOS project (Swift Package Manager, no CocoaPods) | `ios/App/App.xcodeproj` |
| Android project | `android/` |
| CI builds (Android APK, iOS simulator) | `.github/workflows/mobile.yml` |

- **App id:** `com.ritmorunning.app`. This cannot change once the app is published. It only has to be unique; no matching domain is needed.
- **Icon label:** "Ritmo". **Store name:** "Ritmo Running".
- **Opening:** the native launch screen is plain brand orange, then the animated "Run in" splash plays.

## Health data

- **iOS:** HealthKit capability (`ios/App/App/App.entitlements`) and permission text in `Info.plist`. Ritmo reads workouts and heart rate, and never writes.
- **Android:** Health Connect, min SDK 26. The manifest declares only `READ_EXERCISE`, `READ_DISTANCE`, `READ_HEART_RATE` and `READ_HEALTH_DATA_HISTORY`. All other permissions the plugin declares are removed, because Play requires each one to be justified. The privacy policy link is set in `res/values/strings.xml` and points to https://ritmorunning.run/privacy.
- Runs from phones carry summaries, laps and heart rate, but no GPS splits. The analysis flags this as limited data.
- Duplicate runs (the same run from Garmin, a file and a phone) are merged, and the most detailed version is kept.
- The app syncs when it opens and each time it returns to the foreground. The first sync reads up to 10 years of history.

## Run it locally

You need a Mac with Xcode 16+ for iOS, and Android Studio for Android.

```bash
npm install
npm run ios       # builds the web app, syncs, opens Xcode
npm run android   # builds the web app, syncs, opens Android Studio
```

After any change in `src/`, run `npm run cap:sync`.

## Accounts needed before private testing

1. **Apple Developer Program** (USD 99/year), under the company name.
   - Register the bundle id `com.ritmorunning.app` with the HealthKit capability.
   - Create the app in App Store Connect as "Ritmo Running".
   - In Xcode: Signing & Capabilities, choose the team, then Product, Archive, then upload to TestFlight.
2. **Google Play Console** (USD 25 one-off).
   - Create the app "Ritmo Running" and complete the Health Connect declaration form for the four read permissions.
   - Upload a signed AAB to Internal testing.
   - Create the release keystore once and store it safely. Losing it means you can never update the app.

## Before store release

- **Sign-in links:** emailed sign-in links currently open the website. Ritmo's address is https://ritmorunning.run. To open links in the app, serve `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` from that address and register it for Universal Links and App Links.
- **Privacy:** both stores require a privacy policy URL and data-safety forms. Use the in-app Privacy page as the basis.
- **Screenshots:** both stores need screenshots at their required sizes.
