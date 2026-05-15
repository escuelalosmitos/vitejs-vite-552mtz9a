import React, { useState, useEffect } from 'react';
import { Music, Lock, RefreshCw, UserPlus } from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// --- MÓDULOS ---
import TeacherPortal from './components/TeacherPortal.jsx';
import StudentPortal from './components/StudentPortal.jsx';
import AdminPortal from './components/AdminPortal.jsx'; // <-- IMPORTAMOS EL MODO DIOS

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
  
  // NUEVOS ESTADOS PARA GESTIONAR EL REGISTRO
  const [isLoginMode, setIsLoginMode] = useState(true); 
  const [authError, setAuthError] = useState(''); 
  
  // ESTADO PARA EL SWITCHER DEL ADMIN
  const [viewMode, setViewMode] = useState('admin'); // 'admin' o 'teacher'

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      if (isLoginMode) {
        // MODO ENTRAR
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        // MODO REGISTRO
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      // TRADUCCIÓN DE ERRORES AL ESPAÑOL PARA EL USUARIO
      if (err.code === 'auth/email-already-in-use') {
        setAuthError("Este email ya está registrado. Inicia sesión.");
      } else if (err.code === 'auth/weak-password') {
        setAuthError("La contraseña debe tener al menos 6 caracteres.");
      } else if (err.code === 'auth/invalid-credential') {
        setAuthError("Email o contraseña incorrectos.");
      } else {
        setAuthError("Error: " + err.message);
      }
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <RefreshCw className="animate-spin text-black w-10 h-10" />
    </div>
  );

  // --- PANTALLA UNIFICADA DE LOGIN / REGISTRO ---
  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 font-sans text-slate-800">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md text-center border border-zinc-100">
          <div className="bg-black text-white p-4 rounded-2xl mb-6 inline-block rotate-3"><Music className="w-8 h-8"/></div>
          <h1 className="text-3xl font-black uppercase tracking-tighter mb-1">Los Mitos</h1>
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-8">
            {isLoginMode ? 'Acceso al portal' : 'Crea tu cuenta gratis'}
          </p>
          
          {authError && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm font-bold rounded-xl border border-red-100">
              {authError}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            <input 
              type="email" 
              placeholder="Tu Email" 
              required 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="w-full p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl outline-none focus:border-black font-medium transition-colors" 
            />
            <input 
              type="password" 
              placeholder="Contraseña (mín. 6 caracteres)" 
              required 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className="w-full p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl outline-none focus:border-black font-medium transition-colors" 
            />
            <button type="submit" className="w-full bg-black hover:bg-zinc-800 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-sm mt-4 flex justify-center items-center gap-2 transition-all active:scale-95 shadow-md">
              {isLoginMode ? <Lock className="w-4 h-4"/> : <UserPlus className="w-4 h-4"/>} 
              {isLoginMode ? 'Entrar al Ecosistema' : 'Crear Cuenta'}
            </button>
          </form>

          {/* BOTÓN PARA CAMBIAR ENTRE LOGIN Y REGISTRO */}
          <div className="mt-8 pt-6 border-t border-zinc-100">
            <button 
              type="button"
              onClick={() => { setIsLoginMode(!isLoginMode); setAuthError(''); }}
              className="text-sm font-bold text-zinc-500 hover:text-black transition-colors"
            >
              {isLoginMode ? '¿No tienes cuenta? Regístrate aquí' : '¿Ya tienes cuenta? Inicia sesión'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- RUTEO INTELIGENTE ---
  const isPaco = user.email === ADMIN_EMAIL;

  // 1. Si es Paco y tiene la vista de Admin activada
  if (isPaco && viewMode === 'admin') {
    return (
      <AdminPortal 
        user={user} 
        logout={handleLogout} 
        db={db} 
        appId={appId} 
        switchToTeacher={() => setViewMode('teacher')} 
      />
    );
  }

  // 2. Si es un Alumno
  if (user.email.includes('alumno')) {
    return <StudentPortal user={user} logout={handleLogout} db={db} appId={appId} />;
  }

  // 3. Si es Profesor, o si Paco ha pulsado "Vista Profesor"
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
