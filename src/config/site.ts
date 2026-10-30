/**
 * Site-wide settings. Anything Freddie may change (contact details, social links)
 * lives here until the CMS (Sanity) takes over in the full build.
 *
 * Values left as `null` are hidden on the page rather than shown as placeholders.
 */
export const site = {
  name: 'Sea Air Club',
  /** Canonical origin, set from SITE_URL in astro.config.mjs. */
  url: import.meta.env.SITE ?? 'https://seaairclub.co.uk',
  locale: 'en_GB',
  location: {
    locality: 'Salcombe',
    region: 'Devon',
    country: 'GB',
  },
  /** TODO(Freddie): confirm the public contact address. */
  contactEmail: null as string | null,
  /** TODO(Freddie): confirm the Instagram handle, e.g. https://www.instagram.com/seaairclub */
  instagramUrl: null as string | null,
  /** Year shown in the footer. */
  copyrightYear: 2026,
  seo: {
    defaultTitle: 'Sea Air Club · Coming soon to Salcombe',
    titleTemplate: '%s · Sea Air Club',
    description:
      'Three cabins on the edge of Salcombe, Devon, opening soon. Join the early access list to be first to hear about launch dates, booking access and exclusive opening offers.',
  },
  /**
   * The QR code on the page sends phone users straight to the sign-up.
   * UTM tags let us see how many sign-ups came from the QR code.
   */
  qrPath: '/join?utm_source=website&utm_medium=qr',
} as const;

export type Site = typeof site;
