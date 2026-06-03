import React, { useState, useEffect, useMemo } from 'react';
import { 
  Inbox, Users, User, Megaphone, Settings, LogOut, Search, MonitorPlay, 
  DoorOpen, Check, X, Trash2, Calendar, FileText, Plus, ShieldAlert, 
  ArrowRightLeft, PartyPopper, Palmtree, Lock, Trophy, Award, Gift, Star, 
  Target, Timer, BookOpen, AlertTriangle, Calculator, ChevronDown, ChevronUp, History, UserMinus, Info, Clock, CheckCircle, Ticket, Pencil, AlertCircle, Ghost, PlusCircle, MapPin, Globe, LayoutGrid, Save, TrendingUp, DollarSign, PieChart, Activity, Music
} from 'lucide-react';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, collectionGroup, writeBatch, getDocs, query } from 'firebase/firestore';
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz_MEKpKnv-L1g0e1khYf45nXCQKuUx6ZP3-bYwypTyrYzWadR4yzDd4ambExbQquvo/exec";

const SEDES = ["Tarragona", "Reus"];
const SALAS = ["Sala 1", "Sala 2", "Sala 3"];

const SCHEDULE_HOURS = ["09:00", "10:00", "11:00", "12:00", "13:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"];

const defaultRoomCapacities = {
  Tarragona: { 'Sala 1': 10, 'Sala 2': 8, 'Sala 3': 4 },
  Reus: { 'Sala 1': 8, 'Sala 2': 5, 'Sala 3': 4 }
};

const defaultInstrumentos = ["Guitarra", "Canto", "Teclado", "Batería", "Bajo", "Ukelele", "Armónica", "Sensibilización", "Violín"];

