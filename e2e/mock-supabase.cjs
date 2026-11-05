// A small stand-in for Supabase Auth, PostgREST and Edge Functions, used by the browser tests.
// It enforces "each user only sees their own rows", like the real row-level security policies.
const crypto = require('crypto');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(user) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now })}.sig`;
}

function createMock() {
  const state = { users: new Map(), tokens: new Map(), tables: {}, emails: [], offline: false, calls: [], files: new Map(), signed: new Map(), rpc: [] };
  const TABLES = ['profiles', 'activities', 'races', 'plans', 'session_feedback', 'sources', 'coach_messages'];
  TABLES.forEach((t) => (state.tables[t] = []));
  const keyOf = { profiles: ['user_id'], activities: ['user_id', 'id'], races: ['user_id', 'id'], plans: ['user_id', 'id'], session_feedback: ['user_id', 'activity_id'], sources: ['user_id', 'kind'], coach_messages: ['user_id', 'id'] };

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

  function rest(table, method, url, body, req, headers) {
    const u = userFromReq(req);
    if (!u) return { status: 401, body: { code: '42501', message: 'permission denied' } };
    const rows = state.tables[table];
    if (!rows) return { status: 404, body: { message: 'no table' } };
    const filters = [...url.searchParams.entries()].filter(([k]) => !['select', 'order', 'limit', 'on_conflict'].includes(k));
    const match = (r) => r.user_id === u.id && filters.every(([k, v]) => {
      const [op, val] = [v.slice(0, v.indexOf('.')), v.slice(v.indexOf('.') + 1)];
      return op === 'eq' ? String(r[k]) === val : op === 'neq' ? String(r[k]) !== val : true;
    });
    if (method === 'GET') {
      let out = rows.filter(match).map((r) => ({ ...r }));
      const order = url.searchParams.get('order');
      if (order) { const [col, dir] = order.split('.'); out.sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (dir === 'desc' ? -1 : 1)); }
      const limit = url.searchParams.get('limit');
      if (limit) out = out.slice(0, Number(limit));
      return { status: 200, body: out };
    }
    if (method === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      for (const r of list) {
        if (r.user_id !== u.id) return { status: 403, body: { code: '42501', message: 'new row violates row-level security policy' } };
        const k = keyOf[table];
        const i = rows.findIndex((x) => k.every((c) => String(x[c]) === String(r[c])));
        if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push({ ...r });
      }
      return { status: 201, body: null };
    }
    if (method === 'DELETE') {
      for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i])) rows.splice(i, 1);
      return { status: 204, body: null };
    }
    void headers;
    return { status: 405, body: null };
  }

  function functions(name, req) {
    const u = userFromReq(req);
    if (!u) return { status: 401, body: { error: 'not_signed_in' } };
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
    if (path === '/object/avatars' && method === 'DELETE') {
      const out = [];
      for (const p of body.prefixes || []) if (own(p) && state.files.delete(`avatars/${p}`)) out.push({ name: p });
      return { status: 200, body: out };
    }
    return { status: 404, body: null };
  }

  /** Install on a Playwright context. */
  async function install(context, base) {
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
      else if (url.pathname.startsWith('/rest/v1/rpc/')) { state.rpc.push(url.pathname.slice(12)); res = { status: 204, body: null }; }
      else if (url.pathname.startsWith('/storage/v1')) res = storage(url.pathname.slice(11), method, req, body);
      else if (url.pathname.startsWith('/rest/v1/')) res = rest(url.pathname.slice(9), method, url, body, req, req.headers());
      else if (url.pathname.startsWith('/functions/v1/')) res = functions(url.pathname.slice(14), req);
      else res = { status: 404, body: null };
      state.calls.push(`${method} ${url.pathname} ${res.status}`);
      if (res.raw) return route.fulfill({ status: res.status, headers: { ...cors, 'content-type': res.type }, body: res.raw });
      return route.fulfill({ status: res.status, headers: { ...cors, 'content-type': 'application/json' }, body: res.body == null ? '' : JSON.stringify(res.body) });
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
