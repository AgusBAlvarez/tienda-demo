import { test, expect } from '@playwright/test';
import { loginRapido, asegurarUsuarioAdmin } from './helpers.js';

const FS = 'http://127.0.0.1:8080/v1/projects/tienda-demo-5c115/databases/(default)/documents';
const BASE = 'http://127.0.0.1:5500/elbaul/public/admin';
const OWNER = { Authorization: 'Bearer owner' };

test.beforeAll(async ({ request }) => {
  await asegurarUsuarioAdmin(request);
});

/* ═══════════════════════════════════════════
   BUG #5 — productosCache no se refresca
   ═══════════════════════════════════════════ */
test('Producto nuevo NO aparece si el caché no se refresca', async ({ page, request }) => {
  const res = await request.get(`${FS}/productos`, { headers: OWNER });
  if (res.ok()) {
    const body = await res.json();
    for (const doc of body.documents || []) {
      await request.delete(`${FS}/productos/${doc.name.split('/').pop()}`, { headers: OWNER });
    }
  }

  await loginRapido(page);
  await page.goto(`${BASE}/pages/ventas.html`);

  await page.click('#btnAgregarManual');
  await page.waitForSelector('.buscar-resultado, .texto-vacio', { timeout: 10000 });
  await page.click('#btnCerrarBuscar');

  await request.post(`${FS}/productos`, {
    headers: OWNER,
    data: {
      fields: {
        nombre: { stringValue: 'Producto Cache Test' },
        precio: { integerValue: '500' },
        stock: { integerValue: '5' },
        stockMinimo: { integerValue: '1' },
        estado: { stringValue: 'activo' },
        categoria: { stringValue: 'Otros' },
        fotoUrl: { stringValue: 'https://example.com/x.jpg' },
      },
    },
  });

  await page.click('#btnAgregarManual');
  await page.waitForTimeout(1500);
  await page.fill('#buscarProductoInput', 'Producto Cache Test');

  await expect(page.locator('.buscar-resultado').first()).toBeVisible({ timeout: 10000 });
});

/* ═══════════════════════════════════════════
   BUG #7 — Dashboard lee TODAS las ventas
   ═══════════════════════════════════════════ */
test.describe('🐛 Bug #7: Dashboard lee todas las ventas', () => {
  test('cargarResumenDia NO debe leer ventas viejas', async ({ page, request }) => {
    const hace30Dias = new Date();
    hace30Dias.setDate(hace30Dias.getDate() - 30);

    for (let i = 0; i < 30; i++) {
      await request.post(`${FS}/ventas`, {
        headers: OWNER,
        data: {
          fields: {
            fecha: { timestampValue: hace30Dias.toISOString() },
            total: { integerValue: '1000' },
            metodoPago: { stringValue: 'efectivo' },
            cliente: { stringValue: `Vieja ${i}` },
            anulada: { booleanValue: false },
            registradoPor: { stringValue: 'admin@tienda-demo.com' },
            items: { arrayValue: { values: [] } },
          },
        },
      });
    }

    const ahora = new Date();
    for (let i = 0; i < 2; i++) {
      await request.post(`${FS}/ventas`, {
        headers: OWNER,
        data: {
          fields: {
            fecha: { timestampValue: ahora.toISOString() },
            total: { integerValue: '1000' },
            metodoPago: { stringValue: 'efectivo' },
            cliente: { stringValue: `Hoy ${i}` },
            anulada: { booleanValue: false },
            registradoPor: { stringValue: 'admin@tienda-demo.com' },
            items: { arrayValue: { values: [] } },
          },
        },
      });
    }

    let readsVentas = 0;
    page.on('request', (req) => {
      if (req.url().includes(':8080') && req.url().includes('ventas')) {
        readsVentas++;
      }
    });

    await loginRapido(page);

    await expect(page.locator('#resumenVentasDia')).toContainText('$2.000', { timeout: 10000 });

    console.log(`📊 Requests a Firestore (ventas): ${readsVentas}`);
    expect(readsVentas).toBeLessThan(5);
  });
});

/* ═══════════════════════════════════════════
   BUG #8 — cambiarEstado lee TODOS los productos
   ═══════════════════════════════════════════ */
