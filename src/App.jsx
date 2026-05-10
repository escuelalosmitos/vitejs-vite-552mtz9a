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
  CalendarOff
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

// --- URL DE APPS SCRIPT ---
const APPS_SCRIPT_URL =
  'https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnTdw_SPRAss0T8IqR0EtrG6_wEjiamRp3vsIWsRZeCFilpoFKLlDIJ3z8M1ks1v7U1cPiUQ865Kqqyk3XypZtKCn37miqNlrr0VheB-sqDGGoY4dzzHNP_wLZrJQjIeSQMeQp40fyr175oGvsg7EDDvIaCSY3IIdwU2ncVNcQ99wheAriLIrsketiOYScTmzwngRCFEUjiVW8v2owQsNCh7z7R8tGIlFPIGx7tD4ugmKl9yfkGZKNgORuFAp07jw20NwfDw1EosKCcEdimFw3J3m0V7KQ&lib=MgjqRxlwoqXf5d2LrJo7pDlcMwZyZOfWI';

// --- HELPERS ---
const getDayOfWeek = (dateString) => {
  const [year, month, day] = dateString.split('-');
  return new Date(year, month - 1, day).getDay();
};

const getDayName = (dayIndex) => {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[dayIndex];
};

const formatDateSpanish = (dateString) => {
  if (!dateString) return '';
  return dateString.split('-').reverse().join('/');
};

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

  const [activeTab, setActiveTab] = useState('attendance');
  const [notification, setNotification] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentSession, setCurrentSession] = useState(null);
  const [isSendingReport, setIsSendingReport] = useState(false);

  const [dailyForm, setDailyForm] = useState({
    generalFeedback: '',
    incidents: '',
    newStudents: '',
    materialIssues: '',
    hoursTaught: ''
  });

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        }
      } catch (error) {
        console.error("Error auth:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoadingData(true);

    const recurringRef = collection(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses');
    const recordsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'records');
    const dailyRef = collection(db, 'artifacts', appId, 'users', user.uid, 'dailyReports');
    const globalStudentsRef = collection(db, 'artifacts', appId, 'students');

    let recordsLoaded = false;
    let recurringLoaded = false;
    let dailyLoaded = false;
    let studentsLoaded = false;

    const checkLoading = () => {
      if (recordsLoaded && recurringLoaded && dailyLoaded && studentsLoaded) setLoadingData(false);
    };

    const unsubRecurring = onSnapshot(recurringRef, (snapshot) => {
      setRecurringClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      recurringLoaded = true;
      checkLoading();
    });

    const unsubRecords = onSnapshot(recordsRef, (snapshot) => {
      const recs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      recs.sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`));
      setRecords(recs);
      recordsLoaded = true;
      checkLoading();
    });

    const unsubDaily = onSnapshot(dailyRef, (snapshot) => {
      setDailyReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      dailyLoaded = true;
      checkLoading();
    });

    const unsubStudents = onSnapshot(globalStudentsRef, (snapshot) => {
      setGlobalStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      studentsLoaded = true;
      checkLoading();
    });

    return () => {
      unsubRecurring();
      unsubRecords();
      unsubDaily();
      unsubStudents();
    };
  }, [user]);

  useEffect(() => {
    const reportForDate = dailyReports.find(r => r.id === date);
    if (reportForDate) {
      setDailyForm({
        generalFeedback: reportForDate.generalFeedback || '',
        incidents: reportForDate.incidents || '',
        newStudents: reportForDate.newStudents || '',
        materialIssues: reportForDate.materialIssues || '',
        hoursTaught: reportForDate.hoursTaught || ''
      });
    } else {
      setDailyForm({
        generalFeedback: '',
        incidents: '',
        newStudents: '',
        materialIssues: '',
        hoursTaught: ''
      });
    }
  }, [date, dailyReports]);

  const getTeacherName = () => {
    if (!user || !user.email) return 'Profesor';
    return user.email.split('@')[0];
  };

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setIsAuthLoading(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
    } catch (error) {
      setLoginError('Credenciales incorrectas. Verifica tu email y contraseña.');
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    signOut(auth);
  };

  const recordsForSelectedDate = useMemo(() => {
    return records
      .filter(record => record.date === date)
      .sort((a, b) => String(a.time).localeCompare(String(b.time)));
  }, [records, date]);

  const selectedDailyReport = useMemo(() => {
    return dailyReports.find(report => report.id === date);
  }, [dailyReports, date]);

  const buildAttendanceDetails = () => {
    if (recordsForSelectedDate.length === 0) return 'No hay registros de asistencia guardados para esta fecha.';
    return recordsForSelectedDate.map(record => {
      const students = record.students || [];
      const present = students.filter(s => s.status === 'present').map(s => `- ${s.name}${s.isRecovery ? ' (Recuperación)' : ''}`).join('\n') || '- Ninguno';
      const notified = students.filter(s => s.status === 'notified').map(s => `- ${s.name}`).join('\n') || '- Ninguno';
      const absent = students.filter(s => s.status === 'absent').map(s => `- ${s.name}`).join('\n') || '- Ninguno';

      return `
CLASE: ${record.time} - ${record.subject}
Profesor: ${record.teacher}
Total alumnos: ${students.length}
Notas: ${record.notes || 'Ninguna'}

Presentes:
${present}

Avisaron falta:
${notified}

Faltaron sin aviso:
${absent}
      `.trim();
    }).join('\n\n---------------------------------\n\n');
  };

  const buildObservations = (formData = null) => {
    const report = formData || selectedDailyReport || dailyForm;
    return `
¿Cómo han ido las clases?
${report?.generalFeedback?.trim() || 'Sin observaciones.'}

Incidencias o algo fuera de lo habitual:
${report?.incidents?.trim() || 'Sin incidencias.'}

Alumnos nuevos:
${report?.newStudents?.trim() || 'No se han indicado alumnos nuevos.'}

Material roto o cosas a mejorar:
${report?.materialIssues?.trim() || 'No se han indicado problemas de material.'}
    `.trim();
  };

  const sendReportByEmail = async (formData = null) => {
    if (!user) return;
    const report = formData || selectedDailyReport || dailyForm;
    const hours = normalizeNumber(report?.hoursTaught);
    const hasAttendance = recordsForSelectedDate.length > 0;
    const hasDailyReport = Boolean(report?.generalFeedback?.trim()) || Boolean(report?.incidents?.trim()) || Boolean(report?.newStudents?.trim()) || Boolean(report?.materialIssues?.trim()) || Boolean(report?.hoursTaught);

    if (!hasAttendance && !hasDailyReport) {
      showNotification({ type: 'error', text: 'No hay datos para enviar en esta fecha.' });
      return;
    }

    setIsSendingReport(true);
    const payload = {
      profesor: getTeacherName(),
      profesorEmail: user.email,
      fecha: formatDateSpanish(date),
      fechaISO: date,
      horas: hours,
      asistenciaDetallada: buildAttendanceDetails(),
      observaciones: buildObservations(report),
      enviadoDesde: 'App profesores Escuela Los Mitos'
    };

    try {
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      showNotification({ type: 'success', text: 'Informe enviado por email.' });
    } catch (error) {
      console.error(error);
      showNotification({ type: 'error', text: 'No se pudo enviar el informe.' });
    } finally {
      setIsSendingReport(false);
    }
  };

  const startSession = (scheduledClass = null) => {
    if (scheduledClass) {
      setCurrentSession({
        isNew: false,
        classId: scheduledClass.id,
        time: scheduledClass.time,
        teacher: scheduledClass.teacher,
        subject: scheduledClass.subject,
        capacity: scheduledClass.capacity || '',
        notes: scheduledClass.notes || '',
        dayOfWeek: scheduledClass.dayOfWeek,
        isRecurring: true,
        students: scheduledClass.students.map(s => ({ ...s, status: 'present' })),
        newStudentName: '',
        isAddingRecovery: false,
        cancelledDates: scheduledClass.cancelledDates || []
      });
    } else {
      setCurrentSession({
        isNew: true,
        classId: Date.now().toString(),
        time: '17:00',
        teacher: getTeacherName(),
        subject: '',
        capacity: '',
        notes: '',
        isRecurring: true,
        students: [],
        newStudentName: '',
        isAddingRecovery: false,
        cancelledDates: []
      });
    }
  };

  const handleSessionFieldChange = (field, value) => {
    setCurrentSession({ ...currentSession, [field]: value });
  };

  const handleStatusChange = (id, newStatus) => {
    setCurrentSession({
      ...currentSession,
      students: currentSession.students.map(s =>
        s.id === id ? { ...s, status: newStatus } : s
      )
    });
  };

  const addStudent = async () => {
    const studentName = currentSession.newStudentName.trim();
    if (!studentName) return;

    if (currentSession.capacity) {
      const maxCapacity = parseInt(currentSession.capacity, 10);
      if (currentSession.students.length >= maxCapacity) {
        showNotification({ type: 'error', text: `Aforo completo. El límite es de ${maxCapacity} alumnos.` });
        return;
      }
    }

    let studentId;
    let existingStudent = globalStudents.find(s => s.name.toLowerCase() === studentName.toLowerCase());

    if (existingStudent) {
      studentId = existingStudent.id;
    } else {
      studentId = Date.now().toString();
      try {
        await setDoc(doc(db, 'artifacts', appId, 'students', studentId), { name: studentName });
      } catch (error) {
        console.error("Error creando alumno global:", error);
      }
    }

    setCurrentSession({
      ...currentSession,
      students: [
        ...currentSession.students,
        {
          id: studentId,
          name: studentName,
          status: 'present',
          isRecovery: currentSession.isAddingRecovery || false
        }
      ],
      newStudentName: '',
      isAddingRecovery: false
    });
  };

  const removeStudent = (id) => {
    setCurrentSession({
      ...currentSession,
      students: currentSession.students.filter(s => s.id !== id)
    });
  };

  const saveClassOnly = async () => {
    if (!user) return;
    if (!currentSession.subject || !currentSession.capacity) {
      showNotification({ type: 'error', text: 'El instrumento y la capacidad son obligatorios.' });
      return;
    }
    if (currentSession.students.length > parseInt(currentSession.capacity, 10)) {
      showNotification({ type: 'error', text: 'Hay más alumnos que la capacidad permitida.' });
      return;
    }

    const dayToSave = currentSession.isNew ? getDayOfWeek(date) : currentSession.dayOfWeek;
    const classIdToSave = currentSession.isNew ? Date.now().toString() : currentSession.classId;

    // --- REGLA ANTI-SOLAPAMIENTO DE HORARIOS ---
    const hasCollision = recurringClasses.some(rc => 
      rc.dayOfWeek === dayToSave && 
      rc.time === currentSession.time &&
      rc.id !== classIdToSave
    );

    if (hasCollision) {
      showNotification({ type: 'error', text: `Imposible guardar: Ya tienes otra clase programada los ${getDayName(dayToSave)} a las ${currentSession.time}.` });
      return;
    }

    try {
      const templateStudents = currentSession.students
        .filter(s => !s.isRecovery)
        .map(s => ({ id: s.id, name: s.name }));

      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses', classIdToSave), {
        dayOfWeek: dayToSave,
        time: currentSession.time,
        teacher: currentSession.teacher,
        subject: currentSession.subject,
        capacity: currentSession.capacity,
        notes: currentSession.notes,
        cancelledDates: currentSession.cancelledDates || [],
        students: templateStudents
      });

      showNotification({ type: 'success', text: 'Clase programada en el horario con éxito.' });
      setCurrentSession(null);
    } catch (error) {
      console.error(error);
      showNotification({ type: 'error', text: 'Hubo un error al crear la clase.' });
    }
  };

  const saveRecord = async () => {
    if (!user) return;
    if (!currentSession.subject || !currentSession.capacity) {
      showNotification({ type: 'error', text: 'El instrumento y la capacidad son obligatorios.' });
      return;
    }
    if (currentSession.students.length > parseInt(currentSession.capacity, 10)) {
      showNotification({ type: 'error', text: 'Hay más alumnos que la capacidad permitida.' });
      return;
    }

    const dayToSave = currentSession.isNew ? getDayOfWeek(date) : currentSession.dayOfWeek;
    const classIdToSave = currentSession.isNew ? Date.now().toString() : currentSession.classId;

    // --- REGLA ANTI-SOLAPAMIENTO DE HORARIOS ---
    const hasCollision = recurringClasses.some(rc => 
      rc.dayOfWeek === dayToSave && 
      rc.time === currentSession.time &&
      rc.id !== classIdToSave
    );

    if (hasCollision) {
      showNotification({ type: 'error', text: `Imposible guardar: Ya tienes otra clase programada los ${getDayName(dayToSave)} a las ${currentSession.time}.` });
      return;
    }

    try {
      const recordId = Date.now().toString();

      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'records', recordId), {
        classId: currentSession.classId,
        date,
        time: currentSession.time,
        teacher: currentSession.teacher,
        subject: currentSession.subject,
        capacity: currentSession.capacity,
        notes: currentSession.notes,
        students: currentSession.students.map(s => ({ ...s }))
      });

      if (currentSession.isRecurring) {
        const templateStudents = currentSession.students
          .filter(s => !s.isRecovery)
          .map(s => ({ id: s.id, name: s.name }));

        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses', currentSession.classId), {
          dayOfWeek: dayToSave,
          time: currentSession.time,
          teacher: currentSession.teacher,
          subject: currentSession.subject,
          capacity: currentSession.capacity,
          notes: currentSession.notes,
          cancelledDates: currentSession.cancelledDates || [],
          students: templateStudents
        });
      }

      showNotification({ type: 'success', text: 'Lista guardada correctamente.' });
      setCurrentSession(null);
    } catch (error) {
      console.error(error);
      showNotification({ type: 'error', text: 'Hubo un error al guardar los datos.' });
    }
  };

  const cancelClassForToday = async (classData) => {
    if (!user) return;
    const isConfirmed = window.confirm(`¿Seguro que quieres cancelar la clase de ${classData.subject} solo por hoy? (Estará libre para sustituciones)`);
    if (!isConfirmed) return;

    try {
      const updatedCancelledDates = [...(classData.cancelledDates || []), date];
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses', classData.id), {
        ...classData,
        cancelledDates: updatedCancelledDates
      });
      showNotification({ type: 'success', text: 'Clase cancelada para el día de hoy.' });
    } catch (error) {
      console.error(error);
      showNotification({ type: 'error', text: 'Error al cancelar la clase temporalmente.' });
    }
  };

  const deleteRecurringClass = async (classId) => {
    if (!user) return;
    const isConfirmed = window.confirm('¿Seguro que quieres borrar esta clase de tu horario permanentemente?');
    if (!isConfirmed) return;

    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses', classId));
      showNotification({ type: 'success', text: 'Clase eliminada del horario.' });
    } catch (error) {
      console.error(error);
      showNotification({ type: 'error', text: 'Error al borrar la clase.' });
    }
  };

  const saveDailyReport = async (silent = false) => {
    if (!user) return false;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'dailyReports', date), {
        ...dailyForm,
        date
      });
      if (!silent) showNotification({ type: 'success', text: 'Resumen del día guardado con éxito.' });
      return true;
    } catch (error) {
      console.error(error);
      showNotification({ type: 'error', text: 'Error al guardar el resumen diario.' });
      return false;
    }
  };

  const saveAndSendDailyReport = async () => {
    const saved = await saveDailyReport(true);
    if (!saved) return;
    await sendReportByEmail(dailyForm);
  };

  const dashboardItems = useMemo(() => {
    const selectedDayOfWeek = getDayOfWeek(date);
    const items = [];
    const recordsToday = records.filter(r => r.date === date);
    
    const scheduledToday = recurringClasses.filter(rc => 
      rc.dayOfWeek === selectedDayOfWeek && 
      !(rc.cancelledDates && rc.cancelledDates.includes(date))
    );

    scheduledToday.forEach(rc => {
      const recordExists = recordsToday.find(r => r.classId === rc.id);
      if (recordExists) items.push({ type: 'completed', data: recordExists });
      else items.push({ type: 'pending', data: rc });
    });

    recordsToday.forEach(r => {
      const isScheduled = scheduledToday.find(rc => rc.id === r.classId);
      if (!isScheduled) items.push({ type: 'completed', data: r });
    });

    return items.sort((a, b) => a.data.time.localeCompare(b.data.time));
  }, [date, records, recurringClasses]);

  const stats = useMemo(() => {
    const studentStats = {};
    records.forEach(record => {
      record.students.forEach(student => {
        if (!studentStats[student.name]) {
          studentStats[student.name] = { present: 0, absent: 0, notified: 0, total: 0 };
        }
        studentStats[student.name].total++;
        if (student.status === 'present') studentStats[student.name].present++;
        if (student.status === 'absent') studentStats[student.name].absent++;
        if (student.status === 'notified') studentStats[student.name].notified++;
      });
    });
    return Object.entries(studentStats)
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <RefreshCw className="w-10 h-10 text-black animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-100 w-full max-w-md">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="bg-zinc-100 p-3 rounded-full mb-4">
              <Music className="w-8 h-8 text-black" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 uppercase tracking-wide">Escuela Los Mitos</h1>
            <p className="text-slate-500 mt-1">Acceso para Profesores</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 text-center">
                {loginError}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-black outline-none" placeholder="profesor@escuela.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
              <input type="password" required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-black outline-none" placeholder="••••••••" />
            </div>
            <button type="submit" className="w-full bg-black hover:bg-zinc-800 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all mt-6 shadow-md uppercase tracking-wider text-sm">
              <Lock className="w-5 h-5" /> Entrar
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loadingData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4 p-8 bg-white rounded-2xl shadow-sm border border-slate-100">
          <RefreshCw className="w-10 h-10 text-black animate-spin" />
          <h2 className="text-xl font-bold text-slate-800">Cargando datos...</h2>
          <p className="text-slate-500 text-sm">Sincronizando con la nube</p>
        </div>
      </div>
    );
  }

  const isCapacityMissing = !currentSession?.capacity;
  const maxCap = parseInt(currentSession?.capacity, 10) || 0;
  const currentCount = currentSession?.students?.length || 0;
  
  const isCapacityReached = !isCapacityMissing && currentCount >= maxCap;
  const isOverCapacity = !isCapacityMissing && currentCount > maxCap;
  
  const isDisabledAdd = isCapacityMissing || isCapacityReached;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20 md:pb-0">
      <header className="bg-black text-white p-4 shadow-md sticky top-0 z-10 border-b border-zinc-800">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white p-1.5 rounded-lg">
              <Music className="w-5 h-5 text-black" />
            </div>
            <h1 className="text-xl font-bold hidden sm:block uppercase tracking-wide">Escuela Los Mitos</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-zinc-300 text-sm flex items-center gap-2 bg-zinc-800 px-3 py-1.5 rounded-full">
              <User className="w-4 h-4" />
              <span className="max-w-[100px] sm:max-w-xs truncate">{user.email}</span>
            </span>
            <button onClick={handleLogout} className="text-zinc-400 hover:text-white transition-colors" title="Cerrar Sesión">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {notification && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50">
          <div className={`px-4 py-2 rounded-full shadow-lg text-white font-medium flex items-center gap-2 ${notification.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}>
            {notification.type === 'error' ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
            {notification.text}
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto p-4 md:p-6 mt-4">
        {activeTab === 'attendance' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {!currentSession && (
              <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1 w-full sm:w-auto">
                  <label className="text-xs font-medium text-slate-500 flex items-center gap-1 uppercase tracking-wider">
                    <Calendar className="w-3 h-3" /> Fecha seleccionada ({getDayName(getDayOfWeek(date))})
                  </label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full sm:w-auto p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-black outline-none font-medium text-slate-700" />
                </div>
                <button onClick={() => startSession(null)} className="w-full sm:w-auto bg-black hover:bg-zinc-800 text-white font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95 uppercase text-sm tracking-wide">
                  <ClipboardList className="w-5 h-5" /> Nueva Clase
                </button>
              </div>
            )}

            {!currentSession ? (
              <div className="p-6">
                <h3 className="text-md font-semibold text-slate-700 mb-4 flex items-center gap-2 uppercase tracking-wide">
                  Clases del {getDayName(getDayOfWeek(date))}, {formatDateSpanish(date)}
                </h3>
                {dashboardItems.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-slate-500 mb-4 font-medium">No hay clases programadas o han sido canceladas hoy.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dashboardItems.map((item, idx) => (
                      <div key={idx} className={`flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border rounded-xl gap-3 transition-colors ${item.type === 'completed' ? 'bg-slate-50 border-slate-100' : 'bg-white border-zinc-200 hover:border-zinc-400 shadow-sm'}`}>
                        <div>
                          <p className={`font-bold flex items-center gap-2 ${item.type === 'completed' ? 'text-slate-500' : 'text-black'}`}>
                            <Clock className={`w-4 h-4 ${item.type === 'completed' ? 'text-slate-400' : 'text-zinc-600'}`} />
                            {item.data.time} - {item.data.subject}
                          </p>
                          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1">
                            <User className="w-3 h-3" /> Prof: {item.data.teacher} 
                            <span className="mx-1">•</span> 
                            {item.data.students.length} {item.data.capacity ? `/ ${item.data.capacity}` : ''} alumnos
                          </p>
                        </div>
                        <div className="w-full sm:w-auto text-right mt-3 sm:mt-0 flex items-center justify-end gap-2">
                          {item.type === 'completed' ? (
                            <span className="inline-flex w-full justify-center sm:w-auto items-center gap-1 bg-emerald-100 text-emerald-700 text-xs px-2.5 py-1.5 rounded-md font-bold border border-emerald-200 uppercase tracking-wide">
                              <Check className="w-3 h-3" /> Lista Pasada
                            </span>
                          ) : (
                            <>
                              <button onClick={() => startSession(item.data)} className="w-full sm:w-auto bg-zinc-100 hover:bg-black hover:text-white text-black font-medium py-2 px-4 rounded-lg inline-flex items-center justify-center gap-2 transition-all text-sm uppercase tracking-wide">
                                <Play className="w-4 h-4" /> Pasar Lista
                              </button>
                              
                              <button onClick={() => cancelClassForToday(item.data)} className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors shrink-0" title="Cancelar solo por hoy (Sustitución)">
                                <CalendarOff className="w-5 h-5" />
                              </button>

                              <button onClick={() => deleteRecurringClass(item.data.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0" title="Eliminar plantilla de clase permanentemente">
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="p-6 border-b border-slate-100 bg-white relative">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-2">
                    <div className="flex flex-col">
                      <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">{currentSession.isNew ? 'Detalles de la Nueva Clase' : 'Pasando lista'}</h2>
                      <span className="text-sm font-medium text-zinc-500 flex items-center gap-1 mt-1">
                        <Calendar className="w-4 h-4" /> {getDayName(getDayOfWeek(date))}, {formatDateSpanish(date)}
                      </span>
                    </div>
                    <button onClick={() => setCurrentSession(null)} className="text-slate-500 hover:text-black text-sm font-bold uppercase tracking-wider px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors w-full sm:w-auto text-center">
                      Volver / Cancelar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><Clock className="w-3 h-3" /> Horario</label>
                      <input 
                        type="time" 
                        value={currentSession.time} 
                        onChange={(e) => handleSessionFieldChange('time', e.target.value)} 
                        disabled={!currentSession.isNew}
                        className={`w-full p-2.5 rounded-lg outline-none transition-all ${!currentSession.isNew ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' : 'bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-black'}`} 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><Music className="w-3 h-3" /> Instrumento</label>
                      <input 
                        type="text" 
                        placeholder="Ej: Piano..." 
                        value={currentSession.subject} 
                        onChange={(e) => handleSessionFieldChange('subject', e.target.value)} 
                        disabled={!currentSession.isNew}
                        className={`w-full p-2.5 rounded-lg outline-none transition-all ${!currentSession.isNew ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' : 'bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-black'}`} 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><User className="w-3 h-3" /> Capacidad Max.</label>
                      <input 
                        type="number" 
                        min="1" 
                        placeholder="Ej: 4" 
                        value={currentSession.capacity} 
                        onChange={(e) => handleSessionFieldChange('capacity', e.target.value)} 
                        disabled={!currentSession.isNew}
                        className={`w-full p-2.5 rounded-lg outline-none transition-all ${!currentSession.isNew ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' : 'bg-slate-50 border border-slate-200 focus:ring-2 focus:ring-black'}`} 
                      />
                    </div>
                  </div>

                  <div className="space-y-1 mt-4">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1"><BookOpen className="w-3 h-3" /> Anotaciones de la plantilla</label>
                    <textarea 
                      placeholder="Escribe ejercicios, deberes, estado de los alumnos... Este texto viaja semana a semana." 
                      value={currentSession.notes} 
                      onChange={(e) => handleSessionFieldChange('notes', e.target.value)} 
                      className="w-full p-3 bg-amber-50/50 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-slate-700 text-sm min-h-[80px] resize-y" 
                    />
                  </div>

                  {currentSession.isNew && (
                    <div className="mt-4 flex items-center gap-2 p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                      <input type="checkbox" id="recurring" checked={currentSession.isRecurring} onChange={(e) => handleSessionFieldChange('isRecurring', e.target.checked)} className="w-4 h-4 text-black rounded focus:ring-black" />
                      <label htmlFor="recurring" className="text-sm font-bold uppercase tracking-wide text-zinc-700 flex items-center gap-1.5 cursor-pointer">
                        <RefreshCw className="w-4 h-4" /> Repetir esta clase cada semana
                      </label>
                    </div>
                  )}
                </div>

                <div className="p-6">
                  <div className={`flex flex-col mb-6 p-4 rounded-xl border shadow-inner transition-colors ${isCapacityMissing ? 'bg-amber-50 border-amber-200' : isCapacityReached ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                    <h3 className="text-sm uppercase tracking-wide font-bold text-slate-800 mb-3 flex items-center gap-2">
                      <UserPlus className="w-4 h-4 text-black" />
                      Añadir Alumno
                      {currentSession.capacity && (
                        <span className={`ml-2 px-2.5 py-0.5 rounded-full text-xs normal-case ${isOverCapacity ? 'bg-red-600 text-white' : isCapacityReached ? 'bg-red-200 text-red-800' : 'bg-slate-200 text-slate-700'}`}>
                          ({currentCount} / {currentSession.capacity})
                        </span>
                      )}
                    </h3>
                    
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full">
                      <div className="w-full sm:flex-1 relative">
                        <input
                          type="text"
                          name="custom_search_field_no_chrome"
                          autoComplete="new-password"
                          placeholder={isCapacityMissing ? "Indica la capacidad máxima arriba primero..." : isCapacityReached ? "Aforo completo. No puedes añadir más." : "Escribe 2 letras para buscar..."}
                          value={currentSession.newStudentName}
                          onChange={(e) => handleSessionFieldChange('newStudentName', e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addStudent()}
                          disabled={isDisabledAdd}
                          className={`w-full p-2.5 text-sm rounded-lg outline-none relative z-10 transition-colors ${isDisabledAdd ? 'bg-slate-100 border border-slate-200 cursor-not-allowed text-slate-400' : 'bg-white border border-slate-300 focus:ring-2 focus:ring-black'}`}
                        />
                        {!isDisabledAdd && currentSession.newStudentName.length >= 2 && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-zinc-300 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto overflow-x-hidden">
                            {globalStudents.filter(s => s.name.toLowerCase().includes(currentSession.newStudentName.trim().toLowerCase())).length === 0 ? (
                              <div className="p-3 text-sm text-slate-500 italic bg-slate-50">
                                No hay coincidencias. Se guardará como alumno nuevo.
                              </div>
                            ) : (
                              globalStudents
                                .filter(s => s.name.toLowerCase().includes(currentSession.newStudentName.trim().toLowerCase()))
                                .map(student => (
                                  <div
                                    key={student.id}
                                    onClick={() => handleSessionFieldChange('newStudentName', student.name)}
                                    className="p-3 text-sm text-slate-700 hover:bg-zinc-100 hover:text-black cursor-pointer border-b border-slate-50 last:border-0 transition-colors flex items-center gap-2"
                                  >
                                    <User className="w-4 h-4 text-zinc-400" />
                                    <span className="font-medium">{student.name}</span>
                                  </div>
                                ))
                            )}
                          </div>
                        )}
                      </div>

                      <div className={`flex items-center gap-3 w-full sm:w-auto px-3 py-2 rounded-lg border transition-colors ${isDisabledAdd ? 'bg-slate-50 border-slate-200 opacity-50' : 'bg-amber-50 border-amber-200'}`}>
                        <input
                          type="checkbox"
                          id="isRecovery"
                          checked={currentSession.isAddingRecovery || false}
                          onChange={(e) => handleSessionFieldChange('isAddingRecovery', e.target.checked)}
                          disabled={isDisabledAdd}
                          className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 cursor-pointer disabled:cursor-not-allowed"
                        />
                        <label htmlFor="isRecovery" className="text-sm font-medium text-amber-900 cursor-pointer whitespace-nowrap">
                          Viene a recuperar
                        </label>
                      </div>

                      <button
                        onClick={addStudent}
                        disabled={isDisabledAdd}
                        className={`w-full sm:w-auto px-6 py-2.5 font-bold text-sm tracking-wide uppercase rounded-lg transition-all shadow-sm flex justify-center ${isDisabledAdd ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-black text-white hover:bg-zinc-800 active:scale-95'}`}
                      >
                        Añadir
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {currentSession.students.map((student) => (
                      <div key={student.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 bg-slate-50 border border-slate-100 rounded-xl gap-3 hover:border-slate-300 transition-colors">
                        <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-800">
                              {student.name}
                            </span>
                            {student.isRecovery && (
                              <span className="text-[10px] uppercase font-bold text-amber-600 tracking-wider flex items-center gap-1 mt-0.5">
                                <CornerDownRight className="w-3 h-3" /> Recuperación
                              </span>
                            )}
                          </div>
                          <button onClick={() => removeStudent(student.id)} className="text-slate-400 hover:text-red-500 sm:hidden p-1">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto grid grid-cols-3 sm:flex">
                          <button onClick={() => handleStatusChange(student.id, 'present')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${student.status === 'present' ? 'bg-emerald-500 text-white shadow-sm ring-2 ring-emerald-200 ring-offset-1' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>
                            <Check className="w-4 h-4" /> <span className="hidden md:inline">Presente</span>
                          </button>
                          <button onClick={() => handleStatusChange(student.id, 'notified')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${student.status === 'notified' ? 'bg-amber-400 text-amber-900 shadow-sm ring-2 ring-amber-200 ring-offset-1' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>
                            <AlertCircle className="w-4 h-4" /> <span className="hidden md:inline">Avisó</span>
                          </button>
                          <button onClick={() => handleStatusChange(student.id, 'absent')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${student.status === 'absent' ? 'bg-rose-500 text-white shadow-sm ring-2 ring-rose-200 ring-offset-1' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}>
                            <X className="w-4 h-4" /> <span className="hidden md:inline">Faltó</span>
                          </button>
                        </div>
                        <button onClick={() => removeStudent(student.id)} className="text-slate-400 hover:text-red-500 hidden sm:block p-2 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {isOverCapacity && (
                    <div className="mt-8 p-4 bg-red-50 border-2 border-red-200 rounded-xl flex items-start gap-3">
                      <AlertCircle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="font-bold text-red-800 uppercase tracking-wide text-sm">Aforo superado</h4>
                        <p className="text-red-600 text-sm mt-1">La capacidad máxima es de {currentSession.capacity} pero tienes a {currentCount} alumnos en lista. Debes eliminar alumnos de la lista o borrar la clase y crear una nueva con mayor capacidad para poder guardar.</p>
                      </div>
                    </div>
                  )}

                  <div className="mt-8 flex flex-col sm:flex-row gap-3">
                    <button onClick={saveClassOnly} disabled={isOverCapacity} className={`w-full sm:w-1/2 font-bold uppercase text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm ${isOverCapacity ? 'bg-slate-100 text-slate-400 border-2 border-slate-200 cursor-not-allowed' : 'bg-white border-2 border-zinc-200 hover:bg-zinc-50 text-black active:scale-95'}`}>
                      <Calendar className="w-5 h-5" /> {currentSession.isNew ? 'Solo Crear Clase' : 'Actualizar Alumnos / Notas'}
                    </button>
                    <button onClick={saveRecord} disabled={isOverCapacity} className={`w-full sm:w-1/2 font-bold uppercase text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md ${isOverCapacity ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-black hover:bg-zinc-800 text-white active:scale-95'}`}>
                      <Save className="w-5 h-5" /> Guardar Asistencia
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* PESTAÑA 2: DIARIO DEL PROFESOR */}
        {activeTab === 'daily' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="space-y-1 w-full sm:w-auto">
                <label className="text-xs font-bold text-slate-500 flex items-center gap-1 uppercase tracking-wider">
                  <Calendar className="w-3 h-3" /> Fecha del reporte ({getDayName(getDayOfWeek(date))})
                </label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full sm:w-auto p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-black outline-none font-medium text-slate-700" />
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-800 mb-1 uppercase tracking-wide">Resumen del Día</h2>
                <p className="text-sm text-slate-500 mb-6">Completa este breve formulario al finalizar tus clases.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">1. ¿Cómo han ido las clases en el día de hoy?</label>
                  <textarea value={dailyForm.generalFeedback} onChange={(e) => setDailyForm({ ...dailyForm, generalFeedback: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-black outline-none min-h-[100px] resize-y text-slate-700" placeholder="Escribe aquí tus comentarios generales..." />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">2. ¿Ha habido alguna incidencia o algo fuera de lo habitual?</label>
                  <textarea value={dailyForm.incidents} onChange={(e) => setDailyForm({ ...dailyForm, incidents: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-black outline-none min-h-[80px] resize-y text-slate-700" placeholder="Ej: Un alumno llegó muy tarde, hubo interrupciones..." />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">3. ¿Ha empezado hoy algún alumno nuevo? ¿Quién?</label>
                  <textarea value={dailyForm.newStudents} onChange={(e) => setDailyForm({ ...dailyForm, newStudents: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-black outline-none min-h-[80px] resize-y text-slate-700" placeholder="Menciona si hubo altas nuevas hoy..." />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-700">4. Señala si se ha roto algo o hay algo material que mejorar</label>
                  <textarea value={dailyForm.materialIssues} onChange={(e) => setDailyForm({ ...dailyForm, materialIssues: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-black outline-none min-h-[80px] resize-y text-slate-700" placeholder="Ej: Faltan atriles, un cable de piano falla..." />
                </div>
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <label className="block text-sm font-bold text-slate-700">5. ¿Cuántas horas de clase has impartido hoy?</label>
                  <input type="number" min="0" step="0.5" value={dailyForm.hoursTaught} onChange={(e) => setDailyForm({ ...dailyForm, hoursTaught: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-black outline-none text-slate-700" placeholder="Ej: 4.5" />
                </div>
              </div>

              <div className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <button onClick={() => saveDailyReport(false)} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold uppercase text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md">
                  <Save className="w-5 h-5" /> Guardar Resumen
                </button>
                <button onClick={saveAndSendDailyReport} disabled={isSendingReport} className="w-full bg-black hover:bg-zinc-800 text-white font-bold uppercase text-sm py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md disabled:opacity-60">
                  {isSendingReport ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />} Enviar a Coordinación
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA 3: HISTORIAL */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-800 mb-6 uppercase tracking-wide">Historial de Clases</h2>
            {records.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <History className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-slate-600">No hay registros aún</h3>
              </div>
            ) : (
              records.map((record) => (
                <div key={record.id} className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 pb-4 border-b border-slate-50 gap-2">
                    <div>
                      <h3 className="font-bold text-black text-lg">{record.subject}</h3>
                      <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
                        <User className="w-3 h-3" /> {record.teacher}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="font-bold text-black flex items-center md:justify-end gap-1">
                        <Calendar className="w-4 h-4 text-zinc-400" /> {formatDateSpanish(record.date)}
                      </p>
                      <p className="text-sm text-slate-500 flex items-center md:justify-end gap-1 mt-1 font-medium">
                        <Clock className="w-3 h-3" /> {record.time}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {record.students.map(student => (
                      <div key={student.id} className="flex flex-col gap-0.5 text-sm">
                        <div className="flex items-center gap-2">
                          {student.status === 'present' && <Check className="w-4 h-4 text-emerald-500" />}
                          {student.status === 'absent' && <X className="w-4 h-4 text-rose-500" />}
                          {student.status === 'notified' && <AlertCircle className="w-4 h-4 text-amber-500" />}
                          <span className={student.status === 'present' ? 'text-slate-700 font-medium' : student.status === 'absent' ? 'text-rose-600 font-bold' : 'text-amber-600 font-bold'}>
                            {student.name}
                          </span>
                        </div>
                        {student.isRecovery && (
                          <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider ml-6">Recuperación</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* PESTAÑA 4: REPORTES */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800 uppercase tracking-wide">Reportes</h2>
                <p className="text-sm text-slate-500 mt-1">Envía por email el informe de la fecha seleccionada.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full sm:w-auto p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-black outline-none font-medium text-slate-700" />
                <button onClick={() => sendReportByEmail()} disabled={isSendingReport} className="bg-white border-2 border-black hover:bg-black text-black hover:text-white px-6 py-2.5 rounded-lg font-bold uppercase text-sm tracking-wide flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-60">
                  {isSendingReport ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Enviar a Gmail
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <h3 className="font-bold text-slate-800 mb-3 uppercase tracking-wider text-sm">Vista previa del informe de {formatDateSpanish(date)}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <p className="text-xs uppercase font-bold text-slate-400">Clases registradas</p>
                  <p className="text-2xl font-bold text-slate-800">{recordsForSelectedDate.length}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <p className="text-xs uppercase font-bold text-slate-400">Horas declaradas</p>
                  <p className="text-2xl font-bold text-slate-800">{normalizeNumber((selectedDailyReport || dailyForm)?.hoursTaught)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <p className="text-xs uppercase font-bold text-slate-400">Profesor</p>
                  <p className="text-lg font-bold text-slate-800 truncate">{getTeacherName()}</p>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <h4 className="font-bold text-slate-700 mb-2 uppercase text-sm tracking-wider">Asistencia</h4>
                  <pre className="whitespace-pre-wrap text-sm bg-slate-50 border border-slate-100 rounded-xl p-4 text-slate-700 font-sans leading-relaxed">{buildAttendanceDetails()}</pre>
                </div>
                <div>
                  <h4 className="font-bold text-slate-700 mb-2 uppercase text-sm tracking-wider">Observaciones</h4>
                  <pre className="whitespace-pre-wrap text-sm bg-slate-50 border border-slate-100 rounded-xl p-4 text-slate-700 font-sans leading-relaxed">{buildObservations()}</pre>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mt-6">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-black text-white uppercase text-xs font-bold">
                    <tr>
                      <th className="px-6 py-4">Alumno</th>
                      <th className="px-6 py-4 text-center">Clases Totales</th>
                      <th className="px-6 py-4 text-center">Asistencias</th>
                      <th className="px-6 py-4 text-center text-amber-400">Faltas Avisadas</th>
                      <th className="px-6 py-4 text-center text-rose-400">Faltas Injustificadas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.length === 0 ? (
                      <tr><td colSpan="5" className="px-6 py-8 text-center text-slate-400 font-medium">Aún no hay datos.</td></tr>
                    ) : (
                      stats.map((student, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-800">{student.name}</td>
                          <td className="px-6 py-4 text-center font-bold text-slate-500">{student.total}</td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center justify-center bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full text-xs font-bold">{student.present}</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {student.notified > 0 ? <span className="inline-flex items-center justify-center bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full text-xs font-bold">{student.notified}</span> : <span className="text-slate-300">-</span>}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {student.absent > 0 ? <span className="inline-flex items-center justify-center bg-rose-100 text-rose-700 px-2.5 py-0.5 rounded-full text-xs font-bold">{student.absent}</span> : <span className="text-slate-300">-</span>}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 w-full bg-white border-t border-slate-200 flex justify-around p-2 md:hidden z-20 pb-safe">
        <button onClick={() => setActiveTab('attendance')} className={`flex flex-col items-center p-2 rounded-lg flex-1 ${activeTab === 'attendance' ? 'text-black font-bold' : 'text-slate-400'}`}>
          <ClipboardList className="w-6 h-6 mb-1" />
          <span className="text-[10px] uppercase tracking-wide">Listas</span>
        </button>
        <button onClick={() => setActiveTab('daily')} className={`flex flex-col items-center p-2 rounded-lg flex-1 ${activeTab === 'daily' ? 'text-black font-bold' : 'text-slate-400'}`}>
          <MessageSquare className="w-6 h-6 mb-1" />
          <span className="text-[10px] uppercase tracking-wide">Diario</span>
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center p-2 rounded-lg flex-1 ${activeTab === 'history' ? 'text-black font-bold' : 'text-slate-400'}`}>
          <History className="w-6 h-6 mb-1" />
          <span className="text-[10px] uppercase tracking-wide">Historial</span>
        </button>
        <button onClick={() => setActiveTab('reports')} className={`flex flex-col items-center p-2 rounded-lg flex-1 ${activeTab === 'reports' ? 'text-black font-bold' : 'text-slate-400'}`}>
          <BarChart3 className="w-6 h-6 mb-1" />
          <span className="text-[10px] uppercase tracking-wide">Reportes</span>
        </button>
      </nav>

      <nav className="hidden md:flex fixed top-1/2 -translate-y-1/2 left-4 flex-col gap-4 z-20">
        <button onClick={() => setActiveTab('attendance')} className={`p-3 rounded-xl shadow-sm flex items-center justify-center transition-all ${activeTab === 'attendance' ? 'bg-black text-white scale-110' : 'bg-white text-slate-400 hover:text-black hover:bg-slate-50 border border-slate-100'}`} title="Pasar Lista">
          <ClipboardList className="w-6 h-6" />
        </button>
        <button onClick={() => setActiveTab('daily')} className={`p-3 rounded-xl shadow-sm flex items-center justify-center transition-all ${activeTab === 'daily' ? 'bg-black text-white scale-110' : 'bg-white text-slate-400 hover:text-black hover:bg-slate-50 border border-slate-100'}`} title="Resumen Diario">
          <MessageSquare className="w-6 h-6" />
        </button>
        <button onClick={() => setActiveTab('history')} className={`p-3 rounded-xl shadow-sm flex items-center justify-center transition-all ${activeTab === 'history' ? 'bg-black text-white scale-110' : 'bg-white text-slate-400 hover:text-black hover:bg-slate-50 border border-slate-100'}`} title="Historial">
          <History className="w-6 h-6" />
        </button>
        <button onClick={() => setActiveTab('reports')} className={`p-3 rounded-xl shadow-sm flex items-center justify-center transition-all ${activeTab === 'reports' ? 'bg-black text-white scale-110' : 'bg-white text-slate-400 hover:text-black hover:bg-slate-50 border border-slate-100'}`} title="Reportes">
          <BarChart3 className="w-6 h-6" />
        </button>
      </nav>
    </div>
  );
}