const formatDateSpanish = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getDayName = (dayIndex) => ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dayIndex];

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
  
  const [settings, setSettings] = useState({ 
    festivos: [], festivosTarragona: [], festivosReus: [], vacaciones: [], contract: '', teacherRules: '', 
    hourlyRate: 17.33, costeEmpresa: 22, gastosFijos: { global: 0, tarragona: 0, reus: 0 },
    generalTasks: [], prizes: { trimestral: '', anual: '' }, teachersList: [],
    roomCapacities: defaultRoomCapacities, instrumentos: defaultInstrumentos
  });

  // --- ESTADOS LOCALES UI ---
  const [searchStudent, setSearchStudent] = useState('');
  const [filterStatus, setFilterStatus] = useState('activo');
  const [newAnnounce, setNewAnnounce] = useState({ title: '', content: '' });
  const [expandedTeacher, setExpandedTeacher] = useState(null); 
  const [notesModal, setNotesModal] = useState(null); 
  const [editStudentModal, setEditStudentModal] = useState(null); 
  const [manualTaskModal, setManualTaskModal] = useState(false);
  const [manualTaskForm, setManualTaskForm] = useState({ title: '', details: '', person: '', type: 'tarea_manual' });
  const [isSavingManualTask, setIsSavingManualTask] = useState(false);
  
  // VISTA ARQUITECTO E INFORMES
  const [classesViewMode, setClassesViewMode] = useState('profesores'); // 'profesores' o 'salas'
  const [archDay, setArchDay] = useState('1'); // Lunes por defecto
  const [archTime, setArchTime] = useState('17:00');
  const [archSede, setArchSede] = useState('Tarragona');
  const [informeSubTab, setInformeSubTab] = useState('resumen'); // 'resumen', 'sedes', 'instrumentos', 'profesores', 'semaforo'

  // ESTADOS MODALES CLASES
  const [createClassModal, setCreateClassModal] = useState(false);
  const [changeClassModal, setChangeClassModal] = useState(null);
  const [resurrectClassModal, setResurrectClassModal] = useState(null); 
  const [viewClassModal, setViewClassModal] = useState(null); 
  const [editWebModal, setEditWebModal] = useState(null); 
  const [socialModalText, setSocialModalText] = useState(''); 
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
    const checkLoad = () => { loaded++; if(loaded === 8) setLoading(false); };

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

    return () => { unsubGestiones(); unsubStudents(); unsubAnnouncements(); unsubSettings(); unsubClasses(); unsubRecords(); unsubAvail(); unsubTickets(); };
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

  // LÓGICA DE INFORMES (BUSINESS INTELLIGENCE MULTI-VISTA)
  const businessIntelligence = useMemo(() => {
    let totalIngresos = 0;
    let costeTotalProfesores = 0;
    
    const clasesRentabilidad = [];
    const porSede = { Tarragona: { ingresos: 0, costesProf: 0 }, Reus: { ingresos: 0, costesProf: 0 } };
    const porProfe = {};
    const porInstrumento = {};

    const activeRecurring = allClasses.filter(c => !c.date);

    activeRecurring.forEach(c => {
      const numAlumnos = (c.students || []).filter(s => !s.isPaused).length;
      const cuota = Number(c.cuotaBase) || 0;
      const ingresos = numAlumnos * cuota;
      
      const duracionHoras = (Number(c.duration) || 60) / 60;
      // EXCEPCIÓN PACO: Si el profesor es Paco, el coste es 0€ (ya está en gastos fijos).
      const coste = (c.teacher?.toLowerCase() === 'paco') ? 0 : (duracionHoras * 4 * (settings.costeEmpresa || 22));      
      const beneficio = ingresos - coste;

      totalIngresos += ingresos;
      costeTotalProfesores += coste;

      clasesRentabilidad.push({
        id: c.id, subject: c.subject, teacher: c.teacher, sede: c.sede, time: c.time, dayOfWeek: c.dayOfWeek,
        numAlumnos, ingresos, coste, beneficio
      });

      const sedeKey = c.sede || 'Tarragona';
      if (!porSede[sedeKey]) porSede[sedeKey] = { ingresos: 0, costesProf: 0 };
      porSede[sedeKey].ingresos += ingresos;
      porSede[sedeKey].costesProf += coste;

      const profKey = c.teacher || 'Sin Asignar';
      if (!porProfe[profKey]) porProfe[profKey] = { ingresos: 0, costes: 0, horasSemanales: 0 };
      porProfe[profKey].ingresos += ingresos;
      porProfe[profKey].costes += coste;
      porProfe[profKey].horasSemanales += duracionHoras;

      const instKey = c.subject || 'Otros';
      if (!porInstrumento[instKey]) porInstrumento[instKey] = { ingresos: 0, costes: 0, numGrupos: 0 };
      porInstrumento[instKey].ingresos += ingresos;
      porInstrumento[instKey].costes += coste;
      porInstrumento[instKey].numGrupos += 1;
    });

    clasesRentabilidad.sort((a,b) => b.beneficio - a.beneficio);

    const fijos = settings.gastosFijos || { global: 0, tarragona: 0, reus: 0 };
    const totalFijos = Number(fijos.global) + Number(fijos.tarragona) + Number(fijos.reus);
    
    return {
      totalIngresos,
      costeTotalProfesores,
      totalFijos,
      beneficioNeto: totalIngresos - costeTotalProfesores - totalFijos,
      clasesRentabilidad,
      porSede,
      porProfe: Object.entries(porProfe).map(([name, data]) => ({ name, ...data, beneficio: data.ingresos - data.costes })).sort((a,b) => b.beneficio - a.beneficio),
      porInstrumento: Object.entries(porInstrumento).map(([name, data]) => ({ name, ...data, beneficio: data.ingresos - data.costes })).sort((a,b) => b.beneficio - a.beneficio)
    };
  }, [allClasses, settings]);

  const ticketStatsByStudent = useMemo(() => {
    const stats = {};
    allTickets.forEach(ticket => {
      if (!ticket.studentId) return;
      if (!stats[ticket.studentId]) {
        stats[ticket.studentId] = { total: 0, active: 0, used: 0, expired: 0 };
      }

      stats[ticket.studentId].total += 1;

      const today = new Date().toISOString().split('T')[0];
      if (ticket.isUsed) {
        stats[ticket.studentId].used += 1;
      } else if (ticket.validUntil && ticket.validUntil < today) {
        stats[ticket.studentId].expired += 1;
      } else {
        stats[ticket.studentId].active += 1;
      }
    });
    return stats;
  }, [allTickets]);

  const createManualTask = async () => {
    const title = manualTaskForm.title.trim();
    const details = manualTaskForm.details.trim();

    if (!title || !details) {
      alert('Rellena al menos el título y los detalles de la tarea.');
      return;
    }

    setIsSavingManualTask(true);
    try {
      const taskId = `manual-${Date.now()}`;
      await setDoc(doc(db, 'artifacts', appId, 'gestiones', taskId), {
        type: manualTaskForm.type || 'tarea_manual',
        title,
        details,
        studentId: null,
        studentName: manualTaskForm.person.trim() || 'Tarea manual',
        studentEmail: '',
        source: 'manual_admin',
        status: 'pendiente',
        date: new Date().toISOString()
      });

      setManualTaskForm({ title: '', details: '', person: '', type: 'tarea_manual' });
      setManualTaskModal(false);
      alert('✅ Tarea manual añadida a la bandeja.');
    } catch (error) {
      alert('❌ Error al crear la tarea manual: ' + error.message);
    } finally {
      setIsSavingManualTask(false);
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

  const updateGestionStatus = async (gestionId, status, gestionData = null) => {
    const accion = status === 'completado' ? 'APROBAR y EJECUTAR' : 'RECHAZAR';
    if (!window.confirm(`¿Seguro que quieres ${accion} este trámite?`)) return;

    try {
      if (status !== 'completado' || !gestionData) {
        await updateDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), { status });
        alert(`Trámite marcado como ${status.toUpperCase()}.`);
        return;
      }

      const { studentId, studentName, type, requestedClass, recoveryDate } = gestionData; 
      const studentInfo = students.find(s => s.id === studentId);

      // 👇 FIX: Respetamos el alias en las gestiones
      let displayName = studentName;
      if (studentInfo && studentInfo.useAlias && studentInfo.alias) {
          displayName = studentInfo.alias;
      }

      if (type === 'baja') {
        await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), { globalStatus: 'baja' });
        let borradas = 0;
        const classesWithStudent = allClasses.filter(c => c.students && c.students.some(s => s.id === studentId));
        for (let c of classesWithStudent) {
          const updatedList = c.students.filter(s => s.id !== studentId);
          if (c.refPath) {
            await updateDoc(doc(db, c.refPath), { students: updatedList });
            borradas++;
            try {
              const emailProfe = `${c.teacher.toLowerCase().replace(' ', '.')}@escuelalosmitos.com`; 
              await fetch(APPS_SCRIPT_URL, {
                method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                  type: 'notificacion_profesor',
                  teacherEmail: emailProfe,
                  subject: `❌ Baja de alumno: ${displayName} (${c.subject})`,
                  body: `Hola ${c.teacher},\n\nDesde coordinación te informamos que ${displayName} se ha dado de BAJA de tu clase de ${c.subject} (${getDayName(c.dayOfWeek)} a las ${c.time}h).\n\nYa ha sido eliminado de tu lista de asistencia en la App. No debes esperarlo.\n\nUn saludo,\nCoordinación Los Mitos.`
                })
              });
            } catch(e) { console.log("Fallo correo baja", e); }
          }
        }
        await updateDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), { status: 'completado' });
        alert(`✅ Baja ejecutada. Profesores avisados por correo. ${displayName} borrado de ${borradas} clases.`);
      }
      else if (type === 'mantenimiento') {
        await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), { globalStatus: 'congelado' });
        const classesWithStudent = allClasses.filter(c => c.students && c.students.some(s => s.id === studentId));
        for (let c of classesWithStudent) {
          if (c.refPath) {
            const updatedList = c.students.map(s => s.id === studentId ? { ...s, isPaused: true } : s);
            await updateDoc(doc(db, c.refPath), { students: updatedList });
            try {
              const emailProfe = `${c.teacher.toLowerCase().replace(' ', '.')}@escuelalosmitos.com`; 
              await fetch(APPS_SCRIPT_URL, {
                method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                  type: 'notificacion_profesor',
                  teacherEmail: emailProfe,
                  subject: `❄️ Alumno congelado: ${displayName} (${c.subject})`,
                  body: `Hola ${c.teacher},\n\nDesde coordinación te informamos que ${displayName} ha CONGELADO su plaza de ${c.subject} (${getDayName(c.dayOfWeek)} a las ${c.time}h) durante este mes.\n\nSaldrá sombreado en azul en tu lista de asistencia. No debes esperarlo.\n\nUn saludo,\nCoordinación Los Mitos.`
                })
              });
            } catch(e) { console.log("Fallo correo congelar", e); }
          }
        }
        await updateDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), { status: 'completado' });
        alert(`❄️ Cuenta congelada. El estado se ha actualizado y los profesores han sido avisados.`);
      }
      else if (type === 'cambio_horario' || type === 'recuperacion' || type === 'ampliar_clases') {
        if (!requestedClass) {
          alert("⚠️ Aviso: Este ticket no tiene ninguna clase de destino guardada. Solo se archivará el ticket.");
          await updateDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), { status: 'completado' });
          return;
        }
        const targetClass = allClasses.find(c => c.id === requestedClass);
        if (!targetClass) {
          alert(`❌ Error crítico: La clase elegida por el alumno ya no existe en la base de datos.`);
          return;
        }
        let logMessage = `Iniciando proceso para ${displayName}:\n\n`;
        if (type === 'cambio_horario') {
          const oldClasses = allClasses.filter(c => c.id !== requestedClass && c.students && c.students.some(s => s.id === studentId) && c.subject === targetClass.subject);
          for (let c of oldClasses) {
            const updatedList = c.students.filter(s => s.id !== studentId);
            if (c.refPath) {
              await updateDoc(doc(db, c.refPath), { students: updatedList });
              logMessage += `➖ Borrado de la clase de ${c.subject} (${c.time}h).\n`;
              try {
                const emailProfe = `${c.teacher.toLowerCase().replace(' ', '.')}@escuelalosmitos.com`; 
                await fetch(APPS_SCRIPT_URL, {
                  method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                  body: JSON.stringify({
                    type: 'notificacion_profesor',
                    teacherEmail: emailProfe,
                    subject: `🔄 Cambio de horario: ${displayName} (${c.subject})`,
                    body: `Hola ${c.teacher},\n\nTe informamos que ${displayName} se ha cambiado de horario y ya NO vendrá a tu clase de ${c.subject} (${getDayName(c.dayOfWeek)} a las ${c.time}h).\n\nLo hemos borrado de tu lista de asistencia. No debes esperarlo.\n\nUn saludo.`
                  })
                });
              } catch(e) {}
            }
          }
        }
        const newStudentPayload = {
          id: studentId,
          name: displayName,
          email: studentInfo?.email || '',
          isPaused: studentInfo?.globalStatus === 'congelado' || type === 'mantenimiento',
          status: 'present',
          isRecovery: type === 'recuperacion',
          recoveryDate: type === 'recuperacion' ? recoveryDate : null 
        };
        const updatedTargetStudents = [...(targetClass.students || []).filter(s => s.id !== studentId), newStudentPayload];
        await updateDoc(doc(db, targetClass.refPath), { students: updatedTargetStudents });
        logMessage += `➕ Añadido a la clase de ${targetClass.subject} (${targetClass.time}h).\n`;
        await updateDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), { status: 'completado' });
        logMessage += `✅ Ticket archivado con éxito.\n`;
        try {
          const emailProfe = `${targetClass.teacher.toLowerCase().replace(' ', '.')}@escuelalosmitos.com`; 
          let emailSubject = `🎉 ¡Nuevo alumno en tu clase de ${targetClass.subject}!`;
          let emailBody = `Hola ${targetClass.teacher},\n\nDesde coordinación hemos añadido a ${displayName} a tu clase de ${targetClass.subject} (${getDayName(targetClass.dayOfWeek)} a las ${targetClass.time}h).\n\nEl alumno ya aparece activo en tu lista de asistencia de la App.\n\nUn saludo,\nCoordinación Los Mitos.`;
          if (type === 'recuperacion') {
            emailSubject = `🔄 Recuperación programada: ${displayName} (${targetClass.subject})`;
            emailBody = `Hola ${targetClass.teacher},\n\nDesde coordinación hemos programado a ${displayName} para recuperar una clase de ${targetClass.subject} contigo el próximo ${formatDateSpanish(recoveryDate)} a las ${targetClass.time}h.\n\nEl sistema es inteligente: el alumno NO aparecerá en tu lista hasta que llegue exactamente ese día.\n\nUn saludo,\nCoordinación Los Mitos.`;
          }
          await fetch(APPS_SCRIPT_URL, {
            method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              type: 'notificacion_profesor',
              teacherEmail: emailProfe,
              subject: emailSubject,
              body: emailBody
            })
          });
        } catch(e) { }
        alert(logMessage);
      } else {
        await updateDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), { status: 'completado' });
        alert("✅ Trámite genérico archivado correctamente.");
      }
    } catch (error) {
      alert(`❌ ERROR DEL SISTEMA:\n\n${error.message}`);
    }
  };

  const toggleStudentToggle = async (studentId, field, currentValue) => {
    const isStatusField = field === 'globalStatus';
    const newStatus = isStatusField ? (currentValue === 'congelado' ? 'activo' : 'congelado') : !currentValue;
    if(window.confirm(`¿Cambiar este ajuste a ${isStatusField ? newStatus.toUpperCase() : (newStatus ? 'ON' : 'OFF')}?`)) {
      await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), { [field]: newStatus });
    }
  };

  const handleUpdateStudentStatus = async (studentId, studentName, newStatus) => {
    if (newStatus === 'baja') {
      const confirmBaja = window.confirm(`⚠️ ACCIÓN DEFINITIVA: ¿Quieres dar de BAJA a ${studentName}?\n\nSe eliminará de todas las listas de los profesores y perderá el acceso al portal.`);
      if (!confirmBaja) return;
    }
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), { globalStatus: newStatus });
      if (newStatus === 'baja') {
        const classesWithThisStudent = allClasses.filter(c => c.students && c.students.some(s => s.id === studentId));
        const updatePromises = classesWithThisStudent.map(c => {
          const updatedList = c.students.filter(s => s.id !== studentId);
          if (c.refPath) return updateDoc(doc(db, c.refPath), { students: updatedList });
          return Promise.resolve();
        });
        await Promise.all(updatePromises);
        alert(`✅ ${studentName} ha sido procesado como BAJA y eliminado de sus clases.`);
      } else {
        alert(`Estado de ${studentName} cambiado a ${newStatus.toUpperCase()}.`);
      }
    } catch (error) {
      alert("Hubo un error al procesar el cambio.");
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
      const oldClasses = allClasses.filter(c => c.id !== targetClass.id && c.students && c.students.some(s => s.id === student.id) && c.subject === targetClass.subject);
      for (let c of oldClasses) {
        const updatedList = c.students.filter(s => s.id !== student.id);
        if (c.refPath) await updateDoc(doc(db, c.refPath), { students: updatedList });
      }
      
      // 👇 FIX: Respetamos el alias en las altas
      const displayName = student.useAlias && student.alias ? student.alias : student.name;
      const newStudentPayload = {
        id: student.id,
        name: displayName,
        email: student.email || '',
        isPaused: student.globalStatus === 'congelado',
        status: 'present',
        isRecovery: false
      };
      const updatedTargetStudents = [...(targetClass.students || []).filter(s => s.id !== student.id), newStudentPayload];
      await updateDoc(doc(db, targetClass.refPath), { students: updatedTargetStudents });
      alert(`✅ ${student.name} transferido con éxito a la clase de ${targetClass.teacher}.`);
      setChangeClassModal(null);
    } catch (error) {
      alert(`❌ Error al cambiar de clase: ${error.message}`);
    }
  };

  const grantRecoveryTicket = async (student) => {
    const num = window.prompt(`¿Cuántos tickets de recuperación quieres otorgarle a ${student.name} como cortesía?\n\n(Se generarán para el mes próximo)`, "1");
    if (!num || isNaN(num) || parseInt(num) <= 0) return;
    try {
      const { validFrom, validUntil } = generateTicketDates();
      const mainClass = allClasses.find(c => c.students && c.students.some(s => s.id === student.id));
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
      alert(`🎁 Se han otorgado ${num} tickets a ${student.name}. Serán válidos desde el 1 del mes que viene.`);
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
    if (!newAnnounce.title || !newAnnounce.content) return alert('Rellena todos los campos');
    const id = Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'announcements', id), { 
      ...newAnnounce, date: new Date().toISOString().split('T')[0] 
    });
    setNewAnnounce({ title: '', content: '' });
    alert('Aviso publicado.');
  };

  const deleteAnnouncement = async (id) => { 
    if(window.confirm('¿Borrar aviso?')) await deleteDoc(doc(db, 'artifacts', appId, 'announcements', id)); 
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
      const clasesSede = allClasses.filter(c => (c.sede || 'Tarragona') === sede && c.isWebVisible === true);
      const filteredWithSpots = clasesSede.filter(c => {
        const activeStudents = (c.students || []).filter(s => !s.isPaused).length;
        return (parseInt(c.capacity, 10) || 4) - activeStudents > 0;
      });

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
            const activeCount = (c.students || []).filter(s => !s.isPaused).length;
            const libres = (parseInt(c.capacity, 10) || 4) - activeCount;
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
    
    // --- 1. Aviso de Disponibilidad del Profesor ---
    const teacherSlots = availabilities[teacherKey]?.[dayKey.toString()] || [];
    const isCovered = teacherSlots.some(slot => classTime >= slot.start && classTime < slot.end);
    if (!isCovered) {
      const confirmForce = window.confirm(`⚠️ AVISO DE DISPONIBILIDAD:\n\nEl profesor ${newClassData.teacher} NO ha marcado estar disponible el ${getDayName(dayKey)} a las ${classTime}h.\n\n¿Quieres FORZAR la creación de la clase de todos modos?`);
      if (!confirmForce) return; 
    }

    // --- 2. Aviso de Solapamiento Físico de Sala ---
    const collidingClasses = allClasses.filter(c => {
      if (c.sede !== newClassData.sede) return false;
      if (c.sala !== newClassData.sala) return false;
      if (c.time !== newClassData.time) return false;

      if (newClassData.isRecurring) {
        if (c.isRecurring && c.dayOfWeek === dayKey) return true;
        if (!c.isRecurring && new Date(c.date).getDay() === dayKey) return true; 
      } else {
        if (c.isRecurring && c.dayOfWeek === dayKey) return true;
        if (!c.isRecurring && c.date === newClassData.specificDate) return true;
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
      publicDetails: ''
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
            internalNotes: 'Importado masivamente de Tadosi'
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

  const pendingGestiones = gestiones.filter(g => g.status === 'pendiente');
  const resolvedGestiones = gestiones.filter(g => g.status !== 'pendiente').slice(0, 30);
  
  const rankMonthly = students.filter(s => s.triviaPoints > 0).sort((a,b) => b.triviaPoints - a.triviaPoints).slice(0,10);
  const rankQuarterly = students.filter(s => (s.triviaPointsQuarterly || 0) + (s.triviaPoints || 0) > 0).map(s => ({ ...s, liveQuarterly: (s.triviaPointsQuarterly || 0) + (s.triviaPoints || 0) })).sort((a,b) => b.liveQuarterly - a.liveQuarterly).slice(0,10);
  const rankAnnual = students.filter(s => (s.triviaPointsAnnual || 0) + (s.triviaPoints || 0) > 0).map(s => ({ ...s, liveAnnual: (s.triviaPointsAnnual || 0) + (s.triviaPoints || 0) })).sort((a,b) => b.liveAnnual - a.liveAnnual).slice(0,10);

  const classesByTeacher = useMemo(() => {
    const grouped = {};
    allClasses.forEach(c => {
      const teacherName = c.teacher || 'Sin Asignar';
      if (!grouped[teacherName]) grouped[teacherName] = [];
      grouped[teacherName].push(c);
    });
    Object.keys(grouped).forEach(t => {
      grouped[t].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.time.localeCompare(b.time));
    });
    return grouped;
  }, [allClasses]);

  const dangerClasses = useMemo(() => {
    return allClasses.filter(c => {
      const activeCount = (c.students || []).filter(s => !s.isPaused).length;
      if (activeCount === 0) return true; 
      const cap = parseInt(c.capacity, 10) || 0;
      if (cap <= 1) return false; 
      return activeCount <= (cap / 2);
    }).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.time.localeCompare(b.time));
  }, [allClasses]);

  const teachersPayroll = useMemo(() => {
    const targetMonth = selectedPayrollMonth;
    const thisMonthRecords = allRecords.filter(r => r.date.startsWith(targetMonth) && !r.isRenounced);
    const payroll = {};
    thisMonthRecords.forEach(r => {
      const tName = r.teacher || 'Desconocido';
      if (!payroll[tName]) payroll[tName] = 0;
      const duration = Number(String(r.duration).replace(',', '.')) || 60;
      payroll[tName] += (duration / 60);
    });
    return Object.entries(payroll).map(([name, hours]) => ({
      name, hours: hours.toFixed(2), earnings: (hours * (settings.hourlyRate || 17.33)).toFixed(2)
    })).sort((a, b) => b.hours - a.hours);
  }, [allRecords, settings.hourlyRate, selectedPayrollMonth]);

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
          if (s.isPaused) return false;
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
  }, [allClasses, mboxAdminDate, mboxAdminSede]);


  // ==========================================
  // MODALES Y COMPONENTES
  // ==========================================

  const ManualTaskModalOverlay = () => {
    if (!manualTaskModal) return null;

    return (
      <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl relative">
          <button onClick={() => setManualTaskModal(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>

          <div className="flex items-center gap-3 text-slate-900 mb-6">
            <Inbox className="w-8 h-8 text-red-600" />
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight">Nueva Tarea Manual</h2>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Para encargos verbales, llamadas o notas internas.</p>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Tipo</label>
              <select value={manualTaskForm.type} onChange={e => setManualTaskForm({...manualTaskForm, type: e.target.value})} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-black">
                <option value="tarea_manual">Tarea manual</option>
                <option value="llamada">Llamada pendiente</option>
                <option value="seguimiento">Seguimiento</option>
                <option value="incidencia_manual">Incidencia</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Persona relacionada</label>
              <input type="text" value={manualTaskForm.person} onChange={e => setManualTaskForm({...manualTaskForm, person: e.target.value})} placeholder="Ej: Sara, madre de Hugo, Norman..." className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-black" />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Título *</label>
              <input type="text" value={manualTaskForm.title} onChange={e => setManualTaskForm({...manualTaskForm, title: e.target.value})} placeholder="Ej: Cambiar a Hugo de grupo" className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-black" />
            </div>

            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Detalles *</label>
              <textarea value={manualTaskForm.details} onChange={e => setManualTaskForm({...manualTaskForm, details: e.target.value})} placeholder="Describe exactamente qué hay que hacer..." className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl focus:border-black outline-none min-h-[130px] resize-y text-sm font-medium text-slate-700" />
            </div>
          </div>

          <button onClick={createManualTask} disabled={isSavingManualTask} className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-800 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
            {isSavingManualTask ? 'Guardando...' : <><Plus className="w-4 h-4"/> Añadir a Bandeja</>}
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
    
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
      if (!name.trim()) return alert("El nombre principal es obligatorio.");
      setSaving(true);
      try {
        const finalDisplayName = useAlias && alias.trim() ? alias.trim() : name.trim();

        await updateDoc(doc(db, 'artifacts', appId, 'students', editStudentModal.id), { 
          name: name.trim(), 
          email: email.toLowerCase().trim(),
          alias: alias.trim(),
          useAlias: useAlias
        });
        
        const classesWithStudent = allClasses.filter(c => c.students && c.students.some(s => s.id === editStudentModal.id));
        const batch = writeBatch(db);
        classesWithStudent.forEach(c => {
          const updatedList = c.students.map(s => 
            s.id === editStudentModal.id ? { ...s, name: finalDisplayName, email: email.toLowerCase().trim() } : s
          );
          batch.update(doc(db, c.refPath), { students: updatedList });
        });
        await batch.commit();
        
        alert('Datos del alumno actualizados en todo el sistema.');
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
      publicDetails: editWebModal.publicDetails || ''
    });
    const [saving, setSaving] = useState(false);
    const handleSave = async () => {
      setSaving(true);
      try {
        await updateDoc(doc(db, editWebModal.refPath), {
          ...formData,
          cuotaBase: Number(formData.cuotaBase) || 0
        });
        alert("Configuración web e informes guardada correctamente.");
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
          </div>
          <button onClick={handleSave} disabled={saving} className="w-full bg-blue-600 text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-all shadow-md disabled:opacity-50">
            {saving ? 'Guardando...' : 'Guardar Configuración Web'}
          </button>
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
    const availableClasses = targetInstrument ? allClasses.filter(c => c.subject === targetInstrument && (c.students?.length || 0) < parseInt(c.capacity || 4)) : [];
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
                  <div className="text-xs text-zinc-500 mt-1 flex justify-between"><span>Prof: {c.teacher}</span> <span className="text-blue-600 font-bold">{parseInt(c.capacity || 4) - (c.students?.length || 0)} plazas libres</span></div>
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
    const [saving, setSaving] = useState(false);
    const handleResurrect = async () => {
      if (!searchName.trim()) return alert("Debes escribir el nombre del alumno.");
      setSaving(true);
      try {
        let studentId;
        let existingStudent = students.find(s => 
          s.name.toLowerCase() === searchName.trim().toLowerCase() || 
          (email && s.email === email.trim().toLowerCase())
        );
        
        // 👇 FIX: Respetar alias al reactivar
        let displayName = searchName.trim();
        if (existingStudent && existingStudent.useAlias && existingStudent.alias) {
            displayName = existingStudent.alias;
        }

        if (existingStudent) {
          studentId = existingStudent.id;
        } else {
          studentId = Date.now().toString();
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
            internalNotes: 'Añadido al reactivar grupo'
          });
        }
        const newStudentPayload = {
          id: studentId,
          name: displayName,
          email: existingStudent ? existingStudent.email : email.trim().toLowerCase(),
          isPaused: existingStudent?.globalStatus === 'congelado' || false,
          status: 'present',
          isRecovery: false
        };
        const targetPath = doc(db, resurrectClassModal.refPath);
        const updatedStudents = [...(resurrectClassModal.students || []), newStudentPayload];
        await updateDoc(targetPath, { students: updatedStudents });
        alert("🎉 ¡Clase reactivada! El profesor ya la tiene operativa en su tablet y empezará a computar en nómina cuando pase lista.");
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
    const [saving, setSaving] = useState(false);
    const maxCap = parseInt(c.capacity, 10) || 0;
    const currentCount = c.students?.length || 0;
    const isFull = maxCap > 0 && currentCount >= maxCap;

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
        
        // 👇 FIX: Respetar alias al matricular en clase
        let displayName = searchName.trim();
        if (existingStudent && existingStudent.useAlias && existingStudent.alias) {
            displayName = existingStudent.alias;
        }

        if (existingStudent) {
          studentId = existingStudent.id;
        } else {
          studentId = Date.now().toString();
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
            internalNotes: 'Añadido desde panel de clase'
          });
        }
        const newStudentPayload = {
          id: studentId,
          name: displayName,
          email: existingStudent ? existingStudent.email : emailInput.trim().toLowerCase(),
          isPaused: existingStudent?.globalStatus === 'congelado' || false,
          status: 'present',
          isRecovery: false
        };
        const targetPath = doc(db, c.refPath);
        const updatedStudents = [...(c.students || []), newStudentPayload];
        await updateDoc(targetPath, { students: updatedStudents });
        setSearchName('');
        setEmailInput('');
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
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400 mb-2">
              Alumnos Matriculados ({currentCount}/{c.capacity})
            </h3>
            {(!c.students || c.students.length === 0) ? (
              <div className="p-4 bg-zinc-50 border-2 border-dashed border-zinc-200 rounded-xl text-center text-xs font-bold text-zinc-400 uppercase tracking-widest">
                Clase vacía (Hibernada)
              </div>
            ) : (
              c.students.map(s => {
                const globalSt = students.find(g => g.id === s.id);
                const displayEmail = globalSt?.email || s.email;
                return (
                  <div key={s.id} className="flex items-center justify-between p-3 bg-white border border-zinc-200 shadow-sm rounded-xl hover:border-indigo-200 transition-colors">
                    <div>
                      <p className={`font-bold text-sm ${s.isPaused ? 'text-zinc-400 line-through' : 'text-slate-800'}`}>{s.name}</p>
                      <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{displayEmail || 'Sin email'}</p>
                    </div>
                    <button onClick={() => handleRemoveFromSpecificClass(c, s.id, s.name)} className="p-2 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-colors" title="Expulsar SOLO de esta clase">
                      <UserMinus className="w-4 h-4"/>
                    </button>
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
      <EditWebModalOverlay />
      <CreateClassModalOverlay />
      <ManualTaskModalOverlay />
      {notesModal && <NotesModalOverlay />}
      {changeClassModal && <ChangeClassModalOverlay />}
      {editStudentModal && <EditStudentModalOverlay />} 
      {resurrectClassModal && <ResurrectClassModalOverlay />}
      {viewClassModal && <ViewClassModalOverlay />}
      {socialModalText && <SocialModalOverlay />}
      
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
            { id: 'gestiones', icon: Inbox, label: 'Bandeja', count: pendingGestiones.length },
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
                  <p className="text-[10px] font-bold text-emerald-700/70 uppercase mt-2">Alumnos Activos × Cuota Base</p>
                </div>
                
                <div className="bg-rose-50 border border-rose-200 p-6 rounded-3xl shadow-sm">
                  <div className="flex items-center gap-2 text-rose-600 mb-2"><Users className="w-5 h-5"/><h3 className="text-xs font-black uppercase tracking-widest">Coste Profesores</h3></div>
                  <p className="text-4xl font-black text-rose-900 tracking-tighter">-{businessIntelligence.costeTotalProfesores.toLocaleString('es-ES', {maximumFractionDigits:0})}€</p>
                  <p className="text-[10px] font-bold text-rose-700/70 uppercase mt-2">Nóminas a Coste Empresa (Paco = 0€)</p>
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
                             <div className="flex justify-between text-slate-600"><span>Ingresos Alumnos:</span><span className="text-emerald-600">+{dataSede.ingresos}€</span></div>
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
                             <th className="p-4 text-center">Nº Grupos</th>
                             <th className="p-4 text-right text-emerald-600">Ingresos Mensuales</th>
                             <th className="p-4 text-right text-rose-600">Costes Empresa</th>
                             <th className="p-4 text-right">Margen Limpio</th>
                          </tr>
                       </thead>
                       <tbody className="text-sm font-bold text-slate-700">
                          {businessIntelligence.porInstrumento.map(inst => (
                             <tr key={inst.name} className="border-b hover:bg-zinc-50">
                                <td className="p-4 uppercase font-black text-slate-900">{inst.name}</td>
                                <td className="p-4 text-center">{inst.numGrupos} clases</td>
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
                             <th className="p-4 text-center">Horas/Semana</th>
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
                                <td className="p-4 text-center">{p.horasSemanales.toFixed(1)} h/sem</td>
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
                <p className="text-zinc-500 font-medium text-sm">Gestiona solicitudes de alumnos y tareas manuales internas.</p>
              </div>
              <button onClick={() => setManualTaskModal(true)} className="bg-black hover:bg-zinc-800 text-white px-5 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 transition-colors">
                <Plus className="w-4 h-4"/> Nueva Tarea Manual
              </button>
            </header>

            {pendingGestiones.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-zinc-200">
                <Check className="w-12 h-12 text-emerald-400 mx-auto mb-4 bg-emerald-50 rounded-full p-2" />
                <h3 className="text-lg font-black text-slate-800 uppercase">Todo al día</h3>
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
                      {pendingGestiones.map(g => (
                        <tr key={g.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                          <td className="p-4 whitespace-nowrap text-zinc-500">{formatDateSpanish(g.date)}</td>
                          <td className="p-4">
                            <div className="font-black text-black">{g.studentName}</div>
                            <div className="text-[10px] text-zinc-400">{g.studentEmail}</div>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${(g.type || '').includes('mitobox') ? 'bg-blue-100 text-blue-800' : (g.type || '').includes('baja') ? 'bg-red-100 text-red-800' : (g.type || '').includes('manual') || (g.source === 'manual_admin') ? 'bg-purple-100 text-purple-800' : 'bg-zinc-200 text-zinc-800'}`}>
                              {(g.type || 'tarea').replace('_', ' ')}
                            </span>
                            {g.targetMonth && <div className="text-[10px] font-bold text-amber-600 mt-1 uppercase">Para: {g.targetMonth}</div>}
                            {g.recoveryDate && <div className="text-[10px] font-bold text-emerald-600 mt-1 uppercase">Día Exacto: {formatDateSpanish(g.recoveryDate)}</div>}
                          </td>
                          <td className="p-4">
                            <div className="max-w-[150px] md:max-w-[250px] truncate text-xs" title={g.details}>{g.details}</div>
                          </td>
                          <td className="p-4 text-right whitespace-nowrap">
                            <button onClick={() => updateGestionStatus(g.id, 'completado', g)} className="p-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg mr-2 transition-colors" title="Aprobar y Ejecutar"><Check className="w-4 h-4"/></button>
                            <button onClick={() => updateGestionStatus(g.id, 'rechazado', g)} className="p-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors" title="Rechazar"><X className="w-4 h-4"/></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                        {resolvedGestiones.map(g => (
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
                              <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${g.status === 'completado' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                {g.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
                  {['activo', 'congelado', 'baja', 'sin_activar'].map((s) => (
                    <button
                      key={s}
                      onClick={() => setFilterStatus(s)}
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterStatus === s ? 'bg-black text-white' : 'text-zinc-400 hover:text-black'}`}
                    >
                      {s === 'sin_activar' ? 'Sin Activar' : s + 's'}
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
                        const matchSearch = s.name.toLowerCase().includes(searchStudent.toLowerCase());
                        if (filterStatus === 'sin_activar') {
                          return matchSearch && (s.claimed === false);
                        }
                        const currentStatus = s.globalStatus || 'activo';
                        const matchStatus = currentStatus === filterStatus;
                        return matchSearch && matchStatus;
                      });

                      if (filtered.length === 0) {
                        return <tr><td colSpan="4" className="p-12 text-center text-zinc-400 italic">No hay alumnos en esta lista.</td></tr>;
                      }

                      return filtered.map(student => (
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

                            {(() => {
                              const studentClasses = allClasses.filter(c => c.students && c.students.some(s => s.id === student.id && !s.isPaused));
                              if (studentClasses.length === 0) return null;
                              return (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {studentClasses.map(c => {
                                    const dayShort = getDayName(c.dayOfWeek).substring(0, 3);
                                    const timeShort = c.time.split(':')[0] + 'h';
                                    return (
                                      <span key={c.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-zinc-100 border border-zinc-200 text-zinc-500 rounded text-[8px] font-black uppercase tracking-widest whitespace-nowrap" title={`Profesor: ${c.teacher}`}>
                                        <BookOpen className="w-2.5 h-2.5 text-zinc-400" /> {c.subject} {dayShort}-{timeShort}
                                      </span>
                                    );
                                  })}
                                </div>
                              );
                            })()}
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
                                const ticketStats = ticketStatsByStudent[student.id] || { total: 0, active: 0, used: 0, expired: 0 };
                                return (
                                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${ticketStats.total > 0 ? 'bg-amber-100 text-amber-800' : 'bg-zinc-100 text-zinc-400'}`} title={`Tickets generados: ${ticketStats.total} · Activos: ${ticketStats.active} · Usados: ${ticketStats.used} · Caducados: ${ticketStats.expired}`}>
                                    <Ticket className="w-3 h-3"/> {ticketStats.active}/{ticketStats.total}
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
                              <button onClick={() => grantRecoveryTicket(student)} className="p-2.5 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors" title="Regalar Ticket de Recuperación">
                                <Gift className="w-4 h-4"/>
                              </button>
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            <select 
                              value={student.globalStatus || 'activo'}
                              onChange={(e) => handleUpdateStudentStatus(student.id, student.name, e.target.value)}
                              className={`text-[10px] font-black uppercase tracking-widest px-2 py-2 w-full max-w-[120px] rounded-lg border-2 outline-none transition-all cursor-pointer ${
                                student.globalStatus === 'congelado' ? 'bg-amber-50 border-amber-200 text-amber-700' : 
                                student.globalStatus === 'baja' ? 'bg-red-50 border-red-200 text-red-700' : 
                                'bg-emerald-50 border-emerald-200 text-emerald-700'
                              }`}
                            >
                              <option value="activo">Activo</option>
                              <option value="congelado">Congelado</option>
                              <option value="baja">Dar de Baja</option>
                            </select>
                          </td>
                        </tr>
                      ));
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
                  <button onClick={() => setClassesViewMode('salas')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${classesViewMode === 'salas' ? 'bg-white shadow-sm text-slate-800' : 'text-zinc-500 hover:text-slate-800'}`}>
                    <LayoutGrid className="w-3 h-3 inline mr-1" /> Salas (Arquitecto)
                  </button>
                </div>
                
                {classesViewMode === 'profesores' && (
                  <button onClick={handleGenerateSocialText} className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 transition-colors">
                    <Megaphone className="w-3 h-3"/> Redes
                  </button>
                )}
                
                <button onClick={() => setCreateClassModal(true)} className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md flex items-center justify-center gap-2 transition-colors">
                  <Plus className="w-3 h-3"/> Crear Clase
                </button>
              </div>
            </header>

            {/* VISTA ARQUITECTO (POR SALAS EN BLANCO/OCUPADO + CUADRANTE) */}
            {classesViewMode === 'salas' && (
               <div className="space-y-6 animate-in fade-in">
                  <div className="bg-white p-4 rounded-2xl flex flex-col sm:flex-row gap-4 shadow-sm border border-zinc-200 items-center justify-center">
                     <select value={archSede} onChange={e=>setArchSede(e.target.value)} className="w-full sm:w-auto p-3 bg-zinc-50 border-2 border-zinc-200 outline-none font-black text-sm uppercase tracking-widest">
                       {SEDES.map(s => <option key={s} value={s}>{s}</option>)}
                     </select>
                     <select value={archDay} onChange={e=>setArchDay(e.target.value)} className="w-full sm:w-auto p-3 bg-zinc-50 border-2 border-zinc-200 outline-none font-black text-sm uppercase tracking-widest">
                       {[1,2,3,4,5,6].map(d => <option key={d} value={d}>{getDayName(d)}</option>)}
                     </select>
                     <input type="time" value={archTime} onChange={e=>setArchTime(e.target.value)} className="w-full sm:w-auto p-3 bg-zinc-50 border-2 border-zinc-200 outline-none font-black text-sm uppercase tracking-widest"/>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                     {SALAS.map(sala => {
                        const maxCapFisica = settings.roomCapacities?.[archSede]?.[sala] || 0;
                        const claseAsignada = allClasses.find(c => c.sede === archSede && c.dayOfWeek === parseInt(archDay) && c.time === archTime && c.sala === sala);

                        if (claseAsignada) {
                           const activeC = (claseAsignada.students || []).filter(s => !s.isPaused).length;
                           return (
                              <div key={sala} className="bg-zinc-900 text-white p-6 rounded-3xl shadow-xl relative overflow-hidden flex flex-col min-h-[220px] border border-zinc-800 group">
                                 <h3 className="font-black text-3xl uppercase tracking-tighter mb-1 opacity-20 absolute top-4 right-4">{sala.replace('Sala ', 'S')}</h3>
                                 <h3 className="font-black text-xl uppercase tracking-widest mb-1 text-zinc-400">{sala}</h3>
                                 <div className="flex-1 mt-2 z-10">
                                    <span className="bg-blue-500 text-white px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-widest shadow-sm">Ocupada</span>
                                    <h4 className="font-black text-2xl mt-3 tracking-tight">{claseAsignada.subject}</h4>
                                    <p className="text-zinc-400 text-xs font-bold uppercase mt-1 tracking-widest flex items-center gap-1"><User className="w-3 h-3"/> Prof: {claseAsignada.teacher}</p>
                                 </div>
                                 <div className="mt-4 pt-4 border-t border-zinc-800 flex justify-between items-center z-10">
                                    <span className="text-xs font-black text-zinc-300">Aforo: <span className={activeC >= claseAsignada.capacity ? 'text-red-400' : 'text-emerald-400'}>{activeC}/{claseAsignada.capacity}</span></span>
                                    <div className="flex gap-2">
                                      <button onClick={() => handleDeleteClassGlobal(claseAsignada)} className="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white p-2 rounded-xl transition-colors" title="Borrar Clase"><Trash2 className="w-4 h-4"/></button>
                                      <button onClick={() => setViewClassModal(claseAsignada)} className="bg-white hover:bg-zinc-200 text-black px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">Ver Clase</button>
                                    </div>
                                 </div>
                              </div>
                           );
                        } else {
                           return (
                              <div key={sala} className="bg-emerald-50 border-2 border-emerald-200 p-6 rounded-3xl shadow-sm relative flex flex-col min-h-[220px] hover:border-emerald-400 transition-colors">
                                 <h3 className="font-black text-xl uppercase tracking-widest text-emerald-900 mb-1">{sala}</h3>
                                 <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600/70 mb-4 bg-emerald-100 px-2 py-1 rounded w-max">Capacidad real: {maxCapFisica} pax</p>
                                 <div className="flex-1 flex flex-col items-center justify-center gap-2">
                                    <DoorOpen className="w-8 h-8 text-emerald-300"/>
                                    <span className="text-emerald-600 font-black uppercase tracking-widest text-lg">SALA LIBRE</span>
                                 </div>
                                 <button onClick={() => {
                                    setNewClassData({...newClassData, isRecurring: true, dayOfWeek: archDay, time: archTime, sede: archSede, sala: sala});
                                    setCreateClassModal(true);
                                 }} className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest transition-all shadow-md flex items-center justify-center gap-2">
                                    <PlusCircle className="w-4 h-4"/> Crear Clase Aquí
                                 </button>
                              </div>
                           );
                        }
                     })}
                  </div>

                  {/* TABLA COMPLETA DE CASILLAS EXCEL INTERACTIVAS */}
                  <div className="mt-12">
                     <h3 className="text-lg font-black uppercase tracking-widest text-slate-800 mb-4 flex items-center gap-2"><Calendar className="w-5 h-5 text-zinc-400"/> Cuadrante Completo</h3>
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
                                       const classesInSlot = allClasses.filter(c => c.sede === archSede && c.dayOfWeek === parseInt(archDay) && c.sala === sala && (c.time || '').startsWith(time.split(':')[0]));
                                       return (
                                          <td key={sala} className="p-2 border-r border-zinc-100 align-top h-24 relative hover:bg-zinc-50 transition-colors group cursor-pointer" onClick={(e) => { if(e.target.closest('button') || classesInSlot.length > 0) return; setNewClassData({...newClassData, isRecurring: true, dayOfWeek: archDay, time: time, sede: archSede, sala: sala}); setCreateClassModal(true); }}>
                                             {classesInSlot.length > 0 ? (
                                                classesInSlot.map(c => (
                                                   <div key={c.id} className="bg-zinc-800 text-white p-3 rounded-xl text-xs mb-2 last:mb-0 shadow-sm hover:bg-black transition-colors" onClick={(e) => { e.stopPropagation(); setViewClassModal(c); }}>
                                                      <div className="font-black truncate uppercase tracking-widest">{c.time} - {c.subject}</div>
                                                      <div className="text-[10px] text-zinc-400 font-bold truncate mt-1">Prof: {c.teacher}</div>
                                                   </div>
                                                ))
                                             ) : (
                                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                   <PlusCircle className="w-8 h-8 text-zinc-200" />
                                                </div>
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
                    return (
                      <div key={teacher} className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
                        <button onClick={() => setExpandedTeacher(isExpanded ? null : teacher)} className="w-full p-5 bg-zinc-50 hover:bg-zinc-100 transition-colors flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            <div className="bg-black text-white p-2 rounded-lg"><User className="w-5 h-5"/></div>
                            <h3 className="font-black text-lg uppercase tracking-tight text-slate-800">{teacher} ({classes.length} Clases)</h3>
                          </div>
                          {isExpanded ? <ChevronUp/> : <ChevronDown/>}
                        </button>
                        
                        {isExpanded && (
                          <div className="p-4 border-t grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {classes.map(c => {
                              const activeC = (c.students || []).filter(s => !s.isPaused).length;
                              const isHibernated = activeC === 0;
                              return (
                                <div key={c.id} className={`p-4 rounded-xl border relative group ${isHibernated ? 'bg-zinc-50 border-dashed' : 'bg-white'}`}>
                                  <button onClick={(e) => { e.stopPropagation(); handleDeleteClassGlobal(c); }} className="absolute top-2 right-2 p-1.5 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all z-10" title="Borrar Clase">
                                    <Trash2 className="w-4 h-4"/>
                                  </button>
                                  
                                  <div className="font-black text-sm uppercase pr-8">{getDayName(c.dayOfWeek)} <span className="bg-zinc-100 p-1 rounded">{c.time}</span></div>
                                  <div className="text-xs text-zinc-400 font-bold uppercase mt-1">{c.subject} • {c.sede} ({c.sala})</div>
                                  <div className="text-right text-xs font-black mt-2">{isHibernated ? '💤 Hibernada' : `${activeC}/${c.capacity} Alumnos`}</div>
                                  <div className="flex gap-2 mt-3">
                                    <button onClick={() => setViewClassModal(c)} className="flex-1 p-1 bg-zinc-100 text-[10px] font-black uppercase rounded"><Users className="w-3 h-3 inline"/> Alumnos</button>
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
          </div>
        )}

        {/* --- 5. CLASES EN PELIGRO --- */}
        {activeTab === 'danger' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="mb-6 flex items-center gap-3">
              <div className="bg-red-100 p-3 rounded-xl"><AlertTriangle className="w-6 h-6 text-red-600"/></div>
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Grupos en Peligro</h2>
                <p className="text-zinc-500 font-medium text-sm">Clases grupales al 50% de ocupación, o totalmente hibernadas.</p>
              </div>
            </header>

            {dangerClasses.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-zinc-200">
                <PartyPopper className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                <h3 className="text-lg font-black text-slate-800 uppercase">Grupos sanos</h3>
                <p className="text-zinc-500 text-sm">No hay clases grupales con riesgo de aforo bajo.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {dangerClasses.map(c => {
                  const activeC = (c.students || []).filter(s => !s.isPaused).length;
                  const isHibernated = activeC === 0;
                  const isCritical = activeC === 1; 

                  return (
                    <div key={c.id} className={`p-5 rounded-2xl border-2 shadow-sm flex flex-col relative group ${isHibernated ? 'bg-zinc-50 border-dashed border-zinc-300' : isCritical ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteClassGlobal(c); }} className="absolute top-3 right-3 p-1.5 bg-red-100 text-red-600 hover:bg-red-600 hover:text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all z-10" title="Borrar Clase">
                        <Trash2 className="w-4 h-4"/>
                      </button>

                      <div className="flex justify-between items-start mb-3 pr-8">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${isHibernated ? 'bg-zinc-200 text-zinc-500' : isCritical ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'}`}>
                          {isHibernated ? 'Hibernada' : isCritical ? 'Crítico' : 'Revisar'}
                        </span>
                        {isHibernated ? <Ghost className="w-5 h-5 text-zinc-400"/> : <span className="font-black text-lg">{activeC} / {c.capacity}</span>}
                      </div>
                      <h4 className="font-black uppercase tracking-tight text-slate-900">{c.subject}</h4>
                      <p className="text-xs font-bold text-slate-600 mb-2">{getDayName(c.dayOfWeek)} a las {c.time}h</p>
                      <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 bg-white/50 px-2 py-1 rounded inline-block w-max">Prof: {c.teacher}</div>
                      
                      <div className="mt-auto pt-4 flex gap-2">
                        {isHibernated ? (
                           <button onClick={() => setResurrectClassModal(c)} className="flex-1 bg-zinc-800 text-white font-black py-2 rounded-lg text-[10px] uppercase tracking-widest hover:bg-black transition-colors flex items-center justify-center gap-1">
                             <PlusCircle className="w-3 h-3"/> Reactivar
                           </button>
                        ) : (
                           <button onClick={() => setViewClassModal(c)} className="flex-1 bg-zinc-100 text-zinc-600 font-black py-2 rounded-lg text-[10px] uppercase tracking-widest hover:bg-black hover:text-white transition-colors flex items-center justify-center gap-1">
                             <Users className="w-3 h-3"/> Alumnos
                           </button>
                        )}
                        <button onClick={() => setEditWebModal(c)} className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-1 ${c.isWebVisible ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'}`}>
                          <Globe className="w-3 h-3"/> Configurar / Web
                        </button>
                      </div>
                    </div>
                  );
                })}
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
                <p className="text-zinc-500 font-medium text-sm">Resumen de horas impartidas y nómina proyectada.</p>
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

            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50 text-[10px] uppercase tracking-widest text-zinc-400 border-b border-zinc-200">
                    <th className="p-4 font-black">Profesor</th>
                    <th className="p-4 font-black text-right">Horas Reales</th>
                    <th className="p-4 font-black text-right">Acumulado (€)</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-medium text-slate-700">
                  {teachersPayroll.length === 0 ? (
                    <tr><td colSpan="3" className="p-8 text-center text-zinc-400 italic">No hay registros de clases para este mes.</td></tr>
                  ) : (
                    teachersPayroll.map((t, idx) => (
                      <tr key={idx} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                        <td className="p-4 font-black uppercase text-slate-900">{t.name}</td>
                        <td className="p-4 text-right font-black">{t.hours} <span className="text-[10px] text-zinc-400 uppercase">h</span></td>
                        <td className="p-4 text-right font-black text-emerald-600">{t.earnings} <span className="text-[10px] text-emerald-400 uppercase">€</span></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {/* --- 7. TABLÓN --- */}
        {activeTab === 'announcements' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="mb-6">
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Tablón de Avisos</h2>
              <p className="text-zinc-500 font-medium text-sm">Publica noticias en el muro de los alumnos.</p>
            </header>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 mb-8">
              <div className="space-y-4">
                <input type="text" placeholder="Titular impactante..." value={newAnnounce.title} onChange={e => setNewAnnounce({...newAnnounce, title: e.target.value})} className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-black outline-none font-black text-sm" />
                <textarea placeholder="Detalles del aviso..." value={newAnnounce.content} onChange={e => setNewAnnounce({...newAnnounce, content: e.target.value})} className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-black outline-none min-h-[100px] resize-y font-medium text-sm" />
                <button onClick={postAnnouncement} className="bg-black text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-zinc-800 shadow-md">
                  <Megaphone className="w-4 h-4"/> Publicar Aviso
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {announcements.map(ann => (
                <div key={ann.id} className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-200 flex justify-between items-start gap-4">
                  <div>
                    <h4 className="font-black text-slate-800 text-md leading-tight">{ann.title}</h4>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">{formatDateSpanish(ann.date)}</p>
                    <p className="text-sm text-zinc-600 line-clamp-2">{ann.content}</p>
                  </div>
                  <button onClick={() => deleteAnnouncement(ann.id)} className="p-2 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg transition-colors shrink-0">
                    <Trash2 className="w-4 h-4"/>
                  </button>
                </div>
              ))}
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
              <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                {(settings.teachersList || []).map((t, i) => (
                  <div key={i} className="flex justify-between items-center p-3 text-xs bg-zinc-50 border border-zinc-100 rounded-xl">
                    <span className="font-black uppercase tracking-widest text-slate-700">{t}</span>
                    <button onClick={() => { const s = {...settings, teachersList: settings.teachersList.filter((_, idx) => idx !== i)}; setSettings(s); saveGlobalSettings(s); }} className="text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors"><Trash2 className="w-4 h-4"/></button>
                  </div>
                ))}
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
