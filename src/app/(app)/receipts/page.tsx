'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Field, Notice, Select } from '@/components/form';
import { Icon } from '@/components/icon';
import { ToastProvider, useToast } from '@/components/settings/toast';
import { ReceiptDrawer } from '@/components/receipts/receipt-drawer';
import {
  FileDrop,
  RECEIPT_ACCEPT,
  RECEIPT_HINT,
  RECEIPT_MAX,
} from '@/components/receipts/file-drop';
import {
  ApiError,
  attachToEntry,
  downloadAttachment,
  listReceipts,
  type MissingEntry,
  type Receipt,
  type ReceiptFilters,
  type ReceiptList,
} from '@/lib/api';
import { useSession } from '@/lib/session';
import { fileSize, formatDate, money, type DateFormat } from '@/lib/format';

/* Receipts.

   Every document behind the numbers, attached to the entry it belongs to. The
   screen answers two questions, in this order: what is missing a receipt, and
   where is the one I need.

   "Chase these first" is the reason the screen exists. It is worked out by the
   API from the same query the dashboard's warning uses, so the count and the
   tax at risk are the same number on both screens. */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

/* "in July" when every missing receipt is from one month, which is the
   ordinary case for somebody who keeps up, and a plain span otherwise. */
function span(first: string | null, last: string | null, fmt: DateFormat): string {
  if (!first || !last) return '';
  if (first.slice(0, 7) === last.slice(0, 7)) return `in ${MONTHS[Number(first.slice(5, 7)) - 1]}`;
  return `from ${formatDate(first, fmt)} to ${formatDate(last, fmt)}`;
}

const TABS: { on: NonNullable<ReceiptFilters['on']>; label: string; always?: boolean }[] = [
  { on: 'all', label: 'All receipts', always: true },
  { on: 'EXPENSE', label: 'Against expenses', always: true },
  { on: 'INCOME', label: 'Against income', always: true },
  { on: 'DRAWING', label: 'Against drawings' },
  { on: 'INVOICE', label: 'On invoices' },
];

