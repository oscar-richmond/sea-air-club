// @ts-check
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Canonical address of the live site. Override with SITE_URL if the domain changes.
const SITE_URL = process.env.SITE_URL || 'https://seaairclub.co.uk';

export default defineConfig({
  site: SITE_URL,
  // Static by default. Routes that need a server (the sign-up API, the CSV export,
  // and later booking availability) opt out with `export const prerender = false`.
  output: 'static',
  adapter: vercel({
    webAnalytics: { enabled: true },
    // Room for the CSV export to read every sign-up once the list is in the thousands.
    maxDuration: 30,
  }),
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/join/thanks') && !page.includes('/api/'),
    }),
  ],
  compressHTML: true,
  devToolbar: { enabled: false },
  trailingSlash: 'never',
  image: {
    // Build-time optimisation with sharp: AVIF/WebP at several widths, no runtime cost.
    responsiveStyles: false,
  },
  env: {
    schema: {
      // Where sign-ups are stored. 'blob' = Vercel Blob (private store, production).
      // 'memory' = in-process only, for local development and tests.
      SIGNUP_STORE: envField.enum({
        context: 'server',
        access: 'public',
        values: ['blob', 'memory'],
        optional: true,
      }),
      // Optional: every new sign-up is also POSTed here (Zapier, Make, a Google Sheet
      // script, or a ResNexus connector once Vicki confirms an API).
      SIGNUP_WEBHOOK_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      SIGNUP_WEBHOOK_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Password for the CSV export used to import sign-ups into ResNexus.
      // If unset, the export endpoint is disabled.
      ADMIN_EXPORT_PASSWORD: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Email through Resend: the welcome email to each new sign-up, and the Monday,
      // Wednesday and Friday digest of new sign-ups to the studio. See docs/SIGNUPS.md.
      RESEND_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      WELCOME_EMAIL_FROM: envField.string({ context: 'server', access: 'secret', optional: true }),
      WELCOME_EMAIL_REPLY_TO: envField.string({ context: 'server', access: 'secret', optional: true }),
      SIGNUP_DIGEST_FROM: envField.string({ context: 'server', access: 'secret', optional: true }),
      SIGNUP_DIGEST_TO: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Vercel Cron sends this as a bearer token; the digest route rejects anything else.
      CRON_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
