/* ===== IMPORTS ===== */
import { auth, db } from "../../shared/firebase-config.js";
import {
  collection, getDocs, query, where, updateDoc, doc
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

/* ===== INICIALIZAR ===== */
cargarPendientes();