'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { GoogleMark, Icon } from '@/components/icon';
import { Field, Notice, PasswordInput, SubmitButton, TextInput } from '@/components/form';
import { ApiError, googleSignInUrl, signIn } from '@/lib/api';
import { useSession } from '@/lib/session';

/* Reasons the Google round trip can come back unhappy. The callback redirects
   here with a code rather than a sentence, so the wording lives on this side
   where it can be changed without touching the API. */
const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: 'You cancelled the Google sign in. Nothing has changed.',
  google_state: 'That sign in attempt could not be verified. Please try again.',
  google_incomplete: 'Google did not send everything we needed. Please try again.',
  google_failed: 'Something went wrong signing in with Google. Try again, or use your password.',
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setSession } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  /* Ticked by default, as the approved screen has it. Unticking it is someone
     telling you they are on a machine that is not theirs, which is worth
     honouring rather than decorating. */
  const [rememberMe, setRememberMe] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(
    GOOGLE_ERRORS[params.get('error') ?? ''] ?? null,
  );
  const [useGoogleInstead, setUseGoogleInstead] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    setFieldErrors({});
    setUseGoogleInstead(false);

    try {
      setSession(await signIn(email, password, rememberMe));
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) setFieldErrors(err.fields);
        else setProblem(err.message);
        /* The account exists but has no password, so point at the button that
           will actually work rather than leaving them guessing. */
        if (err.code === 'use_google') setUseGoogleInstead(true);
      } else {
        setProblem('We could not reach the server. Check your connection and try again.');
      }
      setBusy(false);
    }
  }

  return (
    <AuthShell
      panel="login"
      topRight={
        <>
          <span>New to Variantage?</span>
          <Link className="btn btn-sm" href="/signup">
            Create an account
          </Link>
        </>
      }
    >
      <div className="form-head rise d1">
        <h2>Sign in</h2>
        <p className="sub">Welcome back. Enter your details to open your books.</p>
      </div>

      {problem && (
        <div className="rise d2" style={{ marginBottom: 4 }}>
          <Notice tone={useGoogleInstead ? 'info' : 'err'} icon="alert">
            {problem}
          </Notice>
        </div>
      )}

      <div className="rise d2">
        <a
          className="btn btn-oauth"
          href={googleSignInUrl()}
          style={useGoogleInstead ? { borderColor: 'var(--navy-600)', borderWidth: 2 } : undefined}
        >
          <GoogleMark />
          Continue with Google
        </a>
      </div>

      <div className="or rise d2">
        <span>or sign in with email</span>
      </div>

      <form className="rise d3" onSubmit={onSubmit} noValidate>
        <Field label="Email address" required error={fieldErrors.email}>
          <div className="control">
            <TextInput
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="you@yourbusiness.ca"
              value={email}
              invalid={!!fieldErrors.email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </Field>

        <Field
          label="Password"
          required
          error={fieldErrors.password}
          action={<Link href="/forgot-password">Forgot password?</Link>}
        >
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="••••••••••"
            value={password}
            invalid={!!fieldErrors.password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <label className="check" style={{ margin: '4px 0 26px' }}>
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          <span className="box">
            <Icon name="check" size={15} sw={3.4} />
          </span>
          <span>
            Keep me signed in on this computer
            {!rememberMe && (
              <span className="hint" style={{ display: 'block', margin: '2px 0 0' }}>
                You will be signed out when you close the browser.
              </span>
            )}
          </span>
        </label>

        <SubmitButton busy={busy} busyLabel="Signing you in…">
          Sign in
        </SubmitButton>
      </form>

      <div className="rise d4" style={{ margin: '22px 0 0' }}>
        <Notice icon="clock" title="You will be signed out after 15 minutes of inactivity">
          A warning appears first, so you can stay signed in and finish what you are doing.
        </Notice>
      </div>
    </AuthShell>
  );
}

/* useSearchParams needs a Suspense boundary in the app router. */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
