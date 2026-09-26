import { Icon, type IconName } from '@/components/icon';
import { money } from '@/lib/format';
import type { ReportCell, ReportDoc, ReportKpi, ReportTable, ReportTone } from '@/lib/api';

/* The report, on screen.

   It draws the document the API builds and works nothing out. Every figure
   arrives in cents from modules/reporting/derive.ts, which is the same
   function the dashboard reads, and the PDF and the spreadsheet draw this same
   document on the server. One report, three renderers: a figure cannot be
   right here and wrong in the file somebody emails to their accountant.

   The markup is the approved mockup's, class for class, because the print
   rules in shell.css already know these class names. Printing the page is what
   produces a paper copy, and the rail, the menu and the buttons are stripped
   out by `noprint` rather than by a second layout. */

const toneClass: Record<ReportTone, string> = {
  in: 'money-in',
  out: 'money-out',
  draw: 'money-draw',
  muted: 'muted',
};

function value(cell: ReportCell, currency: string): string {
  if (cell.cents !== undefined) return money(cell.cents, currency);
  if (cell.percent !== undefined) return `${cell.percent.toFixed(1)}%`;
  return cell.text ?? '';
}

function Cell({ cell, currency }: { cell: ReportCell; currency: string }) {
  if (cell.bars?.length) {
    return (
      <td>
        {cell.bars.map((bar, i) => (
          <div key={i} className={`bar ${bar.tone}`}>
            <i style={{ width: `${Math.max(bar.share > 0 ? 2 : 0, bar.share * 100)}%` }} />
          </div>
        ))}
      </td>
    );
  }

  if (cell.pill) {
    return (
      <td>
        <span className={`pill ${cell.pill.cls}`}>{cell.pill.label}</span>
      </td>
    );
  }

  const classes = [
    cell.align === 'right' ? 'r' : '',
    cell.strong && cell.tone === undefined ? 'ttl' : '',
    cell.tone ? toneClass[cell.tone] : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <td className={classes || undefined}>
      {cell.strong && cell.tone ? <b>{value(cell, currency)}</b> : value(cell, currency)}
      {cell.sub && (
        <div
          className="sub2"
          style={cell.subTone === 'late' ? { color: 'var(--red-600)' } : undefined}
        >
          {cell.sub}
        </div>
      )}
    </td>
  );
}

function Table({ table, currency }: { table: ReportTable; currency: string }) {
  return (
    <>
      <h3>{table.title}</h3>
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              {table.columns.map((column, i) => (
                <th
                  key={i}
                  className={column.align === 'right' ? 'r' : undefined}
                  style={column.width ? { width: column.width } : undefined}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} className={row.tone === 'draw' ? 'is-draw' : undefined}>
                {row.cells.map((cell, j) => (
                  <Cell key={j} cell={cell} currency={currency} />
                ))}
              </tr>
            ))}
          </tbody>
          {table.foot && (
            <tfoot>
              <tr>
                {table.foot.map((cell, i) => (
                  <Cell key={i} cell={cell} currency={currency} />
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

function Kpi({ kpi, currency }: { kpi: ReportKpi; currency: string }) {
  return (
    <div className={`rpt-kpi${kpi.tone ? ` ${kpi.tone}` : ''}`}>
      <div className="k">{kpi.label}</div>
      <div className="v">{kpi.cents !== undefined ? money(kpi.cents, currency) : kpi.text}</div>
      {kpi.delta && (
        <div className="n">
          <span className={kpi.delta.percent >= 0 ? 'up' : 'dn'} style={{ fontWeight: 700 }}>
            {kpi.delta.percent >= 0 ? '+' : '−'}
            {Math.abs(kpi.delta.percent).toFixed(1)}%
          </span>{' '}
          {kpi.delta.label}
        </div>
      )}
      {kpi.note && <div className="n">{kpi.note}</div>}
    </div>
  );
}

export function ReportSheet({ report }: { report: ReportDoc }) {
  const currency = report.currency;

  return (
    <div className="rpt">
      <div className="rpt-head">
        <div>
          <h2>{report.name}</h2>
          <p className="rsub">
            {report.period.label} · {report.period.rangeLabel} · {report.taxLabel}
          </p>
        </div>
        <div className="who">
          <b>{report.seller.name}</b>
          <span>
            {report.seller.address?.split('\n').map((line) => (
              <span key={line} style={{ display: 'block' }}>
                {line}
              </span>
            ))}
            {report.seller.gstHstNumber && <span>GST/HST {report.seller.gstHstNumber}</span>}
          </span>
        </div>
      </div>

      {report.kpis.length > 0 && (
        <div className="rpt-kpis">
          {report.kpis.map((kpi) => (
            <Kpi key={kpi.label} kpi={kpi} currency={currency} />
          ))}
        </div>
      )}

      {report.notes.map((note) => (
        <div key={note.title} className={`notice notice-${note.tone}`} style={{ margin: '0 0 22px' }}>
          <Icon name={note.icon as IconName} size={22} />
          <span>
            <b>{note.title}</b>
            {note.body}
          </span>
        </div>
      ))}

      {report.tables.map((table) => (
        <Table key={table.title} table={table} currency={currency} />
      ))}

      <div className="rpt-foot">
        Prepared {report.preparedOn.replace(/-/g, '/')} from Variantage Finance ·{' '}
        {report.seller.name} · all amounts in Canadian dollars.
        <br />
        {report.footnote}
      </div>
    </div>
  );
}
