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
  Lock
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
  'https://script.google.com/macros/s/AKfycbz_MEKpKnv-L1g0e1khYf45nXCQKuUx6ZP3-bYwypTyrYzWadR4yzDd4ambExbQquvo/exec';

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
  // ESTADOS DE AUTENTICACIÓN
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // ESTADO DE DATOS
  const [loadingData, setLoadingData] = useState(true);
  const [recurringClasses, setRecurringClasses] = useState([]);
  const [records, setRecords] = useState([]);
  const [dailyReports, setDailyReports] = useState([]);

  // ESTADO DE LA UI
  const [activeTab, setActiveTab] = useState('attendance');
  const [notification, setNotification] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentSession, setCurrentSession] = useState(null);
  const [isSendingReport, setIsSendingReport] = useState(false);

  // ESTADO DEL FORMULARIO DIARIO
  const [dailyForm, setDailyForm] = useState({
    generalFeedback: '',
    incidents: '',
    newStudents: '',
    materialIssues: '',
    hoursTaught: ''
  });

  // --- EFECTOS DE FIREBASE ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        }
      } catch (error) {
        console.error("Error de inicialización de auth:", error);
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

    let recordsLoaded = false;
    let recurringLoaded = false;
    let dailyLoaded = false;

    const checkLoading = () => {
      if (recordsLoaded && recurringLoaded && dailyLoaded) setLoadingData(false);
    };

    const unsubRecurring = onSnapshot(
      recurringRef,
      (snapshot) => {
        setRecurringClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        recurringLoaded = true;
        checkLoading();
      },
      (error) => console.error("Error cargando clases:", error)
    );

    const unsubRecords = onSnapshot(
      recordsRef,
      (snapshot) => {
        const recs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        recs.sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`));
        setRecords(recs);
        recordsLoaded = true;
        checkLoading();
      },
      (error) => console.error("Error cargando historial:", error)
    );

    const unsubDaily = onSnapshot(
      dailyRef,
      (snapshot) => {
        setDailyReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        dailyLoaded = true;
        checkLoading();
      },
      (error) => console.error("Error cargando diarios:", error)
    );

    return () => {
      unsubRecurring();
      unsubRecords();
      unsubDaily();
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

  // --- FUNCIONES GENERALES ---
  const getTeacherName = () => {
    if (!user || !user.email) return 'Profesor';
    return user.email.split('@')[0];
  };

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  // --- FUNCIONES DE AUTENTICACIÓN ---
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

  // --- CONSTRUCCIÓN DEL INFORME POR EMAIL ---
  const recordsForSelectedDate = useMemo(() => {
    return records
      .filter(record => record.date === date)
      .sort((a, b) => String(a.time).localeCompare(String(b.time)));
  }, [records, date]);

  const selectedDailyReport = useMemo(() => {
    return dailyReports.find(report => report.id === date);
  }, [dailyReports, date]);

  const buildAttendanceDetails = () => {
    if (recordsForSelectedDate.length === 0) {
      return 'No hay registros de asistencia guardados para esta fecha.';
    }

    return recordsForSelectedDate.map(record => {
      const students = record.students || [];

      const present = students
        .filter(s => s.status === 'present')
        .map(s => `- ${s.name}`)
        .join('\n') || '- Ninguno';

      const notified = students
        .filter(s => s.status === 'notified')
        .map(s => `- ${s.name}`)
        .join('\n') || '- Ninguno';

      const absent = students
        .filter(s => s.status === 'absent')
        .map(s => `- ${s.name}`)
        .join('\n') || '- Ninguno';

      return `
CLASE: ${record.time} - ${record.subject}
Profesor: ${record.teacher}
Total alumnos: ${students.length}

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
    const hasDailyReport =
      Boolean(report?.generalFeedback?.trim()) ||
      Boolean(report?.incidents?.trim()) ||
      Boolean(report?.newStudents?.trim()) ||
      Boolean(report?.materialIssues?.trim()) ||
      Boolean(report?.hoursTaught);

    if (!hasAttendance && !hasDailyReport) {
      showNotification({
        type: 'error',
        text: 'No hay datos para enviar en esta fecha.'
      });
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
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload)
      });

      showNotification({
        type: 'success',
        text: 'Informe enviado por email.'
      });
    } catch (error) {
      console.error(error);
      showNotification({
        type: 'error',
        text: 'No se pudo enviar el informe.'
      });
    } finally {
      setIsSendingReport(false);
    }
  };

  // --- LÓGICA DE SESIÓN ---
  const startSession = (scheduledClass = null) => {
    if (scheduledClass) {
      setCurrentSession({
        isNew: false,
        classId: scheduledClass.id,
        time: scheduledClass.time,
        teacher: scheduledClass.teacher,
        subject: scheduledClass.subject,
        dayOfWeek: scheduledClass.dayOfWeek,
        isRecurring: true,
        students: scheduledClass.students.map(s => ({ ...s, status: 'present' })),
        newStudentName: ''
      });
    } else {
      setCurrentSession({
        isNew: true,
        classId: Date.now().toString(),
        time: '17:00',
        teacher: getTeacherName(),
        subject: '',
        isRecurring: true,
        students: [],
        newStudentName: ''
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

  const addStudent = () => {
    if (!currentSession.newStudentName.trim()) return;

    setCurrentSession({
      ...currentSession,
      students: [
        ...currentSession.students,
        {
          id: Date.now(),
          name: currentSession.newStudentName.trim(),
          status: 'present'
        }
      ],
      newStudentName: ''
    });
  };

  const removeStudent = (id) => {
    setCurrentSession({
      ...currentSession,
      students: currentSession.students.filter(s => s.id !== id)
    });
  };

  const saveRecord = async () => {
    if (!user) return;

    if (!currentSession.subject) {
      showNotification({
        type: 'error',
        text: 'Por favor, rellena la asignatura.'
      });
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
        students: currentSession.students.map(s => ({ ...s }))
      });

      if (currentSession.isRecurring) {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses', currentSession.classId), {
          dayOfWeek: currentSession.isNew ? getDayOfWeek(date) : currentSession.dayOfWeek,
          time: currentSession.time,
          teacher: currentSession.teacher,
          subject: currentSession.subject,
          students: currentSession.students.map(s => ({
            id: s.id,
            name: s.name
          }))
        });
      }

      showNotification({
        type: 'success',
        text: 'Lista guardada correctamente.'
      });

      setCurrentSession(null);
    } catch (error) {
      console.error(error);
      showNotification({
        type: 'error',
        text: 'Hubo un error al guardar los datos.'
      });
    }
  };

  const deleteRecurringClass = async (classId) => {
    if (!user) return;

    const isConfirmed = window.confirm('¿Seguro que quieres borrar esta clase de tu horario?');
    if (!isConfirmed) return;

    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses', classId));

      showNotification({
        type: 'success',
        text: 'Clase eliminada del horario.'
      });
    } catch (error) {
      console.error(error);
      showNotification({
        type: 'error',
        text: 'Error al borrar la clase.'
      });
    }
  };

  // --- LÓGICA DEL DIARIO ---
  const saveDailyReport = async (silent = false) => {
    if (!user) return false;

    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'dailyReports', date), {
        ...dailyForm,
        date
      });

      if (!silent) {
        showNotification({
          type: 'success',
          text: 'Resumen del día guardado con éxito.'
        });
      }

      return true;
    } catch (error) {
      console.error(error);
      showNotification({
        type: 'error',
        text: 'Error al guardar el resumen diario.'
      });
      return false;
    }
  };

  const saveAndSendDailyReport = async () => {
    const saved = await saveDailyReport(true);
    if (!saved) return;

    await sendReportByEmail(dailyForm);
  };

  // --- DASHBOARD ---
  const dashboardItems = useMemo(() => {
    const selectedDayOfWeek = getDayOfWeek(date);
    const items = [];
    const recordsToday = records.filter(r => r.date === date);
    const scheduledToday = recurringClasses.filter(rc => rc.dayOfWeek === selectedDayOfWeek);

    scheduledToday.forEach(rc => {
      const recordExists = recordsToday.find(r => r.classId === rc.id);

      if (recordExists) {
        items.push({
          type: 'completed',
          data: recordExists
        });
      } else {
        items.push({
          type: 'pending',
          data: rc
        });
      }
    });

    recordsToday.forEach(r => {
      const isScheduled = scheduledToday.find(rc => rc.id === r.classId);

      if (!isScheduled) {
        items.push({
          type: 'completed',
          data: r
        });
      }
    });

    return items.sort((a, b) => a.data.time.localeCompare(b.data.time));
  }, [date, records, recurringClasses]);

  const stats = useMemo(() => {
    const studentStats = {};

    records.forEach(record => {
      record.students.forEach(student => {
        if (!studentStats[student.name]) {
          studentStats[student.name] = {
            present: 0,
            absent: 0,
            notified: 0,
            total: 0
          };
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

  // --- PANTALLAS DE CARGA Y LOGIN ---
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans">
        <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-100 w-full max-w-md">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="bg-indigo-100 p-3 rounded-full mb-4">
              <Music className="w-8 h-8 text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Escuela Los Mitos</h1>
            <p className="text-slate-500 mt-1">Acceso para Profesores</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 text-center">
                {loginError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="profesor@escuela.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Contraseña
              </label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all mt-6 shadow-md"
            >
              <Lock className="w-5 h-5" />
              Entrar
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
          <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin" />
          <h2 className="text-xl font-bold text-slate-800">Cargando datos...</h2>
          <p className="text-slate-500 text-sm">Sincronizando con la nube</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-20 md:pb-0">
      <header className="bg-indigo-600 text-white p-4 shadow-md sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music className="w-6 h-6" />
            <h1 className="text-xl font-bold hidden sm:block">
              Escuela Los Mitos
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-indigo-100 text-sm flex items-center gap-2 bg-indigo-700/50 px-3 py-1.5 rounded-full">
              <User className="w-4 h-4" />
              <span className="max-w-[100px] sm:max-w-xs truncate">
                {user.email}
              </span>
            </span>

            <button
              onClick={handleLogout}
              className="text-indigo-200 hover:text-white transition-colors"
              title="Cerrar Sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {notification && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50">
          <div
            className={`px-4 py-2 rounded-full shadow-lg text-white font-medium flex items-center gap-2 ${
              notification.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'
            }`}
          >
            {notification.type === 'error' ? (
              <X className="w-4 h-4" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {notification.text}
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto p-4 md:p-6 mt-4">
        {/* PESTAÑA 1: PASAR LISTA */}
        {activeTab === 'attendance' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {!currentSession && (
              <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1 w-full sm:w-auto">
                  <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Fecha seleccionada ({getDayName(getDayOfWeek(date))})
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full sm:w-auto p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700"
                  />
                </div>

                <button
                  onClick={() => startSession(null)}
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95"
                >
                  <ClipboardList className="w-5 h-5" />
                  Nueva Clase
                </button>
              </div>
            )}

            {!currentSession ? (
              <div className="p-6">
                <h3 className="text-md font-semibold text-slate-700 mb-4 flex items-center gap-2">
                  Clases del {getDayName(getDayOfWeek(date))}, {formatDateSpanish(date)}
                </h3>

                {dashboardItems.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-slate-500 mb-4">
                      No hay clases programadas.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dashboardItems.map((item, idx) => (
                      <div
                        key={idx}
                        className={`flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border rounded-xl gap-3 transition-colors ${
                          item.type === 'completed'
                            ? 'bg-slate-50 border-slate-100'
                            : 'bg-white border-indigo-100 hover:border-indigo-300 shadow-sm'
                        }`}
                      >
                        <div>
                          <p
                            className={`font-bold flex items-center gap-2 ${
                              item.type === 'completed'
                                ? 'text-slate-700'
                                : 'text-indigo-900'
                            }`}
                          >
                            <Clock
                              className={`w-4 h-4 ${
                                item.type === 'completed'
                                  ? 'text-slate-400'
                                  : 'text-indigo-500'
                              }`}
                            />
                            {item.data.time} - {item.data.subject}
                          </p>

                          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            Prof: {item.data.teacher}
                            <span className="mx-1">•</span>
                            {item.data.students.length} alumnos
                          </p>
                        </div>

                        <div className="w-full sm:w-auto text-right mt-3 sm:mt-0 flex items-center justify-end gap-2">
                          {item.type === 'completed' ? (
                            <span className="inline-flex w-full justify-center sm:w-auto items-center gap-1 bg-emerald-100 text-emerald-700 text-xs px-2.5 py-1.5 rounded-md font-medium border border-emerald-200">
                              <Check className="w-3 h-3" />
                              Lista Pasada
                            </span>
                          ) : (
                            <>
                              <button
                                onClick={() => startSession(item.data)}
                                className="w-full sm:w-auto bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-600 font-medium py-2 px-4 rounded-lg inline-flex items-center justify-center gap-2 transition-all"
                              >
                                <Play className="w-4 h-4" />
                                Pasar Lista
                              </button>

                              <button
                                onClick={() => deleteRecurringClass(item.data.id)}
                                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                                title="Eliminar clase de forma permanente"
                              >
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
                      <h2 className="text-lg font-bold text-slate-800">
                        {currentSession.isNew ? 'Detalles de la Nueva Clase' : 'Pasando lista'}
                      </h2>
                      <span className="text-sm font-medium text-indigo-600 flex items-center gap-1 mt-1">
                        <Calendar className="w-4 h-4" />
                        {getDayName(getDayOfWeek(date))}, {formatDateSpanish(date)}
                      </span>
                    </div>

                    <button
                      onClick={() => setCurrentSession(null)}
                      className="text-slate-500 hover:text-slate-700 text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors w-full sm:w-auto text-center"
                    >
                      Volver / Cancelar
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Horario
                      </label>
                      <input
                        type="time"
                        value={currentSession.time}
                        onChange={(e) => handleSessionFieldChange('time', e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                        <Music className="w-3 h-3" />
                        Asignatura
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: Piano..."
                        value={currentSession.subject}
                        onChange={(e) => handleSessionFieldChange('subject', e.target.value)}
                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      />
                    </div>
                  </div>

                  {currentSession.isNew && (
                    <div className="mt-4 flex items-center gap-2 p-3 bg-indigo-50/50 rounded-lg border border-indigo-100">
                      <input
                        type="checkbox"
                        id="recurring"
                        checked={currentSession.isRecurring}
                        onChange={(e) => handleSessionFieldChange('isRecurring', e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                      />
                      <label
                        htmlFor="recurring"
                        className="text-sm font-medium text-indigo-900 flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Repetir esta clase cada semana
                      </label>
                    </div>
                  )}
                </div>

                <div className="p-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-4 gap-2">
                    <div>
                      <h3 className="text-md font-semibold text-slate-700">
                        Alumnos
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <input
                        type="text"
                        placeholder="Añadir alumno..."
                        value={currentSession.newStudentName}
                        onChange={(e) => handleSessionFieldChange('newStudentName', e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addStudent()}
                        className="p-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-48"
                      />

                      <button
                        onClick={addStudent}
                        className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors shrink-0"
                      >
                        <UserPlus className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {currentSession.students.map((student) => (
                      <div
                        key={student.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 bg-slate-50 border border-slate-100 rounded-xl gap-3"
                      >
                        <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
                          <span className="font-medium text-slate-800">
                            {student.name}
                          </span>

                          <button
                            onClick={() => removeStudent(student.id)}
                            className="text-slate-400 hover:text-red-500 sm:hidden p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto grid grid-cols-3 sm:flex">
                          <button
                            onClick={() => handleStatusChange(student.id, 'present')}
                            className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                              student.status === 'present'
                                ? 'bg-emerald-500 text-white shadow-sm ring-2 ring-emerald-200 ring-offset-1'
                                : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <Check className="w-4 h-4" />
                            <span className="hidden md:inline">Presente</span>
                          </button>

                          <button
                            onClick={() => handleStatusChange(student.id, 'notified')}
                            className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                              student.status === 'notified'
                                ? 'bg-amber-400 text-amber-900 shadow-sm ring-2 ring-amber-200 ring-offset-1'
                                : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <AlertCircle className="w-4 h-4" />
                            <span className="hidden md:inline">Avisó</span>
                          </button>

                          <button
                            onClick={() => handleStatusChange(student.id, 'absent')}
                            className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                              student.status === 'absent'
                                ? 'bg-rose-500 text-white shadow-sm ring-2 ring-rose-200 ring-offset-1'
                                : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <X className="w-4 h-4" />
                            <span className="hidden md:inline">Faltó</span>
                          </button>
                        </div>

                        <button
                          onClick={() => removeStudent(student.id)}
                          className="text-slate-400 hover:text-red-500 hidden sm:block p-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8">
                    <button
                      onClick={saveRecord}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md"
                    >
                      <Save className="w-5 h-5" />
                      Guardar Asistencia
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
                <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Fecha del reporte ({getDayName(getDayOfWeek(date))})
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full sm:w-auto p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700"
                />
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-800 mb-1">
                  Resumen del Día
                </h2>
                <p className="text-sm text-slate-500 mb-6">
                  Completa este breve formulario al finalizar tus clases.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    1. ¿Cómo han ido las clases en el día de hoy?
                  </label>
                  <textarea
                    value={dailyForm.generalFeedback}
                    onChange={(e) => setDailyForm({ ...dailyForm, generalFeedback: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px] resize-y text-slate-700"
                    placeholder="Escribe aquí tus comentarios generales..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    2. ¿Ha habido alguna incidencia o algo fuera de lo habitual?
                  </label>
                  <textarea
                    value={dailyForm.incidents}
                    onChange={(e) => setDailyForm({ ...dailyForm, incidents: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none min-h-[80px] resize-y text-slate-700"
                    placeholder="Ej: Un alumno llegó muy tarde, hubo interrupciones..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    3. ¿Ha empezado hoy algún alumno nuevo? ¿Quién?
                  </label>
                  <textarea
                    value={dailyForm.newStudents}
                    onChange={(e) => setDailyForm({ ...dailyForm, newStudents: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none min-h-[80px] resize-y text-slate-700"
                    placeholder="Menciona si hubo altas nuevas hoy..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    4. Señala si se ha roto algo o hay algo material que mejorar
                  </label>
                  <textarea
                    value={dailyForm.materialIssues}
                    onChange={(e) => setDailyForm({ ...dailyForm, materialIssues: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none min-h-[80px] resize-y text-slate-700"
                    placeholder="Ej: Faltan atriles, un cable de piano falla..."
                  />
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <label className="block text-sm font-semibold text-slate-700">
                    5. ¿Cuántas horas de clase has impartido hoy?
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={dailyForm.hoursTaught}
                    onChange={(e) => setDailyForm({ ...dailyForm, hoursTaught: e.target.value })}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700"
                    placeholder="Ej: 4.5"
                  />
                </div>
              </div>

              <div className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  onClick={() => saveDailyReport(false)}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md"
                >
                  <Save className="w-5 h-5" />
                  Guardar Resumen Diario
                </button>

                <button
                  onClick={saveAndSendDailyReport}
                  disabled={isSendingReport}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md disabled:opacity-60"
                >
                  {isSendingReport ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Mail className="w-5 h-5" />
                  )}
                  Guardar y enviar informe
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA 3: HISTORIAL */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-800 mb-6">
              Historial de Clases
            </h2>

            {records.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <History className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-lg font-medium text-slate-600">
                  No hay registros aún
                </h3>
              </div>
            ) : (
              records.map((record) => (
                <div
                  key={record.id}
                  className="bg-white rounded-xl shadow-sm border border-slate-100 p-5"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 pb-4 border-b border-slate-50 gap-2">
                    <div>
                      <h3 className="font-bold text-slate-800 text-lg">
                        {record.subject}
                      </h3>
                      <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
                        <User className="w-3 h-3" />
                        {record.teacher}
                      </p>
                    </div>

                    <div className="text-left md:text-right">
                      <p className="font-medium text-indigo-600 flex items-center md:justify-end gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatDateSpanish(record.date)}
                      </p>
                      <p className="text-sm text-slate-500 flex items-center md:justify-end gap-1 mt-1">
                        <Clock className="w-3 h-3" />
                        {record.time}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {record.students.map(student => (
                      <div key={student.id} className="flex items-center gap-2 text-sm">
                        {student.status === 'present' && (
                          <Check className="w-4 h-4 text-emerald-500" />
                        )}
                        {student.status === 'absent' && (
                          <X className="w-4 h-4 text-rose-500" />
                        )}
                        {student.status === 'notified' && (
                          <AlertCircle className="w-4 h-4 text-amber-500" />
                        )}

                        <span
                          className={
                            student.status === 'present'
                              ? 'text-slate-700'
                              : student.status === 'absent'
                                ? 'text-rose-600 font-medium'
                                : 'text-amber-600'
                          }
                        >
                          {student.name}
                        </span>
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
                <h2 className="text-xl font-bold text-slate-800">
                  Reportes
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Envía por email el informe de la fecha seleccionada.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full sm:w-auto p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700"
                />

                <button
                  onClick={() => sendReportByEmail()}
                  disabled={isSendingReport}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors shadow-sm disabled:opacity-60"
                >
                  {isSendingReport ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4" />
                  )}
                  Enviar informe por email
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <h3 className="font-bold text-slate-800 mb-3">
                Vista previa del informe de {formatDateSpanish(date)}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <p className="text-xs uppercase font-semibold text-slate-400">
                    Clases registradas
                  </p>
                  <p className="text-2xl font-bold text-slate-800">
                    {recordsForSelectedDate.length}
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <p className="text-xs uppercase font-semibold text-slate-400">
                    Horas declaradas
                  </p>
                  <p className="text-2xl font-bold text-slate-800">
                    {normalizeNumber((selectedDailyReport || dailyForm)?.hoursTaught)}
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <p className="text-xs uppercase font-semibold text-slate-400">
                    Profesor
                  </p>
                  <p className="text-lg font-bold text-slate-800 truncate">
                    {getTeacherName()}
                  </p>
                </div>
              </div>

              <div className="space-y-5">
                <div>
                  <h4 className="font-semibold text-slate-700 mb-2">
                    Asistencia
                  </h4>
                  <pre className="whitespace-pre-wrap text-sm bg-slate-50 border border-slate-100 rounded-xl p-4 text-slate-700">
                    {buildAttendanceDetails()}
                  </pre>
                </div>

                <div>
                  <h4 className="font-semibold text-slate-700 mb-2">
                    Observaciones
                  </h4>
                  <pre className="whitespace-pre-wrap text-sm bg-slate-50 border border-slate-100 rounded-xl p-4 text-slate-700">
                    {buildObservations()}
                  </pre>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-slate-800 uppercase text-xs font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4">Alumno</th>
                      <th className="px-6 py-4 text-center">Clases Totales</th>
                      <th className="px-6 py-4 text-center">Asistencias</th>
                      <th className="px-6 py-4 text-center text-amber-600">
                        Faltas Avisadas
                      </th>
                      <th className="px-6 py-4 text-center text-rose-600">
                        Faltas Injustificadas
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {stats.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="px-6 py-8 text-center text-slate-400">
                          Aún no hay datos.
                        </td>
                      </tr>
                    ) : (
                      stats.map((student, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-medium text-slate-800">
                            {student.name}
                          </td>

                          <td className="px-6 py-4 text-center font-semibold">
                            {student.total}
                          </td>

                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center justify-center bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full text-xs font-medium">
                              {student.present}
                            </span>
                          </td>

                          <td className="px-6 py-4 text-center">
                            {student.notified > 0 ? (
                              <span className="inline-flex items-center justify-center bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full text-xs font-medium">
                                {student.notified}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>

                          <td className="px-6 py-4 text-center">
                            {student.absent > 0 ? (
                              <span className="inline-flex items-center justify-center bg-rose-100 text-rose-700 px-2.5 py-0.5 rounded-full text-xs font-medium">
                                {student.absent}
                              </span>
                            ) : (
                              '-'
                            )}
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
        <button
          onClick={() => setActiveTab('attendance')}
          className={`flex flex-col items-center p-2 rounded-lg flex-1 ${
            activeTab === 'attendance' ? 'text-indigo-600' : 'text-slate-400'
          }`}
        >
          <ClipboardList className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-medium">Listas</span>
        </button>

        <button
          onClick={() => setActiveTab('daily')}
          className={`flex flex-col items-center p-2 rounded-lg flex-1 ${
            activeTab === 'daily' ? 'text-indigo-600' : 'text-slate-400'
          }`}
        >
          <MessageSquare className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-medium">Diario</span>
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center p-2 rounded-lg flex-1 ${
            activeTab === 'history' ? 'text-indigo-600' : 'text-slate-400'
          }`}
        >
          <History className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-medium">Historial</span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`flex flex-col items-center p-2 rounded-lg flex-1 ${
            activeTab === 'reports' ? 'text-indigo-600' : 'text-slate-400'
          }`}
        >
          <BarChart3 className="w-6 h-6 mb-1" />
          <span className="text-[10px] font-medium">Reportes</span>
        </button>
      </nav>

      <nav className="hidden md:flex fixed top-1/2 -translate-y-1/2 left-4 flex-col gap-4 z-20">
        <button
          onClick={() => setActiveTab('attendance')}
          className={`p-3 rounded-xl shadow-sm flex items-center justify-center transition-all ${
            activeTab === 'attendance'
              ? 'bg-indigo-600 text-white scale-110'
              : 'bg-white text-slate-400 hover:text-indigo-500 hover:bg-slate-50'
          }`}
          title="Pasar Lista"
        >
          <ClipboardList className="w-6 h-6" />
        </button>

        <button
          onClick={() => setActiveTab('daily')}
          className={`p-3 rounded-xl shadow-sm flex items-center justify-center transition-all ${
            activeTab === 'daily'
              ? 'bg-indigo-600 text-white scale-110'
              : 'bg-white text-slate-400 hover:text-indigo-500 hover:bg-slate-50'
          }`}
          title="Resumen Diario"
        >
          <MessageSquare className="w-6 h-6" />
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={`p-3 rounded-xl shadow-sm flex items-center justify-center transition-all ${
            activeTab === 'history'
              ? 'bg-indigo-600 text-white scale-110'
              : 'bg-white text-slate-400 hover:text-indigo-500 hover:bg-slate-50'
          }`}
          title="Historial"
        >
          <History className="w-6 h-6" />
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`p-3 rounded-xl shadow-sm flex items-center justify-center transition-all ${
            activeTab === 'reports'
              ? 'bg-indigo-600 text-white scale-110'
              : 'bg-white text-slate-400 hover:text-indigo-500 hover:bg-slate-50'
          }`}
          title="Reportes"
        >
          <BarChart3 className="w-6 h-6" />
        </button>
      </nav>
    </div>
  );
}
