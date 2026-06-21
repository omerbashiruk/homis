import type { Donation } from '../../core/api-client';
import { formatGBP } from '../lib/format';

type Phase = 'collecting' | 'processing' | 'confirm' | 'declined';

interface Props {
  phase: Phase;
  pendingFundName: string | null;
  pendingAmountPence: number;
  lastDonation: Donation | null;
  declineReason: string | null;
  onNext: () => void;
  onUndo: () => void;
  onRetry: () => void;
  onCancel: () => void;
}

function ContactlessIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 7c2.5 2.7 2.5 7.3 0 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 4.5c3.6 3.9 3.6 11.1 0 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.75" />
      <path d="M16 2c4.7 5.1 4.7 14.9 0 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

export function OperatorOverlay(props: Props) {
  if (props.phase === 'processing') {
    return (
      <div className="overlay" role="status" aria-live="assertive">
        <div className="tap-ring">
          <ContactlessIcon />
        </div>
        <div className="big">Present the reader</div>
        <div className="fund">
          {props.pendingFundName} · {formatGBP(props.pendingAmountPence)}
        </div>
        <div className="row center" style={{ gap: 'var(--sp-3)' }}>
          <span className="spinner" />
          <span className="sub">Waiting for tap…</span>
        </div>
      </div>
    );
  }

  if (props.phase === 'confirm' && props.lastDonation) {
    return (
      <div className="result ok" role="status" aria-live="assertive">
        <div className="tick">✓</div>
        <div className="amount num">{formatGBP(props.lastDonation.amountPence)}</div>
        <div className="fund">{props.lastDonation.fundName}</div>
        <div className="muted">Donation confirmed</div>
        <div className="actions">
          <button type="button" className="btn btn-ghost grow" onClick={props.onUndo}>
            ↺ Undo
          </button>
          <button type="button" className="btn btn-primary grow btn-lg" onClick={props.onNext}>
            Next donor →
          </button>
        </div>
      </div>
    );
  }

  if (props.phase === 'declined') {
    return (
      <div className="result bad" role="alert">
        <div className="tick cross">✕</div>
        <div className="fund">Card declined</div>
        <div className="muted">{props.declineReason ?? 'The card was declined.'}</div>
        <div className="actions">
          <button type="button" className="btn btn-ghost grow" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary grow btn-lg" onClick={props.onRetry}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return null;
}
