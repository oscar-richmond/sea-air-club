import { FIELD } from './contract';
import type { RawSubmission } from './validation';

/** Bodies over this are refused. A real sign-up is well under 2 KB. */
export const MAX_BODY_BYTES = 16 * 1024;

export type BodyKind = 'json' | 'urlencoded' | 'multipart' | 'other';

export function getBodyKind(contentType: string | null): BodyKind {
  const type = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (type === 'application/json' || type.endsWith('+json')) return 'json';
  if (type === 'application/x-www-form-urlencoded') return 'urlencoded';
  if (type === 'multipart/form-data') return 'multipart';
  return 'other';
}

/**
 * Answer in JSON when the body was JSON or the client asked for JSON
 * (`Accept: application/json`). Otherwise it's the no-JavaScript form: redirect.
 */
export function wantsJson(request: Request, kind: BodyKind): boolean {
  if (kind === 'json') return true;
  const accept = request.headers.get('accept') ?? '';
  return accept.toLowerCase().includes('application/json');
}

const KNOWN_FIELDS = new Set<string>(Object.values(FIELD));

async function readCapped(request: Request, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export type ReadResult =
  | { ok: true; kind: BodyKind; raw: RawSubmission }
  | { ok: false; kind: BodyKind; reason: 'too_large' };

/**
 * Read the sign-up fields from a JSON, URL-encoded or multipart body. Only known field
 * names are kept; with repeated form fields the first wins. A body that can't be parsed
 * reads as empty, which then fails validation ("Please enter your email address.").
 */
export async function readSubmission(request: Request): Promise<ReadResult> {
  const contentType = request.headers.get('content-type');
  const kind = getBodyKind(contentType);
  const bytes = await readCapped(request, MAX_BODY_BYTES);
  if (bytes === null) return { ok: false, kind, reason: 'too_large' };

  const raw: RawSubmission = {};
  try {
    if (kind === 'json') {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes) || 'null');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) {
          if (KNOWN_FIELDS.has(key)) raw[key] = value;
        }
      }
    } else if (kind === 'urlencoded') {
      const params = new URLSearchParams(new TextDecoder().decode(bytes));
      for (const key of KNOWN_FIELDS) {
        const value = params.get(key);
        if (value !== null) raw[key] = value;
      }
    } else if (kind === 'multipart') {
      const form = await new Response(bytes, {
        headers: { 'content-type': contentType ?? '' },
      }).formData();
      for (const key of KNOWN_FIELDS) {
        const value = form.get(key);
        if (typeof value === 'string') raw[key] = value;
      }
    }
  } catch {
    // Malformed body: treat as empty.
  }
  return { ok: true, kind, raw };
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  );
}

/**
 * Cross-site check. Browsers send `Origin` on every POST; if it's there, its host must be
 * this site's host. No `Origin` (curl, server-to-server) is allowed through.
 *
 * `Origin: null` is sent by sandboxed frames, and also by real visitors' browsers if the
 * page's Referrer-Policy is `no-referrer`, so it's only refused when the browser says the
 * request is cross-site (`Sec-Fetch-Site`).
 */
export function isAllowedOrigin(request: Request, options: { allowLocalhost: boolean }): boolean {
  const origin = request.headers.get('origin');
  if (origin === null || origin === '') return true;
  if (origin === 'null') return request.headers.get('sec-fetch-site') !== 'cross-site';

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  const hosts = new Set<string>();
  try {
    hosts.add(new URL(request.url).host.toLowerCase());
  } catch {
    // Relative or odd URL: rely on the headers below.
  }
  for (const header of ['host', 'x-forwarded-host']) {
    const value = request.headers.get(header)?.split(',')[0]?.trim().toLowerCase();
    if (value) hosts.add(value);
  }

  if (hosts.has(originUrl.host.toLowerCase())) return true;
  return options.allowLocalhost && isLocalHostname(originUrl.hostname.toLowerCase());
}

export const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

export function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

/** 303 See Other, so the browser follows with a GET. */
export function redirectResponse(location: string, headers: Record<string, string> = {}): Response {
  return new Response(null, {
    status: 303,
    headers: { ...NO_STORE_HEADERS, Location: location, ...headers },
  });
}
