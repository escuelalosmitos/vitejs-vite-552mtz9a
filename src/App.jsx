import React, { useState, useMemo, useEffect } from 'react';
import {
  ClipboardList,
  History,
  BarChart3,
  Check,
  X,
  AlertCircle,
  Save,
  Mail,
  UserPlus,
  Trash2,
  Calendar,
  Clock,
  User,
  Music,
  RefreshCw,
  Play,
  MessageSquare,
  LogOut,
  Lock,
  CornerDownRight,
  BookOpen,
  CalendarOff,
  Settings,
  Plus,
  Timer
} from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE ---
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';

import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAtVRPZ-nprU-JyahuAhmMjXiqaKzO-0kM",
  authDomain: "escuela-musica-app.firebaseapp.com",
  projectId: "escuela-musica-app",
  storageBucket: "escuela-musica-app.firebasestorage.app",
  messagingSenderId: "303855837130",
  appId: "1:303855837130:web:c662eefe0cc718bde37933"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- EMAIL DEL ADMINISTRADOR ---
const ADMIN_EMAIL = 'paco@escuelalosmitos.com';

const APPS_SCRIPT_URL = 'https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnTdw_SPRAss0T8IqR0EtrG6_wEjiamRp3vsIWsRZeCFilpoFKLlDIJ3z8M1ks1v7U1cPiUQ865Kqqyk3XypZtKCn37miqNlrr0VheB-sqDGGoY4dzzHNP_wLZrJQjIeSQMeQp40fyr175oGvsg7EDDvIaCSY3IIdwU2ncVNcQ99wheAriLIrsketiOYScTmzwngRCFEUjiVW8v2owQsNCh7z7R8tGIlFPIGx7tD4ugmKl9yfkGZKNgORuFAp07jw20NwfDw1EosKCcEdimFw3J3m0V7KQ&lib=MgjqRxlwoqXf5d2LrJo7pDlcMwZyZOfWI';

