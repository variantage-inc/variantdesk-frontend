'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Notice } from '@/components/form';
import { Icon } from '@/components/icon';
import { MonthChart, type MonthPoint } from '@/components/dashboard/month-chart';
import { ApiError, getDashboard, type Dashboard, type InvoiceStatus } from '@/lib/api';
import { useSession } from '@/lib/session';
import { formatDate, money } from '@/lib/format';
import { describe, rangeFor, type PeriodKind, type Range } from '@/lib/period';

/* Where the business stands.

   Nothing on this page is stored. Every figure is worked out by the API from
   the ledger rows, by the same function the Phase 9 reports will call, so a
   number here can always be tied back to the entries underneath it and the
   dashboard and the reports cannot drift apart.

   Six things this screen does that a dashboard usually gets wrong:

   Net profit leads, with its own arithmetic printed underneath it. Money in
   minus money out, where the owner can check it rather than take it on trust.

   Owner drawings keep their own figure and their own chart. A drawing is not a
   cost, and the layout never lets it look like one: not in money out, not in
   the expense breakdown, not on the same axis as income.

   No percentage is shown for a period that is still running. Forty days into a
   ninety-two day quarter, comparing against a finished quarter prints a
   collapse for a business doing perfectly well. It says how far through the
   period it is instead.

   What you are owed does not move with the period, and says so. It is a
   position on a date, not a total over a range.

   Every chart has a table, and every chart figure is written into the card
   header rather than a floating tooltip, so nothing is reachable only by
   hovering.

   A month with nothing recorded is drawn as a dashed outline, not a bar of
   zero. Nothing entered is a different claim from nothing spent. */

const STATUS_CLASS: Record<InvoiceStatus, string> = {
  draft: 'p-draft',
  sent: 'p-sent',
  part: 'p-part',
  overdue: 'p-late',
  paid: 'p-paid',
};

const TYPE_LABEL = { INCOME: 'Income', EXPENSE: 'Expense', DRAWING: 'Owner drawing' } as const;

/* "against July" reads; "against 2026 07" does not. Built from the date parts
   rather than the Date object, so a range starting on the 1st does not slip to
   the previous month in a timezone behind UTC. */
function monthName(iso: string): string {
  const [year, month] = iso.split('-');
  const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const name = names[Number(month) - 1] ?? '';
  return Number(year) === new Date().getFullYear() ? name : `${name} ${year}`;
}

