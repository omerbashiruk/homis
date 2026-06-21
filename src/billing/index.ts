/**
 * Stripe billing seam (§8). Two distinct charges:
 *   - Activation fee  → one-time Stripe PaymentIntent at sign-up.
 *   - Subscription    → recurring annual Stripe Subscription, billed before Ramadan.
 * Optional add-ons (design now, ship later): per-transaction fee, Gift Aid fee.
 *
 * Stripe handles PCI/card storage exactly as Zettle does for donations — we
 * never store raw card numbers. In Step 0 a stub returns correctly-shaped
 * results so Dev B can build the billing UI; swap for the real Stripe SDK later.
 */

import { randomId } from '../core/runtime';
import type { Money, PaymentResult, SubscriptionResult, UUID } from '../core/types';

/** Default prices (pence). Real amounts come from Stripe Price objects in production. */
export const ACTIVATION_FEE_PENCE: Money = 29900; // £299 one-time
export const ANNUAL_SUBSCRIPTION_PENCE: Money = 34900; // £349 / year

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export interface StripeBilling {
  createActivationPayment(mosqueId: UUID): Promise<PaymentResult>;
  createAnnualSubscription(mosqueId: UUID): Promise<SubscriptionResult>;
}

export class StubStripeBilling implements StripeBilling {
  async createActivationPayment(_mosqueId: UUID): Promise<PaymentResult> {
    return {
      status: 'succeeded',
      paymentIntentId: `pi_stub_${randomId()}`,
      amountPence: ACTIVATION_FEE_PENCE,
      clientSecret: `pi_stub_secret_${randomId()}`,
    };
  }

  async createAnnualSubscription(_mosqueId: UUID): Promise<SubscriptionResult> {
    const periodEnd = new Date(Date.now() + ONE_YEAR_MS).toISOString();
    return {
      status: 'active',
      subscriptionId: `sub_stub_${randomId()}`,
      currentPeriodEnd: periodEnd,
    };
  }
}

/** Process-wide stub billing. Swap for a real Stripe-backed implementation later. */
export const stubBilling: StripeBilling = new StubStripeBilling();

// ---------------------------------------------------------------------------
// §8 named surface. Persisted billing STATE (activationPaid, subscription
// status, currentPeriodEnd) is owned by the backend/db; these are the
// Stripe-facing primitives it calls.
// ---------------------------------------------------------------------------

export function chargeActivationFee(mosqueId: UUID): Promise<PaymentResult> {
  return stubBilling.createActivationPayment(mosqueId);
}

export function createSubscription(mosqueId: UUID): Promise<SubscriptionResult> {
  return stubBilling.createAnnualSubscription(mosqueId);
}
