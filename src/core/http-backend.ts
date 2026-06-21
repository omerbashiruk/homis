/**
 * HTTP implementation of the Backend contract. It maps each method onto the §7
 * REST endpoints, so it doubles as living documentation of the wire API the
 * Fastify server (src/api/) must implement. Not the Step 0 default — select it
 * with RAMADAN_CLOSE_BACKEND=http once those endpoints are live.
 */

import type { Backend, DashboardQuery, ReportQuery } from './backend';
import { ApiError } from './errors';
import type {
  AddTeamMemberInput,
  BillingStatus,
  CreateFundInput,
  Dashboard,
  Disbursement,
  RecordDisbursementInput,
  ScheduleDisbursementInput,
  Treasury,
  DonateInput,
  DonationResult,
  Donor,
  Fund,
  OnboardInput,
  OnboardResult,
  PaymentResult,
  ReaderStatus,
  RefundResult,
  Report,
  Session,
  SessionState,
  StartSessionInput,
  SubscriptionResult,
  TeamMember,
  UndoResult,
  UpdateFundInput,
  UUID,
} from './types';

type FetchLike = (url: string, init?: unknown) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export class HttpBackend implements Backend {
  constructor(private readonly baseUrl: string) {}

  // ---- Sessions ----
  startSession(input: StartSessionInput): Promise<Session> {
    return this.request('POST', '/session', input);
  }
  getSession(sessionId: UUID): Promise<SessionState> {
    return this.request('GET', `/session/${encodeURIComponent(sessionId)}`);
  }
  closeSession(sessionId: UUID): Promise<Session> {
    return this.request('POST', `/session/${encodeURIComponent(sessionId)}/close`);
  }

  // ---- Donations ----
  donate(sessionId: UUID, input: DonateInput): Promise<DonationResult> {
    return this.request('POST', `/session/${encodeURIComponent(sessionId)}/donate`, input);
  }
  undoDonation(donationId: UUID): Promise<UndoResult> {
    return this.request('POST', `/donation/${encodeURIComponent(donationId)}/undo`);
  }
  refundDonation(donationId: UUID): Promise<RefundResult> {
    return this.request('POST', `/donation/${encodeURIComponent(donationId)}/refund`);
  }

  // ---- Reader (device layer; served locally or by the API) ----
  pairReader(): Promise<ReaderStatus> {
    return this.request('POST', '/reader/pair');
  }
  getReaderStatus(): Promise<ReaderStatus> {
    return this.request('GET', '/reader/status');
  }

  // ---- Read models ----
  getFunds(mosqueId: UUID): Promise<Fund[]> {
    return this.request('GET', `/funds?${query({ mosqueId })}`);
  }
  getDashboard(mosqueId: UUID, q?: DashboardQuery): Promise<Dashboard> {
    return this.request('GET', `/dashboard?${query({ mosqueId, from: q?.from, to: q?.to })}`);
  }
  getReport(mosqueId: UUID, q?: ReportQuery): Promise<Report> {
    return this.request('GET', `/report?${query({ mosqueId, from: q?.from, to: q?.to })}`);
  }
  searchDonors(mosqueId: UUID, q: string): Promise<Donor[]> {
    return this.request('GET', `/donors/search?${query({ mosqueId, q })}`);
  }

  // ---- Donation options (funds) + team ----
  createFund(mosqueId: UUID, input: CreateFundInput): Promise<Fund> {
    return this.request('POST', '/funds', { mosqueId, ...input });
  }
  updateFund(fundId: UUID, patch: UpdateFundInput): Promise<Fund> {
    return this.request('PATCH', `/funds/${encodeURIComponent(fundId)}`, patch);
  }
  setFundArchived(fundId: UUID, archived: boolean): Promise<Fund> {
    return this.request('POST', `/funds/${encodeURIComponent(fundId)}/archive`, { archived });
  }
  listTeamMembers(mosqueId: UUID): Promise<TeamMember[]> {
    return this.request('GET', `/team?${query({ mosqueId })}`);
  }
  addTeamMember(mosqueId: UUID, input: AddTeamMemberInput): Promise<TeamMember> {
    return this.request('POST', '/team', { mosqueId, ...input });
  }
  removeTeamMember(memberId: UUID): Promise<{ id: UUID; removed: true }> {
    return this.request('DELETE', `/team/${encodeURIComponent(memberId)}`);
  }

  // ---- Treasury (fund pots + disbursements) ----
  getTreasury(mosqueId: UUID): Promise<Treasury> {
    return this.request('GET', `/treasury?${query({ mosqueId })}`);
  }
  recordDisbursement(mosqueId: UUID, input: RecordDisbursementInput): Promise<Disbursement> {
    return this.request('POST', '/disbursements', { mosqueId, ...input });
  }
  scheduleDisbursement(mosqueId: UUID, input: ScheduleDisbursementInput): Promise<Disbursement> {
    return this.request('POST', '/disbursements/schedule', { mosqueId, ...input });
  }
  completeDisbursement(disbursementId: UUID): Promise<Disbursement> {
    return this.request('POST', `/disbursements/${encodeURIComponent(disbursementId)}/complete`);
  }
  voidDisbursement(disbursementId: UUID): Promise<{ disbursementId: UUID; status: 'voided' }> {
    return this.request('POST', `/disbursements/${encodeURIComponent(disbursementId)}/void`);
  }

  // ---- Onboarding + billing ----
  onboard(input: OnboardInput): Promise<OnboardResult> {
    return this.request('POST', '/onboard', input);
  }
  chargeActivationFee(mosqueId: UUID): Promise<PaymentResult> {
    return this.request('POST', '/billing/activation', { mosqueId });
  }
  createSubscription(mosqueId: UUID): Promise<SubscriptionResult> {
    return this.request('POST', '/billing/subscription', { mosqueId });
  }
  getBillingStatus(mosqueId: UUID): Promise<BillingStatus> {
    return this.request('GET', `/billing/status?${query({ mosqueId })}`);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const fetchFn = (globalThis as { fetch?: FetchLike }).fetch;
    if (!fetchFn) throw new Error('global fetch is unavailable (Node 18+ required)');

    const res = await fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let code = 'http_error';
      let message = `request failed with status ${res.status}`;
      try {
        const payload = (await res.json()) as { code?: string; message?: string };
        if (payload.code) code = payload.code;
        if (payload.message) message = payload.message;
      } catch {
        // non-JSON error body — keep defaults
      }
      throw new ApiError(code, message, res.status);
    }

    return (await res.json()) as T;
  }
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  return search.toString();
}
