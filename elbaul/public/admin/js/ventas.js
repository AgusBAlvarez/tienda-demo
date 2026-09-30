/* ===== IMPORTS ===== */
import { auth, db } from "../../shared/firebase-config.js";
import {
  collection, getDocs, query, where, updateDoc, doc,
  runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { protegerPagina, configurarLogout } from "./auth-guard.js";

/* ===== ESTADO ===== */
let itemsVenta = [];
let pedidoActual = null;
let metodoPago = null;

/* ===== PROTECCIÓN ===== */
protegerPagina();
configurarLogout();

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
  }, 3000);
}

/* ===== BUSCAR PEDIDO POR CÓDIGO ===== */
const inputCodigo = document.getElementById("inputCodigo");
const btnBuscarCodigo = document.getElementById("btnBuscarCodigo");
const errorCodigo = document.getElementById("errorCodigo");

btnBuscarCodigo.addEventListener("click", buscarPorCodigo);
inputCodigo.addEventListener("keydown", (e) => {
  if (e.key === "Enter") buscarPorCodigo();
});

async function buscarPorCodigo() {
  const codigo = inputCodigo.value.trim().toUpperCase().replace("#", "");
  errorCodigo.textContent = "";

  if (!codigo) {
    errorCodigo.textContent = "Ingresá un código.";
    return;
  }

  try {
    const q = query(
      collection(db, "pedidos"),
      where("codigo", "==", codigo)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      errorCodigo.textContent = "No se encontró ningún pedido con ese código.";
      return;
    }

    const docSnap = snapshot.docs[0];
    const pedido = { id: docSnap.id, ...docSnap.data() };

    if (pedido.estado === "confirmado") {
      errorCodigo.textContent = "Este pedido ya fue confirmado.";
      return;
    }

    pedidoActual = pedido;
    itemsVenta = pedido.items.map(item => ({
      productoId: item.productoId,
      nombre: item.nombre,
      precio: item.precioCongelado,
      cantidad: item.cantidad
    }));

    renderItems();
    actualizarTotal();
    mostrarToast(`Pedido #${codigo} cargado`);

  } catch (error) {
    console.error(error);
    errorCodigo.textContent = "Error al buscar el pedido.";
  }
}

/* ===== RENDER ITEMS ===== */
function renderItems() {
  const contenedor = document.getElementById("itemsVenta");

  if (itemsVenta.length === 0) {
    contenedor.innerHTML = `<p class="texto-vacio">Buscá un código o agregá productos manualmente.</p>`;
    return;
  }

  contenedor.innerHTML = "";

  itemsVenta.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "venta-item";

    div.innerHTML = `
      <div class="venta-item-info">
        <h4>${item.nombre}</h4>
        <p class="precio">$${item.precio.toLocaleString("es-AR")}</p>
      </div>
      <div class="venta-item-cantidad">
        <button class="btn-menos" data-index="${index}">−</button>
        <span>${item.cantidad}</span>
        <button class="btn-mas" data-index="${index}">+</button>
      </div>
      <div class="venta-item-subtotal">
        $${(item.precio * item.cantidad).toLocaleString("es-AR")}
      </div>
      <button class="venta-item-quitar" data-index="${index}">🗑️</button>
    `;

    contenedor.appendChild(div);
  });

  contenedor.querySelectorAll(".btn-menos").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.index);
      if (itemsVenta[i].cantidad > 1) {
        itemsVenta[i].cantidad -= 1;
      } else {
        itemsVenta.splice(i, 1);
      }
      renderItems();
      actualizarTotal();
    });
  });

  contenedor.querySelectorAll(".btn-mas").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.index);
      itemsVenta[i].cantidad += 1;
      renderItems();
      actualizarTotal();
    });
  });

  contenedor.querySelectorAll(".venta-item-quitar").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.index);
      itemsVenta.splice(i, 1);
      renderItems();
      actualizarTotal();
    });
  });
}

/* ===== ACTUALIZAR TOTAL ===== */
function actualizarTotal() {
  const total = itemsVenta.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  document.getElementById("totalVenta").textContent = `$${total.toLocaleString("es-AR")}`;
  actualizarBotonConfirmar();
}

