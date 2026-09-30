/* ===== IMPORTS ===== */
import { db } from "../../shared/firebase-config.js";
import {
  collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, deleteDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { protegerPagina, configurarLogout } from "./auth-guard.js";

/* ===== REFERENCIAS DOM ===== */
const panelOverlay = document.getElementById("panelOverlay");
const panelCategoria = document.getElementById("panelCategoria");
const panelTitulo = document.getElementById("panelTitulo");
const panelCerrar = document.getElementById("panelCerrar");
const formCategoria = document.getElementById("formCategoria");
const formError = document.getElementById("formError");
const btnAgregar = document.querySelector(".header-con-accion .btn-primary");
const btnCancelar = document.getElementById("btnCancelar");

/* ===== ESTADO ===== */
let categoriaEditando = null; // null = crear, id = editar

/* ===== PROTECCIÓN Y LOGOUT ===== */
protegerPagina(async () => {
  await garantizarOtros();
  await cargarCategorias();
});
configurarLogout();

/* ===== ABRIR / CERRAR PANEL ===== */
function abrirPanel(categoria = null) {
  formError.textContent = "";
  formCategoria.reset();

  if (categoria) {
    categoriaEditando = categoria.id;
    panelTitulo.textContent = "Editar categoría";
    document.getElementById("nombreCategoria").value = categoria.data.nombre || "";
  } else {
    categoriaEditando = null;
    panelTitulo.textContent = "Agregar categoría";
  }

  panelOverlay.classList.add("active");
  panelCategoria.classList.add("active");
  document.getElementById("nombreCategoria").focus();
}

function cerrarPanel() {
  panelOverlay.classList.remove("active");
  panelCategoria.classList.remove("active");
  categoriaEditando = null;
}

btnAgregar.addEventListener("click", () => abrirPanel());
panelCerrar.addEventListener("click", cerrarPanel);
btnCancelar.addEventListener("click", cerrarPanel);
panelOverlay.addEventListener("click", cerrarPanel);

/* ===== TOAST ===== */
let toastTimeout;
function mostrarToast(mensaje) {
  const toast = document.getElementById("toast");
  toast.textContent = mensaje;
  toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("visible");
  }, 3000);
}

/* ===== GUARDAR CATEGORÍA ===== */
formCategoria.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.textContent = "";

  const nombre = document.getElementById("nombreCategoria").value.trim();

  if (!nombre) {
    formError.textContent = "El nombre es obligatorio.";
    return;
  }

  // Validar duplicados
  const snapshot = await getDocs(collection(db, "categorias"));
  const duplicado = snapshot.docs.some(d => {
    if (categoriaEditando && d.id === categoriaEditando) return false;
    return d.data().nombre.toLowerCase() === nombre.toLowerCase();
  });

  if (duplicado) {
    formError.textContent = "Ya existe una categoría con ese nombre.";
    return;
  }

    try {
    if (categoriaEditando) {
      // Obtener el nombre viejo
      const catSnap = await getDoc(doc(db, "categorias", categoriaEditando));
      const nombreViejo = catSnap.data().nombre;

      // Actualizar la categoría
      await updateDoc(doc(db, "categorias", categoriaEditando), {
        nombre,
        fechaActualizacion: serverTimestamp()
      });

      // Si cambió el nombre, actualizar productos que la usaban
      if (nombreViejo !== nombre) {
        const productosSnap = await getDocs(collection(db, "productos"));
        const afectados = productosSnap.docs.filter(
          d => d.data().categoria === nombreViejo
        );

        for (const prodDoc of afectados) {
          await updateDoc(doc(db, "productos", prodDoc.id), {
            categoria: nombre,
            fechaActualizacion: serverTimestamp()
          });
        }
      }
    } else {
      await addDoc(collection(db, "categorias"), {
        nombre,
        fechaCreacion: serverTimestamp()
      });
    }

    cerrarPanel();
    await cargarCategorias();
    mostrarToast("Categoría guardada");
  } catch (error) {
    console.error(error);
    formError.textContent = "Error al guardar: " + error.message;
  }
});

