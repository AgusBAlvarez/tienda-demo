/* ===== IMPORTS ===== */
import { db } from "../../shared/firebase-config.js";
import {
  collection, getDocs, query, where, setDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { esc } from "../../shared/utils.js";

/* ===== ESTADO GLOBAL ===== */
let productos = [];
let categoriaActiva = "todos";
let textoBusqueda = "";
let carrito = [];
let productoActual = null;
let cantidadActual = 1;
let pedidoFinalizado = null;

/* ===== CARRITO PERSISTENTE (C1) ===== */
function guardarCarrito() {
  localStorage.setItem("carrito", JSON.stringify(carrito));
}

try {
  const carritoGuardado = localStorage.getItem("carrito");
  if (carritoGuardado) {
    carrito = JSON.parse(carritoGuardado);
  }
} catch (e) {
  console.warn("Carrito corrupto, iniciando vacío:", e);
  carrito = [];
}

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

function ocultarToast() {
  const toast = document.getElementById("toast");
  if (!toast) return;
  clearTimeout(toastTimeout);
  toast.classList.remove("visible");
}

/* ===== NORMALIZAR ===== */
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

    // ── NUEVO: Llenar el submenú del menú lateral (DENTRO de la función) ──
    const subMenu = document.getElementById("subMenuCategorias");
    const linkCategorias = document.getElementById("linkMenuCategorias");
    const flecha = document.getElementById("flechaCategorias");

    if (subMenu && linkCategorias && flecha) {
      subMenu.innerHTML = "";

      // Opción "Todos"
      const liTodos = document.createElement("li");
      liTodos.innerHTML = `<a href="#" style="font-size: 0.85rem; color: var(--text-light);">Todos los productos</a>`;
      liTodos.querySelector("a").addEventListener("click", (e) => {
        e.preventDefault();
        categoriaActiva = "todos";
        contenedor.querySelectorAll(".categoria").forEach(b => b.classList.remove("active"));
        contenedor.querySelector('[data-categoria="todos"]').classList.add("active");
        aplicarFiltros();
        cerrarMenu();
      });
      subMenu.appendChild(liTodos);

      // Categorías reales
      categorias.forEach(nombre => {
        const li = document.createElement("li");
        li.innerHTML = `<a href="#" style="font-size: 0.85rem; color: var(--text-light);">${esc(nombre)}</a>`;
        li.querySelector("a").addEventListener("click", (e) => {
          e.preventDefault();
          categoriaActiva = nombre;
          contenedor.querySelectorAll(".categoria").forEach(b => b.classList.remove("active"));
          const chipActivo = contenedor.querySelector(`[data-categoria="${nombre}"]`);
          if (chipActivo) chipActivo.classList.add("active");
          aplicarFiltros();
          cerrarMenu();
        });
        subMenu.appendChild(li);
      });

      // Abrir/cerrar acordeón (solo una vez)
      if (!linkCategorias.dataset.listener) {
        linkCategorias.addEventListener("click", (e) => {
          e.preventDefault();
          if (subMenu.style.display === "none" || !subMenu.style.display) {
            subMenu.style.display = "block";
            flecha.style.transform = "rotate(180deg)";
          } else {
            subMenu.style.display = "none";
            flecha.style.transform = "rotate(0deg)";
          }
        });
        linkCategorias.dataset.listener = "true";
      }
    }

  } catch (error) {
    console.error("Error al cargar categorías:", error);
  }
}