/* ===== BUSCAR PRODUCTO (VENTA MANUAL) ===== */
const buscarOverlay = document.getElementById("buscarOverlay");
const buscarModal = document.getElementById("buscarModal");
const buscarProductoInput = document.getElementById("buscarProductoInput");
const buscarResultados = document.getElementById("buscarResultados");
const btnAgregarManual = document.getElementById("btnAgregarManual");
const btnCerrarBuscar = document.getElementById("btnCerrarBuscar");

let productosCache = [];

btnAgregarManual.addEventListener("click", abrirBuscar);
btnCerrarBuscar.addEventListener("click", cerrarBuscar);
buscarOverlay.addEventListener("click", cerrarBuscar);

async function abrirBuscar() {
  buscarOverlay.classList.add("active");
  buscarModal.classList.add("active");
  buscarProductoInput.value = "";
  buscarResultados.innerHTML = `<p class="texto-vacio">Escribí para buscar productos.</p>`;
  buscarProductoInput.focus();

  if (productosCache.length === 0) {
    try {
      const snapshot = await getDocs(collection(db, "productos"));
      productosCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
      console.error(error);
    }
  }
}

function cerrarBuscar() {
  buscarOverlay.classList.remove("active");
  buscarModal.classList.remove("active");
}

function normalizar(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

buscarProductoInput.addEventListener("input", (e) => {
  const texto = normalizar(e.target.value);

  if (texto.trim() === "") {
    buscarResultados.innerHTML = `<p class="texto-vacio">Escribí para buscar productos.</p>`;
    return;
  }

  const filtrados = productosCache
    .filter(p => normalizar(p.nombre).includes(texto))
    .slice(0, 8);

  if (filtrados.length === 0) {
    buscarResultados.innerHTML = `<p class="texto-vacio">No se encontraron productos.</p>`;
    return;
  }

  buscarResultados.innerHTML = "";

  filtrados.forEach(p => {
    const div = document.createElement("div");
    div.className = "buscar-resultado";

    div.innerHTML = `
      <div>
        <div class="nombre">${p.nombre}</div>
        <div class="detalles">Stock: ${p.stock ?? "—"} · ${p.categoria || "Sin categoría"}</div>
      </div>
      <span class="precio">$${(p.precio || 0).toLocaleString("es-AR")}</span>
    `;

    div.addEventListener("click", () => {
      agregarProductoManual(p);
    });

    buscarResultados.appendChild(div);
  });
});

function agregarProductoManual(producto) {
  const existente = itemsVenta.find(i => i.productoId === producto.id);

  if (existente) {
    existente.cantidad += 1;
  } else {
    itemsVenta.push({
      productoId: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      cantidad: 1
    });
  }

  renderItems();
  actualizarTotal();
  cerrarBuscar();
  mostrarToast(`"${producto.nombre}" agregado`);
}

/* ===== CONFIRMACIÓN DE VENTA ===== */
const confirmOverlay = document.getElementById("confirmOverlay");
const confirmModal = document.getElementById("confirmModal");
const confirmResumen = document.getElementById("confirmResumen");
const btnConfirmarVenta = document.getElementById("btnConfirmarVenta");
const btnCancelarConfirm = document.getElementById("btnCancelarConfirm");
const btnAceptarConfirm = document.getElementById("btnAceptarConfirm");

btnConfirmarVenta.addEventListener("click", abrirConfirmacion);
btnCancelarConfirm.addEventListener("click", cerrarConfirmacion);
confirmOverlay.addEventListener("click", cerrarConfirmacion);

function abrirConfirmacion() {
  // Leer el radio seleccionado actual (no depender de la variable)
  const radioSeleccionado = document.querySelector('input[name="metodoPago"]:checked');

  if (itemsVenta.length === 0) {
    mostrarToast("Agregá al menos un item");
    return;
  }

  if (!radioSeleccionado) {
    mostrarToast("Seleccioná un método de pago");
    return;
  }

  // Actualizar metodoPago con lo que está marcado en el DOM
  metodoPago = radioSeleccionado.value;

  const total = itemsVenta.reduce((sum, item) => sum + item.precio * item.cantidad, 0);

  const itemsHtml = itemsVenta.map(item => `
    <div class="confirm-item">
      <span><span class="cant">${item.cantidad}x</span> ${item.nombre}</span>
      <span>$${(item.precio * item.cantidad).toLocaleString("es-AR")}</span>
    </div>
  `).join("");

  const metodoTexto = {
    transferencia: "Transferencia",
    efectivo: "Efectivo",
    mercadolibre: "Mercado Libre",
    credito: "Crédito",
    debito: "Débito"
  }[metodoPago] || metodoPago;

  confirmResumen.innerHTML = `
    <h3>Items</h3>
    <div class="confirm-items">
      ${itemsHtml}
      <div class="confirm-total">
        <span>Total:</span>
        <strong>$${total.toLocaleString("es-AR")}</strong>
      </div>
    </div>
    <p class="confirm-metodo">Método de pago: <strong>${metodoTexto}</strong></p>
  `;

  confirmOverlay.classList.add("active");
  confirmModal.classList.add("active");
}

function cerrarConfirmacion() {
  confirmOverlay.classList.remove("active");
  confirmModal.classList.remove("active");
}

/* ===== ACEPTAR CONFIRMACIÓN — TRANSACCIÓN ===== */
btnAceptarConfirm.addEventListener("click", async () => {
  btnAceptarConfirm.disabled = true;
  btnAceptarConfirm.textContent = "Registrando...";

  try {
    const codigoPedido = pedidoActual?.codigo || null;
    const itemsParaVenta = itemsVenta.map(item => ({
      productoId: item.productoId,
      nombre: item.nombre,
      cantidad: item.cantidad,
      precioCongelado: item.precio
    }));

    const total = itemsVenta.reduce((sum, item) => sum + item.precio * item.cantidad, 0);

    const ventaRef = doc(collection(db, "ventas"));
    const pedidoRef = pedidoActual ? doc(db, "pedidos", pedidoActual.id) : null;

    const productosRefs = itemsParaVenta.map(item =>
      doc(db, "productos", item.productoId)
    );

    await runTransaction(db, async (tx) => {
      // ===== FASE 1: TODAS LAS LECTURAS =====

      const productosData = [];
      for (let i = 0; i < productosRefs.length; i++) {
        const prodSnap = await tx.get(productosRefs[i]);

        if (!prodSnap.exists()) {
          throw new Error(`El producto "${itemsParaVenta[i].nombre}" ya no existe.`);
        }

        const data = prodSnap.data();
        const stockActual = data.stock ?? 0;

        if (stockActual < itemsParaVenta[i].cantidad) {
          throw new Error(
            `Sin stock de "${itemsParaVenta[i].nombre}". Quedan ${stockActual}, pediste ${itemsParaVenta[i].cantidad}.`
          );
        }

        productosData.push({ ref: productosRefs[i], stockActual });
      }

      // Leer pedido (si existe) ANTES de cualquier escritura
      let pedidoSnap = null;
      if (pedidoRef) {
        pedidoSnap = await tx.get(pedidoRef);
        if (!pedidoSnap.exists()) {
          throw new Error("El pedido ya no existe.");
        }
        if (pedidoSnap.data().estado === "confirmado") {
          throw new Error("Este pedido ya fue confirmado.");
        }
      }

      // ===== FASE 2: TODAS LAS ESCRITURAS =====

      // Descontar stock
      for (let i = 0; i < productosData.length; i++) {
        tx.update(productosData[i].ref, {
          stock: productosData[i].stockActual - itemsParaVenta[i].cantidad,
          fechaActualizacion: serverTimestamp()
        });
      }

      // Marcar pedido como confirmado
      if (pedidoRef) {
        tx.update(pedidoRef, {
          estado: "confirmado",
          ventaId: ventaRef.id,
          fechaConfirmacion: serverTimestamp()
        });
      }

      // Crear la venta
      const ventaData = {
        fecha: serverTimestamp(),
        total,
        metodoPago,
        items: itemsParaVenta,
        registradoPor: auth.currentUser?.email || "desconocido"
      };

      if (codigoPedido) {
        ventaData.pedidoCodigo = codigoPedido;
      }

      tx.set(ventaRef, ventaData);
    });

    mostrarToast("Venta registrada correctamente");
    cerrarConfirmacion();
    limpiarVenta();
    cargarPendientes();

  } catch (error) {
    console.error(error);
    mostrarToast(error.message || "Error al registrar la venta");
  } finally {
    btnAceptarConfirm.disabled = false;
    btnAceptarConfirm.textContent = "Sí, registrar";
  }
});

/* ===== LIMPIAR VENTA ===== */
function limpiarVenta() {
  itemsVenta = [];
  pedidoActual = null;
  metodoPago = null;

  document.getElementById("inputCodigo").value = "";
  document.getElementById("errorCodigo").textContent = "";

  document.querySelectorAll('input[name="metodoPago"]').forEach(r => r.checked = false);

  renderItems();
  actualizarTotal();
}

/* ===== CARGAR PEDIDOS PENDIENTES ===== */
async function cargarPendientes() {
  const contenedor = document.getElementById("listaPendientes");

  try {
    const q = query(
      collection(db, "pedidos"),
      where("estado", "==", "pendiente")
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      contenedor.innerHTML = `<p class="texto-vacio">No hay pedidos pendientes.</p>`;
      return;
    }

    const hace7Dias = new Date();
    hace7Dias.setDate(hace7Dias.getDate() - 7);

    const pedidos = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => {
        if (!p.fecha?.toDate) return true;
        return p.fecha.toDate() >= hace7Dias;
      })
      .sort((a, b) => {
        const fa = a.fecha?.toMillis?.() || 0;
        const fb = b.fecha?.toMillis?.() || 0;
        return fb - fa;
      })
      .slice(0, 10);

    if (pedidos.length === 0) {
      contenedor.innerHTML = `<p class="texto-vacio">No hay pedidos pendientes recientes.</p>`;
      return;
    }

    contenedor.innerHTML = "";

    pedidos.forEach(p => {
      const div = document.createElement("div");
      div.className = "pedido-pendiente";

      const fecha = p.fecha?.toDate
        ? formatearFecha(p.fecha.toDate())
        : "—";

      const cantItems = p.items?.length || 0;

      div.innerHTML = `
        <div>
          <span class="codigo">#${p.codigo}</span>
          <span class="info"> · ${fecha} · ${cantItems} item(s)</span>
        </div>
        <div style="display:flex; align-items:center; gap:0.8rem;">
          <span class="total">$${(p.total || 0).toLocaleString("es-AR")}</span>
          <button class="btn-abandonar" data-id="${p.id}" title="Marcar como abandonado">✕</button>
        </div>
      `;

      div.addEventListener("click", (e) => {
        if (e.target.classList.contains("btn-abandonar")) return;
        inputCodigo.value = p.codigo;
        buscarPorCodigo();
      });

      div.querySelector(".btn-abandonar").addEventListener("click", (e) => {
        e.stopPropagation();
        marcarAbandonado(p.id, p.codigo);
      });

      contenedor.appendChild(div);
    });

  } catch (error) {
    console.error(error);
    contenedor.innerHTML = `<p class="texto-vacio">Error al cargar pedidos.</p>`;
  }
}