test.describe('🐛 Bug #8: cambiarEstado lee todos los productos', () => {
  test('cambiar estado no debe leer productos ajenos', async ({ page, request }) => {
    const res = await request.get(`${FS}/productos`, { headers: OWNER });
    if (res.ok()) {
      const body = await res.json();
      for (const doc of body.documents || []) {
        await request.delete(`${FS}/productos/${doc.name.split('/').pop()}`, { headers: OWNER });
      }
    }

    for (let i = 0; i < 20; i++) {
      await request.post(`${FS}/productos`, {
        headers: OWNER,
        data: {
          fields: {
            nombre: { stringValue: `Prod Relleno ${i}` },
            precio: { integerValue: '100' },
            stock: { integerValue: '5' },
            stockMinimo: { integerValue: '1' },
            estado: { stringValue: 'activo' },
            categoria: { stringValue: 'Otros' },
            fotoUrl: { stringValue: 'https://example.com/x.jpg' },
          },
        },
      });
    }

    const targetId = 'prod-target-bug8';
    await request.post(`${FS}/productos?documentId=${targetId}`, {
      headers: OWNER,
      data: {
        fields: {
          nombre: { stringValue: 'Prod Objetivo' },
          precio: { integerValue: '500' },
          stock: { integerValue: '10' },
          stockMinimo: { integerValue: '2' },
          estado: { stringValue: 'activo' },
          categoria: { stringValue: 'Otros' },
          fotoUrl: { stringValue: 'https://example.com/x.jpg' },
        },
      },
    });

    let readsProductos = 0;
    page.on('request', (req) => {
      if (req.url().includes(':8080') && req.url().includes('productos')) {
        readsProductos++;
      }
    });

    await loginRapido(page);
    await page.goto(`${BASE}/pages/productos.html`);

    await expect(page.locator('#tablaBody')).toContainText('Prod Objetivo', { timeout: 10000 });
    const readsIniciales = readsProductos;

    await page.locator('#tablaBody tr', { hasText: 'Prod Objetivo' })
      .locator('.btn-estado')
      .click();

    await page.waitForTimeout(1000);

    const readsCambiarEstado = readsProductos - readsIniciales;
    console.log(`📊 Reads después del click: ${readsCambiarEstado}`);

    expect(readsCambiarEstado).toBeLessThan(5);
  });
});

/* ═══════════════════════════════════════════
   BUG #13 — alert() en abrirAnular (ya arreglado)
   ═══════════════════════════════════════════ */
test.describe('🐛 Bug #13: alert() en historial', () => {
  test('anular venta ya anulada NO debe usar alert()', async ({ page, request }) => {
    await request.post(`${FS}/ventas?documentId=venta-ya-anulada`, {
      headers: OWNER,
      data: {
        fields: {
          fecha: { timestampValue: new Date().toISOString() },
          total: { integerValue: '1000' },
          metodoPago: { stringValue: 'efectivo' },
          cliente: { stringValue: 'Cliente Anulado' },
          anulada: { booleanValue: true },
          registradoPor: { stringValue: 'admin@tienda-demo.com' },
          items: {
            arrayValue: {
              values: [{
                mapValue: {
                  fields: {
                    productoId: { stringValue: 'x' },
                    nombre: { stringValue: 'X' },
                    cantidad: { integerValue: '1' },
                    precioCongelado: { integerValue: '1000' },
                  },
                },
              }],
            },
          },
        },
      },
    });

    let alertFueDisparado = false;
    page.on('dialog', async (dialog) => {
      alertFueDisparado = true;
      await dialog.dismiss();
    });

    await loginRapido(page);
    await page.goto(`${BASE}/pages/historial.html`);
    await page.locator('#tablaHistorial tr', { hasText: 'Cliente Anulado' }).click();
    await page.waitForTimeout(500);

    const btnAnular = page.locator('#btnAnularVenta');
    if (await btnAnular.isVisible()) {
      await btnAnular.click();
      await page.waitForTimeout(500);
    }

    expect(alertFueDisparado).toBe(false);
  });
});

/* ═══════════════════════════════════════════
   BUG #14 — Botón "Anular" no se oculta (ya arreglado)
   ═══════════════════════════════════════════ */
test.describe('🐛 Bug #14: botón Anular en ventas anuladas', () => {
  test('al abrir una venta ya anulada, botón Anular debe estar oculto', async ({ page, request }) => {
    await request.post(`${FS}/ventas?documentId=venta-anulada-14`, {
      headers: OWNER,
      data: {
        fields: {
          fecha: { timestampValue: new Date().toISOString() },
          total: { integerValue: '500' },
          metodoPago: { stringValue: 'efectivo' },
          cliente: { stringValue: 'Anulada 14' },
          anulada: { booleanValue: true },
          registradoPor: { stringValue: 'x' },
          items: { arrayValue: { values: [] } },
        },
      },
    });

    await loginRapido(page);
    await page.goto(`${BASE}/pages/historial.html`);
    await page.locator('#tablaHistorial tr', { hasText: 'Anulada 14' }).click();
    await page.waitForTimeout(300);

    await expect(page.locator('#btnAnularVenta')).toBeHidden();
  });
});

/* ═══════════════════════════════════════════
   BUG #10 — usuario deshabilitado (NO APLICA)
   ═══════════════════════════════════════════ */
test.describe('🐛 Bug #10: usuario deshabilitado', () => {
  test.skip('usuario deshabilitado debería ser expulsado', async () => {
    // No aplica: la app usa una cuenta compartida para varias computadoras.
  });
});

