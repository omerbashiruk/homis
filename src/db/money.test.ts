import { describe, expect, it } from 'vitest';
import {
  assertPence,
  formatGBP,
  isValidPence,
  penceToPounds,
  poundsToPence,
  sumPence,
} from './money';

describe('money', () => {
  it('validates integer pence', () => {
    expect(isValidPence(0)).toBe(true);
    expect(isValidPence(5000)).toBe(true);
    expect(isValidPence(12.5)).toBe(false);
    expect(isValidPence(-1)).toBe(false);
  });

  it('asserts integer pence, rejecting floats and negatives', () => {
    expect(() => assertPence(5000)).not.toThrow();
    expect(() => assertPence(99.9)).toThrow();
    expect(() => assertPence(-100)).toThrow();
    expect(() => assertPence(Number.NaN)).toThrow();
  });

  it('converts pounds to pence with penny rounding', () => {
    expect(poundsToPence(50)).toBe(5000);
    expect(poundsToPence(0.1)).toBe(10);
    // 19.99 * 100 in float is 1998.9999...; must round to 1999.
    expect(poundsToPence(19.99)).toBe(1999);
  });

  it('round-trips through pounds for display', () => {
    expect(penceToPounds(12345)).toBe(123.45);
  });

  it('sums pence without float drift', () => {
    expect(sumPence([1000, 2000, 50])).toBe(3050);
    expect(sumPence([])).toBe(0);
  });

  it('formats GBP for reports', () => {
    expect(formatGBP(0)).toBe('£0.00');
    expect(formatGBP(5)).toBe('£0.05');
    expect(formatGBP(12345)).toBe('£123.45');
    expect(formatGBP(123456789)).toBe('£1,234,567.89');
    expect(formatGBP(-2500)).toBe('-£25.00');
  });
});
