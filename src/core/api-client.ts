/**
 * THE CONTRACT (§11).
 *
 * Dev B imports ONLY from this file. Every function here has a stable signature
 * and returns the documented shape. The implementation behind it is selected at
 * runtime:
 *
 *   RAMADAN_CLOSE_BACKEND=mock  (default) → in-memory fixtures, realistic data
 *   RAMADAN_CLOSE_BACKEND=http            → real Fastify API at API_BASE_URL
 *
 * Swapping the backend must NEVER require Dev B to change an import. If you are
 * about to change a signature below, flag it explicitly (see the integration doc).
 */

import type { Backend, DashboardQuery, ReportQuery } from './backend';
import { HttpBackend } from './http-backend';
import { MockBackend } from './mock-backend';
import { readEnv } from './runtime';
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

// ---- Re-exports: Dev B gets types, errors, and fund helpers from one place ----
export * from './types';
/** Demo/mock convenience: seeded mosque id + shared collecting account. In production these come from auth. */
export { COLLECTING_OPERATOR_ID, DEMO_MOSQUE_ID } from './mock-data';
export { ApiError } from './errors';
export type { DashboardQuery, ReportQuery } from './backend';
export {
  classifyFund,
  isFundType,
  isPassThroughType,
  isRestrictedType,
  type FundClassification,
} from '../funds';

// ---- Backend selection ----

function createBackend(): Backend {
  const kind = readEnv('RAMADAN_CLOSE_BACKEND') ?? 'mock';
  if (kind === 'http') {
    return new HttpBackend(readEnv('API_BASE_URL') ?? 'http://localhost:8080');
  }
  return new MockBackend();
}

/** The active backend. Exposed for advanced use/tests; prefer the named functions below. */
export const backend: Backend = createBackend();

// ---- Sessions ----

export function startSession(input: StartSessionInput): Promise<Session> {
  return backend.startSession(input);
}
export function getSession(sessionId: UUID): Promise<SessionState> {
  return backend.getSession(sessionId);
}
export function closeSession(sessionId: UUID): Promise<Session> {
  return backend.closeSession(sessionId);
}

// ---- Donations (the critical path, §3) ----

export function donate(sessionId: UUID, input: DonateInput): Promise<DonationResult> {
  return backend.donate(sessionId, input);
}
export function undoDonation(donationId: UUID): Promise<UndoResult> {
  return backend.undoDonation(donationId);
}
export function refundDonation(donationId: UUID): Promise<RefundResult> {
  return backend.refundDonation(donationId);
}

// ---- Reader (operator device, §4.3) ----

export function pairReader(): Promise<ReaderStatus> {
  return backend.pairReader();
}
export function getReaderStatus(): Promise<ReaderStatus> {
  return backend.getReaderStatus();
}

// ---- Read models ----

export function getFunds(mosqueId: UUID): Promise<Fund[]> {
  return backend.getFunds(mosqueId);
}
export function getDashboard(mosqueId: UUID, query?: DashboardQuery): Promise<Dashboard> {
  return backend.getDashboard(mosqueId, query);
}
export function getReport(mosqueId: UUID, query?: ReportQuery): Promise<Report> {
  return backend.getReport(mosqueId, query);
}
export function searchDonors(mosqueId: UUID, query: string): Promise<Donor[]> {
  return backend.searchDonors(mosqueId, query);
}

// ---- Donation options (funds) — mosque-managed ----

export function createFund(mosqueId: UUID, input: CreateFundInput): Promise<Fund> {
  return backend.createFund(mosqueId, input);
}
export function updateFund(fundId: UUID, patch: UpdateFundInput): Promise<Fund> {
  return backend.updateFund(fundId, patch);
}
export function setFundArchived(fundId: UUID, archived: boolean): Promise<Fund> {
  return backend.setFundArchived(fundId, archived);
}

// ---- Team (dashboard access) — mosque-managed ----

export function listTeamMembers(mosqueId: UUID): Promise<TeamMember[]> {
  return backend.listTeamMembers(mosqueId);
}
export function addTeamMember(mosqueId: UUID, input: AddTeamMemberInput): Promise<TeamMember> {
  return backend.addTeamMember(mosqueId, input);
}
export function removeTeamMember(memberId: UUID): Promise<{ id: UUID; removed: true }> {
  return backend.removeTeamMember(memberId);
}

// ---- Treasury (fund pots + disbursements) — mosque-managed ----

export function getTreasury(mosqueId: UUID): Promise<Treasury> {
  return backend.getTreasury(mosqueId);
}
export function recordDisbursement(mosqueId: UUID, input: RecordDisbursementInput): Promise<Disbursement> {
  return backend.recordDisbursement(mosqueId, input);
}
export function scheduleDisbursement(mosqueId: UUID, input: ScheduleDisbursementInput): Promise<Disbursement> {
  return backend.scheduleDisbursement(mosqueId, input);
}
export function completeDisbursement(disbursementId: UUID): Promise<Disbursement> {
  return backend.completeDisbursement(disbursementId);
}
export function voidDisbursement(disbursementId: UUID): Promise<{ disbursementId: UUID; status: 'voided' }> {
  return backend.voidDisbursement(disbursementId);
}

// ---- Onboarding + billing (§8) ----

export function onboard(input: OnboardInput): Promise<OnboardResult> {
  return backend.onboard(input);
}
export function chargeActivationFee(mosqueId: UUID): Promise<PaymentResult> {
  return backend.chargeActivationFee(mosqueId);
}
export function createSubscription(mosqueId: UUID): Promise<SubscriptionResult> {
  return backend.createSubscription(mosqueId);
}
export function getBillingStatus(mosqueId: UUID): Promise<BillingStatus> {
  return backend.getBillingStatus(mosqueId);
}

/** Convenience object form of the same contract. */
export const apiClient = {
  startSession,
  getSession,
  closeSession,
  donate,
  undoDonation,
  refundDonation,
  pairReader,
  getReaderStatus,
  getFunds,
  getDashboard,
  getReport,
  searchDonors,
  createFund,
  updateFund,
  setFundArchived,
  listTeamMembers,
  addTeamMember,
  removeTeamMember,
  getTreasury,
  recordDisbursement,
  scheduleDisbursement,
  completeDisbursement,
  voidDisbursement,
  onboard,
  chargeActivationFee,
  createSubscription,
  getBillingStatus,
} as const;
