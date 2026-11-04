/**
 * Fixes the "gap pre-punchline" quality rule (>=62px, per Obsidian Stack de diseño de slides)
 * for the 3 W30 carousels. The base QA (qa_w30.mjs) only gates overflow/baseline/margins/tildes;
 * this pass targets slides that passed those but had gap<62.
 *
 * 1. Bumps the static .punch / .cta margin-top (renderStat / renderCierre: was 56px, a systemic
 *    W29-lib value that always undershoots the 62px rule) to 66px on the flagged slides.
 * 2. For renderSerie slides with small gap (auto margin absorbed by tall specs/body content),
 *    compresses the content above the punchline (specs/body font+padding) iteratively, up to
 *    3 rounds, re-measuring with Puppeteer each time.
 *
 * Run from D:\open-carrusel: node gapfix_w30.mjs
 */
import puppeteer from 'puppeteer';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const CAROUSELS_FILE = 'D:/open-carrusel/data/carousels.json';
const UPLOADS_DIR = 'D:/open-carrusel/public';
const IDS_FILE = 'C:/Users/alexz/AppData/Local/Temp/claude/D--GAKA-RRSS/05d28887-bd0b-45a2-afe2-d036aeaf666a/scratchpad/w30_ids.json';

const MAX_ITER = 3;
const MIN_GAP = 62;

function adjustBlock(css, selector, transform) {
  const re = new RegExp(`(\\.${selector}\\{)([^}]*)(\\})`, 'g');
  return css.replace(re, (m, pre, body, post) => pre + transform(body) + post);
}
function numProp(body, prop, delta, min) {
  const re = new RegExp(`(${prop}:)(-?\\d+)(px)`, 'g');
  return body.replace(re, (m, p1, num, p3) => {
    const v = Math.max(parseInt(num, 10) + delta, min);
    return `${p1}${v}${p3}`;
  });
}

// Step A: static bump for renderStat/renderCierre punch/cta (56 -> 66)
function bumpStaticGap(html) {
  let css = html;
  css = adjustBlock(css, 'punch', (b) => numProp(b, 'margin-top', 10, 0));
  css = adjustBlock(css, 'cta', (b) => numProp(b, 'margin-top', 10, 0));
  return css;
}

