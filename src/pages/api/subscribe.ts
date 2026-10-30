import type { APIRoute } from 'astro';
import { jsonResponse } from '@/lib/signups/http';
import { subscribeDeps } from '@/lib/signups/runtime';
import { handleSubscribe } from '@/lib/signups/subscribe';

// Runs on the server (the rest of the site is static). Logic lives in src/lib/signups/.
export const prerender = false;

export const POST: APIRoute = (context) => handleSubscribe(context.request, subscribeDeps(context));

export const ALL: APIRoute = () =>
  jsonResponse({ ok: false, error: 'server' }, 405, { Allow: 'POST' });
