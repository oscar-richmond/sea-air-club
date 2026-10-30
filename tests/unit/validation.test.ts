import { describe, expect, it } from 'vitest';
import {
  cleanFirstName,
  cleanMeta,
  cleanPage,
  cleanReferrer,
  MESSAGES,
  parseSubmission,
} from '../../src/lib/signups/validation';

const ok = (raw: Record<string, unknown>) => {
  const result = parseSubmission(raw);
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.fieldErrors)}`);
  return result.input;
};

const errors = (raw: Record<string, unknown>) => {
  const result = parseSubmission(raw);
  if (result.ok) throw new Error('expected a validation error');
  return result.fieldErrors;
};

describe('email', () => {
  it('trims and lowercases', () => {
    expect(ok({ email: '  Alex.Smith@Example.COM ' }).email).toBe('alex.smith@example.com');
  });

  it('is required', () => {
    expect(errors({}).email).toBe(MESSAGES.emailRequired);
    expect(errors({ email: '' }).email).toBe(MESSAGES.emailRequired);
    expect(errors({ email: '   ' }).email).toBe(MESSAGES.emailRequired);
    expect(errors({ email: null }).email).toBe(MESSAGES.emailRequired);
  });

  it('must look like an email', () => {
    for (const email of ['nope', 'a@b', '@example.com', 'a@@example.com', 'a b@example.com']) {
      expect(errors({ email }).email).toBe(MESSAGES.emailInvalid);
    }
  });

  it('rejects non-string values', () => {
    expect(errors({ email: 42 }).email).toBeDefined();
    expect(errors({ email: ['a@example.com'] }).email).toBeDefined();
  });

  it('is at most 254 characters', () => {
    const local = 'a'.repeat(64);
    const long = `${local}@${'b'.repeat(180)}.example.com`; // > 254
    expect(long.length).toBeGreaterThan(254);
    expect(errors({ email: long }).email).toBe(MESSAGES.emailTooLong);
  });

  it('returns one short message per field', () => {
    const fe = errors({ email: 'nope', firstName: 'x'.repeat(61) });
    expect(Object.keys(fe).sort()).toEqual(['email', 'firstName']);
    expect(fe.firstName).toBe(MESSAGES.firstNameTooLong);
  });
});

describe('firstName', () => {
  it('is optional', () => {
    expect(ok({ email: 'a@example.com' }).firstName).toBeNull();
    expect(ok({ email: 'a@example.com', firstName: '' }).firstName).toBeNull();
    expect(ok({ email: 'a@example.com', firstName: '   ' }).firstName).toBeNull();
  });

  it('trims, collapses whitespace and strips control characters and angle brackets', () => {
    expect(cleanFirstName('  Mary \t  Jane\n ')).toBe('Mary Jane');
    expect(cleanFirstName('Al\u0000ex')).toBe('Alex');
    expect(cleanFirstName('<b>Sam</b>')).toBe('bSam/b');
    expect(cleanFirstName('Jo\u202Ehn')).toBe('John');
    expect(cleanFirstName('Zo\u00EB')).toBe('Zo\u00EB');
    expect(ok({ email: 'a@example.com', firstName: ' <Ana>  Lu ' }).firstName).toBe('Ana Lu');
  });

  it('is at most 60 characters after cleaning', () => {
    expect(ok({ email: 'a@example.com', firstName: 'x'.repeat(60) }).firstName).toHaveLength(60);
    expect(errors({ email: 'a@example.com', firstName: 'x'.repeat(61) }).firstName).toBe(
      MESSAGES.firstNameTooLong,
    );
    // Whitespace that collapses away doesn't count.
    expect(
      ok({ email: 'a@example.com', firstName: `${'x'.repeat(30)}${' '.repeat(40)}y` }).firstName,
    ).toHaveLength(32);
  });

  it('rejects non-string values', () => {
    expect(errors({ email: 'a@example.com', firstName: { a: 1 } }).firstName).toBe(
      MESSAGES.firstNameInvalid,
    );
  });
});

describe('metadata fields', () => {
  it('truncates UTM fields to 100, consent version to 40', () => {
    const input = ok({
      email: 'a@example.com',
      utm_source: 's'.repeat(150),
      utm_medium: 'postcard',
      utm_campaign: ' early-access ',
      utm_content: '',
      utm_term: 123,
      consentVersion: 'v'.repeat(50),
    });
    expect(input.source.utm_source).toHaveLength(100);
    expect(input.source.utm_medium).toBe('postcard');
    expect(input.source.utm_campaign).toBe('early-access');
    expect(input.source.utm_content).toBeNull();
    expect(input.source.utm_term).toBeNull();
    expect(input.consentVersion).toHaveLength(40);
  });

  it('keeps only the origin and path of the referrer, max 500', () => {
    expect(cleanReferrer('https://l.instagram.com/?u=https%3A%2F%2Fx&e=abc')).toBe(
      'https://l.instagram.com/',
    );
    expect(cleanReferrer('android-app://com.google.android.gm/')).toBe(
      'android-app://com.google.android.gm/',
    );
    expect(cleanReferrer(`https://example.com/${'p'.repeat(600)}`)).toHaveLength(500);
    expect(cleanReferrer('')).toBeNull();
  });

  it('keeps only the path of the landing page, max 200', () => {
    expect(cleanPage('/?utm_source=postcard#join')).toBe('/');
    expect(cleanPage('/join?email=someone%40example.com')).toBe('/join');
    expect(cleanPage('https://seaairclub.co.uk/cabins/sea?x=1')).toBe('/cabins/sea');
    expect(cleanPage(`/${'p'.repeat(300)}`)).toHaveLength(200);
    expect(cleanPage(undefined)).toBeNull();
  });

  it('strips control characters from metadata', () => {
    expect(cleanMeta('post\ncard\u0007', 100)).toBe('post card');
  });
});
