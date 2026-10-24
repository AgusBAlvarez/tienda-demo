import { test, expect } from '@playwright/test';
import { loginRapido } from './helpers.js';

const FS = 'http://127.0.0.1:8080/v1/projects/tienda-demo-5c115/databases/(default)/documents';

/* ═══════════════════════════════════════════
   SECCIÓN 1: AUTENTICACIÓN
   ═══════════════════════════════════════════ */
test.describe('🔐 Sección 1: Autenticación', () => {
  test('Debe loguearse correctamente en el admin', async ({ page }) => {
    await loginRapido(page);
    await expect(page.locator('h1')).toContainText('Dashboard');
    await expect(page.locator('#userEmail')).toHaveText('admin@tienda-demo.com');
  });

  test('Credenciales inválidas muestran error', async ({ page }) => {
    await page.goto('http://127.0.0.1:5500/elbaul/public/admin/index.html');
    await page.fill('#email', 'noexiste@tienda-demo.com');
    await page.fill('#password', 'mal');
    await page.click('.btn-login');
    await expect(page.locator('#errorMsg')).toContainText(/incorrectos/i, { timeout: 10000 });
  });
});

/* ═══════════════════════════════════════════
   SECCIÓN 2: CATEGORÍAS
   ═══════════════════════════════════════════ */
test.describe('📂 Sección 2: Categorías', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get(`${FS}/categorias`);
    if (!res.ok()) return;
    const body = await res.json();
    for (const doc of body.documents || []) {
      const nombre = doc.fields?.nombre?.stringValue;
      if (nombre === 'Otros' || nombre === 'Electrónica') continue;
      const id = doc.name.split('/').pop();
      await request.delete(`${FS}/categorias/${id}`);
    }
  });

  test('Debe crear, editar y borrar una categoría', async ({ page }) => {
    await loginRapido(page);
    await page.goto('http://127.0.0.1:5500/elbaul/public/admin/pages/categorias.html');

    const nombre = `Cat Test ${Date.now()}`;

    await page.click('.header-con-accion .btn-primary');
    await expect(page.locator('#panelCategoria')).toHaveClass(/active/);
    await page.fill('#nombreCategoria', nombre);
    await page.click('#btnGuardar');
    await expect(page.locator('#tablaCategorias')).toContainText(nombre, { timeout: 10000 });

    const fila = page.locator('#tablaCategorias tr', { hasText: nombre });
    await fila.locator('.btn-editar').click();
    await page.fill('#nombreCategoria', `${nombre} editada`);
    await page.click('#btnGuardar');
    await expect(page.locator('#tablaCategorias')).toContainText(`${nombre} editada`, { timeout: 10000 });

    // Borrar con modal propio (ya no usa confirm nativo)
    await page.locator('#tablaCategorias tr', { hasText: `${nombre} editada` })
      .locator('.btn-eliminar')
      .click();
    await page.click('#btnConfirmarBorrado');  // ← nuevo
    await expect(page.locator('#tablaCategorias')).not.toContainText(`${nombre} editada`, { timeout: 10000 });
  });

  test('No permite categorías duplicadas', async ({ page }) => {
    await loginRapido(page);
    await page.goto('http://127.0.0.1:5500/elbaul/public/admin/pages/categorias.html');

    await page.click('.header-con-accion .btn-primary');
    await page.fill('#nombreCategoria', 'Otros');
    await page.click('#btnGuardar');

    await expect(page.locator('#formError')).toContainText(/ya existe/i, { timeout: 10000 });
  });

  test('La categoría "Otros" no se puede editar ni borrar', async ({ page }) => {
    await loginRapido(page);
    await page.goto('http://127.0.0.1:5500/elbaul/public/admin/pages/categorias.html');

    const filaOtros = page.locator('#tablaCategorias tr', { hasText: 'Otros' });
    await expect(filaOtros).toBeVisible({ timeout: 10000 });
    await expect(filaOtros.locator('.btn-editar')).toHaveCount(0);
    await expect(filaOtros.locator('.btn-eliminar')).toHaveCount(0);
  });
});

/* ═══════════════════════════════════════════
   SECCIÓN 3: PRODUCTOS
   ═══════════════════════════════════════════ */
