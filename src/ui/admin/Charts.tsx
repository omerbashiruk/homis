import type { Treasury } from '../../core/api-client';
import { formatGBP } from '../lib/format';

const BUCKET_COLOR: Record<string, string> = {
  restricted: '#b3a890',
  pass_through: 'var(--rc-warning)',
  unrestricted: 'var(--rc-green-600)',
};

const AVAIL_COLOR = {
  committed: '#c4b99a',
  free: 'var(--rc-green-500)',
};

/** Composition of the bank balance: two aligned bars — earmark type, then availability. */
export function BalanceComposition({ treasury }: { treasury: Treasury }) {
  const total = treasury.expectedBalancePence;
  if (total <= 0) {
    return (
      <p className="muted">
        Nothing held right now — all collected money has been disbursed, or none collected yet.
      </p>
    );
  }
  const earmarkSegments = treasury.composition.filter((s) => s.remainingPence > 0);
  const hasCommitted = treasury.totalCommittedPence > 0;

  return (
    <div className="composition">
      <div className="comp-figure num">{formatGBP(total)}</div>
      <div className="comp-sub">
        expected in account &middot; {formatGBP(treasury.totalDisbursedPence)} already disbursed
      </div>

      {/* Bar 1: earmark — what the money is FOR */}
      <div className="comp-row-label">What it&apos;s earmarked for</div>
      <div className="comp-bar">
        {earmarkSegments.map((s) => (
          <div
            key={s.bucket}
            className="comp-seg"
            style={{ flexGrow: s.remainingPence, background: BUCKET_COLOR[s.bucket] }}
            title={`${s.label}: ${formatGBP(s.remainingPence)}`}
          />
        ))}
      </div>
      <div className="comp-legend">
        {treasury.composition.map((s) => (
          <span className="legend-item" key={s.bucket}>
            <span className="swatch-sm" style={{ background: BUCKET_COLOR[s.bucket] }} />
            {s.label} &mdash; {formatGBP(s.remainingPence)}
          </span>
        ))}
      </div>

      {/* Bar 2: availability — committed (scheduled) vs free to use */}
      <div className="comp-row-label" style={{ marginTop: 'var(--sp-4)' }}>
        Availability
        {hasCommitted && (
          <span className="comp-avail-note"> &mdash; tick a scheduled payment to free it</span>
        )}
      </div>
      <div className="comp-bar">
        {hasCommitted && (
          <div
            className="comp-seg"
            style={{ flexGrow: treasury.totalCommittedPence, background: AVAIL_COLOR.committed }}
            title={`Committed to scheduled payments: ${formatGBP(treasury.totalCommittedPence)}`}
          />
        )}
        <div
          className="comp-seg"
          style={{ flexGrow: Math.max(treasury.totalFreePence, 0), background: AVAIL_COLOR.free }}
          title={`Free: ${formatGBP(treasury.totalFreePence)}`}
        />
      </div>
      <div className="comp-legend">
        {hasCommitted && (
          <span className="legend-item">
            <span className="swatch-sm" style={{ background: AVAIL_COLOR.committed }} />
            Committed to scheduled payments &mdash; {formatGBP(treasury.totalCommittedPence)}
          </span>
        )}
        <span className="legend-item">
          <span className="swatch-sm" style={{ background: AVAIL_COLOR.free }} />
          Free &mdash; {formatGBP(treasury.totalFreePence)}
        </span>
      </div>

      <p className="faint" style={{ marginTop: 'var(--sp-3)' }}>
        The money your bank account should be holding. Excludes card fees and payout timing.
      </p>
    </div>
  );
}
