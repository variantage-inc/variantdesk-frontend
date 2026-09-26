'use client';

import { useId, useState } from 'react';
import { Icon } from './icon';

/* Form primitives, matching the mockups exactly.

   Three rules are baked in rather than left to each screen to remember, because
   the mockups were tuned for owners aged 50 and up:
     labels are always visible, never a placeholder standing in for one
     errors sit under the field that caused them, in plain English
     controls are 56px tall, which comes from the foundation stylesheet */

export function Field({
  label,
  error,
  hint,
  required,
  action,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={`field${error ? ' is-error' : ''}`}>
      {action ? (
        <div className="label-row">
          <span className="label">
            {label}{' '}
            {required && (
              <span className="req" aria-hidden="true">
                *
              </span>
            )}
          </span>
          {action}
        </div>
      ) : (
        <span className="label">
          {label}{' '}
          {required && (
            <span className="req" aria-hidden="true">
              *
            </span>
          )}
        </span>
      )}

      {children}

      {/* role=alert so a screen reader announces the problem, not just sighted
          users. The element is always rendered so nothing shifts when it fills. */}
      {error && (
        <p className="err-msg" role="alert">
          <Icon name="alert" size={15} />
          <span>{error}</span>
        </p>
      )}
      {hint && !error && <p className="hint">{hint}</p>}
    </div>
  );
}

/* ComponentPropsWithRef rather than InputHTMLAttributes, so a caller can hold
   a ref to the box and focus it. React 19 passes ref through as an ordinary
   prop; the types need telling. */
export function TextInput({
  invalid,
  ...props
}: React.ComponentPropsWithRef<'input'> & { invalid?: boolean }) {
  return <input className="input" aria-invalid={invalid ? 'true' : undefined} {...props} />;
}

export function Select({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className="select" {...props}>
      {children}
    </select>
  );
}

/* Show and hide on the password, as the mockups have it. Typing a password you
   cannot see is the most common cause of a failed sign in. */
export function PasswordInput({
  invalid,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  const [shown, setShown] = useState(false);
  const id = useId();

  return (
    <div className="control">
      <input
        className="input has-affix"
        id={props.id ?? id}
        type={shown ? 'text' : 'password'}
        aria-invalid={invalid ? 'true' : undefined}
        {...props}
      />
      <button
        type="button"
        className="affix"
        onClick={() => setShown((s) => !s)}
        aria-label={shown ? 'Hide password' : 'Show password'}
      >
        {shown ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

/* The strength meter and its four rules, scored exactly as auth.js does it so
   the behaviour the client reviewed is the behaviour they get. */
export function PasswordMeter({ value }: { value: string }) {
  const tests = [
    value.length >= 10,
    /[A-Z]/.test(value) && /[a-z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z0-9]/.test(value),
  ];

  let score = tests.filter(Boolean).length;
  if (value.length > 0 && value.length < 8) score = Math.min(score, 1);
  if (value.length === 0) score = 0;

  const words = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const rules = [
    '10 characters or more',
    'A capital and a small letter',
    'At least one number',
    'At least one symbol, such as ! or #',
  ];

  return (
    <>
      <div className="meter" data-score={score}>
        <div className="meter-track">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="meter-label">
          {value ? (
            <>
              Password strength: <b>{words[score]}</b>
            </>
          ) : (
            'Use at least 10 characters.'
          )}
        </div>
      </div>
      <ul className="rules">
        {rules.map((rule, i) => (
          <li key={rule} className={tests[i] ? 'ok' : undefined}>
            <span className="rd">{tests[i] && <Icon name="check" size={12} sw={3.4} />}</span> {rule}
          </li>
        ))}
      </ul>
    </>
  );
}

export function Notice({
  tone = 'info',
  icon = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'ok' | 'warn' | 'err' | 'draw';
  icon?: React.ComponentProps<typeof Icon>['name'];
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`notice notice-${tone}`}>
      <Icon name={icon} size={22} />
      <span>
        {title && <b>{title}</b>}
        {children}
      </span>
    </div>
  );
}

/* Disabled while submitting, with the label saying so. Without it the natural
   response to a slow network is to press the button again, which is how people
   end up signed up twice. */
export function SubmitButton({
  busy,
  children,
  busyLabel = 'One moment…',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; busyLabel?: string }) {
  return (
    <button
      className="btn btn-primary btn-block"
      type="submit"
      disabled={busy}
      aria-busy={busy}
      {...props}
    >
      {busy ? busyLabel : children}
    </button>
  );
}
