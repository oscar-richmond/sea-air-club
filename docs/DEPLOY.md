# Deploying

How the Sea Air Club site is set up on Vercel, connected to seaairclub.co.uk, and checked before go-live. Sign-up storage and the CSV export are covered in more detail in [SIGNUPS.md](SIGNUPS.md).

## Current setup (9 November 2026)

| What | Where |
| --- | --- |
| Repository | `oscar-richmond/sea-air-club` (private). Pushes to `main` deploy to production; other branches get preview URLs. |
| Vercel project | `sea-air-club` in "oscar-richmond's projects", functions in London (`lhr1`), Node 24.x |
| Live link (pre-domain) | https://sea-air-club.vercel.app |
| Deployment Protection | Vercel Authentication **off**, so links open for anyone, including Freddie, without a Vercel login |
| Sign-up storage | Private Blob store `sea-air-club-signups` (London). Its token is on **Production only**, so previews and local dev never touch the real list |
| Search engines | Kept out while on vercel.app: `SITE_NOINDEX=true` on Production adds `noindex` and `Disallow: /` |
| Email | Resend (Oscar's account). Welcome email to each new sign-up, plus a digest of new sign-ups every Mon, Wed and Fri at 8am UTC (Vercel Cron, `vercel.json`). Production only. See [SIGNUPS.md §3.5](SIGNUPS.md#35-welcome-email-and-the-monwedfri-digest-resend) |

Environment variables currently set:

| Variable | Value | Environments |
| --- | --- | --- |
| `SITE_URL` | `https://sea-air-club.vercel.app` | Production, Preview |
| `SITE_NOINDEX` | `true` | Production |
| `SIGNUP_STORE` | `blob` | Production |
| `BLOB_READ_WRITE_TOKEN` | added by the Blob store | Production |
| `ADMIN_EXPORT_PASSWORD` | set (sensitive, given to Oscar separately) | Production |
| `RESEND_API_KEY` | Resend key `sea-air-club-website`, sending only (sensitive) | Production |
| `CRON_SECRET` | set (sensitive) | Production |
| `SIGNUP_DIGEST_TO` | `oscar@selfhood-studios.com` | Production |
| `SIGNUP_DIGEST_FROM` | `Sea Air Club website <signups@selfhood-studios.com>` | Production |
| `WELCOME_EMAIL_FROM` | `Sea Air Club <hello@seaairclub.co.uk>` (sends once the domain is verified in Resend) | Production |
| `WELCOME_EMAIL_REPLY_TO` | not set yet: waiting for the Sea Air Club inbox address | |

Preview deployments use the in-memory store (sign-ups look like they work but aren't kept) and have the CSV export switched off. Test sign-ups on the live link with `@example.com` addresses: the export leaves them out automatically.

### Switching to seaairclub.co.uk

1. Add the domain and DNS records (section 6 below).
2. Change `SITE_URL` to `https://seaairclub.co.uk` and delete `SITE_NOINDEX`.
3. Redeploy production, then run the go-live checklist at the end of this file. The QR code, canonical tags, sitemap and sharing image all follow `SITE_URL`.
4. Keep `sea-air-club.vercel.app` redirecting to the real domain: in Domains, edit it and set **Redirect to `seaairclub.co.uk`**.

## 1. Create the Vercel project

1. In Vercel, **Add New → Project** and import the GitHub repository. Connecting the repo is what gives automatic deploys:
   - every push to `main` deploys to production
   - every other branch and pull request gets its own preview URL
2. Project settings:

   | Setting          | Value                                                                |
   | ---------------- | -------------------------------------------------------------------- |
   | Framework preset | **Astro**                                                            |
   | Node.js version  | **24.x** (Settings → Build and Deployment)                           |
   | Install command  | default (`pnpm install`, detected from `pnpm-lock.yaml`)             |
   | Build command    | default (`astro build`)                                              |
   | Output directory | leave empty: the Astro Vercel adapter writes `.vercel/output` itself |
   | Root directory   | repository root                                                      |

3. Optional: to make Vercel use exactly the pnpm version pinned in `package.json` (`packageManager`), add the environment variable `ENABLE_EXPERIMENTAL_COREPACK=1`.

## 2. Environment variables

Set these in **Settings → Environment Variables**. They match [`.env.example`](../.env.example).

| Variable                | Production                 | Preview  | Notes                                                                                                                                                                             |
| ----------------------- | -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SITE_URL`              | `https://seaairclub.co.uk` | not set  | Canonical address for canonical tags, the sitemap, sharing images and the QR code. Defaults to `https://seaairclub.co.uk`, so previews already point canonicals at the live site. |
| `SIGNUP_STORE`          | `blob`                     | `memory` | `memory` keeps test sign-ups from preview links out of the real list. Use `blob` with a separate store on Preview only if you need to test storage end to end.                    |
| `BLOB_READ_WRITE_TOKEN` | added automatically        |          | Created when the Blob store is connected (step 3). Don't paste it by hand.                                                                                                        |
| `ADMIN_EXPORT_PASSWORD` | a long random password     | optional | Protects `/api/admin/signups.csv` (username `admin`). If empty, the export is switched off.                                                                                       |
| `SIGNUP_WEBHOOK_URL`    | optional                   |          | Every new sign-up is also POSTed here (Zapier, Make, a ResNexus connector).                                                                                                       |
| `SIGNUP_WEBHOOK_SECRET` | optional                   |          | Shared secret sent with the webhook.                                                                                                                                              |
| `RESEND_API_KEY`, `WELCOME_EMAIL_FROM`, `WELCOME_EMAIL_REPLY_TO`, `SIGNUP_DIGEST_FROM`, `SIGNUP_DIGEST_TO`, `CRON_SECRET` | see [SIGNUPS.md §3.4](SIGNUPS.md#34-environment-variables-at-a-glance) | not set | Welcome email and the Mon/Wed/Fri digest. Only production ever sends email. |

Mark the password, webhook secret, `RESEND_API_KEY` and `CRON_SECRET` as **Sensitive**. Redeploy after changing variables: they're read at build and request time, not live.

## 3. Connect the private Blob store

1. **Storage → Create → Blob**.
2. Name it `sea-air-club-signups`, choose **Private** access and the **London** region.
3. **Connect to project**: tick **Production** (and Preview only if you've decided to use Blob there, ideally with a second store).
4. Vercel adds `BLOB_READ_WRITE_TOKEN` to those environments. Redeploy.

Each sign-up is stored as one private JSON file, so nothing in the store is publicly reachable. See [SIGNUPS.md](SIGNUPS.md) for the export and the ResNexus import.

## 4. Enable Web Analytics

1. Open the project's **Analytics** tab and click **Enable**.
2. Redeploy.

The script is already wired in: the adapter's `webAnalytics` option adds a small inline loader that fetches `/_vercel/insights/script.js` from the site's own domain. It's cookieless, so no cookie banner is needed. Locally that script returns 404, which is expected.

## 5. Preview deployments are kept out of search

Every non-production Vercel build (where `VERCEL_ENV` isn't `production`) is automatically hidden from search engines:

- each page carries `<meta name="robots" content="noindex, nofollow">` (see `src/components/seo/SEO.astro`)
- `/robots.txt` returns `Disallow: /` (see `src/pages/robots.txt.ts`)

Production builds get `Allow: /` plus the `Sitemap:` line. Nothing to configure. Vercel's Deployment Protection also keeps previews behind a Vercel login by default; use the **Share** button on a deployment to send Freddie a link that works without one.

## 6. Connect seaairclub.co.uk

1. **Settings → Domains → Add** `seaairclub.co.uk`, then add `www.seaairclub.co.uk`.
2. Make the apex (`seaairclub.co.uk`) the primary domain. Edit `www.seaairclub.co.uk` and set it to **Redirect to `seaairclub.co.uk`** with **308 Permanent Redirect**.
3. At the domain registrar's DNS settings, add:

   | Type    | Name / host    | Value                  |
   | ------- | -------------- | ---------------------- |
   | `A`     | `@` (the apex) | `76.76.21.21`          |
   | `CNAME` | `www`          | `cname.vercel-dns.com` |

   Vercel's Domains screen shows the exact values for this project. If it shows different ones (for example a project-specific CNAME or a newer IP address), use what it shows.

4. Remove any other `A`, `AAAA` or `CNAME` records for `@` and `www` that point at the old host or a parking page.
5. Wait for both domains to show **Valid Configuration**. Vercel issues the HTTPS certificates automatically.

Keep DNS at the registrar rather than moving nameservers to Vercel unless you copy every existing record across first. Email for the domain (MX, SPF, DKIM records) depends on them.

While you're in the DNS settings, add the four Resend records too (TXT `resend._domainkey`, MX and TXT on `send`, CNAME `rsend`; values in [SIGNUPS.md §3.5](SIGNUPS.md#35-welcome-email-and-the-monwedfri-digest-resend)), then press **Verify** in Resend. That switches on the welcome email.

## Security headers

`vercel.json` adds these to every response:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains` (two years)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`: camera, microphone, geolocation and browsing-topics switched off
- `X-Frame-Options: DENY`
- `Content-Security-Policy`: everything from the site's own domain only. Inline scripts and styles are allowed because Astro inlines small ones and the analytics loader is inline. No framing, forms only post to the site, no plugins.

**How they're applied.** The Astro adapter writes `.vercel/output/config.json` itself and doesn't read `vercel.json`. Vercel's build step then merges the `vercel.json` headers into that config, ahead of the static files. A plain `pnpm build` won't show them in `config.json`; `vercel build` does. So always deploy through the Git integration, or with `vercel build` followed by `vercel deploy --prebuilt`. Uploading the output of a bare `astro build` with `--prebuilt` would skip the headers.

**Things to know.**

- _`includeSubDomains`_: every subdomain of seaairclub.co.uk must serve HTTPS. Bear this in mind if a subdomain is ever pointed somewhere else, for example a ResNexus booking page on `book.seaairclub.co.uk`.
- _Adding third-party content_: the CSP will block anything loaded from another domain until it's added to the policy. That covers a ResNexus booking widget, Instagram or map embeds, and externally hosted fonts. Each needs the right `script-src`, `frame-src`, `img-src` or `connect-src` entry.
- _Vercel Toolbar_: the CSP also blocks the toolbar and comments on preview deployments. If you want to collect Freddie's feedback with Vercel comments, add `https://vercel.live` to `script-src`, `connect-src` and `frame-src` (Vercel's docs list the full set).

## Sharing image and icons

These are generated by scripts and committed in `public/`:

- **Favicon set.** `public/favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` and `icon-maskable-512.png` come from `scripts/generate-icons.py`. The mark is a placeholder Fraunces "S" on Driftwood until Jasper's logo arrives. Each size is drawn at 8× and downsampled with LANCZOS.
  - Needs `pip install fonttools brotli pillow`.
  - Run with `python3 scripts/generate-icons.py`.
- **Sharing image.** `public/og/sea-air-club-og.jpg` (1200×630, under 300 KB) comes from `scripts/generate-og.mjs`, rendered in headless Chromium with the site's own fonts.
  - Needs Chromium for Playwright once per machine: `pnpm exec playwright install chromium`.
  - Run with `node scripts/generate-og.mjs`.

When the final logo arrives, replace the generated icons. Keep the same file names and sizes so nothing else needs to change.

## Go-live checklist

Before pointing the domain:

- [ ] Privacy notice: Freddie has confirmed the legal name, registered address, contact email and transfer safeguard (search `src/pages/privacy.astro` for `data-tbc`). Update the "Last updated" date if the wording changes.
- [ ] `contactEmail` and `instagramUrl` are set in `src/config/site.ts` (the Instagram link also feeds the structured data).
- [ ] Production environment variables are set and the Blob store is connected.

After the domain is live:

- [ ] **HTTPS and redirect.** `https://seaairclub.co.uk` loads. `http://` and `https://www.` both redirect to it.
- [ ] **Sign-up.** Join with a real address from a phone, both through the pop-up and with JavaScript turned off (`/join`). Check that a repeat sign-up doesn't create a duplicate.
- [ ] **CSV export.** Download `/api/admin/signups.csv` (username `admin`). Check the test sign-up is there with its UTM tags, then delete the test entries.
- [ ] **Emails.** seaairclub.co.uk shows **Verified** in Resend → Domains, and the real-address test sign-up above received the welcome email (check spam too). The digest dry run (`?dry=1`, SIGNUPS.md §3.5) answers with a count.
- [ ] **Sharing preview.** Paste `https://seaairclub.co.uk` into an Open Graph debugger: [opengraph.xyz](https://www.opengraph.xyz), the [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) (use **Scrape Again** to clear any old cache) and the [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/). Then send the link in WhatsApp or iMessage. The card should show the cabin image, "Sea Air Club · Coming soon to Salcombe" and the description.
- [ ] **Search engines.** `https://seaairclub.co.uk/robots.txt` shows `Allow: /` and the `Sitemap:` line, and the home page has no `noindex` tag.
- [ ] **Search Console.** Add a **Domain** property for `seaairclub.co.uk` (verify with the DNS TXT record), submit `https://seaairclub.co.uk/sitemap-index.xml` and request indexing of the home page.
- [ ] **Analytics.** Visit the site from a phone and confirm the visit appears in the Vercel Analytics tab within a few minutes.
- [ ] **Headers.** Check the security headers are present (for example with [securityheaders.com](https://securityheaders.com)) and the browser console shows no Content Security Policy errors.
- [ ] **Icons.** The favicon shows in a browser tab, and **Add to Home Screen** on iOS and Android shows the "S" icon.
