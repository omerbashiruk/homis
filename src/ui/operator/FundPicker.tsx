import type { Fund } from '../../core/api-client';
import { classify, classLabel, cssVars, fundColor } from '../lib/format';

interface Props {
  funds: Fund[];
  selectedFundId: string | null;
  onSelect: (fundId: string) => void;
  fill?: boolean;
}

export function FundPicker({ funds, selectedFundId, onSelect, fill = false }: Props) {
  return (
    <div className={`fundgrid${fill ? ' fill' : ''}`} role="group" aria-label="Choose a purpose">
      {funds.map((fund) => {
        const selected = fund.id === selectedFundId;
        return (
          <button
            key={fund.id}
            type="button"
            className={`fundtile${selected ? ' selected' : ''}`}
            style={cssVars({ '--tile-color': fundColor(fund.type) })}
            onClick={() => onSelect(fund.id)}
            aria-pressed={selected}
          >
            {selected && (
              <span className="check" aria-hidden="true">
                ✓
              </span>
            )}
            <span className="name">{fund.name}</span>
            <span className="meta">
              <span className="dot" />
              {classLabel(classify(fund))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
