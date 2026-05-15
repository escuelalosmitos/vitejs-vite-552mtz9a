import React, { useState, useEffect } from 'react';
import { 
  Inbox, Users, Megaphone, Settings, LogOut, Search, MonitorPlay, 
  DoorOpen, Check, X, Trash2, Calendar, FileText, Plus, ShieldAlert, 
  ArrowRightLeft, PartyPopper, Palmtree, Lock, Trophy, Award, Gift, Star, Target
} from 'lucide-react';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

const formatDateSpanish = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function AdminPortal({ user, logout, db, appId, switchToTeacher }) {
  const [activeTab, setActiveTab] = useState('gestiones');
  const [loading, setLoading] = useState(true);

  // DATOS
  const [gestiones, setGestiones] = useState([]);
  const [students, setStudents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [settings, setSettings] = useState({ 
    festivos: [], vacaciones: [], contract: '', hourlyRate: 17.33, generalTasks: [],
    prizes: { trimestral: '', anual: '' } // <-- NUEVO: Para premios internos
  });

  // FORMULARIOS LOCALES
  const [searchStudent, setSearchStudent] = useState('');
  const [newAnnounce, setNewAnnounce] = useState({ title: '', content: '' });

  useEffect(() => {
    let loaded = 0;
    const checkLoad = () => { loaded++; if(loaded === 4) setLoading(false); };

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

    return () => { unsubGestiones(); unsubStudents(); unsubAnnouncements(); unsubSettings(); };
  }, [appId, db]);

  // --- FUNCIONES GESTIONES ---
  const updateGestionStatus = async (id, status) => {
    if(window.confirm(`¿Marcar este trámite como ${status.toUpperCase()}?`)) {
      await updateDoc(doc(db, 'artifacts', appId, 'gestiones', id), { status });
    }
  };

  // --- FUNCIONES ALUMNOS (CRM) ---
  const toggleStudentService = async (studentId, service, currentValue) => {
    const serviceName = service === 'hasMitoverso' ? 'Mitoverso' : 'Mitobox';
    if(window.confirm(`¿Quieres ${currentValue ? 'DESACTIVAR' : 'ACTIVAR'} ${serviceName} para este alumno?`)) {
      await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), { [service]: !currentValue });
    }
  };

  // --- FUNCIONES TABLÓN ---
  const postAnnouncement = async () => {
    if (!newAnnounce.title || !newAnnounce.content) return alert('Rellena todos los campos');
    const id = Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'announcements', id), { 
      ...newAnnounce, 
      date: new Date().toISOString().split('T')[0] 
    });
    setNewAnnounce({ title: '', content: '' });
    alert('Aviso publicado.');
  };

  const deleteAnnouncement = async (id) => { 
    if(window.confirm('¿Borrar aviso?')) await deleteDoc(doc(db, 'artifacts', appId, 'announcements', id)); 
  };

  // --- LÓGICA DE CIERRE DEL RETO MENSUAL ---
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
        
        // Sumamos victoria a los que empatan en cabeza
        updatePromises.push(updateDoc(doc(db, 'artifacts', appId, 'students', w.id), {
          triviaVictories: (w.triviaVictories || 0) + 1
        }));
      });

      // Traspasamos los puntos del mes al contador histórico (TotalPoints) y reseteamos el mes a 0 para todos los que jugaron
      players.forEach(p => {
        const currentTotal = p.triviaTotalPoints || 0;
        updatePromises.push(updateDoc(doc(db, 'artifacts', appId, 'students', p.id), {
          triviaTotalPoints: currentTotal + p.triviaPoints,
          triviaPoints: 0
        }));
      });

      await Promise.all(updatePromises);

      // Publicamos en el tablón
      const msg = `¡Felicidades a ${winnerNames.join(', ')} por conseguir la victoria del mes con ${maxScore} aciertos!\n\nTodos los contadores vuelven a cero. ¡El reto de este mes ya ha empezado! Recuerda que el vencedor anual obtendrá premios por fidelidad y mérito.`;
      const id = Date.now().toString();
      await setDoc(doc(db, 'artifacts', appId, 'announcements', id), {
        title: "🏆 ¡Ganadores del Reto del Mes!",
        content: msg,
        date: new Date().toISOString().split('T')[0]
      });

      alert("Mes cerrado con éxito. Puntos guardados en el histórico, marcadores a cero y aviso publicado.");

    } catch (e) {
      alert("Error al cerrar el mes.");
    }
  };

  // --- FUNCIONES SETTINGS GLOBALES ---
  const saveGlobalSettings = async (newSettings) => {
    await setDoc(doc(db, 'artifacts', appId, 'settings', 'global'), newSettings, { merge: true });
    alert('Ajustes guardados correctamente.');
  };

  // --- CÁLCULOS DE RANKINGS ---
  const pendingGestiones = gestiones.filter(g => g.status === 'pendiente');
  
  // 1. Ranking Mensual (Puntos del mes actual)
  const rankMonthly = students.filter(s => s.triviaPoints > 0).sort((a,b) => b.triviaPoints - a.triviaPoints).slice(0,10);
  
  // 2. Ranking Anual (Meses ganados)
  const rankAnnual = students.filter(s => s.triviaVictories > 0).sort((a,b) => b.triviaVictories - a.triviaVictories).slice(0,10);
  
  // 3. Ranking Global Histórico (Puntos Totales guardados + Puntos del mes en curso)
  const rankGlobal = students
    .filter(s => (s.triviaTotalPoints || 0) + (s.triviaPoints || 0) > 0)
    .map(s => ({ ...s, liveTotal: (s.triviaTotalPoints || 0) + (s.triviaPoints || 0) }))
    .sort((a,b) => b.liveTotal - a.liveTotal)
    .slice(0,10);

  if (loading) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center font-black uppercase tracking-widest">Iniciando Modo Dios...</div>;

  return (
    <div className="min-h-screen bg-zinc-100 font-sans text-slate-800 flex flex-col md:flex-row">
      <aside className="w-full md:w-72 bg-zinc-950 text-zinc-300 flex flex-col sticky top-0 z-50 md:h-screen shrink-0 shadow-2xl">
        <div className="p-6 bg-black border-b border-zinc-900 flex justify-between items-center md:block">
          <div>
            <div className="flex items-center gap-3 text-white mb-1"><ShieldAlert className="w-6 h-6 text-red-500" /><h1 className="text-xl font-black uppercase tracking-tight">Modo Dios</h1></div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hidden md:block">Panel de Administración</p>
          </div>
          <button onClick={switchToTeacher} className="md:hidden bg-zinc-800 text-white p-2 rounded-lg"><ArrowRightLeft className="w-5 h-5"/></button>
        </div>
        <nav className="flex-1 overflow-x-auto md:overflow-y-auto flex md:flex-col p-4 gap-2 no-scrollbar">
          {[
            { id: 'gestiones', icon: Inbox, label: 'Bandeja Ent.', count: pendingGestiones.length },
            { id: 'announcements', icon: Megaphone, label: 'Tablón' },
            { id: 'gamification', icon: Trophy, label: 'Retos' },
            { id: 'students', icon: Users, label: 'Alumnos' },
            { id: 'settings', icon: Settings, label: 'Configuración' }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm uppercase tracking-wide transition-all whitespace-nowrap md:whitespace-normal text-left ${activeTab === tab.id ? 'bg-red-600 text-white shadow-lg' : 'hover:bg-zinc-900 hover:text-white'}`}>
              <tab.icon className="w-5 h-5 shrink-0" />
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

      <main className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full">
        
        {/* --- BANDEJA DE GESTIONES --- */}
        {activeTab === 'gestiones' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="mb-8">
              <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Bandeja de Entrada</h2>
              <p className="text-zinc-500 font-medium">Gestiona las solicitudes pendientes de tus alumnos.</p>
            </header>

            {pendingGestiones.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 text-center border-2 border-dashed border-zinc-200">
                <Check className="w-16 h-16 text-emerald-400 mx-auto mb-4 bg-emerald-50 rounded-full p-2" />
                <h3 className="text-xl font-black text-slate-800 uppercase">Todo al día</h3>
                <p className="text-zinc-500">No hay trámites pendientes de revisar.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {pendingGestiones.map(g => (
                  <div key={g.id} className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-200 flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${g.type.includes('mitobox') ? 'bg-blue-100 text-blue-800' : g.type.includes('baja') ? 'bg-red-100 text-red-800' : 'bg-zinc-100 text-zinc-800'}`}>
                          {g.type.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] font-bold text-zinc-400">{formatDateSpanish(g.date)}</span>
                      </div>
                      <h3 className="text-lg font-black text-slate-800">{g.studentName}</h3>
                      <p className="text-xs text-zinc-500 font-bold mb-3">{g.studentEmail}</p>
                      <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100 text-sm text-zinc-700 font-medium">
                        {g.details}
                      </div>
                      {g.targetMonth && <p className="text-xs font-black text-amber-600 uppercase tracking-widest mt-3">Aplicar para: {g.targetMonth}</p>}
                    </div>
                    
                    <div className="flex flex-row md:flex-col gap-2 shrink-0 md:w-48">
                      <button onClick={() => updateGestionStatus(g.id, 'completado')} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase text-[10px] tracking-widest py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-sm">
                        <Check className="w-4 h-4"/> Aprobar / Hecho
                      </button>
                      <button onClick={() => updateGestionStatus(g.id, 'rechazado')} className="flex-1 bg-white hover:bg-red-50 text-red-600 border border-red-200 font-black uppercase text-[10px] tracking-widest py-3 px-4 rounded-xl flex items-center justify-center gap-2">
                        <X className="w-4 h-4"/> Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- PESTAÑA GAMIFICACIÓN (RETOS) --- */}
        {activeTab === 'gamification' && (
          <div className="space-y-8 animate-in fade-in">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Retos y Gamificación</h2>
                <p className="text-zinc-500 font-medium">Rankings de alumnos y gestión de premios.</p>
              </div>
              <button onClick={handleCerrarRetoMensual} className="w-full sm:w-auto bg-amber-500 hover:bg-amber-600 text-white px-6 py-4 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 shadow-lg transition-colors">
                <Award className="w-4 h-4"/> Cerrar Mes
              </button>
            </header>

            {/* TABLAS DE RANKING */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* MENSUAL */}
              <div className="bg-white rounded-3xl shadow-sm border border-amber-200 overflow-hidden flex flex-col h-96">
                <div className="bg-amber-50 p-4 border-b border-amber-100 flex items-center justify-between">
                  <h3 className="font-black uppercase tracking-tight text-amber-900 flex items-center gap-2">
                    <Timer className="w-5 h-5 text-amber-500"/> Mensual
                  </h3>
                  <span className="bg-amber-200 text-amber-800 px-2 py-0.5 rounded text-[10px] font-black uppercase animate-pulse">En curso</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar bg-amber-50/20">
                  {rankMonthly.length === 0 ? <p className="text-xs text-zinc-400 italic">Nadie ha puntuado aún.</p> : rankMonthly.map((s, i) => (
                    <div key={s.id} className="flex items-center justify-between p-3 bg-white border border-amber-100 rounded-xl shadow-sm">
                      <div className="flex items-center gap-3">
                        <span className={`font-black w-6 h-6 rounded-full flex items-center justify-center text-xs ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-slate-300 text-white' : i === 2 ? 'bg-amber-700 text-white' : 'text-zinc-400'}`}>{i+1}</span>
                        <span className="font-bold text-sm text-slate-700 truncate max-w-[100px]">{s.name.split(' ')[0]}</span>
                      </div>
                      <span className="font-black text-amber-600">{s.triviaPoints} <span className="text-[9px] uppercase">pts</span></span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ANUAL */}
              <div className="bg-white rounded-3xl shadow-sm border border-indigo-200 overflow-hidden flex flex-col h-96">
                <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex items-center justify-between">
                  <h3 className="font-black uppercase tracking-tight text-indigo-900 flex items-center gap-2">
                    <Star className="w-5 h-5 text-indigo-500"/> Anual
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar bg-indigo-50/20">
                  {rankAnnual.length === 0 ? <p className="text-xs text-zinc-400 italic">Nadie ha ganado un mes aún.</p> : rankAnnual.map((s, i) => (
                    <div key={s.id} className="flex items-center justify-between p-3 bg-white border border-indigo-100 rounded-xl shadow-sm">
                      <div className="flex items-center gap-3">
                        <span className={`font-black w-6 h-6 rounded-full flex items-center justify-center text-xs ${i === 0 ? 'bg-indigo-500 text-white' : 'text-zinc-400'}`}>{i+1}</span>
                        <span className="font-bold text-sm text-slate-700 truncate max-w-[100px]">{s.name.split(' ')[0]}</span>
                      </div>
                      <span className="font-black text-indigo-600">{s.triviaVictories} <span className="text-[9px] uppercase">Victorias</span></span>
                    </div>
                  ))}
                </div>
              </div>

              {/* GLOBAL / HISTÓRICO */}
              <div className="bg-zinc-900 rounded-3xl shadow-sm border border-zinc-800 overflow-hidden flex flex-col h-96">
                <div className="bg-black p-4 border-b border-zinc-800 flex items-center justify-between">
                  <h3 className="font-black uppercase tracking-tight text-white flex items-center gap-2">
                    <Target className="w-5 h-5 text-zinc-400"/> Global
                  </h3>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar bg-zinc-900/50">
                  {rankGlobal.length === 0 ? <p className="text-xs text-zinc-500 italic">Sin datos históricos.</p> : rankGlobal.map((s, i) => (
                    <div key={s.id} className="flex items-center justify-between p-3 bg-zinc-800 border border-zinc-700 rounded-xl">
                      <div className="flex items-center gap-3">
                        <span className="font-black text-zinc-500 text-xs w-4">{i+1}.</span>
                        <span className="font-bold text-sm text-zinc-300 truncate max-w-[100px]">{s.name.split(' ')[0]}</span>
                      </div>
                      <span className="font-black text-white">{s.liveTotal} <span className="text-[9px] text-zinc-500 uppercase">pts</span></span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* PREMIOS INTERNOS */}
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-zinc-200 shadow-sm mt-8">
              <div className="flex items-center gap-3 mb-6">
                <Gift className="w-6 h-6 text-black"/>
                <h3 className="text-xl font-black uppercase tracking-tight">Estrategia de Premios (Interno)</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Objetivo Trimestral</label>
                  <textarea 
                    value={settings.prizes?.trimestral || ''} 
                    onChange={e => setSettings({...settings, prizes: {...settings.prizes, trimestral: e.target.value}})}
                    placeholder="Ej: Juego de púas gratis, o camiseta de la escuela..."
                    className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-black outline-none min-h-[100px] text-sm font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Gran Premio Anual</label>
                  <textarea 
                    value={settings.prizes?.anual || ''} 
                    onChange={e => setSettings({...settings, prizes: {...settings.prizes, anual: e.target.value}})}
                    placeholder="Ej: 1 mes de Mitoverso gratis o grabación en estudio..."
                    className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:border-black outline-none min-h-[100px] text-sm font-medium"
                  />
                </div>
              </div>
              <button onClick={() => saveGlobalSettings(settings)} className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800 px-6 py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-colors">
                Guardar Notas de Premios
              </button>
            </div>

          </div>
        )}

        {/* --- TABLÓN (MEGÁFONO) --- */}
        {activeTab === 'announcements' && (
          <div className="space-y-8 animate-in fade-in">
            <header>
              <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Tablón de Avisos</h2>
              <p className="text-zinc-500 font-medium">Publica noticias en el muro principal de los alumnos.</p>
            </header>

            {/* POSTEAR AVISO */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-zinc-200">
              <h3 className="font-black uppercase tracking-widest text-xs text-zinc-400 mb-4 flex items-center gap-2"><Plus className="w-4 h-4"/> Nuevo Aviso</h3>
              <div className="space-y-4">
                <input type="text" placeholder="Titular impactante..." value={newAnnounce.title} onChange={e => setNewAnnounce({...newAnnounce, title: e.target.value})} className="w-full p-4 bg-zinc-50 border-2 border-zinc-100 rounded-xl focus:border-black outline-none font-black text-sm" />
                <textarea placeholder="Detalles del aviso..." value={newAnnounce.content} onChange={e => setNewAnnounce({...newAnnounce, content: e.target.value})} className="w-full p-4 bg-zinc-50 border-2 border-zinc-100 rounded-xl focus:border-black outline-none min-h-[120px] resize-y font-medium text-sm" />
                <button onClick={postAnnouncement} className="w-full md:w-auto bg-black text-white px-8 py-4 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-zinc-800 shadow-md">
                  <Megaphone className="w-4 h-4"/> Publicar Aviso
                </button>
              </div>
            </div>

            <div className="space-y-4 pt-8 border-t border-zinc-200">
              <h3 className="font-black uppercase tracking-widest text-xs text-zinc-400 px-2">Historial de Avisos</h3>
              {announcements.map(ann => (
                <div key={ann.id} className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-200 flex justify-between items-start gap-4">
                  <div>
                    <h4 className="font-black text-slate-800 text-lg leading-tight">{ann.title}</h4>
                    <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">{formatDateSpanish(ann.date)}</p>
                    <p className="text-sm text-zinc-600 line-clamp-2">{ann.content}</p>
                  </div>
                  <button onClick={() => deleteAnnouncement(ann.id)} className="p-3 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl transition-colors shrink-0">
                    <Trash2 className="w-5 h-5"/>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- DIRECTORIO ALUMNOS (CRM) --- */}
        {activeTab === 'students' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Alumnos (CRM)</h2>
                <p className="text-zinc-500 font-medium">Activa o desactiva servicios premium.</p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="w-5 h-5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="Buscar alumno..." 
                  value={searchStudent}
                  onChange={e => setSearchStudent(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-zinc-200 rounded-xl focus:border-red-500 outline-none font-bold text-sm"
                />
              </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {students.filter(s => s.name.toLowerCase().includes(searchStudent.toLowerCase())).map(student => (
                <div key={student.id} className="bg-white p-5 rounded-2xl shadow-sm border border-zinc-200 flex flex-col justify-between h-full gap-4">
                  <div>
                    <h3 className="font-black text-lg text-slate-800 leading-tight">{student.name}</h3>
                    <p className="text-xs text-zinc-400 font-bold mt-1">{student.email || 'Sin email'}</p>
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {student.instruments?.map(inst => (
                        <span key={inst} className="bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded text-[10px] font-black uppercase">{inst}</span>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 pt-4 border-t border-zinc-100">
                    <button 
                      onClick={() => toggleStudentService(student.id, 'hasMitoverso', student.hasMitoverso)}
                      className={`flex-1 flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${student.hasMitoverso ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-zinc-100 text-zinc-400 hover:border-indigo-200'}`}
                    >
                      <MonitorPlay className="w-5 h-5 mb-1" />
                      <span className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Mitoverso</span>
                      <span className={`text-[9px] font-bold uppercase ${student.hasMitoverso ? 'text-indigo-500' : 'text-zinc-300'}`}>{student.hasMitoverso ? 'ON' : 'OFF'}</span>
                    </button>

                    <button 
                      onClick={() => toggleStudentService(student.id, 'hasMitobox', student.hasMitobox)}
                      className={`flex-1 flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${student.hasMitobox ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-zinc-100 text-zinc-400 hover:border-blue-200'}`}
                    >
                      <DoorOpen className="w-5 h-5 mb-1" />
                      <span className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Mitobox</span>
                      <span className={`text-[9px] font-bold uppercase ${student.hasMitobox ? 'text-blue-500' : 'text-zinc-300'}`}>{student.hasMitobox ? 'ON' : 'OFF'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- CONFIGURACIÓN GLOBAL --- */}
        {activeTab === 'settings' && (
          <div className="space-y-8 animate-in fade-in">
            <header className="mb-8">
              <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight">Configuración</h2>
              <p className="text-zinc-500 font-medium">Ajustes globales y legales de la escuela.</p>
            </header>

            {/* TARIFA CONVENIO */}
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-zinc-200 shadow-sm">
              <h2 className="text-xl font-bold uppercase mb-2 flex items-center gap-2 tracking-wide"><Lock className="w-5 h-5"/> Coste de Hora (Convenio)</h2>
              <p className="text-zinc-500 mb-6 text-sm">Este valor se usará para calcular la nómina de todos los profesores.</p>
              <div className="flex items-center gap-4 bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                <input type="number" step="0.01" value={settings.hourlyRate} onChange={e => setSettings({...settings, hourlyRate: e.target.value})} className="text-2xl font-bold w-32 p-2 border-b-4 border-black outline-none bg-transparent" />
                <span className="text-2xl font-bold">€ / hora</span>
                <button onClick={() => saveGlobalSettings(settings)} className="ml-auto bg-black hover:bg-zinc-800 text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider transition-colors shadow-md">Actualizar Valor</button>
              </div>
            </div>

            {/* CALENDARIO ESCOLAR */}
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-zinc-200 shadow-sm">
              <h2 className="text-xl font-bold uppercase mb-2 flex items-center gap-2 tracking-wide"><Calendar className="w-5 h-5"/> Calendario Escolar</h2>
              <p className="text-zinc-500 mb-8 text-sm">Bloquea días a nivel global. Los Festivos no suman a nómina. Las Vacaciones sumarán la media diaria del mes anterior.</p>
              
              <div className="flex flex-col sm:flex-row gap-3 mb-8">
                <input id="adminDateInput" type="date" className="p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl focus:border-black outline-none font-bold flex-1" />
                <select id="adminDateType" className="p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl focus:border-black outline-none font-bold uppercase text-xs">
                  <option value="festivo">Festivo</option>
                  <option value="vacacion">Vacaciones</option>
                </select>
                <button onClick={() => { 
                  const d = document.getElementById('adminDateInput').value;
                  const t = document.getElementById('adminDateType').value;
                  if(d) {
                    const arr = t === 'festivo' ? (settings.festivos||[]) : (settings.vacaciones||[]);
                    if(!arr.includes(d)) {
                      const s = {...settings, [t === 'festivo' ? 'festivos' : 'vacaciones']: [...arr, d]};
                      setSettings(s); saveGlobalSettings(s);
                    }
                  }
                }} className="bg-black text-white px-8 py-4 rounded-2xl shadow-lg font-black uppercase text-[10px]"><Plus/></button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-black text-amber-600 uppercase tracking-widest text-[10px] mb-3 border-b pb-2 flex items-center gap-2"><PartyPopper className="w-4 h-4"/> Días Festivos</h4>
                  <div className="space-y-2">
                    {(!settings.festivos || settings.festivos.length === 0) && <p className="text-xs text-zinc-400 italic">No hay festivos.</p>}
                    {settings.festivos?.sort().map(f => (
                      <div key={f} className="flex justify-between p-3 bg-amber-50 rounded-xl text-xs font-bold text-amber-900">{formatDateSpanish(f)} <button onClick={() => {const s = {...settings, festivos: settings.festivos.filter(x => x !== f)}; setSettings(s); saveGlobalSettings(s);}}><Trash2 className="w-4 h-4 hover:text-red-500"/></button></div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-black text-emerald-600 uppercase tracking-widest text-[10px] mb-3 border-b pb-2 flex items-center gap-2"><Palmtree className="w-4 h-4"/> Vacaciones</h4>
                  <div className="space-y-2">
                    {(!settings.vacaciones || settings.vacaciones.length === 0) && <p className="text-xs text-zinc-400 italic">No hay vacaciones.</p>}
                    {settings.vacaciones?.sort().map(v => (
                      <div key={v} className="flex justify-between p-3 bg-emerald-50 rounded-xl text-xs font-bold text-emerald-900">{formatDateSpanish(v)} <button onClick={() => {const s = {...settings, vacaciones: settings.vacaciones.filter(x => x !== v)}; setSettings(s); saveGlobalSettings(s);}}><Trash2 className="w-4 h-4 hover:text-red-500"/></button></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* TAREAS HORA MUERTA */}
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-zinc-200 shadow-sm">
              <h2 className="text-xl font-bold uppercase mb-2 flex items-center gap-2 tracking-wide"><Check className="w-5 h-5"/> Tareas Generales (Hora Muerta)</h2>
              <p className="text-zinc-500 mb-6 text-sm">Estas opciones aparecerán cuando un profesor tenga una hora libre entre clases.</p>
              
              <div className="flex flex-col sm:flex-row gap-2 mb-6">
                <input id="adminTaskInput" type="text" placeholder="Ej: Ordenar partituras del aula..." className="flex-1 p-3 bg-zinc-50 border border-zinc-200 focus:border-black outline-none rounded-xl" />
                <button 
                  onClick={() => { 
                    const val = document.getElementById('adminTaskInput').value;
                    if(val) { 
                      const s = {...settings, generalTasks: [...(settings.generalTasks||[]), val]}; 
                      setSettings(s); saveGlobalSettings(s); 
                      document.getElementById('adminTaskInput').value = ''; 
                    } 
                  }} 
                  className="bg-black text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center justify-center gap-2 hover:bg-zinc-800"
                >
                  <Plus className="w-4 h-4"/> Añadir
                </button>
              </div>
              
              <div className="space-y-3">
                {settings.generalTasks?.length === 0 && <p className="text-zinc-400 italic text-sm p-4 text-center bg-zinc-50 rounded-xl">No hay tareas configuradas.</p>}
                {settings.generalTasks?.map((t, i) => (
                  <div key={i} className="flex justify-between items-center p-4 bg-zinc-50 border border-zinc-100 rounded-xl">
                    <span className="font-medium text-slate-700">{t}</span>
                    <button onClick={() => { const s = {...settings, generalTasks: settings.generalTasks.filter((_, idx) => idx !== i)}; setSettings(s); saveGlobalSettings(s); }} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors"><Trash2 className="w-5 h-5"/></button>
                  </div>
                ))}
              </div>
            </div>

            {/* CONTRATO */}
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-zinc-200 shadow-sm">
              <div className="flex items-center gap-3 mb-2">
                <FileText className="w-6 h-6 text-black"/>
                <h3 className="text-xl font-black uppercase tracking-tight">Contrato de Servicios</h3>
              </div>
              <p className="text-sm text-zinc-500 mb-6">Este es el texto legal que los alumnos pueden leer en su app. Pega aquí el contrato de Tadosi.</p>
              
              <textarea 
                value={settings.contract || ''}
                onChange={e => setSettings({...settings, contract: e.target.value})}
                className="w-full p-5 bg-zinc-50 border-2 border-zinc-200 rounded-xl focus:border-black outline-none font-medium text-sm text-slate-700 min-h-[300px] resize-y mb-4"
                placeholder="Pega aquí el texto completo del contrato de prestación de servicios..."
              />
              <button onClick={() => saveGlobalSettings(settings)} className="bg-black text-white px-8 py-4 rounded-xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-zinc-800 shadow-md">
                <Check className="w-4 h-4"/> Actualizar Contrato
              </button>
            </div>
            
          </div>
        )}

      </main>
    </div>
  );
}
