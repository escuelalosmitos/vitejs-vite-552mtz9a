import React, { useState, useEffect } from 'react';
import { Music, LogOut, Calendar, Ticket, Info, MessageSquare, LayoutGrid, AlertCircle, CheckCircle, User, ArrowRight, MapPin, X, Clock, FileText, Check, Bell, Megaphone, Snowflake, RefreshCcw, PlusCircle, UserMinus, Send, Mail, PalmTree } from 'lucide-react';
import { collection, query, where, getDocs, doc, setDoc, updateDoc, collectionGroup, onSnapshot } from 'firebase/firestore';

const INSTRUMENTOS = ["Guitarra", "Canto", "Teclado", "Batería", "Bajo", "Ukelele", "Armónica", "Combo", "Sensibilización", "Violín"];

const getDayName = (dayIndex) => {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[dayIndex];
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
  const [allClasses, setAllClasses] = useState([]); // Para buscar plazas
  const [schoolCalendar, setSchoolCalendar] = useState([]); // Festivos y vacaciones
  const [announcements, setAnnouncements] = useState([]); 
  const [activeTab, setActiveTab] = useState('home');
  const [notification, setNotification] = useState(null);

  const [absenceModal, setAbsenceModal] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const [showCalendarRules, setShowCalendarRules] = useState(false);
  const [onboarding, setOnboarding] = useState({ name: '', instrument: 'Guitarra', classId: '' });

  // ESTADOS PARA GESTIONES
  const [gestionModal, setGestionModal] = useState(null);
  const [gestionText, setGestionText] = useState('');
  const [selectedInst, setSelectedInst] = useState('');
  const [selectedNewClass, setSelectedNewClass] = useState(null);
  const [acceptLatePenalty, setAcceptLatePenalty] = useState(false);
  const [isSendingGestion, setIsSendingGestion] = useState(false);

  const timeRules = getMonthNames();

  useEffect(() => {
    checkRegistration();
    fetchAllClassesAndCalendar();

    const unsubAnnouncements = onSnapshot(collection(db, 'artifacts', appId, 'announcements'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setAnnouncements(data);
    });

    return () => unsubAnnouncements();
  }, [user.email]);

  const showToast = (msg, type = 'success') => {
    setNotification({ text: msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchAllClassesAndCalendar = async () => {
    try {
      // Clases
      const classesQuery = collectionGroup(db, 'recurringClasses');
      const classesSnap = await getDocs(classesQuery);
      const classesList = [];
      classesSnap.forEach(doc => {
        classesList.push({ id: doc.id, refPath: doc.ref.path, ...doc.data() });
      });
      setAllClasses(classesList);

      // Calendario (Festivos/Vacaciones)
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
        classes: onboarding.classId ? [onboarding.classId] : []
    };
    await setDoc(doc(db, 'artifacts', appId, 'students', studentId), data);
    setProfile({ id: studentId, ...data });
    await fetchRealStudentData(studentId);
  };

  const claimProfile = async () => {
    await updateDoc(doc(db, 'artifacts', appId, 'students', profile.id), { claimed: true });
    setProfile({ ...profile, claimed: true });
    await fetchRealStudentData(profile.id);
  };

  const openAbsenceModal = (clase) => {
    const info = getNextClassInfo(clase.dayOfWeek, clase.time);
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
    if (timeRules.isLate && !acceptLatePenalty) {
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
        targetMonth: timeRules.isLate ? timeRules.nextNext : timeRules.next,
        isLateRequest: timeRules.isLate,
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
              <p className="text-center text-zinc-500 font-medium mb-6">Informaremos a tu profesor. Tienes derecho a recuperar esta clase el próximo mes.</p>
              <h3 className="font-black text-center text-sm uppercase tracking-widest text-slate-800 mb-4">¿Quieres ticket de recuperación?</h3>
              <div className="space-y-3">
                <button onClick={() => confirmAbsence(true)} className="w-full bg-emerald-500 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-emerald-600 shadow-lg">Sí, quiero recuperarla</button>
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

    // Filtramos clases libres si es cambio o ampliación
    const isClassSearch = gestionModal.type === 'cambio_horario' || gestionModal.type === 'ampliar_clases';
    const availableClasses = isClassSearch ? allClasses.filter(c => 
      c.subject === (selectedInst || profile.instruments[0]) && 
      (!c.students || c.students.length < parseInt(c.capacity || 4)) &&
      !c.students?.some(s => s.id === profile.id)
    ) : [];

    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative my-8">
          <button onClick={() => {setGestionModal(null); setSelectedNewClass(null); setAcceptLatePenalty(false);}} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          
          <div className="flex items-center gap-3 text-black mb-2">
            <gestionModal.icon className={`w-8 h-8 ${gestionModal.color}`} />
            <h2 className="text-xl font-black uppercase tracking-tight leading-tight">{gestionModal.title}</h2>
          </div>
          
          <div className="bg-zinc-100 rounded-xl p-3 mb-6 text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
            <Clock className="w-4 h-4"/> Normativa del día 20
          </div>

          {/* MENSAJE DE ADVERTENCIA DE PLAZO */}
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
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <p className="text-xs font-bold text-emerald-800 flex items-center gap-2"><CheckCircle className="w-4 h-4"/> En plazo. Tu solicitud aplicará para <strong>{timeRules.next}</strong>.</p>
            </div>
          )}

          <p className="text-sm font-medium text-zinc-500 mb-6">{gestionModal.desc}</p>

          {/* BUSCADOR DE PLAZAS SI APLICA */}
          {isClassSearch && (
            <div className="mb-6 space-y-4 border-t border-b border-zinc-100 py-4">
              <p className="text-xs font-black uppercase tracking-widest text-zinc-400">1. Busca disponibilidad en directo</p>
              
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
                <div className="bg-zinc-50 p-4 rounded-xl text-center border-2 border-zinc-100">
                  <p className="text-xs font-bold text-zinc-500">No hay grupos grupales libres. Para clases particulares, escríbenos a gestiones@escuelalosmitos.com</p>
                </div>
              )}
            </div>
          )}

          <textarea 
            placeholder={gestionModal.placeholder}
            value={gestionText}
            onChange={(e) => setGestionText(e.target.value)}
            className="w-full p-4 bg-zinc-50 border-2 border-zinc-200 rounded-2xl focus:border-black outline-none min-h-[100px] resize-y text-sm font-medium mb-6"
          />

          <button onClick={sendGestion} disabled={isSendingGestion || (timeRules.isLate && !acceptLatePenalty)} className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-800 transition-colors shadow-lg flex justify-center items-center gap-2 disabled:opacity-50">
            {isSendingGestion ? 'Enviando...' : <><Send className="w-4 h-4"/> Enviar Solicitud</>}
          </button>
        </div>
      </div>
    );
  };

  const CalendarRulesOverlay = () => {
    if (!showCalendarRules) return null;
    return (
      <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative">
          <button onClick={() => setShowCalendarRules(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
          <div className="flex items-center gap-3 text-black mb-6"><Calendar className="w-8 h-8" /><h2 className="text-xl font-black uppercase tracking-tight">Calendario</h2></div>
          <p className="text-xs font-bold text-zinc-500 mb-4 bg-zinc-50 p-3 rounded-lg border border-zinc-200">
            * Según el contrato de prestación de servicios firmado al darse de alta, la escuela se rige por el calendario laboral y escolar oficial.
          </p>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {schoolCalendar.length === 0 ? <p className="text-sm font-medium text-zinc-500">No hay festivos próximos registrados.</p> :
              schoolCalendar.map((cal, i) => (
                <div key={i} className={`p-3 rounded-xl border flex justify-between items-center ${cal.type === 'festivo' ? 'bg-red-50 border-red-100 text-red-800' : 'bg-purple-50 border-purple-100 text-purple-800'}`}>
                  <div><span className="text-xs font-black uppercase tracking-widest opacity-60 block">{cal.type}</span><span className="font-bold text-sm">{cal.title || 'Día no lectivo'}</span></div>
                  <span className="font-black text-sm">{cal.date}</span>
                </div>
              ))
            }
          </div>
          <button onClick={() => setShowCalendarRules(false)} className="w-full mt-6 bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest">Cerrar</button>
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
      <CalendarRulesOverlay />
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
            <div className="bg-white border-2 border-zinc-100 rounded-3xl p-6 flex items-center justify-between shadow-sm">
              <div><h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Hola, {profile.name.split(' ')[0]}</h2><p className="text-zinc-400 font-bold text-xs uppercase tracking-widest mt-1">Escuela Los Mitos</p></div>
            </div>

            <h3 className="font-black uppercase tracking-widest text-xs text-zinc-400 px-2 flex items-center gap-2"><Calendar className="w-4 h-4"/> Mis Clases Asignadas</h3>
            
            {myClasses.length === 0 ? (
              <div className="p-8 bg-white rounded-3xl border border-zinc-200 text-center shadow-sm">
                <Music className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                <p className="font-bold text-zinc-400 uppercase tracking-widest text-sm">Todavía no tienes clases asignadas.</p>
              </div>
            ) : (
              myClasses.map((clase, idx) => {
                const classInfo = getNextClassInfo(clase.dayOfWeek, clase.time);
                const holidayMatch = schoolCalendar.find(c => c.date === classInfo.dateStr);

                if (holidayMatch) {
                  const isFestivo = holidayMatch.type === 'festivo';
                  return (
                    <div key={idx} className={`rounded-3xl p-6 shadow-md relative overflow-hidden mb-4 border-2 ${isFestivo ? 'bg-red-50 border-red-200' : 'bg-purple-50 border-purple-200'}`}>
                      <div className="flex items-center gap-3 mb-2">
                        {isFestivo ? <AlertCircle className="w-6 h-6 text-red-500"/> : <PalmTree className="w-6 h-6 text-purple-500"/>}
                        <h2 className={`text-xl font-black uppercase tracking-tighter ${isFestivo ? 'text-red-900' : 'text-purple-900'}`}>{isFestivo ? 'Día Festivo' : 'Vacaciones'}</h2>
                      </div>
                      <p className={`font-bold uppercase text-[10px] tracking-widest mb-4 ${isFestivo ? 'text-red-600' : 'text-purple-600'}`}>{holidayMatch.title || 'Escuela Cerrada'} • {classInfo.dateStr}</p>
                      <p className={`text-sm font-medium mb-4 ${isFestivo ? 'text-red-800' : 'text-purple-800'}`}>Tu próxima clase de {clase.subject} coincide con un día no lectivo oficial. La escuela permanecerá cerrada.</p>
                      <button onClick={() => setShowCalendarRules(true)} className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-colors ${isFestivo ? 'bg-red-200 text-red-900 hover:bg-red-300' : 'bg-purple-200 text-purple-900 hover:bg-purple-300'}`}>Ver Calendario Escolar</button>
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
                      <button onClick={() => openAbsenceModal(clase)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-black py-4 px-6 rounded-xl flex items-center justify-center gap-2 uppercase text-xs tracking-widest border border-zinc-700 transition-all shadow-lg active:scale-95">
                        <AlertCircle className="w-4 h-4 text-amber-400" /> No podré asistir
                      </button>
                  </div>
                );
              })
            )}

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg flex items-center gap-2"><Ticket className="w-5 h-5 text-amber-500"/> Recuperaciones</h3>
                <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-lg text-xs font-black">{profile.activeTickets || 0} Tickets</span>
              </div>
              <button disabled={!profile.activeTickets} className={`w-full font-black py-4 rounded-xl shadow-sm uppercase text-xs tracking-widest transition-colors ${profile.activeTickets > 0 ? 'bg-amber-400 text-amber-950 hover:bg-amber-300' : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'}`}>
                {profile.activeTickets > 0 ? 'Canjear Ticket Libre' : 'No tienes tickets'}
              </button>
            </div>
            
            {/* LINK SUTIL AL CALENDARIO */}
            <div className="text-center mt-4">
              <button onClick={() => setShowCalendarRules(true)} className="text-[10px] font-bold text-zinc-400 hover:text-black uppercase tracking-widest underline underline-offset-4">Ver Calendario y Normativa (Contrato)</button>
            </div>
          </div>
        )}

        {/* --- PESTAÑA 2: TABLÓN --- */}
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

        {/* --- PESTAÑA 3: GESTIONES --- */}
        {activeTab === 'contact' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-zinc-100 border-2 border-zinc-200 rounded-3xl p-6 md:p-8 flex items-center justify-between shadow-sm relative overflow-hidden">
              <div className="relative z-10">
                <h2 className="text-2xl font-black uppercase tracking-tight text-slate-800">Trámites</h2>
                <p className="text-zinc-500 font-bold text-xs uppercase tracking-widest mt-1">Gestión rápida de tu plaza</p>
              </div>
              <MessageSquare className="w-20 h-20 text-zinc-200 absolute -right-4 -bottom-4 rotate-12 pointer-events-none" />
            </div>

            {/* AVISO LEGAL DÍA 20 */}
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
                  desc: 'Si necesitas un respiro temporal pero no quieres perder tu matrícula ni tus ventajas.',
                  placeholder: 'Indica por cuánto tiempo aproximado quieres congelar la plaza...'
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
          {[{id:'home', i:LayoutGrid, label:'Inicio'}, {id:'news', i:Info, label:'Avisos'}, {id:'contact', i:MessageSquare, label:'Gestiones'}].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all flex-1 ${activeTab === t.id ? 'text-black' : 'text-zinc-400 hover:text-black'}`}><t.i className="w-6 h-6"/><span className="text-[10px] font-bold">{t.label}</span></button>
          ))}
        </div>
      </nav>
    </div>
  );
}
