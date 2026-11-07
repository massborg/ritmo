// Error tracking with Sentry. Off unless VITE_SENTRY_DSN is set in Netlify, and then loaded as a separate file, so
// nobody downloads it while it is off. Reports carry the error and the page, never personal data: no user, email,
// IP address, cookies, query strings (which can hold private links or sign-in codes) or request bodies, and no
// session replay or performance tracing.
import { BUILD_ID } from './chunks';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

type Sentry = typeof import('@sentry/react');
let sentry: Sentry | undefined;

/** Removes query strings and fragments from a URL (private calendar links, OAuth codes). */
export const scrubUrl = (u?: string) => (u ? u.replace(/[?#].*$/, '') : u);
const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi;
export const scrubText = (s?: string) => (s ? s.replace(EMAIL, '[email]') : s);

export async function initErrorTracking() {
  if (!DSN || typeof window === 'undefined') return;
  try {
    sentry = await import('@sentry/react');
    sentry.init({
      dsn: DSN,
      release: BUILD_ID,
      environment: location.hostname === 'app.ritmorunning.run' ? 'production' : 'preview',
      // Nothing personal: no user details, cookies, headers, request bodies or query parameters
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false, graphQL: { document: false, variables: false }, genAI: { inputs: false, outputs: false } },
      tracesSampleRate: 0,
      integrations: (all) => all.filter((i) => !['Replay', 'BrowserTracing', 'Feedback'].includes(i.name)),
      beforeBreadcrumb(b) {
        if (b.category === 'ui.input') return null;
        if (b.data?.url) b.data.url = scrubUrl(String(b.data.url));
        if (b.message) b.message = scrubText(b.message);
        return b;
      },
      beforeSend(e) {
        delete e.user;
        if (e.request) { e.request.url = scrubUrl(e.request.url); delete e.request.query_string; delete e.request.cookies; delete e.request.headers; delete e.request.data; }
        for (const ex of e.exception?.values ?? []) ex.value = scrubText(ex.value);
        e.message = scrubText(e.message);
        return e;
      },
    });
  } catch { /* error tracking must never break the app */ }
}

/** Reports an error that the app handled (for example a failed import) without showing anything to the runner. */
export function reportError(err: unknown, where: string) {
  try { sentry?.captureException(err, { tags: { where } }); } catch { /* ignore */ }
}
