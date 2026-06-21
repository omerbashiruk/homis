/**
 * Public surface of the fund module.
 *
 * This module owns the *pure taxonomy and rules*. The store-backed retrieval
 * functions named in §5 — getFunds(mosqueId), validateFund(fundId, mosqueId),
 * isRestricted(fundId) — require data, so they are exposed to Dev B through the
 * contract in `src/core/api-client.ts` (mock-backed now, db-backed later). The
 * helpers below are what those implementations build on.
 */

import type { Fund, FundId, UUID } from '../core/types';

export {
  classifyFund,
  isFundType,
  isPassThroughType,
  isRestrictedType,
  type FundClassification,
} from './rules';
export { DEFAULT_FUNDS, type FundDefinition } from './taxonomy';

/** Validate that a fund exists and belongs to the given mosque. */
export function validateFundAgainst(funds: readonly Fund[], fundId: FundId, mosqueId: UUID): boolean {
  return funds.some((fund) => fund.id === fundId && fund.mosqueId === mosqueId);
}

/** Look up a single fund by id within a mosque's fund set. */
export function findFund(funds: readonly Fund[], fundId: FundId): Fund | undefined {
  return funds.find((fund) => fund.id === fundId);
}
