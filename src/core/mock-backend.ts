/**
 * In-memory implementation of the Backend contract. This is what Dev B builds
 * against in Step 0. It exercises the REAL domain logic — fund validation,
 * idempotent donate, classification-aware aggregation, billing state, async
 * receipts — just with fixtures instead of Postgres/Zettle/Stripe.
 *
 * Deterministic test hooks for the donate path (so Dev B can drive every branch):
 *   amountPence === 1  → declined  (persists a failed attempt)
 *   amountPence === 2  → cancelled (draft discarded, nothing saved)
 *   otherwise          → confirmed
 */

import { randomId } from './runtime';
import { stubBilling } from '../billing';
import { DEFAULT_FUNDS, findFund, validateFundAgainst } from '../funds';
import { classifyFund } from '../funds/rules';
import { receiptsQueue } from '../receipts';
import { sandboxReader } from '../payments';
import type { Backend, DashboardQuery, ReportQuery } from './backend';
import { conflict, notFound, validation } from './errors';
import { createSeededStore, type BillingState, type Store } from './mock-data';
import type {
  AddTeamMemberInput,
  BillingStatus,
  CompositionSegment,
  CreateFundInput,
  Dashboard,
  DashboardByFund,
  Disbursement,
  DisbursementStatus,
  PotStatus,
  RecordDisbursementInput,
  ScheduleDisbursementInput,
  Treasury,
  TreasuryPot,
  DashboardByNight,
  DashboardByOperator,
  DonateInput,
  Donation,
  DonationResult,
  Donor,
  Fund,
  FundBreakdownRow,
  Mosque,
  OnboardInput,
  OnboardResult,
  Operator,
  PaymentResult,
  ReaderStatus,
  RefundResult,
  Report,
  ReportFundLine,
  Session,
  SessionState,
  StartSessionInput,
  SubscriptionResult,
  TeamMember,
  UndoResult,
  UpdateFundInput,
  UUID,
} from './types';

const nowIso = (): string => new Date().toISOString();

export class MockBackend implements Backend {
  private readonly store: Store;

  constructor(store: Store = createSeededStore()) {
    this.store = store;
  }

  // ---------------- Sessions ----------------

  async startSession(input: StartSessionInput): Promise<Session> {
    this.mosqueOrThrow(input.mosqueId);
    const operator = this.store.operators.get(input.operatorId);
    if (!operator || operator.mosqueId !== input.mosqueId) {
      throw validation('operator does not belong to this mosque');
    }
    if (!input.label.trim()) throw validation('session label is required');

    const session: Session = {
      id: `sess_${randomId()}`,
      mosqueId: input.mosqueId,
      operatorId: input.operatorId,
      label: input.label.trim(),
      status: 'open',
      startedAt: nowIso(),
    };
    this.store.sessions.set(session.id, session);
    return session;
  }

