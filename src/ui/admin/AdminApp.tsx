import { useEffect, useState } from 'react';
import { getDashboard, getFunds, type Dashboard, type Fund } from '../../core/api-client';
import { Reports } from './Reports';
import { RestrictedTab } from './Tabs';
import { OptionsTab, TeamTab } from './ManageTabs';
import { Treasury } from './Treasury';

type Tab = 'treasury' | 'options' | 'team' | 'restricted' | 'reports';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'treasury', label: 'Bank balance' },
  { id: 'options', label: 'Donation options' },
  { id: 'team', label: 'Team' },
  { id: 'restricted', label: 'Restricted funds' },
  { id: 'reports', label: 'Reports' },
];

interface Props {
  mosqueId: string;
  mosqueName: string;
  adminName: string;
  onSignOut: () => void;
}

export function AdminApp({ mosqueId, mosqueName, adminName, onSignOut }: Props) {
  const [tab, setTab] = useState<Tab>('treasury');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const [d, f] = await Promise.all([getDashboard(mosqueId), getFunds(mosqueId)]);
        if (alive) {
          setDashboard(d);
          setFunds(f);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [mosqueId]);

  return (
    <div className="admin">
      <div className="admin-head">
        <div className="row between wrap">
          <div>
            <h1>{mosqueName}</h1>
            <div className="sub">Treasurer dashboard · signed in as {adminName}</div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'treasury' && <Treasury mosqueId={mosqueId} />}
      {tab === 'options' && <OptionsTab mosqueId={mosqueId} />}
      {tab === 'team' && <TeamTab mosqueId={mosqueId} />}
      {tab === 'reports' && <Reports mosqueId={mosqueId} />}
      {tab === 'restricted' &&
        (loading || !dashboard ? (
          <div className="row center" style={{ padding: 'var(--sp-8)' }}>
            <span className="spinner" />
          </div>
        ) : (
          <RestrictedTab dashboard={dashboard} funds={funds} />
        ))}
    </div>
  );
}