/* ===== CARGAR PRODUCTOS ===== */
async function cargarProductos() {
  const contenedor = document.getElementById("productos");

  try {
    const q = query(collection(db, "productos"), where("estado", "==", "activo"));
    const snapshot = await getDocs(q);

    productos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

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

/* ===== FILTROS ===== */
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
      ? `<div class="img"><img src="${esc(p.fotoUrl)}" alt="${esc(p.nombre)}" style="width:100%;height:100%;object-fit:cover;"></div>`
      : `<div class="img">📦</div>`;

    div.innerHTML = `
      ${fotoHtml}
      <h3>${esc(p.nombre) || "Sin nombre"}</h3>
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

/* ===== MODAL PRODUCTO ===== */
const modalOverlay = document.getElementById("modalOverlay");
const modalProducto = document.getElementById("modalProducto");
const modalVolver = document.getElementById("modalVolver");
const modalImg = document.getElementById("modalImg");
const modalNombre = document.getElementById("modalNombre");
const modalDescripcion = document.getElementById("modalDescripcion");
const modalPrecio = document.getElementById("modalPrecio");
const modalStock = document.getElementById("modalStock");
const cantMenos = document.getElementById("cantMenos");
const cantMas = document.getElementById("cantMas");
const cantValor = document.getElementById("cantValor");
const btnAgregarModal = document.getElementById("btnAgregarModal");

function actualizarLabelStock(stock, cantidadActual) {
  if (!modalStock) return;

  modalStock.classList.remove("stock-bajo", "stock-agotado");

  if (stock === 0) {
    modalStock.textContent = "Sin stock";
    modalStock.classList.add("stock-agotado");
  } else {
    modalStock.textContent = `Hay ${stock} producto${stock === 1 ? "" : "s"} disponible${stock === 1 ? "" : "s"}`;
  }

  if (cantMas) {
    cantMas.disabled = cantidadActual >= stock || stock === 0;
  }
}

function abrirModalProducto(producto) {
  ocultarToast();
  productoActual = producto;
  cantidadActual = 1;

  if (producto.fotoUrl) {
    modalImg.innerHTML = `<img src="${esc(producto.fotoUrl)}" alt="${esc(producto.nombre)}">`;
  } else {
    modalImg.innerHTML = `📦`;
  }

  modalNombre.textContent = producto.nombre || "Sin nombre";
  modalDescripcion.textContent = producto.descripcion || "";
  modalDescripcion.style.display = producto.descripcion ? "block" : "none";
  modalPrecio.textContent = `$${(producto.precio || 0).toLocaleString("es-AR")}`;
  cantValor.textContent = cantidadActual;

  actualizarLabelStock(producto.stock || 0, cantidadActual);

  const stock = producto.stock || 0;
  const sinStock = stock === 0;

  btnAgregarModal.disabled = sinStock;
  btnAgregarModal.textContent = sinStock ? "Sin stock" : "Agregar al carrito";
  cantMas.disabled = sinStock;
  cantMenos.disabled = sinStock;

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
    actualizarLabelStock(productoActual?.stock || 0, cantidadActual);
  }
});

cantMas.addEventListener("click", () => {
  if (productoActual && cantidadActual < (productoActual.stock || 0)) {
    cantidadActual += 1;
    cantValor.textContent = cantidadActual;
    actualizarLabelStock(productoActual?.stock || 0, cantidadActual);
  }
});

btnAgregarModal.addEventListener("click", () => {
  if (!productoActual) return;

  const existente = carrito.find(item => item.productoId === productoActual.id);
  const cantidadEnCarrito = existente ? existente.cantidad : 0;
  const stockDisponible = productoActual.stock || 0;

  if (cantidadEnCarrito + cantidadActual > stockDisponible) {
    mostrarToast(`Solo hay ${stockDisponible} de "${productoActual.nombre}"`);
    return;
  }

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

  guardarCarrito();
  actualizarContadorCarrito();
  cerrarModalProducto();
  mostrarModalConfirmacion();
});

modalVolver.addEventListener("click", cerrarModalProducto);
modalOverlay.addEventListener("click", cerrarModalProducto);

/* ===== MODAL CONFIRMACIÓN ===== */
const confirmOverlay = document.getElementById("confirmOverlay");
const confirmModal = document.getElementById("confirmModal");
const btnVerCarrito = document.getElementById("btnVerCarrito");
const btnSeguirComprando = document.getElementById("btnSeguirComprando");

function mostrarModalConfirmacion() {
  ocultarToast();
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
  setTimeout(() => abrirModalCarrito(), 100);
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
  ocultarToast();
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
      ? `<img src="${esc(item.fotoUrl)}" alt="${esc(item.nombre)}">`
      : `📦`;

    div.innerHTML = `
      <div class="carrito-item-img">${imgHtml}</div>
      <div class="carrito-item-info">
        <h4>${esc(item.nombre)}</h4>
        <p class="precio">$${(item.precio || 0).toLocaleString("es-AR")}</p>
        <div class="carrito-item-cantidad">
          <button class="btn-menos">−</button>
          <span>${item.cantidad}</span>
          <button class="btn-mas">+</button>
        </div>
      </div>
      <button class="carrito-item-quitar"><i class="bi bi-trash"></i></button>
    `;

    div.querySelector(".btn-menos").addEventListener("click", () => {
      if (item.cantidad > 1) {
        item.cantidad -= 1;
      } else {
        carrito = carrito.filter(i => i.productoId !== item.productoId);
      }
      guardarCarrito();
      actualizarContadorCarrito();
      renderCarrito();
    });

    div.querySelector(".btn-mas").addEventListener("click", () => {
      const prod = productos.find(p => p.id === item.productoId);
      const stockMax = prod?.stock || 0;

      if (item.cantidad < stockMax) {
        item.cantidad += 1;
        guardarCarrito();
        actualizarContadorCarrito();
        renderCarrito();
      } else {
        mostrarToast(`Solo hay ${stockMax} disponible(s)`);
      }
    });

    div.querySelector(".carrito-item-quitar").addEventListener("click", () => {
      carrito = carrito.filter(i => i.productoId !== item.productoId);
      guardarCarrito();
      actualizarContadorCarrito();
      renderCarrito();
    });

    carritoBody.appendChild(div);
  });

  const total = carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  carritoTotal.textContent = `$${total.toLocaleString("es-AR")}`;
}

/* ===== CONTADOR CARRITO ===== */
function actualizarContadorCarrito() {
  const total = carrito.reduce((sum, item) => sum + item.cantidad, 0);
  btnCarrito.innerHTML = total > 0 
    ? `<i class="bi bi-basket"></i> ${total}` 
    : `<i class="bi bi-basket"></i>`;
}

/* ===== GENERAR CÓDIGO (sin getDoc, confiar en setDoc) ===== */
function generarCodigo() {
  const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let c = "";
  for (let i = 0; i < 6; i++) {
    c += ALFABETO[Math.floor(Math.random() * 32)];
  }
  return c;
}

/* ===== FINALIZAR PEDIDO (con reintentos, sin getDoc) ===== */
btnFinalizar.addEventListener("click", async () => {
  if (carrito.length === 0) return;
  if (pedidoFinalizado) return;

  btnFinalizar.disabled = true;
  btnFinalizar.textContent = "Generando pedido...";

  try {
    const total = carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
    const MAX_INTENTOS = 5;

    let codigo = null;

    for (let intento = 0; intento < MAX_INTENTOS && !codigo; intento++) {
      const codigoIntento = generarCodigo();
      const pedidoRef = doc(db, "pedidos", codigoIntento);

      try {
        await setDoc(pedidoRef, {
          codigo: codigoIntento,
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
        codigo = codigoIntento;
      } catch (err) {
        if (err.code === "permission-denied") {
          // Puede ser colisión de código O datos inválidos según reglas
          console.warn(`Intento ${intento + 1}/${MAX_INTENTOS} falló, reintentando...`);
        } else {
          throw err;
        }
      }
    }

    if (!codigo) {
      throw new Error("No se pudo generar el pedido. Intentá de nuevo.");
    }

    pedidoFinalizado = { codigo, items: [...carrito], total };

    document.getElementById("vistaCarrito").style.display = "none";
    document.getElementById("vistaFinalizado").style.display = "block";
    document.getElementById("codigoPedido").textContent = `#${codigo}`;

    carrito = [];
    guardarCarrito();
    actualizarContadorCarrito();

  } catch (error) {
    console.error(error);
    mostrarToast(error.message || "Error al generar el pedido");
    btnFinalizar.disabled = false;
    btnFinalizar.textContent = "Finalizar pedido";
  }
});

