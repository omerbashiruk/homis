import type { AccountantExportRow } from '../../core/api-client';
import { weekStart } from '../lib/format';

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Array<Array<string | number>>): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function slug(s: string): string {
  return s.replace(/\s+/g, '-').toLowerCase();
}

export function triggerDownload(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface TypeWeekRow {
  week: string;
  fund: string;
  classification: string;
  count: number;
  pence: number;
}

/** Aggregate confirmed donations by donation option per week. */
export function aggregateByTypeWeek(rows: AccountantExportRow[]): TypeWeekRow[] {
  const map = new Map<string, TypeWeekRow>();
  for (const r of rows.filter((row) => row.status === 'confirmed')) {
    const week = weekStart(r.date);
    const key = `${week}|${r.fundId}`;
    const existing = map.get(key) ?? { week, fund: r.fund, classification: r.classification, count: 0, pence: 0 };
    existing.count += 1;
    existing.pence += r.amountPence;
    map.set(key, existing);
  }
  return [...map.values()].sort((a, b) => (a.week === b.week ? b.pence - a.pence : a.week < b.week ? -1 : 1));
}

/** Accountant export: by donation type, per week. */
export function downloadTypeWeekCsv(rows: AccountantExportRow[], label: string): void {
  const header = ['Week commencing', 'Donation option', 'Classification', 'Donations', 'Total (GBP)', 'Total (pence)'];
  const csvRows = aggregateByTypeWeek(rows).map((e) => [
    e.week,
    e.fund,
    e.classification,
    e.count,
    (e.pence / 100).toFixed(2),
    e.pence,
  ]);
  triggerDownload(`ramadan-close-by-type-week-${slug(label)}.csv`, toCsv([header, ...csvRows]), 'text/csv;charset=utf-8');
}

/** Full per-donation audit trail. */
export function downloadAuditCsv(rows: AccountantExportRow[], label: string): void {
  const header = [
    'Donation ID',
    'Date',
    'Donation option',
    'Classification',
    'Amount (GBP)',
    'Amount (pence)',
    'Status',
    'Zettle txn',
  ];
  const csvRows = rows.map((r) => [
    r.donationId,
    r.date,
    r.fund,
    r.classification,
    (r.amountPence / 100).toFixed(2),
    r.amountPence,
    r.status,
    r.zettleTxnId ?? '',
  ]);
  triggerDownload(`ramadan-close-audit-${slug(label)}.csv`, toCsv([header, ...csvRows]), 'text/csv;charset=utf-8');
}
