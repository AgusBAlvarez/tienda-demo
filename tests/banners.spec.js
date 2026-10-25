import { test, expect } from '@playwright/test';
import { loginRapido, asegurarUsuarioAdmin } from './helpers.js';

const FS = 'http://127.0.0.1:8080/v1/projects/tienda-demo-5c115/databases/(default)/documents';
const ADMIN = 'http://127.0.0.1:5500/tienda-demo/public/admin';
const CLIENTE = 'http://127.0.0.1:5500/tienda-demo/public/catalogo/index.html';
const OWNER = { Authorization: 'Bearer owner' };

test.describe('🎨 Banners', () => {
  test.beforeAll(async ({ request }) => {
    await asegurarUsuarioAdmin(request);
  });

  test.beforeEach(async ({ request }) => {
    // Limpiar banners
    const res = await request.get(`${FS}/banners`, { headers: OWNER });
    if (res.ok()) {
      const body = await res.json();
      for (const doc of body.documents || []) {
        await request.delete(`${FS}/banners/${doc.name.split('/').pop()}`, { headers: OWNER });
      }
    }
  });

  test('admin puede crear un banner con imagen', async ({ page, request }) => {
    await request.post(`${FS}/banners`, {
      headers: OWNER,
      data: {
        fields: {
          titulo: { stringValue: 'Oferta Test' },
          categoria: { stringValue: '' },
          fotoUrl: { stringValue: 'https://example.com/banner.jpg' },
          fecha: { timestampValue: new Date().toISOString() },
        },
      },
    });

    await loginRapido(page);
    await page.goto(`${ADMIN}/pages/banners.html`);

    await expect(page.locator('#tablaBanners')).toContainText('Oferta Test', { timeout: 10000 });
    await expect(page.locator('#tablaBanners img')).toHaveAttribute('src', 'https://example.com/banner.jpg');
  });

  test('admin puede borrar un banner', async ({ page, request }) => {
    await request.post(`${FS}/banners`, {
      headers: OWNER,
      data: {
        fields: {
          titulo: { stringValue: 'Banner a Borrar' },
          categoria: { stringValue: '' },
          fotoUrl: { stringValue: 'https://example.com/banner.jpg' },
          fecha: { timestampValue: new Date().toISOString() },
        },
      },
    });

    await loginRapido(page);
    await page.goto(`${ADMIN}/pages/banners.html`);

    page.once('dialog', (d) => d.accept());

    await page.locator('#tablaBanners tr', { hasText: 'Banner a Borrar' })
      .locator('.btn-eliminar')
      .click();

    await expect(page.locator('#tablaBanners')).not.toContainText('Banner a Borrar', { timeout: 10000 });
  });

  test('el catálogo muestra el banner en el carrusel', async ({ page, request }) => {
    await request.post(`${FS}/productos`, {
      headers: OWNER,
      data: {
        fields: {
          nombre: { stringValue: 'Prod Banner' },
          precio: { integerValue: '500' },
          stock: { integerValue: '5' },
          stockMinimo: { integerValue: '1' },
          estado: { stringValue: 'activo' },
          categoria: { stringValue: 'Otros' },
          fotoUrl: { stringValue: 'https://example.com/x.jpg' },
        },
      },
    });

    await request.post(`${FS}/banners`, {
      headers: OWNER,
      data: {
        fields: {
          titulo: { stringValue: 'Banner Visible' },
          categoria: { stringValue: '' },
          fotoUrl: { stringValue: 'https://example.com/banner.jpg' },
          fecha: { timestampValue: new Date().toISOString() },
        },
      },
    });

    await page.goto(CLIENTE);

    await expect(page.locator('#carruselBanners img')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#carruselBanners img')).toHaveAttribute('src', 'https://example.com/banner.jpg');
  });

  test('click en banner con categoría filtra productos', async ({ page, request }) => {
    await request.post(`${FS}/productos`, {
      headers: OWNER,
      data: {
        fields: {
          nombre: { stringValue: 'Prod Electrónica' },
          precio: { integerValue: '500' },
          stock: { integerValue: '5' },
          stockMinimo: { integerValue: '1' },
          estado: { stringValue: 'activo' },
          categoria: { stringValue: 'Electrónica' },
          fotoUrl: { stringValue: 'https://example.com/x.jpg' },
        },
      },
    });

    await request.post(`${FS}/productos`, {
      headers: OWNER,
      data: {
        fields: {
          nombre: { stringValue: 'Prod Otros' },
          precio: { integerValue: '300' },
          stock: { integerValue: '5' },
          stockMinimo: { integerValue: '1' },
          estado: { stringValue: 'activo' },
          categoria: { stringValue: 'Otros' },
          fotoUrl: { stringValue: 'https://example.com/x.jpg' },
        },
      },
    });

    await request.post(`${FS}/banners`, {
      headers: OWNER,
      data: {
        fields: {
          titulo: { stringValue: 'Banner Electrónica' },
          categoria: { stringValue: 'Electrónica' },
          fotoUrl: { stringValue: 'https://example.com/banner.jpg' },
          fecha: { timestampValue: new Date().toISOString() },
        },
      },
    });

    await page.goto(CLIENTE);
    await expect(page.locator('#carruselBanners img')).toBeVisible({ timeout: 10000 });

    await page.locator('#carruselBanners img').click();

    await expect(page.locator('#productos')).toContainText('Prod Electrónica', { timeout: 5000 });
    await expect(page.locator('#productos')).not.toContainText('Prod Otros');
  });
});