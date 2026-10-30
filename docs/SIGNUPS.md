# Sign-ups runbook

How the early access sign-ups work, how to set them up on Vercel, and how to get them into ResNexus. Section 5 is written so it can be forwarded to Freddie and Vicki as is.

## 1. What happens when someone signs up

1. The pop-up (or the `/join` page without JavaScript) posts the form to `POST /api/subscribe`.
2. The server runs its checks, in order:
   - **Origin.** The post must come from this site. Posts from other sites get a 403.
   - **Rate limit.** 5 attempts per 10 minutes per IP address.
   - **Spam.** Three checks. Spam gets a normal "thanks" but is thrown away, so bots learn nothing:
     - the hidden honeypot field is filled in;
     - the form was submitted less than 1.5 seconds after it opened;
     - the first name contains a link.
   - **Validation.** The email is required and must look real. The first name is optional, cleaned, and at most 60 characters.
3. The sign-up is saved as one private file per email address. A repeat sign-up updates that file rather than adding a second one.
4. If a webhook is set up, the sign-up is also posted there (section 6).
5. The visitor sees the thank-you message. Without JavaScript they're redirected to `/join/thanks`.

The code is in `src/lib/signups/`. The two routes in `src/pages/api/` are thin wrappers around it.

## 2. How sign-ups are stored

**Where.** In a **private Vercel Blob store**, in London. Each person is one JSON file at `signups/<sha256 of their email>.json`. Private means the files can't be opened by URL. Only this site's server (with `BLOB_READ_WRITE_TOKEN`) and people with access to the Vercel project can read them.

**What a record looks like:**

```json
{
  "id": "5b1c…e9",
  "email": "alex@example.com",
  "firstName": "Alex",
  "consentVersion": "2026-10",
  "createdAt": "2026-11-02T10:14:03.512Z",
  "updatedAt": "2026-11-09T18:40:11.004Z",
  "submissions": 2,
  "firstSource": { "utm_source": "postcard", "utm_medium": "print", "utm_campaign": "early-access",
                   "utm_content": null, "utm_term": null, "referrer": "https://www.instagram.com/", "page": "/" },
  "lastSource":  { "utm_source": "instagram", "utm_medium": null, "utm_campaign": null,
                   "utm_content": null, "utm_term": null, "referrer": null, "page": "/join" }
}
```

**Repeat sign-ups** (matched by email, ignoring capitals):
- `createdAt` and `firstSource` never change, so first-touch attribution is kept.
- `firstName` and `consentVersion` are updated only if the new submission has one.
- `updatedAt`, `lastSource` and `submissions` are always updated.

**Which store is used** depends on `SIGNUP_STORE`:

| Setting | Store |
| --- | --- |
| `SIGNUP_STORE=blob` | Vercel Blob |
| `SIGNUP_STORE=memory` | In memory (lost on restart; local development only) |
| unset (recommended) | Blob if `BLOB_READ_WRITE_TOKEN` exists, otherwise memory |

If production ever falls back to memory, the logs show a loud `SIGN-UPS ARE NOT BEING SAVED` error.

`SIGNUP_STORE` is fixed when the site is built, so redeploy after changing it. (Vercel needs a redeploy for any environment variable change anyway.)

## 3. Set up on Vercel (once)

### 3.1 Create the private Blob store

1. In the Vercel dashboard, open the Sea Air Club project, then **Storage → Create → Blob**.
2. Choose **Private** access.
3. Choose the **London (lhr1)** region.
4. Name it something like `sea-air-club-signups`.
5. **Connect it to the project.** This adds `BLOB_READ_WRITE_TOKEN` to the project's environment variables.
   - Tick **Production** only.
   - If Preview is also ticked, test sign-ups on preview links will land in the real list. Previews without the token use the memory store, which is what we want for testing.
   - If you'd like previews to store sign-ups too, create a second store (e.g. `sea-air-club-signups-preview`) and connect that one to Preview.
6. Redeploy production.

The dashboard labels may differ slightly from these steps; the choices that matter are **private**, **London**, and **production only**.

