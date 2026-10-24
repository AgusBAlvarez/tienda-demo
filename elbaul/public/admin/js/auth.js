/* ===== IMPORTS ===== */
import { auth } from "../../shared/firebase-config.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* ===== LOGIN ===== */
const loginForm = document.getElementById("loginForm");

if (loginForm) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      window.location.href = "./pages/dashboard.html";
    }
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const pass = document.getElementById("password").value.trim();
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