/* ===== IMPORTS ===== */
import { auth } from "../../shared/firebase-config.js";
import {
  onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* ===== PROTECCIÓN DE PÁGINA ===== */
export function protegerPagina(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "../index.html";
      return;
    }
    // Verificar si la cuenta fue deshabilitada
    if (user.disabled || user.metadata?.disabled) {
      await signOut(auth);
      window.location.href = "../index.html";
      return;
    }
    const userEmail = document.getElementById("userEmail");
    if (userEmail) userEmail.textContent = user.email;
    if (callback) callback(user);
  });
}

/* ===== LOGOUT ===== */
export function configurarLogout() {
  const btn = document.getElementById("logoutBtn");
  if (btn) {
    btn.addEventListener("click", async () => {
      await signOut(auth);
      window.location.href = "../index.html";
    });
  }
}