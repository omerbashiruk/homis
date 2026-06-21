import { describe, expect, it } from 'vitest';
import { MockBackend } from './mock-backend';
import { DEMO_MOSQUE_ID } from './mock-data';

const newBackend = () => new MockBackend();

async function openSession() {
  const backend = newBackend();
  const session = await backend.startSession({
    mosqueId: DEMO_MOSQUE_ID,
    operatorId: 'op_yusuf',
    label: 'Test session',
  });
  return { backend, session };
}

describe('donate (critical path)', () => {
  it('confirms a normal charge and records it once', async () => {
    const { backend, session } = await openSession();
    const result = await backend.donate(session.id, { fundId: 'fund_zakat', amountPence: 5000 });
    expect(result.status).toBe('confirmed');

    const state = await backend.getSession(session.id);
    expect(state.totalPence).toBe(5000);
    expect(state.donationCount).toBe(1);
  });

  it('is idempotent — a repeated key never double-records (§4.4)', async () => {
    const { backend, session } = await openSession();
    const first = await backend.donate(session.id, { fundId: 'fund_zakat', amountPence: 5000, idempotencyKey: 'k1' });
    const retry = await backend.donate(session.id, { fundId: 'fund_zakat', amountPence: 5000, idempotencyKey: 'k1' });

    const firstId = first.status === 'confirmed' ? first.donation.id : 'first';
    const retryId = retry.status === 'confirmed' ? retry.donation.id : 'retry';
    expect(firstId).toBe(retryId);

    const state = await backend.getSession(session.id);
    expect(state.donationCount).toBe(1);
  });

  it('exposes declined and cancelled outcomes via the test hooks', async () => {
    const { backend, session } = await openSession();
    expect((await backend.donate(session.id, { fundId: 'fund_zakat', amountPence: 1 })).status).toBe('declined');
    expect((await backend.donate(session.id, { fundId: 'fund_zakat', amountPence: 2 })).status).toBe('cancelled');
  });

  it('rejects non-positive and non-integer amounts', async () => {
    const { backend, session } = await openSession();
    await expect(backend.donate(session.id, { fundId: 'fund_zakat', amountPence: 0 })).rejects.toThrow();
    await expect(backend.donate(session.id, { fundId: 'fund_zakat', amountPence: 12.5 })).rejects.toThrow();
  });

  it('rejects a fund that does not belong to the mosque', async () => {
    const { backend, session } = await openSession();
    await expect(backend.donate(session.id, { fundId: 'fund_unknown', amountPence: 5000 })).rejects.toThrow();
  });

  it('rejects donations to a closed session', async () => {
    const { backend, session } = await openSession();
    await backend.closeSession(session.id);
    await expect(backend.donate(session.id, { fundId: 'fund_zakat', amountPence: 5000 })).rejects.toThrow();
  });
});

describe('undo / refund', () => {
  it('undo voids a confirmed donation and drops it from totals', async () => {
    const { backend, session } = await openSession();
    const result = await backend.donate(session.id, { fundId: 'fund_zakat', amountPence: 5000 });
    if (result.status !== 'confirmed') throw new Error('expected confirmed');

    await backend.undoDonation(result.donation.id);
    const state = await backend.getSession(session.id);
    expect(state.totalPence).toBe(0);
  });

  it('cannot undo once the session is closed', async () => {
    const { backend, session } = await openSession();
    const result = await backend.donate(session.id, { fundId: 'fund_zakat', amountPence: 5000 });
    if (result.status !== 'confirmed') throw new Error('expected confirmed');

    await backend.closeSession(session.id);
    await expect(backend.undoDonation(result.donation.id)).rejects.toThrow();
  });

  it('refunds a confirmed donation', async () => {
    const { backend, session } = await openSession();
    const result = await backend.donate(session.id, { fundId: 'fund_zakat', amountPence: 5000 });
    if (result.status !== 'confirmed') throw new Error('expected confirmed');

    const refund = await backend.refundDonation(result.donation.id);
    expect(refund.status).toBe('refunded');
    expect(refund.refundedPence).toBe(5000);
  });
});

describe('donors', () => {
  it('matches an existing donor by phone instead of duplicating', async () => {
    const { backend, session } = await openSession();
    const donor = { name: 'Ibrahim Patel', phone: '+447700900111', giftAidDeclaration: true };
    await backend.donate(session.id, { fundId: 'fund_zakat', amountPence: 5000, donor });
    await backend.donate(session.id, { fundId: 'fund_sadaqah', amountPence: 2000, donor });

    const matches = await backend.searchDonors(DEMO_MOSQUE_ID, 'ibrahim');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.giftAidDeclaration).toBe(true);
  });
});

describe('aggregates', () => {
  it('reconciles restricted + unrestricted + pass-through to the headline total', async () => {
    const dashboard = await newBackend().getDashboard(DEMO_MOSQUE_ID);
    expect(
      dashboard.restrictedTotalPence +
        dashboard.unrestrictedTotalPence +
        dashboard.passThroughLiabilityPence,
    ).toBe(dashboard.ramadanTotalPence);
  });

  it('treats pass-through as a liability that is present but not restricted income', async () => {
    const dashboard = await newBackend().getDashboard(DEMO_MOSQUE_ID);
    expect(dashboard.passThroughLiabilityPence).toBeGreaterThan(0);
  });

  it('returns the default funds for the seeded mosque', async () => {
    expect(await newBackend().getFunds(DEMO_MOSQUE_ID)).toHaveLength(6);
  });
});

