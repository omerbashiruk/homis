import { describe, expect, it } from 'vitest';
import { classifyFund, isFundType, isPassThroughType, isRestrictedType } from './rules';
import { DEFAULT_FUNDS } from './taxonomy';
import type { FundType } from '../core/types';

describe('fund rules (§5)', () => {
  const expectations: Array<[FundType, 'restricted' | 'unrestricted' | 'pass_through']> = [
    ['zakat', 'restricted'],
    ['zakat_al_fitr', 'restricted'],
    ['fidyah_kaffarah', 'restricted'],
    ['building', 'restricted'],
    ['sadaqah', 'unrestricted'],
    ['general', 'unrestricted'],
    ['passthrough', 'pass_through'],
  ];

  it.each(expectations)('classifies %s as %s', (type, classification) => {
    expect(classifyFund(type)).toBe(classification);
  });

  it('treats pass-through as a liability, never as restricted income', () => {
    expect(isPassThroughType('passthrough')).toBe(true);
    expect(isRestrictedType('passthrough')).toBe(false);
  });

  it('recognises valid fund types and rejects unknown ones', () => {
    expect(isFundType('zakat')).toBe(true);
    expect(isFundType('not_a_fund')).toBe(false);
  });
});

describe('default taxonomy (§5)', () => {
  it('seeds the default funds', () => {
    expect(DEFAULT_FUNDS).toHaveLength(6);
  });

  it('flags restricted/pass-through consistently with the rules', () => {
    for (const fund of DEFAULT_FUNDS) {
      expect(fund.restricted).toBe(isRestrictedType(fund.type));
      expect(fund.passThrough).toBe(isPassThroughType(fund.type));
      // A fund is never simultaneously restricted income and a pass-through liability.
      expect(fund.restricted && fund.passThrough).toBe(false);
    }
  });

  it('has unique fund names', () => {
    const names = DEFAULT_FUNDS.map((fund) => fund.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
