/**
 * Display formatting lives in the UI (the "display edge", §6). The contract
 * always speaks integer pence; we format to pounds here, never store floats.
 */

import type { CSSProperties } from 'react';
import type { Fund, FundType } from '../../core/api-client';

/** Build a style object that includes CSS custom properties (e.g. --tile-color). */
export function cssVars(vars: Record<string, string | number>): CSSProperties {
  return vars as unknown as CSSProperties;
}

export function formatGBP(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const pounds = Math.abs(pence) / 100;
  return `${sign}£${pounds.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Whole-pounds form for chart labels and headlines, e.g. "£1,420". */
export function formatGBPwhole(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  return `${sign}£${Math.round(Math.abs(pence) / 100).toLocaleString('en-GB')}`;
}

export function fundColor(type: FundType): string {
  return `var(--fund-${type})`;
}

export type Classification = 'restricted' | 'unrestricted' | 'passthrough';

export function classify(fund: Pick<Fund, 'restricted' | 'passThrough'>): Classification {
  if (fund.passThrough) return 'passthrough';
  if (fund.restricted) return 'restricted';
  return 'unrestricted';
}

export function classLabel(c: Classification): string {
  if (c === 'passthrough') return 'Pass-through';
  if (c === 'restricted') return 'Restricted';
  return 'Unrestricted';
}

/** "18 Feb" from an ISO date/datetime. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** "20:40" from an ISO datetime. */
export function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Monday-start week key (YYYY-MM-DD of that week's Monday, in UTC for determinism). */
export function weekStart(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const mondayOffset = (d.getUTCDay() + 6) % 7; // 0 = Monday … 6 = Sunday
  d.setUTCDate(d.getUTCDate() - mondayOffset);
  return d.toISOString().slice(0, 10);
}

/** "w/c 18 Feb" label for a week-start date. */
export function weekLabel(weekStartIso: string): string {
  const d = new Date(weekStartIso);
  if (Number.isNaN(d.getTime())) return weekStartIso;
  return `w/c ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}
