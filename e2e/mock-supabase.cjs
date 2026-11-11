// A small stand-in for Supabase Auth, PostgREST and Edge Functions, used by the browser tests.
// It enforces "each user only sees their own rows", like the real row-level security policies.
const crypto = require('crypto');
const path = require('path');

/** The real run-summary maths (src/training/derive-core.ts), compiled on the fly, for the derive-runs function. */
let core;
function deriveCore() {
  if (!core) {
    const out = require('esbuild').buildSync({ entryPoints: [path.join(__dirname, '../src/training/derive-core.ts')], bundle: true, format: 'cjs', platform: 'node', write: false });
    const m = { exports: {} };
    new Function('module', 'exports', out.outputFiles[0].text)(m, m.exports);
    core = m.exports;
  }
  return core;
}
/** Like Supabase's default: at most 1000 rows per response, whatever the request asks for. */
const MAX_ROWS = 1000;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(user) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now })}.sig`;
}

function createMock() {
  const state = { users: new Map(), tokens: new Map(), tables: {}, emails: [], offline: false, calls: [], files: new Map(), signed: new Map(), rpc: [] };
  const TABLES = ['profiles', 'activities', 'races', 'plans', 'session_feedback', 'sources', 'coach_messages', 'activity_deletions', 'feature_flags', 'hub_profiles', 'posts', 'ritmos', 'comments', 'notifications', 'follows', 'blocks', 'reports', 'strava_inbox', 'clubs', 'club_members', 'group_runs', 'group_run_going'];
  TABLES.forEach((t) => (state.tables[t] = []));
  const keyOf = { profiles: ['user_id'], activities: ['user_id', 'id'], races: ['user_id', 'id'], plans: ['user_id', 'id'], session_feedback: ['user_id', 'activity_id'], sources: ['user_id', 'kind'], coach_messages: ['user_id', 'id'], activity_deletions: ['user_id', 'id'], feature_flags: ['user_id', 'flag'], hub_profiles: ['user_id'], posts: ['id'], ritmos: ['post_id', 'user_id'], comments: ['id'], notifications: ['id'], follows: ['follower_id', 'followee_id'], blocks: ['blocker_id', 'blocked_id'], reports: ['reporter_id', 'created_at'], clubs: ['id'], club_members: ['club_id', 'user_id'], group_runs: ['id'], group_run_going: ['group_run_id', 'user_id'] };
  let clock = 0;
  const stamp = () => { const t = Math.max(Date.now(), clock + 1); clock = t; return new Date(t).toISOString(); };


  const publicUser = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.confirmed ? new Date().toISOString() : null, user_metadata: u.meta, app_metadata: { provider: 'email' }, identities: [{ id: u.id, provider: 'email' }], created_at: u.created });
  const session = (u) => {
    const access = jwt(u); const refresh = crypto.randomUUID();
    state.tokens.set(access, u.id); state.tokens.set(`r:${refresh}`, u.id);
    return { access_token: access, refresh_token: refresh, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: publicUser(u) };
  };
  const userFromReq = (req) => {
    const h = req.headers()['authorization'] || '';
    const id = state.tokens.get(h.replace(/^Bearer /, ''));
    return id ? [...state.users.values()].find((u) => u.id === id) : undefined;
  };
  const err = (status, code, message) => ({ status, body: { code, error_code: code, msg: message, message } });

  function auth(path, method, url, body, req) {
    if (path === '/signup' && method === 'POST') {
      const email = String(body.email).toLowerCase();
      if (state.users.has(email)) {
        const u = state.users.get(email);
        // Supabase returns a user with no identities for an existing confirmed email (to avoid leaking accounts)
        if (u.confirmed) return { status: 200, body: { ...publicUser(u), identities: [] } };
        return err(422, 'user_already_exists', 'User already registered');
      }
      if (!body.password || body.password.length < 6) return err(422, 'weak_password', 'Password should be at least 6 characters.');
      const u = { id: crypto.randomUUID(), email, password: body.password, confirmed: false, meta: body.data || {}, created: new Date().toISOString() };
      state.users.set(email, u);
      state.emails.push({ to: email, type: 'signup', redirect: url.searchParams.get('redirect_to') });
      return { status: 200, body: publicUser(u) };
    }
    if (path === '/token' && method === 'POST') {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') {
        const u = state.users.get(String(body.email).toLowerCase());
        if (!u || u.password !== body.password) return err(400, 'invalid_credentials', 'Invalid login credentials');
        if (!u.confirmed) return err(400, 'email_not_confirmed', 'Email not confirmed');
        return { status: 200, body: session(u) };
      }
      if (grant === 'refresh_token') {
        const id = state.tokens.get(`r:${body.refresh_token}`);
        const u = [...state.users.values()].find((x) => x.id === id);
        return u ? { status: 200, body: session(u) } : err(400, 'refresh_token_not_found', 'Invalid Refresh Token');
      }
    }
    if (path === '/user' && method === 'GET') {
      const u = userFromReq(req);
      return u ? { status: 200, body: publicUser(u) } : err(401, 'bad_jwt', 'invalid JWT');
    }
    if (path === '/user' && method === 'PUT') {
      const u = userFromReq(req);
      if (!u) return err(401, 'bad_jwt', 'invalid JWT');
      if (body.password) { if (body.password.length < 6) return err(422, 'weak_password', 'Password should be at least 6 characters.'); u.password = body.password; }
      return { status: 200, body: publicUser(u) };
    }
    if (path === '/logout') return { status: 204, body: null };
    if (path === '/recover') { state.emails.push({ to: String(body.email).toLowerCase(), type: 'recovery', redirect: url.searchParams.get('redirect_to') }); return { status: 200, body: {} }; }
    if (path === '/resend') { state.emails.push({ to: String(body.email).toLowerCase(), type: 'signup-resend' }); return { status: 200, body: {} }; }
    return err(404, 'not_found', `No mock for ${method} ${path}`);
  }

  // ---- PostgREST-like reads: column lists, filters (eq, neq, gt, gte, lt, lte, in, is, or), multi-column
  // order, offset/limit with the 1000-row cap, and exact counts in Content-Range. ----
  const getPath = (r, expr) => {
    const parts = expr.split(/->>?/);
    let v = r[parts[0]];
    for (const p of parts.slice(1)) v = v == null ? undefined : v[p];
    return v;
  };
  const cmp = (a, b) => (typeof a === 'number' && !isNaN(Number(b)) ? a - Number(b) : String(a).localeCompare(String(b)));
  const test = (r, col, opval) => {
    const i = opval.indexOf('.');
    const op = opval.slice(0, i), val = opval.slice(i + 1);
    const v = getPath(r, col);
    if (op === 'is') return val === 'null' ? v == null : String(v) === val;
    if (op === 'ilike') return v != null && String(v).toLowerCase().includes(val.replace(/%/g, '').replace(/\*/g, '').toLowerCase());
    if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(v));
    if (v == null) return false;
    if (op === 'eq') return String(v) === val;
    if (op === 'neq') return String(v) !== val;
    if (op === 'gt') return cmp(v, val) > 0;
    if (op === 'gte') return cmp(v, val) >= 0;
    if (op === 'lt') return cmp(v, val) < 0;
    if (op === 'lte') return cmp(v, val) <= 0;
    return true;
  };
  const orTest = (r, expr) => expr.replace(/^\(|\)$/g, '').split(',').some((c) => {
    const m = c.match(/^([^.]+(?:->>?[^.]+)*)\.(.+)$/);
    return m ? test(r, m[1], m[2]) : false;
  });
  const project = (r, sel) => {
    if (!sel || sel === '*') return { ...r };
    const o = {};
    for (const part of sel.split(',')) {
      const [alias, expr] = part.includes(':') ? part.split(':') : [part.split(/->>?/).pop(), part];
      const v = getPath(r, expr);
      o[alias] = v === undefined ? null : v;
    }
    return o;
  };
  const RESERVED = ['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'];

  // The database's club triggers: the creator becomes admin, member and going counts
  function clubTriggers(table, r) {
    const T = state.tables;
    if (table === 'clubs') T.club_members.push({ club_id: r.id, user_id: r.created_by, role: 'admin', on_leaderboard: true, joined_at: new Date().toISOString() });
    if (table === 'clubs' || table === 'club_members') for (const c of T.clubs) c.member_count = T.club_members.filter((m) => m.club_id === c.id).length;
    if (table === 'clubs') { const c = T.clubs.find((x) => x.id === r.id); if (c) c.created_at = c.created_at ?? new Date().toISOString(); }
    if (table === 'group_runs') { const g = T.group_runs.find((x) => x.id === r.id); if (g) g.going_count = 0; }
    if (table === 'group_run_going') for (const g of T.group_runs) g.going_count = T.group_run_going.filter((x) => x.group_run_id === g.id).length;
  }
  function leaderboardRpc(u, body) {
    const T = state.tables;
    if (!T.club_members.some((m) => m.club_id === body.c && m.user_id === u.id)) return [];
    return T.club_members.filter((m) => m.club_id === body.c && m.on_leaderboard).map((m) => {
      const acts = T.activities.filter((a) => a.user_id === m.user_id && a.start_time >= body.since && a.source !== 'strava' && a.source !== 'sample');
      return { user_id: m.user_id, display_name: T.hub_profiles.find((h) => h.user_id === m.user_id)?.display_name ?? 'Runner', distance_m: acts.reduce((s, a) => s + (a.distance_m ?? 0), 0), runs: acts.length };
    }).sort((a, b) => b.distance_m - a.distance_m);
  }

  function rest(table, method, url, body, req, headers) {
    const u = userFromReq(req);
    if (!u) return { status: 401, body: { code: '42501', message: 'permission denied' } };
    const rows = state.tables[table];
    if (!rows) return { status: 404, body: { message: 'no table' } };
    const filters = [...url.searchParams.entries()].filter(([k]) => !RESERVED.includes(k));
    const owner = (r) => r.user_id ?? r.follower_id ?? r.blocker_id ?? r.reporter_id ?? r.created_by;
    // Clubs: members see their club's members, group runs and who is going (like the real row rules)
    const memberOf = (clubId) => state.tables.club_members.some((m) => m.club_id === clubId && m.user_id === u.id);
    const runClub = (id) => state.tables.group_runs.find((g) => g.id === id)?.club_id;
    const clubReadable = (r) => table === 'clubs' || (table === 'club_members' && memberOf(r.club_id)) || (table === 'group_runs' && memberOf(r.club_id)) || (table === 'group_run_going' && memberOf(runClub(r.group_run_id)));
    const match = (r) => owner(r) === u.id && filters.every(([k, v]) => (k === 'or' ? orTest(r, v) : test(r, k, v)));
    // Reads mirror the real row rules: public posts and runner profiles are readable by everyone signed in
    // Like can_see_post: followers-only posts for accepted followers; follows involving me (either side)
    const followerPost = (r) => table === 'posts' && r.visibility === 'followers' && state.tables.follows.some((f) => f.follower_id === u.id && f.followee_id === r.user_id && f.status === 'accepted');
    const myFollow = (r) => table === 'follows' && (r.follower_id === u.id || r.followee_id === u.id);
    const readable = (r) => (owner(r) === u.id || followerPost(r) || myFollow(r) || (table === 'posts' && r.visibility === 'everyone') || table === 'hub_profiles' || table === 'ritmos' || clubReadable(r)) && filters.every(([k, v]) => (k === 'or' ? orTest(r, v) : test(r, k, v)));
    if (method === 'GET' || method === 'HEAD') {
      let out = rows.filter(readable);
      const total = out.length;
      const order = url.searchParams.get('order');
      if (order) {
        const keys = order.split(',').map((o) => { const [col, dir] = o.split('.'); return { col, desc: dir === 'desc' }; });
        out = [...out].sort((a, b) => { for (const k of keys) { const c = cmp(a[k.col] ?? '', b[k.col] ?? ''); if (c) return k.desc ? -c : c; } return 0; });
      }
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const limit = Math.min(Number(url.searchParams.get('limit') ?? Infinity), MAX_ROWS);
      out = out.slice(offset, offset + limit).map((r) => project(r, url.searchParams.get('select')));
      const counted = /count=exact/.test(headers['prefer'] ?? '');
      const range = out.length ? `${offset}-${offset + out.length - 1}` : '*';
      const h = { 'content-range': `${range}/${counted ? total : '*'}` };
      state.served = (state.served ?? 0) + JSON.stringify(out).length;
      if (method === 'HEAD') return { status: 200, body: null, headers: h };
      const single = /vnd\.pgrst\.object/.test(headers['accept'] ?? '');
      if (single) return out.length ? { status: 200, body: out[0], headers: h } : { status: 406, body: { code: 'PGRST116', message: 'no rows' } };
      return { status: counted ? 206 : 200, body: out, headers: h };
    }
    if (method === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      for (const r of list) {
        if (table === 'group_runs' && !state.tables.club_members.some((m) => m.club_id === r.club_id && m.user_id === u.id && m.role === 'admin')) return { status: 403, body: { code: '42501', message: 'new row violates row-level security policy' } };
        if (table === 'club_members' && r.role !== 'member') return { status: 403, body: { code: '42501', message: 'new row violates row-level security policy' } };
        if ((r.user_id ?? r.follower_id ?? r.blocker_id ?? r.reporter_id ?? r.created_by) !== u.id) return { status: 403, body: { code: '42501', message: 'new row violates row-level security policy' } };
        const k = keyOf[table];
        const i = rows.findIndex((x) => k.every((c) => String(x[c]) === String(r[c])));
        const t = table === 'activities' ? { updated_at: stamp() } : {};
        if (i >= 0) rows[i] = { ...rows[i], ...r, ...t }; else {
          // Like the real hub_on_follow trigger: following a public profile is accepted at once
          if (table === 'follows' && state.tables.hub_profiles.find((h) => h.user_id === r.followee_id)?.private === false) r.status = 'accepted';
          // Like hub_follow_notify: the followed runner is told (a request, or a new follower)
          if (table === 'follows') { state.noteId = (state.noteId ?? 1000) + 1; state.tables.notifications.push({ id: state.noteId, user_id: r.followee_id, kind: r.status === 'accepted' ? 'follow' : 'follow_request', actor_id: r.follower_id, created_at: new Date().toISOString(), read_at: null }); }
          rows.push({ ...r, ...t, ...(table === 'posts' ? { ritmo_count: 0, comment_count: 0, created_at: new Date().toISOString() } : {}), ...(table === 'comments' ? { created_at: new Date().toISOString() } : {}) });
          const post = state.tables.posts.find((p) => p.id === r.post_id);
          if (post && table === 'ritmos') post.ritmo_count++;
          if (post && table === 'comments') post.comment_count++;
          clubTriggers(table, r);
        }
      }
      return { status: 201, body: null };
    }
    if (method === 'PATCH') {
      // Like the "accept my followers" rule: the followed runner may update (accept) a request
      if (table === 'follows') { for (const r of rows) if (r.followee_id === u.id && filters.every(([k, v]) => test(r, k, v))) Object.assign(r, body); return { status: 204, body: null }; }
      for (const r of rows) if (match(r)) Object.assign(r, body, table === 'activities' ? { updated_at: stamp() } : {});
      return { status: 204, body: null };
    }
    if (method === 'DELETE') {
      // Like "unfollow or remove": either runner may delete a follow row
      const canDelete = (r) => match(r) || (table === 'follows' && r.followee_id === u.id && filters.every(([k, v]) => test(r, k, v)));
      for (let i = rows.length - 1; i >= 0; i--) if (canDelete(rows[i])) {
        const post = state.tables.posts.find((p) => p.id === rows[i].post_id);
        if (post && table === 'ritmos') post.ritmo_count = Math.max(0, post.ritmo_count - 1);
        if (post && table === 'comments') post.comment_count = Math.max(0, post.comment_count - 1);
        const gone = rows[i];
        if (table === 'club_members' || table === 'group_run_going') setTimeout(() => clubTriggers(table, gone), 0);
        if (table === 'activities') {
          const d = state.tables.activity_deletions;
          const j = d.findIndex((x) => x.user_id === u.id && x.id === rows[i].id);
          const entry = { user_id: u.id, id: rows[i].id, deleted_at: stamp() };
          if (j >= 0) d[j] = entry; else d.push(entry);
        }
        // Like the real foreign keys: a post's Fuego, comments and media go with it
        if (table === 'posts') for (const t of ['ritmos', 'comments', 'post_media']) if (state.tables[t]) state.tables[t] = state.tables[t].filter((x) => x.post_id !== gone.id);
        rows.splice(i, 1);
      }
      return { status: 204, body: null };
    }
    return { status: 405, body: null };
  }

  function functions(name, req) {
    const u = userFromReq(req);
    if (!u) return { status: 401, body: { error: 'not_signed_in' } };
    if (name === 'derive-runs') {
      const { deriveCore: derive, DERIVED_VERSION } = deriveCore();
      const stale = state.tables.activities.filter((r) => r.user_id === u.id && (!r.derived || r.derived.v < DERIVED_VERSION))
        .sort((a, b) => String(b.start_time).localeCompare(String(a.start_time)));
      const updated = [];
      for (const r of stale.slice(0, 40)) {
        r.derived = derive(r.streams, r.laps) ?? { v: DERIVED_VERSION };
        r.updated_at = stamp();
        updated.push({ id: r.id, derived: r.derived });
      }
      return { status: 200, body: { updated, remaining: stale.length - updated.length } };
    }
    if (name === 'read-laps') {
      const paths = (req.postDataJSON() ?? {}).paths ?? [];
      if (!paths.length || paths.some((p) => !p.startsWith(`${u.id}/`) || !state.files.has(`run-media/${p}`))) return { status: 400, body: { error: 'bad_request' } };
      return state.lapRead ? { status: 200, body: state.lapRead } : { status: 503, body: { error: 'not_configured' } };
    }
    if (name === 'push') {
      // Mirrors the real function's signed-in actions: the server key, save or forget this browser, a test message
      const b = req.postDataJSON() ?? {};
      state.push = state.push ?? { subs: new Map(), tests: 0 };
      if (b.action === 'key') return { status: 200, body: { publicKey: 'BNtestVapidPublicKeyForTheMockOnly_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } };
      if (b.action === 'subscribe') {
        const s = b.subscription;
        if (!s?.endpoint || !s.keys?.p256dh || !s.keys?.auth) return { status: 400, body: { error: 'bad_request' } };
        state.push.subs.set(s.endpoint, { user_id: u.id, tz: b.tz });
        return { status: 200, body: { ok: true } };
      }
      if (b.action === 'unsubscribe') { const x = state.push.subs.get(b.endpoint); if (x?.user_id === u.id) state.push.subs.delete(b.endpoint); return { status: 200, body: { ok: true } }; }
      if (b.action === 'test') { if (state.push.subs.get(b.endpoint)?.user_id !== u.id) return { status: 404, body: { error: 'not_subscribed' } }; state.push.tests++; return { status: 200, body: { sent: true } }; }
      return { status: 400, body: { error: 'bad_request' } };
    }
    if (name === 'weather') {
      // Mirrors the real function: own runs only, recent runs only (3 h), needs GPS, stores the result with the run.
      // state.weather is what MET Norway "returns"; unset means the service is unavailable.
      state.weatherCalls = (state.weatherCalls ?? 0) + 1;
      const id = (req.postDataJSON() ?? {}).id;
      const row = state.tables.activities.find((r) => r.id === id && r.user_id === u.id);
      if (!row) return { status: 404, body: { error: 'not_found' } };
      if (row.source_ids?.weather) return { status: 200, body: { weather: row.source_ids.weather } };
      if (Date.now() - (new Date(row.start_time).getTime() + Number(row.duration_s ?? 0) * 500) > 3 * 3600 * 1000) return { status: 422, body: { error: 'too_old' } };
      if (row.source_ids?.weatherSkip) return { status: 422, body: { error: row.source_ids.weatherSkip } };
      if (!row.streams?.[0] || row.streams[0].lat == null) { row.source_ids = { ...(row.source_ids ?? {}), weatherSkip: 'no_gps' }; row.updated_at = stamp(); return { status: 422, body: { error: 'no_gps' } }; }
      if (!state.weather) return { status: 502, body: { error: 'unavailable' } };
      const weather = { ...state.weather, at: new Date().toISOString(), src: 'met.no' };
      row.source_ids = { ...(row.source_ids ?? {}), weather }; row.updated_at = stamp();
      return { status: 200, body: { weather } };
    }
    if (name === 'strava-auth') {
      // Mirrors the real function. "start" returns a URL straight back to the app's callback, as if the runner had
      // approved on Strava; "finish" connects and fills the inbox with state.strava.backfill (the last 30 days).
      state.strava = state.strava ?? { connected: new Set(), states: new Map(), backfill: [], calls: [] };
      const b = req.postDataJSON() ?? {};
      state.strava.calls.push(b.action);
      // Open to every signed-in runner, as in the real function
      if (b.action === 'start') {
        const st = 'state-' + Math.random().toString(16).slice(2);
        state.strava.states.set(st, u.id);
        return { status: 200, body: { url: `${state.strava.appUrl}/strava/callback?state=${st}&code=test-code&scope=read,activity:read_all` } };
      }
      if (b.action === 'finish') {
        if (state.strava.states.get(b.state) !== u.id) return { status: 400, body: { error: 'expired', message: 'The Strava connection took too long or was started elsewhere. Please try again.' } };
        if (!/activity:read/.test(b.scope ?? '')) return { status: 400, body: { error: 'scope', message: 'Ritmo needs permission to read your activities.' } };
        state.strava.states.delete(b.state);
        state.strava.connected.add(u.id);
        for (const p of state.strava.backfill) state.tables.strava_inbox.push({ id: state.tables.strava_inbox.length + 1, user_id: u.id, activity_id: String(p.activity?.id ?? p.id), payload: p.deleted ? { deleted: true } : p, received_at: stamp() });
        return { status: 200, body: { connected: true, backfillDays: 30 } };
      }
      if (b.action === 'disconnect') { state.strava.connected.delete(u.id); state.tables.strava_inbox = state.tables.strava_inbox.filter((r) => r.user_id !== u.id); return { status: 200, body: { connected: false } }; }
      return { status: 400, body: { error: 'bad_request' } };
    }
    if (name === 'coach') return state.coachStatus ? { status: state.coachStatus, body: { error: 'rate_limited' } } : { status: 503, body: { error: 'not_configured' } };
    if (name === 'delete-account') {
      for (const t of TABLES) state.tables[t] = state.tables[t].filter((r) => r.user_id !== u.id);
      for (const k of [...state.files.keys()]) if (k.startsWith(`avatars/${u.id}/`)) state.files.delete(k);
      state.users.delete(u.email);
      return { status: 200, body: { deleted: true } };
    }
    return { status: 404, body: null };
  }

  // Storage: private "avatars" bucket where each user may only touch avatars/<their id>/...
  function storage(path, method, req, body) {
    const own = (p) => { const u = userFromReq(req); return u && p.split('/')[0] === u.id ? u : undefined; };
    let m;
    // Several signed links at once (createSignedUrls). Mirrors the photo rule: your own files, or another runner's
    // profile photo (avatar.jpg, avatar-small.jpg; never shoe photos) when their setting allows you and no block
    if (path === '/object/sign/avatars' && method === 'POST') {
      const u = userFromReq(req);
      const canSee = (p) => {
        const [owner, file] = p.split('/');
        if (u && owner === u.id) return true;
        if (!u || !['avatar.jpg', 'avatar-small.jpg'].includes(file)) return false;
        const h = state.tables.hub_profiles.find((x) => x.user_id === owner);
        if (!h || state.tables.blocks.some((b) => (b.blocker_id === owner && b.blocked_id === u.id) || (b.blocker_id === u.id && b.blocked_id === owner))) return false;
        const vis = h.photo_visibility ?? 'everyone';
        return vis === 'everyone' || (vis === 'followers' && state.tables.follows.some((f) => f.follower_id === u.id && f.followee_id === owner && f.status === 'accepted'));
      };
      return { status: 200, body: (body.paths || []).map((p) => {
        if (!canSee(p) || !state.files.has(`avatars/${p}`)) return { path: p, signedURL: null, error: 'Either the object does not exist or you do not have access to it' };
        const token = crypto.randomUUID(); state.signed.set(token, `avatars/${p}`);
        return { path: p, signedURL: `/object/sign/avatars/${p}?token=${token}`, error: null };
      }) };
    }
    if ((m = path.match(/^\/object\/sign\/avatars\/(.+)$/)) && method === 'POST') {
      if (!own(m[1]) || !state.files.has(`avatars/${m[1]}`)) return { status: 400, body: { statusCode: '404', error: 'not_found', message: 'Object not found' } };
      const token = crypto.randomUUID(); state.signed.set(token, `avatars/${m[1]}`);
      return { status: 200, body: { signedURL: `/object/sign/avatars/${m[1]}?token=${token}` } };
    }
    if ((m = path.match(/^\/object\/sign\/avatars\/(.+)$/)) && method === 'GET') {
      const key = state.signed.get(new URL(req.url()).searchParams.get('token'));
      return key && state.files.has(key) ? { status: 200, raw: state.files.get(key), type: 'image/jpeg' } : { status: 400, body: { error: 'invalid' } };
    }
    if ((m = path.match(/^\/object\/avatars\/(.+)$/)) && (method === 'POST' || method === 'PUT')) {
      if (!own(m[1])) return { status: 403, body: { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' } };
      const buf = req.postDataBuffer() || Buffer.alloc(0);
      const a = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff])), b = buf.lastIndexOf(Buffer.from([0xff, 0xd9]));
      state.files.set(`avatars/${m[1]}`, a >= 0 && b > a ? buf.subarray(a, b + 2) : buf);
      return { status: 200, body: { Key: `avatars/${m[1]}`, Id: crypto.randomUUID() } };
    }
    // Private run screenshots: run-media/<user id>/...
    if ((m = path.match(/^\/object\/run-media\/(.+)$/)) && (method === 'POST' || method === 'PUT')) {
      if (!own(m[1])) return { status: 403, body: { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' } };
      state.files.set(`run-media/${m[1]}`, req.postDataBuffer() || Buffer.alloc(0));
      return { status: 200, body: { Key: `run-media/${m[1]}`, Id: crypto.randomUUID() } };
    }
    if (path === '/object/avatars' && method === 'DELETE') {
      const out = [];
      for (const p of body.prefixes || []) if (own(p) && state.files.delete(`avatars/${p}`)) out.push({ name: p });
      return { status: 200, body: out };
    }
    return { status: 404, body: null };
  }

  /** Install on a Playwright context. */
  async function install(context, base, opts = {}) {
    // Answer the cookie and storage notice in advance, so it does not cover the screens other tests use.
    // Tests of the notice itself pass { consent: false }.
    if (opts.consent !== false) await context.addInitScript(() => { try { if (!localStorage.getItem('ritmo:consent')) localStorage.setItem('ritmo:consent', JSON.stringify({ errors: false, at: '2026-11-08T00:00:00Z', v: 1 })); } catch { /* */ } });
    await context.route(`${base}/**`, async (route) => {
      const req = route.request();
      if (state.offline) return route.abort('internetdisconnected');
      const url = new URL(req.url());
      const method = req.method();
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*', 'x-supabase-api-version': '2024-01-01' };
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      let body = {};
      try { body = req.postDataJSON() ?? {}; } catch { body = {}; }
      let res;
      if (url.pathname.startsWith('/auth/v1')) res = auth(url.pathname.slice(8), method, url, body, req);
      else if (url.pathname === '/rest/v1/rpc/strava_status') { state.rpc.push('strava_status'); const u = userFromReq(req); res = { status: 200, body: u && state.strava?.connected?.has(u.id) ? [{ connected: true, connected_at: new Date().toISOString(), scope: 'read,activity:read_all' }] : [] }; }
      else if (url.pathname === '/rest/v1/rpc/club_leaderboard') { const u = userFromReq(req); res = { status: 200, body: u ? leaderboardRpc(u, body || {}) : [] }; }
      else if (url.pathname === '/rest/v1/rpc/hub_counts' || url.pathname === '/rest/v1/rpc/hub_follow_list') {
        // Mirrors the real functions: counts for anyone (requests only for yourself), lists only when the runner is
        // public or you follow them, never across a block
        const u = userFromReq(req); const t = (body || {}).target;
        const blocked = (a, b) => state.tables.blocks.some((x) => (x.blocker_id === a && x.blocked_id === b) || (x.blocker_id === b && x.blocked_id === a));
        const F = state.tables.follows;
        if (!u || blocked(t, u.id)) res = { status: 200, body: [] };
        else if (url.pathname.endsWith('hub_counts')) res = { status: 200, body: [{ followers: F.filter((f) => f.followee_id === t && f.status === 'accepted').length, following: F.filter((f) => f.follower_id === t && f.status === 'accepted').length, requests: t === u.id ? F.filter((f) => f.followee_id === t && f.status === 'pending').length : 0, fuego: state.tables.posts.filter((x) => x.user_id === t).reduce((n, x) => n + (x.ritmo_count || 0), 0) }] };
        else {
          const h = state.tables.hub_profiles.find((x) => x.user_id === t);
          const can = t === u.id || (h && h.private === false) || F.some((f) => f.follower_id === u.id && f.followee_id === t && f.status === 'accepted');
          const which = body.which;
          res = { status: 200, body: !can ? [] : F.filter((f) => f.status === 'accepted' && (which === 'followers' ? f.followee_id === t : f.follower_id === t)).map((f) => ({ user_id: which === 'followers' ? f.follower_id : f.followee_id, created_at: f.created_at ?? new Date().toISOString() })) };
        }
      }
      else if (url.pathname.startsWith('/rest/v1/rpc/')) { state.rpc.push(url.pathname.slice(12)); res = { status: 204, body: null }; }
      else if (url.pathname.startsWith('/storage/v1')) res = storage(url.pathname.slice(11), method, req, body);
      else if (url.pathname.startsWith('/rest/v1/')) res = rest(url.pathname.slice(9), method, url, body, req, req.headers());
      else if (url.pathname.startsWith('/functions/v1/')) res = functions(url.pathname.slice(14), req);
      else res = { status: 404, body: null };
      state.calls.push(`${method} ${url.pathname} ${res.status}`);
      if (res.raw) return route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.type }, body: res.raw });
      return route.fulfill({ status: res.status, headers: { ...cors, 'content-type': 'application/json', ...(res.headers ?? {}) }, body: res.body == null ? '' : JSON.stringify(res.body) });
    });
  }

  /** Simulate clicking an emailed link (implicit flow puts the session in the URL hash). */
  function linkFor(email, type) {
    const u = state.users.get(email.toLowerCase());
    if (type === 'signup') u.confirmed = true;
    const s = session(u);
    return `#access_token=${s.access_token}&refresh_token=${s.refresh_token}&expires_in=3600&expires_at=${s.expires_at}&token_type=bearer&type=${type}`;
  }

  return { state, install, linkFor };
}

module.exports = { createMock };
