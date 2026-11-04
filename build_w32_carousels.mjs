/**
 * Builds the 3 W32 carousel objects (v4-serie) from the approved copy.json files
 * and injects them into data/carousels.json.
 *
 * Clone of build_w31_carousels.mjs with:
 *   - 14 new semantic icons (cursor, enchufe, navegador, escudo, dialogo, capas,
 *     secuencia, documento, lapiz, servidor, cuadricula, ojo, bisturi, balanza)
 *   - ICON_LABELS map so the hero teaser row never prints un-accented icon keys
 *   - hero auto-wrap to 2 balanced lines when the title is long (C02)
 *   - narrativa variant with a 6-chip flow grid (C02 slide 02 has no tesis slide)
 *   - serie pill with the role label ("PIEZA 01" / "MODELO 01") per Obsidian v4-serie
 *   - pagination padded on both sides: NN / NN
 *
 * Run from D:\open-carrusel: node build_w32_carousels.mjs
 */
import { readFile, writeFile } from 'fs/promises';
import { randomUUID } from 'crypto';

const CAROUSELS_FILE = 'D:/open-carrusel/data/carousels.json';
const PROD_BASE = 'D:/GAKA_RRSS/clients/gaka_studio/productions/2026-W32';
const IDS_OUT = 'C:/Users/alexz/AppData/Local/Temp/claude/D--GAKA-RRSS/b4aac251-36a8-4d1a-b2dd-35ea67d76d76/scratchpad/w32_ids.json';

const PAL = {
  cream: {
    bg: '#f0ece0', text: '#1e1e1e', muted: '#9a9487', accent: '#8b00ff',
    headline: '#1e1e1e', body: '#3a362f', logoOpacity: 0.72,
    logoSrc: '/uploads/GAKA_LOGO_NEGRO.png', ghostRgba: 'rgba(139,0,255,0.105)',
    chipBorder: 'rgba(139,0,255,0.55)',
    grain: true,
  },
  dark: {
    bg: '#1e1e1e', text: '#ffffff', muted: '#8a857c', accent: '#adff2f',
    headline: '#ffffff', body: '#d4d0c8', logoOpacity: 0.6,
    logoSrc: '/uploads/GAKA_LOGO_BLANCO.png', ghostRgba: 'rgba(173,255,47,0.125)',
    chipBorder: 'rgba(173,255,47,0.55)',
    grain: false,
  },
};

const GRAIN_SVG = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='1'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.018 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

