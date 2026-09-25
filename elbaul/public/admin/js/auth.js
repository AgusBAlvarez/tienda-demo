/* ===== IMPORTS ===== */
import { auth } from "../../shared/firebase-config.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* ===== DETECTAR QUÉ PÁGINA ES ===== */
const esLogin = document.getElementById("loginForm");
const esDashboard = document.getElementById("logoutBtn");

/* ===== LOGIN ===== */
if (esLogin) {
  // Si ya está logueada, redirige directo
  onAuthStateChanged(auth, (user) => {
    if (user) {
      window.location.href = "./pages/dashboard.html";
    }
  });

  esLogin.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const pass = document.getElementById("password").value;
    const errorMsg = document.getElementById("errorMsg");

    try {
      await signInWithEmailAndPassword(auth, email, pass);
      window.location.href = "./pages/dashboard.html";
    } catch (error) {
      console.error(error);
      errorMsg.textContent = "Email o contraseña incorrectos";
      errorMsg.classList.add("visible");
    }
  });
}

/* ===== DASHBOARD ===== */
if (esDashboard) {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      // Sin sesión → patada al login
      window.location.href = "../index.html";
    } else {
      document.getElementById("userEmail").textContent = user.email;
    }
  });

  esDashboard.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "../index.html";
  });
}