### 3.2 Set the export password

1. Generate a long random password, e.g. `openssl rand -base64 24`.
2. In **Project → Settings → Environment Variables**, add `ADMIN_EXPORT_PASSWORD` for Production and mark it **Sensitive**.
3. Redeploy.
4. Share the password with Freddie and Vicki through a password manager, not by email.

If `ADMIN_EXPORT_PASSWORD` isn't set, the export URL returns 404 (it's switched off). After 10 wrong passwords in 15 minutes, an IP address is paused for a while.

### 3.3 Add a Firewall rate limit (recommended)

The built-in rate limit is best effort. It counts per server instance and resets when the instance restarts. Add a Vercel Firewall rule as well:

1. Go to **Project → Firewall → Configure → New rule**.
2. Set the condition: **Request path** equals `/api/subscribe`, and **Method** equals `POST`.
3. Set the action: **Rate limit**, by IP, about **10 requests per 60 seconds**, then deny with 429.
4. Optionally, add a second rule for `/api/admin/signups.csv` (e.g. 20 per 10 minutes).
5. Save and publish the rules.

Rate-limit rules depend on the Vercel plan, so check what the team's plan includes.

### 3.4 Environment variables at a glance

| Variable | Needed | What it does |
| --- | --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Production | Added automatically when the Blob store is connected. |
| `ADMIN_EXPORT_PASSWORD` | To use the export | Password for the CSV export (username `admin`). |
| `SIGNUP_STORE` | No | Leave unset. `memory` for local development. |
| `SIGNUP_WEBHOOK_URL` | No | Also send each sign-up to this address (section 6). |
| `SIGNUP_WEBHOOK_SECRET` | With a webhook | Signs each webhook so the receiver can check it came from us. |

## 4. Download the CSV

Open **https://seaairclub.co.uk/api/admin/signups.csv** in a browser and log in with username `admin` and the export password. The file downloads as `sea-air-club-early-access-YYYY-MM-DD.csv`.

From a terminal:

```bash
curl -u admin:'THE-PASSWORD' -o signups.csv https://seaairclub.co.uk/api/admin/signups.csv
```

**Only new sign-ups.** Add `?since=YYYY-MM-DD` to get people who first signed up on or after that date (UTC). Use the date of the last import:

```
https://seaairclub.co.uk/api/admin/signups.csv?since=2026-11-02
```

