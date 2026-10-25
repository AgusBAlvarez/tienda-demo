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

/* ===== MENÚ HAMBURGUESA (responsive) ===== */
export function configurarMenuHamburguesa() {
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.querySelector(".admin-sidebar");
  const overlay = document.querySelector(".admin-overlay");

  if (!menuToggle || !sidebar) return;

  // Si el overlay no existe, lo creamos
  if (!overlay) {
    const div = document.createElement("div");
    div.className = "admin-overlay";
    document.body.appendChild(div);
  }

  const overlayFinal = document.querySelector(".admin-overlay");

  const abrirMenu = () => {
    sidebar.classList.add("active");
    overlayFinal.classList.add("active");
  };

  const cerrarMenu = () => {
    sidebar.classList.remove("active");
    overlayFinal.classList.remove("active");
  };

  menuToggle.addEventListener("click", abrirMenu);
  overlayFinal.addEventListener("click", cerrarMenu);

  // Cerrar al hacer click en un link del menú
  sidebar.querySelectorAll("nav a").forEach(link => {
    link.addEventListener("click", cerrarMenu);
  });
}