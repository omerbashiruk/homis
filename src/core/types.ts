/**
 * The contract vocabulary. Every shape Dev B consumes is defined here and
 * re-exported from `api-client.ts`. These are wire types (the edge): dates are
 * ISO strings, money is integer pence.
 */

// ---------- Primitives ----------

export type UUID = string;

/** Integer pence. NEVER a float. Format to pounds only at the display edge (Dev B). */
export type Pence = number;

/** Spec alias for amounts (see §4.3 signatures). Always integer pence. */
export type Money = Pence;

/** ISO-8601 timestamp string — the wire format at the contract edge. */
export type ISODateTime = string;

/** Calendar date string, YYYY-MM-DD. */
export type ISODate = string;

// ---------- Funds (§5) ----------

export type FundType =
  | 'zakat'
  | 'zakat_al_fitr'
  | 'sadaqah'
  | 'fidyah_kaffarah'
  | 'building'
  | 'general'
  | 'passthrough';

export type FundId = UUID;

export interface Fund {
  id: FundId;
  mosqueId: UUID;
  name: string;
  type: FundType;
  /** Legally ringfenced — must only be spent on its stated purpose. */
  restricted: boolean;
  /** External charity pass-through — NOT mosque income; a liability to forward on. */
  passThrough: boolean;
  /** Retired options stay for historical reporting but are hidden from collecting. */
  archived?: boolean;
  notes?: string;
}

/** A donation option is a fund as configured by the mosque. */
export interface CreateFundInput {
  name: string;
  type: FundType;
  notes?: string;
}

export interface UpdateFundInput {
  name?: string;
  type?: FundType;
  notes?: string;
}

// ---------- Mosque / Operator ----------

export type SubscriptionStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled';

export interface Mosque {
  id: UUID;
  name: string;
  bankAccount?: string;
  stripeCustomerId?: string;
  subscriptionStatus: SubscriptionStatus;
}

export type OperatorRole = 'operator' | 'admin' | 'trustee';

export interface Operator {
  id: UUID;
  mosqueId: UUID;
  name: string;
  role: OperatorRole;
}

/**
 * A person with access to the mosque's ADMIN dashboard (treasurer, trustees).
 * Distinct from collecting: collecting uses one shared mosque account — we don't
 * track who physically raises a donation.
 */
export type TeamRole = 'admin' | 'treasurer' | 'trustee';

export interface TeamMember {
  id: UUID;
  mosqueId: UUID;
  name: string;
  email: string;
  role: TeamRole;
}

export interface AddTeamMemberInput {
  name: string;
  email: string;
  role: TeamRole;
}

// ---------- Donor ----------

export interface Donor {
  id: UUID;
  mosqueId: UUID;
  name?: string;
  phone?: string;
  email?: string;
  giftAidDeclaration: boolean;
}

/** Contact captured at donate time. Optional — many street donations are anonymous. */
export interface DonorContact {
  name?: string;
  phone?: string;
  email?: string;
  giftAidDeclaration?: boolean;
}

// ---------- Session ----------

export type SessionStatus = 'open' | 'closed';

export interface Session {
  id: UUID;
  mosqueId: UUID;
  operatorId: UUID;
  label: string;
  status: SessionStatus;
  startedAt: ISODateTime;
  endedAt?: ISODateTime;
}

// ---------- Donation ----------

/**
 * `voided` extends the §6 enum: it is the result of an `undo` (misclassification
 * reversal before close), distinct from a card decline (`failed`) and a
 * money-returned `refunded`. Only `confirmed` counts toward income aggregates.
 */
export type DonationStatus = 'confirmed' | 'failed' | 'refunded' | 'voided';

export interface Donation {
  id: UUID;
  sessionId: UUID;
  fundId: FundId;
  /** Denormalised for convenient display; always matches fundId. */
  fundName: string;
  donorId?: UUID;
  amountPence: Pence;
  zettleTxnId?: string;
  status: DonationStatus;
  giftAidEligible: boolean;
  createdAt: ISODateTime;
}

// ---------- Donate flow (the critical path, §3) ----------

