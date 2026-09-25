/* ===== IMPORTS ===== */
import { auth, db } from "../../shared/firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ===== PROTECCIÓN DE PÁGINA ===== */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../index.html";
    return;
  }

  document.getElementById("userEmail").textContent = user.email;
  await cargarProductos();
});

/* ===== LOGOUT ===== */
document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "../index.html";
});

/* ===== CARGAR PRODUCTOS ===== */
async function cargarProductos() {
  const tbody = document.getElementById("tablaBody");

  try {
    const snapshot = await getDocs(collection(db, "productos"));

    if (snapshot.empty) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:2rem; color:#7a6a5f;">
            No hay productos todavía. Hacé click en "+ Agregar producto".
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = "";
    snapshot.forEach((doc) => {
      const p = doc.data();
      const tr = document.createElement("tr");

      const fotoHtml = p.fotoUrl
        ? `<div class="foto"><img src="${p.fotoUrl}" alt="${p.nombre}"></div>`
        : `<div class="foto">📦</div>`;

      tr.innerHTML = `
        <td>${fotoHtml}</td>
        <td>${p.nombre || "—"}</td>
        <td>${p.categoria || "—"}</td>
        <td>$${(p.precio || 0).toLocaleString("es-AR")}</td>
        <td>${p.stock ?? "—"}</td>
        <td><span class="badge ${p.estado || "borrador"}">${p.estado || "borrador"}</span></td>
        <td>
          <button class="btn-editar" data-id="${doc.id}">✏️</button>
        </td>
      `;

      tbody.appendChild(tr);
    });

  } catch (error) {
    console.error(error);
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:2rem; color:#c0392b;">
          Error al cargar productos: ${error.message}
        </td>
      </tr>
    `;
  }
}