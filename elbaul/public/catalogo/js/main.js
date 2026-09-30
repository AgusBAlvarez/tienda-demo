/* ===== IMPORTS ===== */
import { db } from "../../shared/firebase-config.js";
import {
  collection, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ===== MENÚ LATERAL ===== */
const menuBtn = document.querySelector(".menu-btn");
const menu = document.querySelector(".menu-lateral");
const cerrar = document.querySelector(".cerrar");
const overlay = document.querySelector(".overlay");

const abrir = () => {
  menu.classList.add("active");
  overlay.classList.add("active");
};

const cerrarMenu = () => {
  menu.classList.remove("active");
  overlay.classList.remove("active");
};

menuBtn.addEventListener("click", abrir);
cerrar.addEventListener("click", cerrarMenu);
overlay.addEventListener("click", cerrarMenu);

/* ===== CARGAR CATEGORÍAS (solo las que tienen productos activos) ===== */
async function cargarCategorias() {
  const contenedor = document.getElementById("categorias");

  try {
    // Traer categorías y productos activos en paralelo
    const [categoriasSnap, productosSnap] = await Promise.all([
      getDocs(collection(db, "categorias")),
      getDocs(query(collection(db, "productos"), where("estado", "==", "activo")))
    ]);

    // Contar cuántos productos activos hay por categoría
    const conteo = {};
    productosSnap.forEach(d => {
      const cat = d.data().categoria || "Otros";
      conteo[cat] = (conteo[cat] || 0) + 1;
    });

    // Filtrar categorías: solo las que tienen al menos 1 producto activo
    const categorias = categoriasSnap.docs
      .map(d => d.data().nombre)
      .filter(nombre => (conteo[nombre] || 0) > 0)
      .sort((a, b) => {
        if (a === "Otros") return 1;
        if (b === "Otros") return -1;
        return a.localeCompare(b);
      });

    contenedor.innerHTML = "";

    // Si no hay ninguna categoría con productos, no mostramos nada
    if (categorias.length === 0) {
      return;
    }

    // Chip "Todos" siempre primero
    const btnTodos = document.createElement("button");
    btnTodos.className = "categoria active";
    btnTodos.textContent = "Todos";
    btnTodos.dataset.categoria = "todos";
    contenedor.appendChild(btnTodos);

    // Chips de categorías con productos
    categorias.forEach(nombre => {
      const btn = document.createElement("button");
      btn.className = "categoria";
      btn.textContent = nombre;
      btn.dataset.categoria = nombre;
      contenedor.appendChild(btn);
    });

    // Conectar clicks de chips
    contenedor.querySelectorAll(".categoria").forEach(btn => {
      btn.addEventListener("click", () => {
        // Marcar activo
        contenedor.querySelectorAll(".categoria").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        // Filtrar
        categoriaActiva = btn.dataset.categoria;
        aplicarFiltros();
      });
    });

  } catch (error) {
    console.error("Error al cargar categorías:", error);
  }
}

/* ===== CARGAR PRODUCTOS ===== */
let productos = []; // array global con todos los productos activos
let categoriaActiva = "todos";
let textoBusqueda = "";

/* ===== CARRITO (en memoria) ===== */
let carrito = []; // [{ productoId, nombre, precio, cantidad, fotoUrl }]

async function cargarProductos() {
  const contenedor = document.getElementById("productos");

  try {
    const q = query(
      collection(db, "productos"),
      where("estado", "==", "activo")
    );
    const snapshot = await getDocs(q);

    productos = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));

    if (productos.length === 0) {
      contenedor.innerHTML = `
        <p style="grid-column: 1 / -1; text-align:center; padding:2rem; color:#7a6a5f;">
          No hay productos disponibles.
        </p>
      `;
      return;
    }

    aplicarFiltros();

  } catch (error) {
    console.error(error);
    contenedor.innerHTML = `
      <p style="grid-column: 1 / -1; text-align:center; padding:2rem; color:#c0392b;">
        Error al cargar productos.
      </p>
    `;
  }
}

/* ===== BUSCADOR ===== */
const buscadorInput = document.getElementById("buscadorInput");
if (buscadorInput) {
  buscadorInput.addEventListener("input", (e) => {
    textoBusqueda = e.target.value;
    aplicarFiltros();
  });
}

