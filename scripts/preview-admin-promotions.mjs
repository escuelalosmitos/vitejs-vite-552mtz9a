import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const root = new URL('../', import.meta.url);
const entry = fileURLToPath(new URL('scripts/previews/admin-promotions.jsx', root));
const result = await build({
  configFile: false, plugins: [react()], logLevel: 'warn',
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: { write: false, minify: true, lib: { entry, name: 'MitosAdminPreview', formats: ['iife'] } }
});
const outputs = (Array.isArray(result) ? result : [result]).flatMap(item => item.output || []);
const script = outputs.filter(item => item.type === 'chunk').map(item => item.code).join('\n');
if (!script || /firebase|firestore|script\.google\.com/i.test(script)) throw new Error('La vista previa incluye dependencias externas de la plataforma.');
const styles = await readFile(new URL('src/components/AdminLayout.css', root), 'utf8');
const tailwindPath = new URL('.revision-deploy.local/tailwind-preview.js', root);
const tailwind = await readFile(tailwindPath, 'utf8').catch(async error => {
  if (error.code !== 'ENOENT') throw error;
  const response = await fetch('https://cdn.tailwindcss.com');
  if (!response.ok) throw new Error(`No se pudieron obtener los estilos: HTTP ${response.status}`);
  const code = await response.text();
  await mkdir(new URL('.revision-deploy.local/', root), { recursive: true });
  await writeFile(tailwindPath, code);
  return code;
});
const safeScript = text => text.replace(/<\/script/gi, '<\\/script');
const html = `<!doctype html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Configuración de promociones · Los Mitos</title>
<script>${safeScript(tailwind)}</script>
<style>body{margin:0;background:#f8fafc;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#18181b}button,input,textarea,select{font:inherit}input[type=checkbox]{accent-color:#18181b}button:disabled{cursor:default}${styles}</style>
</head><body><div id="admin-preview-root"></div>
<script>const PreviewDate=Date;globalThis.Date=class extends PreviewDate{constructor(...args){super(...(args.length?args:['2026-11-18T12:00:00Z']));}static now(){return PreviewDate.parse('2026-11-18T12:00:00Z');}};</script>
<script>${safeScript(script)}</script></body></html>`;
await writeFile(new URL('VISTA_PREVIA_ADMIN_PROMOCIONES.html', root), html);
console.log('Vista previa del componente real: VISTA_PREVIA_ADMIN_PROMOCIONES.html');
