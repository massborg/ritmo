#!/bin/bash
# Recorded voice clips for runs where the phone blocks speech (update 3, §2). Needs espeak-ng with the mbrola-en1
# voice, and ffmpeg. Output: public/audio/cues/*.mp3 (mono, 32 kbps). Run again after changing the word list,
# which must match CLIP_WORDS in src/run/cues.ts.
set -e
OUT="$(dirname "$0")/../public/audio/cues"; mkdir -p "$OUT"
TMP=$(mktemp -d)
say() { espeak-ng -v mb-en1 -s 150 -w "$TMP/$1.wav" "$2"; ffmpeg -loglevel error -y -i "$TMP/$1.wav" -af "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,apad=pad_dur=0.12" -ac 1 -ar 22050 -b:a 32k "$OUT/$1.mp3"; }
for n in $(seq 1 59); do say "$n" "$n"; done
say kilometre "kilometre"; say kilometres "kilometres"; say mile "mile"; say miles "miles"
say average-pace "average pace"; say minutes "minutes"; say seconds "seconds"; say go "go"
say paused "paused"; say resumed "resumed"; say run-finished "run finished"; say ready "ready when you are"
say lap "lap"; say recovery "recovery"; say easy "easy"; say too-fast "too fast"; say too-slow "too slow"
say goal-reached "goal reached"; say next "next"; say great-work "great work"; say voice-check "voice cues are working"
ffmpeg -loglevel error -y -f lavfi -i anullsrc=r=22050:cl=mono -t 0.25 -b:a 32k "$OUT/silence.mp3"
rm -rf "$TMP"
echo "$(ls "$OUT" | wc -l) clips in $OUT"
