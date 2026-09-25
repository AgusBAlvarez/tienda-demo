/* ===== IMPORTS ===== */
import { auth, db } from "../../shared/firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, getDocs, addDoc, updateDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ===== REFERENCIAS DOM ===== */
const panelOverlay = document.getElementById("panelOverlay");
const panelProducto = document.getElementById("panelProducto");
const panelTitulo = document.getElementById("panelTitulo");
const panelCerrar = document.getElementById("panelCerrar");
const formProducto = document.getElementById("formProducto");
const formError = document.getElementById("formError");
const btnAgregar = document.querySelector(".btn-primary");
const btnCancelar = document.getElementById("btnCancelar");

/* ===== ESTADO ===== */
let productoEditando = null; // null = crear, id = editar

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

/* ===== ABRIR PANEL (modo crear o editar) ===== */
function abrirPanel(producto = null) {
  formError.textContent = "";
  formProducto.reset();

  if (producto) {
    // Modo editar
    productoEditando = producto.id;
    panelTitulo.textContent = "Editar producto";
    document.getElementById("nombre").value = producto.data.nombre || "";
    document.getElementById("categoria").value = producto.data.categoria || "Otros";
    document.getElementById("precio").value = producto.data.precio ?? "";
    document.getElementById("stock").value = producto.data.stock ?? "";
    document.getElementById("stockMinimo").value = producto.data.stockMinimo ?? 3;
  } else {
    // Modo crear
    productoEditando = null;
    panelTitulo.textContent = "Agregar producto";
    document.getElementById("stockMinimo").value = 3;
  }

  panelOverlay.classList.add("active");
  panelProducto.classList.add("active");
  document.getElementById("nombre").focus();
}

function cerrarPanel() {
  panelOverlay.classList.remove("active");
  panelProducto.classList.remove("active");
  productoEditando = null;
}

btnAgregar.addEventListener("click", () => abrirPanel());
panelCerrar.addEventListener("click", cerrarPanel);
btnCancelar.addEventListener("click", cerrarPanel);
panelOverlay.addEventListener("click", cerrarPanel);

/* ===== GUARDAR PRODUCTO (crear o actualizar) ===== */
formProducto.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.textContent = "";

  const nombre = document.getElementById("nombre").value.trim();
  const categoria = document.getElementById("categoria").value;
  const precio = Number(document.getElementById("precio").value);
  const stock = Number(document.getElementById("stock").value);
  const stockMinimo = Number(document.getElementById("stockMinimo").value);

  if (!nombre || !categoria || precio < 0 || stock < 0) {
    formError.textContent = "Completá todos los campos obligatorios.";
    return;
  }

  const datos = {
    nombre,
    categoria,
    precio,
    stock,
    stockMinimo,
    fechaActualizacion: serverTimestamp()
  };

  try {
    if (productoEditando) {
      // Actualizar producto existente
      await updateDoc(doc(db, "productos", productoEditando), datos);
    } else {
      // Crear producto nuevo
      await addDoc(collection(db, "productos"), {
        ...datos,
        fotoUrl: "",
        estado: "borrador",
        fechaCreacion: serverTimestamp()
      });
    }

    cerrarPanel();
    await cargarProductos();
  } catch (error) {
    console.error(error);
    formError.textContent = "Error al guardar: " + error.message;
  }
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
    snapshot.forEach((docSnap) => {
      const p = docSnap.data();
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
          <button class="btn-editar" data-id="${docSnap.id}">✏️</button>
        </td>
      `;

      // Conectar botón editar
      tr.querySelector(".btn-editar").addEventListener("click", () => {
        abrirPanel({ id: docSnap.id, data: p });
      });

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