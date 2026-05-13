import React, { useState, useEffect } from 'react';
import { Music, LogOut, Calendar, Ticket, BookOpen, Video, Info, MessageSquare, LayoutGrid, AlertCircle, CheckCircle, User, ArrowRight } from 'lucide-react';
import { collection, query, where, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';

const INSTRUMENTOS = ["Guitarra", "Canto", "Teclado", "Batería", "Bajo", "Ukelele", "Armónica", "Combo", "Sensibilización", "Violín"];

export default function StudentPortal({ user, logout, db, appId }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [availableClasses, setAvailableClasses] = useState([]);
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
      setProfile({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
    } else {
      // Si no existe, buscamos clases disponibles para que elija una
      const classesSnap = await getDocs(collection(db, 'clases_v2')); // Ajustar según tu ruta de clases real
      setAvailableClasses(classesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
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
        classes: onboarding.classId ? [onboarding.classId] : []
    };
    await setDoc(doc(db, 'artifacts', appId, 'students', studentId), data);
    setProfile({ id: studentId, ...data });
  };

  const claimProfile = async () => {
    await updateDoc(doc(db, 'artifacts', appId, 'students', profile.id), { claimed: true });
    setProfile({ ...profile, claimed: true });
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

  // ESCENARIO 3: PORTAL NORMAL
  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-slate-800 pb-24 relative">
      <header className="bg-white p-5 sticky top-0 z-50 shadow-sm border-b border-zinc-200">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="bg-black p-2 rounded-xl text-white"><Music className="w-5 h-5"/></div><div><h1 className="text-lg font-black uppercase leading-none">Mi Portal</h1><span className="text-[10px] font-bold text-zinc-400 uppercase">{profile.name}</span></div></div>
          <button onClick={logout} className="p-2 text-zinc-400 hover:text-rose-500"><LogOut className="w-5 h-5" /></button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-6 animate-in fade-in duration-300">
        {activeTab === 'home' && (
          <div className="space-y-6">
            <div className="bg-black text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
                <p className="text-zinc-400 font-bold uppercase text-[10px] tracking-widest mb-1 flex items-center gap-1.5"><Calendar className="w-3 h-3"/> Mis Clases</p>
                <h2 className="text-3xl font-black uppercase tracking-tighter">Bienvenido, {profile.name.split(' ')[0]}</h2>
                <div className="mt-6 flex items-center gap-4 text-sm font-medium text-zinc-300 bg-zinc-800/50 p-4 rounded-2xl border border-zinc-700/50">
                  <span>🎸 {profile.instruments?.join(', ')}</span> <span>🎟️ {profile.tickets_recuperacion || 0} Tickets</span>
                </div>
            </div>
            <div className="p-6 bg-white rounded-3xl border border-zinc-200 text-center font-bold text-zinc-400">Pronto verás aquí tu horario detallado sincronizado con el profesor.</div>
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