export default function DashboardPage() {
  const { business, access } = useSession();

  const [period, setPeriod] = useState<PeriodKind>('month');
  const [range, setRange] = useState<Range>(() => rangeFor('month'));
  const [data, setData] = useState<Dashboard | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [show, setShow] = useState<'all' | 'INCOME' | 'EXPENSE' | 'DRAWING'>('all');

  const load = useCallback(() => {
    getDashboard(range.from, range.to)
      .then((r) => {
        setData(r);
        setProblem(null);
      })
      .catch((err) =>
        setProblem(err instanceof ApiError ? err.message : 'We could not load your dashboard.'),
      );
  }, [range.from, range.to]);

  useEffect(load, [load]);

  /* Clicking a month in either chart moves the whole page to it. */
  function pickMonth(m: MonthPoint) {
    setPeriod('month');
    setRange({ from: m.from, to: m.to });
  }

  const currency = data?.currency ?? 'CAD';
  const fmt = data?.dateFormat ?? 'YYYY/MM/DD';
  const taxLabel = data?.tax.label ?? 'HST';

  const recent = (data?.recent ?? []).filter((e) => show === 'all' || e.type === show);

  return (
    <AppShell crumb="Dashboard">
      <div className="phead">
        <div>
          <h1>Where the business stands</h1>
          <p className="sub">
            {business?.name} · {describe(period, range)} · {data?.tax.name} {taxLabel}
          </p>
        </div>
        <div className="acts">
          <div className="seg" role="group" aria-label="Period">
            {(['month', 'quarter', 'year', 'custom'] as PeriodKind[]).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={period === k}
                className={period === k ? 'on' : undefined}
                onClick={() => {
                  setPeriod(k);
                  if (k !== 'custom') setRange(rangeFor(k));
                }}
              >
                {k.charAt(0).toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
          {access?.canWrite && (
            <Link className="btn btn-primary" href="/income">
              <Icon name="plus" size={19} /> Add an entry
            </Link>
          )}
        </div>
      </div>

      {period === 'custom' && (
        <div
          className="toolbar"
          style={{
            border: '1px solid var(--line-2)',
            borderRadius: 'var(--r-lg)',
            marginBottom: 18,
          }}
        >
          <div className="tf dates">
            <label htmlFor="d-from">Custom date range</label>
            <div className="pair">
              <input
                className="input"
                id="d-from"
                type="date"
                value={range.from}
                onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              />
              <span className="sep">to</span>
              <input
                className="input"
                type="date"
                aria-label="To date"
                value={range.to}
                onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              />
            </div>
          </div>
          <div className="spacer" />
        </div>
      )}

      {problem && (
        <Notice tone="err" icon="alert">
          {problem}
        </Notice>
      )}

      {/* ------------------------------------------- the headline figures --- */}
      <div className="stats">
        <div className="stat">
          <div className="lbl">Net profit</div>
          <div className="val">{money(data?.netProfitCents ?? 0, currency)}</div>
          {/* The arithmetic, printed where it can be checked. */}
          <div className="deriv">
            <span className="d in">
              <span className="k">Money in</span>
              <span className="v">{money(data?.income.subtotalCents ?? 0, currency)}</span>
            </span>
            <span className="d out">
              <span className="k">Money out</span>
              <span className="v">{money(data?.expenses.subtotalCents ?? 0, currency)}</span>
            </span>
          </div>
          <div className="meta">
            <Comparison data={data} />
          </div>
        </div>

        <div className="stat">
          <div className="lbl">
            <Icon name="invoice" size={15} /> Owed to you
          </div>
          <div className="val">{money(data?.invoices.owedCents ?? 0, currency)}</div>
          <div className="meta">
            {data?.invoices.owedCount
              ? `${data.invoices.owedCount} invoice${data.invoices.owedCount === 1 ? '' : 's'} · a position today, not a total for the period`
              : 'Nothing outstanding'}
          </div>
        </div>

        <div className="stat s-tax">
          <div className="lbl">
            <Icon name="shield" size={15} /> {taxLabel} owed to the CRA
          </div>
          <div className="val">{money(Math.abs(data?.taxOwedCents ?? 0), currency)}</div>
          <div className="meta">
            {(data?.taxOwedCents ?? 0) < 0 ? (
              <>
                You are owed this back. You paid more tax than you collected in this period
              </>
            ) : (
              <>
                {money(data?.income.taxCents ?? 0, currency)} collected, less{' '}
                {money(data?.expenses.taxCents ?? 0, currency)} you can claim back
              </>
            )}
          </div>
        </div>

        <div className="stat s-draw">
          <div className="lbl">
            <Icon name="wallet" size={15} /> Owner drawings
          </div>
          <div className="val">{money(data?.drawings.totalCents ?? 0, currency)}</div>
          <div className="meta">
            <b style={{ color: 'var(--draw-600)' }}>Not a business expense</b>, so it is not in
            money out or in profit above
          </div>
        </div>
      </div>

      {/* --------------------------------------------- chart and invoices --- */}
      <div className="dash-grid" style={{ marginBottom: 18 }}>
        <div className="panel">
          <div className="chead">
            <div>
              <h2>Money in and out, month by month</h2>
              <p className="csub">
                Before tax. Twelve months are always shown; the shaded band is the period you
                have chosen. Click a month to jump to it.
              </p>
            </div>
          </div>

          {data && (
            <MonthChart
              months={data.months}
              currency={currency}
              selectedFrom={range.from}
              selectedTo={range.to}
              onPick={pickMonth}
              series={[
                { key: 'incomeCents', label: 'Money in', colour: 'var(--ok-600)' },
                { key: 'expensesCents', label: 'Business expenses', colour: 'var(--red-600)' },
              ]}
            />
          )}

          <div className="legend">
            <span>
              <i style={{ background: 'var(--ok-600)' }} /> Money in
            </span>
            <span>
              <i style={{ background: 'var(--red-600)' }} /> Business expenses
            </span>
            <span className="note">
              Owner drawings have their own chart below. They are not an expense.
            </span>
          </div>
        </div>

        <div className="panel">
          <div className="chead">
            <div>
              <h2>Invoices</h2>
              <p className="csub">
                Totals include {taxLabel}. Overdue first, then oldest.
              </p>
            </div>
          </div>

          <div>
            {data?.invoices.oldest.map((i) => (
              <div key={i.id} className={`invrow${i.status === 'overdue' ? ' is-late' : ''}`}>
                <span className="who">
                  <b>{i.clientName}</b>
                  <span>
                    {i.number} · due {formatDate(i.dueDate, fmt)}
                  </span>
                </span>
                <span className="amt">
                  {money(i.balanceCents, currency)}
                  <small>of {money(i.totalCents, currency)}</small>
                </span>
                <span className="st">
                  <span className={`pill ${STATUS_CLASS[i.status]}`}>
                    {i.status === 'part' ? 'Partially paid' : i.status === 'overdue' ? 'Overdue' : 'Sent'}
                  </span>
                  {i.daysToDue < 0 ? (
                    <span style={{ color: 'var(--red-600)', fontWeight: 600, fontSize: 13 }}>
                      {-i.daysToDue} days late
                    </span>
                  ) : (
                    <span className="muted" style={{ fontSize: 13 }}>
                      in {i.daysToDue} days
                    </span>
                  )}
                  <Link href={`/invoices/${i.id}`} style={{ marginLeft: 'auto', fontSize: 13 }}>
                    Open
                  </Link>
                </span>
              </div>
            ))}

            {data && data.invoices.oldest.length === 0 && (
              <p className="hint" style={{ padding: '26px 22px' }}>
                Nothing outstanding. Every invoice you have sent has been settled.
              </p>
            )}
          </div>

          <div className="pager">
            <span>
              {data?.invoices.overdueCount
                ? `${money(data.invoices.overdueCents, currency)} overdue`
                : 'Nothing overdue'}
            </span>
            <div className="pages">
              <Link className="btn btn-sm" href="/invoices">
                All invoices
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------ breakdown and drawings --- */}
      <div className="dash-grid-2" style={{ marginBottom: 18 }}>
        <div className="panel">
          <div className="chead">
            <div>
              <h2>Where the money went</h2>
              <p className="csub">
                Business expenses only, before tax. Owner drawings are not in this list.
              </p>
            </div>
          </div>

          <div className="catlist">
            {data?.byCategory.map((c) => (
              <div key={c.id ?? c.name} className="catrow">
                <span className="nm">{c.name}</span>
                <span className="track">
                  <i className="fill" style={{ width: `${c.shareBp / 100}%` }} />
                </span>
                <span className="amt">
                  {money(c.cents, currency)}
                  <small>
                    {(c.shareBp / 100).toFixed(1)}% · {c.count} entr{c.count === 1 ? 'y' : 'ies'}
                  </small>
                </span>
              </div>
            ))}

            {data && data.byCategory.length === 0 && (
              <p className="hint" style={{ padding: '20px 22px' }}>
                Nothing recorded in this period.
              </p>
            )}
          </div>

          {data && data.byCategory.length > 0 && (
            <div className="pager">
              <span>
                These add up to {money(data.expenses.subtotalCents, currency)}, which is money
                out above
              </span>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="chead">
            <div>
              <h2>What you have taken out</h2>
              <p className="csub">
                Owner drawings. Not a business expense, and no tax to claim back.
              </p>
            </div>
          </div>

          {data && (
            <MonthChart
              months={data.months}
              currency={currency}
              selectedFrom={range.from}
              selectedTo={range.to}
              onPick={pickMonth}
              emptyNote="none yet"
              series={[{ key: 'drawingsCents', label: 'Drawings', colour: 'var(--draw-600)' }]}
            />
          )}

          <div style={{ padding: '0 22px 22px' }}>
            <div className="calc" style={{ margin: 0 }}>
              <div className="row">
                <span>Net profit for this period</span>
                <span>{money(data?.netProfitCents ?? 0, currency)}</span>
              </div>
              <div className="row">
                <span>Less owner drawings</span>
                <span>{money(data?.drawings.totalCents ?? 0, currency)}</span>
              </div>
              <div className="row tot">
                <span>Left in the business</span>
                <span>{money(data?.leftInBusinessCents ?? 0, currency)}</span>
              </div>
            </div>

            {(data?.leftInBusinessCents ?? 0) < 0 && (
              <div className="notice notice-draw" style={{ margin: '14px 0 0' }}>
                <Icon name="info" size={22} />
                <span>
                  You took out more than the business made in this period. That is allowed, it
                  comes out of money the business already held, but it is worth knowing.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Receipts are Phase 8. A count of entries missing one would be every
          entry, which is a true number that means nothing until there is a way
          to attach anything. */}
      <div style={{ marginBottom: 18 }}>
        <Notice icon="receipt" title="Receipt chasing arrives with document storage">
          When it does, this is where the entries with nothing attached will be listed, with
          the input tax credit at risk on them. Today the figure would be every expense, which
          is true and useless.
        </Notice>
      </div>

      {/* ----------------------------------------------------- recent --- */}
      <div className="panel">
        <div className="chead">
          <div>
            <h2>Recent entries</h2>
            <p className="csub">
              A sample of the period, not a total of it. Money in with a plus, money out and
              drawings with a minus.
            </p>
          </div>
          <div className="acts">
            <div className="tf">
              <label htmlFor="d-show">Show</label>
              <select
                className="select"
                id="d-show"
                style={{ height: 44 }}
                value={show}
                onChange={(e) => setShow(e.target.value as typeof show)}
              >
                <option value="all">Everything</option>
                <option value="INCOME">Income only</option>
                <option value="EXPENSE">Business expenses only</option>
                <option value="DRAWING">Owner drawings only</option>
              </select>
            </div>
          </div>
        </div>

        <div className="tblwrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Client or vendor</th>
                <th>Type</th>
                <th className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((e) => (
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
                  </td>
                  <td>{e.party ?? <span className="muted">—</span>}</td>
                  <td>
                    <span
                      className={`tag ${e.type === 'INCOME' ? 'tag-in' : e.type === 'DRAWING' ? 'tag-draw' : 'tag-out'}`}
                    >
                      {TYPE_LABEL[e.type]}
                    </span>
                  </td>
                  <td
                    className={`r ${e.type === 'INCOME' ? 'money-in' : e.type === 'DRAWING' ? 'money-draw' : 'money-out'}`}
                  >
                    {e.type === 'INCOME' ? '+' : '−'}
                    {money(e.totalCents, currency)}
                  </td>
                </tr>
              ))}

              {data && recent.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted" style={{ padding: '30px 16px' }}>
                    Nothing recorded in {describe(period, range)}.
                  </td>
                </tr>
              )}

              {!data && !problem && (
                <tr>
                  <td colSpan={5} className="muted" style={{ padding: '30px 16px' }}>
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <span>Every figure above is worked out from these entries, never stored.</span>
          <div className="pages">
            <Link className="btn btn-sm" href="/income">
              Income
            </Link>
            <Link className="btn btn-sm" href="/expenses">
              Expenses
            </Link>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* The comparison against the period before, and the rule that governs it.

   A period that still includes today is a part, and a part measured against a
   whole is not a comparison. Forty days into a quarter it would print a
   collapse for a business that is doing perfectly well, so it says how far
   through the period it is instead and offers no number at all. */
function Comparison({ data }: { data: Dashboard | null }) {
  if (!data) return null;

  if (!data.period.complete) {
    return (
      <>
        <b>{data.period.elapsedDays}</b> of {data.period.totalDays} days so far. No comparison
        while the period is still running
      </>
    );
  }

  if (!data.previous) return <>Nothing to compare against yet</>;

  const before = data.previous.netProfitCents;
  const now = data.netProfitCents;

  /* A percentage change from nothing is not a percentage. */
  if (before === 0) {
    return <>Nothing recorded in the period before this one</>;
  }

  const change = ((now - before) / Math.abs(before)) * 100;
  const up = change >= 0;

  return (
    <>
      <span className={up ? 'up' : 'dn'}>
        {up ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
      </span>{' '}
      against {monthName(data.previous.from)}
    </>
  );
}