/* ===== GARANTIZAR "OTROS" ===== */
async function garantizarOtros() {
  const snapshot = await getDocs(collection(db, "categorias"));
  const existe = snapshot.docs.some(d => d.data().nombre === "Otros");

  if (!existe) {
    await addDoc(collection(db, "categorias"), {
      nombre: "Otros",
      esFija: true,
      fechaCreacion: serverTimestamp()
    });
  }
}

/* ===== CARGAR CATEGORÍAS ===== */
async function cargarCategorias() {
  const tbody = document.getElementById("tablaCategorias");

  try {
    // Traer categorías y productos en paralelo
    const [categoriasSnap, productosSnap] = await Promise.all([
      getDocs(collection(db, "categorias")),
      getDocs(collection(db, "productos"))
    ]);

    if (categoriasSnap.empty) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" style="text-align:center; padding:2rem; color:#7a6a5f;">
            No hay categorías todavía. Hacé click en "+ Agregar categoría".
          </td>
        </tr>
      `;
      return;
    }

    // Contar productos por categoría
    const conteo = {};
    productosSnap.forEach(d => {
      const cat = d.data().categoria || "Otros";
      conteo[cat] = (conteo[cat] || 0) + 1;
    });

    tbody.innerHTML = "";
    categoriasSnap.forEach((docSnap) => {
      const c = docSnap.data();
      const tr = document.createElement("tr");
      const esFija = c.esFija === true;
      const cantidad = conteo[c.nombre] || 0;

      tr.innerHTML = `
        <td>${c.nombre || "—"}</td>
        <td>${cantidad}</td>
        <td>
          ${esFija
            ? `<span style="color:#7a6a5f; font-size:0.8rem;">—</span>`
            : `<button class="btn-editar" data-id="${docSnap.id}">✏️</button>
               <button class="btn-eliminar" data-id="${docSnap.id}" data-nombre="${c.nombre}">🗑️</button>`}
        </td>
      `;

      if (!esFija) {
        tr.querySelector(".btn-editar").addEventListener("click", () => {
          abrirPanel({ id: docSnap.id, data: c });
        });
        tr.querySelector(".btn-eliminar").addEventListener("click", () => {
          borrarCategoria(docSnap.id, c.nombre);
        });
      }

      tbody.appendChild(tr);
    });

  } catch (error) {
    console.error(error);
    tbody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align:center; padding:2rem; color:#c0392b;">
          Error al cargar categorías: ${error.message}
        </td>
      </tr>
    `;
  }
}

/* ===== BORRAR CATEGORÍA ===== */
async function borrarCategoria(idCategoria, nombreCategoria) {
  // 1. Contar productos en esa categoría
  const productosSnap = await getDocs(collection(db, "productos"));
  const productosAfectados = productosSnap.docs.filter(
    d => d.data().categoria === nombreCategoria
  );

  // 2. Confirmar con el usuario
  const mensaje = productosAfectados.length > 0
    ? `¿Borrar la categoría "${nombreCategoria}"?\n\nHay ${productosAfectados.length} producto(s) en esta categoría. Van a pasar a "Otros".`
    : `¿Borrar la categoría "${nombreCategoria}"?`;

  if (!confirm(mensaje)) return;

  try {
    // 3. Actualizar productos afectados a "Otros"
    for (const prodDoc of productosAfectados) {
      await updateDoc(doc(db, "productos", prodDoc.id), {
        categoria: "Otros",
        fechaActualizacion: serverTimestamp()
      });
    }

    // 4. Borrar la categoría
    await deleteDoc(doc(db, "categorias", idCategoria));

    await cargarCategorias();
    mostrarToast("Categoría borrada");
  } catch (error) {
    console.error(error);
    mostrarToast("Error al borrar categoría");
  }
}