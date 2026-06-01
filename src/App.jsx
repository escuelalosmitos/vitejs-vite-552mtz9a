import React, { useState, useEffect } from 'react';
import { Music, Lock, RefreshCw, UserPlus, Eye, EyeOff } from 'lucide-react'; 

// --- FIREBASE IMPORTS ---
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

// --- MÓDULOS ---
import TeacherPortal from './components/TeacherPortal.jsx';
import StudentPortal from './components/StudentPortal.jsx';
import AdminPortal from './components/AdminPortal.jsx'; 

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
  const [showPassword, setShowPassword] = useState(false); 
  
  // ESTADOS DE AUTENTICACIÓN Y ERRORES
  const [isLoginMode, setIsLoginMode] = useState(true); 
  const [authError, setAuthError] = useState(''); 
  const [authSuccess, setAuthSuccess] = useState(''); 
  
  // ESTADO PARA EL ENTRADA/SALIDA DEL ADMIN
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
    setAuthSuccess('');
    const cleanEmail = email.toLowerCase().trim();

    try {
      if (isLoginMode) {
        // --- MODO LOGIN NORMAL ---
        await signInWithEmailAndPassword(auth, cleanEmail, password);

        // AUTOCURACIÓN: Si es un alumno y su cuenta sigue constando como "no activada" en el CRM, la marcamos como activada silenciosamente.
        if (cleanEmail !== ADMIN_EMAIL && !cleanEmail.endsWith('@escuelalosmitos.com')) {
          const q = query(collection(db, 'artifacts', appId, 'students'), where("email", "==", cleanEmail));
          const snap = await getDocs(q);
          if (!snap.empty) {
            const studentDoc = snap.docs[0];
            if (studentDoc.data().claimed !== true) {
              await updateDoc(doc(db, 'artifacts', appId, 'students', studentDoc.id), { 
                claimed: true 
              });
            }
          }
        }

      } else {
        // --- MODO REGISTRO REAL (ACTIVAR CUENTA) ---
        const q = query(collection(db, 'artifacts', appId, 'students'), where("email", "==", cleanEmail));
        const snapshot = await getDocs(q);

        if (snapshot.empty && cleanEmail !== ADMIN_EMAIL) {
          setAuthError("Acceso denegado: Este email no consta en la base de datos de alumnos activos.");
          return;
        }

        // 1. Creamos la cuenta y contraseña en Firebase Auth
        await createUserWithEmailAndPassword(auth, cleanEmail, password);

        // 2. Marcamos la ficha del alumno como "Activada" (claimed: true) en la base de datos
        if (!snapshot.empty) {
          const studentDoc = snapshot.docs[0];
          await updateDoc(doc(db, 'artifacts', appId, 'students', studentDoc.id), { 
            claimed: true 
          });
        }
      }
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        // 👇 FIX UX: Cambiamos al usuario a modo login automáticamente
        setIsLoginMode(true);
        setPassword(''); // Limpiamos la contraseña por si acaso
        setAuthSuccess("¡Ojo! Parece que ya activaste tu cuenta anteriormente. Te hemos pasado a la pantalla de entrada. ¡Pon tu contraseña y listo!");
      } else if (err.code === 'auth/weak-password') {
        setAuthError("La contraseña es poco segura (Mínimo 6 caracteres).");
      } else if (err.code === 'auth/invalid-credential') {
        setAuthError("El email o la contraseña son incorrectos.");
      } else {
        setAuthError("Error de sincronización: " + err.message);
      }
    }
  };

  const handleResetPassword = async () => {
    setAuthError('');
    setAuthSuccess('');
    
    if (!email.trim()) {
      setAuthError('Por favor, escribe tu correo arriba primero para enviarte el enlace.');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email.trim());
      setAuthSuccess('¡Correo enviado! Revisa tu bandeja de entrada (o spam) para crear una nueva contraseña.');
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        setAuthError('No existe ninguna cuenta con este correo.');
      } else {
        setAuthError('Error al enviar el correo. Revisa si el email es correcto.');
      }
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <RefreshCw className="animate-spin text-black w-10 h-10" />
    </div>
  );

  // --- INTERFAZ DE LOGIN / REGISTRO ---
  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 font-sans text-slate-800">
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md text-center border border-zinc-100">
          <div className="flex justify-center mx-auto mb-8">
            <img 
              src="/logo.png" 
              alt="Logo Escuela Los Mitos" 
              className="w-32 h-auto object-contain" 
            />
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tighter mb-1">Los Mitos</h1>
          
          {/* 👇 FIX UX: Color distinto según el modo para que el usuario sepa dónde está */}
          <p className={`text-xs font-bold uppercase tracking-widest mb-8 transition-colors ${isLoginMode ? 'text-zinc-400' : 'text-indigo-500'}`}>
            {isLoginMode ? 'Acceso al portal' : 'Reivindicar cuenta de alumno'}
          </p>
          
          {authError && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm font-bold rounded-xl border border-red-100 animate-in fade-in">
              {authError}
            </div>
          )}

          {authSuccess && (
            <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 text-sm font-bold rounded-xl border border-emerald-100 animate-in fade-in">
              {authSuccess}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            <input 
              type="email" 
              placeholder="Tu Correo Electrónico" 
              required 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              className="w-full p-4 bg-zinc-50 border-2 border-zinc-100 rounded-2xl outline-none focus:border-black font-medium transition-colors" 
            />
            
            <div className="relative w-full">
              <input 
                type={showPassword ? "text" : "password"} 
                placeholder={isLoginMode ? "Contraseña" : "Crea tu contraseña (Mínimo 6 letras)"}
                required 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                className="w-full p-4 pr-12 bg-zinc-50 border-2 border-zinc-100 rounded-2xl outline-none focus:border-black font-medium transition-colors" 
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-black transition-colors"
                tabIndex="-1"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {/* 👇 FIX UX: Botón de registro con color índigo en lugar de negro para romper el hábito visual */}
            <button type="submit" className={`w-full text-white font-black py-4 rounded-2xl uppercase tracking-widest text-sm mt-4 flex justify-center items-center gap-2 transition-all active:scale-95 shadow-md ${isLoginMode ? 'bg-black hover:bg-zinc-800' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
              {isLoginMode ? <Lock className="w-4 h-4"/> : <UserPlus className="w-4 h-4"/>} 
              {isLoginMode ? 'Entrar al Ecosistema' : 'Activar mi Cuenta'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-zinc-100 space-y-4 flex flex-col items-center">
            <button 
              type="button"
              onClick={() => { setIsLoginMode(!isLoginMode); setAuthError(''); setAuthSuccess(''); }}
              className="text-sm font-bold text-zinc-500 hover:text-black transition-colors"
            >
              {isLoginMode ? '¿Primera vez aquí? Activa tu cuenta' : '¿Ya tienes contraseña? Inicia sesión'}
            </button>
            
            {isLoginMode && (
              <button 
                type="button"
                onClick={handleResetPassword}
                className="text-[10px] font-bold text-blue-500 hover:text-blue-700 transition-colors uppercase tracking-widest"
              >
                ¿Has olvidado tu contraseña?
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- RUTEO INTELIGENTE POR DOMINIO CORPORATIVO ---
  const isPaco = user.email === ADMIN_EMAIL;
  const isTeacher = user.email.toLowerCase().endsWith('@escuelalosmitos.com');

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

  if (isTeacher) {
    return (
      <TeacherPortal 
        user={user} 
        logout={handleLogout} 
        db={db} 
        auth={auth} 
        appId={appId} 
        ADMIN_EMAIL={ADMIN_EMAIL}
        APPS_SCRIPT_URL={APPS_SCRIPT_URL}
        switchToAdmin={() => setViewMode('admin')}
      />
    );
  }

  return <StudentPortal user={user} logout={handleLogout} db={db} appId={appId} />;
}