/* ===== WHATSAPP ===== */
document.getElementById("btnWhatsApp").addEventListener("click", () => {
  if (!pedidoFinalizado) return;

  const { codigo, items, total } = pedidoFinalizado;

  let mensaje = `#${codigo}\n\nHola, quiero hacer este pedido:\n`;
  items.forEach(item => {
    mensaje += `- ${item.cantidad}x ${item.nombre}\n`;
  });
  mensaje += `\nTotal: $${total.toLocaleString("es-AR")}`;

  const numero = "5492616946182";
  const url = `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, "_blank");
});

/* ===== CERRAR VISTA FINALIZADA ===== */
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

/* ===== CARRUSEL DE BANNERS ===== */
async function cargarBanners() {
  const contenedor = document.getElementById("carruselBanners");
  
  try {
    const snapshot = await getDocs(collection(db, "banners"));
    const banners = snapshot.docs.map(d => d.data());
    
    if (banners.length === 0) {
      contenedor.innerHTML = `<div class="banner-img"></div>`;
      return;
    }

    contenedor.innerHTML = "";
    
    // 1. Contenedor de las imágenes
    const slidesContainer = document.createElement("div");
    slidesContainer.className = "slides-container";
    
    // 2. Contenedor de los puntitos
    const dotsContainer = document.createElement("div");
    dotsContainer.className = "dots-container";

    banners.forEach((b, index) => {
      // Crear slide
      const div = document.createElement("div");
      div.className = `carrusel-slide ${index === 0 ? 'active' : ''}`;
      
      const img = document.createElement("img");
      img.src = b.fotoUrl;
      img.alt = b.titulo || "Oferta";

      // --- LÓGICA NUEVA: Si tiene categoría, al hacer clic filtra ---
      if (b.categoria) {
        img.style.cursor = "pointer";
        img.addEventListener("click", () => {
          categoriaActiva = b.categoria;
          
          // Actualizar visualmente los chips de arriba
          const chips = document.querySelectorAll(".categoria");
          chips.forEach(c => c.classList.remove("active"));
          const chipActivo = document.querySelector(`[data-categoria="${b.categoria}"]`);
          if (chipActivo) chipActivo.classList.add("active");
          
          aplicarFiltros();
          
          // Hacemos scroll suave hasta los productos
          document.getElementById("productos").scrollIntoView({ behavior: "smooth" });
        });
      } else if (b.link) {
        // Si tiene link en lugar de categoría, lo usamos
        img.style.cursor = "pointer";
        img.addEventListener("click", () => {
          window.open(b.link, "_blank");
        });
      }

      div.appendChild(img);
      slidesContainer.appendChild(div);

      // Crear puntito
      const dot = document.createElement("span");
      dot.className = `dot ${index === 0 ? 'active' : ''}`;
      dot.dataset.index = index;
      
      // Al hacer clic en el puntito, cambiar de slide
      dot.addEventListener("click", () => {
        cambiarSlide(index);
      });
      
      dotsContainer.appendChild(dot);
    });

    contenedor.appendChild(slidesContainer);
    contenedor.appendChild(dotsContainer);

    // Lógica de rotación automática
    let current = 0;
    const slides = contenedor.querySelectorAll(".carrusel-slide");
    const dots = contenedor.querySelectorAll(".dot");
    
    function cambiarSlide(index) {
      slides[current].classList.remove("active");
      dots[current].classList.remove("active");
      current = index;
      slides[current].classList.add("active");
      dots[current].classList.add("active");
    }

    if (slides.length > 1) {
      setInterval(() => {
        let next = (current + 1) % slides.length;
        cambiarSlide(next);
      }, 4000);
    }
  } catch (error) {
    console.error("Error cargando banners:", error);
  }
}

/* ===== INICIALIZAR ===== */
actualizarContadorCarrito();
cargarCategorias();
cargarProductos();
cargarBanners();