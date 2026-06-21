import { useEffect, useMemo, useState } from 'react';
import {
  completeDisbursement,
  getReport,
  getTreasury,
  recordDisbursement,
  scheduleDisbursement,
  voidDisbursement,
  type AccountantExportRow,
  type Treasury as TreasuryData,
  type TreasuryPot,
} from '../../core/api-client';
import { formatGBP, shortDate } from '../lib/format';
import { BalanceComposition } from './Charts';

const STATUS_LABEL: Record<TreasuryPot['status'], string> = {
  available: 'Available',
  outstanding: 'To disburse',
  partial: 'Partly done',
  complete: 'Complete',
  over_disbursed: 'Over-disbursed',
};
const STATUS_CLASS: Record<TreasuryPot['status'], string> = {
  available: 'pill-muted',
  outstanding: 'pill-warn',
  partial: 'pill-warn',
  complete: 'pill-ok',
  over_disbursed: 'pill-danger',
};

function msg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Something went wrong';
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function Treasury({ mosqueId }: { mosqueId: string }) {
  const [treasury, setTreasury] = useState<TreasuryData | null>(null);
  const [rows, setRows] = useState<AccountantExportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [schedulingFor, setSchedulingFor] = useState<TreasuryPot | null>(null);

  const refresh = async () => {
    const [t, report] = await Promise.all([getTreasury(mosqueId), getReport(mosqueId)]);
    setTreasury(t);
    setRows(report.accountantExport.rows);
  };
  useEffect(() => {
    setLoading(true);
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mosqueId]);

  if (loading || !treasury) {
    return (
      <div className="row center" style={{ padding: 'var(--sp-8)' }}>
        <span className="spinner" />
      </div>
    );
  }

  return (
    <div className="stack">
      <div className="card no-print">
        <div className="card-title">Composition of the bank balance</div>
        <BalanceComposition treasury={treasury} />
      </div>

      <PeriodCollections rows={rows} />

      {treasury.scheduled.length > 0 && (
        <div className="card no-print">
          <div className="card-title">Scheduled payments — tick when done</div>
          <table className="table">
            <thead>
              <tr>
                <th>Done</th>
                <th>Due</th>
                <th>Fund</th>
                <th>Reference</th>
                <th className="num">Amount</th>
                <th className="num"></th>
              </tr>
            </thead>
            <tbody>
              {treasury.scheduled.map((d) => {
                const overdue = (d.dueOn ?? '') < todayIso();
                return (
                  <tr key={d.id} className={overdue ? 'overdue-row' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        className="tickbox"
                        aria-label={`Mark ${d.reference} done`}
                        onChange={async () => {
                          await completeDisbursement(d.id);
                          await refresh();
                        }}
                      />
                    </td>
                    <td>
                      {d.dueOn ? shortDate(d.dueOn) : '—'}
                      {overdue && <span className="pill pill-warn" style={{ marginLeft: 6 }}>overdue</span>}
                    </td>
                    <td>{d.fundName}</td>
                    <td>
                      {d.reference}
                      {d.externalRef ? ` · ${d.externalRef}` : ''}
                    </td>
                    <td className="num">{formatGBP(d.amountPence)}</td>
                    <td className="num">
                      <button
                        type="button"
                        className="btn btn-ghost btn-row"
                        onClick={async () => {
                          await voidDisbursement(d.id);
                          await refresh();
                        }}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="faint" style={{ marginTop: 'var(--sp-3)' }}>
            Scheduled payments are earmarked from each pot's free balance. Ticking one done moves it into the
            records below and takes the money out of the balance.
          </p>
        </div>
      )}

      <div className="card no-print">
        <div className="row between wrap" style={{ marginBottom: 'var(--sp-3)' }}>
          <div className="card-title" style={{ margin: 0 }}>
            Fund pots — what to do with the money
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()}>
            🖨 Print handling record
          </button>
        </div>
        <div className="pots">
          {treasury.pots.map((pot) => (
            <PotCard key={pot.fundId} pot={pot} onSchedule={() => setSchedulingFor(pot)} />
          ))}
        </div>
      </div>

      {treasury.recentDisbursements.length > 0 && (
        <div className="card no-print">
          <div className="card-title">Records</div>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Fund</th>
                <th>Reference</th>
                <th className="num">Amount</th>
                <th className="num"></th>
              </tr>
            </thead>
            <tbody>
              {treasury.recentDisbursements.map((d) => (
                <tr key={d.id} className={d.status === 'voided' ? 'voided-row' : ''}>
                  <td>{d.disbursedOn ?? '—'}</td>
                  <td>{d.fundName}</td>
                  <td>
                    {d.reference}
                    {d.externalRef ? ` · ${d.externalRef}` : ''}
                  </td>
                  <td className="num">{formatGBP(d.amountPence)}</td>
                  <td className="num">
                    {d.status === 'recorded' ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-row"
                        onClick={async () => {
                          await voidDisbursement(d.id);
                          await refresh();
                        }}
                      >
                        Void
                      </button>
                    ) : (
                      <span className="pill pill-muted">Voided</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <HandlingRecord treasury={treasury} />

      {schedulingFor && (
        <ScheduleModal
          mosqueId={mosqueId}
          pot={schedulingFor}
          onClose={() => setSchedulingFor(null)}
          onDone={async () => {
            setSchedulingFor(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

/* ----------------------------- Period collections ----------------------------- */

type Gran = 'day' | 'week' | 'month' | 'quarter';
const GRANS: Array<{ id: Gran; label: string }> = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
];

function startOf(gran: Gran, d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (gran === 'week') x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  if (gran === 'month') return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  if (gran === 'quarter') return new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1));
  return x;
}
function endOf(gran: Gran, start: Date): Date {
  const e = new Date(start);
  if (gran === 'day') e.setUTCDate(e.getUTCDate() + 1);
  else if (gran === 'week') e.setUTCDate(e.getUTCDate() + 7);
  else if (gran === 'month') e.setUTCMonth(e.getUTCMonth() + 1);
  else e.setUTCMonth(e.getUTCMonth() + 3);
  e.setUTCDate(e.getUTCDate() - 1);
  return e;
}
function shift(gran: Gran, anchor: Date, delta: number): Date {
  const a = new Date(anchor);
  if (gran === 'day') a.setUTCDate(a.getUTCDate() + delta);
  else if (gran === 'week') a.setUTCDate(a.getUTCDate() + 7 * delta);
  else if (gran === 'month') a.setUTCMonth(a.getUTCMonth() + delta);
  else a.setUTCMonth(a.getUTCMonth() + 3 * delta);
  return a;
}
function periodLabel(gran: Gran, start: Date): string {
  const y = start.getUTCFullYear();
  if (gran === 'quarter') return `Q${Math.floor(start.getUTCMonth() / 3) + 1} ${y}`;
  if (gran === 'month') return start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (gran === 'week')
    return `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })} – ${endOf('week', start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
  return start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function PeriodCollections({ rows }: { rows: AccountantExportRow[] }) {
  const confirmed = useMemo(() => rows.filter((r) => r.status === 'confirmed'), [rows]);
  const [gran, setGran] = useState<Gran>('quarter');
  // Anchor at the most recent donation so data shows by default; fall back to today.
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  useEffect(() => {
    const latest = confirmed.map((r) => r.date).sort().at(-1);
    if (latest) setAnchor(new Date(latest));
  }, [confirmed]);

  const start = startOf(gran, anchor);
  const end = endOf(gran, start);
  const fromIso = start.toISOString().slice(0, 10);
  const toIso = end.toISOString().slice(0, 10);

  const inWindow = confirmed.filter((r) => {
    const d = r.date.slice(0, 10);
    return d >= fromIso && d <= toIso;
  });
  const byFund = new Map<string, { fund: string; count: number; pence: number }>();
  for (const r of inWindow) {
    const e = byFund.get(r.fundId) ?? { fund: r.fund, count: 0, pence: 0 };
    e.count += 1;
    e.pence += r.amountPence;
    byFund.set(r.fundId, e);
  }
  const lines = [...byFund.values()].sort((a, b) => b.pence - a.pence);
  const total = lines.reduce((t, l) => t + l.pence, 0);

  return (
    <div className="card no-print">
      <div className="row between wrap" style={{ marginBottom: 'var(--sp-3)' }}>
        <div className="card-title" style={{ margin: 0 }}>
          Collected by period
        </div>
        <div className="seg">
          {GRANS.map((g) => (
            <button key={g.id} type="button" className={gran === g.id ? 'active' : ''} onClick={() => setGran(g.id)}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="period-nav">
        <button type="button" className="btn btn-ghost btn-row" onClick={() => setAnchor(shift(gran, anchor, -1))}>
          ‹
        </button>
        <span className="period-label">{periodLabel(gran, start)}</span>
        <button type="button" className="btn btn-ghost btn-row" onClick={() => setAnchor(shift(gran, anchor, 1))}>
          ›
        </button>
        <span className="grow" />
        <strong className="num period-total">{formatGBP(total)}</strong>
      </div>

      {lines.length === 0 ? (
        <p className="faint">No donations collected in this period.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Donation option</th>
              <th className="num">Donations</th>
              <th className="num">Collected</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.fund}>
                <td>{l.fund}</td>
                <td className="num">{l.count}</td>
                <td className="num">{formatGBP(l.pence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* --------------------------------- Pot card --------------------------------- */

function PotCard({ pot, onSchedule }: { pot: TreasuryPot; onSchedule: () => void }) {
  const pct = pot.collectedPence > 0 ? Math.round((pot.disbursedPence / pot.collectedPence) * 100) : 0;
  const canSchedule = pot.freePence > 0;
  return (
    <div className={`pot pot-${pot.status}`}>
      <div className="row between">
        <strong>{pot.fundName}</strong>
        <span className={`pill ${STATUS_CLASS[pot.status]}`}>{STATUS_LABEL[pot.status]}</span>
      </div>
      <div className="pot-figures">
        <span>
          Collected <strong className="num">{formatGBP(pot.collectedPence)}</strong>
        </span>
        <span>
          Disbursed <strong className="num">{formatGBP(pot.disbursedPence)}</strong>
        </span>
        <span>
          Remaining <strong className="num">{formatGBP(pot.remainingPence)}</strong>
        </span>
      </div>
      {pot.committedPence > 0 && (
        <div className="pot-commit">
          {formatGBP(pot.committedPence)} committed · <strong>{formatGBP(pot.freePence)} free</strong>
        </div>
      )}
      <div className="pot-track">
        <div className="pot-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      {pot.status === 'over_disbursed' && (
        <div className="pot-warn">
          Disbursed more than is currently held — a donation was refunded after payout. Review.
        </div>
      )}
      {canSchedule && (
        <button type="button" className="btn btn-green btn-sm" onClick={onSchedule}>
          {pot.classification === 'pass_through' ? 'Schedule a forward' : 'Schedule a payment'}
        </button>
      )}
    </div>
  );
}

/* ------------------------------ Schedule modal ------------------------------ */

function ScheduleModal({
  mosqueId,
  pot,
  onClose,
  onDone,
}: {
  mosqueId: string;
  pot: TreasuryPot;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'schedule' | 'record'>('schedule');
  const [pounds, setPounds] = useState('');
  const [reference, setReference] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPass = pot.classification === 'pass_through';
  const amountPence = Math.round((Number.parseFloat(pounds) || 0) * 100);
  const overFree = amountPence > pot.freePence;
  const invalid = amountPence <= 0 || overFree || !reference.trim();

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'schedule') {
        await scheduleDisbursement(mosqueId, {
          fundId: pot.fundId,
          amountPence,
          reference: reference.trim(),
          externalRef: externalRef.trim() || undefined,
          dueOn: date || undefined,
        });
      } else {
        await recordDisbursement(mosqueId, {
          fundId: pot.fundId,
          amountPence,
          reference: reference.trim(),
          externalRef: externalRef.trim() || undefined,
          disbursedOn: date || undefined,
        });
      }
      await onDone();
    } catch (e) {
      setError(msg(e));
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-title" style={{ margin: 0 }}>
          {isPass ? 'Forward money' : 'Pay out'} — {pot.fundName}
        </div>
        <p className="muted">
          Free to {isPass ? 'forward' : 'spend'}: <strong>{formatGBP(pot.freePence)}</strong>
        </p>

        <div className="seg" style={{ alignSelf: 'flex-start' }}>
          <button type="button" className={mode === 'schedule' ? 'active' : ''} onClick={() => setMode('schedule')}>
            Schedule for later
          </button>
          <button type="button" className={mode === 'record' ? 'active' : ''} onClick={() => setMode('record')}>
            Already paid
          </button>
        </div>

        <div className="field">
          <label>Amount (£)</label>
          <input
            className="input"
            inputMode="decimal"
            value={pounds}
            onChange={(e) => setPounds(e.target.value)}
            placeholder="0.00"
            autoFocus
          />
        </div>
        <div className="field">
          <label>{isPass ? 'Forward to (charity / reference)' : 'Pay to / purpose'}</label>
          <input
            className="input"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={isPass ? 'e.g. Islamic Relief — Gaza appeal' : 'e.g. Pay 8 eligible families'}
          />
        </div>
        <div className="field">
          <label>Bank ref / cheque no. (optional)</label>
          <input className="input" value={externalRef} onChange={(e) => setExternalRef(e.target.value)} />
        </div>
        <div className="field">
          <label>{mode === 'schedule' ? 'Due by' : 'Date paid'}</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {overFree && <p style={{ color: 'var(--rc-danger-deep)' }}>More than the free balance.</p>}
        {error && <p style={{ color: 'var(--rc-danger-deep)' }}>{error}</p>}
        <div className="row between" style={{ marginTop: 'var(--sp-4)' }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-green" disabled={busy || invalid} onClick={submit}>
            {busy ? 'Saving…' : mode === 'schedule' ? 'Schedule it' : 'Record it'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Printable record ----------------------------- */

function HandlingRecord({ treasury }: { treasury: TreasuryData }) {
  return (
    <div className="card report-doc print-only">
      <div className="report-head">
        <h2>Fund handling record</h2>
        <div className="muted">
          Expected in account {formatGBP(treasury.expectedBalancePence)} · {formatGBP(treasury.totalCommittedPence)}{' '}
          committed · generated {treasury.generatedAt.slice(0, 10)}
        </div>
      </div>

      <h3 className="report-h3">Balances held by fund</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Fund</th>
            <th className="num">Collected</th>
            <th className="num">Disbursed</th>
            <th className="num">Committed</th>
            <th className="num">Free</th>
          </tr>
        </thead>
        <tbody>
          {treasury.pots.map((p) => (
            <tr key={p.fundId}>
              <td>{p.fundName}</td>
              <td className="num">{formatGBP(p.collectedPence)}</td>
              <td className="num">{formatGBP(p.disbursedPence)}</td>
              <td className="num">{formatGBP(p.committedPence)}</td>
              <td className="num">{formatGBP(p.freePence)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {treasury.scheduled.length > 0 && (
        <>
          <h3 className="report-h3">Scheduled payments (to make)</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Due</th>
                <th>Fund</th>
                <th>Reference</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {treasury.scheduled.map((d) => (
                <tr key={d.id}>
                  <td>{d.dueOn ?? '—'}</td>
                  <td>{d.fundName}</td>
                  <td>{d.reference}</td>
                  <td className="num">{formatGBP(d.amountPence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3 className="report-h3">Records</h3>
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Fund</th>
            <th>Reference</th>
            <th className="num">Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {treasury.recentDisbursements.map((d) => (
            <tr key={d.id}>
              <td>{d.disbursedOn ?? '—'}</td>
              <td>{d.fundName}</td>
              <td>{d.reference}</td>
              <td className="num">{formatGBP(d.amountPence)}</td>
              <td>{d.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="report-foot faint">
        Handled by ____________________ Date __________ Signature ____________________ · Generated by Ramadan
        Close. Figures exclude card fees and payout timing.
      </p>
    </div>
  );
}
