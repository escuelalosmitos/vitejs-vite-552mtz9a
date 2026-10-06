import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Calendar, ChevronDown, ChevronUp,
  Edit3, MapPin, Music, Plus, Save, Search, Trash2, UserCheck,
  Users, X
} from 'lucide-react';
import {
  collection, deleteDoc, doc, onSnapshot, runTransaction, setDoc, updateDoc, writeBatch
} from 'firebase/firestore';
import {
  buildGymusikSessionId, GYMUSIK_MEMBER_STATUSES, GYMUSIK_SESSION_STATUSES,
  normalizeGymusikConfig, sortGymusikSessions
} from './gymusikUtils';

const nowIso = () => new Date().toISOString();
const todayLocal = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
};
const displayDate = value => String(value || '').slice(0, 10).split('-').reverse().join('/');
const addDaysToDate = (value, days = 0) => {
  const [year, month, day] = String(value || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return '';
  return new Date(Date.UTC(year, month - 1, day + Number(days || 0))).toISOString().slice(0, 10);
};
const normalizeEmail = value => String(value || '').trim().toLowerCase();
const teacherOperationalEmail = value => {
  const localPart = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
  return localPart ? `${localPart}@escuelalosmitos.com` : '';
};
const memberName = (member, students) => member.studentName || students.find(student => String(student.id) === String(member.studentId))?.name || 'Usuario';

const statusStyle = {
  preenrolled: 'bg-amber-100 text-amber-800 border-amber-200',
  active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  paused: 'bg-blue-100 text-blue-800 border-blue-200',
  cancelled: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  draft: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  published: 'bg-violet-100 text-violet-800 border-violet-200',
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200'
};

const emptySession = (centers = [], config = {}) => {
  const center = centers.find(item => item.status === 'active') || centers[0] || {};
  const room = (center.rooms || []).find(item => item.active !== false) || center.rooms?.[0] || {};
  return {
    instrument: config.instruments?.[0] || 'Guitarra',
    date: todayLocal(),
    time: '12:00',
    duration: 60,
    centerId: center.id || '',
    sede: center.name || '',
    roomId: room.id || '',
    sala: room.name || '',
    teacherName: '',
    teacherEmail: '',
    capacity: Math.max(1, Number(room.capacity || 8)),
    title: 'Entrenamiento Gymusik',
    content: '',
    teacherNotes: '',
    status: 'draft'
  };
};

function MitoversoRoster({ students = [] }) {
  const [search, setSearch] = useState('');
  const roster = useMemo(() => students
    .filter(student => student.hasMitoverso === true)
    .filter(student => `${student.name || ''} ${student.email || ''}`.toLowerCase().includes(search.toLowerCase()))
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'es')),
  [students, search]);

  return (
    <div className="space-y-5">
      <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div><h3 className="text-xl font-black uppercase tracking-tight">Alumnos de Mitoverso</h3><p className="text-sm font-medium text-zinc-500 mt-1">Listado centralizado de accesos activos.</p></div>
          <span className="px-4 py-2 rounded-xl bg-indigo-100 text-indigo-800 text-xs font-black uppercase tracking-widest">{roster.length} activos</span>
        </div>
        <div className="relative mt-5"><Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nombre o correo" className="w-full pl-11 pr-4 py-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold outline-none focus:border-indigo-500"/></div>
      </div>
      <div className="bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-sm">
        {roster.length === 0 ? <p className="p-10 text-center text-xs font-black uppercase tracking-widest text-zinc-400">No hay usuarios activos con este filtro.</p> : roster.map(student => (
          <div key={student.id} className="p-4 border-b last:border-b-0 border-zinc-100 flex items-center justify-between gap-4">
            <div><p className="font-black text-slate-900">{student.name || 'Sin nombre'}</p><p className="text-xs font-bold text-zinc-400 mt-1">{student.email || 'Sin correo'}</p></div>
            <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-black uppercase tracking-widest">Activo</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ServicesAdmin({ service = 'gymusik', db, appId, user, students = [], centers = [], settings = {} }) {
  const [config, setConfig] = useState(normalizeGymusikConfig());
  const [configDraft, setConfigDraft] = useState(normalizeGymusikConfig());
  const [members, setMembers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [memberStudentId, setMemberStudentId] = useState('');
  const [memberInstrument, setMemberInstrument] = useState('Guitarra');
  const [memberSearch, setMemberSearch] = useState('');
  const [sessionDraft, setSessionDraft] = useState(() => emptySession(centers, normalizeGymusikConfig()));
  const [editingSessionId, setEditingSessionId] = useState('');
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatCount, setRepeatCount] = useState(4);
  const [publishRepeatedSessions, setPublishRepeatedSessions] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState('');
  const [memberFilter, setMemberFilter] = useState('all');

  useEffect(() => {
    if (service !== 'gymusik') return undefined;
    let ready = 0;
    const markReady = () => { ready += 1; if (ready >= 4) setLoading(false); };
    const configRef = doc(db, 'artifacts', appId, 'gymusikSettings', 'main');
    const unsubs = [
      onSnapshot(configRef, snapshot => {
        const normalized = normalizeGymusikConfig(snapshot.exists() ? snapshot.data() : {});
        setConfig(normalized); setConfigDraft(normalized); setMemberInstrument(current => current || normalized.instruments[0] || 'Guitarra'); markReady();
      }, error => { console.error('No se pudo cargar Gymusik', error); markReady(); }),
      onSnapshot(collection(db, 'artifacts', appId, 'gymusikMembers'), snapshot => { setMembers(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); markReady(); }, error => { console.error(error); markReady(); }),
      onSnapshot(collection(db, 'artifacts', appId, 'gymusikSessions'), snapshot => { setSessions(sortGymusikSessions(snapshot.docs.map(item => ({ id: item.id, ...item.data() })))); markReady(); }, error => { console.error(error); markReady(); }),
      onSnapshot(collection(db, 'artifacts', appId, 'gymusikReservations'), snapshot => { setReservations(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); markReady(); }, error => { console.error(error); markReady(); })
    ];
    return () => unsubs.forEach(unsub => unsub());
  }, [service, db, appId]);

  useEffect(() => {
    if (service !== 'gymusik' || loading) return;
    const realFormationCount = members.filter(member => ['preenrolled', 'active'].includes(member.status)).length;
    if (Number(config.formationCount || 0) === realFormationCount) return;
    setDoc(doc(db, 'artifacts', appId, 'gymusikSettings', 'main'), {
      formationCount: realFormationCount,
      updatedAt: nowIso(),
      updatedBy: user?.email || 'admin'
    }, { merge: true }).catch(error => console.error('No se pudo sincronizar el contador de Gymusik:', error));
  }, [service, loading, members, config.formationCount, db, appId, user?.email]);

  if (service === 'mitoverso') return <MitoversoRoster students={students}/>;
  if (service !== 'gymusik') return null;

  const notify = text => { setMessage(text); window.setTimeout(() => setMessage(''), 3500); };
  const activeMembers = members.filter(member => member.status === 'active');
  const formationMembers = members.filter(member => ['preenrolled', 'active'].includes(member.status));
  const missingMembers = Math.max(0, config.minimumMembers - formationMembers.length);
  const conservativeMonthlyIncome = activeMembers.length * Math.max(0, Number(config.studentPrice || 0));
  const estimatedTeacherCost = Math.max(0, Number(config.monthlyCredits || 0)) * Math.max(0, Number(settings.costeEmpresa || 0));
  const conservativeMargin = conservativeMonthlyIncome - estimatedTeacherCost;
  const economicMinimum = Number(config.studentPrice || 0) > 0
    ? Math.ceil(estimatedTeacherCost / Number(config.studentPrice)) + 1
    : 0;
  const selectableStudents = students
    .filter(student => !members.some(member => String(member.studentId || member.id) === String(student.id)))
    .filter(student => `${student.name || ''} ${student.email || ''}`.toLowerCase().includes(memberSearch.toLowerCase()))
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'es'));
  const visibleMembers = members
    .filter(member => memberFilter === 'all' || member.status === memberFilter)
    .sort((left, right) => memberName(left, students).localeCompare(memberName(right, students), 'es'));
  const activeCenters = centers.filter(center => center.status === 'active');
  const selectedCenter = centers.find(center => String(center.id) === String(sessionDraft.centerId)) || activeCenters[0] || centers[0] || {};
  const availableRooms = (selectedCenter.rooms || []).filter(room => room.active !== false);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const normalized = normalizeGymusikConfig(configDraft);
      await setDoc(doc(db, 'artifacts', appId, 'gymusikSettings', 'main'), { ...normalized, updatedAt: nowIso(), updatedBy: user?.email || 'admin' }, { merge: true });
      notify('Configuración de Gymusik guardada.');
    } catch (error) { console.error(error); alert(`No se pudo guardar: ${error.message}`); } finally { setSaving(false); }
  };

  const setPreenrollmentOpen = async preenrollmentOpen => {
    if (!preenrollmentOpen && !window.confirm('¿Cerrar las preinscripciones? Quienes ya estén preinscritos conservarán su estado y seguirán viendo Gymusik.')) return;
    await setDoc(doc(db, 'artifacts', appId, 'gymusikSettings', 'main'), {
      preenrollmentOpen,
      preenrollmentUpdatedAt: nowIso(),
      updatedAt: nowIso(),
      updatedBy: user?.email || 'admin'
    }, { merge: true });
    notify(preenrollmentOpen ? 'Preinscripciones de Gymusik abiertas.' : 'Preinscripciones de Gymusik cerradas.');
  };

  const setServiceActive = async active => {
    if (active && formationMembers.length < config.minimumMembers && !window.confirm(`Todavía faltan ${missingMembers} personas para alcanzar el mínimo. ¿Activar igualmente?`)) return;
    await setDoc(doc(db, 'artifacts', appId, 'gymusikSettings', 'main'), { active, activatedAt: active ? nowIso() : '', updatedAt: nowIso(), updatedBy: user?.email || 'admin' }, { merge: true });
  };

  const addMember = async () => {
    const student = students.find(item => String(item.id) === String(memberStudentId));
    if (!student) return alert('Selecciona un usuario.');
    const now = nowIso();
    await setDoc(doc(db, 'artifacts', appId, 'gymusikMembers', String(student.id)), {
      studentId: String(student.id), studentName: student.name || '', studentEmail: normalizeEmail(student.email),
      instrument: memberInstrument || config.instruments[0] || 'Guitarra', status: 'preenrolled',
      isCurrentStudent: Array.isArray(student.classes) && student.classes.length > 0,
      createdAt: now, updatedAt: now, createdBy: user?.email || 'admin'
    }, { merge: true });
    await setDoc(doc(db, 'artifacts', appId, 'gymusikSettings', 'main'), {
      formationCount: formationMembers.length + 1, updatedAt: nowIso()
    }, { merge: true });
    setMemberStudentId(''); setMemberSearch(''); notify('Usuario añadido a la preinscripción de Gymusik.');
  };

  const changeMemberStatus = async (member, status) => {
    if (!member.studentId) return;
    const batch = writeBatch(db);
    batch.set(doc(db, 'artifacts', appId, 'gymusikMembers', member.id), {
      status, updatedAt: nowIso(), updatedBy: user?.email || 'admin',
      ...(status === 'active' ? { activatedAt: nowIso() } : {}),
      ...(status === 'cancelled' ? { cancelledAt: nowIso() } : {})
    }, { merge: true });
    batch.update(doc(db, 'artifacts', appId, 'students', String(member.studentId)), {
      hasGymusik: ['active', 'paused'].includes(status), gymusikStatus: status, updatedAt: nowIso()
    });
    const wasCounted = ['preenrolled', 'active'].includes(member.status);
    const willBeCounted = ['preenrolled', 'active'].includes(status);
    if (wasCounted !== willBeCounted) batch.set(doc(db, 'artifacts', appId, 'gymusikSettings', 'main'), {
      formationCount: Math.max(0, formationMembers.length + (willBeCounted ? 1 : -1)), updatedAt: nowIso()
    }, { merge: true });
    await batch.commit();
  };

  const removeMember = async member => {
    if (!window.confirm(`¿Eliminar la ficha Gymusik de ${memberName(member, students)}?`)) return;
    await updateDoc(doc(db, 'artifacts', appId, 'students', String(member.studentId)), { hasGymusik: false, gymusikStatus: 'cancelled', updatedAt: nowIso() });
    await deleteDoc(doc(db, 'artifacts', appId, 'gymusikMembers', member.id));
    if (['preenrolled', 'active'].includes(member.status)) await setDoc(doc(db, 'artifacts', appId, 'gymusikSettings', 'main'), { formationCount: Math.max(0, formationMembers.length - 1), updatedAt: nowIso() }, { merge: true });
  };

  const updateSessionLocation = centerId => {
    const center = centers.find(item => String(item.id) === String(centerId)) || {};
    const room = (center.rooms || []).find(item => item.active !== false) || center.rooms?.[0] || {};
    setSessionDraft(previous => ({ ...previous, centerId: center.id || '', sede: center.name || '', roomId: room.id || '', sala: room.name || '', capacity: Math.max(1, Number(room.capacity || previous.capacity || 1)) }));
  };
  const updateSessionRoom = roomId => {
    const room = availableRooms.find(item => String(item.id) === String(roomId)) || {};
    setSessionDraft(previous => ({ ...previous, roomId: room.id || '', sala: room.name || '', capacity: Math.max(1, Number(room.capacity || previous.capacity || 1)) }));
  };
  const updateSessionTeacher = teacherName => setSessionDraft(previous => ({ ...previous, teacherName, teacherEmail: normalizeEmail(settings.teacherEmails?.[teacherName] || teacherOperationalEmail(teacherName)) }));

  const saveSession = async event => {
    event.preventDefault();
    if (!sessionDraft.date || !sessionDraft.time || !sessionDraft.instrument || !sessionDraft.teacherName || !sessionDraft.centerId || !sessionDraft.roomId) return alert('Completa fecha, hora, instrumento, profesor, sede y sala.');
    if (!String(sessionDraft.content || '').trim()) return alert('Describe el contenido del entrenamiento.');
    setSaving(true);
    try {
      const capacity = Math.max(1, Math.trunc(Number(sessionDraft.capacity) || 1));
      const duration = Math.max(15, Math.trunc(Number(sessionDraft.duration) || 60));

      if (editingSessionId) {
        const existing = sessions.find(session => session.id === editingSessionId);
        await setDoc(doc(db, 'artifacts', appId, 'gymusikSessions', editingSessionId), {
          ...sessionDraft, capacity, duration,
          reservedCount: Number(existing?.reservedCount || 0), waitlistCount: Number(existing?.waitlistCount || 0),
          createdAt: existing?.createdAt || nowIso(), updatedAt: nowIso(), updatedBy: user?.email || 'admin'
        }, { merge: true });
        notify('Sesión Gymusik actualizada.');
      } else {
        const total = repeatWeekly ? Math.min(12, Math.max(2, Math.trunc(Number(repeatCount) || 4))) : 1;
        const seriesId = total > 1 ? `gymusik_${Date.now().toString(36)}` : '';
        const batch = writeBatch(db);
        const createdAt = nowIso();

        for (let index = 0; index < total; index += 1) {
          const date = addDaysToDate(sessionDraft.date, index * 7);
          const repeatedSession = {
            ...sessionDraft,
            date,
            status: total > 1 && publishRepeatedSessions ? 'published' : sessionDraft.status,
            capacity,
            duration,
            reservedCount: 0,
            waitlistCount: 0,
            createdAt,
            updatedAt: createdAt,
            updatedBy: user?.email || 'admin',
            ...(total > 1 ? { recurrence: 'weekly', seriesId, seriesIndex: index + 1, seriesTotal: total } : {})
          };
          const id = buildGymusikSessionId(repeatedSession);
          batch.set(doc(db, 'artifacts', appId, 'gymusikSessions', id), repeatedSession);
        }

        await batch.commit();
        notify(total > 1 ? `${total} sesiones semanales creadas.` : 'Sesión Gymusik guardada.');
      }

      setEditingSessionId('');
      setRepeatWeekly(false);
      setRepeatCount(4);
      setPublishRepeatedSessions(false);
      setSessionDraft(emptySession(centers, config));
    } catch (error) {
      console.error(error);
      alert(`No se pudo guardar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const editSession = session => { setEditingSessionId(session.id); setRepeatWeekly(false); setSessionDraft({ ...emptySession(centers, config), ...session }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const deleteSession = async session => {
    const linked = reservations.filter(item => item.sessionId === session.id && !['cancelled'].includes(item.status));
    if (linked.length > 0) return alert('No puedes borrar una sesión con reservas. Cancélala para conservar el historial.');
    if (window.confirm('¿Eliminar este borrador de sesión?')) await deleteDoc(doc(db, 'artifacts', appId, 'gymusikSessions', session.id));
  };
  const changeSessionStatus = async (session, status) => {
    const sessionRef = doc(db, 'artifacts', appId, 'gymusikSessions', session.id);
    if (status !== 'cancelled') {
      await updateDoc(sessionRef, { status, updatedAt: nowIso(), updatedBy: user?.email || 'admin' });
      return;
    }
    if (!window.confirm('Al cancelar la sesión se devolverá el crédito a todas las personas inscritas. ¿Continuar?')) return;
    const linked = reservations.filter(item => item.sessionId === session.id && ['confirmed', 'waitlist'].includes(item.status));
    const batch = writeBatch(db);
    batch.update(sessionRef, { status: 'cancelled', reservedCount: 0, waitlistCount: 0, promotionPending: false, cancelledAt: nowIso(), updatedAt: nowIso(), updatedBy: user?.email || 'admin' });
    linked.forEach(reservation => batch.update(doc(db, 'artifacts', appId, 'gymusikReservations', reservation.id), { status: 'cancelled', cancelledAt: nowIso(), cancelledBy: 'admin_session_cancelled', creditConsumed: false, creditReturned: true, updatedAt: nowIso() }));
    await batch.commit();
  };

  const promoteReservation = async reservation => {
    const sessionRef = doc(db, 'artifacts', appId, 'gymusikSessions', reservation.sessionId);
    const reservationRef = doc(db, 'artifacts', appId, 'gymusikReservations', reservation.id);
    await runTransaction(db, async transaction => {
      const [sessionSnapshot, reservationSnapshot] = await Promise.all([transaction.get(sessionRef), transaction.get(reservationRef)]);
      if (!sessionSnapshot.exists() || !reservationSnapshot.exists()) throw new Error('La sesión o la reserva ya no existe.');
      const session = sessionSnapshot.data(); const current = reservationSnapshot.data();
      if (current.status !== 'waitlist') throw new Error('La persona ya no está en espera.');
      if (Number(session.reservedCount || 0) >= Number(session.capacity || 1)) throw new Error('La sesión continúa completa.');
      transaction.update(sessionRef, { reservedCount: Number(session.reservedCount || 0) + 1, waitlistCount: Math.max(0, Number(session.waitlistCount || 0) - 1), updatedAt: nowIso() });
      transaction.update(reservationRef, { status: 'confirmed', promotedAt: nowIso(), promotedBy: user?.email || 'admin', updatedAt: nowIso() });
    });
  };

  const cancelReservation = async reservation => {
    if (!['confirmed', 'waitlist'].includes(reservation.status)) return;
    if (!window.confirm('¿Cancelar esta reserva desde Administración?')) return;
    const sessionRef = doc(db, 'artifacts', appId, 'gymusikSessions', reservation.sessionId);
    const reservationRef = doc(db, 'artifacts', appId, 'gymusikReservations', reservation.id);
    await runTransaction(db, async transaction => {
      const [sessionSnapshot, reservationSnapshot] = await Promise.all([transaction.get(sessionRef), transaction.get(reservationRef)]);
      if (!sessionSnapshot.exists() || !reservationSnapshot.exists()) return;
      const session = sessionSnapshot.data(); const current = reservationSnapshot.data();
      const patch = current.status === 'waitlist'
        ? { waitlistCount: Math.max(0, Number(session.waitlistCount || 0) - 1) }
        : { reservedCount: Math.max(0, Number(session.reservedCount || 0) - 1), promotionPending: Number(session.waitlistCount || 0) > 0 };
      transaction.update(sessionRef, { ...patch, updatedAt: nowIso() });
      transaction.update(reservationRef, { status: 'cancelled', cancelledAt: nowIso(), cancelledBy: 'admin', creditReturned: true, updatedAt: nowIso() });
    });
  };

  if (loading) return <div className="bg-white rounded-3xl border border-zinc-200 p-10 text-center font-black uppercase tracking-widest text-zinc-400">Cargando Gymusik…</div>;

  return (
    <div className="space-y-6">
      {message && <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] bg-black text-white px-6 py-3 rounded-full shadow-2xl text-xs font-black uppercase tracking-widest">{message}</div>}
      <div className={`rounded-3xl p-6 md:p-8 border-2 ${config.active ? 'bg-emerald-950 border-emerald-800 text-white' : 'bg-zinc-950 border-zinc-800 text-white'}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div><p className="text-[10px] font-black uppercase tracking-[.25em] text-emerald-400">Entrenamiento musical dirigido</p><h2 className="text-3xl font-black uppercase tracking-tight mt-1">Gymusik</h2><p className="text-sm font-medium text-zinc-300 mt-2 max-w-2xl">Sesiones de práctica repetitiva, corrección y acompañamiento. Cada instrumento se programa por separado.</p></div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button onClick={() => setPreenrollmentOpen(!config.preenrollmentOpen)} className={`px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest ${config.preenrollmentOpen ? 'bg-amber-300 text-amber-950' : 'bg-white/10 text-white hover:bg-white/20'}`}>{config.preenrollmentOpen ? 'Preinscripciones abiertas · cerrar' : 'Abrir preinscripciones'}</button>
            <button onClick={() => setServiceActive(!config.active)} className={`px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest ${config.active ? 'bg-white text-emerald-900' : 'bg-emerald-500 text-emerald-950'}`}>{config.active ? 'Servicio activo · pausar' : 'Activar servicio'}</button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mt-6">
          <div className="bg-white/10 p-4 rounded-2xl"><span className="block text-2xl font-black">{activeMembers.length}</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Miembros activos</span></div>
          <div className="bg-white/10 p-4 rounded-2xl"><span className="block text-2xl font-black">{formationMembers.length}/{config.minimumMembers}</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Para apertura</span></div>
          <div className="bg-white/10 p-4 rounded-2xl"><span className="block text-2xl font-black">{sessions.filter(item => item.status === 'published').length}</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Sesiones publicadas</span></div>
          <div className="bg-white/10 p-4 rounded-2xl"><span className="block text-2xl font-black">{config.monthlyCredits}</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Créditos al mes</span></div>
          <div className="bg-white/10 p-4 rounded-2xl"><span className="block text-2xl font-black">{conservativeMonthlyIncome.toFixed(0)} €</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Ingreso conservador</span></div>
          <div className={`p-4 rounded-2xl ${conservativeMargin >= 0 ? 'bg-emerald-400/20' : 'bg-red-400/20'}`}><span className="block text-2xl font-black">{conservativeMargin.toFixed(0)} €</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Margen sobre profesor</span></div>
        </div>
        <p className="mt-3 text-[10px] font-bold text-zinc-400 leading-relaxed">Estimación prudente: todos los miembros a {config.studentPrice} €, {config.monthlyCredits} sesiones mensuales y coste docente de {Number(settings.costeEmpresa || 0).toFixed(2)} €/h. Umbral económico recomendado: {economicMinimum || '—'} miembros (coste del profesor cubierto y una cuota adicional).</p>
        {missingMembers === 0 && !config.active && <div className="mt-5 p-4 bg-amber-300 text-amber-950 rounded-2xl flex items-center gap-3 font-black text-xs uppercase tracking-widest"><AlertCircle className="w-5 h-5"/> Ya se ha alcanzado el mínimo. Puedes gestionar el cobro en Tadosi y activar el servicio.</div>}
      </div>

      <details className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
        <summary className="cursor-pointer list-none flex items-center justify-between"><div><h3 className="font-black uppercase tracking-tight text-lg">Configuración</h3><p className="text-xs font-bold text-zinc-400 mt-1">Precios, créditos y umbral de activación</p></div><ChevronDown className="w-5 h-5 text-zinc-400"/></summary>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
          {[['Precio alumno', 'studentPrice'], ['Precio externo', 'externalPrice'], ['Créditos mensuales', 'monthlyCredits'], ['Mínimo de miembros', 'minimumMembers'], ['Cancelación gratuita (h)', 'cancellationHours']].map(([label, field]) => <label key={field} className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}<input type="number" min="0" value={configDraft[field]} onChange={event => setConfigDraft(previous => ({ ...previous, [field]: event.target.value }))} className="mt-1 w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl text-sm font-black outline-none focus:border-emerald-500"/></label>)}
        </div>
        <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mt-4">Instrumentos disponibles (separados por comas)<input value={(configDraft.instruments || []).join(', ')} onChange={event => setConfigDraft(previous => ({ ...previous, instruments: event.target.value.split(',').map(item => item.trim()).filter(Boolean) }))} className="mt-1 w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl text-sm font-bold outline-none focus:border-emerald-500"/></label>
        <button disabled={saving} onClick={saveConfig} className="mt-5 px-5 py-3 bg-black text-white rounded-xl text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2"><Save className="w-4 h-4"/> Guardar configuración</button>
      </details>

      <div className="grid xl:grid-cols-5 gap-6">
        <section className="xl:col-span-2 bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
          <h3 className="text-lg font-black uppercase tracking-tight">Añadir preinscripción manual</h3><p className="text-xs font-bold text-zinc-400 mt-1">Para solicitudes recibidas fuera del área de alumno. El cobro y la activación se confirman después manualmente.</p>
          <input value={memberSearch} onChange={event => { setMemberSearch(event.target.value); setMemberStudentId(''); }} placeholder="Buscar alumno o usuario" className="mt-5 w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold outline-none"/>
          <select value={memberStudentId} onChange={event => setMemberStudentId(event.target.value)} className="mt-3 w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold"><option value="">Seleccionar usuario…</option>{selectableStudents.slice(0, 80).map(student => <option key={student.id} value={student.id}>{student.name} · {student.email}</option>)}</select>
          <select value={memberInstrument} onChange={event => setMemberInstrument(event.target.value)} className="mt-3 w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold">{config.instruments.map(instrument => <option key={instrument}>{instrument}</option>)}</select>
          <button onClick={addMember} className="mt-4 w-full py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest inline-flex justify-center items-center gap-2"><Plus className="w-4 h-4"/> Añadir</button>
          <p className="mt-4 text-[10px] font-bold text-zinc-400 leading-relaxed">Para una persona externa, crea primero su ficha con «Alta solo servicios» en el CRM y después añádela aquí.</p>
        </section>
        <section className="xl:col-span-3 bg-white border border-zinc-200 rounded-3xl overflow-hidden shadow-sm">
          <div className="p-5 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h3 className="text-lg font-black uppercase tracking-tight">Miembros</h3><p className="text-xs font-bold text-zinc-400 mt-1">Activa únicamente después de confirmar el cobro.</p></div><select value={memberFilter} onChange={event => setMemberFilter(event.target.value)} className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-[10px] font-black uppercase"><option value="all">Todos</option>{Object.entries(GYMUSIK_MEMBER_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="max-h-[520px] overflow-y-auto">{visibleMembers.length === 0 ? <p className="p-10 text-center text-xs font-black uppercase tracking-widest text-zinc-400">Sin miembros todavía.</p> : visibleMembers.map(member => <div key={member.id} className="p-4 border-b last:border-0 border-zinc-100"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><p className="font-black">{memberName(member, students)}</p><p className="text-xs font-bold text-zinc-400 mt-1">{member.studentEmail} · {member.instrument} · {member.isCurrentStudent !== false ? `${config.studentPrice} € alumno` : `${config.externalPrice} € externo`}</p></div><div className="flex items-center gap-2"><select value={member.status || 'preenrolled'} onChange={event => changeMemberStatus(member, event.target.value)} className={`px-3 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest ${statusStyle[member.status] || statusStyle.preenrolled}`}>{Object.entries(GYMUSIK_MEMBER_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button onClick={() => removeMember(member)} className="p-2.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-600 hover:text-white"><Trash2 className="w-4 h-4"/></button></div></div></div>)}</div>
        </section>
      </div>

      <form onSubmit={saveSession} className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4"><div><h3 className="text-xl font-black uppercase tracking-tight">{editingSessionId ? 'Editar sesión' : 'Nueva sesión'}</h3><p className="text-xs font-bold text-zinc-400 mt-1">La capacidad parte del aforo de la sala, pero puedes reducirla.</p></div>{editingSessionId && <button type="button" onClick={() => { setEditingSessionId(''); setRepeatWeekly(false); setSessionDraft(emptySession(centers, config)); }} className="p-2 bg-zinc-100 rounded-full"><X className="w-4 h-4"/></button>}</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Instrumento<select value={sessionDraft.instrument} onChange={event => setSessionDraft(previous => ({ ...previous, instrument: event.target.value }))} className="mt-1 w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold">{config.instruments.map(item => <option key={item}>{item}</option>)}</select></label>
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Fecha<input type="date" value={sessionDraft.date} onChange={event => setSessionDraft(previous => ({ ...previous, date: event.target.value }))} className="mt-1 w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold"/></label>
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Hora<input type="time" value={sessionDraft.time} onChange={event => setSessionDraft(previous => ({ ...previous, time: event.target.value }))} className="mt-1 w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold"/></label>
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Duración<input type="number" min="15" step="15" value={sessionDraft.duration} onChange={event => setSessionDraft(previous => ({ ...previous, duration: event.target.value }))} className="mt-1 w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold"/></label>
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Sede<select value={sessionDraft.centerId} onChange={event => updateSessionLocation(event.target.value)} className="mt-1 w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold">{activeCenters.map(center => <option key={center.id} value={center.id}>{center.name}</option>)}</select></label>
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Sala<select value={sessionDraft.roomId} onChange={event => updateSessionRoom(event.target.value)} className="mt-1 w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold">{availableRooms.map(room => <option key={room.id} value={room.id}>{room.name} · aforo {room.capacity || '—'}</option>)}</select></label>
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Aforo Gymusik<input type="number" min="1" value={sessionDraft.capacity} onChange={event => setSessionDraft(previous => ({ ...previous, capacity: event.target.value }))} className="mt-1 w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold"/></label>
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Profesor<select value={sessionDraft.teacherName} onChange={event => updateSessionTeacher(event.target.value)} className="mt-1 w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold"><option value="">Seleccionar…</option>{(settings.teachersList || []).map(name => <option key={name}>{name}</option>)}</select></label>
        </div>
        <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mt-4">Título<input value={sessionDraft.title} onChange={event => setSessionDraft(previous => ({ ...previous, title: event.target.value }))} className="mt-1 w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold"/></label>
        <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mt-4">Contenido y objetivos<textarea rows="4" value={sessionDraft.content} onChange={event => setSessionDraft(previous => ({ ...previous, content: event.target.value }))} placeholder="Ej.: cambios entre acordes abiertos, ritmo de corcheas y repetición por bloques" className="mt-1 w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-medium resize-y"/></label>
        <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mt-4">Indicaciones internas para el profesor<textarea rows="2" value={sessionDraft.teacherNotes} onChange={event => setSessionDraft(previous => ({ ...previous, teacherNotes: event.target.value }))} className="mt-1 w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-medium resize-y"/></label>
        {!editingSessionId && <div className="mt-5 p-4 bg-violet-50 border border-violet-200 rounded-2xl">
          <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={repeatWeekly} onChange={event => setRepeatWeekly(event.target.checked)} className="w-4 h-4 accent-violet-600"/><span className="text-xs font-black uppercase tracking-widest text-violet-900">Repetir semanalmente</span></label>
          {repeatWeekly && <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-violet-800">Número de sesiones<input type="number" min="2" max="12" value={repeatCount} onChange={event => setRepeatCount(event.target.value)} className="mt-1 w-full p-3 bg-white border-2 border-violet-200 rounded-xl font-bold"/></label>
            <label className="flex items-center gap-3 sm:mt-5 cursor-pointer"><input type="checkbox" checked={publishRepeatedSessions} onChange={event => setPublishRepeatedSessions(event.target.checked)} className="w-4 h-4 accent-violet-600"/><span className="text-[10px] font-black uppercase tracking-widest text-violet-800">Publicarlas directamente</span></label>
            <p className="sm:col-span-2 text-[10px] font-bold text-violet-700">Se crearán {Math.min(12, Math.max(2, Math.trunc(Number(repeatCount) || 4)))} sesiones independientes, empezando el {displayDate(sessionDraft.date)} y manteniendo el mismo día de la semana y la misma hora.</p>
          </div>}
        </div>}
        <button type="submit" disabled={saving} className="mt-5 px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2 disabled:opacity-50"><Save className="w-4 h-4"/> {saving ? 'Guardando…' : repeatWeekly && !editingSessionId ? 'Crear sesiones' : 'Guardar sesión'}</button>
      </form>

      <section className="space-y-4">
        <div className="flex items-center justify-between"><div><h3 className="text-xl font-black uppercase tracking-tight">Sesiones</h3><p className="text-xs font-bold text-zinc-400 mt-1">Publica las fechas que quieras ofrecer; cada reserva consume un crédito del mes correspondiente.</p></div><span className="bg-violet-100 text-violet-800 px-3 py-1.5 rounded-xl text-xs font-black">{sessions.length}</span></div>
        {sessions.length === 0 ? <div className="bg-white border-2 border-dashed border-zinc-200 rounded-3xl p-10 text-center text-xs font-black uppercase tracking-widest text-zinc-400">Todavía no hay sesiones.</div> : sessions.map(session => {
          const sessionReservations = reservations.filter(item => item.sessionId === session.id && item.status !== 'cancelled');
          const confirmed = sessionReservations.filter(item => ['confirmed', 'attended', 'no_show'].includes(item.status));
          const waitlist = sessionReservations.filter(item => item.status === 'waitlist').sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
          const expanded = expandedSessionId === session.id;
          return <article key={session.id} className="bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden"><div className="p-5"><div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4"><div><div className="flex flex-wrap gap-2"><span className={`px-2.5 py-1 border rounded-lg text-[9px] font-black uppercase tracking-widest ${statusStyle[session.status] || statusStyle.draft}`}>{GYMUSIK_SESSION_STATUSES[session.status] || session.status}</span><span className="px-2.5 py-1 bg-black text-white rounded-lg text-[9px] font-black uppercase tracking-widest">Gymusik · {session.instrument}</span>{session.promotionPending && <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg text-[9px] font-black uppercase tracking-widest">Plaza libre con espera</span>}</div><h4 className="font-black text-lg mt-2">{session.title || 'Sesión Gymusik'}</h4><p className="text-sm font-medium text-zinc-500 mt-1">{session.content}</p><div className="flex flex-wrap gap-4 mt-4 text-[10px] font-black uppercase tracking-widest text-zinc-500"><span className="flex items-center gap-1"><Calendar className="w-4 h-4"/>{displayDate(session.date)} · {session.time}h</span><span className="flex items-center gap-1"><MapPin className="w-4 h-4"/>{session.sede} · {session.sala}</span><span className="flex items-center gap-1"><Users className="w-4 h-4"/>{confirmed.length}/{session.capacity} · espera {waitlist.length}</span><span className="flex items-center gap-1"><Music className="w-4 h-4"/>{session.teacherName}</span></div></div><div className="flex flex-wrap gap-2"><select value={session.status || 'draft'} onChange={event => changeSessionStatus(session, event.target.value)} className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-[9px] font-black uppercase">{Object.entries(GYMUSIK_SESSION_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button onClick={() => editSession(session)} className="p-2.5 bg-violet-50 text-violet-700 rounded-xl"><Edit3 className="w-4 h-4"/></button><button onClick={() => deleteSession(session)} className="p-2.5 bg-red-50 text-red-600 rounded-xl"><Trash2 className="w-4 h-4"/></button></div></div><button onClick={() => setExpandedSessionId(expanded ? '' : session.id)} className="w-full border-t border-zinc-100 mt-5 pt-4 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">Asistentes y espera ({sessionReservations.length}) {expanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}</button></div>{expanded && <div className="bg-zinc-50 border-t border-zinc-200 p-4 space-y-2">{sessionReservations.length === 0 ? <p className="py-5 text-center text-xs font-black uppercase tracking-widest text-zinc-400">Sin reservas.</p> : sessionReservations.map(reservation => <div key={reservation.id} className="bg-white border border-zinc-200 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><p className="font-black text-sm">{reservation.studentName || 'Usuario'}</p><p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{reservation.status === 'waitlist' ? 'Lista de espera' : reservation.status} · {reservation.studentEmail}</p></div><div className="flex gap-2">{reservation.status === 'waitlist' && <button onClick={() => promoteReservation(reservation).catch(error => alert(error.message))} className="px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-black uppercase"><UserCheck className="w-3 h-3 inline"/> Promocionar</button>}{['confirmed', 'waitlist'].includes(reservation.status) && <button onClick={() => cancelReservation(reservation)} className="px-3 py-2 bg-red-50 text-red-600 rounded-lg text-[9px] font-black uppercase">Cancelar</button>}</div></div>)}</div>}</article>;
        })}
      </section>
    </div>
  );
}