/* ===== APLICAR FILTROS ===== */
function normalizar(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function aplicarFiltros() {
  let filtrados = [...productos];

  // Filtro por categoría
  if (categoriaActiva !== "todos") {
    filtrados = filtrados.filter(p => (p.categoria || "Otros") === categoriaActiva);
  }

  // Filtro por texto (ignora acentos y mayúsculas)
  if (textoBusqueda.trim() !== "") {
    const texto = normalizar(textoBusqueda);
    filtrados = filtrados.filter(p =>
      normalizar(p.nombre).includes(texto)
    );
  }

  renderProductos(filtrados);
}

/* ===== AGREGAR AL CARRITO ===== */
function agregarAlCarrito(producto) {
  const existente = carrito.find(item => item.productoId === producto.id);

  if (existente) {
    existente.cantidad += 1;
  } else {
    carrito.push({
      productoId: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      fotoUrl: producto.fotoUrl,
      cantidad: 1
    });
  }

  actualizarContadorCarrito();
  mostrarToast(`"${producto.nombre}" agregado al pedido`);
}

/* ===== ACTUALIZAR CONTADOR ===== */
function actualizarContadorCarrito() {
  const btn = document.getElementById("btnCarrito");
  const total = carrito.reduce((sum, item) => sum + item.cantidad, 0);

  if (total > 0) {
    btn.textContent = `🛒 ${total}`;
  } else {
    btn.textContent = "🛒";
  }
}

/* ===== MODAL DE PRODUCTO ===== */
const modalOverlay = document.getElementById("modalOverlay");
const modalProducto = document.getElementById("modalProducto");
const modalVolver = document.getElementById("modalVolver");
const modalImg = document.getElementById("modalImg");
const modalNombre = document.getElementById("modalNombre");
const modalDescripcion = document.getElementById("modalDescripcion");
const modalPrecio = document.getElementById("modalPrecio");
const cantMenos = document.getElementById("cantMenos");
const cantMas = document.getElementById("cantMas");
const cantValor = document.getElementById("cantValor");
const btnAgregarModal = document.getElementById("btnAgregarModal");

let productoActual = null;
let cantidadActual = 1;

function abrirModal(producto) {
  productoActual = producto;
  cantidadActual = 1;

  // Imagen
  if (producto.fotoUrl) {
    modalImg.innerHTML = `<img src="${producto.fotoUrl}" alt="${producto.nombre}">`;
  } else {
    modalImg.innerHTML = `📦`;
  }

  // Textos
  modalNombre.textContent = producto.nombre || "Sin nombre";
  modalDescripcion.textContent = producto.descripcion || "";
  modalDescripcion.style.display = producto.descripcion ? "block" : "none";
  modalPrecio.textContent = `$${(producto.precio || 0).toLocaleString("es-AR")}`;
  cantValor.textContent = cantidadActual;

  modalOverlay.classList.add("active");
  modalProducto.classList.add("active");
}

function cerrarModal() {
  modalOverlay.classList.remove("active");
  modalProducto.classList.remove("active");
  productoActual = null;
  cantidadActual = 1;
}

cantMenos.addEventListener("click", () => {
  if (cantidadActual > 1) {
    cantidadActual -= 1;
    cantValor.textContent = cantidadActual;
  }
});

cantMas.addEventListener("click", () => {
  cantidadActual += 1;
  cantValor.textContent = cantidadActual;
});

btnAgregarModal.addEventListener("click", () => {
  if (!productoActual) return;

  // Agregar la cantidad elegida al carrito
  const existente = carrito.find(item => item.productoId === productoActual.id);

  if (existente) {
    existente.cantidad += cantidadActual;
  } else {
    carrito.push({
      productoId: productoActual.id,
      nombre: productoActual.nombre,
      precio: productoActual.precio,
      fotoUrl: productoActual.fotoUrl,
      cantidad: cantidadActual
    });
  }

  actualizarContadorCarrito();
  cerrarModal();
  mostrarModalConfirmacion();
});

modalVolver.addEventListener("click", cerrarModal);
modalOverlay.addEventListener("click", cerrarModal);

/* ===== RENDER PRODUCTOS ===== */
function renderProductos(lista) {
  const contenedor = document.getElementById("productos");
  contenedor.innerHTML = "";

  lista.forEach(p => {
    const div = document.createElement("div");
    div.className = "producto";

    const fotoHtml = p.fotoUrl
      ? `<div class="img"><img src="${p.fotoUrl}" alt="${p.nombre}" style="width:100%;height:100%;object-fit:cover;"></div>`
      : `<div class="img">📦</div>`;

    div.innerHTML = `
      ${fotoHtml}
      <h3>${p.nombre || "Sin nombre"}</h3>
      <p>$${(p.precio || 0).toLocaleString("es-AR")}</p>
    `;

    // Click en la card abre el modal
    div.style.cursor = "pointer";
    div.addEventListener("click", () => abrirModal(p));

    contenedor.appendChild(div);
  });
}

/* ===== INICIALIZAR ===== */
cargarCategorias();
cargarProductos();


/* ===== MODAL DE CONFIRMACIÓN ===== */
const confirmOverlay = document.getElementById("confirmOverlay");
const confirmModal = document.getElementById("confirmModal");
const btnVerCarrito = document.getElementById("btnVerCarrito");
const btnSeguirComprando = document.getElementById("btnSeguirComprando");

function mostrarModalConfirmacion() {
  confirmOverlay.classList.add("active");
  confirmModal.classList.add("active");
}

function cerrarModalConfirmacion() {
  confirmOverlay.classList.remove("active");
  confirmModal.classList.remove("active");
}

btnSeguirComprando.addEventListener("click", cerrarModalConfirmacion);
confirmOverlay.addEventListener("click", cerrarModalConfirmacion);

btnVerCarrito.addEventListener("click", () => {
  cerrarModalConfirmacion();
  // Por ahora no hace nada más, el carrito se abre en K7
  mostrarToast("El carrito se abre en el siguiente paso");
});