test.describe('📦 Sección 3: Productos', () => {
  test('Debe cargar un producto nuevo', async ({ page }) => {
    await loginRapido(page);
    await page.goto('http://127.0.0.1:5500/elbaul/public/admin/pages/productos.html');

    await page.click('.header-con-accion .btn-primary');
    await expect(page.locator('#panelProducto')).toHaveClass(/active/);
    await page.selectOption('#categoria', 'Otros', { timeout: 10000 });

    await page.fill('#nombre', 'Producto de Prueba Playwright');
    await page.fill('#precio', '1500');
    await page.fill('#stock', '10');
    await page.click('#btnGuardar');

    await expect(page.locator('#tablaBody')).toContainText('Producto de Prueba Playwright', { timeout: 10000 });
  });

  test('Validación: campos obligatorios', async ({ page }) => {
    await loginRapido(page);
    await page.goto('http://127.0.0.1:5500/elbaul/public/admin/pages/productos.html');

    await page.click('.header-con-accion .btn-primary');
    await page.click('#btnGuardar');
    await expect(page.locator('#panelProducto')).toHaveClass(/active/);
  });
});

/* ═══════════════════════════════════════════
   SECCIÓN 4: REGISTRAR VENTA
   ═══════════════════════════════════════════ */
test.describe('💰 Sección 4: Registrar Venta', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get(`${FS}/productos`);
    if (res.ok()) {
      const body = await res.json();
      for (const doc of body.documents || []) {
        const id = doc.name.split('/').pop();
        await request.delete(`${FS}/productos/${id}`);
      }
    }

    await request.post(`${FS}/productos`, {
      data: {
        fields: {
          nombre: { stringValue: 'Producto de Prueba Playwright' },
          precio: { integerValue: '1500' },
          stock: { integerValue: '10' },
          stockMinimo: { integerValue: '2' },
          estado: { stringValue: 'activo' },
          categoria: { stringValue: 'Otros' },
          fotoUrl: { stringValue: 'https://example.com/x.jpg' },
          descripcion: { stringValue: '' },
        },
      },
    });
  });

  test('Debe registrar una venta y descontar stock', async ({ page }) => {
    await loginRapido(page);
    await page.goto('http://127.0.0.1:5500/elbaul/public/admin/pages/ventas.html');

    await page.click('#btnAgregarManual');
    await page.fill('#buscarProductoInput', 'Producto de Prueba Playwright');
    await expect(page.locator('.buscar-resultado').first()).toBeVisible({ timeout: 10000 });
    await page.locator('.buscar-resultado').first().click();

    await page.check('input[name="metodoPago"][value="efectivo"]');
    await page.fill('#inputCliente', 'Cliente Test');
    await expect(page.locator('#totalVenta')).toHaveText('$1.500');

    await page.click('#btnConfirmarVenta');
    await expect(page.locator('#confirmModal')).toHaveClass(/active/);
    await page.click('#btnAceptarConfirm');

    await expect(page.locator('#toast')).toContainText('Venta registrada correctamente', { timeout: 10000 });
  });

  test('Bloquea venta sin método de pago', async ({ page }) => {
    await loginRapido(page);
    await page.goto('http://127.0.0.1:5500/elbaul/public/admin/pages/ventas.html');

    await page.click('#btnAgregarManual');
    await page.fill('#buscarProductoInput', 'Producto de Prueba Playwright');
    await expect(page.locator('.buscar-resultado').first()).toBeVisible({ timeout: 10000 });
    await page.locator('.buscar-resultado').first().click();

    await expect(page.locator('#btnConfirmarVenta')).toBeDisabled();
    await page.check('input[name="metodoPago"][value="debito"]');
    await expect(page.locator('#btnConfirmarVenta')).toBeEnabled();
  });
});

/* ═══════════════════════════════════════════
   SECCIÓN 5: HISTORIAL
   ═══════════════════════════════════════════ */
