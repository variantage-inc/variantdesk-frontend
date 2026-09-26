'use client';

import { useState } from 'react';
import { money } from '@/lib/format';

/* The month by month charts, hand drawn as SVG.

   No chart library, deliberately. Two charts of twelve bars each is not worth
   a dependency and a bundle, and a library would take the accessibility
   decisions below out of our hands.

   Four rules, and every one of them is in the reviewed screen:

   NOTHING IS REACHABLE ONLY BY HOVERING. The figures appear in the card header
   as the reader moves through the months, not in a floating tooltip, so a
   keyboard user and a screen reader get exactly what a mouse user gets.

   EVERY CHART HAS A TABLE. Same numbers, in a table, one button away. A chart
   is a shape; some readers need the figures.

   A MONTH WITH NOTHING RECORDED IS NOT A ZERO. A dashed outline saying "none
   yet" makes a different claim from a bar of height zero, and on a bookkeeping
   screen the difference matters: one means nothing happened, the other means
   nothing has been entered.

   THE CHOSEN PERIOD IS SHADED. All twelve months are always drawn, so the
   selection has context either side of it rather than sitting alone. */

export type MonthPoint = {
  key: string;
  label: string;
  year: number;
  from: string;
  to: string;
  incomeCents: number;
  expensesCents: number;
  drawingsCents: number;
};

type Series = { key: 'incomeCents' | 'expensesCents' | 'drawingsCents'; label: string; colour: string };

/* A round number a little above the tallest bar, so the axis reads in figures
   a person recognises rather than in the exact maximum. */
function axisTop(values: number[]): number {
  const max = Math.max(1, ...values);
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const step = magnitude / 2;
  return Math.ceil(max / step) * step;
}

const gridLabel = (cents: number): string => {
  if (cents === 0) return '$0';
  const dollars = cents / 100;
  return dollars >= 1000 ? `$${Math.round(dollars / 1000)}k` : `$${Math.round(dollars)}`;
};

