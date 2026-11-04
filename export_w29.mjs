/**
 * Direct Puppeteer export of Open Carrusel W29 slides to PNG.
 * Clone of export_direct.mjs mechanics, targeting the 3 W29 tutorial carousels.
 * Run from the open-carrusel directory: node export_w29.mjs
 */
import puppeteer from 'puppeteer';
import { readFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CAROUSELS_FILE = 'D:/open-carrusel/data/carousels.json';
const UPLOADS_DIR = 'D:/open-carrusel/public';
const OUTPUT_BASE = 'D:/GAKA_RRSS/clients/gaka_studio/productions/2026-W29';

const TARGETS = {
  '47e489ca-6171-44ab-92ef-c3710756d2ca': 'carousel_ig_01', // C04 — Claude 5 funciones (11 slides)
  '432a9d10-b1a9-4508-9aa6-668e5c65cc3c': 'carousel_ig_02', // C05 — ChatGPT Work (10 slides)
  'ce3afe1b-6dfd-444e-b48d-28fcd8919a67': 'carousel_ig_03', // C06 — Nano Banana trucos (10 slides)
};

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

    console.log(`\nExporting: ${carousel.name} -> ${targetDir}/`);
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

      const outFile = path.join(outDir, `final_carousel_${String(i + 1).padStart(2, '0')}.png`);
      await page.screenshot({
        type: 'png',
        clip: { x: 0, y: 0, width, height },
        path: outFile,
      });

      await page.close();
      console.log(`  Slide ${i + 1}/${carousel.slides.length} -> ${path.basename(outFile)}`);
    }
  }

  await browser.close();
  console.log('\nDone!');
}

main().catch(err => { console.error(err); process.exit(1); });
