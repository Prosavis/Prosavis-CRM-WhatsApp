// Configuración de Firebase para CRM-WhatsApp
// Solo incluye Functions para llamar a Cloud Functions de descuentos
import { initializeApp } from 'firebase/app';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.warn(
    'Faltan VITE_FIREBASE_API_KEY o VITE_FIREBASE_PROJECT_ID. ' +
    'Los códigos de descuento no funcionarán sin Firebase configurado.'
  );
}

const app = initializeApp(firebaseConfig);
export const functions = getFunctions(app, 'us-central1');
export default app;
