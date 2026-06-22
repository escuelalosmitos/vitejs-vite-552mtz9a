import React, { useState, useEffect, useMemo } from 'react';
import { Music, LogOut, Calendar, Ticket, Info, MessageSquare, LayoutGrid, AlertCircle, CheckCircle, User, ArrowRight, MapPin, X, Clock, FileText, Check, Bell, Megaphone, Snowflake, RefreshCcw, PlusCircle, UserMinus, Send, Mail, Sun, Sparkles, MonitorPlay, DoorOpen, Star, Trophy, Timer, Globe, Camera, ThumbsUp, Video, MessageCircle, Link as LinkIcon, BookOpen } from 'lucide-react';
import { collection, query, where, getDocs, getDoc, doc, setDoc, updateDoc, collectionGroup, onSnapshot } from 'firebase/firestore';

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz_MEKpKnv-L1g0e1khYf45nXCQKuUx6ZP3-bYwypTyrYzWadR4yzDd4ambExbQquvo/exec";
const ADMIN_GESTION_EMAIL = "gestiones@escuelalosmitos.com";
const ADMIN_COPY_GESTION_TYPES = new Set(["baja", "mantenimiento", "reactivar_plaza", "ampliar_clases", "cambio_horario"]);
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

const getSafeAnnouncementUrl = (url = '') => {
  const cleanUrl = String(url || '').trim();
  if (!/^https?:\/\//i.test(cleanUrl)) return '';
  return cleanUrl;
};

const isPunctualClass = (clase = {}) => Boolean(clase?.date) || clase?.isRecurring === false;

const isFixedClassStudent = (studentEntry = {}) => !(
  studentEntry?.isRecovery === true ||
  studentEntry?.isTemporary === true ||
  studentEntry?.isPunctual === true ||
  studentEntry?.type === 'recovery' ||
  studentEntry?.status === 'recovery'
);

const isTemporaryRelocationActiveForDate = (relocation = {}, dateStr = '') => {
  if (!relocation || relocation.status === 'cancelled') return false;
  return Boolean(relocation.from && relocation.until && relocation.from <= dateStr && relocation.until >= dateStr);
};

const getTemporaryRelocationLabel = (relocation = {}) => {
  if (!relocation.from || !relocation.until) return 'Clase temporal';
  return `Clase temporal del ${formatDateSpanish(relocation.from)} al ${formatDateSpanish(relocation.until)}`;
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
  const [myClasses, setMyClasses] = useState([]);
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [allClasses, setAllClasses] = useState([]); 
  const [schoolCalendar, setSchoolCalendar] = useState([]); 
  const [globalSettings, setGlobalSettings] = useState({ festivos: [], vacaciones: [], festivosTarragona: [], festivosReus: [] });
  const [announcements, setAnnouncements] = useState([]); 
  const [visibleAnnouncementsCount, setVisibleAnnouncementsCount] = useState(5); 
  const [myGestiones, setMyGestiones] = useState([]); 
  const [temporaryRelocations, setTemporaryRelocations] = useState([]);
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
  const [selectedRecoveryDate, setSelectedRecoveryDate] = useState('');
  const [acceptLatePenalty, setAcceptLatePenalty] = useState(false);
  const [isSendingGestion, setIsSendingGestion] = useState(false);
  const [isSendingAbsence, setIsSendingAbsence] = useState(false);

  const [mitoboxModal, setMitoboxModal] = useState(false);
  const [mboxDate, setMboxDate] = useState('');
  const [mboxSede, setMboxSede] = useState('Tarragona');
  const [mboxInst, setMboxInst] = useState('');
  const [mboxSelectedSlot, setMboxSelectedSlot] = useState(null);

  const [triviaModal, setTriviaModal] = useState(false);
  const [triviaTime, setTriviaTime] = useState(10);
  const [triviaSelected, setTriviaSelected] = useState(null);
  const [triviaResult, setTriviaResult] = useState(null); 

  const [showReviewModal, setShowReviewModal] = useState(false);

  const timeRules = getMonthNames();
  const dToday = new Date();
  const todayStr = `${dToday.getFullYear()}-${String(dToday.getMonth() + 1).padStart(2, '0')}-${String(dToday.getDate()).padStart(2, '0')}`;

  const effectiveMyClasses = useMemo(() => {
    if (!profile?.id) return myClasses;

    const activeRelocations = temporaryRelocations.filter(rel =>
      rel.studentId === profile.id &&
      isTemporaryRelocationActiveForDate(rel, todayStr)
    );

    const hiddenSourceClassIds = new Set(activeRelocations.map(rel => rel.sourceClassId).filter(Boolean));
    const effectiveById = new Map();

    myClasses
      .filter(c => !hiddenSourceClassIds.has(c.id))
      .forEach(c => effectiveById.set(c.id, c));

    activeRelocations.forEach(rel => {
      const targetClass = allClasses.find(c => c.id === rel.targetClassId);
      if (!targetClass) return;

      const displayName = profile.alias && profile.useAlias ? profile.alias : (profile.name || rel.studentName || 'Alumno');
      const alreadyInTarget = (targetClass.students || []).some(s => s.id === profile.id);
      const temporaryEntry = {
        id: profile.id,
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

      effectiveById.set(targetClass.id, {
        ...targetClass,
        isTemporaryRelocationClass: true,
        temporaryRelocation: rel,
        students: alreadyInTarget
          ? targetClass.students
          : [...(targetClass.students || []), temporaryEntry]
      });
    });

    return [...effectiveById.values()];
  }, [myClasses, allClasses, temporaryRelocations, profile?.id, profile?.name, profile?.alias, profile?.useAlias, profile?.email, todayStr]);

  const fixedMyClasses = effectiveMyClasses.filter(c =>
    !isPunctualClass(c) &&
    (c.students || []).some(s => s.id === profile?.id && isFixedClassStudent(s))
  );

  const announcementMatchesStudent = (ann = {}) => {
    const audienceType = ann.audienceType || 'all';
    const audienceValue = String(ann.audienceValue || '').trim();

    if (audienceType === 'all') return true;
    if (!audienceValue || fixedMyClasses.length === 0) return false;

    if (audienceType === 'sede') return fixedMyClasses.some(c => (c.sede || 'Tarragona') === audienceValue);
    if (audienceType === 'instrumento') return fixedMyClasses.some(c => (c.subject || '') === audienceValue);
    if (audienceType === 'profesor') return fixedMyClasses.some(c => (c.teacher || '') === audienceValue);

    return true;
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

    const unsubAnnouncements = onSnapshot(collection(db, 'artifacts', appId, 'announcements'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setAnnouncements(data);
    });

    const unsubSettings = onSnapshot(doc(db, 'artifacts', appId, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setContractText(data.contract || 'El contrato aún no está disponible.');
        setGlobalSettings({
          festivos: data.festivos || [],
          vacaciones: data.vacaciones || [],
          festivosTarragona: data.festivosTarragona || [],
          festivosReus: data.festivosReus || []
        });
      }
    });

    return () => {
      unsubAnnouncements();
      unsubSettings();
    };
  }, [user.email]);

  useEffect(() => {
    if (!profile || effectiveMyClasses.length === 0) return;

    const misSedes = new Set();
    effectiveMyClasses.forEach(c => misSedes.add(c.sede || 'Tarragona'));

    const newCal = [];
    
    globalSettings.vacaciones.forEach(d => newCal.push({ date: d, type: 'vacacion', title: 'Vacaciones' }));
    globalSettings.festivos.forEach(d => newCal.push({ date: d, type: 'festivo', title: 'Festivo Global' }));

    if (misSedes.has('Tarragona')) {
      globalSettings.festivosTarragona.forEach(d => {
        if (!newCal.some(c => c.date === d)) newCal.push({ date: d, type: 'festivo', title: 'Festivo Local (Tarragona)' });
      });
    }

    if (misSedes.has('Reus')) {
      globalSettings.festivosReus.forEach(d => {
        if (!newCal.some(c => c.date === d)) newCal.push({ date: d, type: 'festivo', title: 'Festivo Local (Reus)' });
      });
    }

    setSchoolCalendar(newCal);

  }, [globalSettings, effectiveMyClasses, profile]);

  useEffect(() => {
    if (!profile?.id) return;
    setClassesLoaded(false);
    
    const unsubProfile = onSnapshot(doc(db, 'artifacts', appId, 'students', profile.id), (docSnap) => {
      if (docSnap.exists()) {
        setProfile(prev => ({ ...prev, ...docSnap.data() }));
      }
    });

    const classesQuery = collectionGroup(db, 'recurringClasses');
    const unsubClasses = onSnapshot(classesQuery, (snapshot) => {
      const all = [];
      const mine = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        const classObj = { id: doc.id, refPath: doc.ref.path, ...data };
        all.push(classObj); 
        
        if (data.students && data.students.some(s => s.id === profile.id)) {
          mine.push(classObj); 
        }
      });
      setAllClasses(all);
      setMyClasses(mine);
      setClassesLoaded(true);
    });

    const q = query(collection(db, 'artifacts', appId, 'gestiones'), where('studentId', '==', profile.id));
    const unsubGestiones = onSnapshot(q, (snapshot) => {
      setMyGestiones(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubTemporaryRelocations = onSnapshot(collection(db, 'artifacts', appId, 'temporaryRelocations'), (snapshot) => {
      setTemporaryRelocations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const ticketsQuery = collectionGroup(db, 'tickets');
    const unsubTickets = onSnapshot(ticketsQuery, (snapshot) => {
      let validTicketsCount = 0;
      let futureSummerTicketsCount = 0;
      let activeSummerTicketsCount = 0;
      snapshot.forEach(doc => {
        const data = doc.data();
        const isMine = data.studentId === profile.id;
        const isPending = !data.isUsed && !data.voided;
        const isAlreadyValid = !data.validFrom || data.validFrom <= todayStr;
        const isNotExpired = !data.validUntil || data.validUntil >= todayStr;
        const isFuture = data.validFrom && data.validFrom > todayStr;
        const isSummerTicket = data.isSummerTicket || data.recoveryPolicy === 'summer';

        if (isMine && isPending && isAlreadyValid && isNotExpired) {
          validTicketsCount++;
          if (isSummerTicket) activeSummerTicketsCount++;
        } else if (isMine && isPending && isFuture && isSummerTicket) {
          futureSummerTicketsCount++;
        }
      });
      setProfile(prev => prev ? {
        ...prev,
        activeTickets: validTicketsCount,
        activeSummerTickets: activeSummerTicketsCount,
        futureSummerTickets: futureSummerTicketsCount
      } : null);
    });

    return () => {
      unsubProfile();
      unsubClasses(); 
      unsubGestiones();
      unsubTemporaryRelocations();
      unsubTickets(); 
    };
  }, [profile?.id, db, appId]);

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

  const checkRegistration = async () => {
    setLoading(true);
    const q = query(collection(db, 'artifacts', appId, 'students'), where("email", "==", user.email));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const studentData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
      setProfile(studentData);
    }
    setLoading(false);
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
    const info = getNextClassInfo(clase.dayOfWeek, clase.time);
    setHealthCheck(false); 
    setAbsenceModal({ clase, ...info });
  };

  const formatClassLineForAdminCopy = (clase) => {
    if (!clase) return '';
    return `${clase.subject || 'Clase'} · ${getDayName(clase.dayOfWeek)} · ${clase.time || ''}h · ${clase.sede || 'Tarragona'}${clase.sala ? ` · ${clase.sala}` : ''}${clase.teacher ? ` · Prof. ${clase.teacher}` : ''}`;
  };

  const sendAdminGestionCopy = async ({ gestionId, payload, selectedClass = null, phase = 'recibida', status = 'pendiente' }) => {
    if (!payload || !ADMIN_COPY_GESTION_TYPES.has(payload.type)) return false;

    const typeLabel = (payload.type || 'gestion').replace(/_/g, ' ');
    const phaseLabel = phase === 'ejecutada' ? 'Gestión ejecutada' : 'Nueva gestión';
    const classLine = payload.requestedClassLine || formatClassLineForAdminCopy(selectedClass) || payload.requestedClass || '';
    const requestedDate = payload.recoveryDate ? formatDateSpanish(payload.recoveryDate) : '';
    const submittedAt = payload.date ? new Date(payload.date).toLocaleString('es-ES') : new Date().toLocaleString('es-ES');

    const body = `TIPO_GESTION: ${typeLabel}
ESTADO: ${status}
FASE: ${phaseLabel}
ALUMNO: ${payload.studentName || ''}
EMAIL: ${payload.studentEmail || ''}
CLASE_SOLICITADA: ${classLine}
FECHA_RECUPERACION: ${requestedDate}
MES_OBJETIVO: ${payload.targetMonth || ''}
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
      
      const activeStudents = (absenceModal.clase.students || []).filter(s => !s.isPaused);
      const allAbsentNow = activeStudents.length > 0 && activeStudents.every(s => {
        const st = currentExceptions[s.id];
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
    const isExemptFromLateRule = isTicketRedemption || isAmpliarClases;

    if (isStudentFrozen && frozenRestrictedGestionTypes.includes(gestionModal.type)) {
      showToast('Con la plaza congelada no puedes gestionar recuperaciones, cambios ni ampliaciones hasta reactivar tu plaza.', 'error');
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
        type: gestionModal.type,
        title: gestionModal.title,
        details: gestionText,
        requestedClass: selectedNewClass ? selectedNewClass.id : null,
        requestedClassLine: selectedNewClass ? formatClassLineForAdminCopy(selectedNewClass) : '',
        requestedTeacher: selectedNewClass?.teacher || '',
        recoveryDate: isTicketRedemption ? selectedRecoveryDate : null, 
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
      setSelectedRecoveryDate('');
      setAcceptLatePenalty(false);
      setSelectedInst(''); 
      showToast('Solicitud enviada a Administración.');
    } catch (error) {
      showToast('Error al enviar la solicitud.', 'error');
    } finally {
      setIsSendingGestion(false);
    }
  };

  const requestMitoverso = () => {
    const ok = window.confirm('Serás redirigido al portal de inscripciones de Tadosi.\n\n⚠️ MUY IMPORTANTE: Cuando rellenes tus datos, no olvides marcar la casilla "Tengo una suscripción y quiero otra" para que el sistema reconozca tu descuento de alumno.');
    if (ok) window.open('https://qow.es/GKidLP', '_blank');
  };

  const requestMitobox = async () => {
    const ok = window.confirm('Serás redirigido al portal de inscripciones de Tadosi para formalizar tu alta en la tarifa plana.\n\nAl continuar, también enviaremos un aviso a administración.');
    if (ok) {
      window.open('https://qow.es/wIXCp7', '_blank');
      try {
        const gestionId = `mbox-req-${Date.now()}`;
        await setDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), {
          studentId: profile.id,
          studentName: profile.name,
          studentEmail: profile.email,
          type: 'alta_mitobox',
          title: 'Solicitud Alta Mitobox',
          details: 'El alumno ha iniciado el proceso de alta en la tarifa plana Mitobox a través de Tadosi.',
          status: 'pendiente',
          date: new Date().toISOString()
        });
      } catch (e) {
        console.error(e);
      }
    }
  };

  const sendMitoboxReservation = async () => {
    if (!mboxDate || !mboxSede || !mboxInst || !mboxSelectedSlot) return;
    setIsSendingGestion(true);
    try {
      const gestionId = `mbox-res-${Date.now()}`;
      await setDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), {
        studentId: profile.id,
        studentName: profile.name,
        studentEmail: profile.email,
        type: 'reserva_mitobox',
        title: 'Reserva de Sala (Mitobox)',
        details: `Reserva para ensayar: ${mboxInst}. Fecha: ${formatDateSpanish(mboxDate)}. Sede: ${mboxSede}. Hora: ${mboxSelectedSlot.time}h en ${mboxSelectedSlot.sala}`,
        status: 'pendiente',
        date: new Date().toISOString(),
        reservationDate: mboxDate
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
DESCRIPTION:Reserva para ensayar ${mboxInst} en ${mboxSede} (${mboxSelectedSlot.sala})
LOCATION:Escuela Los Mitos - ${mboxSede}
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
  const pendingProcedures = myGestiones.filter(g => g.status === 'pendiente' && g.type !== 'alta_mitobox'); 
  
  const pendingAdminGestiones = myGestiones.filter(g => 
    g.status === 'pendiente' && 
    ['baja', 'mantenimiento', 'reactivar_plaza', 'cambio_horario', 'ampliar_clases'].includes(g.type)
  );
  const hasPendingAdminGestion = pendingAdminGestiones.length > 0;

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
  const isStudentFrozen = profile?.globalStatus === 'congelado' || myClasses.some(c =>
    (c.students || []).some(s => s.id === profile?.id && s.isPaused === true)
  );
  const frozenRestrictedGestionTypes = ['recuperacion', 'cambio_horario', 'ampliar_clases'];
  const isAcademicGestionLocked = isStudentFrozen || hasPendingAdminGestion;

  const handleAdminGestionClick = (gestionPayload) => {
    if (isStudentFrozen && frozenRestrictedGestionTypes.includes(gestionPayload.type)) {
      showToast('Con la plaza congelada no puedes solicitar cambios, ampliaciones ni recuperaciones hasta reactivarla.', 'error');
      return;
    }
    if (hasPendingAdminGestion) {
      showToast('Ya tienes un trámite administrativo en curso. No puedes solicitar otro hasta que se resuelva.', 'error');
      return;
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
        const isTarragonaBlocked = selectedNewClass?.sede === 'Tarragona' && globalSettings.festivosTarragona?.includes(dateStr);
        const isReusBlocked = selectedNewClass?.sede === 'Reus' && globalSettings.festivosReus?.includes(dateStr);

        if (!isGlobalBlocked && !isTarragonaBlocked && !isReusBlocked) {
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
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative">
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
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative animate-in zoom-in-95 duration-200">
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
    const isExemptFromLateRule = isTicketRedemption || isAmpliarClases;

    const targetInstrument = gestionModal.type === 'ampliar_clases' ? selectedInst : (profile.instruments && profile.instruments[0]);

    let availableClasses = [];
    if (isClassSearch && targetInstrument) {
      availableClasses = allClasses.filter(c => {
        if (c.subject !== targetInstrument) return false;
        
        const activeStudents = (c.students || []).filter(s => !s.isPaused).length;
        if (activeStudents === 0) return false;

        const maxCap = parseInt(c.capacity || 4);
        const currentStudents = c.students?.length || 0;
        if (currentStudents >= maxCap) return false;
        if (c.students?.some(s => s.id === profile.id)) return false;
        
        if (isTicketRedemption && targetInstrument === 'Guitarra') {
          if (maxCap !== 8) return false; 
        }
        
        return true;
      });
    }

    const isSendDisabled = isSendingGestion || 
      (!isExemptFromLateRule && timeRules.isLate && !acceptLatePenalty) || 
      (isClassSearch && !selectedNewClass) || 
      (isTicketRedemption && !selectedRecoveryDate);

    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative my-8">
          <button onClick={() => {setGestionModal(null); setSelectedNewClass(null); setSelectedRecoveryDate(''); setAcceptLatePenalty(false); setSelectedInst('');}} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          <div className="flex items-center gap-3 text-black mb-2">
            <gestionModal.icon className={`w-8 h-8 ${gestionModal.color}`} />
            <h2 className="text-xl font-black uppercase tracking-tight leading-tight">{gestionModal.title}</h2>
          </div>
          
          {!isExemptFromLateRule && (
            <>
              <div className="bg-zinc-100 rounded-xl p-3 mb-6 text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2"><Clock className="w-4 h-4"/> Normativa del día 20</div>
              {timeRules.isLate ? (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                  <h3 className="text-sm font-black text-red-800 uppercase mb-1 flex items-center gap-2"><AlertCircle className="w-4 h-4"/> Solicitud fuera de plazo</h3>
                  <p className="text-xs text-red-700 font-medium mb-3">Estás pidiendo este trámite del día 21 en adelante. Según el contrato de prestación de servicios, no podrá tramitarse para <strong>{timeRules.next}</strong>.</p>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={acceptLatePenalty} onChange={e => setAcceptLatePenalty(e.target.checked)} className="mt-1 w-4 h-4 text-red-600 rounded" />
                    <span className="text-xs font-bold text-red-900">Sí, quiero que tengáis mi petición en cuenta para <strong>{timeRules.nextNext}</strong>.</span>
                  </label>
                </div>
              ) : (
                <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl"><p className="text-xs font-bold text-emerald-800 flex items-center gap-2"><CheckCircle className="w-4 h-4"/> En plazo. Tu solicitud aplicará para <strong>{timeRules.next}</strong>.</p></div>
              )}
            </>
          )}

          {isAmpliarClases && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <p className="text-xs font-bold text-emerald-800 flex items-start gap-2 leading-relaxed">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5"/> 
                ¡Genial! Tu nueva plaza quedará reservada directamente para {timeRules.next} sin restricciones de fecha límite.
              </p>
            </div>
          )}

          <p className="text-sm font-medium text-zinc-500 mb-6">{gestionModal.desc}</p>
          
          {isClassSearch && (
            <div className="mb-6 space-y-4 border-t border-b border-zinc-100 py-4">
              <p className="text-xs font-black uppercase tracking-widest text-zinc-400">{isTicketRedemption ? '1. Elige grupo con disponibilidad' : '1. Busca disponibilidad en directo'}</p>
              
              {gestionModal.type === 'ampliar_clases' && (
                <select value={selectedInst} onChange={e => {setSelectedInst(e.target.value); setSelectedNewClass(null);}} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm">
                  <option value="">Selecciona Instrumento...</option>
                  {INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              )}

              {!(gestionModal.type === 'ampliar_clases' && !selectedInst) && (
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
                            <MapPin className="w-3 h-3" /> {c.sede || 'Tarragona'}
                          </span>
                          <span>Prof: {c.teacher}</span>
                          <span>Quedan {parseInt(c.capacity || 4) - (c.students?.length || 0)} plazas</span>
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

          <textarea placeholder={gestionModal.placeholder} value={gestionText} onChange={(e) => setGestionText(e.target.value)} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl focus:border-black outline-none min-h-[100px] resize-y text-sm font-medium mb-6"/>
          
          <button onClick={sendGestion} disabled={isSendDisabled} className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-800 transition-colors shadow-lg flex justify-center items-center gap-2 disabled:opacity-50">
            {isSendingGestion ? 'Enviando...' : <><Send className="w-4 h-4"/> Enviar Solicitud</>}
          </button>
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
      
      const allScheduledClasses = allClasses.filter(c => 
        c.dayOfWeek === targetDay && 
        (c.sede || 'Tarragona') === mboxSede
      );

      const aliveClasses = allScheduledClasses.filter(c => {
        if (c.cancelledDates?.includes(mboxDate)) return false; 
        const exceptionsEseDia = c.exceptions?.[mboxDate] || {};
        const activeStudents = (c.students || []).filter(s => {
          if (s.isPaused) return false;
          const estadoHoy = exceptionsEseDia[s.id];
          if (estadoHoy === 'absent' || estadoHoy === 'notified' || estadoHoy === 'notified_no_ticket') return false;
          return true;
        });

        if (activeStudents.length === 0) return false;
        return true;
      });

      const activeTimes = [...new Set(aliveClasses.map(c => c.time))].sort();
      
      activeTimes.forEach(t => {
        const occupiedSalas = aliveClasses.filter(c => c.time === t).map(c => c.sala || 'Sala 1');
        const allSalas = ['Sala 1', 'Sala 2', 'Sala 3'];
        const freeSalas = allSalas.filter(s => !occupiedSalas.includes(s));
        
        freeSalas.forEach(fs => {
          availableMboxSlots.push({ time: t, sala: fs });
        });
      });
    }

    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative my-8">
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
                <option value="Tarragona">Tarragona</option>
                <option value="Reus">Reus</option>
              </select>
            </div>
          </div>

          {mboxDate && mboxSede && (
            <div className="mb-6 space-y-4 border-t border-zinc-100 pt-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block">4. Salas y Horas disponibles</label>
              {availableMboxSlots.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {availableMboxSlots.map((slot, i) => (
                    <button 
                      key={i} 
                      onClick={() => setMboxSelectedSlot(slot)} 
                      className={`p-3 rounded-xl border-2 text-left transition-all ${mboxSelectedSlot === slot ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-zinc-100 hover:border-blue-300 text-slate-700'}`}
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

          <button onClick={sendMitoboxReservation} disabled={isSendingGestion || !mboxDate || !mboxSelectedSlot || !mboxInst} className="w-full bg-blue-600 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-blue-700 transition-colors shadow-lg flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {isSendingGestion ? 'Enviando...' : <><CheckCircle className="w-4 h-4"/> Confirmar Reserva</>}
          </button>
        </div>
      </div>
    );
  };

  const renderContract = () => {
    if (!showContract) return null;
    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl relative flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
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
      <div className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative flex flex-col items-center">
          
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

  if (profile.globalStatus === 'baja') {
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

  if (!classesLoaded) {
    return <div className="min-h-screen bg-zinc-50 flex items-center justify-center font-black">Sincronizando clases...</div>;
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
      {renderContract()}
      {renderTriviaModal()}

      {showReviewModal && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-8 shadow-2xl relative">
            <button onClick={() => setShowReviewModal(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
            <div className="flex flex-col items-center text-center mb-6">
              <Star className="w-12 h-12 text-amber-400 fill-amber-400 mb-3" />
              <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Déjanos tu reseña</h2>
              <p className="text-xs font-bold text-zinc-500 mt-2">¡Nos ayuda muchísimo a seguir creciendo! ¿De qué centro eres alumno?</p>
            </div>
            <div className="space-y-3">
              <a href="https://g.page/r/CbRESEBKdg37EBM/review" target="_blank" rel="noopener noreferrer" className="w-full bg-zinc-100 hover:bg-black hover:text-white text-slate-800 font-black py-4 rounded-xl uppercase text-xs tracking-widest transition-colors flex items-center justify-center gap-2">
                <MapPin className="w-4 h-4"/> Sede Tarragona
              </a>
              <a href="https://g.page/r/CaVY9dFy-cmjEBM/review" target="_blank" rel="noopener noreferrer" className="w-full bg-zinc-100 hover:bg-black hover:text-white text-slate-800 font-black py-4 rounded-xl uppercase text-xs tracking-widest transition-colors flex items-center justify-center gap-2">
                <MapPin className="w-4 h-4"/> Sede Reus
              </a>
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
              effectiveMyClasses.map((clase, idx) => {
                const classInfo = getNextClassInfo(clase.dayOfWeek, clase.time);
                const holidayMatch = schoolCalendar.find(c => c.date === classInfo.dateStr);
                const hasNotifiedNext = clase.exceptions?.[classInfo.dateStr]?.[profile.id];
                const myStudentEntry = clase.students?.find(s => s.id === profile.id);
                const isRecoveryClassForMe = myStudentEntry?.isRecovery === true;
                const isTemporaryRelocationClassForMe = myStudentEntry?.isTemporaryRelocation === true || clase.isTemporaryRelocationClass === true;

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

                      {clase.notes && !isRecoveryClassForMe && (
                        <div className={`mt-5 p-5 rounded-2xl border ${isFestivo ? 'bg-white/70 border-red-100 text-red-900' : 'bg-white/70 border-purple-100 text-purple-900'}`}>
                          <h4 className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest mb-2 ${isFestivo ? 'text-red-600' : 'text-purple-600'}`}>
                            <BookOpen className="w-4 h-4"/> Tareas de la semana
                          </h4>
                          <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{clase.notes}</p>
                        </div>
                      )}
                    </div>
                  );
                }

                const isCongelado = profile?.globalStatus === 'congelado' || myStudentEntry?.isPaused === true;

                return (
                  <div key={idx} className={`rounded-3xl p-6 shadow-xl relative overflow-hidden mb-4 transition-all ${isCongelado ? 'bg-zinc-200 text-zinc-500 border-2 border-zinc-300' : 'bg-black text-white'}`}>
                      <p className={`${isCongelado ? 'text-zinc-500' : 'text-zinc-400'} font-bold uppercase text-[10px] tracking-widest mb-1`}>Clase de {clase.subject}</p>
                      <h2 className={`text-3xl font-black uppercase tracking-tighter ${isCongelado ? 'text-zinc-400' : ''}`}>{getDayName(clase.dayOfWeek)}</h2>
                      <p className={`text-lg font-medium mb-6 ${isCongelado ? 'text-zinc-500' : 'text-zinc-300'}`}>{clase.time}h</p>
                      {isTemporaryRelocationClassForMe && (
                        <div className="mb-5 inline-flex items-center gap-2 bg-violet-100 text-violet-800 border border-violet-200 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest">
                          <Clock className="w-4 h-4" />
                          {myStudentEntry?.relocationLabel || getTemporaryRelocationLabel(clase.temporaryRelocation)}
                        </div>
                      )}
                      
                      <div className={`flex flex-col sm:flex-row gap-3 text-sm font-medium mb-8 p-4 rounded-2xl border ${isCongelado ? 'bg-zinc-300/50 border-zinc-300 text-zinc-600' : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-300'}`}>
                        <span className="flex items-center gap-2"><User className="w-4 h-4"/> Prof: {clase.teacher}</span> <span className="hidden sm:inline">•</span> <span className="flex items-center gap-2"><MapPin className="w-4 h-4"/> {clase.sede} ({clase.sala})</span>
                      </div>

                      {clase.notes && !isRecoveryClassForMe && (
                        <div className={`mb-8 p-5 rounded-2xl border ${isCongelado ? 'bg-zinc-300/30 border-zinc-300/50 text-zinc-600' : 'bg-zinc-900/80 border-zinc-800 text-zinc-300'}`}>
                          <h4 className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest mb-2 ${isCongelado ? 'text-zinc-500' : 'text-amber-400'}`}>
                            <BookOpen className="w-4 h-4"/> Tareas de la semana
                          </h4>
                          <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{clase.notes}</p>
                        </div>
                      )}
                      
                      {isCongelado ? (
                        <div className="w-full bg-blue-100 text-blue-800 font-black py-4 px-6 rounded-xl flex items-center justify-center gap-3 uppercase text-[10px] sm:text-xs tracking-widest border border-blue-200 text-center leading-tight">
                          <Snowflake className="w-5 h-5 shrink-0" />
                          <span>Tienes la plaza congelada.<br/>Te la estamos guardando este mes.</span>
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
                    showToast('Tus tickets se conservan, pero no puedes canjearlos mientras tu plaza esté congelada.', 'error');
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
                {isStudentFrozen ? 'Tickets conservados · plaza congelada' : profile.activeTickets > 0 ? (hasReachedRecoveryLimit ? 'Recuperaciones ya asignadas' : 'Canjear Ticket Libre') : 'No tienes tickets'}
              </button>
              <div className="mt-4 flex items-start gap-2 bg-zinc-50 border border-zinc-100 p-3 rounded-xl">
                <Info className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
                <p className="text-[11px] font-bold text-zinc-500 leading-relaxed uppercase tracking-wide">
                  {isStudentFrozen
                    ? 'Tus tickets se mantienen guardados, pero no podrás gestionarlos ni recuperar clases hasta que reactives tu plaza.'
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
                <p className="text-zinc-400 font-bold text-xs uppercase tracking-widest mt-1">Días no lectivos oficiales</p>
              </div>
              <Calendar className="w-20 h-20 text-zinc-800 absolute -right-4 -bottom-4 rotate-12 pointer-events-none" />
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-200">
               {schoolCalendar.length === 0 ? (
                 <div className="text-center py-8">
                   <Calendar className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                   <p className="font-bold text-zinc-400 uppercase tracking-widest text-sm">No hay festivos registrados</p>
                 </div>
               ) : (
                 <div className="space-y-3">
                   {schoolCalendar.sort((a,b) => a.date.localeCompare(b.date)).map((cal, i) => {
                     const isPast = cal.date < new Date().toISOString().split('T')[0];
                     return (
                       <div key={i} className={`p-4 rounded-2xl border flex justify-between items-center ${isPast ? 'bg-zinc-50 border-zinc-100 opacity-60' : cal.type === 'festivo' ? 'bg-red-50 border-red-100 text-red-900' : 'bg-purple-50 border-purple-100 text-purple-900'}`}>
                         <div>
                           <span className="text-[10px] font-black uppercase tracking-widest opacity-60 block">{cal.type}</span>
                           <span className="font-bold text-sm">{cal.title || 'Día no lectivo'}</span>
                         </div>
                         <span className="font-black text-sm">{formatDateSpanish(cal.date)}</span>
                       </div>
                     );
                   })}
                 </div>
               )}
            </div>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="bg-white rounded-3xl p-6 shadow-sm border-2 border-zinc-100 flex flex-col h-full relative overflow-hidden">
                {profile?.hasMitoverso && (
                  <div className="absolute top-4 right-4 bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                    <Star className="w-3 h-3"/> Suscripción Activa
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
                    onClick={() => window.open('https://classroom.google.com/', '_blank')}
                    className="w-full bg-indigo-600 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-indigo-700 transition-colors shadow-lg flex items-center justify-center gap-2"
                  >
                    Entrar a Classroom <ArrowRight className="w-4 h-4"/>
                  </button>
                ) : (
                  <button 
                    onClick={requestMitoverso}
                    className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-800 transition-colors shadow-lg"
                  >
                    Solicitar Acceso
                  </button>
                )}
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-sm border-2 border-zinc-100 flex flex-col h-full relative overflow-hidden">
                {profile?.hasMitobox && (
                  <div className="absolute top-4 right-4 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                    <Star className="w-3 h-3"/> Tarifa Plana Activa
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
                    onClick={requestMitobox}
                    className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-800 transition-colors shadow-lg"
                  >
                    Solicitar Acceso
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

            <div className="mb-8">
              <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-4 px-2 flex items-center gap-2"><LinkIcon className="w-4 h-4"/> Enlaces de Interés</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <a href="https://www.escuelalosmitos.com/" target="_blank" rel="noopener noreferrer" className="bg-white border border-zinc-200 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 shadow-sm hover:border-black transition-colors group">
                  <Globe className="w-6 h-6 text-zinc-400 group-hover:text-black"/>
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Nuestra Web</span>
                </a>
                <a href="https://instagram.com/losmitosescuelademusica/" target="_blank" rel="noopener noreferrer" className="bg-white border border-zinc-200 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 shadow-sm hover:border-pink-500 transition-colors group">
                  <Camera className="w-6 h-6 text-zinc-400 group-hover:text-pink-500"/>
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Instagram</span>
                </a>
                <a href="https://chat.whatsapp.com/DyygFclRX8DDGLAUNgq16A" target="_blank" rel="noopener noreferrer" className="bg-white border border-zinc-200 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 shadow-sm hover:border-emerald-500 transition-colors group">
                  <MessageCircle className="w-6 h-6 text-zinc-400 group-hover:text-emerald-500"/>
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Comunidad</span>
                </a>
                <a href="https://www.youtube.com/@escuelalosmitos" target="_blank" rel="noopener noreferrer" className="bg-white border border-zinc-200 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 shadow-sm hover:border-red-500 transition-colors group">
                  <Video className="w-6 h-6 text-zinc-400 group-hover:text-red-500"/>
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">YouTube</span>
                </a>
                <a href="https://www.facebook.com/Escuelalosmitos" target="_blank" rel="noopener noreferrer" className="bg-white border border-zinc-200 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 shadow-sm hover:border-blue-600 transition-colors group">
                  <ThumbsUp className="w-6 h-6 text-zinc-400 group-hover:text-blue-600"/>
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Facebook</span>
                </a>
                <button onClick={() => setShowReviewModal(true)} className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex flex-col items-center justify-center gap-2 shadow-sm hover:bg-amber-100 transition-colors group">
                  <Star className="w-6 h-6 text-amber-500"/>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-900">Valóranos</span>
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
                {visibleAnnouncements.slice(0, visibleAnnouncementsCount).map(ann => (
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
                ))}
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
                <li><strong>Solo se puede hacer una de estas gestiones al mes</strong>, y el trámite no se puede rectificar una vez solicitado.</li>
                <li>Para cualquier duda, podéis recurrir al botón de <strong>"Dudas u otras gestiones"</strong> al final de esta página.</li>
              </ul>
            </div>

            {isStudentFrozen && (
              <div className="bg-blue-50 border-2 border-blue-100 text-blue-900 p-5 rounded-2xl text-xs font-bold leading-relaxed shadow-sm">
                <strong className="font-black uppercase tracking-widest text-[11px] block mb-2 flex items-center gap-2">
                  <Snowflake className="w-4 h-4"/> Plaza en mantenimiento
                </strong>
                Mientras tu plaza esté congelada puedes consultar la app, leer avisos, jugar al trivial y conservar tus tickets, pero no puedes cambiar horario, ampliar clases ni canjear recuperaciones.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button 
                disabled={isAcademicGestionLocked}
                onClick={() => handleAdminGestionClick({
                  type: 'cambio_horario', title: 'Cambiar Horario Fijo', icon: RefreshCcw, color: 'text-blue-500',
                  desc: 'Busca una plaza libre en otro grupo y solicita el cambio para el mes que viene.',
                  placeholder: 'Añade observaciones para Administración (Opcional)...'
                })}
                className={`bg-white p-6 rounded-3xl border-2 text-left transition-all shadow-sm group ${isAcademicGestionLocked ? 'opacity-50 border-zinc-100 cursor-not-allowed' : 'border-zinc-100 hover:border-black'}`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform ${isAcademicGestionLocked ? 'bg-zinc-100' : 'bg-blue-50 group-hover:scale-110'}`}><RefreshCcw className={`w-6 h-6 ${isAcademicGestionLocked ? 'text-zinc-400' : 'text-blue-500'}`}/></div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight">Cambiar Horario Fijo</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">{isStudentFrozen ? 'No disponible con plaza congelada' : 'Solicita otro día u hora'}</p>
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
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">{isStudentFrozen ? 'No disponible con plaza congelada' : 'Apunta un nuevo instrumento'}</p>
              </button>

              <button 
                onClick={() => handleAdminGestionClick(isStudentFrozen ? {
                  type: 'reactivar_plaza', title: 'Reactivar mi Plaza', icon: Snowflake, color: 'text-blue-500',
                  desc: 'Solicita salir de mantenimiento para volver a asistir a clase y recuperar la operativa normal de tu plaza.',
                  placeholder: 'Indica desde cuándo quieres reactivar tu plaza o cualquier observación para Administración...'
                } : {
                  type: 'mantenimiento', title: 'Pasar a Mantenimiento', icon: Snowflake, color: 'text-amber-500',
                  desc: 'Congela tu plaza temporalmente por 15€/Mes. Esta gestión solo es posible un total de 2 meses al año. El alumno verá reactivada su cuota habitual tras dos meses de mantenimiento si no comunica nada mas en este periodo.',
                  placeholder: 'Añade observaciones para Administración (Opcional)...'
                })}
                className={`bg-white p-6 rounded-3xl border-2 text-left transition-all shadow-sm group ${hasPendingAdminGestion ? 'opacity-50 border-zinc-100 cursor-not-allowed' : isStudentFrozen ? 'border-blue-100 hover:border-blue-500' : 'border-zinc-100 hover:border-black'}`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform ${hasPendingAdminGestion ? 'bg-zinc-100' : isStudentFrozen ? 'bg-blue-50 group-hover:scale-110' : 'bg-amber-50 group-hover:scale-110'}`}><Snowflake className={`w-6 h-6 ${hasPendingAdminGestion ? 'text-zinc-400' : isStudentFrozen ? 'text-blue-500' : 'text-amber-500'}`}/></div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight">{isStudentFrozen ? 'Reactivar Plaza' : 'Cuota Mantenimiento'}</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">{isStudentFrozen ? 'Solicita salir de mantenimiento' : 'Congela tu plaza temporalmente'}</p>
              </button>

              <button 
                onClick={() => handleAdminGestionClick({
                  type: 'baja', title: 'Dar de Baja mi Plaza', icon: UserMinus, color: 'text-red-500',
                  desc: 'Solicita la cancelación de tu suscripción en la escuela. Te echaremos de menos.',
                  placeholder: '¿Podrías decirnos brevemente el motivo? Nos ayuda a mejorar (Opcional)...'
                })}
                className={`bg-white p-6 rounded-3xl border-2 text-left transition-all shadow-sm group ${hasPendingAdminGestion ? 'opacity-50 border-zinc-100 cursor-not-allowed' : 'border-zinc-100 hover:border-red-500'}`}
              >
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 transition-transform ${hasPendingAdminGestion ? 'bg-zinc-100' : 'bg-red-50 group-hover:scale-110'}`}><UserMinus className={`w-6 h-6 ${hasPendingAdminGestion ? 'text-zinc-400' : 'text-red-500'}`}/></div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight">Dar de Baja</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">Cancela tu suscripción</p>
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
