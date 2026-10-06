import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Dumbbell, MapPin, Save, Users, X } from 'lucide-react';
import { collection, doc, onSnapshot, query, updateDoc, where, writeBatch } from 'firebase/firestore';

export default function GymusikTeacher({ db, appId, user, date, onSessionsCountChange = () => {}, showNotification = () => {} }) {
  const [sessions, setSessions] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [expandedId, setExpandedId] = useState('');
  const [savingId, setSavingId] = useState('');
  const teacherEmail = String(user?.email || '').trim().toLowerCase();

  useEffect(() => {
    if (!teacherEmail) return undefined;
    const sessionQuery = query(collection(db, 'artifacts', appId, 'gymusikSessions'), where('teacherEmail', '==', teacherEmail));
    const reservationQuery = query(collection(db, 'artifacts', appId, 'gymusikReservations'), where('teacherEmail', '==', teacherEmail));
    const unsubSessions = onSnapshot(sessionQuery, snapshot => setSessions(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), error => console.error('No se pudieron cargar las sesiones Gymusik del profesor:', error));
    const unsubReservations = onSnapshot(reservationQuery, snapshot => setReservations(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), error => console.error('No se pudieron cargar los asistentes Gymusik:', error));
    return () => { unsubSessions(); unsubReservations(); };
  }, [db, appId, teacherEmail]);

  const sessionsForDate = useMemo(() => sessions
    .filter(session => session.date === date && ['published', 'completed'].includes(session.status))
    .sort((left, right) => String(left.time || '').localeCompare(String(right.time || ''))), [sessions, date]);

  useEffect(() => onSessionsCountChange(sessionsForDate.length), [sessionsForDate.length, onSessionsCountChange]);

  const updateAttendance = async (reservation, status) => {
    setSavingId(reservation.id);
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'gymusikReservations', reservation.id), {
        status, attendanceMarkedAt: new Date().toISOString(), attendanceMarkedBy: teacherEmail,
        creditConsumed: ['attended', 'no_show'].includes(status), updatedAt: new Date().toISOString()
      });
    } catch (error) { console.error(error); showNotification({ type: 'error', text: 'No se pudo guardar la asistencia Gymusik.' }); } finally { setSavingId(''); }
  };

  const completeSession = async session => {
    const attendees = reservations.filter(item => item.sessionId === session.id && item.status === 'confirmed');
    if (attendees.length > 0 && !window.confirm(`Quedan ${attendees.length} personas sin marcar. Si completas ahora se registrarán como no asistieron. ¿Continuar?`)) return;
    setSavingId(session.id);
    try {
      const batch = writeBatch(db);
      attendees.forEach(reservation => batch.update(doc(db, 'artifacts', appId, 'gymusikReservations', reservation.id), { status: 'no_show', creditConsumed: true, attendanceMarkedAt: new Date().toISOString(), attendanceMarkedBy: teacherEmail, updatedAt: new Date().toISOString() }));
      batch.update(doc(db, 'artifacts', appId, 'gymusikSessions', session.id), { status: 'completed', completedAt: new Date().toISOString(), completedBy: teacherEmail, updatedAt: new Date().toISOString() });
      const finalReservations = reservations
        .filter(item => item.sessionId === session.id && ['confirmed', 'attended', 'no_show'].includes(item.status))
        .map(item => ({
          id: item.studentId,
          name: item.studentName || 'Usuario',
          email: item.studentEmail || '',
          status: item.status === 'confirmed' ? 'no_show' : item.status
        }));
      batch.set(doc(db, 'artifacts', appId, 'users', user.uid, 'records', `gymusik-${session.id}`), {
        id: `gymusik-${session.id}`,
        classId: `gymusik:${session.id}`,
        gymusikSessionId: session.id,
        isGymusik: true,
        date: session.date,
        time: session.time,
        duration: Math.max(15, Number(session.duration || 60)),
        centerId: session.centerId || '',
        sede: session.sede || '',
        roomId: session.roomId || '',
        sala: session.sala || '',
        teacher: session.teacherName || '',
        subject: `Gymusik · ${session.instrument || 'Música'}`,
        notes: session.content || '',
        students: finalReservations,
        completedAt: new Date().toISOString()
      });
      await batch.commit();
      showNotification({ type: 'success', text: 'Sesión Gymusik completada.' });
    } catch (error) { console.error(error); showNotification({ type: 'error', text: 'No se pudo completar la sesión.' }); } finally { setSavingId(''); }
  };

  if (sessionsForDate.length === 0) return null;

  return (
    <div className="space-y-4 mb-5">
      {sessionsForDate.map(session => {
        const sessionReservations = reservations.filter(item => item.sessionId === session.id && ['confirmed', 'attended', 'no_show'].includes(item.status));
        const waiting = reservations.filter(item => item.sessionId === session.id && item.status === 'waitlist').length;
        const expanded = expandedId === session.id;
        const completed = session.status === 'completed';
        return <article key={session.id} className={`rounded-2xl border-2 overflow-hidden ${completed ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-emerald-200 shadow-sm'}`}>
          <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4"><div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-black ${completed ? 'bg-emerald-200 text-emerald-800' : 'bg-emerald-600 text-white'}`}><span className="text-sm leading-none">{String(session.time || '00:00').split(':')[0]}</span><span className="text-[10px] opacity-70">{String(session.time || '00:00').split(':')[1]}</span></div><div><div className="flex flex-wrap gap-2"><span className="bg-black text-white px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1"><Dumbbell className="w-3 h-3"/> Sesión Gymusik</span><span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">{session.instrument}</span></div><p className="font-black text-slate-900 mt-2">{session.title || 'Entrenamiento dirigido'}</p><p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mt-1 flex flex-wrap gap-2"><span className="flex items-center gap-1"><MapPin className="w-3 h-3"/>{session.sede} · {session.sala}</span><span className="flex items-center gap-1"><Users className="w-3 h-3"/>{sessionReservations.length}/{session.capacity}</span>{waiting > 0 && <span>· {waiting} en espera</span>}</p></div></div>
            <button onClick={() => setExpandedId(expanded ? '' : session.id)} className={`px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest inline-flex items-center justify-center gap-2 ${completed ? 'bg-emerald-200 text-emerald-800' : 'bg-zinc-100 hover:bg-black hover:text-white'}`}>{expanded ? 'Cerrar detalle' : completed ? 'Ver asistencia' : 'Abrir sesión'} {expanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}</button>
          </div>
          {expanded && <div className="border-t border-zinc-200 bg-zinc-50 p-5 space-y-5"><div className="grid md:grid-cols-2 gap-4"><div className="bg-white border border-zinc-200 rounded-2xl p-4"><p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Contenido del entrenamiento</p><p className="text-sm font-medium text-slate-800 whitespace-pre-wrap mt-2">{session.content || 'Sin contenido indicado.'}</p></div><div className="bg-white border border-zinc-200 rounded-2xl p-4"><p className="text-[9px] font-black uppercase tracking-widest text-violet-700">Indicaciones de coordinación</p><p className="text-sm font-medium text-slate-800 whitespace-pre-wrap mt-2">{session.teacherNotes || 'Sin indicaciones adicionales.'}</p></div></div><div><h4 className="font-black uppercase tracking-widest text-xs mb-3">Asistencia</h4>{sessionReservations.length === 0 ? <p className="p-5 bg-white rounded-2xl border border-zinc-200 text-center text-xs font-black uppercase tracking-widest text-zinc-400">No hay participantes confirmados.</p> : <div className="space-y-2">{sessionReservations.map(reservation => <div key={reservation.id} className="bg-white border border-zinc-200 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><p className="font-black text-sm">{reservation.studentName || 'Usuario'}</p><p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{reservation.status === 'attended' ? 'Asistió' : reservation.status === 'no_show' ? 'No asistió' : 'Pendiente'}</p></div>{!completed && <div className="flex gap-2"><button disabled={savingId === reservation.id} onClick={() => updateAttendance(reservation, 'attended')} className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest ${reservation.status === 'attended' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}><Check className="w-3 h-3 inline"/> Asiste</button><button disabled={savingId === reservation.id} onClick={() => updateAttendance(reservation, 'no_show')} className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest ${reservation.status === 'no_show' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-600'}`}><X className="w-3 h-3 inline"/> No viene</button></div>}</div>)}</div>}</div>{!completed && <button disabled={savingId === session.id} onClick={() => completeSession(session)} className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest inline-flex items-center justify-center gap-2"><Save className="w-4 h-4"/> Completar sesión y guardar lista</button>}</div>}
        </article>;
      })}
    </div>
  );
}