// --- HELPERS ---
const getDayOfWeek = (dateString) => {
  const [year, month, day] = dateString.split('-');
  return new Date(year, month - 1, day).getDay();
};
const getDayName = (dayIndex) => ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dayIndex];
const formatDateSpanish = (dateString) => dateString ? dateString.split('-').reverse().join('/') : '';
const normalizeNumber = (value) => {
  const number = Number(String(value).replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [loadingData, setLoadingData] = useState(true);
  const [recurringClasses, setRecurringClasses] = useState([]);
  const [records, setRecords] = useState([]);
  const [dailyReports, setDailyReports] = useState([]);
  const [globalStudents, setGlobalStudents] = useState([]);
  
  const [settings, setSettings] = useState({
    hourlyRate: 17.33,
    generalTasks: ['Ordenar el aula', 'Revisar material'],
    instrumentTasks: {} 
  });

  const [activeTab, setActiveTab] = useState('attendance');
  const [notification, setNotification] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentSession, setCurrentSession] = useState(null);
  const [isSendingReport, setIsSendingReport] = useState(false);
  const [deadHourModal, setDeadHourModal] = useState(null);

  const [dailyForm, setDailyForm] = useState({
    generalFeedback: '', incidents: '', newStudents: '', materialIssues: ''
  });

  const isAdmin = user?.email === ADMIN_EMAIL;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoadingData(true);

    const unsubRecurring = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses'), s => setRecurringClasses(s.docs.map(d => ({id: d.id, ...d.data()}))));
    const unsubRecords = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'records'), s => setRecords(s.docs.map(d => ({id: d.id, ...d.data()}))));
    const unsubDaily = onSnapshot(collection(db, 'artifacts', appId, 'users', user.uid, 'dailyReports'), s => setDailyReports(s.docs.map(d => ({id: d.id, ...d.data()}))));
    const unsubStudents = onSnapshot(collection(db, 'artifacts', appId, 'students'), s => setGlobalStudents(s.docs.map(d => ({id: d.id, ...d.data()}))));
    const unsubSettings = onSnapshot(doc(db, 'artifacts', appId, 'settings', 'global'), d => {
      if (d.exists()) setSettings(d.data());
    });

    setLoadingData(false);
    return () => { unsubRecurring(); unsubRecords(); unsubDaily(); unsubStudents(); unsubSettings(); };
  }, [user]);

  useEffect(() => {
    const r = dailyReports.find(report => report.id === date);
    setDailyForm(r ? { ...r } : { generalFeedback: '', incidents: '', newStudents: '', materialIssues: '' });
  }, [date, dailyReports]);

  const getTeacherName = () => user?.email?.split('@')[0] || 'Profesor';
  const showNotification = (text, type = 'success') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleLogout = () => signOut(auth);
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setIsAuthLoading(true);
    try { await signInWithEmailAndPassword(auth, loginEmail, loginPassword); } 
    catch (error) { setLoginError('Error de acceso.'); setIsAuthLoading(false); }
  };

  // --- NUEVA LÓGICA DE NÓMINA AUTOMATIZADA ---
  const monthlyPayroll = useMemo(() => {
    const currentMonth = date.substring(0, 7); // "YYYY-MM"
    // Sumamos la duración de todas las listas pasadas en este mes
    const monthRecords = records.filter(r => r.date.startsWith(currentMonth));
    const totalMinutes = monthRecords.reduce((acc, r) => acc + normalizeNumber(r.duration || 60), 0);
    const totalHours = totalMinutes / 60;
    const earnings = totalHours * (settings.hourlyRate || 0);
    return { totalHours: totalHours.toFixed(2), earnings: earnings.toFixed(2), totalMinutes };
  }, [records, date, settings.hourlyRate]);

  // --- LÓGICA DE SESIÓN ---
  const startSession = (sc = null) => {
    const base = sc ? {
      isNew: false, classId: sc.id, time: sc.time, teacher: sc.teacher, subject: sc.subject,
      capacity: sc.capacity || '', duration: sc.duration || 60, notes: sc.notes || '', 
      dayOfWeek: sc.dayOfWeek, isRecurring: true, students: sc.students.map(s => ({ ...s, status: 'present' })),
      cancelledDates: sc.cancelledDates || []
    } : {
      isNew: true, classId: Date.now().toString(), time: '17:00', teacher: getTeacherName(),
      subject: '', capacity: '', duration: 60, notes: '', isRecurring: true, students: [],
      cancelledDates: []
    };
    setCurrentSession({ ...base, newStudentName: '', isAddingRecovery: false });
  };

  const handleSessionFieldChange = (field, value) => {
    setCurrentSession({ ...currentSession, [field]: value });
  };

  const dashboardItems = useMemo(() => {
    const selectedDayOfWeek = getDayOfWeek(date);
    const items = [];
    const recordsToday = records.filter(r => r.date === date);
    const scheduledToday = recurringClasses.filter(rc => rc.dayOfWeek === selectedDayOfWeek && !(rc.cancelledDates && rc.cancelledDates.includes(date)));
    scheduledToday.forEach(rc => {
      const recordExists = recordsToday.find(r => r.classId === rc.id);
      items.push(recordExists ? { type: 'completed', data: recordExists } : { type: 'pending', data: rc });
    });
    recordsToday.forEach(r => {
      if (!scheduledToday.find(rc => rc.id === r.classId)) items.push({ type: 'completed', data: r });
    });
    return items.sort((a, b) => a.data.time.localeCompare(b.data.time));
  }, [date, records, recurringClasses]);

  const addStudent = async () => {
    const studentName = currentSession.newStudentName.trim();
    if (!studentName) return;
    if (currentSession.capacity) {
      const maxCapacity = parseInt(currentSession.capacity, 10);
      if (currentSession.students.length >= maxCapacity) {
        showNotification(`Aforo completo (${maxCapacity})`, 'error');
        return;
      }
    }
    let studentId;
    let existingStudent = globalStudents.find(s => s.name.toLowerCase() === studentName.toLowerCase());
    if (existingStudent) { studentId = existingStudent.id; } 
    else {
      studentId = Date.now().toString();
      try { await setDoc(doc(db, 'artifacts', appId, 'students', studentId), { name: studentName }); } 
      catch (e) { console.error(e); }
    }
    setCurrentSession({
      ...currentSession,
      students: [...currentSession.students, { id: studentId, name: studentName, status: 'present', isRecovery: currentSession.isAddingRecovery || false }],
      newStudentName: '', isAddingRecovery: false
    });
  };

  const saveClassOnly = async () => {
    if (!user) return;
    if (!currentSession.subject || !currentSession.capacity || !currentSession.duration) return showNotification('Asignatura, Capacidad y Duración son obligatorios.', 'error');
    
    const dayToSave = currentSession.isNew ? getDayOfWeek(date) : currentSession.dayOfWeek;
    const classIdToSave = currentSession.isNew ? Date.now().toString() : currentSession.classId;
    if (recurringClasses.some(rc => rc.dayOfWeek === dayToSave && rc.time === currentSession.time && rc.id !== classIdToSave)) {
      return showNotification('Ya tienes una clase a esta hora.', 'error');
    }

    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses', classIdToSave), {
        dayOfWeek: dayToSave, time: currentSession.time, teacher: currentSession.teacher, subject: currentSession.subject,
        capacity: currentSession.capacity, duration: currentSession.duration, notes: currentSession.notes,
        cancelledDates: currentSession.cancelledDates || [],
        students: currentSession.students.filter(s => !s.isRecovery).map(s => ({ id: s.id, name: s.name }))
      });
      showNotification('Clase programada');
      setCurrentSession(null);
    } catch (e) { showNotification('Error al crear', 'error'); }
  };

  const checkDeadHourAndSave = () => {
    if (!currentSession.subject || !currentSession.capacity || !currentSession.duration) return showNotification('Faltan campos obligatorios', 'error');
    const dayToSave = currentSession.isNew ? getDayOfWeek(date) : currentSession.dayOfWeek;
    const classIdToSave = currentSession.isNew ? Date.now().toString() : currentSession.classId;
    if (recurringClasses.some(rc => rc.dayOfWeek === dayToSave && rc.time === currentSession.time && rc.id !== classIdToSave)) {
      return showNotification('Solapamiento de horario', 'error');
    }
    const allAbsent = currentSession.students.length > 0 && currentSession.students.every(s => s.status === 'absent' || s.status === 'notified');
    if (allAbsent) {
      const myClassesToday = dashboardItems.map(i => i.data.time).sort();
      const isLastClass = currentSession.time === myClassesToday[myClassesToday.length - 1];
      if (isLastClass) {
        showNotification("Última hora libre. ¡A casa!", "success");
        executeSaveRecord();
      } else {
        const combinedTasks = [...(settings.generalTasks || []), ...(settings.instrumentTasks?.[currentSession.subject] || [])];
        setDeadHourModal({ tasks: combinedTasks, subject: currentSession.subject });
      }
    } else { executeSaveRecord(); }
  };

  const executeSaveRecord = async (deadHourNote = null) => {
    try {
      const recordId = Date.now().toString();
      const finalNotes = deadHourNote ? `[HORA MUERTA]: ${deadHourNote}. ${currentSession.notes || ''}` : currentSession.notes;
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'records', recordId), {
        classId: currentSession.classId, date, time: currentSession.time, teacher: currentSession.teacher,
        subject: currentSession.subject, capacity: currentSession.capacity, duration: currentSession.duration,
        notes: finalNotes, students: currentSession.students.map(s => ({ ...s }))
      });
      if (currentSession.isRecurring) {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses', currentSession.classId), {
          dayOfWeek: currentSession.isNew ? getDayOfWeek(date) : currentSession.dayOfWeek,
          time: currentSession.time, teacher: currentSession.teacher, subject: currentSession.subject,
          capacity: currentSession.capacity, duration: currentSession.duration, notes: currentSession.notes,
          cancelledDates: currentSession.cancelledDates || [],
          students: currentSession.students.filter(s => !s.isRecovery).map(s => ({ id: s.id, name: s.name }))
        });
      }
      showNotification('Asistencia guardada');
      setCurrentSession(null);
      setDeadHourModal(null);
    } catch (e) { showNotification('Error al guardar', 'error'); }
  };

  const saveDailyReport = async (silent = false) => {
    if (!user) return false;
    // REGLA: El campo 1 es obligatorio
    if (!dailyForm.generalFeedback.trim()) {
      showNotification('El campo "Cómo han ido las clases" es obligatorio.', 'error');
      return false;
    }
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'dailyReports', date), { ...dailyForm, date });
      if (!silent) showNotification('Resumen guardado');
      return true;
    } catch (e) { showNotification('Error al guardar reporte', 'error'); return false; }
  };

  const saveAndSendDailyReport = async () => {
    const saved = await saveDailyReport(true);
    if (!saved) return;
    setIsSendingReport(true);
    const payload = {
      profesor: getTeacherName(), profesorEmail: user.email, fecha: formatDateSpanish(date), fechaISO: date,
      horas: (records.filter(r => r.date === date).reduce((acc, r) => acc + (r.duration || 60), 0) / 60).toFixed(2),
      asistenciaDetallada: records.filter(r => r.date === date).map(r => `CLASE: ${r.time} (${r.duration}min) - ${r.subject}\nNotas: ${r.notes}\nAlumnos: ${r.students.length}`).join('\n\n'),
      observaciones: `Feedback: ${dailyForm.generalFeedback}\nIncidencias: ${dailyForm.incidents}\nAlumnos Nuevos: ${dailyForm.newStudents}\nMaterial: ${dailyForm.materialIssues}`,
      enviadoDesde: 'App Los Mitos v3.5'
    };
    try {
      await fetch(APPS_SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
      showNotification('Informe enviado a coordinación');
    } catch (e) { showNotification('Error al enviar email', 'error'); }
    setIsSendingReport(false);
  };

  const deleteRecurringClass = async (id) => {
    if (window.confirm('¿Borrar esta clase permanentemente?')) {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses', id));
      showNotification('Clase eliminada');
    }
  };

  // --- RENDER ---
  if (isAuthLoading || loadingData) return <div className="min-h-screen flex items-center justify-center"><RefreshCw className="animate-spin" /></div>;

  if (!user) return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md border border-zinc-100 text-center">
        <div className="bg-black text-white p-4 rounded-2xl inline-block mb-6 shadow-lg rotate-3"><Music className="w-8 h-8" /></div>
        <h1 className="text-3xl font-black uppercase tracking-tighter mb-8">Escuela Los Mitos</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          {loginError && <div className="p-3 bg-red-50 text-red-600 text-sm font-bold rounded-xl border border-red-100">{loginError}</div>}
          <input type="email" required value={loginEmail} onChange={e => setLoginEmail(e.target.value)} className="w-full p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl focus:border-black outline-none font-medium" placeholder="Email" />
          <input type="password" required value={loginPassword} onChange={e => setLoginPassword(e.target.value)} className="w-full p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl focus:border-black outline-none font-medium" placeholder="Contraseña" />
          <button className="w-full bg-black text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-xl active:scale-95">Entrar</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-slate-800 pb-24 md:pb-8">
      {deadHourModal && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl">
            <div className="flex items-center gap-3 text-red-600 mb-4"><AlertCircle className="w-8 h-8" /><h2 className="text-xl font-bold uppercase">Protocolo Hora Muerta</h2></div>
            <p className="text-zinc-600 mb-6 font-medium">Clase vacía detectada. Selecciona una tarea productiva:</p>
            <div className="space-y-2 mb-6 max-h-40 overflow-y-auto pr-2">
              {deadHourModal.tasks.map((t, i) => (
                <button key={i} onClick={() => setDeadHourModal({...deadHourModal, selected: t})} className={`w-full text-left p-3 rounded-xl border-2 transition-all ${deadHourModal.selected === t ? 'border-black bg-zinc-50 font-bold' : 'border-zinc-100 text-zinc-500'}`}>{t}</button>
              ))}
            </div>
            <textarea placeholder="Justifica qué has hecho..." className="w-full p-4 border-2 border-zinc-200 rounded-xl focus:border-black outline-none mb-6 min-h-[80px]" onChange={e => setDeadHourModal({...deadHourModal, note: e.target.value})} />
            <div className="flex gap-3">
              <button onClick={() => setDeadHourModal(null)} className="w-1/3 py-4 font-bold text-zinc-400">Cancelar</button>
              <button disabled={!deadHourModal.selected || !deadHourModal.note} onClick={() => executeSaveRecord(`${deadHourModal.selected}: ${deadHourModal.note}`)} className="w-2/3 bg-black text-white font-bold py-4 rounded-xl uppercase tracking-widest disabled:opacity-30">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-black text-white p-5 sticky top-0 z-50 shadow-md border-b border-zinc-800">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="bg-white p-1.5 rounded-lg"><Music className="w-5 h-5 text-black" /></div><h1 className="text-xl font-black uppercase tracking-tighter">Escuela Los Mitos</h1></div>
          <div className="flex items-center gap-4">
            <span className="text-zinc-300 text-sm hidden sm:block bg-zinc-800 px-4 py-2 rounded-xl font-medium">{user.email}</span>
            <button onClick={handleLogout} className="text-zinc-400 hover:text-white"><LogOut className="w-6 h-6" /></button>
          </div>
        </div>
      </header>

      {notification && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[60] animate-in slide-in-from-top-4">
          <div className={`px-6 py-3 rounded-full shadow-2xl text-white font-bold text-sm uppercase tracking-widest flex items-center gap-3 ${notification.type === 'error' ? 'bg-red-600' : 'bg-black'}`}>
            {notification.type === 'error' ? <X className="w-5 h-5" /> : <Check className="w-5 h-5" />} {notification.text}
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto p-4 md:p-8">
        <div className="flex gap-2 mb-8 bg-white p-2 rounded-2xl shadow-sm border border-zinc-200 overflow-x-auto no-scrollbar">
          {[
            { id: 'attendance', label: 'Listas', icon: ClipboardList },
            { id: 'daily', label: 'Diario', icon: MessageSquare },
            { id: 'history', label: 'Historial', icon: History },
            { id: 'reports', label: 'Mi Mes', icon: BarChart3 }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold uppercase text-[10px] tracking-widest transition-all ${activeTab === tab.id ? 'bg-black text-white shadow-md' : 'text-zinc-400 hover:text-black'}`}>
              <tab.icon className="w-4 h-4"/> {tab.label}
            </button>
          ))}
          {isAdmin && <button onClick={() => setActiveTab('admin')} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold uppercase text-[10px] tracking-widest transition-all ${activeTab === 'admin' ? 'bg-red-600 text-white shadow-md' : 'text-red-400 hover:text-red-600'}`}><Settings className="w-4 h-4"/> Admin</button>}
        </div>

        {/* --- PESTAÑA LISTAS --- */}
        {activeTab === 'attendance' && (
          <div className="space-y-6">
            {!currentSession ? (
              <div className="bg-white rounded-3xl p-8 border border-zinc-200 shadow-sm">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8">
                  <div><h2 className="text-2xl font-black uppercase tracking-tight">Agenda Docente</h2><p className="text-zinc-400 font-medium">{getDayName(getDayOfWeek(date))}, {formatDateSpanish(date)}</p></div>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} className="p-3 bg-zinc-50 border-2 border-zinc-100 rounded-xl font-bold outline-none focus:border-black" />
                    <button onClick={() => startSession()} className="bg-black text-white p-3 rounded-xl shadow-lg hover:scale-105 transition-transform"><Plus/></button>
                  </div>
                </div>
                <div className="space-y-4">
                  {dashboardItems.length === 0 ? <p className="text-center py-10 text-zinc-300 font-bold uppercase tracking-widest">Agenda vacía</p> : 
                  dashboardItems.map((item, i) => (
                    <div key={i} className={`flex items-center justify-between p-5 rounded-2xl border-2 transition-all ${item.type === 'completed' ? 'bg-zinc-50 border-zinc-100 opacity-60' : 'bg-white border-zinc-100 hover:border-black'}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-black ${item.type === 'completed' ? 'bg-zinc-200 text-zinc-400' : 'bg-black text-white'}`}>
                          <span className="text-sm leading-none">{item.data.time.split(':')[0]}</span>
                          <span className="text-[10px] opacity-60">{item.data.time.split(':')[1]}</span>
                        </div>
                        <div><h3 className="font-black uppercase text-sm tracking-tight">{item.data.subject}</h3><p className="text-xs font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1"><Clock className="w-3 h-3"/> {item.data.duration || 60} min <span className="mx-1">•</span> <User className="w-3 h-3"/> {item.data.students?.length || 0} alumnos</p></div>
                      </div>
                      <div className="flex gap-2">
                        {item.type === 'completed' ? <Check className="text-emerald-500 w-6 h-6"/> : 
                        <button onClick={() => startSession(item.data)} className="bg-zinc-100 p-2.5 rounded-xl hover:bg-black hover:text-white transition-all"><Play className="w-5 h-5"/></button>}
                        {!item.type === 'completed' && <button onClick={() => deleteRecurringClass(item.data.id)} className="p-2.5 text-zinc-300 hover:text-red-500 transition-colors"><Trash2 className="w-5 h-5" /></button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl overflow-hidden border border-zinc-200 shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="bg-black text-white p-6 flex justify-between items-center">
                  <div><h2 className="text-xl font-black uppercase tracking-tight">{currentSession.subject || 'Configurar Clase'}</h2><p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">{currentSession.time} • {getDayName(getDayOfWeek(date))}</p></div>
                  <button onClick={() => setCurrentSession(null)} className="bg-zinc-800 p-2 rounded-xl"><X/></button>
                </div>
                <div className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="space-y-2"><label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Instrumento</label><input disabled={!currentSession.isNew} value={currentSession.subject} onChange={e => handleSessionFieldChange('subject', e.target.value)} className="w-full p-4 bg-zinc-50 rounded-xl border-2 border-zinc-100 outline-none font-bold focus:border-black disabled:opacity-50" placeholder="Ej: Piano" /></div>
                    <div className="space-y-2"><label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Capacidad</label><input disabled={!currentSession.isNew} type="number" value={currentSession.capacity} onChange={e => handleSessionFieldChange('capacity', e.target.value)} className="w-full p-4 bg-zinc-50 rounded-xl border-2 border-zinc-100 outline-none font-bold focus:border-black disabled:opacity-50" placeholder="Ej: 4" /></div>
                    <div className="space-y-2"><label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Duración (min)</label><input disabled={!currentSession.isNew} type="number" value={currentSession.duration} onChange={e => handleSessionFieldChange('duration', e.target.value)} className="w-full p-4 bg-zinc-50 rounded-xl border-2 border-zinc-100 outline-none font-bold focus:border-black disabled:opacity-50" placeholder="60" /></div>
                  </div>
                  <div className="space-y-2 mb-8"><label className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Cuaderno de Bitácora</label><textarea value={currentSession.notes} onChange={e => handleSessionFieldChange('notes', e.target.value)} className="w-full p-4 bg-amber-50/20 rounded-xl border-2 border-amber-100 outline-none font-medium text-sm focus:border-amber-400 min-h-[80px]" placeholder="Ejercicios, progresos..." /></div>
                  
                  {/* Buscador de alumnos */}
                  <div className={`p-6 rounded-2xl border-2 mb-8 transition-all ${isCapacityReached ? 'bg-red-50 border-red-200' : 'bg-zinc-50 border-zinc-200'}`}>
                    <div className="flex justify-between items-center mb-4"><h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2"><UserPlus className="w-4 h-4"/> Añadir Alumno</h3>{currentSession.capacity && <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${isOverCapacity ? 'bg-red-600 text-white' : 'bg-zinc-200 text-zinc-600'}`}>{currentSession.students.length} / {currentSession.capacity}</span>}</div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1 relative">
                        <input autoComplete="new-password" disabled={isDisabledAdd} value={currentSession.newStudentName} onChange={e => handleSessionFieldChange('newStudentName', e.target.value)} onKeyDown={e => e.key === 'Enter' && addStudent()} className="w-full p-4 bg-white border-2 border-zinc-100 rounded-xl outline-none font-bold focus:border-black disabled:bg-zinc-100" placeholder={isCapacityMissing ? "Escribe la capacidad arriba..." : isCapacityReached ? "Aforo completo" : "Buscar nombre..."} />
                        {currentSession.newStudentName.length >= 2 && !isDisabledAdd && (
                          <div className="absolute top-full left-0 right-0 bg-white border-2 border-black rounded-xl z-50 mt-2 max-h-48 overflow-y-auto shadow-2xl">
                            {globalStudents.filter(s => s.name.toLowerCase().includes(currentSession.newStudentName.toLowerCase())).map(s => (
                              <div key={s.id} onClick={() => handleSessionFieldChange('newStudentName', s.name)} className="p-4 hover:bg-zinc-100 cursor-pointer font-bold text-sm border-b border-zinc-50 last:border-0">{s.name}</div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 bg-amber-50 px-4 rounded-xl border-2 border-amber-100"><input type="checkbox" checked={currentSession.isAddingRecovery} onChange={e => handleSessionFieldChange('isAddingRecovery', e.target.checked)} className="w-5 h-5 accent-amber-600" /><span className="text-[10px] font-black uppercase text-amber-900 tracking-widest">Recupera</span></div>
                      <button onClick={addStudent} disabled={isDisabledAdd} className="bg-black text-white px-8 py-4 rounded-xl font-black uppercase text-xs tracking-widest disabled:opacity-30">Añadir</button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {currentSession.students.map(s => (
                      <div key={s.id} className="flex flex-col sm:flex-row items-center justify-between p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl gap-4 group hover:border-black transition-all">
                        <div className="flex flex-col"><span className="font-black text-slate-800">{s.name}</span>{s.isRecovery && <span className="text-[8px] font-black uppercase text-amber-600 tracking-widest flex items-center gap-1 mt-1"><CornerDownRight className="w-2 h-2"/> Recuperación</span>}</div>
                        <div className="flex gap-2 bg-white p-1.5 rounded-xl border border-zinc-200">
                          {['present', 'notified', 'absent'].map(status => (
                            <button key={status} onClick={() => handleStatusChange(s.id, status)} className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${s.status === status ? (status === 'present' ? 'bg-emerald-500 text-white' : status === 'notified' ? 'bg-amber-400 text-amber-900' : 'bg-red-500 text-white') : 'text-zinc-400 hover:bg-zinc-50'}`}>{status === 'present' ? 'Vino' : status === 'notified' ? 'Avisó' : 'Faltó'}</button>
                          ))}
                        </div>
                        <button onClick={() => setCurrentSession({...currentSession, students: currentSession.students.filter(st => st.id !== s.id)})} className="text-zinc-300 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>
                      </div>
                    ))}
                  </div>

                  {isOverCapacity && <div className="mt-6 p-4 bg-red-50 border-2 border-red-200 rounded-2xl flex gap-3 text-red-700 font-bold text-xs"><AlertCircle/> Aforo superado. Elimina alumnos para guardar.</div>}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-10">
                    <button onClick={saveClassOnly} disabled={isOverCapacity} className="p-5 border-2 border-zinc-200 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-zinc-50 disabled:opacity-30"><Calendar className="w-4 h-4 inline mr-2"/> {currentSession.isNew ? 'Solo Crear Clase' : 'Actualizar Plantilla'}</button>
                    <button onClick={checkDeadHourAndSave} disabled={isOverCapacity} className="p-5 bg-black text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-zinc-800 disabled:opacity-30"><Save className="w-4 h-4 inline mr-2"/> Guardar Asistencia</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- PESTAÑA DIARIO --- */}
        {activeTab === 'daily' && (
          <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 overflow-hidden">
            <div className="p-8 border-b border-zinc-100 bg-zinc-50 flex justify-between items-center">
              <div><h2 className="text-2xl font-black uppercase tracking-tight">Diario de Trabajo</h2><p className="text-sm font-medium text-zinc-500">Documenta tu jornada para coordinación.</p></div>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="p-3 bg-white border-2 border-zinc-100 rounded-xl font-bold focus:border-black outline-none" />
            </div>
            <div className="p-8 space-y-8">
              <div className="space-y-4">
                <div className="space-y-2"><label className="block text-sm font-black uppercase tracking-wide">1. ¿Cómo han ido las clases hoy? (Obligatorio)</label><textarea required value={dailyForm.generalFeedback} onChange={e => setDailyForm({...dailyForm, generalFeedback: e.target.value})} className="w-full p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl focus:border-black outline-none min-h-[120px]" placeholder="Ej: Muy bien, hemos trabajado las escalas..." /></div>
                <div className="space-y-2"><label className="block text-sm font-black uppercase tracking-wide">2. Incidencias o fuera de lo común</label><textarea value={dailyForm.incidents} onChange={e => setDailyForm({...dailyForm, incidents: e.target.value})} className="w-full p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl focus:border-black outline-none min-h-[80px]" placeholder="Ej: Un alumno llegó tarde..." /></div>
                <div className="space-y-2"><label className="block text-sm font-black uppercase tracking-wide">3. Alumnos nuevos</label><textarea value={dailyForm.newStudents} onChange={e => setDailyForm({...dailyForm, newStudents: e.target.value})} className="w-full p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl focus:border-black outline-none min-h-[80px]" placeholder="Nombres de altas nuevas, primeras impresiones del alumno..." /></div>
                <div className="space-y-2"><label className="block text-sm font-black uppercase tracking-wide">4. Estado del material</label><textarea value={dailyForm.materialIssues} onChange={e => setDailyForm({...dailyForm, materialIssues: e.target.value})} className="w-full p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl focus:border-black outline-none min-h-[80px]" placeholder="¿Falta algo? ¿Algo roto?" /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-8 border-t border-zinc-100">
                <button onClick={() => saveDailyReport(false)} className="py-4 border-2 border-zinc-200 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-zinc-50">Guardar Borrador</button>
                <button onClick={saveAndSendDailyReport} disabled={isSendingReport} className="py-4 bg-black text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl disabled:opacity-50">{isSendingReport ? <RefreshCw className="animate-spin inline" /> : <Mail className="w-4 h-4 inline mr-2" />} Enviar a Coordinación</button>
              </div>
            </div>
          </div>
        )}

        {/* --- PESTAÑA HISTORIAL --- */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black uppercase tracking-tight mb-8">Historial de Clases</h2>
            {records.length === 0 ? <div className="p-20 text-center text-zinc-300 font-bold uppercase border-4 border-dashed rounded-3xl">Sin registros aún</div> : 
            records.map(r => (
              <div key={r.id} className="bg-white rounded-3xl p-8 border border-zinc-200 shadow-sm">
                <div className="flex justify-between items-start border-b border-zinc-100 pb-6 mb-6">
                  <div><h3 className="text-xl font-black uppercase">{r.subject}</h3><p className="text-xs font-bold text-zinc-400 mt-2 uppercase tracking-widest">{r.teacher} • {r.duration || 60} min</p></div>
                  <div className="text-right"><p className="font-black text-slate-800">{formatDateSpanish(r.date)}</p><p className="text-sm font-bold text-zinc-400 mt-1">{r.time}</p></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {r.students.map(st => (
                    <div key={st.id} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                      {st.status === 'present' ? <Check className="text-emerald-500 w-4 h-4"/> : <X className="text-red-500 w-4 h-4"/>}
                      <span className="text-sm font-bold truncate">{st.name}</span>
                    </div>
                  ))}
                </div>
                {r.notes && <div className="mt-6 p-4 bg-amber-50/50 rounded-xl border-l-4 border-amber-400 text-xs font-medium text-amber-900 leading-relaxed">{r.notes}</div>}
              </div>
            ))}
          </div>
        )}

        {/* --- PESTAÑA MI MES (NÓMINA) --- */}
        {activeTab === 'reports' && (
          <div className="space-y-8">
            <div className="bg-black text-white p-10 rounded-3xl shadow-2xl relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-10">
                  <div><h2 className="text-3xl font-black uppercase tracking-tighter">Mi Nómina</h2><p className="text-zinc-400 font-bold uppercase text-xs tracking-widest mt-1">{new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' })}</p></div>
                  <div className="bg-zinc-800 border border-zinc-700 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest">Tarifa: {settings.hourlyRate}€/h</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="bg-zinc-900/80 p-8 rounded-3xl border border-zinc-800 backdrop-blur"><p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-2"><Clock className="w-4 h-4"/> Horas Registradas</p><p className="text-5xl font-black tracking-tighter">{monthlyPayroll.totalHours}<span className="text-xl text-zinc-600 ml-1">h</span></p></div>
                  <div className="bg-zinc-900/80 p-8 rounded-3xl border border-zinc-800 backdrop-blur border-emerald-500/30"><p className="text-[10px] font-black text-emerald-600/50 uppercase tracking-widest mb-2 flex items-center gap-2"><BarChart3 className="w-4 h-4"/> Acumulado Mes</p><p className="text-5xl font-black tracking-tighter text-emerald-400">{monthlyPayroll.earnings}<span className="text-xl ml-1">€</span></p></div>
                </div>
                <p className="mt-8 text-[10px] font-bold text-zinc-600 uppercase tracking-widest text-center">* Calculado automáticamente según la duración de tus clases guardadas.</p>
              </div>
              <Music className="absolute -bottom-16 -right-16 w-80 h-80 text-zinc-900/40 rotate-12 pointer-events-none" />
            </div>

            <div className="bg-white rounded-3xl p-8 border border-zinc-200 shadow-sm">
              <h3 className="font-black text-slate-800 mb-8 uppercase tracking-widest text-xs">Resumen Diario: {formatDateSpanish(date)}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-5"><p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Sesiones</p><p className="text-3xl font-black mt-1">{records.filter(r => r.date === date).length}</p></div>
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-5"><p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Minutos</p><p className="text-3xl font-black mt-1">{records.filter(r => r.date === date).reduce((acc, r) => acc + (r.duration || 60), 0)}'</p></div>
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-5"><p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Generado</p><p className="text-3xl font-black mt-1 text-emerald-600">{(records.filter(r => r.date === date).reduce((acc, r) => acc + (r.duration || 60), 0) / 60 * settings.hourlyRate).toFixed(2)}€</p></div>
              </div>
              <div className="space-y-6">
                <div><h4 className="text-[10px] font-black uppercase text-zinc-400 tracking-widest mb-3">Asistencia Detallada</h4><pre className="whitespace-pre-wrap text-sm bg-zinc-900 text-zinc-300 rounded-2xl p-6 font-mono shadow-inner">{buildAttendanceDetails()}</pre></div>
                <div><h4 className="text-[10px] font-black uppercase text-zinc-400 tracking-widest mb-3">Reporte de Texto</h4><pre className="whitespace-pre-wrap text-sm bg-zinc-50 border-2 border-zinc-100 rounded-2xl p-6 font-sans font-medium text-zinc-700">{buildObservations()}</pre></div>
              </div>
            </div>
          </div>
        )}

        {/* --- PESTAÑA ADMIN --- */}
        {activeTab === 'admin' && isAdmin && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm">
              <h2 className="text-xl font-black uppercase mb-2 flex items-center gap-2"><Lock className="w-5 h-5"/> Tarifa por Hora</h2>
              <p className="text-zinc-500 mb-6 text-sm">Este valor actualiza las calculadoras de todos los profesores.</p>
              <div className="flex items-center gap-6 bg-zinc-50 p-6 rounded-2xl border border-zinc-100">
                <input type="number" step="0.01" value={settings.hourlyRate} onChange={e => setSettings({...settings, hourlyRate: e.target.value})} className="text-4xl font-black w-40 bg-transparent border-b-4 border-black outline-none" />
                <span className="text-3xl font-black text-zinc-300">€/h</span>
                <button onClick={async () => { await setDoc(doc(db, 'artifacts', appId, 'settings', 'global'), settings); showNotification('Tarifa actualizada'); }} className="ml-auto bg-black text-white px-8 py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-xl">Guardar Tarifa</button>
              </div>
            </div>
            <div className="bg-white p-8 rounded-3xl border border-zinc-200 shadow-sm">
              <h2 className="text-xl font-black uppercase mb-2 flex items-center gap-2"><Settings className="w-5 h-5"/> Tareas Hora Muerta</h2>
              <p className="text-zinc-500 mb-8 text-sm">Tareas disponibles cuando fallan todos los alumnos de una clase.</p>
              <div className="flex gap-3 mb-8">
                <input id="adminTaskInput" type="text" placeholder="Nueva tarea..." className="flex-1 p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl focus:border-black outline-none font-bold" />
                <button onClick={async () => { 
                  const val = document.getElementById('adminTaskInput').value;
                  if(val) {
                    const s = {...settings, generalTasks: [...(settings.generalTasks||[]), val]};
                    setSettings(s); await setDoc(doc(db, 'artifacts', appId, 'settings', 'global'), s);
                    document.getElementById('adminTaskInput').value = '';
                  }
                }} className="bg-black text-white p-4 rounded-2xl shadow-lg"><Plus/></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {settings.generalTasks?.map((t, i) => (
                  <div key={i} className="flex justify-between items-center p-4 bg-zinc-50 border border-zinc-100 rounded-xl font-bold text-sm">
                    {t}<button onClick={async () => { const s = {...settings, generalTasks: settings.generalTasks.filter((_, idx) => idx !== i)}; setSettings(s); await setDoc(doc(db, 'artifacts', appId, 'settings', 'global'), s); }} className="text-red-300 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* NAVEGACIÓN MÓVIL */}
      <nav className="md:hidden fixed bottom-0 w-full bg-white border-t border-zinc-200 pb-safe z-40">
        <div className="flex justify-around p-3">
          {[{id:'attendance', icon:ClipboardList}, {id:'daily', icon:MessageSquare}, {id:'history', icon:History}, {id:'reports', icon:BarChart3}].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`p-4 rounded-2xl transition-all ${activeTab === t.id ? 'bg-black text-white shadow-lg' : 'text-zinc-400'}`}><t.icon className="w-6 h-6"/></button>
          ))}
          {isAdmin && <button onClick={() => setActiveTab('admin')} className={`p-4 rounded-2xl transition-all ${activeTab === 'admin' ? 'bg-red-600 text-white shadow-lg' : 'text-red-300'}`}><Settings className="w-6 h-6"/></button>}
        </div>
      </nav>

      {/* NAVEGACIÓN PC */}
      <nav className="hidden md:flex fixed top-1/2 -translate-y-1/2 left-6 flex-col gap-4 z-40">
        {[
          {id:'attendance', icon:ClipboardList, title:'Listas'}, 
          {id:'daily', icon:MessageSquare, title:'Diario'}, 
          {id:'history', icon:History, title:'Historial'}, 
          {id:'reports', icon:BarChart3, title:'Mi Mes'}
        ].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`p-5 rounded-2xl shadow-sm flex items-center justify-center transition-all ${activeTab === t.id ? 'bg-black text-white scale-110 shadow-xl' : 'bg-white text-zinc-400 border-2 border-zinc-100 hover:text-black'}`} title={t.title}><t.icon/></button>
        ))}
        {isAdmin && <button onClick={() => setActiveTab('admin')} className={`p-5 rounded-2xl shadow-sm flex items-center justify-center transition-all mt-4 ${activeTab === 'admin' ? 'bg-red-600 text-white scale-110 shadow-xl' : 'bg-white text-red-300 border-2 border-red-50 hover:text-red-600'}`} title="Admin"><Settings/></button>}
      </nav>
    </div>
  );
}