  async getSession(sessionId: UUID): Promise<SessionState> {
    const session = this.sessionOrThrow(sessionId);
    const donations = this.donationsForSession(sessionId);
    const confirmed = donations.filter((donation) => donation.status === 'confirmed');

    return {
      session,
      totalPence: sumAmount(confirmed),
      donationCount: confirmed.length,
      fundBreakdown: this.fundBreakdown(session.mosqueId, confirmed),
      recentDonations: [...donations]
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 25),
    };
  }

  async closeSession(sessionId: UUID): Promise<Session> {
    const session = this.sessionOrThrow(sessionId);
    if (session.status === 'closed') return session;
    const closed: Session = { ...session, status: 'closed', endedAt: nowIso() };
    this.store.sessions.set(closed.id, closed);
    return closed;
  }

  // ---------------- Donations (critical path) ----------------

  async donate(sessionId: UUID, input: DonateInput): Promise<DonationResult> {
    const session = this.sessionOrThrow(sessionId);
    if (session.status === 'closed') throw conflict('session is closed');

    if (!Number.isInteger(input.amountPence) || input.amountPence <= 0) {
      throw validation('amountPence must be a positive integer (pence)');
    }

    const funds = this.fundsForMosque(session.mosqueId);
    if (!validateFundAgainst(funds, input.fundId, session.mosqueId)) {
      throw validation('fund does not belong to this mosque');
    }

    // Idempotency (§4.4): a retry with the same key never double-records.
    if (input.idempotencyKey) {
      const existingId = this.store.idempotency.get(input.idempotencyKey);
      if (existingId) {
        const existing = this.store.donations.get(existingId);
        if (existing) return { status: 'confirmed', donation: existing };
      }
    }

    const draftRef = input.idempotencyKey ?? `draft_${randomId()}`;
    const result = await sandboxReader.charge({ amountPence: input.amountPence, reference: draftRef });

    if (result.outcome === 'cancelled') {
      return { status: 'cancelled', draftRef };
    }

    if (result.outcome === 'declined') {
      // Persist the failed attempt (§4.2) — useful for the operator and reporting.
      this.persistDonation(session, input, 'failed', undefined);
      return { status: 'declined', draftRef, reason: result.reason ?? 'card_declined' };
    }

    const donation = this.persistDonation(session, input, 'confirmed', result.zettleTxnId);
    if (input.idempotencyKey) this.store.idempotency.set(input.idempotencyKey, donation.id);
    this.queueReceipt(session, input, donation);
    return { status: 'confirmed', donation };
  }

  async undoDonation(donationId: UUID): Promise<UndoResult> {
    const donation = this.donationOrThrow(donationId);
    const session = this.sessionOrThrow(donation.sessionId);
    if (session.status === 'closed') throw conflict('cannot undo after the session is closed');
    if (donation.status !== 'confirmed') throw conflict('only confirmed donations can be undone');

    this.store.donations.set(donation.id, { ...donation, status: 'voided' });
    return { donationId, status: 'undone' };
  }

  async refundDonation(donationId: UUID): Promise<RefundResult> {
    const donation = this.donationOrThrow(donationId);
    if (donation.status === 'refunded') {
      return { donationId, status: 'refunded', refundedPence: donation.amountPence };
    }
    if (donation.status !== 'confirmed') {
      throw conflict('only confirmed donations can be refunded');
    }

    const refund = await sandboxReader.refund(donation.zettleTxnId, donation.amountPence);
    this.store.donations.set(donation.id, { ...donation, status: 'refunded' });
    return {
      donationId,
      status: 'refunded',
      refundedPence: donation.amountPence,
      zettleRefundId: refund.refundId,
    };
  }

  // ---------------- Reader ----------------

  async pairReader(): Promise<ReaderStatus> {
    return sandboxReader.pair();
  }

  async getReaderStatus(): Promise<ReaderStatus> {
    return sandboxReader.getStatus();
  }

  // ---------------- Read models ----------------

  async getFunds(mosqueId: UUID): Promise<Fund[]> {
    this.mosqueOrThrow(mosqueId);
    return this.fundsForMosque(mosqueId);
  }

  async getDashboard(mosqueId: UUID, query?: DashboardQuery): Promise<Dashboard> {
    this.mosqueOrThrow(mosqueId);
    const confirmed = this.confirmedForMosque(mosqueId, query?.from, query?.to);
    const fundsById = this.fundMap(mosqueId);

    let restricted = 0;
    let unrestricted = 0;
    let passThrough = 0;
    for (const donation of confirmed) {
      const fund = fundsById.get(donation.fundId);
      const classification = fund ? classifyFund(fund.type) : 'unrestricted';
      if (classification === 'restricted') restricted += donation.amountPence;
      else if (classification === 'pass_through') passThrough += donation.amountPence;
      else unrestricted += donation.amountPence;
    }

    return {
      mosqueId,
      ramadanTotalPence: restricted + unrestricted + passThrough,
      donationCount: confirmed.length,
      restrictedTotalPence: restricted,
      unrestrictedTotalPence: unrestricted,
      passThroughLiabilityPence: passThrough,
      byNight: this.byNight(confirmed),
      byOperator: this.byOperator(confirmed),
      byFund: this.fundBreakdown(mosqueId, confirmed) as DashboardByFund[],
    };
  }

  async getReport(mosqueId: UUID, query?: ReportQuery): Promise<Report> {
    this.mosqueOrThrow(mosqueId);
    const confirmed = this.confirmedForMosque(mosqueId, query?.from, query?.to);
    const all = this.allForMosque(mosqueId, query?.from, query?.to);
    const fundsById = this.fundMap(mosqueId);

    const fundLines: ReportFundLine[] = this.fundBreakdown(mosqueId, confirmed).map((row) => {
      const fund = fundsById.get(row.fundId);
      return {
        fundId: row.fundId,
        fundName: row.fundName,
        classification: fund ? classifyFund(fund.type) : 'unrestricted',
        totalPence: row.totalPence,
        count: row.count,
      };
    });

    const restricted = fundLines.filter((l) => l.classification === 'restricted');
    const unrestricted = fundLines.filter((l) => l.classification === 'unrestricted');
    const passThrough = fundLines.filter((l) => l.classification === 'pass_through');
    const sumLines = (lines: ReportFundLine[]) => lines.reduce((t, l) => t + l.totalPence, 0);

    return {
      mosqueId,
      generatedAt: nowIso(),
      periodLabel: 'Ramadan 2026',
      trustee: {
        totalRaisedPence: sumAmount(confirmed),
        restrictedPence: sumLines(restricted),
        unrestrictedPence: sumLines(unrestricted),
        passThroughLiabilityPence: sumLines(passThrough),
        fundLines,
      },
      accountantExport: {
        rows: all.map((donation) => {
          const fund = fundsById.get(donation.fundId);
          return {
            donationId: donation.id,
            date: donation.createdAt,
            fundId: donation.fundId,
            fund: donation.fundName,
            classification: fund ? classifyFund(fund.type) : 'unrestricted',
            amountPence: donation.amountPence,
            status: donation.status,
            giftAidEligible: donation.giftAidEligible,
            zettleTxnId: donation.zettleTxnId,
          };
        }),
      },
    };
  }

  async searchDonors(mosqueId: UUID, query: string): Promise<Donor[]> {
    this.mosqueOrThrow(mosqueId);
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return [...this.store.donors.values()].filter((donor) => {
      if (donor.mosqueId !== mosqueId) return false;
      return (
        (donor.name ?? '').toLowerCase().includes(needle) ||
        (donor.phone ?? '').toLowerCase().includes(needle) ||
        (donor.email ?? '').toLowerCase().includes(needle)
      );
    });
  }

  // ---------------- Donation options (funds) ----------------

  async createFund(mosqueId: UUID, input: CreateFundInput): Promise<Fund> {
    this.mosqueOrThrow(mosqueId);
    const name = input.name.trim();
    if (!name) throw validation('a name is required');
    const clash = this.fundsForMosque(mosqueId).some(
      (f) => !f.archived && f.name.toLowerCase() === name.toLowerCase(),
    );
    if (clash) throw conflict('a donation option with that name already exists');
    const classification = classifyFund(input.type);
    const fund: Fund = {
      id: `fund_${randomId()}`,
      mosqueId,
      name,
      type: input.type,
      restricted: classification === 'restricted',
      passThrough: classification === 'pass_through',
      archived: false,
      notes: input.notes,
    };
    this.store.funds.set(fund.id, fund);
    return fund;
  }

  async updateFund(fundId: UUID, patch: UpdateFundInput): Promise<Fund> {
    const fund = this.store.funds.get(fundId);
    if (!fund) throw notFound(`fund ${fundId} not found`);
    const type = patch.type ?? fund.type;
    const classification = classifyFund(type);
    const updated: Fund = {
      ...fund,
      name: patch.name?.trim() ? patch.name.trim() : fund.name,
      type,
      restricted: classification === 'restricted',
      passThrough: classification === 'pass_through',
      notes: patch.notes ?? fund.notes,
    };
    this.store.funds.set(fund.id, updated);
    return updated;
  }

  async setFundArchived(fundId: UUID, archived: boolean): Promise<Fund> {
    const fund = this.store.funds.get(fundId);
    if (!fund) throw notFound(`fund ${fundId} not found`);
    const updated: Fund = { ...fund, archived };
    this.store.funds.set(fund.id, updated);
    return updated;
  }

  // ---------------- Team (dashboard access) ----------------

  async listTeamMembers(mosqueId: UUID): Promise<TeamMember[]> {
    this.mosqueOrThrow(mosqueId);
    return [...this.store.team.values()].filter((member) => member.mosqueId === mosqueId);
  }

  async addTeamMember(mosqueId: UUID, input: AddTeamMemberInput): Promise<TeamMember> {
    this.mosqueOrThrow(mosqueId);
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    if (!name) throw validation('a name is required');
    if (!email.includes('@')) throw validation('a valid email is required');
    const clash = [...this.store.team.values()].some(
      (member) => member.mosqueId === mosqueId && member.email.toLowerCase() === email,
    );
    if (clash) throw conflict('that email is already on the team');
    const member: TeamMember = { id: `team_${randomId()}`, mosqueId, name, email, role: input.role };
    this.store.team.set(member.id, member);
    return member;
  }

  async removeTeamMember(memberId: UUID): Promise<{ id: UUID; removed: true }> {
    if (!this.store.team.has(memberId)) throw notFound(`team member ${memberId} not found`);
    this.store.team.delete(memberId);
    return { id: memberId, removed: true };
  }

  // ---------------- Treasury (fund pots + disbursements) ----------------

  async getTreasury(mosqueId: UUID): Promise<Treasury> {
    this.mosqueOrThrow(mosqueId);
    const confirmed = this.confirmedForMosque(mosqueId);
    const fundsById = this.fundMap(mosqueId);

    const collectedByFund = new Map<UUID, number>();
    for (const donation of confirmed) {
      collectedByFund.set(donation.fundId, (collectedByFund.get(donation.fundId) ?? 0) + donation.amountPence);
    }
    const disbursedByFund = new Map<UUID, number>();
    const committedByFund = new Map<UUID, number>();
    const counts = new Map<UUID, number>();
    for (const x of this.store.disbursements.values()) {
      if (x.mosqueId !== mosqueId) continue;
      if (x.status === 'recorded') {
        disbursedByFund.set(x.fundId, (disbursedByFund.get(x.fundId) ?? 0) + x.amountPence);
        counts.set(x.fundId, (counts.get(x.fundId) ?? 0) + 1);
      } else if (x.status === 'scheduled') {
        committedByFund.set(x.fundId, (committedByFund.get(x.fundId) ?? 0) + x.amountPence);
      }
    }

    const fundIds = new Set<UUID>([
      ...collectedByFund.keys(),
      ...disbursedByFund.keys(),
      ...committedByFund.keys(),
    ]);
    const pots: TreasuryPot[] = [];
    for (const fundId of fundIds) {
      const fund = fundsById.get(fundId);
      const collected = collectedByFund.get(fundId) ?? 0;
      const disbursed = disbursedByFund.get(fundId) ?? 0;
      const committed = committedByFund.get(fundId) ?? 0;
      const remaining = collected - disbursed;
      const classification = fund ? classifyFund(fund.type) : 'unrestricted';
      const mustDisburse = classification !== 'unrestricted';
      const status: PotStatus =
        remaining < 0
          ? 'over_disbursed'
          : !mustDisburse
            ? 'available'
            : disbursed === 0
              ? 'outstanding'
              : remaining === 0
                ? 'complete'
                : 'partial';
      pots.push({
        fundId,
        fundName: fund?.name ?? fundId,
        classification,
        mustDisburse,
        collectedPence: collected,
        disbursedPence: disbursed,
        committedPence: committed,
        remainingPence: remaining,
        freePence: remaining - committed,
        status,
        disbursementCount: counts.get(fundId) ?? 0,
      });
    }

    const sumRemaining = (predicate: (p: TreasuryPot) => boolean): number =>
      pots.filter(predicate).reduce((total, p) => total + p.remainingPence, 0);

    const totalCollectedPence = pots.reduce((total, p) => total + p.collectedPence, 0);
    const totalDisbursedPence = pots.reduce((total, p) => total + p.disbursedPence, 0);
    const totalCommittedPence = pots.reduce((total, p) => total + p.committedPence, 0);
    const expectedBalancePence = totalCollectedPence - totalDisbursedPence;

    const composition: CompositionSegment[] = [
      { bucket: 'restricted', label: 'Must disburse', remainingPence: sumRemaining((p) => p.classification === 'restricted') },
      { bucket: 'pass_through', label: 'To forward', remainingPence: sumRemaining((p) => p.classification === 'pass_through') },
      { bucket: 'unrestricted', label: 'General / available', remainingPence: sumRemaining((p) => p.classification === 'unrestricted') },
    ];

    const rank = (s: PotStatus): number => (s === 'over_disbursed' ? 0 : s === 'outstanding' ? 1 : 2);
    pots.sort((a, b) => rank(a.status) - rank(b.status) || b.remainingPence - a.remainingPence);

    const all = [...this.store.disbursements.values()].filter((x) => x.mosqueId === mosqueId);
    const scheduled = all
      .filter((x) => x.status === 'scheduled')
      .sort((a, b) => ((a.dueOn ?? '') < (b.dueOn ?? '') ? -1 : 1));
    const recentDisbursements = all
      .filter((x) => x.status !== 'scheduled')
      .sort((a, b) => (a.recordedAt < b.recordedAt ? 1 : -1))
      .slice(0, 12);

    return {
      mosqueId,
      generatedAt: nowIso(),
      totalCollectedPence,
      totalDisbursedPence,
      totalCommittedPence,
      expectedBalancePence,
      mustDisbursePence: sumRemaining((p) => p.classification !== 'unrestricted'),
      availablePence: sumRemaining((p) => p.classification === 'unrestricted'),
      totalFreePence: expectedBalancePence - totalCommittedPence,
      composition,
      pots,
      scheduled,
      recentDisbursements,
    };
  }

  async recordDisbursement(mosqueId: UUID, input: RecordDisbursementInput): Promise<Disbursement> {
    this.mosqueOrThrow(mosqueId);
    const fund = findFund(this.fundsForMosque(mosqueId), input.fundId);
    if (!fund || fund.mosqueId !== mosqueId) throw validation('fund does not belong to this mosque');
    if (!Number.isInteger(input.amountPence) || input.amountPence <= 0) {
      throw validation('amountPence must be a positive integer (pence)');
    }
    const reference = input.reference.trim();
    if (!reference) throw validation('a reference is required');

    if (input.amountPence > this.fundLedger(mosqueId, input.fundId).free) {
      throw conflict('payment exceeds the free (uncommitted) balance of this fund');
    }
    return this.persistDisbursement(mosqueId, fund, input.amountPence, reference, input.externalRef, {
      status: 'recorded',
      disbursedOn: input.disbursedOn ?? nowIso().slice(0, 10),
    });
  }

  async scheduleDisbursement(mosqueId: UUID, input: ScheduleDisbursementInput): Promise<Disbursement> {
    this.mosqueOrThrow(mosqueId);
    const fund = findFund(this.fundsForMosque(mosqueId), input.fundId);
    if (!fund || fund.mosqueId !== mosqueId) throw validation('fund does not belong to this mosque');
    if (!Number.isInteger(input.amountPence) || input.amountPence <= 0) {
      throw validation('amountPence must be a positive integer (pence)');
    }
    const reference = input.reference.trim();
    if (!reference) throw validation('a reference is required');
    if (input.amountPence > this.fundLedger(mosqueId, input.fundId).free) {
      throw conflict('scheduled payment exceeds the free (uncommitted) balance of this fund');
    }
    return this.persistDisbursement(mosqueId, fund, input.amountPence, reference, input.externalRef, {
      status: 'scheduled',
      dueOn: input.dueOn ?? nowIso().slice(0, 10),
    });
  }

  async completeDisbursement(disbursementId: UUID): Promise<Disbursement> {
    const d = this.store.disbursements.get(disbursementId);
    if (!d) throw notFound(`disbursement ${disbursementId} not found`);
    if (d.status === 'recorded') return d;
    if (d.status === 'voided') throw conflict('a cancelled payment cannot be completed');
    const updated: Disbursement = {
      ...d,
      status: 'recorded',
      disbursedOn: d.disbursedOn ?? nowIso().slice(0, 10),
      recordedAt: nowIso(),
    };
    this.store.disbursements.set(d.id, updated);
    return updated;
  }

  private fundLedger(
    mosqueId: UUID,
    fundId: UUID,
  ): { collected: number; disbursed: number; committed: number; free: number } {
    const collected = this.confirmedForMosque(mosqueId)
      .filter((d) => d.fundId === fundId)
      .reduce((total, d) => total + d.amountPence, 0);
    let disbursed = 0;
    let committed = 0;
    for (const x of this.store.disbursements.values()) {
      if (x.mosqueId !== mosqueId || x.fundId !== fundId) continue;
      if (x.status === 'recorded') disbursed += x.amountPence;
      else if (x.status === 'scheduled') committed += x.amountPence;
    }
    return { collected, disbursed, committed, free: collected - disbursed - committed };
  }

  private persistDisbursement(
    mosqueId: UUID,
    fund: Fund,
    amountPence: number,
    reference: string,
    externalRef: string | undefined,
    extra: { status: DisbursementStatus; disbursedOn?: string; dueOn?: string },
  ): Disbursement {
    const disbursement: Disbursement = {
      id: `disb_${randomId()}`,
      mosqueId,
      fundId: fund.id,
      fundName: fund.name,
      classification: classifyFund(fund.type),
      amountPence,
      reference,
      externalRef,
      status: extra.status,
      dueOn: extra.dueOn,
      disbursedOn: extra.disbursedOn,
      recordedAt: nowIso(),
    };
    this.store.disbursements.set(disbursement.id, disbursement);
    return disbursement;
  }

  async voidDisbursement(disbursementId: UUID): Promise<{ disbursementId: UUID; status: 'voided' }> {
    const disbursement = this.store.disbursements.get(disbursementId);
    if (!disbursement) throw notFound(`disbursement ${disbursementId} not found`);
    if (disbursement.status === 'voided') return { disbursementId, status: 'voided' };
    this.store.disbursements.set(disbursementId, { ...disbursement, status: 'voided', voidedAt: nowIso() });
    return { disbursementId, status: 'voided' };
  }

  // ---------------- Onboarding + billing ----------------

  async onboard(input: OnboardInput): Promise<OnboardResult> {
    const mosqueId = `mosque_${randomId()}`;
    const mosque: Mosque = {
      id: mosqueId,
      name: input.mosque.name,
      bankAccount: input.mosque.bankAccount,
      subscriptionStatus: 'none',
    };
    this.store.mosques.set(mosque.id, mosque);

    const operators: Operator[] = input.operators.map((operator) => ({
      id: `op_${randomId()}`,
      mosqueId,
      name: operator.name,
      role: operator.role,
    }));
    for (const operator of operators) this.store.operators.set(operator.id, operator);

    const fundSpecs = input.funds ?? DEFAULT_FUNDS.map((f) => ({ name: f.name, type: f.type }));
    const funds: Fund[] = fundSpecs.map((spec) => {
      const classification = classifyFund(spec.type);
      return {
        id: `fund_${randomId()}`,
        mosqueId,
        name: spec.name,
        type: spec.type,
        restricted: classification === 'restricted',
        passThrough: classification === 'pass_through',
      };
    });
    for (const fund of funds) this.store.funds.set(fund.id, fund);

    this.store.billing.set(mosqueId, {
      mosqueId,
      activationPaid: false,
      subscription: 'none',
      addOns: {},
    });

    return { mosque, operators, funds };
  }

  async chargeActivationFee(mosqueId: UUID): Promise<PaymentResult> {
    this.mosqueOrThrow(mosqueId);
    const result = await stubBilling.createActivationPayment(mosqueId);
    const billing = this.billingState(mosqueId);
    billing.activationPaid = result.status === 'succeeded';
    this.store.billing.set(mosqueId, billing);
    return result;
  }

  async createSubscription(mosqueId: UUID): Promise<SubscriptionResult> {
    const mosque = this.mosqueOrThrow(mosqueId);
    const result = await stubBilling.createAnnualSubscription(mosqueId);
    this.store.mosques.set(mosqueId, { ...mosque, subscriptionStatus: result.status });
    const billing = this.billingState(mosqueId);
    billing.subscription = result.status;
    billing.currentPeriodEnd = result.currentPeriodEnd;
    this.store.billing.set(mosqueId, billing);
    return result;
  }

  async getBillingStatus(mosqueId: UUID): Promise<BillingStatus> {
    this.mosqueOrThrow(mosqueId);
    const billing = this.billingState(mosqueId);
    return {
      mosqueId,
      activationPaid: billing.activationPaid,
      subscription: billing.subscription,
      currentPeriodEnd: billing.currentPeriodEnd,
      addOns: billing.addOns,
    };
  }

  // ---------------- internals ----------------

  private mosqueOrThrow(mosqueId: UUID): Mosque {
    const mosque = this.store.mosques.get(mosqueId);
    if (!mosque) throw notFound(`mosque ${mosqueId} not found`);
    return mosque;
  }

  private sessionOrThrow(sessionId: UUID): Session {
    const session = this.store.sessions.get(sessionId);
    if (!session) throw notFound(`session ${sessionId} not found`);
    return session;
  }

  private donationOrThrow(donationId: UUID): Donation {
    const donation = this.store.donations.get(donationId);
    if (!donation) throw notFound(`donation ${donationId} not found`);
    return donation;
  }

  private billingState(mosqueId: UUID): BillingState {
    return (
      this.store.billing.get(mosqueId) ?? {
        mosqueId,
        activationPaid: false,
        subscription: 'none',
        addOns: {},
      }
    );
  }

  private fundsForMosque(mosqueId: UUID): Fund[] {
    return [...this.store.funds.values()].filter((fund) => fund.mosqueId === mosqueId);
  }

  private fundMap(mosqueId: UUID): Map<UUID, Fund> {
    return new Map(this.fundsForMosque(mosqueId).map((fund) => [fund.id, fund]));
  }

  private donationsForSession(sessionId: UUID): Donation[] {
    return [...this.store.donations.values()].filter((donation) => donation.sessionId === sessionId);
  }

  private sessionsForMosque(mosqueId: UUID): Set<UUID> {
    return new Set(
      [...this.store.sessions.values()]
        .filter((session) => session.mosqueId === mosqueId)
        .map((session) => session.id),
    );
  }

  private withinRange(donation: Donation, from?: string, to?: string): boolean {
    if (from && donation.createdAt < from) return false;
    if (to && donation.createdAt > to) return false;
    return true;
  }

  private confirmedForMosque(mosqueId: UUID, from?: string, to?: string): Donation[] {
    const sessions = this.sessionsForMosque(mosqueId);
    return [...this.store.donations.values()].filter(
      (donation) =>
        sessions.has(donation.sessionId) &&
        donation.status === 'confirmed' &&
        this.withinRange(donation, from, to),
    );
  }

  private allForMosque(mosqueId: UUID, from?: string, to?: string): Donation[] {
    const sessions = this.sessionsForMosque(mosqueId);
    return [...this.store.donations.values()].filter(
      (donation) => sessions.has(donation.sessionId) && this.withinRange(donation, from, to),
    );
  }

  private fundBreakdown(mosqueId: UUID, donations: Donation[]): FundBreakdownRow[] {
    const fundsById = this.fundMap(mosqueId);
    const rows = new Map<UUID, FundBreakdownRow>();
    for (const donation of donations) {
      const fund = fundsById.get(donation.fundId);
      const existing = rows.get(donation.fundId);
      if (existing) {
        existing.totalPence += donation.amountPence;
        existing.count += 1;
      } else {
        rows.set(donation.fundId, {
          fundId: donation.fundId,
          fundName: fund?.name ?? donation.fundName,
          restricted: fund?.restricted ?? false,
          passThrough: fund?.passThrough ?? false,
          totalPence: donation.amountPence,
          count: 1,
        });
      }
    }
    return [...rows.values()].sort((a, b) => b.totalPence - a.totalPence);
  }

  private byNight(donations: Donation[]): DashboardByNight[] {
    const rows = new Map<string, DashboardByNight>();
    for (const donation of donations) {
      const date = donation.createdAt.slice(0, 10);
      const existing = rows.get(date);
      if (existing) {
        existing.totalPence += donation.amountPence;
        existing.count += 1;
      } else {
        rows.set(date, { date, totalPence: donation.amountPence, count: 1 });
      }
    }
    return [...rows.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  private byOperator(donations: Donation[]): DashboardByOperator[] {
    const rows = new Map<UUID, DashboardByOperator>();
    for (const donation of donations) {
      const session = this.store.sessions.get(donation.sessionId);
      if (!session) continue;
      const operator = this.store.operators.get(session.operatorId);
      const existing = rows.get(session.operatorId);
      if (existing) {
        existing.totalPence += donation.amountPence;
        existing.count += 1;
      } else {
        rows.set(session.operatorId, {
          operatorId: session.operatorId,
          operatorName: operator?.name ?? 'Unknown',
          totalPence: donation.amountPence,
          count: 1,
        });
      }
    }
    return [...rows.values()].sort((a, b) => b.totalPence - a.totalPence);
  }

  private persistDonation(
    session: Session,
    input: DonateInput,
    status: Donation['status'],
    zettleTxnId: string | undefined,
  ): Donation {
    const fund = findFund(this.fundsForMosque(session.mosqueId), input.fundId);
    const donorId = this.upsertDonor(session.mosqueId, input);
    const donation: Donation = {
      id: `don_${randomId()}`,
      sessionId: session.id,
      fundId: input.fundId,
      fundName: fund?.name ?? input.fundId,
      donorId,
      amountPence: input.amountPence,
      zettleTxnId,
      status,
      giftAidEligible: Boolean(input.donor?.giftAidDeclaration),
      createdAt: nowIso(),
    };
    this.store.donations.set(donation.id, donation);
    return donation;
  }

  private upsertDonor(mosqueId: UUID, input: DonateInput): UUID | undefined {
    const contact = input.donor;
    if (!contact || (!contact.phone && !contact.email && !contact.name)) return undefined;

    // Match an existing donor by phone (then email) so receipts and Gift Aid
    // records don't fragment across duplicate donor rows.
    const existing = [...this.store.donors.values()].find((donor) => {
      if (donor.mosqueId !== mosqueId) return false;
      if (contact.phone && donor.phone === contact.phone) return true;
      if (contact.email && donor.email === contact.email) return true;
      return false;
    });
    if (existing) {
      this.store.donors.set(existing.id, {
        ...existing,
        name: existing.name ?? contact.name,
        phone: existing.phone ?? contact.phone,
        email: existing.email ?? contact.email,
        // A declaration only ever upgrades — never silently revoked.
        giftAidDeclaration: existing.giftAidDeclaration || Boolean(contact.giftAidDeclaration),
      });
      return existing.id;
    }

    const donor: Donor = {
      id: `donor_${randomId()}`,
      mosqueId,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      giftAidDeclaration: Boolean(contact.giftAidDeclaration),
    };
    this.store.donors.set(donor.id, donor);
    return donor.id;
  }

  private queueReceipt(session: Session, input: DonateInput, donation: Donation): void {
    const contact = input.donor;
    if (!contact || (!contact.phone && !contact.email)) return; // anonymous → skip (§9)
    const mosque = this.store.mosques.get(session.mosqueId);
    receiptsQueue.enqueue({
      donationId: donation.id,
      to: { phone: contact.phone, email: contact.email },
      amountPence: donation.amountPence,
      fundName: donation.fundName,
      mosqueName: mosque?.name ?? 'the mosque',
      date: donation.createdAt,
    });
  }
}

function sumAmount(donations: Donation[]): number {
  return donations.reduce((total, donation) => total + donation.amountPence, 0);
}
