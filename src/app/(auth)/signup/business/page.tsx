'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { Field, Notice, Select, SubmitButton, TextInput } from '@/components/form';
import { ApiError, completeGoogleSignup } from '@/lib/api';
import { useSession } from '@/lib/session';
import { PROVINCES, findProvince } from '@/lib/tax';
import * as v from '@/lib/validation';
import { applyServerErrors, useField, validateAll } from '@/lib/use-field';

/* The second half of a Google signup.

   Not in the approved mockups, and it has to exist. Google tells us a name and
   an email, which is not a business. Without a province there is no tax rate,
   so every invoice the account ever sent would carry the wrong one. Two
   fields, once, and then they are in. */

function BusinessStep() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const { setSession } = useSession();

  const businessName = useField('', v.businessName);
  const [province, setProvince] = useState('ON');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const tax = findProvince(province);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProblem(null);
    if (!validateAll([businessName])) return;

    setBusy(true);
    try {
      setSession(
        await completeGoogleSignup({
          token,
          businessName: businessName.value.trim(),
          province,
        }),
      );
      router.push('/signup/plan');
    } catch (err) {
      if (err instanceof ApiError) {
        applyServerErrors({ businessName }, err.fields);
        if (!err.fields) setProblem(err.message);
      } else {
        setProblem('We could not reach the server. Check your connection and try again.');
      }
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell panel="signup">
        <div className="form-head rise d1">
          <h2>Let us start again</h2>
          <p className="sub">
            This step needs to be opened straight after signing in with Google, and that link has
            expired.
          </p>
        </div>
        <Link className="btn btn-primary btn-block" href="/signup">
          Back to sign up
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell panel="signup">
      <div className="form-head rise d1">
        <h2>One thing about your business</h2>
        <p className="sub">
          Google told us who you are. We just need to know where you trade, because that decides
          your sales tax rate.
        </p>
      </div>

      {problem && (
        <div style={{ marginBottom: 4 }}>
          <Notice tone="err" icon="alert">
            {problem} <Link href="/login">Sign in instead</Link>
          </Notice>
        </div>
      )}

      <form className="rise d2" onSubmit={onSubmit} noValidate>
        <Field
          label="Business name"
          required
          error={businessName.error ?? undefined}
          hint="This is the name that appears on your invoices. You can change it later."
        >
          <TextInput
            id="businessName"
            autoComplete="organization"
            placeholder="For example, Maple Ridge Consulting"
            value={businessName.value}
            invalid={!!businessName.error}
            onChange={(e) => businessName.set(e.target.value)}
            onBlur={businessName.onBlur}
            autoFocus
          />
        </Field>

        <Field label="Province or territory" required>
          <Select id="province" value={province} onChange={(e) => setProvince(e.target.value)}>
            {PROVINCES.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        {tax && (
          <Notice icon="shield" title={`${tax.name}, ${tax.rate}`}>
            {tax.note}
          </Notice>
        )}

        <SubmitButton busy={busy} busyLabel="Setting things up…">
          Continue
        </SubmitButton>
      </form>
    </AuthShell>
  );
}

export default function SignupBusinessPage() {
  return (
    <Suspense fallback={null}>
      <BusinessStep />
    </Suspense>
  );
}
