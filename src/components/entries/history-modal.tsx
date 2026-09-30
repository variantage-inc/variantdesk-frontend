'use client';

import { useEffect, useState } from 'react';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';
import { ApiError, entryHistory, type EntryHistory } from '@/lib/api';
import { formatDateTime, money } from '@/lib/format';
import { ChangeList } from './change-list';

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
        className="hist rise d1"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hist-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hist-head">
          <div>
            <h2 id="hist-title">What changed</h2>
            <p className="sub">Every version of this entry, oldest first.</p>
          </div>
          <button className="x" onClick={onClose} aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="hist-body">
          {problem && (
            <Notice tone="err" icon="alert">
              {problem}
            </Notice>
          )}

          {!data && !problem && <p className="hint">Loading…</p>}

          {data?.removed && (
            <div style={{ marginBottom: 16 }}>
              <Notice tone="warn" icon="trash" title="This entry has been removed">
                {data.removed.by} removed it on {formatDateTime(data.removed.at)}. It is off
                your figures, and still here.
              </Notice>
            </div>
          )}

          {versions.length === 1 && !data?.removed && (
            <p className="hint" style={{ margin: '0 0 14px' }}>
              Never changed. It reads exactly as it was written.
            </p>
          )}

          <ol className="tl">
            {versions.map((v, i) => (
              <li key={v.id} className={`tl-item${v.current ? ' now' : ''}`}>
                <span className="tl-dot" aria-hidden="true" />
                <div className="tl-top">
                  <span className="tl-title">{i === 0 ? 'As entered' : `Correction ${i}`}</span>
                  {v.current && <span className="tl-now">Current</span>}
                  <span className="tl-amt">{money(v.totalCents, currency)}</span>
                </div>
                <div className="tl-meta">
                  {v.by} · {formatDateTime(v.at)}
                </div>

                {/* The first version has nothing before it to differ from, so it
                    shows what it said rather than what it changed. */}
                {i === 0 ? (
                  <div className="tl-note">
                    {v.description}
                    {v.category && ` · ${v.category}`}
                    {v.party && ` · ${v.party}`}
                  </div>
                ) : (
                  <ChangeList changes={v.changed} />
                )}
              </li>
            ))}
          </ol>
        </div>

        {/* Correcting writes a new version and cancels the old one, so the books
            can be shown as they stood on any day: the CRA's six year rule. */}
        <div className="hist-foot">
          <Icon name="shield" size={15} />
          <span>Nothing is overwritten. Every version is kept.</span>
          <button className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