**What's in the file:**
- One row per person, oldest first.
- Columns: Email, First Name, Signed Up, Last Updated, Consent Version, Source, Medium, Campaign, Landing Page.
- Source, Medium and Campaign are the UTM tags from the person's **first** sign-up (e.g. `postcard / print / early-access`).
- Dates are ISO 8601 in UTC, e.g. `2026-11-02T10:14:03.512Z`.
- UTF-8 with a byte order mark, so names with accents open correctly in Excel.
- Standard CSV quoting.
- Any cell starting with `=`, `+`, `-`, `@` or a tab gets a leading `'`, so it can't run as a spreadsheet formula. You may occasionally see a name like `'-Jo` because of this.

## 5. Importing into ResNexus (for Freddie and Vicki)

> **Note for Vicki:** please confirm the exact menu names in ResNexus. The steps below are the general shape of a contact import, not a copy of the ResNexus screens.

1. Download the CSV (section 4). For later imports, use `?since=` with the date of the previous import so only new people come through.
2. In ResNexus, open the guest or contact **import** (CSV upload).
3. Map the columns:
   - **Email** → Email
   - **First Name** → First name
   - The other columns (Signed Up, Consent Version, Source, Medium, Campaign, Landing Page) are optional. Map them to notes or custom fields if they're useful; otherwise skip them.
4. Add everyone in the file to the **"Pre launch early access"** interest group.
5. If ResNexus asks how to treat existing guests with the same email, choose to update or skip, not to create duplicates.
6. Keep the downloaded CSV somewhere safe as the record of who opted in and when (the Signed Up and Consent Version columns). Delete any other copies afterwards.

**Consent.** Everyone on the list ticked or agreed to the early access wording shown by `consentVersion`. They asked to hear about the launch, booking access and opening offers. Use the list for that, and honour unsubscribes in ResNexus.

**Questions for the Mon 2 Nov call with Vicki:**
- Does ResNexus have an API (or a form or webhook endpoint) for adding a contact to an interest group? If so: how is it authenticated, does it de-duplicate on email, and is there a marketing-consent field?
- Which CSV columns does the import accept, and can it add everyone to an interest group in one step?
- Where is ResNexus data hosted? This is for the privacy notice.

## 6. Optional: send each sign-up to a webhook (e.g. a Google Sheet)

Set `SIGNUP_WEBHOOK_URL` and every saved sign-up is also POSTed there as JSON:

```json
{ "event": "signup.created", "signup": { …the record shown in section 2… } }
```

- **Events.** The event is `signup.created` for a new email and `signup.updated` for a repeat.
- **Signature.** If `SIGNUP_WEBHOOK_SECRET` is set, the request carries `X-Signature: sha256=<hex>`. This is an HMAC-SHA256 of the exact request body using the secret, so the receiver can check the request really came from the site.
- **Failures.** The site waits up to 3 seconds for the webhook. If it fails or is slow, the failure is logged. The visitor's sign-up still succeeds and is already saved. There are no retries, so the Blob store and the CSV stay the source of truth.

**Zapier to Google Sheets:**
1. In Zapier, create a Zap with the **Webhooks by Zapier → Catch Hook** trigger. It's a premium app, so check the plan.
2. Put the hook URL in `SIGNUP_WEBHOOK_URL` and redeploy.
3. Submit a test sign-up with an `@example.com` address.
4. Add the action **Google Sheets → Create Spreadsheet Row**, mapping `signup__email`, `signup__firstName`, `signup__createdAt` and so on.

Zapier can't check the signature, so keep the hook URL private.

**Free alternative: Google Apps Script.**
- In the Sheet, go to **Extensions → Apps Script** and add a `doPost(e)` that appends `JSON.parse(e.postData.contents).signup` as a row.
- Deploy it as a web app and use its URL as the webhook. Redirects are followed, so the Apps Script 302 is fine.
- Apps Script can't read request headers, so it can't check `X-Signature`. Add a long random `?key=` to the URL and check that in `doPost` instead.

**Personal data.** A webhook copies personal data to another service. That service then needs to be covered in the privacy notice and included when deleting someone (section 8).

## 7. Where a direct ResNexus integration would plug in

If Vicki confirms an API, sign-ups can go straight into ResNexus as well as the Blob store. No page or pop-up changes are needed.

1. Add `RESNEXUS_*` variables (API key, property ID, interest group ID) to the `env.schema` in `astro.config.mjs` as `context: 'server', access: 'secret'`. Read them in `src/lib/signups/env.ts`.
2. Add `src/lib/signups/resnexus.ts` with something like `sendToResNexus(record, settings, { fetch, logger })`. Model it on `webhook.ts`: a short timeout, never throws, logs only masked emails.
3. Call it in `handleSubscribe` (`src/lib/signups/subscribe.ts`), right after the store `upsert` and next to `sendWebhook`. Pass the deps in from `src/lib/signups/runtime.ts`, and add a unit test with a mocked `fetch`.
4. Keep the Blob store as the source of truth, and keep the CSV export as the fallback if the API is down.

## 8. Personal data

**What's kept per person:**
- Email and first name (if given).
- The consent wording version.
- When they signed up and last submitted, and how many times.
- UTM tags, the landing page path and the referring site, for the first and the latest submission.

The referrer and landing page are trimmed to the address only. Query strings are dropped, so nothing personal sneaks in through them.

**What's not kept:**
- IP addresses (used in memory for rate limiting only, never stored).
- User agents, cookies, or anything from spam submissions.
- Full emails in logs. Logs show `a***@example.com`.

**Retention.** Freddie to decide. A sensible default is to keep the list until it has been imported into ResNexus and the launch emails have gone out, then delete the Blob files. Make sure the privacy notice says the same.

### Deleting one person's record

1. **Work out the file name.** It's the sha256 of the lower-cased email:

   ```bash
   printf '%s' 'Person@Example.com' | tr '[:upper:]' '[:lower:]' | shasum -a 256
   # → 3f0a…c1  →  the file is signups/3f0a…c1.json
   ```

2. **Delete the file.** Either:
   - **In the Vercel dashboard:** go to **Storage**, open the Blob store, browse to `signups/`, find the file and delete it.
   - **From the repo:** copy the store's read-write token from the dashboard and run

     ```bash
     BLOB_READ_WRITE_TOKEN='vercel_blob_rw_…' node -e "import('@vercel/blob').then(b => b.del('signups/3f0a…c1.json')).then(() => console.log('deleted'))"
     ```

3. **Remove them everywhere else:**
   - ResNexus (and the interest group);
   - any webhook destination (e.g. the Google Sheet);
   - any downloaded CSVs.

## 9. Local development and tests

```bash
cp .env.example .env     # SIGNUP_STORE=memory, and set ADMIN_EXPORT_PASSWORD=test
pnpm dev
curl -i -X POST http://localhost:4321/api/subscribe \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","firstName":"Test","elapsedMs":3000}'
curl -u admin:test http://localhost:4321/api/admin/signups.csv
pnpm test                # unit tests: validation, spam, storage, CSV, auth, rate limit, webhook
```

- Use `@example.com` addresses for every test, never a real person's email.
- The memory store is shared across reloads of the dev server and cleared when it stops.

## 10. API reference (for the pop-up and `/join`)

The contract is `src/lib/signups/contract.ts`.

### Request

`POST /api/subscribe` takes a JSON body (`Content-Type: application/json`), or form fields as `application/x-www-form-urlencoded` or `multipart/form-data`.

| Field | Notes |
| --- | --- |
| `email` | Required. Trimmed and lower-cased. At most 254 characters. |
| `firstName` | Optional. Cleaned, at most 60 characters. |
| `company` | The honeypot. Must be empty. |
| `elapsedMs` | Milliseconds the form was open. Leave it out when there's no JavaScript. |
| `consentVersion` | At most 40 characters. |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` | At most 100 characters each. |
| `referrer` | At most 500 characters. |
| `page` | At most 200 characters. |

