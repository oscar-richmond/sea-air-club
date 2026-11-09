import { describe, expect, it, vi } from 'vitest';
import type { EmailMessage, EmailSender } from '../../src/lib/email/resend';
import { createResendSender, parseRecipients, RESEND_ENDPOINT, senderForEnvironment } from '../../src/lib/email/resend';
import { digestEmail, escapeHtml, welcomeEmail, WELCOME_SUBJECT } from '../../src/lib/email/templates';
import { digestWindow, handleDigest, newSignups, type DigestDeps } from '../../src/lib/signups/digest';
import { createMemoryStore } from '../../src/lib/signups/store';
import { createSubscribeRateLimiter, handleSubscribe } from '../../src/lib/signups/subscribe';
import type { SignupRecord } from '../../src/lib/signups/types';
import { createWelcomeHook } from '../../src/lib/signups/welcome';
import { jsonRequest, recordingLogger } from './helpers';

// Sending is always faked in these tests; nothing leaves the machine. Addresses on a
// non-reserved domain are needed because reserved test domains are skipped on purpose.
const GUEST = 'guest@sac-unit-test.co.uk';
const SITE_URL = 'https://sea-air-club.vercel.app';

function fakeSender() {
  const sent: EmailMessage[] = [];
  const sender: EmailSender = {
    send: vi.fn(async (m: EmailMessage) => {
      sent.push(m);
      return { id: 'email_1' };
    }),
  };
  return { sender, sent };
}

function record(overrides: Partial<SignupRecord> = {}): SignupRecord {
  const source = { utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null, referrer: null, page: '/' };
  return {
    id: 'x',
    email: GUEST,
    firstName: 'Alex',
    consentVersion: '2026-10-30',
    createdAt: '2026-11-06T09:00:00.000Z',
    updatedAt: '2026-11-06T09:00:00.000Z',
    submissions: 1,
    firstSource: source,
    lastSource: source,
    flagged: null,
    ...overrides,
  };
}

describe('welcome email template', () => {
  it('greets by name and links the privacy notice', () => {
    const email = welcomeEmail({ firstName: 'Alex', siteUrl: SITE_URL });
    expect(email.subject).toBe(WELCOME_SUBJECT);
    expect(email.text).toContain('Hi Alex,');
    expect(email.html).toContain(`${SITE_URL}/privacy`);
    expect(email.text).toContain('two cabins');
    expect(email.text).not.toContain('just reply');
  });

  it('falls back to Hello and offers replies only when a reply-to is set', () => {
    const email = welcomeEmail({ firstName: null, siteUrl: SITE_URL, replyTo: 'info@seaairclub.co.uk' });
    expect(email.text).toContain('Hello,');
    expect(email.text).toContain('just reply');
  });

  it('escapes names', () => {
    expect(welcomeEmail({ firstName: '<b>Al</b>', siteUrl: SITE_URL }).html).toContain('&lt;b&gt;Al&lt;/b&gt;');
    expect(escapeHtml(`"'&`)).toBe('&quot;&#39;&amp;');
  });
});

