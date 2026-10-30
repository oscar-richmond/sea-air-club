/**
 * Which Vercel environment this build (or request) belongs to.
 *
 * VERCEL_ENV is a Vercel system variable: 'production', 'preview' or 'development'.
 * It isn't on import.meta.env in Astro 7, so it's read from process.env. For
 * prerendered pages that happens at build time; for on-demand pages, at request time.
 * Locally (no VERCEL_ENV) builds behave like production.
 */
export function isNonProductionDeploy(): boolean {
  const env = process.env.VERCEL_ENV;
  return Boolean(env) && env !== 'production';
}

/**
 * Keep search engines out: on previews, and on production while SITE_NOINDEX=true
 * (set while the site runs on its vercel.app address before the real domain is connected).
 */
export function shouldNoindex(): boolean {
  return isNonProductionDeploy() || process.env.SITE_NOINDEX === 'true';
}

/**
 * Origin of this particular deployment on preview builds (e.g. the vercel.app URL),
 * so sharing images resolve on preview links before the real domain is live.
 * Returns null on production and locally.
 */
export function previewDeploymentOrigin(): string | null {
  if (!isNonProductionDeploy()) return null;
  const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  return host ? `https://${host}` : null;
}