### Responses

The server answers in **JSON** when the body is JSON or the request sends `Accept: application/json`. Otherwise it **redirects**.

Every response has `Cache-Control: no-store`.

| Outcome | JSON | No-JavaScript redirect (303) |
| --- | --- | --- |
| Saved (new or repeat) | 200 `{"ok":true,"firstName":"Alex"\|null,"alreadySubscribed":false\|true}` | `/join/thanks` |
| Spam (silently dropped) | 200 `{"ok":true,…,"alreadySubscribed":false}` | `/join/thanks` |
| Invalid input | 400 `{"ok":false,"error":"validation","fieldErrors":{"email":"…","firstName":"…"}}` | `/join?error=validation` |
| Body over 16 KB | 413 `{"ok":false,"error":"validation","fieldErrors":{}}` | `/join?error=validation` |
| Too many attempts | 429 `{"ok":false,"error":"rate_limited"}` plus `Retry-After` | `/join?error=rate_limited` |
| Storage failed | 500 `{"ok":false,"error":"server"}` | `/join?error=server` |
| Post from another site | 403 `{"ok":false,"error":"server"}` (JSON in both modes) | n/a |

- **`firstName` in the success response** is the cleaned name from this submission only, never the stored one, so typing someone else's email can't reveal their name. It's `null` if no name was given.
- **`fieldErrors`** holds a short message for each bad field and can be empty (`{}`) for a malformed request, so show a general message in that case.
- **The honeypot input** should have `autocomplete="off"` and `tabindex="-1"`, and be hidden with CSS rather than `type="hidden"`, so browser autofill doesn't fill it in.
