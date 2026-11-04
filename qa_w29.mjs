/**
 * Numeric QA for the 3 W29 tutorial carousels (C04, C05, C06).
 * Checks per slide: overflow, baseline (<=900px), margins (>=80px / <=1000px), tildes.
 * On FAIL, applies a minimal automatic shrink (font-size / margin-top) to the slide's
 * HTML and re-measures, up to 3 iterations per slide. Writes fixed HTML back into
 * data/carousels.json when changes were made.
 *
 * Run from the open-carrusel directory: node qa_w29.mjs
 */
import puppeteer from 'puppeteer';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const CAROUSELS_FILE = 'D:/open-carrusel/data/carousels.json';
const UPLOADS_DIR = 'D:/open-carrusel/public';
const PROD_BASE = 'D:/GAKA_RRSS/clients/gaka_studio/productions/2026-W29';

const TARGETS = {
  '47e489ca-6171-44ab-92ef-c3710756d2ca': 'carousel_ig_01', // C04
  '432a9d10-b1a9-4508-9aa6-668e5c65cc3c': 'carousel_ig_02', // C05
  'ce3afe1b-6dfd-444e-b48d-28fcd8919a67': 'carousel_ig_03', // C06
};

const MAX_ITER = 3;

// ---------- HTML shrink helpers ----------

function adjustBlock(css, selector, transform) {
  const re = new RegExp(`(\\.${selector}\\{)([^}]*)(\\})`, 'g');
  return css.replace(re, (m, pre, body, post) => pre + transform(body) + post);
}

function shrinkNumProp(body, prop, delta, min) {
  const re = new RegExp(`(${prop}:)(-?\\d+)(px)`, 'g');
  return body.replace(re, (m, p1, num, p3) => {
    const orig = parseInt(num, 10);
    let v = orig + delta;
    if (orig >= 0) v = Math.max(v, min);
    return `${p1}${v}${p3}`;
  });
}

const FONT_TARGETS = [
  ['headline', 'font-size', -4, 46],
  ['body', 'font-size', -2, 22],
  ['punch', 'font-size', -2, 28],
  ['stat-note', 'font-size', -2, 22],
  ['qa-q', 'font-size', -1, 22],
  ['qa-a', 'font-size', -1, 22],
  ['sub', 'font-size', -2, 26],
  ['spec-text', 'font-size', -1, 20],
];

const MARGIN_TARGETS = [
  'headline', 'rule', 'body', 'punch', 'sub', 'stat-note', 'qa',
  'iconrow', 'flow', 'specs', 'serie-ico', 'stat-row', 'swipe', 'cta', 'handle',
];

function shrinkStep(html) {
  let css = html;
  for (const [sel, prop, delta, min] of FONT_TARGETS) {
    css = adjustBlock(css, sel, (body) => shrinkNumProp(body, prop, delta, min));
  }
  for (const sel of MARGIN_TARGETS) {
    css = adjustBlock(css, sel, (body) => shrinkNumProp(body, 'margin-top', -6, 0));
  }
  return css;
}

function widenStep(html) {
  // fallback fix for margin (left/right) violations: shrink iconrow item widths / flow gaps
  let css = html;
  css = adjustBlock(css, 'iconrow-item', (body) => shrinkNumProp(body, 'width', -14, 110));
  css = adjustBlock(css, 'flow', (body) => shrinkNumProp(body, 'gap', -4, 8));
  css = adjustBlock(css, 'step-core', (body) => {
    let b = shrinkNumProp(body, 'font-size', -2, 22);
    b = b.replace(/(padding:)(\d+)px (\d+)px/, (m, p1, a, bb) => `${p1}${Math.max(parseInt(a,10)-4,10)}px ${Math.max(parseInt(bb,10)-6,14)}px`);
    return b;
  });
  return css;
}

// ---------- tilde word extraction ----------

function accentWords(strings) {
  const words = new Set();
  const re = /[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}/g;
  for (const s of strings) {
    if (!s) continue;
    const matches = String(s).match(re) || [];
    for (const w of matches) {
      if (/[áéíóúñÁÉÍÓÚÑ]/.test(w)) words.add(w);
    }
  }
  return [...words].slice(0, 3);
}

function collectSlideStrings(s) {
  const out = [];
  for (const k of ['pill', 'headline', 'body', 'punch', 'sub', 'hero', 'stat_note', 'qa_q', 'qa_a', 'cta', 'handle', 'ghost']) {
    if (s[k]) out.push(s[k]);
  }
  if (Array.isArray(s.specs)) out.push(...s.specs);
  if (Array.isArray(s.flow)) out.push(...s.flow);
  if (Array.isArray(s.recap_items)) out.push(...s.recap_items);
  if (Array.isArray(s.iconos)) out.push(...s.iconos);
  return out;
}

// ---------- puppeteer measurement ----------

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
    } catch {}
  }
  return result;
}

