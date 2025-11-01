// src/services/firebase.js
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

// inicializa app principal (reusa se já foi inicializado)
const apps = getApps();
const app = apps.length ? apps[0] : initializeApp(firebaseConfig);

// app secundário para criar usuários sem afetar sessão do admin
let secondaryApp;
try {
  // se já existir um app com nome 'secondary' evita re-init
  secondaryApp = apps.find((a) => a.name === "secondary") || initializeApp(firebaseConfig, "secondary");
} catch (e) {
  // fallback
  secondaryApp = initializeApp(firebaseConfig, "secondary");
}

// exports
export const auth = getAuth(app); // auth principal (usado pro login do admin)
export const secondaryAuth = getAuth(secondaryApp); // auth secundário para criar contas
export const db = getFirestore(app);
export const functions = getFunctions(app);