// ---------- semantic icon library (viewBox 64, stroke 3.2, round caps) ----------
// W32 set. Same construction rules as the W31 set: single-colour line art,
// currentColor, no fills except deliberate dots.
const ICONS = {
  // C01 — agentes de navegador
  cursor: `<path d="M16 8l27 27H31l7 15-6 3-7-15-9 9z"/><path d="M50 12l6-6M54 24h8M44 6V2"/>`,
  enchufe: `<path d="M24 6v14M40 6v14"/><path d="M13 20h38v10a19 19 0 0 1-38 0z"/><path d="M32 49v9"/>`,
  navegador: `<rect x="7" y="12" width="50" height="40" rx="6"/><path d="M7 25h50"/><circle cx="16" cy="18.5" r="2.1" fill="currentColor" stroke="none"/><circle cx="24" cy="18.5" r="2.1" fill="currentColor" stroke="none"/><rect x="32" y="15" width="19" height="7" rx="3.5"/><path d="M18 36h20M18 44h28"/>`,
  escudo: `<path d="M32 6l23 8v17c0 15-9.5 24-23 28C18.5 55 9 46 9 31V14z"/><path d="M22.5 31.5l7.5 7.5L43 25"/>`,
  // C02 — modelos de vídeo
  dialogo: `<path d="M11 12h42a5 5 0 0 1 5 5v20a5 5 0 0 1-5 5H32L20 52V42h-9a5 5 0 0 1-5-5V17a5 5 0 0 1 5-5z"/><path d="M23 23v10M32 19v18M41 25v8"/>`,
  capas: `<path d="M32 7l24 12-24 12L8 19z"/><path d="M8 31.5L32 43.5 56 31.5"/><path d="M8 43.5L32 55.5 56 43.5"/>`,
  secuencia: `<rect x="6" y="14" width="15" height="24" rx="3"/><rect x="24.5" y="14" width="15" height="24" rx="3"/><rect x="43" y="14" width="15" height="24" rx="3"/><path d="M6 50h52"/><path d="M13.5 50v6M32 50v6M50.5 50v6"/>`,
  documento: `<path d="M16 6h20l14 14v36a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V10a4 4 0 0 1 4-4z"/><path d="M36 6v14h14"/><path d="M24 34h20M24 44h13"/>`,
  lapiz: `<path d="M14 50l-3 9 9-3 31-31a6.4 6.4 0 0 0-9-9z"/><path d="M39 18l9 9"/><path d="M11 59l6-2-4-4z" fill="currentColor" stroke="none"/>`,
  servidor: `<rect x="9" y="11" width="46" height="18" rx="4"/><rect x="9" y="35" width="46" height="18" rx="4"/><circle cx="19" cy="20" r="2.4" fill="currentColor" stroke="none"/><circle cx="19" cy="44" r="2.4" fill="currentColor" stroke="none"/><path d="M30 20h15M30 44h15"/>`,
  // C03 — Midjourney V8.2
  cuadricula: `<rect x="8" y="8" width="20" height="20" rx="3"/><rect x="36" y="8" width="20" height="20" rx="3"/><rect x="8" y="36" width="20" height="20" rx="3"/><rect x="36" y="36" width="20" height="20" rx="3"/>`,
  ojo: `<path d="M4 32s10.5-16 28-16 28 16 28 16-10.5 16-28 16S4 32 4 32z"/><circle cx="32" cy="32" r="8.5"/>`,
  bisturi: `<path d="M8 56l16-16"/><path d="M24 40L45 17a6.4 6.4 0 0 1 9 9L34 50z"/><path d="M28 44l-6 12" stroke-dasharray="4 5"/>`,
  balanza: `<path d="M32 11v43"/><path d="M22 54h20"/><path d="M9 20h46"/><path d="M9 20L2.5 34h13z"/><path d="M55 20l-6.5 14h13z"/>`,
};

// Display labels for the hero teaser row — Spanish spelling with tildes.
const ICON_LABELS = {
  cursor: 'Cursor', enchufe: 'Enchufe', navegador: 'Navegador', escudo: 'Escudo',
  dialogo: 'Diálogo', capas: 'Capas', secuencia: 'Secuencia', documento: 'Documento',
  lapiz: 'Lápiz', servidor: 'Servidor',
  cuadricula: 'Cuadrícula', ojo: 'Ojo', bisturi: 'Bisturí', balanza: 'Balanza',
};

