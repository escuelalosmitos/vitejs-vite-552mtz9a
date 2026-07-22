import React, { useState, useMemo, useEffect } from 'react';
import { 
  ClipboardList, History, BarChart3, Check, X, AlertCircle, Save, Mail, 
  Trash2, Calendar, Clock, User, Music, RefreshCw, Play, 
  MessageSquare, LogOut, CornerDownRight, BookOpen, CalendarOff, Ticket, 
  Snowflake, Timer, Palmtree, PartyPopper, Coffee, MapPin, Bell, UserMinus, 
  RefreshCcw, PlusCircle, CheckCircle, ShieldAlert, LayoutGrid, FileText, Ghost,
  Megaphone, Send, Link as LinkIcon
} from 'lucide-react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, collectionGroup, runTransaction } from 'firebase/firestore';

const INSTRUMENTOS = ["Guitarra", "Canto", "Teclado", "Batería", "Bajo", "Ukelele", "Armónica", "Sensibilización", "Violín"];
const SEDES = ["Tarragona", "Reus"];
const SALAS = ["Sala 1", "Sala 2", "Sala 3"];

const CLASS_RESOURCE_TYPES = [
  { value: 'pdf', label: 'PDF' },
  { value: 'drive_folder', label: 'Carpeta Drive' },
  { value: 'video', label: 'Vídeo' },
  { value: 'audio', label: 'Audio' },
  { value: 'document', label: 'Documento' },
  { value: 'link', label: 'Enlace' },
  { value: 'other', label: 'Otro' }
];

const EMPTY_RESOURCE_FORM = {
  id: null,
  title: '',
  url: '',
  type: 'pdf',
  targetScope: 'class',
  targetStudentIds: [],
  notes: ''
};

const getClassResourceTypeLabel = (type = 'link') => CLASS_RESOURCE_TYPES.find(t => t.value === type)?.label || 'Recurso';


const PLANNING_GESTION_TYPES = new Set(["baja", "mantenimiento", "reactivar_plaza", "cambio_horario", "ampliar_clases"]);

const PLANNING_GESTION_LABELS = {
  baja: 'Baja pendiente',
  mantenimiento: 'Mantenimiento pendiente',
  reactivar_plaza: 'Fin mantenimiento pendiente',
  cambio_horario: 'Cambio pendiente',
  ampliar_clases: 'Ampliación pendiente'
};

const PLANNING_GESTION_STYLE = {
  baja: 'bg-red-50 text-red-700 border-red-200',
  mantenimiento: 'bg-blue-50 text-blue-700 border-blue-200',
  reactivar_plaza: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cambio_horario: 'bg-violet-50 text-violet-700 border-violet-200',
  ampliar_clases: 'bg-amber-50 text-amber-800 border-amber-200'
};

const TEACHER_TASK_REQUEST_TYPES = [
  { value: 'clase_puntual', label: 'Crear clase puntual' },
  { value: 'material', label: 'Material o aula' },
  { value: 'alumno', label: 'Alumno o familia' },
  { value: 'horario', label: 'Horario o agenda' },
  { value: 'incidencia', label: 'Incidencia' },
  { value: 'otro', label: 'Otra petición' }
];

const TEACHER_TASK_STATUS_LABELS = {
  pendiente: 'Pendiente',
  en_revision: 'En revisión',
  en_curso: 'En curso',
  completada: 'Completada',
  resuelta: 'Resuelta',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada'
};

const TEACHER_TASK_STATUS_STYLE = {
  pendiente: 'bg-amber-50 text-amber-800 border-amber-200',
  en_revision: 'bg-blue-50 text-blue-700 border-blue-200',
  en_curso: 'bg-violet-50 text-violet-700 border-violet-200',
  completada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  resuelta: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rechazada: 'bg-red-50 text-red-700 border-red-200',
  cancelada: 'bg-zinc-50 text-zinc-500 border-zinc-200'
};

const TEACHER_TASK_OPEN_STATUSES = new Set(['pendiente', 'en_revision', 'en_curso']);
const TEACHER_TASK_CLOSED_STATUSES = new Set(['completada', 'resuelta', 'rechazada', 'cancelada']);

const isAdminAssignmentTask = (task = {}) => (
  task.type === 'admin_assignment' ||
  task.type === 'admin_to_teacher' ||
  task.direction === 'admin_to_teacher'
);

const isTeacherTaskOpen = (task = {}) => TEACHER_TASK_OPEN_STATUSES.has(task.status || 'pendiente');
const isTeacherTaskClosed = (task = {}) => TEACHER_TASK_CLOSED_STATUSES.has(task.status || '');

const getPlanningGestionLabel = (gestion = {}) => PLANNING_GESTION_LABELS[gestion.type] || 'Gestión pendiente';
const getPlanningGestionStyle = (gestion = {}) => PLANNING_GESTION_STYLE[gestion.type] || 'bg-zinc-50 text-zinc-700 border-zinc-200';

const isFixedClassStudent = (studentEntry = {}) => !(
  studentEntry?.isRecovery === true ||
  studentEntry?.isTemporary === true ||
  studentEntry?.isPunctual === true ||
  studentEntry?.isTemporaryRelocation === true ||
  Boolean(studentEntry?.temporaryRelocationId) ||
  studentEntry?.type === 'recovery' ||
  studentEntry?.status === 'recovery'
);

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

const getSafeAnnouncementUrl = (url = '') => {
  const cleanUrl = String(url || '').trim();
  if (!/^https?:\/\//i.test(cleanUrl)) return '';
  return cleanUrl;
};

const getTeacherTaskStatusLabel = (status = 'pendiente') => TEACHER_TASK_STATUS_LABELS[status] || 'Pendiente';
const getTeacherTaskStatusStyle = (status = 'pendiente') => TEACHER_TASK_STATUS_STYLE[status] || TEACHER_TASK_STATUS_STYLE.pendiente;

const normalizeStudentClassDate = (value) => String(value || '').trim();

const getStudentClassStartDate = (studentEntry = {}, studentInfo = {}) => normalizeStudentClassDate(
  studentEntry.classStartDate ||
  studentEntry.startDate ||
  studentInfo.classStartDate ||
  studentInfo.startDate ||
  ''
);

const getStudentClassEndDate = (studentEntry = {}, studentInfo = {}) => {
  const classSpecificEndDate = normalizeStudentClassDate(
    studentEntry.classEndDate ||
    studentEntry.scheduledEndDate ||
    studentEntry.endDate ||
    studentEntry.until ||
    ''
  );

  if (classSpecificEndDate) return classSpecificEndDate;

  const globalEndDate = normalizeStudentClassDate(
    studentInfo.classEndDate ||
    studentInfo.endDate ||
    ''
  );

  if (globalEndDate) return globalEndDate;

  const scheduledBajaEndDate = normalizeStudentClassDate(studentInfo.scheduledBajaClassEndDate || '');
  const scheduledBajaStillApplies = studentInfo.scheduledBaja === true || studentInfo.globalStatus === 'baja';

  return scheduledBajaStillApplies ? scheduledBajaEndDate : '';
};

const hasClassStartedForDate = (studentEntry = {}, studentInfo = {}, targetDate = '') => {
  const startDate = getStudentClassStartDate(studentEntry, studentInfo);
  return !startDate || !targetDate || startDate <= targetDate;
};

const hasClassEndedBeforeDate = (studentEntry = {}, studentInfo = {}, targetDate = '') => {
  const endDate = getStudentClassEndDate(studentEntry, studentInfo);
  return Boolean(endDate && targetDate && endDate < targetDate);
};

const isStudentClassActiveForDate = (studentEntry = {}, studentInfo = {}, targetDate = '') => (
  hasClassStartedForDate(studentEntry, studentInfo, targetDate) &&
  !hasClassEndedBeforeDate(studentEntry, studentInfo, targetDate)
);

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


const NON_COMPUTABLE_REASONS = {
  auto_cancelled_all_notified: {
    label: 'Clase cancelada por aviso previo',
    tag: 'CLASE CANCELADA',
    detail: 'Todos los alumnos activos avisaron con antelación suficiente. La clase no computa y no requiere protocolo de hora muerta.'
  },
  teacher_renounced_dead_hour: {
    label: 'Hora renunciada por el profesor',
    tag: 'RENUNCIA VOLUNTARIA',
    detail: 'Todos los alumnos faltaron y el profesor renunció a realizar una tarea del protocolo de hora muerta. La hora no computa.'
  },
  last_hour_all_absent: {
    label: 'Última hora sin alumnos',
    tag: 'ÚLTIMA HORA SIN ALUMNOS',
    detail: 'Todos los alumnos activos faltaron y no quedaban más clases computables después. No se aplica protocolo de hora muerta.'
  },
  legacy_renounced: {
    label: 'Hora no computable registrada sin motivo específico',
    tag: 'HORA NO COMPUTABLE',
    detail: 'Registro antiguo o sin motivo estructurado. La hora no computa.'
  }
};

const getNonComputableInfo = (reason) => NON_COMPUTABLE_REASONS[reason] || NON_COMPUTABLE_REASONS.legacy_renounced;

const formatDateTimeSpanish = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

const daysSince = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((today - d) / (1000 * 60 * 60 * 24));
};

const buildNotesFreshnessLine = (updatedAt) => {
  if (!updatedAt) return 'Cuaderno de bitácora: fecha de última actualización no registrada.';
  const formatted = formatDateTimeSpanish(updatedAt);
  const age = daysSince(updatedAt);
  if (age !== null && age > 30) {
    return `⚠️ Cuaderno de bitácora sin actualizar desde hace ${age} días. Última actualización: ${formatted}.`;
  }
  return `Cuaderno de bitácora actualizado: ${formatted}.`;
};

const getComputableHoursFromRecords = (recordsList = []) => {
  const computableMinutes = recordsList
    .filter(record => !record.isRenounced && !record.isNonComputable)
    .reduce((acc, record) => acc + normalizeNumber(record.duration || 60), 0);
  return computableMinutes / 60;
};

