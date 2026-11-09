/**
 * Email templates: the welcome email each new sign-up receives, and the Monday, Wednesday
 * and Friday digest of new sign-ups sent to the studio for the ResNexus import.
 *
 * Inline styles and tables only, so they render in every mail client. Brand colours from
 * the site; Georgia stands in for Fraunces, which mail clients can't load.
 */
import type { SignupRecord } from '@/lib/signups/types';

const C = {
  page: '#FAF4F0',
  text: '#2B2521',
  muted: '#6B625C',
  rule: '#E4DBD3',
  estuary: '#364B69',
} as const;

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Gill Sans', 'Gill Sans MT', Calibri, 'Helvetica Neue', Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function layout(inner: string, preheader: string): string {
  return `<!doctype html>
<html lang="en-GB">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Sea Air Club</title></head>
<body style="margin:0;padding:0;background:${C.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="font-family:${SERIF};font-size:16px;letter-spacing:4px;text-transform:uppercase;color:${C.text};padding-bottom:32px;">Sea Air Club</td></tr>
${inner}
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Welcome email
// ---------------------------------------------------------------------------

export interface WelcomeEmailInput {
  firstName: string | null;
  siteUrl: string;
  /** Where replies go. When unset, the "just reply" line is left out. */
  replyTo?: string | undefined;
}

export const WELCOME_SUBJECT = "You're on the Sea Air Club early access list";

export function welcomeEmail({ firstName, siteUrl, replyTo }: WelcomeEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const greeting = firstName ? `Hi ${firstName},` : 'Hello,';
  const privacyUrl = new URL('/privacy', siteUrl).href;
  const lines = [
    'Thanks for joining the Sea Air Club early access list.',
    "We're opening two cabins on the edge of Salcombe, Devon. You'll be among the first to hear about launch dates, booking access and exclusive opening offers.",
  ];
  const footer = replyTo
    ? `You're receiving this because you joined the early access list on the Sea Air Club website. If that wasn't you, or you'd rather not hear from us, just reply to this email.`
    : `You're receiving this because you joined the early access list on the Sea Air Club website.`;

  const p = (text: string) =>
    `<tr><td style="font-family:${SANS};font-size:17px;line-height:1.6;color:${C.text};padding-bottom:18px;">${escapeHtml(text)}</td></tr>`;

  const html = layout(
    `<tr><td style="font-family:${SERIF};font-size:34px;line-height:1.1;color:${C.text};padding-bottom:28px;">You're on the <em>list</em></td></tr>
${p(greeting)}
${lines.map(p).join('\n')}
<tr><td style="font-family:${SANS};font-size:17px;line-height:1.6;color:${C.text};padding:8px 0 36px;">Speak soon,<br>Sea Air Club</td></tr>
<tr><td style="border-top:1px solid ${C.rule};padding-top:20px;font-family:${SANS};font-size:13px;line-height:1.5;color:${C.muted};">${escapeHtml(footer)} <a href="${privacyUrl}" style="color:${C.estuary};">Privacy notice</a></td></tr>`,
    lines[1]!,
  );

  const text = [
    "You're on the list",
    '',
    greeting,
    '',
    ...lines.flatMap((l) => [l, '']),
    'Speak soon,',
    'Sea Air Club',
    '',
    '---',
    footer,
    `Privacy notice: ${privacyUrl}`,
  ].join('\n');

  return { subject: WELCOME_SUBJECT, html, text };
}

// ---------------------------------------------------------------------------
// Sign-up digest (to the studio)
// ---------------------------------------------------------------------------

export interface DigestEmailInput {
  records: readonly SignupRecord[];
  since: Date;
  until: Date;
  /** Everyone on the list, for context. */
  totalOnList: number;
  exportUrl: string;
}

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/London',
});
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/London',
});

export function digestEmail({ records, since, until, totalOnList, exportUrl }: DigestEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const n = records.length;
  const noun = n === 1 ? 'sign-up' : 'sign-ups';
  const subject = `Sea Air Club: ${n} new early access ${noun} (${dayFormat.format(until)})`;
  const period = `${timeFormat.format(since)} to ${timeFormat.format(until)}`;
  const sorted = [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const source = (r: SignupRecord) =>
    [r.firstSource.utm_source, r.firstSource.utm_medium].filter(Boolean).join(' / ') || 'Direct';

  const rows = sorted
    .map(
      (r) =>
        `<tr><td style="padding:8px 12px 8px 0;border-bottom:1px solid ${C.rule};">${escapeHtml(r.firstName ?? '')}</td><td style="padding:8px 12px 8px 0;border-bottom:1px solid ${C.rule};">${escapeHtml(r.email)}</td><td style="padding:8px 12px 8px 0;border-bottom:1px solid ${C.rule};white-space:nowrap;">${escapeHtml(timeFormat.format(new Date(r.createdAt)))}</td><td style="padding:8px 0;border-bottom:1px solid ${C.rule};">${escapeHtml(source(r))}</td></tr>`,
    )
    .join('\n');

  const html = layout(
    `<tr><td style="font-family:${SERIF};font-size:28px;line-height:1.15;color:${C.text};padding-bottom:16px;">${n} new early access ${noun}</td></tr>
<tr><td style="font-family:${SANS};font-size:16px;line-height:1.6;color:${C.text};padding-bottom:20px;">${escapeHtml(period)}. ${totalOnList} on the list in total.</td></tr>
<tr><td style="font-family:${SANS};font-size:16px;line-height:1.6;color:${C.text};padding-bottom:24px;">The attached CSV is ready to import into the <strong>Pre launch early access</strong> interest group in ResNexus (Guests, then Import).</td></tr>
<tr><td style="padding-bottom:28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${SANS};font-size:14px;color:${C.text};">
<tr><th align="left" style="padding:0 12px 8px 0;border-bottom:1px solid ${C.text};">Name</th><th align="left" style="padding:0 12px 8px 0;border-bottom:1px solid ${C.text};">Email</th><th align="left" style="padding:0 12px 8px 0;border-bottom:1px solid ${C.text};">Signed up</th><th align="left" style="padding:0 0 8px;border-bottom:1px solid ${C.text};">Source</th></tr>
${rows}
</table></td></tr>
<tr><td style="font-family:${SANS};font-size:13px;line-height:1.5;color:${C.muted};">Full list any time: <a href="${exportUrl}" style="color:${C.estuary};">${escapeHtml(exportUrl)}</a> (user admin, the export password). Sent automatically every Monday, Wednesday and Friday at 8am when there are new sign-ups.</td></tr>`,
    `${n} new ${noun} for the ResNexus import`,
  );

  const text = [
    `${n} new early access ${noun}`,
    `${period}. ${totalOnList} on the list in total.`,
    '',
    'The attached CSV is ready to import into the "Pre launch early access" interest group in ResNexus (Guests, then Import).',
    '',
    ...sorted.map(
      (r) =>
        `- ${r.firstName ? `${r.firstName}, ` : ''}${r.email} (${timeFormat.format(new Date(r.createdAt))}, ${source(r)})`,
    ),
    '',
    `Full list any time: ${exportUrl} (user admin, the export password).`,
  ].join('\n');

  return { subject, html, text };
}