export function MonthChart({
  months,
  series,
  currency,
  selectedFrom,
  selectedTo,
  onPick,
  emptyNote,
}: {
  months: MonthPoint[];
  series: Series[];
  currency: string;
  selectedFrom: string;
  selectedTo: string;
  onPick: (month: MonthPoint) => void;
  /* Shown under a month with nothing in it, for the drawings chart where a
     blank month is normal and meaningful. */
  emptyNote?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  /* Which month the reader is on, for the readout. Null means show the whole
     selection, which is what they see before touching anything. */
  const [focus, setFocus] = useState<number | null>(null);

  const W = 640;
  const H = 230;
  const L = 62;
  const R = 16;
  const T = 22;
  const B = 42;
  const pw = W - L - R;
  const ph = H - T - B;
  const slot = pw / months.length;

  const top = axisTop(months.flatMap((m) => series.map((s) => m[s.key])));
  const y = (cents: number) => T + ph - (cents / top) * ph;

  const inSelection = (m: MonthPoint) => m.to >= selectedFrom && m.from <= selectedTo;
  const firstSelected = months.findIndex(inSelection);
  const lastSelected = months.map(inSelection).lastIndexOf(true);

  const barWidth = Math.min(26, (slot - 12) / series.length);
  const showing = focus === null ? null : months[focus];

  return (
    <>
      <div className="chead" style={{ borderTop: 0, paddingTop: 0 }}>
        <div className="readout" style={{ marginLeft: 'auto' }}>
          {showing ? (
            <>
              <b>
                {showing.label} {showing.year}
              </b>
              {series.map((s) => (
                <span key={s.key}>
                  {s.label} {money(showing[s.key], currency)}
                </span>
              ))}
            </>
          ) : (
            <span>Move through the months to see each one</span>
          )}
        </div>
        <button
          className="btn btn-sm"
          type="button"
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
        >
          {asTable ? 'View as chart' : 'View as table'}
        </button>
      </div>

      {asTable ? (
        <div className="tblwrap">
          <table className="tbl mini">
            <thead>
              <tr>
                <th>Month</th>
                {series.map((s) => (
                  <th key={s.key} className="r">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.key} className={inSelection(m) ? 'is-draw' : undefined}>
                  <td>
                    {m.label} {m.year}
                  </td>
                  {series.map((s) => (
                    <td key={s.key} className="r">
                      {m[s.key] === 0 ? (
                        <span className="muted">{emptyNote ?? '—'}</span>
                      ) : (
                        money(m[s.key], currency)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chartwrap">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            /* Decoration. Every figure in it is also in the buttons below and
               in the table behind the toggle, so nothing is only in here. */
            aria-hidden="true"
            focusable="false"
          >
            {/* The shaded band is the chosen period. */}
            {firstSelected >= 0 && (
              <rect
                x={L + slot * firstSelected}
                y={T}
                width={slot * (lastSelected - firstSelected + 1)}
                height={ph}
                fill="var(--accent-100)"
                opacity={0.55}
                rx={6}
              />
            )}

            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line
                  x1={L}
                  y1={y(top * f)}
                  x2={W - R}
                  y2={y(top * f)}
                  stroke="var(--line-2)"
                  strokeWidth={1}
                />
                <text
                  x={L - 12}
                  y={y(top * f) + 4}
                  textAnchor="end"
                  fontSize={12.5}
                  fill="var(--ink-3)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {gridLabel(top * f)}
                </text>
              </g>
            ))}

            {months.map((m, i) => {
              const centre = L + slot * i + slot / 2;
              const groupWidth = barWidth * series.length + (series.length - 1) * 4;
              const anyValue = series.some((s) => m[s.key] > 0);

              return (
                <g key={m.key}>
                  {series.map((s, n) => {
                    const value = m[s.key];
                    const x = centre - groupWidth / 2 + n * (barWidth + 4);
                    if (value <= 0) return null;
                    return (
                      <rect
                        key={s.key}
                        x={x}
                        y={y(value)}
                        width={barWidth}
                        height={Math.max(1, T + ph - y(value))}
                        rx={3}
                        fill={s.colour}
                      />
                    );
                  })}

                  {/* Nothing recorded is not the same claim as nothing spent. */}
                  {!anyValue && (
                    <>
                      <rect
                        x={centre - barWidth / 2}
                        y={y(0) - 7}
                        width={barWidth}
                        height={7}
                        rx={2}
                        fill="none"
                        stroke="var(--line)"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                      />
                      {emptyNote && (
                        <text
                          x={centre}
                          y={y(0) - 14}
                          textAnchor="middle"
                          fontSize={11}
                          fill="var(--ink-3)"
                        >
                          {emptyNote}
                        </text>
                      )}
                    </>
                  )}

                  <text
                    x={centre}
                    y={H - 20}
                    textAnchor="middle"
                    fontSize={13}
                    fontWeight={600}
                    fill="var(--ink-3)"
                  >
                    {m.label}
                  </text>
                </g>
              );
            })}

            <line
              x1={L}
              y1={y(0)}
              x2={W - R}
              y2={y(0)}
              stroke="var(--line)"
              strokeWidth={1.5}
            />

          </svg>

          {/* One real button per month, laid over the chart.

              The mockup used focusable rects inside the SVG. They do not work:
              SVG focus is inconsistent across browsers, and in testing the
              focus event never fired at all, so the keyboard path was silently
              broken while looking correct. Real buttons focus, take Enter and
              announce themselves everywhere, and the chart looks identical. */}
          <div className="hitrow" aria-label="Choose a month">
            {months.map((m, i) => (
              <button
                key={`hit-${m.key}`}
                type="button"
                className={`hit${focus === i ? ' is-on' : ''}`}
                style={{
                  left: `${((L + slot * i) / W) * 100}%`,
                  width: `${(slot / W) * 100}%`,
                  top: `${(T / H) * 100}%`,
                  height: `${(ph / H) * 100}%`,
                }}
                aria-label={`${m.label} ${m.year}. ${series
                  .map((s) => `${s.label} ${money(m[s.key], currency)}`)
                  .join(', ')}. Press Enter to show this month.`}
                onMouseEnter={() => setFocus(i)}
                onMouseLeave={() => setFocus(null)}
                onFocus={() => setFocus(i)}
                onBlur={() => setFocus(null)}
                onClick={() => onPick(m)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
