/**
 * Shared selective exporter for W32 (pattern of apply_c01.mjs).
 *
 * Exports the slides of ONE carousel to final_carousel_NN.png (padStart 2) inside
 * its production directory, and aborts if anything else moved:
 *   - the target carousel must be the id recorded by build_w32_carousels.mjs
 *   - a sha256 of every OTHER carousel in data/carousels.json must be identical
 *     before and after the run
 *   - the PNGs of the other W32 carousel directories must keep their mtime+size
 *   - stale final_carousel_*.png above the slide count are reported (never silently
 *     left behind for the publisher to pick up)
 *
 * Never run export_direct.mjs for W32: it re-exports every hardcoded carousel and
 * numbers 10+ slides as final_carousel_010.png.
 */
import puppeteer from 'puppeteer';
import { readFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import { createHash } from 'crypto';
import path from 'path';

const CAROUSELS_FILE = 'D:/open-carrusel/data/carousels.json';
const UPLOADS_DIR = 'D:/open-carrusel/public';
const PROD_BASE = 'D:/GAKA_RRSS/clients/gaka_studio/productions/2026-W32';
const IDS_FILE = 'C:/Users/alexz/AppData/Local/Temp/claude/D--GAKA-RRSS/b4aac251-36a8-4d1a-b2dd-35ea67d76d76/scratchpad/w32_ids.json';
const ALL_DIRS = ['carousel_ig_01', 'carousel_ig_02', 'carousel_ig_03'];

function hashOthers(data, targetId) {
  const others = data.carousels.filter((c) => c.id !== targetId);
  return createHash('sha256').update(JSON.stringify(others)).digest('hex');
}

async function pngFingerprint(dirs) {
  const out = {};
  for (const d of dirs) {
    const full = path.join(PROD_BASE, d);
    let files = [];
    try { files = await readdir(full); } catch { continue; }
    for (const f of files.filter((x) => /^final_carousel_\d+\.png$/.test(x))) {
      const st = await stat(path.join(full, f));
      out[`${d}/${f}`] = `${st.size}:${st.mtimeMs}`;
    }
  }
  return out;
}

async function inlineImages(html) {
  const regex = /(?:src=["']|url\(["']?)(\/uploads\/[^"'\s)]+)/g;
  let result = html;
  for (const match of [...html.matchAll(regex)]) {
    const imgPath = match[1];
    try {
      const buffer = await readFile(path.join(UPLOADS_DIR, imgPath));
      const ext = path.extname(imgPath).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/webp';
      result = result.replaceAll(imgPath, `data:${mime};base64,${buffer.toString('base64')}`);
    } catch { /* keep original */ }
  }
  return result;
}

function wrapHtml(slideHtml, width, height) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{width:${width}px;height:${height}px;overflow:hidden}</style></head><body>${slideHtml}</body></html>`;
}

export async function exportOne(which) {
  if (!['1', '2', '3'].includes(String(which))) throw new Error('which debe ser 1, 2 o 3');
  const dir = `carousel_ig_0${which}`;
  const others = ALL_DIRS.filter((d) => d !== dir);

  const ids = JSON.parse(await readFile(IDS_FILE, 'utf8'));
  const targetId = ids[`c${which}`];
  if (!targetId) throw new Error(`no hay id registrado para c${which}`);

  const data = JSON.parse(await readFile(CAROUSELS_FILE, 'utf8'));
  const carousel = data.carousels.find((c) => c.id === targetId);
  if (!carousel) throw new Error(`carrusel ${targetId} no está en carousels.json`);
  if (carousel.aspectRatio !== '1:1') throw new Error(`aspect inesperado: ${carousel.aspectRatio}`);
  if (carousel.slides.length > 10) throw new Error(`${carousel.slides.length} slides — Instagram rechaza >10`);

  const guardBefore = hashOthers(data, targetId);
  const pngBefore = await pngFingerprint(others);

  const width = 1080, height = 1080;
  const outDir = path.join(PROD_BASE, dir);
  await mkdir(outDir, { recursive: true });

  console.log(`\nExport SELECTIVO -> ${dir}`);
  console.log(`  ${carousel.name}`);
  console.log(`  ${carousel.slides.length} slides a ${width}x${height}`);

  const browser = await puppeteer.launch({
    headless: true, protocolTimeout: 60000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const written = [];
  for (let i = 0; i < carousel.slides.length; i++) {
    const inlined = await inlineImages(carousel.slides[i].html);
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(wrapHtml(inlined, width, height), { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForFunction(
      () => document.fonts.ready.then(() => [...document.fonts].every((f) => f.status === 'loaded')),
      { timeout: 10000 }
    ).catch(() => {});
    const outFile = path.join(outDir, `final_carousel_${String(i + 1).padStart(2, '0')}.png`);
    await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height }, path: outFile });
    await page.close();
    written.push(path.basename(outFile));
    console.log(`  ${i + 1}/${carousel.slides.length} -> ${path.basename(outFile)}`);
  }
  await browser.close();

  // ---- guards ----
  const dataAfter = JSON.parse(await readFile(CAROUSELS_FILE, 'utf8'));
  const guardAfter = hashOthers(dataAfter, targetId);
  if (guardAfter !== guardBefore) throw new Error('ABORT: otros carruseles de carousels.json cambiaron durante el export');

  const pngAfter = await pngFingerprint(others);
  const touched = Object.keys({ ...pngBefore, ...pngAfter }).filter((k) => pngBefore[k] !== pngAfter[k]);
  if (touched.length) throw new Error(`ABORT: PNGs de otros carruseles tocados: ${touched.join(', ')}`);

  const present = (await readdir(outDir)).filter((f) => /^final_carousel_\d+\.png$/.test(f)).sort();
  const stale = present.filter((f) => !written.includes(f));
  if (stale.length) {
    for (const f of stale) await unlink(path.join(outDir, f));
    console.log(`  Borrados PNG sobrantes de una versión anterior: ${stale.join(', ')}`);
  }

  console.log(`  Guardas OK — ${others.join(', ')} intactos. ${written.length} PNG en ${dir}.`);
  return written;
}
