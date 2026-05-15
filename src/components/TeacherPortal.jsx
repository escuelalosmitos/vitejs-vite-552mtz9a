import React, { useState, useMemo, useEffect } from 'react';
import {
  ClipboardList, History, BarChart3, Check, X, AlertCircle, Save, Mail, UserPlus, 
  Trash2, Calendar, Clock, User, Music, RefreshCw, Play, MessageSquare, LogOut, 
  CornerDownRight, BookOpen, CalendarOff, Ticket, Snowflake, Timer, Palmtree, 
  PartyPopper, Coffee, MapPin, Bell, ShieldAlert
} from 'lucide-react';
import { collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

const INSTRUMENTOS = ["Guitarra", "Canto", "Teclado", "Batería", "Bajo", "Ukelele", "Armónica", "Combo", "Sensibilización", "Violín"];
const SEDES = ["Tarragona", "Reus"];
const SALAS = ["Sala 1", "Sala 2", "Sala 3"];

const getDayOfWeek = (dateString) => {
  if (!dateString) return 0;
  const [year, month, day] = dateString.split('-');
  return new Date(year, month - 1, day).getDay();
};

const getDayName = (dayIndex) => ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dayIndex];

const formatDateSpanish = (dateString) => {
  if (!dateString) return '';
  return dateString.split('-').reverse().join('/');
};

const normalizeNumber = (value) => {
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
};

const generateTicketDates = (dateString) => {
  if (!dateString) return { validFrom: '', validUntil: '' };
  const [y, m] = dateString.split('-').map(Number);
  let nextY = y;
  let nextM = m + 1;
  if (nextM > 12) { nextM = 1; nextY++; }
  const validFrom = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  const lastDay = new Date(nextY, nextM, 0).getDate();
  const validUntil = `${nextY}-${String(nextM).padStart(2, '0')}-${lastDay}`;
  return { validFrom, validUntil };
};

const getPreviousMonthStr = (currentMonthStr) => { 
  const [y, m] = currentMonthStr.split('-').map(Number);
  let prevM = m - 1;
  let prevY = y;
  if (prevM === 0) { prevM = 12; prevY--; }
  return `${prevY}-${String(prevM).padStart(2, '0')}`;
};