describe('welcome hook', () => {
  const settings = { from: 'Sea Air Club <hello@seaairclub.co.uk>', replyTo: undefined, siteUrl: SITE_URL };

  it('sends to a new, genuine sign-up', async () => {
    const { sender, sent } = fakeSender();
    await createWelcomeHook(sender, settings, recordingLogger())(record(), true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(GUEST);
    expect(sent[0]!.from).toBe(settings.from);
  });

  it('skips repeats, flagged sign-ups, test addresses, and when not configured', async () => {
    const { sender, sent } = fakeSender();
    const hook = createWelcomeHook(sender, settings, recordingLogger());
    await hook(record(), false);
    await hook(record({ flagged: 'too_fast' }), true);
    await hook(record({ email: 'alex@example.com' }), true);
    await createWelcomeHook(sender, { ...settings, from: undefined }, recordingLogger())(record(), true);
    await createWelcomeHook(null, settings, recordingLogger())(record(), true);
    expect(sent).toHaveLength(0);
  });

  it('logs a failure instead of throwing', async () => {
    const logger = recordingLogger();
    const sender: EmailSender = { send: vi.fn(async () => { throw new Error('Resend responded 403: domain not verified'); }) };
    await expect(createWelcomeHook(sender, settings, logger)(record(), true)).resolves.toBeUndefined();
    expect(logger.text()).toContain('Welcome email not sent');
    expect(logger.text()).not.toContain(GUEST);
  });

  it('runs from the sign-up handler for new sign-ups only', async () => {
    const store = createMemoryStore();
    const welcome = vi.fn(async () => {});
    const deps = {
      getStore: () => store,
      rateLimiter: createSubscribeRateLimiter(),
      webhook: {},
      logger: recordingLogger(),
      allowLocalhostOrigin: false,
      welcome,
    };
    await handleSubscribe(jsonRequest({ email: GUEST, elapsedMs: 3000 }), deps);
    await handleSubscribe(jsonRequest({ email: GUEST, elapsedMs: 3000 }), deps);
    expect(welcome).toHaveBeenCalledTimes(2);
    expect(welcome.mock.calls.map((c) => (c as unknown[])[1])).toEqual([true, false]);
  });
});

describe('Resend client', () => {
  it('posts the message with the API key and maps replyTo', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: 'abc' }), { status: 200 }));
    const sender = createResendSender({ apiKey: 're_test', fetch: fetchMock });
    const result = await sender.send({ from: 'a@x.co', to: GUEST, subject: 's', html: 'h', text: 't', replyTo: 'r@x.co' });
    expect(result.id).toBe('abc');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(RESEND_ENDPOINT);
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    expect(JSON.parse(init!.body as string)).toMatchObject({ reply_to: 'r@x.co', to: GUEST });
  });

  it('throws with the status on failure', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('nope', { status: 403 }));
    await expect(
      createResendSender({ apiKey: 'k', fetch: fetchMock }).send({ from: 'a', to: 'b', subject: 's', html: 'h', text: 't' }),
    ).rejects.toThrow('403');
  });

  it('only sends from production (preview-mode guard)', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
    expect(senderForEnvironment('re_test', 'preview', { fetch: fetchMock })).toBeNull();
    expect(senderForEnvironment('re_test', 'development', { fetch: fetchMock })).toBeNull();
    expect(senderForEnvironment('re_test', undefined, { fetch: fetchMock })).toBeNull();
    expect(senderForEnvironment(undefined, 'production', { fetch: fetchMock })).toBeNull();
    const live = senderForEnvironment('re_test', 'production', { fetch: fetchMock });
    expect(live).not.toBeNull();
    await live!.send({ from: 'a@x.co', to: GUEST, subject: 's', html: 'h', text: 't' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('parses recipient lists', () => {
    expect(parseRecipients(' a@x.co, b@x.co ,')).toEqual(['a@x.co', 'b@x.co']);
    expect(parseRecipients(undefined)).toEqual([]);
  });
});

describe('digest window (Mon, Wed, Fri at 08:00 UTC)', () => {
  const w = (iso: string) => {
    const { since, until } = digestWindow(new Date(iso));
    return [since.toISOString(), until.toISOString()];
  };
  it('Monday covers Friday to Monday', () => {
    expect(w('2026-11-09T08:00:30Z')).toEqual(['2026-11-06T08:00:00.000Z', '2026-11-09T08:00:00.000Z']);
  });
  it('Wednesday covers Monday to Wednesday, even if the run is late', () => {
    expect(w('2026-11-11T08:55:00Z')).toEqual(['2026-11-09T08:00:00.000Z', '2026-11-11T08:00:00.000Z']);
  });
  it('Friday covers Wednesday to Friday', () => {
    expect(w('2026-11-13T08:00:00Z')).toEqual(['2026-11-11T08:00:00.000Z', '2026-11-13T08:00:00.000Z']);
  });
  it('before 8am on a Monday still points at the last full window', () => {
    expect(w('2026-11-09T07:59:00Z')).toEqual(['2026-11-04T08:00:00.000Z', '2026-11-06T08:00:00.000Z']);
  });
  it('counts only genuine, new sign-ups inside the window', () => {
    const since = new Date('2026-11-06T08:00:00Z');
    const until = new Date('2026-11-09T08:00:00Z');
    const rows = newSignups(
      [
        record(),
        record({ email: 'b@sac-unit-test.co.uk', createdAt: '2026-11-09T08:00:00.000Z' }),
        record({ email: 'c@sac-unit-test.co.uk', flagged: 'honeypot' }),
        record({ email: 'qa@example.com' }),
        record({ email: 'd@sac-unit-test.co.uk', createdAt: '2026-11-05T09:00:00.000Z' }),
      ],
      since,
      until,
    );
    expect(rows.map((r) => r.email)).toEqual([GUEST]);
  });
});

describe('digest route', () => {
  const NOW = new Date('2026-11-09T08:00:20Z');

  async function setup(overrides: Partial<DigestDeps> = {}) {
    const store = createMemoryStore();
    await store.upsert(
      { email: GUEST, firstName: 'Alex', consentVersion: '2026-10-30', source: { utm_source: 'postcard', utm_medium: 'qr', utm_campaign: null, utm_content: null, utm_term: null, referrer: null, page: '/' } },
      new Date('2026-11-07T12:00:00Z'),
    );
    await store.upsert({ email: 'qa@example.com', firstName: null, consentVersion: null, source: { utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null, referrer: null, page: '/' } }, new Date('2026-11-07T12:00:00Z'));
    const { sender, sent } = fakeSender();
    const deps: DigestDeps = {
      getStore: () => store,
      cronSecret: 'cron-test',
      sender,
      to: ['studio@sac-unit-test.co.uk'],
      from: 'Sea Air Club website <signups@sac-unit-test.co.uk>',
      siteUrl: SITE_URL,
      logger: recordingLogger(),
      now: () => NOW,
      ...overrides,
    };
    const call = (path = '/api/cron/signup-digest', auth: string | null = 'Bearer cron-test') =>
      handleDigest(new Request(`${SITE_URL}${path}`, { headers: auth ? { authorization: auth } : {} }), deps);
    return { call, sent, store };
  }

  it('is hidden without CRON_SECRET and refuses the wrong secret', async () => {
    expect((await (await setup({ cronSecret: undefined })).call()).status).toBe(404);
    expect((await (await setup()).call(undefined, 'Bearer wrong')).status).toBe(401);
  });

  it('emails new genuine sign-ups with a CSV attached', async () => {
    const { call, sent } = await setup();
    const res = await call();
    expect(await res.json()).toMatchObject({ ok: true, sent: true, count: 1, totalOnList: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.subject).toContain('1 new early access sign-up');
    const csv = Buffer.from(sent[0]!.attachments![0]!.content, 'base64').toString('utf8');
    expect(csv).toContain(GUEST);
    expect(csv).not.toContain('qa@example.com');
    expect(sent[0]!.attachments![0]!.filename).toBe('sea-air-club-new-signups-2026-11-09.csv');
  });

  it('sends nothing when there are no new sign-ups, and supports a dry run', async () => {
    const quiet = await setup({ now: () => new Date('2026-11-11T08:00:20Z') });
    expect(await (await quiet.call()).json()).toMatchObject({ sent: false, count: 0 });
    expect(quiet.sent).toHaveLength(0);
    const dry = await setup();
    expect(await (await dry.call('/api/cron/signup-digest?dry=1')).json()).toMatchObject({ dryRun: true, count: 1 });
    expect(dry.sent).toHaveLength(0);
  });

  it('reports a send failure as 502', async () => {
    const failing: EmailSender = { send: async () => { throw new Error('Resend responded 500'); } };
    expect((await (await setup({ sender: failing })).call()).status).toBe(502);
  });

  it('builds a readable digest', () => {
    const email = digestEmail({
      records: [record()],
      since: new Date('2026-11-06T08:00:00Z'),
      until: new Date('2026-11-09T08:00:00Z'),
      totalOnList: 7,
      exportUrl: `${SITE_URL}/api/admin/signups.csv`,
    });
    expect(email.subject).toBe('Sea Air Club: 1 new early access sign-up (Mon 9 Nov)');
    expect(email.text).toContain('7 on the list in total');
    expect(email.html).toContain('Pre launch early access');
  });
});
