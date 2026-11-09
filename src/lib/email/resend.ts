/**
 * Minimal Resend client (https://resend.com/docs/api-reference/emails/send-email).
 * Plain fetch, no SDK, so it's easy to fake in tests.
 */

export interface EmailAttachment {
  filename: string;
  /** Base64-encoded file content. */
  content: string;
}

export interface EmailMessage {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string | undefined;
  attachments?: EmailAttachment[];
}

export interface EmailSender {
  send(message: EmailMessage): Promise<{ id: string }>;
}

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export interface ResendOptions {
  apiKey: string;
  fetch?: typeof fetch;
  /** Keep well inside the function's time limit. */
  timeoutMs?: number;
}

export function createResendSender({
  apiKey,
  fetch: doFetch = globalThis.fetch,
  timeoutMs = 5000,
}: ResendOptions): EmailSender {
  return {
    async send(message) {
      const response = await doFetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: message.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          ...(message.attachments?.length ? { attachments: message.attachments } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Resend responded ${response.status}: ${detail.slice(0, 300)}`);
      }
      const json = (await response.json().catch(() => ({}))) as { id?: string };
      return { id: json.id ?? '' };
    },
  };
}

/**
 * Preview-mode guard: emails only ever go out from the live production deployment.
 * Previews, local dev and test runs get no sender, even if a key is present.
 */
export function senderForEnvironment(
  apiKey: string | undefined,
  vercelEnv: string | undefined,
  options: Omit<ResendOptions, 'apiKey'> = {},
): EmailSender | null {
  if (!apiKey || vercelEnv !== 'production') return null;
  return createResendSender({ apiKey, ...options });
}

/** Comma-separated env value → list of addresses. */
export function parseRecipients(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
