/**
 * Numeric QA for the W32 carousels (v4-serie). ONE carousel per run.
 *
 *   node qa_w32.mjs 1|2|3
 *
 * Per slide it measures, in Chromium via Puppeteer:
 *   - overflow X/Y      : slide scrollWidth/scrollHeight <= 1080
 *   - baseline          : bottom of the lowest content element <= 900px
 *   - margins           : every content box inside x in [80, 1000]
 *   - gap pre-punchline : >= 62px between the block above and .punch/.cta
 *   - tildes            : every accented word of the source (copy.json + slide HTML)
 *                         is present in the rendered innerText, and no ASCII-folded
 *                         twin of an accented word leaks in
 *   - pagination        : rendered "NN / TT" matches the slide index and total
 *   - logo              : img.logo present, loaded, ~183px wide, inside the canvas
 *
 * Fix loop: up to 3 shrink/widen iterations for the hard failures, then up to 4
 * compression iterations purely for the gap rule (never breaking a hard check).
 * Fixed HTML is written back into data/carousels.json, and the report is written
 * to <production dir>/qa_report.json.
 */
import puppeteer from 'puppeteer';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

const CAROUSELS_FILE = 'D:/open-carrusel/data/carousels.json';
const UPLOADS_DIR = 'D:/open-carrusel/public';
const PROD_BASE = 'D:/GAKA_RRSS/clients/gaka_studio/productions/2026-W32';
const IDS_FILE = 'C:/Users/alexz/AppData/Local/Temp/claude/D--GAKA-RRSS/b4aac251-36a8-4d1a-b2dd-35ea67d76d76/scratchpad/w32_ids.json';

const MAX_ITER = 3;
const MAX_GAP_ITER = 4;
const MIN_GAP = 62;

// ---------- HTML shrink helpers ----------

function adjustBlock(css, selector, transform) {
  const re = new RegExp(`(\\.${selector}\\{)([^}]*)(\\})`, 'g');
  return css.replace(re, (m, pre, body, post) => pre + transform(body) + post);
}

function numProp(body, prop, delta, min) {
  const re = new RegExp(`(${prop}:)(-?\\d+)(px)`, 'g');
  return body.replace(re, (m, p1, num, p3) => {
    const orig = parseInt(num, 10);
    let v = orig + delta;
    if (orig >= 0) v = Math.max(v, min);
    return `${p1}${v}${p3}`;
  });
}

const FONT_TARGETS = [
  ['hero', 'font-size', -8, 70],
  ['headline', 'font-size', -4, 46],
  ['body', 'font-size', -2, 22],
  ['punch', 'font-size', -2, 28],
  ['stat-note', 'font-size', -2, 22],
  ['qa-q', 'font-size', -1, 22],
  ['qa-a', 'font-size', -1, 22],
  ['sub', 'font-size', -2, 26],
  ['spec-text', 'font-size', -1, 20],
  ['node-label', 'font-size', -1, 16],
  ['chip-label', 'font-size', -1, 18],
];

const MARGIN_TARGETS = [
  'headline', 'rule', 'body', 'punch', 'sub', 'stat-note', 'qa',
  'iconrow', 'flow', 'flowgrid', 'specs', 'serie-ico', 'stat-row', 'swipe', 'cta', 'handle', 'hero',
];

function shrinkStep(html) {
  let css = html;
  for (const [sel, prop, delta, min] of FONT_TARGETS) {
    css = adjustBlock(css, sel, (body) => numProp(body, prop, delta, min));
  }
  for (const sel of MARGIN_TARGETS) {
    css = adjustBlock(css, sel, (body) => numProp(body, 'margin-top', -6, 0));
  }
  return css;
}

function widenStep(html) {
  let css = html;
  css = adjustBlock(css, 'iconrow-item', (body) => numProp(body, 'width', -14, 110));
  css = adjustBlock(css, 'flow', (body) => numProp(body, 'gap', -4, 8));
  css = adjustBlock(css, 'node', (body) => numProp(body, 'width', -10, 100));
  css = adjustBlock(css, 'chip', (body) => numProp(body, 'width', -8, 230));
  return css;
}