function wrapHtml(slideHtml) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{width:1080px;height:1080px;overflow:hidden}</style></head><body>${slideHtml}</body></html>`;
}

async function measure(browser, html, tildeWords) {
  const inlined = await inlineImages(html);
  const full = wrapHtml(inlined);
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
  await page.setContent(full, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(
    () => document.fonts.ready.then(() => [...document.fonts].every(f => f.status === 'loaded')),
    { timeout: 10000 }
  ).catch(() => {});

  const result = await page.evaluate(() => {
    const slide = document.querySelector('.slide');
    const scrollHeight = slide.scrollHeight;
    const scrollWidth = slide.scrollWidth;

    const all = [...document.querySelectorAll('.slide *')].filter((el) => {
      if (el.classList && (el.classList.contains('logo') || el.classList.contains('ghost'))) return false;
      if (el.tagName === 'STYLE') return false;
      if (el.namespaceURI === 'http://www.w3.org/2000/svg' && !el.classList.contains('ico')) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      return true;
    });

    let maxBottom = 0;
    let marginViolations = [];
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.bottom > maxBottom) maxBottom = r.bottom;
      if (r.left < 79.5 || r.right > 1000.5) {
        marginViolations.push({ cls: el.className, left: Math.round(r.left), right: Math.round(r.right) });
      }
    }

    return {
      scrollHeight, scrollWidth, maxBottom,
      marginViolations,
      innerText: document.body.innerText,
    };
  });

  await page.close();

  const overflowPass = result.scrollHeight <= 1080 && result.scrollWidth <= 1080;
  const baselinePass = result.maxBottom <= 900.5;
  const marginsPass = result.marginViolations.length === 0;
  const lowerText = result.innerText.toLowerCase();
  const tildeMisses = tildeWords.filter((w) => !lowerText.includes(w.toLowerCase()));
  const tildesPass = tildeMisses.length === 0;

  return {
    overflowPass, baselinePass, marginsPass, tildesPass,
    scrollHeight: result.scrollHeight, scrollWidth: result.scrollWidth,
    maxBottom: Math.round(result.maxBottom),
    marginViolations: result.marginViolations,
    tildeMisses, tildeWords,
  };
}

// ---------- main ----------

async function main() {
  const data = JSON.parse(await readFile(CAROUSELS_FILE, 'utf8'));
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 60000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  let anyChanged = false;
  const report = [];

  for (const carousel of data.carousels) {
    const dir = TARGETS[carousel.id];
    if (!dir) continue;
    const copy = JSON.parse(await readFile(`${PROD_BASE}/${dir}/copy.json`, 'utf8'));

    console.log(`\n=== ${carousel.name} (${dir}) ===`);
    const carouselReport = { name: carousel.name, dir, slides: [] };

    for (let i = 0; i < carousel.slides.length; i++) {
      const slideMeta = copy.slides[i];
      const tildeWords = accentWords(collectSlideStrings(slideMeta));
      let html = carousel.slides[i].html;
      let iter = 0;
      let res = await measure(browser, html, tildeWords);
      let changed = false;

      while (!(res.overflowPass && res.baselinePass && res.marginsPass && res.tildesPass) && iter < MAX_ITER) {
        iter++;
        if (!res.marginsPass) html = widenStep(html);
        if (!res.overflowPass || !res.baselinePass) html = shrinkStep(html);
        changed = true;
        res = await measure(browser, html, tildeWords);
      }

      if (changed) {
        carousel.slides[i].html = html;
        anyChanged = true;
      }

      const allPass = res.overflowPass && res.baselinePass && res.marginsPass && res.tildesPass;
      const line = `  Slide ${String(i + 1).padStart(2, '0')}/${carousel.slides.length} [${slideMeta.tipo.padEnd(9)}] ` +
        `overflow=${res.overflowPass ? 'PASS' : 'FAIL'} baseline=${res.baselinePass ? 'PASS' : 'FAIL'}(${res.maxBottom}) ` +
        `margins=${res.marginsPass ? 'PASS' : 'FAIL'} tildes=${res.tildesPass ? 'PASS' : 'FAIL'} iter=${iter} ` +
        `${allPass ? 'OK' : '** STILL FAILING **'}`;
      console.log(line);
      if (!res.marginsPass) console.log('    margin violations:', JSON.stringify(res.marginViolations));
      if (!res.tildesPass) console.log('    tilde misses:', res.tildeMisses, 'checked:', tildeWords);

      carouselReport.slides.push({
        n: i + 1, tipo: slideMeta.tipo, iter, allPass,
        overflow: res.overflowPass, baseline: res.baselinePass, margins: res.marginsPass, tildes: res.tildesPass,
        maxBottom: res.maxBottom, scrollHeight: res.scrollHeight, scrollWidth: res.scrollWidth,
        marginViolations: res.marginViolations, tildeWords, tildeMisses: res.tildeMisses,
      });
    }
    report.push(carouselReport);
  }

  await browser.close();

  if (anyChanged) {
    await writeFile(CAROUSELS_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log('\ncarousels.json updated with fixes.');
  } else {
    console.log('\nNo fixes needed — carousels.json unchanged.');
  }

  await writeFile(
    'C:/Users/alexz/AppData/Local/Temp/claude/D--GAKA-RRSS/1cb1af25-9daf-49c3-b876-03cd110d7032/scratchpad/qa_report_w29.json',
    JSON.stringify(report, null, 2)
  );
  console.log('\nQA report saved.');

  const stillFailing = report.flatMap(c => c.slides.filter(s => !s.allPass).map(s => `${c.name} slide ${s.n}`));
  if (stillFailing.length) {
    console.log('\n*** SLIDES STILL FAILING AFTER', MAX_ITER, 'ITERATIONS ***');
    stillFailing.forEach(s => console.log(' -', s));
  } else {
    console.log('\nAll slides PASS.');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
