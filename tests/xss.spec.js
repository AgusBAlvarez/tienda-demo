import { test, expect } from '@playwright/test';
import { loginRapido } from './helpers.js';

const FS = 'http://127.0.0.1:8080/v1/projects/tienda-demo-5c115/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };
const PAYLOAD = '<img src=x onerror="window.__xss=1">';

test.describe('🛡️ Seguridad: XSS', () => {
    test('Ventas no ejecuta scripts maliciosos', async ({ page, request }) => {
    // Limpiar productos previos
    const prodRes = await request.get(`${FS}/productos`, { headers: OWNER });
    if (prodRes.ok()) {
      const body = await prodRes.json();
      for (const doc of body.documents || []) {
        await request.delete(`${FS}/productos/${doc.name.split('/').pop()}`, { headers: OWNER });
      }
    }

    // Crear producto con ID único (evita 409 Conflict)
    const prodId = `prod-xss-${Date.now()}`;
    const res = await request.post(`${FS}/productos?documentId=${prodId}`, {
      headers: OWNER,
      data: {
        fields: {
          nombre: { stringValue: 'Producto XSS' },
          precio: { integerValue: '100' },
          stock: { integerValue: '10' },
          stockMinimo: { integerValue: '1' },
          estado: { stringValue: 'activo' },
          categoria: { stringValue: 'Otros' },
          fotoUrl: { stringValue: 'x' },
        },
      },
    });
    expect(res.ok()).toBeTruthy();

    await loginRapido(page);
    await page.goto('http://127.0.0.1:5500/tienda-demo/public/admin/pages/ventas.html');

    // Abrir el modal de búsqueda
    await page.click('#btnAgregarManual');
    await page.waitForTimeout(1500);   // dar tiempo al getDocs

    // Verificar que el payload NO esté en el HTML del modal
    const htmlResultados = await page.locator('#buscarResultados').innerHTML();
    expect(htmlResultados).not.toContain('onerror');

    // Escribir en el buscador y verificar que aparece el producto
    await page.fill('#buscarProductoInput', 'Producto XSS');
    await expect(page.locator('.buscar-resultado').first()).toBeVisible({ timeout: 10000 });

    // Verificar que NO se ejecutó XSS
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('Dashboard no ejecuta scripts maliciosos', async ({ page, request }) => {
    // Sembrar un pedido con payload en el nombre
    await request.post(`${FS}/pedidos?documentId=XSSDASH`, {
      data: {
        fields: {
          codigo: { stringValue: 'XSSDASH' },
          estado: { stringValue: 'pendiente' },
          total: { integerValue: '100' },
          fecha: { timestampValue: new Date().toISOString() },
          items: {
            arrayValue: {
              values: [{
                mapValue: {
                  fields: {
                    productoId: { stringValue: 'prod-xss' },
                    nombre: { stringValue: PAYLOAD },
                    cantidad: { integerValue: '1' },
                    precioCongelado: { integerValue: '100' }
                  }
                }
              }]
            }
          }
        }
      }
    });

    await loginRapido(page);
    await page.goto('http://127.0.0.1:5500/tienda-demo/public/admin/pages/dashboard.html');

    // Esperar a que el dashboard cargue los pedidos
    await page.waitForSelector('#listaPedidosPendientes .pedido-pendiente-dash', { timeout: 10000 });

    // Verificar que no se ejecutó el XSS
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();

    // Verificar que el payload aparece como texto (gracias al esc())
    const html = await page.locator('#listaPedidosPendientes').innerHTML();
    expect(html).not.toContain('<img src=x');
  });

  test('Historial no ejecuta scripts maliciosos', async ({ page, request }) => {
    // Limpiar ventas previas para que no haya conflictos
    const ventasRes = await request.get(`${FS}/ventas`, { headers: OWNER });
    if (ventasRes.ok()) {
      const body = await ventasRes.json();
      for (const doc of body.documents || []) {
        await request.delete(`${FS}/ventas/${doc.name.split('/').pop()}`, { headers: OWNER });
      }
    }

    // Crear venta con ID único (timestamp) para evitar 409 Conflict
    const ventaId = `XSSHIST-${Date.now()}`;
    const res = await request.post(`${FS}/ventas?documentId=${ventaId}`, {
      headers: OWNER,
      data: {
        fields: {
          fecha: { timestampValue: new Date().toISOString() },
          total: { integerValue: '100' },
          metodoPago: { stringValue: 'efectivo' },
          cliente: { stringValue: PAYLOAD },
          registradoPor: { stringValue: 'test' },
          anulada: { booleanValue: false },
          items: {
            arrayValue: {
              values: [{
                mapValue: {
                  fields: {
                    productoId: { stringValue: 'prod-xss' },
                    nombre: { stringValue: PAYLOAD },
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
    expect(res.ok()).toBeTruthy();

    await loginRapido(page);
    await page.goto('http://127.0.0.1:5500/tienda-demo/public/admin/pages/historial.html');

    // Esperar a que la tabla tenga al menos una fila con datos
    await page.waitForSelector('#tablaHistorial tr', { timeout: 10000 });
    await page.waitForTimeout(1000);

    await page.locator('#tablaHistorial tr').first().click();
    await page.waitForSelector('#detalleModal.active', { timeout: 10000 });

    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });
});