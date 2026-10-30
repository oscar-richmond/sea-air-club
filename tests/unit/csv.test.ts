import { describe, expect, it } from 'vitest';
import {
  BOM,
  csvFilename,
  escapeCell,
  filterSince,
  formatCell,
  guardCell,
  parseSince,
  toCsv,
} from '../../src/lib/signups/csv';
import { applySubmission } from '../../src/lib/signups/record';
import type { SignupInput } from '../../src/lib/signups/types';

const input = (email: string, overrides: Partial<SignupInput> = {}): SignupInput => ({
  email,
  firstName: null,
  consentVersion: '2026-10',
  source: {
    utm_source: 'postcard',
    utm_medium: 'print',
    utm_campaign: 'early-access',
    utm_content: null,
    utm_term: null,
    referrer: null,
    page: '/',
  },
  ...overrides,
});

describe('escaping (RFC 4180)', () => {
  it('leaves plain cells alone', () => {
    expect(escapeCell('Alex')).toBe('Alex');
    expect(escapeCell('')).toBe('');
  });

  it('quotes cells with commas, quotes or line breaks, doubling quotes', () => {
    expect(escapeCell('Smith, Alex')).toBe('"Smith, Alex"');
    expect(escapeCell('Alex "Al" Smith')).toBe('"Alex ""Al"" Smith"');
    expect(escapeCell('line\nbreak')).toBe('"line\nbreak"');
    expect(escapeCell('cr\rhere')).toBe('"cr\rhere"');
  });
});

describe('CSV injection guard', () => {
  it("prefixes cells starting with = + - @ or tab with '", () => {
    expect(guardCell('=HYPERLINK("http://x","y")')).toBe(`'=HYPERLINK("http://x","y")`);
    expect(guardCell('+44 1548')).toBe(`'+44 1548`);
    expect(guardCell('-1')).toBe(`'-1`);
    expect(guardCell('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(guardCell('\tTab')).toBe(`'\tTab`);
  });

  it('leaves safe cells alone, including ones with those characters later on', () => {
    expect(guardCell('Mary-Jane')).toBe('Mary-Jane');
    expect(guardCell('a@example.com')).toBe('a@example.com');
  });

  it('guards before escaping', () => {
    expect(formatCell('=1+2,3')).toBe(`"'=1+2,3"`);
    expect(formatCell(null)).toBe('');
  });
});

describe('toCsv', () => {
  const older = applySubmission(
    null,
    input('zoe@example.com', { firstName: 'Zo\u00EB' }),
    new Date('2026-11-01T09:00:00.000Z'),
  );
  const newer = applySubmission(
    null,
    input('sam@example.com', {
      firstName: '=cmd|calc',
      source: { ...input('x').source, utm_campaign: 'autumn, launch', page: '/join' },
    }),
    new Date('2026-11-05T12:00:00.000Z'),
  );

  it('starts with a BOM and the ResNexus header row, uses CRLF, oldest first', () => {
    const csv = toCsv([newer, older]);
    expect(csv.startsWith(BOM)).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe(
      'Email,First Name,Signed Up,Last Updated,Consent Version,Source,Medium,Campaign,Landing Page',
    );
    expect(lines[1]).toBe(
      'zoe@example.com,Zo\u00EB,2026-11-01T09:00:00.000Z,2026-11-01T09:00:00.000Z,2026-10,postcard,print,early-access,/',
    );
    expect(lines[2]).toBe(
      `sam@example.com,'=cmd|calc,2026-11-05T12:00:00.000Z,2026-11-05T12:00:00.000Z,2026-10,postcard,print,"autumn, launch",/join`,
    );
    expect(lines[3]).toBe('');
    expect(lines).toHaveLength(4);
  });

  it('is just the header for an empty list', () => {
    expect(toCsv([])).toBe(
      `${BOM}Email,First Name,Signed Up,Last Updated,Consent Version,Source,Medium,Campaign,Landing Page\r\n`,
    );
  });

  it('uses the first source for attribution, not the latest', () => {
    const repeat = applySubmission(
      older,
      input('zoe@example.com', { source: { ...input('x').source, utm_source: 'instagram' } }),
      new Date('2026-11-09T09:00:00.000Z'),
    );
    const row = toCsv([repeat]).split('\r\n')[1]!;
    expect(row).toContain(',postcard,');
    expect(row).not.toContain('instagram');
    expect(row).toContain('2026-11-09T09:00:00.000Z');
  });
});

describe('since filter', () => {
  it('parses YYYY-MM-DD as the start of that UTC day', () => {
    expect(parseSince('2026-11-02')?.toISOString()).toBe('2026-11-02T00:00:00.000Z');
    expect(parseSince(null)).toBeUndefined();
    expect(parseSince('')).toBeUndefined();
  });

  it('rejects anything else', () => {
    for (const bad of ['2026-13-01', '2026-02-30', '02/11/2026', '2026-11-2', 'yesterday']) {
      expect(parseSince(bad)).toBeNull();
    }
  });

  it('keeps records created on or after the date', () => {
    const at = (iso: string, email: string) => applySubmission(null, input(email), new Date(iso));
    const records = [
      at('2026-11-01T23:59:59.999Z', 'a@example.com'),
      at('2026-11-02T00:00:00.000Z', 'b@example.com'),
      at('2026-11-10T08:00:00.000Z', 'c@example.com'),
    ];
    expect(filterSince(records, parseSince('2026-11-02') ?? undefined).map((r) => r.email)).toEqual(
      ['b@example.com', 'c@example.com'],
    );
    expect(filterSince(records, undefined)).toHaveLength(3);
  });
});

describe('csvFilename', () => {
  it('is dated', () => {
    expect(csvFilename(new Date('2026-11-02T22:15:00Z'))).toBe(
      'sea-air-club-early-access-2026-11-02.csv',
    );
  });
});
