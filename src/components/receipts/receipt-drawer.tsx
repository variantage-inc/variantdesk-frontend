'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';
import {
  ApiError,
  deleteAttachment,
  downloadAttachment,
  viewAttachment,
  type Attachment,
  type ReceiptOn,
} from '@/lib/api';
import { fileKind, fileSize, formatDate, money, type DateFormat } from '@/lib/format';

/* Looking at a receipt, saving it, and removing it.

   Removing is the part that needs care. Deleting a document and deleting the
   entry behind it are easy to confuse, and only one of them can be undone, so
   the difference is spelled out before anything happens rather than left to a
   generic "are you sure". */

const whereIs = (on: ReceiptOn): string =>
  on.kind === 'INVOICE'
    ? `/invoices/${on.id}`
    : on.fromInvoice
      ? `/invoices/${on.fromInvoice.id}`
      : on.kind === 'INCOME'
        ? '/income'
        : '/expenses';

const kindWord = (on: ReceiptOn): string =>
  on.kind === 'INVOICE'
    ? 'invoice'
    : on.kind === 'INCOME'
      ? 'income entry'
      : on.kind === 'DRAWING'
        ? 'owner drawing'
        : 'expense';

/* Images a browser can draw. HEIC is kept and downloadable, but only Safari
   can show one, so it gets the file icon rather than a broken picture. */
const drawable = (type: string) => ['image/jpeg', 'image/png', 'image/webp'].includes(type);

