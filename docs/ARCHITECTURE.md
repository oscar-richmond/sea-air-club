# Sea Air Club website: architecture

This repo is the Sea Air Club website. It starts as the holding page (the Figma "Hi-fi v2" frames) and grows into the full site with ResNexus bookings. Everything here is chosen so the holding page becomes the first page of the full site, not a throwaway.

## Stack and why

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | **Astro 7** (TypeScript, strict) | Content-led marketing site: pages ship as static HTML with almost no JavaScript, so it's fast on phones from Instagram and the postcards. Server routes are available per page when needed (sign-ups now, booking availability later) without moving the whole site onto a server. |
| Styling | **Tailwind CSS 4** with design tokens in `src/styles/global.css` | Tokens mirror the Figma variables and "SAC /" text styles one to one. Same tooling as the studio's other builds. |
| Hosting | **Vercel** (`@astrojs/vercel`) | Matches the studio's client hosting. Static files on the CDN, one small serverless function for sign-ups, preview URLs for every change. |
| Sign-up storage | **Vercel Blob, private store** (London region) | No third-party account or database to manage for the holding page. Each sign-up is one private JSON file keyed by a hash of the email, so repeats don't create duplicates. Exported as CSV for ResNexus import. |
| Analytics | **Vercel Web Analytics** | Cookieless, so no cookie banner is needed. UTM tags from the postcards, QR code and Instagram are also saved on each sign-up. |
| Fonts | Fraunces (variable, self-hosted) + Alegreya Sans Light as the stand-in for Gill Sans Light | Self-hosted via Fontsource, preloaded. Swapping to licensed Gill Sans is a one-line token change. |
| CMS (full site) | **Sanity** | Structured content for cabins, pages and offers. Content in `src/content/*.ts` is already shaped like the planned Sanity documents. |

**Alternatives considered.** Next.js (the studio default) was ruled out for this site: it ships far more JavaScript for a mostly static marketing site, and nothing in the booking plan needs a React app. A database (Neon Postgres) was considered for sign-ups; it's the right move if sign-ups grow into accounts or enquiries, and the storage adapter makes that a drop-in change.

## Rendering model

- `output: 'static'`. Every page is pre-rendered at build time unless it opts out.
- Routes that need a server set `export const prerender = false`:
  - `POST /api/subscribe`: sign-ups.
  - `GET /api/admin/signups.csv`: password-protected CSV export for ResNexus import.
  - `/join`: the standalone sign-up page. It's on-demand so it can show server-side errors to visitors without JavaScript.
- Images are optimised at build time with sharp (AVIF and WebP, several widths).

## Directory layout

```
src/
  config/site.ts          Site-wide settings (name, URL, contact, socials, SEO defaults)
  content/home.ts         Holding page copy, one object per section (future Sanity shape)
  content/images.ts       Image registry with alt text
  assets/images/          Source images (optimised at build)
  styles/global.css       Tailwind + design tokens (colours, type scale, spacing)
  layouts/BaseLayout.astro
  components/
    ui/                   Button, Icon, Tag and other primitives (Figma components)
    sections/             Hero, Intro, Features, Statement, EarlyAccess, Footer
    signup/               Sign-up form, pop-up dialog and its script
    seo/                  <head> metadata, JSON-LD
  lib/
    signups/              Contract, validation, storage adapters, CSV export
    booking/              (full site) ResNexus booking links and availability
  pages/
    index.astro           Holding page
    join.astro            Standalone sign-up page (no-JS fallback, Instagram bio link)
    join/thanks.astro
    privacy.astro, 404.astro
    api/subscribe.ts, api/admin/signups.csv.ts
docs/                     This file, the build plan, and runbooks
tests/unit, tests/e2e
```

## Design tokens

Colours, type and spacing come from the Figma file "Sea Air Club — Holding Page Wireframe" (Hi-fi v2 frames, desktop holding page as the master).

- Colours: Estuary `#364B69`, Sailcloth `#F5EEDD`, Sea Air `#84B3CE`, Driftwood `#2B2521`, Buoy `#D96B43`, Off-white `#FAF4F0` (the page colour and light text in v2).
- Type: fluid sizes interpolate between the 390px mobile frame and the 1440px desktop frame with `clamp()`, so there are no jumps between breakpoints.
- Layout tokens: `--gutter` (24 → 64px), `--section-y` (80 → 140px), `--band-y` (96 → 180px).

## Sign-up flow

1. Any "Join" button is a link to `/join` marked `data-signup-open`. With JavaScript it opens the pop-up instead (a native `<dialog>`). Visiting `/#join` also opens it, which is where the QR code points.
2. The form POSTs to `/api/subscribe` (JSON from the pop-up, a normal form post without JavaScript).
3. The server validates, applies spam checks (honeypot, minimum time on form, rate limit), normalises the email and stores the record. It also forwards to an optional webhook (`SIGNUP_WEBHOOK_URL`).
4. Freddie or Vicki downloads `/api/admin/signups.csv` (password in `ADMIN_EXPORT_PASSWORD`) and imports it into the ResNexus "Pre launch early access" interest group.

**Stored per sign-up:** email, first name, consent wording version, timestamps, UTM tags and landing page. IP addresses are not stored.

**ResNexus.** There's no public API confirmed yet; the question is on the Mon 2 Nov call with Vicki. If an API exists, a `resnexus` destination is added next to the webhook in `src/lib/signups/` and sign-ups flow straight in. No page changes are needed.

## Full site: how this scales

- **Pages:** each cabin, the area, FAQs and the journal become Astro pages fed by Sanity at build time. A Sanity webhook triggers a Vercel rebuild on publish, so pages stay static.
- **Booking:** a `src/lib/booking/` module wraps ResNexus.
  - Deep links into the ResNexus booking engine, per cabin and with dates where supported.
  - An embedded widget, if ResNexus offers one.
  - Availability from the API, if Vicki confirms one, behind a cached server route.
  - Components only ever call this module, so the provider can change without touching pages.
- **Sections:** the holding page sections are already standalone components fed by props. They become Sanity "page builder" blocks.
- **Analytics:** booking-start and booking-complete events, plus the UTM sources already captured.

## Quality bar

- Lighthouse 95+ for performance, accessibility, best practices and SEO on mobile.
- LCP under 2.0s on a mid-range phone over 4G, CLS under 0.05, under 15 KB of JavaScript on the holding page.
- WCAG 2.2 AA, with two design decisions logged as known exceptions:
  - Off-white text on the Buoy buttons is 3.1:1.
  - The 40% opacity consent line is about 2.4:1.
- Tested from 320px phones to 2560px monitors.
