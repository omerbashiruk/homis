/**
 * Money helpers. Rule (§6): money is ALWAYS integer pence. Never floats.
 * Convert to pounds only at the display edge (Dev B) — `formatGBP` is provided
 * here for server-side report/CSV rendering only.
 */

import type { Pence } from '../core/types';

/** True if `value` is a valid, non-negative integer-pence amount. */
export function isValidPence(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/** Throws unless `value` is a non-negative integer number of pence. */
export function assertPence(value: number): asserts value is Pence {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`Money must be integer pence, got ${value}`);
  }
  if (value < 0) {
    throw new Error(`Money must be non-negative pence, got ${value}`);
  }
}

/** Convert pounds (a decimal) to integer pence, rounding to the nearest penny. */
export function poundsToPence(pounds: number): Pence {
  return Math.round(pounds * 100);
}

/** Convert integer pence to a pounds number. Lossy for display only — do not store. */
export function penceToPounds(pence: Pence): number {
  return pence / 100;
}

/** Sum a list of pence amounts. */
export function sumPence(values: readonly Pence[]): Pence {
  return values.reduce((total, value) => total + value, 0);
}

/** Format integer pence as a GBP string, e.g. 12345 -> "£123.45". Server-side report use only. */
export function formatGBP(pence: Pence): string {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(pence);
  const pounds = Math.floor(abs / 100);
  const remainder = abs % 100;
  return `${sign}£${pounds.toLocaleString('en-GB')}.${remainder.toString().padStart(2, '0')}`;
}
