'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { Field, Notice, SubmitButton, TextInput } from '@/components/form';
import { Icon } from '@/components/icon';
import { ApiError, forgotPassword } from '@/lib/api';
import * as v from '@/lib/validation';
import { useField, validateAll } from '@/lib/use-field';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const email = useField('', v.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validateAll([email])) return;

    setBusy(true);
    try {
      await forgotPassword(email.value.trim());
      /* The API answers the same way whether or not the address exists, and so
         does this screen. Carrying the address on to the next page is only so
         it can be shown back to them, never a confirmation that it is real. */
      router.push(`/check-email?email=${encodeURIComponent(email.value.trim())}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'We could not reach the server. Check your connection and try again.',
      );
      setBusy(false);
    }
  }

  return (
    <AuthShell
      panel="recover"
      topRight={
        <>
          <span>Remembered it?</span>
          <Link className="btn btn-sm" href="/login">
            Back to sign in
          </Link>
        </>
      }
    >
      <div className="form-head rise d1">
        <h2>Forgot your password?</h2>
        <p className="sub">
          Enter the email address you signed up with and we will send you a link to set a new
          one.
        </p>
      </div>

      {error && (
        <div className="rise d2" style={{ marginBottom: 4 }}>
          <Notice tone="err" icon="alert">
            {error}
          </Notice>
        </div>
      )}

      <form className="rise d2" onSubmit={onSubmit} noValidate>
        <Field label="Email address" required error={email.error ?? undefined}>
          <div className="control">
            <TextInput
              id="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              placeholder="you@yourbusiness.ca"
              value={email.value}
              invalid={!!email.error}
              onChange={(e) => email.set(e.target.value)}
              onBlur={email.onBlur}
              autoFocus
            />
          </div>
        </Field>

        <SubmitButton busy={busy} busyLabel="Sending the link…">
          Send the reset link
        </SubmitButton>
      </form>

      <div className="rise d3" style={{ marginTop: 22 }}>
        <Notice icon="shield" title="Nothing in your books changes">
          Resetting a password does not touch your income, expenses, invoices or receipts. It only
          changes how you sign in.
        </Notice>
      </div>

      <p className="hint" style={{ textAlign: 'center', marginTop: 18 }}>
        <Link href="/login">
          <Icon name="arrowLeft" size={14} /> Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
