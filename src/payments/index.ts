/**
 * Zettle integration seam (§4). The real Zettle Payments SDK is a mobile SDK
 * that runs in the operator's device layer over Bluetooth; this module owns the
 * CONTRACT and LOGIC around it — what we send, how we read the result, and the
 * idempotency reference. In Step 0 a deterministic sandbox reader stands in so
 * the whole donate flow is exercisable without hardware.
 *
 * The fund tag is NEVER Zettle's — it is attached by us at save time (§4.4).
 */

import { randomId } from '../core/runtime';
import type { FundId, Money, ReaderStatus, UUID } from '../core/types';

export interface ZettleChargeInput {
  amountPence: Money;
  /** Internal draft reference — our idempotency key, not Zettle's. */
  reference: string;
}

export type ZettleOutcome = 'success' | 'declined' | 'cancelled';

export interface ZettleResult {
  outcome: ZettleOutcome;
  zettleTxnId?: string;
  reason?: string;
}

export interface ZettleRefund {
  refundId: string;
}

export interface ZettleReader {
  getStatus(): ReaderStatus;
  pair(): Promise<ReaderStatus>;
  charge(input: ZettleChargeInput): Promise<ZettleResult>;
  refund(zettleTxnId: string | undefined, amountPence: Money): Promise<ZettleRefund>;
}

/**
 * Deterministic sandbox reader. Test hooks so every branch is reachable:
 *   amountPence === 1 → declined
 *   amountPence === 2 → cancelled
 *   otherwise         → success
 */
export class SandboxZettleReader implements ZettleReader {
  private connected = true;
  private readonly readerName = 'Zettle Reader (sandbox)';

  getStatus(): ReaderStatus {
    return { connected: this.connected, readerName: this.connected ? this.readerName : undefined };
  }

  async pair(): Promise<ReaderStatus> {
    this.connected = true;
    return this.getStatus();
  }

  async charge(input: ZettleChargeInput): Promise<ZettleResult> {
    if (input.amountPence === 1) return { outcome: 'declined', reason: 'card_declined' };
    if (input.amountPence === 2) return { outcome: 'cancelled' };
    return { outcome: 'success', zettleTxnId: `zttl_sb_${randomId()}` };
  }

  async refund(_zettleTxnId: string | undefined, _amountPence: Money): Promise<ZettleRefund> {
    return { refundId: `rfnd_sb_${randomId()}` };
  }
}

/** Process-wide sandbox reader. Swap for a real SDK bridge once the device layer exists. */
export const sandboxReader: ZettleReader = new SandboxZettleReader();

// ---------------------------------------------------------------------------
// §4.3 named surface. These mirror the spec's function names. The orchestration
// (persisting the Donation, attaching the fund tag) lives in the API/use-case
// layer (the backend) — these are the thin Zettle-facing primitives it calls.
// ---------------------------------------------------------------------------

export function isReaderConnected(): boolean {
  return sandboxReader.getStatus().connected;
}

export async function pairReader(): Promise<void> {
  await sandboxReader.pair();
}

export async function chargeForDonation(
  _fund: FundId,
  amountPence: Money,
  sessionId: UUID,
): Promise<ZettleResult> {
  const reference = `draft_${sessionId}_${randomId()}`;
  return sandboxReader.charge({ amountPence, reference });
}

export async function refundDonationCharge(
  zettleTxnId: string,
  amountPence: Money,
): Promise<ZettleRefund> {
  return sandboxReader.refund(zettleTxnId, amountPence);
}
