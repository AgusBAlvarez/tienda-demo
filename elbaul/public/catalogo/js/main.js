/* ===== IMPORTS ===== */
import { db } from "../../shared/firebase-config.js";
import {
  collection, getDocs, query, where, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ===== ESTADO GLOBAL ===== */
let productos = [];
let categoriaActiva = "todos";
let textoBusqueda = "";
let carrito = [];
let productoActual = null;
let cantidadActual = 1;
let pedidoFinalizado = null; // { codigo, items, total }

/* ===== MENÚ LATERAL ===== */
const menuBtn = document.querySelector(".menu-btn");
const menu = document.querySelector(".menu-lateral");
const cerrarMenuBtn = document.querySelector(".cerrar");
const overlay = document.querySelector(".overlay");

const abrirMenu = () => {
  menu.classList.add("active");
  overlay.classList.add("active");
};

const cerrarMenu = () => {
  menu.classList.remove("active");
  overlay.classList.remove("active");
};

menuBtn.addEventListener("click", abrirMenu);
cerrarMenuBtn.addEventListener("click", cerrarMenu);
overlay.addEventListener("click", cerrarMenu);

/* ===== TOAST ===== */
let toastTimeout;
function mostrarToast(mensaje) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = mensaje;
  toast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("visible");
  }, 2500);
}

/* ===== NORMALIZAR TEXTO (sin acentos) ===== */
function normalizar(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/* ===== CARGAR CATEGORÍAS ===== */
async function cargarCategorias() {
  const contenedor = document.getElementById("categorias");

  try {
    const [categoriasSnap, productosSnap] = await Promise.all([
      getDocs(collection(db, "categorias")),
      getDocs(query(collection(db, "productos"), where("estado", "==", "activo")))
    ]);

    const conteo = {};
    productosSnap.forEach(d => {
      const cat = d.data().categoria || "Otros";
      conteo[cat] = (conteo[cat] || 0) + 1;
    });

    const categorias = categoriasSnap.docs
      .map(d => d.data().nombre)
      .filter(nombre => (conteo[nombre] || 0) > 0)
      .sort((a, b) => {
        if (a === "Otros") return 1;
        if (b === "Otros") return -1;
        return a.localeCompare(b);
      });

    contenedor.innerHTML = "";

    if (categorias.length === 0) return;

    const btnTodos = document.createElement("button");
    btnTodos.className = "categoria active";
    btnTodos.textContent = "Todos";
    btnTodos.dataset.categoria = "todos";
    contenedor.appendChild(btnTodos);

    categorias.forEach(nombre => {
      const btn = document.createElement("button");
      btn.className = "categoria";
      btn.textContent = nombre;
      btn.dataset.categoria = nombre;
      contenedor.appendChild(btn);
    });

    contenedor.querySelectorAll(".categoria").forEach(btn => {
      btn.addEventListener("click", () => {
        contenedor.querySelectorAll(".categoria").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        categoriaActiva = btn.dataset.categoria;
        aplicarFiltros();
      });
    });

  } catch (error) {
    console.error("Error al cargar categorías:", error);
  }
}

/* ===== CARGAR PRODUCTOS ===== */
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

/* ===== APLICAR FILTROS ===== */
function aplicarFiltros() {
  let filtrados = [...productos];

  if (categoriaActiva !== "todos") {
    filtrados = filtrados.filter(p => (p.categoria || "Otros") === categoriaActiva);
  }

  if (textoBusqueda.trim() !== "") {
    const texto = normalizar(textoBusqueda);
    filtrados = filtrados.filter(p => normalizar(p.nombre).includes(texto));
  }

  renderProductos(filtrados);
}

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

    div.style.cursor = "pointer";
    div.addEventListener("click", () => abrirModalProducto(p));

    contenedor.appendChild(div);
  });
}

