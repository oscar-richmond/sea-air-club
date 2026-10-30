import { describe, expect, it } from 'vitest';
import { containsLink, detectSpam, MIN_ELAPSED_MS } from '../../src/lib/signups/spam';

const base = { email: 'alex@example.com', firstName: 'Alex' };

describe('detectSpam', () => {
  it('lets a normal submission through', () => {
    expect(detectSpam(base)).toBeNull();
    expect(detectSpam({ ...base, company: '', elapsedMs: 4000 })).toBeNull();
  });

  it('flags a filled honeypot', () => {
    expect(detectSpam({ ...base, company: 'Acme Ltd' })).toBe('honeypot');
  });

  it('flags submissions faster than the minimum time', () => {
    expect(detectSpam({ ...base, elapsedMs: 200 })).toBe('too_fast');
    expect(detectSpam({ ...base, elapsedMs: MIN_ELAPSED_MS - 1 })).toBe('too_fast');
    expect(detectSpam({ ...base, elapsedMs: '900' })).toBe('too_fast');
    expect(detectSpam({ ...base, elapsedMs: 'soon' })).toBe('too_fast');
    expect(detectSpam({ ...base, elapsedMs: -5 })).toBe('too_fast');
  });

  it('accepts the minimum time and string numbers from forms', () => {
    expect(detectSpam({ ...base, elapsedMs: MIN_ELAPSED_MS })).toBeNull();
    expect(detectSpam({ ...base, elapsedMs: '2500' })).toBeNull();
  });

  it('skips the timing check when elapsedMs is missing (no-JavaScript form)', () => {
    expect(detectSpam({ ...base })).toBeNull();
    expect(detectSpam({ ...base, elapsedMs: '' })).toBeNull();
  });

  it('flags links in the first name', () => {
    expect(detectSpam({ ...base, firstName: 'Visit http://spam.example' })).toBe('link_in_name');
    expect(detectSpam({ ...base, firstName: 'HTTPS stuff' })).toBe('link_in_name');
    expect(detectSpam({ ...base, firstName: 'www.cheap-things' })).toBe('link_in_name');
    expect(detectSpam({ ...base, firstName: 'buy at shop.com' })).toBe('link_in_name');
  });

  it('does not flag ordinary names', () => {
    for (const name of ['Alex', 'Mary-Jane', "O'Brien", 'J. R.', 'Zo\u00EB', 'Anne Marie']) {
      expect(containsLink(name)).toBe(false);
    }
  });
});
