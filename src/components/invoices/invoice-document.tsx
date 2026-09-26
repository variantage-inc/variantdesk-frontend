import { formatDate, money, type DateFormat } from '@/lib/format';
import type { Invoice, InvoiceStatus } from '@/lib/api';

/* The invoice as a document: what the owner looks at, what prints, and what
   the client opens from the public link. One component, so the page the
   client pays from cannot drift from the page the owner sent. Everything on
   it was stored when the invoice was raised. */

export const STATUS: Record<InvoiceStatus, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'p-draft' },
  sent: { label: 'Sent', cls: 'p-sent' },
  part: { label: 'Partially paid', cls: 'p-part' },
  overdue: { label: 'Overdue', cls: 'p-late' },
  paid: { label: 'Paid', cls: 'p-paid' },
};

export type InvoiceDocumentData = Pick<
  Invoice,
  | 'number'
  | 'status'
  | 'issueDate'
  | 'dueDate'
  | 'paymentTermsDays'
  | 'seller'
  | 'billTo'
  | 'subtotalCents'
  | 'discountMode'
  | 'discountValue'
  | 'discountCents'
  | 'taxCents'
  | 'totalCents'
  | 'paidCents'
  | 'balanceCents'
  | 'chargeTax'
  | 'taxLabel'
  | 'notes'
  | 'terms'
  | 'footer'
  | 'payTo'
> & {
  items: { description: string; quantity: number; unitPriceCents: number; lineTotalCents: number }[];
  logoUrl?: string | null;
};

export function InvoiceDocument({
  doc,
  currency,
  dateFormat = 'YYYY/MM/DD',
}: {
  doc: InvoiceDocumentData;
  currency: string;
  dateFormat?: DateFormat;
}) {
  return (
      <div className="doc">
        <div className="doc-head">
          <div className="brand">
            {/* The logo this invoice was printed with, which a later change in
                Settings does not touch. Without one, the approved wordmark. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={doc.logoUrl ? 'biz-logo' : undefined}
              src={doc.logoUrl ?? '/brand/wordmark.svg'}
              alt={doc.logoUrl ? doc.seller.name : 'Variantage'}
            />
            <address>
              <b>{doc.seller.name}</b>
              {doc.seller.address && (
                <>
                  <br />
                  {doc.seller.address.split('\n').map((line) => (
                    <span key={line}>
                      {line}
                      <br />
                    </span>
                  ))}
                </>
              )}
              {doc.seller.email && (
                <>
                  {doc.seller.email}
                  <br />
                </>
              )}
              {doc.seller.phone}
            </address>
          </div>
          <div className="meta">
            <h1>Invoice</h1>
            <div className="no">{doc.number}</div>
            <span className={`pill ${STATUS[doc.status].cls}`}>{STATUS[doc.status].label}</span>
          </div>
        </div>

        <div className="doc-parties">
          <div>
            <h3>Billed to</h3>
            <address>
              <b>{doc.billTo.name}</b>
              {doc.billTo.contact && (
                <>
                  <br />
                  {doc.billTo.contact}
                </>
              )}
              {doc.billTo.address && (
                <>
                  <br />
                  {doc.billTo.address.split('\n').map((line) => (
                    <span key={line}>
                      {line}
                      <br />
                    </span>
                  ))}
                </>
              )}
            </address>
          </div>
          <div className="doc-dates">
            <div>
              <b>Invoice date</b>
              <span>{formatDate(doc.issueDate, dateFormat)}</span>
            </div>
            <div>
              <b>Payment due</b>
              <span>{formatDate(doc.dueDate, dateFormat)}</span>
            </div>
            <div>
              <b>Terms</b>
              <span>
                {doc.paymentTermsDays === 0
                  ? 'Due on receipt'
                  : `Net ${doc.paymentTermsDays}`}
              </span>
            </div>
          </div>
        </div>

        <table className="doc-lines">
          <thead>
            <tr>
              <th>Description</th>
              <th className="r" style={{ width: 80 }}>
                Qty
              </th>
              <th className="r" style={{ width: 120 }}>
                Rate
              </th>
              <th className="r" style={{ width: 130 }}>
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {doc.items.map((i, n) => (
              <tr key={n}>
                <td>{i.description}</td>
                <td className="r">{i.quantity}</td>
                <td className="r">{money(i.unitPriceCents, currency)}</td>
                <td className="r">{money(i.lineTotalCents, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="doc-sum">
          <div className="box">
            <div className="row">
              <span>Subtotal</span>
              <span>{money(doc.subtotalCents, currency)}</span>
            </div>
            {doc.discountCents > 0 && (
              <div className="row">
                <span>
                  Discount
                  {doc.discountMode === 'PERCENT' && ` (${doc.discountValue / 100}%)`}
                </span>
                <span>-{money(doc.discountCents, currency)}</span>
              </div>
            )}
            <div className="row">
              <span>{doc.chargeTax ? doc.taxLabel : 'No tax charged'}</span>
              <span>{money(doc.taxCents, currency)}</span>
            </div>
            <div className="row tot">
              <span>Total</span>
              <span>{money(doc.totalCents, currency)}</span>
            </div>
            {doc.paidCents > 0 && (
              <>
                <div className="row">
                  <span>Received</span>
                  <span>{money(doc.paidCents, currency)}</span>
                </div>
                <div className="row tot">
                  <span>Still owed</span>
                  <span>{money(doc.balanceCents, currency)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {doc.notes && (
          <p style={{ margin: '0 0 20px', fontSize: 'var(--fs-label)' }}>{doc.notes}</p>
        )}

        <div className="doc-foot">
          <div>
            <h4>Payment terms</h4>
            <span>{doc.terms ?? `Payment due within ${doc.paymentTermsDays} days.`}</span>
          </div>
          {doc.seller.gstHstNumber && (
            <div>
              <h4>GST / HST registration number</h4>
              <span className="doc-bn">{doc.seller.gstHstNumber}</span>
            </div>
          )}
          {doc.payTo && (
            <div>
              <h4>How to pay</h4>
              <span>{doc.payTo}</span>
            </div>
          )}
          {doc.footer && <div style={{ color: 'var(--ink-3)' }}>{doc.footer}</div>}
        </div>
      </div>
  );
}