const cleanAttendanceNotesForReport = (record = {}) => {
  let notes = String(record.classNotes || record.notes || '').trim();
  if (!notes) return 'Ninguna';

  if (record.isDeadHourWorked && record.deadHourNote) {
    const deadHourNote = String(record.deadHourNote || '').trim();
    const exactPrefix = `[HORA MUERTA]: ${deadHourNote}.`;
    const loosePrefix = `[HORA MUERTA]: ${deadHourNote}`;

    if (notes.startsWith(exactPrefix)) {
      notes = notes.slice(exactPrefix.length).trim();
    } else if (notes.startsWith(loosePrefix)) {
      notes = notes.slice(loosePrefix.length).replace(/^\.\s*/, '').trim();
    } else {
      notes = notes.replace(/^\[HORA MUERTA\]:\s*/i, '').trim();
    }
  }

  if (record.isRenounced) {
    const nonComputableInfo = getNonComputableInfo(record.nonComputableReason || 'legacy_renounced');
    const tagPrefix = `[${nonComputableInfo.tag}]:`;
    if (notes.startsWith(tagPrefix)) {
      notes = notes.slice(tagPrefix.length).trim();
      const detail = String(record.nonComputableDetail || nonComputableInfo.detail || '').trim();
      if (detail && notes.startsWith(detail)) {
        notes = notes.slice(detail.length).trim();
      }
    }
  }

  return notes || 'Ninguna';
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
  const [temporaryRelocations, setTemporaryRelocations] = useState([]);
  const [maintenancePeriods, setMaintenancePeriods] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [teacherNotifications, setTeacherNotifications] = useState([]);
  const [teacherTasks, setTeacherTasks] = useState([]);
  
  const [lastReportSentDate, setLastReportSentDate] = useState('');
  const [lastSeenTeacherTablon, setLastSeenTeacherTablon] = useState('');
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
  const [notificationsView, setNotificationsView] = useState('notifications');
  const [tasksView, setTasksView] = useState('pending');
  const [taskModal, setTaskModal] = useState(null);
  const [taskForm, setTaskForm] = useState({
    type: 'self_task',
    requestType: 'otro',
    title: '',
    description: '',
    priority: 'normal',
    dueDate: '',
    relatedClassId: ''
  });
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [notification, setNotification] = useState(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  
  const [selectedPayrollMonth, setSelectedPayrollMonth] = useState(new Date().toISOString().substring(0, 7));
  const availableMonths = useMemo(() => generateLast12Months(), []);

  const [currentSession, setCurrentSession] = useState(null);
  const [isSendingReport, setIsSendingReport] = useState(false);
  
  const [deadHourModal, setDeadHourModal] = useState(null);
  const [notesModal, setNotesModal] = useState(null);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [resourceForm, setResourceForm] = useState(EMPTY_RESOURCE_FORM);
  const [isSavingResource, setIsSavingResource] = useState(false);

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
    const temporaryRelocationsRef = collection(db, 'artifacts', appId, 'temporaryRelocations');
    const maintenancePeriodsRef = collection(db, 'artifacts', appId, 'maintenancePeriods');
    const announcementsRef = collection(db, 'artifacts', appId, 'announcements');
    const teacherNotificationsRef = collection(db, 'artifacts', appId, 'teacherNotifications');
    const teacherTasksRef = collection(db, 'artifacts', appId, 'teacherTasks');
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
    let temporaryRelocationsLoaded = false;
    let maintenancePeriodsLoaded = false;
    let announcementsLoaded = false;
    let teacherNotificationsLoaded = false;
    let teacherTasksLoaded = false;
    let availLoaded = false;
    let userDocLoaded = false;

    const checkLoading = () => {
      if (recordsLoaded && recurringLoaded && dailyLoaded && studentsLoaded && ticketsLoaded && subsLoaded && gestionesLoaded && payrollAdjustmentsLoaded && temporaryRelocationsLoaded && maintenancePeriodsLoaded && announcementsLoaded && teacherNotificationsLoaded && teacherTasksLoaded && availLoaded && userDocLoaded) setLoadingData(false);
    };

    const unsubUserDoc = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const userDocData = docSnap.data();
        if (userDocData.lastReportSentDate) setLastReportSentDate(userDocData.lastReportSentDate);
        if (userDocData.lastSeenTeacherTablon) setLastSeenTeacherTablon(userDocData.lastSeenTeacherTablon);
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

    const unsubTemporaryRelocations = onSnapshot(temporaryRelocationsRef, (snapshot) => {
      setTemporaryRelocations(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
      temporaryRelocationsLoaded = true;
      checkLoading();
    });

    const unsubMaintenancePeriods = onSnapshot(maintenancePeriodsRef, (snapshot) => {
      setMaintenancePeriods(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
      maintenancePeriodsLoaded = true;
      checkLoading();
    });

    const unsubAnnouncements = onSnapshot(announcementsRef, (snapshot) => {
      const data = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      data.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setAnnouncements(data);
      announcementsLoaded = true;
      checkLoading();
    });

    const unsubTeacherNotifications = onSnapshot(teacherNotificationsRef, (snapshot) => {
      const data = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      data.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setTeacherNotifications(data);
      teacherNotificationsLoaded = true;
      checkLoading();
    }, (error) => {
      console.error('No se pudieron cargar los avisos internos del profesor:', error);
      setTeacherNotifications([]);
      teacherNotificationsLoaded = true;
      checkLoading();
    });

    const unsubTeacherTasks = onSnapshot(teacherTasksRef, (snapshot) => {
      const data = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      data.sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0));
      setTeacherTasks(data);
      teacherTasksLoaded = true;
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
      unsubTemporaryRelocations();
      unsubMaintenancePeriods();
      unsubAnnouncements();
      unsubTeacherNotifications();
      unsubTeacherTasks();
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
      showNotification({type:'success', text: 'Franja añadida a tu horario disponible para el centro.'});
    } catch(e) {
      showNotification({type:'error', text: 'Error al guardar la franja.'});
    }
  };

  const handleDeleteSlot = async (day, index) => {
    const updatedDaySlots = (availability[day] || []).filter((_, i) => i !== index);
    const updatedSlots = { ...availability, [day]: updatedDaySlots };

    try {
      await setDoc(doc(db, 'artifacts', appId, 'availability', getTeacherName().toLowerCase()), { slots: updatedSlots }, { merge: true });
      showNotification({type:'success', text: 'Franja eliminada de tu disponibilidad declarada. Las clases ya asignadas no se modifican.'});
    } catch(e) {
      showNotification({type:'error', text: 'Error al eliminar.'});
    }
  };

  const teacherClassIds = useMemo(() => new Set(recurringClasses.map(c => c.id)), [recurringClasses]);

  const isPlanningGestionRelevantForClass = (gestion = {}, classData = {}) => {
    if (!gestion || gestion.status !== 'pendiente' || !PLANNING_GESTION_TYPES.has(gestion.type) || !classData) return false;
    const classId = classData.id || classData.classId;

    if (gestion.requestedClass && classId && gestion.requestedClass === classId) return true;

    if (gestion.studentId) {
      return (classData.students || []).some(studentEntry =>
        studentEntry.id === gestion.studentId && isFixedClassStudent(studentEntry)
      );
    }

    return false;
  };

  const pendingPlanningGestiones = useMemo(() => {
    const teacherName = getTeacherName().toLowerCase();

    return gestiones
      .filter(g => g.status === 'pendiente' && PLANNING_GESTION_TYPES.has(g.type))
      .filter(g => {
        if (g.requestedClass && teacherClassIds.has(g.requestedClass)) return true;
        if (g.requestedTeacher && String(g.requestedTeacher).toLowerCase() === teacherName) return true;
        return recurringClasses.some(c => isPlanningGestionRelevantForClass(g, c));
      })
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [gestiones, recurringClasses, teacherClassIds, user]);

  const getPlanningGestionesForClass = (classData = {}) => {
    if (!classData) return [];
    return pendingPlanningGestiones.filter(g => isPlanningGestionRelevantForClass(g, classData));
  };

  const getPlanningGestionesForStudent = (studentId, classData = null) => {
    if (!studentId) return [];
    return pendingPlanningGestiones.filter(g => {
      if (g.studentId !== studentId) return false;
      if (!classData) return true;
      const classId = classData.id || classData.classId;
      if (g.type === 'ampliar_clases') return g.requestedClass === classId;
      return true;
    });
  };

  const getPlanningGestionClassContext = (gestion = {}, classData = null) => {
    const classId = classData?.id || classData?.classId || '';
    if (gestion.type === 'cambio_horario') {
      if (gestion.requestedClass && gestion.requestedClass === classId) return 'Entra en esta clase si Admin ejecuta el cambio.';
      return 'Sale de esta clase si Admin ejecuta el cambio.';
    }
    if (gestion.type === 'ampliar_clases') return 'Entraría en esta clase si Admin ejecuta la ampliación.';
    if (gestion.type === 'baja') return 'Dejará de venir si Admin ejecuta la baja.';
    if (gestion.type === 'mantenimiento') return 'Quedará en mantenimiento/plaza reservada si Admin lo ejecuta.';
    if (gestion.type === 'reactivar_plaza') return 'Finalizará anticipadamente el mantenimiento si Admin lo ejecuta.';
    return 'Gestión pendiente de coordinación.';
  };

  const renderPlanningBadge = (gestion = {}, classData = null) => {
    const label = getPlanningGestionLabel(gestion);
    const style = getPlanningGestionStyle(gestion);
    return (
      <span key={gestion.id} title={getPlanningGestionClassContext(gestion, classData)} className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${style}`}>
        {gestion.type === 'baja' && <UserMinus className="w-3 h-3" />}
        {gestion.type === 'mantenimiento' && <Snowflake className="w-3 h-3" />}
        {gestion.type === 'reactivar_plaza' && <CheckCircle className="w-3 h-3" />}
        {gestion.type === 'cambio_horario' && <RefreshCcw className="w-3 h-3" />}
        {gestion.type === 'ampliar_clases' && <PlusCircle className="w-3 h-3" />}
        {label}
        {gestion.targetMonth ? ` · ${gestion.targetMonth}` : ''}
      </span>
    );
  };

  const notifications = useMemo(() => {
    const isRelevantForTeacher = (g) => {
      if (g.status !== 'pendiente') return false;

      if (PLANNING_GESTION_TYPES.has(g.type)) {
        if (g.requestedClass && teacherClassIds.has(g.requestedClass)) return true;
        if (g.requestedTeacher && String(g.requestedTeacher).toLowerCase() === getTeacherName().toLowerCase()) return true;
        return recurringClasses.some(c => isPlanningGestionRelevantForClass(g, c));
      }

      if (g.type === 'aviso_ausencia' && g.requestedClass && teacherClassIds.has(g.requestedClass)) {
        return true;
      }

      if (g.type === 'recuperacion') {
        if (g.requestedClass && teacherClassIds.has(g.requestedClass)) return true;
        if (g.requestedTeacher && String(g.requestedTeacher).toLowerCase() === getTeacherName().toLowerCase()) return true;
      }

      return false;
    };

    const visibleGestiones = isAdmin
      ? gestiones.filter(g => g.status === 'pendiente')
      : gestiones.filter(isRelevantForTeacher);

    return visibleGestiones.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [gestiones, recurringClasses, teacherClassIds, isAdmin, user]);

  const visibleInternalTeacherNotifications = useMemo(() => {
    const teacherName = getTeacherName().trim().toLowerCase();
    const teacherEmail = String(user?.email || '').trim().toLowerCase();
    const assignedTeacherNames = new Set(recurringClasses.map(clase => String(clase.teacher || '').trim().toLowerCase()).filter(Boolean));

    return teacherNotifications.filter(notification => {
      const targetName = String(notification.teacherNameNormalized || notification.teacherName || '').trim().toLowerCase();
      const targetEmail = String(notification.teacherEmail || '').trim().toLowerCase();
      const targetUid = String(notification.teacherUid || '').trim();
      return Boolean(
        (targetUid && targetUid === user?.uid) ||
        (targetEmail && targetEmail === teacherEmail) ||
        (targetName && (targetName === teacherName || assignedTeacherNames.has(targetName)))
      );
    });
  }, [teacherNotifications, recurringClasses, user?.uid, user?.email]);

  const pendingInternalTeacherNotifications = useMemo(() => (
    visibleInternalTeacherNotifications.filter(notification => notification.status !== 'read' && !notification.readAt)
  ), [visibleInternalTeacherNotifications]);

  const readInternalTeacherNotifications = useMemo(() => (
    visibleInternalTeacherNotifications
      .filter(notification => notification.status === 'read' || notification.readAt)
      .sort((a, b) => new Date(b.readAt || b.createdAt || 0) - new Date(a.readAt || a.createdAt || 0))
  ), [visibleInternalTeacherNotifications]);



  const teacherAnnouncementMatches = (ann = {}) => {
    const audienceType = ann.audienceType || 'all';
    const audienceValue = String(ann.audienceValue || '').trim();

    // Avisos generales: los leen alumnos y profesores.
    if (audienceType === 'all') return true;

    // Avisos internos publicados desde AdminPortal solo para profesores.
    if (audienceType === 'teachers') return true;

    if (!audienceValue) return false;

    const teacherName = getTeacherName().toLowerCase();
    const teacherEmail = String(user?.email || '').toLowerCase();
    const valueLower = audienceValue.toLowerCase();

    if (audienceType === 'profesor') {
      return valueLower === teacherName || valueLower === teacherEmail;
    }
    if (audienceType === 'sede') {
      return recurringClasses.some(c => (c.sede || 'Tarragona') === audienceValue);
    }
    if (audienceType === 'instrumento') {
      return recurringClasses.some(c => (c.subject || '') === audienceValue);
    }

    // Cierre seguro: si aparece un tipo de audiencia nuevo, no lo mostramos por defecto.
    return false;
  };

  const visibleTeacherAnnouncements = useMemo(() => {
    return announcements.filter(teacherAnnouncementMatches);
  }, [announcements, recurringClasses, user]);

  const latestTeacherAnnouncementId = visibleTeacherAnnouncements.length > 0 ? String(visibleTeacherAnnouncements[0].id) : null;
  const hasUnreadTeacherTablon = Boolean(latestTeacherAnnouncementId && latestTeacherAnnouncementId !== lastSeenTeacherTablon);

  useEffect(() => {
    if (activeTab !== 'notifications' || notificationsView !== 'tablon' || !latestTeacherAnnouncementId || !user?.uid) return;
    if (latestTeacherAnnouncementId === lastSeenTeacherTablon) return;

    setDoc(doc(db, 'artifacts', appId, 'users', user.uid), {
      lastSeenTeacherTablon: latestTeacherAnnouncementId
    }, { merge: true }).catch(e => console.error('Error al marcar tablón de profesor como leído', e));
    setLastSeenTeacherTablon(latestTeacherAnnouncementId);
  }, [activeTab, notificationsView, latestTeacherAnnouncementId, lastSeenTeacherTablon, db, appId, user?.uid]);

  const getTeacherTaskClassLine = (classId = '') => {
    if (!classId) return '';
    const selectedClass = recurringClasses.find(c => c.id === classId);
    return selectedClass ? formatClassSummary(selectedClass) : '';
  };

  const openTaskModal = (type = 'self_task') => {
    setTaskForm({
      type,
      requestType: type === 'admin_request' ? 'otro' : '',
      title: '',
      description: '',
      priority: 'normal',
      dueDate: '',
      relatedClassId: ''
    });
    setTaskModal(type);
  };

  const closeTaskModal = () => {
    if (isSavingTask) return;
    setTaskModal(null);
  };

  const saveTeacherTask = async () => {
    if (!taskForm.title.trim() || isSavingTask) {
      showNotification({ type: 'error', text: 'Escribe un título para la tarea.' });
      return;
    }

    setIsSavingTask(true);
    const now = new Date().toISOString();
    const taskId = `teacher-task-${Date.now()}`;
    const selectedClass = recurringClasses.find(c => c.id === taskForm.relatedClassId) || null;
    const payload = {
      type: taskForm.type,
      requestType: taskForm.type === 'admin_request' ? (taskForm.requestType || 'otro') : '',
      teacherUid: user.uid,
      teacherEmail: user.email,
      teacherName: getTeacherName(),
      title: taskForm.title.trim(),
      description: taskForm.description.trim(),
      priority: taskForm.priority || 'normal',
      dueDate: taskForm.dueDate || '',
      relatedClassId: selectedClass?.id || '',
      relatedClassLine: selectedClass ? formatClassSummary(selectedClass) : '',
      relatedClassTeacher: selectedClass?.teacher || '',
      status: 'pendiente',
      createdAt: now,
      updatedAt: now,
      createdFrom: 'teacher_portal'
    };

    try {
      await setDoc(doc(db, 'artifacts', appId, 'teacherTasks', taskId), payload);

      // Las peticiones a coordinación se guardan en teacherTasks y las recoge AdminPortal.
      // No enviamos email para evitar duplicar ruido interno.

      setTaskModal(null);
      showNotification({ type: 'success', text: payload.type === 'admin_request' ? 'Petición registrada para coordinación.' : 'Tarea creada.' });
    } catch (e) {
      console.error('Error al guardar tarea de profesor', e);
      showNotification({ type: 'error', text: 'No se pudo guardar la tarea.' });
    } finally {
      setIsSavingTask(false);
    }
  };

  const updateTeacherTaskStatus = async (task, status) => {
    if (!task?.id) return;

    const now = new Date().toISOString();
    const payload = {
      status,
      updatedAt: now,
      updatedBy: user?.email || '',
      updatedByName: getTeacherName()
    };

    if (isAdminAssignmentTask(task)) {
      if (status === 'en_curso') {
        payload.startedAt = task.startedAt || now;
        payload.startedBy = user?.email || '';
        payload.startedByName = getTeacherName();
      }

      if (status === 'completada') {
        const response = window.prompt('Respuesta para coordinación al completar el encargo (opcional):', task.teacherResponse || task.completionNote || '');
        if (response === null) return;
        payload.completedAt = now;
        payload.completedBy = user?.email || '';
        payload.completedByName = getTeacherName();
        payload.teacherResponse = String(response || '').trim();
        payload.completionNote = String(response || '').trim();
      }

      if (status === 'rechazada') {
        const reason = window.prompt('Motivo del rechazo para coordinación:', task.rejectionReason || '');
        if (reason === null) return;
        const cleanReason = String(reason || '').trim();
        if (!cleanReason) {
          showNotification({ type: 'error', text: 'Para rechazar un encargo debes escribir un motivo.' });
          return;
        }
        payload.rejectedAt = now;
        payload.rejectedBy = user?.email || '';
        payload.rejectedByName = getTeacherName();
        payload.rejectionReason = cleanReason;
        payload.teacherResponse = cleanReason;
      }
    } else if (status === 'completada' || status === 'resuelta') {
      payload.completedAt = now;
      payload.completedBy = user?.email || '';
      payload.completedByName = getTeacherName();
    }

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'teacherTasks', task.id), payload);
      showNotification({ type: 'success', text: 'Tarea actualizada.' });
    } catch (e) {
      console.error('Error al actualizar tarea', e);
      showNotification({ type: 'error', text: 'No se pudo actualizar la tarea.' });
    }
  };

  const deleteTeacherTask = async (task) => {
    if (!task?.id) return;
    const ok = window.confirm('¿Eliminar esta tarea definitivamente?');
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'teacherTasks', task.id));
      showNotification({ type: 'success', text: 'Tarea eliminada.' });
    } catch (e) {
      console.error('Error al eliminar tarea', e);
      showNotification({ type: 'error', text: 'No se pudo eliminar la tarea.' });
    }
  };

  const visibleTeacherTasks = useMemo(() => {
    const teacherName = getTeacherName().toLowerCase();
    const teacherEmail = String(user?.email || '').toLowerCase();
    return teacherTasks.filter(task => {
      if (isAdmin) return true;
      if (task.teacherUid && task.teacherUid === user?.uid) return true;
      if (task.teacherEmail && String(task.teacherEmail).toLowerCase() === teacherEmail) return true;
      return task.teacherName && String(task.teacherName).toLowerCase() === teacherName;
    });
  }, [teacherTasks, user, isAdmin]);

  const openTeacherTasksCount = visibleTeacherTasks.filter(isTeacherTaskOpen).length;
  const pendingSelfTasks = visibleTeacherTasks.filter(task => task.type === 'self_task' && isTeacherTaskOpen(task));
  const pendingAdminRequests = visibleTeacherTasks.filter(task => task.type === 'admin_request' && isTeacherTaskOpen(task));
  const pendingAdminAssignments = visibleTeacherTasks.filter(task => isAdminAssignmentTask(task) && isTeacherTaskOpen(task));
  const completedTeacherTasks = visibleTeacherTasks.filter(isTeacherTaskClosed);

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
  }, [date, records, recurringClasses, globalStudents, temporaryRelocations, maintenancePeriods]);

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

  const markInternalTeacherNotificationRead = async (notificationItem) => {
    if (!notificationItem?.id) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'teacherNotifications', notificationItem.id), {
        status: 'read',
        readAt: new Date().toISOString(),
        readByUid: user?.uid || '',
        readByEmail: user?.email || '',
        readByName: getTeacherName()
      });
      showNotification({ type: 'success', text: 'Aviso marcado como enterado.' });
    } catch (error) {
      console.error('Error al marcar el aviso interno como leído:', error);
      showNotification({ type: 'error', text: 'No se pudo marcar el aviso como leído.' });
    }
  };

  const dismissNotification = async (id) => {
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'gestiones', id), { status: 'completado' });
    } catch (e) {
      console.error("Error al ocultar notificación", e);
    }
  };

  const getRecoveryClass = (gestion = {}) => {
    if (!gestion.requestedClass) return null;
    return recurringClasses.find(c => c.id === gestion.requestedClass) || null;
  };

  const formatClassSummary = (clase = {}) => {
    if (!clase) return 'Clase no localizada';
    return `${clase.subject || 'Clase'} · ${getDayName(clase.dayOfWeek)} · ${clase.time || ''}h · ${clase.sede || 'Tarragona'}${clase.sala ? ` · ${clase.sala}` : ''}`;
  };

  const isTemporaryRelocationActiveForDate = (relocation = {}, targetDate = date) => {
    if (!relocation || relocation.status === 'cancelled') return false;
    return Boolean(relocation.from && relocation.until && relocation.from <= targetDate && relocation.until >= targetDate);
  };

  const getTemporaryRelocationsForDate = (targetDate = date) => {
    return temporaryRelocations.filter(rel => isTemporaryRelocationActiveForDate(rel, targetDate));
  };

  const isMaintenanceStatusClosed = (status = '') => ['cancelled', 'cancelada', 'finalizada'].includes(status);

  const isMaintenancePeriodActiveForDate = (period = {}, targetDate = date) => {
    if (!period || isMaintenanceStatusClosed(period.status)) return false;
    return Boolean(period.from && period.until && period.from <= targetDate && period.until >= targetDate);
  };

  const getActiveStudentMaintenancePeriod = (studentId, targetDate = date) => {
    if (!studentId) return null;
    return maintenancePeriods.find(period =>
      period.studentId === studentId && isMaintenancePeriodActiveForDate(period, targetDate)
    ) || null;
  };

  const isStudentInMaintenance = (studentId, targetDate = date) => Boolean(getActiveStudentMaintenancePeriod(studentId, targetDate));

  const formatMaintenancePeriodLine = (period = {}) => {
    if (!period?.from || !period?.until) return 'mantenimiento temporal';
    return `mantenimiento temporal · ${formatDateSpanish(period.from)} - ${formatDateSpanish(period.until)}`;
  };

  const isLegacyPausedStillValid = (student = {}) => {
    if (student.isPaused !== true) return false;
    const studentInfo = globalStudents.find(g => g.id === student.id) || {};
    return studentInfo?.globalStatus === 'congelado';
  };

  const isAttendanceBlockedStudent = (student = {}, targetDate = date) => Boolean(
    student.isMaintenance ||
    isStudentInMaintenance(student.id, targetDate) ||
    isLegacyPausedStillValid(student)
  );

  const enrichStudentMaintenanceState = (studentEntry = {}, targetDate = date) => {
    const maintenancePeriod = getActiveStudentMaintenancePeriod(studentEntry.id, targetDate);
    if (!maintenancePeriod) return { ...studentEntry, isMaintenance: false, maintenancePeriod: null, maintenanceLabel: '' };

    return {
      ...studentEntry,
      isMaintenance: true,
      maintenancePeriod,
      maintenanceFrom: maintenancePeriod.from || '',
      maintenanceUntil: maintenancePeriod.until || '',
      maintenanceLabel: formatMaintenancePeriodLine(maintenancePeriod)
    };
  };

  const buildTemporaryRelocatedStudent = (relocation = {}) => {
    const studentInfo = globalStudents.find(s => s.id === relocation.studentId) || {};
    const displayName = studentInfo?.useAlias && studentInfo?.alias
      ? studentInfo.alias
      : (studentInfo?.name || relocation.studentName || 'Alumno');

    return {
      id: relocation.studentId,
      name: displayName,
      email: studentInfo?.email || relocation.studentEmail || '',
      isPaused: false,
      status: 'present',
      isTemporaryRelocation: true,
      temporaryRelocationId: relocation.id,
      temporaryFrom: relocation.from,
      temporaryUntil: relocation.until,
      sourceClassId: relocation.sourceClassId,
      targetClassId: relocation.targetClassId,
      sourceClassLine: relocation.sourceClassLine || '',
      targetClassLine: relocation.targetClassLine || '',
      relocationLabel: `Recolocado temporalmente aquí · ${formatDateSpanish(relocation.from)} - ${formatDateSpanish(relocation.until)}`
    };
  };

  const buildTemporaryRelocatedOutStudent = (studentEntry = {}, relocation = {}) => {
    const studentInfo = globalStudents.find(s => s.id === studentEntry.id || s.id === relocation.studentId) || {};
    const displayName = studentInfo?.useAlias && studentInfo?.alias
      ? studentInfo.alias
      : (studentInfo?.name || studentEntry.name || relocation.studentName || 'Alumno');

    return {
      ...studentEntry,
      id: studentEntry.id || relocation.studentId,
      name: displayName,
      email: studentInfo?.email || studentEntry.email || relocation.studentEmail || '',
      status: 'relocated_out',
      isTemporarilyRelocatedOut: true,
      temporaryRelocationId: relocation.id,
      temporaryFrom: relocation.from,
      temporaryUntil: relocation.until,
      sourceClassId: relocation.sourceClassId,
      targetClassId: relocation.targetClassId,
      sourceClassLine: relocation.sourceClassLine || '',
      targetClassLine: relocation.targetClassLine || '',
      nonComputableReason: 'relocated_out',
      nonComputableLabel: `Fuera temporalmente · ${formatDateSpanish(relocation.from)} - ${formatDateSpanish(relocation.until)}`
    };
  };

  const getStudentStartInfoLine = (student = {}) => {
    const startDate = student.classStartDate || student.startDate || '';
    return startDate ? `Inicio previsto: ${formatDateSpanish(startDate)}` : 'Inicio futuro';
  };

  const getStudentEndInfoLine = (student = {}) => {
    const endDate = student.classEndDate || student.scheduledEndDate || student.endDate || '';
    return endDate ? `Finalizó: ${formatDateSpanish(endDate)}` : 'Fin programado';
  };

  const getEffectiveStudentsForClass = (classData = {}, targetDate = date) => {
    const activeRelocations = getTemporaryRelocationsForDate(targetDate);

    const relocatedOutIds = new Set(
      activeRelocations
        .filter(rel => rel.sourceClassId === classData.id)
        .map(rel => rel.studentId)
    );

    const baseStudents = (classData.students || [])
      .filter(studentEntry => !relocatedOutIds.has(studentEntry.id))
      .filter(studentEntry => {
        const studentInfo = globalStudents.find(g => g.id === studentEntry.id) || {};
        if (studentInfo?.globalStatus === 'baja') return false;
        return isStudentClassActiveForDate(studentEntry, studentInfo, targetDate);
      })
      .map(studentEntry => enrichStudentMaintenanceState(studentEntry, targetDate));

    const relocatedIn = activeRelocations
      .filter(rel => rel.targetClassId === classData.id)
      .filter(rel => {
        const studentInfo = globalStudents.find(g => g.id === rel.studentId) || {};
        return studentInfo?.globalStatus !== 'baja';
      })
      .filter(rel => !baseStudents.some(studentEntry => studentEntry.id === rel.studentId))
      .map(rel => enrichStudentMaintenanceState(buildTemporaryRelocatedStudent(rel), targetDate));

    return [...baseStudents, ...relocatedIn];
  };

  const getEffectiveActiveStudentsForClass = (classData = {}, targetDate = date) => {
    return getEffectiveStudentsForClass(classData, targetDate).filter(s => {
      const studentInfo = globalStudents.find(g => g.id === s.id);
      return !isAttendanceBlockedStudent(s, targetDate) &&
        isStudentClassActiveForDate(s, studentInfo, targetDate) &&
        (!s.isRecovery || s.recoveryDate === targetDate);
    });
  };

  const sanitizeTemplateStudentForSave = (student = {}) => {
    const studentInfo = globalStudents.find(g => g.id === student.id) || {};
    const keepLegacyPaused = student.isPaused === true && studentInfo?.globalStatus === 'congelado';

    const cleanStudent = {
      id: student.id,
      name: student.name,
      email: student.email || '',
      isPaused: Boolean(keepLegacyPaused && !student.isMaintenance)
    };

    if (student.classStartDate) cleanStudent.classStartDate = student.classStartDate;
    if (student.startDate) cleanStudent.startDate = student.startDate;
    if (student.classEndDate) cleanStudent.classEndDate = student.classEndDate;
    if (student.scheduledEndDate) cleanStudent.scheduledEndDate = student.scheduledEndDate;
    if (student.endDate) cleanStudent.endDate = student.endDate;
    if (student.isRecovery) {
      cleanStudent.isRecovery = true;
      cleanStudent.recoveryDate = student.recoveryDate || null;
    }

    return cleanStudent;
  };

  const getTemplateStudentsForSave = (session = currentSession) => {
    const byKey = new Map();
    const addStudentToTemplate = (student = {}) => {
      if (!student?.id || student.isTemporaryRelocation) return;
      const studentInfo = globalStudents.find(g => g.id === student.id) || {};
      if (studentInfo?.globalStatus === 'baja') return;
      const key = student.isRecovery ? `${student.id}-recovery-${student.recoveryDate || ''}` : `${student.id}-fixed`;
      byKey.set(key, sanitizeTemplateStudentForSave(student));
    };

    (session?.formalTemplateStudents || []).forEach(student => {
      if (student?.isRecovery && student.recoveryDate === date) return;
      addStudentToTemplate(student);
    });

    (session?.hiddenStudents || []).forEach(student => {
      if (student?.isRecovery && student.recoveryDate === date) return;
      addStudentToTemplate(student);
    });

    (session?.nonComputableStudents || []).forEach(student => {
      if (student?.isRecovery && student.recoveryDate === date) return;
      addStudentToTemplate(student);
    });

    (session?.students || [])
      .filter(student => !student.isRecovery && !student.isTemporaryRelocation)
      .forEach(addStudentToTemplate);

    return Array.from(byKey.values());
  };

  const getCapacityCountForSession = (session = currentSession) => {
    if (!session) return 0;

    const byId = new Map();
    const addCapacityStudent = (student = {}) => {
      if (!student?.id || student.isRecovery || student.isTemporaryRelocation) return;
      const studentInfo = globalStudents.find(g => g.id === student.id) || {};
      if (studentInfo?.globalStatus === 'baja') return;
      if (hasClassEndedBeforeDate(student, studentInfo, date)) return;
      byId.set(student.id, student);
    };

    (session.formalTemplateStudents || []).forEach(addCapacityStudent);
    (session.hiddenStudents || []).forEach(addCapacityStudent);
    (session.nonComputableStudents || []).forEach(addCapacityStudent);
    (session.students || []).forEach(addCapacityStudent);

    return byId.size;
  };

  const getSubstitutionStatus = (sub = {}) => {
    if (sub.status) return sub.status;
    if (sub.assumedAt || sub.assumedByUid || sub.assumedTeacherName) return 'assigned';
    return 'open';
  };

  const isOwnSubstitution = (sub = {}) => {
    const teacherName = getTeacherName().toLowerCase();
    return Boolean(
      (sub.originalTeacherUid && sub.originalTeacherUid === user?.uid) ||
      (sub.originalTeacherEmail && String(sub.originalTeacherEmail).toLowerCase() === String(user?.email || '').toLowerCase()) ||
      (sub.originalTeacherName && String(sub.originalTeacherName).toLowerCase() === teacherName)
    );
  };

  const getSubstitutionStudentStats = (sub = {}) => {
    const studentsList = Array.isArray(sub.students) ? sub.students : [];
    const total = Number.isFinite(Number(sub.studentCount)) ? Number(sub.studentCount) : studentsList.length;
    const active = Number.isFinite(Number(sub.activeStudentCount))
      ? Number(sub.activeStudentCount)
      : studentsList.filter(student => !isAttendanceBlockedStudent(student, sub.date) && (!student.isRecovery || student.recoveryDate === sub.date)).length;
    const maintenance = Number.isFinite(Number(sub.maintenanceStudentCount))
      ? Number(sub.maintenanceStudentCount)
      : studentsList.filter(student => isAttendanceBlockedStudent(student, sub.date)).length;

    return { total, active, maintenance };
  };

  const formatAttendanceStudentName = (student = {}) => {
    const tags = [];
    if (student.isRecovery) tags.push('Recuperación');
    if (student.isTemporaryRelocation) tags.push('Recolocado temporalmente');
    if (student.isMaintenance) tags.push('Mantenimiento temporal');
    return `${student.name}${tags.length ? ` (${tags.join(' · ')})` : ''}`;
  };

  const getRecoveryTicketInfo = (gestion = {}) => {
    const recoveryDate = gestion.recoveryDate || date;
    const today = new Date().toISOString().split('T')[0];

    const validTickets = tickets.filter(t =>
      t.studentId === gestion.studentId &&
      !t.isUsed &&
      !t.voided &&
      (!t.validFrom || t.validFrom <= recoveryDate) &&
      (!t.validUntil || t.validUntil >= recoveryDate)
    );

    const committedRequests = gestiones.filter(g =>
      g.id !== gestion.id &&
      g.studentId === gestion.studentId &&
      g.type === 'recuperacion' &&
      (g.status === 'pendiente' || g.status === 'completado') &&
      (!g.recoveryDate || g.recoveryDate >= today)
    ).length;

    return {
      valid: validTickets.length,
      committed: committedRequests,
      free: Math.max(validTickets.length - committedRequests, 0)
    };
  };

  const getClassOccupancyForDate = (clase = {}, targetDate = date) => {
    const studentsForDate = getEffectiveStudentsForClass(clase, targetDate);

    const visibleStudents = studentsForDate.filter(s => {
      const studentInfo = globalStudents.find(g => g.id === s.id);
      return !isAttendanceBlockedStudent(s, targetDate) &&
        isStudentClassActiveForDate(s, studentInfo, targetDate) &&
        (!s.isRecovery || s.recoveryDate === targetDate);
    });
    const fixedStudentIds = new Set(studentsForDate
      .filter(s => {
        const studentInfo = globalStudents.find(g => g.id === s.id);
        return !s.isRecovery && !s.isTemporaryRelocation && isStudentClassActiveForDate(s, studentInfo, targetDate);
      })
      .map(s => s.id));

    return {
      count: visibleStudents.length,
      fixedStudentIds,
      capacity: parseInt(clase.capacity, 10) || 0
    };
  };

  const approveRecoveryRequest = async (gestion) => {
    if (!gestion?.id) return;

    const targetClass = getRecoveryClass(gestion);
    if (!targetClass?.refPath) {
      showNotification({ type: 'error', text: 'No se ha encontrado la clase de destino.' });
      return;
    }

    const recoveryDate = gestion.recoveryDate;
    if (!recoveryDate) {
      showNotification({ type: 'error', text: 'La solicitud no tiene fecha de recuperación.' });
      return;
    }

    const studentInfo = globalStudents.find(s => s.id === gestion.studentId);
    if (studentInfo?.globalStatus === 'baja' || studentInfo?.globalStatus === 'impago' || studentInfo?.globalStatus === 'congelado' || isStudentInMaintenance(gestion.studentId, recoveryDate)) {
      showNotification({ type: 'error', text: 'El alumno no está operativo para recuperación en esa fecha. Coordina la recuperación desde administración.' });
      return;
    }

    const ticketInfo = getRecoveryTicketInfo(gestion);
    if (ticketInfo.free <= 0) {
      showNotification({ type: 'error', text: 'El alumno no tiene tickets libres válidos para esa fecha.' });
      return;
    }

    const occupancy = getClassOccupancyForDate(targetClass, recoveryDate);
    if (occupancy.fixedStudentIds.has(gestion.studentId)) {
      showNotification({ type: 'error', text: 'El alumno ya pertenece de forma fija a esta clase.' });
      return;
    }

    const alreadyScheduled = (targetClass.students || []).some(s =>
      s.id === gestion.studentId &&
      s.isRecovery &&
      s.recoveryDate === recoveryDate
    );

    if (!alreadyScheduled && occupancy.capacity > 0 && occupancy.count >= occupancy.capacity) {
      showNotification({ type: 'error', text: 'La clase ya está completa para ese día.' });
      return;
    }

    const ok = window.confirm(`¿Aceptar la recuperación de ${gestion.studentName || 'este alumno'}?

${gestion.requestedClassLine || formatClassSummary(targetClass)}
Fecha: ${formatDateSpanish(recoveryDate)}

El alumno aparecerá en tu lista solo ese día. El ticket se consumirá únicamente si asiste y guardas la asistencia.`);
    if (!ok) return;

    try {
      if (!alreadyScheduled) {
        const displayName = studentInfo?.useAlias && studentInfo?.alias ? studentInfo.alias : (studentInfo?.name || gestion.studentName || 'Alumno');
        const email = studentInfo?.email || gestion.studentEmail || '';

        const recoveryStudent = {
          id: gestion.studentId,
          name: displayName,
          email,
          isPaused: false,
          status: 'present',
          isRecovery: true,
          recoveryDate
        };

        await updateDoc(doc(db, targetClass.refPath), {
          students: [...(targetClass.students || []).filter(s => !(s.id === gestion.studentId && s.isRecovery && s.recoveryDate === recoveryDate)), recoveryStudent]
        });
      }

      await updateDoc(doc(db, 'artifacts', appId, 'gestiones', gestion.id), {
        status: 'completado',
        approvedByTeacher: true,
        approvedBy: user?.email || getTeacherName(),
        approvedAt: new Date().toISOString(),
        teacherDecision: 'aprobada'
      });

      showNotification({ type: 'success', text: 'Recuperación aceptada. Aparecerá en tu lista el día indicado.' });
    } catch (e) {
      console.error('Error al aprobar recuperación', e);
      showNotification({ type: 'error', text: 'No se pudo aprobar la recuperación.' });
    }
  };

  const rejectRecoveryRequest = async (gestion) => {
    if (!gestion?.id) return;
    const reason = window.prompt(`Motivo del rechazo para ${gestion.studentName || 'el alumno'} (opcional):`, '');
    if (reason === null) return;

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'gestiones', gestion.id), {
        status: 'rechazado',
        rejectedByTeacher: true,
        rejectedBy: user?.email || getTeacherName(),
        rejectedAt: new Date().toISOString(),
        rejectionReason: String(reason || '').trim(),
        teacherDecision: 'rechazada'
      });
      showNotification({ type: 'success', text: 'Recuperación rechazada.' });
    } catch (e) {
      console.error('Error al rechazar recuperación', e);
      showNotification({ type: 'error', text: 'No se pudo rechazar la recuperación.' });
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
        .map(s => `- ${formatAttendanceStudentName(s)}`)
        .join('\n') || '- Ninguno';

      const notified = students
        .filter(s => s.status === 'notified')
        .map(s => `- ${formatAttendanceStudentName(s)}`)
        .join('\n') || '- Ninguno';

      const absent = students
        .filter(s => s.status === 'absent')
        .map(s => `- ${formatAttendanceStudentName(s)}`)
        .join('\n') || '- Ninguno';

      const nonComputableInfo = record.isRenounced
        ? getNonComputableInfo(record.nonComputableReason || 'legacy_renounced')
        : null;
      const hourStatus = record.isRenounced
        ? `NO COMPUTABLE - ${record.nonComputableLabel || nonComputableInfo.label}`
        : (record.isDeadHourWorked ? 'COMPUTABLE - Hora muerta trabajada' : 'COMPUTABLE');
      const reasonLine = record.isRenounced
        ? `\nMotivo no computable: ${record.nonComputableDetail || nonComputableInfo.detail}`
        : (record.isDeadHourWorked && record.deadHourNote ? `\nHora muerta realizada: ${record.deadHourNote}` : '');
      const notesFreshnessLine = buildNotesFreshnessLine(record.classNotesUpdatedAt || record.notesUpdatedAt);
      const reportNotes = cleanAttendanceNotesForReport(record);

      return `
CLASE: ${record.time} - ${record.subject} ${record.isRenounced ? '(NO COMPUTABLE)' : ''}
Sede: ${record.sede || 'Tarragona'} (${record.sala || 'Sala 1'})
Profesor: ${record.teacher}
Estado de hora: ${hourStatus}${reasonLine}
Total alumnos: ${students.length}
Anotaciones: ${reportNotes}
${notesFreshnessLine}

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

      const activeCount = getEffectiveActiveStudentsForClass(item.data, date).length;
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
    const monthlyComputableHours = monthlyPayroll.realHours;
    const dailyComputableHours = getComputableHoursFromRecords(recordsForSelectedDate).toFixed(2);

    const payload = {
      profesor: getTeacherName(),
      profesorEmail: user.email,
      fecha: formatDateSpanish(date),
      horas: `${monthlyComputableHours}\nHoras declaradas del día: ${dailyComputableHours}`,
      horasAcumuladasMes: monthlyComputableHours,
      horasDia: dailyComputableHours,
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
    const activeRelocations = getTemporaryRelocationsForDate(date);
    const relocatedOutByStudentId = new Map(
      activeRelocations
        .filter(rel => rel.sourceClassId === scheduledClass.id)
        .map(rel => [rel.studentId, rel])
    );

    const visibleStudents = [];
    const nonComputableStudents = [];
    const hiddenStudents = [];

    const pushNonComputableStudent = (student = {}) => {
      nonComputableStudents.push(student);
      hiddenStudents.push(student);
    };

    (scheduledClass.students || []).forEach(studentEntry => {
      const globalStudentInfo = globalStudents.find(g => g.id === studentEntry.id) || {};
      if (globalStudentInfo?.globalStatus === 'baja') return;
      const enrichedStudent = enrichStudentMaintenanceState(studentEntry, date);
      const relocationOut = relocatedOutByStudentId.get(studentEntry.id);

      if (studentEntry.isRecovery && studentEntry.recoveryDate && studentEntry.recoveryDate !== date) {
        pushNonComputableStudent({
          ...enrichedStudent,
          status: 'recovery_other_day',
          nonComputableReason: 'recovery_other_day',
          nonComputableLabel: `Recuperación prevista para ${formatDateSpanish(studentEntry.recoveryDate)}`
        });
        return;
      }

      if (!hasClassStartedForDate(studentEntry, globalStudentInfo, date)) {
        pushNonComputableStudent({
          ...enrichedStudent,
          status: 'future_start',
          isFutureStartHidden: true,
          nonComputableReason: 'future_start',
          nonComputableLabel: getStudentStartInfoLine(studentEntry)
        });
        return;
      }

      if (hasClassEndedBeforeDate(studentEntry, globalStudentInfo, date)) {
        pushNonComputableStudent({
          ...enrichedStudent,
          status: 'ended',
          isEndedHidden: true,
          nonComputableReason: 'ended',
          nonComputableLabel: getStudentEndInfoLine(studentEntry)
        });
        return;
      }

      if (relocationOut) {
        pushNonComputableStudent(buildTemporaryRelocatedOutStudent(enrichedStudent, relocationOut));
        return;
      }

      if (isAttendanceBlockedStudent(enrichedStudent, date)) {
        pushNonComputableStudent({
          ...enrichedStudent,
          status: 'paused',
          nonComputableReason: enrichedStudent.isMaintenance ? 'maintenance' : 'blocked',
          nonComputableLabel: enrichedStudent.maintenanceLabel || 'En mantenimiento'
        });
        return;
      }

      let currentStatus = 'present';
      if (exceptionsToday[studentEntry.id]) {
        currentStatus = exceptionsToday[studentEntry.id] === 'notified_no_ticket' ? 'notified' : exceptionsToday[studentEntry.id];
      }
      visibleStudents.push({
        ...enrichedStudent,
        status: currentStatus,
        originalException: exceptionsToday[studentEntry.id] || null
      });
    });

    activeRelocations
      .filter(rel => rel.targetClassId === scheduledClass.id)
      .filter(rel => !visibleStudents.some(studentEntry => studentEntry.id === rel.studentId))
      .filter(rel => !nonComputableStudents.some(studentEntry => studentEntry.id === rel.studentId && studentEntry.temporaryRelocationId === rel.id))
      .forEach(rel => {
        const relocatedStudent = enrichStudentMaintenanceState(buildTemporaryRelocatedStudent(rel), date);
        const globalStudentInfo = globalStudents.find(g => g.id === relocatedStudent.id) || {};
        if (globalStudentInfo?.globalStatus === 'baja') return;

        if (isAttendanceBlockedStudent(relocatedStudent, date) || !isStudentClassActiveForDate(relocatedStudent, globalStudentInfo, date)) {
          pushNonComputableStudent({
            ...relocatedStudent,
            status: 'paused',
            nonComputableReason: relocatedStudent.isMaintenance ? 'maintenance' : 'blocked',
            nonComputableLabel: relocatedStudent.maintenanceLabel || 'Recolocado temporalmente aquí, pero no computa hoy'
          });
          return;
        }

        let currentStatus = 'present';
        if (exceptionsToday[rel.studentId]) {
          currentStatus = exceptionsToday[rel.studentId] === 'notified_no_ticket' ? 'notified' : exceptionsToday[rel.studentId];
        }

        visibleStudents.push({
          ...relocatedStudent,
          status: currentStatus,
          originalException: exceptionsToday[rel.studentId] || null
        });
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
      originalNotes: scheduledClass.notes || '',
      resources: Array.isArray(scheduledClass.resources) ? scheduledClass.resources : [],
      notesUpdatedAt: scheduledClass.notesUpdatedAt || null,
      notesUpdatedBy: scheduledClass.notesUpdatedBy || '',
      notesUpdatedByName: scheduledClass.notesUpdatedByName || '',
      dayOfWeek: scheduledClass.dayOfWeek,
      date: scheduledClass.date || null,
      isRecurring: !scheduledClass.date,
      exceptions: scheduledClass.exceptions || {},
      students: visibleStudents,
      nonComputableStudents,
      hiddenStudents,
      formalTemplateStudents: (scheduledClass.students || []).filter(studentEntry => {
        const studentInfo = globalStudents.find(g => g.id === studentEntry.id) || {};
        return studentInfo?.globalStatus !== 'baja';
      }),
      hasTemporaryRelocations: activeRelocations.some(rel => rel.sourceClassId === scheduledClass.id || rel.targetClassId === scheduledClass.id),
      hasMaintenancePeriods: [...visibleStudents, ...nonComputableStudents].some(student => student.isMaintenance),
      pendingPlanningGestiones: getPlanningGestionesForClass(scheduledClass),
      newStudentName: '',
      newStudentEmail: '',
      isAddingRecovery: false,
      cancelledDates: scheduledClass.cancelledDates || []
    });
  };

  const assumeSubstitution = async (sub) => {
    if (!user || !sub?.id) return;

    if (isOwnSubstitution(sub)) {
      showNotification({ type: 'error', text: 'No puedes asumir una sustitución que has abierto tú mismo.' });
      return;
    }

    const stats = getSubstitutionStudentStats(sub);
    if (stats.active <= 0) {
      showNotification({ type: 'error', text: 'Esta sustitución no tiene alumnos activos reales para cubrir.' });
      return;
    }

    if (!window.confirm(`¿Asumir la sustitución de ${sub.subject} el ${formatDateSpanish(sub.date)} a las ${sub.time}h?

Esta clase pasará a tu agenda y serás el profesor responsable.

Alumnos activos reales: ${stats.active}${stats.total !== stats.active ? ` / ${stats.total} en lista` : ''}.`)) return;

    try {
      const newClassId = `assumed-${sub.id}`;
      const targetUid = user.uid;
      const substitutionRef = doc(db, 'artifacts', appId, 'substitutions', sub.id);
      const assumedClassRef = doc(db, 'artifacts', appId, 'users', targetUid, 'recurringClasses', newClassId);
      const assumedClassRefPath = `artifacts/${appId}/users/${targetUid}/recurringClasses/${newClassId}`;
      const now = new Date().toISOString();

      await runTransaction(db, async (transaction) => {
        const subSnap = await transaction.get(substitutionRef);
        if (!subSnap.exists()) {
          throw new Error('Esta sustitución ya no está disponible.');
        }

        const latestSub = { id: subSnap.id, ...subSnap.data() };
        const latestStatus = getSubstitutionStatus(latestSub);
        const latestStats = getSubstitutionStudentStats(latestSub);

        if (latestStatus !== 'open') {
          throw new Error('Esta sustitución ya ha sido asumida o cerrada.');
        }

        if (isOwnSubstitution(latestSub)) {
          throw new Error('No puedes asumir una sustitución que has abierto tú mismo.');
        }

        if (latestStats.active <= 0) {
          throw new Error('Esta sustitución no tiene alumnos activos reales para cubrir.');
        }

        const exceptionsForDate = latestSub.exceptionsForDate || {};
        const hasExceptionsForDate = Object.keys(exceptionsForDate).length > 0;
        const autoCancelledForDate = Boolean(latestSub.autoCancelledForDate);

        transaction.set(assumedClassRef, {
          id: newClassId,
          isRecurring: false,
          date: latestSub.date,
          dayOfWeek: getDayOfWeek(latestSub.date),
          time: latestSub.time,
          sede: latestSub.sede || 'Tarragona',
          sala: latestSub.sala || 'Sala 1',
          teacher: getTeacherName(),
          subject: latestSub.subject,
          capacity: latestSub.capacity || '',
          duration: latestSub.duration || 60,
          notes: latestSub.notes || '',
          originalNotes: latestSub.originalNotes || latestSub.notes || '',
          resources: Array.isArray(latestSub.resources) ? latestSub.resources : [],
          notesUpdatedAt: latestSub.notesUpdatedAt || null,
          notesUpdatedBy: latestSub.notesUpdatedBy || '',
          notesUpdatedByName: latestSub.notesUpdatedByName || '',
          students: latestSub.students || [],
          exceptions: hasExceptionsForDate ? { [latestSub.date]: exceptionsForDate } : {},
          autoCancelled: autoCancelledForDate ? { [latestSub.date]: true } : {},
          cancelledDates: [],
          isWebVisible: false,
          sourceSubstitutionId: latestSub.id,
          originalClassId: latestSub.originalClassId || '',
          originalTeacherUid: latestSub.originalTeacherUid || '',
          originalTeacherName: latestSub.originalTeacherName || ''
        });

        transaction.update(substitutionRef, {
          status: 'assigned',
          assumedAt: now,
          assumedByUid: user.uid,
          assumedByEmail: user.email || '',
          assumedTeacherName: getTeacherName(),
          assumedClassId: newClassId,
          assumedClassRefPath
        });
      });

      showNotification({ type: 'success', text: 'Clase añadida a tu agenda. Puedes seleccionarla el día que corresponda.' });
    } catch (e) {
      console.error('Error al asumir sustitución', e);
      showNotification({ type: 'error', text: e.message || 'Error al asumir la clase.' });
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
          internalNotes: '',
          classStartDate: '' 
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
          classStartDate: existingStudent?.classStartDate || '',
          status: 'present',
          isRecovery: currentSession.isAddingRecovery || false,
          recoveryDate: currentSession.isAddingRecovery ? date : null, 
          isPaused: false,
          ...enrichStudentMaintenanceState({ id: studentId }, date)
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
    if (getCapacityCountForSession(currentSession) > parseInt(currentSession.capacity, 10)) {
      showNotification({ type: 'error', text: 'Hay más alumnos que la capacidad permitida.' });
      return;
    }

    const dayToSave = currentSession.dayOfWeek;

    try {
      const templateStudents = getTemplateStudentsForSave(currentSession);

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

      const notesChanged = String(currentSession.notes || '') !== String(currentSession.originalNotes || '');
      const notesUpdatePayload = notesChanged ? {
        notesUpdatedAt: new Date().toISOString(),
        notesUpdatedBy: user.email,
        notesUpdatedByName: getTeacherName()
      } : {};

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
        ...notesUpdatePayload,
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
    if (getCapacityCountForSession(currentSession) > parseInt(currentSession.capacity, 10)) {
      showNotification({ type: 'error', text: 'Hay más alumnos que la capacidad permitida.' });
      return;
    }

    const confirmacion = window.confirm("⚠️ ATENCIÓN: ESTA ACCIÓN NO SE PUEDE DESHACER.\n\nRevisa bien quién está presente, quién avisó y quién ha faltado sin avisar.\n\n¿Estás seguro de que quieres guardar la lista definitivamente?");
    if (!confirmacion) return;

    const activeStudents = currentSession.students.filter(s => !isAttendanceBlockedStudent(s, date));
    const allAbsent = activeStudents.length > 0 && activeStudents.every(s => s.status === 'absent' || s.status === 'notified');
    
    if (allAbsent) {
      if (currentSession.isAutoCancelled) {
        showNotification({ type: 'success', text: "Clase auto-cancelada. Hora no computable registrada." });
        executeSaveRecord(null, true, { nonComputableReason: 'auto_cancelled_all_notified' });
        return;
      }

      const laterPayableClassesToday = dashboardItems.filter(item => {
        const itemTime = item.data?.time || '';
        if (!itemTime || itemTime <= currentSession.time) return false;

        const activeCount = getEffectiveActiveStudentsForClass(item.data, date).length;
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
        executeSaveRecord(null, true, { nonComputableReason: 'last_hour_all_absent' });
      } else {
        const configuredTasks = Array.isArray(settings.generalTasks) ? settings.generalTasks.filter(Boolean) : [];
        const combinedTasks = configuredTasks.length > 0 ? configuredTasks : DEFAULT_DEAD_HOUR_TASKS;
        setDeadHourModal({ tasks: combinedTasks, subject: currentSession.subject });
      }
    } else {
      executeSaveRecord(null, false);
    }
  };

  const createRepeatedAbsenceAlerts = async (savedRecord) => {
    if (!savedRecord?.classId || isPunctualClass(currentSession)) return;

    const recordsBySession = new Map();
    [...records, savedRecord]
      .filter(record => record.classId === savedRecord.classId)
      .forEach(record => {
        const sessionKey = `${record.classId}|${record.date || ''}|${record.time || ''}`;
        recordsBySession.set(sessionKey, record);
      });

    const classRecords = [...recordsBySession.values()]
      .sort((a, b) => new Date(`${b.date || ''}T${b.time || '00:00'}`) - new Date(`${a.date || ''}T${a.time || '00:00'}`));

    const candidates = (savedRecord.students || []).filter(student =>
      student.status === 'absent' &&
      !student.isRecovery &&
      !student.isMaintenance &&
      !student.isPaused
    );

    for (const student of candidates) {
      const streakRecords = [];

      for (const record of classRecords) {
        const attendance = (record.students || []).find(entry => entry.id === student.id);
        if (!attendance) break;
        if (
          attendance.status !== 'absent' ||
          attendance.isRecovery ||
          attendance.isMaintenance ||
          attendance.isPaused
        ) break;
        streakRecords.push(record);
      }

      if (streakRecords.length < 4) continue;

      const streakStartDate = streakRecords[streakRecords.length - 1]?.date || savedRecord.date;
      const absenceDates = streakRecords.map(record => record.date).filter(Boolean).reverse();
      const safeAlertId = `falta-reiterada-${savedRecord.classId}-${student.id}-${streakStartDate}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const teacherName = currentSession.teacher || getTeacherName();
      const teacherEmail = String(user?.email || '').trim().toLowerCase();
      const studentInfo = globalStudents.find(item => item.id === student.id) || {};
      const now = new Date().toISOString();
      const classLine = `${savedRecord.subject || 'Clase'} · ${getDayName(currentSession.dayOfWeek)} · ${savedRecord.time || ''}h · ${savedRecord.sede || 'Tarragona'}${savedRecord.sala ? ` · ${savedRecord.sala}` : ''}`;
      const details = `${student.name} acumula ${streakRecords.length} clases consecutivas sin asistir ni avisar.\n\nClase: ${classLine}\nFechas de la racha: ${absenceDates.map(formatDateSpanish).join(', ')}\n\nAviso informativo para valorar si conviene ponerse en contacto con el alumno o la familia.`;
      const teacherNotificationRef = doc(db, 'artifacts', appId, 'teacherNotifications', safeAlertId);
      const adminGestionRef = doc(db, 'artifacts', appId, 'gestiones', safeAlertId);

      await runTransaction(db, async transaction => {
        const [teacherNotificationSnap, adminGestionSnap] = await Promise.all([
          transaction.get(teacherNotificationRef),
          transaction.get(adminGestionRef)
        ]);

        if (!teacherNotificationSnap.exists()) {
          transaction.set(teacherNotificationRef, {
            teacherName,
            teacherNameNormalized: String(teacherName || '').trim().toLowerCase(),
            teacherEmail,
            title: `4 faltas sin avisar: ${student.name}`,
            body: details,
            type: 'falta_reiterada',
            status: 'unread',
            studentId: student.id,
            studentName: student.name,
            classId: savedRecord.classId,
            classLine,
            streakStartDate,
            streakCount: streakRecords.length,
            absenceDates,
            createdAt: now,
            createdBy: user?.email || teacherName,
            source: 'attendance_system'
          });
        } else {
          transaction.set(teacherNotificationRef, {
            streakCount: streakRecords.length,
            absenceDates,
            lastAbsenceDate: savedRecord.date,
            updatedAt: now
          }, { merge: true });
        }

        if (!adminGestionSnap.exists()) {
          transaction.set(adminGestionRef, {
            type: 'falta_reiterada',
            status: 'pendiente',
            title: `4 faltas sin avisar: ${student.name}`,
            details,
            informational: true,
            requiresAction: false,
            keepUntilAdminAcknowledges: true,
            studentId: student.id,
            studentName: student.name,
            studentEmail: studentInfo.email || student.email || '',
            requestedClass: savedRecord.classId,
            requestedClassLine: classLine,
            requestedTeacher: teacherName,
            streakStartDate,
            streakCount: streakRecords.length,
            absenceDates,
            date: now,
            source: 'attendance_system',
            createdAt: now,
            createdBy: user?.email || teacherName
          });
        } else {
          transaction.set(adminGestionRef, {
            streakCount: streakRecords.length,
            absenceDates,
            lastAbsenceDate: savedRecord.date,
            updatedAt: now
          }, { merge: true });
        }
      });
    }
  };

  const executeSaveRecord = async (deadHourNote = null, isRenounced = false, options = {}) => {
    try {
      const recordId = Date.now().toString();
      const currentMonth = date.substring(0, 7);
      
      const nonComputableReason = isRenounced
        ? (options.nonComputableReason || 'teacher_renounced_dead_hour')
        : null;
      const nonComputableInfo = nonComputableReason ? getNonComputableInfo(nonComputableReason) : null;

      const finalNotes = currentSession.notes || '';

      const notesChanged = String(currentSession.notes || '') !== String(currentSession.originalNotes || '');
      const notesUpdatePayload = notesChanged ? {
        notesUpdatedAt: new Date().toISOString(),
        notesUpdatedBy: user.email,
        notesUpdatedByName: getTeacherName()
      } : {};
      const effectiveNotesUpdatedAt = notesUpdatePayload.notesUpdatedAt || currentSession.notesUpdatedAt || null;
      const effectiveNotesUpdatedBy = notesUpdatePayload.notesUpdatedBy || currentSession.notesUpdatedBy || '';
      const effectiveNotesUpdatedByName = notesUpdatePayload.notesUpdatedByName || currentSession.notesUpdatedByName || '';

      const targetUid = user.uid;

      const ticketPromises = currentSession.students.map(async (s) => {
        // 👇 FIX: Solo le damos ticket si el status es 'notified' pero NO era un aviso sin derecho a ticket ('notified_no_ticket')
        if (s.status === 'notified' && s.originalException !== 'notified_no_ticket' && !s.isRecovery && !isAttendanceBlockedStudent(s, date)) {
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

      const savedRecord = {
        id: recordId,
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
        classNotes: currentSession.notes || '',
        classNotesUpdatedAt: effectiveNotesUpdatedAt,
        classNotesUpdatedBy: effectiveNotesUpdatedBy,
        classNotesUpdatedByName: effectiveNotesUpdatedByName,
        isRenounced: isRenounced,
        isNonComputable: isRenounced,
        nonComputableReason: nonComputableReason || '',
        nonComputableLabel: nonComputableInfo?.label || '',
        nonComputableDetail: nonComputableInfo?.detail || '',
        deadHourNote: !isRenounced && deadHourNote ? deadHourNote : '',
        isDeadHourWorked: Boolean(!isRenounced && deadHourNote),
        students: currentSession.students.map(s => ({ ...s }))
      };

      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'records', recordId), savedRecord);

      const templateStudents = getTemplateStudentsForSave(currentSession);

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
        ...notesUpdatePayload,
        cancelledDates: currentSession.cancelledDates || [],
        students: templateStudents,
        exceptions: currentSession.exceptions || {}
      }, { merge: true });

      try {
        await createRepeatedAbsenceAlerts(savedRecord);
      } catch (alertError) {
        console.error('La asistencia se guardó, pero no se pudo crear el aviso de faltas reiteradas:', alertError);
      }

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
    const subId = `${classData.id}-${date}`;
    const existingSubstitution = substitutions.find(sub => sub.id === subId && !['cancelled', 'expired'].includes(getSubstitutionStatus(sub)));

    if (existingSubstitution) {
      const existingStatus = getSubstitutionStatus(existingSubstitution);
      showNotification({
        type: 'error',
        text: existingStatus === 'open'
          ? 'Esta clase ya está abierta en la Bolsa de Sustituciones.'
          : 'Esta clase ya fue asumida por otro profesor.'
      });
      return;
    }

    const effectiveStudents = getEffectiveStudentsForClass(classData, date);
    const activeStudents = getEffectiveActiveStudentsForClass(classData, date);
    const maintenanceStudentCount = effectiveStudents.filter(student => student.isMaintenance || student.isPaused).length;
    const exceptionsForDate = classData.exceptions?.[date] || {};
    const autoCancelledForDate = Boolean(classData.autoCancelled?.[date]);

    const isConfirmed = window.confirm(`¿Seguro que quieres cancelar la clase de ${classData.subject} solo por hoy? (Estará libre para sustituciones)

Alumnos activos reales: ${activeStudents.length}${effectiveStudents.length !== activeStudents.length ? ` / ${effectiveStudents.length} en lista` : ''}.`);
    if (!isConfirmed) return;

    try {
      await setDoc(doc(db, 'artifacts', appId, 'substitutions', subId), {
        status: 'open',
        originalClassId: classData.id,
        originalClassRefPath: classData.refPath || '',
        originalTeacherUid: user.uid,
        originalTeacherEmail: user.email || '',
        originalTeacherName: classData.teacher || getTeacherName(),
        date: date,
        time: classData.time,
        sede: classData.sede || 'Tarragona',
        sala: classData.sala || 'Sala 1',
        subject: classData.subject,
        capacity: classData.capacity || '',
        duration: classData.duration || 60,
        notes: classData.notes || '',
        originalNotes: classData.originalNotes || classData.notes || '',
        resources: Array.isArray(classData.resources) ? classData.resources : [],
        notesUpdatedAt: classData.notesUpdatedAt || null,
        notesUpdatedBy: classData.notesUpdatedBy || '',
        notesUpdatedByName: classData.notesUpdatedByName || '',
        students: effectiveStudents,
        studentCount: effectiveStudents.length,
        activeStudentCount: activeStudents.length,
        maintenanceStudentCount,
        exceptionsForDate,
        autoCancelledForDate,
        createdAt: new Date().toISOString(),
        createdByUid: user.uid,
        createdByEmail: user.email || '',
        createdByName: getTeacherName()
      });

      if (classData.date) {
        await deleteDoc(doc(db, classData.refPath));
      } else {
        const updatedCancelledDates = [...new Set([...(classData.cancelledDates || []), date])];
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

  const getResourceAssignableStudents = (session = currentSession) => {
    const byId = new Map();
    const addStudent = (student = {}) => {
      if (!student?.id) return;
      const studentInfo = globalStudents.find(g => g.id === student.id) || {};
      if (studentInfo?.globalStatus === 'baja') return;
      const displayName = studentInfo?.useAlias && studentInfo?.alias
        ? studentInfo.alias
        : (studentInfo?.name || student.name || 'Alumno');
      byId.set(student.id, { id: student.id, name: displayName });
    };

    (session?.formalTemplateStudents || []).forEach(addStudent);
    (session?.students || []).forEach(addStudent);
    (session?.nonComputableStudents || []).forEach(addStudent);

    return Array.from(byId.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  };

  const getSafeClassResourceUrl = (url = '') => {
    const cleanUrl = String(url || '').trim();
    if (!/^https?:\/\//i.test(cleanUrl)) return '';
    return cleanUrl;
  };

  const getClassResourceAudienceLabel = (resource = {}) => {
    if (resource.targetScope === 'teachers') return 'Solo profesores';
    if (resource.targetScope === 'students') {
      const names = Array.isArray(resource.targetStudentNames) && resource.targetStudentNames.length > 0
        ? resource.targetStudentNames
        : (resource.targetStudentIds || []).map(id => globalStudents.find(s => s.id === id)?.name).filter(Boolean);
      return names.length > 0 ? `Alumnos concretos: ${names.join(', ')}` : 'Alumnos concretos';
    }
    return 'Toda la clase';
  };

  const resetResourceForm = () => {
    setResourceForm(EMPTY_RESOURCE_FORM);
    setShowResourceForm(false);
  };

  const openNewResourceForm = () => {
    setResourceForm(EMPTY_RESOURCE_FORM);
    setShowResourceForm(true);
  };

  const openEditResourceForm = (resource = {}) => {
    setResourceForm({
      id: resource.id || null,
      title: resource.title || '',
      url: resource.url || '',
      type: resource.type || 'pdf',
      targetScope: resource.targetScope || (resource.visibleToStudents === false ? 'teachers' : 'class'),
      targetStudentIds: Array.isArray(resource.targetStudentIds) ? resource.targetStudentIds : [],
      notes: resource.notes || ''
    });
    setShowResourceForm(true);
  };

  const toggleResourceTargetStudent = (studentId) => {
    setResourceForm(prev => {
      const currentIds = new Set(prev.targetStudentIds || []);
      if (currentIds.has(studentId)) currentIds.delete(studentId);
      else currentIds.add(studentId);
      return { ...prev, targetStudentIds: Array.from(currentIds) };
    });
  };

  const saveClassResource = async () => {
    if (!currentSession?.refPath || isSavingResource) return;

    const title = resourceForm.title.trim();
    const url = resourceForm.url.trim();
    const safeUrl = getSafeClassResourceUrl(url);

    if (!title) {
      showNotification({ type: 'error', text: 'Escribe un título para el recurso.' });
      return;
    }
    if (!safeUrl) {
      showNotification({ type: 'error', text: 'Pega un enlace válido que empiece por http:// o https://.' });
      return;
    }
    if (resourceForm.targetScope === 'students' && (resourceForm.targetStudentIds || []).length === 0) {
      showNotification({ type: 'error', text: 'Selecciona al menos un alumno destinatario.' });
      return;
    }

    setIsSavingResource(true);
    const now = new Date().toISOString();
    const assignableStudents = getResourceAssignableStudents(currentSession);
    const targetStudentIds = resourceForm.targetScope === 'students' ? (resourceForm.targetStudentIds || []) : [];
    const targetStudentNames = targetStudentIds
      .map(id => assignableStudents.find(s => s.id === id)?.name || globalStudents.find(s => s.id === id)?.name || '')
      .filter(Boolean);
    const resources = Array.isArray(currentSession.resources) ? currentSession.resources : [];
    const previousResource = resources.find(r => r.id === resourceForm.id) || {};

    const nextResource = {
      ...previousResource,
      id: resourceForm.id || `resource-${Date.now()}`,
      title,
      url: safeUrl,
      type: resourceForm.type || 'link',
      targetScope: resourceForm.targetScope || 'class',
      targetStudentIds,
      targetStudentNames,
      visibleToStudents: resourceForm.targetScope !== 'teachers',
      notes: resourceForm.notes.trim(),
      createdAt: previousResource.createdAt || now,
      createdBy: previousResource.createdBy || user?.email || '',
      createdByName: previousResource.createdByName || getTeacherName(),
      updatedAt: now,
      updatedBy: user?.email || '',
      updatedByName: getTeacherName()
    };

    const nextResources = resourceForm.id
      ? resources.map(resource => resource.id === resourceForm.id ? nextResource : resource)
      : [...resources, nextResource];

    try {
      await updateDoc(doc(db, currentSession.refPath), { resources: nextResources });
      setCurrentSession(prev => prev ? { ...prev, resources: nextResources } : prev);
      resetResourceForm();
      showNotification({ type: 'success', text: resourceForm.id ? 'Recurso actualizado.' : 'Recurso añadido a la clase.' });
    } catch (e) {
      console.error('Error al guardar recurso de clase', e);
      showNotification({ type: 'error', text: 'No se pudo guardar el recurso.' });
    } finally {
      setIsSavingResource(false);
    }
  };

  const deleteClassResource = async (resource = {}) => {
    if (!currentSession?.refPath || !resource?.id || isSavingResource) return;
    const ok = window.confirm(`¿Eliminar el recurso "${resource.title || 'sin título'}" de esta clase?`);
    if (!ok) return;

    setIsSavingResource(true);
    const nextResources = (currentSession.resources || []).filter(r => r.id !== resource.id);

    try {
      await updateDoc(doc(db, currentSession.refPath), { resources: nextResources });
      setCurrentSession(prev => prev ? { ...prev, resources: nextResources } : prev);
      if (resourceForm.id === resource.id) resetResourceForm();
      showNotification({ type: 'success', text: 'Recurso eliminado.' });
    } catch (e) {
      console.error('Error al eliminar recurso de clase', e);
      showNotification({ type: 'error', text: 'No se pudo eliminar el recurso.' });
    } finally {
      setIsSavingResource(false);
    }
  };

  const renderClassResourcesSection = () => {
    if (!currentSession) return null;

    const resources = Array.isArray(currentSession.resources) ? currentSession.resources : [];
    const assignableStudents = getResourceAssignableStudents(currentSession);

    return (
      <div className="mt-8 pt-6 border-t border-zinc-100 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-black" /> Recursos de la clase
            </h3>
            <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
              Enlaces de Drive, PDFs, vídeos o audios asociados a esta clase.
            </p>
          </div>
          <button
            type="button"
            onClick={openNewResourceForm}
            className="w-full sm:w-auto bg-black text-white font-black px-4 py-3 rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
          >
            <PlusCircle className="w-4 h-4" /> Añadir recurso
          </button>
        </div>

        {resources.length === 0 ? (
          <div className="p-5 rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50 text-center">
            <p className="text-xs font-black text-zinc-400 uppercase tracking-widest">Esta clase aún no tiene recursos añadidos.</p>
            <p className="text-[11px] font-medium text-zinc-400 mt-1">Puedes enlazar carpetas o archivos de Google Drive sin subir nada a la plataforma.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {resources.map(resource => {
              const safeUrl = getSafeClassResourceUrl(resource.url);
              return (
                <div key={resource.id} className="p-4 rounded-2xl border-2 border-zinc-100 bg-zinc-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="inline-flex items-center px-2 py-1 rounded-lg border border-zinc-200 bg-white text-zinc-600 text-[9px] font-black uppercase tracking-widest">
                        {getClassResourceTypeLabel(resource.type)}
                      </span>
                      <span className={`inline-flex items-center px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${resource.targetScope === 'teachers' ? 'border-zinc-200 bg-white text-zinc-500' : resource.targetScope === 'students' ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                        {getClassResourceAudienceLabel(resource)}
                      </span>
                    </div>
                    <p className="font-black text-slate-800 uppercase tracking-tight truncate">{resource.title}</p>
                    {resource.notes && <p className="text-xs font-medium text-zinc-500 mt-1 whitespace-pre-wrap">{resource.notes}</p>}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
                    {safeUrl && (
                      <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto text-center bg-white border-2 border-zinc-200 text-black font-black py-3 px-4 rounded-xl uppercase text-[10px] tracking-widest hover:border-black transition-colors">
                        Abrir
                      </a>
                    )}
                    <button type="button" onClick={() => openEditResourceForm(resource)} className="w-full sm:w-auto bg-zinc-100 text-zinc-600 font-black py-3 px-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-200 transition-colors">
                      Editar
                    </button>
                    <button type="button" onClick={() => deleteClassResource(resource)} className="w-full sm:w-auto bg-red-50 text-red-600 font-black py-3 px-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-red-100 transition-colors">
                      Eliminar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {showResourceForm && (
          <div className="p-5 md:p-6 bg-white border-2 border-black rounded-2xl shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-black uppercase tracking-widest text-sm text-slate-800">{resourceForm.id ? 'Editar recurso' : 'Nuevo recurso'}</h4>
                <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Pega aquí enlaces de Drive o de cualquier recurso online.</p>
              </div>
              <button type="button" onClick={resetResourceForm} disabled={isSavingResource} className="p-2 rounded-xl text-zinc-400 hover:text-black hover:bg-zinc-100 disabled:opacity-50">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Título</label>
                <input value={resourceForm.title} onChange={e => setResourceForm({ ...resourceForm, title: e.target.value })} placeholder="Ej: Acordes abiertos nivel 1" className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm text-slate-800 focus:border-black" />
              </div>
              <div>
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Tipo</label>
                <select value={resourceForm.type} onChange={e => setResourceForm({ ...resourceForm, type: e.target.value })} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm text-slate-800 focus:border-black">
                  {CLASS_RESOURCE_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Enlace</label>
              <input value={resourceForm.url} onChange={e => setResourceForm({ ...resourceForm, url: e.target.value })} placeholder="https://drive.google.com/..." className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm text-slate-800 focus:border-black" />
            </div>

            <div>
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Destinatario</label>
              <select value={resourceForm.targetScope} onChange={e => setResourceForm({ ...resourceForm, targetScope: e.target.value, targetStudentIds: e.target.value === 'students' ? resourceForm.targetStudentIds : [] })} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm text-slate-800 focus:border-black">
                <option value="class">Toda la clase · visible para alumnos</option>
                <option value="students">Alumnos concretos · visible solo para ellos</option>
                <option value="teachers">Solo profesores · no visible para alumnos</option>
              </select>
            </div>

            {resourceForm.targetScope === 'students' && (
              <div className="bg-violet-50 border-2 border-violet-100 rounded-2xl p-4">
                <p className="text-[10px] font-black text-violet-700 uppercase tracking-widest mb-3">Selecciona destinatarios</p>
                {assignableStudents.length === 0 ? (
                  <p className="text-xs font-bold text-violet-800">No hay alumnos disponibles para asignar este recurso.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {assignableStudents.map(student => (
                      <label key={student.id} className="flex items-center gap-3 bg-white/80 border border-violet-100 rounded-xl p-3 text-xs font-bold text-slate-700 cursor-pointer hover:border-violet-300 transition-colors">
                        <input type="checkbox" checked={(resourceForm.targetStudentIds || []).includes(student.id)} onChange={() => toggleResourceTargetStudent(student.id)} className="w-4 h-4 accent-violet-600" />
                        {student.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Notas internas opcionales</label>
              <textarea value={resourceForm.notes} onChange={e => setResourceForm({ ...resourceForm, notes: e.target.value })} placeholder="Ej: Usar como tarea de esta semana..." className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-medium text-sm text-slate-800 min-h-[80px] resize-y focus:border-black" />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button type="button" onClick={resetResourceForm} disabled={isSavingResource} className="w-full sm:w-1/2 bg-zinc-100 text-zinc-600 font-black py-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-200 transition-colors disabled:opacity-50">
                Cancelar
              </button>
              <button type="button" onClick={saveClassResource} disabled={isSavingResource} className="w-full sm:w-1/2 bg-black text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-800 transition-colors disabled:opacity-50">
                {isSavingResource ? 'Guardando...' : (resourceForm.id ? 'Guardar cambios' : 'Añadir recurso')}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };


  const renderTaskModal = () => {
    if (!taskModal) return null;
    const isAdminRequest = taskForm.type === 'admin_request';

    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-xl w-full p-8 shadow-2xl relative my-8 animate-in zoom-in-95 duration-200">
          <button onClick={closeTaskModal} disabled={isSavingTask} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full disabled:opacity-50"><X className="w-5 h-5"/></button>
          <div className="flex items-center gap-3 text-black mb-6">
            {isAdminRequest ? <Send className="w-8 h-8 text-blue-600" /> : <CheckCircle className="w-8 h-8 text-emerald-600" />}
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight leading-none">{isAdminRequest ? 'Petición a coordinación' : 'Nueva tarea interna'}</h2>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mt-1">{isAdminRequest ? 'Esto quedará visible para administración' : 'Solo para tu organización personal'}</p>
            </div>
          </div>

          <div className="space-y-4">
            {isAdminRequest && (
              <div>
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Tipo de petición</label>
                <select value={taskForm.requestType} onChange={e => setTaskForm({ ...taskForm, requestType: e.target.value })} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm text-slate-800 focus:border-black">
                  {TEACHER_TASK_REQUEST_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Título</label>
              <input value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} placeholder={isAdminRequest ? 'Ej: Crear clase puntual de refuerzo' : 'Ej: Preparar ejercicio para el grupo de martes'} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm text-slate-800 focus:border-black" />
            </div>

            <div>
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Detalles</label>
              <textarea value={taskForm.description} onChange={e => setTaskForm({ ...taskForm, description: e.target.value })} placeholder={isAdminRequest ? 'Explica qué necesitas que revise coordinación...' : 'Añade notas internas, materiales, pasos o recordatorios...'} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-medium text-sm text-slate-800 min-h-[120px] resize-y focus:border-black" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Prioridad</label>
                <select value={taskForm.priority} onChange={e => setTaskForm({ ...taskForm, priority: e.target.value })} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm text-slate-800 focus:border-black">
                  <option value="normal">Normal</option>
                  <option value="alta">Alta</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Fecha límite</label>
                <input type="date" value={taskForm.dueDate} onChange={e => setTaskForm({ ...taskForm, dueDate: e.target.value })} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm text-slate-800 focus:border-black" />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block mb-1">Clase relacionada</label>
              <select value={taskForm.relatedClassId} onChange={e => setTaskForm({ ...taskForm, relatedClassId: e.target.value })} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm text-slate-800 focus:border-black">
                <option value="">Sin clase concreta</option>
                {recurringClasses
                  .filter(c => !isPunctualClass(c))
                  .sort((a, b) => String(a.dayOfWeek).localeCompare(String(b.dayOfWeek)) || String(a.time).localeCompare(String(b.time)))
                  .map(c => <option key={c.id} value={c.id}>{formatClassSummary(c)}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button onClick={closeTaskModal} disabled={isSavingTask} className="w-full bg-zinc-100 text-zinc-600 font-black py-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-200 transition-colors disabled:opacity-50">Cancelar</button>
            <button onClick={saveTeacherTask} disabled={isSavingTask || !taskForm.title.trim()} className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-800 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              {isSavingTask ? 'Guardando...' : <>{isAdminRequest ? <Send className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />} {isAdminRequest ? 'Enviar petición' : 'Crear tarea'}</>}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderTeacherTaskCard = (task = {}) => {
    const isAdminRequest = task.type === 'admin_request';
    const isAdminAssignment = isAdminAssignmentTask(task);
    const status = task.status || 'pendiente';
    const requestLabel = TEACHER_TASK_REQUEST_TYPES.find(t => t.value === task.requestType)?.label || 'Petición';
    const isOpen = isTeacherTaskOpen(task);
    const cardAccentClass = isAdminAssignment
      ? 'border-violet-200 bg-violet-50/20'
      : (task.priority === 'alta' && isOpen ? 'border-amber-300' : 'border-zinc-100');
    const iconBoxClass = isAdminAssignment
      ? 'bg-violet-50 text-violet-600'
      : (isAdminRequest ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600');
    const mainIcon = isAdminAssignment
      ? <ClipboardList className="w-6 h-6" />
      : (isAdminRequest ? <Send className="w-6 h-6" /> : <CheckCircle className="w-6 h-6" />);

    return (
      <div key={task.id} className={`bg-white rounded-3xl border-2 p-6 shadow-sm ${cardAccentClass}`}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-2xl shrink-0 ${iconBoxClass}`}>
              {mainIcon}
            </div>
            <div>
              <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg leading-tight">{task.title}</h3>
              <div className="flex flex-wrap gap-2 mt-2">
                <span className={`inline-flex items-center px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${getTeacherTaskStatusStyle(status)}`}>{getTeacherTaskStatusLabel(status)}</span>
                <span className={`inline-flex items-center px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${task.priority === 'alta' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-zinc-50 text-zinc-500 border-zinc-200'}`}>Prioridad {task.priority || 'normal'}</span>
                {isAdminRequest && <span className="inline-flex items-center px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest bg-blue-50 text-blue-700 border-blue-200">{requestLabel}</span>}
                {isAdminAssignment && <span className="inline-flex items-center px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest bg-violet-50 text-violet-700 border-violet-200">Encargo de coordinación</span>}
              </div>
            </div>
          </div>
          {task.dueDate && (
            <div className="bg-zinc-50 border border-zinc-100 rounded-xl px-3 py-2 text-right shrink-0">
              <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Fecha límite</p>
              <p className="text-xs font-black text-slate-700">{formatDateSpanish(task.dueDate)}</p>
            </div>
          )}
        </div>

        {isAdminAssignment && (
          <div className="mb-4 p-4 bg-violet-50 border border-violet-100 rounded-xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-violet-700 mb-1">Encargo recibido de coordinación</p>
            <p className="text-xs font-bold text-violet-950 leading-relaxed">Esta tarea te la ha asignado administración. Puedes ponerla en curso, marcarla como completada o rechazarla explicando el motivo.</p>
            {(task.createdBy || task.createdByName) && (
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-500 mt-2">Asignado por: {task.createdByName || task.createdBy}</p>
            )}
          </div>
        )}

        {task.relatedClassLine && (
          <div className="mb-4 p-3 bg-zinc-50 border border-zinc-100 rounded-xl text-xs font-bold text-zinc-600 flex items-start gap-2">
            <Calendar className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
            <span>{task.relatedClassLine}</span>
          </div>
        )}

        {task.description && <p className="text-sm font-medium text-zinc-600 leading-relaxed whitespace-pre-wrap mb-4">{task.description}</p>}

        {task.adminResponse && !isAdminAssignment && (
          <div className="mb-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-700 mb-1">Respuesta de coordinación</p>
            <p className="text-sm font-bold text-blue-950 whitespace-pre-wrap">{task.adminResponse}</p>
          </div>
        )}

        {isAdminAssignment && (task.teacherResponse || task.completionNote || task.rejectionReason) && (
          <div className={`mb-4 p-4 rounded-xl border ${status === 'rechazada' ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100'}`}>
            <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${status === 'rechazada' ? 'text-red-700' : 'text-emerald-700'}`}>{status === 'rechazada' ? 'Motivo enviado a coordinación' : 'Respuesta enviada a coordinación'}</p>
            <p className={`text-sm font-bold whitespace-pre-wrap ${status === 'rechazada' ? 'text-red-950' : 'text-emerald-950'}`}>{task.rejectionReason || task.teacherResponse || task.completionNote}</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t border-zinc-100">
          {task.type === 'self_task' && isOpen && (
            <button onClick={() => updateTeacherTaskStatus(task, 'completada')} className="w-full sm:w-auto bg-emerald-600 text-white font-black py-3 px-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
              <Check className="w-4 h-4" /> Completar
            </button>
          )}
          {task.type === 'self_task' && !isOpen && (
            <button onClick={() => updateTeacherTaskStatus(task, 'pendiente')} className="w-full sm:w-auto bg-zinc-100 text-zinc-600 font-black py-3 px-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4" /> Reabrir
            </button>
          )}
          {task.type === 'admin_request' && isOpen && (
            <button onClick={() => updateTeacherTaskStatus(task, 'cancelada')} className="w-full sm:w-auto bg-zinc-100 text-zinc-600 font-black py-3 px-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2">
              <X className="w-4 h-4" /> Cancelar petición
            </button>
          )}
          {isAdminAssignment && isOpen && status !== 'en_curso' && (
            <button onClick={() => updateTeacherTaskStatus(task, 'en_curso')} className="w-full sm:w-auto bg-violet-600 text-white font-black py-3 px-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-violet-700 transition-colors flex items-center justify-center gap-2">
              <Play className="w-4 h-4" /> En curso
            </button>
          )}
          {isAdminAssignment && isOpen && (
            <button onClick={() => updateTeacherTaskStatus(task, 'completada')} className="w-full sm:w-auto bg-emerald-600 text-white font-black py-3 px-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
              <Check className="w-4 h-4" /> Completar encargo
            </button>
          )}
          {isAdminAssignment && isOpen && (
            <button onClick={() => updateTeacherTaskStatus(task, 'rechazada')} className="w-full sm:w-auto bg-red-50 text-red-700 font-black py-3 px-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-red-100 transition-colors flex items-center justify-center gap-2">
              <X className="w-4 h-4" /> Rechazar
            </button>
          )}
          {isAdminAssignment && !isOpen && (
            <button onClick={() => updateTeacherTaskStatus(task, 'pendiente')} className="w-full sm:w-auto bg-zinc-100 text-zinc-600 font-black py-3 px-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4" /> Reabrir
            </button>
          )}
          {!isAdminAssignment && (
            <button onClick={() => deleteTeacherTask(task)} className="w-full sm:w-auto bg-red-50 text-red-600 font-black py-3 px-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-red-100 transition-colors flex items-center justify-center gap-2">
              <Trash2 className="w-4 h-4" /> Eliminar
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderTasksTab = () => {
    const visibleList = tasksView === 'requests'
      ? pendingAdminRequests
      : tasksView === 'assignments'
        ? pendingAdminAssignments
        : tasksView === 'done'
          ? completedTeacherTasks
          : pendingSelfTasks;

    const emptyMessage = tasksView === 'assignments'
      ? 'No tienes encargos pendientes de coordinación.'
      : tasksView === 'requests'
        ? 'No tienes peticiones pendientes enviadas a coordinación.'
        : tasksView === 'done'
          ? 'No hay tareas finalizadas.'
          : 'Crea una tarea interna o envía una petición a coordinación.';

    return (
      <div className="space-y-6 animate-in fade-in">
        <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 mb-6">
            <div>
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Tareas</h2>
              <p className="text-sm font-medium text-zinc-500 mt-1">Organización interna, peticiones a coordinación y encargos recibidos.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              <button onClick={() => openTaskModal('self_task')} className="w-full sm:w-auto bg-black text-white font-black px-5 py-3 rounded-xl uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors">
                <PlusCircle className="w-4 h-4" /> Nueva tarea
              </button>
              <button onClick={() => openTaskModal('admin_request')} className="w-full sm:w-auto bg-blue-600 text-white font-black px-5 py-3 rounded-xl uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors">
                <Send className="w-4 h-4" /> Pedir a coordinación
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-zinc-50 border border-zinc-100 rounded-2xl p-2">
            {[
              { id: 'pending', label: `Mis tareas (${pendingSelfTasks.length})` },
              { id: 'requests', label: `Peticiones (${pendingAdminRequests.length})` },
              { id: 'assignments', label: `Encargos (${pendingAdminAssignments.length})` },
              { id: 'done', label: `Finalizadas (${completedTeacherTasks.length})` }
            ].map(view => (
              <button key={view.id} onClick={() => setTasksView(view.id)} className={`py-3 px-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all ${tasksView === view.id ? 'bg-black text-white shadow-md' : 'text-zinc-400 hover:text-black hover:bg-white'}`}>
                {view.label}
              </button>
            ))}
          </div>
        </div>

        {visibleList.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-zinc-200 shadow-sm">
            <CheckCircle className="w-16 h-16 text-zinc-200 mx-auto mb-4" />
            <h3 className="text-lg font-bold uppercase tracking-widest text-zinc-400">No hay tareas en esta sección</h3>
            <p className="text-sm font-medium text-zinc-400 mt-2">{emptyMessage}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {visibleList.map(renderTeacherTaskCard)}
          </div>
        )}
      </div>
    );
  };

  const renderAttendanceStudentCard = (student) => {
    const globalSt = globalStudents.find(g => g.id === student.id);
    const displayEmail = globalSt?.email || student.email;
    const hasOpenAdminIncident = globalSt?.globalStatus === 'impago';
    const pendingPlanningForStudent = getPlanningGestionesForStudent(student.id, currentSession);
    const hasPendingPlanning = pendingPlanningForStudent.length > 0;
    const isBlockedStudent = isAttendanceBlockedStudent(student, date);
    const hasAnnouncedAbsence = student.status === 'notified' || student.originalException === 'notified' || student.originalException === 'notified_no_ticket';

    return (
      <div key={`${student.id}-${student.isRecovery ? student.recoveryDate || 'recovery' : 'fixed'}-${student.temporaryRelocationId || 'base'}`} className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 md:p-5 border-2 rounded-2xl gap-4 transition-colors ${isBlockedStudent ? 'bg-blue-50/50 border-blue-100' : hasOpenAdminIncident ? 'bg-red-50/40 border-red-100' : hasPendingPlanning ? 'bg-orange-50/40 border-orange-200' : hasAnnouncedAbsence ? 'bg-amber-50/40 border-amber-200' : 'bg-zinc-50 border-zinc-100 hover:border-zinc-300'}`}>
        <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
          <div className="flex flex-col">
            <span className={`font-bold text-lg ${isBlockedStudent ? 'text-zinc-400 line-through' : 'text-slate-800'}`}>
              {student.name}
            </span>
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
              {displayEmail || 'Sin email'}
            </span>

            <div className="flex flex-wrap gap-1.5 mt-2">
              {student.isRecovery && !isBlockedStudent && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-[9px] font-black uppercase tracking-widest">
                  <CornerDownRight className="w-3 h-3" /> Recuperación
                </span>
              )}
              {student.isTemporaryRelocation && !isBlockedStudent && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-[9px] font-black uppercase tracking-widest">
                  <Clock className="w-3 h-3" /> Recolocado temporalmente aquí
                </span>
              )}
              {hasAnnouncedAbsence && !isBlockedStudent && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-[9px] font-black uppercase tracking-widest">
                  <AlertCircle className="w-3 h-3" /> Ausencia anunciada
                </span>
              )}
              {hasOpenAdminIncident && !isBlockedStudent && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 bg-red-50 text-red-700 text-[9px] font-black uppercase tracking-widest" title="Incidencia de pago abierta. Recordatorio privado y discreto.">
                  <AlertCircle className="w-3 h-3" /> Pago pendiente
                </span>
              )}
              {pendingPlanningForStudent.map(g => renderPlanningBadge(g, currentSession))}
            </div>

            {student.isTemporaryRelocation && student.sourceClassLine && (
              <p className="text-[10px] font-bold text-violet-700 mt-2 uppercase tracking-widest">
                Origen formal: {student.sourceClassLine}
              </p>
            )}
          </div>

          <div className="flex gap-2 sm:hidden">
            <button onClick={() => setNotesModal(student)} className="p-2 rounded-lg text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Ficha Interna">
              <FileText className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {isBlockedStudent ? (
            <div className="w-full sm:w-auto px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider bg-blue-100 text-blue-700 border border-blue-200 text-center flex items-center justify-center gap-2">
              <Snowflake className="w-4 h-4"/> {student.isMaintenance ? 'Mantenimiento temporal' : 'En mantenimiento'}
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
    );
  };

  const renderNonComputableStudentCard = (student) => {
    const globalSt = globalStudents.find(g => g.id === student.id);
    const displayEmail = globalSt?.email || student.email;
    const hasOpenAdminIncident = globalSt?.globalStatus === 'impago';
    const pendingPlanningForStudent = getPlanningGestionesForStudent(student.id, currentSession);
    const destinationLine = student.targetClassLine || student.relocationTargetLine || '';
    const sourceLine = student.sourceClassLine || '';

    return (
      <div key={`no-computa-${student.id}-${student.temporaryRelocationId || student.nonComputableReason || 'base'}`} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 md:p-5 border-2 rounded-2xl gap-4 bg-zinc-50/80 border-zinc-200 opacity-90">
        <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
          <div className="flex flex-col">
            <span className="font-bold text-lg text-zinc-500">
              {student.name}
            </span>
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
              {displayEmail || 'Sin email'}
            </span>

            <div className="flex flex-wrap gap-1.5 mt-2">
              {student.isTemporarilyRelocatedOut && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-[9px] font-black uppercase tracking-widest">
                  <Clock className="w-3 h-3" /> Fuera temporalmente
                </span>
              )}
              {student.isTemporaryRelocation && !student.isTemporarilyRelocatedOut && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-violet-200 bg-violet-50 text-violet-700 text-[9px] font-black uppercase tracking-widest">
                  <Clock className="w-3 h-3" /> Recolocado temporalmente aquí
                </span>
              )}
              {student.isMaintenance && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-[9px] font-black uppercase tracking-widest">
                  <Snowflake className="w-3 h-3" /> {student.maintenanceLabel || 'Mantenimiento temporal'}
                </span>
              )}
              {student.isFutureStartHidden && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 text-[9px] font-black uppercase tracking-widest">
                  <Calendar className="w-3 h-3" /> {student.nonComputableLabel || 'Inicio futuro'}
                </span>
              )}
              {student.isEndedHidden && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-200 bg-white text-zinc-600 text-[9px] font-black uppercase tracking-widest">
                  <CalendarOff className="w-3 h-3" /> {student.nonComputableLabel || 'Fin programado'}
                </span>
              )}
              {student.nonComputableReason === 'recovery_other_day' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-[9px] font-black uppercase tracking-widest">
                  <CornerDownRight className="w-3 h-3" /> {student.nonComputableLabel || 'Recuperación otro día'}
                </span>
              )}
              {hasOpenAdminIncident && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 bg-red-50 text-red-700 text-[9px] font-black uppercase tracking-widest" title="Incidencia de pago abierta. Recordatorio privado y discreto.">
                  <AlertCircle className="w-3 h-3" /> Pago pendiente
                </span>
              )}
              {pendingPlanningForStudent.map(g => renderPlanningBadge(g, currentSession))}
            </div>

            {student.isTemporarilyRelocatedOut && destinationLine && (
              <p className="text-[10px] font-bold text-violet-700 mt-2 uppercase tracking-widest">
                Destino temporal: {destinationLine}
              </p>
            )}
            {student.isTemporaryRelocation && !student.isTemporarilyRelocatedOut && sourceLine && (
              <p className="text-[10px] font-bold text-violet-700 mt-2 uppercase tracking-widest">
                Origen formal: {sourceLine}
              </p>
            )}
          </div>

          <div className="flex gap-2 sm:hidden">
            <button onClick={() => setNotesModal(student)} className="p-2 rounded-lg text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Ficha Interna">
              <FileText className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="w-full sm:w-auto px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider bg-zinc-100 text-zinc-500 border border-zinc-200 text-center flex items-center justify-center gap-2">
            <Ghost className="w-4 h-4"/> No computa hoy
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2">
          <button onClick={() => setNotesModal(student)} className="p-3 rounded-xl text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors" title="Ficha Interna del Alumno">
            <FileText className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
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
  const currentCount = getCapacityCountForSession(currentSession);
  const isCapacityReached = !isCapacityMissing && currentCount >= maxCap;
  const isOverCapacity = !isCapacityMissing && currentCount > maxCap;
  const isDisabledAdd = isCapacityMissing || isCapacityReached;

  const todayISO = new Date().toISOString().split('T')[0];
  const isFutureDate = date > todayISO;
  
  const isGlobalFestivo = settings.festivos?.includes(date);
  const isVacacion = settings.vacaciones?.includes(date);
  const isSpecialDay = isGlobalFestivo || isVacacion;

  const upcomingSubs = substitutions
    .filter(s => s.date >= todayISO && getSubstitutionStatus(s) === 'open')
    .sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-slate-800 pb-24 md:pb-0">
      {renderTaskModal()}

      {deadHourModal && (
        <DeadHourModalComponent
          tasks={deadHourModal.tasks}
          onCancel={() => setDeadHourModal(null)}
          onRenounce={() => executeSaveRecord(null, true, { nonComputableReason: 'teacher_renounced_dead_hour' })}
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
                <ShieldAlert className="w-4 h-4"/> Modo Admin
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
            { id: 'tasks', label: 'Tareas', icon: CheckCircle },
            { id: 'daily', label: 'Diario', icon: MessageSquare },
            { id: 'history', label: 'Historial', icon: History },
            { id: 'reports', label: 'Reportes', icon: BarChart3 }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`relative flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold uppercase text-xs tracking-wider transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-black text-white shadow-md' : 'text-zinc-400 hover:text-black hover:bg-zinc-50'}`}>
              <tab.icon className="w-4 h-4"/> {tab.label}
              {tab.id === 'notifications' && (notifications.length > 0 || pendingInternalTeacherNotifications.length > 0 || hasUnreadTeacherTablon) && (
                <span className="bg-red-500 w-2 h-2 rounded-full absolute top-2 right-2 animate-pulse"></span>
              )}
              {tab.id === 'tasks' && openTeacherTasksCount > 0 && (
                <span className="bg-amber-400 w-2 h-2 rounded-full absolute top-2 right-2 animate-pulse"></span>
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
                        {upcomingSubs.map(sub => {
                          const subStats = getSubstitutionStudentStats(sub);
                          const ownSubstitution = isOwnSubstitution(sub);
                          const canAssumeSubstitution = !ownSubstitution && subStats.active > 0;

                          return (
                          <div key={sub.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-zinc-800/80 backdrop-blur rounded-2xl border border-zinc-700 hover:border-amber-400 transition-colors">
                            <div>
                              <p className="font-black uppercase text-sm text-white">{sub.subject} <span className="text-zinc-400 font-bold ml-2">{formatDateSpanish(sub.date)} a las {sub.time}</span></p>
                              <p className="text-xs font-bold text-zinc-400 mt-1 uppercase tracking-widest">
                                Falta: {sub.originalTeacherName} • {subStats.active} activos{subStats.total !== subStats.active ? ` / ${subStats.total} en lista` : ''}{subStats.maintenance > 0 ? ` • ${subStats.maintenance} mantenimiento` : ''}
                              </p>
                              {ownSubstitution && (
                                <p className="text-[10px] font-black uppercase tracking-widest text-amber-300 mt-2">Cancelada por ti</p>
                              )}
                            </div>
                            {canAssumeSubstitution ? (
                              <button 
                                onClick={() => assumeSubstitution(sub)} 
                                className="mt-3 sm:mt-0 w-full sm:w-auto bg-amber-400 text-amber-950 font-black py-3 px-6 rounded-xl text-[10px] uppercase tracking-widest hover:bg-amber-300 transition-all shadow-md active:scale-95"
                              >
                                Asumir Clase
                              </button>
                            ) : (
                              <span className="mt-3 sm:mt-0 w-full sm:w-auto text-center bg-zinc-700 text-zinc-300 font-black py-3 px-6 rounded-xl text-[10px] uppercase tracking-widest border border-zinc-600">
                                {ownSubstitution ? 'No asumible por ti' : 'Sin alumnos activos'}
                              </span>
                            )}
                          </div>
                          );
                        })}
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
                      const studentsForDate = getEffectiveStudentsForClass(item.data, date);
                      const visibleCount = studentsForDate.filter(s => {
                        const studentInfo = globalStudents.find(g => g.id === s.id);
                        return !isAttendanceBlockedStudent(s, date) && isStudentClassActiveForDate(s, studentInfo, date) && (!s.isRecovery || s.recoveryDate === date);
                      }).length;
                      const activeCount = getEffectiveActiveStudentsForClass(item.data, date).length;
                      const planningGestionesForClass = getPlanningGestionesForClass(item.data);
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
                            {planningGestionesForClass.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {planningGestionesForClass.slice(0, 3).map(g => renderPlanningBadge(g, item.data))}
                                {planningGestionesForClass.length > 3 && (
                                  <span className="inline-flex items-center px-2 py-1 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-500 text-[9px] font-black uppercase tracking-widest">
                                    +{planningGestionesForClass.length - 3} más
                                  </span>
                                )}
                              </div>
                            )}
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

                  {getPlanningGestionesForClass(currentSession).length > 0 && (
                    <div className="mb-6 p-4 bg-orange-50 border-2 border-orange-200 rounded-xl">
                      <div className="flex items-center gap-2 text-orange-900 mb-3">
                        <Bell className="w-5 h-5" />
                        <p className="text-xs font-black uppercase tracking-widest">Cambios previstos para el mes que viene</p>
                      </div>
                      <div className="space-y-2">
                        {getPlanningGestionesForClass(currentSession).map(g => (
                          <div key={g.id} className="bg-white/80 border border-orange-100 rounded-xl p-3">
                            <div className="flex flex-wrap gap-2 items-center mb-1">{renderPlanningBadge(g, currentSession)}</div>
                            <p className="text-xs font-bold text-orange-900">{g.studentName || 'Alumno'} · {getPlanningGestionClassContext(g, currentSession)}</p>
                            {g.details && <p className="text-[11px] font-medium text-orange-800/80 mt-1 italic">"{g.details}"</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* AVISO DE AUTO-CANCELACIÓN (+2 HORAS) */}
                  {currentSession.isAutoCancelled && (
                    <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-xl flex items-center gap-3">
                      <AlertCircle className="text-red-600 w-6 h-6 shrink-0"/>
                      <p className="text-xs font-bold text-red-900">🚨 CLASE CANCELADA. Todos los alumnos avisaron con más de 2h de antelación. Esta hora no se cobra ni requiere tareas. Dale a "Guardar Asistencia" para archivarla.</p>
                    </div>
                  )}
                  
                  {currentSession.hasTemporaryRelocations && (
                    <div className="mb-6 p-4 bg-violet-50 border-2 border-violet-200 rounded-xl flex items-center gap-3">
                      <Clock className="text-violet-600 w-6 h-6 shrink-0"/>
                      <p className="text-xs font-bold text-violet-900">Hay recolocaciones temporales activas en esta clase. La lista de hoy puede no coincidir con las plazas formales del grupo.</p>
                    </div>
                  )}
                  
                  {currentSession.hasMaintenancePeriods && (
                    <div className="mb-6 p-4 bg-blue-50 border-2 border-blue-200 rounded-xl flex items-center gap-3">
                      <Snowflake className="text-blue-600 w-6 h-6 shrink-0"/>
                      <p className="text-xs font-bold text-blue-900">Hay alumnos con mantenimiento temporal activo. Conservan la plaza, pero no computan para asistencia ni hora muerta durante su periodo.</p>
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
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1"><BookOpen className="w-3 h-3" /> Cuaderno de Bitácora (Pasa a la sig. semana)</label>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${daysSince(currentSession.notesUpdatedAt) > 30 ? 'text-amber-600' : 'text-zinc-400'}`}>
                        {currentSession.notesUpdatedAt
                          ? `Última actualización: ${formatDateTimeSpanish(currentSession.notesUpdatedAt)}`
                          : 'Sin fecha de actualización registrada'}
                      </span>
                    </div>
                    {daysSince(currentSession.notesUpdatedAt) > 30 && (
                      <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        ⚠️ Este cuaderno lleva más de 30 días sin actualizarse. Revísalo si la clase ha avanzado o se han mandado nuevos deberes.
                      </p>
                    )}
                    <textarea 
                      placeholder="Ejercicios, tareas, estado de los alumnos..." 
                      value={currentSession.notes} 
                      onChange={(e) => handleSessionFieldChange('notes', e.target.value)} 
                      className="w-full p-4 bg-amber-50/40 border-2 border-amber-100 rounded-xl focus:border-amber-400 outline-none text-slate-800 font-medium text-sm min-h-[100px] resize-y transition-colors" 
                    />
                  </div>

                  {renderClassResourcesSection()}
                </div>

                {/* ZONA DE ALUMNOS */}
                <div className="p-6 md:p-8">
                  <div className="space-y-6">
                    <div>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                        <div>
                          <h3 className="text-sm uppercase tracking-widest font-black text-slate-800 flex items-center gap-2">
                            <ClipboardList className="w-5 h-5 text-black" /> Alumnos para pasar lista
                          </h3>
                          <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
                            {currentSession.students.length} alumnos computables hoy
                          </p>
                        </div>
                      </div>

                      {currentSession.students.length === 0 ? (
                        <div className="text-center py-10 bg-zinc-50 rounded-2xl border-2 border-dashed border-zinc-200">
                          <p className="text-zinc-400 font-bold uppercase tracking-widest">No hay alumnos para pasar lista hoy.</p>
                          <p className="text-xs font-medium text-zinc-400 mt-2">Revisa el bloque “No computan hoy” para ver si hay mantenimientos, inicios futuros o recolocaciones fuera.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {currentSession.students.map(renderAttendanceStudentCard)}
                        </div>
                      )}
                    </div>

                    {(currentSession.nonComputableStudents || []).length > 0 && (
                      <div className="pt-6 border-t border-zinc-100">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                          <div>
                            <h3 className="text-sm uppercase tracking-widest font-black text-zinc-500 flex items-center gap-2">
                              <Ghost className="w-5 h-5 text-zinc-400" /> No computan hoy
                            </h3>
                            <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
                              {(currentSession.nonComputableStudents || []).length} alumnos informativos, sin botones de asistencia
                            </p>
                          </div>
                        </div>
                        <div className="space-y-4">
                          {(currentSession.nonComputableStudents || []).map(renderNonComputableStudentCard)}
                        </div>
                      </div>
                    )}
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
                <p className="text-zinc-500 font-medium text-sm">Indica el horario total que pones a disposición del centro, incluyendo las franjas en las que ya tienes clases asignadas.</p>
              </div>
            </header>

            <div className="bg-blue-50 border-2 border-blue-100 text-blue-900 rounded-3xl p-5 md:p-6 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-widest mb-2 flex items-center gap-2"><Clock className="w-5 h-5" /> Cómo usar esta sección</h3>
              <p className="text-xs md:text-sm font-bold leading-relaxed">
                Este no es el listado de huecos que te quedan libres. Es tu disponibilidad total para trabajar en la escuela. Si ya tienes una clase dentro de una franja, esa franja también debe figurar aquí. Coordinación cruzará esta disponibilidad con tu agenda real antes de asignarte nuevas clases.
              </p>
              <p className="text-[11px] font-black uppercase tracking-widest text-blue-700 mt-3">
                Puedes borrar o reorganizar franjas sin que se eliminen ni se muevan tus clases ya asignadas.
              </p>
            </div>

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
                            <PlusCircle className="w-4 h-4" /> Añadir Franja Disponible
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Avisos</h2>
                <p className="text-sm font-medium text-zinc-500 mt-1">Notificaciones operativas y tablón general de la escuela.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${(notifications.length + pendingInternalTeacherNotifications.length) > 0 ? 'bg-red-500 text-white animate-pulse' : 'bg-zinc-200 text-zinc-500'}`}>
                  {notifications.length + pendingInternalTeacherNotifications.length} Notificaciones
                </span>
                <span className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${hasUnreadTeacherTablon ? 'bg-amber-400 text-amber-950 animate-pulse' : 'bg-zinc-200 text-zinc-500'}`}>
                  {visibleTeacherAnnouncements.length} Anuncios
                </span>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-2 grid grid-cols-3 gap-2">
              <button onClick={() => setNotificationsView('notifications')} className={`py-3 px-4 rounded-xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-2 ${notificationsView === 'notifications' ? 'bg-black text-white shadow-md' : 'text-zinc-400 hover:text-black hover:bg-zinc-50'}`}>
                <Bell className="w-4 h-4" /> Notificaciones
                {(notifications.length + pendingInternalTeacherNotifications.length) > 0 && <span className="bg-red-500 text-white rounded-full px-2 py-0.5 text-[9px]">{notifications.length + pendingInternalTeacherNotifications.length}</span>}
              </button>
              <button onClick={() => setNotificationsView('read')} className={`py-3 px-4 rounded-xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-2 ${notificationsView === 'read' ? 'bg-black text-white shadow-md' : 'text-zinc-400 hover:text-black hover:bg-zinc-50'}`}>
                <History className="w-4 h-4" /> Leídos
                {readInternalTeacherNotifications.length > 0 && <span className="bg-zinc-200 text-zinc-700 rounded-full px-2 py-0.5 text-[9px]">{readInternalTeacherNotifications.length}</span>}
              </button>
              <button onClick={() => setNotificationsView('tablon')} className={`py-3 px-4 rounded-xl font-black uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-2 ${notificationsView === 'tablon' ? 'bg-black text-white shadow-md' : 'text-zinc-400 hover:text-black hover:bg-zinc-50'}`}>
                <Megaphone className="w-4 h-4" /> Tablón
                {hasUnreadTeacherTablon && <span className="bg-amber-400 text-amber-950 rounded-full px-2 py-0.5 text-[9px]">Nuevo</span>}
              </button>
            </div>

            {notificationsView === 'notifications' && (
              <>
                {notifications.length === 0 && pendingInternalTeacherNotifications.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-3xl border border-zinc-200 shadow-sm">
                    <CheckCircle className="w-16 h-16 text-zinc-200 mx-auto mb-4" />
                    <h3 className="text-lg font-bold uppercase tracking-widest text-zinc-400">No hay avisos pendientes</h3>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pendingInternalTeacherNotifications.map(notificationItem => (
                      <div key={notificationItem.id} className="bg-white border-2 border-blue-100 p-6 rounded-3xl shadow-sm flex items-start gap-4">
                        <div className={`p-3 rounded-2xl shrink-0 ${notificationItem.type === 'falta_reiterada' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                          {notificationItem.type === 'falta_reiterada' ? <AlertCircle className="w-6 h-6"/> : <Bell className="w-6 h-6"/>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">{notificationItem.type === 'falta_reiterada' ? 'Seguimiento de asistencia' : 'Aviso de coordinación'}</p>
                          <h3 className="font-black text-lg uppercase tracking-tight text-slate-900">{notificationItem.title || 'Aviso para el profesor'}</h3>
                          <p className="text-sm font-medium text-zinc-600 whitespace-pre-wrap leading-relaxed mt-3">{notificationItem.body || 'Sin detalles adicionales.'}</p>
                          {notificationItem.createdAt && <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-3">{new Date(notificationItem.createdAt).toLocaleString('es-ES')}</p>}
                          <div className="mt-4 pt-4 border-t border-zinc-100">
                            <button onClick={() => markInternalTeacherNotificationRead(notificationItem)} className="w-full sm:w-auto text-[10px] font-black uppercase tracking-widest bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                              <Check className="w-4 h-4"/> Enterado
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {notifications.map(n => {
                      const isRecoveryRequest = n.type === 'recuperacion';
                      const isPlanningRequest = PLANNING_GESTION_TYPES.has(n.type);
                      const targetClass = (isRecoveryRequest || n.requestedClass) ? getRecoveryClass(n) : null;
                      const ticketInfo = isRecoveryRequest ? getRecoveryTicketInfo(n) : null;
                      const recoveryClassLine = n.requestedClassLine || (targetClass ? formatClassSummary(targetClass) : 'Clase no localizada');
                      const canApproveRecovery = isRecoveryRequest && targetClass?.refPath && ticketInfo?.free > 0;
                      const affectedClasses = isPlanningRequest ? recurringClasses.filter(c => isPlanningGestionRelevantForClass(n, c)) : [];

                      return (
                      <div key={n.id} className="bg-white border-2 border-zinc-100 p-6 rounded-3xl shadow-sm flex items-start gap-4">
                        <div className={`p-3 rounded-2xl shrink-0 ${n.type === 'baja' ? 'bg-red-50 text-red-500' : n.type === 'mantenimiento' ? 'bg-blue-50 text-blue-600' : n.type === 'cambio_horario' ? 'bg-violet-50 text-violet-600' : n.type === 'aviso_ausencia' ? 'bg-amber-50 text-amber-500' : isRecoveryRequest ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-500'}`}>
                          {n.type === 'baja' ? <UserMinus className="w-6 h-6"/> : n.type === 'mantenimiento' ? <Snowflake className="w-6 h-6"/> : n.type === 'cambio_horario' ? <RefreshCcw className="w-6 h-6"/> : n.type === 'aviso_ausencia' ? <AlertCircle className="w-6 h-6"/> : isRecoveryRequest ? <Ticket className="w-6 h-6"/> : <PlusCircle className="w-6 h-6"/>}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-black text-lg uppercase tracking-tight">{n.studentName}</h3>
                          <p className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-3">
                            {isPlanningRequest ? `Planificación: ${getPlanningGestionLabel(n)}` : (isRecoveryRequest ? 'Solicita recuperación' : (n.type === 'aviso_ausencia' ? n.title : `Solicita: ${n.title}`))}
                          </p>

                          {isPlanningRequest ? (
                            <div className="bg-orange-50 p-4 rounded-xl border border-orange-100 space-y-3">
                              <div className="flex flex-wrap gap-2">{renderPlanningBadge(n, targetClass || affectedClasses[0] || null)}</div>
                              <p className="text-sm font-bold text-orange-950">{getPlanningGestionClassContext(n, targetClass || affectedClasses[0] || null)}</p>
                              {affectedClasses.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-black text-orange-800 uppercase tracking-widest mb-1">Clases afectadas</p>
                                  <ul className="space-y-1">
                                    {affectedClasses.map(c => <li key={c.id} className="text-xs font-bold text-slate-800">· {formatClassSummary(c)}</li>)}
                                  </ul>
                                </div>
                              )}
                              {targetClass && !affectedClasses.some(c => c.id === targetClass.id) && (
                                <p className="text-xs font-bold text-slate-800">Clase destino: {formatClassSummary(targetClass)}</p>
                              )}
                              {n.details && <p className="text-xs font-medium text-zinc-600 italic pt-1">"{n.details}"</p>}
                              <p className="text-[10px] font-black uppercase tracking-widest text-orange-700 pt-2 border-t border-orange-100">Admin debe gestionar Tadosi y ejecutar el trámite. Esta tarjeta solo es previsión.</p>
                            </div>
                          ) : isRecoveryRequest ? (
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-2">
                              <p className="text-xs font-black text-blue-900 uppercase tracking-widest">Clase solicitada</p>
                              <p className="text-sm font-bold text-slate-800">{recoveryClassLine}</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Fecha: <span className="text-slate-800">{formatDateSpanish(n.recoveryDate)}</span></p>
                                <p className={`text-[10px] font-black uppercase tracking-widest ${ticketInfo?.free > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  Tickets libres: {ticketInfo?.free || 0} / válidos: {ticketInfo?.valid || 0}
                                </p>
                              </div>
                              {n.details && <p className="text-xs font-medium text-zinc-600 italic pt-2">"{n.details}"</p>}
                              {!targetClass && <p className="text-[10px] font-black text-red-600 uppercase tracking-widest pt-2">No se ha localizado la clase en tu agenda.</p>}
                            </div>
                          ) : (
                            <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                              <p className="text-sm font-medium text-zinc-600 italic">"{n.details || 'Sin detalles adicionales'}"</p>
                            </div>
                          )}

                          {n.targetMonth && (
                            <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mt-3">Para el mes de: {n.targetMonth}</p>
                          )}
                          
                          <div className="mt-4 pt-4 border-t border-zinc-100 flex flex-col sm:flex-row gap-2">
                            {isPlanningRequest ? (
                              <div className="w-full bg-zinc-50 border border-zinc-200 text-zinc-500 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2">
                                <Bell className="w-4 h-4"/> Pendiente de coordinación
                              </div>
                            ) : isRecoveryRequest ? (
                              <>
                                <button
                                  onClick={() => approveRecoveryRequest(n)}
                                  disabled={!canApproveRecovery}
                                  className={`w-full sm:w-auto text-[10px] font-black uppercase tracking-widest px-4 py-3 rounded-xl transition-colors flex items-center justify-center gap-2 ${canApproveRecovery ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'}`}
                                >
                                  <Check className="w-4 h-4"/> Aceptar recuperación
                                </button>
                                <button onClick={() => rejectRecoveryRequest(n)} className="w-full sm:w-auto text-[10px] font-black uppercase tracking-widest bg-red-50 hover:bg-red-100 text-red-700 px-4 py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                                  <X className="w-4 h-4"/> Rechazar
                                </button>
                              </>
                            ) : (
                              <button onClick={() => dismissNotification(n.id)} className="w-full sm:w-auto text-[10px] font-black uppercase tracking-widest bg-zinc-100 hover:bg-zinc-200 text-zinc-600 px-4 py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                                <Check className="w-4 h-4"/> Enterado / Ocultar
                              </button>
                            )}
                          </div>

                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {notificationsView === 'read' && (
              readInternalTeacherNotifications.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-3xl border border-zinc-200 shadow-sm">
                  <History className="w-16 h-16 text-zinc-200 mx-auto mb-4" />
                  <h3 className="text-lg font-bold uppercase tracking-widest text-zinc-400">No hay avisos leídos</h3>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {readInternalTeacherNotifications.map(notificationItem => (
                    <div key={notificationItem.id} className="bg-white border border-zinc-200 p-6 rounded-3xl shadow-sm opacity-80">
                      <div className="flex items-start gap-3">
                        <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600 shrink-0"><CheckCircle className="w-5 h-5"/></div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Enterado</p>
                          <h3 className="font-black text-base uppercase tracking-tight text-slate-800 mt-1">{notificationItem.title || 'Aviso para el profesor'}</h3>
                          <p className="text-sm font-medium text-zinc-500 whitespace-pre-wrap leading-relaxed mt-3">{notificationItem.body || 'Sin detalles adicionales.'}</p>
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-3">Leído: {notificationItem.readAt ? new Date(notificationItem.readAt).toLocaleString('es-ES') : 'Sin fecha'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {notificationsView === 'tablon' && (
              <div className="space-y-4">
                {visibleTeacherAnnouncements.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-3xl border border-zinc-200 shadow-sm">
                    <Megaphone className="w-16 h-16 text-zinc-200 mx-auto mb-4" />
                    <h3 className="text-lg font-bold uppercase tracking-widest text-zinc-400">El tablón está vacío</h3>
                    <p className="text-sm font-medium text-zinc-400 mt-2">Cuando coordinación publique avisos para tu sede, instrumento o profesor, aparecerán aquí.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {visibleTeacherAnnouncements.map(ann => (
                      <div key={ann.id} className="bg-white rounded-3xl p-6 shadow-sm border-2 border-zinc-200">
                        <div className="flex items-start gap-3 mb-4">
                          <div className="bg-black text-white p-3 rounded-2xl shrink-0">
                            <Megaphone className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg leading-none mb-1">{ann.title}</h3>
                            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">{formatDateSpanish(ann.date)}</p>
                          </div>
                        </div>
                        <p className="text-sm font-medium text-slate-600 leading-relaxed whitespace-pre-wrap">{ann.content}</p>
                        {getSafeAnnouncementUrl(ann.url) && (
                          <a href={getSafeAnnouncementUrl(ann.url)} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center justify-center gap-2 bg-black text-white px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-zinc-800 transition-colors shadow-sm">
                            <LinkIcon className="w-4 h-4"/> Abrir enlace
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* --- PESTAÑA TAREAS --- */}
        {activeTab === 'tasks' && renderTasksTab()}

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
                          {student.isTemporaryRelocation && (
                            <span className="text-[10px] text-violet-600 font-black uppercase tracking-widest ml-8">Recolocado temporalmente</span>
                          )}
                          {student.isMaintenance && (
                            <span className="text-[10px] text-blue-600 font-black uppercase tracking-widest ml-8">Mantenimiento temporal</span>
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
          {[{id:'attendance', i:ClipboardList}, {id:'availability', i:Clock}, {id:'notifications', i:Bell}, {id:'tasks', i:CheckCircle}, {id:'daily', i:MessageSquare}, {id:'reports', i:BarChart3}].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`p-4 rounded-xl transition-all relative ${activeTab === t.id ? 'bg-black text-white shadow-lg' : 'text-zinc-400'}`}>
              <t.i className="w-6 h-6"/>
              {t.id === 'notifications' && (notifications.length > 0 || pendingInternalTeacherNotifications.length > 0 || hasUnreadTeacherTablon) && <span className="bg-red-500 w-3 h-3 rounded-full absolute top-2 right-2 animate-pulse border-2 border-white"></span>}
              {t.id === 'tasks' && openTeacherTasksCount > 0 && <span className="bg-amber-400 w-3 h-3 rounded-full absolute top-2 right-2 animate-pulse border-2 border-white"></span>}
            </button>
          ))}
          {isAdmin && <button onClick={switchToAdmin} className={`p-4 rounded-xl transition-all bg-red-50 text-red-600`}><ShieldAlert className="w-6 h-6"/></button>}
        </div>
      </nav>

      <nav className="hidden md:flex fixed top-1/2 -translate-y-1/2 left-6 flex-col gap-4 z-40">
        {[{id:'attendance', i:ClipboardList, t:'Listas'}, {id:'availability', i:Clock, t:'Horario'}, {id:'notifications', i:Bell, t:'Avisos'}, {id:'tasks', i:CheckCircle, t:'Tareas'}, {id:'daily', i:MessageSquare, t:'Diario'}, {id:'history', i:History, t:'Historial'}, {id:'reports', i:BarChart3, t:'Nómina'}].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={`p-5 rounded-2xl shadow-sm flex items-center justify-center transition-all relative ${activeTab === t.id ? 'bg-black text-white scale-110 shadow-xl' : 'bg-white text-zinc-400 hover:text-black border-2'}`} title={t.t}>
            <t.i/>
            {t.id === 'notifications' && (notifications.length > 0 || pendingInternalTeacherNotifications.length > 0 || hasUnreadTeacherTablon) && <span className="bg-red-500 w-3 h-3 rounded-full absolute top-2 right-2 animate-pulse border-2 border-white"></span>}
            {t.id === 'tasks' && openTeacherTasksCount > 0 && <span className="bg-amber-400 w-3 h-3 rounded-full absolute top-2 right-2 animate-pulse border-2 border-white"></span>}
          </button>
        ))}
      </nav>
    </div>
  );
}
