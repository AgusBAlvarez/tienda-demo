// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBRx8Us4ZhPP58eftZEEWYf-NwAsehIzoU",
  authDomain: "tienda-demo-5c115.firebaseapp.com",
  projectId: "tienda-demo-5c115",
  storageBucket: "tienda-demo-5c115.firebasestorage.app",
  messagingSenderId: "633138449364",
  appId: "1:633138449364:web:a40ea0ffd9b233aad5e441"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// ===== CONEXIÓN AL EMULADOR (Solo en localhost) =====
const esLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

if (esLocal) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  console.log("🔥 Conectado al Emulador de Firebase local");
}