export interface DonateInput {
  fundId: FundId;
  amountPence: Pence;
  donor?: DonorContact;
  /**
   * Idempotency key (§4.4). If a retry arrives with the same key, the original
   * result is returned — never a second charge or a second record.
   */
  idempotencyKey?: string;
}

export type DonationResult =
  | { status: 'confirmed'; donation: Donation }
  | { status: 'declined'; draftRef: string; reason: string }
  | { status: 'cancelled'; draftRef: string };

export interface UndoResult {
  donationId: UUID;
  status: 'undone';
}

export interface RefundResult {
  donationId: UUID;
  status: 'refunded';
  refundedPence: Pence;
  zettleRefundId?: string;
}

// ---------- Reader (operator device) ----------

export interface ReaderStatus {
  connected: boolean;
  readerName?: string;
}

// ---------- Session live state (GET /session/:id) ----------

export interface FundBreakdownRow {
  fundId: FundId;
  fundName: string;
  restricted: boolean;
  passThrough: boolean;
  totalPence: Pence;
  count: number;
}

export interface SessionState {
  session: Session;
  totalPence: Pence;
  donationCount: number;
  fundBreakdown: FundBreakdownRow[];
  recentDonations: Donation[];
}

// ---------- Dashboard (GET /dashboard) ----------

export interface DashboardByNight {
  date: ISODate;
  totalPence: Pence;
  count: number;
}

export interface DashboardByOperator {
  operatorId: UUID;
  operatorName: string;
  totalPence: Pence;
  count: number;
}

export interface DashboardByFund {
  fundId: FundId;
  fundName: string;
  restricted: boolean;
  passThrough: boolean;
  totalPence: Pence;
  count: number;
}

/**
 * Headline figures reconcile: restricted + unrestricted + passThroughLiability
 * === ramadanTotalPence. Pass-through is shown in the gross total but flagged
 * separately as a liability, never treated as retained mosque income.
 */
export interface Dashboard {
  mosqueId: UUID;
  ramadanTotalPence: Pence;
  donationCount: number;
  restrictedTotalPence: Pence;
  unrestrictedTotalPence: Pence;
  passThroughLiabilityPence: Pence;
  byNight: DashboardByNight[];
  byOperator: DashboardByOperator[];
  byFund: DashboardByFund[];
}

// ---------- Report (GET /report) ----------

export interface ReportFundLine {
  fundId: FundId;
  fundName: string;
  classification: 'restricted' | 'unrestricted' | 'pass_through';
  totalPence: Pence;
  count: number;
}

export interface AccountantExportRow {
  donationId: UUID;
  date: ISODateTime;
  fundId: FundId;
  fund: string;
  classification: string;
  amountPence: Pence;
  status: DonationStatus;
  giftAidEligible: boolean;
  zettleTxnId?: string;
}

export interface Report {
  mosqueId: UUID;
  generatedAt: ISODateTime;
  periodLabel: string;
  trustee: {
    totalRaisedPence: Pence;
    restrictedPence: Pence;
    unrestrictedPence: Pence;
    passThroughLiabilityPence: Pence;
    fundLines: ReportFundLine[];
  };
  accountantExport: {
    rows: AccountantExportRow[];
  };
}

// ---------- Treasury / disbursements ----------

/**
 * Classification snapshot. Inline union defined here (mirrors ReportFundLine) so
 * types.ts never imports from src/funds — that would be a cycle (rules.ts imports
 * FundType from here). classifyFund() is applied at the backend boundary instead.
 */
export type FundClassificationTag = 'restricted' | 'unrestricted' | 'pass_through';

/**
 * scheduled = planned, not yet paid (earmarks the money as 'committed').
 * recorded  = the money has actually left the account.
 * voided    = cancelled (a scheduled plan dropped, or a recorded payment reversed).
 */
export type DisbursementStatus = 'scheduled' | 'recorded' | 'voided';

/** A planned or completed payout / forward from a fund pot. */
export interface Disbursement {
  id: UUID;
  mosqueId: UUID;
  fundId: FundId;
  /** Denormalised at create time (mirrors Donation.fundName) for printed-record fidelity. */
  fundName: string;
  classification: FundClassificationTag;
  amountPence: Pence;
  /** Required: who/what it went to, e.g. "Paid to 8 eligible families". */
  reference: string;
  /** Optional bank reference / cheque number. */
  externalRef?: string;
  status: DisbursementStatus;
  /** Target date for a scheduled payment. */
  dueOn?: ISODate;
  /** Date the money actually left the account (set when recorded / ticked done). */
  disbursedOn?: ISODate;
  recordedAt: ISODateTime;
  voidedAt?: ISODateTime;
}

