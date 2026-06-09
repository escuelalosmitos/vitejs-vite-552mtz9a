import React, { useState, useMemo, useEffect } from 'react';
import { 
  ClipboardList, History, BarChart3, Check, X, AlertCircle, Save, Mail, 
  UserPlus, Trash2, Calendar, Clock, User, Music, RefreshCw, Play, 
  MessageSquare, LogOut, CornerDownRight, BookOpen, CalendarOff, Ticket, 
  Snowflake, Timer, Palmtree, PartyPopper, Coffee, MapPin, Bell, UserMinus, 
  RefreshCcw, PlusCircle, CheckCircle, ShieldAlert, LayoutGrid, FileText, Ghost
} from 'lucide-react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, collectionGroup } from 'firebase/firestore';

const INSTRUMENTOS = ["Guitarra", "Canto", "Teclado", "Batería", "Bajo", "Ukelele", "Armónica", "Sensibilización", "Violín"];
const SEDES = ["Tarragona", "Reus"];
const SALAS = ["Sala 1", "Sala 2", "Sala 3"];

const DEFAULT_DEAD_HOUR_TASKS = [
  'Ordenar y revisar material del aula',
  'Preparar ejercicios personalizados para alumnos',
  'Actualizar notas de seguimiento en la ficha interna',
  'Revisar repertorio y propuestas para próximas clases',
  'Organizar el aula y comprobar instrumentos/equipos',
  'Grabar o preparar material didáctico breve'
];

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

const isPunctualClass = (clase) => Boolean(clase?.date) || clase?.isRecurring === false;

const parseTimeToMinutes = (time = '') => {
  const [hoursRaw, minutesRaw = '0'] = String(time || '').split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return (hours * 60) + minutes;
};

const formatMinutesToTime = (totalMinutes) => {
  if (!Number.isFinite(totalMinutes)) return '';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const getClassTimeRange = (time, duration = 60) => {
  const start = parseTimeToMinutes(time);
  const classDuration = Number(String(duration || 60).replace(',', '.')) || 60;
  if (start === null) return null;
  return { start, end: start + classDuration };
};

const isClassFullyCoveredBySlot = (classData = {}, slot = {}) => {
  const range = getClassTimeRange(classData.time, classData.duration);
  const slotStart = parseTimeToMinutes(slot.start);
  const slotEnd = parseTimeToMinutes(slot.end);
  if (!range || slotStart === null || slotEnd === null) return false;
  return range.start >= slotStart && range.end <= slotEnd;
};

const getClassEndTime = (time, duration = 60) => {
  const range = getClassTimeRange(time, duration);
  return range ? formatMinutesToTime(range.end) : '';
};

const isSummerRecoveryDate = (dateString) => {
  if (!dateString) return false;
  const month = Number(dateString.split('-')[1]);
  return month >= 6 && month <= 8;
};

const generateTicketDates = (dateString) => {
  if (!dateString) return { validFrom: '', validUntil: '', recoveryPolicy: 'standard', isSummerTicket: false };
  const [y, m] = dateString.split('-').map(Number);

  if (m >= 6 && m <= 8) {
    return {
      validFrom: `${y}-09-01`,
      validUntil: `${y}-12-31`,
      recoveryPolicy: 'summer',
      isSummerTicket: true
    };
  }

  let nextY = y;
  let nextM = m + 1;
  if (nextM > 12) {
    nextM = 1;
    nextY++;
  }
  const validFrom = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  const lastDay = new Date(nextY, nextM, 0).getDate();
  const validUntil = `${nextY}-${String(nextM).padStart(2, '0')}-${lastDay}`;
  return { validFrom, validUntil, recoveryPolicy: 'standard', isSummerTicket: false };
};

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

const generateLast12Months = () => {
  const months = [];
  const d = new Date();
  for (let i = 0; i < 12; i++) {
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const labelStr = d.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    months.push({ value: monthStr, label: labelStr.charAt(0).toUpperCase() + labelStr.slice(1) });
    d.setMonth(d.getMonth() - 1);
  }
  return months;
};

const DeadHourModalComponent = ({ tasks = [], onCancel, onConfirm, onRenounce }) => {
  const safeTasks = Array.isArray(tasks) && tasks.length > 0 ? tasks : DEFAULT_DEAD_HOUR_TASKS;
  const [note, setNote] = useState('');
  const [selectedTask, setSelectedTask] = useState(safeTasks[0] || '');
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (!selectedTask || !note.trim() || saving) return;
    setSaving(true);
    await onConfirm(selectedTask, note.trim());
    setSaving(false);
  };

  const handleRenounce = async () => {
    if (saving) return;
    const isConfirmed = window.confirm("¿Estás seguro de que quieres renunciar a esta hora? \n\nNo se te exigirá ninguna tarea, pero la hora NO sumará a tu nómina.");
    if (!isConfirmed) return;
    setSaving(true);
    await onRenounce();
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-start sm:items-center justify-center p-3 sm:p-4 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-8 shadow-2xl animate-in zoom-in-95 duration-200 my-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
        <div className="flex items-start gap-3 text-red-600 mb-4">
          <AlertCircle className="w-8 h-8 shrink-0" />
          <div>
            <h2 className="text-lg sm:text-xl font-bold uppercase tracking-tight">Protocolo Hora Muerta</h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-red-400 mt-1">Ausencia total sin aviso suficiente</p>
          </div>
        </div>
        <p className="text-zinc-600 mb-5 font-medium text-sm leading-relaxed">Todos los alumnos activos han faltado. Selecciona una tarea productiva para realizar durante esta hora o renuncia a cobrarla si prefieres descansar.</p>
        
        <div className="space-y-2 mb-5 max-h-44 overflow-y-auto pr-1">
          {safeTasks.map((t, i) => (
            <button key={`${t}-${i}`} disabled={saving} onClick={() => setSelectedTask(t)} className={`w-full text-left p-3 rounded-xl border-2 transition-all text-sm ${selectedTask === t ? 'border-black bg-zinc-50 font-bold text-black' : 'border-zinc-100 text-zinc-500 hover:border-zinc-300'}`}>
              {t}
            </button>
          ))}
        </div>

        <textarea 
          placeholder="Escribe brevemente qué has hecho..."
          value={note} onChange={e => setNote(e.target.value)}
          disabled={saving}
          className="w-full p-4 border-2 border-zinc-200 rounded-xl focus:border-black outline-none mb-5 min-h-[90px] text-sm disabled:opacity-60"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sticky bottom-0 bg-white pt-2">
          <button disabled={saving} onClick={onCancel} className="w-full bg-zinc-100 text-zinc-600 font-bold py-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-200 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          
          <button 
            disabled={saving}
            onClick={handleRenounce}
            className="w-full bg-amber-100 border-2 border-amber-200 text-amber-800 font-bold py-3 rounded-xl uppercase text-[10px] tracking-widest hover:bg-amber-200 transition-colors flex flex-col items-center justify-center gap-1 disabled:opacity-50"
          >
            <Coffee className="w-4 h-4" /> Renunciar
          </button>

          <button 
            disabled={!selectedTask || !note.trim() || saving}
            onClick={handleConfirm}
            className="w-full bg-black text-white font-bold py-4 rounded-xl uppercase text-[10px] tracking-widest disabled:opacity-30 transition-all hover:bg-zinc-800"
          >
            {saving ? 'Guardando...' : 'Confirmar Tarea'}
          </button>
        </div>
      </div>
    </div>
  );
};