/* ===== FORMATEAR FECHA ===== */
function formatearFecha(date) {
  const ahora = new Date();
  const diffMs = ahora - date;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "recién";
  if (diffMin < 60) return `hace ${diffMin} min`;

  const diffHoras = Math.floor(diffMin / 60);
  if (diffHoras < 24) return `hace ${diffHoras}h`;

  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias === 1) return "ayer";
  if (diffDias < 7) return `hace ${diffDias} días`;

  return date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

/* ===== MARCAR COMO ABANDONADO ===== */
async function marcarAbandonado(id, codigo) {
  if (!confirm(`¿Marcar el pedido #${codigo} como abandonado?`)) return;

  try {
    await updateDoc(doc(db, "pedidos", id), {
      estado: "abandonado"
    });
    mostrarToast(`Pedido #${codigo} marcado como abandonado`);
    cargarPendientes();
  } catch (error) {
    console.error(error);
    mostrarToast("Error al marcar como abandonado");
  }
}

/* ===== MÉTODO DE PAGO ===== */
document.querySelectorAll('input[name="metodoPago"]').forEach(radio => {
  radio.addEventListener("change", (e) => {
    metodoPago = e.target.value;
    actualizarBotonConfirmar();
  });
});

function actualizarBotonConfirmar() {
  const btn = document.getElementById("btnConfirmarVenta");
  const tieneItems = itemsVenta.length > 0;
  const radioSeleccionado = document.querySelector('input[name="metodoPago"]:checked');
  const tieneMetodo = !!radioSeleccionado;
  btn.disabled = !(tieneItems && tieneMetodo);
}

/* ===== INICIALIZAR ===== */
cargarPendientes();