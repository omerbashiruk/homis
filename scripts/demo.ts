/**
 * End-to-end walk through the contract against the mock backend. Run:
 *
 *   npm run demo
 *
 * It proves the donate critical path, idempotency, undo, the live session view,
 * dashboard/report aggregation (with reconciling totals), and the billing path —
 * all through src/core/api-client.ts, exactly as Dev B will consume it.
 */

import {
  chargeActivationFee,
  closeSession,
  createSubscription,
  donate,
  getBillingStatus,
  getDashboard,
  getFunds,
  getReaderStatus,
  getReport,
  getSession,
  onboard,
  pairReader,
  searchDonors,
  startSession,
  undoDonation,
  type Fund,
  type FundType,
} from '../src/core/api-client';
import { DEMO_MOSQUE_ID } from '../src/core/mock-data';
import { formatGBP } from '../src/db/money';

function heading(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function fundIdByType(funds: Fund[], type: FundType): string {
  const fund = funds.find((f) => f.type === type);
  if (!fund) throw new Error(`no fund of type ${type}`);
  return fund.id;
}

async function main(): Promise<void> {
  heading('Reader');
  console.log('status:', await getReaderStatus());
  await pairReader();

  heading('Funds for the mosque');
  const funds = await getFunds(DEMO_MOSQUE_ID);
  for (const fund of funds) {
    const tag = fund.passThrough ? 'pass-through' : fund.restricted ? 'restricted' : 'unrestricted';
    console.log(`- ${fund.name.padEnd(32)} [${tag}]`);
  }

  heading('Open a session');
  const session = await startSession({
    mosqueId: DEMO_MOSQUE_ID,
    operatorId: 'op_yusuf',
    label: 'Night 3 — Demo Run',
  });
  console.log('session:', session.id, `(${session.status})`);

  heading('Donate (the critical path)');
  const zakatId = fundIdByType(funds, 'zakat');
  const sadaqahId = fundIdByType(funds, 'sadaqah');
  const passId = fundIdByType(funds, 'passthrough');

  const r1 = await donate(session.id, {
    fundId: zakatId,
    amountPence: 5000,
    donor: { name: 'Ibrahim Patel', phone: '+447700900111', giftAidDeclaration: true },
  });
  console.log('Zakat £50 (gift-aided) ->', r1.status, r1.status === 'confirmed' ? r1.donation.id : '');

  const r2 = await donate(session.id, { fundId: sadaqahId, amountPence: 2000 });
  console.log('Sadaqah £20 (anon)    ->', r2.status);

  const r3 = await donate(session.id, { fundId: passId, amountPence: 10000 });
  console.log('Pass-through £100     ->', r3.status, '(liability, not income)');

  const declined = await donate(session.id, { fundId: zakatId, amountPence: 1 });
  console.log('Test hook 1p          ->', declined.status, declined.status === 'declined' ? `(${declined.reason})` : '');

  const cancelled = await donate(session.id, { fundId: zakatId, amountPence: 2 });
  console.log('Test hook 2p          ->', cancelled.status);

  heading('Idempotency (§4.4) — same key never double-records');
  const key = 'demo-idem-key-001';
  const first = await donate(session.id, { fundId: sadaqahId, amountPence: 1500, idempotencyKey: key });
  const retry = await donate(session.id, { fundId: sadaqahId, amountPence: 1500, idempotencyKey: key });
  const firstId = first.status === 'confirmed' ? first.donation.id : 'n/a';
  const retryId = retry.status === 'confirmed' ? retry.donation.id : 'n/a';
  console.log(`first=${firstId}  retry=${retryId}  same=${firstId === retryId}`);

  heading('Undo a misclassification (before close)');
  if (r2.status === 'confirmed') {
    const undo = await undoDonation(r2.donation.id);
    console.log(`undo ${r2.donation.id} ->`, undo.status);
  }

  heading('Live session state');
  const state = await getSession(session.id);
  console.log(`total ${formatGBP(state.totalPence)} across ${state.donationCount} confirmed donation(s)`);
  for (const row of state.fundBreakdown) {
    console.log(`  ${row.fundName.padEnd(32)} ${formatGBP(row.totalPence)} (${row.count})`);
  }

  heading('Close the session');
  const closed = await closeSession(session.id);
  console.log('session:', closed.id, `(${closed.status})`);

  heading('Donor search');
  console.log('search "ibrahim":', (await searchDonors(DEMO_MOSQUE_ID, 'ibrahim')).map((d) => d.name));

  heading('Dashboard (totals reconcile)');
  const dash = await getDashboard(DEMO_MOSQUE_ID);
  console.log(`Ramadan total: ${formatGBP(dash.ramadanTotalPence)} (${dash.donationCount} donations)`);
  console.log(`  restricted:    ${formatGBP(dash.restrictedTotalPence)}`);
  console.log(`  unrestricted:  ${formatGBP(dash.unrestrictedTotalPence)}`);
  console.log(`  pass-through:  ${formatGBP(dash.passThroughLiabilityPence)} (liability to forward)`);
  const reconciles =
    dash.restrictedTotalPence + dash.unrestrictedTotalPence + dash.passThroughLiabilityPence ===
    dash.ramadanTotalPence;
  console.log(`  reconciles:    ${reconciles}`);
  console.log('  by night:', dash.byNight.map((n) => `${n.date}=${formatGBP(n.totalPence)}`).join('  '));
  console.log('  by operator:', dash.byOperator.map((o) => `${o.operatorName}=${formatGBP(o.totalPence)}`).join('  '));

  heading('Report (trustee view)');
  const report = await getReport(DEMO_MOSQUE_ID);
  console.log(`period: ${report.periodLabel}`);
  console.log(`  total raised:  ${formatGBP(report.trustee.totalRaisedPence)}`);
  console.log(`  export rows:   ${report.accountantExport.rows.length}`);

  heading('Onboard a new mosque + billing (§8)');
  const onboarded = await onboard({
    mosque: { name: 'Masjid As-Salam', bankAccount: 'GB00 SALA 0000 0000 0000 00' },
    operators: [{ name: 'Bilal Ahmed', role: 'admin' }],
  });
  console.log(`onboarded ${onboarded.mosque.name} with ${onboarded.funds.length} default funds`);
  const activation = await chargeActivationFee(onboarded.mosque.id);
  console.log(`activation fee: ${formatGBP(activation.amountPence)} -> ${activation.status}`);
  const sub = await createSubscription(onboarded.mosque.id);
  console.log(`subscription:   ${sub.status} (renews ${sub.currentPeriodEnd?.slice(0, 10)})`);
  const billing = await getBillingStatus(onboarded.mosque.id);
  console.log('billing status:', { activationPaid: billing.activationPaid, subscription: billing.subscription });

  console.log('\nDone. (Receipt lines below are async — they fire after the donation returns.)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
