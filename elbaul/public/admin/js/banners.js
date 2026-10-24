/* ===== IMPORTS ===== */
import { db } from "../../shared/firebase-config.js";
import { 
  collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp, query, where 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { protegerPagina, configurarLogout } from "./auth-guard.js";

/* ===== CLOUDINARY ===== */
const CLOUD_NAME = "andvb0hj";
const UPLOAD_PRESET = "tienda_demo_unsigned";

/* ===== DOM ===== */
const panelOverlay = document.getElementById("panelOverlay");
const panelBanner = document.getElementById("panelBanner");
const panelTitulo = document.getElementById("panelTitulo");
const panelCerrar = document.getElementById("panelCerrar");
const formBanner = document.getElementById("formBanner");
const formError = document.getElementById("formError");
const btnAgregar = document.getElementById("btnAgregarBanner");
const btnCancelar = document.getElementById("btnCancelar");
const btnSubirFoto = document.getElementById("btnSubirFoto");
const fotoPreview = document.getElementById("fotoPreview");
const fotoUrlInput = document.getElementById("fotoUrl");

/* ===== PROTECCIÓN ===== */
protegerPagina(async () => {
  await cargarBanners();
});
configurarLogout();

/* ===== CLOUDINARY ===== */
function abrirWidget() {
  const widget = cloudinary.createUploadWidget(
    { 
      cloudName: CLOUD_NAME, 
      uploadPreset: UPLOAD_PRESET, 
      folder: "tienda-demo/banners", 
      multiple: false
    },
    (error, result) => {
      if (!error && result && result.event === "success") {
        let url = result.info.secure_url;
        fotoPreview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:contain;">`;
        fotoUrlInput.value = url;
      }
    }
  );
  widget.open();
}

btnSubirFoto.addEventListener("click", abrirWidget);

/* ===== CARGAR CATEGORÍAS EN EL SELECT ===== */
async function cargarCategoriasEnSelect() {
  const select = document.getElementById("categoriaBanner");
  const info = document.getElementById("infoCategoria");
  if (!select) return;

  try {
    const [catSnap, prodSnap] = await Promise.all([
      getDocs(collection(db, "categorias")),
      getDocs(query(collection(db, "productos"), where("estado", "==", "activo")))
    ]);

    const conteo = {};
    prodSnap.forEach(d => {
      const cat = d.data().categoria || "Otros";
      conteo[cat] = (conteo[cat] || 0) + 1;
    });

    select.innerHTML = `<option value="">Ninguna (no hace nada al hacer clic)</option>`;
    
    catSnap.forEach(doc => {
      const cat = doc.data().nombre;
      const cant = conteo[cat] || 0;
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = `${cat} (${cant} producto${cant === 1 ? '' : 's'})`;
      select.appendChild(opt);
    });

    // Actualizar info al cambiar de categoría
    select.addEventListener("change", () => {
      const catElegida = select.value;
      if (catElegida) {
        const cant = conteo[catElegida] || 0;
        if (cant === 0) {
          info.textContent = "⚠️ Esta categoría no tiene productos activos.";
          info.style.color = "#c0392b";
        } else {
          info.textContent = `✅ ${cant} producto(s) se mostrarán al hacer clic.`;
          info.style.color = "#2e7d32";
        }
      } else {
        info.textContent = "";
      }
    });

  } catch (error) {
    console.error("Error al cargar categorías", error);
  }
}

/* ===== CREAR CATEGORÍA RÁPIDA ===== */
document.getElementById("btnNuevaCategoria").addEventListener("click", async () => {
  const nombre = prompt("Nombre de la nueva categoría:");
  if (!nombre || !nombre.trim()) return;

  try {
    const catSnap = await getDocs(collection(db, "categorias"));
    const existe = catSnap.docs.some(d => d.data().nombre.toLowerCase() === nombre.trim().toLowerCase());
    
    if (existe) {
      alert("Ya existe una categoría con ese nombre.");
      return;
    }

    await addDoc(collection(db, "categorias"), {
      nombre: nombre.trim(),
      fechaCreacion: serverTimestamp()
    });
    
    alert("Categoría creada. Recordá agregarle productos desde la sección Productos.");
    await cargarCategoriasEnSelect();
  } catch (error) {
    console.error(error);
    alert("Error al crear la categoría.");
  }
});

/* ===== PANEL ===== */
async function abrirPanel() {
  await cargarCategoriasEnSelect();
  formBanner.reset();
  fotoUrlInput.value = "";
  fotoPreview.innerHTML = `<span class="foto-placeholder">📦</span>`;
  formError.textContent = "";
  const info = document.getElementById("infoCategoria");
  if (info) info.textContent = "";
  
  panelOverlay.classList.add("active");
  panelBanner.classList.add("active");
}

function cerrarPanel() {
  panelOverlay.classList.remove("active");
  panelBanner.classList.remove("active");
}

btnAgregar.addEventListener("click", abrirPanel);
panelCerrar.addEventListener("click", cerrarPanel);
btnCancelar.addEventListener("click", cerrarPanel);
panelOverlay.addEventListener("click", cerrarPanel);

/* ===== GUARDAR ===== */
formBanner.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.textContent = "";

  const titulo = document.getElementById("titulo").value.trim();
  const categoria = document.getElementById("categoriaBanner").value;
  const fotoUrl = fotoUrlInput.value;

  if (!fotoUrl) {
    formError.textContent = "La imagen es obligatoria.";
    return;
  }

  try {
    await addDoc(collection(db, "banners"), {
      titulo,
      categoria, // Guardamos la categoría elegida
      fotoUrl,
      fecha: serverTimestamp()
    });
    cerrarPanel();
    await cargarBanners();
    mostrarToast("Banner guardado");
  } catch (error) {
    console.error(error);
    formError.textContent = "Error al guardar.";
  }
});

/* ===== CARGAR BANNERS ===== */
async function cargarBanners() {
  const tbody = document.getElementById("tablaBanners");
  try {
    const snapshot = await getDocs(collection(db, "banners"));
    
    if (snapshot.empty) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:2rem;">No hay banners.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    snapshot.forEach(docSnap => {
      const b = docSnap.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><img src="${b.fotoUrl}" style="height:50px; border-radius:6px;"></td>
        <td>${b.titulo || "—"}</td>
        <td>${b.categoria ? `Categoría: ${b.categoria}` : "—"}</td>
        <td>
          <button class="btn-eliminar" data-id="${docSnap.id}"><i class="bi bi-trash"></i></button>
        </td>
      `;
      
      tr.querySelector(".btn-eliminar").addEventListener("click", async () => {
        if (confirm("¿Borrar este banner?")) {
          await deleteDoc(doc(db, "banners", docSnap.id));
          await cargarBanners();
        }
      });
      
      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error(error);
  }
}

/* ===== TOAST ===== */
let toastTimeout;
function mostrarToast(mensaje) {
  const toast = document.getElementById("toast");
  toast.textContent = mensaje;
  toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("visible"), 3000);
}