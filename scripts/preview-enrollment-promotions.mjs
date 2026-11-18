import { readFile, writeFile } from 'node:fs/promises';
import { blackFriday2026Draft } from '../src/components/enrollmentPromotions.js';

// Demostración autónoma: no usa Firebase, localStorage real ni navegación a Tadosi.
const root = new URL('../', import.meta.url);
const template = await readFile(new URL('FORMULARIO_PUBLICO_WORDPRESS.html', root), 'utf8');
const key = 'mitos_form_anual_publico_sel_v3';
const payload = {
  campaigns: [{ ...blackFriday2026Draft(), status: 'enabled' }],
  classes: [
    { selectionId: 'demo-reus-guitarra', escuela: 'Reus', instrumento: 'Guitarra', horario: 'Lunes a las 19:00h', dayNum: 1, timeStr: '19:00', maxCap: 4, plazas: 2, precio: '60 €/mes', url: 'https://example.com/inscripcion-habitual-reus', inicio: '2026-12-07' },
    { selectionId: 'demo-tarragona-canto', escuela: 'Tarragona', instrumento: 'Canto', horario: 'Martes a las 18:00h', dayNum: 2, timeStr: '18:00', maxCap: 8, plazas: 3, precio: '45 €/mes', url: 'https://example.com/inscripcion-habitual-tarragona', inicio: '2026-12-01' },
    { selectionId: 'demo-reus-particular', escuela: 'Reus', instrumento: 'Teclado', horario: 'Miércoles a las 17:00h', dayNum: 3, timeStr: '17:00', maxCap: 1, plazas: 1, precio: '120 €/mes', url: 'https://example.com/inscripcion-particular', inicio: '2026-12-02' },
    { selectionId: 'demo-reus-teclado-grupo', escuela: 'Reus', instrumento: 'Teclado', horario: 'Miércoles a las 18:00h', dayNum: 3, timeStr: '18:00', maxCap: 5, plazas: 2, precio: '55 €/mes', url: 'https://example.com/inscripcion-teclado', inicio: '2026-12-02' },
    { selectionId: 'demo-tarragona-bateria', escuela: 'Tarragona', instrumento: 'Batería', horario: 'Jueves a las 18:00h', dayNum: 4, timeStr: '18:00', maxCap: 3, plazas: 1, precio: '60 €/mes', url: 'https://example.com/inscripcion-bateria', inicio: '2026-12-03' }
  ]
};
const setup = `
  const PreviewDate = Date;
  globalThis.Date = class extends PreviewDate {
    constructor(...args) { super(...(args.length ? args : ['2026-11-24T12:00:00Z'])); }
    static now() { return PreviewDate.parse('2026-11-24T12:00:00Z'); }
  };
  const previewValues = new Map([[${JSON.stringify(key)}, JSON.stringify({ escuela: 'Reus', instrumento: 'Guitarra', selectionId: 'demo-reus-guitarra' })]]);
  const previewStorage = { getItem: key => previewValues.get(key) || null, setItem: (key, value) => previewValues.set(key, value), removeItem: key => previewValues.delete(key) };
  const initializeApp = () => ({}), getFirestore = () => ({}), doc = () => ({});
  const onSnapshot = (_ref, callback) => { queueMicrotask(() => callback({ exists: () => true, data: () => (${JSON.stringify(payload)}) })); return () => {}; };
`;
const redirect = 'window.location.href = destination;';
if (!template.includes(redirect)) throw new Error('Revisar la navegación antes de generar la demostración.');
let demo = template.replace(/^[ \t]*import \{[^}]+\} from "https:\/\/www\.gstatic\.com\/firebasejs\/[^\n]+\n/gm, '')
  .replace(/const firebaseConfig = \{[\s\S]*?\n  \};/, 'const firebaseConfig = {};')
  .replace('<script type="module">', `<script type="module">\n${setup}`)
  .replaceAll('localStorage.', 'previewStorage.')
  .replace(redirect, `const result = document.getElementById('preview-result'); result.hidden = false; result.textContent = 'Simulación completada. Destino que se usaría: ' + destination + '. En esta demostración no se abre Tadosi ni se envía ninguna inscripción.'; result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });`);
if (/import\s+.*from\s+['"]https:/.test(demo) || demo.includes(redirect)) throw new Error('La demostración conserva conexiones externas.');
demo = `<!doctype html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vista previa · Promociones Los Mitos</title>
<style>body{margin:0;padding:20px 12px;background:#f6f8fb;font-family:system-ui,sans-serif}.preview-intro{max-width:560px;margin:auto;color:#374151}.preview-intro h1{font-size:20px;color:#111827}.preview-intro p{font-size:14px;line-height:1.6}#preview-result{max-width:530px;margin:20px auto;padding:15px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;color:#065f46;overflow-wrap:anywhere;font-size:14px}</style></head><body>
<header class="preview-intro"><h1>Vista previa de promociones</h1><p>Demostración con turnos ficticios y fecha simulada: <strong>24 de noviembre de 2026</strong>. Desactiva y vuelve a activar la promoción para comparar el precio, el inicio y las condiciones.</p><p>Esta página no envía inscripciones ni realiza cobros. El botón final muestra el enlace que se usaría.</p></header>
${demo}
<p id="preview-result" role="status" hidden></p>
</body></html>`;
await writeFile(new URL('VISTA_PREVIA_PROMOCIONES.html', root), demo);
console.log('Vista previa autónoma: VISTA_PREVIA_PROMOCIONES.html');
