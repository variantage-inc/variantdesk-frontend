'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';
import { ToastProvider, useToast } from '@/components/settings/toast';
import { ReceiptDrawer } from '@/components/receipts/receipt-drawer';
import { RECEIPT_ACCEPT, RECEIPT_MAX } from '@/components/receipts/file-drop';
import { EntryDrawer, type DrawerMode } from './entry-drawer';
import { HistoryModal } from './history-modal';
import { ChangesDrawer } from './changes-drawer';
import {
  ApiError,
  attachToEntry,
  deleteEntry,
  listCategories,
  listClients,
  listIncome,
  listMoneyOut,
  listVendors,
  type Category,
  type Client,
  type Entry,
  type EntryList,
  type ReceiptOn,
  type Vendor,
} from '@/lib/api';
import { useSession } from '@/lib/session';
import { fileSize, formatDate, money } from '@/lib/format';
import { describe, rangeFor, type PeriodKind, type Range } from '@/lib/period';

/* Income, and expenses with drawings, are the same screen with different
   columns, so they are one component. Everything the two share, and it is
   almost everything, is written once: the period filter, the toolbar, the
   table, the footer totals, the drawer and the pager.

   The figures at the top are worked out by the API from the same filter as the
   rows below them, so a total can never disagree with the list it is sitting
   on. The footer sums the whole filtered period, not the page on screen: a
   footer that added up one page of three would be a wrong number, which is
   worse than no number. */

/* An entry, described the way the receipt drawer describes what a file is on. */
export const receiptContext = (e: Entry): ReceiptOn => ({
  kind: e.type,
  id: e.id,
  date: e.date,
  title: e.description,
  party: e.type === 'DRAWING' ? e.purpose : (e.vendor?.name ?? e.client?.name ?? null),
  category: e.category?.name ?? null,
  totalCents: e.totalCents,
  taxCents: e.taxCents,
  fromInvoice: e.fromInvoice,
});

const METHOD_LABEL: Record<string, string> = {
  BANK_TRANSFER: 'Bank transfer',
  E_TRANSFER: 'e-Transfer',
  CHEQUE: 'Cheque',
  CASH: 'Cash',
  CARD: 'Card',
  PRE_AUTHORISED: 'Pre-authorised',
  OTHER: 'Other',
};

export function EntriesScreen({ side }: { side: 'INCOME' | 'MONEY_OUT' }) {
  return (
    <ToastProvider>
      <Inner side={side} />
    </ToastProvider>
  );
}

