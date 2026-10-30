import { describe, expect, it } from 'vitest';
import { containsLink, detectSpam, MIN_ELAPSED_MS } from '../../src/lib/signups/spam';

const base = { email: 'alex@example.com', firstName: 'Alex' };

describe('detectSpam', () => {
  it('lets a normal submission through', () => {
    expect(detectSpam(base)).toBeNull();
    expect(detectSpam({ ...base, sac_hp: '', elapsedMs: 4000 })).toBeNull();
  });

  it('flags a filled honeypot', () => {
    expect(detectSpam({ ...base, sac_hp: 'Acme Ltd' })).toBe('honeypot');
  });

  it('flags submissions faster than the minimum time', () => {
    expect(detectSpam({ ...base, elapsedMs: 200 })).toBe('too_fast');
    expect(detectSpam({ ...base, elapsedMs: MIN_ELAPSED_MS - 1 })).toBe('too_fast');
    expect(detectSpam({ ...base, elapsedMs: '700' })).toBe('too_fast');
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

  it('spots links in the first name (handled by dropping the name, not the sign-up)', () => {
    expect(detectSpam({ ...base, firstName: 'Visit http://spam.example' })).toBeNull();
    for (const name of ['Visit http://spam.example', 'HTTPS stuff', 'www.cheap-things', 'buy at shop.com', 'jo@example.co.uk']) {
      expect(containsLink(name)).toBe(true);
    }
  });

  it('does not flag ordinary names', () => {
    for (const name of ['Alex', 'Mary-Jane', "O'Brien", 'J. R.', 'Zo\u00EB', 'Anne Marie']) {
      expect(containsLink(name)).toBe(false);
    }
  });
});
