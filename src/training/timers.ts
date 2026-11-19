// Timers for a strength workout (update 5, U7). Everything is kept as moments in time (when the rest ends), not as
// a count that ticks down, so a timer is still right after the screen was locked or the app was in the background.

/** The rest to take after a set: the exercise's own setting, else the workout's, else the runner's usual rest.
 *  After an exercise's last set it is the rest before the next exercise. */
export function restAfter(o: { lastOfExercise: boolean; item: { restS?: number; restAfterS?: number }; workout: { restBetweenSetsS?: number; restBetweenExercisesS?: number }; usual: number }): number {
  const between = o.item.restS ?? o.workout.restBetweenSetsS ?? o.usual;
  return o.lastOfExercise ? o.item.restAfterS ?? o.workout.restBetweenExercisesS ?? between : between;
}
/** Seconds left until a moment (never negative), and whether it has passed */
export const secondsLeft = (endsAt: number, now: number) => Math.max(0, Math.ceil((endsAt - now) / 1000));
/** "0:38" */
export const clockOf = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

let ctx: AudioContext | undefined;
/** A short tone (the 3-2-1 before a timed set ends, and the end of a rest). Silent where sound is not available. */
export function tone(freq = 880, ms = 140): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; g.gain.value = 0.18;
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + ms / 1000);
  } catch { /* no sound: the screen still shows it */ }
}
/** The end of a rest or a timed set: a buzz, a tone, and a notification when the app is not on screen */
export function timerDone(text: string): void {
  try { navigator.vibrate?.([200, 100, 200]); } catch { /* */ }
  tone(660, 350);
  try { if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') new Notification('Ritmo', { body: text, tag: 'ritmo-timer' }); } catch { /* */ }
}
