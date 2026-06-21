# Integration — Dev A ↔ Dev B boundary

Dev A owns the Engine and exports **everything** through one file:
[`src/core/api-client.ts`](../src/core/api-client.ts). Dev B (operator app +
admin dashboard) imports **only** from there. This doc is the agreement.

## Rule 0 — the contract is sacred

- Signatures in `api-client.ts` are **stable**. Once Dev B builds against a
  function, its name, parameters, and return shape don't change silently.
- A change **must** be flagged: open a PR titled `contract:` describing the old
  vs new shape and the migration. No drive-by edits to exported shapes.
- The mock backend returns the **same shapes** the real backend will. If the mock
  lies, the UI breaks on cutover — so the mock is part of the contract, not a toy.

## Contract surface

All functions are `async` (return `Promise`) unless noted. Types are in
[`src/core/types.ts`](../src/core/types.ts) and re-exported from `api-client.ts`.

| Function | In | Out | Spec |
| --- | --- | --- | --- |
| `startSession` | `StartSessionInput` | `Session` | POST /session |
| `getSession` | `sessionId` | `SessionState` | GET /session/:id |
| `closeSession` | `sessionId` | `Session` | POST /session/:id/close |
| `donate` | `sessionId, DonateInput` | `DonationResult` | POST /session/:id/donate |
| `undoDonation` | `donationId` | `UndoResult` | POST /donation/:id/undo |
| `refundDonation` | `donationId` | `RefundResult` | POST /donation/:id/refund |
| `pairReader` | — | `ReaderStatus` | §4.3 |
| `getReaderStatus` | — | `ReaderStatus` | §4.3 |
| `getFunds` | `mosqueId` | `Fund[]` | GET /funds |
| `getDashboard` | `mosqueId, DashboardQuery?` | `Dashboard` | GET /dashboard |
| `getReport` | `mosqueId, ReportQuery?` | `Report` | GET /report |
| `searchDonors` | `mosqueId, query` | `Donor[]` | GET /donors/search |
| `onboard` | `OnboardInput` | `OnboardResult` | POST /onboard |
| `chargeActivationFee` | `mosqueId` | `PaymentResult` | POST /billing/activation |
| `createSubscription` | `mosqueId` | `SubscriptionResult` | POST /billing/subscription |
| `getBillingStatus` | `mosqueId` | `BillingStatus` | (billing read) |

`DonationResult` is a discriminated union — Dev B narrows on `.status`:

```ts
const r = await donate(sessionId, { fundId, amountPence: 5000 });
if (r.status === 'confirmed') { /* r.donation */ }
else if (r.status === 'declined') { /* r.reason, r.draftRef */ }
else { /* 'cancelled' — r.draftRef */ }
```

## Driving the mock (so Dev B can build every screen)

Seeded mosque id is `mosque_aln` (exported as `DEMO_MOSQUE_ID`). It has 3 nights
of sessions (`sess_n1`/`n2` closed, `sess_n3` open), operators `op_yusuf` /
`op_aisha`, and donations across every fund classification.

Donate test hooks (deterministic):

| `amountPence` | Result |
| --- | --- |
| `1` | `declined` (persists a failed attempt) |
| `2` | `cancelled` (nothing saved) |
| anything else | `confirmed` |

Pass an `idempotencyKey` to prove no double-record on retry.

## Step 0 — the one thing to agree with Dev B: the Zettle boundary

The Zettle Payments SDK is a **mobile SDK** that runs on the operator's device
over Bluetooth (§3 note). So the physical *charge trigger* and *result handling*
live in a thin native layer **in Dev B's app**. Dev A owns the contract and the
logic: what is sent, how the result is interpreted, what is persisted, and the
idempotency reference.

Proposed boundary (confirm with Dev B):

1. Dev B calls `donate(sessionId, { fundId, amountPence, donor?, idempotencyKey })`.
2. Behind the contract, the Engine drives the charge (Zettle), interprets the
   result, attaches the **fund tag** (never Zettle's), and persists the donation.
3. The native Zettle bridge implements the `ZettleReader` interface in
   [`src/payments/index.ts`](../src/payments/index.ts); the sandbox reader stands
   in until then. The `reference` we pass is our idempotency key, not Zettle's.

The fund classification is **always** attached by the Engine at save time. Zettle
only ever knows the amount.

## Versioning the contract

- Additive changes (new optional field, new function) — safe; ship freely.
- Breaking changes (rename, type change, required field) — `contract:` PR + a
  heads-up to Dev B. Prefer adding a new function over mutating an existing one.
