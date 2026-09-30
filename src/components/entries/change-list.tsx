/* The fields a correction moved, one line each: what it was, what it is now.

   Shared by the entry history and the period's changes, so a correction reads
   the same wherever it is seen. */

export type FieldChange = { field: string; from: string; to: string };

export function ChangeList({ changes }: { changes: FieldChange[] }) {
  if (changes.length === 0) return null;
  return (
    <dl className="chg-list">
      {changes.map((c) => (
        <div key={c.field} className="chg-row">
          <dt>{c.field}</dt>
          <dd>
            <s>{c.from}</s>
            <span aria-hidden="true" className="chg-arrow">
              →
            </span>
            <span className="sr-only">changed to</span>
            <b>{c.to}</b>
          </dd>
        </div>
      ))}
    </dl>
  );
}
