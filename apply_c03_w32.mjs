/**
 * Export SELECTIVO del carrusel W32 carousel_ig_03 -> final_carousel_NN.png (1080x1080).
 * Aborta si otros carruseles de carousels.json o sus PNG cambian.
 * Uso desde D:\open-carrusel: node apply_c03_w32.mjs
 */
import { exportOne } from './export_w32_selective.mjs';
exportOne('3').catch((err) => { console.error(err.message || err); process.exit(1); });
