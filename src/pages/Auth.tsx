import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, MailCheck } from 'lucide-react';
import { useApp } from '../app/AppContext';
import { Lanes, Logo, StatusLine } from '../components/ui';
import { logIn, PASSWORD_RULE, passwordProblem, resendConfirmation, sendPasswordReset, setNewPassword, signUp, type AuthResult } from '../app/auth';

function AuthLayout({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="stack-lg" style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ paddingTop: 'calc(var(--s5) + env(safe-area-inset-top))' }}><Logo variant="main" width={170} /></div>
        <div className="stack-sm">
          <h1 className="display-lg">{title}</h1>
          {intro && <p className="muted">{intro}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

function PasswordField({ id, label, value, onChange, autoComplete, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; hint?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="pw-wrap">
        <input id={id} className="input" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required aria-describedby={hint ? `${id}-hint` : undefined} />
        <button type="button" className="icon-btn pw-toggle" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((x) => !x)}>{show ? <EyeOff size={20} strokeWidth={2} /> : <Eye size={20} strokeWidth={2} />}</button>
      </div>
      {hint && <p id={`${id}-hint`} className="caption">{hint}</p>}
    </div>
  );
}

const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/');

export function Login() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AuthResult>();
  const [resent, setResent] = useState(false);
  return (
    <AuthLayout title="Log in" intro={params.get('confirmed') ? undefined : 'Welcome back. Log in to see your training.'}>
      {params.get('confirmed') && <StatusLine kind="success">Your email is confirmed. Log in to get started.</StatusLine>}
      {params.get('deleted') && <StatusLine kind="success">Your account and all its data have been deleted.</StatusLine>}
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setResent(false);
        const r = await logIn(email.trim(), password);
        setBusy(false); setRes(r);
        if (r.ok) nav(next, { replace: true });
      }}>
        <div className="field"><label htmlFor="email">Email</label><input id="email" className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <PasswordField id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        {res && !res.ok && <div role="alert"><StatusLine kind="danger">{res.message}</StatusLine></div>}
        {res?.code === 'unconfirmed' && (
          <button type="button" className="btn btn-small" style={{ alignSelf: 'flex-start' }} onClick={async () => { const r = await resendConfirmation(email.trim()); setResent(r.ok); if (!r.ok) setRes(r); }}>Send a new confirmation email</button>
        )}
        {resent && <StatusLine kind="success">A new confirmation email is on its way.</StatusLine>}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        <Link to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ''}`} className="label" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start' }}>Forgot password?</Link>
      </form>
      <p className="muted">New to Ritmo? <Link to={`/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="label">Create an account</Link></p>
      <p className="caption">Signed in before with an emailed link? Use "Forgot password?" to set a password for your account.</p>
    </AuthLayout>
  );
}

export function SignUp() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AuthResult>();
  const [sentTo, setSentTo] = useState<string>();
  const pwHint = password ? passwordProblem(password) ?? 'Strong enough.' : PASSWORD_RULE;

  if (sentTo) {
    return (
      <AuthLayout title="Check your email">
        <div className="card stack">
          <MailCheck size={32} strokeWidth={2} aria-hidden="true" />
          <p>We sent a confirmation link to <strong>{sentTo}</strong>. Open it on any device to finish creating your account, then log in.</p>
          <p className="caption">Nothing there after a few minutes? Check your spam folder, or send it again.</p>
          <button className="btn" onClick={async () => { const r = await resendConfirmation(sentTo); setRes(r.ok ? { ok: true, message: 'Sent again.' } : r); }}>Send it again</button>
          {res?.message && <StatusLine kind={res.ok ? 'success' : 'danger'}>{res.message}</StatusLine>}
          <Link to="/login" className="btn btn-primary">Go to log in</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create your account" intro="Your account keeps your runs, plan and coaching private to you and available on every device.">
      <div className="hero" style={{ padding: 'var(--s4) var(--s5)' }}><Lanes /><p className="label">Train to your own rhythm.</p></div>
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault();
        if (!consent) { setRes({ ok: false, message: 'Please agree to how Ritmo uses your health data to continue.' }); return; }
        setBusy(true);
        const r = await signUp(email.trim(), password, new Date().toISOString());
        setBusy(false); setRes(r);
        if (r.ok && r.needsConfirmation) setSentTo(email.trim());
        else if (r.ok) nav(next === '/' ? '/welcome' : next, { replace: true });
      }}>
        <div className="field"><label htmlFor="su-email">Email</label><input id="su-email" className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <PasswordField id="su-password" label="Password" value={password} onChange={setPassword} autoComplete="new-password" hint={pwHint} />
        <label className="consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>I agree that Ritmo stores and uses my health data, including heart rate, injuries and how my runs felt, to give me training advice. I have read the <Link to="/privacy" target="_blank" className="label">privacy page</Link>. I can export or delete my data at any time.</span>
        </label>
        {res && !res.ok && <div role="alert"><StatusLine kind="danger">{res.message}</StatusLine></div>}
        {res?.code === 'already_registered' && <div className="row wrap"><Link to="/login" className="btn btn-small">Log in</Link><Link to={`/forgot-password?email=${encodeURIComponent(email)}`} className="btn btn-small btn-ghost">Reset password</Link></div>}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Creating your account…' : 'Create account'}</button>
      </form>
      <p className="muted">Already have an account? <Link to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="label">Log in</Link></p>
    </AuthLayout>
  );
}

export function ForgotPassword() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AuthResult>();
  return (
    <AuthLayout title="Reset your password" intro="Enter your email and we will send you a link to choose a new password. This also works if you used to sign in with an emailed link and never set a password.">
      <form className="card stack" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setRes(await sendPasswordReset(email.trim())); setBusy(false); }}>
        <div className="field"><label htmlFor="fp-email">Email</label><input id="fp-email" className="input" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        {res?.ok && <StatusLine kind="success">If an account exists for {email}, a reset link is on its way. It works on any device.</StatusLine>}
        {res && !res.ok && <div role="alert"><StatusLine kind="danger">{res.message}</StatusLine></div>}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
      </form>
      <p className="muted"><Link to="/login" className="label">Back to log in</Link></p>
    </AuthLayout>
  );
}

export function ResetPassword() {
  const nav = useNavigate();
  const { session, finishRecovery } = useApp();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<AuthResult>();
  if (!session) {
    return (
      <AuthLayout title="Link expired" intro="This reset link is no longer valid. Reset links work once and expire after an hour.">
        <Link to="/forgot-password" className="btn btn-primary">Send a new link</Link>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Choose a new password" intro={`For ${session.user.email}.`}>
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true);
        const r = await setNewPassword(password);
        setBusy(false); setRes(r);
        if (r.ok) { finishRecovery(); setTimeout(() => nav('/', { replace: true }), 900); }
      }}>
        <PasswordField id="np" label="New password" value={password} onChange={setPassword} autoComplete="new-password" hint={password ? passwordProblem(password) ?? 'Strong enough.' : PASSWORD_RULE} />
        {res?.ok && <StatusLine kind="success">Password saved. Taking you to Ritmo.</StatusLine>}
        {res && !res.ok && <div role="alert"><StatusLine kind="danger">{res.message}</StatusLine></div>}
        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </AuthLayout>
  );
}
