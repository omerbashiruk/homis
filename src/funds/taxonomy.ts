/**
 * Default fund taxonomy (§5). These are the sensible defaults seeded for every
 * mosque at onboarding. Mosques may add custom funds on top — so this is a
 * starting set, not a hardcoded ceiling.
 */

import type { FundType } from '../core/types';
import { isPassThroughType, isRestrictedType } from './rules';

export interface FundDefinition {
  type: FundType;
  name: string;
  restricted: boolean;
  passThrough: boolean;
  notes: string;
}

interface DefaultFundSpec {
  type: FundType;
  name: string;
  notes: string;
}

const DEFAULT_FUND_SPECS: readonly DefaultFundSpec[] = [
  { type: 'zakat', name: 'Zakat', notes: 'Must go to the 8 eligible categories of recipients.' },
  { type: 'zakat_al_fitr', name: 'Zakat al-Fitr (Fitrah)', notes: 'Time-bound to before Eid prayer.' },
  { type: 'sadaqah', name: 'Sadaqah (general)', notes: 'General voluntary charity — mosque discretion.' },
  { type: 'fidyah_kaffarah', name: 'Fidyah / Kaffarah', notes: 'Specific religious obligation.' },
  { type: 'building', name: 'Building Fund', notes: 'Capital project only.' },
  {
    type: 'passthrough',
    name: 'External Charity (Pass-through)',
    notes: 'NOT mosque income — a liability to forward on.',
  },
];

/** The default funds, with restricted / pass-through flags derived from the rules. */
export const DEFAULT_FUNDS: readonly FundDefinition[] = DEFAULT_FUND_SPECS.map((spec) => ({
  type: spec.type,
  name: spec.name,
  restricted: isRestrictedType(spec.type),
  passThrough: isPassThroughType(spec.type),
  notes: spec.notes,
}));
