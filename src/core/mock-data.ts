/**
 * Seeded in-memory fixtures for the mock backend. Everything here is internally
 * consistent: session totals equal the sum of their donations, dashboard
 * aggregates reconcile, and every classification (restricted / unrestricted /
 * pass-through) is represented. Dev B gets realistic data with zero setup.
 *
 * Mock ids are human-readable on purpose (e.g. "fund_zakat"). The real backend
 * uses UUIDs; the contract type is just `string`, so the UI is agnostic.
 */

import { classifyFund } from '../funds/rules';
import { DEFAULT_FUNDS } from '../funds/taxonomy';
import type {
  Disbursement,
  Donation,
  Donor,
  Fund,
  Mosque,
  Operator,
  Session,
  SubscriptionStatus,
  TeamMember,
  UUID,
} from './types';

export interface BillingState {
  mosqueId: UUID;
  activationPaid: boolean;
  subscription: SubscriptionStatus;
  currentPeriodEnd?: string;
  addOns: { perTransactionFeeBps?: number; giftAidFeePence?: number };
}

/** Tracks idempotent donate results by key so retries never double-record (§4.4). */
export interface Store {
  mosques: Map<UUID, Mosque>;
  operators: Map<UUID, Operator>;
  funds: Map<UUID, Fund>;
  donors: Map<UUID, Donor>;
  sessions: Map<UUID, Session>;
  donations: Map<UUID, Donation>;
  billing: Map<UUID, BillingState>;
  team: Map<UUID, TeamMember>;
  disbursements: Map<UUID, Disbursement>;
  idempotency: Map<string, string>; // idempotencyKey -> donationId
}

interface DisbursementSpec {
  id: string;
  fundId: string;
  amountPence: number;
  reference: string;
  externalRef?: string;
  status: 'scheduled' | 'recorded' | 'voided';
  dueOn?: string;
  disbursedOn?: string;
  recordedAt: string;
  voidedAt?: string;
}

const DISBURSEMENT_SPECS: readonly DisbursementSpec[] = [
  { id: 'disb_zakat_1', fundId: 'fund_zakat', amountPence: 100000, reference: 'Paid to local Zakat recipients (8 categories)', status: 'recorded', disbursedOn: '2026-03-10', recordedAt: '2026-03-10T10:00:00.000Z' },
  { id: 'disb_pt_1', fundId: 'fund_passthrough', amountPence: 18000, reference: 'Forwarded to Islamic Relief — Gaza appeal', externalRef: 'IR-2026-0412', status: 'recorded', disbursedOn: '2026-03-12', recordedAt: '2026-03-12T09:00:00.000Z' },
  { id: 'disb_build_1', fundId: 'fund_building', amountPence: 30000, reference: 'Phase 1 roof works', externalRef: 'CHQ-100231', status: 'recorded', disbursedOn: '2026-03-15', recordedAt: '2026-03-15T11:00:00.000Z' },
  { id: 'disb_void_1', fundId: 'fund_fidyah', amountPence: 5000, reference: '(entered in error)', status: 'voided', disbursedOn: '2026-03-11', recordedAt: '2026-03-11T08:00:00.000Z', voidedAt: '2026-03-11T08:05:00.000Z' },
  // Scheduled (planned, not yet paid) — earmarks money as 'committed' until ticked done.
  { id: 'disb_sched_1', fundId: 'fund_zakat', amountPence: 50000, reference: 'Quarterly Zakat distribution to families', status: 'scheduled', dueOn: '2026-06-30', recordedAt: '2026-06-15T10:00:00.000Z' },
  { id: 'disb_sched_2', fundId: 'fund_building', amountPence: 10000, reference: 'Roof works — phase 2 deposit', externalRef: 'Quote #4471', status: 'scheduled', dueOn: '2026-07-15', recordedAt: '2026-06-16T09:00:00.000Z' },
];

/** Shared collecting account — the operator used for auto-created collections. */
export const COLLECTING_OPERATOR_ID = 'op_mosque';

