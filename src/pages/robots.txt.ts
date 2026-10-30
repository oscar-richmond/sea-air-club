/**
 * robots.txt, generated at build time.
 *
 * Production: crawl everything and find pages through the sitemap.
 * Preview deployments (any non-production Vercel build): block all crawling.
 * Pages also carry a noindex meta tag on previews, see src/components/seo/SEO.astro.
 */
import type { APIRoute } from 'astro';
import { site as siteConfig } from '@/config/site';
import { shouldNoindex } from '@/components/seo/deploy-env';

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL(siteConfig.url);

  const body = shouldNoindex()
    ? ['# Preview deployment: not for search engines', 'User-agent: *', 'Disallow: /', '']
    : [
        'User-agent: *',
        'Allow: /',
        '',
        `Sitemap: ${new URL('/sitemap-index.xml', origin).href}`,
        '',
      ];

  return new Response(body.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
