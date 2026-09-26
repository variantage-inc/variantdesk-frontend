'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { Field, Notice, PasswordInput, PasswordMeter, SubmitButton, TextInput } from '@/components/form';
import { Icon } from '@/components/icon';
import { acceptInvite, ApiError, previewInvite } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useField, validateAll, applyServerErrors } from '@/lib/use-field';
import { password as passwordRule, personName } from '@/lib/validation';

/* Joining a business you have been invited to.

   The link in the email is the credential, so this page is reachable by anyone
   holding it. That is why the preview shows only the business name and the
   address it was sent to, and nothing else about the account.

   No password is ever emailed. The person invited chooses their own here, on a
   link that works once and expires in seven days. */

function AcceptForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setSession } = useSession();
  const token = params.get('token') ?? '';

  const [invite, setInvite] = useState<{ email: string; businessName: string } | null>(null);
  /* A link with no code at all is decided during render, not in an effect.
     Whether the token is there is known the moment the URL is read, so there
     is nothing to synchronise and nothing to wait for. */
  const [problem, setProblem] = useState<string | null>(
    token ? null : 'That link is missing its code. Open the one in your email again.',
  );
  const [checking, setChecking] = useState(Boolean(token));
  const [busy, setBusy] = useState(false);

  const firstName = useField('', personName('first name'));
  const lastName = useField('', personName('last name'));
  const password = useField('', passwordRule);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    previewInvite(token)
      .then((r) => !cancelled && setInvite(r))
      .catch((err) => {
        if (cancelled) return;
        setProblem(
          err instanceof ApiError
            ? err.message
            : 'We could not check that invitation. Try again in a moment.',
        );
      })
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateAll([firstName, lastName, password])) return;

    setBusy(true);
    setProblem(null);
    try {
      setSession(
        await acceptInvite(token, {
          firstName: firstName.value.trim(),
          lastName: lastName.value.trim(),
          password: password.value,
        }),
      );
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        applyServerErrors({ firstName, lastName, password }, err.fields);
        if (!err.fields) setProblem(err.message);
      } else {
        setProblem('We could not reach the server. Check your connection and try again.');
      }
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <AuthShell panel="signup">
        <p className="hint">Checking your invitation…</p>
      </AuthShell>
    );
  }

  if (!invite) {
    return (
      <AuthShell panel="signup">
        <div className="form-head rise d1">
          <h2>This invitation cannot be used</h2>
          <p className="sub">{problem}</p>
        </div>
        <div className="rise d2">
          <Notice icon="info" title="What to do next">
            Ask whoever invited you to send it again. Invitations last seven days and can only
            be used once, so an old email will not work a second time.
          </Notice>
        </div>
        <Link className="btn btn-block" href="/login" style={{ marginTop: 18 }}>
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell panel="signup">
      <div className="form-head rise d1">
        <h2>Join {invite.businessName}</h2>
        <p className="sub">
          Choose a password and you are in. You will be working on the same books as everyone
          else on the account.
        </p>
      </div>

      {problem && (
        <div className="rise d2" style={{ marginBottom: 4 }}>
          <Notice tone="err" icon="alert">
            {problem}
          </Notice>
        </div>
      )}

      <div className="rise d2">
        <Notice icon="mail" title="Your sign in address">
          {invite.email}
        </Notice>
      </div>

      <form className="rise d3" onSubmit={onSubmit} noValidate>
        <div className="field-row">
          <Field label="First name" required error={firstName.error ?? undefined}>
            <TextInput
              autoComplete="given-name"
              placeholder="Sarah"
              value={firstName.value}
              invalid={!!firstName.error}
              onChange={(e) => firstName.set(e.target.value)}
              onBlur={firstName.onBlur}
            />
          </Field>
          <Field label="Last name" required error={lastName.error ?? undefined}>
            <TextInput
              autoComplete="family-name"
              placeholder="Whitfield"
              value={lastName.value}
              invalid={!!lastName.error}
              onChange={(e) => lastName.set(e.target.value)}
              onBlur={lastName.onBlur}
            />
          </Field>
        </div>

        <Field label="Choose a password" required error={password.error ?? undefined}>
          <PasswordInput
            autoComplete="new-password"
            placeholder="At least 10 characters"
            value={password.value}
            invalid={!!password.error}
            onChange={(e) => password.set(e.target.value)}
            onBlur={password.onBlur}
          />
        </Field>
        <PasswordMeter value={password.value} />

        <div style={{ marginTop: 22 }}>
          <SubmitButton busy={busy} busyLabel="Setting up your account…">
            Join {invite.businessName}
          </SubmitButton>
        </div>
      </form>

      <p className="hint" style={{ marginTop: 18 }}>
        <Icon name="shield" size={13} /> Nobody at Variantage, and nobody who invited you, ever
        sees this password.
      </p>
    </AuthShell>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptForm />
    </Suspense>
  );
}
