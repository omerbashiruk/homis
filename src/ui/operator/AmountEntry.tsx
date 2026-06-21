import { formatGBP, formatGBPwhole } from '../lib/format';

interface Props {
  amountPence: number;
  onDigit: (d: number) => void;
  onBackspace: () => void;
  onClear: () => void;
  onPreset: (pence: number) => void;
  fill?: boolean;
}

const PRESETS = [500, 1000, 2000, 5000, 10000];

export function AmountEntry({ amountPence, onDigit, onBackspace, onClear, onPreset, fill = false }: Props) {
  return (
    <div className={`amount-card${fill ? ' fill' : ''}`}>
      <div className={`amount-display num${amountPence === 0 ? ' empty' : ''}`} aria-live="polite">
        {formatGBP(amountPence)}
      </div>

      <div className="presets">
        {PRESETS.map((pence) => (
          <button key={pence} type="button" className="preset" onClick={() => onPreset(pence)}>
            {formatGBPwhole(pence)}
          </button>
        ))}
      </div>

      <div className="keypad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} type="button" className="key" onClick={() => onDigit(n)}>
            {n}
          </button>
        ))}
        <button type="button" className="key fn" onClick={onClear} aria-label="Clear amount">
          C
        </button>
        <button type="button" className="key" onClick={() => onDigit(0)}>
          0
        </button>
        <button type="button" className="key fn" onClick={onBackspace} aria-label="Delete last digit">
          ⌫
        </button>
      </div>
    </div>
  );
}
