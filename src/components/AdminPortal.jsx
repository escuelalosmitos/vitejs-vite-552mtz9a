import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Inbox, ClipboardList, Users, User, Megaphone, Settings, LogOut, Search, MonitorPlay, 
  DoorOpen, Check, X, Trash2, Calendar, FileText, Plus, ShieldAlert, 
  ArrowRightLeft, PartyPopper, Palmtree, Lock, Trophy, Award, Gift, Star, 
  Target, Timer, BookOpen, AlertTriangle, Calculator, ChevronDown, ChevronUp, History, UserMinus, Info, Clock, CheckCircle, Ticket, Pencil, AlertCircle, Ghost, PlusCircle, MapPin, Globe, LayoutGrid, Save, TrendingUp, DollarSign, PieChart, Activity, Music, Minus, Snowflake, Send, Mail
} from 'lucide-react';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, collectionGroup, writeBatch, getDocs, query } from 'firebase/firestore';
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz_MEKpKnv-L1g0e1khYf45nXCQKuUx6ZP3-bYwypTyrYzWadR4yzDd4ambExbQquvo/exec";
const ADMIN_GESTION_EMAIL = "gestiones@escuelalosmitos.com";
const ADMIN_COPY_GESTION_TYPES = new Set(["baja", "mantenimiento", "reactivar_plaza", "ampliar_clases", "cambio_horario"]);
const ANNOUNCEMENT_EMAIL_TO = "gestiones@escuelalosmitos.com";
const ANNOUNCEMENT_EMAIL_BATCH_SIZE = 50;
const BI_WEEKS_PER_MONTH = 4.333;
const MAINTENANCE_MONTHLY_FEE = 15;
const STUDENT_PORTAL_URL = "alumnos.escuelalosmitos.com";
const SUPPORT_EMAIL = "soporte@escuelalosmitos.com";

const SEDES = ["Tarragona", "Reus"];
const SALAS = ["Sala 1", "Sala 2", "Sala 3"];

const SCHEDULE_HOURS = ["09:00", "10:00", "11:00", "12:00", "13:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"];

const defaultRoomCapacities = {
  Tarragona: { 'Sala 1': 10, 'Sala 2': 8, 'Sala 3': 4 },
  Reus: { 'Sala 1': 8, 'Sala 2': 5, 'Sala 3': 4 }
};

const defaultInstrumentos = ["Guitarra", "Canto", "Teclado", "Batería", "Bajo", "Ukelele", "Armónica", "Sensibilización", "Violín"];

const PROJECTABLE_GESTION_TYPES = new Set(["baja", "mantenimiento", "reactivar_plaza", "cambio_horario", "ampliar_clases"]);
const TADOSI_REQUIRED_GESTION_TYPES = new Set(["baja", "mantenimiento", "reactivar_plaza", "cambio_horario", "ampliar_clases"]);
const HISTORIAL_TRAMITES_BLOCK_SIZE = 30;

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

const getTeacherTaskRequestLabel = (value = 'otro') => TEACHER_TASK_REQUEST_TYPES.find(type => type.value === value)?.label || 'Otra petición';
const getTeacherTaskStatusLabel = (status = 'pendiente') => TEACHER_TASK_STATUS_LABELS[status] || status || 'Pendiente';
const getTeacherTaskStatusStyle = (status = 'pendiente') => TEACHER_TASK_STATUS_STYLE[status] || 'bg-zinc-50 text-zinc-600 border-zinc-200';


const formatDateSpanish = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

const normalizeStudentClassStartDate = (value) => String(value || '').trim();

const getStudentClassStartDate = (studentEntry = {}, studentInfo = {}) => normalizeStudentClassStartDate(
  studentEntry.classStartDate || studentEntry.startDate || studentInfo.classStartDate || studentInfo.startDate || ''
);

const normalizeStudentClassEndDate = (value) => String(value || '').trim();

const getStudentClassEndDate = (studentEntry = {}, studentInfo = {}) => normalizeStudentClassEndDate(
  studentEntry.classEndDate || studentEntry.endDate || studentInfo.classEndDate || studentInfo.endDate || ''
);

const hasFutureClassStartDate = (studentEntry = {}, studentInfo = {}, todayStr = getTodayLocalString()) => {
  const startDate = getStudentClassStartDate(studentEntry, studentInfo);
  return Boolean(startDate && startDate > todayStr);
};

const hasStudentClassEndedBeforeDate = (studentEntry = {}, studentInfo = {}, dateStr = getTodayLocalString()) => {
  const endDate = getStudentClassEndDate(studentEntry, studentInfo);
  return Boolean(endDate && endDate < dateStr);
};

const isStudentClassActiveOnDate = (studentEntry = {}, studentInfo = {}, dateStr = getTodayLocalString()) => {
  const startDate = getStudentClassStartDate(studentEntry, studentInfo);
  const endDate = getStudentClassEndDate(studentEntry, studentInfo);
  if (startDate && startDate > dateStr) return false;
  if (endDate && endDate < dateStr) return false;
  return true;
};

const isStudentClassCommittedOnDate = (studentEntry = {}, studentInfo = {}, dateStr = getTodayLocalString()) => {
  return !hasStudentClassEndedBeforeDate(studentEntry, studentInfo, dateStr);
};

const formatStudentClassStartLabel = (dateString) => {
  if (!dateString) return '';
  return `inicio clases: ${formatDateSpanish(dateString)}`;
};

const formatStudentClassEndLabel = (dateString) => {
  if (!dateString) return '';
  return `fin clases: ${formatDateSpanish(dateString)}`;
};

const normalizeAnnouncementUrl = (url = '') => {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) return '';
  if (!/^https?:\/\//i.test(cleanUrl)) return null;
  return cleanUrl;
};

const getTodayLocalString = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getNextMonthEndString = (dateString = getTodayLocalString()) => {
  const [yearRaw, monthRaw] = String(dateString || getTodayLocalString()).split('-').map(Number);
  const year = Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear();
  const month = Number.isFinite(monthRaw) ? monthRaw : (new Date().getMonth() + 1);
  const nextMonthEnd = new Date(year, month + 1, 0);
  const y = nextMonthEnd.getFullYear();
  const m = String(nextMonthEnd.getMonth() + 1).padStart(2, '0');
  const d = String(nextMonthEnd.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getNextMonthStartString = (dateString = getTodayLocalString()) => {
  const [yearRaw, monthRaw] = String(dateString || getTodayLocalString()).split('-').map(Number);
  const year = Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear();
  const month = Number.isFinite(monthRaw) ? monthRaw : (new Date().getMonth() + 1);
  const nextMonthStart = new Date(year, month, 1);
  const y = nextMonthStart.getFullYear();
  const m = String(nextMonthStart.getMonth() + 1).padStart(2, '0');
  const d = String(nextMonthStart.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const isPunctualClass = (clase) => Boolean(clase?.date) || clase?.isRecurring === false;

const isOperationalClass = (clase, todayStr = getTodayLocalString()) => {
  if (!isPunctualClass(clase)) return true;
  return Boolean(clase?.date) && clase.date >= todayStr;
};

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

const getDayName = (dayIndex) => ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dayIndex];

const parseLocalDateString = (dateString) => {
  const [yearRaw, monthRaw, dayRaw] = String(dateString || '').split('-').map(Number);
  if (!Number.isFinite(yearRaw) || !Number.isFinite(monthRaw) || !Number.isFinite(dayRaw)) return null;
  return new Date(yearRaw, monthRaw - 1, dayRaw);
};

const addDaysToLocalDateString = (dateString, days = 1) => {
  const date = parseLocalDateString(dateString);
  if (!date) return '';
  date.setDate(date.getDate() + Number(days || 0));
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const normalizeGestionDateString = (value = '') => {
  const clean = String(value || '').trim();
  if (!clean) return '';

  const iso = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${String(Number(iso[2])).padStart(2, '0')}-${String(Number(iso[3])).padStart(2, '0')}`;
  }

  const dmy = clean.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${String(Number(dmy[2])).padStart(2, '0')}-${String(Number(dmy[1])).padStart(2, '0')}`;
  }

  return '';
};

const getDateDayIndex = (dateString) => {
  const date = parseLocalDateString(dateString);
  return date ? date.getDay() : null;
};

const formatDateWithWeekday = (dateString) => {
  const date = parseLocalDateString(dateString);
  if (!date) return '';
  return date.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
};

const getNextClassDateForDay = (dayOfWeek, fromDateString = getTodayLocalString()) => {
  const targetDay = Number(dayOfWeek);
  const fromDate = parseLocalDateString(fromDateString) || new Date();
  if (!Number.isFinite(targetDay)) return getTodayLocalString();
  const diff = (targetDay - fromDate.getDay() + 7) % 7;
  const targetDate = new Date(fromDate);
  targetDate.setDate(fromDate.getDate() + diff);
  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, '0');
  const d = String(targetDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getClassStartDateWarning = (classStartDate, classDayOfWeek, todayStr = getTodayLocalString()) => {
  const cleanDate = normalizeStudentClassStartDate(classStartDate);
  if (!cleanDate) return '';
  const selectedDay = getDateDayIndex(cleanDate);
  const expectedDay = Number(classDayOfWeek);
  if (selectedDay !== null && Number.isFinite(expectedDay) && selectedDay !== expectedDay) {
    return `La fecha elegida cae en ${getDayName(selectedDay)}, pero esta clase es los ${getDayName(expectedDay)}.`;
  }
  if (cleanDate < todayStr) {
    return 'La fecha elegida es anterior a hoy.';
  }
  return '';
};

const downloadTextFile = (filename, content, mimeType = 'text/plain;charset=utf-8') => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const escapeCsvCell = (value) => {
  const clean = String(value ?? '').replace(/\r?\n/g, ' ').trim();
  return `"${clean.replace(/"/g, '""')}"`;
};

const TEACHER_DEFAULT_COLORS = [
  '#2563eb', // azul
  '#dc2626', // rojo
  '#16a34a', // verde
  '#d97706', // naranja
  '#7c3aed', // violeta
  '#0891b2', // cian
  '#db2777', // rosa
  '#475569'  // pizarra
];

const DEFAULT_TEACHER_COLOR = '#334155';

const isValidHexColor = (value) => /^#[0-9A-Fa-f]{6}$/.test(String(value || '').trim());

const hexToRgb = (hex) => {
  const clean = String(hex || DEFAULT_TEACHER_COLOR).replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16)
  };
};

const buildTeacherColorTheme = (hex = DEFAULT_TEACHER_COLOR) => {
  const safeHex = isValidHexColor(hex) ? hex : DEFAULT_TEACHER_COLOR;
  const { r, g, b } = hexToRgb(safeHex);
  return {
    soft: `rgba(${r}, ${g}, ${b}, .10)`,
    border: `rgba(${r}, ${g}, ${b}, .55)`,
    solid: safeHex,
    solidBorder: `rgba(${r}, ${g}, ${b}, .85)`,
    text: safeHex,
    muted: 'rgba(255,255,255,.86)'
  };
};

const getFallbackTeacherColor = (teacherName = 'Sin Asignar') => {
  const cleanName = String(teacherName || 'Sin Asignar').trim();
  if (!cleanName || cleanName === 'Sin Asignar') return DEFAULT_TEACHER_COLOR;
  let hash = 0;
  for (let i = 0; i < cleanName.length; i++) {
    hash = cleanName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TEACHER_DEFAULT_COLORS[Math.abs(hash) % TEACHER_DEFAULT_COLORS.length];
};

const getTeacherColorTheme = (teacherName = 'Sin Asignar', settings = {}) => {
  const cleanName = String(teacherName || 'Sin Asignar').trim();
  const configuredColor = settings?.teacherColors?.[cleanName];
  return buildTeacherColorTheme(isValidHexColor(configuredColor) ? configuredColor : getFallbackTeacherColor(cleanName));
};

const generateTicketDates = () => {
  const now = new Date();
  let nextY = now.getFullYear();
  let nextM = now.getMonth() + 2; 
  if (nextM > 12) {
    nextM = 1;
    nextY++;
  }
  const validFrom = `${nextY}-${String(nextM).padStart(2, '0')}-01`;
  const lastDay = new Date(nextY, nextM, 0).getDate();
  const validUntil = `${nextY}-${String(nextM).padStart(2, '0')}-${lastDay}`;
  return { validFrom, validUntil };
};

const generateImmediateGiftTicketDates = () => {
  const now = new Date();
  const validFrom = now.toISOString().split('T')[0];
  const lastDayNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  const y = lastDayNextMonth.getFullYear();
  const m = String(lastDayNextMonth.getMonth() + 1).padStart(2, '0');
  const d = String(lastDayNextMonth.getDate()).padStart(2, '0');
  const validUntil = `${y}-${m}-${d}`;
  return { validFrom, validUntil };
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


const StableModalRenderer = ({ render }) => {
  const renderRef = useRef(render);
  renderRef.current = render;
  return renderRef.current();
};



const ManualTaskModalOverlay = ({ open, onClose, settings, recurringClassesOnly, getTeacherEmail, db, appId, user }) => {
  const teacherOptions = useMemo(() => [...new Set([
    ...(settings?.teachersList || []),
    ...(recurringClassesOnly || []).map(c => c.teacher).filter(Boolean)
  ])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'es')), [settings?.teachersList, recurringClassesOnly]);

  const buildInitialForm = () => ({
    title: '',
    details: '',
    person: '',
    type: 'tarea_manual',
    teacherName: teacherOptions[0] || '',
    priority: 'normal',
    dueDate: ''
  });

  const [form, setForm] = useState(buildInitialForm);
  const [saving, setSaving] = useState(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setForm(buildInitialForm());
      setSaving(false);
    }
    wasOpenRef.current = Boolean(open);
  }, [open]);

  const isTeacherAssignment = form.type === 'encargo_profesor';

  const handleClose = () => {
    if (saving) return;
    onClose?.();
  };

  const handleCreate = async () => {
    const title = form.title.trim();
    const details = form.details.trim();

    if (!title) {
      alert('Rellena al menos el título de la tarea.');
      return;
    }

    if (isTeacherAssignment && !String(form.teacherName || '').trim()) {
      alert('Selecciona el profesor destinatario del encargo.');
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();

      if (isTeacherAssignment) {
        const teacherName = String(form.teacherName || '').trim();
        const taskId = `admin-assignment-${Date.now()}`;
        await setDoc(doc(db, 'artifacts', appId, 'teacherTasks', taskId), {
          type: 'admin_assignment',
          direction: 'admin_to_teacher',
          title,
          description: details,
          teacherName,
          teacherEmail: getTeacherEmail(teacherName),
          priority: form.priority || 'normal',
          dueDate: form.dueDate || '',
          status: 'pendiente',
          createdAt: now,
          updatedAt: now,
          createdBy: user?.email || 'admin',
          createdFrom: 'admin_portal'
        });

        alert(`✅ Encargo enviado a ${teacherName}. Aparecerá en su TeacherPortal, pestaña Tareas > Encargos.`);
        onClose?.();
        return;
      }

      const taskId = `manual-${Date.now()}`;
      const taskPayload = {
        type: form.type || 'tarea_manual',
        title,
        details,
        studentId: null,
        studentName: form.person.trim() || 'Tarea manual',
        studentEmail: '',
        source: 'manual_admin',
        status: 'pendiente',
        date: now
      };
      await setDoc(doc(db, 'artifacts', appId, 'gestiones', taskId), taskPayload);

      alert('✅ Tarea manual añadida a la bandeja.');
      onClose?.();
    } catch (error) {
      alert('❌ Error al crear la tarea manual: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button onClick={handleClose} disabled={saving} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full disabled:opacity-50"><X className="w-5 h-5"/></button>

        <div className="flex items-center gap-3 text-slate-900 mb-6">
          <Inbox className="w-8 h-8 text-red-600" />
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">Nueva Tarea Manual</h2>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Bandeja interna o encargo directo a un profesor.</p>
          </div>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Tipo</label>
            <select
              value={form.type}
              onChange={e => setForm(prev => ({
                ...prev,
                type: e.target.value,
                teacherName: e.target.value === 'encargo_profesor' ? (prev.teacherName || teacherOptions[0] || '') : prev.teacherName
              }))}
              className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-black"
            >
              <option value="tarea_manual">Tarea manual</option>
              <option value="llamada">Llamada pendiente</option>
              <option value="seguimiento">Seguimiento</option>
              <option value="incidencia_manual">Incidencia</option>
              <option value="encargo_profesor">Encargo a profesor</option>
            </select>
          </div>

          {isTeacherAssignment ? (
            <>
              <div className="bg-violet-50 border border-violet-100 text-violet-900 p-4 rounded-2xl text-xs font-bold leading-relaxed">
                Este encargo no entra en la bandeja de alumnos. Se enviará a la pestaña <b>Tareas</b> del profesor elegido, donde podrá marcarlo en curso, completarlo o rechazarlo con motivo.
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-violet-700 mb-1 block">Profesor destinatario *</label>
                <select value={form.teacherName} onChange={e => setForm(prev => ({ ...prev, teacherName: e.target.value }))} className="w-full p-3 bg-violet-50 border-2 border-violet-100 rounded-xl font-bold text-sm outline-none focus:border-violet-600">
                  <option value="">Selecciona profesor...</option>
                  {teacherOptions.map(teacherName => <option key={teacherName} value={teacherName}>{teacherName} · {getTeacherEmail(teacherName)}</option>)}
                </select>
                {teacherOptions.length === 0 && <p className="text-[10px] text-red-500 font-bold mt-1">No hay profesores configurados. Añádelos en ajustes o crea antes una clase con profesor.</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Prioridad</label>
                  <select value={form.priority} onChange={e => setForm(prev => ({ ...prev, priority: e.target.value }))} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-black">
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Fecha límite</label>
                  <input type="date" value={form.dueDate} onChange={e => setForm(prev => ({ ...prev, dueDate: e.target.value }))} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-black" />
                </div>
              </div>
            </>
          ) : (
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Persona relacionada</label>
              <input type="text" value={form.person} onChange={e => setForm(prev => ({ ...prev, person: e.target.value }))} placeholder="Ej: Sara, madre de Hugo, Norman..." className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-black" />
            </div>
          )}

          <div>
            <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Título *</label>
            <input type="text" value={form.title} onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))} placeholder={isTeacherAssignment ? 'Ej: Revisar cables de Sala 2' : 'Ej: Cambiar a Hugo de grupo'} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-black" />
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Detalles <span className="text-zinc-300">(opcional)</span></label>
            <textarea value={form.details} onChange={e => setForm(prev => ({ ...prev, details: e.target.value }))} placeholder={isTeacherAssignment ? 'Explica claramente qué necesitas que haga el profesor...' : 'Opcional. Añade contexto si el título no basta...'} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl focus:border-black outline-none min-h-[130px] resize-y text-sm font-medium text-slate-700" />
          </div>
        </div>

        <button onClick={handleCreate} disabled={saving || !form.title.trim() || (isTeacherAssignment && !form.teacherName)} className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-800 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? 'Guardando...' : <><Plus className="w-4 h-4"/> {isTeacherAssignment ? 'Enviar encargo al profesor' : 'Añadir a Bandeja'}</>}
        </button>
      </div>
    </div>
  );
};

const TemporaryRelocationModalOverlay = ({
  student,
  onClose,
  recurringClassesOnly,
  temporaryRelocations,
  getStudentAssignedClasses,
  getStudentTemporaryRelocations,
  getCommercialCommittedSeatCount,
  isTemporaryRelocationActiveForDate,
  doDateRangesOverlap,
  formatClassLine,
  sendTeacherNotification,
  sendStudentNotification,
  db,
  appId,
  user,
  todayStr
}) => {
  const assignedClasses = useMemo(() => {
    if (!student?.id) return [];
    return getStudentAssignedClasses(student.id).filter(c => !isPunctualClass(c));
  }, [student?.id, getStudentAssignedClasses]);

  const defaultSourceClassId = assignedClasses[0]?.id || '';
  const [sourceClassId, setSourceClassId] = useState('');
  const [targetClassId, setTargetClassId] = useState('');
  const [fromDate, setFromDate] = useState(todayStr);
  const [untilDate, setUntilDate] = useState(todayStr);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const lastStudentIdRef = useRef('');

  useEffect(() => {
    if (!student?.id) {
      lastStudentIdRef.current = '';
      return;
    }
    if (lastStudentIdRef.current === student.id) return;

    lastStudentIdRef.current = student.id;
    setSourceClassId(defaultSourceClassId);
    setTargetClassId('');
    setFromDate(todayStr);
    setUntilDate(todayStr);
    setNotes('');
    setSaving(false);
  }, [student?.id, defaultSourceClassId, todayStr]);

  const sourceClass = (recurringClassesOnly || []).find(c => c.id === sourceClassId) || assignedClasses[0] || null;
  const possibleTargets = (recurringClassesOnly || [])
    .filter(c => c.id !== sourceClassId)
    .sort((a, b) => {
      const subjectA = a.subject === sourceClass?.subject ? 0 : 1;
      const subjectB = b.subject === sourceClass?.subject ? 0 : 1;
      if (subjectA !== subjectB) return subjectA - subjectB;
      return `${a.sede || ''}${a.dayOfWeek}${a.time}`.localeCompare(`${b.sede || ''}${b.dayOfWeek}${b.time}`);
    });
  const targetClass = (recurringClassesOnly || []).find(c => c.id === targetClassId) || null;
  const currentRelocations = student?.id ? getStudentTemporaryRelocations(student.id) : [];

  const cancelRelocation = async (relocation) => {
    if (!window.confirm(`¿Cancelar esta recolocación temporal de ${student?.name || 'alumno'}?\n\n${relocation.sourceClassLine || relocation.sourceClassId}\n→ ${relocation.targetClassLine || relocation.targetClassId}`)) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'temporaryRelocations', relocation.id), {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: user?.email || 'admin'
      });
      alert('✅ Recolocación temporal cancelada.');
    } catch (e) {
      alert('Error al cancelar: ' + e.message);
    }
  };

  const createRelocation = async () => {
    if (!student?.id) return;
    if (!sourceClass?.id) return alert('El alumno no tiene clase de origen seleccionada.');
    if (!targetClass?.id) return alert('Selecciona una clase de destino.');
    if (!fromDate || !untilDate) return alert('Indica fecha desde y hasta.');
    if (fromDate > untilDate) return alert('La fecha DESDE no puede ser posterior a la fecha HASTA.');
    if (sourceClass.id === targetClass.id) return alert('La clase de origen y destino no pueden ser la misma.');

    const overlapping = (temporaryRelocations || []).find(rel =>
      rel.studentId === student.id &&
      rel.status !== 'cancelled' &&
      doDateRangesOverlap(fromDate, untilDate, rel.from, rel.until)
    );

    if (overlapping) {
      return alert(`Este alumno ya tiene una recolocación temporal que se solapa con esas fechas:\n\n${overlapping.sourceClassLine || overlapping.sourceClassId}\n→ ${overlapping.targetClassLine || overlapping.targetClassId}\n${formatDateSpanish(overlapping.from)} - ${formatDateSpanish(overlapping.until)}`);
    }

    const formalTargetCount = getCommercialCommittedSeatCount(targetClass);
    const targetCapacity = parseInt(targetClass.capacity || 0, 10);
    if (targetCapacity > 0 && formalTargetCount >= targetCapacity) {
      const ok = window.confirm(`⚠️ La clase destino ya está completa formalmente (${formalTargetCount}/${targetCapacity}).\n\nLa recolocación NO ocupará plaza formal, pero sí añadirá una persona real a la sala durante ese periodo.\n\n¿Continuar igualmente?`);
      if (!ok) return;
    }

    const displayName = student.useAlias && student.alias ? student.alias : student.name;
    const relocationId = `reloc-${Date.now()}`;
    const payload = {
      studentId: student.id,
      studentName: displayName,
      studentEmail: student.email || '',
      sourceClassId: sourceClass.id,
      sourceClassRefPath: sourceClass.refPath || '',
      sourceClassLine: formatClassLine(sourceClass),
      sourceTeacher: sourceClass.teacher || '',
      targetClassId: targetClass.id,
      targetClassRefPath: targetClass.refPath || '',
      targetClassLine: formatClassLine(targetClass),
      targetTeacher: targetClass.teacher || '',
      from: fromDate,
      until: untilDate,
      status: 'active',
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
      createdBy: user?.email || 'admin'
    };

    setSaving(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'temporaryRelocations', relocationId), payload);

      const periodLine = `${formatDateSpanish(fromDate)} al ${formatDateSpanish(untilDate)}`;
      if (sourceClass.teacher) {
        await sendTeacherNotification({
          teacherName: sourceClass.teacher,
          subject: `Recolocación temporal: ${displayName} deja tu clase temporalmente`,
          body: `Hola ${sourceClass.teacher},\n\nDesde coordinación te informamos de que ${displayName} será recolocado temporalmente fuera de tu clase durante este periodo:\n\n${periodLine}\n\nClase de origen:\n· ${formatClassLine(sourceClass)}\n\nClase temporal de destino:\n· ${formatClassLine(targetClass)}\n\nDurante ese periodo no aparecerá en tu lista de asistencia. Su plaza formal sigue reservada en tu clase.\n\nUn saludo,\nCoordinación Los Mitos.`
        });
      }

      if (targetClass.teacher && targetClass.teacher !== sourceClass.teacher) {
        await sendTeacherNotification({
          teacherName: targetClass.teacher,
          subject: `Alumno recolocado temporalmente: ${displayName}`,
          body: `Hola ${targetClass.teacher},\n\nDesde coordinación te informamos de que ${displayName} aparecerá temporalmente en tu lista de asistencia durante este periodo:\n\n${periodLine}\n\nClase temporal:\n· ${formatClassLine(targetClass)}\n\nAparecerá marcado como alumno recolocado temporalmente. No ocupa plaza formal en tu grupo, pero debes pasarle lista con normalidad.\n\nUn saludo,\nCoordinación Los Mitos.`
        });
      }

      await sendStudentNotification({
        studentEmail: student.email || '',
        subject: `Recolocación temporal de clase - Escuela Los Mitos`,
        body: `Hola ${student.name},\n\nTe confirmamos tu recolocación temporal de clase para el periodo ${periodLine}.\n\nDurante este periodo tu clase será:\n· ${formatClassLine(targetClass)}\nProfesor/a: ${targetClass.teacher || 'Profesor/a'}\n\nFuera de ese periodo volverás a figurar en tu clase habitual:\n· ${formatClassLine(sourceClass)}\n\nTu plaza habitual sigue reservada.\n\nUn saludo,\nCoordinación Los Mitos.`
      });

      alert('✅ Recolocación temporal creada. TeacherPortal y StudentPortal la aplicarán durante el periodo indicado.');
      onClose?.();
    } catch (e) {
      alert('Error al crear la recolocación temporal: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!student) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-[100] flex items-start sm:items-center justify-center p-4 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative my-4">
        <button onClick={onClose} disabled={saving} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full disabled:opacity-50"><X className="w-5 h-5"/></button>
        <div className="flex items-center gap-3 text-slate-800 mb-2">
          <ArrowRightLeft className="w-8 h-8 text-violet-600" />
          <h2 className="text-xl font-black uppercase tracking-tight">Recolocación temporal</h2>
        </div>
        <p className="text-sm font-bold text-zinc-500 mb-6">{student.name}{student.alias ? ` · ${student.alias}` : ''}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1 block">Clase origen formal</label>
            <select value={sourceClassId} onChange={e => { setSourceClassId(e.target.value); setTargetClassId(''); }} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-violet-500">
              {assignedClasses.length === 0 && <option value="">Sin clase formal</option>}
              {assignedClasses.map(c => <option key={c.id} value={c.id}>{formatClassLine(c)} · Prof. {c.teacher}</option>)}
            </select>
            <p className="text-[10px] text-zinc-400 font-bold mt-1">Esta plaza no se libera.</p>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1 block">Clase destino temporal</label>
            <select value={targetClassId} onChange={e => setTargetClassId(e.target.value)} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-violet-500">
              <option value="">Selecciona destino...</option>
              {possibleTargets.map(c => {
                const formalCount = getCommercialCommittedSeatCount(c);
                return <option key={c.id} value={c.id}>{formatClassLine(c)} · Prof. {c.teacher} · {formalCount}/{c.capacity || '?'}</option>;
              })}
            </select>
            <p className="text-[10px] text-zinc-400 font-bold mt-1">No ocupará plaza formal en el destino.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1 block">Desde</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full p-3 bg-violet-50 border-2 border-violet-100 rounded-xl font-bold text-sm outline-none focus:border-violet-500" />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1 block">Hasta</label>
            <input type="date" value={untilDate} onChange={e => setUntilDate(e.target.value)} className="w-full p-3 bg-violet-50 border-2 border-violet-100 rounded-xl font-bold text-sm outline-none focus:border-violet-500" />
          </div>
        </div>

        <div className="mb-6">
          <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1 block">Notas internas opcionales</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej: cambio temporal por obras, conciliación, prueba de horario..." className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-violet-500 min-h-[90px]" />
        </div>

        {currentRelocations.length > 0 && (
          <div className="mb-6 p-4 bg-zinc-50 border border-zinc-200 rounded-2xl">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">Recolocaciones existentes</h3>
            <div className="space-y-2">
              {currentRelocations.map(rel => (
                <div key={rel.id} className="flex items-start justify-between gap-3 bg-white border border-zinc-200 rounded-xl p-3">
                  <div>
                    <p className="text-xs font-black text-slate-800">{formatDateSpanish(rel.from)} - {formatDateSpanish(rel.until)}</p>
                    <p className="text-[10px] font-bold text-zinc-500 leading-relaxed">{rel.sourceClassLine || rel.sourceClassId} → {rel.targetClassLine || rel.targetClassId}</p>
                    <p className={`mt-1 text-[9px] font-black uppercase tracking-widest ${isTemporaryRelocationActiveForDate(rel) ? 'text-emerald-600' : 'text-zinc-400'}`}>{isTemporaryRelocationActiveForDate(rel) ? 'Activa hoy' : 'No activa hoy'}</p>
                  </div>
                  <button onClick={() => cancelRelocation(rel)} disabled={saving} className="px-3 py-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest disabled:opacity-50">Cancelar</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={createRelocation} disabled={saving || assignedClasses.length === 0} className="w-full bg-violet-600 text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-violet-700 transition-all shadow-md disabled:opacity-50">
          {saving ? 'Creando recolocación...' : 'Crear recolocación temporal'}
        </button>
      </div>
    </div>
  );
};

export default function AdminPortal({ user, logout, db, appId, switchToTeacher }) {
  const [activeTab, setActiveTab] = useState('gestiones');
  const [loading, setLoading] = useState(true);

  // --- DATOS GLOBALES ---
  const [gestiones, setGestiones] = useState([]);
  const [students, setStudents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [allClasses, setAllClasses] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [availabilities, setAvailabilities] = useState({}); 
  const [allTickets, setAllTickets] = useState([]);
  const [payrollAdjustments, setPayrollAdjustments] = useState([]);
  const [temporaryRelocations, setTemporaryRelocations] = useState([]);
  const [maintenancePeriods, setMaintenancePeriods] = useState([]);
  const [teacherTasks, setTeacherTasks] = useState([]);
  
  const [settings, setSettings] = useState({ 
    festivos: [], festivosTarragona: [], festivosReus: [], vacaciones: [], contract: '', teacherRules: '', 
    hourlyRate: 17.33, costeEmpresa: 22, gastosFijos: { global: 0, tarragona: 0, reus: 0 },
    generalTasks: [], prizes: { trimestral: '', anual: '' }, teachersList: [], teacherColors: {},
    roomCapacities: defaultRoomCapacities, instrumentos: defaultInstrumentos
  });

  // --- ESTADOS LOCALES UI ---
  const [searchStudent, setSearchStudent] = useState('');
  const [filterStatus, setFilterStatus] = useState('activo');
  const [newAnnounce, setNewAnnounce] = useState({ title: '', content: '', url: '' });
  const [announceEmailOptions, setAnnounceEmailOptions] = useState({ enabled: false, targetType: 'all', targetValue: '' });
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null);
  const [visibleAnnouncementsCount, setVisibleAnnouncementsCount] = useState(10);
  const [expandedTeacher, setExpandedTeacher] = useState(null); 
  const [notesModal, setNotesModal] = useState(null); 
  const [editStudentModal, setEditStudentModal] = useState(null); 
  const [temporaryRelocationModal, setTemporaryRelocationModal] = useState(null);
  const [manualTaskModal, setManualTaskModal] = useState(false);
  const [payrollAdjustModal, setPayrollAdjustModal] = useState(null);
  const [inboxSection, setInboxSection] = useState('gestiones');
  const [teacherTaskInboxFilter, setTeacherTaskInboxFilter] = useState('todas');
  const [gestionPendingFilter, setGestionPendingFilter] = useState('todas');
  const [gestionSearchTerm, setGestionSearchTerm] = useState('');
  const [resolvedGestionesVisible, setResolvedGestionesVisible] = useState(HISTORIAL_TRAMITES_BLOCK_SIZE);
  const [dangerViewMode, setDangerViewMode] = useState('actual');
  const [dangerSubView, setDangerSubView] = useState('ocupacion');
  const [bulkExecutingGestiones, setBulkExecutingGestiones] = useState(false);
  const [bulkConsolidatingGestiones, setBulkConsolidatingGestiones] = useState(false);
  
  // VISTA ARQUITECTO E INFORMES
  const [classesViewMode, setClassesViewMode] = useState('profesores'); // 'profesores', 'salas' o 'hibernadas'
  const [archProjectionMode, setArchProjectionMode] = useState('actual'); // 'actual' o 'proyeccion'
  const [archDate, setArchDate] = useState(getTodayLocalString());
  const [archDay, setArchDay] = useState('1'); // Compatibilidad interna para creación de clases
  const [archTime, setArchTime] = useState('17:00');
  const [archSede, setArchSede] = useState('Tarragona');
  const [informeSubTab, setInformeSubTab] = useState('resumen'); // 'resumen', 'sedes', 'instrumentos', 'profesores', 'semaforo'

  // ESTADOS MODALES CLASES
  const [createClassModal, setCreateClassModal] = useState(false);
  const [changeClassModal, setChangeClassModal] = useState(null);
  const [resurrectClassModal, setResurrectClassModal] = useState(null); 
  const [viewClassModal, setViewClassModal] = useState(null); 
  const [editWebModal, setEditWebModal] = useState(null); 
  const [editClassModal, setEditClassModal] = useState(null);
  const [editClassData, setEditClassData] = useState(null);
  const [socialModalText, setSocialModalText] = useState(''); 
  const [photosModalOpen, setPhotosModalOpen] = useState(false);
  const [selectedInstForChange, setSelectedInstForChange] = useState('');
  
  const [newClassData, setNewClassData] = useState({
    isRecurring: true, specificDate: new Date().toISOString().split('T')[0], 
    dayOfWeek: '1', time: '17:00', sede: 'Tarragona', sala: 'Sala 1',
    teacher: '', subject: '', capacity: '', duration: 60, cuotaBase: 60, notes: ''
  });

  const [mboxAdminDate, setMboxAdminDate] = useState(new Date().toISOString().split('T')[0]);
  const [mboxAdminSede, setMboxAdminSede] = useState('Tarragona');

  const [selectedPayrollMonth, setSelectedPayrollMonth] = useState(new Date().toISOString().substring(0, 7));
  const availableMonths = useMemo(() => generateLast12Months(), []);

  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    let loaded = 0;
    const checkLoad = () => { loaded++; if(loaded === 12) setLoading(false); };

    const unsubGestiones = onSnapshot(collection(db, 'artifacts', appId, 'gestiones'), (snap) => { 
      setGestiones(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => new Date(b.date) - new Date(a.date))); 
      checkLoad(); 
    });
    const unsubStudents = onSnapshot(collection(db, 'artifacts', appId, 'students'), (snap) => { 
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.name.localeCompare(b.name))); 
      checkLoad(); 
    });
    const unsubAnnouncements = onSnapshot(collection(db, 'artifacts', appId, 'announcements'), (snap) => { 
      setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => new Date(b.date) - new Date(a.date))); 
      checkLoad(); 
    });
    const unsubSettings = onSnapshot(doc(db, 'artifacts', appId, 'settings', 'global'), (docSnap) => { 
      if (docSnap.exists()) {
        const data = docSnap.data();
        setSettings(prev => ({ 
          ...prev, 
          ...data,
          roomCapacities: data.roomCapacities || defaultRoomCapacities,
          instrumentos: data.instrumentos || defaultInstrumentos,
          teacherColors: data.teacherColors || {},
          costeEmpresa: data.costeEmpresa || 22,
          gastosFijos: data.gastosFijos || { global: 0, tarragona: 0, reus: 0 }
        }));
      }
      checkLoad(); 
    });
    const unsubClasses = onSnapshot(collectionGroup(db, 'recurringClasses'), (snap) => {
      setAllClasses(snap.docs.map(d => ({ id: d.id, refPath: d.ref.path, ...d.data() })));
      checkLoad();
    });
    const unsubRecords = onSnapshot(collectionGroup(db, 'records'), (snap) => {
      setAllRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      checkLoad();
    });
    const unsubAvail = onSnapshot(collection(db, 'artifacts', appId, 'availability'), (snap) => {
      const av = {};
      snap.forEach(d => { av[d.id] = d.data().slots || {}; });
      setAvailabilities(av);
      checkLoad();
    });

    const unsubTickets = onSnapshot(collectionGroup(db, 'tickets'), (snap) => {
      setAllTickets(snap.docs.map(d => ({ id: d.id, refPath: d.ref.path, ...d.data() })));
      checkLoad();
    });

    const unsubPayrollAdjustments = onSnapshot(collection(db, 'artifacts', appId, 'payrollAdjustments'), (snap) => {
      setPayrollAdjustments(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
      checkLoad();
    });

    const unsubTemporaryRelocations = onSnapshot(collection(db, 'artifacts', appId, 'temporaryRelocations'), (snap) => {
      setTemporaryRelocations(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
      checkLoad();
    });

    const unsubMaintenancePeriods = onSnapshot(collection(db, 'artifacts', appId, 'maintenancePeriods'), (snap) => {
      setMaintenancePeriods(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
      checkLoad();
    });

    const unsubTeacherTasks = onSnapshot(collection(db, 'artifacts', appId, 'teacherTasks'), (snap) => {
      setTeacherTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0)));
      checkLoad();
    });

    return () => { unsubGestiones(); unsubStudents(); unsubAnnouncements(); unsubSettings(); unsubClasses(); unsubRecords(); unsubAvail(); unsubTickets(); unsubPayrollAdjustments(); unsubTemporaryRelocations(); unsubMaintenancePeriods(); unsubTeacherTasks(); };
  }, [appId, db]);

  useEffect(() => {
    if (viewClassModal) {
      const updatedClass = allClasses.find(c => c.id === viewClassModal.id);
      if (updatedClass) {
        setViewClassModal(updatedClass);
      }
    }
  }, [allClasses, viewClassModal?.id]);

  const isLastDayOfMonth = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.getDate() === 1;
  }, []);

  const todayStr = useMemo(() => getTodayLocalString(), []);
  const nextMonthStartStr = useMemo(() => getNextMonthStartString(todayStr), [todayStr]);
  const nextMonthEndStr = useMemo(() => getNextMonthEndString(todayStr), [todayStr]);

  const operationalClasses = useMemo(() => {
    return allClasses.filter(c => isOperationalClass(c, todayStr));
  }, [allClasses, todayStr]);

  const recurringClassesOnly = useMemo(() => {
    return allClasses.filter(c => !isPunctualClass(c));
  }, [allClasses]);

  const isFixedClassStudent = (studentEntry = {}) => {
    return !(
      studentEntry?.isRecovery === true ||
      studentEntry?.isTemporary === true ||
      studentEntry?.isPunctual === true ||
      studentEntry?.isTemporaryRelocation === true ||
      Boolean(studentEntry?.temporaryRelocationId) ||
      studentEntry?.type === 'recovery' ||
      studentEntry?.status === 'recovery'
    );
  };

  const doDateRangesOverlap = (fromA, untilA, fromB, untilB) => {
    if (!fromA || !untilA || !fromB || !untilB) return false;
    return fromA <= untilB && fromB <= untilA;
  };

  const isMaintenancePeriodActiveForDate = (period = {}, dateStr = todayStr) => {
    if (!period || ['cancelled', 'cancelada', 'finalizada'].includes(period.status)) return false;
    return Boolean(period.from && period.until && period.from <= dateStr && period.until >= dateStr);
  };

  const isMaintenancePeriodOverlappingRange = (period = {}, fromDate = todayStr, untilDate = todayStr) => {
    if (!period || ['cancelled', 'cancelada', 'finalizada'].includes(period.status)) return false;
    return doDateRangesOverlap(fromDate, untilDate, period.from, period.until);
  };

  const getStudentMaintenancePeriods = (studentId) => {
    if (!studentId) return [];
    return maintenancePeriods.filter(period => period.studentId === studentId && !['cancelled', 'cancelada', 'finalizada'].includes(period.status));
  };

  const getActiveStudentMaintenancePeriods = (studentId, dateStr = todayStr) => {
    return getStudentMaintenancePeriods(studentId).filter(period => isMaintenancePeriodActiveForDate(period, dateStr));
  };

  const getStudentMaintenancePeriodsInRange = (studentId, fromDate = todayStr, untilDate = todayStr) => {
    return getStudentMaintenancePeriods(studentId).filter(period => isMaintenancePeriodOverlappingRange(period, fromDate, untilDate));
  };

  const isStudentInMaintenance = (studentId, dateStr = todayStr) => getActiveStudentMaintenancePeriods(studentId, dateStr).length > 0;

  const isStudentInMaintenanceRange = (studentId, fromDate = todayStr, untilDate = todayStr) => getStudentMaintenancePeriodsInRange(studentId, fromDate, untilDate).length > 0;

  const getActiveStudentMaintenancePeriod = (studentId, dateStr = todayStr) => getActiveStudentMaintenancePeriods(studentId, dateStr)[0] || null;

  const formatLocalDateStringFromDate = (date) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getMonthStartStringFromDate = (dateString = todayStr) => {
    const date = parseLocalDateString(dateString) || parseLocalDateString(todayStr) || new Date();
    return formatLocalDateStringFromDate(new Date(date.getFullYear(), date.getMonth(), 1));
  };

  const getMonthStartStringWithOffset = (dateString = todayStr, offsetMonths = 1) => {
    const date = parseLocalDateString(dateString) || parseLocalDateString(todayStr) || new Date();
    return formatLocalDateStringFromDate(new Date(date.getFullYear(), date.getMonth() + offsetMonths, 1));
  };

  const getMonthIndexFromSpanishLabel = (label = '') => {
    const clean = String(label || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const months = [
      'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
      'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
    ];

    const directIndex = months.findIndex(monthName => clean.includes(monthName));
    if (directIndex >= 0) return directIndex;

    // Variante frecuente sin "p".
    if (clean.includes('setiembre')) return 8;
    return null;
  };

  const getMonthStartFromGestionTarget = (gestion = {}) => {
    const explicitStart = normalizeGestionDateString(gestion.effectiveStartDate || gestion.scheduledStartDate || gestion.newClassStartDate || gestion.classStartDate || '');
    if (explicitStart) return explicitStart;

    const targetMonthIndex = getMonthIndexFromSpanishLabel(gestion.targetMonth || gestion.targetMonthLabel || gestion.monthLabel || '');
    if (targetMonthIndex !== null) {
      const todayDate = parseLocalDateString(todayStr) || new Date();
      const currentMonthIndex = todayDate.getMonth();
      const year = targetMonthIndex < currentMonthIndex ? todayDate.getFullYear() + 1 : todayDate.getFullYear();
      return formatLocalDateStringFromDate(new Date(year, targetMonthIndex, 1));
    }

    return gestion.isLateRequest
      ? getMonthStartStringWithOffset(todayStr, 2)
      : nextMonthStartStr;
  };

  const getDefaultScheduledClassEndDate = (gestion = {}) => {
    const explicitEnd = normalizeGestionDateString(gestion.effectiveEndDate || gestion.scheduledEndDate || gestion.classEndDate || gestion.endDate || '');
    if (explicitEnd) return explicitEnd;

    const startDate = getMonthStartFromGestionTarget(gestion);
    return addDaysToLocalDateString(startDate, -1);
  };

  const getScheduledClassStartAfterEndDate = (endDate) => addDaysToLocalDateString(endDate, 1);

  const promptScheduledClassEndDate = (gestion = {}, actionLabel = 'este trámite', silentMode = false) => {
    const defaultEndDate = getDefaultScheduledClassEndDate(gestion);
    if (silentMode) return defaultEndDate;

    const defaultStartDate = getScheduledClassStartAfterEndDate(defaultEndDate);
    const answer = window.prompt(
      `Fecha efectiva de fin para ${actionLabel}.\n\nPor defecto se aplica al último día del mes administrativo: ${formatDateSpanish(defaultEndDate)}.\nDesde ${formatDateSpanish(defaultStartDate)} dejará de aparecer en Student/Teacher.\n\nPuedes cambiarla si necesitas una fecha especial. Formato: AAAA-MM-DD`,
      defaultEndDate
    );

    if (answer === null) return null;
    const cleanDate = normalizeGestionDateString(answer);
    if (!cleanDate) {
      alert('Fecha no válida. Usa formato AAAA-MM-DD, por ejemplo 2026-06-30.');
      return null;
    }
    return cleanDate;
  };

  const buildScheduledExecutionUpdate = (endDate, extra = {}) => ({
    workflowStatus: 'programado',
    executionMode: 'scheduled',
    scheduledClassEndDate: endDate,
    scheduledEffectiveDate: getScheduledClassStartAfterEndDate(endDate),
    scheduledAt: new Date().toISOString(),
    scheduledBy: user?.email || 'admin',
    ...extra
  });

  const applyScheduledEndToStudentEntry = (studentEntry = {}, endDate, reason, gestionId = '') => ({
    ...studentEntry,
    classEndDate: endDate,
    scheduledEndDate: endDate,
    scheduledEndReason: reason,
    scheduledGestionId: gestionId,
    scheduledAt: new Date().toISOString(),
    scheduledBy: user?.email || 'admin'
  });

  const getMaintenanceDefaultStartFromGestion = (gestion = {}) => {
    const explicitStart = String(gestion.maintenanceFrom || gestion.from || gestion.startDate || '').trim();
    if (explicitStart) return getMonthStartStringFromDate(explicitStart);

    const targetMonthIndex = getMonthIndexFromSpanishLabel(gestion.targetMonth || gestion.maintenanceMonthLabel || '');
    if (targetMonthIndex !== null) {
      const todayDate = parseLocalDateString(todayStr) || new Date();
      const currentMonthIndex = todayDate.getMonth();
      const year = targetMonthIndex < currentMonthIndex ? todayDate.getFullYear() + 1 : todayDate.getFullYear();
      return formatLocalDateStringFromDate(new Date(year, targetMonthIndex, 1));
    }

    return gestion.isLateRequest
      ? getMonthStartStringWithOffset(todayStr, 2)
      : nextMonthStartStr;
  };

  const parseMaintenanceMonths = (value) => {
    const months = parseInt(String(value || '').trim(), 10);
    return Number.isFinite(months) && months > 0 ? months : 0;
  };

  const calculateMaintenanceMonthsFromRange = (from, until) => {
    const start = parseLocalDateString(from);
    const end = parseLocalDateString(until);
    if (!start || !end || start > end) return 0;
    return Math.max(((end.getFullYear() - start.getFullYear()) * 12) + (end.getMonth() - start.getMonth()) + 1, 1);
  };

  const buildMaintenancePeriodByMonths = (startDateString, monthsRaw = 1) => {
    const months = parseMaintenanceMonths(monthsRaw) || 1;
    const startDate = parseLocalDateString(startDateString) || parseLocalDateString(nextMonthStartStr) || new Date();
    const firstDay = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const lastDay = new Date(startDate.getFullYear(), startDate.getMonth() + months, 0);

    return {
      from: formatLocalDateStringFromDate(firstDay),
      until: formatLocalDateStringFromDate(lastDay),
      months,
      monthlyFee: MAINTENANCE_MONTHLY_FEE,
      totalFee: months * MAINTENANCE_MONTHLY_FEE
    };
  };

  const getMaintenancePeriodFromGestion = (gestion = {}) => {
    const explicitFrom = String(gestion.maintenanceFrom || gestion.from || gestion.startDate || '').trim();
    const explicitUntil = String(gestion.maintenanceUntil || gestion.until || gestion.endDate || '').trim();
    const structuredMonths = parseMaintenanceMonths(gestion.maintenanceMonths || gestion.months || gestion.durationMonths);

    if (explicitFrom && explicitUntil) {
      const months = structuredMonths || calculateMaintenanceMonthsFromRange(explicitFrom, explicitUntil) || 1;
      const totalFee = Number(gestion.maintenanceFee || gestion.totalFee || gestion.totalMaintenanceFee) || (months * MAINTENANCE_MONTHLY_FEE);
      return {
        from: explicitFrom,
        until: explicitUntil,
        months,
        monthlyFee: MAINTENANCE_MONTHLY_FEE,
        totalFee,
        isLegacyMissingDuration: false
      };
    }

    if (structuredMonths) {
      return {
        ...buildMaintenancePeriodByMonths(getMaintenanceDefaultStartFromGestion(gestion), structuredMonths),
        isLegacyMissingDuration: false
      };
    }

    return {
      from: '',
      until: '',
      months: 0,
      monthlyFee: MAINTENANCE_MONTHLY_FEE,
      totalFee: 0,
      defaultStart: getMaintenanceDefaultStartFromGestion(gestion),
      isLegacyMissingDuration: true
    };
  };

  const formatMaintenancePeriodLine = (period = {}) => {
    if (!period?.from || !period?.until) return 'periodo no indicado';
    return `del ${formatDateSpanish(period.from)} al ${formatDateSpanish(period.until)}`;
  };

  const promptLegacyMaintenancePeriod = (gestion = {}) => {
    const defaultStart = getMaintenanceDefaultStartFromGestion(gestion);
    const oneMonth = buildMaintenancePeriodByMonths(defaultStart, 1);
    const twoMonths = buildMaintenancePeriodByMonths(defaultStart, 2);

    const answer = window.prompt(
      `Esta solicitud de mantenimiento es antigua y no indica duración.\n\nElige la duración que quieres aplicar:\n\n1 = ${formatMaintenancePeriodLine(oneMonth)} · 15€\n2 = ${formatMaintenancePeriodLine(twoMonths)} · 30€\n\nEscribe 1 o 2:`,
      '1'
    );

    if (answer === null) return null;

    const months = parseMaintenanceMonths(answer);
    if (![1, 2].includes(months)) {
      alert('Duración no válida. Escribe 1 para un mes o 2 para dos meses.');
      return null;
    }

    return {
      ...buildMaintenancePeriodByMonths(defaultStart, months),
      isLegacyMissingDuration: false,
      resolvedFromLegacyPrompt: true
    };
  };

  const formatMaintenanceFeeLine = (period = {}) => {
    const months = parseMaintenanceMonths(period.months) || calculateMaintenanceMonthsFromRange(period.from, period.until) || 1;
    const monthlyFee = Number(period.monthlyFee || MAINTENANCE_MONTHLY_FEE);
    const totalFee = Number(period.totalFee || period.maintenanceFee || (months * monthlyFee));

    if (months <= 1) return `${monthlyFee}€`;
    return `${monthlyFee}€/mes (${totalFee}€ en total para ${months} meses)`;
  };

  const getMaintenanceStartFromAdminMonthInput = (value = '') => {
    const clean = String(value || '').trim();
    if (!clean) return nextMonthStartStr;

    const monthMatch = clean.match(/^(\d{4})-(\d{1,2})$/);
    if (monthMatch) {
      const year = Number(monthMatch[1]);
      const month = Number(monthMatch[2]);
      if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return '';
      return `${year}-${String(month).padStart(2, '0')}-01`;
    }

    const dateMatch = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (dateMatch) {
      return getMonthStartStringFromDate(`${dateMatch[1]}-${String(Number(dateMatch[2])).padStart(2, '0')}-${String(Number(dateMatch[3])).padStart(2, '0')}`);
    }

    return '';
  };

  const promptManualMaintenancePeriod = (studentName = 'alumno') => {
    const defaultStart = nextMonthStartStr;
    const monthInput = window.prompt(
      `Crear mantenimiento temporal manual para ${studentName}.\n\nIndica el mes de inicio en formato AAAA-MM.\nDéjalo vacío para el próximo mes administrativo.\n\nEjemplo: 2026-07`,
      defaultStart.substring(0, 7)
    );

    if (monthInput === null) return null;

    const start = getMaintenanceStartFromAdminMonthInput(monthInput);
    if (!start) {
      alert('Mes no válido. Usa el formato AAAA-MM, por ejemplo 2026-07.');
      return null;
    }

    const oneMonth = buildMaintenancePeriodByMonths(start, 1);
    const twoMonths = buildMaintenancePeriodByMonths(start, 2);

    const answer = window.prompt(
      `¿Duración del mantenimiento de ${studentName}?\n\n1 = ${formatMaintenancePeriodLine(oneMonth)} · 15€\n2 = ${formatMaintenancePeriodLine(twoMonths)} · 30€\n\nEscribe 1 o 2:`,
      '1'
    );

    if (answer === null) return null;

    const months = parseMaintenanceMonths(answer);
    if (![1, 2].includes(months)) {
      alert('Duración no válida. Escribe 1 para un mes o 2 para dos meses.');
      return null;
    }

    return {
      ...buildMaintenancePeriodByMonths(start, months),
      isManualCrm: true
    };
  };

  const getCommercialSeatDataForClass = (clase = {}) => {
    const cap = parseInt(clase.capacity, 10) || 0;
    const studentRows = (clase.students || [])
      .filter(isFixedClassStudent)
      .map(studentEntry => {
        const studentInfo = students.find(student => student.id === studentEntry.id) || {};
        const crmStatus = studentInfo?.globalStatus || 'activo';
        const isDropped = crmStatus === 'baja';
        const isPastEnd = hasStudentClassEndedBeforeDate(studentEntry, studentInfo, todayStr);
        const isMaintenance = !isDropped && !isPastEnd && isStudentInMaintenance(studentEntry.id, todayStr);
        const startDate = getStudentClassStartDate(studentEntry, studentInfo);
        const endDate = getStudentClassEndDate(studentEntry, studentInfo);
        const isFutureStart = !isDropped && !isPastEnd && Boolean(startDate && startDate > todayStr);
        const isCommitted = !isDropped && !isPastEnd;

        return {
          id: studentEntry.id,
          name: studentEntry.name || studentEntry.studentName || studentInfo?.alias || studentInfo?.name || 'Alumno',
          email: studentInfo?.email || studentEntry.email || studentEntry.studentEmail || '',
          status: crmStatus,
          startDate,
          endDate,
          isDropped,
          isMaintenance,
          isFutureStart,
          isCommitted
        };
      })
      .filter(student => student.isCommitted);

    const committedCount = studentRows.length;
    const freeSpots = cap ? Math.max(cap - committedCount, 0) : 0;

    return {
      cap,
      students: studentRows,
      committedCount,
      freeSpots,
      maintenanceCount: studentRows.filter(student => student.isMaintenance).length,
      futureStartCount: studentRows.filter(student => student.isFutureStart).length
    };
  };

  const getCommercialCommittedSeatCount = (clase = {}) => getCommercialSeatDataForClass(clase).committedCount;
  const getCommercialFreeSpots = (clase = {}) => getCommercialSeatDataForClass(clase).freeSpots;

  // LÓGICA DE INFORMES (BUSINESS INTELLIGENCE MULTI-VISTA)
  const businessIntelligence = useMemo(() => {
    let totalIngresosClases = 0;
    let costeTotalProfesores = 0;
    let totalAlumnosActivos = 0;
    let totalAlumnosInicioFuturo = 0;
    let totalPlazasComprometidas = 0;
    let totalImpagos = 0;
    let totalClasesOperativas = 0;
    let totalClasesHibernadas = 0;
    let totalHorasSemanalesOperativas = 0;
    let totalHorasSemanalesHibernadas = 0;

    const createSedeStats = () => ({
      ingresos: 0,
      ingresosClases: 0,
      mantenimiento: 0,
      alumnosMantenimiento: 0,
      alumnosActivos: 0,
      alumnosInicioFuturo: 0,
      plazasComprometidas: 0,
      impagos: 0,
      costesProf: 0,
      clasesOperativas: 0,
      clasesHibernadas: 0,
      horasSemanalesOperativas: 0,
      horasSemanalesHibernadas: 0
    });

    const createTeacherStats = () => ({
      ingresos: 0,
      costes: 0,
      horasSemanales: 0,
      horasHibernadas: 0,
      clasesOperativas: 0,
      clasesHibernadas: 0,
      alumnosActivos: 0,
      alumnosInicioFuturo: 0,
      plazasComprometidas: 0,
      impagos: 0
    });

    const createInstrumentStats = () => ({
      ingresos: 0,
      costes: 0,
      numGrupos: 0,
      numGruposHibernados: 0,
      alumnosActivos: 0,
      alumnosInicioFuturo: 0,
      plazasComprometidas: 0,
      impagos: 0
    });

    const clasesRentabilidad = [];
    const porSede = {
      Tarragona: createSedeStats(),
      Reus: createSedeStats()
    };
    const porProfe = {};
    const porInstrumento = {};
    const studentById = new Map(students.map(student => [student.id, student]));
    const frozenStudents = new Map();

    const getStudentInfoForBI = (studentId) => studentById.get(studentId) || {};

    const isRelocationActiveForBI = (relocation = {}) => {
      if (!relocation || relocation.status === 'cancelled') return false;
      return Boolean(relocation.from && relocation.until && relocation.from <= todayStr && relocation.until >= todayStr);
    };

    const activeRelocations = temporaryRelocations.filter(isRelocationActiveForBI);

    const getBIStudentRowsForClass = (clase = {}) => {
      const relocatedOutIds = new Set(
        activeRelocations
          .filter(relocation => relocation.sourceClassId === clase.id)
          .map(relocation => relocation.studentId)
      );

      const baseStudentEntries = (clase.students || [])
        .filter(isFixedClassStudent)
        .filter(studentEntry => !relocatedOutIds.has(studentEntry.id));

      const relocatedInEntries = activeRelocations
        .filter(relocation => relocation.targetClassId === clase.id)
        .filter(relocation => !baseStudentEntries.some(studentEntry => studentEntry.id === relocation.studentId))
        .map(relocation => {
          const studentInfo = getStudentInfoForBI(relocation.studentId);
          const displayName = studentInfo?.useAlias && studentInfo?.alias
            ? studentInfo.alias
            : (studentInfo?.name || relocation.studentName || 'Alumno');

          return {
            id: relocation.studentId,
            name: displayName,
            email: studentInfo?.email || relocation.studentEmail || '',
            classStartDate: studentInfo?.classStartDate || '',
            isTemporaryRelocation: true,
            temporaryRelocationId: relocation.id,
            sourceClassId: relocation.sourceClassId,
            sourceClassLine: relocation.sourceClassLine || ''
          };
        });

      return [...baseStudentEntries, ...relocatedInEntries]
        .map((studentEntry, index) => {
          const studentInfo = getStudentInfoForBI(studentEntry.id);
          const crmStatus = studentInfo?.globalStatus || 'activo';
          const isDropped = crmStatus === 'baja';
          const isPastEnd = hasStudentClassEndedBeforeDate(studentEntry, studentInfo, todayStr);
          const startDate = getStudentClassStartDate(studentEntry, studentInfo);
          const endDate = getStudentClassEndDate(studentEntry, studentInfo);
          const isFutureStart = !isDropped && !isPastEnd && Boolean(startDate && startDate > todayStr);
          const isMaintenance = !isDropped && !isPastEnd && isStudentInMaintenance(studentEntry.id, todayStr);
          const isActive = !isDropped && !isPastEnd && !isMaintenance && !isFutureStart;
          const displayName = studentEntry.name || studentEntry.studentName || studentInfo?.alias || studentInfo?.name || 'Alumno';
          const email = studentInfo?.email || studentEntry.email || studentEntry.studentEmail || '';
          const isRelocated = Boolean(studentEntry.isTemporaryRelocation || studentEntry.temporaryRelocationId);

          return {
            id: studentEntry.id || `${clase.id}-${index}`,
            name: displayName,
            email,
            sede: clase.sede || 'Tarragona',
            status: crmStatus,
            startDate,
            endDate,
            isDropped,
            isPastEnd,
            isFutureStart,
            isMaintenance,
            isActive,
            isRelocated,
            isCommitted: !isDropped && !isPastEnd
          };
        })
        .filter(student => student.isCommitted);
    };

    const getBIClassStatusLabel = ({ activeCount, maintenanceCount, futureStartCount, relocatedCount }) => {
      if (activeCount > 0) return relocatedCount > 0 ? 'OPERATIVA · incluye recolocación temporal' : 'OPERATIVA';
      if (maintenanceCount > 0 && futureStartCount > 0) return 'HIBERNADA · reservas / mantenimiento';
      if (maintenanceCount > 0) return 'HIBERNADA · solo mantenimiento';
      if (futureStartCount > 0) return 'HIBERNADA · inicio futuro';
      return 'HIBERNADA · sin alumnos activos';
    };

    recurringClassesOnly.forEach(c => {
      const studentRows = getBIStudentRowsForClass(c);
      const activeStudents = studentRows.filter(student => student.isActive);
      const maintenanceStudents = studentRows.filter(student => student.isMaintenance);
      const futureStartStudents = studentRows.filter(student => student.isFutureStart);
      const relocatedStudents = studentRows.filter(student => student.isRelocated);

      const numAlumnos = activeStudents.length;
      const numCongelados = maintenanceStudents.length;
      const numInicioFuturo = futureStartStudents.length;
      const numPlazasComprometidas = studentRows.length;
      const numImpagos = activeStudents.filter(student => student.status === 'impago').length;
      const numRecolocados = relocatedStudents.length;
      const isClassOperative = numAlumnos > 0;
      const isHibernated = !isClassOperative;

      maintenanceStudents.forEach((student, index) => {
        const emailKey = String(student.email || '').trim().toLowerCase();
        const frozenKey = student.id || emailKey || `${c.id}-${index}-${student.name || 'alumno'}`;
        if (!frozenStudents.has(frozenKey)) {
          frozenStudents.set(frozenKey, {
            id: student.id || '',
            name: student.name || 'Alumno',
            email: student.email || '',
            sede: c.sede || 'Tarragona'
          });
        }
      });

      const cuota = Number(c.cuotaBase) || 0;
      const ingresos = numAlumnos * cuota;

      const duracionHoras = (Number(c.duration) || 60) / 60;
      const horasComputables = isClassOperative ? duracionHoras : 0;
      const horasHibernadas = isClassOperative ? 0 : duracionHoras;
      const coste = (isClassOperative && c.teacher?.toLowerCase() !== 'paco')
        ? (horasComputables * BI_WEEKS_PER_MONTH * (settings.costeEmpresa || 22))
        : 0;
      const beneficio = ingresos - coste;
      const estadoOperativo = getBIClassStatusLabel({
        activeCount: numAlumnos,
        maintenanceCount: numCongelados,
        futureStartCount: numInicioFuturo,
        relocatedCount: numRecolocados
      });

      totalIngresosClases += ingresos;
      costeTotalProfesores += coste;
      totalAlumnosActivos += numAlumnos;
      totalAlumnosInicioFuturo += numInicioFuturo;
      totalPlazasComprometidas += numPlazasComprometidas;
      totalImpagos += numImpagos;
      totalClasesOperativas += isClassOperative ? 1 : 0;
      totalClasesHibernadas += isHibernated ? 1 : 0;
      totalHorasSemanalesOperativas += horasComputables;
      totalHorasSemanalesHibernadas += horasHibernadas;

      clasesRentabilidad.push({
        id: c.id,
        subject: c.subject,
        teacher: c.teacher,
        sede: c.sede,
        time: c.time,
        dayOfWeek: c.dayOfWeek,
        numAlumnos,
        numCongelados,
        numInicioFuturo,
        numPlazasComprometidas,
        numImpagos,
        numRecolocados,
        ingresos,
        coste,
        beneficio,
        horasComputables,
        horasHibernadas,
        isClassOperative,
        isHibernated,
        estadoOperativo
      });

      const sedeKey = c.sede || 'Tarragona';
      if (!porSede[sedeKey]) porSede[sedeKey] = createSedeStats();
      porSede[sedeKey].ingresos += ingresos;
      porSede[sedeKey].ingresosClases += ingresos;
      porSede[sedeKey].alumnosActivos += numAlumnos;
      porSede[sedeKey].alumnosInicioFuturo += numInicioFuturo;
      porSede[sedeKey].plazasComprometidas += numPlazasComprometidas;
      porSede[sedeKey].impagos += numImpagos;
      porSede[sedeKey].costesProf += coste;
      porSede[sedeKey].clasesOperativas += isClassOperative ? 1 : 0;
      porSede[sedeKey].clasesHibernadas += isHibernated ? 1 : 0;
      porSede[sedeKey].horasSemanalesOperativas += horasComputables;
      porSede[sedeKey].horasSemanalesHibernadas += horasHibernadas;

      const profKey = c.teacher || 'Sin Asignar';
      if (!porProfe[profKey]) porProfe[profKey] = createTeacherStats();
      porProfe[profKey].ingresos += ingresos;
      porProfe[profKey].costes += coste;
      porProfe[profKey].horasSemanales += horasComputables;
      porProfe[profKey].horasHibernadas += horasHibernadas;
      porProfe[profKey].clasesOperativas += isClassOperative ? 1 : 0;
      porProfe[profKey].clasesHibernadas += isHibernated ? 1 : 0;
      porProfe[profKey].alumnosActivos += numAlumnos;
      porProfe[profKey].alumnosInicioFuturo += numInicioFuturo;
      porProfe[profKey].plazasComprometidas += numPlazasComprometidas;
      porProfe[profKey].impagos += numImpagos;

      const instKey = c.subject || 'Otros';
      if (!porInstrumento[instKey]) porInstrumento[instKey] = createInstrumentStats();
      porInstrumento[instKey].ingresos += ingresos;
      porInstrumento[instKey].costes += coste;
      porInstrumento[instKey].numGrupos += isClassOperative ? 1 : 0;
      porInstrumento[instKey].numGruposHibernados += isHibernated ? 1 : 0;
      porInstrumento[instKey].alumnosActivos += numAlumnos;
      porInstrumento[instKey].alumnosInicioFuturo += numInicioFuturo;
      porInstrumento[instKey].plazasComprometidas += numPlazasComprometidas;
      porInstrumento[instKey].impagos += numImpagos;
    });

    const alumnosMantenimiento = frozenStudents.size;
    const ingresosMantenimiento = alumnosMantenimiento * MAINTENANCE_MONTHLY_FEE;

    frozenStudents.forEach(student => {
      const sedeKey = student.sede || 'Tarragona';
      if (!porSede[sedeKey]) porSede[sedeKey] = createSedeStats();
      porSede[sedeKey].ingresos += MAINTENANCE_MONTHLY_FEE;
      porSede[sedeKey].mantenimiento += MAINTENANCE_MONTHLY_FEE;
      porSede[sedeKey].alumnosMantenimiento += 1;
    });

    if (ingresosMantenimiento > 0) {
      porProfe['Mantenimiento (sin atribuir)'] = {
        ...createTeacherStats(),
        ingresos: ingresosMantenimiento,
        plazasComprometidas: alumnosMantenimiento
      };
      porInstrumento['Mantenimiento'] = {
        ...createInstrumentStats(),
        ingresos: ingresosMantenimiento,
        plazasComprometidas: alumnosMantenimiento
      };
    }

    clasesRentabilidad.sort((a,b) => b.beneficio - a.beneficio);

    const totalIngresos = totalIngresosClases + ingresosMantenimiento;
    const fijos = settings.gastosFijos || { global: 0, tarragona: 0, reus: 0 };
    const totalFijos = Number(fijos.global) + Number(fijos.tarragona) + Number(fijos.reus);

    return {
      totalIngresos,
      totalIngresosClases,
      ingresosMantenimiento,
      alumnosMantenimiento,
      totalAlumnosActivos,
      totalAlumnosInicioFuturo,
      totalPlazasComprometidas,
      totalImpagos,
      totalClasesOperativas,
      totalClasesHibernadas,
      totalHorasSemanalesOperativas,
      totalHorasSemanalesHibernadas,
      mantenimientoMensualPorAlumno: MAINTENANCE_MONTHLY_FEE,
      semanasPrevision: BI_WEEKS_PER_MONTH,
      costeTotalProfesores,
      totalFijos,
      beneficioNeto: totalIngresos - costeTotalProfesores - totalFijos,
      clasesRentabilidad,
      porSede,
      porProfe: Object.entries(porProfe).map(([name, data]) => ({ name, ...data, beneficio: data.ingresos - data.costes })).sort((a,b) => b.beneficio - a.beneficio),
      porInstrumento: Object.entries(porInstrumento).map(([name, data]) => ({ name, ...data, beneficio: data.ingresos - data.costes })).sort((a,b) => b.beneficio - a.beneficio)
    };
  }, [recurringClassesOnly, settings, students, maintenancePeriods, temporaryRelocations, todayStr]);

  const ticketStatsByStudent = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const stats = {};

    const ensureStudentStats = (studentId) => {
      if (!stats[studentId]) {
        stats[studentId] = {
          total: 0,
          active: 0,
          future: 0,
          summerActive: 0,
          summerFuture: 0,
          used: 0,
          expired: 0,
          pending: 0,
          scheduled: 0,
          committed: 0,
          free: 0
        };
      }
      return stats[studentId];
    };

    allTickets.forEach(ticket => {
      if (!ticket.studentId) return;

      const studentStats = ensureStudentStats(ticket.studentId);
      studentStats.total += 1;

      const isSummerTicket = ticket.isSummerTicket || ticket.recoveryPolicy === 'summer';

      if (ticket.isUsed || ticket.voided) {
        studentStats.used += 1;
      } else if (ticket.validUntil && ticket.validUntil < today) {
        studentStats.expired += 1;
      } else if (ticket.validFrom && ticket.validFrom > today) {
        studentStats.future += 1;
        if (isSummerTicket) studentStats.summerFuture += 1;
      } else {
        studentStats.active += 1;
        if (isSummerTicket) studentStats.summerActive += 1;
      }
    });

    gestiones.forEach(gestion => {
      if (!gestion.studentId || gestion.type !== 'recuperacion') return;

      const studentStats = ensureStudentStats(gestion.studentId);

      if (gestion.status === 'pendiente') {
        studentStats.pending += 1;
      } else if (
        gestion.status === 'completado' &&
        gestion.recoveryDate &&
        gestion.recoveryDate >= today
      ) {
        studentStats.scheduled += 1;
      }
    });

    Object.keys(stats).forEach(studentId => {
      const studentStats = stats[studentId];
      studentStats.committed = studentStats.pending + studentStats.scheduled;
      studentStats.free = Math.max(studentStats.active - studentStats.committed, 0);
    });

    return stats;
  }, [allTickets, gestiones]);

  const getStudentTeachers = (studentId, dateStr = todayStr) => {
    if (!studentId) return [];
    const teacherNames = recurringClassesOnly
      .filter(c => (c.students || []).some(s => {
        const studentInfo = students.find(student => student.id === s.id) || {};
        return s.id === studentId && isStudentClassCommittedOnDate(s, studentInfo, dateStr);
      }))
      .map(c => c.teacher)
      .filter(Boolean);
    return [...new Set(teacherNames)];
  };

  const getStudentAssignedClasses = (studentId, dateStr = todayStr) => {
    if (!studentId) return [];
    return recurringClassesOnly.filter(c =>
      (c.students || []).some(s => {
        const studentInfo = students.find(student => student.id === s.id) || {};
        return s.id === studentId && isStudentClassCommittedOnDate(s, studentInfo, dateStr);
      })
    );
  };

  const getStudentOperationalStatus = (student) => {
    const administrativeStatus = student?.globalStatus || 'activo';
    if (administrativeStatus === 'baja') return 'baja';
    if (administrativeStatus === 'impago') return 'impago';
    if (isStudentInMaintenance(student?.id, todayStr)) return 'mantenimiento';

    const assignedClasses = getStudentAssignedClasses(student?.id);
    if (administrativeStatus === 'activo' && assignedClasses.length === 0) return 'sin_plaza';

    return administrativeStatus;
  };

  const getTeacherEmail = (teacherName) => {
    if (!teacherName) return '';
    return `${teacherName.toLowerCase().trim().replace(/\s+/g, '.')}@escuelalosmitos.com`;
  };

  const formatClassLine = (clase) => {
    if (!clase) return '';
    return `${clase.subject || 'Clase'} · ${getDayName(clase.dayOfWeek)} · ${clase.time}h · ${clase.sede || 'Sede no indicada'}${clase.sala ? ` · ${clase.sala}` : ''}`;
  };

  const getGestionSourceClass = (gestion = {}, classes = allClasses) => {
    const sourceId = String(gestion.sourceClassId || gestion.originClassId || gestion.previousClassId || '').trim();
    if (!sourceId) return null;
    return (classes || []).find(clase => clase.id === sourceId) || null;
  };

  const getGestionSourceClassLine = (gestion = {}, classes = allClasses) => {
    if (gestion.sourceClassLine) return gestion.sourceClassLine;
    const sourceClass = getGestionSourceClass(gestion, classes);
    return sourceClass ? formatClassLine(sourceClass) : '';
  };

  const getGestionTargetClassLine = (gestion = {}, classes = allClasses) => {
    if (gestion.requestedClassLine) return gestion.requestedClassLine;
    if (gestion.requestedClass) {
      const targetClass = (classes || []).find(clase => clase.id === gestion.requestedClass);
      if (targetClass) return formatClassLine(targetClass);
      return gestion.requestedClass;
    }
    return '';
  };

  const getFixedStudentClasses = (studentId, classes = recurringClassesOnly, dateStr = todayStr) => {
    if (!studentId) return [];
    return (classes || []).filter(clase =>
      !isPunctualClass(clase) &&
      (clase.students || []).some(studentEntry => {
        const studentInfo = students.find(student => student.id === studentEntry.id) || {};
        return studentEntry.id === studentId && isFixedClassStudent(studentEntry) && isStudentClassCommittedOnDate(studentEntry, studentInfo, dateStr);
      })
    );
  };


  const isTemporaryRelocationActiveForDate = (relocation = {}, dateStr = todayStr) => {
    if (!relocation || relocation.status === 'cancelled') return false;
    return Boolean(relocation.from && relocation.until && relocation.from <= dateStr && relocation.until >= dateStr);
  };


  const getStudentTemporaryRelocations = (studentId) => {
    if (!studentId) return [];
    return temporaryRelocations.filter(rel => rel.studentId === studentId && rel.status !== 'cancelled');
  };

  const getActiveStudentTemporaryRelocations = (studentId, dateStr = todayStr) => {
    return getStudentTemporaryRelocations(studentId).filter(rel => isTemporaryRelocationActiveForDate(rel, dateStr));
  };


  const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

  const cleanEmailSubject = (subject) => String(subject || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  const resolveStudentEmail = (studentInfo, gestionData = {}) => normalizeEmail(
    studentInfo?.email ||
    gestionData.studentEmail ||
    gestionData.email ||
    gestionData.to ||
    ''
  );

  const groupClassesByTeacher = (classes = []) => {
    const grouped = {};
    classes.filter(Boolean).forEach(c => {
      const teacherName = c.teacher || 'Profesor';
      const email = getTeacherEmail(teacherName);
      if (!email) return;
      if (!grouped[email]) grouped[email] = { teacherName, email, classes: [] };
      grouped[email].classes.push(c);
    });
    return Object.values(grouped);
  };

  const sendNotificationEmail = async ({ to, subject, body, type = 'notificacion_email', ...extraPayload }) => {
    const cleanTo = normalizeEmail(to);
    const cleanSubject = cleanEmailSubject(subject);

    if (!cleanTo || !cleanSubject || !body) {
      console.warn('Correo automático omitido por falta de datos', { type, to, subject });
      return false;
    }

    try {
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ type, to: cleanTo, subject: cleanSubject, body, ...extraPayload })
      });
      return true;
    } catch (e) {
      console.log('Fallo correo automático', e);
      return false;
    }
  };

  const sendTeacherNotification = async ({ teacherName, subject, body }) => {
    const to = getTeacherEmail(teacherName);
    await sendNotificationEmail({ to, subject, body, type: 'notificacion_profesor' });
  };

  const sendStudentNotification = async ({ studentEmail, subject, body }) => {
    const cleanStudentEmail = normalizeEmail(studentEmail);

    if (!cleanStudentEmail) {
      await sendNotificationEmail({
        to: 'admin@escuelalosmitos.com',
        subject: `Aviso interno: alumno sin email para confirmación`,
        body: `No se ha enviado una confirmación al alumno porque no hay email válido asociado.

Asunto previsto:
${subject}

Cuerpo previsto:
${body}`,
        type: 'notificacion_email'
      });
      return false;
    }

    return sendNotificationEmail({ to: cleanStudentEmail, subject, body, type: 'confirmacion_alumno' });
  };


  const getAnnouncementTargetOptions = (targetType) => {
    if (targetType === 'sede') return SEDES;
    if (targetType === 'instrumento') {
      return [...new Set([
        ...(settings.instrumentos || defaultInstrumentos),
        ...recurringClassesOnly.map(c => c.subject).filter(Boolean)
      ])].sort((a, b) => a.localeCompare(b));
    }
    if (targetType === 'profesor') {
      return [...new Set([
        ...(settings.teachersList || []),
        ...recurringClassesOnly.map(c => c.teacher).filter(Boolean)
      ])].sort((a, b) => a.localeCompare(b));
    }
    return [];
  };

  const getAnnouncementTeacherTargets = () => {
    const byEmail = new Map();

    [...new Set([
      ...(settings.teachersList || []),
      ...recurringClassesOnly.map(c => c.teacher).filter(Boolean)
    ])]
      .filter(Boolean)
      .forEach(teacherName => {
        const email = normalizeEmail(getTeacherEmail(teacherName));
        if (!email) return;
        if (!byEmail.has(email)) {
          byEmail.set(email, {
            email,
            name: teacherName,
            teacherName,
            classes: recurringClassesOnly.filter(c => c.teacher === teacherName).map(c => c.id)
          });
        }
      });

    return [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  };

  const matchesAnnouncementTarget = (clase, emailOptions = announceEmailOptions) => {
    const targetType = emailOptions.targetType || 'all';
    const targetValue = String(emailOptions.targetValue || '').trim();
    if (targetType === 'all') return true;
    if (targetType === 'teachers') return false;
    if (!targetValue) return false;
    if (targetType === 'sede') return (clase.sede || 'Tarragona') === targetValue;
    if (targetType === 'instrumento') return (clase.subject || '') === targetValue;
    if (targetType === 'profesor') return (clase.teacher || '') === targetValue;
    return false;
  };

  const getAnnouncementEmailTargets = (emailOptions = announceEmailOptions) => {
    if ((emailOptions.targetType || 'all') === 'teachers') {
      return getAnnouncementTeacherTargets();
    }

    const byEmail = new Map();

    recurringClassesOnly
      .filter(c => matchesAnnouncementTarget(c, emailOptions))
      .forEach(c => {
        (c.students || [])
          .filter(isFixedClassStudent)
          .forEach(studentEntry => {
            const studentInfo = students.find(st => st.id === studentEntry.id) || null;
            if (studentInfo?.globalStatus === 'baja' || hasStudentClassEndedBeforeDate(studentEntry, studentInfo || {}, todayStr)) return;
            const email = normalizeEmail(studentInfo?.email || studentEntry.email || studentEntry.studentEmail || '');
            if (!email) return;
            if (!byEmail.has(email)) {
              byEmail.set(email, {
                email,
                name: studentInfo?.alias || studentInfo?.name || studentEntry.name || studentEntry.studentName || '',
                studentId: studentInfo?.id || studentEntry.id || '',
                classes: []
              });
            }
            byEmail.get(email).classes.push(c.id);
          });
      });

    return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
  };

  const getAnnouncementTargetLabel = (emailOptions = announceEmailOptions) => {
    const targetType = emailOptions.targetType || 'all';
    const targetValue = String(emailOptions.targetValue || '').trim();
    if (targetType === 'all') return 'Todos los alumnos con clase fija';
    if (targetType === 'teachers') return 'Todos los profesores';
    if (targetType === 'sede') return targetValue ? `Sede: ${targetValue}` : 'Sede no seleccionada';
    if (targetType === 'instrumento') return targetValue ? `Instrumento: ${targetValue}` : 'Instrumento no seleccionado';
    if (targetType === 'profesor') return targetValue ? `Alumnos de profesor/a: ${targetValue}` : 'Profesor no seleccionado';
    return 'Filtro personalizado';
  };

  const buildAnnouncementEmailBody = ({ title, content, url }, targetLabel) => {
    const cleanUrl = normalizeAnnouncementUrl(url);
    return `Nuevo aviso en el Tablón de Escuela Los Mitos

TÍTULO:
${title}

DESTINATARIOS:
${targetLabel}

AVISO:
${content}${cleanUrl ? `\n\nENLACE:\n${cleanUrl}` : ''}

---
Este correo corresponde a una comunicación operativa del servicio educativo de Escuela Los Mitos.
También puedes consultar los avisos publicados accediendo a tu portal.`;
  };

  const sendAnnouncementEmailToTargets = async ({ announcement, emailOptions = announceEmailOptions }) => {
    if (!emailOptions.enabled) return { requested: false, count: 0 };

    const targets = getAnnouncementEmailTargets(emailOptions);
    if (targets.length === 0) {
      alert('No se ha enviado email porque el filtro elegido no tiene destinatarios con email válido.');
      return { requested: false, count: 0 };
    }

    const targetLabel = getAnnouncementTargetLabel(emailOptions);
    const subject = `[Tablón Escuela Los Mitos] ${announcement.title}`;
    const body = buildAnnouncementEmailBody(announcement, targetLabel);

    const requested = await sendNotificationEmail({
      to: ANNOUNCEMENT_EMAIL_TO,
      subject,
      body,
      type: (emailOptions.targetType || 'all') === 'teachers' ? 'tablon_profesores' : 'tablon_alumnos',
      recipients: targets.map(t => t.email),
      targetLabel,
      batchSize: ANNOUNCEMENT_EMAIL_BATCH_SIZE
    });

    return { requested, count: targets.length, targetLabel };
  };



  const isAdminCopyGestionType = (gestion = {}) => {
    if (gestion?.source === 'manual_admin') return false;
    const type = gestion?.type || 'tarea_manual';
    return ADMIN_COPY_GESTION_TYPES.has(type);
  };

  const getGestionTypeLabel = (type = 'tarea_manual') => String(type || 'tarea_manual').replace(/_/g, ' ');

  const isTotalBajaGestion = (gestion = {}) => {
    const scope = String(gestion.bajaScope || gestion.scope || gestion.bajaType || '').trim().toLowerCase();
    return Boolean(
      gestion.bajaTotal === true ||
      gestion.isTotalBaja === true ||
      gestion.totalBaja === true ||
      scope === 'total' ||
      scope === 'baja_total' ||
      scope === 'todas'
    );
  };

  const getBajaScopeLabel = (gestion = {}) => {
    if ((gestion.type || '') !== 'baja') return '';
    return isTotalBajaGestion(gestion) ? 'Baja total · todas las clases' : 'Baja parcial · plaza concreta';
  };

  const getGestionClassLine = (gestion = {}) => {
    const sourceLine = getGestionSourceClassLine(gestion);
    const targetLine = getGestionTargetClassLine(gestion);

    if (sourceLine && targetLine && sourceLine !== targetLine) {
      return `Plaza origen:\n${sourceLine}\n\nClase destino:\n${targetLine}`;
    }
    if (targetLine) return targetLine;
    if (sourceLine) return sourceLine;

    if (gestion.studentId) {
      const assigned = getStudentAssignedClasses(gestion.studentId).filter(c => !isPunctualClass(c));
      if (assigned.length > 0) return assigned.map(c => formatClassLine(c)).join('\n');
    }
    return '';
  };

  const sendAdminGestionEmail = async ({ gestion, phase = 'recibida', status = 'pendiente', executionNotes = '' }) => {
    if (!gestion || !isAdminCopyGestionType(gestion)) return false;

    const typeLabel = getGestionTypeLabel(gestion.type || 'tarea_manual');
    const phaseLabel = phase === 'ejecutada'
      ? (status === 'rechazado' ? 'Gestión rechazada' : 'Gestión ejecutada')
      : 'Nueva gestión';
    const studentInfo = gestion.studentId ? students.find(s => s.id === gestion.studentId) : null;
    const aliasLine = studentInfo?.alias ? `NOMBRE_REAL_ALUMNO: ${studentInfo.alias}\n` : '';
    const classLine = getGestionClassLine(gestion);
    const sourceClassLine = getGestionSourceClassLine(gestion);
    const targetClassLine = getGestionTargetClassLine(gestion);
    const maintenancePeriodForEmail = gestion.type === 'mantenimiento' ? getMaintenancePeriodFromGestion(gestion) : null;
    const maintenancePeriodLine = maintenancePeriodForEmail && !maintenancePeriodForEmail.isLegacyMissingDuration ? formatMaintenancePeriodLine(maintenancePeriodForEmail) : '';
    const maintenanceFeeLine = maintenancePeriodForEmail && !maintenancePeriodForEmail.isLegacyMissingDuration ? formatMaintenanceFeeLine(maintenancePeriodForEmail) : '';
    const bajaScopeLine = gestion.type === 'baja' ? getBajaScopeLabel(gestion) : '';
    const solicitud = gestion.date ? new Date(gestion.date).toLocaleString('es-ES') : '';
    const ejecucion = phase === 'ejecutada' ? new Date().toLocaleString('es-ES') : '';
    const scheduledClassEndLine = gestion.scheduledClassEndDate || gestion.bajaClassEndDate || gestion.effectiveEndDate || '';
    const scheduledEffectiveLine = gestion.scheduledEffectiveDate || gestion.bajaEffectiveDate || gestion.effectiveStartDate || '';

    const body = `TIPO_GESTION: ${typeLabel}
ESTADO: ${status}
FASE: ${phaseLabel}
ALUMNO: ${gestion.studentName || ''}
${aliasLine}EMAIL: ${gestion.studentEmail || studentInfo?.email || ''}
PROFESOR: ${gestion.requestedTeacher || ''}
ALCANCE_BAJA: ${bajaScopeLine}
PLAZA_ORIGEN: ${sourceClassLine}
CLASE_DESTINO: ${targetClassLine}
CLASE: ${classLine}
MES_OBJETIVO: ${gestion.targetMonth || ''}
PERIODO_MANTENIMIENTO: ${maintenancePeriodLine}
CUOTA_MANTENIMIENTO: ${maintenanceFeeLine}
FECHA_RECUPERACION: ${gestion.recoveryDate ? formatDateSpanish(gestion.recoveryDate) : ''}
FECHA_SOLICITUD: ${solicitud}
FECHA_EJECUCION: ${ejecucion}
FECHA_FIN_PROGRAMADA: ${scheduledClassEndLine}
FECHA_EFECTIVA_PROGRAMADA: ${scheduledEffectiveLine}
EJECUTADO_POR: ${phase === 'ejecutada' ? (user?.email || 'admin') : ''}
ID_GESTION: ${gestion.id || ''}
ORIGEN: ${gestion.source === 'manual_admin' ? 'Tarea manual AdminPortal' : 'Portal del alumno'}

DETALLES:
${gestion.details || gestion.title || 'Sin detalles añadidos.'}${executionNotes ? `\n\nNOTAS_EJECUCION:\n${executionNotes}` : ''}`;

    return sendNotificationEmail({
      to: ADMIN_GESTION_EMAIL,
      subject: `[${phaseLabel}] ${typeLabel} - ${gestion.studentName || 'Tarea manual'}`,
      body,
      type: 'notificacion_email'
    });
  };

  const finalizeGestionStatus = async (gestionId, status, gestionData = null, executionNotes = '', extraUpdate = {}) => {
    const now = new Date().toISOString();
    const baseUpdate = { status, ...extraUpdate };

    if (gestionData && isAdminCopyGestionType(gestionData)) {
      const alreadySent = status === 'pendiente'
        ? gestionData.adminCopySentAt
        : gestionData.adminExecutionCopySentAt;
      if (!alreadySent) {
        const sent = await sendAdminGestionEmail({
          gestion: { ...gestionData, ...extraUpdate, id: gestionId },
          phase: status === 'pendiente' ? 'recibida' : 'ejecutada',
          status,
          executionNotes
        });
        if (sent) {
          if (status === 'pendiente') {
            baseUpdate.adminCopySentAt = now;
            baseUpdate.adminCopyRecipient = ADMIN_GESTION_EMAIL;
          } else {
            baseUpdate.adminExecutionCopySentAt = now;
            baseUpdate.adminExecutionRecipient = ADMIN_GESTION_EMAIL;
            baseUpdate.adminExecutionStatus = status;
          }
        }
      }
    }

    await updateDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), baseUpdate);
  };

  const updateTeacherRequestStatus = async (task, status) => {
    if (!task?.id) return;

    const isAdminAssignment = task.type === 'admin_assignment';
    const statusLabel = getTeacherTaskStatusLabel(status).toUpperCase();
    let adminResponse = task.adminResponse || '';
    const now = new Date().toISOString();

    if (isAdminAssignment && status === 'cancelada') {
      const response = window.prompt(`Motivo de cancelación del encargo para ${task.teacherName || 'profesor'} (opcional):`, task.adminResponse || '');
      if (response === null) return;
      adminResponse = String(response || '').trim();
    } else if (!isAdminAssignment && ['resuelta', 'rechazada'].includes(status)) {
      const response = window.prompt(`Respuesta para el profesor al marcar como ${statusLabel} (opcional):`, task.adminResponse || '');
      if (response === null) return;
      adminResponse = String(response || '').trim();
    } else if (!window.confirm(`¿Marcar ${isAdminAssignment ? 'este encargo' : 'esta petición'} de ${task.teacherName || 'profesor'} como ${statusLabel}?`)) {
      return;
    }

    const payload = {
      status,
      updatedAt: now
    };

    if (adminResponse || status === 'cancelada') payload.adminResponse = adminResponse;

    if (isAdminAssignment) {
      if (status === 'cancelada') {
        payload.cancelledAt = now;
        payload.cancelledBy = user?.email || 'admin';
        payload.cancelReason = adminResponse;
      }
    } else {
      if (status === 'en_revision') {
        payload.reviewedAt = now;
        payload.reviewedBy = user?.email || 'admin';
      }
      if (['resuelta', 'rechazada'].includes(status)) {
        payload.resolvedAt = now;
        payload.resolvedBy = user?.email || 'admin';
      }
    }

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'teacherTasks', task.id), payload);
      alert(`${isAdminAssignment ? 'Encargo' : 'Petición'} marcado como ${getTeacherTaskStatusLabel(status)}.`);
    } catch (e) {
      alert(`Error al actualizar ${isAdminAssignment ? 'el encargo' : 'la petición'} del profesor: ${e.message}`);
    }
  };

  const buildInitialClassAssignmentEmailBody = ({ studentName, studentEmail, classData, classStartDate }) => {
    const formattedStartDate = formatDateSpanish(classStartDate || todayStr);

    return `Hola ${studentName},

¡Llegó el día de confirmar tu plaza!

Te confirmamos que ya tienes tu plaza reservada en Escuela Los Mitos.

Tu clase asignada es:

· ${formatClassLine(classData)}
Profesor/a: ${classData.teacher || 'Profesor/a'}

Tu fecha de inicio será:

${formattedStartDate}

A partir de ese día podrás acceder a tu Área del Alumno, donde encontrarás tu información de clase, avisos importantes, calendario, recuperaciones y gestiones relacionadas con tu plaza.

Para activar tu cuenta, sigue estos pasos:

1. Entra en ${STUDENT_PORTAL_URL}
2. Pulsa en “¿Primera vez aquí? Activa tu cuenta”.
3. Introduce el mismo correo electrónico con el que realizaste tu inscripción:
   ${studentEmail || 'el correo con el que realizaste tu inscripción'}
4. Escribe la contraseña que quieras usar para acceder al portal. Puedes pulsar el icono del ojo para comprobar que la has escrito correctamente.
5. Pulsa en “Crear contraseña”.

Una vez hecho esto, accederás directamente a tu Área del Alumno.

Te recomendamos guardar el enlace del portal para tenerlo siempre a mano o, mejor aún, ponerlo como acceso directo en el escritorio de tu móvil:

${STUDENT_PORTAL_URL}

Si tienes cualquier problema para activar tu cuenta o acceder, escríbenos a ${SUPPORT_EMAIL} y lo revisamos contigo.

¡Bienvenido/a a la escuela!

Un saludo,
Coordinación Escuela Los Mitos`;
  };

  const buildNewFixedStudentTeacherEmailBody = ({ teacherName, displayName, classData, classStartDate, contextLabel = 'en tu clase' }) => {
    const formattedStartDate = formatDateSpanish(classStartDate || todayStr);
    const startsInFuture = Boolean(classStartDate && classStartDate > todayStr);

    return `Hola ${teacherName || 'profesor/a'},

Desde coordinación hemos añadido a ${displayName} como alumno fijo ${contextLabel}:

· ${formatClassLine(classData)}

Fecha de inicio: ${formattedStartDate}.

${startsInFuture ? 'El alumno ya tiene la plaza reservada, pero no debe aparecer como activo en la lista de asistencia hasta esa fecha.' : 'El alumno aparece activo desde hoy en tu lista de asistencia de la App.'}

Un saludo,
Coordinación Los Mitos.`;
  };

  const sendInitialClassAssignmentEmailIfNeeded = async ({ studentId, existingStudent = null, createdNow = false, studentName, studentEmail, classData, classStartDate }) => {
    // Este email es SOLO para altas completamente nuevas creadas desde el panel.
    // No se envía en cambios de clase, ampliaciones, reactivaciones, descongelados
    // ni al recuperar un alumno que ya existía en CRM aunque estuviera sin plaza.
    if (!createdNow || !studentId || !classData || isPunctualClass(classData)) return false;
    if (existingStudent?.firstClassEmailSentAt || existingStudent?.welcomeEmailSentAt) return false;

    const cleanClassStartDate = normalizeStudentClassStartDate(classStartDate) || todayStr;
    const sent = await sendStudentNotification({
      studentEmail,
      subject: `Plaza confirmada en Escuela Los Mitos`,
      body: buildInitialClassAssignmentEmailBody({ studentName, studentEmail, classData, classStartDate: cleanClassStartDate })
    });

    if (sent) {
      await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), {
        firstClassEmailSentAt: new Date().toISOString(),
        firstClassEmailClassId: classData.id || null,
        firstClassEmailClassLine: formatClassLine(classData),
        firstClassEmailStartDate: cleanClassStartDate
      });
    }

    return sent;
  };

  const sendGroupedTeacherSummary = async ({ groupedClasses, subjectBuilder, bodyBuilder }) => {
    for (let group of groupedClasses) {
      await sendTeacherNotification({
        teacherName: group.teacherName,
        subject: subjectBuilder(group),
        body: bodyBuilder(group)
      });
    }
  };


  const voidStudentTickets = async (studentId, reason = 'baja') => {
    if (!studentId) return 0;

    const ticketsSnapshot = await getDocs(collectionGroup(db, 'tickets'));
    const batch = writeBatch(db);
    let count = 0;

    ticketsSnapshot.forEach((ticketDoc) => {
      const ticket = ticketDoc.data();
      if (ticket.studentId === studentId && !ticket.isUsed) {
        batch.set(ticketDoc.ref, {
          isUsed: true,
          voided: true,
          voidReason: reason,
          voidedAt: new Date().toISOString(),
          voidedBy: user?.email || 'admin'
        }, { merge: true });
        count++;
      }
    });

    if (count > 0) await batch.commit();
    return count;
  };

  const syncStudentPauseStateInClasses = async (studentId, isPaused) => {
    if (!studentId) return 0;

    const classesWithStudent = allClasses.filter(c =>
      c.students && c.students.some(s => s.id === studentId)
    );

    const updatePromises = classesWithStudent.map(c => {
      if (!c.refPath) return Promise.resolve();

      const updatedList = (c.students || []).map(s =>
        s.id === studentId ? { ...s, isPaused } : s
      );

      return updateDoc(doc(db, c.refPath), { students: updatedList });
    });

    await Promise.all(updatePromises);
    return classesWithStudent.filter(c => c.refPath).length;
  };

  const resetStudentTrivia = async (studentId) => {
    if (!studentId) return;
    await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), {
      triviaPoints: 0,
      triviaPointsQuarterly: 0,
      triviaPointsAnnual: 0,
      triviaStreak: 0,
      triviaVictories: 0
    });
  };

  const getTicketStatsForDate = (studentId, targetDate, excludeGestionId = null) => {
    const today = new Date().toISOString().split('T')[0];
    const dateToCheck = targetDate || today;
    const activeForDate = allTickets.filter(t =>
      t.studentId === studentId &&
      !t.isUsed &&
      !t.voided &&
      (!t.validFrom || t.validFrom <= dateToCheck) &&
      (!t.validUntil || t.validUntil >= dateToCheck)
    );

    const committed = gestiones.filter(g =>
      g.studentId === studentId &&
      g.id !== excludeGestionId &&
      g.type === 'recuperacion' &&
      (
        g.status === 'pendiente' ||
        (g.status === 'completado' && g.recoveryDate && g.recoveryDate >= today)
      )
    ).length;

    const summerActive = activeForDate.filter(t => t.isSummerTicket || t.recoveryPolicy === 'summer').length;
    return {
      active: activeForDate.length,
      summerActive,
      committed,
      free: Math.max(activeForDate.length - committed, 0)
    };
  };

  const resetStudentTickets = async (student) => {
    if (!student?.id) return;

    const stats = ticketStatsByStudent[student.id] || { active: 0, future: 0, free: 0, total: 0 };
    const pendingCount = (stats.active || 0) + (stats.future || 0);

    if (pendingCount <= 0) {
      alert(`${student.name} no tiene tickets pendientes que anular.`);
      return;
    }

    if (!window.confirm(`¿Anular los tickets pendientes de ${student.name}?

Tickets activos/futuros: ${pendingCount}

Esto dejará su contador a cero sin borrar el historial.`)) return;

    try {
      const count = await voidStudentTickets(student.id, 'ajuste_manual_admin');
      alert(`✅ Tickets anulados: ${count}. El contador del alumno quedará a cero.`);
    } catch (e) {
      alert('Error al anular tickets: ' + e.message);
    }
  };

  const handleDeleteClassGlobal = async (clase) => {
    if (!window.confirm(`⚠️ PELIGRO: ¿Estás seguro de que quieres BORRAR DEFINITIVAMENTE esta clase de ${clase.subject} de ${clase.teacher}?\n\nEsta acción eliminará el grupo para siempre.`)) return;
    try {
      await deleteDoc(doc(db, clase.refPath));
      if (viewClassModal && viewClassModal.id === clase.id) {
        setViewClassModal(null);
      }
      alert("✅ Clase borrada correctamente.");
    } catch (e) {
      alert("❌ Error al borrar la clase: " + e.message);
    }
  };

  const gestionRequiresTadosi = (gestion = {}) => TADOSI_REQUIRED_GESTION_TYPES.has(gestion?.type);
  const isGestionTadosiDone = (gestion = {}) => Boolean(gestion?.tadosiDone || gestion?.tadosiDoneAt || gestion?.workflowStatus === 'tadosi_hecho' || gestion?.workflowStatus === 'listo_ejecucion');
  const isGestionReadyForExecution = (gestion = {}) => !gestionRequiresTadosi(gestion) || isGestionTadosiDone(gestion);

  const getGestionWorkflowLabel = (gestion = {}) => {
    if (gestion.status !== 'pendiente') return gestion.status || 'cerrado';
    if (!gestionRequiresTadosi(gestion)) return 'No requiere Tadosi';
    if (isGestionTadosiDone(gestion)) return 'Tadosi hecho';
    return 'Pendiente Tadosi';
  };

  const markGestionTadosiDone = async (gestion) => {
    if (!gestion?.id) return;
    if (!gestionRequiresTadosi(gestion)) {
      alert('Este trámite no requiere marcar Tadosi. Puedes ejecutarlo directamente.');
      return;
    }

    if (isGestionTadosiDone(gestion)) {
      alert('Este trámite ya está marcado como Tadosi hecho.');
      return;
    }

    if (!window.confirm(`¿Marcar como TADOSI HECHO este trámite de ${gestion.studentName || 'alumno'}?\n\nEsto NO ejecuta cambios en clases. Solo deja el trámite listo para poder ejecutarlo al cierre.`)) return;

    await updateDoc(doc(db, 'artifacts', appId, 'gestiones', gestion.id), {
      tadosiDone: true,
      tadosiDoneAt: new Date().toISOString(),
      tadosiDoneBy: user?.email || 'admin',
      workflowStatus: 'tadosi_hecho'
    });

    alert('✅ Tadosi marcado como hecho. El trámite ya queda desbloqueado para ejecutar.');
  };

  const updateGestionStatus = async (gestionId, status, gestionData = null, options = {}) => {
    const { skipConfirm = false, silent = false } = options;
    const accion = status === 'completado' ? 'EJECUTAR AHORA' : 'RECHAZAR';
    const notify = (message, extra = {}) => {
      if (!silent) alert(message);
      return { ok: true, message, ...extra };
    };
    const fail = (message, extra = {}) => {
      if (!silent) alert(message);
      return { ok: false, message, ...extra };
    };

    if (status === 'completado' && gestionData && !isGestionReadyForExecution(gestionData)) {
      return fail(`⚠️ Primero marca Tadosi hecho para poder ejecutar este trámite.\n\nAsí evitamos cerrar cambios de clases antes de haber ajustado cobros.`);
    }

    if (!skipConfirm && !window.confirm(`¿Seguro que quieres ${accion} este trámite?`)) {
      return { ok: false, cancelled: true, message: 'Cancelado por el usuario.' };
    }

    try {
      if (status !== 'completado' || !gestionData) {
        await finalizeGestionStatus(gestionId, status, gestionData);
        return notify(`Trámite marcado como ${status.toUpperCase()}.`);
      }

      const { studentId, studentName, type, requestedClass, recoveryDate } = gestionData;
      const studentInfo = students.find(s => s.id === studentId);
      const studentEmail = resolveStudentEmail(studentInfo, gestionData);

      let displayName = studentName;
      if (studentInfo && studentInfo.useAlias && studentInfo.alias) {
        displayName = studentInfo.alias;
      }

      if (type === 'baja') {
        const sourceClass = getGestionSourceClass(gestionData);
        const sourceClassLine = getGestionSourceClassLine(gestionData);
        const hasScopedBaja = Boolean(gestionData.sourceClassId || gestionData.sourceClassLine);
        const isTotalBaja = isTotalBajaGestion(gestionData);
        const canExecutePartialBaja = hasScopedBaja && !isTotalBaja;
        const scheduledEndDate = promptScheduledClassEndDate(gestionData, 'la baja', silent);
        if (!scheduledEndDate) {
          return { ok: false, cancelled: true, message: 'Fecha efectiva no seleccionada.' };
        }
        const scheduledEffectiveDate = getScheduledClassStartAfterEndDate(scheduledEndDate);
        const scheduledExecutionUpdate = buildScheduledExecutionUpdate(scheduledEndDate, {
          scheduledAction: isTotalBaja ? 'baja_total' : 'baja',
          bajaEffectiveDate: scheduledEffectiveDate,
          bajaClassEndDate: scheduledEndDate,
          bajaScopeResolved: isTotalBaja ? 'total' : (canExecutePartialBaja ? 'partial' : 'total')
        });

        if (canExecutePartialBaja && !sourceClass?.refPath) {
          return fail(`⚠️ No se puede programar la baja por plaza.

La solicitud indica una plaza concreta, pero esa clase de origen ya no existe o no tiene ruta válida.

Plaza indicada:
${sourceClassLine || gestionData.sourceClassId || 'No indicada'}`);
        }

        const fixedClassesBefore = getFixedStudentClasses(studentId);
        const remainingFixedClasses = canExecutePartialBaja && sourceClass
          ? fixedClassesBefore.filter(c => c.id !== sourceClass.id)
          : [];

        if (canExecutePartialBaja && sourceClass && remainingFixedClasses.length > 0) {
          const updatedList = (sourceClass.students || []).map(s =>
            s.id === studentId ? applyScheduledEndToStudentEntry(s, scheduledEndDate, 'baja_parcial', gestionId) : s
          );
          await updateDoc(doc(db, sourceClass.refPath), { students: updatedList });

          if (studentInfo?.globalStatus === 'baja') {
            await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), { globalStatus: 'activo' });
          }

          await sendGroupedTeacherSummary({
            groupedClasses: groupClassesByTeacher([sourceClass]),
            subjectBuilder: () => `Baja parcial programada: ${displayName}`,
            bodyBuilder: (group) => `Hola ${group.teacherName},

Desde coordinación te informamos que ${displayName} tiene programada la baja de esta plaza:

· ${formatClassLine(sourceClass)}

Último día con plaza activa: ${formatDateSpanish(scheduledEndDate)}.
A partir de ${formatDateSpanish(scheduledEffectiveDate)} ya no debe aparecer como alumno activo en esta clase.

El alumno sigue activo en la escuela en otra(s) clase(s).

Un saludo,
Coordinación Los Mitos.`
          });

          await sendStudentNotification({
            studentEmail,
            subject: `Confirmación de baja de una plaza - Escuela Los Mitos`,
            body: `Hola ${studentName},

Te confirmamos que hemos programado la baja de esta plaza:

· ${formatClassLine(sourceClass)}

Último día con plaza activa: ${formatDateSpanish(scheduledEndDate)}.
A partir de ${formatDateSpanish(scheduledEffectiveDate)} dejará de aparecer como clase activa en tu portal.

Sigues activo/a en la escuela en el resto de clases que mantienes actualmente.

Un saludo,
Coordinación Los Mitos.`
          });

          await finalizeGestionStatus(
            gestionId,
            'completado',
            gestionData,
            `Baja parcial programada. Plaza: ${formatClassLine(sourceClass)}. Último día: ${formatDateSpanish(scheduledEndDate)}. Mantiene ${remainingFixedClasses.length} plaza(s) fija(s).`,
            scheduledExecutionUpdate
          );
          return notify(`✅ Baja parcial programada. ${displayName} seguirá en ${formatClassLine(sourceClass)} hasta ${formatDateSpanish(scheduledEndDate)}. Desde ${formatDateSpanish(scheduledEffectiveDate)} dejará de aparecer en esa clase.`);
        }

        const classesWithStudent = getFixedStudentClasses(studentId);
        if (classesWithStudent.length === 0) {
          await finalizeGestionStatus(gestionId, 'completado', gestionData, 'Baja archivada: el alumno no tenía plazas fijas activas.', scheduledExecutionUpdate);
          return notify(`ℹ️ ${displayName} no tenía plazas fijas activas. El trámite queda archivado.`);
        }

        const groupedTeachers = groupClassesByTeacher(classesWithStudent);
        for (let c of classesWithStudent) {
          const updatedList = (c.students || []).map(s =>
            s.id === studentId ? applyScheduledEndToStudentEntry(s, scheduledEndDate, 'baja_total', gestionId) : s
          );
          if (c.refPath) await updateDoc(doc(db, c.refPath), { students: updatedList });
        }

        await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), {
          globalStatus: studentInfo?.globalStatus === 'baja' ? 'baja' : 'activo',
          scheduledBaja: true,
          scheduledBajaScope: 'total',
          scheduledBajaClassEndDate: scheduledEndDate,
          scheduledBajaEffectiveDate: scheduledEffectiveDate,
          scheduledBajaSourceGestionId: gestionId,
          scheduledBajaAt: new Date().toISOString(),
          scheduledBajaBy: user?.email || 'admin'
        });

        await sendGroupedTeacherSummary({
          groupedClasses: groupedTeachers,
          subjectBuilder: (group) => `Baja programada de alumno: ${displayName}`,
          bodyBuilder: (group) => `Hola ${group.teacherName},

Desde coordinación te informamos que ${displayName} tiene programada la baja y dejará de asistir a ${group.classes.length === 1 ? 'esta clase' : 'estas clases'}:

${group.classes.map(c => `· ${formatClassLine(c)}`).join('\n')}

Último día con plaza activa: ${formatDateSpanish(scheduledEndDate)}.
A partir de ${formatDateSpanish(scheduledEffectiveDate)} ya no debe aparecer como alumno activo en tu lista de asistencia.

Un saludo,
Coordinación Los Mitos.`
        });

        await sendStudentNotification({
          studentEmail,
          subject: `Confirmación de baja programada - Escuela Los Mitos`,
          body: `Hola ${studentName},

Te confirmamos que tu solicitud de baja ha sido programada correctamente.

Último día con plaza activa: ${formatDateSpanish(scheduledEndDate)}.
A partir de ${formatDateSpanish(scheduledEffectiveDate)} tu baja será efectiva y dejarás de aparecer como alumno/a activo/a en la plataforma.

${isTotalBaja
  ? `Has solicitado la baja total, así que se programan todas tus clases${sourceClassLine ? ` aunque la plaza de referencia fuera:\n· ${sourceClassLine}` : ''}.\n`
  : hasScopedBaja && sourceClassLine
    ? `La plaza solicitada era:\n· ${sourceClassLine}\n\nAl ser tu última plaza fija, la baja queda programada como baja completa de Escuela Los Mitos.\n`
    : 'La baja queda programada según la normativa administrativa del centro.\n'}
Un saludo,
Coordinación Los Mitos.`
        });

        await finalizeGestionStatus(gestionId, 'completado', gestionData, isTotalBaja
          ? `Baja total programada por solicitud explícita del alumno. Último día: ${formatDateSpanish(scheduledEndDate)}${sourceClassLine ? `. Plaza de referencia: ${sourceClassLine}` : ''}`
          : hasScopedBaja && sourceClassLine
            ? `Baja total programada al ser última plaza fija. Último día: ${formatDateSpanish(scheduledEndDate)}. Plaza solicitada: ${sourceClassLine}`
            : `Baja programada desde bandeja Admin. Último día: ${formatDateSpanish(scheduledEndDate)}`,
          scheduledExecutionUpdate);
        return notify(`✅ Baja programada. ${displayName} conserva sus clases hasta ${formatDateSpanish(scheduledEndDate)} y dejará de aparecer desde ${formatDateSpanish(scheduledEffectiveDate)}. Tickets y trivial quedan marcados para baja total cuando sea efectiva.`);
      }
      else if (type === 'mantenimiento') {
        let maintenancePeriod = getMaintenancePeriodFromGestion(gestionData);

        if (maintenancePeriod.isLegacyMissingDuration) {
          if (silent) {
            return fail(`⚠️ Mantenimiento antiguo sin duración para ${displayName}. Ejecútalo individualmente para elegir 1 mes o 2 meses antes de crear el periodo.`);
          }

          const selectedPeriod = promptLegacyMaintenancePeriod(gestionData);
          if (!selectedPeriod) {
            return { ok: false, cancelled: true, message: 'Duración de mantenimiento no seleccionada.' };
          }
          maintenancePeriod = selectedPeriod;
        }

        const { from, until } = maintenancePeriod;
        if (!from || !until) {
          return fail('⚠️ No se puede ejecutar el mantenimiento: falta fecha de inicio o fecha de fin.');
        }
        if (from > until) {
          return fail('⚠️ No se puede ejecutar el mantenimiento: la fecha de inicio no puede ser posterior a la fecha de fin.');
        }

        const maintenanceMonths = parseMaintenanceMonths(maintenancePeriod.months) || calculateMaintenanceMonthsFromRange(from, until) || 1;
        const maintenanceMonthlyFee = Number(maintenancePeriod.monthlyFee || MAINTENANCE_MONTHLY_FEE);
        const maintenanceTotalFee = Number(maintenancePeriod.totalFee || gestionData.maintenanceFee || (maintenanceMonths * maintenanceMonthlyFee));
        const maintenanceFeeLine = formatMaintenanceFeeLine({
          from,
          until,
          months: maintenanceMonths,
          monthlyFee: maintenanceMonthlyFee,
          totalFee: maintenanceTotalFee
        });

        const overlapping = getStudentMaintenancePeriods(studentId).find(period => doDateRangesOverlap(from, until, period.from, period.until));
        if (overlapping) {
          return fail(`⚠️ Este alumno ya tiene un mantenimiento que se solapa con ese periodo:

${formatMaintenancePeriodLine(overlapping)}

Cancélalo o ajusta fechas antes de crear otro.`);
        }

        const classesWithStudent = allClasses.filter(c => c.students && c.students.some(s => s.id === studentId));
        const groupedTeachers = groupClassesByTeacher(classesWithStudent);
        const maintenanceId = `maint-${studentId}-${Date.now()}`;
        const periodLine = formatMaintenancePeriodLine({ from, until });

        await setDoc(doc(db, 'artifacts', appId, 'maintenancePeriods', maintenanceId), {
          studentId,
          studentName: displayName,
          studentEmail,
          from,
          until,
          months: maintenanceMonths,
          status: 'active',
          fee: maintenanceMonthlyFee,
          monthlyFee: maintenanceMonthlyFee,
          totalFee: maintenanceTotalFee,
          maintenanceFeeLine,
          notes: gestionData.details || '',
          sourceGestionId: gestionId,
          sourceGestionTargetMonth: gestionData.targetMonth || '',
          resolvedFromLegacyPrompt: Boolean(maintenancePeriod.resolvedFromLegacyPrompt),
          affectedClassIds: classesWithStudent.map(c => c.id),
          affectedClassLines: classesWithStudent.map(c => formatClassLine(c)),
          createdAt: new Date().toISOString(),
          createdBy: user?.email || 'admin'
        });

        if (studentInfo?.globalStatus === 'congelado') {
          await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), { globalStatus: 'activo' });
        }

        for (let c of classesWithStudent) {
          if (c.refPath && (c.students || []).some(s => s.id === studentId && s.isPaused === true)) {
            const updatedList = c.students.map(s => s.id === studentId ? { ...s, isPaused: false } : s);
            await updateDoc(doc(db, c.refPath), { students: updatedList });
          }
        }

        await sendGroupedTeacherSummary({
          groupedClasses: groupedTeachers,
          subjectBuilder: (group) => `Alumno en mantenimiento temporal: ${displayName}`,
          bodyBuilder: (group) => `Hola ${group.teacherName},

Desde coordinación te informamos que ${displayName} tendrá la plaza en mantenimiento temporal ${periodLine}.

Afecta a ${group.classes.length === 1 ? 'esta clase' : 'estas clases'}:

${group.classes.map(c => `· ${formatClassLine(c)}`).join('\n')}

Durante ese periodo no debes esperarlo en clase. Fuera de esas fechas volverá a figurar como alumno activo automáticamente en la plataforma.

Un saludo,
Coordinación Los Mitos.`
        });

        await sendStudentNotification({
          studentEmail,
          subject: `Confirmación de mantenimiento temporal de plaza - Escuela Los Mitos`,
          body: `Hola ${studentName},

Te confirmamos que tu solicitud de mantenimiento de plaza ha sido tramitada correctamente.

Periodo de mantenimiento: ${periodLine}.

Durante ese periodo conservas tu plaza con cuota de mantenimiento: ${maintenanceFeeLine}. Tu acceso al portal quedará limitado según la normativa del centro. Al finalizar el periodo, tu plaza volverá a estar activa automáticamente en la plataforma.

Un saludo,
Coordinación Los Mitos.`
        });

        await finalizeGestionStatus(gestionId, 'completado', gestionData, `Mantenimiento temporal creado ${periodLine} · ${maintenanceFeeLine}`);
        return notify(`❄️ Mantenimiento temporal creado para ${displayName}: ${periodLine}. Cuota: ${maintenanceFeeLine}. Profesores y alumno avisados.`);
      }
      else if (type === 'reactivar_plaza') {
        const periodsToCancel = getStudentMaintenancePeriods(studentId).filter(period => period.until >= todayStr);
        if (periodsToCancel.length === 0) {
          await finalizeGestionStatus(gestionId, 'completado', gestionData, 'No había mantenimientos activos o futuros que cancelar');
          return notify(`ℹ️ ${displayName} no tenía mantenimientos activos o futuros. El trámite queda archivado.`);
        }

        for (let period of periodsToCancel) {
          await updateDoc(doc(db, 'artifacts', appId, 'maintenancePeriods', period.id), {
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            cancelledBy: user?.email || 'admin',
            cancelReason: `Reactivación anticipada desde gestión ${gestionId}`
          });
        }

        if (studentInfo?.globalStatus === 'congelado') {
          await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), { globalStatus: 'activo' });
        }

        const classesWithStudent = allClasses.filter(c => c.students && c.students.some(s => s.id === studentId));
        const groupedTeachers = groupClassesByTeacher(classesWithStudent);
        for (let c of classesWithStudent) {
          if (c.refPath && (c.students || []).some(s => s.id === studentId && s.isPaused === true)) {
            const updatedList = c.students.map(s => s.id === studentId ? { ...s, isPaused: false } : s);
            await updateDoc(doc(db, c.refPath), { students: updatedList });
          }
        }

        await sendGroupedTeacherSummary({
          groupedClasses: groupedTeachers,
          subjectBuilder: (group) => `Fin anticipado de mantenimiento: ${displayName}`,
          bodyBuilder: (group) => `Hola ${group.teacherName},

Desde coordinación te informamos que ${displayName} finaliza anticipadamente su mantenimiento temporal y vuelve a estar activo en ${group.classes.length === 1 ? 'esta clase' : 'estas clases'}:

${group.classes.map(c => `· ${formatClassLine(c)}`).join('\n')}

La plataforma dejará de tratarlo como alumno en mantenimiento.

Un saludo,
Coordinación Los Mitos.`
        });

        await sendStudentNotification({
          studentEmail,
          subject: `Confirmación de fin de mantenimiento - Escuela Los Mitos`,
          body: `Hola ${studentName},

Te confirmamos que tu solicitud de finalizar el mantenimiento de plaza ha sido tramitada correctamente.

A partir de este momento tu plaza vuelve a estar activa en la plataforma y podrás volver a asistir a clase y gestionar recuperaciones según las condiciones del centro.

Un saludo,
Coordinación Los Mitos.`
        });

        await finalizeGestionStatus(gestionId, 'completado', gestionData, `Cancelados ${periodsToCancel.length} periodo(s) de mantenimiento`);
        return notify(`✅ Mantenimiento finalizado anticipadamente. Periodos cancelados: ${periodsToCancel.length}. Profesores y alumno avisados.`);
      }
      else if (type === 'cambio_horario' || type === 'recuperacion' || type === 'ampliar_clases') {
        const maintenanceCheckDate = type === 'recuperacion' ? (recoveryDate || todayStr) : todayStr;
        if (isStudentInMaintenance(studentId, maintenanceCheckDate)) {
          const activeMaintenance = getActiveStudentMaintenancePeriod(studentId, maintenanceCheckDate);
          return fail(`⚠️ No se puede ejecutar este trámite.

${displayName} tiene la plaza en mantenimiento ${formatMaintenancePeriodLine(activeMaintenance)}. Primero debe finalizar ese periodo o aprobarse un fin anticipado.`);
        }

        if (type === 'recuperacion') {
          const recoveryTicketStats = getTicketStatsForDate(studentId, recoveryDate, gestionId);
          if (recoveryTicketStats.free <= 0) {
            return fail(`⚠️ No se puede aprobar esta recuperación.

${displayName} no tiene tickets libres válidos para la fecha elegida (${formatDateSpanish(recoveryDate)}).

Tickets válidos ese día: ${recoveryTicketStats.active}
Recuperaciones comprometidas: ${recoveryTicketStats.committed}
Tickets libres: ${recoveryTicketStats.free}`);
          }
        }

        if (!requestedClass) {
          await finalizeGestionStatus(gestionId, 'completado', gestionData, 'Archivado sin clase destino');
          return notify("⚠️ Aviso: Este ticket no tiene ninguna clase de destino guardada. Solo se ha archivado el ticket.");
        }
        const targetClass = operationalClasses.find(c => c.id === requestedClass);
        if (!targetClass) {
          return fail(`❌ Error crítico: La clase elegida por el alumno ya no existe en la base de datos.`);
        }

        let logMessage = `Iniciando proceso para ${displayName}:\n\n`;
        let oldClasses = [];
        let sourceStudentEntry = null;

        if (type === 'cambio_horario') {
          const sourceClass = getGestionSourceClass(gestionData);
          const sourceClassLine = getGestionSourceClassLine(gestionData);
          const hasScopedChange = Boolean(gestionData.sourceClassId || gestionData.sourceClassLine);
          const scheduledEndDate = promptScheduledClassEndDate(gestionData, 'el cambio de horario', silent);
          if (!scheduledEndDate) {
            return { ok: false, cancelled: true, message: 'Fecha efectiva no seleccionada.' };
          }
          const scheduledStartDate = getScheduledClassStartAfterEndDate(scheduledEndDate);

          if (hasScopedChange && !sourceClass?.refPath) {
            return fail(`⚠️ No se puede programar el cambio de horario por plaza.

La solicitud indica una plaza de origen, pero esa clase ya no existe o no tiene ruta válida.

Plaza indicada:
${sourceClassLine || gestionData.sourceClassId || 'No indicada'}`);
          }

          if (hasScopedChange && sourceClass?.id === targetClass.id) {
            return fail('⚠️ No se puede ejecutar el cambio: la plaza de origen y la clase de destino son la misma.');
          }

          oldClasses = hasScopedChange && sourceClass
            ? [sourceClass]
            : recurringClassesOnly.filter(c => c.id !== requestedClass && c.students && c.students.some(s => {
                const studentForEntry = students.find(student => student.id === s.id) || {};
                return s.id === studentId && isStudentClassCommittedOnDate(s, studentForEntry, todayStr) && c.subject === targetClass.subject;
              }));

          if (oldClasses.length === 0) {
            return fail('⚠️ No se ha encontrado una plaza de origen activa para programar el cambio de horario.');
          }

          for (let c of oldClasses) {
            const currentEntry = (c.students || []).find(s => s.id === studentId);
            if (!sourceStudentEntry && currentEntry) sourceStudentEntry = currentEntry;
            const updatedList = (c.students || []).map(s =>
              s.id === studentId ? applyScheduledEndToStudentEntry(s, scheduledEndDate, 'cambio_horario', gestionId) : s
            );
            if (c.refPath) {
              await updateDoc(doc(db, c.refPath), { students: updatedList });
              logMessage += `➖ Salida programada de ${formatClassLine(c)} el ${formatDateSpanish(scheduledEndDate)}.\n`;
            }
          }

          const newStudentPayload = {
            id: studentId,
            name: displayName,
            email: studentInfo?.email || '',
            classStartDate: scheduledStartDate,
            scheduledStartDate,
            scheduledStartReason: 'cambio_horario',
            scheduledGestionId: gestionId,
            isPaused: false,
            status: 'present',
            isRecovery: false,
            recoveryDate: null
          };
          const updatedTargetStudents = [...(targetClass.students || []).filter(s => s.id !== studentId), newStudentPayload];
          await updateDoc(doc(db, targetClass.refPath), { students: updatedTargetStudents });
          logMessage += `➕ Entrada programada en ${formatClassLine(targetClass)} desde ${formatDateSpanish(scheduledStartDate)}.\n`;
          await finalizeGestionStatus(
            gestionId,
            'completado',
            gestionData,
            `Cambio de horario programado. Sale el ${formatDateSpanish(scheduledEndDate)} y entra el ${formatDateSpanish(scheduledStartDate)}.`,
            buildScheduledExecutionUpdate(scheduledEndDate, {
              scheduledAction: 'cambio_horario',
              scheduledClassStartDate: scheduledStartDate,
              scheduledTargetClassId: targetClass.id,
              scheduledTargetClassLine: formatClassLine(targetClass)
            })
          );
          logMessage += `✅ Cambio de horario programado con éxito.\n`;

          const oldGroups = groupClassesByTeacher(oldClasses);
          const targetEmail = getTeacherEmail(targetClass.teacher);
          const targetOldGroup = oldGroups.find(g => g.email === targetEmail);
          const otherOldGroups = oldGroups.filter(g => g.email !== targetEmail);

          await sendGroupedTeacherSummary({
            groupedClasses: otherOldGroups,
            subjectBuilder: (group) => `Cambio de horario programado: ${displayName} deja tu clase`,
            bodyBuilder: (group) => `Hola ${group.teacherName},\n\nTe informamos que ${displayName} tiene programado un cambio de horario y dejará de asistir a ${group.classes.length === 1 ? 'esta clase' : 'estas clases'}:\n\n${group.classes.map(c => `· ${formatClassLine(c)}`).join('\n')}\n\nÚltimo día en el horario actual: ${formatDateSpanish(scheduledEndDate)}.\nA partir de ${formatDateSpanish(scheduledStartDate)} ya no debe aparecer como alumno activo en esa lista.\n\nUn saludo,\nCoordinación Los Mitos.`
          });

          if (targetOldGroup) {
            await sendTeacherNotification({
              teacherName: targetClass.teacher,
              subject: `Cambio de horario interno programado: ${displayName}`,
              body: `Hola ${targetClass.teacher},\n\nTe informamos que ${displayName} tiene programado un cambio de horario dentro de tus clases.\n\nDeja de asistir a:\n${targetOldGroup.classes.map(c => `· ${formatClassLine(c)}`).join('\n')}\n\nÚltimo día en el horario actual: ${formatDateSpanish(scheduledEndDate)}.\n\nY pasa a asistir a:\n· ${formatClassLine(targetClass)}\n\nFecha de inicio en el nuevo horario: ${formatDateSpanish(scheduledStartDate)}.\n\nUn saludo,\nCoordinación Los Mitos.`
            });
          } else if (!isPunctualClass(targetClass)) {
            await sendTeacherNotification({
              teacherName: targetClass.teacher,
              subject: `Nuevo alumno fijo programado: ${displayName} (${targetClass.subject})`,
              body: `Hola ${targetClass.teacher},\n\nDesde coordinación hemos programado a ${displayName} como alumno fijo en tu clase:\n\n· ${formatClassLine(targetClass)}\n\nFecha de inicio en tu lista: ${formatDateSpanish(scheduledStartDate)}.\nHasta entonces no debe aparecer como alumno activo en esta clase.\n\nUn saludo,\nCoordinación Los Mitos.`
            });
          }

          await sendStudentNotification({
            studentEmail,
            subject: `Confirmación de cambio de horario programado - Escuela Los Mitos`,
            body: `Hola ${studentName},\n\nTe confirmamos que tu cambio de horario ha sido aprobado y programado correctamente.\n\n${sourceClassLine ? `Horario actual:\n· ${sourceClassLine}\nÚltimo día en este horario: ${formatDateSpanish(scheduledEndDate)}.\n\n` : ''}Nuevo horario:\n· ${formatClassLine(targetClass)}\nProfesor/a: ${targetClass.teacher}\nFecha de inicio: ${formatDateSpanish(scheduledStartDate)}.\n\nUn saludo,\nCoordinación Los Mitos.`
          });

          return notify(logMessage);
        }

        const newStudentPayload = {
          id: studentId,
          name: displayName,
          email: studentInfo?.email || '',
          classStartDate: studentInfo?.classStartDate || '',
          isPaused: false,
          status: 'present',
          isRecovery: type === 'recuperacion',
          recoveryDate: type === 'recuperacion' ? recoveryDate : null
        };
        const updatedTargetStudents = [...(targetClass.students || []).filter(s => s.id !== studentId), newStudentPayload];
        await updateDoc(doc(db, targetClass.refPath), { students: updatedTargetStudents });
        logMessage += `➕ Añadido a la clase de ${targetClass.subject} (${targetClass.time}h).\n`;
        await finalizeGestionStatus(gestionId, 'completado', gestionData, 'Ejecutado desde bandeja Admin');
        logMessage += `✅ Trámite archivado con éxito.\n`;

        if (type === 'ampliar_clases' && !isPunctualClass(targetClass)) {
          await sendTeacherNotification({
            teacherName: targetClass.teacher,
            subject: `Nuevo alumno fijo: ${displayName} (${targetClass.subject})`,
            body: `Hola ${targetClass.teacher},\n\nDesde coordinación hemos añadido a ${displayName} como alumno fijo en tu clase:\n\n· ${formatClassLine(targetClass)}\n\nEl alumno ya aparece activo en tu lista de asistencia de la App.\n\nUn saludo,\nCoordinación Los Mitos.`
          });

          await sendStudentNotification({
            studentEmail,
            subject: `Confirmación de ampliación de clases - Escuela Los Mitos`,
            body: `Hola ${studentName},\n\nTe confirmamos que tu ampliación de clases ha sido aprobada y tramitada correctamente.\n\nNueva clase añadida a tu horario:\n· ${formatClassLine(targetClass)}\nProfesor/a: ${targetClass.teacher}\n\nUn saludo,\nCoordinación Los Mitos.`
          });
        }

        if (type === 'recuperacion') {
          await sendTeacherNotification({
            teacherName: targetClass.teacher,
            subject: `Recuperación programada: ${displayName} (${targetClass.subject})`,
            body: `Hola ${targetClass.teacher},\n\nDesde coordinación hemos programado a ${displayName} para recuperar una clase contigo.\n\nClase de destino:\n· ${formatClassLine(targetClass)}\n\nFecha exacta de recuperación: ${formatDateSpanish(recoveryDate)}\n\nEl sistema es inteligente: el alumno NO aparecerá en tu lista hasta que llegue exactamente ese día.\n\nUn saludo,\nCoordinación Los Mitos.`
          });

          await sendStudentNotification({
            studentEmail,
            subject: `Confirmación de recuperación programada - Escuela Los Mitos`,
            body: `Hola ${studentName},\n\nTe confirmamos que tu recuperación ha sido programada correctamente.\n\nRecuperación:\n· ${formatClassLine(targetClass)}\nProfesor/a: ${targetClass.teacher}\nFecha exacta: ${formatDateSpanish(recoveryDate)}\n\nRecuerda que las clases de recuperación no son recuperables si no asistes.\n\nUn saludo,\nCoordinación Los Mitos.`
          });
        }

        return notify(logMessage);
      } else {
        await finalizeGestionStatus(gestionId, 'completado', gestionData, 'Trámite genérico archivado');
        return notify("✅ Trámite genérico archivado correctamente.");
      }
    } catch (error) {
      return fail(`❌ ERROR DEL SISTEMA:\n\n${error.message}`);
    }
  };

  const executeAllReadyGestiones = async () => {
    const readyGestionesBase = pendingGestiones.filter(isGestionReadyForExecution);
    const blockedGestiones = pendingGestiones.filter(g => !isGestionReadyForExecution(g));
    const legacyMaintenanceGestiones = readyGestionesBase.filter(g =>
      g.type === 'mantenimiento' && getMaintenancePeriodFromGestion(g).isLegacyMissingDuration
    );
    const readyGestiones = readyGestionesBase.filter(g =>
      !(g.type === 'mantenimiento' && getMaintenancePeriodFromGestion(g).isLegacyMissingDuration)
    );

    if (readyGestiones.length === 0) {
      if (legacyMaintenanceGestiones.length > 0) {
        alert(`No hay trámites listos para ejecutar en bloque.\n\nTienes ${legacyMaintenanceGestiones.length} mantenimiento(s) antiguo(s) sin duración. Ejecútalos individualmente para elegir 1 mes o 2 meses.`);
        return;
      }

      alert(blockedGestiones.length > 0
        ? `No hay trámites listos para ejecutar. Tienes ${blockedGestiones.length} pendiente(s) de marcar como Tadosi hecho.`
        : 'No hay trámites pendientes para ejecutar.');
      return;
    }

    if (!window.confirm(`¿Ejecutar ahora ${readyGestiones.length} trámite(s) listos?\n\nNo aparecerán ventanas por cada trámite. Al final verás un resumen.\n\nSe omitirán ${blockedGestiones.length} trámite(s) pendientes de Tadosi.\nSe omitirán ${legacyMaintenanceGestiones.length} mantenimiento(s) antiguo(s) sin duración: esos deben ejecutarse individualmente.`)) return;

    setBulkExecutingGestiones(true);
    const results = [];
    try {
      for (const gestion of readyGestiones) {
        const result = await updateGestionStatus(gestion.id, 'completado', gestion, { skipConfirm: true, silent: true });
        results.push({ gestion, result });
      }

      const ok = results.filter(r => r.result?.ok).length;
      const errors = results.filter(r => !r.result?.ok);
      const errorLines = errors.map(r => `- ${r.gestion.studentName || 'Sin alumno'} (${(r.gestion.type || 'trámite').replace('_', ' ')}): ${r.result?.message || 'Error no especificado'}`);

      alert(`Cierre en bloque terminado.\n\nEjecutados correctamente: ${ok}\nCon error u omitidos: ${errors.length}\nPendientes de Tadosi omitidos: ${blockedGestiones.length}\nMantenimientos antiguos sin duración omitidos: ${legacyMaintenanceGestiones.length}${errorLines.length ? `\n\nErrores:\n${errorLines.join('\n')}` : ''}`);
    } finally {
      setBulkExecutingGestiones(false);
    }
  };


  const getScheduledGestionEndDate = (gestion = {}) => normalizeGestionDateString(
    gestion.scheduledClassEndDate ||
    gestion.bajaClassEndDate ||
    gestion.effectiveEndDate ||
    gestion.classEndDate ||
    gestion.scheduledEndDate ||
    ''
  );

  const getScheduledGestionEffectiveDate = (gestion = {}) => {
    const explicitEffective = normalizeGestionDateString(
      gestion.scheduledEffectiveDate ||
      gestion.bajaEffectiveDate ||
      gestion.effectiveStartDate ||
      gestion.scheduledClassStartDate ||
      ''
    );
    if (explicitEffective) return explicitEffective;
    const endDate = getScheduledGestionEndDate(gestion);
    return endDate ? getScheduledClassStartAfterEndDate(endDate) : '';
  };

  const shouldConsolidateScheduledGestion = (gestion = {}) => {
    if (!['baja', 'cambio_horario'].includes(gestion.type)) return false;
    if (gestion.status !== 'completado') return false;
    if (gestion.workflowStatus === 'consolidado' || gestion.consolidatedAt) return false;
    if (gestion.executionMode && !String(gestion.executionMode).includes('scheduled')) return false;

    const endDate = getScheduledGestionEndDate(gestion);
    const effectiveDate = getScheduledGestionEffectiveDate(gestion);
    return Boolean(endDate && effectiveDate && effectiveDate <= todayStr);
  };

  const getScheduledEntryEndDate = (studentEntry = {}, studentInfo = {}) => getStudentClassEndDate(studentEntry, studentInfo);

  const isEntryScheduledByGestion = (studentEntry = {}, gestion = {}, reasonPrefix = '') => {
    const gestionId = String(gestion.id || '').trim();
    const entryGestionId = String(studentEntry.scheduledGestionId || studentEntry.sourceGestionId || '').trim();
    const reason = String(studentEntry.scheduledEndReason || studentEntry.endReason || '').toLowerCase();
    if (gestionId && entryGestionId === gestionId) return true;
    if (reasonPrefix && reason.includes(reasonPrefix)) return true;
    return false;
  };

  const buildConsolidatedGestionUpdate = (gestion = {}, summary = '', extra = {}) => {
    const endDate = getScheduledGestionEndDate(gestion);
    const effectiveDate = getScheduledGestionEffectiveDate(gestion);
    return {
      workflowStatus: 'consolidado',
      executionMode: 'scheduled_consolidated',
      consolidatedAt: new Date().toISOString(),
      consolidatedBy: user?.email || 'admin',
      consolidatedClassEndDate: endDate,
      consolidatedEffectiveDate: effectiveDate,
      consolidatedSummary: summary,
      ...extra
    };
  };

  const getClassStudentsAfterLocalUpdates = (classData = {}, localUpdates = new Map()) => {
    if (!classData?.id) return classData.students || [];
    return localUpdates.has(classData.id) ? localUpdates.get(classData.id) : (classData.students || []);
  };

  const hasRemainingCommittedFixedSeat = (studentId, studentInfo = {}, localUpdates = new Map()) => {
    return recurringClassesOnly.some(classData => {
      const studentList = getClassStudentsAfterLocalUpdates(classData, localUpdates);
      return studentList.some(studentEntry =>
        studentEntry.id === studentId &&
        isFixedClassStudent(studentEntry) &&
        isStudentClassCommittedOnDate(studentEntry, studentInfo, todayStr)
      );
    });
  };

  const consolidateScheduledBajaGestion = async (gestion = {}) => {
    const studentId = gestion.studentId;
    if (!studentId) return { ok: false, message: 'Gestión de baja sin alumno asociado.' };

    const studentInfo = students.find(s => s.id === studentId) || {};
    const displayName = studentInfo?.useAlias && studentInfo?.alias ? studentInfo.alias : (gestion.studentName || studentInfo?.name || 'Alumno');
    const isTotalBaja = isTotalBajaGestion(gestion);
    const sourceClass = getGestionSourceClass(gestion);
    const hasScopedBaja = Boolean(gestion.sourceClassId || gestion.sourceClassLine);
    const endDate = getScheduledGestionEndDate(gestion);
    const effectiveDate = getScheduledGestionEffectiveDate(gestion);
    const localClassUpdates = new Map();
    const removedClassLines = [];

    const classesWithStudent = allClasses.filter(classData =>
      classData.refPath &&
      (classData.students || []).some(studentEntry => studentEntry.id === studentId)
    );

    for (const classData of classesWithStudent) {
      const currentStudents = classData.students || [];
      const updatedStudents = currentStudents.filter(studentEntry => {
        if (studentEntry.id !== studentId) return true;

        if (isTotalBaja) return false;

        const entryEndDate = getScheduledEntryEndDate(studentEntry, studentInfo);
        const entryIsDue = Boolean(entryEndDate && entryEndDate < todayStr);
        const entryWasScheduledForThisBaja = isEntryScheduledByGestion(studentEntry, gestion, 'baja') && entryIsDue;
        const isSourceClass = Boolean(sourceClass?.id && classData.id === sourceClass.id);

        if (entryWasScheduledForThisBaja) return false;
        if (hasScopedBaja && isSourceClass && isFixedClassStudent(studentEntry)) return false;
        return true;
      });

      if (updatedStudents.length !== currentStudents.length) {
        await updateDoc(doc(db, classData.refPath), { students: updatedStudents });
        localClassUpdates.set(classData.id, updatedStudents);
        removedClassLines.push(formatClassLine(classData));
      }
    }

    const hasRemainingSeat = hasRemainingCommittedFixedSeat(studentId, studentInfo, localClassUpdates);
    const shouldFinalizeGlobalBaja = isTotalBaja || !hasRemainingSeat;
    let ticketsVoided = 0;

    if (shouldFinalizeGlobalBaja) {
      await resetStudentTrivia(studentId);
      ticketsVoided = await voidStudentTickets(studentId, 'baja_programada_consolidada');
      await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), {
        globalStatus: 'baja',
        classes: [],
        scheduledBaja: false,
        scheduledBajaConsolidatedAt: new Date().toISOString(),
        scheduledBajaConsolidatedBy: user?.email || 'admin',
        bajaEffectiveDate: effectiveDate,
        bajaClassEndDate: endDate,
        bajaSourceGestionId: gestion.id || ''
      });
    } else if (studentInfo?.globalStatus === 'baja') {
      await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), {
        globalStatus: 'activo',
        scheduledBaja: false,
        lastPartialBajaConsolidatedAt: new Date().toISOString(),
        lastPartialBajaConsolidatedBy: user?.email || 'admin'
      });
    } else if (studentInfo?.scheduledBajaSourceGestionId === gestion.id || studentInfo?.scheduledBaja === true) {
      await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), {
        scheduledBaja: false,
        lastPartialBajaConsolidatedAt: new Date().toISOString(),
        lastPartialBajaConsolidatedBy: user?.email || 'admin'
      });
    }

    const summary = shouldFinalizeGlobalBaja
      ? `Baja definitiva consolidada para ${displayName}. Clases eliminadas: ${removedClassLines.length}. Tickets anulados: ${ticketsVoided}.`
      : `Baja parcial consolidada para ${displayName}. Plaza eliminada: ${removedClassLines.length}. Conserva otras plazas activas.`;

    await updateDoc(doc(db, 'artifacts', appId, 'gestiones', gestion.id), buildConsolidatedGestionUpdate(gestion, summary, {
      consolidatedAction: shouldFinalizeGlobalBaja ? 'baja_total_definitiva' : 'baja_parcial_definitiva',
      consolidatedRemovedClassLines: removedClassLines,
      consolidatedRemovedClassCount: removedClassLines.length,
      consolidatedTicketsVoided: ticketsVoided,
      consolidatedKeepsActiveSeats: !shouldFinalizeGlobalBaja
    }));

    return { ok: true, message: summary };
  };

  const consolidateScheduledChangeGestion = async (gestion = {}) => {
    const studentId = gestion.studentId;
    if (!studentId) return { ok: false, message: 'Gestión de cambio sin alumno asociado.' };

    const studentInfo = students.find(s => s.id === studentId) || {};
    const displayName = studentInfo?.useAlias && studentInfo?.alias ? studentInfo.alias : (gestion.studentName || studentInfo?.name || 'Alumno');
    const targetClassId = String(gestion.scheduledTargetClassId || gestion.requestedClass || '').trim();
    const targetClass = allClasses.find(classData => classData.id === targetClassId) || null;
    const sourceClass = getGestionSourceClass(gestion);
    const hasScopedChange = Boolean(gestion.sourceClassId || gestion.sourceClassLine);
    const scheduledStartDate = normalizeGestionDateString(gestion.scheduledClassStartDate || gestion.effectiveStartDate || '') || getScheduledGestionEffectiveDate(gestion);
    const removedClassLines = [];

    const classesWithStudent = allClasses.filter(classData =>
      classData.refPath &&
      classData.id !== targetClassId &&
      (classData.students || []).some(studentEntry => studentEntry.id === studentId)
    );

    for (const classData of classesWithStudent) {
      const currentStudents = classData.students || [];
      const updatedStudents = currentStudents.filter(studentEntry => {
        if (studentEntry.id !== studentId) return true;
        if (!isFixedClassStudent(studentEntry)) return true;

        const entryEndDate = getScheduledEntryEndDate(studentEntry, studentInfo);
        const entryIsDue = Boolean(entryEndDate && entryEndDate < todayStr);
        const entryWasScheduledForThisChange = isEntryScheduledByGestion(studentEntry, gestion, 'cambio_horario') && entryIsDue;
        const isSourceClass = Boolean(sourceClass?.id && classData.id === sourceClass.id);
        const sameSubjectFallback = !hasScopedChange && targetClass?.subject && classData.subject === targetClass.subject;

        if (entryWasScheduledForThisChange) return false;
        if (hasScopedChange && isSourceClass) return false;
        if (sameSubjectFallback && entryIsDue) return false;
        return true;
      });

      if (updatedStudents.length !== currentStudents.length) {
        await updateDoc(doc(db, classData.refPath), { students: updatedStudents });
        removedClassLines.push(formatClassLine(classData));
      }
    }

    let targetStatus = 'ok';
    if (targetClass?.refPath) {
      const targetHasStudent = (targetClass.students || []).some(studentEntry => studentEntry.id === studentId && isFixedClassStudent(studentEntry));
      if (!targetHasStudent) {
        const newStudentPayload = {
          id: studentId,
          name: displayName,
          email: studentInfo?.email || gestion.studentEmail || '',
          classStartDate: scheduledStartDate,
          scheduledStartDate,
          scheduledStartReason: 'cambio_horario',
          scheduledGestionId: gestion.id,
          isPaused: false,
          status: 'present',
          isRecovery: false,
          recoveryDate: null
        };
        await updateDoc(doc(db, targetClass.refPath), { students: [...(targetClass.students || []), newStudentPayload] });
        targetStatus = 'recreada_entrada_destino';
      }
    } else {
      targetStatus = 'clase_destino_no_localizada';
    }

    const summary = `Cambio de horario consolidado para ${displayName}. Salidas limpiadas: ${removedClassLines.length}${targetStatus === 'clase_destino_no_localizada' ? '. Aviso: clase destino no localizada.' : ''}`;

    await updateDoc(doc(db, 'artifacts', appId, 'gestiones', gestion.id), buildConsolidatedGestionUpdate(gestion, summary, {
      consolidatedAction: 'cambio_horario_definitivo',
      consolidatedRemovedClassLines: removedClassLines,
      consolidatedRemovedClassCount: removedClassLines.length,
      consolidatedTargetClassStatus: targetStatus,
      consolidatedTargetClassId: targetClassId,
      consolidatedTargetClassLine: targetClass ? formatClassLine(targetClass) : (gestion.requestedClassLine || '')
    }));

    return { ok: true, message: summary };
  };

  const consolidateExpiredScheduledGestiones = async () => {
    const expiredGestiones = scheduledGestionesVencidas.filter(gestion => ['baja', 'cambio_horario'].includes(gestion.type));

    if (expiredGestiones.length === 0) {
      alert('No hay bajas ni cambios de horario programados vencidos para consolidar.');
      return;
    }

    const bajaCount = expiredGestiones.filter(gestion => gestion.type === 'baja').length;
    const changeCount = expiredGestiones.filter(gestion => gestion.type === 'cambio_horario').length;
    const previewLimit = 25;
    const previewLines = expiredGestiones.slice(0, previewLimit).map((gestion, index) => {
      const typeLabel = gestion.type === 'baja' ? getBajaScopeLabel(gestion) || 'Baja' : 'Cambio de horario';
      const endDate = getScheduledGestionEndDate(gestion);
      const effectiveDate = getScheduledGestionEffectiveDate(gestion);
      const sourceLine = getGestionSourceClassLine(gestion);
      const targetLine = getGestionTargetClassLine(gestion);
      const classLine = targetLine && sourceLine && targetLine !== sourceLine
        ? `Origen: ${sourceLine} / Destino: ${targetLine}`
        : (sourceLine || targetLine || 'Clase no indicada');
      return `${index + 1}. ${gestion.studentName || 'Sin alumno'} · ${typeLabel}\n   Fin: ${formatDateSpanish(endDate)} · Efectiva: ${formatDateSpanish(effectiveDate)}\n   ${classLine}`;
    });
    const hiddenPreviewCount = Math.max(expiredGestiones.length - previewLimit, 0);
    const previewText = `${previewLines.join('\n\n')}${hiddenPreviewCount > 0 ? `\n\n...y ${hiddenPreviewCount} gestión(es) más.` : ''}`;

    if (!window.confirm(`Vas a consolidar estas gestiones programadas vencidas:\n\n${previewText}\n\nResumen:\nBajas: ${bajaCount}\nCambios de horario: ${changeCount}\n\nEsto elimina definitivamente las plazas antiguas ya vencidas. En bajas totales también marca baja definitiva, anula tickets pendientes y pone el trivial a cero.\n\nNo procesa mantenimientos.\n\n¿Confirmas la consolidación?`)) return;

    setBulkConsolidatingGestiones(true);
    const results = [];

    try {
      for (const gestion of expiredGestiones) {
        try {
          const result = gestion.type === 'baja'
            ? await consolidateScheduledBajaGestion(gestion)
            : await consolidateScheduledChangeGestion(gestion);
          results.push({ gestion, result });
        } catch (error) {
          results.push({ gestion, result: { ok: false, message: error.message || String(error) } });
        }
      }

      const okResults = results.filter(item => item.result?.ok);
      const errorResults = results.filter(item => !item.result?.ok);
      const errorLines = errorResults.map(item => `- ${item.gestion.studentName || 'Sin alumno'} (${item.gestion.type || 'gestión'}): ${item.result?.message || 'Error no especificado'}`);

      alert(`Consolidación terminada.\n\nConsolidadas correctamente: ${okResults.length}\nCon error u omitidas: ${errorResults.length}${errorLines.length ? `\n\nErrores:\n${errorLines.join('\n')}` : ''}`);
    } finally {
      setBulkConsolidatingGestiones(false);
    }
  };

  const toggleStudentToggle = async (studentId, field, currentValue) => {
    const isStatusField = field === 'globalStatus';
    const newStatus = isStatusField ? (currentValue === 'congelado' ? 'activo' : 'congelado') : !currentValue;
    if(window.confirm(`¿Cambiar este ajuste a ${isStatusField ? newStatus.toUpperCase() : (newStatus ? 'ON' : 'OFF')}?`)) {
      await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), { [field]: newStatus });
    }
  };

  const createManualMaintenanceForStudent = async (studentId, studentName) => {
    if (!studentId) return false;

    const studentInfo = students.find(s => s.id === studentId);
    const displayName = studentInfo?.useAlias && studentInfo?.alias ? studentInfo.alias : (studentName || studentInfo?.name || 'Alumno');
    const studentEmail = normalizeEmail(studentInfo?.email || '');

    if (studentInfo?.globalStatus === 'baja') {
      alert(`${displayName} está dado de baja. No se puede crear un mantenimiento temporal sobre una baja.`);
      return false;
    }

    if (studentInfo?.globalStatus === 'impago') {
      const okImpago = window.confirm(`${displayName} está marcado como IMPAGO.\n\nPuedes crear igualmente el mantenimiento temporal, pero mientras siga en impago el acceso del alumno seguirá bloqueado por incidencia administrativa.\n\n¿Quieres continuar?`);
      if (!okImpago) return false;
    }

    const period = promptManualMaintenancePeriod(displayName);
    if (!period) return false;

    const overlapping = getStudentMaintenancePeriods(studentId).find(existingPeriod => doDateRangesOverlap(period.from, period.until, existingPeriod.from, existingPeriod.until));
    if (overlapping) {
      alert(`⚠️ ${displayName} ya tiene un mantenimiento que se solapa con ese periodo:\n\n${formatMaintenancePeriodLine(overlapping)}\n\nCancélalo o elige otro mes.`);
      return false;
    }

    const classesWithStudent = allClasses.filter(c => c.students && c.students.some(s => s.id === studentId));
    const periodLine = formatMaintenancePeriodLine(period);
    const maintenanceFeeLine = formatMaintenanceFeeLine(period);

    const ok = window.confirm(`¿Crear mantenimiento temporal manual para ${displayName}?\n\nPeriodo: ${periodLine}\nCuota: ${maintenanceFeeLine}\nClases afectadas: ${classesWithStudent.length}\n\nNo se cambiará globalStatus a congelado. Se creará un periodo en maintenancePeriods.`);
    if (!ok) return false;

    try {
      const groupedTeachers = groupClassesByTeacher(classesWithStudent);
      const maintenanceId = `maint-manual-${studentId}-${Date.now()}`;
      const now = new Date().toISOString();

      await setDoc(doc(db, 'artifacts', appId, 'maintenancePeriods', maintenanceId), {
        studentId,
        studentName: displayName,
        studentEmail,
        from: period.from,
        until: period.until,
        months: period.months,
        status: 'active',
        fee: MAINTENANCE_MONTHLY_FEE,
        monthlyFee: MAINTENANCE_MONTHLY_FEE,
        totalFee: period.totalFee,
        notes: 'Mantenimiento creado manualmente desde Alumnos CRM.',
        source: 'manual_crm',
        sourceGestionId: '',
        affectedClassIds: classesWithStudent.map(c => c.id),
        affectedClassLines: classesWithStudent.map(c => formatClassLine(c)),
        createdAt: now,
        createdBy: user?.email || 'admin'
      });

      if (studentInfo?.globalStatus === 'congelado') {
        await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), { globalStatus: 'activo' });
      }

      await syncStudentPauseStateInClasses(studentId, false);

      await sendGroupedTeacherSummary({
        groupedClasses: groupedTeachers,
        subjectBuilder: () => `Alumno en mantenimiento temporal: ${displayName}`,
        bodyBuilder: (group) => `Hola ${group.teacherName},

Desde coordinación te informamos que ${displayName} tendrá la plaza en mantenimiento temporal ${periodLine}.

Afecta a ${group.classes.length === 1 ? 'esta clase' : 'estas clases'}:

${group.classes.map(c => `· ${formatClassLine(c)}`).join('\n')}

Durante ese periodo no debes esperarlo en clase. Fuera de esas fechas volverá a figurar como alumno activo automáticamente en la plataforma.

Un saludo,
Coordinación Los Mitos.`
      });

      await sendStudentNotification({
        studentEmail,
        subject: `Confirmación de mantenimiento temporal de plaza - Escuela Los Mitos`,
        body: `Hola ${studentName},

Te confirmamos que desde coordinación hemos registrado el mantenimiento temporal de tu plaza.

Periodo de mantenimiento: ${periodLine}.
Cuota: ${maintenanceFeeLine}.

Durante ese periodo conservas tu plaza y tu acceso al portal quedará limitado según la normativa del centro. Al finalizar el periodo, tu plaza volverá a estar activa automáticamente en la plataforma.

Un saludo,
Coordinación Los Mitos.`
      });

      alert(`❄️ Mantenimiento temporal creado manualmente para ${displayName}: ${periodLine}. Cuota: ${maintenanceFeeLine}. Profesores y alumno avisados.`);
      return true;
    } catch (error) {
      alert('Error al crear el mantenimiento temporal manual: ' + error.message);
      return false;
    }
  };

  const handleUpdateStudentStatus = async (studentId, studentName, newStatus) => {
    if (newStatus === 'mantenimiento') {
      await createManualMaintenanceForStudent(studentId, studentName);
      return;
    }

    if (newStatus === 'baja') {
      const confirmBaja = window.confirm(`⚠️ ACCIÓN DEFINITIVA: ¿Quieres dar de BAJA a ${studentName}?\n\nSe eliminará de todas las listas de los profesores y perderá el acceso al portal.`);
      if (!confirmBaja) return;
    }
    if (newStatus === 'impago') {
      const confirmImpago = window.confirm(`¿Marcar a ${studentName} como IMPAGO?\n\nMantendrá su plaza y seguirá apareciendo en las clases, pero perderá temporalmente el acceso al Área del Alumno hasta que lo reactives.`);
      if (!confirmImpago) return;
    }
    try {
      const studentInfo = students.find(s => s.id === studentId);
      const displayName = studentInfo?.useAlias && studentInfo?.alias ? studentInfo.alias : studentName;
      await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), { globalStatus: newStatus });
      if (newStatus === 'baja') {
        await resetStudentTrivia(studentId);
        const ticketsAnulados = await voidStudentTickets(studentId, 'baja');
        const classesWithThisStudent = allClasses.filter(c => c.students && c.students.some(s => s.id === studentId));
        const groupedTeachers = groupClassesByTeacher(classesWithThisStudent);
        const updatePromises = classesWithThisStudent.map(c => {
          const updatedList = c.students.filter(s => s.id !== studentId);
          if (c.refPath) return updateDoc(doc(db, c.refPath), { students: updatedList });
          return Promise.resolve();
        });
        await Promise.all(updatePromises);

        await sendGroupedTeacherSummary({
          groupedClasses: groupedTeachers,
          subjectBuilder: (group) => `Baja de alumno: ${displayName}`,
          bodyBuilder: (group) => `Hola ${group.teacherName},\n\nDesde coordinación te informamos que ${displayName} ha sido dado de baja y ya no asistirá a ${group.classes.length === 1 ? 'esta clase' : 'estas clases'}:\n\n${group.classes.map(c => `· ${formatClassLine(c)}`).join('\n')}\n\nYa ha sido eliminado de tu lista de asistencia en la App. No debes esperarlo.\n\nUn saludo,\nCoordinación Los Mitos.`
        });

        await sendStudentNotification({
          studentEmail: studentInfo?.email || '',
          subject: `Confirmación de baja - Escuela Los Mitos`,
          body: `Hola ${studentName},\n\nTe confirmamos que tu baja ha sido tramitada correctamente.\n\nUn saludo,\nCoordinación Los Mitos.`
        });

        alert(`✅ ${studentName} ha sido procesado como BAJA y eliminado de sus clases. Profesores y alumno avisados por correo. Tickets anulados: ${ticketsAnulados}. Puntos del trivial a cero.`);
      } else if (newStatus === 'activo') {
        const activeOrFutureMaintenance = getStudentMaintenancePeriods(studentId).filter(period => period.until >= todayStr);
        for (let period of activeOrFutureMaintenance) {
          await updateDoc(doc(db, 'artifacts', appId, 'maintenancePeriods', period.id), {
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            cancelledBy: user?.email || 'admin',
            cancelReason: 'Cambio manual de estado a activo desde ficha de alumno'
          });
        }
        const clasesActualizadas = await syncStudentPauseStateInClasses(studentId, false);
        alert(`✅ Estado de ${studentName} cambiado a ACTIVO.${activeOrFutureMaintenance.length ? ` Mantenimientos cancelados: ${activeOrFutureMaintenance.length}.` : ''}${clasesActualizadas ? ` Limpieza de marca antigua en ${clasesActualizadas} clase(s).` : ''}`);
      } else if (newStatus === 'impago') {
        const clasesActualizadas = studentInfo?.globalStatus === 'congelado' ? await syncStudentPauseStateInClasses(studentId, false) : 0;
        alert(`⚠️ Estado de ${studentName} cambiado a IMPAGO. Conserva sus clases y el BI lo sigue tratando como alumno activo; el acceso del alumno a la app queda bloqueado temporalmente.${clasesActualizadas ? ` Limpieza de marca antigua en ${clasesActualizadas} clase(s).` : ''}`);
      } else {
        alert(`Estado de ${studentName} cambiado a ${newStatus.toUpperCase()}.`);
      }
    } catch (error) {
      alert("Hubo un error al procesar el cambio: " + error.message);
    }
  };

  const handleRemoveFromSpecificClass = async (classData, studentId, studentName) => {
    if (!window.confirm(`¿Seguro que quieres borrar a ${studentName} SOLO de esta clase de ${classData.subject}?\n\nSeguirá activo en la escuela y en sus otras clases (si las tiene).`)) return;
    try {
      const updatedStudents = (classData.students || []).filter(s => s.id !== studentId);
      await updateDoc(doc(db, classData.refPath), { students: updatedStudents });
    } catch (e) {
      alert('Error al borrar alumno de la clase: ' + e.message);
    }
  };

  const executeDirectClassChange = async (student, targetClass) => {
    if (!window.confirm(`¿Inscribir a ${student.name} en la clase de ${targetClass.subject} (${getDayName(targetClass.dayOfWeek)} a las ${targetClass.time}h)?\nSe le borrará de cualquier otra clase del mismo instrumento.`)) return;
    try {
      const oldClasses = recurringClassesOnly.filter(c => c.id !== targetClass.id && c.students && c.students.some(s => s.id === student.id) && c.subject === targetClass.subject);
      const displayName = student.useAlias && student.alias ? student.alias : student.name;
      const oldGroups = groupClassesByTeacher(oldClasses);

      for (let c of oldClasses) {
        const updatedList = c.students.filter(s => s.id !== student.id);
        if (c.refPath) await updateDoc(doc(db, c.refPath), { students: updatedList });
      }

      const newStudentPayload = {
        id: student.id,
        name: displayName,
        email: student.email || '',
        classStartDate: student.classStartDate || '',
        isPaused: false,
        status: 'present',
        isRecovery: false
      };
      const updatedTargetStudents = [...(targetClass.students || []).filter(s => s.id !== student.id), newStudentPayload];
      await updateDoc(doc(db, targetClass.refPath), { students: updatedTargetStudents });

      const targetEmail = getTeacherEmail(targetClass.teacher);
      const targetOldGroup = oldGroups.find(g => g.email === targetEmail);
      const otherOldGroups = oldGroups.filter(g => g.email !== targetEmail);
      const targetIsPunctual = isPunctualClass(targetClass);

      await sendGroupedTeacherSummary({
        groupedClasses: otherOldGroups,
        subjectBuilder: (group) => `Cambio manual: ${displayName} deja tu clase`,
        bodyBuilder: (group) => `Hola ${group.teacherName},\n\nTe informamos que ${displayName} ha sido cambiado manualmente de grupo y ya no asistirá a ${group.classes.length === 1 ? 'esta clase' : 'estas clases'}:\n\n${group.classes.map(c => `· ${formatClassLine(c)}`).join('\n')}\n\nYa hemos actualizado tus listas.\n\nUn saludo,\nCoordinación Los Mitos.`
      });

      if (targetOldGroup) {
        await sendTeacherNotification({
          teacherName: targetClass.teacher,
          subject: `Cambio manual interno: ${displayName}`,
          body: `Hola ${targetClass.teacher},\n\nTe informamos que ${displayName} ha cambiado de horario dentro de tus clases.\n\nDeja de asistir a:\n${targetOldGroup.classes.map(c => `· ${formatClassLine(c)}`).join('\n')}\n\nY pasa a asistir a:\n· ${formatClassLine(targetClass)}\n\nYa hemos actualizado tus listas.\n\nUn saludo,\nCoordinación Los Mitos.`
        });
      } else if (!targetIsPunctual) {
        await sendTeacherNotification({
          teacherName: targetClass.teacher,
          subject: `Nuevo alumno fijo: ${displayName} (${targetClass.subject})`,
          body: `Hola ${targetClass.teacher},\n\nDesde coordinación hemos incorporado a ${displayName} como alumno fijo en tu clase:\n\n· ${formatClassLine(targetClass)}\n\nEl alumno ya aparece activo en tu lista de asistencia de la App.\n\nUn saludo,\nCoordinación Los Mitos.`
        });
      }

      alert(targetIsPunctual
        ? `✅ ${student.name} añadido a una clase puntual de ${targetClass.teacher}. No se han enviado correos de alumno fijo.`
        : `✅ ${student.name} transferido con éxito a la clase de ${targetClass.teacher}. Profesor avisado si correspondía. No se ha enviado email al alumno porque no es alta inicial.`);
      setChangeClassModal(null);
    } catch (error) {
      alert(`❌ Error al cambiar de clase: ${error.message}`);
    }
  };

  const grantRecoveryTicket = async (student) => {
    const num = window.prompt(`¿Cuántos tickets de recuperación quieres otorgarle a ${student.name} como cortesía?\n\n(Disponibles desde hoy por ser regalo de administración)`, "1");
    if (!num || isNaN(num) || parseInt(num) <= 0) return;
    try {
      const { validFrom, validUntil } = generateImmediateGiftTicketDates();
      const mainClass = recurringClassesOnly.find(c => c.students && c.students.some(s => s.id === student.id));
      const targetUid = mainClass ? mainClass.refPath.split('/')[3] : 'admin_pool';
      const promises = [];
      const displayName = student.useAlias && student.alias ? student.alias : student.name;
      for (let i = 0; i < parseInt(num); i++) {
        const ticketId = `gift-${Date.now()}-${i}`;
        promises.push(
          setDoc(doc(db, 'artifacts', appId, 'users', targetUid, 'tickets', ticketId), {
            studentId: student.id,
            studentName: displayName,
            subject: 'Cortesía Escuela',
            originalDate: new Date().toISOString().split('T')[0],
            validFrom,
            validUntil,
            isUsed: false,
            isGift: true,
            createdAt: new Date().toISOString()
          })
        );
      }
      await Promise.all(promises);
      alert(`🎁 Se han otorgado ${num} tickets a ${student.name}. Ya están disponibles desde hoy.`);
    } catch(e) {
      alert("Error al otorgar tickets.");
    }
  };

  const cleanExpiredTickets = async () => {
    const today = new Date().toISOString().split('T')[0];
    if (!window.confirm(`🧹 LIMPIEZA DE BASE DE DATOS\n\n¿Borrar definitivamente todos los tickets cuya validez expiró antes de hoy (${formatDateSpanish(today)})?`)) return;
    try {
      setLoading(true);
      const ticketsQuery = collectionGroup(db, 'tickets');
      const snapshot = await getDocs(ticketsQuery);
      const batch = writeBatch(db);
      let count = 0;
      snapshot.forEach((ticketDoc) => {
        const t = ticketDoc.data();
        if (t.validUntil < today) {
          batch.delete(ticketDoc.ref);
          count++;
        }
      });
      if (count === 0) alert("✨ Todo reluciente. No hay tickets caducados que limpiar.");
      else {
        await batch.commit();
        alert(`🗑️ ¡Limpieza completada! Se han borrado ${count} tickets caducados.`);
      }
    } catch (e) {
      alert("Hubo un error en la limpieza masiva.");
    } finally { setLoading(false); }
  };

  const postAnnouncement = async () => {
    if (!newAnnounce.title || !newAnnounce.content) return alert('Rellena titular y detalles del aviso');
    const cleanUrl = normalizeAnnouncementUrl(newAnnounce.url);
    if (cleanUrl === null) return alert('La URL debe empezar por https:// o http://');

    const audienceOptions = {
      targetType: announceEmailOptions.targetType || 'all',
      targetValue: announceEmailOptions.targetValue || ''
    };
    if (!['all', 'teachers'].includes(audienceOptions.targetType) && !String(audienceOptions.targetValue || '').trim()) {
      return alert('Selecciona el segmento de destinatarios del aviso.');
    }
    const audienceLabel = getAnnouncementTargetLabel(audienceOptions);

    const payload = {
      title: newAnnounce.title.trim(),
      content: newAnnounce.content.trim(),
      url: cleanUrl || '',
      audienceType: audienceOptions.targetType,
      audienceValue: audienceOptions.targetType === 'teachers' ? '' : (audienceOptions.targetValue || ''),
      audienceLabel
    };

    let targetAnnouncementId = editingAnnouncementId;

    if (editingAnnouncementId) {
      await updateDoc(doc(db, 'artifacts', appId, 'announcements', editingAnnouncementId), {
        ...payload,
        updatedAt: new Date().toISOString()
      });
    } else {
      targetAnnouncementId = Date.now().toString();
      await setDoc(doc(db, 'artifacts', appId, 'announcements', targetAnnouncementId), {
        ...payload,
        date: new Date().toISOString().split('T')[0]
      });
    }

    const emailRequest = announceEmailOptions.enabled
      ? await sendAnnouncementEmailToTargets({
          announcement: payload,
          emailOptions: { ...audienceOptions, enabled: true }
        })
      : { requested: false, count: 0, targetLabel: '' };

    if (emailRequest.requested && targetAnnouncementId) {
      await updateDoc(doc(db, 'artifacts', appId, 'announcements', targetAnnouncementId), {
        emailNotificationSentAt: new Date().toISOString(),
        emailNotificationRecipientCount: emailRequest.count,
        emailNotificationTargetType: audienceOptions.targetType,
        emailNotificationTargetValue: audienceOptions.targetValue || '',
        emailNotificationTargetLabel: emailRequest.targetLabel || audienceLabel
      });
    }

    if (editingAnnouncementId) {
      setEditingAnnouncementId(null);
      alert(emailRequest.requested
        ? `Aviso actualizado y email solicitado a ${emailRequest.count} destinatarios.`
        : 'Aviso actualizado.');
    } else {
      alert(emailRequest.requested
        ? `Aviso publicado y email solicitado a ${emailRequest.count} destinatarios.`
        : 'Aviso publicado.');
    }

    setNewAnnounce({ title: '', content: '', url: '' });
    setAnnounceEmailOptions({ enabled: false, targetType: 'all', targetValue: '' });
  };

  const startEditAnnouncement = (ann) => {
    setEditingAnnouncementId(ann.id);
    setNewAnnounce({
      title: ann.title || '',
      content: ann.content || '',
      url: normalizeAnnouncementUrl(ann.url) || ''
    });
    setAnnounceEmailOptions({
      enabled: false,
      targetType: ann.audienceType || ann.emailNotificationTargetType || 'all',
      targetValue: ann.audienceValue || ann.emailNotificationTargetValue || ''
    });
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  };

  const cancelEditAnnouncement = () => {
    setEditingAnnouncementId(null);
    setNewAnnounce({ title: '', content: '', url: '' });
    setAnnounceEmailOptions({ enabled: false, targetType: 'all', targetValue: '' });
  };


  const deletePayrollAdjustment = async (adjustment) => {
    if (!window.confirm(`¿Borrar este ajuste de ${adjustment.hours > 0 ? '+' : ''}${adjustment.hours}h para ${adjustment.teacher}?`)) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'payrollAdjustments', adjustment.id));
      alert('Ajuste eliminado.');
    } catch (e) {
      alert('Error al eliminar el ajuste: ' + e.message);
    }
  };

  const deleteAnnouncement = async (id) => { 
    if(window.confirm('¿Borrar aviso?')) await deleteDoc(doc(db, 'artifacts', appId, 'announcements', id)); 
  };

  const handleDownloadBIReport = () => {
    const generatedAt = new Date();
    const dateLabel = generatedAt.toLocaleString('es-ES');
    const money = value => `${Number(value || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

    const lines = [
      'INFORME BI · ESCUELA LOS MITOS',
      `Generado: ${dateLabel}`,
      '',
      'RESUMEN GLOBAL',
      `Ingresos por clases activas: ${money(businessIntelligence.totalIngresosClases)} (${businessIntelligence.totalAlumnosActivos || 0} alumno/s que ya generan cuota)`,
      `Ingresos por mantenimiento: ${money(businessIntelligence.ingresosMantenimiento)} (${businessIntelligence.alumnosMantenimiento} alumno/s × ${MAINTENANCE_MONTHLY_FEE} €)`,
      `Inicios futuros sin ingreso todavía: ${businessIntelligence.totalAlumnosInicioFuturo || 0} alumno/s`,
      `Plazas fijas comprometidas: ${businessIntelligence.totalPlazasComprometidas || 0}`,
      `Impagos incluidos como plaza activa/riesgo: ${businessIntelligence.totalImpagos || 0}`,
      `Ingresos totales estimados: ${money(businessIntelligence.totalIngresos)}`,
      `Coste profesores previsto: ${money(businessIntelligence.costeTotalProfesores)} (solo clases operativas)`,
      `Clases operativas: ${businessIntelligence.totalClasesOperativas || 0} · Hibernadas/no computables: ${businessIntelligence.totalClasesHibernadas || 0}`,
      `Horas semanales computables: ${(businessIntelligence.totalHorasSemanalesOperativas || 0).toFixed(1)} · Hibernadas no computadas: ${(businessIntelligence.totalHorasSemanalesHibernadas || 0).toFixed(1)}`,
      `Gastos fijos: ${money(businessIntelligence.totalFijos)}`,
      `Resultado estimado: ${money(businessIntelligence.beneficioNeto)}`,
      `Criterio de previsión docente: ${BI_WEEKS_PER_MONTH} semanas/mes`,
      '',
      'POR SEDE',
      ...SEDES.flatMap(sede => {
        const data = businessIntelligence.porSede[sede] || { ingresos: 0, ingresosClases: 0, mantenimiento: 0, costesProf: 0, alumnosMantenimiento: 0, alumnosActivos: 0, alumnosInicioFuturo: 0, plazasComprometidas: 0, impagos: 0 };
        const gastoFijo = Number(settings.gastosFijos?.[sede.toLowerCase()]) || 0;
        return [
          `${sede}:`,
          `  Ingresos clases: ${money(data.ingresosClases)} (${data.alumnosActivos || 0} alumno/s activos)`,
          `  Mantenimiento: ${money(data.mantenimiento)} (${data.alumnosMantenimiento || 0} alumno/s)`,
          `  Inicio futuro sin ingreso: ${data.alumnosInicioFuturo || 0} alumno/s`,
          `  Plazas fijas comprometidas: ${data.plazasComprometidas || 0}`,
          `  Clases operativas / hibernadas: ${data.clasesOperativas || 0} / ${data.clasesHibernadas || 0}`,
          `  Horas semanales computables: ${(data.horasSemanalesOperativas || 0).toFixed(1)} h`,
          `  Coste profesores: ${money(data.costesProf)}`,
          `  Gasto fijo local: ${money(gastoFijo)}`,
          `  Margen local estimado: ${money(data.ingresos - data.costesProf - gastoFijo)}`
        ];
      }),
      '',
      'POR PROFESOR',
      ...businessIntelligence.porProfe.map(p => `${p.name}: ingresos ${money(p.ingresos)} · coste ${money(p.costes)} · margen ${money(p.beneficio)} · ${(p.horasSemanales || 0).toFixed(1)} h/sem computables · ${p.clasesOperativas || 0} clase(s) operativas · ${p.clasesHibernadas || 0} hibernada(s)`),
      '',
      'POR INSTRUMENTO',
      ...businessIntelligence.porInstrumento.map(i => `${i.name}: ingresos ${money(i.ingresos)} · coste ${money(i.costes)} · margen ${money(i.beneficio)} · ${i.numGrupos || 0} grupo/s operativos · ${i.numGruposHibernados || 0} hibernado/s`),
      '',
      'DETALLE POR CLASE',
      ...businessIntelligence.clasesRentabilidad.map(c => `${c.subject} · ${c.teacher} · ${c.sede} · ${getDayName(c.dayOfWeek)} ${c.time} · ${c.estadoOperativo || (c.isHibernated ? 'HIBERNADA' : 'OPERATIVA')} · activos con ingreso ${c.numAlumnos} · mantenimiento ${c.numCongelados} · inicio futuro ${c.numInicioFuturo || 0} · recolocados ${c.numRecolocados || 0} · plazas comprometidas ${c.numPlazasComprometidas || 0} · horas computables ${(c.horasComputables || 0).toFixed(1)} · ingresos ${money(c.ingresos)} · coste ${money(c.coste)} · margen ${money(c.beneficio)}`),
      '',
      'Nota: este informe es una previsión operativa, no sustituye la contabilidad real de Tadosi.'
    ];

    const filename = `Informe_BI_Los_Mitos_${getTodayLocalString()}.txt`;
    downloadTextFile(filename, lines.join('\n'), 'text/plain;charset=utf-8');
  };

  const handleDownloadSchoolSnapshot = () => {
    const snapshotDate = todayStr;
    const sortedClasses = [...recurringClassesOnly].sort((a, b) => {
      const sedeCompare = String(a.sede || '').localeCompare(String(b.sede || ''), 'es');
      if (sedeCompare !== 0) return sedeCompare;
      const teacherCompare = String(a.teacher || '').localeCompare(String(b.teacher || ''), 'es');
      if (teacherCompare !== 0) return teacherCompare;
      const dayCompare = Number(a.dayOfWeek || 0) - Number(b.dayOfWeek || 0);
      if (dayCompare !== 0) return dayCompare;
      return String(a.time || '').localeCompare(String(b.time || ''));
    });

    const getSnapshotStatus = ({ activeCount, maintenanceCount, futureStartCount, relocatedCount }) => {
      if (activeCount > 0) return 'OPERATIVA';
      if (maintenanceCount > 0 && futureStartCount > 0) return 'HIBERNADA · reservas / mantenimiento';
      if (maintenanceCount > 0) return 'HIBERNADA · solo mantenimiento';
      if (futureStartCount > 0) return 'HIBERNADA · inicio futuro';
      if (relocatedCount > 0) return 'OPERATIVA · recolocación temporal';
      return 'HIBERNADA · sin alumnos activos';
    };

    const lines = [
      'FOTO ACTUAL ESCUELA LOS MITOS',
      `Generada: ${new Date().toLocaleString('es-ES')}`,
      `Fecha operativa aplicada: ${formatDateSpanish(snapshotDate)}`,
      '',
      'Criterio: foto operativa real. Usa la misma lógica de la Vista Arquitecto en modo Real.',
      'Excluye recuperaciones y alumnos no fijos; aplica fechas de inicio/fin, mantenimiento y recolocaciones temporales.',
      'No es un informe comercial de plazas web.',
      '==============================================================='
    ];

    sortedClasses.forEach(clase => {
      const planningStudents = getClassStudentPlanningData(clase, false, snapshotDate)
        .filter(student => student.status !== 'baja' && !student.isPastEnd)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));

      const activeStudents = planningStudents.filter(student => student.isActive);
      const maintenanceStudents = planningStudents.filter(student => student.isMaintenance);
      const futureStartStudents = planningStudents.filter(student => student.isFutureStart);
      const relocatedStudents = planningStudents.filter(student => student.isRelocated);
      const activeCount = activeStudents.length;
      const maintenanceCount = maintenanceStudents.length;
      const futureStartCount = futureStartStudents.length;
      const relocatedCount = relocatedStudents.length;
      const cap = parseInt(clase.capacity, 10) || 0;
      const statusLabel = getSnapshotStatus({ activeCount, maintenanceCount, futureStartCount, relocatedCount });

      const endTime = getClassEndTime(clase.time, clase.duration);
      const turno = `${clase.sede || 'Tarragona'} · ${getDayName(clase.dayOfWeek)} ${clase.time || ''}${endTime ? `-${endTime}` : ''} · ${clase.sala || 'Sala no indicada'}`;

      lines.push(
        '',
        turno,
        `${clase.subject || 'Clase'} · Profesor/a: ${clase.teacher || 'Sin asignar'}`,
        `Estado operativo: ${statusLabel}`,
        `Cupo operativo: ${planningStudents.length}/${cap || 'sin aforo'} · Activos: ${activeCount} · Mantenimiento: ${maintenanceCount} · Inicio futuro: ${futureStartCount} · Recolocados aquí: ${relocatedCount}`,
        'Alumnos:'
      );

      if (planningStudents.length === 0) {
        lines.push('- Sin alumnos operativos ni plazas comprometidas para la fecha actual');
      } else {
        planningStudents.forEach(student => {
          const labels = [];
          if (student.status === 'impago') labels.push('incidencia administrativa');
          if (student.isActive) labels.push('activo');
          if (student.isMaintenance) labels.push('mantenimiento / plaza reservada');
          if (student.isFutureStart) labels.push(formatStudentClassStartLabel(student.startDate));
          if (student.endDate) labels.push(formatStudentClassEndLabel(student.endDate));
          if (student.isRelocated) labels.push(student.relocationLabel || 'recolocado temporalmente aquí');

          lines.push(`- ${student.displayName} — ${student.email}${labels.length ? ` · ${labels.join(' · ')}` : ''}`);
        });
      }
    });

    const filename = `Foto_Actual_Escuela_Los_Mitos_${getTodayLocalString()}.txt`;
    downloadTextFile(filename, lines.join('\n'), 'text/plain;charset=utf-8');
  };


  const handleDownloadProjectedSchoolSnapshot = () => {
    const actionableTypes = new Set(['baja', 'mantenimiento', 'reactivar_plaza', 'cambio_horario', 'ampliar_clases']);
    const projectedClasses = recurringClassesOnly.map(clase => ({
      ...clase,
      students: (clase.students || []).map(studentEntry => ({ ...studentEntry }))
    }));
    const classById = new Map(projectedClasses.map(clase => [clase.id, clase]));
    const studentById = new Map(students.map(student => [student.id, { ...student } ]));
    const studentMovements = new Map();
    const classMovementNotes = new Map();
    const movementsSummary = [];

    const addStudentMovement = (studentId, label) => {
      if (!studentId || !label) return;
      if (!studentMovements.has(studentId)) studentMovements.set(studentId, []);
      if (!studentMovements.get(studentId).includes(label)) {
        studentMovements.get(studentId).push(label);
      }
    };

    const addClassMovementNote = (classId, name, email, label) => {
      if (!classId || !label) return;
      if (!classMovementNotes.has(classId)) classMovementNotes.set(classId, []);
      classMovementNotes.get(classId).push({
        name: name || 'Alumno',
        email: email || 'sin email',
        label
      });
    };

    const getProjectedStudent = (gestion) => {
      if (!gestion?.studentId) return null;
      let studentInfo = studentById.get(gestion.studentId);
      if (!studentInfo) {
        studentInfo = {
          id: gestion.studentId,
          name: gestion.studentName || 'Alumno',
          email: gestion.studentEmail || '',
          globalStatus: 'activo'
        };
        studentById.set(gestion.studentId, studentInfo);
      }
      return studentInfo;
    };

    const getProjectedDisplayName = (studentInfo, fallbackName = '') => {
      if (studentInfo?.useAlias && studentInfo?.alias) return studentInfo.alias;
      return fallbackName || studentInfo?.alias || studentInfo?.name || 'Alumno';
    };

    const getProjectedEmail = (studentInfo, fallback = '') => studentInfo?.email || fallback || '';

    const describeProjectedClass = (clase) => {
      if (!clase) return '';
      return `${clase.subject || 'Clase'} · ${getDayName(clase.dayOfWeek)} · ${clase.time || ''}h · ${clase.sede || 'Tarragona'}${clase.sala ? ` · ${clase.sala}` : ''} · ${clase.teacher || 'Sin profesor'}`;
    };

    const getStudentLineData = (studentEntry = {}, fallbackStudent = null) => {
      const studentInfo = fallbackStudent || studentById.get(studentEntry.id) || {};
      const displayName = studentEntry.name || studentEntry.studentName || getProjectedDisplayName(studentInfo);
      const email = studentInfo.email || studentEntry.email || studentEntry.studentEmail || 'sin email';
      return { displayName, email, studentInfo };
    };

    const removeStudentFromClass = (clase, studentId, noteLabel = '') => {
      if (!clase || !studentId) return false;
      const existingEntry = (clase.students || []).find(studentEntry => studentEntry.id === studentId);
      if (!existingEntry) return false;
      const { displayName, email } = getStudentLineData(existingEntry);
      if (noteLabel) addClassMovementNote(clase.id, displayName, email, noteLabel);
      clase.students = (clase.students || []).filter(studentEntry => studentEntry.id !== studentId);
      return true;
    };

    const addOrUpdateStudentInClass = (clase, studentInfo, gestion, isPaused = false, movementLabel = '') => {
      if (!clase || !studentInfo?.id) return;
      const displayName = getProjectedDisplayName(studentInfo, gestion.studentName);
      const email = getProjectedEmail(studentInfo, gestion.studentEmail || gestion.email || '');
      const payload = {
        id: studentInfo.id,
        name: displayName,
        email,
        classStartDate: studentInfo?.classStartDate || '',
        isPaused,
        status: 'present',
        isRecovery: false
      };

      const exists = (clase.students || []).some(studentEntry => studentEntry.id === studentInfo.id);
      if (exists) {
        clase.students = (clase.students || []).map(studentEntry =>
          studentEntry.id === studentInfo.id
            ? { ...studentEntry, ...payload, isPaused: Boolean(isPaused || studentEntry.isPaused) }
            : studentEntry
        );
      } else {
        clase.students = [...(clase.students || []), payload];
      }
      addStudentMovement(studentInfo.id, movementLabel);
    };

    const pendingProjectionGestiones = [...pendingGestiones]
      .filter(gestion => actionableTypes.has(gestion.type))
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

    pendingProjectionGestiones.forEach(gestion => {
      const studentInfo = getProjectedStudent(gestion);
      const studentName = getProjectedDisplayName(studentInfo, gestion.studentName || 'Alumno');
      const studentEmail = getProjectedEmail(studentInfo, gestion.studentEmail || gestion.email || '');
      const details = gestion.details || gestion.title || '';

      if (!studentInfo?.id) {
        movementsSummary.push(`- ${studentName} · ${gestion.type}: no aplicada porque la gestión no tiene alumno asociado.`);
        return;
      }

      if (gestion.type === 'baja') {
        const sourceClass = classById.get(gestion.sourceClassId);
        const hasScopedBaja = Boolean(gestion.sourceClassId || gestion.sourceClassLine);
        const isTotalBaja = isTotalBajaGestion(gestion);

        if (isTotalBaja) {
          studentInfo.globalStatus = 'baja';
          let removedFrom = 0;
          projectedClasses.forEach(clase => {
            if (removeStudentFromClass(clase, studentInfo.id, 'BAJA TOTAL PENDIENTE · sale de esta clase al cierre')) removedFrom += 1;
          });
          addStudentMovement(studentInfo.id, 'BAJA TOTAL PENDIENTE · todas las clases');
          movementsSummary.push(`- ${studentName} — ${studentEmail || 'sin email'} · BAJA total pendiente · sale de ${removedFrom} clase(s)${gestion.sourceClassLine ? ` · plaza de referencia: ${gestion.sourceClassLine}` : ''}${details ? ` · ${details}` : ''}`);
          return;
        }

        if (hasScopedBaja && !sourceClass) {
          movementsSummary.push(`- ${studentName} — ${studentEmail || 'sin email'} · BAJA no proyectada: no se encontró la plaza origen (${gestion.sourceClassLine || gestion.sourceClassId || 'sin datos'}).`);
          return;
        }

        if (hasScopedBaja && sourceClass) {
          const removed = removeStudentFromClass(sourceClass, studentInfo.id, 'BAJA PARCIAL PENDIENTE · sale de esta plaza al cierre');
          const remainingFixed = projectedClasses.filter(clase =>
            clase.id !== sourceClass.id &&
            !isPunctualClass(clase) &&
            (clase.students || []).some(studentEntry => studentEntry.id === studentInfo.id && isFixedClassStudent(studentEntry))
          );

          if (remainingFixed.length === 0) {
            studentInfo.globalStatus = 'baja';
            addStudentMovement(studentInfo.id, 'BAJA TOTAL PENDIENTE · última plaza fija');
            movementsSummary.push(`- ${studentName} — ${studentEmail || 'sin email'} · BAJA total pendiente · última plaza fija: ${describeProjectedClass(sourceClass)}${details ? ` · ${details}` : ''}`);
          } else {
            addStudentMovement(studentInfo.id, 'BAJA PARCIAL PENDIENTE');
            movementsSummary.push(`- ${studentName} — ${studentEmail || 'sin email'} · BAJA parcial pendiente · sale de ${removed ? describeProjectedClass(sourceClass) : (gestion.sourceClassLine || gestion.sourceClassId)} · mantiene ${remainingFixed.length} plaza(s) fija(s)${details ? ` · ${details}` : ''}`);
          }
          return;
        }

        studentInfo.globalStatus = 'baja';
        let removedFrom = 0;
        projectedClasses.forEach(clase => {
          if (removeStudentFromClass(clase, studentInfo.id, 'BAJA PENDIENTE · sale de esta clase al cierre')) removedFrom += 1;
        });
        addStudentMovement(studentInfo.id, 'BAJA PENDIENTE');
        movementsSummary.push(`- ${studentName} — ${studentEmail || 'sin email'} · BAJA pendiente · sale de ${removedFrom} clase(s)${details ? ` · ${details}` : ''}`);
        return;
      }

      if (gestion.type === 'mantenimiento') {
        const { from, until } = getMaintenancePeriodFromGestion(gestion);
        let affected = 0;
        projectedClasses.forEach(clase => {
          const hasStudent = (clase.students || []).some(studentEntry => studentEntry.id === studentInfo.id);
          if (!hasStudent) return;
          clase.students = (clase.students || []).map(studentEntry =>
            studentEntry.id === studentInfo.id ? { ...studentEntry, projectedMaintenance: true, projectedMaintenanceFrom: from, projectedMaintenanceUntil: until } : studentEntry
          );
          affected += 1;
        });
        addStudentMovement(studentInfo.id, `MANTENIMIENTO PENDIENTE · ${formatMaintenancePeriodLine({ from, until })}`);
        movementsSummary.push(`- ${studentName} — ${studentEmail || 'sin email'} · MANTENIMIENTO pendiente ${formatMaintenancePeriodLine({ from, until })} · conserva plaza en ${affected} clase(s)${details ? ` · ${details}` : ''}`);
        return;
      }

      if (gestion.type === 'reactivar_plaza') {
        let affected = 0;
        projectedClasses.forEach(clase => {
          const hasStudent = (clase.students || []).some(studentEntry => studentEntry.id === studentInfo.id);
          if (!hasStudent) return;
          clase.students = (clase.students || []).map(studentEntry =>
            studentEntry.id === studentInfo.id ? { ...studentEntry, projectedMaintenance: false } : studentEntry
          );
          affected += 1;
        });
        addStudentMovement(studentInfo.id, 'FIN ANTICIPADO MANTENIMIENTO PENDIENTE');
        movementsSummary.push(`- ${studentName} — ${studentEmail || 'sin email'} · FIN ANTICIPADO DE MANTENIMIENTO pendiente · vuelve activo en ${affected} clase(s)${details ? ` · ${details}` : ''}`);
        return;
      }

      if (gestion.type === 'cambio_horario' || gestion.type === 'ampliar_clases') {
        const targetClass = classById.get(gestion.requestedClass);
        if (!targetClass) {
          movementsSummary.push(`- ${studentName} — ${studentEmail || 'sin email'} · ${gestion.type}: no aplicada porque no se encontró clase destino (${gestion.requestedClass || 'sin clase destino'}).`);
          return;
        }

        if (gestion.type === 'cambio_horario') {
          let removedFrom = 0;
          const sourceClass = classById.get(gestion.sourceClassId);
          const hasScopedChange = Boolean(gestion.sourceClassId || gestion.sourceClassLine);

          if (hasScopedChange && !sourceClass) {
            movementsSummary.push(`- ${studentName} — ${studentEmail || 'sin email'} · CAMBIO no proyectado: no se encontró la plaza origen (${gestion.sourceClassLine || gestion.sourceClassId || 'sin datos'}).`);
            return;
          }

          if (hasScopedChange && sourceClass) {
            if (sourceClass.id !== targetClass.id && removeStudentFromClass(sourceClass, studentInfo.id, `CAMBIO PENDIENTE · sale de esta plaza y pasa a ${describeProjectedClass(targetClass)}`)) removedFrom += 1;
          } else {
            projectedClasses.forEach(clase => {
              if (clase.id === targetClass.id) return;
              if (clase.subject !== targetClass.subject) return;
              if (removeStudentFromClass(clase, studentInfo.id, `CAMBIO PENDIENTE · sale de esta clase y pasa a ${describeProjectedClass(targetClass)}`)) removedFrom += 1;
            });
          }

          addOrUpdateStudentInClass(targetClass, studentInfo, gestion, false, 'CAMBIO PENDIENTE · entra en esta clase');
          movementsSummary.push(`- ${studentName} — ${studentEmail || 'sin email'} · CAMBIO pendiente · sale de ${hasScopedChange ? (sourceClass ? describeProjectedClass(sourceClass) : (gestion.sourceClassLine || gestion.sourceClassId || 'plaza origen no encontrada')) : `${removedFrom} clase(s)`} y entra en ${describeProjectedClass(targetClass)}${details ? ` · ${details}` : ''}`);
        } else {
          addOrUpdateStudentInClass(targetClass, studentInfo, gestion, false, 'AMPLIACIÓN PENDIENTE · entra en esta clase');
          movementsSummary.push(`- ${studentName} — ${studentEmail || 'sin email'} · AMPLIACIÓN pendiente · entra en ${describeProjectedClass(targetClass)}${details ? ` · ${details}` : ''}`);
        }
      }
    });

    const getProjectionThresholds = (capacity) => {
      const cap = parseInt(capacity, 10) || 0;
      if (cap <= 1) return null;
      if (cap >= 8) return { critical: 3, review: 5 };
      if (cap === 5) return { critical: 1, review: 2 };
      if (cap === 4) return { critical: 1, review: 2 };
      return { critical: 1, review: Math.ceil(cap / 2) };
    };

    const getProjectedClassStudentRows = (clase) => {
      return (clase.students || [])
        .filter(studentEntry => {
          const studentInfo = studentById.get(studentEntry.id) || {};
          return isFixedClassStudent(studentEntry) && !hasStudentClassEndedBeforeDate(studentEntry, studentInfo, nextMonthEndStr);
        })
        .map(studentEntry => {
          const { displayName, email, studentInfo } = getStudentLineData(studentEntry);
          const crmStatus = studentInfo?.globalStatus || 'activo';
          const startDate = getStudentClassStartDate(studentEntry, studentInfo);
          const isFutureStart = Boolean(startDate && startDate > todayStr);
          const isMaintenance = crmStatus !== 'baja' && (studentEntry.projectedMaintenance === true || isStudentInMaintenanceRange(studentEntry.id, nextMonthStartStr, nextMonthEndStr));
          const isActive = crmStatus !== 'baja' && !isMaintenance && !isFutureStart;
          return {
            id: studentEntry.id,
            displayName,
            email,
            crmStatus,
            startDate,
            isFutureStart,
            isMaintenance,
            isActive,
            movementLabel: (studentMovements.get(studentEntry.id) || []).join(' | ')
          };
        })
        .filter(student => student.crmStatus !== 'baja')
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
    };

    const buildProjectedClassAnalysis = (clase) => {
      const cap = parseInt(clase.capacity, 10) || 0;
      const thresholds = getProjectionThresholds(cap);
      const studentRows = getProjectedClassStudentRows(clase);
      const activeStudents = studentRows.filter(student => student.isActive);
      const maintenanceStudents = studentRows.filter(student => student.isMaintenance);
      const futureStartStudents = studentRows.filter(student => student.isFutureStart);
      const activeCount = activeStudents.length;
      const maintenanceCount = maintenanceStudents.length;
      const futureStartCount = futureStartStudents.length;
      const occupiedCount = studentRows.length;
      const freeSpots = cap ? cap - occupiedCount : null;
      const freeSpotsLabel = freeSpots === null ? 'sin aforo' : Math.max(freeSpots, 0);

      let statusKey = 'operativa';
      let statusLabel = 'OPERATIVA';
      let statusHelp = 'Ocupación suficiente.';
      let priority = 99;

      if (cap && occupiedCount > cap) {
        statusKey = 'sobreaforo';
        statusLabel = `SOBREAFORO PROYECTADO (+${occupiedCount - cap})`;
        statusHelp = 'La clase supera su aforo proyectado.';
        priority = -1;
      } else if (!thresholds) {
        statusKey = 'particular';
        statusLabel = 'PARTICULAR / AFORO 1';
        statusHelp = 'Clase de aforo 1: no entra en la lógica de grupos en peligro.';
      } else if (activeCount === 0 && maintenanceCount === 0 && futureStartCount === 0) {
        statusKey = 'vacia';
        statusLabel = 'VACÍA / HIBERNADA';
        statusHelp = 'Sin alumnos activos, sin mantenimiento y sin inicios futuros.';
        priority = 0;
      } else if (activeCount === 0 && maintenanceCount > 0) {
        statusKey = 'solo_mantenimiento';
        statusLabel = 'SOLO MANTENIMIENTO';
        statusHelp = 'No hay alumnos activos; solo plazas en mantenimiento/reserva.';
        priority = 1;
      } else if (thresholds && activeCount <= thresholds.critical) {
        statusKey = 'critico';
        statusLabel = 'CRÍTICA';
        statusHelp = `Criterio aplicado: aforo ${cap}, crítica con ${thresholds.critical} alumno(s) activo(s) o menos.`;
        priority = 2;
      } else if (thresholds && activeCount <= thresholds.review) {
        statusKey = 'revisar';
        statusLabel = 'REVISAR';
        statusHelp = `Criterio aplicado: aforo ${cap}, revisar con ${thresholds.review} alumno(s) activo(s) o menos.`;
        priority = 3;
      } else if (cap && freeSpots > 0) {
        statusKey = 'plazas_libres';
        statusLabel = 'CON PLAZAS LIBRES';
        statusHelp = 'Operativa, con plazas disponibles.';
      } else if (cap && freeSpots === 0) {
        statusKey = 'completa';
        statusLabel = 'COMPLETA';
        statusHelp = 'Aforo completo.';
      }

      const endTime = getClassEndTime(clase.time, clase.duration);
      const turno = `${clase.sede || 'Tarragona'} · ${getDayName(clase.dayOfWeek)} ${clase.time || ''}${endTime ? `-${endTime}` : ''} · ${clase.sala || 'Sala no indicada'}`;
      const summaryLine = `${turno} · ${clase.subject || 'Clase'} · ${clase.teacher || 'Sin profesor'} · ${statusLabel} · activos ${activeCount} · mantenimiento ${maintenanceCount} · inicio futuro ${futureStartCount} · ocupación ${occupiedCount}/${cap || 'sin aforo'} · libres ${freeSpotsLabel}`;

      return {
        id: clase.id,
        classData: clase,
        sede: clase.sede || 'Tarragona',
        teacher: clase.teacher || 'Sin profesor',
        subject: clase.subject || 'Clase',
        dayOfWeek: Number(clase.dayOfWeek || 0),
        time: clase.time || '',
        cap,
        thresholds,
        studentRows,
        activeStudents,
        maintenanceStudents,
        futureStartStudents,
        activeCount,
        maintenanceCount,
        futureStartCount,
        occupiedCount,
        freeSpots,
        freeSpotsLabel,
        turno,
        summaryLine,
        statusKey,
        statusLabel,
        statusHelp,
        priority
      };
    };

    const sortClassAnalyses = (rows = []) => [...rows].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      const sedeCompare = String(a.sede || '').localeCompare(String(b.sede || ''), 'es');
      if (sedeCompare !== 0) return sedeCompare;
      const teacherCompare = String(a.teacher || '').localeCompare(String(b.teacher || ''), 'es');
      if (teacherCompare !== 0) return teacherCompare;
      const dayCompare = Number(a.dayOfWeek || 0) - Number(b.dayOfWeek || 0);
      if (dayCompare !== 0) return dayCompare;
      return String(a.time || '').localeCompare(String(b.time || ''));
    });

    const sortedClasses = [...projectedClasses].sort((a, b) => {
      const sedeCompare = String(a.sede || '').localeCompare(String(b.sede || ''), 'es');
      if (sedeCompare !== 0) return sedeCompare;
      const teacherCompare = String(a.teacher || '').localeCompare(String(b.teacher || ''), 'es');
      if (teacherCompare !== 0) return teacherCompare;
      const dayCompare = Number(a.dayOfWeek || 0) - Number(b.dayOfWeek || 0);
      if (dayCompare !== 0) return dayCompare;
      return String(a.time || '').localeCompare(String(b.time || ''));
    });

    const analysisRows = sortedClasses.map(buildProjectedClassAnalysis);
    const criticalRows = sortClassAnalyses(analysisRows.filter(row => row.statusKey === 'critico'));
    const reviewRows = sortClassAnalyses(analysisRows.filter(row => row.statusKey === 'revisar'));
    const emptyRows = sortClassAnalyses(analysisRows.filter(row => row.statusKey === 'vacia'));
    const onlyMaintenanceRows = sortClassAnalyses(analysisRows.filter(row => row.statusKey === 'solo_mantenimiento'));
    const freeSpotsRows = sortClassAnalyses(analysisRows.filter(row => row.freeSpots !== null && row.freeSpots > 0));

    const contactRows = criticalRows
      .flatMap(row => row.activeStudents.map(student => ({ row, student })))
      .sort((a, b) => {
        const nameCompare = a.student.displayName.localeCompare(b.student.displayName, 'es');
        if (nameCompare !== 0) return nameCompare;
        return a.row.summaryLine.localeCompare(b.row.summaryLine, 'es');
      });

    const lines = [
      'PROYECCIÓN ESCUELA LOS MITOS',
      `Generada: ${new Date().toLocaleString('es-ES')}`,
      '',
      'Simulación: foto actual + gestiones pendientes de bandeja.',
      'No ejecuta trámites, no modifica Firebase y no envía correos.',
      '',
      'CRITERIOS DE RIESGO APLICADOS',
      '- Aforo 8 o más: CRÍTICA con 3 alumnos activos o menos; REVISAR con 5 alumnos activos o menos.',
      '- Aforo 5: CRÍTICA con 1 alumno activo; REVISAR con 2 alumnos activos.',
      '- Aforo 4: CRÍTICA con 1 alumno activo; REVISAR con 2 alumnos activos.',
      '- Aforos no previstos: CRÍTICA con 1 alumno activo; REVISAR con media ocupación aproximada.',
      '- Las clases 1/1 no se consideran grupos en peligro.',
      '- Los alumnos con fecha futura de inicio no cuentan como activos hasta su primer día de clase.',
      '==============================================================='
    ];

    analysisRows.forEach(row => {
      const clase = row.classData;
      const classLine = `${clase.subject || 'Clase'} · Profesor/a: ${clase.teacher || 'Sin asignar'}`;

      lines.push(
        '',
        row.turno,
        classLine,
        `Cupo proyectado: ${row.occupiedCount}/${row.cap || 'sin aforo'} · Activos: ${row.activeCount} · Mantenimiento: ${row.maintenanceCount} · Inicio futuro: ${row.futureStartCount} · Libres: ${row.freeSpotsLabel}`,
        `Estado proyectado: ${row.statusLabel}`,
        `Criterio: ${row.statusHelp}`,
        'Alumnos:'
      );

      if (row.studentRows.length === 0) {
        lines.push('- Sin alumnos proyectados');
      } else {
        row.studentRows.forEach(student => {
          const futureStartLabel = student.isFutureStart ? ` · ${formatStudentClassStartLabel(student.startDate)}` : '';
          const statusLabel = student.crmStatus === 'impago'
            ? ` · incidencia administrativa${futureStartLabel}`
            : `${student.isMaintenance ? ' · mantenimiento / plaza reservada' : ''}${futureStartLabel}`;
          const movementSuffix = student.movementLabel ? ` · ${student.movementLabel}` : '';
          lines.push(`- ${student.displayName} — ${student.email}${statusLabel}${movementSuffix}`);
        });
      }

      const notes = (classMovementNotes.get(clase.id) || []).sort((a, b) => a.name.localeCompare(b.name, 'es'));
      if (notes.length > 0) {
        lines.push('Movimientos pendientes en esta clase:');
        notes.forEach(note => {
          lines.push(`- ${note.name} — ${note.email} · ${note.label}`);
        });
      }
    });

    lines.push('', '===============================================================', 'RESUMEN OPERATIVO');

    const pushSummaryBlock = (title, rows, emptyText, formatter = row => row.summaryLine) => {
      lines.push('', title);
      if (rows.length === 0) {
        lines.push(`- ${emptyText}`);
      } else {
        rows.forEach(row => lines.push(`- ${formatter(row)}`));
      }
    };

    pushSummaryBlock('CLASES CRÍTICAS', criticalRows, 'Ninguna clase queda en estado crítico.');
    pushSummaryBlock('CLASES EN REVISIÓN', reviewRows, 'Ninguna clase queda en revisión.');
    pushSummaryBlock('CLASES VACÍAS / HIBERNADAS PROYECTADAS', emptyRows, 'Ninguna clase queda vacía.');
    pushSummaryBlock('CLASES SOLO CON MANTENIMIENTO', onlyMaintenanceRows, 'Ninguna clase queda solo en mantenimiento.');

    lines.push('', 'A CONTACTAR');
    if (contactRows.length === 0) {
      lines.push('- No hay alumnos activos en clases críticas.');
    } else {
      contactRows.forEach(({ row, student }) => {
        lines.push(`- ${student.displayName} — ${student.email} · ${row.subject} · ${getDayName(row.dayOfWeek)} ${row.time}h · ${row.sede} · ${row.teacher} · activos ${row.activeCount}/${row.cap}`);
      });
    }

    const pushGroupedRows = (title, rows, getKey, keySorter = null) => {
      lines.push('', title);
      if (rows.length === 0) {
        lines.push('- Sin clases en este bloque.');
        return;
      }
      const grouped = rows.reduce((acc, row) => {
        const key = getKey(row);
        if (!acc[key]) acc[key] = [];
        acc[key].push(row);
        return acc;
      }, {});
      const keys = Object.keys(grouped).sort(keySorter || ((a, b) => a.localeCompare(b, 'es')));
      keys.forEach(key => {
        lines.push(`${key}:`);
        sortClassAnalyses(grouped[key]).forEach(row => lines.push(`  - ${row.summaryLine}`));
      });
    };

    const planningRows = [...criticalRows, ...reviewRows, ...emptyRows, ...onlyMaintenanceRows];
    const dayOrder = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

    pushGroupedRows('POR PROFESOR', planningRows, row => row.teacher || 'Sin profesor');
    pushGroupedRows('POR SEDE', planningRows, row => row.sede || 'Tarragona', (a, b) => SEDES.indexOf(a) - SEDES.indexOf(b));
    pushGroupedRows('POR DÍA DE LA SEMANA', planningRows, row => getDayName(row.dayOfWeek), (a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
    pushSummaryBlock('PLAZAS LIBRES PROYECTADAS', freeSpotsRows, 'No hay plazas libres proyectadas.', row => `${row.turno} · ${row.subject} · ${row.teacher} · ${row.freeSpots} plaza(s) libre(s) · estado: ${row.statusLabel}`);

    lines.push('', 'GESTIONES PENDIENTES APLICADAS EN ESTA SIMULACIÓN');
    if (movementsSummary.length === 0) {
      lines.push('- No hay bajas, mantenimientos temporales, fines anticipados, cambios o ampliaciones pendientes que afecten a clases fijas.');
    } else {
      movementsSummary.forEach(item => lines.push(item));
    }

    lines.push('', 'Nota: la proyección no sustituye el cierre real de Tadosi ni la ejecución manual de los checks verdes en la bandeja.');

    const filename = `Proyeccion_Escuela_Los_Mitos_${getTodayLocalString()}.txt`;
    downloadTextFile(filename, lines.join('\n'), 'text/plain;charset=utf-8');
  };


  const handleGenerateSocialText = () => {
    let t = "🎶 **¡ÚLTIMAS PLAZAS LIBRES EN ESCUELA LOS MITOS!** 🎶\n\n";
    let foundAny = false;

    const getDaySortIndex = (dayVal) => {
      const num = parseInt(dayVal, 10);
      return num === 0 ? 7 : num;
    };

    const formatTimeCompact = (timeStr) => {
      if (!timeStr) return '';
      const [h, m] = timeStr.split(':');
      if (m === '00') return `${parseInt(h, 10)}h`;
      return `${parseInt(h, 10)}:${m}h`;
    };

    SEDES.forEach(sede => {
      const clasesSede = recurringClassesOnly.filter(c => (c.sede || 'Tarragona') === sede && c.isWebVisible === true);
      const filteredWithSpots = clasesSede.filter(c => getCommercialFreeSpots(c) > 0);

      if (filteredWithSpots.length > 0) {
        foundAny = true;
        t += `📍 **SEDE ${sede.toUpperCase()}**\n`;
        const instrumentosEnSede = [...new Set(filteredWithSpots.map(c => c.subject))].sort();
        
        instrumentosEnSede.forEach(inst => {
          t += `🔹 *${inst.toUpperCase()}:*\n`;
          
          const grupos = filteredWithSpots.filter(c => c.subject === inst);
          
          grupos.sort((a, b) => {
            const dayA = getDaySortIndex(a.dayOfWeek);
            const dayB = getDaySortIndex(b.dayOfWeek);
            if (dayA !== dayB) return dayA - dayB;
            return (a.time || '').localeCompare(b.time || '');
          });

          grupos.forEach(c => {
            const libres = getCommercialFreeSpots(c);
            const tagPlazas = libres === 1 ? " - Última plaza" : "";
            
            t += `• ${getDayName(c.dayOfWeek)} ${formatTimeCompact(c.time)}${tagPlazas}\n`;
          });
        });
        t += "\n";
      }
    });

    if (!foundAny) {
      t = "📢 ¡Todos nuestros grupos web están completos en este momento! No hay plazas libres publicadas.";
    } else {
      t += "📲 ¡Reserva tu plaza directamente desde el formulario de nuestra web o escríbenos un mensaje privado antes de que se agoten! 🚀";
    }

    setSocialModalText(t);
  };

  const handleCerrarRetoMensual = async () => {
    const players = students.filter(s => s.triviaPoints > 0).sort((a,b) => b.triviaPoints - a.triviaPoints);
    if(players.length === 0) return alert("Nadie ha jugado este mes.");
    const maxScore = players[0].triviaPoints;
    const winners = players.filter(s => s.triviaPoints === maxScore);
    if(!window.confirm(`¿Confirmas el cierre del MES?\n\nLos puntos pasarán al acumulado del Trimestre y del Año, y el mes quedará a cero.\n\nHay ${winners.length} ganadores este mes con ${maxScore} puntos.`)) return;
    setLoading(true);
    try {
      const winnerNames = winners.map(w => w.name);
      const updatePromises = players.map(p => {
        const docRef = doc(db, 'artifacts', appId, 'students', p.id);
        return updateDoc(docRef, { 
          triviaPointsQuarterly: (p.triviaPointsQuarterly || 0) + p.triviaPoints,
          triviaPointsAnnual: (p.triviaPointsAnnual || 0) + p.triviaPoints,
          triviaPoints: 0
        });
      });
      await Promise.all(updatePromises);
      const msg = `¡Felicidades a ${winnerNames.join(', ')} por conseguir la victoria del mes con ${maxScore} puntos!\n\nEl contador mensual vuelve a cero, pero vuestros puntos se acumulan para el Ranking Trimestral y Anual. ¡A por todas!`;
      const id = Date.now().toString();
      await setDoc(doc(db, 'artifacts', appId, 'announcements', id), { title: "🏆 ¡Ganadores del Mes!", content: msg, date: new Date().toISOString().split('T')[0] });
      alert("Mes cerrado con éxito. Puntos volcados a los rankings superiores.");
    } catch (e) { 
      alert("Error al cerrar el mes: " + e.message); 
    } finally {
      setLoading(false);
    }
  };

  const handleCerrarRetoTrimestral = async () => {
    const players = students.filter(s => (s.triviaPointsQuarterly || 0) + (s.triviaPoints || 0) > 0)
      .sort((a,b) => ((b.triviaPointsQuarterly || 0) + (b.triviaPoints || 0)) - ((a.triviaPointsQuarterly || 0) + (a.triviaPoints || 0)));
    if(players.length === 0) return alert("Nadie ha acumulado puntos en el trimestre.");
    const maxScore = (players[0].triviaPointsQuarterly || 0) + (players[0].triviaPoints || 0);
    const winners = players.filter(s => ((s.triviaPointsQuarterly || 0) + (s.triviaPoints || 0)) === maxScore);
    if(!window.confirm(`¿Confirmas el cierre del TRIMESTRE?\n\nLos puntos trimestrales se pondrán a cero (los anuales seguirán intactos).\n\nHay ${winners.length} ganadores con ${maxScore} puntos.`)) return;
    setLoading(true);
    try {
      const winnerNames = winners.map(w => w.name);
      const updatePromises = players.map(p => {
        return updateDoc(doc(db, 'artifacts', appId, 'students', p.id), { 
          triviaPointsQuarterly: 0
        });
      });
      await Promise.all(updatePromises);
      const msg = `¡Felicidades a ${winnerNames.join(', ')} por coronarse como los campeones del Trimestre con ${maxScore} puntos!\n\nPasaros por coordinación a recoger vuestro premio. El contador trimestral se reinicia, ¡pero la carrera por el Gran Premio Anual sigue activa!`;
      const id = Date.now().toString();
      await setDoc(doc(db, 'artifacts', appId, 'announcements', id), { title: "👑 ¡Campeones del Trimestre!", content: msg, date: new Date().toISOString().split('T')[0] });
      alert("Trimestre cerrado con éxito. Puedes proceder a dar los premios.");
    } catch (e) { 
      alert("Error al cerrar el trimestre: " + e.message); 
    } finally {
      setLoading(false);
    }
  };

  const handleCerrarRetoAnual = async () => {
    if(!window.confirm(`⚠️ PELIGRO: REINICIO TOTAL\n\n¿Seguro que quieres CERRAR LA TEMPORADA?\n\nEsto pondrá a CERO ABSOLUTO los contadores de todos los alumnos (Mes, Trimestre, Año, Rachas y Victorias). Úsalo solo para empezar un nuevo curso o terminar el periodo de pruebas.`)) return;
    setLoading(true);
    try {
      const players = students.filter(s => 
        (s.triviaPointsAnnual || 0) > 0 || 
        (s.triviaPointsQuarterly || 0) > 0 || 
        (s.triviaPoints || 0) > 0 || 
        (s.triviaStreak || 0) > 0 || 
        (s.triviaVictories || 0) > 0
      );
      const updatePromises = players.map(p => {
        return updateDoc(doc(db, 'artifacts', appId, 'students', p.id), { 
          triviaPoints: 0,
          triviaPointsQuarterly: 0,
          triviaPointsAnnual: 0,
          triviaStreak: 0,
          triviaVictories: 0
        });
      });
      await Promise.all(updatePromises);
      alert("🧹 ¡Limpieza profunda completada! El sistema está a cero y listo para una nueva temporada.");
    } catch (e) { 
      alert("Error al cerrar el año: " + e.message); 
    } finally {
      setLoading(false);
    }
  };

  const saveGlobalSettings = async (newSettings) => {
    await setDoc(doc(db, 'artifacts', appId, 'settings', 'global'), newSettings, { merge: true });
    alert('Ajustes guardados correctamente.');
  };

  const getOwnerUidFromClassPath = (classData) => {
    if (!classData?.refPath) return '';
    const parts = classData.refPath.split('/');
    const usersIndex = parts.indexOf('users');
    return usersIndex >= 0 ? parts[usersIndex + 1] : '';
  };

  const getTargetUidForTeacher = (teacherName, classIdToIgnore = null) => {
    const cleanTeacher = String(teacherName || '').trim();
    const existingClass = allClasses.find(c =>
      c.teacher === cleanTeacher &&
      c.refPath &&
      (!classIdToIgnore || c.id !== classIdToIgnore)
    );

    if (existingClass) return getOwnerUidFromClassPath(existingClass);

    const teacherEmail = getTeacherEmail(cleanTeacher);
    return teacherEmail ? teacherEmail.replace(/[@.]/g, '_') : 'admin_generated';
  };

  const openEditClassModal = (clase) => {
    if (!clase) return;

    setEditClassModal(clase);
    setEditClassData({
      isRecurring: !isPunctualClass(clase),
      specificDate: clase.date || clase.specificDate || new Date().toISOString().split('T')[0],
      dayOfWeek: String(clase.dayOfWeek ?? '1'),
      time: clase.time || '17:00',
      sede: clase.sede || 'Tarragona',
      sala: clase.sala || 'Sala 1',
      teacher: clase.teacher || '',
      subject: clase.subject || '',
      capacity: clase.capacity ?? '',
      duration: clase.duration ?? 60,
      cuotaBase: clase.cuotaBase ?? 0,
      notes: clase.notes || ''
    });
  };

  const closeEditClassModal = () => {
    setEditClassModal(null);
    setEditClassData(null);
  };

  const handleSaveEditedClass = async () => {
    if (!editClassModal || !editClassData) return;
    if (!editClassData.teacher || !editClassData.subject || !editClassData.capacity) {
      return alert("El profesor, el instrumento y el aforo son obligatorios.");
    }
    if (!editClassData.isRecurring && !editClassData.specificDate) {
      return alert("Para una clase puntual, debes elegir una fecha.");
    }

    const cleanTeacher = String(editClassData.teacher || '').trim();
    const dayKey = editClassData.isRecurring
      ? parseInt(editClassData.dayOfWeek)
      : new Date(editClassData.specificDate).getDay();

    const classTime = editClassData.time;
    const classEndTime = getClassEndTime(classTime, editClassData.duration);
    const teacherKey = cleanTeacher.toLowerCase();
    const teacherSlots = availabilities[teacherKey]?.[String(dayKey)] || [];

    const isCovered = teacherSlots.some(slot => isClassFullyCoveredBySlot(editClassData, slot));
    if (!isCovered) {
      const confirmForce = window.confirm(`AVISO DE DISPONIBILIDAD:\n\nEl profesor ${cleanTeacher} no ha marcado estar disponible el ${getDayName(dayKey)} de ${classTime}h a ${classEndTime || 'la hora de fin'}h.\n\nLa clase debe caber completa dentro de una franja de disponibilidad.\n\n¿Quieres guardar igualmente estos cambios?`);
      if (!confirmForce) return;
    }

    const collidingClasses = operationalClasses.filter(c => {
      if (c.id === editClassModal.id) return false;
      if (c.sede !== editClassData.sede) return false;
      if (c.sala !== editClassData.sala) return false;
      if (c.time !== editClassData.time) return false;

      if (editClassData.isRecurring) {
        if (!isPunctualClass(c) && c.dayOfWeek === dayKey) return true;
        if (isPunctualClass(c) && c.date && new Date(`${c.date}T00:00:00`).getDay() === dayKey) return true;
      } else {
        if (!isPunctualClass(c) && c.dayOfWeek === dayKey) return true;
        if (isPunctualClass(c) && c.date === editClassData.specificDate) return true;
      }
      return false;
    });

    if (collidingClasses.length > 0) {
      const clash = collidingClasses[0];
      const confirmForceRoom = window.confirm(`ADVERTENCIA DE ESPACIO:\n\nLa ${editClassData.sala} de ${editClassData.sede} ya está ocupada ese día a las ${editClassData.time}h por la clase de ${clash.subject} de ${clash.teacher}.\n\n¿Quieres guardar la clase en este mismo hueco igualmente?`);
      if (!confirmForceRoom) return;
    }

    const previousTeacher = editClassModal.teacher || '';
    const previousOwnerUid = getOwnerUidFromClassPath(editClassModal);
    const targetUid = getTargetUidForTeacher(cleanTeacher, editClassModal.id);
    const targetRef = doc(db, 'artifacts', appId, 'users', targetUid, 'recurringClasses', editClassModal.id);

    const { refPath, ...currentClassData } = editClassModal;
    const updatedClassData = {
      ...currentClassData,
      isRecurring: Boolean(editClassData.isRecurring),
      specificDate: editClassData.isRecurring ? '' : editClassData.specificDate,
      dayOfWeek: dayKey,
      time: editClassData.time,
      sede: editClassData.sede,
      sala: editClassData.sala,
      teacher: cleanTeacher,
      subject: editClassData.subject,
      capacity: editClassData.capacity,
      duration: Number(editClassData.duration) || 60,
      cuotaBase: Number(editClassData.cuotaBase) || 0,
      notes: editClassData.notes || '',
      date: editClassData.isRecurring ? null : editClassData.specificDate,
      updatedAt: new Date().toISOString(),
      updatedBy: user?.email || 'admin'
    };

    try {
      if (!editClassModal.refPath) {
        await setDoc(targetRef, updatedClassData, { merge: true });
      } else if (previousOwnerUid && previousOwnerUid !== targetUid) {
        await setDoc(targetRef, updatedClassData);
        await deleteDoc(doc(db, editClassModal.refPath));
      } else {
        await updateDoc(doc(db, editClassModal.refPath), updatedClassData);
      }

      if (viewClassModal && viewClassModal.id === editClassModal.id) {
        setViewClassModal(null);
      }

      closeEditClassModal();

      alert(previousTeacher !== cleanTeacher
        ? `Clase editada y trasladada de ${previousTeacher || 'Sin profesor'} a ${cleanTeacher}.`
        : "Clase editada correctamente.");
    } catch (e) {
      alert("Error al editar la clase: " + e.message);
    }
  };

  const handleCreateGlobalClass = async () => {
    if (!newClassData.teacher || !newClassData.subject || !newClassData.capacity) {
      return alert("El profesor, el instrumento y el aforo son obligatorios.");
    }
    if (!newClassData.isRecurring && !newClassData.specificDate) {
      return alert("Para una clase puntual, debes elegir una fecha.");
    }

    const teacherKey = newClassData.teacher.toLowerCase();
    const dayKey = newClassData.isRecurring ? parseInt(newClassData.dayOfWeek) : new Date(newClassData.specificDate).getDay();
    const classTime = newClassData.time;
    const classEndTime = getClassEndTime(classTime, newClassData.duration);
    
    // --- 1. Aviso de Disponibilidad del Profesor ---
    const teacherSlots = availabilities[teacherKey]?.[dayKey.toString()] || [];
    const isCovered = teacherSlots.some(slot => isClassFullyCoveredBySlot(newClassData, slot));
    if (!isCovered) {
      const confirmForce = window.confirm(`⚠️ AVISO DE DISPONIBILIDAD:\n\nEl profesor ${newClassData.teacher} NO ha marcado estar disponible el ${getDayName(dayKey)} de ${classTime}h a ${classEndTime || 'la hora de fin'}h.\n\nLa clase debe caber completa dentro de una franja de disponibilidad.\n\n¿Quieres FORZAR la creación de la clase de todos modos?`);
      if (!confirmForce) return; 
    }

    // --- 2. Aviso de Solapamiento Físico de Sala ---
    const collidingClasses = operationalClasses.filter(c => {
      if (c.sede !== newClassData.sede) return false;
      if (c.sala !== newClassData.sala) return false;
      if (c.time !== newClassData.time) return false;

      if (newClassData.isRecurring) {
        if (!isPunctualClass(c) && c.dayOfWeek === dayKey) return true;
        if (isPunctualClass(c) && c.date && new Date(`${c.date}T00:00:00`).getDay() === dayKey) return true; 
      } else {
        if (!isPunctualClass(c) && c.dayOfWeek === dayKey) return true;
        if (isPunctualClass(c) && c.date === newClassData.specificDate) return true;
      }
      return false;
    });

    if (collidingClasses.length > 0) {
      const clash = collidingClasses[0];
      const confirmForceRoom = window.confirm(`⚠️ ADVERTENCIA DE ESPACIO:\n\nLa ${newClassData.sala} de ${newClassData.sede} ya está ocupada ese día a las ${newClassData.time}h por la clase de ${clash.subject} de ${clash.teacher}.\n\nSabemos que a veces usáis el vestíbulo o buscáis apaños.\n¿Quieres forzar la creación de la clase en este mismo hueco de todas formas?`);
      if (!confirmForceRoom) return;
    }
    
    const teacherEmail = `${newClassData.teacher.toLowerCase().replace(' ', '.')}@escuelalosmitos.com`;
    const existingClass = allClasses.find(c => c.teacher === newClassData.teacher);
    let targetUid = 'admin_generated'; 
    if (existingClass && existingClass.refPath) {
      targetUid = existingClass.refPath.split('/')[3]; 
    } else {
       targetUid = teacherEmail.replace(/[@.]/g, '_');
    }

    const baseWebConfig = {
      isWebVisible: false,
      tadosiUrl: '',
      startDate: '',
      price: '',
      publicDetails: '',
      whatsappGroupUrl: ''
    };

    try {
      const classId = Date.now().toString();

      await setDoc(doc(db, 'artifacts', appId, 'users', targetUid, 'recurringClasses', classId), {
        ...newClassData,
        ...baseWebConfig,
        cuotaBase: Number(newClassData.cuotaBase) || 0, // 👈 Cuota para Informes
        id: classId,
        students: [],
        exceptions: {},
        cancelledDates: [],
        dayOfWeek: dayKey,
        date: newClassData.isRecurring ? null : newClassData.specificDate
      });
      alert(`✅ Clase ${newClassData.isRecurring ? 'RECURRENTE' : 'PUNTUAL'} de ${newClassData.subject} asignada a ${newClassData.teacher} correctamente.`);

      setCreateClassModal(false);
      setNewClassData({ isRecurring: true, specificDate: new Date().toISOString().split('T')[0], dayOfWeek: '1', time: '17:00', sede: 'Tarragona', sala: 'Sala 1', teacher: '', subject: '', capacity: '', duration: 60, cuotaBase: 60, notes: '' });
    } catch (e) {
      alert("Error al crear la clase.");
    }
  };

  const handleMassImport = async () => {
    if (!importText.trim()) return alert("Pega los datos del Excel primero.");
    if (!window.confirm("⚠️ ATENCIÓN: Vas a importar alumnos masivamente. ¿Están las columnas ordenadas como Nombre | Email?")) return;
    setIsImporting(true);
    try {
      const rows = importText.trim().split('\n');
      const batch = writeBatch(db);
      let count = 0;
      rows.forEach((row, index) => {
        const cols = row.split('\t');
        if (cols.length > 0 && cols[0].trim() !== '') {
          const name = cols[0].trim();
          const email = cols[1] ? cols[1].trim().toLowerCase() : '';
          const studentId = `imp-${Date.now()}-${index}`;
          const docRef = doc(db, 'artifacts', appId, 'students', studentId);
          batch.set(docRef, {
            name: name,
            email: email,
            globalStatus: 'activo',
            claimed: false,
            instruments: [],
            classes: [],
            hasMitobox: false,
            hasMitoverso: false,
            triviaPoints: 0,
            triviaVictories: 0,
            internalNotes: 'Importado masivamente de Tadosi',
            classStartDate: ''
          });
          count++;
        }
      });
      await batch.commit();
      alert(`🎉 ¡BOOM! Se han importado ${count} alumnos correctamente.`);
      setImportText('');
    } catch (error) {
      alert(`❌ Error en la importación: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const isAbsenceGestion = (gestion = {}) => {
    const type = String(gestion.type || '').toLowerCase();
    return type.includes('ausencia') || type.includes('falta');
  };

  const getAbsenceGestionDate = (gestion = {}) => {
    const directDate = [
      gestion.absenceDate,
      gestion.classDate,
      gestion.targetDate,
      gestion.dateStr,
      gestion.requestedDate,
      gestion.originalDate,
      gestion.sessionDate
    ].map(normalizeGestionDateString).find(Boolean);

    if (directDate) return directDate;

    const text = `${gestion.details || ''} ${gestion.title || ''}`;
    const isoMatch = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) return normalizeGestionDateString(isoMatch[0]);

    const dmyMatch = text.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (dmyMatch) return normalizeGestionDateString(dmyMatch[0]);

    return '';
  };

  const shouldAutoArchiveAbsenceGestion = (gestion = {}) => {
    if (gestion.status !== 'pendiente' || !isAbsenceGestion(gestion)) return false;
    if (gestion.autoArchivedAt || gestion.archivedAt) return false;
    const absenceDate = getAbsenceGestionDate(gestion);
    if (!absenceDate) return false;
    const archiveFromDate = addDaysToLocalDateString(absenceDate, 1);
    return Boolean(archiveFromDate && todayStr >= archiveFromDate);
  };

  const pendingGestiones = gestiones.filter(g => g.status === 'pendiente');
  const resolvedGestiones = gestiones.filter(g => g.status !== 'pendiente');
  const scheduledGestionesVencidas = gestiones.filter(shouldConsolidateScheduledGestion);
  const isScheduledGestionPendingConsolidation = (gestion = {}) => {
    if (!['baja', 'cambio_horario'].includes(gestion.type)) return false;
    if (gestion.status !== 'completado') return false;
    if (gestion.workflowStatus === 'consolidado' || gestion.consolidatedAt) return false;

    const workflowStatus = String(gestion.workflowStatus || '').toLowerCase();
    const executionMode = String(gestion.executionMode || '').toLowerCase();
    const hasScheduledDates = Boolean(getScheduledGestionEndDate(gestion) && getScheduledGestionEffectiveDate(gestion));

    return Boolean(
      workflowStatus === 'programado' ||
      executionMode.includes('scheduled') ||
      hasScheduledDates
    );
  };
  const scheduledGestionesProgramadas = gestiones
    .filter(isScheduledGestionPendingConsolidation)
    .sort((a, b) => String(getScheduledGestionEffectiveDate(a) || '9999-12-31').localeCompare(String(getScheduledGestionEffectiveDate(b) || '9999-12-31')) || new Date(a.date || 0) - new Date(b.date || 0));
  const scheduledGestionesPendientesConsolidacion = scheduledGestionesProgramadas.filter(g => !shouldConsolidateScheduledGestion(g));

  useEffect(() => {
    const absencesToArchive = gestiones.filter(shouldAutoArchiveAbsenceGestion);
    if (absencesToArchive.length === 0) return;

    absencesToArchive.forEach(gestion => {
      const absenceDate = getAbsenceGestionDate(gestion);
      updateDoc(doc(db, 'artifacts', appId, 'gestiones', gestion.id), {
        status: 'archivado',
        autoArchivedAt: new Date().toISOString(),
        autoArchivedBy: 'admin_portal',
        autoArchivedReason: `Aviso de ausencia archivado automáticamente un día después de la fecha de la ausencia${absenceDate ? ` (${absenceDate})` : ''}.`
      }).catch(error => console.warn('No se pudo archivar automáticamente el aviso de ausencia', gestion.id, error));
    });
  }, [gestiones, db, appId, todayStr]);

  const isOpenTeacherTaskStatus = (status = 'pendiente') => ['pendiente', 'en_revision', 'en_curso'].includes(status || 'pendiente');
  const isTeacherAdminAssignment = (task = {}) => task.type === 'admin_assignment' || task.direction === 'admin_to_teacher';
  const pendingTeacherRequests = teacherTasks.filter(task =>
    task.type === 'admin_request' && isOpenTeacherTaskStatus(task.status || 'pendiente')
  );
  const pendingAdminAssignments = teacherTasks.filter(task =>
    isTeacherAdminAssignment(task) && isOpenTeacherTaskStatus(task.status || 'pendiente')
  );
  const pendingTeacherPanelTasks = [...pendingTeacherRequests, ...pendingAdminAssignments]
    .sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0));
  const resolvedTeacherRequests = teacherTasks.filter(task =>
    (task.type === 'admin_request' || isTeacherAdminAssignment(task)) && !isOpenTeacherTaskStatus(task.status || 'pendiente')
  );
  const visibleResolvedGestiones = resolvedGestiones.slice(0, resolvedGestionesVisible);
  const readyPendingGestiones = pendingGestiones.filter(isGestionReadyForExecution);
  const blockedByTadosiGestiones = pendingGestiones.filter(g => !isGestionReadyForExecution(g));
  const totalPendingInbox = pendingGestiones.length + pendingTeacherPanelTasks.length + scheduledGestionesProgramadas.length;

  const gestionPendingFilters = [
    { id: 'todas', label: 'Todas gestiones', matcher: () => true },
    { id: 'tadosi_pendiente', label: 'Pend. Tadosi', matcher: (g) => gestionRequiresTadosi(g) && !isGestionTadosiDone(g) },
    { id: 'tadosi_hecho', label: 'Tadosi hecho', matcher: (g) => gestionRequiresTadosi(g) && isGestionTadosiDone(g) },
    { id: 'mantenimiento', label: 'Mantenimiento', matcher: (g) => ['mantenimiento', 'reactivar_plaza'].includes(g.type) },
    { id: 'ausencias', label: 'Ausencias', matcher: (g) => isAbsenceGestion(g) },
    { id: 'bajas', label: 'Bajas', matcher: (g) => (g.type || '').includes('baja') },
    { id: 'manuales', label: 'Manuales', matcher: (g) => g.source === 'manual_admin' || (g.type || '').includes('manual') || g.type === 'tarea_manual' || g.type === 'incidencia_manual' },
  ];

  const teacherTaskInboxFilters = [
    { id: 'todas', label: 'Todo profesores', matcher: () => true },
    { id: 'recibidas', label: 'Peticiones recibidas', matcher: (task) => !isTeacherAdminAssignment(task) },
    { id: 'encargadas', label: 'Encargos enviados', matcher: (task) => isTeacherAdminAssignment(task) }
  ];

  const normalizeSearchText = (value = '') => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const gestionSearchNeedle = normalizeSearchText(gestionSearchTerm);

  const matchesGestionSearch = (g = {}) => {
    if (!gestionSearchNeedle) return true;
    const studentInfo = g.studentId ? students.find(s => s.id === g.studentId) : null;
    const haystack = normalizeSearchText([
      g.studentName, g.studentEmail, g.title, g.details, g.sourceClassLine, g.requestedClassLine, studentInfo?.name, studentInfo?.alias, studentInfo?.email
    ].filter(Boolean).join(' '));
    return haystack.includes(gestionSearchNeedle);
  };

  const matchesTeacherRequestSearch = (task = {}) => {
    if (!gestionSearchNeedle) return true;
    const haystack = normalizeSearchText([
      task.teacherName,
      task.teacherEmail,
      task.title,
      task.description,
      task.relatedClassLine,
      task.teacherResponse,
      task.rejectionReason,
      task.adminResponse,
      isTeacherAdminAssignment(task) ? 'encargo coordinación admin profesor' : getTeacherTaskRequestLabel(task.requestType)
    ].filter(Boolean).join(' '));
    return haystack.includes(gestionSearchNeedle);
  };

  const activeGestionPendingFilter = gestionPendingFilters.find(f => f.id === gestionPendingFilter) || gestionPendingFilters[0];
  const activeTeacherTaskInboxFilter = teacherTaskInboxFilters.find(f => f.id === teacherTaskInboxFilter) || teacherTaskInboxFilters[0];
  const filteredPendingGestiones = pendingGestiones.filter(activeGestionPendingFilter.matcher).filter(matchesGestionSearch);
  const filteredScheduledGestionesProgramadas = scheduledGestionesProgramadas.filter(matchesGestionSearch);
  const filteredTeacherRequests = pendingTeacherPanelTasks
    .filter(activeTeacherTaskInboxFilter.matcher)
    .filter(matchesTeacherRequestSearch);
  const pendingGestionFilterCounts = gestionPendingFilters.reduce((acc, filter) => {
    acc[filter.id] = pendingGestiones.filter(filter.matcher).length;
    return acc;
  }, {});
  const pendingTeacherFilterCounts = teacherTaskInboxFilters.reduce((acc, filter) => {
    acc[filter.id] = pendingTeacherPanelTasks.filter(filter.matcher).length;
    return acc;
  }, {});
  
  const rankMonthly = students.filter(s => s.triviaPoints > 0).sort((a,b) => b.triviaPoints - a.triviaPoints).slice(0,10);
  const rankQuarterly = students.filter(s => (s.triviaPointsQuarterly || 0) + (s.triviaPoints || 0) > 0).map(s => ({ ...s, liveQuarterly: (s.triviaPointsQuarterly || 0) + (s.triviaPoints || 0) })).sort((a,b) => b.liveQuarterly - a.liveQuarterly).slice(0,10);
  const rankAnnual = students.filter(s => (s.triviaPointsAnnual || 0) + (s.triviaPoints || 0) > 0).map(s => ({ ...s, liveAnnual: (s.triviaPointsAnnual || 0) + (s.triviaPoints || 0) })).sort((a,b) => b.liveAnnual - a.liveAnnual).slice(0,10);

  const classesByTeacher = useMemo(() => {
    const grouped = {};
    operationalClasses.forEach(c => {
      const teacherName = c.teacher || 'Sin Asignar';
      if (!grouped[teacherName]) grouped[teacherName] = [];
      grouped[teacherName].push(c);
    });
    Object.keys(grouped).forEach(t => {
      grouped[t].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.time.localeCompare(b.time));
    });
    return grouped;
  }, [operationalClasses]);

  const architectSelectedDay = useMemo(() => {
    const dayIndex = getDateDayIndex(archDate);
    return String(dayIndex === null ? 1 : dayIndex);
  }, [archDate]);

  const architectReferenceLabel = formatDateWithWeekday(archDate || todayStr);

  const getArchitectReferenceDate = (projected = false, referenceDateOverride = '') => referenceDateOverride || (projected ? nextMonthEndStr : todayStr);

  const isProjectedMaintenanceActiveForArchitectDate = (studentEntry = {}, referenceDate = archDate || todayStr) => {
    if (studentEntry.projectedMaintenance !== true) return false;
    const from = String(studentEntry.projectedMaintenanceFrom || '').trim();
    const until = String(studentEntry.projectedMaintenanceUntil || '').trim();
    if (!from || !until) return true;
    return from <= referenceDate && until >= referenceDate;
  };

  const isArchitectPlanningStudent = (studentEntry = {}) => {
    return !(
      studentEntry?.isRecovery === true ||
      studentEntry?.isPunctual === true ||
      studentEntry?.type === 'recovery' ||
      studentEntry?.status === 'recovery'
    );
  };

  const getPlanningStudentsForClass = (clase = {}, projected = false, referenceDateOverride = '') => {
    const referenceDate = getArchitectReferenceDate(projected, referenceDateOverride);
    const activeRelocations = temporaryRelocations.filter(rel => isTemporaryRelocationActiveForDate(rel, referenceDate));
    const relocatedOutIds = new Set(
      activeRelocations
        .filter(rel => rel.sourceClassId === clase.id)
        .map(rel => rel.studentId)
    );

    const baseStudents = (clase.students || []).filter(studentEntry => {
      if (relocatedOutIds.has(studentEntry.id)) return false;
      const studentInfo = students.find(student => student.id === studentEntry.id) || {};
      return !hasStudentClassEndedBeforeDate(studentEntry, studentInfo, referenceDate);
    });

    const relocatedInStudents = activeRelocations
      .filter(rel => rel.targetClassId === clase.id)
      .filter(rel => !baseStudents.some(studentEntry => studentEntry.id === rel.studentId))
      .map(rel => {
        const studentInfo = students.find(student => student.id === rel.studentId) || {};
        const displayName = studentInfo?.useAlias && studentInfo?.alias
          ? studentInfo.alias
          : (studentInfo?.name || rel.studentName || 'Alumno');

        return {
          id: rel.studentId,
          name: displayName,
          email: studentInfo?.email || rel.studentEmail || '',
          classStartDate: studentInfo?.classStartDate || '',
          isPaused: false,
          status: 'present',
          isRecovery: false,
          isTemporaryRelocation: true,
          temporaryRelocationId: rel.id,
          relocationLabel: `Recolocado temporalmente · ${formatDateSpanish(rel.from)} - ${formatDateSpanish(rel.until)}`,
          sourceClassId: rel.sourceClassId,
          sourceClassLine: rel.sourceClassLine || ''
        };
      });

    return [...baseStudents, ...relocatedInStudents];
  };

  const getClassStudentPlanningData = (clase, projected = false, referenceDateOverride = '') => {
    const referenceDate = getArchitectReferenceDate(projected, referenceDateOverride);

    return getPlanningStudentsForClass(clase, projected, referenceDateOverride)
      .filter(isArchitectPlanningStudent)
      .map(studentEntry => {
        const studentInfo = students.find(student => student.id === studentEntry.id) || {};
        const projectedStatus = projected
          ? (studentEntry.projectedGlobalStatus || studentInfo?.globalStatus || 'activo')
          : (studentInfo?.globalStatus || 'activo');
        const startDate = getStudentClassStartDate(studentEntry, studentInfo);
        const endDate = getStudentClassEndDate(studentEntry, studentInfo);
        const isPastEnd = hasStudentClassEndedBeforeDate(studentEntry, studentInfo, referenceDate);
        const isFutureStart = Boolean(startDate && startDate > referenceDate);
        const projectedMaintenanceActive = projected && isProjectedMaintenanceActiveForArchitectDate(studentEntry, referenceDate);
        const isMaintenance = projectedStatus !== 'baja' && !isPastEnd && (
          projectedMaintenanceActive ||
          isStudentInMaintenance(studentEntry.id, referenceDate)
        );
        const isRelocated = Boolean(studentEntry.isTemporaryRelocation || studentEntry.temporaryRelocationId);
        const isActive = projectedStatus !== 'baja' && !isPastEnd && !isMaintenance && !isFutureStart;
        const displayName = studentEntry.name || studentEntry.studentName || studentInfo?.alias || studentInfo?.name || 'Alumno';
        const email = studentInfo?.email || studentEntry.email || studentEntry.studentEmail || 'sin email';

        return {
          id: studentEntry.id,
          displayName,
          email,
          status: projectedStatus,
          isMaintenance,
          isActive,
          isFutureStart,
          isRelocated,
          relocationLabel: studentEntry.relocationLabel || '',
          startDate,
          endDate,
          isPastEnd
        };
      });
  };

  const getActiveClassStudentCount = (clase, projected = false) => {
    return getClassStudentPlanningData(clase, projected).filter(student => student.isActive).length;
  };

  const getMaintenanceClassStudentCount = (clase, projected = false) => {
    return getClassStudentPlanningData(clase, projected).filter(student => student.isMaintenance).length;
  };

  const hibernatedClasses = useMemo(() => {
    return recurringClassesOnly.filter(c => getActiveClassStudentCount(c, false) === 0).sort((a, b) => {
      const sedeCompare = String(a.sede || '').localeCompare(String(b.sede || ''), 'es');
      if (sedeCompare !== 0) return sedeCompare;
      const dayCompare = Number(a.dayOfWeek || 0) - Number(b.dayOfWeek || 0);
      if (dayCompare !== 0) return dayCompare;
      return String(a.time || '').localeCompare(String(b.time || ''));
    });
  }, [recurringClassesOnly, students, temporaryRelocations, maintenancePeriods, todayStr]);

  const getDangerThresholds = (capacity) => {
    const cap = parseInt(capacity, 10) || 0;
    if (cap <= 1) return null;
    if (cap >= 8) return { critical: 3, review: 5 };
    if (cap === 5) return { critical: 1, review: 2 };
    if (cap === 4) return { critical: 1, review: 2 };
    return { critical: 1, review: Math.ceil(cap / 2) };
  };

  const buildDangerClassAnalysis = (clase, projected = false) => {
    const cap = parseInt(clase.capacity, 10) || 0;
    const thresholds = getDangerThresholds(cap);
    const studentRows = getClassStudentPlanningData(clase, projected);
    const activeStudents = studentRows
      .filter(student => student.isActive)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
    const maintenanceStudents = studentRows
      .filter(student => student.isMaintenance)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
    const futureStartStudents = studentRows
      .filter(student => student.isFutureStart)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
    const activeCount = activeStudents.length;
    const maintenanceCount = maintenanceStudents.length;
    const futureStartCount = futureStartStudents.length;

    if (!thresholds) {
      return { include: false, cap, activeCount, maintenanceCount, futureStartCount, activeStudents, maintenanceStudents, futureStartStudents, statusKey: 'omitida', statusLabel: 'Particular', statusHelp: 'Clase de aforo 1: no entra en grupos en peligro.', priority: 99 };
    }

    if (activeCount === 0 && maintenanceCount === 0 && futureStartCount === 0) {
      return { include: true, cap, activeCount, maintenanceCount, futureStartCount, activeStudents, maintenanceStudents, futureStartStudents, statusKey: 'vacia', statusLabel: 'Vacía', statusHelp: 'Sin alumnos activos, sin mantenimiento y sin inicios futuros. Candidata a cerrar o hibernar.', priority: 0 };
    }

    if (activeCount === 0 && (maintenanceCount > 0 || futureStartCount > 0)) {
      return { include: true, cap, activeCount, maintenanceCount, futureStartCount, activeStudents, maintenanceStudents, futureStartStudents, statusKey: 'solo_mantenimiento', statusLabel: 'Solo reserva', statusHelp: 'No hay alumnos activos; solo plazas en mantenimiento o alumnos con inicio futuro.', priority: 1 };
    }

    if (activeCount <= thresholds.critical) {
      return { include: true, cap, activeCount, maintenanceCount, activeStudents, maintenanceStudents, statusKey: 'critico', statusLabel: 'Crítico', statusHelp: `Criterio: aforo ${cap}, crítico con ${thresholds.critical} alumno(s) activo(s) o menos.`, priority: 2 };
    }

    if (activeCount <= thresholds.review) {
      return { include: true, cap, activeCount, maintenanceCount, activeStudents, maintenanceStudents, statusKey: 'revisar', statusLabel: 'Revisar', statusHelp: `Criterio: aforo ${cap}, revisar con ${thresholds.review} alumno(s) activo(s) o menos.`, priority: 3 };
    }

    return { include: false, cap, activeCount, maintenanceCount, activeStudents, maintenanceStudents, statusKey: 'sana', statusLabel: 'Sana', statusHelp: 'Ocupación suficiente.', priority: 99 };
  };

  const projectedPlanningClasses = useMemo(() => {
    const studentStatusById = new Map(students.map(student => [student.id, student.globalStatus || 'activo']));
    const studentDataById = new Map(students.map(student => [student.id, student]));
    const projectedClasses = recurringClassesOnly.map(clase => ({
      ...clase,
      students: (clase.students || []).map(studentEntry => ({
        ...studentEntry,
        projectedGlobalStatus: studentStatusById.get(studentEntry.id) || 'activo'
      }))
    }));
    const classById = new Map(projectedClasses.map(clase => [clase.id, clase]));

    const getDisplayNameForProjection = (studentInfo, gestion) => {
      if (studentInfo?.useAlias && studentInfo?.alias) return studentInfo.alias;
      return gestion?.studentName || studentInfo?.alias || studentInfo?.name || 'Alumno';
    };

    const getEmailForProjection = (studentInfo, gestion) => studentInfo?.email || gestion?.studentEmail || gestion?.email || '';

    const addStudentToProjectedClass = (clase, studentInfo, gestion, projectedMaintenance = false) => {
      if (!clase || !studentInfo?.id) return;
      const payload = {
        id: studentInfo.id,
        name: getDisplayNameForProjection(studentInfo, gestion),
        email: getEmailForProjection(studentInfo, gestion),
        classStartDate: gestion.scheduledClassStartDate || gestion.effectiveStartDate || studentInfo?.classStartDate || '',
        isPaused: false,
        status: 'present',
        isRecovery: false,
        projectedGlobalStatus: studentInfo?.globalStatus || 'activo',
        projectedMaintenance
      };
      const exists = (clase.students || []).some(studentEntry => studentEntry.id === studentInfo.id);
      clase.students = exists
        ? (clase.students || []).map(studentEntry => studentEntry.id === studentInfo.id ? { ...studentEntry, ...payload } : studentEntry)
        : [...(clase.students || []), payload];
    };

    [...pendingGestiones]
      .filter(gestion => PROJECTABLE_GESTION_TYPES.has(gestion.type))
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
      .forEach(gestion => {
        if (!gestion.studentId) return;
        const studentInfo = studentDataById.get(gestion.studentId) || {
          id: gestion.studentId,
          name: gestion.studentName || 'Alumno',
          email: gestion.studentEmail || '',
          globalStatus: 'activo'
        };

        if (gestion.type === 'baja') {
          const sourceClass = classById.get(gestion.sourceClassId);
          const hasScopedBaja = Boolean(gestion.sourceClassId || gestion.sourceClassLine);
          const isTotalBaja = isTotalBajaGestion(gestion);

          if (isTotalBaja) {
            studentStatusById.set(gestion.studentId, 'baja');
            projectedClasses.forEach(clase => {
              clase.students = (clase.students || []).filter(studentEntry => studentEntry.id !== gestion.studentId);
            });
            return;
          }

          if (hasScopedBaja && !sourceClass) {
            return;
          }

          if (hasScopedBaja && sourceClass) {
            sourceClass.students = (sourceClass.students || []).filter(studentEntry => studentEntry.id !== gestion.studentId);
            const remainingFixed = projectedClasses.filter(clase =>
              clase.id !== sourceClass.id &&
              !isPunctualClass(clase) &&
              (clase.students || []).some(studentEntry => studentEntry.id === gestion.studentId && isFixedClassStudent(studentEntry))
            );
            if (remainingFixed.length === 0) {
              studentStatusById.set(gestion.studentId, 'baja');
            }
            return;
          }

          studentStatusById.set(gestion.studentId, 'baja');
          projectedClasses.forEach(clase => {
            clase.students = (clase.students || []).filter(studentEntry => studentEntry.id !== gestion.studentId);
          });
          return;
        }

        if (gestion.type === 'mantenimiento') {
          const { from, until } = getMaintenancePeriodFromGestion(gestion);
          projectedClasses.forEach(clase => {
            clase.students = (clase.students || []).map(studentEntry =>
              studentEntry.id === gestion.studentId
                ? { ...studentEntry, isPaused: false, projectedMaintenance: true, projectedMaintenanceFrom: from, projectedMaintenanceUntil: until }
                : studentEntry
            );
          });
          return;
        }

        if (gestion.type === 'reactivar_plaza') {
          projectedClasses.forEach(clase => {
            clase.students = (clase.students || []).map(studentEntry =>
              studentEntry.id === gestion.studentId
                ? { ...studentEntry, isPaused: false, projectedMaintenance: false }
                : studentEntry
            );
          });
          return;
        }

        if (gestion.type === 'cambio_horario' || gestion.type === 'ampliar_clases') {
          const targetClass = classById.get(gestion.requestedClass);
          if (!targetClass) return;

          if (gestion.type === 'cambio_horario') {
            const sourceClass = classById.get(gestion.sourceClassId);
            const hasScopedChange = Boolean(gestion.sourceClassId || gestion.sourceClassLine);

            if (hasScopedChange && !sourceClass) {
              return;
            }

            if (hasScopedChange && sourceClass) {
              if (sourceClass.id !== targetClass.id) {
                sourceClass.students = (sourceClass.students || []).filter(studentEntry => studentEntry.id !== gestion.studentId);
              }
            } else {
              projectedClasses.forEach(clase => {
                if (clase.id === targetClass.id) return;
                if (clase.subject !== targetClass.subject) return;
                clase.students = (clase.students || []).filter(studentEntry => studentEntry.id !== gestion.studentId);
              });
            }
          }
          addStudentToProjectedClass(targetClass, studentInfo, gestion, false);
        }
      });

    return projectedClasses;
  }, [pendingGestiones, recurringClassesOnly, students, maintenancePeriods, nextMonthStartStr, nextMonthEndStr]);

  const punctualClassesForArchitectDate = useMemo(() => {
    const selectedDate = archDate || todayStr;
    return allClasses.filter(c => isPunctualClass(c) && c.date === selectedDate && isOperationalClass(c, todayStr));
  }, [allClasses, archDate, todayStr]);

  const architectClasses = useMemo(() => {
    const baseClasses = archProjectionMode === 'proyeccion' ? projectedPlanningClasses : recurringClassesOnly;
    const byId = new Map((baseClasses || []).map(clase => [clase.id, clase]));

    punctualClassesForArchitectDate.forEach(clase => {
      byId.set(clase.id, clase);
    });

    return [...byId.values()];
  }, [archProjectionMode, projectedPlanningClasses, recurringClassesOnly, punctualClassesForArchitectDate]);

  const isArchitectProjection = archProjectionMode === 'proyeccion';

  const sortDangerRows = (rows = []) => [...rows].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const sedeCompare = String(a.sede || '').localeCompare(String(b.sede || ''), 'es');
    if (sedeCompare !== 0) return sedeCompare;
    const teacherCompare = String(a.teacher || '').localeCompare(String(b.teacher || ''), 'es');
    if (teacherCompare !== 0) return teacherCompare;
    const dayCompare = Number(a.dayOfWeek || 0) - Number(b.dayOfWeek || 0);
    if (dayCompare !== 0) return dayCompare;
    return String(a.time || '').localeCompare(String(b.time || ''));
  });

  const dangerRows = useMemo(() => {
    const rows = recurringClassesOnly
      .map(clase => ({ classData: clase, ...clase, ...buildDangerClassAnalysis(clase, false) }))
      .filter(row => row.include);
    return sortDangerRows(rows);
  }, [recurringClassesOnly, students, maintenancePeriods, todayStr]);

  const projectedDangerRows = useMemo(() => {
    const rows = projectedPlanningClasses
      .map(clase => ({ classData: clase, ...clase, ...buildDangerClassAnalysis(clase, true) }))
      .filter(row => row.include);
    return sortDangerRows(rows);
  }, [projectedPlanningClasses, students, maintenancePeriods, todayStr]);

  const dangerRowsForView = dangerViewMode === 'proyeccion' ? projectedDangerRows : dangerRows;

  const groupDangerRows = (rows = [], mode = 'ocupacion') => {
    if (mode === 'profesor') return rows.reduce((acc, row) => {
      const key = row.teacher || 'Sin profesor';
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    if (mode === 'sede') return rows.reduce((acc, row) => {
      const key = row.sede || 'Tarragona';
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    if (mode === 'dia') {
      const dayOrder = [1, 2, 3, 4, 5, 6, 0];
      const grouped = {};
      dayOrder.forEach(dayNumber => {
        const dayRows = rows
          .filter(row => Number(row.dayOfWeek || 0) === dayNumber)
          .sort((a, b) => {
            const timeCompare = String(a.time || '').localeCompare(String(b.time || ''));
            if (timeCompare !== 0) return timeCompare;
            const sedeCompare = String(a.sede || '').localeCompare(String(b.sede || ''), 'es');
            if (sedeCompare !== 0) return sedeCompare;
            return String(a.teacher || '').localeCompare(String(b.teacher || ''), 'es');
          });
        if (dayRows.length > 0) grouped[getDayName(dayNumber)] = dayRows;
      });
      return grouped;
    }

    return rows.reduce((acc, row) => {
      const labels = {
        vacia: 'Vacías / hibernadas',
        solo_mantenimiento: 'Solo mantenimiento',
        critico: 'Críticas',
        revisar: 'Revisar'
      };
      const key = labels[row.statusKey] || row.statusLabel || 'Otros';
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});
  };

  const dangerContactRows = useMemo(() => {
    return dangerRowsForView
      .filter(row => row.statusKey === 'critico' && row.activeStudents.length > 0)
      .flatMap(row => row.activeStudents.map(student => ({
        key: `${row.id}-${student.id}`,
        studentName: student.displayName,
        email: student.email || 'sin email',
        classLine: `${row.subject || 'Clase'} · ${getDayName(row.dayOfWeek)} ${row.time || ''}h · ${row.sede || 'Tarragona'} · ${row.teacher || 'Sin profesor'}`,
        row
      })))
      .sort((a, b) => a.studentName.localeCompare(b.studentName, 'es'));
  }, [dangerRowsForView]);

  const teachersPayroll = useMemo(() => {
    const targetMonth = selectedPayrollMonth;
    const thisMonthRecords = allRecords.filter(r => (r.date || '').startsWith(targetMonth) && !r.isRenounced);
    const thisMonthAdjustments = payrollAdjustments.filter(a => a.month === targetMonth);
    const payroll = {};

    const ensureTeacher = (name) => {
      const teacherName = name || 'Desconocido';
      if (!payroll[teacherName]) payroll[teacherName] = { realHours: 0, adjustmentHours: 0, adjustments: [] };
      return teacherName;
    };

    (settings.teachersList || []).forEach(t => ensureTeacher(t));

    thisMonthRecords.forEach(r => {
      const tName = ensureTeacher(r.teacher);
      const duration = Number(String(r.duration).replace(',', '.')) || 60;
      payroll[tName].realHours += (duration / 60);
    });

    thisMonthAdjustments.forEach(a => {
      const tName = ensureTeacher(a.teacher);
      const hours = Number(String(a.hours).replace(',', '.')) || 0;
      payroll[tName].adjustmentHours += hours;
      payroll[tName].adjustments.push(a);
    });

    return Object.entries(payroll).map(([name, data]) => {
      const totalHours = data.realHours + data.adjustmentHours;
      return {
        name,
        realHours: data.realHours,
        adjustmentHours: data.adjustmentHours,
        totalHours,
        adjustments: data.adjustments,
        earnings: (totalHours * (settings.hourlyRate || 17.33)).toFixed(2)
      };
    }).filter(t => t.realHours !== 0 || t.adjustmentHours !== 0 || (settings.teachersList || []).includes(t.name))
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [allRecords, payrollAdjustments, settings.hourlyRate, settings.teachersList, selectedPayrollMonth]);

  const availableMboxSlotsAdmin = useMemo(() => {
    let slots = [];
    if (mboxAdminDate && mboxAdminSede) {
      const targetDay = new Date(`${mboxAdminDate}T00:00:00`).getDay();
      const allScheduledClasses = allClasses.filter(c => {
         if (c.date && c.date !== mboxAdminDate) return false;
         if (!c.date && c.dayOfWeek !== targetDay) return false;
         return (c.sede || 'Tarragona') === mboxAdminSede;
      });
      const aliveClasses = allScheduledClasses.filter(c => {
        if (c.cancelledDates?.includes(mboxAdminDate)) return false; 
        const exceptionsEseDia = c.exceptions?.[mboxAdminDate] || {};
        const activeStudents = (c.students || []).filter(s => {
          if (isStudentInMaintenance(s.id, mboxAdminDate)) return false;
          const estadoHoy = exceptionsEseDia[s.id];
          if (estadoHoy === 'absent' || estadoHoy === 'notified' || estadoHoy === 'notified_no_ticket') return false;
          return true;
        });
        return activeStudents.length > 0;
      });
      const activeTimes = [...new Set(aliveClasses.map(c => c.time))].sort();
      activeTimes.forEach(t => {
        const occupiedSalas = aliveClasses.filter(c => c.time === t).map(c => c.sala || 'Sala 1');
        const allSalas = ['Sala 1', 'Sala 2', 'Sala 3'];
        const freeSalas = allSalas.filter(s => !occupiedSalas.includes(s));
        freeSalas.forEach(fs => { slots.push({ time: t, sala: fs }); });
      });
    }
    return slots;
  }, [allClasses, maintenancePeriods, mboxAdminDate, mboxAdminSede]);


  // ==========================================
  // MODALES Y COMPONENTES
  // ==========================================

  const PayrollAdjustmentModalOverlay = () => {
    if (!payrollAdjustModal) return null;

    const [hours, setHours] = useState('1');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);

    const sign = payrollAdjustModal.mode === 'subtract' ? -1 : 1;
    const actionLabel = sign > 0 ? 'Sumar horas' : 'Restar horas';

    const handleSave = async () => {
      const parsedHours = Number(String(hours).replace(',', '.'));
      if (!parsedHours || parsedHours <= 0) return alert('Indica un número de horas mayor que cero.');
      if (!reason.trim()) return alert('El motivo es obligatorio para dejar trazabilidad.');

      setSaving(true);
      try {
        const adjustmentId = `adj-${selectedPayrollMonth}-${payrollAdjustModal.teacher}-${Date.now()}`.replace(/[^a-zA-Z0-9-_]/g, '_');
        await setDoc(doc(db, 'artifacts', appId, 'payrollAdjustments', adjustmentId), {
          teacher: payrollAdjustModal.teacher,
          month: selectedPayrollMonth,
          hours: sign * parsedHours,
          reason: reason.trim(),
          createdAt: new Date().toISOString(),
          createdBy: user?.email || 'admin'
        });
        alert('Ajuste de horas guardado.');
        setPayrollAdjustModal(null);
      } catch (e) {
        alert('Error al guardar el ajuste: ' + e.message);
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative">
          <button onClick={() => setPayrollAdjustModal(null)} disabled={saving} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full disabled:opacity-50"><X className="w-5 h-5"/></button>

          <div className="flex items-center gap-3 mb-6">
            <div className={`p-3 rounded-2xl ${sign > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
              {sign > 0 ? <Plus className="w-6 h-6"/> : <Minus className="w-6 h-6"/>}
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight">{actionLabel}</h2>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{payrollAdjustModal.teacher} · {selectedPayrollMonth}</p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-100 text-amber-900 p-4 rounded-2xl mb-6 text-xs font-bold leading-relaxed">
            Esto no modifica las clases ni las asistencias. Solo añade una corrección administrativa al cálculo mensual de profesores.
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Horas *</label>
              <input type="number" step="0.25" min="0.25" value={hours} onChange={e => setHours(e.target.value)} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-black text-sm outline-none focus:border-black" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Motivo *</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Ej: Clase firmada en papel no registrada / corrección por clase vacía de última hora..." className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl focus:border-black outline-none min-h-[120px] resize-y text-sm font-medium text-slate-700" />
            </div>
          </div>

          <button onClick={handleSave} disabled={saving} className={`w-full text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest shadow-md disabled:opacity-50 flex items-center justify-center gap-2 ${sign > 0 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
            {saving ? 'Guardando...' : actionLabel}
          </button>
        </div>
      </div>
    );
  };

  const NotesModalOverlay = () => {
    if (!notesModal) return null;
    const globalStudentInfo = students.find(s => s.id === notesModal.id);
    const [text, setText] = useState(globalStudentInfo?.internalNotes || '');
    const [saving, setSaving] = useState(false);
    const handleSave = async () => {
      setSaving(true);
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'students', notesModal.id), { internalNotes: text });
        alert('Notas internas guardadas.');
        setNotesModal(null);
      } catch (e) {
        alert('Error al guardar las notas.');
      } finally { setSaving(false); }
    };
    return (
      <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl relative">
          <button onClick={() => setNotesModal(null)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          <div className="flex items-center gap-3 text-indigo-600 mb-2"><FileText className="w-8 h-8" /><h2 className="text-xl font-black uppercase tracking-tight">Ficha Interna</h2></div>
          <p className="text-sm font-bold text-slate-800 mb-6 uppercase tracking-widest">{notesModal.name}</p>
          <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl mb-6">
            <p className="text-xs text-indigo-800 font-medium leading-relaxed">Este bloc de notas es privado y compartido entre todos los profesores y coordinación. Úsalo para anotar parentescos o estado del alumno.</p>
          </div>
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Ej: Es el hermano menor de Hugo..." className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl focus:border-indigo-500 outline-none min-h-[150px] resize-y text-sm font-medium text-slate-700 mb-6" />
          <div className="flex gap-4">
            <button onClick={() => setNotesModal(null)} className="flex-1 bg-zinc-100 text-zinc-600 font-black py-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-200 transition-colors">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 bg-indigo-600 text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-indigo-700 transition-all shadow-md disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar Notas'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const EditStudentModalOverlay = () => {
    if (!editStudentModal) return null;
    const [name, setName] = useState(editStudentModal.name || '');
    const [email, setEmail] = useState(editStudentModal.email || '');
    
    // 👇 FIX: Nuevos estados para el Alias ninja
    const [alias, setAlias] = useState(editStudentModal.alias || '');
    const [useAlias, setUseAlias] = useState(editStudentModal.useAlias || false);
    const [classStartDate, setClassStartDate] = useState(editStudentModal.classStartDate || '');
    
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
      if (!name.trim()) return alert("El nombre principal es obligatorio.");
      setSaving(true);
      try {
        const finalDisplayName = useAlias && alias.trim() ? alias.trim() : name.trim();
        const cleanClassStartDate = normalizeStudentClassStartDate(classStartDate);

        await updateDoc(doc(db, 'artifacts', appId, 'students', editStudentModal.id), { 
          name: name.trim(), 
          email: email.toLowerCase().trim(),
          alias: alias.trim(),
          useAlias: useAlias,
          classStartDate: cleanClassStartDate
        });
        
        const classesWithStudent = allClasses.filter(c => c.students && c.students.some(s => s.id === editStudentModal.id));
        const batch = writeBatch(db);
        classesWithStudent.forEach(c => {
          const updatedList = c.students.map(s => 
            s.id === editStudentModal.id
              ? { ...s, name: finalDisplayName, email: email.toLowerCase().trim(), classStartDate: cleanClassStartDate }
              : s
          );
          batch.update(doc(db, c.refPath), { students: updatedList });
        });
        await batch.commit();
        
        alert(cleanClassStartDate
          ? `Datos del alumno actualizados. No aparecerá en listas de asistencia hasta ${formatDateSpanish(cleanClassStartDate)} con el TeacherPortal actualizado.`
          : 'Datos del alumno actualizados en todo el sistema. Inicio de clases: inmediato.');
        setEditStudentModal(null);
      } catch (e) {
        alert('Error al actualizar: ' + e.message);
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-sm w-full p-8 shadow-2xl relative">
          <button onClick={() => setEditStudentModal(null)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          <div className="flex items-center gap-3 text-slate-800 mb-6">
            <Pencil className="w-8 h-8 text-black" />
            <h2 className="text-xl font-black uppercase tracking-tight">Editar Alumno</h2>
          </div>
          <div className="space-y-4 mb-6">
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Titular de la cuenta (Padre/Madre)</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-black transition-colors" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Correo Electrónico (Acceso App)</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vacio@sin-correo.com" className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-black transition-colors" />
              {!email && <p className="text-[10px] text-rose-500 font-bold mt-1">⚠️ Sin correo, el alumno no podrá entrar a la App.</p>}
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-emerald-600 mb-1 block flex items-center gap-1"><Calendar className="w-3 h-3"/> Fecha de inicio de las clases</label>
              <input
                type="date"
                value={classStartDate}
                onChange={e => setClassStartDate(e.target.value)}
                className="w-full p-3 bg-emerald-50/60 border-2 border-emerald-100 rounded-xl font-bold text-sm outline-none focus:border-emerald-500 transition-colors"
              />
              <p className="text-[10px] text-zinc-500 font-bold mt-1 leading-relaxed">Déjalo vacío para inicio inmediato. Si marcas una fecha futura, el alumno seguirá matriculado, pero TeacherPortal no debe mostrarlo en listas hasta ese día.</p>
              {classStartDate && (
                <button type="button" onClick={() => setClassStartDate('')} className="mt-2 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-black">Quitar fecha / inicio inmediato</button>
              )}
            </div>
            
            {/* 👇 FIX: Campos para el Alias ninja */}
            <div className="pt-4 border-t border-zinc-100 mt-4">
              <label className="text-[10px] font-black uppercase text-indigo-600 mb-1 block flex items-center gap-1"><User className="w-3 h-3"/> Nombre Real (Niño/a)</label>
              <input type="text" value={alias} onChange={e => setAlias(e.target.value)} placeholder="Ej: Hugo..." className="w-full p-3 bg-indigo-50/50 border-2 border-indigo-100 rounded-xl font-bold text-sm outline-none focus:border-indigo-500 transition-colors" />
              <label className="flex items-start gap-2 mt-3 cursor-pointer">
                <input type="checkbox" checked={useAlias} onChange={e => setUseAlias(e.target.checked)} className="mt-0.5 w-4 h-4 text-indigo-600 rounded" />
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest leading-tight">Sustituir el nombre del titular por este en todas las listas de clase de los profesores.</span>
              </label>
            </div>

          </div>
          <button onClick={handleSave} disabled={saving} className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-800 transition-all shadow-md disabled:opacity-50">
            {saving ? 'Guardando cambios...' : 'Guardar Datos'}
          </button>
        </div>
      </div>
    );
  };

  const EditWebModalOverlay = () => {
    if (!editWebModal) return null;
    const [formData, setFormData] = useState({
      isWebVisible: editWebModal.isWebVisible || false,
      tadosiUrl: editWebModal.tadosiUrl || '',
      startDate: editWebModal.startDate || '',
      price: editWebModal.price || '',
      cuotaBase: editWebModal.cuotaBase || 60, 
      publicDetails: editWebModal.publicDetails || '',
      whatsappGroupUrl: editWebModal.whatsappGroupUrl || ''
    });
    const [saving, setSaving] = useState(false);
    const handleSave = async () => {
      const cleanWhatsappUrl = normalizeAnnouncementUrl(formData.whatsappGroupUrl);
      if (cleanWhatsappUrl === null) return alert('La URL del grupo de WhatsApp debe empezar por https:// o http://');

      setSaving(true);
      try {
        await updateDoc(doc(db, editWebModal.refPath), {
          ...formData,
          whatsappGroupUrl: cleanWhatsappUrl || '',
          cuotaBase: Number(formData.cuotaBase) || 0
        });
        alert("Configuración web, informes y grupo de WhatsApp guardada correctamente.");
        setEditWebModal(null);
      } catch(e) { alert("Error al guardar: " + e.message); } finally { setSaving(false); }
    };
    return (
      <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">
          <button onClick={() => setEditWebModal(null)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          <div className="flex items-center gap-3 text-blue-600 mb-6">
            <Globe className="w-8 h-8" />
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight">Configurar Clase</h2>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{editWebModal.subject} • {getDayName(editWebModal.dayOfWeek)} {editWebModal.time}h</p>
            </div>
          </div>
          
          <div className="space-y-4 mb-8">
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl mb-6">
              <h4 className="text-[10px] font-black uppercase text-emerald-800 tracking-widest mb-3 flex items-center gap-1"><DollarSign className="w-4 h-4"/> Datos Internos (Informes)</h4>
              <div>
                <label className="text-[10px] font-black uppercase text-emerald-700 mb-1 block">Cuota Base Matemática (€) *</label>
                <input type="number" value={formData.cuotaBase} onChange={e => setFormData({...formData, cuotaBase: e.target.value})} placeholder="60" className="w-full p-3 bg-white border-2 border-emerald-100 rounded-xl font-black text-sm outline-none focus:border-emerald-500 transition-colors" />
                <p className="text-[9px] text-emerald-600 mt-1 font-bold">Se usa para calcular la rentabilidad en la pestaña Informes (Alumnos activos x Cuota = Ingresos).</p>
              </div>
            </div>

            <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-xl">
               <h4 className="text-[10px] font-black uppercase text-zinc-500 tracking-widest mb-3 flex items-center gap-1"><Globe className="w-4 h-4"/> Escaparate Web</h4>
               
               <div className="flex items-center justify-between mb-4 border-b border-zinc-200 pb-4">
                  <div>
                    <p className="text-sm font-black text-slate-800 uppercase">Visible en la Web</p>
                    <p className="text-[10px] font-bold text-zinc-500">Publica esta clase en WordPress.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={formData.isWebVisible} onChange={e => setFormData({...formData, isWebVisible: e.target.checked})} className="sr-only peer" />
                    <div className="w-11 h-6 bg-zinc-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
               </div>

               <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">URL de inscripción (Tadosi) *</label>
                    <input type="text" value={formData.tadosiUrl} onChange={e => setFormData({...formData, tadosiUrl: e.target.value})} placeholder="https://tadosi.com/..." className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Precio Display (Texto)</label>
                      <input type="text" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} placeholder="Ej: 60€/mes" className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Día exacto de Inicio</label>
                      <input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Detalle público adicional</label>
                    <textarea value={formData.publicDetails} onChange={e => setFormData({...formData, publicDetails: e.target.value})} placeholder="Ej: Nivel iniciación..." className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none min-h-[80px] focus:border-blue-500" />
                  </div>
               </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
              <h4 className="text-[10px] font-black uppercase text-emerald-700 tracking-widest mb-3 flex items-center gap-1"><Send className="w-4 h-4"/> Grupo de WhatsApp de la clase</h4>
              <label className="text-[10px] font-black uppercase text-emerald-700 mb-1 block">URL del grupo <span className="text-emerald-500">(opcional)</span></label>
              <input type="text" value={formData.whatsappGroupUrl} onChange={e => setFormData({...formData, whatsappGroupUrl: e.target.value})} placeholder="https://chat.whatsapp.com/..." className="w-full p-3 bg-white border-2 border-emerald-100 rounded-xl font-bold text-sm outline-none focus:border-emerald-500" />
              <p className="text-[9px] text-emerald-700 mt-1 font-bold leading-relaxed">Campo interno. Si se rellena, StudentPortal podrá mostrar el acceso al grupo específico de esta clase. Déjalo vacío en particulares o clases sin grupo.</p>
            </div>
          </div>
          <button onClick={handleSave} disabled={saving} className="w-full bg-blue-600 text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-all shadow-md disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar Configuración Web'}
          </button>
        </div>
      </div>
    );
  };


  const PhotosModalOverlay = () => {
    if (!photosModalOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative">
          <button onClick={() => setPhotosModalOpen(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          <div className="flex items-center gap-3 text-emerald-600 mb-4">
            <FileText className="w-8 h-8" />
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight">Fotos de Escuela</h2>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Actual o proyección con bandeja pendiente</p>
            </div>
          </div>

          <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 mb-6 text-xs font-bold text-slate-600 leading-relaxed">
            La proyección no modifica Firebase. Solo simula bajas, mantenimientos temporales, fines anticipados, cambios de horario y ampliaciones pendientes para ver cómo quedaría la escuela.
          </div>

          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => {
                handleDownloadSchoolSnapshot();
                setPhotosModalOpen(false);
              }}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 transition-colors"
            >
              <FileText className="w-4 h-4"/> Foto actual
            </button>
            <button
              onClick={() => {
                handleDownloadProjectedSchoolSnapshot();
                setPhotosModalOpen(false);
              }}
              className="w-full bg-black hover:bg-zinc-800 text-white px-5 py-4 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 transition-colors"
            >
              <Activity className="w-4 h-4"/> Proyección
            </button>
          </div>
        </div>
      </div>
    );
  };

  const SocialModalOverlay = () => {
    if (!socialModalText) return null;
    return (
      <div className="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative">
          <button onClick={() => setSocialModalText('')} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          <div className="flex items-center gap-3 text-indigo-600 mb-4">
            <Megaphone className="w-8 h-8" />
            <h2 className="text-xl font-black uppercase tracking-tight">Texto para Redes</h2>
          </div>
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Copiado directo listo para Instagram, FB o WhatsApp:</p>
          
          <textarea 
            readOnly 
            value={socialModalText} 
            className="w-full p-4 bg-zinc-900 text-zinc-100 font-sans text-xs rounded-2xl min-h-[220px] outline-none border-0 shadow-inner leading-relaxed select-all"
          />
          
          <div className="mt-6 flex gap-3">
            <button onClick={() => setSocialModalText('')} className="flex-1 bg-zinc-100 text-zinc-600 font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-200 transition-colors">Cerrar</button>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(socialModalText);
                alert("📋 ¡Texto copiado al portapapeles con éxito!");
              }} 
              className="flex-1 bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-800 transition-all shadow-md"
            >
              Copiar Todo
            </button>
          </div>
        </div>
      </div>
    );
  };

  const EditClassModalOverlay = () => {
    if (!editClassModal || !editClassData) return null;

    const isTeacherChanged = String(editClassData.teacher || '').trim() !== String(editClassModal.teacher || '').trim();

    return (
      <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-xl w-full p-8 shadow-2xl relative my-8">
          <button onClick={closeEditClassModal} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          <h2 className="text-xl font-black uppercase tracking-tight mb-2 flex items-center gap-2"><Pencil className="text-amber-600"/> Editar Clase</h2>
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-6">
            {editClassModal.subject} · {editClassModal.teacher} · {getDayName(editClassModal.dayOfWeek)} {editClassModal.time}h
          </p>

          {isTeacherChanged && (
            <div className="mb-5 p-4 bg-amber-50 border-2 border-amber-200 rounded-2xl text-amber-900">
              <p className="text-[10px] font-black uppercase tracking-widest mb-1">Cambio de profesor detectado</p>
              <p className="text-xs font-bold leading-relaxed">
                Al guardar, la clase se trasladará al TeacherPortal del nuevo profesor sin perder alumnos, excepciones ni configuración web.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Profesor asignado *</label>
              <select value={editClassData.teacher} onChange={e => setEditClassData({...editClassData, teacher: e.target.value})} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none">
                <option value="">Seleccionar...</option>
                {(settings.teachersList || []).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Instrumento *</label>
              <select value={editClassData.subject} onChange={e => setEditClassData({...editClassData, subject: e.target.value})} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none">
                <option value="">Seleccionar...</option>
                {(settings.instrumentos || defaultInstrumentos).map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>

          <div className="p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl mb-4">
            <div className="flex items-center gap-4 mb-4">
               <button onClick={() => setEditClassData({...editClassData, isRecurring: true})} className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest border-2 transition-all ${editClassData.isRecurring ? 'bg-black text-white border-black' : 'bg-white text-zinc-400 border-zinc-200'}`}>Recurrente</button>
               <button onClick={() => setEditClassData({...editClassData, isRecurring: false})} className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest border-2 transition-all ${!editClassData.isRecurring ? 'bg-black text-white border-black' : 'bg-white text-zinc-400 border-zinc-200'}`}>Puntual</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {editClassData.isRecurring ? (
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Día de la semana</label>
                  <select value={editClassData.dayOfWeek} onChange={e => setEditClassData({...editClassData, dayOfWeek: e.target.value})} className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none">
                    {[1,2,3,4,5,6].map(d => <option key={d} value={d}>{getDayName(d)}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-black uppercase text-rose-500 mb-1 block flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Fecha Exacta</label>
                  <input type="date" value={editClassData.specificDate} onChange={e => setEditClassData({...editClassData, specificDate: e.target.value})} className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none" />
                </div>
              )}
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Hora</label>
                <input type="time" value={editClassData.time} onChange={e => setEditClassData({...editClassData, time: e.target.value})} className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Sede</label>
                <select value={editClassData.sede} onChange={e => setEditClassData({...editClassData, sede: e.target.value})} className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none">
                  {SEDES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Sala</label>
              <select value={editClassData.sala} onChange={e => setEditClassData({...editClassData, sala: e.target.value})} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none">
                {SALAS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Aforo *</label>
              <input type="number" min="1" value={editClassData.capacity} onChange={e => setEditClassData({...editClassData, capacity: e.target.value})} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Duración min.</label>
              <input type="number" min="15" step="15" value={editClassData.duration} onChange={e => setEditClassData({...editClassData, duration: e.target.value})} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-emerald-600 mb-1 block">Cuota BI (€)</label>
              <input type="number" min="0" value={editClassData.cuotaBase} onChange={e => setEditClassData({...editClassData, cuotaBase: e.target.value})} className="w-full p-3 bg-emerald-50 border-2 border-emerald-200 rounded-xl font-black text-sm outline-none text-emerald-900" />
            </div>
          </div>

          <div className="mb-6">
            <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Notas internas</label>
            <textarea value={editClassData.notes} onChange={e => setEditClassData({...editClassData, notes: e.target.value})} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none min-h-[80px]" placeholder="Notas internas de la clase..." />
          </div>

          {editClassData.teacher && (editClassData.isRecurring ? editClassData.dayOfWeek : editClassData.specificDate) && (
           <div className="mb-4">
             <p className="text-[10px] font-bold text-blue-600 bg-blue-50 p-3 rounded-xl border border-blue-100 flex flex-col gap-1">
                <span className="uppercase tracking-widest text-blue-800">
                  Horas libres de {editClassData.teacher} el {getDayName(editClassData.isRecurring ? editClassData.dayOfWeek : new Date(editClassData.specificDate).getDay().toString())}:
                </span>
                <span className="font-black text-sm">
                  {availabilities[editClassData.teacher.toLowerCase()]?.[editClassData.isRecurring ? editClassData.dayOfWeek : new Date(editClassData.specificDate).getDay().toString()]?.length > 0 
                    ? availabilities[editClassData.teacher.toLowerCase()][editClassData.isRecurring ? editClassData.dayOfWeek : new Date(editClassData.specificDate).getDay().toString()].map(s => `${s.start}h a ${s.end}h`).join(' | ')
                    : 'Ninguna franja registrada.'}
                </span>
             </p>
           </div>
          )}

          <div className="flex gap-3">
            <button onClick={closeEditClassModal} className="flex-1 bg-zinc-100 text-zinc-600 py-4 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-zinc-200 transition-colors">
              Cancelar
            </button>
            <button onClick={handleSaveEditedClass} className="flex-[2] bg-black text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-zinc-800 transition-colors">
              Guardar Cambios
            </button>
          </div>
        </div>
      </div>
    );
  };

  const CreateClassModalOverlay = () => {
    if (!createClassModal) return null;
    return (
      <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-xl w-full p-8 shadow-2xl relative my-8">
          <button onClick={() => setCreateClassModal(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          <h2 className="text-xl font-black uppercase tracking-tight mb-6 flex items-center gap-2"><BookOpen className="text-indigo-600"/> Crear Clase Oficial</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Profesor asignado *</label>
              <select value={newClassData.teacher} onChange={e => setNewClassData({...newClassData, teacher: e.target.value})} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none">
                <option value="">Seleccionar...</option>
                {(settings.teachersList || []).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Instrumento *</label>
              <select value={newClassData.subject} onChange={e => setNewClassData({...newClassData, subject: e.target.value})} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none">
                <option value="">Seleccionar...</option>
                {(settings.instrumentos || defaultInstrumentos).map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>
          <div className="p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl mb-4">
            <div className="flex items-center gap-4 mb-4">
               <button onClick={() => setNewClassData({...newClassData, isRecurring: true})} className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest border-2 transition-all ${newClassData.isRecurring ? 'bg-black text-white border-black' : 'bg-white text-zinc-400 border-zinc-200'}`}>Recurrente</button>
               <button onClick={() => setNewClassData({...newClassData, isRecurring: false})} className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-widest border-2 transition-all ${!newClassData.isRecurring ? 'bg-black text-white border-black' : 'bg-white text-zinc-400 border-zinc-200'}`}>Puntual</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {newClassData.isRecurring ? (
                <div>
                  <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Día de la semana</label>
                  <select value={newClassData.dayOfWeek} onChange={e => setNewClassData({...newClassData, dayOfWeek: e.target.value})} className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none">
                    {[1,2,3,4,5,6].map(d => <option key={d} value={d}>{getDayName(d)}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-black uppercase text-rose-500 mb-1 block flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Fecha Exacta</label>
                  <input type="date" value={newClassData.specificDate} onChange={e => setNewClassData({...newClassData, specificDate: e.target.value})} className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none" />
                </div>
              )}
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Hora</label>
                <input type="time" value={newClassData.time} onChange={e => setNewClassData({...newClassData, time: e.target.value})} className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Sede</label>
                <select value={newClassData.sede} onChange={e => setNewClassData({...newClassData, sede: e.target.value})} className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none">
                  {SEDES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Sala</label>
              <select value={newClassData.sala} onChange={e => setNewClassData({...newClassData, sala: e.target.value})} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none">
                {SALAS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Aforo *</label>
              <input type="number" min="1" value={newClassData.capacity} onChange={e => setNewClassData({...newClassData, capacity: e.target.value})} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none" placeholder="Ej: 4" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-emerald-600 mb-1 block">Cuota Alumno (€)</label>
              <input type="number" min="0" value={newClassData.cuotaBase} onChange={e => setNewClassData({...newClassData, cuotaBase: e.target.value})} className="w-full p-3 bg-emerald-50 border-2 border-emerald-200 rounded-xl font-black text-sm outline-none text-emerald-900" placeholder="Ej: 60" />
            </div>
          </div>
          {newClassData.teacher && (newClassData.isRecurring ? newClassData.dayOfWeek : newClassData.specificDate) && (
           <div className="col-span-1 md:col-span-3 mt-[-10px] mb-4">
             <p className="text-[10px] font-bold text-blue-600 bg-blue-50 p-3 rounded-xl border border-blue-100 flex flex-col gap-1">
                <span className="uppercase tracking-widest text-blue-800">
                  Horas libres de {newClassData.teacher} el {getDayName(newClassData.isRecurring ? newClassData.dayOfWeek : new Date(newClassData.specificDate).getDay().toString())}:
                </span>
                <span className="font-black text-sm">
                  {availabilities[newClassData.teacher.toLowerCase()]?.[newClassData.isRecurring ? newClassData.dayOfWeek : new Date(newClassData.specificDate).getDay().toString()]?.length > 0 
                    ? availabilities[newClassData.teacher.toLowerCase()][newClassData.isRecurring ? newClassData.dayOfWeek : new Date(newClassData.specificDate).getDay().toString()].map(s => `${s.start}h a ${s.end}h`).join(' | ')
                    : 'Ninguna franja registrada.'}
                </span>
             </p>
           </div>
          )}
          <button onClick={handleCreateGlobalClass} className="w-full bg-black text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-zinc-800 transition-colors">
            {newClassData.isRecurring ? 'Registrar Clase Oficial' : 'Programar Clase Extraordinaria'}
          </button>
        </div>
      </div>
    );
  };

  const ChangeClassModalOverlay = () => {
    if (!changeClassModal) return null;
    const student = changeClassModal;
    const targetInstrument = selectedInstForChange || (student.instruments && student.instruments[0]);
    const availableClasses = targetInstrument ? recurringClassesOnly.filter(c => c.subject === targetInstrument && getCommercialFreeSpots(c) > 0) : [];
    return (
      <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative my-8">
          <button onClick={() => setChangeClassModal(null)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          <div className="flex items-center gap-3 mb-6"><ArrowRightLeft className="w-8 h-8 text-blue-600"/><h2 className="text-xl font-black uppercase">Cambiar de Grupo</h2></div>
          <p className="text-xs text-zinc-500 font-bold mb-4 uppercase tracking-widest">Alumno: <span className="text-black">{student.name}</span></p>
          <select value={selectedInstForChange} onChange={e => setSelectedInstForChange(e.target.value)} className="w-full p-3 mb-4 bg-zinc-50 border-2 rounded-xl font-bold text-sm">
            <option value="">Selecciona Instrumento...</option>
            {(settings.instrumentos || defaultInstrumentos).map(i => <option key={i} value={i}>{i}</option>)}
          </select>
          <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
            {availableClasses.length === 0 ? (
              <p className="text-center text-xs text-zinc-400 font-bold p-4 border-2 border-dashed rounded-xl">No hay grupos libres para este instrumento.</p>
            ) : (
              availableClasses.map(c => (
                <div key={c.id} onClick={() => executeDirectClassChange(student, c)} className="p-3 rounded-xl border-2 border-zinc-100 hover:border-blue-500 cursor-pointer transition-colors">
                  <div className="flex justify-between font-black text-sm uppercase"><span>{getDayName(c.dayOfWeek)}</span><span>{c.time}h</span></div>
                  <div className="text-xs text-zinc-500 mt-1 flex justify-between"><span>Prof: {c.teacher}</span> <span className="text-blue-600 font-bold">{getCommercialFreeSpots(c)} plazas libres fijas</span></div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  const ResurrectClassModalOverlay = () => {
    if (!resurrectClassModal) return null;
    const [searchName, setSearchName] = useState('');
    const [email, setEmail] = useState('');
    const [classStartDateInput, setClassStartDateInput] = useState(() => isPunctualClass(resurrectClassModal) ? todayStr : getNextClassDateForDay(resurrectClassModal.dayOfWeek, todayStr));
    const [saving, setSaving] = useState(false);
    const matchedStudentForResurrect = students.find(s =>
      s.name.toLowerCase() === searchName.trim().toLowerCase() ||
      (email && s.email === email.trim().toLowerCase())
    );
    const willCreateStudentForResurrect = Boolean(searchName.trim()) && !matchedStudentForResurrect;
    const showClassStartDateForResurrect = willCreateStudentForResurrect && !isPunctualClass(resurrectClassModal);
    const classStartDateWarningForResurrect = showClassStartDateForResurrect
      ? getClassStartDateWarning(classStartDateInput, resurrectClassModal.dayOfWeek, todayStr)
      : '';
    const handleResurrect = async () => {
      if (!searchName.trim()) return alert("Debes escribir el nombre del alumno.");
      setSaving(true);
      try {
        let studentId;
        let existingStudent = students.find(s =>
          s.name.toLowerCase() === searchName.trim().toLowerCase() ||
          (email && s.email === email.trim().toLowerCase())
        );

        let displayName = searchName.trim();
        if (existingStudent && existingStudent.useAlias && existingStudent.alias) {
          displayName = existingStudent.alias;
        }

        let createdNow = false;
        if (existingStudent) {
          studentId = existingStudent.id;
        } else {
          createdNow = true;
          studentId = Date.now().toString();
        }

        const selectedClassStartDate = createdNow && !isPunctualClass(resurrectClassModal)
          ? normalizeStudentClassStartDate(classStartDateInput)
          : '';
        if (createdNow && !isPunctualClass(resurrectClassModal) && !selectedClassStartDate) {
          alert('Elige la fecha de inicio de las clases.');
          setSaving(false);
          return;
        }
        const startDateWarning = createdNow && !isPunctualClass(resurrectClassModal)
          ? getClassStartDateWarning(selectedClassStartDate, resurrectClassModal.dayOfWeek, todayStr)
          : '';
        if (startDateWarning && !window.confirm(`⚠️ Revisa la fecha de inicio:

${startDateWarning}

¿Quieres continuar igualmente?`)) {
          setSaving(false);
          return;
        }
        const classStartDateForClass = createdNow
          ? selectedClassStartDate
          : normalizeStudentClassStartDate(existingStudent?.classStartDate || '');

        if (existingStudent) {
          const studentUpdate = {
            email: existingStudent.email || email.trim().toLowerCase(),
            updatedAt: new Date().toISOString()
          };
          await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), studentUpdate);
        } else {
          await setDoc(doc(db, 'artifacts', appId, 'students', studentId), {
            name: searchName.trim(),
            email: email.trim().toLowerCase(),
            globalStatus: 'activo',
            claimed: false,
            instruments: [resurrectClassModal.subject],
            classes: [resurrectClassModal.id],
            hasMitobox: false,
            hasMitoverso: false,
            triviaPoints: 0,
            triviaVictories: 0,
            internalNotes: 'Añadido al reactivar grupo',
            classStartDate: selectedClassStartDate
          });
        }
        const newStudentPayload = {
          id: studentId,
          name: displayName,
          email: existingStudent ? (existingStudent.email || email.trim().toLowerCase()) : email.trim().toLowerCase(),
          classStartDate: classStartDateForClass,
          isPaused: false,
          status: 'present',
          isRecovery: false
        };
        const targetPath = doc(db, resurrectClassModal.refPath);
        const updatedStudents = [...(resurrectClassModal.students || []), newStudentPayload];
        await updateDoc(targetPath, { students: updatedStudents });

        let initialEmailSent = false;
        if (!isPunctualClass(resurrectClassModal)) {
          await sendTeacherNotification({
            teacherName: resurrectClassModal.teacher,
            subject: `Nuevo alumno fijo: ${displayName} (${resurrectClassModal.subject})`,
            body: buildNewFixedStudentTeacherEmailBody({
              teacherName: resurrectClassModal.teacher,
              displayName,
              classData: resurrectClassModal,
              classStartDate: classStartDateForClass,
              contextLabel: 'al reactivar tu grupo'
            })
          });

          initialEmailSent = await sendInitialClassAssignmentEmailIfNeeded({
            studentId,
            existingStudent,
            createdNow,
            studentName: searchName.trim(),
            studentEmail: existingStudent ? (existingStudent.email || email.trim().toLowerCase()) : email.trim().toLowerCase(),
            classData: resurrectClassModal,
            classStartDate: selectedClassStartDate
          });
        }

        alert(isPunctualClass(resurrectClassModal)
          ? "✅ Alumno añadido a clase puntual. No se han enviado correos de alumno fijo."
          : createdNow
            ? `🎉 ¡Clase reactivada con alumno nuevo! Fecha de inicio: ${formatDateSpanish(selectedClassStartDate)}. El profesor ha sido avisado por correo.${initialEmailSent ? ' El alumno ha recibido el email de plaza confirmada.' : ' No se ha enviado email al alumno porque no hay email válido o ya constaba enviado.'}`
            : `🎉 ¡Clase reactivada! Alumno existente añadido. El profesor ha sido avisado por correo. No se ha enviado email al alumno porque no es alta inicial.`);
        setResurrectClassModal(null);
      } catch (e) {
        alert("Error al reactivar: " + e.message);
      } finally {
        setSaving(false);
      }
    };
    return (
      <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-sm w-full p-8 shadow-2xl relative">
          <button onClick={() => setResurrectClassModal(null)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          <div className="flex items-center gap-3 text-indigo-600 mb-6">
            <PlusCircle className="w-8 h-8" />
            <h2 className="text-xl font-black uppercase tracking-tight">Reactivar Grupo</h2>
          </div>
          <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl mb-6 text-indigo-800 text-xs font-medium">
            Al añadir un alumno, esta clase saldrá del modo hibernación automáticamente.
          </div>
          <div className="space-y-4 mb-6 relative">
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Nombre del alumno *</label>
              <input 
                type="text" 
                value={searchName} 
                onChange={e => setSearchName(e.target.value)} 
                placeholder="Escribe para buscar o crear..."
                className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-indigo-500 transition-colors" 
              />
              {searchName.length >= 2 && (
                <div className="absolute left-0 right-0 mt-1 bg-white border-2 border-zinc-800 rounded-xl shadow-2xl z-50 max-h-40 overflow-y-auto">
                  {students.filter(s => s.name.toLowerCase().includes(searchName.trim().toLowerCase())).length === 0 ? (
                    <div className="p-3 text-xs font-bold text-zinc-500 bg-zinc-50">Se creará como alumno nuevo.</div>
                  ) : (
                    students.filter(s => s.name.toLowerCase().includes(searchName.trim().toLowerCase())).map(st => (
                      <div key={st.id} onClick={() => setSearchName(st.name)} className="p-3 text-sm font-bold text-slate-700 hover:bg-black hover:text-white cursor-pointer border-b border-zinc-100 transition-colors">
                        {st.name}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Correo Electrónico (Opcional)</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Solo si es alumno nuevo" className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-indigo-500 transition-colors" />
            </div>
            {showClassStartDateForResurrect && (
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                <label className="text-[10px] font-black uppercase text-emerald-700 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3"/> Fecha de inicio de las clases *</label>
                <input
                  type="date"
                  value={classStartDateInput}
                  onChange={e => setClassStartDateInput(e.target.value)}
                  className="w-full p-3 bg-white border-2 border-emerald-200 rounded-xl font-black text-sm outline-none focus:border-emerald-500"
                />
                {classStartDateInput && (
                  <p className="mt-2 text-xs font-bold text-emerald-800">Empieza: {formatDateWithWeekday(classStartDateInput)}</p>
                )}
                {classStartDateWarningForResurrect && (
                  <p className="mt-2 text-[10px] font-black text-amber-700 uppercase tracking-wide">⚠️ {classStartDateWarningForResurrect}</p>
                )}
                <p className="mt-2 text-[10px] font-bold text-zinc-500 leading-relaxed">Solo se pide para alumnos completamente nuevos. Por defecto se propone el próximo día real de esta clase: {getDayName(resurrectClassModal.dayOfWeek)}.</p>
              </div>
            )}
          </div>
          <button onClick={handleResurrect} disabled={saving || !searchName} className="w-full bg-indigo-600 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-indigo-700 transition-all shadow-md disabled:opacity-50">
            {saving ? 'Guardando...' : 'Reactivar Clase'}
          </button>
        </div>
      </div>
    );
  };

  const ViewClassModalOverlay = () => {
    if (!viewClassModal) return null;
    const c = viewClassModal;
    const [searchName, setSearchName] = useState('');
    const [emailInput, setEmailInput] = useState('');
    const [classStartDateInput, setClassStartDateInput] = useState(() => isPunctualClass(c) ? todayStr : getNextClassDateForDay(c.dayOfWeek, todayStr));
    const [saving, setSaving] = useState(false);
    const maxCap = parseInt(c.capacity, 10) || 0;
    const planningStudents = getClassStudentPlanningData(c, isArchitectProjection, archDate || todayStr);
    const currentCount = planningStudents.length;
    const activeCount = planningStudents.filter(student => student.isActive).length;
    const maintenanceCount = planningStudents.filter(student => student.isMaintenance).length;
    const futureStartCount = planningStudents.filter(student => student.isFutureStart).length;
    const relocatedCount = planningStudents.filter(student => student.isRelocated).length;
    const isFull = maxCap > 0 && currentCount >= maxCap;
    const isPunctual = isPunctualClass(c);
    const matchedStudentForAdd = students.find(s =>
      s.name.toLowerCase() === searchName.trim().toLowerCase() ||
      (emailInput && s.email === emailInput.trim().toLowerCase())
    );
    const willCreateStudentForAdd = Boolean(searchName.trim()) && !matchedStudentForAdd;
    const showClassStartDateForAdd = willCreateStudentForAdd && !isPunctual;
    const classStartDateWarningForAdd = showClassStartDateForAdd
      ? getClassStartDateWarning(classStartDateInput, c.dayOfWeek, todayStr)
      : '';

    const handleAddStudent = async () => {
      if (!searchName.trim()) return alert("Debes escribir el nombre del alumno.");
      if (isFull) {
        if (!window.confirm(`⚠️ AVISO MODO DIOS:\n\nEl aforo de esta clase está completo (${currentCount}/${maxCap}).\n¿Quieres forzar la matriculación saltándote el límite?`)) return;
      }
      setSaving(true);
      try {
        let studentId;
        let existingStudent = students.find(s =>
          s.name.toLowerCase() === searchName.trim().toLowerCase() ||
          (emailInput && s.email === emailInput.trim().toLowerCase())
        );

        let displayName = searchName.trim();
        if (existingStudent && existingStudent.useAlias && existingStudent.alias) {
          displayName = existingStudent.alias;
        }

        let createdNow = false;
        if (existingStudent) {
          studentId = existingStudent.id;
        } else {
          createdNow = true;
          studentId = Date.now().toString();
        }

        const selectedClassStartDate = createdNow && !isPunctual
          ? normalizeStudentClassStartDate(classStartDateInput)
          : '';
        if (createdNow && !isPunctual && !selectedClassStartDate) {
          alert('Elige la fecha de inicio de las clases.');
          setSaving(false);
          return;
        }
        const startDateWarning = createdNow && !isPunctual
          ? getClassStartDateWarning(selectedClassStartDate, c.dayOfWeek, todayStr)
          : '';
        if (startDateWarning && !window.confirm(`⚠️ Revisa la fecha de inicio:

${startDateWarning}

¿Quieres continuar igualmente?`)) {
          setSaving(false);
          return;
        }
        const classStartDateForClass = createdNow
          ? selectedClassStartDate
          : normalizeStudentClassStartDate(existingStudent?.classStartDate || '');

        if (existingStudent) {
          const studentUpdate = {
            email: existingStudent.email || emailInput.trim().toLowerCase(),
            updatedAt: new Date().toISOString()
          };
          await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), studentUpdate);
        } else {
          await setDoc(doc(db, 'artifacts', appId, 'students', studentId), {
            name: searchName.trim(),
            email: emailInput.trim().toLowerCase(),
            globalStatus: 'activo',
            claimed: false,
            instruments: [c.subject],
            classes: [c.id],
            hasMitobox: false,
            hasMitoverso: false,
            triviaPoints: 0,
            triviaVictories: 0,
            internalNotes: 'Añadido desde panel de clase',
            classStartDate: selectedClassStartDate
          });
        }
        const newStudentPayload = {
          id: studentId,
          name: displayName,
          email: existingStudent ? (existingStudent.email || emailInput.trim().toLowerCase()) : emailInput.trim().toLowerCase(),
          classStartDate: classStartDateForClass,
          isPaused: false,
          status: 'present',
          isRecovery: false
        };
        const targetPath = doc(db, c.refPath);
        const updatedStudents = [...(c.students || []), newStudentPayload];
        await updateDoc(targetPath, { students: updatedStudents });

        let initialEmailSent = false;
        if (!isPunctual) {
          await sendTeacherNotification({
            teacherName: c.teacher,
            subject: `Nuevo alumno fijo: ${displayName} (${c.subject})`,
            body: buildNewFixedStudentTeacherEmailBody({
              teacherName: c.teacher,
              displayName,
              classData: c,
              classStartDate: classStartDateForClass,
              contextLabel: 'en tu clase'
            })
          });

          initialEmailSent = await sendInitialClassAssignmentEmailIfNeeded({
            studentId,
            existingStudent,
            createdNow,
            studentName: searchName.trim(),
            studentEmail: existingStudent ? (existingStudent.email || emailInput.trim().toLowerCase()) : emailInput.trim().toLowerCase(),
            classData: c,
            classStartDate: selectedClassStartDate
          });
        }

        alert(isPunctual
          ? `✅ Alumno añadido a clase puntual. No se han enviado correos de alumno fijo.`
          : createdNow
            ? `✅ Alumno nuevo añadido. Fecha de inicio: ${formatDateSpanish(selectedClassStartDate)}. Profesor avisado por correo.${initialEmailSent ? ' Alumno avisado por email de plaza confirmada.' : ' No se ha enviado email al alumno porque no hay email válido o ya constaba enviado.'}`
            : `✅ Alumno existente añadido. Profesor avisado por correo. No se ha enviado email al alumno porque no es alta inicial.`);
        setSearchName('');
        setEmailInput('');
        setClassStartDateInput(isPunctual ? todayStr : getNextClassDateForDay(c.dayOfWeek, todayStr));
      } catch (e) {
        alert("Error al matricular: " + e.message);
      } finally {
        setSaving(false);
      }
    };
    return (
      <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
        <div className="bg-white rounded-3xl max-w-xl w-full p-8 shadow-2xl relative max-h-[90vh] flex flex-col">
          <button onClick={() => setViewClassModal(null)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          
          <button onClick={() => handleDeleteClassGlobal(c)} className="absolute top-4 right-14 text-red-500 hover:text-white hover:bg-red-500 bg-red-50 p-2 rounded-full transition-colors" title="Borrar Clase DEFINITIVAMENTE"><Trash2 className="w-5 h-5"/></button>

          <div className="flex items-center gap-3 mb-6 shrink-0">
            <BookOpen className="w-8 h-8 text-indigo-600"/>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight">Gestión de Clase</h2>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{c.subject} • {c.teacher} • {getDayName(c.dayOfWeek)} {c.time}h</p>
            </div>
          </div>
          <div className="mb-6 p-4 bg-zinc-50 border border-zinc-200 rounded-2xl shrink-0">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-3">Añadir Alumno al Grupo</h3>
            <div className="flex flex-col sm:flex-row gap-2 relative">
              <div className="flex-1 relative">
                <input 
                  type="text" 
                  value={searchName} 
                  onChange={e => setSearchName(e.target.value)} 
                  placeholder="Nombre..."
                  className="w-full p-3 bg-white border border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-indigo-500" 
                />
                {searchName.length >= 2 && (
                  <div className="absolute left-0 right-0 mt-1 bg-white border-2 border-zinc-800 rounded-xl shadow-2xl z-50 max-h-40 overflow-y-auto">
                    {students.filter(s => s.name.toLowerCase().includes(searchName.trim().toLowerCase())).length === 0 ? (
                      <div className="p-3 text-xs font-bold text-zinc-500 bg-zinc-50">Crear alumno nuevo.</div>
                    ) : (
                      students.filter(s => s.name.toLowerCase().includes(searchName.trim().toLowerCase())).map(st => (
                        <div key={st.id} onClick={() => setSearchName(st.name)} className="p-3 text-sm font-bold text-slate-700 hover:bg-black hover:text-white cursor-pointer border-b border-zinc-100 transition-colors">
                          {st.name}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
              <input 
                type="email" 
                value={emailInput} 
                onChange={e => setEmailInput(e.target.value)} 
                placeholder="Email..."
                className="flex-1 p-3 bg-white border border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-indigo-500" 
              />
              <button 
                onClick={handleAddStudent} 
                disabled={saving || !searchName} 
                className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-indigo-700 transition-all disabled:opacity-50"
              >
                {saving ? '...' : 'Añadir'}
              </button>
            </div>
            {showClassStartDateForAdd && (
              <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                <label className="text-[10px] font-black uppercase text-emerald-700 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3"/> Fecha de inicio de las clases *</label>
                <input
                  type="date"
                  value={classStartDateInput}
                  onChange={e => setClassStartDateInput(e.target.value)}
                  className="w-full p-3 bg-white border-2 border-emerald-200 rounded-xl font-black text-sm outline-none focus:border-emerald-500"
                />
                {classStartDateInput && (
                  <p className="mt-2 text-xs font-bold text-emerald-800">Empieza: {formatDateWithWeekday(classStartDateInput)}</p>
                )}
                {classStartDateWarningForAdd && (
                  <p className="mt-2 text-[10px] font-black text-amber-700 uppercase tracking-wide">⚠️ {classStartDateWarningForAdd}</p>
                )}
                <p className="mt-2 text-[10px] font-bold text-zinc-500 leading-relaxed">Solo se pide para alumnos completamente nuevos. Por defecto se propone el próximo día real de esta clase: {getDayName(c.dayOfWeek)}.</p>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-2">
              Alumnos Matriculados ({currentCount}/{c.capacity}) · Activos: {activeCount}
              {(maintenanceCount > 0 || futureStartCount > 0 || relocatedCount > 0) && (
                <span className="block mt-1 text-[10px] text-zinc-500">
                  {maintenanceCount > 0 ? `${maintenanceCount} en mantenimiento` : ''}{maintenanceCount > 0 && (futureStartCount > 0 || relocatedCount > 0) ? ' · ' : ''}{futureStartCount > 0 ? `${futureStartCount} con inicio futuro` : ''}{futureStartCount > 0 && relocatedCount > 0 ? ' · ' : ''}{relocatedCount > 0 ? `${relocatedCount} recolocado(s)` : ''}
                </span>
              )}
            </h3>
            {(planningStudents.length === 0) ? (
              <div className="p-4 bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-xl text-center text-xs font-bold text-zinc-400 uppercase tracking-widest">
                Clase vacía (Hibernada)
              </div>
            ) : (
              planningStudents.map(s => {
                const statusTags = [
                  s.isMaintenance ? 'Mantenimiento' : '',
                  s.isFutureStart ? `Inicio: ${formatDateSpanish(s.startDate)}` : '',
                  s.isRelocated ? 'Recolocado temporal' : '',
                  s.status === 'baja' ? 'Baja' : ''
                ].filter(Boolean);
                return (
                  <div key={`${s.id}-${s.isRelocated ? 'reloc' : 'base'}`} className={`flex items-center justify-between p-3 bg-white border shadow-sm rounded-xl hover:border-indigo-200 transition-colors ${s.isActive ? 'border-zinc-200' : 'border-dashed border-zinc-300 opacity-80'}`}>
                    <div>
                      <p className={`font-bold text-sm ${s.isActive ? 'text-slate-800' : 'text-zinc-400 line-through'}`}>{s.displayName}</p>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{s.email || 'Sin email'}</p>
                      {statusTags.length > 0 && (
                        <p className="text-[9px] text-indigo-500 font-black uppercase tracking-widest mt-1">{statusTags.join(' · ')}</p>
                      )}
                    </div>
                    {!s.isRelocated && (
                      <button onClick={() => handleRemoveFromSpecificClass(c, s.id, s.displayName)} className="p-2 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-colors" title="Expulsar SOLO de esta clase">
                        <UserMinus className="w-4 h-4"/>
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center font-black uppercase tracking-widest">Iniciando Modo Dios...</div>;

  return (
    <div className="min-h-screen bg-zinc-100 font-sans text-slate-800 flex flex-col md:flex-row">
      {editWebModal && <StableModalRenderer key={`edit-web-${editWebModal.id || editWebModal.refPath || 'open'}`} render={EditWebModalOverlay} />}
      {editClassModal && <StableModalRenderer key={`edit-class-${editClassModal.id || 'open'}`} render={EditClassModalOverlay} />}
      {createClassModal && <StableModalRenderer key="create-class" render={CreateClassModalOverlay} />}
      <ManualTaskModalOverlay
        open={manualTaskModal}
        onClose={() => setManualTaskModal(false)}
        settings={settings}
        recurringClassesOnly={recurringClassesOnly}
        getTeacherEmail={getTeacherEmail}
        db={db}
        appId={appId}
        user={user}
      />
      {payrollAdjustModal && <StableModalRenderer key={`payroll-${payrollAdjustModal.teacher || 'teacher'}-${payrollAdjustModal.mode || 'mode'}`} render={PayrollAdjustmentModalOverlay} />}
      {notesModal && <StableModalRenderer key={`notes-${notesModal.id || 'open'}`} render={NotesModalOverlay} />}
      {changeClassModal && <StableModalRenderer key={`change-class-${changeClassModal.id || 'open'}`} render={ChangeClassModalOverlay} />}
      {editStudentModal && <StableModalRenderer key={`edit-student-${editStudentModal.id || 'open'}`} render={EditStudentModalOverlay} />} 
      <TemporaryRelocationModalOverlay
        student={temporaryRelocationModal}
        onClose={() => setTemporaryRelocationModal(null)}
        recurringClassesOnly={recurringClassesOnly}
        temporaryRelocations={temporaryRelocations}
        getStudentAssignedClasses={getStudentAssignedClasses}
        getStudentTemporaryRelocations={getStudentTemporaryRelocations}
        getCommercialCommittedSeatCount={getCommercialCommittedSeatCount}
        isTemporaryRelocationActiveForDate={isTemporaryRelocationActiveForDate}
        doDateRangesOverlap={doDateRangesOverlap}
        formatClassLine={formatClassLine}
        sendTeacherNotification={sendTeacherNotification}
        sendStudentNotification={sendStudentNotification}
        db={db}
        appId={appId}
        user={user}
        todayStr={todayStr}
      />
      {resurrectClassModal && <StableModalRenderer key={`resurrect-${resurrectClassModal.id || 'open'}`} render={ResurrectClassModalOverlay} />}
      {viewClassModal && <StableModalRenderer key={`view-class-${viewClassModal.id || 'open'}`} render={ViewClassModalOverlay} />}
      {photosModalOpen && <StableModalRenderer key="photos" render={PhotosModalOverlay} />}
      {socialModalText && <StableModalRenderer key="social-text" render={SocialModalOverlay} />}
      
      <aside className="w-full md:w-64 bg-zinc-950 text-zinc-300 flex flex-col sticky top-0 z-50 md:h-screen shrink-0 shadow-2xl overflow-y-auto">
        <div className="p-6 bg-black border-b border-zinc-900 flex justify-between items-center md:block">
          <div>
            <div className="flex items-center gap-3 text-white mb-1"><ShieldAlert className="w-6 h-6 text-red-500" /><h1 className="text-xl font-black uppercase tracking-tight">Modo Dios</h1></div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hidden md:block">Panel de Administración</p>
          </div>
          <button onClick={switchToTeacher} className="md:hidden bg-zinc-800 text-white p-2 rounded-lg"><ArrowRightLeft className="w-5 h-5"/></button>
        </div>
        <nav className="flex-1 flex md:flex-col p-4 gap-1 no-scrollbar overflow-x-auto md:overflow-visible">
          {[
            { id: 'gestiones', icon: Inbox, label: 'Bandeja', count: totalPendingInbox },
            { id: 'students', icon: Users, label: 'Alumnos (CRM)' },
            { id: 'mitobox', icon: DoorOpen, label: 'Mitobox' }, 
            { id: 'classes', icon: BookOpen, label: 'Clases Globales' },
            { id: 'danger', icon: AlertTriangle, label: 'En Peligro' },
            { id: 'teachers', icon: Calculator, label: 'Profesores' },
            { id: 'announcements', icon: Megaphone, label: 'Tablón' },
            { id: 'gamification', icon: Trophy, label: 'Retos' },
            { id: 'informes', icon: TrendingUp, label: 'Informes (BI)' }, 
            { id: 'settings', icon: Settings, label: 'Configuración' }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap md:whitespace-normal text-left ${activeTab === tab.id ? 'bg-red-600 text-white shadow-lg' : 'hover:bg-zinc-900 hover:text-white'}`}>
              <tab.icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{tab.label}</span>
              {tab.count > 0 && <span className="bg-white text-red-600 px-2 py-0.5 rounded-full text-[10px] font-black">{tab.count}</span>}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-zinc-900 hidden md:block space-y-2">
          <button onClick={switchToTeacher} className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white p-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-colors">
            <ArrowRightLeft className="w-4 h-4"/> Vista Profesor
          </button>
          <button onClick={logout} className="w-full flex items-center justify-center gap-2 text-zinc-500 hover:text-red-400 p-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-colors">
            <LogOut className="w-4 h-4"/> Cerrar Sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-4 md:p-8 max-w-7xl mx-auto w-full">
        
        {isLastDayOfMonth && (
          <div className="mb-6 bg-gradient-to-r from-amber-400 to-amber-500 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4 animate-pulse">
            <div className="flex items-center gap-3 text-amber-950">
              <AlertTriangle className="w-6 h-6" />
              <div>
                <p className="font-black uppercase tracking-widest text-sm">Hoy es el último día del mes</p>
                <p className="text-xs font-bold opacity-80">Recuerda ir a la pestaña "Retos" y hacer clic en Cerrar Mes para el Trivial.</p>
              </div>
            </div>
            <button onClick={() => setActiveTab('gamification')} className="bg-amber-950 text-amber-400 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-black transition-colors whitespace-nowrap">
              Ir a cerrar mes
            </button>
          </div>
        )}

        {/* --- PESTAÑA: INFORMES (BUSINESS INTELLIGENCE) --- */}
        {activeTab === 'informes' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Business Intelligence</h2>
                <p className="text-zinc-500 font-bold text-sm mt-1 uppercase tracking-widest">Información estratégica y análisis de márgenes</p>
              </div>
              <button onClick={handleDownloadBIReport} className="w-full sm:w-auto bg-slate-900 hover:bg-black text-white px-5 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 transition-colors">
                <FileText className="w-4 h-4"/> Generar informe
              </button>
            </header>

            {/* SELECTOR DE SUBVISTAS FINANCIERAS */}
            <div className="flex bg-zinc-200 p-1 rounded-2xl w-full max-w-2xl shadow-sm border border-zinc-300 overflow-x-auto no-scrollbar mb-6">
              {[
                { id: 'resumen', label: 'Resumen Global', icon: PieChart },
                { id: 'sedes', label: 'Por Sede', icon: MapPin },
                { id: 'instrumentos', label: 'Por Instrumento', icon: Music },
                { id: 'profesores', label: 'Por Profesor', icon: User },
                { id: 'semaforo', label: 'Semáforo Aulas', icon: Activity }
              ].map(sub => (
                <button key={sub.id} onClick={() => setInformeSubTab(sub.id)} className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all ${informeSubTab === sub.id ? 'bg-white text-slate-900 shadow-sm' : 'text-zinc-500 hover:text-slate-800'}`}>
                   <sub.icon className="w-3.5 h-3.5"/> {sub.label}
                </button>
              ))}
            </div>

            {/* SUBVISTA 1: RESUMEN GLOBAL */}
            {informeSubTab === 'resumen' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in fade-in">
                <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-3xl shadow-sm">
                  <div className="flex items-center gap-2 text-emerald-600 mb-2"><TrendingUp className="w-5 h-5"/><h3 className="text-xs font-black uppercase tracking-widest">Ingresos Brutos</h3></div>
                  <p className="text-4xl font-black text-emerald-900 tracking-tighter">{businessIntelligence.totalIngresos.toLocaleString('es-ES')}€</p>
                  <p className="text-[10px] font-bold text-emerald-700/70 uppercase mt-2">Clases: {businessIntelligence.totalIngresosClases.toLocaleString('es-ES')}€ · Mantenimiento: {businessIntelligence.ingresosMantenimiento.toLocaleString('es-ES')}€ ({businessIntelligence.alumnosMantenimiento}) · Inicio futuro sin ingreso: {businessIntelligence.totalAlumnosInicioFuturo || 0}</p>
                </div>
                
                <div className="bg-rose-50 border border-rose-200 p-6 rounded-3xl shadow-sm">
                  <div className="flex items-center gap-2 text-rose-600 mb-2"><Users className="w-5 h-5"/><h3 className="text-xs font-black uppercase tracking-widest">Coste Profesores</h3></div>
                  <p className="text-4xl font-black text-rose-900 tracking-tighter">-{businessIntelligence.costeTotalProfesores.toLocaleString('es-ES', {maximumFractionDigits:0})}€</p>
                  <p className="text-[10px] font-bold text-rose-700/70 uppercase mt-2">Solo clases operativas · {businessIntelligence.totalHorasSemanalesOperativas.toFixed(1)} h/sem · {businessIntelligence.totalClasesHibernadas} hibernadas no computan · Paco = 0€</p>
                </div>

                <div className="bg-rose-50 border border-rose-200 p-6 rounded-3xl shadow-sm">
                  <div className="flex items-center gap-2 text-rose-600 mb-2"><MapPin className="w-5 h-5"/><h3 className="text-xs font-black uppercase tracking-widest">Gastos Fijos</h3></div>
                  <p className="text-4xl font-black text-rose-900 tracking-tighter">-{businessIntelligence.totalFijos.toLocaleString('es-ES')}€</p>
                  <p className="text-[10px] font-bold text-rose-700/70 uppercase mt-2">Locales y costes compartidos</p>
                </div>

                <div className="bg-black text-white p-6 rounded-3xl shadow-xl relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 text-zinc-400 mb-2"><DollarSign className="w-5 h-5"/><h3 className="text-xs font-black uppercase tracking-widest">Beneficio Neto</h3></div>
                    <p className={`text-4xl font-black tracking-tighter ${businessIntelligence.beneficioNeto >= 0 ? 'text-emerald-400' : 'text-rose-500'}`}>
                      {businessIntelligence.beneficioNeto >= 0 ? '+' : ''}{businessIntelligence.beneficioNeto.toLocaleString('es-ES', {maximumFractionDigits:0})}€
                    </p>
                  </div>
                  <PieChart className="absolute -bottom-6 -right-6 w-32 h-32 text-zinc-800 opacity-50 pointer-events-none" />
                </div>
              </div>
            )}

            {/* SUBVISTA 2: RENTABILIDAD POR SEDE */}
            {informeSubTab === 'sedes' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in">
                 {SEDES.map(sede => {
                    const dataSede = businessIntelligence.porSede[sede];
                    const gastoFijoSede = Number(settings.gastosFijos?.[sede.toLowerCase()]) || 0;
                    const beneficioSede = dataSede.ingresos - dataSede.costesProf - gastoFijoSede;
                    return (
                       <div key={sede} className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm flex flex-col">
                          <h3 className="font-black text-2xl uppercase text-slate-800 tracking-tight border-b pb-3 flex items-center gap-2"><MapPin className="text-blue-500"/> Sede {sede}</h3>
                          <div className="mt-4 space-y-3 flex-1 text-sm font-bold">
                             <div className="flex justify-between text-slate-600"><span>Ingresos por clases:</span><span className="text-emerald-600">+{dataSede.ingresosClases}€</span></div>
                             <div className="flex justify-between text-slate-600"><span>Alumnos con cuota:</span><span>{dataSede.alumnosActivos || 0}</span></div>
                             <div className="flex justify-between text-slate-600"><span>Inicio futuro:</span><span>{dataSede.alumnosInicioFuturo || 0}</span></div>
                             <div className="flex justify-between text-slate-600"><span>Plazas comprometidas:</span><span>{dataSede.plazasComprometidas || 0}</span></div>
                             <div className="flex justify-between text-slate-600"><span>Mantenimiento ({dataSede.alumnosMantenimiento || 0}):</span><span className="text-blue-600">+{dataSede.mantenimiento || 0}€</span></div>
                             <div className="flex justify-between text-slate-600"><span>Ingresos totales:</span><span className="text-emerald-700">+{dataSede.ingresos}€</span></div>
                             <div className="flex justify-between text-slate-600"><span>Clases operativas / hibernadas:</span><span>{dataSede.clasesOperativas || 0} / {dataSede.clasesHibernadas || 0}</span></div>
                             <div className="flex justify-between text-slate-600"><span>Horas prof. computables:</span><span>{(dataSede.horasSemanalesOperativas || 0).toFixed(1)} h/sem</span></div>
                             <div className="flex justify-between text-slate-600"><span>Coste Profesores:</span><span className="text-rose-500">-{dataSede.costesProf.toFixed(0)}€</span></div>
                             <div className="flex justify-between text-slate-600"><span>Gastos Fijos Local:</span><span className="text-rose-500">-{gastoFijoSede}€</span></div>
                          </div>
                          <div className="mt-6 pt-4 border-t border-zinc-100 flex justify-between items-center bg-zinc-50 p-4 rounded-xl">
                             <span className="text-xs font-black uppercase text-zinc-400">Beneficio Neto Local:</span>
                             <span className={`text-xl font-black ${beneficioSede >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{beneficioSede >= 0 ? '+' : ''}{beneficioSede.toFixed(0)}€</span>
                          </div>
                       </div>
                    );
                 })}
              </div>
            )}

            {/* SUBVISTA 3: RENTABILIDAD POR INSTRUMENTO */}
            {informeSubTab === 'instrumentos' && (
              <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden animate-in fade-in">
                 <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                       <thead>
                          <tr className="bg-zinc-50 text-[10px] uppercase font-black tracking-widest text-zinc-400 border-b">
                             <th className="p-4">Instrumento</th>
                             <th className="p-4 text-center">Grupos operativos</th>
                             <th className="p-4 text-right text-emerald-600">Ingresos Mensuales</th>
                             <th className="p-4 text-right text-rose-600">Costes Empresa</th>
                             <th className="p-4 text-right">Margen Limpio</th>
                          </tr>
                       </thead>
                       <tbody className="text-sm font-bold text-slate-700">
                          {businessIntelligence.porInstrumento.map(inst => (
                             <tr key={inst.name} className="border-b hover:bg-zinc-50">
                                <td className="p-4 uppercase font-black text-slate-900">{inst.name}</td>
                                <td className="p-4 text-center">{inst.numGrupos || 0} clases{inst.numGruposHibernados ? ` · ${inst.numGruposHibernados} hib.` : ''}</td>
                                <td className="p-4 text-right text-emerald-600">+{inst.ingresos}€</td>
                                <td className="p-4 text-right text-rose-500">-{inst.costes.toFixed(0)}€</td>
                                <td className="p-4 text-right">
                                   <span className={`px-2.5 py-1 rounded-lg ${inst.beneficio >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                      {inst.beneficio > 0 ? '+' : ''}{inst.beneficio.toFixed(0)}€
                                   </span>
                                </td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
            )}

            {/* SUBVISTA 4: RENTABILIDAD POR PROFESOR */}
            {informeSubTab === 'profesores' && (
              <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden animate-in fade-in">
                 <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                       <thead>
                          <tr className="bg-zinc-50 text-[10px] uppercase font-black tracking-widest text-zinc-400 border-b">
                             <th className="p-4">Profesor</th>
                             <th className="p-4 text-center">Horas computables</th>
                             <th className="p-4 text-right text-emerald-600">Ingresos Generados</th>
                             <th className="p-4 text-right text-rose-600">Coste Empresa Real</th>
                             <th className="p-4 text-right">Beneficio Neto</th>
                          </tr>
                       </thead>
                       <tbody className="text-sm font-bold text-slate-700">
                          {businessIntelligence.porProfe.map(p => (
                             <tr key={p.name} className="border-b hover:bg-zinc-50">
                                <td className="p-4 uppercase font-black text-slate-900">
                                  {p.name}
                                  {p.name.toLowerCase() === 'paco' && <span className="ml-2 bg-zinc-200 text-zinc-500 text-[9px] px-2 py-0.5 rounded">Socio</span>}
                                </td>
                                <td className="p-4 text-center">{(p.horasSemanales || 0).toFixed(1)} h/sem{p.clasesHibernadas ? ` · ${p.clasesHibernadas} hib.` : ''}</td>
                                <td className="p-4 text-right text-emerald-600">+{p.ingresos}€</td>
                                <td className="p-4 text-right text-rose-500">-{p.costes.toFixed(0)}€</td>
                                <td className="p-4 text-right">
                                   <span className={`px-2.5 py-1 rounded-lg ${p.beneficio >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                                      {p.beneficio > 0 ? '+' : ''}{p.beneficio.toFixed(0)}€
                                   </span>
                                </td>
                             </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>
              </div>
            )}

            {/* SUBVISTA 5: EL SEMÁFORO INDIVIDUAL */}
            {informeSubTab === 'semaforo' && (
              <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden animate-in fade-in">
                <div className="p-6 border-b border-zinc-100 bg-zinc-50 flex items-center justify-between">
                  <h3 className="font-black uppercase tracking-widest text-slate-800 flex items-center gap-2"><Activity className="w-5 h-5"/> Rentabilidad por Aula (Semáforo)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-zinc-50 text-[10px] uppercase tracking-widest text-zinc-500 border-b border-zinc-200">
                        <th className="p-4 font-black">Clase</th>
                        <th className="p-4 font-black">Centro y Horario</th>
                        <th className="p-4 font-black text-center">Alumnos</th>
                        <th className="p-4 font-black text-right text-emerald-600">Ingresos</th>
                        <th className="p-4 font-black text-right text-rose-600">Coste (Prof)</th>
                        <th className="p-4 font-black text-right">Beneficio/Mes</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm font-medium text-slate-700">
                      {businessIntelligence.clasesRentabilidad.map(c => {
                        const isGreen = c.beneficio > 50;
                        const isYellow = c.beneficio > 0 && c.beneficio <= 50;
                        
                        return (
                          <tr key={c.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                            <td className="p-4">
                              <div className="font-black text-slate-900 uppercase">{c.subject}</div>
                              <div className="text-[10px] text-zinc-500 font-bold uppercase mt-0.5">Prof: {c.teacher}</div>
                            </td>
                            <td className="p-4">
                              <div className="font-bold text-slate-700">{c.sede}</div>
                              <div className="text-[10px] text-zinc-400 mt-0.5 uppercase">{getDayName(c.dayOfWeek)} {c.time}</div>
                            </td>
                            <td className="p-4 text-center">
                              <span className={`px-2.5 py-1 rounded text-xs font-black ${c.numAlumnos > 0 ? 'bg-zinc-200 text-black' : 'bg-red-100 text-red-700'}`}>
                                {c.numAlumnos} pax
                              </span>
                              {(c.numCongelados > 0 || c.numInicioFuturo > 0 || c.numImpagos > 0) && (
                                <div className="mt-1 text-[9px] font-bold text-zinc-400 uppercase leading-tight">
                                  {c.numCongelados > 0 ? `Mant. ${c.numCongelados} ` : ''}{c.numInicioFuturo > 0 ? `Inicio futuro ${c.numInicioFuturo} ` : ''}{c.numImpagos > 0 ? `Impago ${c.numImpagos}` : ''}
                                </div>
                              )}
                            </td>
                            <td className="p-4 text-right font-black text-emerald-600">+{c.ingresos}€</td>
                            <td className="p-4 text-right font-black text-rose-600">-{c.coste.toFixed(0)}€</td>
                            <td className="p-4 text-right">
                              <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${isGreen ? 'bg-emerald-100 text-emerald-800' : isYellow ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>
                                {c.beneficio > 0 ? '+' : ''}{c.beneficio.toFixed(0)}€
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- 1. BANDEJA DE GESTIONES --- */}
        {activeTab === 'gestiones' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Bandeja de Entrada</h2>
                <p className="text-zinc-500 font-medium text-sm">Gestiona solicitudes de alumnos, tareas manuales internas y peticiones de profesores.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button onClick={consolidateExpiredScheduledGestiones} disabled={bulkConsolidatingGestiones || scheduledGestionesVencidas.length === 0} className="bg-violet-600 hover:bg-violet-700 text-white px-5 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" title="Consolida solo bajas y cambios de horario programados cuya fecha efectiva ya ha llegado. No procesa mantenimientos.">
                  <CheckCircle className="w-4 h-4"/> {bulkConsolidatingGestiones ? 'Consolidando...' : 'Consolidar gestiones programadas vencidas'} {scheduledGestionesVencidas.length > 0 ? `(${scheduledGestionesVencidas.length})` : ''}
                </button>
                <button onClick={executeAllReadyGestiones} disabled={bulkExecutingGestiones || readyPendingGestiones.length === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" title="Ejecuta solo los trámites listos: Tadosi hecho o trámites que no requieren Tadosi">
                  <CheckCircle className="w-4 h-4"/> Ejecutar todas ({readyPendingGestiones.length})
                </button>
                <button onClick={() => setManualTaskModal(true)} className="bg-black hover:bg-zinc-800 text-white px-5 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 transition-colors">
                  <Plus className="w-4 h-4"/> Nueva Tarea Manual
                </button>
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Pendientes totales</p>
                <p className="text-2xl font-black text-slate-900">{totalPendingInbox}</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Listas para ejecutar</p>
                <p className="text-2xl font-black text-emerald-900">{readyPendingGestiones.length}</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Pendientes de Tadosi</p>
                <p className="text-2xl font-black text-amber-900">{blockedByTadosiGestiones.length}</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Tareas profesores</p>
                <p className="text-2xl font-black text-blue-900">{pendingTeacherPanelTasks.length}</p>
              </div>
              <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-violet-700">Programadas pendientes</p>
                <p className="text-2xl font-black text-violet-900">{scheduledGestionesPendientesConsolidacion.length}</p>
              </div>
              <div className="bg-fuchsia-50 border border-fuchsia-200 rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-fuchsia-700">Programadas vencidas</p>
                <p className="text-2xl font-black text-fuchsia-900">{scheduledGestionesVencidas.length}</p>
              </div>
            </div>

            {totalPendingInbox === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-zinc-200">
                <Check className="w-12 h-12 text-emerald-400 mx-auto mb-4 bg-emerald-50 rounded-full p-2" />
                <h3 className="text-lg font-black text-slate-800 uppercase">Todo al día</h3>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative bg-white rounded-2xl border border-zinc-200 shadow-sm">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={gestionSearchTerm}
                    onChange={e => setGestionSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre de alumno, email, profesor, encargo o texto de la solicitud..."
                    className="w-full pl-11 pr-4 py-3 rounded-2xl outline-none font-bold text-sm text-slate-700"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    onClick={() => setInboxSection('gestiones')}
                    className={`p-4 rounded-2xl border-2 text-left transition-all ${inboxSection === 'gestiones' ? 'bg-black text-white border-black shadow-md' : 'bg-white text-slate-800 border-zinc-200 hover:border-black'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Gestiones administrativas</p>
                        <p className="text-sm font-black uppercase tracking-tight mt-1">Alumnos, Tadosi, ausencias y tareas manuales</p>
                      </div>
                      <span className={`px-3 py-1 rounded-xl text-xs font-black ${inboxSection === 'gestiones' ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-700'}`}>{pendingGestiones.length}</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setInboxSection('profesores')}
                    className={`p-4 rounded-2xl border-2 text-left transition-all ${inboxSection === 'profesores' ? 'bg-blue-700 text-white border-blue-700 shadow-md' : 'bg-white text-slate-800 border-zinc-200 hover:border-blue-500'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Profesores</p>
                        <p className="text-sm font-black uppercase tracking-tight mt-1">Peticiones recibidas y encargos enviados</p>
                      </div>
                      <span className={`px-3 py-1 rounded-xl text-xs font-black ${inboxSection === 'profesores' ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-700'}`}>{pendingTeacherPanelTasks.length}</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setInboxSection('programadas')}
                    className={`p-4 rounded-2xl border-2 text-left transition-all ${inboxSection === 'programadas' ? 'bg-violet-700 text-white border-violet-700 shadow-md' : 'bg-white text-slate-800 border-zinc-200 hover:border-violet-500'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Programadas</p>
                        <p className="text-sm font-black uppercase tracking-tight mt-1">Bajas y cambios pendientes de consolidar</p>
                      </div>
                      <span className={`px-3 py-1 rounded-xl text-xs font-black ${inboxSection === 'programadas' ? 'bg-white/20 text-white' : 'bg-violet-50 text-violet-700'}`}>{scheduledGestionesProgramadas.length}</span>
                    </div>
                  </button>
                </div>

                {inboxSection === 'gestiones' && (
                  <div className="bg-white rounded-2xl p-2 border border-zinc-200 shadow-sm flex flex-wrap gap-2">
                    {gestionPendingFilters.map(filter => {
                      const active = gestionPendingFilter === filter.id;
                      return (
                        <button
                          key={filter.id}
                          onClick={() => setGestionPendingFilter(filter.id)}
                          className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 ${active ? 'bg-black text-white shadow-md' : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'}`}
                        >
                          {filter.label}
                          <span className={`px-2 py-0.5 rounded-full text-[9px] ${active ? 'bg-white/20 text-white' : 'bg-white text-zinc-500 border border-zinc-200'}`}>
                            {pendingGestionFilterCounts[filter.id] || 0}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {inboxSection === 'profesores' && (
                  <div className="bg-blue-50 rounded-2xl p-3 border border-blue-100 shadow-sm space-y-3">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-tight text-blue-950 flex items-center gap-2"><Send className="w-4 h-4"/> Panel de profesores</h3>
                      <p className="text-xs font-bold text-blue-800/70 mt-1">Separado de Tadosi, ausencias, mantenimiento y bajas.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {teacherTaskInboxFilters.map(filter => {
                        const active = teacherTaskInboxFilter === filter.id;
                        return (
                          <button
                            key={filter.id}
                            onClick={() => setTeacherTaskInboxFilter(filter.id)}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 ${active ? 'bg-blue-700 text-white shadow-md' : 'bg-white text-blue-700 hover:bg-blue-100 border border-blue-100'}`}
                          >
                            {filter.label}
                            <span className={`px-2 py-0.5 rounded-full text-[9px] ${active ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>
                              {pendingTeacherFilterCounts[filter.id] || 0}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {inboxSection === 'profesores' ? (
                  filteredTeacherRequests.length === 0 ? (
                    <div className="bg-white rounded-3xl p-10 text-center border-2 border-dashed border-zinc-200">
                      <CheckCircle className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                      <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">No hay tareas de profesores en esta vista</h3>
                      <p className="text-xs text-zinc-400 font-medium mt-2">Aquí verás peticiones de profesores a coordinación y encargos enviados desde Admin.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {filteredTeacherRequests.map(task => {
                        const status = task.status || 'pendiente';
                        const isAdminAssignmentTask = isTeacherAdminAssignment(task);
                        return (
                          <div key={task.id} className={`bg-white rounded-3xl border-2 p-6 shadow-sm ${task.priority === 'alta' && isOpenTeacherTaskStatus(status) ? 'border-amber-300' : isAdminAssignmentTask ? 'border-violet-100' : 'border-zinc-100'}`}>
                            <div className="flex items-start gap-4 mb-4">
                              <div className={`p-3 rounded-2xl shrink-0 ${isAdminAssignmentTask ? 'bg-violet-50 text-violet-600' : 'bg-blue-50 text-blue-600'}`}>
                                {isAdminAssignmentTask ? <ClipboardList className="w-6 h-6" /> : <Send className="w-6 h-6" />}
                              </div>
                              <div className="flex-1">
                                <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg leading-tight">{task.title}</h3>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  <span className={`inline-flex items-center px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${getTeacherTaskStatusStyle(status)}`}>{getTeacherTaskStatusLabel(status)}</span>
                                  {isAdminAssignmentTask ? (
                                    <span className="inline-flex items-center px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest bg-violet-50 text-violet-700 border-violet-200">Encargo de coordinación</span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest bg-blue-50 text-blue-700 border-blue-200">{getTeacherTaskRequestLabel(task.requestType)}</span>
                                  )}
                                  {task.priority === 'alta' && <span className="inline-flex items-center px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-800 border-amber-200">Alta prioridad</span>}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-3 text-xs font-bold text-slate-600">
                              <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-3">
                                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Profesor</p>
                                <p className="text-slate-800">{task.teacherName || 'Profesor'} · {task.teacherEmail || 'sin email'}</p>
                              </div>
                              {task.relatedClassLine && (
                                <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-3">
                                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Clase relacionada</p>
                                  <p>{task.relatedClassLine}</p>
                                </div>
                              )}
                              {task.dueDate && (
                                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-amber-900">
                                  <p className="text-[10px] font-black uppercase tracking-widest mb-1">Fecha límite</p>
                                  <p>{formatDateSpanish(task.dueDate)}</p>
                                </div>
                              )}
                              <div className="bg-white border border-zinc-100 rounded-xl p-3">
                                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Detalles</p>
                                <p className="whitespace-pre-wrap leading-relaxed">{task.description || 'Sin detalles añadidos.'}</p>
                              </div>
                              {task.teacherResponse && (
                                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-emerald-900">
                                  <p className="text-[10px] font-black uppercase tracking-widest mb-1">Respuesta del profesor</p>
                                  <p className="whitespace-pre-wrap leading-relaxed">{task.teacherResponse}</p>
                                </div>
                              )}
                              {task.rejectionReason && (
                                <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-red-900">
                                  <p className="text-[10px] font-black uppercase tracking-widest mb-1">Motivo del rechazo</p>
                                  <p className="whitespace-pre-wrap leading-relaxed">{task.rejectionReason}</p>
                                </div>
                              )}
                            </div>

                            <div className="mt-5 pt-4 border-t border-zinc-100 flex flex-col sm:flex-row gap-2">
                              {isAdminAssignmentTask ? (
                                <button onClick={() => updateTeacherRequestStatus(task, 'cancelada')} className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest">Cancelar encargo</button>
                              ) : (
                                <>
                                  <button onClick={() => updateTeacherRequestStatus(task, 'en_revision')} disabled={status === 'en_revision'} className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed">En revisión</button>
                                  <button onClick={() => updateTeacherRequestStatus(task, 'resuelta')} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest">Resolver</button>
                                  <button onClick={() => updateTeacherRequestStatus(task, 'rechazada')} className="flex-1 bg-red-50 hover:bg-red-100 text-red-700 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest">Rechazar</button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : inboxSection === 'programadas' ? (
                  filteredScheduledGestionesProgramadas.length === 0 ? (
                    <div className="bg-white rounded-3xl p-10 text-center border-2 border-dashed border-zinc-200">
                      <Clock className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                      <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">No hay gestiones programadas en esta vista</h3>
                      <p className="text-xs text-zinc-400 font-medium mt-2">Aquí aparecerán las bajas y cambios de horario ya ejecutados como programados, hasta que se consoliden.</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl shadow-sm border border-violet-200 overflow-hidden">
                      <div className="p-4 bg-violet-50 border-b border-violet-100 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-black uppercase tracking-tight text-violet-950 flex items-center gap-2"><Clock className="w-4 h-4"/> Gestiones programadas pendientes de consolidar</h3>
                          <p className="text-xs font-bold text-violet-800/70 mt-1">Son trámites ya ejecutados en modo programado. Student/Teacher los respetan por fecha; este bloque sirve para no perderlos de vista hasta su consolidación final.</p>
                        </div>
                        <span className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-white text-violet-700 border border-violet-100">
                          {scheduledGestionesVencidas.length} vencida(s)
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                          <thead>
                            <tr className="bg-zinc-50 text-[10px] uppercase tracking-widest text-zinc-400 border-b border-zinc-200">
                              <th className="p-4 font-black">Alumno</th>
                              <th className="p-4 font-black">Tipo</th>
                              <th className="p-4 font-black">Fechas</th>
                              <th className="p-4 font-black">Clase / movimiento</th>
                              <th className="p-4 font-black text-right">Estado</th>
                            </tr>
                          </thead>
                          <tbody className="text-sm font-medium text-slate-700">
                            {filteredScheduledGestionesProgramadas.map(g => {
                              const endDate = getScheduledGestionEndDate(g);
                              const effectiveDate = getScheduledGestionEffectiveDate(g);
                              const isDue = shouldConsolidateScheduledGestion(g);
                              const sourceClassLine = getGestionSourceClassLine(g);
                              const targetClassLine = getGestionTargetClassLine(g);
                              const bajaScopeLabel = getBajaScopeLabel(g);

                              return (
                                <tr key={g.id} className="border-b border-zinc-100 hover:bg-violet-50/40 transition-colors align-top">
                                  <td className="p-4 min-w-[220px]">
                                    <div className="font-black text-black">{g.studentName || 'Sin alumno'}</div>
                                    <div className="text-[10px] text-zinc-400">{g.studentEmail || ''}</div>
                                    <div className="text-[10px] text-zinc-400 mt-1">Programada el {formatDateSpanish(g.scheduledAt || g.date)}</div>
                                  </td>
                                  <td className="p-4">
                                    <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${g.type === 'baja' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                                      {g.type === 'baja' ? (bajaScopeLabel || 'Baja') : 'Cambio horario'}
                                    </span>
                                  </td>
                                  <td className="p-4 min-w-[180px]">
                                    <div className="text-xs font-black text-slate-800">Fin: {formatDateSpanish(endDate)}</div>
                                    <div className="text-xs font-black text-violet-700 mt-1">Efectiva: {formatDateSpanish(effectiveDate)}</div>
                                  </td>
                                  <td className="p-4 min-w-[320px]">
                                    {sourceClassLine && <div className="text-xs font-bold text-slate-700 whitespace-pre-wrap"><span className="font-black uppercase text-[9px] text-zinc-400 tracking-widest block">Origen</span>{sourceClassLine}</div>}
                                    {targetClassLine && targetClassLine !== sourceClassLine && <div className="text-xs font-bold text-slate-700 whitespace-pre-wrap mt-2"><span className="font-black uppercase text-[9px] text-zinc-400 tracking-widest block">Destino</span>{targetClassLine}</div>}
                                    {!sourceClassLine && !targetClassLine && <div className="text-xs italic text-zinc-400">Sin clase indicada</div>}
                                  </td>
                                  <td className="p-4 text-right whitespace-nowrap">
                                    <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${isDue ? 'bg-fuchsia-100 text-fuchsia-700' : 'bg-violet-100 text-violet-700'}`}>
                                      {isDue ? 'Vencida · lista' : 'Programada'}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                ) : filteredPendingGestiones.length === 0 ? (
                  <div className="bg-white rounded-3xl p-10 text-center border-2 border-dashed border-zinc-200">
                    <CheckCircle className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                    <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">No hay trámites pendientes en esta vista</h3>
                    <p className="text-xs text-zinc-400 font-medium mt-2">El resto de notificaciones pendientes sigue disponible en “Todas”.</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                    <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-zinc-50 text-[10px] uppercase tracking-widest text-zinc-400 border-b border-zinc-200">
                        <th className="p-4 font-black">Fecha</th>
                        <th className="p-4 font-black">Alumno</th>
                        <th className="p-4 font-black">Tipo de Trámite</th>
                        <th className="p-4 font-black">Detalles</th>
                        <th className="p-4 font-black text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm font-medium text-slate-700">
                      {filteredPendingGestiones.map(g => {
                        const studentInfo = g.studentId ? students.find(s => s.id === g.studentId) : null;
                        const studentAlias = studentInfo?.useAlias && studentInfo?.alias ? studentInfo.alias : '';
                        const studentClasses = g.studentId ? getStudentAssignedClasses(g.studentId) : [];
                        const visibleClasses = studentClasses.slice(0, 2);
                        const hiddenClassCount = Math.max(studentClasses.length - visibleClasses.length, 0);
                        const teacherNames = g.studentId ? getStudentTeachers(g.studentId) : [];
                        const sourceClassLine = getGestionSourceClassLine(g);
                        const targetClassLine = getGestionTargetClassLine(g);
                        const bajaScopeLabel = getBajaScopeLabel(g);
                        const detailsText = g.details || g.title || '';

                        return (
                        <tr key={g.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors align-top">
                          <td className="p-4 whitespace-nowrap text-zinc-500">{formatDateSpanish(g.date)}</td>
                          <td className="p-4 min-w-[230px]">
                            <div className="font-black text-black">{g.studentName}</div>
                            {studentAlias && studentAlias !== g.studentName && (
                              <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-0.5 flex items-center gap-1">
                                <User className="w-3 h-3"/> Alumno: {studentAlias}
                              </div>
                            )}
                            <div className="text-[10px] text-zinc-400">{g.studentEmail}</div>
                            {teacherNames.length > 0 && (
                              <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1">
                                Prof: {teacherNames.join(', ')}
                              </div>
                            )}
                            {visibleClasses.length > 0 && (
                              <div className="mt-1.5 space-y-1">
                                {visibleClasses.map(c => (
                                  <div key={c.id} className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-snug flex items-start gap-1">
                                    <BookOpen className="w-3 h-3 mt-0.5 shrink-0 text-zinc-400"/>
                                    <span>{c.subject} · {getDayName(c.dayOfWeek)} · {c.time}h · {c.sede || 'Tarragona'}{c.sala ? ` · ${c.sala}` : ''}</span>
                                  </div>
                                ))}
                                {hiddenClassCount > 0 && (
                                  <div className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">+{hiddenClassCount} clase(s) más</div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${(g.type || '').includes('mitobox') ? 'bg-blue-100 text-blue-800' : (g.type || '').includes('baja') ? 'bg-red-100 text-red-800' : (g.type || '').includes('manual') || (g.source === 'manual_admin') ? 'bg-purple-100 text-purple-800' : 'bg-zinc-200 text-zinc-800'}`}>
                              {(g.type || 'tarea').replace('_', ' ')}
                            </span>
                            <div className={`mt-2 inline-flex px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${isGestionReadyForExecution(g) ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {getGestionWorkflowLabel(g)}
                            </div>
                            {g.tadosiDoneAt && <div className="text-[9px] font-bold text-emerald-600 mt-1 uppercase">Tadosi: {new Date(g.tadosiDoneAt).toLocaleDateString('es-ES')}</div>}
                            {bajaScopeLabel && (
                              <div className={`mt-2 inline-flex px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${isTotalBajaGestion(g) ? 'bg-red-100 text-red-700' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                                {bajaScopeLabel}
                              </div>
                            )}
                            {g.targetMonth && <div className="text-[10px] font-bold text-amber-600 mt-1 uppercase">Para: {g.targetMonth}</div>}
                            {g.type === 'mantenimiento' && (() => {
                              const period = getMaintenancePeriodFromGestion(g);
                              if (period.isLegacyMissingDuration) {
                                return (
                                  <div className="text-[10px] font-black text-blue-700 mt-1 uppercase leading-snug">
                                    Periodo: pendiente de elegir al ejecutar · 1 mes / 2 meses
                                  </div>
                                );
                              }

                              return (
                                <div className="text-[10px] font-bold text-blue-700 mt-1 uppercase leading-snug">
                                  Periodo: {formatDateSpanish(period.from)} - {formatDateSpanish(period.until)}
                                  {period.months ? ` · ${period.months} mes${period.months > 1 ? 'es' : ''}` : ''}
                                  {period.totalFee ? ` · ${period.totalFee}€` : ''}
                                </div>
                              );
                            })()}
                            {sourceClassLine && (
                              <div className="mt-2 p-2 rounded-xl bg-indigo-50 border border-indigo-100 text-[10px] font-bold text-indigo-800 leading-snug">
                                <span className="font-black uppercase tracking-widest block mb-0.5">Plaza origen</span>
                                {sourceClassLine}
                              </div>
                            )}
                            {targetClassLine && (g.type === 'cambio_horario' || g.type === 'ampliar_clases' || g.type === 'recuperacion') && (
                              <div className="mt-2 p-2 rounded-xl bg-emerald-50 border border-emerald-100 text-[10px] font-bold text-emerald-800 leading-snug">
                                <span className="font-black uppercase tracking-widest block mb-0.5">Clase destino</span>
                                {targetClassLine}
                              </div>
                            )}
                            {g.recoveryDate && <div className="text-[10px] font-bold text-emerald-600 mt-1 uppercase">Día Exacto: {formatDateSpanish(g.recoveryDate)}</div>}
                            {g.type === 'recuperacion' && (() => {
                              const ticketStats = ticketStatsByStudent[g.studentId] || { active: 0, committed: 0, free: 0, pending: 0, scheduled: 0 };
                              return (
                                <div className={`text-[10px] font-black mt-1 uppercase ${ticketStats.free > 0 ? 'text-amber-700' : 'text-red-600'}`}>
                                  Tickets: {ticketStats.free} libres / {ticketStats.active} activos · {ticketStats.committed} comprometidos
                                </div>
                              );
                            })()}
                          </td>
                          <td className="p-4 min-w-[240px]">
                            <div
                              className="max-w-[220px] md:max-w-[360px] text-xs leading-relaxed text-slate-600 whitespace-pre-wrap"
                              title={detailsText}
                              style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                            >
                              {detailsText || <span className="text-zinc-300 italic">Sin detalles añadidos.</span>}
                            </div>
                          </td>
                          <td className="p-4 text-right whitespace-nowrap">
                            <div className="flex justify-end gap-2">
                              {gestionRequiresTadosi(g) && (
                                <button
                                  onClick={() => markGestionTadosiDone(g)}
                                  disabled={isGestionTadosiDone(g)}
                                  className={`p-2 rounded-lg transition-colors ${isGestionTadosiDone(g) ? 'bg-emerald-100 text-emerald-700 opacity-80 cursor-default' : 'bg-amber-100 hover:bg-amber-200 text-amber-700'}`}
                                  title={isGestionTadosiDone(g) ? 'Tadosi ya marcado como hecho' : 'Marcar Tadosi hecho'}
                                >
                                  <DollarSign className="w-4 h-4"/>
                                </button>
                              )}
                              <button
                                onClick={() => updateGestionStatus(g.id, 'completado', g)}
                                disabled={!isGestionReadyForExecution(g)}
                                className="p-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                title={isGestionReadyForExecution(g) ? 'Ejecutar ahora' : 'Primero marca Tadosi hecho'}
                              >
                                <Check className="w-4 h-4"/>
                              </button>
                              <button onClick={() => updateGestionStatus(g.id, 'rechazado', g)} className="p-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors" title="Rechazar"><X className="w-4 h-4"/></button>
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {resolvedGestiones.length > 0 && (
              <div className="mt-12 pt-8 border-t border-zinc-200">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-4 flex items-center gap-2">
                  <History className="w-5 h-5 text-zinc-400"/> Historial de Trámites (Cerrados)
                </h3>
                <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden opacity-80 hover:opacity-100 transition-opacity">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                      <thead>
                        <tr className="bg-zinc-50 text-[10px] uppercase tracking-widest text-zinc-400 border-b border-zinc-200">
                          <th className="p-4 font-black">Fecha</th>
                          <th className="p-4 font-black">Alumno</th>
                          <th className="p-4 font-black">Tipo</th>
                          <th className="p-4 font-black">Detalles</th>
                          <th className="p-4 font-black text-right">Estado Final</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm font-medium text-slate-700">
                        {visibleResolvedGestiones.map(g => (
                          <tr key={g.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                            <td className="p-4 whitespace-nowrap text-zinc-500">{formatDateSpanish(g.date)}</td>
                            <td className="p-4 font-black text-black">{g.studentName}</td>
                            <td className="p-4">
                              <span className="px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest bg-zinc-200 text-zinc-800">
                                {(g.type || 'tarea').replace('_', ' ')}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="max-w-[200px] md:max-w-md truncate text-xs text-zinc-500 italic" title={g.details}>{g.details}</div>
                            </td>
                            <td className="p-4 text-right whitespace-nowrap">
                              <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${g.status === 'completado' ? 'bg-emerald-100 text-emerald-700' : g.status === 'archivado' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                {g.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                {resolvedGestionesVisible < resolvedGestiones.length && (
                  <div className="p-4 bg-zinc-50 border-t border-zinc-100 text-center">
                    <button
                      onClick={() => setResolvedGestionesVisible(prev => prev + HISTORIAL_TRAMITES_BLOCK_SIZE)}
                      className="bg-zinc-200 hover:bg-zinc-300 text-zinc-700 font-black uppercase tracking-widest text-[10px] px-6 py-3 rounded-xl transition-colors"
                    >
                      Cargar más trámites ({Math.min(HISTORIAL_TRAMITES_BLOCK_SIZE, resolvedGestiones.length - resolvedGestionesVisible)} más)
                    </button>
                  </div>
                )}
              </div>
            )}
          {resolvedTeacherRequests.length > 0 && (
            <div className="mt-12 pt-8 border-t border-zinc-200">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-4 flex items-center gap-2">
                <Send className="w-5 h-5 text-zinc-400"/> Historial de tareas de profesores
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-80 hover:opacity-100 transition-opacity">
                {resolvedTeacherRequests.slice(0, 12).map(task => (
                  <div key={task.id} className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <h4 className="font-black text-slate-800 uppercase tracking-tight">{task.title}</h4>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">{task.teacherName || 'Profesor'} · {isTeacherAdminAssignment(task) ? 'Encargo de coordinación' : getTeacherTaskRequestLabel(task.requestType)}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${getTeacherTaskStatusStyle(task.status || 'resuelta')}`}>{getTeacherTaskStatusLabel(task.status || 'resuelta')}</span>
                    </div>
                    <p className="text-xs font-medium text-zinc-500 whitespace-pre-wrap line-clamp-3">{task.description || 'Sin detalles.'}</p>
                    {task.adminResponse && <p className="mt-3 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-3">Respuesta admin: {task.adminResponse}</p>}
                    {task.teacherResponse && <p className="mt-3 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-3">Respuesta profesor: {task.teacherResponse}</p>}
                    {task.rejectionReason && <p className="mt-3 text-xs font-bold text-red-700 bg-red-50 border border-red-100 rounded-xl p-3">Motivo rechazo: {task.rejectionReason}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        )}

        {/* --- 2. ALUMNOS CRM MEJORADO --- */}
        {activeTab === 'students' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-6">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Directorio Alumnos</h2>
                <p className="text-zinc-500 font-medium text-sm">Gestiona estados, notas y cambios manuales.</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-center">
                <div className="flex bg-white p-1 rounded-xl border border-zinc-200 shadow-sm">
                  {[
                    { id: 'activo', label: 'Activos' },
                    { id: 'sin_plaza', label: 'Sin plaza' },
                    { id: 'mantenimiento', label: 'Mantenimiento' },
                    { id: 'impago', label: 'Impagos' },
                    { id: 'baja', label: 'Bajas' },
                    { id: 'sin_activar', label: 'Sin activar' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setFilterStatus(tab.id)}
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterStatus === tab.id ? 'bg-black text-white' : 'text-zinc-400 hover:text-black'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" placeholder="Buscar alumno..." value={searchStudent} onChange={e => setSearchStudent(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl focus:border-black outline-none font-bold text-sm shadow-sm"
                  />
                </div>
              </div>
            </header>

            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse table-auto">
                  <thead>
                    <tr className="bg-zinc-50 text-[10px] uppercase tracking-widest text-zinc-400 border-b border-zinc-200">
                      <th className="p-4 font-black w-[30%]">Alumno</th>
                      <th className="p-4 font-black text-center w-[20%]">Extras / Tickets</th>
                      <th className="p-4 font-black text-center w-[20%]">Acciones Dios</th>
                      <th className="p-4 font-black text-right w-[30%]">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-medium text-slate-700">
                    {(() => {
                      const filtered = students.filter(s => {
                        const searchNeedle = searchStudent.trim().toLowerCase();
                        const classNamesForStudent = getStudentAssignedClasses(s.id)
                          .flatMap(c => (c.students || [])
                            .filter(studentEntry => studentEntry.id === s.id)
                            .map(studentEntry => studentEntry.name || studentEntry.studentName || '')
                          );
                        const searchableValues = [s.name, s.alias, s.email, ...classNamesForStudent];
                        const matchSearch = !searchNeedle || searchableValues
                          .filter(Boolean)
                          .some(value => String(value).toLowerCase().includes(searchNeedle));
                        if (filterStatus === 'sin_activar') {
                          return matchSearch && (s.claimed === false);
                        }

                        const operationalStatus = getStudentOperationalStatus(s);
                        return matchSearch && operationalStatus === filterStatus;
                      });

                      if (filtered.length === 0) {
                        return <tr><td colSpan="4" className="p-12 text-center text-zinc-400 italic">No hay alumnos en esta lista.</td></tr>;
                      }

                      return filtered.map(student => {
                        const assignedClasses = getStudentAssignedClasses(student.id);
                        const operationalStatus = getStudentOperationalStatus(student);

                        return (
                        <tr key={student.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                          <td className="p-4 overflow-hidden">
                            <div className="font-black text-slate-900 truncate max-w-[150px] lg:max-w-[200px]" title={student.name}>{student.name}</div>
                            {/* 👇 FIX: Muestra el Alias debajo si existe */}
                            {student.useAlias && student.alias && (
                              <div className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mt-0.5 flex items-center gap-1">
                                <User className="w-3 h-3"/> Alumno: {student.alias}
                              </div>
                            )}
                            <div className="text-[10px] text-zinc-400 font-bold truncate max-w-[150px] lg:max-w-[200px] mt-0.5" title={student.email}>{student.email}</div>
                            {student.classStartDate && student.classStartDate > todayStr && (
                              <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mt-1 flex items-center gap-1">
                                <Calendar className="w-3 h-3"/> Inicio clases: {formatDateSpanish(student.classStartDate)}
                              </div>
                            )}
                            
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              {student.claimed ? (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                                  <CheckCircle className="w-3 h-3" /> Activada
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                                  <Timer className="w-3 h-3" /> Pendiente
                                </span>
                              )}
                            </div>

                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {operationalStatus === 'sin_plaza' && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-orange-700 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded">
                                  <AlertCircle className="w-3 h-3" /> Sin plaza
                                </span>
                              )}
                              {operationalStatus === 'mantenimiento' && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded">
                                  <Snowflake className="w-3 h-3" /> Mantenimiento
                                </span>
                              )}
                              {operationalStatus === 'impago' && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-orange-700 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded">
                                  <AlertCircle className="w-3 h-3" /> Impago
                                </span>
                              )}
                              {getActiveStudentTemporaryRelocations(student.id).map(rel => (
                                <span key={rel.id} className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded" title={`${rel.sourceClassLine || ''} → ${rel.targetClassLine || ''}`}>
                                  <Clock className="w-3 h-3" /> Recolocado temporalmente
                                </span>
                              ))}
                            </div>

                            {assignedClasses.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {assignedClasses.map(c => {
                                  const dayShort = getDayName(c.dayOfWeek).substring(0, 3);
                                  const timeShort = c.time.split(':')[0] + 'h';
                                  const studentInClass = (c.students || []).find(s => s.id === student.id);
                                  const isMaintenanceNow = isStudentInMaintenance(student.id, todayStr);
                                  const maintenancePeriod = getActiveStudentMaintenancePeriod(student.id, todayStr);
                                  const classStartDate = getStudentClassStartDate(studentInClass, student);
                                  const startsLater = classStartDate && classStartDate > todayStr;
                                  return (
                                    <span key={c.id} className={`inline-flex items-center gap-1 px-1.5 py-0.5 border rounded text-[8px] font-black uppercase tracking-widest whitespace-nowrap ${isMaintenanceNow ? 'bg-blue-50 border-blue-100 text-blue-600' : startsLater ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-zinc-100 border-zinc-200 text-zinc-500'}`} title={`Profesor: ${c.teacher}${isMaintenanceNow ? ` · Mantenimiento ${formatMaintenancePeriodLine(maintenancePeriod)}` : ''}${startsLater ? ` · Inicio: ${formatDateSpanish(classStartDate)}` : ''}`}>
                                      <BookOpen className="w-2.5 h-2.5 text-zinc-400" /> {c.subject} {dayShort}-{timeShort}{isMaintenanceNow ? ' · Mantenimiento' : startsLater ? ` · Inicio ${formatDateSpanish(classStartDate)}` : ''}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => setNotesModal(student)} className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-lg transition-all" title="Notas Internas">
                                <FileText className="w-4 h-4" />
                              </button>
                              <button onClick={() => toggleStudentToggle(student.id, 'hasMitoverso', student.hasMitoverso)} className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest transition-colors ${student.hasMitoverso ? 'bg-indigo-100 text-indigo-700' : 'bg-zinc-100 text-zinc-400'}`} title="Mitoverso">
                                M+
                              </button>
                              <button onClick={() => toggleStudentToggle(student.id, 'hasMitobox', student.hasMitobox)} className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest transition-colors ${student.hasMitobox ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100 text-zinc-400'}`} title="Mitobox">
                                MB
                              </button>
                              {(() => {
                                const ticketStats = ticketStatsByStudent[student.id] || { total: 0, active: 0, future: 0, used: 0, expired: 0, pending: 0, scheduled: 0, committed: 0, free: 0 };
                                const hasOvercommittedTickets = ticketStats.committed > ticketStats.active;
                                return (
                                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${hasOvercommittedTickets ? 'bg-red-100 text-red-800' : ticketStats.total > 0 ? 'bg-amber-100 text-amber-800' : 'bg-zinc-100 text-zinc-400'}`} title={`Tickets generados: ${ticketStats.total} · Activos hoy: ${ticketStats.active} · Verano activos: ${ticketStats.summerActive || 0} · Libres reales: ${ticketStats.free} · Comprometidos: ${ticketStats.committed} (${ticketStats.pending} pendientes + ${ticketStats.scheduled} programados) · Futuros: ${ticketStats.future} · Verano futuros: ${ticketStats.summerFuture || 0} · Usados/anulados: ${ticketStats.used} · Caducados: ${ticketStats.expired}`}>
                                    <Ticket className="w-3 h-3"/> {ticketStats.free}/{ticketStats.active}
                                  </span>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => setEditStudentModal(student)} className="p-2.5 bg-zinc-100 text-zinc-600 rounded-lg hover:bg-black hover:text-white transition-colors" title="Editar datos del alumno">
                                <Pencil className="w-4 h-4"/>
                              </button>
                              <button onClick={() => setChangeClassModal(student)} className="p-2.5 bg-zinc-800 text-white rounded-lg hover:bg-black transition-colors" title="Cambiar a otra clase manualmente">
                                <ArrowRightLeft className="w-4 h-4"/>
                              </button>
                              <button onClick={() => setTemporaryRelocationModal(student)} className="p-2.5 bg-violet-100 text-violet-700 rounded-lg hover:bg-violet-600 hover:text-white transition-colors" title="Recolocar temporalmente sin liberar su plaza formal">
                                <Clock className="w-4 h-4"/>
                              </button>
                              <button onClick={() => grantRecoveryTicket(student)} className="p-2.5 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors" title="Regalar Ticket de Recuperación">
                                <Gift className="w-4 h-4"/>
                              </button>
                              <button onClick={() => resetStudentTickets(student)} className="p-2.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-colors" title="Anular tickets pendientes">
                                <Ticket className="w-4 h-4"/>
                              </button>
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            <select 
                              value={operationalStatus === 'mantenimiento' ? 'mantenimiento' : (student.globalStatus || 'activo')}
                              onChange={(e) => handleUpdateStudentStatus(student.id, student.name, e.target.value)}
                              className={`text-[10px] font-black uppercase tracking-widest px-2 py-2 w-full max-w-[120px] rounded-lg border-2 outline-none transition-all cursor-pointer ${
                                operationalStatus === 'sin_plaza' ? 'bg-orange-50 border-orange-200 text-orange-700' :
                                operationalStatus === 'mantenimiento' ? 'bg-blue-50 border-blue-200 text-blue-700' : 
                                student.globalStatus === 'impago' ? 'bg-orange-50 border-orange-200 text-orange-700' :
                                student.globalStatus === 'baja' ? 'bg-red-50 border-red-200 text-red-700' : 
                                'bg-emerald-50 border-emerald-200 text-emerald-700'
                              }`}
                            >
                              <option value="activo">Activo</option>
                              <option value="mantenimiento">Mantenimiento temporal</option>
                              <option value="impago">Impago</option>
                              <option value="baja">Dar de Baja</option>
                            </select>
                          </td>
                        </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --- 3. NUEVA PESTAÑA MITOBOX --- */}
        {activeTab === 'mitobox' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="mb-6">
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Radar Mitobox</h2>
              <p className="text-zinc-500 font-medium text-sm">Visualiza las salas libres que pueden reservar los alumnos.</p>
            </header>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-200">
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">Día a consultar</label>
                  <input type="date" value={mboxAdminDate} onChange={e => setMboxAdminDate(e.target.value)} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm text-slate-800" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">Centro</label>
                  <select value={mboxAdminSede} onChange={e => setMboxAdminSede(e.target.value)} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm">
                    <option value="Tarragona">Tarragona</option>
                    <option value="Reus">Reus</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-zinc-100 pt-6">
                {availableMboxSlotsAdmin.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {availableMboxSlotsAdmin.map((slot, i) => (
                      <div key={i} className="bg-blue-50 border border-blue-100 p-4 rounded-xl text-center">
                        <p className="text-blue-900 font-black text-xl">{slot.time}h</p>
                        <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">{slot.sala}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-zinc-50 border-2 border-dashed border-zinc-200 p-8 rounded-2xl text-center">
                    <p className="text-sm font-bold text-zinc-500 uppercase tracking-widest">No hay salas disponibles para la fecha o sede elegidas.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- 4. CLASES GLOBALES (VISTA PROFESOR Y ARQUITECTO) --- */}
        {activeTab === 'classes' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Mapa de Clases</h2>
                <p className="text-zinc-500 font-medium text-sm">Visión global de la escuela y planificación de espacios.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="flex bg-zinc-200 p-1 rounded-xl w-full sm:w-auto">
                  <button onClick={() => setClassesViewMode('profesores')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${classesViewMode === 'profesores' ? 'bg-white shadow-sm text-slate-800' : 'text-zinc-500 hover:text-slate-800'}`}>
                    <User className="w-3 h-3 inline mr-1" /> Profesores
                  </button>
                  <button onClick={() => setClassesViewMode('hibernadas')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${classesViewMode === 'hibernadas' ? 'bg-white shadow-sm text-slate-800' : 'text-zinc-500 hover:text-slate-800'}`}>
                    <Ghost className="w-3 h-3 inline mr-1" /> Hibernadas ({hibernatedClasses.length})
                  </button>
                  <button onClick={() => setClassesViewMode('salas')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${classesViewMode === 'salas' ? 'bg-white shadow-sm text-slate-800' : 'text-zinc-500 hover:text-slate-800'}`}>
                    <LayoutGrid className="w-3 h-3 inline mr-1" /> Salas (Arquitecto)
                  </button>
                </div>
                
                {classesViewMode === 'profesores' && (
                  <>
                    <button onClick={() => setPhotosModalOpen(true)} className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 transition-colors">
                      <FileText className="w-3 h-3"/> Fotos
                    </button>
                    <button onClick={handleGenerateSocialText} className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 transition-colors">
                      <Megaphone className="w-3 h-3"/> Redes
                    </button>
                  </>
                )}
                
                <button onClick={() => setCreateClassModal(true)} className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 transition-colors">
                  <Plus className="w-3 h-3"/> Crear Clase
                </button>
              </div>
            </header>

            {/* VISTA ARQUITECTO (POR SALAS EN BLANCO/OCUPADO + CUADRANTE) */}
            {classesViewMode === 'salas' && (
               <div className="space-y-6 animate-in fade-in">
                  <div className="bg-white p-4 rounded-2xl flex flex-col lg:flex-row gap-4 shadow-sm border border-zinc-200 items-stretch lg:items-center justify-between">
                     <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                       <select value={archSede} onChange={e=>setArchSede(e.target.value)} className="w-full sm:w-auto p-3 bg-zinc-50 border-2 border-zinc-200 outline-none font-black text-sm uppercase tracking-widest rounded-xl">
                         {SEDES.map(s => <option key={s} value={s}>{s}</option>)}
                       </select>
                       <input type="date" value={archDate} onChange={e=>setArchDate(e.target.value || todayStr)} className="w-full sm:w-auto p-3 bg-zinc-50 border-2 border-zinc-200 outline-none font-black text-sm uppercase tracking-widest rounded-xl"/>
                       <div className="w-full sm:w-auto px-4 py-3 bg-zinc-50 border-2 border-zinc-100 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                         <Calendar className="w-4 h-4"/> {architectReferenceLabel}
                       </div>
                     </div>

                     <div className="grid grid-cols-2 gap-2 w-full lg:w-auto bg-zinc-100 border border-zinc-200 p-1.5 rounded-2xl">
                       <button type="button" onClick={() => setArchProjectionMode('actual')} className={`px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${!isArchitectProjection ? 'bg-white text-black shadow-sm' : 'text-zinc-400 hover:text-black'}`}>
                         <CheckCircle className="w-4 h-4"/> Real
                       </button>
                       <button type="button" onClick={() => setArchProjectionMode('proyeccion')} className={`px-4 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${isArchitectProjection ? 'bg-black text-white shadow-md' : 'text-zinc-400 hover:text-black'}`}>
                         <Activity className="w-4 h-4"/> Proyectado
                       </button>
                     </div>
                  </div>

                  {isArchitectProjection && (
                    <div className="bg-black text-white p-4 rounded-2xl border border-zinc-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black uppercase tracking-widest">Simulación proyectada por fecha</p>
                        <p className="text-xs font-bold text-zinc-400 mt-1">Cuadrante del {architectReferenceLabel} + bajas, mantenimientos temporales, fines anticipados, cambios y ampliaciones pendientes de la bandeja. No modifica Firebase.</p>
                      </div>
                      <span className="bg-white text-black px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest w-max">{pendingGestiones.filter(g => PROJECTABLE_GESTION_TYPES.has(g.type)).length} trámite(s) aplicados</span>
                    </div>
                  )}

                  {/* TABLA COMPLETA DE CASILLAS EXCEL INTERACTIVAS */}
                  <div className="mt-2">
                     <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-3 mb-4">
                       <h3 className="text-lg font-black uppercase tracking-widest text-slate-800 flex items-center gap-2"><Calendar className="w-5 h-5 text-zinc-400"/> Cuadrante Completo</h3>
                       <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-widest">
                         <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white">
                           <span className="w-2.5 h-2.5 rounded-full bg-white/80"></span> Color profesor = clase operativa
                         </span>
                         <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-700 border border-dashed border-slate-400">
                           <Snowflake className="w-3 h-3"/> Gris = hibernada / no se imparte
                         </span>
                         <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-zinc-400 border border-dashed border-zinc-200">
                           <PlusCircle className="w-3 h-3"/> Blanco = hueco libre
                         </span>
                       </div>
                     </div>
                     <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[600px]">
                           <thead>
                              <tr>
                                 <th className="p-4 bg-zinc-100 border-b border-r border-zinc-200 w-24 text-center text-xs font-black text-zinc-500 uppercase tracking-widest">Hora</th>
                                 {SALAS.map(sala => ( <th key={sala} className="p-4 bg-zinc-100 border-b border-r border-zinc-200 text-center text-sm font-black text-slate-800 uppercase tracking-widest">{sala}</th> ))}
                              </tr>
                           </thead>
                           <tbody>
                              {SCHEDULE_HOURS.map(time => (
                                 <tr key={time} className="border-b border-zinc-100">
                                    <td className="p-4 border-r border-zinc-100 text-center font-black text-sm text-zinc-400 bg-zinc-50/50">{time}</td>
                                    {SALAS.map(sala => {
                                       const slotHour = time.split(':')[0];
                                       const classesInSlot = architectClasses.filter(c => {
                                         const classSede = c.sede || 'Tarragona';
                                         const isClassForSelectedDate = isPunctualClass(c)
                                           ? c.date === (archDate || todayStr)
                                           : Number(c.dayOfWeek) === Number(architectSelectedDay);

                                         return classSede === archSede && isClassForSelectedDate && c.sala === sala && (c.time || '').startsWith(slotHour);
                                       });
                                       const openCreateFromSlot = () => {
                                         if (isArchitectProjection) return;
                                         setNewClassData({...newClassData, isRecurring: true, dayOfWeek: architectSelectedDay, time: time, sede: archSede, sala: sala});
                                         setCreateClassModal(true);
                                       };
                                       return (
                                          <td key={sala} className="p-2 border-r border-zinc-100 align-top h-28 relative hover:bg-zinc-50 transition-colors group" onClick={(e) => { if(isArchitectProjection || e.target.closest('button') || classesInSlot.length > 0) return; openCreateFromSlot(); }}>
                                             {classesInSlot.length > 0 ? (
                                                classesInSlot.map(c => {
                                                   const realClass = recurringClassesOnly.find(real => real.id === c.id) || c;
                                                   const planningStudents = getClassStudentPlanningData(c, isArchitectProjection, archDate || todayStr);
                                                   const activeStudents = planningStudents.filter(student => student.isActive);
                                                   const fixedActiveStudents = activeStudents
                                                      .map(student => student.displayName)
                                                      .filter(Boolean);
                                                   const maintenanceCount = planningStudents.filter(student => student.isMaintenance).length;
                                                   const futureStartCount = planningStudents.filter(student => student.isFutureStart).length;
                                                   const relocatedCount = planningStudents.filter(student => student.isRelocated).length;
                                                   const relocatedOutCount = temporaryRelocations.filter(rel => rel.sourceClassId === c.id && isTemporaryRelocationActiveForDate(rel, archDate || todayStr)).length;
                                                   const committedCount = planningStudents.filter(student => student.isActive || student.isMaintenance || student.isFutureStart).length;
                                                   const activeCount = activeStudents.length;
                                                   const isHibernatedCard = activeCount === 0;
                                                   const capacityLabel = c.capacity ? `${committedCount}/${c.capacity}` : `${committedCount}/—`;
                                                   const activeCapacityLabel = c.capacity ? `${activeCount}/${c.capacity}` : `${activeCount}/—`;
                                                   const visibleStudentNames = fixedActiveStudents.slice(0, 5);
                                                   const hiddenStudentCount = Math.max(fixedActiveStudents.length - visibleStudentNames.length, 0);
                                                   const teacherTheme = getTeacherColorTheme(c.teacher, settings);
                                                   const hibernationReason = maintenanceCount > 0 && futureStartCount > 0
                                                      ? 'Reservas / mantenimiento'
                                                      : maintenanceCount > 0
                                                        ? 'Solo mantenimiento'
                                                        : futureStartCount > 0
                                                          ? 'Inicio futuro'
                                                          : relocatedOutCount > 0
                                                            ? 'Recolocación temporal'
                                                            : 'Sin alumnos activos';
                                                   const cardStyle = isHibernatedCard
                                                      ? { background: '#f8fafc', border: '2px dashed #94a3b8' }
                                                      : { background: teacherTheme.solid, border: `1px solid ${teacherTheme.solidBorder}` };
                                                   const cardTextClass = isHibernatedCard ? 'text-slate-700' : 'text-white';
                                                   const mutedTextStyle = isHibernatedCard ? { color: '#64748b' } : { color: 'rgba(255,255,255,.76)' };
                                                   const dividerStyle = isHibernatedCard ? { borderColor: 'rgba(100,116,139,.25)' } : { borderColor: 'rgba(255,255,255,.22)' };

                                                   return (
                                                      <div key={c.id} className={`${cardTextClass} p-3 rounded-xl text-xs mb-2 last:mb-0 shadow-sm transition-transform hover:-translate-y-0.5 cursor-pointer ${isHibernatedCard ? 'opacity-95' : ''}`} style={cardStyle} onClick={(e) => { e.stopPropagation(); setViewClassModal(realClass); }}>
                                                         <div className="flex items-start justify-between gap-2">
                                                           <div className="min-w-0">
                                                             <div className="font-black truncate uppercase tracking-widest">{c.time} - {c.subject}{isArchitectProjection ? ' · PROY.' : ''}</div>
                                                             <div className="text-[10px] font-bold truncate mt-1" style={mutedTextStyle}>Prof: {c.teacher}</div>
                                                           </div>
                                                           <span className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${isHibernatedCard ? 'bg-slate-200 text-slate-700' : 'bg-white/20 text-white'}`} title="Plazas comprometidas / aforo">{capacityLabel}</span>
                                                         </div>

                                                         {isHibernatedCard ? (
                                                            <div className="mt-2 pt-2 border-t" style={dividerStyle}>
                                                              <div className="inline-flex items-center gap-1.5 bg-slate-200 text-slate-700 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">
                                                                <Snowflake className="w-3 h-3"/> Hibernada
                                                              </div>
                                                              <div className="mt-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
                                                                {hibernationReason}
                                                              </div>
                                                              <div className="mt-1 text-[9px] font-bold text-slate-500 leading-snug normal-case tracking-normal">
                                                                No hay profesor operando esta clase en la fecha seleccionada.
                                                              </div>
                                                            </div>
                                                         ) : visibleStudentNames.length > 0 && (
                                                            <div className="mt-2 pt-2 border-t text-[9px] font-bold leading-snug normal-case tracking-normal" style={{ ...dividerStyle, color: 'rgba(255,255,255,.82)' }}>
                                                               {visibleStudentNames.join(', ')}{hiddenStudentCount > 0 ? ` +${hiddenStudentCount} más` : ''}
                                                            </div>
                                                         )}

                                                         {(maintenanceCount > 0 || futureStartCount > 0 || relocatedCount > 0 || relocatedOutCount > 0 || isHibernatedCard) && (
                                                            <div className={`mt-1 text-[8px] font-black uppercase tracking-widest ${isHibernatedCard ? 'text-slate-500' : ''}`} style={isHibernatedCard ? undefined : { color: 'rgba(255,255,255,.68)' }}>
                                                               Activos {activeCapacityLabel}{maintenanceCount > 0 ? ` · ${maintenanceCount} mant.` : ''}{futureStartCount > 0 ? ` · ${futureStartCount} futuro` : ''}{relocatedCount > 0 ? ` · ${relocatedCount} recol. aquí` : ''}{relocatedOutCount > 0 ? ` · ${relocatedOutCount} recol. fuera` : ''}
                                                            </div>
                                                         )}

                                                         <div className="mt-3 pt-2 border-t flex flex-wrap gap-1.5" style={isHibernatedCard ? { borderColor: 'rgba(100,116,139,.25)' } : { borderColor: 'rgba(255,255,255,.18)' }}>
                                                           <button onClick={(e) => { e.stopPropagation(); setViewClassModal(realClass); }} className={`${isHibernatedCard ? 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200' : 'bg-white/90 hover:bg-white text-black'} p-1.5 rounded-lg transition-colors`} title="Ver alumnos">
                                                             <Users className="w-3.5 h-3.5"/>
                                                           </button>
                                                           {!isArchitectProjection && (
                                                             <>
                                                               <button onClick={(e) => { e.stopPropagation(); openEditClassModal(realClass); }} className="bg-amber-100 hover:bg-amber-200 text-amber-800 p-1.5 rounded-lg transition-colors" title="Editar clase">
                                                                 <Pencil className="w-3.5 h-3.5"/>
                                                               </button>
                                                               <button onClick={(e) => { e.stopPropagation(); setEditWebModal(realClass); }} className={`p-1.5 rounded-lg transition-colors ${realClass.isWebVisible ? 'bg-blue-100 hover:bg-blue-200 text-blue-700' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600'}`} title="Configurar web / WhatsApp">
                                                                 <Globe className="w-3.5 h-3.5"/>
                                                               </button>
                                                               <button onClick={(e) => { e.stopPropagation(); handleDeleteClassGlobal(realClass); }} className={`${isHibernatedCard ? 'bg-red-50 hover:bg-red-100 text-red-600' : 'bg-red-500/20 hover:bg-red-500 text-red-100 hover:text-white'} p-1.5 rounded-lg transition-colors`} title="Borrar clase">
                                                                 <Trash2 className="w-3.5 h-3.5"/>
                                                               </button>
                                                             </>
                                                           )}
                                                           {isArchitectProjection && (
                                                             <span className={`${isHibernatedCard ? 'bg-slate-200 text-slate-700' : 'bg-white/20 text-white'} px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest`}>Simulada</span>
                                                           )}
                                                         </div>
                                                      </div>
                                                   );
                                                })
                                             ) : (
                                                !isArchitectProjection ? (
                                                  <button onClick={(e) => { e.stopPropagation(); openCreateFromSlot(); }} className="absolute inset-2 border-2 border-dashed border-zinc-200 rounded-xl text-zinc-300 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50/60 transition-all flex flex-col items-center justify-center gap-1 font-black uppercase tracking-widest text-[9px]">
                                                    <PlusCircle className="w-6 h-6" />
                                                    Crear clase
                                                  </button>
                                                ) : (
                                                  <div className="absolute inset-2 border-2 border-dashed border-zinc-100 rounded-xl text-zinc-300 flex items-center justify-center font-black uppercase tracking-widest text-[9px]">
                                                    Hueco libre proyectado
                                                  </div>
                                                )
                                             )}
                                          </td>
                                       )
                                    })}
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                  </div>
               </div>
            )}

            {/* VISTA CLÁSICA (POR LISTADO DE PROFESORES) */}
            {classesViewMode === 'profesores' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-left-4">
                {Object.keys(classesByTeacher).length === 0 ? (
                  <div className="p-8 text-center text-zinc-400 font-bold uppercase tracking-widest">No hay clases registradas.</div>
                ) : (
                  Object.entries(classesByTeacher).map(([teacher, classes]) => {
                    const isExpanded = expandedTeacher === teacher;
                    const teacherTheme = getTeacherColorTheme(teacher, settings);
                    return (
                      <div key={teacher} className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                        <button onClick={() => setExpandedTeacher(isExpanded ? null : teacher)} className="w-full p-5 bg-zinc-50 hover:bg-zinc-100 transition-colors flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className="text-white p-2 rounded-lg" style={{ background: teacherTheme.solid }}><User className="w-5 h-5"/></div>
                            <h3 className="font-black text-lg uppercase tracking-tight" style={{ color: teacherTheme.text }}>{teacher} ({classes.length} Clases)</h3>
                          </div>
                          {isExpanded ? <ChevronUp/> : <ChevronDown/>}
                        </button>
                        
                        {isExpanded && (
                          <div className="p-4 border-t grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {classes.map(c => {
                              const classReferenceDate = isPunctualClass(c) && c.date ? c.date : todayStr;
                              const planningStudents = getClassStudentPlanningData(c, false, classReferenceDate)
                                .filter(student => student.status !== 'baja' && !student.isPastEnd)
                                .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
                              const activeStudents = planningStudents.filter(student => student.isActive);
                              const maintenanceStudents = planningStudents.filter(student => student.isMaintenance);
                              const futureStartStudents = planningStudents.filter(student => student.isFutureStart);
                              const relocatedStudents = planningStudents.filter(student => student.isRelocated);
                              const activeC = activeStudents.length;
                              const maintenanceC = maintenanceStudents.length;
                              const futureStartC = futureStartStudents.length;
                              const relocatedC = relocatedStudents.length;
                              const isHibernated = activeC === 0;
                              const teacherTheme = getTeacherColorTheme(c.teacher, settings);
                              return (
                                <div key={c.id} className={`p-4 rounded-xl border-l-8 border relative group ${isHibernated ? 'border-dashed' : ''}`} style={{ background: isHibernated ? '#f8fafc' : teacherTheme.soft, borderColor: teacherTheme.border }}>
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteClassGlobal(c); }} className="absolute top-2 right-2 p-1.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all z-10" title="Borrar Clase">
                                    <Trash2 className="w-4 h-4"/>
                                  </button>
                                  
                                  <div className="font-black text-sm uppercase pr-8 flex items-center gap-2 flex-wrap">
                                    <span>{getDayName(c.dayOfWeek)}</span>
                                    <span className="bg-zinc-100 p-1 rounded">{c.time}</span>
                                    {isPunctualClass(c) && <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest">Puntual {formatDateSpanish(c.date)}</span>}
                                  </div>
                                  <div className="text-xs font-bold uppercase mt-1" style={{ color: teacherTheme.text }}>{c.subject} • {c.sede} ({c.sala})</div>
                                  <div className="text-right text-xs font-black mt-2" style={{ color: teacherTheme.text }}>{isHibernated ? '💤 Hibernada' : `${activeC}/${c.capacity} activos`}</div>
                                  {(maintenanceC > 0 || futureStartC > 0 || relocatedC > 0) && (
                                    <div className="text-right text-[9px] font-black uppercase tracking-widest mt-1" style={{ color: teacherTheme.text }}>
                                      {maintenanceC > 0 ? `${maintenanceC} mant.` : ''}{maintenanceC > 0 && (futureStartC > 0 || relocatedC > 0) ? ' · ' : ''}{futureStartC > 0 ? `${futureStartC} inicio futuro` : ''}{futureStartC > 0 && relocatedC > 0 ? ' · ' : ''}{relocatedC > 0 ? `${relocatedC} recol.` : ''}
                                    </div>
                                  )}

                                  <div className="mt-3 rounded-xl border bg-white/80 overflow-hidden" style={{ borderColor: isHibernated ? 'rgba(148,163,184,.35)' : teacherTheme.border }}>
                                    <div className="px-3 py-2 bg-white/70 border-b border-zinc-100 flex items-center justify-between gap-2">
                                      <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-1"><Users className="w-3 h-3"/> Alumnos</span>
                                      <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">{planningStudents.length}/{c.capacity || '—'}</span>
                                    </div>

                                    {planningStudents.length === 0 ? (
                                      <div className="px-3 py-3 text-[10px] font-bold text-zinc-400 italic">
                                        Sin alumnos operativos ni plazas comprometidas para esta fecha.
                                      </div>
                                    ) : (
                                      <div className="divide-y divide-zinc-100">
                                        {planningStudents.map(student => {
                                          const labels = [];
                                          if (student.status === 'impago') labels.push({ text: 'Impago', className: 'bg-orange-50 text-orange-700 border-orange-100' });
                                          if (student.isActive) labels.push({ text: 'Activo', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' });
                                          if (student.isMaintenance) labels.push({ text: 'Mantenimiento', className: 'bg-blue-50 text-blue-700 border-blue-100' });
                                          if (student.isFutureStart) labels.push({ text: `Inicio ${formatDateSpanish(student.startDate)}`, className: 'bg-violet-50 text-violet-700 border-violet-100' });
                                          if (student.endDate) labels.push({ text: `Fin ${formatDateSpanish(student.endDate)}`, className: 'bg-zinc-50 text-zinc-600 border-zinc-100' });
                                          if (student.isRelocated) labels.push({ text: 'Recolocado aquí', className: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-100' });

                                          return (
                                            <div key={`${student.id}-${student.relocationLabel || student.startDate || student.endDate || 'fijo'}`} className="px-3 py-2">
                                              <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                  <p className="text-xs font-black text-slate-800 truncate" title={student.displayName}>{student.displayName}</p>
                                                  {student.email && student.email !== 'sin email' && (
                                                    <p className="text-[9px] font-bold text-zinc-400 truncate" title={student.email}>{student.email}</p>
                                                  )}
                                                </div>
                                              </div>
                                              {labels.length > 0 && (
                                                <div className="mt-1.5 flex flex-wrap gap-1">
                                                  {labels.map(label => (
                                                    <span key={label.text} className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[8px] font-black uppercase tracking-widest ${label.className}`}>
                                                      {label.text}
                                                    </span>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex gap-2 mt-3">
                                    <button onClick={() => setViewClassModal(c)} className="flex-1 p-1 bg-zinc-100 text-[10px] font-black uppercase rounded"><Users className="w-3 h-3 inline"/> Alumnos</button>
                                    <button onClick={() => openEditClassModal(c)} className="flex-1 p-1 bg-amber-100 text-amber-700 text-[10px] font-black uppercase rounded"><Pencil className="w-3 h-3 inline"/> Editar</button>
                                    <button onClick={() => setEditWebModal(c)} className={`flex-1 p-1 text-[10px] font-black uppercase rounded ${c.isWebVisible ? 'bg-blue-100 text-blue-700' : 'bg-zinc-100 text-zinc-400'}`}><Globe className="w-3 h-3 inline"/> Config</button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}

            {/* VISTA HIBERNADAS (CLASES SIN ALUMNOS ACTIVOS) */}
            {classesViewMode === 'hibernadas' && (
              <div className="space-y-4 animate-in fade-in slide-in-from-left-4">
                <div className="bg-zinc-900 text-white rounded-3xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2"><Ghost className="w-5 h-5 text-zinc-300"/> Clases hibernadas</h3>
                    <p className="text-xs font-bold text-zinc-400 mt-1">Turnos recurrentes sin alumnos activos. Útil para conservar ofertas futuras sin mezclarlas con “En peligro”.</p>
                  </div>
                  <span className="bg-white text-black px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest w-max">{hibernatedClasses.length} clase(s)</span>
                </div>

                {hibernatedClasses.length === 0 ? (
                  <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-zinc-200">
                    <PartyPopper className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                    <h3 className="text-lg font-black text-slate-800 uppercase">No hay clases hibernadas</h3>
                    <p className="text-zinc-500 text-sm">Todas las clases recurrentes tienen al menos un alumno activo.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {hibernatedClasses.map(c => {
                      const planningStudents = getClassStudentPlanningData(c, false);
                      const totalEnLista = planningStudents.length;
                      const maintenanceC = planningStudents.filter(student => student.isMaintenance).length;
                      const futureStartC = planningStudents.filter(student => student.isFutureStart).length;
                      const relocatedC = planningStudents.filter(student => student.isRelocated).length;
                      return (
                        <div key={c.id} className="bg-white border-2 border-dashed border-zinc-300 rounded-2xl p-5 shadow-sm relative group">
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteClassGlobal(c); }} className="absolute top-3 right-3 p-1.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all z-10" title="Borrar Clase">
                            <Trash2 className="w-4 h-4"/>
                          </button>
                          <div className="flex items-start justify-between gap-3 mb-3 pr-8">
                            <span className="bg-zinc-200 text-zinc-600 px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest flex items-center gap-1"><Ghost className="w-3 h-3"/> Hibernada</span>
                            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{totalEnLista} en lista</span>
                          </div>
                          <h4 className="font-black uppercase tracking-tight text-slate-900 text-lg">{c.subject}</h4>
                          <p className="text-xs font-bold text-slate-600 mt-1">{getDayName(c.dayOfWeek)} · {c.time}h · {c.sede || 'Tarragona'} · {c.sala || 'Sala no indicada'}</p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mt-2">Prof: {c.teacher || 'Sin asignar'} · Aforo: {c.capacity || '-'}</p>
                          {(maintenanceC > 0 || futureStartC > 0 || relocatedC > 0) && (
                            <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-zinc-600 bg-zinc-100 border border-zinc-200 px-2 py-1 rounded w-max">
                              {maintenanceC > 0 ? `${maintenanceC} mantenimiento` : ''}{maintenanceC > 0 && (futureStartC > 0 || relocatedC > 0) ? ' · ' : ''}{futureStartC > 0 ? `${futureStartC} inicio futuro` : ''}{futureStartC > 0 && relocatedC > 0 ? ' · ' : ''}{relocatedC > 0 ? `${relocatedC} recolocación` : ''}
                            </p>
                          )}
                          {c.isWebVisible && <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-blue-700 bg-blue-50 border border-blue-100 px-2 py-1 rounded w-max">Visible en web</p>}
                          <div className="mt-4 flex gap-2">
                            <button onClick={() => setResurrectClassModal(c)} className="flex-1 bg-zinc-900 text-white font-black py-2 rounded-lg text-[10px] uppercase tracking-widest hover:bg-black transition-colors flex items-center justify-center gap-1">
                              <PlusCircle className="w-3 h-3"/> Reactivar
                            </button>
                            <button onClick={() => openEditClassModal(c)} className="flex-1 bg-amber-100 text-amber-700 font-black py-2 rounded-lg text-[10px] uppercase tracking-widest hover:bg-amber-200 transition-colors flex items-center justify-center gap-1">
                              <Pencil className="w-3 h-3"/> Editar
                            </button>
                            <button onClick={() => setEditWebModal(c)} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1 ${c.isWebVisible ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'}`}>
                              <Globe className="w-3 h-3"/> Config
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* --- 5. CLASES EN PELIGRO --- */}
        {activeTab === 'danger' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-red-100 p-3 rounded-xl"><AlertTriangle className="w-6 h-6 text-red-600"/></div>
                <div>
                  <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Grupos en Peligro</h2>
                  <p className="text-zinc-500 font-medium text-sm">
                    {dangerViewMode === 'actual'
                      ? 'Vista real actual con criterios afinados por aforo.'
                      : 'Vista proyectada: aplica virtualmente las gestiones pendientes para anticipar el mes que viene.'}
                  </p>
                </div>
              </div>

              <div className="bg-white p-1 rounded-2xl border border-zinc-200 shadow-sm flex gap-1 w-full sm:w-auto">
                {[
                  { id: 'actual', label: 'Ahora' },
                  { id: 'proyeccion', label: 'Mes que viene' }
                ].map(view => (
                  <button
                    key={view.id}
                    onClick={() => setDangerViewMode(view.id)}
                    className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${dangerViewMode === view.id ? 'bg-black text-white shadow-md' : 'text-zinc-500 hover:text-black hover:bg-zinc-50'}`}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            </header>

            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-4">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'ocupacion', label: 'Por ocupación' },
                  { id: 'profesor', label: 'Por profesor' },
                  { id: 'sede', label: 'Por sede' },
                  { id: 'dia', label: 'Por día' },
                  { id: 'contactar', label: `A contactar (${dangerContactRows.length})` }
                ].map(view => (
                  <button
                    key={view.id}
                    onClick={() => setDangerSubView(view.id)}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${dangerSubView === view.id ? 'bg-red-600 text-white shadow-md' : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100 hover:text-black'}`}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {[
                { label: 'Críticas', count: dangerRowsForView.filter(row => row.statusKey === 'critico').length, className: 'bg-red-50 border-red-200 text-red-900' },
                { label: 'Revisar', count: dangerRowsForView.filter(row => row.statusKey === 'revisar').length, className: 'bg-amber-50 border-amber-200 text-amber-900' },
                { label: 'Vacías', count: dangerRowsForView.filter(row => row.statusKey === 'vacia').length, className: 'bg-zinc-50 border-zinc-200 text-zinc-700' },
                { label: 'Solo mant.', count: dangerRowsForView.filter(row => row.statusKey === 'solo_mantenimiento').length, className: 'bg-blue-50 border-blue-200 text-blue-900' }
              ].map(item => (
                <div key={item.label} className={`rounded-2xl border-2 p-4 ${item.className}`}>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{item.label}</p>
                  <p className="text-2xl font-black leading-none mt-1">{item.count}</p>
                </div>
              ))}
            </div>

            <div className="bg-slate-50 border border-slate-200 text-slate-700 rounded-2xl p-4 text-xs font-bold leading-relaxed">
              <strong className="uppercase tracking-widest text-[10px] text-slate-900 block mb-2">Criterios activos</strong>
              Grupos de 8: <strong>crítico ≤3</strong>, revisar ≤5. Grupos de 4: <strong>crítico ≤1</strong>, revisar ≤2. Grupos de 5: <strong>crítico ≤1</strong>, revisar ≤2. Las clases 1/1 quedan fuera de esta vista.
            </div>

            {dangerViewMode === 'proyeccion' && (
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 text-xs font-bold leading-relaxed">
                Esta vista no modifica Firebase. Cruza la foto actual con bajas, mantenimientos temporales, fines anticipados, cambios y ampliaciones pendientes. Sirve para decidir recolocaciones y cierres antes del día 1.
              </div>
            )}

            {dangerSubView === 'contactar' ? (
              dangerContactRows.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-zinc-200">
                  <PartyPopper className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                  <h3 className="text-lg font-black text-slate-800 uppercase">Sin llamadas urgentes</h3>
                  <p className="text-zinc-500 text-sm">No hay alumnos activos en clases críticas. Las clases en “Revisar” quedan omitidas aquí.</p>
                </div>
              ) : (
                <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-zinc-100 bg-red-50">
                    <h3 className="font-black uppercase tracking-tight text-red-900 flex items-center gap-2"><Mail className="w-5 h-5"/> Alumnos a contactar</h3>
                    <p className="text-xs font-bold text-red-700 mt-1">Solo alumnos activos de clases en estado crítico. No incluye clases en “Revisar”.</p>
                  </div>
                  <div className="divide-y divide-zinc-100">
                    {dangerContactRows.map(item => (
                      <div key={item.key} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-zinc-50">
                        <div>
                          <p className="font-black text-slate-900 uppercase tracking-tight">{item.studentName}</p>
                          <p className="text-xs font-bold text-zinc-500">{item.email}</p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-red-700 mt-1">{item.classLine}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="bg-red-100 text-red-800 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest">
                            {item.row.activeCount}/{item.row.cap} activos
                          </span>
                          {item.email && item.email !== 'sin email' && (
                            <a href={`mailto:${item.email}?subject=Reubicación%20de%20clase%20-%20Escuela%20Los%20Mitos`} className="bg-black text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-colors">
                              Email
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : dangerRowsForView.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-zinc-200">
                <PartyPopper className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                <h3 className="text-lg font-black text-slate-800 uppercase">Grupos sanos</h3>
                <p className="text-zinc-500 text-sm">No hay clases grupales con riesgo según los criterios actuales.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupDangerRows(dangerRowsForView, dangerSubView)).map(([groupName, rows]) => (
                  <section key={`${dangerViewMode}-${dangerSubView}-${groupName}`} className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-5">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <h3 className="font-black uppercase tracking-tight text-slate-900 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500"/> {groupName}
                      </h3>
                      <span className="text-[10px] font-black uppercase tracking-widest bg-zinc-100 text-zinc-500 px-3 py-1 rounded-lg">{rows.length} clase(s)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      {rows.map(row => {
                        const c = row.classData || row;
                        const isHibernated = row.statusKey === 'vacia';
                        const onlyMaintenance = row.statusKey === 'solo_mantenimiento';
                        const isCritical = row.statusKey === 'critico';
                        const isReview = row.statusKey === 'revisar';
                        const activeNames = row.activeStudents.map(student => student.displayName);
                        const maintenanceNames = row.maintenanceStudents.map(student => student.displayName);

                        return (
                          <div key={`${dangerViewMode}-${row.id}`} className={`p-5 rounded-2xl border-2 shadow-sm flex flex-col relative group ${isHibernated ? 'bg-zinc-50 border-dashed border-zinc-300' : onlyMaintenance ? 'bg-blue-50 border-blue-200' : isCritical ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                            {dangerViewMode === 'actual' && (
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteClassGlobal(c); }} className="absolute top-3 right-3 p-1.5 bg-red-100 text-red-600 hover:bg-red-600 hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all z-10" title="Borrar Clase">
                                <Trash2 className="w-4 h-4"/>
                              </button>
                            )}

                            <div className="flex justify-between items-start mb-3 pr-8">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${isHibernated ? 'bg-zinc-200 text-zinc-500' : onlyMaintenance ? 'bg-blue-200 text-blue-800' : isCritical ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'}`}>
                                {row.statusLabel}
                              </span>
                              <span className="font-black text-lg">{row.activeCount} / {row.cap || '—'}</span>
                            </div>

                            <h4 className="font-black uppercase tracking-tight text-slate-900">{row.subject}</h4>
                            <p className="text-xs font-bold text-slate-600 mb-2">{row.sede || 'Tarragona'} · {getDayName(row.dayOfWeek)} a las {row.time}h · {row.sala || 'Sala 1'}</p>
                            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 bg-white/50 px-2 py-1 rounded inline-block w-max">Prof: {row.teacher}</div>
                            <div className="mt-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                              Activos: {row.activeCount} · Mantenimiento: {row.maintenanceCount} · Cupo: {row.cap || 'sin aforo'}
                            </div>
                            <p className="mt-2 text-[10px] font-bold text-slate-500 leading-relaxed">{row.statusHelp}</p>

                            {activeNames.length > 0 && (
                              <div className="mt-3 bg-white/70 border border-white rounded-xl p-3">
                                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-1">Alumnos activos</p>
                                <p className="text-xs font-bold text-slate-700 leading-relaxed">{activeNames.join(', ')}</p>
                              </div>
                            )}

                            {maintenanceNames.length > 0 && (
                              <div className="mt-3 bg-white/50 border border-white rounded-xl p-3">
                                <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-1">Mantenimiento</p>
                                <p className="text-xs font-bold text-slate-600 leading-relaxed">{maintenanceNames.join(', ')}</p>
                              </div>
                            )}

                            {isReview && (
                              <div className="mt-3 bg-amber-100/70 border border-amber-200 rounded-xl p-3 text-[10px] font-black uppercase tracking-widest text-amber-800">
                                Revisar evolución, pero no entra en “A contactar”.
                              </div>
                            )}
                            {onlyMaintenance && (
                              <div className="mt-3 bg-blue-100/70 border border-blue-200 rounded-xl p-3 text-[10px] font-black uppercase tracking-widest text-blue-800">
                                Cerrar operativamente si no hay actividad presencial.
                              </div>
                            )}
                            {isHibernated && (
                              <div className="mt-3 bg-zinc-100 border border-zinc-200 rounded-xl p-3 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                Candidata a hibernar / cerrar turno.
                              </div>
                            )}
                            
                            <div className="mt-auto pt-4 flex gap-2">
                              {dangerViewMode === 'actual' && isHibernated ? (
                                <button onClick={() => setResurrectClassModal(c)} className="flex-1 bg-zinc-800 text-white font-black py-2 rounded-lg text-[10px] uppercase tracking-widest hover:bg-black transition-colors flex items-center justify-center gap-1">
                                  <PlusCircle className="w-3 h-3"/> Reactivar
                                </button>
                              ) : (
                                <button onClick={() => dangerViewMode === 'actual' ? setViewClassModal(c) : setPhotosModalOpen(true)} className="flex-1 bg-zinc-100 text-zinc-600 font-black py-2 rounded-lg text-[10px] uppercase tracking-widest hover:bg-black hover:text-white transition-colors flex items-center justify-center gap-1">
                                  <Users className="w-3 h-3"/> {dangerViewMode === 'actual' ? 'Alumnos' : 'Ver fotos'}
                                </button>
                              )}
                              {dangerViewMode === 'actual' && (
                                <button onClick={() => setEditWebModal(c)} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1 ${c.isWebVisible ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'}`}>
                                  <Globe className="w-3 h-3"/> Configurar / Web
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- 6. PROFESORES (NÓMINAS) CON SELECTOR --- */}
        {activeTab === 'teachers' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Estado de Profesores</h2>
                <p className="text-zinc-500 font-medium text-sm">Horas reales, ajustes administrativos y nómina orientativa.</p>
              </div>
              <select 
                value={selectedPayrollMonth} 
                onChange={(e) => setSelectedPayrollMonth(e.target.value)}
                className="bg-white border border-zinc-200 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-800 shadow-sm outline-none cursor-pointer hover:border-black transition-colors"
              >
                {availableMonths.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </header>

            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-xs font-bold text-amber-900 leading-relaxed">
              Los ajustes manuales no alteran los registros de asistencia. Sirven para cotejar con las hojas firmadas físicamente o corregir errores del sistema.
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[850px]">
                  <thead>
                    <tr className="bg-zinc-50 text-[10px] uppercase tracking-widest text-zinc-400 border-b border-zinc-200">
                      <th className="p-4 font-black">Profesor</th>
                      <th className="p-4 font-black text-right">Horas Reales</th>
                      <th className="p-4 font-black text-right">Ajustes</th>
                      <th className="p-4 font-black text-right">Total Liquidable</th>
                      <th className="p-4 font-black text-right">Acumulado (€)</th>
                      <th className="p-4 font-black text-center">Corregir</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-medium text-slate-700">
                    {teachersPayroll.length === 0 ? (
                      <tr><td colSpan="6" className="p-8 text-center text-zinc-400 italic">No hay profesores, registros ni ajustes para este mes.</td></tr>
                    ) : (
                      teachersPayroll.map((t, idx) => (
                        <tr key={idx} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors align-top">
                          <td className="p-4">
                            <div className="font-black uppercase text-slate-900">{t.name}</div>
                            {t.adjustments.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {t.adjustments.map(adj => (
                                  <div key={adj.id} className="flex items-center gap-2 text-[10px] text-zinc-500 bg-zinc-50 border border-zinc-100 rounded-lg px-2 py-1 max-w-md">
                                    <span className={`font-black ${adj.hours > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{adj.hours > 0 ? '+' : ''}{Number(adj.hours).toFixed(2)}h</span>
                                    <span className="truncate flex-1" title={adj.reason}>{adj.reason}</span>
                                    <button onClick={() => deletePayrollAdjustment(adj)} className="text-red-400 hover:text-red-600" title="Borrar ajuste"><Trash2 className="w-3 h-3"/></button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="p-4 text-right font-black">{t.realHours.toFixed(2)} <span className="text-[10px] text-zinc-400 uppercase">h</span></td>
                          <td className={`p-4 text-right font-black ${t.adjustmentHours > 0 ? 'text-emerald-600' : t.adjustmentHours < 0 ? 'text-rose-600' : 'text-zinc-400'}`}>{t.adjustmentHours > 0 ? '+' : ''}{t.adjustmentHours.toFixed(2)} <span className="text-[10px] uppercase">h</span></td>
                          <td className="p-4 text-right font-black text-slate-900">{t.totalHours.toFixed(2)} <span className="text-[10px] text-zinc-400 uppercase">h</span></td>
                          <td className="p-4 text-right font-black text-emerald-600">{t.earnings} <span className="text-[10px] text-emerald-400 uppercase">€</span></td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => setPayrollAdjustModal({ teacher: t.name, mode: 'add' })} className="p-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-lg transition-colors" title="Sumar horas"><Plus className="w-4 h-4"/></button>
                              <button onClick={() => setPayrollAdjustModal({ teacher: t.name, mode: 'subtract' })} className="p-2 bg-rose-100 text-rose-700 hover:bg-rose-600 hover:text-white rounded-lg transition-colors" title="Restar horas"><Minus className="w-4 h-4"/></button>
                            </div>
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
        
        
{/* --- 7. TABLÓN --- */}
        {activeTab === 'announcements' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="mb-6">
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Tablón de Avisos</h2>
              <p className="text-zinc-500 font-medium text-sm">Publica noticias en el tablón de alumnos y profesores.</p>
            </header>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 mb-8">
              <div className="space-y-4">
                <input type="text" placeholder="Titular impactante..." value={newAnnounce.title} onChange={e => setNewAnnounce({...newAnnounce, title: e.target.value})} className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-black outline-none font-black text-sm" />
                <textarea placeholder="Detalles del aviso..." value={newAnnounce.content} onChange={e => setNewAnnounce({...newAnnounce, content: e.target.value})} className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-black outline-none min-h-[100px] resize-y font-medium text-sm" />
                <input type="url" placeholder="URL opcional, por ejemplo https://..." value={newAnnounce.url} onChange={e => setNewAnnounce({...newAnnounce, url: e.target.value})} className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-black outline-none font-bold text-sm" />
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest -mt-2">Si añades URL, el alumno verá un botón clicable en el tablón.</p>
                <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4 space-y-4">
                  <div>
                    <span className="block text-xs font-black uppercase tracking-widest text-sky-900">Destinatarios del aviso en el Tablón</span>
                    <span className="block text-xs text-sky-700 font-semibold mt-1">El aviso aparecerá según el filtro elegido. La opción profesores se publica solo para TeacherPortal.</span>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <select
                      value={announceEmailOptions.targetType}
                      onChange={e => setAnnounceEmailOptions({ ...announceEmailOptions, targetType: e.target.value, targetValue: '' })}
                      className="p-3 bg-white border border-sky-200 rounded-xl outline-none font-black text-xs uppercase tracking-widest text-sky-900"
                    >
                      <option value="all">Todos los alumnos con clase fija</option>
                      <option value="teachers">Solo profesores</option>
                      <option value="sede">Solo una sede</option>
                      <option value="instrumento">Solo un instrumento</option>
                      <option value="profesor">Solo alumnos de un profesor</option>
                    </select>
                    {!['all', 'teachers'].includes(announceEmailOptions.targetType) && (
                      <select
                        value={announceEmailOptions.targetValue}
                        onChange={e => setAnnounceEmailOptions({ ...announceEmailOptions, targetValue: e.target.value })}
                        className="p-3 bg-white border border-sky-200 rounded-xl outline-none font-bold text-sm text-sky-900"
                      >
                        <option value="">Selecciona...</option>
                        {getAnnouncementTargetOptions(announceEmailOptions.targetType).map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    )}
                    <div className="md:col-span-2 text-[11px] font-bold text-sky-800 bg-white/70 rounded-xl px-3 py-2">
                      Destinatarios estimados con email: {getAnnouncementEmailTargets(announceEmailOptions).length} · {getAnnouncementTargetLabel(announceEmailOptions)}
                    </div>
                  </div>
                  <label className="flex items-start gap-3 cursor-pointer select-none pt-2 border-t border-sky-100">
                    <input
                      type="checkbox"
                      checked={announceEmailOptions.enabled}
                      onChange={e => setAnnounceEmailOptions({ ...announceEmailOptions, enabled: e.target.checked })}
                      className="mt-1 w-4 h-4 accent-sky-600"
                    />
                    <span>
                      <span className="block text-xs font-black uppercase tracking-widest text-sky-900">Enviar también por email a esos destinatarios</span>
                      <span className="block text-xs text-sky-700 font-semibold mt-1">Uso recomendado solo para avisos importantes de funcionamiento. No se envía nada si dejas esta casilla desmarcada.</span>
                    </span>
                  </label>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={postAnnouncement} className="bg-black text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-zinc-800 shadow-md">
                    {editingAnnouncementId ? <Save className="w-4 h-4"/> : <Megaphone className="w-4 h-4"/>} {editingAnnouncementId ? 'Guardar Cambios' : 'Publicar Aviso'}
                  </button>
                  {editingAnnouncementId && (
                    <button onClick={cancelEditAnnouncement} className="bg-zinc-100 text-zinc-600 px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-zinc-200">
                      <X className="w-4 h-4"/> Cancelar edición
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-3">
              {announcements.slice(0, visibleAnnouncementsCount).map(ann => (
                <div key={ann.id} className={`bg-white p-5 rounded-2xl shadow-sm border ${editingAnnouncementId === ann.id ? 'border-sky-300 ring-2 ring-sky-100' : 'border-zinc-200'} flex justify-between items-start gap-4`}>
                  <div className="min-w-0">
                    <h4 className="font-black text-slate-800 text-md leading-tight">{ann.title}</h4>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                      {formatDateSpanish(ann.date)} {ann.updatedAt ? '· Editado' : ''}
                    </p>
                    <p className="text-sm text-zinc-600 line-clamp-2">{ann.content}</p>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-sky-700 bg-sky-50 px-2 py-1 rounded-lg">
                        <Users className="w-3 h-3"/> {ann.audienceLabel || getAnnouncementTargetLabel({ targetType: ann.audienceType || 'all', targetValue: ann.audienceValue || '' })}
                      </span>
                      {normalizeAnnouncementUrl(ann.url) && (
                        <a href={normalizeAnnouncementUrl(ann.url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-sky-600 hover:text-sky-800">
                          <Globe className="w-3 h-3"/> Enlace añadido
                        </a>
                      )}
                      {ann.emailNotificationSentAt && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                          <Send className="w-3 h-3"/> Email enviado a {ann.emailNotificationRecipientCount || '?'} · {ann.emailNotificationTargetLabel || 'segmento'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => startEditAnnouncement(ann)} className="p-2 bg-sky-50 text-sky-700 hover:bg-sky-600 hover:text-white rounded-lg transition-colors" title="Editar aviso">
                      <Pencil className="w-4 h-4"/>
                    </button>
                    <button onClick={() => deleteAnnouncement(ann.id)} className="p-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg transition-colors" title="Borrar aviso">
                      <Trash2 className="w-4 h-4"/>
                    </button>
                  </div>
                </div>
              ))}
              {visibleAnnouncementsCount < announcements.length && (
                <button onClick={() => setVisibleAnnouncementsCount(c => c + 10)} className="w-full py-3 rounded-xl border-2 border-dashed border-zinc-300 text-zinc-500 hover:text-slate-900 hover:border-slate-900 font-black uppercase tracking-widest text-xs transition-colors">
                  Cargar más avisos ({Math.min(10, announcements.length - visibleAnnouncementsCount)} más)
                </button>
              )}
            </div>
          </div>
        )}

        {/* --- 8. GAMIFICACIÓN (Rankings en Cascada) --- */}
        {activeTab === 'gamification' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Retos y Rankings</h2>
                <p className="text-zinc-500 font-medium text-sm">Gestiona la competición del trivial.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <button onClick={handleCerrarRetoMensual} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 shadow-md transition-colors">
                  <Timer className="w-3 h-3"/> Cerrar Mes
                </button>
                <button onClick={handleCerrarRetoTrimestral} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 shadow-md transition-colors">
                  <Award className="w-3 h-3"/> Cerrar Trimestre
                </button>
                <button onClick={handleCerrarRetoAnual} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 shadow-md transition-colors">
                  <Star className="w-3 h-3"/> Cerrar Año
                </button>
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* RANKING MENSUAL */}
              <div className="bg-white rounded-2xl shadow-sm border border-emerald-200 flex flex-col h-96">
                <div className="bg-emerald-50 p-4 border-b border-emerald-100 flex items-center justify-between"><h3 className="font-black uppercase tracking-tight text-emerald-900 flex items-center gap-2"><Timer className="w-4 h-4"/> Mensual</h3><span className="bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded text-[10px] font-black uppercase animate-pulse">En curso</span></div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar bg-emerald-50/20">
                  {rankMonthly.map((s, i) => (
                    <div key={s.id} className="flex items-center justify-between p-2 bg-white border border-emerald-100 rounded-lg shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className={`font-black w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${i === 0 ? 'bg-emerald-500 text-white' : i === 1 ? 'bg-slate-300 text-white' : i === 2 ? 'bg-amber-700 text-white' : 'text-zinc-400'}`}>{i+1}</span>
                        <span className="font-bold text-xs text-slate-700 truncate max-w-[120px]" title={s.name}>{s.name}</span>
                      </div>
                      <span className="font-black text-emerald-600 text-xs">{s.triviaPoints}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* RANKING TRIMESTRAL */}
              <div className="bg-white rounded-2xl shadow-sm border border-amber-200 flex flex-col h-96">
                <div className="bg-amber-50 p-4 border-b border-amber-100 flex items-center justify-between"><h3 className="font-black uppercase tracking-tight text-amber-900 flex items-center gap-2"><Award className="w-4 h-4"/> Trimestral</h3></div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar bg-amber-50/20">
                  {rankQuarterly.map((s, i) => (
                    <div key={s.id} className="flex items-center justify-between p-2 bg-white border border-amber-100 rounded-lg shadow-sm">
                      <div className="flex items-center gap-2">
                        <span className={`font-black w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${i === 0 ? 'bg-amber-500 text-white' : 'text-zinc-400'}`}>{i+1}</span>
                        <span className="font-bold text-xs text-slate-700 truncate max-w-[120px]" title={s.name}>{s.name}</span>
                      </div>
                      <span className="font-black text-amber-600 text-xs">{s.liveQuarterly} <span className="text-[8px] uppercase">pts</span></span>
                    </div>
                  ))}
                </div>
              </div>

              {/* RANKING ANUAL */}
              <div className="bg-zinc-900 rounded-2xl shadow-sm border border-zinc-800 flex flex-col h-96">
                <div className="bg-black p-4 border-b border-zinc-800 flex items-center justify-between"><h3 className="font-black uppercase tracking-tight text-white flex items-center gap-2"><Star className="w-4 h-4 text-zinc-400"/> Anual</h3></div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar bg-zinc-900/50">
                  {rankAnnual.map((s, i) => (
                    <div key={s.id} className="flex items-center justify-between p-2 bg-zinc-800 border border-zinc-700 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-zinc-500 text-[10px] w-3">{i+1}.</span>
                        <span className="font-bold text-xs text-zinc-300 truncate max-w-[120px]" title={s.name}>{s.name}</span>
                      </div>
                      <span className="font-black text-white text-xs">{s.liveAnnual} <span className="text-[8px] text-zinc-500 uppercase">pts</span></span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* PREMIOS INTERNOS */}
            <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm mt-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2"><Gift className="w-4 h-4"/> Premios Internos</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <textarea value={settings.prizes?.trimestral || ''} onChange={e => setSettings({...settings, prizes: {...settings.prizes, trimestral: e.target.value}})} placeholder="Premio Trimestral..." className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-black outline-none text-xs font-medium resize-y" />
                <textarea value={settings.prizes?.anual || ''} onChange={e => setSettings({...settings, prizes: {...settings.prizes, anual: e.target.value}})} placeholder="Gran Premio Anual..." className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-black outline-none text-xs font-medium resize-y" />
              </div>
              <button onClick={() => saveGlobalSettings(settings)} className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 px-4 py-2 rounded-lg font-black uppercase tracking-widest text-[10px] transition-colors">Guardar Notas</button>
            </div>
          </div>
        )}

        {/* --- 9. CONFIGURACIÓN COMPLETA (TARIFA, FIJOS E INSTRUMENTOS) --- */}
        {activeTab === 'settings' && (
          <div className="space-y-6 animate-in fade-in">
             <header className="mb-6">
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Configuración Global</h2>
              <p className="text-zinc-500 font-medium text-sm">Ajustes estratégicos de la infraestructura escolar.</p>
            </header>
            
            {/* PANELS DE FINANZAS Y GASTOS (GRID) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Coste Empresa */}
              <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex flex-col h-full">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 mb-4 flex items-center gap-2"><Lock className="w-5 h-5 text-black"/> Costes de Personal</h3>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-6">Lo que el profe ve VS lo que te cuesta a ti.</p>
                
                <div className="space-y-4 mt-auto">
                  <div className="flex items-center justify-between bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-800">Tarifa Convenio (Visible profe)</p>
                      <p className="text-[10px] font-bold text-zinc-400">Calcula su nómina estimada.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="number" step="0.01" value={settings.hourlyRate} onChange={e => setSettings({...settings, hourlyRate: e.target.value})} className="text-lg font-black w-20 p-1 border-b-2 border-black outline-none bg-transparent text-right" />
                      <span className="text-sm font-bold text-slate-800">€/h</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-rose-50 p-4 rounded-xl border border-rose-100">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-rose-900">Coste Empresa (Oculto)</p>
                      <p className="text-[10px] font-bold text-rose-700">Calcula informes de rentabilidad.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="number" step="0.01" value={settings.costeEmpresa} onChange={e => setSettings({...settings, costeEmpresa: e.target.value})} className="text-lg font-black w-20 p-1 border-b-2 border-rose-500 outline-none bg-transparent text-right text-rose-900" />
                      <span className="text-sm font-bold text-rose-800">€/h</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Gastos Fijos */}
              <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex flex-col h-full">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 mb-4 flex items-center gap-2"><Activity className="w-5 h-5 text-black"/> Gastos Fijos Mensuales</h3>
                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-6">Alquileres, luz, agua, cuota de gestoría, etc.</p>
                
                <div className="space-y-3 mt-auto">
                  <div className="flex items-center justify-between bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-800">Gastos Compartidos (Global)</p>
                    <div className="flex items-center gap-2">
                      <input type="number" value={settings.gastosFijos?.global || 0} onChange={e => setSettings({...settings, gastosFijos: {...settings.gastosFijos, global: e.target.value}})} className="text-sm font-black w-20 p-2 border border-zinc-200 rounded-lg outline-none focus:border-black text-right" />
                      <span className="text-xs font-bold text-zinc-500">€</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-blue-50 p-3 rounded-xl border border-blue-100">
                    <p className="text-xs font-black uppercase tracking-widest text-blue-900">Sede Tarragona</p>
                    <div className="flex items-center gap-2">
                      <input type="number" value={settings.gastosFijos?.tarragona || 0} onChange={e => setSettings({...settings, gastosFijos: {...settings.gastosFijos, tarragona: e.target.value}})} className="text-sm font-black w-20 p-2 border border-blue-200 rounded-lg outline-none focus:border-blue-500 text-right text-blue-900" />
                      <span className="text-xs font-bold text-blue-600">€</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-rose-50 p-3 rounded-xl border border-rose-100">
                    <p className="text-xs font-black uppercase tracking-widest text-rose-900">Sede Reus</p>
                    <div className="flex items-center gap-2">
                      <input type="number" value={settings.gastosFijos?.reus || 0} onChange={e => setSettings({...settings, gastosFijos: {...settings.gastosFijos, reus: e.target.value}})} className="text-sm font-black w-20 p-2 border border-rose-200 rounded-lg outline-none focus:border-rose-500 text-right text-rose-900" />
                      <span className="text-xs font-bold text-rose-600">€</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <button onClick={() => saveGlobalSettings(settings)} className="w-full bg-black hover:bg-zinc-800 text-white px-6 py-4 rounded-xl font-black uppercase text-xs tracking-widest shadow-md transition-colors flex items-center justify-center gap-2">
              <Save className="w-4 h-4"/> Guardar Ajustes Financieros
            </button>

            {/* NUEVO: OFERTA DE INSTRUMENTOS DINÁMICA */}
            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm mt-8">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 mb-4 flex items-center gap-2"><Music className="w-5 h-5 text-black"/> Oferta de Instrumentos</h3>
              <div className="flex gap-2 mb-4">
                <input id="adminInstInput" type="text" placeholder="Ej: Saxofón..." className="flex-1 p-3 text-sm bg-zinc-50 border border-zinc-200 outline-none rounded-xl font-bold" />
                <button onClick={() => { 
                  const val = document.getElementById('adminInstInput').value.trim(); 
                  if(val) { 
                    const s = {...settings, instrumentos: [...(settings.instrumentos||defaultInstrumentos), val]}; 
                    setSettings(s); saveGlobalSettings(s); 
                    document.getElementById('adminInstInput').value = ''; 
                  } 
                }} className="bg-black text-white px-6 rounded-xl font-black uppercase text-[10px] hover:bg-zinc-800"><Plus className="w-4 h-4"/></button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(settings.instrumentos || defaultInstrumentos).map((inst, i) => (
                  <span key={i} className="bg-zinc-100 p-2 text-xs font-black uppercase tracking-widest rounded-lg border flex items-center gap-2 text-slate-700">
                    {inst}
                    <button onClick={() => { const s = {...settings, instrumentos: settings.instrumentos.filter((_, idx) => idx !== i)}; setSettings(s); saveGlobalSettings(s); }} className="text-red-500 hover:bg-red-50 p-1 rounded"><X className="w-3 h-3"/></button>
                  </span>
                ))}
              </div>
            </div>

            {/* AFOROS FÍSICOS DE LAS SALAS */}
            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm mt-8">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 mb-4 flex items-center gap-2"><MapPin className="w-5 h-5 text-emerald-600"/> Aforos Físicos de las Salas</h3>
              <p className="text-xs text-zinc-500 font-medium mb-6">Define la capacidad real en personas de cada aula. Esto sirve para el Radar de Mitobox y la Vista de Arquitecto.</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {SEDES.map(sede => (
                    <div key={sede} className="bg-zinc-50 p-5 rounded-2xl border border-zinc-100">
                       <h4 className="font-black uppercase tracking-widest text-slate-800 mb-4">{sede}</h4>
                       <div className="space-y-4">
                         {SALAS.map(sala => (
                            <div key={sala} className="flex items-center justify-between bg-white p-3 rounded-xl border border-zinc-200 shadow-sm">
                               <label className="text-xs font-black uppercase tracking-widest text-zinc-500">{sala}</label>
                               <div className="flex items-center gap-2">
                                 <input type="number" min="1" value={settings.roomCapacities?.[sede]?.[sala] || ''} onChange={e => { const val = parseInt(e.target.value) || 0; const newCaps = JSON.parse(JSON.stringify(settings.roomCapacities || defaultRoomCapacities)); if (!newCaps[sede]) newCaps[sede] = {}; newCaps[sede][sala] = val; setSettings({...settings, roomCapacities: newCaps}); }} className="w-16 p-2 text-center font-black text-sm bg-zinc-100 border border-zinc-200 rounded-lg outline-none" />
                                 <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">pax</span>
                               </div>
                            </div>
                         ))}
                       </div>
                    </div>
                 ))}
              </div>
              <button onClick={() => saveGlobalSettings(settings)} className="mt-6 bg-emerald-600 text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-emerald-700"><Save className="w-4 h-4"/> Guardar Aforos Físicos</button>
            </div>

            {/* CALENDARIO ESCOLAR */}
            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm mt-8">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 mb-4 flex items-center gap-2"><Calendar className="w-5 h-5 text-black"/> Calendario Escolar</h3>
              <div className="flex flex-col sm:flex-row gap-2 mb-6">
                <input id="adminDateInput" type="date" className="flex-1 p-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none font-bold text-sm" />
                <select id="adminDateType" className="flex-[2] p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-black uppercase">
                  <option value="vacaciones">Vacaciones (Ambas sedes)</option>
                  <option value="festivos">Festivo (Ambas sedes)</option>
                  <option value="festivosTarragona">Festivo Local (Solo Tarragona)</option>
                  <option value="festivosReus">Festivo Local (Solo Reus)</option>
                </select>
                <button onClick={() => { const d = document.getElementById('adminDateInput').value; const t = document.getElementById('adminDateType').value; if(d) { const arr = settings[t] || []; if(!arr.includes(d)) { const s = {...settings, [t]: [...arr, d]}; setSettings(s); saveGlobalSettings(s); } } }} className="bg-black text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] hover:bg-zinc-800"><Plus className="w-4 h-4 inline"/></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <h4 className="font-black text-purple-600 uppercase tracking-widest text-[10px] mb-2 flex items-center gap-1"><Palmtree className="w-3 h-3"/> Vacaciones</h4>
                  <div className="space-y-1">
                    {(settings.vacaciones || []).sort().map(v => (
                      <div key={v} className="flex justify-between items-center p-2 bg-purple-50 rounded-lg text-xs font-bold text-purple-900">{formatDateSpanish(v)} <button onClick={() => {const s = {...settings, vacaciones: settings.vacaciones.filter(x => x !== v)}; setSettings(s); saveGlobalSettings(s);}} className="p-1 hover:bg-purple-100 rounded transition-colors"><Trash2 className="w-3 h-3 text-purple-500 hover:text-red-500"/></button></div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-black text-amber-600 uppercase tracking-widest text-[10px] mb-2 flex items-center gap-1"><PartyPopper className="w-3 h-3"/> Festivos (Global)</h4>
                  <div className="space-y-1">
                    {(settings.festivos || []).sort().map(f => (
                      <div key={f} className="flex justify-between items-center p-2 bg-amber-50 rounded-lg text-xs font-bold text-amber-900">{formatDateSpanish(f)} <button onClick={() => {const s = {...settings, festivos: settings.festivos.filter(x => x !== f)}; setSettings(s); saveGlobalSettings(s);}} className="p-1 hover:bg-amber-100 rounded transition-colors"><Trash2 className="w-3 h-3 text-amber-500 hover:text-red-500"/></button></div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-black text-blue-600 uppercase tracking-widest text-[10px] mb-2 flex items-center gap-1"><MapPin className="w-3 h-3"/> Tarragona</h4>
                  <div className="space-y-1">
                    {(settings.festivosTarragona || []).sort().map(f => (
                      <div key={f} className="flex justify-between items-center p-2 bg-blue-50 rounded-lg text-xs font-bold text-blue-900">{formatDateSpanish(f)} <button onClick={() => {const s = {...settings, festivosTarragona: settings.festivosTarragona.filter(x => x !== f)}; setSettings(s); saveGlobalSettings(s);}} className="p-1 hover:bg-blue-100 rounded transition-colors"><Trash2 className="w-3 h-3 text-blue-500 hover:text-red-500"/></button></div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-black text-rose-600 uppercase tracking-widest text-[10px] mb-2 flex items-center gap-1"><MapPin className="w-3 h-3"/> Reus</h4>
                  <div className="space-y-1">
                    {(settings.festivosReus || []).sort().map(f => (
                      <div key={f} className="flex justify-between items-center p-2 bg-rose-50 rounded-lg text-xs font-bold text-rose-900">{formatDateSpanish(f)} <button onClick={() => {const s = {...settings, festivosReus: settings.festivosReus.filter(x => x !== f)}; setSettings(s); saveGlobalSettings(s);}} className="p-1 hover:bg-rose-100 rounded transition-colors"><Trash2 className="w-3 h-3 text-rose-500 hover:text-red-500"/></button></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm mt-8">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 mb-4 flex items-center gap-2"><User className="w-5 h-5 text-black"/> Plantilla de Profesores</h3>
              <div className="flex gap-2 mb-4">
                <input id="adminTeacherInput" type="text" placeholder="Ej: Tano" className="flex-1 p-3 text-sm bg-zinc-50 border border-zinc-200 rounded-xl font-bold" />
                <button onClick={() => { const val = document.getElementById('adminTeacherInput').value.trim(); if(val) { const s = {...settings, teachersList: [...(settings.teachersList||[]), val]}; setSettings(s); saveGlobalSettings(s); document.getElementById('adminTeacherInput').value = ''; } }} className="bg-black text-white px-6 rounded-xl font-black uppercase text-[10px] hover:bg-zinc-800"><Plus className="w-4 h-4"/></button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {(settings.teachersList || []).map((t, i) => {
                  const currentColor = settings.teacherColors?.[t] || getFallbackTeacherColor(t);
                  return (
                    <div key={i} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 p-3 text-xs bg-zinc-50 border border-zinc-100 rounded-xl">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-4 h-4 rounded-full border border-white shadow-sm shrink-0" style={{ background: currentColor }} />
                        <span className="font-black uppercase tracking-widest text-slate-700 truncate">{t}</span>
                      </div>
                      <div className="flex items-center gap-2 justify-between sm:justify-end">
                        <label className="m-0 text-[9px] font-black uppercase tracking-widest text-zinc-400">Color</label>
                        <input
                          type="color"
                          value={currentColor}
                          onChange={(e) => {
                            const s = {
                              ...settings,
                              teacherColors: { ...(settings.teacherColors || {}), [t]: e.target.value }
                            };
                            setSettings(s);
                          }}
                          className="w-10 h-8 p-0 border border-zinc-200 rounded-lg bg-white cursor-pointer"
                          title={`Color de ${t}`}
                        />
                        <button onClick={() => {
                          const nextColors = { ...(settings.teacherColors || {}) };
                          delete nextColors[t];
                          const s = { ...settings, teacherColors: nextColors };
                          setSettings(s);
                        }} className="text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 p-1.5 rounded transition-colors" title="Restaurar color automático">
                          <History className="w-4 h-4"/>
                        </button>
                        <button onClick={() => {
                          const nextColors = { ...(settings.teacherColors || {}) };
                          delete nextColors[t];
                          const s = {
                            ...settings,
                            teachersList: settings.teachersList.filter((_, idx) => idx !== i),
                            teacherColors: nextColors
                          };
                          setSettings(s);
                          saveGlobalSettings(s);
                        }} className="text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors" title="Eliminar profesor"><Trash2 className="w-4 h-4"/></button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">Estos colores se usan en Clases Globales, Vista Arquitecto y Cuadrante Completo.</p>
                <button onClick={() => saveGlobalSettings(settings)} className="bg-zinc-900 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-colors flex items-center justify-center gap-2"><Save className="w-4 h-4"/> Guardar colores</button>
              </div>
            </div>

            {/* PROTOCOLO DE HORA MUERTA */}
            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm mt-8">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 mb-4 flex items-center gap-2"><Timer className="w-5 h-5 text-amber-600"/> Protocolo de Hora Muerta</h3>
              <p className="text-xs text-zinc-500 font-medium mb-4 leading-relaxed">
                Define las tareas que aparecerán al profesor cuando todos los alumnos activos falten sin aviso suficiente y no sea la última clase del día. Añade cada tarea de forma individual.
              </p>

              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <input
                  id="deadHourTaskInput"
                  type="text"
                  placeholder="Ej: Preparar ejercicios personalizados para alumnos"
                  className="flex-1 p-3 text-sm bg-amber-50/40 border border-amber-100 rounded-xl font-bold outline-none focus:border-amber-500 text-slate-700"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = e.currentTarget.value.trim();
                      if (val) {
                        const currentTasks = settings.generalTasks || [];
                        const s = { ...settings, generalTasks: [...currentTasks, val] };
                        setSettings(s);
                        saveGlobalSettings(s);
                        e.currentTarget.value = '';
                      }
                    }
                  }}
                />
                <button onClick={() => {
                  const input = document.getElementById('deadHourTaskInput');
                  const val = input?.value.trim();
                  if (val) {
                    const currentTasks = settings.generalTasks || [];
                    const s = { ...settings, generalTasks: [...currentTasks, val] };
                    setSettings(s);
                    saveGlobalSettings(s);
                    input.value = '';
                  }
                }} className="bg-amber-600 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] hover:bg-amber-700 transition-colors flex items-center justify-center gap-2"><Plus className="w-4 h-4"/> Añadir</button>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-2">
                {(settings.generalTasks || []).length === 0 ? (
                  <div className="p-4 bg-amber-50/50 border border-dashed border-amber-200 rounded-xl text-xs font-bold text-amber-700 uppercase tracking-widest text-center">
                    No hay tareas configuradas. El TeacherPortal usará tareas básicas por defecto.
                  </div>
                ) : (
                  (settings.generalTasks || []).map((task, i) => (
                    <div key={`${task}-${i}`} className="flex justify-between items-center gap-3 p-3 text-xs bg-amber-50/40 border border-amber-100 rounded-xl">
                      <span className="font-black uppercase tracking-widest text-slate-700 leading-relaxed">{task}</span>
                      <button onClick={() => {
                        const s = { ...settings, generalTasks: (settings.generalTasks || []).filter((_, idx) => idx !== i) };
                        setSettings(s);
                        saveGlobalSettings(s);
                      }} className="text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors shrink-0"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4">
                <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">
                  Tareas activas: {(settings.generalTasks || []).length}
                </p>
                <button onClick={() => saveGlobalSettings(settings)} className="bg-zinc-100 text-zinc-800 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 transition-colors">Guardar Ajustes</button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm mt-8">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-600"/> Normativa para Profesores</h3>
              <textarea value={settings.teacherRules || ''} onChange={e => setSettings({...settings, teacherRules: e.target.value})} className="w-full p-5 bg-indigo-50/30 border border-indigo-100 rounded-2xl outline-none font-medium text-sm text-slate-700 min-h-[150px] resize-y" />
              <button onClick={() => saveGlobalSettings(settings)} className="mt-4 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest">Guardar Normativa</button>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm mt-8">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-black"/> Contrato de Servicios (Alumnos)</h3>
              <textarea value={settings.contract || ''} onChange={e => setSettings({...settings, contract: e.target.value})} className="w-full p-5 bg-zinc-50 border border-zinc-200 rounded-2xl outline-none font-medium text-sm text-slate-700 min-h-[150px] resize-y" />
              <button onClick={() => saveGlobalSettings(settings)} className="mt-4 bg-black text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest">Guardar Contrato</button>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm mt-8">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-indigo-600"/> Importador Masivo (Excel)</h3>
              <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Pega aquí las filas del Excel..." className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-2xl font-mono text-xs text-slate-700 min-h-[120px] mb-4"/>
              <button onClick={handleMassImport} disabled={isImporting || !importText} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-4 rounded-xl font-black uppercase text-xs tracking-widest disabled:opacity-50">{isImporting ? 'Importando...' : 'Importar Alumnos Ahora'}</button>
            </div>

          </div>
        )}

      </main>
    </div>
  );
}
