import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { silentLogger } from '../../src/lib/signups/log';
import { applySubmission } from '../../src/lib/signups/record';
import { sendWebhook, signWebhookBody } from '../../src/lib/signups/webhook';
import { recordingLogger } from './helpers';

const signup = applySubmission(
  null,
  {
    email: 'sam@example.com',
    firstName: 'Sam',
    consentVersion: '2026-10',
    source: {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      referrer: null,
      page: '/',
    },
  },
  new Date('2026-11-02T10:00:00.000Z'),
);

describe('signWebhookBody', () => {
  it('is sha256=<hex HMAC of the exact body>', () => {
    const body = '{"event":"signup.created"}';
    const hex = createHmac('sha256', 'shh').update(body).digest('hex');
    expect(signWebhookBody(body, 'shh')).toBe(`sha256=${hex}`);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('sendWebhook', () => {
  it('does nothing without a URL', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    expect(
      await sendWebhook(
        { event: 'signup.created', signup },
        {},
        { fetch: fetchMock, logger: silentLogger },
      ),
    ).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts JSON with a verifiable signature', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    const ok = await sendWebhook(
      { event: 'signup.created', signup },
      { url: 'https://hooks.example.com/x', secret: 'shh' },
      { fetch: fetchMock, logger: silentLogger },
    );
    expect(ok).toBe(true);
    const [, init] = fetchMock.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(init?.method).toBe('POST');
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Signature']).toBe(signWebhookBody(String(init?.body), 'shh'));
    expect(JSON.parse(String(init?.body))).toEqual({ event: 'signup.created', signup });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends no signature header without a secret', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('ok'));
    await sendWebhook(
      { event: 'signup.updated', signup },
      { url: 'https://hooks.example.com/x' },
      { fetch: fetchMock, logger: silentLogger },
    );
    const headers = fetchMock.mock.calls[0]![1]?.headers as Record<string, string>;
    expect(headers['X-Signature']).toBeUndefined();
  });

  it('logs and returns false on an error status, without throwing', async () => {
    const logger = recordingLogger();
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('bad', { status: 502 }));
    const ok = await sendWebhook(
      { event: 'signup.created', signup },
      { url: 'https://hooks.example.com/x' },
      { fetch: fetchMock, logger },
    );
    expect(ok).toBe(false);
    expect(logger.entries[0]).toMatchObject({
      level: 'warn',
      meta: { status: 502, email: 's***@example.com' },
    });
  });

  it('gives up after the timeout', async () => {
    const logger = recordingLogger();
    const hang = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const started = Date.now();
    const ok = await sendWebhook(
      { event: 'signup.created', signup },
      { url: 'https://hooks.example.com/x' },
      { fetch: hang, logger, timeoutMs: 50 },
    );
    expect(ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(logger.entries[0]?.message).toBe('Webhook failed');
  });
});
