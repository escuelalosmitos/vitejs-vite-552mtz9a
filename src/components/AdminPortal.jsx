// AdminPortal · configuración multi-sede dinámica y compatible con datos heredados
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Inbox, ClipboardList, Users, User, Megaphone, Settings, LogOut, Search, MonitorPlay, 
  DoorOpen, Check, X, Trash2, Calendar, FileText, Plus, ShieldAlert, 
  ArrowRightLeft, PartyPopper, Palmtree, Lock, Trophy, Award, Gift, Star, 
  Target, Timer, BookOpen, AlertTriangle, Calculator, ChevronDown, ChevronUp, History, UserMinus, Info, Clock, CheckCircle, Ticket, Pencil, AlertCircle, Ghost, PlusCircle, MapPin, Globe, LayoutGrid, Save, TrendingUp, DollarSign, PieChart, Activity, Music, Minus, Snowflake, Send, Mail
} from 'lucide-react';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, collectionGroup, writeBatch, getDocs, query, where, runTransaction } from 'firebase/firestore';
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz_MEKpKnv-L1g0e1khYf45nXCQKuUx6ZP3-bYwypTyrYzWadR4yzDd4ambExbQquvo/exec";
const ADMIN_GESTION_EMAIL = "gestiones@escuelalosmitos.com";
const ADMIN_COPY_GESTION_TYPES = new Set(["baja", "mantenimiento", "reactivar_plaza", "ampliar_clases", "cambio_horario", "alta_mitoverso", "alta_mitobox"]);
const ANNOUNCEMENT_EMAIL_TO = "gestiones@escuelalosmitos.com";
const ANNOUNCEMENT_EMAIL_BATCH_SIZE = 50;
const BI_WEEKS_PER_MONTH = 4.333;
const MAINTENANCE_MONTHLY_FEE = 15;
const STUDENT_PORTAL_URL = "alumnos.escuelalosmitos.com";
const SUPPORT_EMAIL = "soporte@escuelalosmitos.com";

const createPollOption = (label = '') => ({
  id: `option-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  label
});

const createEmptyAnnouncementDraft = () => ({
  type: 'notice',
  title: '',
  content: '',
  url: '',
  pollAnswerType: 'single',
  pollOptions: [createPollOption(), createPollOption()],
  pollDeadline: '',
  pollPrivacy: 'identified',
  pollAllowEdit: true,
  pollResultsVisibility: 'never'
});

const LEGACY_CENTER_NAMES = ["Tarragona", "Reus"];
const LEGACY_ROOM_NAMES = ["Sala 1", "Sala 2", "Sala 3"];

const SCHEDULE_HOURS = ["09:00", "10:00", "11:00", "12:00", "13:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"];

const defaultRoomCapacities = {
  Tarragona: { 'Sala 1': 10, 'Sala 2': 8, 'Sala 3': 4 },
  Reus: { 'Sala 1': 8, 'Sala 2': 5, 'Sala 3': 4 }
};

const normalizeConfigId = (value = '', fallback = 'item') => {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
};

const DEFAULT_CENTERS = [
  {
    id: 'tarragona',
    name: 'Tarragona',
    aliases: [],
    status: 'active',
    type: 'owned',
    operatorId: 'los-mitos',
    address: '',
    phone: '',
    email: '',
    reviewUrl: '',
    fixedMonthlyCost: 0,
    holidays: [],
    rooms: LEGACY_ROOM_NAMES.map(name => ({
      id: normalizeConfigId(name, 'sala'),
      name,
      aliases: [],
      capacity: defaultRoomCapacities.Tarragona[name] || 0,
      mitoboxEnabled: true,
      active: true
    }))
  },
  {
    id: 'reus',
    name: 'Reus',
    aliases: [],
    status: 'active',
    type: 'owned',
    operatorId: 'los-mitos',
    address: '',
    phone: '',
    email: '',
    reviewUrl: '',
    fixedMonthlyCost: 0,
    holidays: [],
    rooms: LEGACY_ROOM_NAMES.map(name => ({
      id: normalizeConfigId(name, 'sala'),
      name,
      aliases: [],
      capacity: defaultRoomCapacities.Reus[name] || 0,
      mitoboxEnabled: true,
      active: true
    }))
  }
];

const uniqueStrings = (values = []) => [...new Set((values || [])
  .map(value => String(value || '').trim())
  .filter(Boolean))];

const getClassStudentIds = (classStudents = []) => uniqueStrings((classStudents || [])
  .map(studentEntry => studentEntry?.id || studentEntry?.studentId));

const withClassStudentIndex = (classStudents = []) => ({
  students: classStudents,
  studentIds: getClassStudentIds(classStudents)
});

const ADMIN_STARTUP_DATA_LABELS = {
  gestiones: 'Bandeja de gestiones',
  students: 'Alumnos',
  settings: 'Configuración global',
  classes: 'Clases',
  tickets: 'Tickets de recuperación',
  temporaryRelocations: 'Recolocaciones temporales',
  temporaryClassChanges: 'Cambios temporales de clase',
  maintenancePeriods: 'Periodos de mantenimiento',
  teacherTasks: 'Tareas y peticiones de profesores',
  workshopRegistrations: 'Inscripciones en talleres'
};

const ADMIN_DEFERRED_DATA_LABELS = {
  announcements: 'Avisos del tablón',
  availability: 'Disponibilidad docente',
  records: 'Historial de asistencias',
  payrollAdjustments: 'Ajustes de nómina',
  teacherEvaluations: 'Evaluaciones docentes',
  pollResponses: 'Respuestas de encuestas'
};

const ADMIN_TAB_DEFERRED_DATA_KEYS = {
  classes: ['availability'],
  teachers: ['availability', 'records', 'payrollAdjustments', 'teacherEvaluations'],
  announcements: ['announcements', 'pollResponses'],
  gamification: ['announcements']
};

const ADMIN_VERIFIED_QUERY_TIMEOUT_MS = 20000;

const subscribeVerifiedAdminSnapshot = ({ reference, label, applySnapshot, onStatus }) => {
  let disposed = false;
  let serverVerified = false;
  let verificationTimeoutId;

  const handleError = error => {
    if (disposed) return;
    console.error(`No se pudo cargar ${label}:`, error);
    onStatus('error');
  };

  const unsubscribe = onSnapshot(
    reference,
    { includeMetadataChanges: true },
    snapshot => {
      if (disposed) return;
      try {
        applySnapshot(snapshot);
        if (snapshot.metadata?.fromCache === true) return;
        serverVerified = true;
        if (verificationTimeoutId) window.clearTimeout(verificationTimeoutId);
        onStatus('ready');
      } catch (error) {
        handleError(error);
      }
    },
    handleError
  );

  verificationTimeoutId = window.setTimeout(() => {
    if (!serverVerified) handleError(new Error('Tiempo de espera agotado'));
  }, ADMIN_VERIFIED_QUERY_TIMEOUT_MS);

  return () => {
    disposed = true;
    if (verificationTimeoutId) window.clearTimeout(verificationTimeoutId);
    unsubscribe();
  };
};

const haveSameStringValues = (left = [], right = []) => {
  const normalizedLeft = uniqueStrings(left).sort();
  const normalizedRight = uniqueStrings(right).sort();
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
};

const getLegacyCenterHolidays = (center = {}, legacySettings = {}) => {
  const centerId = normalizeConfigId(center.id || center.name, 'sede');
  if (centerId === 'tarragona') return legacySettings.festivosTarragona || [];
  if (centerId === 'reus') return legacySettings.festivosReus || [];
  return legacySettings.centerHolidays?.[centerId] || [];
};

const normalizeCenters = (rawCenters = [], legacySettings = {}) => {
  const hasConfiguredCenters = Array.isArray(rawCenters) && rawCenters.length > 0;
  const source = hasConfiguredCenters ? rawCenters : DEFAULT_CENTERS;
  const usedCenterIds = new Set();

  return source.map((rawCenter, centerIndex) => {
    const name = String(rawCenter?.name || LEGACY_CENTER_NAMES[centerIndex] || `Sede ${centerIndex + 1}`).trim();
    const baseCenterId = normalizeConfigId(rawCenter?.id || name, `sede-${centerIndex + 1}`);
    let id = baseCenterId;
    let duplicateIndex = 2;
    while (usedCenterIds.has(id)) {
      id = `${baseCenterId}-${duplicateIndex}`;
      duplicateIndex += 1;
    }
    usedCenterIds.add(id);

    const legacyCapacities = legacySettings.roomCapacities?.[name]
      || legacySettings.roomCapacities?.[rawCenter?.name]
      || defaultRoomCapacities[name]
      || {};
    const rawRooms = Array.isArray(rawCenter?.rooms) && rawCenter.rooms.length > 0
      ? rawCenter.rooms
      : Object.keys(legacyCapacities).map(roomName => ({ name: roomName, capacity: legacyCapacities[roomName] }));
    const roomSource = rawRooms.length > 0
      ? rawRooms
      : LEGACY_ROOM_NAMES.map(roomName => ({ name: roomName, capacity: 0 }));
    const usedRoomIds = new Set();
    const rooms = roomSource.map((rawRoom, roomIndex) => {
      const roomName = String(rawRoom?.name || `Sala ${roomIndex + 1}`).trim();
      const baseRoomId = normalizeConfigId(rawRoom?.id || roomName, `sala-${roomIndex + 1}`);
      let roomId = baseRoomId;
      let roomDuplicateIndex = 2;
      while (usedRoomIds.has(roomId)) {
        roomId = `${baseRoomId}-${roomDuplicateIndex}`;
        roomDuplicateIndex += 1;
      }
      usedRoomIds.add(roomId);
      const legacyCapacity = legacyCapacities[roomName];
      return {
        id: roomId,
        name: roomName,
        aliases: uniqueStrings(rawRoom?.aliases || []),
        capacity: Number(hasConfiguredCenters ? (rawRoom?.capacity ?? legacyCapacity ?? 0) : (legacyCapacity ?? rawRoom?.capacity ?? 0)) || 0,
        mitoboxEnabled: rawRoom?.mitoboxEnabled !== false,
        active: rawRoom?.active !== false
      };
    });

    const legacyFixedCosts = legacySettings.gastosFijos || {};
    const legacyFixedCost = legacyFixedCosts[id]
      ?? legacyFixedCosts[normalizeConfigId(name, id)]
      ?? 0;
    const holidays = hasConfiguredCenters
      ? uniqueStrings(rawCenter?.holidays || legacySettings.centerHolidays?.[id] || [])
      : uniqueStrings(getLegacyCenterHolidays({ id, name }, legacySettings));

    return {
      id,
      name,
      aliases: uniqueStrings(rawCenter?.aliases || []),
      status: ['draft', 'active', 'inactive'].includes(rawCenter?.status) ? rawCenter.status : 'active',
      type: rawCenter?.type === 'franchise' ? 'franchise' : 'owned',
      operatorId: String(rawCenter?.operatorId || 'los-mitos').trim(),
      address: String(rawCenter?.address || '').trim(),
      phone: String(rawCenter?.phone || '').trim(),
      email: String(rawCenter?.email || '').trim(),
      reviewUrl: String(rawCenter?.reviewUrl || '').trim(),
      fixedMonthlyCost: Number(hasConfiguredCenters ? (rawCenter?.fixedMonthlyCost ?? legacyFixedCost ?? 0) : (legacyFixedCost ?? rawCenter?.fixedMonthlyCost ?? 0)) || 0,
      holidays,
      rooms,
      createdAt: rawCenter?.createdAt || '',
      updatedAt: rawCenter?.updatedAt || '',
      updatedBy: rawCenter?.updatedBy || ''
    };
  });
};

const findCenterByValue = (centers = [], value = '') => {
  const normalizedValue = normalizeConfigId(value, '');
  const plainValue = String(value || '').trim().toLocaleLowerCase('es');
  return (centers || []).find(center => (
    center.id === value
    || normalizeConfigId(center.id, '') === normalizedValue
    || String(center.name || '').trim().toLocaleLowerCase('es') === plainValue
    || (center.aliases || []).some(alias => String(alias || '').trim().toLocaleLowerCase('es') === plainValue)
  )) || null;
};

const findRoomByValue = (center, value = '') => {
  if (!center) return null;
  const normalizedValue = normalizeConfigId(value, '');
  const plainValue = String(value || '').trim().toLocaleLowerCase('es');
  return (center.rooms || []).find(room => (
    room.id === value
    || normalizeConfigId(room.id, '') === normalizedValue
    || String(room.name || '').trim().toLocaleLowerCase('es') === plainValue
    || (room.aliases || []).some(alias => String(alias || '').trim().toLocaleLowerCase('es') === plainValue)
  )) || null;
};

const buildLegacyCenterSettings = (centers = [], currentSettings = {}) => {
  const roomCapacities = {};
  const centerHolidays = {};
  const gastosFijos = { global: Number(currentSettings.gastosFijos?.global || 0) || 0 };

  centers.forEach(center => {
    roomCapacities[center.name] = {};
    (center.rooms || []).forEach(room => {
      roomCapacities[center.name][room.name] = Number(room.capacity || 0) || 0;
    });
    centerHolidays[center.id] = uniqueStrings(center.holidays || []);
    gastosFijos[center.id] = Number(center.fixedMonthlyCost || 0) || 0;
  });

  const tarragona = findCenterByValue(centers, 'tarragona');
  const reus = findCenterByValue(centers, 'reus');
  return {
    roomCapacities,
    centerHolidays,
    gastosFijos,
    festivosTarragona: uniqueStrings(tarragona?.holidays || currentSettings.festivosTarragona || []),
    festivosReus: uniqueStrings(reus?.holidays || currentSettings.festivosReus || [])
  };
};

const defaultInstrumentos = ["Guitarra", "Canto", "Teclado", "Batería", "Bajo", "Ukelele", "Armónica", "Sensibilización", "Violín"];

const PROJECTABLE_GESTION_TYPES = new Set(["baja", "mantenimiento", "reactivar_plaza", "cambio_horario", "ampliar_clases"]);
const TADOSI_REQUIRED_GESTION_TYPES = new Set(["baja", "mantenimiento", "reactivar_plaza", "cambio_horario", "ampliar_clases", "alta_mitoverso", "alta_mitobox"]);
const HISTORIAL_TRAMITES_BLOCK_SIZE = 30;

const EXTRA_SERVICE_GESTION_TYPES = new Set(["alta_mitoverso", "alta_mitobox"]);
const EXTRA_SERVICE_CONFIG_BY_TYPE = {
  alta_mitoverso: {
    key: 'mitoverso',
    name: 'Mitoverso',
    studentFlag: 'hasMitoverso',
    monthlyFee: 15,
    activationTarget: 'Classroom/Mitoverso',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    readyActionLabel: 'Activar Mitoverso'
  },
  alta_mitobox: {
    key: 'mitobox',
    name: 'Mitobox',
    studentFlag: 'hasMitobox',
    monthlyFee: 35,
    activationTarget: 'Mitobox / reserva de sala',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
    readyActionLabel: 'Activar Mitobox'
  }
};

const getExtraServiceConfigByType = (type = '') => EXTRA_SERVICE_CONFIG_BY_TYPE[type] || null;
const isExtraServiceGestionType = (type = '') => EXTRA_SERVICE_GESTION_TYPES.has(type);

const WORKSHOP_STATUS_OPTIONS = [
  { value: 'draft', label: 'Borrador' },
  { value: 'published', label: 'Publicado' },
  { value: 'registration_closed', label: 'Inscripción cerrada' },
  { value: 'completed', label: 'Finalizado' },
  { value: 'cancelled', label: 'Cancelado' }
];

const WORKSHOP_STATUS_STYLE = {
  draft: 'bg-zinc-100 text-zinc-600 border-zinc-200',
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  registration_closed: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-blue-50 text-blue-700 border-blue-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200'
};

const WORKSHOP_REGISTRATION_STATUS_LABELS = {
  pending: 'Pendiente',
  confirmed: 'Confirmada',
  waitlist: 'Lista de espera',
  rejected: 'Rechazada',
  cancelled: 'Cancelada'
};

const WORKSHOP_REGISTRATION_STATUS_STYLE = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  waitlist: 'bg-blue-50 text-blue-700 border-blue-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-zinc-50 text-zinc-500 border-zinc-200'
};

const createWorkshopLocalId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const getLocalDateTimeInputValue = (date = new Date()) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - (offset * 60000)).toISOString().slice(0, 16);
};

const createEmptyWorkshop = () => ({
  title: '',
  shortDescription: '',
  description: '',
  imageUrl: '',
  sessions: [{ id: createWorkshopLocalId(), date: '', startTime: '17:00', endTime: '18:00' }],
  registrationDeadline: '',
  publishAt: getLocalDateTimeInputValue(),
  locationType: 'Tarragona',
  room: '',
  externalLocation: '',
  instructor: '',
  unlimitedCapacity: false,
  capacity: 10,
  minimumParticipants: '',
  waitlistEnabled: true,
  priceType: 'free',
  price: '',
  paymentMethod: 'next_debit',
  priceNote: '',
  audienceType: 'all',
  audienceValue: '',
  manualStudentIds: [],
  ageMin: '',
  ageMax: '',
  level: 'all',
  customLevel: '',
  registrationMode: 'automatic',
  cancellationMode: 'contact_admin',
  cancellationDeadline: '',
  questions: [],
  whatToBring: '',
  importantNotes: '',
  contact: '',
  resourceUrl: '',
  status: 'draft',
  featured: false,
  cancellationMessage: ''
});

const getWorkshopStatusLabel = (status = 'draft') => WORKSHOP_STATUS_OPTIONS.find(option => option.value === status)?.label || status;

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

const TEACHER_EVALUATION_QUESTIONS = [
  { key: 'clarity', label: 'El profesor explica de forma clara y comprensible.', shortLabel: 'Claridad' },
  { key: 'knowledge', label: 'Percibo que el profesor domina su instrumento y el contenido que imparte.', shortLabel: 'Dominio' },
  { key: 'adaptation', label: 'El profesor adapta la clase a mi nivel y necesidades.', shortLabel: 'Adaptación' },
  { key: 'organization', label: 'La clase está bien organizada y se aprovecha el tiempo.', shortLabel: 'Organización' },
  { key: 'motivation', label: 'El profesor me motiva y me anima a mejorar.', shortLabel: 'Motivación' },
  { key: 'progress', label: 'Siento que he mejorado durante el último trimestre.', shortLabel: 'Progreso' },
  { key: 'homeworkClarity', label: 'Sé qué tengo que practicar en casa.', shortLabel: 'Tareas claras' },
  { key: 'resourcesUseful', label: 'Los materiales o recursos me resultan útiles para practicar.', shortLabel: 'Recursos' },
  { key: 'recommendation', label: 'Recomendaría este profesor a otro alumno.', shortLabel: 'Recomendación' }
];

const normalizeEvaluationRating = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 && number <= 5 ? number : null;
};

const averageNumbers = (values = []) => {
  const cleanValues = values.filter(value => Number.isFinite(value));
  if (cleanValues.length === 0) return null;
  return cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length;
};

const formatAverageScore = (value) => Number.isFinite(value)
  ? value.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  : '—';


const formatDateSpanish = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getLocalDayOfWeek = (dateString) => {
  if (!dateString) return null;
  const date = new Date(`${dateString}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getDay();
};

const formatPublicContestantName = (studentOrName = {}) => {
  const student = typeof studentOrName === 'string' ? { name: studentOrName } : (studentOrName || {});
  const explicitFirstName = String(student.firstName || student.nombre || '').trim();
  const explicitSurnames = String(student.lastName || student.surnames || student.apellidos || '').trim();

  if (explicitFirstName && explicitSurnames) {
    const initials = explicitSurnames.split(/\s+/).filter(Boolean).map(part => `${part.charAt(0).toUpperCase()}.`).join(' ');
    return `${explicitFirstName} ${initials}`.trim();
  }

  const parts = String(student.name || student.displayName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || 'Alumno/a';
  return `${parts[0]} ${parts.slice(1).map(part => `${part.charAt(0).toUpperCase()}.`).join(' ')}`;
};

const buildTriviaPodium = (students = [], scoreGetter = () => 0) => {
  const ranked = students
    .map(student => ({ student, score: Number(scoreGetter(student)) || 0 }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || String(a.student.name || '').localeCompare(String(b.student.name || ''), 'es'));

  const scoreLevels = [...new Set(ranked.map(item => item.score))].slice(0, 3);
  return scoreLevels.map((score, index) => ({
    position: index + 1,
    score,
    students: ranked.filter(item => item.score === score).map(item => item.student)
  }));
};

const formatTriviaPodium = (label, podium = []) => {
  const medals = ['🥇', '🥈', '🥉'];
  const lines = podium.map(group => `${medals[group.position - 1] || `${group.position}.`} ${group.students.map(formatPublicContestantName).join(', ')} — ${group.score} puntos`);
  return `${label}:\n${lines.join('\n')}`;
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

const doClassTimeRangesOverlap = (left = {}, right = {}) => {
  const leftRange = getClassTimeRange(left.time, left.duration);
  const rightRange = getClassTimeRange(right.time, right.duration);
  if (!leftRange || !rightRange) return false;
  return leftRange.start < rightRange.end && rightRange.start < leftRange.end;
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
  // El BOM hace que Excel, Bloc de notas y otros programas de Windows
  // detecten UTF-8 correctamente (tildes, ñ, €, símbolos y emojis).
  const normalizedContent = String(content ?? '').replace(/^\uFEFF/, '').normalize('NFC');
  const utf8Content = `\uFEFF${normalizedContent}`;
  const blob = new Blob([utf8Content], { type: mimeType });
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

const dateRangeContainsWeekday = (from, until, dayOfWeek) => {
  const start = parseLocalDateString(from);
  const end = parseLocalDateString(until);
  const targetDay = Number(dayOfWeek);
  if (!start || !end || !Number.isFinite(targetDay) || start > end) return false;
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() + ((targetDay - cursor.getDay() + 7) % 7));
  return cursor <= end;
};

const cleanTeacherDisplayName = (name = '') => String(name || '')
  .trim()
  .replace(/\s+/g, ' ');

const normalizeTeacherKey = (name = '') => cleanTeacherDisplayName(name)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es-ES');

const isSameTeacher = (left, right) => Boolean(normalizeTeacherKey(left)) && normalizeTeacherKey(left) === normalizeTeacherKey(right);

const getFallbackTeacherColor = (teacherName = 'Sin Asignar') => {
  const cleanName = cleanTeacherDisplayName(teacherName || 'Sin Asignar');
  if (!cleanName || cleanName === 'Sin Asignar') return DEFAULT_TEACHER_COLOR;
  let hash = 0;
  for (let i = 0; i < cleanName.length; i++) {
    hash = cleanName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TEACHER_DEFAULT_COLORS[Math.abs(hash) % TEACHER_DEFAULT_COLORS.length];
};

const getTeacherColorTheme = (teacherName = 'Sin Asignar', settings = {}) => {
  const cleanName = cleanTeacherDisplayName(teacherName || 'Sin Asignar');
  const matchingConfiguredName = Object.keys(settings?.teacherColors || {}).find(name => isSameTeacher(name, cleanName));
  const configuredColor = matchingConfiguredName ? settings.teacherColors[matchingConfiguredName] : undefined;
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
  const teacherOptions = useMemo(() => {
    const officialNames = new Map();
    [...(settings?.teachersList || []), ...(recurringClassesOnly || []).map(c => c.teacher)]
      .filter(Boolean)
      .forEach(name => {
        const cleanName = cleanTeacherDisplayName(name);
        const key = normalizeTeacherKey(cleanName);
        if (key && !officialNames.has(key)) officialNames.set(key, cleanName);
      });
    return [...officialNames.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }, [settings?.teachersList, recurringClassesOnly]);

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

    const isClosedRelocationStatus = (status = 'active') => ['cancelled', 'cancelada', 'expired', 'finalizada'].includes(String(status || 'active').toLowerCase());

    const overlappingSameSource = (temporaryRelocations || []).find(rel =>
      rel.studentId === student.id &&
      !isClosedRelocationStatus(rel.status) &&
      rel.sourceClassId === sourceClass.id &&
      doDateRangesOverlap(fromDate, untilDate, rel.from, rel.until)
    );

    if (overlappingSameSource) {
      return alert(`Este alumno ya tiene una recolocación temporal de esta misma plaza que se solapa con esas fechas:\n\n${overlappingSameSource.sourceClassLine || overlappingSameSource.sourceClassId}\n→ ${overlappingSameSource.targetClassLine || overlappingSameSource.targetClassId}\n${formatDateSpanish(overlappingSameSource.from)} - ${formatDateSpanish(overlappingSameSource.until)}`);
    }

    const overlappingSameTarget = (temporaryRelocations || []).find(rel =>
      rel.studentId === student.id &&
      !isClosedRelocationStatus(rel.status) &&
      rel.targetClassId === targetClass.id &&
      doDateRangesOverlap(fromDate, untilDate, rel.from, rel.until)
    );

    if (overlappingSameTarget) {
      return alert(`Este alumno ya está recolocado temporalmente en esta misma clase de destino durante fechas que se solapan:\n\n${overlappingSameTarget.sourceClassLine || overlappingSameTarget.sourceClassId}\n→ ${overlappingSameTarget.targetClassLine || overlappingSameTarget.targetClassId}\n${formatDateSpanish(overlappingSameTarget.from)} - ${formatDateSpanish(overlappingSameTarget.until)}`);
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

const WorkshopAdminSection = ({ db, appId, user, settings, centers = [], students, allClasses, registrations = [] }) => {
  const workshopCenters = centers.filter(center => center.status === 'active');
  const selectableWorkshopCenters = workshopCenters.length > 0 ? workshopCenters : centers.slice(0, 1);
  const defaultWorkshopCenterName = selectableWorkshopCenters[0]?.name || 'Tarragona';
  const createWorkshopDraft = () => ({ ...createEmptyWorkshop(), locationType: defaultWorkshopCenterName });
  const [workshops, setWorkshops] = useState([]);
  const [loadingWorkshops, setLoadingWorkshops] = useState(true);
  const [workshopLoadError, setWorkshopLoadError] = useState('');
  const [workshopRetryVersion, setWorkshopRetryVersion] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(createWorkshopDraft);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [expandedWorkshopId, setExpandedWorkshopId] = useState(null);

  useEffect(() => {
    setLoadingWorkshops(true);
    setWorkshopLoadError('');
    return subscribeVerifiedAdminSnapshot({
      reference: collection(db, 'artifacts', appId, 'workshops'),
      label: 'los talleres',
      applySnapshot: snap => {
        setWorkshops(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(a.sessions?.[0]?.date || '2999-12-31') - new Date(b.sessions?.[0]?.date || '2999-12-31')));
      },
      onStatus: status => {
        if (status === 'ready') {
          setWorkshopLoadError('');
          setLoadingWorkshops(false);
          return;
        }
        setWorkshopLoadError('No se han podido verificar los talleres. No se mostrará una lista vacía porque podría ser incorrecta.');
        setLoadingWorkshops(false);
      }
    });
  }, [appId, db, workshopRetryVersion]);

  const getWorkshopRegistrations = workshopId => registrations.filter(registration => registration.workshopId === workshopId);

  const getRegistrationSummary = workshopId => {
    const workshopRegistrations = getWorkshopRegistrations(workshopId);
    return {
      confirmed: workshopRegistrations.filter(item => item.status === 'confirmed').length,
      pending: workshopRegistrations.filter(item => item.status === 'pending').length,
      waitlist: workshopRegistrations.filter(item => item.status === 'waitlist').length,
      total: workshopRegistrations.filter(item => !['cancelled', 'rejected'].includes(item.status)).length
    };
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(createWorkshopDraft());
    setAdvancedOpen(false);
    setFormOpen(false);
  };

  const openNewWorkshop = () => {
    setEditingId(null);
    setForm(createWorkshopDraft());
    setAdvancedOpen(false);
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const editWorkshop = workshop => {
    setEditingId(workshop.id);
    setForm({
      ...createEmptyWorkshop(),
      ...workshop,
      sessions: (workshop.sessions || []).map(session => ({ ...session, id: session.id || createWorkshopLocalId() })),
      manualStudentIds: workshop.manualStudentIds || [],
      questions: (workshop.questions || []).map(question => ({ ...question, id: question.id || createWorkshopLocalId(), optionsText: (question.options || []).join(', ') }))
    });
    setAdvancedOpen(Boolean(workshop.ageMin || workshop.ageMax || workshop.customLevel || workshop.questions?.length || workshop.whatToBring || workshop.importantNotes || workshop.contact || workshop.resourceUrl));
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateSession = (sessionId, field, value) => {
    setForm(prev => ({ ...prev, sessions: prev.sessions.map(session => session.id === sessionId ? { ...session, [field]: value } : session) }));
  };

  const addSession = () => {
    const previous = form.sessions[form.sessions.length - 1] || {};
    setForm(prev => ({
      ...prev,
      sessions: [...prev.sessions, { id: createWorkshopLocalId(), date: previous.date || '', startTime: previous.startTime || '17:00', endTime: previous.endTime || '18:00' }]
    }));
  };

  const removeSession = sessionId => {
    if (form.sessions.length === 1) return;
    setForm(prev => ({ ...prev, sessions: prev.sessions.filter(session => session.id !== sessionId) }));
  };

  const addQuestion = () => setForm(prev => ({
    ...prev,
    questions: [...prev.questions, { id: createWorkshopLocalId(), label: '', type: 'text', required: false, optionsText: '' }]
  }));

  const updateQuestion = (questionId, field, value) => setForm(prev => ({
    ...prev,
    questions: prev.questions.map(question => question.id === questionId ? { ...question, [field]: value } : question)
  }));

  const toggleManualStudent = studentId => setForm(prev => ({
    ...prev,
    manualStudentIds: prev.manualStudentIds.includes(studentId)
      ? prev.manualStudentIds.filter(id => id !== studentId)
      : [...prev.manualStudentIds, studentId]
  }));

  const validateWorkshop = (workshopData = form, targetStatus = workshopData.status) => {
    if (!String(workshopData.title || '').trim()) return 'Escribe el nombre del taller.';
    if (targetStatus === 'draft') return '';
    if (!String(workshopData.shortDescription || '').trim()) return 'Escribe una descripción breve para la tarjeta de Extras.';
    if (!String(workshopData.description || '').trim()) return 'Escribe la descripción completa del taller.';
    if (!workshopData.sessions?.length || workshopData.sessions.some(session => !session.date || !session.startTime || !session.endTime)) return 'Completa la fecha y el horario de todas las sesiones.';
    if (workshopData.sessions.some(session => session.endTime <= session.startTime)) return 'La hora de finalización debe ser posterior a la de inicio.';
    if (!workshopData.registrationDeadline) return 'Indica la fecha límite de inscripción.';
    const firstSessionStart = [...workshopData.sessions].sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))[0];
    if (firstSessionStart && workshopData.registrationDeadline >= `${firstSessionStart.date}T${firstSessionStart.startTime}`) return 'La inscripción debe cerrarse antes de que empiece la primera sesión.';
    if (!workshopData.unlimitedCapacity && (!Number.isFinite(Number(workshopData.capacity)) || Number(workshopData.capacity) < 1)) return 'Indica un número de plazas válido.';
    if (workshopData.minimumParticipants && Number(workshopData.minimumParticipants) < 1) return 'El mínimo de participantes debe ser mayor que cero.';
    if (!workshopData.unlimitedCapacity && workshopData.minimumParticipants && Number(workshopData.minimumParticipants) > Number(workshopData.capacity)) return 'El mínimo de participantes no puede superar el número de plazas.';
    if (workshopData.priceType === 'paid' && (!Number.isFinite(Number(workshopData.price)) || Number(workshopData.price) < 0)) return 'Indica un precio válido.';
    if (['sede', 'instrument', 'teacher', 'class'].includes(workshopData.audienceType) && !workshopData.audienceValue) return 'Completa a qué alumnos va dirigido el taller.';
    if (workshopData.audienceType === 'manual' && !(workshopData.manualStudentIds || []).length) return 'Selecciona al menos un alumno.';
    if (workshopData.cancellationMode === 'allowed_until' && !workshopData.cancellationDeadline) return 'Indica hasta cuándo puede cancelar el alumno.';
    if (workshopData.imageUrl && !/^https?:\/\//i.test(String(workshopData.imageUrl).trim())) return 'La imagen debe ser una URL que empiece por http:// o https://.';
    if (workshopData.resourceUrl && !/^https?:\/\//i.test(String(workshopData.resourceUrl).trim())) return 'El enlace adjunto debe empezar por http:// o https://.';
    if ((workshopData.questions || []).some(question => !String(question.label || '').trim())) return 'Todas las preguntas adicionales deben tener texto.';
    if ((workshopData.questions || []).some(question => question.type === 'choice' && !String(question.optionsText || '').trim() && !(question.options || []).length)) return 'Añade las opciones de respuesta de las preguntas de selección.';
    return '';
  };

  const saveWorkshop = async () => {
    const validationError = validateWorkshop(form, form.status);
    if (validationError) return alert(validationError);
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const payloadCenter = findCenterByValue(centers, form.locationType);
      const payloadRoom = findRoomByValue(payloadCenter, form.room);
      const sessions = [...form.sessions]
        .map(session => ({ id: session.id || createWorkshopLocalId(), date: session.date, startTime: session.startTime, endTime: session.endTime }))
        .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`));
      const questions = form.questions.map(question => ({
        id: question.id || createWorkshopLocalId(),
        label: question.label.trim(),
        type: question.type,
        required: Boolean(question.required),
        options: question.type === 'choice' ? question.optionsText.split(',').map(option => option.trim()).filter(Boolean) : []
      }));
      const payload = {
        ...form,
        title: form.title.trim(),
        shortDescription: form.shortDescription.trim(),
        description: form.description.trim(),
        imageUrl: form.imageUrl.trim(),
        instructor: form.instructor.trim(),
        locationType: payloadCenter?.name || form.locationType,
        room: payloadRoom?.name || form.room.trim(),
        externalLocation: form.externalLocation.trim(),
        capacity: form.unlimitedCapacity ? null : Number(form.capacity),
        minimumParticipants: form.minimumParticipants ? Number(form.minimumParticipants) : null,
        price: form.priceType === 'free' ? 0 : Number(form.price),
        ageMin: form.ageMin ? Number(form.ageMin) : null,
        ageMax: form.ageMax ? Number(form.ageMax) : null,
        sessions,
        questions,
        centerId: payloadCenter?.id || '',
        roomId: payloadRoom?.id || '',
        audienceLabel: form.audienceType === 'all'
          ? 'Todos los alumnos'
          : form.audienceType === 'manual'
            ? `${form.manualStudentIds.length} alumnos seleccionados`
            : form.audienceType === 'class'
              ? audienceOptions.find(option => option.value === form.audienceValue)?.label || form.audienceValue
              : form.audienceValue,
        updatedAt: now,
        updatedBy: user?.email || user?.uid || 'admin'
      };
      delete payload.optionsText;
      if (editingId) {
        const previous = workshops.find(workshop => workshop.id === editingId);
        if (payload.status === 'published' && !previous?.publishedAt) payload.publishedAt = now;
        await updateDoc(doc(db, 'artifacts', appId, 'workshops', editingId), payload);
      } else {
        const workshopRef = doc(collection(db, 'artifacts', appId, 'workshops'));
        await setDoc(workshopRef, {
          ...payload,
          confirmedCount: 0,
          pendingCount: 0,
          waitlistCount: 0,
          createdAt: now,
          createdBy: user?.email || user?.uid || 'admin',
          publishedAt: payload.status === 'published' ? now : null
        });
      }
      resetForm();
    } catch (error) {
      console.error(error);
      alert('No se ha podido guardar el taller. Revisa la conexión y los permisos de Firestore.');
    } finally {
      setSaving(false);
    }
  };

  const changeWorkshopStatus = async (workshop, status) => {
    const validationError = validateWorkshop(workshop, status);
    if (validationError) {
      alert(`${validationError} Edita y completa el taller antes de publicarlo.`);
      return;
    }
    try {
      const update = { status, updatedAt: new Date().toISOString(), updatedBy: user?.email || user?.uid || 'admin' };
      if (status === 'published' && !workshop.publishedAt) update.publishedAt = new Date().toISOString();
      await updateDoc(doc(db, 'artifacts', appId, 'workshops', workshop.id), update);
    } catch (error) {
      console.error(error);
      alert('No se ha podido cambiar el estado del taller.');
    }
  };

  const deleteWorkshop = async workshop => {
    const linkedRegistrations = getWorkshopRegistrations(workshop.id);
    if (linkedRegistrations.length > 0) return alert('Este taller ya tiene inscripciones. Cancélalo para conservar el historial; no puede eliminarse.');
    if (!window.confirm(`¿Eliminar definitivamente el taller “${workshop.title}”?`)) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'workshops', workshop.id));
    } catch (error) {
      console.error(error);
      alert('No se ha podido eliminar el taller.');
    }
  };

  const updateRegistrationStatus = async (registration, status) => {
    try {
      const registrationRef = doc(db, 'artifacts', appId, 'workshopRegistrations', registration.id);
      const workshopRef = doc(db, 'artifacts', appId, 'workshops', registration.workshopId);
      const now = new Date().toISOString();
      await runTransaction(db, async transaction => {
        const workshopSnap = await transaction.get(workshopRef);
        const registrationSnap = await transaction.get(registrationRef);
        if (!workshopSnap.exists() || !registrationSnap.exists()) throw new Error('NOT_FOUND');

        const workshopData = workshopSnap.data();
        const registrationData = registrationSnap.data();
        const previousStatus = registrationData.status;
        if (previousStatus === status) return;

        const counterByStatus = {
          confirmed: 'confirmedCount',
          pending: 'pendingCount',
          waitlist: 'waitlistCount'
        };
        const previousCounter = counterByStatus[previousStatus];
        const nextCounter = counterByStatus[status];
        const counterUpdate = {};

        if (status === 'confirmed' && !workshopData.unlimitedCapacity) {
          const confirmedCount = Number(workshopData.confirmedCount || 0);
          const capacity = Number(workshopData.capacity || 0);
          if (previousStatus !== 'confirmed' && confirmedCount >= capacity) throw new Error('WORKSHOP_FULL');
        }

        if (previousCounter) counterUpdate[previousCounter] = Math.max(0, Number(workshopData[previousCounter] || 0) - 1);
        if (nextCounter) {
          const currentValue = Object.prototype.hasOwnProperty.call(counterUpdate, nextCounter)
            ? counterUpdate[nextCounter]
            : Number(workshopData[nextCounter] || 0);
          counterUpdate[nextCounter] = currentValue + 1;
        }

        transaction.update(registrationRef, {
          status,
          reviewedAt: now,
          reviewedBy: user?.email || user?.uid || 'admin',
          updatedAt: now
        });
        transaction.update(workshopRef, { ...counterUpdate, updatedAt: now });
      });
    } catch (error) {
      console.error(error);
      alert(error.message === 'WORKSHOP_FULL' ? 'No se puede confirmar: el taller ya no tiene plazas libres.' : 'No se ha podido actualizar la inscripción.');
    }
  };

  const audienceOptions = useMemo(() => {
    if (form.audienceType === 'sede') return selectableWorkshopCenters.map(center => center.name);
    if (form.audienceType === 'instrument') return settings.instrumentos || defaultInstrumentos;
    if (form.audienceType === 'teacher') return settings.teachersList || [];
    if (form.audienceType === 'class') return allClasses
      .filter(clase => !isPunctualClass(clase))
      .map(clase => ({ value: clase.id, label: `${clase.sede || ''} · ${clase.subject || clase.instrument || 'Clase'} · ${clase.teacher || ''} · ${clase.time || ''}` }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [];
  }, [allClasses, form.audienceType, settings.instrumentos, settings.teachersList, centers]);

  const workshopCenter = findCenterByValue(centers, form.locationType);
  const workshopLocationCenters = workshopCenter && !selectableWorkshopCenters.some(center => center.id === workshopCenter.id)
    ? [workshopCenter, ...selectableWorkshopCenters]
    : selectableWorkshopCenters;
  const activeWorkshopRooms = (workshopCenter?.rooms || []).filter(room => room.active !== false);
  const currentWorkshopRoom = findRoomByValue(workshopCenter, form.room);
  const workshopRoomOptions = currentWorkshopRoom && !activeWorkshopRooms.some(room => room.id === currentWorkshopRoom.id)
    ? [currentWorkshopRoom, ...activeWorkshopRooms]
    : activeWorkshopRooms;

  const getAudienceLabel = workshop => {
    if (workshop.audienceType === 'all') return 'Todos los alumnos';
    if (workshop.audienceType === 'manual') return `${workshop.manualStudentIds?.length || 0} alumnos seleccionados`;
    if (workshop.audienceType === 'class' && workshop.audienceLabel) return `Clase: ${workshop.audienceLabel}`;
    const labels = { sede: 'Sede', instrument: 'Instrumento', teacher: 'Profesor', class: 'Clase' };
    return `${labels[workshop.audienceType] || 'Destinatarios'}: ${workshop.audienceValue || '—'}`;
  };

  const filteredWorkshops = useMemo(() => workshops.filter(workshop => {
    const search = searchTerm.trim().toLowerCase();
    const matchesSearch = !search || `${workshop.title || ''} ${workshop.shortDescription || ''} ${workshop.instructor || ''}`.toLowerCase().includes(search);
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'active' && ['draft', 'published', 'registration_closed'].includes(workshop.status || 'draft'))
      || workshop.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [searchTerm, statusFilter, workshops]);

  const fieldClass = 'w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-violet-500';
  const labelClass = 'text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1.5 block';

  if (loadingWorkshops) return <div className="bg-white border border-zinc-200 rounded-2xl p-10 text-center font-black uppercase tracking-widest text-zinc-400">Cargando talleres...</div>;

  if (workshopLoadError) return (
    <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-8 text-center">
      <AlertTriangle className="w-9 h-9 text-red-600 mx-auto mb-3"/>
      <h2 className="font-black uppercase tracking-tight text-red-950">No se pudieron cargar los talleres</h2>
      <p className="text-sm font-bold text-red-800 mt-2">{workshopLoadError}</p>
      <button type="button" onClick={() => setWorkshopRetryVersion(version => version + 1)} className="mt-5 bg-red-700 hover:bg-red-800 text-white px-5 py-3 rounded-xl font-black uppercase tracking-widest text-[10px]">Reintentar carga</button>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Talleres</h2>
          <p className="text-zinc-500 font-medium text-sm">Crea talleres de duración determinada y controla sus inscripciones.</p>
        </div>
        <button onClick={openNewWorkshop} className="bg-violet-600 hover:bg-violet-700 text-white px-5 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 shadow-md">
          <PlusCircle className="w-4 h-4"/> Nuevo taller
        </button>
      </header>

      {formOpen && (
        <div className="bg-white rounded-3xl border border-violet-200 shadow-sm overflow-hidden">
          <div className="bg-violet-50 border-b border-violet-100 p-5 flex items-start justify-between gap-4">
            <div>
              <h3 className="font-black text-violet-950 uppercase tracking-tight">{editingId ? 'Editar taller' : 'Crear nuevo taller'}</h3>
              <p className="text-xs font-semibold text-violet-700 mt-1">Los campos marcados con * son necesarios para publicarlo en Extras.</p>
            </div>
            <button onClick={resetForm} className="p-2 rounded-lg bg-white text-zinc-500 hover:text-red-600"><X className="w-4 h-4"/></button>
          </div>

          <div className="p-5 md:p-7 space-y-7">
            <section>
              <h4 className="font-black uppercase tracking-widest text-xs text-slate-800 mb-4 flex items-center gap-2"><FileText className="w-4 h-4 text-violet-600"/> Información principal</h4>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2"><label className={labelClass}>Nombre del taller *</label><input className={fieldClass} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Ej. Iniciación a la improvisación" /></div>
                <div className="md:col-span-2"><label className={labelClass}>Descripción breve para la tarjeta *</label><input className={fieldClass} maxLength={180} value={form.shortDescription} onChange={e => setForm({ ...form, shortDescription: e.target.value })} placeholder="Una o dos frases que verá el alumno en Extras"/><p className="text-[10px] text-zinc-400 font-bold mt-1 text-right">{form.shortDescription.length}/180</p></div>
                <div className="md:col-span-2"><label className={labelClass}>Descripción completa *</label><textarea className={`${fieldClass} min-h-[130px] resize-y`} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Objetivos, contenido y dinámica del taller"/></div>
                <div className="md:col-span-2"><label className={labelClass}>URL de imagen de portada</label><input type="url" className={fieldClass} value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://..."/></div>
              </div>
            </section>

            <section className="border-t border-zinc-100 pt-6">
              <div className="flex items-center justify-between gap-3 mb-4"><h4 className="font-black uppercase tracking-widest text-xs text-slate-800 flex items-center gap-2"><Calendar className="w-4 h-4 text-violet-600"/> Sesiones *</h4><button onClick={addSession} className="text-[10px] font-black uppercase tracking-widest text-violet-700 bg-violet-50 px-3 py-2 rounded-lg hover:bg-violet-100"><Plus className="w-3 h-3 inline mr-1"/> Añadir sesión</button></div>
              <div className="space-y-3">
                {form.sessions.map((session, index) => (
                  <div key={session.id} className="grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr_1fr_auto] gap-3 items-end bg-zinc-50 border border-zinc-200 p-4 rounded-2xl">
                    <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 sm:pb-3">{index + 1}</span>
                    <div><label className={labelClass}>Fecha</label><input type="date" className={fieldClass} value={session.date} onChange={e => updateSession(session.id, 'date', e.target.value)}/></div>
                    <div><label className={labelClass}>Inicio</label><input type="time" className={fieldClass} value={session.startTime} onChange={e => updateSession(session.id, 'startTime', e.target.value)}/></div>
                    <div><label className={labelClass}>Finalización</label><input type="time" className={fieldClass} value={session.endTime} onChange={e => updateSession(session.id, 'endTime', e.target.value)}/></div>
                    <button onClick={() => removeSession(session.id)} disabled={form.sessions.length === 1} className="p-3 bg-white text-red-500 rounded-xl border border-zinc-200 disabled:opacity-25"><Trash2 className="w-4 h-4"/></button>
                  </div>
                ))}
              </div>
              <div className="grid md:grid-cols-2 gap-4 mt-4">
                <div><label className={labelClass}>Fecha y hora límite de inscripción *</label><input type="datetime-local" className={fieldClass} value={form.registrationDeadline} onChange={e => setForm({ ...form, registrationDeadline: e.target.value })}/></div>
                <div><label className={labelClass}>Mostrar en Extras desde</label><input type="datetime-local" className={fieldClass} value={form.publishAt} onChange={e => setForm({ ...form, publishAt: e.target.value })}/></div>
              </div>
            </section>

            <section className="border-t border-zinc-100 pt-6">
              <h4 className="font-black uppercase tracking-widest text-xs text-slate-800 mb-4 flex items-center gap-2"><MapPin className="w-4 h-4 text-violet-600"/> Lugar e impartición</h4>
              <div className="grid md:grid-cols-3 gap-4">
                <div><label className={labelClass}>Lugar *</label><select className={fieldClass} value={form.locationType} onChange={e => setForm({ ...form, locationType: e.target.value, room: '', externalLocation: '' })}>{workshopLocationCenters.map(center => <option key={center.id} value={center.name}>{center.name}{center.status !== 'active' ? ' (inactiva)' : ''}</option>)}<option value="both">Todas las sedes</option><option value="online">Online</option><option value="other">Otro lugar</option></select></div>
                {workshopCenter && <div><label className={labelClass}>Aula o espacio</label><select className={fieldClass} value={form.room} onChange={e => setForm({ ...form, room: e.target.value })}><option value="">Por determinar</option>{workshopRoomOptions.map(room => <option key={room.id} value={room.name}>{room.name}</option>)}</select></div>}
                {form.locationType === 'other' && <div><label className={labelClass}>Dirección o lugar</label><input className={fieldClass} value={form.externalLocation} onChange={e => setForm({ ...form, externalLocation: e.target.value })}/></div>}
                <div><label className={labelClass}>Profesor o responsable</label><input list="workshop-teachers" className={fieldClass} value={form.instructor} onChange={e => setForm({ ...form, instructor: e.target.value })} placeholder="Profesor interno o externo"/><datalist id="workshop-teachers">{(settings.teachersList || []).map(teacher => <option key={teacher} value={teacher}/>)}</datalist></div>
              </div>
            </section>

            <section className="border-t border-zinc-100 pt-6 grid lg:grid-cols-2 gap-7">
              <div>
                <h4 className="font-black uppercase tracking-widest text-xs text-slate-800 mb-4 flex items-center gap-2"><Users className="w-4 h-4 text-violet-600"/> Plazas</h4>
                <label className="flex items-center gap-3 bg-zinc-50 border border-zinc-200 p-3 rounded-xl mb-3 cursor-pointer"><input type="checkbox" checked={form.unlimitedCapacity} onChange={e => setForm({ ...form, unlimitedCapacity: e.target.checked })} className="accent-violet-600"/><span className="text-xs font-black uppercase tracking-wider">Sin límite de plazas</span></label>
                <div className="grid grid-cols-2 gap-3"><div><label className={labelClass}>Plazas máximas</label><input type="number" min="1" disabled={form.unlimitedCapacity} className={fieldClass} value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })}/></div><div><label className={labelClass}>Mínimo para realizarlo</label><input type="number" min="1" className={fieldClass} value={form.minimumParticipants} onChange={e => setForm({ ...form, minimumParticipants: e.target.value })} placeholder="Opcional"/></div></div>
                <label className="flex items-center gap-3 mt-3 cursor-pointer"><input type="checkbox" checked={form.waitlistEnabled} onChange={e => setForm({ ...form, waitlistEnabled: e.target.checked })} className="accent-violet-600"/><span className="text-xs font-bold text-zinc-700">Permitir lista de espera cuando se llene</span></label>
              </div>
              <div>
                <h4 className="font-black uppercase tracking-widest text-xs text-slate-800 mb-4 flex items-center gap-2"><DollarSign className="w-4 h-4 text-violet-600"/> Precio y cobro</h4>
                <div className="grid grid-cols-2 gap-3"><div><label className={labelClass}>Tipo</label><select className={fieldClass} value={form.priceType} onChange={e => setForm({ ...form, priceType: e.target.value })}><option value="free">Gratuito</option><option value="paid">De pago</option></select></div>{form.priceType === 'paid' && <div><label className={labelClass}>Importe (€)</label><input type="number" min="0" step="0.01" className={fieldClass} value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}/></div>}</div>
                {form.priceType === 'paid' && <div className="mt-3"><label className={labelClass}>Forma de cobro</label><select className={fieldClass} value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}><option value="next_debit">Incluir en la próxima domiciliación</option><option value="manual_admin">Cobro manual por Administración</option><option value="external_payment">Pago externo</option></select></div>}
                <div className="mt-3"><label className={labelClass}>Nota sobre el precio</label><input className={fieldClass} value={form.priceNote} onChange={e => setForm({ ...form, priceNote: e.target.value })} placeholder="Ej. Material incluido"/></div>
              </div>
            </section>

            <section className="border-t border-zinc-100 pt-6">
              <h4 className="font-black uppercase tracking-widest text-xs text-slate-800 mb-4 flex items-center gap-2"><Target className="w-4 h-4 text-violet-600"/> Destinatarios e inscripción</h4>
              <div className="grid md:grid-cols-3 gap-4">
                <div><label className={labelClass}>¿A quién se ofrece?</label><select className={fieldClass} value={form.audienceType} onChange={e => setForm({ ...form, audienceType: e.target.value, audienceValue: '', manualStudentIds: [] })}><option value="all">Todos los alumnos</option><option value="sede">Solo una sede</option><option value="instrument">Solo un instrumento</option><option value="teacher">Alumnos de un profesor</option><option value="class">Una clase concreta</option><option value="manual">Selección manual</option></select></div>
                {['sede', 'instrument', 'teacher', 'class'].includes(form.audienceType) && <div className="md:col-span-2"><label className={labelClass}>Selección *</label><select className={fieldClass} value={form.audienceValue} onChange={e => setForm({ ...form, audienceValue: e.target.value })}><option value="">Selecciona...</option>{audienceOptions.map(option => typeof option === 'string' ? <option key={option} value={option}>{option}</option> : <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>}
                <div><label className={labelClass}>Confirmación</label><select className={fieldClass} value={form.registrationMode} onChange={e => setForm({ ...form, registrationMode: e.target.value })}><option value="automatic">Automática si hay plaza</option><option value="manual_review">Pendiente de revisión</option></select></div>
                <div><label className={labelClass}>Cancelación del alumno</label><select className={fieldClass} value={form.cancellationMode} onChange={e => setForm({ ...form, cancellationMode: e.target.value })}><option value="contact_admin">Debe contactar con Administración</option><option value="allowed_until">Puede cancelar hasta una fecha</option><option value="not_allowed">No puede cancelar desde Student</option></select></div>
                {form.cancellationMode === 'allowed_until' && <div><label className={labelClass}>Límite de cancelación</label><input type="datetime-local" className={fieldClass} value={form.cancellationDeadline} onChange={e => setForm({ ...form, cancellationDeadline: e.target.value })}/></div>}
              </div>
              {form.audienceType === 'manual' && <div className="mt-4 bg-zinc-50 border border-zinc-200 rounded-2xl p-4"><p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">Selecciona alumnos ({form.manualStudentIds.length})</p><div className="max-h-56 overflow-y-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-2 pr-1">{students.map(student => <label key={student.id} className="flex items-center gap-2 bg-white border border-zinc-200 rounded-xl p-3 cursor-pointer"><input type="checkbox" checked={form.manualStudentIds.includes(student.id)} onChange={() => toggleManualStudent(student.id)} className="accent-violet-600"/><span className="text-xs font-bold text-slate-700 truncate">{student.name}</span></label>)}</div></div>}
            </section>

            <button onClick={() => setAdvancedOpen(!advancedOpen)} className="w-full flex items-center justify-between p-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-xs font-black uppercase tracking-widest text-zinc-600 hover:bg-zinc-100"><span>Opciones avanzadas</span>{advancedOpen ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}</button>

            {advancedOpen && <section className="space-y-6">
              <div className="grid md:grid-cols-4 gap-4"><div><label className={labelClass}>Edad mínima</label><input type="number" min="0" className={fieldClass} value={form.ageMin} onChange={e => setForm({ ...form, ageMin: e.target.value })}/></div><div><label className={labelClass}>Edad máxima</label><input type="number" min="0" className={fieldClass} value={form.ageMax} onChange={e => setForm({ ...form, ageMax: e.target.value })}/></div><div><label className={labelClass}>Nivel</label><select className={fieldClass} value={form.level} onChange={e => setForm({ ...form, level: e.target.value })}><option value="all">Todos los niveles</option><option value="beginner">Iniciación</option><option value="intermediate">Intermedio</option><option value="advanced">Avanzado</option><option value="custom">Personalizado</option></select></div>{form.level === 'custom' && <div><label className={labelClass}>Nivel personalizado</label><input className={fieldClass} value={form.customLevel} onChange={e => setForm({ ...form, customLevel: e.target.value })}/></div>}</div>
              <div><div className="flex items-center justify-between mb-3"><label className={labelClass}>Preguntas adicionales</label><button onClick={addQuestion} className="text-[10px] font-black uppercase tracking-widest text-violet-700"><Plus className="w-3 h-3 inline"/> Añadir pregunta</button></div><div className="space-y-3">{form.questions.map(question => <div key={question.id} className="grid md:grid-cols-[1fr_150px_auto_auto] gap-3 items-center bg-zinc-50 border border-zinc-200 p-3 rounded-xl"><input className={fieldClass} value={question.label} onChange={e => updateQuestion(question.id, 'label', e.target.value)} placeholder="Pregunta para el alumno"/><select className={fieldClass} value={question.type} onChange={e => updateQuestion(question.id, 'type', e.target.value)}><option value="text">Texto libre</option><option value="choice">Selección</option></select><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={question.required} onChange={e => updateQuestion(question.id, 'required', e.target.checked)} className="accent-violet-600"/> Obligatoria</label><button onClick={() => setForm(prev => ({ ...prev, questions: prev.questions.filter(item => item.id !== question.id) }))} className="p-3 text-red-500"><Trash2 className="w-4 h-4"/></button>{question.type === 'choice' && <input className={`${fieldClass} md:col-span-4`} value={question.optionsText || ''} onChange={e => updateQuestion(question.id, 'optionsText', e.target.value)} placeholder="Opciones separadas por comas"/>}</div>)}</div></div>
              <div className="grid md:grid-cols-2 gap-4"><div><label className={labelClass}>Qué debe traer el alumno</label><textarea className={`${fieldClass} min-h-[90px]`} value={form.whatToBring} onChange={e => setForm({ ...form, whatToBring: e.target.value })}/></div><div><label className={labelClass}>Observaciones importantes</label><textarea className={`${fieldClass} min-h-[90px]`} value={form.importantNotes} onChange={e => setForm({ ...form, importantNotes: e.target.value })}/></div><div><label className={labelClass}>Contacto</label><input className={fieldClass} value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="Correo o persona responsable"/></div><div><label className={labelClass}>Documento o enlace adjunto</label><input type="url" className={fieldClass} value={form.resourceUrl} onChange={e => setForm({ ...form, resourceUrl: e.target.value })} placeholder="https://..."/></div></div>
            </section>}

            <section className="border-t border-zinc-100 pt-6">
              <div className="grid md:grid-cols-2 gap-4"><div><label className={labelClass}>Estado inicial</label><select className={fieldClass} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{WORKSHOP_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div><label className="flex items-center gap-3 md:mt-6 bg-amber-50 border border-amber-200 p-3 rounded-xl cursor-pointer"><input type="checkbox" checked={form.featured} onChange={e => setForm({ ...form, featured: e.target.checked })} className="accent-amber-500"/><span className="text-xs font-black uppercase tracking-wider text-amber-900">Destacar en Extras</span></label></div>
              {form.status === 'cancelled' && <div className="mt-4"><label className={labelClass}>Mensaje de cancelación</label><textarea className={fieldClass} value={form.cancellationMessage} onChange={e => setForm({ ...form, cancellationMessage: e.target.value })}/></div>}
            </section>

            <div className="flex flex-col sm:flex-row justify-end gap-3 border-t border-zinc-100 pt-6"><button onClick={resetForm} className="px-5 py-3 bg-zinc-100 text-zinc-600 rounded-xl font-black uppercase tracking-widest text-[10px]">Cancelar</button><button onClick={saveWorkshop} disabled={saving} className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 disabled:opacity-50"><Save className="w-4 h-4"/>{saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear taller'}</button></div>
          </div>
        </div>
      )}

      <div className="bg-white border border-zinc-200 rounded-2xl p-4 flex flex-col sm:flex-row gap-3"><div className="relative flex-1"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"/><input className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none font-bold text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar taller..."/></div><select className="px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none font-black text-[10px] uppercase tracking-widest" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="active">En gestión</option><option value="all">Todos</option>{WORKSHOP_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>

      <div className="space-y-4">
        {filteredWorkshops.length === 0 && <div className="bg-white border-2 border-dashed border-zinc-300 rounded-2xl p-10 text-center"><PartyPopper className="w-9 h-9 text-zinc-300 mx-auto mb-3"/><p className="font-black uppercase tracking-widest text-xs text-zinc-400">No hay talleres en esta vista</p></div>}
        {filteredWorkshops.map(workshop => {
          const summary = getRegistrationSummary(workshop.id);
          const workshopRegistrations = getWorkshopRegistrations(workshop.id);
          const firstSession = workshop.sessions?.[0];
          const isExpanded = expandedWorkshopId === workshop.id;
          return <article key={workshop.id} className={`bg-white border rounded-2xl shadow-sm overflow-hidden ${workshop.featured ? 'border-amber-300 ring-1 ring-amber-100' : 'border-zinc-200'}`}>
            <div className="p-5">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 mb-2"><span className={`px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${WORKSHOP_STATUS_STYLE[workshop.status || 'draft']}`}>{getWorkshopStatusLabel(workshop.status)}</span>{workshop.featured && <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-[9px] font-black uppercase tracking-widest"><Star className="w-3 h-3 inline"/> Destacado</span>}</div><h3 className="font-black text-lg text-slate-900 leading-tight">{workshop.title}</h3><p className="text-sm text-zinc-500 mt-1">{workshop.shortDescription}</p><div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 text-[10px] font-black uppercase tracking-wider text-zinc-500"><span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-violet-600"/>{firstSession ? `${formatDateSpanish(firstSession.date)} · ${firstSession.startTime}` : 'Sin sesión'}</span><span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-violet-600"/>{workshop.locationType === 'both' ? 'Ambas sedes' : workshop.locationType === 'online' ? 'Online' : workshop.locationType === 'other' ? workshop.externalLocation : `${workshop.locationType}${workshop.room ? ` · ${workshop.room}` : ''}`}</span><span className="flex items-center gap-1"><Target className="w-3.5 h-3.5 text-violet-600"/>{getAudienceLabel(workshop)}</span><span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5 text-violet-600"/>{workshop.priceType === 'free' ? 'Gratuito' : `${Number(workshop.price || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`}</span></div></div>
                <div className="flex flex-wrap lg:justify-end gap-2 shrink-0"><select value={workshop.status || 'draft'} onChange={e => changeWorkshopStatus(workshop, e.target.value)} className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-[9px] font-black uppercase tracking-widest">{WORKSHOP_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button onClick={() => editWorkshop(workshop)} className="p-2 bg-violet-50 text-violet-700 hover:bg-violet-600 hover:text-white rounded-lg" title="Editar"><Pencil className="w-4 h-4"/></button><button onClick={() => deleteWorkshop(workshop)} className="p-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg" title="Eliminar"><Trash2 className="w-4 h-4"/></button></div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5"><div className="bg-emerald-50 p-3 rounded-xl"><span className="block text-xl font-black text-emerald-700">{summary.confirmed}</span><span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Confirmadas</span></div><div className="bg-amber-50 p-3 rounded-xl"><span className="block text-xl font-black text-amber-700">{summary.pending}</span><span className="text-[9px] font-black uppercase tracking-widest text-amber-600">Pendientes</span></div><div className="bg-blue-50 p-3 rounded-xl"><span className="block text-xl font-black text-blue-700">{summary.waitlist}</span><span className="text-[9px] font-black uppercase tracking-widest text-blue-600">En espera</span></div><div className="bg-zinc-50 p-3 rounded-xl"><span className="block text-xl font-black text-slate-800">{workshop.unlimitedCapacity ? '∞' : Math.max(0, Number(workshop.capacity || 0) - summary.confirmed)}</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Plazas libres</span></div></div>
              <button onClick={() => setExpandedWorkshopId(isExpanded ? null : workshop.id)} className="w-full mt-4 py-2.5 border-t border-zinc-100 text-[10px] font-black uppercase tracking-widest text-zinc-500 hover:text-violet-700 flex items-center justify-center gap-2">Inscripciones ({workshopRegistrations.length}) {isExpanded ? <ChevronUp className="w-4 h-4"/> : <ChevronDown className="w-4 h-4"/>}</button>
            </div>
            {isExpanded && <div className="bg-zinc-50 border-t border-zinc-200 p-4 space-y-2">{workshopRegistrations.length === 0 ? <p className="text-center text-xs font-bold text-zinc-400 py-4">Todavía no hay inscripciones.</p> : workshopRegistrations.map(registration => <div key={registration.id} className="bg-white border border-zinc-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><p className="font-black text-sm text-slate-800">{registration.studentName || students.find(student => student.id === registration.studentId)?.name || 'Alumno'}</p><p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{WORKSHOP_REGISTRATION_STATUS_LABELS[registration.status] || registration.status} · {registration.createdAt ? formatDateSpanish(registration.createdAt) : 'Sin fecha'}</p></div><div className="flex gap-2">{registration.status !== 'confirmed' && <button onClick={() => updateRegistrationStatus(registration, 'confirmed')} className="px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white"><Check className="w-3 h-3 inline"/> Confirmar</button>}{!['rejected', 'cancelled'].includes(registration.status) && <button onClick={() => updateRegistrationStatus(registration, 'rejected')} className="px-3 py-2 bg-red-50 text-red-600 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white"><X className="w-3 h-3 inline"/> Rechazar</button>}</div></div>)}</div>}
          </article>;
        })}
      </div>
    </div>
  );
};

export default function AdminPortal({ user, logout, db, appId, switchToTeacher }) {
  const [activeTab, setActiveTab] = useState('gestiones');
  const [loading, setLoading] = useState(true);
  const [startupLoadErrors, setStartupLoadErrors] = useState({});
  const [startupRetryVersion, setStartupRetryVersion] = useState(0);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [activatedDataAreas, setActivatedDataAreas] = useState({ gestiones: true });
  const [deferredDataStatus, setDeferredDataStatus] = useState({});
  const [deferredRetryVersion, setDeferredRetryVersion] = useState(0);
  const classIndexMigrationRef = useRef(false);

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
  const [temporaryClassChanges, setTemporaryClassChanges] = useState([]);
  const [maintenancePeriods, setMaintenancePeriods] = useState([]);
  const [teacherTasks, setTeacherTasks] = useState([]);
  const [teacherEvaluations, setTeacherEvaluations] = useState([]);
  const [workshopRegistrations, setWorkshopRegistrations] = useState([]);
  const [pollResponses, setPollResponses] = useState([]);
  const workshopEmailClaimsRef = useRef(new Set());
  
  const [settings, setSettings] = useState({ 
    festivos: [], festivosTarragona: [], festivosReus: [], vacaciones: [], contract: '', teacherRules: '', 
    hourlyRate: 17.33, costeEmpresa: 22, gastosFijos: { global: 0, tarragona: 0, reus: 0 },
    generalTasks: [], prizes: { mensual: '', trimestral: '', anual: '' }, teachersList: [], teacherColors: {},
    roomCapacities: defaultRoomCapacities, instrumentos: defaultInstrumentos,
    centers: normalizeCenters([], {})
  });

  const centers = useMemo(() => normalizeCenters(settings.centers, settings), [
    settings.centers,
    settings.roomCapacities,
    settings.gastosFijos,
    settings.centerHolidays,
    settings.festivosTarragona,
    settings.festivosReus
  ]);
  const activeCenters = useMemo(() => {
    const active = centers.filter(center => center.status === 'active');
    return active.length > 0 ? active : centers.slice(0, 1);
  }, [centers]);
  const activeCenterNames = useMemo(() => activeCenters.map(center => center.name), [activeCenters]);

  const getCenterForValue = (value = '') => findCenterByValue(centers, value);
  const getSelectableCenters = (currentValue = '') => {
    const current = getCenterForValue(currentValue);
    if (current && !activeCenters.some(center => center.id === current.id)) return [current, ...activeCenters];
    return activeCenters;
  };
  const getCenterName = (value = '') => getCenterForValue(value)?.name || String(value || '').trim() || activeCenterNames[0] || 'Tarragona';
  const getClassCenter = (classData = {}) => getCenterForValue(classData.centerId || classData.sede);
  const getClassCenterName = (classData = {}) => getClassCenter(classData)?.name || classData.sede || activeCenterNames[0] || 'Tarragona';
  const getClassRoomName = (classData = {}) => findRoomByValue(getClassCenter(classData), classData.roomId || classData.sala)?.name || classData.sala || 'Sala no indicada';
  const getRoomsForCenterValue = (centerValue, includeInactive = false) => {
    const center = getCenterForValue(centerValue);
    if (!center) return [];
    return (center.rooms || []).filter(room => includeInactive || room.active !== false);
  };
  const getRoomNamesForCenter = (centerValue, includeInactive = false) => getRoomsForCenterValue(centerValue, includeInactive).map(room => room.name);
  const getRoomOptionsForCenter = (centerValue, currentRoom = '') => {
    const options = getRoomNamesForCenter(centerValue);
    if (currentRoom && !options.includes(currentRoom)) return [currentRoom, ...options];
    return options;
  };
  const getLocationIdentity = (centerValue, roomValue = '') => {
    const center = getCenterForValue(centerValue);
    const room = findRoomByValue(center, roomValue);
    return {
      centerId: center?.id || normalizeConfigId(centerValue, 'sede'),
      roomId: room?.id || normalizeConfigId(roomValue, 'sala')
    };
  };
  const getCenterFixedCost = centerValue => {
    const center = getCenterForValue(centerValue);
    return center?.status === 'active' ? (Number(center.fixedMonthlyCost || 0) || 0) : 0;
  };
  const isSameCenter = (leftValue, rightValue) => {
    const left = getCenterForValue(leftValue);
    const right = getCenterForValue(rightValue);
    if (left && right) return left.id === right.id;
    return String(leftValue || '').trim().toLocaleLowerCase('es') === String(rightValue || '').trim().toLocaleLowerCase('es');
  };
  const isSameRoom = (centerValue, leftValue, rightValue) => {
    const center = getCenterForValue(centerValue);
    const left = findRoomByValue(center, leftValue);
    const right = findRoomByValue(center, rightValue);
    if (left && right) return left.id === right.id;
    return String(leftValue || '').trim().toLocaleLowerCase('es') === String(rightValue || '').trim().toLocaleLowerCase('es');
  };

  // --- ESTADOS LOCALES UI ---
  const [searchStudent, setSearchStudent] = useState('');
  const [filterStatus, setFilterStatus] = useState('activo');
  const [newAnnounce, setNewAnnounce] = useState(createEmptyAnnouncementDraft);
  const [announceEmailOptions, setAnnounceEmailOptions] = useState({ enabled: false, targetType: 'all', targetValue: '' });
  const [editingAnnouncementId, setEditingAnnouncementId] = useState(null);
  const [expandedPollResultsId, setExpandedPollResultsId] = useState(null);
  const [pollClock, setPollClock] = useState(Date.now());
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
  const [classesReferenceDate, setClassesReferenceDate] = useState(getTodayLocalString());
  const [archDay, setArchDay] = useState('1'); // Compatibilidad interna para creación de clases
  const [archTime, setArchTime] = useState('17:00');
  const [archSede, setArchSede] = useState('Tarragona');
  const [informeSubTab, setInformeSubTab] = useState('resumen'); // 'resumen', 'sedes', 'instrumentos', 'profesores', 'semaforo'
  const [biProjectionMode, setBiProjectionMode] = useState('actual'); // 'actual' o 'proyeccion'

  // ESTADOS MODALES CLASES
  const [createClassModal, setCreateClassModal] = useState(false);
  const [changeClassModal, setChangeClassModal] = useState(null);
  const [resurrectClassModal, setResurrectClassModal] = useState(null); 
  const [viewClassModal, setViewClassModal] = useState(null); 
  const [editWebModal, setEditWebModal] = useState(null); 
  const [editClassModal, setEditClassModal] = useState(null);
  const [editClassData, setEditClassData] = useState(null);
  const [editClassMode, setEditClassMode] = useState('permanent');
  const [temporaryClassData, setTemporaryClassData] = useState(null);
  const [socialModalText, setSocialModalText] = useState(''); 
  const [photosModalOpen, setPhotosModalOpen] = useState(false);
  const [selectedInstForChange, setSelectedInstForChange] = useState('');
  
  const [newClassData, setNewClassData] = useState({
    isRecurring: true, specificDate: new Date().toISOString().split('T')[0], 
    dayOfWeek: '1', time: '17:00', sede: 'Tarragona', sala: 'Sala 1', centerId: 'tarragona', roomId: 'sala-1',
    teacher: '', subject: '', capacity: '', duration: 60, cuotaBase: 60, notes: ''
  });

  const [mboxAdminDate, setMboxAdminDate] = useState(new Date().toISOString().split('T')[0]);
  const [mboxAdminSede, setMboxAdminSede] = useState('Tarragona');

  const [selectedPayrollMonth, setSelectedPayrollMonth] = useState(new Date().toISOString().substring(0, 7));
  const [teacherPanelTab, setTeacherPanelTab] = useState('evaluations');
  const [selectedAvailabilityTeacher, setSelectedAvailabilityTeacher] = useState('');
  const [teacherEvaluationPeriod, setTeacherEvaluationPeriod] = useState('all');
  const [expandedEvaluationTeacher, setExpandedEvaluationTeacher] = useState(null);
  const [expandedEvaluationIndividualsTeacher, setExpandedEvaluationIndividualsTeacher] = useState(null);
  const [visibleEvaluationItemsByTeacher, setVisibleEvaluationItemsByTeacher] = useState({});
  const availableMonths = useMemo(() => generateLast12Months(), []);

  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [centerEditor, setCenterEditor] = useState(null);
  const [savingCenter, setSavingCenter] = useState(false);

  useEffect(() => {
    let disposed = false;
    let startupTimeoutId;
    const settledSources = new Set();
    const expectedSources = Object.keys(ADMIN_STARTUP_DATA_LABELS).length;

    setLoading(true);
    setStartupLoadErrors({});
    setSettingsLoaded(false);
    setClassesLoaded(false);

    const markSourceSettled = source => {
      if (disposed || settledSources.has(source)) return;
      settledSources.add(source);
      if (settledSources.size === expectedSources) {
        if (startupTimeoutId) window.clearTimeout(startupTimeoutId);
        setLoading(false);
      }
    };

    const clearSourceError = source => {
      setStartupLoadErrors(previous => {
        if (!previous[source]) return previous;
        const next = { ...previous };
        delete next[source];
        return next;
      });
    };

    const handleSourceError = (source, error) => {
      if (disposed) return;
      console.error(`No se pudo cargar ${ADMIN_STARTUP_DATA_LABELS[source] || source}:`, error);
      setStartupLoadErrors(previous => ({
        ...previous,
        [source]: ADMIN_STARTUP_DATA_LABELS[source] || source
      }));
      markSourceSettled(source);
    };

    const subscribeStartupSource = (source, reference, applySnapshot) => onSnapshot(
      reference,
      { includeMetadataChanges: true },
      snapshot => {
        if (disposed) return;
        try {
          applySnapshot(snapshot);
          if (snapshot.metadata?.fromCache === true) return;
          clearSourceError(source);
          markSourceSettled(source);
        } catch (error) {
          handleSourceError(source, error);
        }
      },
      error => handleSourceError(source, error)
    );

    const unsubGestiones = subscribeStartupSource('gestiones', collection(db, 'artifacts', appId, 'gestiones'), snap => {
      setGestiones(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => new Date(b.date) - new Date(a.date)));
    });
    const unsubStudents = subscribeStartupSource('students', collection(db, 'artifacts', appId, 'students'), snap => {
      setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''))));
    });
    const unsubSettings = subscribeStartupSource('settings', doc(db, 'artifacts', appId, 'settings', 'global'), docSnap => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const normalizedCenters = normalizeCenters(data.centers, data);
        const legacyCenterSettings = buildLegacyCenterSettings(normalizedCenters, data);
        setSettings(prev => ({
          ...prev,
          ...data,
          ...legacyCenterSettings,
          centers: normalizedCenters,
          instrumentos: data.instrumentos || defaultInstrumentos,
          teacherColors: data.teacherColors || {},
          costeEmpresa: data.costeEmpresa || 22,
          centersSchemaVersion: 1
        }));
        if (!Array.isArray(data.centers) || data.centers.length === 0) {
          setDoc(doc(db, 'artifacts', appId, 'settings', 'global'), {
            centers: normalizedCenters,
            centersSchemaVersion: 1,
            ...legacyCenterSettings
          }, { merge: true }).catch(error => console.error('No se pudo completar la migración inicial de sedes:', error));
        }
      }
      setSettingsLoaded(true);
    });
    const unsubClasses = subscribeStartupSource('classes', collectionGroup(db, 'recurringClasses'), snap => {
      setAllClasses(snap.docs.map(d => ({ id: d.id, refPath: d.ref.path, ...d.data() })));
      setClassesLoaded(true);
    });
    const unsubTickets = subscribeStartupSource('tickets', collectionGroup(db, 'tickets'), snap => {
      setAllTickets(snap.docs.map(d => ({ id: d.id, refPath: d.ref.path, ...d.data() })));
    });
    const unsubTemporaryRelocations = subscribeStartupSource('temporaryRelocations', collection(db, 'artifacts', appId, 'temporaryRelocations'), snap => {
      setTemporaryRelocations(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
    });
    const unsubTemporaryClassChanges = subscribeStartupSource('temporaryClassChanges', collection(db, 'artifacts', appId, 'temporaryClassChanges'), snap => {
      setTemporaryClassChanges(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
    });
    const unsubMaintenancePeriods = subscribeStartupSource('maintenancePeriods', collection(db, 'artifacts', appId, 'maintenancePeriods'), snap => {
      setMaintenancePeriods(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
    });
    const unsubTeacherTasks = subscribeStartupSource('teacherTasks', collection(db, 'artifacts', appId, 'teacherTasks'), snap => {
      setTeacherTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0)));
    });
    const unsubWorkshopRegistrations = subscribeStartupSource('workshopRegistrations', collection(db, 'artifacts', appId, 'workshopRegistrations'), snap => {
      setWorkshopRegistrations(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0)));
    });

    startupTimeoutId = window.setTimeout(() => {
      Object.keys(ADMIN_STARTUP_DATA_LABELS)
        .filter(source => !settledSources.has(source))
        .forEach(source => handleSourceError(source, new Error('Tiempo de espera agotado')));
    }, 20000);

    return () => {
      disposed = true;
      if (startupTimeoutId) window.clearTimeout(startupTimeoutId);
      unsubGestiones();
      unsubStudents();
      unsubSettings();
      unsubClasses();
      unsubTickets();
      unsubTemporaryRelocations();
      unsubTemporaryClassChanges();
      unsubMaintenancePeriods();
      unsubTeacherTasks();
      unsubWorkshopRegistrations();
    };
  }, [appId, db, startupRetryVersion]);

  useEffect(() => {
    setActivatedDataAreas(previous => previous[activeTab]
      ? previous
      : { ...previous, [activeTab]: true });
  }, [activeTab]);

  const needsAnnouncementsData = Boolean(activatedDataAreas.announcements || activatedDataAreas.gamification);
  const needsAvailabilityData = Boolean(activatedDataAreas.classes || activatedDataAreas.teachers);
  const needsTeacherHistoryData = Boolean(activatedDataAreas.teachers);
  const needsPollResponsesData = Boolean(activatedDataAreas.announcements);

  // Cada bloque diferido se conecta la primera vez que se usa y permanece actualizado
  // durante la sesión para no volver a pagar su carga inicial al alternar pestañas.
  useEffect(() => {
    if (!needsAnnouncementsData) return undefined;
    setDeferredDataStatus(previous => ({ ...previous, announcements: 'loading' }));
    return subscribeVerifiedAdminSnapshot({
      reference: collection(db, 'artifacts', appId, 'announcements'),
      label: 'los avisos',
      applySnapshot: snap => {
        setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.date) - new Date(a.date)));
      },
      onStatus: status => setDeferredDataStatus(previous => ({ ...previous, announcements: status }))
    });
  }, [needsAnnouncementsData, appId, db, deferredRetryVersion]);

  // La disponibilidad se necesita al crear/editar clases y dentro del panel de profesores.
  useEffect(() => {
    if (!needsAvailabilityData) return undefined;
    setDeferredDataStatus(previous => ({ ...previous, availability: 'loading' }));
    return subscribeVerifiedAdminSnapshot({
      reference: collection(db, 'artifacts', appId, 'availability'),
      label: 'la disponibilidad docente',
      applySnapshot: snap => {
        const av = {};
        snap.forEach(d => {
          const key = normalizeTeacherKey(d.id);
          if (!key) return;
          const incomingSlots = d.data().slots || {};
          const mergedSlots = { ...(av[key] || {}) };
          Object.entries(incomingSlots).forEach(([day, slots]) => {
            const uniqueSlots = [...(mergedSlots[day] || []), ...(Array.isArray(slots) ? slots : [])]
              .filter(slot => slot?.start && slot?.end)
              .filter((slot, index, list) => list.findIndex(item => item.start === slot.start && item.end === slot.end) === index)
              .sort((a, b) => a.start.localeCompare(b.start));
            mergedSlots[day] = uniqueSlots;
          });
          av[key] = mergedSlots;
        });
        setAvailabilities(av);
      },
      onStatus: status => setDeferredDataStatus(previous => ({ ...previous, availability: status }))
    });
  }, [needsAvailabilityData, appId, db, deferredRetryVersion]);

  // Asistencias, ajustes y evaluaciones son históricos pesados: se conectan al abrir Profesores.
  useEffect(() => {
    if (!needsTeacherHistoryData) return undefined;

    setDeferredDataStatus(previous => ({
      ...previous,
      records: 'loading',
      payrollAdjustments: 'loading',
      teacherEvaluations: 'loading'
    }));

    const unsubRecords = subscribeVerifiedAdminSnapshot({
      reference: collectionGroup(db, 'records'),
      label: 'el histórico de asistencias',
      applySnapshot: snap => {
        setAllRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      onStatus: status => setDeferredDataStatus(previous => ({ ...previous, records: status }))
    });

    const unsubPayrollAdjustments = subscribeVerifiedAdminSnapshot({
      reference: collection(db, 'artifacts', appId, 'payrollAdjustments'),
      label: 'los ajustes de nómina',
      applySnapshot: snap => {
        setPayrollAdjustments(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)));
      },
      onStatus: status => setDeferredDataStatus(previous => ({ ...previous, payrollAdjustments: status }))
    });

    const unsubTeacherEvaluations = subscribeVerifiedAdminSnapshot({
      reference: collection(db, 'artifacts', appId, 'teacherEvaluations'),
      label: 'las evaluaciones docentes',
      applySnapshot: snap => {
        setTeacherEvaluations(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0)));
      },
      onStatus: status => setDeferredDataStatus(previous => ({ ...previous, teacherEvaluations: status }))
    });

    return () => {
      unsubRecords();
      unsubPayrollAdjustments();
      unsubTeacherEvaluations();
    };
  }, [needsTeacherHistoryData, appId, db, deferredRetryVersion]);

  useEffect(() => {
    if (!needsPollResponsesData) return undefined;
    setDeferredDataStatus(previous => ({ ...previous, pollResponses: 'loading' }));
    return subscribeVerifiedAdminSnapshot({
      reference: collection(db, 'artifacts', appId, 'pollResponses'),
      label: 'las respuestas de encuestas',
      applySnapshot: snap => {
        setPollResponses(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)));
      },
      onStatus: status => setDeferredDataStatus(previous => ({ ...previous, pollResponses: status }))
    });
  }, [needsPollResponsesData, appId, db, deferredRetryVersion]);

  // Migra una sola vez las clases antiguas. StudentPortal no activa la consulta optimizada
  // hasta que todas las clases contienen un índice studentIds coherente.
  useEffect(() => {
    if (!settingsLoaded || !classesLoaded || classIndexMigrationRef.current) return;
    if (Number(settings.studentClassIndexVersion || 0) >= 1) return;

    classIndexMigrationRef.current = true;
    const migrateClassStudentIndex = async () => {
      try {
        const classesToUpdate = allClasses.filter(classData => {
          const expectedStudentIds = getClassStudentIds(classData.students || []);
          return !haveSameStringValues(classData.studentIds || [], expectedStudentIds);
        });

        for (let start = 0; start < classesToUpdate.length; start += 400) {
          const batch = writeBatch(db);
          classesToUpdate.slice(start, start + 400).forEach(classData => {
            if (!classData.refPath) return;
            batch.update(doc(db, classData.refPath), {
              studentIds: getClassStudentIds(classData.students || [])
            });
          });
          await batch.commit();
        }

        // No se activa la versión optimizada hasta comprobar que Firestore acepta
        // la consulta de grupo necesaria (reglas e índice de studentIds incluidos).
        await getDocs(query(
          collectionGroup(db, 'recurringClasses'),
          where('studentIds', 'array-contains', '__student_index_probe__')
        ));

        await setDoc(doc(db, 'artifacts', appId, 'settings', 'global'), {
          studentClassIndexVersion: 1,
          studentClassIndexMigratedAt: new Date().toISOString(),
          studentClassIndexMigratedClasses: classesToUpdate.length
        }, { merge: true });
      } catch (error) {
        classIndexMigrationRef.current = false;
        console.error('No se pudo completar la migración de studentIds:', error);
      }
    };

    migrateClassStudentIndex();
  }, [settingsLoaded, classesLoaded, settings.studentClassIndexVersion, allClasses, appId, db]);

  useEffect(() => {
    const timer = window.setInterval(() => setPollClock(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const firstCenter = activeCenters[0];
    if (!firstCenter) return;
    const firstRoom = (firstCenter.rooms || []).find(room => room.active !== false)?.name || '';
    if (!activeCenters.some(center => isSameCenter(center.id, archSede))) setArchSede(firstCenter.name);
    const mitoboxCenters = activeCenters.filter(center => (center.rooms || []).some(room => room.active !== false && room.mitoboxEnabled !== false));
    if (!mitoboxCenters.some(center => isSameCenter(center.id, mboxAdminSede))) setMboxAdminSede(mitoboxCenters[0]?.name || firstCenter.name);
    setNewClassData(previous => {
      if (activeCenters.some(center => isSameCenter(center.id, previous.sede))) return previous;
      const firstRoomData = findRoomByValue(firstCenter, firstRoom);
      return { ...previous, sede: firstCenter.name, sala: firstRoom, centerId: firstCenter.id, roomId: firstRoomData?.id || '' };
    });
  }, [activeCenters.map(center => `${center.id}:${center.status}`).join('|')]);

  useEffect(() => {
    if (viewClassModal) {
      const updatedClass = allClasses.find(c => c.id === viewClassModal.id);
      if (updatedClass) {
        setViewClassModal(updatedClass);
      }
    }
  }, [allClasses, viewClassModal?.id]);

  useEffect(() => {
    setResolvedGestionesVisible(HISTORIAL_TRAMITES_BLOCK_SIZE);
  }, [gestionSearchTerm]);

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

  const centerNamesForReporting = useMemo(() => {
    const configuredNames = centers.map(center => center.name);
    const historicalNames = recurringClassesOnly.map(classData => getClassCenterName(classData));
    return uniqueStrings([...configuredNames, ...historicalNames]);
  }, [centers, recurringClassesOnly]);

  const officialTeacherNameMap = useMemo(() => {
    const names = new Map();
    const register = (value, prefer = false) => {
      const cleanName = cleanTeacherDisplayName(value);
      const key = normalizeTeacherKey(cleanName);
      if (!key) return;
      if (prefer || !names.has(key)) names.set(key, cleanName);
    };

    (settings.teachersList || []).forEach(name => register(name));
    allClasses.forEach(classData => register(classData.teacher));
    allRecords.forEach(record => register(record.teacher));
    payrollAdjustments.forEach(adjustment => register(adjustment.teacher));
    teacherEvaluations.forEach(evaluation => register(evaluation.teacherName || evaluation.teacher || evaluation.teacherDisplayName || evaluation.profesor));
    Object.keys(availabilities || {}).forEach(key => register(key));
    return names;
  }, [settings.teachersList, allClasses, allRecords, payrollAdjustments, teacherEvaluations, availabilities]);

  const getOfficialTeacherName = (name, fallback = 'Sin Asignar') => {
    const cleanName = cleanTeacherDisplayName(name);
    if (!cleanName) return fallback;
    return officialTeacherNameMap.get(normalizeTeacherKey(cleanName)) || cleanName;
  };

  const allOfficialTeacherNames = useMemo(() => [...officialTeacherNameMap.values()]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'es')), [officialTeacherNameMap]);

  const configuredTeacherNames = useMemo(() => {
    const names = new Map();
    (settings.teachersList || []).forEach(name => {
      const cleanName = cleanTeacherDisplayName(name);
      const key = normalizeTeacherKey(cleanName);
      if (key && !names.has(key)) names.set(key, cleanName);
    });
    return [...names.values()];
  }, [settings.teachersList]);

  const getTeacherAvailability = (teacherName) => availabilities[normalizeTeacherKey(teacherName)] || {};

  useEffect(() => {
    if (selectedAvailabilityTeacher && allOfficialTeacherNames.some(name => isSameTeacher(name, selectedAvailabilityTeacher))) return;
    setSelectedAvailabilityTeacher(allOfficialTeacherNames[0] || '');
  }, [allOfficialTeacherNames, selectedAvailabilityTeacher]);

  const normalizeTemporaryClassChangeDate = (value = '') => {
    if (!value) return '';
    if (typeof value?.toDate === 'function') {
      const date = value.toDate();
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const cleanValue = String(value || '').trim();
    return normalizeGestionDateString(cleanValue) || cleanValue.slice(0, 10);
  };

  const isTemporaryClassChangeClosed = (change = {}) => (
    ['cancelled', 'cancelada', 'finalizada', 'expired'].includes(String(change.status || '').toLowerCase())
  );

  const isTemporaryClassChangeActiveForDate = (change = {}, dateStr = todayStr) => {
    if (!change || isTemporaryClassChangeClosed(change)) return false;
    const from = normalizeTemporaryClassChangeDate(change.from);
    const until = normalizeTemporaryClassChangeDate(change.until);
    const referenceDate = normalizeTemporaryClassChangeDate(dateStr);
    return Boolean(from && until && referenceDate && from <= referenceDate && until >= referenceDate);
  };

  const doesTemporaryChangeBelongToClass = (change = {}, classDataOrId = '') => {
    const classData = typeof classDataOrId === 'object' && classDataOrId !== null ? classDataOrId : null;
    const classId = classData?.id ?? classDataOrId;
    const sameId = String(change.classId ?? '') && String(change.classId) === String(classId ?? '');
    if (sameId) return true;
    return Boolean(classData?.refPath && change.classRefPath && String(change.classRefPath) === String(classData.refPath));
  };

  const getClassTemporaryChanges = (classDataOrId) => temporaryClassChanges
    .filter(change => doesTemporaryChangeBelongToClass(change, classDataOrId) && !isTemporaryClassChangeClosed(change))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const getActiveClassTemporaryChange = (classDataOrId, dateStr = todayStr) => getClassTemporaryChanges(classDataOrId)
    .find(change => isTemporaryClassChangeActiveForDate(change, dateStr)) || null;

  const getEffectiveClassForDate = (classData, dateStr = todayStr) => {
    if (!classData) return classData;
    const temporaryChange = getActiveClassTemporaryChange(classData, dateStr);
    if (!temporaryChange) return classData;
    return {
      ...classData,
      dayOfWeek: Number(temporaryChange.dayOfWeek),
      time: temporaryChange.time || classData.time,
      sede: temporaryChange.sede || classData.sede,
      sala: temporaryChange.sala || classData.sala,
      centerId: temporaryChange.centerId || classData.centerId || getLocationIdentity(temporaryChange.sede || classData.sede, temporaryChange.sala || classData.sala).centerId,
      roomId: temporaryChange.roomId || classData.roomId || getLocationIdentity(temporaryChange.sede || classData.sede, temporaryChange.sala || classData.sala).roomId,
      duration: Number(temporaryChange.duration) || Number(classData.duration) || 60,
      teacher: getOfficialTeacherName(temporaryChange.teacher || classData.teacher),
      temporaryClassChange: temporaryChange,
      officialSchedule: {
        dayOfWeek: classData.dayOfWeek,
        time: classData.time,
        sede: classData.sede,
        sala: classData.sala,
        centerId: classData.centerId || getLocationIdentity(classData.sede, classData.sala).centerId,
        roomId: classData.roomId || getLocationIdentity(classData.sede, classData.sala).roomId,
        duration: classData.duration,
        teacher: getOfficialTeacherName(classData.teacher)
      }
    };
  };

  const effectiveOperationalClasses = useMemo(() => operationalClasses.map(classData => (
    isPunctualClass(classData) ? classData : getEffectiveClassForDate(classData, todayStr)
  )), [operationalClasses, temporaryClassChanges, todayStr, officialTeacherNameMap]);

  const globalClassesForReferenceDate = useMemo(() => operationalClasses.map(classData => {
    if (isPunctualClass(classData)) return classData;
    const referenceDate = classesReferenceDate || todayStr;
    const effectiveClass = getEffectiveClassForDate(classData, referenceDate);
    if (effectiveClass.temporaryClassChange) return effectiveClass;

    const upcomingTemporaryClassChange = getClassTemporaryChanges(classData)
      .filter(change => normalizeTemporaryClassChangeDate(change.until) >= referenceDate)
      .sort((a, b) => normalizeTemporaryClassChangeDate(a.from).localeCompare(normalizeTemporaryClassChangeDate(b.from)))[0] || null;

    return upcomingTemporaryClassChange
      ? { ...effectiveClass, upcomingTemporaryClassChange }
      : effectiveClass;
  }), [operationalClasses, temporaryClassChanges, classesReferenceDate, todayStr, officialTeacherNameMap]);

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
  const currentMonthStartStr = useMemo(() => getMonthStartStringFromDate(todayStr), [todayStr]);
  const currentMonthEndStr = useMemo(() => addDaysToLocalDateString(nextMonthStartStr, -1), [nextMonthStartStr]);

  const biProjectionInputs = useMemo(() => {
    const cloneClasses = source => source.map(clase => ({
      ...clase,
      students: (clase.students || []).map(studentEntry => ({ ...studentEntry }))
    }));
    const cloneStudents = source => source.map(student => ({ ...student }));
    const cloneMaintenance = source => source.map(period => ({ ...period }));
    const isProjectedTotalBaja = (gestion = {}) => {
      const scope = String(gestion.bajaScopeResolved || gestion.bajaScope || gestion.scope || gestion.bajaType || gestion.scheduledAction || '').trim().toLowerCase();
      return Boolean(
        gestion.bajaTotal === true || gestion.isTotalBaja === true || gestion.totalBaja === true ||
        ['total', 'baja_total', 'todas'].includes(scope)
      );
    };
    const getConfirmedEffectiveDate = (gestion = {}) => normalizeGestionDateString(
      gestion.scheduledEffectiveDate || gestion.bajaEffectiveDate || gestion.scheduledClassStartDate ||
      gestion.effectiveStartDate || gestion.newClassStartDate || ''
    );

    const confirmedClasses = cloneClasses(recurringClassesOnly);
    const confirmedStudents = cloneStudents(students);
    const confirmedMaintenancePeriods = cloneMaintenance(maintenancePeriods);
    const confirmedStudentById = new Map(confirmedStudents.map(student => [student.id, student]));
    let confirmedScheduledGestiones = 0;

    gestiones.forEach(gestion => {
      if (gestion.status !== 'completado' || gestion.type !== 'baja' || !isProjectedTotalBaja(gestion)) return;
      const effectiveDate = getConfirmedEffectiveDate(gestion);
      if (!effectiveDate || effectiveDate > nextMonthStartStr) return;
      const studentInfo = confirmedStudentById.get(gestion.studentId);
      if (!studentInfo) return;
      studentInfo.hasMitoverso = false;
      studentInfo.hasMitobox = false;
      confirmedScheduledGestiones += 1;
    });

    const potentialClasses = cloneClasses(confirmedClasses);
    const potentialStudents = cloneStudents(confirmedStudents);
    const potentialMaintenancePeriods = cloneMaintenance(confirmedMaintenancePeriods);
    const classById = new Map(potentialClasses.map(clase => [String(clase.id), clase]));
    const studentById = new Map(potentialStudents.map(student => [student.id, student]));
    const appliedPending = [];
    const skippedPending = [];

    const getProjectedStudent = gestion => {
      if (!gestion?.studentId) return null;
      if (!studentById.has(gestion.studentId)) {
        const studentInfo = {
          id: gestion.studentId,
          name: gestion.studentName || 'Alumno',
          email: gestion.studentEmail || gestion.email || '',
          globalStatus: 'activo',
          hasMitoverso: false,
          hasMitobox: false
        };
        studentById.set(gestion.studentId, studentInfo);
        potentialStudents.push(studentInfo);
      }
      return studentById.get(gestion.studentId);
    };
    const getProjectionEffectiveDate = gestion => {
      const explicit = normalizeGestionDateString(
        gestion.effectiveStartDate || gestion.scheduledStartDate || gestion.newClassStartDate ||
        gestion.classStartDate || gestion.scheduledEffectiveDate || ''
      );
      return explicit || getMonthStartFromGestionTarget(gestion);
    };
    const shouldAffectNextMonth = effectiveDate => !effectiveDate || effectiveDate <= nextMonthEndStr;
    const setStudentEntryEnd = (clase, studentId, effectiveDate) => {
      if (!clase || !studentId) return false;
      const endDate = addDaysToLocalDateString(effectiveDate || nextMonthStartStr, -1);
      let changed = false;
      clase.students = (clase.students || []).map(studentEntry => {
        if (studentEntry.id !== studentId || !isFixedClassStudent(studentEntry)) return studentEntry;
        changed = true;
        return { ...studentEntry, classEndDate: endDate, scheduledEndDate: endDate, biProjectedPending: true };
      });
      return changed;
    };
    const addStudentToProjectedClass = (clase, studentInfo, gestion, effectiveDate) => {
      if (!clase || !studentInfo?.id) return false;
      const existing = (clase.students || []).some(studentEntry => studentEntry.id === studentInfo.id && isFixedClassStudent(studentEntry));
      if (existing) return false;
      clase.students = [...(clase.students || []), {
        id: studentInfo.id,
        name: studentInfo.useAlias && studentInfo.alias ? studentInfo.alias : (studentInfo.name || gestion.studentName || 'Alumno'),
        email: studentInfo.email || gestion.studentEmail || gestion.email || '',
        classStartDate: effectiveDate || nextMonthStartStr,
        scheduledStartDate: effectiveDate || nextMonthStartStr,
        status: 'present',
        isPaused: false,
        isRecovery: false,
        biProjectedPending: true
      }];
      return true;
    };

    [...gestiones]
      .filter(gestion => gestion.status === 'pendiente' && (
        PROJECTABLE_GESTION_TYPES.has(gestion.type) || isExtraServiceGestionType(gestion.type)
      ))
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
      .forEach(gestion => {
        const studentInfo = getProjectedStudent(gestion);
        if (!studentInfo) {
          skippedPending.push({ id: gestion.id, type: gestion.type, reason: 'sin alumno asociado' });
          return;
        }

        if (isExtraServiceGestionType(gestion.type)) {
          const config = getExtraServiceConfigByType(gestion.type);
          if (!config) {
            skippedPending.push({ id: gestion.id, type: gestion.type, reason: 'servicio no identificado' });
            return;
          }
          studentInfo[config.studentFlag] = true;
          appliedPending.push({ id: gestion.id, type: gestion.type, studentId: studentInfo.id });
          return;
        }

        if (gestion.type === 'mantenimiento') {
          let period = getMaintenancePeriodFromGestion(gestion);
          if (period.isLegacyMissingDuration) {
            skippedPending.push({ id: gestion.id, type: gestion.type, reason: 'duración pendiente de decidir' });
            return;
          }
          if (!doDateRangesOverlap(period.from, period.until, nextMonthStartStr, nextMonthEndStr)) return;
          potentialMaintenancePeriods.push({
            ...period,
            id: `bi-pending-${gestion.id}`,
            studentId: studentInfo.id,
            status: 'active',
            biProjectedPending: true
          });
          appliedPending.push({ id: gestion.id, type: gestion.type, studentId: studentInfo.id });
          return;
        }

        if (gestion.type === 'reactivar_plaza') {
          let changed = String(studentInfo.globalStatus || '').toLowerCase() === 'congelado' || potentialClasses.some(clase =>
            (clase.students || []).some(studentEntry => studentEntry.id === studentInfo.id && studentEntry.isPaused === true)
          );
          potentialMaintenancePeriods.forEach(period => {
            if (period.studentId !== studentInfo.id || !doDateRangesOverlap(period.from, period.until, nextMonthStartStr, nextMonthEndStr)) return;
            period.status = 'cancelled';
            period.biProjectedCancelled = true;
            changed = true;
          });
          studentInfo.globalStatus = 'activo';
          potentialClasses.forEach(clase => {
            clase.students = (clase.students || []).map(studentEntry => studentEntry.id === studentInfo.id ? { ...studentEntry, isPaused: false } : studentEntry);
          });
          if (changed) appliedPending.push({ id: gestion.id, type: gestion.type, studentId: studentInfo.id });
          else skippedPending.push({ id: gestion.id, type: gestion.type, reason: 'sin mantenimiento que reactivar' });
          return;
        }

        const effectiveDate = getProjectionEffectiveDate(gestion);
        if (!shouldAffectNextMonth(effectiveDate)) return;

        if (gestion.type === 'baja') {
          const sourceClass = classById.get(String(gestion.sourceClassId || ''));
          const totalBaja = isProjectedTotalBaja(gestion) || (!gestion.sourceClassId && !gestion.sourceClassLine);
          let changed = false;
          if (totalBaja) {
            potentialClasses.forEach(clase => {
              if (setStudentEntryEnd(clase, studentInfo.id, effectiveDate)) changed = true;
            });
            studentInfo.hasMitoverso = false;
            studentInfo.hasMitobox = false;
          } else if (sourceClass) {
            changed = setStudentEntryEnd(sourceClass, studentInfo.id, effectiveDate);
          } else {
            skippedPending.push({ id: gestion.id, type: gestion.type, reason: 'plaza de origen no localizada' });
            return;
          }
          if (changed || totalBaja) appliedPending.push({ id: gestion.id, type: gestion.type, studentId: studentInfo.id });
          return;
        }

        if (gestion.type === 'cambio_horario' || gestion.type === 'ampliar_clases') {
          const targetClassId = String(gestion.requestedClass || gestion.scheduledTargetClassId || '');
          const targetClass = classById.get(targetClassId);
          if (!targetClass) {
            skippedPending.push({ id: gestion.id, type: gestion.type, reason: 'clase de destino no localizada' });
            return;
          }
          if (gestion.type === 'cambio_horario') {
            const sourceClass = classById.get(String(gestion.sourceClassId || ''));
            if (gestion.sourceClassId && sourceClass) {
              setStudentEntryEnd(sourceClass, studentInfo.id, effectiveDate);
            } else if (!gestion.sourceClassId) {
              potentialClasses.forEach(clase => {
                if (clase.id !== targetClass.id && clase.subject === targetClass.subject) {
                  setStudentEntryEnd(clase, studentInfo.id, effectiveDate);
                }
              });
            }
          }
          addStudentToProjectedClass(targetClass, studentInfo, gestion, effectiveDate);
          appliedPending.push({ id: gestion.id, type: gestion.type, studentId: studentInfo.id });
        }
      });

    return {
      confirmed: {
        classes: confirmedClasses,
        students: confirmedStudents,
        maintenancePeriods: confirmedMaintenancePeriods
      },
      potential: {
        classes: potentialClasses,
        students: potentialStudents,
        maintenancePeriods: potentialMaintenancePeriods
      },
      meta: {
        confirmedScheduledGestiones,
        appliedPending,
        skippedPending
      }
    };
  }, [recurringClassesOnly, students, maintenancePeriods, gestiones, nextMonthStartStr, nextMonthEndStr]);

  const buildBusinessIntelligence = ({
    classesSnapshot = [],
    studentsSnapshot = [],
    maintenanceSnapshot = [],
    referenceDate = todayStr,
    periodStart = currentMonthStartStr,
    periodEnd = currentMonthEndStr,
    mode = 'actual',
    projectionMeta = null
  }) => {
    let totalIngresosClases = 0;
    let costeTotalProfesores = 0;
    let totalMatriculasActivas = 0;
    let totalMatriculasInicioFuturo = 0;
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
      alumnosUnicos: 0,
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
      impagos: 0,
      sesionesSustitucion: 0
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
    const porSede = Object.fromEntries(centerNamesForReporting.map(sede => [sede, createSedeStats()]));
    const porProfe = {};
    const porInstrumento = {};
    const studentById = new Map(studentsSnapshot.map(student => [student.id, student]));
    const frozenStudents = new Map();
    const activeUniqueStudents = new Set();
    const activeUniqueBySede = new Map(centerNamesForReporting.map(sede => [sede, new Set()]));
    const legacyMaintenanceStudents = new Set();
    const teacherHourlyCost = Number(settings.costeEmpresa || 22);
    const pacoTeacherKey = normalizeTeacherKey('Paco');
    const getStudentInfoForBI = studentId => studentById.get(studentId) || {};
    const getStudentIdentityKey = (student = {}, fallback = '') => {
      const emailKey = String(student.email || '').trim().toLowerCase();
      return String(student.id || emailKey || fallback || student.name || '').trim();
    };
    const getTeacherBucket = teacherName => {
      const officialName = getOfficialTeacherName(teacherName, 'Sin Asignar');
      const key = normalizeTeacherKey(officialName) || 'sin-asignar';
      if (!porProfe[key]) porProfe[key] = { name: officialName, ...createTeacherStats() };
      return porProfe[key];
    };
    const isPaidTeacher = teacherName => {
      const key = normalizeTeacherKey(getOfficialTeacherName(teacherName, ''));
      return Boolean(key && key !== pacoTeacherKey && key !== 'sin asignar');
    };
    const isMaintenancePeriodForReference = period => {
      if (!period || ['cancelled', 'cancelada', 'finalizada'].includes(String(period.status || '').toLowerCase())) return false;
      return Boolean(period.from && period.until && period.from <= referenceDate && period.until >= referenceDate);
    };
    const isStudentMaintenanceForReference = (studentId, crmStatus, studentEntry = {}) => {
      const hasPeriod = maintenanceSnapshot.some(period => period.studentId === studentId && isMaintenancePeriodForReference(period));
      const isLegacy = crmStatus === 'congelado' || studentEntry.isPaused === true;
      if (isLegacy && !hasPeriod && studentId) legacyMaintenanceStudents.add(studentId);
      return hasPeriod || isLegacy;
    };
    const isRelocationActiveForBI = relocation => {
      if (!relocation || ['cancelled', 'cancelada', 'finalizada'].includes(String(relocation.status || '').toLowerCase())) return false;
      return Boolean(relocation.from && relocation.until && relocation.from <= referenceDate && relocation.until >= referenceDate);
    };
    const activeRelocations = temporaryRelocations.filter(isRelocationActiveForBI);

    const mapStudentEntries = (clase, entries, relocationMode = '') => entries
      .map((studentEntry, index) => {
        const studentInfo = getStudentInfoForBI(studentEntry.id);
        const crmStatus = studentInfo?.globalStatus || 'activo';
        const isDropped = crmStatus === 'baja';
        const isPastEnd = hasStudentClassEndedBeforeDate(studentEntry, studentInfo, referenceDate);
        const startDate = getStudentClassStartDate(studentEntry, studentInfo);
        const endDate = getStudentClassEndDate(studentEntry, studentInfo);
        const isFutureStart = !isDropped && !isPastEnd && Boolean(startDate && startDate > referenceDate);
        const isMaintenance = !isDropped && !isPastEnd && isStudentMaintenanceForReference(studentEntry.id, crmStatus, studentEntry);
        const isActive = !isDropped && !isPastEnd && !isMaintenance && !isFutureStart;
        const displayName = studentEntry.name || studentEntry.studentName || studentInfo?.alias || studentInfo?.name || 'Alumno';
        const email = studentInfo?.email || studentEntry.email || studentEntry.studentEmail || '';
        return {
          id: studentEntry.id || `${clase.id}-${index}`,
          name: displayName,
          email,
          sede: getClassCenterName(clase),
          status: crmStatus,
          startDate,
          endDate,
          isDropped,
          isPastEnd,
          isFutureStart,
          isMaintenance,
          isActive,
          isRelocatedIn: relocationMode === 'in',
          isRelocatedOut: relocationMode === 'out',
          isCommitted: !isDropped && !isPastEnd
        };
      })
      .filter(student => student.isCommitted);

    const getFinancialRowsForClass = clase => mapStudentEntries(
      clase,
      (clase.students || []).filter(isFixedClassStudent)
    );
    const getOperationalRowsForClass = clase => {
      const relocatedOutIds = new Set(activeRelocations
        .filter(relocation => String(relocation.sourceClassId) === String(clase.id))
        .map(relocation => relocation.studentId));
      const baseEntries = (clase.students || [])
        .filter(isFixedClassStudent)
        .filter(studentEntry => !relocatedOutIds.has(studentEntry.id));
      const relocatedInEntries = activeRelocations
        .filter(relocation => String(relocation.targetClassId) === String(clase.id))
        .filter(relocation => !baseEntries.some(studentEntry => studentEntry.id === relocation.studentId))
        .map(relocation => {
          const studentInfo = getStudentInfoForBI(relocation.studentId);
          return {
            id: relocation.studentId,
            name: studentInfo?.useAlias && studentInfo?.alias ? studentInfo.alias : (studentInfo?.name || relocation.studentName || 'Alumno'),
            email: studentInfo?.email || relocation.studentEmail || '',
            classStartDate: '',
            isTemporaryRelocation: true,
            temporaryRelocationId: relocation.id
          };
        });
      return [
        ...mapStudentEntries(clase, baseEntries),
        ...mapStudentEntries(clase, relocatedInEntries, 'in')
      ];
    };
    const countWeeklySessionsInRange = (dayOfWeek, fromDate, untilDate) => {
      if (!fromDate || !untilDate || fromDate > untilDate) return 0;
      let cursor = fromDate;
      let count = 0;
      let guard = 0;
      while (cursor && cursor <= untilDate && guard < 370) {
        if (getDateDayIndex(cursor) === Number(dayOfWeek)) count += 1;
        cursor = addDaysToLocalDateString(cursor, 1);
        guard += 1;
      }
      return count;
    };
    const getClassTeacherCostShares = (clase, isClassOperative, durationHours) => {
      if (!isClassOperative) return [];
      const officialTeacher = getOfficialTeacherName(clase.teacher, 'Sin Asignar');
      const officialKey = normalizeTeacherKey(officialTeacher) || 'sin-asignar';
      const shares = new Map([[officialKey, {
        teacher: officialTeacher,
        hoursMonthly: durationHours * BI_WEEKS_PER_MONTH,
        sessionsSubstituted: 0,
        isSubstitute: false
      }]]);

      temporaryClassChanges
        .filter(change => doesTemporaryChangeBelongToClass(change, clase) && !isTemporaryClassChangeClosed(change))
        .sort((a, b) => String(a.from || '').localeCompare(String(b.from || '')))
        .forEach(change => {
          const substituteTeacher = getOfficialTeacherName(change.teacher || clase.teacher, officialTeacher);
          const substituteKey = normalizeTeacherKey(substituteTeacher) || officialKey;
          if (substituteKey === officialKey) return;
          const changeFrom = normalizeTemporaryClassChangeDate(change.from);
          const changeUntil = normalizeTemporaryClassChangeDate(change.until);
          const overlapStartCandidates = [periodStart, changeFrom].filter(Boolean).sort();
          const overlapFrom = overlapStartCandidates[overlapStartCandidates.length - 1];
          const overlapUntil = [periodEnd, changeUntil].filter(Boolean).sort()[0];
          if (!overlapFrom || !overlapUntil || overlapFrom > overlapUntil) return;
          const sessionCount = countWeeklySessionsInRange(change.dayOfWeek ?? clase.dayOfWeek, overlapFrom, overlapUntil);
          if (sessionCount <= 0) return;
          const officialShare = shares.get(officialKey);
          const transferableHours = Math.min(sessionCount * durationHours, Math.max(officialShare?.hoursMonthly || 0, 0));
          if (transferableHours <= 0) return;
          officialShare.hoursMonthly -= transferableHours;
          officialShare.sessionsSubstituted += sessionCount;
          const substituteShare = shares.get(substituteKey) || {
            teacher: substituteTeacher,
            hoursMonthly: 0,
            sessionsSubstituted: 0,
            isSubstitute: true
          };
          substituteShare.hoursMonthly += transferableHours;
          substituteShare.sessionsSubstituted += sessionCount;
          shares.set(substituteKey, substituteShare);
        });

      return [...shares.values()]
        .filter(share => share.hoursMonthly > 0.0001)
        .map(share => ({
          ...share,
          hoursWeeklyEquivalent: share.hoursMonthly / BI_WEEKS_PER_MONTH,
          cost: isPaidTeacher(share.teacher) ? share.hoursMonthly * teacherHourlyCost : 0
        }));
    };
    const getBIClassStatusLabel = ({ financialActiveCount, operationalActiveCount, maintenanceCount, futureStartCount, relocatedInCount, relocatedOutCount }) => {
      if (operationalActiveCount > 0) {
        if (relocatedInCount > 0) return 'OPERATIVA · incluye recolocación temporal de entrada';
        return 'OPERATIVA';
      }
      if (financialActiveCount > 0 && relocatedOutCount > 0) return 'SIN SESIÓN TEMPORAL · cuota y plaza conservadas en origen';
      if (maintenanceCount > 0 && futureStartCount > 0) return 'HIBERNADA · reservas / mantenimiento';
      if (maintenanceCount > 0) return 'HIBERNADA · solo mantenimiento';
      if (futureStartCount > 0) return 'HIBERNADA · inicio futuro';
      return 'HIBERNADA · sin alumnos activos';
    };

    classesSnapshot.forEach(c => {
      const financialRows = getFinancialRowsForClass(c);
      const operationalRows = getOperationalRowsForClass(c);
      const activeStudents = financialRows.filter(student => student.isActive);
      const operationalActiveStudents = operationalRows.filter(student => student.isActive);
      const maintenanceStudents = financialRows.filter(student => student.isMaintenance);
      const futureStartStudents = financialRows.filter(student => student.isFutureStart);
      const numAlumnos = activeStudents.length;
      const numAlumnosOperativos = operationalActiveStudents.length;
      const numCongelados = maintenanceStudents.length;
      const numInicioFuturo = futureStartStudents.length;
      const numPlazasComprometidas = financialRows.length;
      const numImpagos = activeStudents.filter(student => student.status === 'impago').length;
      const numRecolocadosDentro = operationalRows.filter(student => student.isRelocatedIn && student.isActive).length;
      const activeRelocatedOutIds = new Set(activeRelocations
        .filter(relocation => String(relocation.sourceClassId) === String(c.id))
        .map(relocation => relocation.studentId));
      const numRecolocadosFuera = activeStudents.filter(student => activeRelocatedOutIds.has(student.id)).length;
      const isClassOperative = numAlumnosOperativos > 0;
      const isHibernated = !isClassOperative;
      const sedeKey = getClassCenterName(c);

      activeStudents.forEach((student, index) => {
        const identityKey = getStudentIdentityKey(student, `${c.id}-${index}`);
        if (identityKey) {
          activeUniqueStudents.add(identityKey);
          if (!activeUniqueBySede.has(sedeKey)) activeUniqueBySede.set(sedeKey, new Set());
          activeUniqueBySede.get(sedeKey).add(identityKey);
        }
      });
      maintenanceStudents.forEach((student, index) => {
        const frozenKey = getStudentIdentityKey(student, `${c.id}-maintenance-${index}`);
        if (!frozenStudents.has(frozenKey)) {
          frozenStudents.set(frozenKey, { ...student, sede: sedeKey });
        }
      });

      const cuota = Number(c.cuotaBase) || 0;
      const ingresos = numAlumnos * cuota;
      const duracionHoras = (Number(c.duration) || 60) / 60;
      const horasComputables = isClassOperative ? duracionHoras : 0;
      const horasHibernadas = isClassOperative ? 0 : duracionHoras;
      const teacherCostShares = getClassTeacherCostShares(c, isClassOperative, duracionHoras);
      const coste = teacherCostShares.reduce((sum, share) => sum + share.cost, 0);
      const beneficio = ingresos - coste;
      const officialTeacher = getOfficialTeacherName(c.teacher, 'Sin Asignar');
      const estadoOperativo = getBIClassStatusLabel({
        financialActiveCount: numAlumnos,
        operationalActiveCount: numAlumnosOperativos,
        maintenanceCount: numCongelados,
        futureStartCount: numInicioFuturo,
        relocatedInCount: numRecolocadosDentro,
        relocatedOutCount: numRecolocadosFuera
      });

      totalIngresosClases += ingresos;
      costeTotalProfesores += coste;
      totalMatriculasActivas += numAlumnos;
      totalMatriculasInicioFuturo += numInicioFuturo;
      totalPlazasComprometidas += numPlazasComprometidas;
      totalImpagos += numImpagos;
      totalClasesOperativas += isClassOperative ? 1 : 0;
      totalClasesHibernadas += isHibernated ? 1 : 0;
      totalHorasSemanalesOperativas += horasComputables;
      totalHorasSemanalesHibernadas += horasHibernadas;

      clasesRentabilidad.push({
        id: c.id,
        subject: c.subject,
        teacher: officialTeacher,
        sede: sedeKey,
        time: c.time,
        dayOfWeek: c.dayOfWeek,
        numAlumnos,
        numAlumnosOperativos,
        numCongelados,
        numInicioFuturo,
        numPlazasComprometidas,
        numImpagos,
        numRecolocados: numRecolocadosDentro,
        numRecolocadosDentro,
        numRecolocadosFuera,
        ingresos,
        coste,
        beneficio,
        horasComputables,
        horasHibernadas,
        teacherCostShares,
        isClassOperative,
        isHibernated,
        estadoOperativo
      });

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

      const officialTeacherStats = getTeacherBucket(officialTeacher);
      officialTeacherStats.ingresos += ingresos;
      officialTeacherStats.horasHibernadas += horasHibernadas;
      officialTeacherStats.clasesOperativas += isClassOperative ? 1 : 0;
      officialTeacherStats.clasesHibernadas += isHibernated ? 1 : 0;
      officialTeacherStats.alumnosActivos += numAlumnos;
      officialTeacherStats.alumnosInicioFuturo += numInicioFuturo;
      officialTeacherStats.plazasComprometidas += numPlazasComprometidas;
      officialTeacherStats.impagos += numImpagos;
      teacherCostShares.forEach(share => {
        const teacherStats = getTeacherBucket(share.teacher);
        teacherStats.costes += share.cost;
        teacherStats.horasSemanales += share.hoursWeeklyEquivalent;
        if (share.isSubstitute) teacherStats.sesionesSustitucion += share.sessionsSubstituted;
      });

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

    activeUniqueBySede.forEach((studentKeys, sede) => {
      if (!porSede[sede]) porSede[sede] = createSedeStats();
      porSede[sede].alumnosUnicos = studentKeys.size;
    });

    const alumnosMantenimiento = frozenStudents.size;
    const ingresosMantenimiento = alumnosMantenimiento * MAINTENANCE_MONTHLY_FEE;
    frozenStudents.forEach(student => {
      const sedeKey = getCenterName(student.sede || 'Tarragona');
      if (!porSede[sedeKey]) porSede[sedeKey] = createSedeStats();
      porSede[sedeKey].ingresos += MAINTENANCE_MONTHLY_FEE;
      porSede[sedeKey].mantenimiento += MAINTENANCE_MONTHLY_FEE;
      porSede[sedeKey].alumnosMantenimiento += 1;
    });

    const scheduledTotalBajaStudentIds = new Set(gestiones
      .filter(gestion => {
        if (gestion.status !== 'completado' || gestion.type !== 'baja') return false;
        const scope = String(gestion.bajaScopeResolved || gestion.bajaScope || gestion.scope || gestion.bajaType || gestion.scheduledAction || '').trim().toLowerCase();
        const isTotal = gestion.bajaTotal === true || gestion.isTotalBaja === true || gestion.totalBaja === true || ['total', 'baja_total', 'todas'].includes(scope);
        if (!isTotal) return false;
        const effectiveDate = normalizeGestionDateString(
          gestion.scheduledEffectiveDate || gestion.bajaEffectiveDate || gestion.scheduledClassStartDate || gestion.effectiveStartDate || ''
        );
        return Boolean(effectiveDate && effectiveDate <= referenceDate);
      })
      .map(gestion => gestion.studentId)
      .filter(Boolean));
    const extraEligibleStudents = studentsSnapshot.filter(student => (
      String(student.globalStatus || 'activo').toLowerCase() !== 'baja' && !scheduledTotalBajaStudentIds.has(student.id)
    ));
    const alumnosMitoverso = extraEligibleStudents.filter(student => student.hasMitoverso === true).length;
    const alumnosMitobox = extraEligibleStudents.filter(student => student.hasMitobox === true).length;
    const ingresosMitoverso = alumnosMitoverso * EXTRA_SERVICE_CONFIG_BY_TYPE.alta_mitoverso.monthlyFee;
    const ingresosMitobox = alumnosMitobox * EXTRA_SERVICE_CONFIG_BY_TYPE.alta_mitobox.monthlyFee;
    const ingresosExtras = ingresosMitoverso + ingresosMitobox;

    if (ingresosMantenimiento > 0) {
      const maintenanceTeacherStats = getTeacherBucket('Mantenimiento (sin atribuir)');
      maintenanceTeacherStats.ingresos += ingresosMantenimiento;
      maintenanceTeacherStats.plazasComprometidas += alumnosMantenimiento;
      porInstrumento.Mantenimiento = {
        ...createInstrumentStats(),
        ingresos: ingresosMantenimiento,
        plazasComprometidas: alumnosMantenimiento
      };
    }

    clasesRentabilidad.sort((a, b) => b.beneficio - a.beneficio);
    const totalIngresos = totalIngresosClases + ingresosMantenimiento + ingresosExtras;
    const totalFijos = Number(settings.gastosFijos?.global || 0)
      + centers.filter(center => center.status === 'active').reduce((sum, center) => sum + Number(center.fixedMonthlyCost || 0), 0);

    return {
      mode,
      referenceDate,
      periodStart,
      periodEnd,
      projectionMeta,
      totalIngresos,
      totalIngresosClases,
      ingresosMantenimiento,
      ingresosExtras,
      ingresosMitoverso,
      ingresosMitobox,
      alumnosMitoverso,
      alumnosMitobox,
      extrasSinAtribuirASede: ingresosExtras,
      alumnosMantenimiento,
      alumnosMantenimientoLegacy: legacyMaintenanceStudents.size,
      totalAlumnosActivos: totalMatriculasActivas,
      totalAlumnosActivosUnicos: activeUniqueStudents.size,
      totalMatriculasActivas,
      totalAlumnosInicioFuturo: totalMatriculasInicioFuturo,
      totalMatriculasInicioFuturo,
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
      porProfe: Object.values(porProfe)
        .map(data => ({ ...data, beneficio: data.ingresos - data.costes }))
        .sort((a, b) => b.beneficio - a.beneficio),
      porInstrumento: Object.entries(porInstrumento)
        .map(([name, data]) => ({ name, ...data, beneficio: data.ingresos - data.costes }))
        .sort((a, b) => b.beneficio - a.beneficio)
    };
  };

  const currentBusinessIntelligence = useMemo(() => buildBusinessIntelligence({
    classesSnapshot: recurringClassesOnly,
    studentsSnapshot: students,
    maintenanceSnapshot: maintenancePeriods,
    referenceDate: todayStr,
    periodStart: currentMonthStartStr,
    periodEnd: currentMonthEndStr,
    mode: 'actual'
  }), [recurringClassesOnly, students, maintenancePeriods, temporaryRelocations, temporaryClassChanges, settings, todayStr, currentMonthStartStr, currentMonthEndStr, officialTeacherNameMap]);

  const confirmedNextMonthBusinessIntelligence = useMemo(() => buildBusinessIntelligence({
    classesSnapshot: biProjectionInputs.confirmed.classes,
    studentsSnapshot: biProjectionInputs.confirmed.students,
    maintenanceSnapshot: biProjectionInputs.confirmed.maintenancePeriods,
    referenceDate: nextMonthStartStr,
    periodStart: nextMonthStartStr,
    periodEnd: nextMonthEndStr,
    mode: 'proyeccion_confirmada',
    projectionMeta: biProjectionInputs.meta
  }), [biProjectionInputs, temporaryRelocations, temporaryClassChanges, settings, nextMonthStartStr, nextMonthEndStr, officialTeacherNameMap]);

  const projectedBusinessIntelligence = useMemo(() => buildBusinessIntelligence({
    classesSnapshot: biProjectionInputs.potential.classes,
    studentsSnapshot: biProjectionInputs.potential.students,
    maintenanceSnapshot: biProjectionInputs.potential.maintenancePeriods,
    referenceDate: nextMonthStartStr,
    periodStart: nextMonthStartStr,
    periodEnd: nextMonthEndStr,
    mode: 'proyeccion_pendientes',
    projectionMeta: biProjectionInputs.meta
  }), [biProjectionInputs, temporaryRelocations, temporaryClassChanges, settings, nextMonthStartStr, nextMonthEndStr, officialTeacherNameMap]);

  const businessIntelligence = biProjectionMode === 'proyeccion'
    ? projectedBusinessIntelligence
    : currentBusinessIntelligence;
  const biPeriodLabel = (() => {
    const date = parseLocalDateString(businessIntelligence.periodStart);
    return date ? date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) : '';
  })();

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
      .map(c => getOfficialTeacherName(c.teacher, ''))
      .filter(Boolean);
    const unique = new Map();
    teacherNames.forEach(name => unique.set(normalizeTeacherKey(name), name));
    return [...unique.values()];
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
    const officialName = getOfficialTeacherName(teacherName, cleanTeacherDisplayName(teacherName));
    return `${officialName.toLocaleLowerCase('es-ES').trim().replace(/\s+/g, '.')}@escuelalosmitos.com`;
  };

  const formatClassLine = (clase) => {
    if (!clase) return '';
    return `${clase.subject || 'Clase'} · ${getDayName(clase.dayOfWeek)} · ${clase.time}h · ${getClassCenterName(clase)}${clase.sala || clase.roomId ? ` · ${getClassRoomName(clase)}` : ''}`;
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

  const getActiveStudentEmails = () => {
    const uniqueEmails = new Set();

    students
      .filter(student => ['activo', 'mantenimiento'].includes(getStudentOperationalStatus(student)))
      .forEach(student => {
        const email = normalizeEmail(student.email);
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) uniqueEmails.add(email);
      });

    return [...uniqueEmails].sort((a, b) => a.localeCompare(b, 'es'));
  };

  const copyActiveStudentEmails = async () => {
    const emails = getActiveStudentEmails();
    if (emails.length === 0) {
      alert('No hay alumnos activos o en mantenimiento con un correo electrónico válido.');
      return;
    }

    const textToCopy = emails.map(email => `${email},`).join('\n');

    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API no disponible');
      await navigator.clipboard.writeText(textToCopy);
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (!copied) {
        alert('El navegador no ha permitido copiar los correos. Revisa los permisos del portapapeles.');
        return;
      }
    }

    alert(`${emails.length} correo(s) de alumnos activos o en mantenimiento copiado(s) al portapapeles.`);
  };

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
      const teacherName = getOfficialTeacherName(c.teacher, 'Profesor');
      const email = getTeacherEmail(teacherName);
      if (!email) return;
      const teacherKey = normalizeTeacherKey(teacherName);
      if (!grouped[teacherKey]) grouped[teacherKey] = { teacherName, email, classes: [] };
      grouped[teacherKey].classes.push(c);
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

  const markWorkshopRegistrationsSeen = async () => {
    const unseen = workshopRegistrations.filter(registration => !registration.adminSeenAt);
    if (unseen.length === 0) return;
    const seenAt = new Date().toISOString();

    try {
      for (let start = 0; start < unseen.length; start += 450) {
        const batch = writeBatch(db);
        unseen.slice(start, start + 450).forEach(registration => {
          batch.update(doc(db, 'artifacts', appId, 'workshopRegistrations', registration.id), {
            adminSeenAt: seenAt,
            adminSeenBy: user?.email || user?.uid || 'admin'
          });
        });
        await batch.commit();
      }
    } catch (error) {
      console.error('No se pudieron marcar las inscripciones de talleres como vistas:', error);
    }
  };

  const handleAdminTabChange = (tabId) => {
    setActiveTab(tabId);
    if (tabId === 'workshops') markWorkshopRegistrationsSeen();
  };

  useEffect(() => {
    let cancelled = false;

    const notifyNewWorkshopRegistrations = async () => {
      const registrationsToNotify = workshopRegistrations.filter(registration =>
        !registration.adminNotificationEmailSentAt &&
        !registration.adminNotificationEmailClaimedAt &&
        !workshopEmailClaimsRef.current.has(registration.id)
      );

      for (const registration of registrationsToNotify) {
        if (cancelled) return;
        workshopEmailClaimsRef.current.add(registration.id);
        const registrationRef = doc(db, 'artifacts', appId, 'workshopRegistrations', registration.id);
        const claimedAt = new Date().toISOString();
        let claimed = false;

        try {
          await runTransaction(db, async transaction => {
            const registrationSnap = await transaction.get(registrationRef);
            if (!registrationSnap.exists()) return;
            const currentData = registrationSnap.data();
            if (currentData.adminNotificationEmailSentAt || currentData.adminNotificationEmailClaimedAt) return;
            transaction.update(registrationRef, {
              adminNotificationEmailClaimedAt: claimedAt,
              adminNotificationEmailClaimedBy: user?.email || user?.uid || 'admin'
            });
            claimed = true;
          });

          if (!claimed || cancelled) continue;

          const answersText = Array.isArray(registration.answers) && registration.answers.length > 0
            ? registration.answers.map(answer => `- ${answer.question || 'Pregunta'}: ${answer.answer || 'Sin respuesta'}`).join('\n')
            : 'Sin preguntas adicionales.';
          const statusLabel = WORKSHOP_REGISTRATION_STATUS_LABELS[registration.status] || registration.status || 'Registrada';
          const priceLine = registration.priceType === 'paid'
            ? `${Number(registration.price || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € · cobro pendiente: ${registration.billingPending === false ? 'no' : 'sí'}`
            : 'Gratuito';
          const body = `NUEVA INSCRIPCIÓN EN TALLER

TALLER: ${registration.workshopTitle || registration.workshopId || 'Taller'}
ALUMNO: ${registration.studentName || 'Sin nombre'}
EMAIL: ${registration.studentEmail || 'Sin email'}
ESTADO: ${statusLabel}
PRECIO: ${priceLine}
FECHA: ${new Date(registration.updatedAt || registration.createdAt || Date.now()).toLocaleString('es-ES')}

RESPUESTAS:
${answersText}

La inscripción ya está registrada en AdminPortal > Talleres y aparece a título informativo en la Bandeja.`;

          const sent = await sendNotificationEmail({
            to: ADMIN_GESTION_EMAIL,
            subject: `Nueva inscripción en taller: ${registration.workshopTitle || registration.studentName || 'Taller'}`,
            body,
            type: 'notificacion_email',
            workshopRegistrationId: registration.id,
            workshopId: registration.workshopId || ''
          });

          await updateDoc(registrationRef, sent ? {
            adminNotificationEmailSentAt: new Date().toISOString(),
            adminNotificationEmailRecipient: ADMIN_GESTION_EMAIL
          } : {
            adminNotificationEmailFailedAt: new Date().toISOString()
          });
        } catch (error) {
          console.error('No se pudo enviar el aviso de nueva inscripción en taller:', registration.id, error);
        }
      }
    };

    notifyNewWorkshopRegistrations();
    return () => { cancelled = true; };
  }, [workshopRegistrations, db, appId, user?.email, user?.uid]);

  const sendTeacherNotification = async ({ teacherName, subject, body, type = 'cambio_administrativo', ...metadata }) => {
    const to = getTeacherEmail(teacherName);
    const now = new Date().toISOString();
    const notificationRef = doc(collection(db, 'artifacts', appId, 'teacherNotifications'));
    let internalNotificationCreated = false;

    try {
      await setDoc(notificationRef, {
        teacherName: teacherName || 'Profesor',
        teacherNameNormalized: String(teacherName || '').trim().toLowerCase(),
        teacherEmail: to,
        title: subject,
        body,
        type,
        status: 'unread',
        createdAt: now,
        createdBy: user?.email || 'admin',
        source: 'admin_portal',
        ...metadata
      });
      internalNotificationCreated = true;
    } catch (error) {
      console.error('No se pudo crear el aviso interno para el profesor:', error);
    }

    const emailSent = await sendNotificationEmail({ to, subject, body, type: 'notificacion_profesor' });

    if (internalNotificationCreated && emailSent) {
      try {
        await updateDoc(notificationRef, {
          emailSentAt: new Date().toISOString(),
          emailRecipient: to
        });
      } catch (error) {
        console.error('No se pudo marcar el correo del aviso interno como enviado:', error);
      }
    }

    return internalNotificationCreated || emailSent;
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
    if (targetType === 'sede') return activeCenterNames;
    if (targetType === 'instrumento') {
      return [...new Set([
        ...(settings.instrumentos || defaultInstrumentos),
        ...recurringClassesOnly.map(c => c.subject).filter(Boolean)
      ])].sort((a, b) => a.localeCompare(b));
    }
    if (targetType === 'profesor') {
      return allOfficialTeacherNames;
    }
    return [];
  };

  const getAnnouncementTeacherTargets = () => {
    const byEmail = new Map();

    allOfficialTeacherNames
      .forEach(teacherName => {
        const email = normalizeEmail(getTeacherEmail(teacherName));
        if (!email) return;
        if (!byEmail.has(email)) {
          byEmail.set(email, {
            email,
            name: teacherName,
            teacherName,
            classes: recurringClassesOnly.filter(c => isSameTeacher(c.teacher, teacherName)).map(c => c.id)
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
    if (targetType === 'sede') return isSameCenter(clase.centerId || clase.sede || 'Tarragona', targetValue);
    if (targetType === 'instrumento') return (clase.subject || '') === targetValue;
    if (targetType === 'profesor') return isSameTeacher(clase.teacher, targetValue);
    return false;
  };

  const getAnnouncementStudentTargets = (emailOptions = announceEmailOptions) => {
    if ((emailOptions.targetType || 'all') === 'teachers') return [];

    const byStudent = new Map();

    recurringClassesOnly
      .filter(c => matchesAnnouncementTarget(c, emailOptions))
      .forEach(c => {
        (c.students || [])
          .filter(isFixedClassStudent)
          .forEach(studentEntry => {
            const studentInfo = students.find(st => st.id === studentEntry.id) || null;
            if (studentInfo?.globalStatus === 'baja' || hasStudentClassEndedBeforeDate(studentEntry, studentInfo || {}, todayStr)) return;
            const email = normalizeEmail(studentInfo?.email || studentEntry.email || studentEntry.studentEmail || '');
            const studentId = studentInfo?.id || studentEntry.id || '';
            if (!studentId) return;
            if (!byStudent.has(studentId)) {
              byStudent.set(studentId, {
                email,
                name: studentInfo?.alias || studentInfo?.name || studentEntry.name || studentEntry.studentName || '',
                studentId,
                classes: []
              });
            }
            byStudent.get(studentId).classes.push(c.id);
          });
      });

    return [...byStudent.values()].sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || ''));
  };

  const getAnnouncementEmailTargets = (emailOptions = announceEmailOptions) => {
    if ((emailOptions.targetType || 'all') === 'teachers') {
      return getAnnouncementTeacherTargets();
    }

    const byEmail = new Map();
    getAnnouncementStudentTargets(emailOptions).forEach(target => {
      if (target.email && !byEmail.has(target.email)) byEmail.set(target.email, target);
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

  const buildAnnouncementEmailBody = ({ type, title, content, url, pollDeadline }, targetLabel) => {
    const cleanUrl = normalizeAnnouncementUrl(url);
    const isPoll = type === 'poll';
    const deadlineText = isPoll && pollDeadline
      ? `\nFECHA LÍMITE:\n${new Date(pollDeadline).toLocaleString('es-ES')}`
      : '';
    return `${isPoll ? 'Nueva encuesta' : 'Nuevo aviso'} en el Tablón de Escuela Los Mitos

TÍTULO:
${title}

DESTINATARIOS:
${targetLabel}

${isPoll ? 'INFORMACIÓN' : 'AVISO'}:
${content || (isPoll ? 'Entra en tu Área del Alumno para responder.' : '')}${deadlineText}${cleanUrl ? `\n\nENLACE:\n${cleanUrl}` : ''}

---
Este correo corresponde a una comunicación operativa del servicio educativo de Escuela Los Mitos.
${isPoll ? 'Puedes responder la encuesta' : 'También puedes consultar los avisos publicados'} accediendo a tu portal.`;
  };

  const sendAnnouncementEmailToTargets = async ({ announcement, emailOptions = announceEmailOptions }) => {
    if (!emailOptions.enabled) return { requested: false, count: 0 };

    const targets = getAnnouncementEmailTargets(emailOptions);
    if (targets.length === 0) {
      alert('No se ha enviado email porque el filtro elegido no tiene destinatarios con email válido.');
      return { requested: false, count: 0 };
    }

    const targetLabel = getAnnouncementTargetLabel(emailOptions);
    const subject = `[${announcement.type === 'poll' ? 'Encuesta' : 'Tablón'} Escuela Los Mitos] ${announcement.title}`;
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

  const getGestionTypeLabel = (type = 'tarea_manual') => ({
    alta_mitoverso: 'Alta Mitoverso',
    alta_mitobox: 'Alta Mitobox',
    aviso_ausencia: 'Aviso de ausencia',
    falta_reiterada: '4 faltas sin avisar',
    reserva_mitobox: 'Reserva Mitobox',
    tarea_manual: 'Tarea manual'
  }[type] || String(type || 'tarea_manual').replace(/_/g, ' '));

  const isExtraServiceGestion = (gestion = {}) => isExtraServiceGestionType(gestion?.type || '');

  const getExtraServiceConfigForGestion = (gestion = {}) => getExtraServiceConfigByType(gestion?.type || '') || (gestion?.extraService === 'mitoverso' ? EXTRA_SERVICE_CONFIG_BY_TYPE.alta_mitoverso : gestion?.extraService === 'mitobox' ? EXTRA_SERVICE_CONFIG_BY_TYPE.alta_mitobox : null);

  const getGestionTypeBadgeClass = (gestion = {}) => {
    const extraConfig = getExtraServiceConfigForGestion(gestion);
    if (extraConfig?.badgeClass) return extraConfig.badgeClass;
    const type = String(gestion?.type || '');
    if (type.includes('mitobox')) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (type.includes('baja')) return 'bg-red-100 text-red-800 border-red-200';
    if (type.includes('falta') || type.includes('ausencia')) return 'bg-orange-100 text-orange-800 border-orange-200';
    if (type.includes('mantenimiento') || type.includes('reactivar')) return 'bg-amber-100 text-amber-800 border-amber-200';
    if (type.includes('recuperacion')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (type.includes('manual') || gestion?.source === 'manual_admin') return 'bg-purple-100 text-purple-800 border-purple-200';
    return 'bg-zinc-200 text-zinc-800 border-zinc-200';
  };

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
    const extraServiceLine = gestion.extraServiceName || gestion.serviceName || getExtraServiceConfigForGestion(gestion)?.name || '';
    const extraMonthlyFeeLine = gestion.extraMonthlyFee ? `${gestion.extraMonthlyFee} €` : (getExtraServiceConfigForGestion(gestion)?.monthlyFee ? `${getExtraServiceConfigForGestion(gestion).monthlyFee} €` : '');
    const extraProratedFeeLine = gestion.extraProratedFee ? `${gestion.extraProratedFee} €` : (extraServiceLine ? 'A calcular manualmente según fecha real de activación' : '');
    const extraActivationLine = getExtraServiceConfigForGestion(gestion)?.activationTarget || '';

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
SERVICIO_EXTRA: ${extraServiceLine}
CUOTA_MENSUAL_EXTRA: ${extraMonthlyFeeLine}
PRORRATA_MES_ACTUAL: ${extraProratedFeeLine}
ACTIVACION_EXTRA: ${extraActivationLine}
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

      return updateDoc(doc(db, c.refPath), withClassStudentIndex(updatedList));
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
      const batch = writeBatch(db);
      batch.delete(doc(db, clase.refPath));
      getClassTemporaryChanges(clase).forEach(change => {
        batch.update(doc(db, 'artifacts', appId, 'temporaryClassChanges', change.id), {
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          cancelledBy: user?.email || 'admin',
          cancellationReason: 'class_deleted'
        });
      });
      await batch.commit();
      if (viewClassModal && viewClassModal.id === clase.id) {
        setViewClassModal(null);
      }
      alert("✅ Clase borrada correctamente.");
    } catch (e) {
      alert("❌ Error al borrar la clase: " + e.message);
    }
  };

  const gestionRequiresTadosi = (gestion = {}) => !gestion?.skipTadosi && TADOSI_REQUIRED_GESTION_TYPES.has(gestion?.type);
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

    const extraConfig = getExtraServiceConfigForGestion(gestion);
    const confirmText = extraConfig
      ? `¿Marcar como TADOSI HECHO la domiciliación de ${extraConfig.name} para ${gestion.studentName || 'alumno'}?

Esto NO activa todavía el servicio. Solo indica que la parte de Tadosi/domiciliación ya está preparada y deja el trámite listo para ejecutar.`
      : `¿Marcar como TADOSI HECHO este trámite de ${gestion.studentName || 'alumno'}?

Esto NO ejecuta cambios en clases. Solo deja el trámite listo para poder ejecutarlo al cierre.`;

    if (!window.confirm(confirmText)) return;

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

      if (isExtraServiceGestion(gestionData)) {
        const extraConfig = getExtraServiceConfigForGestion(gestionData);
        if (!extraConfig) {
          return fail('⚠️ No se ha podido identificar el servicio extra solicitado.');
        }
        if (!studentId || !studentInfo?.id) {
          return fail(`⚠️ No se puede activar ${extraConfig.name}: no se ha encontrado la ficha del alumno.`);
        }

        const alreadyActive = Boolean(studentInfo?.[extraConfig.studentFlag]);
        const nowIso = new Date().toISOString();
        const updatePayload = {
          [extraConfig.studentFlag]: true,
          [`${extraConfig.key}ActivatedAt`]: studentInfo?.[`${extraConfig.key}ActivatedAt`] || nowIso,
          [`${extraConfig.key}ActivatedBy`]: user?.email || 'admin',
          [`${extraConfig.key}SourceGestionId`]: gestionId
        };

        await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), updatePayload);

        await sendStudentNotification({
          studentEmail,
          subject: `Alta en ${extraConfig.name} activada - Escuela Los Mitos`,
          body: `Hola ${studentName},

Te confirmamos que ya hemos activado tu alta en ${extraConfig.name}.

La domiciliación correspondiente queda preparada por coordinación.

${extraConfig.key === 'mitoverso' ? 'Ya puedes acceder desde el Área del Alumno, pestaña Extras, usando el botón de Classroom.' : 'Ya puedes reservar sala desde el Área del Alumno, pestaña Extras.'}

Un saludo,
Coordinación Los Mitos.`
        });

        await finalizeGestionStatus(
          gestionId,
          'completado',
          gestionData,
          `${extraConfig.name} activado manualmente. ${alreadyActive ? 'El alumno ya figuraba como activo; se ha cerrado igualmente la solicitud.' : 'Se ha activado el acceso en la ficha del alumno.'}`,
          {
            workflowStatus: 'servicio_activado',
            extraServiceActivatedAt: nowIso,
            extraServiceActivatedBy: user?.email || 'admin',
            activatedExtraService: extraConfig.key,
            activatedStudentFlag: extraConfig.studentFlag
          }
        );

        return notify(`✅ ${extraConfig.name} activado para ${displayName}. El trámite queda cerrado y el alumno ya verá el servicio como activo en Extras.`);
      }
      else if (type === 'baja') {
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
          await updateDoc(doc(db, sourceClass.refPath), withClassStudentIndex(updatedList));

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
          if (c.refPath) await updateDoc(doc(db, c.refPath), withClassStudentIndex(updatedList));
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
            await updateDoc(doc(db, c.refPath), withClassStudentIndex(updatedList));
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
            await updateDoc(doc(db, c.refPath), withClassStudentIndex(updatedList));
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
        if (type !== 'cambio_horario' && isStudentInMaintenance(studentId, maintenanceCheckDate)) {
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

          if (isStudentInMaintenance(studentId, scheduledStartDate)) {
            const activeMaintenance = getActiveStudentMaintenancePeriod(studentId, scheduledStartDate);
            return fail(`⚠️ No se puede programar el cambio para esa fecha.\n\n${displayName} seguirá en mantenimiento ${formatMaintenancePeriodLine(activeMaintenance)}. Elige como fecha de inicio un día posterior al mantenimiento o finalízalo anticipadamente.`);
          }

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
              await updateDoc(doc(db, c.refPath), withClassStudentIndex(updatedList));
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
          await updateDoc(doc(db, targetClass.refPath), withClassStudentIndex(updatedTargetStudents));
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
        await updateDoc(doc(db, targetClass.refPath), withClassStudentIndex(updatedTargetStudents));
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

  const cancelStudentStatesForFinalBaja = async (studentId, currentGestionId = '', effectiveDate = todayStr) => {
    const now = new Date().toISOString();
    const closedRelocationStatuses = new Set(['cancelled', 'cancelada', 'expired', 'finalizada']);

    const periodsToCancel = maintenancePeriods.filter(period =>
      period.studentId === studentId &&
      String(period.status || 'active').toLowerCase() !== 'cancelled' &&
      (!period.until || period.until >= effectiveDate)
    );

    for (const period of periodsToCancel) {
      await updateDoc(doc(db, 'artifacts', appId, 'maintenancePeriods', period.id), {
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: user?.email || 'admin',
        cancelReason: `Cancelación automática por baja definitiva efectiva el ${effectiveDate}`
      });
    }

    const relocationsToCancel = temporaryRelocations.filter(relocation =>
      relocation.studentId === studentId &&
      !closedRelocationStatuses.has(String(relocation.status || 'active').toLowerCase()) &&
      (!relocation.until || relocation.until >= effectiveDate)
    );

    for (const relocation of relocationsToCancel) {
      await updateDoc(doc(db, 'artifacts', appId, 'temporaryRelocations', relocation.id), {
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: user?.email || 'admin',
        cancelReason: `Cancelación automática por baja definitiva efectiva el ${effectiveDate}`
      });
    }

    const gestionesToCancel = gestiones.filter(otherGestion => {
      if (otherGestion.studentId !== studentId || otherGestion.id === currentGestionId) return false;
      if (otherGestion.status === 'pendiente') return true;
      if (otherGestion.status !== 'completado' || otherGestion.workflowStatus === 'consolidado' || otherGestion.consolidatedAt) return false;

      const workflowStatus = String(otherGestion.workflowStatus || '').toLowerCase();
      const executionMode = String(otherGestion.executionMode || '').toLowerCase();
      const isScheduledAction = ['baja', 'cambio_horario'].includes(otherGestion.type) && Boolean(
        workflowStatus === 'programado' ||
        executionMode.includes('scheduled') ||
        (getScheduledGestionEndDate(otherGestion) && getScheduledGestionEffectiveDate(otherGestion))
      );
      return isScheduledAction;
    });

    for (const otherGestion of gestionesToCancel) {
      await updateDoc(doc(db, 'artifacts', appId, 'gestiones', otherGestion.id), {
        status: 'cancelado',
        workflowStatus: 'cancelado_por_baja',
        cancelledAt: now,
        cancelledBy: user?.email || 'admin',
        cancelReason: `Cancelación automática por baja definitiva efectiva el ${effectiveDate}`
      });
    }

    return {
      maintenancePeriods: periodsToCancel.length,
      temporaryRelocations: relocationsToCancel.length,
      gestiones: gestionesToCancel.length
    };
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
        await updateDoc(doc(db, classData.refPath), withClassStudentIndex(updatedStudents));
        localClassUpdates.set(classData.id, updatedStudents);
        removedClassLines.push(formatClassLine(classData));
      }
    }

    const hasRemainingSeat = hasRemainingCommittedFixedSeat(studentId, studentInfo, localClassUpdates);
    const shouldFinalizeGlobalBaja = isTotalBaja || !hasRemainingSeat;
    let ticketsVoided = 0;
    let cancelledStates = { maintenancePeriods: 0, temporaryRelocations: 0, gestiones: 0 };

    if (shouldFinalizeGlobalBaja) {
      await resetStudentTrivia(studentId);
      ticketsVoided = await voidStudentTickets(studentId, 'baja_programada_consolidada');
      cancelledStates = await cancelStudentStatesForFinalBaja(studentId, gestion.id || '', effectiveDate || todayStr);
      await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), {
        globalStatus: 'baja',
        classes: [],
        hasMitoverso: false,
        hasMitobox: false,
        extrasDisabledByBajaAt: new Date().toISOString(),
        extrasDisabledByBajaBy: user?.email || 'admin',
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
      ? `Baja definitiva consolidada para ${displayName}. Clases eliminadas: ${removedClassLines.length}. Tickets anulados: ${ticketsVoided}. Extras desactivados. Mantenimientos cancelados: ${cancelledStates.maintenancePeriods}. Recolocaciones canceladas: ${cancelledStates.temporaryRelocations}. Otras gestiones canceladas: ${cancelledStates.gestiones}.`
      : `Baja parcial consolidada para ${displayName}. Plaza eliminada: ${removedClassLines.length}. Conserva otras plazas activas.`;

    await updateDoc(doc(db, 'artifacts', appId, 'gestiones', gestion.id), buildConsolidatedGestionUpdate(gestion, summary, {
      consolidatedAction: shouldFinalizeGlobalBaja ? 'baja_total_definitiva' : 'baja_parcial_definitiva',
      consolidatedRemovedClassLines: removedClassLines,
      consolidatedRemovedClassCount: removedClassLines.length,
      consolidatedTicketsVoided: ticketsVoided,
      consolidatedMaintenancePeriodsCancelled: cancelledStates.maintenancePeriods,
      consolidatedTemporaryRelocationsCancelled: cancelledStates.temporaryRelocations,
      consolidatedOtherGestionesCancelled: cancelledStates.gestiones,
      consolidatedExtrasDisabled: shouldFinalizeGlobalBaja,
      consolidatedKeepsActiveSeats: !shouldFinalizeGlobalBaja
    }));

    return { ok: true, message: summary, finalizedGlobalBaja: shouldFinalizeGlobalBaja };
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
        await updateDoc(doc(db, classData.refPath), withClassStudentIndex(updatedStudents));
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
        const updatedTargetStudents = [...(targetClass.students || []), newStudentPayload];
        await updateDoc(doc(db, targetClass.refPath), withClassStudentIndex(updatedTargetStudents));
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
    const studentsWithFinalBaja = new Set();

    try {
      for (const gestion of expiredGestiones) {
        if (studentsWithFinalBaja.has(gestion.studentId)) {
          results.push({ gestion, result: { ok: true, skipped: true, message: 'Omitida porque una baja definitiva del mismo alumno ya se consolidó en este lote.' } });
          continue;
        }
        try {
          const result = gestion.type === 'baja'
            ? await consolidateScheduledBajaGestion(gestion)
            : await consolidateScheduledChangeGestion(gestion);
          if (result?.finalizedGlobalBaja) studentsWithFinalBaja.add(gestion.studentId);
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

  const createManualScheduledBajaForStudent = async (studentId, studentName) => {
    const studentInfo = students.find(s => s.id === studentId);
    if (!studentInfo) {
      alert('No se ha encontrado la ficha del alumno.');
      return;
    }

    if (studentInfo.scheduledBaja && studentInfo.scheduledBajaEffectiveDate && studentInfo.scheduledBajaEffectiveDate > todayStr) {
      alert(`${studentName} ya tiene una baja programada.\n\nÚltimo día activo: ${formatDateSpanish(studentInfo.scheduledBajaClassEndDate)}.\nFecha efectiva: ${formatDateSpanish(studentInfo.scheduledBajaEffectiveDate)}.`);
      return;
    }

    const fixedClasses = getFixedStudentClasses(studentId);
    if (fixedClasses.length === 0) {
      alert(`${studentName} no tiene ninguna plaza fija activa que pueda programarse para baja.`);
      return;
    }

    const classPreview = fixedClasses.map(c => `· ${formatClassLine(c)}`).join('\n');
    const confirmed = window.confirm(`¿Programar la BAJA TOTAL de ${studentName}?\n\nEl alumno seguirá activo y aparecerá en las listas hasta la fecha de fin que indicarás a continuación. Desde el día siguiente dejará de aparecer y la baja quedará preparada para su consolidación definitiva.\n\nClases afectadas:\n${classPreview}`);
    if (!confirmed) return;

    const now = new Date().toISOString();
    const gestionId = `baja-manual-${studentId}-${Date.now()}`;
    const gestionData = {
      id: gestionId,
      type: 'baja',
      status: 'pendiente',
      title: 'Baja total programada desde Alumnos CRM',
      details: 'Baja total creada manualmente desde Alumnos CRM. El alumno permanece activo hasta la fecha de fin seleccionada.',
      studentId,
      studentName,
      studentEmail: studentInfo.email || '',
      date: now,
      source: 'manual_admin',
      bajaScope: 'total',
      bajaTotal: true,
      isTotalBaja: true,
      requestedTeacher: [...new Set(fixedClasses.map(c => c.teacher).filter(Boolean))].join(', '),
      affectedClassIds: fixedClasses.map(c => c.id),
      affectedClassLines: fixedClasses.map(c => formatClassLine(c)),
      skipTadosi: true,
      manualExecution: true,
      workflowStatus: 'programacion_manual',
      createdAt: now,
      createdBy: user?.email || 'admin'
    };

    try {
      await setDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), gestionData);
      const result = await updateGestionStatus(gestionId, 'completado', gestionData, { skipConfirm: true });

      if (result?.cancelled) {
        await deleteDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId));
      }
    } catch (error) {
      console.error('Error al programar la baja manual:', error);
      alert('No se pudo programar la baja: ' + error.message);
    }
  };

  const handleUpdateStudentStatus = async (studentId, studentName, newStatus) => {
    if (newStatus === 'mantenimiento') {
      await createManualMaintenanceForStudent(studentId, studentName);
      return;
    }

    if (newStatus === 'baja') {
      await createManualScheduledBajaForStudent(studentId, studentName);
      return;
    }
    if (newStatus === 'impago') {
      const confirmImpago = window.confirm(`¿Marcar a ${studentName} como IMPAGO?\n\nMantendrá su plaza y seguirá apareciendo en las clases, pero perderá temporalmente el acceso al Área del Alumno hasta que lo reactives.`);
      if (!confirmImpago) return;
    }
    try {
      const studentInfo = students.find(s => s.id === studentId);
      const displayName = studentInfo?.useAlias && studentInfo?.alias ? studentInfo.alias : studentName;
      await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), { globalStatus: newStatus });
      if (newStatus === 'activo') {
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
      await updateDoc(doc(db, classData.refPath), withClassStudentIndex(updatedStudents));
    } catch (e) {
      alert('Error al borrar alumno de la clase: ' + e.message);
    }
  };

  const createManualScheduledClassChange = async (student, targetClass) => {
    if (!student?.id || !targetClass?.id) return;
    if (student.globalStatus === 'baja') {
      alert(`${student.name} está dado de baja. No se puede programar un cambio de clase.`);
      return;
    }

    const oldClasses = recurringClassesOnly.filter(c =>
      c.id !== targetClass.id &&
      c.subject === targetClass.subject &&
      (c.students || []).some(entry => entry.id === student.id && isFixedClassStudent(entry) && isStudentClassCommittedOnDate(entry, student, todayStr))
    );

    if (oldClasses.length === 0) {
      alert(`${student.name} no tiene una plaza activa de ${targetClass.subject} que pueda cambiarse a este grupo.`);
      return;
    }

    const existingScheduledChange = gestiones.find(gestion =>
      gestion.studentId === student.id &&
      gestion.type === 'cambio_horario' &&
      gestion.workflowStatus !== 'consolidado' &&
      !gestion.consolidatedAt &&
      (gestion.status === 'pendiente' || gestion.status === 'completado')
    );

    if (existingScheduledChange) {
      alert(`${student.name} ya tiene un cambio de clase pendiente o programado. Revísalo en Bandeja antes de crear otro.`);
      return;
    }

    const sourceLines = oldClasses.map(c => `· ${formatClassLine(c)}`).join('\n');
    if (!window.confirm(`¿Programar el cambio de clase de ${student.name}?\n\nHorario actual:\n${sourceLines}\n\nNuevo horario:\n· ${formatClassLine(targetClass)}\n\nA continuación indicarás el último día en el horario actual. El nuevo horario comenzará al día siguiente.`)) return;

    const now = new Date().toISOString();
    const gestionId = `cambio-manual-${student.id}-${Date.now()}`;
    const singleSourceClass = oldClasses.length === 1 ? oldClasses[0] : null;
    const gestionData = {
      id: gestionId,
      type: 'cambio_horario',
      status: 'pendiente',
      title: 'Cambio de clase programado desde Alumnos CRM',
      details: 'Cambio creado manualmente desde Alumnos CRM. El alumno conserva el horario actual hasta la fecha de fin seleccionada.',
      studentId: student.id,
      studentName: student.name,
      studentEmail: student.email || '',
      requestedClass: targetClass.id,
      requestedClassLine: formatClassLine(targetClass),
      requestedTeacher: targetClass.teacher || '',
      affectedClassIds: oldClasses.map(c => c.id),
      affectedClassLines: oldClasses.map(c => formatClassLine(c)),
      ...(singleSourceClass ? {
        sourceClassId: singleSourceClass.id,
        sourceClassLine: formatClassLine(singleSourceClass),
        sourceClassRefPath: singleSourceClass.refPath || ''
      } : {}),
      date: now,
      source: 'manual_admin',
      skipTadosi: true,
      manualExecution: true,
      workflowStatus: 'programacion_manual',
      createdAt: now,
      createdBy: user?.email || 'admin'
    };

    try {
      await setDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), gestionData);
      const result = await updateGestionStatus(gestionId, 'completado', gestionData, { skipConfirm: true });
      if (result?.cancelled) {
        await deleteDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId));
        return;
      }
      if (result?.ok) setChangeClassModal(null);
    } catch (error) {
      console.error('Error al programar el cambio manual:', error);
      alert(`❌ Error al programar el cambio de clase: ${error.message}`);
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

  const getPollResponses = (pollId) => pollResponses.filter(response => response.pollId === pollId);

  const isPollClosed = (poll = {}) => {
    if (['closed', 'archived'].includes(poll.pollStatus)) return true;
    if (!poll.pollDeadline) return false;
    return new Date(poll.pollDeadline).getTime() <= pollClock;
  };

  const getPollStatusLabel = (poll = {}) => {
    if (poll.pollStatus === 'archived') return 'Archivada';
    return isPollClosed(poll) ? 'Cerrada' : 'Abierta';
  };

  const addPollOption = () => {
    setNewAnnounce(prev => ({ ...prev, pollOptions: [...(prev.pollOptions || []), createPollOption()] }));
  };

  const updatePollOption = (optionId, label) => {
    setNewAnnounce(prev => ({
      ...prev,
      pollOptions: (prev.pollOptions || []).map(option => option.id === optionId ? { ...option, label } : option)
    }));
  };

  const removePollOption = (optionId) => {
    setNewAnnounce(prev => ({ ...prev, pollOptions: (prev.pollOptions || []).filter(option => option.id !== optionId) }));
  };

  const setPollStatus = async (poll, status) => {
    const labels = { open: 'reabrir', closed: 'cerrar', archived: 'archivar' };
    if (status === 'open' && poll.pollDeadline && new Date(poll.pollDeadline).getTime() <= Date.now()) {
      alert('Amplía primero la fecha límite editando la encuesta y después podrás reabrirla.');
      return;
    }
    if (!window.confirm(`¿Quieres ${labels[status] || 'actualizar'} esta encuesta?`)) return;
    await updateDoc(doc(db, 'artifacts', appId, 'announcements', poll.id), {
      pollStatus: status,
      updatedAt: new Date().toISOString()
    });
  };

  const getPollParticipation = (poll) => {
    const responses = getPollResponses(poll.id);
    const audience = getAnnouncementStudentTargets({ targetType: poll.audienceType || 'all', targetValue: poll.audienceValue || '' });
    const respondedIds = new Set(responses.map(response => response.studentId).filter(Boolean));
    return {
      responses,
      audience,
      respondedIds,
      missing: audience.filter(target => !respondedIds.has(target.studentId)),
      percentage: audience.length ? (responses.length / audience.length) * 100 : 0
    };
  };

  const copyPollMissingEmails = async (poll) => {
    const emails = [...new Set(getPollParticipation(poll).missing.map(target => normalizeEmail(target.email)).filter(Boolean))];
    if (!emails.length) return alert('No hay correos pendientes de respuesta para copiar.');
    const text = emails.map(email => `${email},`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      alert(`${emails.length} correo(s) pendiente(s) copiado(s), uno por fila.`);
    } catch (error) {
      alert('El navegador no ha permitido copiar los correos. Revisa los permisos del portapapeles.');
    }
  };

  const sendPollReminder = async (poll) => {
    const emails = [...new Set(getPollParticipation(poll).missing.map(target => normalizeEmail(target.email)).filter(Boolean))];
    if (!emails.length) return alert('No hay alumnos pendientes con un correo válido.');
    if (!window.confirm(`¿Enviar un recordatorio a ${emails.length} alumno(s) que todavía no han respondido?`)) return;
    const requested = await sendNotificationEmail({
      to: ANNOUNCEMENT_EMAIL_TO,
      subject: `[Recordatorio de encuesta] ${poll.title}`,
      body: `Todavía no has respondido a esta encuesta de Escuela Los Mitos:\n\n${poll.title}\n\n${poll.content || ''}${poll.pollDeadline ? `\n\nPuedes responder hasta el ${new Date(poll.pollDeadline).toLocaleString('es-ES')}.` : ''}\n\nEntra en tu Área del Alumno y abre el Tablón para responder.`,
      type: 'recordatorio_encuesta',
      recipients: emails,
      pollId: poll.id,
      batchSize: ANNOUNCEMENT_EMAIL_BATCH_SIZE
    });
    if (requested) {
      await updateDoc(doc(db, 'artifacts', appId, 'announcements', poll.id), {
        pollLastReminderSentAt: new Date().toISOString(),
        pollLastReminderRecipientCount: emails.length
      });
      alert(`Recordatorio solicitado para ${emails.length} alumno(s).`);
    } else {
      alert('No se ha podido solicitar el envío del recordatorio.');
    }
  };

  const exportPollResults = (poll) => {
    const { responses } = getPollParticipation(poll);
    const optionById = new Map((poll.pollOptions || []).map(option => [option.id, option.label]));
    const header = ['Encuesta', 'Alumno', 'Email', 'Respuesta', 'Fecha'];
    const rows = responses.map(response => {
      const answer = poll.pollAnswerType === 'text'
        ? response.textAnswer || ''
        : (response.selectedOptionIds || []).map(optionId => optionById.get(optionId) || optionId).join(' | ');
      return [
        poll.title,
        poll.pollPrivacy === 'confidential' ? 'Respuesta confidencial' : (response.studentName || ''),
        poll.pollPrivacy === 'confidential' ? '' : (response.studentEmail || ''),
        answer,
        response.updatedAt || response.createdAt || ''
      ];
    });
    const csv = [header, ...rows].map(row => row.map(escapeCsvCell).join(';')).join('\n');
    downloadTextFile(`Encuesta_${String(poll.title || 'resultados').replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ]+/g, '_')}_${getTodayLocalString()}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const postAnnouncement = async () => {
    const isPoll = newAnnounce.type === 'poll';
    if (!newAnnounce.title || (!isPoll && !newAnnounce.content)) return alert(isPoll ? 'Escribe la pregunta de la encuesta.' : 'Rellena titular y detalles del aviso');
    const cleanUrl = normalizeAnnouncementUrl(newAnnounce.url);
    if (cleanUrl === null) return alert('La URL debe empezar por https:// o http://');

    const audienceOptions = {
      targetType: announceEmailOptions.targetType || 'all',
      targetValue: announceEmailOptions.targetValue || ''
    };
    if (!['all', 'teachers'].includes(audienceOptions.targetType) && !String(audienceOptions.targetValue || '').trim()) {
      return alert('Selecciona el segmento de destinatarios del aviso.');
    }
    if (isPoll && audienceOptions.targetType === 'teachers') {
      return alert('Las encuestas de esta versión solo pueden dirigirse a alumnos.');
    }

    const cleanPollOptions = (newAnnounce.pollOptions || [])
      .map(option => ({ id: option.id || createPollOption().id, label: String(option.label || '').trim() }))
      .filter(option => option.label);
    if (isPoll && newAnnounce.pollAnswerType !== 'text' && cleanPollOptions.length < 2) {
      return alert('Añade al menos dos opciones de respuesta.');
    }
    if (isPoll && !newAnnounce.pollDeadline) return alert('Indica la fecha y hora límite de la encuesta.');

    const existingResponses = editingAnnouncementId ? getPollResponses(editingAnnouncementId) : [];
    const existingAnnouncement = editingAnnouncementId ? announcements.find(item => item.id === editingAnnouncementId) : null;
    if (isPoll && existingResponses.length > 0 && existingAnnouncement) {
      const originalOptions = JSON.stringify((existingAnnouncement.pollOptions || []).map(option => ({ id: option.id, label: option.label })));
      const editedOptions = JSON.stringify(cleanPollOptions);
      if (existingAnnouncement.pollAnswerType !== newAnnounce.pollAnswerType || originalOptions !== editedOptions) {
        return alert('La encuesta ya tiene respuestas. No se pueden cambiar el tipo ni las opciones.');
      }
      if ((existingAnnouncement.pollPrivacy || 'identified') !== (newAnnounce.pollPrivacy || 'identified')) {
        return alert('La encuesta ya tiene respuestas. No se puede cambiar la identificación de las respuestas.');
      }
      if ((existingAnnouncement.audienceType || 'all') !== audienceOptions.targetType || String(existingAnnouncement.audienceValue || '') !== String(audienceOptions.targetValue || '')) {
        return alert('La encuesta ya tiene respuestas. No se pueden cambiar sus destinatarios.');
      }
    }
    const audienceLabel = getAnnouncementTargetLabel(audienceOptions);

    const payload = {
      type: isPoll ? 'poll' : 'notice',
      title: newAnnounce.title.trim(),
      content: String(newAnnounce.content || '').trim(),
      url: cleanUrl || '',
      audienceType: audienceOptions.targetType,
      audienceValue: audienceOptions.targetType === 'teachers' ? '' : (audienceOptions.targetValue || ''),
      audienceLabel,
      ...(isPoll ? {
        pollAnswerType: newAnnounce.pollAnswerType || 'single',
        pollOptions: newAnnounce.pollAnswerType === 'text' ? [] : cleanPollOptions,
        pollDeadline: newAnnounce.pollDeadline,
        pollPrivacy: newAnnounce.pollPrivacy || 'identified',
        pollAllowEdit: newAnnounce.pollAllowEdit !== false,
        pollResultsVisibility: newAnnounce.pollResultsVisibility || 'never',
        pollStatus: existingAnnouncement?.pollStatus || 'open'
      } : {})
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

    setNewAnnounce(createEmptyAnnouncementDraft());
    setAnnounceEmailOptions({ enabled: false, targetType: 'all', targetValue: '' });
  };

  const startEditAnnouncement = (ann) => {
    setEditingAnnouncementId(ann.id);
    setNewAnnounce({
      type: ann.type === 'poll' ? 'poll' : 'notice',
      title: ann.title || '',
      content: ann.content || '',
      url: normalizeAnnouncementUrl(ann.url) || '',
      pollAnswerType: ann.pollAnswerType || 'single',
      pollOptions: (ann.pollOptions || []).map(option => ({ ...option })),
      pollDeadline: ann.pollDeadline || '',
      pollPrivacy: ann.pollPrivacy || 'identified',
      pollAllowEdit: ann.pollAllowEdit !== false,
      pollResultsVisibility: ann.pollResultsVisibility || 'never'
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
    setNewAnnounce(createEmptyAnnouncementDraft());
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

  const deleteAnnouncement = async (announcement) => {
    const item = typeof announcement === 'string' ? announcements.find(entry => entry.id === announcement) : announcement;
    const id = typeof announcement === 'string' ? announcement : announcement?.id;
    if (!id) return;
    if (item?.type === 'poll' && getPollResponses(id).length > 0) {
      if (window.confirm('Esta encuesta ya tiene respuestas y no se puede borrar. ¿Quieres archivarla?')) {
        await updateDoc(doc(db, 'artifacts', appId, 'announcements', id), { pollStatus: 'archived', updatedAt: new Date().toISOString() });
      }
      return;
    }
    if(window.confirm(item?.type === 'poll' ? '¿Borrar encuesta?' : '¿Borrar aviso?')) await deleteDoc(doc(db, 'artifacts', appId, 'announcements', id));
  };

  const handleDownloadBIReport = () => {
    const generatedAt = new Date();
    const dateLabel = generatedAt.toLocaleString('es-ES');
    const money = value => `${Number(value || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

    const lines = [
      'INFORME BI · ESCUELA LOS MITOS',
      `Generado: ${dateLabel}`,
      `Vista: ${biProjectionMode === 'proyeccion' ? 'PROYECCIÓN DEL MES SIGUIENTE · escenario con solicitudes pendientes' : 'ACTUAL'}`,
      `Periodo de referencia: ${formatDateSpanish(businessIntelligence.periodStart)} - ${formatDateSpanish(businessIntelligence.periodEnd)}`,
      '',
      'RESUMEN GLOBAL',
      `Ingresos por clases activas: ${money(businessIntelligence.totalIngresosClases)} (${businessIntelligence.totalMatriculasActivas || 0} matrículas/cuotas activas)`,
      `Alumnos únicos con al menos una matrícula activa: ${businessIntelligence.totalAlumnosActivosUnicos || 0}`,
      `Ingresos por mantenimiento: ${money(businessIntelligence.ingresosMantenimiento)} (${businessIntelligence.alumnosMantenimiento} alumno/s × ${MAINTENANCE_MONTHLY_FEE} €)`,
      `Ingresos recurrentes de Extras: ${money(businessIntelligence.ingresosExtras)} (Mitoverso: ${money(businessIntelligence.ingresosMitoverso)} · ${businessIntelligence.alumnosMitoverso || 0} altas; Mitobox: ${money(businessIntelligence.ingresosMitobox)} · ${businessIntelligence.alumnosMitobox || 0} altas)`,
      `Inicios futuros sin ingreso todavía: ${businessIntelligence.totalMatriculasInicioFuturo || 0} matrícula/s`,
      `Plazas fijas comprometidas: ${businessIntelligence.totalPlazasComprometidas || 0}`,
      `Impagos incluidos como plaza activa/riesgo: ${businessIntelligence.totalImpagos || 0}`,
      `Ingresos totales estimados: ${money(businessIntelligence.totalIngresos)}`,
      `Coste profesores previsto: ${money(businessIntelligence.costeTotalProfesores)} (solo clases operativas)`,
      `Clases operativas: ${businessIntelligence.totalClasesOperativas || 0} · Hibernadas/no computables: ${businessIntelligence.totalClasesHibernadas || 0}`,
      `Horas semanales computables: ${(businessIntelligence.totalHorasSemanalesOperativas || 0).toFixed(1)} · Hibernadas no computadas: ${(businessIntelligence.totalHorasSemanalesHibernadas || 0).toFixed(1)}`,
      `Gastos fijos: ${money(businessIntelligence.totalFijos)}`,
      `Resultado estimado: ${money(businessIntelligence.beneficioNeto)}`,
      `Criterio de previsión docente: ${BI_WEEKS_PER_MONTH} semanas/mes`,
      ...(businessIntelligence.alumnosMantenimientoLegacy > 0 ? [
        `Aviso: ${businessIntelligence.alumnosMantenimientoLegacy} alumno/s conservan el estado antiguo «congelado» o una pausa heredada; se tratan como mantenimiento para no inflar ingresos.`
      ] : []),
      ...(biProjectionMode === 'proyeccion' ? [
        '',
        'COMPARACIÓN DE LA PROYECCIÓN',
        `Base confirmada del mes siguiente: ingresos ${money(confirmedNextMonthBusinessIntelligence.totalIngresos)} · resultado ${money(confirmedNextMonthBusinessIntelligence.beneficioNeto)}`,
        `Escenario incluyendo pendientes: ingresos ${money(projectedBusinessIntelligence.totalIngresos)} · resultado ${money(projectedBusinessIntelligence.beneficioNeto)}`,
        `Variación potencial por solicitudes pendientes: ingresos ${money(projectedBusinessIntelligence.totalIngresos - confirmedNextMonthBusinessIntelligence.totalIngresos)} · resultado ${money(projectedBusinessIntelligence.beneficioNeto - confirmedNextMonthBusinessIntelligence.beneficioNeto)}`,
        `Solicitudes pendientes aplicadas: ${biProjectionInputs.meta.appliedPending.length} · pendientes no simuladas por falta de datos: ${biProjectionInputs.meta.skippedPending.length}`
      ] : []),
      '',
      'POR SEDE',
      ...centerNamesForReporting.flatMap(sede => {
        const data = businessIntelligence.porSede[sede] || { ingresos: 0, ingresosClases: 0, mantenimiento: 0, costesProf: 0, alumnosMantenimiento: 0, alumnosActivos: 0, alumnosInicioFuturo: 0, plazasComprometidas: 0, impagos: 0 };
        const gastoFijo = getCenterFixedCost(sede);
        return [
          `${sede}:`,
          `  Ingresos clases: ${money(data.ingresosClases)} (${data.alumnosActivos || 0} matrículas activas · ${data.alumnosUnicos || 0} alumnos únicos)`,
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
      ...businessIntelligence.porProfe.map(p => `${p.name}: ingresos ${money(p.ingresos)} · coste ${money(p.costes)} · margen ${money(p.beneficio)} · ${(p.horasSemanales || 0).toFixed(1)} h/sem equivalentes · ${p.clasesOperativas || 0} clase(s) operativas · ${p.clasesHibernadas || 0} hibernada(s)${p.sesionesSustitucion ? ` · ${p.sesionesSustitucion} sesión/es como sustituto/a` : ''}`),
      '',
      'POR INSTRUMENTO',
      ...businessIntelligence.porInstrumento.map(i => `${i.name}: ingresos ${money(i.ingresos)} · coste ${money(i.costes)} · margen ${money(i.beneficio)} · ${i.numGrupos || 0} grupo/s operativos · ${i.numGruposHibernados || 0} hibernado/s`),
      '',
      'DETALLE POR CLASE',
      ...businessIntelligence.clasesRentabilidad.map(c => `${c.subject} · ${c.teacher} · ${c.sede} · ${getDayName(c.dayOfWeek)} ${c.time} · ${c.estadoOperativo || (c.isHibernated ? 'HIBERNADA' : 'OPERATIVA')} · matrículas con ingreso ${c.numAlumnos} · asistentes operativos ${c.numAlumnosOperativos} · mantenimiento ${c.numCongelados} · inicio futuro ${c.numInicioFuturo || 0} · recolocados fuera/dentro ${c.numRecolocadosFuera || 0}/${c.numRecolocadosDentro || 0} · plazas comprometidas ${c.numPlazasComprometidas || 0} · horas computables ${(c.horasComputables || 0).toFixed(1)} · ingresos ${money(c.ingresos)} · coste ${money(c.coste)} · margen ${money(c.beneficio)}${c.teacherCostShares?.some(share => share.isSubstitute) ? ` · reparto coste: ${c.teacherCostShares.map(share => `${share.teacher} ${money(share.cost)}`).join(' / ')}` : ''}`),
      ...(biProjectionMode === 'proyeccion' && biProjectionInputs.meta.skippedPending.length > 0 ? [
        '',
        'SOLICITUDES PENDIENTES NO SIMULADAS',
        ...biProjectionInputs.meta.skippedPending.map(item => `- ${item.type || 'gestión'} · ${item.reason}`)
      ] : []),
      '',
      'Nota: este informe es una previsión operativa, no sustituye la contabilidad real de Tadosi. Los cambios temporales logísticos de una clase no alteran las cifras; solo se reasigna el coste cuando cambia el profesor.'
    ];

    const filename = `Informe_BI_Los_Mitos_${biProjectionMode === 'proyeccion' ? 'Proyeccion_' : 'Actual_'}${getTodayLocalString()}.txt`;
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
      const turno = `${getClassCenterName(clase)} · ${getDayName(clase.dayOfWeek)} ${clase.time || ''}${endTime ? `-${endTime}` : ''} · ${getClassRoomName(clase)}`;

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
      return `${clase.subject || 'Clase'} · ${getDayName(clase.dayOfWeek)} · ${clase.time || ''}h · ${getClassCenterName(clase)}${clase.sala || clase.roomId ? ` · ${getClassRoomName(clase)}` : ''} · ${clase.teacher || 'Sin profesor'}`;
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
      const turno = `${getClassCenterName(clase)} · ${getDayName(clase.dayOfWeek)} ${clase.time || ''}${endTime ? `-${endTime}` : ''} · ${getClassRoomName(clase)}`;
      const summaryLine = `${turno} · ${clase.subject || 'Clase'} · ${clase.teacher || 'Sin profesor'} · ${statusLabel} · activos ${activeCount} · mantenimiento ${maintenanceCount} · inicio futuro ${futureStartCount} · ocupación ${occupiedCount}/${cap || 'sin aforo'} · libres ${freeSpotsLabel}`;

      return {
        id: clase.id,
        classData: clase,
        sede: getClassCenterName(clase),
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
    pushGroupedRows('POR SEDE', planningRows, row => row.sede || 'Tarragona', (a, b) => centerNamesForReporting.indexOf(a) - centerNamesForReporting.indexOf(b));
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

    activeCenterNames.forEach(sede => {
      const clasesSede = recurringClassesOnly.filter(c => isSameCenter(c.centerId || c.sede || 'Tarragona', sede) && c.isWebVisible === true);
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

  const getTriviaPrize = period => String(settings.prizes?.[period] || '').trim();

  const ensureTriviaPrizes = periods => {
    const missing = periods.filter(period => !getTriviaPrize(period));
    if (missing.length === 0) return true;
    const labels = { mensual: 'mensual', trimestral: 'trimestral', anual: 'anual' };
    alert(`Antes de cerrar el reto, define y guarda el premio ${missing.map(period => labels[period]).join(', ')} en esta misma pestaña.`);
    return false;
  };

  const buildTriviaResultSection = (periodLabel, podium, prize) => {
    const winners = podium[0]?.students || [];
    const winningScore = podium[0]?.score || 0;
    return `${periodLabel.toUpperCase()}\nGanador${winners.length === 1 ? '/a' : 'es'}: ${winners.map(formatPublicContestantName).join(', ')} — ${winningScore} puntos\nPremio: ${prize}\n\n${formatTriviaPodium(`Podio ${periodLabel.toLowerCase()}`, podium)}`;
  };

  const publishTriviaClosure = async (title, content, closureType) => {
    const id = `trivia-${closureType}-${Date.now()}`;
    await setDoc(doc(db, 'artifacts', appId, 'announcements', id), {
      title,
      content,
      date: getTodayLocalString(),
      type: 'notice',
      targetType: 'all',
      targetValue: '',
      triviaClosureType: closureType,
      createdAt: new Date().toISOString()
    });
  };

  const handleCerrarRetoMensual = async () => {
    const monthlyPodium = buildTriviaPodium(students, student => student.triviaPoints);
    if (monthlyPodium.length === 0) return alert('Nadie ha jugado este mes.');
    if (!ensureTriviaPrizes(['mensual'])) return;

    const winners = monthlyPodium[0].students;
    const maxScore = monthlyPodium[0].score;
    if (!window.confirm(`¿Confirmas el cierre del MES?\n\nSe publicarán el ganador, el premio mensual y el podio. Los puntos pasarán al acumulado del trimestre y del año.\n\nGanador(es): ${winners.length} · ${maxScore} puntos.`)) return;

    setLoading(true);
    try {
      const players = students.filter(student => Number(student.triviaPoints || 0) > 0);
      await Promise.all(players.map(player => updateDoc(doc(db, 'artifacts', appId, 'students', player.id), {
        triviaPointsQuarterly: Number(player.triviaPointsQuarterly || 0) + Number(player.triviaPoints || 0),
        triviaPointsAnnual: Number(player.triviaPointsAnnual || 0) + Number(player.triviaPoints || 0),
        triviaPoints: 0
      })));

      const content = `${buildTriviaResultSection('Resultado mensual', monthlyPodium, getTriviaPrize('mensual'))}\n\nLos puntos mensuales pasan ahora a los rankings trimestral y anual.`;
      await publishTriviaClosure('🏆 Ganador y podio del mes', content, 'mensual');
      alert('Mes cerrado. Se ha publicado el premio y el podio con nombres abreviados.');
    } catch (e) {
      alert('Error al cerrar el mes: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCerrarRetoTrimestral = async () => {
    const monthlyPodium = buildTriviaPodium(students, student => student.triviaPoints);
    const quarterlyPodium = buildTriviaPodium(students, student => Number(student.triviaPointsQuarterly || 0) + Number(student.triviaPoints || 0));
    if (monthlyPodium.length === 0) return alert('No hay puntos del mes actual. En el cierre trimestral se publican conjuntamente el resultado mensual y el trimestral.');
    if (quarterlyPodium.length === 0) return alert('Nadie ha acumulado puntos en el trimestre.');
    if (!ensureTriviaPrizes(['mensual', 'trimestral'])) return;

    if (!window.confirm(`¿Confirmas el cierre del TRIMESTRE?\n\nSe publicarán conjuntamente:\n· Ganador, premio y podio mensual.\n· Ganador, premio y podio trimestral.\n\nEl mes y el trimestre quedarán a cero; el ranking anual conservará sus puntos.`)) return;

    setLoading(true);
    try {
      const players = students.filter(student => Number(student.triviaPoints || 0) > 0 || Number(student.triviaPointsQuarterly || 0) > 0);
      await Promise.all(players.map(player => updateDoc(doc(db, 'artifacts', appId, 'students', player.id), {
        triviaPoints: 0,
        triviaPointsQuarterly: 0,
        triviaPointsAnnual: Number(player.triviaPointsAnnual || 0) + Number(player.triviaPoints || 0)
      })));

      const content = [
        buildTriviaResultSection('Resultado mensual', monthlyPodium, getTriviaPrize('mensual')),
        buildTriviaResultSection('Resultado trimestral', quarterlyPodium, getTriviaPrize('trimestral')),
        'El ranking anual continúa en marcha.'
      ].join('\n\n────────────────\n\n');
      await publishTriviaClosure('👑 Ganadores mensual y trimestral', content, 'trimestral');
      alert('Trimestre cerrado. Se han publicado los dos premios y ambos podios.');
    } catch (e) {
      alert('Error al cerrar el trimestre: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCerrarRetoAnual = async () => {
    const monthlyPodium = buildTriviaPodium(students, student => student.triviaPoints);
    const quarterlyPodium = buildTriviaPodium(students, student => Number(student.triviaPointsQuarterly || 0) + Number(student.triviaPoints || 0));
    const annualPodium = buildTriviaPodium(students, student => Number(student.triviaPointsAnnual || 0) + Number(student.triviaPoints || 0));
    if (monthlyPodium.length === 0) return alert('No hay puntos del mes actual. En el cierre anual se publican conjuntamente los resultados mensual, trimestral y anual.');
    if (quarterlyPodium.length === 0 || annualPodium.length === 0) return alert('No hay puntos suficientes para cerrar conjuntamente el trimestre y el año.');
    if (!ensureTriviaPrizes(['mensual', 'trimestral', 'anual'])) return;

    if (!window.confirm(`⚠️ CIERRE ANUAL\n\nSe publicarán conjuntamente los ganadores, premios y podios mensual, trimestral y anual. Después se pondrán a cero todos los contadores del Trivial, incluidas rachas y victorias.\n\n¿Confirmas el cierre de temporada?`)) return;

    setLoading(true);
    try {
      const players = students.filter(student =>
        Number(student.triviaPointsAnnual || 0) > 0 ||
        Number(student.triviaPointsQuarterly || 0) > 0 ||
        Number(student.triviaPoints || 0) > 0 ||
        Number(student.triviaStreak || 0) > 0 ||
        Number(student.triviaVictories || 0) > 0
      );
      await Promise.all(players.map(player => updateDoc(doc(db, 'artifacts', appId, 'students', player.id), {
        triviaPoints: 0,
        triviaPointsQuarterly: 0,
        triviaPointsAnnual: 0,
        triviaStreak: 0,
        triviaVictories: 0
      })));

      const content = [
        buildTriviaResultSection('Resultado mensual', monthlyPodium, getTriviaPrize('mensual')),
        buildTriviaResultSection('Resultado trimestral', quarterlyPodium, getTriviaPrize('trimestral')),
        buildTriviaResultSection('Resultado anual', annualPodium, getTriviaPrize('anual')),
        '¡Enhorabuena a todos los participantes! Comienza una nueva temporada del Trivial.'
      ].join('\n\n────────────────\n\n');
      await publishTriviaClosure('🌟 Ganadores de cierre de temporada', content, 'anual');
      alert('Año cerrado. Se han publicado los tres premios y los tres podios; el Trivial queda reiniciado.');
    } catch (e) {
      alert('Error al cerrar el año: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const saveGlobalSettings = async (newSettings, successMessage = 'Ajustes guardados correctamente.') => {
    const normalizedCenters = normalizeCenters(newSettings.centers || centers, newSettings);
    const legacyCenterSettings = buildLegacyCenterSettings(normalizedCenters, newSettings);
    const payload = {
      ...newSettings,
      ...legacyCenterSettings,
      centers: normalizedCenters,
      centersSchemaVersion: 1
    };
    await setDoc(doc(db, 'artifacts', appId, 'settings', 'global'), payload, { merge: true });
    setSettings(previous => ({ ...previous, ...payload }));
    if (successMessage) alert(successMessage);
  };

  const createEmptyCenterEditor = () => ({
    id: '',
    name: '',
    aliases: [],
    status: 'draft',
    type: 'owned',
    operatorId: 'los-mitos',
    address: '',
    phone: '',
    email: '',
    reviewUrl: '',
    fixedMonthlyCost: 0,
    holidays: [],
    rooms: [{
      id: '',
      localId: `new-room-${Date.now()}`,
      name: 'Sala 1',
      aliases: [],
      capacity: 4,
      mitoboxEnabled: true,
      active: true
    }]
  });

  const openNewCenterEditor = () => setCenterEditor(createEmptyCenterEditor());
  const openCenterEditor = center => setCenterEditor(JSON.parse(JSON.stringify(center)));

  const updateCenterEditorRoom = (roomKey, changes) => {
    setCenterEditor(previous => ({
      ...previous,
      rooms: (previous.rooms || []).map(room => (room.id || room.localId) === roomKey ? { ...room, ...changes } : room)
    }));
  };

  const addCenterEditorRoom = () => {
    setCenterEditor(previous => ({
      ...previous,
      rooms: [
        ...(previous.rooms || []),
        {
          id: '',
          localId: `new-room-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: `Sala ${(previous.rooms || []).length + 1}`,
          aliases: [],
          capacity: 4,
          mitoboxEnabled: true,
          active: true
        }
      ]
    }));
  };

  const removeUnsavedCenterRoom = roomKey => {
    setCenterEditor(previous => ({
      ...previous,
      rooms: (previous.rooms || []).filter(room => (room.id || room.localId) !== roomKey)
    }));
  };

  const addHolidayToCenterEditor = dateValue => {
    if (!dateValue) return;
    setCenterEditor(previous => ({
      ...previous,
      holidays: uniqueStrings([...(previous.holidays || []), dateValue]).sort()
    }));
  };

  const saveCenterEditor = async () => {
    if (!centerEditor) return;
    const name = String(centerEditor.name || '').trim();
    if (!name) return alert('Escribe el nombre de la sede.');
    const duplicateCenter = centers.find(center => center.id !== centerEditor.id && String(center.name || '').trim().toLocaleLowerCase('es') === name.toLocaleLowerCase('es'));
    if (duplicateCenter) return alert('Ya existe otra sede con ese nombre.');
    if (centerEditor.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(centerEditor.email.trim())) return alert('El correo de la sede no tiene un formato válido.');
    if (centerEditor.reviewUrl && !/^https?:\/\//i.test(centerEditor.reviewUrl.trim())) return alert('El enlace de reseñas debe empezar por http:// o https://.');

    const roomsToSave = centerEditor.rooms || [];
    if (roomsToSave.some(room => !String(room.name || '').trim())) return alert('Todas las salas deben tener nombre.');
    const normalizedRoomNames = roomsToSave.map(room => String(room.name || '').trim().toLocaleLowerCase('es'));
    if (new Set(normalizedRoomNames).size !== normalizedRoomNames.length) return alert('No puede haber dos salas con el mismo nombre dentro de una sede.');
    if (centerEditor.status === 'active' && !roomsToSave.some(room => room.active !== false)) return alert('Una sede activa debe tener al menos una sala activa.');
    if (roomsToSave.some(room => room.active !== false && Number(room.capacity || 0) < 1)) return alert('Las salas activas deben tener un aforo físico de al menos una persona.');

    const originalCenter = centers.find(center => center.id === centerEditor.id) || null;
    const usedCenterIds = new Set(centers.filter(center => center.id !== centerEditor.id).map(center => center.id));
    let centerId = centerEditor.id || normalizeConfigId(name, 'sede');
    let centerSuffix = 2;
    const baseCenterId = centerId;
    while (usedCenterIds.has(centerId)) {
      centerId = `${baseCenterId}-${centerSuffix}`;
      centerSuffix += 1;
    }

    const usedRoomIds = new Set();
    const normalizedRooms = roomsToSave.map((room, roomIndex) => {
      const originalRoom = originalCenter?.rooms?.find(item => item.id === room.id) || null;
      const roomName = String(room.name || '').trim();
      let roomId = room.id || normalizeConfigId(roomName, `sala-${roomIndex + 1}`);
      const baseRoomId = roomId;
      let roomSuffix = 2;
      while (usedRoomIds.has(roomId)) {
        roomId = `${baseRoomId}-${roomSuffix}`;
        roomSuffix += 1;
      }
      usedRoomIds.add(roomId);
      return {
        id: roomId,
        name: roomName,
        aliases: uniqueStrings([
          ...(room.aliases || []),
          ...(originalRoom && originalRoom.name !== roomName ? [originalRoom.name] : [])
        ]),
        capacity: Number(room.capacity || 0) || 0,
        mitoboxEnabled: room.mitoboxEnabled !== false,
        active: room.active !== false
      };
    });

    const normalizedCenter = {
      id: centerId,
      name,
      aliases: uniqueStrings([
        ...(centerEditor.aliases || []),
        ...(originalCenter && originalCenter.name !== name ? [originalCenter.name] : [])
      ]),
      status: ['draft', 'active', 'inactive'].includes(centerEditor.status) ? centerEditor.status : 'draft',
      type: centerEditor.type === 'franchise' ? 'franchise' : 'owned',
      operatorId: String(centerEditor.operatorId || 'los-mitos').trim(),
      address: String(centerEditor.address || '').trim(),
      phone: String(centerEditor.phone || '').trim(),
      email: String(centerEditor.email || '').trim(),
      reviewUrl: String(centerEditor.reviewUrl || '').trim(),
      fixedMonthlyCost: Number(centerEditor.fixedMonthlyCost || 0) || 0,
      holidays: uniqueStrings(centerEditor.holidays || []).sort(),
      rooms: normalizedRooms,
      createdAt: originalCenter?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: user?.email || 'admin'
    };

    const nextCenters = originalCenter
      ? centers.map(center => center.id === originalCenter.id ? normalizedCenter : center)
      : [...centers, normalizedCenter];
    setSavingCenter(true);
    try {
      await saveGlobalSettings({ ...settings, centers: nextCenters }, `Sede ${name} guardada correctamente.`);
      setCenterEditor(null);
    } catch (error) {
      console.error(error);
      alert('No se ha podido guardar la sede. Revisa la conexión y los permisos de Firestore.');
    } finally {
      setSavingCenter(false);
    }
  };

  const updateCenterQuickField = (centerId, field, value) => {
    const nextCenters = centers.map(center => center.id === centerId ? { ...center, [field]: value } : center);
    setSettings(previous => ({ ...previous, centers: nextCenters }));
  };

  const getOwnerUidFromClassPath = (classData) => {
    if (!classData?.refPath) return '';
    const parts = classData.refPath.split('/');
    const usersIndex = parts.indexOf('users');
    return usersIndex >= 0 ? parts[usersIndex + 1] : '';
  };

  const getTargetUidForTeacher = (teacherName, classIdToIgnore = null) => {
    const cleanTeacher = getOfficialTeacherName(teacherName, cleanTeacherDisplayName(teacherName));
    const existingClass = allClasses.find(c =>
      isSameTeacher(c.teacher, cleanTeacher) &&
      c.refPath &&
      (!classIdToIgnore || c.id !== classIdToIgnore)
    );

    if (existingClass) return getOwnerUidFromClassPath(existingClass);

    const teacherEmail = getTeacherEmail(cleanTeacher);
    return teacherEmail ? teacherEmail.replace(/[@.]/g, '_') : 'admin_generated';
  };

  const openEditClassModal = (clase) => {
    if (!clase) return;
    const officialClass = allClasses.find(classData => String(classData.id) === String(clase.id) || (classData.refPath && classData.refPath === clase.refPath)) || clase;
    const existingTemporaryChange = getClassTemporaryChanges(officialClass)
      .find(change => change.until >= todayStr) || null;

    setEditClassMode('permanent');
    setEditClassModal(officialClass);
    const officialLocation = getLocationIdentity(officialClass.centerId || officialClass.sede || 'Tarragona', officialClass.roomId || officialClass.sala || 'Sala 1');
    const temporaryLocation = getLocationIdentity(existingTemporaryChange?.centerId || existingTemporaryChange?.sede || officialClass.centerId || officialClass.sede || 'Tarragona', existingTemporaryChange?.roomId || existingTemporaryChange?.sala || officialClass.roomId || officialClass.sala || 'Sala 1');
    const officialCenter = getCenterForValue(officialLocation.centerId);
    const officialRoom = findRoomByValue(officialCenter, officialLocation.roomId);
    const temporaryCenter = getCenterForValue(temporaryLocation.centerId);
    const temporaryRoom = findRoomByValue(temporaryCenter, temporaryLocation.roomId);
    setEditClassData({
      isRecurring: !isPunctualClass(officialClass),
      specificDate: officialClass.date || officialClass.specificDate || new Date().toISOString().split('T')[0],
      dayOfWeek: String(officialClass.dayOfWeek ?? '1'),
      time: officialClass.time || '17:00',
      sede: officialCenter?.name || officialClass.sede || 'Tarragona',
      sala: officialRoom?.name || officialClass.sala || 'Sala 1',
      centerId: officialClass.centerId || officialLocation.centerId,
      roomId: officialClass.roomId || officialLocation.roomId,
      teacher: getOfficialTeacherName(officialClass.teacher, ''),
      subject: officialClass.subject || '',
      capacity: officialClass.capacity ?? '',
      duration: officialClass.duration ?? 60,
      cuotaBase: officialClass.cuotaBase ?? 0,
      notes: officialClass.notes || ''
    });
    setTemporaryClassData({
      id: existingTemporaryChange?.id || '',
      from: existingTemporaryChange?.from || todayStr,
      until: existingTemporaryChange?.until || nextMonthEndStr,
      dayOfWeek: String(existingTemporaryChange?.dayOfWeek ?? officialClass.dayOfWeek ?? '1'),
      time: existingTemporaryChange?.time || officialClass.time || '17:00',
      sede: temporaryCenter?.name || existingTemporaryChange?.sede || officialClass.sede || 'Tarragona',
      sala: temporaryRoom?.name || existingTemporaryChange?.sala || officialClass.sala || 'Sala 1',
      centerId: existingTemporaryChange?.centerId || temporaryLocation.centerId,
      roomId: existingTemporaryChange?.roomId || temporaryLocation.roomId,
      teacher: getOfficialTeacherName(existingTemporaryChange?.teacher || officialClass.teacher, ''),
      duration: existingTemporaryChange?.duration ?? officialClass.duration ?? 60,
      notes: existingTemporaryChange?.notes || ''
    });
  };

  const closeEditClassModal = () => {
    setEditClassModal(null);
    setEditClassData(null);
    setEditClassMode('permanent');
    setTemporaryClassData(null);
  };

  const cancelTemporaryClassChange = async (change) => {
    if (!change?.id) return;
    if (!window.confirm(`¿Cancelar el cambio temporal de esta clase del ${formatDateSpanish(change.from)} al ${formatDateSpanish(change.until)}?\n\nLa clase conservará o recuperará su horario oficial.`)) return;
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'temporaryClassChanges', change.id), {
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: user?.email || 'admin'
      });
      if (temporaryClassData?.id === change.id) {
        setTemporaryClassData(prev => ({ ...prev, id: '' }));
      }
      alert('Cambio temporal cancelado. La clase usa de nuevo su horario oficial.');
    } catch (error) {
      alert('No se pudo cancelar el cambio temporal: ' + error.message);
    }
  };

  const handleSaveTemporaryClassChange = async () => {
    if (!editClassModal || !temporaryClassData) return;
    if (isPunctualClass(editClassModal)) return alert('Los cambios temporales están pensados para clases recurrentes. Edita directamente esta clase puntual.');

    const cleanTeacher = getOfficialTeacherName(temporaryClassData.teacher, cleanTeacherDisplayName(temporaryClassData.teacher));
    const temporaryLocation = getLocationIdentity(temporaryClassData.centerId || temporaryClassData.sede, temporaryClassData.roomId || temporaryClassData.sala);
    const payload = {
      ...temporaryClassData,
      ...temporaryLocation,
      teacher: cleanTeacher,
      dayOfWeek: Number(temporaryClassData.dayOfWeek),
      duration: Number(temporaryClassData.duration) || 60
    };

    if (!payload.from || !payload.until || !payload.time || !payload.sede || !payload.sala || !payload.teacher) {
      return alert('Completa las fechas, el profesor y todos los datos del horario temporal.');
    }
    if (payload.from > payload.until) return alert('La fecha de regreso debe ser posterior o igual a la fecha de inicio.');
    if (!dateRangeContainsWeekday(payload.from, payload.until, payload.dayOfWeek)) {
      return alert(`Entre esas fechas no hay ningún ${getDayName(payload.dayOfWeek)}. Revisa el periodo o el día temporal.`);
    }

    const overlappingOwnChange = getClassTemporaryChanges(editClassModal).find(change =>
      change.id !== payload.id &&
      doDateRangesOverlap(change.from, change.until, payload.from, payload.until)
    );
    if (overlappingOwnChange) {
      return alert(`Esta clase ya tiene otro cambio temporal entre el ${formatDateSpanish(overlappingOwnChange.from)} y el ${formatDateSpanish(overlappingOwnChange.until)}. Cancélalo o utiliza un periodo que no se solape.`);
    }

    const teacherSlots = getTeacherAvailability(cleanTeacher)?.[String(payload.dayOfWeek)] || [];
    const isCovered = teacherSlots.some(slot => isClassFullyCoveredBySlot(payload, slot));
    if (!isCovered) {
      const forceAvailability = window.confirm(`AVISO DE DISPONIBILIDAD:\n\n${cleanTeacher} no ha marcado disponibilidad completa el ${getDayName(payload.dayOfWeek)} de ${payload.time}h a ${getClassEndTime(payload.time, payload.duration)}h.\n\n¿Quieres programar el cambio temporal igualmente?`);
      if (!forceAvailability) return;
    }

    const physicalClashes = recurringClassesOnly.filter(classData => {
      if (classData.id === editClassModal.id) return false;
      if (!isSameCenter(classData.centerId || classData.sede || 'Tarragona', payload.centerId || payload.sede) || !isSameRoom(payload.centerId || payload.sede, classData.roomId || classData.sala || 'Sala 1', payload.roomId || payload.sala)) return false;

      const directOfficialClash = Number(classData.dayOfWeek) === Number(payload.dayOfWeek) &&
        dateRangeContainsWeekday(payload.from, payload.until, payload.dayOfWeek) &&
        doClassTimeRangesOverlap(classData, payload);

      const temporaryClash = getClassTemporaryChanges(classData).some(change =>
        doDateRangesOverlap(change.from, change.until, payload.from, payload.until) &&
        Number(change.dayOfWeek) === Number(payload.dayOfWeek) &&
        isSameCenter(change.centerId || change.sede || classData.centerId || classData.sede || 'Tarragona', payload.centerId || payload.sede) &&
        isSameRoom(payload.centerId || payload.sede, change.roomId || change.sala || classData.roomId || classData.sala || 'Sala 1', payload.roomId || payload.sala) &&
        doClassTimeRangesOverlap(change, payload)
      );
      return directOfficialClash || temporaryClash;
    });

    if (physicalClashes.length > 0) {
      const clash = physicalClashes[0];
      const forceRoom = window.confirm(`ADVERTENCIA DE SALA:\n\nLa ${payload.sala} de ${payload.sede} puede coincidir durante ese periodo con ${clash.subject} · ${getOfficialTeacherName(clash.teacher)} · ${getDayName(payload.dayOfWeek)} ${clash.time}h.\n\n¿Quieres guardar igualmente el cambio temporal?`);
      if (!forceRoom) return;
    }

    const teacherClashes = recurringClassesOnly.filter(classData => {
      if (classData.id === editClassModal.id) return false;
      const officialClash = isSameTeacher(classData.teacher, cleanTeacher) &&
        Number(classData.dayOfWeek) === Number(payload.dayOfWeek) &&
        doClassTimeRangesOverlap(classData, payload);
      const temporaryClash = getClassTemporaryChanges(classData).some(change =>
        doDateRangesOverlap(change.from, change.until, payload.from, payload.until) &&
        isSameTeacher(change.teacher || classData.teacher, cleanTeacher) &&
        Number(change.dayOfWeek) === Number(payload.dayOfWeek) &&
        doClassTimeRangesOverlap(change, payload)
      );
      return officialClash || temporaryClash;
    });
    if (teacherClashes.length > 0) {
      const clash = teacherClashes[0];
      const forceTeacher = window.confirm(`ADVERTENCIA DE PROFESOR:\n\n${cleanTeacher} ya tiene ${clash.subject} el ${getDayName(payload.dayOfWeek)} a las ${clash.time}h.\n\n¿Quieres guardar igualmente el cambio temporal?`);
      if (!forceTeacher) return;
    }

    const changeId = payload.id || `class-change-${editClassModal.id}-${Date.now()}`;
    const changeRef = doc(db, 'artifacts', appId, 'temporaryClassChanges', changeId);
    const officialTeacher = getOfficialTeacherName(editClassModal.teacher);
    const savedPayload = {
      classId: editClassModal.id,
      classRefPath: editClassModal.refPath || '',
      classSubject: editClassModal.subject || 'Clase',
      officialSchedule: {
        dayOfWeek: Number(editClassModal.dayOfWeek),
        time: editClassModal.time || '',
        sede: editClassModal.sede || 'Tarragona',
        sala: editClassModal.sala || 'Sala 1',
        centerId: editClassModal.centerId || getLocationIdentity(editClassModal.sede || 'Tarragona', editClassModal.sala || 'Sala 1').centerId,
        roomId: editClassModal.roomId || getLocationIdentity(editClassModal.sede || 'Tarragona', editClassModal.sala || 'Sala 1').roomId,
        teacher: officialTeacher,
        duration: Number(editClassModal.duration) || 60
      },
      from: payload.from,
      until: payload.until,
      dayOfWeek: payload.dayOfWeek,
      time: payload.time,
      sede: payload.sede,
      sala: payload.sala,
      centerId: payload.centerId,
      roomId: payload.roomId,
      teacher: cleanTeacher,
      duration: payload.duration,
      notes: payload.notes || '',
      status: 'scheduled',
      updatedAt: new Date().toISOString(),
      updatedBy: user?.email || 'admin',
      ...(!payload.id ? { createdAt: new Date().toISOString(), createdBy: user?.email || 'admin' } : {})
    };

    try {
      await setDoc(changeRef, savedPayload, { merge: true });
      closeEditClassModal();
      alert(`Cambio temporal programado del ${formatDateSpanish(payload.from)} al ${formatDateSpanish(payload.until)}. Después la clase regresará automáticamente a ${getDayName(editClassModal.dayOfWeek)} ${editClassModal.time}h. El horario oficial y la oferta web no se han modificado.`);
    } catch (error) {
      alert('No se pudo guardar el cambio temporal: ' + error.message);
    }
  };

  const handleSaveEditedClass = async () => {
    if (!editClassModal || !editClassData) return;
    if (editClassMode === 'temporary') return handleSaveTemporaryClassChange();
    if (!editClassData.teacher || !editClassData.subject || !editClassData.capacity || !editClassData.sede || !editClassData.sala) {
      return alert("El profesor, el instrumento, la sede, la sala y el aforo son obligatorios.");
    }
    if (!editClassData.isRecurring && !editClassData.specificDate) {
      return alert("Para una clase puntual, debes elegir una fecha.");
    }

    const cleanTeacher = getOfficialTeacherName(editClassData.teacher, cleanTeacherDisplayName(editClassData.teacher));
    const dayKey = editClassData.isRecurring
      ? parseInt(editClassData.dayOfWeek)
      : new Date(editClassData.specificDate).getDay();

    const classTime = editClassData.time;
    const classEndTime = getClassEndTime(classTime, editClassData.duration);
    const teacherSlots = getTeacherAvailability(cleanTeacher)?.[String(dayKey)] || [];

    const isCovered = teacherSlots.some(slot => isClassFullyCoveredBySlot(editClassData, slot));
    if (!isCovered) {
      const confirmForce = window.confirm(`AVISO DE DISPONIBILIDAD:\n\nEl profesor ${cleanTeacher} no ha marcado estar disponible el ${getDayName(dayKey)} de ${classTime}h a ${classEndTime || 'la hora de fin'}h.\n\nLa clase debe caber completa dentro de una franja de disponibilidad.\n\n¿Quieres guardar igualmente estos cambios?`);
      if (!confirmForce) return;
    }

    const collidingClasses = operationalClasses.filter(c => {
      if (c.id === editClassModal.id) return false;
      if (!isSameCenter(c.centerId || c.sede, editClassData.centerId || editClassData.sede)) return false;
      if (!isSameRoom(editClassData.centerId || editClassData.sede, c.roomId || c.sala, editClassData.roomId || editClassData.sala)) return false;
      if (!doClassTimeRangesOverlap(c, editClassData)) return false;

      if (editClassData.isRecurring) {
        if (!isPunctualClass(c) && Number(c.dayOfWeek) === Number(dayKey)) return true;
        if (isPunctualClass(c) && c.date && new Date(`${c.date}T00:00:00`).getDay() === dayKey) return true;
      } else {
        if (!isPunctualClass(c) && Number(c.dayOfWeek) === Number(dayKey)) return true;
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
    const editedLocation = getLocationIdentity(editClassData.centerId || editClassData.sede, editClassData.roomId || editClassData.sala);
    const updatedClassData = {
      ...currentClassData,
      studentIds: getClassStudentIds(currentClassData.students || []),
      isRecurring: Boolean(editClassData.isRecurring),
      specificDate: editClassData.isRecurring ? '' : editClassData.specificDate,
      dayOfWeek: dayKey,
      time: editClassData.time,
      sede: editClassData.sede,
      sala: editClassData.sala,
      centerId: editedLocation.centerId,
      roomId: editedLocation.roomId,
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

      alert(!isSameTeacher(previousTeacher, cleanTeacher)
        ? `Clase editada y trasladada de ${previousTeacher || 'Sin profesor'} a ${cleanTeacher}.`
        : "Clase editada correctamente.");
    } catch (e) {
      alert("Error al editar la clase: " + e.message);
    }
  };

  const handleCreateGlobalClass = async () => {
    if (!newClassData.teacher || !newClassData.subject || !newClassData.capacity || !newClassData.sede || !newClassData.sala) {
      return alert("El profesor, el instrumento, la sede, la sala y el aforo son obligatorios.");
    }
    if (!newClassData.isRecurring && !newClassData.specificDate) {
      return alert("Para una clase puntual, debes elegir una fecha.");
    }

    const officialTeacherName = getOfficialTeacherName(newClassData.teacher, cleanTeacherDisplayName(newClassData.teacher));
    const dayKey = newClassData.isRecurring ? parseInt(newClassData.dayOfWeek) : new Date(newClassData.specificDate).getDay();
    const classTime = newClassData.time;
    const classEndTime = getClassEndTime(classTime, newClassData.duration);
    
    // --- 1. Aviso de Disponibilidad del Profesor ---
    const teacherSlots = getTeacherAvailability(officialTeacherName)?.[dayKey.toString()] || [];
    const isCovered = teacherSlots.some(slot => isClassFullyCoveredBySlot(newClassData, slot));
    if (!isCovered) {
      const confirmForce = window.confirm(`⚠️ AVISO DE DISPONIBILIDAD:\n\nEl profesor ${officialTeacherName} NO ha marcado estar disponible el ${getDayName(dayKey)} de ${classTime}h a ${classEndTime || 'la hora de fin'}h.\n\nLa clase debe caber completa dentro de una franja de disponibilidad.\n\n¿Quieres FORZAR la creación de la clase de todos modos?`);
      if (!confirmForce) return; 
    }

    // --- 2. Aviso de Solapamiento Físico de Sala ---
    const collidingClasses = operationalClasses.filter(c => {
      if (!isSameCenter(c.centerId || c.sede, newClassData.centerId || newClassData.sede)) return false;
      if (!isSameRoom(newClassData.centerId || newClassData.sede, c.roomId || c.sala, newClassData.roomId || newClassData.sala)) return false;
      if (!doClassTimeRangesOverlap(c, newClassData)) return false;

      if (newClassData.isRecurring) {
        if (!isPunctualClass(c) && Number(c.dayOfWeek) === Number(dayKey)) return true;
        if (isPunctualClass(c) && c.date && new Date(`${c.date}T00:00:00`).getDay() === dayKey) return true; 
      } else {
        if (!isPunctualClass(c) && Number(c.dayOfWeek) === Number(dayKey)) return true;
        if (isPunctualClass(c) && c.date === newClassData.specificDate) return true;
      }
      return false;
    });

    if (collidingClasses.length > 0) {
      const clash = collidingClasses[0];
      const confirmForceRoom = window.confirm(`⚠️ ADVERTENCIA DE ESPACIO:\n\nLa ${newClassData.sala} de ${newClassData.sede} ya está ocupada ese día a las ${newClassData.time}h por la clase de ${clash.subject} de ${clash.teacher}.\n\nSabemos que a veces usáis el vestíbulo o buscáis apaños.\n¿Quieres forzar la creación de la clase en este mismo hueco de todas formas?`);
      if (!confirmForceRoom) return;
    }
    
    const teacherEmail = getTeacherEmail(officialTeacherName);
    const existingClass = allClasses.find(c => isSameTeacher(c.teacher, officialTeacherName));
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
      const newLocation = getLocationIdentity(newClassData.centerId || newClassData.sede, newClassData.roomId || newClassData.sala);

      await setDoc(doc(db, 'artifacts', appId, 'users', targetUid, 'recurringClasses', classId), {
        ...newClassData,
        ...newLocation,
        teacher: officialTeacherName,
        ...baseWebConfig,
        cuotaBase: Number(newClassData.cuotaBase) || 0, // 👈 Cuota para Informes
        id: classId,
        students: [],
        studentIds: [],
        exceptions: {},
        cancelledDates: [],
        dayOfWeek: dayKey,
        date: newClassData.isRecurring ? null : newClassData.specificDate
      });
      alert(`✅ Clase ${newClassData.isRecurring ? 'RECURRENTE' : 'PUNTUAL'} de ${newClassData.subject} asignada a ${officialTeacherName} correctamente.`);

      setCreateClassModal(false);
      const defaultCenter = activeCenters[0];
      const defaultRoom = (defaultCenter?.rooms || []).find(room => room.active !== false);
      setNewClassData({ isRecurring: true, specificDate: new Date().toISOString().split('T')[0], dayOfWeek: '1', time: '17:00', sede: defaultCenter?.name || 'Tarragona', sala: defaultRoom?.name || 'Sala 1', centerId: defaultCenter?.id || 'tarragona', roomId: defaultRoom?.id || 'sala-1', teacher: '', subject: '', capacity: '', duration: 60, cuotaBase: 60, notes: '' });
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
    if (gestion.type === 'falta_reiterada' || gestion.keepUntilAdminAcknowledges) return false;
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
  const readyPendingGestiones = pendingGestiones.filter(isGestionReadyForExecution);
  const blockedByTadosiGestiones = pendingGestiones.filter(g => !isGestionReadyForExecution(g));
  const totalPendingInbox = pendingGestiones.length + pendingTeacherPanelTasks.length + scheduledGestionesProgramadas.length;
  const unreadWorkshopRegistrations = workshopRegistrations.filter(registration => !registration.adminSeenAt);
  const totalInboxNotifications = totalPendingInbox + unreadWorkshopRegistrations.length;

  const gestionPendingFilters = [
    { id: 'todas', label: 'Todas gestiones', matcher: () => true },
    { id: 'tadosi_pendiente', label: 'Pend. Tadosi', matcher: (g) => gestionRequiresTadosi(g) && !isGestionTadosiDone(g) },
    { id: 'tadosi_hecho', label: 'Tadosi hecho', matcher: (g) => gestionRequiresTadosi(g) && isGestionTadosiDone(g) },
    { id: 'mantenimiento', label: 'Mantenimiento', matcher: (g) => ['mantenimiento', 'reactivar_plaza'].includes(g.type) },
    { id: 'extras', label: 'Extras', matcher: (g) => isExtraServiceGestion(g) },
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
      g.studentName, g.studentEmail, g.title, g.details, g.sourceClassLine, g.requestedClassLine, g.extraServiceName, g.serviceName, g.extraService, getGestionTypeLabel(g.type), studentInfo?.name, studentInfo?.alias, studentInfo?.email
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

  const matchesWorkshopRegistrationSearch = (registration = {}) => {
    if (!gestionSearchNeedle) return true;
    const haystack = normalizeSearchText([
      registration.studentName,
      registration.studentEmail,
      registration.workshopTitle,
      registration.workshopId,
      WORKSHOP_REGISTRATION_STATUS_LABELS[registration.status],
      ...(Array.isArray(registration.answers) ? registration.answers.flatMap(answer => [answer.question, answer.answer]) : [])
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
  const filteredWorkshopRegistrations = workshopRegistrations.filter(matchesWorkshopRegistrationSearch);
  const filteredResolvedGestiones = resolvedGestiones.filter(matchesGestionSearch);
  const visibleResolvedGestiones = filteredResolvedGestiones.slice(0, resolvedGestionesVisible);
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
    const grouped = new Map();
    globalClassesForReferenceDate.forEach(classData => {
      const teacherName = getOfficialTeacherName(classData.teacher);
      const teacherKey = normalizeTeacherKey(teacherName) || 'sin-asignar';
      if (!grouped.has(teacherKey)) grouped.set(teacherKey, { teacherName, classes: [] });
      grouped.get(teacherKey).classes.push({ ...classData, teacher: teacherName });
    });
    return Object.fromEntries([...grouped.values()]
      .sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'es'))
      .map(group => [group.teacherName, group.classes.sort((a, b) => Number(a.dayOfWeek) - Number(b.dayOfWeek) || String(a.time || '').localeCompare(String(b.time || '')))]));
  }, [globalClassesForReferenceDate, officialTeacherNameMap]);

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

  const buildArchitectStudentPlanningRow = (studentEntry = {}, clase = {}, projected = false, referenceDate = todayStr, extra = {}) => {
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
    const displayName = studentEntry.name || studentEntry.studentName || studentInfo?.alias || studentInfo?.name || 'Alumno';
    const email = studentInfo?.email || studentEntry.email || studentEntry.studentEmail || 'sin email';

    return {
      id: studentEntry.id,
      displayName,
      email,
      status: projectedStatus,
      isMaintenance,
      isFutureStart,
      isRelocated,
      relocationLabel: studentEntry.relocationLabel || '',
      startDate,
      endDate,
      isPastEnd,
      ...extra,
      isActive: projectedStatus !== 'baja' && !isPastEnd && !isMaintenance && !isFutureStart && !extra.isRelocatedOut
    };
  };

  const getClassStudentPlanningData = (clase, projected = false, referenceDateOverride = '') => {
    const referenceDate = getArchitectReferenceDate(projected, referenceDateOverride);

    return getPlanningStudentsForClass(clase, projected, referenceDateOverride)
      .filter(isArchitectPlanningStudent)
      .map(studentEntry => buildArchitectStudentPlanningRow(studentEntry, clase, projected, referenceDate));
  };

  const getGestionClassReferenceIds = (gestion = {}) => [
    gestion.classId,
    gestion.sourceClassId,
    gestion.originClassId,
    gestion.requestedClass,
    gestion.targetClassId,
    gestion.recurringClassId,
    gestion.classDocId
  ].map(value => String(value || '').trim()).filter(Boolean);

  const doesAbsenceGestionMatchClass = (gestion = {}, clase = {}) => {
    const classIds = getGestionClassReferenceIds(gestion);
    if (classIds.length > 0) return classIds.includes(String(clase.id || ''));

    const classLineText = String([
      gestion.classLine,
      gestion.sourceClassLine,
      gestion.requestedClassLine,
      gestion.targetClassLine,
      gestion.details,
      gestion.title
    ].filter(Boolean).join(' ')).toLowerCase();

    if (!classLineText.trim()) return true;
    const classHints = [
      clase.subject,
      clase.teacher,
      clase.sede,
      clase.sala,
      clase.time,
      getDayName(clase.dayOfWeek)
    ].filter(Boolean).map(value => String(value).toLowerCase());

    return classHints.some(hint => hint && classLineText.includes(hint));
  };

  const getStudentAbsenceGestionForClassDate = (studentId, clase = {}, referenceDate = todayStr) => {
    if (!studentId || !referenceDate) return null;

    return gestiones.find(gestion => {
      if (!isAbsenceGestion(gestion)) return false;
      if (!['pendiente', 'completado', 'archivado'].includes(gestion.status || 'pendiente')) return false;

      const gestionStudentId = String(gestion.studentId || '').trim();
      if (!gestionStudentId || gestionStudentId !== String(studentId)) return false;

      const absenceDate = getAbsenceGestionDate(gestion);
      if (absenceDate !== referenceDate) return false;

      return doesAbsenceGestionMatchClass(gestion, clase);
    }) || null;
  };

  const getClassStudentModalData = (clase, projected = false, referenceDateOverride = '') => {
    const referenceDate = getArchitectReferenceDate(projected, referenceDateOverride);
    const activeRelocations = temporaryRelocations.filter(rel => isTemporaryRelocationActiveForDate(rel, referenceDate));
    const relocatedOutByStudentId = new Map(
      activeRelocations
        .filter(rel => rel.sourceClassId === clase.id)
        .map(rel => [rel.studentId, rel])
    );

    const baseStudents = (clase.students || [])
      .filter(isArchitectPlanningStudent)
      .filter(studentEntry => {
        const studentInfo = students.find(student => student.id === studentEntry.id) || {};
        return !hasStudentClassEndedBeforeDate(studentEntry, studentInfo, referenceDate);
      })
      .map(studentEntry => {
        const relocationOut = relocatedOutByStudentId.get(studentEntry.id) || null;
        const absenceGestion = getStudentAbsenceGestionForClassDate(studentEntry.id, clase, referenceDate);
        return buildArchitectStudentPlanningRow(studentEntry, clase, projected, referenceDate, {
          isRelocatedOut: Boolean(relocationOut),
          relocationOutLabel: relocationOut
            ? `Fuera temporalmente · ${formatDateSpanish(relocationOut.from)} - ${formatDateSpanish(relocationOut.until)}`
            : '',
          relocationOutTargetLine: relocationOut?.targetClassLine || '',
          absenceAnnounced: Boolean(absenceGestion),
          absenceGestionId: absenceGestion?.id || ''
        });
      });

    const relocatedInStudents = activeRelocations
      .filter(rel => rel.targetClassId === clase.id)
      .filter(rel => !baseStudents.some(student => student.id === rel.studentId && !student.isRelocatedOut))
      .map(rel => {
        const studentInfo = students.find(student => student.id === rel.studentId) || {};
        const displayName = studentInfo?.useAlias && studentInfo?.alias
          ? studentInfo.alias
          : (studentInfo?.name || rel.studentName || 'Alumno');
        const studentEntry = {
          id: rel.studentId,
          name: displayName,
          email: studentInfo?.email || rel.studentEmail || '',
          classStartDate: studentInfo?.classStartDate || '',
          isPaused: false,
          status: 'present',
          isRecovery: false,
          isTemporaryRelocation: true,
          temporaryRelocationId: rel.id,
          relocationLabel: `Recolocado temporalmente aquí · ${formatDateSpanish(rel.from)} - ${formatDateSpanish(rel.until)}`,
          sourceClassId: rel.sourceClassId,
          sourceClassLine: rel.sourceClassLine || ''
        };
        const absenceGestion = getStudentAbsenceGestionForClassDate(rel.studentId, clase, referenceDate);
        return buildArchitectStudentPlanningRow(studentEntry, clase, projected, referenceDate, {
          isRelocatedOut: false,
          relocationOutLabel: '',
          relocationOutTargetLine: '',
          absenceAnnounced: Boolean(absenceGestion),
          absenceGestionId: absenceGestion?.id || ''
        });
      });

    return [...baseStudents, ...relocatedInStudents]
      .filter(student => student.status !== 'baja' || !student.isPastEnd)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'es'));
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
    const effectiveDate = archDate || todayStr;
    const byId = new Map((baseClasses || []).map(clase => {
      const effectiveClass = isPunctualClass(clase) ? clase : getEffectiveClassForDate(clase, effectiveDate);
      return [effectiveClass.id, effectiveClass];
    }));

    punctualClassesForArchitectDate.forEach(clase => {
      byId.set(clase.id, clase);
    });

    return [...byId.values()];
  }, [archProjectionMode, projectedPlanningClasses, recurringClassesOnly, punctualClassesForArchitectDate, temporaryClassChanges, archDate, todayStr, officialTeacherNameMap]);

  const architectScheduleHours = useMemo(() => {
    const selectedDate = archDate || todayStr;
    const classTimesForSelectedDate = architectClasses
      .filter(classData => {
        const isClassForSelectedDate = isPunctualClass(classData)
          ? classData.date === selectedDate
          : Number(classData.dayOfWeek) === Number(architectSelectedDay);
        return isSameCenter(classData.centerId || classData.sede || 'Tarragona', archSede) && isClassForSelectedDate;
      })
      .map(classData => classData.time)
      .filter(Boolean);

    return [...new Set([...SCHEDULE_HOURS, ...classTimesForSelectedDate])]
      .sort((a, b) => (parseTimeToMinutes(a) ?? Number.MAX_SAFE_INTEGER) - (parseTimeToMinutes(b) ?? Number.MAX_SAFE_INTEGER));
  }, [architectClasses, architectSelectedDay, archDate, archSede, todayStr]);

  const architectRooms = useMemo(() => getRoomNamesForCenter(archSede), [centers, archSede]);

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
    const thisMonthVacationDates = (settings.vacaciones || []).filter(date => String(date || '').startsWith(targetMonth));
    const payroll = {};
    const studentById = new Map(students.map(student => [student.id, student]));

    const normalizeTeacherKey = (name) => String(name || 'Desconocido')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase('es-ES');

    const officialTeacherNames = new Map();
    (settings.teachersList || []).forEach(name => {
      const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
      if (!cleanName) return;
      const teacherKey = normalizeTeacherKey(cleanName);
      if (!officialTeacherNames.has(teacherKey)) officialTeacherNames.set(teacherKey, cleanName);
    });
    recurringClassesOnly.forEach(classData => {
      const cleanName = String(classData.teacher || '').trim().replace(/\s+/g, ' ');
      if (!cleanName) return;
      const teacherKey = normalizeTeacherKey(cleanName);
      if (!officialTeacherNames.has(teacherKey)) officialTeacherNames.set(teacherKey, cleanName);
    });
    const configuredTeacherKeys = new Set((settings.teachersList || [])
      .map(normalizeTeacherKey)
      .filter(Boolean));

    const ensureTeacher = (name) => {
      const cleanName = String(name || 'Desconocido').trim().replace(/\s+/g, ' ') || 'Desconocido';
      const teacherKey = normalizeTeacherKey(cleanName);
      if (!officialTeacherNames.has(teacherKey)) officialTeacherNames.set(teacherKey, cleanName);
      if (!payroll[teacherKey]) payroll[teacherKey] = {
        name: officialTeacherNames.get(teacherKey),
        realHours: 0,
        vacationHours: 0,
        adjustmentHours: 0,
        adjustments: []
      };
      return teacherKey;
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

    thisMonthVacationDates.forEach(vacationDate => {
      const vacationDay = getLocalDayOfWeek(vacationDate);
      if (vacationDay === null) return;

      recurringClassesOnly.forEach(classData => {
        if (Number(classData.dayOfWeek) !== vacationDay || !classData.teacher) return;

        const hasActiveStudentThatDate = (classData.students || []).some(studentEntry => {
          const studentInfo = studentById.get(studentEntry.id) || {};
          if (!isFixedClassStudent(studentEntry) || studentInfo.globalStatus === 'baja') return false;
          if (!isStudentClassActiveOnDate(studentEntry, studentInfo, vacationDate)) return false;
          if (isStudentInMaintenance(studentEntry.id, vacationDate)) return false;
          return !getActiveStudentTemporaryRelocations(studentEntry.id, vacationDate)
            .some(relocation => relocation.sourceClassId === classData.id);
        });

        if (!hasActiveStudentThatDate) return;
        const tName = ensureTeacher(classData.teacher);
        const duration = Number(String(classData.duration || 60).replace(',', '.')) || 60;
        payroll[tName].vacationHours += (duration / 60);
      });
    });

    return Object.entries(payroll).map(([teacherKey, data]) => {
      const totalHours = data.realHours + data.vacationHours + data.adjustmentHours;
      return {
        name: data.name,
        teacherKey,
        realHours: data.realHours,
        vacationHours: data.vacationHours,
        adjustmentHours: data.adjustmentHours,
        totalHours,
        adjustments: data.adjustments,
        earnings: (totalHours * (settings.hourlyRate || 17.33)).toFixed(2)
      };
    }).filter(t => t.realHours !== 0 || t.vacationHours !== 0 || t.adjustmentHours !== 0 || configuredTeacherKeys.has(t.teacherKey))
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [allRecords, payrollAdjustments, settings.hourlyRate, settings.teachersList, settings.vacaciones, selectedPayrollMonth, recurringClassesOnly, students, maintenancePeriods, temporaryRelocations]);

  const copyPayrollReport = async () => {
    if (teachersPayroll.length === 0) {
      alert('No hay profesores ni horas para copiar en este mes.');
      return;
    }

    const [year, month] = String(selectedPayrollMonth || '').split('-').map(Number);
    const monthLabel = Number.isFinite(year) && Number.isFinite(month)
      ? new Date(year, month - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase()
      : selectedPayrollMonth;
    const formatHours = value => Number(value || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatSalary = value => Number(String(value || 0).replace(',', '.')).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const blocks = teachersPayroll.map(teacher => [
      `Profesor/a: ${teacher.name}`,
      `Horas totales liquidables: ${formatHours(teacher.totalHours)} h`,
      ...(teacher.vacationHours > 0 ? [`Horas de vacaciones (incluidas en el total): ${formatHours(teacher.vacationHours)} h`] : []),
      `Salario: ${formatSalary(teacher.earnings)} €`
    ].join('\n'));
    const textToCopy = `INFORME DE HORAS Y NÓMINAS · ${monthLabel}\n\n${blocks.join('\n\n')}`;

    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API no disponible');
      await navigator.clipboard.writeText(textToCopy);
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (!copied) {
        alert('El navegador no ha permitido copiar el informe. Revisa los permisos del portapapeles.');
        return;
      }
    }

    alert(`Informe de ${teachersPayroll.length} profesor(es) copiado al portapapeles.`);
  };

  const getEvaluationTeacherName = (evaluation = {}) => String(
    evaluation.teacherName || evaluation.teacher || evaluation.teacherDisplayName || evaluation.profesor || 'Sin profesor'
  ).trim() || 'Sin profesor';

  const getEvaluationRatings = (evaluation = {}) => evaluation.ratings || evaluation.scores || {};

  const getEvaluationOverallAverage = (evaluation = {}) => {
    const storedAverage = Number(evaluation.averageRating ?? evaluation.averageScore ?? evaluation.average ?? evaluation.globalAverage ?? evaluation.avg);
    if (Number.isFinite(storedAverage) && storedAverage >= 1 && storedAverage <= 5) return storedAverage;

    const ratings = getEvaluationRatings(evaluation);
    const valuesFromKnownQuestions = TEACHER_EVALUATION_QUESTIONS
      .map(question => normalizeEvaluationRating(ratings?.[question.key]))
      .filter(value => value !== null);

    if (valuesFromKnownQuestions.length > 0) return averageNumbers(valuesFromKnownQuestions);

    return averageNumbers(Object.values(ratings || {})
      .map(normalizeEvaluationRating)
      .filter(value => value !== null));
  };

  const getEvaluationPeriodValue = (evaluation = {}) => String(
    evaluation.period || evaluation.quarter || evaluation.trimester || evaluation.month || ''
  ).trim();

  const getEvaluationCreatedDate = (evaluation = {}) => {
    const rawDate = evaluation.createdAt || evaluation.date || evaluation.submittedAt || '';
    if (!rawDate) return '';
    const parsedDate = new Date(rawDate);
    if (Number.isNaN(parsedDate.getTime())) return String(rawDate).slice(0, 10);
    return parsedDate.toLocaleDateString('es-ES');
  };

  const getEvaluationClassLine = (evaluation = {}) => {
    if (evaluation.classLine) return evaluation.classLine;
    const parts = [];
    if (evaluation.subject) parts.push(evaluation.subject);
    if (evaluation.dayOfWeek !== undefined && evaluation.dayOfWeek !== null && evaluation.dayOfWeek !== '') parts.push(getDayName(Number(evaluation.dayOfWeek)));
    if (evaluation.time) parts.push(`${evaluation.time}h`);
    if (evaluation.sede) parts.push(evaluation.sede);
    return parts.join(' · ');
  };

  const getEvaluationComments = (evaluation = {}) => {
    const comments = evaluation.comments || {};
    return {
      positive: String(comments.positive || comments.best || evaluation.positiveComment || evaluation.bestComment || '').trim(),
      improvement: String(comments.improvement || comments.suggestions || evaluation.improvementComment || evaluation.suggestions || '').trim(),
      privateNote: String(comments.privateNote || comments.private || evaluation.privateNote || '').trim()
    };
  };

  const hasLowEvaluationSignal = (evaluation = {}) => {
    const average = getEvaluationOverallAverage(evaluation);
    if (Number.isFinite(average) && average < 3.5) return true;
    const ratings = getEvaluationRatings(evaluation);
    return TEACHER_EVALUATION_QUESTIONS.some(question => {
      const value = normalizeEvaluationRating(ratings?.[question.key]);
      return value !== null && value <= 2;
    });
  };

  const teacherEvaluationPeriods = useMemo(() => {
    const byPeriod = new Map();
    teacherEvaluations.forEach(evaluation => {
      const value = getEvaluationPeriodValue(evaluation);
      if (!value) return;
      byPeriod.set(value, value);
    });
    return [...byPeriod.keys()].sort((a, b) => b.localeCompare(a));
  }, [teacherEvaluations]);

  const allTeacherNamesForPanel = useMemo(() => {
    const names = new Map();
    [
      ...(settings.teachersList || []),
      ...recurringClassesOnly.map(c => c.teacher),
      ...teacherEvaluations.map(getEvaluationTeacherName)
    ].filter(Boolean).forEach(name => {
      const officialName = getOfficialTeacherName(name);
      names.set(normalizeTeacherKey(officialName), officialName);
    });
    return [...names.values()].sort((a, b) => a.localeCompare(b, 'es'));
  }, [settings.teachersList, recurringClassesOnly, teacherEvaluations, officialTeacherNameMap]);

  const filteredTeacherEvaluations = useMemo(() => {
    return teacherEvaluations.filter(evaluation => (
      teacherEvaluationPeriod === 'all' || getEvaluationPeriodValue(evaluation) === teacherEvaluationPeriod
    ));
  }, [teacherEvaluations, teacherEvaluationPeriod]);

  const teacherEvaluationStats = useMemo(() => {
    const grouped = new Map();

    const ensureTeacherGroup = (teacherName) => {
      const cleanName = getOfficialTeacherName(teacherName, 'Sin profesor');
      const teacherKey = normalizeTeacherKey(cleanName) || 'sin-profesor';
      if (!grouped.has(teacherKey)) {
        grouped.set(teacherKey, {
          name: cleanName,
          evaluations: []
        });
      }
      return grouped.get(teacherKey);
    };

    allTeacherNamesForPanel.forEach(ensureTeacherGroup);

    filteredTeacherEvaluations.forEach(evaluation => {
      ensureTeacherGroup(getEvaluationTeacherName(evaluation)).evaluations.push(evaluation);
    });

    return [...grouped.values()].map(group => {
      const overallValues = group.evaluations
        .map(getEvaluationOverallAverage)
        .filter(value => Number.isFinite(value));

      const questionAverages = TEACHER_EVALUATION_QUESTIONS.reduce((acc, question) => {
        const values = group.evaluations
          .map(evaluation => normalizeEvaluationRating(getEvaluationRatings(evaluation)?.[question.key]))
          .filter(value => value !== null);
        acc[question.key] = averageNumbers(values);
        return acc;
      }, {});

      const comments = group.evaluations.flatMap(evaluation => {
        const commentData = getEvaluationComments(evaluation);
        const classLine = getEvaluationClassLine(evaluation);
        const base = {
          id: evaluation.id,
          studentName: evaluation.studentName || evaluation.student || 'Alumno',
          classLine,
          date: getEvaluationCreatedDate(evaluation),
          average: getEvaluationOverallAverage(evaluation)
        };
        const items = [];
        if (commentData.positive) items.push({ ...base, type: 'Valorado', text: commentData.positive });
        if (commentData.improvement) items.push({ ...base, type: 'Mejora', text: commentData.improvement });
        if (commentData.privateNote) items.push({ ...base, type: 'Privado', text: commentData.privateNote });
        return items;
      });

      const lowSignalCount = group.evaluations.filter(hasLowEvaluationSignal).length;
      const teacherClasses = recurringClassesOnly.filter(c => isSameTeacher(c.teacher, group.name));
      const activeClassCount = teacherClasses.length;
      const activeStudentIds = new Set();
      teacherClasses.forEach(clase => {
        (clase.students || []).forEach(studentEntry => {
          const studentInfo = students.find(student => student.id === studentEntry.id) || {};
          if (studentInfo?.globalStatus === 'baja') return;
          if (!isFixedClassStudent(studentEntry)) return;
          if (!isStudentClassCommittedOnDate(studentEntry, studentInfo, todayStr)) return;
          activeStudentIds.add(studentEntry.id);
        });
      });

      return {
        ...group,
        responseCount: group.evaluations.length,
        average: averageNumbers(overallValues),
        questionAverages,
        comments,
        lowSignalCount,
        activeClassCount,
        activeStudentCount: activeStudentIds.size
      };
    }).sort((a, b) => {
      if (b.responseCount !== a.responseCount) return b.responseCount - a.responseCount;
      return String(a.name || '').localeCompare(String(b.name || ''), 'es');
    });
  }, [filteredTeacherEvaluations, allTeacherNamesForPanel, recurringClassesOnly, students, todayStr]);

  const teacherEvaluationGlobalStats = useMemo(() => {
    const overallValues = filteredTeacherEvaluations
      .map(getEvaluationOverallAverage)
      .filter(value => Number.isFinite(value));

    const questionAverages = TEACHER_EVALUATION_QUESTIONS.reduce((acc, question) => {
      const values = filteredTeacherEvaluations
        .map(evaluation => normalizeEvaluationRating(getEvaluationRatings(evaluation)?.[question.key]))
        .filter(value => value !== null);
      acc[question.key] = averageNumbers(values);
      return acc;
    }, {});

    return {
      responses: filteredTeacherEvaluations.length,
      average: averageNumbers(overallValues),
      teachersWithResponses: teacherEvaluationStats.filter(stat => stat.responseCount > 0).length,
      lowSignalCount: filteredTeacherEvaluations.filter(hasLowEvaluationSignal).length,
      questionAverages
    };
  }, [filteredTeacherEvaluations, teacherEvaluationStats]);

  const teacherAvailabilityPanel = useMemo(() => {
    const teacherName = getOfficialTeacherName(selectedAvailabilityTeacher, '');
    if (!teacherName) return { rows: [], outsideRows: [], summary: { offeredHours: 0, activeClasses: 0, inactiveClasses: 0, freeHours: 0 } };

    const declared = getTeacherAvailability(teacherName);
    const segmentMap = new Map();
    let offeredMinutes = 0;

    [1, 2, 3, 4, 5, 6].forEach(day => {
      (declared[String(day)] || []).forEach((slot, slotIndex) => {
        const slotStart = parseTimeToMinutes(slot.start);
        const slotEnd = parseTimeToMinutes(slot.end);
        if (slotStart === null || slotEnd === null || slotEnd <= slotStart) return;
        offeredMinutes += slotEnd - slotStart;
        for (let cursor = slotStart; cursor < slotEnd; cursor += 60) {
          const segmentEnd = Math.min(cursor + 60, slotEnd);
          const key = `${day}-${cursor}-${segmentEnd}`;
          if (!segmentMap.has(key)) {
            segmentMap.set(key, {
              dayOfWeek: day,
              time: formatMinutesToTime(cursor),
              endTime: formatMinutesToTime(segmentEnd),
              duration: segmentEnd - cursor,
              sourceSlotIndex: slotIndex
            });
          }
        }
      });
    });

    const segments = [...segmentMap.values()].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.time.localeCompare(b.time));
    offeredMinutes = segments.reduce((sum, segment) => sum + segment.duration, 0);
    const rows = [];
    const distinctActiveClasses = new Set();
    const distinctInactiveClasses = new Set();
    let freeMinutes = 0;

    segments.forEach(segment => {
      const segmentRange = { time: segment.time, duration: segment.duration };
      const entries = [];

      recurringClassesOnly
        .filter(classData => isSameTeacher(classData.teacher, teacherName) && Number(classData.dayOfWeek) === segment.dayOfWeek && doClassTimeRangesOverlap(classData, segmentRange))
        .forEach(classData => {
          const activeChange = getActiveClassTemporaryChange(classData, todayStr);
          const effectiveClass = activeChange ? getEffectiveClassForDate(classData, todayStr) : classData;
          const movedToAnotherSlot = Boolean(activeChange) && (
            Number(effectiveClass.dayOfWeek) !== Number(classData.dayOfWeek) ||
            effectiveClass.time !== classData.time ||
            !isSameTeacher(effectiveClass.teacher, classData.teacher)
          );
          const activeCount = getActiveClassStudentCount(classData, false);
          const status = movedToAnotherSlot ? 'reserved' : activeCount > 0 ? (activeChange ? 'temporary_active' : 'active') : (activeChange ? 'temporary_inactive' : 'inactive');
          const displayClass = activeChange && !movedToAnotherSlot ? effectiveClass : classData;
          entries.push({
            ...segment,
            key: `official-${classData.id}-${segment.dayOfWeek}-${segment.time}`,
            status,
            classData: displayClass,
            officialClass: classData,
            activeCount,
            temporaryChange: activeChange,
            detail: movedToAnotherSlot ? `Reservada hasta el regreso · ahora ${getDayName(effectiveClass.dayOfWeek)} ${effectiveClass.time}h` : ''
          });
          if (status === 'active' || status === 'temporary_active') distinctActiveClasses.add(classData.id);
          else distinctInactiveClasses.add(classData.id);
        });

      effectiveOperationalClasses
        .filter(classData => classData.temporaryClassChange && isSameTeacher(classData.teacher, teacherName) && Number(classData.dayOfWeek) === segment.dayOfWeek && doClassTimeRangesOverlap(classData, segmentRange))
        .filter(classData => !entries.some(entry => entry.officialClass.id === classData.id && entry.status !== 'reserved'))
        .forEach(classData => {
          const officialClass = recurringClassesOnly.find(item => item.id === classData.id) || classData;
          const activeCount = getActiveClassStudentCount(officialClass, false);
          entries.push({
            ...segment,
            key: `temporary-${classData.id}-${segment.dayOfWeek}-${segment.time}`,
            status: activeCount > 0 ? 'temporary_active' : 'temporary_inactive',
            classData,
            officialClass,
            activeCount,
            temporaryChange: classData.temporaryClassChange,
            detail: `Temporal hasta ${formatDateSpanish(classData.temporaryClassChange.until)}`
          });
          if (activeCount > 0) distinctActiveClasses.add(classData.id);
          else distinctInactiveClasses.add(classData.id);
        });

      if (entries.length === 0) {
        freeMinutes += segment.duration;
        rows.push({ ...segment, key: `free-${segment.dayOfWeek}-${segment.time}`, status: 'free', classData: null, activeCount: 0, detail: '' });
      } else {
        rows.push(...entries);
      }
    });

    const scheduleRoles = [];
    recurringClassesOnly.filter(classData => isSameTeacher(classData.teacher, teacherName)).forEach(classData => {
      scheduleRoles.push({ classData, officialClass: classData, role: 'official' });
    });
    effectiveOperationalClasses
      .filter(classData => classData.temporaryClassChange && isSameTeacher(classData.teacher, teacherName))
      .filter(classData => {
        const officialClass = recurringClassesOnly.find(item => item.id === classData.id);
        return !officialClass || !isSameTeacher(officialClass.teacher, teacherName) || Number(officialClass.dayOfWeek) !== Number(classData.dayOfWeek) || officialClass.time !== classData.time;
      })
      .forEach(classData => scheduleRoles.push({ classData, officialClass: recurringClassesOnly.find(item => item.id === classData.id) || classData, role: 'temporary' }));

    const outsideRows = scheduleRoles
      .filter((role, index, list) => list.findIndex(item => item.role === role.role && item.classData.id === role.classData.id) === index)
      .filter(role => !(declared[String(role.classData.dayOfWeek)] || []).some(slot => isClassFullyCoveredBySlot(role.classData, slot)))
      .map(role => {
        const activeCount = getActiveClassStudentCount(role.officialClass, false);
        return {
          ...role,
          key: `outside-${role.role}-${role.classData.id}`,
          status: role.role === 'temporary' ? (activeCount > 0 ? 'temporary_active' : 'temporary_inactive') : (activeCount > 0 ? 'active' : 'inactive'),
          activeCount
        };
      })
      .sort((a, b) => Number(a.classData.dayOfWeek) - Number(b.classData.dayOfWeek) || String(a.classData.time || '').localeCompare(String(b.classData.time || '')));

    return {
      rows,
      outsideRows,
      summary: {
        offeredHours: offeredMinutes / 60,
        activeClasses: distinctActiveClasses.size,
        inactiveClasses: distinctInactiveClasses.size,
        freeHours: freeMinutes / 60
      }
    };
  }, [selectedAvailabilityTeacher, availabilities, recurringClassesOnly, effectiveOperationalClasses, temporaryClassChanges, students, maintenancePeriods, temporaryRelocations, todayStr, officialTeacherNameMap]);

  const openCreateClassFromAvailability = (row) => {
    setNewClassData(prev => ({
      ...prev,
      isRecurring: true,
      dayOfWeek: String(row.dayOfWeek),
      time: row.time,
      duration: Number(row.duration) || 60,
      teacher: getOfficialTeacherName(selectedAvailabilityTeacher, selectedAvailabilityTeacher)
    }));
    setCreateClassModal(true);
  };

  const handleDownloadTeacherEvaluationReport = () => {
    if (filteredTeacherEvaluations.length === 0) {
      alert('No hay evaluaciones docentes para exportar con el filtro actual.');
      return;
    }

    const valueOrDash = (value) => {
      const clean = String(value ?? '').trim();
      return clean || '—';
    };

    const sortedEvaluations = [...filteredTeacherEvaluations].sort((a, b) => {
      const teacherCompare = getEvaluationTeacherName(a).localeCompare(getEvaluationTeacherName(b), 'es');
      if (teacherCompare !== 0) return teacherCompare;
      return new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0);
    });

    const generatedAt = new Date().toLocaleString('es-ES');
    const selectedPeriodLabel = teacherEvaluationPeriod === 'all' ? 'Todos los periodos' : teacherEvaluationPeriod;
    const lines = [
      'EVALUACIONES DOCENTES · ESCUELA LOS MITOS',
      `Generado: ${generatedAt}`,
      `Filtro aplicado: ${selectedPeriodLabel}`,
      `Total evaluaciones exportadas: ${sortedEvaluations.length}`,
      '',
      'Este archivo es una copia legible de cada evaluación recibida con el filtro actual.',
      'Incluye puntuaciones, datos de contexto y comentarios escritos.',
      ''
    ];

    sortedEvaluations.forEach((evaluation, index) => {
      const ratings = getEvaluationRatings(evaluation);
      const comments = getEvaluationComments(evaluation);
      const average = getEvaluationOverallAverage(evaluation);
      const rawDate = evaluation.createdAt || evaluation.date || evaluation.submittedAt || '';

      lines.push(
        '============================================================',
        `EVALUACIÓN ${index + 1}`,
        '------------------------------------------------------------',
        `ID: ${valueOrDash(evaluation.id)}`,
        `Fecha visible: ${valueOrDash(getEvaluationCreatedDate(evaluation))}`,
        `Fecha original: ${valueOrDash(rawDate)}`,
        `Periodo: ${valueOrDash(getEvaluationPeriodValue(evaluation))}`,
        `Profesor: ${valueOrDash(getEvaluationTeacherName(evaluation))}`,
        `Alumno: ${valueOrDash(evaluation.studentName || evaluation.student || '')}`,
        `Email alumno: ${valueOrDash(evaluation.studentEmail || evaluation.email || '')}`,
        `Clase: ${valueOrDash(getEvaluationClassLine(evaluation))}`,
        `Sede: ${valueOrDash(evaluation.sede || '')}`,
        `Instrumento: ${valueOrDash(evaluation.subject || '')}`,
        `Media: ${formatAverageScore(average)} / 5`,
        '',
        'PUNTUACIONES',
        ...TEACHER_EVALUATION_QUESTIONS.map(question => `- ${question.label} ${valueOrDash(ratings?.[question.key])} / 5`),
        '',
        'COMENTARIOS',
        `Lo que más valora de sus clases:
${valueOrDash(comments.positive)}`,
        '',
        `Qué cree que podría mejorar / sugerencias para coordinación:
${valueOrDash(comments.improvement)}`,
        '',
        `Nota privada para coordinación:
${valueOrDash(comments.privateNote)}`,
        ''
      );
    });

    const periodLabel = teacherEvaluationPeriod === 'all' ? 'todas' : teacherEvaluationPeriod.replace(/[^a-zA-Z0-9_-]/g, '-');
    downloadTextFile(`Evaluaciones_Docentes_${periodLabel}_${getTodayLocalString()}.txt`, lines.join('\n'), 'text/plain;charset=utf-8');
  };

  const availableMboxSlotsAdmin = useMemo(() => {
    let slots = [];
    if (mboxAdminDate && mboxAdminSede) {
      const targetDay = new Date(`${mboxAdminDate}T00:00:00`).getDay();
      const allScheduledClasses = allClasses.filter(c => {
         if (c.date && c.date !== mboxAdminDate) return false;
         if (!c.date && c.dayOfWeek !== targetDay) return false;
         return isSameCenter(c.centerId || c.sede || 'Tarragona', mboxAdminSede);
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
        const center = getCenterForValue(mboxAdminSede);
        const occupiedSalas = aliveClasses.filter(c => c.time === t).map(c => findRoomByValue(center, c.roomId || c.sala || 'Sala 1')?.name || c.sala || 'Sala 1');
        const allSalas = (center?.rooms || []).filter(room => room.active !== false && room.mitoboxEnabled !== false).map(room => room.name);
        const freeSalas = allSalas.filter(s => !occupiedSalas.includes(s));
        freeSalas.forEach(fs => { slots.push({ time: t, sala: fs }); });
      });
    }
    return slots;
  }, [allClasses, maintenancePeriods, mboxAdminDate, mboxAdminSede, centers]);


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
          batch.update(doc(db, c.refPath), withClassStudentIndex(updatedList));
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

    const isTeacherChanged = !isSameTeacher(editClassData.teacher, editClassModal.teacher);

    return (
      <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-xl w-full p-8 shadow-2xl relative my-8">
          <button onClick={closeEditClassModal} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          <h2 className="text-xl font-black uppercase tracking-tight mb-2 flex items-center gap-2"><Pencil className="text-amber-600"/> Editar Clase</h2>
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-6">
            {editClassModal.subject} · {editClassModal.teacher} · {getDayName(editClassModal.dayOfWeek)} {editClassModal.time}h
          </p>

          <div className="grid grid-cols-2 gap-2 bg-zinc-100 border border-zinc-200 rounded-2xl p-1.5 mb-6">
            <button type="button" onClick={() => setEditClassMode('permanent')} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${editClassMode === 'permanent' ? 'bg-black text-white shadow-md' : 'bg-transparent text-zinc-500 hover:text-black'}`}>
              Editar definitivamente
            </button>
            <button type="button" onClick={() => setEditClassMode('temporary')} disabled={isPunctualClass(editClassModal)} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40 ${editClassMode === 'temporary' ? 'bg-violet-600 text-white shadow-md' : 'bg-transparent text-zinc-500 hover:text-violet-700'}`}>
              Cambio temporal
            </button>
          </div>

          {editClassMode === 'permanent' ? (
          <>

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
                {allOfficialTeacherNames.map(t => <option key={normalizeTeacherKey(t)} value={t}>{t}</option>)}
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
                <select value={editClassData.sede} onChange={e => { const center = getCenterForValue(e.target.value); const room = (center?.rooms || []).find(item => item.active !== false); setEditClassData({...editClassData, sede: center?.name || e.target.value, centerId: center?.id || '', sala: room?.name || '', roomId: room?.id || ''}); }} className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none">
                  {getSelectableCenters(editClassData.sede).map(center => <option key={center.id} value={center.name}>{center.name}{center.status !== 'active' ? ' (inactiva)' : ''}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Sala</label>
              <select value={editClassData.sala} onChange={e => { const room = findRoomByValue(getCenterForValue(editClassData.centerId || editClassData.sede), e.target.value); setEditClassData({...editClassData, sala: room?.name || e.target.value, roomId: room?.id || ''}); }} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none">
                {getRoomOptionsForCenter(editClassData.centerId || editClassData.sede, editClassData.sala).map(roomName => <option key={roomName} value={roomName}>{roomName}</option>)}
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
                  {getTeacherAvailability(editClassData.teacher)?.[editClassData.isRecurring ? editClassData.dayOfWeek : new Date(editClassData.specificDate).getDay().toString()]?.length > 0 
                    ? getTeacherAvailability(editClassData.teacher)[editClassData.isRecurring ? editClassData.dayOfWeek : new Date(editClassData.specificDate).getDay().toString()].map(s => `${s.start}h a ${s.end}h`).join(' | ')
                    : 'Ninguna franja registrada.'}
                </span>
             </p>
           </div>
          )}

          </>
          ) : temporaryClassData ? (
          <div className="space-y-4 mb-6">
            <div className="bg-violet-50 border-2 border-violet-100 rounded-2xl p-4 text-violet-950">
              <p className="text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-2"><Clock className="w-4 h-4"/> Horario oficial protegido</p>
              <p className="text-xs font-bold leading-relaxed">La clase seguirá ofertándose como {getDayName(editClassModal.dayOfWeek)} a las {editClassModal.time}h en {editClassModal.sede} · {editClassModal.sala}. El cambio solo se aplicará dentro del periodo indicado.</p>
            </div>

            {temporaryClassData.id && (() => {
              const currentChange = temporaryClassChanges.find(change => change.id === temporaryClassData.id);
              return currentChange ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">Cambio temporal ya programado</p>
                    <p className="text-xs font-bold text-amber-950 mt-1">{formatDateSpanish(currentChange.from)} – {formatDateSpanish(currentChange.until)}</p>
                  </div>
                  <button type="button" onClick={() => cancelTemporaryClassChange(currentChange)} className="px-3 py-2 bg-white border border-red-200 text-red-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white">Cancelar cambio</button>
                </div>
              ) : null;
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase text-violet-700 mb-1 block">Aplicar desde *</label>
                <input type="date" value={temporaryClassData.from} onChange={e => setTemporaryClassData({...temporaryClassData, from: e.target.value})} className="w-full p-3 bg-white border-2 border-violet-100 rounded-xl font-bold text-sm outline-none focus:border-violet-500" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-violet-700 mb-1 block">Aplicar hasta *</label>
                <input type="date" value={temporaryClassData.until} onChange={e => setTemporaryClassData({...temporaryClassData, until: e.target.value})} className="w-full p-3 bg-white border-2 border-violet-100 rounded-xl font-bold text-sm outline-none focus:border-violet-500" />
                <p className="text-[9px] font-bold text-zinc-400 mt-1">Después de esta fecha vuelve automáticamente al horario oficial.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Nuevo día *</label>
                <select value={temporaryClassData.dayOfWeek} onChange={e => setTemporaryClassData({...temporaryClassData, dayOfWeek: e.target.value})} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none">
                  {[1,2,3,4,5,6].map(day => <option key={day} value={day}>{getDayName(day)}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Nueva hora *</label>
                <input type="time" value={temporaryClassData.time} onChange={e => setTemporaryClassData({...temporaryClassData, time: e.target.value})} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Duración min.</label>
                <input type="number" min="15" step="15" value={temporaryClassData.duration} onChange={e => setTemporaryClassData({...temporaryClassData, duration: e.target.value})} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Sede *</label>
                <select value={temporaryClassData.sede} onChange={e => { const center = getCenterForValue(e.target.value); const room = (center?.rooms || []).find(item => item.active !== false); setTemporaryClassData({...temporaryClassData, sede: center?.name || e.target.value, centerId: center?.id || '', sala: room?.name || '', roomId: room?.id || ''}); }} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none">{getSelectableCenters(temporaryClassData.sede).map(center => <option key={center.id} value={center.name}>{center.name}{center.status !== 'active' ? ' (inactiva)' : ''}</option>)}</select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Sala *</label>
                <select value={temporaryClassData.sala} onChange={e => { const room = findRoomByValue(getCenterForValue(temporaryClassData.centerId || temporaryClassData.sede), e.target.value); setTemporaryClassData({...temporaryClassData, sala: room?.name || e.target.value, roomId: room?.id || ''}); }} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none">{getRoomOptionsForCenter(temporaryClassData.centerId || temporaryClassData.sede, temporaryClassData.sala).map(roomName => <option key={roomName} value={roomName}>{roomName}</option>)}</select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Profesor durante el cambio *</label>
                <select value={temporaryClassData.teacher} onChange={e => setTemporaryClassData({...temporaryClassData, teacher: e.target.value})} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none">
                  <option value="">Seleccionar...</option>
                  {allOfficialTeacherNames.map(name => <option key={normalizeTeacherKey(name)} value={name}>{name}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-800">Disponibilidad declarada</p>
              <p className="text-sm font-black text-blue-950 mt-1">{(getTeacherAvailability(temporaryClassData.teacher)?.[temporaryClassData.dayOfWeek] || []).map(slot => `${slot.start}h–${slot.end}h`).join(' | ') || 'Ninguna franja registrada para ese día.'}</p>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Motivo o nota interna</label>
              <textarea value={temporaryClassData.notes} onChange={e => setTemporaryClassData({...temporaryClassData, notes: e.target.value})} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none min-h-[80px]" placeholder="Ej.: obras en la sala, sustitución temporal..." />
            </div>
          </div>
          ) : null}

          <div className="flex gap-3">
            <button onClick={closeEditClassModal} className="flex-1 bg-zinc-100 text-zinc-600 py-4 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-zinc-200 transition-colors">
              Cancelar
            </button>
            <button onClick={handleSaveEditedClass} className="flex-[2] bg-black text-white py-4 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-zinc-800 transition-colors">
              {editClassMode === 'temporary' ? 'Programar cambio temporal' : 'Guardar cambios definitivos'}
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
                {allOfficialTeacherNames.map(t => <option key={normalizeTeacherKey(t)} value={t}>{t}</option>)}
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
                <select value={newClassData.sede} onChange={e => { const center = getCenterForValue(e.target.value); const room = (center?.rooms || []).find(item => item.active !== false); setNewClassData({...newClassData, sede: center?.name || e.target.value, centerId: center?.id || '', sala: room?.name || '', roomId: room?.id || ''}); }} className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none">
                  {activeCenters.map(center => <option key={center.id} value={center.name}>{center.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Sala</label>
              <select value={newClassData.sala} onChange={e => { const room = findRoomByValue(getCenterForValue(newClassData.centerId || newClassData.sede), e.target.value); setNewClassData({...newClassData, sala: room?.name || e.target.value, roomId: room?.id || ''}); }} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none">
                {getRoomOptionsForCenter(newClassData.centerId || newClassData.sede, newClassData.sala).map(roomName => <option key={roomName} value={roomName}>{roomName}</option>)}
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
                  {getTeacherAvailability(newClassData.teacher)?.[newClassData.isRecurring ? newClassData.dayOfWeek : new Date(newClassData.specificDate).getDay().toString()]?.length > 0 
                    ? getTeacherAvailability(newClassData.teacher)[newClassData.isRecurring ? newClassData.dayOfWeek : new Date(newClassData.specificDate).getDay().toString()].map(s => `${s.start}h a ${s.end}h`).join(' | ')
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
          <div className="flex items-center gap-3 mb-6"><ArrowRightLeft className="w-8 h-8 text-blue-600"/><h2 className="text-xl font-black uppercase">Programar cambio</h2></div>
          <p className="text-xs text-zinc-500 font-bold mb-4 uppercase tracking-widest">Alumno: <span className="text-black">{student.name}</span></p>
          <p className="text-xs text-blue-800 font-bold mb-4 bg-blue-50 border border-blue-100 rounded-xl p-3 leading-relaxed">El alumno seguirá en su horario actual hasta la fecha que indiques. El nuevo horario empezará al día siguiente.</p>
          <select value={selectedInstForChange} onChange={e => setSelectedInstForChange(e.target.value)} className="w-full p-3 mb-4 bg-zinc-50 border-2 rounded-xl font-bold text-sm">
            <option value="">Selecciona Instrumento...</option>
            {(settings.instrumentos || defaultInstrumentos).map(i => <option key={i} value={i}>{i}</option>)}
          </select>
          <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
            {availableClasses.length === 0 ? (
              <p className="text-center text-xs text-zinc-400 font-bold p-4 border-2 border-dashed rounded-xl">No hay grupos libres para este instrumento.</p>
            ) : (
              availableClasses.map(c => (
                <div key={c.id} onClick={() => createManualScheduledClassChange(student, c)} className="p-3 rounded-xl border-2 border-zinc-100 hover:border-blue-500 cursor-pointer transition-colors">
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
        await updateDoc(targetPath, withClassStudentIndex(updatedStudents));

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
    const planningStudents = getClassStudentModalData(c, isArchitectProjection, archDate || todayStr);
    const currentCount = planningStudents.length;
    const activeCount = planningStudents.filter(student => student.isActive).length;
    const maintenanceCount = planningStudents.filter(student => student.isMaintenance).length;
    const futureStartCount = planningStudents.filter(student => student.isFutureStart).length;
    const relocatedInCount = planningStudents.filter(student => student.isRelocated).length;
    const relocatedOutCount = planningStudents.filter(student => student.isRelocatedOut).length;
    const absenceCount = planningStudents.filter(student => student.absenceAnnounced).length;
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
    const visibleTemporaryChanges = getClassTemporaryChanges(c)
      .filter(change => change.until >= todayStr)
      .sort((a, b) => String(a.from || '').localeCompare(String(b.from || '')));

    const handleAddStudent = async () => {
      if (!searchName.trim()) return alert("Debes escribir el nombre del alumno.");
      if (isFull) {
        if (!window.confirm(`⚠️ AVISO MODO ADMIN:\n\nEl aforo de esta clase está completo (${currentCount}/${maxCap}).\n¿Quieres forzar la matriculación saltándote el límite?`)) return;
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
        await updateDoc(targetPath, withClassStudentIndex(updatedStudents));

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
          <div className="mb-4 flex flex-col sm:flex-row gap-2 shrink-0">
            <button type="button" onClick={() => openEditClassModal(c)} className="flex-1 bg-amber-100 text-amber-800 hover:bg-amber-200 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"><Pencil className="w-4 h-4"/> Editar clase</button>
            {visibleTemporaryChanges.length > 0 && <span className="flex-1 bg-violet-50 border border-violet-100 text-violet-800 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"><Clock className="w-4 h-4"/> {visibleTemporaryChanges.length} cambio(s) temporal(es)</span>}
          </div>
          {visibleTemporaryChanges.map(change => (
            <div key={change.id} className="mb-4 p-4 bg-violet-50 border border-violet-100 rounded-2xl shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-violet-800">{isTemporaryClassChangeActiveForDate(change, todayStr) ? 'Cambio temporal activo' : 'Cambio temporal programado'}</p>
                  <p className="text-sm font-black text-violet-950 mt-1">{getDayName(change.dayOfWeek)} {change.time}h · {change.sede} ({change.sala}) · {getOfficialTeacherName(change.teacher)}</p>
                  <p className="text-[10px] font-bold text-violet-700 mt-1">Del {formatDateSpanish(change.from)} al {formatDateSpanish(change.until)}. Después vuelve a {getDayName(c.dayOfWeek)} {c.time}h.</p>
                </div>
                <button type="button" onClick={() => cancelTemporaryClassChange(change)} className="shrink-0 p-2 bg-white text-red-600 border border-red-100 rounded-lg hover:bg-red-600 hover:text-white" title="Cancelar cambio temporal"><X className="w-4 h-4"/></button>
              </div>
            </div>
          ))}
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
              {(maintenanceCount > 0 || futureStartCount > 0 || relocatedInCount > 0 || relocatedOutCount > 0 || absenceCount > 0) && (
                <span className="block mt-1 text-[10px] text-zinc-500">
                  {maintenanceCount > 0 ? `${maintenanceCount} en mantenimiento` : ''}
                  {maintenanceCount > 0 && (futureStartCount > 0 || relocatedInCount > 0 || relocatedOutCount > 0 || absenceCount > 0) ? ' · ' : ''}
                  {futureStartCount > 0 ? `${futureStartCount} con inicio futuro` : ''}
                  {futureStartCount > 0 && (relocatedInCount > 0 || relocatedOutCount > 0 || absenceCount > 0) ? ' · ' : ''}
                  {relocatedInCount > 0 ? `${relocatedInCount} recolocado(s) aquí` : ''}
                  {relocatedInCount > 0 && (relocatedOutCount > 0 || absenceCount > 0) ? ' · ' : ''}
                  {relocatedOutCount > 0 ? `${relocatedOutCount} fuera temporalmente` : ''}
                  {relocatedOutCount > 0 && absenceCount > 0 ? ' · ' : ''}
                  {absenceCount > 0 ? `${absenceCount} ausencia(s) anunciada(s)` : ''}
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
                  s.status === 'impago' ? { label: 'Impago', className: 'bg-red-50 text-red-700 border-red-100' } : null,
                  s.status === 'baja' ? { label: 'Baja', className: 'bg-zinc-100 text-zinc-500 border-zinc-200' } : null,
                  s.isMaintenance ? { label: 'Mantenimiento', className: 'bg-sky-50 text-sky-700 border-sky-100' } : null,
                  s.isFutureStart ? { label: `Inicio: ${formatDateSpanish(s.startDate)}`, className: 'bg-emerald-50 text-emerald-700 border-emerald-100' } : null,
                  s.endDate ? { label: `Fin: ${formatDateSpanish(s.endDate)}`, className: 'bg-orange-50 text-orange-700 border-orange-100' } : null,
                  s.isRelocatedOut ? { label: 'Fuera temporalmente', className: 'bg-violet-50 text-violet-700 border-violet-100' } : null,
                  s.isRelocated ? { label: 'Recolocado temporalmente aquí', className: 'bg-indigo-50 text-indigo-700 border-indigo-100' } : null,
                  s.absenceAnnounced ? { label: 'Ausencia anunciada', className: 'bg-amber-50 text-amber-700 border-amber-100' } : null
                ].filter(Boolean);
                const mutedStudent = !s.isActive || s.absenceAnnounced;
                const detailLines = [
                  s.isRelocatedOut && s.relocationOutTargetLine ? `Destino temporal: ${s.relocationOutTargetLine}` : '',
                  s.isRelocated && s.sourceClassLine ? `Origen formal: ${s.sourceClassLine}` : '',
                  s.relocationLabel && s.isRelocated ? s.relocationLabel : '',
                  s.relocationOutLabel || ''
                ].filter(Boolean);
                return (
                  <div key={`${s.id}-${s.isRelocated ? 'reloc-in' : s.isRelocatedOut ? 'reloc-out' : 'base'}`} className={`flex items-center justify-between p-3 bg-white border shadow-sm rounded-xl hover:border-indigo-200 transition-colors ${s.isActive && !s.absenceAnnounced ? 'border-zinc-200' : 'border-dashed border-zinc-300 opacity-85'}`}>
                    <div className="min-w-0 pr-3">
                      <p className={`font-bold text-sm ${mutedStudent ? 'text-zinc-500' : 'text-slate-800'}`}>{s.displayName}</p>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{s.email || 'Sin email'}</p>
                      {statusTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {statusTags.map(tag => (
                            <span key={tag.label} className={`px-2 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${tag.className}`}>{tag.label}</span>
                          ))}
                        </div>
                      )}
                      {detailLines.length > 0 && (
                        <div className="mt-2 space-y-0.5">
                          {detailLines.map(line => (
                            <p key={line} className="text-[10px] text-zinc-500 font-bold leading-snug">{line}</p>
                          ))}
                        </div>
                      )}
                    </div>
                    {!s.isRelocated && (
                      <button onClick={() => handleRemoveFromSpecificClass(c, s.id, s.displayName)} className="p-2 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-colors shrink-0" title="Expulsar SOLO de esta clase">
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

  const startupLoadErrorEntries = Object.entries(startupLoadErrors);
  const activeDeferredDataKeys = ADMIN_TAB_DEFERRED_DATA_KEYS[activeTab] || [];
  const activeDeferredLoadingEntries = activeDeferredDataKeys
    .filter(key => !['ready', 'error'].includes(deferredDataStatus[key]))
    .map(key => [key, ADMIN_DEFERRED_DATA_LABELS[key] || key]);
  const activeDeferredErrorEntries = activeDeferredDataKeys
    .filter(key => deferredDataStatus[key] === 'error')
    .map(key => [key, ADMIN_DEFERRED_DATA_LABELS[key] || key]);

  const retryActiveDeferredData = () => {
    setDeferredDataStatus(previous => {
      const next = { ...previous };
      activeDeferredDataKeys.forEach(key => { next[key] = 'loading'; });
      return next;
    });
    setDeferredRetryVersion(version => version + 1);
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center font-black uppercase tracking-widest">Iniciando Modo Admin...</div>;

  if (startupLoadErrorEntries.length > 0) return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-zinc-900 border-2 border-red-600 rounded-3xl p-7 shadow-2xl">
        <AlertTriangle className="w-10 h-10 text-red-500 mb-4"/>
        <h1 className="text-2xl font-black uppercase tracking-tight">Admin no se ha cargado con seguridad</h1>
        <p className="text-sm font-bold text-zinc-300 mt-3 leading-relaxed">Se ha detenido la operativa para evitar que datos no cargados parezcan listas vacías o cifras reales.</p>
        <div className="mt-5 bg-black/40 border border-zinc-700 rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">No se pudo verificar</p>
          <ul className="space-y-1.5 text-sm font-bold text-red-300">
            {startupLoadErrorEntries.map(([key, label]) => <li key={key}>• {label}</li>)}
          </ul>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <button type="button" onClick={() => setStartupRetryVersion(version => version + 1)} className="flex-1 bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-xl font-black uppercase tracking-widest text-[10px]">Reintentar carga</button>
          <button type="button" onClick={logout} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-5 py-3 rounded-xl font-black uppercase tracking-widest text-[10px]">Cerrar sesión</button>
        </div>
      </div>
    </div>
  );

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
            <div className="flex items-center gap-3 text-white mb-1"><ShieldAlert className="w-6 h-6 text-red-500" /><h1 className="text-xl font-black uppercase tracking-tight">Modo Admin</h1></div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hidden md:block">Panel de Administración</p>
          </div>
          <button onClick={switchToTeacher} className="md:hidden bg-zinc-800 text-white p-2 rounded-lg"><ArrowRightLeft className="w-5 h-5"/></button>
        </div>
        <nav className="flex-1 flex md:flex-col p-4 gap-1 no-scrollbar overflow-x-auto md:overflow-visible">
          {[
            { id: 'gestiones', icon: Inbox, label: 'Bandeja', count: totalInboxNotifications },
            { id: 'students', icon: Users, label: 'Alumnos (CRM)' },
            { id: 'mitobox', icon: DoorOpen, label: 'Mitobox' }, 
            { id: 'classes', icon: BookOpen, label: 'Clases Globales' },
            { id: 'danger', icon: AlertTriangle, label: 'En Peligro' },
            { id: 'teachers', icon: Calculator, label: 'Profesores' },
            { id: 'announcements', icon: Megaphone, label: 'Tablón' },
            { id: 'workshops', icon: PartyPopper, label: 'Talleres', notificationCount: unreadWorkshopRegistrations.length },
            { id: 'gamification', icon: Trophy, label: 'Retos' },
            { id: 'informes', icon: TrendingUp, label: 'Informes (BI)' }, 
            { id: 'settings', icon: Settings, label: 'Configuración' }
          ].map(tab => (
            <button key={tab.id} onClick={() => handleAdminTabChange(tab.id)} className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap md:whitespace-normal text-left ${activeTab === tab.id ? 'bg-red-600 text-white shadow-lg' : 'hover:bg-zinc-900 hover:text-white'}`}>
              <tab.icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{tab.label}</span>
              {tab.notificationCount > 0 && <span className="min-w-5 h-5 px-1.5 bg-red-500 text-white border-2 border-zinc-950 rounded-full text-[9px] font-black flex items-center justify-center" title={`${tab.notificationCount} nueva(s) inscripción(es)`}>{tab.notificationCount}</span>}
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

        {activeDeferredErrorEntries.length > 0 ? (
          <div className="bg-red-50 border-2 border-red-200 rounded-3xl p-7 shadow-sm">
            <AlertTriangle className="w-9 h-9 text-red-600 mb-3"/>
            <h2 className="text-xl font-black uppercase tracking-tight text-red-950">No se puede abrir este apartado con datos fiables</h2>
            <p className="text-sm font-bold text-red-800 mt-2">Se ha bloqueado temporalmente para que un fallo de consulta no se confunda con historiales vacíos, cero horas, ausencia de respuestas o falta de disponibilidad.</p>
            <div className="mt-4 bg-white border border-red-200 rounded-2xl p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-red-500 mb-2">No se pudo verificar</p>
              <ul className="space-y-1.5 text-sm font-bold text-red-900">
                {activeDeferredErrorEntries.map(([key, label]) => <li key={key}>• {label}</li>)}
              </ul>
            </div>
            <button type="button" onClick={retryActiveDeferredData} className="mt-5 bg-red-700 hover:bg-red-800 text-white px-5 py-3 rounded-xl font-black uppercase tracking-widest text-[10px]">Reintentar este apartado</button>
          </div>
        ) : activeDeferredLoadingEntries.length > 0 ? (
          <div className="bg-white border border-zinc-200 rounded-3xl p-10 text-center shadow-sm">
            <Activity className="w-8 h-8 text-indigo-600 mx-auto mb-3 animate-pulse"/>
            <p className="font-black uppercase tracking-widest text-sm text-slate-800">Cargando datos del apartado...</p>
            <p className="text-xs font-bold text-zinc-500 mt-2">{activeDeferredLoadingEntries.map(([, label]) => label).join(' · ')}</p>
          </div>
        ) : (
          <>

        {/* --- PESTAÑA: INFORMES (BUSINESS INTELLIGENCE) --- */}
        {activeTab === 'informes' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Business Intelligence</h2>
                <p className="text-zinc-500 font-bold text-sm mt-1 uppercase tracking-widest">Información estratégica y análisis de márgenes</p>
              </div>
              <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2">
                <div className="flex bg-zinc-200 p-1 rounded-xl border border-zinc-300">
                  <button type="button" onClick={() => setBiProjectionMode('actual')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${biProjectionMode === 'actual' ? 'bg-white text-slate-900 shadow-sm' : 'text-zinc-500'}`}>Actual</button>
                  <button type="button" onClick={() => setBiProjectionMode('proyeccion')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${biProjectionMode === 'proyeccion' ? 'bg-violet-600 text-white shadow-sm' : 'text-zinc-500'}`}>Proyección mes siguiente</button>
                </div>
                <button onClick={handleDownloadBIReport} className="w-full sm:w-auto bg-slate-900 hover:bg-black text-white px-5 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 transition-colors">
                  <FileText className="w-4 h-4"/> Generar informe
                </button>
              </div>
            </header>

            <div className={`rounded-2xl border p-5 ${biProjectionMode === 'proyeccion' ? 'bg-violet-50 border-violet-200' : 'bg-sky-50 border-sky-200'}`}>
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <p className={`text-[10px] font-black uppercase tracking-widest ${biProjectionMode === 'proyeccion' ? 'text-violet-700' : 'text-sky-700'}`}>{biProjectionMode === 'proyeccion' ? 'Escenario potencial' : 'Situación actual'} · {biPeriodLabel}</p>
                  <p className="text-sm font-bold text-slate-700 mt-1">
                    {biProjectionMode === 'proyeccion'
                      ? `Foto prevista al ${formatDateSpanish(nextMonthStartStr)} incorporando ${biProjectionInputs.meta.appliedPending.length} solicitud(es) pendiente(s) de la Bandeja.`
                      : `Foto operativa al ${formatDateSpanish(todayStr)}. Las solicitudes todavía pendientes no alteran esta vista.`}
                  </p>
                  <p className="text-[11px] font-semibold text-zinc-500 mt-1">Las recolocaciones conservan cuota y plaza en origen. Los cambios temporales logísticos no cambian las cifras; un profesor sustituto sí recibe el coste de sus sesiones.</p>
                </div>
                {biProjectionMode === 'proyeccion' && (
                  <div className="grid grid-cols-2 gap-2 min-w-full lg:min-w-[360px]">
                    <div className="bg-white rounded-xl border border-violet-100 p-3">
                      <span className="block text-[9px] font-black uppercase tracking-widest text-zinc-400">Base confirmada</span>
                      <span className="block text-lg font-black text-slate-800 mt-1">{confirmedNextMonthBusinessIntelligence.beneficioNeto.toLocaleString('es-ES', {maximumFractionDigits: 0})}€</span>
                    </div>
                    <div className="bg-violet-600 rounded-xl p-3 text-white">
                      <span className="block text-[9px] font-black uppercase tracking-widest text-violet-200">Con pendientes</span>
                      <span className="block text-lg font-black mt-1">{projectedBusinessIntelligence.beneficioNeto.toLocaleString('es-ES', {maximumFractionDigits: 0})}€</span>
                    </div>
                  </div>
                )}
              </div>
              {biProjectionMode === 'proyeccion' && biProjectionInputs.meta.skippedPending.length > 0 && (
                <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-[11px] font-bold">
                  {biProjectionInputs.meta.skippedPending.length} solicitud(es) no se han simulado por faltar datos decisivos, por ejemplo la duración de un mantenimiento antiguo. Aparecen detalladas en el informe descargable.
                </div>
              )}
            </div>

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
                  <p className="text-[10px] font-bold text-emerald-700/70 uppercase mt-2">Clases: {businessIntelligence.totalIngresosClases.toLocaleString('es-ES')}€ · Mantenimiento: {businessIntelligence.ingresosMantenimiento.toLocaleString('es-ES')}€ · Extras: {businessIntelligence.ingresosExtras.toLocaleString('es-ES')}€</p>
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

                <div className="md:col-span-2 lg:col-span-4 bg-white border border-zinc-200 p-5 rounded-3xl shadow-sm grid grid-cols-2 lg:grid-cols-6 gap-4">
                  <div><span className="block text-2xl font-black text-slate-900">{businessIntelligence.totalAlumnosActivosUnicos || 0}</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Alumnos únicos activos</span></div>
                  <div><span className="block text-2xl font-black text-slate-900">{businessIntelligence.totalMatriculasActivas || 0}</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Matrículas con cuota</span></div>
                  <div><span className="block text-2xl font-black text-slate-900">{businessIntelligence.totalPlazasComprometidas || 0}</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Plazas comprometidas</span></div>
                  <div><span className="block text-2xl font-black text-blue-700">{businessIntelligence.alumnosMantenimiento || 0}</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">En mantenimiento</span></div>
                  <div><span className="block text-2xl font-black text-indigo-700">{businessIntelligence.alumnosMitoverso || 0}</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Mitoverso · {businessIntelligence.ingresosMitoverso || 0}€</span></div>
                  <div><span className="block text-2xl font-black text-sky-700">{businessIntelligence.alumnosMitobox || 0}</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Mitobox · {businessIntelligence.ingresosMitobox || 0}€</span></div>
                  {businessIntelligence.alumnosMantenimientoLegacy > 0 && <p className="col-span-2 lg:col-span-6 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">{businessIntelligence.alumnosMantenimientoLegacy} ficha(s) con estado antiguo «congelado» o pausa heredada se tratan como mantenimiento.</p>}
                </div>
              </div>
            )}

            {/* SUBVISTA 2: RENTABILIDAD POR SEDE */}
            {informeSubTab === 'sedes' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in">
                 {centerNamesForReporting.map(sede => {
                    const dataSede = businessIntelligence.porSede[sede] || { ingresos: 0, ingresosClases: 0, mantenimiento: 0, costesProf: 0, alumnosMantenimiento: 0, alumnosActivos: 0, alumnosUnicos: 0, alumnosInicioFuturo: 0, plazasComprometidas: 0, clasesOperativas: 0, clasesHibernadas: 0, horasSemanalesOperativas: 0 };
                    const gastoFijoSede = getCenterFixedCost(sede);
                    const beneficioSede = dataSede.ingresos - dataSede.costesProf - gastoFijoSede;
                    return (
                       <div key={sede} className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm flex flex-col">
                          <h3 className="font-black text-2xl uppercase text-slate-800 tracking-tight border-b pb-3 flex items-center gap-2"><MapPin className="text-blue-500"/> Sede {sede}</h3>
                          <div className="mt-4 space-y-3 flex-1 text-sm font-bold">
                             <div className="flex justify-between text-slate-600"><span>Ingresos por clases:</span><span className="text-emerald-600">+{dataSede.ingresosClases}€</span></div>
                             <div className="flex justify-between text-slate-600"><span>Matrículas con cuota:</span><span>{dataSede.alumnosActivos || 0}</span></div>
                             <div className="flex justify-between text-slate-600"><span>Alumnos únicos activos:</span><span>{dataSede.alumnosUnicos || 0}</span></div>
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
                          <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mt-3">Los {businessIntelligence.ingresosExtras || 0}€ de Extras recurrentes son globales y no se atribuyen artificialmente a una sede.</p>
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
                 <p className="p-4 bg-zinc-50 border-t border-zinc-100 text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Mitoverso y Mitobox están incluidos en el resumen global, pero no se atribuyen a un instrumento.</p>
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
                                  {isSameTeacher(p.name, 'Paco') && <span className="ml-2 bg-zinc-200 text-zinc-500 text-[9px] px-2 py-0.5 rounded">Socio</span>}
                                </td>
                                <td className="p-4 text-center">{(p.horasSemanales || 0).toFixed(1)} h/sem equiv.{p.clasesHibernadas ? ` · ${p.clasesHibernadas} hib.` : ''}{p.sesionesSustitucion ? <span className="block text-[9px] text-violet-600 uppercase mt-1">{p.sesionesSustitucion} sesión/es sustituidas</span> : null}</td>
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
                 <p className="p-4 bg-zinc-50 border-t border-zinc-100 text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Los Extras no se atribuyen a un profesor. Las sustituciones temporales solo trasladan el coste de las sesiones impartidas.</p>
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
                        <th className="p-4 font-black text-center">Matrículas / sesión</th>
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
                              {c.teacherCostShares?.some(share => share.isSubstitute) && <div className="text-[9px] text-violet-600 font-bold uppercase mt-1">Coste repartido: {c.teacherCostShares.map(share => share.teacher).join(' / ')}</div>}
                            </td>
                            <td className="p-4">
                              <div className="font-bold text-slate-700">{c.sede}</div>
                              <div className="text-[10px] text-zinc-400 mt-0.5 uppercase">{getDayName(c.dayOfWeek)} {c.time}</div>
                            </td>
                            <td className="p-4 text-center">
                              <span className={`px-2.5 py-1 rounded text-xs font-black ${c.numAlumnos > 0 ? 'bg-zinc-200 text-black' : 'bg-red-100 text-red-700'}`}>
                                {c.numAlumnos} cuota(s)
                              </span>
                              {c.numAlumnosOperativos !== c.numAlumnos && <div className="mt-1 text-[9px] font-black text-violet-600 uppercase">{c.numAlumnosOperativos} en sesión</div>}
                              {(c.numCongelados > 0 || c.numInicioFuturo > 0 || c.numImpagos > 0) && (
                                <div className="mt-1 text-[9px] font-bold text-zinc-400 uppercase leading-tight">
                                  {c.numCongelados > 0 ? `Mant. ${c.numCongelados} ` : ''}{c.numInicioFuturo > 0 ? `Inicio futuro ${c.numInicioFuturo} ` : ''}{c.numImpagos > 0 ? `Impago ${c.numImpagos}` : ''}
                                </div>
                              )}
                              {(c.numRecolocadosFuera > 0 || c.numRecolocadosDentro > 0) && <div className="mt-1 text-[9px] font-bold text-sky-600 uppercase">Recol. fuera/dentro {c.numRecolocadosFuera || 0}/{c.numRecolocadosDentro || 0}</div>}
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
                <p className="text-zinc-500 font-medium text-sm">Gestiona solicitudes de alumnos, tareas internas y consulta las nuevas inscripciones en talleres.</p>
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

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
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
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-700">Inscripciones nuevas</p>
                <p className="text-2xl font-black text-rose-900">{unreadWorkshopRegistrations.length}</p>
              </div>
            </div>

            {totalPendingInbox === 0 && resolvedGestiones.length === 0 && resolvedTeacherRequests.length === 0 && workshopRegistrations.length === 0 ? (
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
                    placeholder="Buscar por alumno, email, profesor, taller, encargo o texto de solicitud..."
                    className="w-full pl-11 pr-4 py-3 rounded-2xl outline-none font-bold text-sm text-slate-700"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                  <button
                    onClick={() => { setInboxSection('talleres'); markWorkshopRegistrationsSeen(); }}
                    className={`p-4 rounded-2xl border-2 text-left transition-all ${inboxSection === 'talleres' ? 'bg-rose-700 text-white border-rose-700 shadow-md' : 'bg-white text-slate-800 border-zinc-200 hover:border-rose-500'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Talleres · informativo</p>
                        <p className="text-sm font-black uppercase tracking-tight mt-1">Nuevas inscripciones recibidas</p>
                      </div>
                      <span className={`px-3 py-1 rounded-xl text-xs font-black ${inboxSection === 'talleres' ? 'bg-white/20 text-white' : 'bg-rose-50 text-rose-700'}`}>{workshopRegistrations.length}</span>
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

                {inboxSection === 'talleres' ? (
                  filteredWorkshopRegistrations.length === 0 ? (
                    <div className="bg-white rounded-3xl p-10 text-center border-2 border-dashed border-zinc-200">
                      <PartyPopper className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
                      <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">No hay inscripciones de talleres en esta vista</h3>
                      <p className="text-xs text-zinc-400 font-medium mt-2">Este apartado es informativo; las inscripciones se gestionan desde Talleres.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-black uppercase tracking-tight text-rose-950 flex items-center gap-2"><PartyPopper className="w-4 h-4"/> Inscripciones recibidas</h3>
                          <p className="text-xs font-bold text-rose-800/70 mt-1">Información de entrada. Confirmaciones, rechazos y listas de espera se gestionan en el apartado Talleres.</p>
                        </div>
                        <button onClick={() => { setActiveTab('workshops'); markWorkshopRegistrationsSeen(); }} className="bg-rose-700 hover:bg-rose-800 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shrink-0"><ArrowRightLeft className="w-4 h-4"/> Ir a Talleres</button>
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {filteredWorkshopRegistrations.map(registration => {
                          const answers = Array.isArray(registration.answers) ? registration.answers : [];
                          const status = registration.status || 'pending';
                          const createdAt = registration.updatedAt || registration.createdAt || '';
                          return (
                            <article key={registration.id} className={`bg-white rounded-3xl border-2 p-5 shadow-sm ${!registration.adminSeenAt ? 'border-rose-300 ring-2 ring-rose-50' : 'border-zinc-100'}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2 mb-2">
                                    {!registration.adminSeenAt && <span className="bg-red-500 text-white px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">Nueva</span>}
                                    <span className={`inline-flex items-center px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${WORKSHOP_REGISTRATION_STATUS_STYLE[status] || WORKSHOP_REGISTRATION_STATUS_STYLE.pending}`}>{WORKSHOP_REGISTRATION_STATUS_LABELS[status] || status}</span>
                                  </div>
                                  <h4 className="font-black text-slate-900 uppercase tracking-tight text-lg leading-tight">{registration.workshopTitle || 'Taller'}</h4>
                                  <p className="text-xs font-black text-rose-700 mt-1">{registration.studentName || 'Alumno sin nombre'}</p>
                                  <p className="text-[10px] font-bold text-zinc-400 mt-0.5">{registration.studentEmail || 'Sin email'}</p>
                                </div>
                                <div className="w-11 h-11 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shrink-0"><PartyPopper className="w-5 h-5"/></div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 mt-4">
                                <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-3"><p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Fecha</p><p className="text-xs font-black text-slate-700 mt-1">{createdAt ? new Date(createdAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Sin fecha'}</p></div>
                                <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-3"><p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Precio</p><p className="text-xs font-black text-slate-700 mt-1">{registration.priceType === 'paid' ? `${Number(registration.price || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : 'Gratuito'}</p></div>
                              </div>

                              {answers.length > 0 && <div className="mt-3 bg-zinc-50 border border-zinc-100 rounded-xl p-3"><p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-2">Respuestas del alumno</p><div className="space-y-2">{answers.map((answer, index) => <div key={answer.questionId || index}><p className="text-[10px] font-black text-slate-600">{answer.question || 'Pregunta'}</p><p className="text-xs font-medium text-zinc-600 whitespace-pre-wrap">{answer.answer || 'Sin respuesta'}</p></div>)}</div></div>}

                              <div className="mt-4 pt-3 border-t border-zinc-100 flex flex-wrap items-center justify-between gap-2">
                                <span className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${registration.adminNotificationEmailSentAt ? 'text-emerald-700' : 'text-amber-700'}`}>{registration.adminNotificationEmailSentAt ? <><Mail className="w-3 h-3"/> Email enviado a Gestiones</> : <><Clock className="w-3 h-3"/> Email pendiente</>}</span>
                                <button onClick={() => { setActiveTab('workshops'); markWorkshopRegistrationsSeen(); }} className="text-[9px] font-black uppercase tracking-widest text-rose-700 hover:text-rose-900">Abrir en Talleres →</button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  )
                ) : inboxSection === 'profesores' ? (
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
                                    <span>{c.subject} · {getDayName(c.dayOfWeek)} · {c.time}h · {getClassCenterName(c)}{c.sala || c.roomId ? ` · ${getClassRoomName(c)}` : ''}</span>
                                  </div>
                                ))}
                                {hiddenClassCount > 0 && (
                                  <div className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">+{hiddenClassCount} clase(s) más</div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded border text-[10px] font-black uppercase tracking-widest ${getGestionTypeBadgeClass(g)}`}>
                              {getGestionTypeLabel(g.type || 'tarea')}
                            </span>
                            <div className={`mt-2 inline-flex px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${isGestionReadyForExecution(g) ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {getGestionWorkflowLabel(g)}
                            </div>
                            {g.tadosiDoneAt && <div className="text-[9px] font-bold text-emerald-600 mt-1 uppercase">Tadosi: {new Date(g.tadosiDoneAt).toLocaleDateString('es-ES')}</div>}
                            {isExtraServiceGestion(g) && (() => {
                              const extraConfig = getExtraServiceConfigForGestion(g);
                              return (
                                <div className="mt-2 p-2 rounded-xl bg-slate-50 border border-slate-100 text-[10px] font-bold text-slate-700 leading-snug">
                                  <span className="font-black uppercase tracking-widest block mb-0.5">Servicio extra</span>
                                  {g.extraServiceName || g.serviceName || extraConfig?.name || 'Extra'} · cuota {g.extraMonthlyFee || extraConfig?.monthlyFee || '—'}€/mes
                                  <span className="block text-zinc-500 mt-0.5">Prorrata del mes corriente: a calcular al activar.</span>
                                </div>
                              );
                            })()}
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
                                title={isGestionReadyForExecution(g) ? (getExtraServiceConfigForGestion(g)?.readyActionLabel || 'Ejecutar ahora') : 'Primero marca Tadosi hecho'}
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

            {filteredResolvedGestiones.length > 0 && (
              <div className="mt-12 pt-8 border-t border-zinc-200">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2 flex items-center gap-2">
                  <History className="w-5 h-5 text-zinc-400"/> Historial de Trámites (Cerrados)
                </h3>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-4">
                  {gestionSearchNeedle ? `${filteredResolvedGestiones.length} trámite(s) cerrado(s) encontrados con la búsqueda actual.` : `${resolvedGestiones.length} trámite(s) cerrado(s) archivados.`}
                </p>
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
                              <span className={`px-2 py-1 rounded border text-[10px] font-black uppercase tracking-widest ${getGestionTypeBadgeClass(g)}`}>
                                {getGestionTypeLabel(g.type || 'tarea')}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="max-w-[200px] md:max-w-md truncate text-xs text-zinc-500 italic" title={g.details}>{g.details}</div>
                            </td>
                            <td className="p-4 text-right whitespace-nowrap">
                              <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${g.status === 'completado' ? 'bg-emerald-100 text-emerald-700' : g.status === 'archivado' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                                Cerrado · {g.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                {resolvedGestionesVisible < filteredResolvedGestiones.length && (
                  <div className="p-4 bg-zinc-50 border-t border-zinc-100 text-center">
                    <button
                      onClick={() => setResolvedGestionesVisible(prev => prev + HISTORIAL_TRAMITES_BLOCK_SIZE)}
                      className="bg-zinc-200 hover:bg-zinc-300 text-zinc-700 font-black uppercase tracking-widest text-[10px] px-6 py-3 rounded-xl transition-colors"
                    >
                      Cargar más trámites ({Math.min(HISTORIAL_TRAMITES_BLOCK_SIZE, filteredResolvedGestiones.length - resolvedGestionesVisible)} más)
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
                <button
                  type="button"
                  onClick={copyActiveStudentEmails}
                  className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm transition-colors"
                  title="Copia los correos únicos y válidos de alumnos activos o en mantenimiento, uno por línea y seguido de una coma"
                >
                  <ClipboardList className="w-4 h-4" />
                  Copiar emails activos + mantenimiento ({getActiveStudentEmails().length})
                </button>
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
                      <th className="p-4 font-black text-center w-[20%]">Acciones Admin</th>
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
                                    <button type="button" key={c.id} onClick={() => setViewClassModal(c)} className={`inline-flex items-center gap-1 px-1.5 py-0.5 border rounded text-[8px] font-black uppercase tracking-widest whitespace-nowrap transition-all hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 ${isMaintenanceNow ? 'bg-blue-50 border-blue-100 text-blue-600 hover:bg-blue-100' : startsLater ? 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100' : 'bg-zinc-100 border-zinc-200 text-zinc-500 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200'}`} title={`Abrir clase · Profesor: ${getOfficialTeacherName(c.teacher)}${isMaintenanceNow ? ` · Mantenimiento ${formatMaintenancePeriodLine(maintenancePeriod)}` : ''}${startsLater ? ` · Inicio: ${formatDateSpanish(classStartDate)}` : ''}`}>
                                      <BookOpen className="w-2.5 h-2.5 text-zinc-400" /> {c.subject} {dayShort}-{timeShort}{isMaintenanceNow ? ' · Mantenimiento' : startsLater ? ` · Inicio ${formatDateSpanish(classStartDate)}` : ''}
                                    </button>
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
                              <button onClick={() => setChangeClassModal(student)} className="p-2.5 bg-zinc-800 text-white rounded-lg hover:bg-black transition-colors" title="Programar cambio de clase">
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
                              <option value="baja">Programar baja</option>
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
                    {activeCenters.filter(center => (center.rooms || []).some(room => room.active !== false && room.mitoboxEnabled !== false)).map(center => <option key={center.id} value={center.name}>{center.name}</option>)}
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

            {classesViewMode === 'profesores' && (
              <div className="bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-violet-700 flex items-center gap-2"><Clock className="w-4 h-4"/> Horario operativo por fecha</p>
                  <p className="text-xs font-bold text-zinc-500 mt-1">Las tarjetas aplican los cambios temporales vigentes en la fecha elegida. Los cambios futuros se anuncian dentro de su clase oficial.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
                  <input type="date" value={classesReferenceDate} onChange={e => setClassesReferenceDate(e.target.value || todayStr)} className="w-full sm:w-auto p-3 bg-zinc-50 border-2 border-zinc-200 outline-none font-black text-sm uppercase tracking-widest rounded-xl" />
                  <button type="button" onClick={() => setClassesReferenceDate(todayStr)} className="px-4 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-[10px] font-black uppercase tracking-widest">Hoy</button>
                </div>
              </div>
            )}

            {/* VISTA ARQUITECTO (POR SALAS EN BLANCO/OCUPADO + CUADRANTE) */}
            {classesViewMode === 'salas' && (
               <div className="space-y-6 animate-in fade-in">
                  <div className="bg-white p-4 rounded-2xl flex flex-col lg:flex-row gap-4 shadow-sm border border-zinc-200 items-stretch lg:items-center justify-between">
                     <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                       <select value={archSede} onChange={e=>setArchSede(e.target.value)} className="w-full sm:w-auto p-3 bg-zinc-50 border-2 border-zinc-200 outline-none font-black text-sm uppercase tracking-widest rounded-xl">
                         {activeCenters.map(center => <option key={center.id} value={center.name}>{center.name}</option>)}
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
                                 {architectRooms.map(sala => ( <th key={sala} className="p-4 bg-zinc-100 border-b border-r border-zinc-200 text-center text-sm font-black text-slate-800 uppercase tracking-widest">{sala}</th> ))}
                              </tr>
                           </thead>
                           <tbody>
                              {architectScheduleHours.map(time => (
                                 <tr key={time} className="border-b border-zinc-100">
                                    <td className="p-4 border-r border-zinc-100 text-center font-black text-sm text-zinc-400 bg-zinc-50/50">{time}</td>
                                    {architectRooms.map(sala => {
                                       const classesInSlot = architectClasses.filter(c => {
                                         const isClassForSelectedDate = isPunctualClass(c)
                                           ? c.date === (archDate || todayStr)
                                           : Number(c.dayOfWeek) === Number(architectSelectedDay);

                                         return isSameCenter(c.centerId || c.sede || 'Tarragona', archSede) && isClassForSelectedDate && isSameRoom(archSede, c.roomId || c.sala, sala) && c.time === time;
                                       });
                                       const openCreateFromSlot = () => {
                                         if (isArchitectProjection) return;
                                         const location = getLocationIdentity(archSede, sala);
                                         setNewClassData({...newClassData, isRecurring: true, dayOfWeek: architectSelectedDay, time: time, sede: getCenterName(archSede), sala: sala, ...location});
                                         setCreateClassModal(true);
                                       };
                                       return (
                                          <td key={sala} className="p-2 border-r border-zinc-100 align-top h-28 relative hover:bg-zinc-50 transition-colors group" onClick={(e) => { if(isArchitectProjection || e.target.closest('button') || classesInSlot.length > 0) return; openCreateFromSlot(); }}>
                                             {classesInSlot.length > 0 ? (
                                                classesInSlot.map(c => {
                                                   const realClass = recurringClassesOnly.find(real => String(real.id) === String(c.id) || (real.refPath && real.refPath === c.refPath)) || c;
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
                                                             {c.temporaryClassChange && (
                                                               <div className={`mt-1 text-[9px] font-black uppercase tracking-widest ${isHibernatedCard ? 'text-violet-700' : 'text-white'}`}>
                                                                 Cambio temporal · hasta {formatDateSpanish(normalizeTemporaryClassChangeDate(c.temporaryClassChange.until))}
                                                               </div>
                                                             )}
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

                                                         {c.temporaryClassChange && c.officialSchedule && (
                                                           <div className="mt-2 pt-2 border-t text-[8px] font-bold leading-snug normal-case tracking-normal" style={{ ...dividerStyle, color: isHibernatedCard ? '#6d28d9' : 'rgba(255,255,255,.78)' }}>
                                                             Horario oficial: {getDayName(c.officialSchedule.dayOfWeek)} {c.officialSchedule.time}h · {c.officialSchedule.sede} ({c.officialSchedule.sala})
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
                              const visibleStudentNames = activeStudents
                                .map(student => student.displayName)
                                .filter(Boolean)
                                .slice(0, 5);
                              const hiddenStudentCount = Math.max(activeStudents.length - visibleStudentNames.length, 0);
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
                                    {c.temporaryClassChange && <span className="bg-violet-100 text-violet-700 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest">Temporal activo hasta {formatDateSpanish(normalizeTemporaryClassChangeDate(c.temporaryClassChange.until))}</span>}
                                    {!c.temporaryClassChange && c.upcomingTemporaryClassChange && <span className="bg-violet-50 text-violet-700 border border-violet-200 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest">Cambio programado {formatDateSpanish(normalizeTemporaryClassChangeDate(c.upcomingTemporaryClassChange.from))}</span>}
                                  </div>
                                  <div className="text-xs font-bold uppercase mt-1" style={{ color: teacherTheme.text }}>{c.subject} • {c.sede} ({c.sala})</div>
                                  {c.temporaryClassChange && c.officialSchedule && (
                                    <div className="mt-1 text-[9px] font-bold text-violet-700 normal-case leading-snug">
                                      Oficial: {getDayName(c.officialSchedule.dayOfWeek)} {c.officialSchedule.time}h · {c.officialSchedule.sede} ({c.officialSchedule.sala}) · {c.officialSchedule.teacher}
                                    </div>
                                  )}
                                  {!c.temporaryClassChange && c.upcomingTemporaryClassChange && (
                                    <div className="mt-2 p-2 bg-violet-50 border border-violet-100 rounded-lg text-[9px] font-bold text-violet-800 normal-case leading-snug">
                                      Del {formatDateSpanish(normalizeTemporaryClassChangeDate(c.upcomingTemporaryClassChange.from))} al {formatDateSpanish(normalizeTemporaryClassChangeDate(c.upcomingTemporaryClassChange.until))}: {getDayName(Number(c.upcomingTemporaryClassChange.dayOfWeek))} {c.upcomingTemporaryClassChange.time}h · {c.upcomingTemporaryClassChange.sede} ({c.upcomingTemporaryClassChange.sala}) · {getOfficialTeacherName(c.upcomingTemporaryClassChange.teacher)}
                                    </div>
                                  )}
                                  <div className="text-right text-xs font-black mt-2" style={{ color: teacherTheme.text }}>{isHibernated ? '💤 Hibernada' : `${activeC}/${c.capacity} activos`}</div>
                                  {(maintenanceC > 0 || futureStartC > 0 || relocatedC > 0) && (
                                    <div className="text-right text-[9px] font-black uppercase tracking-widest mt-1" style={{ color: teacherTheme.text }}>
                                      {maintenanceC > 0 ? `${maintenanceC} mant.` : ''}{maintenanceC > 0 && (futureStartC > 0 || relocatedC > 0) ? ' · ' : ''}{futureStartC > 0 ? `${futureStartC} inicio futuro` : ''}{futureStartC > 0 && relocatedC > 0 ? ' · ' : ''}{relocatedC > 0 ? `${relocatedC} recol.` : ''}
                                    </div>
                                  )}

                                  {isHibernated ? (
                                    <div className="mt-2 pt-2 border-t text-[9px] font-bold leading-snug normal-case tracking-normal text-slate-500" style={{ borderColor: 'rgba(100,116,139,.25)' }}>
                                      No hay alumnos activos operando esta clase hoy.
                                    </div>
                                  ) : visibleStudentNames.length > 0 && (
                                    <div className="mt-2 pt-2 border-t text-[9px] font-bold leading-snug normal-case tracking-normal" style={{ borderColor: teacherTheme.border, color: teacherTheme.text }}>
                                      {visibleStudentNames.join(', ')}{hiddenStudentCount > 0 ? ` +${hiddenStudentCount} más` : ''}
                                    </div>
                                  )}

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
                          <p className="text-xs font-bold text-slate-600 mt-1">{getDayName(c.dayOfWeek)} · {c.time}h · {getClassCenterName(c)} · {getClassRoomName(c)}</p>
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

        {/* --- 6. PROFESORES --- */}
        {activeTab === 'teachers' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Profesores</h2>
                <p className="text-zinc-500 font-medium text-sm">Evaluaciones, horas, nóminas y disponibilidad real para abrir nuevas clases.</p>
              </div>
              {teacherPanelTab === 'payroll' && (
                <select 
                  value={selectedPayrollMonth} 
                  onChange={(e) => setSelectedPayrollMonth(e.target.value)}
                  className="bg-white border border-zinc-200 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-slate-800 shadow-sm outline-none cursor-pointer hover:border-black transition-colors"
                >
                  {availableMonths.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              )}
            </header>

            <div className="bg-white border border-zinc-200 rounded-2xl p-2 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={() => setTeacherPanelTab('evaluations')}
                className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${teacherPanelTab === 'evaluations' ? 'bg-black text-white shadow-md' : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'}`}
              >
                <Star className="w-4 h-4"/> Evaluaciones docentes
              </button>
              <button
                onClick={() => setTeacherPanelTab('payroll')}
                className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${teacherPanelTab === 'payroll' ? 'bg-black text-white shadow-md' : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'}`}
              >
                <Calculator className="w-4 h-4"/> Horas y nóminas
              </button>
              <button
                onClick={() => setTeacherPanelTab('availability')}
                className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${teacherPanelTab === 'availability' ? 'bg-black text-white shadow-md' : 'bg-zinc-50 text-zinc-500 hover:bg-zinc-100'}`}
              >
                <Clock className="w-4 h-4"/> Disponibilidad
              </button>
            </div>

            {teacherPanelTab === 'evaluations' && (
              <div className="space-y-6">
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 text-xs font-bold text-indigo-900 leading-relaxed flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-black uppercase tracking-widest text-[10px] mb-1">Evaluación confidencial para coordinación</p>
                    <p>Las respuestas se guardan una a una. Aquí ves solo medias y señales de alerta para mantener el panel limpio. El detalle completo, incluidos comentarios, se descarga en TXT.</p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-5">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
                    <div>
                      <h3 className="text-lg font-black uppercase tracking-tight text-slate-800 flex items-center gap-2"><Activity className="w-5 h-5 text-indigo-600"/> Panel de calidad docente</h3>
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mt-1">Filtra por trimestre o exporta una copia completa en TXT.</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        value={teacherEvaluationPeriod}
                        onChange={e => setTeacherEvaluationPeriod(e.target.value)}
                        className="bg-zinc-50 border border-zinc-200 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest text-slate-800 outline-none"
                      >
                        <option value="all">Todos los periodos</option>
                        {teacherEvaluationPeriods.map(period => <option key={period} value={period}>{period}</option>)}
                      </select>
                      <button onClick={handleDownloadTeacherEvaluationReport} className="bg-black text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 flex items-center justify-center gap-2 shadow-md">
                        <FileText className="w-4 h-4"/> Exportar TXT
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1">Evaluaciones</p>
                      <p className="text-3xl font-black text-slate-900">{teacherEvaluationGlobalStats.responses}</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700 mb-1">Media global</p>
                      <p className="text-3xl font-black text-emerald-900">{formatAverageScore(teacherEvaluationGlobalStats.average)}<span className="text-sm text-emerald-500">/5</span></p>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-blue-700 mb-1">Profesores valorados</p>
                      <p className="text-3xl font-black text-blue-900">{teacherEvaluationGlobalStats.teachersWithResponses}</p>
                    </div>
                    <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-rose-700 mb-1">Alertas</p>
                      <p className="text-3xl font-black text-rose-900">{teacherEvaluationGlobalStats.lowSignalCount}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                  {teacherEvaluationStats.map(stat => {
                    const expanded = expandedEvaluationTeacher === stat.name;
                    const bestQuestion = TEACHER_EVALUATION_QUESTIONS
                      .map(question => ({ ...question, average: stat.questionAverages[question.key] }))
                      .filter(question => Number.isFinite(question.average))
                      .sort((a, b) => b.average - a.average)[0];
                    const worstQuestion = TEACHER_EVALUATION_QUESTIONS
                      .map(question => ({ ...question, average: stat.questionAverages[question.key] }))
                      .filter(question => Number.isFinite(question.average))
                      .sort((a, b) => a.average - b.average)[0];
                    const individualOpen = expandedEvaluationIndividualsTeacher === stat.name;
                    const visibleIndividualCount = visibleEvaluationItemsByTeacher[stat.name] || 10;
                    const visibleIndividualEvaluations = stat.evaluations.slice(0, visibleIndividualCount);
                    const positiveComments = stat.comments.filter(comment => comment.type === 'Valorado');
                    const improvementComments = stat.comments.filter(comment => comment.type === 'Mejora');
                    const privateComments = stat.comments.filter(comment => comment.type === 'Privado');

                    return (
                      <div key={stat.name} className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                        <div className="p-5 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div>
                            <h3 className="font-black uppercase tracking-tight text-slate-900 text-lg flex items-center gap-2"><User className="w-5 h-5 text-black"/> {stat.name}</h3>
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mt-1">{stat.activeClassCount} clase(s) · {stat.activeStudentCount} alumno(s) con plaza</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`px-4 py-2 rounded-2xl border text-center ${stat.responseCount === 0 ? 'bg-zinc-50 border-zinc-100 text-zinc-400' : stat.average < 3.5 ? 'bg-rose-50 border-rose-100 text-rose-700' : 'bg-emerald-50 border-emerald-100 text-emerald-700'}`}>
                              <p className="text-[9px] font-black uppercase tracking-widest">Media</p>
                              <p className="text-2xl font-black leading-none">{formatAverageScore(stat.average)}<span className="text-xs">/5</span></p>
                            </div>
                            <div className="px-4 py-2 rounded-2xl border bg-zinc-50 border-zinc-100 text-zinc-700 text-center">
                              <p className="text-[9px] font-black uppercase tracking-widest">Respuestas</p>
                              <p className="text-2xl font-black leading-none">{stat.responseCount}</p>
                            </div>
                          </div>
                        </div>

                        {stat.responseCount === 0 ? (
                          <div className="p-6 text-center text-zinc-400">
                            <Star className="w-8 h-8 mx-auto mb-2 text-zinc-200" />
                            <p className="text-xs font-black uppercase tracking-widest">Sin evaluaciones todavía en este filtro.</p>
                          </div>
                        ) : (
                          <div className="p-5 space-y-5">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3">
                                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700 mb-1">Punto fuerte</p>
                                <p className="text-sm font-black text-emerald-950">{bestQuestion ? `${bestQuestion.shortLabel} · ${formatAverageScore(bestQuestion.average)}/5` : 'Sin datos'}</p>
                              </div>
                              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3">
                                <p className="text-[9px] font-black uppercase tracking-widest text-amber-700 mb-1">A revisar</p>
                                <p className="text-sm font-black text-amber-950">{worstQuestion ? `${worstQuestion.shortLabel} · ${formatAverageScore(worstQuestion.average)}/5` : 'Sin datos'}</p>
                              </div>
                            </div>

                            {stat.lowSignalCount > 0 && (
                              <div className="bg-rose-50 border border-rose-100 text-rose-800 rounded-2xl p-3 text-xs font-bold flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                {stat.lowSignalCount} evaluación(es) con media baja o alguna puntuación de 1-2. Conviene revisarlas en el TXT exportado.
                              </div>
                            )}

                            <div className="space-y-2">
                              {TEACHER_EVALUATION_QUESTIONS.map(question => {
                                const average = stat.questionAverages[question.key];
                                const pct = Number.isFinite(average) ? Math.max(Math.min((average / 5) * 100, 100), 0) : 0;
                                return (
                                  <div key={question.key}>
                                    <div className="flex items-center justify-between gap-3 mb-1">
                                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 truncate" title={question.label}>{question.shortLabel}</p>
                                      <p className="text-xs font-black text-slate-800">{formatAverageScore(average)}</p>
                                    </div>
                                    <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${Number.isFinite(average) && average < 3.5 ? 'bg-amber-400' : 'bg-slate-900'}`} style={{ width: `${pct}%` }}></div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-3 text-xs font-bold text-zinc-500 leading-relaxed">
                              El detalle completo de cada evaluación, incluidos comentarios, se consulta desde <strong className="text-slate-800">Exportar TXT</strong>. Así la tarjeta del profesor queda limpia aunque haya muchas respuestas.
                            </div>

                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {teacherPanelTab === 'payroll' && (
              <div className="space-y-6">
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-xs font-bold text-amber-900 leading-relaxed flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <p>Las vacaciones se calculan automáticamente a partir de las clases habituales que coinciden con las fechas marcadas como vacaciones y se suman al total liquidable. Los ajustes manuales no alteran los registros de asistencia.</p>
                  <button onClick={copyPayrollReport} className="bg-black text-white px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-zinc-800 flex items-center justify-center gap-2 shadow-md shrink-0">
                    <ClipboardList className="w-4 h-4"/> Copiar informe para el despacho
                  </button>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[950px]">
                      <thead>
                        <tr className="bg-zinc-50 text-[10px] uppercase tracking-widest text-zinc-400 border-b border-zinc-200">
                          <th className="p-4 font-black">Profesor</th>
                          <th className="p-4 font-black text-right">Horas Reales</th>
                          <th className="p-4 font-black text-right">Vacaciones</th>
                          <th className="p-4 font-black text-right">Ajustes</th>
                          <th className="p-4 font-black text-right">Total Liquidable</th>
                          <th className="p-4 font-black text-right">Acumulado (€)</th>
                          <th className="p-4 font-black text-center">Corregir</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm font-medium text-slate-700">
                        {teachersPayroll.length === 0 ? (
                          <tr><td colSpan="7" className="p-8 text-center text-zinc-400 italic">No hay profesores, registros, vacaciones ni ajustes para este mes.</td></tr>
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
                              <td className={`p-4 text-right font-black ${t.vacationHours > 0 ? 'text-purple-700' : 'text-zinc-400'}`}>{t.vacationHours.toFixed(2)} <span className="text-[10px] uppercase">h</span></td>
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

            {teacherPanelTab === 'availability' && (
              <div className="space-y-6">
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-800 mb-1">Disponibilidad declarada por el profesor</p>
                    <p className="text-xs font-bold text-blue-950 leading-relaxed">Cruza las franjas ofrecidas con las clases oficiales y temporales. Una clase hibernada o desplazada temporalmente sigue reservando su horario oficial.</p>
                  </div>
                  <select value={selectedAvailabilityTeacher} onChange={e => setSelectedAvailabilityTeacher(e.target.value)} className="w-full lg:w-72 bg-white border-2 border-blue-200 px-4 py-3 rounded-xl text-sm font-black uppercase tracking-widest text-slate-800 outline-none">
                    <option value="">Selecciona profesor...</option>
                    {allOfficialTeacherNames.map(name => <option key={normalizeTeacherKey(name)} value={name}>{name}</option>)}
                  </select>
                </div>

                {selectedAvailabilityTeacher && (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="bg-white border border-zinc-200 rounded-2xl p-4"><p className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Horas ofrecidas</p><p className="text-2xl font-black text-slate-900 mt-1">{teacherAvailabilityPanel.summary.offeredHours.toLocaleString('es-ES', { maximumFractionDigits: 2 })} h</p></div>
                      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4"><p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Clases activas</p><p className="text-2xl font-black text-emerald-950 mt-1">{teacherAvailabilityPanel.summary.activeClasses}</p></div>
                      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4"><p className="text-[9px] font-black uppercase tracking-widest text-amber-700">Reservadas / inactivas</p><p className="text-2xl font-black text-amber-950 mt-1">{teacherAvailabilityPanel.summary.inactiveClasses}</p></div>
                      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4"><p className="text-[9px] font-black uppercase tracking-widest text-indigo-700">Horas libres</p><p className="text-2xl font-black text-indigo-950 mt-1">{teacherAvailabilityPanel.summary.freeHours.toLocaleString('es-ES', { maximumFractionDigits: 2 })} h</p></div>
                    </div>

                    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-zinc-100">
                        <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Franjas ofrecidas</h3>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Filas de una hora o del tramo restante si la franja termina antes.</p>
                      </div>
                      {teacherAvailabilityPanel.rows.length === 0 ? (
                        <div className="p-10 text-center text-zinc-400 font-bold text-xs uppercase tracking-widest">Este profesor no ha registrado disponibilidad.</div>
                      ) : (
                        <div className="divide-y divide-zinc-100">
                          {teacherAvailabilityPanel.rows.map(row => {
                            const statusConfig = {
                              free: { label: 'Libre', style: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
                              active: { label: 'Ocupada activa', style: 'bg-slate-900 text-white border-slate-900' },
                              inactive: { label: 'Ocupada inactiva', style: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
                              reserved: { label: 'Reservada hasta regreso', style: 'bg-amber-50 text-amber-800 border-amber-200' },
                              temporary_active: { label: 'Ocupada temporal', style: 'bg-violet-100 text-violet-800 border-violet-200' },
                              temporary_inactive: { label: 'Temporal inactiva', style: 'bg-violet-50 text-violet-600 border-violet-100' }
                            }[row.status];
                            const classData = row.classData;
                            return (
                              <div key={row.key} className="p-3 md:p-4 grid grid-cols-1 md:grid-cols-[150px_190px_1fr_auto] gap-3 md:items-center hover:bg-zinc-50 transition-colors">
                                <div><p className="font-black text-sm text-slate-900">{getDayName(row.dayOfWeek)}</p><p className="text-xs font-bold text-zinc-400">{row.time}–{row.endTime}h</p></div>
                                <div><span className={`inline-flex px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest ${statusConfig.style}`}>{statusConfig.label}</span></div>
                                <div className="min-w-0">
                                  {classData ? (
                                    <><p className="text-sm font-black text-slate-900 truncate">{classData.subject || 'Clase'} · {getClassCenterName(classData)} · {getClassRoomName(classData)}</p><p className="text-[10px] font-bold text-zinc-400 mt-0.5">{row.activeCount}/{classData.capacity || '—'} activos{row.detail ? ` · ${row.detail}` : ''}</p></>
                                  ) : <p className="text-xs font-bold text-zinc-400">Disponible para abrir una clase.</p>}
                                </div>
                                <div>
                                  {classData ? (
                                    <button type="button" onClick={() => setViewClassModal(row.officialClass || classData)} className="w-full md:w-auto px-3 py-2 bg-zinc-100 text-zinc-700 hover:bg-black hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest">Abrir</button>
                                  ) : (
                                    <button type="button" onClick={() => openCreateClassFromAvailability(row)} className="w-full md:w-auto px-3 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1"><Plus className="w-3 h-3"/> Crear clase</button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {teacherAvailabilityPanel.outsideRows.length > 0 && (
                      <div className="bg-rose-50 border border-rose-100 rounded-2xl overflow-hidden">
                        <div className="p-4 border-b border-rose-100"><h3 className="text-sm font-black uppercase tracking-widest text-rose-900 flex items-center gap-2"><AlertTriangle className="w-4 h-4"/> Clases fuera de la disponibilidad declarada</h3></div>
                        <div className="divide-y divide-rose-100">
                          {teacherAvailabilityPanel.outsideRows.map(row => (
                            <div key={row.key} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div><p className="text-sm font-black text-rose-950">{getDayName(row.classData.dayOfWeek)} {row.classData.time}h · {row.classData.subject} · {row.classData.sede} ({row.classData.sala})</p><p className="text-[10px] font-bold text-rose-700 mt-1">{row.role === 'temporary' ? 'Horario temporal no cubierto por sus franjas.' : 'Horario oficial no cubierto por sus franjas.'}</p></div>
                              <button type="button" onClick={() => setViewClassModal(row.officialClass)} className="px-3 py-2 bg-white border border-rose-200 text-rose-800 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-rose-700 hover:text-white">Abrir clase</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}        
        
{/* --- 7. TABLÓN --- */}
        {activeTab === 'announcements' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="mb-6">
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Tablón</h2>
              <p className="text-zinc-500 font-medium text-sm">Publica avisos o encuestas para los alumnos.</p>
            </header>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 mb-8">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Tipo de publicación</label>
                  <select
                    value={newAnnounce.type || 'notice'}
                    onChange={e => {
                      const type = e.target.value;
                      setNewAnnounce(prev => ({ ...prev, type }));
                      if (type === 'poll' && announceEmailOptions.targetType === 'teachers') {
                        setAnnounceEmailOptions(prev => ({ ...prev, targetType: 'all', targetValue: '' }));
                      }
                    }}
                    className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-black outline-none font-black text-xs uppercase tracking-widest"
                  >
                    <option value="notice">Aviso</option>
                    <option value="poll">Encuesta</option>
                  </select>
                </div>
                <input type="text" placeholder={newAnnounce.type === 'poll' ? 'Pregunta de la encuesta...' : 'Titular impactante...'} value={newAnnounce.title} onChange={e => setNewAnnounce({...newAnnounce, title: e.target.value})} className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-black outline-none font-black text-sm" />
                <textarea placeholder={newAnnounce.type === 'poll' ? 'Explicación opcional...' : 'Detalles del aviso...'} value={newAnnounce.content} onChange={e => setNewAnnounce({...newAnnounce, content: e.target.value})} className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-black outline-none min-h-[100px] resize-y font-medium text-sm" />
                <input type="url" placeholder="URL opcional, por ejemplo https://..." value={newAnnounce.url} onChange={e => setNewAnnounce({...newAnnounce, url: e.target.value})} className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-black outline-none font-bold text-sm" />
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest -mt-2">Si añades URL, el alumno verá un botón clicable en el tablón.</p>
                {newAnnounce.type === 'poll' && (
                  <div className="bg-violet-50 border border-violet-100 rounded-2xl p-4 space-y-4">
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-violet-900 mb-2">Tipo de respuesta</label>
                        <select value={newAnnounce.pollAnswerType} onChange={e => setNewAnnounce(prev => ({ ...prev, pollAnswerType: e.target.value }))} disabled={editingAnnouncementId && getPollResponses(editingAnnouncementId).length > 0} className="w-full p-3 bg-white border border-violet-200 rounded-xl outline-none font-bold text-sm disabled:opacity-60">
                          <option value="single">Una sola opción</option>
                          <option value="multiple">Varias opciones</option>
                          <option value="text">Respuesta escrita</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-violet-900 mb-2">Fecha y hora límite</label>
                        <input type="datetime-local" value={newAnnounce.pollDeadline} onChange={e => setNewAnnounce(prev => ({ ...prev, pollDeadline: e.target.value }))} className="w-full p-3 bg-white border border-violet-200 rounded-xl outline-none font-bold text-sm" />
                      </div>
                    </div>
                    {newAnnounce.pollAnswerType !== 'text' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <label className="text-[10px] font-black uppercase tracking-widest text-violet-900">Opciones</label>
                          <button type="button" onClick={addPollOption} disabled={editingAnnouncementId && getPollResponses(editingAnnouncementId).length > 0} className="text-[10px] font-black uppercase tracking-widest text-violet-700 disabled:opacity-40"><Plus className="w-3 h-3 inline"/> Añadir opción</button>
                        </div>
                        {(newAnnounce.pollOptions || []).map((option, index) => (
                          <div key={option.id} className="flex gap-2">
                            <input value={option.label} onChange={e => updatePollOption(option.id, e.target.value)} disabled={editingAnnouncementId && getPollResponses(editingAnnouncementId).length > 0} placeholder={`Opción ${index + 1}`} className="flex-1 p-3 bg-white border border-violet-200 rounded-xl outline-none font-bold text-sm disabled:opacity-60" />
                            <button type="button" onClick={() => removePollOption(option.id)} disabled={(newAnnounce.pollOptions || []).length <= 2 || (editingAnnouncementId && getPollResponses(editingAnnouncementId).length > 0)} className="p-3 bg-white border border-violet-200 rounded-xl text-red-500 disabled:opacity-30"><Trash2 className="w-4 h-4"/></button>
                          </div>
                        ))}
                      </div>
                    )}
                    {editingAnnouncementId && getPollResponses(editingAnnouncementId).length > 0 && <p className="text-[10px] font-bold text-violet-700">Esta encuesta ya tiene respuestas: el tipo, las opciones y los destinatarios están bloqueados.</p>}
                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-violet-900 mb-2">Identificación</label>
                        <select value={newAnnounce.pollPrivacy} onChange={e => setNewAnnounce(prev => ({ ...prev, pollPrivacy: e.target.value }))} disabled={editingAnnouncementId && getPollResponses(editingAnnouncementId).length > 0} className="w-full p-3 bg-white border border-violet-200 rounded-xl outline-none font-bold text-sm disabled:opacity-60">
                          <option value="identified">Respuestas identificadas</option>
                          <option value="confidential">Respuestas confidenciales</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-violet-900 mb-2">Resultados para alumnos</label>
                        <select value={newAnnounce.pollResultsVisibility} onChange={e => setNewAnnounce(prev => ({ ...prev, pollResultsVisibility: e.target.value }))} className="w-full p-3 bg-white border border-violet-200 rounded-xl outline-none font-bold text-sm">
                          <option value="never">No mostrarlos</option>
                          <option value="after_response">Después de responder</option>
                          <option value="after_close">Cuando cierre la encuesta</option>
                        </select>
                      </div>
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input type="checkbox" checked={newAnnounce.pollAllowEdit !== false} onChange={e => setNewAnnounce(prev => ({ ...prev, pollAllowEdit: e.target.checked }))} className="w-4 h-4 accent-violet-600" />
                      <span className="text-xs font-black uppercase tracking-widest text-violet-900">Permitir modificar la respuesta hasta el cierre</span>
                    </label>
                  </div>
                )}
                <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4 space-y-4">
                  <div>
                    <span className="block text-xs font-black uppercase tracking-widest text-sky-900">Destinatarios en el Tablón</span>
                    <span className="block text-xs text-sky-700 font-semibold mt-1">La publicación aparecerá únicamente a los alumnos incluidos en el filtro.</span>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <select
                      value={announceEmailOptions.targetType}
                      onChange={e => setAnnounceEmailOptions({ ...announceEmailOptions, targetType: e.target.value, targetValue: '' })}
                      disabled={newAnnounce.type === 'poll' && editingAnnouncementId && getPollResponses(editingAnnouncementId).length > 0}
                      className="p-3 bg-white border border-sky-200 rounded-xl outline-none font-black text-xs uppercase tracking-widest text-sky-900"
                    >
                      <option value="all">Todos los alumnos con clase fija</option>
                      {newAnnounce.type !== 'poll' && <option value="teachers">Solo profesores</option>}
                      <option value="sede">Solo una sede</option>
                      <option value="instrumento">Solo un instrumento</option>
                      <option value="profesor">Solo alumnos de un profesor</option>
                    </select>
                    {!['all', 'teachers'].includes(announceEmailOptions.targetType) && (
                      <select
                        value={announceEmailOptions.targetValue}
                        onChange={e => setAnnounceEmailOptions({ ...announceEmailOptions, targetValue: e.target.value })}
                        disabled={newAnnounce.type === 'poll' && editingAnnouncementId && getPollResponses(editingAnnouncementId).length > 0}
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
                    {editingAnnouncementId ? <Save className="w-4 h-4"/> : <Megaphone className="w-4 h-4"/>} {editingAnnouncementId ? 'Guardar Cambios' : newAnnounce.type === 'poll' ? 'Publicar Encuesta' : 'Publicar Aviso'}
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
              {announcements.slice(0, visibleAnnouncementsCount).map(ann => {
                const isPoll = ann.type === 'poll';
                const participation = isPoll ? getPollParticipation(ann) : null;
                const optionCounts = isPoll ? (ann.pollOptions || []).reduce((acc, option) => {
                  acc[option.id] = participation.responses.filter(response => (response.selectedOptionIds || []).includes(option.id)).length;
                  return acc;
                }, {}) : {};
                const isExpanded = expandedPollResultsId === ann.id;
                return (
                  <div key={ann.id} className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${editingAnnouncementId === ann.id ? 'border-sky-300 ring-2 ring-sky-100' : isPoll ? 'border-violet-200' : 'border-zinc-200'}`}>
                    <div className="p-5 flex flex-col md:flex-row md:justify-between items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-2 mb-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${isPoll ? 'bg-violet-100 text-violet-800' : 'bg-zinc-100 text-zinc-600'}`}>{isPoll ? 'Encuesta' : 'Aviso'}</span>
                          {isPoll && <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${isPollClosed(ann) ? 'bg-zinc-100 text-zinc-600' : 'bg-emerald-100 text-emerald-700'}`}>{getPollStatusLabel(ann)}</span>}
                        </div>
                        <h4 className="font-black text-slate-800 text-md leading-tight">{ann.title}</h4>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">
                          {formatDateSpanish(ann.date)} {ann.updatedAt ? '· Editado' : ''}{isPoll && ann.pollDeadline ? ` · Hasta ${new Date(ann.pollDeadline).toLocaleString('es-ES')}` : ''}
                        </p>
                        {ann.content && <p className="text-sm text-zinc-600 line-clamp-2">{ann.content}</p>}
                        <div className="flex flex-wrap items-center gap-3 mt-2">
                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-sky-700 bg-sky-50 px-2 py-1 rounded-lg">
                            <Users className="w-3 h-3"/> {ann.audienceLabel || getAnnouncementTargetLabel({ targetType: ann.audienceType || 'all', targetValue: ann.audienceValue || '' })}
                          </span>
                          {isPoll && <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-violet-700"><PieChart className="w-3 h-3"/> {participation.responses.length} de {participation.audience.length} respuestas · {participation.percentage.toFixed(1)}%</span>}
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
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {isPoll && <button onClick={() => setExpandedPollResultsId(isExpanded ? null : ann.id)} className="px-3 py-2 bg-violet-50 text-violet-700 hover:bg-violet-600 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest">{isExpanded ? 'Ocultar' : 'Resultados'}</button>}
                        {isPoll && ann.pollStatus !== 'archived' && (isPollClosed(ann)
                          ? <button onClick={() => setPollStatus(ann, 'open')} className="px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest">Reabrir</button>
                          : <button onClick={() => setPollStatus(ann, 'closed')} className="px-3 py-2 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest">Cerrar</button>)}
                        {isPoll && ann.pollStatus !== 'archived' && <button onClick={() => setPollStatus(ann, 'archived')} className="px-3 py-2 bg-zinc-100 text-zinc-600 hover:bg-zinc-700 hover:text-white rounded-lg text-[9px] font-black uppercase tracking-widest">Archivar</button>}
                        <button onClick={() => startEditAnnouncement(ann)} className="p-2 bg-sky-50 text-sky-700 hover:bg-sky-600 hover:text-white rounded-lg transition-colors" title={isPoll ? 'Editar encuesta' : 'Editar aviso'}>
                          <Pencil className="w-4 h-4"/>
                        </button>
                        <button onClick={() => deleteAnnouncement(ann)} className="p-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg transition-colors" title={isPoll ? 'Borrar o archivar encuesta' : 'Borrar aviso'}>
                          <Trash2 className="w-4 h-4"/>
                        </button>
                      </div>
                    </div>
                    {isPoll && isExpanded && (
                      <div className="border-t border-violet-100 bg-violet-50/40 p-5 space-y-5">
                        <div className="grid sm:grid-cols-3 gap-3">
                          <div className="bg-white border border-violet-100 rounded-xl p-3"><span className="block text-xl font-black text-violet-700">{participation.responses.length}</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Han respondido</span></div>
                          <div className="bg-white border border-violet-100 rounded-xl p-3"><span className="block text-xl font-black text-slate-800">{participation.missing.length}</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Sin responder</span></div>
                          <div className="bg-white border border-violet-100 rounded-xl p-3"><span className="block text-xl font-black text-emerald-700">{participation.percentage.toFixed(1)}%</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Participación</span></div>
                        </div>

                        {ann.pollAnswerType !== 'text' ? (
                          <div className="space-y-3">
                            {(ann.pollOptions || []).map(option => {
                              const count = optionCounts[option.id] || 0;
                              const percentage = participation.responses.length ? (count / participation.responses.length) * 100 : 0;
                              return <div key={option.id} className="bg-white border border-violet-100 rounded-xl p-3"><div className="flex justify-between gap-3 text-xs font-bold"><span>{option.label}</span><span>{count} · {percentage.toFixed(1)}%</span></div><div className="h-2 bg-zinc-100 rounded-full mt-2 overflow-hidden"><div className="h-full bg-violet-600 rounded-full" style={{ width: `${Math.min(100, percentage)}%` }}/></div></div>;
                            })}
                            {ann.pollAnswerType === 'multiple' && <p className="text-[10px] font-bold text-zinc-500">En respuesta múltiple, los porcentajes pueden sumar más del 100%.</p>}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {participation.responses.length === 0 ? <p className="text-xs font-bold text-zinc-400">Todavía no hay respuestas escritas.</p> : participation.responses.map((response, index) => <div key={response.id} className="bg-white border border-violet-100 rounded-xl p-3"><p className="text-xs font-black text-slate-800 mb-1">{ann.pollPrivacy === 'confidential' ? `Respuesta ${index + 1}` : (response.studentName || 'Alumno')}</p><p className="text-sm text-zinc-600 whitespace-pre-wrap">{response.textAnswer}</p></div>)}
                          </div>
                        )}

                        {ann.pollPrivacy !== 'confidential' && ann.pollAnswerType !== 'text' && participation.responses.length > 0 && (
                          <div>
                            <h5 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Respuestas identificadas</h5>
                            <div className="space-y-2">{participation.responses.map(response => <div key={response.id} className="bg-white border border-violet-100 rounded-xl p-3 text-xs"><span className="font-black text-slate-800">{response.studentName || 'Alumno'}:</span> <span className="text-zinc-600">{(response.selectedOptionIds || []).map(optionId => (ann.pollOptions || []).find(option => option.id === optionId)?.label || optionId).join(', ')}</span></div>)}</div>
                          </div>
                        )}

                        <div>
                          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                            <h5 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">No han respondido ({participation.missing.length})</h5>
                            <div className="flex flex-wrap gap-2">
                              <button onClick={() => copyPollMissingEmails(ann)} className="px-3 py-2 bg-white border border-violet-200 text-violet-700 rounded-lg text-[9px] font-black uppercase tracking-widest"><ClipboardList className="w-3 h-3 inline"/> Copiar correos</button>
                              <button onClick={() => sendPollReminder(ann)} disabled={participation.missing.length === 0 || isPollClosed(ann)} className="px-3 py-2 bg-violet-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest disabled:opacity-40"><Mail className="w-3 h-3 inline"/> Enviar recordatorio</button>
                              <button onClick={() => exportPollResults(ann)} className="px-3 py-2 bg-white border border-violet-200 text-violet-700 rounded-lg text-[9px] font-black uppercase tracking-widest"><FileText className="w-3 h-3 inline"/> Exportar CSV</button>
                            </div>
                          </div>
                          {participation.missing.length === 0 ? <p className="text-xs font-bold text-emerald-700">Todos los destinatarios han respondido.</p> : <p className="text-xs text-zinc-600">{participation.missing.map(target => target.name || target.email || 'Alumno').join(', ')}</p>}
                          {ann.pollLastReminderSentAt && <p className="text-[10px] font-bold text-zinc-400 mt-2">Último recordatorio: {new Date(ann.pollLastReminderSentAt).toLocaleString('es-ES')} · {ann.pollLastReminderRecipientCount || 0} destinatarios.</p>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {visibleAnnouncementsCount < announcements.length && (
                <button onClick={() => setVisibleAnnouncementsCount(c => c + 10)} className="w-full py-3 rounded-xl border-2 border-dashed border-zinc-300 text-zinc-500 hover:text-slate-900 hover:border-slate-900 font-black uppercase tracking-widest text-xs transition-colors">
                  Cargar más avisos ({Math.min(10, announcements.length - visibleAnnouncementsCount)} más)
                </button>
              )}
            </div>
          </div>
        )}

        {/* --- 8. TALLERES --- */}
        {activeTab === 'workshops' && (
          <WorkshopAdminSection
            db={db}
            appId={appId}
            user={user}
            settings={settings}
            centers={centers}
            students={students}
            allClasses={allClasses}
            registrations={workshopRegistrations}
          />
        )}

        {/* --- 9. GAMIFICACIÓN (Rankings en Cascada) --- */}
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

            {/* PREMIOS EN JUEGO */}
            <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm mt-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-700 mb-2 flex items-center gap-2"><Gift className="w-4 h-4"/> Premios en juego</h3>
              <p className="text-xs font-bold text-zinc-400 mb-4">Estos premios se harán públicos automáticamente en el Tablón cuando cierres el periodo correspondiente.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <textarea value={settings.prizes?.mensual || ''} onChange={e => setSettings({...settings, prizes: {...settings.prizes, mensual: e.target.value}})} placeholder="Premio mensual..." className="w-full p-3 bg-emerald-50 border border-emerald-200 rounded-xl focus:border-emerald-500 outline-none text-xs font-medium resize-y" />
                <textarea value={settings.prizes?.trimestral || ''} onChange={e => setSettings({...settings, prizes: {...settings.prizes, trimestral: e.target.value}})} placeholder="Premio Trimestral..." className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-black outline-none text-xs font-medium resize-y" />
                <textarea value={settings.prizes?.anual || ''} onChange={e => setSettings({...settings, prizes: {...settings.prizes, anual: e.target.value}})} placeholder="Gran Premio Anual..." className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-black outline-none text-xs font-medium resize-y" />
              </div>
              <button onClick={() => saveGlobalSettings(settings)} className="bg-zinc-900 hover:bg-black text-white px-4 py-2 rounded-lg font-black uppercase tracking-widest text-[10px] transition-colors">Guardar premios</button>
            </div>
          </div>
        )}

        {/* --- 10. CONFIGURACIÓN COMPLETA (TARIFA, FIJOS E INSTRUMENTOS) --- */}
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
                  {centers.map(center => (
                    <div key={center.id} className="flex items-center justify-between bg-blue-50/60 p-3 rounded-xl border border-blue-100">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-blue-900">Sede {center.name}</p>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-blue-500">{center.status === 'active' ? 'Activa' : center.status === 'draft' ? 'Borrador' : 'Inactiva'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="number" min="0" value={center.fixedMonthlyCost || 0} onChange={e => updateCenterQuickField(center.id, 'fixedMonthlyCost', e.target.value)} className="text-sm font-black w-24 p-2 border border-blue-200 rounded-lg outline-none focus:border-blue-500 text-right text-blue-900" />
                        <span className="text-xs font-bold text-blue-600">€</span>
                      </div>
                    </div>
                  ))}
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

            {/* SEDES Y ESPACIOS DINÁMICOS */}
            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm mt-8">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 flex items-center gap-2"><MapPin className="w-5 h-5 text-emerald-600"/> Sedes y espacios</h3>
                  <p className="text-xs text-zinc-500 font-medium mt-2">Cada sede alimenta automáticamente clases, Arquitecto, BI, Talleres, Mitobox, avisos y calendario. Las sedes históricas se inactivan; no se eliminan.</p>
                </div>
                <button type="button" onClick={openNewCenterEditor} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 shrink-0"><PlusCircle className="w-4 h-4"/> Añadir sede</button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {centers.map(center => {
                  const activeRoomsCount = (center.rooms || []).filter(room => room.active !== false).length;
                  return (
                    <article key={center.id} className={`rounded-2xl border p-5 ${center.status === 'active' ? 'bg-emerald-50/30 border-emerald-200' : center.status === 'draft' ? 'bg-amber-50/30 border-amber-200' : 'bg-zinc-50 border-zinc-200'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${center.status === 'active' ? 'bg-emerald-100 text-emerald-700' : center.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-zinc-200 text-zinc-600'}`}>{center.status === 'active' ? 'Activa' : center.status === 'draft' ? 'Borrador' : 'Inactiva'}</span>
                            <span className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-white border border-zinc-200 text-zinc-500">{center.type === 'franchise' ? 'Franquiciada' : 'Propia'}</span>
                          </div>
                          <h4 className="text-xl font-black uppercase tracking-tight text-slate-900">{center.name}</h4>
                          <p className="text-[10px] font-bold text-zinc-400 mt-1">ID estable: {center.id}</p>
                        </div>
                        <button type="button" onClick={() => openCenterEditor(center)} className="p-2.5 bg-white border border-zinc-200 text-zinc-600 hover:bg-black hover:text-white rounded-xl transition-colors" title="Editar sede"><Pencil className="w-4 h-4"/></button>
                      </div>
                      <div className="grid grid-cols-3 gap-2 mt-5">
                        <div className="bg-white border border-zinc-100 rounded-xl p-3"><span className="block text-xl font-black text-slate-900">{activeRoomsCount}</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Salas activas</span></div>
                        <div className="bg-white border border-zinc-100 rounded-xl p-3"><span className="block text-xl font-black text-slate-900">{(center.holidays || []).length}</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Festivos locales</span></div>
                        <div className="bg-white border border-zinc-100 rounded-xl p-3"><span className="block text-xl font-black text-slate-900">{Number(center.fixedMonthlyCost || 0).toLocaleString('es-ES')}€</span><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Gasto fijo</span></div>
                      </div>
                      {(center.address || center.phone || center.email) && <p className="text-xs font-semibold text-zinc-500 mt-4 leading-relaxed">{[center.address, center.phone, center.email].filter(Boolean).join(' · ')}</p>}
                    </article>
                  );
                })}
              </div>

              {centerEditor && (
                <div className="mt-6 rounded-3xl border-2 border-emerald-200 bg-emerald-50/30 overflow-hidden">
                  <div className="p-5 bg-white border-b border-emerald-100 flex items-start justify-between gap-4">
                    <div><h4 className="font-black uppercase tracking-tight text-slate-900">{centerEditor.id ? `Editar ${centerEditor.name}` : 'Nueva sede'}</h4><p className="text-xs font-semibold text-zinc-500 mt-1">El identificador se crea al guardar y no cambia aunque renombres la sede.</p></div>
                    <button type="button" onClick={() => setCenterEditor(null)} className="p-2 bg-zinc-100 text-zinc-500 hover:text-red-600 rounded-lg"><X className="w-4 h-4"/></button>
                  </div>

                  <div className="p-5 md:p-7 space-y-7">
                    <section>
                      <h5 className="text-[10px] font-black uppercase tracking-widest text-emerald-800 mb-3">Identidad y estado</h5>
                      <div className="grid md:grid-cols-3 gap-3">
                        <div className="md:col-span-2"><label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1">Nombre de la sede *</label><input value={centerEditor.name || ''} onChange={e => setCenterEditor({...centerEditor, name: e.target.value})} placeholder="Ej. Vila-seca" className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-emerald-500"/></div>
                        <div><label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1">Estado</label><select value={centerEditor.status || 'draft'} onChange={e => setCenterEditor({...centerEditor, status: e.target.value})} className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none"><option value="draft">Borrador</option><option value="active">Activa</option><option value="inactive">Inactiva</option></select></div>
                        <div><label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1">Tipo</label><select value={centerEditor.type || 'owned'} onChange={e => setCenterEditor({...centerEditor, type: e.target.value})} className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none"><option value="owned">Propia</option><option value="franchise">Franquiciada</option></select></div>
                        <div className="md:col-span-2"><label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1">Operador interno</label><input value={centerEditor.operatorId || ''} onChange={e => setCenterEditor({...centerEditor, operatorId: e.target.value})} placeholder="los-mitos o identificador del franquiciado" className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none"/></div>
                      </div>
                    </section>

                    <section className="border-t border-emerald-100 pt-6">
                      <h5 className="text-[10px] font-black uppercase tracking-widest text-emerald-800 mb-3">Contacto y local</h5>
                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="md:col-span-2"><label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1">Dirección</label><input value={centerEditor.address || ''} onChange={e => setCenterEditor({...centerEditor, address: e.target.value})} className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none"/></div>
                        <div><label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1">Teléfono</label><input value={centerEditor.phone || ''} onChange={e => setCenterEditor({...centerEditor, phone: e.target.value})} className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none"/></div>
                        <div><label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1">Correo</label><input type="email" value={centerEditor.email || ''} onChange={e => setCenterEditor({...centerEditor, email: e.target.value})} className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none"/></div>
                        <div><label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1">Gasto fijo mensual</label><div className="relative"><input type="number" min="0" value={centerEditor.fixedMonthlyCost || 0} onChange={e => setCenterEditor({...centerEditor, fixedMonthlyCost: e.target.value})} className="w-full p-3 pr-10 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none"/><span className="absolute right-4 top-3 font-black text-zinc-400">€</span></div></div>
                        <div><label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1">Enlace de reseñas</label><input type="url" value={centerEditor.reviewUrl || ''} onChange={e => setCenterEditor({...centerEditor, reviewUrl: e.target.value})} placeholder="https://..." className="w-full p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none"/></div>
                      </div>
                    </section>

                    <section className="border-t border-emerald-100 pt-6">
                      <div className="flex items-center justify-between gap-3 mb-3"><div><h5 className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Salas y aforos</h5><p className="text-[10px] font-semibold text-zinc-500 mt-1">Mitobox solo usará las salas marcadas para reserva.</p></div><button type="button" onClick={addCenterEditorRoom} className="px-3 py-2 bg-emerald-100 text-emerald-800 rounded-lg text-[9px] font-black uppercase tracking-widest"><Plus className="w-3 h-3 inline"/> Añadir sala</button></div>
                      <div className="space-y-3">
                        {(centerEditor.rooms || []).map((room, roomIndex) => {
                          const roomKey = room.id || room.localId;
                          return <div key={roomKey} className="grid grid-cols-1 md:grid-cols-[1fr_120px_auto_auto_auto] gap-3 items-end bg-white border border-emerald-100 p-4 rounded-2xl"><div><label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1">Nombre</label><input value={room.name || ''} onChange={e => updateCenterEditorRoom(roomKey, { name: e.target.value })} className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl font-bold text-sm outline-none"/></div><div><label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1">Aforo</label><input type="number" min="1" value={room.capacity || ''} onChange={e => updateCenterEditorRoom(roomKey, { capacity: e.target.value })} className="w-full p-3 bg-zinc-50 border border-zinc-200 rounded-xl font-bold text-sm outline-none"/></div><label className="flex items-center gap-2 h-[46px] text-[10px] font-black uppercase tracking-widest text-zinc-600"><input type="checkbox" checked={room.mitoboxEnabled !== false} onChange={e => updateCenterEditorRoom(roomKey, { mitoboxEnabled: e.target.checked })} className="accent-blue-600"/> Mitobox</label><label className="flex items-center gap-2 h-[46px] text-[10px] font-black uppercase tracking-widest text-zinc-600"><input type="checkbox" checked={room.active !== false} onChange={e => updateCenterEditorRoom(roomKey, { active: e.target.checked })} className="accent-emerald-600"/> Activa</label>{!room.id ? <button type="button" onClick={() => removeUnsavedCenterRoom(roomKey)} disabled={(centerEditor.rooms || []).length === 1} className="h-[46px] p-3 bg-red-50 text-red-600 rounded-xl disabled:opacity-30" title="Quitar sala nueva"><Trash2 className="w-4 h-4"/></button> : <span className="h-[46px] flex items-center text-[9px] font-bold uppercase tracking-widest text-zinc-400">ID {room.id}</span>}</div>;
                        })}
                      </div>
                    </section>

                    <section className="border-t border-emerald-100 pt-6">
                      <h5 className="text-[10px] font-black uppercase tracking-widest text-emerald-800 mb-3">Festivos locales</h5>
                      <div className="flex gap-2"><input id="centerEditorHolidayInput" type="date" className="flex-1 p-3 bg-white border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none"/><button type="button" onClick={() => { const input = document.getElementById('centerEditorHolidayInput'); addHolidayToCenterEditor(input?.value); if (input) input.value = ''; }} className="px-5 py-3 bg-emerald-600 text-white rounded-xl"><Plus className="w-4 h-4"/></button></div>
                      <div className="flex flex-wrap gap-2 mt-3">{(centerEditor.holidays || []).sort().map(date => <span key={date} className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-emerald-100 rounded-lg text-xs font-bold text-emerald-900">{formatDateSpanish(date)}<button type="button" onClick={() => setCenterEditor({...centerEditor, holidays: centerEditor.holidays.filter(item => item !== date)})} className="text-red-500"><X className="w-3 h-3"/></button></span>)}</div>
                    </section>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <button type="button" onClick={saveCenterEditor} disabled={savingCenter} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-4 rounded-xl font-black uppercase tracking-widest text-[10px] disabled:opacity-50 flex items-center justify-center gap-2"><Save className="w-4 h-4"/>{savingCenter ? 'Guardando...' : 'Guardar sede'}</button>
                      <button type="button" onClick={() => setCenterEditor(null)} disabled={savingCenter} className="px-6 py-4 bg-white border border-zinc-200 text-zinc-600 rounded-xl font-black uppercase tracking-widest text-[10px]">Cancelar</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* CALENDARIO ESCOLAR */}
            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm mt-8">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 mb-4 flex items-center gap-2"><Calendar className="w-5 h-5 text-black"/> Calendario Escolar</h3>
              <div className="flex flex-col sm:flex-row gap-2 mb-6">
                <input id="adminDateInput" type="date" className="flex-1 p-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none font-bold text-sm" />
                <select id="adminDateType" className="flex-[2] p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-black uppercase">
                  <option value="vacaciones">Vacaciones (Todas las sedes)</option>
                  <option value="festivos">Festivo (Todas las sedes)</option>
                  {centers.map(center => <option key={center.id} value={`center:${center.id}`}>Festivo local · {center.name}</option>)}
                </select>
                <button onClick={() => { const d = document.getElementById('adminDateInput').value; const t = document.getElementById('adminDateType').value; if (!d) return; if (t.startsWith('center:')) { const centerId = t.slice(7); const nextCenters = centers.map(center => center.id === centerId ? {...center, holidays: uniqueStrings([...(center.holidays || []), d]).sort()} : center); const s = {...settings, centers: nextCenters}; setSettings(s); saveGlobalSettings(s); } else { const arr = settings[t] || []; if (!arr.includes(d)) { const s = {...settings, [t]: [...arr, d]}; setSettings(s); saveGlobalSettings(s); } } }} className="bg-black text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] hover:bg-zinc-800"><Plus className="w-4 h-4 inline"/></button>
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
                {centers.map(center => (
                  <div key={center.id}>
                    <h4 className="font-black text-blue-600 uppercase tracking-widest text-[10px] mb-2 flex items-center gap-1"><MapPin className="w-3 h-3"/> {center.name}</h4>
                    <div className="space-y-1">
                      {(center.holidays || []).sort().map(f => (
                        <div key={f} className="flex justify-between items-center p-2 bg-blue-50 rounded-lg text-xs font-bold text-blue-900">{formatDateSpanish(f)} <button onClick={() => { const nextCenters = centers.map(item => item.id === center.id ? {...item, holidays: (item.holidays || []).filter(date => date !== f)} : item); const s = {...settings, centers: nextCenters}; setSettings(s); saveGlobalSettings(s); }} className="p-1 hover:bg-blue-100 rounded transition-colors"><Trash2 className="w-3 h-3 text-blue-500 hover:text-red-500"/></button></div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm mt-8">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 mb-4 flex items-center gap-2"><User className="w-5 h-5 text-black"/> Plantilla de Profesores</h3>
              <div className="flex gap-2 mb-4">
                <input id="adminTeacherInput" type="text" placeholder="Ej: Tano" className="flex-1 p-3 text-sm bg-zinc-50 border border-zinc-200 rounded-xl font-bold" />
                <button onClick={() => { const input = document.getElementById('adminTeacherInput'); const val = cleanTeacherDisplayName(input?.value); if (!val) return; if ((settings.teachersList || []).some(name => isSameTeacher(name, val))) { alert(`${getOfficialTeacherName(val, val)} ya figura en la plantilla. No se añadirá otra variante del mismo nombre.`); return; } const s = {...settings, teachersList: [...(settings.teachersList||[]), val]}; setSettings(s); saveGlobalSettings(s); if (input) input.value = ''; }} className="bg-black text-white px-6 rounded-xl font-black uppercase text-[10px] hover:bg-zinc-800"><Plus className="w-4 h-4"/></button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                {configuredTeacherNames.map((t) => {
                  const matchingColorKey = Object.keys(settings.teacherColors || {}).find(name => isSameTeacher(name, t));
                  const currentColor = (matchingColorKey && settings.teacherColors?.[matchingColorKey]) || getFallbackTeacherColor(t);
                  return (
                    <div key={normalizeTeacherKey(t)} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 p-3 text-xs bg-zinc-50 border border-zinc-100 rounded-xl">
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
                            const nextColors = { ...(settings.teacherColors || {}) };
                            Object.keys(nextColors).filter(name => isSameTeacher(name, t)).forEach(name => delete nextColors[name]);
                            nextColors[t] = e.target.value;
                            const s = {
                              ...settings,
                              teacherColors: nextColors
                            };
                            setSettings(s);
                          }}
                          className="w-10 h-8 p-0 border border-zinc-200 rounded-lg bg-white cursor-pointer"
                          title={`Color de ${t}`}
                        />
                        <button onClick={() => {
                          const nextColors = { ...(settings.teacherColors || {}) };
                          Object.keys(nextColors).filter(name => isSameTeacher(name, t)).forEach(name => delete nextColors[name]);
                          const s = { ...settings, teacherColors: nextColors };
                          setSettings(s);
                        }} className="text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 p-1.5 rounded transition-colors" title="Restaurar color automático">
                          <History className="w-4 h-4"/>
                        </button>
                        <button onClick={() => {
                          const nextColors = { ...(settings.teacherColors || {}) };
                          Object.keys(nextColors).filter(name => isSameTeacher(name, t)).forEach(name => delete nextColors[name]);
                          const s = {
                            ...settings,
                            teachersList: settings.teachersList.filter(name => !isSameTeacher(name, t)),
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
                <button onClick={() => { const cleanedSettings = { ...settings, teachersList: configuredTeacherNames }; setSettings(cleanedSettings); saveGlobalSettings(cleanedSettings); }} className="bg-zinc-900 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-colors flex items-center justify-center gap-2"><Save className="w-4 h-4"/> Guardar colores</button>
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

          </>
        )}

      </main>
    </div>
  );
}