// Step A for the gap rule: static bump of the punch/cta top margin (no-op on margin-top:auto)
function bumpStaticGap(html) {
  let css = html;
  css = adjustBlock(css, 'punch', (b) => numProp(b, 'margin-top', 10, 0));
  css = adjustBlock(css, 'cta', (b) => numProp(b, 'margin-top', 10, 0));
  return css;
}

// Step B for the gap rule, SOFT: only whitespace above the punchline. No font-size
// change, so a line of body/spec text never reflows away and the gap grows gently.
function compressAboveGapSoft(html) {
  let css = html;
  css = adjustBlock(css, 'headline', (b) => numProp(b, 'margin-top', -5, 8));
  css = adjustBlock(css, 'rule', (b) => numProp(b, 'margin-top', -3, 8));
  css = adjustBlock(css, 'body', (b) => numProp(b, 'margin-top', -4, 6));
  css = adjustBlock(css, 'specs', (b) => numProp(b, 'margin-top', -4, 6));
  css = adjustBlock(css, 'specs-core', (b) => b.replace(/(padding:)(\d+)px (\d+)px/, (m, p1, a, bb) => `${p1}${Math.max(parseInt(a, 10) - 2, 6)}px ${bb}px`));
  css = adjustBlock(css, 'spec', (b) => b.replace(/(padding:)(\d+)px 0/, (m, p1, a) => `${p1}${Math.max(parseInt(a, 10) - 1, 4)}px 0`));
  css = adjustBlock(css, 'serie-ico', (b) => numProp(b, 'margin-top', -5, 8));
  css = adjustBlock(css, 'flow', (b) => numProp(b, 'margin-top', -5, 8));
  css = adjustBlock(css, 'flowgrid', (b) => numProp(b, 'margin-top', -5, 8));
  css = adjustBlock(css, 'node-ico', (b) => numProp(b, 'margin-top', -3, 4));
  css = adjustBlock(css, 'node-label', (b) => numProp(b, 'margin-top', -3, 4));
  css = adjustBlock(css, 'stat-row', (b) => numProp(b, 'margin-top', -5, 8));
  css = adjustBlock(css, 'stat-note', (b) => numProp(b, 'margin-top', -4, 6));
  css = adjustBlock(css, 'qa', (b) => numProp(b, 'margin-top', -4, 6));
  css = adjustBlock(css, 'iconrow', (b) => numProp(b, 'margin-top', -5, 8));
  return css;
}

// Step C for the gap rule, HARD: also drops type sizes. Only used when the soft pass
// cannot reach 62px, because a reflowed line can overshoot the gap into a void.
function compressAboveGap(html) {
  let css = compressAboveGapSoft(html);
  css = adjustBlock(css, 'body', (b) => numProp(b, 'font-size', -1, 24));
  css = adjustBlock(css, 'spec-text', (b) => numProp(b, 'font-size', -1, 20));
  return css;
}

// ---------- tilde extraction ----------

const ACCENT_RE = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{3,}/g;

function fold(w) {
  return w
    .replace(/[áàä]/g, 'a').replace(/[éè]/g, 'e').replace(/[íì]/g, 'i')
    .replace(/[óò]/g, 'o').replace(/[úùü]/g, 'u').replace(/ñ/g, 'n')
    .replace(/[ÁÀÄ]/g, 'A').replace(/[ÉÈ]/g, 'E').replace(/[ÍÌ]/g, 'I')
    .replace(/[ÓÒ]/g, 'O').replace(/[ÚÙÜ]/g, 'U').replace(/Ñ/g, 'N');
}

// Unaccented forms that are legitimate Spanish words on their own, so their presence
// next to an accented twin is NOT a stripped tilde (que/qué, esta/está, como/cómo...).
const HOMOGRAPHS = new Set([
  'que', 'mas', 'solo', 'sola', 'este', 'esta', 'estas', 'estos', 'ese', 'esa', 'esas', 'esos',
  'como', 'donde', 'adonde', 'cuando', 'cual', 'cuales', 'quien', 'quienes',
  'cuanto', 'cuanta', 'cuantos', 'cuantas', 'aun', 'tus', 'sea', 'sino', 'porque',
  'entre', 'sobre', 'para', 'toma', 'pasa', 'saco', 'salio', 'meto', 'paso', 'marco',
  'numero', 'publico', 'practica', 'critica', 'domino', 'valido', 'limite', 'termino',
]);
// Unaccented forms that are ALWAYS an error in a Gaka slide (ano != año is the classic).
const HARD_FOLD = new Set(['ano', 'anos', 'dialogo', 'lapiz', 'cuadricula', 'bisturi', 'pequena', 'diseno', 'manana', 'espanol', 'anadir']);

