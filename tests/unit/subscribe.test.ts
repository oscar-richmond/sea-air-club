import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { REDIRECT, type SubscribeResponse } from '../../src/lib/signups/contract';
import { createRateLimiter } from '../../src/lib/signups/rate-limit';
import { createMemoryStore, type SignupStore } from '../../src/lib/signups/store';
import {
  createSubscribeRateLimiter,
  failureLocation,
  handleSubscribe,
  type SubscribeDeps,
} from '../../src/lib/signups/subscribe';
import { formRequest, jsonRequest, multipartRequest, recordingLogger, SITE } from './helpers';

const EMAIL = 'alex@example.com';
const NOW = new Date('2026-11-02T10:00:00.000Z');

function setup(overrides: Partial<SubscribeDeps> = {}) {
  const store = createMemoryStore();
  const logger = recordingLogger();
  const fetchMock = vi.fn<typeof fetch>(async () => new Response('ok', { status: 200 }));
  const deps: SubscribeDeps = {
    getStore: () => store,
    rateLimiter: createSubscribeRateLimiter(),
    webhook: {},
    logger,
    allowLocalhostOrigin: false,
    fetch: fetchMock,
    now: () => NOW,
    ...overrides,
  };
  const send = (req: Request) => handleSubscribe(req, deps);
  return { store, logger, fetchMock, deps, send };
}

async function json(res: Response): Promise<SubscribeResponse> {
  return (await res.json()) as SubscribeResponse;
}

const valid = {
  email: EMAIL,
  firstName: 'Alex',
  company: '',
  elapsedMs: 4200,
  consentVersion: '2026-10',
  utm_source: 'postcard',
  utm_medium: 'print',
  utm_campaign: 'early-access',
  page: '/?utm_source=postcard',
  referrer: 'https://www.instagram.com/',
};

describe('POST /api/subscribe (JSON)', () => {
  it('stores a new sign-up and says thanks', async () => {
    const { send, store } = setup();
    const res = await send(jsonRequest(valid));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(await json(res)).toEqual({ ok: true, firstName: 'Alex', alreadySubscribed: false });

    const record = await store.get(EMAIL);
    expect(record).toMatchObject({
      email: EMAIL,
      firstName: 'Alex',
      consentVersion: '2026-10',
      submissions: 1,
      createdAt: NOW.toISOString(),
      firstSource: {
        utm_source: 'postcard',
        utm_medium: 'print',
        utm_campaign: 'early-access',
        page: '/',
        referrer: 'https://www.instagram.com/',
      },
    });
  });

  it('says alreadySubscribed on a repeat, without duplicating', async () => {
    const { send, store } = setup();
    await send(jsonRequest(valid));
    const res = await send(jsonRequest({ ...valid, email: ' ALEX@example.com ', firstName: '' }));
    expect(await json(res)).toEqual({ ok: true, firstName: null, alreadySubscribed: true });
    expect(await store.list()).toHaveLength(1);
    expect((await store.get(EMAIL))?.submissions).toBe(2);
  });

  it("never echoes another person's stored first name", async () => {
    const { send } = setup();
    await send(jsonRequest(valid));
    const res = await send(jsonRequest({ email: EMAIL }));
    expect(await json(res)).toMatchObject({ firstName: null, alreadySubscribed: true });
  });

  it('returns field errors with a 400', async () => {
    const { send, store } = setup();
    const res = await send(
      jsonRequest({ ...valid, email: 'not-an-email', firstName: 'x'.repeat(61) }),
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body).toEqual({
      ok: false,
      error: 'validation',
      fieldErrors: {
        email: 'Please enter a valid email address.',
        firstName: 'Please keep your first name to 60 characters or fewer.',
      },
    });
    expect(await store.list()).toHaveLength(0);
  });

  it('answers in JSON for form bodies sent with Accept: application/json', async () => {
    const { send } = setup();
    const res = await send(multipartRequest({ email: EMAIL }, { accept: 'application/json' }));
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ ok: true });
  });

  it('refuses oversized bodies with 413', async () => {
    const { send } = setup();
    const res = await send(jsonRequest({ email: EMAIL, referrer: 'x'.repeat(20_000) }));
    expect(res.status).toBe(413);
    expect(await json(res)).toEqual({ ok: false, error: 'validation', fieldErrors: {} });
  });
});

