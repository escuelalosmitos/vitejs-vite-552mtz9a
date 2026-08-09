import React, { useState, useEffect, useMemo } from 'react';
import { Music, LogOut, Calendar, Ticket, Info, MessageSquare, LayoutGrid, AlertCircle, CheckCircle, User, ArrowRight, MapPin, X, Clock, FileText, Check, Bell, Megaphone, Snowflake, RefreshCcw, PlusCircle, UserMinus, Send, Mail, Sun, Sparkles, MonitorPlay, DoorOpen, Star, Trophy, Timer, Globe, Camera, ThumbsUp, Video, MessageCircle, Link as LinkIcon, BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { collection, query, where, getDocs, getDoc, doc, setDoc, updateDoc, collectionGroup, onSnapshot, runTransaction } from 'firebase/firestore';

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz_MEKpKnv-L1g0e1khYf45nXCQKuUx6ZP3-bYwypTyrYzWadR4yzDd4ambExbQquvo/exec";
const ADMIN_GESTION_EMAIL = "gestiones@escuelalosmitos.com";
const ADMIN_COPY_GESTION_TYPES = new Set(["baja", "mantenimiento", "reactivar_plaza", "ampliar_clases", "cambio_horario", "alta_mitoverso", "alta_mitobox"]);
const SUPPORT_EMAIL = "soporte@escuelalosmitos.com";
const INSTRUMENTOS = ["Guitarra", "Canto", "Teclado", "Batería", "Bajo", "Ukelele", "Armónica", "Combo", "Sensibilización", "Violín"];

import { TRIVIA_QUESTIONS } from './triviaQuestions';

const getDayOfYear = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
};

const getDayName = (dayIndex) => {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[dayIndex];
};

const getDayOfWeek = (dateString) => {
  if (!dateString) return 0;
  const [year, month, day] = dateString.split('-');
  return new Date(year, month - 1, day).getDay();
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

const formatDateSpanish = (dateString) => {
  if (!dateString) return '';
  return dateString.split('-').reverse().join('/');
};

const capitalizeFirst = (value = '') => value ? `${value.charAt(0).toLocaleUpperCase('es')}${value.slice(1)}` : '';

const shiftMonthValue = (monthValue = '', amount = 0) => {
  const [year, month] = String(monthValue).split('-').map(Number);
  if (!year || !month) return '';
  const shifted = new Date(year, month - 1 + amount, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
};

const formatCalendarMonthLabel = (monthValue = '') => {
  const [year, month] = String(monthValue).split('-').map(Number);
  if (!year || !month) return '';
  return capitalizeFirst(new Date(year, month - 1, 1).toLocaleDateString('es-ES', {
    month: 'long',
    year: 'numeric'
  }));
};

const formatCalendarDateLabel = (dateString = '') => {
  const [year, month, day] = String(dateString).split('-').map(Number);
  if (!year || !month || !day) return formatDateSpanish(dateString);
  return capitalizeFirst(new Date(year, month - 1, day).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }));
};

const formatEuro = (value = 0) => `${Number(value || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`;

const getCurrentMonthProration = (monthlyFee = 0, baseDate = new Date()) => {
  const year = baseDate.getFullYear();
  const monthIndex = baseDate.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const currentDay = baseDate.getDate();
  const billableDays = Math.max(daysInMonth - currentDay + 1, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const amount = Number(((Number(monthlyFee || 0) * billableDays) / daysInMonth).toFixed(2));

  return {
    amount,
    billableDays,
    daysInMonth,
    from: formatLocalDateString(baseDate),
    until: formatLocalDateString(lastDay),
    monthLabel: baseDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  };
};

const EXTRA_SERVICES = {
  mitoverso: {
    key: 'mitoverso',
    type: 'alta_mitoverso',
    name: 'Mitoverso',
    title: 'Solicitud de alta en Mitoverso',
    monthlyFee: 15,
    Icon: MonitorPlay,
    accent: 'indigo',
    shortDescription: 'Cursos online, audios y recursos exclusivos.',
    adminAction: 'Activar acceso manual en Classroom/Mitoverso y preparar la domiciliación en Tadosi.'
  },
  mitobox: {
    key: 'mitobox',
    type: 'alta_mitobox',
    name: 'Mitobox',
    title: 'Solicitud de alta en Mitobox',
    monthlyFee: 35,
    Icon: DoorOpen,
    accent: 'blue',
    shortDescription: 'Tarifa plana para reservar aulas libres y venir a practicar.',
    adminAction: 'Activar tarifa plana Mitobox y preparar la domiciliación en Tadosi.'
  }
};

const getExtraServiceConfig = (serviceKey = '') => EXTRA_SERVICES[serviceKey] || null;

const getSafeAnnouncementUrl = (url = '') => {
  const cleanUrl = String(url || '').trim();
  if (!/^https?:\/\//i.test(cleanUrl)) return '';
  return cleanUrl;
};

const WORKSHOP_REGISTRATION_STATUS_LABELS = {
  pending: 'Pendiente de revisión',
  confirmed: 'Inscripción confirmada',
  waitlist: 'En lista de espera',
  rejected: 'Solicitud rechazada',
  cancelled: 'Inscripción cancelada'
};

const WORKSHOP_REGISTRATION_STATUS_STYLE = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200',
  confirmed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  waitlist: 'bg-blue-100 text-blue-800 border-blue-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
  cancelled: 'bg-zinc-100 text-zinc-600 border-zinc-200'
};

const CALL_RESPONSE_STATUS_LABELS = {
  pending: 'Pendiente de revisión',
  confirmed: 'Participación confirmada',
  waitlist: 'En reserva',
  rejected: 'No seleccionado',
  withdrawn: 'Candidatura retirada'
};

const CALL_RESPONSE_STATUS_STYLE = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  waitlist: 'bg-sky-50 text-sky-800 border-sky-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  withdrawn: 'bg-zinc-100 text-zinc-600 border-zinc-200'
};

const getLocalDateTimeString = (date = new Date()) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - (offset * 60000)).toISOString().slice(0, 16);
};

