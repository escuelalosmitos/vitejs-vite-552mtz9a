import React, { useState, useEffect } from 'react';
import { Music, Lock, RefreshCw } from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// --- MÓDULOS ---
import TeacherPortal from './components/TeacherPortal';
import StudentPortal from './components/StudentPortal';

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyAtVRPZ-nprU-JyahuAhmMjXiqaKzO-0kM",
  authDomain: "escuela-musica-app.firebaseapp.com",
  projectId: "escuela-musica-app",
  storageBucket: "escuela-musica-app.firebasestorage.app",
  messagingSenderId: "303855837130",
  appId: "1:303855837130:web:c662eefe0cc718bde37933"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'default-app-id';
const ADMIN_EMAIL = 'paco@escuelalosmitos.com';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbz_MEKpKnv-L1g0e1khYf45nXCQKuUx6ZP3-bYwypTyrYzWadR4yzDd4ambExbQquvo/exec';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      alert("Error de credenciales. Revisa tu email y contraseña.");
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <RefreshCw className="animate-spin text-black w-10 h-10" />
    </div>
  );

  // --- PANTALLA DE LOGIN UNIFICADA ---
  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md text-center">
          <div className="bg-black text-white p-4 rounded-2xl mb-6 inline-block rotate-3"><Music/></div>
          <h1 className="text-3xl font-black uppercase tracking-tighter mb-8">Los Mitos</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="email" placeholder="Tu Email" required value={email} onChange={e => setEmail(e.target.value)} className="w-full p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl outline-none focus:border-black font-medium" />
            <input type="password" placeholder="Contraseña" required value={password} onChange={e => setPassword(e.target.value)} className="w-full p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl outline-none focus:border-black font-medium" />
            <button type="submit" className="w-full bg-black text-white font-black py-4 rounded-xl uppercase tracking-widest text-sm mt-4 flex justify-center items-center gap-2">
              <Lock className="w-4 h-4"/> Entrar al Ecosistema
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- RUTEO INTELIGENTE ---
  // Si el email tiene la palabra "alumno" (ej: hugo@alumno.com) carga el portal de alumnos.
  if (user.email.includes('alumno')) {
    return <StudentPortal user={user} logout={handleLogout} />;
  }

  // Si no tiene "alumno", asume que es profesor o admin.
  return (
    <TeacherPortal 
      user={user} 
      logout={handleLogout} 
      db={db} 
      auth={auth} 
      appId={appId} 
      ADMIN_EMAIL={ADMIN_EMAIL}
      APPS_SCRIPT_URL={APPS_SCRIPT_URL}
    />
  );
}
