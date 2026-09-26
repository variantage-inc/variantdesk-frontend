'use client';

import { useEffect, useState } from 'react';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';
import { ApiError, entryHistory, type EntryHistory } from '@/lib/api';
import { formatDateTime, money } from '@/lib/format';

/* Every version this entry has had.

   The question this answers is the one that actually arrives: "this says
   1,500 and the receipt says 1,200, what happened". The answer is almost never
   that the software is wrong. Somebody corrected it, and until now there was
   no way to see that from the screen the figure is on.

   Only the fields that moved are listed. Repeating all ten every time would
   bury the one line the reader is looking for. */

export function HistoryModal({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const [data, setData] = useState<EntryHistory | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    entryHistory(entryId)
      .then((r) => !cancelled && setData(r))
      .catch((err) => {
        if (!cancelled) {
          setProblem(err instanceof ApiError ? err.message : 'We could not load the history.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const currency = data?.currency ?? 'CAD';
  const versions = data?.versions ?? [];

  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="card rise d1"
        style={{ maxWidth: 640, textAlign: 'left' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hist-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <h2
              id="hist-title"
              style={{ fontFamily: 'var(--display)', fontSize: 'var(--fs-h1)' }}
            >
              What changed
            </h2>
            <p className="sub" style={{ margin: '6px 0 0', color: 'var(--ink-3)' }}>
              Every version of this entry, oldest first. Nothing is ever overwritten.
            </p>
          </div>
          <button className="x" onClick={onClose} aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>

        {problem && (
          <div style={{ marginTop: 18 }}>
            <Notice tone="err" icon="alert">
              {problem}
            </Notice>
          </div>
        )}

        {!data && !problem && (
          <p className="hint" style={{ marginTop: 20 }}>
            Loading…
          </p>
        )}

        {data?.removed && (
          <div style={{ margin: '18px 0 0' }}>
            <Notice tone="warn" icon="trash" title="This entry has been removed">
              {data.removed.by} removed it on {formatDateTime(data.removed.at)}. It is off your
              figures, and still here.
            </Notice>
          </div>
        )}

        {versions.length === 1 && !data?.removed && (
          <div style={{ margin: '18px 0 0' }}>
            <Notice tone="ok" icon="check" title="This entry has never been changed">
              It reads exactly as it was written.
            </Notice>
          </div>
        )}

        <div style={{ marginTop: 22, display: 'grid', gap: 14 }}>
          {versions.map((v, i) => (
            <div
              key={v.id}
              className="rowitem"
              style={{
                display: 'block',
                borderColor: v.current ? 'var(--navy-700)' : undefined,
                background: v.current ? 'var(--blue-50)' : undefined,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginBottom: v.changed.length ? 10 : 0,
                }}
              >
                <b style={{ fontSize: 'var(--fs-label)' }}>
                  {i === 0 ? 'As entered' : `Correction ${i}`}
                </b>
                <span
                  style={{
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 700,
                    marginLeft: 'auto',
                  }}
                >
                  {money(v.totalCents, currency)}
                </span>
                {v.current && <span className="tag tag-lock">Current</span>}
              </div>

              <div className="ct" style={{ fontWeight: 400 }}>
                {v.by} · {formatDateTime(v.at)}
              </div>

              {/* The first version has nothing before it to differ from, so it
                  shows what it said rather than what it changed. */}
              {i === 0 ? (
                <p className="hint" style={{ margin: '8px 0 0' }}>
                  {v.description}
                  {v.category && ` · ${v.category}`}
                  {v.party && ` · ${v.party}`}
                </p>
              ) : (
                <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0, display: 'grid', gap: 6 }}>
                  {v.changed.map((c) => (
                    <li key={c.field} style={{ fontSize: 'var(--fs-tiny)', lineHeight: 1.5 }}>
                      <b>{c.field}</b>{' '}
                      <span
                        className="muted"
                        style={{ textDecoration: 'line-through', opacity: 0.75 }}
                      >
                        {c.from}
                      </span>{' '}
                      <Icon name="arrowRight" size={12} /> <b>{c.to}</b>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 22 }}>
          <Notice icon="shield" title="Why every version is kept">
            Correcting an entry writes a new version and cancels the old one, rather than
            overwriting it. The books can be shown as they stood on any day, which is what the
            CRA&apos;s six year rule asks for, and it means a figure that has moved can always
            be explained.
          </Notice>
        </div>

        <button className="btn btn-block" style={{ marginTop: 18 }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
