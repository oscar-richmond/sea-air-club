import type { APIRoute } from 'astro';
import { handleDigest } from '@/lib/signups/digest';
import { digestDeps } from '@/lib/signups/runtime';

// Runs on the server, called by Vercel Cron on Mondays, Wednesdays and Fridays (vercel.json).
export const prerender = false;

export const GET: APIRoute = (context) => handleDigest(context.request, digestDeps());
