/**
 * Holding page copy, taken from the Figma Hi-fi v2 frames.
 *
 * Structured the way the Sanity schema will be in the full build (one object per
 * section), so swapping this file for a CMS query later doesn't touch the components.
 * Headline wording and sign-up wording are Freddie's. Intro, statement and feature
 * lines are draft copy awaiting his approval.
 */
import { images, type ImageKey } from './images';

export const home = {
  hero: {
    eyebrow: 'Three cabins · Salcombe, Devon',
    title: 'Coming soon to Salcombe',
    cta: 'Join the early access list',
    image: 'exterior-1' satisfies ImageKey,
  },
  intro: {
    eyebrow: 'A coastal escape',
    body: "Three cabins tucked into the countryside just outside Salcombe. A small coastal escape, opening soon, that we can't wait to share.",
    cta: 'Join the early access list',
  },
  features: [
    {
      icon: 'home',
      title: 'Three cabins',
      body: 'Three cabins just outside Salcombe, each with its own character. Opening soon.',
    },
    {
      icon: 'waves',
      title: 'The coast, close by',
      body: "Salcombe's beaches, estuary and coast path, all close by.",
    },
    {
      icon: 'mail',
      title: 'First to know',
      body: 'Join the early access list to hear first about launch dates, booking access and exclusive offers.',
    },
  ],
  statement: {
    title: 'Slow mornings, salt air and evenings by the stove.',
    caption: 'A first look · previews of the cabins, final photography to follow',
    gallery: [
      'exterior-1',
      'land-bedroom',
      'exterior-4',
      'sea-kitchen',
      'exterior-2',
      'land-kitchen',
      'sea-bedroom',
      'exterior-3',
    ] satisfies ImageKey[],
  },
  earlyAccess: {
    eyebrow: 'Early access',
    /** The last word is set in italic, as in the design. */
    title: { lead: 'Join the early access', emphasis: 'list' },
    body: 'Be the first to hear about launch dates, booking access and exclusive opening offers.',
    cta: 'Join the early access list',
    note: 'Unsubscribe any time · Privacy notice',
    qrLabel: ['On your phone?', 'Scan to join'],
    image: 'exterior-3' satisfies ImageKey,
    imageTag: 'Preview',
  },
  signup: {
    title: { lead: 'Join the early access', emphasis: 'list' },
    body: 'Be the first to hear about launch dates, booking access and exclusive opening offers.',
    fields: {
      firstName: { label: 'First name (optional)', placeholder: 'e.g. Alex' },
      email: { label: 'Email', placeholder: 'you@example.com' },
    },
    submit: 'Join the early access list',
    submitting: 'Joining…',
    consent:
      'By joining you agree to receive emails from Sea Air Club. Unsubscribe any time.',
    consentLink: 'Privacy notice',
    /** Bump when the consent wording changes, so each sign-up records what was agreed to. */
    consentVersion: '2026-10-30',
    success: {
      title: { lead: "You're on the", emphasis: 'list' },
      /** `{name}` is replaced with the first name when given. */
      bodyWithName:
        "Thanks, {name}. You'll be the first to hear about launch dates, booking access and exclusive opening offers.",
      body: "Thanks. You'll be the first to hear about launch dates, booking access and exclusive opening offers.",
      done: 'Done',
    },
    errors: {
      email: 'Please enter a valid email address.',
      firstName: 'Please keep your first name under 60 characters.',
      generic: "Sorry, something went wrong and you're not on the list yet. Please try again.",
      rateLimited: 'Too many attempts. Please wait a minute and try again.',
    },
  },
  footer: {
    location: 'Salcombe, Devon',
    privacy: 'Privacy notice',
    instagram: 'Instagram',
  },
} as const;

export { images };
