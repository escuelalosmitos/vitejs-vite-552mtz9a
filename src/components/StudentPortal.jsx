import React, { useState, useEffect } from 'react';
import { Music, LogOut, Calendar, Ticket, Info, MessageSquare, LayoutGrid, AlertCircle, CheckCircle, User, ArrowRight, MapPin, X, Clock, FileText, Check, Bell, Megaphone, Snowflake, RefreshCcw, PlusCircle, UserMinus, Send, Mail, Sun, Sparkles, MonitorPlay, DoorOpen, Star, Trophy, Timer } from 'lucide-react';
import { collection, query, where, getDocs, getDoc, doc, setDoc, updateDoc, collectionGroup, onSnapshot } from 'firebase/firestore';

const INSTRUMENTOS = ["Guitarra", "Canto", "Teclado", "Batería", "Bajo", "Ukelele", "Armónica", "Combo", "Sensibilización", "Violín"];

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

const formatDateSpanish = (dateString) => {
  if (!dateString) return '';
  return dateString.split('-').reverse().join('/');
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

// HELPER: Calcula los meses para las gestiones
const getMonthNames = () => {
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const nextNextMonth = new Date(today.getFullYear(), today.getMonth() + 2, 1);
  
  return {
    next: nextMonth.toLocaleString('es-ES', { month: 'long' }),
    nextNext: nextNextMonth.toLocaleString('es-ES', { month: 'long' }),
    isLate: today.getDate() > 20 // Del 21 en adelante es tarde
  };
};

export default function StudentPortal({ user, logout, db, appId }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [myClasses, setMyClasses] = useState([]);
  const [allClasses, setAllClasses] = useState([]); 
  const [schoolCalendar, setSchoolCalendar] = useState([]); 
  const [announcements, setAnnouncements] = useState([]); 
  const [myGestiones, setMyGestiones] = useState([]); 
  const [activeTab, setActiveTab] = useState('home');
  const [notification, setNotification] = useState(null);

  const [absenceModal, setAbsenceModal] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [showContract, setShowContract] = useState(false); 
  const [contractText, setContractText] = useState(''); 
  const [onboarding, setOnboarding] = useState({ name: '', instrument: 'Guitarra', classId: '' });
  const [healthCheck, setHealthCheck] = useState(false); 

  // ESTADOS PARA GESTIONES GLOBALES
  const [gestionModal, setGestionModal] = useState(null);
  const [gestionText, setGestionText] = useState('');
  const [selectedInst, setSelectedInst] = useState('');
  const [selectedNewClass, setSelectedNewClass] = useState(null);
  const [acceptLatePenalty, setAcceptLatePenalty] = useState(false);
  const [isSendingGestion, setIsSendingGestion] = useState(false);

  // ESTADOS PARA MITOBOX
  const [mitoboxModal, setMitoboxModal] = useState(false);
  const [mboxDate, setMboxDate] = useState('');
  const [mboxSede, setMboxSede] = useState('Tarragona');
  const [mboxInst, setMboxInst] = useState('');
  const [mboxSelectedSlot, setMboxSelectedSlot] = useState(null);

  // ESTADOS PARA TRIVIA (RETO DIARIO)
  const [triviaModal, setTriviaModal] = useState(false);
  const [triviaTime, setTriviaTime] = useState(10);
  const [triviaSelected, setTriviaSelected] = useState(null);
  const [triviaResult, setTriviaResult] = useState(null); // 'win', 'lose', 'timeout'

  const timeRules = getMonthNames();
  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    checkRegistration();
    fetchAllClassesAndCalendar();
    fetchContractText();

    const unsubAnnouncements = onSnapshot(collection(db, 'artifacts', appId, 'announcements'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setAnnouncements(data);
    });

    return () => unsubAnnouncements();
  }, [user.email]);

  useEffect(() => {
    if (!profile?.id) return;
    
    const unsubProfile = onSnapshot(doc(db, 'artifacts', appId, 'students', profile.id), (docSnap) => {
      if (docSnap.exists()) {
        setProfile(prev => ({ ...prev, ...docSnap.data() }));
      }
    });

    const q = query(collection(db, 'artifacts', appId, 'gestiones'), where('studentId', '==', profile.id));
    const unsubGestiones = onSnapshot(q, (snapshot) => {
      setMyGestiones(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubProfile();
      unsubGestiones();
    };
  }, [profile?.id, db, appId]);

  // LÓGICA DEL TEMPORIZADOR DEL RETO DIARIO
  useEffect(() => {
    let timer;
    if (triviaModal && triviaTime > 0 && triviaResult === null) {
      timer = setInterval(() => {
        setTriviaTime(prev => prev - 1);
      }, 1000);
    } else if (triviaTime === 0 && triviaResult === null) {
      handleTriviaAnswer(-1); // Tiempo agotado
    }
    return () => clearInterval(timer);
  }, [triviaModal, triviaTime, triviaResult]);

  const showToast = (msg, type = 'success') => {
    setNotification({ text: msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchContractText = async () => {
    try {
      const docSnap = await getDoc(doc(db, 'artifacts', appId, 'settings', 'global'));
      if (docSnap.exists() && docSnap.data().contract) {
        setContractText(docSnap.data().contract);
      } else {
        setContractText('El contrato de prestación de servicios aún no está disponible online. Por favor, contacta con administración.');
      }
    } catch (e) {
      console.log("Error cargando el contrato", e);
    }
  };

  const fetchAllClassesAndCalendar = async () => {
    try {
      const classesQuery = collectionGroup(db, 'recurringClasses');
      const classesSnap = await getDocs(classesQuery);
      const classesList = [];
      classesSnap.forEach(doc => {
        classesList.push({ id: doc.id, refPath: doc.ref.path, ...doc.data() });
      });
      setAllClasses(classesList);

      const calSnap = await getDocs(collection(db, 'artifacts', appId, 'calendar'));
      const calList = calSnap.docs.map(d => d.data());
      setSchoolCalendar(calList);
    } catch (e) {
      console.log("No se pudo cargar calendario/clases extra");
    }
  };

  const checkRegistration = async () => {
    setLoading(true);
    const q = query(collection(db, 'artifacts', appId, 'students'), where("email", "==", user.email));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const studentData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
      setProfile(studentData);
      
      if (studentData.claimed) {
        await fetchRealStudentData(studentData.id);
      }
    }
    setLoading(false);
  };

  const fetchRealStudentData = async (studentId) => {
    try {
      const classesQuery = collectionGroup(db, 'recurringClasses');
      const classesSnap = await getDocs(classesQuery);
      
      const foundClasses = [];
      classesSnap.forEach(doc => {
        const data = doc.data();
        if (data.students && data.students.some(s => s.id === studentId)) {
          foundClasses.push({ id: doc.id, refPath: doc.ref.path, ...data });
        }
      });
      setMyClasses(foundClasses);

      const ticketsQuery = collectionGroup(db, 'tickets');
      const ticketsSnap = await getDocs(ticketsQuery);
      
      let validTicketsCount = 0;
      ticketsSnap.forEach(doc => {
        const data = doc.data();
        if (data.studentId === studentId && !data.isUsed) {
          validTicketsCount++;
        }
      });
      
      setProfile(prev => ({ ...prev, activeTickets: validTicketsCount }));

    } catch (error) {
      console.error("Error buscando datos:", error);
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
    await fetchRealStudentData(studentId);
  };

  const openAbsenceModal = (clase) => {
    const info = getNextClassInfo(clase.dayOfWeek, clase.time);
    setHealthCheck(false); 
    setAbsenceModal({ clase, ...info });
  };

  const confirmAbsence = async (wantsTicket) => {
    if (!absenceModal || !profile) return;
    const status = (absenceModal.diffHours >= 16 && wantsTicket) ? 'notified' : 'notified_no_ticket';
    try {
      const classRef = doc(db, absenceModal.clase.refPath);
      await setDoc(classRef, { exceptions: { [absenceModal.dateStr]: { [profile.id]: status } } }, { merge: true });
      setAbsenceModal(null);
      showToast('Aviso enviado correctamente al profesor.');
      await fetchRealStudentData(profile.id);
    } catch (error) {
      showToast('Error al enviar el aviso.', 'error');
    }
  };

  const sendGestion = async () => {
    const isTicketRedemption = gestionModal.type === 'recuperacion';
    
    if (!isTicketRedemption && timeRules.isLate && !acceptLatePenalty) {
      showToast('Debes aceptar las condiciones de plazo marcando la casilla.', 'error');
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
        targetMonth: (!isTicketRedemption && timeRules.isLate) ? timeRules.nextNext : timeRules.next,
        isLateRequest: !isTicketRedemption && timeRules.isLate,
        status: 'pendiente',
        date: new Date().toISOString()
      };

      await setDoc(doc(db, 'artifacts', appId, 'gestiones', gestionId), payload);
      setGestionModal(null);
      setGestionText('');
      setSelectedNewClass(null);
      setAcceptLatePenalty(false);
      showToast('Solicitud enviada a Administración.');
    } catch (error) {
      showToast('Error al enviar la solicitud.', 'error');
    } finally {
      setIsSendingGestion(false);
    }
  };

  // --- FUNCIONES EXTRAS (MITOBOX / MITOVERSO) ---
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
      setMitoboxModal(false);
      setMboxDate('');
      setMboxSelectedSlot(null);
      setMboxInst('');
      showToast('Reserva de sala enviada. Espera confirmación.');
    } catch (e) {
      showToast('Error al reservar sala.', 'error');
    } finally {
      setIsSendingGestion(false);
    }
  };

  // --- LÓGICA DE TRIVIA ---
  // Multiplicamos por 137 (número primo) para que salte de categoría cada día sin repetir ninguna en todo el año.
const dailyQuestionIndex = (getDayOfYear() * 137) % TRIVIA_QUESTIONS.length;
  const currentQuestion = TRIVIA_QUESTIONS[dailyQuestionIndex];
  const hasPlayedToday = profile?.triviaLastPlayed === todayStr;

  const startTrivia = () => {
    setTriviaSelected(null);
    setTriviaResult(null);
    setTriviaTime(10);
    setTriviaModal(true);
  };

  const handleTriviaAnswer = async (index) => {
    if (triviaResult !== null) return;
    setTriviaSelected(index);
    
    let isCorrect = index === currentQuestion.correct;
    let newResult = isCorrect ? 'win' : (index === -1 ? 'timeout' : 'lose');
    setTriviaResult(newResult);
    
    let newPoints = profile.triviaPoints || 0;
    if (isCorrect) newPoints += 1;

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'students', profile.id), {
        triviaLastPlayed: todayStr,
        triviaPoints: newPoints
      });
    } catch (e) { console.error("Error guardando trivia", e); }

    setTimeout(() => {
      setTriviaModal(false);
    }, 2500); 
  };


  const pendingAbsences = [];
  const pendingProcedures = myGestiones.filter(g => g.status === 'pendiente' && g.type !== 'alta_mitobox'); 
  
  if (profile) {
    myClasses.forEach(clase => {
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

  const AbsenceModalOverlay = () => {
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
              <p>2. <strong className="text-black">Caducidad:</strong> Los tickets caducan al mes siguiente de la falta.</p>
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
                <button onClick={() => confirmAbsence(false)} className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-800 shadow-lg">Avisar de todas formas</button>
                <button onClick={() => setAbsenceModal(null)} className="w-full bg-zinc-100 text-zinc-500 font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-200">Cancelar</button>
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
                  <input type="checkbox" checked={healthCheck} onChange={e => setHealthCheck(e.target.checked)} className="w-4 h-4 accent-amber-600 rounded cursor-pointer" />
                  <span className="text-xs font-black text-amber-950 uppercase tracking-widest">Cumplo las condiciones</span>
                </label>
              </div>
              <div className="space-y-3">
                <button onClick={() => confirmAbsence(true)} disabled={!healthCheck} className="w-full bg-emerald-500 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-emerald-600 shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed">Sí, quiero recuperarla</button>
                <button onClick={() => confirmAbsence(false)} className="w-full bg-zinc-800 text-zinc-300 font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-black">No, gracias. Solo aviso.</button>
                <button onClick={() => setAbsenceModal(null)} className="w-full bg-zinc-100 text-zinc-500 font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-200">Cancelar</button>
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

  const GestionModalOverlay = () => {
    if (!gestionModal) return null;
    const isClassSearch = gestionModal.type === 'cambio_horario' || gestionModal.type === 'ampliar_clases' || gestionModal.type === 'recuperacion';
    const isTicketRedemption = gestionModal.type === 'recuperacion';

    const availableClasses = isClassSearch ? allClasses.filter(c => {
      const targetInstrument = selectedInst || profile.instruments[0];
      if (c.subject !== targetInstrument) return false;
      const maxCap = parseInt(c.capacity || 4);
      const currentStudents = c.students?.length || 0;
      if (currentStudents >= maxCap) return false;
      if (c.students?.some(s => s.id === profile.id)) return false;
      if (isTicketRedemption && targetInstrument === 'Guitarra') {
        if (maxCap !== 8) return false;
      }
      return true;
    }) : [];

    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative my-8">
          <button onClick={() => {setGestionModal(null); setSelectedNewClass(null); setAcceptLatePenalty(false);}} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          <div className="flex items-center gap-3 text-black mb-2">
            <gestionModal.icon className={`w-8 h-8 ${gestionModal.color}`} />
            <h2 className="text-xl font-black uppercase tracking-tight leading-tight">{gestionModal.title}</h2>
          </div>
          {!isTicketRedemption && (
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
          <p className="text-sm font-medium text-zinc-500 mb-6">{gestionModal.desc}</p>
          {isClassSearch && (
            <div className="mb-6 space-y-4 border-t border-b border-zinc-100 py-4">
              <p className="text-xs font-black uppercase tracking-widest text-zinc-400">{isTicketRedemption ? '1. Elige el grupo para recuperar' : '1. Busca disponibilidad en directo'}</p>
              {gestionModal.type === 'ampliar_clases' && (
                <select value={selectedInst} onChange={e => setSelectedInst(e.target.value)} className="w-full p-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl outline-none font-bold text-sm">
                  <option value="">Selecciona Instrumento...</option>
                  {INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              )}
              {availableClasses.length > 0 ? (
                <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                  {availableClasses.map(c => (
                    <div key={c.id} onClick={() => setSelectedNewClass(c)} className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedNewClass?.id === c.id ? 'border-black bg-zinc-50' : 'border-zinc-100 hover:border-zinc-300'}`}>
                      <div className="flex justify-between items-center mb-1"><span className="font-black text-sm uppercase">{getDayName(c.dayOfWeek)}</span><span className="text-xs font-bold bg-black text-white px-2 py-0.5 rounded">{c.time}h</span></div>
                      <div className="text-xs text-zinc-500 font-medium">Prof: {c.teacher} • Quedan {parseInt(c.capacity || 4) - (c.students?.length || 0)} plazas</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-zinc-50 p-4 rounded-xl text-center border-2 border-zinc-100"><p className="text-xs font-bold text-zinc-500">No hay grupos {isTicketRedemption ? 'habilitados para recuperación' : 'grupales libres'}. Escríbenos a gestiones@escuelalosmitos.com</p></div>
              )}
            </div>
          )}
          <textarea placeholder={gestionModal.placeholder} value={gestionText} onChange={(e) => setGestionText(e.target.value)} className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl focus:border-black outline-none min-h-[100px] resize-y text-sm font-medium mb-6"/>
          <button onClick={sendGestion} disabled={isSendingGestion || (!isTicketRedemption && timeRules.isLate && !acceptLatePenalty) || (isClassSearch && !selectedNewClass)} className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-800 transition-colors shadow-lg flex justify-center items-center gap-2 disabled:opacity-50">
            {isSendingGestion ? 'Enviando...' : <><Send className="w-4 h-4"/> Enviar Solicitud</>}
          </button>
        </div>
      </div>
    );
  };

  const MitoboxModalOverlay = () => {
    if (!mitoboxModal) return null;
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // MOTOR INTELIGENTE DE BÚSQUEDA DE SALAS
    let availableMboxSlots = [];
    if (mboxDate && mboxSede) {
      const targetDay = new Date(`${mboxDate}T00:00:00`).getDay();
      
      const allScheduledClasses = allClasses.filter(c => c.dayOfWeek === targetDay && c.sede === mboxSede);

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
        const occupiedSalas = aliveClasses.filter(c => c.time === t).map(c => c.sala);
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

  const ContractOverlay = () => {
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

  const TriviaModalOverlay = () => {
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
              if (triviaResult !== null) {
                if (idx === currentQuestion.correct) btnClass = "bg-emerald-500 border-emerald-500 text-white"; 
                else if (idx === triviaSelected) btnClass = "bg-rose-500 border-rose-500 text-white"; 
                else btnClass = "bg-zinc-100 border-zinc-200 text-zinc-400 opacity-50"; 
              }

              return (
                <button 
                  key={idx} 
                  disabled={triviaResult !== null}
                  onClick={() => handleTriviaAnswer(idx)}
                  className={`w-full p-4 rounded-xl font-black uppercase text-xs tracking-widest transition-all ${btnClass}`}
                >
                  {opt}
                </button>
              );
            })}
          </div>

          {triviaResult === 'win' && <p className="mt-6 text-emerald-600 font-black animate-bounce uppercase tracking-widest text-sm">¡Correcto! +1 Punto</p>}
          {triviaResult === 'lose' && <p className="mt-6 text-rose-600 font-black uppercase tracking-widest text-sm">¡Incorrecto!</p>}
          {triviaResult === 'timeout' && <p className="mt-6 text-rose-600 font-black uppercase tracking-widest text-sm">¡Se acabó el tiempo!</p>}

        </div>
      </div>
    );
  };


  if (loading) return <div className="min-h-screen bg-zinc-50 flex items-center justify-center font-black">Sincronizando perfil...</div>;

  if (!profile) {
    return (
      <div className="min-h-screen bg-white p-8 flex flex-col justify-center max-w-md mx-auto">
        <div className="bg-black text-white p-4 rounded-2xl w-fit mb-6 rotate-3"><Music/></div>
        <h1 className="text-3xl font-black uppercase tracking-tight leading-none mb-2">¡Bienvenido!</h1>
        <p className="text-zinc-500 font-medium mb-8">Configura tu portal de alumno para empezar.</p>
        <form onSubmit={handleOnboarding} className="space-y-4">
          <div><label className="text-[10px] font-black uppercase text-zinc-400">Nombre Completo</label><input required type="text" value={onboarding.name} onChange={e => setOnboarding({...onboarding, name: e.target.value})} className="w-full p-4 bg-zinc-50 border rounded-xl font-bold" /></div>
          <div><label className="text-[10px] font-black uppercase text-zinc-400">¿Qué estudias?</label><select value={onboarding.instrument} onChange={e => setOnboarding({...onboarding, instrument: e.target.value})} className="w-full p-4 bg-zinc-50 border rounded-xl font-bold">{INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}</select></div>
          <button type="submit" className="w-full bg-black text-white py-5 rounded-2xl font-black uppercase mt-6 flex justify-center items-center gap-2">Activar Mi Portal <ArrowRight/></button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-slate-800 pb-24 relative">
      <AbsenceModalOverlay />
      <GestionModalOverlay />
      <MitoboxModalOverlay />
      <ContractOverlay />
      <TriviaModalOverlay />
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
        
        {/* --- PESTAÑA 1: INICIO --- */}
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

            {/* BANNER DEL RETO DIARIO */}
            {!hasPlayedToday ? (
              <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-3xl p-1 text-white shadow-xl relative overflow-hidden transform hover:scale-[1.02] transition-transform cursor-pointer" onClick={startTrivia}>
                <div className="bg-black/10 absolute inset-0"></div>
                <div className="relative z-10 p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div>
                    <h3 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2 mb-1"><Trophy className="w-6 h-6 text-amber-200"/> Reto del Día</h3>
                    <p className="text-xs font-bold text-amber-100 uppercase tracking-widest">¡Responde rápido, suma puntos y gana premios!</p>
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
            
            {myClasses.length === 0 ? (
              <div className="p-8 bg-white rounded-3xl border border-zinc-200 text-center shadow-sm">
                <Music className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                <p className="font-bold text-zinc-400 uppercase tracking-widest text-sm">Todavía no tienes clases asignadas.</p>
              </div>
            ) : (
              myClasses.map((clase, idx) => {
                const classInfo = getNextClassInfo(clase.dayOfWeek, clase.time);
                const holidayMatch = schoolCalendar.find(c => c.date === classInfo.dateStr);
                const hasNotifiedNext = clase.exceptions?.[classInfo.dateStr]?.[profile.id];

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
                    </div>
                  );
                }

                return (
                  <div key={idx} className="bg-black text-white rounded-3xl p-6 shadow-xl relative overflow-hidden mb-4">
                      <p className="text-zinc-400 font-bold uppercase text-[10px] tracking-widest mb-1">Clase de {clase.subject}</p>
                      <h2 className="text-3xl font-black uppercase tracking-tighter">{getDayName(clase.dayOfWeek)}</h2>
                      <p className="text-lg font-medium text-zinc-300 mb-6">{clase.time}h</p>
                      <div className="flex flex-col sm:flex-row gap-3 text-sm font-medium text-zinc-300 mb-8 bg-zinc-800/50 p-4 rounded-2xl border border-zinc-700/50">
                        <span className="flex items-center gap-2"><User className="w-4 h-4"/> Prof: {clase.teacher}</span> <span className="hidden sm:inline text-zinc-600">•</span> <span className="flex items-center gap-2"><MapPin className="w-4 h-4"/> {clase.sede} ({clase.sala})</span>
                      </div>
                      
                      {/* BLOQUEO DEL BOTÓN SI YA AVISÓ */}
                      {hasNotifiedNext ? (
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
                <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-lg text-xs font-black">{profile.activeTickets || 0} Tickets</span>
              </div>
              <button 
                disabled={!profile.activeTickets} 
                onClick={() => setGestionModal({
                  type: 'recuperacion', title: 'Canjear Ticket', icon: Ticket, color: 'text-amber-500',
                  desc: 'Elige el grupo en el que quieres gastar tu ticket. Si no encuentras disponibilidad, vuelve a mirar otro día.',
                  placeholder: 'Añade observaciones para el profesor (Opcional)...'
                })}
                className={`w-full font-black py-4 rounded-xl shadow-sm uppercase text-xs tracking-widest transition-colors ${profile.activeTickets > 0 ? 'bg-amber-400 text-amber-950 hover:bg-amber-300' : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'}`}
              >
                {profile.activeTickets > 0 ? 'Canjear Ticket Libre' : 'No tienes tickets'}
              </button>
            </div>

            {/* --- SECCIÓN: EN TRÁMITE --- */}
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
                <p className="text-zinc-400 font-bold text-xs uppercase tracking-widest mt-1">Novedades de la escuela</p>
              </div>
              <Bell className="w-20 h-20 text-zinc-800 absolute -right-4 -bottom-4 rotate-12 pointer-events-none" />
            </div>

            {announcements.length === 0 ? (
               <div className="p-10 bg-white rounded-3xl border border-zinc-200 text-center shadow-sm">
                <Megaphone className="w-16 h-16 text-zinc-200 mx-auto mb-4" />
                <p className="font-black text-slate-800 uppercase tracking-widest text-lg">El tablón está vacío</p>
              </div>
            ) : (
              <div className="space-y-4">
                {announcements.map(ann => (
                  <div key={ann.id} className="bg-white rounded-3xl p-6 shadow-sm border-2 border-zinc-200">
                    <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg leading-none mb-1">{ann.title}</h3>
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">{ann.date}</p>
                    <p className="text-sm font-medium text-slate-600 leading-relaxed whitespace-pre-wrap">{ann.content}</p>
                  </div>
                ))}
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

            <div className="bg-white p-4 rounded-2xl border-2 border-amber-100 text-amber-900 text-xs font-medium leading-relaxed">
              <strong className="font-black uppercase tracking-widest text-[10px] block mb-1 text-amber-700">Normativa Administrativa:</strong>
              Todas las gestiones (bajas, cambios de horario, mantenimientos) que modifiquen la facturación deben solicitarse antes del <strong>día 20 de cada mes</strong>. Las peticiones enviadas del 21 en adelante, tendrán efecto en el mes siguiente.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button 
                onClick={() => setGestionModal({
                  type: 'cambio_horario', title: 'Cambiar Horario Fijo', icon: RefreshCcw, color: 'text-blue-500',
                  desc: 'Busca una plaza libre en otro grupo y solicita el cambio para el mes que viene.',
                  placeholder: 'Añade observaciones para Administración (Opcional)...'
                })}
                className="bg-white p-6 rounded-3xl border-2 border-zinc-100 hover:border-black text-left transition-all shadow-sm group"
              >
                <div className="bg-blue-50 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><RefreshCcw className="w-6 h-6 text-blue-500"/></div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight">Cambiar Horario Fijo</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">Solicita otro día u hora</p>
              </button>

              <button 
                onClick={() => setGestionModal({
                  type: 'ampliar_clases', title: 'Añadir Otra Clase', icon: PlusCircle, color: 'text-emerald-500',
                  desc: 'Añade una hora extra o empieza con un nuevo instrumento grupal.',
                  placeholder: 'Añade observaciones para Administración (Opcional)...'
                })}
                className="bg-white p-6 rounded-3xl border-2 border-zinc-100 hover:border-black text-left transition-all shadow-sm group"
              >
                <div className="bg-emerald-50 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><PlusCircle className="w-6 h-6 text-emerald-500"/></div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight">Ampliar Mis Clases</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">Apunta un nuevo instrumento</p>
              </button>

              <button 
                onClick={() => setGestionModal({
                  type: 'mantenimiento', title: 'Pasar a Mantenimiento', icon: Snowflake, color: 'text-amber-500',
                  desc: 'Si necesitas un respiro temporal pero no quieres perder tu plaza ni tus ventajas. Recuerda que la cuota de mantenimiento es de 15€/Mes. Si quieres mantener mas de un mes tendrás que solicitarlo mes a mes. Esta gestión afecta solo al mes que viene',
                  placeholder: 'Añade observaciones para Administración (Opcional)...'
                })}
                className="bg-white p-6 rounded-3xl border-2 border-zinc-100 hover:border-black text-left transition-all shadow-sm group"
              >
                <div className="bg-amber-50 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Snowflake className="w-6 h-6 text-amber-500"/></div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight">Cuota Mantenimiento</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">Congela tu plaza temporalmente</p>
              </button>

              <button 
                onClick={() => setGestionModal({
                  type: 'baja', title: 'Dar de Baja mi Plaza', icon: UserMinus, color: 'text-red-500',
                  desc: 'Solicita la cancelación de tu suscripción en la escuela. Te echaremos de menos.',
                  placeholder: '¿Podrías decirnos brevemente el motivo? Nos ayuda a mejorar (Opcional)...'
                })}
                className="bg-white p-6 rounded-3xl border-2 border-zinc-100 hover:border-red-500 text-left transition-all shadow-sm group"
              >
                <div className="bg-red-50 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><UserMinus className="w-6 h-6 text-red-500"/></div>
                <h3 className="font-black text-slate-800 uppercase tracking-tight">Dar de Baja</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mt-1">Cancela tu suscripción</p>
              </button>

              <a 
                href="mailto:gestiones@escuelalosmitos.com?subject=Otras%20Gestiones%20-%20Portal%20Alumno"
                className="col-span-1 sm:col-span-2 bg-black p-6 rounded-3xl border-2 border-black hover:bg-zinc-800 text-left transition-all shadow-md group flex items-center justify-between"
              >
                <div>
                  <h3 className="font-black text-white uppercase tracking-tight text-lg">Otras Gestiones (Mail)</h3>
                  <p className="text-xs font-medium text-zinc-400 mt-1">Clases particulares, dudas de facturación...</p>
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
            {id:'news', i:Info, label:'Avisos'}, 
            {id:'contact', i:MessageSquare, label:'Gestiones'}
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all flex-1 ${activeTab === t.id ? 'text-black' : 'text-zinc-400 hover:text-black'}`}>
              <t.i className="w-6 h-6"/>
              <span className="text-[10px] font-bold">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
