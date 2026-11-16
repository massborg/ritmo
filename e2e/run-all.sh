#!/bin/bash
# Runs every e2e suite against the built app on :4173, each on the same fixed day (see fixed-date.cjs), and writes
# one line per suite to the file given as $1 (default: e2e/out/results.txt).
#   npm run build && bash e2e/run-all.sh
# E2E_DATE=real runs on today's real date; E2E_DATE=2026-11-15T10:00:00 tries another day.
cd "$(dirname "$0")/.."
OUT=${1:-e2e/out/results.txt}
mkdir -p "$(dirname "$OUT")"; : > "$OUT"
for f in e2e/*.cjs; do
  n=$(basename "$f" .cjs)
  case $n in mock-supabase|serve-with-headers|fixed-date|make-garmin-export) continue;; esac
  curl -s -o /dev/null http://localhost:4173/ || (nohup node e2e/serve-with-headers.cjs 4173 >/dev/null 2>&1 &); sleep 0.5
  r=$(timeout 900 node -r ./e2e/fixed-date.cjs "$f" 2>&1)
  line=$(echo "$r" | grep -E "[0-9]+ passed, [0-9]+ failed" | tail -1)
  fails=$(echo "$r" | grep -E "^FAIL" | head -5 | tr '\n' ';')
  [ -z "$line" ] && line="NO SUMMARY: $(echo "$r" | tail -3 | tr '\n' ' ' | cut -c1-200)"
  echo "$n | $line | $fails" >> "$OUT"
done
echo DONE >> "$OUT"
