import React, { useState, useEffect } from 'react';
import { Music, LogOut, Calendar, Ticket, BookOpen, Video, Info, MessageSquare, LayoutGrid, AlertCircle, CheckCircle, User, ArrowRight } from 'lucide-react';
import { collection, query, where, getDocs, doc, setDoc, updateDoc, collectionGroup } from 'firebase/firestore';

const INSTRUMENTOS = ["Guitarra", "Canto", "Teclado", "Batería", "Bajo", "Ukelele", "Armónica", "Combo", "Sensibilización", "Violín"];

const getDayName = (dayIndex) => {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return days[dayIndex];
};

export default function StudentPortal({ user, logout, db, appId }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [myClasses, setMyClasses] = useState([]);
  const [activeTab, setActiveTab] = useState('home');

  // FORMULARIO ONBOARDING
  const [onboarding, setOnboarding] = useState({ name: '', instrument: 'Guitarra', classId: '' });

  useEffect(() => {
    checkRegistration();
  }, [user.email]);

  const checkRegistration = async () => {
    setLoading(true);
    const q = query(collection(db, 'artifacts', appId, 'students'), where("email", "==", user.email));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const studentData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
      setProfile(studentData);
      
      // Si el perfil ya está reclamado, buscamos sus clases y tickets reales
      if (studentData.claimed) {
        await fetchRealStudentData(studentData.id);
      }
    }
    setLoading(false);
  };

  // --- EL MOTOR DE BÚSQUEDA DE DATOS REALES ---
  const fetchRealStudentData = async (studentId) => {
    try {
      // 1. Buscamos en las clases de TODOS los profesores
      const classesQuery = collectionGroup(db, 'recurringClasses');
      const classesSnap = await getDocs(classesQuery);
      
      const foundClasses = [];
      classesSnap.forEach(doc => {
        const data = doc.data();
        // Si en la lista de alumnos de esta clase está nuestro ID, es nuestra clase
        if (data.students && data.students.some(s => s.id === studentId)) {
          foundClasses.push({ id: doc.id, refPath: doc.ref.path, ...data });
        }
      });
      setMyClasses(foundClasses);

      // 2. Buscamos cuántos tickets SIN USAR tiene este alumno
      const ticketsQuery = collectionGroup(db, 'tickets');
      const ticketsSnap = await getDocs(ticketsQuery);
      
      let validTicketsCount = 0;
      ticketsSnap.forEach(doc => {
        const data = doc.data();
        if (data.studentId === studentId && !data.isUsed) {
          validTicketsCount++;
        }
      });
      
      // Actualizamos el perfil con el número de tickets reales
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
    await fetchRealStudentData(studentId); // Buscamos por si acaso
  };

  const claimProfile = async () => {
    await updateDoc(doc(db, 'artifacts', appId, 'students', profile.id), { claimed: true });
    setProfile({ ...profile, claimed: true });
    await fetchRealStudentData(profile.id); // Cargamos sus clases reales
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

                    <button onClick={() => alert("¡Pronto programaremos este botón! Notificará al profesor y te dará un ticket.")} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-black py-4 px-6 rounded-xl flex items-center justify-center gap-2 uppercase text-xs tracking-widest border border-zinc-700 transition-all">
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
