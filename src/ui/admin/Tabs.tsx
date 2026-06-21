import type { Dashboard, Fund } from '../../core/api-client';
import { formatGBP } from '../lib/format';

/* ----------------------------- Restricted funds ---------------------------- */

export function RestrictedTab({ dashboard, funds }: { dashboard: Dashboard; funds: Fund[] }) {
  const restricted = dashboard.byFund.filter((r) => r.restricted);
  const passThrough = dashboard.byFund.filter((r) => r.passThrough);

  return (
    <div className="stack">
      <div className="card">
        <div className="card-title">Ringfenced balances</div>
        <p className="muted" style={{ marginBottom: 'var(--sp-4)' }}>
          Restricted funds are legally ringfenced — they may only be spent on their stated purpose. This is
          what trustees and the Charity Commission expect you to track.
        </p>
        {restricted.length === 0 ? (
          <p className="faint">No restricted donations in this period.</p>
        ) : (
          <div className="ringfence">
            {restricted.map((row) => (
              <div className="rf" key={row.fundId}>
                <div className="row between">
                  <strong>{row.fundName}</strong>
                  <span className="pill pill-warn">Restricted</span>
                </div>
                <div className="value num" style={{ fontSize: 24, fontWeight: 800, margin: '6px 0' }}>
                  {formatGBP(row.totalPence)}
                </div>
                <div className="muted">{row.count} donations · held for its purpose</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {passThrough.length > 0 && (
        <div className="card">
          <div className="card-title">Pass-through — to forward on</div>
          <p className="muted" style={{ marginBottom: 'var(--sp-4)' }}>
            Collected on behalf of external charities. This is not mosque income — it is a liability you must
            forward on.
          </p>
          <div className="ringfence">
            {passThrough.map((row) => (
              <div className="rf passthrough" key={row.fundId}>
                <div className="row between">
                  <strong>{row.fundName}</strong>
                  <span className="pill pill-pass">To forward</span>
                </div>
                <div className="value num" style={{ fontSize: 24, fontWeight: 800, margin: '6px 0' }}>
                  {formatGBP(row.totalPence)}
                </div>
                <div className="muted">{row.count} donations</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="faint">{funds.filter((f) => !f.archived).length} donation options configured for this mosque.</p>
    </div>
  );
}
