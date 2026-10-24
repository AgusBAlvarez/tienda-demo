/* ===== IMPORTS ===== */
import { db } from "../../shared/firebase-config.js";
import {
    collection, getDocs, addDoc, updateDoc, doc, serverTimestamp,
    deleteDoc, getDoc, setDoc, writeBatch
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
const confirmarBorradoOverlay = document.getElementById("confirmarBorradoOverlay");
const confirmarBorradoModal = document.getElementById("confirmarBorradoModal");
const confirmarBorradoMensaje = document.getElementById("confirmarBorradoMensaje");
const btnCancelarBorrado = document.getElementById("btnCancelarBorrado");
const btnConfirmarBorrado = document.getElementById("btnConfirmarBorrado");

/* ===== ESTADO ===== */
let categoriaEditando = null; // null = crear, id = editar
let borradoPendiente = null; // { id, nombre, afectados }

/* ===== HELPER: normalizar nombre ===== */
function normalizarNombre(s) {
  return (s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* ===== HELPER: verificar si ya existe ===== */
async function existeCategoriaConNombre(nombre, exceptoId = null) {
  const snapshot = await getDocs(collection(db, "categorias"));
  const nombreNorm = normalizarNombre(nombre);
  return snapshot.docs.some(d => {
    if (exceptoId && d.id === exceptoId) return false;
    return normalizarNombre(d.data().nombre) === nombreNorm;
  });
}

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

function abrirConfirmarBorrado(id, nombre, afectados) {
  borradoPendiente = { id, nombre, afectados };

  const mensaje = afectados > 0
    ? `¿Borrar la categoría "${nombre}"? Hay ${afectados} producto(s) que van a pasar a "Otros".`
    : `¿Borrar la categoría "${nombre}"?`;

  confirmarBorradoMensaje.textContent = mensaje;
  confirmarBorradoOverlay.classList.add("active");
  confirmarBorradoModal.classList.add("active");
}

function cerrarConfirmarBorrado() {
  confirmarBorradoOverlay.classList.remove("active");
  confirmarBorradoModal.classList.remove("active");
  borradoPendiente = null;
}

btnCancelarBorrado.addEventListener("click", cerrarConfirmarBorrado);
confirmarBorradoOverlay.addEventListener("click", cerrarConfirmarBorrado);

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

  // Validar duplicados (case/espacios/acentos-insensitive)
  const duplicado = await existeCategoriaConNombre(nombre, categoriaEditando);
  if (duplicado) {
    formError.textContent = "Ya existe una categoría con ese nombre.";
    return;
  }

  try {
    if (categoriaEditando) {
      const catSnap = await getDoc(doc(db, "categorias", categoriaEditando));
      const nombreViejo = catSnap.data().nombre;

      await updateDoc(doc(db, "categorias", categoriaEditando), {
        nombre,
        fechaActualizacion: serverTimestamp()
      });

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
  const nombreNorm = normalizarNombre("Otros");

  const existentes = snapshot.docs.filter(
    d => normalizarNombre(d.data().nombre) === nombreNorm
  );

  if (existentes.length === 0) {
    await setDoc(doc(db, "categorias", "cat-otros"), {
      nombre: "Otros",
      esFija: true,
      fechaCreacion: serverTimestamp()
    });
    return;
  }

  if (existentes.length > 1) {
    const [conservar, ...duplicados] = existentes;

    for (const dup of duplicados) {
      await deleteDoc(dup.ref);
      console.log(`🧹 Duplicado de "Otros" eliminado: ${dup.id}`);
    }

    if (conservar.id !== "cat-otros") {
      await setDoc(doc(db, "categorias", "cat-otros"), {
        ...conservar.data(),
        esFija: true
      });
      await deleteDoc(conservar.ref);
      console.log(`🔧 "Otros" migrado a ID fijo`);
    }
  } else if (existentes[0].id !== "cat-otros") {
    const viejo = existentes[0];
    await setDoc(doc(db, "categorias", "cat-otros"), {
      ...viejo.data(),
      esFija: true
    });
    await deleteDoc(viejo.ref);
    console.log(`🔧 "Otros" migrado a ID fijo`);
  }
}

/* ===== CARGAR CATEGORÍAS ===== */
async function cargarCategorias() {
  const tbody = document.getElementById("tablaCategorias");

  try {
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
            : `<button class="btn-editar" data-id="${docSnap.id}"><i class="bi bi-pencil"></i></button>
          <button class="btn-eliminar" data-id="${docSnap.id}" data-nombre="${c.nombre}"><i class="bi bi-trash"></i></button>`}
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
  const productosSnap = await getDocs(collection(db, "productos"));
  const productosAfectados = productosSnap.docs.filter(
    d => d.data().categoria === nombreCategoria
  );

  // Abrir modal de confirmación (no confirm() nativo)
  abrirConfirmarBorrado(idCategoria, nombreCategoria, productosAfectados.length);
}

/* ===== CONFIRMAR BORRADO ===== */
btnConfirmarBorrado.addEventListener("click", async () => {
  if (!borradoPendiente) return;

  const { id, nombre } = borradoPendiente;

  btnConfirmarBorrado.disabled = true;
  btnConfirmarBorrado.textContent = "Borrando...";

  try {
    // Re-leer productos afectados (por si cambiaron desde que se abrió el modal)
    const productosSnap = await getDocs(collection(db, "productos"));
    const productosAfectados = productosSnap.docs.filter(
      d => d.data().categoria === nombre
    );

    const batch = writeBatch(db);
    for (const prodDoc of productosAfectados) {
      batch.update(prodDoc.ref, {
        categoria: "Otros",
        fechaActualizacion: serverTimestamp()
      });
    }
    batch.delete(doc(db, "categorias", id));
    await batch.commit();

    cerrarConfirmarBorrado();
    await cargarCategorias();
    mostrarToast("Categoría borrada");
  } catch (error) {
    console.error(error);
    mostrarToast("Error al borrar categoría");
  } finally {
    btnConfirmarBorrado.disabled = false;
    btnConfirmarBorrado.textContent = "Borrar";
  }
});