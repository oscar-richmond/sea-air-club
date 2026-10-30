import type { SignupRecord } from './types';

/** Columns for the ResNexus import, in order. */
export const CSV_COLUMNS = [
  'Email',
  'First Name',
  'Signed Up',
  'Last Updated',
  'Consent Version',
  'Source',
  'Medium',
  'Campaign',
  'Landing Page',
] as const;

/** UTF-8 byte order mark, so Excel opens the file as UTF-8 (names with accents survive). */
export const BOM = '\uFEFF';

/**
 * Spreadsheet formula injection guard: a cell starting with = + - @ (or a tab or carriage
 * return) could run as a formula when opened in Excel or Sheets, so it gets a leading `'`.
 */
export function guardCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** RFC 4180: quote a cell containing a comma, quote, CR or LF, and double any quotes. */
export function escapeCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function formatCell(value: string | null | undefined): string {
  return escapeCell(guardCell(value ?? ''));
}

export function recordToRow(record: SignupRecord): string[] {
  return [
    record.email,
    record.firstName ?? '',
    record.createdAt,
    record.updatedAt,
    record.consentVersion ?? '',
    record.firstSource.utm_source ?? '',
    record.firstSource.utm_medium ?? '',
    record.firstSource.utm_campaign ?? '',
    record.firstSource.page ?? '',
  ];
}

/** The whole CSV: BOM, header row, one row per record (oldest first), CRLF line endings. */
export function toCsv(records: readonly SignupRecord[]): string {
  const sorted = [...records].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.email.localeCompare(b.email),
  );
  const lines = [CSV_COLUMNS, ...sorted.map(recordToRow)].map((row) =>
    row.map((cell) => formatCell(cell)).join(','),
  );
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

/**
 * Parse `?since=YYYY-MM-DD` into the start of that day (UTC). Returns `undefined` when
 * absent and `null` when present but not a real date.
 */
export function parseSince(value: string | null): Date | null | undefined {
  if (value === null || value.trim() === '') return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return date;
}

/** Keep records that first signed up on or after `since`. */
export function filterSince(
  records: readonly SignupRecord[],
  since: Date | undefined,
): SignupRecord[] {
  if (!since) return [...records];
  const cutoff = since.getTime();
  return records.filter((r) => {
    const created = Date.parse(r.createdAt);
    return Number.isFinite(created) && created >= cutoff;
  });
}

/** `sea-air-club-early-access-YYYY-MM-DD.csv`, dated today (UTC). */
export function csvFilename(now: Date): string {
  return `sea-air-club-early-access-${now.toISOString().slice(0, 10)}.csv`;
}
