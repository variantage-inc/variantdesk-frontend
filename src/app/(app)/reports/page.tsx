'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Notice } from '@/components/form';
import { Icon, type IconName } from '@/components/icon';
import { ReportSheet } from '@/components/reports/report-sheet';
import { ToastProvider, useToast } from '@/components/settings/toast';
import {
  ApiError,
  downloadReport,
  getReport,
  getReports,
  type ReportChoice,
  type ReportDoc,
  type ReportId,
} from '@/lib/api';
import { rangeFor, type PeriodKind, type Range } from '@/lib/period';

/* Seven reports, one date range, both export formats.

   Three things this screen does not do, and each is deliberate.

   It does not work any figure out. The API builds the whole report as a
   document and this draws it, so the screen, the PDF and the spreadsheet are
   three renderings of one thing rather than three implementations of the same
   idea. The rule from Phase 7 holds: one derivation, several callers.

   It does not decide whether to show a comparison. A period that has not
   finished gets no previous period from the API at all, so there is nothing
   here to remember not to draw. Turning the comparison off is the customer's
   choice; withholding it from a running period is the product's.

   It does not build the PDF in the browser. Print produces a paper copy
   through the stylesheet, which is what the approved mockup does and what the
   invoice already does, but the file somebody emails to their accountant is
   rendered on the server, from the same document, so it cannot drift away from
   the screen it was exported from. */

function ReportsScreen() {
  const toast = useToast();

  const [choices, setChoices] = useState<ReportChoice[]>([]);
  const [id, setId] = useState<ReportId>('income');
  const [period, setPeriod] = useState<PeriodKind>('month');
  const [range, setRange] = useState<Range>(() => rangeFor('month'));
  const [compare, setCompare] = useState(true);
  const [report, setReport] = useState<ReportDoc | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pdf' | 'xlsx' | null>(null);

  /* The chosen report lives in the address, so a link to "the GST summary" is
     a link somebody can send. Read once, on arrival. */
  useEffect(() => {
    getReports()
      .then((r) => {
        setChoices(r.reports);
        const wanted = window.location.hash.slice(1);
        if (r.reports.some((one) => one.id === wanted)) setId(wanted as ReportId);
      })
      .catch(() => setProblem('We could not load the list of reports.'));
  }, []);

  /* Changing the range twice quickly leaves two requests in flight, and the
     slower one can land second. The answer to a question nobody is asking any
     more is thrown away rather than drawn, otherwise a report can settle on
     figures for a period the screen is no longer showing. */
  const load = useCallback(() => {
    let stale = false;

    getReport(id, range.from, range.to, compare)
      .then((r) => {
        if (stale) return;
        setReport(r.report);
        setProblem(null);
      })
      .catch((err) => {
        if (stale) return;
        setProblem(err instanceof ApiError ? err.message : 'We could not build that report.');
      });

    return () => {
      stale = true;
    };
  }, [id, range.from, range.to, compare]);

  useEffect(load, [load]);

  function choose(next: ReportId) {
    setId(next);
    window.history.replaceState(null, '', `#${next}`);
  }

  function choosePeriod(kind: PeriodKind) {
    setPeriod(kind);
    if (kind !== 'custom') setRange(rangeFor(kind));
  }

  async function exportAs(format: 'pdf' | 'xlsx') {
    setBusy(format);
    try {
      const name = await downloadReport(id, format, range.from, range.to, compare);
      toast(`Downloaded ${name}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'That export did not work.', 'err');
    } finally {
      setBusy(null);
    }
  }

  const chosen = choices.find((c) => c.id === id);

  /* The report on screen, but only while it is still the one being asked for.

     A report takes about a second to work out, and leaving the previous one up
     while it does means somebody who clicks Expenses reads a page headed
     Income and believes it. Derived during render rather than tracked in
     state, so the two can never fall out of step. */
  const showing =
    report && report.id === id && report.period.from === range.from && report.period.to === range.to
      ? report
      : null;

  return (
    <AppShell crumb="Reports">
      {/* The sheet carries its own heading, so printing this as well would put
          two titles on the page. */}
      <div className="phead noprint">
        <div>
          <h1>Reports</h1>
          <p className="sub">
            {showing
              ? `${showing.name} · ${showing.period.label} · ${showing.period.rangeLabel}`
              : 'Seven reports, one date range. Everything your accountant asks for at year end, ready to hand over.'}
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
                onClick={() => choosePeriod(k)}
              >
                {k.charAt(0).toUpperCase() + k.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {problem && (
        <div className="noprint">
          <Notice tone="err" icon="alert">
            {problem}
          </Notice>
        </div>
      )}

      <div className="rptgrid">
        <div className="panel noprint">
          <div className="chead" style={{ paddingBottom: 14 }}>
            <div>
              <h2>Choose a report</h2>
              <p className="csub">All seven cover the same date range.</p>
            </div>
          </div>

          <div className="rptlist" role="tablist" aria-label="Reports">
            {choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                role="tab"
                aria-selected={choice.id === id}
                className={`rptitem${choice.id === id ? ' on' : ''}`}
                onClick={() => choose(choice.id)}
              >
                <span className="ic">
                  <Icon name={choice.icon as IconName} size={19} sw={1.9} />
                </span>
                <span>
                  <b>{choice.name}</b>
                  <span>{choice.blurb}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="pager" style={{ borderTop: '1px solid var(--line-2)' }}>
            <span>
              Every figure is worked out from your entries at the moment you open the report.
              Nothing is stored and nothing can go stale.
            </span>
          </div>
        </div>

        <div className="panel">
          <div className="toolbar noprint">
            <div className="tf dates">
              <label htmlFor="r-from">Date range</label>
              <div className="pair">
                <input
                  className="input"
                  id="r-from"
                  type="date"
                  value={range.from}
                  readOnly={period !== 'custom'}
                  onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                />
                <span className="sep">to</span>
                <input
                  className="input"
                  type="date"
                  aria-label="To date"
                  value={range.to}
                  readOnly={period !== 'custom'}
                  onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                />
              </div>
            </div>

            <div className="tf">
              <label htmlFor="r-compare">Compare with</label>
              <select
                className="select"
                id="r-compare"
                value={compare ? '1' : '0'}
                onChange={(e) => setCompare(e.target.value === '1')}
              >
                <option value="1">The period before</option>
                <option value="0">Do not compare</option>
              </select>
            </div>

            <div className="spacer" />

            <button
              className="btn btn-sm"
              type="button"
              disabled={!showing || busy !== null}
              onClick={() => exportAs('pdf')}
            >
              <Icon name="download" size={17} /> {busy === 'pdf' ? 'Building…' : 'Export PDF'}
            </button>
            <button
              className="btn btn-sm"
              type="button"
              disabled={!showing || busy !== null}
              onClick={() => exportAs('xlsx')}
            >
              <Icon name="download" size={17} /> {busy === 'xlsx' ? 'Building…' : 'Export Excel'}
            </button>
            <button className="btn btn-sm" type="button" onClick={() => window.print()}>
              <Icon name="print" size={17} /> Print
            </button>
          </div>

          {showing ? (
            <ReportSheet report={showing} />
          ) : (
            <div className="rpt">
              <p className="csub">
                {chosen ? `Working out ${chosen.name}, from your entries…` : 'Loading…'}
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function ReportsPage() {
  return (
    <ToastProvider>
      <ReportsScreen />
    </ToastProvider>
  );
}
