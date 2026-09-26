'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import {
  Field,
  Notice,
  PasswordInput,
  PasswordMeter,
  SubmitButton,
} from '@/components/form';
import { ApiError, resetPassword } from '@/lib/api';
import * as v from '@/lib/validation';
import { applyServerErrors, useField, validateAll } from '@/lib/use-field';

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';

  const password = useField('', v.password);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /* The confirm rule closes over the current password, so it re-checks
     correctly if the first box is edited after the second. */
  const confirm = useField('', (value) =>
    value === password.value ? null : 'The two passwords do not match.',
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProblem(null);

    /* The two boxes not matching is a typo, not an attack, so it is caught here
       rather than costing a round trip to say so. */
    if (!validateAll([password, confirm])) return;

    setBusy(true);
    try {
      await resetPassword(token, password.value);
      router.push('/password-changed');
    } catch (err) {
      if (err instanceof ApiError) {
        applyServerErrors({ password, confirm }, err.fields);
        if (!err.fields) setProblem(err.message);
      } else {
        setProblem('We could not reach the server. Check your connection and try again.');
      }
      setBusy(false);
    }
  }

  /* Arriving with no token means the link was mangled or typed by hand. Say so
     rather than showing a form that cannot possibly work. */
  if (!token) {
    return (
      <AuthShell panel="newpass">
        <div className="form-head rise d1">
          <h2>This link is not complete</h2>
          <p className="sub">
            The reset link seems to have been cut short. Open it straight from the email, or ask
            for a new one.
          </p>
        </div>
        <Link className="btn btn-primary btn-block" href="/forgot-password">
          Send a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      panel="newpass"
      topRight={
        <Link className="btn btn-sm" href="/login">
          Back to sign in
        </Link>
      }
    >
      <div className="form-head rise d1">
        <h2>Set a new password</h2>
        <p className="sub">Choose something you will remember. You will use it to sign in.</p>
      </div>

      {problem && (
        <div className="rise d2" style={{ marginBottom: 4 }}>
          <Notice tone="err" icon="alert">
            {problem}{' '}
            <Link href="/forgot-password" style={{ fontWeight: 600 }}>
              Ask for a new link
            </Link>
            .
          </Notice>
        </div>
      )}

      <form className="rise d2" onSubmit={onSubmit} noValidate>
        <Field label="New password" required error={password.error ?? undefined}>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            placeholder="At least 10 characters"
            value={password.value}
            invalid={!!password.error}
            onChange={(e) => password.set(e.target.value)}
            onBlur={password.onBlur}
            autoFocus
          />
          <PasswordMeter value={password.value} />
        </Field>

        <Field label="Type it again" required error={confirm.error ?? undefined}>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            placeholder="Repeat your new password"
            value={confirm.value}
            invalid={!!confirm.error}
            onChange={(e) => confirm.set(e.target.value)}
            onBlur={confirm.onBlur}
          />
        </Field>

        <div style={{ margin: '24px 0' }}>
          <Notice tone="warn" icon="shield" title="You will be signed out everywhere else">
            Saving a new password ends every other session, the web application and both mobile
            apps. You will need to sign in again on your phone.
          </Notice>
        </div>

        <SubmitButton busy={busy} busyLabel="Saving…">
          Save new password
        </SubmitButton>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
