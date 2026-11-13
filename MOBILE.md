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
- **Android:** Health Connect, min SDK 26. The manifest declares only `READ_EXERCISE`, `READ_DISTANCE`, `READ_HEART_RATE` and `READ_HEALTH_DATA_HISTORY`. All other permissions the plugin declares are removed, because Play requires each one to be justified. The privacy policy link is set in `res/values/strings.xml` and points to https://app.ritmorunning.run/privacy.
- Runs from phones carry summaries, laps and heart rate, but no GPS splits. The analysis flags this as limited data.
- Duplicate runs (the same run from Garmin, a file and a phone) are merged, and the most detailed version is kept.
- The app syncs when it opens and each time it returns to the foreground. The first sync reads up to 10 years of history.

## Recording runs: GPS and voice with the phone locked

The app records runs natively, so locking the phone is fine (in a browser, Pocket mode is needed instead).

- **GPS:** `@capacitor-community/background-geolocation`, wrapped in `src/run/native-gps.ts`.
  - Before a run, the Run tab watches location in the foreground only.
  - During a run (countdown to finish) the watch switches to background mode. On iPhone a blue pill shows in the status bar. On Android a "Recording your run" notification shows (a foreground service of type `location`).
  - iOS: `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription` and `UIBackgroundModes` `location` are in `Info.plist`.
  - Android: the plugin adds the location, `FOREGROUND_SERVICE_LOCATION` and `POST_NOTIFICATIONS` permissions. `android.useLegacyBridge` is on in `capacitor.config.ts`, so updates keep arriving after 5 minutes locked.
- **Voice:** `@capacitor-community/text-to-speech`, wrapped in `src/run/native-voice.ts`.
  - Cues are spoken by the phone's own engine (AVSpeechSynthesizer, Android text-to-speech).
  - iPhone: the plugin as published ignores the audio category and uses its own audio session, which the silent switch mutes. `patches/@capacitor-community+text-to-speech+8.0.2.patch` (applied by `patch-package` on `npm install`) makes it use the app's session in the `playback` category with mode `voicePrompt`. Cues then play with the silent switch on and the screen locked, music is lowered while a cue plays, and the session is released afterwards so music returns to full volume.
  - Android: text-to-speech plays on the media stream, which silent and vibrate modes don't mute.
  - Android's in-app browser has no Web Speech at all, so without this the Android app could only play recorded clips.
  - `UIBackgroundModes` `audio` is in `Info.plist`. Run settings lists the native voices.

### Store review notes

- **App Store:** background location and audio must be justified in review notes: "Ritmo records the distance, pace and route of a run, and speaks pace cues, while the phone is locked in a pocket or armband. Tracking runs only between Start and Finish."
- **Google Play:** complete the foreground service declaration (type `location`, "user-initiated run recording") with a short video of starting a run and the notification. No `ACCESS_BACKGROUND_LOCATION` is requested.

### Test on a real phone before release

1. Start a 5 km run, lock the phone for 10 minutes, and check the distance keeps adding up with no "GPS paused" gap.
2. Check a cue is spoken every km with the phone locked, with the silent switch on (iPhone), and with music playing (the music should dip, not stop).

## Run it locally

You need a Mac with Xcode 16+ for iOS, and Android Studio for Android.

```bash
npm install
npm run ios       # builds the web app, syncs, opens Xcode
npm run android   # builds the web app, syncs, opens Android Studio
```

After any change in `src/`, run `npm run cap:sync`.

## Test builds (TestFlight and Play internal testing)

Builds are made in GitHub Actions: **Actions → Mobile test release → Run workflow**. Choose the version (for example 1.0) and which apps to build. Each run gets a new build number (the run number), so uploads never clash. The workflow is `.github/workflows/mobile-release.yml`.

### One-time setup: iPhone

1. In App Store Connect, create the app "Ritmo Running" with bundle id `com.ritmorunning.app`. Register the id with the HealthKit and Background Modes capabilities.
2. In App Store Connect, open Users and Access, then Integrations, then App Store Connect API. Create a key with the **Admin** role. Admin is needed so the build can create its signing certificate and profile by itself.
3. Add these repository secrets (GitHub → Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `ASC_KEY_P8_BASE64` | The downloaded `AuthKey_XXXX.p8`, base64-encoded: `base64 -i AuthKey_XXXX.p8` |
| `ASC_KEY_ID` | The key's ID |
| `ASC_ISSUER_ID` | The Issuer ID shown above the keys list |
| `APPLE_TEAM_ID` | The 10-character Team ID (Membership details) |

4. After the first upload, open TestFlight in App Store Connect. Answer the export-compliance question (Ritmo uses only standard HTTPS encryption), then add testers. Internal testers need no review. External testers need a short beta review the first time.

### One-time setup: Android

1. Create the upload key once and keep it safe, with its passwords, outside the repository:
   `keytool -genkeypair -v -keystore ritmo-upload.jks -alias ritmo -keyalg RSA -keysize 2048 -validity 10000`
2. Add these repository secrets:

| Secret | Value |
|---|---|
| `ANDROID_UPLOAD_KEYSTORE_BASE64` | `base64 -i ritmo-upload.jks` |
| `ANDROID_UPLOAD_STORE_PASSWORD` | The keystore password |
| `ANDROID_UPLOAD_KEY_ALIAS` | `ritmo` |
| `ANDROID_UPLOAD_KEY_PASSWORD` | The key password |
| `PLAY_SERVICE_ACCOUNT_JSON` | Optional at first (see step 4): the JSON key of a Google Cloud service account invited in Play Console (Users and permissions) with release rights for this app |

3. Run the workflow for Android. With the key secrets alone, it attaches a signed `.aab` to the run.
4. **The first upload must be made by hand.** Play's API can't create an app's first release. In Play Console, create the app, open Testing, then Internal testing, then Create release. Upload the `.aab` from step 3 (opt in to Play App Signing when asked) and add testers. From then on, with `PLAY_SERVICE_ACCOUNT_JSON` set, each run uploads to internal testing by itself. Use the `draft` status option if Play says the app isn't ready for completed releases yet.

## Accounts needed before private testing

1. **Apple Developer Program** (USD 99/year), under the company name.
   - Register the bundle id `com.ritmorunning.app` with the HealthKit capability.
   - Create the app in App Store Connect as "Ritmo Running".
   - Then use the Mobile test release workflow (above) to upload to TestFlight, or in Xcode: Product, Archive.
2. **Google Play Console** (USD 25 one-off).
   - Create the app "Ritmo Running" and complete the Health Connect declaration form for the four read permissions.
   - Upload a signed AAB to Internal testing.
   - Create the release keystore once and store it safely. Losing it means you can never update the app.

## Before store release

- **Sign-in links:** emailed sign-in links currently open the website. Ritmo runs on https://app.ritmorunning.run. To open links in the app, serve `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` from that address and register it for Universal Links and App Links.
- **Privacy:** both stores require a privacy policy URL and data-safety forms. Use the in-app Privacy page as the basis.
- **Screenshots:** both stores need screenshots at their required sizes.
