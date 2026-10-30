#!/usr/bin/env node
/**
 * Generate the Open Graph sharing image: public/og/sea-air-club-og.jpg (1200×630).
 *
 * Renders an HTML template in headless Chromium with the site's own self-hosted fonts
 * and the hero photograph, so the sharing card matches the holding page.
 *
 * Run from the repo root:
 *   node scripts/generate-og.mjs
 *
 * Needs the Playwright browser once per machine: pnpm exec playwright install chromium
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/og/sea-air-club-og.jpg');

const WIDTH = 1200;
const HEIGHT = 630;
const MAX_BYTES = 300 * 1024;

const asDataUrl = async (path, type) =>
  `data:${type};base64,${(await readFile(resolve(root, path))).toString('base64')}`;

const [photo, fraunces, alegreyaMedium] = await Promise.all([
  asDataUrl('src/assets/images/exteriors/exterior-1.jpg', 'image/jpeg'),
  asDataUrl(
    'node_modules/@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2',
    'font/woff2',
  ),
  asDataUrl(
    'node_modules/@fontsource/alegreya-sans/files/alegreya-sans-latin-500-normal.woff2',
    'font/woff2',
  ),
]);

// Copy and tokens mirror src/content/home.ts and src/styles/global.css.
const html = /* html */ `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<style>
  @font-face {
    font-family: 'Fraunces';
    src: url(${fraunces}) format('woff2');
    font-weight: 100 900;
    font-style: normal;
  }
  @font-face {
    font-family: 'Alegreya Sans';
    src: url(${alegreyaMedium}) format('woff2');
    font-weight: 500;
    font-style: normal;
  }
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  body {
    position: relative;
    overflow: hidden;
    background: #2b2521;
    color: #faf4f0;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  .photo {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    /* Bias to the lower part of the frame: the cabin and lawn, less sky. */
    object-position: 50% 78%;
  }
  .shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to bottom,
      rgba(43, 37, 33, 0.6) 0%,
      rgba(43, 37, 33, 0.34) 55%,
      rgba(43, 37, 33, 0.55) 100%
    );
  }
  .content {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 58px 80px 0;
  }
  .serif {
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 400;
    font-variation-settings: 'SOFT' 0, 'WONK' 1;
    font-optical-sizing: auto;
  }
  .wordmark {
    font-size: 28px;
    line-height: 1;
    letter-spacing: 0.16em;
    /* Letter-spacing adds trailing space after the last letter; balance it. */
    margin-right: -0.16em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .centre {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 30px;
    /* Optical centre: sit the headline block a little above the geometric middle. */
    padding-bottom: 86px;
  }
  .eyebrow {
    font-family: 'Alegreya Sans', 'Gill Sans', sans-serif;
    font-weight: 500;
    font-size: 21px;
    line-height: 1.2;
    letter-spacing: 0.18em;
    margin-right: -0.18em;
    text-transform: uppercase;
  }
  h1 {
    font-size: 112px;
    line-height: 0.94;
    letter-spacing: -0.025em;
    max-width: 900px;
    text-wrap: balance;
  }
</style>
</head>
<body>
  <img class="photo" src="${photo}" alt="" />
  <div class="shade"></div>
  <div class="content">
    <div class="wordmark serif">Sea Air Club</div>
    <div class="centre">
      <p class="eyebrow">Three cabins · Salcombe, Devon</p>
      <h1 class="serif">Coming soon to Salcombe</h1>
    </div>
  </div>
</body>
</html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const fontsOk = await page.evaluate(
    () =>
      document.fonts.check('400 112px "Fraunces"') &&
      document.fonts.check('500 21px "Alegreya Sans"'),
  );
  if (!fontsOk)
    throw new Error('Brand fonts did not load; refusing to write a fallback-font image.');

  await mkdir(dirname(out), { recursive: true });
  // Step quality down until the file is comfortably under the 300 KB budget.
  for (const quality of [88, 85, 82, 78, 74, 70]) {
    const buffer = await page.screenshot({
      type: 'jpeg',
      quality,
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    });
    if (buffer.length <= MAX_BYTES || quality === 70) {
      await writeFile(out, buffer);
      break;
    }
  }
} finally {
  await browser.close();
}

const { size } = await stat(out);
console.log(`  public/og/sea-air-club-og.jpg  ${WIDTH}×${HEIGHT}  ${(size / 1024).toFixed(0)} KB`);
if (size > MAX_BYTES) {
  console.error(`  Over the ${MAX_BYTES / 1024} KB budget.`);
  process.exitCode = 1;
}
