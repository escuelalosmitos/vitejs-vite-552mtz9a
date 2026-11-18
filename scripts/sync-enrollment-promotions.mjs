import { readFile, writeFile } from 'node:fs/promises';
import { createEnrollmentPromotions } from '../src/components/enrollmentPromotions.js';

const path = new URL('../FORMULARIO_PUBLICO_WORDPRESS.html', import.meta.url);
const html = await readFile(path, 'utf8');
const start = '  // BEGIN ENROLLMENT PROMOTIONS ENGINE';
const end = '  // END ENROLLMENT PROMOTIONS ENGINE';
if (!html.includes(start) || !html.includes(end)) throw new Error('No se encuentran las marcas del motor de promociones.');
const next = html.slice(0, html.indexOf(start) + start.length) + '\n  ' + createEnrollmentPromotions.toString() + '\n' + html.slice(html.indexOf(end));
await writeFile(path, next);
console.log('Motor de promociones sincronizado con el formulario autónomo.');
