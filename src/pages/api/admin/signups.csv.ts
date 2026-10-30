import type { APIRoute } from 'astro';
import { handleExport } from '@/lib/signups/export';
import { exportDeps } from '@/lib/signups/runtime';

// Runs on the server. Password-protected CSV export for the ResNexus import (docs/SIGNUPS.md).
export const prerender = false;

export const GET: APIRoute = (context) => handleExport(context.request, exportDeps(context));
