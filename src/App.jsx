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
  Ticket,
  Snowflake,
  Timer,
  Palmtree,
  PartyPopper
} from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE ---
import { initializeApp, getApps, getApp } from 'firebase/app';
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

// Prevención de Crash por Hot-Reload
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- EMAIL DEL ADMINISTRADOR ---
const ADMIN_EMAIL = 'paco@escuelalosmitos.com';

const APPS_SCRIPT_URL = 'https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnTdw_SPRAss0T8IqR0EtrG6_wEjiamRp3vsIWsRZeCFilpoFKLlDIJ3z8M1ks1v7U1cPiUQ865Kqqyk3XypZtKCn37miqNlrr0VheB-sqDGGoY4dzzHNP_wLZrJQjIeSQMeQp40fyr175oGvsg7EDDvIaCSY3IIdwU2ncVNcQ99wheAriLIrsketiOYScTmzwngRCFEUjiVW8v2owQsNCh7z7R8tGIlFPIGx7tD4ugmKl9yfkGZKNgORuFAp07jw20NwfDw1EosKCcEdimFw3J3m0V7KQ&lib=MgjqRxlwoqXf5d2LrJo7pDlcMwZyZOfWI';

// --- HELPERS ---
const getDayOfWeek = (dateString) => {
  if (!dateString) return 0;
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

// Generador de fechas para los Tickets (Mes + 1)
const generateTicketDates = (dateString) => {
  if (!dateString) return { validFrom: '', validUntil: '' };
  const [y, m] = dateString.split('-').map(Number);
  let nextY = y;
  let nextM = m + 1;
  if (nextM > 12) {
    nextM = 1;
    nextY++;
  }
  const validFrom = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  const lastDay = new Date(nextY, nextM, 0).getDate();
  const validUntil = `${nextY}-${String(nextM).padStart(2, '0')}-${lastDay}`;
  return { validFrom, validUntil };
};

// Helper para sacar el mes anterior (para calcular vacaciones)
const getPreviousMonthStr = (currentMonthStr) => { 
  const [y, m] = currentMonthStr.split('-').map(Number);
  let prevM = m - 1;
  let prevY = y;
  if (prevM === 0) {
    prevM = 12;
    prevY--;
  }
  return `${prevY}-${String(prevM).padStart(2, '0')}`;
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
  const [tickets, setTickets] = useState([]); 
  const [substitutions, setSubstitutions] = useState([]); // NUEVO: Estado para la bolsa global de sustituciones
  
  const [settings, setSettings] = useState({
    hourlyRate: 17.33,
    generalTasks: ['Ordenar el aula', 'Revisar material'],
    instrumentTasks: {},
    festivos: [],
    vacaciones: []
  });

  const [activeTab, setActiveTab] = useState('attendance');
  const [notification, setNotification] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentSession, setCurrentSession] = useState(null);
  const [isSendingReport, setIsSendingReport] = useState(false);
  
  const [deadHourModal, setDeadHourModal] = useState(null);

  const [dailyForm, setDailyForm] = useState({
    generalFeedback: '',
    incidents: '',
    newStudents: '',
    materialIssues: '',
    hoursTaught: ''
  });

  const isAdmin = user?.email === ADMIN_EMAIL;

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
    const globalStudentsRef = collection(db, 'artifacts', appId, 'students');
    const settingsRef = doc(db, 'artifacts', appId, 'settings', 'global');
    const ticketsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'tickets');
    const substitutionsRef = collection(db, 'artifacts', appId, 'substitutions'); // NUEVO: Listener de sustituciones

    let recordsLoaded = false;
    let recurringLoaded = false;
    let dailyLoaded = false;
    let studentsLoaded = false;
    let ticketsLoaded = false;
    let subsLoaded = false;

    const checkLoading = () => {
      if (recordsLoaded && recurringLoaded && dailyLoaded && studentsLoaded && ticketsLoaded && subsLoaded) setLoadingData(false);
    };

    const unsubRecurring = onSnapshot(recurringRef, (snapshot) => {
      setRecurringClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      recurringLoaded = true;
      checkLoading();
    });

    const unsubRecords = onSnapshot(recordsRef, (snapshot) => {
      const recs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      recs.sort((a, b) => new Date(`${b.date || ''}T${b.time || '00:00'}`) - new Date(`${a.date || ''}T${a.time || '00:00'}`));
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

    const unsubSettings = onSnapshot(settingsRef, (doc) => {
      if (doc.exists()) {
        setSettings(doc.data());
      }
    });

    const unsubTickets = onSnapshot(ticketsRef, (snapshot) => {
      const tks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTickets(tks);
      ticketsLoaded = true;
      checkLoading();
    });

    const unsubSubs = onSnapshot(substitutionsRef, (snapshot) => {
      setSubstitutions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      subsLoaded = true;
      checkLoading();
    });

    return () => {
      unsubRecurring();
      unsubRecords();
      unsubDaily();
      unsubStudents();
      unsubSettings();
      unsubTickets();
      unsubSubs();
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

  // CÁLCULO DE NÓMINA CON VACACIONES
  const monthlyPayroll = useMemo(() => {
    const currentMonth = date.substring(0, 7); 
    const prevMonth = getPreviousMonthStr(currentMonth);

    // Horas reales actuales
    const currentRecords = records.filter(r => r.date && r.date.startsWith(currentMonth));
    const currentMinutes = currentRecords.reduce((acc, r) => acc + normalizeNumber(r.duration || 60), 0);
    const currentHours = currentMinutes / 60;

    // Media mes anterior
    const prevRecords = records.filter(r => r.date && r.date.startsWith(prevMonth));
    const prevTotalMinutes = prevRecords.reduce((acc, r) => acc + normalizeNumber(r.duration || 60), 0);
    const prevUniqueDays = new Set(prevRecords.map(r => r.date)).size;
    const avgDailyMins = prevUniqueDays > 0 ? (prevTotalMinutes / prevUniqueDays) : 0;

    // Proyección de vacaciones
    const vacationsThisMonth = (settings.vacaciones || []).filter(d => d.startsWith(currentMonth)).length;
    const projectedMinutes = vacationsThisMonth * avgDailyMins;
    const projectedHours = projectedMinutes / 60;

    // Totales
    const totalHours = currentHours + projectedHours;
    const earnings = totalHours * (settings.hourlyRate || 0);

    return { 
      realHours: currentHours.toFixed(2),
      projectedHours: projectedHours.toFixed(2),
      vacationDays: vacationsThisMonth,
      totalHours: totalHours.toFixed(2), 
      earnings: earnings.toFixed(2) 
    };
  }, [records, date, settings]);

  const buildAttendanceDetails = () => {
    if (recordsForSelectedDate.length === 0) {
      return 'No hay registros de asistencia guardados para esta fecha.';
    }

    return recordsForSelectedDate.map(record => {
      const students = record.students || [];

      const present = students
        .filter(s => s.status === 'present')
        .map(s => `- ${s.name}${s.isRecovery ? ' (Recuperación)' : ''}`)
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
Anotaciones: ${record.notes || 'Ninguna'}

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
        duration: scheduledClass.duration || 60,
        notes: scheduledClass.notes || '',
        dayOfWeek: scheduledClass.dayOfWeek,
        isRecurring: true,
        students: scheduledClass.students.map(s => ({ ...s, status: s.isPaused ? 'paused' : 'present' })),
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
        duration: 60,
        notes: '',
        isRecurring: true,
        students: [],
        newStudentName: '',
        isAddingRecovery: false,
        cancelledDates: []
      });
    }
  };

  // NUEVO: Función para clonar la sustitución al apretar "Asumir Clase"
  const assumeSubstitution = (sub) => {
    setCurrentSession({
      isNew: true, // Forzamos a que sea nueva para no machacar la plantilla del otro profesor
      classId: `sub-${sub.originalClassId}`,
      time: sub.time,
      teacher: getTeacherName(), // Ponemos al sustituto como profesor del día
      subject: sub.subject,
      capacity: sub.capacity,
      duration: sub.duration,
      notes: sub.notes,
      dayOfWeek: getDayOfWeek(sub.date),
      isRecurring: false, // ¡CRÍTICO! Bloqueamos la recurrencia para que no se le guarde en su agenda base
      students: sub.students.map(s => ({ ...s, status: s.isPaused ? 'paused' : 'present' })),
      newStudentName: '',
      isAddingRecovery: false,
      cancelledDates: [],
      isSubstitution: true, // Marca de agua para limpiarla de la bolsa al guardar
      substitutionId: sub.id
    });
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

  const togglePauseStudent = (id) => {
    setCurrentSession({
      ...currentSession,
      students: currentSession.students.map(s => {
        if (s.id === id) {
          const newlyPaused = !s.isPaused;
          return { ...s, isPaused: newlyPaused, status: newlyPaused ? 'paused' : 'present' };
        }
        return s;
      })
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

    if (currentSession.isAddingRecovery) {
      const selectedClassDate = date; 
      const hasValidTicket = tickets.some(t => 
        t.studentId === studentId && 
        !t.isUsed && 
        selectedClassDate >= t.validFrom && 
        selectedClassDate <= t.validUntil
      );
      
      if (!hasValidTicket) {
        showNotification({ type: 'error', text: 'Este alumno no tiene recuperaciones pendientes válidas para la fecha seleccionada.' });
        return; 
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
          isRecovery: currentSession.isAddingRecovery || false,
          isPaused: false
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
        .map(s => ({ id: s.id, name: s.name, isPaused: s.isPaused || false }));

      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses', classIdToSave), {
        dayOfWeek: dayToSave,
        time: currentSession.time,
        teacher: currentSession.teacher,
        subject: currentSession.subject,
        capacity: currentSession.capacity,
        duration: currentSession.duration || 60,
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

  const checkDeadHourAndSave = () => {
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

    // Desactivamos la colisión si es una sustitución, ya que le hemos forzado isRecurring a false y un classId especial
    if (!currentSession.isSubstitution) {
      const hasCollision = recurringClasses.some(rc => 
        rc.dayOfWeek === dayToSave && 
        rc.time === currentSession.time &&
        rc.id !== classIdToSave
      );

      if (hasCollision) {
        showNotification({ type: 'error', text: `Imposible guardar: Ya tienes otra clase programada los ${getDayName(dayToSave)} a las ${currentSession.time}.` });
        return;
      }
    }

    const activeStudents = currentSession.students.filter(s => !s.isPaused);
    const allAbsent = activeStudents.length > 0 && activeStudents.every(s => s.status === 'absent' || s.status === 'notified');
    
    if (allAbsent) {
      const myClassesToday = dashboardItems.map(i => i.data.time).sort();
      const isLastClass = currentSession.time === myClassesToday[myClassesToday.length - 1];

      if (isLastClass) {
        showNotification({ type: 'success', text: "¡Clase vacía y última hora! Puedes irte a casa. Guardando..." });
        executeSaveRecord();
      } else {
        const combinedTasks = [
          ...(settings.generalTasks || []),
          ...(settings.instrumentTasks?.[currentSession.subject] || [])
        ];
        setDeadHourModal({ tasks: combinedTasks, subject: currentSession.subject });
      }
    } else {
      executeSaveRecord();
    }
  };

  const executeSaveRecord = async (deadHourNote = null) => {
    try {
      const recordId = Date.now().toString();
      const currentMonth = date.substring(0, 7);
      
      const finalNotes = deadHourNote 
        ? `[HORA MUERTA]: ${deadHourNote}. ${currentSession.notes || ''}` 
        : currentSession.notes;

      // El generador de tickets respeta el contexto del profesor sustituto o el original
      const targetUid = user.uid;

      const ticketPromises = currentSession.students.map(async (s) => {
        if (s.status === 'notified' && !s.isRecovery && !s.isPaused) {
          const monthTickets = tickets.filter(t => t.studentId === s.id && t.originalDate.startsWith(currentMonth));
          if (monthTickets.length < 2) {
            const { validFrom, validUntil } = generateTicketDates(date);
            const ticketId = Date.now().toString() + '-' + s.id;
            await setDoc(doc(db, 'artifacts', appId, 'users', targetUid, 'tickets', ticketId), {
              studentId: s.id,
              studentName: s.name,
              subject: currentSession.subject,
              originalDate: date,
              validFrom,
              validUntil,
              isUsed: false,
              createdAt: new Date().toISOString()
            });
          }
        }
        
        if (s.isRecovery && s.status === 'present') {
          const pending = tickets.filter(t => t.studentId === s.id && !t.isUsed).sort((a, b) => new Date(a.validFrom) - new Date(b.validFrom));
          if (pending.length > 0) {
            await setDoc(doc(db, 'artifacts', appId, 'users', targetUid, 'tickets', pending[0].id), { isUsed: true }, { merge: true });
          }
        }
      });
      await Promise.all(ticketPromises);

      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'records', recordId), {
        classId: currentSession.classId,
        date,
        time: currentSession.time,
        teacher: currentSession.teacher,
        subject: currentSession.subject,
        capacity: currentSession.capacity,
        duration: currentSession.duration || 60,
        notes: finalNotes,
        students: currentSession.students.map(s => ({ ...s }))
      });

      // Solo actualiza la plantilla semanal si NO es una sustitución y está marcado el checkbox
      if (currentSession.isRecurring && !currentSession.isSubstitution) {
        const templateStudents = currentSession.students
          .filter(s => !s.isRecovery)
          .map(s => ({ id: s.id, name: s.name, isPaused: s.isPaused || false }));

        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses', currentSession.classId), {
          dayOfWeek: currentSession.isNew ? getDayOfWeek(date) : currentSession.dayOfWeek,
          time: currentSession.time,
          teacher: currentSession.teacher,
          subject: currentSession.subject,
          capacity: currentSession.capacity,
          duration: currentSession.duration || 60,
          notes: currentSession.notes,
          cancelledDates: currentSession.cancelledDates || [],
          students: templateStudents
        });
      }

      // NUEVO: Limpiamos la sustitución global si era una clase asumida
      if (currentSession.isSubstitution && currentSession.substitutionId) {
        await deleteDoc(doc(db, 'artifacts', appId, 'substitutions', currentSession.substitutionId));
      }

      showNotification({ type: 'success', text: 'Lista guardada correctamente.' });
      setCurrentSession(null);
      setDeadHourModal(null);
    } catch (error) {
      console.error(error);
      showNotification({ type: 'error', text: 'Hubo un error al guardar los datos.' });
    }
  };

  const markTicketAsUsed = async (ticketId) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tickets', ticketId), { isUsed: true }, { merge: true });
      showNotification({ type: 'success', text: 'Ticket marcado como recuperado.' });
    } catch (e) {
      showNotification({ type: 'error', text: 'Error al actualizar el ticket.' });
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

      // NUEVO: Inyectar la clase cancelada en la Bolsa Global de Sustituciones
      const subId = `${classData.id}-${date}`;
      await setDoc(doc(db, 'artifacts', appId, 'substitutions', subId), {
        originalClassId: classData.id,
        originalTeacherUid: user.uid,
        originalTeacherName: classData.teacher || getTeacherName(),
        date: date,
        time: classData.time,
        subject: classData.subject,
        capacity: classData.capacity || '',
        duration: classData.duration || 60,
        notes: classData.notes || '',
        students: classData.students || []
      });

      showNotification({ type: 'success', text: 'Clase enviada a la Bolsa de Sustituciones.' });
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
    
    if (!dailyForm.generalFeedback.trim()) {
      showNotification({ type: 'error', text: 'El campo "Cómo han ido las clases" es obligatorio.' });
      return false;
    }

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

    return items.sort((a, b) => (a.data.time || '').localeCompare(b.data.time || ''));
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


  // --- COMPONENTES AUXILIARES ---

  const DeadHourOverlay = () => {
    const [note, setNote] = useState('');
    const [selectedTask, setSelectedTask] = useState('');

    return (
      <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl">
          <div className="flex items-center gap-3 text-red-600 mb-4">
            <AlertCircle className="w-8 h-8" />
            <h2 className="text-xl font-bold uppercase tracking-tight">Protocolo Hora Muerta</h2>
          </div>
          <p className="text-zinc-600 mb-6 font-medium">Todos los alumnos activos han faltado. Por favor, selecciona una tarea productiva para este tiempo:</p>
          
          <div className="space-y-3 mb-6 max-h-48 overflow-y-auto pr-2">
            {deadHourModal.tasks.length === 0 && <p className="text-sm text-zinc-400 italic">No hay tareas configuradas.</p>}
            {deadHourModal.tasks.map((t, i) => (
              <button key={i} onClick={() => setSelectedTask(t)} className={`w-full text-left p-3 rounded-xl border-2 transition-all ${selectedTask === t ? 'border-black bg-zinc-50 font-bold' : 'border-zinc-100 text-zinc-500 hover:border-zinc-300'}`}>
                {t}
              </button>
            ))}
          </div>

          <textarea 
            placeholder="Escribe brevemente qué has hecho..."
            value={note} onChange={e => setNote(e.target.value)}
            className="w-full p-4 border-2 border-zinc-200 rounded-xl focus:border-black outline-none mb-6 min-h-[100px]"
          />

          <div className="flex gap-3">
            <button onClick={() => setDeadHourModal(null)} className="w-1/3 bg-zinc-100 text-zinc-600 font-bold py-4 rounded-xl uppercase">Cancelar</button>
            <button 
              disabled={!selectedTask || !note}
              onClick={() => executeSaveRecord(`${selectedTask}: ${note}`)}
              className="w-2/3 bg-black text-white font-bold py-4 rounded-xl uppercase tracking-widest disabled:opacity-30 transition-all"
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    );
  };

  const AdminPanel = () => {
    const [newTask, setNewTask] = useState('');

    const saveSettings = async (newSet) => {
      await setDoc(doc(db, 'artifacts', appId, 'settings', 'global'), newSet);
      showNotification({ type: 'success', text: 'Ajustes guardados globalmente.' });
    };

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="bg-white p-6 md:p-8 rounded-2xl border border-zinc-200 shadow-sm">
          <h2 className="text-xl font-bold uppercase mb-2 flex items-center gap-2 tracking-wide"><Lock className="w-5 h-5"/> Coste de Hora (Convenio)</h2>
          <p className="text-zinc-500 mb-6 text-sm">Este valor se usará para calcular la nómina de todos los profesores.</p>
          <div className="flex items-center gap-4 bg-zinc-50 p-4 rounded-xl border border-zinc-200">
            <input type="number" step="0.01" value={settings.hourlyRate} onChange={e => setSettings({...settings, hourlyRate: e.target.value})} className="text-2xl font-bold w-32 p-2 border-b-4 border-black outline-none bg-transparent" />
            <span className="text-2xl font-bold">€ / hora</span>
            <button onClick={() => saveSettings(settings)} className="ml-auto bg-black hover:bg-zinc-800 text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors shadow-md">Actualizar Valor</button>
          </div>
        </div>

        {/* CALENDARIO ESCOLAR */}
        <div className="bg-white p-6 md:p-8 rounded-2xl border border-zinc-200 shadow-sm">
          <h2 className="text-xl font-bold uppercase mb-2 flex items-center gap-2 tracking-wide"><Calendar className="w-5 h-5"/> Calendario Escolar</h2>
          <p className="text-zinc-500 mb-8 text-sm">Bloquea días a nivel global. Los Festivos no suman a nómina. Las Vacaciones sumarán la media diaria del mes anterior.</p>
          
          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <input id="adminDateInput" type="date" className="p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl focus:border-black outline-none font-bold flex-1" />
            <select id="adminDateType" className="p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl focus:border-black outline-none font-bold uppercase text-xs">
              <option value="festivo">Festivo</option>
              <option value="vacacion">Vacaciones</option>
            </select>
            <button onClick={async () => { 
              const d = document.getElementById('adminDateInput').value;
              const t = document.getElementById('adminDateType').value;
              if(d) {
                const arr = t === 'festivo' ? (settings.festivos||[]) : (settings.vacaciones||[]);
                if(!arr.includes(d)) {
                  const s = {...settings, [t === 'festivo' ? 'festivos' : 'vacaciones']: [...arr, d]};
                  setSettings(s); await setDoc(doc(db, 'artifacts', appId, 'settings', 'global'), s);
                  showNotification({ type: 'success', text: `Día añadido al calendario`});
                }
              }
            }} className="bg-black text-white px-8 py-4 rounded-2xl shadow-lg font-black uppercase text-[10px]"><Plus/></button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-black text-amber-600 uppercase tracking-widest text-[10px] mb-3 border-b pb-2 flex items-center gap-2"><PartyPopper className="w-4 h-4"/> Días Festivos</h4>
              <div className="space-y-2">
                {(!settings.festivos || settings.festivos.length === 0) && <p className="text-xs text-zinc-400 italic">No hay festivos.</p>}
                {settings.festivos?.sort().map(f => (
                  <div key={f} className="flex justify-between p-3 bg-amber-50 rounded-xl text-xs font-bold text-amber-900">{formatDateSpanish(f)} <button onClick={async () => {const s = {...settings, festivos: settings.festivos.filter(x => x !== f)}; setSettings(s); await setDoc(doc(db, 'artifacts', appId, 'settings', 'global'), s);}}><Trash2 className="w-4 h-4 hover:text-red-500"/></button></div>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-black text-emerald-600 uppercase tracking-widest text-[10px] mb-3 border-b pb-2 flex items-center gap-2"><Palmtree className="w-4 h-4"/> Vacaciones</h4>
              <div className="space-y-2">
                {(!settings.vacaciones || settings.vacaciones.length === 0) && <p className="text-xs text-zinc-400 italic">No hay vacaciones.</p>}
                {settings.vacaciones?.sort().map(v => (
                  <div key={v} className="flex justify-between p-3 bg-emerald-50 rounded-xl text-xs font-bold text-emerald-900">{formatDateSpanish(v)} <button onClick={async () => {const s = {...settings, vacaciones: settings.vacaciones.filter(x => x !== v)}; setSettings(s); await setDoc(doc(db, 'artifacts', appId, 'settings', 'global'), s);}}><Trash2 className="w-4 h-4 hover:text-red-500"/></button></div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 md:p-8 rounded-2xl border border-zinc-200 shadow-sm">
          <h2 className="text-xl font-bold uppercase mb-2 flex items-center gap-2 tracking-wide"><Settings className="w-5 h-5"/> Tareas Generales (Hora Muerta)</h2>
          <p className="text-zinc-500 mb-6 text-sm">Estas opciones aparecerán cuando un profesor tenga una hora libre entre clases.</p>
          
          <div className="flex flex-col sm:flex-row gap-2 mb-6">
            <input type="text" value={newTask} onChange={e => setNewTask(e.target.value)} placeholder="Ej: Ordenar partituras del aula..." className="flex-1 p-3 bg-zinc-50 border border-zinc-200 focus:border-black outline-none rounded-xl" />
            <button 
              onClick={() => { 
                if(newTask) { 
                  const s = {...settings, generalTasks: [...(settings.generalTasks||[]), newTask]}; 
                  setSettings(s); saveSettings(s); setNewTask(''); 
                } 
              }} 
              className="bg-black text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center justify-center gap-2 hover:bg-zinc-800"
            >
              <Plus className="w-4 h-4"/> Añadir
            </button>
          </div>
          
          <div className="space-y-3">
            {settings.generalTasks?.length === 0 && <p className="text-zinc-400 italic text-sm p-4 text-center bg-zinc-50 rounded-xl">No hay tareas configuradas.</p>}
            {settings.generalTasks?.map((t, i) => (
              <div key={i} className="flex justify-between items-center p-4 bg-zinc-50 border border-zinc-100 rounded-xl">
                <span className="font-medium text-slate-700">{t}</span>
                <button onClick={() => { const s = {...settings, generalTasks: settings.generalTasks.filter((_, idx) => idx !== i)}; setSettings(s); saveSettings(s); }} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"><Trash2 className="w-5 h-5"/></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };


  // --- RENDER DE CARGA E INICIO DE SESIÓN ---
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center font-sans">
        <RefreshCw className="w-10 h-10 text-black animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center font-sans p-4">
        <div className="bg-white p-8 md:p-10 rounded-3xl shadow-xl border border-zinc-100 w-full max-w-md">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="bg-black text-white p-4 rounded-2xl mb-4 shadow-lg rotate-3">
              <Music className="w-8 h-8" />
            </div>
            <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">Los Mitos</h1>
            <p className="text-zinc-400 mt-1 font-bold uppercase tracking-widest text-xs">Escuela de Música</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {loginError && (
              <div className="p-3 bg-red-50 text-red-600 text-sm font-bold rounded-xl border border-red-100 text-center">
                {loginError}
              </div>
            )}
            <div>
              <input type="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="w-full p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl focus:border-black outline-none transition-colors font-medium" placeholder="Email del profesor" />
            </div>
            <div>
              <input type="password" required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl focus:border-black outline-none transition-colors font-medium" placeholder="Contraseña" />
            </div>
            <button type="submit" className="w-full bg-black hover:bg-zinc-800 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all mt-6 shadow-xl uppercase tracking-widest text-sm active:scale-95">
              <Lock className="w-5 h-5" /> Entrar
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (loadingData) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4 p-8 bg-white rounded-3xl shadow-lg border border-zinc-100">
          <RefreshCw className="w-10 h-10 text-black animate-spin" />
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-wide">Cargando datos</h2>
          <p className="text-zinc-400 font-medium">Sincronizando con la nube...</p>
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

  // VERIFICACIÓN DÍAS FESTIVOS Y VACACIONES
  const isFestivo = settings.festivos?.includes(date);
  const isVacacion = settings.vacaciones?.includes(date);
  const isSpecialDay = isFestivo || isVacacion;

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-slate-800 pb-24 md:pb-0">
      {deadHourModal && <DeadHourOverlay />}

      <header className="bg-black text-white p-5 sticky top-0 z-50 shadow-md border-b border-zinc-800">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white p-1.5 rounded-lg">
              <Music className="w-5 h-5 text-black" />
            </div>
            <h1 className="text-xl font-black hidden sm:block uppercase tracking-tighter">Escuela Los Mitos</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-zinc-300 text-sm flex items-center gap-2 bg-zinc-800 px-4 py-2 rounded-xl font-medium">
              <User className="w-4 h-4" />
              <span className="max-w-[100px] sm:max-w-xs truncate">{user.email}</span>
            </span>
            <button onClick={handleLogout} className="text-zinc-400 hover:text-white transition-colors" title="Cerrar Sesión">
              <LogOut className="w-6 h-6" />
            </button>
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
        {/* TABS (MENÚ SUPERIOR) */}
        <div className="flex gap-2 mb-8 bg-white p-2 rounded-2xl shadow-sm border border-zinc-200 overflow-x-auto no-scrollbar">
          {[
            { id: 'attendance', label: 'Listas', icon: ClipboardList },
            { id: 'tickets', label: 'Bolsa', icon: Ticket },
            { id: 'daily', label: 'Diario', icon: MessageSquare },
            { id: 'history', label: 'Historial', icon: History },
            { id: 'reports', label: 'Mi Mes', icon: BarChart3 }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold uppercase text-[10px] sm:text-xs tracking-wider transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-black text-white shadow-md' : 'text-zinc-400 hover:text-black hover:bg-zinc-50'}`}>
              <tab.icon className="w-4 h-4"/> <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
          {isAdmin && (
            <button onClick={() => setActiveTab('admin')} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold uppercase text-[10px] sm:text-xs tracking-wider transition-all bg-red-50 text-red-500 border border-red-100 ${activeTab === 'admin' ? 'bg-red-600 text-white' : ''}`}>
              <Settings className="w-4 h-4"/> Admin
            </button>
          )}
        </div>

        {/* --- PESTAÑA 1: LISTAS --- */}
        {activeTab === 'attendance' && (
          <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 overflow-hidden">
            {!currentSession && (
              <div className="p-6 md:p-8 border-b border-zinc-100 bg-zinc-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1 w-full sm:w-auto">
                  <label className="text-xs font-black text-zinc-400 flex items-center gap-1 uppercase tracking-widest">
                    <Calendar className="w-3 h-3" /> Agenda del día
                  </label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full sm:w-auto p-3 bg-white border-2 border-zinc-200 rounded-xl focus:border-black outline-none font-bold text-slate-700 transition-colors" />
                </div>
                <button onClick={() => startSession(null)} disabled={isSpecialDay} className="w-full sm:w-auto bg-black hover:bg-zinc-800 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 uppercase text-xs tracking-widest disabled:opacity-30 disabled:cursor-not-allowed">
                  <ClipboardList className="w-5 h-5" /> Nueva Clase
                </button>
              </div>
            )}

            {!currentSession ? (
              <div className="p-6 md:p-8">
                <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2 uppercase tracking-wide">
                  {getDayName(getDayOfWeek(date))}, {formatDateSpanish(date)}
                </h3>

                {isSpecialDay && (
                  <div className={`p-6 rounded-2xl mb-8 flex items-center gap-4 ${isFestivo ? 'bg-amber-100 text-amber-900 border-2 border-amber-200' : 'bg-emerald-100 text-emerald-900 border-2 border-emerald-200'}`}>
                    {isFestivo ? <PartyPopper className="w-10 h-10 shrink-0"/> : <Palmtree className="w-10 h-10 shrink-0"/>}
                    <div>
                      <h4 className="font-black uppercase tracking-widest text-lg">{isFestivo ? 'Día Festivo' : 'Día de Vacaciones'}</h4>
                      <p className="text-sm font-medium mt-1">El centro está cerrado hoy. No es necesario pasar lista ni enviar el reporte diario.</p>
                    </div>
                  </div>
                )}

                {/* NUEVO PANEL: SUSTITUCIONES DISPONIBLES */}
                {substitutions.filter(s => s.date === date).length > 0 && !isSpecialDay && (
                  <div className="mb-8 p-6 bg-zinc-100 border-2 border-zinc-300 rounded-2xl">
                    <h4 className="font-black text-slate-800 uppercase tracking-widest text-sm mb-4 flex items-center gap-2">
                      <AlertCircle className="w-5 h-5"/> Sustituciones Disponibles
                    </h4>
                    <div className="space-y-3">
                      {substitutions.filter(s => s.date === date).map(sub => (
                        <div key={sub.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-white rounded-xl border-2 border-zinc-200 shadow-sm hover:border-black transition-colors">
                          <div>
                            <p className="font-black uppercase text-sm text-slate-800">{sub.time} - {sub.subject}</p>
                            <p className="text-xs font-bold text-zinc-500 mt-1 uppercase tracking-widest">
                              Prof Original: {sub.originalTeacherName} • {sub.students.length} alumnos
                            </p>
                          </div>
                          <button 
                            onClick={() => assumeSubstitution(sub)} 
                            className="mt-3 sm:mt-0 w-full sm:w-auto bg-black text-white font-bold py-2.5 px-5 rounded-xl text-[10px] uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-md active:scale-95"
                          >
                            Asumir Clase
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {dashboardItems.length === 0 ? (
                  <div className="text-center py-16 bg-zinc-50 rounded-2xl border-2 border-dashed border-zinc-200">
                    <p className="text-zinc-400 font-bold uppercase tracking-widest">No hay clases en agenda.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {dashboardItems.map((item, idx) => (
                      <div key={idx} className={`group flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 rounded-2xl border-2 transition-all ${item.type === 'completed' || isSpecialDay ? 'bg-zinc-50 border-zinc-100 opacity-70' : 'bg-white border-zinc-100 hover:border-black shadow-sm hover:shadow-md'}`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-black ${item.type === 'completed' || isSpecialDay ? 'bg-zinc-200 text-zinc-500' : 'bg-black text-white'}`}>
                            <span className="text-sm leading-none">{item.data.time.split(':')[0]}</span>
                            <span className="text-[10px] opacity-70">{item.data.time.split(':')[1]}</span>
                          </div>
                          <div>
                            <p className={`font-black uppercase tracking-wide text-sm ${item.type === 'completed' || isSpecialDay ? 'text-zinc-500' : 'text-slate-800'}`}>
                              {item.data.subject}
                            </p>
                            <p className="text-xs font-bold text-zinc-400 flex items-center gap-1 mt-1 uppercase">
                              <Clock className="w-3 h-3" /> {item.data.duration || 60} min <span className="mx-1">•</span> <User className="w-3 h-3" /> Prof: {item.data.teacher} 
                              <span className="mx-1">•</span> 
                              {item.data.students.length} {item.data.capacity ? `/ ${item.data.capacity}` : ''} alumnos
                            </p>
                          </div>
                        </div>
                        <div className="w-full sm:w-auto text-right mt-4 sm:mt-0 flex items-center justify-end gap-2">
                          {isSpecialDay ? (
                            <span className="bg-zinc-200 text-zinc-500 px-4 py-2 rounded-lg font-black text-[10px] uppercase border border-zinc-300">No Laborable</span>
                          ) : item.type === 'completed' ? (
                            <span className="inline-flex w-full justify-center sm:w-auto items-center gap-1 bg-emerald-100 text-emerald-700 text-xs px-4 py-2 rounded-lg font-black border border-emerald-200 uppercase tracking-widest">
                              <Check className="w-4 h-4" /> Completado
                            </span>
                          ) : (
                            <>
                              <button onClick={() => startSession(item.data)} className="w-full sm:w-auto bg-zinc-100 hover:bg-black hover:text-white text-black font-bold py-2.5 px-5 rounded-xl inline-flex items-center justify-center gap-2 transition-all text-xs uppercase tracking-widest">
                                <Play className="w-4 h-4" /> Pasar Lista
                              </button>
                              
                              <button onClick={() => cancelClassForToday(item.data)} className="p-2.5 text-zinc-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors shrink-0" title="Cancelar solo por hoy (Sustitución)">
                                <CalendarOff className="w-5 h-5" />
                              </button>

                              <button onClick={() => deleteRecurringClass(item.data.id)} className="p-2.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors shrink-0" title="Eliminar plantilla permanentemente">
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
                {/* CABECERA DENTRO DE LA CLASE */}
                <div className="p-6 md:p-8 border-b border-zinc-100 bg-white relative">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                    <div className="flex flex-col">
                      <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{currentSession.isNew ? 'Nueva Clase' : 'Pasando lista'}</h2>
                      <span className="text-sm font-bold text-zinc-400 flex items-center gap-1 mt-1 uppercase tracking-widest">
                        <Calendar className="w-4 h-4" /> {getDayName(getDayOfWeek(date))}, {formatDateSpanish(date)}
                      </span>
                    </div>
                    <button onClick={() => setCurrentSession(null)} className="text-zinc-500 hover:text-black hover:bg-zinc-100 text-xs font-black uppercase tracking-widest px-5 py-2.5 rounded-xl border-2 border-zinc-200 transition-colors w-full sm:w-auto text-center">
                      Cerrar Vista
                    </button>
                  </div>

                  {currentSession.isSubstitution && (
                    <div className="mb-6 p-4 bg-zinc-100 border-2 border-zinc-300 rounded-xl flex items-center gap-3">
                      <AlertCircle className="text-black w-6 h-6 shrink-0"/>
                      <p className="text-xs font-bold text-slate-800">Estás pasando lista como profesor sustituto. Esta clase solo se guardará en tu agenda para el día de hoy, y cobrarás la hora correspondiente.</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1"><Clock className="w-3 h-3" /> Horario</label>
                      <input 
                        type="time" 
                        value={currentSession.time} 
                        onChange={(e) => handleSessionFieldChange('time', e.target.value)} 
                        disabled={!currentSession.isNew}
                        className={`w-full p-4 rounded-xl font-bold outline-none transition-all ${!currentSession.isNew ? 'bg-zinc-100 text-zinc-400 border-2 border-zinc-200 cursor-not-allowed' : 'bg-zinc-50 border-2 border-zinc-200 focus:border-black text-slate-800'}`} 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1"><Music className="w-3 h-3" /> Instrumento</label>
                      <input 
                        type="text" 
                        placeholder="Ej: Piano..." 
                        value={currentSession.subject} 
                        onChange={(e) => handleSessionFieldChange('subject', e.target.value)} 
                        disabled={!currentSession.isNew}
                        className={`w-full p-4 rounded-xl font-bold outline-none transition-all ${!currentSession.isNew ? 'bg-zinc-100 text-zinc-400 border-2 border-zinc-200 cursor-not-allowed' : 'bg-zinc-50 border-2 border-zinc-200 focus:border-black text-slate-800'}`} 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1"><User className="w-3 h-3" /> Aforo Máximo</label>
                      <input 
                        type="number" 
                        min="1" 
                        placeholder="Ej: 4" 
                        value={currentSession.capacity} 
                        onChange={(e) => handleSessionFieldChange('capacity', e.target.value)} 
                        disabled={!currentSession.isNew}
                        className={`w-full p-4 rounded-xl font-bold outline-none transition-all ${!currentSession.isNew ? 'bg-zinc-100 text-zinc-400 border-2 border-zinc-200 cursor-not-allowed' : 'bg-zinc-50 border-2 border-zinc-200 focus:border-black text-slate-800'}`} 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1"><Timer className="w-3 h-3" /> Duración (min)</label>
                      <input 
                        type="number" 
                        min="15" 
                        step="5"
                        placeholder="Ej: 60" 
                        value={currentSession.duration} 
                        onChange={(e) => handleSessionFieldChange('duration', e.target.value)} 
                        disabled={!currentSession.isNew}
                        className={`w-full p-4 rounded-xl font-bold outline-none transition-all ${!currentSession.isNew ? 'bg-zinc-100 text-zinc-400 border-2 border-zinc-200 cursor-not-allowed' : 'bg-zinc-50 border-2 border-zinc-200 focus:border-black text-slate-800'}`} 
                      />
                    </div>
                  </div>

                  <div className="space-y-2 mt-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1"><BookOpen className="w-3 h-3" /> Cuaderno de Bitácora (Pasa a la sig. semana)</label>
                    <textarea 
                      placeholder="Ejercicios, tareas, estado de los alumnos..." 
                      value={currentSession.notes} 
                      onChange={(e) => handleSessionFieldChange('notes', e.target.value)} 
                      className="w-full p-4 bg-amber-50/40 border-2 border-amber-100 rounded-xl focus:border-amber-400 outline-none text-slate-800 font-medium text-sm min-h-[100px] resize-y transition-colors" 
                    />
                  </div>

                  {currentSession.isNew && !currentSession.isSubstitution && (
                    <div className="mt-6 flex items-center gap-2 p-4 bg-zinc-50 rounded-xl border-2 border-zinc-100">
                      <input type="checkbox" id="recurring" checked={currentSession.isRecurring} onChange={(e) => handleSessionFieldChange('isRecurring', e.target.checked)} className="w-5 h-5 text-black rounded focus:ring-black accent-black cursor-pointer" />
                      <label htmlFor="recurring" className="text-xs font-black uppercase tracking-widest text-slate-700 flex items-center gap-1.5 cursor-pointer">
                        <RefreshCw className="w-4 h-4" /> Repetir clase cada semana
                      </label>
                    </div>
                  )}
                </div>

                {/* ZONA DE ALUMNOS */}
                <div className="p-6 md:p-8">
                  <div className={`flex flex-col mb-8 p-6 rounded-2xl border-2 transition-colors ${isCapacityMissing ? 'bg-amber-50/50 border-amber-200' : isCapacityReached ? 'bg-red-50 border-red-200' : 'bg-zinc-50 border-zinc-200'}`}>
                    <h3 className="text-sm uppercase tracking-widest font-black text-slate-800 mb-4 flex items-center gap-2">
                      <UserPlus className="w-5 h-5 text-black" />
                      Añadir Alumno
                      {currentSession.capacity && (
                        <span className={`ml-2 px-3 py-1 rounded-lg text-[10px] ${isOverCapacity ? 'bg-red-600 text-white shadow-sm' : isCapacityReached ? 'bg-red-200 text-red-900' : 'bg-zinc-200 text-zinc-600'}`}>
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
                          placeholder={isCapacityMissing ? "Escribe la capacidad arriba primero..." : isCapacityReached ? "Aforo completo. No puedes añadir más." : "Escribe 2 letras para buscar..."}
                          value={currentSession.newStudentName}
                          onChange={(e) => handleSessionFieldChange('newStudentName', e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && addStudent()}
                          disabled={isDisabledAdd}
                          className={`w-full p-4 text-sm font-bold rounded-xl outline-none relative z-10 transition-colors ${isDisabledAdd ? 'bg-zinc-100 border-2 border-zinc-200 cursor-not-allowed text-zinc-400' : 'bg-white border-2 border-zinc-200 focus:border-black text-slate-800'}`}
                        />
                        {!isDisabledAdd && currentSession.newStudentName.length >= 2 && (
                          <div className="absolute left-0 right-0 top-full mt-2 bg-white border-2 border-zinc-800 rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto overflow-x-hidden">
                            {globalStudents.filter(s => s.name.toLowerCase().includes(currentSession.newStudentName.trim().toLowerCase())).length === 0 ? (
                              <div className="p-4 text-sm font-bold text-zinc-500 bg-zinc-50">
                                No hay coincidencias. Se guardará como alumno nuevo.
                              </div>
                            ) : (
                              globalStudents
                                .filter(s => s.name.toLowerCase().includes(currentSession.newStudentName.trim().toLowerCase()))
                                .map(student => (
                                  <div
                                    key={student.id}
                                    onClick={() => handleSessionFieldChange('newStudentName', student.name)}
                                    className="p-4 text-sm font-bold text-slate-700 hover:bg-black hover:text-white cursor-pointer border-b border-zinc-100 last:border-0 transition-colors flex items-center gap-3"
                                  >
                                    <User className="w-4 h-4 opacity-50" />
                                    {student.name}
                                  </div>
                                ))
                            )}
                          </div>
                        )}
                      </div>

                      <div className={`flex items-center gap-3 w-full sm:w-auto px-4 py-4 rounded-xl border-2 transition-colors ${isDisabledAdd ? 'bg-zinc-100 border-zinc-200 opacity-50' : 'bg-amber-50 border-amber-200'}`}>
                        <input
                          type="checkbox"
                          id="isRecovery"
                          checked={currentSession.isAddingRecovery || false}
                          onChange={(e) => handleSessionFieldChange('isAddingRecovery', e.target.checked)}
                          disabled={isDisabledAdd}
                          className="w-5 h-5 accent-amber-600 rounded cursor-pointer disabled:cursor-not-allowed"
                        />
                        <label htmlFor="isRecovery" className="text-xs font-black text-amber-900 uppercase tracking-widest cursor-pointer whitespace-nowrap">
                          Viene a recuperar
                        </label>
                      </div>

                      <button
                        onClick={addStudent}
                        disabled={isDisabledAdd}
                        className={`w-full sm:w-auto px-8 py-4 font-black text-xs tracking-widest uppercase rounded-xl transition-all shadow-sm flex justify-center ${isDisabledAdd ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed' : 'bg-black text-white hover:bg-zinc-800 active:scale-95'}`}
                      >
                        Añadir
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {currentSession.students.map((student) => (
                      <div key={student.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 md:p-5 border-2 rounded-2xl gap-4 transition-colors ${student.isPaused ? 'bg-blue-50/50 border-blue-100' : 'bg-zinc-50 border-zinc-100 hover:border-zinc-300'}`}>
                        <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
                          <div className="flex flex-col">
                            <span className={`font-bold text-lg ${student.isPaused ? 'text-zinc-400 line-through' : 'text-slate-800'}`}>
                              {student.name}
                            </span>
                            {student.isRecovery && !student.isPaused && (
                              <span className="text-[10px] uppercase font-black text-amber-600 tracking-widest flex items-center gap-1 mt-1">
                                <CornerDownRight className="w-3 h-3" /> Recuperación
                              </span>
                            )}
                          </div>
                          
                          {/* BOTONES MÓVIL: CONGELAR Y BORRAR */}
                          <div className="flex gap-2 sm:hidden">
                            <button onClick={() => togglePauseStudent(student.id)} className={`p-2 rounded-lg transition-colors ${student.isPaused ? 'bg-blue-100 text-blue-600' : 'text-zinc-400 hover:text-blue-500 hover:bg-blue-50'}`} title="Congelar Plaza">
                              <Snowflake className="w-5 h-5" />
                            </button>
                            <button onClick={() => removeStudent(student.id)} className="text-zinc-400 hover:text-red-500 p-2">
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

                        {/* BOTONERA ASISTENCIA / MANTENIMIENTO */}
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          {student.isPaused ? (
                            <div className="w-full sm:w-auto px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider bg-blue-100 text-blue-700 border border-blue-200 text-center flex items-center justify-center gap-2">
                              <Snowflake className="w-4 h-4"/> En Mantenimiento
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 sm:flex w-full bg-white p-1.5 rounded-xl border border-zinc-200">
                              <button onClick={() => handleStatusChange(student.id, 'present')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${student.status === 'present' ? 'bg-emerald-500 text-white shadow-md' : 'bg-white text-zinc-500 hover:bg-zinc-100'}`}>
                                <Check className="w-4 h-4" /> <span className="hidden md:inline">Presente</span>
                              </button>
                              <button onClick={() => handleStatusChange(student.id, 'notified')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${student.status === 'notified' ? 'bg-amber-400 text-amber-900 shadow-md' : 'bg-white text-zinc-500 hover:bg-zinc-100'}`}>
                                <AlertCircle className="w-4 h-4" /> <span className="hidden md:inline">Avisó</span>
                              </button>
                              <button onClick={() => handleStatusChange(student.id, 'absent')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${student.status === 'absent' ? 'bg-rose-500 text-white shadow-md' : 'bg-white text-zinc-500 hover:bg-zinc-100'}`}>
                                <X className="w-4 h-4" /> <span className="hidden md:inline">Faltó</span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* BOTONES PC: CONGELAR Y BORRAR */}
                        <div className="hidden sm:flex items-center gap-2">
                          <button onClick={() => togglePauseStudent(student.id)} className={`p-3 rounded-xl transition-colors ${student.isPaused ? 'bg-blue-100 text-blue-600 shadow-sm' : 'text-zinc-300 hover:text-blue-500 hover:bg-blue-50'}`} title="Congelar Plaza (Mantenimiento)">
                            <Snowflake className="w-5 h-5" />
                          </button>
                          <button onClick={() => removeStudent(student.id)} className="text-zinc-300 hover:text-rose-600 hover:bg-rose-50 p-3 rounded-xl transition-colors" title="Borrar alumno">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {isOverCapacity && (
                    <div className="mt-8 p-5 bg-red-50 border-2 border-red-200 rounded-2xl flex items-start gap-4">
                      <AlertCircle className="w-8 h-8 text-red-500 shrink-0" />
                      <div>
                        <h4 className="font-black text-red-800 uppercase tracking-widest text-sm">Aforo superado</h4>
                        <p className="text-red-700 text-sm mt-1 font-medium leading-relaxed">El límite es de {currentSession.capacity} pero hay {currentCount} alumnos. Elimina alumnos o crea otra clase con más capacidad para poder guardar.</p>
                      </div>
                    </div>
                  )}

                  <div className="mt-10 flex flex-col sm:flex-row gap-4 pt-8 border-t border-zinc-100">
                    <button onClick={saveClassOnly} disabled={isOverCapacity} className={`w-full sm:w-1/2 font-black uppercase tracking-widest text-xs py-4 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-sm ${isOverCapacity ? 'bg-zinc-100 text-zinc-400 border-2 border-zinc-200 cursor-not-allowed' : 'bg-white border-2 border-zinc-200 hover:bg-zinc-50 text-black active:scale-95'}`}>
                      <Calendar className="w-5 h-5" /> {currentSession.isNew ? 'Solo Crear Clase' : 'Actualizar Plantilla'}
                    </button>
                    <button onClick={checkDeadHourAndSave} disabled={isOverCapacity} className={`w-full sm:w-1/2 font-black uppercase tracking-widest text-xs py-4 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg ${isOverCapacity ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed' : 'bg-black hover:bg-zinc-800 text-white active:scale-95'}`}>
                      <Save className="w-5 h-5" /> Guardar Asistencia
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* --- PESTAÑA BOLSA DE RECUPERACIONES --- */}
        {activeTab === 'tickets' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Bolsa de Recuperaciones</h2>
                <p className="text-sm font-medium text-zinc-500 mt-1">Tickets generados automáticamente para los alumnos que avisaron.</p>
              </div>
            </div>

            {tickets.filter(t => !t.isUsed).length === 0 ? (
              <div className="text-center py-16 bg-white rounded-3xl border border-zinc-200 shadow-sm">
                <Ticket className="w-16 h-16 text-zinc-200 mx-auto mb-4" />
                <h3 className="text-lg font-bold uppercase tracking-widest text-zinc-400">No hay tickets pendientes</h3>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tickets.filter(t => !t.isUsed)
                  .sort((a, b) => new Date(a.validFrom) - new Date(b.validFrom))
                  .map(ticket => {
                    const today = new Date().toISOString().split('T')[0];
                    const isExpired = today > ticket.validUntil;
                    const isValidNow = today >= ticket.validFrom && today <= ticket.validUntil;

                    return (
                      <div key={ticket.id} className={`p-6 rounded-3xl border-2 shadow-sm flex flex-col justify-between ${isExpired ? 'bg-zinc-50 border-zinc-200 opacity-60' : isValidNow ? 'bg-white border-emerald-200' : 'bg-white border-amber-200'}`}>
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="font-black text-xl text-slate-800">{ticket.studentName}</h3>
                            <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 mt-1">{ticket.subject}</p>
                          </div>
                          <div className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${isExpired ? 'bg-zinc-200 text-zinc-500' : isValidNow ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {isExpired ? 'Caducado' : isValidNow ? 'Activo' : 'Próximo Mes'}
                          </div>
                        </div>
                        
                        <div className="space-y-2 mb-6">
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-500">Falta original:</span>
                            <span className="font-bold text-slate-700">{formatDateSpanish(ticket.originalDate)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-500">Mes de uso:</span>
                            <span className="font-bold text-slate-700">{formatDateSpanish(ticket.validFrom)} - {formatDateSpanish(ticket.validUntil)}</span>
                          </div>
                        </div>

                        <button 
                          onClick={() => markTicketAsUsed(ticket.id)}
                          className="w-full py-4 rounded-xl font-black uppercase text-xs tracking-widest bg-black text-white hover:bg-zinc-800 transition-colors shadow-md"
                        >
                          Marcar como Recuperada
                        </button>
                      </div>
                    );
                })}
              </div>
            )}
          </div>
        )}

        {/* --- PESTAÑA DIARIO DEL PROFESOR --- */}
        {activeTab === 'daily' && (
          <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 overflow-hidden">
            <div className="p-6 md:p-8 border-b border-zinc-100 bg-zinc-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="space-y-1 w-full sm:w-auto">
                <label className="text-xs font-black text-zinc-400 flex items-center gap-1 uppercase tracking-widest">
                  <Calendar className="w-3 h-3" /> Fecha del reporte
                </label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full sm:w-auto p-3 bg-white border-2 border-zinc-200 rounded-xl focus:border-black outline-none font-bold text-slate-700 transition-colors" />
              </div>
            </div>

            {isSpecialDay ? (
              <div className="p-16 text-center">
                {isFestivo ? <PartyPopper className="w-20 h-20 text-amber-300 mx-auto mb-6"/> : <Palmtree className="w-20 h-20 text-emerald-300 mx-auto mb-6"/>}
                <h3 className="text-2xl font-black uppercase tracking-widest text-slate-800">Día No Laborable</h3>
                <p className="text-zinc-500 font-bold mt-2">Hoy es un día especial marcado en el calendario de la escuela. <br/>No es necesario que rellenes ni envíes el reporte diario.</p>
              </div>
            ) : (
              <div className="p-6 md:p-8 space-y-8">
                <div>
                  <h2 className="text-2xl font-black text-slate-800 mb-2 uppercase tracking-tight">Diario de Trabajo</h2>
                  <p className="text-sm font-medium text-zinc-500">Documenta tu jornada para enviarla a coordinación.</p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="block text-sm font-black uppercase tracking-wide text-slate-800">1. ¿Cómo han ido las clases hoy? <span className="text-red-500">*</span></label>
                    <textarea required value={dailyForm.generalFeedback} onChange={(e) => setDailyForm({ ...dailyForm, generalFeedback: e.target.value })} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl focus:border-black outline-none min-h-[100px] resize-y text-slate-700 font-medium transition-colors" placeholder="Ej: Muy bien, hemos trabajado las escalas..." />
                  </div>
                  <div className="space-y-3">
                    <label className="block text-sm font-black uppercase tracking-wide text-slate-800">2. Incidencias o fuera de lo común</label>
                    <textarea value={dailyForm.incidents} onChange={(e) => setDailyForm({ ...dailyForm, incidents: e.target.value })} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl focus:border-black outline-none min-h-[80px] resize-y text-slate-700 font-medium transition-colors" placeholder="Llegadas tarde, interrupciones..." />
                  </div>
                  <div className="space-y-3">
                    <label className="block text-sm font-black uppercase tracking-wide text-slate-800">3. Alumnos nuevos</label>
                    <textarea value={dailyForm.newStudents} onChange={(e) => setDailyForm({ ...dailyForm, newStudents: e.target.value })} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl focus:border-black outline-none min-h-[80px] resize-y text-slate-700 font-medium transition-colors" placeholder="Nombres de altas nuevas, primeras impresiones del alumno..." />
                  </div>
                  <div className="space-y-3">
                    <label className="block text-sm font-black uppercase tracking-wide text-slate-800">4. Estado del material</label>
                    <textarea value={dailyForm.materialIssues} onChange={(e) => setDailyForm({ ...dailyForm, materialIssues: e.target.value })} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl focus:border-black outline-none min-h-[80px] resize-y text-slate-700 font-medium transition-colors" placeholder="Atriles rotos, cables fallando..." />
                  </div>
                </div>

                <div className="pt-8 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-zinc-100">
                  <button onClick={() => saveDailyReport(false)} className="w-full bg-white border-2 border-zinc-200 text-black hover:bg-zinc-50 font-black uppercase tracking-widest text-xs py-4 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm">
                    <Save className="w-5 h-5" /> Guardar Borrador
                  </button>
                  <button onClick={saveAndSendDailyReport} disabled={isSendingReport} className="w-full bg-black hover:bg-zinc-800 text-white font-black uppercase tracking-widest text-xs py-4 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl disabled:opacity-60">
                    {isSendingReport ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />} Enviar a Coordinación
                  </button>
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
              <div className="text-center py-16 bg-white rounded-3xl border border-zinc-200 shadow-sm">
                <History className="w-16 h-16 text-zinc-200 mx-auto mb-4" />
                <h3 className="text-lg font-bold uppercase tracking-widest text-zinc-400">No hay registros aún</h3>
              </div>
            ) : (
              records.map((record) => (
                <div key={record.id} className="bg-white rounded-3xl shadow-sm border border-zinc-200 p-6 md:p-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 pb-6 border-b border-zinc-100 gap-4">
                    <div>
                      <h3 className="font-black uppercase tracking-wide text-black text-xl">{record.subject}</h3>
                      <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5 mt-2">
                        <User className="w-4 h-4" /> {record.teacher}
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="font-black text-slate-800 flex items-center md:justify-end gap-1.5">
                        <Calendar className="w-4 h-4 text-zinc-400" /> {formatDateSpanish(record.date)}
                      </p>
                      <p className="text-sm font-bold uppercase tracking-widest text-zinc-500 flex items-center md:justify-end gap-1.5 mt-1">
                        <Clock className="w-4 h-4" /> {record.time}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {record.students.map(student => (
                      <div key={student.id} className="flex flex-col gap-1 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                        <div className="flex items-center gap-2.5">
                          {student.status === 'present' && <Check className="w-5 h-5 text-emerald-500 bg-emerald-100 rounded-md p-0.5" />}
                          {student.status === 'absent' && <X className="w-5 h-5 text-rose-500 bg-rose-100 rounded-md p-0.5" />}
                          {student.status === 'notified' && <AlertCircle className="w-5 h-5 text-amber-500 bg-amber-100 rounded-md p-0.5" />}
                          <span className={`text-sm ${student.status === 'present' ? 'text-slate-700 font-bold' : student.status === 'absent' ? 'text-rose-600 font-black' : 'text-amber-700 font-black'}`}>
                            {student.name}
                          </span>
                        </div>
                        {student.isRecovery && (
                          <span className="text-[10px] text-amber-600 font-black uppercase tracking-widest ml-8">Recuperación</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* --- PESTAÑA REPORTES Y NÓMINA --- */}
        {activeTab === 'reports' && (
          <div className="space-y-8">
            <div className="bg-black text-white p-8 md:p-10 rounded-3xl shadow-2xl relative overflow-hidden">
               <div className="relative z-10">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-4">
                    <div>
                      <h2 className="text-3xl font-black uppercase tracking-tighter">Mi Nómina</h2>
                      <p className="text-zinc-400 font-bold uppercase text-xs tracking-widest mt-1">
                        {new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="bg-zinc-800/80 backdrop-blur border border-zinc-700 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-zinc-300 shadow-inner">
                      Tarifa Convenio: <span className="text-white">{settings.hourlyRate}€/h</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    <div className="bg-zinc-900/80 p-6 rounded-3xl border border-zinc-800 backdrop-blur hover:bg-zinc-800 transition-colors">
                      <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-2"><Clock className="w-4 h-4"/> Horas Reales</p>
                      <p className="text-4xl font-black tracking-tighter">{monthlyPayroll.realHours}<span className="text-lg text-zinc-600 ml-1 font-bold">h</span></p>
                    </div>
                    <div className="bg-zinc-900/80 p-6 rounded-3xl border border-zinc-800 backdrop-blur hover:border-blue-500/30 transition-colors">
                      <p className="text-[10px] font-black text-blue-500/80 uppercase tracking-widest mb-2 flex items-center gap-2"><Palmtree className="w-4 h-4"/> Vacaciones ({monthlyPayroll.vacationDays}d)</p>
                      <p className="text-4xl font-black tracking-tighter text-blue-400">{monthlyPayroll.projectedHours}<span className="text-lg text-zinc-600 ml-1 font-bold">h</span></p>
                    </div>
                    <div className="bg-zinc-900/80 p-6 rounded-3xl border border-zinc-800 backdrop-blur hover:border-emerald-500/30 transition-colors">
                      <p className="text-[10px] font-black text-emerald-600/50 uppercase tracking-widest mb-2 flex items-center gap-2"><BarChart3 className="w-4 h-4"/> Acumulado Mes</p>
                      <p className="text-4xl font-black tracking-tighter text-emerald-400">{monthlyPayroll.earnings}<span className="text-lg ml-1 font-bold">€</span></p>
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-center mt-6">* La proyección de vacaciones se calcula matemáticamente en base a la media diaria de tu mes anterior.</p>
               </div>
               <Music className="absolute -bottom-12 -right-12 w-80 h-80 text-zinc-900/40 rotate-12 pointer-events-none" />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Reporte Diario</h2>
                <p className="text-sm font-medium text-zinc-500 mt-1">Previsualiza los datos que enviarás de la jornada.</p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full sm:w-auto p-3 bg-white border-2 border-zinc-200 rounded-xl focus:border-black outline-none font-bold text-slate-700" />
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 p-6 md:p-8">
              <h3 className="font-black text-slate-800 mb-6 uppercase tracking-widest text-xs">Datos de {formatDateSpanish(date)}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-5">
                  <p className="text-[10px] uppercase font-black tracking-widest text-zinc-400">Clases</p>
                  <p className="text-3xl font-black text-slate-800 mt-1">{recordsForSelectedDate.length}</p>
                </div>
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-5">
                  <p className="text-[10px] uppercase font-black tracking-widest text-zinc-400">Horas Registradas</p>
                  <p className="text-3xl font-black text-slate-800 mt-1">{(recordsForSelectedDate.reduce((acc, r) => acc + normalizeNumber(r.duration || 60), 0) / 60).toFixed(2)}h</p>
                </div>
                <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-5">
                  <p className="text-[10px] uppercase font-black tracking-widest text-zinc-400">Profesor</p>
                  <p className="text-xl font-black text-slate-800 mt-1 truncate">{getTeacherName()}</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="font-black text-slate-800 mb-3 uppercase tracking-widest text-[10px]">Registro de Asistencia</h4>
                  <pre className="whitespace-pre-wrap text-sm bg-zinc-900 text-zinc-300 rounded-2xl p-6 font-mono leading-relaxed overflow-x-auto shadow-inner">{buildAttendanceDetails()}</pre>
                </div>
                <div>
                  <h4 className="font-black text-slate-800 mb-3 uppercase tracking-widest text-[10px]">Observaciones del Profesor</h4>
                  <pre className="whitespace-pre-wrap text-sm bg-zinc-50 border-2 border-zinc-100 rounded-2xl p-6 font-sans font-medium text-slate-700 leading-relaxed">{buildObservations()}</pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- PESTAÑA SECRETA ADMIN --- */}
        {activeTab === 'admin' && isAdmin && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* TARIFA */}
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-zinc-200 shadow-sm">
              <h2 className="text-xl font-bold uppercase mb-2 flex items-center gap-2 tracking-wide"><Lock className="w-5 h-5"/> Coste de Hora (Convenio)</h2>
              <p className="text-zinc-500 mb-6 text-sm">Este valor se usará para calcular la nómina de todos los profesores.</p>
              <div className="flex items-center gap-4 bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                <input type="number" step="0.01" value={settings.hourlyRate} onChange={e => setSettings({...settings, hourlyRate: e.target.value})} className="text-2xl font-bold w-32 p-2 border-b-4 border-black outline-none bg-transparent" />
                <span className="text-2xl font-bold">€ / hora</span>
                <button onClick={async () => { await setDoc(doc(db, 'artifacts', appId, 'settings', 'global'), settings); showNotification({ type: 'success', text: 'Tarifa actualizada' }); }} className="ml-auto bg-black hover:bg-zinc-800 text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors shadow-md">Actualizar Valor</button>
              </div>
            </div>

            {/* CALENDARIO ESCOLAR */}
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-zinc-200 shadow-sm">
              <h2 className="text-xl font-bold uppercase mb-2 flex items-center gap-2 tracking-wide"><Calendar className="w-5 h-5"/> Calendario Escolar</h2>
              <p className="text-zinc-500 mb-8 text-sm">Bloquea días a nivel global. Los Festivos no suman a nómina. Las Vacaciones sumarán la media diaria del mes anterior.</p>
              
              <div className="flex flex-col sm:flex-row gap-3 mb-8">
                <input id="adminDateInput" type="date" className="p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl focus:border-black outline-none font-bold flex-1" />
                <select id="adminDateType" className="p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl focus:border-black outline-none font-bold uppercase text-xs">
                  <option value="festivo">Festivo</option>
                  <option value="vacacion">Vacaciones</option>
                </select>
                <button onClick={async () => { 
                  const d = document.getElementById('adminDateInput').value;
                  const t = document.getElementById('adminDateType').value;
                  if(d) {
                    const arr = t === 'festivo' ? (settings.festivos||[]) : (settings.vacaciones||[]);
                    if(!arr.includes(d)) {
                      const s = {...settings, [t === 'festivo' ? 'festivos' : 'vacaciones']: [...arr, d]};
                      setSettings(s); await setDoc(doc(db, 'artifacts', appId, 'settings', 'global'), s);
                      showNotification({ type: 'success', text: `Día añadido al calendario`});
                    }
                  }
                }} className="bg-black text-white px-8 py-4 rounded-2xl shadow-lg font-black uppercase text-[10px]"><Plus/></button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-black text-amber-600 uppercase tracking-widest text-[10px] mb-3 border-b pb-2 flex items-center gap-2"><PartyPopper className="w-4 h-4"/> Días Festivos</h4>
                  <div className="space-y-2">
                    {(!settings.festivos || settings.festivos.length === 0) && <p className="text-xs text-zinc-400 italic">No hay festivos.</p>}
                    {settings.festivos?.sort().map(f => (
                      <div key={f} className="flex justify-between p-3 bg-amber-50 rounded-xl text-xs font-bold text-amber-900">{formatDateSpanish(f)} <button onClick={async () => {const s = {...settings, festivos: settings.festivos.filter(x => x !== f)}; setSettings(s); await setDoc(doc(db, 'artifacts', appId, 'settings', 'global'), s);}}><Trash2 className="w-4 h-4 hover:text-red-500"/></button></div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-black text-emerald-600 uppercase tracking-widest text-[10px] mb-3 border-b pb-2 flex items-center gap-2"><Palmtree className="w-4 h-4"/> Vacaciones</h4>
                  <div className="space-y-2">
                    {(!settings.vacaciones || settings.vacaciones.length === 0) && <p className="text-xs text-zinc-400 italic">No hay vacaciones.</p>}
                    {settings.vacaciones?.sort().map(v => (
                      <div key={v} className="flex justify-between p-3 bg-emerald-50 rounded-xl text-xs font-bold text-emerald-900">{formatDateSpanish(v)} <button onClick={async () => {const s = {...settings, vacaciones: settings.vacaciones.filter(x => x !== v)}; setSettings(s); await setDoc(doc(db, 'artifacts', appId, 'settings', 'global'), s);}}><Trash2 className="w-4 h-4 hover:text-red-500"/></button></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 md:p-8 rounded-2xl border border-zinc-200 shadow-sm">
              <h2 className="text-xl font-bold uppercase mb-2 flex items-center gap-2 tracking-wide"><Settings className="w-5 h-5"/> Tareas Generales (Hora Muerta)</h2>
              <p className="text-zinc-500 mb-6 text-sm">Estas opciones aparecerán cuando un profesor tenga una hora libre entre clases.</p>
              
              <div className="flex flex-col sm:flex-row gap-2 mb-6">
                <input id="adminTaskInput" type="text" placeholder="Ej: Ordenar partituras del aula..." className="flex-1 p-3 bg-zinc-50 border border-zinc-200 focus:border-black outline-none rounded-xl" />
                <button 
                  onClick={async () => { 
                    const val = document.getElementById('adminTaskInput').value;
                    if(val) { 
                      const s = {...settings, generalTasks: [...(settings.generalTasks||[]), val]}; 
                      setSettings(s); await setDoc(doc(db, 'artifacts', appId, 'settings', 'global'), s); 
                      document.getElementById('adminTaskInput').value = ''; 
                    } 
                  }} 
                  className="bg-black text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center justify-center gap-2 hover:bg-zinc-800"
                >
                  <Plus className="w-4 h-4"/> Añadir
                </button>
              </div>
              
              <div className="space-y-3">
                {settings.generalTasks?.length === 0 && <p className="text-zinc-400 italic text-sm p-4 text-center bg-zinc-50 rounded-xl">No hay tareas configuradas.</p>}
                {settings.generalTasks?.map((t, i) => (
                  <div key={i} className="flex justify-between items-center p-4 bg-zinc-50 border border-zinc-100 rounded-xl">
                    <span className="font-medium text-slate-700">{t}</span>
                    <button onClick={async () => { const s = {...settings, generalTasks: settings.generalTasks.filter((_, idx) => idx !== i)}; setSettings(s); await setDoc(doc(db, 'artifacts', appId, 'settings', 'global'), s); }} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"><Trash2 className="w-5 h-5"/></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* NAVEGACIÓN MÓVIL Y PC... */}
      <nav className="md:hidden fixed bottom-0 w-full bg-white border-t border-zinc-200 pb-safe z-40">
        <div className="flex justify-around p-2">
          {[{id:'attendance', i:ClipboardList}, {id:'tickets', i:Ticket}, {id:'daily', i:MessageSquare}, {id:'reports', i:BarChart3}].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`p-4 rounded-xl transition-all ${activeTab === t.id ? 'bg-black text-white shadow-lg' : 'text-zinc-400'}`}><t.i className="w-6 h-6"/></button>
          ))}
          {isAdmin && <button onClick={() => setActiveTab('admin')} className={`p-4 rounded-xl transition-all ${activeTab === 'admin' ? 'bg-red-600 text-white shadow-lg' : 'text-zinc-400'}`}><Settings className="w-6 h-6"/></button>}
        </div>
      </nav>

      <nav className="hidden md:flex fixed top-1/2 -translate-y-1/2 left-6 flex-col gap-4 z-40">
        {[{id:'attendance', i:ClipboardList, t:'Listas'}, {id:'tickets', i:Ticket, t:'Bolsa'}, {id:'daily', i:MessageSquare, t:'Diario'}, {id:'history', i:History, t:'Historial'}, {id:'reports', i:BarChart3, t:'Nómina'}].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`p-5 rounded-2xl shadow-sm flex items-center justify-center transition-all ${activeTab === t.id ? 'bg-black text-white scale-110 shadow-xl' : 'bg-white text-zinc-400 hover:text-black border-2'}`} title={t.t}><t.i/></button>
        ))}
        {isAdmin && <button onClick={() => setActiveTab('admin')} className={`p-5 rounded-2xl shadow-sm flex items-center justify-center transition-all mt-4 ${activeTab === 'admin' ? 'bg-red-600 text-white' : 'bg-white text-red-300 border-2'}`} title="Admin"><Settings/></button>}
      </nav>
    </div>
  );
}
