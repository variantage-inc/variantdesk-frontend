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

/* Two steps, not one long form. The mockup notes give the reason: long forms
   are where older users give up, and the second step exists only because the
   province genuinely changes how the product behaves. */

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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [province, setProvince] = useState('ON');

  const tax = findProvince(province);

  function goToStep2(e: React.FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!firstName.trim()) found.firstName = 'Enter your first name.';
    if (!lastName.trim()) found.lastName = 'Enter your last name.';
    if (!email.trim()) found.email = 'Enter your email address.';
    if (password.length < 10) found.password = 'Passwords must be at least 10 characters long.';
    setErrors(found);
    if (Object.keys(found).length === 0) {
      setStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setProblem(null);
    setBusy(true);

    try {
      setSession(await signUp({ firstName, lastName, email, password, businessName, province }));
      router.push('/signup/plan');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields) {
          setErrors(err.fields);
          /* An email problem belongs to step one, so send them back to the box
             that needs fixing rather than showing an error they cannot reach. */
          if (err.fields.email || err.fields.password) setStep(1);
        } else {
          setProblem(err.message);
          if (err.code === 'email_taken') setStep(1);
        }
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
            {problem}{' '}
            {problem.includes('already exists') && <Link href="/login">Sign in instead</Link>}
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
              <Field label="First name" required error={errors.firstName}>
                <TextInput
                  id="firstName"
                  autoComplete="given-name"
                  value={firstName}
                  invalid={!!errors.firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </Field>
              <Field label="Last name" required error={errors.lastName}>
                <TextInput
                  id="lastName"
                  autoComplete="family-name"
                  value={lastName}
                  invalid={!!errors.lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Email address"
              required
              error={errors.email}
              hint="This is what you will sign in with."
            >
              <div className="control">
                <TextInput
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  placeholder="you@yourbusiness.ca"
                  value={email}
                  invalid={!!errors.email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </Field>

            <Field label="Password" required error={errors.password}>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                placeholder="At least 10 characters"
                value={password}
                invalid={!!errors.password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <PasswordMeter value={password} />
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
              error={errors.businessName}
              hint="This is the name that appears on your invoices. You can change it later."
            >
              <TextInput
                id="businessName"
                autoComplete="organization"
                placeholder="For example, Maple Ridge Consulting"
                value={businessName}
                invalid={!!errors.businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                autoFocus
              />
            </Field>

            <Field label="Province or territory" required error={errors.province}>
              <Select
                id="province"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
              >
                {PROVINCES.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>

            {/* The rate updates as the province changes. It is the one thing on
                this screen that shows the product doing work for them. */}
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
