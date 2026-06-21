/**
 * Receipts (§9). After every confirmed donation where donor contact is known,
 * send a confirmation. Sending is ALWAYS async and queued — it must never block
 * or fail the donation response. Anonymous donations are skipped upstream.
 *
 * Step 0 uses a console provider; swap in Twilio (SMS) / SendGrid (email) later
 * behind the same ReceiptProvider interface.
 */

import { formatGBP } from '../db/money';
import type { Money, UUID } from '../core/types';

export interface ReceiptPayload {
  donationId: UUID;
  to: { phone?: string; email?: string };
  amountPence: Money;
  fundName: string;
  mosqueName: string;
  date: string;
}

export interface ReceiptProvider {
  sendSms(phone: string, body: string): Promise<void>;
  sendEmail(email: string, subject: string, body: string): Promise<void>;
}

/** Logs instead of sending. Used in Step 0 / tests. */
export class ConsoleReceiptProvider implements ReceiptProvider {
  async sendSms(phone: string, body: string): Promise<void> {
    console.log(`[receipt:sms] -> ${phone}: ${body}`);
  }

  async sendEmail(email: string, subject: string, body: string): Promise<void> {
    console.log(`[receipt:email] -> ${email} | ${subject}: ${body}`);
  }
}

function renderBody(payload: ReceiptPayload): string {
  return `Thank you. ${formatGBP(payload.amountPence)} to ${payload.fundName} at ${payload.mosqueName} received on ${payload.date.slice(0, 10)}.`;
}

/**
 * Fire-and-forget queue. `enqueue` returns immediately; delivery happens on a
 * later tick and any provider error is swallowed (logged), never surfaced to the
 * donation path. A real implementation would back this with a durable queue.
 */
export class ReceiptsQueue {
  constructor(private readonly provider: ReceiptProvider) {}

  enqueue(payload: ReceiptPayload): void {
    setTimeout(() => {
      void this.deliver(payload);
    }, 0);
  }

  private async deliver(payload: ReceiptPayload): Promise<void> {
    const body = renderBody(payload);
    try {
      if (payload.to.phone) await this.provider.sendSms(payload.to.phone, body);
      if (payload.to.email) {
        await this.provider.sendEmail(payload.to.email, `Your donation to ${payload.mosqueName}`, body);
      }
    } catch (error) {
      console.error(`[receipt:error] donation ${payload.donationId}:`, error);
    }
  }
}

/** Process-wide receipts queue. */
export const receiptsQueue = new ReceiptsQueue(new ConsoleReceiptProvider());
