/* =========================================================
   Capa de datos · Firebase
   ---------------------------------------------------------
   Guarda cada vista del dashboard como un documento de Firestore.
   Si Firebase no está configurado o no hay red, cae a localStorage
   para que el dashboard siga funcionando.
   ========================================================= */

import { initializeApp } from 'firebase/app';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut,
  onAuthStateChanged, setPersistence, browserLocalPersistence
} from 'firebase/auth';
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp
} from 'firebase/firestore';

/* ---------- configuración ---------- */
const cfg = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID
};

/* el proyecto puede tener varias cuentas; esta es la que se abre */
export const PROYECTO = import.meta.env.VITE_PROYECTO_ID || 'metlife-2026';

/* dominios con permiso de entrar; vacío = cualquiera con cuenta Google */
const DOMINIOS = (import.meta.env.VITE_DOMINIOS_PERMITIDOS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

export const hayFirebase = Boolean(cfg.apiKey && cfg.projectId);

let app = null, auth = null, db = null;
if (hayFirebase) {
  app  = initializeApp(cfg);
  auth = getAuth(app);
  db   = getFirestore(app);
  setPersistence(auth, browserLocalPersistence).catch(() => {});
}

/* ---------- sesión ---------- */
export const usuario = { actual: null };

export function alCambiarSesion(cb) {
  if (!hayFirebase) { cb(null); return () => {}; }
  return onAuthStateChanged(auth, u => {
    if (u && DOMINIOS.length) {
      const dom = (u.email || '').split('@')[1]?.toLowerCase();
      if (!DOMINIOS.includes(dom)) {
        signOut(auth);
        cb(null, `La cuenta ${u.email} no tiene acceso a este proyecto.`);
        return;
      }
    }
    usuario.actual = u;
    cb(u);
  });
}

export async function entrar() {
  if (!hayFirebase) throw new Error('Firebase no está configurado');
  const prov = new GoogleAuthProvider();
  prov.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(auth, prov);
}

export async function salir() {
  if (hayFirebase) await signOut(auth);
}

/* ---------- lectura y escritura ---------- */
/* 'metlife2026:talleres' -> proyectos/metlife-2026/vistas/talleres */
const refDe = clave => {
  const hoja = String(clave).split(':').pop();
  return doc(db, 'proyectos', PROYECTO, 'vistas', hoja);
};

const memoria = {};
function lsSirve() {
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }
  catch (e) { return false; }
}
const usaLS = lsSirve();

function leerLocal(clave) {
  if (usaLS) { try { const v = localStorage.getItem(clave); if (v != null) return JSON.parse(v); } catch (e) {} }
  return memoria[clave] ?? null;
}
function guardarLocal(clave, valor) {
  memoria[clave] = valor;
  if (usaLS) { try { localStorage.setItem(clave, JSON.stringify(valor)); return true; } catch (e) {} }
  return false;
}

/* modo real: 'nube' si Firestore respondió, 'local' si no */
export const estado = { modo: hayFirebase ? 'nube' : 'local', ultimoError: null };

export const store = {
  async get(clave) {
    if (hayFirebase && usuario.actual) {
      try {
        const snap = await getDoc(refDe(clave));
        estado.modo = 'nube';
        if (snap.exists()) {
          const v = snap.data().valor;
          const dato = typeof v === 'string' ? JSON.parse(v) : v;
          guardarLocal(clave, dato);          // copia para trabajar sin red
          return dato;
        }
        return leerLocal(clave);
      } catch (e) {
        estado.modo = 'local'; estado.ultimoError = e.message;
      }
    }
    return leerLocal(clave);
  },

  async set(clave, valor) {
    const okLocal = guardarLocal(clave, valor);
    if (hayFirebase && usuario.actual) {
      try {
        await setDoc(refDe(clave), {
          valor: JSON.stringify(valor),
          actualizado: serverTimestamp(),
          por: usuario.actual.email || null
        });
        estado.modo = 'nube';
        return true;
      } catch (e) {
        estado.modo = 'local'; estado.ultimoError = e.message;
      }
    }
    return okLocal;
  }
};

/* ---------- avisar si otra persona guardó ---------- */
export function vigilar(claves, cb) {
  if (!hayFirebase || !usuario.actual) return () => {};
  const corte = Date.now();
  const paran = claves.map(clave =>
    onSnapshot(refDe(clave), snap => {
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      const t = snap.data().actualizado?.toMillis?.() ?? 0;
      const por = snap.data().por;
      if (t > corte && por && por !== usuario.actual.email) cb(por);
    }, () => {})
  );
  return () => paran.forEach(p => p());
}
