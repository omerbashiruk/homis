import { useEffect, useState } from 'react';
import {
  addTeamMember,
  classifyFund,
  createFund,
  getFunds,
  listTeamMembers,
  removeTeamMember,
  setFundArchived,
  updateFund,
  type Fund,
  type FundType,
  type TeamMember,
  type TeamRole,
} from '../../core/api-client';
import { classLabel } from '../lib/format';

const FUND_TYPES: Array<{ value: FundType; label: string }> = [
  { value: 'zakat', label: 'Zakat' },
  { value: 'zakat_al_fitr', label: 'Zakat al-Fitr (Fitrah)' },
  { value: 'sadaqah', label: 'Sadaqah' },
  { value: 'fidyah_kaffarah', label: 'Fidyah / Kaffarah' },
  { value: 'building', label: 'Building / capital project' },
  { value: 'general', label: 'General donation' },
  { value: 'passthrough', label: 'External charity (pass-through)' },
];

function classOf(type: FundType): 'restricted' | 'unrestricted' | 'passthrough' {
  const c = classifyFund(type);
  return c === 'pass_through' ? 'passthrough' : c;
}

function pillClass(c: 'restricted' | 'unrestricted' | 'passthrough'): string {
  return c === 'restricted' ? 'pill-warn' : c === 'passthrough' ? 'pill-warn' : 'pill-ok';
}

/* --------------------------- Donation options ---------------------------- */

export function OptionsTab({ mosqueId }: { mosqueId: string }) {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState<FundType>('sadaqah');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => setFunds(await getFunds(mosqueId));
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mosqueId]);

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createFund(mosqueId, { name: name.trim(), type });
      setName('');
      await refresh();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function archive(fund: Fund, archived: boolean) {
    await setFundArchived(fund.id, archived);
    await refresh();
  }

  async function saveName(fund: Fund) {
    if (editName.trim() && editName.trim() !== fund.name) {
      await updateFund(fund.id, { name: editName.trim() });
    }
    setEditingId(null);
    await refresh();
  }

  const active = funds.filter((f) => !f.archived);
  const archived = funds.filter((f) => f.archived);
  const previewClass = classOf(type);

  return (
    <div className="stack">
      <div className="card">
        <div className="card-title">Add a donation option</div>
        <div className="manage-form">
          <input
            className="input grow"
            placeholder="Option name — e.g. Masjid Roof Appeal"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select className="input" value={type} onChange={(e) => setType(e.target.value as FundType)}>
            {FUND_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-green" onClick={add} disabled={busy || !name.trim()}>
            Add option
          </button>
        </div>
        <p className="faint" style={{ marginTop: 'var(--sp-2)' }}>
          This option will be <strong>{classLabel(previewClass)}</strong> based on its type.
          {previewClass === 'restricted' && ' Funds are legally ringfenced to their stated purpose.'}
          {previewClass === 'passthrough' && ' Treated as a liability to forward on, not mosque income.'}
        </p>
        {error && <p style={{ color: 'var(--rc-danger-deep)' }}>{error}</p>}
      </div>

      <div className="card">
        <div className="card-title">Active options ({active.length})</div>
        <table className="table">
          <thead>
            <tr>
              <th>Option</th>
              <th>Classification</th>
              <th className="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            {active.map((fund) => {
              const c = fund.passThrough ? 'passthrough' : fund.restricted ? 'restricted' : 'unrestricted';
              return (
                <tr key={fund.id}>
                  <td>
                    {editingId === fund.id ? (
                      <input
                        className="input"
                        value={editName}
                        autoFocus
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveName(fund)}
                      />
                    ) : (
                      <strong>{fund.name}</strong>
                    )}
                  </td>
                  <td>
                    <span className={`pill ${pillClass(c)}`}>{classLabel(c)}</span>
                  </td>
                  <td className="num">
                    {editingId === fund.id ? (
                      <button type="button" className="btn btn-green btn-row" onClick={() => saveName(fund)}>
                        Save
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost btn-row"
                          onClick={() => {
                            setEditingId(fund.id);
                            setEditName(fund.name);
                          }}
                        >
                          Rename
                        </button>
                        <button type="button" className="btn btn-ghost btn-row" onClick={() => archive(fund, true)}>
                          Retire
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {archived.length > 0 && (
        <div className="card">
          <div className="card-title">Retired options ({archived.length})</div>
          <table className="table">
            <tbody>
              {archived.map((fund) => (
                <tr key={fund.id}>
                  <td className="muted">{fund.name}</td>
                  <td className="num">
                    <button type="button" className="btn btn-ghost btn-row" onClick={() => archive(fund, false)}>
                      Restore
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="faint" style={{ marginTop: 'var(--sp-3)' }}>
            Retired options stay in historical reports but are hidden from collecting.
          </p>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- Team ----------------------------------- */

const TEAM_ROLES: TeamRole[] = ['admin', 'treasurer', 'trustee'];

export function TeamTab({ mosqueId }: { mosqueId: string }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('treasurer');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => setMembers(await listTeamMembers(mosqueId));
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mosqueId]);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await addTeamMember(mosqueId, { name: name.trim(), email: email.trim(), role });
      setName('');
      setEmail('');
      await refresh();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await removeTeamMember(id);
    await refresh();
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="card-title">Invite a team member</div>
        <p className="muted" style={{ marginBottom: 'var(--sp-4)' }}>
          People who can sign in to this dashboard. Collecting uses one shared mosque account — separate from this.
        </p>
        <div className="manage-form">
          <input className="input grow" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <input
            className="input grow"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>
            {TEAM_ROLES.map((r) => (
              <option key={r} value={r}>
                {r[0].toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-green" onClick={add} disabled={busy || !name.trim() || !email.trim()}>
            Invite
          </button>
        </div>
        {error && <p style={{ color: 'var(--rc-danger-deep)' }}>{error}</p>}
      </div>

      <div className="card">
        <div className="card-title">Team ({members.length})</div>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th className="num">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>
                  <strong>{m.name}</strong>
                </td>
                <td className="muted">{m.email}</td>
                <td>
                  <span className="pill pill-muted">{m.role[0].toUpperCase() + m.role.slice(1)}</span>
                </td>
                <td className="num">
                  <button type="button" className="btn btn-ghost btn-row" onClick={() => remove(m.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function msg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Something went wrong';
}
