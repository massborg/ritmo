#!/usr/bin/env node
// Download your own new Garmin runs with your Garmin Connect Personal API key, ready to upload to Ritmo.
//
// Personal use only: Garmin's Personal API is for a person's own data, not for apps serving other users,
// so this runs on your own computer with your own key, and Ritmo never sees the key. You then upload the
// downloaded files in Ritmo (Data sources -> Upload files), exactly like a Garmin export.
//
// Usage (Node 18 or newer, no install needed):
//   GARMIN_PERSONAL_API_KEY=your-key node scripts/garmin-personal-sync.mjs [--since 2026-11-01] [--out folder]
//
// Each run is saved as <activityId>.zip (Garmin's original FIT file). A small state file in the output folder
// remembers what was downloaded, so the next run only fetches new runs.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const API = 'https://personal.connectapi.garmin.com';
const TOKEN_URL = `${API}/personalapitoken-service/personal-api/personal-api-key/token`;

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const key = process.env.GARMIN_PERSONAL_API_KEY;
const out = opt('out', 'garmin-downloads');
const stateFile = join(out, '.ritmo-garmin-sync.json');

if (!key) {
  console.error('Set GARMIN_PERSONAL_API_KEY to your Garmin Connect Personal API key (Garmin Connect Web -> Personal API Key).');
  process.exit(1);
}

async function token() {
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { Authorization: `ApiKey ${key}` } });
  if (!r.ok) throw new Error(`Could not get an access token (${r.status}). Check the key has not expired or been deleted.`);
  const text = await r.text();
  try {
    const j = JSON.parse(text);
    return j.access_token ?? j.accessToken ?? j.token;
  } catch {
    return text.trim(); // some token endpoints return the token as plain text
  }
}

async function main() {
  await mkdir(out, { recursive: true });
  let state = { downloaded: [], lastDate: undefined };
  try { state = JSON.parse(await readFile(stateFile, 'utf8')); } catch { /* first run */ }
  const done = new Set(state.downloaded);
  const since = opt('since', state.lastDate ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));

  const t = await token();
  if (!t) throw new Error('Garmin did not return an access token.');
  const auth = { headers: { Authorization: `Bearer ${t}`, Accept: 'application/json' } };

  // Running activities since the date, newest first, 99 at a time
  const runs = [];
  for (let start = 0; ; start += 99) {
    const q = new URLSearchParams({ start: String(start), limit: '99', activityType: 'running', startDate: since, excludeChildren: 'true' });
    const r = await fetch(`${API}/activitylist-service/activities/search/activities?${q}`, auth);
    if (!r.ok) throw new Error(`Could not list activities (${r.status}).`);
    const page = await r.json();
    const list = Array.isArray(page) ? page : (page.activityList ?? page.activities ?? []);
    runs.push(...list);
    if (list.length < 99) break;
  }
  const todo = runs.filter((a) => a.activityId != null && !done.has(String(a.activityId)));
  console.log(`Found ${runs.length} run(s) since ${since}; ${todo.length} new.`);

  for (const a of todo) {
    const id = String(a.activityId);
    const r = await fetch(`${API}/download-service/files/activity/${id}`, { headers: { Authorization: `Bearer ${t}` } });
    if (!r.ok) { console.warn(`  Skipped ${id} (${r.status})`); continue; }
    await writeFile(join(out, `${id}.zip`), Buffer.from(await r.arrayBuffer()));
    done.add(id);
    console.log(`  Saved ${id}.zip  ${a.startTimeLocal ?? ''}  ${a.activityName ?? ''}`);
  }

  state = { downloaded: [...done], lastDate: new Date().toISOString().slice(0, 10) };
  await writeFile(stateFile, JSON.stringify(state, null, 2));
  console.log(todo.length ? `Done. Upload the new .zip files in "${out}" to Ritmo: Data sources -> Upload files.` : 'Nothing new to upload.');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