export const DEMO_MOSQUE_ID = 'mosque_aln';

const FUND_ID_BY_TYPE: Record<string, string> = {
  zakat: 'fund_zakat',
  zakat_al_fitr: 'fund_fitr',
  sadaqah: 'fund_sadaqah',
  fidyah_kaffarah: 'fund_fidyah',
  building: 'fund_building',
  general: 'fund_general',
  passthrough: 'fund_passthrough',
};

function buildFunds(mosqueId: UUID): Fund[] {
  return DEFAULT_FUNDS.map((definition) => ({
    id: FUND_ID_BY_TYPE[definition.type] ?? `fund_${definition.type}`,
    mosqueId,
    name: definition.name,
    type: definition.type,
    restricted: definition.restricted,
    passThrough: definition.passThrough,
    notes: definition.notes,
  }));
}

interface DonationSpec {
  id: string;
  sessionId: string;
  fundId: string;
  amountPence: number;
  donorId?: string;
  status: Donation['status'];
  giftAidEligible: boolean;
  createdAt: string;
}

const DONATION_SPECS: readonly DonationSpec[] = [
  // Night 1 — operator Yusuf (closed)
  { id: 'don_n1_01', sessionId: 'sess_n1', fundId: 'fund_zakat', amountPence: 5000, donorId: 'donor_ibrahim', status: 'confirmed', giftAidEligible: true, createdAt: '2026-02-18T19:40:00.000Z' },
  { id: 'don_n1_02', sessionId: 'sess_n1', fundId: 'fund_sadaqah', amountPence: 2000, status: 'confirmed', giftAidEligible: false, createdAt: '2026-02-18T19:45:00.000Z' },
  { id: 'don_n1_03', sessionId: 'sess_n1', fundId: 'fund_building', amountPence: 10000, status: 'confirmed', giftAidEligible: false, createdAt: '2026-02-18T20:10:00.000Z' },
  { id: 'don_n1_04', sessionId: 'sess_n1', fundId: 'fund_passthrough', amountPence: 3000, status: 'confirmed', giftAidEligible: false, createdAt: '2026-02-18T20:20:00.000Z' },
  { id: 'don_n1_05', sessionId: 'sess_n1', fundId: 'fund_zakat', amountPence: 25000, donorId: 'donor_fatima', status: 'confirmed', giftAidEligible: false, createdAt: '2026-02-18T20:40:00.000Z' },

  // Night 2 — operator Aisha (closed)
  { id: 'don_n2_01', sessionId: 'sess_n2', fundId: 'fund_fitr', amountPence: 1000, status: 'confirmed', giftAidEligible: false, createdAt: '2026-02-19T19:50:00.000Z' },
  { id: 'don_n2_02', sessionId: 'sess_n2', fundId: 'fund_sadaqah', amountPence: 1500, status: 'confirmed', giftAidEligible: false, createdAt: '2026-02-19T20:00:00.000Z' },
  { id: 'don_n2_03', sessionId: 'sess_n2', fundId: 'fund_fidyah', amountPence: 8000, status: 'confirmed', giftAidEligible: false, createdAt: '2026-02-19T20:15:00.000Z' },
  { id: 'don_n2_04', sessionId: 'sess_n2', fundId: 'fund_zakat', amountPence: 50000, donorId: 'donor_ibrahim', status: 'confirmed', giftAidEligible: true, createdAt: '2026-02-19T20:30:00.000Z' },
  { id: 'don_n2_05', sessionId: 'sess_n2', fundId: 'fund_sadaqah', amountPence: 500, status: 'refunded', giftAidEligible: false, createdAt: '2026-02-19T20:45:00.000Z' },
  { id: 'don_n2_06', sessionId: 'sess_n2', fundId: 'fund_building', amountPence: 4000, status: 'failed', giftAidEligible: false, createdAt: '2026-02-19T20:50:00.000Z' },

  // Night 3 — operator Yusuf (open, live)
  { id: 'don_n3_01', sessionId: 'sess_n3', fundId: 'fund_zakat', amountPence: 7500, status: 'confirmed', giftAidEligible: false, createdAt: '2026-02-20T19:40:00.000Z' },
  { id: 'don_n3_02', sessionId: 'sess_n3', fundId: 'fund_passthrough', amountPence: 10000, status: 'confirmed', giftAidEligible: false, createdAt: '2026-02-20T19:50:00.000Z' },
  { id: 'don_n3_03', sessionId: 'sess_n3', fundId: 'fund_sadaqah', amountPence: 2500, status: 'confirmed', giftAidEligible: false, createdAt: '2026-02-20T20:05:00.000Z' },

  // Week 2 — Night 9 (closed)
  { id: 'don_w2_01', sessionId: 'sess_w2', fundId: 'fund_zakat', amountPence: 30000, status: 'confirmed', giftAidEligible: false, createdAt: '2026-02-26T19:45:00.000Z' },
  { id: 'don_w2_02', sessionId: 'sess_w2', fundId: 'fund_sadaqah', amountPence: 4500, status: 'confirmed', giftAidEligible: false, createdAt: '2026-02-26T20:05:00.000Z' },
  { id: 'don_w2_03', sessionId: 'sess_w2', fundId: 'fund_building', amountPence: 15000, status: 'confirmed', giftAidEligible: false, createdAt: '2026-02-26T20:25:00.000Z' },
  { id: 'don_w2_04', sessionId: 'sess_w2', fundId: 'fund_passthrough', amountPence: 5000, status: 'confirmed', giftAidEligible: false, createdAt: '2026-02-26T20:40:00.000Z' },

  // Week 3 — Night 16 (closed)
  { id: 'don_w3_01', sessionId: 'sess_w3', fundId: 'fund_zakat', amountPence: 60000, status: 'confirmed', giftAidEligible: false, createdAt: '2026-03-05T19:50:00.000Z' },
  { id: 'don_w3_02', sessionId: 'sess_w3', fundId: 'fund_fidyah', amountPence: 12000, status: 'confirmed', giftAidEligible: false, createdAt: '2026-03-05T20:10:00.000Z' },
  { id: 'don_w3_03', sessionId: 'sess_w3', fundId: 'fund_sadaqah', amountPence: 8000, status: 'confirmed', giftAidEligible: false, createdAt: '2026-03-05T20:30:00.000Z' },
  { id: 'don_w3_04', sessionId: 'sess_w3', fundId: 'fund_building', amountPence: 20000, status: 'confirmed', giftAidEligible: false, createdAt: '2026-03-05T20:50:00.000Z' },
];