const NotesModalComponent = ({ notesModal, onClose, globalStudents, db, appId, showNotification }) => {
  const globalStudentInfo = globalStudents.find(s => s.id === notesModal.id);
  const [text, setText] = useState(globalStudentInfo?.internalNotes || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'students', notesModal.id), { internalNotes: text });
      showNotification({ type: 'success', text: 'Notas internas guardadas.' });
      onClose();
    } catch (e) {
      showNotification({ type: 'error', text: 'Error al guardar las notas.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
        <div className="flex items-center gap-3 text-indigo-600 mb-2">
          <FileText className="w-8 h-8" />
          <h2 className="text-xl font-black uppercase tracking-tight">Ficha Interna</h2>
        </div>
        <p className="text-sm font-bold text-slate-800 mb-6 uppercase tracking-widest">{notesModal.name}</p>
        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl mb-6">
          <p className="text-xs text-indigo-800 font-medium leading-relaxed">Este bloc de notas es privado y compartido entre todos los profesores y coordinación. Úsalo para anotar parentescos o evolución.</p>
        </div>
        <textarea 
          value={text} 
          onChange={e => setText(e.target.value)} 
          placeholder="Ej: Es el hermano menor de Hugo..."
          className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl focus:border-indigo-500 outline-none min-h-[150px] resize-y text-sm font-medium text-slate-700 mb-6 transition-colors"
        />
        <div className="flex gap-4">
          <button onClick={onClose} className="flex-1 bg-zinc-100 text-zinc-600 font-black py-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-200 transition-colors">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 bg-indigo-600 text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-indigo-700 transition-all shadow-md disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar Notas'}
          </button>
        </div>
      </div>
    </div>
  );
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
  const [payrollAdjustments, setPayrollAdjustments] = useState([]);
  
  const [lastReportSentDate, setLastReportSentDate] = useState('');
  const [historyLimit, setHistoryLimit] = useState(10);

  const [availability, setAvailability] = useState({ 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] });
  const [newSlot, setNewSlot] = useState({ day: null, start: '', end: '' });

  const [settings, setSettings] = useState({
    hourlyRate: 17.33,
    generalTasks: [],
    festivos: [],
    festivosTarragona: [],
    festivosReus: [],
    vacaciones: [],
    teacherRules: ''
  });

  const [activeTab, setActiveTab] = useState('attendance');
  const [notification, setNotification] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [selectedPayrollMonth, setSelectedPayrollMonth] = useState(new Date().toISOString().substring(0, 7));
  const availableMonths = useMemo(() => generateLast12Months(), []);

  const [currentSession, setCurrentSession] = useState(null);
  const [isSendingReport, setIsSendingReport] = useState(false);
  
  const [deadHourModal, setDeadHourModal] = useState(null);
  const [notesModal, setNotesModal] = useState(null);
  const [showRulesModal, setShowRulesModal] = useState(false);

  const [dailyForm, setDailyForm] = useState({
    generalFeedback: '',
    incidents: '',
    newStudents: '',
    materialIssues: '',
    hoursTaught: ''
  });

  const isAdmin = user?.email === ADMIN_EMAIL;
  
  const getTeacherName = () => {
    if (!user || !user.email) return 'Profesor';
    return user.email.split('@')[0];
  };

  useEffect(() => {
    if (!user) return;

    setLoadingData(true);
    const myName = getTeacherName();

    const recurringRef = collectionGroup(db, 'recurringClasses');
    const recordsRef = collectionGroup(db, 'records'); 
    const dailyRef = collection(db, 'artifacts', appId, 'users', user.uid, 'dailyReports');
    const globalStudentsRef = collection(db, 'artifacts', appId, 'students');
    const settingsRef = doc(db, 'artifacts', appId, 'settings', 'global');
    const ticketsRef = collectionGroup(db, 'tickets');
    const substitutionsRef = collection(db, 'artifacts', appId, 'substitutions');
    const gestionesRef = collection(db, 'artifacts', appId, 'gestiones'); 
    const payrollAdjustmentsRef = collection(db, 'artifacts', appId, 'payrollAdjustments');
    const availRef = doc(db, 'artifacts', appId, 'availability', myName.toLowerCase());
    const userDocRef = doc(db, 'artifacts', appId, 'users', user.uid);

    let recordsLoaded = false;
    let recurringLoaded = false;
    let dailyLoaded = false;
    let studentsLoaded = false;
    let ticketsLoaded = false;
    let subsLoaded = false;
    let gestionesLoaded = false;
    let payrollAdjustmentsLoaded = false;
    let availLoaded = false;
    let userDocLoaded = false;

    const checkLoading = () => {
      if (recordsLoaded && recurringLoaded && dailyLoaded && studentsLoaded && ticketsLoaded && subsLoaded && gestionesLoaded && payrollAdjustmentsLoaded && availLoaded && userDocLoaded) setLoadingData(false);
    };

    const unsubUserDoc = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().lastReportSentDate) {
        setLastReportSentDate(docSnap.data().lastReportSentDate);
      }
      userDocLoaded = true;
      checkLoading();
    });

    const unsubRecurring = onSnapshot(recurringRef, (snapshot) => {
      const myClasses = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if ((data.teacher || '').toLowerCase() === myName.toLowerCase() || data.originalTeacherUid === user.uid) { 
            myClasses.push({ id: docSnap.id, refPath: docSnap.ref.path, ...data });
        }
      });
      setRecurringClasses(myClasses);
      recurringLoaded = true;
      checkLoading();
    });

    const unsubRecords = onSnapshot(recordsRef, (snapshot) => {
      const recs = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if ((data.teacher || '').toLowerCase() === myName.toLowerCase()) recs.push({ id: docSnap.id, ...data });
      });
      recs.sort((a, b) => new Date(`${b.date || ''}T${b.time || '00:00'}`) - new Date(`${a.date || ''}T${a.time || '00:00'}`));
      setRecords(recs);
      recordsLoaded = true;
      checkLoading();
    });

    const unsubDaily = onSnapshot(dailyRef, (snapshot) => {
      setDailyReports(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
      dailyLoaded = true;
      checkLoading();
    });

    const unsubStudents = onSnapshot(globalStudentsRef, (snapshot) => {
      setGlobalStudents(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
      studentsLoaded = true;
      checkLoading();
    });

    const unsubSettings = onSnapshot(settingsRef, (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data());
      }
    });

    const unsubTickets = onSnapshot(ticketsRef, (snapshot) => {
      const tks = snapshot.docs.map(docSnap => ({ id: docSnap.id, refPath: docSnap.ref.path, ...docSnap.data() }));
      setTickets(tks);
      ticketsLoaded = true;
      checkLoading();
    });

    const unsubSubs = onSnapshot(substitutionsRef, (snapshot) => {
      setSubstitutions(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
      subsLoaded = true;
      checkLoading();
    });

    const unsubGestiones = onSnapshot(gestionesRef, (snapshot) => {
      setGestiones(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
      gestionesLoaded = true;
      checkLoading();
    });

    const unsubPayrollAdjustments = onSnapshot(payrollAdjustmentsRef, (snapshot) => {
      setPayrollAdjustments(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
      payrollAdjustmentsLoaded = true;
      checkLoading();
    });

    const unsubAvail = onSnapshot(availRef, (docSnap) => {
      if (docSnap.exists()) {
        setAvailability(docSnap.data().slots || { 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] });
      } else {
        setAvailability({ 1:[], 2:[], 3:[], 4:[], 5:[], 6:[] });
      }
      availLoaded = true;
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
      unsubGestiones();
      unsubPayrollAdjustments();
      unsubAvail();
      unsubUserDoc();
    };
  }, [user, db, appId]);

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

  const handleAddSlot = async (day) => {
    if (!newSlot.start || !newSlot.end) return showNotification({type:'error', text: 'Debes rellenar inicio y fin.'});
    if (newSlot.start >= newSlot.end) return showNotification({type:'error', text: 'La hora de inicio debe ser anterior al fin.'});
    
    const updatedSlots = { ...availability };
    updatedSlots[day] = [...(updatedSlots[day] || []), { start: newSlot.start, end: newSlot.end }];
    updatedSlots[day].sort((a,b) => a.start.localeCompare(b.start));

    try {
      await setDoc(doc(db, 'artifacts', appId, 'availability', getTeacherName().toLowerCase()), { slots: updatedSlots }, { merge: true });
      setNewSlot({ day: null, start: '', end: '' });
      showNotification({type:'success', text: 'Franja añadida a tu disponibilidad.'});
    } catch(e) {
      showNotification({type:'error', text: 'Error al guardar la franja.'});
    }
  };

  const handleDeleteSlot = async (day, index) => {
    const updatedDaySlots = availability[day].filter((_, i) => i !== index);
    
    const classesThisDay = recurringClasses.filter(c => !isPunctualClass(c) && c.dayOfWeek === parseInt(day));
    for(let c of classesThisDay) {
       const isCovered = updatedDaySlots.some(slot => isClassFullyCoveredBySlot(c, slot));
       if(!isCovered) {
          const classEndTime = getClassEndTime(c.time, c.duration);
          return window.alert(`⚠️ ACCIÓN BLOQUEADA:\n\nTienes una clase oficial de ${c.subject} de ${c.time}h a ${classEndTime || 'la hora de fin'}h que se quedaría fuera de tu horario.\n\nLa clase debe caber completa dentro de una franja de disponibilidad.\n\nPara eliminar esta franja, primero debes hablar con Coordinación para que muevan esa clase.`);
       }
    }

    const updatedSlots = { ...availability, [day]: updatedDaySlots };
    try {
      await setDoc(doc(db, 'artifacts', appId, 'availability', getTeacherName().toLowerCase()), { slots: updatedSlots }, { merge: true });
      showNotification({type:'success', text: 'Franja eliminada.'});
    } catch(e) {
      showNotification({type:'error', text: 'Error al eliminar.'});
    }
  };

  const notifications = useMemo(() => {
    if (isAdmin) {
      return gestiones.filter(g => g.status === 'pendiente');
    } else {
      const myClassIds = new Set();
      recurringClasses.forEach(c => {
        myClassIds.add(c.id);
      });

      return gestiones.filter(g => {
        if (g.status !== 'pendiente') return false;
        if (g.type === 'aviso_ausencia' && g.requestedClass && myClassIds.has(g.requestedClass)) {
          return true;
        }
        return false;
      });
    }
  }, [gestiones, recurringClasses, isAdmin]);

  const recordsForSelectedDate = useMemo(() => {
    return records
      .filter(record => record.date === date)
      .sort((a, b) => String(a.time).localeCompare(String(b.time)));
  }, [records, date]);

  const selectedDailyReport = useMemo(() => {
    return dailyReports.find(report => report.id === date);
  }, [dailyReports, date]);

  const monthlyPayroll = useMemo(() => {
    const targetMonth = selectedPayrollMonth; 
    const prevMonth = getPreviousMonthStr(targetMonth);
    const teacherKey = getTeacherName().toLowerCase();

    const currentRecords = records.filter(r => r.date && r.date.startsWith(targetMonth) && !r.isRenounced);
    const currentMinutes = currentRecords.reduce((acc, r) => acc + normalizeNumber(r.duration || 60), 0);
    const currentHours = currentMinutes / 60;

    const prevRecords = records.filter(r => r.date && r.date.startsWith(prevMonth) && !r.isRenounced);
    const prevTotalMinutes = prevRecords.reduce((acc, r) => acc + normalizeNumber(r.duration || 60), 0);
    const prevUniqueDays = new Set(prevRecords.map(r => r.date)).size;
    const avgDailyMins = prevUniqueDays > 0 ? (prevTotalMinutes / prevUniqueDays) : 0;

    const vacationsThisMonth = (settings.vacaciones || []).filter(d => d.startsWith(targetMonth)).length;
    const projectedMinutes = vacationsThisMonth * avgDailyMins;
    const projectedHours = projectedMinutes / 60;

    const adjustmentItems = payrollAdjustments
      .filter(a => 
        a.month === targetMonth && 
        String(a.teacher || '').toLowerCase() === teacherKey
      )
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const adjustmentHours = adjustmentItems.reduce((acc, a) => acc + normalizeNumber(a.hours), 0);

    const totalBeforeAdjustments = currentHours + projectedHours;
    const totalHours = totalBeforeAdjustments + adjustmentHours;
    const earnings = totalHours * (settings.hourlyRate || 0);

    return { 
      realHours: currentHours.toFixed(2),
      projectedHours: projectedHours.toFixed(2),
      vacationDays: vacationsThisMonth,
      adjustmentHours: adjustmentHours.toFixed(2),
      adjustmentItems,
      totalBeforeAdjustments: totalBeforeAdjustments.toFixed(2),
      totalHours: totalHours.toFixed(2), 
      earnings: earnings.toFixed(2) 
    };
  }, [records, selectedPayrollMonth, settings, payrollAdjustments, user]);

  const dashboardItems = useMemo(() => {
    const selectedDayOfWeek = getDayOfWeek(date);
    const items = [];
    const recordsToday = records.filter(r => r.date === date);
    
    const scheduledToday = recurringClasses.filter(rc => {
      if (rc.date) {
        if (rc.date !== date) return false;
      } 
      else {
        if (rc.dayOfWeek !== selectedDayOfWeek) return false;
      }
      
      if (rc.cancelledDates && rc.cancelledDates.includes(date)) return false;
      
      return true;
    });

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

  const isExpiredDate = useMemo(() => {
    const classDate = new Date(date);
    const now = new Date();
    const diffMs = now - classDate;
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours > 36;
  }, [date]);

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const dismissNotification = async (id) => {
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'gestiones', id), { status: 'completado' });
    } catch (e) {
      console.error("Error al ocultar notificación", e);
    }
  };

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
CLASE: ${record.time} - ${record.subject} ${record.isRenounced ? '(HORA RENUNCIADA)' : ''}
Sede: ${record.sede || 'Tarragona'} (${record.sala || 'Sala 1'})
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
    
    const pendingClasses = dashboardItems.filter(item => {
      if (item.type !== 'pending') return false;
      
      const isGlobalSpecial = settings.festivos?.includes(date) || settings.vacaciones?.includes(date);
      const isTarragonaSpecial = item.data.sede === 'Tarragona' && settings.festivosTarragona?.includes(date);
      const isReusSpecial = item.data.sede === 'Reus' && settings.festivosReus?.includes(date);
      if (isGlobalSpecial || isTarragonaSpecial || isReusSpecial) return false;

      const activeCount = item.data.students?.filter(s => !s.isPaused).length || 0;
      return activeCount > 0;
    });

    if (pendingClasses.length > 0) {
      const ok = window.confirm(`⚠️ ¡ATENCIÓN!\n\nTienes ${pendingClasses.length} clase(s) sin pasar lista hoy.\nSi envías el reporte ahora, esas horas no constarán en tu nómina.\n\n¿Seguro que quieres enviar el reporte ya?`);
      if (!ok) return;
    }

    const report = formData || selectedDailyReport || dailyForm;
    const hasAttendance = recordsForSelectedDate.length > 0;
    const hasDailyReport = Boolean(report?.generalFeedback?.trim()) || Boolean(report?.incidents?.trim()) || Boolean(report?.newStudents?.trim()) || Boolean(report?.materialIssues?.trim());

    if (!hasAttendance && !hasDailyReport) {
      showNotification({ type: 'error', text: 'No hay datos para enviar en esta fecha.' });
      return;
    }

    setIsSendingReport(true);
    const payload = {
      profesor: getTeacherName(),
      profesorEmail: user.email,
      fecha: formatDateSpanish(date),
      horas: monthlyPayroll.realHours,
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
      
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid), {
        lastReportSentDate: date
      }, { merge: true });

      showNotification({ type: 'success', text: 'Informe enviado por email.' });
    } catch (error) {
      console.error(error);
      showNotification({ type: 'error', text: 'No se pudo enviar el informe.' });
    } finally {
      setIsSendingReport(false);
    }
  };

  const startSession = (scheduledClass = null) => {
    if (!scheduledClass) return; 
    
    const exceptionsToday = scheduledClass.exceptions?.[date] || {};

    const visibleStudents = [];
    const hiddenStudents = [];

    (scheduledClass.students || []).forEach(s => {
      if (s.isRecovery && s.recoveryDate && s.recoveryDate !== date) {
        hiddenStudents.push(s); 
      } else {
        let currentStatus = s.isPaused ? 'paused' : 'present';
        // 👇 FIX: Si el status es 'notified_no_ticket', lo mapeamos visualmente a 'notified' para la UI
        if (exceptionsToday[s.id]) {
          currentStatus = exceptionsToday[s.id] === 'notified_no_ticket' ? 'notified' : exceptionsToday[s.id];
        }
        visibleStudents.push({ ...s, status: currentStatus, originalException: exceptionsToday[s.id] || null });
      }
    });

    setCurrentSession({
      isAutoCancelled: scheduledClass.autoCancelled?.[date] || false,
      isNew: false, 
      classId: scheduledClass.id,
      refPath: scheduledClass.refPath, 
      time: scheduledClass.time,
      sede: scheduledClass.sede || 'Tarragona',
      sala: scheduledClass.sala || 'Sala 1',
      teacher: scheduledClass.teacher,
      subject: scheduledClass.subject,
      capacity: scheduledClass.capacity || '',
      duration: scheduledClass.duration || 60,
      notes: scheduledClass.notes || '',
      dayOfWeek: scheduledClass.dayOfWeek,
      date: scheduledClass.date || null, 
      isRecurring: !scheduledClass.date, 
      exceptions: scheduledClass.exceptions || {}, 
      students: visibleStudents, 
      hiddenStudents: hiddenStudents, 
      newStudentName: '',
      newStudentEmail: '',
      isAddingRecovery: false,
      cancelledDates: scheduledClass.cancelledDates || []
    });
  };

  const assumeSubstitution = async (sub) => {
    if (!window.confirm(`¿Asumir la sustitución de ${sub.subject} el ${formatDateSpanish(sub.date)} a las ${sub.time}h?\n\nEsta clase pasará a tu agenda y serás el profesor responsable.`)) return;

    try {
      const newClassId = `assumed-${sub.id}`;
      const targetUid = user.uid;

      await setDoc(doc(db, 'artifacts', appId, 'users', targetUid, 'recurringClasses', newClassId), {
        id: newClassId,
        isRecurring: false,
        date: sub.date,
        dayOfWeek: getDayOfWeek(sub.date),
        time: sub.time,
        sede: sub.sede || 'Tarragona',
        sala: sub.sala || 'Sala 1',
        teacher: getTeacherName(), // The new teacher
        subject: sub.subject,
        capacity: sub.capacity || '',
        duration: sub.duration || 60,
        notes: sub.notes || '',
        students: sub.students || [],
        exceptions: {},
        cancelledDates: [],
        isWebVisible: false
      });

      await deleteDoc(doc(db, 'artifacts', appId, 'substitutions', sub.id));

      showNotification({ type: 'success', text: 'Clase añadida a tu agenda. Puedes seleccionarla el día que corresponda.' });
    } catch (e) {
      showNotification({ type: 'error', text: 'Error al asumir la clase.' });
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
    const studentEmail = (currentSession.newStudentEmail || '').trim().toLowerCase();
    
    if (!studentName) return;

    if (currentSession.capacity) {
      const maxCapacity = parseInt(currentSession.capacity, 10);
      if (currentSession.students.length >= maxCapacity) {
        showNotification({ type: 'error', text: `Aforo completo. El límite es de ${maxCapacity} alumnos.` });
        return;
      }
    }

    let studentId;
    let existingStudent = globalStudents.find(s => 
      s.name.toLowerCase() === studentName.toLowerCase() || 
      (studentEmail && s.email === studentEmail)
    );

    if (existingStudent) {
      studentId = existingStudent.id;
    } else {
      studentId = Date.now().toString();
      try {
        await setDoc(doc(db, 'artifacts', appId, 'students', studentId), { 
          name: studentName,
          email: studentEmail,
          claimed: false,
          instruments: [currentSession.subject],
          classes: [currentSession.classId],
          internalNotes: '' 
        });
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
          email: existingStudent ? existingStudent.email : studentEmail,
          status: 'present',
          isRecovery: currentSession.isAddingRecovery || false,
          recoveryDate: currentSession.isAddingRecovery ? date : null, 
          isPaused: existingStudent?.globalStatus === 'congelado' || false
        }
      ],
      newStudentName: '',
      newStudentEmail: '',
      isAddingRecovery: false
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

    const dayToSave = currentSession.dayOfWeek;

    try {
      const templateStudents = [
        ...currentSession.students.filter(s => !s.isRecovery).map(s => ({ id: s.id, name: s.name, email: s.email || '', isPaused: s.isPaused || false })),
        ...(currentSession.hiddenStudents || [])
      ];

      const isFutureDate = date > todayISO;
      let finalExceptions = currentSession.exceptions || {};

      if (isFutureDate) {
        const exceptionsForDate = { ...(currentSession.exceptions?.[date] || {}) }; 
        currentSession.students.forEach(s => {
           if (s.status !== 'present' && s.status !== 'paused') {
              exceptionsForDate[s.id] = s.status; 
           }
        });
        finalExceptions[date] = exceptionsForDate;
      }

      const targetPath = doc(db, currentSession.refPath); 
        
      await setDoc(targetPath, {
        dayOfWeek: dayToSave,
        date: currentSession.date || null, 
        time: currentSession.time,
        sede: currentSession.sede || 'Tarragona',
        sala: currentSession.sala || 'Sala 1',
        teacher: currentSession.teacher,
        subject: currentSession.subject,
        capacity: currentSession.capacity,
        duration: currentSession.duration || 60,
        notes: currentSession.notes,
        cancelledDates: currentSession.cancelledDates || [],
        students: templateStudents,
        exceptions: finalExceptions
      }, { merge: true });

      showNotification({ type: 'success', text: isFutureDate ? 'Previsión guardada para esta fecha.' : 'Plantilla actualizada con éxito.' });
      setCurrentSession(null);
    } catch (error) {
      console.error(error);
      showNotification({ type: 'error', text: 'Hubo un error al guardar la plantilla.' });
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

    const confirmacion = window.confirm("⚠️ ATENCIÓN: ESTA ACCIÓN NO SE PUEDE DESHACER.\n\nRevisa bien quién está presente, quién avisó y quién ha faltado sin avisar.\n\n¿Estás seguro de que quieres guardar la lista definitivamente?");
    if (!confirmacion) return;

    const activeStudents = currentSession.students.filter(s => !s.isPaused);
    const allAbsent = activeStudents.length > 0 && activeStudents.every(s => s.status === 'absent' || s.status === 'notified');
    
    if (allAbsent) {
      if (currentSession.isAutoCancelled) {
        showNotification({ type: 'success', text: "Clase auto-cancelada. Hora no computable registrada." });
        executeSaveRecord("Clase cancelada automáticamente por ausencia total (+2h de antelación)", true);
        return;
      }

      const laterPayableClassesToday = dashboardItems.filter(item => {
        const itemTime = item.data?.time || '';
        if (!itemTime || itemTime <= currentSession.time) return false;

        const activeCount = (item.data?.students || []).filter(s => !s.isPaused).length;
        if (activeCount === 0) return false;

        const isGlobalSpecial = settings.festivos?.includes(date) || settings.vacaciones?.includes(date);
        const isTarragonaSpecial = item.data?.sede === 'Tarragona' && settings.festivosTarragona?.includes(date);
        const isReusSpecial = item.data?.sede === 'Reus' && settings.festivosReus?.includes(date);
        if (isGlobalSpecial || isTarragonaSpecial || isReusSpecial) return false;

        return true;
      });

      const isLastClass = laterPayableClassesToday.length === 0;

      if (isLastClass) {
        showNotification({ type: 'success', text: "Clase vacía y última hora. Puedes irte a casa. Guardando como hora no computable..." });
        executeSaveRecord('Última hora del día. No se aplica protocolo de tareas.', true);
      } else {
        const configuredTasks = Array.isArray(settings.generalTasks) ? settings.generalTasks.filter(Boolean) : [];
        const combinedTasks = configuredTasks.length > 0 ? configuredTasks : DEFAULT_DEAD_HOUR_TASKS;
        setDeadHourModal({ tasks: combinedTasks, subject: currentSession.subject });
      }
    } else {
      executeSaveRecord(null, false);
    }
  };

  const executeSaveRecord = async (deadHourNote = null, isRenounced = false) => {
    try {
      const recordId = Date.now().toString();
      const currentMonth = date.substring(0, 7);
      
      let finalNotes = deadHourNote 
        ? `[HORA MUERTA]: ${deadHourNote}. ${currentSession.notes || ''}` 
        : currentSession.notes;

      if (isRenounced) {
        finalNotes = `[RENUNCIA VOLUNTARIA]: El profesor ha decidido no cobrar esta hora. ${currentSession.notes || ''}`;
      }

      const targetUid = user.uid;

      const ticketPromises = currentSession.students.map(async (s) => {
        // 👇 FIX: Solo le damos ticket si el status es 'notified' pero NO era un aviso sin derecho a ticket ('notified_no_ticket')
        if (s.status === 'notified' && s.originalException !== 'notified_no_ticket' && !s.isRecovery && !s.isPaused) {
          const isSummerTicket = isSummerRecoveryDate(date);
          const monthTickets = tickets.filter(t => t.studentId === s.id && t.originalDate.startsWith(currentMonth));
          if (isSummerTicket || monthTickets.length < 2) {
            const { validFrom, validUntil, recoveryPolicy } = generateTicketDates(date);
            const ticketId = Date.now().toString() + '-' + s.id;
            await setDoc(doc(db, 'artifacts', appId, 'users', targetUid, 'tickets', ticketId), {
              studentId: s.id,
              studentName: s.name,
              subject: currentSession.subject,
              originalDate: date,
              originalMonth: currentMonth,
              validFrom,
              validUntil,
              isUsed: false,
              recoveryPolicy,
              isSummerTicket,
              createdAt: new Date().toISOString()
            });
          }
        }
        
        if (s.isRecovery && s.status === 'present') {
          const pending = tickets.filter(t =>
            t.studentId === s.id &&
            !t.isUsed &&
            !t.voided &&
            (!t.validFrom || t.validFrom <= date) &&
            (!t.validUntil || t.validUntil >= date)
          ).sort((a, b) => new Date(a.validFrom || '1900-01-01') - new Date(b.validFrom || '1900-01-01'));
          if (pending.length > 0) {
            const ticketRef = pending[0].refPath
              ? doc(db, pending[0].refPath)
              : doc(db, 'artifacts', appId, 'users', targetUid, 'tickets', pending[0].id);
            await setDoc(ticketRef, { isUsed: true, usedAt: new Date().toISOString(), usedOn: date }, { merge: true });
          }
        }
      });
      await Promise.all(ticketPromises);

      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'records', recordId), {
        classId: currentSession.classId,
        date,
        time: currentSession.time,
        sede: currentSession.sede || 'Tarragona',
        sala: currentSession.sala || 'Sala 1',
        teacher: currentSession.teacher,
        subject: currentSession.subject,
        capacity: currentSession.capacity,
        duration: currentSession.duration || 60,
        notes: finalNotes,
        isRenounced: isRenounced, 
        students: currentSession.students.map(s => ({ ...s }))
      });

      const templateStudents = [
        ...currentSession.students.filter(s => !s.isRecovery).map(s => ({ id: s.id, name: s.name, email: s.email || '', isPaused: s.isPaused || false })),
        ...(currentSession.hiddenStudents || [])
      ];

      const targetPath = doc(db, currentSession.refPath);
        
      await setDoc(targetPath, {
        dayOfWeek: currentSession.dayOfWeek,
        date: currentSession.date || null,
        time: currentSession.time,
        sede: currentSession.sede || 'Tarragona',
        sala: currentSession.sala || 'Sala 1',
        teacher: currentSession.teacher,
        subject: currentSession.subject,
        capacity: currentSession.capacity,
        duration: currentSession.duration || 60,
        notes: currentSession.notes,
        cancelledDates: currentSession.cancelledDates || [],
        students: templateStudents,
        exceptions: currentSession.exceptions || {}
      }, { merge: true });

      showNotification({ type: 'success', text: isRenounced ? 'Renuncia registrada con éxito.' : 'Lista guardada correctamente.' });
      setCurrentSession(null);
      setDeadHourModal(null);
    } catch (error) {
      console.error(error);
      window.alert(`No se ha podido guardar la asistencia. La ventana queda abierta para que no pierdas la información.\n\nError: ${error.message || error}`);
      showNotification({ type: 'error', text: 'Hubo un error al guardar los datos.' });
    }
  };

  const cancelClassForToday = async (classData) => {
    if (!user) return;
    const isConfirmed = window.confirm(`¿Seguro que quieres cancelar la clase de ${classData.subject} solo por hoy? (Estará libre para sustituciones)`);
    if (!isConfirmed) return;

    try {
      const subId = `${classData.id}-${date}`;
      
      await setDoc(doc(db, 'artifacts', appId, 'substitutions', subId), {
        originalClassId: classData.id,
        originalTeacherUid: user.uid,
        originalTeacherName: classData.teacher || getTeacherName(),
        date: date,
        time: classData.time,
        sede: classData.sede || 'Tarragona',
        sala: classData.sala || 'Sala 1',
        subject: classData.subject,
        capacity: classData.capacity || '',
        duration: classData.duration || 60,
        notes: classData.notes || '',
        students: classData.students || []
      });

      if (classData.date) {
        await deleteDoc(doc(db, classData.refPath));
      } else {
        const updatedCancelledDates = [...(classData.cancelledDates || []), date];
        await setDoc(doc(db, classData.refPath), {
          ...classData,
          cancelledDates: updatedCancelledDates
        });
      }

      showNotification({ type: 'success', text: 'Clase enviada a la Bolsa de Sustituciones.' });
    } catch (error) {
      console.error(error);
      showNotification({ type: 'error', text: 'Error al cancelar la clase temporalmente.' });
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

  const renderRulesModal = () => {
    if (!showRulesModal) return null;
    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl relative flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
          <button onClick={() => setShowRulesModal(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full z-10"><X className="w-5 h-5"/></button>
          <div className="flex items-center gap-3 text-indigo-600 mb-6 shrink-0">
            <FileText className="w-8 h-8" />
            <h2 className="text-xl font-black uppercase tracking-tight leading-none">Normativa Interna</h2>
          </div>
          <div className="overflow-y-auto pr-2 text-sm text-slate-600 font-medium leading-relaxed flex-1 space-y-4 whitespace-pre-wrap">
            {settings.teacherRules || 'La normativa interna aún no está disponible.'}
          </div>
          <button onClick={() => setShowRulesModal(false)} className="w-full mt-6 bg-indigo-600 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest shrink-0 shadow-lg hover:bg-indigo-700 transition-colors">Cerrar</button>
        </div>
      </div>
    );
  };

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

  const todayISO = new Date().toISOString().split('T')[0];
  const isFutureDate = date > todayISO;
  
  const isGlobalFestivo = settings.festivos?.includes(date);
  const isVacacion = settings.vacaciones?.includes(date);
  const isSpecialDay = isGlobalFestivo || isVacacion;

  const upcomingSubs = substitutions.filter(s => s.date >= todayISO).sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-slate-800 pb-24 md:pb-0">
      {deadHourModal && (
        <DeadHourModalComponent
          tasks={deadHourModal.tasks}
          onCancel={() => setDeadHourModal(null)}
          onRenounce={() => executeSaveRecord(null, true)}
          onConfirm={(task, note) => executeSaveRecord(`${task}: ${note}`, false)}
        />
      )}
      
      {notesModal && (
        <NotesModalComponent 
          notesModal={notesModal}
          globalStudents={globalStudents}
          db={db}
          appId={appId}
          onClose={() => setNotesModal(null)}
          showNotification={showNotification}
        />
      )}

      {renderRulesModal()}

      <header className="bg-black text-white p-5 sticky top-0 z-50 shadow-md border-b border-zinc-800">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white p-1.5 rounded-lg">
              <Music className="w-5 h-5 text-black" />
            </div>
            <h1 className="text-xl font-black hidden sm:block uppercase tracking-tighter">Escuela Los Mitos</h1>
          </div>
          <div className="flex items-center gap-4">
            {isAdmin && (
              <button onClick={switchToAdmin} className="hidden sm:flex items-center gap-2 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors">
                <ShieldAlert className="w-4 h-4"/> Modo Dios
              </button>
            )}
            <span className="text-zinc-300 text-sm flex items-center gap-2 bg-zinc-800 px-4 py-2 rounded-xl font-medium">
              <User className="w-4 h-4" />
              <span className="max-w-[100px] sm:max-w-xs truncate">{user.email}</span>
            </span>
            <button onClick={logout} className="text-zinc-400 hover:text-white transition-colors" title="Cerrar Sesión">
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
        <div className="flex gap-2 mb-8 bg-white p-2 rounded-2xl shadow-sm border border-zinc-200 overflow-x-auto no-scrollbar">
          {[
            { id: 'attendance', label: 'Listas', icon: ClipboardList },
            { id: 'availability', label: 'Horario', icon: Clock },
            { id: 'notifications', label: 'Avisos', icon: Bell }, 
            { id: 'daily', label: 'Diario', icon: MessageSquare },
            { id: 'history', label: 'Historial', icon: History },
            { id: 'reports', label: 'Reportes', icon: BarChart3 }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold uppercase text-xs tracking-wider transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-black text-white shadow-md' : 'text-zinc-400 hover:text-black hover:bg-zinc-50'}`}>
              <tab.icon className="w-4 h-4"/> {tab.label}
              {tab.id === 'notifications' && notifications.length > 0 && (
                <span className="bg-red-500 w-2 h-2 rounded-full absolute top-2 right-2 animate-pulse"></span>
              )}
            </button>
          ))}
          {isAdmin && (
            <button onClick={switchToAdmin} className={`sm:hidden flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold uppercase text-xs tracking-wider transition-all whitespace-nowrap bg-red-600 text-white shadow-md`}>
              <ShieldAlert className="w-4 h-4"/> Admin
            </button>
          )}
        </div>

        {/* --- PESTAÑA 1: LISTAS --- */}
        {activeTab === 'attendance' && (
          <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 overflow-hidden">
            {!currentSession && (
              <>
                {upcomingSubs.length > 0 && (
                  <div className="m-6 md:m-8 p-6 md:p-8 bg-zinc-900 rounded-3xl shadow-xl relative overflow-hidden">
                    <div className="relative z-10">
                      <h4 className="font-black text-white uppercase tracking-widest text-sm mb-6 flex items-center gap-2">
                        <AlertCircle className="w-5 h-5 text-amber-400"/> Tablón de Sustituciones
                      </h4>
                      <div className="space-y-3">
                        {upcomingSubs.map(sub => (
                          <div key={sub.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-zinc-800/80 backdrop-blur rounded-2xl border border-zinc-700 hover:border-amber-400 transition-colors">
                            <div>
                              <p className="font-black uppercase text-sm text-white">{sub.subject} <span className="text-zinc-400 font-bold ml-2">{formatDateSpanish(sub.date)} a las {sub.time}</span></p>
                              <p className="text-xs font-bold text-zinc-400 mt-1 uppercase tracking-widest">
                                Falta: {sub.originalTeacherName} • {sub.students.length} alumnos
                              </p>
                            </div>
                            <button 
                              onClick={() => assumeSubstitution(sub)} 
                              className="mt-3 sm:mt-0 w-full sm:w-auto bg-amber-400 text-amber-950 font-black py-3 px-6 rounded-xl text-[10px] uppercase tracking-widest hover:bg-amber-300 transition-all shadow-md active:scale-95"
                            >
                              Asumir Clase
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Music className="absolute -bottom-10 -right-10 w-48 h-48 text-zinc-800/50 rotate-12 pointer-events-none" />
                  </div>
                )}

                <div className="p-6 md:p-8 border-b border-zinc-100 bg-zinc-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-1 w-full sm:w-auto">
                    <label className="text-xs font-black text-zinc-400 flex items-center gap-1 uppercase tracking-widest">
                      <Calendar className="w-3 h-3" /> Agenda del día
                    </label>
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full sm:w-auto p-3 bg-white border-2 border-zinc-200 rounded-xl focus:border-black outline-none font-bold text-slate-700 transition-colors" />
                  </div>
                </div>
              </>
            )}

            {!currentSession ? (
              <div className="p-6 md:p-8">
                <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2 uppercase tracking-wide">
                  {getDayName(getDayOfWeek(date))}, {formatDateSpanish(date)}
                </h3>

                {isSpecialDay && (
                  <div className={`p-6 rounded-2xl mb-8 flex items-center gap-4 ${isGlobalFestivo ? 'bg-amber-100 text-amber-900 border-2 border-amber-200' : 'bg-emerald-100 text-emerald-900 border-2 border-emerald-200'}`}>
                    {isGlobalFestivo ? <PartyPopper className="w-10 h-10 shrink-0"/> : <Palmtree className="w-10 h-10 shrink-0"/>}
                    <div>
                      <h4 className="font-black uppercase tracking-widest text-lg">{isGlobalFestivo ? 'Día Festivo (Global)' : 'Día de Vacaciones'}</h4>
                      <p className="text-sm font-medium mt-1">El centro está cerrado hoy. No es necesario pasar lista ni enviar el reporte diario.</p>
                    </div>
                  </div>
                )}

                {dashboardItems.length === 0 ? (
                  <div className="text-center py-16 bg-zinc-50 rounded-2xl border-2 border-dashed border-zinc-200">
                    <p className="text-zinc-400 font-bold uppercase tracking-widest">No hay clases programadas.</p>
                    <p className="text-xs font-medium text-zinc-400 mt-2">Si deberías tener clase, contacta con coordinación.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {dashboardItems.map((item, idx) => {
                      const visibleCount = item.data.students?.filter(s => !s.isRecovery || s.recoveryDate === date).length || 0;
                      const activeCount = item.data.students?.filter(s => !s.isPaused).length || 0;
                      const isHibernated = item.type === 'pending' && activeCount === 0;

                      const isTarragonaFestivo = item.data.sede === 'Tarragona' && settings.festivosTarragona?.includes(date);
                      const isReusFestivo = item.data.sede === 'Reus' && settings.festivosReus?.includes(date);
                      const isThisClassBlocked = isSpecialDay || isTarragonaFestivo || isReusFestivo;

                      return (
                      <div key={idx} className={`group flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 rounded-2xl border-2 transition-all ${item.type === 'completed' || isThisClassBlocked || isHibernated ? 'bg-zinc-50 border-zinc-100 opacity-70' : 'bg-white border-zinc-100 hover:border-black shadow-sm hover:shadow-md'}`}>
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center font-black ${item.type === 'completed' || isThisClassBlocked || isHibernated ? 'bg-zinc-200 text-zinc-500' : 'bg-black text-white'}`}>
                           <span className="text-sm leading-none">{(item.data.time || '00:00').split(':')[0]}</span>
                            <span className="text-[10px] opacity-70">{(item.data.time || '00:00').split(':')[1]}</span>
                          </div>
                          <div>
                            <p className={`font-black uppercase tracking-wide text-sm ${item.type === 'completed' || isThisClassBlocked || isHibernated ? 'text-zinc-500' : 'text-slate-800'}`}>
                              {item.data.subject}
                            </p>
                            <p className="text-xs font-bold text-zinc-400 flex items-center gap-1 mt-1 uppercase">
                              <MapPin className="w-3 h-3" /> {item.data.sede || 'Tarragona'} ({item.data.sala || 'Sala 1'})
                              <span className="mx-1">•</span> 
                              <User className="w-3 h-3" /> Prof: {item.data.teacher} 
                              {!isHibernated && (
                                <>
                                  <span className="mx-1">•</span> 
                                  {visibleCount} {item.data.capacity ? `/ ${item.data.capacity}` : ''} alumnos
                                </>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="w-full sm:w-auto text-right mt-4 sm:mt-0 flex items-center justify-end gap-2">
                          
                          {isThisClassBlocked ? (
                            <span className="bg-zinc-200 text-zinc-500 px-4 py-2 rounded-lg font-black text-[10px] uppercase border border-zinc-300">
                              {(isTarragonaFestivo || isReusFestivo) ? 'Festivo Local' : 'No Laborable'}
                            </span>
                          ) : isHibernated ? (
                            <div className="w-full sm:w-auto bg-zinc-100 text-zinc-400 py-2.5 px-5 rounded-xl font-black text-[10px] uppercase tracking-widest border-2 border-dashed border-zinc-200 flex items-center justify-center gap-2 cursor-not-allowed">
                               <Ghost className="w-4 h-4"/> Clase Hibernada
                            </div>
                          ) : item.type === 'completed' ? (
                            <span className="inline-flex w-full justify-center sm:w-auto items-center gap-1 bg-emerald-100 text-emerald-700 text-xs px-4 py-2 rounded-lg font-black border border-emerald-200 uppercase tracking-widest">
                              <Check className="w-4 h-4" /> Completado
                            </span>
                          ) : isExpiredDate ? (
                            <div className="w-full sm:w-auto bg-rose-50 text-rose-500 py-2.5 px-5 rounded-xl font-black text-[10px] uppercase tracking-widest border border-rose-100 flex items-center justify-center gap-2 cursor-not-allowed">
                              <AlertCircle className="w-4 h-4"/> Plazo Expirado
                            </div>
                          ) : (
                            <>
                              <button onClick={() => startSession(item.data)} className="w-full sm:w-auto bg-zinc-100 hover:bg-black hover:text-white text-black font-bold py-2.5 px-5 rounded-xl inline-flex items-center justify-center gap-2 transition-all text-xs uppercase tracking-widest">
                                <Play className="w-4 h-4" /> Pasar Lista
                              </button>
                              
                              <button onClick={() => cancelClassForToday(item.data)} className="p-2.5 text-zinc-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition-colors shrink-0" title="Cancelar solo por hoy (Sustitución)">
                                <CalendarOff className="w-5 h-5" />
                              </button>
                            </>
                          )}

                        </div>
                      </div>
                    )})}
                  </div>
                )}

                <div className="text-center mt-8 pt-6 border-t border-zinc-100">
                  <button onClick={() => setShowRulesModal(true)} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-600 uppercase tracking-widest flex items-center justify-center gap-1.5 mx-auto transition-colors">
                     <FileText className="w-3.5 h-3.5"/> Consultar Normativa de la Escuela
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* CABECERA DENTRO DE LA CLASE */}
                <div className="p-6 md:p-8 border-b border-zinc-100 bg-white relative">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                    <div className="flex flex-col">
                      <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Pasando lista</h2>
                      <span className="text-sm font-bold text-zinc-400 flex items-center gap-1 mt-1 uppercase tracking-widest">
                        <Calendar className="w-4 h-4" /> {getDayName(getDayOfWeek(date))}, {formatDateSpanish(date)}
                      </span>
                    </div>
                    <button onClick={() => setCurrentSession(null)} className="text-zinc-500 hover:text-black hover:bg-zinc-100 text-xs font-black uppercase tracking-widest px-5 py-2.5 rounded-xl border-2 border-zinc-200 transition-colors w-full sm:w-auto text-center">
                      Cerrar Vista
                    </button>
                  </div>

                  {!currentSession.isRecurring && (
                    <div className="mb-6 p-4 bg-zinc-100 border-2 border-zinc-300 rounded-xl flex items-center gap-3">
                      <AlertCircle className="text-black w-6 h-6 shrink-0"/>
                      <p className="text-xs font-bold text-slate-800">Esta es una <b>clase puntual</b>. Solo existe en tu agenda para la fecha de hoy. Si le das a "Cancelar solo por hoy", se devolverá al tablón de sustituciones.</p>
                    </div>
                  )}

                  {isFutureDate && (
                    <div className="mb-6 p-4 bg-purple-50 border-2 border-purple-200 rounded-xl flex items-center gap-3">
                      <Calendar className="text-purple-600 w-6 h-6 shrink-0"/>
                      <p className="text-xs font-bold text-purple-900">Estás viendo una fecha futura. El botón de pasar lista está bloqueado, pero puedes marcar alumnos que ya te han avisado y darle a <b>"Guardar Previsión"</b>.</p>
                    </div>
                  )}

                  {/* AVISO DE AUTO-CANCELACIÓN (+2 HORAS) */}
                  {currentSession.isAutoCancelled && (
                    <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-xl flex items-center gap-3">
                      <AlertCircle className="text-red-600 w-6 h-6 shrink-0"/>
                      <p className="text-xs font-bold text-red-900">🚨 CLASE CANCELADA. Todos los alumnos avisaron con más de 2h de antelación. Esta hora no se cobra ni requiere tareas. Dale a "Guardar Asistencia" para archivarla.</p>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1"><Clock className="w-3 h-3" /> Horario</label>
                      <input 
                        type="time" 
                        value={currentSession.time} 
                        disabled
                        className="w-full p-4 rounded-xl font-bold bg-zinc-100 text-zinc-400 border-2 border-zinc-200 cursor-not-allowed" 
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1"><MapPin className="w-3 h-3" /> Sede</label>
                      <input 
                        type="text" 
                        value={currentSession.sede} 
                        disabled
                        className="w-full p-4 rounded-xl font-bold bg-zinc-100 text-zinc-400 border-2 border-zinc-200 cursor-not-allowed" 
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1"><LayoutGrid className="w-3 h-3" /> Sala</label>
                      <input 
                        type="text" 
                        value={currentSession.sala} 
                        disabled
                        className="w-full p-4 rounded-xl font-bold bg-zinc-100 text-zinc-400 border-2 border-zinc-200 cursor-not-allowed" 
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1"><Music className="w-3 h-3" /> Instrumento</label>
                      <input 
                        type="text" 
                        value={currentSession.subject} 
                        disabled
                        className="w-full p-4 rounded-xl font-bold bg-zinc-100 text-zinc-400 border-2 border-zinc-200 cursor-not-allowed" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1"><User className="w-3 h-3" /> Aforo Máximo</label>
                      <input 
                        type="text" 
                        value={currentSession.capacity} 
                        disabled
                        className="w-full p-4 rounded-xl font-bold bg-zinc-100 text-zinc-400 border-2 border-zinc-200 cursor-not-allowed" 
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1"><Timer className="w-3 h-3" /> Duración (min)</label>
                      <input 
                        type="text" 
                        value={currentSession.duration} 
                        disabled
                        className="w-full p-4 rounded-xl font-bold bg-zinc-100 text-zinc-400 border-2 border-zinc-200 cursor-not-allowed" 
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

                      <div className="w-full sm:flex-1 relative">
                        <input
                          type="email"
                          placeholder="Email del alumno (Opcional)"
                          value={currentSession.newStudentEmail}
                          onChange={(e) => handleSessionFieldChange('newStudentEmail', e.target.value)}
                          disabled={isDisabledAdd}
                          className={`w-full p-4 text-sm font-bold rounded-xl outline-none transition-colors ${isDisabledAdd ? 'bg-zinc-100 border-2 border-zinc-200 cursor-not-allowed text-zinc-400' : 'bg-white border-2 border-zinc-200 focus:border-black text-slate-800'}`}
                        />
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
                          Recuperar
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
                    {currentSession.newStudentEmail && <p className="text-[10px] font-bold text-blue-600 mt-3">💡 Al poner email, el alumno podrá activar su portal automáticamente la primera vez que entre.</p>}
                  </div>

                  <div className="space-y-4">
                    {currentSession.students.map((student) => {
                      const globalSt = globalStudents.find(g => g.id === student.id);
                      const displayEmail = globalSt?.email || student.email;

                      return (
                      <div key={student.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 md:p-5 border-2 rounded-2xl gap-4 transition-colors ${student.isPaused ? 'bg-blue-50/50 border-blue-100' : 'bg-zinc-50 border-zinc-100 hover:border-zinc-300'}`}>
                        <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
                          <div className="flex flex-col">
                            <span className={`font-bold text-lg ${student.isPaused ? 'text-zinc-400 line-through' : 'text-slate-800'}`}>
                              {student.name}
                            </span>
                            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                                {displayEmail || 'Sin email'}
                            </span>
                            {student.isRecovery && !student.isPaused && (
                              <span className="text-[10px] uppercase font-black text-amber-600 tracking-widest flex items-center gap-1 mt-1">
                                <CornerDownRight className="w-3 h-3" /> Recuperación
                              </span>
                            )}
                          </div>
                          
                          <div className="flex gap-2 sm:hidden">
                            <button onClick={() => setNotesModal(student)} className="p-2 rounded-lg text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Ficha Interna">
                              <FileText className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

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

                        <div className="hidden sm:flex items-center gap-2">
                          <button onClick={() => setNotesModal(student)} className="p-3 rounded-xl text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Ficha Interna del Alumno">
                            <FileText className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    )})}
                  </div>

                  {isOverCapacity && (
                    <div className="mt-8 p-5 bg-red-50 border-2 border-red-200 rounded-2xl flex items-start gap-4">
                      <AlertCircle className="w-8 h-8 text-red-500 shrink-0" />
                      <div>
                        <h4 className="font-black text-red-800 uppercase tracking-widest text-sm">Aforo superado</h4>
                        <p className="text-red-700 text-sm mt-1 font-medium leading-relaxed">El límite es de {currentSession.capacity} pero hay {currentCount} alumnos. Elimina alumnos o habla con coordinación para poder guardar.</p>
                      </div>
                    </div>
                  )}

                  <div className="mt-10 flex flex-col sm:flex-row gap-4 pt-8 border-t border-zinc-100">
                    {isFutureDate && (
                      <button onClick={saveClassOnly} disabled={isOverCapacity} className={`w-full sm:w-1/2 font-black uppercase tracking-widest text-xs py-4 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-sm ${isOverCapacity ? 'bg-zinc-100 text-zinc-400 border-2 border-zinc-200 cursor-not-allowed' : 'bg-white border-2 border-zinc-200 hover:bg-zinc-50 text-black active:scale-95'}`}>
                        <Calendar className="w-5 h-5" /> 
                        Guardar Previsión
                      </button>
                    )}
                    <button onClick={checkDeadHourAndSave} disabled={isOverCapacity || isFutureDate} className={`${!isFutureDate ? 'w-full' : 'w-full sm:w-1/2'} font-black uppercase tracking-widest text-xs py-4 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg ${(isOverCapacity || isFutureDate) ? 'bg-zinc-300 text-zinc-500 cursor-not-allowed' : 'bg-black hover:bg-zinc-800 text-white active:scale-95'}`}>
                      <Save className="w-5 h-5" /> Guardar Asistencia
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* --- PESTAÑA 2: MI HORARIO (DISPONIBILIDAD) --- */}
        {activeTab === 'availability' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Mi Disponibilidad</h2>
                <p className="text-zinc-500 font-medium text-sm">Configura tus horas libres para que Coordinación te asigne alumnos.</p>
              </div>
            </header>

            <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 overflow-hidden">
              <div className="p-6 md:p-8 space-y-8">
                {[1, 2, 3, 4, 5, 6].map(day => (
                  <div key={day} className="border-b border-zinc-100 pb-6 last:border-0 last:pb-0">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="w-full md:w-1/4">
                        <h3 className="font-black text-lg uppercase tracking-tight text-slate-800">{getDayName(day)}</h3>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
                           {(availability[day] || []).length} Franjas
                        </p>
                      </div>

                      <div className="w-full md:w-3/4 space-y-3">
                        {(availability[day] || []).map((slot, idx) => (
                           <div key={idx} className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                             <div className="flex items-center gap-3">
                               <Clock className="w-5 h-5 text-zinc-400"/>
                               <span className="font-black text-slate-700">{slot.start}h - {slot.end}h</span>
                             </div>
                             <button onClick={() => handleDeleteSlot(day, idx)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors" title="Eliminar franja">
                               <Trash2 className="w-5 h-5" />
                             </button>
                           </div>
                        ))}

                        {newSlot.day === day ? (
                          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-2xl border border-blue-100 shadow-sm animate-in fade-in zoom-in-95">
                            <input type="time" value={newSlot.start} onChange={e => setNewSlot({...newSlot, start: e.target.value})} className="p-2 rounded-xl border border-blue-200 text-sm font-bold outline-none text-slate-700 bg-white" />
                            <span className="font-black text-blue-300">-</span>
                            <input type="time" value={newSlot.end} onChange={e => setNewSlot({...newSlot, end: e.target.value})} className="p-2 rounded-xl border border-blue-200 text-sm font-bold outline-none text-slate-700 bg-white" />
                            <button onClick={() => handleAddSlot(day)} className="ml-auto bg-blue-600 text-white p-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-md active:scale-95">Guardar</button>
                            <button onClick={() => setNewSlot({day: null, start:'', end:''})} className="p-3 text-zinc-400 hover:text-black rounded-xl hover:bg-blue-100 transition-colors"><X className="w-5 h-5"/></button>
                          </div>
                        ) : (
                          <button onClick={() => setNewSlot({day, start:'', end:''})} className="w-full p-4 border-2 border-dashed border-zinc-200 rounded-2xl text-zinc-400 hover:text-black hover:border-black hover:bg-zinc-50 font-bold text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                            <PlusCircle className="w-4 h-4" /> Añadir Franja Libre
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* --- PESTAÑA NOTIFICACIONES (Avisos) --- */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Notificaciones</h2>
                <p className="text-sm font-medium text-zinc-500 mt-1">Gestiones pendientes solicitadas por tus alumnos.</p>
              </div>
              <span className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${notifications.length > 0 ? 'bg-red-500 text-white animate-pulse' : 'bg-zinc-200 text-zinc-500'}`}>
                {notifications.length} Pendientes
              </span>
            </div>

            {notifications.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-3xl border border-zinc-200 shadow-sm">
                <CheckCircle className="w-16 h-16 text-zinc-200 mx-auto mb-4" />
                <h3 className="text-lg font-bold uppercase tracking-widest text-zinc-400">No hay avisos pendientes</h3>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {notifications.map(n => (
                  <div key={n.id} className="bg-white border-2 border-zinc-100 p-6 rounded-3xl shadow-sm flex items-start gap-4">
                    <div className={`p-3 rounded-2xl shrink-0 ${n.type === 'baja' ? 'bg-red-50 text-red-500' : n.type === 'aviso_ausencia' ? 'bg-amber-50 text-amber-500' : 'bg-emerald-50 text-emerald-500'}`}>
                      {n.type === 'baja' ? <UserMinus className="w-6 h-6"/> : n.type === 'aviso_ausencia' ? <AlertCircle className="w-6 h-6"/> : <PlusCircle className="w-6 h-6"/>}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-black text-lg uppercase tracking-tight">{n.studentName}</h3>
                      <p className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-3">
                        {n.type === 'aviso_ausencia' ? n.title : `Solicita: ${n.title}`}
                      </p>
                      <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                        <p className="text-sm font-medium text-zinc-600 italic">"{n.details || 'Sin detalles adicionales'}"</p>
                      </div>
                      {n.targetMonth && (
                        <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mt-3">Para el mes de: {n.targetMonth}</p>
                      )}
                      
                      <div className="mt-4 pt-4 border-t border-zinc-100">
                        <button onClick={() => dismissNotification(n.id)} className="w-full sm:w-auto text-[10px] font-black uppercase tracking-widest bg-zinc-100 hover:bg-zinc-200 text-zinc-600 px-4 py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                          <Check className="w-4 h-4"/> Enterado / Ocultar
                        </button>
                      </div>

                    </div>
                  </div>
                ))}
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
                {isGlobalFestivo ? <PartyPopper className="w-20 h-20 text-amber-300 mx-auto mb-6"/> : <Palmtree className="w-20 h-20 text-emerald-300 mx-auto mb-6"/>}
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
                  
                  {lastReportSentDate === date ? (
                    <div className="w-full bg-emerald-50 text-emerald-600 border-2 border-emerald-200 font-black uppercase tracking-widest text-xs py-4 px-6 rounded-2xl flex items-center justify-center gap-2 shadow-sm text-center">
                      <CheckCircle className="w-5 h-5 shrink-0" /> Ya enviado a coordinación
                    </div>
                  ) : (
                    <button onClick={saveAndSendDailyReport} disabled={isSendingReport} className="w-full bg-black hover:bg-zinc-800 text-white font-black uppercase tracking-widest text-xs py-4 px-6 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl disabled:opacity-60">
                      {isSendingReport ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />} Enviar a Coordinación
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- PESTAÑA HISTORIAL CON PAGINACIÓN --- */}
        {activeTab === 'history' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-black text-slate-800 mb-8 uppercase tracking-tight">Historial de Clases</h2>
            {records.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-3xl border border-zinc-200 shadow-sm">
                <History className="w-16 h-16 text-zinc-200 mx-auto mb-4" />
                <h3 className="text-lg font-bold uppercase tracking-widest text-zinc-400">No hay registros aún</h3>
              </div>
            ) : (
              <>
                {records.slice(0, historyLimit).map((record) => (
                  <div key={record.id} className={`bg-white rounded-3xl shadow-sm border p-6 md:p-8 ${record.isRenounced ? 'border-amber-200 opacity-80' : 'border-zinc-200'}`}>
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 pb-6 border-b border-zinc-100 gap-4">
                      <div>
                        <h3 className="font-black uppercase tracking-wide text-black text-xl">
                          {record.subject}
                          {record.isRenounced && <span className="text-amber-600 text-xs font-black uppercase tracking-widest ml-3 bg-amber-50 px-2 py-1 rounded-lg">(RENUNCIADA)</span>}
                        </h3>
                        <p className="text-xs font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5 mt-2">
                          <MapPin className="w-4 h-4" /> {record.sede || 'Tarragona'} ({record.sala || 'Sala 1'})
                          <span className="mx-1">•</span> 
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
                ))}
                
                {historyLimit < records.length && (
                  <div className="text-center pt-4 pb-8">
                    <button 
                      onClick={() => setHistoryLimit(prev => prev + 10)}
                      className="bg-zinc-200 hover:bg-zinc-300 text-zinc-600 font-black uppercase tracking-widest text-xs px-6 py-3 rounded-xl transition-colors"
                    >
                      Cargar más clases antiguas
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* --- PESTAÑA REPORTES Y NÓMINA --- */}
        {activeTab === 'reports' && (
          <div className="space-y-8 animate-in fade-in">
            <div className="bg-black text-white p-8 md:p-10 rounded-3xl shadow-2xl relative overflow-hidden">
               <div className="relative z-10">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-4">
                    <div>
                      <h2 className="text-3xl font-black uppercase tracking-tighter">Mi Nómina</h2>
                      <select 
                        value={selectedPayrollMonth} 
                        onChange={(e) => setSelectedPayrollMonth(e.target.value)}
                        className="mt-2 bg-zinc-800 text-white border-2 border-zinc-700 p-2 rounded-xl text-xs font-bold uppercase tracking-widest outline-none focus:border-white transition-colors cursor-pointer"
                      >
                        {availableMonths.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="bg-zinc-800/80 backdrop-blur border border-zinc-700 px-5 py-3 rounded-2xl text-xs font-black uppercase tracking-widest text-zinc-300 shadow-inner">
                      Tarifa Convenio: <span className="text-white">{settings.hourlyRate}€/h</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                    <div className="bg-zinc-900/80 p-6 rounded-3xl border border-zinc-800 backdrop-blur hover:bg-zinc-800 transition-colors">
                      <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-2"><Clock className="w-4 h-4"/> Horas Reales</p>
                      <p className="text-4xl font-black tracking-tighter">{monthlyPayroll.realHours}<span className="text-lg text-zinc-600 ml-1 font-bold">h</span></p>
                    </div>
                    <div className="bg-zinc-900/80 p-6 rounded-3xl border border-zinc-800 backdrop-blur hover:border-blue-500/30 transition-colors">
                      <p className="text-[10px] font-black text-blue-500/80 uppercase tracking-widest mb-2 flex items-center gap-2"><Palmtree className="w-4 h-4"/> Vacaciones ({monthlyPayroll.vacationDays}d)</p>
                      <p className="text-4xl font-black tracking-tighter text-blue-400">{monthlyPayroll.projectedHours}<span className="text-lg text-zinc-600 ml-1 font-bold">h</span></p>
                    </div>
                    <div className="bg-zinc-900/80 p-6 rounded-3xl border border-zinc-800 backdrop-blur hover:border-amber-500/30 transition-colors">
                      <p className="text-[10px] font-black text-amber-500/80 uppercase tracking-widest mb-2 flex items-center gap-2"><RefreshCcw className="w-4 h-4"/> Ajustes Admin</p>
                      <p className={`text-4xl font-black tracking-tighter ${Number(monthlyPayroll.adjustmentHours) < 0 ? 'text-rose-400' : Number(monthlyPayroll.adjustmentHours) > 0 ? 'text-amber-300' : 'text-zinc-500'}`}>
                        {Number(monthlyPayroll.adjustmentHours) > 0 ? '+' : ''}{monthlyPayroll.adjustmentHours}<span className="text-lg text-zinc-600 ml-1 font-bold">h</span>
                      </p>
                    </div>
                    <div className="bg-zinc-900/80 p-6 rounded-3xl border border-zinc-800 backdrop-blur hover:border-emerald-500/30 transition-colors">
                      <p className="text-[10px] font-black text-emerald-600/50 uppercase tracking-widest mb-2 flex items-center gap-2"><BarChart3 className="w-4 h-4"/> Total Ajustado</p>
                      <p className="text-4xl font-black tracking-tighter text-emerald-400">{monthlyPayroll.totalHours}<span className="text-lg text-zinc-600 ml-1 font-bold">h</span></p>
                      <p className="text-xl font-black tracking-tighter text-emerald-300 mt-1">{monthlyPayroll.earnings}<span className="text-sm ml-1 font-bold">€</span></p>
                    </div>
                  </div>

                  <div className="mt-6 bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5">
                    <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4"/> Correcciones administrativas del mes
                    </h3>
                    {monthlyPayroll.adjustmentItems.length === 0 ? (
                      <p className="text-xs font-bold text-zinc-600 uppercase tracking-widest">No hay ajustes manuales aplicados a este mes.</p>
                    ) : (
                      <div className="space-y-2">
                        {monthlyPayroll.adjustmentItems.map(adj => (
                          <div key={adj.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-black/30 border border-zinc-800 rounded-xl p-3">
                            <div>
                              <p className="text-xs font-black text-white uppercase tracking-widest">{adj.reason || 'Ajuste sin motivo indicado'}</p>
                              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">
                                {adj.createdAt ? formatDateSpanish(adj.createdAt.substring(0, 10)) : 'Sin fecha'} · Coordinación
                              </p>
                            </div>
                            <span className={`text-sm font-black ${Number(adj.hours) < 0 ? 'text-rose-400' : 'text-amber-300'}`}>
                              {Number(adj.hours) > 0 ? '+' : ''}{normalizeNumber(adj.hours).toFixed(2)} h
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-center mt-6">* La proyección de vacaciones se calcula matemáticamente en base a la media diaria de tu mes anterior. Los ajustes administrativos se aplican al total final visible.</p>
               </div>
               <Music className="absolute -bottom-12 -right-12 w-80 h-80 text-zinc-900/40 rotate-12 pointer-events-none" />
            </div>
          </div>
        )}
      </main>

      <nav className="md:hidden fixed bottom-0 w-full bg-white border-t border-zinc-200 pb-safe z-40">
        <div className="flex justify-around p-2">
          {[{id:'attendance', i:ClipboardList}, {id:'availability', i:Clock}, {id:'notifications', i:Bell}, {id:'daily', i:MessageSquare}, {id:'reports', i:BarChart3}].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`p-4 rounded-xl transition-all relative ${activeTab === t.id ? 'bg-black text-white shadow-lg' : 'text-zinc-400'}`}>
              <t.i className="w-6 h-6"/>
              {t.id === 'notifications' && notifications.length > 0 && <span className="bg-red-500 w-3 h-3 rounded-full absolute top-2 right-2 animate-pulse border-2 border-white"></span>}
            </button>
          ))}
          {isAdmin && <button onClick={switchToAdmin} className={`p-4 rounded-xl transition-all bg-red-50 text-red-600`}><ShieldAlert className="w-6 h-6"/></button>}
        </div>
      </nav>

      <nav className="hidden md:flex fixed top-1/2 -translate-y-1/2 left-6 flex-col gap-4 z-40">
        {[{id:'attendance', i:ClipboardList, t:'Listas'}, {id:'availability', i:Clock, t:'Horario'}, {id:'notifications', i:Bell, t:'Avisos'}, {id:'daily', i:MessageSquare, t:'Diario'}, {id:'history', i:History, t:'Historial'}, {id:'reports', i:BarChart3, t:'Nómina'}].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`p-5 rounded-2xl shadow-sm flex items-center justify-center transition-all relative ${activeTab === t.id ? 'bg-black text-white scale-110 shadow-xl' : 'bg-white text-zinc-400 hover:text-black border-2'}`} title={t.t}>
            <t.i/>
            {t.id === 'notifications' && notifications.length > 0 && <span className="bg-red-500 w-3 h-3 rounded-full absolute top-2 right-2 animate-pulse border-2 border-white"></span>}
          </button>
        ))}
      </nav>
    </div>
  );
}
