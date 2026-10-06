import { useEffect, useMemo, useState } from 'react';
import { Calendar, Download, Dumbbell, MapPin, Users, X } from 'lucide-react';
import { collection, doc, onSnapshot, query, runTransaction, setDoc, where } from 'firebase/firestore';
import {
  buildGymusikReservationId, canCancelGymusikReservationWithCredit,
  getGymusikCreditsRemaining, getGymusikMonth,
  normalizeGymusikConfig, sortGymusikSessions
} from './gymusikUtils';

const nowIso = () => new Date().toISOString();
const todayLocal = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
};
const displayDate = value => String(value || '').slice(0, 10).split('-').reverse().join('/');
const displayWeekday = value => {
  const date = new Date(`${String(value || '').slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(date);
  return weekday.charAt(0).toUpperCase() + weekday.slice(1);
};
const escapeIcs = value => String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const toIcsDate = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export default function GymusikStudent({ db, appId, profile, instruments = [] }) {
  const [config, setConfig] = useState(normalizeGymusikConfig());
  const [member, setMember] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  const [openGroupId, setOpenGroupId] = useState('');
  const [selectedSessionIds, setSelectedSessionIds] = useState([]);
  const [interestInstruments, setInterestInstruments] = useState([]);
  const [preenrollmentDialogOpen, setPreenrollmentDialogOpen] = useState(false);

  useEffect(() => {
    if (!profile?.id) return undefined;
    let ready = 0;
    const markReady = () => { ready += 1; if (ready >= 4) setLoading(false); };
    const studentEmail = String(profile.email || '').trim().toLowerCase();
    const unsubs = [
      onSnapshot(doc(db, 'artifacts', appId, 'gymusikSettings', 'main'), snapshot => { setConfig(normalizeGymusikConfig(snapshot.exists() ? snapshot.data() : {})); markReady(); }, () => markReady()),
      onSnapshot(doc(db, 'artifacts', appId, 'gymusikMembers', String(profile.id)), snapshot => { setMember(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null); markReady(); }, () => markReady()),
      onSnapshot(collection(db, 'artifacts', appId, 'gymusikSessions'), snapshot => { setSessions(sortGymusikSessions(snapshot.docs.map(item => ({ id: item.id, ...item.data() })))); markReady(); }, () => markReady()),
      onSnapshot(query(collection(db, 'artifacts', appId, 'gymusikReservations'), where('studentEmail', '==', studentEmail)), snapshot => { setReservations(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); markReady(); }, () => markReady())
    ];
    return () => unsubs.forEach(unsub => unsub());
  }, [db, appId, profile?.id, profile?.email]);

  const currentMonth = getGymusikMonth(todayLocal());
  const upcomingSessions = useMemo(() => sessions.filter(session => (
    session.status === 'published'
    && session.date >= todayLocal()
    && getGymusikMonth(session.date) === currentMonth
  )), [sessions, currentMonth]);

  const ownReservationBySession = useMemo(() => new Map(reservations.map(reservation => [reservation.sessionId, reservation])), [reservations]);
  const sessionGroups = useMemo(() => {
    const grouped = new Map();
    upcomingSessions.forEach(session => {
      const groupId = session.seriesId || `single_${session.id}`;
      if (!grouped.has(groupId)) grouped.set(groupId, { id: groupId, isSeries: Boolean(session.seriesId), sessions: [] });
      grouped.get(groupId).sessions.push(session);
    });
    return [...grouped.values()]
      .map(group => ({ ...group, sessions: sortGymusikSessions(group.sessions) }))
      .sort((left, right) => String(left.sessions[0]?.date || '').localeCompare(String(right.sessions[0]?.date || '')));
  }, [upcomingSessions]);
  const openGroup = useMemo(() => sessionGroups.find(group => group.id === openGroupId) || null, [sessionGroups, openGroupId]);
  const selectedSessions = useMemo(() => {
    if (!openGroup) return [];
    const selected = new Set(selectedSessionIds);
    return openGroup.sessions.filter(session => selected.has(session.id));
  }, [openGroup, selectedSessionIds]);
  const currentCredits = getGymusikCreditsRemaining({ reservations, studentId: profile?.id, month: currentMonth, monthlyCredits: config.monthlyCredits });
  const formationCount = Math.max(0, Number(config.formationCount || 0));
  const missingPeople = Math.max(0, config.minimumMembers - formationCount);
  const isActiveMember = member?.status === 'active' && profile?.hasGymusik === true;
  const isCurrentStudent = member ? member.isCurrentStudent !== false : Array.isArray(profile?.classes) && profile.classes.length > 0;
  const memberPrice = isCurrentStudent ? config.studentPrice : config.externalPrice;
  const availableInstruments = Array.isArray(instruments) && instruments.length > 0
    ? [...new Set(instruments.map(item => String(item || '').trim()).filter(Boolean))]
    : config.instruments;
  const hasExistingMembership = Boolean(
    profile?.hasGymusik === true
    || (member && member.status !== 'cancelled')
  );
  const shouldShowGymusik = config.preenrollmentOpen === true || hasExistingMembership;

  const notify = text => { setNotice(text); window.setTimeout(() => setNotice(''), 4000); };
  const toggleInterestInstrument = instrument => setInterestInstruments(current => (
    current.includes(instrument) ? current.filter(item => item !== instrument) : [...current, instrument]
  ));
  const openSeriesDialog = groupId => { setOpenGroupId(groupId); setSelectedSessionIds([]); };
  const closeSeriesDialog = () => {
    if (busyId === 'series-reserve') return;
    setOpenGroupId('');
    setSelectedSessionIds([]);
  };

  const requestPreenrollment = async () => {
    if (config.preenrollmentOpen !== true) {
      alert('Las preinscripciones de Gymusik están cerradas en este momento.');
      return;
    }
    setBusyId('preenroll');
    try {
      await setDoc(doc(db, 'artifacts', appId, 'gymusikMembers', String(profile.id)), {
        studentId: String(profile.id), studentName: profile.name || '', studentEmail: String(profile.email || '').trim().toLowerCase(),
        instrument: interestInstruments.join(', ') || 'Acceso libre', status: 'preenrolled', isCurrentStudent: Array.isArray(profile.classes) && profile.classes.length > 0,
        createdAt: nowIso(), updatedAt: nowIso(), createdBy: 'student'
      }, { merge: true });
      setPreenrollmentDialogOpen(false);
      notify('Preinscripción enviada. No se realizará ningún cobro hasta que Administración active el servicio.');
    } catch (error) { console.error(error); alert(`No se pudo enviar la preinscripción: ${error.message}`); } finally { setBusyId(''); }
  };

  const createSessionReservation = async session => {
    const month = getGymusikMonth(session.date);
    const reservationId = buildGymusikReservationId(session.id, profile.id);
    const sessionRef = doc(db, 'artifacts', appId, 'gymusikSessions', session.id);
    const reservationRef = doc(db, 'artifacts', appId, 'gymusikReservations', reservationId);
    let finalStatus = 'confirmed';
    await runTransaction(db, async transaction => {
      const [sessionSnapshot, reservationSnapshot] = await Promise.all([transaction.get(sessionRef), transaction.get(reservationRef)]);
      if (!sessionSnapshot.exists()) throw new Error('La sesión ya no está disponible.');
      const liveSession = sessionSnapshot.data();
      if (liveSession.status !== 'published') throw new Error('La sesión ya no admite reservas.');
      const previous = reservationSnapshot.exists() ? reservationSnapshot.data() : null;
      if (previous && ['confirmed', 'waitlist', 'attended', 'no_show'].includes(previous.status)) throw new Error('Ya tienes una reserva para esta sesión.');
      const reservedCount = Math.max(0, Number(liveSession.reservedCount || 0));
      const waitlistCount = Math.max(0, Number(liveSession.waitlistCount || 0));
      const capacity = Math.max(1, Number(liveSession.capacity || 1));
      finalStatus = reservedCount < capacity ? 'confirmed' : 'waitlist';
      transaction.set(reservationRef, {
        sessionId: session.id, sessionDate: liveSession.date, sessionTime: liveSession.time,
        instrument: liveSession.instrument, centerId: liveSession.centerId || '', sede: liveSession.sede || '', roomId: liveSession.roomId || '', sala: liveSession.sala || '',
        teacherName: liveSession.teacherName || '', teacherEmail: String(liveSession.teacherEmail || '').trim().toLowerCase(),
        studentId: String(profile.id), studentName: profile.name || '', studentEmail: String(profile.email || '').trim().toLowerCase(),
        status: finalStatus, creditMonth: month, creditConsumed: false,
        createdAt: previous?.createdAt || nowIso(), updatedAt: nowIso(), createdBy: 'student'
      }, { merge: true });
      transaction.update(sessionRef, {
        reservedCount: reservedCount + (finalStatus === 'confirmed' ? 1 : 0),
        waitlistCount: waitlistCount + (finalStatus === 'waitlist' ? 1 : 0),
        lastReservationId: reservationId, updatedAt: nowIso()
      });
    });
    return finalStatus;
  };

  const reserveSession = async session => {
    if (!isActiveMember || !config.active) return;
    const month = getGymusikMonth(session.date);
    const creditsRemaining = getGymusikCreditsRemaining({ reservations, studentId: profile.id, month, monthlyCredits: config.monthlyCredits });
    if (creditsRemaining < 1) return alert(`Ya has comprometido tus ${config.monthlyCredits} créditos de ${month}.`);
    setBusyId(session.id);
    try {
      const finalStatus = await createSessionReservation(session);
      notify(finalStatus === 'confirmed' ? 'Reserva Gymusik confirmada.' : 'La sesión está completa: te hemos añadido a la lista de espera.');
    } catch (error) { console.error(error); alert(error.message || 'No se pudo completar la reserva.'); } finally { setBusyId(''); }
  };

  const toggleSelectedSession = session => {
    const selected = selectedSessionIds.includes(session.id);
    if (selected) {
      setSelectedSessionIds(current => current.filter(id => id !== session.id));
      return;
    }
    const month = getGymusikMonth(session.date);
    const remaining = getGymusikCreditsRemaining({ reservations, studentId: profile.id, month, monthlyCredits: config.monthlyCredits });
    const selectedInMonth = selectedSessions.filter(item => getGymusikMonth(item.date) === month).length;
    if (selectedInMonth >= remaining) {
      alert(`No te quedan más créditos disponibles para ${month}.`);
      return;
    }
    setSelectedSessionIds(current => [...current, session.id]);
  };

  const reserveSelectedSessions = async () => {
    if (selectedSessions.length === 0 || !isActiveMember || !config.active) return;
    const selectedByMonth = selectedSessions.reduce((counts, session) => {
      const month = getGymusikMonth(session.date);
      counts[month] = (counts[month] || 0) + 1;
      return counts;
    }, {});
    const unavailableMonth = Object.entries(selectedByMonth).find(([month, count]) => count > getGymusikCreditsRemaining({ reservations, studentId: profile.id, month, monthlyCredits: config.monthlyCredits }));
    if (unavailableMonth) return alert(`No tienes ${unavailableMonth[1]} créditos disponibles para ${unavailableMonth[0]}.`);

    setBusyId('series-reserve');
    const results = [];
    const errors = [];
    for (const session of selectedSessions) {
      try {
        results.push(await createSessionReservation(session));
      } catch (error) {
        console.error(error);
        errors.push(`${displayDate(session.date)}: ${error.message || 'no se pudo reservar'}`);
      }
    }
    setBusyId('');
    setSelectedSessionIds([]);

    const confirmed = results.filter(status => status === 'confirmed').length;
    const waitlisted = results.filter(status => status === 'waitlist').length;
    if (results.length > 0) notify(`${confirmed} reserva(s) confirmada(s)${waitlisted > 0 ? ` y ${waitlisted} en lista de espera` : ''}.`);
    if (errors.length > 0) alert(`Algunas fechas no se pudieron reservar:\n\n${errors.join('\n')}`);
    if (errors.length === 0) closeSeriesDialog();
  };

  const cancelReservation = async (session, reservation) => {
    if (!reservation || !['confirmed', 'waitlist'].includes(reservation.status)) return;
    const returnsCredit = reservation.status === 'waitlist' || canCancelGymusikReservationWithCredit({ session, cancellationHours: config.cancellationHours });
    const warning = returnsCredit ? 'Recuperarás el crédito.' : `Faltan menos de ${config.cancellationHours} horas: la cancelación consumirá el crédito.`;
    if (!window.confirm(`¿Cancelar tu plaza?\n\n${warning}`)) return;
    const sessionRef = doc(db, 'artifacts', appId, 'gymusikSessions', session.id);
    const reservationRef = doc(db, 'artifacts', appId, 'gymusikReservations', reservation.id);
    setBusyId(session.id);
    try {
      await runTransaction(db, async transaction => {
        const [sessionSnapshot, reservationSnapshot] = await Promise.all([transaction.get(sessionRef), transaction.get(reservationRef)]);
        if (!sessionSnapshot.exists() || !reservationSnapshot.exists()) return;
        const liveSession = sessionSnapshot.data(); const liveReservation = reservationSnapshot.data();
        if (!['confirmed', 'waitlist'].includes(liveReservation.status)) return;
        transaction.update(reservationRef, { status: 'cancelled', cancelledAt: nowIso(), cancelledBy: 'student', creditConsumed: !returnsCredit, creditReturned: returnsCredit, updatedAt: nowIso() });
        transaction.update(sessionRef, {
          reservedCount: Math.max(0, Number(liveSession.reservedCount || 0) - (liveReservation.status === 'confirmed' ? 1 : 0)),
          waitlistCount: Math.max(0, Number(liveSession.waitlistCount || 0) - (liveReservation.status === 'waitlist' ? 1 : 0)),
          promotionPending: liveReservation.status === 'confirmed' && Number(liveSession.waitlistCount || 0) > 0,
          lastReservationId: reservation.id, updatedAt: nowIso()
        });
      });
      notify(returnsCredit ? 'Reserva cancelada y crédito recuperado.' : 'Reserva cancelada fuera de plazo; el crédito queda consumido.');
    } catch (error) { console.error(error); alert(error.message || 'No se pudo cancelar.'); } finally { setBusyId(''); }
  };

  const downloadIcs = session => {
    const start = new Date(`${session.date}T${session.time || '00:00'}:00`);
    const end = new Date(start.getTime() + Math.max(15, Number(session.duration || 60)) * 60000);
    const content = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Escuela Los Mitos//Gymusik//ES','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:gymusik-${session.id}@escuelalosmitos.com`,`DTSTAMP:${toIcsDate(new Date())}`,`DTSTART:${toIcsDate(start)}`,`DTEND:${toIcsDate(end)}`,`SUMMARY:${escapeIcs(`Gymusik · ${session.instrument}`)}`,`LOCATION:${escapeIcs(`${session.sede} · ${session.sala}`)}`,`DESCRIPTION:${escapeIcs(session.content || 'Entrenamiento musical dirigido')}`,'END:VEVENT','END:VCALENDAR'].join('\r\n');
    const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `Gymusik_${session.date}_${String(session.time || '').replace(':', '')}.ics`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(link.href);
  };

  const renderStandaloneSession = session => {
    const reservation = ownReservationBySession.get(session.id);
    const active = reservation && ['confirmed', 'waitlist'].includes(reservation.status);
    const full = Number(session.reservedCount || 0) >= Number(session.capacity || 1);
    const creditsRemaining = getGymusikCreditsRemaining({ reservations, studentId: profile.id, month: getGymusikMonth(session.date), monthlyCredits: config.monthlyCredits });
    return <div key={session.id} className="border border-zinc-200 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><span className="bg-black text-white px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">{session.instrument}</span><span className="bg-violet-100 text-violet-800 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">{session.level || 'Todos los niveles'}</span>{reservation?.status === 'confirmed' && <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">Reserva confirmada</span>}{reservation?.status === 'waitlist' && <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">En lista de espera</span>}</div><p className="font-black mt-2">{session.title}</p><p className="text-sm font-medium text-zinc-500 mt-1">{session.content}</p>{(session.material || session.requirements) && <p className="text-xs font-bold text-zinc-400 mt-2">{session.material ? `Material: ${session.material}` : ''}{session.material && session.requirements ? ' · ' : ''}{session.requirements ? `Requisitos: ${session.requirements}` : ''}</p>}<div className="flex flex-wrap gap-3 mt-3 text-[10px] font-black uppercase tracking-widest text-zinc-500"><span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5"/>{displayDate(session.date)} · {session.time}h</span><span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5"/>{session.sede} · {session.sala}</span><span className="flex items-center gap-1"><Users className="w-3.5 h-3.5"/>{session.reservedCount || 0}/{session.capacity}</span></div></div><div className="flex flex-wrap gap-2 lg:justify-end">{reservation?.status === 'confirmed' && <button onClick={() => downloadIcs(session)} className="p-3 bg-zinc-100 text-zinc-700 rounded-xl" title="Descargar calendario"><Download className="w-4 h-4"/></button>}{active ? <button disabled={busyId === session.id} onClick={() => cancelReservation(session, reservation)} className="px-4 py-3 bg-red-50 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50">Cancelar</button> : <button disabled={busyId === session.id || creditsRemaining < 1} onClick={() => reserveSession(session)} className="px-5 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40">{full ? 'Apuntarme a espera' : 'Reservar'}</button>}</div></div>;
  };

  const renderSessionGroup = group => {
    if (!group.isSeries) return renderStandaloneSession(group.sessions[0]);
    const first = group.sessions[0];
    const last = group.sessions[group.sessions.length - 1];
    const activeReservations = group.sessions.filter(session => ['confirmed', 'waitlist'].includes(ownReservationBySession.get(session.id)?.status)).length;
    return <div key={group.id} className="border border-violet-200 bg-gradient-to-br from-white to-violet-50 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5"><div><div className="flex flex-wrap items-center gap-2"><span className="bg-black text-white px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">{first.instrument}</span><span className="bg-violet-100 text-violet-800 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">{first.level || 'Todos los niveles'}</span><span className="bg-violet-100 text-violet-800 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">Serie semanal · {group.sessions.length} fechas</span>{activeReservations > 0 && <span className="bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">{activeReservations} reservada(s)</span>}</div><p className="font-black text-lg mt-3">{first.title}</p><p className="text-sm font-medium text-zinc-500 mt-1">{first.content}</p>{(first.material || first.requirements) && <p className="text-xs font-bold text-zinc-400 mt-2">{first.material ? `Material: ${first.material}` : ''}{first.material && first.requirements ? ' · ' : ''}{first.requirements ? `Requisitos: ${first.requirements}` : ''}</p>}<div className="flex flex-wrap gap-3 mt-3 text-[10px] font-black uppercase tracking-widest text-zinc-500"><span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5"/>Cada {displayWeekday(first.date).toLowerCase()} · {first.time}h · {displayDate(first.date)}–{displayDate(last.date)}</span><span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5"/>{first.sede} · {first.sala}</span></div></div><button onClick={() => openSeriesDialog(group.id)} className="shrink-0 px-5 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">{activeReservations > 0 ? 'Ver y gestionar fechas' : 'Elegir fechas'}</button></div>;
  };

  if (!loading && !shouldShowGymusik) return null;

  return (
    <div className="md:col-span-2 bg-gradient-to-b from-emerald-50/50 via-white to-white rounded-3xl shadow-sm hover:shadow-md transition-shadow duration-300 border-2 border-emerald-200 overflow-hidden relative">
      {notice && <div className="m-5 mb-0 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-bold leading-relaxed">{notice}</div>}
      <div className="p-6 bg-zinc-950 text-white relative overflow-hidden border-b-4 border-emerald-500"><Dumbbell className="w-28 h-28 absolute -right-5 -bottom-8 text-zinc-800 rotate-12"/><div className="relative z-10 flex items-start justify-between gap-4"><div><p className="text-[9px] font-black uppercase tracking-[.25em] text-emerald-400">Entrena. Repite. Corrige. Avanza.</p><h3 className="text-3xl font-black uppercase tracking-tight mt-1">Gymusik</h3><p className="text-sm font-medium text-zinc-300 mt-2 max-w-xl">Entrena cambios, ritmos y recursos concretos mediante práctica repetitiva, corrección y acompañamiento.</p></div>{isActiveMember && <span className="shrink-0 bg-emerald-400 text-emerald-950 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest">Suscripción activa</span>}</div></div>
      <div className="p-6">
        {loading ? <p className="py-8 text-center text-xs font-black uppercase tracking-widest text-zinc-400">Cargando Gymusik…</p> : !member ? (
          <div className="grid md:grid-cols-[1fr_auto] gap-5 items-center"><div><p className="font-black text-lg">Gymusik está en formación</p><p className="text-sm font-medium text-zinc-500 mt-2">La cuota será de <b>{memberPrice} €/mes</b> e incluirá {config.monthlyCredits} sesiones de cualquier instrumento. No se realizará ningún cobro hasta alcanzar el mínimo y confirmar la apertura.</p>{missingPeople > 0 && <p className="text-xs font-black uppercase tracking-widest text-amber-700 mt-3">Faltan {missingPeople} persona(s) para el mínimo</p>}</div><button onClick={() => setPreenrollmentDialogOpen(true)} className="px-6 py-4 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-colors">Preinscribirme</button></div>
        ) : member.status === 'preenrolled' ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5"><p className="font-black text-amber-950">Estás en la preinscripción general de Gymusik</p><p className="text-sm font-medium text-amber-800 mt-2">Podrás utilizar tus créditos en cualquier instrumento. No se realizará ningún cobro hasta que Administración confirme que el servicio puede comenzar.{missingPeople > 0 ? ` Faltan ${missingPeople} persona(s) para alcanzar el mínimo.` : ' Ya se ha alcanzado el mínimo y la escuela está preparando la apertura.'}</p>{member.instrument && member.instrument !== 'Acceso libre' && <p className="text-xs font-bold text-amber-700 mt-3">Intereses indicados: {member.instrument}</p>}</div>
        ) : member.status === 'cancelled' ? <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-5 text-sm font-bold text-zinc-500">Tu suscripción a Gymusik no está activa. Contacta con Administración si quieres volver.</div> : member.status === 'paused' ? <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-sm font-bold text-blue-800">Tu suscripción a Gymusik está en pausa. Mientras dure la pausa no podrás reservar sesiones. Contacta con Administración para reactivarla.</div> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6"><div className="bg-emerald-50 p-4 rounded-2xl"><span className="block text-2xl font-black text-emerald-800">{currentCredits}</span><span className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Créditos este mes</span></div><div className="bg-zinc-50 p-4 rounded-2xl"><span className="block text-lg font-black">Todos</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Instrumentos</span></div><div className="bg-zinc-50 p-4 rounded-2xl"><span className="block text-lg font-black">{config.cancellationHours} h</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Cancelación</span></div><div className="bg-zinc-50 p-4 rounded-2xl"><span className="block text-lg font-black">{memberPrice} €</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Cuota mensual</span></div></div>
            {!config.active ? <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl text-sm font-bold text-amber-800">La escuela todavía no ha activado el calendario de Gymusik.</div> : upcomingSessions.length === 0 ? <div className="p-7 bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-2xl text-center text-xs font-black uppercase tracking-widest text-zinc-400">No hay más sesiones publicadas para este mes.</div> : <div className="space-y-3">{sessionGroups.map(renderSessionGroup)}</div>}
            <p className="text-[10px] font-bold text-zinc-400 mt-5 leading-relaxed">Los créditos caducan al terminar su mes. Cancelando con al menos {config.cancellationHours} horas recuperas el crédito; una cancelación posterior o una ausencia lo consume.</p>
          </>
        )}
      </div>
      {preenrollmentDialogOpen && !member && <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center" onMouseDown={event => { if (event.target === event.currentTarget && busyId !== 'preenroll') setPreenrollmentDialogOpen(false); }}>
        <div className="bg-white w-full max-w-xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
          <div className="p-5 sm:p-6 bg-zinc-950 text-white border-b-4 border-emerald-500 flex items-start justify-between gap-4">
            <div><p className="text-[9px] font-black uppercase tracking-[.25em] text-emerald-400">Un último paso</p><h4 className="text-xl font-black mt-1">Completa tu preinscripción</h4><p className="text-sm font-medium text-zinc-300 mt-2">Indícanos qué sesiones te interesaría encontrar primero.</p></div>
            <button type="button" disabled={busyId === 'preenroll'} onClick={() => setPreenrollmentDialogOpen(false)} className="p-2 bg-white/10 rounded-full disabled:opacity-40" aria-label="Cerrar"><X className="w-5 h-5"/></button>
          </div>
          <div className="p-5 sm:p-6 overflow-y-auto">
            <p className="text-sm font-black text-slate-900">¿Qué instrumentos te interesan?</p>
            <p className="text-xs font-medium text-zinc-500 mt-1">Es opcional, puedes elegir varios y no limitará las sesiones que podrás reservar.</p>
            <div className="flex flex-wrap gap-2 mt-4">
              <button type="button" disabled={busyId === 'preenroll'} onClick={() => setInterestInstruments([])} className={`px-3 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest disabled:opacity-50 ${interestInstruments.length === 0 ? 'bg-black text-white border-black' : 'bg-white text-zinc-500 border-zinc-200'}`}>Cualquier instrumento</button>
              {availableInstruments.map(instrument => <button key={instrument} type="button" disabled={busyId === 'preenroll'} onClick={() => toggleInterestInstrument(instrument)} className={`px-3 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest disabled:opacity-50 ${interestInstruments.includes(instrument) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-zinc-500 border-zinc-200'}`}>{instrument}</button>)}
            </div>
            <div className="mt-5 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs font-bold text-emerald-900 leading-relaxed">La preinscripción no implica ningún cobro. Administración te avisará antes de activar el servicio.</div>
          </div>
          <div className="p-4 sm:p-5 border-t border-zinc-200 bg-zinc-50 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button type="button" disabled={busyId === 'preenroll'} onClick={() => setPreenrollmentDialogOpen(false)} className="px-5 py-3 bg-white border border-zinc-200 text-zinc-600 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50">Cancelar</button>
            <button type="button" disabled={busyId === 'preenroll'} onClick={requestPreenrollment} className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50">{busyId === 'preenroll' ? 'Enviando…' : 'Confirmar preinscripción'}</button>
          </div>
        </div>
      </div>}
      {openGroup && <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center" onMouseDown={event => { if (event.target === event.currentTarget) closeSeriesDialog(); }}>
        <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col">
          <div className="p-5 sm:p-6 bg-zinc-950 text-white flex items-start justify-between gap-4"><div><p className="text-[9px] font-black uppercase tracking-[.25em] text-violet-400">Gymusik · {openGroup.sessions[0]?.instrument} · {openGroup.sessions[0]?.level || 'Todos los niveles'}</p><h4 className="text-xl font-black mt-1">{openGroup.sessions[0]?.title}</h4><p className="text-sm font-medium text-zinc-300 mt-2">{openGroup.sessions[0]?.content}</p>{(openGroup.sessions[0]?.material || openGroup.sessions[0]?.requirements) && <p className="text-xs font-bold text-zinc-400 mt-3">{openGroup.sessions[0]?.material ? `Material: ${openGroup.sessions[0].material}` : ''}{openGroup.sessions[0]?.material && openGroup.sessions[0]?.requirements ? ' · ' : ''}{openGroup.sessions[0]?.requirements ? `Requisitos: ${openGroup.sessions[0].requirements}` : ''}</p>}</div><button type="button" disabled={busyId === 'series-reserve'} onClick={closeSeriesDialog} className="p-2 bg-white/10 rounded-full disabled:opacity-40"><X className="w-5 h-5"/></button></div>
          <div className="p-4 sm:p-6 overflow-y-auto space-y-3">
            {openGroup.sessions.map(session => {
              const reservation = ownReservationBySession.get(session.id);
              const active = reservation && ['confirmed', 'waitlist'].includes(reservation.status);
              const selected = selectedSessionIds.includes(session.id);
              const month = getGymusikMonth(session.date);
              const remaining = getGymusikCreditsRemaining({ reservations, studentId: profile.id, month, monthlyCredits: config.monthlyCredits });
              const selectedInMonth = selectedSessions.filter(item => getGymusikMonth(item.date) === month).length;
              const noCredit = !selected && selectedInMonth >= remaining;
              const full = Number(session.reservedCount || 0) >= Number(session.capacity || 1);
              return <div key={session.id} className={`border rounded-2xl p-4 ${selected ? 'border-violet-500 bg-violet-50' : 'border-zinc-200 bg-white'}`}><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><label className={`flex items-start gap-3 ${active || noCredit ? 'cursor-default' : 'cursor-pointer'}`}><input type="checkbox" checked={selected} disabled={active || noCredit || busyId === 'series-reserve'} onChange={() => toggleSelectedSession(session)} className="w-4 h-4 mt-1 accent-violet-600"/><span><span className="block font-black">{displayWeekday(session.date)} {displayDate(session.date)} · {session.time}h</span><span className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mt-1">{session.sede} · {session.sala} · {session.reservedCount || 0}/{session.capacity} plazas</span>{!active && full && <span className="block text-[10px] font-black uppercase tracking-widest text-amber-700 mt-1">Completa: entrarás en lista de espera</span>}{!active && noCredit && <span className="block text-[10px] font-black uppercase tracking-widest text-red-500 mt-1">Sin créditos disponibles en {month}</span>}</span></label><div className="flex items-center gap-2 sm:justify-end">{reservation?.status === 'confirmed' && <><span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-[9px] font-black uppercase">Confirmada</span><button type="button" onClick={() => downloadIcs(session)} className="p-2.5 bg-zinc-100 text-zinc-700 rounded-xl" title="Descargar calendario"><Download className="w-4 h-4"/></button></>}{reservation?.status === 'waitlist' && <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg text-[9px] font-black uppercase">Lista de espera</span>}{active && <button type="button" disabled={busyId === session.id || busyId === 'series-reserve'} onClick={() => cancelReservation(session, reservation)} className="px-3 py-2 bg-red-50 text-red-600 rounded-xl text-[9px] font-black uppercase disabled:opacity-50">Cancelar</button>}</div></div></div>;
            })}
          </div>
          <div className="p-4 sm:p-5 border-t border-zinc-200 bg-zinc-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><p className="text-sm font-black">{selectedSessions.length} fecha(s) seleccionada(s)</p><p className="text-[10px] font-bold text-zinc-500 mt-1">Cada fecha consume un crédito de su mes.</p></div><button type="button" disabled={selectedSessions.length === 0 || busyId === 'series-reserve'} onClick={reserveSelectedSessions} className="px-5 py-3 bg-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40">{busyId === 'series-reserve' ? 'Reservando…' : `Reservar ${selectedSessions.length || ''} fecha(s)`}</button></div>
        </div>
      </div>}
    </div>
  );
}
