import { FundPicker } from './FundPicker';
import { AmountEntry } from './AmountEntry';
import { OperatorOverlay } from './ResultOverlays';
import { fundById, useStore } from '../state/store';
import { fundColor, formatGBP } from '../lib/format';

export function OperatorApp({ mosqueName, onSignOut }: { mosqueName: string; onSignOut: () => void }) {
  const { state, actions, options } = useStore();
  const op = state.operator;
  const selectedFund = fundById(state.funds, op.selectedFundId);
  const total = state.sessionState?.totalPence ?? 0;

  return (
    <div className="op2">
      <div className="op-acctbar">
        <div>
          <div className="acct-label">Collecting for</div>
          <div className="acct-name">{mosqueName}</div>
        </div>
        <div className="row" style={{ gap: 'var(--sp-2)' }}>
          <span className="op-today">
            Today <strong className="num">{formatGBP(total)}</strong>
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>

      {state.error && <div className="op-error">{state.error}</div>}

      {!state.ready ? (
        <div className="op-fill center">
          <span className="spinner" />
        </div>
      ) : op.view === 'purpose' ? (
        <div className="op-view">
          <div className="op-view-h">Choose a purpose</div>
          <FundPicker funds={options} selectedFundId={op.selectedFundId} onSelect={actions.choosePurpose} fill />
        </div>
      ) : (
        <div className="op-view">
          <button type="button" className="op-purpose-pill" onClick={actions.changePurpose}>
            <span
              className="swatch"
              style={{ background: selectedFund ? fundColor(selectedFund.type) : 'transparent' }}
            />
            <span className="grow">
              <span className="pp-label">Purpose</span>
              <span className="pp-name">{selectedFund?.name ?? 'Choose a purpose'}</span>
            </span>
            <span className="pp-change">Change ›</span>
          </button>

          <AmountEntry
            amountPence={op.amountPence}
            onDigit={actions.pushDigit}
            onBackspace={actions.backspace}
            onClear={actions.clearAmount}
            onPreset={actions.setAmount}
            fill
          />

          <button
            type="button"
            className="btn btn-primary btn-lg btn-block op-take"
            disabled={!op.selectedFundId || op.amountPence <= 0}
            onClick={actions.takePayment}
          >
            {op.amountPence > 0 ? `Take ${formatGBP(op.amountPence)}` : 'Enter an amount'}
          </button>
        </div>
      )}

      <OperatorOverlay
        phase={op.phase}
        pendingFundName={selectedFund?.name ?? null}
        pendingAmountPence={op.amountPence}
        lastDonation={op.lastDonation}
        declineReason={op.declineReason}
        onNext={actions.nextDonor}
        onUndo={async () => {
          await actions.undoLast();
          actions.nextDonor();
        }}
        onRetry={actions.retry}
        onCancel={actions.dismissResult}
      />
    </div>
  );
}
