'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './icon';
import { useSession } from '@/lib/session';

/* The 15 minute idle logout.

   A shared or office machine left unattended is the real risk this exists for,
   which is why it applies to the browser and not to the phone apps. Both
   numbers come from the business record, so Settings can change them without
   a deploy.

   Three decisions worth knowing:

   Time is measured by comparing timestamps, never by counting down a timer.
   A laptop that sleeps for an hour stops firing intervals, and a countdown
   would resume as though no time had passed. Comparing clocks means waking up
   after the limit signs you out, which is the entire point.

   Activity is shared between tabs through localStorage. Without it, working in
   one tab would let another tab quietly sign you out from under you.

   The warning does not dismiss itself when you move the mouse. Moving a mouse
   is not the same as being there, and the whole promise of the screen is that
   one deliberate click keeps you in. */

/* Writing on every mousemove would hammer localStorage, and one second of
   resolution is plenty when the limit is measured in minutes. */
const THROTTLE_MS = 1000;
const ACTIVITY_KEY = 'vd_last_activity';
const EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'] as const;

function readShared(): number {
  try {
    const raw = window.localStorage.getItem(ACTIVITY_KEY);
    return raw ? Number(raw) : 0;
  } catch {
    /* Private mode or blocked storage. Fall back to this tab only. */
    return 0;
  }
}

function writeShared(at: number): void {
  try {
    window.localStorage.setItem(ACTIVITY_KEY, String(at));
  } catch {
    /* Nothing to do. The tab still tracks its own activity. */
  }
}

export function IdleGuard() {
  const { business, signOut } = useSession();

  const timeoutMs = (business?.idleTimeoutMinutes ?? 15) * 60_000;
  const warnMs = (business?.idleWarningSeconds ?? 60) * 1000;

  /* Zero until the first effect runs. Reading the clock during render is
     impure, and on a prerendered page it would bake in build time. */
  const lastActivity = useRef(0);
  const lastWrite = useRef(0);
  const endingRef = useRef(false);

  const [warning, setWarning] = useState(false);
  const [remaining, setRemaining] = useState(warnMs);

  const markActive = useCallback((at = Date.now()) => {
    lastActivity.current = at;
    if (at - lastWrite.current > THROTTLE_MS) {
      lastWrite.current = at;
      writeShared(at);
    }
  }, []);

  const staySignedIn = useCallback(() => {
    markActive();
    setWarning(false);
  }, [markActive]);

  /* Ends the session and stops there. RequireAuth notices the user has gone
     and decides where to send them, so there is only ever one navigation. */
  const endSession = useCallback(
    async (reason: 'idle' | 'user') => {
      if (endingRef.current) return;
      endingRef.current = true;
      await signOut(reason);
    },
    [signOut],
  );

  /* Listen for activity, in this tab and in the others. */
  useEffect(() => {
    /* The clock starts when the component mounts, not when it rendered. */
    if (lastActivity.current === 0) lastActivity.current = Date.now();

    const onActivity = () => markActive();
    for (const name of EVENTS) {
      window.addEventListener(name, onActivity, { passive: true });
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVITY_KEY && e.newValue) {
        lastActivity.current = Math.max(lastActivity.current, Number(e.newValue));
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      for (const name of EVENTS) window.removeEventListener(name, onActivity);
      window.removeEventListener('storage', onStorage);
    };
  }, [markActive]);

  /* One ticker decides everything, from the clock rather than from a count. */
  useEffect(() => {
    const tick = setInterval(() => {
      const newest = Math.max(lastActivity.current, readShared());
      lastActivity.current = newest;

      const idleFor = Date.now() - newest;
      const left = timeoutMs - idleFor;

      if (left <= 0) {
        void endSession('idle');
        return;
      }
      /* setState only from this callback, never while the effect is running. */
      setWarning(left <= warnMs);
      setRemaining(left);
    }, 1000);

    return () => clearInterval(tick);
  }, [timeoutMs, warnMs, endSession]);

  if (!warning) return null;

  const seconds = Math.max(0, Math.ceil(remaining / 1000));
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');

  /* The ring drains as the time does. 364.4 is the circumference at r=58. */
  const CIRC = 364.4;
  const offset = CIRC * (1 - Math.max(0, Math.min(1, remaining / warnMs)));

  return (
    <div className="scrim">
      <div
        className="card card-narrow text-centre rise d1"
        role="alertdialog"
        aria-labelledby="idle-title"
        aria-describedby="idle-desc"
      >
        <div className="ring">
          <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
            <circle cx="66" cy="66" r="58" fill="none" stroke="#e8eff7" strokeWidth="9" />
            <circle
              cx="66"
              cy="66"
              r="58"
              fill="none"
              stroke="#c11f24"
              strokeWidth="9"
              strokeLinecap="round"
              transform="rotate(-90 66 66)"
              strokeDasharray={CIRC}
              strokeDashoffset={offset}
            />
          </svg>
          <div className="ring-inner">
            <div className="countdown">
              {mm}:{ss}
            </div>
            <div className="ring-cap">remaining</div>
          </div>
        </div>

        <h2
          id="idle-title"
          style={{ fontFamily: 'var(--display)', fontSize: 'var(--fs-h1)', marginBottom: 12 }}
        >
          Still there?
        </h2>
        <p
          id="idle-desc"
          style={{
            fontSize: 'var(--fs-lead)',
            color: 'var(--ink-3)',
            lineHeight: 1.55,
            marginBottom: 8,
          }}
        >
          You have not done anything for a while, so we are about to sign you out.
        </p>
        <p style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-3)', marginBottom: 26 }}>
          If you are part way through something, choose <b>I am still here</b> and carry on
          where you were.
        </p>

        <button className="btn btn-primary btn-block" onClick={staySignedIn} autoFocus>
          I am still here, keep me signed in
        </button>
        <button
          className="btn btn-quiet btn-block"
          style={{ marginTop: 10 }}
          onClick={() => void endSession('user')}
        >
          Sign out now
        </button>

        <p className="hint" style={{ marginTop: 18 }}>
          <Icon name="shield" size={13} /> Anything you have already saved is safe either way.
        </p>
      </div>
    </div>
  );
}
