import { describe, expect, it } from 'vitest';
import {
  getBodyKind,
  isAllowedOrigin,
  MAX_BODY_BYTES,
  readSubmission,
  wantsJson,
} from '../../src/lib/signups/http';
import { formRequest, jsonRequest, multipartRequest, SITE } from './helpers';

describe('response mode', () => {
  it('detects the body type', () => {
    expect(getBodyKind('application/json')).toBe('json');
    expect(getBodyKind('application/json; charset=utf-8')).toBe('json');
    expect(getBodyKind('application/x-www-form-urlencoded')).toBe('urlencoded');
    expect(getBodyKind('multipart/form-data; boundary=abc')).toBe('multipart');
    expect(getBodyKind('text/plain')).toBe('other');
    expect(getBodyKind(null)).toBe('other');
  });

  it('answers in JSON for JSON bodies or Accept: application/json', () => {
    const plain = new Request(SITE, { method: 'POST' });
    const accepts = new Request(SITE, {
      method: 'POST',
      headers: { accept: 'application/json, text/plain, */*' },
    });
    expect(wantsJson(plain, 'json')).toBe(true);
    expect(wantsJson(accepts, 'multipart')).toBe(true);
    expect(wantsJson(accepts, 'urlencoded')).toBe(true);
  });

  it('redirects for plain form posts', () => {
    const browserForm = new Request(SITE, {
      method: 'POST',
      headers: { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' },
    });
    expect(wantsJson(browserForm, 'urlencoded')).toBe(false);
    expect(wantsJson(browserForm, 'multipart')).toBe(false);
  });
});

describe('readSubmission', () => {
  it('reads JSON, keeping only known fields', async () => {
    const r = await readSubmission(
      jsonRequest('{"email":"a@example.com","elapsedMs":3000,"isAdmin":true,"__proto__":{"x":1}}'),
    );
    expect(r).toEqual({ ok: true, kind: 'json', raw: { email: 'a@example.com', elapsedMs: 3000 } });
  });

  it('reads URL-encoded forms (first value wins)', async () => {
    const req = new Request(`${SITE}/api/subscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=a%40example.com&firstName=Ana&firstName=Other&company=&utm_source=postcard',
    });
    const r = await readSubmission(req);
    expect(r).toEqual({
      ok: true,
      kind: 'urlencoded',
      raw: { email: 'a@example.com', firstName: 'Ana', company: '', utm_source: 'postcard' },
    });
  });

  it('reads multipart forms and ignores files', async () => {
    const form = new FormData();
    form.append('email', 'a@example.com');
    form.append('firstName', new Blob(['not a name']), 'name.txt');
    const req = new Request(`${SITE}/api/subscribe`, { method: 'POST', body: form });
    const r = await readSubmission(req);
    expect(r).toEqual({ ok: true, kind: 'multipart', raw: { email: 'a@example.com' } });
  });

  it('reads helpers for form and multipart requests', async () => {
    expect((await readSubmission(formRequest({ email: 'a@example.com' }))).ok).toBe(true);
    const m = await readSubmission(multipartRequest({ email: 'a@example.com', elapsedMs: '2000' }));
    expect(m).toMatchObject({ raw: { email: 'a@example.com', elapsedMs: '2000' } });
  });

  it('treats malformed or unknown bodies as empty', async () => {
    expect(await readSubmission(jsonRequest('{oops'))).toEqual({ ok: true, kind: 'json', raw: {} });
    expect(await readSubmission(jsonRequest('["a@example.com"]'))).toMatchObject({ raw: {} });
    const text = new Request(SITE, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'email=a@example.com',
    });
    expect(await readSubmission(text)).toEqual({ ok: true, kind: 'other', raw: {} });
  });

  it('refuses oversized bodies', async () => {
    const big = jsonRequest({ email: 'a@example.com', referrer: 'x'.repeat(MAX_BODY_BYTES) });
    expect(await readSubmission(big)).toEqual({ ok: false, kind: 'json', reason: 'too_large' });
  });
});

describe('isAllowedOrigin', () => {
  const req = (headers: Record<string, string>, url = `${SITE}/api/subscribe`) =>
    new Request(url, { method: 'POST', headers });
  const prod = { allowLocalhost: false };

  it('allows requests with no Origin header (curl, server-to-server)', () => {
    expect(isAllowedOrigin(req({}), prod)).toBe(true);
  });

  it('allows the same host and refuses other hosts', () => {
    expect(isAllowedOrigin(req({ origin: SITE }), prod)).toBe(true);
    expect(isAllowedOrigin(req({ origin: 'https://evil.example' }), prod)).toBe(false);
    expect(isAllowedOrigin(req({ origin: 'https://seaairclub.co.uk.evil.example' }), prod)).toBe(
      false,
    );
    expect(isAllowedOrigin(req({ origin: 'not a url' }), prod)).toBe(false);
  });

  it('matches a forwarded host (preview deployments behind a proxy)', () => {
    const r = req(
      { origin: 'https://sac-git-main.vercel.app', 'x-forwarded-host': 'sac-git-main.vercel.app' },
      'http://localhost/api/subscribe',
    );
    expect(isAllowedOrigin(r, prod)).toBe(true);
  });

  it('allows localhost origins only in development', () => {
    const r = req({ origin: 'http://localhost:4321' });
    expect(isAllowedOrigin(r, prod)).toBe(false);
    expect(isAllowedOrigin(r, { allowLocalhost: true })).toBe(true);
  });

  it('treats Origin: null as cross-site only when the browser says so', () => {
    expect(isAllowedOrigin(req({ origin: 'null' }), prod)).toBe(true);
    expect(isAllowedOrigin(req({ origin: 'null', 'sec-fetch-site': 'same-origin' }), prod)).toBe(
      true,
    );
    expect(isAllowedOrigin(req({ origin: 'null', 'sec-fetch-site': 'cross-site' }), prod)).toBe(
      false,
    );
  });
});
