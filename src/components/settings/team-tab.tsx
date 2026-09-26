'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Field, Notice, TextInput } from '@/components/form';
import { Icon } from '@/components/icon';
import {
  ApiError,
  getTeam,
  inviteMember,
  removeMember,
  revokeInvite,
  type Team,
} from '@/lib/api';
import { useSession } from '@/lib/session';
import { formatDate, initials, price } from '@/lib/format';
import { email as emailRule } from '@/lib/validation';
import { useToast } from './toast';

/* The people on this account.

   The rules, and they come straight from the client's call: an owner plus at
   most two other people, at $5 a month each and free until the trial ends. The
   owner can remove either of them; neither can remove the owner.

   Nobody is ever emailed a password. The invitation is a single use link on
   which that person sets their own, which is the one part of the call worth
   pushing back on: a password sent by email sits in that inbox in plain text
   for as long as the account exists. The owner's experience is identical, they
   still just type an email address. */

/* The avatar circle from the topbar, which shell.css only defines inside
   .who. Repeated here rather than widened in the stylesheet, because that file
   is a verbatim copy of the approved mockup and is not ours to edit. */
const AVATAR: React.CSSProperties = {
  flex: '0 0 auto',
  width: 40,
  height: 40,
  borderRadius: '50%',
  display: 'grid',
  placeItems: 'center',
  fontSize: 15,
  fontWeight: 800,
  color: '#fff',
  background: 'var(--navy-600)',
};