export function ReceiptDrawer({
  files,
  on,
  currency,
  dateFormat,
  canWrite,
  onClose,
  onDeleted,
}: {
  files: Attachment[];
  on: ReceiptOn | null;
  currency: string;
  dateFormat: DateFormat;
  canWrite: boolean;
  onClose: () => void;
  onDeleted: (message: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [link, setLink] = useState<{ id: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const file = files[Math.min(index, files.length - 1)];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /* A fresh five minute link each time a file is shown. */
  const fileId = file?.id;
  useEffect(() => {
    if (!fileId) return;
    let live = true;
    viewAttachment(fileId)
      .then((r) => live && setLink({ id: fileId, url: r.url }))
      .catch((err) => live && setProblem(err instanceof ApiError ? err.message : 'That file would not open.'));
    return () => {
      live = false;
    };
  }, [fileId]);

  if (!file) return null;
  const url = link?.id === file.id ? link.url : null;

  async function save() {
    setProblem(null);
    try {
      await downloadAttachment(file!.id);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'That file would not download.');
    }
  }

  async function remove() {
    setBusy(true);
    setProblem(null);
    try {
      await deleteAttachment(file!.id);
      onDeleted(
        on
          ? `${file!.fileName} deleted. ${on.title} for ${money(on.totalCents, currency)} is still there${
              files.length > 1 ? '.' : ', now without a receipt.'
            }`
          : `${file!.fileName} deleted.`,
      );
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'That did not work. Nothing was deleted.');
      setBusy(false);
    }
  }

  const keptUntil = on ? `${Number(on.date.slice(0, 4)) + 6}${on.date.slice(4)}` : null;

  return (
    <>
      <div className="drawer-scrim open" onClick={onClose} />
      <aside className="drawer open" role="dialog" aria-modal="true" aria-labelledby="rc-title">
        <div className="drawer-head">
          <div>
            <h2 id="rc-title">{confirming ? 'Delete this receipt?' : (on?.title ?? file.fileName)}</h2>
            <p className="sub">
              {confirming
                ? file.fileName
                : `${file.fileName} · ${fileSize(file.sizeBytes)} · uploaded ${formatDate(file.createdAt, dateFormat)}`}
            </p>
          </div>
          <button className="x" onClick={onClose} aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="drawer-body">
          {problem && (
            <div style={{ marginBottom: 16 }}>
              <Notice tone="err" icon="alert">
                {problem}
              </Notice>
            </div>
          )}

          {confirming ? (
            <>
              <Notice tone="err" icon="alert" title="This cannot be undone">
                The file is removed from storage permanently. There is no wastebasket to recover
                it from, because the file was never anywhere else.
              </Notice>
              {on && (
                <Notice icon="info" title="The entry itself is not touched">
                  <b>{on.title}</b> for {money(on.totalCents, currency)} on{' '}
                  {formatDate(on.date, dateFormat)} stays exactly as it is.
                  {on.kind === 'EXPENSE' && files.length === 1
                    ? ' It simply becomes an expense with no document behind it, and will appear under Chase these first until you attach a new one.'
                    : ''}
                </Notice>
              )}
              <Notice tone="warn" icon="shield" title="The CRA expects six years">
                If this is a business expense you have claimed tax back on, deleting the proof is
                what makes that claim refusable. Download it first if you are unsure.
              </Notice>
            </>
          ) : (
            <>
              {files.length > 1 && (
                <div className="statustabs" style={{ padding: 0, marginBottom: 14 }}>
                  {files.map((f, i) => (
                    <button
                      key={f.id}
                      type="button"
                      className={i === index ? 'on' : undefined}
                      aria-pressed={i === index}
                      onClick={() => setIndex(i)}
                    >
                      {fileKind(f.contentType)} {i + 1}
                    </button>
                  ))}
                </div>
              )}

              <div className="viewer">
                {url && drawable(file.contentType) ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={url}
                    alt={`Receipt: ${file.fileName}`}
                    style={{ maxWidth: '100%', maxHeight: 460, display: 'block', background: '#fff' }}
                  />
                ) : url && file.contentType === 'application/pdf' ? (
                  <iframe
                    src={url}
                    title={file.fileName}
                    style={{ width: '100%', height: 460, border: 0, background: '#fff' }}
                  />
                ) : (
                  <Icon name={file.contentType === 'application/pdf' ? 'file' : 'receipt'} size={46} />
                )}
              </div>

              {url && (
                <p className="hint" style={{ margin: '-8px 0 18px' }}>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    Open it in a new tab
                  </a>{' '}
                  · the link works for five minutes
                </p>
              )}

              {on && (
                <>
                  <Notice icon="clip" title="Attached to an entry, not stored loose">
                    This document belongs to the {kindWord(on)} below. Remove the entry and the
                    receipt goes with it; delete the receipt and the entry stays.
                  </Notice>

                  <div className="calc">
                    <div className="row">
                      <span>{on.kind === 'INVOICE' ? 'Invoice' : 'Entry'}</span>
                      <span>{on.title}</span>
                    </div>
                    {on.party && (
                      <div className="row">
                        <span>{on.kind === 'EXPENSE' ? 'Vendor' : on.kind === 'DRAWING' ? 'For' : 'Client'}</span>
                        <span>{on.party}</span>
                      </div>
                    )}
                    <div className="row">
                      <span>Date</span>
                      <span>{formatDate(on.date, dateFormat)}</span>
                    </div>
                    <div className="row tot">
                      <span>{on.taxCents ? 'Amount, tax included' : 'Amount'}</span>
                      <span>{money(on.totalCents, currency)}</span>
                    </div>
                  </div>

                  <p className="hint">
                    Kept until {formatDate(keptUntil, dateFormat)} under the CRA&apos;s six-year
                    record-keeping rule. Storage is private to this business: no other Variantage
                    account can reach it.
                  </p>
                </>
              )}
            </>
          )}
        </div>

        <div className="drawer-foot">
          {confirming ? (
            <>
              <button className="btn" type="button" onClick={() => setConfirming(false)} disabled={busy}>
                Keep it
              </button>
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => void remove()}
                disabled={busy}
                aria-busy={busy}
              >
                <Icon name="trash" size={18} /> {busy ? 'Deleting…' : 'Delete permanently'}
              </button>
            </>
          ) : (
            <>
              {canWrite && (
                <button
                  className="btn btn-quiet"
                  type="button"
                  style={{ marginRight: 'auto', color: 'var(--red-600)' }}
                  onClick={() => setConfirming(true)}
                >
                  <Icon name="trash" size={18} /> Delete
                </button>
              )}
              <button className="btn" type="button" onClick={() => void save()}>
                <Icon name="download" size={18} /> Download
              </button>
              {on && (
                <Link className="btn btn-primary" href={whereIs(on)}>
                  <Icon name="arrowRight" size={18} /> Open the {on.kind === 'INVOICE' ? 'invoice' : 'entry'}
                </Link>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