test.describe('🧾 Sección 5: Historial', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get(`${FS}/ventas`);
    if (res.ok()) {
      const body = await res.json();
      for (const doc of body.documents || []) {
        const id = doc.name.split('/').pop();
        await request.delete(`${FS}/ventas/${id}`);
      }
    }

    await request.post(`${FS}/ventas`, {
      data: {
        fields: {
          fecha: { timestampValue: new Date().toISOString() },
          total: { integerValue: '1500' },
          metodoPago: { stringValue: 'efectivo' },
          cliente: { stringValue: 'Cliente Historial' },
          registradoPor: { stringValue: 'admin@tienda-demo.com' },
          anulada: { booleanValue: false },
          items: {
            arrayValue: {
              values: [{
                mapValue: {
                  fields: {
                    productoId: { stringValue: 'prod-x' },
                    nombre: { stringValue: 'Prod X' },
                    cantidad: { integerValue: '1' },
                    precioCongelado: { integerValue: '1500' },
                  },
                },
              }],
            },
          },
        },
      },
    });
  });

  test('Muestra la venta y abre el detalle', async ({ page }) => {
    await loginRapido(page);
    await page.goto('http://127.0.0.1:5500/elbaul/public/admin/pages/historial.html');

    await expect(page.locator('#tablaHistorial')).toContainText('Cliente Historial', { timeout: 10000 });

    await page.locator('#tablaHistorial tr', { hasText: 'Cliente Historial' }).click();
    await expect(page.locator('#detalleModal')).toHaveClass(/active/);
    await expect(page.locator('#detalleContenido')).toContainText('Prod X');
    await expect(page.locator('#detalleContenido')).toContainText('1.500');
  });

  test('Filtro "Hoy" no rompe con ventas sin fecha', async ({ page }) => {
    await loginRapido(page);
    await page.goto('http://127.0.0.1:5500/elbaul/public/admin/pages/historial.html');

    await page.selectOption('#filtroRango', 'hoy');
    await expect(page.locator('#totales')).toBeVisible();
  });
});

/* ═══════════════════════════════════════════
   SECCIÓN 6: ANULAR VENTA
   ═══════════════════════════════════════════ */
test.describe('🚫 Sección 6: Anular Venta', () => {
  const PROD_ID = 'prod-anular-test';
  const VENTA_ID = 'venta-anular-test';

  test.beforeEach(async ({ request }) => {
    // Limpiar
    const ventasRes = await request.get(`${FS}/ventas`);
    if (ventasRes.ok()) {
      const body = await ventasRes.json();
      for (const doc of body.documents || []) {
        await request.delete(`${FS}/ventas/${doc.name.split('/').pop()}`);
      }
    }
    await request.delete(`${FS}/productos/${PROD_ID}`);

    // Sembrar producto con stock bajo (para verificar devolución)
    await request.post(
      `${FS}/productos?documentId=${PROD_ID}`,
      {
        data: {
          fields: {
            nombre: { stringValue: 'Prod Anular' },
            precio: { integerValue: '1000' },
            stock: { integerValue: '2' },
            stockMinimo: { integerValue: '1' },
            estado: { stringValue: 'activo' },
            categoria: { stringValue: 'Otros' },
            fotoUrl: { stringValue: 'https://example.com/x.jpg' },
            descripcion: { stringValue: '' },
          },
        },
      }
    );

    // Sembrar venta con ID fijo
    await request.post(
      `${FS}/ventas?documentId=${VENTA_ID}`,
      {
        data: {
          fields: {
            fecha: { timestampValue: new Date().toISOString() },
            total: { integerValue: '2000' },
            metodoPago: { stringValue: 'efectivo' },
            cliente: { stringValue: 'Cliente Anular' },
            registradoPor: { stringValue: 'admin@tienda-demo.com' },
            anulada: { booleanValue: false },
            items: {
              arrayValue: {
                values: [{
                  mapValue: {
                    fields: {
                      productoId: { stringValue: PROD_ID },
                      nombre: { stringValue: 'Prod Anular' },
                      cantidad: { integerValue: '2' },
                      precioCongelado: { integerValue: '1000' },
                    },
                  },
                }],
              },
            },
          },
        },
      }
    );
  });

  test('Anular venta devuelve stock y marca como anulada', async ({ page, request }) => {
    await loginRapido(page);
    await page.goto('http://127.0.0.1:5500/elbaul/public/admin/pages/historial.html');

    // Abrir detalle de la venta
    await expect(page.locator('#tablaHistorial')).toContainText('Cliente Anular', { timeout: 10000 });
    await page.locator('#tablaHistorial tr', { hasText: 'Cliente Anular' }).click();
    await expect(page.locator('#detalleModal')).toHaveClass(/active/);

    // Abrir modal de anulación
    await page.click('#btnAnularVenta');
    await expect(page.locator('#anularModal')).toHaveClass(/active/);  // ← esperar al modal, no al toast

    // Confirmar (por defecto devuelve todas las unidades)
    await page.click('#btnConfirmarAnular');

    // AHORA sí, esperar el toast de confirmación
    await expect(page.locator('#toast')).toContainText('Venta anulada correctamente', { timeout: 10000 });

    // Verificar en la tabla que la fila ahora dice "Anulada"
    await expect(
      page.locator('#tablaHistorial tr', { hasText: 'Cliente Anular' })
    ).toContainText('Anulada', { timeout: 10000 });

    // Verificar stock devuelto en Firestore (2 + 2 = 4)
    const prodRes = await request.get(`${FS}/productos/${PROD_ID}`);
    const prod = await prodRes.json();
    expect(prod.fields.stock.integerValue).toBe('4');

    // Verificar que la venta quedó marcada
    const ventaRes = await request.get(`${FS}/ventas/${VENTA_ID}`);
    const venta = await ventaRes.json();
    expect(venta.fields.anulada.booleanValue).toBe(true);
  });
});

