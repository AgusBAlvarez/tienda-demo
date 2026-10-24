import { test, expect } from '@playwright/test';

const FS = 'http://127.0.0.1:8080/v1/projects/tienda-demo-5c115/databases/(default)/documents';
const CLIENTE = 'http://127.0.0.1:5500/elbaul/public/catalogo/index.html';

test.describe('🛒 Tienda cliente', () => {
  test.beforeEach(async ({ request }) => {
    // Limpiar productos y pedidos
    const prodRes = await request.get(`${FS}/productos`);
    if (prodRes.ok()) {
      const body = await prodRes.json();
      for (const doc of body.documents || []) {
        await request.delete(`${FS}/productos/${doc.name.split('/').pop()}`);
      }
    }

    const pedRes = await request.get(`${FS}/pedidos`);
    if (pedRes.ok()) {
      const body = await pedRes.json();
      for (const doc of body.documents || []) {
        await request.delete(`${FS}/pedidos/${doc.name.split('/').pop()}`);
      }
    }

    // Sembrar producto
    await request.post(`${FS}/productos`, {
      data: {
        fields: {
          nombre: { stringValue: 'Producto Cliente' },
          precio: { integerValue: '500' },
          stock: { integerValue: '5' },
          stockMinimo: { integerValue: '1' },
          estado: { stringValue: 'activo' },
          categoria: { stringValue: 'Otros' },
          fotoUrl: { stringValue: 'https://example.com/x.jpg' },
          descripcion: { stringValue: 'Producto de prueba' },
        },
      },
    });
  });

  test('flujo completo: agregar, finalizar, generar código', async ({ page }) => {
    await page.goto(CLIENTE);
    await expect(page.locator('.producto').first()).toBeVisible({ timeout: 10000 });

    await page.locator('.producto').first().click();
    await page.click('#btnAgregarModal');
    await page.click('#btnVerCarrito');

    await expect(page.locator('#modalCarrito')).toHaveClass(/active/, { timeout: 5000 });
    await expect(page.locator('#carritoTotal')).toContainText('$500');

    await page.click('#btnFinalizar');

    // Verificar código generado (dentro del carrito, vista finalizada)
    await expect(page.locator('#codigoPedido')).toContainText('#', { timeout: 10000 });
    await expect(page.locator('#vistaFinalizado')).toBeVisible();
  });

  test('carrito persiste al recargar', async ({ page }) => {
    await page.goto(CLIENTE);
    await expect(page.locator('.producto').first()).toBeVisible({ timeout: 10000 });

    await page.locator('.producto').first().click();
    await page.click('#btnAgregarModal');
    await page.click('#btnSeguirComprando');

    await expect(page.locator('#btnCarrito')).toContainText('1');

    await page.reload();
    await expect(page.locator('.producto').first()).toBeVisible({ timeout: 10000 });

    await expect(page.locator('#btnCarrito')).toContainText('1');

    await page.click('#btnCarrito');
    await expect(page.locator('#modalCarrito')).toHaveClass(/active/);
    await expect(page.locator('.carrito-item')).toContainText('Producto Cliente');
  });

  test('no permite agregar más que el stock disponible', async ({ page }) => {
    await page.goto(CLIENTE);
    await expect(page.locator('.producto').first()).toBeVisible({ timeout: 10000 });

    await page.locator('.producto').first().click();

    // Intentar agregar 10. El loop se corta cuando el + se deshabilita.
    for (let i = 0; i < 10; i++) {
      const isDisabled = await page.locator('#cantMas').isDisabled();
      if (isDisabled) break;
      await page.click('#cantMas');
    }

    // La cantidad no debe pasar de 5
    const cantidad = await page.locator('#cantValor').textContent();
    expect(Number(cantidad)).toBe(5);

    // Verificar que el + está deshabilitado y el label dice el stock
    await expect(page.locator('#cantMas')).toBeDisabled();
    await expect(page.locator('#modalStock')).toContainText('Hay 5 productos disponibles');
  });

  test('el pedido se guarda en Firestore sin datos de cliente', async ({ page, request }) => {
    await page.goto(CLIENTE);
    await expect(page.locator('.producto').first()).toBeVisible({ timeout: 10000 });

    await page.locator('.producto').first().click();
    await page.click('#btnAgregarModal');
    await page.click('#btnVerCarrito');
    await page.click('#btnFinalizar');

    await expect(page.locator('#vistaFinalizado')).toBeVisible({ timeout: 10000 });

    // Verificar en Firestore
    const res = await request.get(`${FS}/pedidos`);
    const body = await res.json();
    expect(body.documents.length).toBeGreaterThan(0);

    const pedido = body.documents[0];
    expect(pedido.fields.codigo.stringValue).toBeTruthy();
    expect(pedido.fields.estado.stringValue).toBe('pendiente');
    expect(pedido.fields.total.integerValue).toBe('500');
  });
});