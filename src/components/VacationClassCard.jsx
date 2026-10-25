import { useState } from 'react';
import { Sun, Calendar, ChevronDown, Music } from 'lucide-react';
import VacationChallengePlayer from './VacationChallengePlayer.jsx';
import { isVacationChallengeOpen } from './vacationChallengeUtils.js';

const dateLabel = value => value ? new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }).format(new Date(`${value}T12:00:00Z`)) : '';

export default function VacationClassCard({ db, appId, user, student, classData, dateStr, nextTeachingClass, vacationDates, clock, tasks, children, onCalendar, onContract }) {
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const open = isVacationChallengeOpen(dateStr, vacationDates, clock);
  return <div className="rounded-3xl p-5 sm:p-6 shadow-md mb-4 border-2 bg-purple-50 border-purple-200 text-purple-950">
    <p className="text-[10px] font-black uppercase tracking-widest text-purple-700 mb-2">{classData.subject} · {classData.time}h · {classData.sede || classData.centerId || ''}</p>
    <h2 className="text-xl font-black uppercase tracking-tight flex gap-2 items-center"><Sun className="w-6 h-6 text-purple-500"/> Vacaciones</h2>
    <p className="font-bold text-sm mt-2 capitalize">{dateLabel(dateStr)}</p>
    <p className="text-sm leading-relaxed mt-3">Tu clase coincide con las vacaciones previstas en el calendario del centro y recogidas en las <button type="button" onClick={onContract} className="font-bold underline">cláusulas 3 y 9 del contrato de prestación de servicios</button>. Las vacaciones del profesorado están reguladas en el <a href="/docs/convenio-no-reglada.pdf#page=10" target="_blank" rel="noopener noreferrer" className="font-bold underline">artículo 22 del II Convenio colectivo de enseñanza y formación no reglada de Cataluña</a>.</p>
    <p className="text-sm font-bold mt-3 flex items-start gap-2"><Calendar className="w-4 h-4 shrink-0 mt-0.5"/>{nextTeachingClass ? `Tu próxima clase presencial: ${dateLabel(nextTeachingClass.dateStr)} · ${nextTeachingClass.clase?.time || classData.time}h.` : 'Consulta tu próxima sesión en el calendario y en tu horario.'}</p>
    <button type="button" onClick={onCalendar} className="text-xs font-black underline mt-3">Consultar el calendario completo</button>
    {children}
    {tasks}
    <div className="mt-3">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="w-full rounded-2xl px-4 py-3 border border-purple-100 bg-white/70 hover:bg-white flex justify-between items-center gap-3 text-[10px] font-black uppercase tracking-widest">
        <span className="flex items-center gap-2"><Music className="w-4 h-4"/> Tu reto musical de vacaciones</span><span className="flex items-center gap-2 shrink-0">≈ 30 min <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}/></span>
      </button>
      {expanded && <div className="mt-3 p-5 rounded-2xl border border-purple-100 bg-white/70 space-y-3">
        <h3 className="text-lg font-black">¡Hacemos una pausa, pero la música sigue! 🎵</h3>
        <p className="text-sm leading-relaxed">Durante estas vacaciones queremos que puedas seguir aprendiendo y disfrutando de la música con nosotros. Por eso hemos preparado un reto para la fecha de tu clase.</p>
        <h4 className="font-black">Detective del tempo</h4>
        <p className="text-sm leading-relaxed">Escucha, elige tus respuestas y descubre algo nuevo con cada explicación. Es una actividad opcional y autoevaluativa de aproximadamente 30 minutos, sin necesidad de utilizar tu instrumento.</p>
        <p className="text-sm font-bold">Puedes pausarla y retomarla hasta el {dateStr.split('-').reverse().join('/')} a las 23:59, hora de la escuela.</p>
        <button type="button" disabled={!open} onClick={() => setPlaying(true)} className="w-full bg-black text-white rounded-xl py-3 font-black text-sm disabled:opacity-50">{open ? 'Entrar a mi reto musical' : 'El plazo ha terminado'}</button>
      </div>}
    </div>
    {playing && open && <VacationChallengePlayer db={db} appId={appId} user={user} student={student} dateStr={dateStr} classData={classData} vacationDates={vacationDates} onClose={() => setPlaying(false)}/>}
  </div>;
}
