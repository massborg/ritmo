# Voice cues: why they failed for a tester, and the fix

Ryan reported voice problems. I couldn't reproduce them on his phone, so I went through the voice code for every way a real phone can stop cues. I found eight weaknesses. Each one is fixed, and each has a test that simulates that phone.

## What was wrong, and the fix

| # | What could go wrong | Effect for the runner | Fix |
|---|---|---|---|
| 1 | **A slow phone was judged "blocked".** A cue had 2 s to start. On iPhone, waiting for the voice list can take up to 1.5 s, so a slow start went over the limit. | Ritmo switched to its robotic recorded clips for the **whole run**, though speech worked. | The cue now has 2.5 s, then a retry. If speech starts late anyway, Ritmo goes back to speech and stops the clips. |
| 2 | **A block lasted for ever.** After one failure, every cue played clips. **Test voice** also only played the clip and never checked speech again. | No way to recover, even after turning the silent switch off. | Test voice checks speech again. Every new run starts a fresh check. |
| 3 | **Speech left paused.** iPhone can leave speech paused after the page was in the background, for example after a notification or switching apps. | Cues queued up silently. Ritmo still thought voice worked, because the phone said it was "speaking", so no clips played either. | `resume()` before every cue and when the page comes back into view. Speech that is stuck "speaking" for 8 s with nothing said is cleared, and the cue is said again. |
| 4 | **The chosen voice failed.** An Enhanced or Premium voice that isn't downloaded, or a voice that needs signal. | Voice was marked blocked, and clips played. | Ritmo retries with the phone's default voice and keeps using it for the run. This is noted in Run settings. |
| 5 | **Quick run had no unlock.** Quick run starts by itself once GPS is ready, without a tap on the Run screen. The recorded clips were never unlocked, and a block from an earlier run carried over. | On iPhone, cues on a Quick run could be silent and the clips couldn't play either. | The Quick run tap (and Start session, Start now and Test voice) unlocks speech and the clips. The first tap anywhere on the Run screen does too. |
| 6 | **Lost events in Chrome.** Chrome can garbage-collect an utterance mid-sentence and drop its "started" event. | A working cue could look like a failure. | Utterances are kept until they finish. |
| 7 | **No speech in the Android app.** Android's in-app browser has no Web Speech at all. | The Android app could only play clips. | The app now speaks with the phone's own engine (below). |
| 8 | **Locked phone.** A browser stops speech and GPS when the screen locks. | Silence and lost distance. | The web app keeps Pocket mode. The store app now tracks and speaks with the phone locked (below). |

## Store app (iPhone and Android)

- **Voice:** spoken by the phone's own engine through a native plugin. It plays with the screen locked and with the iPhone silent switch on, and lowers music while it speaks. No tap is needed first, so a cue can't be blocked.
- **GPS:** native background location during a run: iPhone background location mode and an Android foreground service. Locking the phone is fine. Pocket mode is off by default in the app, but still there if you want it.
- **Setup and store notes** are in `MOBILE.md`.
- **CI builds** the Android APK and the iOS simulator app on every push. A real-phone test is still needed: a 5 km run with the phone locked for 10 minutes, on iPhone and Android.

## For support

Run settings now shows **Voice problems on this device**: the last five things that went wrong, such as "chosen voice failed, default voice used" or "blocked: nothing spoken within 2.5 s". If a tester has trouble again, ask them to open Run settings and send a screenshot of that list.

## Tests

- **Unit tests** (`src/run/cues-engine.test.ts`): eight cases on a simulated phone.
  - speech that works
  - an empty voice list
  - a chosen voice that fails
  - speech that never starts
  - countdown cues during the check
  - a late start
  - speech stuck "speaking"
  - Test voice after a block
- **End-to-end suite** (`e2e/voice-fix.cjs`): 20 checks.
  - Quick run
  - paused speech
  - a failing voice, with the log in Run settings
  - a late start
  - no speech at all
  - blocked, then fixed with Test voice
- The existing `voice`, `u3-stage2`, `run` and `run-screen` suites were updated for the silent unlock word and the 2.5 s check, and all pass.