/* ═══════════════════════════════════════════
   SECCIÓN 7: DASHBOARD - STOCK BAJO
   ═══════════════════════════════════════════ */
test.describe('⚠️ Sección 7: Dashboard - Stock Bajo', () => {
  test.beforeEach(async ({ request }) => {
    // Limpiar productos
    const res = await request.get(`${FS}/productos`);
    if (res.ok()) {
      const body = await res.json();
      for (const doc of body.documents || []) {
        await request.delete(`${FS}/productos/${doc.name.split('/').pop()}`);
      }
    }

    // Producto CON stock bajo (2 <= 3) → debe aparecer
    await request.post(`${FS}/productos`, {
      data: {
        fields: {
          nombre: { stringValue: 'Prod Stock Bajo' },
          precio: { integerValue: '500' },
          stock: { integerValue: '2' },
          stockMinimo: { integerValue: '3' },
          estado: { stringValue: 'activo' },
          categoria: { stringValue: 'Otros' },
          fotoUrl: { stringValue: 'https://example.com/x.jpg' },
          descripcion: { stringValue: '' },
        },
      },
    });

    // Producto SIN stock bajo (50 > 3) → NO debe aparecer
    await request.post(`${FS}/productos`, {
      data: {
        fields: {
          nombre: { stringValue: 'Prod Stock OK' },
          precio: { integerValue: '500' },
          stock: { integerValue: '50' },
          stockMinimo: { integerValue: '3' },
          estado: { stringValue: 'activo' },
          categoria: { stringValue: 'Otros' },
          fotoUrl: { stringValue: 'https://example.com/x.jpg' },
          descripcion: { stringValue: '' },
        },
      },
    });
  });

  test('Muestra solo productos con stock bajo', async ({ page }) => {
    await loginRapido(page);
    // loginRapido ya te deja en dashboard.html, no hace falta goto

    const contenedor = page.locator('#listaStockBajo');
    await expect(contenedor).toContainText('Prod Stock Bajo', { timeout: 10000 });
    await expect(contenedor).not.toContainText('Prod Stock OK');
  });
});

/* ═══════════════════════════════════════════
   SECCIÓN 8: BUGS CONOCIDOS (test que demuestran el bug)
   ═══════════════════════════════════════════ */
test.describe('🐛 Sección 8: Regresiones', () => {
  test('Producto nuevo aparece en búsqueda de venta sin recargar', async ({ page, request }) => {
    // Limpiar productos
    const res = await request.get(`${FS}/productos`);
    if (res.ok()) {
      const body = await res.json();
      for (const doc of body.documents || []) {
        await request.delete(`${FS}/productos/${doc.name.split('/').pop()}`);
      }
    }

    await loginRapido(page);

    // 1. Ir a ventas.html (esto carga productosCache = [])
    await page.goto('http://127.0.0.1:5500/elbaul/public/admin/pages/ventas.html');

    // 2. Abrir el modal de búsqueda → cachea [] (vacío)
    await page.click('#btnAgregarManual');
    await page.fill('#buscarProductoInput', 'Nada');
    await page.click('#btnCerrarBuscar');

    // 3. Sembrar un producto DESPUÉS de que se cacheó
    await request.post(`${FS}/productos`, {
      data: {
        fields: {
          nombre: { stringValue: 'Producto Nuevo' },
          precio: { integerValue: '500' },
          stock: { integerValue: '5' },
          stockMinimo: { integerValue: '1' },
          estado: { stringValue: 'activo' },
          categoria: { stringValue: 'Otros' },
          fotoUrl: { stringValue: 'https://example.com/x.jpg' },
          descripcion: { stringValue: '' },
        },
      },
    });

    // 4. Abrir el modal de nuevo → buscar "Producto Nuevo"
    await page.click('#btnAgregarManual');
    await page.fill('#buscarProductoInput', 'Producto Nuevo');
      
    // 🐛 ESTE EXPECT FALLA POR EL BUG: el caché no se refrescó
    await expect(page.locator('.buscar-resultado').first()).toBeVisible({ timeout: 5000 });
  });
});