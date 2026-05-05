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
  Sparkles,
  MessageSquare,
  LogOut,
  Lock
} from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE ---
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithCustomToken, signInWithEmailAndPassword, signOut } from 'firebase/auth';
// ¡AÑADIDO deleteDoc a las herramientas de Firebase!
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

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

// --- HELPERS ---
const getDayOfWeek = (dateString) => {
  const [year, month, day] = dateString.split('-');
  return new Date(year, month - 1, day).getDay(); // 0 = Domingo, 1 = Lunes...
};

const getDayName = (dayIndex) => {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[dayIndex];
};

export default function App() {
  // ESTADOS DE AUTENTICACIÓN
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  // ESTADO DE DATOS (Se llenan desde Firebase)
  const [loadingData, setLoadingData] = useState(true);
  const [recurringClasses, setRecurringClasses] = useState([]);
  const [records, setRecords] = useState([]);
  const [dailyReports, setDailyReports] = useState([]);

  // ESTADO DE LA UI
  const [activeTab, setActiveTab] = useState('attendance');
  const [notification, setNotification] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentSession, setCurrentSession] = useState(null);

  // ESTADO DEL FORMULARIO DIARIO
  const [dailyForm, setDailyForm] = useState({
    generalFeedback: '',
    incidents: '',
    newStudents: '',
    materialIssues: '',
    hoursTaught: ''
  });

  // ESTADOS IA (Gemini)
  const [generatedReport, setGeneratedReport] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

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

    const unsubRecurring = onSnapshot(recurringRef, (snapshot) => {
      setRecurringClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      recurringLoaded = true; checkLoading();
    }, (error) => console.error("Error cargando clases:", error));

    const unsubRecords = onSnapshot(recordsRef, (snapshot) => {
      const recs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      recs.sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`));
      setRecords(recs);
      recordsLoaded = true; checkLoading();
    }, (error) => console.error("Error cargando historial:", error));

    const unsubDaily = onSnapshot(dailyRef, (snapshot) => {
      setDailyReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      dailyLoaded = true; checkLoading();
    }, (error) => console.error("Error cargando diarios:", error));

    return () => { unsubRecurring(); unsubRecords(); unsubDaily(); };
  }, [user]);

  // Helper para obtener un nombre de visualización del email (ej: ana@musica.com -> ana)
  const getTeacherName = () => {
    if (!user || !user.email) return 'Profesor';
    return user.email.split('@')[0];
  };

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
      setDailyForm({ generalFeedback: '', incidents: '', newStudents: '', materialIssues: '', hoursTaught: '' });
    }
  }, [date, dailyReports]);

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

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  // --- LÓGICA DE IA (Gemini) ---
  const generateSmartReport = async () => {
    if (stats.length === 0 && dailyReports.length === 0) {
      showNotification({ type: 'error', text: 'No hay datos para analizar.' });
      return;
    }
    setIsGenerating(true);
    setShowReportModal(true);
    setGeneratedReport('');

    const apiKey = "AIzaSyDb9fIdZ6Kyg9APcqPL0rhqx5q46pR62nw";
    const prompt = `Eres un asistente para profesores de una escuela de música.
    Basado en las estadísticas de asistencia de los alumnos y en los reportes diarios escritos por el profesor, redacta un informe completo en forma de email dirigido al director de la escuela.
    
    DATOS DE ASISTENCIA (JSON): ${JSON.stringify(stats)}
    REPORTES DIARIOS DEL PROFESOR (JSON): ${JSON.stringify(dailyReports)}
    
    Instrucciones estrictas:
    1. Usa un tono profesional, amable y constructivo.
    2. Haz un resumen del rendimiento de la asistencia (destaca a los de asistencia perfecta y menciona con tacto a los que faltan mucho).
    3. Analiza los "Reportes Diarios". Haz un resumen de cómo han ido las clases en general según el profesor.
    4. Destaca en una sección especial si ha habido INCIDENCIAS, NUEVOS ALUMNOS, o PROBLEMAS DE MATERIAL.
    5. MUY IMPORTANTE PARA NÓMINAS: Revisa la propiedad "hoursTaught" en el JSON de reportes diarios. Suma todas las horas reportadas en el mes e incluye una sección final destacada llamada "Cálculo de Horas" indicando el Total de horas impartidas.
    6. Sé claro y estructurado usando viñetas. No incluyas detalles técnicos ni menciones que eres una IA.`;

    let retries = 5;
    let delay = 1000;
    let success = false;

    while (retries > 0 && !success) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        if (!response.ok) throw new Error('API Error');
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        setGeneratedReport(text || 'No se pudo generar el reporte.');
        success = true;
      } catch (error) {
        retries--;
        if (retries === 0) {
           setGeneratedReport('Ocurrió un error al contactar con la inteligencia artificial. Revisa tu clave API o inténtalo más tarde.');
           showNotification({ type: 'error', text: 'Error al generar el informe con IA.' });
        } else {
          await new Promise(r => setTimeout(r, delay));
          delay *= 2;
        }
      }
    }
    setIsGenerating(false);
  };

  // --- LOGICA DE SESIÓN (Pasar Lista) ---
  const startSession = (scheduledClass = null) => {
    if (scheduledClass) {
      setCurrentSession({
        isNew: false, classId: scheduledClass.id, time: scheduledClass.time, teacher: scheduledClass.teacher,
        subject: scheduledClass.subject, dayOfWeek: scheduledClass.dayOfWeek, isRecurring: true,
        students: scheduledClass.students.map(s => ({ ...s, status: 'present' })), newStudentName: ''
      });
    } else {
      setCurrentSession({
        isNew: true, classId: Date.now().toString(), time: '17:00', teacher: getTeacherName(), subject: '',
        isRecurring: true, students: [], newStudentName: ''
      });
    }
  };

  const handleSessionFieldChange = (field, value) => setCurrentSession({ ...currentSession, [field]: value });
  const handleStatusChange = (id, newStatus) => setCurrentSession({ ...currentSession, students: currentSession.students.map(s => s.id === id ? { ...s, status: newStatus } : s) });
  const addStudent = () => {
    if (!currentSession.newStudentName.trim()) return;
    setCurrentSession({
      ...currentSession,
      students: [...currentSession.students, { id: Date.now(), name: currentSession.newStudentName.trim(), status: 'present' }],
      newStudentName: ''
    });
  };
  const removeStudent = (id) => setCurrentSession({ ...currentSession, students: currentSession.students.filter(s => s.id !== id) });

  const saveRecord = async () => {
    if (!user) return;
    if (!currentSession.subject) {
      showNotification({ type: 'error', text: 'Por favor, rellena la asignatura.' }); return;
    }
    try {
      const recordId = Date.now().toString();
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'records', recordId), {
        classId: currentSession.classId, date, time: currentSession.time, teacher: currentSession.teacher,
        subject: currentSession.subject, students: currentSession.students.map(s => ({ ...s }))
      });
      if (currentSession.isRecurring) {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses', currentSession.classId), {
          dayOfWeek: currentSession.isNew ? getDayOfWeek(date) : currentSession.dayOfWeek,
          time: currentSession.time, teacher: currentSession.teacher, subject: currentSession.subject,
          students: currentSession.students.map(s => ({ id: s.id, name: s.name })) 
        });
      }
      showNotification({ type: 'success', text: 'Lista guardada correctamente.' });
      setCurrentSession(null);
    } catch (error) {
      showNotification({ type: 'error', text: 'Hubo un error al guardar los datos.' });
    }
  };

  // ¡AÑADIDA NUEVA FUNCIÓN PARA BORRAR CLASE!
  const deleteRecurringClass = async (classId) => {
    if (!user) return;
    const isConfirmed = window.confirm('¿Seguro que quieres borrar esta clase de tu horario?');
    if (!isConfirmed) return;

    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'recurringClasses', classId));
      showNotification({ type: 'success', text: 'Clase eliminada del horario.' });
    } catch (error) {
      console.error(error);
      showNotification({ type: 'error', text: 'Error al borrar la clase.' });
    }
  };

  // --- LOGICA DEL DIARIO ---
  const saveDailyReport = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'dailyReports', date), {
        ...dailyForm,
        date: date
      });
      showNotification({ type: 'success', text: 'Resumen del día guardado con éxito.' });
    } catch (error) {
      showNotification({ type: 'error', text: 'Error al guardar el resumen diario.' });
    }
  };

  // --- LOGICA DEL DASHBOARD ---
  const dashboardItems = useMemo(() => {
    const selectedDayOfWeek = getDayOfWeek(date);
    const items = [];
    const recordsToday = records.filter(r => r.date === date);
    const scheduledToday = recurringClasses.filter(rc => rc.dayOfWeek === selectedDayOfWeek);

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
        if (!studentStats[student.name]) studentStats[student.name] = { present: 0, absent: 0, notified: 0, total: 0 };
        studentStats[student.name].total++;
        if (student.status === 'present') studentStats[student.name].present++;
        if (student.status === 'absent') studentStats[student.name].absent++;
        if (student.status === 'notified') studentStats[student.name].notified++;
      });
    });
    return Object.entries(studentStats).map(([name, counts]) => ({ name, ...counts })).sort((a, b) => a.name.localeCompare(b.name));
  }, [records]);

  // --- PANTALLAS DE CARGA Y LOGIN ---
  if (isAuthLoading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans"><RefreshCw className="w-10 h-10 text-indigo-600 animate-spin" /></div>;
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
            {loginError && <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 text-center">{loginError}</div>}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="profesor@escuela.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
              <input type="password" required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="••••••••" />
            </div>
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all mt-6 shadow-md">
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
            <h1 className="text-xl font-bold hidden sm:block">Escuela Los Mitos</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-indigo-100 text-sm flex items-center gap-2 bg-indigo-700/50 px-3 py-1.5 rounded-full">
              <User className="w-4 h-4" /> <span className="max-w-[100px] sm:max-w-xs truncate">{user.email}</span>
            </span>
            <button onClick={handleLogout} className="text-indigo-200 hover:text-white transition-colors" title="Cerrar Sesión">
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
        {/* PESTAÑA 1: PASAR LISTA */}
        {activeTab === 'attendance' && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {!currentSession && (
              <div className="p-4 md:p-6 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1 w-full sm:w-auto">
                  <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Fecha seleccionada ({getDayName(getDayOfWeek(date))})
                  </label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full sm:w-auto p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700" />
                </div>
                <button onClick={() => startSession(null)} className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95">
                  <ClipboardList className="w-5 h-5" /> Nueva Clase
                </button>
              </div>
            )}

            {!currentSession ? (
              <div className="p-6">
                <h3 className="text-md font-semibold text-slate-700 mb-4 flex items-center gap-2">Clases del {getDayName(getDayOfWeek(date))}, {date.split('-').reverse().join('/')}</h3>
                {dashboardItems.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200"><p className="text-slate-500 mb-4">No hay clases programadas.</p></div>
                ) : (
                  <div className="space-y-3">
                    {dashboardItems.map((item, idx) => (
                      <div key={idx} className={`flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 border rounded-xl gap-3 transition-colors ${item.type === 'completed' ? 'bg-slate-50 border-slate-100' : 'bg-white border-indigo-100 hover:border-indigo-300 shadow-sm'}`}>
                        <div>
                          <p className={`font-bold flex items-center gap-2 ${item.type === 'completed' ? 'text-slate-700' : 'text-indigo-900'}`}>
                            <Clock className={`w-4 h-4 ${item.type === 'completed' ? 'text-slate-400' : 'text-indigo-500'}`} /> {item.data.time} - {item.data.subject}
                          </p>
                          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1"><User className="w-3 h-3" /> Prof: {item.data.teacher} <span className="mx-1">•</span> {item.data.students.length} alumnos</p>
                        </div>
                        {/* AQUI HEMOS AÑADIDO EL BOTÓN DE BORRAR */}
                        <div className="w-full sm:w-auto text-right mt-3 sm:mt-0 flex items-center justify-end gap-2">
                          {item.type === 'completed' ? (
                             <span className="inline-flex w-full justify-center sm:w-auto items-center gap-1 bg-emerald-100 text-emerald-700 text-xs px-2.5 py-1.5 rounded-md font-medium border border-emerald-200"><Check className="w-3 h-3" /> Lista Pasada</span>
                          ) : (
                            <>
                              <button onClick={() => startSession(item.data)} className="w-full sm:w-auto bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-600 font-medium py-2 px-4 rounded-lg inline-flex items-center justify-center gap-2 transition-all"><Play className="w-4 h-4" /> Pasar Lista</button>
                              <button onClick={() => deleteRecurringClass(item.data.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0" title="Eliminar clase de forma permanente"><Trash2 className="w-5 h-5" /></button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* SESIÓN ACTIVA */
              <>
                <div className="p-6 border-b border-slate-100 bg-white relative">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-2">
                    <div className="flex flex-col">
                      <h2 className="text-lg font-bold text-slate-800">{currentSession.isNew ? 'Detalles de la Nueva Clase' : 'Pasando lista'}</h2>
                      <span className="text-sm font-medium text-indigo-600 flex items-center gap-1 mt-1"><Calendar className="w-4 h-4" /> {getDayName(getDayOfWeek(date))}, {date.split('-').reverse().join('/')}</span>
                    </div>
                    <button onClick={() => setCurrentSession(null)} className="text-slate-500 hover:text-slate-700 text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors w-full sm:w-auto text-center">Volver / Cancelar</button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500 flex items-center gap-1"> <Clock className="w-3 h-3" /> Horario </label>
                      <input type="time" value={currentSession.time} onChange={(e) => handleSessionFieldChange('time', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-500 flex items-center gap-1"> <Music className="w-3 h-3" /> Asignatura </label>
                      <input type="text" placeholder="Ej: Piano..." value={currentSession.subject} onChange={(e) => handleSessionFieldChange('subject', e.target.value)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                    </div>
                  </div>

                  {currentSession.isNew && (
                    <div className="mt-4 flex items-center gap-2 p-3 bg-indigo-50/50 rounded-lg border border-indigo-100">
                      <input type="checkbox" id="recurring" checked={currentSession.isRecurring} onChange={(e) => handleSessionFieldChange('isRecurring', e.target.checked)} className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" />
                      <label htmlFor="recurring" className="text-sm font-medium text-indigo-900 flex items-center gap-1.5 cursor-pointer"><RefreshCw className="w-4 h-4" /> Repetir esta clase cada semana</label>
                    </div>
                  )}
                </div>

                <div className="p-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-4 gap-2">
                    <div><h3 className="text-md font-semibold text-slate-700">Alumnos</h3></div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <input type="text" placeholder="Añadir alumno..." value={currentSession.newStudentName} onChange={(e) => handleSessionFieldChange('newStudentName', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addStudent()} className="p-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-48" />
                      <button onClick={addStudent} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors shrink-0"><UserPlus className="w-5 h-5" /></button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {currentSession.students.map((student) => (
                      <div key={student.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 bg-slate-50 border border-slate-100 rounded-xl gap-3">
                        <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
                          <span className="font-medium text-slate-800">{student.name}</span>
                          <button onClick={() => removeStudent(student.id)} className="text-slate-400 hover:text-red-500 sm:hidden p-1"> <Trash2 className="w-4 h-4" /> </button>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto grid grid-cols-3 sm:flex">
                          <button onClick={() => handleStatusChange(student.id, 'present')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${student.status === 'present' ? 'bg-emerald-500 text-white shadow-sm ring-2 ring-emerald-200 ring-offset-1' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}> <Check className="w-4 h-4" /> <span className="hidden md:inline">Presente</span> </button>
                          <button onClick={() => handleStatusChange(student.id, 'notified')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${student.status === 'notified' ? 'bg-amber-400 text-amber-900 shadow-sm ring-2 ring-amber-200 ring-offset-1' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}> <AlertCircle className="w-4 h-4" /> <span className="hidden md:inline">Avisó</span> </button>
                          <button onClick={() => handleStatusChange(student.id, 'absent')} className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${student.status === 'absent' ? 'bg-rose-500 text-white shadow-sm ring-2 ring-rose-200 ring-offset-1' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'}`}> <X className="w-4 h-4" /> <span className="hidden md:inline">Faltó</span> </button>
                        </div>
                        <button onClick={() => removeStudent(student.id)} className="text-slate-400 hover:text-red-500 hidden sm:block p-2"> <Trash2 className="w-4 h-4" /> </button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8">
                    <button onClick={saveRecord} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md">
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
                  <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Fecha del reporte ({getDayName(getDayOfWeek(date))})
                  </label>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full sm:w-auto p-2.5 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700" />
                </div>
              </div>
              <div className="p-6 space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 mb-1">Resumen del Día</h2>
                  <p className="text-sm text-slate-500 mb-6">Completa este breve formulario al finalizar tus clases. Será analizado por el director.</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">1. ¿Cómo han ido las clases en el día de hoy?</label>
                    <textarea value={dailyForm.generalFeedback} onChange={(e) => setDailyForm({...dailyForm, generalFeedback: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px] resize-y text-slate-700" placeholder="Escribe aquí tus comentarios generales..." />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">2. ¿Ha habido alguna incidencia o algo fuera de lo habitual?</label>
                    <textarea value={dailyForm.incidents} onChange={(e) => setDailyForm({...dailyForm, incidents: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none min-h-[80px] resize-y text-slate-700" placeholder="Ej: Un alumno llegó muy tarde, hubo interrupciones..." />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">3. ¿Ha empezado hoy algún alumno nuevo? ¿Quién?</label>
                    <textarea value={dailyForm.newStudents} onChange={(e) => setDailyForm({...dailyForm, newStudents: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none min-h-[80px] resize-y text-slate-700" placeholder="Menciona si hubo altas nuevas hoy..." />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700">4. Señala si se ha roto algo o hay algo material que mejorar</label>
                    <textarea value={dailyForm.materialIssues} onChange={(e) => setDailyForm({...dailyForm, materialIssues: e.target.value})} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none min-h-[80px] resize-y text-slate-700" placeholder="Ej: Faltan atriles, un cable de piano falla..." />
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-100">
                    <label className="block text-sm font-semibold text-slate-700">5. ¿Cuántas horas de clase has impartido hoy?</label>
                    <input 
                      type="number"
                      min="0"
                      step="0.5"
                      value={dailyForm.hoursTaught}
                      onChange={(e) => setDailyForm({...dailyForm, hoursTaught: e.target.value})}
                      className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700"
                      placeholder="Ej: 4.5"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <button onClick={saveDailyReport} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md">
                    <Save className="w-5 h-5" /> Guardar Resumen Diario
                  </button>
                </div>
              </div>
          </div>
        )}

        {/* PESTAÑA 3: HISTORIAL */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-slate-800 mb-6">Historial de Clases</h2>
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
                      <h3 className="font-bold text-slate-800 text-lg">{record.subject}</h3>
                      <p className="text-sm text-slate-500 flex items-center gap-2 mt-1"> <User className="w-3 h-3" /> {record.teacher} </p>
                    </div>
                    <div className="text-left md:text-right">
                      <p className="font-medium text-indigo-600 flex items-center md:justify-end gap-1"> <Calendar className="w-4 h-4" /> {record.date.split('-').reverse().join('/')} </p>
                      <p className="text-sm text-slate-500 flex items-center md:justify-end gap-1 mt-1"> <Clock className="w-3 h-3" /> {record.time} </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {record.students.map(student => (
                      <div key={student.id} className="flex items-center gap-2 text-sm">
                        {student.status === 'present' && <Check className="w-4 h-4 text-emerald-500" />}
                        {student.status === 'absent' && <X className="w-4 h-4 text-rose-500" />}
                        {student.status === 'notified' && <AlertCircle className="w-4 h-4 text-amber-500" />}
                        <span className={student.status === 'present' ? 'text-slate-700' : student.status === 'absent' ? 'text-rose-600 font-medium' : 'text-amber-600'}>
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

        {/* PESTAÑA 4: REPORTES Y IA */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-slate-800">Análisis Global</h2>
              <div className="flex gap-2 flex-col sm:flex-row w-full sm:w-auto">
                <button onClick={generateSmartReport} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors shadow-sm">
                  <Sparkles className="w-4 h-4" /> ✨ Redactar Informe IA
                </button>
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
                      <th className="px-6 py-4 text-center text-amber-600">Faltas Avisadas</th>
                      <th className="px-6 py-4 text-center text-rose-600">Faltas Injustificadas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.length === 0 ? (
                      <tr><td colSpan="5" className="px-6 py-8 text-center text-slate-400">Aún no hay datos.</td></tr>
                    ) : (
                      stats.map((student, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-medium text-slate-800">{student.name}</td>
                          <td className="px-6 py-4 text-center font-semibold">{student.total}</td>
                          <td className="px-6 py-4 text-center">
                            <span className="inline-flex items-center justify-center bg-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full text-xs font-medium">{student.present}</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {student.notified > 0 ? <span className="inline-flex items-center justify-center bg-amber-100 text-amber-700 px-2.5 py-0.5 rounded-full text-xs font-medium">{student.notified}</span> : '-'}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {student.absent > 0 ? <span className="inline-flex items-center justify-center bg-rose-100 text-rose-700 px-2.5 py-0.5 rounded-full text-xs font-medium">{student.absent}</span> : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal del Reporte Generado por IA */}
            {showReportModal && (
              <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-indigo-50">
                    <h3 className="font-bold text-indigo-900 flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-indigo-600" /> Borrador de Email (Asistente IA)
                    </h3>
                    <button onClick={() => setShowReportModal(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-6 overflow-y-auto whitespace-pre-wrap text-slate-700 text-sm leading-relaxed">
                    {isGenerating ? (
                      <div className="flex flex-col items-center justify-center py-10 gap-3">
                        <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                        <p className="text-indigo-600 font-medium">✨ Analizando asistencias y sumando horas de clase...</p>
                      </div>
                    ) : (
                      generatedReport
                    )}
                  </div>
                  <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    <button onClick={() => setShowReportModal(false)} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors">Cerrar</button>
                    <button 
                      onClick={() => {
                        const textArea = document.createElement("textarea");
                        textArea.value = generatedReport;
                        document.body.appendChild(textArea); textArea.select();
                        try { document.execCommand('copy'); showNotification({ type: 'success', text: 'Informe copiado al portapapeles' }); } catch (err) {}
                        document.body.removeChild(textArea);
                      }}
                      disabled={isGenerating || !generatedReport}
                      className="px-4 py-2 bg-indigo-600 text-white font-medium hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Copiar al Portapapeles
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 w-full bg-white border-t border-slate-200 flex justify-around p-2 md:hidden z-20 pb-safe">
        <button onClick={() => setActiveTab('attendance')} className={`flex flex-col items-center p-2 rounded-lg flex-1 ${activeTab === 'attendance' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <ClipboardList className="w-6 h-6 mb-1" /> <span className="text-[10px] font-medium">Listas</span>
        </button>
        <button onClick={() => setActiveTab('daily')} className={`flex flex-col items-center p-2 rounded-lg flex-1 ${activeTab === 'daily' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <MessageSquare className="w-6 h-6 mb-1" /> <span className="text-[10px] font-medium">Diario</span>
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center p-2 rounded-lg flex-1 ${activeTab === 'history' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <History className="w-6 h-6 mb-1" /> <span className="text-[10px] font-medium">Historial</span>
        </button>
        <button onClick={() => setActiveTab('reports')} className={`flex flex-col items-center p-2 rounded-lg flex-1 ${activeTab === 'reports' ? 'text-indigo-600' : 'text-slate-400'}`}>
          <BarChart3 className="w-6 h-6 mb-1" /> <span className="text-[10px] font-medium">Reportes</span>
        </button>
      </nav>

      <nav className="hidden md:flex fixed top-1/2 -translate-y-1/2 left-4 flex-col gap-4 z-20">
        <button onClick={() => setActiveTab('attendance')} className={`p-3 rounded-xl shadow-sm flex items-center justify-center transition-all ${activeTab === 'attendance' ? 'bg-indigo-600 text-white scale-110' : 'bg-white text-slate-400 hover:text-indigo-500 hover:bg-slate-50'}`} title="Pasar Lista"> <ClipboardList className="w-6 h-6" /> </button>
        <button onClick={() => setActiveTab('daily')} className={`p-3 rounded-xl shadow-sm flex items-center justify-center transition-all ${activeTab === 'daily' ? 'bg-indigo-600 text-white scale-110' : 'bg-white text-slate-400 hover:text-indigo-500 hover:bg-slate-50'}`} title="Resumen Diario"> <MessageSquare className="w-6 h-6" /> </button>
        <button onClick={() => setActiveTab('history')} className={`p-3 rounded-xl shadow-sm flex items-center justify-center transition-all ${activeTab === 'history' ? 'bg-indigo-600 text-white scale-110' : 'bg-white text-slate-400 hover:text-indigo-500 hover:bg-slate-50'}`} title="Historial"> <History className="w-6 h-6" /> </button>
        <button onClick={() => setActiveTab('reports')} className={`p-3 rounded-xl shadow-sm flex items-center justify-center transition-all ${activeTab === 'reports' ? 'bg-indigo-600 text-white scale-110' : 'bg-white text-slate-400 hover:text-indigo-500 hover:bg-slate-50'}`} title="Reportes"> <BarChart3 className="w-6 h-6" /> </button>
      </nav>
    </div>
  );
}
