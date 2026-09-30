/* ===== IMPORTS ===== */
import { auth, db } from "../../shared/firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, getDocs, addDoc, updateDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


/* ===== CLOUDINARY ===== */
const CLOUD_NAME = "andvb0hj";
const UPLOAD_PRESET = "elbaul_unsigned";

/* ===== REFERENCIAS DOM ===== */
const panelOverlay = document.getElementById("panelOverlay");
const panelProducto = document.getElementById("panelProducto");
const panelTitulo = document.getElementById("panelTitulo");
const panelCerrar = document.getElementById("panelCerrar");
const formProducto = document.getElementById("formProducto");
const formError = document.getElementById("formError");
const btnAgregar = document.querySelector(".btn-primary");
const btnCancelar = document.getElementById("btnCancelar");
const btnSubirFoto = document.getElementById("btnSubirFoto");
const btnQuitarFoto = document.getElementById("btnQuitarFoto");
const fotoPreview = document.getElementById("fotoPreview");
const fotoUrlInput = document.getElementById("fotoUrl");

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

/* ===== PREVIEW DE FOTO ===== */
function mostrarFoto(url) {
  if (url) {
    fotoPreview.innerHTML = `<img src="${url}" alt="Foto">`;
    btnQuitarFoto.style.display = "inline-block";
    btnSubirFoto.textContent = "Cambiar foto";
    fotoUrlInput.value = url;
  } else {
    fotoPreview.innerHTML = `<span class="foto-placeholder">📦</span>`;
    btnQuitarFoto.style.display = "none";
    btnSubirFoto.textContent = "Subir foto";
    fotoUrlInput.value = "";
  }
}

/* ===== SUBIR FOTO A CLOUDINARY ===== */
function abrirWidgetCloudinary() {
  const widget = cloudinary.createUploadWidget(
    {
      cloudName: CLOUD_NAME,
      uploadPreset: UPLOAD_PRESET,
      folder: "elbaul/productos",
      sources: ["local", "camera", "url"],
      multiple: false,
      maxFileSize: 2000000,
      clientAllowedFormats: ["jpg", "jpeg", "png", "webp"]
    },
    (error, result) => {
      if (error) {
        console.error(error);
        formError.textContent = "Error al subir la foto.";
        return;
      }
      if (result && result.event === "success") {
        mostrarFoto(result.info.secure_url);
      }
    }
  );
  widget.open();
}

btnSubirFoto.addEventListener("click", abrirWidgetCloudinary);
btnQuitarFoto.addEventListener("click", () => mostrarFoto(""));

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
    mostrarFoto(producto.data.fotoUrl || "");
  } else {
    // Modo crear
    productoEditando = null;
    panelTitulo.textContent = "Agregar producto";
    document.getElementById("stockMinimo").value = 3;
    mostrarFoto("");
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
    fotoUrl: fotoUrlInput.value,
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
        estado: "borrador",
        fechaCreacion: serverTimestamp()
      });
    }

    cerrarPanel();
    await cargarProductos();
    mostrarToast("Producto guardado");
  } catch (error) {
    console.error(error);
    formError.textContent = "Error al guardar: " + error.message;
  }
});

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

        // Determinar texto y clase del botón de estado
        const estado = p.estado || "borrador";
        const tieneFoto = !!p.fotoUrl;
        let textoBoton = "";
        let claseBoton = "";
        let deshabilitado = "";

        if (estado === "borrador") {
          if (tieneFoto) {
            textoBoton = "Publicar";
            claseBoton = "publicar";
          } else {
            textoBoton = "Falta foto";
            claseBoton = "publicar";
            deshabilitado = "disabled";
          }
        } else if (estado === "activo") {
          textoBoton = "Desactivar";
          claseBoton = "desactivar";
        } else {
          textoBoton = "Activar";
          claseBoton = "publicar";
          if (!tieneFoto) deshabilitado = "disabled";
        }

      tr.innerHTML = `
        <td>${fotoHtml}</td>
        <td>${p.nombre || "—"}</td>
        <td>${p.categoria || "—"}</td>
        <td>$${(p.precio || 0).toLocaleString("es-AR")}</td>
        <td>${p.stock ?? "—"}</td>
        <td><span class="badge ${estado}">${estado}</span></td>
        <td>
          <button class="btn-editar" data-id="${docSnap.id}">✏️</button>
          <button class="btn-estado ${claseBoton}" data-id="${docSnap.id}" ${deshabilitado}>${textoBoton}</button>
        </td>
      `;    

      // Conectar botón editar
      tr.querySelector(".btn-editar").addEventListener("click", () => {
        abrirPanel({ id: docSnap.id, data: p });
      });

      // Conectar botón de estado
      tr.querySelector(".btn-estado").addEventListener("click", async () => {
        await cambiarEstado(docSnap.id, estado);
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


/* ===== CAMBIAR ESTADO ===== */
async function cambiarEstado(id, estadoActual) {
  let nuevoEstado;

  if (estadoActual === "borrador" || estadoActual === "inactivo") {
    nuevoEstado = "activo";
  } else {
    nuevoEstado = "inactivo";
  }

  try {
      await updateDoc(doc(db, "productos", id), {
      estado: nuevoEstado,
      fechaActualizacion: serverTimestamp()
    });
    await cargarProductos();
    mostrarToast("Estado actualizado");
  } catch (error) {
    console.error(error);
    mostrarToast("Error al cambiar estado");
  }
}