function ReceiptsScreen() {
  const { access } = useSession();
  const toast = useToast();
  const canWrite = access?.canWrite === true;

  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fileType, setFileType] = useState<'all' | 'pdf' | 'img'>('all');
  const [on, setOn] = useState<NonNullable<ReceiptFilters['on']>>('all');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ReceiptList | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Receipt | null>(null);
  const [uploading, setUploading] = useState<{ entryId: string } | null>(null);

  const load = useCallback(() => {
    listReceipts({
      search: search.trim() || undefined,
      from: from || undefined,
      to: to || undefined,
      fileType,
      on,
      page,
    })
      .then((d) => {
        setData(d);
        setProblem(null);
      })
      .catch((err) =>
        setProblem(err instanceof ApiError ? err.message : 'We could not load your receipts.'),
      );
  }, [search, from, to, fileType, on, page]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const currency = data?.currency ?? 'CAD';
  const fmt = data?.dateFormat ?? 'YYYY/MM/DD';
  const missing = data?.missing;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;
  const when = missing ? span(missing.firstDate, missing.lastDate, fmt) : '';

  function clear() {
    setSearch('');
    setFrom('');
    setTo('');
    setFileType('all');
    setOn('all');
    setPage(1);
  }

  async function save(r: Receipt) {
    try {
      await downloadAttachment(r.id);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'That file would not download.', 'err');
    }
  }

  return (
    <AppShell crumb="Receipts">
      <div className="phead">
        <div>
          <h1>Receipts</h1>
          <p className="sub">
            Every document behind your numbers, attached to the entry it belongs to. Kept for
            six years, as the CRA requires.
          </p>
        </div>
        <div className="acts">
          {canWrite && data?.configured && (
            <button className="btn btn-primary" type="button" onClick={() => setUploading({ entryId: '' })}>
              <Icon name="upload" size={19} /> Upload a receipt
            </button>
          )}
        </div>
      </div>

      {problem && (
        <div style={{ marginBottom: 18 }}>
          <Notice tone="err" icon="alert">
            {problem}
          </Notice>
        </div>
      )}

      {data && !data.configured && (
        <div style={{ marginBottom: 18 }}>
          <Notice tone="warn" icon="alert" title="Document storage is not switched on">
            Receipts cannot be uploaded or opened until storage is configured for this
            environment. Nothing else is affected.
          </Notice>
        </div>
      )}

      {/* ------------------------------------------------------ summary --- */}
      <div className="stats">
        <div className="stat rise d1">
          <div className="lbl">
            <Icon name="receipt" size={15} /> Receipts on file
          </div>
          <div className="val">{data ? data.summary.files : '—'}</div>
          <div className="meta">
            {data ? `${data.summary.pdfs} PDFs · ${data.summary.images} photos and scans` : ''}
          </div>
        </div>
        <div className="stat s-out rise d2">
          <div className="lbl">
            <Icon name="alert" size={15} /> Expenses with nothing attached
          </div>
          <div className="val">{missing ? missing.count : '—'}</div>
          <div className="meta">
            {missing && missing.count > 0 ? (
              <>
                <span className="dn">All {when}</span> · the ones to chase
              </>
            ) : missing ? (
              'Every expense has a document'
            ) : (
              ''
            )}
          </div>
        </div>
        <div className="stat s-tax rise d3">
          <div className="lbl">
            <Icon name="shield" size={15} /> Tax at risk without them
          </div>
          <div className="val">{missing ? money(missing.atRiskCents, currency) : '—'}</div>
          <div className="meta">Input tax credit the CRA can refuse without a document</div>
        </div>
        <div className="stat rise d4">
          <div className="lbl">
            <Icon name="file" size={15} /> Storage used
          </div>
          <div className="val">{data ? fileSize(data.summary.bytes) : '—'}</div>
          <div className="meta">Private to this business</div>
        </div>
      </div>

      {/* ------------------------------------------------- chase these --- */}
      {missing && missing.count > 0 && (
        <div className="panel rise d5" style={{ marginBottom: 18 }}>
          <div className="chead">
            <div>
              <h2>Chase these first</h2>
              <p className="csub">
                Expenses {when} with no document behind them. Each one is tax you cannot prove
                you paid.
              </p>
            </div>
          </div>
          <div style={{ padding: '4px 22px 20px' }}>
            <div className="missing">
              {missing.entries.map((e) => (
                <MissingRow
                  key={e.id}
                  entry={e}
                  currency={currency}
                  fmt={fmt}
                  canAttach={canWrite && data.configured}
                  onAttach={() => setUploading({ entryId: e.id })}
                />
              ))}
            </div>
            {missing.count > missing.entries.length && (
              <p className="hint" style={{ marginTop: 12 }}>
                And {missing.count - missing.entries.length} older ones. The newest are listed
                first.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- the files --- */}
      <div className="panel rise d6">
        <div className="toolbar">
          <div className="tf">
            <label htmlFor="rc-search">Search</label>
            <input
              className="input"
              id="rc-search"
              type="search"
              style={{ minWidth: 230 }}
              placeholder="Vendor, client or file name"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="tf dates">
            <label htmlFor="rc-from">Date range</label>
            <div className="pair">
              <input
                className="input"
                id="rc-from"
                type="date"
                aria-label="From date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
              <span className="sep">to</span>
              <input
                className="input"
                type="date"
                aria-label="To date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          <div className="tf">
            <label htmlFor="rc-type">File type</label>
            <select
              className="select"
              id="rc-type"
              value={fileType}
              onChange={(e) => {
                setFileType(e.target.value as typeof fileType);
                setPage(1);
              }}
            >
              <option value="all">All file types</option>
              <option value="pdf">PDF only</option>
              <option value="img">Photos and scans</option>
            </select>
          </div>
          <div className="spacer" />
          <button className="btn btn-sm" type="button" onClick={clear}>
            Clear filters
          </button>
        </div>

        <div className="statustabs">
          {TABS.filter((t) => t.always || (data?.counts[t.on] ?? 0) > 0).map((t) => (
            <button
              key={t.on}
              type="button"
              className={on === t.on ? 'on' : undefined}
              aria-pressed={on === t.on}
              onClick={() => {
                setOn(t.on);
                setPage(1);
              }}
            >
              {t.label} <span className="n">{data?.counts[t.on] ?? ''}</span>
            </button>
          ))}
        </div>

        <div className="notice notice-info" style={{ margin: '16px 22px 0', borderRadius: 'var(--r)' }}>
          <Icon name="info" size={22} />
          <span>
            <b>A receipt is never a loose file</b>
            Every document here is attached to the entry it belongs to, so opening an expense
            shows its receipt and opening a receipt shows its expense. There is no folder to
            organise and nothing to name: Variantage does both from the entry.
          </span>
        </div>

        <div className="rcptgrid">
          {data?.receipts.map((r) => (
            <ReceiptCard
              key={r.id}
              receipt={r}
              currency={currency}
              fmt={fmt}
              canWrite={canWrite}
              onView={() => setViewing(r)}
              onSave={() => void save(r)}
            />
          ))}
          {data && data.receipts.length === 0 && (
            <p
              className="muted"
              style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 16px', margin: 0 }}
            >
              {data.summary.files === 0
                ? 'No receipts yet. Attach one from the clip on any income or expense row, or upload one here.'
                : 'Nothing matches those filters.'}
            </p>
          )}
          {!data && !problem && (
            <p className="muted" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 16px', margin: 0 }}>
              Loading…
            </p>
          )}
        </div>

        <div className="pager">
          <span>
            {data
              ? `Showing ${data.receipts.length} of ${data.total} receipts · every one attached to an entry`
              : ''}
          </span>
          <div className="pages">
            {pages > 1 && (
              <>
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
              </>
            )}
            <Link className="btn btn-sm" href="/expenses">
              Go to Expenses
            </Link>
          </div>
        </div>
      </div>

      {viewing && (
        <ReceiptDrawer
          files={[viewing]}
          on={viewing.on}
          currency={currency}
          dateFormat={fmt}
          canWrite={canWrite}
          onClose={() => setViewing(null)}
          onDeleted={(message) => {
            setViewing(null);
            toast(message);
            load();
          }}
        />
      )}

      {uploading && missing && (
        <UploadDrawer
          entries={missing.entries}
          chosen={uploading.entryId}
          currency={currency}
          fmt={fmt}
          onClose={() => setUploading(null)}
          onDone={(message) => {
            setUploading(null);
            toast(message);
            load();
          }}
        />
      )}
    </AppShell>
  );
}

function MissingRow({
  entry,
  currency,
  fmt,
  canAttach,
  onAttach,
}: {
  entry: MissingEntry;
  currency: string;
  fmt: DateFormat;
  canAttach: boolean;
  onAttach: () => void;
}) {
  return (
    <div className="missrow">
      <div>
        <b>{entry.description}</b>
        <span>
          {formatDate(entry.date, fmt)}
          {entry.vendor ? ` · ${entry.vendor}` : ''}
          {entry.category ? ` · ${entry.category}` : ''}
        </span>
      </div>
      <div className="amt3">
        {money(entry.subtotalCents, currency)}
        <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>
          {money(entry.taxCents, currency)} at risk
        </span>
      </div>
      {canAttach ? (
        <button className="btn btn-sm" type="button" onClick={onAttach}>
          <Icon name="clip" size={17} /> Attach
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}

function ReceiptCard({
  receipt: r,
  currency,
  fmt,
  canWrite,
  onView,
  onSave,
}: {
  receipt: Receipt;
  currency: string;
  fmt: DateFormat;
  canWrite: boolean;
  onView: () => void;
  onSave: () => void;
}) {
  const ext = r.fileName.split('.').pop()?.toUpperCase() ?? 'FILE';
  const tone = r.on.kind === 'INCOME' || r.on.kind === 'INVOICE' ? 'money-in' : r.on.kind === 'DRAWING' ? 'money-draw' : 'money-out';
  return (
    <div className="rcptcard">
      <button
        type="button"
        className="sheet"
        style={{ border: 0, width: '100%', cursor: 'pointer' }}
        onClick={onView}
        aria-label={`Open ${r.fileName}`}
      >
        <span className="kind">{ext}</span>
        <Icon name={r.contentType === 'application/pdf' ? 'file' : 'receipt'} size={30} sw={1.6} />
      </button>
      <div className="meta2">
        <b>{r.on.title}</b>
        <span className="sub3">
          {formatDate(r.on.date, fmt)}
          {r.on.party ? ` · ${r.on.party}` : ''}
        </span>
        <span className={`amt2 ${tone}`}>{money(r.on.totalCents, currency)}</span>
      </div>
      <div className="foot2">
        <span className="sz2">{fileSize(r.sizeBytes)}</span>
        <div className="rowacts">
          <button type="button" title={`Open ${r.fileName}`} aria-label={`Open ${r.fileName}`} onClick={onView}>
            <Icon name="eye" size={17} />
          </button>
          <button type="button" title={`Download ${r.fileName}`} aria-label={`Download ${r.fileName}`} onClick={onSave}>
            <Icon name="download" size={17} />
          </button>
          {canWrite && (
            <button type="button" className="del" title={`Delete ${r.fileName}`} aria-label={`Delete ${r.fileName}`} onClick={onView}>
              <Icon name="trash" size={17} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* Uploading from this screen attaches to an expense that has nothing yet.
   Only those are offered, so an existing receipt cannot be replaced by
   accident; anything else is attached from the clip on its own row. */
function UploadDrawer({
  entries,
  chosen,
  currency,
  fmt,
  onClose,
  onDone,
}: {
  entries: MissingEntry[];
  chosen: string;
  currency: string;
  fmt: DateFormat;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [entryId, setEntryId] = useState(chosen || entries[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const entry = entries.find((e) => e.id === entryId);

  async function attach() {
    if (!file || !entry) return;
    setBusy(true);
    setProblem(null);
    try {
      await attachToEntry(entry.id, file);
      onDone(
        entry.taxCents > 0
          ? `Attached to "${entry.description}". That is ${money(entry.taxCents, currency)} of tax you can now prove.`
          : `Attached to "${entry.description}".`,
      );
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'That file did not upload. Try again.');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="drawer-scrim open" onClick={onClose} />
      <aside className="drawer open" role="dialog" aria-modal="true" aria-labelledby="up-title">
        <div className="drawer-head">
          <div>
            <h2 id="up-title">Upload a receipt</h2>
            <p className="sub">
              {entry
                ? `${entry.description} · ${formatDate(entry.date, fmt)}${entry.vendor ? ` · ${entry.vendor}` : ''}`
                : 'Choose which entry it belongs to'}
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

          {entries.length === 0 ? (
            <Notice tone="ok" icon="check" title="Every expense already has a document">
              To add another, or one for income or a drawing, use the clip on its row on the{' '}
              <Link href="/income">Income</Link> or <Link href="/expenses">Expenses</Link> screen.
            </Notice>
          ) : (
            <>
              <FileDrop
                accept={RECEIPT_ACCEPT}
                maxBytes={RECEIPT_MAX}
                title="Choose a file, or drag one here"
                hint={RECEIPT_HINT}
                file={file}
                onFile={setFile}
                disabled={busy}
              />

              <div style={{ marginTop: 22 }}>
                <Field
                  label="Attach it to"
                  hint="Only expenses with nothing attached are listed, so you cannot accidentally replace a receipt that is already there."
                >
                  <Select value={entryId} onChange={(e) => setEntryId(e.target.value)}>
                    {entries.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.description} · {money(e.subtotalCents, currency)} · {formatDate(e.date, fmt)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <p className="hint">
                Not recorded yet? <Link href="/expenses">Record the expense</Link> and attach the
                receipt in the same form.
              </p>
            </>
          )}
        </div>

        <div className="drawer-foot">
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {entries.length > 0 && (
            <button
              className="btn btn-primary"
              type="button"
              disabled={!file || !entry || busy}
              aria-busy={busy}
              onClick={() => void attach()}
            >
              <Icon name="check" size={18} /> {busy ? 'Attaching…' : 'Attach the receipt'}
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

export default function ReceiptsPage() {
  return (
    <ToastProvider>
      <ReceiptsScreen />
    </ToastProvider>
  );
}