describe('POST /api/subscribe (no-JavaScript form)', () => {
  it('redirects to the thanks page with 303', async () => {
    const { send, store } = setup();
    const res = await send(formRequest({ email: EMAIL, firstName: 'Alex' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(REDIRECT.success);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await store.get(EMAIL)).not.toBeNull();
  });

  it('accepts multipart forms too', async () => {
    const { send, store } = setup();
    const res = await send(multipartRequest({ email: EMAIL }));
    expect(res.status).toBe(303);
    expect(await store.get(EMAIL)).not.toBeNull();
  });

  it('redirects back to /join with an error code, never with personal data', async () => {
    const { send } = setup();
    const res = await send(formRequest({ email: 'nope@', firstName: 'Alex' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/join?error=validation#signup-error');
    expect(res.headers.get('location')).not.toMatch(/nope|Alex/);
  });

  it('builds failure locations from the contract', () => {
    expect(failureLocation('validation')).toBe(`${REDIRECT.failure}?error=validation#signup-error`);
    expect(failureLocation('rate_limited')).toBe('/join?error=rate_limited#signup-error');
    expect(failureLocation('server')).toBe('/join?error=server#signup-error');
  });
});

describe('spam is dropped silently', () => {
  const cases: [string, Record<string, unknown>][] = [
    ['honeypot', { ...valid, company: 'Acme' }],
    ['too fast', { ...valid, elapsedMs: 300 }],
    ['link in name', { ...valid, firstName: 'see http://spam.example' }],
  ];

  for (const [name, body] of cases) {
    it(`${name}: looks like success, stores nothing, sends no webhook`, async () => {
      const { send, store, fetchMock } = setup({
        webhook: { url: 'https://hooks.example.com/signup' },
      });
      const res = await send(jsonRequest(body));
      expect(res.status).toBe(200);
      const parsed = await json(res);
      expect(parsed).toMatchObject({ ok: true, alreadySubscribed: false });
      expect(await store.list()).toHaveLength(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }

  it('honeypot on the no-JavaScript form redirects to the thanks page', async () => {
    const { send, store } = setup();
    const res = await send(formRequest({ email: EMAIL, company: 'Acme' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(REDIRECT.success);
    expect(await store.list()).toHaveLength(0);
  });

  it('skips the timing check when elapsedMs is missing', async () => {
    const { send, store } = setup();
    await send(formRequest({ email: EMAIL }));
    expect(await store.list()).toHaveLength(1);
  });

  it('silently drops spam even when the email is invalid', async () => {
    const { send } = setup();
    const res = await send(jsonRequest({ email: 'junk', company: 'Acme' }));
    expect(res.status).toBe(200);
  });
});

describe('rate limiting', () => {
  it('allows 5 attempts per IP, then 429 with Retry-After', async () => {
    const { send } = setup();
    const ip = { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' };
    for (let i = 0; i < 5; i++) {
      const res = await send(jsonRequest({ email: `p${i}@example.com` }, ip));
      expect(res.status).toBe(200);
    }
    const res = await send(jsonRequest({ email: 'p6@example.com' }, ip));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('600');
    expect(await json(res)).toEqual({ ok: false, error: 'rate_limited' });

    // Another IP is unaffected.
    const other = await send(
      jsonRequest({ email: 'q@example.com' }, { 'x-real-ip': '198.51.100.4' }),
    );
    expect(other.status).toBe(200);
  });

  it('redirects with error=rate_limited for the no-JavaScript form', async () => {
    const { send } = setup({ rateLimiter: createRateLimiter({ limit: 1, windowMs: 60_000 }) });
    await send(formRequest({ email: EMAIL }));
    const res = await send(formRequest({ email: EMAIL }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/join?error=rate_limited#signup-error');
  });
});

describe('origin check', () => {
  it('refuses cross-site posts with 403 and stores nothing', async () => {
    const { send, store } = setup();
    const res = await send(jsonRequest(valid, { origin: 'https://evil.example' }));
    expect(res.status).toBe(403);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await json(res)).toEqual({ ok: false, error: 'server' });
    expect(await store.list()).toHaveLength(0);
  });

  it('allows localhost in development', async () => {
    const { send } = setup({ allowLocalhostOrigin: true });
    const res = await send(jsonRequest(valid, { origin: 'http://localhost:4321' }));
    expect(res.status).toBe(200);
  });
});

describe('storage failure', () => {
  const failing: SignupStore = {
    kind: 'blob',
    upsert: async () => {
      throw new Error(`Blob unavailable for ${EMAIL}`);
    },
    get: async () => null,
    list: async () => [],
    delete: async () => false,
  };

  it('answers 500 server in JSON mode', async () => {
    const { send } = setup({ getStore: () => failing });
    const res = await send(jsonRequest(valid));
    expect(res.status).toBe(500);
    expect(await json(res)).toEqual({ ok: false, error: 'server' });
  });

  it('redirects with error=server for the no-JavaScript form', async () => {
    const { send } = setup({ getStore: () => failing });
    const res = await send(formRequest({ email: EMAIL }));
    expect(res.headers.get('location')).toBe('/join?error=server#signup-error');
  });

  it('treats a store that cannot even be created as a server error', async () => {
    const { send } = setup({
      getStore: () => {
        throw new Error('misconfigured');
      },
    });
    const res = await send(jsonRequest(valid));
    expect(res.status).toBe(500);
  });
});

describe('webhook', () => {
  it('posts signup.created then signup.updated, signed with the secret', async () => {
    const secret = 'test-secret';
    const { send, fetchMock } = setup({
      webhook: { url: 'https://hooks.example.com/signup', secret },
    });
    await send(jsonRequest(valid));
    await send(jsonRequest(valid));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://hooks.example.com/signup');
    const body = String(init?.body);
    const headers = init?.headers as Record<string, string>;
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    expect(headers['X-Signature']).toBe(`sha256=${expected}`);
    expect(JSON.parse(body)).toMatchObject({ event: 'signup.created', signup: { email: EMAIL } });

    const second = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body));
    expect(second).toMatchObject({ event: 'signup.updated', signup: { submissions: 2 } });
  });

  it("does not fail the visitor's sign-up when the webhook is down", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed');
    });
    const { send, store, logger } = setup({
      webhook: { url: 'https://hooks.example.com/signup' },
      fetch: fetchMock,
    });
    const res = await send(jsonRequest(valid));
    expect(res.status).toBe(200);
    expect(await store.get(EMAIL)).not.toBeNull();
    expect(logger.entries.some((e) => e.level === 'warn' && /Webhook failed/.test(e.message))).toBe(
      true,
    );
  });
});

describe('logging', () => {
  it('never logs a full email address', async () => {
    const { send, logger } = setup({
      webhook: { url: 'https://hooks.example.com/signup' },
      fetch: vi.fn<typeof fetch>(async () => new Response('nope', { status: 500 })),
    });
    await send(jsonRequest(valid));
    await send(jsonRequest(valid));
    await send(jsonRequest({ ...valid, company: 'Acme' }));
    const failing = setup({
      getStore: () => ({
        kind: 'memory',
        upsert: async () => {
          throw new Error('down');
        },
        get: async () => null,
        list: async () => [],
        delete: async () => false,
      }),
    });
    await failing.send(jsonRequest(valid));

    const all = `${logger.text()}\n${failing.logger.text()}`;
    expect(all).toContain('a***@example.com');
    expect(all).not.toContain(EMAIL);
  });
});

describe('no request host mismatch on the default helper', () => {
  it('uses the site origin', () => {
    expect(jsonRequest({}).headers.get('origin')).toBe(SITE);
  });
});