describe('donation options (funds) management', () => {
  it('creates a new option and classifies it by type', async () => {
    const backend = newBackend();
    const fund = await backend.createFund(DEMO_MOSQUE_ID, { name: 'Roof Appeal', type: 'building' });
    expect(fund.restricted).toBe(true);
    expect(fund.archived).toBe(false);
    expect((await backend.getFunds(DEMO_MOSQUE_ID)).some((f) => f.id === fund.id)).toBe(true);
  });

  it('rejects a duplicate active option name', async () => {
    const backend = newBackend();
    await expect(backend.createFund(DEMO_MOSQUE_ID, { name: 'Zakat', type: 'zakat' })).rejects.toThrow();
  });

  it('renames and archives an option (kept for history, hidden when archived)', async () => {
    const backend = newBackend();
    const fund = await backend.createFund(DEMO_MOSQUE_ID, { name: 'Temp', type: 'sadaqah' });
    const renamed = await backend.updateFund(fund.id, { name: 'Water Appeal' });
    expect(renamed.name).toBe('Water Appeal');
    const archived = await backend.setFundArchived(fund.id, true);
    expect(archived.archived).toBe(true);
    const stillListed = (await backend.getFunds(DEMO_MOSQUE_ID)).find((f) => f.id === fund.id);
    expect(stillListed?.archived).toBe(true);
  });
});

describe('team management', () => {
  it('lists seeded team members', async () => {
    expect((await newBackend().listTeamMembers(DEMO_MOSQUE_ID)).length).toBeGreaterThanOrEqual(3);
  });

  it('adds and removes a team member, rejecting duplicate emails', async () => {
    const backend = newBackend();
    const member = await backend.addTeamMember(DEMO_MOSQUE_ID, {
      name: 'Omar Farah',
      email: 'omar@al-noor.org',
      role: 'treasurer',
    });
    expect((await backend.listTeamMembers(DEMO_MOSQUE_ID)).some((m) => m.id === member.id)).toBe(true);
    await expect(
      backend.addTeamMember(DEMO_MOSQUE_ID, { name: 'Dup', email: 'omar@al-noor.org', role: 'trustee' }),
    ).rejects.toThrow();
    await backend.removeTeamMember(member.id);
    expect((await backend.listTeamMembers(DEMO_MOSQUE_ID)).some((m) => m.id === member.id)).toBe(false);
  });
});

describe('treasury (fund pots + disbursements)', () => {
  it('reconciles: must-disburse + available = expected balance = sum of pots = sum of composition', async () => {
    const t = await newBackend().getTreasury(DEMO_MOSQUE_ID);
    expect(t.mustDisbursePence + t.availablePence).toBe(t.expectedBalancePence);
    expect(t.pots.reduce((s, p) => s + p.remainingPence, 0)).toBe(t.expectedBalancePence);
    expect(t.composition.reduce((s, c) => s + c.remainingPence, 0)).toBe(t.expectedBalancePence);
    expect(t.expectedBalancePence).toBe(t.totalCollectedPence - t.totalDisbursedPence);
  });

  it('reflects seeded disbursements (voided excluded; a fully-paid pot is complete)', async () => {
    const t = await newBackend().getTreasury(DEMO_MOSQUE_ID);
    expect(t.pots.find((p) => p.classification === 'pass_through')?.status).toBe('complete');
    const fidyah = t.pots.find((p) => p.fundName.startsWith('Fidyah'));
    expect(fidyah?.disbursedPence).toBe(0); // its only disbursement was voided
    expect(fidyah?.status).toBe('outstanding');
  });

  it('records a disbursement, reducing remaining', async () => {
    const backend = newBackend();
    const before = (await backend.getTreasury(DEMO_MOSQUE_ID)).pots.find((p) => p.fundId === 'fund_sadaqah');
    await backend.recordDisbursement(DEMO_MOSQUE_ID, { fundId: 'fund_sadaqah', amountPence: 1000, reference: 'Food parcels' });
    const after = (await backend.getTreasury(DEMO_MOSQUE_ID)).pots.find((p) => p.fundId === 'fund_sadaqah');
    expect((before?.remainingPence ?? 0) - (after?.remainingPence ?? 0)).toBe(1000);
  });

  it('blocks over-disbursement and rejects blank reference / non-positive amount', async () => {
    const backend = newBackend();
    await expect(
      backend.recordDisbursement(DEMO_MOSQUE_ID, { fundId: 'fund_sadaqah', amountPence: 9_999_999, reference: 'too much' }),
    ).rejects.toThrow();
    await expect(
      backend.recordDisbursement(DEMO_MOSQUE_ID, { fundId: 'fund_sadaqah', amountPence: 100, reference: '   ' }),
    ).rejects.toThrow();
    await expect(
      backend.recordDisbursement(DEMO_MOSQUE_ID, { fundId: 'fund_sadaqah', amountPence: 0, reference: 'x' }),
    ).rejects.toThrow();
  });

  it('voids a disbursement (idempotent), restoring remaining', async () => {
    const backend = newBackend();
    const d = await backend.recordDisbursement(DEMO_MOSQUE_ID, { fundId: 'fund_sadaqah', amountPence: 1000, reference: 'reverse me' });
    const mid = (await backend.getTreasury(DEMO_MOSQUE_ID)).pots.find((p) => p.fundId === 'fund_sadaqah');
    await backend.voidDisbursement(d.id);
    const after = (await backend.getTreasury(DEMO_MOSQUE_ID)).pots.find((p) => p.fundId === 'fund_sadaqah');
    expect((after?.remainingPence ?? 0) - (mid?.remainingPence ?? 0)).toBe(1000);
    expect((await backend.voidDisbursement(d.id)).status).toBe('voided');
  });
});

