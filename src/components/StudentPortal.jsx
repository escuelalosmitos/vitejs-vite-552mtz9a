import React, { useState } from 'react';
import { Music, LogOut, Calendar, Ticket, BookOpen, Video, Info, MessageSquare, LayoutGrid, AlertCircle } from 'lucide-react';

export default function StudentPortal({ user, logout }) {
  const [activeTab, setActiveTab] = useState('home');

  const mockData = {
    nextClass: { day: "Mañana", time: "18:00", room: "Sala 2", hq: "Reus", teacher: "Diego" },
    tickets: 1, maxTickets: 2,
    lastLog: "Ayer practicamos el cambio rápido entre Sol y Do. ¡Sigue así!"
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-slate-800 pb-24 relative">
      <header className="bg-white p-5 sticky top-0 z-50 shadow-sm border-b border-zinc-200">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-black p-2 rounded-xl text-white"><Music className="w-5 h-5"/></div>
            <div>
              <h1 className="text-lg font-black uppercase tracking-tighter leading-none">Mi Portal</h1>
              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{user.email}</span>
            </div>
          </div>
          <button onClick={logout} className="p-2 text-zinc-400 hover:text-rose-500 transition-all"><LogOut className="w-5 h-5" /></button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
        {activeTab === 'home' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-black text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
                <p className="text-zinc-400 font-bold uppercase text-[10px] tracking-widest mb-1 flex items-center gap-1.5"><Calendar className="w-3 h-3"/> Tu próxima clase</p>
                <h2 className="text-3xl font-black uppercase tracking-tighter">{mockData.nextClass.day}</h2>
                <p className="text-lg font-medium text-zinc-300 mb-6">{mockData.nextClass.time}h</p>
                
                <div className="flex items-center gap-4 text-sm font-medium text-zinc-300 mb-8 bg-zinc-800/50 p-4 rounded-2xl border border-zinc-700/50">
                  <span>👤 Prof: {mockData.nextClass.teacher}</span> <span className="text-zinc-600">•</span> <span>🏢 {mockData.nextClass.hq} ({mockData.nextClass.room})</span>
                </div>

                <button onClick={() => alert("Función disponible próximamente")} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-black py-4 px-6 rounded-xl flex items-center justify-center gap-2 uppercase text-xs tracking-widest border border-zinc-700">
                  <AlertCircle className="w-4 h-4 text-amber-400" /> No podré asistir
                </button>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-zinc-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-slate-800 uppercase tracking-tight text-lg flex items-center gap-2"><Ticket className="w-5 h-5 text-amber-500"/> Recuperaciones</h3>
                <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-lg text-xs font-black">{mockData.tickets} / {mockData.maxTickets}</span>
              </div>
              <button className="w-full bg-amber-400 text-amber-950 font-black py-4 rounded-xl shadow-sm hover:bg-amber-300 uppercase text-xs tracking-widest">
                Canjear Ticket Libre
              </button>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 w-full bg-white border-t border-zinc-200 pb-safe z-40">
        <div className="flex justify-around p-2">
          {[
            {id:'home', i:LayoutGrid, label:'Inicio'}, 
            {id:'news', i:Info, label:'Avisos'}, 
            {id:'contact', i:MessageSquare, label:'Gestiones'}
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} className={`p-3 rounded-xl flex flex-col items-center gap-1 transition-all ${activeTab === t.id ? 'text-black' : 'text-zinc-400'}`}>
              <t.i className="w-6 h-6"/>
              <span className="text-[10px] font-bold">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