export interface RecordDisbursementInput {
  fundId: FundId;
  amountPence: Pence;
  reference: string;
  externalRef?: string;
  /** Defaults to today when omitted. */
  disbursedOn?: ISODate;
}

/** Plan a payment that still needs to happen (earmarks the money). */
export interface ScheduleDisbursementInput {
  fundId: FundId;
  amountPence: Pence;
  reference: string;
  externalRef?: string;
  /** Target date the payment should be made by. */
  dueOn?: ISODate;
}

export type PotStatus = 'available' | 'outstanding' | 'partial' | 'complete' | 'over_disbursed';

/** A fund's slice of the bank balance. remainingPence may be negative (over_disbursed). */
export interface TreasuryPot {
  fundId: FundId;
  fundName: string;
  classification: FundClassificationTag;
  /** Restricted + pass-through must leave the account for their purpose. */
  mustDisburse: boolean;
  collectedPence: Pence;
  disbursedPence: Pence;
  /** Earmarked by scheduled-but-not-yet-paid payments. */
  committedPence: Pence;
  /** collected − disbursed (what's still held for this fund). May be negative. */
  remainingPence: Pence;
  /** remaining − committed (held and not yet promised to a scheduled payment). */
  freePence: Pence;
  status: PotStatus;
  disbursementCount: number;
}

export interface CompositionSegment {
  bucket: FundClassificationTag;
  label: string;
  remainingPence: Pence;
}

/**
 * Fund-accounting view of "what the bank account should be holding right now".
 * Cumulative (no date range). Composition is driven by REMAINING, not collected.
 */
export interface Treasury {
  mosqueId: UUID;
  generatedAt: ISODateTime;
  totalCollectedPence: Pence;
  totalDisbursedPence: Pence;
  /** Earmarked by scheduled payments not yet paid. */
  totalCommittedPence: Pence;
  /** totalCollected - totalDisbursed — the expected balance. NOT a bank reconciliation. */
  expectedBalancePence: Pence;
  mustDisbursePence: Pence;
  availablePence: Pence;
  /** expectedBalance - totalCommitted — held and not yet promised. */
  totalFreePence: Pence;
  composition: CompositionSegment[];
  pots: TreasuryPot[];
  /** Planned payments still to make (status 'scheduled'), soonest due first. */
  scheduled: Disbursement[];
  /** Completed + voided payments (the records), most recent first. */
  recentDisbursements: Disbursement[];
}

// ---------- Onboarding (POST /onboard) ----------

export interface OnboardInput {
  mosque: { name: string; bankAccount?: string };
  operators: Array<{ name: string; role: OperatorRole }>;
  /** Optional custom funds; the default taxonomy is seeded when omitted. */
  funds?: Array<{ name: string; type: FundType }>;
}

export interface OnboardResult {
  mosque: Mosque;
  operators: Operator[];
  funds: Fund[];
}

// ---------- Billing (§8) ----------

export interface PaymentResult {
  status: 'succeeded' | 'requires_action' | 'failed';
  paymentIntentId: string;
  amountPence: Pence;
  clientSecret?: string;
}

export interface SubscriptionResult {
  status: SubscriptionStatus;
  subscriptionId: string;
  currentPeriodEnd?: ISODateTime;
}

export interface BillingStatus {
  mosqueId: UUID;
  activationPaid: boolean;
  subscription: SubscriptionStatus;
  currentPeriodEnd?: ISODateTime;
  addOns: {
    /** Basis points charged on top of the Zettle rate (optional add-on). */
    perTransactionFeeBps?: number;
    /** Fee per HMRC Gift Aid submission (optional add-on). */
    giftAidFeePence?: Pence;
  };
}

// ---------- Session start input (POST /session) ----------

export interface StartSessionInput {
  mosqueId: UUID;
  operatorId: UUID;
  label: string;
}