/* ===== BUSCADOR ===== */
const buscadorInput = document.getElementById("buscadorInput");
if (buscadorInput) {
  buscadorInput.addEventListener("input", (e) => {
    textoBusqueda = e.target.value;
    aplicarFiltros();
  });
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

function abrirModalProducto(producto) {
  productoActual = producto;
  cantidadActual = 1;

  if (producto.fotoUrl) {
    modalImg.innerHTML = `<img src="${producto.fotoUrl}" alt="${producto.nombre}">`;
  } else {
    modalImg.innerHTML = `📦`;
  }

  modalNombre.textContent = producto.nombre || "Sin nombre";
  modalDescripcion.textContent = producto.descripcion || "";
  modalDescripcion.style.display = producto.descripcion ? "block" : "none";
  modalPrecio.textContent = `$${(producto.precio || 0).toLocaleString("es-AR")}`;
  cantValor.textContent = cantidadActual;

  modalOverlay.classList.add("active");
  modalProducto.classList.add("active");
}

function cerrarModalProducto() {
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
  cerrarModalProducto();
  mostrarModalConfirmacion();
});

modalVolver.addEventListener("click", cerrarModalProducto);
modalOverlay.addEventListener("click", cerrarModalProducto);

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
  setTimeout(() => {
    abrirModalCarrito();
  }, 100);
});

/* ===== MODAL CARRITO ===== */
const carritoOverlay = document.getElementById("carritoOverlay");
const modalCarrito = document.getElementById("modalCarrito");
const carritoCerrar = document.getElementById("carritoCerrar");
const carritoBody = document.getElementById("carritoBody");
const carritoTotal = document.getElementById("carritoTotal");
const carritoFooter = document.getElementById("carritoFooter");
const btnFinalizar = document.getElementById("btnFinalizar");
const btnCarrito = document.getElementById("btnCarrito");

function abrirModalCarrito() {
  resetearVistaCarrito();
  renderCarrito();
  carritoOverlay.classList.add("active");
  modalCarrito.classList.add("active");
}

function cerrarModalCarrito() {
  carritoOverlay.classList.remove("active");
  modalCarrito.classList.remove("active");
  resetearVistaCarrito();
}

btnCarrito.addEventListener("click", abrirModalCarrito);
carritoCerrar.addEventListener("click", cerrarModalCarrito);
carritoOverlay.addEventListener("click", cerrarModalCarrito);

/* ===== RENDER CARRITO ===== */
function renderCarrito() {
  carritoBody.innerHTML = "";

  if (carrito.length === 0) {
    carritoBody.innerHTML = `
      <div class="carrito-vacio">
        <div class="icono">🛒</div>
        <p>Tu pedido está vacío</p>
      </div>
    `;
    carritoFooter.style.display = "none";
    return;
  }

  carritoFooter.style.display = "block";

  carrito.forEach(item => {
    const div = document.createElement("div");
    div.className = "carrito-item";

    const imgHtml = item.fotoUrl
      ? `<img src="${item.fotoUrl}" alt="${item.nombre}">`
      : `📦`;

    div.innerHTML = `
      <div class="carrito-item-img">${imgHtml}</div>
      <div class="carrito-item-info">
        <h4>${item.nombre}</h4>
        <p class="precio">$${(item.precio || 0).toLocaleString("es-AR")}</p>
        <div class="carrito-item-cantidad">
          <button class="btn-menos">−</button>
          <span>${item.cantidad}</span>
          <button class="btn-mas">+</button>
        </div>
      </div>
      <button class="carrito-item-quitar">🗑️</button>
    `;

    div.querySelector(".btn-menos").addEventListener("click", () => {
      if (item.cantidad > 1) {
        item.cantidad -= 1;
      } else {
        carrito = carrito.filter(i => i.productoId !== item.productoId);
      }
      actualizarContadorCarrito();
      renderCarrito();
    });

    div.querySelector(".btn-mas").addEventListener("click", () => {
      item.cantidad += 1;
      actualizarContadorCarrito();
      renderCarrito();
    });

    div.querySelector(".carrito-item-quitar").addEventListener("click", () => {
      carrito = carrito.filter(i => i.productoId !== item.productoId);
      actualizarContadorCarrito();
      renderCarrito();
    });

    carritoBody.appendChild(div);
  });

  const total = carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  carritoTotal.textContent = `$${total.toLocaleString("es-AR")}`;
}

