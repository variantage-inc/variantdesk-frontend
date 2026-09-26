'use client';

import { useEffect, useState } from 'react';
import { Field, Notice, PasswordMeter, PasswordInput, Select } from '@/components/form';
import { Icon } from '@/components/icon';
import {
  ApiError,
  changePassword,
  listSessions,
  revokeOtherSessions,
  revokeSession,
  saveSecurity,
  type ActiveSession,
  type SettingsPayload,
} from '@/lib/api';
import { useSession } from '@/lib/session';
import { describeDevice, formatDateTime } from '@/lib/format';
import { password as passwordRule } from '@/lib/validation';
import { useDraft } from './use-draft';
import { useSaveBar } from './save-bar';
import { useToast } from './toast';

/* Security: the password, how long the browser waits before signing you out,
   and where you are currently signed in.

   Two doors to one endpoint. Somebody with a password gives the current one.
   Somebody who signed up through Google has none, so there is nothing to ask
   for and the heading says Set rather than Change. Until now their only route
   was Forgot password, which is odd wording for a person who never had one. */

const TIMEOUTS = [5, 10, 15, 30, 60];
const WARNINGS = [30, 60, 120];

type Form = { idleTimeoutMinutes: number; idleWarningSeconds: number };

export function SecurityTab({
  data,
  onSaved,
}: {
  data: SettingsPayload;
  onSaved: (payload: SettingsPayload) => void;
}) {
  const { user } = useSession();
  const toast = useToast();
  const owner = user?.role === 'OWNER';
  /* No password on the account means it was created through Google, and there
     is nothing to ask for the current one. */
  const hasPassword = user?.hasPassword !== false;

  const draft = useDraft<Form>({
    idleTimeoutMinutes: data.business.idleTimeoutMinutes,
    idleWarningSeconds: data.business.idleWarningSeconds,
  });

  const [saving, setSaving] = useState(false);

  async function saveTimeout() {
    setSaving(true);
    try {
      const payload = await saveSecurity(draft.value);
      draft.commit(draft.value);
      onSaved(payload);
      toast('Your sign out settings have been saved.');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'That did not work.', 'err');
    } finally {
      setSaving(false);
    }
  }

  useSaveBar(owner && draft.dirty, saving, () => void saveTimeout(), draft.reset);

  const v = draft.value;

  return (
    <section className="tabpane">
      <div className="setgrid">
        <div className="panel">
          <div className="chead">
            <div>
              <h2>Security</h2>
              <p className="csub">
                Your password, how long the web application waits before signing you out, and
                where you are currently signed in.
              </p>
            </div>
          </div>

          <div className="setbody">
            <PasswordSection hasPassword={hasPassword} />

            <div className="setsec">
              <h3>Automatic sign out</h3>
              <p className="ssub">
                The web application signs you out after a period of no activity. This is the
                setting behind the countdown warning.
              </p>

              <div className="field-row">
                <Field label="Sign me out after">
                  <Select
                    value={v.idleTimeoutMinutes}
                    disabled={!owner}
                    onChange={(e) => draft.set('idleTimeoutMinutes', Number(e.target.value))}
                  >
                    {TIMEOUTS.map((m) => (
                      <option key={m} value={m}>
                        {m === 60 ? '1 hour' : `${m} minutes`}
                        {m === 15 ? ', recommended' : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Warn me before"
                  hint="The warning has a button to stay signed in, so you are never dropped mid invoice."
                >
                  <Select
                    value={v.idleWarningSeconds}
                    disabled={!owner}
                    onChange={(e) => draft.set('idleWarningSeconds', Number(e.target.value))}
                  >
                    {WARNINGS.map((s) => (
                      <option key={s} value={s}>
                        {s === 120 ? '2 minutes ahead' : `${s} seconds ahead`}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Notice icon="clock" title="Web only. Your phone behaves differently">
                On this browser you are signed out after {v.idleTimeoutMinutes} minutes of no
                activity, warned {v.idleWarningSeconds} seconds beforehand. On the phone apps
                you stay signed in until you log out yourself, protected by fingerprint, face
                or a PIN when the app is reopened.
              </Notice>

              {!owner && (
                <p className="hint" style={{ marginTop: 12 }}>
                  Only the account owner can change this, because it applies to everyone on the
                  account.
                </p>
              )}
            </div>

            <SessionsSection />
          </div>
        </div>

        <div className="rail">
          <Notice icon="lock" title="Why 15 minutes is the default">
            A shared or office machine left unattended is the real risk this exists for. It is
            a setting rather than a rule, so a business working alone in a locked office can
            move it to 30 or 60.
          </Notice>
        </div>
      </div>
    </section>
  );
}

function PasswordSection({ hasPassword }: { hasPassword: boolean }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordRule(next);
    if (problem) return setError(problem);
    setError(null);
    setBusy(true);
    try {
      const r = await changePassword({
        currentPassword: hasPassword ? current : undefined,
        password: next,
      });
      setCurrent('');
      setNext('');
      toast(r.message);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.fields?.password ?? err.message);
      } else {
        setError('We could not reach the server.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="setsec" onSubmit={submit} noValidate>
      <h3>{hasPassword ? 'Change your password' : 'Set a password'}</h3>
      <p className="ssub">
        {hasPassword
          ? 'You can do this here without going through the email link.'
          : 'Your account signs in with Google. Setting a password means you can do either.'}
      </p>

      {hasPassword && (
        <Field label="Current password">
          <PasswordInput
            autoComplete="current-password"
            placeholder="The one you use now"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
      )}

      <Field label="New password" error={error ?? undefined}>
        <PasswordInput
          autoComplete="new-password"
          placeholder="At least 10 characters"
          value={next}
          invalid={!!error}
          onChange={(e) => setNext(e.target.value)}
        />
      </Field>
      <PasswordMeter value={next} />

      <div style={{ marginTop: 22 }}>
        <Notice tone="warn" icon="shield" title="Changing it signs you out everywhere else">
          The web application and both phone apps. You will need to sign in again on your
          phone. Nothing in your books changes.
        </Notice>
      </div>

      <button
        className="btn btn-primary"
        type="submit"
        style={{ marginTop: 18 }}
        disabled={busy || !next}
        aria-busy={busy}
      >
        {busy ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
      </button>
    </form>
  );
}

function SessionsSection() {
  const toast = useToast();
  const [sessions, setSessions] = useState<ActiveSession[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listSessions()
      .then((r) => !cancelled && setSessions(r.sessions))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(work: () => Promise<{ sessions: ActiveSession[] }>, done: string) {
    setBusy(true);
    try {
      const r = await work();
      setSessions(r.sessions);
      toast(done);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'That did not work.', 'err');
    } finally {
      setBusy(false);
    }
  }

  const others = (sessions ?? []).filter((s) => !s.current);

  return (
    <div className="setsec">
      <h3>Where you are signed in</h3>
      <p className="ssub">
        Sign out anything you do not recognise. It takes effect immediately.
      </p>

      {!sessions && <p className="hint">Loading…</p>}

      {sessions?.map((s) => (
        <div key={s.id} className={`sess${s.current ? ' now' : ''}`}>
          <span className="ic">
            <Icon name={s.current ? 'grid' : 'user'} size={19} />
          </span>
          <span>
            <b>{describeDevice(s.userAgent)}</b>
            <span>
              {s.current ? 'This device · active now' : `Last active ${formatDateTime(s.lastSeenAt)}`}
              {!s.remembered && ' · until the browser closes'}
            </span>
          </span>
          {s.current ? (
            <span className="chip chip-opt">Current</span>
          ) : (
            <button
              className="btn btn-sm"
              type="button"
              disabled={busy}
              onClick={() => void run(() => revokeSession(s.id), 'That device has been signed out.')}
            >
              Sign out
            </button>
          )}
        </div>
      ))}

      {others.length > 0 && (
        <button
          className="btn btn-sm"
          type="button"
          style={{ marginTop: 6 }}
          disabled={busy}
          onClick={() =>
            void run(
              async () => {
                const r = await revokeOtherSessions();
                return { sessions: r.sessions };
              },
              'Everywhere else has been signed out.',
            )
          }
        >
          Sign out everywhere else
        </button>
      )}

      {sessions && others.length === 0 && (
        <p className="hint" style={{ marginTop: 10 }}>
          This is the only place you are signed in.
        </p>
      )}
    </div>
  );
}
