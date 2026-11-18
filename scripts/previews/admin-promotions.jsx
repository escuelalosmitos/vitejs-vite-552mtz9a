import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import EnrollmentPromotionsAdmin from '../../src/components/EnrollmentPromotionsAdmin.jsx';

const categories = ['Economía', 'Promociones', 'Instrumentos', 'Sedes y espacios', 'Calendario', 'Retos musicales', 'Profesores', 'Hora muerta', 'Normativa docente', 'Contrato', 'Importación'];
const classes = [
  { selectionId: 'demo-reus-guitarra', escuela: 'Reus', instrumento: 'Guitarra', horario: 'Lunes a las 19:00h', dayNum: 1, timeStr: '19:00', maxCap: 4, plazas: 2, precio: '60 €/mes', url: 'https://example.com/normal', inicio: '2026-12-07' },
  { selectionId: 'demo-tarragona-canto', escuela: 'Tarragona', instrumento: 'Canto', horario: 'Martes a las 18:00h', dayNum: 2, timeStr: '18:00', maxCap: 8, plazas: 3, precio: '45 €/mes', url: 'https://example.com/normal', inicio: '2026-12-01' },
  { selectionId: 'demo-reus-teclado', escuela: 'Reus', instrumento: 'Teclado', horario: 'Miércoles a las 17:00h', dayNum: 3, timeStr: '17:00', maxCap: 1, plazas: 1, precio: '120 €/mes', url: 'https://example.com/normal', inicio: '2026-12-02' },
  { selectionId: 'demo-reus-teclado-grupo', escuela: 'Reus', instrumento: 'Teclado', horario: 'Miércoles a las 18:00h', dayNum: 3, timeStr: '18:00', maxCap: 5, plazas: 2, precio: '55 €/mes', url: 'https://example.com/normal', inicio: '2026-12-02' },
  { selectionId: 'demo-tarragona-bateria', escuela: 'Tarragona', instrumento: 'Batería', horario: 'Jueves a las 18:00h', dayNum: 4, timeStr: '18:00', maxCap: 3, plazas: 1, precio: '60 €/mes', url: 'https://example.com/normal', inicio: '2026-12-03' }
];

export default function Preview() {
  const [saved, setSaved] = useState(false);
  return <>
    <div className="bg-zinc-900 text-white px-5 py-4 flex flex-wrap justify-between gap-3 items-center"><strong className="text-sm tracking-widest">LOS MITOS · ADMINISTRACIÓN</strong><span className="text-xs">Vista previa · Datos ficticios</span></div>
    <main className="admin-main max-w-7xl mx-auto px-4 py-7 sm:px-6" data-admin-section="settings">
      <header className="mb-6"><h1 className="text-2xl font-black text-slate-800">Configuración global</h1><p className="text-sm text-zinc-500 mt-2">Así se presenta el apartado de promociones. Puedes editar los campos, probar los filtros y añadir campañas.</p></header>
      <div className="mb-5 p-4 rounded-xl border border-blue-200 bg-blue-50 text-blue-950 text-sm" role="status">Demostración independiente: guardar solo conserva los cambios mientras esta página siga abierta. No modifica la plataforma ni activa ofertas reales. Fecha de prueba: 18 de noviembre de 2026.</div>
      {saved && <p role="status" className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-950 text-sm">Cambios guardados únicamente en esta vista previa. No se han publicado.</p>}
      <div className="admin-settings-workspace">
        <nav className="admin-settings-nav" aria-label="Categorías de configuración">{categories.map(name => <button type="button" key={name} aria-pressed={name === 'Promociones'} disabled={name !== 'Promociones'} className={name === 'Promociones' ? '' : 'opacity-50'}>{name}</button>)}</nav>
        <div className="admin-settings-content"><EnrollmentPromotionsAdmin classes={classes} centers={[{ name: 'Tarragona' }, { name: 'Reus' }]} instruments={['Guitarra', 'Canto', 'Teclado', 'Batería', 'Violín', 'Armónica']} onSave={async () => { setSaved(true); }}/></div>
      </div>
    </main>
  </>;
}

createRoot(document.getElementById('admin-preview-root')).render(<Preview/>);
