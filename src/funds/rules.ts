/**
 * Fund rules (§5). Pure, store-free, fully testable.
 *
 * Each fund is restricted, unrestricted, or a pass-through:
 *  - restricted   → legally ringfenced; must only be spent on its stated purpose.
 *  - unrestricted → general mosque income.
 *  - pass_through → NOT mosque income; a liability to forward to an external charity.
 */

import type { FundType } from '../core/types';

/** Fund types whose balances are legally ringfenced. */
const RESTRICTED_TYPES: ReadonlySet<FundType> = new Set<FundType>([
  'zakat',
  'zakat_al_fitr',
  'fidyah_kaffarah',
  'building',
]);

/** Fund types that are a liability to forward on, not mosque income. */
const PASS_THROUGH_TYPES: ReadonlySet<FundType> = new Set<FundType>(['passthrough']);

export type FundClassification = 'restricted' | 'unrestricted' | 'pass_through';

export function isRestrictedType(type: FundType): boolean {
  return RESTRICTED_TYPES.has(type);
}

export function isPassThroughType(type: FundType): boolean {
  return PASS_THROUGH_TYPES.has(type);
}

/** Single source of truth for how a fund type is treated. */
export function classifyFund(type: FundType): FundClassification {
  if (isPassThroughType(type)) return 'pass_through';
  if (isRestrictedType(type)) return 'restricted';
  return 'unrestricted';
}

/** Whether a value is a known fund type. */
export function isFundType(value: string): value is FundType {
  return (
    value === 'zakat' ||
    value === 'zakat_al_fitr' ||
    value === 'sadaqah' ||
    value === 'fidyah_kaffarah' ||
    value === 'building' ||
    value === 'general' ||
    value === 'passthrough'
  );
}