export default function TeacherPortal({ user, logout, db, auth, appId, ADMIN_EMAIL, APPS_SCRIPT_URL, switchToAdmin }) {
  const [loadingData, setLoadingData] = useState(true);
  const [recurringClasses, setRecurringClasses] = useState([]);
  const [records, setRecords] = useState([]);
  const [dailyReports, setDailyReports] = useState([]);
  const [globalStudents, setGlobalStudents] = useState([]);
  const [tickets, setTickets] = useState([]); 
  const [substitutions, setSubstitutions] = useState([]); 
  const [gestiones, setGestiones] = useState([]); 
  
  const [settings, setSettings] = useState({
    hourlyRate: 17.33, generalTasks: [], festivos: [], vacaciones: []
  });

  const [activeTab, setActiveTab] = useState('attendance');
  const [notification, setNotification] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentSession, setCurrentSession] = useState(null);
  const [isSendingReport, setIsSendingReport] = useState(false);
  const [deadHourModal, setDeadHourModal] = useState(null);

  const [dailyForm, setDailyForm] = useState({
    generalFeedback: '', incidents: '', newStudents: '', materialIssues: '', hoursTaught: ''
  });

  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    if (!user) return;
    setLoadingData(true);

    const refs = {
      recurring: collection(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses'),
      records: collection(db, 'artifacts', appId, 'users', user.uid, 'records'),
      daily: collection(db, 'artifacts', appId, 'users', user.uid, 'dailyReports'),
      students: collection(db, 'artifacts', appId, 'students'),
      settings: doc(db, 'artifacts', appId, 'settings', 'global'),
      tickets: collection(db, 'artifacts', appId, 'users', user.uid, 'tickets'),
      subs: collection(db, 'artifacts', appId, 'substitutions'),
      gestiones: collection(db, 'artifacts', appId, 'gestiones')
    };

    let counts = 0;
    const checkDone = () => { counts++; if (counts >= 8) setLoadingData(false); };

    const u1 = onSnapshot(refs.recurring, (s) => { setRecurringClasses(s.docs.map(d => ({ id: d.id, ...d.data() }))); checkDone(); });
    const u2 = onSnapshot(refs.records, (s) => { 
      const recs = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`));
      setRecords(recs); checkDone(); 
    });
    const u3 = onSnapshot(refs.daily, (s) => { setDailyReports(s.docs.map(d => ({ id: d.id, ...d.data() }))); checkDone(); });
    const u4 = onSnapshot(refs.students, (s) => { setGlobalStudents(s.docs.map(d => ({ id: d.id, ...d.data() }))); checkDone(); });
    const u5 = onSnapshot(refs.settings, (d) => { if (d.exists()) setSettings(prev => ({ ...prev, ...d.data() })); checkDone(); });
    const u6 = onSnapshot(refs.tickets, (s) => { setTickets(s.docs.map(d => ({ id: d.id, ...d.data() }))); checkDone(); });
    const u7 = onSnapshot(refs.subs, (s) => { setSubstitutions(s.docs.map(d => ({ id: d.id, ...d.data() }))); checkDone(); });
    const u8 = onSnapshot(refs.gestiones, (s) => { setGestiones(s.docs.map(d => ({ id: d.id, ...d.data() }))); checkDone(); });

    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); u8(); };
  }, [user, db, appId]);

  useEffect(() => {
    const reportForDate = dailyReports.find(r => r.id === date);
    setDailyForm({
      generalFeedback: reportForDate?.generalFeedback || '',
      incidents: reportForDate?.incidents || '',
      newStudents: reportForDate?.newStudents || '',
      materialIssues: reportForDate?.materialIssues || '',
      hoursTaught: reportForDate?.hoursTaught || ''
    });
  }, [date, dailyReports]);

  const notifications = useMemo(() => {
    if (isAdmin) return gestiones.filter(g => g.status === 'pendiente');
    const myStudentIds = new Set();
    recurringClasses.forEach(c => (c.students || []).forEach(s => myStudentIds.add(s.id)));
    return gestiones.filter(g => g.status === 'pendiente' && myStudentIds.has(g.studentId));
  }, [gestiones, recurringClasses, isAdmin]);

  const getTeacherName = () => user?.email?.split('@')[0] || 'Profesor';
  const showNotification = (msg) => { setNotification(msg); setTimeout(() => setNotification(null), 3000); };

  const recordsForSelectedDate = useMemo(() => records.filter(r => r.date === date).sort((a, b) => String(a.time).localeCompare(String(b.time))), [records, date]);
  const selectedDailyReport = useMemo(() => dailyReports.find(r => r.id === date), [dailyReports, date]);

  const monthlyPayroll = useMemo(() => {
    const currentMonth = date.substring(0, 7); 
    const prevMonth = getPreviousMonthStr(currentMonth);

    const currentRecords = records.filter(r => r.date?.startsWith(currentMonth) && !r.isRenounced);
    const currentHours = currentRecords.reduce((acc, r) => acc + normalizeNumber(r.duration || 60), 0) / 60;

    const prevRecords = records.filter(r => r.date?.startsWith(prevMonth) && !r.isRenounced);
    const prevUniqueDays = new Set(prevRecords.map(r => r.date)).size;
    const avgDailyMins = prevUniqueDays > 0 ? (prevRecords.reduce((acc, r) => acc + normalizeNumber(r.duration || 60), 0) / prevUniqueDays) : 0;

    const vacationsThisMonth = (settings.vacaciones || []).filter(d => d.startsWith(currentMonth)).length;
    const projectedHours = (vacationsThisMonth * avgDailyMins) / 60;

    const totalHours = currentHours + projectedHours;
    return { 
      realHours: currentHours.toFixed(2), projectedHours: projectedHours.toFixed(2),
      vacationDays: vacationsThisMonth, totalHours: totalHours.toFixed(2), 
      earnings: (totalHours * (settings.hourlyRate || 0)).toFixed(2) 
    };
  }, [records, date, settings]);

  const buildAttendanceDetails = () => {
    if (recordsForSelectedDate.length === 0) return 'No hay registros de asistencia guardados para esta fecha.';
    return recordsForSelectedDate.map(r => {
      const students = r.students || [];
      const present = students.filter(s => s.status === 'present').map(s => `- ${s.name}${s.isRecovery ? ' (Rec.)' : ''}`).join('\n') || '- Ninguno';
      const notified = students.filter(s => s.status === 'notified').map(s => `- ${s.name}`).join('\n') || '- Ninguno';
      const absent = students.filter(s => s.status === 'absent').map(s => `- ${s.name}`).join('\n') || '- Ninguno';
      return `CLASE: ${r.time} - ${r.subject} ${r.isRenounced ? '(HORA RENUNCIADA)' : ''}\nSede: ${r.sede||''} (${r.sala||''})\nProfesor: ${r.teacher}\nTotal: ${students.length}\nNotas: ${r.notes || 'Ninguna'}\n\nPresentes:\n${present}\n\nAvisaron:\n${notified}\n\nFaltaron:\n${absent}`.trim();
    }).join('\n\n---------------------------------\n\n');
  };

  const sendReportByEmail = async (formData = null) => {
    if (!user) return;
    const report = formData || selectedDailyReport || dailyForm;
    if (recordsForSelectedDate.length === 0 && !report?.generalFeedback?.trim()) {
      return showNotification({ type: 'error', text: 'No hay datos para enviar.' });
    }
    setIsSendingReport(true);
    const payload = {
      profesor: getTeacherName(), profesorEmail: user.email, fecha: formatDateSpanish(date),
      horas: monthlyPayroll.realHours, asistenciaDetallada: buildAttendanceDetails(),
      observaciones: `¿Cómo han ido?\n${report?.generalFeedback||'Nada'}\n\nIncidencias:\n${report?.incidents||'Nada'}\n\nNuevos:\n${report?.newStudents||'Nada'}\n\nMaterial:\n${report?.materialIssues||'Nada'}`,
      enviadoDesde: 'App profesores'
    };
    try {
      await fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload) });
      showNotification({ type: 'success', text: 'Informe enviado.' });
    } catch (error) { showNotification({ type: 'error', text: 'No se pudo enviar.' }); } 
    finally { setIsSendingReport(false); }
  };

  const startSession = (scheduledClass = null) => {
    if (scheduledClass) {
      const exceptionsToday = scheduledClass.exceptions?.[date] || {};
      setCurrentSession({
        isNew: false, classId: scheduledClass.id, time: scheduledClass.time || '17:00', sede: scheduledClass.sede || 'Tarragona', sala: scheduledClass.sala || 'Sala 1',
        teacher: scheduledClass.teacher || getTeacherName(), subject: scheduledClass.subject || '', capacity: scheduledClass.capacity || '',
        duration: scheduledClass.duration || 60, notes: scheduledClass.notes || '', dayOfWeek: scheduledClass.dayOfWeek,
        isRecurring: true, exceptions: scheduledClass.exceptions || {}, 
        students: (scheduledClass.students || []).map(s => ({ ...s, status: exceptionsToday[s.id] || (s.isPaused ? 'paused' : 'present') })),
        newStudentName: '', newStudentEmail: '', isAddingRecovery: false, cancelledDates: scheduledClass.cancelledDates || [], isSubstitution: false
      });
    } else {
      setCurrentSession({
        isNew: true, classId: Date.now().toString(), time: '17:00', sede: 'Tarragona', sala: 'Sala 1', teacher: getTeacherName(),
        subject: '', capacity: '', duration: 60, notes: '', isRecurring: true, exceptions: {}, students: [],
        newStudentName: '', newStudentEmail: '', isAddingRecovery: false, cancelledDates: [], isSubstitution: false
      });
    }
  };

  const assumeSubstitution = (sub) => {
    setDate(sub.date);
    setCurrentSession({
      isNew: false, classId: `sub-${sub.originalClassId}`, time: sub.time || '17:00', sede: sub.sede || 'Tarragona', sala: sub.sala || 'Sala 1',
      teacher: getTeacherName(), subject: sub.subject || '', capacity: sub.capacity || '', duration: sub.duration || 60, notes: sub.notes || '',
      dayOfWeek: getDayOfWeek(sub.date), isRecurring: false, exceptions: {},
      students: (sub.students || []).map(s => ({ ...s, status: s.isPaused ? 'paused' : 'present' })),
      newStudentName: '', newStudentEmail: '', isAddingRecovery: false, cancelledDates: [], isSubstitution: true, substitutionId: sub.id
    });
  };

  const handleSessionFieldChange = (field, value) => setCurrentSession({ ...currentSession, [field]: value });
  
  const handleStatusChange = (id, newStatus) => {
    setCurrentSession({ ...currentSession, students: currentSession.students.map(s => s.id === id ? { ...s, status: newStatus } : s) });
  };

  const togglePauseStudent = (id) => {
    setCurrentSession({ ...currentSession, students: currentSession.students.map(s => s.id === id ? { ...s, isPaused: !s.isPaused, status: !s.isPaused ? 'paused' : 'present' } : s) });
  };

  const addStudent = async () => {
    const studentName = (currentSession.newStudentName || '').trim();
    const studentEmail = (currentSession.newStudentEmail || '').trim().toLowerCase();
    if (!studentName) return;

    if (currentSession.capacity && currentSession.students.length >= parseInt(currentSession.capacity, 10)) {
      return showNotification({ type: 'error', text: `Aforo completo. Límite: ${currentSession.capacity}.` });
    }

    let studentId;
    let existingStudent = globalStudents.find(s => s.name.toLowerCase() === studentName.toLowerCase() || (studentEmail && s.email === studentEmail));
    
    if (existingStudent) studentId = existingStudent.id;
    else {
      studentId = Date.now().toString();
      await setDoc(doc(db, 'artifacts', appId, 'students', studentId), { name: studentName, email: studentEmail, claimed: false, instruments: [currentSession.subject], classes: [currentSession.classId] });
    }

    if (currentSession.isAddingRecovery) {
      const hasValidTicket = tickets.some(t => t.studentId === studentId && !t.isUsed && date >= t.validFrom && date <= t.validUntil);
      if (!hasValidTicket) return showNotification({ type: 'error', text: 'El alumno no tiene tickets válidos.' });
    }

    setCurrentSession({
      ...currentSession,
      students: [...currentSession.students, { id: studentId, name: studentName, email: studentEmail, status: 'present', isRecovery: currentSession.isAddingRecovery, isPaused: false }],
      newStudentName: '', newStudentEmail: '', isAddingRecovery: false
    });
  };

  const removeStudent = (id) => setCurrentSession({ ...currentSession, students: currentSession.students.filter(s => s.id !== id) });

  const saveClassOnly = async () => {
    if (!currentSession.subject || !currentSession.capacity) return showNotification({ type: 'error', text: 'Instrumento y aforo son obligatorios.' });
    if (currentSession.students.length > parseInt(currentSession.capacity, 10)) return showNotification({ type: 'error', text: 'Hay más alumnos que capacidad.' });

    const dayToSave = currentSession.isNew ? getDayOfWeek(date) : currentSession.dayOfWeek;
    const classIdToSave = currentSession.isNew ? Date.now().toString() : currentSession.classId;

    if (recurringClasses.some(rc => rc.dayOfWeek === dayToSave && rc.time === currentSession.time && rc.id !== classIdToSave)) {
      return showNotification({ type: 'error', text: 'Ya tienes otra clase a esa hora.' });
    }

    const templateStudents = currentSession.students.filter(s => !s.isRecovery).map(s => ({ id: s.id, name: s.name, email: s.email || '', isPaused: s.isPaused || false }));
    const isFutureDate = date > new Date().toISOString().split('T')[0];
    let finalExceptions = currentSession.exceptions || {};

    if (isFutureDate && !currentSession.isNew && !currentSession.isSubstitution) {
      const exceptionsForDate = {};
      currentSession.students.forEach(s => { if (s.status !== 'present' && s.status !== 'paused') exceptionsForDate[s.id] = s.status; });
      finalExceptions[date] = exceptionsForDate;
    }

    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses', classIdToSave), {
      dayOfWeek: dayToSave, time: currentSession.time, sede: currentSession.sede || 'Tarragona', sala: currentSession.sala || 'Sala 1', teacher: currentSession.teacher,
      subject: currentSession.subject, capacity: currentSession.capacity, duration: currentSession.duration || 60, notes: currentSession.notes || '',
      cancelledDates: currentSession.cancelledDates || [], students: templateStudents, exceptions: finalExceptions
    });
    showNotification({ type: 'success', text: 'Plantilla guardada.' });
    setCurrentSession(null);
  };

  const dashboardItems = useMemo(() => {
    const items = [];
    const recordsToday = records.filter(r => r.date === date);
    const scheduledToday = recurringClasses.filter(rc => rc.dayOfWeek === getDayOfWeek(date) && !(rc.cancelledDates || []).includes(date));

    scheduledToday.forEach(rc => {
      const rec = recordsToday.find(r => r.classId === rc.id);
      items.push(rec ? { type: 'completed', data: rec } : { type: 'pending', data: rc });
    });
    recordsToday.forEach(r => {
      if (!scheduledToday.find(rc => rc.id === r.classId)) items.push({ type: 'completed', data: r });
    });
    return items.sort((a, b) => (a.data.time || '').localeCompare(b.data.time || ''));
  }, [date, records, recurringClasses]);

  const checkDeadHourAndSave = () => {
    if (!currentSession.subject || !currentSession.capacity) return showNotification({ type: 'error', text: 'Instrumento y capacidad obligatorios.' });
    if (currentSession.students.length > parseInt(currentSession.capacity, 10)) return showNotification({ type: 'error', text: 'Aforo superado.' });

    if (!currentSession.isSubstitution && recurringClasses.some(rc => rc.dayOfWeek === (currentSession.isNew ? getDayOfWeek(date) : currentSession.dayOfWeek) && rc.time === currentSession.time && rc.id !== (currentSession.isNew ? '' : currentSession.classId))) {
      return showNotification({ type: 'error', text: 'Hay otra clase a esa hora.' });
    }

    const activeStudents = currentSession.students.filter(s => !s.isPaused);
    if (activeStudents.length > 0 && activeStudents.every(s => s.status === 'absent' || s.status === 'notified')) {
      const times = dashboardItems.map(i => i.data.time);
      times.push(currentSession.time);
      if (currentSession.time === times.sort()[times.length - 1]) {
        showNotification({ type: 'success', text: "Clase vacía y última hora. Guardando..." });
        executeSaveRecord(null, false);
      } else {
        setDeadHourModal({ tasks: settings.generalTasks || [], subject: currentSession.subject });
      }
    } else {
      executeSaveRecord(null, false);
    }
  };

  const executeSaveRecord = async (deadHourNote = null, isRenounced = false) => {
    try {
      const recordId = Date.now().toString();
      const finalNotes = isRenounced ? `[RENUNCIA]: ${currentSession.notes || ''}` : deadHourNote ? `[HORA MUERTA]: ${deadHourNote}. ${currentSession.notes || ''}` : currentSession.notes || '';

      const promises = currentSession.students.map(async (s) => {
        if (s.status === 'notified' && !s.isRecovery && !s.isPaused && tickets.filter(t => t.studentId === s.id && t.originalDate.startsWith(date.substring(0,7))).length < 2) {
          const { validFrom, validUntil } = generateTicketDates(date);
          await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tickets', `${Date.now()}-${s.id}`), { studentId: s.id, studentName: s.name, subject: currentSession.subject, originalDate: date, validFrom, validUntil, isUsed: false });
        }
        if (s.isRecovery && s.status === 'present') {
          const p = tickets.filter(t => t.studentId === s.id && !t.isUsed).sort((a,b)=>a.validFrom.localeCompare(b.validFrom));
          if (p.length > 0) await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tickets', p[0].id), { isUsed: true }, { merge: true });
        }
      });
      await Promise.all(promises);

      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'records', recordId), {
        classId: currentSession.classId, date, time: currentSession.time, sede: currentSession.sede || 'Tarragona', sala: currentSession.sala || 'Sala 1', teacher: currentSession.teacher,
        subject: currentSession.subject, capacity: currentSession.capacity, duration: currentSession.duration || 60, notes: finalNotes, isRenounced, students: currentSession.students
      });

      if (currentSession.isRecurring && !currentSession.isSubstitution) {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses', currentSession.classId), {
          dayOfWeek: currentSession.isNew ? getDayOfWeek(date) : currentSession.dayOfWeek, time: currentSession.time, sede: currentSession.sede || 'Tarragona', sala: currentSession.sala || 'Sala 1', teacher: currentSession.teacher,
          subject: currentSession.subject, capacity: currentSession.capacity, duration: currentSession.duration || 60, notes: currentSession.notes || '', cancelledDates: currentSession.cancelledDates || [],
          students: currentSession.students.filter(s => !s.isRecovery).map(s => ({ id: s.id, name: s.name, email: s.email || '', isPaused: s.isPaused || false })), exceptions: currentSession.exceptions || {}
        });
      }

      if (currentSession.isSubstitution && currentSession.substitutionId) await deleteDoc(doc(db, 'artifacts', appId, 'substitutions', currentSession.substitutionId));

      showNotification({ type: 'success', text: isRenounced ? 'Renuncia registrada.' : 'Asistencia guardada.' });
      setCurrentSession(null); setDeadHourModal(null);
    } catch (error) { showNotification({ type: 'error', text: 'Error al guardar.' }); }
  };

  const cancelClassForToday = async (classData) => {
    if (!window.confirm('¿Cancelar clase hoy y enviarla a sustituciones?')) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses', classData.id), { ...classData, cancelledDates: [...(classData.cancelledDates || []), date] });
      await setDoc(doc(db, 'artifacts', appId, 'substitutions', `${classData.id}-${date}`), { originalClassId: classData.id, originalTeacherUid: user.uid, originalTeacherName: classData.teacher || getTeacherName(), date, time: classData.time, sede: classData.sede || 'Tarragona', sala: classData.sala || 'Sala 1', subject: classData.subject, capacity: classData.capacity || '', duration: classData.duration || 60, notes: classData.notes || '', students: classData.students || [] });
      showNotification({ type: 'success', text: 'Clase enviada a bolsa.' });
    } catch (e) { showNotification({ type: 'error', text: 'Error.' }); }
  };

  const deleteRecurringClass = async (classId) => {
    if (!window.confirm('¿Borrar plantilla permanentemente?')) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses', classId));
    showNotification({ type: 'success', text: 'Eliminada.' });
  };

  const DeadHourOverlay = () => {
    const [note, setNote] = useState('');
    const [selTask, setSelTask] = useState('');
    return (
      <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl">
          <div className="flex items-center gap-3 text-red-600 mb-4"><AlertCircle className="w-8 h-8"/><h2 className="text-xl font-bold uppercase tracking-tight">Hora Muerta</h2></div>
          <p className="text-zinc-600 mb-6 font-medium">Todos han faltado. Selecciona una tarea o renuncia.</p>
          <div className="space-y-3 mb-6 max-h-48 overflow-y-auto pr-2">
            {(deadHourModal.tasks || []).length === 0 && <p className="text-sm text-zinc-400 italic">No hay tareas.</p>}
            {(deadHourModal.tasks || []).map((t, i) => <button key={i} onClick={() => setSelTask(t)} className={`w-full text-left p-3 rounded-xl border-2 ${selTask === t ? 'border-black bg-zinc-50 font-bold' : 'border-zinc-100 text-zinc-500'}`}>{t}</button>)}
          </div>
          <textarea placeholder="Detalles..." value={note} onChange={e => setNote(e.target.value)} className="w-full p-4 border-2 border-zinc-200 rounded-xl focus:border-black outline-none mb-6 min-h-[80px]" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button onClick={() => setDeadHourModal(null)} className="w-full bg-zinc-100 text-zinc-600 font-bold py-4 rounded-xl uppercase text-[10px] hover:bg-zinc-200">Cancelar</button>
            <button onClick={() => { if(window.confirm("¿Renunciar a la hora? No sumará a nómina.")) executeSaveRecord(null, true); }} className="w-full bg-amber-100 border-2 border-amber-200 text-amber-800 font-bold py-3 rounded-xl uppercase text-[10px] flex flex-col items-center justify-center gap-1 hover:bg-amber-200"><Coffee className="w-4 h-4" /> Renunciar</button>
            <button disabled={!selTask || !note} onClick={() => executeSaveRecord(`${selTask}: ${note}`, false)} className="w-full bg-black text-white font-bold py-4 rounded-xl uppercase text-[10px] disabled:opacity-30 hover:bg-zinc-800">Confirmar Tarea</button>
          </div>
        </div>
      </div>
    );
  };

  if (loadingData) return <div className="min-h-screen bg-zinc-50 flex items-center justify-center font-sans"><div className="flex flex-col items-center gap-4 p-8 bg-white rounded-3xl shadow-lg border border-zinc-100"><RefreshCw className="w-10 h-10 text-black animate-spin" /><h2 className="text-xl font-black text-slate-800 uppercase tracking-wide">Cargando datos</h2></div></div>;

  const isCapMiss = !currentSession?.capacity;
  const maxC = parseInt(currentSession?.capacity, 10) || 0;
  const currC = currentSession?.students?.length || 0;
  const isCapReach = !isCapMiss && currC >= maxC;
  const isOverC = !isCapMiss && currC > maxC;
  const isDisAdd = isCapMiss || isCapReach;
  const isFuture = date > new Date().toISOString().split('T')[0];
  const isSpecial = (settings.festivos || []).includes(date) || (settings.vacaciones || []).includes(date);
  const upcSubs = substitutions.filter(s => s.date >= new Date().toISOString().split('T')[0]).sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-slate-800 pb-24 md:pb-0">
      {deadHourModal && <DeadHourOverlay />}

      <header className="bg-black text-white p-5 sticky top-0 z-50 shadow-md border-b border-zinc-800">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white p-1.5 rounded-lg"><Music className="w-5 h-5 text-black" /></div>
            <h1 className="text-xl font-black hidden sm:block uppercase tracking-tighter">Escuela Los Mitos</h1>
          </div>
          <div className="flex items-center gap-4">
            {isAdmin && <button onClick={switchToAdmin} className="hidden sm:flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors"><ShieldAlert className="w-4 h-4"/> Modo Dios</button>}
            <span className="text-zinc-300 text-sm flex items-center gap-2 bg-zinc-800 px-4 py-2 rounded-xl font-medium"><User className="w-4 h-4" /><span className="max-w-[100px] sm:max-w-xs truncate">{user.email}</span></span>
            <button onClick={logout} className="text-zinc-400 hover:text-white transition-colors" title="Cerrar Sesión"><LogOut className="w-6 h-6" /></button>
          </div>
        </div>
      </header>

      {notification && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-[60] animate-in slide-in-from-top-4 duration-300">
          <div className={`px-6 py-3 rounded-full shadow-2xl text-white font-bold text-sm uppercase tracking-widest flex items-center gap-3 ${notification.type === 'error' ? 'bg-red-600' : 'bg-black'}`}>
            {notification.type === 'error' ? <X className="w-5 h-5" /> : <Check className="w-5 h-5" />}
            {notification.text}
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto p-4 md:p-8 mt-2">
        <div className="flex gap-2 mb-8 bg-white p-2 rounded-2xl shadow-sm border border-zinc-200 overflow-x-auto no-scrollbar">
          {[{ id: 'attendance', label: 'Listas', icon: ClipboardList }, { id: 'notifications', label: 'Avisos', icon: Bell }, { id: 'daily', label: 'Diario', icon: MessageSquare }, { id: 'history', label: 'Historial', icon: History }, { id: 'reports', label: 'Reportes', icon: BarChart3 }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold uppercase text-xs tracking-wider transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-black text-white shadow-md' : 'text-zinc-400 hover:text-black hover:bg-zinc-50'}`}>
              <tab.icon className="w-4 h-4"/> {tab.label}
              {tab.id === 'notifications' && notifications.length > 0 && <span className="bg-red-500 w-2 h-2 rounded-full absolute top-2 right-2 animate-pulse"></span>}
            </button>
          ))}
          {isAdmin && <button onClick={switchToAdmin} className={`sm:hidden flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold uppercase text-xs tracking-wider bg-red-600 text-white shadow-md`}><ShieldAlert className="w-4 h-4"/> Admin</button>}
        </div>

        {/* --- PESTAÑA LISTAS --- */}
        {activeTab === 'attendance' && (
          <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 overflow-hidden">
            {!currentSession ? (
              <>
                {upcSubs.length > 0 && (
                  <div className="m-6 md:m-8 p-6 md:p-8 bg-zinc-900 rounded-3xl shadow-xl relative overflow-hidden">
                    <div className="relative z-10">
                      <h4 className="font-black text-white uppercase tracking-widest text-sm mb-6 flex items-center gap-2"><AlertCircle className="w-5 h-5 text-amber-400"/> Tablón de Sustituciones</h4>
                      <div className="space-y-3">
                        {upcSubs.map(sub => (
                          <div key={sub.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-zinc-800/80 backdrop-blur rounded-2xl border border-zinc-700 hover:border-amber-400">
                            <div><p className="font-black uppercase text-sm text-white">{sub.subject} <span className="text-zinc-400 font-bold ml-2">{formatDateSpanish(sub.date)} a las {sub.time}</span></p><p className="text-xs font-bold text-zinc-400 mt-1 uppercase tracking-widest">Falta: {sub.originalTeacherName} • {(sub.students||[]).length} alumnos</p></div>
                            <button onClick={() => assumeSubstitution(sub)} className="mt-3 sm:mt-0 bg-amber-400 text-amber-950 font-black py-3 px-6 rounded-xl text-[10px] uppercase tracking-widest hover:bg-amber-300">Asumir Clase</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div className="p-6 md:p-8 border-b border-zinc-100 bg-zinc-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-1 w-full sm:w-auto"><label className="text-xs font-black text-zinc-400 flex items-center gap-1 uppercase tracking-widest"><Calendar className="w-3 h-3" /> Agenda del día</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full sm:w-auto p-3 bg-white border-2 border-zinc-200 rounded-xl focus:border-black outline-none font-bold" /></div>
                  <button onClick={() => startSession(null)} disabled={isSpecial} className="w-full sm:w-auto bg-black text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 shadow-md uppercase text-xs tracking-widest disabled:opacity-30"><ClipboardList className="w-5 h-5" /> Nueva Clase</button>
                </div>
                <div className="p-6 md:p-8">
                  <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2 uppercase tracking-wide">{getDayName(getDayOfWeek(date))}, {formatDateSpanish(date)}</h3>
                  {isSpecial && (
                    <div className={`p-6 rounded-2xl mb-8 flex items-center gap-4 ${(settings.festivos||[]).includes(date) ? 'bg-amber-100 text-amber-900 border-2 border-amber-200' : 'bg-emerald-100 text-emerald-900 border-2 border-emerald-200'}`}>
                      {(settings.festivos||[]).includes(date) ? <PartyPopper className="w-10 h-10 shrink-0"/> : <Palmtree className="w-10 h-10 shrink-0"/>}
                      <div><h4 className="font-black uppercase tracking-widest text-lg">{(settings.festivos||[]).includes(date) ? 'Día Festivo' : 'Día de Vacaciones'}</h4><p className="text-sm font-medium mt-1">Centro cerrado. No es necesario pasar lista.</p></div>
                    </div>
                  )}
                  {dashboardItems.length === 0 ? (
                    <div className="text-center py-16 bg-zinc-50 rounded-2xl border-2 border-dashed border-zinc-200"><p className="text-zinc-400 font-bold uppercase tracking-widest">No hay clases en agenda.</p></div>
                  ) : (
                    <div className="space-y-4">
                      {dashboardItems.map((item, idx) => (
                        <div key={idx} className={`flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 rounded-2xl border-2 transition-all ${item.type === 'completed' || isSpecial ? 'bg-zinc-50 border-zinc-100 opacity-70' : 'bg-white border-zinc-100 hover:border-black shadow-sm'}`}>
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-black ${item.type === 'completed' || isSpecial ? 'bg-zinc-200 text-zinc-500' : 'bg-black text-white'}`}><span className="text-sm leading-none">{(item.data.time||'').split(':')[0]}</span><span className="text-[10px] opacity-70">{(item.data.time||'').split(':')[1]}</span></div>
                            <div>
                              <p className={`font-black uppercase tracking-wide text-sm ${item.type === 'completed' || isSpecial ? 'text-zinc-500' : 'text-slate-800'}`}>{item.data.subject}</p>
                              <p className="text-xs font-bold text-zinc-400 flex items-center gap-1 mt-1 uppercase"><MapPin className="w-3 h-3" /> {item.data.sede || 'Tarragona'} ({item.data.sala || 'Sala 1'}) <span className="mx-1">•</span> <User className="w-3 h-3" /> Prof: {item.data.teacher} <span className="mx-1">•</span> {(item.data.students||[]).length} {item.data.capacity ? `/ ${item.data.capacity}` : ''} alumnos</p>
                            </div>
                          </div>
                          <div className="w-full sm:w-auto text-right mt-4 sm:mt-0 flex items-center justify-end gap-2">
                            {isSpecial ? (
                              <span className="bg-zinc-200 text-zinc-500 px-4 py-2 rounded-lg font-black text-[10px] uppercase border border-zinc-300">No Laborable</span>
                            ) : item.type === 'completed' ? (
                              <span className="inline-flex w-full justify-center sm:w-auto items-center gap-1 bg-emerald-100 text-emerald-700 text-xs px-4 py-2 rounded-lg font-black border border-emerald-200 uppercase tracking-widest"><Check className="w-4 h-4" /> Completado</span>
                            ) : (
                              <>
                                <button onClick={() => startSession(item.data)} className="w-full sm:w-auto bg-zinc-100 hover:bg-black hover:text-white text-black font-bold py-2.5 px-5 rounded-xl flex items-center justify-center gap-2 text-xs uppercase tracking-widest"><Play className="w-4 h-4" /> Pasar Lista</button>
                                <button onClick={() => cancelClassForToday(item.data)} className="p-2.5 text-zinc-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl" title="Cancelar solo hoy"><CalendarOff className="w-5 h-5" /></button>
                                <button onClick={() => deleteRecurringClass(item.data.id)} className="p-2.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl" title="Eliminar permanente"><Trash2 className="w-5 h-5" /></button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="p-6 md:p-8 border-b border-zinc-100 bg-white relative">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                    <div className="flex flex-col"><h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{currentSession.isNew ? 'Nueva Clase' : 'Pasando lista'}</h2><span className="text-sm font-bold text-zinc-400 flex items-center gap-1 mt-1 uppercase tracking-widest"><Calendar className="w-4 h-4" /> {getDayName(getDayOfWeek(date))}, {formatDateSpanish(date)}</span></div>
                    <button onClick={() => setCurrentSession(null)} className="text-zinc-500 hover:text-black hover:bg-zinc-100 text-xs font-black uppercase tracking-widest px-5 py-2.5 rounded-xl border-2 border-zinc-200 w-full sm:w-auto text-center">Cerrar Vista</button>
                  </div>

                  {currentSession.isSubstitution && <div className="mb-6 p-4 bg-zinc-100 border-2 border-zinc-300 rounded-xl flex items-center gap-3"><AlertCircle className="text-black w-6 h-6 shrink-0"/><p className="text-xs font-bold text-slate-800">Pasando lista como sustituto. Se guardará solo hoy.</p></div>}
                  {isFuture && !currentSession.isNew && !currentSession.isSubstitution && <div className="mb-6 p-4 bg-purple-50 border-2 border-purple-200 rounded-xl flex items-center gap-3"><Calendar className="text-purple-600 w-6 h-6 shrink-0"/><p className="text-xs font-bold text-purple-900">Fecha futura. Marca a los que te han avisado y dale a "Guardar Previsión".</p></div>}

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                    <div className="space-y-2"><label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest"><Clock className="w-3 h-3 inline" /> Horario</label><input type="time" value={currentSession.time} onChange={(e) => handleSessionFieldChange('time', e.target.value)} disabled={!currentSession.isNew} className={`w-full p-4 rounded-xl font-bold outline-none border-2 ${!currentSession.isNew ? 'bg-zinc-100 text-zinc-400 border-zinc-200' : 'bg-zinc-50 border-zinc-200 focus:border-black'}`} /></div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest"><MapPin className="w-3 h-3 inline" /> Sede</label><select value={currentSession.sede} onChange={(e) => handleSessionFieldChange('sede', e.target.value)} disabled={!currentSession.isNew} className={`w-full p-4 rounded-xl font-bold outline-none border-2 ${!currentSession.isNew ? 'bg-zinc-100 text-zinc-400 border-zinc-200' : 'bg-zinc-50 border-zinc-200 focus:border-black'}`}>{SEDES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest"><LayoutGrid className="w-3 h-3 inline" /> Sala</label><select value={currentSession.sala} onChange={(e) => handleSessionFieldChange('sala', e.target.value)} disabled={!currentSession.isNew} className={`w-full p-4 rounded-xl font-bold outline-none border-2 ${!currentSession.isNew ? 'bg-zinc-100 text-zinc-400 border-zinc-200' : 'bg-zinc-50 border-zinc-200 focus:border-black'}`}>{SALAS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest"><Music className="w-3 h-3 inline" /> Inst.</label><select value={currentSession.subject} onChange={(e) => handleSessionFieldChange('subject', e.target.value)} disabled={!currentSession.isNew} className={`w-full p-4 rounded-xl font-bold outline-none border-2 ${!currentSession.isNew ? 'bg-zinc-100 text-zinc-400 border-zinc-200' : 'bg-zinc-50 border-zinc-200 focus:border-black'}`}><option value="" disabled>Selecciona...</option>{INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}</select></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="space-y-2"><label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest"><User className="w-3 h-3 inline" /> Aforo Máx</label><input type="number" min="1" value={currentSession.capacity} onChange={(e) => handleSessionFieldChange('capacity', e.target.value)} disabled={!currentSession.isNew} className={`w-full p-4 rounded-xl font-bold outline-none border-2 ${!currentSession.isNew ? 'bg-zinc-100 text-zinc-400 border-zinc-200' : 'bg-zinc-50 border-zinc-200 focus:border-black'}`} /></div>
                    <div className="space-y-2"><label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest"><Timer className="w-3 h-3 inline" /> Duración (min)</label><input type="number" min="15" step="5" value={currentSession.duration} onChange={(e) => handleSessionFieldChange('duration', e.target.value)} disabled={!currentSession.isNew} className={`w-full p-4 rounded-xl font-bold outline-none border-2 ${!currentSession.isNew ? 'bg-zinc-100 text-zinc-400 border-zinc-200' : 'bg-zinc-50 border-zinc-200 focus:border-black'}`} /></div>
                  </div>
                  <div className="space-y-2 mt-2"><label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest"><BookOpen className="w-3 h-3 inline" /> Cuaderno de Bitácora</label><textarea value={currentSession.notes} onChange={(e) => handleSessionFieldChange('notes', e.target.value)} className="w-full p-4 bg-amber-50/40 border-2 border-amber-100 rounded-xl focus:border-amber-400 outline-none text-slate-800 font-medium text-sm min-h-[100px] resize-y" /></div>
                  {currentSession.isNew && !currentSession.isSubstitution && (
                    <div className="mt-6 flex items-center gap-2 p-4 bg-zinc-50 rounded-xl border-2 border-zinc-100"><input type="checkbox" id="recurring" checked={currentSession.isRecurring} onChange={(e) => handleSessionFieldChange('isRecurring', e.target.checked)} className="w-5 h-5 text-black rounded" /><label htmlFor="recurring" className="text-xs font-black uppercase tracking-widest">Repetir cada semana</label></div>
                  )}
                </div>

                <div className="p-6 md:p-8">
                  <div className={`flex flex-col mb-8 p-6 rounded-2xl border-2 ${isCapMiss ? 'bg-amber-50/50 border-amber-200' : isCapReach ? 'bg-red-50 border-red-200' : 'bg-zinc-50 border-zinc-200'}`}>
                    <h3 className="text-sm uppercase tracking-widest font-black text-slate-800 mb-4 flex items-center gap-2"><UserPlus className="w-5 h-5 text-black" /> Añadir Alumno {currentSession.capacity && <span className={`ml-2 px-3 py-1 rounded-lg text-[10px] ${isOverC ? 'bg-red-600 text-white' : isCapReach ? 'bg-red-200 text-red-900' : 'bg-zinc-200 text-zinc-600'}`}>({currC}/{currentSession.capacity})</span>}</h3>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full">
                      <div className="w-full sm:flex-1 relative">
                        <input type="text" placeholder={isCapMiss ? "Escribe aforo arriba..." : isCapReach ? "Aforo completo." : "Buscar alumno..."} value={currentSession.newStudentName} onChange={(e) => handleSessionFieldChange('newStudentName', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addStudent()} disabled={isDisAdd} className={`w-full p-4 text-sm font-bold rounded-xl outline-none border-2 ${isDisAdd ? 'bg-zinc-100 border-zinc-200' : 'bg-white border-zinc-200 focus:border-black'}`} />
                        {!isDisAdd && (currentSession.newStudentName||'').length >= 2 && (
                          <div className="absolute left-0 right-0 top-full mt-2 bg-white border-2 border-zinc-800 rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto">
                            {globalStudents.filter(s => s.name.toLowerCase().includes(currentSession.newStudentName.trim().toLowerCase())).length === 0 ? (
                              <div className="p-4 text-sm font-bold text-zinc-500 bg-zinc-50">No hay. Se guardará como nuevo.</div>
                            ) : (
                              globalStudents.filter(s => s.name.toLowerCase().includes(currentSession.newStudentName.trim().toLowerCase())).map(student => (
                                <div key={student.id} onClick={() => handleSessionFieldChange('newStudentName', student.name)} className="p-4 text-sm font-bold text-slate-700 hover:bg-black hover:text-white cursor-pointer border-b border-zinc-100 flex items-center gap-3"><User className="w-4 h-4 opacity-50" />{student.name}</div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                      <div className="w-full sm:flex-1 relative"><input type="email" placeholder="Email (Opcional)" value={currentSession.newStudentEmail} onChange={(e) => handleSessionFieldChange('newStudentEmail', e.target.value)} disabled={isDisAdd} className={`w-full p-4 text-sm font-bold rounded-xl outline-none border-2 ${isDisAdd ? 'bg-zinc-100 border-zinc-200' : 'bg-white border-zinc-200 focus:border-black'}`} /></div>
                      <div className={`flex items-center gap-3 w-full sm:w-auto px-4 py-4 rounded-xl border-2 ${isDisAdd ? 'bg-zinc-100 border-zinc-200 opacity-50' : 'bg-amber-50 border-amber-200'}`}><input type="checkbox" id="isRecovery" checked={currentSession.isAddingRecovery || false} onChange={(e) => handleSessionFieldChange('isAddingRecovery', e.target.checked)} disabled={isDisAdd} className="w-5 h-5 accent-amber-600 rounded cursor-pointer" /><label htmlFor="isRecovery" className="text-xs font-black text-amber-900 uppercase tracking-widest cursor-pointer">Recuperar</label></div>
                      <button onClick={addStudent} disabled={isDisAdd} className={`w-full sm:w-auto px-8 py-4 font-black text-xs tracking-widest uppercase rounded-xl shadow-sm ${isDisAdd ? 'bg-zinc-200 text-zinc-400' : 'bg-black text-white hover:bg-zinc-800'}`}>Añadir</button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {(currentSession.students || []).map((student) => (
                      <div key={student.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 md:p-5 border-2 rounded-2xl gap-4 ${student.isPaused ? 'bg-blue-50/50 border-blue-100' : 'bg-zinc-50 border-zinc-100'}`}>
                        <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
                          <div className="flex flex-col"><span className={`font-bold text-lg ${student.isPaused ? 'text-zinc-400 line-through' : 'text-slate-800'}`}>{student.name}</span>{student.email && <span className="text-[10px] text-zinc-400 font-bold">{student.email}</span>}{student.isRecovery && !student.isPaused && <span className="text-[10px] uppercase font-black text-amber-600 tracking-widest mt-1"><CornerDownRight className="w-3 h-3 inline" /> Rec</span>}</div>
                          <div className="flex gap-2 sm:hidden">
                            <button onClick={() => togglePauseStudent(student.id)} className={`p-2 rounded-lg ${student.isPaused ? 'bg-blue-100 text-blue-600' : 'text-zinc-400 hover:text-blue-500'}`}><Snowflake className="w-5 h-5" /></button>
                            <button onClick={() => removeStudent(student.id)} className="text-zinc-400 hover:text-red-500 p-2"><Trash2 className="w-5 h-5" /></button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          {student.isPaused ? (
                            <div className="w-full sm:w-auto px-4 py-3 rounded-xl text-xs font-black uppercase bg-blue-100 text-blue-700 text-center"><Snowflake className="w-4 h-4 inline mr-2"/> En Mantenimiento</div>
                          ) : (
                            <div className="grid grid-cols-3 sm:flex w-full bg-white p-1.5 rounded-xl border border-zinc-200">
                              <button onClick={() => handleStatusChange(student.id, 'present')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-black uppercase transition-all ${student.status === 'present' ? 'bg-emerald-500 text-white shadow-md' : 'bg-white text-zinc-500 hover:bg-zinc-100'}`}><Check className="w-4 h-4" /> <span className="hidden md:inline">Presente</span></button>
                              <button onClick={() => handleStatusChange(student.id, 'notified')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-black uppercase transition-all ${student.status === 'notified' ? 'bg-amber-400 text-amber-900 shadow-md' : 'bg-white text-zinc-500 hover:bg-zinc-100'}`}><AlertCircle className="w-4 h-4" /> <span className="hidden md:inline">Avisó</span></button>
                              <button onClick={() => handleStatusChange(student.id, 'absent')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-black uppercase transition-all ${student.status === 'absent' ? 'bg-rose-500 text-white shadow-md' : 'bg-white text-zinc-500 hover:bg-zinc-100'}`}><X className="w-4 h-4" /> <span className="hidden md:inline">Faltó</span></button>
                            </div>
                          )}
                        </div>
                        <div className="hidden sm:flex items-center gap-2">
                          <button onClick={() => togglePauseStudent(student.id)} className={`p-3 rounded-xl ${student.isPaused ? 'bg-blue-100 text-blue-600' : 'text-zinc-300 hover:text-blue-500'}`}><Snowflake className="w-5 h-5" /></button>
                          <button onClick={() => removeStudent(student.id)} className="text-zinc-300 hover:text-rose-600 p-3 rounded-xl"><Trash2 className="w-5 h-5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {isOverC && <div className="mt-8 p-5 bg-red-50 border-2 border-red-200 rounded-2xl flex items-start gap-4"><AlertCircle className="w-8 h-8 text-red-500 shrink-0" /><div><h4 className="font-black text-red-800 uppercase tracking-widest text-sm">Aforo superado</h4></div></div>}

                  <div className="mt-10 flex flex-col sm:flex-row gap-4 pt-8 border-t border-zinc-100">
                    {!currentSession.isSubstitution && <button onClick={saveClassOnly} disabled={isOverC} className={`w-full sm:w-1/2 font-black uppercase tracking-widest text-xs py-4 px-6 rounded-2xl flex items-center justify-center gap-2 shadow-sm ${isOverC ? 'bg-zinc-100 text-zinc-400' : 'bg-white border-2 border-zinc-200 hover:bg-zinc-50'}`}><Calendar className="w-5 h-5" /> {currentSession.isNew ? 'Solo Crear Clase' : (isFuture ? 'Guardar Previsión' : 'Actualizar Plantilla')}</button>}
                    <button onClick={checkDeadHourAndSave} disabled={isOverC || isFuture} className={`${currentSession.isSubstitution ? 'w-full' : 'w-full sm:w-1/2'} font-black uppercase tracking-widest text-xs py-4 px-6 rounded-2xl flex items-center justify-center gap-2 shadow-lg ${(isOverC || isFuture) ? 'bg-zinc-300 text-zinc-500' : 'bg-black text-white hover:bg-zinc-800'}`}><Save className="w-5 h-5" /> Guardar Asistencia</button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* --- PESTAÑA AVISOS --- */}
        {activeTab === 'notifications' && (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div><h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Notificaciones</h2><p className="text-sm font-medium text-zinc-500 mt-1">Gestiones pendientes de tus alumnos.</p></div>
              <span className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${notifications.length > 0 ? 'bg-red-500 text-white animate-pulse' : 'bg-zinc-200 text-zinc-500'}`}>{notifications.length} Pendientes</span>
            </div>
            {notifications.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-3xl border border-zinc-200 shadow-sm"><CheckCircle className="w-16 h-16 text-zinc-200 mx-auto mb-4" /><h3 className="text-lg font-bold uppercase tracking-widest text-zinc-400">No hay avisos</h3></div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {notifications.map(n => (
                  <div key={n.id} className="bg-white border-2 border-zinc-100 p-6 rounded-3xl shadow-sm flex items-start gap-4">
                    <div className={`p-3 rounded-2xl shrink-0 ${n.type === 'baja' ? 'bg-red-50 text-red-500' : n.type === 'cambio_horario' ? 'bg-blue-50 text-blue-500' : 'bg-emerald-50 text-emerald-500'}`}>
                      {n.type === 'baja' ? <UserMinus className="w-6 h-6"/> : n.type === 'cambio_horario' ? <RefreshCcw className="w-6 h-6"/> : <PlusCircle className="w-6 h-6"/>}
                    </div>
                    <div>
                      <h3 className="font-black text-lg uppercase tracking-tight">{n.studentName}</h3>
                      <p className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-3">Solicita: {n.title}</p>
                      <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100"><p className="text-sm font-medium text-zinc-600 italic">"{n.details || 'Sin detalles'}"</p></div>
                      {n.targetMonth && <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mt-3">Para: {n.targetMonth}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- PESTAÑA DIARIO --- */}
        {activeTab === 'daily' && (
          <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 overflow-hidden">
            <div className="p-6 md:p-8 border-b border-zinc-100 bg-zinc-50 flex items-center justify-between"><div className="space-y-1 w-full sm:w-auto"><label className="text-xs font-black text-zinc-400 flex items-center gap-1 uppercase tracking-widest"><Calendar className="w-3 h-3" /> Fecha del reporte</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full sm:w-auto p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-slate-700" /></div></div>
            {isSpecial ? (
              <div className="p-16 text-center">{(settings.festivos||[]).includes(date) ? <PartyPopper className="w-20 h-20 text-amber-300 mx-auto mb-6"/> : <Palmtree className="w-20 h-20 text-emerald-300 mx-auto mb-6"/><h3 className="text-2xl font-black uppercase tracking-widest text-slate-800">Día No Laborable</h3></div>
            ) : (
              <div className="p-6 md:p-8 space-y-8">
                <div><h2 className="text-2xl font-black text-slate-800 mb-2 uppercase tracking-tight">Diario de Trabajo</h2></div>
                <div className="space-y-6">
                  <div className="space-y-3"><label className="block text-sm font-black uppercase text-slate-800">1. ¿Cómo han ido las clases hoy? *</label><textarea required value={dailyForm.generalFeedback} onChange={(e) => setDailyForm({ ...dailyForm, generalFeedback: e.target.value })} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl outline-none min-h-[100px] resize-y" /></div>
                  <div className="space-y-3"><label className="block text-sm font-black uppercase text-slate-800">2. Incidencias</label><textarea value={dailyForm.incidents} onChange={(e) => setDailyForm({ ...dailyForm, incidents: e.target.value })} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl outline-none min-h-[80px]" /></div>
                  <div className="space-y-3"><label className="block text-sm font-black uppercase text-slate-800">3. Alumnos nuevos</label><textarea value={dailyForm.newStudents} onChange={(e) => setDailyForm({ ...dailyForm, newStudents: e.target.value })} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl outline-none min-h-[80px]" /></div>
                  <div className="space-y-3"><label className="block text-sm font-black uppercase text-slate-800">4. Estado del material</label><textarea value={dailyForm.materialIssues} onChange={(e) => setDailyForm({ ...dailyForm, materialIssues: e.target.value })} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl outline-none min-h-[80px]" /></div>
                </div>
                <div className="pt-8 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-zinc-100">
                  <button onClick={() => saveDailyReport(false)} className="w-full bg-white border-2 border-zinc-200 text-black hover:bg-zinc-50 font-black uppercase tracking-widest text-xs py-4 px-6 rounded-2xl flex items-center justify-center gap-2"><Save className="w-5 h-5" /> Guardar Borrador</button>
                  <button onClick={saveAndSendDailyReport} disabled={isSendingReport} className="w-full bg-black hover:bg-zinc-800 text-white font-black uppercase tracking-widest text-xs py-4 px-6 rounded-2xl flex items-center justify-center gap-2 disabled:opacity-60">{isSendingReport ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />} Enviar a Coordinación</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- PESTAÑA HISTORIAL --- */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black text-slate-800 mb-8 uppercase tracking-tight">Historial de Clases</h2>
            {records.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-3xl border border-zinc-200 shadow-sm"><History className="w-16 h-16 text-zinc-200 mx-auto mb-4" /><h3 className="text-lg font-bold uppercase tracking-widest text-zinc-400">Sin registros</h3></div>
            ) : (
              records.map((r) => (
                <div key={r.id} className={`bg-white rounded-3xl shadow-sm border p-6 md:p-8 ${r.isRenounced ? 'border-amber-200 opacity-80' : 'border-zinc-200'}`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 pb-6 border-b border-zinc-100 gap-4">
                    <div><h3 className="font-black uppercase tracking-wide text-black text-xl">{r.subject}{r.isRenounced && <span className="text-amber-600 text-xs ml-3 bg-amber-50 px-2 py-1 rounded-lg">(RENUNCIADA)</span>}</h3><p className="text-xs font-bold uppercase text-zinc-400 flex items-center gap-1.5 mt-2"><MapPin className="w-4 h-4" /> {r.sede||''} ({r.sala||''}) • <User className="w-4 h-4" /> {r.teacher}</p></div>
                    <div className="text-left md:text-right"><p className="font-black text-slate-800 flex items-center md:justify-end gap-1.5"><Calendar className="w-4 h-4 text-zinc-400" /> {formatDateSpanish(r.date)}</p><p className="text-sm font-bold uppercase text-zinc-500 mt-1"><Clock className="w-4 h-4 inline" /> {r.time}</p></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {(r.students||[]).map(s => (
                      <div key={s.id} className="flex flex-col gap-1 p-3 bg-zinc-50 rounded-xl border border-zinc-100"><div className="flex items-center gap-2.5">{s.status === 'present' && <Check className="w-5 h-5 text-emerald-500 bg-emerald-100 rounded-md p-0.5" />}{s.status === 'absent' && <X className="w-5 h-5 text-rose-500 bg-rose-100 rounded-md p-0.5" />}{s.status === 'notified' && <AlertCircle className="w-5 h-5 text-amber-500 bg-amber-100 rounded-md p-0.5" />}<span className={`text-sm ${s.status === 'present' ? 'text-slate-700 font-bold' : s.status === 'absent' ? 'text-rose-600 font-black' : 'text-amber-700 font-black'}`}>{s.name}</span></div>{s.isRecovery && <span className="text-[10px] text-amber-600 font-black uppercase ml-8">Recuperación</span>}</div>
                    ))}
                  </div>
                </div>
