import { useState } from 'react';
import {
  chargeActivationFee,
  createSubscription,
  onboard,
  type FundType,
  type OnboardResult,
  type PaymentResult,
  type SubscriptionResult,
} from '../../core/api-client';
import { formatGBP } from '../lib/format';

const STEPS = ['Register', 'Funds', 'Billing', 'Ready'];

const DEFAULT_FUND_OPTIONS: Array<{ name: string; type: FundType; restricted: boolean }> = [
  { name: 'Zakat', type: 'zakat', restricted: true },
  { name: 'Zakat al-Fitr (Fitrah)', type: 'zakat_al_fitr', restricted: true },
  { name: 'Sadaqah (general)', type: 'sadaqah', restricted: false },
  { name: 'Fidyah / Kaffarah', type: 'fidyah_kaffarah', restricted: true },
  { name: 'Building Fund', type: 'building', restricted: true },
  { name: 'External Charity (Pass-through)', type: 'passthrough', restricted: false },
];

const ACTIVATION_PRICE = 29900;
const ANNUAL_PRICE = 34900;

export interface OnboardHandoff {
  mosqueId: string;
  mosqueName: string;
  operatorId: string;
}

export function OnboardingFlow({ onFinish }: { onFinish?: (handoff: OnboardHandoff) => void }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [bank, setBank] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [enabled, setEnabled] = useState<Set<FundType>>(new Set(DEFAULT_FUND_OPTIONS.map((f) => f.type)));

  // Results from the contract
  const [mosque, setMosque] = useState<OnboardResult | null>(null);
  const [payment, setPayment] = useState<PaymentResult | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionResult | null>(null);

  const toggleFund = (type: FundType) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  async function createMosque() {
    setBusy(true);
    setError(null);
    try {
      const funds = DEFAULT_FUND_OPTIONS.filter((f) => enabled.has(f.type)).map((f) => ({
        name: f.name,
        type: f.type,
      }));
      const result = await onboard({
        mosque: { name, bankAccount: bank || undefined },
        operators: [{ name: operatorName, role: 'admin' }],
        funds,
      });
      setMosque(result);
      setStep(2);
    } catch (err) {
      setError(String((err as { message?: string })?.message ?? 'Could not create the mosque'));
    } finally {
      setBusy(false);
    }
  }

  async function activateAndSubscribe() {
    if (!mosque) return;
    setBusy(true);
    setError(null);
    try {
      const pay = await chargeActivationFee(mosque.mosque.id);
      setPayment(pay);
      const sub = await createSubscription(mosque.mosque.id);
      setSubscription(sub);
      setStep(3);
    } catch (err) {
      setError(String((err as { message?: string })?.message ?? 'Billing failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="onb">
      <div className="stepper">
        {STEPS.map((label, i) => (
          <Step key={label} index={i} current={step} label={label} last={i === STEPS.length - 1} />
        ))}
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--rc-danger)', color: 'var(--rc-danger-deep)' }}>
          {error}
        </div>
      )}

      {step === 0 && (
        <div className="onb-card">
          <h2>Register your mosque</h2>
          <p className="lead">A few details to set up your account.</p>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="mname">Mosque name</label>
              <input id="mname" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Masjid Al-Noor" />
            </div>
            <div className="field">
              <label htmlFor="contact">Contact email</label>
              <input id="contact" className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="treasurer@masjid.org" />
            </div>
            <div className="field">
              <label htmlFor="op">Lead operator</label>
              <input id="op" className="input" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="field full">
              <label htmlFor="bank">Bank account (for settlement)</label>
              <input id="bank" className="input" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="GB00 0000 0000 0000" />
            </div>
          </div>
          <div className="row" style={{ marginTop: 'var(--sp-5)' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!name.trim() || !operatorName.trim()}
              onClick={() => setStep(1)}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="onb-card">
          <h2>Configure funds</h2>
          <p className="lead">Pick the funds you’ll collect for. You can add custom funds later.</p>
          {DEFAULT_FUND_OPTIONS.map((f) => (
            <label className="fund-toggle" key={f.type}>
              <span className="nm">
                <input type="checkbox" checked={enabled.has(f.type)} onChange={() => toggleFund(f.type)} />
                {f.name}
              </span>
              <span className={`pill ${f.restricted ? 'pill-warn' : 'pill-muted'}`}>
                {f.type === 'passthrough' ? 'Pass-through' : f.restricted ? 'Restricted' : 'Unrestricted'}
              </span>
            </label>
          ))}
          <div className="row between" style={{ marginTop: 'var(--sp-5)' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(0)}>
              Back
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || enabled.size === 0} onClick={createMosque}>
              {busy ? 'Creating…' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="onb-card">
          <h2>Activate &amp; subscribe</h2>
          <p className="lead">One-time activation plus your annual platform subscription.</p>
          <div className="line-item">
            <span>Activation fee (one-time)</span>
            <span className="num">{formatGBP(ACTIVATION_PRICE)}</span>
          </div>
          <div className="line-item">
            <span>Annual subscription</span>
            <span className="num">{formatGBP(ANNUAL_PRICE)}/yr</span>
          </div>
          <div className="line-item total">
            <span>Due today</span>
            <span className="num">{formatGBP(ACTIVATION_PRICE + ANNUAL_PRICE)}</span>
          </div>
          <p className="faint" style={{ marginTop: 'var(--sp-3)' }}>
            Card details are handled by Stripe — they never touch this app.
          </p>
          <div className="row between" style={{ marginTop: 'var(--sp-5)' }}>
            <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
              Back
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={activateAndSubscribe}>
              {busy ? 'Processing…' : `Pay ${formatGBP(ACTIVATION_PRICE + ANNUAL_PRICE)}`}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="onb-card ready">
          <div className="tick">✓</div>
          <h2>{mosque?.mosque.name ?? 'Your mosque'} is ready</h2>
          <p className="lead">
            {payment ? `Activation paid (${formatGBP(payment.amountPence)}) · ` : ''}
            subscription {subscription?.status ?? 'active'}. Bismillah.
          </p>
          <div className="pair-state" style={{ textAlign: 'left' }}>
            <div className="reader-icon" />
            <div className="grow">
              <strong>One last thing — your card reader</strong>
              <div className="muted">
                Pair your Zettle reader to the operator’s phone in the Zettle app (over Bluetooth). It then
                works automatically on the collecting screen — there’s nothing to set up here.
              </div>
            </div>
          </div>
          {onFinish && mosque && (
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() =>
                onFinish({
                  mosqueId: mosque.mosque.id,
                  mosqueName: mosque.mosque.name,
                  operatorId: mosque.operators[0]?.id ?? '',
                })
              }
            >
              Open the collecting app →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Step({ index, current, label, last }: { index: number; current: number; label: string; last: boolean }) {
  const state = index < current ? 'done' : index === current ? 'active' : '';
  return (
    <>
      <div className={`step ${state}`}>
        <span className="dot">{index < current ? '✓' : index + 1}</span>
        <span className="lbl">{label}</span>
      </div>
      {!last && <span className="line" />}
    </>
  );
}
