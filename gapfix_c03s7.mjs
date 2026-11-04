import puppeteer from 'puppeteer';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const CAROUSELS_FILE = 'D:/open-carrusel/data/carousels.json';
const UPLOADS_DIR = 'D:/open-carrusel/public';
const IDS_FILE = 'C:/Users/alexz/AppData/Local/Temp/claude/D--GAKA-RRSS/05d28887-bd0b-45a2-afe2-d036aeaf666a/scratchpad/w30_ids.json';

function adjustBlock(css, selector, transform) {
  const re = new RegExp(`(\\.${selector}\\{)([^}]*)(\\})`, 'g');
  return css.replace(re, (m, pre, body, post) => pre + transform(body) + post);
}
function numProp(body, prop, delta, min) {
  const re = new RegExp(`(${prop}:)(-?\\d+)(px)`, 'g');
  return body.replace(re, (m, p1, num, p3) => `${p1}${Math.max(parseInt(num, 10) + delta, min)}${p3}`);
}

async function inlineImages(html) {
  const regex = /(?:src=["']|url\(["']?)(\/uploads\/[^"'\s)]+)/g;
  let result = html;
  for (const match of [...html.matchAll(regex)]) {
    try {
      const buffer = await readFile(path.join(UPLOADS_DIR, match[1]));
      const ext = path.extname(match[1]).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/webp';
      result = result.replaceAll(match[1], `data:${mime};base64,${buffer.toString('base64')}`);
    } catch {}
  }
  return result;
}
function wrapHtml(h) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{width:1080px;height:1080px;overflow:hidden}</style></head><body>${h}</body></html>`;
}
async function measure(browser, html) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
  await page.setContent(wrapHtml(await inlineImages(html)), { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => document.fonts.ready.then(() => [...document.fonts].every(f => f.status === 'loaded')), { timeout: 10000 }).catch(() => {});
  const result = await page.evaluate(() => {
    const slide = document.querySelector('.slide');
    const all = [...document.querySelectorAll('.slide *')].filter((el) => {
      if (el.classList && (el.classList.contains('logo') || el.classList.contains('ghost'))) return false;
      if (el.tagName === 'STYLE') return false;
      if (el.namespaceURI === 'http://www.w3.org/2000/svg' && !el.classList.contains('ico')) return false;
      const r = el.getBoundingClientRect();
      return !(r.width === 0 && r.height === 0);
    });
    let maxBottom = 0, marginViolations = [];
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.bottom > maxBottom) maxBottom = r.bottom;
      if (r.left < 79.5 || r.right > 1000.5) marginViolations.push(el.className);
    }
    const punchEl = document.querySelector('.punch');
    const pr = punchEl.getBoundingClientRect();
    let prevBottom = 0;
    for (const el of all) {
      if (el === punchEl) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom <= pr.top + 0.5 && r.bottom > prevBottom) prevBottom = r.bottom;
    }
    return { scrollHeight: slide.scrollHeight, scrollWidth: slide.scrollWidth, maxBottom, marginViolations, gap: Math.round(pr.top - prevBottom) };
  });
  await page.close();
  return { overflowPass: result.scrollHeight <= 1080 && result.scrollWidth <= 1080, baselinePass: result.maxBottom <= 900.5, marginsPass: result.marginViolations.length === 0, maxBottom: Math.round(result.maxBottom), gap: result.gap };
}

async function main() {
  const ids = JSON.parse(await readFile(IDS_FILE, 'utf8'));
  const data = JSON.parse(await readFile(CAROUSELS_FILE, 'utf8'));
  const carousel = data.carousels.find(c => c.id === ids.c3);
  const slide = carousel.slides[6]; // slide 07 (0-indexed 6)

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
  let html = slide.html;
  let res = await measure(browser, html);
  console.log('before:', res);

  let css = html;
  css = adjustBlock(css, 'punch', (b) => numProp(b, 'margin-top', 6, 0));
  css = adjustBlock(css, 'stat-note', (b) => numProp(b, 'font-size', -2, 22));
  css = adjustBlock(css, 'qa-a', (b) => numProp(b, 'font-size', -2, 22));
  css = adjustBlock(css, 'qa', (b) => numProp(b, 'margin-top', -4, 8));

  const res2 = await measure(browser, css);
  console.log('after:', res2);

  if (res2.overflowPass && res2.baselinePass && res2.marginsPass && res2.gap >= 62) {
    slide.html = css;
    await writeFile(CAROUSELS_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log('APPLIED — carousels.json updated.');
  } else {
    console.log('NOT applied (would still fail or not improve enough). Kept previous html.');
  }
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
