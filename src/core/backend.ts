/**
 * The Backend interface is the seam that makes §11 work: the contract in
 * `api-client.ts` is defined once against this interface, and the concrete
 * implementation swaps underneath without Dev B changing a single import.
 *
 *   MockBackend  → in-memory fixtures (Step 0 default)
 *   HttpBackend  → real Fastify API over HTTP (swap in once §7 is live)
 */

import type {
  AddTeamMemberInput,
  BillingStatus,
  CreateFundInput,
  Dashboard,
  Disbursement,
  DonateInput,
  DonationResult,
  Donor,
  Fund,
  RecordDisbursementInput,
  ScheduleDisbursementInput,
  Treasury,
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

export interface DashboardQuery {
  from?: string;
  to?: string;
}

export interface ReportQuery {
  from?: string;
  to?: string;
}

export interface Backend {
  // Sessions
  startSession(input: StartSessionInput): Promise<Session>;
  getSession(sessionId: UUID): Promise<SessionState>;
  closeSession(sessionId: UUID): Promise<Session>;

  // Donations (the critical path, §3)
  donate(sessionId: UUID, input: DonateInput): Promise<DonationResult>;
  undoDonation(donationId: UUID): Promise<UndoResult>;
  refundDonation(donationId: UUID): Promise<RefundResult>;

  // Reader (operator device, §4.3)
  pairReader(): Promise<ReaderStatus>;
  getReaderStatus(): Promise<ReaderStatus>;

  // Read models
  getFunds(mosqueId: UUID): Promise<Fund[]>;
  getDashboard(mosqueId: UUID, query?: DashboardQuery): Promise<Dashboard>;
  getReport(mosqueId: UUID, query?: ReportQuery): Promise<Report>;
  searchDonors(mosqueId: UUID, query: string): Promise<Donor[]>;

  // Donation options (funds) — mosque-managed
  createFund(mosqueId: UUID, input: CreateFundInput): Promise<Fund>;
  updateFund(fundId: UUID, patch: UpdateFundInput): Promise<Fund>;
  setFundArchived(fundId: UUID, archived: boolean): Promise<Fund>;

  // Team (dashboard access) — mosque-managed
  listTeamMembers(mosqueId: UUID): Promise<TeamMember[]>;
  addTeamMember(mosqueId: UUID, input: AddTeamMemberInput): Promise<TeamMember>;
  removeTeamMember(memberId: UUID): Promise<{ id: UUID; removed: true }>;

  // Treasury — fund pots + disbursement ledger
  getTreasury(mosqueId: UUID): Promise<Treasury>;
  recordDisbursement(mosqueId: UUID, input: RecordDisbursementInput): Promise<Disbursement>;
  scheduleDisbursement(mosqueId: UUID, input: ScheduleDisbursementInput): Promise<Disbursement>;
  completeDisbursement(disbursementId: UUID): Promise<Disbursement>;
  voidDisbursement(disbursementId: UUID): Promise<{ disbursementId: UUID; status: 'voided' }>;

  // Onboarding + billing (§8)
  onboard(input: OnboardInput): Promise<OnboardResult>;
  chargeActivationFee(mosqueId: UUID): Promise<PaymentResult>;
  createSubscription(mosqueId: UUID): Promise<SubscriptionResult>;
  getBillingStatus(mosqueId: UUID): Promise<BillingStatus>;
}