// Step B: compress content above the punchline in serie slides to free up gap
function compressAboveGap(html) {
  let css = html;
  css = adjustBlock(css, 'headline', (b) => numProp(b, 'margin-top', -6, 8));
  css = adjustBlock(css, 'rule', (b) => numProp(b, 'margin-top', -4, 8));
  css = adjustBlock(css, 'body', (b) => {
    let x = numProp(b, 'margin-top', -4, 6);
    x = numProp(x, 'font-size', -1, 24);
    return x;
  });
  css = adjustBlock(css, 'specs', (b) => numProp(b, 'margin-top', -4, 6));
  css = adjustBlock(css, 'specs-core', (b) => b.replace(/(padding:)(\d+)px (\d+)px/, (m, p1, a, bb) => `${p1}${Math.max(parseInt(a,10)-3,6)}px ${bb}px`));
  css = adjustBlock(css, 'spec', (b) => b.replace(/(padding:)(\d+)px 0/, (m, p1, a) => `${p1}${Math.max(parseInt(a,10)-2,4)}px 0`));
  css = adjustBlock(css, 'spec-text', (b) => numProp(b, 'font-size', -1, 20));
  css = adjustBlock(css, 'serie-ico', (b) => numProp(b, 'margin-top', -6, 8));
  return css;
}

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
      result = result.replaceAll(imgPath, `data:${mime};base64,${buffer.toString('base64')}`);
    } catch {}
  }
  return result;
}
function wrapHtml(slideHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{width:1080px;height:1080px;overflow:hidden}</style></head><body>${slideHtml}</body></html>`;
}

async function measure(browser, html) {
  const inlined = await inlineImages(html);
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
  await page.setContent(wrapHtml(inlined), { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(
    () => document.fonts.ready.then(() => [...document.fonts].every(f => f.status === 'loaded')),
    { timeout: 10000 }
  ).catch(() => {});
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
      if (r.left < 79.5 || r.right > 1000.5) marginViolations.push({ cls: el.className });
    }
    const punchEl = document.querySelector('.punch') || document.querySelector('.cta');
    let gapPrePunch = null;
    if (punchEl) {
      const pr = punchEl.getBoundingClientRect();
      let prevBottom = 0;
      for (const el of all) {
        if (el === punchEl) continue;
        const r = el.getBoundingClientRect();
        if (r.bottom <= pr.top + 0.5 && r.bottom > prevBottom) prevBottom = r.bottom;
      }
      gapPrePunch = Math.round(pr.top - prevBottom);
    }
    return { scrollHeight: slide.scrollHeight, scrollWidth: slide.scrollWidth, maxBottom, marginViolations, gapPrePunch };
  });
  await page.close();
  return {
    overflowPass: result.scrollHeight <= 1080 && result.scrollWidth <= 1080,
    baselinePass: result.maxBottom <= 900.5,
    marginsPass: result.marginViolations.length === 0,
    maxBottom: Math.round(result.maxBottom),
    gapPrePunch: result.gapPrePunch,
  };
}

async function main() {
  const ids = JSON.parse(await readFile(IDS_FILE, 'utf8'));
  const TARGETS = { [ids.c1]: 'carousel_ig_01', [ids.c2]: 'carousel_ig_02', [ids.c3]: 'carousel_ig_03' };
  const data = JSON.parse(await readFile(CAROUSELS_FILE, 'utf8'));
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 60000, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });

  let anyChanged = false;
  const report = [];

  for (const carousel of data.carousels) {
    const dir = TARGETS[carousel.id];
    if (!dir) continue;
    console.log(`\n=== ${dir} ===`);
    for (let i = 0; i < carousel.slides.length; i++) {
      let html = carousel.slides[i].html;
      let res = await measure(browser, html);
      if (res.gapPrePunch == null || res.gapPrePunch >= MIN_GAP) {
        console.log(`  Slide ${String(i+1).padStart(2,'0')}: gap=${res.gapPrePunch}px already OK, skip`);
        continue;
      }
      let iter = 0;
      let changed = false;

      // Step A: static punch/cta margin-top bump (no-op if the element uses margin-top:auto,
      // since the regex only matches numeric px values — safe to try unconditionally).
      const bumped = bumpStaticGap(html);
      if (bumped !== html) {
        const bumpedRes = await measure(browser, bumped);
        if (bumpedRes.overflowPass && bumpedRes.baselinePass && bumpedRes.marginsPass) {
          html = bumped; res = bumpedRes; changed = true;
          console.log(`  Slide ${String(i+1).padStart(2,'0')}: static bump -> gap=${res.gapPrePunch}px baseline=${res.maxBottom}`);
        }
      }

      // Step B: iterative compression for serie slides (auto-margin punch)
      while (res.gapPrePunch < MIN_GAP && iter < MAX_ITER) {
        iter++;
        const compressed = compressAboveGap(html);
        const compRes = await measure(browser, compressed);
        if (compRes.overflowPass && compRes.baselinePass && compRes.marginsPass) {
          html = compressed; res = compRes; changed = true;
        } else {
          break; // don't keep a change that breaks another check
        }
      }

      if (changed) {
        carousel.slides[i].html = html;
        anyChanged = true;
      }
      const status = res.gapPrePunch >= MIN_GAP ? 'FIXED' : (res.gapPrePunch == null ? 'N/A' : '** STILL <62 **');
      console.log(`  Slide ${String(i+1).padStart(2,'0')}: gap=${res.gapPrePunch}px baseline=${res.maxBottom} iter=${iter} ${status}`);
      report.push({ dir, slide: i + 1, gap: res.gapPrePunch, baseline: res.maxBottom, status });
    }
  }

  await browser.close();
  if (anyChanged) {
    await writeFile(CAROUSELS_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log('\ncarousels.json updated with gap fixes.');
  } else {
    console.log('\nNo gap fixes applied.');
  }
  await writeFile(
    'C:/Users/alexz/AppData/Local/Temp/claude/D--GAKA-RRSS/05d28887-bd0b-45a2-afe2-d036aeaf666a/scratchpad/gapfix_report_w30.json',
    JSON.stringify(report, null, 2)
  );
  const stillFailing = report.filter(r => r.status.includes('STILL'));
  console.log(stillFailing.length ? `\n*** ${stillFailing.length} slides still <62px gap ***` : '\nAll gaps >=62px (or N/A).');
}

main().catch((err) => { console.error(err); process.exit(1); });
