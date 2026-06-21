# Ramadan Close

A card-present donation platform for UK mosques. An operator holds a phone paired
to a Zettle reader; a donor says *"Zakat, £50"*, the operator picks the fund, the
donor taps, and the donation is **born correctly classified by Islamic fund**.

Two halves, one contract:

- **Engine (Dev A)** — `src/payments`, `src/funds`, `src/api`, `src/db`,
  `src/billing`, `src/receipts`: payments, fund logic, data, billing, receipts.
- **Experience (Dev B)** — `src/ui`, `src/styles`: the operator app, the admin
  dashboard, and onboarding — a React + Vite app.

Both meet at **`src/core/api-client.ts`**, the contract. It returns realistic
mock data today, so the whole product is demoable before the real backend exists;
the real Zettle/Stripe/Postgres implementation swaps in later **without changing a
single UI import**.

## The contract (the one thing that matters)

Dev B imports **only** from [`src/core/api-client.ts`](src/core/api-client.ts).
It exposes typed, stable functions and, in Step 0, is backed by realistic
in-memory data so the whole UI can be built before the real endpoints exist.

```ts
import { startSession, donate, getDashboard, formatGBP } from './core/api-client';

const session = await startSession({ mosqueId, operatorId, label: 'Night 3' });
const result  = await donate(session.id, { fundId, amountPence: 5000 });
if (result.status === 'confirmed') console.log(result.donation.id);
```

The implementation is chosen at runtime by `RAMADAN_CLOSE_BACKEND`:

| Value          | Backing                                            |
| -------------- | -------------------------------------------------- |
| `mock` (default) | In-memory fixtures — `src/core/mock-backend.ts`  |
| `http`         | Real Fastify API at `API_BASE_URL` — `src/core/http-backend.ts` |

Both implement the same [`Backend`](src/core/backend.ts) interface, so swapping
is invisible to Dev B.

## Layout

```
src/
  core/        The contract: types, Backend interface, api-client, mock + http backends
  funds/       Islamic fund taxonomy + restricted / pass-through rules (pure, tested)
  payments/    Zettle seam — sandbox reader + §4.3 surface
  billing/     Stripe seam — activation fee + annual subscription (§8)
  receipts/    Async, non-blocking SMS/email confirmations (§9)
  db/          Money helpers (integer pence) + Prisma client
  api/         Fastify entrypoint (health now; §7 routes next)
  ui/          Dev B — React app: operator/ (the loop), admin/ (dashboard), onboarding/
  styles/      Dev B — design tokens + per-surface CSS (dark operator, light admin)
prisma/        schema.prisma (the §6 ER model) + seed
scripts/demo.ts  End-to-end walk through the contract
index.html       Vite entry for the UI
```

## Frontend (Dev B)

A React + Vite app that imports **only** `src/core/api-client.ts` — no `fetch`,
no reach into the Engine's modules (enforced and grep-verified). It opens on a
public **landing page** (`src/ui/marketing`) and routes (hash router) to three
separate doors:

- **`/collect`** — sign in to the mosque's **shared collecting account** (we don't
  track who's raising), then the dark, large-tap operator loop: pick a **donation
  option** → enter amount → present reader → confirm → next, with the **selected
  option persisting**, live "collected today" totals, and one-tap undo. No session
  naming — a session is created invisibly per day for the contract.
- **`/admin`** — sign in to the treasurer dashboard: reconciling restricted /
  unrestricted / pass-through totals, by-night chart, Gift Aid / restricted-funds /
  donor-history tabs, trustee + accountant exports (real CSV), and **management**
  of the mosque's own **donation options** (create/rename/retire) and **team**
  (dashboard users). No by-operator breakdown.
- **`/register`** — onboarding: configure funds → activation + subscription → pair
  reader → ready, then straight into collecting.

Authentication is **mocked** (the contract has no auth endpoints yet — that's later
backend work). The mock backend runs **in the browser** (the contract is isomorphic
— no `node:crypto`/`process` on the hot path), so the whole product demos with no
server and no database.

## Running it

Requires Node ≥ 20 (a user-space Node 24 LTS is installed at
`~/.local/lib/nodejs/current`; if `node` isn't found, run
`export PATH="$HOME/.local/lib/nodejs/current/bin:$PATH"`).

```bash
npm install            # also runs `prisma generate` (postinstall)
npm run dev            # the UI on http://localhost:5173 (Vite) — full demo, mock data
npm run demo           # walk the whole contract in the terminal (no browser)
npm test               # fund rules, money discipline, backend behaviour (31 tests)
npm run typecheck      # backend + UI (tsc, two projects)
npm run build          # production UI bundle to dist/
npm run dev:api        # Fastify on :8080 (GET /health) — the Engine's HTTP shell
```

Everything above runs on the **mock backend with no database** — the UI bundles it
and runs it in the browser. Postgres is only needed once you wire the real `http`
backend and migrations.

### Database (only for the real backend, later)

```bash
cp .env.example .env        # set DATABASE_URL
npm run db:migrate          # create tables from prisma/schema.prisma
npm run db:seed             # demo mosque + default funds
```

## Money

Stored as **integer pence everywhere** — never floats (§6). `src/db/money.ts`
has the helpers; format to pounds only at the display edge.

## Funds (§5)

| Fund                         | Classification |
| ---------------------------- | -------------- |
| Zakat, Zakat al-Fitr, Fidyah/Kaffarah, Building | restricted (ringfenced) |
| Sadaqah, General             | unrestricted (mosque income) |
| External charity pass-through | **liability** to forward on — not income |

Aggregates reconcile: `restricted + unrestricted + passThroughLiability ===
ramadanTotal`, with pass-through always reported as its own slice.

## Status vs the build order (§10)

| Step | Item | Status |
| ---- | ---- | ------ |
| — | Contract + types + mock data (Step 0, §11) | ✅ done |
| — | Fund taxonomy + rules (§5) | ✅ done + tested |
| — | Data models / Prisma schema (§6) | ✅ done |
| 1 | Zettle sandbox charge flow | ✅ sandbox reader; real device bridge: pending |
| 2 | `donate` + persist (mock) | ✅ done; Postgres persistence: pending |
| 3 | Session API (open/state/close) | ✅ logic done; HTTP routes: pending |
| 4 | Dashboard + report aggregates | ✅ done |
| 5 | Billing (activation + subscription) | ✅ stub shapes; real Stripe: pending |
| 6 | Receipts (async) | ✅ queue + console provider; Twilio/SendGrid: pending |

The §7 HTTP routes are the next concrete step — `http-backend.ts` already
documents the exact wire shapes they must return.

## Deliberate deviations from the spec

- **`DonationStatus` adds `voided`** for `undo` (misclassification reversal before
  close), distinct from `failed` (card declined) and `refunded` (money returned).
  Only `confirmed` counts toward income.
- **`Fund.passThrough`** added alongside `restricted` so external-charity
  pass-through is modelled as a liability, not income.
- **Reader status is async** (`getReaderStatus()` / `pairReader()`) in the
  contract; §4.3's `isReaderConnected(): boolean` lives in `src/payments/`.

See [`docs/integration.md`](docs/integration.md) for the Dev A ↔ Dev B boundary.