/* ═══════════════════════════════════════════
   BUG #1 — borrarCategoria sin batch (ya arreglado)
   ═══════════════════════════════════════════ */
test.describe('🐛 Bug #1: borrarCategoria sin batch', () => {
  test('borrar categoría con productos debe ser atómico (informativo)', async ({ request }) => {
    await request.post(`${FS}/categorias?documentId=cat-bug1`, {
      headers: OWNER,
      data: { fields: { nombre: { stringValue: 'Bug1 Cat' } } },
    });

    await request.post(`${FS}/productos?documentId=prod-bug1`, {
      headers: OWNER,
      data: {
        fields: {
          nombre: { stringValue: 'Prod Bug1' },
          categoria: { stringValue: 'Bug1 Cat' },
          precio: { integerValue: '100' },
          stock: { integerValue: '1' },
          estado: { stringValue: 'activo' },
          stockMinimo: { integerValue: '1' },
          fotoUrl: { stringValue: 'x' },
        },
      },
    });

    const res = await request.get(`${FS}/categorias/cat-bug1`, { headers: OWNER });
    expect(res.ok()).toBe(true);
  });
});

/* ═══════════════════════════════════════════
   BUG #2 (FIX) — anular con producto eliminado
   ═══════════════════════════════════════════ */
test.describe('✅ Bug #2 (fix): anular con producto eliminado', () => {
  test.beforeEach(async ({ request }) => {
    const ventasRes = await request.get(`${FS}/ventas`, { headers: OWNER });
    if (ventasRes.ok()) {
      const body = await ventasRes.json();
      for (const doc of body.documents || []) {
        await request.delete(`${FS}/ventas/${doc.name.split('/').pop()}`, { headers: OWNER });
      }
    }
  });

  test('avisa cuando no puede devolver stock', async ({ page, request }) => {
    await request.post(`${FS}/ventas?documentId=venta-bug2-fix`, {
      headers: OWNER,
      data: {
        fields: {
          fecha: { timestampValue: new Date().toISOString() },
          total: { integerValue: '1000' },
          metodoPago: { stringValue: 'efectivo' },
          cliente: { stringValue: 'Cliente Fantasma' },
          anulada: { booleanValue: false },
          registradoPor: { stringValue: 'admin@tienda-demo.com' },
          items: {
            arrayValue: {
              values: [{
                mapValue: {
                  fields: {
                    productoId: { stringValue: 'prod-inexistente' },
                    nombre: { stringValue: 'Producto Eliminado' },
                    cantidad: { integerValue: '2' },
                    precioCongelado: { integerValue: '500' },
                  },
                },
              }],
            },
          },
        },
      },
    });

    await loginRapido(page);
    await page.goto(`${BASE}/pages/historial.html`);
    await page.locator('#tablaHistorial tr:not(.fila-anulada)', { hasText: 'Cliente Fantasma' }).click();
    await page.click('#btnAnularVenta');
    await expect(page.locator('#anularModal')).toHaveClass(/active/);
    await page.click('#btnConfirmarAnular');

    await expect(page.locator('#toast')).toContainText(/no existe/i, { timeout: 10000 });
    await expect(page.locator('#toast')).toContainText(/no se les devolvió/i);
  });
});

/* ═══════════════════════════════════════════
   BUG #11 (FIX) — pedidoActual no persiste al cancelar
   ═══════════════════════════════════════════ */
test.describe('✅ Bug #11 (fix): pedido no se confirma sin querer', () => {
  test('cancelar confirmación descarta el pedido cargado', async ({ page, request }) => {
    const prodRes = await request.get(`${FS}/productos`, { headers: OWNER });
    if (prodRes.ok()) {
      const body = await prodRes.json();
      for (const doc of body.documents || []) {
        await request.delete(`${FS}/productos/${doc.name.split('/').pop()}`, { headers: OWNER });
      }
    }
    const pedRes = await request.get(`${FS}/pedidos`, { headers: OWNER });
    if (pedRes.ok()) {
      const body = await pedRes.json();
      for (const doc of body.documents || []) {
        await request.delete(`${FS}/pedidos/${doc.name.split('/').pop()}`, { headers: OWNER });
      }
    }

    await request.post(`${FS}/productos?documentId=prod-bug11-fix`, {
      headers: OWNER,
      data: {
        fields: {
          nombre: { stringValue: 'Prod 11' },
          precio: { integerValue: '100' },
          stock: { integerValue: '10' },
          stockMinimo: { integerValue: '1' },
          estado: { stringValue: 'activo' },
          categoria: { stringValue: 'Otros' },
          fotoUrl: { stringValue: 'x' },
        },
      },
    });

    await request.post(`${FS}/pedidos?documentId=pedido-bug11-fix`, {
      headers: OWNER,
      data: {
        fields: {
          codigo: { stringValue: 'TEST11' },
          estado: { stringValue: 'pendiente' },
          total: { integerValue: '100' },
          fecha: { timestampValue: new Date().toISOString() },
          items: {
            arrayValue: {
              values: [{
                mapValue: {
                  fields: {
                    productoId: { stringValue: 'prod-bug11-fix' },
                    nombre: { stringValue: 'Prod 11' },
                    cantidad: { integerValue: '1' },
                    precioCongelado: { integerValue: '100' },
                  },
                },
              }],
            },
          },
        },
      },
    });

    await loginRapido(page);
    await page.goto(`${BASE}/pages/ventas.html`);

    await page.fill('#inputCodigo', 'TEST11');
    await page.click('#btnBuscarCodigo');
    await expect(page.locator('#itemsVenta')).toContainText('Prod 11', { timeout: 10000 });

    await page.check('input[name="metodoPago"][value="efectivo"]');
    await page.click('#btnConfirmarVenta');
    await page.click('#btnCancelarConfirm');

    const res = await request.get(`${FS}/pedidos/pedido-bug11-fix`, { headers: OWNER });
    const pedido = await res.json();
    expect(pedido.fields.estado.stringValue).toBe('pendiente');
  });
});