export function TeamTab() {
  const { user, access } = useSession();
  const toast = useToast();

  const [team, setTeam] = useState<Team | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const owner = user?.role === 'OWNER';

  useEffect(() => {
    let cancelled = false;
    getTeam()
      .then((t) => !cancelled && setTeam(t))
      .catch(() => !cancelled && toast('We could not load your team.', 'err'));
    return () => {
      cancelled = true;
    };
  }, [toast]);

  /* Set when an invitation email could not be delivered: the link to pass on
     by hand, and who it is for. */
  const [manual, setManual] = useState<{ email: string; url: string } | null>(null);

  async function run(
    work: () => Promise<{ team: Team; emailed?: boolean; inviteUrl?: string | null }>,
    done: string,
    to?: string,
  ) {
    setBusy(true);
    try {
      const r = await work();
      setTeam(r.team);
      if (to && r.emailed === false && r.inviteUrl) {
        setManual({ email: to, url: r.inviteUrl });
        toast(`The email to ${to} could not be delivered. Copy the link below and send it yourself.`, 'err');
        return;
      }
      if (to) setManual(null);
      toast(done);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'That did not work. Try again.', 'err');
    } finally {
      setBusy(false);
    }
  }

  function send() {
    const problem = emailRule(email);
    if (problem) return setError(problem);
    setError(null);
    void run(() => inviteMember(email.trim()), `Invitation sent to ${email.trim()}.`, email.trim()).then(() =>
      setEmail(''),
    );
  }

  const spare = team ? Math.max(0, team.seatsPaid - team.seatsUsed) : 0;

  return (
    <section className="tabpane">
      <div className="setgrid">
        <div className="panel">
          <div className="chead">
            <div>
              <h2>Your team</h2>
              <p className="csub">
                You, plus up to {team?.maxExtraSeats ?? 2} other people who can work on the same
                set of books.
              </p>
            </div>
          </div>

          <div className="setbody">
            {!team && <p className="hint">Loading…</p>}

            {team && (
              <>
                <div className="setsec">
                  <h3>On the account</h3>
                  <p className="ssub">
                    Everyone here shares one set of books. Only you, as the owner, can change
                    the plan, the card or who is on the account.
                  </p>

                  <div className="rows">
                    {team.members.map((m) => (
                      <div key={m.id} className="rowitem">
                        <span style={AVATAR}>{initials(m.firstName, m.lastName)}</span>
                        <span className="nm">
                          {m.firstName} {m.lastName}
                          {m.id === user?.id && <span className="ct"> (you)</span>}
                          <br />
                          <span className="ct" style={{ fontWeight: 400 }}>
                            {m.email} ·{' '}
                            {m.signInMethod === 'google' ? 'signs in with Google' : 'password'}
                          </span>
                        </span>
                        {m.role === 'OWNER' ? (
                          <span className="tag tag-lock">
                            <Icon name="lock" size={13} /> Owner
                          </span>
                        ) : (
                          <>
                            <span className="ct">Member</span>
                            {owner &&
                              (confirming === m.id ? (
                                <>
                                  <button
                                    className="btn btn-sm btn-danger"
                                    type="button"
                                    disabled={busy}
                                    onClick={() => {
                                      setConfirming(null);
                                      void run(
                                        () => removeMember(m.id),
                                        `${m.firstName} has been removed.`,
                                      );
                                    }}
                                  >
                                    Yes, remove
                                  </button>
                                  <button
                                    className="btn btn-sm"
                                    type="button"
                                    onClick={() => setConfirming(null)}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  className="btn btn-sm"
                                  type="button"
                                  onClick={() => setConfirming(m.id)}
                                >
                                  Remove
                                </button>
                              ))}
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {confirming && (
                    <div style={{ marginTop: 14 }}>
                      <Notice tone="warn" icon="alert" title="They lose access immediately">
                        Every device they are signed in on is signed out. Nothing they entered
                        is deleted: their entries stay in the books, as the CRA requires.
                      </Notice>
                    </div>
                  )}
                </div>

                {team.invites.length > 0 && (
                  <div className="setsec">
                    <h3>Waiting to accept</h3>
                    <p className="ssub">
                      An invitation is good for seven days and can only be used once.
                    </p>
                    <div className="rows">
                      {team.invites.map((i) => (
                        <div key={i.id} className="rowitem">
                          <span className="nm">
                            {i.email}
                            <br />
                            <span className="ct" style={{ fontWeight: 400 }}>
                              {i.expired
                                ? 'Expired. Send it again.'
                                : `Expires ${formatDate(i.expiresAt)}`}
                            </span>
                          </span>
                          {owner && (
                            <>
                              <button
                                className="btn btn-sm"
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void run(() => inviteMember(i.email), `Sent again to ${i.email}.`, i.email)
                                }
                              >
                                Send again
                              </button>
                              <button
                                className="btn btn-sm"
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void run(() => revokeInvite(i.id), 'Invitation cancelled.')
                                }
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {owner && manual && (
                  <div className="setsec">
                    <Notice tone="warn" icon="mail" title={`The email to ${manual.email} did not go`}>
                      Send them this link yourself, by email or message. It works once, only for{' '}
                      {manual.email}, and expires in seven days.
                    </Notice>
                    <input
                      className="input"
                      readOnly
                      value={manual.url}
                      aria-label="Invitation link"
                      onFocus={(e) => e.target.select()}
                      style={{ fontSize: 13, height: 44, margin: '12px 0 10px' }}
                    />
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(manual.url)
                          .then(() => toast('Link copied.'))
                      }
                    >
                      <Icon name="send" size={17} /> Copy the link
                    </button>
                  </div>
                )}

                {owner && (
                  <div className="setsec">
                    <h3>Invite someone</h3>
                    <p className="ssub">
                      They get an email with a link on which they choose their own password.
                      Nothing reusable is ever sent.
                    </p>

                    {spare === 0 ? (
                      <Notice tone="warn" icon="alert" title="No spare seats">
                        You are paying for {team.seatsPaid}{' '}
                        {team.seatsPaid === 1 ? 'extra person' : 'extra people'} and{' '}
                        {team.seatsUsed === 0 ? 'none are' : `all ${team.seatsUsed} are`} taken.
                        Add a seat on <Link href="#billing">Plan and billing</Link> first.
                      </Notice>
                    ) : (
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <div style={{ flex: '1 1 auto' }}>
                          <Field label="Their email address" error={error ?? undefined}>
                            <TextInput
                              type="email"
                              inputMode="email"
                              placeholder="colleague@yourbusiness.ca"
                              value={email}
                              invalid={!!error}
                              onChange={(e) => setEmail(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  send();
                                }
                              }}
                            />
                          </Field>
                        </div>
                        <button
                          className="btn btn-primary"
                          type="button"
                          style={{ marginTop: 28 }}
                          disabled={busy || !email.trim()}
                          onClick={send}
                        >
                          <Icon name="mail" size={18} /> Send invitation
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="rail">
          {team && (
            <div className="prev">
              <h4>Seats</h4>
              <div className="big">
                {team.seatsUsed} / {team.seatsPaid}
              </div>
              <div className="then">
                {team.seatsPaid === 0
                  ? 'You have not added any extra people'
                  : `${spare} spare of ${team.seatsPaid} paid for`}
              </div>
              <div className="quote">
                <b>What a seat costs</b>
                <span>
                  {price(500)} a month each, up to {team.maxExtraSeats} people besides you.
                  {access?.state === 'trial' && ' Free until your trial ends.'}
                </span>
              </div>
            </div>
          )}

          <Notice icon="shield" title="Why a link and not a password">
            A password sent by email sits in that inbox in plain text for as long as the
            account exists, so anyone who ever reaches that mailbox reaches your books. The
            link works once, expires in seven days, and they choose their own password on it.
          </Notice>
          <Notice icon="info" title="What a member can and cannot do">
            They can record income, expenses, invoices and receipts, and read every report.
            They cannot change the plan, the card, the GST registration or who is on the
            account, and they cannot remove you.
          </Notice>
        </div>
      </div>
    </section>
  );
}
