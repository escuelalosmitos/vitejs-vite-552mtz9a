import React, { useState, useEffect, useMemo } from 'react';
import { 
  Inbox, Users, Megaphone, Settings, LogOut, Search, MonitorPlay, 
  DoorOpen, Check, X, Trash2, Calendar, FileText, Plus, ShieldAlert, 
  ArrowRightLeft, PartyPopper, Palmtree, Lock, Trophy, Award, Gift, Star, 
  Target, Timer, BookOpen, AlertTriangle, Calculator, ChevronDown, ChevronUp
} from 'lucide-react';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, collectionGroup } from 'firebase/firestore';

const formatDateSpanish = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getDayName = (dayIndex) => ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][dayIndex];

export default function AdminPortal({ user, logout, db, appId, switchToTeacher }) {
  const [activeTab, setActiveTab] = useState('gestiones');
  const [loading, setLoading] = useState(true);

  // --- DATOS GLOBALES ---
  const [gestiones, setGestiones] = useState([]);
  const [students, setStudents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [allClasses, setAllClasses] = useState([]);
  const [allRecords, setAllRecords] = useState([]);
  const [settings, setSettings] = useState({ 
    festivos: [], vacaciones: [], contract: '', hourlyRate: 17.33, generalTasks: [],
    prizes: { trimestral: '', anual: '' }
  });

  // --- ESTADOS LOCALES UI ---
  const [searchStudent, setSearchStudent] = useState('');
  const [newAnnounce, setNewAnnounce] = useState({ title: '', content: '' });
  const [expandedTeacher, setExpandedTeacher] = useState(null); // Para el desplegable de clases

  useEffect(() => {
    let loaded = 0;
    const checkLoad = () => { loaded++; if(loaded === 6) setLoading(false); };

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
    // NUEVOS LISTENERS PARA INTELIGENCIA DE NEGOCIO
    const unsubClasses = onSnapshot(collectionGroup(db, 'recurringClasses'), (snap) => {
      setAllClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      checkLoad();
    });
    const unsubRecords = onSnapshot(collectionGroup(db, 'records'), (snap) => {
      setAllRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      checkLoad();
    });

    return () => { unsubGestiones(); unsubStudents(); unsubAnnouncements(); unsubSettings(); unsubClasses(); unsubRecords(); };
  }, [appId, db]);

  // --- FUNCIONES GESTIONES ---
  const updateGestionStatus = async (id, status) => {
    if(window.confirm(`¿Marcar este trámite como ${status.toUpperCase()}?`)) {
      await updateDoc(doc(db, 'artifacts', appId, 'gestiones', id), { status });
    }
  };

  // --- FUNCIONES ALUMNOS (CRM) ---
  const toggleStudentToggle = async (studentId, field, currentValue) => {
    const isStatusField = field === 'globalStatus';
    const newStatus = isStatusField ? (currentValue === 'congelado' ? 'activo' : 'congelado') : !currentValue;
    
    if(window.confirm(`¿Cambiar este ajuste a ${isStatusField ? newStatus.toUpperCase() : (newStatus ? 'ON' : 'OFF')}?`)) {
      await updateDoc(doc(db, 'artifacts', appId, 'students', studentId), { [field]: newStatus });
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

  // --- CIERRE DE RETO MENSUAL ---
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
        updatePromises.push(updateDoc(doc(db, 'artifacts', appId, 'students', w.id), {
          triviaVictories: (w.triviaVictories || 0) + 1
        }));
      });

      players.forEach(p => {
        const currentTotal = p.triviaTotalPoints || 0;
        updatePromises.push(updateDoc(doc(db, 'artifacts', appId, 'students', p.id), {
          triviaTotalPoints: currentTotal + p.triviaPoints,
          triviaPoints: 0
        }));
      });

      await Promise.all(updatePromises);

      const msg = `¡Felicidades a ${winnerNames.join(', ')} por conseguir la victoria del mes con ${maxScore} aciertos!\n\nTodos los contadores vuelven a cero. ¡El reto de este mes ya ha empezado! Recuerda que el vencedor anual obtendrá premios por fidelidad y mérito.`;
      const id = Date.now().toString();
      await setDoc(doc(db, 'artifacts', appId, 'announcements', id), {
        title: "🏆 ¡Ganadores del Reto del Mes!",
        content: msg,
        date: new Date().toISOString().split('T')[0]
      });

      alert("Mes cerrado con éxito.");

    } catch (e) {
      alert("Error al cerrar el mes.");
    }
  };

  const saveGlobalSettings = async (newSettings) => {
    await setDoc(doc(db, 'artifacts', appId, 'settings', 'global'), newSettings, { merge: true });
    alert('Ajustes guardados correctamente.');
  };

  // --- CÁLCULOS ANALÍTICOS ---
  const pendingGestiones = gestiones.filter(g => g.status === 'pendiente');
  const rankMonthly = students.filter(s => s.triviaPoints > 0).sort((a,b) => b.triviaPoints - a.triviaPoints).slice(0,10);
  const rankAnnual = students.filter(s => s.triviaVictories > 0).sort((a,b) => b.triviaVictories - a.triviaVictories).slice(0,10);
  const rankGlobal = students.filter(s => (s.triviaTotalPoints || 0) + (s.triviaPoints || 0) > 0)
    .map(s => ({ ...s, liveTotal: (s.triviaTotalPoints || 0) + (s.triviaPoints || 0) }))
    .sort((a,b) => b.liveTotal - a.liveTotal).slice(0,10);

  // AGRUPACIÓN DE CLASES POR PROFESOR
  const classesByTeacher = useMemo(() => {
    const grouped = {};
    allClasses.forEach(c => {
      const teacherName = c.teacher || 'Sin Asignar';
      if (!grouped[teacherName]) grouped[teacherName] = [];
      grouped[teacherName].push(c);
    });
    // Ordenamos las clases dentro de cada profesor por día y hora
    Object.keys(grouped).forEach(t => {
      grouped[t].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.time.localeCompare(b.time));
    });
    return grouped;
  }, [allClasses]);

  // CLASES EN PELIGRO (Capacidad > 1 y ocupación <= 50%)
  const dangerClasses = useMemo(() => {
    return allClasses.filter(c => {
      const cap = parseInt(c.capacity) || 0;
      if (cap <= 1) return false; // Ignoramos clases particulares
      const activeCount = (c.students || []).filter(s => !s.isPaused).length;
      return activeCount <= (cap / 2);
    }).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.time.localeCompare(b.time));
  }, [allClasses]);

  // NÓMINAS DE PROFESORES DEL MES EN CURSO
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
    
    // Transformar a array para pintar
    return Object.entries(payroll).map(([name, hours]) => ({
      name,
      hours: hours.toFixed(2),
      earnings: (hours * (settings.hourlyRate || 17.33)).toFixed(2)
    })).sort((a, b) => b.hours - a.hours);

  }, [allRecords, settings.hourlyRate]);


  if (loading) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center font-black uppercase tracking-widest">Iniciando Modo Dios...</div>;

  return (
    <div className="min-h-screen bg-zinc-100 font-sans text-slate-800 flex flex-col md:flex-row">
      
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

      <main className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full">
        
        {/* --- 1. BANDEJA DE GESTIONES (FORMATO FILA) --- */}
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
                  <table className="w-full text-left border-collapse">
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
                          </td>
                          <td className="p-4 max-w-xs truncate text-xs" title={g.details}>{g.details}</td>
                          <td className="p-4 text-right whitespace-nowrap">
                            <button onClick={() => updateGestionStatus(g.id, 'completado')} className="p-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg mr-2 transition-colors" title="Aprobar / Hecho"><Check className="w-4 h-4"/></button>
                            <button onClick={() => updateGestionStatus(g.id, 'rechazado')} className="p-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors" title="Rechazar"><X className="w-4 h-4"/></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- 2. ALUMNOS CRM (FORMATO FILA E INTERRUPTORES) --- */}
        {activeTab === 'students' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Directorio Alumnos</h2>
                <p className="text-zinc-500 font-medium text-sm">Activa servicios premium o congela cuentas.</p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" placeholder="Buscar por nombre..." value={searchStudent} onChange={e => setSearchStudent(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:border-black outline-none font-bold text-sm"
                />
              </div>
            </header>

            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-zinc-50 text-[10px] uppercase tracking-widest text-zinc-400 border-b border-zinc-200">
                      <th className="p-4 font-black">Alumno</th>
                      <th className="p-4 font-black text-center">Mitoverso</th>
                      <th className="p-4 font-black text-center">Mitobox</th>
                      <th className="p-4 font-black text-center">Estado (Alta/Mantenimiento)</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm font-medium text-slate-700">
                    {students.filter(s => s.name.toLowerCase().includes(searchStudent.toLowerCase())).map(student => {
                      const isCongelado = student.globalStatus === 'congelado';
                      return (
                        <tr key={student.id} className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors">
                          <td className="p-4">
                            <div className={`font-black ${isCongelado ? 'text-zinc-400 line-through' : 'text-slate-900'}`}>{student.name}</div>
                            <div className="text-[10px] text-zinc-400 font-bold">{student.email || 'Sin email'}</div>
                          </td>
                          <td className="p-4 text-center">
                            <button onClick={() => toggleStudentToggle(student.id, 'hasMitoverso', student.hasMitoverso)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${student.hasMitoverso ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-zinc-100 text-zinc-400 border border-zinc-200 hover:bg-zinc-200'}`}>
                              {student.hasMitoverso ? 'ON' : 'OFF'}
                            </button>
                          </td>
                          <td className="p-4 text-center">
                            <button onClick={() => toggleStudentToggle(student.id, 'hasMitobox', student.hasMitobox)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${student.hasMitobox ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-zinc-100 text-zinc-400 border border-zinc-200 hover:bg-zinc-200'}`}>
                              {student.hasMitobox ? 'ON' : 'OFF'}
                            </button>
                          </td>
                          <td className="p-4 text-center">
                            <button onClick={() => toggleStudentToggle(student.id, 'globalStatus', student.globalStatus)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-colors ${!isCongelado ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-200'}`}>
                              {!isCongelado ? 'ACTIVO' : 'CONGELADO'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --- 3. CLASES POR PROFESOR --- */}
        {activeTab === 'classes' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="mb-6">
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Mapa de Clases</h2>
              <p className="text-zinc-500 font-medium text-sm">Visión global de todos los grupos activos por profesor.</p>
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
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {classes.map(c => {
                              const activeC = (c.students || []).filter(s => !s.isPaused).length;
                              return (
                                <div key={c.id} className="p-4 rounded-xl border border-zinc-100 bg-white shadow-sm flex justify-between items-center">
                                  <div>
                                    <div className="font-black text-sm uppercase">{getDayName(c.dayOfWeek)} <span className="text-black bg-zinc-100 px-1.5 py-0.5 rounded ml-1">{c.time}</span></div>
                                    <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">{c.subject} • {c.sede}</div>
                                  </div>
                                  <div className="text-right">
                                    <span className={`text-sm font-black ${activeC >= (c.capacity || 4) ? 'text-emerald-500' : 'text-amber-500'}`}>
                                      {activeC} / {c.capacity || '?'}
                                    </span>
                                    <div className="text-[9px] uppercase font-bold text-zinc-400 tracking-widest">Alumnos</div>
                                  </div>
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

        {/* --- 4. CLASES EN PELIGRO --- */}
        {activeTab === 'danger' && (
          <div className="space-y-6 animate-in fade-in">
            <header className="mb-6 flex items-center gap-3">
              <div className="bg-red-100 p-3 rounded-xl"><AlertTriangle className="w-6 h-6 text-red-600"/></div>
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Grupos en Peligro</h2>
                <p className="text-zinc-500 font-medium text-sm">Clases grupales al 50% de ocupación o menos.</p>
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
                  const isCritical = activeC <= 1; // 1 o 0 alumnos
                  return (
                    <div key={c.id} className={`p-5 rounded-2xl border-2 shadow-sm ${isCritical ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                      <div className="flex justify-between items-start mb-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${isCritical ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'}`}>
                          {isCritical ? 'Crítico' : 'Revisar'}
                        </span>
                        <span className="font-black text-lg">{activeC} / {c.capacity}</span>
                      </div>
                      <h4 className="font-black uppercase tracking-tight text-slate-900">{c.subject}</h4>
                      <p className="text-xs font-bold text-slate-600 mb-2">{getDayName(c.dayOfWeek)} a las {c.time}h</p>
                      <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 bg-white/50 px-2 py-1 rounded inline-block">Prof: {c.teacher}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* --- 5. PROFESORES (NÓMINAS) --- */}
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

        {/* --- EL RESTO DE PESTAÑAS (TABLÓN, GAMIFICACIÓN, SETTINGS) SE MANTIENEN IGUAL QUE ANTES, LIGERAMENTE ADAPTADAS AL DISEÑO LIMPIO --- */}
        
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
              {/* Tablas de Ranking Idénticas a la versión anterior */}
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

        {/* --- SETTINGS --- */}
        {activeTab === 'settings' && (
          <div className="space-y-6 animate-in fade-in">
             <header className="mb-6">
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Configuración</h2>
              <p className="text-zinc-500 font-medium text-sm">Ajustes globales y legales.</p>
            </header>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
                <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2"><Lock className="w-4 h-4 text-black"/> Tarifa Convenio</h3>
                <div className="flex items-center gap-4 bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                  <input type="number" step="0.01" value={settings.hourlyRate} onChange={e => setSettings({...settings, hourlyRate: e.target.value})} className="text-xl font-bold w-24 p-1 border-b-2 border-black outline-none bg-transparent" />
                  <span className="text-xl font-bold">€ / hora</span>
                  <button onClick={() => saveGlobalSettings(settings)} className="ml-auto bg-black hover:bg-zinc-800 text-white px-4 py-2 rounded-lg font-bold uppercase text-[10px] tracking-wider shadow-sm">Actualizar</button>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
                <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2"><Check className="w-4 h-4 text-black"/> Tareas de Hora Muerta</h3>
                <div className="flex gap-2 mb-4">
                  <input id="adminTaskInput" type="text" placeholder="Ej: Ordenar partituras..." className="flex-1 p-2 text-sm bg-zinc-50 border border-zinc-200 outline-none rounded-lg" />
                  <button onClick={() => { const val = document.getElementById('adminTaskInput').value; if(val) { const s = {...settings, generalTasks: [...(settings.generalTasks||[]), val]}; setSettings(s); saveGlobalSettings(s); document.getElementById('adminTaskInput').value = ''; } }} className="bg-black text-white px-4 rounded-lg font-bold uppercase text-[10px] hover:bg-zinc-800"><Plus className="w-4 h-4"/></button>
                </div>
                <div className="space-y-2 max-h-32 overflow-y-auto pr-2">
                  {settings.generalTasks?.map((t, i) => (
                    <div key={i} className="flex justify-between items-center p-2 text-xs bg-zinc-50 border border-zinc-100 rounded-lg"><span className="font-medium">{t}</span><button onClick={() => { const s = {...settings, generalTasks: settings.generalTasks.filter((_, idx) => idx !== i)}; setSettings(s); saveGlobalSettings(s); }} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 className="w-4 h-4"/></button></div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2"><Calendar className="w-4 h-4 text-black"/> Calendario Escolar</h3>
              <div className="flex flex-col sm:flex-row gap-2 mb-6">
                <input id="adminDateInput" type="date" className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none font-bold text-sm" />
                <select id="adminDateType" className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl outline-none font-bold text-xs uppercase">
                  <option value="festivo">Festivo</option>
                  <option value="vacacion">Vacaciones</option>
                </select>
                <button onClick={() => { const d = document.getElementById('adminDateInput').value; const t = document.getElementById('adminDateType').value; if(d) { const arr = t === 'festivo' ? (settings.festivos||[]) : (settings.vacaciones||[]); if(!arr.includes(d)) { const s = {...settings, [t === 'festivo' ? 'festivos' : 'vacaciones']: [...arr, d]}; setSettings(s); saveGlobalSettings(s); } } }} className="bg-black text-white px-6 py-3 rounded-xl shadow-md font-black uppercase text-[10px]"><Plus className="w-4 h-4 inline"/></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-black text-amber-600 uppercase tracking-widest text-[10px] mb-2 flex items-center gap-1"><PartyPopper className="w-3 h-3"/> Festivos</h4>
                  <div className="space-y-1">
                    {settings.festivos?.sort().map(f => (
                      <div key={f} className="flex justify-between p-2 bg-amber-50 rounded-lg text-xs font-bold text-amber-900">{formatDateSpanish(f)} <button onClick={() => {const s = {...settings, festivos: settings.festivos.filter(x => x !== f)}; setSettings(s); saveGlobalSettings(s);}}><Trash2 className="w-3 h-3 text-amber-400 hover:text-red-500"/></button></div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="font-black text-emerald-600 uppercase tracking-widest text-[10px] mb-2 flex items-center gap-1"><Palmtree className="w-3 h-3"/> Vacaciones</h4>
                  <div className="space-y-1">
                    {settings.vacaciones?.sort().map(v => (
                      <div key={v} className="flex justify-between p-2 bg-emerald-50 rounded-lg text-xs font-bold text-emerald-900">{formatDateSpanish(v)} <button onClick={() => {const s = {...settings, vacaciones: settings.vacaciones.filter(x => x !== v)}; setSettings(s); saveGlobalSettings(s);}}><Trash2 className="w-3 h-3 text-emerald-400 hover:text-red-500"/></button></div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
              <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400 mb-4 flex items-center gap-2"><FileText className="w-4 h-4 text-black"/> Contrato Legal de Servicios</h3>
              <textarea value={settings.contract || ''} onChange={e => setSettings({...settings, contract: e.target.value})} className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl outline-none font-medium text-xs text-slate-700 min-h-[200px] resize-y mb-4" placeholder="Pega aquí el texto completo..." />
              <button onClick={() => saveGlobalSettings(settings)} className="bg-black text-white px-6 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 shadow-sm">Guardar Contrato</button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
