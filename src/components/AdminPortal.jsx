import React, { useState, useEffect, useMemo } from 'react';
import { 
  Inbox, Users, User, Megaphone, Settings, LogOut, Search, MonitorPlay, 
  DoorOpen, Check, X, Trash2, Calendar, FileText, Plus, ShieldAlert, 
  ArrowRightLeft, PartyPopper, Palmtree, Lock, Trophy, Award, Gift, Star, 
  Target, Timer, BookOpen, AlertTriangle, Calculator, ChevronDown, ChevronUp, History, UserMinus, Info, Clock, CheckCircle, Ticket, Pencil, AlertCircle, Ghost
} from 'lucide-react';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, collectionGroup, writeBatch, getDocs, query } from 'firebase/firestore';
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz_MEKpKnv-L1g0e1khYf45nXCQKuUx6ZP3-bYwypTyrYzWadR4yzDd4ambExbQquvo/exec";

const INSTRUMENTOS = ["Guitarra", "Canto", "Teclado", "Batería", "Bajo", "Ukelele", "Armónica", "Sensibilización", "Violín"];
const SEDES = ["Tarragona", "Reus"];
const SALAS = ["Sala 1", "Sala 2", "Sala 3"];

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
  
  const [settings, setSettings] = useState({ 
    festivos: [], vacaciones: [], contract: '', teacherRules: '', hourlyRate: 17.33, generalTasks: [],
    prizes: { trimestral: '', anual: '' },
    teachersList: [] 
  });

  // --- ESTADOS LOCALES UI ---
  const [searchStudent, setSearchStudent] = useState('');
  const [filterStatus, setFilterStatus] = useState('activo');
  const [newAnnounce, setNewAnnounce] = useState({ title: '', content: '' });
  const [expandedTeacher, setExpandedTeacher] = useState(null); 
  const [notesModal, setNotesModal] = useState(null); 
  const [editStudentModal, setEditStudentModal] = useState(null); 
  
  // ESTADOS MODALES CLASES
  const [createClassModal, setCreateClassModal] = useState(false);
  const [changeClassModal, setChangeClassModal] = useState(null);
  const [resurrectClassModal, setResurrectClassModal] = useState(null); // 👇 NUEVO: Modal de resurrección
  const [selectedInstForChange, setSelectedInstForChange] = useState('');
  
  const [newClassData, setNewClassData] = useState({
    isRecurring: true, specificDate: new Date().toISOString().split('T')[0], 
    dayOfWeek: '1', time: '17:00', sede: 'Tarragona', sala: 'Sala 1',
    teacher: '', subject: '', capacity: '', duration: 60, notes: ''
  });

  const [mboxAdminDate, setMboxAdminDate] = useState(new Date().toISOString().split('T')[0]);
  const [mboxAdminSede, setMboxAdminSede] = useState('Tarragona');

  // --- ESTADOS IMPORTADOR MASIVO ---
  const [importText, setImportText] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    let loaded = 0;
    const checkLoad = () => { loaded++; if(loaded === 7) setLoading(false); };

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
      if (docSnap.exists()) setSettings(prev => ({ ...prev, ...docSnap.data() })); 
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

    return () => { unsubGestiones(); unsubStudents(); unsubAnnouncements(); unsubSettings(); unsubClasses(); unsubRecords(); unsubAvail(); };
  }, [appId, db]);

  const isLastDayOfMonth = useMemo(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.getDate() === 1;
  }, []);

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
                  subject: `❌ Baja de alumno: ${studentName} (${c.subject})`,
                  body: `Hola ${c.teacher},\n\nDesde coordinación te informamos que ${studentName} se ha dado de BAJA de tu clase de ${c.subject} (${getDayName(c.dayOfWeek)} a las ${c.time}h).\n\nYa ha sido eliminado de tu lista de asistencia en la App. No debes esperarlo.\n\nUn saludo,\nCoordinación Los Mitos.`
                })
              });
            } catch(e) { console.log("Fallo correo baja", e); }
          }
        }
        
        await updateDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), { status: 'completado' });
        alert(`✅ Baja ejecutada. Profesores avisados por correo. ${studentName} borrado de ${borradas} clases.`);
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
                  subject: `❄️ Alumno congelado: ${studentName} (${c.subject})`,
                  body: `Hola ${c.teacher},\n\nDesde coordinación te informamos que ${studentName} ha CONGELADO su plaza de ${c.subject} (${getDayName(c.dayOfWeek)} a las ${c.time}h) durante este mes.\n\nSaldrá sombreado en azul en tu lista de asistencia. No debes esperarlo.\n\nUn saludo,\nCoordinación Los Mitos.`
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

        let logMessage = `Iniciando proceso para ${studentName}:\n\n`;

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
                    subject: `🔄 Cambio de horario: ${studentName} (${c.subject})`,
                    body: `Hola ${c.teacher},\n\nTe informamos que ${studentName} se ha cambiado de horario y ya NO vendrá a tu clase de ${c.subject} (${getDayName(c.dayOfWeek)} a las ${c.time}h).\n\nLo hemos borrado de tu lista de asistencia. No debes esperarlo.\n\nUn saludo.`
                  })
                });
              } catch(e) {}
            }
          }
        }

        const newStudentPayload = {
          id: studentId,
          name: studentName,
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
          let emailBody = `Hola ${targetClass.teacher},\n\nDesde coordinación hemos añadido a ${studentName} a tu clase de ${targetClass.subject} (${getDayName(targetClass.dayOfWeek)} a las ${targetClass.time}h).\n\nEl alumno ya aparece activo en tu lista de asistencia de la App.\n\nUn saludo,\nCoordinación Los Mitos.`;

          if (type === 'recuperacion') {
            emailSubject = `🔄 Recuperación programada: ${studentName} (${targetClass.subject})`;
            emailBody = `Hola ${targetClass.teacher},\n\nDesde coordinación hemos programado a ${studentName} para recuperar una clase de ${targetClass.subject} contigo el próximo ${formatDateSpanish(recoveryDate)} a las ${targetClass.time}h.\n\nEl sistema es inteligente: el alumno NO aparecerá en tu lista hasta que llegue exactamente ese día.\n\nUn saludo,\nCoordinación Los Mitos.`;
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

  const executeDirectClassChange = async (student, targetClass) => {
    if (!window.confirm(`¿Inscribir a ${student.name} en la clase de ${targetClass.subject} (${getDayName(targetClass.dayOfWeek)} a las ${targetClass.time}h)?\nSe le borrará de cualquier otra clase del mismo instrumento.`)) return;
    
    try {
      const oldClasses = allClasses.filter(c => c.id !== targetClass.id && c.students && c.students.some(s => s.id === student.id) && c.subject === targetClass.subject);
      for (let c of oldClasses) {
        const updatedList = c.students.filter(s => s.id !== student.id);
        if (c.refPath) await updateDoc(doc(db, c.refPath), { students: updatedList });
      }

      const newStudentPayload = {
        id: student.id,
        name: student.name,
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
      for (let i = 0; i < parseInt(num); i++) {
        const ticketId = `gift-${Date.now()}-${i}`;
        promises.push(
          setDoc(doc(db, 'artifacts', appId, 'users', targetUid, 'tickets', ticketId), {
            studentId: student.id,
            studentName: student.name,
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
      console.error(e);
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

  const handleCerrarRetoMensual = async () => {
    const players = students.filter(s => s.triviaPoints > 0).sort((a,b) => b.triviaPoints - a.triviaPoints);
    if(players.length === 0) return alert("Nadie ha jugado este mes.");
    const maxScore = players[0].triviaPoints;
    const winners = players.filter(s => s.triviaPoints === maxScore);
    if(!window.confirm(`¿Confirmas el cierre del mes? Hay ${winners.length} ganadores con ${maxScore} puntos.`)) return;
    try {
      const winnerNames = [];
      const updatePromises = [];
      winners.forEach(w => {
        const nameParts = w.name.split(' ');
        const initial = nameParts.length > 1 ? nameParts[1].charAt(0) + '.' : '';
        winnerNames.push(`${nameParts[0]} ${initial}`);
        updatePromises.push(updateDoc(doc(db, 'artifacts', appId, 'students', w.id), { triviaVictories: (w.triviaVictories || 0) + 1 }));
      });
      players.forEach(p => {
        const currentTotal = p.triviaTotalPoints || 0;
        updatePromises.push(updateDoc(doc(db, 'artifacts', appId, 'students', p.id), { triviaTotalPoints: currentTotal + p.triviaPoints, triviaPoints: 0 }));
      });
      await Promise.all(updatePromises);
      const msg = `¡Felicidades a ${winnerNames.join(', ')} por conseguir la victoria del mes con ${maxScore} aciertos!\n\nTodos los contadores vuelven a cero. ¡El reto de este mes ya ha empezado! Recuerda que el vencedor anual obtendrá premios por fidelidad y mérito.`;
      const id = Date.now().toString();
      await setDoc(doc(db, 'artifacts', appId, 'announcements', id), { title: "🏆 ¡Ganadores del Reto del Mes!", content: msg, date: new Date().toISOString().split('T')[0] });
      alert("Mes cerrado con éxito.");
    } catch (e) { alert("Error al cerrar el mes."); }
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
    const dayKey = newClassData.isRecurring ? newClassData.dayOfWeek : new Date(newClassData.specificDate).getDay().toString();
    const classTime = newClassData.time;
    
    const teacherSlots = availabilities[teacherKey]?.[dayKey] || [];
    const isCovered = teacherSlots.some(slot => classTime >= slot.start && classTime < slot.end);

    if (!isCovered) {
      const confirmForce = window.confirm(`⚠️ AVISO DE DISPONIBILIDAD:\n\nEl profesor ${newClassData.teacher} NO ha marcado estar disponible el ${getDayName(dayKey)} a las ${classTime}h.\n\n¿Quieres FORZAR la creación de la clase de todos modos?`);
      if (!confirmForce) return; 
    }
    
    const teacherEmail = `${newClassData.teacher.toLowerCase().replace(' ', '.')}@escuelalosmitos.com`;
    const existingClass = allClasses.find(c => c.teacher === newClassData.teacher);
    let targetUid = 'admin_generated'; 
    if (existingClass && existingClass.refPath) {
      targetUid = existingClass.refPath.split('/')[3]; 
    } else {
       targetUid = teacherEmail.replace(/[@.]/g, '_');
    }

    try {
      if (newClassData.isRecurring) {
        const classId = Date.now().toString();
        await setDoc(doc(db, 'artifacts', appId, 'users', targetUid, 'recurringClasses', classId), {
          ...newClassData,
          id: classId,
          students: [],
          exceptions: {},
          cancelledDates: [],
          dayOfWeek: parseInt(newClassData.dayOfWeek)
        });
        alert(`✅ Clase RECURRENTE de ${newClassData.subject} asignada a ${newClassData.teacher} correctamente.`);
      } else {
        const subId = `extra-${Date.now()}`;
        await setDoc(doc(db, 'artifacts', appId, 'substitutions', subId), {
          originalClassId: 'extra',
          originalTeacherUid: targetUid,
          originalTeacherName: newClassData.teacher,
          date: newClassData.specificDate,
          time: newClassData.time,
          sede: newClassData.sede || 'Tarragona',
          sala: newClassData.sala || 'Sala 1',
          subject: newClassData.subject,
          capacity: newClassData.capacity || '',
          duration: newClassData.duration || 60,
          notes: 'Clase puntual creada por coordinación',
          students: []
        });
        alert(`✅ Clase PUNTUAL de ${newClassData.subject} creada para el ${formatDateSpanish(newClassData.specificDate)}.\n\nAparecerá en el Tablón de Sustituciones de la App para que el profesor le dé a "Asumir Clase" ese día.`);
      }

      setCreateClassModal(false);
      setNewClassData({ isRecurring: true, specificDate: new Date().toISOString().split('T')[0], dayOfWeek: '1', time: '17:00', sede: 'Tarragona', sala: 'Sala 1', teacher: '', subject: '', capacity: '', duration: 60, notes: '' });
    } catch (e) {
      alert("Error al crear la clase.");
    }
  };

  // --- IMPORTADOR MASIVO DESDE EXCEL ---
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
  const rankAnnual = students.filter(s => s.triviaVictories > 0).sort((a,b) => b.triviaVictories - a.triviaVictories).slice(0,10);
  const rankGlobal = students.filter(s => (s.triviaTotalPoints || 0) + (s.triviaPoints || 0) > 0)
    .map(s => ({ ...s, liveTotal: (s.triviaTotalPoints || 0) + (s.triviaPoints || 0) }))
    .sort((a,b) => b.liveTotal - a.liveTotal).slice(0,10);

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
      if (activeCount === 0) return true; // 👇 SIEMPRE MUESTRA LAS HIBERNADAS
      const cap = parseInt(c.capacity) || 0;
      if (cap <= 1) return false; 
      return activeCount <= (cap / 2);
    }).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.time.localeCompare(b.time));
  }, [allClasses]);

  const teachersPayroll = useMemo(() => {
    const currentMonth = new Date().toISOString().substring(0, 7);
    const thisMonthRecords = allRecords.filter(r => r.date.startsWith(currentMonth) && !r.isRenounced);
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
  }, [allRecords, settings.hourlyRate]);

  const availableMboxSlotsAdmin = useMemo(() => {
    let slots = [];
    if (mboxAdminDate && mboxAdminSede) {
      const targetDay = new Date(`${mboxAdminDate}T00:00:00`).getDay();
      const allScheduledClasses = allClasses.filter(c => c.dayOfWeek === targetDay && (c.sede || 'Tarragona') === mboxAdminSede);

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
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
      if (!name.trim()) return alert("El nombre es obligatorio.");
      setSaving(true);
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'students', editStudentModal.id), { 
          name: name.trim(), 
          email: email.toLowerCase().trim() 
        });

        const classesWithStudent = allClasses.filter(c => c.students && c.students.some(s => s.id === editStudentModal.id));
        const batch = writeBatch(db);
        
        classesWithStudent.forEach(c => {
          const updatedList = c.students.map(s => 
            s.id === editStudentModal.id ? { ...s, name: name.trim(), email: email.toLowerCase().trim() } : s
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
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Nombre del alumno</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-black transition-colors" />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Correo Electrónico (Acceso App)</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="vacio@sin-correo.com" className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none focus:border-black transition-colors" />
              {!email && <p className="text-[10px] text-rose-500 font-bold mt-1">⚠️ Sin correo, el alumno no podrá entrar a la App.</p>}
            </div>
          </div>

          <button onClick={handleSave} disabled={saving} className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-800 transition-all shadow-md disabled:opacity-50">
            {saving ? 'Guardando cambios...' : 'Guardar Datos'}
          </button>
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
                {INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}
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
              <label className="text-[10px] font-black uppercase text-zinc-500 mb-1 block">Minutos</label>
              <input type="number" step="5" min="15" value={newClassData.duration} onChange={e => setNewClassData({...newClassData, duration: e.target.value})} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl font-bold text-sm outline-none" />
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
            {INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}
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

  // 👇 NUEVO MODAL: RESURRECCIÓN DE CLASE 👇
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
          name: searchName.trim(),
          email: email.trim().toLowerCase(),
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
              {/* Autocomplete sugerencias */}
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

  if (loading) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center font-black uppercase tracking-widest">Iniciando Modo Dios...</div>;

  return (
    <div className="min-h-screen bg-zinc-100 font-sans text-slate-800 flex flex-col md:flex-row">
      {notesModal && <NotesModalOverlay />}
      {createClassModal && <CreateClassModalOverlay />}
      {changeClassModal && <ChangeClassModalOverlay />}
      {editStudentModal && <EditStudentModalOverlay />} 
      {resurrectClassModal && <ResurrectClassModalOverlay />}
      
      {/* SIDEBAR NAVEGACIÓN */}
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

        {/* --- 1. BANDEJA DE GESTIONES --- */}
        {activeTab === 'gestiones' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="mb-6">
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Bandeja de Entrada</h2>
              <p className="text-zinc-500 font-medium text-sm">Gestiona las solicitudes de los alumnos.</p>
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
                            <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${g.type.includes('mitobox') ? 'bg-blue-100 text-blue-800' : g.type.includes('baja') ? 'bg-red-100 text-red-800' : 'bg-zinc-200 text-zinc-800'}`}>
                              {g.type.replace('_', ' ')}
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
                                {g.type.replace('_', ' ')}
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
                  {['activo', 'congelado', 'baja'].map((s) => (
                    <button
                      key={s}
                      onClick={() => setFilterStatus(s)}
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterStatus === s ? 'bg-black text-white' : 'text-zinc-400 hover:text-black'}`}
                    >
                      {s}s
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
                      <th className="p-4 font-black text-center w-[15%]">Extras</th>
                      <th className="p-4 font-black text-center w-[30%]">Acciones Dios</th>
                      <th className="p-4 font-black text-right w-[25%]">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-medium text-slate-700">
                    {(() => {
                      const filtered = students.filter(s => {
                        const matchSearch = s.name.toLowerCase().includes(searchStudent.toLowerCase());
                        const currentStatus = s.globalStatus || 'activo';
                        const matchStatus = currentStatus === filterStatus;
                        return matchSearch && matchStatus;
                      });

                      if (filtered.length === 0) {
                        return <tr><td colSpan="5" className="p-12 text-center text-zinc-400 italic">No hay alumnos en esta lista.</td></tr>;
                      }

                      return filtered.map(student => (
                        <tr key={student.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                          <td className="p-4 overflow-hidden">
                            <div className="font-black text-slate-900 truncate max-w-[150px] lg:max-w-[200px]" title={student.name}>{student.name}</div>
                            <div className="text-[10px] text-zinc-400 font-bold truncate max-w-[150px] lg:max-w-[200px]" title={student.email}>{student.email}</div>
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
                            </div>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => setEditStudentModal(student)} className="flex items-center gap-1 p-2 bg-zinc-100 text-zinc-600 rounded-lg hover:bg-black hover:text-white transition-colors text-[10px] font-black uppercase tracking-widest" title="Editar datos del alumno">
                                <Pencil className="w-3 h-3"/> Editar
                              </button>
                              <button onClick={() => setChangeClassModal(student)} className="flex items-center gap-1 p-2 bg-zinc-800 text-white rounded-lg hover:bg-black transition-colors text-[10px] font-black uppercase tracking-widest" title="Cambiar a otra clase manualmente">
                                <ArrowRightLeft className="w-3 h-3"/> Mover
                              </button>
                              <button onClick={() => grantRecoveryTicket(student)} className="flex items-center gap-1 p-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors text-[10px] font-black uppercase tracking-widest" title="Regalar Ticket de Recuperación">
                                <Gift className="w-3 h-3"/> Ticket
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

        {/* --- 4. CLASES POR PROFESOR (CON DETECCIÓN DE HIBERNACIÓN) --- */}
        {activeTab === 'classes' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Mapa de Clases</h2>
                <p className="text-zinc-500 font-medium text-sm">Visión global de todos los grupos activos por profesor.</p>
              </div>
              <button onClick={() => setCreateClassModal(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg flex items-center gap-2 transition-colors">
                <Plus className="w-4 h-4"/> Crear Clase
              </button>
            </header>

            <div className="space-y-4">
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
                          <h3 className="font-black text-lg uppercase tracking-tight text-slate-800">{teacher}</h3>
                          <span className="bg-zinc-200 text-zinc-600 px-2 py-0.5 rounded text-xs font-black">{classes.length} Clases</span>
                        </div>
                        {isExpanded ? <ChevronUp className="w-5 h-5 text-zinc-400"/> : <ChevronDown className="w-5 h-5 text-zinc-400"/>}
                      </button>
                      
                      {isExpanded && (
                        <div className="p-4 border-t border-zinc-200">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {classes.map(c => {
                              const activeC = (c.students || []).filter(s => !s.isPaused).length;
                              const isHibernated = activeC === 0;

                              return (
                                <div key={c.id} className={`p-4 rounded-xl border ${isHibernated ? 'bg-zinc-50 border-dashed border-zinc-300' : 'border-zinc-100 bg-white'} shadow-sm flex justify-between items-center relative group transition-colors`}>
                                  <div>
                                    <div className={`font-black text-sm uppercase flex items-center ${isHibernated ? 'text-zinc-400' : ''}`}>
                                      {isHibernated && <Ghost className="w-4 h-4 mr-1 text-zinc-400" />}
                                      {c.date ? formatDateSpanish(c.date) : getDayName(c.dayOfWeek)} 
                                      <span className="text-black bg-zinc-100 px-1.5 py-0.5 rounded ml-1">{c.time}</span>
                                    </div>
                                    <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">
                                      {c.subject} • {c.sede} {c.date && <span className="text-amber-500 ml-1">(PUNTUAL)</span>}
                                    </div>
                                  </div>
                                  
                                  <div className="text-right pr-6">
                                    {isHibernated ? (
                                      <button onClick={() => setResurrectClassModal(c)} className="bg-indigo-100 text-indigo-700 hover:bg-indigo-600 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-1 shadow-sm">
                                        <PlusCircle className="w-3 h-3"/> Reactivar
                                      </button>
                                    ) : (
                                      <>
                                        <span className={`text-sm font-black ${activeC >= (c.capacity || 4) ? 'text-emerald-500' : 'text-amber-500'}`}>
                                          {activeC} / {c.capacity || '?'}
                                        </span>
                                        <div className="text-[9px] uppercase font-bold text-zinc-400 tracking-widest">Alumnos</div>
                                      </>
                                    )}
                                  </div>

                                  <button onClick={() => {if(window.confirm('¿Borrar definitivamente esta clase oficial de la escuela?')) deleteDoc(doc(db, c.refPath))}} className="absolute top-2 right-2 p-1.5 bg-red-100 text-red-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3 h-3"/></button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* --- 5. CLASES EN PELIGRO (INCLUYE HIBERNADAS) --- */}
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
                    <div key={c.id} className={`p-5 rounded-2xl border-2 shadow-sm ${isHibernated ? 'bg-zinc-50 border-dashed border-zinc-300' : isCritical ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                      <div className="flex justify-between items-start mb-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${isHibernated ? 'bg-zinc-200 text-zinc-500' : isCritical ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'}`}>
                          {isHibernated ? 'Hibernada' : isCritical ? 'Crítico' : 'Revisar'}
                        </span>
                        {isHibernated ? <Ghost className="w-5 h-5 text-zinc-400"/> : <span className="font-black text-lg">{activeC} / {c.capacity}</span>}
                      </div>
                      <h4 className="font-black uppercase tracking-tight text-slate-900">{c.subject}</h4>
                      <p className="text-xs font-bold text-slate-600 mb-2">{getDayName(c.dayOfWeek)} a las {c.time}h</p>
                      <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 bg-white/50 px-2 py-1 rounded inline-block">Prof: {c.teacher}</div>
                      
                      {isHibernated && (
                         <button onClick={() => setResurrectClassModal(c)} className="w-full mt-4 bg-zinc-800 text-white font-black py-2 rounded-lg text-[10px] uppercase tracking-widest hover:bg-black transition-colors flex items-center justify-center gap-1">
                           <PlusCircle className="w-3 h-3"/> Reactivar Grupo
                         </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* --- 6. PROFESORES (NÓMINAS) --- */}
        {activeTab === 'teachers' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Estado de Profesores</h2>
                <p className="text-zinc-500 font-medium text-sm">Resumen de horas impartidas y nómina proyectada del mes actual.</p>
              </div>
              <div className="bg-white border border-zinc-200 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest text-zinc-500 shadow-sm">
                Mes en curso: <span className="text-black">{new Date().toLocaleString('es-ES', { month: 'long' })}</span>
              </div>
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
                    <tr><td colSpan="3" className="p-8 text-center text-zinc-400 italic">No hay registros de clases este mes.</td></tr>
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

        {/* --- 8. GAMIFICACIÓN --- */}
        {activeTab === 'gamification' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Retos y Rankings</h2>
                <p className="text-zinc-500 font-medium text-sm">Gestiona la competición del trivial.</p>
              </div>
              <button onClick={handleCerrarRetoMensual} className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs flex items-center gap-2 shadow-md transition-colors">
                <Award className="w-4 h-4"/> Cerrar Mes
              </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-amber-200 flex flex-col h-96">
                <div className="bg-amber-50 p-4 border-b border-amber-100 flex items-center justify-between"><h3 className="font-black uppercase tracking-tight text-amber-900 flex items-center gap-2"><Timer className="w-4 h-4"/> Mensual</h3><span className="bg-amber-200 text-amber-800 px-2 py-0.5 rounded text-[10px] font-black uppercase animate-pulse">En curso</span></div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar bg-amber-50/20">
                  {rankMonthly.map((s, i) => (
                    <div key={s.id} className="flex items-center justify-between p-2 bg-white border border-amber-100 rounded-lg shadow-sm">
                      <div className="flex items-center gap-2"><span className={`font-black w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-slate-300 text-white' : i === 2 ? 'bg-amber-700 text-white' : 'text-zinc-400'}`}>{i+1}</span><span className="font-bold text-xs text-slate-700 truncate">{s.name.split(' ')[0]}</span></div>
                      <span className="font-black text-amber-600 text-xs">{s.triviaPoints}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-indigo-200 flex flex-col h-96">
                <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex items-center justify-between"><h3 className="font-black uppercase tracking-tight text-indigo-900 flex items-center gap-2"><Star className="w-4 h-4"/> Anual</h3></div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar bg-indigo-50/20">
                  {rankAnnual.map((s, i) => (
                    <div key={s.id} className="flex items-center justify-between p-2 bg-white border border-indigo-100 rounded-lg shadow-sm">
                      <div className="flex items-center gap-2"><span className={`font-black w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${i === 0 ? 'bg-indigo-500 text-white' : 'text-zinc-400'}`}>{i+1}</span><span className="font-bold text-xs text-slate-700 truncate">{s.name.split(' ')[0]}</span></div>
                      <span className="font-black text-indigo-600 text-xs">{s.triviaVictories} <span className="text-[8px] uppercase">Vic.</span></span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-zinc-900 rounded-2xl shadow-sm border border-zinc-800 flex flex-col h-96">
                <div className="bg-black p-4 border-b border-zinc-800 flex items-center justify-between"><h3 className="font-black uppercase tracking-tight text-white flex items-center gap-2"><Target className="w-4 h-4 text-zinc-400"/> Global</h3></div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar bg-zinc-900/50">
                  {rankGlobal.map((s, i) => (
                    <div key={s.id} className="flex items-center justify-between p-2 bg-zinc-800 border border-zinc-700 rounded-lg">
                      <div className="flex items-center gap-2"><span className="font-black text-zinc-500 text-[10px] w-3">{i+1}.</span><span className="font-bold text-xs text-zinc-300 truncate">{s.name.split(' ')[0]}</span></div>
                      <span className="font-black text-white text-xs">{s.liveTotal} <span className="text-[8px] text-zinc-500 uppercase">pts</span></span>
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

        {/* --- 9. SETTINGS --- */}
        {activeTab === 'settings' && (
          <div className="space-y-6 animate-in fade-in">
             <header className="mb-6">
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Configuración</h2>
              <p className="text-zinc-500 font-medium text-sm">Ajustes globales y legales de la escuela.</p>
            </header>
            
            {/* 1. CALENDARIO ESCOLAR */}
            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 mb-4 flex items-center gap-2"><Calendar className="w-5 h-5 text-black"/> Calendario Escolar</h3>
              <div className="flex flex-col sm:flex-row gap-2 mb-6">
                <input id="adminDateInput" type="date" className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none font-bold text-sm" />
                <select id="adminDateType" className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none font-bold text-xs uppercase">
                  <option value="festivo">Festivo</option>
                  <option value="vacacion">Vacaciones</option>
                </select>
                <button onClick={() => { const d = document.getElementById('adminDateInput').value; const t = document.getElementById('adminDateType').value; if(d) { const arr = t === 'festivo' ? (settings.festivos||[]) : (settings.vacaciones||[]); if(!arr.includes(d)) { const s = {...settings, [t === 'festivo' ? 'festivos' : 'vacaciones']: [...arr, d]}; setSettings(s); saveGlobalSettings(s); } } }} className="bg-black text-white px-6 py-3 rounded-xl shadow-md font-black uppercase text-[10px] hover:bg-zinc-800 transition-colors"><Plus className="w-4 h-4 inline"/></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-black text-amber-600 uppercase tracking-widest text-[10px] mb-2 flex items-center gap-1"><PartyPopper className="w-3 h-3"/> Festivos</h4>
                  <div className="space-y-1">
                    {settings.festivos?.sort().map(f => (
                      <div key={f} className="flex justify-between items-center p-2 bg-amber-50 rounded-lg text-xs font-bold text-amber-900">{formatDateSpanish(f)} <button onClick={() => {const s = {...settings, festivos: settings.festivos.filter(x => x !== f)}; setSettings(s); saveGlobalSettings(s);}} className="p-1 hover:bg-amber-100 rounded transition-colors"><Trash2 className="w-3 h-3 text-amber-500 hover:text-red-500"/></button></div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-black text-emerald-600 uppercase tracking-widest text-[10px] mb-2 flex items-center gap-1"><Palmtree className="w-3 h-3"/> Vacaciones</h4>
                  <div className="space-y-1">
                    {settings.vacaciones?.sort().map(v => (
                      <div key={v} className="flex justify-between items-center p-2 bg-emerald-50 rounded-lg text-xs font-bold text-emerald-900">{formatDateSpanish(v)} <button onClick={() => {const s = {...settings, vacaciones: settings.vacaciones.filter(x => x !== v)}; setSettings(s); saveGlobalSettings(s);}} className="p-1 hover:bg-emerald-100 rounded transition-colors"><Trash2 className="w-3 h-3 text-emerald-500 hover:text-red-500"/></button></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 2. PLANTILLA DE PROFESORES */}
            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 mb-4 flex items-center gap-2"><User className="w-5 h-5 text-black"/> Plantilla de Profesores</h3>
              <div className="flex gap-2 mb-4">
                <input id="adminTeacherInput" type="text" placeholder="Ej: Tano" className="flex-1 p-3 text-sm bg-zinc-50 border border-zinc-200 outline-none rounded-xl font-bold" />
                <button onClick={() => { 
                  const val = document.getElementById('adminTeacherInput').value.trim(); 
                  if(val) { 
                    const s = {...settings, teachersList: [...(settings.teachersList||[]), val]}; 
                    setSettings(s); 
                    saveGlobalSettings(s); 
                    document.getElementById('adminTeacherInput').value = ''; 
                  } 
                }} className="bg-black text-white px-6 rounded-xl font-black uppercase text-[10px] hover:bg-zinc-800 transition-colors"><Plus className="w-4 h-4"/></button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                {(settings.teachersList || []).map((t, i) => (
                  <div key={i} className="flex justify-between items-center p-3 text-xs bg-zinc-50 border border-zinc-100 rounded-xl">
                    <span className="font-black uppercase tracking-widest text-slate-700">{t}</span>
                    <button onClick={() => { 
                      const s = {...settings, teachersList: settings.teachersList.filter((_, idx) => idx !== i)}; 
                      setSettings(s); 
                      saveGlobalSettings(s); 
                    }} className="text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors"><Trash2 className="w-4 h-4"/></button>
                  </div>
                ))}
              </div>
            </div>

            {/* 3 & 4. TAREAS Y TARIFA (GRID) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex flex-col h-full">
                <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 mb-4 flex items-center gap-2"><Check className="w-5 h-5 text-black"/> Tareas de Hora Muerta</h3>
                <div className="flex gap-2 mb-4">
                  <input id="adminTaskInput" type="text" placeholder="Ej: Ordenar partituras..." className="flex-1 p-3 text-sm bg-zinc-50 border border-zinc-200 outline-none rounded-xl font-medium" />
                  <button onClick={() => { const val = document.getElementById('adminTaskInput').value; if(val) { const s = {...settings, generalTasks: [...(settings.generalTasks||[]), val]}; setSettings(s); saveGlobalSettings(s); document.getElementById('adminTaskInput').value = ''; } }} className="bg-black text-white px-4 rounded-xl font-bold uppercase text-[10px] hover:bg-zinc-800 transition-colors"><Plus className="w-4 h-4"/></button>
                </div>
                <div className="space-y-2 max-h-32 overflow-y-auto pr-2 flex-1">
                  {settings.generalTasks?.map((t, i) => (
                    <div key={i} className="flex justify-between items-center p-2.5 text-xs bg-zinc-50 border border-zinc-100 rounded-xl">
                      <span className="font-medium text-slate-600">{t}</span>
                      <button onClick={() => { const s = {...settings, generalTasks: settings.generalTasks.filter((_, idx) => idx !== i)}; setSettings(s); saveGlobalSettings(s); }} className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors"><Trash2 className="w-3 h-3"/></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm flex flex-col h-full">
                <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 mb-4 flex items-center gap-2"><Lock className="w-5 h-5 text-black"/> Salario Convenio</h3>
                <p className="text-xs text-zinc-500 font-medium mb-6">Precio por hora base utilizado para el cálculo en las nóminas estimadas de los profesores.</p>
                <div className="flex items-center gap-4 bg-zinc-50 p-5 rounded-2xl border border-zinc-200 mt-auto">
                  <input type="number" step="0.01" value={settings.hourlyRate} onChange={e => setSettings({...settings, hourlyRate: e.target.value})} className="text-2xl font-black w-24 p-1 border-b-2 border-black outline-none bg-transparent" />
                  <span className="text-xl font-bold text-slate-800">€ / hora</span>
                  <button onClick={() => saveGlobalSettings(settings)} className="ml-auto bg-black hover:bg-zinc-800 text-white px-5 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-sm transition-colors">Guardar</button>
                </div>
              </div>
            </div>

            {/* 5. NORMATIVA PARA PROFESORES */}
            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-600"/> Normativa para Profesores</h3>
              <p className="text-xs text-zinc-500 font-medium mb-4">Este reglamento aparecerá disponible en el panel de los profesores (App Profesores) para su consulta.</p>
              <textarea value={settings.teacherRules || ''} onChange={e => setSettings({...settings, teacherRules: e.target.value})} className="w-full p-5 bg-indigo-50/30 border border-indigo-100 rounded-2xl outline-none font-medium text-sm text-slate-700 min-h-[200px] resize-y mb-4" placeholder="Escribe aquí el reglamento interno, horarios, protocolos..." />
              <button onClick={() => saveGlobalSettings(settings)} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 shadow-md hover:bg-indigo-700 transition-colors">
                Guardar Normativa Profesores
              </button>
            </div>

            {/* 6. CONTRATO DE PRESTACIÓN DE SERVICIOS (ALUMNOS) */}
            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-black"/> Contrato de Servicios (Alumnos)</h3>
              <p className="text-xs text-zinc-500 font-medium mb-4">Texto legal visible en la pestaña Gestiones del Portal del Alumno.</p>
              <textarea value={settings.contract || ''} onChange={e => setSettings({...settings, contract: e.target.value})} className="w-full p-5 bg-zinc-50 border border-zinc-200 rounded-2xl outline-none font-medium text-sm text-slate-700 min-h-[200px] resize-y mb-4" placeholder="Pega aquí el contrato completo..." />
              <button onClick={() => saveGlobalSettings(settings)} className="bg-black text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 shadow-sm hover:bg-zinc-800 transition-colors">
                Guardar Contrato Alumnos
              </button>
            </div>

            {/* 7. MANTENIMIENTO DE BASE DE DATOS */}
            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm mt-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 mb-4 flex items-center gap-2"><Trash2 className="w-5 h-5 text-red-600"/> Mantenimiento del Sistema</h3>
              <p className="text-sm text-zinc-500 font-medium mb-6">Pulsa este botón una o dos veces al año para eliminar los tickets de recuperación caducados y mantener la base de datos rápida y optimizada.</p>
              
              <button 
                onClick={cleanExpiredTickets} 
                className="bg-red-50 hover:bg-red-100 text-red-700 px-6 py-4 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-sm transition-colors w-full sm:w-max border border-red-200"
              >
                <Trash2 className="w-4 h-4"/> Purgar Tickets Caducados
              </button>
            </div>

            {/* 8. IMPORTADOR MASIVO DE TADOSI */}
            <div className="bg-white p-6 rounded-3xl border border-zinc-200 shadow-sm mt-6">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800 mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-indigo-600"/> Importador Masivo (Excel)</h3>
              <p className="text-sm text-zinc-500 font-medium mb-4">Copia dos columnas de tu Excel (<strong>Nombre</strong> y <strong>Email</strong>) y pégalas en este cuadro de texto. El sistema creará sus perfiles base automáticamente.</p>
              
              <textarea 
                value={importText} 
                onChange={(e) => setImportText(e.target.value)} 
                placeholder="Pega aquí las filas del Excel..." 
                className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-2xl outline-none font-mono text-xs text-slate-700 min-h-[150px] resize-y mb-4 whitespace-pre"
              />
              
              <button 
                onClick={handleMassImport} 
                disabled={isImporting || !importText}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-4 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-sm transition-colors w-full sm:w-max disabled:opacity-50"
              >
                {isImporting ? 'Importando...' : 'Importar Alumnos Ahora'}
              </button>
            </div>

          </div>
        )}

      </main>
    </div>
  );
}