/* ===== ACTUALIZAR CONTADOR CARRITO ===== */
function actualizarContadorCarrito() {
  const total = carrito.reduce((sum, item) => sum + item.cantidad, 0);
  if (total > 0) {
    btnCarrito.textContent = `🛒 ${total}`;
  } else {
    btnCarrito.textContent = "🛒";
  }
}

/* ===== GENERAR CÓDIGO ÚNICO ===== */
const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generarCodigo() {
  let codigo = "";
  for (let i = 0; i < 4; i++) {
    codigo += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return codigo;
}

async function generarCodigoUnico() {
  let intentos = 0;
  while (intentos < 10) {
    const codigo = generarCodigo();
    const q = query(collection(db, "pedidos"), where("codigo", "==", codigo));
    const snap = await getDocs(q);
    if (snap.empty) return codigo;
    intentos++;
  }
  // Fallback: 5 caracteres
  return generarCodigo() + generarCodigo()[0];
}

/* ===== FINALIZAR PEDIDO ===== */
btnFinalizar.addEventListener("click", async () => {
  if (carrito.length === 0) return;
  if (pedidoFinalizado) return;

  btnFinalizar.disabled = true;
  btnFinalizar.textContent = "Generando pedido...";

  try {
    const codigo = await generarCodigoUnico();
    const total = carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);

    // Guardar en Firestore
    await addDoc(collection(db, "pedidos"), {
      codigo,
      fecha: serverTimestamp(),
      items: carrito.map(item => ({
        productoId: item.productoId,
        nombre: item.nombre,
        cantidad: item.cantidad,
        precioCongelado: item.precio
      })),
      total,
      estado: "pendiente"
    });

    pedidoFinalizado = { codigo, items: [...carrito], total };

    // Mostrar vista finalizada
    document.getElementById("vistaCarrito").style.display = "none";
    document.getElementById("vistaFinalizado").style.display = "block";
    document.getElementById("codigoPedido").textContent = `#${codigo}`;

    // Vaciar carrito (ya está en el pedido)
    carrito = [];
    actualizarContadorCarrito();

  } catch (error) {
    console.error(error);
    mostrarToast("Error al generar el pedido");
    btnFinalizar.disabled = false;
    btnFinalizar.textContent = "Finalizar pedido";
  }
});

/* ===== ENVIAR POR WHATSAPP ===== */
document.getElementById("btnWhatsApp").addEventListener("click", () => {
  if (!pedidoFinalizado) return;

  const { codigo, items, total } = pedidoFinalizado;

  let mensaje = `#${codigo}\n\nHola, quiero hacer este pedido:\n`;
  items.forEach(item => {
    mensaje += `- ${item.cantidad}x ${item.nombre}\n`;
  });
  mensaje += `\nTotal: $${total.toLocaleString("es-AR")}`;

  const numero = "5492616946182"; // ← tu número
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, "_blank");
});

/* ===== CERRAR MODAL DESDE VISTA FINALIZADA ===== */
document.getElementById("carritoCerrarFinal").addEventListener("click", () => {
  cerrarModalCarrito();
  resetearVistaCarrito();
});

function resetearVistaCarrito() {
  pedidoFinalizado = null;
  document.getElementById("vistaCarrito").style.display = "block";
  document.getElementById("vistaFinalizado").style.display = "none";
  btnFinalizar.disabled = false;
  btnFinalizar.textContent = "Finalizar pedido";
}

/* ===== INICIALIZAR ===== */
cargarCategorias();
cargarProductos();