'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import {
  Field,
  Notice,
  PasswordInput,
  PasswordMeter,
  Select,
  SubmitButton,
  TextInput,
} from '@/components/form';
import { GoogleMark, Icon } from '@/components/icon';
import { ApiError, googleSignInUrl, signUp } from '@/lib/api';
import { useSession } from '@/lib/session';
import { PROVINCES, findProvince } from '@/lib/tax';
import * as v from '@/lib/validation';
import { applyServerErrors, useField, validateAll } from '@/lib/use-field';

/* Two steps, not one long form. The mockup notes give the reason: long forms
   are where older users give up, and the second step exists only because the
   province genuinely changes how the product behaves.

   Step one will not let you past until it is actually valid. Letting someone
   fill in a whole form and only then telling them the email was malformed is
   how people abandon signup. */

const firstNameRule = v.personName('first name');
const lastNameRule = v.personName('last name');

function Steps({ current }: { current: 1 | 2 }) {
  const labels = ['Your details', 'Your business', 'Choose a plan'] as const;
  return (
    <div className="steps rise d1">
      {labels.map((label, i) => {
        const n = i + 1;
        const state = n === current ? 'is-on' : n < current ? 'is-done' : '';
        return (
          <div key={label} style={{ display: 'contents' }}>
            <div className={`step ${state}`}>
              <span className="no">{n < current ? <Icon name="check" size={15} sw={3} /> : n}</span>
              <span className="nm">{label}</span>
            </div>
            {n < labels.length && <span className="step-line" />}
          </div>
        );
      })}
    </div>
  );
}

export default function SignupPage() {
  const router = useRouter();
  const { setSession } = useSession();

  const [step, setStep] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const firstName = useField('', firstNameRule);
  const lastName = useField('', lastNameRule);
  const email = useField('', v.email);
  const password = useField('', v.password);
  const businessName = useField('', v.businessName);

  const [province, setProvince] = useState('ON');
  const tax = findProvince(province);

  const byName = { firstName, lastName, email, password, businessName };

  function goToStep2(e: React.FormEvent) {
    e.preventDefault();
    if (!validateAll([firstName, lastName, email, password])) return;
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProblem(null);
    if (!validateAll([businessName])) return;

    setBusy(true);
    try {
      setSession(
        await signUp({
          firstName: firstName.value.trim(),
          lastName: lastName.value.trim(),
          email: email.value.trim(),
          password: password.value,
          businessName: businessName.value.trim(),
          province,
        }),
      );
      router.push('/signup/plan');
    } catch (err) {
      if (err instanceof ApiError) {
        applyServerErrors(byName, err.fields);
        if (!err.fields) setProblem(err.message);
        /* Send them back to the step that holds the broken field, or they
           will be looking at an error they cannot see. */
        const onStepOne =
          err.code === 'email_taken' ||
          Boolean(err.fields?.email ?? err.fields?.password ?? err.fields?.firstName ?? err.fields?.lastName);
        if (onStepOne) setStep(1);
      } else {
        setProblem('We could not reach the server. Check your connection and try again.');
      }
      setBusy(false);
    }
  }

  return (
    <AuthShell
      panel="signup"
      topRight={
        <>
          <span>Already have an account?</span>
          <Link className="btn btn-sm" href="/login">
            Sign in
          </Link>
        </>
      }
    >
      <Steps current={step} />

      {problem && (
        <div style={{ marginBottom: 4 }}>
          <Notice tone="err" icon="alert">
            {problem} {problem.includes('already exists') && <Link href="/login">Sign in instead</Link>}
          </Notice>
        </div>
      )}

      {step === 1 && (
        <section>
          <div className="form-head rise d2">
            <h2>Create your account</h2>
            <p className="sub">Two short steps. Nothing is charged today.</p>
          </div>

          <div className="rise d2">
            <a className="btn btn-oauth" href={googleSignInUrl()}>
              <GoogleMark />
              Continue with Google
            </a>
          </div>

          <div className="or rise d2">
            <span>or use your email</span>
          </div>

          <form className="rise d3" onSubmit={goToStep2} noValidate>
            <div className="field-row">
              <Field label="First name" required error={firstName.error ?? undefined}>
                <TextInput
                  id="firstName"
                  autoComplete="given-name"
                  value={firstName.value}
                  invalid={!!firstName.error}
                  onChange={(e) => firstName.set(e.target.value)}
                  onBlur={firstName.onBlur}
                />
              </Field>
              <Field label="Last name" required error={lastName.error ?? undefined}>
                <TextInput
                  id="lastName"
                  autoComplete="family-name"
                  value={lastName.value}
                  invalid={!!lastName.error}
                  onChange={(e) => lastName.set(e.target.value)}
                  onBlur={lastName.onBlur}
                />
              </Field>
            </div>

            <Field
              label="Email address"
              required
              error={email.error ?? undefined}
              hint="This is what you will sign in with."
            >
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
                />
              </div>
            </Field>

            <Field label="Password" required error={password.error ?? undefined}>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                placeholder="At least 10 characters"
                value={password.value}
                invalid={!!password.error}
                onChange={(e) => password.set(e.target.value)}
                onBlur={password.onBlur}
              />
              <PasswordMeter value={password.value} />
            </Field>

            <button className="btn btn-primary btn-block" type="submit" style={{ marginTop: 8 }}>
              Continue <Icon name="arrowRight" size={19} />
            </button>
          </form>
        </section>
      )}

      {step === 2 && (
        <section>
          <div className="form-head">
            <h2>Tell us about your business</h2>
            <p className="sub">
              Your province decides your sales tax rate. We set it up so you never have to.
            </p>
          </div>

          <form onSubmit={onSubmit} noValidate>
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

            <Notice tone="ok" icon="clock" title="14 days free, and nothing is charged today">
              You get everything for two weeks. We ask for a card on the next screen so your
              account keeps working when the trial ends, but it is not charged until then.
            </Notice>

            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button
                className="btn"
                type="button"
                onClick={() => setStep(1)}
                style={{ flex: '0 0 auto' }}
              >
                <Icon name="arrowLeft" size={18} /> Back
              </button>
              <div style={{ flex: 1 }}>
                <SubmitButton busy={busy} busyLabel="Creating your account…">
                  Create account
                </SubmitButton>
              </div>
            </div>

            <p className="hint" style={{ textAlign: 'center', marginTop: 16 }}>
              By creating an account you agree to our <Link href="/terms">Terms</Link> and{' '}
              <Link href="/privacy">Privacy Policy</Link>.
            </p>
          </form>
        </section>
      )}
    </AuthShell>
  );
}
