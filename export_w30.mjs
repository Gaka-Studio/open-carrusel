/**
 * Selective Puppeteer export of Open Carrusel W30 slides to PNG.
 * Clone of export_w29.mjs, targeting the 3 W30 carousels only.
 * Run from D:\open-carrusel: node <path>\export_w30.mjs
 */
import puppeteer from 'puppeteer';
import { readFile, mkdir } from 'fs/promises';
import path from 'path';

const CAROUSELS_FILE = 'D:/open-carrusel/data/carousels.json';
const UPLOADS_DIR = 'D:/open-carrusel/public';
const OUTPUT_BASE = 'D:/GAKA_RRSS/clients/gaka_studio/productions/2026-W30';
const IDS_FILE = 'C:/Users/alexz/AppData/Local/Temp/claude/D--GAKA-RRSS/05d28887-bd0b-45a2-afe2-d036aeaf666a/scratchpad/w30_ids.json';

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
  const ids = JSON.parse(await readFile(IDS_FILE, 'utf8'));
  const TARGETS = {
    [ids.c1]: 'carousel_ig_01',
    [ids.c2]: 'carousel_ig_02',
    [ids.c3]: 'carousel_ig_03',
  };

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
    const height = 1080; // 1:1, matches W29 system

    console.log(`\nExporting: ${carousel.name} -> ${targetDir}/`);
    console.log(`  ${carousel.slides.length} slides at ${width}x${height}`);

    for (let i = 0; i < carousel.slides.length; i++) {
      const slide = carousel.slides[i];
      const inlined = await inlineImages(slide.html);
      const fullHtml = wrapHtml(inlined, width, height);

      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: 1 });
      await page.setContent(fullHtml, { waitUntil: 'networkidle0', timeout: 30000 });

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