function icoSvg(name, size) {
  if (!ICONS[name]) throw new Error(`icono desconocido: ${name}`);
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function br(s) {
  return esc(s).replace(/\n/g, '<br>');
}
function pag(n, total) {
  return `${String(n).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
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

// Balanced wrap for the hero title: 1 line when short, 2 balanced lines otherwise.
function heroLines(text) {
  const clean = String(text).trim();
  if (clean.length <= 14) return [clean];
  const words = clean.split(/\s+/);
  if (words.length < 2) return [clean];
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    const m = Math.max(a.length, b.length);
    if (!best || m < best.m) best = { a, b, m };
  }
  return [best.a, best.b];
}

// crude condensed-caps width heuristic to pick a hero font-size that avoids overflow
function heroFontSize(lines) {
  const maxLen = Math.max(...lines.map((l) => l.length));
  const charW = 0.56; // Barlow Condensed 900, letter-spacing -3
  const size = Math.floor(900 / (maxLen * charW));
  const cap = lines.length > 1 ? 132 : 150;
  return Math.max(80, Math.min(cap, size));
}

// ---------- slide builders ----------

function buildHero(s, n, total) {
  const p = PAL[s.bg];
  const lines = heroLines(s.hero);
  const heroSize = heroFontSize(lines);
  const itemW = Math.min(210, Math.floor(900 / s.iconos.length));
  const icoSize = s.iconos.length > 4 ? 48 : 54;
  const extra = `.hero{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:${heroSize}px;line-height:0.9;
  letter-spacing:-3px;text-transform:uppercase;color:${p.headline};text-align:center;margin-top:40px}
.rule{margin-top:32px}
.sub{font-size:36px;font-weight:400;line-height:1.34;color:${p.body};text-align:center;max-width:780px;margin-top:26px}
.iconrow{display:flex;justify-content:space-between;align-items:flex-start;width:100%;margin-top:56px}
.iconrow-item{width:${itemW}px;display:flex;flex-direction:column;align-items:center;color:${p.accent}}
.iconrow-name{margin-top:15px;font-size:19px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:${p.muted};text-align:center;line-height:1.2}
.swipe{margin-top:48px;background:${p.accent};color:${p.bg};border-radius:34px;padding:16px 44px;
  font-size:29px;font-weight:500;letter-spacing:0.5px;line-height:1}`;
  const iconRow = s.iconos.map((name) => `
    <div class="iconrow-item">${icoSvg(name, icoSize)}<div class="iconrow-name">${esc(ICON_LABELS[name] || name)}</div></div>`).join('');
  const inner = `
  <div class="pagination">${pag(n, total)}</div>
  <div class="pill">${esc(s.pill)}</div>
  <div class="hero">${lines.map(esc).join('<br>')}</div>
  <div class="rule"></div>
  <div class="sub">${esc(s.sub)}</div>
  <div class="iconrow">${iconRow}</div>
  ${s.swipe ? '<div class="swipe">Desliza &rarr;</div>' : ''}
  ${logoTag(p)}`;
  return baseCss(p, extra) + wrapSlide(inner);
}

function buildNarrativa(s, n, total, icons) {
  const p = PAL[s.bg];
  const hasFlow = Array.isArray(s.flow) && s.flow.length > 0;
  const extra = hasFlow
    ? `.headline{font-size:78px;margin-top:56px}
.rule{margin-top:30px}
.body{font-size:28px;line-height:1.5;margin-top:30px}
.flowgrid{display:flex;flex-wrap:wrap;justify-content:center;gap:14px 16px;width:100%;max-width:896px;margin-top:36px}
.chip{display:flex;align-items:center;justify-content:center;gap:12px;border:2px solid ${p.chipBorder};
  border-radius:26px;padding:9px 18px 8px;width:288px;color:${p.accent}}
.chip-label{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:26px;letter-spacing:1px;
  text-transform:uppercase;line-height:1.05;text-align:left;color:${p.accent}}
.punch{font-size:40px;margin-top:62px}`
    : `.headline{font-size:86px;margin-top:60px}
.rule{margin-top:34px}
.body{font-size:30px;line-height:1.52;margin-top:34px}
.punch{font-size:44px;margin-top:76px}`;
  const flowBlock = hasFlow
    ? `<div class="flowgrid">${s.flow.map((label, i) =>
        `<div class="chip">${icoSvg(icons[i], 26)}<div class="chip-label">${esc(label)}</div></div>`).join('')}</div>`
    : '';
  const inner = `
  <div class="pagination">${pag(n, total)}</div>
  <div class="pill">${esc(s.pill)}</div>
  <div class="headline">${br(s.headline)}</div>
  <div class="rule"></div>
  <div class="body">${esc(s.body)}</div>
  ${flowBlock}
  <div class="punch">${esc(s.punch)}</div>
  ${logoTag(p)}`;
  return baseCss(p, extra) + wrapSlide(inner);
}

function buildTesis(s, n, total, icons) {
  const p = PAL[s.bg];
  const extra = `.headline{font-size:82px;margin-top:56px}
.rule{margin-top:34px}
.body{font-size:30px;line-height:1.5;max-width:840px;margin-top:26px}
.flow{display:flex;align-items:flex-start;justify-content:center;gap:20px;margin-top:40px}
.node{display:flex;flex-direction:column;align-items:center;width:150px}
.node-badge{width:34px;height:34px;border-radius:50%;background:${p.accent};color:${p.bg};
  display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;
  font-weight:900;font-size:18px;flex:none}
.node-ico{margin-top:12px;color:${p.accent}}
.node-label{margin-top:12px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:22px;
  letter-spacing:1px;text-transform:uppercase;color:${p.accent};text-align:center;line-height:1.15}
.arrow{color:${p.muted};font-size:26px;line-height:1;margin-top:44px}
.punch{font-size:42px;margin-top:64px}`;
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
  <div class="pagination">${pag(n, total)}</div>
  <div class="pill">${esc(s.pill)}</div>
  <div class="headline">${br(s.headline)}</div>
  <div class="rule"></div>
  <div class="body">${esc(s.body)}</div>
  <div class="flow">${flowInner}</div>
  <div class="punch">${esc(s.punch)}</div>
  ${logoTag(p)}`;
  return baseCss(p, extra) + wrapSlide(inner);
}

function buildSerie(s, n, total, seriePillWord) {
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
  <div class="pagination">${pag(n, total)}</div>
  <div class="pill">${esc(seriePillWord)} ${esc(s.ghost)}</div>
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
  <div class="pagination">${pag(n, total)}</div>
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

function buildRecap(s, n, total, icons, recapHeadline) {
  const p = PAL[s.bg];
  const ctaText = s.bg === 'dark' ? p.bg : '#ffffff';
  const count = s.recap_items.length;
  const itemW = Math.floor(880 / count);
  const icoSize = count > 4 ? 60 : 80;
  const extra = `.headline{font-size:100px;margin-top:56px}
.rule{margin-top:38px}
.iconrow{display:flex;justify-content:space-between;align-items:flex-start;width:100%;margin-top:60px}
.iconrow-item{width:${itemW}px;display:flex;flex-direction:column;align-items:center;color:${p.accent}}
.iconrow-num{margin-top:16px;font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:28px;
  letter-spacing:1px;color:${p.accent};line-height:1}
.iconrow-name{margin-top:7px;font-size:${count > 4 ? 16 : 18}px;font-weight:500;letter-spacing:1.2px;text-transform:uppercase;
  color:${p.muted};text-align:center;line-height:1.25}
.cta{margin-top:60px;background:${p.accent};color:${ctaText};border-radius:36px;padding:19px 44px;
  font-size:30px;font-weight:500;line-height:1.15;text-align:center;max-width:820px}
.handle{margin-top:30px;font-size:26px;font-weight:500;letter-spacing:2px;color:${p.muted}}`;
  // "Kling 3.0 — diálogo" in a 146px column would leave the dash dangling at the end
  // of the first line, so the connector becomes the line break itself.
  const recapLabel = (label) => esc(label).replace(/\s+[—–-]\s+/, '<br>');
  const items = s.recap_items.map((label, i) => `
    <div class="iconrow-item">${icoSvg(icons[i], icoSize)}<div class="iconrow-num">${String(i + 1).padStart(2, '0')}</div><div class="iconrow-name">${recapLabel(label)}</div></div>`).join('');
  const inner = `
  <div class="pagination">${pag(n, total)}</div>
  <div class="pill">${esc(s.pill)}</div>
  <div class="headline">${esc(recapHeadline)}</div>
  <div class="rule"></div>
  <div class="iconrow">${items}</div>
  <div class="cta">${esc(s.cta)}</div>
  <div class="handle">${esc(s.handle)}</div>
  ${logoTag(p)}`;
  return baseCss(p, extra) + wrapSlide(inner);
}

// ---------- per-carousel config ----------
// SERIE_ICON_ORDER drives tesis nodes, the narrativa chip grid and the recap row,
// so the same glyph stands for the same concept across the whole carousel.
const CFG = {
  carousel_ig_01: {
    icons: ['enchufe', 'navegador', 'escudo'],
    seriePill: 'Pieza',
    recapHeadline: 'Las 3 piezas',
    name: 'W32 C01 — Agentes de navegador (tutorial, 9 slides)',
  },
  carousel_ig_02: {
    icons: ['dialogo', 'capas', 'secuencia', 'documento', 'lapiz', 'servidor'],
    seriePill: 'Modelo',
    recapHeadline: 'Los 6 modelos',
    name: 'W32 C02 — Qué plano, qué modelo de vídeo (comparativa, 10 slides)',
  },
  carousel_ig_03: {
    icons: ['ojo', 'bisturi', 'balanza'],
    seriePill: 'Pieza',
    recapHeadline: 'Las 3 piezas',
    name: 'W32 C03 — Midjourney V8.2 edición quirúrgica (tutorial, 9 slides)',
  },
};

async function buildCarousel(dirName) {
  const cfg = CFG[dirName];
  const copy = JSON.parse(await readFile(`${PROD_BASE}/${dirName}/copy.json`, 'utf8'));
  const total = copy.slides.length;
  if (total > 10) throw new Error(`${dirName}: ${total} slides — Instagram rechaza >10`);
  const icons = cfg.icons;
  let serieIdx = 0;
  const slides = copy.slides.map((s) => {
    let html;
    switch (s.tipo) {
      case 'hero': html = buildHero(s, s.n, total); break;
      case 'narrativa': html = buildNarrativa(s, s.n, total, icons); break;
      case 'tesis': html = buildTesis(s, s.n, total, icons); break;
      case 'serie': html = buildSerie(s, s.n, total, cfg.seriePill); serieIdx++; break;
      case 'stat': html = buildStat(s, s.n, total); break;
      case 'recap': html = buildRecap(s, s.n, total, icons, cfg.recapHeadline); break;
      default: throw new Error(`tipo desconocido: ${s.tipo}`);
    }
    return { id: randomUUID(), html };
  });
  if (serieIdx > icons.length) throw new Error(`${dirName}: ${serieIdx} slides de serie pero ${icons.length} iconos`);
  return { id: randomUUID(), name: cfg.name, aspectRatio: '1:1', slides };
}

async function main() {
  // Optional argument 1|2|3 rebuilds ONE carousel, leaving the QA-adjusted HTML of
  // the other two untouched.
  const only = process.argv[2];
  if (only && !['1', '2', '3'].includes(only)) {
    console.error('Uso: node build_w32_carousels.mjs [1|2|3]');
    process.exit(2);
  }

  const data = JSON.parse(await readFile(CAROUSELS_FILE, 'utf8'));
  const before = data.carousels.length;

  const wanted = only ? [`carousel_ig_0${only}`] : ['carousel_ig_01', 'carousel_ig_02', 'carousel_ig_03'];
  const builtAll = [];
  for (const d of wanted) builtAll.push(await buildCarousel(d));

  // Idempotent: a re-run replaces the W32 entries in place (same id) instead of
  // appending duplicates, so the export ids and the QA report stay valid.
  for (const built of builtAll) {
    const at = data.carousels.findIndex((c) => c.name === built.name);
    if (at >= 0) {
      built.id = data.carousels[at].id;
      data.carousels[at] = built;
      console.log(`  (reemplazado en su sitio: ${built.name})`);
    } else {
      data.carousels.push(built);
    }
  }
  await writeFile(CAROUSELS_FILE, JSON.stringify(data, null, 2), 'utf8');

  // Keep the id registry complete even on a single-carousel rebuild.
  const ids = {};
  for (const [i, d] of ['carousel_ig_01', 'carousel_ig_02', 'carousel_ig_03'].entries()) {
    const nm = CFG[d].name;
    const found = data.carousels.find((c) => c.name === nm);
    if (found) ids[`c${i + 1}`] = found.id;
  }
  await writeFile(IDS_OUT, JSON.stringify(ids, null, 2), 'utf8');

  console.log(`W32 carousels (${before} -> ${data.carousels.length} en carousels.json):`);
  for (const b of builtAll) console.log(' ', b.name, b.id, b.slides.length, 'slides');
}

main().catch((err) => { console.error(err); process.exit(1); });
