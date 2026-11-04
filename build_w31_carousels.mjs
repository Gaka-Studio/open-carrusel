/**
 * Builds the 3 W31 carousel objects (v4-serie, 9 slides each) from the approved
 * copy.json files and injects them into data/carousels.json.
 * Run from D:\open-carrusel: node build_w31_carousels.mjs
 */
import { readFile, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';

const CAROUSELS_FILE = 'D:/open-carrusel/data/carousels.json';
const PROD_BASE = 'D:/GAKA_RRSS/clients/gaka_studio/productions/2026-W31';
const IDS_OUT = 'C:/Users/alexz/AppData/Local/Temp/claude/D--GAKA-RRSS/1efc95da-9cfc-48f0-9927-6b6e61fae3c8/scratchpad/w31_ids.json';

const PAL = {
  cream: {
    bg: '#f0ece0', text: '#1e1e1e', muted: '#9a9487', accent: '#8b00ff',
    headline: '#1e1e1e', body: '#3a362f', logoOpacity: 0.72,
    logoSrc: '/uploads/GAKA_LOGO_NEGRO.png', ghostRgba: 'rgba(139,0,255,0.105)',
    grain: true,
  },
  dark: {
    bg: '#1e1e1e', text: '#ffffff', muted: '#8a857c', accent: '#adff2f',
    headline: '#ffffff', body: '#d4d0c8', logoOpacity: 0.6,
    logoSrc: '/uploads/GAKA_LOGO_BLANCO.png', ghostRgba: 'rgba(173,255,47,0.125)',
    grain: false,
  },
};

const GRAIN_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='1'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.018 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

// ---------- semantic icon library (viewBox 64, stroke 3.2, round caps) ----------
const ICONS = {
  terminal: `<rect x="8" y="10" width="48" height="44" rx="6"/><path d="M8 22h48"/><circle cx="16" cy="16" r="1.8" fill="currentColor" stroke="none"/><circle cx="24" cy="16" r="1.8" fill="currentColor" stroke="none"/><path d="M18 32l9 7-9 7"/><path d="M34 46h13"/>`,
  mensaje: `<path d="M10 14h44a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H30l-11 10v-10h-5a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4z"/><path d="M20 26h24M20 34h16"/>`,
  lista: `<circle cx="13" cy="16" r="3" fill="currentColor" stroke="none"/><circle cx="13" cy="32" r="3" fill="currentColor" stroke="none"/><circle cx="13" cy="48" r="3" fill="currentColor" stroke="none"/><path d="M24 16h32M24 32h32M24 48h32"/>`,
  candado: `<rect x="14" y="28" width="36" height="28" rx="6"/><path d="M22 28v-8a10 10 0 0 1 20 0v8"/><circle cx="32" cy="40" r="3" fill="currentColor" stroke="none"/><path d="M32 43v6"/>`,
  tijera: `<circle cx="16" cy="46" r="7"/><circle cx="16" cy="18" r="7"/><path d="M21.5 23l30 30M21.5 41l30-30"/>`,
  clip: `<rect x="8" y="12" width="48" height="40" rx="6"/><path d="M8 24h48M8 40h48"/><circle cx="16" cy="18" r="1.8" fill="currentColor" stroke="none"/><circle cx="28" cy="18" r="1.8" fill="currentColor" stroke="none"/><circle cx="40" cy="18" r="1.8" fill="currentColor" stroke="none"/><circle cx="52" cy="18" r="1.8" fill="currentColor" stroke="none"/><circle cx="16" cy="46" r="1.8" fill="currentColor" stroke="none"/><circle cx="28" cy="46" r="1.8" fill="currentColor" stroke="none"/><circle cx="40" cy="46" r="1.8" fill="currentColor" stroke="none"/><circle cx="52" cy="46" r="1.8" fill="currentColor" stroke="none"/>`,
  pantalla: `<rect x="8" y="12" width="48" height="32" rx="4"/><path d="M24 52h16M32 44v8"/>`,
  reloj: `<circle cx="32" cy="32" r="24"/><path d="M32 18v14l10 6"/>`,
  dial: `<path d="M11 44a21 21 0 1 1 42 0"/><path d="M32 44l13-15"/><circle cx="32" cy="44" r="3.4" fill="currentColor" stroke="none"/><path d="M7 44h5M52 44h5"/>`,
  chip: `<rect x="19" y="19" width="26" height="26" rx="4"/><rect x="27" y="27" width="10" height="10" rx="2"/><path d="M19 27h-8M19 37h-8M45 27h8M45 37h8M27 19v-8M37 19v-8M27 45v8M37 45v8"/>`,
  escalera: `<path d="M8 54h11V44h11V34h11V24h11V14"/>`,
};

function icoSvg(name, size) {
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function br(s) {
  return esc(s).replace(/\n/g, '<br>');
}

function baseCss(p, extra) {
  return `<style>
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=Space+Grotesk:wght@400;500;700&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
.slide{width:1080px;height:1080px;position:relative;overflow:hidden;background:${p.bg};color:${p.text};
  font-family:'Space Grotesk',sans-serif;display:flex;flex-direction:column;align-items:center;padding:58px 80px 0}
${p.grain ? `.slide::before{content:'';position:absolute;inset:0;background:${GRAIN_SVG};pointer-events:none;z-index:0}` : ''}
.slide>*{position:relative;z-index:1}
.pagination{font-size:26px;font-weight:500;letter-spacing:3px;color:${p.muted};font-variant-numeric:tabular-nums;line-height:1.2}
.pill{display:inline-block;margin-top:24px;border:2px solid ${p.accent};color:${p.accent};border-radius:30px;
  padding:10px 32px 9px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:28px;
  text-transform:uppercase;letter-spacing:3px;line-height:1}
.headline{font-family:'Barlow Condensed',sans-serif;font-weight:900;text-transform:uppercase;
  letter-spacing:-0.5px;line-height:0.95;color:${p.headline};text-align:center}
.rule{width:56px;height:3px;background:${p.accent};border-radius:2px;flex:none}
.body{font-weight:400;letter-spacing:0;color:${p.body};text-align:center;max-width:880px}
.punch{font-weight:700;line-height:1.28;color:${p.accent};text-align:center;max-width:880px}
.ico{display:block}
.logo{width:183px;opacity:${p.logoOpacity};position:absolute;bottom:38px;left:50%;transform:translateX(-50%);z-index:2}
${extra}
</style>`;
}

function wrapSlide(inner) {
  return `<div class="slide">${inner}</div>`;
}

function logoTag(p) {
  return `<img class="logo" src="${p.logoSrc}" alt="Gaka">`;
}

// crude condensed-caps width heuristic to pick a hero font-size that avoids overflow
function heroFontSize(text) {
  const len = text.length;
  const maxWidth = 900;
  const charW = 0.56; // Barlow Condensed 900, letter-spacing -3
  let size = Math.floor(maxWidth / (len * charW));
  return Math.max(80, Math.min(150, size));
}

// ---------- slide builders ----------

function buildHero(s, n, total) {
  const p = PAL[s.bg];
  const heroSize = heroFontSize(s.hero);
  const extra = `.hero{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:${heroSize}px;line-height:0.9;
  letter-spacing:-3px;text-transform:uppercase;color:${p.headline};text-align:center;margin-top:40px}
.rule{margin-top:32px}
.sub{font-size:36px;font-weight:400;line-height:1.34;color:${p.body};text-align:center;max-width:780px;margin-top:26px}
.iconrow{display:flex;justify-content:space-between;align-items:flex-start;width:100%;margin-top:56px}
.iconrow-item{width:210px;display:flex;flex-direction:column;align-items:center;color:${p.accent}}
.iconrow-name{margin-top:15px;font-size:19px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:${p.muted};text-align:center}
.swipe{margin-top:48px;background:${p.accent};color:${p.bg};border-radius:34px;padding:16px 44px;
  font-size:29px;font-weight:500;letter-spacing:0.5px;line-height:1}`;
  const iconRow = s.iconos.map((name) => `
    <div class="iconrow-item">${icoSvg(name, 54)}<div class="iconrow-name">${esc(name)}</div></div>`).join('');
  const inner = `
  <div class="pagination">${String(n).padStart(2, '0')} / ${total}</div>
  <div class="pill">${esc(s.pill)}</div>
  <div class="hero">${esc(s.hero)}</div>
  <div class="rule"></div>
  <div class="sub">${esc(s.sub)}</div>
  <div class="iconrow">${iconRow}</div>
  ${s.swipe ? '<div class="swipe">Desliza &rarr;</div>' : ''}
  ${logoTag(p)}`;
  return baseCss(p, extra) + wrapSlide(inner);
}

function buildNarrativa(s, n, total) {
  const p = PAL[s.bg];
  const extra = `.headline{font-size:86px;margin-top:60px}
.rule{margin-top:34px}
.body{font-size:30px;line-height:1.52;margin-top:34px}
.punch{font-size:44px;margin-top:76px}`;
  const inner = `
  <div class="pagination">${String(n).padStart(2, '0')} / ${total}</div>
  <div class="pill">${esc(s.pill)}</div>
  <div class="headline">${br(s.headline)}</div>
  <div class="rule"></div>
  <div class="body">${esc(s.body)}</div>
  <div class="punch">${esc(s.punch)}</div>
  ${logoTag(p)}`;
  return baseCss(p, extra) + wrapSlide(inner);
}

function buildTesis(s, n, total, icons) {
  const p = PAL[s.bg];
  const extra = `.headline{font-size:88px;margin-top:60px}
.rule{margin-top:36px}
.body{font-size:32px;line-height:1.52;max-width:840px;margin-top:32px}
.flow{display:flex;align-items:flex-start;justify-content:center;gap:20px;margin-top:52px}
.node{display:flex;flex-direction:column;align-items:center;width:150px}
.node-badge{width:34px;height:34px;border-radius:50%;background:${p.accent};color:${p.bg};
  display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;
  font-weight:900;font-size:18px;flex:none}
.node-ico{margin-top:12px;color:${p.accent}}
.node-label{margin-top:12px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:22px;
  letter-spacing:1px;text-transform:uppercase;color:${p.accent};text-align:center;line-height:1.15}
.arrow{color:${p.muted};font-size:26px;line-height:1;margin-top:44px}
.punch{font-size:44px;margin-top:64px}`;
  const nodes = s.flow.map((label, i) => {
    const icoName = icons[i];
    return `<div class="node"><div class="node-badge">${String(i + 1).padStart(2, '0')}</div><div class="node-ico">${icoSvg(icoName, 40)}</div><div class="node-label">${esc(label)}</div></div>`;
  });
  const flowInner = nodes.reduce((acc, node, i) => {
    acc.push(node);
    if (i < nodes.length - 1) acc.push('<div class="arrow">&rarr;</div>');
    return acc;
  }, []).join('');
  const inner = `
  <div class="pagination">${String(n).padStart(2, '0')} / ${total}</div>
  <div class="pill">${esc(s.pill)}</div>
  <div class="headline">${br(s.headline)}</div>
  <div class="rule"></div>
  <div class="body">${esc(s.body)}</div>
  <div class="flow">${flowInner}</div>
  <div class="punch">${esc(s.punch)}</div>
  ${logoTag(p)}`;
  return baseCss(p, extra) + wrapSlide(inner);
}

function buildSerie(s, n, total) {
  const p = PAL[s.bg];
  const extra = `.ghost{position:absolute;left:50%;transform:translateX(-50%);top:188px;font-size:272px;
  font-family:'Barlow Condensed',sans-serif;font-weight:900;line-height:1;color:${p.ghostRgba};z-index:0;pointer-events:none}
.serie-ico{margin-top:34px;color:${p.accent};height:88px}
.headline{font-size:60px;margin-top:10px}
.rule{margin-top:14px}
.body{font-size:26px;max-width:840px;margin-top:12px;line-height:1.48}
.specs{width:100%;max-width:880px;margin-top:16px;background:${p.bg === '#1e1e1e' ? 'rgba(255,255,255,0.07)' : 'rgba(30,30,30,0.065)'};border-radius:30px;padding:8px}
.specs-core{background:${p.bg === '#1e1e1e' ? '#272727' : '#f7f4ec'};border-radius:23px;padding:9px 28px}
.spec{display:flex;align-items:flex-start;gap:20px;padding:7px 0;text-align:left}
.spec + .spec{border-top:2px solid ${p.bg === '#1e1e1e' ? 'rgba(255,255,255,0.14)' : 'rgba(30,30,30,0.16)'}}
.dot{width:11px;height:11px;border-radius:50%;background:${p.accent};margin-top:12px;flex:none}
.spec-text{font-size:24px;font-weight:400;line-height:1.32;color:${p.body}}
.punch{margin-top:auto;margin-bottom:184px;font-size:39px;max-width:920px}`;
  const specs = s.specs.map((t) => `<div class="spec"><div class="dot"></div><div class="spec-text">${esc(t)}</div></div>`).join('');
  const inner = `
  <div class="pagination">${String(n).padStart(2, '0')} / ${total}</div>
  <div class="pill">${esc(s.ghost)}</div>
  <div class="ghost">${esc(s.ghost)}</div>
  <div class="serie-ico">${icoSvg(s.icono, 88)}</div>
  <div class="headline">${br(s.headline)}</div>
  <div class="rule"></div>
  <div class="body">${esc(s.body)}</div>
  <div class="specs"><div class="specs-core">${specs}</div></div>
  <div class="punch">${esc(s.punch)}</div>
  ${logoTag(p)}`;
  return baseCss(p, extra) + wrapSlide(inner);
}

function buildStat(s, n, total) {
  const p = PAL[s.bg];
  const extra = `.stat-row{display:flex;align-items:center;justify-content:center;gap:24px;margin-top:44px}
.stat{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:140px;line-height:0.86;
  letter-spacing:-3px;color:${p.accent}}
.stat-note{font-size:34px;font-weight:400;line-height:1.4;color:${p.body};text-align:center;max-width:820px;margin-top:22px}
.rule{margin-top:32px}
.qa{width:100%;max-width:880px;margin-top:28px}
.qa-q{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:30px;letter-spacing:2px;
  text-transform:uppercase;color:${p.accent};text-align:center;line-height:1.1}
.qa-a{font-size:30px;font-weight:400;line-height:1.42;color:${p.body};text-align:center;margin-top:16px}
.punch{margin-top:66px;font-size:36px}`;
  const inner = `
  <div class="pagination">${String(n).padStart(2, '0')} / ${total}</div>
  <div class="pill">${esc(s.pill)}</div>
  <div class="stat-row"><div class="stat">${esc(s.stat)}</div></div>
  <div class="stat-note">${esc(s.stat_note)}</div>
  <div class="rule"></div>
  <div class="qa">
    <div class="qa-q">${esc(s.qa_q)}</div>
    <div class="qa-a">${esc(s.qa_a)}</div>
  </div>
  <div class="punch">${esc(s.punch)}</div>
  ${logoTag(p)}`;
  return baseCss(p, extra) + wrapSlide(inner);
}

function buildRecap(s, n, total, icons) {
  const p = PAL[s.bg];
  const ctaText = s.bg === 'dark' ? p.bg : '#ffffff';
  const extra = `.headline{font-size:100px;margin-top:56px}
.rule{margin-top:38px}
.iconrow{display:flex;justify-content:space-between;align-items:flex-start;width:100%;margin-top:60px}
.iconrow-item{width:${Math.floor(880 / s.recap_items.length)}px;display:flex;flex-direction:column;align-items:center;color:${p.accent}}
.iconrow-num{margin-top:16px;font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:28px;
  letter-spacing:1px;color:${p.accent};line-height:1}
.iconrow-name{margin-top:7px;font-size:18px;font-weight:500;letter-spacing:1.2px;text-transform:uppercase;
  color:${p.muted};text-align:center;line-height:1.25}
.cta{margin-top:60px;background:${p.accent};color:${ctaText};border-radius:36px;padding:19px 44px;
  font-size:30px;font-weight:500;line-height:1.15;text-align:center;max-width:820px}
.handle{margin-top:30px;font-size:26px;font-weight:500;letter-spacing:2px;color:${p.muted}}`;
  const items = s.recap_items.map((label, i) => `
    <div class="iconrow-item">${icoSvg(icons[i], 80)}<div class="iconrow-num">${String(i + 1).padStart(2, '0')}</div><div class="iconrow-name">${esc(label)}</div></div>`).join('');
  const headlineWord = s.recap_items.length === 3 ? 'Las 3 piezas' : `Las ${s.recap_items.length} piezas`;
  const inner = `
  <div class="pagination">${String(n).padStart(2, '0')} / ${total}</div>
  <div class="pill">${esc(s.pill)}</div>
  <div class="headline">${esc(headlineWord)}</div>
  <div class="rule"></div>
  <div class="iconrow">${items}</div>
  <div class="cta">${esc(s.cta)}</div>
  <div class="handle">${esc(s.handle)}</div>
  ${logoTag(p)}`;
  return baseCss(p, extra) + wrapSlide(inner);
}

// ---------- per-carousel icon mapping for tesis/recap (reuse serie order) ----------
const SERIE_ICON_ORDER = {
  carousel_ig_01: ['lista', 'mensaje', 'candado'],
  carousel_ig_02: ['tijera', 'pantalla', 'clip'],
  carousel_ig_03: ['dial', 'chip', 'escalera'],
};

async function buildCarousel(dirName, name) {
  const copy = JSON.parse(await readFile(`${PROD_BASE}/${dirName}/copy.json`, 'utf8'));
  const total = copy.slides.length;
  const icons = SERIE_ICON_ORDER[dirName];
  const slides = copy.slides.map((s) => {
    let html;
    switch (s.tipo) {
      case 'hero': html = buildHero(s, s.n, total); break;
      case 'narrativa': html = buildNarrativa(s, s.n, total); break;
      case 'tesis': html = buildTesis(s, s.n, total, icons); break;
      case 'serie': html = buildSerie(s, s.n, total); break;
      case 'stat': html = buildStat(s, s.n, total); break;
      case 'recap': html = buildRecap(s, s.n, total, icons); break;
      default: throw new Error(`tipo desconocido: ${s.tipo}`);
    }
    return { id: randomUUID(), html };
  });
  return {
    id: randomUUID(),
    name,
    aspectRatio: '1:1',
    slides,
  };
}

async function main() {
  const data = JSON.parse(await readFile(CAROUSELS_FILE, 'utf8'));

  const c1 = await buildCarousel('carousel_ig_01', 'W31 C01 — Claude Code sessions se hablan (tutorial, 9 slides)');
  const c2 = await buildCarousel('carousel_ig_02', 'W31 C02 — Firefly Remove Background en vídeo (tutorial, 9 slides)');
  const c3 = await buildCarousel('carousel_ig_03', 'W31 C03 — Codex niveles de razonamiento (tutorial, 9 slides)');

  data.carousels.push(c1, c2, c3);
  await writeFile(CAROUSELS_FILE, JSON.stringify(data, null, 2), 'utf8');

  await writeFile(IDS_OUT, JSON.stringify({ c1: c1.id, c2: c2.id, c3: c3.id }, null, 2), 'utf8');
  console.log('W31 carousels appended:');
  console.log('  c1', c1.id, c1.slides.length, 'slides');
  console.log('  c2', c2.id, c2.slides.length, 'slides');
  console.log('  c3', c3.id, c3.slides.length, 'slides');
}

main().catch((err) => { console.error(err); process.exit(1); });