function Inner({ side }: { side: 'INCOME' | 'MONEY_OUT' }) {
  const income = side === 'INCOME';
  const { access } = useSession();
  const toast = useToast();

  const [period, setPeriod] = useState<PeriodKind>('month');
  const [range, setRange] = useState<Range>(() => rangeFor('month'));
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [show, setShow] = useState<'all' | 'expenses' | 'drawings'>('all');
  const [page, setPage] = useState(1);

  const [data, setData] = useState<EntryList | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [drawer, setDrawer] = useState<DrawerMode | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const [changes, setChanges] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Entry | null>(null);

  /* The dashed clip on a row opens the file chooser for that entry. The entry
     is held in a ref, because the chooser answers after this render. */
  const picker = useRef<HTMLInputElement>(null);
  const pickFor = useRef<Entry | null>(null);

  const canWrite = access?.canWrite === true;

  const load = useCallback(async () => {
    const filters = {
      from: range.from,
      to: range.to,
      search: search.trim() || undefined,
      categoryId: categoryId || undefined,
      paymentMethod: paymentMethod || undefined,
      page,
      ...(income ? { clientId: partyId || undefined } : { vendorId: partyId || undefined, show }),
    };
    try {
      setData(income ? await listIncome(filters) : await listMoneyOut(filters));
      setProblem(null);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : 'We could not load your entries.');
    }
  }, [income, range, search, categoryId, partyId, paymentMethod, show, page]);

  /* Debounced, because the search box refetches as it is typed and firing a
     request per keystroke would be four requests for one word. */
  useEffect(() => {
    const t = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  useEffect(() => {
    Promise.all([listCategories(), listVendors(), income ? listClients() : Promise.resolve({ clients: [] })])
      .then(([c, v, cl]) => {
        setCategories(c.categories);
        setVendors(v.vendors);
        setClients(cl.clients);
      })
      .catch(() => undefined);
  }, [income]);

  function choosePeriod(kind: PeriodKind) {
    setPeriod(kind);
    setPage(1);
    if (kind !== 'custom') setRange(rangeFor(kind));
  }

  function clearFilters() {
    setSearch('');
    setCategoryId('');
    setPartyId('');
    setPaymentMethod('');
    setShow('all');
    setPage(1);
  }

  async function attach(entry: Entry, file: File) {
    if (file.size > RECEIPT_MAX) {
      toast(`That file is ${fileSize(file.size)}. The limit is 10 MB.`, 'err');
      return;
    }
    try {
      await attachToEntry(entry.id, file);
      toast(
        entry.type === 'EXPENSE' && entry.taxCents > 0
          ? `Attached to "${entry.description}". That is ${money(entry.taxCents, currency)} of tax you can now prove.`
          : `Attached to "${entry.description}".`,
      );
      void load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'That file did not upload.', 'err');
    }
  }

  async function remove(entry: Entry) {
    setConfirming(null);
    try {
      await deleteEntry(entry.id);
      toast('The entry has been removed. A reversal is kept in the ledger.');
      void load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'That did not work.', 'err');
    }
  }

  const summary = data?.summary;
  const currency = data?.currency ?? 'CAD';
  const fmt = data?.dateFormat ?? 'YYYY/MM/DD';
  const taxLabel = data?.tax.label ?? 'HST 13%';

  const parties = useMemo(
    () => (income ? clients : vendors.filter((v) => !v.archived)),
    [income, clients, vendors],
  );

  const pages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;

  return (
    <AppShell crumb={income ? 'Income' : 'Expenses'}>
      <div className="phead">
        <div>
          <h1>{income ? 'Income' : 'Expenses'}</h1>
          <p className="sub">
            {income ? 'Money coming in.' : 'Money going out, including owner drawings.'}{' '}
            {describe(period, range)} · {data?.tax.name ?? ''} {taxLabel}
          </p>
        </div>
        <div className="acts">
          <div className="seg" role="group" aria-label="Period">
            {(['month', 'quarter', 'year', 'custom'] as PeriodKind[]).map((k) => (
              <button
                key={k}
                type="button"
                className={period === k ? 'on' : undefined}
                onClick={() => choosePeriod(k)}
              >
                {k.charAt(0).toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
          {/* Reachable from the screen the figures are on, because that is
              where somebody is standing when a total looks wrong. */}
          <button className="btn btn-sm" type="button" onClick={() => setChanges(true)}>
            <Icon name="clock" size={18} /> What changed
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!canWrite}
            onClick={() => setDrawer({ side, entry: null })}
          >
            <Icon name="plus" size={19} /> {income ? 'Add income' : 'Add expense'}
          </button>
        </div>
      </div>

      {!canWrite && (
        <div style={{ marginBottom: 18 }}>
          <Notice tone="warn" icon="lock" title="Read only">
            Nothing new can be added while the account is read only. Everything already here
            stays exactly as it is, and can still be searched and read.
          </Notice>
        </div>
      )}

      {problem && (
        <Notice tone="err" icon="alert">
          {problem}
        </Notice>
      )}

      {/* ----------------------------------------------------- summary --- */}
      <div className="stats">
        {income ? (
          <>
            <Stat
              tone="s-in"
              icon="income"
              label="Income, before tax"
              value={money(summary?.income?.subtotalCents ?? 0, currency)}
              meta={`Across ${summary?.entries ?? 0} ${summary?.entries === 1 ? 'entry' : 'entries'}`}
            />
            <Stat
              tone="s-tax"
              icon="shield"
              label={`${taxLabel} collected`}
              value={money(summary?.income?.taxCents ?? 0, currency)}
              meta="Held for the CRA. This is not your money"
            />
            <Stat
              icon="wallet"
              label="Total received"
              value={money(summary?.income?.totalCents ?? 0, currency)}
              meta="Before tax plus the tax collected"
            />
            <Stat
              tone="s-tax"
              icon="invoice"
              label="Posted from invoices"
              value={money(summary?.fromInvoicesCents ?? 0, currency)}
              meta={
                summary?.fromInvoicesCount
                  ? `${summary.fromInvoicesCount} entr${summary.fromInvoicesCount === 1 ? 'y' : 'ies'} written for you when an invoice was paid`
                  : 'Recording a payment on an invoice posts the income here'
              }
            />
          </>
        ) : (
          <>
            <Stat
              tone="s-out"
              icon="expense"
              label="Business expenses, before tax"
              value={money(summary?.expense?.subtotalCents ?? 0, currency)}
              meta={`Across ${summary?.expense?.count ?? 0} ${summary?.expense?.count === 1 ? 'entry' : 'entries'}`}
            />
            <Stat
              tone="s-tax"
              icon="shield"
              label={`${taxLabel} paid, claimable back`}
              value={money(summary?.expense?.taxCents ?? 0, currency)}
              meta="Your input tax credit against the tax you collected"
            />
            <Stat
              tone="s-draw"
              icon="wallet"
              label="Owner drawings"
              value={money(summary?.drawing?.totalCents ?? 0, currency)}
              meta="Not a business expense. Excluded from profit"
            />
            <Stat
              icon="card"
              label="Total money out"
              value={money(
                (summary?.expense?.totalCents ?? 0) + (summary?.drawing?.totalCents ?? 0),
                currency,
              )}
              meta={`Across ${summary?.entries ?? 0} ${summary?.entries === 1 ? 'entry' : 'entries'}`}
            />
          </>
        )}
      </div>

      {/* ------------------------------------------------------- table --- */}
      <div className="panel">
        <div className="toolbar">
          <div className="tf">
            <label htmlFor="f-search">Search</label>
            <input
              className="input"
              id="f-search"
              type="search"
              placeholder={income ? 'Description or reference' : 'Description, vendor or reference'}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="tf dates">
            <label htmlFor="f-from">Date range</label>
            <div className="pair">
              <input
                className="input"
                id="f-from"
                type="date"
                value={range.from}
                onChange={(e) => {
                  setPeriod('custom');
                  setRange((r) => ({ ...r, from: e.target.value }));
                  setPage(1);
                }}
              />
              <span className="sep">to</span>
              <input
                className="input"
                type="date"
                aria-label="To date"
                value={range.to}
                onChange={(e) => {
                  setPeriod('custom');
                  setRange((r) => ({ ...r, to: e.target.value }));
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div className="tf">
            <label htmlFor="f-cat">Category</label>
            <select
              className="select"
              id="f-cat"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All categories</option>
              {categories
                .filter((c) => (income ? c.kind === 'INCOME' : c.kind !== 'INCOME'))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="tf">
            <label htmlFor="f-party">{income ? 'Client' : 'Vendor'}</label>
            <select
              className="select"
              id="f-party"
              value={partyId}
              onChange={(e) => {
                setPartyId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">{income ? 'All clients' : 'All vendors'}</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="tf">
            <label htmlFor="f-pay">Payment method</label>
            <select
              className="select"
              id="f-pay"
              value={paymentMethod}
              onChange={(e) => {
                setPaymentMethod(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Any method</option>
              {Object.entries(METHOD_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {!income && (
            <div className="tf">
              <label htmlFor="f-show">Show</label>
              <select
                className="select"
                id="f-show"
                value={show}
                onChange={(e) => {
                  setShow(e.target.value as typeof show);
                  setPage(1);
                }}
              >
                <option value="all">Expenses and drawings</option>
                <option value="expenses">Business expenses only</option>
                <option value="drawings">Owner drawings only</option>
              </select>
            </div>
          )}

          <div className="spacer" />
          <button className="btn btn-sm" type="button" onClick={clearFilters}>
            Clear filters
          </button>
        </div>

        {!income && show === 'all' && (summary?.drawing?.count ?? 0) > 0 && (
          <div
            className="notice notice-draw"
            style={{ margin: '16px 22px 0', borderRadius: 'var(--r)' }}
          >
            <Icon name="info" size={22} />
            <span>
              <b>The shaded rows are owner drawings, not expenses</b>
              They are money you have taken out for yourself. They are excluded from profit,
              from expense reports and from the tax you claim back.
            </span>
          </div>
        )}

        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>{income ? 'Client' : 'Paid to'}</th>
                <th>Category</th>
                <th>Method</th>
                <th style={{ textAlign: 'center' }}>Receipt</th>
                <th className="r">Before tax</th>
                <th className="r">{taxLabel}</th>
                <th className="r">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data?.entries.map((e) => (
                <tr key={e.id} className={e.type === 'DRAWING' ? 'is-draw' : undefined}>
                  <td className="date">{formatDate(e.date, fmt)}</td>
                  <td>
                    <div className="ttl">{e.description}</div>
                    {e.fromInvoice && (
                      <div className="sub2">
                        <Link className="tag tag-lock" href={`/invoices/${e.fromInvoice.id}`}>
                          From invoice {e.fromInvoice.number}
                        </Link>
                      </div>
                    )}
                    {(e.type === 'DRAWING' || e.amended || e.reference) && (
                      <div className="sub2">
                        {e.type === 'DRAWING' && (
                          <span className="tag tag-draw">Owner drawing</span>
                        )}{' '}
                        {e.amended && (
                          <button
                            type="button"
                            className="tag tag-lock"
                            style={{ border: 0, cursor: 'pointer' }}
                            onClick={() => setHistory(e.id)}
                          >
                            Corrected, see what changed
                          </button>
                        )}{' '}
                        {e.reference && <span className="muted">Ref {e.reference}</span>}
                      </div>
                    )}
                    {e.purpose && <div className="sub2">{e.purpose}</div>}
                  </td>
                  <td>
                    {e.type === 'DRAWING' ? (
                      <span className="muted">The owner</span>
                    ) : (
                      (income ? e.client?.name : e.vendor?.name) ?? <span className="muted">—</span>
                    )}
                  </td>
                  <td>{e.category ? <span className="tag">{e.category.name}</span> : null}</td>
                  <td className="muted">
                    {e.paymentMethod ? METHOD_LABEL[e.paymentMethod] : '—'}
                  </td>
                  {/* A solid clip opens the receipt. A dashed one means nothing
                      is attached, so the gap is visible now rather than at year
                      end, and pressing it attaches one straight to this entry. */}
                  <td style={{ textAlign: 'center' }}>
                    {e.attachments.length > 0 ? (
                      <button
                        type="button"
                        className="rcpt"
                        style={{ margin: '0 auto', cursor: 'pointer' }}
                        aria-label={`View the receipt for ${e.description}`}
                        title={e.attachments.length > 1 ? `${e.attachments.length} documents` : 'View receipt'}
                        onClick={() => setViewing(e)}
                      >
                        <Icon name="clip" size={17} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rcpt none"
                        style={{ margin: '0 auto', cursor: canWrite ? 'pointer' : 'default' }}
                        aria-label={canWrite ? `Attach a receipt to ${e.description}` : 'No receipt'}
                        title={canWrite ? 'Attach a receipt' : 'No receipt'}
                        disabled={!canWrite}
                        onClick={() => {
                          pickFor.current = e;
                          picker.current?.click();
                        }}
                      >
                        <Icon name="clip" size={17} />
                      </button>
                    )}
                  </td>
                  <td className="r">{money(e.subtotalCents, currency)}</td>
                  <td className="r muted">
                    {e.taxCents === 0 ? '—' : money(e.taxCents, currency)}
                  </td>
                  <td
                    className={`r ${income ? 'money-in' : e.type === 'DRAWING' ? 'money-draw' : 'money-out'}`}
                  >
                    {money(e.totalCents, currency)}
                  </td>
                  <td>
                    <div className="rowacts">
                      {/* On every row, not only corrected ones. Somebody
                          checking a figure should not have to already know it
                          was changed to find out that it was. */}
                      <button
                        type="button"
                        aria-label={`History of ${e.description}`}
                        title="What changed"
                        onClick={() => setHistory(e.id)}
                      >
                        <Icon name="clock" size={17} />
                      </button>
                      {/* An entry posted by a payment on an invoice belongs to
                          that invoice. Editing it here would move the money
                          without moving the invoice balance, so the row offers
                          the invoice rather than an edit button that would be
                          refused by the API anyway. */}
                      {e.fromInvoice ? (
                        <Link
                          href={`/invoices/${e.fromInvoice.id}`}
                          aria-label={`Open invoice ${e.fromInvoice.number}`}
                          title="Change this on the invoice"
                          style={{ display: 'grid', placeItems: 'center' }}
                        >
                          <Icon name="invoice" size={17} />
                        </Link>
                      ) : (
                      canWrite && (
                        <>
                        <button
                          type="button"
                          aria-label={`Edit ${e.description}`}
                          onClick={() => setDrawer({ side, entry: e })}
                        >
                          <Icon name="edit" size={17} />
                        </button>
                        <button
                          type="button"
                          className="del"
                          aria-label={`Remove ${e.description}`}
                          onClick={() => setConfirming(e.id)}
                        >
                          <Icon name="trash" size={17} />
                        </button>
                        </>
                      )
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {data && data.entries.length === 0 && (
                <tr>
                  <td colSpan={10} className="muted" style={{ padding: '34px 16px' }}>
                    {search || categoryId || partyId || paymentMethod
                      ? 'Nothing matches those filters. Try clearing them.'
                      : `No ${income ? 'income' : 'entries'} in ${describe(period, range)} yet.`}
                  </td>
                </tr>
              )}

              {!data && (
                <tr>
                  <td colSpan={10} className="muted" style={{ padding: '34px 16px' }}>
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>

            {data && data.entries.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={6}>
                    {data.total} {data.total === 1 ? 'entry' : 'entries'} ·{' '}
                    {describe(period, range)}
                  </td>
                  <td className="r">
                    {money(
                      (summary?.income?.subtotalCents ?? 0) +
                        (summary?.expense?.subtotalCents ?? 0) +
                        (summary?.drawing?.subtotalCents ?? 0),
                      currency,
                    )}
                  </td>
                  <td className="r">
                    {money(
                      (summary?.income?.taxCents ?? 0) + (summary?.expense?.taxCents ?? 0),
                      currency,
                    )}
                  </td>
                  <td className={`r ${income ? 'money-in' : 'money-out'}`}>
                    {money(
                      (summary?.income?.totalCents ?? 0) +
                        (summary?.expense?.totalCents ?? 0) +
                        (summary?.drawing?.totalCents ?? 0),
                      currency,
                    )}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="pager">
          <span>
            {data && data.total > 0
              ? `Showing ${(data.page - 1) * data.perPage + 1} to ${Math.min(data.page * data.perPage, data.total)} of ${data.total}`
              : 'Nothing to show'}
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
      </div>

      <div style={{ marginTop: 18 }}>
        <Notice icon="shield" title="Nothing here is ever really deleted">
          Editing an entry keeps the old version and writes a correction; removing one writes a
          reversal. The clock on any row shows every version it has had and who changed it, and{' '}
          <b>What changed</b> above lists every correction and removal in this period. A
          receipt stays with its entry through every correction.
        </Notice>
      </div>

      <input
        ref={picker}
        type="file"
        accept={RECEIPT_ACCEPT}
        hidden
        onChange={(ev) => {
          const file = ev.target.files?.[0];
          const entry = pickFor.current;
          ev.target.value = '';
          if (file && entry) void attach(entry, file);
        }}
      />

      {viewing && (
        <ReceiptDrawer
          files={viewing.attachments}
          on={receiptContext(viewing)}
          currency={currency}
          dateFormat={fmt}
          canWrite={canWrite}
          onClose={() => setViewing(null)}
          onDeleted={(message) => {
            setViewing(null);
            toast(message);
            void load();
          }}
        />
      )}

      {history && <HistoryModal entryId={history} onClose={() => setHistory(null)} />}

      {changes && <ChangesDrawer range={range} onClose={() => setChanges(false)} />}

      {confirming && (
        <ConfirmRemove
          entry={data?.entries.find((e) => e.id === confirming) ?? null}
          currency={currency}
          onCancel={() => setConfirming(null)}
          onConfirm={(entry) => void remove(entry)}
        />
      )}

      {drawer && (
        <EntryDrawer
          mode={drawer}
          categories={categories}
          vendors={vendors}
          clients={clients}
          taxLabel={taxLabel}
          taxRateBp={data?.tax.totalBp ?? 1300}
          currency={currency}
          onClose={() => setDrawer(null)}
          onClientAdded={setClients}
          onSaved={(warning) => {
            setDrawer(null);
            if (warning) toast(warning, 'err');
            else toast(drawer.entry ? 'The correction has been saved.' : 'Saved.');
            void load();
          }}
        />
      )}
    </AppShell>
  );
}

function Stat({
  tone,
  icon,
  label,
  value,
  meta,
}: {
  tone?: string;
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <div className={`stat${tone ? ` ${tone}` : ''}`}>
      <div className="lbl">
        <Icon name={icon} size={15} /> {label}
      </div>
      <div className="val">{value}</div>
      <div className="meta">{meta}</div>
    </div>
  );
}

/* Removing an entry is not destructive underneath, and the dialog says so.
   Telling somebody their records are about to be destroyed, when they are not,
   would make them hesitate over a correction they should just make. */
function ConfirmRemove({
  entry,
  currency,
  onCancel,
  onConfirm,
}: {
  entry: Entry | null;
  currency: string;
  onCancel: () => void;
  onConfirm: (entry: Entry) => void;
}) {
  if (!entry) return null;

  return (
    <div className="scrim">
      <div className="card card-narrow rise d1" role="alertdialog" aria-labelledby="rm-title">
        <h2
          id="rm-title"
          style={{ fontFamily: 'var(--display)', fontSize: 'var(--fs-h1)', marginBottom: 12 }}
        >
          Remove this entry?
        </h2>
        <p style={{ fontSize: 'var(--fs-lead)', color: 'var(--ink-3)', lineHeight: 1.55 }}>
          <b>{entry.description}</b>, {money(entry.totalCents, currency)} on {entry.date}.
        </p>
        <div style={{ margin: '18px 0 24px' }}>
          <Notice icon="info" title="It comes off your figures, not out of your records">
            A reversal is written to the ledger, so the entry and its removal both stay
            readable. That is what the CRA&apos;s six year rule asks for.
          </Notice>
        </div>
        <button className="btn btn-danger btn-block" onClick={() => onConfirm(entry)}>
          Yes, remove it
        </button>
        <button className="btn btn-quiet btn-block" style={{ marginTop: 10 }} onClick={onCancel}>
          Keep it
        </button>
      </div>
    </div>
  );
}
