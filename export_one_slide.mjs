/**
 * Export selectivo de UN slide de UN carrusel de Open Carrusel.
 * Uso: node export_one_slide.mjs <carouselId> <slideNum1based> <outFile>
 */
import puppeteer from 'puppeteer';
import { readFile } from 'fs/promises';
import path from 'path';

const CAROUSELS_FILE = 'D:/open-carrusel/data/carousels.json';
const UPLOADS_DIR = 'D:/open-carrusel/public';

async function inlineImages(html) {
  const regex = /(?:src=["']|url\(["']?)(\/uploads\/[^"'\s)]+)/g;
  let result = html;
  for (const match of [...html.matchAll(regex)]) {
    try {
      const buffer = await readFile(path.join(UPLOADS_DIR, match[1]));
      const ext = path.extname(match[1]).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
      result = result.replaceAll(match[1], `data:${mime};base64,${buffer.toString('base64')}`);
    } catch {}
  }
  return result;
}

const [carouselId, slideNum, outFile] = process.argv.slice(2);
const data = JSON.parse(await readFile(CAROUSELS_FILE, 'utf8'));
const carousel = data.carousels.find(c => c.id === carouselId);
if (!carousel) { console.error('carousel no encontrado'); process.exit(1); }
const slide = carousel.slides[Number(slideNum) - 1];
if (!slide) { console.error('slide fuera de rango'); process.exit(1); }

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{width:1080px;height:1080px;overflow:hidden}</style></head><body>${await inlineImages(slide.html)}</body></html>`;

const browser = await puppeteer.launch({ headless: true, protocolTimeout: 60000, args: ['--no-sandbox','--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
await page.waitForFunction(() => document.fonts.ready.then(() => [...document.fonts].every(f => f.status === 'loaded')), { timeout: 10000 }).catch(() => {});
await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1080 }, path: outFile });
await browser.close();
console.log('OK', outFile);
