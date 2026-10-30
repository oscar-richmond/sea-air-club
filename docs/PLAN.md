# Build plan

## Phase 1: holding page (this build)

Goal: a production-ready holding page that matches the Figma Hi-fi v2 frames from 320px to 2560px, with a working early access sign-up. Ready to send to Freddie as a preview link, then to go live on seaairclub.co.uk.

### Workstreams

The work runs on three branches, each in its own git worktree, so they can run in parallel:

| Branch | Owner | Scope |
| --- | --- | --- |
| `main` | lead | Scaffold, tokens, base layout, all page sections, sign-up pop-up UI and script, `/join` pages, integration |
| `feat/signup` | agent | `/api/subscribe`, validation, spam guards, Vercel Blob storage adapter, webhook fan-out, CSV export, unit tests, sign-ups runbook |
| `feat/seo` | agent | `<head>` metadata, Open Graph image, favicon set, web manifest, sitemap and robots rules, JSON-LD, privacy notice and 404 pages, security headers |

The shared contract is `src/lib/signups/contract.ts` (API fields and responses) and `src/components/seo/SEO.astro` (props). Both are fixed before branching, so each branch can merge without conflicts.

### Sequence

1. Scaffold and tokens on `main`, committed before branching. Done.
2. In parallel:
   - Page sections and pop-up on `main`.
   - Sign-up backend on `feat/signup`.
   - SEO and launch basics on `feat/seo`.
3. Merge both branches into `main`. Wire the pop-up to the API, then run unit tests and an end-to-end sign-up test.
4. Independent QA by a reviewer who didn't build it. It covers:
   - Screen sizes 320, 375, 390, 768, 1024, 1280, 1440, 1920 and 2560.
   - Keyboard and screen-reader checks.
   - Lighthouse.
   - Comparison against the Figma frames.
5. Fix the findings, deploy a Vercel preview, and write the handover.

### Definition of done

- [ ] Visual match to the Figma desktop and mobile frames, and the four pop-up frames
- [ ] Fluid layout with no horizontal scroll or overlap from 320 to 2560px
- [ ] Sign-up works with and without JavaScript, stores to Blob, CSV export works
- [ ] Pop-up: focus moves in and returns, Esc and backdrop close, works with screen readers, `#join` deep link
- [ ] Lighthouse 95+ on mobile in all four categories (accessibility exceptions logged)
- [ ] Metadata, sharing image, favicons, sitemap; previews are `noindex`
- [ ] Privacy notice page (draft wording for Freddie to confirm)
- [ ] Runbook: env vars, Blob store, CSV export, domain switch

### Needed before go-live

| Item | From |
| --- | --- |
| Public contact email and Instagram handle (hidden until provided) | Freddie |
| Privacy notice details: legal entity name and address | Freddie |
| Domain access for seaairclub.co.uk | Freddie |
| Higher-resolution exteriors (current ones are 1535px wide) | Freddie |
| Final logo (SVG) to replace the typeset wordmark | Jasper |
| Whether ResNexus has an API for adding contacts | Vicki (Mon 2 Nov call) |

## Phase 2: full site (launch Fri 27 Nov per Freddie's timeline; proposal date Wed 2 Dec)

1. **Sanity:** schemas for the site settings, home page sections, cabins, FAQs and offers. Move `src/content/*.ts` into Sanity, then add the publish → rebuild webhook.
2. **Pages:** cabins (index and one page per cabin), the area, FAQs, and contact. The holding page sections are reused as blocks.
3. **Booking (`src/lib/booking/`):** a ResNexus provider with deep links per cabin and dates, plus an embedded widget or API availability depending on what ResNexus offers. Book buttons go across the site.
4. **Photography:** swap in images from the Fri 20 Nov shoot. Get a first batch of key shots early so the 27 Nov date holds.
5. **Analytics and SEO:** booking events, per-page metadata, LodgingBusiness structured data for each cabin, and redirects from any holding page URLs.
6. **Hand-off:** a Studio walkthrough for Freddie and a support plan covering hosting, updates and speed checks.
