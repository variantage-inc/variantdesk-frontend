'use client';

import { useEffect, useState } from 'react';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';
import { ChangeList } from './change-list';
import { ApiError, listActivity, type Activity } from '@/lib/api';
import { formatDate, formatDateTime, money } from '@/lib/format';
import type { Range } from '@/lib/period';

/* Everything that changed in this period, newest first.

   The per entry history answers "why does this row say that". This answers the
   harder one: a total has moved and nobody knows why. Without it, a removed
   entry is unreachable from any screen, because there is no row left to click.

   Read from the reversal rows in the ledger rather than from a separate audit
   table. An audit table is a second copy of the truth, and a second copy is
   something that can drift out of step with the money it describes. */

export function ChangesDrawer({ range, onClose }: { range: Range; onClose: () => void }) {
  const [data, setData] = useState<Activity | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    listActivity({ from: range.from, to: range.to, page })
      .then((r) => !cancelled && setData(r))
      .catch((err) => {
        if (!cancelled) {
          setProblem(err instanceof ApiError ? err.message : 'We could not load the changes.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, page]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const currency = data?.currency ?? 'CAD';
  const rows = data?.entries ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;

  return (
    <>
      <div className="drawer-scrim open" onClick={onClose} />
      <aside className="drawer open" role="dialog" aria-modal="true" aria-labelledby="ch-title">
        <div className="drawer-head">
          <div>
            <h2 id="ch-title">What has changed</h2>
            <p className="sub">
              Corrections and removals between {formatDate(range.from)} and{' '}
              {formatDate(range.to)}
            </p>
          </div>
          <button className="x" onClick={onClose} aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="drawer-body">
          {problem && (
            <Notice tone="err" icon="alert">
              {problem}
            </Notice>
          )}

          {!data && !problem && <p className="hint">Loading…</p>}

          {data && rows.length === 0 && (
            <Notice tone="ok" icon="check" title="Nothing has been changed in this period">
              Every entry reads as it was first written. If a figure looks wrong, it was
              entered that way rather than altered afterwards.
            </Notice>
          )}

          <div style={{ display: 'grid', gap: 12 }}>
            {rows.map((r) => (
              <div key={r.id} className="rowitem" style={{ display: 'block' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 10,
                    flexWrap: 'wrap',
                    marginBottom: 6,
                  }}
                >
                  <span
                    className={`tag ${r.action === 'removed' ? 'tag-out' : 'tag-lock'}`}
                  >
                    {r.action === 'removed' ? 'Removed' : 'Corrected'}
                  </span>
                  <b style={{ fontSize: 'var(--fs-label)' }}>{r.description}</b>
                  <span
                    style={{
                      marginLeft: 'auto',
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: 700,
                    }}
                  >
                    {r.toCents === null ? (
                      <span className="muted" style={{ textDecoration: 'line-through' }}>
                        {money(r.fromCents, currency)}
                      </span>
                    ) : r.fromCents === r.toCents ? (
                      money(r.toCents, currency)
                    ) : (
                      <>
                        <span className="muted" style={{ textDecoration: 'line-through' }}>
                          {money(r.fromCents, currency)}
                        </span>{' '}
                        {money(r.toCents, currency)}
                      </>
                    )}
                  </span>
                </div>

                <div className="ct" style={{ fontWeight: 400 }}>
                  {r.by} · {formatDateTime(r.at)} ·{' '}
                  {/* The month the change affected, which is not the day it was
                      made. A July entry fixed in September changed July. */}
                  affects {formatDate(r.date)}
                </div>

                <ChangeList changes={r.changed} />

                {r.action === 'removed' && (
                  <p className="hint" style={{ margin: '8px 0 0' }}>
                    Off your figures, still in the ledger. Record it again if it was removed by
                    mistake.
                  </p>
                )}
              </div>
            ))}
          </div>

          {data && data.total > data.perPage && (
            <div className="pager" style={{ padding: '18px 0 0', border: 0 }}>
              <span>
                {data.total} {data.total === 1 ? 'change' : 'changes'} in this period
              </span>
              <div className="pages">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <Icon name="arrowLeft" size={17} />
                </button>
                <button type="button" className="on">
                  {page}
                </button>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <Icon name="arrowRight" size={17} />
                </button>
              </div>
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <Notice icon="shield" title="This list cannot be edited or cleared">
              It is read from the ledger itself rather than from a separate log, so it cannot
              disagree with the money and there is nothing to switch off.
            </Notice>
          </div>
        </div>

        <div className="drawer-foot">
          <button className="btn btn-block" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </aside>
    </>
  );
}