const formatWorkshopDate = (dateString = '') => {
  if (!dateString) return '';
  const [year, month, day] = String(dateString).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return dateString;
  return new Date(year, month - 1, day).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

const formatWorkshopDeadline = (dateTimeString = '') => {
  if (!dateTimeString) return '';
  const date = new Date(dateTimeString);
  if (Number.isNaN(date.getTime())) return dateTimeString;
  return date.toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
};

const getWorkshopLocationLabel = (workshop = {}) => {
  if (workshop.locationType === 'both') return 'Todas las sedes';
  if (workshop.locationType === 'online') return 'Online';
  if (workshop.locationType === 'other') return workshop.externalLocation || 'Lugar por determinar';
  return `${workshop.locationType || 'Sede por determinar'}${workshop.room ? ` · ${workshop.room}` : ''}`;
};

const getWorkshopLevelLabel = (workshop = {}) => ({
  all: 'Todos los niveles',
  beginner: 'Iniciación',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
  custom: workshop.customLevel || 'Nivel específico'
}[workshop.level || 'all']);

const buildWorkshopRegistrationId = (workshopId = '', studentId = '') => `workshop_${String(workshopId).replace(/[^a-zA-Z0-9_-]/g, '_')}_${String(studentId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;

const LEGACY_REVIEW_URLS = {
  Tarragona: 'https://g.page/r/CbRESEBKdg37EBM/review',
  Reus: 'https://g.page/r/CaVY9dFy-cmjEBM/review'
};

const LEGACY_CENTER_NAMES = ['Tarragona', 'Reus'];
const LEGACY_ROOM_NAMES = ['Sala 1', 'Sala 2', 'Sala 3'];

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

const uniqueStrings = (values = []) => [...new Set((values || [])
  .map(value => String(value || '').trim())
  .filter(Boolean))];

const DEFAULT_CENTERS = LEGACY_CENTER_NAMES.map(name => ({
  id: normalizeConfigId(name, 'sede'),
  name,
  aliases: [],
  status: 'active',
  reviewUrl: LEGACY_REVIEW_URLS[name] || '',
  holidays: [],
  rooms: LEGACY_ROOM_NAMES.map(roomName => ({
    id: normalizeConfigId(roomName, 'sala'),
    name: roomName,
    aliases: [],
    mitoboxEnabled: true,
    active: true
  }))
}));

const getLegacyCenterHolidays = (center = {}, legacySettings = {}) => {
  const centerId = normalizeConfigId(center.id || center.name, 'sede');
  if (centerId === 'tarragona') return legacySettings.festivosTarragona || [];
  if (centerId === 'reus') return legacySettings.festivosReus || [];
  return legacySettings.centerHolidays?.[centerId] || [];
};

const normalizeCenters = (rawCenters = [], legacySettings = {}) => {
  const hasConfiguredCenters = Array.isArray(rawCenters) && rawCenters.length > 0;
  const source = hasConfiguredCenters ? rawCenters : DEFAULT_CENTERS;

  return source.map((rawCenter, centerIndex) => {
    const name = String(rawCenter?.name || LEGACY_CENTER_NAMES[centerIndex] || `Sede ${centerIndex + 1}`).trim();
    const id = normalizeConfigId(rawCenter?.id || name, `sede-${centerIndex + 1}`);
    const rawRooms = Array.isArray(rawCenter?.rooms) && rawCenter.rooms.length > 0
      ? rawCenter.rooms
      : LEGACY_ROOM_NAMES.map(roomName => ({ name: roomName }));

    return {
      ...rawCenter,
      id,
      name,
      aliases: uniqueStrings(rawCenter?.aliases || []),
      status: ['draft', 'active', 'inactive'].includes(rawCenter?.status) ? rawCenter.status : 'active',
      reviewUrl: String(rawCenter?.reviewUrl || '').trim(),
      holidays: uniqueStrings(
        hasConfiguredCenters
          ? (rawCenter?.holidays || legacySettings.centerHolidays?.[id] || [])
          : getLegacyCenterHolidays({ id, name }, legacySettings)
      ),
      rooms: rawRooms.map((rawRoom, roomIndex) => ({
        ...rawRoom,
        id: normalizeConfigId(rawRoom?.id || rawRoom?.name, `sala-${roomIndex + 1}`),
        name: String(rawRoom?.name || `Sala ${roomIndex + 1}`).trim(),
        aliases: uniqueStrings(rawRoom?.aliases || []),
        mitoboxEnabled: rawRoom?.mitoboxEnabled !== false,
        active: rawRoom?.active !== false
      }))
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

const SOCIAL_LINKS = [
  { id: 'instagram', label: 'Instagram', url: 'https://instagram.com/losmitosescuelademusica/', Icon: Camera, hover: 'hover:border-pink-500', iconHover: 'group-hover:text-pink-500' },
  { id: 'facebook', label: 'Facebook', url: 'https://www.facebook.com/Escuelalosmitos', Icon: ThumbsUp, hover: 'hover:border-blue-600', iconHover: 'group-hover:text-blue-600' },
  { id: 'youtube', label: 'YouTube', url: 'https://www.youtube.com/@escuelalosmitos', Icon: Video, hover: 'hover:border-red-500', iconHover: 'group-hover:text-red-500' }
];

const CLASS_RESOURCE_TYPES = [
  { value: 'pdf', label: 'PDF' },
  { value: 'drive_folder', label: 'Carpeta Drive' },
  { value: 'video', label: 'Vídeo' },
  { value: 'audio', label: 'Audio' },
  { value: 'document', label: 'Documento' },
  { value: 'link', label: 'Enlace' },
  { value: 'other', label: 'Otro' }
];

const getClassResourceTypeLabel = (type = 'link') => CLASS_RESOURCE_TYPES.find(t => t.value === type)?.label || 'Recurso';

const TEACHER_EVALUATION_QUESTIONS = [
  { key: 'clarity', label: 'El profesor explica de forma clara y comprensible.' },
  { key: 'knowledge', label: 'Percibo que el profesor domina su instrumento y el contenido que imparte.' },
  { key: 'adaptation', label: 'El profesor adapta la clase a mi nivel y necesidades.' },
  { key: 'organization', label: 'La clase está bien organizada y se aprovecha el tiempo.' },
  { key: 'motivation', label: 'El profesor me motiva y me anima a mejorar.' },
  { key: 'progress', label: 'Siento que he mejorado durante el último trimestre.' },
  { key: 'homeworkClarity', label: 'Sé qué tengo que practicar en casa.' },
  { key: 'resourcesUseful', label: 'Los materiales o recursos me resultan útiles para practicar.' },
  { key: 'recommendation', label: 'Recomendaría este profesor a otro alumno.' }
];

const TEACHER_EVALUATION_SCALE = [1, 2, 3, 4, 5];

const getEmptyTeacherEvaluationRatings = () => TEACHER_EVALUATION_QUESTIONS.reduce((acc, question) => ({
  ...acc,
  [question.key]: 0
}), {});

const getTeacherEvaluationPeriod = (dateStr = '') => {
  const [yearRaw, monthRaw] = String(dateStr || '').split('-').map(Number);
  const year = Number.isFinite(yearRaw) ? yearRaw : new Date().getFullYear();
  const month = Number.isFinite(monthRaw) ? monthRaw : new Date().getMonth() + 1;
  const quarter = Math.max(1, Math.min(4, Math.ceil(month / 3)));
  return `${year}-T${quarter}`;
};

const sanitizeTeacherEvaluationDocPart = (value = '') => String(value || '')
  .trim()
  .replace(/[\/#?\[\]]/g, '_')
  .replace(/\s+/g, '_') || 'sin-dato';

const buildTeacherEvaluationId = ({ studentId = '', classId = '', period = '' } = {}) => [
  'eval',
  sanitizeTeacherEvaluationDocPart(studentId),
  sanitizeTeacherEvaluationDocPart(classId || 'clase'),
  sanitizeTeacherEvaluationDocPart(period)
].join('_');

const isPunctualClass = (clase = {}) => Boolean(clase?.date) || clase?.isRecurring === false;

const isAssumedSubstitutionClass = (clase = {}) => Boolean(
  clase?.sourceSubstitutionId
  || String(clase?.id || clase?.docId || '').startsWith('assumed-')
);

const isFixedClassStudent = (studentEntry = {}) => !(
  studentEntry?.isRecovery === true ||
  studentEntry?.isTemporary === true ||
  studentEntry?.isPunctual === true ||
  studentEntry?.isTemporaryRelocation === true ||
  Boolean(studentEntry?.temporaryRelocationId) ||
  studentEntry?.type === 'recovery' ||
  studentEntry?.status === 'recovery'
);

const TEMPORARY_RELOCATION_FINAL_STATUSES = new Set([
  'cancelled',
  'cancelada',
  'expired',
  'finalizada'
]);

const normalizeTemporaryRelocationDate = (value = '') => {
  if (!value) return '';
  const dateValue = typeof value?.toDate === 'function'
    ? value.toDate()
    : (value instanceof Date ? value : null);

  if (dateValue && !Number.isNaN(dateValue.getTime())) {
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, '0');
    const day = String(dateValue.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const cleanValue = String(value || '').trim();
  const isoMatch = cleanValue.match(/^\d{4}-\d{2}-\d{2}/);
  return isoMatch ? isoMatch[0] : cleanValue.slice(0, 10);
};

const isTemporaryRelocationActiveForDate = (relocation = {}, dateStr = '') => {
  if (!relocation || TEMPORARY_RELOCATION_FINAL_STATUSES.has(String(relocation.status || '').toLowerCase())) return false;
  const from = normalizeTemporaryRelocationDate(relocation.from);
  const until = normalizeTemporaryRelocationDate(relocation.until);
  const referenceDate = normalizeTemporaryRelocationDate(dateStr);
  return Boolean(from && until && referenceDate && from <= referenceDate && until >= referenceDate);
};

const getTemporaryRelocationLabel = (relocation = {}) => {
  if (!relocation.from || !relocation.until) return 'Clase temporal';
  return `Clase temporal del ${formatDateSpanish(relocation.from)} al ${formatDateSpanish(relocation.until)}`;
};

const TEMPORARY_CLASS_CHANGE_FINAL_STATUSES = new Set([
  'cancelled',
  'cancelada',
  'finalizada',
  'expired'
]);

const normalizeTemporaryClassChangeDate = (value = '') => {
  if (!value) return '';
  const dateValue = typeof value?.toDate === 'function'
    ? value.toDate()
    : (value instanceof Date ? value : null);

  if (dateValue && !Number.isNaN(dateValue.getTime())) {
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, '0');
    const day = String(dateValue.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const cleanValue = String(value || '').trim();
  const isoMatch = cleanValue.match(/^\d{4}-\d{2}-\d{2}/);
  return isoMatch ? isoMatch[0] : cleanValue.slice(0, 10);
};

const isTemporaryClassChangeClosed = (change = {}) => (
  TEMPORARY_CLASS_CHANGE_FINAL_STATUSES.has(String(change.status || '').toLowerCase())
);

const isTemporaryClassChangeActiveForDate = (change = {}, dateStr = '') => {
  if (!change || isTemporaryClassChangeClosed(change)) return false;
  const from = normalizeTemporaryClassChangeDate(change.from);
  const until = normalizeTemporaryClassChangeDate(change.until);
  const referenceDate = normalizeTemporaryClassChangeDate(dateStr);
  return Boolean(from && until && referenceDate && from <= referenceDate && until >= referenceDate);
};

const getTemporaryClassChangePeriodLabel = (change = {}) => {
  const from = normalizeTemporaryClassChangeDate(change.from);
  const until = normalizeTemporaryClassChangeDate(change.until);
  if (!from || !until) return 'Periodo temporal pendiente de confirmar';
  return `Del ${formatDateSpanish(from)} al ${formatDateSpanish(until)}`;
};

const formatLocalDateString = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatMonthYearSpanish = (dateString) => {
  if (!dateString) return '';
  const [yearRaw, monthRaw] = String(dateString).split('-').map(Number);
  if (!Number.isFinite(yearRaw) || !Number.isFinite(monthRaw)) return '';
  const date = new Date(yearRaw, monthRaw - 1, 1);
  return date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
};

const getMaintenancePeriodForMonths = (monthCount = 1, isLate = false) => {
  const today = new Date();
  const months = Number(monthCount) === 2 ? 2 : 1;
  const startOffset = isLate ? 2 : 1;
  const firstDay = new Date(today.getFullYear(), today.getMonth() + startOffset, 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + startOffset + months, 0);
  const from = formatLocalDateString(firstDay);
  const until = formatLocalDateString(lastDay);
  const firstMonthLabel = formatMonthYearSpanish(from);
  const lastMonthLabel = formatMonthYearSpanish(until);

  return {
    months,
    from,
    until,
    fee: months * 15,
    monthLabel: months === 1 ? firstMonthLabel : `${firstMonthLabel} y ${lastMonthLabel}`
  };
};

const isMaintenancePeriodActiveForDate = (period = {}, dateStr = '') => {
  if (!period || ['cancelled', 'cancelada', 'finalizada'].includes(period.status)) return false;
  return Boolean(period.from && period.until && period.from <= dateStr && period.until >= dateStr);
};

const formatMaintenancePeriodLine = (period = {}) => {
  if (!period?.from || !period?.until) return 'periodo no indicado';
  return `del ${formatDateSpanish(period.from)} al ${formatDateSpanish(period.until)}`;
};

const getNextClassInfo = (dayOfWeek, timeStr) => {
  const now = new Date();
  const targetDay = parseInt(dayOfWeek);
  let date = new Date(now.getTime());
  
  const [hours, minutes] = timeStr.split(':');
  date.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

  const currentDay = now.getDay();
  let daysToAdd = targetDay - currentDay;
  
  if (daysToAdd < 0) {
    daysToAdd += 7;
  } else if (daysToAdd === 0 && now > date) {
    daysToAdd += 7;
  }
  
  date.setDate(now.getDate() + daysToAdd);
  
  const diffMs = date - now;
  const diffHours = diffMs / (1000 * 60 * 60);
  
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;

  return { date, dateStr, diffHours };
};

const getMonthNames = () => {
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const nextNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 1);
  
  return {
    next: nextMonth.toLocaleString('es-ES', { month: 'long' }),
    nextNext: nextNextMonth.toLocaleString('es-ES', { month: 'long' }),
    isLate: today.getDate() > 20
  };
};

export default function StudentPortal({ user, logout, db, appId }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileLoadError, setProfileLoadError] = useState('');
  const [myClasses, setMyClasses] = useState([]);
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [classesLoadError, setClassesLoadError] = useState('');
  const [classesRetryNonce, setClassesRetryNonce] = useState(0);
  const [classCatalog, setClassCatalog] = useState([]);
  const [relocationTargetClasses, setRelocationTargetClasses] = useState([]);
  const [classCatalogLoaded, setClassCatalogLoaded] = useState(false);
  const [classCatalogLoading, setClassCatalogLoading] = useState(false);
  const [classCatalogError, setClassCatalogError] = useState('');
  const [classCatalogRetryNonce, setClassCatalogRetryNonce] = useState(0);
  const [schoolCalendar, setSchoolCalendar] = useState([]); 
  const [globalSettings, setGlobalSettings] = useState({ festivos: [], vacaciones: [], festivosTarragona: [], festivosReus: [], centers: [] });
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsLoadError, setSettingsLoadError] = useState('');
  const [settingsRetryNonce, setSettingsRetryNonce] = useState(0);
  const [calendarMonth, setCalendarMonth] = useState(() => formatLocalDateString(new Date()).slice(0, 7));
  const [selectedCalendarDay, setSelectedCalendarDay] = useState('');
  const [announcements, setAnnouncements] = useState([]); 
  const [visibleAnnouncementsCount, setVisibleAnnouncementsCount] = useState(5); 
  const [myPollResponses, setMyPollResponses] = useState([]);
  const [pollDrafts, setPollDrafts] = useState({});
  const [savingPollId, setSavingPollId] = useState(null);
  const [myCallResponses, setMyCallResponses] = useState([]);
  const [callDrafts, setCallDrafts] = useState({});
  const [savingCallId, setSavingCallId] = useState(null);
  const [pollClock, setPollClock] = useState(Date.now());
  const [myGestiones, setMyGestiones] = useState([]); 
  const [temporaryRelocations, setTemporaryRelocations] = useState([]);
  const [studentTemporaryClassChanges, setStudentTemporaryClassChanges] = useState([]);
  const [catalogTemporaryClassChanges, setCatalogTemporaryClassChanges] = useState([]);
  const [maintenancePeriods, setMaintenancePeriods] = useState([]);
  const [activeTab, setActiveTab] = useState('home');
  const [notification, setNotification] = useState(null);

  const [absenceModal, setAbsenceModal] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [showContract, setShowContract] = useState(false); 
  const [contractText, setContractText] = useState(''); 
  const [onboarding, setOnboarding] = useState({ name: '', instrument: 'Guitarra', classId: '' });
  const [healthCheck, setHealthCheck] = useState(false); 

  const [gestionModal, setGestionModal] = useState(null);
  const [gestionText, setGestionText] = useState('');
  const [selectedInst, setSelectedInst] = useState('');
  const [selectedNewClass, setSelectedNewClass] = useState(null);
  const [selectedSourceClass, setSelectedSourceClass] = useState(null);
  const [bajaTotalRequested, setBajaTotalRequested] = useState(false);
  const [selectedRecoveryDate, setSelectedRecoveryDate] = useState('');
  const [maintenanceMonths, setMaintenanceMonths] = useState(1);
  const [acceptLatePenalty, setAcceptLatePenalty] = useState(false);
  const [isSendingGestion, setIsSendingGestion] = useState(false);
  const [isSendingAbsence, setIsSendingAbsence] = useState(false);

  const [mitoboxModal, setMitoboxModal] = useState(false);
  const [mboxDate, setMboxDate] = useState('');
  const [mboxSede, setMboxSede] = useState('Tarragona');
  const [mboxInst, setMboxInst] = useState('');
  const [mboxSelectedSlot, setMboxSelectedSlot] = useState(null);
  const [extraSignupModal, setExtraSignupModal] = useState(null);
  const [isSendingExtraSignup, setIsSendingExtraSignup] = useState(false);
  const [workshops, setWorkshops] = useState([]);
  const [myWorkshopRegistrations, setMyWorkshopRegistrations] = useState([]);
  const [workshopsLoaded, setWorkshopsLoaded] = useState(false);
  const [workshopModal, setWorkshopModal] = useState(null);
  const [workshopAnswers, setWorkshopAnswers] = useState({});
  const [isSendingWorkshopRegistration, setIsSendingWorkshopRegistration] = useState(false);

  const [triviaModal, setTriviaModal] = useState(false);
  const [triviaTime, setTriviaTime] = useState(10);
  const [triviaSelected, setTriviaSelected] = useState(null);
  const [triviaResult, setTriviaResult] = useState(null); 

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewModalView, setReviewModalView] = useState('choice');
  const [teacherEvaluationClass, setTeacherEvaluationClass] = useState(null);
  const [teacherEvaluationRatings, setTeacherEvaluationRatings] = useState(getEmptyTeacherEvaluationRatings());
  const [teacherEvaluationComments, setTeacherEvaluationComments] = useState({ positive: '', improvement: '' });
  const [teacherEvaluationExistingEvaluation, setTeacherEvaluationExistingEvaluation] = useState(null);
  const [isSendingTeacherEvaluation, setIsSendingTeacherEvaluation] = useState(false);
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [showWhatsappModal, setShowWhatsappModal] = useState(false);
  const [whatsappConfirmModal, setWhatsappConfirmModal] = useState(null);
  const [expandedClassTasks, setExpandedClassTasks] = useState({});

  useEffect(() => {
    const timer = window.setInterval(() => setPollClock(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const timeRules = getMonthNames();
  const dToday = new Date();
  const todayStr = `${dToday.getFullYear()}-${String(dToday.getMonth() + 1).padStart(2, '0')}-${String(dToday.getDate()).padStart(2, '0')}`;
  const centers = useMemo(() => normalizeCenters(globalSettings.centers, globalSettings), [globalSettings]);
  const isStudentClassIndexReady = Number(globalSettings.studentClassIndexVersion || 0) >= 1;
  const allClasses = useMemo(() => {
    const byReference = new Map();
    [...myClasses, ...relocationTargetClasses, ...classCatalog].forEach(classData => {
      if (!classData) return;
      const key = classData.refPath || classData.id;
      if (key) byReference.set(key, classData);
    });
    return [...byReference.values()];
  }, [myClasses, relocationTargetClasses, classCatalog]);
  const temporaryClassChanges = useMemo(() => {
    const byId = new Map();
    [...studentTemporaryClassChanges, ...catalogTemporaryClassChanges].forEach(change => {
      if (change?.id) byId.set(change.id, change);
    });
    return [...byId.values()];
  }, [studentTemporaryClassChanges, catalogTemporaryClassChanges]);
  const needsFullClassCatalog = Boolean(
    mitoboxModal || ['cambio_horario', 'ampliar_clases', 'recuperacion'].includes(gestionModal?.type)
  );
  const activeCenters = useMemo(() => {
    const active = centers.filter(center => center.status === 'active');
    return active.length > 0 ? active : centers.slice(0, 1);
  }, [centers]);
  const mitoboxCenters = useMemo(() => activeCenters.filter(center => (
    (center.rooms || []).some(room => room.active !== false && room.mitoboxEnabled !== false)
  )), [activeCenters]);
  const getCenterForValue = (value = '') => findCenterByValue(centers, value);
  const getClassCenter = (clase = {}) => getCenterForValue(clase.centerId || clase.sede);
  const getClassCenterName = (clase = {}) => getClassCenter(clase)?.name || clase.sede || 'Tarragona';
  const getClassRoom = (clase = {}) => findRoomByValue(getClassCenter(clase), clase.roomId || clase.sala);
  const getClassRoomName = (clase = {}) => getClassRoom(clase)?.name || clase.sala || '';
  const isSameCenter = (left = '', right = '') => {
    const leftCenter = getCenterForValue(left);
    const rightCenter = getCenterForValue(right);
    if (leftCenter && rightCenter) return leftCenter.id === rightCenter.id;
    return normalizeConfigId(left, '') === normalizeConfigId(right, '');
  };
  const getCenterReviewUrl = (center = null) => {
    if (!center) return '';
    if (center.reviewUrl) return center.reviewUrl;
    if (center.id === 'tarragona') return LEGACY_REVIEW_URLS.Tarragona;
    if (center.id === 'reus') return LEGACY_REVIEW_URLS.Reus;
    return LEGACY_REVIEW_URLS[center.name] || '';
  };
  const getWorkshopLocationLabelForStudent = (workshop = {}) => {
    if (['both', 'online', 'other'].includes(workshop.locationType)) return getWorkshopLocationLabel(workshop);
    const center = getCenterForValue(workshop.centerId || workshop.locationType);
    const room = findRoomByValue(center, workshop.roomId || workshop.room);
    const centerName = center?.name || workshop.locationType || 'Sede por determinar';
    const roomName = room?.name || workshop.room || '';
    return `${centerName}${roomName ? ` · ${roomName}` : ''}`;
  };
  const portalStartDate = String(profile?.classStartDate || '').trim();
  const isPortalAccessScheduled = Boolean(portalStartDate && portalStartDate > todayStr);
  const maintenanceOptions = useMemo(() => [
    getMaintenancePeriodForMonths(1, timeRules.isLate),
    getMaintenancePeriodForMonths(2, timeRules.isLate)
  ], [timeRules.isLate]);
  const selectedMaintenanceOption = useMemo(() => (
    maintenanceOptions.find(option => option.months === Number(maintenanceMonths)) || maintenanceOptions[0]
  ), [maintenanceOptions, maintenanceMonths]);

  useEffect(() => {
    if (mitoboxCenters.length === 0) return;
    if (mitoboxCenters.some(center => isSameCenter(center.id, mboxSede))) return;
    setMboxSede(mitoboxCenters[0].name);
    setMboxSelectedSlot(null);
  }, [mitoboxCenters, mboxSede]);

  const activeMaintenancePeriod = useMemo(() => {
    if (!profile?.id) return null;
    return maintenancePeriods
      .filter(period => period.studentId === profile.id && isMaintenancePeriodActiveForDate(period, todayStr))
      .sort((a, b) => String(a.from || '').localeCompare(String(b.from || '')))[0] || null;
  }, [maintenancePeriods, profile?.id, todayStr]);

  const isStudentInMaintenanceForDate = (studentId, dateStr = todayStr) => {
    if (!studentId) return false;
    return maintenancePeriods.some(period => String(period.studentId || '') === String(studentId) && isMaintenancePeriodActiveForDate(period, dateStr));
  };

  const normalizeClassDate = (value = '') => String(value || '').trim();

  const getStudentEntryId = (studentEntry = {}) => String(
    studentEntry?.id || studentEntry?.studentId || ''
  );

  const isStudentEntryFor = (studentEntry = {}, studentId = profile?.id) => (
    Boolean(studentId) && getStudentEntryId(studentEntry) === String(studentId)
  );

  const getStudentEntryInClass = (clase = {}, studentId = profile?.id) => {
    if (!studentId) return null;
    return (clase.students || []).find(studentEntry => isStudentEntryFor(studentEntry, studentId)) || null;
  };

  const getClassRefPath = (clase = {}) => String(
    clase.refPath || clase.classRefPath || ''
  ).trim();

  const getClassDocumentId = (clase = {}) => {
    const refPath = getClassRefPath(clase);
    const refPathParts = refPath.split('/').filter(Boolean);
    return String(clase.docId || refPathParts[refPathParts.length - 1] || clase.id || '').trim();
  };

  const getClassIdentityIds = (clase = {}) => [...new Set([
    clase.id,
    clase.docId,
    getClassDocumentId(clase),
    clase.classId,
    clase.canonicalClassId,
    clase.officialClassId,
    clase.originalClassId,
    clase.legacyClassId,
    clase.migratedFromClassId,
    clase.previousClassId
  ].map(value => String(value || '').trim()).filter(Boolean))];

  const getClassIdentityPaths = (clase = {}) => [...new Set([
    clase.refPath,
    clase.classRefPath,
    clase.canonicalClassRefPath,
    clase.officialClassRefPath,
    clase.originalClassRefPath,
    clase.migratedFromRefPath,
    clase.previousClassRefPath
  ].map(value => String(value || '').trim()).filter(Boolean))];

  const classesShareStableIdentity = (left = {}, right = {}) => {
    const leftPaths = new Set(getClassIdentityPaths(left));
    if (getClassIdentityPaths(right).some(path => leftPaths.has(path))) return true;
    const leftIds = new Set(getClassIdentityIds(left));
    return getClassIdentityIds(right).some(id => leftIds.has(id));
  };

  const classMatchesReference = (clase = {}, referenceId = '', referencePath = '') => {
    const cleanPath = String(referencePath || '').trim();
    if (cleanPath) {
      if (getClassIdentityPaths(clase).includes(cleanPath)) return true;
      const referencedPathStillExists = allClasses.some(candidate => getClassIdentityPaths(candidate).includes(cleanPath));
      if (referencedPathStillExists) return false;
    }
    const cleanId = String(referenceId || '').trim();
    return Boolean(cleanId && getClassIdentityIds(clase).includes(cleanId));
  };

  const findClassByReference = (classes = [], referenceId = '', referencePath = '') => {
    const cleanPath = String(referencePath || '').trim();
    if (cleanPath) {
      const exactPathMatch = classes.find(clase => getClassIdentityPaths(clase).includes(cleanPath));
      if (exactPathMatch) return exactPathMatch;
    }
    const cleanId = String(referenceId || '').trim();
    if (!cleanId) return null;
    const idMatches = classes.filter(clase => getClassIdentityIds(clase).includes(cleanId));
    return idMatches.length === 1 ? idMatches[0] : null;
  };

  const getClassEntryStartDate = (studentEntry = {}, studentInfo = {}) => normalizeClassDate(
    studentEntry.classStartDate ||
    studentEntry.startDate ||
    studentInfo.classStartDate ||
    studentInfo.startDate ||
    ''
  );

  const getClassEntryEndDate = (studentEntry = {}, studentInfo = {}) => normalizeClassDate(
    studentEntry.classEndDate ||
    studentEntry.scheduledEndDate ||
    studentEntry.endDate ||
    studentEntry.until ||
    studentInfo.scheduledBajaClassEndDate ||
    studentInfo.classEndDate ||
    studentInfo.endDate ||
    ''
  );

  const isStudentEntryActiveOnDate = (studentEntry = {}, studentInfo = {}, dateStr = todayStr) => {
    const startDate = getClassEntryStartDate(studentEntry, studentInfo);
    const endDate = getClassEntryEndDate(studentEntry, studentInfo);
    if (startDate && startDate > dateStr) return false;
    if (endDate && endDate < dateStr) return false;
    return true;
  };

  const isStudentEntryCommittedOnDate = (studentEntry = {}, studentInfo = {}, dateStr = todayStr) => {
    const endDate = getClassEntryEndDate(studentEntry, studentInfo);
    return !(endDate && endDate < dateStr);
  };

  const getCommittedSeatCountForClass = (clase = {}, dateStr = todayStr) => (
    (clase.students || []).filter(studentEntry =>
      isFixedClassStudent(studentEntry) && isStudentEntryCommittedOnDate(studentEntry, {}, dateStr)
    ).length
  );

  const doesTemporaryChangeBelongToClass = (change = {}, classDataOrId = '') => {
    const classData = typeof classDataOrId === 'object' && classDataOrId !== null ? classDataOrId : null;
    const classId = classData?.id ?? classDataOrId;
    const changeRefPath = String(change.classRefPath || '').trim();
    const classRefPath = classData ? getClassRefPath(classData) : '';

    // La ruta es la identidad más precisa. Mientras la ruta guardada siga
    // existiendo, nunca aplicamos el cambio a una copia homónima bajo otro
    // profesor. Si la clase fue trasladada y la ruta antigua ya no existe,
    // permitimos después la compatibilidad por ID.
    if (changeRefPath && classRefPath) {
      if (changeRefPath === classRefPath) return true;
      const referencedPathStillExists = allClasses.some(clase => getClassRefPath(clase) === changeRefPath);
      if (referencedPathStillExists) return false;
    }

    const changeClassId = String(change.classId || '').trim();
    if (!changeClassId) return false;
    if (classData) return getClassIdentityIds(classData).includes(changeClassId);
    return changeClassId === String(classId || '').trim();
  };

  const getClassTemporaryChanges = (classDataOrId = '') => temporaryClassChanges
    .filter(change =>
      doesTemporaryChangeBelongToClass(change, classDataOrId) &&
      !isTemporaryClassChangeClosed(change)
    )
    .sort((a, b) => {
      const dateComparison = normalizeTemporaryClassChangeDate(a.from).localeCompare(normalizeTemporaryClassChangeDate(b.from));
      if (dateComparison !== 0) return dateComparison;
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });

  const getActiveClassTemporaryChange = (classDataOrId = '', dateStr = todayStr) => (
    getClassTemporaryChanges(classDataOrId)
      .find(change => isTemporaryClassChangeActiveForDate(change, dateStr)) || null
  );

  const getUpcomingClassTemporaryChange = (classDataOrId = '', dateStr = todayStr) => {
    const referenceDate = normalizeTemporaryClassChangeDate(dateStr);
    return getClassTemporaryChanges(classDataOrId)
      .find(change => {
        const from = normalizeTemporaryClassChangeDate(change.from);
        const until = normalizeTemporaryClassChangeDate(change.until);
        return Boolean(from && until && referenceDate && until >= referenceDate && from > referenceDate);
      }) || null;
  };

  const getAssumedSubstitutionOriginalClassId = (clase = {}) => {
    const explicitOriginalClassId = String(clase.originalClassId || '').trim();
    if (explicitOriginalClassId) return explicitOriginalClassId;

    const substitutionId = String(clase.sourceSubstitutionId || '').trim();
    const substitutionDate = normalizeClassDate(clase.date || clase.specificDate || '');
    const dateSuffix = substitutionDate ? `-${substitutionDate}` : '';
    if (dateSuffix && substitutionId.endsWith(dateSuffix)) {
      return substitutionId.slice(0, -dateSuffix.length);
    }

    return '';
  };

  const getAssumedSubstitutionKey = (clase = {}) => {
    if (!isAssumedSubstitutionClass(clase)) return '';
    const substitutionId = String(clase.sourceSubstitutionId || '').trim();
    if (substitutionId) return `substitution|${substitutionId}`;

    const substitutionDate = normalizeClassDate(clase.date || clase.specificDate || '');
    const documentId = getClassDocumentId(clase);
    const originalClassId = getAssumedSubstitutionOriginalClassId(clase);
    return `substitution|${originalClassId}|${substitutionDate}|${documentId}`;
  };

  const doesAssumedSubstitutionBelongToClass = (substitutionClass = {}, originalClass = {}) => {
    if (!isAssumedSubstitutionClass(substitutionClass) || isPunctualClass(originalClass)) return false;

    const originalClassId = getAssumedSubstitutionOriginalClassId(substitutionClass);
    const originalClassRefPath = String(substitutionClass.originalClassRefPath || '').trim();
    return classMatchesReference(originalClass, originalClassId, originalClassRefPath);
  };

  const getStudentSubstitutionForDate = (clase = {}, dateStr = todayStr) => {
    if (isPunctualClass(clase)) return null;
    const substitutions = Array.isArray(clase.studentSubstitutionClasses)
      ? clase.studentSubstitutionClasses
      : [];

    return substitutions.find(substitutionClass => (
      isAssumedSubstitutionClass(substitutionClass)
      && normalizeClassDate(substitutionClass.date || substitutionClass.specificDate) === normalizeClassDate(dateStr)
    )) || null;
  };

  const getEffectiveClassForDate = (clase = {}, dateStr = todayStr) => {
    if (!clase || isPunctualClass(clase)) return clase;

    // Una clase asumida sustituye a la sesión oficial solo en su fecha exacta.
    // Conservamos la clase fija como base para que antes y después de ese día
    // el alumno siga viendo su horario y profesor habituales.
    const studentSubstitutionClass = getStudentSubstitutionForDate(clase, dateStr);
    if (studentSubstitutionClass) {
      return {
        ...clase,
        ...studentSubstitutionClass,
        id: studentSubstitutionClass.id || studentSubstitutionClass.docId || clase.id,
        docId: studentSubstitutionClass.docId || getClassDocumentId(studentSubstitutionClass),
        refPath: getClassRefPath(studentSubstitutionClass) || getClassRefPath(clase),
        date: normalizeClassDate(studentSubstitutionClass.date || studentSubstitutionClass.specificDate || dateStr),
        isRecurring: false,
        isStudentSubstitutionClass: true,
        studentSubstitutionClass,
        originalClassId: getAssumedSubstitutionOriginalClassId(studentSubstitutionClass) || clase.id,
        officialClass: clase
      };
    }

    const temporaryChange = getActiveClassTemporaryChange(clase, dateStr);
    if (!temporaryChange) return clase;

    const officialSchedule = temporaryChange.officialSchedule || {
      dayOfWeek: clase.dayOfWeek,
      time: clase.time,
      sede: clase.sede,
      sala: clase.sala,
      centerId: clase.centerId,
      roomId: clase.roomId,
      teacher: clase.teacher,
      duration: clase.duration
    };

    return {
      ...clase,
      dayOfWeek: Number(temporaryChange.dayOfWeek),
      time: temporaryChange.time || clase.time,
      sede: temporaryChange.sede || clase.sede,
      sala: temporaryChange.sala || clase.sala,
      centerId: temporaryChange.centerId || clase.centerId,
      roomId: temporaryChange.roomId || clase.roomId,
      teacher: temporaryChange.teacher || clase.teacher,
      duration: Number(temporaryChange.duration) || Number(clase.duration) || 60,
      temporaryClassChange: temporaryChange,
      officialSchedule
    };
  };

  const getNextClassScheduleInfo = (clase = {}) => {
    if (!clase) return null;

    if (isPunctualClass(clase) && (clase.date || clase.specificDate)) {
      const dateStr = clase.date || clase.specificDate;
      const [year, month, day] = String(dateStr).split('-').map(Number);
      const [hours, minutes] = String(clase.time || '00:00').split(':').map(Number);
      const date = new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0);
      return { date, dateStr, diffHours: (date - new Date()) / (1000 * 60 * 60), clase };
    }

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (let offset = 0; offset <= 550; offset++) {
      const candidateDay = new Date(startDate);
      candidateDay.setDate(startDate.getDate() + offset);
      const dateStr = formatLocalDateString(candidateDay);
      const effectiveClass = getEffectiveClassForDate(clase, dateStr);

      // Al renunciar el profesor, Teacher marca la fecha como cancelada en la
      // clase fija. Si otro profesor la asume, el documento puntual anterior
      // vuelve a habilitar exactamente esa fecha; si nadie la asume, se omite.
      const hasAssignedSubstitution = Boolean(effectiveClass?.studentSubstitutionClass);
      if (!hasAssignedSubstitution && (clase.cancelledDates || []).includes(dateStr)) continue;

      if (Number(effectiveClass.dayOfWeek) !== candidateDay.getDay()) continue;

      const [hours, minutes] = String(effectiveClass.time || '00:00').split(':').map(Number);
      const date = new Date(
        candidateDay.getFullYear(),
        candidateDay.getMonth(),
        candidateDay.getDate(),
        hours || 0,
        minutes || 0,
        0,
        0
      );
      if (date < now) continue;

      return {
        date,
        dateStr,
        diffHours: (date - now) / (1000 * 60 * 60),
        clase: effectiveClass,
        temporaryClassChange: effectiveClass.temporaryClassChange || null
      };
    }

    const fallback = getNextClassInfo(clase.dayOfWeek, clase.time || '00:00');
    return { ...fallback, clase, temporaryClassChange: null };
  };

  const getClassReferenceDateForStudent = (clase = {}) => {
    if (isPunctualClass(clase)) return clase.date || todayStr;
    return getNextClassScheduleInfo(clase)?.dateStr || todayStr;
  };

  const isStudentClassVisibleForNextSession = (clase = {}) => {
    const studentEntry = getStudentEntryInClass(clase);
    if (!studentEntry) return false;
    if (isPunctualClass(clase)) {
      const punctualDate = normalizeClassDate(clase.date || clase.specificDate || '');
      if (punctualDate && punctualDate < todayStr) return false;
    }
    return isStudentEntryActiveOnDate(studentEntry, profile || {}, getClassReferenceDateForStudent(clase));
  };

  const isStudentClassScheduledToEnd = (clase = {}) => {
    const studentEntry = getStudentEntryInClass(clase);
    if (!studentEntry) return false;
    const endDate = getClassEntryEndDate(studentEntry, profile || {});
    return Boolean(endDate && endDate >= todayStr);
  };

  const scheduledBajaEffectiveDate = normalizeClassDate(profile?.scheduledBajaEffectiveDate || profile?.bajaEffectiveDate || profile?.effectiveBajaDate || '');
  const isProfileBajaEffective = profile?.globalStatus === 'baja' || Boolean(profile?.scheduledBaja && scheduledBajaEffectiveDate && scheduledBajaEffectiveDate <= todayStr);

  const getStudentClassSlotFingerprint = (clase = {}) => {
    const studentEntry = getStudentEntryInClass(clase, profile?.id);
    if (!studentEntry || !isFixedClassStudent(studentEntry) || isPunctualClass(clase)) return '';

    const subject = normalizeConfigId(clase.subject || '', '');
    const dayOfWeek = Number(clase.dayOfWeek);
    const time = String(clase.time || '').trim();
    const centerValue = String(clase.centerId || clase.sede || '').trim();
    const roomValue = String(clase.roomId || clase.sala || '').trim();

    // No deduplicamos por horario si falta alguno de estos datos. Así evitamos
    // ocultar dos matrículas reales antiguas que no tengan sala o sede informada.
    if (!subject || !Number.isFinite(dayOfWeek) || !time || !centerValue || !roomValue) return '';

    return [
      'fixed',
      subject,
      dayOfWeek,
      time,
      normalizeConfigId(centerValue, ''),
      normalizeConfigId(roomValue, ''),
      Number(clase.duration) || 60
    ].join('|');
  };

  const getClassTemporaryChangePriority = (clase = {}) => {
    const classRefPath = getClassRefPath(clase);
    const classIds = new Set(getClassIdentityIds(clase));
    return temporaryClassChanges.reduce((bestScore, change) => {
      if (isTemporaryClassChangeClosed(change)) return bestScore;
      const until = normalizeTemporaryClassChangeDate(change.until);
      if (until && until < todayStr) return bestScore;

      const exactPath = Boolean(classRefPath && change.classRefPath && String(change.classRefPath) === classRefPath);
      const matchingId = Boolean(change.classId && classIds.has(String(change.classId)));
      if (!exactPath && !matchingId) return bestScore;

      const activeBonus = isTemporaryClassChangeActiveForDate(change, todayStr) ? 500 : 250;
      return Math.max(bestScore, (exactPath ? 10000 : 2000) + activeBonus);
    }, 0);
  };

  const getClassFreshness = (clase = {}) => {
    const rawValue = clase.updatedAt || clase.createdAt || '';
    const timestamp = new Date(rawValue).getTime();
    return Number.isFinite(timestamp) ? timestamp : 0;
  };

  const choosePreferredClassCopy = (left = {}, right = {}) => {
    const scoreClass = (clase = {}) => (
      (clase.isTemporaryRelocationClass ? 20000 : 0)
      + getClassTemporaryChangePriority(clase)
      + (getClassRefPath(clase) ? 100 : 0)
      + (getClassDocumentId(clase) ? 10 : 0)
    );

    const leftScore = scoreClass(left);
    const rightScore = scoreClass(right);
    if (leftScore !== rightScore) return rightScore > leftScore ? right : left;

    const leftFreshness = getClassFreshness(left);
    const rightFreshness = getClassFreshness(right);
    if (leftFreshness !== rightFreshness) return rightFreshness > leftFreshness ? right : left;

    // Desempate estable para no alternar tarjetas entre actualizaciones.
    return getClassRefPath(right).localeCompare(getClassRefPath(left)) > 0 ? right : left;
  };

  const deduplicateStudentClasses = (classes = []) => {
    const result = [];

    classes.filter(Boolean).forEach(clase => {
      const slotFingerprint = getStudentClassSlotFingerprint(clase);
      const duplicateIndex = result.findIndex(existingClass => (
        isAssumedSubstitutionClass(existingClass) || isAssumedSubstitutionClass(clase)
          ? Boolean(
              isAssumedSubstitutionClass(existingClass)
              && isAssumedSubstitutionClass(clase)
              && getAssumedSubstitutionKey(existingClass) === getAssumedSubstitutionKey(clase)
            )
          : (
              classesShareStableIdentity(existingClass, clase)
              || Boolean(
                slotFingerprint
                && slotFingerprint === getStudentClassSlotFingerprint(existingClass)
              )
            )
      ));

      if (duplicateIndex < 0) {
        result.push(clase);
        return;
      }

      result[duplicateIndex] = choosePreferredClassCopy(result[duplicateIndex], clase);
    });

    return result;
  };

  const effectiveMyClasses = useMemo(() => {
    if (!profile?.id) return myClasses;

    const activeRelocations = temporaryRelocations.filter(rel =>
      String(rel.studentId || '') === String(profile.id) &&
      isTemporaryRelocationActiveForDate(rel, todayStr)
    );

    const visibleStudentClasses = myClasses.filter(isStudentClassVisibleForNextSession);
    const visibleAssumedSubstitutions = deduplicateStudentClasses(
      visibleStudentClasses.filter(isAssumedSubstitutionClass)
    );
    const visibleBaseClasses = deduplicateStudentClasses(
      visibleStudentClasses.filter(clase => !isAssumedSubstitutionClass(clase))
    );

    const attachedSubstitutionKeys = new Set();
    const baseClassesWithSubstitutions = visibleBaseClasses.map(baseClass => {
      if (isPunctualClass(baseClass)) return baseClass;

      const substitutionsForClass = visibleAssumedSubstitutions
        .filter(substitutionClass => doesAssumedSubstitutionBelongToClass(substitutionClass, baseClass))
        .sort((left, right) => (
          normalizeClassDate(left.date || left.specificDate)
            .localeCompare(normalizeClassDate(right.date || right.specificDate))
        ));

      if (substitutionsForClass.length === 0) return baseClass;
      substitutionsForClass.forEach(substitutionClass => {
        attachedSubstitutionKeys.add(getAssumedSubstitutionKey(substitutionClass));
      });

      return {
        ...baseClass,
        studentSubstitutionClasses: substitutionsForClass
      };
    });

    // Compatibilidad: si una clase puntual antigua no conserva una referencia
    // fiable a su clase de origen, no la ocultamos. Se muestra solo hasta su
    // fecha y nunca se fusiona con otra matrícula por una coincidencia horaria.
    const unmatchedAssumedSubstitutions = visibleAssumedSubstitutions.filter(substitutionClass => (
      !attachedSubstitutionKeys.has(getAssumedSubstitutionKey(substitutionClass))
    ));

    // Solo sustituimos la clase de origen cuando la clase destino se ha podido
    // resolver. Si un documento antiguo está incompleto, es preferible conservar
    // la clase oficial y mostrar el error de carga que hacerla desaparecer.
    const resolvedRelocations = activeRelocations
      .map(relocation => ({
        relocation,
        targetClass: findClassByReference(
          allClasses,
          relocation.targetClassId,
          relocation.targetClassRefPath || relocation.targetRefPath
        )
      }))
      .filter(item => Boolean(item.targetClass));

    let displayedClasses = [
      ...baseClassesWithSubstitutions,
      ...unmatchedAssumedSubstitutions
    ].filter(clase => !resolvedRelocations.some(({ relocation }) => (
      classMatchesReference(
        clase,
        relocation.sourceClassId || relocation.sourceClass || relocation.originClassId,
        relocation.sourceClassRefPath || relocation.sourceRefPath || relocation.originClassRefPath
      )
    )));

    resolvedRelocations.forEach(({ relocation: rel, targetClass }) => {
      const displayName = profile.alias && profile.useAlias ? profile.alias : (profile.name || rel.studentName || 'Alumno');
      const alreadyInTarget = Boolean(getStudentEntryInClass(targetClass, profile.id));
      const substitutionsForTarget = visibleAssumedSubstitutions
        .filter(substitutionClass => doesAssumedSubstitutionBelongToClass(substitutionClass, targetClass))
        .sort((left, right) => (
          normalizeClassDate(left.date || left.specificDate)
            .localeCompare(normalizeClassDate(right.date || right.specificDate))
        ));
      const targetSubstitutionKeys = new Set(
        substitutionsForTarget.map(getAssumedSubstitutionKey).filter(Boolean)
      );
      const temporaryEntry = {
        id: profile.id,
        studentId: profile.id,
        name: displayName,
        email: profile.email || rel.studentEmail || '',
        isPaused: false,
        status: 'present',
        isTemporaryRelocation: true,
        temporaryRelocationId: rel.id,
        temporaryFrom: rel.from,
        temporaryUntil: rel.until,
        sourceClassId: rel.sourceClassId,
        sourceClassLine: rel.sourceClassLine || '',
        relocationLabel: getTemporaryRelocationLabel(rel)
      };

      const relocatedTargetClass = {
        ...targetClass,
        isTemporaryRelocationClass: true,
        temporaryRelocation: rel,
        ...(substitutionsForTarget.length > 0
          ? { studentSubstitutionClasses: substitutionsForTarget }
          : {}),
        students: alreadyInTarget
          ? targetClass.students
          : [...(targetClass.students || []), temporaryEntry]
      };

      // La clase destino puede haber entrado ya por studentIds o por una entrada
      // temporal guardada físicamente. La retiramos por identidad y añadimos una
      // sola versión marcada como recolocación.
      displayedClasses = displayedClasses.filter(clase => (
        !classesShareStableIdentity(clase, targetClass)
        && !(
          isAssumedSubstitutionClass(clase)
          && targetSubstitutionKeys.has(getAssumedSubstitutionKey(clase))
        )
      ));
      displayedClasses.push(relocatedTargetClass);
    });

    return deduplicateStudentClasses(displayedClasses);
  }, [myClasses, allClasses, temporaryRelocations, temporaryClassChanges, profile?.id, profile?.name, profile?.alias, profile?.useAlias, profile?.email, profile?.classStartDate, profile?.scheduledBajaClassEndDate, todayStr]);

  const fixedMyClasses = effectiveMyClasses.filter(c =>
    !isPunctualClass(c) &&
    (c.students || []).some(s => isStudentEntryFor(s, profile?.id) && isFixedClassStudent(s))
  );

  const currentCalendarMonth = todayStr.slice(0, 7);
  const calendarEventsByDate = useMemo(() => {
    const eventsByDate = new Map();
    schoolCalendar.forEach(calendarItem => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(calendarItem?.date || ''))) return;
      const normalizedItem = {
        ...calendarItem,
        type: calendarItem.type === 'festivo' ? 'festivo' : 'vacaciones',
        title: calendarItem.type === 'festivo'
          ? (calendarItem.title || 'Festivo')
          : 'Vacaciones'
      };
      const dateEvents = eventsByDate.get(normalizedItem.date) || [];
      const duplicate = dateEvents.some(event => (
        event.type === normalizedItem.type
        && event.title === normalizedItem.title
        && (event.centerId || '') === (normalizedItem.centerId || '')
      ));
      if (!duplicate) eventsByDate.set(normalizedItem.date, [...dateEvents, normalizedItem]);
    });
    return eventsByDate;
  }, [schoolCalendar]);

  const calendarMonthOptions = useMemo(() => {
    let firstMonth = shiftMonthValue(currentCalendarMonth, -12);
    let lastMonth = shiftMonthValue(currentCalendarMonth, 24);
    if (calendarMonth < firstMonth) firstMonth = calendarMonth;
    if (calendarMonth > lastMonth) lastMonth = calendarMonth;
    schoolCalendar.forEach(calendarItem => {
      const eventMonth = /^\d{4}-\d{2}-\d{2}$/.test(String(calendarItem?.date || ''))
        ? calendarItem.date.slice(0, 7)
        : '';
      if (!eventMonth) return;
      if (eventMonth < firstMonth) firstMonth = eventMonth;
      if (eventMonth > lastMonth) lastMonth = eventMonth;
    });

    const options = [];
    let cursor = firstMonth;
    for (let index = 0; cursor && cursor <= lastMonth && index < 120; index++) {
      options.push(cursor);
      cursor = shiftMonthValue(cursor, 1);
    }
    return options;
  }, [schoolCalendar, currentCalendarMonth, calendarMonth]);

  const calendarGridDays = useMemo(() => {
    const [year, month] = String(calendarMonth).split('-').map(Number);
    if (!year || !month) return [];
    const daysInMonth = new Date(year, month, 0).getDate();
    const leadingBlankDays = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    const totalCells = Math.ceil((leadingBlankDays + daysInMonth) / 7) * 7;

    return Array.from({ length: totalCells }, (_, cellIndex) => {
      const day = cellIndex - leadingBlankDays + 1;
      if (day < 1 || day > daysInMonth) return { key: `blank-${cellIndex}`, empty: true };
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month - 1, day).getDay();
      return {
        key: date,
        date,
        day,
        isToday: date === todayStr,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        events: calendarEventsByDate.get(date) || []
      };
    });
  }, [calendarMonth, calendarEventsByDate, todayStr]);

  const selectedMonthClosures = useMemo(() => (
    schoolCalendar
      .filter(calendarItem => String(calendarItem?.date || '').startsWith(`${calendarMonth}-`))
      .map(calendarItem => ({
        ...calendarItem,
        type: calendarItem.type === 'festivo' ? 'festivo' : 'vacaciones',
        title: calendarItem.type === 'festivo' ? (calendarItem.title || 'Festivo') : 'Vacaciones'
      }))
      .filter((calendarItem, index, items) => items.findIndex(candidate => (
        candidate.date === calendarItem.date
        && candidate.type === calendarItem.type
        && candidate.title === calendarItem.title
        && (candidate.centerId || '') === (calendarItem.centerId || '')
      )) === index)
      .sort((left, right) => left.date.localeCompare(right.date) || left.type.localeCompare(right.type))
  ), [schoolCalendar, calendarMonth]);

  const selectedCalendarDetails = selectedCalendarDay
    ? (calendarEventsByDate.get(selectedCalendarDay) || [])
    : [];

  const calendarCenterNames = useMemo(() => {
    const namesByCenter = new Map();
    effectiveMyClasses.forEach(classData => {
      const center = findCenterByValue(centers, classData.centerId || classData.sede);
      if (center) namesByCenter.set(center.id, center.name);
    });
    return [...namesByCenter.values()];
  }, [effectiveMyClasses, centers]);

  const selectCalendarMonth = (monthValue) => {
    if (!monthValue) return;
    setCalendarMonth(monthValue);
    setSelectedCalendarDay('');
  };

  const fixedSeatClasses = deduplicateStudentClasses(myClasses.filter(c =>
    !isPunctualClass(c) &&
    isStudentClassVisibleForNextSession(c) &&
    !isStudentClassScheduledToEnd(c) &&
    (c.students || []).some(s => isStudentEntryFor(s, profile?.id) && isFixedClassStudent(s))
  ));

  const studentCenters = [...new Map(
    (fixedMyClasses.length > 0 ? fixedMyClasses : effectiveMyClasses)
      .map(clase => getClassCenter(clase))
      .filter(Boolean)
      .map(center => [center.id, center])
  ).values()];
  const studentReviewCenters = studentCenters.filter(center => Boolean(getCenterReviewUrl(center)));
  const reviewCenters = studentCenters.length > 0
    ? studentReviewCenters
    : activeCenters.filter(center => Boolean(getCenterReviewUrl(center)));

  const workshopRegistrationsByWorkshop = useMemo(() => {
    const byWorkshop = new Map();
    myWorkshopRegistrations.forEach(registration => byWorkshop.set(registration.workshopId, registration));
    return byWorkshop;
  }, [myWorkshopRegistrations]);

  const workshopMatchesStudent = (workshop = {}) => {
    const audienceType = workshop.audienceType || 'all';
    const audienceValue = String(workshop.audienceValue || '').trim();
    const referenceClasses = fixedMyClasses.length > 0 ? fixedMyClasses : effectiveMyClasses;

    if (audienceType === 'all') return true;
    if (audienceType === 'manual') return (workshop.manualStudentIds || []).includes(profile?.id);
    if (!audienceValue) return false;
    if (audienceType === 'sede') return referenceClasses.some(clase => isSameCenter(clase.centerId || clase.sede || 'Tarragona', audienceValue));
    if (audienceType === 'instrument') return referenceClasses.some(clase => (clase.subject || '') === audienceValue);
    if (audienceType === 'teacher') return referenceClasses.some(clase => (clase.teacher || '') === audienceValue);
    if (audienceType === 'class') return referenceClasses.some(clase => String(clase.id) === audienceValue);
    return false;
  };

  const visibleWorkshops = useMemo(() => {
    const nowLocal = getLocalDateTimeString();
    return workshops
      .filter(workshop => {
        const registration = workshopRegistrationsByWorkshop.get(workshop.id);
        const hasActiveHistory = registration && registration.status !== 'cancelled';
        if (hasActiveHistory && ['published', 'registration_closed', 'completed', 'cancelled'].includes(workshop.status)) return true;
        if (!['published', 'registration_closed'].includes(workshop.status)) return false;
        if (workshop.publishAt && workshop.publishAt > nowLocal) return false;
        if (!workshopMatchesStudent(workshop)) return false;
        const lastSessionDate = [...(workshop.sessions || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0]?.date || '';
        return !lastSessionDate || lastSessionDate >= todayStr;
      })
      .sort((a, b) => {
        if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
        return String(a.sessions?.[0]?.date || '2999-12-31').localeCompare(String(b.sessions?.[0]?.date || '2999-12-31'));
      });
  }, [workshops, workshopRegistrationsByWorkshop, fixedMyClasses, effectiveMyClasses, profile?.id, todayStr]);

  const classWhatsappLinks = useMemo(() => {
    const byUrl = new Map();

    effectiveMyClasses.forEach(clase => {
      const url = getSafeAnnouncementUrl(clase.whatsappGroupUrl || clase.whatsappUrl || '');
      if (!url) return;

      const myStudentEntry = getStudentEntryInClass(clase, profile?.id);
      if (myStudentEntry?.isRecovery) return;

      if (!byUrl.has(url)) {
        byUrl.set(url, {
          url,
          label: `${clase.subject || 'Clase'} · ${getDayName(clase.dayOfWeek)} ${clase.time || ''}h · ${getClassCenterName(clase)}`,
          teacher: clase.teacher || '',
          classId: clase.id
        });
      }
    });

    return [...byUrl.values()];
  }, [effectiveMyClasses, profile?.id]);

  const getVisibleClassResourcesForStudent = (clase = {}) => {
    const resources = Array.isArray(clase.resources) ? clase.resources : [];
    const studentId = String(profile?.id || '');

    return resources.filter(resource => {
      if (!getSafeAnnouncementUrl(resource.url)) return false;
      if (resource.visibleToStudents === false) return false;
      if (resource.targetScope === 'teachers') return false;

      if (resource.targetScope === 'students') {
        const targetIds = Array.isArray(resource.targetStudentIds)
          ? resource.targetStudentIds.map(id => String(id))
          : [];
        return Boolean(studentId && targetIds.includes(studentId));
      }

      return true;
    });
  };

  const getClassTasksPanelKey = (clase = {}, idx = '') => [
    clase.id || `clase-${idx}`,
    clase.temporaryRelocation?.id || clase.temporaryRelocationId || '',
    clase.date || 'recurring'
  ].filter(Boolean).join('-');

  const toggleClassTasksPanel = (panelKey) => {
    setExpandedClassTasks(prev => ({ ...prev, [panelKey]: !prev[panelKey] }));
  };

  const renderClassTasksResources = ({ clase = {}, resources = [], hasNotes = false, panelKey = '', expanded = false, variant = 'dark' }) => {
    if (!hasNotes && resources.length === 0) return null;

    const styles = {
      dark: {
        wrapper: 'mb-8',
        button: 'bg-zinc-900/80 border-zinc-800 text-zinc-100 hover:bg-zinc-800',
        count: 'text-zinc-400',
        panel: 'bg-zinc-900/80 border-zinc-800 text-zinc-300',
        title: 'text-amber-400',
        resourceCard: 'bg-black/30 border-zinc-800 text-zinc-200 hover:border-zinc-700',
        resourceMeta: 'text-zinc-500',
        divider: 'border-zinc-800',
        cta: 'bg-white text-black hover:bg-zinc-100'
      },
      frozen: {
        wrapper: 'mb-8',
        button: 'bg-zinc-300/40 border-zinc-300 text-zinc-600 hover:bg-zinc-300/60',
        count: 'text-zinc-500',
        panel: 'bg-zinc-300/30 border-zinc-300/50 text-zinc-600',
        title: 'text-zinc-500',
        resourceCard: 'bg-white/40 border-zinc-300 text-zinc-700 hover:border-zinc-400',
        resourceMeta: 'text-zinc-500',
        divider: 'border-zinc-300/60',
        cta: 'bg-zinc-700 text-white hover:bg-zinc-800'
      },
      holidayRed: {
        wrapper: 'mt-5',
        button: 'bg-white/70 border-red-100 text-red-900 hover:bg-white',
        count: 'text-red-600',
        panel: 'bg-white/70 border-red-100 text-red-900',
        title: 'text-red-600',
        resourceCard: 'bg-white/80 border-red-100 text-red-950 hover:border-red-200',
        resourceMeta: 'text-red-500',
        divider: 'border-red-100',
        cta: 'bg-red-600 text-white hover:bg-red-700'
      },
      holidayPurple: {
        wrapper: 'mt-5',
        button: 'bg-white/70 border-purple-100 text-purple-900 hover:bg-white',
        count: 'text-purple-600',
        panel: 'bg-white/70 border-purple-100 text-purple-900',
        title: 'text-purple-600',
        resourceCard: 'bg-white/80 border-purple-100 text-purple-950 hover:border-purple-200',
        resourceMeta: 'text-purple-500',
        divider: 'border-purple-100',
        cta: 'bg-purple-600 text-white hover:bg-purple-700'
      }
    }[variant] || {};

    const resourceCountLabel = resources.length === 1 ? '1 recurso' : `${resources.length} recursos`;
    const summaryParts = [];
    if (hasNotes) summaryParts.push('tareas');
    if (resources.length > 0) summaryParts.push(resourceCountLabel);

    return (
      <div className={styles.wrapper || 'mb-8'}>
        <button
          type="button"
          onClick={() => toggleClassTasksPanel(panelKey)}
          className={`w-full px-4 py-3 rounded-2xl border font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-between gap-3 ${styles.button || ''}`}
        >
          <span className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            {expanded ? 'Ocultar tareas y recursos' : 'Desplegar tareas y recursos'}
          </span>
          <span className={`flex items-center gap-2 ${styles.count || ''}`}>
            {summaryParts.join(' · ')}
            <ArrowRight className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </span>
        </button>

        {expanded && (
          <div className={`mt-3 p-5 rounded-2xl border animate-in fade-in slide-in-from-top-1 duration-200 ${styles.panel || ''}`}>
            {hasNotes && (
              <div>
                <h4 className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest mb-2 ${styles.title || ''}`}>
                  <BookOpen className="w-4 h-4"/> Tareas de la semana
                </h4>
                <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{clase.notes}</p>
              </div>
            )}

            {resources.length > 0 && (
              <div className={hasNotes ? `mt-5 pt-5 border-t ${styles.divider || ''}` : ''}>
                <h4 className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest mb-3 ${styles.title || ''}`}>
                  <LinkIcon className="w-4 h-4"/> Recursos de la clase
                </h4>
                <div className="space-y-3">
                  {resources.map((resource, resourceIndex) => {
                    const safeUrl = getSafeAnnouncementUrl(resource.url);
                    return (
                      <a
                        key={resource.id || `${resource.title || 'recurso'}-${resourceIndex}`}
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors ${styles.resourceCard || ''}`}
                      >
                        <div className="min-w-0">
                          <span className={`inline-flex items-center px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest mb-1 ${styles.resourceMeta || ''}`}>
                            {getClassResourceTypeLabel(resource.type)}
                          </span>
                          <p className="font-black uppercase tracking-tight text-sm truncate">{resource.title || 'Recurso sin título'}</p>
                          {resource.notes && <p className={`text-[11px] font-medium mt-1 leading-relaxed whitespace-pre-wrap ${styles.resourceMeta || ''}`}>{resource.notes}</p>}
                        </div>
                        <span className={`shrink-0 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${styles.cta || ''}`}>
                          Abrir
                        </span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const evaluableTeacherClasses = useMemo(() => {
    const sourceClasses = fixedSeatClasses.length > 0 ? fixedSeatClasses : fixedMyClasses;
    const byKey = new Map();

    sourceClasses.forEach(clase => {
      if (!clase?.teacher) return;
      const studentEntry = getStudentEntryInClass(clase);
      if (studentEntry?.isRecovery) return;

      const key = clase.id || `${clase.teacher}-${clase.subject}-${clase.dayOfWeek}-${clase.time}-${clase.sede}`;
      if (!byKey.has(key)) byKey.set(key, clase);
    });

    return [...byKey.values()];
  }, [fixedSeatClasses, fixedMyClasses, profile?.id]);

  const resetTeacherEvaluationForm = () => {
    setTeacherEvaluationClass(null);
    setTeacherEvaluationRatings(getEmptyTeacherEvaluationRatings());
    setTeacherEvaluationComments({ positive: '', improvement: '' });
    setTeacherEvaluationExistingEvaluation(null);
    setIsSendingTeacherEvaluation(false);
  };

  const closeReviewModal = () => {
    setShowReviewModal(false);
    setReviewModalView('choice');
    resetTeacherEvaluationForm();
  };

  const handleReviewClick = () => {
    setReviewModalView('choice');
    setShowReviewModal(true);
  };

  const openSchoolReviewFlow = () => {
    if (reviewCenters.length === 0) {
      showToast('Esta sede todavía no tiene configurado un enlace público de reseñas.', 'error');
      return;
    }
    if (reviewCenters.length === 1) {
      window.open(getCenterReviewUrl(reviewCenters[0]), '_blank', 'noopener,noreferrer');
      closeReviewModal();
      return;
    }
    setReviewModalView('school');
  };

  const findExistingTeacherEvaluationForClass = async (clase = {}) => {
    if (!profile?.id || !clase) return null;

    const period = getTeacherEvaluationPeriod(todayStr);
    const classId = String(clase.id || '').trim();
    const deterministicEvaluationId = buildTeacherEvaluationId({
      studentId: profile.id,
      classId: classId || 'clase',
      period
    });

    const deterministicRef = doc(db, 'artifacts', appId, 'teacherEvaluations', deterministicEvaluationId);
    const deterministicSnap = await getDoc(deterministicRef);
    if (deterministicSnap.exists()) {
      return { id: deterministicSnap.id, ...deterministicSnap.data() };
    }

    // Compatibilidad con evaluaciones guardadas antes de imponer el límite trimestral.
    // Así una evaluación antigua con ID temporal también bloquea repetir en el mismo trimestre.
    if (classId) {
      const existingQuery = query(
        collection(db, 'artifacts', appId, 'teacherEvaluations'),
        where('studentId', '==', profile.id),
        where('classId', '==', classId),
        where('period', '==', period)
      );
      const existingSnap = await getDocs(existingQuery);
      if (!existingSnap.empty) {
        const firstDoc = existingSnap.docs[0];
        return { id: firstDoc.id, ...firstDoc.data() };
      }
    }

    return null;
  };

  const startTeacherEvaluation = async (clase) => {
    setTeacherEvaluationClass(clase);
    setTeacherEvaluationRatings(getEmptyTeacherEvaluationRatings());
    setTeacherEvaluationComments({ positive: '', improvement: '' });
    setTeacherEvaluationExistingEvaluation(null);
    setReviewModalView('teacher_checking');

    try {
      const existingEvaluation = await findExistingTeacherEvaluationForClass(clase);
      if (existingEvaluation) {
        setTeacherEvaluationExistingEvaluation(existingEvaluation);
        setReviewModalView('teacher_already_sent');
        return;
      }

      setReviewModalView('teacher_form');
    } catch (error) {
      console.error('Error al comprobar evaluación docente existente', error);
      showToast('No se pudo comprobar si ya habías evaluado esta clase.', 'error');
      setReviewModalView(evaluableTeacherClasses.length > 1 ? 'teacher_select' : 'choice');
    }
  };

  const openTeacherEvaluationFlow = () => {
    if (evaluableTeacherClasses.length === 0) {
      showToast('No encontramos ninguna clase evaluable en tu perfil.', 'error');
      return;
    }

    if (evaluableTeacherClasses.length === 1) {
      startTeacherEvaluation(evaluableTeacherClasses[0]);
      return;
    }

    setTeacherEvaluationClass(null);
    setReviewModalView('teacher_select');
  };

  const setTeacherEvaluationRating = (questionKey, value) => {
    setTeacherEvaluationRatings(prev => ({ ...prev, [questionKey]: value }));
  };

  const updateTeacherEvaluationComment = (field, value) => {
    setTeacherEvaluationComments(prev => ({ ...prev, [field]: value }));
  };

  const areTeacherEvaluationRatingsComplete = TEACHER_EVALUATION_QUESTIONS.every(question => Number(teacherEvaluationRatings[question.key]) > 0);

  const submitTeacherEvaluation = async () => {
    if (!teacherEvaluationClass || isSendingTeacherEvaluation) return;

    if (!areTeacherEvaluationRatingsComplete) {
      showToast('Puntúa todas las preguntas antes de enviar la evaluación.', 'error');
      return;
    }

    const ratingValues = TEACHER_EVALUATION_QUESTIONS.map(question => Number(teacherEvaluationRatings[question.key]) || 0);
    const ratingsAverage = ratingValues.length
      ? Number((ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length).toFixed(2))
      : 0;
    const period = getTeacherEvaluationPeriod(todayStr);
    const evaluationId = buildTeacherEvaluationId({
      studentId: profile.id,
      classId: teacherEvaluationClass.id || 'clase',
      period
    });
    const nowIso = new Date().toISOString();

    setIsSendingTeacherEvaluation(true);
    try {
      const existingEvaluation = await findExistingTeacherEvaluationForClass(teacherEvaluationClass);
      if (existingEvaluation) {
        setTeacherEvaluationExistingEvaluation(existingEvaluation);
        setReviewModalView('teacher_already_sent');
        showToast('Ya habías enviado la evaluación de esta clase este trimestre.', 'error');
        return;
      }

      await setDoc(doc(db, 'artifacts', appId, 'teacherEvaluations', evaluationId), {
        studentId: profile.id,
        studentName: profile.name || '',
        studentEmail: profile.email || user.email || '',
        teacherName: teacherEvaluationClass.teacher || '',
        classId: teacherEvaluationClass.id || '',
        classRefPath: teacherEvaluationClass.refPath || '',
        classLine: formatClassLineForAdminCopy(teacherEvaluationClass),
        subject: teacherEvaluationClass.subject || '',
        sede: getClassCenterName(teacherEvaluationClass),
        sala: getClassRoomName(teacherEvaluationClass),
        centerId: getClassCenter(teacherEvaluationClass)?.id || teacherEvaluationClass.centerId || '',
        roomId: getClassRoom(teacherEvaluationClass)?.id || teacherEvaluationClass.roomId || '',
        dayOfWeek: teacherEvaluationClass.dayOfWeek ?? null,
        time: teacherEvaluationClass.time || '',
        period,
        month: todayStr.slice(0, 7),
        date: todayStr,
        createdAt: nowIso,
        source: 'student_portal',
        questionsVersion: 'teacher-evaluation-v1',
        maxRating: 5,
        ratings: { ...teacherEvaluationRatings },
        ratingsAverage,
        ratingCount: ratingValues.length,
        questionLabels: TEACHER_EVALUATION_QUESTIONS.reduce((acc, question) => ({
          ...acc,
          [question.key]: question.label
        }), {}),
        comments: {
          positive: String(teacherEvaluationComments.positive || '').trim(),
          improvement: String(teacherEvaluationComments.improvement || '').trim()
        },
        visibleToTeacher: false,
        confidentialForAdmin: true
      });

      showToast('Gracias. Evaluación enviada a coordinación.');
      closeReviewModal();
    } catch (error) {
      console.error('Error al enviar evaluación docente', error);
      showToast('Error al enviar la evaluación.', 'error');
    } finally {
      setIsSendingTeacherEvaluation(false);
    }
  };

  const renderReviewModal = () => {
    if (!showReviewModal) return null;

    const selectedClassLine = teacherEvaluationClass ? formatClassLineForAdminCopy(teacherEvaluationClass) : '';

    return (
      <div className="fixed inset-0 bg-black/80 z-[100] flex items-start sm:items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-8 shadow-2xl relative my-4 sm:my-8 max-h-[calc(100vh-2rem)] overflow-y-auto">
          <button onClick={closeReviewModal} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>

          {reviewModalView === 'choice' && (
            <>
              <div className="flex flex-col items-center text-center mb-6">
                <Star className="w-12 h-12 text-amber-400 fill-amber-400 mb-3" />
                <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Valóranos</h2>
                <p className="text-xs font-bold text-zinc-500 mt-2 leading-relaxed">Tu opinión nos ayuda a mejorar la escuela y el seguimiento de las clases.</p>
              </div>
              <div className="space-y-3">
                <button onClick={openSchoolReviewFlow} className="w-full bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 font-black py-4 px-4 rounded-xl uppercase text-xs tracking-widest transition-colors flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2"><MapPin className="w-4 h-4"/> Evaluar la escuela</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button onClick={openTeacherEvaluationFlow} className="w-full bg-zinc-100 hover:bg-black hover:text-white text-slate-800 font-black py-4 px-4 rounded-xl uppercase text-xs tracking-widest transition-colors flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2"><User className="w-4 h-4"/> Evaluar a mi profesor</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {reviewModalView === 'school' && (
            <>
              <button onClick={() => setReviewModalView('choice')} className="mb-5 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-black flex items-center gap-1">
                <ArrowRight className="w-3 h-3 rotate-180" /> Volver
              </button>
              <div className="flex flex-col items-center text-center mb-6">
                <MapPin className="w-12 h-12 text-amber-500 mb-3" />
                <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Evalúa la escuela</h2>
                <p className="text-xs font-bold text-zinc-500 mt-2">Elige sede para dejar una reseña pública en Google Maps.</p>
              </div>
              <div className="space-y-3">
                {reviewCenters.map(center => (
                  <a key={center.id} href={getCenterReviewUrl(center)} target="_blank" rel="noopener noreferrer" onClick={closeReviewModal} className="w-full bg-zinc-100 hover:bg-black hover:text-white text-slate-800 font-black py-4 rounded-xl uppercase text-xs tracking-widest transition-colors flex items-center justify-center gap-2">
                    <MapPin className="w-4 h-4"/> Sede {center.name}
                  </a>
                ))}
              </div>
            </>
          )}

          {reviewModalView === 'teacher_checking' && (
            <>
              <button onClick={() => evaluableTeacherClasses.length > 1 ? setReviewModalView('teacher_select') : setReviewModalView('choice')} className="mb-5 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-black flex items-center gap-1">
                <ArrowRight className="w-3 h-3 rotate-180" /> Volver
              </button>
              <div className="flex flex-col items-center text-center py-8">
                <Clock className="w-12 h-12 text-zinc-300 mb-4 animate-pulse" />
                <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Comprobando evaluación</h2>
                <p className="text-xs font-bold text-zinc-500 mt-2 leading-relaxed">Estamos revisando si ya enviaste tu valoración de esta clase durante este trimestre.</p>
              </div>
            </>
          )}

          {reviewModalView === 'teacher_already_sent' && teacherEvaluationClass && (
            <>
              <button onClick={() => evaluableTeacherClasses.length > 1 ? setReviewModalView('teacher_select') : setReviewModalView('choice')} className="mb-5 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-black flex items-center gap-1">
                <ArrowRight className="w-3 h-3 rotate-180" /> Volver
              </button>
              <div className="flex flex-col items-center text-center mb-6">
                <CheckCircle className="w-12 h-12 text-emerald-500 mb-3" />
                <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Evaluación ya enviada</h2>
                <p className="text-xs font-bold text-zinc-500 mt-2 leading-relaxed">Ya hemos recibido tu evaluación de esta clase durante el trimestre actual. Podrás volver a valorarla en el próximo trimestre.</p>
              </div>
              <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 mb-5">
                <p className="text-sm font-black uppercase tracking-tight text-slate-800">{teacherEvaluationClass.teacher || 'Profesor'}</p>
                <p className="text-[11px] font-bold text-zinc-500 mt-1 leading-tight">{selectedClassLine}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mt-3">Periodo: {teacherEvaluationExistingEvaluation?.period || getTeacherEvaluationPeriod(todayStr)}</p>
                {teacherEvaluationExistingEvaluation?.date && (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">Enviada el {formatDateSpanish(teacherEvaluationExistingEvaluation.date)}</p>
                )}
              </div>
              <button onClick={closeReviewModal} className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-800 transition-colors shadow-lg">
                Entendido
              </button>
            </>
          )}

          {reviewModalView === 'teacher_select' && (
            <>
              <button onClick={() => setReviewModalView('choice')} className="mb-5 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-black flex items-center gap-1">
                <ArrowRight className="w-3 h-3 rotate-180" /> Volver
              </button>
              <div className="flex flex-col items-center text-center mb-6">
                <User className="w-12 h-12 text-black mb-3" />
                <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Evalúa a tu profesor</h2>
                <p className="text-xs font-bold text-zinc-500 mt-2 leading-relaxed">Elige la clase sobre la que quieres enviar tu valoración.</p>
              </div>
              <div className="space-y-3">
                {evaluableTeacherClasses.map(clase => (
                  <button
                    key={clase.id || `${clase.teacher}-${clase.subject}-${clase.dayOfWeek}-${clase.time}`}
                    type="button"
                    onClick={() => startTeacherEvaluation(clase)}
                    className="w-full p-4 rounded-2xl border-2 border-zinc-100 hover:border-black text-left transition-all bg-white"
                  >
                    <p className="text-sm font-black uppercase tracking-tight text-slate-800">{clase.subject || 'Clase'} · {clase.teacher || 'Profesor'}</p>
                    <p className="text-[11px] font-bold text-zinc-500 mt-1 leading-tight">{getDayName(clase.dayOfWeek)} {clase.time || ''}h · {getClassCenterName(clase)}{getClassRoomName(clase) ? ` · ${getClassRoomName(clase)}` : ''}</p>
                  </button>
                ))}
              </div>
            </>
          )}

          {reviewModalView === 'teacher_form' && teacherEvaluationClass && (
            <>
              <button onClick={() => evaluableTeacherClasses.length > 1 ? setReviewModalView('teacher_select') : setReviewModalView('choice')} className="mb-5 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-black flex items-center gap-1">
                <ArrowRight className="w-3 h-3 rotate-180" /> Volver
              </button>
              <div className="mb-5">
                <h2 className="text-xl font-black uppercase tracking-tight text-slate-800 leading-tight">Evalúa a tu profesor</h2>
                <p className="text-xs font-bold text-zinc-500 mt-2 leading-relaxed">Esta evaluación es confidencial para coordinación. El profesor no verá tu nombre.</p>
                <div className="mt-4 bg-zinc-50 border border-zinc-100 rounded-2xl p-3">
                  <p className="text-sm font-black uppercase tracking-tight text-slate-800">{teacherEvaluationClass.teacher || 'Profesor'}</p>
                  <p className="text-[11px] font-bold text-zinc-500 mt-1 leading-tight">{selectedClassLine}</p>
                </div>
              </div>

              <div className="space-y-4">
                {TEACHER_EVALUATION_QUESTIONS.map((question, index) => (
                  <div key={question.key} className="border border-zinc-100 rounded-2xl p-4 bg-white">
                    <p className="text-sm font-bold text-slate-800 leading-snug mb-3"><span className="text-zinc-400 font-black mr-1">{index + 1}.</span>{question.label}</p>
                    <div className="grid grid-cols-5 gap-2">
                      {TEACHER_EVALUATION_SCALE.map(value => {
                        const selected = Number(teacherEvaluationRatings[question.key]) === value;
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setTeacherEvaluationRating(question.key, value)}
                            className={`py-3 rounded-xl border-2 font-black text-sm transition-all ${selected ? 'bg-black text-white border-black shadow-sm' : 'bg-zinc-50 text-zinc-500 border-zinc-100 hover:border-zinc-300'}`}
                            aria-label={`${value} sobre 5`}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-zinc-400 mt-2 px-1">
                      <span>Muy bajo</span>
                      <span>Muy alto</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 space-y-3">
                <textarea
                  value={teacherEvaluationComments.positive}
                  onChange={e => updateTeacherEvaluationComment('positive', e.target.value)}
                  placeholder="¿Qué es lo que más valoras de tus clases? (Opcional)"
                  className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl focus:border-black outline-none min-h-[90px] resize-y text-sm font-medium"
                />
                <textarea
                  value={teacherEvaluationComments.improvement}
                  onChange={e => updateTeacherEvaluationComment('improvement', e.target.value)}
                  placeholder="¿Qué crees que podría mejorar? Sugerencias para coordinación. (Opcional)"
                  className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl focus:border-black outline-none min-h-[90px] resize-y text-sm font-medium"
                />
              </div>

              <button
                type="button"
                onClick={submitTeacherEvaluation}
                disabled={!areTeacherEvaluationRatingsComplete || isSendingTeacherEvaluation}
                className="w-full mt-5 bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-800 transition-colors shadow-lg flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSendingTeacherEvaluation ? 'Enviando...' : <><Send className="w-4 h-4"/> Enviar evaluación</>}
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const handleWhatsappClick = () => {
    if (classWhatsappLinks.length === 0) return;
    if (classWhatsappLinks.length === 1) {
      setWhatsappConfirmModal(classWhatsappLinks[0]);
      return;
    }
    setShowWhatsappModal(true);
  };

  const openWhatsappGroup = (link) => {
    if (!link?.url) return;
    setWhatsappConfirmModal(null);
    setShowWhatsappModal(false);
    window.open(link.url, '_blank', 'noopener,noreferrer');
  };

  const announcementMatchesStudent = (ann = {}) => {
    const audienceType = ann.audienceType || 'all';
    const audienceValue = String(ann.audienceValue || '').trim();

    if (ann.type === 'poll' && ann.pollStatus === 'archived') return false;
    if (ann.type === 'call' && ann.callStatus === 'archived') return false;

    // Los avisos dirigidos a profesores se leen solo desde TeacherPortal.
    // StudentPortal debe ignorarlos aunque estén en la misma colección announcements.
    if (audienceType === 'teachers') return false;

    if (audienceType === 'all') return true;
    if (!audienceValue || fixedMyClasses.length === 0) return false;

    if (audienceType === 'sede') return fixedMyClasses.some(c => isSameCenter(c.centerId || c.sede || 'Tarragona', audienceValue));
    if (audienceType === 'instrumento') return fixedMyClasses.some(c => (c.subject || '') === audienceValue);
    if (audienceType === 'profesor') return fixedMyClasses.some(c => (c.teacher || '') === audienceValue);

    return false;
  };

  const visibleAnnouncements = announcements.filter(announcementMatchesStudent);

  // 👇 LÓGICA DE LA BOLITA ROJA (NOTIFICACIONES TABLÓN)
  const latestAnnounceId = visibleAnnouncements.length > 0 ? Math.max(...visibleAnnouncements.map(a => Number(a.id))).toString() : null;
  const hasUnreadNews = latestAnnounceId && profile?.lastSeenTablon !== latestAnnounceId;

  // Actualiza la marca de tiempo del tablón en Firestore cuando el alumno entra a la pestaña 'news'
  useEffect(() => {
    if (activeTab === 'news' && hasUnreadNews && profile?.id) {
      updateDoc(doc(db, 'artifacts', appId, 'students', profile.id), {
        lastSeenTablon: latestAnnounceId
      }).catch(e => console.error("Error al actualizar estado del tablón:", e));
    }
  }, [activeTab, hasUnreadNews, profile?.id, latestAnnounceId, db, appId]);

  useEffect(() => {
    checkRegistration();
    setSettingsLoaded(false);
    setSettingsLoadError('');

    const unsubAnnouncements = onSnapshot(collection(db, 'artifacts', appId, 'announcements'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setAnnouncements(data);
    });

    const unsubSettings = onSnapshot(
      doc(db, 'artifacts', appId, 'settings', 'global'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setContractText(data.contract || 'El contrato aún no está disponible.');
          setGlobalSettings({
            ...data,
            festivos: data.festivos || [],
            vacaciones: data.vacaciones || [],
            festivosTarragona: data.festivosTarragona || [],
            festivosReus: data.festivosReus || [],
            centers: normalizeCenters(data.centers, data)
          });
        }
        setSettingsLoadError('');
        setSettingsLoaded(true);
      },
      (error) => {
        console.error('Error al cargar la configuración global', error);
        setSettingsLoadError('No se ha podido consultar el calendario escolar.');
        setSettingsLoaded(true);
      }
    );

    return () => {
      unsubAnnouncements();
      unsubSettings();
    };
  }, [user.email, settingsRetryNonce]);

  useEffect(() => {
    if (!profile) {
      setSchoolCalendar([]);
      return;
    }

    const misSedes = new Map();
    effectiveMyClasses.forEach(clase => {
      const center = getClassCenter(clase);
      if (center) misSedes.set(center.id, center);
    });
    temporaryClassChanges.forEach(change => {
      if (
        effectiveMyClasses.some(classData => doesTemporaryChangeBelongToClass(change, classData)) &&
        !isTemporaryClassChangeClosed(change) &&
        (!normalizeTemporaryClassChangeDate(change.until) || normalizeTemporaryClassChangeDate(change.until) >= todayStr)
      ) {
        const center = getCenterForValue(change.centerId || change.sede);
        if (center) misSedes.set(center.id, center);
      }
    });

    const newCal = [];
    
    globalSettings.vacaciones.forEach(d => newCal.push({ date: d, type: 'vacaciones', title: 'Vacaciones', centerId: '' }));
    globalSettings.festivos.forEach(d => newCal.push({ date: d, type: 'festivo', title: 'Festivo Global', centerId: '' }));

    misSedes.forEach(center => {
      (center.holidays || []).forEach(d => {
        const isAlreadyGlobal = newCal.some(calendarItem => calendarItem.date === d && !calendarItem.centerId);
        const isAlreadyForCenter = newCal.some(calendarItem => calendarItem.date === d && calendarItem.centerId === center.id);
        if (!isAlreadyGlobal && !isAlreadyForCenter) {
          newCal.push({ date: d, type: 'festivo', title: `Festivo Local (${center.name})`, centerId: center.id });
        }
      });
    });

    setSchoolCalendar(newCal);

  }, [globalSettings, effectiveMyClasses, temporaryClassChanges, profile, todayStr, centers]);

  useEffect(() => {
    if (!profile?.id || !settingsLoaded) return;
    setClassesLoaded(false);
    setClassesLoadError('');
    setWorkshopsLoaded(false);
    if (!isStudentClassIndexReady) setClassCatalogLoaded(false);
    
    const unsubProfile = onSnapshot(
      doc(db, 'artifacts', appId, 'students', profile.id),
      (docSnap) => {
        if (docSnap.exists()) {
          setProfile(prev => ({ ...prev, ...docSnap.data() }));
        }
      },
      (error) => {
        console.error('Error al mantener actualizado el perfil del alumno', error);
        setProfileLoadError('Tu perfil se cargó, pero no se ha podido mantener sincronizado. Reintenta para evitar trabajar con datos antiguos.');
      }
    );

    const extractClassesSnapshot = (snapshot) => {
      const all = [];
      const mine = [];
      snapshot.forEach(classDoc => {
        const data = classDoc.data();
        const classObj = {
          ...data,
          id: data.id || classDoc.id,
          docId: classDoc.id,
          refPath: classDoc.ref.path
        };
        all.push(classObj); 

        if (getStudentEntryInClass(classObj, profile.id)) {
          mine.push(classObj); 
        }
      });
      return { all, mine };
    };

    const publishClassesSnapshot = (snapshot, { publishCatalog = false } = {}) => {
      const { all, mine } = extractClassesSnapshot(snapshot);
      if (publishCatalog) {
        setClassCatalog(all);
        setClassCatalogLoaded(true);
      }
      setMyClasses(mine);
      setClassesLoadError('');
      setClassesLoaded(true);
      return { all, mine };
    };

    let cancelled = false;
    let legacyVerificationStarted = false;
    let legacySubscribed = false;
    let unsubIndexedClasses = () => {};
    let unsubLegacyClasses = () => {};

    const failClassesLoad = (error) => {
      if (cancelled) return;
      console.error('Error al cargar las clases del alumno', error);
      setClassesLoadError('No se han podido comprobar tus clases y su estado actual. No se mostrará “Sin clase asignada” hasta verificarlo correctamente.');
      setMyClasses([]);
      setClassesLoaded(true);
    };

    const subscribeLegacyClasses = ({ publishCatalog = false } = {}) => {
      if (cancelled || legacySubscribed) return;
      legacySubscribed = true;
      unsubIndexedClasses();
      unsubLegacyClasses = onSnapshot(collectionGroup(db, 'recurringClasses'), (snapshot) => {
        if (cancelled) return;
        publishClassesSnapshot(snapshot, { publishCatalog });
      }, (legacyError) => {
        console.error('Error al cargar las clases del alumno mediante compatibilidad', legacyError);
        setMyClasses([]);
        if (publishCatalog) {
          setClassCatalog([]);
          setClassCatalogLoaded(false);
        }
        failClassesLoad(legacyError);
      });
    };

    const verifyLegacyClassesAfterEmptyIndex = async () => {
      if (cancelled || legacyVerificationStarted || legacySubscribed) return;
      legacyVerificationStarted = true;
      try {
        const legacySnapshot = await getDocs(collectionGroup(db, 'recurringClasses'));
        if (cancelled || legacySubscribed) return;
        const { mine } = extractClassesSnapshot(legacySnapshot);
        if (mine.length > 0) {
          // El índice ha omitido clases reales: el respaldo queda activo durante toda la sesión.
          setMyClasses(mine);
          setClassesLoadError('');
          setClassesLoaded(true);
          subscribeLegacyClasses({ publishCatalog: false });
          return;
        }

        // Solo ahora podemos afirmar que el alumno no tiene ninguna clase en el sistema heredado.
        setMyClasses([]);
        setClassesLoadError('');
        setClassesLoaded(true);
      } catch (legacyError) {
        failClassesLoad(legacyError);
      } finally {
        if (!legacySubscribed) legacyVerificationStarted = false;
      }
    };

    if (isStudentClassIndexReady) {
      const indexedClassesQuery = query(
        collectionGroup(db, 'recurringClasses'),
        where('studentIds', 'array-contains', profile.id)
      );
      unsubIndexedClasses = onSnapshot(indexedClassesQuery, (snapshot) => {
        if (cancelled || legacySubscribed) return;
        const { mine } = extractClassesSnapshot(snapshot);
        if (snapshot.empty || mine.length === 0) {
          verifyLegacyClassesAfterEmptyIndex();
          return;
        }
        publishClassesSnapshot(snapshot);
      }, (error) => {
        console.error('La consulta studentIds no está disponible; se activa compatibilidad temporal', error);
        subscribeLegacyClasses({ publishCatalog: false });
      });
    } else {
      subscribeLegacyClasses({ publishCatalog: true });
    }

    const q = query(collection(db, 'artifacts', appId, 'gestiones'), where('studentId', '==', profile.id));
    const unsubGestiones = onSnapshot(q, (snapshot) => {
      setMyGestiones(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const temporaryRelocationsQuery = query(
      collection(db, 'artifacts', appId, 'temporaryRelocations'),
      where('studentId', '==', profile.id)
    );
    const unsubTemporaryRelocations = onSnapshot(
      temporaryRelocationsQuery,
      (snapshot) => {
        setTemporaryRelocations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => failClassesLoad(error)
    );

    const maintenanceQuery = query(collection(db, 'artifacts', appId, 'maintenancePeriods'), where('studentId', '==', profile.id));
    const unsubMaintenancePeriods = onSnapshot(
      maintenanceQuery,
      (snapshot) => {
        setMaintenancePeriods(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      },
      (error) => failClassesLoad(error)
    );

    const unsubWorkshops = onSnapshot(
      collection(db, 'artifacts', appId, 'workshops'),
      (snapshot) => {
        setWorkshops(snapshot.docs.map(workshopDoc => ({ id: workshopDoc.id, ...workshopDoc.data() })));
        setWorkshopsLoaded(true);
      },
      (error) => {
        console.error('Error al cargar talleres', error);
        setWorkshopsLoaded(true);
      }
    );

    const workshopRegistrationsQuery = query(
      collection(db, 'artifacts', appId, 'workshopRegistrations'),
      where('studentId', '==', profile.id)
    );
    const unsubWorkshopRegistrations = onSnapshot(
      workshopRegistrationsQuery,
      (snapshot) => setMyWorkshopRegistrations(snapshot.docs.map(registrationDoc => ({ id: registrationDoc.id, ...registrationDoc.data() }))),
      (error) => console.error('Error al cargar inscripciones de talleres', error)
    );

    const pollResponsesQuery = query(
      collection(db, 'artifacts', appId, 'pollResponses'),
      where('studentId', '==', profile.id)
    );
    const unsubPollResponses = onSnapshot(
      pollResponsesQuery,
      (snapshot) => setMyPollResponses(snapshot.docs.map(responseDoc => ({ id: responseDoc.id, ...responseDoc.data() }))),
      (error) => console.error('Error al cargar respuestas de encuestas', error)
    );

    const callResponsesQuery = query(
      collection(db, 'artifacts', appId, 'callResponses'),
      where('studentId', '==', profile.id)
    );
    const unsubCallResponses = onSnapshot(
      callResponsesQuery,
      (snapshot) => setMyCallResponses(snapshot.docs.map(responseDoc => ({ id: responseDoc.id, ...responseDoc.data() }))),
      (error) => console.error('Error al cargar candidaturas de convocatorias', error)
    );

    const ticketsQuery = query(collectionGroup(db, 'tickets'), where('studentId', '==', profile.id));
    const processTicketsSnapshot = (snapshot, filterLegacyResults = false) => {
      let validTicketsCount = 0;
      let futureSummerTicketsCount = 0;
      let activeSummerTicketsCount = 0;
      snapshot.forEach(ticketDoc => {
        const data = ticketDoc.data();
        if (filterLegacyResults && String(data.studentId || '') !== String(profile.id)) return;
        const isPending = !data.isUsed && !data.voided;
        const isAlreadyValid = !data.validFrom || data.validFrom <= todayStr;
        const isNotExpired = !data.validUntil || data.validUntil >= todayStr;
        const isFuture = data.validFrom && data.validFrom > todayStr;
        const isSummerTicket = data.isSummerTicket || data.recoveryPolicy === 'summer';

        if (isPending && isAlreadyValid && isNotExpired) {
          validTicketsCount++;
          if (isSummerTicket) activeSummerTicketsCount++;
        } else if (isPending && isFuture && isSummerTicket) {
          futureSummerTicketsCount++;
        }
      });
      setProfile(prev => prev ? {
        ...prev,
        activeTickets: validTicketsCount,
        activeSummerTickets: activeSummerTicketsCount,
        futureSummerTickets: futureSummerTicketsCount
      } : null);
    };

    let unsubFilteredTickets = () => {};
    let unsubLegacyTickets = () => {};
    let legacyTicketsStarted = false;
    const subscribeLegacyTickets = (queryError) => {
      if (legacyTicketsStarted) return;
      legacyTicketsStarted = true;
      console.error('La consulta optimizada de tickets falló; se activa compatibilidad temporal', queryError);
      unsubFilteredTickets();
      unsubLegacyTickets = onSnapshot(
        collectionGroup(db, 'tickets'),
        snapshot => processTicketsSnapshot(snapshot, true),
        legacyError => {
          console.error('No se pudieron comprobar los tickets del alumno', legacyError);
          setNotification({ text: 'No se han podido comprobar tus tickets de recuperación. Reintenta recargando la página.', type: 'error' });
        }
      );
    };
    unsubFilteredTickets = onSnapshot(
      ticketsQuery,
      snapshot => processTicketsSnapshot(snapshot),
      subscribeLegacyTickets
    );
    const unsubTickets = () => {
      unsubFilteredTickets();
      unsubLegacyTickets();
    };

    return () => {
      cancelled = true;
      unsubProfile();
      unsubIndexedClasses();
      unsubLegacyClasses();
      unsubGestiones();
      unsubTemporaryRelocations();
      unsubMaintenancePeriods();
      unsubWorkshops();
      unsubWorkshopRegistrations();
      unsubPollResponses();
      unsubCallResponses();
      unsubTickets(); 
    };
  }, [profile?.id, settingsLoaded, isStudentClassIndexReady, classesRetryNonce, db, appId]);

  // Una recolocación puede llevar al alumno a una clase que no forma parte de su plaza fija.
  // Escuchamos solo esas clases destino, utilizando la ruta exacta guardada por Admin.
  useEffect(() => {
    if (!profile?.id || !isStudentClassIndexReady) {
      setRelocationTargetClasses([]);
      return;
    }

    const activeRelocations = temporaryRelocations.filter(relocation => (
      String(relocation.studentId || '') === String(profile.id) && isTemporaryRelocationActiveForDate(relocation, todayStr)
    ));
    const targetPaths = [...new Set(activeRelocations.map(relocation => relocation.targetClassRefPath).filter(Boolean))];
    const missingTargetIds = [...new Set(
      activeRelocations
        .filter(relocation => !relocation.targetClassRefPath)
        .map(relocation => relocation.targetClassId)
        .filter(Boolean)
    )];

    if (targetPaths.length === 0 && missingTargetIds.length === 0) {
      setRelocationTargetClasses([]);
      return;
    }

    let cancelled = false;
    const classesByReference = new Map();
    const publish = () => {
      if (!cancelled) setRelocationTargetClasses([...classesByReference.values()]);
    };
    const unsubs = targetPaths.map(refPath => onSnapshot(
      doc(db, refPath),
      (classSnap) => {
        if (classSnap.exists()) {
          const classData = classSnap.data();
          classesByReference.set(refPath, {
            ...classData,
            id: classData.id || classSnap.id,
            docId: classSnap.id,
            refPath: classSnap.ref.path
          });
        } else {
          classesByReference.delete(refPath);
          setClassesLoadError('Una clase de recolocación temporal ya no existe. Se conservará visible la clase oficial hasta que Administración revise el destino.');
          setClassesLoaded(true);
        }
        publish();
      },
      (error) => {
        console.error('Error al cargar una clase de recolocación', error);
        setClassesLoadError('No se ha podido comprobar una recolocación temporal. Reintenta antes de consultar tu horario.');
        setClassesLoaded(true);
      }
    ));

    // Compatibilidad excepcional con recolocaciones antiguas sin targetClassRefPath.
    if (missingTargetIds.length > 0) {
      getDocs(collectionGroup(db, 'recurringClasses')).then(snapshot => {
        snapshot.forEach(classDoc => {
          if (missingTargetIds.includes(classDoc.id)) {
            const classData = classDoc.data();
            classesByReference.set(classDoc.ref.path, {
              ...classData,
              id: classData.id || classDoc.id,
              docId: classDoc.id,
              refPath: classDoc.ref.path
            });
          }
        });
        publish();
      }).catch(error => {
        if (cancelled) return;
        console.error('Error al recuperar una clase de recolocación antigua', error);
        setClassesLoadError('No se ha podido comprobar una recolocación temporal antigua. Reintenta antes de consultar tu horario.');
        setClassesLoaded(true);
      });
    }

    return () => {
      cancelled = true;
      unsubs.forEach(unsub => unsub());
    };
  }, [profile?.id, isStudentClassIndexReady, temporaryRelocations, todayStr, classesRetryNonce, db]);

  // Los cambios temporales ordinarios se limitan a las clases propias y de recolocación.
  // Antes de que Admin active el índice, se conserva automáticamente el listener global heredado.
  useEffect(() => {
    if (!profile?.id || !settingsLoaded) return;

    if (!isStudentClassIndexReady) {
      const unsubLegacyChanges = onSnapshot(
        collection(db, 'artifacts', appId, 'temporaryClassChanges'),
        snapshot => setStudentTemporaryClassChanges(snapshot.docs.map(changeDoc => ({ id: changeDoc.id, ...changeDoc.data() }))),
        error => {
          console.error('Error al cargar los cambios temporales de clase', error);
          setStudentTemporaryClassChanges([]);
          setClassesLoadError('No se han podido comprobar los cambios temporales de tus clases. Reintenta antes de consultar tu horario.');
          setClassesLoaded(true);
        }
      );
      return () => unsubLegacyChanges();
    }

    const relevantClasses = [...myClasses, ...relocationTargetClasses];
    const relevantClassIds = [...new Set(
      relevantClasses.flatMap(classData => getClassIdentityIds(classData)).filter(Boolean)
    )];
    if (relevantClassIds.length === 0) {
      setStudentTemporaryClassChanges([]);
      return;
    }

    const chunks = [];
    for (let index = 0; index < relevantClassIds.length; index += 10) {
      chunks.push(relevantClassIds.slice(index, index + 10));
    }

    const snapshotsByChunk = new Map();
    let fallbackUnsub = null;
    let fallbackStarted = false;
    const unsubs = [];
    const publish = () => {
      const byId = new Map();
      snapshotsByChunk.forEach(items => items.forEach(item => byId.set(item.id, item)));
      setStudentTemporaryClassChanges([...byId.values()]);
    };
    const startFallback = (error) => {
      if (fallbackStarted) return;
      fallbackStarted = true;
      console.error('La consulta optimizada de cambios temporales falló; se aplica compatibilidad heredada', error);
      unsubs.forEach(unsub => unsub());
      fallbackUnsub = onSnapshot(
        collection(db, 'artifacts', appId, 'temporaryClassChanges'),
        snapshot => {
          setStudentTemporaryClassChanges(snapshot.docs
            .map(changeDoc => ({ id: changeDoc.id, ...changeDoc.data() }))
            .filter(change => relevantClasses.some(classData => doesTemporaryChangeBelongToClass(change, classData))));
        },
        fallbackError => {
          console.error('Error al cargar los cambios temporales de clase', fallbackError);
          setStudentTemporaryClassChanges([]);
          setClassesLoadError('No se han podido comprobar los cambios temporales de tus clases. Reintenta antes de consultar tu horario.');
          setClassesLoaded(true);
        }
      );
    };

    chunks.forEach((classIds, chunkIndex) => {
      const changesQuery = query(
        collection(db, 'artifacts', appId, 'temporaryClassChanges'),
        where('classId', 'in', classIds)
      );
      const unsub = onSnapshot(
        changesQuery,
        snapshot => {
          snapshotsByChunk.set(chunkIndex, snapshot.docs.map(changeDoc => ({ id: changeDoc.id, ...changeDoc.data() })));
          publish();
        },
        startFallback
      );
      unsubs.push(unsub);
    });

    return () => {
      unsubs.forEach(unsub => unsub());
      if (fallbackUnsub) fallbackUnsub();
    };
  }, [profile?.id, settingsLoaded, isStudentClassIndexReady, myClasses, relocationTargetClasses, classesRetryNonce, db, appId]);

  // El catálogo completo solo es necesario para buscar plazas o calcular disponibilidad Mitobox.
  // Se abre en tiempo real mientras el modal correspondiente está visible y se libera al cerrarlo.
  useEffect(() => {
    if (!settingsLoaded) return;
    if (!isStudentClassIndexReady) {
      setClassCatalogLoading(false);
      setClassCatalogError('');
      return;
    }
    if (!needsFullClassCatalog) {
      setClassCatalogLoading(false);
      setClassCatalogLoaded(false);
      setClassCatalogError('');
      setClassCatalog([]);
      setCatalogTemporaryClassChanges([]);
      return;
    }

    setClassCatalogLoading(true);
    setClassCatalogLoaded(false);
    setClassCatalogError('');
    let classesReady = false;
    let changesReady = false;
    const finishIfReady = () => {
      if (classesReady && changesReady) {
        setClassCatalogLoading(false);
        setClassCatalogLoaded(true);
      }
    };

    const unsubClassCatalog = onSnapshot(
      collectionGroup(db, 'recurringClasses'),
      snapshot => {
        setClassCatalog(snapshot.docs.map(classDoc => {
          const classData = classDoc.data();
          return {
            ...classData,
            id: classData.id || classDoc.id,
            docId: classDoc.id,
            refPath: classDoc.ref.path
          };
        }));
        classesReady = true;
        finishIfReady();
      },
      error => {
        console.error('Error al cargar el catálogo de clases', error);
        setClassCatalog([]);
        setSelectedNewClass(null);
        setMboxSelectedSlot(null);
        setClassCatalogError('No se ha podido consultar la disponibilidad. Reintenta antes de elegir una plaza o una sala.');
        classesReady = true;
        finishIfReady();
      }
    );
    const unsubCatalogChanges = onSnapshot(
      collection(db, 'artifacts', appId, 'temporaryClassChanges'),
      snapshot => {
        setCatalogTemporaryClassChanges(snapshot.docs.map(changeDoc => ({ id: changeDoc.id, ...changeDoc.data() })));
        changesReady = true;
        finishIfReady();
      },
      error => {
        console.error('Error al cargar los cambios temporales del catálogo', error);
        setCatalogTemporaryClassChanges([]);
        setSelectedNewClass(null);
        setMboxSelectedSlot(null);
        setClassCatalogError('No se ha podido comprobar la disponibilidad completa. Reintenta antes de elegir una plaza o una sala.');
        changesReady = true;
        finishIfReady();
      }
    );

    return () => {
      unsubClassCatalog();
      unsubCatalogChanges();
    };
  }, [settingsLoaded, isStudentClassIndexReady, needsFullClassCatalog, classCatalogRetryNonce, db, appId]);

  useEffect(() => {
    let timer;
    if (triviaModal && triviaTime > 0 && !triviaResult) {
      timer = setInterval(() => {
        setTriviaTime(prev => prev - 1);
      }, 1000);
    } else if (triviaTime === 0 && !triviaResult) {
      handleTriviaAnswer(-1);
    }
    return () => clearInterval(timer);
  }, [triviaModal, triviaTime, triviaResult]);

  const showToast = (msg, type = 'success') => {
    setNotification({ text: msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const getMyPollResponse = (pollId) => myPollResponses.find(response => response.pollId === pollId) || null;

  const isStudentPollClosed = (poll = {}) => {
    if (['closed', 'archived'].includes(poll.pollStatus)) return true;
    if (!poll.pollDeadline) return false;
    return new Date(poll.pollDeadline).getTime() <= pollClock;
  };

  const getPollDraft = (poll) => {
    if (pollDrafts[poll.id]) return pollDrafts[poll.id];
    const response = getMyPollResponse(poll.id);
    return {
      selectedOptionIds: response?.selectedOptionIds || [],
      textAnswer: response?.textAnswer || ''
    };
  };

  const updatePollDraft = (pollId, changes) => {
    const response = getMyPollResponse(pollId);
    setPollDrafts(prev => ({
      ...prev,
      [pollId]: {
        selectedOptionIds: response?.selectedOptionIds || [],
        textAnswer: response?.textAnswer || '',
        ...(prev[pollId] || {}),
        ...changes
      }
    }));
  };

  const togglePollOption = (poll, optionId) => {
    const draft = getPollDraft(poll);
    if (poll.pollAnswerType === 'single') {
      updatePollDraft(poll.id, { selectedOptionIds: [optionId] });
      return;
    }
    const current = new Set(draft.selectedOptionIds || []);
    if (current.has(optionId)) current.delete(optionId);
    else current.add(optionId);
    updatePollDraft(poll.id, { selectedOptionIds: [...current] });
  };

  const shouldShowPollResults = (poll, response) => {
    if (poll.pollResultsVisibility === 'after_response') return Boolean(response);
    if (poll.pollResultsVisibility === 'after_close') return isStudentPollClosed(poll);
    return false;
  };

  const submitPollResponse = async (poll) => {
    if (!profile?.id || savingPollId) return;
    const draft = getPollDraft(poll);
    const selectedOptionIds = [...new Set(draft.selectedOptionIds || [])];
    const textAnswer = String(draft.textAnswer || '').trim();
    if (poll.pollAnswerType === 'text' ? !textAnswer : selectedOptionIds.length === 0) {
      showToast('Selecciona o escribe una respuesta antes de enviarla.', 'error');
      return;
    }
    if (poll.pollAnswerType === 'single' && selectedOptionIds.length !== 1) {
      showToast('Selecciona una sola opción.', 'error');
      return;
    }

    setSavingPollId(poll.id);
    const pollRef = doc(db, 'artifacts', appId, 'announcements', poll.id);
    const responseRef = doc(db, 'artifacts', appId, 'pollResponses', `${poll.id}_${profile.id}`);
    const nowIso = new Date().toISOString();
    try {
      await runTransaction(db, async transaction => {
        const pollSnap = await transaction.get(pollRef);
        const responseSnap = await transaction.get(responseRef);
        if (!pollSnap.exists()) throw new Error('POLL_NOT_FOUND');
        const currentPoll = pollSnap.data();
        if (currentPoll.type !== 'poll' || ['closed', 'archived'].includes(currentPoll.pollStatus) || (currentPoll.pollDeadline && new Date(currentPoll.pollDeadline).getTime() <= Date.now())) {
          throw new Error('POLL_CLOSED');
        }
        if (responseSnap.exists() && currentPoll.pollAllowEdit === false) throw new Error('EDIT_NOT_ALLOWED');

        const previous = responseSnap.exists() ? responseSnap.data() : null;
        const counts = { ...(currentPoll.pollVoteCounts || {}) };
        if (currentPoll.pollAnswerType !== 'text') {
          (previous?.selectedOptionIds || []).forEach(optionId => { counts[optionId] = Math.max(0, Number(counts[optionId] || 0) - 1); });
          selectedOptionIds.forEach(optionId => { counts[optionId] = Number(counts[optionId] || 0) + 1; });
        }

        transaction.set(responseRef, {
          pollId: poll.id,
          studentId: profile.id,
          studentName: profile.useAlias && profile.alias ? profile.alias : (profile.name || ''),
          studentEmail: profile.email || user.email || '',
          answerType: currentPoll.pollAnswerType || 'single',
          selectedOptionIds: currentPoll.pollAnswerType === 'text' ? [] : selectedOptionIds,
          textAnswer: currentPoll.pollAnswerType === 'text' ? textAnswer : '',
          createdAt: previous?.createdAt || nowIso,
          updatedAt: nowIso
        });
        transaction.update(pollRef, {
          pollVoteCounts: counts,
          pollResponseCount: Number(currentPoll.pollResponseCount || 0) + (previous ? 0 : 1),
          pollLastResponseAt: nowIso
        });
      });
      showToast(getMyPollResponse(poll.id) ? 'Respuesta actualizada.' : 'Respuesta registrada.');
    } catch (error) {
      console.error('Error al guardar la respuesta de la encuesta', error);
      const message = error?.message === 'POLL_CLOSED'
        ? 'La encuesta ya está cerrada.'
        : error?.message === 'EDIT_NOT_ALLOWED'
          ? 'Esta encuesta no permite modificar la respuesta.'
          : 'No se ha podido guardar la respuesta.';
      showToast(message, 'error');
    } finally {
      setSavingPollId(null);
    }
  };

  const getMyCallResponse = (callId) => myCallResponses.find(response => (
    (response.callId || response.announcementId) === callId
  )) || null;

  const isStudentCallClosed = (call = {}) => {
    if (['closed', 'archived'].includes(call.callStatus)) return true;
    if (!call.callDeadline) return false;
    return new Date(call.callDeadline).getTime() <= pollClock;
  };

  const getCallDraft = (call) => {
    if (callDrafts[call.id] !== undefined) return callDrafts[call.id];
    return getMyCallResponse(call.id)?.comment || '';
  };

  const updateCallDraft = (callId, value) => {
    setCallDrafts(previous => ({ ...previous, [callId]: value }));
  };

  const getCallStudentContext = (call = {}) => {
    const audienceType = call.audienceType || 'all';
    const audienceValue = String(call.audienceValue || '').trim();
    const matchingClasses = fixedMyClasses.filter(classData => {
      if (audienceType === 'sede') return isSameCenter(classData.centerId || classData.sede || 'Tarragona', audienceValue);
      if (audienceType === 'instrumento') return (classData.subject || '') === audienceValue;
      if (audienceType === 'profesor') return (classData.teacher || '') === audienceValue;
      return true;
    });
    const contextClasses = matchingClasses.length > 0 ? matchingClasses : fixedMyClasses;
    const joinUnique = values => [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))].join(', ');

    return {
      instrument: joinUnique(contextClasses.map(classData => classData.subject)),
      site: joinUnique(contextClasses.map(classData => getClassCenterName(classData))),
      teacher: joinUnique(contextClasses.map(classData => classData.teacher))
    };
  };

  const submitCallResponse = async (call) => {
    if (!profile?.id || savingCallId) return;
    const responseBeforeSaving = getMyCallResponse(call.id);
    const comment = String(getCallDraft(call) || '').trim();
    const studentContext = getCallStudentContext(call);
    const nowIso = new Date().toISOString();
    const callRef = doc(db, 'artifacts', appId, 'announcements', call.id);
    const responseRef = doc(db, 'artifacts', appId, 'callResponses', `${call.id}_${profile.id}`);

    setSavingCallId(call.id);
    try {
      await runTransaction(db, async transaction => {
        const callSnapshot = await transaction.get(callRef);
        const responseSnapshot = await transaction.get(responseRef);
        if (!callSnapshot.exists()) throw new Error('CALL_NOT_FOUND');

        const currentCall = callSnapshot.data();
        if (
          currentCall.type !== 'call' ||
          ['closed', 'archived'].includes(currentCall.callStatus) ||
          (currentCall.callDeadline && new Date(currentCall.callDeadline).getTime() <= Date.now())
        ) {
          throw new Error('CALL_CLOSED');
        }

        const previous = responseSnapshot.exists() ? responseSnapshot.data() : null;
        const previousStatus = previous?.status || 'pending';
        if (previous && !['pending', 'withdrawn'].includes(previousStatus)) {
          throw new Error('CALL_ALREADY_REVIEWED');
        }

        const isResubmission = previousStatus === 'withdrawn';
        transaction.set(responseRef, {
          callId: call.id,
          announcementId: call.id,
          callTitle: currentCall.title || call.title || '',
          studentId: profile.id,
          studentName: profile.useAlias && profile.alias ? profile.alias : (profile.name || ''),
          studentEmail: profile.email || user.email || '',
          instrument: studentContext.instrument,
          site: studentContext.site,
          teacher: studentContext.teacher,
          comment,
          status: 'pending',
          createdAt: previous?.createdAt || nowIso,
          submittedAt: nowIso,
          updatedAt: nowIso,
          ...(isResubmission ? {
            resubmittedAt: nowIso,
            withdrawnAt: '',
            reviewedAt: '',
            reviewedBy: ''
          } : {})
        }, { merge: true });
      });

      setCallDrafts(previous => {
        const next = { ...previous };
        delete next[call.id];
        return next;
      });
      showToast(responseBeforeSaving?.status === 'pending' ? 'Candidatura actualizada.' : 'Candidatura enviada. Administración la revisará.');
    } catch (error) {
      console.error('Error al guardar la candidatura', error);
      const message = error?.message === 'CALL_CLOSED'
        ? 'La convocatoria ya está cerrada.'
        : error?.message === 'CALL_ALREADY_REVIEWED'
          ? 'Administración ya ha revisado esta candidatura y no puede editarse.'
          : 'No se ha podido guardar la candidatura.';
      showToast(message, 'error');
    } finally {
      setSavingCallId(null);
    }
  };

  const withdrawCallResponse = async (call) => {
    if (!profile?.id || savingCallId) return;
    if (!window.confirm('¿Quieres retirar tu candidatura de esta convocatoria?')) return;

    const responseRef = doc(db, 'artifacts', appId, 'callResponses', `${call.id}_${profile.id}`);
    const nowIso = new Date().toISOString();
    setSavingCallId(call.id);
    try {
      await runTransaction(db, async transaction => {
        const responseSnapshot = await transaction.get(responseRef);
        if (!responseSnapshot.exists()) throw new Error('CALL_RESPONSE_NOT_FOUND');
        const currentResponse = responseSnapshot.data();
        if ((currentResponse.callId || currentResponse.announcementId) !== call.id) throw new Error('CALL_RESPONSE_NOT_FOUND');
        if ((currentResponse.status || 'pending') === 'withdrawn') return;

        transaction.update(responseRef, {
          status: 'withdrawn',
          withdrawnAt: nowIso,
          updatedAt: nowIso
        });
      });
      showToast('Candidatura retirada.');
    } catch (error) {
      console.error('Error al retirar la candidatura', error);
      showToast('No se ha podido retirar la candidatura.', 'error');
    } finally {
      setSavingCallId(null);
    }
  };

  const getWorkshopRegistration = (workshopId = '') => workshopRegistrationsByWorkshop.get(workshopId) || null;

  const getWorkshopFreeSeats = (workshop = {}) => {
    if (workshop.unlimitedCapacity) return null;
    return Math.max(0, Number(workshop.capacity || 0) - Number(workshop.confirmedCount || 0));
  };

  const isWorkshopRegistrationOpen = (workshop = {}) => {
    const nowLocal = getLocalDateTimeString();
    if (workshop.status !== 'published') return false;
    if (workshop.publishAt && workshop.publishAt > nowLocal) return false;
    if (!workshop.registrationDeadline || workshop.registrationDeadline <= nowLocal) return false;
    return true;
  };

  const openWorkshopModal = (workshop) => {
    const initialAnswers = {};
    (workshop.questions || []).forEach(question => { initialAnswers[question.id] = ''; });
    setWorkshopAnswers(initialAnswers);
    setWorkshopModal(workshop);
  };

  const closeWorkshopModal = () => {
    if (isSendingWorkshopRegistration) return;
    setWorkshopModal(null);
    setWorkshopAnswers({});
  };

  const sendWorkshopRegistration = async () => {
    if (!workshopModal?.id || !profile?.id || isSendingWorkshopRegistration) return;

    const currentWorkshop = workshops.find(workshop => workshop.id === workshopModal.id) || workshopModal;
    const missingRequiredAnswer = (currentWorkshop.questions || []).some(question => question.required && !String(workshopAnswers[question.id] || '').trim());
    if (missingRequiredAnswer) {
      showToast('Completa las preguntas obligatorias antes de continuar.', 'error');
      return;
    }

    const workshopRef = doc(db, 'artifacts', appId, 'workshops', currentWorkshop.id);
    const registrationId = buildWorkshopRegistrationId(currentWorkshop.id, profile.id);
    const registrationRef = doc(db, 'artifacts', appId, 'workshopRegistrations', registrationId);
    const nowIso = new Date().toISOString();

    setIsSendingWorkshopRegistration(true);
    try {
      const registrationStatus = await runTransaction(db, async transaction => {
        const workshopSnap = await transaction.get(workshopRef);
        const registrationSnap = await transaction.get(registrationRef);
        if (!workshopSnap.exists()) throw new Error('WORKSHOP_NOT_FOUND');

        const workshopData = workshopSnap.data();
        const nowLocal = getLocalDateTimeString();
        if (workshopData.status !== 'published' || (workshopData.publishAt && workshopData.publishAt > nowLocal) || !workshopData.registrationDeadline || workshopData.registrationDeadline <= nowLocal) {
          throw new Error('REGISTRATION_CLOSED');
        }

        if (registrationSnap.exists()) {
          const existingStatus = registrationSnap.data().status;
          if (['confirmed', 'pending', 'waitlist'].includes(existingStatus)) throw new Error('ALREADY_REGISTERED');
          if (existingStatus === 'rejected') throw new Error('REGISTRATION_REJECTED');
        }

        const confirmedCount = Number(workshopData.confirmedCount || 0);
        const capacity = Number(workshopData.capacity || 0);
        const isFull = !workshopData.unlimitedCapacity && confirmedCount >= capacity;
        let status = 'confirmed';

        if (isFull) {
          if (!workshopData.waitlistEnabled) throw new Error('WORKSHOP_FULL');
          status = 'waitlist';
        } else if (workshopData.registrationMode === 'manual_review') {
          status = 'pending';
        }

        const answers = (workshopData.questions || []).map(question => ({
          questionId: question.id,
          question: question.label,
          answer: String(workshopAnswers[question.id] || '').trim()
        }));

        transaction.set(registrationRef, {
          workshopId: currentWorkshop.id,
          workshopTitle: workshopData.title || currentWorkshop.title,
          studentId: profile.id,
          studentName: profile.name || '',
          studentEmail: profile.email || user.email || '',
          status,
          answers,
          price: Number(workshopData.price || 0),
          priceType: workshopData.priceType || 'free',
          paymentMethod: workshopData.paymentMethod || '',
          billingPending: workshopData.priceType === 'paid',
          createdAt: registrationSnap.exists() ? (registrationSnap.data().createdAt || nowIso) : nowIso,
          updatedAt: nowIso
        });

        const counterField = status === 'confirmed' ? 'confirmedCount' : status === 'pending' ? 'pendingCount' : 'waitlistCount';
        transaction.update(workshopRef, {
          [counterField]: Number(workshopData[counterField] || 0) + 1,
          updatedAt: nowIso
        });

        return status;
      });

      setWorkshopModal(null);
      setWorkshopAnswers({});
      if (registrationStatus === 'confirmed') showToast('¡Ya estás apuntado al taller!');
      if (registrationStatus === 'pending') showToast('Solicitud enviada. Queda pendiente de revisión.');
      if (registrationStatus === 'waitlist') showToast('Te has apuntado a la lista de espera.');
    } catch (error) {
      const messages = {
        WORKSHOP_NOT_FOUND: 'Este taller ya no está disponible.',
        REGISTRATION_CLOSED: 'La inscripción ya está cerrada.',
        ALREADY_REGISTERED: 'Ya tienes una inscripción activa en este taller.',
        REGISTRATION_REJECTED: 'Administración rechazó esta solicitud. Contacta con la escuela si necesitas revisarla.',
        WORKSHOP_FULL: 'El taller está completo y no admite lista de espera.'
      };
      console.error('Error al inscribirse en taller', error);
      showToast(messages[error.message] || 'No se ha podido completar la inscripción.', 'error');
    } finally {
      setIsSendingWorkshopRegistration(false);
    }
  };

  const cancelWorkshopRegistration = async (workshop) => {
    const registration = getWorkshopRegistration(workshop.id);
    if (!registration || !['confirmed', 'pending', 'waitlist'].includes(registration.status)) return;
    if (workshop.cancellationMode !== 'allowed_until' || !workshop.cancellationDeadline || workshop.cancellationDeadline <= getLocalDateTimeString()) {
      showToast('Esta inscripción ya no puede cancelarse desde el portal.', 'error');
      return;
    }
    if (!window.confirm(`¿Cancelar tu inscripción en “${workshop.title}”?`)) return;

    const workshopRef = doc(db, 'artifacts', appId, 'workshops', workshop.id);
    const registrationRef = doc(db, 'artifacts', appId, 'workshopRegistrations', registration.id);
    const nowIso = new Date().toISOString();
    setIsSendingWorkshopRegistration(true);
    try {
      await runTransaction(db, async transaction => {
        const workshopSnap = await transaction.get(workshopRef);
        const registrationSnap = await transaction.get(registrationRef);
        if (!workshopSnap.exists() || !registrationSnap.exists()) throw new Error('NOT_FOUND');
        const currentRegistration = registrationSnap.data();
        if (!['confirmed', 'pending', 'waitlist'].includes(currentRegistration.status)) return;
        const workshopData = workshopSnap.data();
        const counterField = currentRegistration.status === 'confirmed' ? 'confirmedCount' : currentRegistration.status === 'pending' ? 'pendingCount' : 'waitlistCount';
        transaction.update(registrationRef, { status: 'cancelled', cancelledAt: nowIso, updatedAt: nowIso });
        transaction.update(workshopRef, { [counterField]: Math.max(0, Number(workshopData[counterField] || 0) - 1), updatedAt: nowIso });
      });
      setWorkshopModal(null);
      showToast('Inscripción cancelada.');
    } catch (error) {
      console.error('Error al cancelar inscripción de taller', error);
      showToast('No se ha podido cancelar la inscripción.', 'error');
    } finally {
      setIsSendingWorkshopRegistration(false);
    }
  };

  const checkRegistration = async () => {
    setLoading(true);
    setProfileLoadError('');
    setProfile(null);
    try {
      const q = query(collection(db, 'artifacts', appId, 'students'), where("email", "==", user.email));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const studentData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        setProfile(studentData);
      }
    } catch (error) {
      console.error('Error al localizar el perfil del alumno', error);
      setProfileLoadError('No se ha podido consultar tu perfil. Puede ser un problema temporal de conexión o permisos.');
    } finally {
      setLoading(false);
    }
  };

  const handleOnboarding = async (e) => {
    e.preventDefault();
    const studentId = Date.now().toString();
    const data = { 
        name: onboarding.name, 
        email: user.email, 
        claimed: true, 
        instruments: [onboarding.instrument],
        classes: onboarding.classId ? [onboarding.classId] : [],
        hasMitobox: false,
        hasMitoverso: false,
        triviaPoints: 0,
        triviaVictories: 0
    };
    await setDoc(doc(db, 'artifacts', appId, 'students', studentId), data);
    setProfile({ id: studentId, ...data });
  };

  const openAbsenceModal = (clase) => {
    const scheduleInfo = clase.nextClassInfo || getNextClassScheduleInfo(clase) || getNextClassInfo(clase.dayOfWeek, clase.time);
    const info = {
      date: scheduleInfo.date,
      dateStr: scheduleInfo.dateStr,
      diffHours: scheduleInfo.diffHours
    };
    setHealthCheck(false); 
    setAbsenceModal({ clase, ...info });
  };

  const formatClassLineForAdminCopy = (clase) => {
    if (!clase) return '';
    const roomName = getClassRoomName(clase);
    return `${clase.subject || 'Clase'} · ${getDayName(clase.dayOfWeek)} · ${clase.time || ''}h · ${getClassCenterName(clase)}${roomName ? ` · ${roomName}` : ''}${clase.teacher ? ` · Prof. ${clase.teacher}` : ''}`;
  };

  const sendAdminGestionCopy = async ({ gestionId, payload, selectedClass = null, phase = 'recibida', status = 'pendiente' }) => {
    if (!payload || !ADMIN_COPY_GESTION_TYPES.has(payload.type)) return false;

    const typeLabel = (payload.type || 'gestion').replace(/_/g, ' ');
    const phaseLabel = phase === 'ejecutada' ? 'Gestión ejecutada' : 'Nueva gestión';
    const classLine = payload.requestedClassLine || formatClassLineForAdminCopy(selectedClass) || payload.requestedClass || '';
    const sourceClassLine = payload.sourceClassLine || '';
    const requestedDate = payload.recoveryDate ? formatDateSpanish(payload.recoveryDate) : '';
    const maintenancePeriodLine = payload.maintenanceFrom && payload.maintenanceUntil ? formatMaintenancePeriodLine({ from: payload.maintenanceFrom, until: payload.maintenanceUntil }) : '';
    const submittedAt = payload.date ? new Date(payload.date).toLocaleString('es-ES') : new Date().toLocaleString('es-ES');
    const extraServiceLine = payload.extraServiceName || payload.serviceName || '';
    const extraMonthlyFeeLine = payload.extraMonthlyFee ? `${payload.extraMonthlyFee} €` : '';
    const extraProratedFeeLine = payload.extraProratedFee ? `${payload.extraProratedFee} €` : (extraServiceLine ? 'A calcular manualmente según fecha real de activación' : '');
    const extraProrationPeriodLine = payload.extraProrationFrom && payload.extraProrationUntil ? `${formatDateSpanish(payload.extraProrationFrom)} - ${formatDateSpanish(payload.extraProrationUntil)}` : (extraServiceLine ? 'Mes corriente según activación administrativa' : '');

    const body = `TIPO_GESTION: ${typeLabel}
ESTADO: ${status}
FASE: ${phaseLabel}
ALUMNO: ${payload.studentName || ''}
EMAIL: ${payload.studentEmail || ''}
ALCANCE_BAJA: ${payload.type === 'baja' ? (payload.bajaScope === 'total' ? 'baja total de todas las clases' : 'baja de plaza concreta') : ''}
PLAZA_ORIGEN: ${sourceClassLine}
CLASE_SOLICITADA: ${classLine}
FECHA_RECUPERACION: ${requestedDate}
MES_OBJETIVO: ${payload.targetMonth || ''}
PERIODO_MANTENIMIENTO: ${maintenancePeriodLine}
DURACION_MANTENIMIENTO: ${payload.maintenanceMonths ? `${payload.maintenanceMonths} mes(es)` : ''}
CUOTA_MANTENIMIENTO: ${payload.maintenanceFee ? `${payload.maintenanceFee} €` : ''}
SERVICIO_EXTRA: ${extraServiceLine}
CUOTA_MENSUAL_EXTRA: ${extraMonthlyFeeLine}
PRORRATA_MES_ACTUAL: ${extraProratedFeeLine}
PERIODO_PRORRATA_EXTRA: ${extraProrationPeriodLine}
FECHA_SOLICITUD: ${submittedAt}
ID_GESTION: ${gestionId || ''}
ORIGEN: Portal del alumno

DETALLES:
${payload.details || payload.title || 'Sin detalles añadidos.'}`;

    try {
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          type: 'notificacion_email',
          to: ADMIN_GESTION_EMAIL,
          subject: `[${phaseLabel}] ${typeLabel} - ${payload.studentName || 'Alumno'}`,
          body
        })
      });
      return true;
    } catch (e) {
      console.warn('No se pudo enviar copia interna de gestión', e);
      return false;
    }
  };

  const confirmAbsence = async (wantsTicket) => {
    if (!absenceModal || !profile || isSendingAbsence) return;
    
    setIsSendingAbsence(true);
    
    const isLate = absenceModal.diffHours < 16;
    const status = (!isLate && wantsTicket) ? 'notified' : 'notified_no_ticket';
    
    try {
      const classRef = doc(db, absenceModal.clase.refPath);
      
      const currentExceptions = absenceModal.clase.exceptions?.[absenceModal.dateStr] || {};
      currentExceptions[profile.id] = status; 
      
      const activeStudents = (absenceModal.clase.students || []).filter(s => !isStudentInMaintenanceForDate(getStudentEntryId(s), absenceModal.dateStr));
      const allAbsentNow = activeStudents.length > 0 && activeStudents.every(s => {
        const st = currentExceptions[getStudentEntryId(s)];
        return st === 'absent' || st === 'notified' || st === 'notified_no_ticket';
      });

      const isCancelledWithNotice = allAbsentNow && (absenceModal.diffHours >= 2);

      await setDoc(classRef, { 
        exceptions: { [absenceModal.dateStr]: { [profile.id]: status } },
        ...(isCancelledWithNotice ? { autoCancelled: { [absenceModal.dateStr]: true } } : {})
      }, { merge: true });
      
      const gestionId = `falta-${Date.now()}`;
      await setDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), {
        studentId: profile.id,
        studentName: profile.name,
        studentEmail: profile.email,
        type: 'aviso_ausencia',
        title: `Falta a clase: ${absenceModal.clase.subject}`,
        details: `El alumno no asistirá el ${formatDateSpanish(absenceModal.dateStr)} a las ${absenceModal.clase.time}h. ${!isLate && wantsTicket ? '(Aviso en plazo)' : '(Aviso fuera de plazo o sin justificar)'}`,
        requestedClass: absenceModal.clase.id, 
        status: 'pendiente',
        date: new Date().toISOString()
      });

      try {
        const emailProfe = `${absenceModal.clase.teacher.toLowerCase().replace(' ', '.')}@escuelalosmitos.com`; 
        
        let subjectEmail = `⚠️ Aviso de falta: ${profile.name} (${absenceModal.clase.subject})`;
        let bodyEmail = `Hola ${absenceModal.clase.teacher},\n\nEl alumno ${profile.name} ha avisado que NO asistirá a tu clase de ${absenceModal.clase.subject} el próximo ${formatDateSpanish(absenceModal.dateStr)} a las ${absenceModal.clase.time}h.\n\n${isLate ? '⚠️ IMPORTANTE: El aviso se ha realizado FUERA DE PLAZO (con menos de 16h de antelación).' : '✅ El aviso se ha realizado dentro de plazo.'}\n\nEl sistema ya ha actualizado tu lista de asistencia para que no le esperes.\n\nUn saludo,\nCoordinación Los Mitos.`;

        if (isCancelledWithNotice) {
          subjectEmail = `🚨 CLASE CANCELADA (+2h antelación): ${absenceModal.clase.subject} a las ${absenceModal.clase.time}h`;
          bodyEmail = `Hola ${absenceModal.clase.teacher},\n\nTe informamos que TODOS los alumnos de tu clase de ${absenceModal.clase.subject} del ${formatDateSpanish(absenceModal.dateStr)} a las ${absenceModal.clase.time}h han avisado de su ausencia.\n\nAl haberse vaciado la clase con MÁS DE 2 HORAS de antelación, esta sesión queda CANCELADA.\n\nSegún normativa, esta hora no requiere asistencia presencial, no se habilitará el protocolo de tareas y no computará en nómina.\n\nUn saludo,\nCoordinación Los Mitos.`;
        } else if (allAbsentNow) {
          subjectEmail = `⚠️ CLASE VACÍA (Aviso de última hora): ${absenceModal.clase.subject} a las ${absenceModal.clase.time}h`;
          bodyEmail = `Hola ${absenceModal.clase.teacher},\n\nTe informamos que TODOS los alumnos de tu clase de ${absenceModal.clase.subject} del ${formatDateSpanish(absenceModal.dateStr)} a las ${absenceModal.clase.time}h han avisado de su ausencia.\n\nComo el último aviso se ha producido con MENOS DE 2 HORAS de antelación, mantienes tu derecho a cobrar la hora.\n\nAl abrir la App para pasar lista, se activará el Protocolo de Hora Muerta para que selecciones una tarea y puedas registrarla en tu nómina.\n\nUn saludo,\nCoordinación Los Mitos.`;
        }
        
        await fetch(APPS_SCRIPT_URL, {
          method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ type: 'notificacion_profesor', teacherEmail: emailProfe, subject: subjectEmail, body: bodyEmail })
        });
      } catch(e) {}

      setAbsenceModal(null);
      showToast('Aviso enviado correctamente al profesor.');

    } catch (error) {
      showToast('Error al enviar el aviso.', 'error');
    } finally {
      setIsSendingAbsence(false);
    }
  };

  const sendGestion = async () => {
    const isTicketRedemption = gestionModal.type === 'recuperacion';
    const isAmpliarClases = gestionModal.type === 'ampliar_clases';
    const isMaintenanceRequest = gestionModal.type === 'mantenimiento';
    const isSourceClassGestion = ['cambio_horario', 'baja'].includes(gestionModal.type);
    const isBajaTotalRequest = gestionModal.type === 'baja' && isMultiSeatStudent && bajaTotalRequested;
    const gestionUiCopyForPayload = getGestionUiCopy(gestionModal.type, { isBajaTotalRequest });
    const sourceClassCandidates = getAvailableFixedSeatClassesForGestion(gestionModal.type);
    const resolvedSourceClass = isSourceClassGestion && !isBajaTotalRequest
      ? (selectedSourceClass || (sourceClassCandidates.length === 1 ? sourceClassCandidates[0] : null))
      : null;
    const isExemptFromLateRule = isTicketRedemption || isAmpliarClases;

    if (isStudentFrozen && frozenRestrictedGestionTypes.includes(gestionModal.type)) {
      showToast('Con la plaza en mantenimiento no puedes gestionar recuperaciones, cambios ni ampliaciones hasta que termine el periodo.', 'error');
      return;
    }

    if (isMaintenanceRequest && ![1, 2].includes(Number(maintenanceMonths))) {
      showToast('Elige si quieres mantenimiento durante 1 mes o 2 meses.', 'error');
      return;
    }

    if (isSourceClassGestion && !isBajaTotalRequest && !resolvedSourceClass) {
      showToast('Elige la plaza concreta sobre la que quieres hacer este trámite.', 'error');
      return;
    }
    if (resolvedSourceClass && hasPendingGestionForClass(resolvedSourceClass.id)) {
      showToast('Ya hay un trámite pendiente sobre esa plaza. Puedes gestionar otra plaza distinta, pero no repetir sobre la misma.', 'error');
      return;
    }
    
    if (!isExemptFromLateRule && timeRules.isLate && !acceptLatePenalty) {
      showToast('Debes aceptar las condiciones de plazo marcando la casilla.', 'error');
      return;
    }

    if (isTicketRedemption && hasReachedRecoveryLimit) {
      showToast('Ya tienes tantas recuperaciones solicitadas o programadas como tickets disponibles.', 'error');
      return;
    }
    
    setIsSendingGestion(true);
    try {
      const gestionId = Date.now().toString();
      const payload = {
        studentId: profile.id,
        studentName: profile.name,
        studentEmail: profile.email,
        sourceClassId: resolvedSourceClass ? resolvedSourceClass.id : null,
        sourceClass: resolvedSourceClass ? resolvedSourceClass.id : null,
        sourceClassLine: resolvedSourceClass ? formatClassLineForAdminCopy(resolvedSourceClass) : '',
        sourceSubject: resolvedSourceClass?.subject || '',
        sourceTeacher: resolvedSourceClass?.teacher || '',
        sourceSede: resolvedSourceClass ? getClassCenterName(resolvedSourceClass) : '',
        sourceSala: resolvedSourceClass ? getClassRoomName(resolvedSourceClass) : '',
        sourceCenterId: resolvedSourceClass ? (getClassCenter(resolvedSourceClass)?.id || resolvedSourceClass.centerId || '') : '',
        sourceRoomId: resolvedSourceClass ? (getClassRoom(resolvedSourceClass)?.id || resolvedSourceClass.roomId || '') : '',
        sourceDayOfWeek: resolvedSourceClass?.dayOfWeek ?? null,
        sourceTime: resolvedSourceClass?.time || '',
        bajaScope: gestionModal.type === 'baja' ? (isBajaTotalRequest ? 'total' : 'plaza') : '',
        bajaTotal: Boolean(isBajaTotalRequest),
        isTotalBaja: Boolean(isBajaTotalRequest),
        isPartialSeatGestion: Boolean(resolvedSourceClass && !isBajaTotalRequest),
        type: gestionModal.type,
        title: gestionUiCopyForPayload.title || gestionModal.title,
        details: gestionText,
        requestedClass: selectedNewClass ? selectedNewClass.id : null,
        requestedClassLine: selectedNewClass ? formatClassLineForAdminCopy(selectedNewClass) : '',
        requestedTeacher: selectedNewClass?.teacher || '',
        requestedSede: selectedNewClass ? getClassCenterName(selectedNewClass) : '',
        requestedSala: selectedNewClass ? getClassRoomName(selectedNewClass) : '',
        requestedCenterId: selectedNewClass ? (getClassCenter(selectedNewClass)?.id || selectedNewClass.centerId || '') : '',
        requestedRoomId: selectedNewClass ? (getClassRoom(selectedNewClass)?.id || selectedNewClass.roomId || '') : '',
        recoveryDate: isTicketRedemption ? selectedRecoveryDate : null, 
        maintenanceMonths: isMaintenanceRequest ? selectedMaintenanceOption.months : null,
        maintenanceFee: isMaintenanceRequest ? selectedMaintenanceOption.fee : null,
        maintenanceFrom: isMaintenanceRequest ? selectedMaintenanceOption.from : null,
        maintenanceUntil: isMaintenanceRequest ? selectedMaintenanceOption.until : null,
        maintenancePeriodLine: isMaintenanceRequest ? formatMaintenancePeriodLine(selectedMaintenanceOption) : '',
        maintenanceMonthLabel: isMaintenanceRequest ? selectedMaintenanceOption.monthLabel : '',
        targetMonth: (!isExemptFromLateRule && timeRules.isLate) ? timeRules.nextNext : timeRules.next,
        isLateRequest: !isExemptFromLateRule && timeRules.isLate,
        status: 'pendiente',
        date: new Date().toISOString()
      };

      await setDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), payload);
      if (ADMIN_COPY_GESTION_TYPES.has(payload.type)) {
        const sent = await sendAdminGestionCopy({ gestionId, payload, selectedClass: selectedNewClass, phase: 'recibida', status: 'pendiente' });
        if (sent) {
          await updateDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), {
            adminCopySentAt: new Date().toISOString(),
            adminCopyRecipient: ADMIN_GESTION_EMAIL
          });
        }
      }
      setGestionModal(null);
      setGestionText('');
      setSelectedNewClass(null);
      setSelectedSourceClass(null);
      setBajaTotalRequested(false);
      setSelectedRecoveryDate('');
      setMaintenanceMonths(1);
      setAcceptLatePenalty(false);
      setSelectedInst(''); 
      showToast('Solicitud enviada a Administración.');
    } catch (error) {
      showToast('Error al enviar la solicitud.', 'error');
    } finally {
      setIsSendingGestion(false);
    }
  };

  const hasPendingExtraSignup = (serviceKey = '') => {
    const serviceConfig = getExtraServiceConfig(serviceKey);
    if (!serviceConfig) return false;
    return myGestiones.some(g => g.status === 'pendiente' && g.type === serviceConfig.type);
  };

  const openExtraSignupModal = (serviceKey) => {
    const serviceConfig = getExtraServiceConfig(serviceKey);
    if (!serviceConfig) return;

    if (serviceKey === 'mitoverso' && profile?.hasMitoverso) {
      window.open('https://classroom.google.com/', '_blank', 'noopener,noreferrer');
      return;
    }

    if (serviceKey === 'mitobox' && profile?.hasMitobox) {
      setMitoboxModal(true);
      return;
    }

    if (hasPendingExtraSignup(serviceKey)) {
      showToast(`Ya tienes una solicitud de alta en ${serviceConfig.name} pendiente de revisión.`, 'error');
      return;
    }

    setExtraSignupModal(serviceKey);
  };

  const closeExtraSignupModal = () => {
    if (isSendingExtraSignup) return;
    setExtraSignupModal(null);
  };

  const sendExtraSignupRequest = async () => {
    const serviceConfig = getExtraServiceConfig(extraSignupModal);
    if (!serviceConfig || !profile?.id || isSendingExtraSignup) return;

    if (hasPendingExtraSignup(serviceConfig.key)) {
      showToast(`Ya tienes una solicitud de alta en ${serviceConfig.name} pendiente de revisión.`, 'error');
      setExtraSignupModal(null);
      return;
    }

    const gestionId = `${serviceConfig.type}-${Date.now()}`;
    const nowIso = new Date().toISOString();

    setIsSendingExtraSignup(true);
    try {
      const payload = {
        studentId: profile.id,
        studentName: profile.name,
        studentEmail: profile.email,
        type: serviceConfig.type,
        title: serviceConfig.title,
        details: `${profile.name} solicita el alta en ${serviceConfig.name}. Acepta que se le cobre la parte proporcional del mes corriente y que después se aplique la cuota mensual de ${serviceConfig.monthlyFee}€. Administración debe activar el acceso manualmente y preparar la domiciliación en Tadosi.`,
        extraService: serviceConfig.key,
        extraServiceName: serviceConfig.name,
        serviceName: serviceConfig.name,
        extraMonthlyFee: serviceConfig.monthlyFee,
        extraProratedFee: null,
        extraProrationFrom: '',
        extraProrationUntil: '',
        extraProrationDays: null,
        extraProrationMonth: '',
        extraProrationPolicy: 'parte_proporcional_mes_corriente_segun_fecha_activacion_admin',
        requiresManualActivation: true,
        requiresTadosiSetup: true,
        tadosiDone: false,
        status: 'pendiente',
        date: nowIso
      };

      await setDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), payload);

      if (ADMIN_COPY_GESTION_TYPES.has(payload.type)) {
        const sent = await sendAdminGestionCopy({ gestionId, payload, phase: 'recibida', status: 'pendiente' });
        if (sent) {
          await updateDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), {
            adminCopySentAt: new Date().toISOString(),
            adminCopyRecipient: ADMIN_GESTION_EMAIL
          });
        }
      }

      setExtraSignupModal(null);
      showToast(`Solicitud de alta en ${serviceConfig.name} enviada a Administración.`);
    } catch (error) {
      console.error('Error al solicitar alta extra', error);
      showToast(`Error al solicitar el alta en ${serviceConfig.name}.`, 'error');
    } finally {
      setIsSendingExtraSignup(false);
    }
  };

  const sendMitoboxReservation = async () => {
    if (!mboxDate || !mboxSede || !mboxInst || !mboxSelectedSlot) return;
    setIsSendingGestion(true);
    try {
      const gestionId = `mbox-res-${Date.now()}`;
      const selectedCenter = getCenterForValue(mboxSede);
      const selectedRoom = findRoomByValue(selectedCenter, mboxSelectedSlot.roomId || mboxSelectedSlot.sala);
      const selectedCenterName = selectedCenter?.name || mboxSede;
      const selectedRoomName = selectedRoom?.name || mboxSelectedSlot.sala;
      await setDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), {
        studentId: profile.id,
        studentName: profile.name,
        studentEmail: profile.email,
        type: 'reserva_mitobox',
        title: 'Reserva de Sala (Mitobox)',
        details: `Reserva para ensayar: ${mboxInst}. Fecha: ${formatDateSpanish(mboxDate)}. Sede: ${selectedCenterName}. Hora: ${mboxSelectedSlot.time}h en ${selectedRoomName}`,
        status: 'pendiente',
        date: new Date().toISOString(),
        reservationDate: mboxDate,
        reservationTime: mboxSelectedSlot.time,
        instrument: mboxInst,
        sede: selectedCenterName,
        sala: selectedRoomName,
        centerId: selectedCenter?.id || '',
        roomId: selectedRoom?.id || mboxSelectedSlot.roomId || ''
      });

      const [y, m, d] = mboxDate.split('-');
      const [h, min] = mboxSelectedSlot.time.split(':');
      const startDate = new Date(y, m - 1, d, h, min);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); 

      const formatDateICS = (date) => date.toISOString().replace(/-|:|\.\d+/g, '');
      const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART:${formatDateICS(startDate)}