describe('treasury — scheduled payments (committed vs free)', () => {
  it('reconciles committed and free across pots', async () => {
    const t = await newBackend().getTreasury(DEMO_MOSQUE_ID);
    expect(t.pots.reduce((s, p) => s + p.committedPence, 0)).toBe(t.totalCommittedPence);
    expect(t.pots.reduce((s, p) => s + p.freePence, 0)).toBe(t.totalFreePence);
    expect(t.totalFreePence).toBe(t.expectedBalancePence - t.totalCommittedPence);
    for (const p of t.pots) expect(p.freePence).toBe(p.remainingPence - p.committedPence);
  });

  it('lists seeded scheduled payments without changing the bank balance', async () => {
    const t = await newBackend().getTreasury(DEMO_MOSQUE_ID);
    expect(t.scheduled.length).toBeGreaterThanOrEqual(2);
    expect(t.scheduled.every((d) => d.status === 'scheduled')).toBe(true);
    expect(t.totalCommittedPence).toBe(60000);
    expect(t.expectedBalancePence).toBe(t.totalCollectedPence - t.totalDisbursedPence);
  });

  it('scheduling earmarks money (reduces free, not remaining) and blocks over-commit', async () => {
    const backend = newBackend();
    const before = (await backend.getTreasury(DEMO_MOSQUE_ID)).pots.find((p) => p.fundId === 'fund_sadaqah');
    const d = await backend.scheduleDisbursement(DEMO_MOSQUE_ID, { fundId: 'fund_sadaqah', amountPence: 5000, reference: 'Plan: food parcels' });
    expect(d.status).toBe('scheduled');
    const after = (await backend.getTreasury(DEMO_MOSQUE_ID)).pots.find((p) => p.fundId === 'fund_sadaqah');
    expect((after?.committedPence ?? 0) - (before?.committedPence ?? 0)).toBe(5000);
    expect(after?.freePence).toBe((before?.freePence ?? 0) - 5000);
    expect(after?.remainingPence).toBe(before?.remainingPence); // not yet paid
    await expect(
      backend.scheduleDisbursement(DEMO_MOSQUE_ID, { fundId: 'fund_sadaqah', amountPence: 9_999_999, reference: 'too much' }),
    ).rejects.toThrow();
  });

  it('completing a scheduled payment moves it to records and reduces the balance', async () => {
    const backend = newBackend();
    const d = await backend.scheduleDisbursement(DEMO_MOSQUE_ID, { fundId: 'fund_sadaqah', amountPence: 4000, reference: 'Plan X' });
    const mid = await backend.getTreasury(DEMO_MOSQUE_ID);
    expect((await backend.completeDisbursement(d.id)).status).toBe('recorded');
    const after = await backend.getTreasury(DEMO_MOSQUE_ID);
    expect(after.totalDisbursedPence - mid.totalDisbursedPence).toBe(4000);
    expect(mid.totalCommittedPence - after.totalCommittedPence).toBe(4000);
    expect(mid.expectedBalancePence - after.expectedBalancePence).toBe(4000);
    expect(after.scheduled.some((x) => x.id === d.id)).toBe(false);
    expect(after.recentDisbursements.some((x) => x.id === d.id && x.status === 'recorded')).toBe(true);
  });

  it('voiding a scheduled payment frees the money back up', async () => {
    const backend = newBackend();
    const d = await backend.scheduleDisbursement(DEMO_MOSQUE_ID, { fundId: 'fund_sadaqah', amountPence: 3000, reference: 'cancel me' });
    const mid = (await backend.getTreasury(DEMO_MOSQUE_ID)).pots.find((p) => p.fundId === 'fund_sadaqah');
    await backend.voidDisbursement(d.id);
    const after = (await backend.getTreasury(DEMO_MOSQUE_ID)).pots.find((p) => p.fundId === 'fund_sadaqah');
    expect(after?.committedPence).toBe((mid?.committedPence ?? 0) - 3000);
    expect(after?.freePence).toBe((mid?.freePence ?? 0) + 3000);
  });
});