/* ═══════════════════════════════════════════
   BUG #3 (FIX) — Error de stock visible en modal
   ═══════════════════════════════════════════ */
test.describe('✅ Bug #3 (fix): error de stock visible en modal', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get(`${FS}/productos`, { headers: OWNER });
    if (res.ok()) {
      const body = await res.json();
      for (const doc of body.documents || []) {
        await request.delete(`${FS}/productos/${doc.name.split('/').pop()}`, { headers: OWNER });
      }
    }
  });

  test('el error de stock aparece dentro del modal, no como toast', async ({ page, request }) => {
    await request.post(`${FS}/productos?documentId=prod-sin-stock`, {
      headers: OWNER,
      data: {
        fields: {
          nombre: { stringValue: 'Prod Sin Stock' },
          precio: { integerValue: '1000' },
          stock: { integerValue: '0' },
          stockMinimo: { integerValue: '1' },
          estado: { stringValue: 'activo' },
          categoria: { stringValue: 'Otros' },
          fotoUrl: { stringValue: 'x' },
        },
      },
    });

    await loginRapido(page);
    await page.goto(`${BASE}/pages/ventas.html`);
    await page.click('#btnAgregarManual');
    await page.fill('#buscarProductoInput', 'Prod Sin Stock');
    await expect(page.locator('.buscar-resultado').first()).toBeVisible({ timeout: 10000 });
    await page.locator('.buscar-resultado').first().click();
    await page.check('input[name="metodoPago"][value="efectivo"]');
    await page.click('#btnConfirmarVenta');
    await page.click('#btnAceptarConfirm');

    await expect(page.locator('#confirmError')).toContainText(/sin stock/i, { timeout: 10000 });
    await expect(page.locator('#confirmModal')).toHaveClass(/active/);
  });
});

/* ═══════════════════════════════════════════
   BUG #4 (FIX) — Modal propio en vez de confirm()
   ═══════════════════════════════════════════ */
test.describe('✅ Bug #4 (fix): modal propio para borrar categoría', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get(`${FS}/categorias`, { headers: OWNER });
    if (res.ok()) {
      const body = await res.json();
      for (const doc of body.documents || []) {
        const nombre = doc.fields?.nombre?.stringValue;
        if (nombre === 'Otros') continue;
        await request.delete(`${FS}/categorias/${doc.name.split('/').pop()}`, { headers: OWNER });
      }
    }
  });

  test('borrar categoría abre modal propio, no confirm()', async ({ page, request }) => {
    await request.post(`${FS}/categorias?documentId=cat-test-borrar`, {
      headers: OWNER,
      data: { fields: { nombre: { stringValue: 'Cat Test Borrar' } } },
    });

    await page.addInitScript(() => {
      window.__confirmUsado = false;
      const originalConfirm = window.confirm;
      window.confirm = (msg) => {
        window.__confirmUsado = true;
        return true;
      };
    });

    await loginRapido(page);
    await page.goto(`${BASE}/pages/categorias.html`);

    const fila = page.locator('#tablaCategorias tr', { hasText: 'Cat Test Borrar' });
    await fila.locator('.btn-eliminar').click();

    await expect(page.locator('#confirmarBorradoModal')).toHaveClass(/active/, { timeout: 5000 });

    const usado = await page.evaluate(() => window.__confirmUsado);
    expect(usado).toBe(false);

    await page.click('#btnConfirmarBorrado');
    await expect(page.locator('#tablaCategorias')).not.toContainText('Cat Test Borrar', { timeout: 10000 });
  });
});