DTEND:${formatDateICS(endDate)}
SUMMARY:Ensayo Mitobox - Escuela Los Mitos
DESCRIPTION:Reserva para ensayar ${mboxInst} en ${selectedCenterName} (${selectedRoomName})
LOCATION:Escuela Los Mitos - ${selectedCenterName}${selectedCenter?.address ? ` - ${selectedCenter.address}` : ''}
END:VEVENT
END:VCALENDAR`;

      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Ensayo_Mitobox_${mboxDate}.ics`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setMitoboxModal(false);
      setMboxDate('');
      setMboxSelectedSlot(null);
      setMboxInst('');
      showToast('Reserva confirmada. Se ha descargado el archivo para tu calendario.');
    } catch (e) {
      showToast('Error al reservar sala.', 'error');
    } finally {
      setIsSendingGestion(false);
    }
  };

  const dailyQuestionIndex = (getDayOfYear() * 137) % TRIVIA_QUESTIONS.length;
  const currentQuestion = TRIVIA_QUESTIONS[dailyQuestionIndex];
  const hasPlayedToday = profile?.triviaLastPlayed === todayStr;

  const diffMap = {
    'facil': { label: 'Fácil', points: 3, color: 'text-emerald-700', bg: 'bg-emerald-100', border: 'border-emerald-500' },
    'medio': { label: 'Medio', points: 6, color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-amber-500' },
    'dificil': { label: 'Difícil', points: 9, color: 'text-rose-700', bg: 'bg-rose-100', border: 'border-rose-500' }
  };
  
  const currentDifficulty = diffMap[currentQuestion.difficulty || 'facil'];

 const getYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const yesterdayStr = getYesterdayStr();

  const startTrivia = () => {
    setTriviaSelected(null);
    setTriviaResult(null);
    setTriviaTime(10);
    setTriviaModal(true);
  };

  const handleTriviaAnswer = async (index) => {
    if (triviaResult) return;
    setTriviaSelected(index);
    
    let isCorrect = index === currentQuestion.correct;
    let newResultStatus = isCorrect ? 'win' : (index === -1 ? 'timeout' : 'lose');
    
    let pointsEarned = 0;
    let speedBonus = 0;
    let streakBonus = 0;
    let newStreak = profile.triviaStreak || 0;

    if (isCorrect) {
      pointsEarned += currentDifficulty.points;
      
      if (triviaTime >= 7) {
        speedBonus = 2;
        pointsEarned += speedBonus;
      }
      
      if (profile.triviaLastPlayed === yesterdayStr) {
        newStreak += 1;
      } else {
        newStreak = 1;
      }

      if (newStreak > 0 && newStreak % 3 === 0) {
         streakBonus = 5;
         pointsEarned += streakBonus;
      }
    } else {
       newStreak = 0; 
    }

    setTriviaResult({
       status: newResultStatus,
       points: pointsEarned,
       speed: speedBonus,
       streak: streakBonus,
       newStreakCount: newStreak
    });

    let newTotalPoints = (profile.triviaPoints || 0) + pointsEarned;

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'students', profile.id), {
        triviaLastPlayed: todayStr,
        triviaPoints: newTotalPoints,
        triviaStreak: newStreak
      });
    } catch (e) {}

    setTimeout(() => {
      setTriviaModal(false);
    }, 3500); 
  };

  const pendingAbsences = [];
  const pendingProcedures = myGestiones.filter(g => g.status === 'pendiente');
  const pendingMitoversoSignup = hasPendingExtraSignup('mitoverso');
  const pendingMitoboxSignup = hasPendingExtraSignup('mitobox');
  
  const pendingAdminGestiones = myGestiones.filter(g => 
    g.status === 'pendiente' && 
    ['baja', 'mantenimiento', 'reactivar_plaza', 'cambio_horario', 'ampliar_clases'].includes(g.type)
  );

  const isMultiSeatStudent = fixedSeatClasses.length > 1;
  const isSeatSpecificGestionType = (type = '') => ['baja', 'cambio_horario'].includes(type);
  const isTotalBajaGestion = (gestion = {}) => gestion.type === 'baja' && (
    gestion.bajaScope === 'total' ||
    gestion.isTotalBaja === true ||
    gestion.bajaTotal === true ||
    gestion.totalBaja === true
  );
  const getGestionSourceClassId = (gestion = {}) => String(gestion.sourceClassId || gestion.sourceClass || gestion.affectedClassId || '').trim();
  const isSeatSpecificPendingGestion = (gestion = {}) => (
    isSeatSpecificGestionType(gestion.type) &&
    !isTotalBajaGestion(gestion) &&
    Boolean(getGestionSourceClassId(gestion))
  );
  const pendingSeatSpecificGestiones = pendingAdminGestiones.filter(isSeatSpecificPendingGestion);
  const pendingGlobalAdminGestiones = pendingAdminGestiones.filter(g => !isSeatSpecificPendingGestion(g));
  const hasPendingAdminGestion = pendingAdminGestiones.length > 0;
  const hasGlobalPendingAdminGestion = pendingGlobalAdminGestiones.length > 0;
  const pendingSeatGestionClassIds = new Set(pendingSeatSpecificGestiones.map(getGestionSourceClassId));
  const hasPendingGestionForClass = (classId) => pendingSeatGestionClassIds.has(String(classId || '').trim());
  const getAvailableFixedSeatClassesForGestion = (type = '') => (
    isMultiSeatStudent && isSeatSpecificGestionType(type)
      ? fixedSeatClasses.filter(c => !hasPendingGestionForClass(c.id))
      : fixedSeatClasses
  );
  const hasAvailableSeatForGestion = (type = '') => getAvailableFixedSeatClassesForGestion(type).length > 0;
  const getSeatGestionLockMessage = (type = 'trámite') => {
    if (hasGlobalPendingAdminGestion) return 'Ya tienes un trámite que afecta a toda tu cuenta. No puedes solicitar otro hasta que se resuelva.';
    if (isSeatSpecificGestionType(type) && !hasAvailableSeatForGestion(type)) {
      return isMultiSeatStudent
        ? 'Ya tienes un trámite pendiente sobre todas tus plazas disponibles para esta gestión.'
        : 'Ya tienes un trámite pendiente sobre esta plaza. No puedes repetir gestión sobre la misma hasta que se resuelva.';
    }
    return '';
  };

  const pendingRecoveryGestiones = myGestiones.filter(g =>
    g.status === 'pendiente' &&
    g.type === 'recuperacion'
  );

  const scheduledRecoveryGestiones = myGestiones.filter(g =>
    g.status === 'completado' &&
    g.type === 'recuperacion' &&
    g.recoveryDate &&
    g.recoveryDate >= todayStr
  );

  const committedRecoveryCount = pendingRecoveryGestiones.length + scheduledRecoveryGestiones.length;
  const availableRecoveryTickets = profile?.activeTickets || 0;
  const hasReachedRecoveryLimit = committedRecoveryCount >= availableRecoveryTickets;
  const isStudentFrozen = Boolean(activeMaintenancePeriod);
  const maintenancePeriodText = activeMaintenancePeriod ? formatMaintenancePeriodLine(activeMaintenancePeriod) : '';
  const frozenRestrictedGestionTypes = ['recuperacion', 'cambio_horario', 'ampliar_clases'];
  const isAcademicGestionLocked = isStudentFrozen || hasGlobalPendingAdminGestion;
  const isChangeHorarioLocked = isStudentFrozen || hasGlobalPendingAdminGestion || !hasAvailableSeatForGestion('cambio_horario');
  const isBajaLocked = hasGlobalPendingAdminGestion || !hasAvailableSeatForGestion('baja');
  const isMantenimientoLocked = hasPendingAdminGestion;

  const getGestionUiCopy = (type = '', { isBajaTotalRequest = false } = {}) => {
    const commonPlaceholder = 'Añade observaciones para Administración, si lo necesitas.';
    const bajaPlaceholder = 'Puedes indicarnos brevemente el motivo de la baja. Nos ayuda a mejorar.';

    if (type === 'cambio_horario') {
      return isMultiSeatStudent
        ? {
            title: 'Cambiar horario fijo',
            description: 'Elige primero qué plaza quieres cambiar. Después verás grupos disponibles para ese mismo instrumento. El resto de tus clases no se modifican.',
            sourceLabel: '¿Qué plaza quieres cambiar?',
            searchLabel: 'Grupos disponibles para esa plaza',
            placeholder: commonPlaceholder
          }
        : {
            title: 'Cambiar horario fijo',
            description: 'Busca otro grupo disponible para tu misma asignatura. Tu plaza actual se mantiene hasta que Administración confirme el cambio.',
            sourceLabel: 'Tu plaza actual',
            searchLabel: 'Grupos disponibles',
            placeholder: commonPlaceholder
          };
    }

    if (type === 'mantenimiento') {
      return isMultiSeatStudent
        ? {
            title: 'Pasar a mantenimiento',
            description: 'El mantenimiento es por persona, no por clase. 15€/mes. Máximo 2 meses.',
            notice: 'Si tienes varias clases, el mantenimiento afectará a todas durante el periodo elegido.',
            placeholder: commonPlaceholder
          }
        : {
            title: 'Pasar a mantenimiento',
            description: 'Mantén tu plaza reservada durante una pausa temporal. 15€/mes. Máximo 2 meses.',
            notice: 'Durante el mantenimiento no asistirás a clase, pero conservarás tu plaza hasta que termine el periodo.',
            placeholder: commonPlaceholder
          };
    }

    if (type === 'baja') {
      if (isMultiSeatStudent && isBajaTotalRequest) {
        return {
          title: 'Dar de baja',
          description: 'Has seleccionado baja total de todas tus clases.',
          notice: 'Esta opción cancelará todas tus plazas y desactivará tu acceso al portal. También perderás los tickets de recuperación pendientes y los puntos acumulados del trivial.',
          sourceLabel: 'Baja total',
          placeholder: bajaPlaceholder
        };
      }

      return isMultiSeatStudent
        ? {
            title: 'Dar de baja',
            description: 'Elige qué plaza quieres dar de baja. Seguirás activo en las demás clases que mantengas.',
            notice: 'Si solo das de baja una plaza, conservarás el acceso al portal, tus otras clases, tus tickets de recuperación y tus puntos del trivial.',
            sourceLabel: '¿Qué plaza quieres dar de baja?',
            totalBajaCheckboxTitle: 'Quiero darme de baja de todas mis clases',
            totalBajaCheckboxText: 'Marca esta opción solo si quieres cancelar todas tus plazas.',
            placeholder: bajaPlaceholder
          }
        : {
            title: 'Dar de baja',
            description: 'Solicita la baja de tu plaza actual. Al tramitarse, dejarás de asistir a clase y se desactivará tu acceso al portal.',
            notice: 'La baja implica perder los tickets de recuperación pendientes y los puntos acumulados del trivial.',
            sourceLabel: 'Tu plaza actual',
            placeholder: bajaPlaceholder
          };
    }

    return {
      title: '',
      description: '',
      sourceLabel: 'Plaza afectada',
      searchLabel: '',
      placeholder: commonPlaceholder
    };
  };

  const handleAdminGestionClick = (gestionPayload) => {
    if (isStudentFrozen && frozenRestrictedGestionTypes.includes(gestionPayload.type)) {
      showToast('Con la plaza en mantenimiento no puedes solicitar cambios, ampliaciones ni recuperaciones hasta que termine el periodo.', 'error');
      return;
    }

    const isSourceClassGestion = ['cambio_horario', 'baja'].includes(gestionPayload.type);
    const availableSourceClasses = getAvailableFixedSeatClassesForGestion(gestionPayload.type);
    const isGlobalGestion = ['mantenimiento', 'reactivar_plaza'].includes(gestionPayload.type);

    if (isGlobalGestion && hasPendingAdminGestion) {
      showToast('Ya tienes un trámite administrativo en curso. Como este trámite afecta a toda tu cuenta, espera a que se resuelva.', 'error');
      return;
    }

    if (!isSourceClassGestion && hasGlobalPendingAdminGestion) {
      showToast(getSeatGestionLockMessage(gestionPayload.type), 'error');
      return;
    }

    if (isSourceClassGestion) {
      const lockMessage = getSeatGestionLockMessage(gestionPayload.type);
      if (lockMessage) {
        showToast(lockMessage, 'error');
        return;
      }
    }

    setSelectedNewClass(null);
    setSelectedRecoveryDate('');
    setBajaTotalRequested(false);
    setSelectedSourceClass(isSourceClassGestion && availableSourceClasses.length === 1 ? availableSourceClasses[0] : null);

    if (gestionPayload.type === 'mantenimiento') {
      setMaintenanceMonths(1);
    }
    setGestionModal(gestionPayload);
  };
  
  if (profile) {
    effectiveMyClasses.forEach(clase => {
      if (clase.exceptions) {
        Object.keys(clase.exceptions).forEach(dateStr => {
          if (dateStr >= todayStr) {
            const status = clase.exceptions[dateStr][profile.id];
            if (status === 'notified') {
              pendingAbsences.push({
                subject: clase.subject,
                date: dateStr
              });
            }
          }
        });
      }
    });
  }

  const getValidRecoveryDates = (dayOfWeekStr) => {
    const targetDay = parseInt(dayOfWeekStr);
    const validDates = [];
    let currentDate = new Date();
    currentDate.setDate(currentDate.getDate() + 1); 
    
    while (validDates.length < 4 && validDates.length < 30) { 
      if (currentDate.getDay() === targetDay) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const isGlobalBlocked = globalSettings.festivos.includes(dateStr) || globalSettings.vacaciones.includes(dateStr);
        const targetCenter = getClassCenter(selectedNewClass || {});
        const isLocalBlocked = Boolean(targetCenter?.holidays?.includes(dateStr));

        if (!isGlobalBlocked && !isLocalBlocked) {
          validDates.push(dateStr);
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return validDates;
  };

  const renderAbsenceModal = () => {
    if (!absenceModal) return null;
    const isLate = absenceModal.diffHours < 16;
    if (showRules) {
      return (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-start sm:items-center justify-center p-3 sm:p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-8 shadow-2xl relative my-4 sm:my-8 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <button onClick={() => setShowRules(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
            <div className="flex items-center gap-3 text-black mb-6"><FileText className="w-8 h-8" /><h2 className="text-xl font-black uppercase tracking-tight">Normativa</h2></div>
            <div className="space-y-4 text-sm text-zinc-600 font-medium">
              <p>1. <strong className="text-black">Preaviso de 16h:</strong> Para recuperar una clase, avisa con mín. 16 horas de antelación.</p>
              <p>2. <strong className="text-black">Caducidad:</strong> Los tickets normales caducan al mes siguiente de la falta. Los tickets de verano generados en junio, julio y agosto se podrán gestionar de septiembre a diciembre.</p>
              <p>3. <strong className="text-black">Alta activa:</strong> Solo alumnos al corriente de pago pueden recuperar.</p>
              <p>4. <strong className="text-black">Causas justificadas:</strong> Las recuperaciones solo se concederán por motivos de salud, trabajo o estudios.</p>
              <p>5. <strong className="text-black">Límite de recuperación:</strong> Las clases de recuperación no se pueden volver a recuperar en caso de nueva falta.</p>
            </div>
            <button onClick={() => setShowRules(false)} className="w-full mt-8 bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest">Entendido</button>
          </div>
        </div>
      );
    }
    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-start sm:items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-8 shadow-2xl relative animate-in zoom-in-95 duration-200 my-4 sm:my-8 max-h-[calc(100vh-2rem)] overflow-y-auto">
          <button onClick={() => setAbsenceModal(null)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          {isLate ? (
            <>
              <div className="flex items-center justify-center w-16 h-16 bg-red-100 text-red-500 rounded-full mb-6 mx-auto"><Clock className="w-8 h-8" /></div>
              <h2 className="text-2xl font-black text-center uppercase tracking-tight text-slate-800 mb-2">Aviso fuera de plazo</h2>
              <p className="text-center text-zinc-500 font-medium mb-6">Avisas con menos de 16h. Informaremos al profesor, pero <strong className="text-red-500">no generará ticket</strong>.</p>
              <div className="space-y-3">
                <button onClick={() => confirmAbsence(false)} disabled={isSendingAbsence} className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-800 shadow-lg disabled:opacity-50">
                  {isSendingAbsence ? 'Enviando...' : 'Avisar de todas formas'}
                </button>
                <button onClick={() => setAbsenceModal(null)} disabled={isSendingAbsence} className="w-full bg-zinc-100 text-zinc-500 font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-200 disabled:opacity-50">Cancelar</button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-center w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full mb-6 mx-auto"><CheckCircle className="w-8 h-8" /></div>
              <h2 className="text-2xl font-black text-center uppercase tracking-tight text-slate-800 mb-2">Aviso a tiempo</h2>
              <p className="text-center text-zinc-500 font-medium mb-4">Informaremos a tu profesor. Tienes derecho a recuperar esta clase el próximo mes.</p>
              <h3 className="font-black text-center text-sm uppercase tracking-widest text-slate-800 mb-2">¿Quieres ticket de recuperación?</h3>
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl mb-4">
                <p className="text-xs text-amber-800 font-bold mb-3 leading-relaxed">Recuerda que solo se puede recuperar por razones de <strong>salud, trabajo o estudios</strong>.</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={healthCheck} onChange={e => setHealthCheck(e.target.checked)} disabled={isSendingAbsence} className="w-4 h-4 accent-amber-600 rounded cursor-pointer disabled:cursor-not-allowed" />
                  <span className="text-xs font-black text-amber-950 uppercase tracking-widest">Cumplo las condiciones</span>
                </label>
              </div>
              <div className="space-y-3">
                <button onClick={() => confirmAbsence(true)} disabled={!healthCheck || isSendingAbsence} className="w-full bg-emerald-500 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-emerald-600 shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  {isSendingAbsence ? 'Enviando...' : 'Sí, quiero recuperarla'}
                </button>
                <button onClick={() => confirmAbsence(false)} disabled={isSendingAbsence} className="w-full bg-zinc-800 text-zinc-300 font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-black disabled:opacity-50">
                  {isSendingAbsence ? 'Enviando...' : 'No, gracias. Solo aviso.'}
                </button>
                <button onClick={() => setAbsenceModal(null)} disabled={isSendingAbsence} className="w-full bg-zinc-100 text-zinc-500 font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-200 disabled:opacity-50">Cancelar</button>
              </div>
            </>
          )}
          <div className="mt-8 pt-6 border-t border-zinc-100 text-center">
            <button onClick={() => setShowRules(true)} className="text-xs font-bold text-zinc-400 hover:text-black uppercase tracking-widest flex items-center justify-center gap-1 mx-auto"><FileText className="w-3 h-3"/> Leer Normativa de Recuperaciones</button>
          </div>
        </div>
      </div>
    );
  };

  const renderGestionModal = () => {
    if (!gestionModal) return null;
    const isClassSearch = gestionModal.type === 'cambio_horario' || gestionModal.type === 'ampliar_clases' || gestionModal.type === 'recuperacion';
    
    const isTicketRedemption = gestionModal.type === 'recuperacion';
    const isAmpliarClases = gestionModal.type === 'ampliar_clases';
    const isMaintenanceRequest = gestionModal.type === 'mantenimiento';
    const isSourceClassGestion = ['cambio_horario', 'baja'].includes(gestionModal.type);
    const isBajaRequest = gestionModal.type === 'baja';
    const canChooseTotalBaja = isBajaRequest && isMultiSeatStudent;
    const isBajaTotalRequest = canChooseTotalBaja && bajaTotalRequested;
    const gestionUiCopy = getGestionUiCopy(gestionModal.type, { isBajaTotalRequest });
    const modalTitle = gestionUiCopy.title || gestionModal.title;
    const modalDescription = gestionUiCopy.description || gestionModal.desc || '';
    const modalPlaceholder = gestionUiCopy.placeholder || gestionModal.placeholder || 'Añade observaciones para Administración, si lo necesitas.';
    const sourceClassCandidates = getAvailableFixedSeatClassesForGestion(gestionModal.type);
    const resolvedSourceClass = isSourceClassGestion && !isBajaTotalRequest
      ? (selectedSourceClass || (sourceClassCandidates.length === 1 ? sourceClassCandidates[0] : null))
      : null;
    const requiresSourceClassChoice = isSourceClassGestion && !isBajaTotalRequest && sourceClassCandidates.length > 1;
    const sourceClassLabel = gestionUiCopy.sourceLabel || (requiresSourceClassChoice ? 'Elige la plaza afectada' : 'Plaza afectada');
    const isExemptFromLateRule = isTicketRedemption || isAmpliarClases;

    const targetInstrument = gestionModal.type === 'ampliar_clases'
      ? selectedInst
      : gestionModal.type === 'cambio_horario'
        ? resolvedSourceClass?.subject
        : (profile.instruments && profile.instruments[0]);

    let availableClasses = [];
    if (isClassSearch && targetInstrument && (gestionModal.type !== 'cambio_horario' || resolvedSourceClass)) {
      availableClasses = allClasses.filter(c => {
        if (c.subject !== targetInstrument) return false;
        
        const activeStudents = (c.students || []).filter(s => {
          if (!isStudentEntryActiveOnDate(s, {}, todayStr)) return false;
          return !isStudentInMaintenanceForDate(getStudentEntryId(s), todayStr);
        }).length;
        if (activeStudents === 0) return false;

        const maxCap = parseInt(c.capacity || 4);
        const currentStudents = getCommittedSeatCountForClass(c, todayStr);
        if (currentStudents >= maxCap) return false;
        if (getStudentEntryInClass(c, profile.id)) return false;
        
        if (isTicketRedemption && targetInstrument === 'Guitarra') {
          if (maxCap !== 8) return false; 
        }
        
        return true;
      });
    }

    const isMaintenanceChoiceInvalid = isMaintenanceRequest && ![1, 2].includes(Number(maintenanceMonths));

    const isSendDisabled = isSendingGestion || 
      (!isExemptFromLateRule && timeRules.isLate && !acceptLatePenalty) || 
      (isSourceClassGestion && !isBajaTotalRequest && !resolvedSourceClass) ||
      (isClassSearch && (!classCatalogLoaded || classCatalogLoading)) ||
      (isClassSearch && Boolean(classCatalogError)) ||
      (isClassSearch && !selectedNewClass) || 
      (isTicketRedemption && !selectedRecoveryDate) ||
      isMaintenanceChoiceInvalid;

    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-start sm:items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-8 shadow-2xl relative my-4 sm:my-8 max-h-[calc(100vh-2rem)] overflow-y-auto">
          <button onClick={() => {setGestionModal(null); setSelectedNewClass(null); setSelectedSourceClass(null); setBajaTotalRequested(false); setSelectedRecoveryDate(''); setMaintenanceMonths(1); setAcceptLatePenalty(false); setSelectedInst('');}} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          <div className="flex items-center gap-3 text-black mb-2">
            <gestionModal.icon className={`w-8 h-8 ${gestionModal.color}`} />
            <h2 className="text-xl font-black uppercase tracking-tight leading-tight text-black">{modalTitle}</h2>
          </div>
          
          {!isExemptFromLateRule && (
            timeRules.isLate ? (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                <h3 className="text-xs font-black text-red-800 uppercase mb-2 flex items-center gap-2"><AlertCircle className="w-4 h-4"/> Fuera de plazo</h3>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={acceptLatePenalty} onChange={e => setAcceptLatePenalty(e.target.checked)} className="mt-0.5 w-4 h-4 text-red-600 rounded shrink-0" />
                  <span className="text-xs font-bold text-red-900 leading-relaxed">Solicitar que se tenga en cuenta para <strong>{timeRules.nextNext}</strong>.</span>
                </label>
              </div>
            ) : (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                <p className="text-xs font-bold text-emerald-800 flex items-center gap-2"><CheckCircle className="w-4 h-4"/> En plazo para <strong>{timeRules.next}</strong>.</p>
              </div>
            )
          )}

          {isAmpliarClases && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <p className="text-xs font-bold text-emerald-800 flex items-start gap-2 leading-relaxed">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5"/> 
                ¡Genial! Tu nueva plaza quedará reservada directamente para {timeRules.next} sin restricciones de fecha límite.
              </p>
            </div>
          )}

          {!isMaintenanceRequest && (
            <p className="text-sm font-medium text-zinc-500 mb-6">{modalDescription}</p>
          )}

          {isSourceClassGestion && (
            <div className="mb-5 space-y-3 border-t border-b border-zinc-100 py-4">
              {canChooseTotalBaja && (
                <label className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-2xl p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bajaTotalRequested}
                    onChange={e => {
                      setBajaTotalRequested(e.target.checked);
                      if (e.target.checked) {
                        setSelectedSourceClass(null);
                        setSelectedNewClass(null);
                        setSelectedRecoveryDate('');
                      }
                    }}
                    className="mt-1 w-4 h-4 accent-red-600 rounded shrink-0"
                  />
                  <span className="text-xs font-bold text-red-900 leading-relaxed">
                    <strong className="font-black uppercase tracking-widest block text-[10px] mb-1">{gestionUiCopy.totalBajaCheckboxTitle || 'Quiero darme de baja de todas mis clases'}</strong>
                    {gestionUiCopy.totalBajaCheckboxText || 'Marca esta opción solo si quieres cancelar todas tus plazas.'}
                  </span>
                </label>
              )}

              {isBajaRequest && gestionUiCopy.notice && (
                <div className={`rounded-2xl p-3 text-xs font-bold leading-relaxed border ${isBajaTotalRequest ? 'bg-red-50 border-red-100 text-red-900' : 'bg-zinc-50 border-zinc-100 text-zinc-700'}`}>
                  {gestionUiCopy.notice}
                </div>
              )}

              {!isBajaTotalRequest && (
                <>
                  <p className="text-xs font-black uppercase tracking-widest text-zinc-400">
                    {sourceClassLabel}
                  </p>

                  {fixedSeatClasses.length > 1 ? (
                    <div className="space-y-2">
                      {fixedSeatClasses.map(c => {
                        const selected = resolvedSourceClass?.id === c.id;
                        const locked = hasPendingGestionForClass(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            disabled={locked}
                            onClick={() => { setSelectedSourceClass(c); setSelectedNewClass(null); setSelectedRecoveryDate(''); }}
                            className={`w-full p-3 rounded-2xl border-2 text-left transition-all ${locked ? 'border-zinc-100 bg-zinc-50 text-zinc-400 cursor-not-allowed opacity-70' : selected ? 'border-black bg-zinc-50 text-slate-900 shadow-sm' : 'border-zinc-100 bg-white hover:border-zinc-300 text-slate-700'}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-black uppercase tracking-tight">{c.subject || 'Clase'} · {getDayName(c.dayOfWeek)} {c.time || ''}h</p>
                                <p className="text-[11px] font-bold text-zinc-500 mt-0.5 leading-tight">{getClassCenterName(c)}{getClassRoomName(c) ? ` · ${getClassRoomName(c)}` : ''}{c.teacher ? ` · Prof. ${c.teacher}` : ''}</p>
                                {locked && <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest mt-1">Trámite pendiente sobre esta plaza</p>}
                              </div>
                              {selected && <CheckCircle className="w-5 h-5 text-black shrink-0" />}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : resolvedSourceClass ? (
                <div className="p-3 rounded-2xl border-2 border-zinc-100 bg-zinc-50 text-slate-800">
                  <p className="text-sm font-black uppercase tracking-tight">{resolvedSourceClass.subject || 'Clase'} · {getDayName(resolvedSourceClass.dayOfWeek)} {resolvedSourceClass.time || ''}h</p>
                  <p className="text-[11px] font-bold text-zinc-500 mt-0.5 leading-tight">{resolvedSourceClass.sede || 'Sede'}{resolvedSourceClass.sala ? ` · ${resolvedSourceClass.sala}` : ''}{resolvedSourceClass.teacher ? ` · Prof. ${resolvedSourceClass.teacher}` : ''}</p>
                </div>
                  ) : (
                    <div className="bg-zinc-50 p-4 rounded-xl text-center border-2 border-dashed border-zinc-100">
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">No hay plazas fijas disponibles para este trámite.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {isMaintenanceRequest && (
            <div className="mb-5 space-y-3 border-t border-b border-amber-100 py-4">
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-xs font-bold text-amber-900 leading-relaxed">
                {modalDescription}
              </div>

              {gestionUiCopy.notice && (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 text-xs font-bold text-blue-900 leading-relaxed">
                  {gestionUiCopy.notice}
                </div>
              )}

              <div className="grid grid-cols-1 gap-2">
                {maintenanceOptions.map(option => {
                  const selected = Number(maintenanceMonths) === option.months;
                  return (
                    <button
                      key={option.months}
                      type="button"
                      onClick={() => setMaintenanceMonths(option.months)}
                      className={`w-full p-3 rounded-2xl border-2 text-left transition-all ${selected ? 'border-amber-500 bg-amber-50 text-amber-950 shadow-sm' : 'border-zinc-100 bg-white hover:border-amber-300 text-slate-700'}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-black uppercase tracking-tight">{option.months} {option.months === 1 ? 'mes' : 'meses'}</p>
                          <p className="text-[11px] font-bold text-zinc-500 mt-0.5 leading-tight">{option.monthLabel}</p>
                        </div>
                        <div className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shrink-0 ${selected ? 'bg-amber-500 text-white' : 'bg-zinc-100 text-zinc-500'}`}>
                          {option.fee}€
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          
          {isClassSearch && (
            <div className="mb-6 space-y-4 border-t border-b border-zinc-100 py-4">
              <p className="text-xs font-black uppercase tracking-widest text-zinc-400">{isTicketRedemption ? '1. Elige grupo con disponibilidad' : gestionModal.type === 'cambio_horario' && requiresSourceClassChoice ? '2. Grupos disponibles para esa plaza' : (gestionUiCopy.searchLabel || '1. Busca disponibilidad en directo')}</p>
              
              {gestionModal.type === 'ampliar_clases' && (
                <select value={selectedInst} onChange={e => {setSelectedInst(e.target.value); setSelectedNewClass(null);}} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm">
                  <option value="">Selecciona Instrumento...</option>
                  {INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              )}

              {classCatalogError ? (
                <div className="bg-red-50 p-4 rounded-xl text-center border-2 border-dashed border-red-200">
                  <p className="text-xs font-bold text-red-700 leading-relaxed">{classCatalogError}</p>
                  <button type="button" onClick={() => setClassCatalogRetryNonce(value => value + 1)} className="mt-3 inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[10px]">
                    <RefreshCcw className="w-3.5 h-3.5" /> Reintentar consulta
                  </button>
                </div>
              ) : classCatalogLoading || !classCatalogLoaded ? (
                <div className="bg-blue-50 p-4 rounded-xl text-center border-2 border-dashed border-blue-100">
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">Consultando plazas disponibles...</p>
                </div>
              ) : gestionModal.type === 'cambio_horario' && !resolvedSourceClass ? (
                <div className="bg-zinc-50 p-4 rounded-xl text-center border-2 border-dashed border-zinc-100">
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Elige primero la plaza que quieres cambiar.</p>
                </div>
              ) : !(gestionModal.type === 'ampliar_clases' && !selectedInst) && (
                availableClasses.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                    {availableClasses.map(c => (
                      <div key={c.id} onClick={() => {setSelectedNewClass(c); setSelectedRecoveryDate('');}} className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedNewClass?.id === c.id ? 'border-black bg-zinc-50' : 'border-zinc-100 hover:border-zinc-300'}`}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-black text-sm uppercase">{getDayName(c.dayOfWeek)}</span>
                          <span className="text-xs font-bold bg-black text-white px-2 py-0.5 rounded">{c.time}h</span>
                        </div>
                        <div className="text-xs text-zinc-500 font-medium flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="inline-flex items-center gap-1 font-black text-slate-700 uppercase">
                            <MapPin className="w-3 h-3" /> {getClassCenterName(c)}
                          </span>
                          <span>Prof: {c.teacher}</span>
                          <span>Quedan {Math.max(parseInt(c.capacity || 4) - getCommittedSeatCountForClass(c, todayStr), 0)} plazas</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-zinc-50 p-4 rounded-xl text-center border-2 border-dashed border-zinc-100"><p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">No hay grupos libres disponibles en tu instrumento.</p></div>
                )
              )}

              {isTicketRedemption && selectedNewClass && (
                <div className="mt-6 pt-4 border-t border-zinc-100 animate-in fade-in zoom-in-95">
                  <p className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-3">2. Elige el día exacto de recuperación</p>
                  <div className="space-y-2">
                    {getValidRecoveryDates(selectedNewClass.dayOfWeek).map(d => (
                      <div 
                        key={d} 
                        onClick={() => setSelectedRecoveryDate(d)} 
                        className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${selectedRecoveryDate === d ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-zinc-100 hover:border-amber-300 text-slate-700'}`}
                      >
                        <span className="font-black text-sm uppercase">{formatDateSpanish(d)}</span>
                        {selectedRecoveryDate === d && <CheckCircle className="w-5 h-5 text-amber-500"/>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <textarea placeholder={modalPlaceholder} value={gestionText} onChange={(e) => setGestionText(e.target.value)} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl focus:border-black outline-none min-h-[100px] resize-y text-sm font-medium mb-6"/>
          
          <button onClick={sendGestion} disabled={isSendDisabled} className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-800 transition-colors shadow-lg flex justify-center items-center gap-2 disabled:opacity-50">
            {isSendingGestion ? 'Enviando...' : <><Send className="w-4 h-4"/> Enviar Solicitud</>}
          </button>
        </div>
      </div>
    );
  };

  const renderExtraSignupModal = () => {
    const serviceConfig = getExtraServiceConfig(extraSignupModal);
    if (!serviceConfig) return null;

    const ServiceIcon = serviceConfig.Icon || Sparkles;
    const accentClasses = serviceConfig.key === 'mitoverso'
      ? {
          icon: 'bg-indigo-50 text-indigo-600 border-indigo-100',
          box: 'bg-indigo-50 border-indigo-100 text-indigo-950',
          button: 'bg-indigo-600 hover:bg-indigo-700'
        }
      : {
          icon: 'bg-blue-50 text-blue-600 border-blue-100',
          box: 'bg-blue-50 border-blue-100 text-blue-950',
          button: 'bg-blue-600 hover:bg-blue-700'
        };

    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-start sm:items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-8 shadow-2xl relative my-4 sm:my-8 max-h-[calc(100vh-2rem)] overflow-y-auto">
          <button onClick={closeExtraSignupModal} disabled={isSendingExtraSignup} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full disabled:opacity-50"><X className="w-5 h-5"/></button>

          <div className="flex flex-col items-center text-center mb-6">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 border ${accentClasses.icon}`}>
              <ServiceIcon className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Alta en {serviceConfig.name}</h2>
            <p className="text-xs font-bold text-zinc-500 mt-2 leading-relaxed">{serviceConfig.shortDescription}</p>
          </div>

          <div className={`p-4 rounded-2xl border mb-4 ${accentClasses.box}`}>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-2">Condiciones económicas</p>
            <div className="space-y-2 text-sm font-bold leading-relaxed">
              <p>Cuota mensual: <strong>{formatEuro(serviceConfig.monthlyFee)}</strong> / mes.</p>
              <p>Se te pasará la parte proporcional del mes corriente.</p>
            </div>
          </div>

          <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-4 mb-5 text-xs font-bold text-zinc-600 leading-relaxed space-y-2">
            <p>Coordinación activará el servicio manualmente y preparará la domiciliación correspondiente.</p>
            <p className="text-slate-800 font-black">El acceso no es inmediato: quedará pendiente de revisión administrativa.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={closeExtraSignupModal} disabled={isSendingExtraSignup} className="bg-zinc-100 text-zinc-600 font-black py-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-200 transition-colors disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={sendExtraSignupRequest} disabled={isSendingExtraSignup} className={`${accentClasses.button} text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-50`}>
              {isSendingExtraSignup ? 'Enviando...' : <><Send className="w-4 h-4"/> Aceptar alta</>}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderWorkshopModal = () => {
    if (!workshopModal) return null;
    const workshop = workshops.find(item => item.id === workshopModal.id) || workshopModal;
    const registration = getWorkshopRegistration(workshop.id);
    const activeRegistration = registration && ['confirmed', 'pending', 'waitlist'].includes(registration.status) ? registration : null;
    const registrationOpen = isWorkshopRegistrationOpen(workshop);
    const freeSeats = getWorkshopFreeSeats(workshop);
    const isFull = !workshop.unlimitedCapacity && freeSeats === 0;
    const canCancel = activeRegistration
      && workshop.cancellationMode === 'allowed_until'
      && workshop.cancellationDeadline
      && workshop.cancellationDeadline > getLocalDateTimeString();
    const safeResourceUrl = getSafeAnnouncementUrl(workshop.resourceUrl || '');

    return (
      <div className="fixed inset-0 bg-black/90 z-[120] flex items-start sm:items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl relative my-4 sm:my-8 max-h-[calc(100vh-2rem)] overflow-y-auto">
          <button onClick={closeWorkshopModal} disabled={isSendingWorkshopRegistration} className="absolute top-4 right-4 z-20 text-zinc-500 hover:text-black bg-white/90 p-2 rounded-full shadow-md disabled:opacity-50"><X className="w-5 h-5"/></button>

          {getSafeAnnouncementUrl(workshop.imageUrl || '') ? (
            <div className="h-52 sm:h-64 bg-zinc-900 overflow-hidden rounded-t-3xl"><img src={getSafeAnnouncementUrl(workshop.imageUrl)} alt="" className="w-full h-full object-cover"/></div>
          ) : (
            <div className="h-40 sm:h-48 bg-gradient-to-br from-violet-700 via-indigo-800 to-zinc-950 rounded-t-3xl flex items-center justify-center relative overflow-hidden"><Music className="w-24 h-24 text-white/20"/><Sparkles className="w-20 h-20 text-white/10 absolute -right-2 -bottom-2"/></div>
          )}

          <div className="p-5 sm:p-8">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {workshop.featured && <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[9px] font-black uppercase tracking-widest"><Star className="w-3 h-3 inline mr-1"/> Destacado</span>}
              {activeRegistration && <span className={`px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${WORKSHOP_REGISTRATION_STATUS_STYLE[activeRegistration.status]}`}>{WORKSHOP_REGISTRATION_STATUS_LABELS[activeRegistration.status]}</span>}
              {workshop.status === 'cancelled' && <span className="px-3 py-1 rounded-full bg-red-100 text-red-800 border border-red-200 text-[9px] font-black uppercase tracking-widest">Taller cancelado</span>}
              {workshop.status === 'completed' && <span className="px-3 py-1 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200 text-[9px] font-black uppercase tracking-widest">Finalizado</span>}
            </div>

            <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-slate-900 leading-tight">{workshop.title}</h2>
            <p className="text-sm font-bold text-zinc-500 mt-2 leading-relaxed">{workshop.shortDescription}</p>

            <div className="grid sm:grid-cols-2 gap-3 mt-6">
              <div className="bg-violet-50 border border-violet-100 p-4 rounded-2xl"><span className="text-[9px] font-black uppercase tracking-widest text-violet-500 block mb-1">Lugar</span><span className="font-black text-sm text-violet-950 flex items-center gap-2"><MapPin className="w-4 h-4 shrink-0"/>{getWorkshopLocationLabelForStudent(workshop)}</span></div>
              <div className="bg-zinc-50 border border-zinc-100 p-4 rounded-2xl"><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1">Precio</span><span className="font-black text-sm text-slate-900">{workshop.priceType === 'free' ? 'Gratuito' : formatEuro(workshop.price)}</span>{workshop.priceNote && <span className="block text-[10px] font-bold text-zinc-500 mt-1">{workshop.priceNote}</span>}</div>
            </div>

            <div className="mt-6">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-3">Fechas y horarios</h3>
              <div className="space-y-2">{(workshop.sessions || []).map((session, index) => <div key={session.id || index} className="flex items-center justify-between gap-3 bg-zinc-50 border border-zinc-100 rounded-xl p-3"><div className="flex items-center gap-3 min-w-0"><div className="w-9 h-9 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-violet-600 shrink-0"><Calendar className="w-4 h-4"/></div><div><p className="font-black text-sm text-slate-800 capitalize">{formatWorkshopDate(session.date)}</p><p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Sesión {index + 1}</p></div></div><span className="font-black text-xs text-slate-700 whitespace-nowrap">{session.startTime}–{session.endTime}h</span></div>)}</div>
            </div>

            <div className="mt-6 text-sm text-zinc-600 font-medium leading-relaxed whitespace-pre-wrap">{workshop.description}</div>

            {(workshop.instructor || workshop.whatToBring || workshop.importantNotes || workshop.ageMin || workshop.ageMax || workshop.level) && <div className="mt-6 grid sm:grid-cols-2 gap-3">
              {workshop.instructor && <div className="p-4 border border-zinc-200 rounded-2xl"><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1">Profesor o responsable</span><span className="text-sm font-black text-slate-800">{workshop.instructor}</span></div>}
              {workshop.level && <div className="p-4 border border-zinc-200 rounded-2xl"><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1">Nivel</span><span className="text-sm font-black text-slate-800">{getWorkshopLevelLabel(workshop)}</span></div>}
              {(workshop.ageMin || workshop.ageMax) && <div className="p-4 border border-zinc-200 rounded-2xl"><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1">Edad orientativa</span><span className="text-sm font-black text-slate-800">{workshop.ageMin && workshop.ageMax ? `${workshop.ageMin}–${workshop.ageMax} años` : workshop.ageMin ? `Desde ${workshop.ageMin} años` : `Hasta ${workshop.ageMax} años`}</span></div>}
              {workshop.whatToBring && <div className="p-4 border border-zinc-200 rounded-2xl"><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1">Qué debes traer</span><span className="text-sm font-bold text-slate-700 whitespace-pre-wrap">{workshop.whatToBring}</span></div>}
              {workshop.importantNotes && <div className="sm:col-span-2 p-4 bg-amber-50 border border-amber-100 rounded-2xl"><span className="text-[9px] font-black uppercase tracking-widest text-amber-600 block mb-1">Información importante</span><span className="text-sm font-bold text-amber-950 whitespace-pre-wrap">{workshop.importantNotes}</span></div>}
            </div>}

            {safeResourceUrl && <a href={safeResourceUrl} target="_blank" rel="noopener noreferrer" className="mt-4 w-full bg-zinc-100 hover:bg-zinc-200 text-slate-800 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"><FileText className="w-4 h-4"/> Abrir material o información adicional</a>}

            {!activeRegistration && registration?.status === 'rejected' && <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-2xl text-sm font-bold text-red-800">Administración ha rechazado esta solicitud. Si necesitas revisarla, contacta con la escuela.</div>}
            {!activeRegistration && registration?.status === 'cancelled' && <div className="mt-6 p-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm font-bold text-zinc-600">Cancelaste tu inscripción. Puedes volver a apuntarte mientras la inscripción siga abierta.</div>}

            {!activeRegistration && registrationOpen && registration?.status !== 'rejected' && (workshop.questions || []).length > 0 && <div className="mt-7 border-t border-zinc-100 pt-6"><h3 className="text-xs font-black uppercase tracking-widest text-slate-800 mb-4">Antes de apuntarte</h3><div className="space-y-4">{workshop.questions.map(question => <div key={question.id}><label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 block mb-1.5">{question.label}{question.required ? ' *' : ''}</label>{question.type === 'choice' ? <select value={workshopAnswers[question.id] || ''} onChange={e => setWorkshopAnswers({ ...workshopAnswers, [question.id]: e.target.value })} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm focus:border-violet-500"><option value="">Selecciona...</option>{(question.options || []).map(option => <option key={option} value={option}>{option}</option>)}</select> : <textarea value={workshopAnswers[question.id] || ''} onChange={e => setWorkshopAnswers({ ...workshopAnswers, [question.id]: e.target.value })} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-medium text-sm min-h-[90px] resize-y focus:border-violet-500"/>}</div>)}</div></div>}

            <div className="mt-7 border-t border-zinc-100 pt-6">
              {activeRegistration ? <div className="space-y-3"><div className={`p-4 rounded-2xl border ${WORKSHOP_REGISTRATION_STATUS_STYLE[activeRegistration.status]}`}><p className="font-black uppercase tracking-widest text-xs">{WORKSHOP_REGISTRATION_STATUS_LABELS[activeRegistration.status]}</p><p className="text-xs font-bold mt-1 opacity-80">{activeRegistration.status === 'confirmed' ? 'Tu plaza está reservada.' : activeRegistration.status === 'pending' ? 'Administración revisará tu solicitud.' : 'Te avisaremos si queda una plaza disponible.'}</p></div>{canCancel && <button onClick={() => cancelWorkshopRegistration(workshop)} disabled={isSendingWorkshopRegistration} className="w-full bg-zinc-100 text-zinc-600 hover:bg-red-50 hover:text-red-700 font-black py-4 rounded-xl uppercase text-[10px] tracking-widest disabled:opacity-50">Cancelar inscripción</button>}{!canCancel && workshop.cancellationMode === 'contact_admin' && <a href={`mailto:${ADMIN_GESTION_EMAIL}?subject=${encodeURIComponent(`Inscripción taller: ${workshop.title}`)}`} className="w-full bg-zinc-100 text-zinc-700 hover:bg-zinc-200 font-black py-4 rounded-xl uppercase text-[10px] tracking-widest flex items-center justify-center gap-2"><Mail className="w-4 h-4"/> Consultar cambios con Administración</a>}</div> : registration?.status === 'rejected' ? <a href={`mailto:${ADMIN_GESTION_EMAIL}?subject=${encodeURIComponent(`Solicitud taller: ${workshop.title}`)}`} className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest flex items-center justify-center gap-2"><Mail className="w-4 h-4"/> Contactar con Administración</a> : registrationOpen ? <><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4"><div><span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block">Inscripción abierta hasta</span><span className="text-sm font-black text-slate-800">{formatWorkshopDeadline(workshop.registrationDeadline)}</span></div><span className={`text-[10px] font-black uppercase tracking-widest ${isFull ? 'text-blue-700' : 'text-emerald-700'}`}>{workshop.unlimitedCapacity ? 'Plazas sin límite' : isFull && workshop.waitlistEnabled ? 'Lista de espera disponible' : `${freeSeats} ${freeSeats === 1 ? 'plaza libre' : 'plazas libres'}`}</span></div>{workshop.priceType === 'paid' && <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-3 mb-4 text-xs font-bold text-zinc-600">{workshop.paymentMethod === 'next_debit' ? 'El importe se incluirá en la próxima domiciliación.' : workshop.paymentMethod === 'manual_admin' ? 'Administración gestionará el cobro después de la inscripción.' : 'El pago se realizará mediante el sistema externo indicado por la escuela.'}</div>}<button onClick={sendWorkshopRegistration} disabled={isSendingWorkshopRegistration || (isFull && !workshop.waitlistEnabled)} className="w-full bg-violet-600 hover:bg-violet-700 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">{isSendingWorkshopRegistration ? 'Procesando...' : isFull && workshop.waitlistEnabled ? <><Clock className="w-4 h-4"/> Apuntarme a la lista de espera</> : workshop.registrationMode === 'manual_review' ? <><Send className="w-4 h-4"/> Enviar solicitud</> : <><CheckCircle className="w-4 h-4"/> Apuntarme al taller</>}</button></> : <div className="p-4 bg-zinc-100 border border-zinc-200 rounded-2xl text-center"><p className="font-black uppercase tracking-widest text-xs text-zinc-600">Inscripción cerrada</p>{workshop.registrationDeadline && <p className="text-[10px] font-bold text-zinc-400 mt-1">Finalizó el {formatWorkshopDeadline(workshop.registrationDeadline)}</p>}</div>}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderMitoboxModal = () => {
    if (!mitoboxModal) return null;
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    let availableMboxSlots = [];
    if (mboxDate && mboxSede) {
      const targetDay = getDayOfWeek(mboxDate);
      const selectedMboxCenter = getCenterForValue(mboxSede);
      const isSchoolClosed = globalSettings.festivos.includes(mboxDate)
        || globalSettings.vacaciones.includes(mboxDate)
        || Boolean(selectedMboxCenter?.holidays?.includes(mboxDate));
      const allScheduledClasses = isSchoolClosed ? [] : allClasses
        .map(clase => getEffectiveClassForDate(clase, mboxDate))
        .filter(clase => (
          Number(clase.dayOfWeek) === targetDay
          && isSameCenter(clase.centerId || clase.sede || 'Tarragona', selectedMboxCenter?.id || mboxSede)
        ));

      const aliveClasses = allScheduledClasses.filter(c => {
        if (c.cancelledDates?.includes(mboxDate)) return false; 
        const exceptionsEseDia = c.exceptions?.[mboxDate] || {};
        const activeStudents = (c.students || []).filter(s => {
          const entryStudentId = getStudentEntryId(s);
          if (!isStudentEntryActiveOnDate(s, {}, mboxDate)) return false;
          if (isStudentInMaintenanceForDate(entryStudentId, mboxDate)) return false;
          const estadoHoy = exceptionsEseDia[entryStudentId];
          if (estadoHoy === 'absent' || estadoHoy === 'notified' || estadoHoy === 'notified_no_ticket') return false;
          return true;
        });

        if (activeStudents.length === 0) return false;
        return true;
      });

      const activeTimes = [...new Set(aliveClasses.map(c => c.time))].sort();
      
      activeTimes.forEach(t => {
        const occupiedRoomIds = aliveClasses
          .filter(c => c.time === t)
          .map(c => findRoomByValue(selectedMboxCenter, c.roomId || c.sala || 'Sala 1')?.id || normalizeConfigId(c.roomId || c.sala || 'Sala 1', 'sala'));
        const freeRooms = (selectedMboxCenter?.rooms || [])
          .filter(room => room.active !== false && room.mitoboxEnabled !== false)
          .filter(room => !occupiedRoomIds.includes(room.id));
        
        freeRooms.forEach(room => {
          availableMboxSlots.push({ time: t, sala: room.name, roomId: room.id });
        });
      });
    }

    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-start sm:items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-8 shadow-2xl relative my-4 sm:my-8 max-h-[calc(100vh-2rem)] overflow-y-auto">
          <button onClick={() => {setMitoboxModal(false); setMboxDate(''); setMboxSelectedSlot(null);}} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          
          <div className="flex items-center gap-3 text-black mb-6">
            <DoorOpen className="w-8 h-8 text-blue-500" />
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight leading-none">Reservar Sala</h2>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Servicio Mitobox</p>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">1. ¿Qué instrumento tocarás?</label>
              <select value={mboxInst} onChange={e => setMboxInst(e.target.value)} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm">
                <option value="">Selecciona Instrumento...</option>
                {INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">2. Fecha (Mín. 24h vista)</label>
              <input type="date" min={tomorrowStr} value={mboxDate} onChange={e => {setMboxDate(e.target.value); setMboxSelectedSlot(null);}} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm text-slate-800" />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1">3. Centro</label>
              <select value={mboxSede} onChange={e => {setMboxSede(e.target.value); setMboxSelectedSlot(null);}} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm">
                {mitoboxCenters.map(center => <option key={center.id} value={center.name}>{center.name}</option>)}
              </select>
            </div>
          </div>

          {mboxDate && mboxSede && (
            <div className="mb-6 space-y-4 border-t border-zinc-100 pt-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">4. Salas y Horas disponibles</label>
              {classCatalogError ? (
                <div className="bg-red-50 p-4 rounded-xl text-center border-2 border-dashed border-red-200">
                  <p className="text-xs font-bold text-red-700 leading-relaxed">{classCatalogError}</p>
                  <button type="button" onClick={() => setClassCatalogRetryNonce(value => value + 1)} className="mt-3 inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[10px]">
                    <RefreshCcw className="w-3.5 h-3.5" /> Reintentar consulta
                  </button>
                </div>
              ) : classCatalogLoading || !classCatalogLoaded ? (
                <div className="bg-blue-50 p-4 rounded-xl text-center border-2 border-dashed border-blue-100">
                  <p className="text-xs font-bold text-blue-700">Consultando la ocupación de las aulas...</p>
                </div>
              ) : availableMboxSlots.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {availableMboxSlots.map((slot, i) => (
                    <button 
                      key={i} 
                      onClick={() => setMboxSelectedSlot(slot)} 
                      className={`p-3 rounded-xl border-2 text-left transition-all ${mboxSelectedSlot?.time === slot.time && mboxSelectedSlot?.roomId === slot.roomId ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-zinc-100 hover:border-blue-300 text-slate-700'}`}
                    >
                      <div className="font-black text-sm">{slot.time}h</div>
                      <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">{slot.sala}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="bg-zinc-50 p-4 rounded-xl text-center border-2 border-dashed border-zinc-200">
                  <p className="text-xs font-bold text-zinc-500">No hay salas libres o escuela cerrada para la fecha y centro elegidos.</p>
                </div>
              )}
            </div>
          )}

          <button onClick={sendMitoboxReservation} disabled={isSendingGestion || classCatalogLoading || !classCatalogLoaded || Boolean(classCatalogError) || !mboxDate || !mboxSelectedSlot || !mboxInst} className="w-full bg-blue-600 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-blue-700 transition-colors shadow-lg flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {isSendingGestion ? 'Enviando...' : <><CheckCircle className="w-4 h-4"/> Confirmar Reserva</>}
          </button>
        </div>
      </div>
    );
  };

  const renderContract = () => {
    if (!showContract) return null;
    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-start sm:items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-8 shadow-2xl relative flex flex-col max-h-[calc(100vh-2rem)] animate-in zoom-in-95 duration-200 my-4 sm:my-8">
          <button onClick={() => setShowContract(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full z-10"><X className="w-5 h-5"/></button>
          <div className="flex items-center gap-3 text-black mb-6 shrink-0">
            <FileText className="w-8 h-8" />
            <h2 className="text-xl font-black uppercase tracking-tight leading-none">Contrato de Servicios</h2>
          </div>
          <div className="overflow-y-auto pr-2 text-sm text-slate-600 font-medium leading-relaxed flex-1 space-y-4 whitespace-pre-wrap">
            {contractText}
          </div>
          <button onClick={() => setShowContract(false)} className="w-full mt-6 bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest shrink-0 shadow-lg hover:bg-zinc-800 transition-colors">Cerrar Contrato</button>
        </div>
      </div>
    );
  };

  const renderTriviaModal = () => {
    if (!triviaModal) return null;
    return (
      <div className="fixed inset-0 bg-black/95 z-[100] flex items-start sm:items-center justify-center p-3 sm:p-4 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-8 shadow-2xl relative flex flex-col items-center my-4 sm:my-8 max-h-[calc(100vh-2rem)] overflow-y-auto">
          
          <div className="w-full bg-zinc-100 rounded-full h-2 mb-8 overflow-hidden">
            <div className="bg-amber-400 h-full transition-all duration-1000 linear" style={{ width: `${(triviaTime / 10) * 100}%` }}></div>
          </div>
          <div className="text-3xl font-black mb-6 flex items-center justify-center w-16 h-16 rounded-full border-4 border-zinc-100 text-slate-800">
            {triviaTime}
          </div>

          <h2 className="text-xl font-black text-center text-slate-800 mb-8 leading-tight">{currentQuestion.q}</h2>

          <div className="w-full space-y-3">
            {currentQuestion.options.map((opt, idx) => {
              let btnClass = "bg-white border-2 border-zinc-200 text-slate-700 hover:border-black";
              if (triviaResult) {
                if (idx === currentQuestion.correct) btnClass = "bg-emerald-500 border-emerald-500 text-white"; 
                else if (idx === triviaSelected) btnClass = "bg-rose-500 border-rose-500 text-white"; 
                else btnClass = "bg-zinc-100 border-zinc-200 text-zinc-400 opacity-50"; 
              }

              return (
                <button 
                  key={idx} 
                  disabled={!!triviaResult}
                  onClick={() => handleTriviaAnswer(idx)}
                  className={`w-full p-4 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${btnClass}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          {triviaResult?.status === 'win' && (
            <div className="mt-6 text-center animate-in slide-in-from-bottom-2">
              <p className="text-emerald-600 font-black uppercase tracking-widest text-lg mb-3">¡Correcto!</p>
              <div className="flex flex-wrap justify-center gap-2">
                <span className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm">
                  +{currentDifficulty.points} {currentDifficulty.label}
                </span>
                {triviaResult.speed > 0 && (
                  <span className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm">
                    +{triviaResult.speed} Rápido
                  </span>
                )}
                {triviaResult.streak > 0 && (
                  <span className="bg-amber-100 text-amber-700 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm">
                    +{triviaResult.streak} Racha x{triviaResult.newStreakCount} 🔥
                  </span>
                )}
              </div>
            </div>
          )}
          {triviaResult?.status === 'lose' && <p className="mt-6 text-rose-600 font-black uppercase tracking-widest text-sm">¡Incorrecto! Pierdes la racha.</p>}
          {triviaResult?.status === 'timeout' && <p className="mt-6 text-rose-600 font-black uppercase tracking-widest text-sm">¡Se acabó el tiempo!</p>}

        </div>
      </div>
    );
  };
  
  if (loading) return <div className="min-h-screen bg-zinc-50 flex items-center justify-center font-black">Sincronizando perfil...</div>;

  if (profileLoadError) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 flex flex-col justify-center items-center text-center max-w-md mx-auto">
        <div className="bg-red-100 text-red-600 p-6 rounded-full mb-6">
          <AlertCircle className="w-12 h-12" />
        </div>
        <h1 className="text-2xl font-black uppercase tracking-tight leading-none mb-4 text-slate-800">No se pudo cargar tu perfil</h1>
        <p className="text-zinc-500 font-medium mb-8 leading-relaxed">{profileLoadError}</p>
        <button onClick={checkRegistration} className="w-full bg-black hover:bg-zinc-800 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg transition-colors flex items-center justify-center gap-2">
          <RefreshCcw className="w-4 h-4" /> Reintentar
        </button>
        <button onClick={logout} className="mt-5 text-[10px] font-bold text-zinc-400 hover:text-black uppercase tracking-widest underline underline-offset-4 transition-colors">
          Cerrar sesión
        </button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 flex flex-col justify-center items-center text-center max-w-md mx-auto">
        <div className="bg-red-100 text-red-500 p-6 rounded-full mb-6">
          <AlertCircle className="w-12 h-12" />
        </div>
        <h1 className="text-2xl font-black uppercase tracking-tight leading-none mb-4 text-slate-800">Acceso Denegado</h1>
        <p className="text-zinc-500 font-medium mb-8 leading-relaxed">
          Tu correo electrónico (<strong className="text-black">{user.email}</strong>) no está registrado como alumno de la escuela.
        </p>
        <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl mb-8">
          <p className="text-sm text-amber-800 font-bold">
            Si eres alumno de Los Mitos, asegúrate de haber iniciado sesión con el mismo correo que le diste a tu profesor.
          </p>
        </div>
        <button onClick={logout} className="w-full bg-black hover:bg-zinc-800 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg transition-colors">
          Cerrar Sesión y probar con otro correo
        </button>
      </div>
    );
  }

  if (isProfileBajaEffective) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 flex flex-col justify-center items-center text-center max-w-md mx-auto animate-in fade-in duration-300">
        <div className="bg-zinc-200 text-zinc-500 p-6 rounded-full mb-6">
          <UserMinus className="w-12 h-12" />
        </div>
        <h1 className="text-2xl font-black uppercase tracking-tight leading-none mb-4 text-slate-800">Cuenta Desactivada</h1>
        <p className="text-zinc-500 font-medium mb-8 leading-relaxed">
          Estás dado de baja de la Escuela Los Mitos. Ya no tienes acceso a la plataforma ni a los servicios premium.
        </p>
        <div className="bg-white border-2 border-zinc-200 p-6 rounded-2xl mb-8 w-full shadow-sm">
          <p className="text-sm text-slate-700 font-bold mb-4 uppercase tracking-widest">
            ¿Quieres volver a dar caña?
          </p>
          <a 
            href="https://www.escuelalosmitos.com/plazas-libres-en-clases-de-musica-en-tarragona-y-reus/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="block w-full bg-black hover:bg-zinc-800 text-white py-4 rounded-xl font-black uppercase tracking-widest text-xs shadow-lg transition-colors"
          >
            Ver Plazas Libres
          </a>
        </div>
        <button onClick={logout} className="text-[10px] font-bold text-zinc-400 hover:text-black uppercase tracking-widest underline underline-offset-4 transition-colors">
          Cerrar Sesión
        </button>
      </div>
    );
  }

  if (profile.globalStatus === 'impago') {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 flex flex-col justify-center items-center text-center max-w-md mx-auto animate-in fade-in duration-300">
        <div className="bg-red-100 text-red-600 p-6 rounded-full mb-6">
          <AlertCircle className="w-12 h-12" />
        </div>
        <h1 className="text-2xl font-black uppercase tracking-tight leading-none mb-4 text-slate-800">Acceso temporalmente bloqueado</h1>
        <p className="text-zinc-500 font-medium mb-6 leading-relaxed">
          Tu cuenta se encuentra temporalmente inaccesible por una incidencia de pago.
        </p>
        <div className="bg-white border-2 border-red-100 p-6 rounded-2xl mb-8 w-full shadow-sm text-left">
          <p className="text-sm text-slate-700 font-bold leading-relaxed mb-4">
            Para regularizar la situación, deja fondos disponibles en la cuenta bancaria con la que realizaste el alta.
          </p>
          <p className="text-sm text-slate-700 font-bold leading-relaxed">
            Si tienes alguna duda o crees que se trata de un error, escríbenos a:
          </p>
          <a href="mailto:gestiones@escuelalosmitos.com" className="block mt-3 text-center bg-red-50 border border-red-100 text-red-700 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-red-100 transition-colors">
            gestiones@escuelalosmitos.com
          </a>
        </div>
        <button onClick={logout} className="text-[10px] font-bold text-zinc-400 hover:text-black uppercase tracking-widest underline underline-offset-4 transition-colors">
          Cerrar Sesión
        </button>
      </div>
    );
  }

  if (classesLoadError) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 flex flex-col justify-center items-center text-center max-w-md mx-auto">
        <div className="bg-red-100 text-red-600 p-6 rounded-full mb-6">
          <AlertCircle className="w-12 h-12" />
        </div>
        <h1 className="text-2xl font-black uppercase tracking-tight leading-none mb-4 text-slate-800">No se pudieron comprobar tus clases</h1>
        <p className="text-zinc-500 font-medium mb-8 leading-relaxed">{classesLoadError}</p>
        <button onClick={() => setClassesRetryNonce(value => value + 1)} className="w-full bg-black hover:bg-zinc-800 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg transition-colors flex items-center justify-center gap-2">
          <RefreshCcw className="w-4 h-4" /> Reintentar
        </button>
        <a href={`mailto:${SUPPORT_EMAIL}?subject=Error%20al%20cargar%20clases`} className="mt-5 text-[10px] font-bold text-zinc-400 hover:text-black uppercase tracking-widest underline underline-offset-4 transition-colors">
          Contactar con soporte
        </a>
      </div>
    );
  }

  if (!classesLoaded) {
    return <div className="min-h-screen bg-zinc-50 flex items-center justify-center font-black">Sincronizando clases...</div>;
  }
  if (isPortalAccessScheduled) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 flex flex-col justify-center items-center text-center max-w-md mx-auto animate-in fade-in duration-300">
        <div className="bg-emerald-100 text-emerald-600 p-6 rounded-full mb-6">
          <Clock className="w-12 h-12" />
        </div>
        <h1 className="text-2xl font-black uppercase tracking-tight leading-none mb-4 text-slate-800">Tu plaza está reservada</h1>
        <p className="text-zinc-500 font-medium mb-6 leading-relaxed">
          Tus clases empiezan el día <strong className="text-black">{formatDateSpanish(portalStartDate)}</strong>.
        </p>
        <div className="bg-white border-2 border-emerald-100 p-6 rounded-2xl mb-8 w-full shadow-sm text-left">
          <p className="text-sm text-slate-700 font-bold leading-relaxed mb-4">
            Podrás acceder al Área del Alumno a partir de esa fecha. Mientras tanto, tu plaza ya está confirmada, pero las gestiones del portal todavía no estarán disponibles.
          </p>
          <p className="text-sm text-slate-700 font-bold leading-relaxed">
            Si tienes cualquier duda, escríbenos a:
          </p>
          <a href={`mailto:${SUPPORT_EMAIL}?subject=Consulta%20sobre%20inicio%20de%20clases`} className="block mt-3 text-center bg-emerald-50 border border-emerald-100 text-emerald-700 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-100 transition-colors">
            {SUPPORT_EMAIL}
          </a>
        </div>
        <button onClick={logout} className="text-[10px] font-bold text-zinc-400 hover:text-black uppercase tracking-widest underline underline-offset-4 transition-colors">
          Cerrar Sesión
        </button>
      </div>
    );
  }


  if (effectiveMyClasses.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-50 p-8 flex flex-col justify-center items-center text-center max-w-md mx-auto animate-in fade-in duration-300">
        <div className="bg-amber-100 text-amber-600 p-6 rounded-full mb-6">
          <AlertCircle className="w-12 h-12" />
        </div>
        <h1 className="text-2xl font-black uppercase tracking-tight leading-none mb-4 text-slate-800">Sin clase asignada</h1>
        <p className="text-zinc-500 font-medium mb-8 leading-relaxed">
          Tu cuenta existe, pero ahora mismo no tienes ninguna clase asignada. Para acceder al portal necesitas tener una plaza activa o una plaza en mantenimiento.
        </p>
        <div className="bg-white border-2 border-zinc-200 p-6 rounded-2xl mb-8 w-full shadow-sm">
          <p className="text-sm text-slate-700 font-bold mb-4 uppercase tracking-widest">
            ¿Crees que es un error?
          </p>
          <a 
            href="mailto:gestiones@escuelalosmitos.com?subject=Acceso%20al%20portal%20sin%20clase%20asignada" 
            className="block w-full bg-black hover:bg-zinc-800 text-white py-4 rounded-xl font-black uppercase tracking-widest text-xs shadow-lg transition-colors"
          >
            Contactar con la escuela
          </a>
        </div>
        <button onClick={logout} className="text-[10px] font-bold text-zinc-400 hover:text-black uppercase tracking-widest underline underline-offset-4 transition-colors">
          Cerrar Sesión
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-slate-800 pb-24 relative">
      
      {renderAbsenceModal()}
      {renderGestionModal()}
      {renderMitoboxModal()}
      {renderExtraSignupModal()}
      {renderWorkshopModal()}
      {renderContract()}
      {renderTriviaModal()}

      {renderReviewModal()}

      {showSocialModal && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-start sm:items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 sm:p-8 shadow-2xl relative my-4 sm:my-8 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <button onClick={() => setShowSocialModal(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
            <div className="flex flex-col items-center text-center mb-6">
              <Megaphone className="w-12 h-12 text-black mb-3" />
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Redes de la Escuela</h2>
              <p className="text-xs font-bold text-zinc-500 mt-2">Instagram, Facebook y YouTube reunidos en un solo botón.</p>
            </div>
            <div className="space-y-3">
              {SOCIAL_LINKS.map(({ id, label, url, Icon, hover, iconHover }) => (
                <a key={id} href={url} target="_blank" rel="noopener noreferrer" className={`w-full bg-zinc-100 ${hover} hover:bg-white text-slate-800 font-black py-4 rounded-xl uppercase text-xs tracking-widest transition-colors flex items-center justify-center gap-2 border border-zinc-200 group`}>
                  <Icon className={`w-4 h-4 text-zinc-500 ${iconHover}`} /> {label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {showWhatsappModal && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-start sm:items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 sm:p-8 shadow-2xl relative my-4 sm:my-8 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <button onClick={() => setShowWhatsappModal(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
            <div className="flex flex-col items-center text-center mb-6">
              <MessageCircle className="w-12 h-12 text-emerald-500 mb-3" />
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Grupos de clase</h2>
              <p className="text-xs font-bold text-zinc-500 mt-2">Elige el grupo de WhatsApp correspondiente a tu clase.</p>
            </div>
            <div className="space-y-3">
              {classWhatsappLinks.map(link => (
                <button
                  key={`${link.classId}-${link.url}`}
                  onClick={() => {
                    setShowWhatsappModal(false);
                    setWhatsappConfirmModal(link);
                  }}
                  className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-100 font-black py-4 px-4 rounded-xl uppercase text-[10px] tracking-widest transition-colors flex items-center justify-center gap-2 text-center leading-tight"
                >
                  <MessageCircle className="w-4 h-4 shrink-0" /> {link.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}


      {whatsappConfirmModal && (
        <div className="fixed inset-0 bg-black/80 z-[110] flex items-start sm:items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl relative my-4 sm:my-8 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <button onClick={() => setWhatsappConfirmModal(null)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-3 border border-emerald-100">
                <MessageCircle className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-black uppercase tracking-tight text-slate-800 leading-tight">Grupo de WhatsApp de la clase</h2>
              {whatsappConfirmModal.label && (
                <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mt-2 leading-tight">{whatsappConfirmModal.label}</p>
              )}
            </div>

            <div className="space-y-3 text-sm text-zinc-600 font-medium leading-relaxed mb-6">
              <p>Vas a entrar en un grupo compartido con otros miembros de tu clase.</p>
              <p>El grupo se usa solo para coordinación, avisos, dudas y material relacionado con la escuela. Al entrar, tu nombre, número y foto de WhatsApp podrían ser visibles para otros participantes.</p>
              <p>Si solicitas la baja o dejas esta clase, deberás abandonar el grupo para proteger tus datos.</p>
              <p className="font-black text-slate-800">¿Quieres abrir WhatsApp?</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setWhatsappConfirmModal(null)} className="bg-zinc-100 text-zinc-600 font-black py-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-200 transition-colors">
                Cancelar
              </button>
              <button onClick={() => openWhatsappGroup(whatsappConfirmModal)} className="bg-emerald-600 text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-emerald-700 transition-colors shadow-md flex items-center justify-center gap-2">
                <MessageCircle className="w-4 h-4"/> Abrir WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
      
      {notification && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-[60] animate-in slide-in-from-top-4 duration-300 w-max max-w-[90%]">
          <div className={`px-6 py-3 rounded-full shadow-2xl text-white font-bold text-sm uppercase tracking-widest flex items-center gap-3 ${notification.type === 'error' ? 'bg-red-600' : 'bg-black'}`}>
            {notification.type === 'error' ? <X className="w-5 h-5" /> : <Check className="w-5 h-5" />}
            {notification.text}
          </div>
        </div>
      )}

      <header className="bg-white p-5 sticky top-0 z-50 shadow-sm border-b border-zinc-200">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="bg-black p-2 rounded-xl text-white"><Music className="w-5 h-5"/></div><div><h1 className="text-lg font-black uppercase leading-none">Mi Portal</h1><span className="text-[10px] font-bold text-zinc-400 uppercase">{profile.name}</span></div></div>
          <button onClick={logout} className="p-2 text-zinc-400 hover:text-rose-500 transition-colors"><LogOut className="w-5 h-5" /></button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-6 animate-in fade-in duration-300">
        
        {activeTab === 'home' && (
          <div className="space-y-6">
            
            <div className="bg-white border-2 border-zinc-100 rounded-3xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Hola, {profile.name.split(' ')[0]}</h2>
                <p className="text-zinc-400 font-bold text-xs uppercase tracking-widest mt-1">Escuela Los Mitos</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-amber-50 text-amber-600 px-4 py-2 rounded-xl flex items-center gap-2">
                  <Trophy className="w-4 h-4"/>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest leading-none">Puntos Mes</p>
                    <p className="font-black leading-none">{profile.triviaPoints || 0}</p>
                  </div>
                </div>
                {profile.triviaVictories > 0 && (
                  <div className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl flex items-center gap-2">
                    <Star className="w-4 h-4"/>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest leading-none">Victorias</p>
                      <p className="font-black leading-none">{profile.triviaVictories}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!hasPlayedToday ? (
              <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-3xl p-1 text-white shadow-xl relative overflow-hidden transform hover:scale-[1.02] transition-transform cursor-pointer" onClick={startTrivia}>
                <div className="bg-black/10 absolute inset-0"></div>
                <div className="relative z-10 p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                       <h3 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2 text-white"><Trophy className="w-6 h-6 text-amber-200"/> Reto del Día</h3>
                       <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-white/20 ${currentDifficulty.bg} ${currentDifficulty.color}`}>{currentDifficulty.label} ({currentDifficulty.points} pts)</span>
                    </div>
                    <p className="text-xs font-bold text-amber-100 uppercase tracking-widest flex items-center flex-wrap gap-2">
                       {(profile.triviaStreak || 0) > 0 && <span className="bg-orange-600 px-2 py-1 rounded text-white shadow-sm">🔥 Racha x{profile.triviaStreak}</span>}
                       ¡Responde rápido para bonus!
                    </p>
                  </div>
                  <button className="w-full sm:w-auto bg-white text-orange-600 px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg flex items-center justify-center gap-2 pointer-events-none">
                    <Timer className="w-4 h-4"/> Jugar Ahora
                  </button>
                </div>
                <p className="relative z-10 text-[9px] font-bold text-center text-amber-100/70 pb-2 px-4 uppercase tracking-widest">Condición indispensable: Ser alumno activo y al corriente de pago para optar a premios.</p>
              </div>
            ) : (
              <div className="bg-zinc-100 border-2 border-zinc-200 rounded-3xl p-6 text-center shadow-sm">
                <CheckCircle className="w-8 h-8 text-zinc-300 mx-auto mb-2"/>
                <p className="font-black text-slate-800 uppercase tracking-tight">Ya has jugado hoy</p>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-1">Vuelve mañana a por más puntos.</p>
              </div>
            )}

            <h3 className="font-black uppercase tracking-widest text-xs text-zinc-400 px-2 flex items-center gap-2 mt-8"><Calendar className="w-4 h-4"/> Mis Clases Asignadas</h3>
            
            {effectiveMyClasses.length === 0 ? (
              <div className="p-8 bg-white rounded-3xl border border-zinc-200 text-center shadow-sm">
                <Music className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                <p className="font-bold text-zinc-400 uppercase tracking-widest text-sm">Todavía no tienes clases asignadas.</p>
              </div>
            ) : (
              effectiveMyClasses.map((assignedClass, idx) => {
                const scheduleInfo = getNextClassScheduleInfo(assignedClass) || {
                  ...getNextClassInfo(assignedClass.dayOfWeek, assignedClass.time),
                  clase: assignedClass,
                  temporaryClassChange: null
                };
                const clase = {
                  ...(scheduleInfo.clase || assignedClass),
                  nextClassInfo: {
                    date: scheduleInfo.date,
                    dateStr: scheduleInfo.dateStr,
                    diffHours: scheduleInfo.diffHours
                  }
                };
                const classInfo = clase.nextClassInfo;
                const sessionTemporaryClassChange = scheduleInfo.temporaryClassChange || clase.temporaryClassChange || null;
                const upcomingTemporaryClassChange = sessionTemporaryClassChange
                  ? null
                  : getUpcomingClassTemporaryChange(assignedClass, todayStr);
                const announcedTemporaryClassChange = sessionTemporaryClassChange || upcomingTemporaryClassChange;
                const officialSchedule = announcedTemporaryClassChange?.officialSchedule || {
                  dayOfWeek: assignedClass.dayOfWeek,
                  time: assignedClass.time,
                  sede: assignedClass.sede,
                  sala: assignedClass.sala,
                  centerId: assignedClass.centerId,
                  roomId: assignedClass.roomId,
                  teacher: assignedClass.teacher,
                  duration: assignedClass.duration
                };
                const officialLocation = {
                  ...assignedClass,
                  ...officialSchedule,
                  centerId: officialSchedule.centerId || assignedClass.centerId,
                  roomId: officialSchedule.roomId || assignedClass.roomId,
                  sede: officialSchedule.sede || assignedClass.sede,
                  sala: officialSchedule.sala || assignedClass.sala
                };
                const upcomingLocation = upcomingTemporaryClassChange ? {
                  ...assignedClass,
                  ...upcomingTemporaryClassChange,
                  centerId: upcomingTemporaryClassChange.centerId || assignedClass.centerId,
                  roomId: upcomingTemporaryClassChange.roomId || assignedClass.roomId,
                  sede: upcomingTemporaryClassChange.sede || assignedClass.sede,
                  sala: upcomingTemporaryClassChange.sala || assignedClass.sala
                } : null;
                const classCenterId = getClassCenter(clase)?.id || normalizeConfigId(clase.centerId || clase.sede || 'Tarragona', 'tarragona');
                const holidayMatch = schoolCalendar.find(calendarItem => (
                  calendarItem.date === classInfo.dateStr
                  && (!calendarItem.centerId || calendarItem.centerId === classCenterId)
                ));
                const hasNotifiedNext = clase.exceptions?.[classInfo.dateStr]?.[profile.id];
                const myStudentEntry = getStudentEntryInClass(clase, profile.id);
                const isRecoveryClassForMe = myStudentEntry?.isRecovery === true;
                const isTemporaryRelocationClassForMe = myStudentEntry?.isTemporaryRelocation === true || clase.isTemporaryRelocationClass === true;
                const visibleClassResources = getVisibleClassResourcesForStudent(clase);
                const hasVisibleClassNotes = Boolean(String(clase.notes || '').trim()) && !isRecoveryClassForMe;
                const tasksPanelKey = getClassTasksPanelKey(clase, idx);
                const isTasksPanelExpanded = expandedClassTasks[tasksPanelKey] === true;

                if (holidayMatch) {
                  const isFestivo = holidayMatch.type === 'festivo';
                  return (
                    <div key={idx} className={`rounded-3xl p-6 shadow-md relative overflow-hidden mb-4 border-2 ${isFestivo ? 'bg-red-50 border-red-200' : 'bg-purple-50 border-purple-200'}`}>
                      <div className="flex items-center gap-3 mb-2">
                        {isFestivo ? <AlertCircle className="w-6 h-6 text-red-500"/> : <Sun className="w-6 h-6 text-purple-500"/>}
                        <h2 className={`text-xl font-black uppercase tracking-tighter ${isFestivo ? 'text-red-900' : 'text-purple-900'}`}>{isFestivo ? 'Día Festivo' : 'Vacaciones'}</h2>
                      </div>
                      <p className={`font-bold uppercase text-[10px] tracking-widest mb-4 ${isFestivo ? 'text-red-600' : 'text-purple-600'}`}>{holidayMatch.title || 'Escuela Cerrada'} • {classInfo.dateStr}</p>
                      <p className={`text-sm font-medium mb-4 ${isFestivo ? 'text-red-800' : 'text-purple-800'}`}>Tu próxima clase de {clase.subject} coincide con un día no lectivo oficial. La escuela permanecerá cerrada.</p>

                      {announcedTemporaryClassChange && (
                        <div className="mb-5 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-violet-900">
                          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest mb-2">
                            <RefreshCcw className="w-4 h-4" />
                            {sessionTemporaryClassChange ? 'Horario temporal' : 'Cambio temporal programado'}
                          </p>
                          <p className="text-xs font-black uppercase tracking-tight">{getTemporaryClassChangePeriodLabel(announcedTemporaryClassChange)}</p>
                          {upcomingTemporaryClassChange && (
                            <p className="text-xs font-bold mt-2 leading-relaxed">
                              Nuevo horario: {getDayName(upcomingTemporaryClassChange.dayOfWeek)} {upcomingTemporaryClassChange.time || ''}h · {getClassCenterName(upcomingLocation)}{getClassRoomName(upcomingLocation) ? ` (${getClassRoomName(upcomingLocation)})` : ''}{upcomingTemporaryClassChange.teacher ? ` · Prof. ${upcomingTemporaryClassChange.teacher}` : ''}
                            </p>
                          )}
                          <p className="text-[10px] font-bold text-violet-700 mt-3 leading-relaxed">
                            Al finalizar volverás a {getDayName(officialSchedule.dayOfWeek)} {officialSchedule.time || ''}h · {getClassCenterName(officialLocation)}{getClassRoomName(officialLocation) ? ` (${getClassRoomName(officialLocation)})` : ''}.
                          </p>
                        </div>
                      )}

                      {renderClassTasksResources({
                        clase,
                        resources: visibleClassResources,
                        hasNotes: hasVisibleClassNotes,
                        panelKey: tasksPanelKey,
                        expanded: isTasksPanelExpanded,
                        variant: isFestivo ? 'holidayRed' : 'holidayPurple'
                      })}
                    </div>
                  );
                }

                const isCongelado = isStudentFrozen;

                return (
                  <div key={idx} className={`rounded-3xl p-6 shadow-xl relative overflow-hidden mb-4 transition-all ${isCongelado ? 'bg-zinc-200 text-zinc-500 border-2 border-zinc-300' : 'bg-black text-white'}`}>
                      <p className={`${isCongelado ? 'text-zinc-500' : 'text-zinc-400'} font-bold uppercase text-[10px] tracking-widest mb-1`}>Clase de {clase.subject}</p>
                      <h2 className={`text-3xl font-black uppercase tracking-tighter ${isCongelado ? 'text-zinc-400' : ''}`}>{getDayName(clase.dayOfWeek)}</h2>
                      <p className={`text-lg font-medium mb-6 ${isCongelado ? 'text-zinc-500' : 'text-zinc-300'}`}>{clase.time}h</p>
                      {announcedTemporaryClassChange && (
                        <div className={`mb-5 rounded-2xl border p-4 ${isCongelado ? 'bg-violet-100/60 border-violet-200 text-violet-900' : 'bg-violet-950/70 border-violet-700 text-violet-100'}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <RefreshCcw className="w-4 h-4 shrink-0" />
                            <p className="text-[10px] font-black uppercase tracking-widest">
                              {sessionTemporaryClassChange
                                ? (isTemporaryClassChangeActiveForDate(sessionTemporaryClassChange, todayStr) ? 'Cambio temporal activo' : 'Próxima clase en horario temporal')
                                : 'Cambio temporal programado'}
                            </p>
                          </div>
                          <p className="text-xs font-black uppercase tracking-tight">
                            {getTemporaryClassChangePeriodLabel(announcedTemporaryClassChange)}
                          </p>
                          {upcomingTemporaryClassChange && (
                            <p className="text-xs font-bold mt-2 leading-relaxed">
                              Nuevo horario: {getDayName(upcomingTemporaryClassChange.dayOfWeek)} {upcomingTemporaryClassChange.time || ''}h · {getClassCenterName(upcomingLocation)}{getClassRoomName(upcomingLocation) ? ` (${getClassRoomName(upcomingLocation)})` : ''}{upcomingTemporaryClassChange.teacher ? ` · Prof. ${upcomingTemporaryClassChange.teacher}` : ''}
                              {Number(upcomingTemporaryClassChange.duration) && Number(upcomingTemporaryClassChange.duration) !== Number(officialSchedule.duration || 60) ? ` · ${Number(upcomingTemporaryClassChange.duration)} min` : ''}
                            </p>
                          )}
                          {sessionTemporaryClassChange && Number(clase.duration) && Number(clase.duration) !== Number(officialSchedule.duration || 60) && (
                            <p className="text-xs font-bold mt-2">Duración temporal: {Number(clase.duration)} min</p>
                          )}
                          <p className={`text-[10px] font-bold mt-3 leading-relaxed ${isCongelado ? 'text-violet-700' : 'text-violet-300'}`}>
                            Al finalizar volverás a {getDayName(officialSchedule.dayOfWeek)} {officialSchedule.time || ''}h · {getClassCenterName(officialLocation)}{getClassRoomName(officialLocation) ? ` (${getClassRoomName(officialLocation)})` : ''}{officialSchedule.teacher ? ` · Prof. ${officialSchedule.teacher}` : ''}.
                          </p>
                        </div>
                      )}
                      {isTemporaryRelocationClassForMe && (
                        <div className="mb-5 inline-flex items-center gap-2 bg-violet-100 text-violet-800 border border-violet-200 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest">
                          <Clock className="w-4 h-4" />
                          {myStudentEntry?.relocationLabel || getTemporaryRelocationLabel(clase.temporaryRelocation)}
                        </div>
                      )}
                      
                      <div className={`flex flex-col sm:flex-row gap-3 text-sm font-medium mb-8 p-4 rounded-2xl border ${isCongelado ? 'bg-zinc-300/50 border-zinc-300 text-zinc-600' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-300'}`}>
                        <span className="flex items-center gap-2"><User className="w-4 h-4"/> Prof: {clase.teacher}</span> <span className="hidden sm:inline">•</span> <span className="flex items-center gap-2"><MapPin className="w-4 h-4"/> {getClassCenterName(clase)}{getClassRoomName(clase) ? ` (${getClassRoomName(clase)})` : ''}</span>
                      </div>

                      {renderClassTasksResources({
                        clase,
                        resources: visibleClassResources,
                        hasNotes: hasVisibleClassNotes,
                        panelKey: tasksPanelKey,
                        expanded: isTasksPanelExpanded,
                        variant: isCongelado ? 'frozen' : 'dark'
                      })}
                      
                      {isCongelado ? (
                        <div className="w-full bg-blue-100 text-blue-800 font-black py-4 px-6 rounded-xl flex items-center justify-center gap-3 uppercase text-[10px] sm:text-xs tracking-widest border border-blue-200 text-center leading-tight">
                          <Snowflake className="w-5 h-5 shrink-0" />
                          <span>Tienes la plaza en mantenimiento.<br/>{maintenancePeriodText ? `Periodo ${maintenancePeriodText}.` : 'Tu plaza queda reservada durante este periodo.'}</span>
                        </div>
                      ) : isRecoveryClassForMe ? (
                        <div className="w-full bg-amber-100 text-amber-900 font-black py-4 px-6 rounded-xl flex items-center justify-center gap-2 uppercase text-xs tracking-widest border border-amber-200 text-center">
                          <Ticket className="w-4 h-4 shrink-0" /> Clase de recuperación no recuperable
                        </div>
                      ) : hasNotifiedNext ? (
                        <div className="w-full bg-zinc-800/50 text-emerald-400 font-black py-4 px-6 rounded-xl flex items-center justify-center gap-2 uppercase text-xs tracking-widest border border-emerald-900/50">
                          <CheckCircle className="w-4 h-4" /> Falta Notificada
                        </div>
                      ) : (
                        <button onClick={() => openAbsenceModal(clase)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-black py-4 px-6 rounded-xl flex items-center justify-center gap-2 uppercase text-xs tracking-widest border border-zinc-700 transition-all shadow-lg active:scale-95">
                          <AlertCircle className="w-4 h-4 text-amber-400" /> No podré asistir
                        </button>
                      )}
                  </div>
                );
              })
            )}

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg flex items-center gap-2"><Ticket className="w-5 h-5 text-amber-500"/> Recuperaciones</h3>
                <div className="flex flex-col items-end gap-1">
                  <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-lg text-xs font-black">{profile.activeTickets || 0} Tickets</span>
                  {profile.futureSummerTickets > 0 && (
                    <span className="bg-sky-100 text-sky-700 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">{profile.futureSummerTickets} verano · desde septiembre</span>
                  )}
                </div>
              </div>
              <button 
                disabled={isStudentFrozen || !profile.activeTickets || hasReachedRecoveryLimit} 
                onClick={() => {
                  if (isStudentFrozen) {
                    showToast('Tus tickets se conservan, pero no puedes canjearlos mientras tu plaza esté en mantenimiento.', 'error');
                    return;
                  }
                  if (hasReachedRecoveryLimit) {
                    showToast('Ya tienes tantas recuperaciones solicitadas o programadas como tickets disponibles.', 'error');
                    return;
                  }
                  setGestionModal({
                    type: 'recuperacion', title: 'Canjear Ticket', icon: Ticket, color: 'text-amber-500',
                    desc: 'Elige el grupo en el que quieres gastar tu ticket. Si no encuentras disponibilidad, vuelve a mirar otro día.',
                    placeholder: 'Añade observaciones para el profesor (Opcional)...'
                  });
                }}
                className={`w-full font-black py-4 rounded-xl shadow-sm uppercase text-xs tracking-widest transition-colors ${profile.activeTickets > 0 && !hasReachedRecoveryLimit && !isStudentFrozen ? 'bg-amber-400 text-amber-950 hover:bg-amber-300' : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'}`}
              >
                {isStudentFrozen ? 'Tickets conservados · mantenimiento' : profile.activeTickets > 0 ? (hasReachedRecoveryLimit ? 'Recuperaciones ya asignadas' : 'Canjear Ticket Libre') : 'No tienes tickets'}
              </button>
              <div className="mt-4 flex items-start gap-2 bg-zinc-50 border border-zinc-100 p-3 rounded-xl">
                <Info className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                <p className="text-[11px] font-bold text-zinc-500 leading-relaxed uppercase tracking-wide">
                  {isStudentFrozen
                    ? 'Tus tickets se mantienen guardados, pero no podrás gestionarlos ni recuperar clases hasta que termine tu periodo de mantenimiento.'
                    : profile.futureSummerTickets > 0
                      ? 'Tienes tickets especiales de verano guardados. No se podrán gestionar hasta septiembre y estarán disponibles hasta diciembre.'
                      : 'Los tickets de recuperación se verán reflejados aquí cuando haya pasado el día de la falta avisada.'}
                </p>
              </div>
            </div>

            {(pendingProcedures.length > 0 || pendingAbsences.length > 0) && (
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-200 mt-6">
                <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-amber-500"/> En Trámite
                </h3>
                <div className="space-y-3">
                  {pendingAbsences.map((abs, i) => (
                    <div key={`abs-${i}`} className="p-4 bg-zinc-50 border border-zinc-100 rounded-2xl flex items-center justify-between">
                       <div>
                         <p className="text-xs font-black uppercase text-slate-800 tracking-tight">Falta: {abs.subject}</p>
                         <p className="text-[10px] font-bold text-zinc-500 uppercase mt-1">{formatDateSpanish(abs.date)}</p>
                       </div>
                       <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700">
                         Esperando Ticket
                       </span>
                    </div>
                  ))}
                  {pendingProcedures.map(proc => (
                    <div key={proc.id} className="p-4 bg-zinc-50 border border-zinc-100 rounded-2xl flex items-center justify-between">
                       <div>
                         <p className="text-xs font-black uppercase text-slate-800 tracking-tight">{proc.title}</p>
                         <p className="text-[10px] font-bold text-zinc-500 uppercase mt-1">Solicitado el {new Date(proc.date).toLocaleDateString('es-ES')}</p>
                       </div>
                       <span className="text-[10px] font-black uppercase tracking-widest bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg">
                         En revisión
                       </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="text-center mt-4">
              <button onClick={() => setShowContract(true)} className="text-[10px] font-bold text-zinc-400 hover:text-black uppercase tracking-widest underline underline-offset-4">Ver contrato de prestación de servicios</button>
            </div>
          </div>
        )}

        {/* --- PESTAÑA: CALENDARIO --- */}
        {activeTab === 'calendar' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-black text-white border-2 border-zinc-800 rounded-3xl p-6 md:p-8 flex items-center justify-between shadow-xl relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-2xl font-black uppercase tracking-tight">Calendario</h2>
                <p className="text-zinc-400 font-bold text-xs uppercase tracking-widest mt-1">
                  Días no lectivos oficiales
                  {calendarCenterNames.length > 0 && (
                    <span className="block mt-1 text-zinc-500 normal-case tracking-normal">
                      {calendarCenterNames.length === 1 ? 'Sede' : 'Sedes'}: {calendarCenterNames.length === 2
                        ? `${calendarCenterNames[0]} y ${calendarCenterNames[1]}`
                        : calendarCenterNames.join(', ')}
                    </span>
                  )}
                </p>
              </div>
              <Calendar className="w-20 h-20 text-zinc-800 absolute -right-4 -bottom-4 rotate-12 pointer-events-none" />
            </div>

            {!settingsLoaded ? (
              <div className="bg-white rounded-3xl p-10 shadow-sm border border-zinc-200 text-center">
                <RefreshCcw className="w-9 h-9 text-zinc-300 mx-auto mb-4 animate-spin" />
                <p className="font-black text-zinc-500 uppercase tracking-widest text-xs">Cargando calendario…</p>
              </div>
            ) : settingsLoadError ? (
              <div className="bg-red-50 rounded-3xl p-6 shadow-sm border border-red-200 text-center">
                <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
                <p className="font-black text-red-900 uppercase tracking-tight">No se ha podido cargar el calendario</p>
                <p className="text-sm font-medium text-red-700 mt-2">No mostraremos fechas vacías hasta poder verificarlas.</p>
                <button
                  type="button"
                  onClick={() => setSettingsRetryNonce(value => value + 1)}
                  className="mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-red-600 text-white font-black uppercase tracking-widest text-[10px] hover:bg-red-700 transition-colors"
                >
                  <RefreshCcw className="w-4 h-4" /> Reintentar
                </button>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-sm border border-zinc-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => selectCalendarMonth(shiftMonthValue(calendarMonth, -1))}
                        className="w-10 h-10 rounded-xl border border-zinc-200 bg-white text-zinc-700 flex items-center justify-center hover:bg-zinc-50 transition-colors"
                        aria-label="Mes anterior"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <label className="sr-only" htmlFor="student-calendar-month">Seleccionar mes</label>
                      <select
                        id="student-calendar-month"
                        value={calendarMonth}
                        onChange={event => selectCalendarMonth(event.target.value)}
                        className="h-10 min-w-0 flex-1 sm:min-w-52 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm font-black text-slate-800 capitalize outline-none focus:ring-2 focus:ring-black"
                      >
                        {calendarMonthOptions.map(monthValue => (
                          <option key={monthValue} value={monthValue}>{formatCalendarMonthLabel(monthValue)}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => selectCalendarMonth(shiftMonthValue(calendarMonth, 1))}
                        className="w-10 h-10 rounded-xl border border-zinc-200 bg-white text-zinc-700 flex items-center justify-center hover:bg-zinc-50 transition-colors"
                        aria-label="Mes siguiente"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>

                    {calendarMonth !== currentCalendarMonth && (
                      <button
                        type="button"
                        onClick={() => selectCalendarMonth(currentCalendarMonth)}
                        className="self-start sm:self-auto px-4 py-2.5 rounded-xl bg-zinc-900 text-white font-black uppercase tracking-widest text-[9px] hover:bg-black transition-colors"
                      >
                        Mes actual
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-2 mb-5 px-1 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-red-500" /> Festivo</span>
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-violet-500" /> Vacaciones</span>
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full border-2 border-zinc-900 bg-white" /> Hoy</span>
                  </div>

                  <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-1">
                    {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(dayName => (
                      <div key={dayName} className="py-2 text-center text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-zinc-400">
                        {dayName}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1 sm:gap-2">
                    {calendarGridDays.map(calendarDay => {
                      if (calendarDay.empty) return <div key={calendarDay.key} aria-hidden="true" />;
                      const hasFestivo = calendarDay.events.some(event => event.type === 'festivo');
                      const hasVacaciones = calendarDay.events.some(event => event.type === 'vacaciones');
                      const hasClosure = hasFestivo || hasVacaciones;
                      const isSelected = selectedCalendarDay === calendarDay.date;
                      const closureColor = hasFestivo && hasVacaciones
                        ? 'bg-gradient-to-br from-red-100 to-violet-100 border-red-200 text-zinc-900'
                        : hasFestivo
                          ? 'bg-red-100 border-red-200 text-red-950'
                          : hasVacaciones
                            ? 'bg-violet-100 border-violet-200 text-violet-950'
                            : calendarDay.isWeekend
                              ? 'bg-zinc-50 border-zinc-100 text-zinc-400'
                              : 'bg-white border-zinc-100 text-slate-700';

                      return (
                        <button
                          key={calendarDay.key}
                          type="button"
                          onClick={() => hasClosure && setSelectedCalendarDay(calendarDay.date)}
                          disabled={!hasClosure}
                          title={hasClosure ? calendarDay.events.map(event => event.title).join(' · ') : undefined}
                          aria-label={`${formatCalendarDateLabel(calendarDay.date)}${hasClosure ? `: ${calendarDay.events.map(event => event.title).join(', ')}` : ''}`}
                          className={`min-h-12 sm:min-h-16 rounded-xl border p-1.5 sm:p-2 flex flex-col items-center justify-between transition-all ${closureColor} ${hasClosure ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-sm' : 'cursor-default'} ${calendarDay.isToday ? 'ring-2 ring-zinc-900 ring-offset-1' : ''} ${isSelected ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}
                        >
                          <span className="font-black text-xs sm:text-sm">{calendarDay.day}</span>
                          <span className="h-2 flex items-center justify-center gap-1" aria-hidden="true">
                            {hasFestivo && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                            {hasVacaciones && <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <p className="mt-5 text-[10px] font-medium leading-relaxed text-zinc-400">
                    Los días sin color no tienen cierres generales registrados. Consulta «Mis clases» para ver tu horario concreto.
                  </p>

                  {selectedCalendarDetails.length > 0 && (
                    <div className="mt-4 p-4 rounded-2xl bg-amber-50 border border-amber-200" aria-live="polite">
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-2">{formatCalendarDateLabel(selectedCalendarDay)}</p>
                      <div className="space-y-1">
                        {selectedCalendarDetails.map((calendarItem, index) => (
                          <p key={`${calendarItem.type}-${calendarItem.centerId || 'global'}-${index}`} className="font-bold text-sm text-amber-950">
                            {calendarItem.type === 'festivo' ? 'Festivo' : 'Vacaciones'} · {calendarItem.title}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-zinc-200">
                  <div className="mb-5">
                    <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">Días sin clase</h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">{formatCalendarMonthLabel(calendarMonth)}</p>
                  </div>

                  {selectedMonthClosures.length === 0 ? (
                    <div className="py-7 px-4 rounded-2xl bg-zinc-50 border border-zinc-100 text-center">
                      <CheckCircle className="w-9 h-9 text-emerald-400 mx-auto mb-3" />
                      <p className="font-black text-zinc-600 text-sm">No hay festivos ni Vacaciones registrados este mes</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedMonthClosures.map((calendarItem, index) => {
                        const isFestivo = calendarItem.type === 'festivo';
                        const center = calendarItem.centerId ? findCenterByValue(centers, calendarItem.centerId) : null;
                        return (
                          <button
                            key={`${calendarItem.date}-${calendarItem.type}-${calendarItem.centerId || 'global'}-${index}`}
                            type="button"
                            onClick={() => setSelectedCalendarDay(calendarItem.date)}
                            className={`w-full p-4 rounded-2xl border text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all hover:shadow-sm ${selectedCalendarDay === calendarItem.date ? 'ring-2 ring-amber-400 ring-offset-1' : ''} ${isFestivo ? 'bg-red-50 border-red-100 text-red-950' : 'bg-violet-50 border-violet-100 text-violet-950'}`}
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <span className={`mt-1 w-3 h-3 rounded-full shrink-0 ${isFestivo ? 'bg-red-500' : 'bg-violet-500'}`} />
                              <div className="min-w-0">
                                <span className="text-[9px] font-black uppercase tracking-widest opacity-60 block">{isFestivo ? 'Festivo' : 'Vacaciones'}</span>
                                <span className="font-black text-sm block mt-0.5">{formatCalendarDateLabel(calendarItem.date)}</span>
                                <span className="font-medium text-xs block mt-1 opacity-80">{calendarItem.title}</span>
                              </div>
                            </div>
                            <span className="self-start sm:self-auto text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-white/70 border border-current/10 whitespace-nowrap">
                              {center?.name || 'Todas las sedes'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* --- PESTAÑA: EXTRAS --- */}
        {activeTab === 'extras' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-900 text-white border-2 border-indigo-800 rounded-3xl p-6 md:p-8 flex items-center justify-between shadow-xl relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-2xl font-black uppercase tracking-tight">Mitos+</h2>
                <p className="text-blue-200 font-bold text-xs uppercase tracking-widest mt-1">Sácale más partido a tu música</p>
              </div>
              <Sparkles className="w-24 h-24 text-white/10 absolute -right-4 -bottom-4 pointer-events-none" />
            </div>

            {workshopsLoaded && visibleWorkshops.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-end justify-between gap-3 px-1">
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-tight text-slate-800">Talleres y actividades</h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">Propuestas especiales de duración limitada</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {visibleWorkshops.map(workshop => {
                    const registration = getWorkshopRegistration(workshop.id);
                    const activeRegistration = registration && ['confirmed', 'pending', 'waitlist'].includes(registration.status) ? registration : null;
                    const firstSession = workshop.sessions?.[0];
                    const registrationOpen = isWorkshopRegistrationOpen(workshop);
                    const freeSeats = getWorkshopFreeSeats(workshop);
                    const isFull = !workshop.unlimitedCapacity && freeSeats === 0;
                    const safeImageUrl = getSafeAnnouncementUrl(workshop.imageUrl || '');
                    return (
                      <article key={workshop.id} className={`bg-white rounded-3xl shadow-sm border-2 overflow-hidden flex flex-col h-full transition-all ${workshop.featured ? 'border-amber-300 ring-2 ring-amber-100' : 'border-zinc-100 hover:border-violet-300'}`}>
                        <button onClick={() => openWorkshopModal(workshop)} className="text-left flex flex-col h-full group">
                          <div className="h-44 bg-gradient-to-br from-violet-700 to-zinc-950 relative overflow-hidden">
                            {safeImageUrl ? <img src={safeImageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"/> : <div className="w-full h-full flex items-center justify-center"><Music className="w-20 h-20 text-white/20"/></div>}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent"/>
                            <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                              {workshop.featured && <span className="bg-amber-400 text-amber-950 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest"><Star className="w-3 h-3 inline mr-1"/> Destacado</span>}
                              {activeRegistration && <span className={`px-2.5 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${WORKSHOP_REGISTRATION_STATUS_STYLE[activeRegistration.status]}`}>{WORKSHOP_REGISTRATION_STATUS_LABELS[activeRegistration.status]}</span>}
                            </div>
                            {firstSession && <div className="absolute bottom-3 left-4 right-4 text-white"><span className="text-[9px] font-black uppercase tracking-widest text-white/70 block">Próxima sesión</span><span className="font-black text-sm capitalize">{formatWorkshopDate(firstSession.date)} · {firstSession.startTime}h</span></div>}
                          </div>
                          <div className="p-5 flex flex-col flex-1">
                            <h4 className="text-xl font-black uppercase tracking-tight text-slate-800 leading-tight">{workshop.title}</h4>
                            <p className="text-sm text-zinc-500 font-medium mt-2 leading-relaxed flex-1">{workshop.shortDescription}</p>
                            <div className="space-y-2 mt-5 pt-4 border-t border-zinc-100">
                              <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-widest"><span className="text-zinc-400 flex items-center gap-1"><MapPin className="w-3.5 h-3.5"/> Lugar</span><span className="text-slate-700 text-right">{getWorkshopLocationLabelForStudent(workshop)}</span></div>
                              <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-widest"><span className="text-zinc-400 flex items-center gap-1"><Ticket className="w-3.5 h-3.5"/> Precio</span><span className="text-slate-700">{workshop.priceType === 'free' ? 'Gratuito' : formatEuro(workshop.price)}</span></div>
                              {!activeRegistration && <div className="flex items-center justify-between gap-3 text-[10px] font-black uppercase tracking-widest"><span className="text-zinc-400 flex items-center gap-1"><Clock className="w-3.5 h-3.5"/> Inscripción</span><span className={registrationOpen ? 'text-emerald-700' : 'text-zinc-500'}>{registrationOpen ? isFull && workshop.waitlistEnabled ? 'Lista de espera' : workshop.unlimitedCapacity ? 'Abierta' : `${freeSeats} ${freeSeats === 1 ? 'plaza' : 'plazas'}` : 'Cerrada'}</span></div>}
                            </div>
                            <span className="mt-5 w-full bg-violet-600 group-hover:bg-violet-700 text-white font-black py-3.5 rounded-xl uppercase text-[10px] tracking-widest flex items-center justify-center gap-2">{activeRegistration ? 'Ver mi inscripción' : 'Ver taller'} <ArrowRight className="w-4 h-4"/></span>
                          </div>
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="bg-white rounded-3xl p-6 shadow-sm border-2 border-zinc-100 flex flex-col h-full relative overflow-hidden">
                {profile?.hasMitoverso ? (
                  <div className="absolute top-4 right-4 bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                    <Star className="w-3 h-3"/> Suscripción Activa
                  </div>
                ) : pendingMitoversoSignup && (
                  <div className="absolute top-4 right-4 bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                    <Clock className="w-3 h-3"/> En revisión
                  </div>
                )}
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${profile?.hasMitoverso ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
                  <MonitorPlay className="w-8 h-8"/>
                </div>
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">Mitoverso</h3>
                <p className="text-sm text-zinc-500 font-medium mb-6 flex-1">
                  Accede a nuestra plataforma de cursos online, audios y recursos exclusivos. Ideal para alumnos de guitarra que quieren avanzar a su ritmo desde casa.
                </p>
                {!profile?.hasMitoverso && (
                  <div className="bg-zinc-50 border border-zinc-100 p-4 rounded-xl mb-6">
                    <span className="block text-xs font-black uppercase tracking-widest text-zinc-400 mb-1">Precio Alumno</span>
                    <span className="text-xl font-black text-slate-800">15€ <span className="text-sm text-zinc-500">/ mes</span></span>
                  </div>
                )}
                
                {profile?.hasMitoverso ? (
                  <button 
                    onClick={() => window.open('https://classroom.google.com/', '_blank', 'noopener,noreferrer')}
                    className="w-full bg-indigo-600 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-indigo-700 transition-colors shadow-lg flex items-center justify-center gap-2"
                  >
                    Entrar a Classroom <ArrowRight className="w-4 h-4"/>
                  </button>
                ) : (
                  <button 
                    onClick={() => openExtraSignupModal('mitoverso')}
                    disabled={pendingMitoversoSignup}
                    className={`w-full font-black py-4 rounded-xl uppercase text-xs tracking-widest transition-colors shadow-lg flex items-center justify-center gap-2 ${pendingMitoversoSignup ? 'bg-amber-100 text-amber-700 cursor-not-allowed' : 'bg-black text-white hover:bg-zinc-800'}`}
                  >
                    {pendingMitoversoSignup ? <><Clock className="w-4 h-4"/> Solicitud enviada</> : 'Solicitar Acceso'}
                  </button>
                )}
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-sm border-2 border-zinc-100 flex flex-col h-full relative overflow-hidden">
                {profile?.hasMitobox ? (
                  <div className="absolute top-4 right-4 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                    <Star className="w-3 h-3"/> Tarifa Plana Activa
                  </div>
                ) : pendingMitoboxSignup && (
                  <div className="absolute top-4 right-4 bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                    <Clock className="w-3 h-3"/> En revisión
                  </div>
                )}
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 ${profile?.hasMitobox ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600'}`}>
                  <DoorOpen className="w-8 h-8"/>
                </div>
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-2">Mitobox</h3>
                <p className="text-sm text-zinc-500 font-medium mb-6 flex-1">
                  ¿No puedes ensayar en casa? Con nuestra tarifa plana puedes reservar las aulas de la escuela que estén vacías para venir a practicar siempre que quieras.
                </p>
                {!profile?.hasMitobox && (
                  <div className="bg-zinc-50 border border-zinc-100 p-4 rounded-xl mb-6">
                    <span className="block text-xs font-black uppercase tracking-widest text-zinc-400 mb-1">Tarifa Plana</span>
                    <span className="text-xl font-black text-slate-800">35€ <span className="text-sm text-zinc-500">/ mes</span></span>
                  </div>
                )}
                
                {profile?.hasMitobox ? (
                  <button 
                    onClick={() => setMitoboxModal(true)}
                    className="w-full bg-blue-600 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-blue-700 transition-colors shadow-lg flex items-center justify-center gap-2"
                  >
                    <Calendar className="w-4 h-4"/> Reservar Sala
                  </button>
                ) : (
                  <button 
                    onClick={() => openExtraSignupModal('mitobox')}
                    disabled={pendingMitoboxSignup}
                    className={`w-full font-black py-4 rounded-xl uppercase text-xs tracking-widest transition-colors shadow-lg flex items-center justify-center gap-2 ${pendingMitoboxSignup ? 'bg-amber-100 text-amber-700 cursor-not-allowed' : 'bg-black text-white hover:bg-zinc-800'}`}
                  >
                    {pendingMitoboxSignup ? <><Clock className="w-4 h-4"/> Solicitud enviada</> : 'Solicitar Acceso'}
                  </button>
                )}
              </div>

            </div>
          </div>
        )}

        {/* --- PESTAÑA: TABLÓN --- */}
        {activeTab === 'news' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-black text-white border-2 border-zinc-800 rounded-3xl p-6 md:p-8 flex items-center justify-between shadow-xl relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-2xl font-black uppercase tracking-tight">Tablón de Avisos</h2>
                <p className="text-zinc-400 font-bold text-xs uppercase tracking-widest mt-1">Novedades y Enlaces</p>
              </div>
              <Megaphone className="w-20 h-20 text-zinc-800 absolute -right-4 -bottom-4 rotate-12 pointer-events-none" />
            </div>

            <div className="mb-5">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-3 px-2 flex items-center gap-2"><LinkIcon className="w-4 h-4"/> Enlaces rápidos</h3>
              <div className={`grid ${classWhatsappLinks.length > 0 ? 'grid-cols-4' : 'grid-cols-3'} gap-2`}>
                <a href="https://www.escuelalosmitos.com/" target="_blank" rel="noopener noreferrer" className="bg-white border border-zinc-200 px-2 py-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 shadow-sm hover:border-black transition-colors group min-h-[74px]">
                  <Globe className="w-5 h-5 text-zinc-400 group-hover:text-black"/>
                  <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Web</span>
                </a>
                {classWhatsappLinks.length > 0 && (
                  <button onClick={handleWhatsappClick} className="bg-emerald-50 border border-emerald-100 px-2 py-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 shadow-sm hover:bg-emerald-100 transition-colors group min-h-[74px]">
                    <MessageCircle className="w-5 h-5 text-emerald-500"/>
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-900">WhatsApp</span>
                  </button>
                )}
                <button onClick={() => setShowSocialModal(true)} className="bg-white border border-zinc-200 px-2 py-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 shadow-sm hover:border-black transition-colors group min-h-[74px]">
                  <Megaphone className="w-5 h-5 text-zinc-400 group-hover:text-black"/>
                  <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Redes</span>
                </button>
                <button onClick={handleReviewClick} className="bg-amber-50 border border-amber-200 px-2 py-3 rounded-2xl flex flex-col items-center justify-center gap-1.5 shadow-sm hover:bg-amber-100 transition-colors group min-h-[74px]">
                  <Star className="w-5 h-5 text-amber-500"/>
                  <span className="text-[9px] font-black uppercase tracking-widest text-amber-900">Valóranos</span>
                </button>
              </div>
            </div>

            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4 px-2 flex items-center gap-2"><Bell className="w-4 h-4"/> Últimas Noticias</h3>
            {visibleAnnouncements.length === 0 ? (
               <div className="p-10 bg-white rounded-3xl border border-zinc-200 text-center shadow-sm">
                <p className="font-black text-slate-800 uppercase tracking-widest text-sm">El tablón está vacío</p>
              </div>
            ) : (
              <div className="space-y-4">
                {visibleAnnouncements.slice(0, visibleAnnouncementsCount).map(ann => {
                  if (ann.type === 'call') {
                    const response = getMyCallResponse(ann.id);
                    const responseStatus = response?.status || 'pending';
                    const draft = getCallDraft(ann);
                    const closed = isStudentCallClosed(ann);
                    const canSubmit = !closed && (!response || ['pending', 'withdrawn'].includes(responseStatus));
                    const canWithdraw = Boolean(response && ['pending', 'confirmed', 'waitlist'].includes(responseStatus));
                    const capacity = Number(ann.callCapacity || 0);
                    const isSaving = savingCallId === ann.id;

                    return (
                      <div key={ann.id} className="bg-white rounded-3xl shadow-sm border-2 border-amber-200 overflow-hidden">
                        <div className="bg-amber-50 px-6 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-amber-100">
                          <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">Convocatoria</span>
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${closed ? 'bg-zinc-200 text-zinc-600' : 'bg-emerald-100 text-emerald-700'}`}>
                            {closed ? 'Finalizada' : `Abierta hasta ${ann.callDeadline ? new Date(ann.callDeadline).toLocaleString('es-ES') : 'nuevo aviso'}`}
                          </span>
                        </div>

                        <div className="p-6">
                          <h3 className="font-black text-slate-800 tracking-tight text-xl leading-tight mb-2">{ann.title}</h3>
                          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">Publicada el {formatDateSpanish(ann.date)}</p>
                          {ann.content && <p className="text-sm font-medium text-slate-600 leading-relaxed whitespace-pre-wrap mb-5">{ann.content}</p>}

                          <div className="flex flex-wrap gap-2 mb-5">
                            {capacity > 0 && <span className="px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-amber-800">{capacity} plaza(s) orientativas</span>}
                            <span className="px-3 py-2 bg-zinc-50 border border-zinc-100 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-600">Selección por Administración</span>
                          </div>

                          {response && (
                            <div className={`mb-5 border rounded-2xl p-4 ${CALL_RESPONSE_STATUS_STYLE[responseStatus] || CALL_RESPONSE_STATUS_STYLE.pending}`}>
                              <div className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 shrink-0"/>
                                <span className="text-xs font-black uppercase tracking-widest">{CALL_RESPONSE_STATUS_LABELS[responseStatus] || responseStatus}</span>
                              </div>
                              <p className="text-xs font-medium mt-2 leading-relaxed">
                                {responseStatus === 'pending' && 'Administración todavía no ha revisado tu candidatura.'}
                                {responseStatus === 'confirmed' && 'Administración ha confirmado tu participación.'}
                                {responseStatus === 'waitlist' && 'Tu candidatura está en reserva por si queda una plaza disponible.'}
                                {responseStatus === 'rejected' && 'En esta ocasión tu candidatura no ha sido seleccionada.'}
                                {responseStatus === 'withdrawn' && (closed ? 'Retiraste tu candidatura antes del cierre.' : 'Has retirado tu candidatura. Puedes volver a presentarla mientras siga abierta.')}
                              </p>
                            </div>
                          )}

                          {canSubmit && (
                            <div className="space-y-3">
                              <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-amber-800 mb-2">
                                  {ann.callResponsePrompt || 'Comentario para Administración (opcional)'}
                                </label>
                                <textarea
                                  value={draft}
                                  onChange={event => updateCallDraft(ann.id, event.target.value)}
                                  placeholder={ann.callResponsePrompt ? 'Escribe aquí la información solicitada...' : 'Puedes indicar disponibilidad, instrumento u otra información útil...'}
                                  className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl focus:border-amber-500 outline-none min-h-[110px] resize-y text-sm font-medium"
                                />
                                <p className="mt-2 text-[10px] font-bold text-zinc-500 leading-relaxed">Apuntarte envía una candidatura. La plaza no queda confirmada hasta que Administración la revise.</p>
                              </div>

                              <button onClick={() => submitCallResponse(ann)} disabled={isSaving} className="w-full bg-amber-500 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-amber-600 transition-colors shadow-lg flex justify-center items-center gap-2 disabled:opacity-50">
                                {isSaving ? 'Guardando...' : <><Send className="w-4 h-4"/> {!response ? 'Quiero participar' : responseStatus === 'withdrawn' ? 'Volver a presentarme' : 'Actualizar candidatura'}</>}
                              </button>
                            </div>
                          )}

                          {!canSubmit && response?.comment && (
                            <div className="mb-5 bg-zinc-50 border border-zinc-200 rounded-2xl p-4">
                              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 mb-2">Información que enviaste</p>
                              <p className="text-sm font-medium text-zinc-700 whitespace-pre-wrap">{response.comment}</p>
                            </div>
                          )}

                          {closed && !response && <div className="text-xs font-bold text-zinc-500 bg-zinc-100 rounded-xl p-3">La convocatoria ha finalizado sin que conste una candidatura tuya.</div>}

                          {canWithdraw && (
                            <button onClick={() => withdrawCallResponse(ann)} disabled={isSaving} className="w-full mt-3 bg-white border-2 border-zinc-200 text-zinc-600 font-black py-3 rounded-xl uppercase text-[10px] tracking-widest hover:border-red-300 hover:text-red-600 transition-colors flex justify-center items-center gap-2 disabled:opacity-50">
                              <UserMinus className="w-4 h-4"/> Retirar candidatura
                            </button>
                          )}

                          {getSafeAnnouncementUrl(ann.url) && (
                            <a href={getSafeAnnouncementUrl(ann.url)} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center justify-center gap-2 bg-black text-white px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-zinc-800 transition-colors shadow-sm">
                              <LinkIcon className="w-4 h-4"/> Abrir enlace
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  }

                  if (ann.type !== 'poll') {
                    return (
                      <div key={ann.id} className="bg-white rounded-3xl p-6 shadow-sm border-2 border-zinc-200">
                        <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg leading-none mb-1">{ann.title}</h3>
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">{formatDateSpanish(ann.date)}</p>
                        <p className="text-sm font-medium text-slate-600 leading-relaxed whitespace-pre-wrap">{ann.content}</p>
                        {getSafeAnnouncementUrl(ann.url) && (
                          <a href={getSafeAnnouncementUrl(ann.url)} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center justify-center gap-2 bg-black text-white px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-zinc-800 transition-colors shadow-sm">
                            <LinkIcon className="w-4 h-4"/> Abrir enlace
                          </a>
                        )}
                      </div>
                    );
                  }

                  const response = getMyPollResponse(ann.id);
                  const draft = getPollDraft(ann);
                  const closed = isStudentPollClosed(ann);
                  const canEdit = !closed && (!response || ann.pollAllowEdit !== false);
                  const showResults = shouldShowPollResults(ann, response);
                  const totalResponses = Number(ann.pollResponseCount || 0);
                  return (
                    <div key={ann.id} className="bg-white rounded-3xl shadow-sm border-2 border-violet-200 overflow-hidden">
                      <div className="bg-violet-50 px-6 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-violet-100">
                        <span className="text-[10px] font-black uppercase tracking-widest text-violet-700">Encuesta</span>
                        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${closed ? 'bg-zinc-200 text-zinc-600' : 'bg-emerald-100 text-emerald-700'}`}>{closed ? 'Finalizada' : `Abierta hasta ${ann.pollDeadline ? new Date(ann.pollDeadline).toLocaleString('es-ES') : 'nuevo aviso'}`}</span>
                      </div>
                      <div className="p-6">
                        <h3 className="font-black text-slate-800 tracking-tight text-xl leading-tight mb-2">{ann.title}</h3>
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">Publicada el {formatDateSpanish(ann.date)}</p>
                        {ann.content && <p className="text-sm font-medium text-slate-600 leading-relaxed whitespace-pre-wrap mb-5">{ann.content}</p>}

                        <div className="space-y-3">
                          {ann.pollAnswerType === 'text' ? (
                            <textarea
                              value={draft.textAnswer || ''}
                              onChange={e => updatePollDraft(ann.id, { textAnswer: e.target.value })}
                              disabled={!canEdit}
                              placeholder="Escribe tu respuesta..."
                              className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl focus:border-violet-500 outline-none min-h-[110px] resize-y text-sm font-medium disabled:opacity-60"
                            />
                          ) : (ann.pollOptions || []).map(option => {
                            const selected = (draft.selectedOptionIds || []).includes(option.id);
                            return (
                              <label key={option.id} className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-colors ${selected ? 'border-violet-500 bg-violet-50' : 'border-zinc-200 bg-zinc-50'} ${canEdit ? 'cursor-pointer' : 'opacity-70'}`}>
                                <input type={ann.pollAnswerType === 'multiple' ? 'checkbox' : 'radio'} name={`poll-${ann.id}`} checked={selected} onChange={() => togglePollOption(ann, option.id)} disabled={!canEdit} className="w-4 h-4 accent-violet-600" />
                                <span className="text-sm font-bold text-slate-700">{option.label}</span>
                              </label>
                            );
                          })}
                        </div>

                        <p className="mt-4 text-[10px] font-bold text-zinc-500 leading-relaxed">
                          {ann.pollPrivacy === 'confidential'
                            ? 'Respuesta confidencial: Administración puede comprobar quién ha participado, pero los resultados no vinculan tu nombre con lo que has respondido.'
                            : 'Respuesta identificada: Administración podrá ver tu nombre junto a tu respuesta.'}
                        </p>

                        {response && <div className="mt-4 flex items-center gap-2 text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl p-3"><CheckCircle className="w-4 h-4"/> Respuesta registrada{canEdit ? ' · Puedes modificarla hasta el cierre.' : ''}</div>}

                        {canEdit && (
                          <button onClick={() => submitPollResponse(ann)} disabled={savingPollId === ann.id} className="w-full mt-4 bg-violet-600 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-violet-700 transition-colors shadow-lg flex justify-center items-center gap-2 disabled:opacity-50">
                            {savingPollId === ann.id ? 'Guardando...' : <><Send className="w-4 h-4"/> {response ? 'Actualizar respuesta' : 'Enviar respuesta'}</>}
                          </button>
                        )}

                        {closed && !response && <div className="mt-4 text-xs font-bold text-zinc-500 bg-zinc-100 rounded-xl p-3">La encuesta ha finalizado sin que conste una respuesta tuya.</div>}

                        {showResults && (
                          <div className="mt-6 pt-5 border-t border-violet-100 space-y-3">
                            <div className="flex items-center justify-between gap-3"><h4 className="text-[10px] font-black uppercase tracking-widest text-violet-700">Resultados</h4><span className="text-[10px] font-black text-zinc-500">{totalResponses} respuesta(s)</span></div>
                            {ann.pollAnswerType === 'text' ? (
                              <p className="text-xs font-medium text-zinc-500">Las respuestas escritas solo son visibles para Administración.</p>
                            ) : (ann.pollOptions || []).map(option => {
                              const count = Number(ann.pollVoteCounts?.[option.id] || 0);
                              const percentage = totalResponses ? (count / totalResponses) * 100 : 0;
                              return <div key={option.id}><div className="flex justify-between gap-3 text-xs font-bold text-slate-700"><span>{option.label}</span><span>{count} · {percentage.toFixed(1)}%</span></div><div className="h-2 bg-zinc-100 rounded-full mt-2 overflow-hidden"><div className="h-full bg-violet-600 rounded-full" style={{ width: `${Math.min(100, percentage)}%` }}/></div></div>;
                            })}
                            {ann.pollAnswerType === 'multiple' && <p className="text-[10px] font-bold text-zinc-400">Los porcentajes pueden sumar más del 100% porque se permiten varias opciones.</p>}
                          </div>
                        )}

                        {getSafeAnnouncementUrl(ann.url) && (
                          <a href={getSafeAnnouncementUrl(ann.url)} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center justify-center gap-2 bg-black text-white px-4 py-3 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-zinc-800 transition-colors shadow-sm">
                            <LinkIcon className="w-4 h-4"/> Abrir enlace
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
                {visibleAnnouncementsCount < visibleAnnouncements.length && (
                  <button onClick={() => setVisibleAnnouncementsCount(c => c + 5)} className="w-full py-4 rounded-2xl border-2 border-dashed border-zinc-300 text-zinc-500 hover:text-slate-900 hover:border-slate-900 font-black uppercase tracking-widest text-xs transition-colors">
                    Cargar más avisos
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* --- PESTAÑA: GESTIONES --- */}
        {activeTab === 'contact' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-zinc-100 border-2 border-zinc-200 rounded-3xl p-6 md:p-8 flex items-center justify-between shadow-sm relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-2xl font-black uppercase tracking-tight text-slate-800">Trámites</h2>
                <p className="text-zinc-500 font-bold text-xs uppercase tracking-widest mt-1">Gestión rápida de tu plaza</p>
              </div>
              <MessageSquare className="w-20 h-20 text-zinc-200 absolute -right-4 -bottom-4 rotate-12 pointer-events-none" />
            </div>

            <div className="bg-white p-5 rounded-2xl border-2 border-amber-100 text-amber-900 text-xs font-medium leading-relaxed shadow-sm">
              <strong className="font-black uppercase tracking-widest text-[11px] block mb-2 text-amber-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4"/> Normativa Administrativa
              </strong>
              <ul className="list-disc pl-4 space-y-2 mt-2 text-amber-800/90">
                <li>Todas las gestiones (bajas, cambios de horario, mantenimientos) deben solicitarse antes del <strong>día 20 de cada mes</strong>. Las enviadas del 21 en adelante, tendrán efecto en el mes siguiente.</li>
                <li><strong>Como norma general, solo se puede hacer una gestión administrativa al mes</strong>, y el trámite no se puede rectificar una vez solicitado.</li>
                {isMultiSeatStudent && <li>Si tienes varias plazas, los cambios de horario y bajas se gestionan por plaza: no podrás repetir gestión sobre la misma plaza mientras esté pendiente, pero sí gestionar otra plaza distinta.</li>}
                <li>El mantenimiento es una excepción: afecta a todas las clases de la persona, aunque tenga más de una plaza.</li>
                <li>Para cualquier duda, podéis recurrir al botón de <strong>"Dudas u otras gestiones"</strong> al final de esta página.</li>
              </ul>
            </div>

            {isStudentFrozen && (
              <div className="bg-blue-50 border-2 border-blue-100 text-blue-900 p-5 rounded-2xl text-xs font-bold leading-relaxed shadow-sm">
                <strong className="font-black uppercase tracking-widest text-[11px] block mb-2 flex items-center gap-2">
                  <Snowflake className="w-4 h-4"/> Plaza en mantenimiento
                </strong>
                Mientras tu plaza esté en mantenimiento {maintenancePeriodText ? `(${maintenancePeriodText})` : ''} puedes consultar la app, leer avisos, jugar al trivial y conservar tus tickets, pero no puedes cambiar horario, ampliar clases ni canjear recuperaciones. Al terminar el periodo, la plataforma volverá a tratar tu plaza como activa automáticamente.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button 
                disabled={isChangeHorarioLocked}
                onClick={() => handleAdminGestionClick({
                  type: 'cambio_horario', title: 'Cambiar horario fijo', icon: RefreshCcw, color: 'text-blue-500',
                  desc: getGestionUiCopy('cambio_horario').description,
                  placeholder: getGestionUiCopy('cambio_horario').placeholder
                })}
                className={`bg-white p-6 rounded-3xl border-2 text-left transition-all shadow-sm group ${isChangeHorarioLocked ? 'opacity-50 border-zinc-100 cursor-not-allowed' : 'border-zinc-100 hover:border-black'}`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform ${isChangeHorarioLocked ? 'bg-zinc-100' : 'bg-blue-50 group-hover:scale-110'}`}><RefreshCcw className={`w-6 h-6 ${isChangeHorarioLocked ? 'text-zinc-400' : 'text-blue-500'}`}/></div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight">Cambiar Horario Fijo</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">{isStudentFrozen ? 'No disponible en mantenimiento' : 'Solicita otro día u hora'}</p>
              </button>

              <button 
                disabled={isAcademicGestionLocked}
                onClick={() => handleAdminGestionClick({
                  type: 'ampliar_clases', title: 'Añadir Otra Clase', icon: PlusCircle, color: 'text-emerald-500',
                  desc: 'Añade una hora extra o empieza con un nuevo instrumento grupal.',
                  placeholder: 'Añade observaciones para Administración (Opcional)...'
                })}
                className={`bg-white p-6 rounded-3xl border-2 text-left transition-all shadow-sm group ${isAcademicGestionLocked ? 'opacity-50 border-zinc-100 cursor-not-allowed' : 'border-zinc-100 hover:border-black'}`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform ${isAcademicGestionLocked ? 'bg-zinc-100' : 'bg-emerald-50 group-hover:scale-110'}`}><PlusCircle className={`w-6 h-6 ${isAcademicGestionLocked ? 'text-zinc-400' : 'text-emerald-500'}`}/></div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight">Ampliar Mis Clases</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">{isStudentFrozen ? 'No disponible en mantenimiento' : 'Apunta un nuevo instrumento'}</p>
              </button>

              <button 
                disabled={isMantenimientoLocked}
                onClick={() => handleAdminGestionClick(isStudentFrozen ? {
                  type: 'reactivar_plaza', title: 'Finalizar Mantenimiento', icon: Snowflake, color: 'text-blue-500',
                  desc: 'Solicita terminar antes de tiempo tu periodo de mantenimiento y volver a la operativa normal de tu plaza.',
                  placeholder: 'Indica desde cuándo quieres finalizar el mantenimiento o cualquier observación para Administración...'
                } : {
                  type: 'mantenimiento', title: 'Pasar a mantenimiento', icon: Snowflake, color: 'text-amber-500',
                  desc: getGestionUiCopy('mantenimiento').description,
                  placeholder: getGestionUiCopy('mantenimiento').placeholder
                })}
                className={`bg-white p-6 rounded-3xl border-2 text-left transition-all shadow-sm group ${isMantenimientoLocked ? 'opacity-50 border-zinc-100 cursor-not-allowed' : isStudentFrozen ? 'border-blue-100 hover:border-blue-500' : 'border-zinc-100 hover:border-black'}`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform ${isMantenimientoLocked ? 'bg-zinc-100' : isStudentFrozen ? 'bg-blue-50 group-hover:scale-110' : 'bg-amber-50 group-hover:scale-110'}`}><Snowflake className={`w-6 h-6 ${isMantenimientoLocked ? 'text-zinc-400' : isStudentFrozen ? 'text-blue-500' : 'text-amber-500'}`}/></div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight">{isStudentFrozen ? 'Finalizar Mantenimiento' : 'Cuota Mantenimiento'}</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">{isStudentFrozen ? 'Solicita terminar antes' : isMultiSeatStudent ? 'Afecta a todas tus clases' : '15€/mes · máximo 2 meses'}</p>
              </button>

              <button 
                disabled={isBajaLocked}
                onClick={() => handleAdminGestionClick({
                  type: 'baja', title: 'Dar de baja', icon: UserMinus, color: 'text-red-500',
                  desc: getGestionUiCopy('baja').description,
                  placeholder: getGestionUiCopy('baja').placeholder
                })}
                className={`bg-white p-6 rounded-3xl border-2 text-left transition-all shadow-sm group ${isBajaLocked ? 'opacity-50 border-zinc-100 cursor-not-allowed' : 'border-zinc-100 hover:border-red-500'}`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform ${isBajaLocked ? 'bg-zinc-100' : 'bg-red-50 group-hover:scale-110'}`}><UserMinus className={`w-6 h-6 ${isBajaLocked ? 'text-zinc-400' : 'text-red-500'}`}/></div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight">Dar de Baja</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">{isMultiSeatStudent ? 'Cancela una plaza o todas tus clases' : 'Cancela tu plaza actual'}</p>
              </button>

              <a 
                href="mailto:gestiones@escuelalosmitos.com?subject=Dudas%20y%20Otras%20Gestiones%20-%20Portal%20Alumno"
                className="col-span-1 sm:col-span-2 bg-black p-6 rounded-3xl border-2 border-black hover:bg-zinc-800 text-left transition-all shadow-md group flex items-center justify-between"
              >
                <div>
                  <h3 className="font-black text-white uppercase tracking-tight text-lg">Dudas u otras gestiones</h3>
                  <p className="text-xs font-medium text-zinc-400 mt-1">Vía Mail: Clases particulares, facturación, consultas...</p>
                </div>
                <div className="bg-zinc-800 p-4 rounded-full group-hover:scale-110 transition-transform"><Mail className="w-6 h-6 text-white"/></div>
              </a>

            </div>
          </div>
        )}

      </main>

      <nav className="fixed bottom-0 left-0 right-0 w-full bg-white border-t border-zinc-200 z-40 pb-3">
        <div className="flex justify-around items-center p-2 max-w-3xl mx-auto">
          {[
            {id:'home', i:LayoutGrid, label:'Inicio'}, 
            {id:'calendar', i:Calendar, label:'Calendario'}, 
            {id:'extras', i:Sparkles, label:'Extras'},
            {id:'news', i:Megaphone, label:'Tablón'}, 
            {id:'contact', i:MessageSquare, label:'Gestiones'}
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`relative p-3 rounded-xl flex flex-col items-center gap-1 transition-all flex-1 ${activeTab === t.id ? 'text-black' : 'text-zinc-400 hover:text-black'}`}>
              <div className="relative">
                <t.i className="w-6 h-6"/>
                {/* 👇 LA BOLITA ROJA (Aparece en el ícono de 'news' si hay avisos sin leer y no estás en la pestaña) */}
                {t.id === 'news' && hasUnreadNews && activeTab !== 'news' && (
                  <span className="absolute -top-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-white"></span>
                  </span>
                )}
              </div>
              <span className="text-[10px] font-bold">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
