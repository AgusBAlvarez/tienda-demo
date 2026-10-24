/* ===== IMPORTS ===== */
import { db } from "../../shared/firebase-config.js";
import {
  collection, getDocs, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { protegerPagina, configurarLogout } from "./auth-guard.js";
import { esc } from "../../shared/utils.js";

/* ===== PROTECCIÓN ===== */
protegerPagina(async () => {
  await cargarStockBajo();
  await cargarUltimasVentas();
  await cargarPedidosPendientes();
  await cargarResumenDia();
});
configurarLogout();

/* ===== CARGAR STOCK BAJO ===== */
async function cargarStockBajo() {
  const contenedor = document.getElementById("listaStockBajo");

  try {
    const snapshot = await getDocs(collection(db, "productos"));

    const productos = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => {
        if (p.estado !== "activo") return false;
        const stock = p.stock ?? 0;
        const minimo = p.stockMinimo ?? 0;
        return stock <= minimo;
      })
      .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));

    if (productos.length === 0) {
      contenedor.innerHTML = `<p class="texto-vacio">Todo en orden. No hay productos con stock bajo.</p>`;
      return;
    }

    contenedor.innerHTML = "";

    productos.forEach(p => {
      const div = document.createElement("div");
      div.className = "stock-bajo-item";

      div.innerHTML = `
        <div>
          <div class="nombre">${esc(p.nombre)}</div>
          <div class="categoria">${esc(p.categoria) || "Sin categoría"}</div>
        </div>
        <div class="stock">
          ${p.stock} unidad${p.stock === 1 ? "" : "es"}
        </div>
      `;

      contenedor.appendChild(div);
    });

  } catch (error) {
    console.error(error);
    contenedor.innerHTML = `<p class="texto-vacio">Error al cargar stock bajo.</p>`;
  }
}

/* ===== CARGAR ÚLTIMAS VENTAS ===== */
async function cargarUltimasVentas() {
  const contenedor = document.getElementById("listaUltimasVentas");

  try {
    const q = query(
      collection(db, "ventas"),
      orderBy("fecha", "desc"),
      limit(5)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      contenedor.innerHTML = `<p class="texto-vacio">No hay ventas registradas todavía.</p>`;
      return;
    }

    contenedor.innerHTML = "";

    snapshot.forEach(docSnap => {
      const v = docSnap.data();
      const div = document.createElement("div");
      div.className = "ultima-venta";

      const fecha = v.fecha?.toDate
        ? formatearFecha(v.fecha.toDate())
        : "—";

      const resumen = (v.items || [])
        .map(item => `${item.cantidad}x ${item.nombre}`)
        .join(", ");

      div.innerHTML = `
        <div class="info">
          <span class="fecha">${fecha}</span>
          <span class="detalle">${esc(resumen) || "Sin items"}</span>
          ${v.cliente ? `<span class="fecha" style="color:#C3977E;">Cliente: ${esc(v.cliente)}</span>` : ""}
        </div>
        <div>
          <div class="total">$${(v.total || 0).toLocaleString("es-AR")}</div>
          <div class="metodo">${esc(v.metodoPago) || "—"}</div>
        </div>
      `;

      contenedor.appendChild(div);
    });

  } catch (error) {
    console.error(error);
    contenedor.innerHTML = `<p class="texto-vacio">Error al cargar últimas ventas.</p>`;
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

/* ===== CARGAR PEDIDOS PENDIENTES ===== */
async function cargarPedidosPendientes() {
  const contenedor = document.getElementById("listaPedidosPendientes");

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

    const pedidos = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const fa = a.fecha?.toMillis?.() || 0;
        const fb = b.fecha?.toMillis?.() || 0;
        return fb - fa;
      })
      .slice(0, 5);

    contenedor.innerHTML = "";

    pedidos.forEach(p => {
      const div = document.createElement("div");
      div.className = "pedido-pendiente-dash";

      const fecha = p.fecha?.toDate ? formatearFecha(p.fecha.toDate()) : "—";
      const cantItems = p.items?.length || 0;

      div.innerHTML = `
        <div>
          <span class="codigo">#${esc(p.codigo)}</span>
          <span class="info"> · ${fecha} · ${cantItems} item(s)</span>
        </div>
        <span class="total">$${(p.total || 0).toLocaleString("es-AR")}</span>
      `;

      contenedor.appendChild(div);
    });

    if (snapshot.size > 5) {
      const extra = document.createElement("p");
      extra.className = "texto-vacio";
      extra.style.marginTop = "0.5rem";
      extra.textContent = `y ${snapshot.size - 5} más...`;
      contenedor.appendChild(extra);
    }

  } catch (error) {
    console.error(error);
    contenedor.innerHTML = `<p class="texto-vacio">Error al cargar pedidos pendientes.</p>`;
  }
}

/* ===== CARGAR RESUMEN DEL DÍA ===== */
async function cargarResumenDia() {
  const contenedor = document.getElementById("resumenVentasDia");

  try {
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, "ventas"),
      where("fecha", ">=", inicioDia),
      orderBy("fecha", "desc")
    );
    const snapshot = await getDocs(q);

    const ventasHoy = snapshot.docs
      .map(d => d.data())
      .filter(v => !v.anulada);

    const total = ventasHoy.reduce((sum, v) => sum + (v.total || 0), 0);
    const cantidad = ventasHoy.length;
    const promedio = cantidad > 0 ? Math.round(total / cantidad) : 0;

    contenedor.innerHTML = `
      <div class="resumen-dia">
        <div class="resumen-item">
          <span class="valor">$${total.toLocaleString("es-AR")}</span>
          <span class="etiqueta">Total vendido hoy</span>
        </div>
        <div class="resumen-item">
          <span class="valor">${cantidad}</span>
          <span class="etiqueta">Venta${cantidad === 1 ? "" : "s"} hoy</span>
        </div>
        <div class="resumen-item">
          <span class="valor">$${promedio.toLocaleString("es-AR")}</span>
          <span class="etiqueta">Promedio por venta</span>
        </div>
      </div>
    `;

  } catch (error) {
    console.error(error);
    contenedor.innerHTML = `<p class="texto-vacio">Error al cargar resumen del día.</p>`;
  }
}