/** Build a fresh, fully-seeded store. Call again to reset (used by the demo). */
export function createSeededStore(): Store {
  const mosqueId = DEMO_MOSQUE_ID;

  const mosque: Mosque = {
    id: mosqueId,
    name: 'Masjid Al-Noor',
    bankAccount: 'GB00 RAMA 0000 0000 0000 00',
    stripeCustomerId: 'cus_mock_aln',
    subscriptionStatus: 'active',
  };

  const operators: Operator[] = [
    { id: COLLECTING_OPERATOR_ID, mosqueId, name: 'Collecting Account', role: 'operator' },
    { id: 'op_yusuf', mosqueId, name: 'Yusuf Khan', role: 'operator' },
    { id: 'op_aisha', mosqueId, name: 'Aisha Rahman', role: 'admin' },
  ];

  const team: TeamMember[] = [
    { id: 'team_aisha', mosqueId, name: 'Aisha Rahman', email: 'aisha@al-noor.org', role: 'admin' },
    { id: 'team_hassan', mosqueId, name: 'Hassan Ali', email: 'treasurer@al-noor.org', role: 'treasurer' },
    { id: 'team_maryam', mosqueId, name: 'Maryam Said', email: 'maryam@al-noor.org', role: 'trustee' },
  ];

  const donors: Donor[] = [
    { id: 'donor_ibrahim', mosqueId, name: 'Ibrahim Patel', phone: '+447700900111', giftAidDeclaration: true },
    { id: 'donor_fatima', mosqueId, name: 'Fatima Begum', email: 'fatima@example.com', giftAidDeclaration: false },
  ];

  const funds = buildFunds(mosqueId);
  const fundsById = new Map(funds.map((fund) => [fund.id, fund]));

  const sessions: Session[] = [
    { id: 'sess_n1', mosqueId, operatorId: 'op_yusuf', label: 'Night 1 — Main Hall', status: 'closed', startedAt: '2026-02-18T19:30:00.000Z', endedAt: '2026-02-18T22:00:00.000Z' },
    { id: 'sess_n2', mosqueId, operatorId: 'op_aisha', label: 'Night 2 — Main Hall', status: 'closed', startedAt: '2026-02-19T19:30:00.000Z', endedAt: '2026-02-19T22:00:00.000Z' },
    { id: 'sess_n3', mosqueId, operatorId: 'op_yusuf', label: 'Night 3 — Main Hall', status: 'open', startedAt: '2026-02-20T19:30:00.000Z' },
    { id: 'sess_w2', mosqueId, operatorId: 'op_yusuf', label: 'Night 9 — Main Hall', status: 'closed', startedAt: '2026-02-26T19:30:00.000Z', endedAt: '2026-02-26T22:00:00.000Z' },
    { id: 'sess_w3', mosqueId, operatorId: 'op_aisha', label: 'Night 16 — Main Hall', status: 'closed', startedAt: '2026-03-05T19:30:00.000Z', endedAt: '2026-03-05T22:00:00.000Z' },
  ];

  const donations: Donation[] = DONATION_SPECS.map((spec) => {
    const fund = fundsById.get(spec.fundId);
    return {
      id: spec.id,
      sessionId: spec.sessionId,
      fundId: spec.fundId,
      fundName: fund ? fund.name : spec.fundId,
      donorId: spec.donorId,
      amountPence: spec.amountPence,
      zettleTxnId: spec.status === 'failed' ? undefined : `zttl_mock_${spec.id}`,
      status: spec.status,
      giftAidEligible: spec.giftAidEligible,
      createdAt: spec.createdAt,
    };
  });

  const billing: BillingState = {
    mosqueId,
    activationPaid: true,
    subscription: 'active',
    currentPeriodEnd: '2027-02-01T00:00:00.000Z',
    addOns: { perTransactionFeeBps: 50, giftAidFeePence: 25 },
  };

  const disbursements: Disbursement[] = DISBURSEMENT_SPECS.map((spec) => {
    const fund = fundsById.get(spec.fundId);
    return {
      id: spec.id,
      mosqueId,
      fundId: spec.fundId,
      fundName: fund ? fund.name : spec.fundId,
      classification: fund ? classifyFund(fund.type) : 'unrestricted',
      amountPence: spec.amountPence,
      reference: spec.reference,
      externalRef: spec.externalRef,
      status: spec.status,
      dueOn: spec.dueOn,
      disbursedOn: spec.disbursedOn,
      recordedAt: spec.recordedAt,
      voidedAt: spec.voidedAt,
    };
  });

  return {
    mosques: new Map([[mosque.id, mosque]]),
    operators: new Map(operators.map((operator) => [operator.id, operator])),
    funds: new Map(funds.map((fund) => [fund.id, fund])),
    donors: new Map(donors.map((donor) => [donor.id, donor])),
    sessions: new Map(sessions.map((session) => [session.id, session])),
    donations: new Map(donations.map((donation) => [donation.id, donation])),
    billing: new Map([[billing.mosqueId, billing]]),
    team: new Map(team.map((member) => [member.id, member])),
    disbursements: new Map(disbursements.map((d) => [d.id, d])),
    idempotency: new Map(),
  };
}
