import React, { useState, useEffect } from 'react';
import { Music, LogOut, Calendar, Ticket, BookOpen, Video, Info, MessageSquare, LayoutGrid, AlertCircle, CheckCircle, User, ArrowRight, MapPin, X, Clock, FileText, Check } from 'lucide-react';
import { collection, query, where, getDocs, doc, setDoc, updateDoc, collectionGroup } from 'firebase/firestore';

const INSTRUMENTOS = ["Guitarra", "Canto", "Teclado", "Batería", "Bajo", "Ukelele", "Armónica", "Combo", "Sensibilización", "Violín"];

const getDayName = (dayIndex) => {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[dayIndex];
};

// HELPER: Calcula la fecha exacta y horas restantes para la próxima clase
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

export default function StudentPortal({ user, logout, db, appId }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [myClasses, setMyClasses] = useState([]);
  const [activeTab, setActiveTab] = useState('home');
  const [notification, setNotification] = useState(null);

  // ESTADOS DEL MODAL DE AUSENCIA
  const [absenceModal, setAbsenceModal] = useState(null);
  const [showRules, setShowRules] = useState(false);

  // FORMULARIO ONBOARDING
  const [onboarding, setOnboarding] = useState({ name: '', instrument: 'Guitarra', classId: '' });

  useEffect(() => {
    checkRegistration();
  }, [user.email]);

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
    
    // Si avisa tarde, forzamos que no tenga ticket aunque el sistema pregunte
    const status = (absenceModal.diffHours >= 16 && wantsTicket) ? 'notified' : 'notified_no_ticket';

    try {
      const classRef = doc(db, absenceModal.clase.refPath);
      
      // Merge seguro en Firestore
      await setDoc(classRef, {
        exceptions: {
          [absenceModal.dateStr]: {
            [profile.id]: status
          }
        }
      }, { merge: true });

      setAbsenceModal(null);
      showToast('Aviso enviado correctamente al profesor.');
      
      // Opcional: Refrescar datos
      await fetchRealStudentData(profile.id);
    } catch (error) {
      showToast('Error al enviar el aviso.', 'error');
    }
  };

  // --- MODAL DE AVISO DE AUSENCIA ---
  const AbsenceModalOverlay = () => {
    if (!absenceModal) return null;
    const isLate = absenceModal.diffHours < 16;

    if (showRules) {
      return (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative">
            <button onClick={() => setShowRules(false)} className="absolute top-4 right-4 text-zinc-400 hover:text-black bg-zinc-100 p-2 rounded-full"><X className="w-5 h-5"/></button>
            <div className="flex items-center gap-3 text-black mb-6">
              <FileText className="w-8 h-8" />
              <h2 className="text-xl font-black uppercase tracking-tight">Normativa</h2>
            </div>
            <div className="space-y-4 text-sm text-zinc-600 font-medium">
              <p>1. <strong className="text-black">Preaviso de 16h:</strong> Para tener derecho a recuperar una clase, es imprescindible avisar de la falta con un mínimo de 16 horas de antelación.</p>
              <p>2. <strong className="text-black">Caducidad:</strong> Los tickets de recuperación generados son válidos exclusivamente durante el mes siguiente a la fecha de la falta.</p>
              <p>3. <strong className="text-black">Alta activa:</strong> Para poder canjear un ticket de recuperación, el alumno debe estar dado de alta y al corriente de pago en la escuela.</p>
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
            // ESCENARIO A: AVISO TARDÍO
            <>
              <div className="flex items-center justify-center w-16 h-16 bg-red-100 text-red-500 rounded-full mb-6 mx-auto">
                <Clock className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black text-center uppercase tracking-tight text-slate-800 mb-2">Aviso fuera de plazo</h2>
              <p className="text-center text-zinc-500 font-medium mb-6">
                Estás avisando con menos de 16 horas de antelación para tu próxima clase. Informaremos a tu profesor, pero <strong className="text-red-500">esta falta no generará ticket de recuperación</strong>.
              </p>
              <div className="space-y-3">
                <button onClick={() => confirmAbsence(false)} className="w-full bg-black text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-800 transition-colors shadow-lg">Avisar de todas formas</button>
                <button onClick={() => setAbsenceModal(null)} className="w-full bg-zinc-100 text-zinc-500 font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-200">Cancelar</button>
              </div>
            </>
          ) : (
            // ESCENARIO B: AVISO A TIEMPO
            <>
              <div className="flex items-center justify-center w-16 h-16 bg-emerald-100 text-emerald-500 rounded-full mb-6 mx-auto">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-black text-center uppercase tracking-tight text-slate-800 mb-2">Aviso a tiempo</h2>
              <p className="text-center text-zinc-500 font-medium mb-6">
                Informaremos a tu profesor. Al haber avisado con antelación, tienes derecho a recuperar esta clase el próximo mes.
              </p>
              <h3 className="font-black text-center text-sm uppercase tracking-widest text-slate-800 mb-4">¿Quieres ticket de recuperación?</h3>
              <div className="space-y-3">
                <button onClick={() => confirmAbsence(true)} className="w-full bg-emerald-500 text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-emerald-600 transition-colors shadow-lg">Sí, quiero recuperarla</button>
                <button onClick={() => confirmAbsence(false)} className="w-full bg-zinc-800 text-zinc-300 font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-black transition-colors">No, gracias. Solo aviso.</button>
                <button onClick={() => setAbsenceModal(null)} className="w-full bg-zinc-100 text-zinc-500 font-black py-4 rounded-xl uppercase text-xs tracking-widest hover:bg-zinc-200">Cancelar</button>
              </div>
            </>
          )}

          <div className="mt-8 pt-6 border-t border-zinc-100 text-center">
            <button onClick={() => setShowRules(true)} className="text-xs font-bold text-zinc-400 hover:text-black uppercase tracking-widest flex items-center justify-center gap-1 mx-auto">
              <FileText className="w-3 h-3"/> Leer Normativa de Recuperaciones
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return <div className="min-h-screen bg-zinc-50 flex items-center justify-center font-black">Sincronizando perfil...</div>;

  // ESCENARIO 1: EL ALUMNO ES NUEVO TOTAL (Onboarding)
  if (!profile) {
    return (
      <div className="min-h-screen bg-white p-8 flex flex-col justify-center max-w-md mx-auto">
        <div className="bg-black text-white p-4 rounded-2xl w-fit mb-6 rotate-3"><Music/></div>
        <h1 className="text-3xl font-black uppercase tracking-tight leading-none mb-2">¡Bienvenido!</h1>
        <p className="text-zinc-500 font-medium mb-8">Configura tu portal de alumno para empezar.</p>
        
        <form onSubmit={handleOnboarding} className="space-y-4">
          <div><label className="text-[10px] font-black uppercase text-zinc-400">Nombre Completo</label><input required type="text" value={onboarding.name} onChange={e => setOnboarding({...onboarding, name: e.target.value})} className="w-full p-4 bg-zinc-50 border rounded-xl font-bold" placeholder="Hugo Sánchez..." /></div>
          <div><label className="text-[10px] font-black uppercase text-zinc-400">¿Qué estudias?</label><select value={onboarding.instrument} onChange={e => setOnboarding({...onboarding, instrument: e.target.value})} className="w-full p-4 bg-zinc-50 border rounded-xl font-bold">{INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}</select></div>
          <button type="submit" className="w-full bg-black text-white py-5 rounded-2xl font-black uppercase mt-6 flex justify-center items-center gap-2">Activar Mi Portal <ArrowRight/></button>
        </form>
      </div>
    );
  }

  // ESCENARIO 2: EL PROFE LO CREÓ PERO ÉL NO HA ENTRADO NUNCA (Reclamar)
  if (profile && !profile.claimed) {
    return (
        <div className="min-h-screen bg-zinc-50 p-8 flex flex-col justify-center max-w-md mx-auto">
          <div className="bg-emerald-500 text-white p-6 rounded-3xl shadow-xl text-center mb-8">
            <CheckCircle className="w-16 h-16 mx-auto mb-4" />
            <h2 className="text-2xl font-black uppercase">¡Perfil Encontrado!</h2>
            <p className="font-bold text-emerald-100 mt-2">Tu profesor ya ha creado tu ficha en la escuela.</p>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-zinc-200 mb-8">
            <div className="flex items-center gap-4 mb-4"><div className="bg-zinc-100 p-3 rounded-full"><User/></div><div><p className="text-[10px] font-black uppercase text-zinc-400">Alumno</p><p className="font-black">{profile.name}</p></div></div>
            <div className="flex items-center gap-4"><div className="bg-zinc-100 p-3 rounded-full"><Music/></div><div><p className="text-[10px] font-black uppercase text-zinc-400">Instrumento</p><p className="font-black">{profile.instruments?.join(', ')}</p></div></div>
          </div>
          <button onClick={claimProfile} className="w-full bg-black text-white py-5 rounded-2xl font-black uppercase shadow-xl">Sí, soy yo. ¡Entrar!</button>
        </div>
    );
  }

  // ESCENARIO 3: PORTAL NORMAL CON DATOS REALES
  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-slate-800 pb-24 relative">
      <AbsenceModalOverlay />

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
            
            {/* CABECERA RESUMEN */}
            <div className="bg-white border-2 border-zinc-100 rounded-3xl p-6 flex items-center justify-between shadow-sm">
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Hola, {profile.name.split(' ')[0]}</h2>
                <p className="text-zinc-400 font-bold text-xs uppercase tracking-widest mt-1">Escuela Los Mitos</p>
              </div>
            </div>

            {/* SECCIÓN MIS CLASES */}
            <h3 className="font-black uppercase tracking-widest text-xs text-zinc-400 px-2 flex items-center gap-2"><Calendar className="w-4 h-4"/> Mis Clases Asignadas</h3>
            
            {myClasses.length === 0 ? (
              <div className="p-8 bg-white rounded-3xl border border-zinc-200 text-center shadow-sm">
                <Music className="w-12 h-12 text-zinc-200 mx-auto mb-3" />
                <p className="font-bold text-zinc-400 uppercase tracking-widest text-sm">Todavía no tienes clases asignadas.</p>
                <p className="text-xs text-zinc-400 mt-2">Pídele a tu profesor que te pase lista la próxima vez.</p>
              </div>
            ) : (
              myClasses.map((clase, idx) => (
                <div key={idx} className="bg-black text-white rounded-3xl p-6 shadow-xl relative overflow-hidden mb-4">
                    <p className="text-zinc-400 font-bold uppercase text-[10px] tracking-widest mb-1">Clase de {clase.subject}</p>
                    <h2 className="text-3xl font-black uppercase tracking-tighter">{getDayName(clase.dayOfWeek)}</h2>
                    <p className="text-lg font-medium text-zinc-300 mb-6">{clase.time}h</p>
                    
                    <div className="flex flex-col sm:flex-row gap-3 text-sm font-medium text-zinc-300 mb-8 bg-zinc-800/50 p-4 rounded-2xl border border-zinc-700/50">
                      <span className="flex items-center gap-2"><User className="w-4 h-4"/> Prof: {clase.teacher}</span> 
                      <span className="hidden sm:inline text-zinc-600">•</span> 
                      <span className="flex items-center gap-2"><MapPin className="w-4 h-4"/> {clase.sede} ({clase.sala})</span>
                    </div>

                    <button onClick={() => openAbsenceModal(clase)} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-black py-4 px-6 rounded-xl flex items-center justify-center gap-2 uppercase text-xs tracking-widest border border-zinc-700 transition-all shadow-lg active:scale-95">
                      <AlertCircle className="w-4 h-4 text-amber-400" /> No podré asistir
                    </button>
                </div>
              ))
            )}

            {/* SECCIÓN RECUPERACIONES */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg flex items-center gap-2"><Ticket className="w-5 h-5 text-amber-500"/> Recuperaciones</h3>
                <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-lg text-xs font-black">{profile.activeTickets || 0} Tickets</span>
              </div>
              <button disabled={!profile.activeTickets} className={`w-full font-black py-4 rounded-xl shadow-sm uppercase text-xs tracking-widest transition-colors ${profile.activeTickets > 0 ? 'bg-amber-400 text-amber-950 hover:bg-amber-300' : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'}`}>
                {profile.activeTickets > 0 ? 'Canjear Ticket Libre' : 'No tienes tickets'}
              </button>
            </div>

          </div>
        )}
      </main>

      <nav className="fixed bottom-0 w-full bg-white border-t border-zinc-200 pb-safe z-40">
        <div className="flex justify-around p-2">
          {[{id:'home', i:LayoutGrid, label:'Inicio'}, {id:'news', i:Info, label:'Avisos'}, {id:'contact', i:MessageSquare, label:'Gestiones'}].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${activeTab === t.id ? 'text-black' : 'text-zinc-400'}`}><t.i className="w-6 h-6"/><span className="text-[10px] font-bold">{t.label}</span></button>
          ))}
        </div>
      </nav>
    </div>
  );
}
