/* ===== IMPORTS ===== */
import { auth, db } from "../../shared/firebase-config.js";
import {
  collection, getDocs, orderBy, query, doc, updateDoc,
  runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { protegerPagina, configurarLogout, configurarMenuHamburguesa } from "./auth-guard.js";
import { esc } from "../../shared/utils.js";

/* ===== ESTADO ===== */
let ventasTodas = [];
let rangoActual = "todo";
let ventaParaAnular = null;
let devolucionesPorItem = [];

/* ===== PROTECCIÓN ===== */
protegerPagina(async () => {
  await cargarVentas();
});
configurarLogout();
configurarMenuHamburguesa(); 

/* ===== FILTRO ===== */
document.getElementById("filtroRango").addEventListener("change", (e) => {
  rangoActual = e.target.value;
  aplicarFiltroYRender();
});

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

/* ===== CARGAR VENTAS ===== */
async function cargarVentas() {
  const tbody = document.getElementById("tablaHistorial");

  try {
    const q = query(collection(db, "ventas"), orderBy("fecha", "desc"));
    const snapshot = await getDocs(q);

    ventasTodas = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    if (ventasTodas.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding:2rem; color:#7a6a5f;">
            No hay ventas registradas todavía.
          </td>
        </tr>
      `;
      return;
    }

    aplicarFiltroYRender();

  } catch (error) {
    console.error(error);
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:2rem; color:#c0392b;">
          Error al cargar ventas.
        </td>
      </tr>
    `;
  }
}

/* ===== APLICAR FILTRO ===== */
function aplicarFiltroYRender() {
  const ahora = new Date();
  let desde = null;

  if (rangoActual === "hoy") {
    desde = new Date();
    desde.setHours(0, 0, 0, 0);
  } else if (rangoActual === "7dias") {
    desde = new Date();
    desde.setDate(desde.getDate() - 7);
  } else if (rangoActual === "mes") {
    desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  }

  const filtradas = desde
    ? ventasTodas.filter(v => v.fecha?.toDate && v.fecha.toDate() >= desde)
    : ventasTodas;

  renderTabla(filtradas);
  renderTotales(filtradas);
}

/* ===== RENDER TABLA ===== */
function renderTabla(ventas) {
  const tbody = document.getElementById("tablaHistorial");

  if (ventas.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:2rem; color:#7a6a5f;">
          No hay ventas en este rango.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = "";

  ventas.forEach(v => {
    const tr = document.createElement("tr");
    if (v.anulada) tr.classList.add("fila-anulada");

    const fecha = v.fecha?.toDate
      ? v.fecha.toDate().toLocaleString("es-AR", {
          day: "2-digit", month: "2-digit", year: "2-digit",
          hour: "2-digit", minute: "2-digit"
        })
      : "—";

    const resumen = (v.items || [])
      .map(item => `${item.cantidad}x ${item.nombre}`)
      .join(", ");

    const estadoBadge = v.anulada
      ? `<span class="badge anulada">Anulada</span>`
      : `<span class="badge activo">OK</span>`;

    tr.innerHTML = `
      <td>${fecha}</td>
      <td>${esc(v.cliente) || "—"}</td>
      <td>${esc(resumen) || "—"}</td>
      <td style="text-transform:capitalize;">${esc(v.metodoPago) || "—"}</td>
      <td>$${(v.total || 0).toLocaleString("es-AR")}</td>
      <td>${estadoBadge}</td>
    `;

    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => abrirDetalle(v));

    tbody.appendChild(tr);
  });
}

/* ===== RENDER TOTALES ===== */
function renderTotales(ventas) {
  const contenedor = document.getElementById("totales");

  const validas = ventas.filter(v => !v.anulada);
  const total = validas.reduce((sum, v) => sum + (v.total || 0), 0);
  const cantidad = validas.length;
  const promedio = cantidad > 0 ? Math.round(total / cantidad) : 0;

  contenedor.innerHTML = `
    <div class="resumen-item">
      <span class="valor">$${total.toLocaleString("es-AR")}</span>
      <span class="etiqueta">Total vendido</span>
    </div>
    <div class="resumen-item">
      <span class="valor">${cantidad}</span>
      <span class="etiqueta">Venta${cantidad === 1 ? "" : "s"}</span>
    </div>
    <div class="resumen-item">
      <span class="valor">$${promedio.toLocaleString("es-AR")}</span>
      <span class="etiqueta">Promedio</span>
    </div>
  `;
}

/* ===== MODAL DETALLE ===== */
const detalleOverlay = document.getElementById("detalleOverlay");
const detalleModal = document.getElementById("detalleModal");
const detalleContenido = document.getElementById("detalleContenido");
const btnCerrarDetalle = document.getElementById("btnCerrarDetalle");

btnCerrarDetalle.addEventListener("click", cerrarDetalle);
detalleOverlay.addEventListener("click", cerrarDetalle);

function abrirDetalle(v) {
  const fecha = v.fecha?.toDate
    ? v.fecha.toDate().toLocaleString("es-AR")
    : "—";

  const itemsHtml = (v.items || []).map(item => `
    <div class="detalle-item">
      <span>${item.cantidad}x ${esc(item.nombre)}</span>
      <span>$${(item.precioCongelado * item.cantidad).toLocaleString("es-AR")}</span>
    </div>
  `).join("");

  detalleContenido.innerHTML = `
    <div class="detalle-seccion">
      <h3>Información</h3>
      <div class="detalle-item"><span>Fecha</span><span>${fecha}</span></div>
      <div class="detalle-item"><span>Cliente</span><span>${esc(v.cliente) || "—"}</span></div>
      <div class="detalle-item"><span>Método de pago</span><span style="text-transform:capitalize;">${esc(v.metodoPago) || "—"}</span></div>
      <div class="detalle-item"><span>Registrado por</span><span>${esc(v.registradoPor) || "—"}</span></div>
      ${v.anulada ? `<div class="detalle-item"><span>Estado</span><span style="color:#c0392b;font-weight:600;">ANULADA</span></div>` : ""}
    </div>
    <div class="detalle-seccion">
      <h3>Items</h3>
      ${itemsHtml}
      <div class="detalle-total">
        <span>Total:</span>
        <span>$${(v.total || 0).toLocaleString("es-AR")}</span>
      </div>
    </div>
  `;

  btnAnularVenta.style.display = "none";

  if (v.anulada) {
    ventaParaAnular = null;
  } else {
    btnAnularVenta.style.display = "inline-block";
    ventaParaAnular = v;
  }

  detalleOverlay.classList.add("active");
  detalleModal.classList.add("active");
}

function cerrarDetalle() {
  detalleOverlay.classList.remove("active");
  detalleModal.classList.remove("active");
  ventaParaAnular = null;
}

/* ===== ANULAR VENTA ===== */
const btnAnularVenta = document.getElementById("btnAnularVenta");
const anularOverlay = document.getElementById("anularOverlay");
const anularModal = document.getElementById("anularModal");
const anularItems = document.getElementById("anularItems");
const btnCancelarAnular = document.getElementById("btnCancelarAnular");
const btnConfirmarAnular = document.getElementById("btnConfirmarAnular");

btnAnularVenta.addEventListener("click", abrirAnular);
btnCancelarAnular.addEventListener("click", cerrarAnular);
anularOverlay.addEventListener("click", cerrarAnular);

function abrirAnular() {
  if (!ventaParaAnular) return;
  if (ventaParaAnular.anulada) {
    mostrarToast("Esta venta ya está anulada.");
    return;
  }

  devolucionesPorItem = (ventaParaAnular.items || []).map(item => ({
    productoId: item.productoId,
    nombre: item.nombre,
    cantidad: item.cantidad,
    devuelta: item.cantidad
  }));

  renderAnularItems();

  anularOverlay.classList.add("active");
  anularModal.classList.add("active");
}

function cerrarAnular() {
  anularOverlay.classList.remove("active");
  anularModal.classList.remove("active");
  ventaParaAnular = null;
  devolucionesPorItem = [];
}

function renderAnularItems() {
  anularItems.innerHTML = "";

  devolucionesPorItem.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "anular-item";

    div.innerHTML = `
      <div class="info">
        <h4>${esc(item.nombre)}</h4>
        <div class="detalle">Comprado: ${item.cantidad} · Vuelven: ${item.devuelta}</div>
      </div>
      <div class="contador">
        <button class="btn-menos" data-index="${index}" ${item.devuelta === 0 ? "disabled" : ""}>−</button>
        <span>${item.devuelta}</span>
        <button class="btn-mas" data-index="${index}" ${item.devuelta === item.cantidad ? "disabled" : ""}>+</button>
      </div>
    `;

    anularItems.appendChild(div);
  });

  anularItems.querySelectorAll(".btn-menos").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.index);
      if (devolucionesPorItem[i].devuelta > 0) {
        devolucionesPorItem[i].devuelta -= 1;
        renderAnularItems();
      }
    });
  });

  anularItems.querySelectorAll(".btn-mas").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.index);
      if (devolucionesPorItem[i].devuelta < devolucionesPorItem[i].cantidad) {
        devolucionesPorItem[i].devuelta += 1;
        renderAnularItems();
      }
    });
  });
}

