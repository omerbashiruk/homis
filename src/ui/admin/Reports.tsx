import { useEffect, useMemo, useState } from 'react';
import { getReport, type AccountantExportRow } from '../../core/api-client';
import { formatGBP, shortDate, weekLabel, weekStart } from '../lib/format';
import { aggregateByTypeWeek, downloadAuditCsv, downloadTypeWeekCsv } from './exports';

function addDays(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function prettyClass(c: string): string {
  if (c === 'pass_through') return 'Pass-through';
  return c.charAt(0).toUpperCase() + c.slice(1);
}

interface Range {
  from: string;
  to: string;
  label: string;
}

export function Reports({ mosqueId }: { mosqueId: string }) {
  const [rows, setRows] = useState<AccountantExportRow[]>([]);
  const [periodLabel, setPeriodLabel] = useState('Ramadan');
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range | null>(null);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const report = await getReport(mosqueId);
      if (!alive) return;
      setRows(report.accountantExport.rows);
      setPeriodLabel(report.periodLabel);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [mosqueId]);

  const weeks = useMemo(
    () => Array.from(new Set(rows.filter((r) => r.status === 'confirmed').map((r) => weekStart(r.date)))).sort(),
    [rows],
  );

  const filteredRows = useMemo(() => {
    if (!range) return rows;
    return rows.filter((r) => {
      const d = r.date.slice(0, 10);
      return d >= range.from && d <= range.to;
    });
  }, [rows, range]);

  const filteredConfirmed = filteredRows.filter((r) => r.status === 'confirmed');
  const sumClass = (cls: string) =>
    filteredConfirmed.filter((r) => r.classification === cls).reduce((t, r) => t + r.amountPence, 0);
  const restricted = sumClass('restricted');
  const unrestricted = sumClass('unrestricted');
  const passthrough = sumClass('pass_through');
  const total = restricted + unrestricted + passthrough;

  const byOption = (cls: string) => {
    const m = new Map<string, { fund: string; count: number; pence: number }>();
    for (const r of filteredConfirmed.filter((row) => row.classification === cls)) {
      const e = m.get(r.fundId) ?? { fund: r.fund, count: 0, pence: 0 };
      e.count += 1;
      e.pence += r.amountPence;
      m.set(r.fundId, e);
    }
    return [...m.values()].sort((a, b) => b.pence - a.pence);
  };

  const rangeLabel = range ? range.label : `All of ${periodLabel}`;
  const exportLabel = range ? `${periodLabel}-${range.from}` : periodLabel;

  if (loading) {
    return (
      <div className="row center" style={{ padding: 'var(--sp-8)' }}>
        <span className="spinner" />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="card no-print">
        <div className="card-title">Period</div>
        <div className="range-row">
          <button type="button" className={`chip-btn${!range ? ' active' : ''}`} onClick={() => setRange(null)}>
            All of {periodLabel}
          </button>
          {weeks.map((w) => {
            const active = range?.from === w && range?.to === addDays(w, 6);
            return (
              <button
                key={w}
                type="button"
                className={`chip-btn${active ? ' active' : ''}`}
                onClick={() => setRange({ from: w, to: addDays(w, 6), label: `Week of ${weekLabel(w).replace('w/c ', '')}` })}
              >
                {weekLabel(w)}
              </button>
            );
          })}
        </div>
        <div className="range-custom">
          <label className="field">
            <span>From</span>
            <input type="date" className="input" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </label>
          <label className="field">
            <span>To</span>
            <input type="date" className="input" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </label>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={!customFrom || !customTo || customFrom > customTo}
            onClick={() => setRange({ from: customFrom, to: customTo, label: `${shortDate(customFrom)} – ${shortDate(customTo)}` })}
          >
            Apply range
          </button>
        </div>
        <div className="row wrap" style={{ gap: 'var(--sp-3)', marginTop: 'var(--sp-4)' }}>
          <button type="button" className="btn btn-green" onClick={() => downloadTypeWeekCsv(filteredRows, exportLabel)}>
            ⤓ Export by type / week (CSV)
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => downloadAuditCsv(filteredRows, exportLabel)}>
            ⤓ Full audit (per donation)
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
            🖨 Print / save trustee report
          </button>
        </div>
      </div>

      <div className="card report-doc">
        <div className="report-head">
          <h2>Trustee compliance report</h2>
          <div className="muted">
            {rangeLabel} · {formatGBP(total)} raised
          </div>
        </div>

        <div className="stats">
          <div className="stat">
            <div className="label">Total raised</div>
            <div className="value gold num">{formatGBP(total)}</div>
          </div>
          <div className="stat">
            <div className="label">Restricted (held)</div>
            <div className="value green num">{formatGBP(restricted)}</div>
          </div>
          <div className="stat">
            <div className="label">Unrestricted</div>
            <div className="value num">{formatGBP(unrestricted)}</div>
          </div>
          <div className="stat">
            <div className="label">Pass-through (to forward)</div>
            <div className="value warn num">{formatGBP(passthrough)}</div>
          </div>
        </div>

        <h3 className="report-h3">Restricted funds — held for their purpose</h3>
        <p className="muted">
          Legally ringfenced. These may only be spent on their stated purpose, not on general running costs.
        </p>
        {byOption('restricted').length === 0 ? (
          <p className="faint">None in this period.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Fund</th>
                <th className="num">Donations</th>
                <th className="num">Held</th>
              </tr>
            </thead>
            <tbody>
              {byOption('restricted').map((o) => (
                <tr key={o.fund}>
                  <td>{o.fund}</td>
                  <td className="num">{o.count}</td>
                  <td className="num">{formatGBP(o.pence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3 className="report-h3">Pass-through — owed to other charities</h3>
        <p className="muted">Collected on behalf of external causes. Not mosque income — these must be forwarded on.</p>
        {byOption('pass_through').length === 0 ? (
          <p className="faint">None in this period.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Cause</th>
                <th className="num">Donations</th>
                <th className="num">To forward</th>
              </tr>
            </thead>
            <tbody>
              {byOption('pass_through').map((o) => (
                <tr key={o.fund}>
                  <td>{o.fund}</td>
                  <td className="num">{o.count}</td>
                  <td className="num">{formatGBP(o.pence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3 className="report-h3">Weekly breakdown by donation type</h3>
        {filteredConfirmed.length === 0 ? (
          <p className="faint">No donations in this period.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Week</th>
                <th>Donation option</th>
                <th>Classification</th>
                <th className="num">Donations</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {aggregateByTypeWeek(filteredRows).map((e, i) => (
                <tr key={`${e.week}-${e.fund}-${i}`}>
                  <td>{weekLabel(e.week)}</td>
                  <td>{e.fund}</td>
                  <td>{prettyClass(e.classification)}</td>
                  <td className="num">{e.count}</td>
                  <td className="num">{formatGBP(e.pence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <p className="report-foot faint">
          Every donation was classified by fund at the point of capture via the card reader. Refunds and undone
          (voided) donations are excluded from the totals above. Generated by Ramadan Close · {rangeLabel}.
        </p>
      </div>
    </div>
  );
}
