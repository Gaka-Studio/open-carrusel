/**
 * Direct Puppeteer export of Open Carrusel slides to PNG.
 * Bypasses the HTTP API (which times out) and reads carousel data directly.
 * Run from the open-carrusel directory: node export_direct.mjs
 */
import puppeteer from 'puppeteer';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read carousel data from Open Carrusel's data directory
const CAROUSELS_FILE = 'D:/open-carrusel/data/carousels.json';
const UPLOADS_DIR = 'D:/open-carrusel/public';
const OUTPUT_BASE = 'D:/GAKA_RRSS/clients/gaka_studio/productions/2026-W28';

const TARGETS = {
  '212653c0-21be-4f2b-a232-0cb4ba406057': 'carousel_ig_01',
  'acbab385-5857-43a6-9c90-5c0ba470aa68': 'carousel_ig_02',
  'd7f1cc89-984b-43e8-b375-99982ea78dfa': 'carousel_ig_03',
};

// Font loading CSS (inline the actual font files)
async function getInlineFontCSS() {
  // Use Google Fonts import as fallback - Puppeteer can fetch these
  return `@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=Space+Grotesk:wght@400;500&display=swap');`;
}

// Inline images: replace /uploads/xxx with base64 data URIs
async function inlineImages(html) {
  const regex = /(?:src=["']|url\(["']?)(\/uploads\/[^"'\s)]+)/g;
  const matches = [...html.matchAll(regex)];
  let result = html;
  for (const match of matches) {
    const imgPath = match[1];
    try {
      const fullPath = path.join(UPLOADS_DIR, imgPath);
      const buffer = await readFile(fullPath);
      const ext = path.extname(imgPath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/webp';
      const base64 = buffer.toString('base64');
      result = result.replaceAll(imgPath, `data:${mime};base64,${base64}`);
    } catch {
      // keep original
    }
  }
  return result;
}

function wrapHtml(slideHtml, width, height) {
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: ${width}px; height: ${height}px; overflow: hidden; }
</style>
</head><body>${slideHtml}</body></html>`;
}

async function main() {
  // Read carousels data
  const data = JSON.parse(await readFile(CAROUSELS_FILE, 'utf8'));

  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 60000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  for (const carousel of data.carousels) {
    const targetDir = TARGETS[carousel.id];
    if (!targetDir) continue;

    const outDir = path.join(OUTPUT_BASE, targetDir);
    await mkdir(outDir, { recursive: true });

    const width = 1080;
    const height = 1080; // 1:1

    console.log(`\nExporting: ${carousel.name} → ${targetDir}/`);
    console.log(`  ${carousel.slides.length} slides at ${width}x${height}`);

    for (let i = 0; i < carousel.slides.length; i++) {
      const slide = carousel.slides[i];
      const inlined = await inlineImages(slide.html);
      const fullHtml = wrapHtml(inlined, width, height);

      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 30000 });

      // Wait for fonts
      await page.waitForFunction(
        () => document.fonts.ready.then(() => [...document.fonts].every(f => f.status === 'loaded')),
        { timeout: 10000 }
      ).catch(() => {});

      const outFile = path.join(outDir, `final_carousel_0${i + 1}.png`);
      await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width, height },
        path: outFile,
      });

      await page.close();
      console.log(`  Slide ${i + 1}/${carousel.slides.length} → ${path.basename(outFile)}`);
    }
  }

  await browser.close();
  console.log('\nDone!');
}

main().catch(err => { console.error(err); process.exit(1); });