/* ===== CONFIRMAR ANULACIÓN ===== */
btnConfirmarAnular.addEventListener("click", async () => {
  if (!ventaParaAnular) return;

  btnConfirmarAnular.disabled = true;
  btnConfirmarAnular.textContent = "Anulando...";

  try {
    const ventaRef = doc(db, "ventas", ventaParaAnular.id);

    const itemsConDevolucion = devolucionesPorItem.filter(i => i.devuelta > 0);
    const productosRefs = itemsConDevolucion.map(i =>
      doc(db, "productos", i.productoId)
    );

    let productosNoDevueltos = 0;

    await runTransaction(db, async (tx) => {
      // ===== FASE 1: LECTURAS =====

      // NUEVO (Fix 2): Leer la venta primero para evitar doble anulación
      const ventaSnap = await tx.get(ventaRef);
      if (!ventaSnap.exists()) {
        throw new Error("La venta ya no existe.");
      }
      if (ventaSnap.data().anulada) {
        throw new Error("Esta venta ya fue anulada por otra terminal.");
      }

      const productosData = [];
      for (let i = 0; i < productosRefs.length; i++) {
        const prodSnap = await tx.get(productosRefs[i]);
        if (prodSnap.exists()) {
          productosData.push({
            ref: productosRefs[i],
            stockActual: prodSnap.data().stock ?? 0
          });
        } else {
          productosData.push({ ref: productosRefs[i], stockActual: null });
        }
      }

      // ===== FASE 2: ESCRITURAS =====

      for (let i = 0; i < productosData.length; i++) {
        if (productosData[i].stockActual !== null) {
          tx.update(productosData[i].ref, {
            stock: productosData[i].stockActual + itemsConDevolucion[i].devuelta,
            fechaActualizacion: serverTimestamp()
          });
        } else {
          productosNoDevueltos++;
        }
      }

      tx.update(ventaRef, {
        anulada: true,
        fechaAnulacion: serverTimestamp(),
        anuladaPor: auth.currentUser?.email || "desconocido",
        items: (ventaParaAnular.items || []).map(item => {
          const dev = devolucionesPorItem.find(d => d.productoId === item.productoId);
          return {
            ...item,
            cantidadDevuelta: dev ? dev.devuelta : 0
          };
        })
      });
    });

    if (productosNoDevueltos > 0) {
      mostrarToast(`Venta anulada. ${productosNoDevueltos} producto(s) no existe(n), no se les devolvió stock.`);
    } else {
      mostrarToast("Venta anulada correctamente");
    }
    cerrarAnular();
    cerrarDetalle();
    await cargarVentas();

  } catch (error) {
    console.error(error);
    mostrarToast(error.message || "Error al anular la venta");
  } finally {
    btnConfirmarAnular.disabled = false;
    btnConfirmarAnular.textContent = "Anular venta";
  }
});