function accentWordsFrom(strings) {
  const words = new Set();
  for (const s of strings) {
    if (!s) continue;
    for (const w of String(s).match(ACCENT_RE) || []) {
      if (/[áéíóúüñÁÉÍÓÚÜÑ]/.test(w)) words.add(w.toLowerCase());
    }
  }
  return words;
}

function collectSlideStrings(s) {
  const out = [];
  for (const k of ['pill', 'headline', 'body', 'punch', 'sub', 'hero', 'stat', 'stat_note', 'qa_q', 'qa_a', 'cta', 'handle', 'ghost']) {
    if (s[k]) out.push(s[k]);
  }
  for (const k of ['specs', 'flow', 'recap_items']) {
    if (Array.isArray(s[k])) out.push(...s[k]);
  }
  return out;
}

// Visible text of the slide HTML source: drop <style> blocks and tags, decode entities.
function sourceText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&rarr;/g, '→').replace(/&nbsp;/g, ' ');
}

// ---------- puppeteer measurement ----------

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

function wrapHtml(slideHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{width:1080px;height:1080px;overflow:hidden}</style></head><body>${slideHtml}</body></html>`;
}

async function measure(browser, html, ctx) {
  const inlined = await inlineImages(html);
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1080, deviceScaleFactor: 1 });
  await page.setContent(wrapHtml(inlined), { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(
    () => document.fonts.ready.then(() => [...document.fonts].every((f) => f.status === 'loaded')),
    { timeout: 10000 }
  ).catch(() => {});

  const r = await page.evaluate(() => {
    const slide = document.querySelector('.slide');
    const all = [...document.querySelectorAll('.slide *')].filter((el) => {
      if (el.classList && (el.classList.contains('logo') || el.classList.contains('ghost'))) return false;
      if (el.tagName === 'STYLE') return false;
      if (el.namespaceURI === 'http://www.w3.org/2000/svg' && !el.classList.contains('ico')) return false;
      const b = el.getBoundingClientRect();
      return !(b.width === 0 && b.height === 0);
    });

    let maxBottom = 0;
    const marginViolations = [];
    for (const el of all) {
      const b = el.getBoundingClientRect();
      if (b.bottom > maxBottom) maxBottom = b.bottom;
      if (b.left < 79.5 || b.right > 1000.5) {
        marginViolations.push({ cls: String(el.className), left: Math.round(b.left), right: Math.round(b.right) });
      }
    }

    let gapPrePunch = null;
    const punchEl = document.querySelector('.punch') || document.querySelector('.cta');
    if (punchEl) {
      const pr = punchEl.getBoundingClientRect();
      let prevBottom = 0;
      for (const el of all) {
        if (el === punchEl) continue;
        const b = el.getBoundingClientRect();
        if (b.bottom <= pr.top + 0.5 && b.bottom > prevBottom) prevBottom = b.bottom;
      }
      gapPrePunch = Math.round(pr.top - prevBottom);
    }

    const logo = document.querySelector('img.logo');
    const lb = logo ? logo.getBoundingClientRect() : null;

    return {
      scrollHeight: slide.scrollHeight,
      scrollWidth: slide.scrollWidth,
      maxBottom,
      marginViolations,
      gapPrePunch,
      innerText: document.body.innerText,
      pagination: (document.querySelector('.pagination') || {}).textContent || '',
      logo: logo ? { loaded: logo.complete && logo.naturalWidth > 0, w: Math.round(lb.width), bottom: Math.round(lb.bottom) } : null,
    };
  });

  await page.close();

  const lower = r.innerText.toLowerCase();
  const tildeMisses = [...ctx.tildeWords].filter((w) => !lower.includes(w));
  const foldLeaks = [];      // hard: an unaccented form that is always an error
  const foldWarnings = [];   // soft: an unaccented twin that may be a legitimate homograph
  for (const w of ctx.tildeWords) {
    const f = fold(w);
    if (f === w) continue;
    if (!new RegExp(`(^|[^a-záéíóúüñ])${f}([^a-záéíóúüñ]|$)`, 'i').test(lower)) continue;
    if (HARD_FOLD.has(f)) foldLeaks.push(`${f} (debe ser ${w})`);
    else if (!HOMOGRAPHS.has(f)) foldWarnings.push(`${f} / ${w}`);
  }

  return {
    overflowPass: r.scrollHeight <= 1080 && r.scrollWidth <= 1080,
    baselinePass: r.maxBottom <= 900.5,
    marginsPass: r.marginViolations.length === 0,
    tildesPass: tildeMisses.length === 0 && foldLeaks.length === 0,
    gapPass: r.gapPrePunch == null || r.gapPrePunch >= MIN_GAP,
    pagPass: r.pagination.trim() === ctx.expectedPag,
    logoPass: !!(r.logo && r.logo.loaded && Math.abs(r.logo.w - 183) <= 2 && r.logo.bottom <= 1080),
    scrollHeight: r.scrollHeight,
    scrollWidth: r.scrollWidth,
    maxBottom: Math.round(r.maxBottom),
    marginViolations: r.marginViolations,
    gapPrePunch: r.gapPrePunch,
    pagination: r.pagination.trim(),
    logo: r.logo,
    tildeMisses,
    foldLeaks,
    foldWarnings,
    tildeWordCount: ctx.tildeWords.size,
  };
}

const hardPass = (res) => res.overflowPass && res.baselinePass && res.marginsPass && res.tildesPass && res.pagPass && res.logoPass;

// ---------- main ----------

async function main() {
  const which = process.argv[2];
  if (!['1', '2', '3'].includes(which)) {
    console.error('Uso: node qa_w32.mjs 1|2|3');
    process.exit(2);
  }
  const dir = `carousel_ig_0${which}`;
  const ids = JSON.parse(await readFile(IDS_FILE, 'utf8'));
  const targetId = ids[`c${which}`];

  const data = JSON.parse(await readFile(CAROUSELS_FILE, 'utf8'));
  const carousel = data.carousels.find((c) => c.id === targetId);
  if (!carousel) throw new Error(`carrusel ${targetId} no encontrado en carousels.json`);
  const copy = JSON.parse(await readFile(`${PROD_BASE}/${dir}/copy.json`, 'utf8'));
  if (copy.slides.length !== carousel.slides.length) {
    throw new Error(`desajuste: copy.json ${copy.slides.length} slides, carousels.json ${carousel.slides.length}`);
  }
  const total = carousel.slides.length;
  if (total > 10) throw new Error(`${dir}: ${total} slides — Instagram rechaza >10`);

  const browser = await puppeteer.launch({
    headless: true, protocolTimeout: 60000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  let anyChanged = false;
  const report = {
    carousel: carousel.name, id: carousel.id, dir, slides_count: total,
    max_slides_ok: total <= 10, generated_at: new Date().toISOString(), slides: [],
  };

  console.log(`\n=== ${carousel.name} (${dir}, ${total} slides) ===`);

  for (let i = 0; i < total; i++) {
    const slideMeta = copy.slides[i];
    let html = carousel.slides[i].html;
    const tildeWords = new Set([
      ...accentWordsFrom(collectSlideStrings(slideMeta)),
      ...accentWordsFrom([sourceText(html)]),
    ]);
    const ctx = {
      tildeWords,
      expectedPag: `${String(i + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
    };

    let res = await measure(browser, html, ctx);
    let iter = 0;
    let changed = false;

    // Phase 1 — hard failures
    while (!hardPass(res) && iter < MAX_ITER) {
      iter++;
      let next = html;
      if (!res.marginsPass) next = widenStep(next);
      if (!res.overflowPass || !res.baselinePass) next = shrinkStep(next);
      if (next === html) break; // nothing left to adjust (tilde/pagination/logo need a human)
      html = next;
      changed = true;
      res = await measure(browser, html, ctx);
    }

    // Phase 2 — gap rule, never at the cost of a hard check
    let gapIter = 0;
    if (hardPass(res) && !res.gapPass) {
      const bumped = bumpStaticGap(html);
      if (bumped !== html) {
        const br = await measure(browser, bumped, ctx);
        if (hardPass(br)) { html = bumped; res = br; changed = true; }
      }
      while (!res.gapPass && gapIter < MAX_GAP_ITER) {
        gapIter++;
        const comp = compressAboveGap(html);
        if (comp === html) break;
        const cr = await measure(browser, comp, ctx);
        if (hardPass(cr) && (cr.gapPrePunch ?? 0) > (res.gapPrePunch ?? 0)) {
          html = comp; res = cr; changed = true;
        } else break;
      }
    }

    if (changed) { carousel.slides[i].html = html; anyChanged = true; }

    const ok = hardPass(res) && res.gapPass;
    console.log(
      `  Slide ${String(i + 1).padStart(2, '0')}/${total} [${String(slideMeta.tipo).padEnd(9)}] ` +
      `overflow=${res.overflowPass ? 'PASS' : 'FAIL'}(${res.scrollWidth}x${res.scrollHeight}) ` +
      `baseline=${res.baselinePass ? 'PASS' : 'FAIL'}(${res.maxBottom}) ` +
      `margins=${res.marginsPass ? 'PASS' : 'FAIL'} ` +
      `gap=${res.gapPrePunch == null ? 'n/a' : res.gapPrePunch}${res.gapPass ? '' : '(<62!)'} ` +
      `tildes=${res.tildesPass ? 'PASS' : 'FAIL'}(${res.tildeWordCount}w) ` +
      `pag=${res.pagPass ? 'PASS' : 'FAIL'} logo=${res.logoPass ? 'PASS' : 'FAIL'} ` +
      `iter=${iter}+${gapIter} ${ok ? 'OK' : '** FAILING **'}`
    );
    if (!res.marginsPass) console.log('    margins:', JSON.stringify(res.marginViolations));
    if (res.tildeMisses.length) console.log('    tildes ausentes:', res.tildeMisses);
    if (res.foldLeaks.length) console.log('    tildes perdidas:', res.foldLeaks);
    if (res.foldWarnings.length) console.log('    aviso homografo (revisar a mano):', res.foldWarnings);
    if (!res.pagPass) console.log(`    paginación: "${res.pagination}" != "${ctx.expectedPag}"`);
    if (!res.logoPass) console.log('    logo:', JSON.stringify(res.logo));

    report.slides.push({
      n: i + 1, tipo: slideMeta.tipo, bg: slideMeta.bg, pass: ok,
      overflow: res.overflowPass, scrollWidth: res.scrollWidth, scrollHeight: res.scrollHeight,
      baseline: res.baselinePass, maxBottom: res.maxBottom,
      margins: res.marginsPass, marginViolations: res.marginViolations,
      gapPrePunch: res.gapPrePunch, gapPass: res.gapPass,
      tildes: res.tildesPass, tildeWordCount: res.tildeWordCount,
      tildeMisses: res.tildeMisses, foldLeaks: res.foldLeaks, foldWarnings: res.foldWarnings,
      pagination: res.pagination, paginationPass: res.pagPass,
      logo: res.logo, logoPass: res.logoPass,
      iterations: iter, gapIterations: gapIter,
    });
  }

  await browser.close();

  if (anyChanged) {
    await writeFile(CAROUSELS_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log('\ncarousels.json actualizado con los ajustes.');
  } else {
    console.log('\nSin ajustes — carousels.json intacto.');
  }

  report.all_pass = report.slides.every((s) => s.pass);
  await writeFile(`${PROD_BASE}/${dir}/qa_report.json`, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Informe QA -> ${PROD_BASE}/${dir}/qa_report.json`);
  console.log(report.all_pass ? 'QA: TODOS LOS SLIDES PASAN.' : 'QA: HAY SLIDES FALLANDO.');
  if (!report.all_pass) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exit(1); });
